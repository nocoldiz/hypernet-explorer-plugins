/*:
 * @target MZ
 * @plugindesc Procedural road generation system: linear, cross, T-intersections, and corners
 * @author Omni-Lex
 *
 * @help
 * Procedural Map Road Generator
 * ==============================
 * Handles all road-related terrain generation including:
 * - Road detection and biome classification
 * - Linear road generation (horizontal, vertical)
 * - Intersection roads (cross, T-junctions, corners)
 * - Dashed road center line markings
 * - Road configuration parsing
 * - Water edge integration with roads
 *
 * ROAD DIRECTIONS:
 * ===============
 * LINEAR:
 *   - "horizontal"  : Horizontal road (left-right)
 *   - "vertical"    : Vertical road (up-down)
 *
 * INTERSECTIONS:
 *   - "cross"       : 4-way intersection (crossroad)
 *   - "t-up"/"t-north"     : T-junction with stem pointing north (missing south)
 *   - "t-down"/"t-south"   : T-junction with stem pointing south (missing north)
 *   - "t-left"/"t-west"    : T-junction with stem pointing west (missing east)
 *   - "t-right"/"t-east"   : T-junction with stem pointing east (missing west)
 *
 * CORNERS (L-shaped, connects two perpendicular directions):
 *   - "corner-up-right"     : Connects north and east (⌐ shape)
 *   - "corner-up-left"      : Connects north and west (┐ shape)
 *   - "corner-down-right"   : Connects south and east (┌ shape)
 *   - "corner-down-left"    : Connects south and west (┘ shape)
 *   - "corner-north-east"   : Alias for corner-up-right
 *   - "corner-north-west"   : Alias for corner-up-left
 *   - "corner-south-east"   : Alias for corner-down-right
 *   - "corner-south-west"   : Alias for corner-down-left
 *
 * Requires ProceduralMapUtils.js to be loaded first
 */

