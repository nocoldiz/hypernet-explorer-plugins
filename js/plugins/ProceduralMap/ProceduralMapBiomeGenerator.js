/*:
 * @target MZ
 * @plugindesc Biome-specific procedural map generation: roads, mountains, features
 * @author Omni-Lex
 *
 * @help
 * Procedural Map Biome Generator
 * ==============================
 * Handles biome-specific terrain generation including:
 * - Road generation (linear, cross, T-intersections)
 * - Biome feature distribution (single-tile and multi-tile)
 * - Map loading and procedural map handling
 * - Multi-tile terrain feature placement
 *
 * MULTI-TILE FEATURE SUPPORT
 * ==========================
 * Features can now be defined as grids of tiles. When placing multi-tile features:
 * - The feature is placed with its top-left corner at the selected position
 * - All tiles of the grid must fit within map bounds
 * - None of the grid tiles can overlap water
 * - Variants can be mixed: single-tile and multi-tile variants of the same feature
 *
 * Examples:
 *   <House: [B1, B2],[B3, B4]>      2x2 building
 *   <Bush: [C5]>                    Single tile (compatible with 1x1 grid)
 *   <Bridge: [D1, D2, D3]>          1x3 horizontal bridge
 *
 * Requires ProceduralMapUtils.js to be loaded first
 *
 * BIOME SYSTEM
 * ============
 * - Each biome has a name and associated tileset ID
 * - Tiles on map 315 are associated with biomes via tileset 96 notes
 * - If a tile has no biome association, defaults to "Fields" biome
 * - Procedural maps use the biome's tileset for terrain generation
 *
 * startProcGen, stopProcGen, goDown and goUp are NOT declared here. They are declared and
 * handled by WorldMapReturn.js, which owns every transfer between the world map and a
 * procedural map. This file used to declare them as well, which offered the editor four
 * commands that nothing on this plugin's name ever answered.
 */

(() => {
  "use strict";

  const pluginName = "ProceduralMapBiomeGenerator";

  // Import utilities from ProceduralMapUtils
  const Utils2 = window.ProcGenUtils;
  if (!Utils2) {
    console.error(
      "ProceduralMapBiomeGenerator requires ProceduralMapUtils plugin"
    );
    return;
  }

  const {
    Cache,
    getTileIdToProgressiveId,
    getProgressiveIdToTileId,
    getTileIdFromTypeAndIndex,
    getBiomeForWorldTile,
    classifyWorldColumn,
    isTestPlayer,
    exportBiomesMapToFile,
    getBridgeDirectionFromWorldTileId,
    getRoadDirectionFromWorldTile,
    getBiomeByName,
    parseTerrainFeatures,
    parseSingleTileString,
    createSeededRandom,
    getWorldSeed,
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
    checkDiagonalMapBiomesFromCache,
    isSeabedBiomeName,
    undergroundNeighbourNames,
    undergroundBorderOpenings,
    UNDERGROUND_BORDER_THICKNESS,
    isWaterTileId,
    getRandomFeatureVariant,
    placeMultiTileFeature,
    generateFeatureNoise,
    generateFeatureScattered,
    generateFeatureNoiseSteps,
    generateFeatureScatteredSteps,
    generateCaveWithDrunkenWalk,
    generateCaveWithCellularAutomata,
    generateCaveWithVoronoi,
    smoothCaveCeilingMask,
    reconcileCaveWallsAndCeilings,
    cleanupOrphanedWallsAndCeilings,
    generateMountainBiomeTerrain,
    generateMountainRangeTerrain,
    getTerrainFeatures,
    getFeaturesByLayer,
    getFeatureNameFromTileId,
    calculateDirectionalInfluence,
    getWeightedTerrainFeature,
    isInForbiddenZone,
    doesMultiTileFeatureOverlapForbidden,
    clearForbiddenZoneFeatures,
    getArrowForDirection,
    isTileOccupiedOnLayer,
    log,
    logWarn,
    WORLD_MAP_ID,
    WORLD_TILESET_ID,
    PROC_MAP_ID,
    PROC_MAP_WIDTH,
    PROC_MAP_HEIGHT,
    BORDER_DETECTION_RANGE,
  } = Utils2;

  // Resumable generation: STEP_ROWS, runSteps and the reasoning behind them all
  // live in ProceduralMapUtils.js under RESUMABLE GENERATION. Every heavy pass
  // in this file exists once, as a *Steps generator that yields where it may
  // safely be paused, with the plain function of the same name as the driver
  // that runs it straight through.
  const { STEP_ROWS, runSteps } = Utils2;

  // Import beach/water generation functions from ProceduralBeachGenerator
  const BeachGen = window.ProcGenBeach;
  if (!BeachGen) {
    console.error(
      "ProceduralMapBiomeGenerator requires ProceduralBeachGenerator plugin"
    );
    return;
  }

  const {
    isWaterBiome,
    drawWaterEdges,
  } = BeachGen;

  // Import road generation functions from ProceduralMapRoadGenerator
  const RoadGen = window.ProcGenRoads;
  if (!RoadGen) {
    console.error(
      "ProceduralMapBiomeGenerator requires ProceduralMapRoadGenerator plugin"
    );
    return;
  }

  const {
    isRoadBiome,
    parseRoadConfig,
    getDashedLineTileId,
    getDashedLineTileIds,
    isPositionOnRoadTile,
    generateRoadBiome: generateRoadBiomeUtil,
    determineRoadIntersectionType,
  } = RoadGen;

  // Import river generation functions from ProceduralMapRiverGenerator
  const RiverGen = window.ProcGenRivers;
  if (!RiverGen) {
    console.error(
      "ProceduralMapBiomeGenerator requires ProceduralMapRiverGenerator plugin"
    );
    return;
  }

  const {
    isRiverBiome,
    parseRiverConfig,
    getRiverDecorationTileId,
    isPositionOnRiverTile,
    generateRiverBiome: generateRiverBiomeUtil,
    determineRiverIntersectionType,
    isRiverConnectable,
    applyRiverOverlay,
  } = RiverGen;

  // Import dungeon generation functions from ProceduralMapStructureGenerator
  const DungeonGen = window.ProcGenDungeon;
  if (!DungeonGen) {
    console.error(
      "ProceduralMapBiomeGenerator requires ProceduralMapStructureGenerator plugin"
    );
    return;
  }

  const {
    isDungeonBiome,
    generateDungeonBiome: generateDungeonBiomeUtil,
    isVillageBiome,
    generateVillageBiome: generateVillageBiomeUtil,
    generateVillageBiomeSteps: generateVillageBiomeStepsUtil,
    isCityBiome,
    generateCityBiome: generateCityBiomeUtil,
    generateCityBiomeSteps: generateCityBiomeStepsUtil,
    isBurgBiome,
    generateBurgBiome: generateBurgBiomeUtil,
    isTilePassableInTileset,

  } = DungeonGen;

  const { Biomes, Features, HardcodedBiomeOverrides } =
    window.WorldGen;

  // ==========================================================================
  // Civic signposts (SignPost / SignBus / SignPark)
  // ==========================================================================
  // Once a settlement (village / burg / city) has its roads and buildings, drop
  // a few civic signs on the grass verge beside its roads:
  //   SignPost -> readable place name + dismantle (villages only, 1-3)
  //   SignBus  -> boards the fast-travel map in Bus mode (one per map, at the
  //               bus stop it serves - never a second one down the road)
  //   SignPark -> recalls the last vehicle driven (one per settlement)
  // They sit on feature layer 2 so the interaction plugins detect them when the
  // player faces them from the adjacent road tile. Placement is deterministic
  // for a given map seed, so the same tile always shows the same signs.
  // The sign a civic feature is drawn with, as a grid anchored on the tile it
  // STANDS on (its bottom row).
  //
  // These signs are tall: SignBus is a 1x3 strip - cap, bus board, pole - and
  // SignPark and SignPost are the same shape. Taking only grid[0][0] (as this
  // used to) painted the cap on its own, so a city's bus signs were a row of
  // one-tile stubs with the bus board and the post missing.
  function _civicSignVariant(featureName, allFeatures, rng) {
    const variants = allFeatures[featureName];
    if (!variants || variants.length === 0) return null;
    // A single-tile variant is a whole sign by itself.
    const singles = variants.filter((v) => v.type === "single" && v.tileId);
    if (singles.length) {
      return { w: 1, h: 1, grid: [[singles[Math.floor(rng() * singles.length)].tileId]] };
    }
    const grids = variants.filter((v) => v.type === "grid" && v.grid && v.grid.length);
    if (!grids.length) return null;
    const grid = grids[Math.floor(rng() * grids.length)].grid;
    return { w: Math.max(...grid.map((row) => row.length)), h: grid.length, grid };
  }

  function _collectSingleTileIds(names, allFeatures, out) {
    for (const n of names) {
      const variants = allFeatures[n];
      if (!variants) continue;
      for (const v of variants) {
        if (v.type === "single" && v.tileId) out.add(v.tileId);
      }
    }
  }

  function placeCivicSigns(mapData, biome, allFeatures, seed, counts) {
    if (!mapData || !allFeatures) return;
    // Bus stops and camper parks are Earth civic infrastructure: an alien
    // surface has neither a bus line nor a road authority, so no sign of any
    // kind goes up there (the alien mountain route reuses the Earth mountain
    // generator, so the biome name is the only reliable tell).
    if (/^Alien/i.test(String((biome && biome.name) || "")) ||
      (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData &&
        $gameSystem._procGenData.alienGrid)) {
      return;
    }
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    // Dedicated RNG stream so signs never perturb terrain generation.
    const rng = createSeededRandom((seed ^ 0x5169b05) >>> 0);

    // Roadside is defined by these walkable path/road tiles.
    const roadTileIds = new Set();
    _collectSingleTileIds(
      ["Path", "PathDesert", "PathIce", "Road", "DashedLine",
        "DashedLineHorizontal", "DashedLineVertical", "Sidewalk",
        "SidewalkDesert", "SidewalkIce"],
      allFeatures, roadTileIds
    );
    if (roadTileIds.size === 0) return;

    // Base tiles a sign must never sit on top of.
    const blockedBaseIds = new Set();
    _collectSingleTileIds(
      ["Water", "Ocean", "Beach", "Lava", "Magma"],
      allFeatures, blockedBaseIds
    );

    const idx0 = (x, y) => calculateIndex(x, y, 0, width, height);
    const isRoad = (x, y) => roadTileIds.has(mapData[idx0(x, y)]);
    const featureLayersEmpty = (x, y) =>
      mapData[calculateIndex(x, y, 1, width, height)] === 0 &&
      mapData[calculateIndex(x, y, 2, width, height)] === 0 &&
      mapData[calculateIndex(x, y, 3, width, height)] === 0;

    // Candidate = walkable non-road verge tile, feature layers empty, next to a road.
    const candidates = [];
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const base = mapData[idx0(x, y)];
        if (base === 0 || roadTileIds.has(base) || blockedBaseIds.has(base)) continue;
        if (!featureLayersEmpty(x, y)) continue;
        if (isRoad(x - 1, y) || isRoad(x + 1, y) || isRoad(x, y - 1) || isRoad(x, y + 1)) {
          candidates.push({ x, y });
        }
      }
    }
    if (candidates.length === 0) return;

    // Deterministic Fisher-Yates shuffle.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }

    const placed = [];
    const MIN_SPACING = 8;
    const tooClose = (c) =>
      placed.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < MIN_SPACING);

    // Every tile a named feature is drawn with, single or grid, so the map can
    // be asked where (and whether) that feature already stands on it.
    const _featureTileIds = (name) => {
      const ids = new Set();
      for (const v of allFeatures[name] || []) {
        if (v.type === "single" && v.tileId) ids.add(v.tileId);
        else if (v.grid) for (const row of v.grid) for (const t of row) if (t) ids.add(t);
      }
      return ids;
    };
    const _featureCells = (name) => {
      const ids = _featureTileIds(name);
      const cells = [];
      if (!ids.size) return cells;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let layer = 1; layer <= 3; layer++) {
            if (ids.has(mapData[calculateIndex(x, y, layer, width, height)])) {
              cells.push({ x, y });
              break;
            }
          }
        }
      }
      return cells;
    };
    const _mapHasFeature = (name) => _featureCells(name).length > 0;

    // Where the bus shelters stand. A bus sign belongs AT the stop it serves -
    // a sign on its own three streets away is not a stop, it is litter - so
    // SignBus is anchored to the nearest shelter whenever the map has one
    // (the city generator's own pass, or a prefab that came with one).
    const busStopCells = _featureCells("BusStop");
    // Group those cells into shelters (one shelter is a 5x3 block of them) so
    // several bus signs spread over the stops the city has instead of crowding
    // around whichever one happens to be nearest.
    const shelters = [];
    for (const cell of busStopCells) {
      const near = shelters.find((s) => Math.abs(s.x - cell.x) <= 6 && Math.abs(s.y - cell.y) <= 6);
      if (near) {
        near.n++;
        near.x = Math.round(near.x + (cell.x - near.x) / near.n);
        near.y = Math.round(near.y + (cell.y - near.y) / near.n);
      } else {
        shelters.push({ x: cell.x, y: cell.y, n: 1, signs: 0 });
      }
    }

    // A tall sign is drawn upward from the tile it stands on, so every cell of
    // the strip has to be free. Only the tile it stands on must be a verge; the
    // board above it may overhang the street.
    const signFits = (variant, x, y) => {
      for (let gy = 0; gy < variant.h; gy++) {
        const ty = y - (variant.h - 1) + gy;
        for (let gx = 0; gx < variant.w; gx++) {
          const tx = x + gx;
          if (tx < 1 || tx >= width - 1 || ty < 1 || ty >= height - 1) return false;
          const base = mapData[idx0(tx, ty)];
          if (base === 0 || blockedBaseIds.has(base)) return false;
          if (!featureLayersEmpty(tx, ty)) return false;
        }
      }
      return true;
    };

    const drawSign = (variant, x, y) => {
      for (let gy = 0; gy < variant.grid.length; gy++) {
        const row = variant.grid[gy];
        const ty = y - (variant.h - 1) + gy;
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx]) mapData[calculateIndex(x + gx, ty, 2, width, height)] = row[gx];
        }
      }
    };

    function placeOne(featureName) {
      const variant = _civicSignVariant(featureName, allFeatures, rng);
      if (!variant) return false;

      // A bus sign goes up at a shelter - the least-served one - and the
      // spacing rule (which is what keeps signs apart on an open street) must
      // not push it away from the stop it belongs to.
      let shelter = null;
      if (featureName === "SignBus" && shelters.length) {
        shelter = shelters.reduce((a, b) => (b.signs < a.signs ? b : a), shelters[0]);
      }
      const order = shelter
        ? candidates
          .filter((c) => !c._used)
          .sort((a, b) =>
            (Math.abs(a.x - shelter.x) + Math.abs(a.y - shelter.y)) -
            (Math.abs(b.x - shelter.x) + Math.abs(b.y - shelter.y)))
        : candidates;

      for (const c of order) {
        if (c._used || (!shelter && tooClose(c))) continue;
        if (!signFits(variant, c.x, c.y)) continue;
        drawSign(variant, c.x, c.y);
        c._used = true;
        placed.push(c);
        if (shelter) shelter.signs++;
        return true;
      }
      return false;
    }

    const pick = (range) => {
      if (!range) return 0;
      const [min, max] = range;
      return min + Math.floor(rng() * (max - min + 1));
    };

    // One bus sign per map, and no more: the city generator raises its own
    // beside the shelter it serves, and a prefab may arrive with one already
    // standing. A second sign is a second stop that boards the same map.
    const busN = _mapHasFeature("SignBus") ? 0 : Math.min(pick(counts.bus), 1);
    const parkN = pick(counts.park);
    const postN = pick(counts.post);
    for (let i = 0; i < busN; i++) placeOne("SignBus");
    for (let i = 0; i < parkN; i++) placeOne("SignPark");
    for (let i = 0; i < postN; i++) placeOne("SignPost");
  }

  // ==========================================================================
  // Tilled fields (TilledSoil)
  // ==========================================================================
  // A biome that declares TilledSoil (the Farm biome, and any village grown on
  // one) gets real crop plots instead of the usual per-tile scatter: the tiles
  // have to sit next to each other for the crops growing on them to read as a
  // field, because PlantGrowthSystem seeds ONE crop type per contiguous patch
  // of tilled soil. Plots are deterministic for a given map seed and only land
  // on open, walkable ground with nothing else on the feature layers.
  const FIELD_MAX_TILES = 130;      // total tilled tiles per map
  const FIELD_EDGE_GAP_CHANCE = 0.1; // ragged plot border (interior stays whole)

  // Density the biome declares for a feature (0 when it declares none).
  function _declaredFeatureDensity(biome, name) {
    for (const f of biome.features || []) {
      const fname = typeof f === "string" ? f : f.name;
      if (fname !== name) continue;
      return (typeof f === "object" && f.density) ? f.density : 1;
    }
    return 0;
  }

  function placeTilledFields(mapData, biome, allFeatures, seed, width, height) {
    if (!mapData || !allFeatures) return;
    const density = _declaredFeatureDensity(biome, "TilledSoil");
    if (density <= 0) return;

    // Only the B-E sheet variants: the A5 entry is a ground autotile and would
    // be invisible on the feature layer.
    const soilTiles = (allFeatures["TilledSoil"] || [])
      .filter((v) => v.type === "single" && v.tileId && v.tileId < 1536)
      .map((v) => v.tileId);
    if (soilTiles.length === 0) return;

    const rng = createSeededRandom((seed ^ 0x7111ed) >>> 0);

    // Tiles a field must never be laid over.
    const blockedBaseIds = new Set();
    _collectSingleTileIds(
      ["Water", "Ocean", "Beach", "Lava", "Magma", "Path", "PathDesert", "PathIce",
        "Road", "Sidewalk", "SidewalkDesert", "SidewalkIce", "DashedLine",
        "DashedLineHorizontal", "DashedLineVertical"],
      allFeatures, blockedBaseIds
    );

    const idx = (x, y, z) => calculateIndex(x, y, z, width, height);
    const isFree = (x, y) => {
      const base = mapData[idx(x, y, 0)];
      if (!base || blockedBaseIds.has(base)) return false;
      return mapData[idx(x, y, 1)] === 0 &&
        mapData[idx(x, y, 2)] === 0 &&
        mapData[idx(x, y, 3)] === 0;
    };

    const plots = Math.max(2, Math.min(6, Math.round(density * 2)));
    const margin = 6;
    let stamped = 0;

    for (let p = 0; p < plots && stamped < FIELD_MAX_TILES; p++) {
      const pw = 4 + Math.floor(rng() * 4); // 4-7
      const ph = 3 + Math.floor(rng() * 4); // 3-6
      let origin = null;
      for (let attempt = 0; attempt < 40 && !origin; attempt++) {
        const ox = margin + Math.floor(rng() * (width - pw - margin * 2));
        const oy = margin + Math.floor(rng() * (height - ph - margin * 2));
        let ok = true;
        for (let y = oy; y < oy + ph && ok; y++) {
          for (let x = ox; x < ox + pw && ok; x++) {
            if (!isFree(x, y)) ok = false;
          }
        }
        if (ok) origin = { x: ox, y: oy };
      }
      if (!origin) continue;

      for (let y = origin.y; y < origin.y + ph; y++) {
        for (let x = origin.x; x < origin.x + pw; x++) {
          if (stamped >= FIELD_MAX_TILES) break;
          const onEdge = x === origin.x || y === origin.y ||
            x === origin.x + pw - 1 || y === origin.y + ph - 1;
          if (onEdge && rng() < FIELD_EDGE_GAP_CHANCE) continue;
          mapData[idx(x, y, 2)] = soilTiles[Math.floor(rng() * soilTiles.length)];
          stamped++;
        }
      }
    }
  }

  // ==========================================================================
  // Bunker origin (character creation)
  // ==========================================================================
  // The Bunker origin starts the party inside a LootCellar and marks ONE world
  // square as the bunker's surface square ($gameSystem._bunkerOrigin). Every
  // time that square is generated, a StairsDown hatch is stamped back onto it,
  // so the way down to the starting bunker is permanent: the hatch is never
  // recorded as dismantled (StairsDown only descends, it is never removed) and
  // the tile it lands on is derived from the map itself, so a regeneration puts
  // it exactly where it was. Descending through it rebuilds the very cellar the
  // party started in, because a LootCellar's layout is fixed by
  // (world seed, world coords) alone.
  //
  // The cellar half of the record guarantees the starting hoards: the Bunker
  // origin promises gold, and the biome's own 0.35-density Gold scatter can roll
  // none at all.
  const BUNKER_GOLD_PILES = 6;
  // Published so the character-creation dossier can promise the exact number.
  window.WorldGen.BUNKER_GOLD_PILES = BUNKER_GOLD_PILES;

  // The bunker record when `worldCoords` is the bunker's own world square.
  function bunkerRecordFor(worldCoords) {
    const rec = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._bunkerOrigin : null;
    if (!rec || !worldCoords) return null;
    if (worldCoords.x !== rec.worldX || worldCoords.y !== rec.worldY) return null;
    return rec;
  }

  // Every feature table of a biome's tileset(s), merged (same shape the
  // generators build for themselves).
  function bunkerBiomeFeatures(biome) {
    const tilesetIds = biome.tilesetIds || [biome.tilesetId];
    const allFeatures = {};
    for (const tilesetId of tilesetIds) {
      const features = Cache.getTilesetFeatures(tilesetId);
      for (const [name, tiles] of Object.entries(features)) {
        if (!allFeatures[name]) allFeatures[name] = [];
        allFeatures[name] = allFeatures[name].concat(tiles);
      }
    }
    return allFeatures;
  }

  function bunkerSingleTileIds(names, allFeatures) {
    const out = new Set();
    for (const n of names) {
      for (const v of allFeatures[n] || []) {
        if (v.type === "single" && v.tileId) out.add(v.tileId);
      }
    }
    return out;
  }

  // Stamp the permanent hatch on the bunker's surface map and record the tile it
  // ended up on (the exit from the cellar steps out one tile south of it).
  function stampBunkerHatch(mapData, biome, rec) {
    const allFeatures = bunkerBiomeFeatures(biome);
    const stairs = (allFeatures["StairsDown"] || []).find((v) => v.type === "single" && v.tileId);
    if (!stairs) {
      logWarn(`[Bunker] tileset ${biome.tilesetId} has no single-tile StairsDown: hatch not placed`);
      return;
    }

    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const blocked = bunkerSingleTileIds(["Water", "Ocean", "Beach", "Lava", "Magma"], allFeatures);
    const idx = (x, y, z) => calculateIndex(x, y, z, width, height);
    const standable = (x, y) => {
      const base = mapData[idx(x, y, 0)];
      return base > 0 && !blocked.has(base);
    };

    // Start from just north of the 6x6 spawn clearing kept free at the map
    // centre (isInForbiddenZone), so the hatch sits beside where the player
    // lands when entering the square from the world map without ever covering
    // that landing tile. Search outward in deterministic rings so a square whose
    // centre is water still gets its hatch, always on the same tile.
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2) - 4;
    let spot = null;
    for (let r = 0; r <= 20 && !spot; r++) {
      for (let dy = -r; dy <= r && !spot; dy++) {
        for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) continue;
          // The hatch itself plus the tile the player steps out onto.
          if (!standable(x, y) || !standable(x, y + 1)) continue;
          spot = { x, y };
        }
      }
    }
    if (!spot) {
      logWarn(`[Bunker] no standable tile for the hatch at (${rec.worldX}, ${rec.worldY})`);
      return;
    }

    // Clear the 3x3 around the hatch so no tree/rock walls the party in, then
    // stamp the stairs on the feature layer.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const z of [1, 2, 3]) mapData[idx(spot.x + dx, spot.y + dy, z)] = 0;
      }
    }
    mapData[idx(spot.x, spot.y, 2)] = stairs.tileId;
    rec.entranceX = spot.x;
    rec.entranceY = spot.y;
  }

  // Guarantee a handful of gold hoards in the starting bunker. Placement is
  // seeded from the world square, so the same piles come back on every
  // regeneration and the collected ones stay collected (removals are recorded
  // per tile by ProceduralTerrainInteractions).
  function stampBunkerGold(mapData, biome, rec) {
    const allFeatures = bunkerBiomeFeatures(biome);
    const goldTiles = (allFeatures["Gold"] || []).filter((v) => v.type === "single" && v.tileId);
    if (goldTiles.length === 0) return;
    const floorIds = bunkerSingleTileIds(["DungeonFloor"], allFeatures);
    if (floorIds.size === 0) return;

    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const idx = (x, y, z) => calculateIndex(x, y, z, width, height);
    const isFloor = (x, y) => floorIds.has(mapData[idx(x, y, 0)]);
    const isFree = (x, y) =>
      mapData[idx(x, y, 1)] === 0 && mapData[idx(x, y, 2)] === 0 && mapData[idx(x, y, 3)] === 0;

    // Open floor only (all four neighbours walkable), so a hoard never plugs a
    // one-tile corridor.
    const candidates = [];
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (!isFloor(x, y) || !isFree(x, y)) continue;
        if (!isFloor(x - 1, y) || !isFloor(x + 1, y) || !isFloor(x, y - 1) || !isFloor(x, y + 1)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;

    const rng = createSeededRandom(hashCoords(getWorldSeed() ^ 0xb0c4e2, rec.worldX, rec.worldY));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }

    // Spread the hoards out, tightening the spacing until all of them fit: a
    // cellar can be as small as one 6x5 vault, and the dossier promises the
    // full count.
    const placed = [];
    for (const spacing of [4, 3, 2, 1]) {
      for (const c of candidates) {
        if (placed.length >= BUNKER_GOLD_PILES) break;
        if (c._used) continue;
        if (placed.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < spacing)) continue;
        mapData[idx(c.x, c.y, 2)] = goldTiles[Math.floor(rng() * goldTiles.length)].tileId;
        c._used = true;
        placed.push(c);
      }
      if (placed.length >= BUNKER_GOLD_PILES) break;
    }
  }

  // Applied to every generated map: does nothing unless the map being built is
  // the bunker's own world square (its surface, or the cellar underneath it).
  function applyBunkerFeatures(mapData, biome, worldCoords) {
    if (!mapData || !biome) return;
    const rec = bunkerRecordFor(worldCoords);
    if (!rec) return;
    if (biome.name === "LootCellar") {
      stampBunkerGold(mapData, biome, rec);
      return;
    }
    // Surface only: a cave or dungeon layer dug under the bunker square gets no
    // hatch of its own (the layer stack is pushed before the lower map is
    // generated, so a non-empty stack means "underground").
    const pg = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._procGenData : null;
    const underground = !!(pg && pg.biomeLayerStack && pg.biomeLayerStack.length > 0);
    if (!underground && !isDungeonBiome(biome.name)) stampBunkerHatch(mapData, biome, rec);
  }

  /**
   * Hardcoded biome spawn overrides for specific world coordinates
   * Forces a specific biome and optional road direction at given coordinates
   * The overridden biome is generated and cached just like normal procedural generation
   *
   * FORMAT:
   *   "worldX,worldY": { biome: "BiomeName", roadDirection: "..." (optional) }
   *
   * BIOME NAMES:
   *   - Any biome defined in WorldGen.Biomes (e.g., "Forest", "Mountain", "Ocean")
   *   - "Road" for road biomes (when using roadDirection)
   *
   * ROAD DIRECTIONS (optional - only for Road biome):
   *   LINEAR:
   *   - "horizontal"  : Horizontal road (left-right)
   *   - "vertical"    : Vertical road (up-down)
   *
   *   INTERSECTIONS:
   *   - "cross"       : 4-way intersection (crossroad)
   *   - "t-up"/"t-north"     : T-junction with stem pointing north (missing south)
   *   - "t-down"/"t-south"   : T-junction with stem pointing south (missing north)
   *   - "t-left"/"t-west"    : T-junction with stem pointing west (missing east)
   *   - "t-right"/"t-east"   : T-junction with stem pointing east (missing west)
   *
   *   CORNERS (L-shaped, connects two perpendicular directions):
   *   - "corner-up-right"     : Connects north and east (⌐ shape)
   *   - "corner-up-left"      : Connects north and west (┐ shape)
   *   - "corner-down-right"   : Connects south and east (┌ shape)
   *   - "corner-down-left"    : Connects south and west (┘ shape)
   *   - "corner-north-east"   : Alias for corner-up-right
   *   - "corner-north-west"   : Alias for corner-up-left
   *   - "corner-south-east"   : Alias for corner-down-right
   *   - "corner-south-west"   : Alias for corner-down-left
   *
   * EXAMPLES:
   *   "100,50": { biome: "Road", roadDirection: "cross" }         // Crossroad
   *   "110,50": { biome: "Road", roadDirection: "horizontal" }    // Horizontal road
   *   "120,50": { biome: "Road", roadDirection: "t-up" }          // T-junction (stem north)
   *   "130,50": { biome: "Road", roadDirection: "vertical" }      // Vertical road
   *   "140,50": { biome: "Road", roadDirection: "corner-up-right" } // Corner (north-east)
   *   "150,60": { biome: "Forest" }                               // Regular biome, no road
   */

  // Create feature lookup tables once at startup
  const FEATURE_LAYERS = {};
  const FEATURE_ASCII = {};
  const FEATURE_LAYER_MAP = {};

  for (const feature of Features) {
    FEATURE_LAYERS[feature.name] = feature.layer;
    FEATURE_ASCII[feature.name] = feature.ascii;
    if (!FEATURE_LAYER_MAP[feature.layer]) {
      FEATURE_LAYER_MAP[feature.layer] = [];
    }
    FEATURE_LAYER_MAP[feature.layer].push(feature.name);
  }

  // ===== HARDCODED OVERRIDES =====

  /**
   * Check if coordinates have a hardcoded biome override
   * Returns { biome, roadDirection } or null if no override exists
   */
  function getHardcodedBiomeOverride(worldX, worldY) {
    const key = `${worldX},${worldY}`;
    if (HardcodedBiomeOverrides[key]) {
      return HardcodedBiomeOverrides[key];
    }
    return null;
  }

  // ===== BIOME DETECTION =====



  /**
   * Check if biome is a cave biome
   */
  function isCaveBiome(biomeName) {
    return biomeName.toLowerCase().includes("cave");
  }

  /**
   * Check if biome is a mountain surface biome
   */
  function isMountainBiome(biomeName) {
    return biomeName.toLowerCase().includes("mountain");
  }

  /**
   * Check if Fields biome should display as Beach based on water edges/corners
   */
  function shouldDisplayAsBeach(biomeName, adjacentBiomes, diagonalBiomes) {
    if (biomeName !== "Fields") {
      return false;
    }

    // Check if any adjacent biome is water
    if (adjacentBiomes) {
      if (
        (adjacentBiomes.north && isWaterBiome(adjacentBiomes.north)) ||
        (adjacentBiomes.south && isWaterBiome(adjacentBiomes.south)) ||
        (adjacentBiomes.east && isWaterBiome(adjacentBiomes.east)) ||
        (adjacentBiomes.west && isWaterBiome(adjacentBiomes.west))
      ) {
        return true;
      }
    }

    // Check if any diagonal biome is water
    if (diagonalBiomes) {
      if (
        (diagonalBiomes.topLeft && diagonalBiomes.topLeft.length > 0 &&
          diagonalBiomes.topLeft.some((b) => isWaterBiome(b))) ||
        (diagonalBiomes.topRight && diagonalBiomes.topRight.length > 0 &&
          diagonalBiomes.topRight.some((b) => isWaterBiome(b))) ||
        (diagonalBiomes.bottomLeft && diagonalBiomes.bottomLeft.length > 0 &&
          diagonalBiomes.bottomLeft.some((b) => isWaterBiome(b))) ||
        (diagonalBiomes.bottomRight && diagonalBiomes.bottomRight.length > 0 &&
          diagonalBiomes.bottomRight.some((b) => isWaterBiome(b)))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if biome should display as Island (surrounded by 4 Ocean biomes)
   * Virtual biome - affects name, enemies, and battle BG only
   */
  function shouldDisplayAsIsland(biomeName, adjacentBiomes) {
    // Don't display as island if underground (check biomeLayerStack)
    if ($gameSystem._procGenData && $gameSystem._procGenData.biomeLayerStack && $gameSystem._procGenData.biomeLayerStack.length > 0) {
      return false;
    }

    // Only apply to non-water biomes
    if (!adjacentBiomes || isWaterBiome(biomeName)) {
      return false;
    }

    // Check if all 4 cardinal directions are Ocean biomes
    const isNorthOcean = adjacentBiomes.north === "Ocean";
    const isSouthOcean = adjacentBiomes.south === "Ocean";
    const isEastOcean = adjacentBiomes.east === "Ocean";
    const isWestOcean = adjacentBiomes.west === "Ocean";

    if (isNorthOcean && isSouthOcean && isEastOcean && isWestOcean) {
      log(`[shouldDisplayAsIsland] Displaying "${biomeName}" as "Island" (surrounded by Ocean)`);
      return true;
    }

    return false;
  }

  // ===== FEATURE FUNCTIONS =====


  /**
   * Fill layer 0 with terrain features based on weighted density distribution
   * If only one terrain feature exists, it covers the entire layer
   * Otherwise, features are distributed according to their density ratios
   */
  function fillTerrainLayer(mapData, biome, allFeatures, width, height, rng, adjacentBiomes) {
    return runSteps(fillTerrainLayerSteps(mapData, biome, allFeatures, width, height, rng, adjacentBiomes));
  }

  function* fillTerrainLayerSteps(mapData, biome, allFeatures, width, height, rng, adjacentBiomes) {
    const terrainFeatures = getTerrainFeatures(biome);

    if (terrainFeatures.length === 0) {
      log("No terrain features - attempting to borrow from adjacent biomes")

      // Collect terrain features from adjacent biomes
      const borrowedTerrainFeatures = [];

      if (adjacentBiomes) {
        for (const direction of ["north", "south", "east", "west"]) {
          const adjacentBiomeName = adjacentBiomes[direction];
          if (!adjacentBiomeName) continue;

          const adjacentBiome = getBiomeByName(adjacentBiomeName);
          if (!adjacentBiome || !adjacentBiome.features) continue;

          // Get terrain features from adjacent biome
          for (const feature of adjacentBiome.features) {
            const isTerrain = typeof feature === "object" && feature.terrain === true;
            if (!isTerrain) continue;

            const featureName = feature.name;

            // Exclude road and path-related terrain features from borrowing
            const excludedTerrains = ["Road", "DashedLine", "DashedLineHorizontal", "DashedLineVertical", "Path", "PathIce", "PathDesert"];
            if (excludedTerrains.includes(featureName)) continue;

            // Avoid duplicates
            if (!borrowedTerrainFeatures.find(f => f.name === featureName)) {
              borrowedTerrainFeatures.push({
                name: featureName,
                density: feature.density || 1
              });
            }
          }
        }
      }

      if (borrowedTerrainFeatures.length > 0) {
        log(`Borrowed ${borrowedTerrainFeatures.length} terrain features from adjacent biomes: ${borrowedTerrainFeatures.map(f => f.name).join(", ")}`);

        // Use borrowed terrain features with weighted distribution
        const totalDensity = borrowedTerrainFeatures.reduce((sum, f) => sum + f.density, 0);
        const weightedFeatures = [];

        for (const feature of borrowedTerrainFeatures) {
          const weight = Math.round((feature.density / totalDensity) * 1000);
          for (let i = 0; i < weight; i++) {
            weightedFeatures.push(feature.name);
          }
        }

        // Pre-build tile arrays for each borrowed feature
        const featureTiles = {};
        for (const featureName of borrowedTerrainFeatures.map(f => f.name)) {
          featureTiles[featureName] = [];
          if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
            allFeatures[featureName].forEach(variant => {
              if (variant.type === "single") {
                featureTiles[featureName].push(variant.tileId);
              }
            });
          }
          // Fallback to default tile if feature has no variants
          if (featureTiles[featureName].length === 0) {
            featureTiles[featureName].push(2816);
          }
        }

        // Fill layer 0 with weighted random selection from borrowed features
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const selectedFeature = randomChoice(weightedFeatures, rng);
            const selectedTile = randomChoice(featureTiles[selectedFeature], rng);
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = selectedTile;
          }
          if (y % STEP_ROWS === STEP_ROWS - 1) yield;
        }
        return;
      }

      // Final fallback: no adjacent biomes or no terrain features found, fill with Grass or default
      log("No terrain features found in adjacent biomes - using Grass fallback")
      const fallbackTiles = [2816];
      if (allFeatures["Grass"] && allFeatures["Grass"].length > 0) {
        allFeatures["Grass"].forEach(variant => {
          if (variant.type === "single") {
            fallbackTiles.push(variant.tileId);
          }
        });
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = randomChoice(fallbackTiles, rng);
        }
        if (y % STEP_ROWS === STEP_ROWS - 1) yield;
      }
      return;
    }

    if (terrainFeatures.length === 1) {
      log("Single terrain feature")

      // Single terrain feature: covers entire layer
      const featureName = terrainFeatures[0].name;
      const tiles = [];
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        allFeatures[featureName].forEach(variant => {
          if (variant.type === "single") {
            tiles.push(variant.tileId);
          }
        });
      }
      if (tiles.length === 0) tiles.push(2816);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = randomChoice(tiles, rng);
        }
        if (y % STEP_ROWS === STEP_ROWS - 1) yield;
      }
      return;
    }

    // Multiple terrain features: distribute by density
    // Create weighted selection array
    const totalDensity = terrainFeatures.reduce((sum, f) => sum + f.density, 0);
    const weightedFeatures = [];

    for (const feature of terrainFeatures) {
      const weight = Math.round((feature.density / totalDensity) * 1000);
      for (let i = 0; i < weight; i++) {
        weightedFeatures.push(feature.name);
      }
    }

    // Pre-build tile arrays for each feature
    const featureTiles = {};
    for (const featureName of terrainFeatures.map(f => f.name)) {
      featureTiles[featureName] = [];
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        allFeatures[featureName].forEach(variant => {
          if (variant.type === "single") {
            featureTiles[featureName].push(variant.tileId);
          }
        });
      }
      if (featureTiles[featureName].length === 0) {
        featureTiles[featureName].push(2816);
      }
    }

    // Fill layer 0 with weighted random selection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const selectedFeature = randomChoice(weightedFeatures, rng);
        const selectedTile = randomChoice(featureTiles[selectedFeature], rng);
        const idx = calculateIndex(x, y, 0, width, height);
        mapData[idx] = selectedTile;
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
  }

  /**
   * Blend terrain features (layer 0) from adjacent biomes across the map
   * Creates organic, non-triangular gradients using global Perlin noise
   * Excludes Ocean biomes from blending
   * For terrain-only blending (features on layers 1-3 are preserved)
   * Skips blending on water and beach tiles to preserve coastlines
   */
  // The 4-direction blend influence field depends only on tile position and the
  // generation parameters (seed / dimensions / world coords / scale) -- not on
  // the RNG stream, since calculateDirectionalInfluence is pure noise. The road
  // and river passes each call blendBiomesTerrainOnly + blendBiomeBorders back to
  // back with identical parameters, so compute the field once and share it across
  // all four calls instead of recomputing 4 fBm lookups per tile per call.
  const _influenceFieldCache = { key: null, field: null };

  // The single most expensive pass in a square: four fBm lookups on every one of
  // the 4096 tiles. Sliced by rows, and only published to the cache once the
  // whole field is filled, so a cancelled job can never leave a half-computed
  // field behind for the next build to find under the same key.
  function* getInfluenceFieldSteps(width, height, seed, blendScale, worldX, worldY) {
    const key = seed + "|" + width + "|" + height + "|" + worldX + "|" + worldY + "|" + blendScale;
    if (_influenceFieldCache.key === key) return _influenceFieldCache.field;
    const n = width * height;
    const field = {
      north: new Float64Array(n),
      south: new Float64Array(n),
      east: new Float64Array(n),
      west: new Float64Array(n),
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        field.north[idx] = calculateDirectionalInfluence(x, y, "north", width, height, seed, blendScale, worldX, worldY);
        field.south[idx] = calculateDirectionalInfluence(x, y, "south", width, height, seed, blendScale, worldX, worldY);
        field.east[idx] = calculateDirectionalInfluence(x, y, "east", width, height, seed, blendScale, worldX, worldY);
        field.west[idx] = calculateDirectionalInfluence(x, y, "west", width, height, seed, blendScale, worldX, worldY);
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
    _influenceFieldCache.key = key;
    _influenceFieldCache.field = field;
    return field;
  }

  function getInfluenceField(width, height, seed, blendScale, worldX, worldY) {
    return runSteps(getInfluenceFieldSteps(width, height, seed, blendScale, worldX, worldY));
  }

  /**
   * Resolve the road surface and dashed center-line tile IDs for a road biome.
   * Returns null for non-road biomes. Used to protect drawn roads from being
   * overwritten by later terrain/feature blending passes.
   */
  function getRoadProtectTiles(biome, allFeatures) {
    if (!biome || !isRoadBiome(biome.name)) return null;

    let roadTileId = 2816;
    const roadConfig = parseRoadConfig(biome.name);
    if (roadConfig) {
      roadTileId = roadConfig.tileId;
    } else if (allFeatures["Road"] && allFeatures["Road"].length > 0) {
      for (const variant of allFeatures["Road"]) {
        if (variant.type === "single") {
          roadTileId = variant.tileId;
          break;
        }
      }
    }

    // Protect both directional dashed center lines (horizontal + vertical)
    const dashed = getDashedLineTileIds(allFeatures);
    const dashedTileIds = [];
    if (dashed.horizontal != null) dashedTileIds.push(dashed.horizontal);
    if (dashed.vertical != null && dashed.vertical !== dashed.horizontal) dashedTileIds.push(dashed.vertical);
    return { roadTileId, dashedTileIds };
  }

  /**
   * Check whether a position currently holds a road surface tile (layer 0) or a
   * dashed center-line marking (layer 1). Blending must never draw over these.
   */
  function isRoadProtectedPosition(mapData, x, y, width, height, roadProtect) {
    if (!roadProtect) return false;
    const l0 = mapData[calculateIndex(x, y, 0, width, height)];
    if (roadProtect.roadTileId != null && l0 === roadProtect.roadTileId) return true;
    if (roadProtect.dashedTileIds && roadProtect.dashedTileIds.length > 0) {
      const l1 = mapData[calculateIndex(x, y, 1, width, height)];
      if (roadProtect.dashedTileIds.includes(l1)) return true;
    }
    return false;
  }

  function blendBiomesTerrainOnly(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords = { x: 0, y: 0 }, waterTiles = []) {
    return runSteps(blendBiomesTerrainOnlySteps(
      mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, waterTiles
    ));
  }

  function* blendBiomesTerrainOnlySteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords = { x: 0, y: 0 }, waterTiles = []) {
    if (!adjacentBiomes) return;

    // Open water is never blended, in either direction: the sea is water end to
    // end, and land terrain scattered into it -- or its water scattered onto a
    // shore the coastline pass has already drawn -- is the very seam this avoids.
    // The sea floor is spelled "SeaBed" in Biomes.json, so it is matched through
    // isSeabedBiomeName rather than by a literal that never equalled the name.
    if (biome.name === "Ocean" || isSeabedBiomeName(biome.name)) return;

    const allAdjacentBiomes = {};

    for (const [direction, biomeName] of Object.entries(adjacentBiomes)) {
      if (!biomeName || biomeName === "Ocean" || isSeabedBiomeName(biomeName)) continue;

      const adjacentBiome = getBiomeByName(biomeName);
      if (!adjacentBiome) continue;

      allAdjacentBiomes[direction] = adjacentBiome;
    }

    const blendScale = 0.02; // Perlin noise scale for smooth gradients
    const worldX = worldCoords.x || 0;
    const worldY = worldCoords.y || 0;
    const influenceField = yield* getInfluenceFieldSteps(width, height, seed, blendScale, worldX, worldY);

    // Never overwrite drawn road surfaces or dashed lines with blended terrain
    const roadProtect = getRoadProtectTiles(biome, allFeatures);

    // Blend terrain (layer 0) using global Perlin noise for each direction
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (isRoadProtectedPosition(mapData, x, y, width, height, roadProtect)) continue;
        // Calculate blend influence from each adjacent biome direction using global noise
        const influences = [];

        if (allAdjacentBiomes.north) {
          const influence = influenceField.north[idx];
          if (influence > 0) influences.push({ direction: "north", biome: allAdjacentBiomes.north, value: influence });
        }
        if (allAdjacentBiomes.south) {
          const influence = influenceField.south[idx];
          if (influence > 0) influences.push({ direction: "south", biome: allAdjacentBiomes.south, value: influence });
        }
        if (allAdjacentBiomes.east) {
          const influence = influenceField.east[idx];
          if (influence > 0) influences.push({ direction: "east", biome: allAdjacentBiomes.east, value: influence });
        }
        if (allAdjacentBiomes.west) {
          const influence = influenceField.west[idx];
          if (influence > 0) influences.push({ direction: "west", biome: allAdjacentBiomes.west, value: influence });
        }

        // Sort by influence strength (highest first)
        influences.sort((a, b) => b.value - a.value);

        // Blend from the strongest adjacent biome if influence is high enough
        if (influences.length > 0 && rng() < influences[0].value) {
          blendTerrainTileFromAdjacentBiome(mapData, x, y, influences[0].biome, allFeatures, width, height, rng, waterTiles);
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
  }

  /**
   * Blend a single terrain tile (layer 0 only) from an adjacent biome
   * Only modifies layer 0 (terrain), preserves features on other layers
   * Excludes road-related terrain features (Road, Path, Sidewalk, DashedLine)
   * Skips blending on water and beach tiles to preserve coastlines
   */
  function blendTerrainTileFromAdjacentBiome(mapData, x, y, adjacentBiome, allFeatures, width, height, rng, waterTiles = []) {
    // Skip blending on beach tiles to preserve coastlines
    // Check if current tile matches any protected beach/water tile IDs
    const baseIdx = calculateIndex(x, y, 0, width, height);
    const baseTile = mapData[baseIdx];

    if (waterTiles.length > 0 && waterTiles.includes(baseTile)) {
      return;
    }

    // Also check beach coordinates as a fallback
    const beachCoordinates = window.ProcGenUtils?.beachCoordinates;
    if (beachCoordinates && beachCoordinates.has(`${x},${y}`)) {
      return;
    }

    const terrainFeatures = getTerrainFeatures(adjacentBiome);

    if (terrainFeatures.length === 0) return;

    // Filter out road-related terrain features from blending and only allow features present in the current map's tileset
    const excludedTerrains = ["Road", "Path", "Sidewalk", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"];
    const blendableTerrains = terrainFeatures.filter(
      f => !excludedTerrains.includes(f.name) &&
           allFeatures[f.name] &&
           allFeatures[f.name].some(v => v.type === "single" && v.tileId)
    );

    if (blendableTerrains.length === 0) return;

    // Select a random terrain feature from the adjacent biome (excluding road features) using current tileset features
    const selectedTerrain = getWeightedTerrainFeature(blendableTerrains, allFeatures, rng);
    if (!selectedTerrain) return;

    // Apply to layer 0 only
    mapData[baseIdx] = selectedTerrain;
  }

  /**
   * Blend biomes across entire map using global Perlin noise for smooth transitions
   * Creates organic, non-triangular gradients from adjacent biomes
   * Does NOT blend from Road or Ocean biomes
   * For Road and River biomes: allow blending from Fields biomes (both terrain and features)
   * Ensures no empty tiles are placed
   * Road biomes get terrain blending AND feature placement (B sheet features only)
   * Skips blending on water and beach tiles to preserve coastlines
   */
  function blendBiomeBorders(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords = { x: 0, y: 0 }, waterTiles = [], keepOutMask = null) {
    return runSteps(blendBiomeBordersSteps(
      mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, waterTiles, keepOutMask
    ));
  }

  function* blendBiomeBordersSteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords = { x: 0, y: 0 }, waterTiles = [], keepOutMask = null) {
    if (!adjacentBiomes) return;

    const blendScale = 0.02; // Perlin noise scale for smooth gradients
    const isCurrentBiomeRoad = isRoadBiome(biome.name);
    const isCurrentBiomeRiver = isRiverBiome(biome.name);
    // Never overwrite drawn road surfaces or dashed lines with blended features
    const roadProtect = getRoadProtectTiles(biome, allFeatures);
    const worldX = worldCoords.x || 0;
    const worldY = worldCoords.y || 0;

    // Road and Ocean are excluded for all biomes
    // Fields is excluded for normal biomes but allowed for Road and River biomes
    const excludedBiomes = ["Road", "Ocean"];
    if (!isCurrentBiomeRoad && !isCurrentBiomeRiver) {
      excludedBiomes.push("Fields");
    }

    const influenceField = yield* getInfluenceFieldSteps(width, height, seed, blendScale, worldX, worldY);

    // Iterate through entire map
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        // Caller-supplied no-build zone (the road keep-out margin) wins outright
        if (keepOutMask && keepOutMask[idx]) continue;
        // Calculate blend influence from each adjacent biome direction using global noise
        const northInfluence = influenceField.north[idx];
        const southInfluence = influenceField.south[idx];
        const eastInfluence = influenceField.east[idx];
        const westInfluence = influenceField.west[idx];

        // Total influence from all directions
        const totalInfluence = northInfluence + southInfluence + eastInfluence + westInfluence;

        // Determine which adjacent biome to blend from based on weighted influence
        if (totalInfluence > 0 && rng() < Math.min(totalInfluence, 1)) {
          const influences = [
            { direction: "north", value: northInfluence, biomeName: adjacentBiomes.north },
            { direction: "south", value: southInfluence, biomeName: adjacentBiomes.south },
            { direction: "east", value: eastInfluence, biomeName: adjacentBiomes.east },
            { direction: "west", value: westInfluence, biomeName: adjacentBiomes.west },
          ];

          // Sort by influence to use strongest adjacent biome
          influences.sort((a, b) => b.value - a.value);

          // Find first valid adjacent biome (not excluded and matching tileset)
          // For road/river biomes: allow blending from any adjacent biome including Fields (tileset check skipped)
          for (const inf of influences) {
            if (inf.value > 0 && inf.biomeName && !excludedBiomes.includes(inf.biomeName)) {
              const adjacentBiome = getBiomeByName(inf.biomeName);
              // For road/river biomes, skip tileset check since we want to blend from all neighbors
              if (adjacentBiome && (isCurrentBiomeRoad || isCurrentBiomeRiver || adjacentBiome.tilesetId === biome.tilesetId)) {
                blendTileFromAdjacentBiome(mapData, x, y, adjacentBiome, allFeatures, width, height, rng, isCurrentBiomeRoad, waterTiles, roadProtect);
                break;
              }
            }
          }
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
  }


  /**
   * Check if a tile ID belongs to the B sheet (common across all tilesets)
   * B sheet tiles range from 0-255 (B1-B256)
   */
  function isBSheetTile(tileId) {
    return tileId >= 0 && tileId < 256;
  }

  /**
   * Blend a single tile from an adjacent biome
   * Ensures a valid tile is always placed (never empty)
   * Features from adjacent biomes are placed with reduced density
   * For road biomes: blend features everywhere except ON the road tiles
   * For road biomes: only blend B sheet non-terrain features (common across all tilesets)
   * Skips blending on water and beach tiles to preserve coastlines
   */
  function blendTileFromAdjacentBiome(mapData, x, y, adjacentBiome, allFeatures, width, height, rng, isCurrentBiomeRoad = false, waterTiles = [], roadProtect = null) {
    // Never draw over an actual road surface or dashed center line
    if (isRoadProtectedPosition(mapData, x, y, width, height, roadProtect)) {
      return;
    }

    // For road biomes, check if this position is ON the road - if so, skip blending entirely
    if (isCurrentBiomeRoad && isPositionOnRoadTile(x, y, width, height)) {
      return;
    }

    // Skip blending on beach tiles to preserve coastlines
    // Check if current tile matches any protected beach/water tile IDs
    const baseIdx = calculateIndex(x, y, 0, width, height);
    const baseTile = mapData[baseIdx];

    if (waterTiles.length > 0 && waterTiles.includes(baseTile)) {
      return;
    }

    // Also check beach coordinates as a fallback
    const beachCoordinates = window.ProcGenUtils?.beachCoordinates;
    if (beachCoordinates && beachCoordinates.has(`${x},${y}`)) {
      return;
    }

    const terrainFeatures = getTerrainFeatures(adjacentBiome);

    // 40% chance to blend terrain (layer 0) - but ONLY on road maps if not on road tile
    if (terrainFeatures.length > 0 && rng() < 0.4) {
      const excludedTerrains = ["Road", "Path", "Sidewalk", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"];
      const blendableTerrains = terrainFeatures.filter(
        f => !excludedTerrains.includes(f.name) &&
             allFeatures[f.name] &&
             allFeatures[f.name].some(v => v.type === "single" && v.tileId)
      );
      if (blendableTerrains.length > 0) {
        const selectedTerrain = getWeightedTerrainFeature(blendableTerrains, allFeatures, rng);
        if (selectedTerrain) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = selectedTerrain;
          return;
        }
      }
    }

    // Blend features from layer 2 (objects) with reduced density
    const regularFeatures = getFeaturesByLayer(adjacentBiome, allFeatures, 2, FEATURE_LAYERS);

    // Filter out road-related features from adjacent biomes
    const excludedFeatures = ["Road", "Path", "Sidewalk", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"];
    const blendableFeatures = regularFeatures.filter(
      f => !excludedFeatures.includes(f.name) &&
           allFeatures[f.name] &&
           allFeatures[f.name].some(v => v.type === "single" && v.tileId)
    );

    if (blendableFeatures.length > 0) {
      // Only 25% chance to even attempt feature blending (much less dense than original)
      if (rng() < 0.25) {
        const selectedFeature = randomChoice(blendableFeatures, rng);
        const featureVariants = allFeatures[selectedFeature.name];

        if (featureVariants && featureVariants.length > 0) {
          const variant = getRandomFeatureVariant(featureVariants, rng);
          if (variant && variant.type === "single" && variant.tileId) {
            // For road biomes: only place B sheet tiles (common across all tilesets)
            if (isCurrentBiomeRoad && !isBSheetTile(variant.tileId)) {
              return; // Skip non-B sheet features on road biomes
            }

            const idx = calculateIndex(x, y, 2, width, height);
            const currentTile = mapData[idx];

            // Check if tile is already occupied by a feature on the same layer
            const tileOccupied = isTileOccupiedOnLayer(mapData, x, y, 2, width, height);

            // Only place if no feature exists, or 30% chance to overwrite (reduced from 60%)
            if (!tileOccupied && (currentTile === 0 || rng() < 0.3)) {
              mapData[idx] = variant.tileId;
            }
          }
        }
      }
    }
  }



  // ===== ROAD GENERATION WRAPPER =====

  // How far from the carriageway (in tiles) features must stay clear.
  const ROAD_FEATURE_MARGIN = 3;

  /**
   * The biome definition a road map is laid over, recorded from the world-map
   * column in prepareProceduralGeneration. Null when the road is not over
   * anything usable (bare road column, or a settlement, which is filtered out
   * there so roads through towns keep their plain civic look).
   */
  function getUnderlyingTerrainBiome(roadBiome) {
    if (!roadBiome || !isRoadBiome(roadBiome.name)) return null;
    const name =
      ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentUnderBiome) || null;
    if (!name || name === roadBiome.name) return null;
    const under = getBiomeByName(name);
    return under && under.features ? under : null;
  }

  /**
   * Weighted pool of layer-0 tile ids for a biome's terrain features, resolved
   * against `allFeatures`. Road/path terrains are excluded: the carriageway is
   * drawn separately and must not be scattered around as ground.
   * Returns an empty array when none of the features exist in the tileset.
   */
  function collectTerrainTilePool(sourceBiome, allFeatures) {
    const excludedTerrains = [
      "Road", "Path", "PathIce", "PathDesert", "Sidewalk",
      "DashedLine", "DashedLineHorizontal", "DashedLineVertical",
    ];
    const pool = [];
    for (const feature of getTerrainFeatures(sourceBiome)) {
      if (excludedTerrains.includes(feature.name)) continue;
      const variants = allFeatures[feature.name];
      if (!variants) continue;
      const tiles = variants.filter((v) => v.type === "single").map((v) => v.tileId);
      if (tiles.length === 0) continue;
      // Density drives how much of the ground this terrain covers.
      const weight = Math.max(1, Math.round((feature.density || 1) * 10));
      for (let i = 0; i < weight; i++) pool.push(tiles);
    }
    return pool;
  }

  /**
   * Mark every tile holding road surface or a dashed centre line, plus a margin
   * of `margin` tiles around it, as off limits for feature placement. Keeps
   * trees and rocks off the carriageway and out of the shoulder.
   *
   * @returns {Uint8Array} width*height mask, 1 = do not place anything here
   */
  function buildRoadKeepOutMask(mapData, width, height, roadProtect, margin) {
    const mask = new Uint8Array(width * height);
    if (!roadProtect) return mask;

    const road = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isRoadProtectedPosition(mapData, x, y, width, height, roadProtect)) {
          road.push(x, y);
        }
      }
    }

    for (let i = 0; i < road.length; i += 2) {
      const rx = road[i];
      const ry = road[i + 1];
      const y0 = Math.max(0, ry - margin);
      const y1 = Math.min(height - 1, ry + margin);
      const x0 = Math.max(0, rx - margin);
      const x1 = Math.min(width - 1, rx + margin);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) mask[y * width + x] = 1;
      }
    }
    return mask;
  }

  /**
   * Generate procedural terrain for a road biome
   * Uses road generation utilities from ProceduralMapRoadGenerator
   * Handles water edge drawing and biome blending
   */
  function generateRoadBiome(biome, seed, allFeatures, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache) {
    return runSteps(generateRoadBiomeSteps(
      biome, seed, allFeatures, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache
    ));
  }

  function* generateRoadBiomeSteps(biome, seed, allFeatures, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const mapData = new Array(width * height * 4).fill(0);
    const rng = createSeededRandom(seed);

    let roadTileId = 2816;
    const roadConfig = parseRoadConfig(biome.name);

    if (roadConfig) {
      roadTileId = roadConfig.tileId;
    } else if (allFeatures["Road"] && allFeatures["Road"].length > 0) {
      // Extract first single-tile variant from Road feature
      for (const variant of allFeatures["Road"]) {
        if (variant.type === "single") {
          roadTileId = variant.tileId;
          break;
        }
      }
    }

    // Get orientation-specific dashed center-line tile IDs for road markings
    const dashedLines = getDashedLineTileIds(allFeatures);

    // The terrain biome this road is painted over on the world map, if any.
    // Its features dress the verges so a road through a forest reads as a road
    // through a forest. Resolved against the ROAD tileset's own feature table
    // (`allFeatures`): the road tileset shares only A2/A5/B with the terrain
    // tilesets, and its C/D/E sheets hold road prefab graphics, so anything the
    // road tileset does not define is simply skipped rather than drawn as a
    // stray gas-station tile.
    const underBiome = getUnderlyingTerrainBiome(biome);

    // Store adjacent biome terrain data for use AFTER road generation
    // This ensures terrain blending doesn't overwrite the roads themselves
    const adjacentTerrainTiles = {
      north: [],
      south: [],
      east: [],
      west: [],
    };

    // Collect terrain features from each adjacent biome
    if (adjacentBiomes) {
      for (const [direction, biomeName] of Object.entries(adjacentBiomes)) {
        if (!biomeName) continue;

        const adjacentBiome = getBiomeByName(biomeName);
        if (!adjacentBiome || !adjacentBiome.features) continue;

        // Get terrain features from adjacent biome
        for (const feature of adjacentBiome.features) {
          const featureName = typeof feature === "string" ? feature : feature.name;
          const isTerrain = typeof feature === "object" && feature.terrain === true;

          // Exclude road-related terrain features from blending
          const excludedTerrains = ["Road", "Path", "Sidewalk", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"];

          // Only include terrain features (not road-related). Resolved against
          // the ROAD tileset's own feature table, like everything else drawn on
          // this square: a neighbour's tile id means nothing under a tileset
          // that does not hold it, and borrowing one drew stray graphics.
          if (isTerrain && !excludedTerrains.includes(featureName) && allFeatures[featureName]) {
            for (const variant of allFeatures[featureName]) {
              if (variant.type === "single" && variant.tileId) {
                adjacentTerrainTiles[direction].push(variant.tileId);
              }
            }
          }
        }
      }
    }

    // Initialize map with fallback terrain before drawing roads
    // This will be visible only in areas outside the road
    //
    // When the road runs across a known terrain biome, that biome's own ground
    // is the base: a road over Desert lies on sand, not on the generic grass the
    // adjacent-biome mix used to fall back to. Blending from the neighbours
    // still runs afterwards, so borders stay soft.
    const underTerrainPool = underBiome ? collectTerrainTilePool(underBiome, allFeatures) : [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);

        if (underTerrainPool.length > 0) {
          mapData[idx] = randomChoice(randomChoice(underTerrainPool, rng), rng);
          continue;
        }

        const distFromTop = y;
        const distFromBottom = height - 1 - y;
        const distFromLeft = x;
        const distFromRight = width - 1 - x;

        // Determine which adjacent biome is closest based on position
        // North edge: top rows
        if (distFromTop <= distFromBottom && distFromTop <= distFromLeft && distFromTop <= distFromRight && adjacentTerrainTiles.north.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.north, rng);
        }
        // South edge: bottom rows
        else if (distFromBottom <= distFromTop && distFromBottom <= distFromLeft && distFromBottom <= distFromRight && adjacentTerrainTiles.south.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.south, rng);
        }
        // East edge: right columns
        else if (distFromRight <= distFromTop && distFromRight <= distFromBottom && distFromRight <= distFromLeft && adjacentTerrainTiles.east.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.east, rng);
        }
        // West edge: left columns
        else if (distFromLeft <= distFromTop && distFromLeft <= distFromBottom && distFromLeft <= distFromRight && adjacentTerrainTiles.west.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.west, rng);
        }
        // Center: use a mix of all available terrains, or fallback to Grass
        else {
          let availableTiles = [];
          for (const tiles of Object.values(adjacentTerrainTiles)) {
            availableTiles = availableTiles.concat(tiles);
          }

          if (availableTiles.length > 0) {
            mapData[idx] = randomChoice(availableTiles, rng);
          } else {
            // Fallback to Grass if no terrain features found
            const grassTiles = [];
            if (allFeatures["Grass"] && allFeatures["Grass"].length > 0) {
              for (const variant of allFeatures["Grass"]) {
                if (variant.type === "single") {
                  grassTiles.push(variant.tileId);
                }
              }
            }
            mapData[idx] = grassTiles.length > 0 ? randomChoice(grassTiles, rng) : 2816;
          }
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }

    // Draw water edges if adjacent to water biomes
    let waterTiles = [];
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTiles.push(variant.tileId);
          }
        }
        if (waterTiles.length > 0) break;
      }
    }

    // Coastlines: sea, sand and the diagonal corners are drawn in one pass, so
    // the shore is a single curve the neighbouring squares reproduce tile for
    // tile at the seam. Only on non-cave biomes.
    if (!isCaveBiome(biome.name) && waterTiles.length > 0) {
      drawWaterEdges(
        mapData,
        waterTiles,
        adjacentBiomes,
        seed,
        width,
        height,
        rng,
        cacheInfo,
        allFeatures,
        biome.name,
        {
          worldCoords,
          diagonalBiomes: cache
            ? checkDiagonalMapBiomesFromCache(worldCoords?.x || 0, worldCoords?.y || 0, cache)
            : null,
        }
      );
    }

    // After drawing water edges and corners, collect actual beach/water tile IDs
    // Only collect tiles that are at beach coordinates to avoid blocking all terrain blending
    const actualWaterAndBeachTiles = new Set();
    const beachCoords = window.ProcGenUtils?.beachCoordinates;
    if (beachCoords) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Only protect tiles the coastline pass actually drew (sea + sand)
          if (beachCoords.has(`${x},${y}`)) {
            const baseIdx = calculateIndex(x, y, 0, width, height);
            const tileId = mapData[baseIdx];
            if (tileId > 0) {
              actualWaterAndBeachTiles.add(tileId);
            }
          }
        }
      }
    }
    const actualWaterTilesArray = Array.from(actualWaterAndBeachTiles);

    yield;

    // Use road drawing utilities from ProceduralMapRoadGenerator
    generateRoadBiomeUtil(mapData, biome, roadTileId, roadDirection, dashedLines, width, height, adjacentBiomes);

    // Nothing may be placed on the carriageway or within ROAD_FEATURE_MARGIN
    // tiles of it: a tree on the shoulder blocks the lane the cars drive in and
    // reads as an obstacle rather than scenery.
    const roadProtect = getRoadProtectTiles(biome, allFeatures);
    const roadKeepOut = buildRoadKeepOutMask(mapData, width, height, roadProtect, ROAD_FEATURE_MARGIN);

    // Blend terrain from adjacent biomes into road borders
    // Use the actual water tiles to avoid overwriting beaches
    yield* blendBiomesTerrainOnlySteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, actualWaterTilesArray);

    // Blend non-terrain features from adjacent biomes (only B sheet tiles)
    // Use the actual water tiles collected from the map after drawWaterEdges
    yield* blendBiomeBordersSteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, actualWaterTilesArray, roadKeepOut);

    // Dress the verges with the underlying biome's own features (trees, rocks,
    // weeds...). Prefabs are deliberately NOT taken from that biome: a road map
    // only ever places the road biome's own prefabs.
    if (underBiome) {
      const roadPathTiles = [];
      for (const featureName of ["Path", "PathDesert", "PathIce", "Road", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"]) {
        if (!allFeatures[featureName]) continue;
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") roadPathTiles.push(variant.tileId);
        }
      }

      for (const feature of getFeaturesByLayer(underBiome, allFeatures, 1, FEATURE_LAYERS)) {
        yield* generateFeatureNoiseSteps(
          mapData, allFeatures[feature.name], 1, width, height, seed,
          0.15 * feature.density, rng, actualWaterTilesArray, roadPathTiles, roadKeepOut
        );
      }

      for (const feature of getFeaturesByLayer(underBiome, allFeatures, 2, FEATURE_LAYERS)) {
        yield* generateFeatureScatteredSteps(
          mapData, allFeatures[feature.name], 2, width, height, seed,
          0.05 * feature.density, rng, actualWaterTilesArray, roadPathTiles, roadKeepOut
        );
      }
    }

    // A lay-by: one or two parking signs on the verge. A settlement gets its
    // camper-recall sign from its own generator; out on the open road this is
    // also what RoadCarAI reads to decide where a car may pull over and let its
    // driver out, so a highway has somewhere to stop rather than nowhere.
    yield;

    placeCivicSigns(mapData, biome, allFeatures, seed, { park: [1, 2] });

    // Create region data for water tile detection in MovementInteractionSystem
    const regiondata = new Array(width * height).fill(0);

    // Identify water tile IDs from the biome features
    let waterTileIds = new Set();
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIds.add(variant.tileId);
          }
        }
      }
    }

    // Mark all water tiles with region ID 99 for MovementInteractionSystem detection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];

        if (waterTileIds.has(tileId)) {
          const regionIdx = y * width + x;
          regiondata[regionIdx] = 99;
        }
      }
    }

    // The verge closes in over the carriageway, thicker every year from 2001
    // (ProcGenDungeon.overgrowMapData / cityOvergrowth). It grows on the road
    // itself, unlike the ordinary verge dressing above, which is deliberately
    // kept ROAD_FEATURE_MARGIN tiles clear: the difference is that only
    // walk-through plants are used on a carriageway, so a lane is never blocked
    // and RoadCarAI still has a road to drive on.
    yield;

    if (window.ProcGenDungeon && window.ProcGenDungeon.overgrowMapData) {
      window.ProcGenDungeon.overgrowMapData(
        mapData, width, height, allFeatures,
        biome && biome.tilesetId, seed);
    }

    // Attach region data to map data for $gameMap.regionId() calls
    mapData.regiondata = regiondata;

    return mapData;
  }

  // ===== ROAD / RIVER SPANNING ADJACENCY =====

  /**
   * Copy an adjacency table with two opposite sides forced to a connectable
   * biome, so the road/river generators run that axis border to border instead
   * of terminating it in a rounded dead-end head at the map centre.
   */
  function spanningAdjacency(base, sideA, sideB, value) {
    const adj = Object.assign(
      { north: null, south: null, east: null, west: null },
      base || {}
    );
    adj[sideA] = value;
    adj[sideB] = value;
    return adj;
  }

  /**
   * Force a linear road to cross its own tile.
   *
   * The world-map road network is drawn as a stair-stepped diagonal, so a road
   * tile's neighbours along its own axis are frequently plain terrain rather
   * than another road: 17% of road tiles on map 315 have no orthogonal road
   * neighbour on their axis at all, and only 40% have one at both ends. The
   * dead-end logic then collapsed those maps to a stub and no road (and so no
   * dashed centre line) was drawn. A road tile means the carriageway passes
   * through, so its own axis is always opened.
   *
   * Intersections (cross / t- / corner) already open their arms at the border,
   * so their adjacency is left untouched.
   */
  function spanningRoadAdjacency(base, direction) {
    const d = (direction || "").toLowerCase();
    if (d.includes("cross") || d.includes("t-") || d.includes("corner-")) {
      return base;
    }
    return d.includes("vertical")
      ? spanningAdjacency(base, "north", "south", "Road")
      : spanningAdjacency(base, "east", "west", "Road");
  }

  // ===== BRIDGE GENERATION WRAPPER =====

  /**
   * Generate a river crossing for a world-map bridge marker.
   *
   * The two generators are run in order so the deck ends up on top:
   *   1. the river generator lays down the banks and the water channel, running
   *      perpendicular to the bridge, and
   *   2. the road generator draws the carriageway over it along the bridge's own
   *      orientation, replacing the water it spans with road.
   *
   * The result is a road that crosses the channel instead of being flooded by
   * it, which is what the old road/river biome overlap produced.
   *
   * @param {string} bridgeDirection - "vertical" or "horizontal" (the road's run)
   */
  function generateBridgeBiome(biome, seed, allFeatures, bridgeDirection, adjacentBiomes, cacheInfo, worldCoords, cache) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;

    // The river always crosses the bridge, so it runs the other way.
    const isVerticalBridge = bridgeDirection === "vertical";
    const riverDirection = isVerticalBridge ? "horizontal" : "vertical";

    // Both generators dead-end an axis whose neighbouring biome does not continue
    // it. On a crossing that is always wrong: half the world-map bridges sit
    // between plain Fields tiles, so the deck collapsed to a stub and no road was
    // visible at all. A bridge spans by definition, so force the two axes open and
    // keep the real neighbours on the other sides for bank/verge blending.
    const riverAdjacent = isVerticalBridge
      ? spanningAdjacency(adjacentBiomes, "east", "west", "River")
      : spanningAdjacency(adjacentBiomes, "north", "south", "River");
    const roadAdjacent = isVerticalBridge
      ? spanningAdjacency(adjacentBiomes, "north", "south", "Road")
      : spanningAdjacency(adjacentBiomes, "east", "west", "Road");

    // 1. River first: banks + water channel, running bank to bank.
    const mapData = generateRiverBiome(
      biome, seed, allFeatures, riverDirection, riverAdjacent, cacheInfo, worldCoords, cache
    );

    // 2. Road over it: same tile selection the plain road biome uses.
    let roadTileId = 2816;
    const roadConfig = parseRoadConfig(biome.name);
    if (roadConfig) {
      roadTileId = roadConfig.tileId;
    } else if (allFeatures["Road"] && allFeatures["Road"].length > 0) {
      for (const variant of allFeatures["Road"]) {
        if (variant.type === "single") {
          roadTileId = variant.tileId;
          break;
        }
      }
    }

    const dashedLines = getDashedLineTileIds(allFeatures);
    generateRoadBiomeUtil(mapData, biome, roadTileId, bridgeDirection, dashedLines, width, height, roadAdjacent);

    log(`[ProceduralMapBiomeGenerator] Bridge: ${bridgeDirection} road over ${riverDirection} river`);

    return mapData;
  }

  // ===== RIVER GENERATION WRAPPER =====

  /**
   * Generate procedural terrain for a river biome
   * Uses river generation utilities from ProceduralMapRiverGenerator
   * Handles water edge drawing and biome blending
   */
  function generateRiverBiome(biome, seed, allFeatures, riverDirection, adjacentBiomes, cacheInfo, worldCoords, cache) {
    return runSteps(generateRiverBiomeSteps(
      biome, seed, allFeatures, riverDirection, adjacentBiomes, cacheInfo, worldCoords, cache
    ));
  }

  function* generateRiverBiomeSteps(biome, seed, allFeatures, riverDirection, adjacentBiomes, cacheInfo, worldCoords, cache) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const mapData = new Array(width * height * 4).fill(0);
    const rng = createSeededRandom(seed);

    let riverTileId = 2816;
    const riverConfig = parseRiverConfig(biome.name);

    if (riverConfig) {
      riverTileId = riverConfig.tileId;
    } else if (allFeatures["Water"] && allFeatures["Water"].length > 0) {
      // Extract first single-tile variant from Water feature
      for (const variant of allFeatures["Water"]) {
        if (variant.type === "single") {
          riverTileId = variant.tileId;
          break;
        }
      }
    }

    // Get terrain features from adjacent biomes (north, south, east, west)
    // Terrain features are those with terrain: true
    const adjacentTerrainTiles = {
      north: [],
      south: [],
      east: [],
      west: [],
    };

    // Collect terrain features from each adjacent biome
    if (adjacentBiomes) {
      for (const [direction, biomeName] of Object.entries(adjacentBiomes)) {
        if (!biomeName) continue;

        const adjacentBiome = getBiomeByName(biomeName);
        if (!adjacentBiome || !adjacentBiome.features) continue;

        // Get terrain features from adjacent biome
        for (const feature of adjacentBiome.features) {
          const featureName = typeof feature === "string" ? feature : feature.name;
          const isTerrain = typeof feature === "object" && feature.terrain === true;

          // Exclude road-related terrain features and water features from blending
          const excludedTerrains = ["Road", "Path", "Sidewalk", "DashedLine", "DashedLineHorizontal", "DashedLineVertical", "Water", "RiverEdge"];

          // Only include terrain features (not road-related or water features)
          if (isTerrain && !excludedTerrains.includes(featureName) && allFeatures[featureName]) {
            for (const variant of allFeatures[featureName]) {
              if (variant.type === "single" && variant.tileId) {
                adjacentTerrainTiles[direction].push(variant.tileId);
              }
            }
          }
        }
      }
    }

    // Fill terrain layer with adjacent biome terrain based on distance from edge
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);

        // Determine which adjacent biome is closest based on position
        // North edge: top rows
        if (y < height / 4 && adjacentTerrainTiles.north.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.north, rng);
        }
        // South edge: bottom rows
        else if (y >= (height * 3) / 4 && adjacentTerrainTiles.south.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.south, rng);
        }
        // East edge: right columns
        else if (x >= (width * 3) / 4 && adjacentTerrainTiles.east.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.east, rng);
        }
        // West edge: left columns
        else if (x < width / 4 && adjacentTerrainTiles.west.length > 0) {
          mapData[idx] = randomChoice(adjacentTerrainTiles.west, rng);
        }
        // Center: use a mix of all available terrains, or fallback to Grass
        else {
          let availableTiles = [];
          for (const tiles of Object.values(adjacentTerrainTiles)) {
            availableTiles = availableTiles.concat(tiles);
          }

          if (availableTiles.length > 0) {
            mapData[idx] = randomChoice(availableTiles, rng);
          } else {
            // Fallback to Grass if no terrain features found
            const grassTiles = [];
            if (allFeatures["Grass"] && allFeatures["Grass"].length > 0) {
              for (const variant of allFeatures["Grass"]) {
                if (variant.type === "single") {
                  grassTiles.push(variant.tileId);
                }
              }
            }
            mapData[idx] = grassTiles.length > 0 ? randomChoice(grassTiles, rng) : 2816;
          }
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }

    // Use river drawing utilities from ProceduralMapRiverGenerator.
    // Pass the full feature set so the river can place reeds/rocks/grass-water,
    // and the adjacent biomes + seed so it can dead-end at unconnected sides.
    generateRiverBiomeUtil(mapData, biome, riverTileId, riverDirection, allFeatures, width, height, adjacentBiomes, seed, rng);

    // After drawing river, collect actual beach/water tile IDs so the blend
    // passes never drop foreign terrain/features onto the water. On a river map
    // the whole river surface must stay water with only its own reed/rock
    // decoration, so the river tile itself and every Water/Ocean/Beach tile are
    // protected in addition to the beach-coordinate tiles.
    const actualWaterAndBeachTiles = new Set();
    actualWaterAndBeachTiles.add(riverTileId);
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single" && variant.tileId) {
            actualWaterAndBeachTiles.add(variant.tileId);
          }
        }
      }
    }
    const beachCoords = window.ProcGenUtils?.beachCoordinates;
    if (beachCoords) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Only protect tiles the coastline pass actually drew (sea + sand)
          if (beachCoords.has(`${x},${y}`)) {
            const baseIdx = calculateIndex(x, y, 0, width, height);
            const tileId = mapData[baseIdx];
            if (tileId > 0) {
              actualWaterAndBeachTiles.add(tileId);
            }
          }
        }
      }
    }
    const actualWaterTilesArray = Array.from(actualWaterAndBeachTiles);

    // Blend terrain from adjacent biomes into river borders
    // Use the actual water tiles to avoid overwriting beaches
    yield* blendBiomesTerrainOnlySteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, actualWaterTilesArray);

    // Blend non-terrain features from adjacent biomes (excluding road features)
    // Use the actual water tiles collected from the map after river generation
    yield* blendBiomeBordersSteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, actualWaterTilesArray);

    yield;

    // Create region data for water tile detection in MovementInteractionSystem
    const regiondata = new Array(width * height).fill(0);

    // Identify water tile IDs from the biome features
    let waterTileIds = new Set();
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIds.add(variant.tileId);
          }
        }
      }
    }

    // Mark all water tiles with region ID 99 for MovementInteractionSystem detection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];

        if (waterTileIds.has(tileId)) {
          const regionIdx = y * width + x;
          regiondata[regionIdx] = 99;
        }
      }
    }

    // Attach region data to map data for $gameMap.regionId() calls
    mapData.regiondata = regiondata;

    return mapData;
  }

  // ===== MAIN TERRAIN GENERATION =====

  /**
   * Generate procedural terrain for a biome
   */

  /**
   * Select feature variants for cave biome
   * For features appearing multiple times, randomly selects 1-4 variants to use
   * Only processes features listed in the biome definition
   * Returns map of feature name to array of selected variants
   */
  function selectCaveFeatureVariants(biome, allFeatures, seed) {
    const selectedVariants = {};
    const rng = createSeededRandom(seed);

    // Get only the features specified in the biome definition
    const biomeFeatureNames = biome.features
      .map(f => typeof f === 'string' ? f : f.name)
      .filter(name => !["CaveFloor", "Ceiling", "CaveWall"].includes(name));

    // For each feature in the biome, select 1-4 variants
    for (const featureName of biomeFeatureNames) {
      const variants = allFeatures[featureName];
      if (!variants || variants.length === 0) continue;

      // Determine number of variants to use (1-4, or all if less than 4)
      const maxVariants = Math.min(variants.length, 4);
      const numVariantsToUse = Math.floor(rng() * maxVariants) + 1;

      // Shuffle variants and select top N
      const shuffled = [...variants];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      selectedVariants[featureName] = shuffled.slice(0, numVariantsToUse);
    }

    return selectedVariants;
  }

  function selectMountainFeatureVariants(biome, allFeatures, seed) {
    const selectedVariants = {};
    const rng = createSeededRandom(seed);

    // Get only the features specified in the biome definition
    const biomeFeatureNames = biome.features
      .map(f => typeof f === 'string' ? f : f.name)
      .filter(name => !["Ceiling", "MountainWall", "MountainLeft", "MountainCenter", "MountainRight"].includes(name));

    // For each feature in the biome, select 1-4 variants
    for (const featureName of biomeFeatureNames) {
      const variants = allFeatures[featureName];
      if (!variants || variants.length === 0) continue;

      // Determine number of variants to use (1-4, or all if less than 4)
      const maxVariants = Math.min(variants.length, 4);
      const numVariantsToUse = Math.floor(rng() * maxVariants) + 1;

      // Shuffle variants and select top N
      const shuffled = [...variants];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      selectedVariants[featureName] = shuffled.slice(0, numVariantsToUse);
    }

    return selectedVariants;
  }

  /**
   * Generate cave biome terrain - uses separate rendering path without scattered terrain features
   * Only generates cave structure (floor, ceiling, walls) and places features on floor tiles
   *
   * The square is walled in along all four borders and then opened again, side by
   * side, wherever the neighbour has an underground to walk into (see
   * ProcGenUtils.undergroundBorderOpenings): the caves of a world join up into
   * one network instead of each being a box with a ladder in it.
   */
  function generateCaveBiomeTerrain(
    biome,
    seed,
    allFeatures,
    worldCoords,
    adjacentBiomes,
    cache
  ) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const mapData = new Array(width * height * 4).fill(0);

    const rng = createSeededRandom(seed);

    // Get CaveFloor, Ceiling and CaveWall tiles
    const caveFloorTiles = allFeatures["CaveFloor"] || [];
    const caveCeilingTiles = allFeatures["Ceiling"] || allFeatures["CaveCeiling"] || [];
    const caveWallFeatureTiles = allFeatures["CaveWall"] || allFeatures["MountainWall"] || allFeatures["DungeonWall"] || [];

    // Select a single CaveFloor variant seeded by the world-seeded master seed
    const caveFloorRng = createSeededRandom((seed ^ 0x0caf) >>> 0);
    const selectedFloorVariant = caveFloorTiles.length > 0 ?
      caveFloorTiles[Math.floor(caveFloorRng() * caveFloorTiles.length)] :
      null;

    const caveFloorTile = selectedFloorVariant ?
      (selectedFloorVariant.type === "single" ? selectedFloorVariant.tileId : selectedFloorVariant.tiles[0][0]) :
      1536;
    const caveCeilingTile = caveCeilingTiles.length > 0 ?
      (caveCeilingTiles[0].type === "single" ? caveCeilingTiles[0].tileId : caveCeilingTiles[0].tiles[0][0]) :
      0;
    const caveWallTile = caveWallFeatureTiles.length > 0 ?
      (caveWallFeatureTiles[0].type === "single" ? caveWallFeatureTiles[0].tileId : caveWallFeatureTiles[0].tiles[0][0]) :
      caveCeilingTile;

    // Select cave generation method based on world coordinates
    let caveData;
    // Hash world coordinates to pick generation method (0, 1, or 2)
    const methodHash = seed >>> 0;
    const generationMethod = methodHash % 3;

    switch (generationMethod) {
      case 0:
        // Drunken walk: Creates linear passages (carve ~40% of map)
        caveData = generateCaveWithDrunkenWalk(
          width,
          height,
          width,
          0.4,
          seed,
          caveFloorTile,
          caveCeilingTile
        );
        break;
      case 1:
        // Cellular automata: Natural-looking interconnected chambers
        caveData = generateCaveWithCellularAutomata(
          width,
          height,
          width,
          seed,
          caveFloorTile,
          caveCeilingTile
        );
        break;
      case 2:
        // Voronoi: Geometric crystal-like chambers
        caveData = generateCaveWithVoronoi(
          width,
          height,
          width,
          seed,
          caveFloorTile,
          caveCeilingTile
        );
        break;
    }

    // Copy cave data to main mapData
    for (let i = 0; i < caveData.length; i++) {
      mapData[i] = caveData[i];
    }

    // Seal cave borders with Ceiling tiles. The passages agreed with the
    // neighbours are cut back out of this band further down, once nothing is
    // left that would paint over them.
    const borderThickness = UNDERGROUND_BORDER_THICKNESS;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let shouldSeal = false;

        // Seal all borders
        if (y < borderThickness || y >= height - borderThickness || x < borderThickness || x >= width - borderThickness) {
          shouldSeal = true;
        }

        if (shouldSeal) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = caveCeilingTile;
        }
      }
    }

    // Smooth cave ceiling mask to remove thin ridges, diagonal strands and fill 1-tile holes
    smoothCaveCeilingMask(mapData, width, height, caveCeilingTile, caveFloorTile, borderThickness);

    // Create safe spawn area in center (7x7 cleared area)
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const spawnAreaRadius = 3; // Creates 7x7 area (radius 3 = 7 tiles diameter)

    for (let dy = -spawnAreaRadius; dy <= spawnAreaRadius; dy++) {
      for (let dx = -spawnAreaRadius; dx <= spawnAreaRadius; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = caveFloorTile;
        }
      }
    }

    // Find a valid destination in the cave for the tunnel (not in spawn area, not a wall)
    // Search for cave floor tiles outside the spawn area
    const potentialDestinations = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

        // Must be outside spawn area (distance > 10) and be a floor tile
        if (distanceFromCenter > 10 && mapData[idx] === caveFloorTile) {
          potentialDestinations.push({ x, y });
        }
      }
    }

    // Generate tunnel from spawn area to a random cave location
    if (potentialDestinations.length > 0) {
      // Pick a random destination
      const destination = potentialDestinations[Math.floor(rng() * potentialDestinations.length)];

      // Carve tunnel using a simple line algorithm with some width
      const tunnelWidth = 2; // 5 tiles wide tunnel (2 radius)
      let currentX = centerX;
      let currentY = centerY;
      const destX = destination.x;
      const destY = destination.y;

      // Use Bresenham's line algorithm to create tunnel path
      const dx = Math.abs(destX - currentX);
      const dy = Math.abs(destY - currentY);
      const sx = currentX < destX ? 1 : -1;
      const sy = currentY < destY ? 1 : -1;
      let err = dx - dy;

      while (true) {
        // Carve tunnel with width
        for (let ty = -tunnelWidth; ty <= tunnelWidth; ty++) {
          for (let tx = -tunnelWidth; tx <= tunnelWidth; tx++) {
            const nx = currentX + tx;
            const ny = currentY + ty;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const idx = calculateIndex(nx, ny, 0, width, height);
              mapData[idx] = caveFloorTile;
            }
          }
        }

        // Check if we reached destination
        if (currentX === destX && currentY === destY) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          currentX += sx;
        }
        if (e2 < dx) {
          err += dx;
          currentY += sy;
        }
      }
    }

    // Select which feature variants to use in this cave (1-4 variants per feature type)
    // Only features listed in the biome definition are used
    const selectedFeatures = selectCaveFeatureVariants(biome, allFeatures, seed);

    // Build list of tiles to block (all cave structure tiles)
    // This ensures features only spawn on CaveFloor tiles
    const blockedTiles = [caveCeilingTile, caveWallTile];

    // Add all Ceiling variants
    for (const variant of caveCeilingTiles) {
      if (variant.type === "single") {
        blockedTiles.push(variant.tileId);
      } else if (variant.type === "grid") {
        for (const row of variant.tiles) {
          for (const tileId of row) {
            blockedTiles.push(tileId);
          }
        }
      }
    }

    // Add all CaveWall feature tiles
    for (const variant of caveWallFeatureTiles) {
      if (variant.type === "single") {
        blockedTiles.push(variant.tileId);
      } else if (variant.type === "grid") {
        for (const row of variant.tiles) {
          for (const tileId of row) {
            blockedTiles.push(tileId);
          }
        }
      }
    }

    // Manually place features on CaveFloor tiles only with strict control
    // Find all CaveFloor tile positions
    const caveFloorPositions = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (mapData[idx] === caveFloorTile) {
          caveFloorPositions.push({ x, y });
        }
      }
    }

    if (caveFloorPositions.length > 0) {
      // Shuffle positions for random selection
      for (let i = caveFloorPositions.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [caveFloorPositions[i], caveFloorPositions[j]] = [caveFloorPositions[j], caveFloorPositions[i]];
      }

      // Select only 1-3% of available floor tiles for feature placement
      const featureTilesToPlace = Math.max(1, Math.floor(caveFloorPositions.length * 0.02));
      const selectedPositions = caveFloorPositions.slice(0, featureTilesToPlace);

      // Get all features in flat array for random selection
      const allSelectedVariants = [];
      for (const variants of Object.values(selectedFeatures)) {
        allSelectedVariants.push(...variants);
      }

      if (allSelectedVariants.length > 0) {
        // Place one feature per selected position
        for (const pos of selectedPositions) {
          // Randomly choose a variant
          const variant = allSelectedVariants[Math.floor(rng() * allSelectedVariants.length)];

          if (variant) {
            if (variant.type === "single") {
              // Check both layer 1 and 2 are empty before placing
              const idx1 = calculateIndex(pos.x, pos.y, 1, width, height);
              const idx2 = calculateIndex(pos.x, pos.y, 2, width, height);
              if (mapData[idx1] === 0 && mapData[idx2] === 0) {
                // Randomly choose which layer to place on
                const layer = rng() < 0.7 ? 1 : 2;
                const idx = calculateIndex(pos.x, pos.y, layer, width, height);
                mapData[idx] = variant.tileId;
              }
            } else if (variant.type === "grid") {
              // Check if multi-tile feature would overlap forbidden zones
              if (!doesMultiTileFeatureOverlapForbidden(variant.grid, pos.x, pos.y, width, height)) {
                // Safe to place - try to place multi-tile feature
                placeMultiTileFeature(
                  mapData,
                  variant.grid,
                  pos.x,
                  pos.y,
                  1,
                  width,
                  height,
                  new Set(blockedTiles)
                );
              }
            }
          }
        }
      }
    }

    // Reconcile all cave walls and ceilings to guarantee full visual consistency:
    // - Every south-facing ceiling gets cave walls below it
    // - No orphaned cave walls (without ceiling above) or orphaned floating ceilings remain
    reconcileCaveWallsAndCeilings(
      mapData,
      width,
      height,
      caveCeilingTile,
      caveWallTile,
      caveFloorTile,
      2,
      allFeatures
    );

    // ===== BORDER PASSAGES =====
    //
    // Cut last, after the wall-face passes and the feature scatter: both of
    // those paint over whatever they find under a ceiling tile, and a passage
    // painted over is a cave sealed shut again.
    const pgForDepth = (typeof $gameSystem !== "undefined" && $gameSystem)
      ? $gameSystem._procGenData : null;
    const layerDepth = (pgForDepth && pgForDepth.biomeLayerStack)
      ? pgForDepth.biomeLayerStack.length : 1;

    const openings = undergroundBorderOpenings(
      worldCoords,
      undergroundNeighbourNames(worldCoords, adjacentBiomes, cache),
      layerDepth,
      width,
      height
    );

    const carveFloor = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      mapData[calculateIndex(x, y, 0, width, height)] = caveFloorTile;
      // Nothing may decorate a passage: one impassable prop dropped on a
      // three-tile corridor is the same as never having cut it.
      for (let z = 1; z <= 3; z++) {
        mapData[calculateIndex(x, y, z, width, height)] = 0;
      }
    };

    const carvePassageRect = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) carveFloor(x, y);
      }
    };

    // The carve that made the cave is organic and owes the border nothing, so
    // each mouth is joined to the safe spawn area in the middle by a corridor of
    // its own. Without it a passage can open onto solid rock.
    const carveCorridor = (fromX, fromY, toX, toY, radius = 2) => {
      let x = fromX, y = fromY;
      const dx = Math.abs(toX - x), dy = Math.abs(toY - y);
      const sx = x < toX ? 1 : -1, sy = y < toY ? 1 : -1;
      let err = dx - dy;
      for (;;) {
        carvePassageRect(x - radius, y - radius, x + radius, y + radius);
        if (x === toX && y === toY) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    };

    // Through the whole sealed band and a little past it, so the party can stand
    // on the outermost ring (which is the tile the border crossing watches for)
    // and still has cave floor under them on the way in.
    const mouthDepth = borderThickness + 2;

    for (const direction of ["north", "south", "east", "west"]) {
      const opening = openings[direction];
      if (!opening) continue;
      const mid = Math.floor((opening.start + opening.end) / 2);

      if (direction === "north") {
        carvePassageRect(opening.start, 0, opening.end, mouthDepth);
        carveCorridor(mid, mouthDepth, centerX, centerY, 2);
      } else if (direction === "south") {
        carvePassageRect(opening.start, height - 1 - mouthDepth, opening.end, height - 1);
        carveCorridor(mid, height - 1 - mouthDepth, centerX, centerY, 2);
      } else if (direction === "west") {
        carvePassageRect(0, opening.start, mouthDepth, opening.end);
        carveCorridor(mouthDepth, mid, centerX, centerY, 2);
      } else {
        carvePassageRect(width - 1 - mouthDepth, opening.start, width - 1, opening.end);
        carveCorridor(width - 1 - mouthDepth, mid, centerX, centerY, 2);
      }
    }

    log(
      `[ProceduralMap] Cave border passages: ` +
      ["north", "south", "east", "west"]
        .map((d) => `${d}=${openings[d] ? `${openings[d].start}-${openings[d].end}` : "sealed"}`)
        .join(" ")
    );

    // Clean up any walls sliced by border passages so no orphaned walls remain
    cleanupOrphanedWallsAndCeilings(
      mapData,
      width,
      height,
      caveCeilingTile,
      caveWallTile,
      caveFloorTile,
      2,
      allFeatures
    );

    // Clear any features in forbidden zones (borders and center)
    clearForbiddenZoneFeatures(mapData, width, height);

    // Create region data for water tile detection in MovementInteractionSystem
    const regiondata = new Array(width * height).fill(0);

    // Identify water tile IDs from the biome features
    let waterTileIds = new Set();
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIds.add(variant.tileId);
          }
        }
      }
    }

    // Mark all water tiles with region ID 99 for MovementInteractionSystem detection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];

        if (waterTileIds.has(tileId)) {
          const regionIdx = y * width + x;
          regiondata[regionIdx] = 99;
        }
      }
    }

    // Attach region data to map data for $gameMap.regionId() calls
    mapData.regiondata = regiondata;

    // Expose the tiles this cave instance carved with, so prefab placement
    // and downstream systems know the floor, ceiling and wall types.
    mapData.caveFloorTile = caveFloorTile;
    mapData.caveCeilingTile = caveCeilingTile;
    mapData.caveWallTile = caveWallTile;

    return mapData;
  }

  /**
   * Wall the sea floor off from whatever is NOT sea floor beside it.
   *
   * The other half of the cave rule (ProcGenUtils.undergroundBorderOpenings): a
   * cave never opens onto the seabed, and the seabed never opens onto a cave, so
   * both squares of such a seam draw rock and neither leads the party into a
   * wall. Seabed against seabed is left wide open -- one sea floor runs straight
   * into the next.
   *
   * A no-op above ground and in every biome that is not the sea floor.
   */
  function sealSeabedUndergroundBorders(
    mapData, biome, allFeatures, adjacentBiomes, worldCoords, cache, width, height
  ) {
    if (!mapData || !biome || !isSeabedBiomeName(biome.name)) return;

    const procGenData = ($gameSystem && $gameSystem._procGenData) || null;
    const underground = !!(procGenData && procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0);
    if (!underground) return;

    // Rock the party cannot swim through, picked by the tileset's own passage
    // flags rather than by name: the seabed tileset draws MountainWall and
    // Ceiling as passable scenery, so sealing with either of those would paint a
    // wall the player walks straight through.
    const flags = ($dataTilesets && $dataTilesets[biome.tilesetId] && $dataTilesets[biome.tilesetId].flags) || null;
    const isImpassable = (tileId) => !!flags && tileId > 0 && (flags[tileId] & 0x0f) === 0x0f;

    const candidates = [];
    for (const name of ["MountainCeiling", "MountainCenter", "MountainLeft", "MountainWall", "Ceiling"]) {
      for (const variant of allFeatures[name] || []) {
        const tileId = variant.type === "single"
          ? variant.tileId
          : (variant.tiles && variant.tiles[0] && variant.tiles[0][0]);
        if (tileId) candidates.push(tileId);
      }
    }
    const wallTile = candidates.find(isImpassable) || candidates[0];
    if (!wallTile) {
      logWarn(`[ProceduralMap] Seabed at (${worldCoords?.x},${worldCoords?.y}): no wall tile to seal its borders with`);
      return;
    }

    // The surface neighbours, not the ones a descent synthesized: diving off an
    // Ocean square reports the sea floor on all four sides, which would leave
    // the square open to the caves under the coast next to it.
    const neighbours = undergroundNeighbourNames(worldCoords, adjacentBiomes, cache);
    const facesSeabed = (name) => {
      if (!name) return true;                       // unknown: leave it open
      if (isSeabedBiomeName(name)) return true;
      const neighbourBiome = getBiomeByName(name);
      if (!neighbourBiome) return true;
      return isSeabedBiomeName(neighbourBiome.lowerLayer);
    };

    const seal = {
      north: !facesSeabed(neighbours.north),
      south: !facesSeabed(neighbours.south),
      east: !facesSeabed(neighbours.east),
      west: !facesSeabed(neighbours.west),
    };
    if (!seal.north && !seal.south && !seal.east && !seal.west) return;

    const band = UNDERGROUND_BORDER_THICKNESS;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sealed =
          (seal.north && y < band) ||
          (seal.south && y >= height - band) ||
          (seal.west && x < band) ||
          (seal.east && x >= width - band);
        if (!sealed) continue;
        mapData[calculateIndex(x, y, 0, width, height)] = wallTile;
        // Kelp and coral scattered over what is now solid rock.
        for (let z = 1; z <= 3; z++) mapData[calculateIndex(x, y, z, width, height)] = 0;
      }
    }

    log(
      `[ProceduralMap] Seabed borders sealed: ` +
      ["north", "south", "east", "west"].filter((d) => seal[d]).join(",")
    );
  }

  /**
   * Generate mountain biome terrain from a heightfield.
   *
   * Rock is drawn only with MountainLeft / MountainCenter / MountainRight (the
   * three shades the generator hillshades with). Ceiling and MountainWall are
   * deliberately NOT used any more: most mountain tilesets never declared
   * either, so the old inverted-cellular-automata pass painted whole massifs
   * with tile id 0 (bare void) and only the rims came out as rock.
   *
   * This is a wrapper that prepares tiles for generateMountainRangeTerrain,
   * which picks a range style (alpine ridges, glacial troughs, mesas, canyon
   * country, caldera basin, ...) from the world coordinates and carves the
   * valleys, cliff tiers and lakes.
   */
  function generateMountainSurfaceTerrainForBiome(
    biome,
    seed,
    allFeatures,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;

    const firstTileId = (variants) =>
      variants && variants.length > 0
        ? (variants[0].type === "single" ? variants[0].tileId : variants[0].tiles[0][0])
        : 0;

    // Directional rock tiles. Ceiling/MountainWall are only consulted as a last
    // resort, for a tileset that declares neither of the three.
    const fallbackRock = firstTileId(allFeatures["Ceiling"]) || firstTileId(allFeatures["MountainWall"]);
    const cliffTiles = {
      left: firstTileId(allFeatures["MountainLeft"]) || fallbackRock,
      center: firstTileId(allFeatures["MountainCenter"]) || fallbackRock,
      right: firstTileId(allFeatures["MountainRight"]) || fallbackRock,
    };

    // Lakes are filled with the biome's own Water feature, so region 99 (water
    // detection) and prefab water-avoidance both pick them up for free.
    const lakeTile = firstTileId(allFeatures["Water"]);
    // Shoreline: sand on temperate/desert ranges, none on ice (a frozen tarn
    // meets its rock directly).
    const biomeName = biome.name || "Mountain";
    const isIceMountain = /ice|snow|frozen|glacier|permafrost/i.test(biomeName);
    const isDesertMountain = /desert|dune|sand|badland|mesa/i.test(biomeName);
    const shoreTile = isIceMountain ? 0 : firstTileId(allFeatures["Beach"]) || firstTileId(allFeatures["Sand"]);
    // Scree at the foot of the cliffs, in the biome's own rubble ground.
    const apronCandidates = isIceMountain
      ? ["SnowRock", "GrassRock", "Dirt"]
      : isDesertMountain
        ? ["SandRock", "BadlandRock", "Sand", "Dirt"]
        : ["GrassRock", "BadlandRock", "Dirt"];
    let apronTile = 0;
    for (const name of apronCandidates) {
      apronTile = firstTileId(allFeatures[name]);
      if (apronTile) break;
    }

    // First, generate base terrain (normal biome terrain) for the valley floor
    const baseMapData = new Array(width * height * 4).fill(0);
    fillTerrainLayer(baseMapData, biome, allFeatures, width, height, createSeededRandom(seed), adjacentBiomes);

    // Apply mountain relief on top of base terrain. worldCoords selects the
    // range style, so neighbouring squares of the same biome look like
    // different country.
    const mapData = generateMountainRangeTerrain(width, height, width, seed, {
      tiles: cliffTiles,
      baseTerrainData: baseMapData,
      worldCoords,
      biomeName,
      waterTile: lakeTile,
      shoreTile,
      apronTile,
    });

    // Every tile id the relief pass owns: features must not be scattered on top
    // of rock or on a lake.
    const mountainTileIds = [cliffTiles.left, cliffTiles.center, cliffTiles.right, lakeTile].filter(Boolean);

    // Prefab placement runs later still (DataManager.loadMapData,
    // ProceduralMapPrefabs), after the relief pass has already carved its rock
    // into this array. mapData.mountainMask (attached by
    // generateMountainRangeTerrain) names by POSITION, not by tile id, which
    // cells are genuine mountain or lake, so that pass can re-stamp them back
    // over whatever a prefab just painted there: the mountain cuts through
    // the building, the building does not displace the mountain.

    // Collect all water tile IDs for feature placement checks
    let waterTiles = [];
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTiles.push(variant.tileId);
          }
        }
        if (waterTiles.length > 0) break;
      }
    }

    // Create RNG for water and feature placement
    const rng = createSeededRandom(seed + 100);

    // Draw the coastline (sea, sand, diagonal corners) BEFORE placing features
    // so features never land where the water will be drawn.
    if (waterTiles.length > 0) {
      drawWaterEdges(
        mapData,
        waterTiles,
        adjacentBiomes,
        seed,
        width,
        height,
        rng,
        cacheInfo,
        allFeatures,
        biome.name,
        {
          worldCoords,
          diagonalBiomes: cache
            ? checkDiagonalMapBiomesFromCache(worldCoords?.x || 0, worldCoords?.y || 0, cache)
            : null,
        }
      );
    }

    // Now collect ALL water tile IDs actually placed on the map
    // This includes water edges, beaches, and seashells that were just drawn
    let waterTileIdsSet = new Set();
    for (const featureName of ["Water", "Ocean", "Beach", "Seashell"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIdsSet.add(variant.tileId);
          }
        }
      }
    }

    // Scan the map and add any actual water tiles that were placed
    const actualWaterTiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];
        if (waterTileIdsSet.has(tileId)) {
          actualWaterTiles.push(tileId);
        }
      }
    }

    // Block mountain tiles and all water-related tiles from feature placement
    let blockedWaterTiles = [...new Set([...actualWaterTiles, ...waterTiles, ...mountainTileIds])];

    // Collect path tiles to NEVER overwrite them (Path, PathDesert, PathIce, Road)
    let pathTiles = [];
    for (const featureName of ["Path", "PathDesert", "PathIce", "Road", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            pathTiles.push(variant.tileId);
          }
        }
      }
    }

    // Place biome-specific features (exclude mountains, water, and beach areas)
    const featuresToUse = selectMountainFeatureVariants(biome, allFeatures, seed);
    for (const [featureName, variants] of Object.entries(featuresToUse)) {
      // Determine scatter density based on biome
      const baseDensity = 0.02;
      const density = baseDensity * (biome.featureDensity || 1);

      generateFeatureScattered(
        mapData,
        variants,
        1,  // layer
        width,
        height,
        seed + Object.keys(featuresToUse).indexOf(featureName),
        density,
        rng,
        blockedWaterTiles,
        pathTiles
      );
    }

    // Belt-and-suspenders sweep: blockedWaterTiles only keeps the scatter off
    // cells whose CURRENT tile id happens to be a known mountain/water id, so
    // a Ceiling cell painted with 0 (an undeclared feature reads as bare
    // void) slips past it the same way an empty/unpainted cell would. The
    // mask attached by generateMountainBiomeTerrain (mapData.mountainMask)
    // knows by position, not by id, which cells are genuinely mountain, so a
    // final pass over it strips any object-layer content (feature, ornament,
    // anything else) that ended up painted on mountain or ceiling.
    if (mapData.mountainMask) {
      const mask = mapData.mountainMask;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!mask[y * width + x]) continue;
          for (let layer = 1; layer <= 3; layer++) {
            mapData[calculateIndex(x, y, layer, width, height)] = 0;
          }
        }
      }
    }

    // Clear any features in forbidden zones (borders and center)
    clearForbiddenZoneFeatures(mapData, width, height);

    // Create region data for water tile detection in MovementInteractionSystem
    const regiondata = new Array(width * height).fill(0);

    // Identify water tile IDs from the biome features
    let waterTileIds = new Set();
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIds.add(variant.tileId);
          }
        }
      }
    }

    // Mark all water tiles with region ID 99 for MovementInteractionSystem detection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];

        if (waterTileIds.has(tileId)) {
          const regionIdx = y * width + x;
          regiondata[regionIdx] = 99;
        }
      }
    }

    // Attach region data to map data for $gameMap.regionId() calls
    mapData.regiondata = regiondata;

    return mapData;
  }

  // ==========================================================================
  // Alien-surface terrain: per-square variety that matches the landing-grid
  // picker's painted planet texture (GalaxySim_Renderer3D.js), instead of one
  // fixed biome edge-to-edge. Every alien tileset is re-tinted from the same
  // shared reference sheet (tools/tilesets/gen_alien_biome_tilesets.py), so
  // Water/Beach/MountainWall/MountainLeft-Center-Right/Ceiling/Crater tiles are
  // already present in allFeatures for every one of them -- this is pure
  // orchestration, no new art or Biomes.json content involved.
  // ==========================================================================

  // Which of Renderer3D's texture-painter families this alien square belongs
  // to, and (for the terrestrial family) whether THIS square's coarse
  // elevation crests into the mountain band. Returns null off an alien
  // surface, or when the family isn't reworked yet (icy/volcanic/gas-giant)
  // -- generateBiomeBody falls back to the plain terrain fill in that case.
  function resolveAlienRoute(biome, worldCoords) {
    const GS = window.GalaxySim;
    if (!GS) return null;
    const family = GS.getLandedTerrainFamily ? GS.getLandedTerrainFamily() : null;
    if (family === "rocky") return "crater";
    if (family !== "terrestrial") return null;
    const R3D = GS.Renderer3D;
    if (!R3D || !R3D.terrestrialElevation) return "terrestrial";
    const pg = $gameSystem && $gameSystem._procGenData;
    const grid = (pg && pg.alienGrid) || {};
    const gridW = grid.w || 1;
    const gridH = grid.h || 1;
    const planet = GS.getSurfacePlanet ? GS.getSurfacePlanet() : null;
    const isOcean = !!(planet && planet.type === "ocean");
    const seed = GS.getLandedPlanetSeed ? GS.getLandedPlanetSeed() : 0;
    const u = (worldCoords.x + 0.5) / gridW;
    const v = (worldCoords.y + 0.5) / gridH;
    const info = R3D.terrestrialElevation(seed, u, v, isOcean);
    return info.band === "rock" ? "mountain" : "terrestrial";
  }

  // Continuous elevation-banded terrain for the terrestrial/breathable alien
  // family (earth_like, ocean, habitable): every tile samples
  // Renderer3D.terrestrialElevation at the same fine (gx+localX/64) resolution
  // the picker's texture is coarsely sampled at, so a coastline or forest belt
  // comes out as one continuous shape across however many squares it spans --
  // no border-seam geometry needed, since neighbouring squares are just
  // evaluating adjacent points of the same field.
  function generateAlienTerrestrialTerrain(biome, seed, allFeatures, worldCoords) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const mapData = new Array(width * height * 4).fill(0);
    const rng = createSeededRandom(seed);

    const GS = window.GalaxySim;
    const R3D = GS && GS.Renderer3D;
    if (!R3D || !R3D.terrestrialElevation) {
      // No GalaxySim bridge available (e.g. a harness that only loads the
      // ProceduralMap plugins): degrade to the family's plain fill.
      fillTerrainLayer(mapData, biome, allFeatures, width, height, rng, null);
      return mapData;
    }

    const pg = $gameSystem && $gameSystem._procGenData;
    const grid = (pg && pg.alienGrid) || {};
    const gridW = grid.w || 1;
    const gridH = grid.h || 1;
    const planet = GS.getSurfacePlanet ? GS.getSurfacePlanet() : null;
    const isOcean = !!(planet && planet.type === "ocean");
    const planetSeed = GS.getLandedPlanetSeed ? GS.getLandedPlanetSeed() : 0;

    const firstTileId = (name) => {
      const list = allFeatures[name];
      if (!list || !list.length) return 0;
      const variant = list[0];
      return variant.type === "single"
        ? variant.tileId
        : ((variant.tiles && variant.tiles[0] && variant.tiles[0][0]) || 0);
    };
    const waterTile = firstTileId("Water");
    const beachTile = firstTileId("Beach") || waterTile;
    const grassTile = firstTileId("Grass") || firstTileId("GrassDark");
    const rockTile = firstTileId("GrassRock") || firstTileId("Rock") || firstTileId("Badland") || grassTile;
    const snowTile = firstTileId("Snow") || grassTile;
    const floorFallback = grassTile || rockTile || waterTile || 0;
    const bandTile = {
      water: waterTile, beach: beachTile, grass: grassTile,
      forest: grassTile, rock: rockTile, snow: snowTile,
    };

    const bands = new Array(width * height);
    for (let y = 0; y < height; y++) {
      const v = (worldCoords.y + y / height) / gridH;
      for (let x = 0; x < width; x++) {
        const u = (worldCoords.x + x / width) / gridW;
        const info = R3D.terrestrialElevation(planetSeed, u, v, isOcean);
        const cell = y * width + x;
        bands[cell] = info.band;
        mapData[calculateIndex(x, y, 0, width, height)] = bandTile[info.band] || floorFallback;
      }
    }

    // Autotile the water with the existing 16-shape A1 classifier (already
    // exported, never wired up before now) so the coastline this field draws
    // reads as a real shoreline instead of a flat block of the base tile.
    if (waterTile && BeachGen && BeachGen.getWaterAutotileIndex) {
      const waterSet = new Set([waterTile]);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (bands[y * width + x] !== "water") continue;
          const idx = calculateIndex(x, y, 0, width, height);
          const offset = BeachGen.getWaterAutotileIndex(x, y, mapData, width, height, waterSet);
          mapData[idx] = BeachGen.getWaterTileForAutotiling([waterTile], offset);
        }
      }
    }

    // Light decoration on top of the floor: trees through the forest band,
    // occasional flowers on plain grass -- the same density-scatter idea every
    // other terrain path in this file already uses, just gated by band instead
    // of a weighted feature roll.
    const treeTiles = (allFeatures["Tree"] || []).filter((v) => v.type === "single").map((v) => v.tileId);
    const flowerTiles = (allFeatures["Flower"] || []).filter((v) => v.type === "single").map((v) => v.tileId);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const band = bands[y * width + x];
        if (band === "forest" && treeTiles.length && rng() < 0.35) {
          mapData[calculateIndex(x, y, 1, width, height)] = treeTiles[Math.floor(rng() * treeTiles.length)];
        } else if (band === "grass" && flowerTiles.length && rng() < 0.05) {
          mapData[calculateIndex(x, y, 1, width, height)] = flowerTiles[Math.floor(rng() * flowerTiles.length)];
        }
      }
    }

    return mapData;
  }

  // Macro crater fields for the rocky/airless alien family (paintRocky's
  // fallback bucket: sub_mercurian, mercurian, dwarf, centaur, planetesimal,
  // the asteroid and comet types, ...). Starts from the family's existing
  // plain terrain fill, then stamps every planet-wide crater
  // (GalaxySim.getLandedCraterList, positioned at the same spot paintRocky's
  // texture dot sits at) that could overlap this square, using a torus-
  // shortest-distance offset so a crater whose radius exceeds one square is
  // reconstructed identically -- rim, slope and floor alike -- by every square
  // it touches. Mirrors the "border-owned shape" principle
  // ProceduralBeachGenerator.js's coastlineDepth already uses for coastlines,
  // circular instead of linear.
  function generateAlienCraterFieldTerrain(biome, seed, allFeatures, worldCoords) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const rng = createSeededRandom(seed);
    const mapData = new Array(width * height * 4).fill(0);
    fillTerrainLayer(mapData, biome, allFeatures, width, height, rng, null);

    const GS = window.GalaxySim;
    const craters = GS && GS.getLandedCraterList ? GS.getLandedCraterList() : [];
    if (!craters.length) return mapData;

    const pg = $gameSystem && $gameSystem._procGenData;
    const grid = (pg && pg.alienGrid) || {};
    const gridW = grid.w || 1;
    const gridH = grid.h || 1;

    const firstTileId = (name) => {
      const list = allFeatures[name];
      if (!list || !list.length) return 0;
      const variant = list[0];
      return variant.type === "single"
        ? variant.tileId
        : ((variant.tiles && variant.tiles[0] && variant.tiles[0][0]) || 0);
    };
    // CaveFloor, not MountainWall: the rim has to be walkable ground (a raised
    // lip you can stand on and cross), not a solid cliff wall that would seal
    // a slice of the crater off from the rest of the square.
    const rimTile = firstTileId("CaveFloor");
    const slopeTiles = ["MountainLeft", "MountainCenter", "MountainRight"]
      .map(firstTileId).filter(Boolean);
    if (!rimTile && !slopeTiles.length) return mapData;
    const craterTiles = (allFeatures["Crater"] || []).filter((v) => v.type === "single").map((v) => v.tileId);

    for (const crater of craters) {
      // Torus-shortest offset from this square's center to the crater's
      // center, in grid-cell units -- the same wrap WorldMapReturn.js's alien
      // branch already applies to gx/gy.
      let du = crater.u * gridW - (worldCoords.x + 0.5);
      du -= gridW * Math.round(du / gridW);
      let dv = crater.v * gridH - (worldCoords.y + 0.5);
      dv -= gridH * Math.round(dv / gridH);
      // Cull craters that cannot reach this square at all (a little slack for
      // the square's own half-diagonal).
      if (Math.hypot(du, dv) - 0.8 > crater.r) continue;

      const localCx = du * width + width / 2;
      const localCy = dv * height + height / 2;
      const localR = crater.r * width;
      const rimBand = Math.max(1, localR * 0.15);
      const slopeBand = Math.max(1, localR * 0.15);

      const minX = Math.max(0, Math.floor(localCx - localR - 1));
      const maxX = Math.min(width - 1, Math.ceil(localCx + localR + 1));
      const minY = Math.max(0, Math.floor(localCy - localR - 1));
      const maxY = Math.min(height - 1, Math.ceil(localCy + localR + 1));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dist = Math.hypot(x - localCx, y - localCy);
          if (dist > localR) continue;
          if (dist > localR - rimBand) {
            if (rimTile) mapData[calculateIndex(x, y, 0, width, height)] = rimTile;
          } else if (dist > localR - rimBand - slopeBand) {
            if (slopeTiles.length) {
              mapData[calculateIndex(x, y, 0, width, height)] =
                slopeTiles[Math.floor(rng() * slopeTiles.length)];
            }
          } else if (craterTiles.length && rng() < 0.08) {
            mapData[calculateIndex(x, y, 1, width, height)] =
              craterTiles[Math.floor(rng() * craterTiles.length)];
          }
        }
      }
    }

    return mapData;
  }

  // Nearest passable tile to (preferX, preferY) in a freshly generated alien
  // square. Earth's generators each guarantee their own open borders/center
  // (mountain ranges keep a clearing, coastlines never draw over a road...),
  // but the elevation-banded terrestrial fill and the crater fields are new
  // and continuous -- the map's exact center can legitimately land in open
  // water or inside a crater's rim -- so entering/re-entering an alien planet
  // always has to search for solid ground instead of assuming the center is
  // it. Checks every layer (a scattered tree/rock also blocks passage), then
  // spirals outward ring by ring from the preferred point.
  function findPassableLandingTile(mapData, tilesetId, width, height, preferX, preferY) {
    const passable = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      for (let z = 0; z <= 3; z++) {
        const tileId = mapData[calculateIndex(x, y, z, width, height)];
        if (tileId && !isTilePassableInTileset(tilesetId, tileId)) return false;
      }
      return true;
    };
    if (passable(preferX, preferY)) return { x: preferX, y: preferY };
    const maxRadius = Math.max(width, height);
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
          const x = preferX + dx;
          const y = preferY + dy;
          if (passable(x, y)) return { x, y };
        }
      }
    }
    return { x: preferX, y: preferY }; // exhausted the whole map: give up
  }

  // Persist the building-lot / placement hints a structure generator wrote onto
  // its allOtherData arg so the (separately hooked) prefab placement pass can
  // align prefabs to those lots instead of falling back to grid placement.
  function _persistStructureHints(allOtherData) {
    if (!$gameSystem || !$gameSystem._procGenData) return;
    $gameSystem._procGenData.structureHints = {
      blockHints: allOtherData.blockHints || null,
      placementHints: allOtherData.placementHints || null,
      allowPrefabReuse: allOtherData.allowPrefabReuse === true,
    };
  }

  /**
   * Build the biome's tileset feature table (merged across all of its tilesets).
   */
  function collectBiomeFeatures(biome) {
    const tilesetIds = biome.tilesetIds || [biome.tilesetId];
    const allFeatures = {};
    for (const tilesetId of tilesetIds) {
      if (!tilesetId) continue;
      let features = null;
      try { features = Cache.getTilesetFeatures(tilesetId); } catch (e) { features = null; }
      if (!features) continue;
      for (const [name, tiles] of Object.entries(features)) {
        if (!allFeatures[name]) allFeatures[name] = [];
        allFeatures[name] = allFeatures[name].concat(tiles);
      }
    }
    return allFeatures;
  }

  /**
   * After a biome map is generated, draw a river through it when the world map
   * paints a river over this coordinate (river tile on world layer 2/3 above a
   * land biome). The biome keeps its own terrain; the river is carved on top with
   * the biome's own Water tile so passability (region 99) and prefab
   * water-avoidance both work automatically. Settlements get a narrower channel
   * that enters from each connected side and ends at the town centre.
   */
  function maybeApplyRiverOverlay(mapData, biome, adjacentBiomes, seed, worldCoords) {
    if (!mapData || !applyRiverOverlay || !worldCoords) return;
    if (!biome || typeof biome !== "object") return;
    const name = biome.name || "";

    // Biomes that never host a surface river overlay: caves/dungeons (subsurface),
    // river/water biomes (already water) and seabed.
    //
    // Roads are excluded too. Overlapping a road biome with a river used to draw
    // the channel straight across the carriageway, which flooded the road and
    // left it impassable. A road crossing water is now only ever produced by an
    // explicit bridge marker on the world map (see generateBridgeBiome), which
    // draws the river first and the road over it.
    if (
      isCaveBiome(name) || isDungeonBiome(name) || isRiverBiome(name) ||
      isWaterBiome(name) || isRoadBiome(name) || /seabed|ocean/i.test(name)
    ) return;

    const R = ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.riverCoordMap) || null;
    if (!R) return;
    const wx = worldCoords.x, wy = worldCoords.y;
    if (!R[`${wx},${wy}`]) return; // this coord carries no river

    // The biome's own water tile (matches the prefab water-avoidance scanner).
    const allFeatures = collectBiomeFeatures(biome);
    let waterTile = 0;
    if (allFeatures["Water"]) {
      for (const v of allFeatures["Water"]) {
        if (v.type === "single" && v.tileId) { waterTile = v.tileId; break; }
      }
    }
    if (!waterTile) return; // no water tile in this tileset: cannot draw a river

    const has = (cx, cy) => !!R[`${cx},${cy}`];
    const adj = adjacentBiomes || {};
    const conn = {
      north: has(wx, wy - 1) || isRiverConnectable(adj.north),
      south: has(wx, wy + 1) || isRiverConnectable(adj.south),
      east: has(wx + 1, wy) || isRiverConnectable(adj.east),
      west: has(wx - 1, wy) || isRiverConnectable(adj.west),
    };

    // Narrower channel inside built-up biomes so the river threads the streets
    // instead of flooding them; wider, more natural channel out in the open.
    const isSettlement = isCityBiome(name) || isVillageBiome(name) || isBurgBiome(name);
    const opts = isSettlement
      ? { connectFraction: 0.05, maxFraction: 0.09 }
      : { connectFraction: 0.10, maxFraction: 0.22 };

    const rng = createSeededRandom(((seed >>> 0) ^ 0x51e2c0) >>> 0);
    applyRiverOverlay(mapData, waterTile, conn, allFeatures, PROC_MAP_WIDTH, PROC_MAP_HEIGHT, seed, rng, opts);
  }

  function generateProceduralTerrain(
    biome,
    seed,
    roadDirection,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    return runSteps(generateProceduralTerrainSteps(
      biome, seed, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache
    ));
  }

  function* generateProceduralTerrainSteps(
    biome,
    seed,
    roadDirection,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    const mapData = yield* generateBiomeBodySteps(
      biome, seed, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache
    );
    yield;
    maybeApplyRiverOverlay(mapData, biome, adjacentBiomes, seed, worldCoords);
    yield;
    applyBunkerFeatures(mapData, biome, worldCoords);
    // A patron's hatch is NOT stamped here: prefabs are applied to this array
    // later still (DataManager.loadMapData, ProceduralMapPrefabs), and a house
    // dropped on the hatch would bury it. PatreonRewards hooks that same load
    // step and stamps after everything, on the exact tile its secret names.
    return mapData;
  }

  function generateBiomeBody(
    biome,
    seed,
    roadDirection,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    return runSteps(generateBiomeBodySteps(
      biome, seed, roadDirection, adjacentBiomes, cacheInfo, worldCoords, cache
    ));
  }

  function* generateBiomeBodySteps(
    biome,
    seed,
    roadDirection,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    // Clear any hints left over from a previously generated biome so they are
    // never applied to a map that did not produce them.
    if ($gameSystem && $gameSystem._procGenData) $gameSystem._procGenData.structureHints = null;

    // Don't generate roads in cave biomes (roads are surface-only)
    if (isRoadBiome(biome.name) && !isCaveBiome(biome.name)) {
      const tilesetIds = biome.tilesetIds || [biome.tilesetId];
      const allFeatures = {};
      for (const tilesetId of tilesetIds) {
        const features = Cache.getTilesetFeatures(tilesetId);
        for (const [name, tiles] of Object.entries(features)) {
          if (!allFeatures[name]) {
            allFeatures[name] = [];
          }
          allFeatures[name] = allFeatures[name].concat(tiles);
        }
      }

      // A bridge marker fixes the road's orientation (adjacent-biome intersection
      // detection would bend the crossing away from the river it has to span),
      // and the river is drawn underneath it.
      const bridgeDirection =
        ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentBridgeDirection) || null;
      if (bridgeDirection) {
        return generateBridgeBiome(
          biome, seed, allFeatures, bridgeDirection, adjacentBiomes, cacheInfo, worldCoords, cache
        );
      }

      // Auto-determine the intersection shape from adjacent biomes, so a tile
      // that really is a junction is drawn as one.
      //
      // It may only REFINE the direction, never invent one: with no adjacent
      // road the detector just returns its "horizontal" default, which silently
      // rotated genuine "Road vertical" tiles. The direction the world map
      // states for the tile wins whenever the neighbours say nothing.
      let finalRoadDirection = roadDirection;
      if (adjacentBiomes) {
        const adjacentRoadCount = ["north", "south", "east", "west"].filter(
          (side) => adjacentBiomes[side] && isRoadBiome(adjacentBiomes[side])
        ).length;

        if (adjacentRoadCount > 0) {
          finalRoadDirection = determineRoadIntersectionType(adjacentBiomes, isRoadBiome);
          log(`[ProceduralMapBiomeGenerator] Auto-detected road direction: ${finalRoadDirection}`);
        } else {
          log(`[ProceduralMapBiomeGenerator] No adjacent road: keeping world-map road direction: ${finalRoadDirection}`);
        }
      } else if (finalRoadDirection) {
        log(`[ProceduralMapBiomeGenerator] Using hardcoded road direction (no adjacent biomes available): ${finalRoadDirection}`);
      }
      // Fallback to horizontal if still not determined
      if (!finalRoadDirection) {
        finalRoadDirection = "horizontal";
        log(`[ProceduralMapBiomeGenerator] Using fallback road direction: horizontal`);
      }

      // The carriageway always crosses its own tile (see spanningRoadAdjacency).
      const roadAdjacent = spanningRoadAdjacency(adjacentBiomes, finalRoadDirection);

      return yield* generateRoadBiomeSteps(biome, seed, allFeatures, finalRoadDirection, roadAdjacent, cacheInfo, worldCoords, cache);
    }

    // Don't generate rivers in cave biomes (rivers are surface-only)
    if (isRiverBiome(biome.name) && !isCaveBiome(biome.name)) {
      const tilesetIds = biome.tilesetIds || [biome.tilesetId];
      const allFeatures = {};
      for (const tilesetId of tilesetIds) {
        const features = Cache.getTilesetFeatures(tilesetId);
        for (const [name, tiles] of Object.entries(features)) {
          if (!allFeatures[name]) {
            allFeatures[name] = [];
          }
          allFeatures[name] = allFeatures[name].concat(tiles);
        }
      }

      // Auto-determine river intersection type from adjacent biomes
      let finalRiverDirection = roadDirection;
      if (adjacentBiomes) {
        const autoDetectedDirection = determineRiverIntersectionType(adjacentBiomes, isRiverBiome);
        log(`[ProceduralMapBiomeGenerator] Auto-detected river direction: ${autoDetectedDirection}`);
        // Always use auto-detected direction for rivers to ensure proper intersections
        finalRiverDirection = autoDetectedDirection;
      } else if (finalRiverDirection) {
        log(`[ProceduralMapBiomeGenerator] Using hardcoded river direction (no adjacent biomes available): ${finalRiverDirection}`);
      }
      // Fallback to horizontal if still not determined
      if (!finalRiverDirection) {
        finalRiverDirection = "horizontal";
        log(`[ProceduralMapBiomeGenerator] Using fallback river direction: horizontal`);
      }

      return yield* generateRiverBiomeSteps(biome, seed, allFeatures, finalRiverDirection, adjacentBiomes, cacheInfo, worldCoords, cache);
    }

    const tilesetIds = biome.tilesetIds || [biome.tilesetId];

    const allFeatures = {};
    for (const tilesetId of tilesetIds) {
      const features = Cache.getTilesetFeatures(tilesetId);
      for (const [name, tiles] of Object.entries(features)) {
        if (!allFeatures[name]) {
          allFeatures[name] = [];
        }
        allFeatures[name] = allFeatures[name].concat(tiles);
      }
    }

    // Alien-surface terrain: route by the planet's texture-painter family so
    // the ground matches what the landing-grid picker shows. Only fires with
    // $gameSystem._procGenData.alienGrid set, i.e. never for Earth biomes
    // (map 636 is reused for both).
    if ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.alienGrid) {
      const alienRoute = resolveAlienRoute(biome, worldCoords);
      if (alienRoute === "terrestrial") {
        return generateAlienTerrestrialTerrain(biome, seed, allFeatures, worldCoords);
      } else if (alienRoute === "crater") {
        return generateAlienCraterFieldTerrain(biome, seed, allFeatures, worldCoords);
      } else if (alienRoute === "mountain") {
        // Fall through to the existing, unmodified mountain generator below,
        // via a clone renamed just for this call so isMountainBiome() fires --
        // currentBiome (BGM/tileset/audio lookups) is left untouched.
        biome = Object.assign({}, biome, { name: biome.name + "Mountain" });
      }
    }

    // For cave biomes, use separate cave-only rendering (no scattered terrain
    // features). "CaveDen" is excluded: despite the name it is a dungeon-family
    // structure biome (single sealed chamber with a south-border entrance)
    // rendered by the dungeon generator below.
    if (isCaveBiome(biome.name) && !isDungeonBiome(biome.name)) {
      return generateCaveBiomeTerrain(biome, seed, allFeatures, worldCoords, adjacentBiomes, cache);
    }

    // For mountain biomes, generate Perlin noise-based cliff terrain
    if (isMountainBiome(biome.name)) {
      return generateMountainSurfaceTerrainForBiome(biome, seed, allFeatures, adjacentBiomes, cacheInfo, worldCoords, cache);
    }

    // For Seabed biome, generate underwater cliffs with water tiles as base.
    //
    // Left matching "Seabed" exactly, which the biome (Biomes.json spells it
    // "SeaBed") never does: tileset 302 declares no Water feature at all, so
    // generateSeabedBiomeTerrain bails out and returns null. The sea floor is
    // built by the generic path below -- as a floor walked on, not swum over --
    // and it is that path that walls it off from the caves beside it (see
    // sealSeabedUndergroundBorders).
    if (biome.name === "Seabed") {
      if (BeachGen && BeachGen.generateSeabedBiomeTerrain) {
        return BeachGen.generateSeabedBiomeTerrain(biome, seed, allFeatures, adjacentBiomes, cacheInfo, worldCoords, cache);
      }
    }

    // For dungeon biomes, use BSP-based dungeon generation
    if (isDungeonBiome(biome.name)) {
      const allOtherData = { worldCoords };
      const mapData = generateDungeonBiomeUtil(biome, seed, allFeatures, adjacentBiomes, allOtherData);
      _persistStructureHints(allOtherData);
      yield;
      return mapData;
    }

    // For village biomes, use village path and house generation
    if (isVillageBiome(biome.name)) {
      const villageData = { worldCoords };
      const mapData = yield* generateVillageBiomeStepsUtil(biome, seed, allFeatures, adjacentBiomes, villageData);
      _persistStructureHints(villageData);
      yield;

      // After village generation, scatter terrain features on layers 1 and 2
      const rng = createSeededRandom(seed);

      // Collect water tiles to avoid placing features on them
      let waterTiles = [];
      for (const featureName of ["Water", "Ocean", "Beach"]) {
        if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
          for (const variant of allFeatures[featureName]) {
            if (variant.type === "single") {
              waterTiles.push(variant.tileId);
            }
          }
        }
      }

      // Collect path tiles to NEVER overwrite them (Path, PathDesert, PathIce, Road)
      let pathTiles = [];
      for (const featureName of ["Path", "PathDesert", "PathIce", "Road", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"]) {
        if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
          for (const variant of allFeatures[featureName]) {
            if (variant.type === "single") {
              pathTiles.push(variant.tileId);
            }
          }
        }
      }

      // Scatter features on layer 1 (noise-based)
      for (const feature of getFeaturesByLayer(biome, allFeatures, 1, FEATURE_LAYERS)) {
        yield* generateFeatureNoiseSteps(
          mapData,
          allFeatures[feature.name],
          1,
          PROC_MAP_WIDTH,
          PROC_MAP_HEIGHT,
          seed,
          0.15 * feature.density,
          rng,
          waterTiles,
          pathTiles
        );
      }

      // Scatter features on layer 2 (scattered)
      for (const feature of getFeaturesByLayer(biome, allFeatures, 2, FEATURE_LAYERS)) {
        yield* generateFeatureScatteredSteps(
          mapData,
          allFeatures[feature.name],
          2,
          PROC_MAP_WIDTH,
          PROC_MAP_HEIGHT,
          seed,
          0.05 * feature.density,
          rng,
          waterTiles,
          pathTiles
        );
      }

      // Crop plots for a biome that farms (see placeTilledFields).
      placeTilledFields(mapData, biome, allFeatures, seed, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);

      yield;

      // Civic signs: readable signposts (1-3), one bus stop, one camper park.
      placeCivicSigns(mapData, biome, allFeatures, seed, {
        post: [1, 3], bus: [1, 1], park: [1, 1],
      });

      return mapData;
    }

    // For city biomes, use grid-based city generation with roads and building lots
    if (isCityBiome(biome.name)) {
      const cityData = { worldCoords };
      const mapData = yield* generateCityBiomeStepsUtil(biome, seed, allFeatures, adjacentBiomes, cityData);
      _persistStructureHints(cityData);
      yield;
      // Civic signs: one roadside bus stop + one camper park (no readable signposts).
      placeCivicSigns(mapData, biome, allFeatures, seed, {
        bus: [1, 1], park: [1, 1],
      });
      return mapData;
    }

    // For burg biomes, use grid-based city generation with roads and building lots
    if (isBurgBiome(biome.name)) {
      const burgData = { worldCoords };
      const mapData = generateBurgBiomeUtil(biome, seed, allFeatures, adjacentBiomes, burgData);
      _persistStructureHints(burgData);
      yield;
      // Civic signs: one roadside bus stop + one camper park (no readable signposts).
      placeCivicSigns(mapData, biome, allFeatures, seed, {
        bus: [1, 1], park: [1, 1],
      });
      return mapData;
    }

    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const mapData = new Array(width * height * 4).fill(0);

    const rng = createSeededRandom(seed);

    // Normal biome terrain generation (non-cave)
    // Fill layer 0 with terrain features (those with terrain: true)
    // Uses weighted distribution based on density values
    yield* fillTerrainLayerSteps(mapData, biome, allFeatures, width, height, rng, adjacentBiomes);

    // Collect all water tiles (single-tile variants only) for feature placement checks
    let waterTiles = [];
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTiles.push(variant.tileId);
          }
        }
        if (waterTiles.length > 0) break;
      }
    }

    // Collect path tiles to NEVER overwrite them (Path, PathDesert, PathIce, Road)
    let pathTiles = [];
    for (const featureName of ["Path", "PathDesert", "PathIce", "Road", "DashedLine", "DashedLineHorizontal", "DashedLineVertical"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            pathTiles.push(variant.tileId);
          }
        }
      }
    }

    // For cave biomes, add Ceiling and CaveWall to blocked tiles (don't place features on them)
    let blockedTiles = [...waterTiles];
    if (isCaveBiome(biome.name)) {
      // Get the actual Ceiling and CaveWall tiles used in generation
      const caveFloorTiles = allFeatures["CaveFloor"] || [];
      const caveWallTiles = allFeatures["Ceiling"] || [];
      const caveWallFeatures = allFeatures["CaveWall"] || [];

      // Block Ceiling tiles
      for (const variant of caveWallTiles) {
        if (variant.type === "single") {
          blockedTiles.push(variant.tileId);
        } else if (variant.type === "multi") {
          for (const row of variant.tiles) {
            for (const tileId of row) {
              blockedTiles.push(tileId);
            }
          }
        }
      }

      // Block CaveWall tiles
      for (const variant of caveWallFeatures) {
        if (variant.type === "single") {
          blockedTiles.push(variant.tileId);
        } else if (variant.type === "multi") {
          for (const row of variant.tiles) {
            for (const tileId of row) {
              blockedTiles.push(tileId);
            }
          }
        }
      }
    }

    yield;

    // Only draw the coastline on non-cave biomes (road biome path)
    if (!isCaveBiome(biome.name) && waterTiles.length > 0) {
      drawWaterEdges(
        mapData,
        waterTiles,
        adjacentBiomes,
        seed,
        width,
        height,
        rng,
        cacheInfo,
        allFeatures,
        biome.name,
        {
          worldCoords,
          diagonalBiomes: cache
            ? checkDiagonalMapBiomesFromCache(worldCoords?.x || 0, worldCoords?.y || 0, cache)
            : null,
        }
      );
    }

    // After drawing water edges and corners, collect actual beach/water tile IDs
    // Only collect tiles that are at beach coordinates to avoid blocking all terrain blending
    const actualWaterAndBeachTiles = new Set();
    const beachCoords = window.ProcGenUtils?.beachCoordinates;
    if (beachCoords) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Only protect tiles the coastline pass actually drew (sea + sand)
          if (beachCoords.has(`${x},${y}`)) {
            const baseIdx = calculateIndex(x, y, 0, width, height);
            const tileId = mapData[baseIdx];
            if (tileId > 0) {
              actualWaterAndBeachTiles.add(tileId);
            }
          }
        }
      }
    }
    const actualWaterTilesArray = Array.from(actualWaterAndBeachTiles);

    yield;

    for (const feature of getFeaturesByLayer(biome, allFeatures, 1, FEATURE_LAYERS)) {
      yield* generateFeatureNoiseSteps(
        mapData,
        allFeatures[feature.name],
        1,
        width,
        height,
        seed,
        0.15 * feature.density,
        rng,
        blockedTiles,
        pathTiles
      );
    }

    for (const feature of getFeaturesByLayer(biome, allFeatures, 2, FEATURE_LAYERS)) {
      yield* generateFeatureScatteredSteps(
        mapData,
        allFeatures[feature.name],
        2,
        width,
        height,
        seed,
        0.05 * feature.density,
        rng,
        blockedTiles,
        pathTiles
      );
    }

    // Crop plots for a biome that farms (see placeTilledFields).
    placeTilledFields(mapData, biome, allFeatures, seed, width, height);

    yield;

    // For cave biomes, remove any features that overlap with Ceiling or CaveWall
    if (isCaveBiome(biome.name)) {
      const caveWallTiles = allFeatures["Ceiling"] || [];
      const caveWallFeatures = allFeatures["CaveWall"] || [];

      // Build set of blocked tile IDs
      const blockedTileSet = new Set();

      // Add Ceiling tiles
      for (const variant of caveWallTiles) {
        if (variant.type === "single") {
          blockedTileSet.add(variant.tileId);
        } else if (variant.type === "multi") {
          for (const row of variant.tiles) {
            for (const tileId of row) {
              blockedTileSet.add(tileId);
            }
          }
        }
      }

      // Add CaveWall tiles
      for (const variant of caveWallFeatures) {
        if (variant.type === "single") {
          blockedTileSet.add(variant.tileId);
        } else if (variant.type === "multi") {
          for (const row of variant.tiles) {
            for (const tileId of row) {
              blockedTileSet.add(tileId);
            }
          }
        }
      }

      // Second pass: remove features on Ceiling or CaveWall tiles
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const baseIdx = calculateIndex(x, y, 0, width, height);
          // If base layer is Ceiling or CaveWall
          if (blockedTileSet.has(mapData[baseIdx])) {
            // Clear any features on layers 1-3
            for (let z = 1; z <= 3; z++) {
              const idx = calculateIndex(x, y, z, width, height);
              mapData[idx] = 0;
            }
          }
        }
      }
    }

    // Blend terrain from adjacent biomes at map borders for seamless transitions
    // Uses global Perlin noise for organic, non-triangular blending
    // Use the actual water tiles to avoid overwriting beaches
    yield* blendBiomesTerrainOnlySteps(mapData, biome, adjacentBiomes, allFeatures, width, height, seed, rng, worldCoords, actualWaterTilesArray);

    yield;

    // ...and then wall the sea floor back in, over the blend, wherever the
    // square next to it is not sea floor as well.
    sealSeabedUndergroundBorders(
      mapData, biome, allFeatures, adjacentBiomes, worldCoords, cache, width, height
    );

    // Clear any features in forbidden zones (borders and center)
    if ((biome.name !== "Ocean") && (biome.name !== "Seabed")) {
      clearForbiddenZoneFeatures(mapData, width, height);

    }


    // Create region data for water tile detection in MovementInteractionSystem
    const regiondata = new Array(width * height).fill(0);

    // Identify water tile IDs from the biome features
    let waterTileIds = new Set();
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
        for (const variant of allFeatures[featureName]) {
          if (variant.type === "single") {
            waterTileIds.add(variant.tileId);
          }
        }
      }
    }

    // Mark all water tiles with region ID 99 for MovementInteractionSystem detection
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[baseIdx];

        if (waterTileIds.has(tileId)) {
          const regionIdx = y * width + x;
          regiondata[regionIdx] = 99;
        }
      }
    }

    // Attach region data to map data for $gameMap.regionId() calls
    mapData.regiondata = regiondata;

    return mapData;
  }

  // ===== GAME SYSTEM EXTENSIONS =====

  /**
   * Initialize procedural generation data on Game_System
   */
  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _Game_System_initialize.call(this);
    this._procGenData = {
      originX: 0,
      originY: 0,
      currentBiome: null,
      currentRoadDirection: null,
      currentBiomeTileset: null,
      generatedMapData: null,
      biomeToTileset: {},
      mapPreloaded: false,
      seed: 12345,
      biomeCoordinateCache: {},
      lastLoadedProcMapX: null,
      lastLoadedProcMapY: null,
      displayAsBeach: false,
      biomeLayerStack: [],
    };
  };

  /**
   * Build a cache of biome coordinates for all biomes on the world map
   * If the player (actor 1) is named "Test", the cache is always regenerated
   * from scratch to reflect any tile changes made during editing/playtesting.
   */
  Game_System.prototype.buildBiomeCoordinateCache = function () {
    // Test player: force fresh biome cache regeneration
    if (isTestPlayer()) {
      if (this._procGenData) {
        this._procGenData.biomeCoordinateCache = {};
      }
      invalidateBiomeIndex();
      log(`[buildBiomeCoordinateCache] Test player detected: forcing cache regeneration`);
    }

    if (!$gameMap || $gameMap.mapId() !== WORLD_MAP_ID) {
      log(`[buildBiomeCoordinateCache] Cannot build: mapId=${$gameMap ? $gameMap.mapId() : 'null'}, WORLD_MAP_ID=${WORLD_MAP_ID}`);
      return;
    }

    const cache = {};
    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();

    for (const biome of Biomes) {
      cache[biome.name] = [];
    }

    let coordsAdded = 0;
    const riverCoordMap = {};
    const bridgeCoordMap = {};
    // The terrain a road or a crossing runs across, kept only for the squares
    // that have one: it is what dresses a road's verges, and a square read back
    // out of the snapshot has no column left to read it off.
    const underBiomeMap = {};
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const cls = classifyWorldColumn((z) => $gameMap.tileId(x, y, z));
        // Latitude is a fact about the square (Ice -> Permafrost/Tundra), so it
        // is resolved up front. The specialBiomes roll is NOT: it depends on the
        // world seed, and this cache is shared across worlds - it is exported to
        // BiomesMap.json and preloaded by every other one. Storing the roll
        // froze one world's SpiritWoods into every world that read the snapshot,
        // and the map generated on entry (which rolls live) disagreed with it.
        // getBiomeFromCache makes the roll on read instead, so the cache still
        // reports specials, and reports the ones THIS world has.
        const biomeName = cls.biome
          ? normalizeLatitudeBiome(cls.biome, y)
          : cls.biome;
        if (biomeName) {
          if (!cache[biomeName]) {
            cache[biomeName] = [];
          }
          cache[biomeName].push({ x, y });
          coordsAdded++;
        }
        if (cls.riverTileId) riverCoordMap[`${x},${y}`] = cls.riverTileId;
        // Bridge markers drive the river+road crossing generation.
        if (cls.bridge) bridgeCoordMap[`${x},${y}`] = cls.bridge;
        if (cls.underBiome && cls.underBiome !== cls.biome) {
          underBiomeMap[`${x},${y}`] = cls.underBiome;
        }
      }
    }

    this._procGenData.biomeCoordinateCache = cache;
    this._procGenData.riverCoordMap = riverCoordMap;
    this._procGenData.bridgeCoordMap = bridgeCoordMap;
    this._procGenData.underBiomeMap = underBiomeMap;

    // Playtesting as "Test" republishes js/db/WorldGen/BiomesMap.json from what
    // was just scanned, so the snapshot shipped to normal players tracks the
    // edits instead of drifting out of date with map 315.
    if (isTestPlayer() && exportBiomesMapToFile) {
      exportBiomesMapToFile(cache, riverCoordMap, bridgeCoordMap, underBiomeMap);
    }

    const totalCoords = Object.values(cache).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    log(`[buildBiomeCoordinateCache] Built cache: scanned ${mapWidth}x${mapHeight}=${mapWidth * mapHeight} tiles, added ${coordsAdded} coordinates to ${Object.keys(cache).length} biomes`);

    // Log sample biomes in cache (debug only - skip the per-biome string building otherwise)
    if (Utils.isOptionValid("test")) {
      for (const [biomeName, coords] of Object.entries(cache)) {
        if (coords.length > 0) {
          log(`  ${biomeName}: ${coords.length} coords, samples: (${coords.slice(0, 3).map(c => `${c.x},${c.y}`).join(") (")})`);
        }
      }
    }
  };

  /**
   * Get biome from world tile using highest priority layer
   */
  Game_System.prototype.getBiomeFromWorldCoordinates = function (x, y) {
    // A river painted over a land biome (world-map layer 2/3) must not hijack the
    // tile into a full river-biome map: classify by the underlying biome and let
    // the generator draw the river as an overlay inside it.
    const baseBiome = classifyWorldColumn((z) => $gameMap.tileId(x, y, z)).biome;
    // Mirror the generator: normalize Ice by latitude first, then apply the same
    // specialBiomes roll, so a tile the player has not entered yet still reports
    // SpiritWoods/Crystals rather than its parent biome. Roads/rivers carry a
    // direction suffix, resolve to no biome definition, and pass through as-is.
    return resolveSpecialBiome(normalizeLatitudeBiome(baseBiome, y), x, y);
  };

  /**
   * The terrain biome a road at (x, y) is painted over ("Fields", "Mountain",
   * ...), resolved exactly like the primary biome so a road across SpiritWoods
   * reports SpiritWoods. Returns null when the column is nothing but road.
   */
  Game_System.prototype.getUnderBiomeFromWorldCoordinates = function (x, y) {
    const under = classifyWorldColumn((z) => $gameMap.tileId(x, y, z)).underBiome;
    if (!under) return null;
    return resolveSpecialBiome(normalizeLatitudeBiome(under, y), x, y);
  };

  // ---------------------------------------------------------------------------
  // O(1) biome lookup index
  //
  // getBiomeFromCache used to linear-scan every biome's coordinate array (up to
  // 65,536 {x,y} entries on the 256x256 world map) on every call, and it runs
  // ~2x/sec from the HUD. We build an inverted index (key -> biomeName) once and
  // reuse it. The index lives in module scope so it is never serialized into
  // saves; it is rebuilt automatically whenever the underlying cache object is
  // replaced (build) and explicitly invalidated on in-place mutation.
  // ---------------------------------------------------------------------------
  let _biomeIndex = null; // Map<number, string>
  let _biomeIndexSource = null; // the biomeCoordinateCache object it was built from

  const biomeKey = (x, y) => x * 100000 + y;

  function invalidateBiomeIndex() {
    _biomeIndex = null;
    _biomeIndexSource = null;
  }

  function getBiomeIndex(procGenData) {
    const cache = procGenData ? procGenData.biomeCoordinateCache : null;
    if (!cache) return null;
    if (_biomeIndex && _biomeIndexSource === cache) return _biomeIndex;

    const index = new Map();
    for (const biomeName in cache) {
      const coords = cache[biomeName];
      if (!coords) continue;
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        // First biome wins, matching the previous Object.entries scan order.
        const key = biomeKey(c.x, c.y);
        if (!index.has(key)) index.set(key, biomeName);
      }
    }
    _biomeIndex = index;
    _biomeIndexSource = cache;
    return index;
  }

  /**
   * Get biome name from cache for given world coordinates
   */
  Game_System.prototype.getBiomeFromCache = function (x, y) {
    const index = getBiomeIndex(this._procGenData);
    if (index) {
      const biomeName = index.get(biomeKey(x, y));
      // Resolve on read as well as on build. The cache may predate this logic
      // (old saves) or come straight from BiomesMap.json, and either can hold
      // the bare parent biome.
      //
      // A special biome already IN the cache is unwrapped back to its parent
      // before the roll (see unwrapSpecialBiome): the roll belongs to a world
      // seed, the snapshot does not, so a SpiritWoods frozen into BiomesMap.json
      // by the world it was exported from must be rolled again for the world
      // being played - otherwise the cache says SpiritWoods everywhere it is
      // read while the map generated on entry, which rolls live, comes out
      // Forest.
      if (biomeName) {
        return resolveSpecialBiome(
          normalizeLatitudeBiome(unwrapSpecialBiome(biomeName), y), x, y);
      }
    }

    if ($gameMap.mapId() === WORLD_MAP_ID) {
      return this.getBiomeFromWorldCoordinates(x, y);
    }

    return "Fields";
  };

  // ---------------------------------------------------------------------------
  // Country lookup by world coordinate
  //
  // The world map paints one region id per country, matching the `id` field in
  // js/db/WorldGen/Countries.json (WeatherSystem.setCurrentCountry reads the same
  // ids to pick the active country). Quest boards and other UI need that answer
  // for arbitrary coordinates while standing somewhere else entirely, so cache
  // the world map's region plane once. The 1.3MB Map315.json is only read when
  // we are not already standing on it.
  // ---------------------------------------------------------------------------
  let _worldRegionLayer = null; // Uint16Array, one region id per world tile
  let _worldRegionSize = null;  // { width, height } of the layer above

  function worldRegionLayer() {
    if (_worldRegionLayer) return _worldRegionLayer;

    // The snapshot carries the region plane run-length encoded (BiomesMap.json
    // "regions"), so the country under any coordinate is known without parsing
    // the 1.3MB world map. Only a world map that is already loaded beats it.
    if (!($gameMap && $gameMap.mapId() === WORLD_MAP_ID && $dataMap && $dataMap.data)) {
      const snapshot = Utils2.loadBiomesMapFromFile ? Utils2.loadBiomesMapFromFile() : null;
      const expanded = snapshot && Utils2.expandWorldRegionRLE
        ? Utils2.expandWorldRegionRLE(snapshot.regions) : null;
      if (expanded) {
        _worldRegionLayer = expanded.layer;
        _worldRegionSize = { width: expanded.width, height: expanded.height };
        return _worldRegionLayer;
      }
    }

    let data = null;
    let w = 0;
    let h = 0;
    if ($gameMap && $gameMap.mapId() === WORLD_MAP_ID && $dataMap && $dataMap.data) {
      data = $dataMap.data;
      w = $dataMap.width;
      h = $dataMap.height;
    } else {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "data/Map" + String(WORLD_MAP_ID).padStart(3, "0") + ".json", false);
        xhr.overrideMimeType("application/json");
        xhr.send();
        if (xhr.status === 200) {
          const map = JSON.parse(xhr.responseText);
          data = map.data;
          w = map.width;
          h = map.height;
        }
      } catch (e) {
        // Leave the cache empty; callers treat a missing layer as "no country".
      }
    }
    if (!data || !w || !h) return null;

    // Plane 5 is the region layer, the same one Game_Map.regionId reads.
    const base = 5 * w * h;
    const layer = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) layer[i] = data[base + i] || 0;
    _worldRegionLayer = layer;
    _worldRegionSize = { width: w, height: h };
    return layer;
  }

  /**
   * Region id painted on the world map at (x, y), 0 when unpainted or off-map.
   */
  Game_System.prototype.getWorldRegionId = function (x, y) {
    const layer = worldRegionLayer();
    if (!layer || !_worldRegionSize) return 0;
    const { width, height } = _worldRegionSize;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return layer[y * width + x];
  };

  /**
   * The Countries.json entry owning world coordinates (x, y), or null on
   * unclaimed ground. Region id 0 means "nothing painted here", and several
   * Countries.json entries carry a placeholder id of 0, so it never resolves to
   * a country. Duplicated ids (Albania/Montenegro, Germany/Portugal) resolve to
   * the first match, exactly as WeatherSystem and ArmyEventsManager do.
   */
  Game_System.prototype.getCountryFromWorldCoordinates = function (x, y) {
    const id = this.getWorldRegionId(x, y);
    if (!id) return null;
    const list = window.WorldGen && window.WorldGen.Countries;
    if (!Array.isArray(list)) return null;
    return list.find(c => c && c.id === id) || null;
  };

  /**
   * Bridge orientation ("vertical" / "horizontal") for world coordinates, or
   * null when the tile is not a river crossing. Reads the cached scan when it is
   * available and falls back to reading the world map column directly.
   */
  Game_System.prototype.getBridgeDirectionAt = function (x, y) {
    const cached = this._procGenData && this._procGenData.bridgeCoordMap;
    if (cached) {
      return cached[`${x},${y}`] || null;
    }

    if ($gameMap && $gameMap.mapId() === WORLD_MAP_ID) {
      for (let z = 3; z >= 0; z--) {
        const dir = getBridgeDirectionFromWorldTileId($gameMap.tileId(x, y, z));
        if (dir) return dir;
      }
    }
    return null;
  };

  /**
   * Get road direction from world coordinates via cache lookup
   */
  Game_System.prototype.getRoadDirectionFromCache = function (x, y) {
    for (let z = 3; z >= 0; z--) {
      const tileId = $gameMap.tileId(x, y, z);
      if (tileId && tileId !== 0) {
        const direction = getRoadDirectionFromWorldTile(tileId);
        if (direction) {
          return direction;
        }
      }
    }
    return null;
  };

  /**
   * Generate procedural map from world map coordinates
   */
  Game_System.prototype.generateProceduralMap = function () {
    const VAR_WORLD_X = 43;
    const VAR_WORLD_Y = 44;

    let originX = $gameVariables.value(VAR_WORLD_X);
    let originY = $gameVariables.value(VAR_WORLD_Y);

    // On the world map the player's current tile IS the world coordinate, so treat it
    // as authoritative and (re)sync vars 43/44 to it. This prevents generating at a
    // stale location after the player walked on the world map without a transfer
    // committing the vars. The cache is only rebuilt if missing (full-map scan).
    //
    // Exception: when the 3D VoxelWorldSystem is active, vars 43/44 are updated
    // per waypoint and reflect the van's actual world position. $gamePlayer.x/y is
    // stuck at the ship vehicle's parked tile, so trust the existing vars instead.
    if ($gameMap.mapId() === WORLD_MAP_ID) {
      if (!window.VoxelWorldSystem || !window.VoxelWorldSystem.isActive()) {
        originX = $gamePlayer.x;
        originY = $gamePlayer.y;

        $gameVariables.setValue(VAR_WORLD_X, originX);
        $gameVariables.setValue(VAR_WORLD_Y, originY);
      }

      // Rebuild when the bridge scan is missing too, so saves made before bridge
      // markers existed pick them up instead of silently generating no crossings.
      //
      // A Test player always rebuilds: the world map is being edited live, so any
      // cache carried in the save describes the map as it was before the edit.
      // Without this the rebuild never runs (the existing cache satisfies the
      // check) and freshly painted roads, rivers and bridges are invisible to the
      // generator. The scan is one pass over map 315 and only ever runs for Test.
      if (
        !this._procGenData.biomeCoordinateCache ||
        !this._procGenData.bridgeCoordMap ||
        isTestPlayer()
      ) {
        this.buildBiomeCoordinateCache();
      }
    } else if (originX === 0 && originY === 0 && !this._procGenData.alienGrid) {
      // Off the world map with an unset origin normally means "never
      // generated yet". An alien planet's landing grid legitimately starts
      // at (0,0) for some squares, so that case is not a bail-out signal.
      return false;
    }

    this._procGenData.originX = originX;
    this._procGenData.originY = originY;

    // Whether the live world-map tile column is readable. Everything that cannot
    // be read off it falls back to the coordinate cache so both entry paths
    // ("Visit X" straight from map 315, or walking across a biome border) resolve
    // the same coordinate to the same map.
    const onWorldMap = $gameMap.mapId() === WORLD_MAP_ID;

    let biomeName = "Fields";
    let roadDirection = null;

    // A GalaxySim alien-planet landing grid (see GalaxySim_Core.js
    // enterPlanetSurface / WorldMapReturn.js's toroidal-wrap edge crossing):
    // (originX, originY) here is the planet-local grid cell, small and
    // bounded, so it must never be checked against Earth's bridge/override
    // caches -- those numbers can coincidentally match real Earth world-map
    // coordinates. The whole planet is a single biome and always resolves
    // directly.
    //
    // Standing on Earth's world map is proof the landing is over, whatever the
    // stored grid still says (a save made before the grid was cleared on
    // leaving, GalaxySim_Core's clearAlienSurfaceState): map 315 is Earth, so
    // the square is resolved against Earth and the grid is dropped for good.
    let alienGrid = this._procGenData.alienGrid;
    if (alienGrid && onWorldMap) {
      this._procGenData.alienGrid = null;
      alienGrid = null;
      if (/^Alien/.test(String(this._procGenData.currentBiome || ""))) {
        this._procGenData.currentBiome = null;
      }
    }

    // Off map 315 the coordinate cache is the ONLY record of what the world
    // holds where: the live tile column cannot be read, so a square entered by
    // walking out of a town's gate resolves its biome, its bridge, its river and
    // all four of its neighbours out of the snapshot. An empty cache therefore
    // does not degrade gracefully - it answers "Fields" with no neighbours at
    // all, which is why the coastal square outside a gate came up as unbroken
    // grassland running over the sea while the same square visited off the world
    // map had its beach and its ocean. Every other off-map entry already loads
    // BiomesMap.json when the save carries no cache (the origin path, the square
    // resolver); this one did not, so it does now, once, before anything is read.
    if (!onWorldMap && !alienGrid) ensureBiomeCoordinateCache(this._procGenData);

    // A bridge marker on the world map wins over every other classification:
    // the crossing is always a road running along the marker's orientation with
    // a river drawn underneath it.
    const bridgeDirection = alienGrid ? null : this.getBridgeDirectionAt(originX, originY);
    this._procGenData.currentBridgeDirection = bridgeDirection;

    // Check for hardcoded biome overrides first
    const hardcodedOverride = alienGrid ? null : getHardcodedBiomeOverride(originX, originY);

    if (bridgeDirection) {
      biomeName = "Bridge";
      roadDirection = bridgeDirection;
      log(`[ProceduralMap] Bridge (${bridgeDirection}) at (${originX}, ${originY})`);
    } else if (alienGrid) {
      biomeName = alienGrid.biome;
    } else if (hardcodedOverride) {
      // Use hardcoded biome and optional road direction
      biomeName = hardcodedOverride.biome;
      roadDirection = hardcodedOverride.roadDirection || null;
    } else {
      // Auto-detection prefers the LIVE world-map tile column, because the
      // coordinate cache can be preloaded from js/db/WorldGen/BiomesMap.json and
      // that snapshot goes stale whenever map 315 is repainted: a snapshot
      // listing roads a repaint has moved reports real road tiles as "Fields",
      // isRoadBiome() says no, and the asphalt-and-centre-line branch never runs.
      //
      // But the live column is only legible FROM map 315. Off it, $gameMap is
      // whichever 64x64 submap the party is standing in, and reading a column out
      // of that answers with a biome that has nothing to do with the square being
      // built -- most of its tile ids mean nothing to the world-map palette and
      // fall through to "Fields". That is why a square entered by walking out of
      // an authored map came up as open grassland however much sea the world map
      // had painted there. So off the world map the cache is the only honest
      // answer, and rawWorldBiomeAt is the shared rule: live column where it can
      // be read, cache where it cannot, "Fields" only when neither can answer.
      const worldTileBiome = rawWorldBiomeAt(
        originX, originY, this._procGenData.biomeCoordinateCache, onWorldMap
      );

      let lookupBiomeName = worldTileBiome;

      if (worldTileBiome.startsWith("Road ")) {
        roadDirection = worldTileBiome.substring(5).toLowerCase();
        lookupBiomeName = "Road";
      }

      // A cached name can be a special rolled for a DIFFERENT world (the snapshot
      // is shared across worlds), so it is unwrapped to its parent and rolled
      // again here, exactly as the square resolver does.
      biomeName = resolveSpecialBiome(unwrapSpecialBiome(lookupBiomeName), originX, originY);
    }

    // Ice biome should become Tundra or Permafrost depending on Y coordinate
    if (biomeName === "Ice") {
      // Y=0 is north pole, Y=255 is south pole
      // Tundra: milder cold (mid-latitudes), Permafrost: extreme poles
      if (originY < 48 || originY >= 208) {
        biomeName = "Permafrost";
        log(`[ProceduralMap] Ice -> Permafrost at (${originX}, ${originY})`);
      } else {
        biomeName = "Tundra";
        log(`[ProceduralMap] Ice -> Tundra at (${originX}, ${originY})`);
      }
    }

    const biome = getBiomeByName(biomeName);

    if (!biome) {
      logWarn(`Biome not found: ${biomeName}, using Fields`);
      const defaultBiome = getBiomeByName("Fields");
      if (!defaultBiome) {
        logWarn(`Critical: Fields biome not defined`);
        return false;
      }
      biomeName = "Fields";
    }

    // Apply the shared specialBiomes roll (see ProcGenUtils.resolveSpecialBiome).
    // The same call backs the travel HUD and the debug overlay, so all three
    // agree on which tiles are SpiritWoods/Crystals.
    // A bridge is never rerolled: swapping the biome would drop the crossing.
    const specialBiomeName = bridgeDirection
      ? biomeName
      : resolveSpecialBiome(biomeName, originX, originY);
    if (specialBiomeName !== biomeName) {
      log(`[ProceduralMap] Assigning special biome "${specialBiomeName}" to coordinates (${originX}, ${originY})`);
      // The cache is NOT rewritten to match. It records what the world map
      // holds, one entry per square, and the roll is not that: it is made from
      // the world seed and getBiomeFromCache makes it again on every read, so
      // the cache already reports this square as SpiritWoods without being
      // touched. Moving the coordinate into the special biome's list used to
      // look harmless and was not - it changed what the NEIGHBOURING squares
      // read as their adjacent biome, so a square generated before its
      // neighbour had ever been entered came out different from the same
      // square generated after. Squares have to regenerate identically however
      // the party got to them (see scripts/test_originsquare.js).
      biomeName = specialBiomeName;
    }

    this._procGenData.currentBiome = biomeName;
    this._procGenData.currentRoadDirection = roadDirection;

    // A road is painted over a terrain biome on the world map. Record it so the
    // road generator can dress the verges with that biome's own features instead
    // of leaving bare asphalt-and-grass. Settlements are excluded: a road through
    // a city/village/burg keeps the plain civic look.
    //
    // Read off the live column only while that is legible; off map 315 it is the
    // submap under the party and says nothing about this square, so the scan
    // stored with the biome cache answers instead (snapshotUnderBiome applies the
    // same filtering to it).
    let underBiomeName = null;
    if (isRoadBiome(biomeName) && !onWorldMap) {
      underBiomeName = snapshotUnderBiome(this, biomeName, originX, originY);
    } else if (isRoadBiome(biomeName)) {
      const under = this.getUnderBiomeFromWorldCoordinates(originX, originY);
      if (
        under &&
        under !== biomeName &&
        !isRoadBiome(under) &&
        !isCityBiome(under) &&
        !isVillageBiome(under) &&
        !isBurgBiome(under)
      ) {
        underBiomeName = under;
      }
    }
    this._procGenData.currentUnderBiome = underBiomeName;

    const tilesetId = biome.tilesetId;
    this._procGenData.currentBiomeTileset = tilesetId;

    // Store biome temperature data for weather system
    this._procGenData.biomeDayTemperature = biome.dayTemperature || 20;
    this._procGenData.biomeNightTemperature = biome.nightTemperature || 10;

    // Re-anchor the master seed to the world's history seed every generation so
    // each world seed (and each starting-year default seed) produces a wholly
    // different map at the same coordinate, while a given (seed, x, y) stays
    // reproducible across revisits. procMapSeed is the single seed formula every
    // entry point into map 636 shares (see ProcGenUtils.procMapSeed).
    // This path always resolves the SURFACE biome off the world-map tile, so it
    // is always the depth-0 seed.
    this._procGenData.seed = getWorldSeed();
    const seed = procMapSeed(originX, originY);

    // ADJACENCY. What the four squares around this one are, which is what the
    // coastline pass cuts the sea and lays the sand band against, and what
    // decides whether a Fields square is shown as a Beach at all.
    //
    // It must not depend on the map the party happens to be standing on when
    // the square is built. It used to: adjacency was read only while standing on
    // map 315, and a square entered any other way -- walking out of a town, a
    // door, any authored map that hands the party back to the overland -- was
    // built with all four neighbours unknown. Unknown neighbours mean no water
    // on any side, so the same coastal square that has a sea and a beach when
    // visited off the world map came up as unbroken grassland when left through
    // a building, and the ocean next to it simply was not drawn.
    //
    // So it is read the way the stitched window has always read it (see
    // resolveSquareUncached): the live tile column while that is legible, and
    // the coordinate cache otherwise, with the cache winning where the two
    // disagree because it carries the resolved names (a road painted over
    // fields reports the road). The cache being a stale BiomesMap.json snapshot
    // is guarded where it is built rather than here -- a playtest session
    // rebuilds it from the live tiles (isTestPlayer) -- and a square that no
    // path can agree on is worse than a square built from a snapshot an edit or
    // two behind.
    //
    // A planet's landing grid is exempt: its (gx, gy) is planet-local and may
    // coincide with a real Earth coordinate, so none of Earth's caches may be
    // consulted for it.
    let adjacentBiomes = null;
    let diagonalBiomes = null;
    let cacheInfo = null;

    const coordCache = alienGrid ? null : this._procGenData.biomeCoordinateCache;
    const hasCoordCache = coordCache && Object.keys(coordCache).length > 0;

    if (onWorldMap && !alienGrid) {
      adjacentBiomes = getAdjacentBiomesOnWorldMap(originX, originY);
    }

    if (hasCoordCache) {
      // Cache values win: they are the resolved names (roads placed over fields
      // and so on), where the raw tile column is only what is painted.
      const cachedAdjacent = getAdjacentBiomesFromCache(originX, originY, coordCache);
      adjacentBiomes = adjacentBiomes || { north: null, south: null, east: null, west: null };
      for (const side of ["north", "south", "east", "west"]) {
        adjacentBiomes[side] = cachedAdjacent[side] || adjacentBiomes[side];
      }
      cacheInfo = checkAdjacentMapBiomesFromCache(originX, originY, coordCache);
      diagonalBiomes = checkDiagonalMapBiomesFromCache(originX, originY, coordCache);
    }

    if (adjacentBiomes) {
      adjacentBiomes = {
        north: normalizeBiomeForEdge(adjacentBiomes.north),
        south: normalizeBiomeForEdge(adjacentBiomes.south),
        east: normalizeBiomeForEdge(adjacentBiomes.east),
        west: normalizeBiomeForEdge(adjacentBiomes.west),
      };
    }

    // Check if Fields biome should display as Beach
    this._procGenData.displayAsBeach = shouldDisplayAsBeach(biomeName, adjacentBiomes, diagonalBiomes);

    // Check if biome should display as Island (virtual biome - name, enemies, battle BG only)
    this._procGenData.displayAsIsland = shouldDisplayAsIsland(biomeName, adjacentBiomes);

    const worldCoords = { x: originX, y: originY };
    // An alien landing grid's (gx, gy) is planet-local and small, so it can
    // coincidentally land on real Earth world-map coordinates. Feeding those
    // into Earth's cache is exactly the bridge/hardcodedOverride mismatch
    // already guarded above (alienGrid), and it leaks in here too: diagonal
    // water lookups (checkDiagonalMapBiomesFromCache in drawWaterEdges) would
    // read Earth's coastline at that coordinate and draw a beach/water corner
    // on an alien surface nowhere near any sea.
    this._procGenData.generatedMapData = generateProceduralTerrain(
      biome,
      seed,
      roadDirection,
      adjacentBiomes,
      cacheInfo,
      worldCoords,
      alienGrid ? null : this._procGenData.biomeCoordinateCache
    );

    // Play biome BGS if defined (night or day version)
    const finalBiome = getBiomeByName(biomeName);
    if (finalBiome) {
      // Determine if it's nighttime
      const dateStr = $gameVariables.value(113) || "01 JAN 2001 12:00";
      const parts = dateStr.split(" ").filter(Boolean);
      const timeParts = parts[3] ? parts[3].split(":") : ["12", "00"];
      const currentHour = parseInt(timeParts[0]) || 12;

      // Night is from 20:00 to 6:00
      const isNightTime = currentHour >= 20 || currentHour < 6;

      // Choose appropriate BGS array based on time of day. Blank entries are
      // discarded, and an empty list means the biome has no ambience at all,
      // which stops whatever BGS was playing (the BGM is left untouched).
      const clean = (arr) => (arr || []).filter((n) => n && n.trim());
      const nightList = clean(finalBiome.bgsNight);
      const bgsArray = isNightTime && nightList.length > 0 ? nightList : clean(finalBiome.bgs);

      if (bgsArray.length > 0) {
        const rng = createSeededRandom(seed + originX * 7 + originY * 13);
        const bgsName = bgsArray[Math.floor(rng() * bgsArray.length)];
        // Above ground this ambience is the weather bed, so it is played through
        // WeatherAudio and follows the Weather Volume slider; below ground it is
        // room tone and keeps its authored level on the plain BGS volume.
        const bgs = { name: bgsName, volume: 80, pitch: 100, pan: 0 };
        if (window.WeatherAudio && window.WeatherAudio.playAmbience) {
          window.WeatherAudio.playAmbience(bgs);
        } else {
          AudioManager.playBgs(bgs);
        }
      } else {
        AudioManager.stopBgs();
      }

      applyBiomeBgm(biomeName, finalBiome, seed, originX, originY);
    } else {
      AudioManager.stopBgs();
      applyBiomeBgm(biomeName, null, seed, originX, originY);
    }

    return true;
  };

  // Only the enclosed places carry music of their own: a crypt, a sewer, a
  // dungeon, a cave. Out in the open the procedural map is scored by its
  // ambience alone, so walking back up a staircase into the daylight stops
  // whatever the room below was playing.
  function applyBiomeBgm(biomeName, biomeEntry, seed, originX, originY) {
    const list = (biomeEntry && Array.isArray(biomeEntry.bgm))
      ? biomeEntry.bgm.filter((n) => n && n.trim())
      : [];
    if (!isInteriorBiome(biomeName || "") || list.length === 0) {
      AudioManager.stopBgm();
      return;
    }
    // Seeded on the square, so the same crypt keeps the same theme and a walk
    // through its rooms never reshuffles the music.
    const rng = createSeededRandom(seed + originX * 31 + originY * 17);
    const name = list[Math.floor(rng() * list.length)];
    const current = AudioManager._currentBgm;
    if (current && current.name === name) return;
    AudioManager.playBgm({ name: name, volume: 70, pitch: 100, pan: 0 });
  }

  // ==========================================================================
  // Overland origins: the world square a character-creation origin starts on
  // ==========================================================================

  // Curated open, passable, overland biomes (no water, indoor, structured or
  // abstract biomes) so a passable spawn zone is reliably available. Shared by
  // every origin that drops the party out in the world.
  const OVERLAND_ORIGIN_BIOMES = [
    "Fields", "Meadows", "Forest", "ForestTropical", "Desert", "Savannah",
    "Steppe", "Taiga", "Tundra", "Snow", "Highlands", "Jungle", "Bamboo",
    "Mushroom", "Park", "Farm", "SaltFlats", "Badlands", "Canyon",
    "Permafrost", "MountainDesert",
  ];

  // The world snapshot every origin is resolved against. The world map is not
  // the map being stood on while a character is created, so its live tile
  // columns cannot be read: BiomesMap.json is the only record of what the world
  // holds where, and it is loaded into the save's own cache the first time one
  // of these is asked for.
  //
  // The WHOLE snapshot is installed, exactly as the world-map preload installs
  // it (ProcGenUtils.buildBiomeCoordinateCache): the biome coordinates, the
  // river overlays, the bridge markers, the terrain under roads and the
  // precomputed road/river intersections. Loading the biome list alone was how
  // an origin square ended up a different place from the same square entered
  // off the world map - no river through it, no crossing on it, bare verges
  // along its roads - even though both were generated from the same seed.
  const SNAPSHOT_FIELDS = ["riverCoordMap", "bridgeCoordMap", "underBiomeMap",
    "precomputedRoadDirections", "precomputedRiverDirections"];

  function ensureBiomeCoordinateCache(procGenData) {
    let cache = procGenData && procGenData.biomeCoordinateCache;
    if (cache && Object.keys(cache).length > 0) return cache;
    const loaded = Utils2.loadBiomesMapFromFile ? Utils2.loadBiomesMapFromFile() : null;
    if (loaded && loaded.biomeCoordinateCache) {
      cache = loaded.biomeCoordinateCache;
      if (procGenData) {
        procGenData.biomeCoordinateCache = cache;
        procGenData.riverCoordMap = loaded.riverCoords || {};
        // Absent in snapshots exported before bridges existed: left undefined
        // rather than empty, so the generator rescans the tiles instead of
        // reporting a world with no river crossings in it.
        if (loaded.bridgeCoords) procGenData.bridgeCoordMap = loaded.bridgeCoords;
        if (loaded.underBiomes) procGenData.underBiomeMap = loaded.underBiomes;
        if (loaded.roadDirections) procGenData.precomputedRoadDirections = loaded.roadDirections;
        if (loaded.riverDirections) procGenData.precomputedRiverDirections = loaded.riverDirections;
      }
    }
    return cache;
  }

  // Everything the world-map entry reads off the live tile column, read off the
  // snapshot instead, in the same order and with the same rules
  // (generateProceduralMap): a bridge marker wins over everything, then a
  // hardcoded override, then the square's own biome - which the cache already
  // holds latitude-normalized and special-biome-resolved, and which carries its
  // direction in its name for roads ("Road east").
  function resolveSquareFromSnapshot(gameSystem, x, y) {
    const bridgeDirection = gameSystem.getBridgeDirectionAt(x, y);
    if (bridgeDirection) {
      // A bridge is never rerolled into a special biome: swapping it would drop
      // the crossing.
      return { biomeName: "Bridge", roadDirection: bridgeDirection, bridgeDirection };
    }

    const override = getHardcodedBiomeOverride(x, y);
    if (override) {
      return {
        biomeName: resolveSpecialBiome(normalizeLatitudeBiome(override.biome, y), x, y),
        roadDirection: override.roadDirection || null,
        bridgeDirection: null,
      };
    }

    let biomeName = gameSystem.getBiomeFromCache(x, y);
    let roadDirection = null;
    if (typeof biomeName === "string" && biomeName.startsWith("Road ")) {
      roadDirection = biomeName.substring(5).toLowerCase();
      biomeName = "Road";
    }
    // The cache is NOT already rolled for the world in hand: it can be preloaded
    // from a BiomesMap.json snapshot exported from another world, and a special
    // rolled there ("SpiritWoods") belongs to that world's seed and not to this
    // one. resolveSquare unwraps and re-rolls every name it reads; so does this,
    // or the square the party is put down on is named one thing by the origin
    // and another by the resolver - and the stitched window, which is guarded on
    // the two agreeing, then collapses and every border crossing costs a fade.
    biomeName = resolveSpecialBiome(
      normalizeLatitudeBiome(unwrapSpecialBiome(biomeName), y), x, y);
    return { biomeName, roadDirection, bridgeDirection: null };
  }

  // The terrain a road or a crossing is painted over, off the snapshot, filtered
  // by the rules the world-map entry applies to the live column: a road dresses
  // its verges with that terrain's own features, and a road through a
  // settlement keeps the plain civic look.
  function snapshotUnderBiome(gameSystem, biomeName, x, y) {
    if (!isRoadBiome(biomeName)) return null;
    const map = gameSystem._procGenData && gameSystem._procGenData.underBiomeMap;
    const raw = map && map[`${x},${y}`];
    if (!raw) return null;
    const under = resolveSpecialBiome(
      normalizeLatitudeBiome(unwrapSpecialBiome(raw), y), x, y);
    if (
      !under || under === biomeName || isRoadBiome(under) ||
      isCityBiome(under) || isVillageBiome(under) || isBurgBiome(under)
    ) return null;
    return under;
  }

  // A world square one of those biomes actually occupies, read from the biome
  // coordinate cache.
  //
  // An origin must NEVER anchor on an Ocean square. Roughly half of world map
  // 315 is open sea, so a blind coordinate roll strands the party's world
  // coordinates (variables 43/44) out at water: the square they start on is
  // forced to a land biome, but every edge-exit and revisit around it resolves
  // to ocean. Reading the cache guarantees the anchor is land the world map
  // really holds there.
  //
  // `rng` decides how reproducible the pick is: pass a seeded stream for an
  // origin that must come back identical, Math.random for one rolled per save.
  function pickOverlandWorldCoord(rng, procGenData) {
    const cache = ensureBiomeCoordinateCache(procGenData);

    const named = OVERLAND_ORIGIN_BIOMES.filter(
      (n) => getBiomeByName(n) && !isWaterBiome(n) && n !== "Ocean"
    );
    if (named.length === 0) return null;

    const stocked = cache ? named.filter((n) => cache[n] && cache[n].length > 0) : [];
    if (stocked.length > 0) {
      const biomeName = stocked[Math.floor(rng() * stocked.length)];
      const coords = cache[biomeName];
      const c = coords[Math.floor(rng() * coords.length)];
      return { worldX: c.x, worldY: c.y, biome: biomeName };
    }

    // No snapshot to read (no BiomesMap.json, no cache in the save): fall back to
    // a forced land biome at an arbitrary inland anchor. The square itself is
    // still land; only the world neighbours around it are unverified.
    logWarn("pickOverlandWorldCoord: no biome coordinate cache, using unverified anchor");
    return {
      worldX: 60 + Math.floor(rng() * 130),
      worldY: 60 + Math.floor(rng() * 130),
      biome: named[Math.floor(rng() * named.length)],
    };
  }

  // Character-creation origins that begin OUT IN THE WORLD rather than on the
  // world map looking at it: build the procedural square the party wakes up on,
  // with no world map loaded and nothing generated yet.
  //
  //   worldX / worldY  the square to build. Omitted, one is rolled out of the
  //                    overland biomes , a real land square the world map
  //                    really holds there, never a stretch of ocean.
  //   rng              the stream the roll comes from: a seeded one for an
  //                    origin that must land in the same place every time,
  //                    Math.random for one rolled per playthrough.
  //
  // The terrain itself goes through generateProceduralMap, the same pass that
  // resolves a square walked into from a neighbour, so the square reads its
  // biome and its neighbours off the coordinate cache instead of being told to
  // pretend it is surrounded by copies of itself. The caller transfers the
  // player to PROC_MAP_ID; the performTransfer / loadMapData hooks in
  // WorldMapReturn then inject the generated terrain into $dataMap.
  //
  // Answers { worldX, worldY, biome }, or null when nothing could be built.
  //
  // It cannot go through generateProceduralMap itself - that resolves a square
  // by reading the LIVE world-map tile column, and the world map is not the map
  // being stood on while a character is created - so it does the same work off
  // the snapshot instead, step for step: bridge marker, hardcoded override,
  // biome (latitude-normalized, special-biome-resolved), road direction, the
  // four neighbours, the beach and island flags, the same procMapSeed, the same
  // call into generateProceduralTerrain.
  //
  // That is the whole point of the exercise. The square an origin puts the
  // party down on has to BE the square the world holds at those coordinates:
  // walk out of it onto the world map, walk back in - or arrive by any of the
  // "Visit X" routes - and generateProceduralMap regenerates it from the same
  // seed and the same inputs, and the same map comes back. This used to build a
  // stripped-down square instead (no neighbours, so every axis ran border to
  // border; no rivers, no crossings, no roads, no beach or island), which is
  // why the shore a castaway woke up on was nowhere to be found when they
  // returned to it.
  //
  // The snapshot's own accuracy is the one limit left: it is republished from
  // map 315 on every Test playthrough (buildBiomeCoordinateCache), so a repaint
  // that is never playtested would drift from what the live column says.
  Game_System.prototype.generateOriginBiomeMap = function (options) {
    const opts = options || {};
    // The snapshot is installed on the record that is live NOW, because the
    // lookups below (bridges, biomes) read it through $gameSystem before the
    // fresh record is built.
    if (!this._procGenData) this._procGenData = {};
    const cache = ensureBiomeCoordinateCache(this._procGenData) || {};

    let originX = opts.worldX;
    let originY = opts.worldY;

    if (Number.isFinite(originX) && Number.isFinite(originY)) {
      // A named square: whatever the snapshot says is there. An origin must
      // never anchor on water, so a square that turns out to be sea is refused
      // and the caller rolls somewhere else.
      const named = this.getBiomeFromCache(originX, originY);
      if (!named || isWaterBiome(named) || named === "Ocean") return null;
    } else {
      const pick = pickOverlandWorldCoord(opts.rng || Math.random, this._procGenData);
      if (!pick) return null;
      originX = pick.worldX;
      originY = pick.worldY;
    }

    // Resolved through the same rules the world-map entry applies, not read
    // straight out of the cache: a bridge square is a crossing, a road square
    // carries its direction, and an override is an override wherever it is
    // entered from.
    const square = resolveSquareFromSnapshot(this, originX, originY);
    const biomeName = square.biomeName;
    const biome = getBiomeByName(biomeName);
    if (!biome) return null;

    // The four neighbours the generators blend their edges into, exactly as the
    // world-map entry resolves them: that path reads the live tiles and then
    // overrides every one of them with the cache's own answer where it has one,
    // which for a square the snapshot covers is this same answer.
    const neighbours = getAdjacentBiomesFromCache(originX, originY, cache);
    const adjacentBiomes = {
      north: normalizeBiomeForEdge(neighbours.north),
      south: normalizeBiomeForEdge(neighbours.south),
      east: normalizeBiomeForEdge(neighbours.east),
      west: normalizeBiomeForEdge(neighbours.west),
    };
    const cacheInfo = checkAdjacentMapBiomesFromCache(originX, originY, cache);
    const diagonalBiomes = checkDiagonalMapBiomesFromCache(originX, originY, cache);

    const pg = this._procGenData || {};
    this._procGenData = {
      originX,
      originY,
      currentBiome: biomeName,
      currentRoadDirection: square.roadDirection,
      currentBridgeDirection: square.bridgeDirection,
      currentUnderBiome: snapshotUnderBiome(this, biomeName, originX, originY),
      currentBiomeTileset: biome.tilesetId,
      generatedMapData: null,
      biomeToTileset: {},
      mapPreloaded: false,
      seed: getWorldSeed(),
      biomeCoordinateCache: cache,
      lastLoadedProcMapX: null,
      lastLoadedProcMapY: null,
      displayAsBeach: shouldDisplayAsBeach(biomeName, adjacentBiomes, diagonalBiomes),
      displayAsIsland: shouldDisplayAsIsland(biomeName, adjacentBiomes),
      biomeLayerStack: [],
      biomeDayTemperature: biome.dayTemperature || 20,
      biomeNightTemperature: biome.nightTemperature || 10,
    };
    // The rest of the snapshot rides along into the fresh record: the rivers
    // this square may be crossed by, the bridges, and the precomputed road and
    // river intersections the generators read.
    for (const field of SNAPSHOT_FIELDS) {
      if (pg[field] !== undefined) this._procGenData[field] = pg[field];
    }

    const seed = procMapSeed(originX, originY);
    this._procGenData.generatedMapData = generateProceduralTerrain(
      biome, seed, square.roadDirection, adjacentBiomes, cacheInfo,
      { x: originX, y: originY }, cache
    );
    if (!this._procGenData.generatedMapData) return null;

    // Sync world-coordinate vars so edge-exit return coords stay consistent.
    $gameVariables.setValue(43, originX);
    $gameVariables.setValue(44, originY);

    return { worldX: originX, worldY: originY, biome: biomeName };
  };

  // Bike origin (character creation): a RANDOM non-ocean overland square, the
  // same one every time in a given world , the salt keeps this RNG stream
  // distinct from the terrain streams. Answers the same { worldX, worldY,
  // biome } record generateOriginBiomeMap does (null when nothing could be
  // built), so the caller can anchor the party's start on the square it rolled.
  Game_System.prototype.generateRandomBikeBiomeMap = function () {
    const bikeRng = createSeededRandom(hashCoords(getWorldSeed(), 0xb17e, 0xa9c0));
    return this.generateOriginBiomeMap({ rng: bikeRng });
  };

  // ==========================================================================
  // Bunker origin: world square + surface map
  // ==========================================================================

  // Pick the world square the bunker hides under: a real, non-ocean world-map
  // coordinate from the shared overland picker, so the surface the party climbs
  // out into is the biome the world map actually holds there.
  //
  // Rolled freshly (not from the world seed) and then stored in the save: every
  // playthrough gets its own bunker. Two Bunker starts in the same world must
  // not share a square, or the second one would find the first one's hoards
  // already collected -- removals are recorded per world, not per savegame.
  Game_System.prototype.pickBunkerWorldCoord = function () {
    return pickOverlandWorldCoord(Math.random, this._procGenData);
  };

  // Build (or rebuild) the bunker's surface map, hatch included, and leave it as
  // the live procedural map. Shared by the Bunker origin (which needs the hatch
  // tile before it can wire the way out of the cellar) and by the exit out of
  // the bunker (WorldMapReturn's 'bunker' dungeon session).
  Game_System.prototype.generateBunkerSurfaceMap = function () {
    const rec = this._bunkerOrigin;
    if (!rec) return false;
    const biome = getBiomeByName(rec.biome) || getBiomeByName("Fields");
    if (!biome) return false;

    const pg = this._procGenData;
    if (!pg) return false;
    pg.originX = rec.worldX;
    pg.originY = rec.worldY;
    pg.currentBiome = biome.name;
    pg.currentRoadDirection = null;
    pg.currentUnderBiome = null;
    pg.currentBiomeTileset = biome.tilesetId;
    pg.displayAsBeach = false;
    pg.displayAsIsland = false;
    pg.biomeLayerStack = [];
    pg.biomeDayTemperature = biome.dayTemperature || 20;
    pg.biomeNightTemperature = biome.nightTemperature || 10;
    pg.seed = getWorldSeed();

    // Adjacency stays null off the world map (see generateProceduralMap), so the
    // square rebuilds the same way whether it is entered from the cellar or from
    // anywhere else that is not map 315.
    const seed = procMapSeed(rec.worldX, rec.worldY);
    pg.generatedMapData = generateProceduralTerrain(
      biome, seed, null, null, null, { x: rec.worldX, y: rec.worldY }, pg.biomeCoordinateCache
    );

    $gameVariables.setValue(43, rec.worldX);
    $gameVariables.setValue(44, rec.worldY);
    return !!pg.generatedMapData;
  };

  // Called once by the Bunker origin: choose the world square, generate its
  // surface (which stamps the permanent hatch and records its tile) and return
  // the record. The caller then drops the party into the LootCellar below.
  Game_System.prototype.prepareBunkerOrigin = function () {
    const pick = this.pickBunkerWorldCoord();
    if (!pick) return null;
    this._bunkerOrigin = {
      worldX: pick.worldX,
      worldY: pick.worldY,
      biome: pick.biome,
      entranceX: null,
      entranceY: null,
    };
    if (!this.generateBunkerSurfaceMap() || this._bunkerOrigin.entranceX === null) {
      this._bunkerOrigin = null;
      return null;
    }
    log(`[Bunker] hatch at (${this._bunkerOrigin.entranceX}, ${this._bunkerOrigin.entranceY}) ` +
        `on ${pick.biome} (${pick.worldX}, ${pick.worldY})`);
    return this._bunkerOrigin;
  };

  // NOTE: DataManager.loadMapData override and Game_System map transfer methods have been moved to WorldMapReturn.js
  // Includes: getReturnCoordinates, getAdjacentWorldCoordinates, getEdgeCoordinateForDirection, clearProcGenData, getBiomeTilesetId

  // ===== GAME MAP EXTENSIONS =====
  // NOTE: Game_Map overrides (initialize, setup, tileset) and border detection have been moved to WorldMapReturn.js

  // ===== PLUGIN COMMAND HANDLERS =====
  // NOTE: Plugin commands (startProcGen, stopProcGen, goDown, goUp) have been moved to WorldMapReturn.js

  // ===== PUBLIC ACCESSORS =====

  Game_System.prototype.isProceduralMapActive = function () {
    return $gameVariables.value(110) === 1;
  };

  Game_System.prototype.isInsideProceduralMap = function () {
    return $gameVariables.value(111) === 1;
  };

  Game_System.prototype.getProcGenData = function () {
    return this._procGenData;
  };

  /**
   * Check if car events should be deleted for this biome
   */

  /**
   * Check if NPC events should be deleted for this biome
   */

  // ===== EDGE DETECTION & AUTO-RETURN =====
  // NOTE: Border arrow visualization, Game_Player overrides, and Scene_Map hooks have been moved to WorldMapReturn.js
  // Includes: Sprite_BorderArrow, getProcGenBorderTiles, displayProcGenBorderArrows, clearProcGenBorderArrows
  // updateProcGenBorderArrows, Game_Player.update override, performTransfer override, moveStraight override, Scene_Map.onMapLoaded

  /**
   * Update visibility of GoDown and GoUp events based on underground state
   */
  /**
     * Update visibility of GoDown, GoUp, and Chest events based on underground state
     */
  function updateEventVisibility() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    // Check if player is underground
    const isUnderground = procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;
    const chestNames = ["RandomItemChest", "RandomArmorChest", "RandomWeaponChest"];

    // Check if current biome is Ocean or Seabed (hide GoUp/GoDown events)
    const currentBiome = procGenData.currentBiome || "";
    const isWaterBiome = currentBiome === "Ocean" || currentBiome === "Seabed";

    for (const event of $gameMap._events) {
      if (!event || !$dataMap.events[event._eventId]) continue;

      const eventName = $dataMap.events[event._eventId].name;

      // Handle GoDown (Show Overground, Hide Underground or Water Biomes)
      if (eventName === "GoDown") {
        const shouldHide = isUnderground || isWaterBiome;
        event.setOpacity(shouldHide ? 0 : 255);
        // Also move off map if in water biome
        if (isWaterBiome && (event.x !== 0 || event.y !== 0)) {
          event.setPosition(0, 0);
        }
      }
      // Handle GoUp (Hide Overground, Show Underground, Hide in Water Biomes)
      else if (eventName === "GoUp") {
        const shouldShow = isUnderground && !isWaterBiome;
        event.setOpacity(shouldShow ? 255 : 0);
        // Also move off map if in water biome
        if (isWaterBiome && (event.x !== 0 || event.y !== 0)) {
          event.setPosition(0, 0);
        }
      }
      // Handle Chests: visibility follows placement (placeChestEvents parks
      // inactive chests at 0,0 and only spawns the biome-appropriate count).
      else if (chestNames.includes(eventName)) {
        event.setOpacity((event.x > 0 || event.y > 0) ? 255 : 0);
      }
    }
  }
  /**
   * Place the GoDown event at a seeded random position on the procedural map
   * If the tile is impassable, find the first passable tile nearby
   */
  function placeGoDownEvent() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    // Check if current biome is Ocean or Seabed - hide GoDown in these biomes
    const currentBiome = procGenData.currentBiome || "";
    const isWaterBiome = currentBiome === "Ocean" || currentBiome === "Seabed";

    // Find the GoDown event
    let goDownEvent = null;
    for (const event of $gameMap._events) {
      if (event && $dataMap.events[event._eventId] && $dataMap.events[event._eventId].name === "GoDown") {
        goDownEvent = event;
        break;
      }
    }

    if (!goDownEvent) {
      console.warn(`[ProceduralMap] GoDown event not found on map ${$gameMap.mapId()}`);
      return;
    }

    // If in water biome, hide the event by moving it off map
    if (isWaterBiome) {
      goDownEvent.setPosition(0, 0);
      procGenData.goDownEventX = 0;
      procGenData.goDownEventY = 0;
      log(`[ProceduralMap] GoDown event hidden (water biome: ${currentBiome})`);
      return;
    }

    const worldX = procGenData.worldX || $gameVariables.value(43) || 0;
    const worldY = procGenData.worldY || $gameVariables.value(44) || 0;
    const seed = procGenData.currentSeed || getWorldSeed();

    // Create seeded random function using world coordinates and world seed
    const seededRandom = ProcGenUtils.createSeededRandom(hashCoords(seed, worldX, worldY));

    // Generate random position on 64x64 map
    let startX = Math.floor(seededRandom() * (PROC_MAP_WIDTH - 2)) + 1;
    let startY = Math.floor(seededRandom() * (PROC_MAP_HEIGHT - 2)) + 1;

    // Try to find passable tile: first check the selected position, then search nearby
    let finalX = startX;
    let finalY = startY;
    let found = false;

    // Check if starting position is passable
    if ($gameMap.isPassable(startX, startY, 2)) {
      found = true;
    } else {
      // Search in expanding squares around the initial position
      const maxRange = 10;
      outerLoop: for (let range = 1; range <= maxRange; range++) {
        for (let dx = -range; dx <= range; dx++) {
          for (let dy = -range; dy <= range; dy++) {
            // Only check the perimeter of the current square
            if (Math.abs(dx) !== range && Math.abs(dy) !== range) continue;

            const testX = startX + dx;
            const testY = startY + dy;

            // Bounds check
            if (testX < 0 || testX >= PROC_MAP_WIDTH || testY < 0 || testY >= PROC_MAP_HEIGHT) continue;

            if ($gameMap.isPassable(testX, testY, 2)) {
              finalX = testX;
              finalY = testY;
              found = true;
              break outerLoop;
            }
          }
        }
      }
    }

    // Move the GoDown event to the determined position
    goDownEvent.setPosition(finalX, finalY);

    // Store the GoDown event position for use when calling GoUp command
    procGenData.goDownEventX = finalX;
    procGenData.goDownEventY = finalY;

    log(`[ProceduralMap] GoDown event placed at (${finalX}, ${finalY}) - Found passable: ${found}`);
  }

  /**
   * Place the GoUp event - hide it when overground or in Ocean/Seabed biomes
   */
  function placeGoUpEvent() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    // Check if player is underground
    const isUnderground = procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;

    // Check if current biome is Ocean or Seabed
    const currentBiome = procGenData.currentBiome || "";
    const isWaterBiome = currentBiome === "Ocean" || currentBiome === "Seabed";

    // Find the GoUp event
    let goUpEvent = null;
    for (const event of $gameMap._events) {
      if (event && $dataMap.events[event._eventId] && $dataMap.events[event._eventId].name === "GoUp") {
        goUpEvent = event;
        break;
      }
    }

    if (!goUpEvent) {
      // GoUp event doesn't exist (normal for surface maps)
      return;
    }

    // Hide GoUp when overground OR in water biomes
    if (!isUnderground || isWaterBiome) {
      goUpEvent.setPosition(0, 0);
      goUpEvent.setOpacity(0);
      log(`[ProceduralMap] GoUp event hidden (underground: ${isUnderground}, waterBiome: ${isWaterBiome})`);
    } else {
      // Show GoUp when underground and NOT in water biome
      // Position it near the player's entry point if available
      const playerX = $gamePlayer.x;
      const playerY = $gamePlayer.y;
      goUpEvent.setPosition(playerX, playerY);
      goUpEvent.setOpacity(255);
      log(`[ProceduralMap] GoUp event shown at (${playerX}, ${playerY})`);
    }
  }

  // How many chests a patron's vault ends up holding. The map template only
  // carries seven, which reads as a poor showing in a hall with a dozen
  // strongrooms hung off it, so the rest are cloned from those seven.
  const VAULT_CHEST_COUNT = 26;

  // Odds that a square nobody built anything on carries a single chest. Open air
  // is deliberately near-barren - a chest in a field should be a story, not
  // scenery - while a dug layer that is not a strongroom pays for the descent.
  const SURFACE_CHEST_CHANCE = 0.03;
  const UNDERGROUND_CHEST_CHANCE = 0.30;

  /**
   * Top the map up to VAULT_CHEST_COUNT chest events by cloning the ones the
   * template carries. Idempotent: it counts what is already on the map, so the
   * repeated calls this gets on every procedural map load never pile up. New
   * events are given their character sprite by hand, because the spriteset was
   * already built by the time the chest pass runs.
   */
  function ensureVaultChestEvents(chestNames) {
    if (!$dataMap || !Array.isArray($dataMap.events) || !$gameMap) return;
    const templates = $dataMap.events.filter((e) => e && chestNames.includes(e.name));
    if (!templates.length) return;
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    for (let i = templates.length; i < VAULT_CHEST_COUNT; i++) {
      const src = templates[i % templates.length];
      const data = JSON.parse(JSON.stringify(src));
      data.id = $dataMap.events.length;
      data.x = 0;
      data.y = 0;
      $dataMap.events[data.id] = data;
      const ev = new Game_Event($gameMap._mapId, data.id);
      $gameMap._events[data.id] = ev;
      if (spriteset && spriteset._characterSprites && spriteset._tilemap) {
        const sprite = new Sprite_Character(ev);
        spriteset._characterSprites.push(sprite);
        spriteset._tilemap.addChild(sprite);
      }
    }
  }

  /**
   * Place Random Chests on the procedural map, biome-aware:
   *   - A generated structure: the range its catalogue entry declares, biased
   *     into rooms (also corridors). A dungeon holds 4-7, a cellar 1-2, a cave
   *     den none; only the rare grand cellar (mapData.cellarGrand) is stocked
   *     like a dungeon.
   *   - Patron's vault: every chest the map template carries plus as many clones
   *     as it takes to reach VAULT_CHEST_COUNT, so the strongrooms are actually
   *     full of strongboxes.
   *   - Cave-family: loot is RARE - most coordinates have no chest; when one does
   *     spawn it rolls RARE loot (via $gameSystem._lootRarityBonus, read by
   *     RandomLootSystem). ~20% of cave maps carry a single chest.
   *   - Any other dug layer (Underdark, a river bank, a flooded seam): uncommon,
   *     one chest on roughly a third of the squares, and worth the climb down.
   *   - Open air (every surface biome): a chest lying out in the world is a
   *     genuine find, so only a few squares in a hundred carry one.
   *   - An alien surface holds nothing unless the world is HABITABLE: a vacuum
   *     rock nobody could ever have walked on has nobody to have left a chest
   *     there. A breathable world is treated as ordinary open air.
   * Chests not selected are parked at (0,0); visibility follows position.
   * Which of the placed chests already stand open - because another savegame of
   * this world emptied them, or because they were generated derelict - is
   * ChestWorldState's answer, applied once the positions are final.
   */
  function placeChestEvents() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    const chestNames = ["RandomItemChest", "RandomArmorChest", "RandomWeaponChest"];
    const biome = (procGenData.currentBiome || "").toLowerCase();
    // How much a structure is worth carrying out of is its own business: the
    // catalogue entry names the range (a cellar 1-2, a dungeon 4-7, a patron's
    // vault every chest the template has). Ordinary cave squares keep the old
    // rule, which is that loot down there is rare and good.
    const D = window.ProcGenDungeon;
    const struct = (D && typeof D.structure === "function") ? D.structure(biome) : null;
    const isDungeonType = !!(struct && struct.chests && struct.chests[1] > 0);
    const isCave = !isDungeonType && /cave/.test(biome); // Cave, CaveIce, ...
    // A patron's vault gets every chest the map template carries AND enough
    // clones of them to fill its strongrooms; the rarity push it pays out comes
    // from PatreonRewards.lootRarityBonus, so nothing is added here (the two
    // would stack).
    const isPatronVault = biome === "patronvault";
    const isLootCellar = biome === "lootcellar";
    if (isPatronVault) ensureVaultChestEvents(chestNames);

    const worldX = procGenData.worldX || $gameVariables.value(43) || 0;
    const worldY = procGenData.worldY || $gameVariables.value(44) || 0;
    const seed = procGenData.currentSeed || getWorldSeed();
    const layerDepth = procGenData.biomeLayerStack ? procGenData.biomeLayerStack.length : 0;
    const baseSeed = hashCoords(seed, worldX, worldY) + layerDepth * 97;
    const rng = Utils2.createSeededRandom(baseSeed);

    // How many chests, and how rare their loot is.
    const isAlien = /^alien/.test(biome);
    let numChests = 0;
    let rarityBonus = 0;
    if (isAlien && !isHabitableAlienSurface(procGenData)) {
      // A world with no air nobody ever settled: nothing was left behind there.
      numChests = 0;
    } else if (isLootCellar &&
        procGenData.generatedMapData && procGenData.generatedMapData.cellarGrand) {
      // The rare grand cellar is stocked like a dungeon rather than like the
      // cramped hole most cellars are.
      numChests = 4 + Math.floor(rng() * 4);
    } else if (isDungeonType) {
      const lo = struct.chests[0], hi = struct.chests[1];
      numChests = lo + Math.floor(rng() * (hi - lo + 1));
    } else if (isCave) {
      numChests = rng() < 0.15 ? 1 : 0;      // very rare - most caves have none
      rarityBonus = 55;                      // but rare loot when present
    } else if (isUndergroundSquare(procGenData, biome)) {
      // A dug layer that nobody built: the Underdark, a river bank seam, a
      // flooded gallery. Not a strongroom, but worth the climb down. The bonus
      // is only raised on the squares that actually carry a chest - it applies
      // to every loot draw on the map, and an empty field must not pay better
      // than a dungeon just because a chest COULD have rolled there.
      numChests = rng() < UNDERGROUND_CHEST_CHANCE ? 1 : 0;
      rarityBonus = numChests ? 35 : 0;
    } else {
      // Open air. A chest standing in a field is a genuine find, so it has to
      // stay one: a handful of squares in a hundred, never more than one.
      numChests = rng() < SURFACE_CHEST_CHANCE ? 1 : 0;
      rarityBonus = numChests ? 25 : 0;
    }
    // Feed RandomLootSystem so cave chests roll toward the top rarity tiers.
    $gameSystem._lootRarityBonus = rarityBonus;

    // Gather the chest events and deterministically pick which ones are active.
    const chestEvents = $gameMap._events.filter(ev =>
      ev && $dataMap.events[ev._eventId] && chestNames.includes($dataMap.events[ev._eventId].name));
    const order = chestEvents.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    numChests = Math.min(numChests, order.length);

    const rooms = procGenData.generatedMapData && procGenData.generatedMapData.rooms;

    // Find a passable, unoccupied tile - biased into a room when room data exists
    // (so dungeon chests usually sit in rooms, occasionally in corridors).
    const pickTile = (srng) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const tile = pickRoomOrWallTile(srng, rooms);
        const { x: tx, y: ty } = tile;
        if ($gameMap.isPassable(tx, ty, 2) &&
            (tx !== $gamePlayer.x || ty !== $gamePlayer.y) &&
            !$gameMap.eventsXy(tx, ty).length) {
          return { x: tx, y: ty };
        }
      }
      return null;
    };

    order.forEach((event, i) => {
      if (i < numChests) {
        const srng = Utils2.createSeededRandom(baseSeed + event._eventId * 31);
        const tile = pickTile(srng);
        event.setPosition(tile ? tile.x : 0, tile ? tile.y : 0);
      } else {
        event.setPosition(0, 0); // parked / hidden
      }
    });

    // Positions are final: hand the whole set to the world record, which decides
    // which of them stand open. Map 636 is one map reused for every square, so
    // the self switches left by the LAST square's chests are still raised here -
    // this is also what puts them down again.
    const CWS = window.ChestWorldState;
    if (CWS && typeof CWS.applyProcChestState === "function") {
      CWS.applyProcChestState(chestEvents, baseSeed);
    }
  }

  /**
   * Is this square a dug layer rather than open air? True while the party is
   * below the surface (a non-empty layer stack), for every biome that is some
   * surface biome's lowerLayer, and inside a generated structure - which is
   * entered as a fresh depth-0 map (startForcedBiome) and so has no layer stack
   * to read.
   */
  let _lowerLayerBiomes = null;
  function isUndergroundSquare(procGenData, lowerBiomeName) {
    if (procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0) return true;
    const D = window.ProcGenDungeon;
    if (D && typeof D.isStructure === "function" && D.isStructure(lowerBiomeName)) return true;
    if (!_lowerLayerBiomes) {
      const list = Biomes || [];
      if (!list.length) return false;   // biomes not loaded yet: do not cache
      _lowerLayerBiomes = new Set();
      list.forEach(b => { if (b && b.lowerLayer) _lowerLayerBiomes.add(String(b.lowerLayer).toLowerCase()); });
    }
    return _lowerLayerBiomes.has(lowerBiomeName);
  }

  /**
   * Can anybody live on the alien world underfoot? Habitability is the planet
   * type's `breathable` flag (js/db/GalaxySim/PlanetTypes.json). The landing
   * descriptor answers it directly; a Sandbox jump straight into an "Alien*"
   * biome has no descriptor, so the biome name is mapped back to the type that
   * declares it.
   */
  let _breathableAlienBiomes = null;
  function isHabitableAlienSurface(procGenData) {
    const G = window.GalaxySim;
    if (!G) return false;
    const landed = $gameSystem._landedPlanet;
    if (landed && landed.type && typeof G.planetBreathable === "function") {
      return !!G.planetBreathable(landed);
    }
    if (!_breathableAlienBiomes) {
      const PT = G.PlanetTypes;
      if (!PT) return false;            // types not loaded yet: do not cache
      _breathableAlienBiomes = new Set();
      for (const key of Object.keys(PT)) {
        const info = PT[key];
        if (info && info.breathable && info.biome) {
          _breathableAlienBiomes.add(String(info.biome).toLowerCase());
        }
      }
    }
    return _breathableAlienBiomes.has(String(procGenData.currentBiome || "").toLowerCase());
  }

  /**
   * Pick a candidate tile for a chest-like event: 75% of the time (when room
   * data exists) either dead-center of a room or hugging one of its walls one
   * tile in, so chests read as deliberately placed instead of scattered mid-
   * floor where they could pinch off a corridor; the remaining 25% (or when
   * there is no room data) falls back to any map tile. Callers still validate
   * passability/occupancy on the returned point.
   */
  function pickRoomOrWallTile(srng, rooms) {
    if (rooms && rooms.length && srng() < 0.75) {
      const r = rooms[Math.floor(srng() * rooms.length)];
      if (srng() < 0.5) {
        // Center of the room.
        return { x: r.x + Math.floor(r.width / 2), y: r.y + Math.floor(r.height / 2) };
      }
      // Hug a wall: snap to one of the room's four edges, one tile in.
      const inset = 1;
      const spanW = Math.max(1, r.width - inset * 2);
      const spanH = Math.max(1, r.height - inset * 2);
      switch (Math.floor(srng() * 4)) {
        case 0: return { x: r.x + inset, y: r.y + inset + Math.floor(srng() * spanH) };
        case 1: return { x: r.x + r.width - 1 - inset, y: r.y + inset + Math.floor(srng() * spanH) };
        case 2: return { x: r.x + inset + Math.floor(srng() * spanW), y: r.y + inset };
        default: return { x: r.x + inset + Math.floor(srng() * spanW), y: r.y + r.height - 1 - inset };
      }
    }
    return {
      x: Math.floor(srng() * (PROC_MAP_WIDTH - 4)) + 2,
      y: Math.floor(srng() * (PROC_MAP_HEIGHT - 4)) + 2,
    };
  }

  /**
   * Does this structure carry BUILT hazards - spike traps, locked doors, key
   * chests? A place somebody dug, walled and defended does; a natural cave, a
   * cellar under a farmhouse and a smuggler's run do not. The answer is the
   * `hazards` flag on the structure's catalogue entry
   * (ProceduralMapStructureGenerator), so adding a structure decides it there
   * rather than here.
   */
  function isCurrentBiomeDungeonType(biomeName) {
    const D = window.ProcGenDungeon;
    const S = (D && typeof D.structure === "function") ? D.structure(biomeName) : null;
    return !!(S && S.hazards);
  }

  /**
   * PROCEDURAL INTERIORS
   *
   * A biome that is roofed over: every cave variant plus the enclosed
   * floor/ceiling/wall family (Dungeon, Crypt, Sewer, LootCellar,
   * TempleInside, CaveDen, PatronVault). Nothing generated in one of these
   * should ever see the sky, so weather and day/night light are suppressed
   * there, and nothing that belongs outdoors (a parked or summoned vehicle)
   * may be placed there.
   *
   * They all share map id 636 with the open-air square they were entered from,
   * so a plain map note tag cannot tell them apart: every consumer has to ask
   * window.ProceduralInteriors instead.
   */
  function isInteriorBiome(biomeName) {
    const name = biomeName || "";
    if (!name) return false;
    return isCaveBiome(name) || isDungeonBiome(name);
  }

  /**
   * True while the player stands on a procedural interior: an enclosed biome,
   * or any layer below the surface (the layer stack is non-empty once the
   * player has gone down). WeatherSystem, DynamicLightingSystem and
   * VehicleSystem ask this instead of reading map 636's <Exterior> tag.
   */
  function isProceduralInteriorMap() {
    if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return false;
    const data = $gameSystem && $gameSystem._procGenData;
    if (!data) return false;
    if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return true;
    return isInteriorBiome(data.currentBiome);
  }

  /**
   * Place Spike Trap hazards (map 636 template events named "Spike trap").
   * Only active in Dungeon / Crypt / Sewer biomes; parked at (0,0) and hidden
   * everywhere else. Scattered across passable floor tiles away from the
   * entrance/spawn point so the player is never ambushed on arrival.
   */
  function placeSpikeTrapEvents() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    const trapEvents = $gameMap._events.filter((ev) =>
      ev && $dataMap.events[ev._eventId] && $dataMap.events[ev._eventId].name === "Spike trap");
    if (!trapEvents.length) return;

    if (!isCurrentBiomeDungeonType(procGenData.currentBiome)) {
      trapEvents.forEach((ev) => { ev.setPosition(0, 0); ev.setOpacity(0); });
      return;
    }

    const worldX = procGenData.worldX || $gameVariables.value(43) || 0;
    const worldY = procGenData.worldY || $gameVariables.value(44) || 0;
    const seed = procGenData.currentSeed || getWorldSeed();
    const layerDepth = procGenData.biomeLayerStack ? procGenData.biomeLayerStack.length : 0;
    const baseSeed = hashCoords(seed, worldX, worldY) + layerDepth * 131 + 7331;
    const rng = Utils2.createSeededRandom(baseSeed);

    const numTraps = Math.min(trapEvents.length, 3 + Math.floor(rng() * 6)); // 3..8
    const genData = procGenData.generatedMapData;
    const spawnX = genData ? genData.spawnX : $gamePlayer.x;
    const spawnY = genData ? genData.spawnY : $gamePlayer.y;

    const order = trapEvents.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const pickTile = (srng) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = Math.floor(srng() * (PROC_MAP_WIDTH - 6)) + 3;
        const ty = Math.floor(srng() * (PROC_MAP_HEIGHT - 6)) + 3;
        if (Math.abs(tx - spawnX) + Math.abs(ty - spawnY) < 6) continue;
        if ($gameMap.isPassable(tx, ty, 2) && !$gameMap.eventsXy(tx, ty).length) {
          return { x: tx, y: ty };
        }
      }
      return null;
    };

    order.forEach((event, i) => {
      if (i < numTraps) {
        const srng = Utils2.createSeededRandom(baseSeed + event._eventId * 53);
        const tile = pickTile(srng);
        event.setPosition(tile ? tile.x : 0, tile ? tile.y : 0);
        event.setOpacity(tile ? 255 : 0);
      } else {
        event.setPosition(0, 0);
        event.setOpacity(0);
      }
    });
  }

  /**
   * Place "Dungeon door" events (map 636 template, 6 copies) at the start of
   * the narrow 1-tile corridors computed by the BSP dungeon generator
   * (mapData.doorHints). Only active in Dungeon / Crypt / Sewer biomes with at
   * least one hint (Crypt/Sewer use a fixed grid layout and normally have
   * none); parked at (0,0) and hidden otherwise.
   */
  function placeDungeonDoorEvents() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    const doorEvents = $gameMap._events.filter((ev) =>
      ev && $dataMap.events[ev._eventId] && $dataMap.events[ev._eventId].name === "Dungeon door");
    if (!doorEvents.length) return;

    const genData = procGenData.generatedMapData;
    const hints = (isCurrentBiomeDungeonType(procGenData.currentBiome) && genData && genData.doorHints) || [];

    if (!hints.length) {
      doorEvents.forEach((ev) => { ev.setPosition(0, 0); ev.setOpacity(0); });
      return;
    }

    const worldX = procGenData.worldX || $gameVariables.value(43) || 0;
    const worldY = procGenData.worldY || $gameVariables.value(44) || 0;
    const seed = procGenData.currentSeed || getWorldSeed();
    const layerDepth = procGenData.biomeLayerStack ? procGenData.biomeLayerStack.length : 0;
    const rng = Utils2.createSeededRandom(hashCoords(seed, worldX, worldY) + layerDepth * 197 + 4111);

    const shuffled = hints.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    doorEvents.forEach((event, i) => {
      const spot = shuffled[i];
      if (spot) {
        event.setPosition(spot.x, spot.y);
        event.setOpacity(255);
      } else {
        event.setPosition(0, 0);
        event.setOpacity(0);
      }
    });
  }

  /**
   * Place "Key Chest" events (map 636 template, 3 copies): available in every
   * Dungeon / Crypt / Sewer biome, any underground overworld layer (reached
   * via GoDown) and the Seabed biome. Hidden on ordinary surface maps. Rare:
   * only some world tiles carry any at all.
   */
  function placeKeyChestEvents() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    const keyChestEvents = $gameMap._events.filter((ev) =>
      ev && $dataMap.events[ev._eventId] && $dataMap.events[ev._eventId].name === "Key Chest");
    if (!keyChestEvents.length) return;

    const biome = procGenData.currentBiome || "";
    const isUnderground = !!(procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0);
    const eligible = isCurrentBiomeDungeonType(biome) || isUnderground || biome === "Seabed";

    if (!eligible) {
      keyChestEvents.forEach((ev) => { ev.setPosition(0, 0); ev.setOpacity(0); });
      return;
    }

    const worldX = procGenData.worldX || $gameVariables.value(43) || 0;
    const worldY = procGenData.worldY || $gameVariables.value(44) || 0;
    const seed = procGenData.currentSeed || getWorldSeed();
    const layerDepth = procGenData.biomeLayerStack ? procGenData.biomeLayerStack.length : 0;
    const baseSeed = hashCoords(seed, worldX, worldY) + layerDepth * 151 + 9001;
    const rng = Utils2.createSeededRandom(baseSeed);

    const rooms = procGenData.generatedMapData && procGenData.generatedMapData.rooms;
    const pickTile = (srng) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const tile = pickRoomOrWallTile(srng, rooms);
        const { x: tx, y: ty } = tile;
        if ($gameMap.isPassable(tx, ty, 2) &&
            (tx !== $gamePlayer.x || ty !== $gamePlayer.y) &&
            !$gameMap.eventsXy(tx, ty).length) {
          return { x: tx, y: ty };
        }
      }
      return null;
    };

    // Secret and rare: little over a third of eligible world tiles carry any.
    // A patron's vault is the exception - it carries every one of them.
    const numChests = biome.toLowerCase() === "patronvault"
      ? keyChestEvents.length
      : (rng() < 0.35 ? (1 + Math.floor(rng() * keyChestEvents.length)) : 0);

    const order = keyChestEvents.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    order.forEach((event, i) => {
      if (i < numChests) {
        const srng = Utils2.createSeededRandom(baseSeed + event._eventId * 61);
        const tile = pickTile(srng);
        event.setPosition(tile ? tile.x : 0, tile ? tile.y : 0);
        event.setOpacity(tile ? 255 : 0);
      } else {
        event.setPosition(0, 0);
        event.setOpacity(0);
      }
    });
  }

  /**
   * Place the officer patrols (map 636 template, 3 copies). Cities and
   * burgs are policed (1-3 officers on duty); villages only rarely see one.
   * Everywhere else - wilderness, roads, underground - the officers are parked
   * at (0,0) and hidden.
   *
   * The patrol events are named after the officer standing in them ("Officer
   * <name>"), so they are matched on that rank prefix rather than on a single
   * shared event name.
   *
   * Unlike the chests/traps above this roll is deliberately NOT seeded on the
   * world coordinate: the patrol is re-rolled every single time the player
   * enters the settlement, so the streets are never staffed the same way twice.
   * Officers are dropped on street tiles when the tileset exposes any, and kept
   * a few tiles away from the player so nobody spawns in their face.
   */
  const POLICE_EVENT_PREFIX = "Officer ";  // i18n-ignore: event-name prefix

  function placePolicemanEvents() {
    const procGenData = $gameSystem._procGenData;
    if (!procGenData) return;

    const policeEvents = $gameMap._events.filter((ev) =>
      ev && $dataMap.events[ev._eventId] &&
      String($dataMap.events[ev._eventId].name || "").startsWith(POLICE_EVENT_PREFIX));
    if (!policeEvents.length) return;

    const park = () => policeEvents.forEach((ev) => {
      ev.setPosition(0, 0);
      ev.setOpacity(0);
      ev.setThrough(true);
    });

    const biomeName = procGenData.currentBiome || "";
    const isUnderground = !!(procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0);
    if (isUnderground) { park(); return; }

    let count = 0;
    if (isCityBiome(biomeName) || isBurgBiome(biomeName)) {
      count = 1 + Math.floor(Math.random() * 3);      // 1..3 officers on patrol
    } else if (isVillageBiome(biomeName)) {
      count = Math.random() < 0.12 ? 1 : 0;           // rare village constable
    }
    if (count <= 0) { park(); return; }
    count = Math.min(count, policeEvents.length);

    // Street tiles of this biome's tileset, so patrols walk the roads.
    const streetTileIds = new Set();
    const biomeObj = getBiomeByName(biomeName);
    if (biomeObj) {
      _collectSingleTileIds(
        ["Path", "PathDesert", "PathIce", "Road", "DashedLine",
          "DashedLineHorizontal", "DashedLineVertical", "Sidewalk",
          "SidewalkDesert", "SidewalkIce"],
        collectBiomeFeatures(biomeObj), streetTileIds
      );
    }

    const MIN_PLAYER_DIST = 5;
    const isFreeTile = (x, y) =>
      $gameMap.isPassable(x, y, 2) &&
      !$gameMap.eventsXy(x, y).length &&
      Math.abs(x - $gamePlayer.x) + Math.abs(y - $gamePlayer.y) >= MIN_PLAYER_DIST;

    // Collect the street tiles once, then hand out random ones.
    const streets = [];
    if (streetTileIds.size) {
      for (let y = 2; y < PROC_MAP_HEIGHT - 2; y++) {
        for (let x = 2; x < PROC_MAP_WIDTH - 2; x++) {
          if (streetTileIds.has($gameMap.tileId(x, y, 0))) streets.push({ x, y });
        }
      }
    }

    const taken = [];
    const isTaken = (x, y) => taken.some((t) => t.x === x && t.y === y);
    const pickTile = () => {
      for (let attempt = 0; attempt < 30 && streets.length; attempt++) {
        const s = streets[Math.floor(Math.random() * streets.length)];
        if (!isTaken(s.x, s.y) && isFreeTile(s.x, s.y)) return s;
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = Math.floor(Math.random() * (PROC_MAP_WIDTH - 4)) + 2;
        const y = Math.floor(Math.random() * (PROC_MAP_HEIGHT - 4)) + 2;
        if (!isTaken(x, y) && isFreeTile(x, y)) return { x, y };
      }
      return null;
    };

    const order = policeEvents.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    order.forEach((event, i) => {
      const tile = i < count ? pickTile() : null;
      if (tile) {
        taken.push(tile);
        event.setPosition(tile.x, tile.y);
        event.setOpacity(255);
        event.setThrough(false);
      } else {
        event.setPosition(0, 0);
        event.setOpacity(0);
        event.setThrough(true);
      }
    });
  }

  /**
   * Hook into Scene_Map update to ensure tilemap is continuously refreshed
   */
  const _Scene_Map_updateTilemap = Scene_Map.prototype.updateTilemap;
  Scene_Map.prototype.updateTilemap = function () {
    _Scene_Map_updateTilemap.call(this);

    if (
      $gameMap.mapId() === PROC_MAP_ID &&
      this._tilemap &&
      $gameSystem._procGenData &&
      $gameSystem._procGenData.generatedMapData
    ) {
      if (!this._procGenMapRefreshScheduled) {
        this._tilemap._needsRender = true;
        this._procGenMapRefreshScheduled = true;
      }
    }
  };

  // ==========================================================================
  // ONE WORLD SQUARE, RESOLVED AND BUILT ON ITS OWN
  // --------------------------------------------------------------------------
  // Everything above builds THE square the party is standing on, reading what it
  // needs off $gameSystem._procGenData as it goes. Stitching (ProcStitch, in
  // WorldMapReturn.js) needs the same square built for a coordinate nobody is
  // standing on, and needs it to come out identical to what walking there would
  // give: a neighbour generated one way as scenery and another way once it is
  // entered would visibly redraw itself under the party's feet.
  //
  // So the resolution the entry points used to each repeat (the bridge marker,
  // the hardcoded override, the world tile / cache lookup, the latitude rename,
  // the special-biome roll, a road's under-biome, the step down to a lower
  // layer) is written once here and every caller defers to it. The edge crossing
  // in WorldMapReturn used to skip the latitude rename and the special roll
  // outright, so an Ice square walked into stayed "Ice" while the same square
  // travelled to from the world map came out "Tundra"; and it forced a road's
  // direction through the intersection detector before the generator had a
  // chance to refine it. Both go away by construction with one resolver.
  // ==========================================================================

  // What a generator reads off _procGenData while it runs. Building a square the
  // party is NOT standing on has to borrow these and give them back, or the
  // neighbour's road direction and structure hints are left behind on the square
  // under the party's feet.
  const SQUARE_SCOPED_KEYS = [
    "currentBiome", "currentBiomeTileset", "currentRoadDirection",
    "currentUnderBiome", "currentBridgeDirection", "structureHints",
    "displayAsBeach", "displayAsIsland", "originX", "originY",
    "generatedMapData", "_prefabbedSig",
  ];

  function borrowSquareScope() {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg) return null;
    const saved = {};
    for (const key of SQUARE_SCOPED_KEYS) saved[key] = pg[key];
    return saved;
  }

  function returnSquareScope(saved) {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg || !saved) return;
    for (const key of SQUARE_SCOPED_KEYS) pg[key] = saved[key];
  }

  // The raw name the world map holds for a square, before any roll or rename:
  // the live tile column when the world map is the loaded map, the coordinate
  // cache otherwise. Deliberately the same rule generateProceduralMap follows,
  // so "travelled to from the world map" and "stitched in as a neighbour" agree.
  function rawWorldBiomeAt(worldX, worldY, cache, onWorldMap) {
    if (onWorldMap && $gameSystem.getBiomeFromWorldCoordinates) {
      const live = $gameSystem.getBiomeFromWorldCoordinates(worldX, worldY);
      if (live) return live;
    }
    if (cache && Object.keys(cache).length > 0) {
      const cached = Utils2.getBiomeFromCacheWithFallback(
        cache, worldX, worldY, $gameMap, WORLD_MAP_ID
      );
      if (cached) return cached;
    }
    return "Fields"; // i18n-ignore  biome id
  }

  /**
   * Everything that decides what a world square looks like, without building it.
   * Called for a whole neighbourhood every time the party steps over a seam,
   * which is what the stitching window does to know whether a neighbour may be
   * joined on at all (its tileset has to match).
   *
   * Memoized, because "cheap enough" stopped being true the moment the window
   * started asking about the ring around the party on every step: one plan is
   * nine of these and a plan is made several times per tile walked, and each one
   * scans the biome cache for the square, its four sides and its four corners.
   * The answer is a pure function of the square, the depth and the world seed
   * for as long as those stand still, and the key it is filed under is the very
   * one the built squares use, so a new world drops both together.
   */
  const RESOLVE_CACHE_LIMIT = 512;
  const resolveCache = new Map();
  // The biome cache the memo was filled from. It is always REPLACED rather than
  // filled in place (buildBiomeCoordinateCache, the BiomesMap.json load), so a
  // world that has just learnt where its biomes are - or a different world
  // altogether - shows up here as a different object and the memo goes with it.
  let resolveCacheSource = null;

  function forgetResolved() {
    resolveCache.clear();
    resolveCacheSource = null;
  }

  // The memo may only answer for the plain form. A caller that hands in its own
  // biome cache, landing grid or world-map flag is asking about a different
  // world than the key names, so it is resolved outright every time.
  function resolveSquare(worldX, worldY, opts) {
    opts = opts || {};
    if (opts.cache !== undefined || opts.alienGrid !== undefined ||
        opts.onWorldMap != null) {
      return resolveSquareUncached(worldX, worldY, opts);
    }
    const pg = ($gameSystem && $gameSystem._procGenData) || {};
    if (resolveCacheSource !== pg.biomeCoordinateCache) {
      resolveCache.clear();
      resolveCacheSource = pg.biomeCoordinateCache;
    }
    const depth = opts.depth != null ? opts.depth : (pg.biomeLayerStack || []).length;
    // A planet's landing grid is planet-local and its (gx, gy) can coincide with
    // a real Earth square, so which world is underfoot is part of the key.
    const key = squareCacheKey(worldX, worldY, depth) +
      (pg.alienGrid ? ":a:" + pg.alienGrid.biome : "") +
      (($gameMap && $gameMap.mapId() === WORLD_MAP_ID) ? ":w" : "");
    const hit = resolveCache.get(key);
    if (hit) return copyResolved(hit);
    const resolved = resolveSquareUncached(worldX, worldY, opts);
    if (resolved) {
      resolveCache.set(key, resolved);
      while (resolveCache.size > RESOLVE_CACHE_LIMIT) {
        resolveCache.delete(resolveCache.keys().next().value);
      }
      return copyResolved(resolved);
    }
    return resolved;
  }

  // Every caller has always been handed an object of its own - the build pass
  // writes structureHints onto the one it was given - so the memo hands out
  // copies rather than the entry itself. The three nested members are the only
  // ones anything downstream reads a field out of.
  function copyResolved(r) {
    const copy = Object.assign({}, r);
    if (r.adjacentBiomes) copy.adjacentBiomes = Object.assign({}, r.adjacentBiomes);
    if (r.cacheInfo) copy.cacheInfo = Object.assign({}, r.cacheInfo);
    if (r.diagonalBiomes) copy.diagonalBiomes = Object.assign({}, r.diagonalBiomes);
    return copy;
  }

  function resolveSquareUncached(worldX, worldY, opts) {
    opts = opts || {};
    const pg = ($gameSystem && $gameSystem._procGenData) || {};
    const depth = opts.depth != null ? opts.depth : (pg.biomeLayerStack || []).length;
    const cache = opts.cache !== undefined ? opts.cache : pg.biomeCoordinateCache;
    const alienGrid = opts.alienGrid !== undefined ? opts.alienGrid : pg.alienGrid;
    const onWorldMap = opts.onWorldMap != null
      ? opts.onWorldMap
      : !!($gameMap && $gameMap.mapId() === WORLD_MAP_ID);
    const hasCache = !!(cache && Object.keys(cache).length > 0);

    let surfaceName = "Fields"; // i18n-ignore  biome id
    let roadDirection = null;
    let bridgeDirection = null;

    if (alienGrid) {
      // A planet's landing grid is planet-local and small, so its (gx, gy) can
      // coincidentally match a real Earth coordinate: none of Earth's caches,
      // markers or overrides may be consulted for it. The whole planet is one
      // biome anyway.
      surfaceName = alienGrid.biome;
    } else {
      bridgeDirection = $gameSystem.getBridgeDirectionAt
        ? $gameSystem.getBridgeDirectionAt(worldX, worldY)
        : null;
      const override = getHardcodedBiomeOverride(worldX, worldY);
      if (bridgeDirection) {
        surfaceName = "Bridge"; // i18n-ignore  biome id
        roadDirection = bridgeDirection;
      } else if (override) {
        surfaceName = override.biome;
        roadDirection = override.roadDirection || null;
      } else {
        let raw = rawWorldBiomeAt(worldX, worldY, cache, onWorldMap);
        if (raw.startsWith("Road ")) { // i18n-ignore  biome id
          roadDirection = raw.substring(5).toLowerCase();
          raw = "Road"; // i18n-ignore  biome id
        }
        // A cached name can be a special rolled for a DIFFERENT world (the cache
        // may be preloaded from a BiomesMap.json snapshot). Unwrap to the parent
        // so the roll below is made again for the world in hand.
        surfaceName = unwrapSpecialBiome(raw);
      }
      surfaceName = normalizeLatitudeBiome(surfaceName, worldY);
      // A bridge is never rerolled: swapping the biome would drop the crossing.
      if (!bridgeDirection) surfaceName = resolveSpecialBiome(surfaceName, worldX, worldY);
    }

    let biome = getBiomeByName(surfaceName);
    if (!biome) {
      biome = getBiomeByName("Fields"); // i18n-ignore  biome id
      surfaceName = biome ? biome.name : surfaceName;
    }

    // A road painted over a terrain biome dresses its verges with that biome's
    // own features. Settlements are excluded: a road through a city keeps the
    // plain civic look.
    let underBiome = null;
    if (!alienGrid && biome && isRoadBiome(surfaceName) &&
        $gameSystem.getUnderBiomeFromWorldCoordinates) {
      const under = $gameSystem.getUnderBiomeFromWorldCoordinates(worldX, worldY);
      if (under && under !== surfaceName && !isRoadBiome(under) &&
          !isCityBiome(under) && !isVillageBiome(under) && !isBurgBiome(under)) {
        underBiome = under;
      }
    }

    // Adjacency. On an alien planet every neighbour is the same biome; on Earth
    // it is the live tile column where that is readable and the cache otherwise.
    let adjacentBiomes = null, cacheInfo = null, diagonalBiomes = null;
    if (alienGrid) {
      const n = normalizeBiomeForEdge(surfaceName);
      adjacentBiomes = { north: n, south: n, east: n, west: n };
    } else {
      if (onWorldMap) adjacentBiomes = getAdjacentBiomesOnWorldMap(worldX, worldY);
      if (hasCache) {
        const cached = getAdjacentBiomesFromCache(worldX, worldY, cache);
        adjacentBiomes = adjacentBiomes || { north: null, south: null, east: null, west: null };
        for (const side of ["north", "south", "east", "west"]) {
          adjacentBiomes[side] = cached[side] || adjacentBiomes[side];
        }
        cacheInfo = checkAdjacentMapBiomesFromCache(worldX, worldY, cache);
        diagonalBiomes = checkDiagonalMapBiomesFromCache(worldX, worldY, cache);
      }
      if (adjacentBiomes) {
        adjacentBiomes = {
          north: normalizeBiomeForEdge(adjacentBiomes.north),
          south: normalizeBiomeForEdge(adjacentBiomes.south),
          east: normalizeBiomeForEdge(adjacentBiomes.east),
          west: normalizeBiomeForEdge(adjacentBiomes.west),
        };
      }
    }

    const displayAsBeach = alienGrid ? false : shouldDisplayAsBeach(surfaceName, adjacentBiomes, diagonalBiomes);

    // Underground: the square is built from the surface biome's lower layer, and
    // the neighbours it is blended against stay SURFACE names (that is what the
    // cave generator's sealed-side test reads, see undergroundNeighbourNames).
    let biomeName = surfaceName;
    if (depth > 0 && biome && biome.lowerLayer) {
      let lowerName = biome.lowerLayer;
      if (displayAsBeach && lowerName === 'Cave') lowerName = 'CaveFlooded';
      const lower = getBiomeByName(lowerName);
      if (lower) { biomeName = lowerName; biome = lower; }
    }

    return {
      worldX, worldY, depth,
      surfaceBiome: surfaceName,
      biomeName,
      biome,
      tilesetId: biome ? biome.tilesetId : null,
      roadDirection,
      bridgeDirection,
      underBiome,
      adjacentBiomes,
      cacheInfo,
      diagonalBiomes,
      alien: !!alienGrid,
      // A homogeneous planet has no coastline, so beach/island substitution
      // (which only means anything at a biome transition) never applies.
      displayAsBeach: alienGrid ? false : (depth > 0 ? false : displayAsBeach),
      displayAsIsland: alienGrid ? false : (shouldDisplayAsIsland ? shouldDisplayAsIsland(biomeName, adjacentBiomes) : false),
      seed: procMapSeed(worldX, worldY, depth),
      dayTemperature: (biome && biome.dayTemperature) || 20,
      nightTemperature: (biome && biome.nightTemperature) || 10,
    };
  }

  // Built squares, keyed by coordinate, depth and world seed. A stitching window
  // of nine shares six of its squares with the window it is about to become, so
  // re-centring costs three squares rather than nine. Bounded, because one
  // square is a ~150k-entry array and the party can walk a long way.
  const SQUARE_CACHE_LIMIT = 24;
  const squareCache = new Map();

  function squareCacheKey(worldX, worldY, depth) {
    return getWorldSeed() + ":" + depth + ":" + worldX + "," + worldY;
  }

  function rememberSquare(key, built) {
    squareCache.set(key, built);
    while (squareCache.size > SQUARE_CACHE_LIMIT) {
      squareCache.delete(squareCache.keys().next().value);
    }
  }

  /**
   * Resolve AND build one world square: terrain, then the prefab pass the
   * DataManager.loadMapData hook would otherwise run once the square became the
   * loaded map. A stitched neighbour never becomes the loaded map on its own, so
   * it has to be finished here, or its houses would only appear at the moment
   * the party crossed onto it.
   */
  // A square built straight through, on the frame that asks for it. Everything
  // that needs the ground under the party NOW comes here: entering off the world
  // map, a crossing the window could not stitch, a staircase, a landing.
  function buildSquare(worldX, worldY, opts) {
    opts = opts || {};
    const pg = $gameSystem && $gameSystem._procGenData;
    const depth = opts.depth != null ? opts.depth : ((pg && pg.biomeLayerStack) || []).length;
    const key = squareCacheKey(worldX, worldY, depth);
    if (!opts.fresh) {
      const hit = squareCache.get(key);
      if (hit) return hit;
    }
    // A job left half-done on this very square is finished off rather than
    // thrown away; one on any other square is abandoned, because the passes
    // below share module state (the influence field, the beach coordinates, the
    // borrowed square scope) and two builds may never be in flight at once.
    if (liveJob) {
      if (liveJob.key === key && !opts.fresh) {
        const built = liveJob.finish();
        if (built) return built;
      } else {
        liveJob.cancel();
      }
    }
    return new SquareJob(worldX, worldY, opts, key, depth).finish();
  }

  // ---- one square, built a slice at a time --------------------------------
  //
  // The same passes in the same order as buildSquare above; the only difference
  // is that the generator is allowed to stop between them and be picked up on a
  // later frame. The square scope is borrowed for the length of each SLICE
  // rather than of the whole build, so between slices _procGenData still
  // describes the square the party is actually standing on and every other
  // system reads the right answer.

  let liveJob = null;

  function nowMs() {
    if (typeof performance !== "undefined" && performance.now) return performance.now();
    return Date.now();
  }

  function SquareJob(worldX, worldY, opts, key, depth) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.opts = opts;
    this.key = key;
    this.depth = depth;
    this.built = null;
    this.done = false;
    this.cancelled = false;
    // This square's own copy of the scoped fields, held between slices.
    this.mine = null;
    this.it = buildSquareSteps(this);
    liveJob = this;
  }

  // Install this job's square scope over whatever is there and hand back what
  // was, so it can be put straight again the moment the slice ends.
  SquareJob.prototype._scopeIn = function() {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg) return null;
    const outer = {};
    for (const key of SQUARE_SCOPED_KEYS) {
      outer[key] = pg[key];
      if (this.mine) pg[key] = this.mine[key];
    }
    return outer;
  };

  SquareJob.prototype._scopeOut = function(outer) {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg || !outer) return;
    const mine = {};
    for (const key of SQUARE_SCOPED_KEYS) {
      mine[key] = pg[key];
      pg[key] = outer[key];
    }
    this.mine = mine;
  };

  // Advance the build for about budgetMs milliseconds, then stop at the next
  // safe point. A pass never stops in the middle of a tile, so the budget is a
  // target rather than a promise: one slice of the heaviest pass there is runs
  // around half a millisecond over.
  SquareJob.prototype.step = function(budgetMs) {
    if (this.done || this.cancelled) return { done: true, built: this.built };
    const until = nowMs() + (budgetMs > 0 ? budgetMs : 0);
    const outer = this._scopeIn();
    try {
      do {
        const r = this.it.next();
        if (r.done) {
          this.built = r.value || null;
          this.done = true;
          break;
        }
      } while (nowMs() < until);
    } catch (e) {
      console.error(`[ProcGenSquare] could not build (${this.worldX},${this.worldY})`, e);
      this.done = true;
      this.built = null;
    } finally {
      this._scopeOut(outer);
      if (this.done && liveJob === this) liveJob = null;
    }
    return { done: this.done, built: this.built };
  };

  // Run whatever is left of the build out on this frame.
  SquareJob.prototype.finish = function() {
    while (!this.done && !this.cancelled) this.step(Infinity);
    return this.built;
  };

  SquareJob.prototype.cancel = function() {
    this.cancelled = true;
    this.done = true;
    this.built = null;
    if (liveJob === this) liveJob = null;
  };

  function* buildSquareSteps(job) {
    const worldX = job.worldX, worldY = job.worldY, opts = job.opts;
    const pg = $gameSystem && $gameSystem._procGenData;

    const resolved = resolveSquare(worldX, worldY, opts);
    if (!resolved.biome) return null;
    yield;

    if (pg) {
      // The generators read these off _procGenData rather than taking them as
      // arguments, so the square being built has to own them for the length of
      // the call.
      pg.currentBiome = resolved.biomeName;
      pg.currentBiomeTileset = resolved.tilesetId;
      pg.currentRoadDirection = resolved.roadDirection;
      pg.currentUnderBiome = resolved.underBiome;
      pg.currentBridgeDirection = resolved.bridgeDirection;
      pg.displayAsBeach = resolved.displayAsBeach;
      pg.displayAsIsland = resolved.displayAsIsland;
      pg.structureHints = null;
      pg.originX = worldX;
      pg.originY = worldY;
    }
    const mapData = yield* generateProceduralTerrainSteps(
      resolved.biome, resolved.seed, resolved.roadDirection,
      resolved.adjacentBiomes, resolved.cacheInfo,
      { x: worldX, y: worldY },
      resolved.alien ? null : (pg && pg.biomeCoordinateCache)
    );
    if (mapData && window.ProceduralMapPrefabs) {
      yield;
      let hints = (pg && pg.structureHints) || undefined;
      if (mapData.rooms && mapData.rooms.length) {
        hints = Object.assign({}, hints, { roomHints: mapData.rooms });
      }
      yield* window.ProceduralMapPrefabs.applyPrefabsToMapSteps(
        mapData, resolved.biomeName, { x: worldX, y: worldY }, hints
      );
      yield;
      window.ProceduralMapPrefabs.markPrefabbed(mapData);
    }
    // The hints the structure generator leaves behind describe THIS square and
    // travel with it, so a stitched cell can still be asked where its stairs
    // and its rooms are once it is only part of a bigger map.
    resolved.structureHints = (pg && pg.structureHints) || null;

    if (!mapData) return null;
    const built = { key: job.key, resolved, mapData };
    rememberSquare(job.key, built);
    return built;
  }

  // Open a resumable build of one square. The caller keeps calling step() with a
  // per-frame budget until it answers done. A square already built comes back as
  // a job that is finished before it starts, so the caller never special-cases
  // the cache.
  function buildJob(worldX, worldY, opts) {
    opts = opts || {};
    const pg = $gameSystem && $gameSystem._procGenData;
    const depth = opts.depth != null ? opts.depth : ((pg && pg.biomeLayerStack) || []).length;
    const key = squareCacheKey(worldX, worldY, depth);
    const hit = opts.fresh ? null : squareCache.get(key);
    if (hit) {
      return { key, done: true, built: hit, step: () => ({ done: true, built: hit }), cancel() {} };
    }
    if (liveJob) {
      if (liveJob.key === key) return liveJob;
      liveJob.cancel();
    }
    return new SquareJob(worldX, worldY, opts, key, depth);
  }

  function forgetSquares() {
    squareCache.clear();
    forgetResolved();
  }

  // Is this square already built? The answer is what lets the stitching window
  // build the ground ahead of the party a little at a time instead of stopping
  // the game to build three squares at the moment they are needed.
  function hasSquare(worldX, worldY, depth) {
    const pg = $gameSystem && $gameSystem._procGenData;
    const d = depth != null ? depth : ((pg && pg.biomeLayerStack) || []).length;
    return squareCache.has(squareCacheKey(worldX, worldY, d));
  }

  /**
   * Register a square somebody else already built, so a window laid around it
   * keeps the very array the party is standing on instead of generating a second
   * one. Everything that entered map 636 the old way (from the world map, down a
   * staircase, out of a house) has already done the work by the time the window
   * opens; regenerating over the top of it would be both wasted and, for a forced
   * or structure biome the resolver cannot reproduce, wrong.
   */
  function adoptSquare(worldX, worldY, depth, mapData, resolvedOverride) {
    if (!mapData) return null;
    const key = squareCacheKey(worldX, worldY, depth);
    const hit = squareCache.get(key);
    if (hit && hit.mapData === mapData) return hit;
    const resolved = resolvedOverride || resolveSquare(worldX, worldY, { depth });
    if (!resolved) return null;
    const built = { key, resolved, mapData };
    rememberSquare(key, built);
    return built;
  }

  window.ProcGenSquare = {
    resolve: resolveSquare,
    build: buildSquare,
    // A build spread over frames (see SquareJob). The stitched window uses this
    // so the ground ahead of a walking party costs a few milliseconds a frame
    // instead of a whole dropped one every quarter second.
    buildJob,
    adopt: adoptSquare,
    has: hasSquare,
    forget: forgetSquares,
    borrowScope: borrowSquareScope,
    returnScope: returnSquareScope,
    SCOPED_KEYS: SQUARE_SCOPED_KEYS,
  };

  // ===== EXPORTS FOR OTHER PLUGINS =====
  window.generateProceduralTerrain = generateProceduralTerrain;
  window.shouldDisplayAsBeach = shouldDisplayAsBeach;
  window.shouldDisplayAsIsland = shouldDisplayAsIsland;
  window.getHardcodedBiomeOverride = getHardcodedBiomeOverride;
  window.placeGoDownEvent = placeGoDownEvent;
  window.placeGoUpEvent = placeGoUpEvent;
  window.placeChestEvents = placeChestEvents;
  window.placeSpikeTrapEvents = placeSpikeTrapEvents;
  window.placeDungeonDoorEvents = placeDungeonDoorEvents;
  window.placeKeyChestEvents = placeKeyChestEvents;
  window.placePolicemanEvents = placePolicemanEvents;
  window.isInteriorBiome = isInteriorBiome;
  window.isProceduralInteriorMap = isProceduralInteriorMap;

  // The named façade for the procedural interiors (dungeon, crypt, sewer, loot
  // cellar, temple inside, cave den, patron vault, every cave and every layer
  // below the surface). The two bare globals above are the historical spelling
  // and stay for the plugins already calling them.
  window.ProceduralInteriors = {
    // True for a biome NAME that generates an enclosed, roofed-over map.
    isBiome: isInteriorBiome,
    // True while the loaded procedural map IS one of them.
    isCurrent: isProceduralInteriorMap,
    // True for a biome NAME built by the enclosed floor/rim/wall generator
    // (Dungeon, Crypt, Sewer, LootCellar, TempleInside, CaveDen, PatronVault
    // and the rest of the structure catalogue). Narrower than isBiome: the
    // caves are roofed too but are not built from the catalogue. FogOfWar asks
    // this one, because a structure is a room-by-room place worth exploring.
    isStructureBiome: isDungeonBiome,
    // The structure biome the party is standing in on the SURFACE layer, or ""
    // anywhere else (off the procedural map, out in the open, or on one of the
    // layers below the surface, which fog deliberately leaves alone).
    currentStructureBiome() {
      if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return "";
      const data = $gameSystem && $gameSystem._procGenData;
      if (!data) return "";
      if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return "";
      const name = data.currentBiome || "";
      return isDungeonBiome(name) ? name : "";
    },
    // The biome the player is standing in, or "" off the procedural map.
    currentBiome() {
      if (!isProceduralInteriorMap()) return "";
      const data = $gameSystem && $gameSystem._procGenData;
      return (data && data.currentBiome) || "";
    }
  };

  // Alien-surface terrain generators (see the block above generateBiomeBody's
  // dispatch), exported for scripts/test_alienterrain.js -- the generateBiomeBody
  // dispatch itself is exercised through Game_System.prototype.generateProceduralMap
  // in normal play, but these three are the pure, self-contained pieces a Node
  // harness can call directly without a full RMMZ stub.
  window.ProcGenAlienTerrain = {
    resolveAlienRoute,
    generateAlienTerrestrialTerrain,
    generateAlienCraterFieldTerrain,
    findPassableLandingTile,
  };
})();