(() => {
  "use strict";

  const pluginName = "ProceduralMapRoadGenerator";

  // Set true to emit this generator's verbose per-generation diagnostics.
  const DEBUG = false;
  const dlog = (...a) => { if (DEBUG) console.log(...a); };

  // Import utilities from ProceduralMapUtils
  const Utils2 = window.ProcGenUtils;
  if (!Utils2) {
    console.error(
      "ProceduralMapRoadGenerator requires ProceduralMapUtils plugin"
    );
    return;
  }

  const {
    createSeededRandom,
    randomChoice,
    calculateIndex,
    PROC_MAP_WIDTH,
    PROC_MAP_HEIGHT,
  } = Utils2;

  // ===== ROAD DETECTION =====

  /**
   * Check if biome is a road/highway biome
   */
  function isRoadBiome(biomeName) {
    return (
      biomeName.toLowerCase().startsWith("road ") ||
      biomeName.toLowerCase() === "road" ||
      biomeName.toLowerCase() === "highway" ||
      // A bridge is a road that happens to span a river: it carries the same
      // carriageway, connects to neighbouring roads, and must never be treated
      // as plain terrain a river overlay may flood.
      biomeName.toLowerCase() === "bridge" ||
      parseRoadConfig(biomeName) !== null
    );
  }

  // ===== WORLD-MAP ROAD PASSABILITY (map 315) =====
  // Roads on the world map are baked in on upper layers over the biome tiles.
  // Some segments end up blocked (an impassable decoration drawn above the road,
  // or road-crossing tiles that are themselves flagged impassable). Force any
  // tile that holds a road tile passable so the whole network stays walkable and
  // drivable, including road-over-water bridges.
  const WORLD_MAP_ID = 315;

  // Road tile-id ranges on the OldEurope world tileset:
  //   768-783   E-sheet road surface
  //   3824-3871 A3 road autotile
  //   4208-4255 A4 road-crossing autotile
  function isWorldRoadTileId(t) {
    return (
      (t >= 768 && t <= 783) ||
      (t >= 3824 && t <= 3871) ||
      (t >= 4208 && t <= 4255)
    );
  }

  function worldTileHasRoad(x, y) {
    for (let z = 0; z < 4; z++) {
      if (isWorldRoadTileId($gameMap.tileId(x, y, z))) return true;
    }
    return false;
  }

  const _Game_Map_checkPassage = Game_Map.prototype.checkPassage;
  Game_Map.prototype.checkPassage = function (x, y, bit) {
    if (this.mapId() === WORLD_MAP_ID && worldTileHasRoad(x, y)) {
      return true;
    }
    return _Game_Map_checkPassage.call(this, x, y, bit);
  };

  // isPassable must be overridden as well, not just checkPassage.
  // MovementInteractionSystem rejects terrain tag 4 (mountain) and 7 (ice)
  // outright inside isPassable and returns before checkPassage is ever
  // consulted. Road tiles carry terrain tag 0/1, but terrainTag() reports the
  // topmost NON-ZERO tag in the column, so a road laid over a mountain still
  // reports tag 4 and the segment stays blocked. Roughly 180 world-map road
  // tiles are cut through mountains, which is exactly the case this restores.
  //
  // This plugin loads after MovementInteractionSystem, so this override is the
  // outermost one and short-circuits before that terrain-tag rejection runs.
  const _Game_Map_isPassable = Game_Map.prototype.isPassable;
  Game_Map.prototype.isPassable = function (x, y, d) {
    if (this.mapId() === WORLD_MAP_ID && worldTileHasRoad(x, y)) {
      return true;
    }
    return _Game_Map_isPassable.call(this, x, y, d);
  };

  /**
   * Check if biome is a city biome
   */
  function isCityBiome(biomeName) {
    return biomeName && biomeName.toLowerCase().includes("city");
  }

  /**
   * Check if biome is a village biome
   */
  function isVillageBiome(biomeName) {
    return biomeName && biomeName.toLowerCase().includes("village");
  }

  /**
   * Check if biome is a burg biome
   */
  function isBurgBiome(biomeName) {
    return biomeName && biomeName.toLowerCase().includes("burg");
  }

  /**
   * A road connects onward only to another road or to a settlement
   * (Village, Burg, City). Anything else is a dead end for that direction.
   */
  function isConnectableBiome(biomeName) {
    if (!biomeName) return false;
    return (
      isRoadBiome(biomeName) ||
      isCityBiome(biomeName) ||
      isVillageBiome(biomeName) ||
      isBurgBiome(biomeName)
    );
  }

  // ===== ROAD CONFIGURATION =====

  /**
   * Parse road configuration from biome name
   */
  function parseRoadConfig(biomeName) {
    const roadMatch = biomeName.match(/<Road:\s*(\d+)\s+(\w+-?\w*)>/i);
    if (roadMatch) {
      return {
        tileId: parseInt(roadMatch[1]),
        direction: roadMatch[2].toLowerCase(),
        isCross: roadMatch[2].toLowerCase() === "cross",
        isT: roadMatch[2].toLowerCase().startsWith("t-"),
      };
    }
    return null;
  }

  /**
   * Get the first single-tile variant tileId for a named feature, or null.
   */
  function getSingleFeatureTileId(allFeatures, name) {
    if (allFeatures[name] && allFeatures[name].length > 0) {
      for (const variant of allFeatures[name]) {
        if (variant.type === "single") {
          return variant.tileId;
        }
      }
    }
    return null;
  }

  /**
   * Get DashedLine tile ID from features
   * Returns the first single-tile variant of DashedLine, or null if not found
   * (Legacy single-tile accessor; prefer getDashedLineTileIds for orientation.)
   */
  function getDashedLineTileId(allFeatures) {
    return (
      getSingleFeatureTileId(allFeatures, "DashedLineHorizontal") ??
      getSingleFeatureTileId(allFeatures, "DashedLineVertical") ??
      getSingleFeatureTileId(allFeatures, "DashedLine")
    );
  }

  /**
   * Get orientation-specific dashed center-line tile IDs.
   * Horizontal roads use DashedLineHorizontal, vertical roads use DashedLineVertical.
   * Falls back to the legacy DashedLine tile when a directional variant is absent.
   * @returns {{horizontal: number|null, vertical: number|null}}
   */
  function getDashedLineTileIds(allFeatures) {
    // Every road-drawing path resolves its dash tiles through here, so this is
    // where the surface those dashes may be laid on is learned (see putDash).
    recordMarkingSurface(allFeatures);
    const legacy = getSingleFeatureTileId(allFeatures, "DashedLine");
    return {
      horizontal: getSingleFeatureTileId(allFeatures, "DashedLineHorizontal") ?? legacy,
      vertical: getSingleFeatureTileId(allFeatures, "DashedLineVertical") ?? legacy,
    };
  }

  /**
   * Get orientation-specific pedestrian-crossing ("zebra") tile grids.
   * ZebraHorizontal crosses a horizontal-running road (its stripe unit is
   * wide along X and tiles down the road's Y-thickness); ZebraVertical
   * crosses a vertical-running road (its stripe unit is tall along Y and
   * tiles across the road's X-width) - the same Horizontal/Vertical
   * convention getDashedLineTileIds uses. Returns the raw multi-tile "grid"
   * variant (see ProceduralMapUtils.parseTerrainFeatures), not a bare tile
   * id, since a crossing is stamped, not dashed one tile at a time.
   * @returns {{horizontal: object|null, vertical: object|null}}
   */
  function getZebraTileIds(allFeatures) {
    const gridVariant = (name) => {
      const list = allFeatures[name];
      if (!list) return null;
      for (const variant of list) {
        if (variant.type === "grid" && variant.grid && variant.grid.length) return variant;
      }
      return null;
    };
    return {
      horizontal: gridVariant("ZebraHorizontal"),
      vertical: gridVariant("ZebraVertical"),
    };
  }

  /**
   * Stamp a pedestrian crossing across the full width of a straight,
   * axis-aligned road: the tileset's zebra-marking grid is tiled across the
   * road's width, and its own extent (the grid's other dimension) is left as
   * the crossing's thickness along the road. Drawn on layer 1, the same
   * layer a dashed center line uses, so a crossing placed over one always
   * overrides it.
   *
   * @param {object} variant - a "grid" feature variant from getZebraTileIds.
   * @param {"horizontal"|"vertical"} orientation - "horizontal" for a road
   *   running east-west (the crossing spans its Y-thickness); "vertical" for
   *   a road running north-south (the crossing spans its X-width).
   * @param {number} roadStart - the road's start coordinate along its width
   *   axis (topY for a horizontal road, leftX for a vertical one).
   * @param {number} roadSpan - the road's width in tiles along that axis.
   * @param {number} alongPos - the fixed coordinate along the road's own
   *   direction of travel (the X column for horizontal, the Y row for
   *   vertical) where the crossing sits.
   */
  function stampZebraCrossing(mapData, variant, orientation, roadStart, roadSpan, alongPos, width, height) {
    if (!variant || !variant.grid || !variant.grid.length) return;
    const grid = variant.grid;
    const LAYER = 1;
    const stampAt = (mx, my, tileId) => {
      if (!tileId || mx < 0 || mx >= width || my < 0 || my >= height) return;
      mapData[calculateIndex(mx, my, LAYER, width, height)] = tileId;
    };
    if (orientation === "vertical") {
      const step = Math.max(1, variant.width || 1);
      for (let off = 0; off < roadSpan; off += step) {
        for (let gy = 0; gy < grid.length; gy++) {
          const row = grid[gy];
          for (let gx = 0; gx < row.length; gx++) {
            stampAt(roadStart + off + gx, alongPos + gy, row[gx]);
          }
        }
      }
    } else {
      const step = Math.max(1, variant.height || grid.length || 1);
      for (let off = 0; off < roadSpan; off += step) {
        for (let gy = 0; gy < grid.length; gy++) {
          const row = grid[gy];
          for (let gx = 0; gx < row.length; gx++) {
            stampAt(alongPos + gx, roadStart + off + gy, row[gx]);
          }
        }
      }
    }
  }

  // Dashed centre lines: one cadence for the whole world. One tile of paint
  // then one of gap, and the phase read off the ABSOLUTE coordinate, so the
  // paint on a road biome, a city avenue and a village street is the same
  // paint and the dashes still line up where two map squares meet. Every
  // generator reads the cadence from here: when the settlement generators
  // ran counts of their own, a road changed its markings the moment it
  // crossed into a town.
  const DASH_LENGTH = 1;
  const DASH_CYCLE = 2;

  /** True where a dash tile belongs, for a tile at absolute coordinate `n`. */
  function isDashStep(n) {
    return ((n % DASH_CYCLE) + DASH_CYCLE) % DASH_CYCLE < DASH_LENGTH;
  }

  // The ground a road marking is allowed to sit on. A dashed centre line is
  // paint ON a carriageway: laid anywhere else - a verge the road stopped
  // short of, a corner a later pass turned back into grass - it reads as a
  // stray line dropped at random on the map, because that is what it is.
  // Filled in from the tileset whenever the dash tiles are resolved, which
  // every road-drawing path does before it draws a single tile.
  const MARKING_SURFACE = new Set();

  const MARKING_SURFACE_FEATURES = [
    "Road", "RoadLine", "Asphalt", "Pavement",
    "Sidewalk", "SidewalkDesert", "SidewalkIce",
    "Path", "PathDesert", "PathIce",
    "DashedLine", "DashedLineHorizontal", "DashedLineVertical",
  ];

  function recordMarkingSurface(allFeatures) {
    MARKING_SURFACE.clear();
    if (!allFeatures) return;
    for (const name of MARKING_SURFACE_FEATURES) {
      for (const variant of allFeatures[name] || []) {
        if (variant.type === "single" && variant.tileId) {
          MARKING_SURFACE.add(variant.tileId);
        } else if (variant.grid) {
          for (const row of variant.grid) {
            for (const t of row) if (t) MARKING_SURFACE.add(t);
          }
        }
      }
    }
  }

  /**
   * Place a dashed center-line tile (layer 1) at a position. No-op for null
   * tileId, and no-op wherever the ground below is not a carriageway - the
   * road generators draw the road first and the paint after, so a dash that
   * lands off the tarmac is a dash the road never actually reached.
   */
  function putDash(mapData, x, y, tileId, width, height) {
    if (tileId == null) return;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    if (MARKING_SURFACE.size &&
      !MARKING_SURFACE.has(mapData[calculateIndex(x, y, 0, width, height)])) return;
    const idx = calculateIndex(x, y, 1, width, height);
    mapData[idx] = tileId;
  }

  /**
   * Place a dash along a vertical line, skipping every other row so a 1-tile gap
   * sits between dashes. Gated on the absolute Y so dashes align across segments.
   */
  function putDashV(mapData, x, y, tileId, width, height) {
    if (!isDashStep(y)) return;
    putDash(mapData, x, y, tileId, width, height);
  }

  /**
   * Place a dash along a horizontal line, skipping every other column so a 1-tile
   * gap sits between dashes. Gated on the absolute X so dashes align across segments.
   */
  function putDashH(mapData, x, y, tileId, width, height) {
    if (!isDashStep(x)) return;
    putDash(mapData, x, y, tileId, width, height);
  }

  // ===== ROAD TILE DETECTION =====

  /**
   * Check if a position is on a road tile (center 7-tile wide road)
   * Used to prevent features from being placed ON the road itself
   */
  function isPositionOnRoadTile(x, y, width, height) {
    const roadWidth = 7;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);

    const roadStartX = Math.max(0, centerX - halfRoad);
    const roadEndX = Math.min(width, roadStartX + roadWidth);
    const roadStartY = Math.max(0, centerY - halfRoad);
    const roadEndY = Math.min(height, roadStartY + roadWidth);

    // Check if position is within the road area (both horizontally and vertically)
    const onRoadX = x >= roadStartX && x < roadEndX;
    const onRoadY = y >= roadStartY && y < roadEndY;

    // Position is ON road if it's in the intersection or main road area
    return onRoadX && onRoadY;
  }

  // ===== DASHED LINE DRAWING =====

  /**
   * Draw dashed lines for dual highway roads
   * Draws center line in each of the two parallel roads
   */
  function drawDashedCenterLine(
    mapData,
    dashedLines,
    direction,
    width,
    height,
    roadWidth
  ) {
    if (!dashedLines) return;

    const separation = 3;
    const roadCenterX = Math.floor(width / 2);
    const roadCenterY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);
    const roadCenter = Math.floor(roadWidth / 2);

    if (direction === "up" || direction === "vertical") {
      // Two vertical roads with continuous vertical dashed center lines
      const leftRoadX = roadCenterX - halfRoad - roadWidth - separation + roadCenter;
      const rightRoadX = roadCenterX + halfRoad + separation + roadCenter;

      for (let y = 0; y < height; y++) {
        putDashV(mapData, leftRoadX, y, dashedLines.vertical, width, height);
        putDashV(mapData, rightRoadX, y, dashedLines.vertical, width, height);
      }
    } else {
      // Two horizontal roads with dashed horizontal center lines
      const topRoadY = roadCenterY - halfRoad - roadWidth - separation + roadCenter;
      const bottomRoadY = roadCenterY + halfRoad + separation + roadCenter;

      for (let x = 0; x < width; x++) {
        putDashH(mapData, x, topRoadY, dashedLines.horizontal, width, height);
        putDashH(mapData, x, bottomRoadY, dashedLines.horizontal, width, height);
      }
    }
  }

  /**
   * Draw dashed lines for dual highway cross roads
   * Avoids drawing in the center intersection areas
   */
  function drawDashedCrossLines(
    mapData,
    dashedLines,
    width,
    height,
    roadWidth
  ) {
    if (!dashedLines) return;

    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);
    const roadCenter = Math.floor(roadWidth / 2);

    // Horizontal roads (top and bottom)
    const topRoadY = centerY - halfRoad - roadWidth - separation;
    const bottomRoadY = centerY + halfRoad + separation;
    const topRoadCenterY = topRoadY + roadCenter;
    const bottomRoadCenterY = bottomRoadY + roadCenter;

    // Vertical roads (left and right)
    const leftRoadX = centerX - halfRoad - roadWidth - separation;
    const rightRoadX = centerX + halfRoad + separation;
    const leftRoadCenterX = leftRoadX + roadCenter;
    const rightRoadCenterX = rightRoadX + roadCenter;

    // Intersection margin
    const intersectionMargin = roadWidth / 2;

    // Top and bottom horizontal dashed lines (continuous, skip intersections)
    for (let x = 0; x < width; x++) {
      if ((x >= leftRoadX - intersectionMargin && x < leftRoadX + roadWidth + intersectionMargin) ||
          (x >= rightRoadX - intersectionMargin && x < rightRoadX + roadWidth + intersectionMargin)) {
        continue;
      }
      putDashH(mapData, x, topRoadCenterY, dashedLines.horizontal, width, height);
      putDashH(mapData, x, bottomRoadCenterY, dashedLines.horizontal, width, height);
    }

    // Left and right vertical dashed lines (skip intersections)
    for (let y = 0; y < height; y++) {
      if ((y >= topRoadY - intersectionMargin && y < topRoadY + roadWidth + intersectionMargin) ||
          (y >= bottomRoadY - intersectionMargin && y < bottomRoadY + roadWidth + intersectionMargin)) {
        continue;
      }
      putDashV(mapData, leftRoadCenterX, y, dashedLines.vertical, width, height);
      putDashV(mapData, rightRoadCenterX, y, dashedLines.vertical, width, height);
    }
  }

  /**
   * Draw dashed lines for dual highway T-shaped roads
   * Draws center lines for each road in the junction
   */
  function drawDashedTLines(
    mapData,
    dashedLines,
    direction,
    width,
    height,
    roadWidth
  ) {
    if (!dashedLines) return;

    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);
    const roadCenter = Math.floor(roadWidth / 2);

    const topRoadY = centerY - halfRoad - roadWidth - separation;
    const bottomRoadY = centerY + halfRoad + separation;
    const leftRoadX = centerX - halfRoad - roadWidth - separation;
    const rightRoadX = centerX + halfRoad + separation;

    const topRoadCenterY = topRoadY + roadCenter;
    const bottomRoadCenterY = bottomRoadY + roadCenter;
    const leftRoadCenterX = leftRoadX + roadCenter;
    const rightRoadCenterX = rightRoadX + roadCenter;

    if (direction === "t-up" || direction === "t-north") {
      // Horizontal roads (top and bottom) + vertical stems pointing UP
      const vertEndY = topRoadY;

      // Top and bottom horizontal dashed lines (skip vertical road columns)
      for (let px = 0; px < width; px++) {
        if ((px >= leftRoadX && px < leftRoadX + roadWidth) || (px >= rightRoadX && px < rightRoadX + roadWidth)) {
          continue;
        }
        putDashH(mapData, px, topRoadCenterY, dashedLines.horizontal, width, height);
        putDashH(mapData, px, bottomRoadCenterY, dashedLines.horizontal, width, height);
      }

      // Left and right vertical dashed lines (stems going up)
      for (let py = 0; py < vertEndY; py++) {
        putDashV(mapData, leftRoadCenterX, py, dashedLines.vertical, width, height);
        putDashV(mapData, rightRoadCenterX, py, dashedLines.vertical, width, height);
      }
    } else if (direction === "t-down" || direction === "t-south") {
      // Horizontal roads (top and bottom) + vertical stems pointing DOWN
      const vertStartY = bottomRoadY + roadWidth;

      // Top and bottom horizontal dashed lines (skip vertical road columns)
      for (let px = 0; px < width; px++) {
        if ((px >= leftRoadX && px < leftRoadX + roadWidth) || (px >= rightRoadX && px < rightRoadX + roadWidth)) {
          continue;
        }
        putDashH(mapData, px, topRoadCenterY, dashedLines.horizontal, width, height);
        putDashH(mapData, px, bottomRoadCenterY, dashedLines.horizontal, width, height);
      }

      // Left and right vertical dashed lines (stems going down)
      for (let py = vertStartY; py < height; py++) {
        putDashV(mapData, leftRoadCenterX, py, dashedLines.vertical, width, height);
        putDashV(mapData, rightRoadCenterX, py, dashedLines.vertical, width, height);
      }
    } else if (direction === "t-left" || direction === "t-west") {
      // Vertical roads (left and right) + horizontal stems pointing LEFT
      const horizEndX = leftRoadX;

      // Left and right vertical dashed lines (skip horizontal road rows)
      for (let py = 0; py < height; py++) {
        if ((py >= topRoadY && py < topRoadY + roadWidth) || (py >= bottomRoadY && py < bottomRoadY + roadWidth)) {
          continue;
        }
        putDashV(mapData, leftRoadCenterX, py, dashedLines.vertical, width, height);
        putDashV(mapData, rightRoadCenterX, py, dashedLines.vertical, width, height);
      }

      // Top and bottom horizontal dashed lines (stems going left)
      for (let px = 0; px < horizEndX; px++) {
        putDashH(mapData, px, topRoadCenterY, dashedLines.horizontal, width, height);
        putDashH(mapData, px, bottomRoadCenterY, dashedLines.horizontal, width, height);
      }
    } else if (direction === "t-right" || direction === "t-east") {
      // Vertical roads (left and right) + horizontal stems pointing RIGHT
      const horizStartX = rightRoadX + roadWidth;

      // Left and right vertical dashed lines (skip horizontal road rows)
      for (let py = 0; py < height; py++) {
        if ((py >= topRoadY && py < topRoadY + roadWidth) || (py >= bottomRoadY && py < bottomRoadY + roadWidth)) {
          continue;
        }
        putDashV(mapData, leftRoadCenterX, py, dashedLines.vertical, width, height);
        putDashV(mapData, rightRoadCenterX, py, dashedLines.vertical, width, height);
      }

      // Top and bottom horizontal dashed lines (stems going right)
      for (let px = horizStartX; px < width; px++) {
        putDashH(mapData, px, topRoadCenterY, dashedLines.horizontal, width, height);
        putDashH(mapData, px, bottomRoadCenterY, dashedLines.horizontal, width, height);
      }
    }
  }

  /**
   * Draw dashed lines for dual highway corner roads
   * Draws center lines for each road in the corner junction
   */
/**
   * Draw dashed lines for dual highway corner roads
   * FIX: Extends dashed lines to meet in the center of the corner turn
   */
function drawDashedCornerLines(
  mapData,
  dashedLines,
  direction,
  width,
  height,
  roadWidth
) {
  if (!dashedLines) return;

  const separation = 3;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const halfRoad = Math.floor(roadWidth / 2);
  const roadCenter = Math.floor(roadWidth / 2);

  const topRoadY = centerY - halfRoad - roadWidth - separation;
  const bottomRoadY = centerY + halfRoad + separation;
  const leftRoadX = centerX - halfRoad - roadWidth - separation;
  const rightRoadX = centerX + halfRoad + separation;

  const topRoadCenterY = topRoadY + roadCenter;
  const bottomRoadCenterY = bottomRoadY + roadCenter;
  const leftRoadCenterX = leftRoadX + roadCenter;
  const rightRoadCenterX = rightRoadX + roadCenter;

  // Normalize direction
  let normalizedDir = direction.toLowerCase();
  normalizedDir = normalizedDir.replace("north", "up").replace("south", "down");
  normalizedDir = normalizedDir.replace("east", "right").replace("west", "left");

  // Continuous, orientation-specific dash helpers
  const vDash = (x, py) => putDashV(mapData, x, py, dashedLines.vertical, width, height);
  const hDash = (px, y) => putDashH(mapData, px, y, dashedLines.horizontal, width, height);

  if (normalizedDir === "corner-up-right" || normalizedDir === "corner-right-up") {
    // OUTER LANE: Left Vert -> Bottom Horiz
    for (let py = 0; py <= bottomRoadCenterY; py++) vDash(leftRoadCenterX, py);
    for (let px = leftRoadCenterX; px < width; px++) hDash(px, bottomRoadCenterY);

    // INNER LANE: Right Vert -> Top Horiz
    for (let py = 0; py <= topRoadCenterY; py++) vDash(rightRoadCenterX, py);
    for (let px = rightRoadCenterX; px < width; px++) hDash(px, topRoadCenterY);

  } else if (normalizedDir === "corner-up-left" || normalizedDir === "corner-left-up") {
    // INNER LANE: Left Vert -> Top Horiz
    for (let py = 0; py <= topRoadCenterY; py++) vDash(leftRoadCenterX, py);
    for (let px = 0; px <= leftRoadCenterX; px++) hDash(px, topRoadCenterY);

    // OUTER LANE: Right Vert -> Bottom Horiz
    for (let py = 0; py <= bottomRoadCenterY; py++) vDash(rightRoadCenterX, py);
    for (let px = 0; px <= rightRoadCenterX; px++) hDash(px, bottomRoadCenterY);

  } else if (normalizedDir === "corner-down-right" || normalizedDir === "corner-right-down") {
    // OUTER LANE: Left Vert -> Top Horiz
    for (let py = topRoadCenterY; py < height; py++) vDash(leftRoadCenterX, py);
    for (let px = leftRoadCenterX; px < width; px++) hDash(px, topRoadCenterY);

    // INNER LANE: Right Vert -> Bottom Horiz
    for (let py = bottomRoadCenterY; py < height; py++) vDash(rightRoadCenterX, py);
    for (let px = rightRoadCenterX; px < width; px++) hDash(px, bottomRoadCenterY);

  } else if (normalizedDir === "corner-down-left" || normalizedDir === "corner-left-down") {
    // INNER LANE: Left Vert -> Bottom Horiz
    for (let py = bottomRoadCenterY; py < height; py++) vDash(leftRoadCenterX, py);
    for (let px = 0; px <= leftRoadCenterX; px++) hDash(px, bottomRoadCenterY);

    // OUTER LANE: Right Vert -> Top Horiz
    for (let py = topRoadCenterY; py < height; py++) vDash(rightRoadCenterX, py);
    for (let px = 0; px <= rightRoadCenterX; px++) hDash(px, topRoadCenterY);
  }
}

  // ===== ROAD DRAWING =====

  /**
   * Draw a rectangle for road segments
   */
  function drawRect(mapData, tileId, x, y, w, h, mapW, mapH) {
    const startX = Math.max(0, x);
    const endX = Math.min(mapW, x + w);
    const startY = Math.max(0, y);
    const endY = Math.min(mapH, y + h);

    for (let cy = startY; cy < endY; cy++) {
      for (let cx = startX; cx < endX; cx++) {
        const idx = cy * mapW + cx;
        mapData[idx] = tileId;
      }
    }
  }

  /**
   * Draw a dual highway (two roads separated by 3 tiles).
   *
   * When `connections` is provided, any facing direction that does NOT connect to
   * another road or a settlement is treated as a dead end: instead of running the
   * two roads off the map border, they loop back into each other at the center of
   * the map (a U-turn). A road with no connections at all becomes a closed loop.
   *
   * @param {{north:boolean,south:boolean,east:boolean,west:boolean}|null} connections
   */
  function drawLinearRoad(mapData, tileId, direction, width, height, dashedLines, connections = null) {
    const roadWidth = 7;
    const separation = 3;
    const roadCenterX = Math.floor(width / 2);
    const roadCenterY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);
    const roadCenter = Math.floor(roadWidth / 2);
    const dl = dashedLines || { horizontal: null, vertical: null };

    // Fill an axis-aligned rectangle of road tiles on layer 0 (clamped to map)
    const fillRect = (x0, x1, y0, y1) => {
      for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
          mapData[calculateIndex(x, y, 0, width, height)] = tileId;
        }
      }
    };

    const isVertical = direction === "up" || direction === "vertical";

    if (isVertical) {
      const leftRoadX = roadCenterX - halfRoad - roadWidth - separation;
      const rightRoadX = roadCenterX + halfRoad + separation;
      const leftCX = leftRoadX + roadCenter;
      const rightCX = rightRoadX + roadCenter;
      const barX0 = leftRoadX;
      const barX1 = rightRoadX + roadWidth;

      const openNorth = !connections || connections.north;
      const openSouth = !connections || connections.south;

      if (openNorth && openSouth) {
        // Fully connected: two roads spanning the whole map
        fillRect(leftRoadX, leftRoadX + roadWidth, 0, height);
        fillRect(rightRoadX, rightRoadX + roadWidth, 0, height);
        drawDashedCenterLine(mapData, dashedLines, "vertical", width, height, roadWidth);
        return;
      }

      const centerBarTop = roadCenterY - halfRoad;
      const centerBarBottom = centerBarTop + roadWidth;
      const barCenterRow = centerBarTop + roadCenter;

      if (openNorth && !openSouth) {
        // Enters from the north, U-turns at center (south is a dead end)
        fillRect(leftRoadX, leftRoadX + roadWidth, 0, centerBarBottom);
        fillRect(rightRoadX, rightRoadX + roadWidth, 0, centerBarBottom);
        fillRect(barX0, barX1, centerBarTop, centerBarBottom);
        for (let y = 0; y < centerBarTop; y++) {
          putDashV(mapData, leftCX, y, dl.vertical, width, height);
          putDashV(mapData, rightCX, y, dl.vertical, width, height);
        }
        for (let x = barX0; x < barX1; x++) putDashH(mapData, x, barCenterRow, dl.horizontal, width, height);
      } else if (!openNorth && openSouth) {
        // Enters from the south, U-turns at center (north is a dead end)
        fillRect(leftRoadX, leftRoadX + roadWidth, centerBarTop, height);
        fillRect(rightRoadX, rightRoadX + roadWidth, centerBarTop, height);
        fillRect(barX0, barX1, centerBarTop, centerBarBottom);
        for (let y = centerBarBottom; y < height; y++) {
          putDashV(mapData, leftCX, y, dl.vertical, width, height);
          putDashV(mapData, rightCX, y, dl.vertical, width, height);
        }
        for (let x = barX0; x < barX1; x++) putDashH(mapData, x, barCenterRow, dl.horizontal, width, height);
      } else {
        // No connections: a self-contained closed loop at the center
        const northBarTop = roadCenterY - 2 * roadWidth;
        const northBarBottom = northBarTop + roadWidth;
        const southBarTop = roadCenterY + roadWidth;
        const southBarBottom = southBarTop + roadWidth;
        fillRect(leftRoadX, leftRoadX + roadWidth, northBarTop, southBarBottom);
        fillRect(rightRoadX, rightRoadX + roadWidth, northBarTop, southBarBottom);
        fillRect(barX0, barX1, northBarTop, northBarBottom);
        fillRect(barX0, barX1, southBarTop, southBarBottom);
        for (let y = northBarBottom; y < southBarTop; y++) {
          putDashV(mapData, leftCX, y, dl.vertical, width, height);
          putDashV(mapData, rightCX, y, dl.vertical, width, height);
        }
        for (let x = barX0; x < barX1; x++) {
          putDashH(mapData, x, northBarTop + roadCenter, dl.horizontal, width, height);
          putDashH(mapData, x, southBarTop + roadCenter, dl.horizontal, width, height);
        }
      }
      return;
    }

    // Horizontal dual highway
    const topRoadY = roadCenterY - halfRoad - roadWidth - separation;
    const bottomRoadY = roadCenterY + halfRoad + separation;
    const topCY = topRoadY + roadCenter;
    const bottomCY = bottomRoadY + roadCenter;
    const barY0 = topRoadY;
    const barY1 = bottomRoadY + roadWidth;

    const openEast = !connections || connections.east;
    const openWest = !connections || connections.west;

    if (openEast && openWest) {
      // Fully connected: two roads spanning the whole map
      fillRect(0, width, topRoadY, topRoadY + roadWidth);
      fillRect(0, width, bottomRoadY, bottomRoadY + roadWidth);
      drawDashedCenterLine(mapData, dashedLines, "horizontal", width, height, roadWidth);
      return;
    }

    const centerBarLeft = roadCenterX - halfRoad;
    const centerBarRight = centerBarLeft + roadWidth;
    const barCenterCol = centerBarLeft + roadCenter;

    if (openEast && !openWest) {
      // Enters from the east, U-turns at center (west is a dead end)
      fillRect(centerBarLeft, width, topRoadY, topRoadY + roadWidth);
      fillRect(centerBarLeft, width, bottomRoadY, bottomRoadY + roadWidth);
      fillRect(centerBarLeft, centerBarRight, barY0, barY1);
      for (let x = centerBarRight; x < width; x++) {
        putDashH(mapData, x, topCY, dl.horizontal, width, height);
        putDashH(mapData, x, bottomCY, dl.horizontal, width, height);
      }
      for (let y = barY0; y < barY1; y++) putDashV(mapData, barCenterCol, y, dl.vertical, width, height);
    } else if (!openEast && openWest) {
      // Enters from the west, U-turns at center (east is a dead end)
      fillRect(0, centerBarRight, topRoadY, topRoadY + roadWidth);
      fillRect(0, centerBarRight, bottomRoadY, bottomRoadY + roadWidth);
      fillRect(centerBarLeft, centerBarRight, barY0, barY1);
      for (let x = 0; x < centerBarLeft; x++) {
        putDashH(mapData, x, topCY, dl.horizontal, width, height);
        putDashH(mapData, x, bottomCY, dl.horizontal, width, height);
      }
      for (let y = barY0; y < barY1; y++) putDashV(mapData, barCenterCol, y, dl.vertical, width, height);
    } else {
      // No connections: a self-contained closed loop at the center
      const westBarLeft = roadCenterX - 2 * roadWidth;
      const westBarRight = westBarLeft + roadWidth;
      const eastBarLeft = roadCenterX + roadWidth;
      const eastBarRight = eastBarLeft + roadWidth;
      fillRect(westBarLeft, eastBarRight, topRoadY, topRoadY + roadWidth);
      fillRect(westBarLeft, eastBarRight, bottomRoadY, bottomRoadY + roadWidth);
      fillRect(westBarLeft, westBarRight, barY0, barY1);
      fillRect(eastBarLeft, eastBarRight, barY0, barY1);
      for (let x = westBarRight; x < eastBarLeft; x++) {
        putDashH(mapData, x, topCY, dl.horizontal, width, height);
        putDashH(mapData, x, bottomCY, dl.horizontal, width, height);
      }
      for (let y = barY0; y < barY1; y++) {
        putDashV(mapData, westBarLeft + roadCenter, y, dl.vertical, width, height);
        putDashV(mapData, eastBarLeft + roadCenter, y, dl.vertical, width, height);
      }
    }
  }

  /**
   * Draw a dual highway cross road (4-way intersection with two roads in each direction)
   */
  function drawCrossRoad(mapData, tileId, width, height, dashedLines) {
    const roadWidth = 7;
    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);

    // Horizontal roads (top and bottom)
    const topRoadY = centerY - halfRoad - roadWidth - separation;
    const bottomRoadY = centerY + halfRoad + separation;

    // Top horizontal road
    for (let y = topRoadY; y < topRoadY + roadWidth; y++) {
      if (y >= 0 && y < height) {
        for (let x = 0; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = tileId;
        }
      }
    }

    // Bottom horizontal road
    for (let y = bottomRoadY; y < bottomRoadY + roadWidth; y++) {
      if (y >= 0 && y < height) {
        for (let x = 0; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = tileId;
        }
      }
    }

    // Vertical roads (left and right)
    const leftRoadX = centerX - halfRoad - roadWidth - separation;
    const rightRoadX = centerX + halfRoad + separation;

    // Left vertical road
    for (let y = 0; y < height; y++) {
      for (let x = leftRoadX; x < leftRoadX + roadWidth; x++) {
        if (x >= 0 && x < width) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = tileId;
        }
      }
    }

    // Right vertical road
    for (let y = 0; y < height; y++) {
      for (let x = rightRoadX; x < rightRoadX + roadWidth; x++) {
        if (x >= 0 && x < width) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = tileId;
        }
      }
    }

    // Draw dashed lines with intersection avoidance
    drawDashedCrossLines(mapData, dashedLines, width, height, roadWidth);
  }

  /**
   * Draw a dual highway T-shaped road with rotation
   */
  function drawTRoad(mapData, tileId, direction, width, height, dashedLines) {
    const roadWidth = 7;
    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);

    const topRoadY = centerY - halfRoad - roadWidth - separation;
    const bottomRoadY = centerY + halfRoad + separation;
    const leftRoadX = centerX - halfRoad - roadWidth - separation;
    const rightRoadX = centerX + halfRoad + separation;

    if (direction === "t-up" || direction === "t-north") {
      // Horizontal roads (top and bottom) + vertical stem pointing up
      // Top horizontal
      drawRect(mapData, tileId, 0, topRoadY, width, roadWidth, width, height);
      // Bottom horizontal
      drawRect(mapData, tileId, 0, bottomRoadY, width, roadWidth, width, height);
      // Left vertical stem (from top to center)
      drawRect(mapData, tileId, leftRoadX, 0, roadWidth, topRoadY, width, height);
      // Right vertical stem (from top to center)
      drawRect(mapData, tileId, rightRoadX, 0, roadWidth, topRoadY, width, height);
    } else if (direction === "t-down" || direction === "t-south") {
      // Horizontal roads (top and bottom) + vertical stem pointing down
      // Top horizontal
      drawRect(mapData, tileId, 0, topRoadY, width, roadWidth, width, height);
      // Bottom horizontal
      drawRect(mapData, tileId, 0, bottomRoadY, width, roadWidth, width, height);
      // Left vertical stem (from center to bottom)
      drawRect(mapData, tileId, leftRoadX, bottomRoadY + roadWidth, roadWidth, height - (bottomRoadY + roadWidth), width, height);
      // Right vertical stem (from center to bottom)
      drawRect(mapData, tileId, rightRoadX, bottomRoadY + roadWidth, roadWidth, height - (bottomRoadY + roadWidth), width, height);
    } else if (direction === "t-left" || direction === "t-west") {
      // Vertical roads (left and right) + horizontal stem pointing left
      // Left vertical
      drawRect(mapData, tileId, leftRoadX, 0, roadWidth, height, width, height);
      // Right vertical
      drawRect(mapData, tileId, rightRoadX, 0, roadWidth, height, width, height);
      // Top horizontal stem (from left to center)
      drawRect(mapData, tileId, 0, topRoadY, leftRoadX, roadWidth, width, height);
      // Bottom horizontal stem (from left to center)
      drawRect(mapData, tileId, 0, bottomRoadY, leftRoadX, roadWidth, width, height);
    } else if (direction === "t-right" || direction === "t-east") {
      // Vertical roads (left and right) + horizontal stem pointing right
      // Left vertical
      drawRect(mapData, tileId, leftRoadX, 0, roadWidth, height, width, height);
      // Right vertical
      drawRect(mapData, tileId, rightRoadX, 0, roadWidth, height, width, height);
      // Top horizontal stem (from center to right)
      drawRect(mapData, tileId, rightRoadX + roadWidth, topRoadY, width - (rightRoadX + roadWidth), roadWidth, width, height);
      // Bottom horizontal stem (from center to right)
      drawRect(mapData, tileId, rightRoadX + roadWidth, bottomRoadY, width - (rightRoadX + roadWidth), roadWidth, width, height);
    }

    // Draw dashed lines with T-junction avoidance
    drawDashedTLines(mapData, dashedLines, direction, width, height, roadWidth);
  }

  /**
   * Draw a dual highway corner road (L-shaped, connects two perpendicular directions)
   * Two road segments in each direction meet at the center
   * Examples: up-right, down-left, etc.
   */
 /**
   * Draw a dual highway corner road (L-shaped, connects two perpendicular directions)
   * Two road segments in each direction meet at the center
   * FIX: Extends outer lanes to fill the corner gap
   */
 function drawCornerRoad(mapData, tileId, direction, width, height, dashedLines) {
  const roadWidth = 7;
  const separation = 3;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const halfRoad = Math.floor(roadWidth / 2);

  const topRoadY = centerY - halfRoad - roadWidth - separation;
  const bottomRoadY = centerY + halfRoad + separation;
  const leftRoadX = centerX - halfRoad - roadWidth - separation;
  const rightRoadX = centerX + halfRoad + separation;

  // Normalize direction aliases
  let normalizedDir = direction.toLowerCase();
  normalizedDir = normalizedDir.replace("north", "up").replace("south", "down");
  normalizedDir = normalizedDir.replace("east", "right").replace("west", "left");

  if (normalizedDir === "corner-up-right" || normalizedDir === "corner-right-up") {
    // Up and Right (North -> East)
    // Outer Lane: Left Vertical & Bottom Horizontal

    // Left vertical road (Outer): Extend down to the bottom edge of the bottom road
    drawRect(mapData, tileId, leftRoadX, 0, roadWidth, bottomRoadY + roadWidth, width, height);
    // Right vertical road (Inner): Standard length to top road
    drawRect(mapData, tileId, rightRoadX, 0, roadWidth, topRoadY + roadWidth, width, height);
    
    // Top horizontal road (Inner): Standard start from right road
    drawRect(mapData, tileId, rightRoadX, topRoadY, width - rightRoadX, roadWidth, width, height);
    // Bottom horizontal road (Outer): Start from left road (closing the gap)
    drawRect(mapData, tileId, leftRoadX, bottomRoadY, width - leftRoadX, roadWidth, width, height);

  } else if (normalizedDir === "corner-up-left" || normalizedDir === "corner-left-up") {
    // Up and Left (North -> West)
    // Outer Lane: Right Vertical & Bottom Horizontal

    // Left vertical road (Inner): Standard length to top road
    drawRect(mapData, tileId, leftRoadX, 0, roadWidth, topRoadY + roadWidth, width, height);
    // Right vertical road (Outer): Extend down to the bottom edge of the bottom road
    drawRect(mapData, tileId, rightRoadX, 0, roadWidth, bottomRoadY + roadWidth, width, height);

    // Top horizontal road (Inner): Standard end at left road
    drawRect(mapData, tileId, 0, topRoadY, leftRoadX + roadWidth, roadWidth, width, height);
    // Bottom horizontal road (Outer): End at right road (closing the gap)
    drawRect(mapData, tileId, 0, bottomRoadY, rightRoadX + roadWidth, roadWidth, width, height);

  } else if (normalizedDir === "corner-down-right" || normalizedDir === "corner-right-down") {
    // Down and Right (South -> East)
    // Outer Lane: Left Vertical & Top Horizontal

    // Left vertical road (Outer): Start at top edge of top road
    drawRect(mapData, tileId, leftRoadX, topRoadY, roadWidth, height - topRoadY, width, height);
    // Right vertical road (Inner): Standard start at bottom road
    drawRect(mapData, tileId, rightRoadX, bottomRoadY, roadWidth, height - bottomRoadY, width, height);

    // Top horizontal road (Outer): Start from left road (closing the gap)
    drawRect(mapData, tileId, leftRoadX, topRoadY, width - leftRoadX, roadWidth, width, height);
    // Bottom horizontal road (Inner): Standard start from right road
    drawRect(mapData, tileId, rightRoadX, bottomRoadY, width - rightRoadX, roadWidth, width, height);

  } else if (normalizedDir === "corner-down-left" || normalizedDir === "corner-left-down") {
    // Down and Left (South -> West)
    // Outer Lane: Right Vertical & Top Horizontal

    // Left vertical road (Inner): Standard start at bottom road
    drawRect(mapData, tileId, leftRoadX, bottomRoadY, roadWidth, height - bottomRoadY, width, height);
    // Right vertical road (Outer): Start at top edge of top road
    drawRect(mapData, tileId, rightRoadX, topRoadY, roadWidth, height - topRoadY, width, height);

    // Top horizontal road (Outer): End at right road (closing the gap)
    drawRect(mapData, tileId, 0, topRoadY, rightRoadX + roadWidth, roadWidth, width, height);
    // Bottom horizontal road (Inner): Standard end at left road
    drawRect(mapData, tileId, 0, bottomRoadY, leftRoadX + roadWidth, roadWidth, width, height);
  }

  // Draw dashed lines for corner
  drawDashedCornerLines(mapData, dashedLines, normalizedDir, width, height, roadWidth);
}

  /**
   * Generate procedural terrain for a road biome
   * Checks for highway exits to cities before generating normal roads
   * Requires blendBiomeBorders from ProceduralMapBiomeGenerator to be called separately
   */
  function generateRoadBiome(mapData, biome, roadTileId, roadDirection, dashedLines, width = PROC_MAP_WIDTH, height = PROC_MAP_HEIGHT, adjacentBiomes = null) {
    let direction = roadDirection || "horizontal";
    const roadConfig = parseRoadConfig(biome.name);

    // Remember the carriageway / center-line tile ids for runtime lookups
    // (enemy movement and spawning avoid them), plus the resolved layout shape
    // (cross/t-*/corner-*/horizontal/vertical) so other systems (e.g. roadside
    // prefab placement) can tell a plain linear road from an intersection
    // without re-deriving the dispatch logic below.
    recordRoadTileIds(roadTileId, dashedLines, roadConfig ? roadConfig.direction : direction);

    // Which facing directions actually connect onward (road or settlement).
    // Drives dead-end loop-back for auto-generated linear roads.
    const connections = adjacentBiomes
      ? {
          north: isConnectableBiome(adjacentBiomes.north),
          south: isConnectableBiome(adjacentBiomes.south),
          east: isConnectableBiome(adjacentBiomes.east),
          west: isConnectableBiome(adjacentBiomes.west),
        }
      : null;

    // First, draw the regular dual highway
    if (roadConfig) {
      if (roadConfig.isCross) {
        drawCrossRoad(mapData, roadTileId, width, height, dashedLines);
      } else if (roadConfig.isT) {
        drawTRoad(mapData, roadTileId, roadConfig.direction, width, height, dashedLines);
      } else {
        // Explicit <Road:> config keeps its hand-authored full-length layout
        drawLinearRoad(
          mapData,
          roadTileId,
          roadConfig.direction,
          width,
          height,
          dashedLines
        );
      }
    } else {
      if (direction.includes("cross")) {
        drawCrossRoad(mapData, roadTileId, width, height, dashedLines);
      } else if (direction.includes("t-")) {
        drawTRoad(mapData, roadTileId, direction, width, height, dashedLines);
      } else if (direction.includes("corner-")) {
        drawCornerRoad(mapData, roadTileId, direction, width, height, dashedLines);
      } else {
        drawLinearRoad(mapData, roadTileId, direction, width, height, dashedLines, connections);
      }
    }

    // Then, if bordering a city, overlay the highway exit intersection
    const exitDirection = getHighwayExitDirection(adjacentBiomes);
    if (exitDirection) {
      drawHighwayExitIntersection(mapData, roadTileId, exitDirection, width, height, dashedLines);
    }
  }

  // ===== RUNTIME ROAD TILE LOOKUP =====
  // The tile ids used to draw the current procedural road are recorded on
  // $gameSystem._procGenData so runtime systems (enemy movement, spawning) can
  // tell the carriageway and its center-line markings apart from ordinary
  // terrain without re-deriving them from the biome feature tables.

  function recordRoadTileIds(roadTileId, dashedLines, shape) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!$gameSystem._procGenData) $gameSystem._procGenData = {};
    const dashed = [];
    if (dashedLines) {
      if (dashedLines.horizontal != null) dashed.push(dashedLines.horizontal);
      if (dashedLines.vertical != null && dashedLines.vertical !== dashedLines.horizontal) {
        dashed.push(dashedLines.vertical);
      }
    }
    $gameSystem._procGenData.roadTileIds = { road: roadTileId, dashed };
    // Set unconditionally (unlike roadIntersectionType, which only updates when
    // adjacent road biomes are detected) so it's always fresh for the map that
    // was just drawn.
    $gameSystem._procGenData.roadLayoutShape = shape || null;
  }

  /**
   * Geometry of a plain linear dual-highway road (see drawLinearRoad): the two
   * parallel carriageways and the open margins on either side of them, where
   * roadside prefabs (buildings, gas stations, etc.) can be placed. Shared so
   * other systems don't have to re-derive these constants by hand.
   */
  function getLinearRoadGeometry(width = PROC_MAP_WIDTH, height = PROC_MAP_HEIGHT) {
    const roadWidth = 7;
    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);

    return {
      roadWidth,
      separation,
      topRoadY: centerY - halfRoad - roadWidth - separation,
      bottomRoadY: centerY + halfRoad + separation,
      leftRoadX: centerX - halfRoad - roadWidth - separation,
      rightRoadX: centerX + halfRoad + separation,
    };
  }

  /**
   * Is (x, y) a Road surface tile (layer 0) or a DashedLine marking (layer 1)
   * of the currently generated procedural road biome?
   *
   * The recorded ids outlive the map they were generated for, so this is gated
   * on the current biome still being a road biome.
   */
  function isRoadFeatureTileAt(x, y) {
    const data = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData;
    const ids = data && data.roadTileIds;
    if (!ids) return false;
    if (!data.currentBiome || !isRoadBiome(data.currentBiome)) return false;
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.isValid(x, y)) return false;
    if (ids.road != null && $gameMap.tileId(x, y, 0) === ids.road) return true;
    if (ids.dashed && ids.dashed.length > 0) {
      if (ids.dashed.includes($gameMap.tileId(x, y, 1))) return true;
    }
    return false;
  }

  // ===== HIGHWAY EXIT SYSTEM =====

  /**
   * Draw a highway exit intersection: overlays a single centered exit road
   * pointing toward the city biome border on top of the dual highway
   * Creates a T-junction where the exit road extends only toward the city border
   * @param {Array} mapData - Map tile data
   * @param {number} tileId - Road tile ID
   * @param {string} exitDirection - Direction to city biome ("north", "south", "east", "west")
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {{horizontal: number|null, vertical: number|null}} dashedLines - Dashed line tile IDs
   */
  function drawHighwayExitIntersection(mapData, tileId, exitDirection, width, height, dashedLines) {
    const roadWidth = 7;
    const separation = 3;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const halfRoad = Math.floor(roadWidth / 2);

    // Calculate where the dual highway vertical roads are positioned
    const topRoadY = centerY - halfRoad - roadWidth - separation;
    const bottomRoadY = centerY + halfRoad + separation;
    const leftRoadX = centerX - halfRoad - roadWidth - separation;
    const rightRoadX = centerX + halfRoad + separation;

    const vTile = dashedLines ? dashedLines.vertical : null;
    const hTile = dashedLines ? dashedLines.horizontal : null;

    // Draw a single centered exit road only to the border facing the city
    if (exitDirection === "north") {
      // Single centered road extending north, stop at topRoadY
      for (let y = 0; y < topRoadY; y++) {
        for (let x = centerX - halfRoad; x <= centerX + halfRoad; x++) {
          if (x >= 0 && x < width) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = tileId;
          }
        }
      }
      // Continuous vertical dashed center line
      for (let y = 0; y < topRoadY; y++) {
        putDashV(mapData, centerX, y, vTile, width, height);
      }
    } else if (exitDirection === "south") {
      // Single centered road extending south, start at bottomRoadY + roadWidth
      for (let y = bottomRoadY + roadWidth; y < height; y++) {
        for (let x = centerX - halfRoad; x <= centerX + halfRoad; x++) {
          if (x >= 0 && x < width) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = tileId;
          }
        }
      }
      // Continuous vertical dashed center line
      for (let y = bottomRoadY + roadWidth; y < height; y++) {
        putDashV(mapData, centerX, y, vTile, width, height);
      }
    } else if (exitDirection === "east") {
      // Single centered road extending east, start at rightRoadX + roadWidth
      for (let x = rightRoadX + roadWidth; x < width; x++) {
        for (let y = centerY - halfRoad; y <= centerY + halfRoad; y++) {
          if (y >= 0 && y < height) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = tileId;
          }
        }
      }
      // Continuous horizontal dashed center line
      for (let x = rightRoadX + roadWidth; x < width; x++) {
        putDashH(mapData, x, centerY, hTile, width, height);
      }
    } else if (exitDirection === "west") {
      // Single centered road extending west, stop at leftRoadX
      for (let x = 0; x < leftRoadX; x++) {
        for (let y = centerY - halfRoad; y <= centerY + halfRoad; y++) {
          if (y >= 0 && y < height) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = tileId;
          }
        }
      }
      // Continuous horizontal dashed center line
      for (let x = 0; x < leftRoadX; x++) {
        putDashH(mapData, x, centerY, hTile, width, height);
      }
    }
  }

  /**
   * Determine exit direction for road bordering a city or village
   * Returns the direction from road to city/village biome
   * @param {Object} adjacentBiomes - Adjacent biome names
   * @returns {string|null} Exit direction ("north", "south", "east", "west") or null if no city/village borders
   */
  function getHighwayExitDirection(adjacentBiomes) {
    if (!adjacentBiomes) return null;

    if (adjacentBiomes.north && (isCityBiome(adjacentBiomes.north) || isVillageBiome(adjacentBiomes.north))) return "north";
    if (adjacentBiomes.south && (isCityBiome(adjacentBiomes.south) || isVillageBiome(adjacentBiomes.south))) return "south";
    if (adjacentBiomes.east && (isCityBiome(adjacentBiomes.east) || isVillageBiome(adjacentBiomes.east))) return "east";
    if (adjacentBiomes.west && (isCityBiome(adjacentBiomes.west) || isVillageBiome(adjacentBiomes.west))) return "west";

    return null;
  }

  // ===== INTERSECTION TYPE DETECTION =====

  /**
   * Determine road intersection type based on adjacent biomes
   * Returns the appropriate road direction (horizontal, vertical, cross, t-*, corner-*)
   * based on which adjacent biomes are roads
   * Also saves the intersection type to $gameSystem._procGenData for use by other systems
   *
   * @param {Object} adjacentBiomes - Object with north, south, east, west biome names
   * @param {Function} isRoadBiomeFn - Function to check if biome is a road (default: isRoadBiome)
   * @returns {string} Road direction type (horizontal, vertical, cross, t-north, corner-up-right, etc.)
   */
  function determineRoadIntersectionType(adjacentBiomes, isRoadBiomeFn = isRoadBiome) {
    if (!adjacentBiomes) {
      return "horizontal"; // Default fallback
    }

    // Check which directions have adjacent road biomes
    const hasNorth = adjacentBiomes.north && isRoadBiomeFn(adjacentBiomes.north);
    const hasSouth = adjacentBiomes.south && isRoadBiomeFn(adjacentBiomes.south);
    const hasEast = adjacentBiomes.east && isRoadBiomeFn(adjacentBiomes.east);
    const hasWest = adjacentBiomes.west && isRoadBiomeFn(adjacentBiomes.west);

    // Debug logging
    dlog(
      `[Road Intersection] N:${hasNorth} S:${hasSouth} E:${hasEast} W:${hasWest} (N:${adjacentBiomes.north} S:${adjacentBiomes.south} E:${adjacentBiomes.east} W:${adjacentBiomes.west})`
    );

    // Count adjacent roads
    const roadCount = [hasNorth, hasSouth, hasEast, hasWest].filter(Boolean).length;

    let result = "horizontal"; // Default

    // 4-way intersection (cross)
    if (hasNorth && hasSouth && hasEast && hasWest) {
      result = "cross";
    }
    // 3-way intersections (T-junctions)
    // Named by the direction the stem POINTS (opposite of missing direction)
    else if (hasNorth && hasSouth && hasEast && !hasWest) {
      result = "t-east"; // Stem points east (missing west connection)
      dlog(`[Road Intersection] T-junction detected: ${result}`);
    }
    else if (hasNorth && hasSouth && hasWest && !hasEast) {
      result = "t-west"; // Stem points west (missing east connection)
      dlog(`[Road Intersection] T-junction detected: ${result}`);
    }
    else if (hasNorth && hasEast && hasWest && !hasSouth) {
      result = "t-north"; // Stem points north (missing south connection)
      dlog(`[Road Intersection] T-junction detected: ${result}`);
    }
    else if (hasSouth && hasEast && hasWest && !hasNorth) {
      result = "t-south"; // Stem points south (missing north connection)
      dlog(`[Road Intersection] T-junction detected: ${result}`);
    }
    // 2-way intersections (corners)
    else if (hasNorth && hasEast && !hasSouth && !hasWest) {
      result = "corner-up-right"; // North and East
    }
    else if (hasNorth && hasWest && !hasSouth && !hasEast) {
      result = "corner-up-left"; // North and West
    }
    else if (hasSouth && hasEast && !hasNorth && !hasWest) {
      result = "corner-down-right"; // South and East
    }
    else if (hasSouth && hasWest && !hasNorth && !hasEast) {
      result = "corner-down-left"; // South and West
    }
    // Linear roads (only 1 or 2 parallel connections)
    else if ((hasNorth && hasSouth && !hasEast && !hasWest) ||
        (!hasNorth && !hasSouth && hasEast && hasWest)) {
      // Vertical (north-south) or horizontal (east-west)
      // If no east/west roads, use vertical; if no north/south roads, use horizontal
      result = hasNorth || hasSouth ? "vertical" : "horizontal";
    }
    // Single direction (dead-end road facing one direction)
    else if (hasNorth && !hasSouth && !hasEast && !hasWest) {
      result = "vertical"; // Road continues north
    }
    else if (hasSouth && !hasNorth && !hasEast && !hasWest) {
      result = "vertical"; // Road continues south
    }
    else if (hasEast && !hasWest && !hasNorth && !hasSouth) {
      result = "horizontal"; // Road continues east
    }
    else if (hasWest && !hasEast && !hasNorth && !hasSouth) {
      result = "horizontal"; // Road continues west
    }
    else {
      // Default fallback
      dlog(`[Road Intersection] Returning fallback: ${result}`);
    }

    // Save the intersection type to game system for use by RoadCarAI
    if (!$gameSystem._procGenData) {
      $gameSystem._procGenData = {};
    }
    $gameSystem._procGenData.roadIntersectionType = result;
    dlog(`[Road Intersection] Saved intersection type to $gameSystem: ${result}`);

    return result;
  }

  // ===== EXPORT FUNCTIONS =====

  window.ProcGenRoads = {
    isRoadBiome,
    isWorldRoadTileId,
    isCityBiome,
    isVillageBiome,
    isBurgBiome,
    isConnectableBiome,
    parseRoadConfig,
    getDashedLineTileId,
    getDashedLineTileIds,
    isDashStep,
    DASH_LENGTH,
    DASH_CYCLE,
    getZebraTileIds,
    stampZebraCrossing,
    getSingleFeatureTileId,
    isPositionOnRoadTile,
    isRoadFeatureTileAt,
    drawDashedCenterLine,
    drawDashedCrossLines,
    drawDashedTLines,
    drawDashedCornerLines,
    drawRect,
    drawLinearRoad,
    drawCrossRoad,
    drawTRoad,
    drawCornerRoad,
    drawHighwayExitIntersection,
    getHighwayExitDirection,
    generateRoadBiome,
    determineRoadIntersectionType,
    getLinearRoadGeometry,
  };
})();
