/*:
 * @target MZ
 * @plugindesc Procedural dungeon biome generation using BSP algorithm
 * @author Omni-Lex
 *
 * @help
 * Procedural Map Dungeon Generator
 * =================================
 * Generates structured dungeon biomes using Binary Space Partition (BSP) algorithm
 * Creates interconnected rooms and corridors with multiple feature types:
 * - DungeonFloor (walkable areas)
 * - DungeonWall (impassable walls)
 * - Ceiling (decorative ceiling)
 *
 * ALGORITHM: Binary Space Partition (BSP)
 * =======================================
 * 1. Starts with entire map as single space
 * 2. Recursively splits space horizontally/vertically
 * 3. Creates rooms within each partition
 * 4. Connects rooms with corridors
 * 5. Results in structured, connected dungeon layouts
 *
 * FEATURES USED:
 * - DungeonFloor: Walkable floor tiles
 * - DungeonWall: Impassable wall tiles
 * - Ceiling: Overhead tiles/decoration
 *
 * Requires ProceduralMapUtils.js to be loaded first
 * Integrates with ProceduralMapBiomeGenerator.js for biome generation
 */

(() => {
  "use strict";

  const pluginName = "ProceduralMapStructureGenerator";

  // Set true to emit this generator's verbose per-generation diagnostics.
  const DEBUG = false;
  const dlog = (...a) => { if (DEBUG) console.log(...a); };

  // Import utilities from ProceduralMapUtils
  const Utils2 = window.ProcGenUtils;
  if (!Utils2) {
    console.error(
      "ProceduralMapStructureGenerator requires ProceduralMapUtils plugin"
    );
    return;
  }

  const {
    createSeededRandom,
    randomChoice,
    calculateIndex,
    generateDungeonWithBSP,
    PROC_MAP_WIDTH,
    PROC_MAP_HEIGHT,
  } = Utils2;

  // ===== DUNGEON FEATURE DETECTION =====

  /**
   * Determine which directions have water adjacent biomes
   * Returns object with north, south, east, west boolean flags
   */
  function getWaterDirections(adjacentBiomes) {
    if (!adjacentBiomes) {
      return { north: false, south: false, east: false, west: false };
    }

    const isWaterBiome = (biomeName) => {
      if (!biomeName) return false;
      const name = biomeName.toLowerCase();
      return name.includes("ocean") || name.includes("water") || name.includes("sea");
    };

    return {
      north: isWaterBiome(adjacentBiomes.north),
      south: isWaterBiome(adjacentBiomes.south),
      east: isWaterBiome(adjacentBiomes.east),
      west: isWaterBiome(adjacentBiomes.west)
    };
  }

  /**
   * Add full directional beach layout with water, sand, and seashells
   * where water biomes are adjacent
   */
  function addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng) {
    if (!adjacentBiomes) return;

    const waterDirs = getWaterDirections(adjacentBiomes);
    const beachTiles = getFeatureTiles("Beach", allFeatures);
    const waterTiles = getFeatureTiles("Water", allFeatures);
    const seashellTiles = getFeatureTiles("Seashell", allFeatures);

    if (!beachTiles || beachTiles.length === 0) return;

    const beachTile = beachTiles[0];
    const waterTile = waterTiles ? waterTiles[0] : beachTile;
    const maxEdgeDepth = 12; // Depth of water/beach gradient from edge
    const beachSandWidth = 4; // Width of sandy beach area

    // Helper to place seashells on a beach tile
    function placeSeashell(x, y) {
      if (seashellTiles && seashellTiles.length > 0 && rng() < 0.08) {
        const idx = calculateIndex(x, y, 1, width, height);
        if (idx >= 0 && idx < mapData.length) {
          mapData[idx] = seashellTiles[Math.floor(rng() * seashellTiles.length)];
        }
      }
    }

    // North edge (water from top, land below)
    if (waterDirs.north) {
      for (let x = 0; x < width; x++) {
        // Create natural variance in coastline depth
        const variance = Math.sin(x / 20) * 3 + Math.sin(x / 7) * 2;
        const coastlineDepth = Math.max(3, Math.floor(6 + variance));
        const actualDepth = Math.min(maxEdgeDepth, coastlineDepth);

        for (let y = 0; y < actualDepth; y++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (y < actualDepth - beachSandWidth) {
            // Water area
            mapData[idx] = waterTile;
          } else {
            // Beach sand area
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // South edge (water from bottom, land above)
    if (waterDirs.south) {
      for (let x = 0; x < width; x++) {
        const variance = Math.sin(x / 20 + 100) * 3 + Math.sin(x / 7 + 100) * 2;
        const coastlineDepth = Math.max(3, Math.floor(6 + variance));
        const actualDepth = Math.min(maxEdgeDepth, coastlineDepth);
        const startY = Math.max(0, height - actualDepth);

        for (let y = startY; y < height; y++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (y > height - actualDepth + beachSandWidth) {
            // Water area
            mapData[idx] = waterTile;
          } else {
            // Beach sand area
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // East edge (water from right, land left)
    if (waterDirs.east) {
      for (let y = 0; y < height; y++) {
        const variance = Math.sin(y / 20 + 200) * 3 + Math.sin(y / 7 + 200) * 2;
        const coastlineDepth = Math.max(3, Math.floor(6 + variance));
        const actualDepth = Math.min(maxEdgeDepth, coastlineDepth);
        const startX = Math.max(0, width - actualDepth);

        for (let x = startX; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (x > width - actualDepth + beachSandWidth) {
            // Water area
            mapData[idx] = waterTile;
          } else {
            // Beach sand area
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // West edge (water from left, land right)
    if (waterDirs.west) {
      for (let y = 0; y < height; y++) {
        const variance = Math.sin(y / 20 + 300) * 3 + Math.sin(y / 7 + 300) * 2;
        const coastlineDepth = Math.max(3, Math.floor(6 + variance));
        const actualDepth = Math.min(maxEdgeDepth, coastlineDepth);

        for (let x = 0; x < actualDepth; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (x < actualDepth - beachSandWidth) {
            // Water area
            mapData[idx] = waterTile;
          } else {
            // Beach sand area
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // Corners: blend where two water directions meet
    const hasNorth = waterDirs.north;
    const hasSouth = waterDirs.south;
    const hasEast = waterDirs.east;
    const hasWest = waterDirs.west;

    // Northeast corner
    if (hasNorth && hasEast) {
      const cornerSize = 8;
      for (let y = 0; y < cornerSize; y++) {
        const variance = Math.sin(y / 8) * 2;
        const depth = Math.max(2, Math.floor(4 + variance));
        const limit = Math.min(cornerSize, depth);
        for (let x = width - limit; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (y + (width - x) < 3) {
            mapData[idx] = waterTile;
          } else {
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // Northwest corner
    if (hasNorth && hasWest) {
      const cornerSize = 8;
      for (let y = 0; y < cornerSize; y++) {
        const variance = Math.sin(y / 8 + 50) * 2;
        const depth = Math.max(2, Math.floor(4 + variance));
        for (let x = 0; x < depth; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (y + x < 3) {
            mapData[idx] = waterTile;
          } else {
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // Southeast corner
    if (hasSouth && hasEast) {
      const cornerSize = 8;
      for (let y = height - cornerSize; y < height; y++) {
        const variance = Math.sin((height - y) / 8) * 2;
        const depth = Math.max(2, Math.floor(4 + variance));
        const limit = Math.min(cornerSize, depth);
        for (let x = width - limit; x < width; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if ((height - y) + (width - x) < 3) {
            mapData[idx] = waterTile;
          } else {
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }

    // Southwest corner
    if (hasSouth && hasWest) {
      const cornerSize = 8;
      for (let y = height - cornerSize; y < height; y++) {
        const variance = Math.sin((height - y) / 8 + 50) * 2;
        const depth = Math.max(2, Math.floor(4 + variance));
        for (let x = 0; x < depth; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if ((height - y) + x < 3) {
            mapData[idx] = waterTile;
          } else {
            mapData[idx] = beachTile;
            placeSeashell(x, y);
          }
        }
      }
    }
  }

  // ===========================================================================
  // THE STRUCTURE CATALOGUE
  // ===========================================================================
  // Every enclosed interior the game generates is one entry in this table, and
  // the table is the ONLY place that knows the list. Six files used to keep a
  // hardcoded roll-call of structure biome names apiece (this generator, the
  // forced-biome command, the chest pass, the trap pass, the encounter spawner,
  // the puzzle placer) and they had already drifted apart from one another; a
  // catalogue this size cannot be maintained that way, so they all read
  // `window.ProcGenDungeon.structure()` now.
  //
  // An entry declares six things:
  //
  //   layout      which carver draws the plan (see generateDungeonBiome)
  //   palette     the LIMITED set of ground textures the place is paved with:
  //               one `main` (every corridor and every unpatterned floor tile),
  //               `accents` (a room takes one, so rooms differ from each other
  //               while the structure still reads as one place), the `rim` rock
  //               drawn in the dead mass around the plan, and which wall family
  //               the faces are cut from. Names are FEATURE names off the
  //               tileset note, never tile ids: which variant of a feature a
  //               given structure uses is rolled from the map seed, so two
  //               cellars are floored differently and one cellar is always
  //               floored the same.
  //   patterns    what a room may draw on its floor in its accent
  //   ornaments   deliberate dressing (pit props down a drift, graves in the
  //               wall niches, a pentagram at the centre) laid before the old
  //               random scatter, which stays on top at a lower rate
  //   entrances   which terrain feature may open onto it. An empty list means
  //               the place is never rolled: the Sewer belongs to the towns
  //               that carry it (Grate) and a patron's Vault to their Hatch.
  //   enemy       who lives there, and how dangerous it is
  //
  // `affinity` is the surface families whose stairways favour this structure
  // (ice country keeps frozen caves under it, a graveyard catacombs); see
  // ProceduralTerrainInteractions, which owns the roll.
  const DANGER = { SAFE: "safe", ORDINARY: "ordinary", HOSTILE: "hostile", DEADLY: "deadly" };

  // i18n-ignore-start  biome ids, layout/rule/feature names and enemy tags: every
  // one of these is a database id, never text the player sees. What IS shown -
  // the structure's display name and its rolled proper name - comes from
  // js/i18n/<lang>/plugins/Biomes.json and Structures.json.
  const STRUCTURES = [
    // --- the five that already existed, reworked ---------------------------
    {
      key: "Dungeon", layout: "bsp", weight: 24, name: "dungeon",
      entrances: ["stairsDown"], affinity: ["dead", "urban", "mountain", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "DungeonFloor", "Dirt"],
                 rim: ["DungeonWall", "CaveWall"], wall: "dungeon" },
      patterns: ["border", "checker", "runner", "none", "none"],
      ornaments: ["braziers", "stoneRims", "statuePairs"],
      dressing: { floor: 0.05, wall: 0.1 },
      enemy: { biomes: ["Dungeon", "Abandoned", "Ruins"], cap: 4, boss: true },
      chests: [4, 7],
      hazards: true,
    },
    {
      key: "Crypt", layout: "tombs", weight: 20, name: "crypt",
      entrances: ["stairsDown"], affinity: ["dead", "rural", "desert"],
      danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Dirt", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "medallion", "none"],
      ornaments: ["nicheGraves", "bonePiles", "candleRing"],
      dressing: { floor: 0.06, wall: 0.1 },
      enemy: { biomes: ["Crypt", "Graveyard"], archetypes: ["Undead", "Skeleton", "Ghost", "ConstructedUndead", "Vampire"], cap: 4, boss: true },
      chests: [4, 7],
      hazards: true,
    },
    {
      key: "LootCellar", layout: "cellar", weight: 26, name: "cellar",
      entrances: ["stairsDown"], affinity: ["rural", "urban", "dead"],
      danger: DANGER.SAFE,
      palette: { main: ["DungeonFloor"], accents: ["WoodenFloor", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "none", "none"],
      ornaments: ["cratePiles", "braziers"],
      dressing: { floor: 0.08, wall: 0.07 },
      enemy: { biomes: ["Sewer", "Abandoned"], cap: [0, 1], boss: false },
      chests: [1, 2],
    },
    {
      key: "CaveDen", layout: "cavern", weight: 20, name: "den",
      entrances: ["stairsDown", "cave"], affinity: ["mountain", "wood", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["CaveFloor"], accents: ["Dirt"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["none"],
      ornaments: ["bonePiles", "rockFall"],
      dressing: { floor: 0.12, wall: 0.1 },
      enemy: { biomes: ["Cave", "Underdark"], cap: 8, boss: false, uniform: true },
      chests: [0, 1],
    },
    {
      key: "TempleInside", layout: "temple", weight: 8, name: "temple",
      entrances: ["stairsDown", "stairsUp"], affinity: ["dead", "weird", "wood"],
      danger: DANGER.DEADLY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "Carpet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["runner", "border", "medallion"],
      ornaments: ["columnRows", "statuePairs", "candleRing"],
      dressing: { floor: 0.05, wall: 0.1 },
      enemy: { biomes: ["Temple", "Crypt", "Heaven", "Eldritch"], cap: 4, boss: false },
      chests: [4, 7],
      hazards: true,
    },

    // --- entrance-exclusive: only reached through one feature ---------------
    {
      key: "Sewer", layout: "canals", weight: 0, name: "sewer",
      entrances: [], affinity: [], danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "CaveFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "none"],
      ornaments: ["waterLanes", "railLine"],
      dressing: { floor: 0.05, wall: 0.14 },
      enemy: { biomes: ["Sewer", "CaveFlooded"], cap: 4, boss: true },
      chests: [4, 7],
      hazards: true,
    },
    // The vault is no longer anybody's private room behind a hatch: it is the
    // rarest thing a stairway can open onto. Weight 1 against a catalogue of
    // sixteens, favoured nowhere, so a party finds one about once in two
    // hundred descents.
    {
      key: "PatronVault", layout: "vault", weight: 1, name: "vault",
      entrances: ["stairsDown"], affinity: [], danger: DANGER.HOSTILE,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Parquet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "medallion", "checker"],
      ornaments: ["columnRows", "braziers", "stoneRims"],
      dressing: { floor: 0.44, wall: 0.2 },
      // A patron's vault is a reward, not a fight: no keepers guard it.
      enemy: { biomes: ["Sewer", "Dungeon"], cap: 0, boss: false },
      chests: [99, 99],
    },

    // --- the new catalogue --------------------------------------------------
    {
      key: "Catacombs", layout: "warren", weight: 16, name: "catacombs",
      entrances: ["stairsDown"], affinity: ["dead", "urban", "desert"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["DungeonFloor", "CaveFloor"],
                 rim: ["CaveWall", "DungeonWall"], wall: "dungeon" },
      patterns: ["none", "speckle"],
      ornaments: ["nicheGraves", "bonePiles", "candleRing"],
      dressing: { floor: 0.09, wall: 0.12 },
      enemy: { biomes: ["Crypt", "Graveyard", "Underdark"], archetypes: ["Undead", "Skeleton", "Ghost", "Bat", "Spider"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "Mineshaft", layout: "drifts", weight: 16, name: "mine",
      entrances: ["stairsDown"], affinity: ["mountain", "desert", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["CaveFloor", "WoodenFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["runner", "none"],
      ornaments: ["pitProps", "oreVeins", "railLine", "cratePiles"],
      dressing: { floor: 0.07, wall: 0.1 },
      enemy: { biomes: ["Mines", "Underdark"], archetypes: ["Gnome", "Golem", "Insectoid", "CrystalEntity", "Bat"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "CaveFrozen", layout: "cavern", weight: 12, name: "frozenCave",
      entrances: ["stairsDown", "cave"], affinity: ["ice"],
      danger: DANGER.HOSTILE,
      palette: { main: ["CaveFloor"], accents: ["Salt", "Pavement"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["speckle", "none"],
      ornaments: ["iceSpikes", "rockFall", "crystalClusters"],
      dressing: { floor: 0.1, wall: 0.08 },
      enemy: { biomes: ["CaveIce", "Ice", "Permafrost", "MountainIce"], cap: 5, boss: true },
      chests: [1, 3],
    },
    {
      key: "Cistern", layout: "piers", weight: 12, name: "cistern",
      entrances: ["stairsDown"], affinity: ["wet", "urban", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Pavement"], accents: ["DungeonFloor", "CaveFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "checker", "none"],
      ornaments: ["waterLanes", "columnRows", "puddles"],
      dressing: { floor: 0.05, wall: 0.13 },
      enemy: { biomes: ["CaveFlooded", "SeaBed", "Sewer"], cap: 5, boss: true },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "FungalWarren", layout: "warren", weight: 14, name: "fungal",
      entrances: ["stairsDown", "cave"], affinity: ["wood", "wet", "mountain"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["CaveFloor", "Grass"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["speckle", "none"],
      ornaments: ["mushroomBeds", "vineCurtains", "puddles"],
      dressing: { floor: 0.14, wall: 0.1 },
      enemy: { biomes: ["Mushroom", "Underdark", "Swamp"], archetypes: ["Plant", "Mushroom", "Insectoid", "Slime", "InsectSwarm"], cap: 6, boss: true },
      chests: [1, 3],
    },
    {
      key: "CrystalCavern", layout: "chambers", weight: 10, name: "crystal",
      entrances: ["stairsDown", "cave"], affinity: ["mountain", "ice", "weird"],
      danger: DANGER.HOSTILE,
      palette: { main: ["CaveFloor"], accents: ["Salt", "Pavement"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["speckle", "none"],
      ornaments: ["crystalClusters", "oreVeins"],
      dressing: { floor: 0.1, wall: 0.09 },
      enemy: { biomes: ["Crystals", "Underdark", "Mines"], archetypes: ["CrystalEntity", "Golem", "Elemental", "Gnome"], cap: 5, boss: true },
      chests: [2, 4],
    },
    {
      key: "Oubliette", layout: "cells", weight: 11, name: "oubliette",
      entrances: ["stairsDown"], affinity: ["dead", "urban", "mountain"],
      danger: DANGER.HOSTILE,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "none"],
      ornaments: ["cellDoors", "chains", "bonePiles"],
      dressing: { floor: 0.07, wall: 0.14 },
      enemy: { biomes: ["Dungeon", "Abandoned", "Crypt"], archetypes: ["Humanoid", "Undead", "Ghost", "ArmoredKnight"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "SunkenLibrary", layout: "halls", weight: 7, name: "library",
      entrances: ["stairsDown", "stairsUp"], affinity: ["weird", "dead", "urban"],
      danger: DANGER.DEADLY,
      palette: { main: ["Parquet"], accents: ["Carpet", "WoodenFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["runner", "border", "medallion"],
      ornaments: ["shelfStacks", "readingDesks", "candleRing"],
      dressing: { floor: 0.06, wall: 0.1 },
      enemy: { biomes: ["Eldritch", "Limbo", "Abandoned"], archetypes: ["Ghost", "Voidspawn", "Humanoid", "Demon"], cap: 4, boss: false },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "UnderForge", layout: "grid", weight: 9, name: "forge",
      entrances: ["stairsDown"], affinity: ["volcanic", "mountain", "urban"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Metal"], accents: ["DungeonFloor", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["checker", "border", "none"],
      ornaments: ["lavaFlow", "forgeGear", "chains"],
      dressing: { floor: 0.08, wall: 0.12 },
      enemy: { biomes: ["Volcano", "Hell", "Factory", "FactoryInside"], archetypes: ["FireElemental", "Golem", "Demon", "Robot"], cap: 5, boss: true },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "ColdWarBunker", layout: "grid", weight: 10, name: "bunker",
      entrances: ["stairsDown"], affinity: ["urban", "rural", "ice"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Metal"], accents: ["TechnoFloor", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["checker", "border", "none"],
      ornaments: ["techPanels", "cratePiles", "railLine"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Factory", "FactoryInside", "Spacecenter", "Abandoned"], archetypes: ["Robot", "Drone", "RoboticDefender", "Turret", "Humanoid"], cap: 5, boss: true },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "BuriedLab", layout: "grid", weight: 8, name: "lab",
      entrances: ["stairsDown"], affinity: ["urban", "weird"],
      danger: DANGER.HOSTILE,
      palette: { main: ["TechnoFloor"], accents: ["Metal", "Techno"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["checker", "border"],
      ornaments: ["glassWalls", "techPanels", "readingDesks"],
      dressing: { floor: 0.07, wall: 0.11 },
      enemy: { biomes: ["Laboratory", "Spacecenter", "Factory"], archetypes: ["Robot", "Mutant", "Slime", "Bacterial", "Drone"], cap: 5, boss: true },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "ProfaneShrine", layout: "rings", weight: 6, name: "shrine",
      entrances: ["stairsDown", "stairsUp"], affinity: ["weird", "dead", "volcanic"],
      danger: DANGER.DEADLY,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["medallion", "border"],
      ornaments: ["pentagramCentre", "candleRing", "bloodStains", "statuePairs"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Hell", "Eldritch", "Limbo"], archetypes: ["Demon", "Voidspawn", "Vampire", "TentacledCreature", "Ghost"], cap: 4, boss: false },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "SmugglerTunnel", layout: "tube", weight: 14, name: "smuggler",
      entrances: ["stairsDown"], affinity: ["rural", "urban", "wet"],
      danger: DANGER.SAFE,
      palette: { main: ["Dirt"], accents: ["WoodenFloor", "CaveFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["none", "runner"],
      ornaments: ["cratePiles", "pitProps"],
      dressing: { floor: 0.09, wall: 0.08 },
      enemy: { biomes: ["Abandoned", "Docks", "City"], archetypes: ["Humanoid", "Beast"], cap: [0, 2], boss: false },
      chests: [2, 3],
    },
    {
      key: "SeaGrotto", layout: "cavern", weight: 11, name: "grotto",
      entrances: ["stairsDown", "cave"], affinity: ["wet"],
      danger: DANGER.ORDINARY,
      palette: { main: ["CaveFloor"], accents: ["Sand", "Dirt"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["speckle", "none"],
      ornaments: ["tidePool", "shellBeds", "rockFall"],
      dressing: { floor: 0.11, wall: 0.08 },
      enemy: { biomes: ["CaveFlooded", "SeaBed", "Beach", "Ocean"], archetypes: ["AquaticFish", "Crustacean", "Octopus", "Turtle", "Serpent"], cap: 5, boss: true },
      chests: [1, 3],
    },
    {
      key: "LavaTube", layout: "tube", weight: 7, name: "lavaTube",
      entrances: ["stairsDown", "cave"], affinity: ["volcanic", "mountain"],
      danger: DANGER.DEADLY,
      palette: { main: ["CaveFloor"], accents: ["Dirt", "Metal"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["speckle", "none"],
      ornaments: ["lavaFlow", "rockFall", "crystalClusters"],
      dressing: { floor: 0.08, wall: 0.08 },
      enemy: { biomes: ["Volcano", "Hell"], archetypes: ["FireElemental", "Hellhound", "Dragon", "Demon", "Elemental"], cap: 4, boss: false },
      chests: [1, 3],
    },
    {
      key: "Barrow", layout: "mound", weight: 10, name: "barrow",
      entrances: ["stairsDown", "stairsUp"], affinity: ["rural", "dead", "ice", "mountain"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Dirt"], accents: ["DungeonFloor", "Grass"],
                 rim: ["CaveWall", "DungeonWall"], wall: "dungeon" },
      patterns: ["border", "medallion", "none"],
      ornaments: ["nicheGraves", "statuePairs", "hoard", "bonePiles"],
      dressing: { floor: 0.08, wall: 0.1 },
      enemy: { biomes: ["Graveyard", "Crypt", "Highlands"], archetypes: ["Undead", "Skeleton", "ArmoredKnight", "Ghost", "Totem"], cap: 4, boss: true },
      chests: [3, 5],
      hazards: true,
    },
    {
      key: "MetroStation", layout: "platform", weight: 9, name: "metro",
      entrances: ["stairsDown"], affinity: ["urban"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Pavement"], accents: ["Metal", "DungeonFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      patterns: ["border", "checker", "none"],
      ornaments: ["railLine", "platformFittings", "techPanels"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Metro", "City", "Abandoned", "Sewer"], archetypes: ["Humanoid", "TrashCreature", "Robot", "Slime", "Ghost"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "SaltWorks", layout: "drifts", weight: 9, name: "salt",
      entrances: ["stairsDown"], affinity: ["desert", "wet", "ice"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Salt"], accents: ["Dirt", "CaveFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      patterns: ["border", "runner", "none"],
      ornaments: ["pitProps", "oreVeins", "cratePiles", "puddles"],
      dressing: { floor: 0.07, wall: 0.09 },
      enemy: { biomes: ["Mines", "Desert", "SaltFlats", "Underdark"], archetypes: ["Golem", "Crustacean", "Elemental", "Insectoid"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
  ];

  // i18n-ignore-end

  const STRUCTURE_INDEX = {};
  for (const s of STRUCTURES) STRUCTURE_INDEX[s.key.toLowerCase()] = s;

  // The carve of the most recent structure generated (see generateDungeonBiome).
  let _lastCarved = null;

  // The entry behind a biome name, or null. Dungeon / Crypt / Sewer are matched
  // on their PREFIX as they always have been (a "DungeonIce" or "Sewer2" in a
  // world's data still has to render as one), everything else exactly.
  function structureFor(biomeName) {
    const n = String(biomeName || "").toLowerCase().trim();
    if (!n) return null;
    if (STRUCTURE_INDEX[n]) return STRUCTURE_INDEX[n];
    if (n.startsWith("dungeon")) return STRUCTURE_INDEX["dungeon"];
    if (n.startsWith("crypt")) return STRUCTURE_INDEX["crypt"];
    if (n.startsWith("sewer")) return STRUCTURE_INDEX["sewer"];
    return null;
  }

  /**
   * Check if biome is a dungeon-family biome (rendered by the enclosed
   * floor/rim/wall generator). Every structure in the catalogue is one, which
   * is the whole point of the catalogue: the list lives in exactly one place.
   */
  function isDungeonBiome(biomeName) {
    return !!structureFor(biomeName);
  }

  /**
   * Check if biome is a village biome
   */
  function isVillageBiome(biomeName) {
    return (
      biomeName.toLowerCase() === "village" ||
      biomeName.toLowerCase().startsWith("village")
    );
  }

  /**
   * Check if biome is a city biome
   */
  function isCityBiome(biomeName) {
    return (
      biomeName.toLowerCase() === "city" ||
      biomeName.toLowerCase().startsWith("city")
    );
  }

  function isBurgBiome(biomeName) {
    return (
      biomeName.toLowerCase() === "burg" ||
      biomeName.toLowerCase().startsWith("burg")
    );
  }

  // ===== DUNGEON FEATURE EXTRACTION =====

  /**
   * Get tiles for a specific feature from feature , ay
   * Extracts single-tile variants for features like DungeonFloor, DungeonWall, Ceiling
   */
  function getFeatureTiles(featureName, allFeatures) {
    const tiles = [];
    if (allFeatures[featureName] && allFeatures[featureName].length > 0) {
      for (const variant of allFeatures[featureName]) {
        if (variant.type === "single" && variant.tileId) {
          tiles.push(variant.tileId);
        }
      }
    }
    return tiles.length > 0 ? tiles : null;
  }

  /**
   * Get random tile from feature tiles
   */
  function getRandomFeatureTile(tiles, rng) {
    if (!tiles || tiles.length === 0) return 0;
    return tiles[Math.floor(rng() * tiles.length)];
  }

  /**
   * Orientation-aware dashed center-line tiles, resolved exactly the way the
   * Road biome resolves them (ProceduralMapRoadGenerator.getDashedLineTileIds):
   * a directional DashedLineHorizontal/DashedLineVertical tag wins over the
   * legacy undirected DashedLine tag. window.ProcGenRoads is read lazily
   * (this plugin can load before ProceduralMapRoadGenerator; by the time a
   * map is actually generated at runtime every plugin has finished loading).
   * @returns {{horizontal: number|null, vertical: number|null}}
   */
  function getDashedLinesForFeatures(allFeatures) {
    const RoadGen = window.ProcGenRoads;
    if (RoadGen && typeof RoadGen.getDashedLineTileIds === "function") {
      return RoadGen.getDashedLineTileIds(allFeatures);
    }
    const legacy = getFeatureTiles("DashedLine", allFeatures);
    const legacyTile = legacy ? legacy[0] : null;
    return { horizontal: legacyTile, vertical: legacyTile };
  }

  /**
   * Orientation-aware pedestrian-crossing ("zebra") tile grids, or
   * {horizontal:null, vertical:null} on a tileset that defines neither -
   * which is what keeps a crossing off any biome whose tileset never
   * declared ZebraHorizontal/ZebraVertical in the first place.
   * @returns {{horizontal: object|null, vertical: object|null}}
   */
  function getZebraForFeatures(allFeatures) {
    const RoadGen = window.ProcGenRoads;
    if (RoadGen && typeof RoadGen.getZebraTileIds === "function") {
      return RoadGen.getZebraTileIds(allFeatures);
    }
    return { horizontal: null, vertical: null };
  }

  /**
   * Place 3-tile wide sidewalks around roads
   * Scans for road tiles and places sidewalk tiles 1-3 tiles away from roads
   * IMPORTANT: Does not overwrite Path/PathDesert/PathIce tiles
   */function placeSidewalksAroundRoads(mapData, width, height, roadSet, sidewalkTiles, rng, pathTileIds, baseTile) {
    if (!sidewalkTiles || sidewalkTiles.length === 0) return;

    const sidewalkTile = sidewalkTiles[0];
    const placedSidewalks = new Set();
    const pathTileSet = new Set(pathTileIds || []);

    for (const roadKey of roadSet) {
      const [rx, ry] = roadKey.split(',').map(Number);

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const sx = rx + dx;
          const sy = ry + dy;
          const sidewalkKey = `${sx},${sy}`;

          if (placedSidewalks.has(sidewalkKey) || roadSet.has(sidewalkKey)) continue;
          if (sx < 1 || sx >= width - 1 || sy < 1 || sy >= height - 1) continue;

          const dist = Math.max(Math.abs(dx), Math.abs(dy));

          if (dist >= 2 && dist <= 3) {
            const idx = calculateIndex(sx, sy, 0, width, height);
            const currentTile = mapData[idx];

            // 1. Never overwrite existing paths
            if (pathTileSet.has(currentTile)) continue;

            // 2. SAFETY CHECK: Only place sidewalk if the tile is Base Terrain or Empty.
            // If it is anything else (e.g., a prefab wall or floor), DO NOT TOUCH IT.
            // We treat 0 as valid to overwrite, and baseTile as valid.
            if (currentTile !== 0 && currentTile !== baseTile) continue;

            mapData[idx] = sidewalkTile;
            placedSidewalks.add(sidewalkKey);
          }
        }
      }
    }
  }

  // ===== DUNGEON GENERATION =====

  /**
   * True when the given tileId is walkable in the biome's tileset. Procedural
   * dungeons MUST enclose the walkable floor with impassable walls, because the
   * Ceiling filler tile is itself passable and may only ever sit behind a wall.
   */
  function isTilePassableInTileset(tilesetId, tileId) {
    const ts = $dataTilesets[tilesetId];
    if (!ts || !ts.flags) return true;
    const f = ts.flags[tileId] || 0;
    if (f & 0x10) return true;   // star (☆) overlay tile: no passage effect
    return (f & 0x0f) === 0;     // any blocked-direction bit set -> impassable
  }

  /**
   * Pick one random DungeonWall variant that is a 3-tall, 1-wide vertical strip.
   * Returns { top, mid, bot } tile ids, falling back to a single wall tile.
   */
  function pickWallColumn(allFeatures, rng) {
    const grids = (allFeatures["DungeonWall"] || []).filter(
      (v) => v.type === "grid" && v.grid && v.grid.length === 3 && v.grid.every((r) => r.length >= 1)
    );
    if (grids.length) {
      const g = grids[Math.floor(rng() * grids.length)].grid;
      return { top: g[0][0], mid: g[1][0], bot: g[2][0] };
    }
    const singles = getFeatureTiles("DungeonWall", allFeatures);
    const w = singles && singles.length ? singles[0] : 1536;
    return { top: w, mid: w, bot: w };
  }

  // ===========================================================================
  // A4 WALL AUTOTILES
  // ===========================================================================
  // Real RPG Maker A4 "wall" blob autotiles instead of a hand-picked 3-tile
  // column: a tileset's A4 sheet packs its wall materials in pairs of autotile
  // kinds - a passable "top/ledge" kind (blended with the FLOOR shape table)
  // directly followed, 8 kinds later, by the matching impassable "side/body"
  // kind of the SAME material (blended with the WALL shape table); this is a
  // fixed, universal MZ convention (Tilemap.isWallTopTile/isWallSideTile: kind
  // % 16 < 8 is the top, >= 8 is the side), never something a tileset chooses.
  // Which kind numbers a given tileset's A4 image actually has painted is not
  // discoverable without loading the PNG (fragile at map-generation time,
  // before the scene owns that tileset), so the handful of tilesets that ship
  // a real dungeon A4 sheet are registered here once the art is confirmed. The
  // Dungeon tileset's A4 (MightyPack Int-A4) has 3 confirmed top/side pairs of
  // 8 colours each, at rows 80/88, 96/104 and 112/120.
  const A4_WALL_TOP_KINDS = {
    304: [80, 81, 82, 83, 84, 85, 86, 87, 96, 97, 98, 99, 100, 101, 102, 103, 112, 113, 114, 115, 116, 117, 118, 119],
  };

  function pickA4WallMaterial(tilesetId, rng) {
    const tops = A4_WALL_TOP_KINDS[tilesetId];
    if (!tops || !tops.length) return null;
    const top = tops[Math.floor(rng() * tops.length)];
    return { top, side: top + 8 };
  }

  // Shape-index tables built once from the shipped engine data. The map editor
  // bakes a blob tile's final shape in from its 4 cardinal same-kind
  // neighbours when a human paints it, and the running game never redoes that
  // on its own, so any tile WE write into raw map data has to bake its own
  // shape the same way.
  //
  // Each table entry is the 4 quadrants [topLeft, topRight, bottomLeft,
  // bottomRight] of the tile, given as [x, y] into that autotile's source
  // block. A quadrant reaching the block's outer column/row is what DRAWS a
  // border on that side, i.e. that side is OPEN (no same-kind neighbour):
  //   west  open  <-> topLeft.x  === 0        east open <-> topRight.x === 3
  //   north open  <-> topLeft.y  === openN    south open <-> bottomLeft.y === openS
  // The two tables disagree on the row markers - the floor/blob table borders
  // north at y 2 and south at y 5, the 16-entry wall table at y 0 and y 3 -
  // so the row values are passed in per table rather than assumed. Getting
  // this wrong is not a subtle mis-corner: it silently resolves the FILLED
  // interior of a region to a corner-notch shape, which tiles the whole rock
  // mass with a repeating angle instead of flat fill.
  // `cornerRows` are the source rows holding the INNER-CORNER pieces, i.e. the
  // little notch drawn when a diagonal neighbour is missing but both of its
  // cardinals are present. Several shapes share one cardinal signature and
  // differ only in how many of those notches they carry; we track cardinals
  // only, so the variant with the fewest notches is the honest match. (The
  // 16-entry wall table has no such variants and passes an empty list.)
  function buildAutotileShapeIndex(table, openNorthY, openSouthY, cornerRows) {
    const index = {};
    const notches = {};
    const corners = cornerRows || [];
    for (let shape = 0; shape < table.length; shape++) {
      const [tl, tr, bl] = table[shape];
      const westOpen = tl[0] === 0;
      const eastOpen = tr[0] === 3;
      const northOpen = tl[1] === openNorthY;
      const southOpen = bl[1] === openSouthY;
      // Connected is the negation of open; the key is west,east,north,south.
      const key = (westOpen ? 0 : 1) + "," + (eastOpen ? 0 : 1) + "," +
        (northOpen ? 0 : 1) + "," + (southOpen ? 0 : 1);
      let n = 0;
      for (const q of table[shape]) if (corners.indexOf(q[1]) >= 0) n++;
      if (!(key in index) || n < notches[key]) { index[key] = shape; notches[key] = n; }
    }
    return index;
  }
  function lookupAutotileShape(index, west, east, north, south) {
    const key = (west ? 1 : 0) + "," + (east ? 1 : 0) + "," + (north ? 1 : 0) + "," + (south ? 1 : 0);
    if (key in index) return index[key];
    const fallbacks = [(west ? 1 : 0) + "," + (east ? 1 : 0) + ",1,1", "1,1,1,1"];
    for (const k of fallbacks) if (k in index) return index[k];
    return 0;
  }
  let _floorShapeIndex = null;
  let _wallShapeIndex = null;
  function floorShapeIndex() {
    return _floorShapeIndex ||
      (_floorShapeIndex = buildAutotileShapeIndex(Tilemap.FLOOR_AUTOTILE_TABLE, 2, 5, [0, 1]));
  }
  function wallShapeIndex() {
    return _wallShapeIndex ||
      (_wallShapeIndex = buildAutotileShapeIndex(Tilemap.WALL_AUTOTILE_TABLE, 0, 3, []));
  }
  // Ceiling/rim rock: the wall material's passable top kind, blended against
  // its own kind's cardinal neighbours so a rim region reads as one blob
  // (bordered at its outer edge, plain within) rather than a repeated tile.
  function ceilingAutotileId(kind, west, east, north, south) {
    return Tilemap.makeAutotileId(kind, lookupAutotileShape(floorShapeIndex(), west, east, north, south));
  }
  // Wall face: the material's impassable side kind, blended the same way so a
  // ring can close around a carved region on all four sides at once.
  function wallAutotileId(kind, west, east, north, south) {
    return Tilemap.makeAutotileId(kind, lookupAutotileShape(wallShapeIndex(), west, east, north, south));
  }

  // ===========================================================================
  // PALETTE
  // ===========================================================================
  // A structure is paved from a LIMITED set of ground textures: one main tile
  // and two or three accents. It used to be a third of the DungeonFloor
  // palette, dealt per tile, so every room of every structure was the same
  // speckle of six tiles and nothing looked like a place.
  //
  // Which variant of a feature a structure gets is rolled from the map seed,
  // so one stairway always opens onto the same floor and the cellar next door
  // is floored differently. Only A-sheet ground tiles are eligible (id >= 1536):
  // the B-E sheets are overlay art with transparency and read as holes when
  // laid on layer 0.
  const GROUND_TILE_MIN = 1536;

  function groundTiles(names, allFeatures, tilesetId) {
    const out = [];
    for (const nm of names || []) {
      for (const v of allFeatures[nm] || []) {
        if (v.type !== "single" || !v.tileId) continue;
        if (v.tileId < GROUND_TILE_MIN) continue;
        if (!isTilePassableInTileset(tilesetId, v.tileId)) continue;
        if (!out.includes(v.tileId)) out.push(v.tileId);
      }
    }
    return out;
  }

  // The rim is the rock drawn in the dead mass hugging the plan. It is never
  // walked on (the impassable wall ring stands between it and the floor), so
  // passability is not asked of it, only that it is a real A-sheet tile.
  function rimTile(names, allFeatures, rng) {
    for (const nm of names || []) {
      const pool = [];
      for (const v of allFeatures[nm] || []) {
        if (v.type === "single" && v.tileId >= GROUND_TILE_MIN) pool.push(v.tileId);
        else if (v.type === "grid") {
          for (const row of v.grid) for (const t of row) if (t >= GROUND_TILE_MIN) pool.push(t);
        }
      }
      if (pool.length) return pool[Math.floor(rng() * pool.length)];
    }
    return 0;
  }

  function buildPalette(S, allFeatures, tilesetId, rng) {
    const p = (S && S.palette) || {};
    // Main: one tile, and the fallback chain ends on DungeonFloor so a tileset
    // that happens not to carry a structure's preferred ground still paves.
    let mainPool = groundTiles(p.main, allFeatures, tilesetId);
    if (!mainPool.length) mainPool = groundTiles(["DungeonFloor", "CaveFloor"], allFeatures, tilesetId);
    if (!mainPool.length) mainPool = [2816];
    const main = mainPool[Math.floor(rng() * mainPool.length)];

    // Accents: 2-3 tiles, never the main one. Drawn from the declared accent
    // features first and topped up from the main feature's other variants, so
    // a structure with a one-tile accent feature still has rooms that differ.
    const accentPool = groundTiles(p.accents, allFeatures, tilesetId)
      .concat(mainPool)
      .filter((t) => t !== main);
    const accents = [];
    const wanted = Math.min(3, Math.max(1, accentPool.length));
    while (accents.length < wanted && accentPool.length) {
      const t = accentPool.splice(Math.floor(rng() * accentPool.length), 1)[0];
      if (!accents.includes(t)) accents.push(t);
    }
    if (!accents.length) accents.push(main);

    // Wall faces: worked masonry, or the natural rock a cave is cut through.
    let wall;
    if (p.wall === "cave") {
      const caveWalls = getFeatureTiles("CaveWall", allFeatures);
      const cw = caveWalls && caveWalls.length ? caveWalls[0] : null;
      wall = cw ? { top: cw, mid: cw, bot: cw } : pickWallColumn(allFeatures, rng);
    } else {
      wall = pickWallColumn(allFeatures, rng);
    }

    const waterList = getFeatureTiles("Water", allFeatures);
    const lavaList = getFeatureTiles("Lava", allFeatures);
    return {
      main, accents,
      rim: rimTile(p.rim, allFeatures, rng),
      wall,
      // A real A4 wall/ceiling autotile pair, when this tileset's A4 sheet is
      // registered (see A4_WALL_TOP_KINDS); null falls back to `wall`/`rim`.
      wallA4: pickA4WallMaterial(tilesetId, rng),
      water: waterList && waterList.length ? waterList[0] : 0,
      lava: lavaList && lavaList.length ? lavaList[Math.floor(rng() * lavaList.length)] : 0,
      patterns: (S && S.patterns && S.patterns.length) ? S.patterns : ["none"],
    };
  }

  // ===========================================================================
  // FLOOR PATTERNS
  // ===========================================================================
  // A room takes ONE accent and ONE pattern, so the rooms of a structure differ
  // from one another while the corridors between them stay the structure's main
  // texture and hold the place together.
  function paintPattern(setTile, room, main, accent, kind, rng) {
    const x0 = room.x, y0 = room.y, w = room.width, h = room.height;
    const x1 = x0 + w - 1, y1 = y0 + h - 1;
    switch (kind) {
      case "border":
        // An accent rim one tile inside the room's own edge.
        for (let x = x0; x <= x1; x++) { setTile(x, y0, accent); setTile(x, y1, accent); }
        for (let y = y0; y <= y1; y++) { setTile(x0, y, accent); setTile(x1, y, accent); }
        break;
      case "checker":
        // 2x2 blocks, not single tiles: a one-tile chequer of two floor
        // textures reads as tiling noise rather than as a paved floor.
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            if (((x >> 1) + (y >> 1)) % 2 === 0) setTile(x, y, accent);
        break;
      case "runner": {
        // A carpet-runner aisle down the room's long axis.
        const horizontal = w >= h;
        const band = Math.max(1, Math.min(3, Math.floor((horizontal ? h : w) / 3)));
        const mid = horizontal ? y0 + (h >> 1) : x0 + (w >> 1);
        const from = mid - ((band - 1) >> 1);
        for (let k = 0; k < band; k++) {
          if (horizontal) for (let x = x0; x <= x1; x++) setTile(x, from + k, accent);
          else for (let y = y0; y <= y1; y++) setTile(from + k, y, accent);
        }
        break;
      }
      case "medallion": {
        // Concentric blocks at the room's centre, main and accent alternating.
        const cx = x0 + (w >> 1), cy = y0 + (h >> 1);
        const r = Math.max(1, Math.min(Math.min(w, h) >> 1, 4));
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const ring = Math.max(Math.abs(dx), Math.abs(dy));
            setTile(cx + dx, cy + dy, (ring & 1) === 0 ? accent : main);
          }
        break;
      }
      case "speckle": {
        // The organic answer: a scatter of the accent through the whole room,
        // which is what a cave floor of two minerals looks like.
        const rate = 0.08 + rng() * 0.07;
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            if (rng() < rate) setTile(x, y, accent);
        break;
      }
      default: break;
    }
  }

  // ===========================================================================
  // ORNAMENTS
  // ===========================================================================
  // Deliberate dressing, laid before the old random scatter: pit props down a
  // drift, graves in the wall niches, shelves in rows with an aisle between
  // them, a pentagram at the centre of a shrine. A structure names the ones it
  // wears; the random scatter still runs on top of them, at a lower rate.
  //
  // `rule` says WHERE the feature lands:
  //   edge     floor that fronts rock, so the thing stands against a wall
  //   corners  the four inner corners of a room
  //   axis     the centre line of a room, along its long side
  //   centre   the middle of the biggest room, once
  //   scatter  anywhere inside a room
  //   rows     evenly spaced rows across a room with an aisle left between them
  //   wall     hung on the impassable wall faces (torches, chains, vines)
  // Everything except `wall` is placed through the same all-four-neighbours-are
  // floor test the random props use, so no ornament can seal a corridor; the
  // final unseal pass then guarantees it for the map as a whole.
  // i18n-ignore-start  Features.json feature names, never labels
  const ORNAMENTS = {
    braziers:         { rule: "corners", features: ["Brazier", "Torch", "Candle"], rate: 0.6 },
    stoneRims:        { rule: "edge", features: ["StoneBlock"], rate: 0.1 },
    statuePairs:      { rule: "corners", features: ["Statue", "ColumnBroken"], rate: 0.35 },
    columnRows:       { rule: "rows", features: ["Column", "ColumnBroken"], rate: 0.9, pitch: 4 },
    pitProps:         { rule: "rows", features: ["WoodPillar", "Column"], rate: 0.8, pitch: 5 },
    nicheGraves:      { rule: "edge", features: ["Grave", "Coffin", "Tomb"], rate: 0.22 },
    bonePiles:        { rule: "scatter", features: ["Bones", "Skull"], rate: 0.07 },
    candleRing:       { rule: "corners", features: ["Candle", "Torch"], rate: 0.5 },
    cratePiles:       { rule: "edge", features: ["Crate", "Sack", "Beer", "Bucket"], rate: 0.16 },
    rockFall:         { rule: "scatter", features: ["Rock", "Stalagmite", "Debris"], rate: 0.05 },
    oreVeins:         { rule: "edge", features: ["Mineral", "Crystal"], rate: 0.14 },
    railLine:         { rule: "axis", features: ["Rail"], rate: 1 },
    crystalClusters:  { rule: "scatter", features: ["Crystal", "Mineral"], rate: 0.05 },
    iceSpikes:        { rule: "scatter", features: ["RockIce", "IcePool", "Crystal"], rate: 0.06 },
    mushroomBeds:     { rule: "scatter", features: ["Mushroom"], rate: 0.1 },
    vineCurtains:     { rule: "wall", features: ["Vine"], rate: 0.14 },
    puddles:          { rule: "scatter", features: ["Puddle", "Mud"], rate: 0.04 },
    chains:           { rule: "wall", features: ["Chain"], rate: 0.16 },
    cellDoors:        { rule: "wall", features: ["Prison", "WindowJail"], rate: 0.3 },
    shelfStacks:      { rule: "rows", features: ["Shelf", "Library"], rate: 0.95, pitch: 3 },
    readingDesks:     { rule: "scatter", features: ["Table", "Chair", "Stool", "Book"], rate: 0.05 },
    forgeGear:        { rule: "edge", features: ["Stove", "Cauldron", "Gear"], rate: 0.12 },
    techPanels:       { rule: "wall", features: ["Tech", "Techno", "ColumnTech", "Gear"], rate: 0.18 },
    glassWalls:       { rule: "rows", features: ["Glass"], rate: 0.7, pitch: 4 },
    pentagramCentre:  { rule: "centre", features: ["Pentagram"], rate: 1 },
    bloodStains:      { rule: "scatter", features: ["Blood"], rate: 0.04 },
    shellBeds:        { rule: "scatter", features: ["Seashell", "SeaPlant", "WaterRock"], rate: 0.07 },
    platformFittings: { rule: "edge", features: ["Streetlight", "Sign", "Clock", "Pole", "Trash", "Chair"], rate: 0.12 },
    hoard:            { rule: "scatter", features: ["Gold", "Weapon", "Vase"], rate: 0.05 },
    // The three that paint layer 0 rather than props are special-cased in the
    // generator, since they change what the ground IS: waterLanes floods the
    // lanes of a cistern or sewer, tidePool drowns a grotto's deepest pocket
    // and lavaFlow runs molten rock through the rock the plan is cut into.
    waterLanes:       { rule: "special" },
    tidePool:         { rule: "special" },
    lavaFlow:         { rule: "special" },
  };

  // i18n-ignore-end

  /**
   * Rewritten dungeon/crypt/sewer generator.
   *   - DungeonFloor  -> room / corridor pavement (only passable variants used)
   *   - Ceiling       -> a thin rock rim hugging the rooms and corridors and the
   *                      area above the wall faces. The dead mass further out is
   *                      left as empty tiles (black), so the plan reads as rooms
   *                      drawn on a void instead of drowning in tiled rubble.
   *   - DungeonWall   -> a single random 3-tall vertical strip drawn on the north
   *                      face of every room and corridor only; south, east and
   *                      west stay open onto the passable Ceiling rim
   *   - Biome features -> decorations placed pathing-safely: floor props on
   *                      fully-enclosed interior tiles, wall fixtures (torches,
   *                      chains, drains, ...) hung on the impassable wall faces.
   *                      Sewers always drip Drain fixtures from their walls.
   * Dungeon / Crypt / Sewer use different layouts, floor palettes and canals so
   * they read very differently. Always carves ONE entrance to the top border and
   * returns the interior spawn tile (mapData.spawnX/spawnY/spawnDir) plus the room
   * rectangles (mapData.rooms) so prefabs can be fitted inside rooms.
   */
  // See RESUMABLE GENERATION in ProceduralMapUtils.js.
  const { runSteps } = window.ProcGenUtils;

  function generateDungeonBiome(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const rng = createSeededRandom(seed);
    const tilesetId = biome.tilesetId;
    // Which structure is being drawn. Everything that used to be a chain of
    // name tests is one catalogue entry now; an unknown name falls back to the
    // plain dungeon rather than rendering as an unpaved void.
    const S = structureFor(biome && biome.name) || STRUCTURE_INDEX["dungeon"];
    const layout = S.layout;
    const isCrypt = layout === "tombs";
    const isSewer = layout === "canals";
    const isCellar = layout === "cellar";
    const isTemple = layout === "temple";
    const isCaveDen = layout === "cavern";
    // A patron's vault: the loot cellar's tiles and dressing on a far bigger
    // plan (PatreonRewards, entered through that patron's own Hatch).
    const isVault = layout === "vault";
    // The lower tower (DungeonFloorSystem): a floor with no way off but its
    // own staircase events, so the south-border entrance every other
    // structure is carved with is left out entirely rather than carved and
    // then merely blocked - a doorway leading off the map edge to nothing
    // reads as broken even when a player can never actually step through it.
    const sealEntrance = !!(allOtherData && allOtherData.worldCoords && allOtherData.worldCoords.sealEntrance);
    const MARGIN = 3;
    const ornaments = S.ornaments || [];
    const hasOrnament = (nm) => ornaments.indexOf(nm) >= 0;

    // --- Tiles --------------------------------------------------------------
    // One main ground texture for the whole structure, two or three accents for
    // its rooms, a rock rim and a wall family: see buildPalette.
    const pal = buildPalette(S, allFeatures, tilesetId, rng);
    const floorTiles = [pal.main];
    // The rock rim hugging the plan. It used to be whatever the tileset's
    // Ceiling feature held, which on tileset 300 is nothing at all, so every
    // interior in the game was rooms drawn on a black void with no rock around
    // them. Each structure names its own rim now (mined stone, ice, masonry),
    // and it stays unreachable: the impassable wall ring stands between the rim
    // and the floor. What must NOT happen is paving the whole map with it -
    // that buries the plan in rubble - so it is still only the 2-tile band
    // `nearFloor` marks out.
    const ceilingTile = pal.rim;
    const wall = pal.wall;
    const wallA4 = pal.wallA4;
    const waterTile = pal.water;

    // --- 1. Layout: carved[y][x] = walkable floor ---------------------------
    const carved = Array.from({ length: height }, () => new Array(width).fill(false));
    const rooms = [];
    const canalRows = [];
    let sewerWaterWidth = 1;
    const dungeonNarrowCorridors = [];
    // A loot cellar that came out roomy and well stocked instead of the cramped
    // hole most of them are. Rolled in the cellar branch below, read again by
    // the dressing pass and published on the map data so the chest pass knows.
    let cellarGrand = false;

    const carveRect = (rx, ry, rw, rh) => {
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++)
          if (x >= 0 && x < width && y >= 0 && y < height) carved[y][x] = true;
    };
    const carveH = (x1, x2, y, thick = 1) => {
      const a = Math.min(x1, x2), b = Math.max(x1, x2);
      for (let x = a; x <= b; x++)
        for (let t = 0; t < thick; t++)
          if (y + t >= 0 && y + t < height && x >= 0 && x < width) carved[y + t][x] = true;
    };
    const carveV = (y1, y2, x, thick = 1) => {
      const a = Math.min(y1, y2), b = Math.max(y1, y2);
      for (let y = a; y <= b; y++)
        for (let t = 0; t < thick; t++)
          if (y >= 0 && y < height && x + t >= 0 && x + t < width) carved[y][x + t] = true;
    };
    const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const addRoom = (rx, ry, rw, rh) => {
      const x = clampTo(rx, MARGIN, width - MARGIN - rw);
      const y = clampTo(ry, MARGIN, height - MARGIN - rh);
      carveRect(x, y, rw, rh);
      const r = { x, y, width: rw, height: rh };
      rooms.push(r);
      return r;
    };
    // Cut an L-shaped passage from a point to the nearest tile already carved,
    // so a chamber placed with a free hand can never end up walled off from the
    // rest of the plan. Called a couple of dozen times at most, so the linear
    // scan for the nearest carved tile is not worth indexing.
    const connectToPlan = (cx, cy, thick = 1) => {
      let best = null, bestD = Infinity;
      for (let y = MARGIN; y < height - MARGIN; y++) {
        for (let x = MARGIN; x < width - MARGIN; x++) {
          if (!carved[y][x]) continue;
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d < bestD) { bestD = d; best = { x, y }; }
        }
      }
      if (!best || bestD === 0) return;
      carveH(cx, best.x, cy, thick);
      carveV(cy, best.y, best.x, thick);
    };
    // Reduce a carve to its largest connected pocket. What makes an organic
    // carve read as ONE place rather than a handful of sealed bubbles.
    const keepLargestPocket = () => {
      const compOf = Array.from({ length: height }, () => new Array(width).fill(0));
      let bestComp = 0, bestSize = 0, compId = 0;
      for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          if (!carved[sy][sx] || compOf[sy][sx]) continue;
          compId++;
          let size = 0;
          const stack = [[sx, sy]];
          compOf[sy][sx] = compId;
          while (stack.length) {
            const [px, py] = stack.pop();
            size++;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = px + dx, ny = py + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              if (!carved[ny][nx] || compOf[ny][nx]) continue;
              compOf[ny][nx] = compId;
              stack.push([nx, ny]);
            }
          }
          if (size > bestSize) { bestSize = size; bestComp = compId; }
        }
      }
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (carved[y][x] && compOf[y][x] !== bestComp) carved[y][x] = false;
      return bestSize;
    };

    if (isVault) {
      // Patron's vault: the loot cellar written large. One great hall filling
      // most of the map, with strongrooms hung off its west, east and north
      // faces and a deep back chamber behind it, every one of them joined to
      // the hall by a 3-wide spoke corridor drawn from the room's centre to the
      // hall's, so nothing can ever end up walled off from the rest.
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      // The hall is as wide as it can be and still leave room for a strongroom
      // (up to 12 tiles) plus its gap on either flank inside the margins.
      const hallW = 25 + Math.floor(rng() * 4);   // 25-28
      const hallH = 17 + Math.floor(rng() * 5);   // 17-21
      const hx = Math.max(MARGIN + 1, Math.floor((width - hallW) / 2));
      const hy = clamp(height - MARGIN - hallH - 4 - Math.floor(rng() * 4),
        MARGIN + 16, height - MARGIN - hallH - 1);
      carveRect(hx, hy, hallW, hallH);
      rooms.push({ x: hx, y: hy, width: hallW, height: hallH });
      const hcx = hx + (hallW >> 1), hcy = hy + (hallH >> 1);
      // An L-shaped 3-wide corridor between two interior points: it starts
      // inside one room and ends inside the other, so both are reachable.
      const spoke = (ax, ay, bx, by) => {
        const ty = clamp(ay, MARGIN, height - MARGIN - 3);
        carveH(ax, bx, ty, 3);
        carveV(ty, by, clamp(bx, MARGIN, width - MARGIN - 3), 3);
      };

      // Deep back chamber: the far end of the vault, straight behind the hall.
      const bw = 17 + Math.floor(rng() * 5);      // 17-21
      const bh = 10 + Math.floor(rng() * 4);      // 10-13
      const bx0 = clamp(hcx - (bw >> 1), MARGIN + 1, width - MARGIN - bw - 1);
      const by0 = clamp(hy - bh - 4 - Math.floor(rng() * 3), MARGIN + 1, hy - bh - 2);
      carveRect(bx0, by0, bw, bh);
      rooms.push({ x: bx0, y: by0, width: bw, height: bh });
      spoke(bx0 + (bw >> 1), by0 + (bh >> 1), hcx, hcy);

      // Strongrooms: a stack of them flanking the hall on each side and more in
      // the top corners flanking the back chamber, dealt in that rotation so a
      // vault comes out symmetric however many it rolls. They are placed with a
      // free hand and are allowed to run into one another: a patron's vault is
      // meant to sprawl, and merged cells read as one long strongroom.
      const SIDES = ["W", "E", "NW", "NE"];
      const strongrooms = 10 + Math.floor(rng() * 4); // 10-13
      for (let i = 0; i < strongrooms; i++) {
        const side = SIDES[i % SIDES.length];
        const cw = 9 + Math.floor(rng() * 4);     // 9-12
        const ch = 7 + Math.floor(rng() * 4);     // 7-10
        const gap = 2 + Math.floor(rng() * 3);
        let cx0, cy0;
        if (side === "W" || side === "E") {
          cx0 = side === "W" ? hx - cw - gap : hx + hallW + gap;
          cy0 = hy - 3 + Math.floor(rng() * Math.max(1, hallH - ch + 6));
        } else {
          cx0 = side === "NW"
            ? MARGIN + 1 + Math.floor(rng() * 3)
            : width - MARGIN - cw - 1 - Math.floor(rng() * 3);
          cy0 = by0 - 1 + Math.floor(rng() * Math.max(1, bh - ch + 3));
        }
        cx0 = clamp(cx0, MARGIN + 1, width - MARGIN - cw - 1);
        cy0 = clamp(cy0, MARGIN + 1, height - MARGIN - ch - 1);
        carveRect(cx0, cy0, cw, ch);
        rooms.push({ x: cx0, y: cy0, width: cw, height: ch });
        spoke(cx0 + (cw >> 1), cy0 + (ch >> 1), hcx, hcy);
      }
    } else if (isCellar) {
      // Loot cellar: one small vaulted store-room (plus an occasional side
      // alcove) sitting just behind the stairs, near the south border so the
      // entrance corridor stays short. Most of them are a cramped hole with a
      // couple of things worth taking in it; the roomy, well-stocked kind (the
      // sizing and the dressing EVERY cellar used to get) is a rare find, and
      // the whole cellar is built and dressed off this one roll.
      cellarGrand = rng() < 0.12;
      // The small kind never drops below 6x5: the Bunker origin scatters six
      // gold hoards over the cellar's open floor and has to fit them all.
      const rw = cellarGrand ? 9 + Math.floor(rng() * 8)  // 9-16
        : 6 + Math.floor(rng() * 4);                      // 6-9
      const rh = cellarGrand ? 7 + Math.floor(rng() * 6)  // 7-12
        : 5 + Math.floor(rng() * 3);                      // 5-7
      const rx = Math.max(MARGIN + 1, Math.floor((width - rw) / 2) + Math.floor(rng() * 7) - 3);
      const ry = Math.max(MARGIN + 1, height - MARGIN - rh - 2 - Math.floor(rng() * 4));
      carveRect(rx, ry, rw, rh);
      rooms.push({ x: rx, y: ry, width: rw, height: rh });
      if (rng() < (cellarGrand ? 0.55 : 0.18)) {
        const aw = (cellarGrand ? 4 : 3) + Math.floor(rng() * 3);
        const ah = (cellarGrand ? 4 : 3) + Math.floor(rng() * 3);
        const left = rng() < 0.5;
        const ax = left ? rx - aw : rx + rw;
        const ay = ry + 1 + Math.floor(rng() * Math.max(1, rh - ah - 1));
        carveRect(ax, ay, aw, ah);
        rooms.push({ x: ax, y: ay, width: aw, height: ah });
      }
    } else if (isTemple) {
      // Temple: long connected halls in a complex, roughly symmetric plan - a
      // central nave capped by a wide sanctum, crossed by full-width transept
      // halls whose ends are linked by long flanking galleries, with side
      // chapels hanging off the galleries.
      const cx = Math.floor(width / 2);
      const naveW = 6 + Math.floor(rng() * 3);                    // 6-8 wide
      const naveTop = MARGIN + 8 + Math.floor(rng() * 6);
      const naveBot = height - MARGIN - 3;
      const nave = { x: cx - (naveW >> 1), y: naveTop, width: naveW, height: naveBot - naveTop };
      carveRect(nave.x, nave.y, nave.width, nave.height);
      rooms.push(nave);

      // Sanctum: a wide chamber capping the nave's north end (contiguous).
      const sw = naveW + 10 + Math.floor(rng() * 8);
      const sh = 8 + Math.floor(rng() * 5);
      const sy = Math.max(MARGIN + 1, naveTop - sh);
      const sanctum = { x: cx - (sw >> 1), y: sy, width: sw, height: naveTop - sy };
      if (sanctum.height > 0) { carveRect(sanctum.x, sanctum.y, sanctum.width, sanctum.height); rooms.push(sanctum); }

      // Transepts: 2-3 long horizontal halls crossing the nave, all spanning
      // the same width so the flanking galleries can tie their ends together.
      const tx1 = MARGIN + 4 + Math.floor(rng() * 5);
      const tx2 = width - MARGIN - 4 - Math.floor(rng() * 5);
      const nTransepts = 2 + Math.floor(rng() * 2);
      const transepts = [];
      for (let t = 0; t < nTransepts; t++) {
        const th = 4 + Math.floor(rng() * 3); // 4-6 tall
        const span = naveBot - naveTop - 10;
        const ty = naveTop + 3 + Math.floor((span * (t + 0.2 + rng() * 0.6)) / nTransepts);
        const hall = { x: tx1, y: ty, width: tx2 - tx1, height: th };
        carveRect(hall.x, hall.y, hall.width, hall.height);
        rooms.push(hall);
        transepts.push(hall);
      }

      // Flanking galleries: long vertical halls joining every transept end.
      if (transepts.length > 1) {
        const first = transepts[0], last = transepts[transepts.length - 1];
        const gw = 3 + Math.floor(rng() * 2);
        for (const gx of [tx1, tx2 - gw]) {
          const gal = { x: gx, y: first.y, width: gw, height: last.y + last.height - first.y };
          carveRect(gal.x, gal.y, gal.width, gal.height);
          rooms.push(gal);
        }
      }

      // Side chapels: rooms hung off the outer face of each gallery/transept
      // end, joined by a short 2-wide passage.
      const nChapels = 2 + Math.floor(rng() * 3);
      for (let c = 0; c < nChapels; c++) {
        const west = rng() < 0.5;
        const hall = transepts[Math.floor(rng() * transepts.length)];
        const cw = 6 + Math.floor(rng() * 5), chh = 5 + Math.floor(rng() * 4);
        const chx = west ? Math.max(MARGIN, tx1 - cw - 3) : Math.min(width - MARGIN - cw, tx2 + 3);
        const chy = Math.max(MARGIN + 1, Math.min(height - MARGIN - chh - 1,
          hall.y + Math.floor(rng() * 5) - 2));
        carveRect(chx, chy, cw, chh);
        rooms.push({ x: chx, y: chy, width: cw, height: chh });
        // Passage from the chapel to the transept edge it hangs off.
        const py = Math.max(hall.y, Math.min(hall.y + hall.height - 2, chy + (chh >> 1)));
        if (west) carveH(chx + cw - 1, tx1, py, 2);
        else carveH(tx2 - 1, chx, py, 2);
      }
    } else if (isCaveDen) {
      // Cave den: a single organic chamber carved with the shared cave
      // algorithms - anywhere from a cramped hollow to a cavern filling the
      // whole map - reduced to its largest connected pocket so it always reads
      // as one enclosed room.
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const dw = Math.min(innerW, 16 + Math.floor(rng() * (innerW - 16 + 1)));
      const dh = Math.min(innerH, 12 + Math.floor(rng() * (innerH - 12 + 1)));
      const ox = MARGIN + Math.floor(rng() * (innerW - dw + 1));
      const oy = MARGIN + Math.max(0, innerH - dh - Math.floor(rng() * 8)); // hug the south side
      const FLOOR = 1, CEIL = 2;
      const sub = (rng() < 0.5)
        ? Utils2.generateCaveWithDrunkenWalk(dw, dh, dw, 0.45, seed ^ 0xdE11, FLOOR, CEIL)
        : Utils2.generateCaveWithCellularAutomata(dw, dh, dw, seed ^ 0xdE11, FLOOR, CEIL);
      for (let y = 0; y < dh; y++)
        for (let x = 0; x < dw; x++)
          if (sub[y * dw + x] === FLOOR) carved[oy + y][ox + x] = true;

      // Keep only the largest connected floor pocket ("single room" cave).
      const bestSize = keepLargestPocket();

      // Degenerate carve (tiny disconnected pockets): fall back to an ellipse.
      if (bestSize < 40) {
        const ecx = ox + (dw >> 1), ecy = oy + (dh >> 1);
        const erx = Math.max(5, dw >> 1), ery = Math.max(4, dh >> 1);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const nx = (x - ecx) / erx, ny = (y - ecy) / ery;
            carved[y][x] = nx * nx + ny * ny <= 1;
          }
      }
    } else if (isSewer) {
      // A grid of tunnels reading as a canal network. The water itself runs
      // 2-4 tiles wide down the middle (one width per sewer), with a dry lane
      // to walk on each side of it.
      sewerWaterWidth = 2 + Math.floor(rng() * 3); // 2-4
      const tunnelThick = sewerWaterWidth + 2;
      const pitch = 10;
      const colsX = [];
      for (let y = MARGIN + 4; y < height - MARGIN - 4; y += pitch) { carveH(MARGIN, width - MARGIN - 1, y, tunnelThick); canalRows.push(y + 1); }
      for (let x = MARGIN + 4; x < width - MARGIN - 4; x += pitch) { carveV(MARGIN, height - MARGIN - 1, x, tunnelThick); colsX.push(x); }
      for (const cy of canalRows) for (const cx of colsX) rooms.push({ x: cx - 1, y: cy - 1, width: tunnelThick + 2, height: tunnelThick + 2 });
    } else if (isCrypt) {
      // A regular grid of small tomb chambers joined by straight corridors.
      const pitch = 9, chamber = 5;
      const grid = [];
      for (let gy = MARGIN + 1; gy + chamber < height - MARGIN; gy += pitch) {
        const row = [];
        for (let gx = MARGIN + 1; gx + chamber < width - MARGIN; gx += pitch) {
          const r = { x: gx, y: gy, width: chamber, height: chamber };
          carveRect(r.x, r.y, r.width, r.height);
          rooms.push(r); row.push(r);
        }
        grid.push(row);
      }
      for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
          const r = grid[i][j];
          const cx = r.x + (chamber >> 1), cy = r.y + (chamber >> 1);
          if (j + 1 < grid[i].length) carveH(cx, grid[i][j + 1].x + (chamber >> 1), cy);
          if (i + 1 < grid.length && grid[i + 1][j]) carveV(cy, grid[i + 1][j].y + (chamber >> 1), cx);
        }
      }
    } else if (layout === "warren") {
      // Warren (catacombs, fungal warren): an organic carve threaded through
      // the rock, with rectangular alcoves cut into its flanks. The alcoves are
      // what make it read as dug rather than found.
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const FLOOR = 1, CEIL = 2;
      const sub = Utils2.generateCaveWithCellularAutomata(innerW, innerH, innerW, seed ^ 0x7A55, FLOOR, CEIL);
      for (let y = 0; y < innerH; y++)
        for (let x = 0; x < innerW; x++)
          if (sub[y * innerW + x] === FLOOR) carved[MARGIN + y][MARGIN + x] = true;
      if (keepLargestPocket() < 200) {
        // A carve that came out as dust: fall back to a plain hall so the
        // structure is always enterable.
        addRoom(Math.floor(width / 2) - 9, Math.floor(height / 2) - 6, 18, 12);
      }
      const nAlcoves = 9 + Math.floor(rng() * 9);
      for (let i = 0; i < nAlcoves; i++) {
        const aw = 3 + Math.floor(rng() * 4), ah = 3 + Math.floor(rng() * 3);
        const ax = MARGIN + 1 + Math.floor(rng() * (width - MARGIN * 2 - aw - 2));
        const ay = MARGIN + 1 + Math.floor(rng() * (height - MARGIN * 2 - ah - 2));
        const r = addRoom(ax, ay, aw, ah);
        connectToPlan(r.x + (aw >> 1), r.y + (ah >> 1));
      }
    } else if (layout === "drifts") {
      // Drifts (mine, salt works): parallel galleries driven the length of the
      // map, cross-cuts joining them, and one worked-out stope where the seam
      // was richest.
      const top = MARGIN + 2, bot = height - MARGIN - 3;
      const nDrifts = 3 + Math.floor(rng() * 3);
      const span = width - MARGIN * 2 - 8;
      const xs = [];
      for (let i = 0; i < nDrifts; i++) {
        const dx = clampTo(MARGIN + 4 + Math.floor((span * (i + 0.5)) / nDrifts) + Math.floor(rng() * 5) - 2,
          MARGIN + 1, width - MARGIN - 4);
        const dw = 2 + Math.floor(rng() * 2);
        carveV(top, bot, dx, dw);
        rooms.push({ x: dx, y: top, width: dw, height: bot - top });
        xs.push(dx);
      }
      const nCuts = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < nCuts; i++) {
        const cy = clampTo(top + 4 + Math.floor(((bot - top - 8) * (i + rng() * 0.7)) / nCuts),
          MARGIN + 1, height - MARGIN - 3);
        carveH(xs[0], xs[xs.length - 1] + 2, cy, 2);
      }
      const sw = 12 + Math.floor(rng() * 10), sh = 8 + Math.floor(rng() * 7);
      const stope = addRoom(xs[Math.floor(rng() * xs.length)] - (sw >> 1),
        top + 2 + Math.floor(rng() * Math.max(1, (bot - top) - sh - 4)), sw, sh);
      connectToPlan(stope.x + (sw >> 1), stope.y + (sh >> 1), 2);
    } else if (layout === "cells") {
      // Cell block (oubliette): a spine corridor with a row of identical cells
      // down each side, and one guard room at the head of it.
      const cx = Math.floor(width / 2);
      const top = MARGIN + 6, bot = height - MARGIN - 4;
      const spineW = 3;
      carveV(top, bot, cx - 1, spineW);
      rooms.push({ x: cx - 1, y: top, width: spineW, height: bot - top });
      const cellW = 5 + Math.floor(rng() * 3), cellH = 4 + Math.floor(rng() * 2);
      const pitch = cellH + 2;
      for (let y = top + 1; y + cellH < bot; y += pitch) {
        for (const side of [-1, 1]) {
          if (rng() < 0.12) continue;   // the odd cell was never cut, or caved in
          const rx = side < 0 ? cx - 2 - cellW : cx + spineW - 1;
          const r = addRoom(rx, y, cellW, cellH);
          // The cell mouth: one tile joining it to the spine, which is where
          // the ornament pass hangs the bars.
          const my = r.y + (cellH >> 1);
          if (side < 0) carveH(r.x + cellW - 1, cx - 1, my);
          else carveH(cx + spineW - 1, r.x, my);
        }
      }
      const gw = 11 + Math.floor(rng() * 6), gh = 7 + Math.floor(rng() * 4);
      const guard = addRoom(cx - (gw >> 1), MARGIN + 1, gw, gh);
      carveV(guard.y + gh - 1, top, cx, 2);
    } else if (layout === "rings") {
      // Rings (profane shrine): concentric galleries around a sanctum, joined
      // by four radial spokes. Everything faces the middle, which is where the
      // ornament pass puts the sigil.
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2) + 2;
      const nRings = 2 + Math.floor(rng() * 2);
      const step = 7 + Math.floor(rng() * 3);
      const maxR = Math.min(cx - MARGIN - 2, cy - MARGIN - 2, height - MARGIN - cy - 2);
      const inner = 5 + Math.floor(rng() * 2);
      addRoom(cx - inner, cy - inner, inner * 2 + 1, inner * 2 + 1);
      for (let i = 1; i <= nRings; i++) {
        const r = Math.min(maxR - 1, inner + i * step);
        if (r <= inner + 1) break;
        const band = 2 + Math.floor(rng() * 2);
        carveH(cx - r, cx + r, cy - r, band);
        carveH(cx - r, cx + r, cy + r, band);
        carveV(cy - r, cy + r, cx - r, band);
        carveV(cy - r, cy + r, cx + r, band);
        rooms.push({ x: cx - r, y: cy - r, width: r * 2, height: band });
        rooms.push({ x: cx - r, y: cy + r, width: r * 2, height: band });
      }
      // Spokes: one per compass point, offset a little so the plan is not a
      // perfect cross.
      const rOut = Math.min(maxR - 1, inner + nRings * step);
      carveV(cy - rOut, cy - inner, cx, 2);
      carveV(cy + inner, cy + rOut, cx, 2);
      carveH(cx - rOut, cx - inner, cy, 2);
      carveH(cx + inner, cx + rOut, cy, 2);
    } else if (layout === "piers") {
      // Piers (cistern): a vaulted hall whose roof is carried on a grid of
      // square piers, so the space is one room and a maze at the same time.
      const x0 = MARGIN + 2, y0 = MARGIN + 2;
      const x1 = width - MARGIN - 3, y1 = height - MARGIN - 3;
      carveRect(x0, y0, x1 - x0, y1 - y0);
      rooms.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      const pier = 2 + Math.floor(rng() * 2);
      const bay = pier + 3 + Math.floor(rng() * 2);
      for (let y = y0 + 3; y + pier < y1 - 2; y += bay)
        for (let x = x0 + 3; x + pier < x1 - 2; x += bay)
          for (let dy = 0; dy < pier; dy++)
            for (let dx = 0; dx < pier; dx++)
              carved[y + dy][x + dx] = false;
    } else if (layout === "halls") {
      // Stack halls (sunken library): long parallel halls tied together at both
      // ends, with a rotunda cut through the middle of them.
      const top = MARGIN + 3, bot = height - MARGIN - 4;
      const nHalls = 3 + Math.floor(rng() * 3);
      const hw = 5 + Math.floor(rng() * 3);
      const gap = 3 + Math.floor(rng() * 2);
      const totalW = nHalls * hw + (nHalls - 1) * gap;
      const startX = Math.max(MARGIN + 2, Math.floor((width - totalW) / 2));
      for (let i = 0; i < nHalls; i++) {
        const hx = startX + i * (hw + gap);
        if (hx + hw >= width - MARGIN) break;
        carveRect(hx, top, hw, bot - top);
        rooms.push({ x: hx, y: top, width: hw, height: bot - top });
      }
      carveH(startX, startX + totalW, top, 3);
      carveH(startX, startX + totalW, bot - 3, 3);
      const rr = 6 + Math.floor(rng() * 3);
      const rcx = startX + (totalW >> 1), rcy = Math.floor((top + bot) / 2);
      for (let dy = -rr; dy <= rr; dy++)
        for (let dx = -rr; dx <= rr; dx++)
          if (dx * dx + dy * dy <= rr * rr) {
            const gx = rcx + dx, gy = rcy + dy;
            if (gx > MARGIN && gy > MARGIN && gx < width - MARGIN && gy < height - MARGIN) carved[gy][gx] = true;
          }
      rooms.push({ x: rcx - rr + 2, y: rcy - rr + 2, width: rr * 2 - 3, height: rr * 2 - 3 });
    } else if (layout === "tube") {
      // Tube (smuggler's run, lava tube): ONE winding passage with bulges along
      // it and a chamber at the far end. A random walk with momentum, so it
      // wanders without doubling back into a knot.
      let px = Math.floor(width / 2) + Math.floor(rng() * 9) - 4;
      let py = height - MARGIN - 4;
      let dir = 8;
      const steps = 150 + Math.floor(rng() * 90);
      const bulges = [];
      for (let i = 0; i < steps; i++) {
        const w2 = 2 + Math.floor(rng() * 3);
        for (let dy = 0; dy < w2; dy++)
          for (let dx = 0; dx < w2; dx++) {
            const gx = clampTo(px + dx, MARGIN, width - MARGIN - 1);
            const gy = clampTo(py + dy, MARGIN, height - MARGIN - 1);
            carved[gy][gx] = true;
          }
        if (rng() < 0.08) bulges.push({ x: px, y: py });
        // Keep going the way we were most of the time; turn now and then.
        if (rng() < 0.28) dir = [2, 4, 6, 8][Math.floor(rng() * 4)];
        // The step must be shorter than the passage is wide, or successive
        // stamps leave a gap and the "one tunnel" comes out as a dotted line.
        const run = 1 + Math.floor(rng() * 2);
        if (dir === 8) py -= run; else if (dir === 2) py += run;
        else if (dir === 4) px -= run; else px += run;
        // Bounce off the margins rather than clamping into a corner.
        if (px < MARGIN + 2) { px = MARGIN + 2; dir = 6; }
        if (px > width - MARGIN - 4) { px = width - MARGIN - 4; dir = 4; }
        if (py < MARGIN + 2) { py = MARGIN + 2; dir = 2; }
        if (py > height - MARGIN - 4) { py = height - MARGIN - 4; dir = 8; }
      }
      for (const b of bulges.slice(0, 8)) {
        const bw = 5 + Math.floor(rng() * 5), bh = 4 + Math.floor(rng() * 4);
        addRoom(b.x - (bw >> 1), b.y - (bh >> 1), bw, bh);
      }
      const ew = 12 + Math.floor(rng() * 8), eh = 9 + Math.floor(rng() * 6);
      const end = addRoom(px - (ew >> 1), py - (eh >> 1), ew, eh);
      connectToPlan(end.x + (ew >> 1), end.y + (eh >> 1), 2);
    } else if (layout === "chambers") {
      // Chambers (crystal cavern): Voronoi pockets joined by the tunnels the
      // algorithm draws between their seeds.
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const FLOOR = 1, CEIL = 2;
      const sub = Utils2.generateCaveWithVoronoi(innerW, innerH, innerW, seed ^ 0xC0FFEE, FLOOR, CEIL);
      for (let y = 0; y < innerH; y++)
        for (let x = 0; x < innerW; x++)
          if (sub[y * innerW + x] === FLOOR) carved[MARGIN + y][MARGIN + x] = true;
      if (keepLargestPocket() < 200) {
        addRoom(Math.floor(width / 2) - 10, Math.floor(height / 2) - 7, 20, 14);
      }
      // The pockets are not rectangles, so publish a coarse room grid over the
      // carve for the prefab / chest / ornament passes to aim at.
      for (let gy = MARGIN + 4; gy < height - MARGIN - 8; gy += 12) {
        for (let gx = MARGIN + 4; gx < width - MARGIN - 8; gx += 12) {
          let n = 0;
          for (let y = gy; y < gy + 8; y++) for (let x = gx; x < gx + 8; x++) if (carved[y][x]) n++;
          if (n > 40) rooms.push({ x: gx, y: gy, width: 8, height: 8 });
        }
      }
    } else if (layout === "platform") {
      // Platform (metro station): one long concourse with a raised island
      // platform down the middle and running tunnels leaving both ends.
      const hh = 15 + Math.floor(rng() * 7);
      const hy = clampTo(Math.floor(height / 2) - (hh >> 1) + Math.floor(rng() * 7) - 3,
        MARGIN + 3, height - MARGIN - hh - 6);
      const hx = MARGIN + 4, hw = width - MARGIN * 2 - 8;
      carveRect(hx, hy, hw, hh);
      rooms.push({ x: hx, y: hy, width: hw, height: hh });
      // Two running tunnels leaving the ends, and the stairs down from the
      // south border meeting the concourse.
      const ty = hy + (hh >> 1);
      carveH(MARGIN, hx, ty, 3);
      carveH(hx + hw - 1, width - MARGIN - 1, ty, 3);
      const cx = hx + (hw >> 1);
      carveV(hy + hh - 1, height - MARGIN - 2, cx, 3);
      rooms.push({ x: cx - 1, y: hy + hh, width: 3, height: height - MARGIN - hy - hh - 2 });
    } else if (layout === "mound") {
      // Mound (barrow): a central burial hall with a ring of chambers around
      // it, each on its own short spoke. Symmetric on purpose - it was built,
      // not dug out.
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2) + 3;
      const hw = 13 + Math.floor(rng() * 7), hh = 9 + Math.floor(rng() * 5);
      const hall = addRoom(cx - (hw >> 1), cy - (hh >> 1), hw, hh);
      const nCh = 5 + Math.floor(rng() * 4);
      const radius = Math.min(cx - MARGIN - 10, cy - MARGIN - 10, height - MARGIN - cy - 10);
      for (let i = 0; i < nCh; i++) {
        const ang = (Math.PI * 2 * i) / nCh + rng() * 0.4;
        const rr = radius - 2 + Math.floor(rng() * 4);
        const chw = 6 + Math.floor(rng() * 5), chh = 5 + Math.floor(rng() * 4);
        const chx = Math.round(cx + Math.cos(ang) * rr) - (chw >> 1);
        const chy = Math.round(cy + Math.sin(ang) * rr) - (chh >> 1);
        const r = addRoom(chx, chy, chw, chh);
        const rcx = r.x + (chw >> 1), rcy = r.y + (chh >> 1);
        carveH(rcx, cx, rcy, 2);
        carveV(rcy, cy, cx, 2);
      }
      hall.width = hw; // (kept for readability: the hall is the boss room hint)
    } else if (layout === "grid") {
      // Grid (forge, bunker, buried lab): orthogonal service corridors with
      // sealed rooms hung off them. Built by people with a ruler.
      const cols = 3 + Math.floor(rng() * 2);
      const rowsN = 3 + Math.floor(rng() * 2);
      const cw = Math.floor((width - MARGIN * 2 - 6) / cols);
      const ch = Math.floor((height - MARGIN * 2 - 6) / rowsN);
      const corr = 2 + Math.floor(rng() * 2);
      const xs = [], ys = [];
      for (let i = 0; i <= cols; i++) xs.push(MARGIN + 3 + i * cw);
      for (let i = 0; i <= rowsN; i++) ys.push(MARGIN + 3 + i * ch);
      for (const y of ys) carveH(xs[0], xs[xs.length - 1], clampTo(y, MARGIN, height - MARGIN - corr), corr);
      for (const x of xs) carveV(ys[0], ys[ys.length - 1], clampTo(x, MARGIN, width - MARGIN - corr), corr);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rowsN; j++) {
          if (rng() < 0.15) continue;   // a sealed cell nobody ever opened
          const inset = 2;
          const rx = xs[i] + corr + inset - 1;
          const ry = ys[j] + corr + inset - 1;
          const rw = cw - corr - inset * 2, rh = ch - corr - inset * 2;
          if (rw < 4 || rh < 4) continue;
          const r = addRoom(rx, ry, rw, rh);
          // One doorway per room onto the corridor that runs past it.
          const dx = r.x + Math.floor(rng() * rw);
          carveV(r.y - 1, ys[j] + corr - 1, clampTo(dx, MARGIN, width - MARGIN - 1));
        }
      }
    } else {
      // Dungeon: BSP irregular rooms + winding corridors, chamfered corners and
      // variable corridor width. The room band is rolled per dungeon (some are
      // warrens of closets, some are halls), then one to three leaves are
      // knocked together into a great hall and the deepest room is opened out
      // into a chamber worth walking to, so a dungeon is not a grid of rooms
      // that are all the same size.
      const minRoom = 4 + Math.floor(rng() * 3);          // 4-6
      const maxRoom = 13 + Math.floor(rng() * 10);        // 13-22
      const bsp = Utils2.generateDungeonBSP(width, height, seed, minRoom, maxRoom);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (bsp.carved[y][x]) carved[y][x] = true;
      if (bsp.rooms) rooms.push(...bsp.rooms);
      if (bsp.narrowCorridors) dungeonNarrowCorridors.push(...bsp.narrowCorridors);

      if (rooms.length > 4) {
        const nHalls = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < nHalls; i++) {
          const a = rooms[Math.floor(rng() * rooms.length)];
          // The nearest other room, knocked through into one hall.
          let b = null, bestD = Infinity;
          for (const r of rooms) {
            if (r === a) continue;
            const d = Math.abs(r.x - a.x) + Math.abs(r.y - a.y);
            if (d < bestD) { bestD = d; b = r; }
          }
          if (!b || bestD > 26) continue;
          const nx = Math.min(a.x, b.x), ny = Math.min(a.y, b.y);
          const nw = Math.max(a.x + a.width, b.x + b.width) - nx;
          const nh = Math.max(a.y + a.height, b.y + b.height) - ny;
          if (nw > 34 || nh > 26) continue;
          addRoom(nx, ny, nw, nh);
        }
      }
    }

    // Solid border margin so the ONLY way off-map is the carved entrance.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (x < MARGIN || x >= width - MARGIN || y < MARGIN || y >= height - MARGIN) carved[y][x] = false;

    // The margin clip can erase a room outright (a BSP leaf that fell against
    // the border), and a phantom rectangle is worse than no rectangle: the
    // chest, prefab and ornament passes all aim at rooms, and one aimed at a
    // room that is not there any more silently places nothing.
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      r.x = clampTo(r.x, MARGIN, width - MARGIN - 1);
      r.y = clampTo(r.y, MARGIN, height - MARGIN - 1);
      r.width = Math.min(r.width, width - MARGIN - r.x);
      r.height = Math.min(r.height, height - MARGIN - r.y);
      let any = false;
      for (let y = r.y; y < r.y + r.height && !any; y++)
        for (let x = r.x; x < r.x + r.width && !any; x++)
          if (carved[y][x]) any = true;
      if (!any || r.width < 2 || r.height < 2) rooms.splice(i, 1);
    }

    // An organic carve publishes no rectangles of its own, and everything that
    // dresses a structure works room by room: without one, a cave den got no
    // patterned floor and none of its ornaments. Give it the bounding box of
    // what was carved - painting and stamping are both clipped to real floor,
    // so a box that overlaps rock is harmless.
    if (!rooms.length) {
      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (carved[y][x]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      if (maxX >= minX) rooms.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }

    // --- 2. Entrance: carve a corridor from a room down to the south border --
    let target = null, best = Infinity;
    const tcx = Math.floor(width / 2);
    for (let y = MARGIN; y < height - MARGIN; y++) {
      for (let x = MARGIN; x < width - MARGIN; x++) {
        if (!carved[y][x]) continue;
        // Prefer the carved tile nearest the south border, near the centre column.
        const dist = (height - 1 - y) * 2 + Math.abs(x - tcx);
        if (dist < best) { best = dist; target = { x, y }; }
      }
    }
    if (!target) {
      const rx = tcx - 3, ry = Math.floor(height / 2) - 3;
      carveRect(rx, ry, 6, 6); rooms.push({ x: rx, y: ry, width: 6, height: 6 });
      target = { x: tcx, y: ry };
    }
    const bx = Math.max(MARGIN, Math.min(width - MARGIN - 1, target.x));
    let spawnX, spawnY, spawnDir, entranceX, entranceY;
    if (sealEntrance) {
      // No corridor punched through the border margin at all: it stays solid
      // on every side, same as the rest of the wall ring, and the only "way
      // in" is the room the BFS below starts flooding from. entranceX/Y are
      // read as "how far from the door should a chest be", not as a real
      // door, so they point at that same room rather than at nothing.
      carveH(bx, target.x, target.y);   // still step across to the room if offset
      spawnX = target.x; spawnY = target.y; spawnDir = 2;
      entranceX = target.x; entranceY = target.y;
    } else {
      carveV(target.y, height - 1, bx);   // punch through the bottom margin into the room
      carveH(bx, target.x, target.y);     // step across to the room if offset
      spawnX = bx; spawnY = height - 2; spawnDir = 8;
      entranceX = bx; entranceY = height - 1;
    }

    // The way in is sacred. A prop stamped on the entrance corridor - and the
    // ornament pass is allowed to stand things against walls, which is exactly
    // what a 1-wide corridor is made of - walls the party in at the door, and
    // the tile they arrive on is the one tile in the structure they cannot
    // walk around. Nothing may be placed on it or on the passage behind it.
    const protectedTiles = new Set();
    for (let y = Math.min(target.y, spawnY) - 1; y <= height - 1; y++) {
      if (y < 0) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const px = bx + dx;
        if (px >= 0 && px < width) protectedTiles.add(px + y * width);
      }
    }
    for (let x = Math.min(bx, target.x); x <= Math.max(bx, target.x); x++)
      protectedTiles.add(x + target.y * width);

    // --- 2b. Every carved tile must be reachable from the entrance ----------
    // A chamber placed with a free hand, a cave carve that came out in two
    // halves, a doorway punched at the wrong end: any of them leaves floor the
    // party can see on the minimap and never stand on, and a chest dealt into
    // one is gone for good. Flood from the entrance and cut a passage to
    // whatever the flood did not reach, until it reaches everything.
    const floodFrom = (sx, sy, open) => {
      const seen = new Uint8Array(width * height);
      if (!open(sx, sy)) return seen;
      const stack = [sx + sy * width];
      seen[sx + sy * width] = 1;
      while (stack.length) {
        const k = stack.pop();
        const x = k % width, y = (k / width) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nk = nx + ny * width;
          if (seen[nk] || !open(nx, ny)) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      return seen;
    };
    // One pocket is joined per turn, and a plan can hold a dozen of them (a
    // tunnel with eight bulges hung off it, a warren of alcoves), so the guard
    // has to be generous: stopping early is exactly the bug this pass exists
    // to prevent.
    for (let guard = 0; guard < 40; guard++) {
      const seen = floodFrom(spawnX, spawnY, (x, y) => carved[y][x]);
      let orphan = null;
      for (let y = MARGIN; y < height - MARGIN && !orphan; y++)
        for (let x = MARGIN; x < width - MARGIN; x++)
          if (carved[y][x] && !seen[x + y * width]) { orphan = { x, y }; break; }
      if (!orphan) break;
      let near = null, nearD = Infinity;
      for (let y = MARGIN; y < height - MARGIN; y++)
        for (let x = MARGIN; x < width - MARGIN; x++) {
          if (!seen[x + y * width]) continue;
          const d = Math.abs(x - orphan.x) + Math.abs(y - orphan.y);
          if (d < nearD) { nearD = d; near = { x, y }; }
        }
      if (!near) break;
      carveH(orphan.x, near.x, orphan.y);
      carveV(orphan.y, near.y, near.x);
    }

    // --- 2c. Uniform rock depth above every floor tile ----------------------
    // Two faults come out of the same measurement. A wall face is drawn on the
    // rock standing north of a floor tile and is capped by one ceiling row, so
    // a band of rock thinner than WALL_HEIGHT + 1 either draws a SHORTER wall
    // than the band next to it (walls of two different heights in one room) or,
    // when the band is a single row, draws no wall at all and leaves a ceiling
    // tile sitting straight on the floor with nothing under its south edge.
    // Normalise the geometry first so the renderer never has to choose: every
    // rock column standing north of floor is made at least ROCK_DEPTH deep.
    // A thin divider between two carved spaces is opened (connectivity only
    // ever grows, so this cannot orphan anything); a band the map edge itself
    // caps has nowhere to grow, so the floor is pushed one row down instead.
    // Opening a column can expose a new floor edge above it, hence the passes.
    const WALL_HEIGHT = 3;
    const ROCK_DEPTH = WALL_HEIGHT + 1;
    for (let pass = 0; pass < 24; pass++) {
      let changed = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || (y > 0 && carved[y - 1][x])) continue;
          let depth = 0;
          while (y - 1 - depth >= 0 && !carved[y - 1 - depth][x]) depth++;
          if (depth >= ROCK_DEPTH) continue;
          if (y - 1 - depth < 0) {
            carved[y][x] = false;
          } else {
            for (let k = 1; k <= depth; k++) carved[y - k][x] = true;
          }
          changed = true;
        }
      }
      // A corner has to be worth the name. Where the north edge of the carved
      // space jogs by one or two rows between neighbouring columns, the taller
      // column's face stands beside the shorter one's CEILING CAP, so the cap
      // cuts into the face half way up and the corner tiles cover only part of
      // the wall's height. A step shorter than the face is not a corner, it is
      // a nick: level it by pulling the lower edge up to its neighbour, so
      // every corner is at least a full wall tall and the face runs its whole
      // height into it. Steps of WALL_HEIGHT or more are left as they are -
      // those are real terraces, and each one carries its own full face.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || (y > 0 && carved[y - 1][x])) continue;
          for (const dx of [-1, 1]) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            // The neighbouring column's own north edge, searched only as far
            // up as a nick could reach.
            for (let k = 1; k < WALL_HEIGHT; k++) {
              const ny = y - k;
              if (ny < 1 || !carved[ny][nx] || carved[ny - 1][nx]) continue;
              for (let j = 1; j <= k; j++) carved[y - j][x] = true;
              changed = true;
              break;
            }
          }
        }
      }
      // Opening one column at a time is what leaves a one-tile fin of rock
      // standing between two carved spaces: the columns beside it were deep
      // enough to keep, so the mass comes out as a staircase and the autotile
      // has to corner around a strip a single tile wide, which is the ugliest
      // shape the blend can draw. A fin that thin is never read as structure,
      // so it goes: rock with carved floor on BOTH flanks is opened too, and
      // the depth check above runs again over whatever that exposes.
      for (let y = 0; y < height; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (carved[y][x] || !carved[y][x - 1] || !carved[y][x + 1]) continue;
          carved[y][x] = true;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // --- 3. Render layer 0: floor / rock rim / empty space ------------------
    // The dead mass between the rooms is NOT paved wall to wall with the
    // Ceiling tile: repeating one rubble tile over five sixths of the map is
    // pure noise and buries the plan in it. Only a rim of ROCK_RIM tiles around
    // the carved space keeps the Ceiling, which is exactly what the 3-tall
    // north faces of step 4 and the wall-mounted fixtures of step 6 ever draw
    // on; everything deeper is left as an empty tile, so the interior reads as
    // rooms and corridors on an unlit void. The rim only needs that depth to
    // the NORTH, where it backs the tall wall face and holds its fixtures:
    // south, east and west draw no wall at all any more, so a wider band there
    // was nothing but a visible decorative border. Those three sides get just
    // enough rim to back the passable Ceiling tile, and fall to void (black)
    // immediately beyond it.
    const ROCK_RIM = 2;
    const ROCK_RIM_SIDE = 1;
    const nearFloor = Array.from({ length: height }, () => new Array(width).fill(false));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!carved[y][x]) continue;
        for (let dy = -ROCK_RIM; dy <= ROCK_RIM_SIDE; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const rim = dy < 0 ? ROCK_RIM : ROCK_RIM_SIDE;
          for (let dx = -rim; dx <= rim; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < width) nearFloor[ny][nx] = true;
          }
        }
      }
    }
    const isFloor = (x, y) => x >= 0 && x < width && y >= 0 && y < height && carved[y][x];
    const mapData = new Array(width * height * 4).fill(0);
    const rand = (arr) => arr[Math.floor(rng() * arr.length)];
    // ceilingMask marks every cell actually painted with the rim tile, real A4
    // blend or the old flat tile alike, so later passes (lavaFlow) can ask
    // "is this rock" without caring which of the two rendered it.
    const ceilingMask = Array.from({ length: height }, () => new Array(width).fill(false));

    if (wallA4) {
      // Real A4 blob walls: a tall (3-tile) impassable face on the north edge
      // only, matching the look every structure already shares - south, east
      // and west stay open onto the ledge/ceiling kind instead of a second
      // wall line, so a narrow corridor never reads as walled on both flanks.
      // Both kinds are blended against their own kind's cardinal neighbours,
      // exactly the way the map editor bakes a hand-painted autotile; the
      // ceiling kind is flagged impassable on every shape in the Dungeon
      // tileset (data/Tilesets.json) precisely so it is safe to leave open -
      // it reads as ambient rock but is never a second, walkable path.
      const wallCells = Array.from({ length: height }, () => new Array(width).fill(false));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || isFloor(x, y - 1)) continue;
          // How much solid rock actually stands above this floor tile.
          let depth = 0;
          while (y - 1 - depth >= 0 && !carved[y - 1 - depth][x]) depth++;
          // The topmost rock row is ALWAYS left to the ceiling, so a wall face
          // is never drawn with open space (or another room's floor) directly
          // above it - a wall with no ceiling capping it reads as a floating
          // slab. A 1-tile-thin divider between two rooms therefore carries no
          // wall at all and is drawn purely as ceiling.
          // Step 2c guarantees depth >= WALL_HEIGHT + 1, so the face is always
          // the full height and always keeps its ceiling cap.
          const wallH = Math.min(WALL_HEIGHT, depth - 1);
          for (let k = 1; k <= wallH; k++) wallCells[y - k][x] = true;
        }
      }
      const isWallCell = (x, y) => x >= 0 && x < width && y >= 0 && y < height && wallCells[y][x];
      // The ceiling is the SOLID FILL of the whole dead mass, not a rim around
      // it. A blob autotile only reads as rock when it is a filled region: the
      // interior renders as flat fill and only the boundary against the floor
      // draws an edge. Laid as a 1-tile ring instead, every single tile draws
      // its own rounded outline on BOTH sides and the mass comes out as
      // scattered pebbles floating in the void, which is what the thin rim did.
      // (The old flat A5 rim tile had to be kept thin - repeating one detailed
      // rubble tile over the whole map was pure noise - but that limitation is
      // exactly what the real autotile removes.)
      const isCeil = (x, y) =>
        x >= 0 && x < width && y >= 0 && y < height && !carved[y][x] && !wallCells[y][x];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (carved[y][x]) {
            mapData[calculateIndex(x, y, 0, width, height)] = rand(floorTiles);
          } else if (wallCells[y][x]) {
            mapData[calculateIndex(x, y, 0, width, height)] = wallAutotileId(
              wallA4.side, isWallCell(x - 1, y), isWallCell(x + 1, y), isWallCell(x, y - 1), isWallCell(x, y + 1));
          } else {
            ceilingMask[y][x] = true;
            mapData[calculateIndex(x, y, 0, width, height)] =
              ceilingAutotileId(wallA4.top, isCeil(x - 1, y), isCeil(x + 1, y), isCeil(x, y - 1), isCeil(x, y + 1));
          }
        }
      }
    } else {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const ceiling = !carved[y][x] && nearFloor[y][x];
          if (ceiling) ceilingMask[y][x] = true;
          mapData[calculateIndex(x, y, 0, width, height)] = carved[y][x] ? rand(floorTiles) : (ceiling ? ceilingTile : 0);
        }
      }

      // --- 4. Walls: north faces only ----------------------------------------
      // Only the north edge of the carved space is ever walled: south, east
      // and west stay open onto the Ceiling rim (and the void beyond it).
      // `wall.mid` is the 1-tile ring tile stamped directly above a floor
      // tile's north edge before the second pass below lays a full 3-tall
      // north face over it.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (carved[y][x]) continue;
          if (isFloor(x, y + 1)) {
            mapData[calculateIndex(x, y, 0, width, height)] = wall.mid;
          }
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || isFloor(x, y - 1)) continue;
          const face = [[1, wall.bot], [2, wall.mid], [3, wall.top]];
          for (const [k, tile] of face) {
            const wy = y - k;
            if (wy < 0 || carved[wy][x]) break;
            mapData[calculateIndex(x, wy, 0, width, height)] = tile;
          }
        }
      }
    }

    // --- 3b. Room floors: one accent and one pattern per room ---------------
    // Corridors keep the structure's main texture, which is what holds the
    // place together; a room lays its own accent over it in one of the
    // patterns the structure allows. Only carved tiles are painted, so a
    // pattern can never spill onto the rock or through a wall.
    const setFloorTile = (x, y, tile) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      if (!carved[y][x] || !tile) return;
      mapData[calculateIndex(x, y, 0, width, height)] = tile;
    };
    for (const r of rooms) {
      if (r.width < 3 || r.height < 3) continue;
      let kind = pal.patterns[Math.floor(rng() * pal.patterns.length)];
      // A pattern is a ROOM's dressing. Laid over a hall that fills the map
      // (a cistern, a cavern's bounding box) it stops being a pattern and
      // becomes the floor, and the structure loses its main texture, so a big
      // space only ever gets an edging.
      if (r.width * r.height > 700 && kind !== "border") kind = rng() < 0.5 ? "border" : "none";
      if (kind === "none") continue;
      const accent = pal.accents[Math.floor(rng() * pal.accents.length)];
      paintPattern(setFloorTile, r, pal.main, accent, kind, rng);
    }

    // --- 5. Region data + the ornaments that change what the ground IS -------
    // Water and lava are not props: they replace the floor, so they are laid
    // here rather than in the decoration pass. Both follow the same rule the
    // sewer's canals always did - a flooded tile must have floor above AND
    // below it, so a channel can never cut the plan in two.
    const regiondata = new Array(width * height).fill(0);
    // bandWidth floods `cy` and the (bandWidth - 1) rows south of it as one
    // solid channel - the sewer's 2-4 tile wide water - always requiring dry
    // floor immediately above and below the whole band, so a channel can
    // never cut the plan in two.
    const floodRow = (cy, bandWidth = 1) => {
      for (let x = MARGIN; x < width - MARGIN; x++) {
        if (!isFloor(x, cy - 1) || !isFloor(x, cy + bandWidth)) continue;
        let clear = true;
        for (let dy = 0; dy < bandWidth; dy++) {
          if (!isFloor(x, cy + dy)) { clear = false; break; }
        }
        if (!clear) continue;
        for (let dy = 0; dy < bandWidth; dy++) {
          mapData[calculateIndex(x, cy + dy, 0, width, height)] = waterTile;
          regiondata[(cy + dy) * width + x] = 99;
        }
      }
    };
    if (waterTile && hasOrnament("waterLanes")) {
      if (canalRows.length) {
        for (const cy of canalRows) floodRow(cy, sewerWaterWidth);
      } else {
        // A cistern has no canal rows of its own: flood every third bay so the
        // hall reads as standing water walked around on the dry lanes.
        const pitch = 6 + Math.floor(rng() * 3);
        for (let cy = MARGIN + 5; cy < height - MARGIN - 4; cy += pitch) floodRow(cy);
      }
    }
    if (waterTile && hasOrnament("tidePool")) {
      // The deepest pocket of a grotto stands under water. Centred on the
      // carved tile farthest from the entrance so the party wades in rather
      // than starting wet.
      let px = -1, py = -1, far = -1;
      for (let y = MARGIN; y < height - MARGIN; y++)
        for (let x = MARGIN; x < width - MARGIN; x++) {
          if (!carved[y][x]) continue;
          const d = (height - y) + Math.abs(x - Math.floor(width / 2)) * 0.3;
          if (d > far) { far = d; px = x; py = y; }
        }
      if (px >= 0) {
        const r = 5 + Math.floor(rng() * 6);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const gx = px + dx, gy = py + dy;
            if (!isFloor(gx, gy) || !isFloor(gx, gy - 1) || !isFloor(gx, gy + 1)) continue;
            if (!isFloor(gx - 1, gy) || !isFloor(gx + 1, gy)) continue;
            mapData[calculateIndex(gx, gy, 0, width, height)] = waterTile;
            regiondata[gy * width + gx] = 99;
          }
      }
    }
    if (pal.lava && hasOrnament("lavaFlow")) {
      // Molten rock runs through the mass the plan is cut into, never through
      // the plan itself: only rim tiles are painted, and the rim sits behind
      // the impassable wall ring, so it glows without ever being stood on.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (carved[y][x] || !ceilingMask[y][x]) continue;
          const idx = calculateIndex(x, y, 0, width, height);
          // A coarse vein pattern rather than a wash, so it reads as flowing.
          const vein = Math.sin(x * 0.21 + y * 0.13) + Math.sin(y * 0.31 - x * 0.07);
          if (vein > 1.1 && rng() < 0.75) mapData[idx] = pal.lava;
        }
      }
    }

    // --- 6. Decoration: biome terrain features (layer 1) --------------------
    // Two placement styles, both pathing-safe:
    //   * Floor props (skulls, bones, graves, debris, ...) drop only onto tiles
    //     that are floor on all four sides, so an impassable prop can never seal
    //     a 1-wide corridor or the entrance.
    //   * Wall-mounted fixtures (torches, chains, drains, grates, ...) are hung
    //     on the impassable north wall faces that front a room, so they cannot
    //     affect pathing at all. Sewers always drip Drain fixtures here.
    // Grid (multi-tile) feature variants are supported too, so props like the
    // 2x2 Drain and the 2-tall Torch - which have no single-tile variant - are
    // actually placed instead of being silently skipped.
    // Ground and wall features are what the place is BUILT of, so they are
    // never dealt out as props on top of it. The list covers every feature any
    // structure's palette may pave with, not just the three the dungeon used
    // to know: a Salt or Parquet listed as a biome feature would otherwise be
    // scattered over the floor it already is.
    const structural = new Set([
      "DungeonFloor", "DungeonWall", "Ceiling", "Water", "CaveFloor", "CaveWall", "MountainWall",
      "Dirt", "Pavement", "Salt", "Parquet", "TechnoFloor", "Metal", "WoodenFloor",
      "Grass", "Sand", "Techno", "Carpet", "Lava", "Soil", "Path", "Mud", "StoneBlock",
    ]);
    const WALL_MOUNTED = new Set(["Torch", "Chain", "Drain", "Grate", "Banner", "Cobweb", "Sconce", "Lamp", "Pipe"]);

    const floorDecorPool = [];   // { variants, weight }
    const wallDecorPool = [];
    for (const f of biome.features || []) {
      const nm = typeof f === "string" ? f : f.name;
      if (structural.has(nm)) continue;
      const arr = allFeatures[nm];
      if (!Array.isArray(arr) || !arr.length) continue;
      const weight = (typeof f === "object" && Number(f.density) > 0) ? Number(f.density) : 1;
      (WALL_MOUNTED.has(nm) ? wallDecorPool : floorDecorPool).push({ variants: arr, weight });
    }
    // Sewers always sport wall Drains even when the biome definition omits them.
    if (isSewer) {
      const drainVariants = (allFeatures["Drain"] || []).filter((v) => v.tileId || (v.grid && v.grid.length));
      if (drainVariants.length && !wallDecorPool.some((p) => p.variants === allFeatures["Drain"])) {
        wallDecorPool.push({ variants: drainVariants, weight: 1.5 });
      }
    }

    const variantSize = (v) =>
      v.type === "grid"
        ? { w: Math.max(...v.grid.map((r) => r.length)), h: v.grid.length }
        : { w: 1, h: 1 };
    const pickWeighted = (pool) => {
      let total = 0;
      for (const p of pool) total += p.weight;
      let r = rng() * total;
      for (const p of pool) { r -= p.weight; if (r <= 0) return p; }
      return pool[pool.length - 1];
    };
    // Stamp a variant onto layer 2 with its top-left at (ox, oy). Callers below
    // validate the footprint first, so this only writes. Layer 2 (not 1) so the
    // decorations are seen by ProceduralTerrainInteractions' action-button scan
    // (it reads layers 3/2 only): dungeon skulls, cellar gold/wine, den bones
    // and wall torches are all interactable/harvestable.
    const stampFeature = (v, ox, oy) => {
      if (v.type === "single") {
        mapData[calculateIndex(ox, oy, 2, width, height)] = v.tileId;
        return;
      }
      for (let r = 0; r < v.grid.length; r++)
        for (let c = 0; c < v.grid[r].length; c++)
          if (v.grid[r][c] > 0)
            mapData[calculateIndex(ox + c, oy + r, 2, width, height)] = v.grid[r][c];
    };

    // Floor footprint must be all interior floor, dry, and layer-2 empty.
    const floorFits = (v, ox, oy) => {
      const { w, h } = variantSize(v);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = ox + c, gy = oy + r;
          if (gx < 0 || gy < 0 || gx >= width || gy >= height) return false;
          if (protectedTiles.has(gx + gy * width)) return false;
          if (!(isFloor(gx, gy) && isFloor(gx - 1, gy) && isFloor(gx + 1, gy) &&
                isFloor(gx, gy - 1) && isFloor(gx, gy + 1))) return false;
          if (mapData[calculateIndex(gx, gy, 0, width, height)] === waterTile) return false;
          if (mapData[calculateIndex(gx, gy, 2, width, height)] !== 0) return false;
        }
      return true;
    };
    // Wall footprint rests its bottom row on the wall face fronting a room and
    // climbs upward; every cell must be an unoccupied wall tile.
    const wallFits = (v, wx, wy) => {
      const { w, h } = variantSize(v);
      const top = wy - (h - 1);
      if (top < 0) return false;
      for (let c = 0; c < w; c++) {
        const bx = wx + c;
        if (bx < 0 || bx >= width) return false;
        if (carved[wy][bx] || !isFloor(bx, wy + 1)) return false; // must front floor
      }
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = wx + c, gy = top + r;
          if (gx < 0 || gx >= width || gy < 0 || gy >= height) return false;
          if (carved[gy][gx]) return false;
          // Must hang on drawn rock, never over the empty space past the rim.
          if (mapData[calculateIndex(gx, gy, 0, width, height)] === 0) return false;
          if (mapData[calculateIndex(gx, gy, 2, width, height)] !== 0) return false;
        }
      return true;
    };

    // --- 6b. Ornaments: deliberate dressing ---------------------------------
    // Laid BEFORE the random scatter, so the pit props, the graves in the wall
    // niches, the shelf rows and the sigil at the centre get the tiles they
    // want and the scatter fills in around them. Placement is loose here (a
    // thing standing against a wall could not exist under the scatter's
    // all-four-neighbours-are-floor rule); the unseal pass below is what
    // guarantees nothing any of this puts down can cut the plan in two.
    const looseFits = (v, ox, oy) => {
      const { w, h } = variantSize(v);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = ox + c, gy = oy + r;
          if (!isFloor(gx, gy)) return false;
          if (protectedTiles.has(gx + gy * width)) return false;
          if (mapData[calculateIndex(gx, gy, 0, width, height)] === waterTile) return false;
          if (mapData[calculateIndex(gx, gy, 2, width, height)] !== 0) return false;
        }
      return true;
    };
    const tryStamp = (v, x, y) => { if (looseFits(v, x, y)) { stampFeature(v, x, y); return true; } return false; };

    const runOrnament = (spec) => {
      const variants = [];
      for (const nm of spec.features || [])
        for (const v of allFeatures[nm] || []) if (v.tileId || (v.grid && v.grid.length)) variants.push(v);
      if (!variants.length) return;
      const pick = () => variants[Math.floor(rng() * variants.length)];
      const rate = spec.rate == null ? 0.1 : spec.rate;
      switch (spec.rule) {
        case "edge":
          // Against the rock: the tile is floor and at least one neighbour is not.
          for (let y = MARGIN; y < height - MARGIN; y++)
            for (let x = MARGIN; x < width - MARGIN; x++) {
              if (!carved[y][x] || rng() >= rate) continue;
              if (isFloor(x - 1, y) && isFloor(x + 1, y) && isFloor(x, y - 1) && isFloor(x, y + 1)) continue;
              tryStamp(pick(), x, y);
            }
          break;
        case "corners":
          for (const r of rooms) {
            if (r.width < 4 || r.height < 4) continue;
            for (const [cx, cy] of [[r.x + 1, r.y + 1], [r.x + r.width - 2, r.y + 1],
                                    [r.x + 1, r.y + r.height - 2], [r.x + r.width - 2, r.y + r.height - 2]]) {
              if (rng() < rate) tryStamp(pick(), cx, cy);
            }
          }
          break;
        case "axis":
          for (const r of rooms) {
            const horizontal = r.width >= r.height;
            const mid = horizontal ? r.y + (r.height >> 1) : r.x + (r.width >> 1);
            const from = horizontal ? r.x : r.y;
            const to = horizontal ? r.x + r.width : r.y + r.height;
            for (let k = from; k < to; k++) {
              if (rng() >= rate) continue;
              if (horizontal) tryStamp(pick(), k, mid); else tryStamp(pick(), mid, k);
            }
          }
          break;
        case "centre": {
          // The middle of the biggest room, once: this is the sigil.
          let big = null, bestA = 0;
          for (const r of rooms) {
            const a = r.width * r.height;
            if (a > bestA) { bestA = a; big = r; }
          }
          if (!big) break;
          const v = pick();
          const sz = variantSize(v);
          tryStamp(v, big.x + (big.width >> 1) - (sz.w >> 1), big.y + (big.height >> 1) - (sz.h >> 1));
          break;
        }
        case "rows":
          // Stacks, colonnades, pit props: rows along the room's long axis,
          // spaced across the short one, always two tiles clear at each end so
          // there is an aisle round them.
          for (const r of rooms) {
            if (r.width < 7 || r.height < 7 || rng() > rate) continue;
            const pitch = spec.pitch || 4;
            const horizontal = r.width >= r.height;
            if (horizontal) {
              for (let y = r.y + 2; y < r.y + r.height - 2; y += pitch)
                for (let x = r.x + 2; x < r.x + r.width - 2; x++) tryStamp(pick(), x, y);
            } else {
              for (let x = r.x + 2; x < r.x + r.width - 2; x += pitch)
                for (let y = r.y + 2; y < r.y + r.height - 2; y++) tryStamp(pick(), x, y);
            }
          }
          break;
        case "scatter":
          for (const r of rooms)
            for (let y = r.y; y < r.y + r.height; y++)
              for (let x = r.x; x < r.x + r.width; x++)
                if (rng() < rate) tryStamp(pick(), x, y);
          break;
        case "wall":
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              if (carved[y][x] || !isFloor(x, y + 1) || rng() >= rate) continue;
              const v = pick();
              if (wallFits(v, x, y)) stampFeature(v, x, y - (variantSize(v).h - 1));
            }
          break;
        default: break;   // "special": laid with the ground, in step 5
      }
    };
    for (const nm of ornaments) {
      const spec = ORNAMENTS[nm];
      if (spec && spec.rule !== "special") runOrnament(spec);
    }

    if (floorDecorPool.length) {
      // How thickly a structure is littered is its own business (a patron's
      // vault is buried in valuables, a cave den in bones, a temple stays
      // stately), so the rate comes off the catalogue entry. The one exception
      // is the rare grand loot cellar, which is stocked like a dungeon.
      const floorRate = (isCellar && cellarGrand) ? 0.18 : (S.dressing && S.dressing.floor) || 0.05;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || rng() >= floorRate) continue;
          const feat = pickWeighted(floorDecorPool);
          const v = feat.variants[Math.floor(rng() * feat.variants.length)];
          if (floorFits(v, x, y)) stampFeature(v, x, y);
        }
      }
    }
    if (wallDecorPool.length) {
      const wallRate = (isCellar && cellarGrand) ? 0.12 : (S.dressing && S.dressing.wall) || 0.1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (carved[y][x] || !isFloor(x, y + 1) || rng() >= wallRate) continue;
          const feat = pickWeighted(wallDecorPool);
          const v = feat.variants[Math.floor(rng() * feat.variants.length)];
          if (wallFits(v, x, y)) stampFeature(v, x, y - (variantSize(v).h - 1));
        }
      }
    }

    // --- 7. Nothing put down may seal the plan ------------------------------
    // The ornaments are placed by rules about how a room LOOKS (rows of
    // shelves, props standing against the rock), not about what they block, so
    // the guarantee is made here instead: flood the map as the party would walk
    // it and take away whatever is standing between the entrance and the rest.
    // Water counts as open - region 99 is swum, not walked.
    const tilePassable = (t) => !t || isTilePassableInTileset(tilesetId, t);
    const walkable = (x, y) => {
      if (!carved[y][x]) return false;
      if (regiondata[y * width + x] === 99) return true;
      return tilePassable(mapData[calculateIndex(x, y, 0, width, height)]) &&
             tilePassable(mapData[calculateIndex(x, y, 2, width, height)]);
    };
    for (let pass = 0; pass < 5; pass++) {
      const seen = floodFrom(spawnX, spawnY, walkable);
      const stranded = [];
      // The whole map, not the margins only: the entrance corridor runs
      // through the border, and a flood that cannot even leave the doorway
      // must be able to report the doorway as the problem.
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (carved[y][x] && !seen[x + y * width]) stranded.push([x, y]);
      if (!stranded.length) break;
      // Clear the prop on every stranded tile AND on the tiles fronting them,
      // since the thing doing the blocking stands on the reachable side.
      for (const [x, y] of stranded) {
        mapData[calculateIndex(x, y, 2, width, height)] = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (carved[ny][nx]) mapData[calculateIndex(nx, ny, 2, width, height)] = 0;
        }
      }
    }

    mapData.regiondata = regiondata;
    // Room rectangles + entrance metadata for the (room-aware) prefab pass and the
    // caller that positions the player. Prefabs are applied later by the prefab
    // load-hook using mapData.rooms so they are fitted inside rooms.
    mapData.rooms = rooms.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    // A rare well-stocked loot cellar, so the chest pass can be as generous
    // with it as the dressing pass was.
    if (isCellar) mapData.cellarGrand = cellarGrand;
    mapData.spawnX = spawnX;
    mapData.spawnY = spawnY;
    mapData.spawnDir = spawnDir;
    mapData.entranceX = entranceX;
    mapData.entranceY = entranceY;

    // Door hints: the START of a 1-tile-wide corridor (BSP dungeon layout
    // only) - the tile where the passage leaves a room - still carved after
    // the border margin clip and far enough from the entrance, spaced apart so
    // up to 6 "Dungeon door" events never cluster. The mouth was recorded
    // while its own corridor was being carved, but a later corridor, an
    // orphan reconnection or a chamfered room corner can widen what was a
    // narrow passage by the time the whole plan is finished; a door only
    // blocks anything if the two tiles flanking it, perpendicular to the
    // corridor's own run, are still walls on the FINAL carve.
    const isDoorBottleneck = (c) => c.horizontal
      ? !isFloor(c.x, c.y - 1) && !isFloor(c.x, c.y + 1)
      : !isFloor(c.x - 1, c.y) && !isFloor(c.x + 1, c.y);
    if (dungeonNarrowCorridors.length) {
      const shuffled = dungeonNarrowCorridors
        .filter((c) => isFloor(c.x, c.y) && isDoorBottleneck(c) &&
          Math.abs(c.x - entranceX) + Math.abs(c.y - entranceY) > 6)
        .sort(() => rng() - 0.5);
      const doorHints = [];
      for (const c of shuffled) {
        if (doorHints.length >= 6) break;
        if (doorHints.some((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 5)) continue;
        doorHints.push(c);
      }
      mapData.doorHints = doorHints;
    }

    // Boss room hint: the room whose center sits farthest from the entrance,
    // so a dungeon's toughest fixed encounter can be placed deep inside.
    if (rooms.length) {
      let bestRoom = null, bestDist = -1;
      for (const r of rooms) {
        const cx = r.x + Math.floor(r.width / 2), cy = r.y + Math.floor(r.height / 2);
        const dist = Math.abs(cx - entranceX) + Math.abs(cy - entranceY);
        if (dist > bestDist) { bestDist = dist; bestRoom = { x: cx, y: cy }; }
      }
      mapData.bossRoomHint = bestRoom;
    }

    // The carve of the last structure generated, for the debugger and the
    // offline verification harness. Held here rather than on mapData because
    // mapData is what goes into the savegame.
    _lastCarved = carved;
    return mapData;
  }

  // ===== VILLAGE GENERATION =====


/**
   * Generate procedural village biome with prefabs placed near path features first.
   * Includes Lot proximity checks to prevent overlapping hints.
   */
  // ===== SETTLEMENT BLOCK LAYOUT =====

  /**
   * Plans a settlement as a grid of blocks before a single tile is laid, the
   * way a town map is drawn rather than the way a footpath wanders. Every cell
   * of the returned grid is one of four things:
   *
   *   "R" street        "H" a house lot        "B" part of a 2x2 building
   *   "O" open ground (a green, a yard, a square) - whatever is left over
   *
   * The rules the plan holds to, and which the tests assert:
   *  - the centre row and the centre column are street the whole way across,
   *    so the settlement always meets the roads arriving at its four borders
   *  - every other street crosses that central cross, so the network is one
   *    connected whole and never a stub
   *  - parallel streets stay minRoadGap blocks apart, so two streets never
   *    merge into a slab of tarmac and there is always a row of lots between
   *    them
   *  - every house lot touches a street, and every 2x2 building has at least
   *    one of its four blocks on a street
   *
   * Tile sizes are none of this function's business: it deals in blocks, and
   * the generator that calls it decides how many tiles a block is worth.
   */
  const MIN_ROAD_GAP = 2;

  // A village block is 9 tiles a side and a village is 7 blocks across, which
  // lands the middle block dead on the centre of a 64x64 map, where the border
  // roads arrive. A house lot is one block (7x7 of buildable ground), a 2x2
  // building lot is four (16x16).
  const VILLAGE_CELL = 9;
  const VILLAGE_GRID = 7;

  function planSettlementBlocks(cols, rows, rng, opts = {}) {
    const buildingChance = opts.buildingChance !== undefined ? opts.buildingChance : 0.45;
    const houseChance = opts.houseChance !== undefined ? opts.houseChance : 0.85;
    const extraRoads = opts.extraRoads !== undefined ? opts.extraRoads : 2;
    const minRoadGap = opts.minRoadGap !== undefined ? opts.minRoadGap : MIN_ROAD_GAP;

    const cells = new Array(cols * rows).fill("O");
    const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
    const at = (c, r) => (inside(c, r) ? cells[r * cols + c] : null);
    const set = (c, r, v) => { if (inside(c, r)) cells[r * cols + c] = v; };

    const roadCol = (cols - 1) >> 1;
    const roadRow = (rows - 1) >> 1;
    for (let r = 0; r < rows; r++) set(roadCol, r, "R");
    for (let c = 0; c < cols; c++) set(c, roadRow, "R");

    const usedCols = [roadCol];
    const usedRows = [roadRow];
    const pickLine = (used, n) => {
      const free = [];
      for (let i = 1; i < n - 1; i++) {
        if (used.every(u => Math.abs(u - i) >= minRoadGap)) free.push(i);
      }
      return free.length ? free[Math.floor(rng() * free.length)] : -1;
    };

    for (let i = 0; i < extraRoads; i++) {
      if (rng() < 0.5) {
        const c = pickLine(usedCols, cols);
        if (c < 0) continue;
        usedCols.push(c);
        const from = Math.floor(rng() * (roadRow + 1));
        const to = roadRow + Math.floor(rng() * (rows - roadRow));
        for (let r = from; r <= to; r++) set(c, r, "R");
      } else {
        const r = pickLine(usedRows, rows);
        if (r < 0) continue;
        usedRows.push(r);
        const from = Math.floor(rng() * (roadCol + 1));
        const to = roadCol + Math.floor(rng() * (cols - roadCol));
        for (let c = from; c <= to; c++) set(c, r, "R");
      }
    }

    const touchesRoad = (c, r) =>
      at(c - 1, r) === "R" || at(c + 1, r) === "R" ||
      at(c, r - 1) === "R" || at(c, r + 1) === "R";

    // The big lots first: a 2x2 of open blocks with a street on at least one
    // of its four sides becomes one building, so a village has something in it
    // bigger than a cottage.
    const corners = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) corners.push({ c, r });
    for (let i = corners.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = corners[i]; corners[i] = corners[j]; corners[j] = tmp;
    }
    const clusters = [];
    for (const { c, r } of corners) {
      if (rng() >= buildingChance) continue;
      const quad = [[c, r], [c + 1, r], [c, r + 1], [c + 1, r + 1]];
      if (!quad.every(([qc, qr]) => at(qc, qr) === "O")) continue;
      if (!quad.some(([qc, qr]) => touchesRoad(qc, qr))) continue;
      for (const [qc, qr] of quad) set(qc, qr, "B");
      clusters.push({ c, r });
    }

    // Then the houses, on whatever open block still fronts a street.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (at(c, r) !== "O") continue;
        if (!touchesRoad(c, r)) continue;
        if (rng() < houseChance) set(c, r, "H");
      }
    }

    return { cols, rows, cells, roadCol, roadRow, clusters, at };
  }

  /** The plan as the pitch draws it, one character a block. Debug aid. */
  function settlementLayoutToString(layout) {
    const lines = [];
    for (let r = 0; r < layout.rows; r++) {
      lines.push(layout.cells.slice(r * layout.cols, (r + 1) * layout.cols).join(""));
    }
    return lines.join("\n");
  }

  function generateVillageBiome(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    return runSteps(generateVillageBiomeSteps(biome, seed, allFeatures, adjacentBiomes, allOtherData));
  }

  function* generateVillageBiomeSteps(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const rng = createSeededRandom(seed);

    // 1. Initialize map with terrain
    const mapData = new Array(width * height * 4).fill(0);

    let baseTile = 0;
    if (biome && biome.features && biome.features.length > 0) {
      const terrainFeature = biome.features.find(f => f.terrain === true);
      if (terrainFeature && allFeatures[terrainFeature.name]) {
        const featureVariants = allFeatures[terrainFeature.name];
        for (const variant of featureVariants) {
          if (variant.type === "single") {
            baseTile = variant.tileId;
            break;
          }
        }
      }
    }

    for (let i = 0; i < width * height; i++) {
      mapData[i] = baseTile;
    }

    let pathFeatureName = "Path";
    if (biome.name === "VillageIce") pathFeatureName = "PathIce";
    else if (biome.name === "VillageDesert") pathFeatureName = "PathDesert";

    const pathTiles = getFeatureTiles(pathFeatureName, allFeatures);
    if (!pathTiles || pathTiles.length === 0) return mapData;
    const pathTile = pathTiles[0];

    const roadFeatureTiles = getFeatureTiles("Road", allFeatures);
    const cardinalRoadTile = roadFeatureTiles ? roadFeatureTiles[0] : pathTile;

    // A village street is a carriageway, not a track worn into the grass: it is
    // laid with the same Road tile the border connections and the city grid use,
    // and it carries the same painted centre line - the tileset's DashedLine, or
    // its orientation-aware variants where the tileset declares them. Path keeps
    // the job it always had, the footpath that links a lot to the street.
    const streetTile = cardinalRoadTile;
    const villageDashedLines = getDashedLinesForFeatures(allFeatures);
    const streetIsPaved = streetTile !== pathTile;

    // --- STEP 0: Draw cardinal border roads ---
    const borderDirs = getCityBorderRoadDirections(adjacentBiomes);
    const hasCardinalRoads = borderDirs.north || borderDirs.south || borderDirs.east || borderDirs.west;
    const borderRoadOccupied = new Array(width * height).fill(false);

    if (hasCardinalRoads) {
      const zebra = getZebraForFeatures(allFeatures);

      applyBorderRoadConnections(mapData, width, height, adjacentBiomes, cardinalRoadTile, villageDashedLines, zebra, rng);

      // ... (Border road marking logic kept identical to previous version) ...
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const borderRoadWidth = 7;
      const borderHalfRoad = Math.floor(borderRoadWidth / 2);
      if (borderDirs.north) { for (let y = 0; y <= centerY; y++) { for (let x = centerX - borderHalfRoad; x < centerX - borderHalfRoad + borderRoadWidth; x++) { if (x>=0 && x<width) borderRoadOccupied[y * width + x] = true; } } }
      if (borderDirs.south) { for (let y = centerY; y < height; y++) { for (let x = centerX - borderHalfRoad; x < centerX - borderHalfRoad + borderRoadWidth; x++) { if (x>=0 && x<width) borderRoadOccupied[y * width + x] = true; } } }
      if (borderDirs.east) { for (let x = centerX; x < width; x++) { for (let y = centerY - borderHalfRoad; y < centerY - borderHalfRoad + borderRoadWidth; y++) { if (y>=0 && y<height) borderRoadOccupied[y * width + x] = true; } } }
      if (borderDirs.west) { for (let x = 0; x <= centerX; x++) { for (let y = centerY - borderHalfRoad; y < centerY - borderHalfRoad + borderRoadWidth; y++) { if (y>=0 && y<height) borderRoadOccupied[y * width + x] = true; } } }
    }

    yield;


    // --- STEP 1: the block plan ---------------------------------------------
    // The village is planned as a grid of blocks (see planSettlementBlocks) and
    // only then drawn. The old generator scattered a handful of seeds and
    // wandered organic tracks between them, which is why a village came out as
    // two houses lost in a tangle of paths.
    const CELL = VILLAGE_CELL;
    const GRID = VILLAGE_GRID;
    // The grid is offset so the centre block's centre lands exactly on the
    // centre of the map, which is where the border roads arrive: a block out by
    // one tile leaves the main street and the road into town as two carriageways
    // an inch apart.
    const halfCell = Math.floor(CELL / 2);
    const midBlock = (GRID - 1) >> 1;
    const ox = Math.floor(width / 2) - (midBlock * CELL + halfCell);
    const oy = Math.floor(height / 2) - (midBlock * CELL + halfCell);
    const layout = planSettlementBlocks(GRID, GRID, rng, {
      buildingChance: 0.4,
      houseChance: 0.85,
      extraRoads: 2 + Math.floor(rng() * 2),
    });

    // The high street is as wide as the road arriving at that border, so the
    // two are one carriageway and not one road beside another. With nothing
    // arriving on that axis it is a two-lane street, and every other street in
    // the village is a lane.
    const SIDE_ROAD_W = 3;
    const mainColW = (borderDirs.north || borderDirs.south) ? 7 : 5;
    const mainRowW = (borderDirs.east || borderDirs.west) ? 7 : 5;
    const cellCenterX = c => ox + c * CELL + Math.floor(CELL / 2);
    const cellCenterY = r => oy + r * CELL + Math.floor(CELL / 2);
    const roadWidthOf = (c, r) => {
      if (c === layout.roadCol && r === layout.roadRow) return Math.max(mainColW, mainRowW);
      if (c === layout.roadCol) return mainColW;
      if (r === layout.roadRow) return mainRowW;
      return SIDE_ROAD_W;
    };

    const roadSet = new Set();
    const isBorderRoad = (x, y) => borderRoadOccupied[y * width + x];
    // The border roads are already down: the pavement pass has to know about
    // them too, or the one street the village shares with its neighbours is the
    // only one with nothing alongside it.
    if (hasCardinalRoads) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (borderRoadOccupied[y * width + x]) roadSet.add(`${x},${y}`);
      }
    }
    function paintStreetTile(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      roadSet.add(`${x},${y}`);
      if (isBorderRoad(x, y)) return;    // already drawn, with its own markings
      mapData[calculateIndex(x, y, 0, width, height)] = streetTile;
    }
    function paintStreetRect(x0, y0, x1, y1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintStreetTile(x, y);
    }

    yield;


    // --- STEP 2: the streets ------------------------------------------------
    // Each street block is drawn as its own square of carriageway plus an arm
    // reaching to every neighbouring street block, so the network on the ground
    // is exactly the network in the plan: straight, and connected.
    const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (layout.at(c, r) !== "R") continue;
        const hw = roadWidthOf(c, r) >> 1;
        const cx = cellCenterX(c), cy = cellCenterY(r);
        paintStreetRect(cx - hw, cy - hw, cx + hw, cy + hw);
        for (const [dc, dr] of NEIGHBOURS) {
          if (layout.at(c + dc, r + dr) !== "R") continue;
          const nhw = Math.min(hw, roadWidthOf(c + dc, r + dr) >> 1);
          const nx = cellCenterX(c + dc), ny = cellCenterY(r + dr);
          paintStreetRect(
            Math.min(cx, nx) - (dc ? 0 : nhw), Math.min(cy, ny) - (dr ? 0 : nhw),
            Math.max(cx, nx) + (dc ? 0 : nhw), Math.max(cy, ny) + (dr ? 0 : nhw)
          );
        }
      }
    }

    // Centre lines, on a carriageway wide enough to have two lanes and only on
    // a block the street runs straight through: paint across a junction reads
    // as a lane marking driving into the traffic it crosses. The cadence comes
    // off the absolute coordinate (ProcGenRoads.isDashStep), so the dashes line
    // up with the border roads and with the neighbouring map square.
    const dashStep = n => window.ProcGenRoads && window.ProcGenRoads.isDashStep
      ? window.ProcGenRoads.isDashStep(n)
      : ((n % 2) + 2) % 2 < 1;
    if (streetIsPaved) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (layout.at(c, r) !== "R") continue;
          if (roadWidthOf(c, r) < 5) continue;
          const vertical = layout.at(c, r - 1) === "R" || layout.at(c, r + 1) === "R";
          const horizontal = layout.at(c - 1, r) === "R" || layout.at(c + 1, r) === "R";
          if (vertical === horizontal) continue;              // a junction, or a stub
          const dashTile = vertical ? villageDashedLines.vertical : villageDashedLines.horizontal;
          if (!dashTile) continue;
          const cx = cellCenterX(c), cy = cellCenterY(r);
          const from = vertical ? oy + r * CELL : ox + c * CELL;
          for (let i = from; i < from + CELL; i++) {
            const x = vertical ? cx : i;
            const y = vertical ? i : cy;
            if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
            if (!dashStep(i)) continue;
            if (isBorderRoad(x, y)) continue;
            if (mapData[calculateIndex(x, y, 0, width, height)] !== streetTile) continue;
            mapData[calculateIndex(x, y, 1, width, height)] = dashTile;
          }
        }
      }
    }

    yield;


    // --- STEP 3: the lots, and the prefabs that stand on them ----------------
    // One lot per house block, one per 2x2 building block. Each is inset by a
    // tile so a building never sits flush against the kerb, and each is handed
    // over as a rectangle, not just a point, so the placement pass can pick a
    // prefab that actually fits it.
    const villageLots = [];
    const lotFor = (c, r, wCells, hCells) => ({
      x: ox + c * CELL + 1,
      y: oy + r * CELL + 1,
      w: wCells * CELL - 2,
      h: hCells * CELL - 2,
    });
    const lotClearOfBorderRoad = (lot) => {
      for (let y = lot.y; y < lot.y + lot.h; y++) {
        for (let x = lot.x; x < lot.x + lot.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) return false;
          if (borderRoadOccupied[y * width + x]) return false;
        }
      }
      return true;
    };
    for (const cl of layout.clusters) {
      const lot = lotFor(cl.c, cl.r, 2, 2);
      if (lotClearOfBorderRoad(lot)) villageLots.push(lot);
    }
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (layout.at(c, r) !== "H") continue;
        const lot = lotFor(c, r, 1, 1);
        if (lotClearOfBorderRoad(lot)) villageLots.push(lot);
      }
    }

    // Biggest lots first, so the large prefabs get the room built for them.
    villageLots.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const validPrefabLots = villageLots.map(lot => ({
      x: lot.x + Math.floor(lot.w / 2),
      y: lot.y + Math.floor(lot.h / 2),
      w: lot.w,
      h: lot.h,
      dist: 1,
    }));

    yield;


    // --- STEP 4: Apply prefabs ---
    // Prefabs are placed NOW. Any code after this must respect the tiles they placed.
    allOtherData.placementHints = validPrefabLots;
    if (biome && biome.prefabs && biome.prefabs.length > 0) {
      const worldCoords = allOtherData?.worldCoords || { x: 0, y: 0 };
      if (window.ProceduralMapPrefabs && window.ProceduralMapPrefabs.applyPrefabsToMap) {
        try {
          window.ProceduralMapPrefabs.applyPrefabsToMap(mapData, biome.name, worldCoords, allOtherData);
          // This placement is the one that took the map's roads and lots into
          // account; it must take priority over the generic, hint-blind pass
          // DataManager.loadMapData would otherwise still run on this same
          // array and stamp a second, uncoordinated round of buildings on top.
          window.ProceduralMapPrefabs.markPrefabbed(mapData);
        } catch (e) { console.warn(e); }
      }
    }

    // --- Footpaths from each lot to its street ------------------------------
    // A short spur of Path from the middle of a lot out to the nearest
    // carriageway, laid only over ground nothing else has claimed, so a prefab
    // is never cut into.
    function layFootpath(x, y) {
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
      if (borderRoadOccupied[y * width + x]) return false;
      const idx = calculateIndex(x, y, 0, width, height);
      const current = mapData[idx];
      if (current === streetTile || current === pathTile) return true;
      if (current !== baseTile && current !== 0) return false;
      mapData[idx] = pathTile;
      roadSet.add(`${x},${y}`);
      return true;
    }
    for (const lot of villageLots) {
      const fx = lot.x + Math.floor(lot.w / 2);
      const fy = lot.y + Math.floor(lot.h / 2);
      let best = null;
      for (const [dx, dy] of NEIGHBOURS) {
        for (let step = 1; step <= CELL; step++) {
          const x = fx + dx * step;
          const y = fy + dy * step;
          if (x < 0 || y < 0 || x >= width || y >= height) break;
          if (roadSet.has(`${x},${y}`)) {
            if (!best || step < best.step) best = { dx, dy, step };
            break;
          }
        }
      }
      if (!best) continue;
      for (let step = 1; step < best.step; step++) {
        if (!layFootpath(fx + best.dx * step, fy + best.dy * step)) break;
      }
    }

    yield;


    // --- Sidewalks ---
    // UPDATED Call: Passes baseTile to ensure sidewalks don't overwrite prefabs
    const sidewalkTiles = getFeatureTiles(pathFeatureName, allFeatures);
    if (sidewalkTiles) {
      const tilesToProtect = [...pathTiles];
      if (streetIsPaved) tilesToProtect.push(streetTile);
      // Pass baseTile as the last argument
      placeSidewalksAroundRoads(mapData, width, height, roadSet, sidewalkTiles, rng, tilesToProtect, baseTile);
    }

    addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng);

    // The green comes back over the paths and the yards, thicker every year
    // (see cityOvergrowth). Run after the paths and the beach so it can grow
    // over both, and before the region data so nothing it plants is read as
    // water.
    overgrowMapData(mapData, width, height, allFeatures, biome && biome.tilesetId, seed);

    // Region Data
    const regiondata = new Array(width * height).fill(0);
    let waterTileIds = new Set();
    ["Water", "Ocean", "Beach"].forEach(f => {
      if(allFeatures[f]) allFeatures[f].forEach(v => {if(v.type==='single') waterTileIds.add(v.tileId)});
    });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (waterTileIds.has(mapData[calculateIndex(x, y, 0, width, height)])) regiondata[y * width + x] = 99;
      }
    }
    mapData.regiondata = regiondata;

    return mapData;
  }

  // ===== CITY BORDER ROAD CONNECTIONS =====

  /**
   * Draw a single cardinal road from the center of a city/burg to its border
   * This road is drawn down the center to snap with drawHighwayExitIntersection roads
   * @param {Array} mapData - Map tile data
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {string} direction - Direction to draw ("north", "south", "east", "west")
   * @param {number} roadTile - Road tile ID
   * @param {{horizontal: number|null, vertical: number|null}} dashedLines - Orientation-aware center-line tiles
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {{horizontal: object|null, vertical: object|null}} [zebra] - Orientation-aware crossing tile grids
   * @param {Function} [rng] - Seeded random function, gates the occasional crossing
   */
  function drawBorderConnectionRoad(mapData, centerX, centerY, direction, roadTile, dashedLines, width, height, zebra, rng) {
    const roadWidth = 7;  // Single 7-tile wide road centered on border
    const halfRoad = Math.floor(roadWidth / 2);
    const DASH_LENGTH = window.ProcGenRoads?.DASH_LENGTH ?? 1;
    const DASH_CYCLE = window.ProcGenRoads?.DASH_CYCLE ?? 2;
    // The phase of the paint is read off the absolute coordinate, never off
    // where this particular run happens to start. Each of the four runs used
    // to count from its own end - south and east from the map centre, west
    // backwards from it - so the dashes broke cadence at the centre junction
    // and again at every map seam, where the neighbouring square's run was
    // counting from somewhere else entirely.
    const dashStep = (n) => window.ProcGenRoads?.isDashStep
      ? window.ProcGenRoads.isDashStep(n)
      : ((n % DASH_CYCLE) + DASH_CYCLE) % DASH_CYCLE < DASH_LENGTH;
    const dl = dashedLines || { horizontal: null, vertical: null };
    // A crossing, sometimes, well clear of the border edge and of the
    // junction at the map center where this run meets the street grid.
    const ZEBRA_CHANCE = 0.35;
    const ZEBRA_MARGIN = 10;

    if (direction === "north") {
      // Draw single vertical road from center upward to north edge
      const startX = centerX - halfRoad;
      const endX = startX + roadWidth;
      const centerLineX = centerX;

      for (let y = 0; y <= centerY; y++) {
        // Draw road
        for (let x = startX; x < endX; x++) {
          if (x >= 0 && x < width) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = roadTile;
          }
        }
        // Draw dashed center line
        if (dl.vertical && dashStep(y)) {
          {
            const idx = calculateIndex(centerLineX, y, 1, width, height);
            mapData[idx] = dl.vertical;
          }
        }
      }

      if (zebra?.vertical && rng && centerY > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossY = ZEBRA_MARGIN + Math.floor(rng() * (centerY - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.vertical, "vertical", startX, roadWidth, crossY, width, height);
      }
    } else if (direction === "south") {
      // Draw single vertical road from center downward to south edge
      const startX = centerX - halfRoad;
      const endX = startX + roadWidth;
      const centerLineX = centerX;

      for (let y = centerY; y < height; y++) {
        // Draw road
        for (let x = startX; x < endX; x++) {
          if (x >= 0 && x < width) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = roadTile;
          }
        }
        // Draw dashed center line
        if (dl.vertical && dashStep(y)) {
          {
            const idx = calculateIndex(centerLineX, y, 1, width, height);
            mapData[idx] = dl.vertical;
          }
        }
      }

      const southSpan = height - centerY;
      if (zebra?.vertical && rng && southSpan > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossY = centerY + ZEBRA_MARGIN + Math.floor(rng() * (southSpan - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.vertical, "vertical", startX, roadWidth, crossY, width, height);
      }
    } else if (direction === "east") {
      // Draw single horizontal road from center rightward to east edge
      const startY = centerY - halfRoad;
      const endY = startY + roadWidth;
      const centerLineY = centerY;

      for (let x = centerX; x < width; x++) {
        // Draw road
        for (let y = startY; y < endY; y++) {
          if (y >= 0 && y < height) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = roadTile;
          }
        }
        // Draw dashed center line
        if (dl.horizontal && dashStep(x)) {
          {
            const idx = calculateIndex(x, centerLineY, 1, width, height);
            mapData[idx] = dl.horizontal;
          }
        }
      }

      const eastSpan = width - centerX;
      if (zebra?.horizontal && rng && eastSpan > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossX = centerX + ZEBRA_MARGIN + Math.floor(rng() * (eastSpan - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.horizontal, "horizontal", startY, roadWidth, crossX, width, height);
      }
    } else if (direction === "west") {
      // Draw single horizontal road from center leftward to west edge
      const startY = centerY - halfRoad;
      const endY = startY + roadWidth;
      const centerLineY = centerY;

      for (let x = 0; x <= centerX; x++) {
        // Draw road
        for (let y = startY; y < endY; y++) {
          if (y >= 0 && y < height) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = roadTile;
          }
        }
        // Draw dashed center line
        if (dl.horizontal && dashStep(x)) {
          {
            const idx = calculateIndex(x, centerLineY, 1, width, height);
            mapData[idx] = dl.horizontal;
          }
        }
      }

      if (zebra?.horizontal && rng && centerX > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossX = ZEBRA_MARGIN + Math.floor(rng() * (centerX - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.horizontal, "horizontal", startY, roadWidth, crossX, width, height);
      }
    }
  }

  /**
   * Determine which directions have adjacent city/burg/road/village biomes
   * Returns object with directions that should have connecting roads
   */
  function getCityBorderRoadDirections(adjacentBiomes) {
    if (!adjacentBiomes) {
      return { north: false, south: false, east: false, west: false };
    }

    const isConnectableBiome = (biomeName) => {
      if (!biomeName) return false;
      const name = biomeName.toLowerCase();
      return (
        name.includes("city") ||
        name.includes("burg") ||
        name.includes("road") ||
        name.includes("highway") ||
        name.includes("village")
      );
    };

    return {
      north: isConnectableBiome(adjacentBiomes.north),
      south: isConnectableBiome(adjacentBiomes.south),
      east: isConnectableBiome(adjacentBiomes.east),
      west: isConnectableBiome(adjacentBiomes.west)
    };
  }

  /**
   * Apply border road connections to city/burg map
   * Draws roads from center to edges where adjacent cities/burgs/roads exist
   * Uses dual road style with dashed center lines matching city streets
   */
  function applyBorderRoadConnections(mapData, width, height, adjacentBiomes, roadTile, dashedLines, zebra, rng) {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const borderDirs = getCityBorderRoadDirections(adjacentBiomes);

    if (borderDirs.north) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "north", roadTile, dashedLines, width, height, zebra, rng);
    }
    if (borderDirs.south) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "south", roadTile, dashedLines, width, height, zebra, rng);
    }
    if (borderDirs.east) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "east", roadTile, dashedLines, width, height, zebra, rng);
    }
    if (borderDirs.west) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "west", roadTile, dashedLines, width, height, zebra, rng);
    }

    dlog(
      `[BorderRoads] Applied connections - N:${borderDirs.north} S:${borderDirs.south} E:${borderDirs.east} W:${borderDirs.west}`
    );
  }

  /**
   * Generate internal roads sprouting from cardinal border roads
   * Creates secondary roads that branch from the main cardinal roads
   * @param {Array} mapData - Map tile data
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {Object} borderDirs - Border directions with boolean values (north, south, east, west)
   * @param {number} roadTile - Road tile ID
   * @param {{horizontal: number|null, vertical: number|null}} dashedLines - Orientation-aware center-line tiles
   * @param {Array} occupiedMap - Occupied map tracking array
   * @param {Function} rng - Seeded random function
   */
  function generateInternalRoadsFromBorders(mapData, width, height, borderDirs, roadTile, dashedLines, occupiedMap, rng) {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const roadWidth = 3;  // Thinner roads for internal branching
    const halfRoad = Math.floor(roadWidth / 2);
    const DASH_LENGTH = window.ProcGenRoads?.DASH_LENGTH ?? 1;
    const DASH_CYCLE = window.ProcGenRoads?.DASH_CYCLE ?? 2;
    const dl = dashedLines || { horizontal: null, vertical: null };

    /**
     * Draw a single road tile and mark it as occupied
     */
    function setRoad(x, y) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = calculateIndex(x, y, 0, width, height);
        mapData[idx] = roadTile;
        occupiedMap[y * width + x] = 1;
      }
    }

    /**
     * Draw an internal branching road from a cardinal road
     * Draws perpendicular roads from cardinal directions with some organic sway
     */
    function drawBranchingRoad(startX, startY, dirX, dirY, maxLength) {
      let x = startX;
      let y = startY;
      // A branch travels mainly along one axis; its centre line uses the
      // same Horizontal/Vertical tile a road running that way would.
      const branchDashTile = dirX !== 0 ? dl.horizontal : dl.vertical;

      for (let step = 0; step < maxLength; step++) {
        // Draw road tile
        for (let dy = -halfRoad; dy <= halfRoad; dy++) {
          for (let dx = -halfRoad; dx <= halfRoad; dx++) {
            setRoad(Math.floor(x) + dx, Math.floor(y) + dy);
          }
        }

        // Draw dashed center line
        if (branchDashTile && step % DASH_CYCLE < DASH_LENGTH) {
          const centerIdx = calculateIndex(Math.floor(x), Math.floor(y), 1, width, height);
          if (centerIdx >= 0 && centerIdx < mapData.length) {
            mapData[centerIdx] = branchDashTile;
          }
        }

        // Move in direction with slight organic sway
        x += dirX;
        y += dirY;

        // Add occasional sway for organic look (20% chance)
        if (rng() < 0.2) {
          x += (rng() - 0.5) * 0.5;
          y += (rng() - 0.5) * 0.5;
        }
      }
    }

    // Generate branching roads from each cardinal direction
    // These branch perpendicular to the cardinal roads
    // Spaced far apart to leave room for prefabs

    if (borderDirs.north) {
      // North border road is vertical; create horizontal branches going east/west
      const branchCount = 1 + Math.floor(rng() * 2); // 1-2 branches
      for (let i = 0; i < branchCount; i++) {
        // Branches spawn at different Y positions, well-spaced from each other
        const branchY = Math.floor(centerY * 0.2 + (i + 0.5) * (centerY * 0.3));
        const maxBranchLen = Math.floor(centerX * 0.25); // Shorter branches

        // Branch east (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(centerX + 5, branchY, 1, 0, maxBranchLen);
        }
        // Branch west (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(centerX - 5, branchY, -1, 0, maxBranchLen);
        }
      }
    }

    if (borderDirs.south) {
      // South border road is vertical; create horizontal branches going east/west
      const branchCount = 1 + Math.floor(rng() * 2); // 1-2 branches
      for (let i = 0; i < branchCount; i++) {
        // Branches spawn at different Y positions, well-spaced from each other
        const branchY = Math.floor(centerY + centerY * 0.2 + (i + 0.5) * (centerY * 0.3));
        const maxBranchLen = Math.floor(centerX * 0.25); // Shorter branches

        // Branch east (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(centerX + 5, branchY, 1, 0, maxBranchLen);
        }
        // Branch west (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(centerX - 5, branchY, -1, 0, maxBranchLen);
        }
      }
    }

    if (borderDirs.east) {
      // East border road is horizontal; create vertical branches going north/south
      const branchCount = 1 + Math.floor(rng() * 2); // 1-2 branches
      for (let i = 0; i < branchCount; i++) {
        // Branches spawn at different X positions, well-spaced from each other
        const branchX = Math.floor(centerX + centerX * 0.2 + (i + 0.5) * (centerX * 0.3));
        const maxBranchLen = Math.floor(centerY * 0.25); // Shorter branches

        // Branch north (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(branchX, centerY - 5, 0, -1, maxBranchLen);
        }
        // Branch south (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(branchX, centerY + 5, 0, 1, maxBranchLen);
        }
      }
    }

    if (borderDirs.west) {
      // West border road is horizontal; create vertical branches going north/south
      const branchCount = 1 + Math.floor(rng() * 2); // 1-2 branches
      for (let i = 0; i < branchCount; i++) {
        // Branches spawn at different X positions, well-spaced from each other
        const branchX = Math.floor(centerX * 0.2 + (i + 0.5) * (centerX * 0.3));
        const maxBranchLen = Math.floor(centerY * 0.25); // Shorter branches

        // Branch north (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(branchX, centerY - 5, 0, -1, maxBranchLen);
        }
        // Branch south (70% chance)
        if (rng() < 0.7) {
          drawBranchingRoad(branchX, centerY + 5, 0, 1, maxBranchLen);
        }
      }
    }

    dlog("[InternalRoads] Internal branching roads generated from cardinal borders");
  }

  // ===== CITY GENERATION =====

  /**
   * Generate procedural city biome with grid-based roads matching RoadGenerator style.
   * Uses wider areas with fewer grid blocks.
   * Draws dual roads (7-tile wide with 3-tile separation) with dashed center lines.
   * Places prefabs in building lots within grid blocks.
   *//**
   * Generate procedural city biome with grid-based roads matching RoadGenerator style.
   * Uses wider areas with fewer grid blocks.
   * Draws dual roads (7-tile wide with 3-tile separation) with dashed center lines.
   * Places prefabs in building lots within grid blocks.
   */

  /**
   * Place RoadPole features at the concave corners of road intersections.
   *
   * A tile is an intersection corner when it borders a road on one vertical side
   * (N or S) AND one horizontal side (E or W) - which only happens where a
   * vertical road meets a horizontal one. Straight road edges border a road on a
   * single side, so they never qualify. Placement is non-destructive: occupied
   * (road/lot) cells are skipped and placeMultiTileFeature refuses any footprint
   * that is not fully empty, so roads, prefabs and building lots are preserved.
   *
   * Callbacks decouple this from each generator's own bookkeeping:
   *   isRoadAt(x,y)   - the tile carries a road
   *   isOccupied(x,y) - the tile is a road or a building lot (skip)
   *   markOccupied(x,y) - reserve a just-placed pole footprint
   * Returns the number of poles placed.
   */
  function placeRoadPolesAtIntersections(mapData, width, height, allFeatures, biome, seed, isRoadAt, isOccupied, markOccupied) {
    const variants = (allFeatures && allFeatures.RoadPole && allFeatures.RoadPole.length) ? allFeatures.RoadPole : null;
    if (!variants) return 0;
    const feat = Array.isArray(biome.features) && biome.features.find(f => f && f.name === "RoadPole");
    const density = feat && typeof feat.density === "number" ? feat.density : 0.6;
    const rng = createSeededRandom((seed ^ 0x504f4c45) >>> 0);   // vary by "POLE"
    const LAYER = 1;          // decorative upper-tile layer (poles sit above ground)
    const MIN_SPACING = 5;    // manhattan gap between placed poles

    // Base tiles a pole must never sit on, and water to avoid.
    const blockedBase = new Set([
      ...(getFeatureTiles("Road", allFeatures) || []),
      ...(getFeatureTiles("Path", allFeatures) || []),
      ...(getFeatureTiles("PathDesert", allFeatures) || []),
      ...(getFeatureTiles("PathIce", allFeatures) || []),
    ]);
    const waterSet = new Set();
    ["Water", "Ocean", "Beach"].forEach(n => (allFeatures[n] || []).forEach(v => { if (v.type === "single") waterSet.add(v.tileId); }));

    // Smallest footprint first so a pole fits even a tight margin.
    const ordered = variants.slice().sort((a, b) => (a.width * a.height) - (b.width * b.height));

    const footprintClear = (sx, sy, w, h) => {
      for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const ox = sx + gx, oy = sy + gy;
        if (ox < 0 || ox >= width || oy < 0 || oy >= height) return false;
        if (isOccupied(ox, oy)) return false;
      }
      return true;
    };

    const placed = [];
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (isOccupied(x, y) || isRoadAt(x, y)) continue;
        const roadN = isRoadAt(x, y - 1), roadS = isRoadAt(x, y + 1);
        const roadW = isRoadAt(x - 1, y), roadE = isRoadAt(x + 1, y);
        if (!((roadN || roadS) && (roadW || roadE))) continue;   // intersection corner only
        if (rng() > density) continue;
        if (placed.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < MIN_SPACING)) continue;

        for (const v of ordered) {
          // Anchor the block into the open quadrant, away from both roads.
          const sy = roadN ? y : (roadS ? y - (v.height - 1) : y);
          const sx = roadW ? x : (roadE ? x - (v.width - 1) : x);
          if (!footprintClear(sx, sy, v.width, v.height)) continue;
          if (Utils2.placeMultiTileFeature(mapData, v.grid, sx, sy, LAYER, width, height, waterSet, blockedBase)) {
            for (let gy = 0; gy < v.grid.length; gy++) for (let gx = 0; gx < v.grid[gy].length; gx++) markOccupied(sx + gx, sy + gy);
            placed.push({ x, y });
            count++;
            break;
          }
        }
      }
    }
    if (count) dlog(`[RoadPole] placed ${count} pole(s) at intersections for ${biome.name}`);
    return count;
  }

  // ==========================================================================
  // CITY STREET DRESSING (tileset 303)
  // ==========================================================================
  //
  // A city is not a road grid with houses dropped into it. What makes a street
  // read as a street is everything the tileset stands ALONG it: the plane trees
  // in a row against the kerb, the lamp posts, the benches and the bins, the
  // hydrant, the phone box, the bus shelter, the stop sign at the junction, the
  // cones around the hole in the road, the manhole, the litter nobody picked up,
  // the graffiti on the gable end, and the people sleeping rough in the park.
  // Tileset 303 carries all of it and none of it was ever placed.
  //
  // Every pass below works off one shared context, so the City generator and the
  // Burg generator (which track their roads and their lots quite differently)
  // can hand over their own bookkeeping and get the same streets:
  //
  //   ctx.mapData / width / height   the map being written
  //   ctx.allFeatures                the tileset's parsed feature table
  //   ctx.rng                        a stream of the map's own seed
  //   ctx.isRoad(x, y)               the tile is carriageway
  //   ctx.isOccupied(x, y)           road, building lot, or something placed
  //   ctx.mark(x, y)                 reserve a tile just written to
  //   ctx.openBase                   the ground tiles a prop may stand on
  //
  // Nothing here ever writes over a road, a building or another prop: a pass
  // asks before it writes and marks what it takes.
  const CITY_LAYER_MARK = 1;   // ground markings (parking bays, road paint)
  const CITY_LAYER_PROP = 2;   // the layer ProceduralTerrainInteractions reads

  // Every single-tile id declared by any of `names`.
  function cityTileSet(names, allFeatures) {
    const out = new Set();
    for (const n of names) {
      for (const v of (allFeatures[n] || [])) {
        if (v.type === "single" && v.tileId) out.add(v.tileId);
      }
    }
    return out;
  }

  function cityVariants(ctx, name) {
    const v = ctx.allFeatures && ctx.allFeatures[name];
    return (Array.isArray(v) && v.length) ? v : null;
  }

  // A footprint for a variant, single and grid alike, so a pass never has to
  // care which shape the tileset happens to declare a prop in.
  function cityVariantSize(v) {
    if (!v) return null;
    if (v.type === "single") return { w: 1, h: 1 };
    if (!v.grid || !v.grid.length) return null;
    let w = 0;
    for (const row of v.grid) w = Math.max(w, row.length);
    return { w, h: v.grid.length };
  }

  // Can a prop stand here? Open ground the biome or the pavement pass laid, with
  // nothing on any object layer and nothing else claiming the tile.
  function cityCellFree(ctx, x, y) {
    if (x < 1 || y < 1 || x >= ctx.width - 1 || y >= ctx.height - 1) return false;
    if (ctx.isOccupied(x, y)) return false;
    if (!ctx.openBase.has(ctx.mapData[calculateIndex(x, y, 0, ctx.width, ctx.height)])) return false;
    for (const z of [1, 2, 3]) {
      if (ctx.mapData[calculateIndex(x, y, z, ctx.width, ctx.height)] !== 0) return false;
    }
    return true;
  }

  // Place one variant of `name` with its top-left at (x, y), whole or not at
  // all. `layer` defaults to the prop layer. Returns true when it went down.
  function cityPlace(ctx, name, x, y, layer, forcedVariant) {
    const variants = cityVariants(ctx, name);
    if (!variants) return false;
    const z = (layer == null) ? CITY_LAYER_PROP : layer;
    const v = forcedVariant || variants[Math.floor(ctx.rng() * variants.length)];
    const size = cityVariantSize(v);
    if (!size) return false;
    for (let gy = 0; gy < size.h; gy++) {
      for (let gx = 0; gx < size.w; gx++) {
        if (!cityCellFree(ctx, x + gx, y + gy)) return false;
      }
    }
    // The footprint actually taken, for a caller that has to place something
    // against it (the bus sign beside its shelter). Variants of one prop can
    // differ in size, so the size chosen here is the only accurate one.
    ctx.lastPlacement = { x, y, w: size.w, h: size.h };
    if (v.type === "single") {
      ctx.mapData[calculateIndex(x, y, z, ctx.width, ctx.height)] = v.tileId;
      ctx.mark(x, y);
      return true;
    }
    for (let gy = 0; gy < v.grid.length; gy++) {
      for (let gx = 0; gx < v.grid[gy].length; gx++) {
        const tid = v.grid[gy][gx];
        // A blank cell of a grid variant is part of the footprint (nothing else
        // may stand inside a bus shelter) but paints nothing.
        if (tid) ctx.mapData[calculateIndex(x + gx, y + gy, z, ctx.width, ctx.height)] = tid;
        ctx.mark(x + gx, y + gy);
      }
    }
    return true;
  }

  // Same, but anchored so the BOTTOM row of the prop lands on (x, y): a tall
  // sprite (a street tree, a lamp post, a phone box) is drawn upward from the
  // tile it actually stands on, and anchoring by the top would leave it hanging.
  function cityPlaceStanding(ctx, name, x, y, layer) {
    const variants = cityVariants(ctx, name);
    if (!variants) return false;
    const v = variants[Math.floor(ctx.rng() * variants.length)];
    const size = cityVariantSize(v);
    if (!size) return false;
    // The variant that was measured is the variant that must be drawn - letting
    // cityPlace re-roll would anchor a two-tile sign by a three-tile offset.
    return cityPlace(ctx, name, x, y - (size.h - 1), layer, v);
  }

  // Is any tile of this feature already on the map? A prefab may have stamped
  // one, and a guarantee has to count what is there before it adds its own.
  function cityHasFeature(ctx, name) {
    const ids = new Set();
    for (const v of (ctx.allFeatures[name] || [])) {
      if (v.type === "single" && v.tileId) ids.add(v.tileId);
      else if (v.grid) for (const row of v.grid) for (const t of row) if (t) ids.add(t);
    }
    if (!ids.size) return false;
    const layerSize = ctx.width * ctx.height;
    for (let z = 1; z <= 3; z++) {
      for (let i = 0; i < layerSize; i++) {
        if (ids.has(ctx.mapData[z * layerSize + i])) return true;
      }
    }
    return false;
  }

  // Every free verge tile: open ground touching the carriageway. This is the
  // pavement a pedestrian walks on and where all the street furniture lives.
  function cityVergeTiles(ctx) {
    const out = [];
    for (let y = 1; y < ctx.height - 1; y++) {
      for (let x = 1; x < ctx.width - 1; x++) {
        if (!cityCellFree(ctx, x, y)) continue;
        if (ctx.isRoad(x - 1, y) || ctx.isRoad(x + 1, y) ||
            ctx.isRoad(x, y - 1) || ctx.isRoad(x, y + 1)) out.push({ x, y });
      }
    }
    return out;
  }

  function cityShuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  // ---- pass: rows of street trees against the kerb --------------------------
  // A single tree on a verge is scenery; a ROW of them is a boulevard, so they
  // are laid along one side of a road at a fixed pitch rather than scattered.
  function cityStreetTreeRows(ctx, cap) {
    if (!cityVariants(ctx, "TreeStreet")) return 0;
    let placed = 0;
    const limit = cap == null ? 26 : cap;
    const pitch = 4 + Math.floor(ctx.rng() * 2);   // one every 4-5 tiles
    // Horizontal runs: walk each row, and where a stretch of verge sits against
    // a road, plant it out. Only some rows are planted, or every street in the
    // city would be a boulevard and the trees would stop meaning anything.
    for (let y = 2; y < ctx.height - 2 && placed < limit; y++) {
      if (ctx.rng() > 0.4) continue;
      let run = 0;
      for (let x = 2; x < ctx.width - 2 && placed < limit; x++) {
        const onVerge = cityCellFree(ctx, x, y) && (ctx.isRoad(x, y - 1) || ctx.isRoad(x, y + 1));
        if (!onVerge) { run = 0; continue; }
        if (run % pitch === 0 && cityPlaceStanding(ctx, "TreeStreet", x, y)) placed++;
        run++;
      }
    }
    // Vertical runs, along the avenues.
    for (let x = 2; x < ctx.width - 2 && placed < limit; x++) {
      if (ctx.rng() > 0.32) continue;
      let run = 0;
      for (let y = 2; y < ctx.height - 2 && placed < limit; y++) {
        const onVerge = cityCellFree(ctx, x, y) && (ctx.isRoad(x - 1, y) || ctx.isRoad(x + 1, y));
        if (!onVerge) { run = 0; continue; }
        if (run % pitch === 0 && cityPlaceStanding(ctx, "TreeStreet", x, y)) placed++;
        run++;
      }
    }
    return placed;
  }

  function cityPickWeighted(ctx, table) {
    let total = 0;
    for (const e of table) if (cityVariants(ctx, e.name)) total += e.weight;
    if (!total) return null;
    let roll = ctx.rng() * total;
    for (const e of table) {
      if (!cityVariants(ctx, e.name)) continue;
      roll -= e.weight;
      if (roll <= 0) return e;
    }
    return null;
  }

  // ---- pass: bus stops ------------------------------------------------------
  // Exactly one per map: the bus is how the fast-travel network is boarded
  // (ProceduralHouseSystem's SignBus handler), so a settlement needs a stop,
  // but one is all it needs - a second shelter boards the same map from the
  // same city and only eats a block that a building could have had. The
  // shelter is placed against a road where there is room for it, and a single
  // SignBus goes up beside it; if nothing on the map can hold the shelter, the
  // sign alone still stands.
  // The sign belongs TO the shelter: it is what the player faces to board, and
  // one standing on its own down the road reads as a different stop that isn't
  // there. So it is always raised beside the shelter it serves - the ends of
  // the shelter first, then the tiles around it, widening a ring at a time -
  // and a sign is only ever placed away from a shelter when the map could not
  // fit a shelter at all.
  function cityBusSignBeside(ctx, x, y, size) {
    const w = size ? size.w : 5;
    const h = size ? size.h : 3;
    const spots = [];
    // Standing room at either end of the shelter, level with its base.
    spots.push({ x: x - 1, y: y + h - 1 }, { x: x + w, y: y + h - 1 });
    // Then the whole ring around the footprint, widening outward.
    for (let pad = 1; pad <= 3; pad++) {
      for (let gx = -pad; gx < w + pad; gx++) {
        spots.push({ x: x + gx, y: y - pad }, { x: x + gx, y: y + h - 1 + pad });
      }
      for (let gy = -pad; gy < h + pad; gy++) {
        spots.push({ x: x - pad, y: y + gy }, { x: x + w - 1 + pad, y: y + gy });
      }
    }
    for (const s of spots) {
      if (cityPlaceStanding(ctx, "SignBus", s.x, s.y)) return true;
    }
    return false;
  }

  function cityBusStops(ctx, verge, want) {
    let shelters = cityHasFeature(ctx, "BusStop") ? 1 : 0;
    let signs = cityHasFeature(ctx, "SignBus") ? 1 : 0;
    // One stop and one sign, never more - whatever the caller asked for and
    // whatever a prefab already brought onto the map.
    want = Math.min(want == null ? 1 : want, 1);
    const targets = cityShuffle(verge.slice(), ctx.rng);
    for (const t of targets) {
      if (shelters >= want) break;
      if (!cityPlace(ctx, "BusStop", t.x, t.y)) continue;
      shelters++;
      const spot = ctx.lastPlacement;
      if (!signs && cityBusSignBeside(ctx, spot.x, spot.y, spot)) signs++;
    }
    // The guarantee: a settlement always answers the bus.
    if (!shelters) {
      for (let y = 2; y < ctx.height - 4 && !shelters; y++) {
        for (let x = 2; x < ctx.width - 6 && !shelters; x++) {
          if (!cityPlace(ctx, "BusStop", x, y)) continue;
          shelters++;
          const spot = ctx.lastPlacement;
          if (!signs && cityBusSignBeside(ctx, spot.x, spot.y, spot)) signs++;
        }
      }
    }
    // Only when the map could hold no shelter at all does a sign go up on its
    // own - a stop the bus can still be boarded from.
    if (!signs && !shelters) {
      for (const t of targets) if (cityPlaceStanding(ctx, "SignBus", t.x, t.y)) { signs++; break; }
    }
    return { shelters, signs };
  }

  // ---- pass: greenery over grass -------------------------------------------
  // Wherever the ground is still the biome's own grass - a verge the pavement
  // pass did not reach, the corner of a lot, a park - it is planted. Nothing is
  // planted on pavement or on a road: a tree growing out of tarmac reads wrong.
  function cityGreenery(ctx, density) {
    const grass = cityTileSet(["Grass", "GrassFlower", "GrassDark", "GrassJungle", "GrassRock", "DirtGrass"], ctx.allFeatures);
    if (!grass.size) return 0;
    const table = [
      { name: "Flower", weight: 34 },
      { name: "Bush", weight: 20 },
      { name: "Tree", weight: 16, standing: true },
      { name: "Weed", weight: 12 },
      { name: "PottedPlant", weight: 6, standing: true },
      { name: "Vine", weight: 5 },
      { name: "Plant", weight: 7 },
    ];
    let placed = 0;
    for (let y = 1; y < ctx.height - 1; y++) {
      for (let x = 1; x < ctx.width - 1; x++) {
        if (ctx.rng() > density) continue;
        if (!grass.has(ctx.mapData[calculateIndex(x, y, 0, ctx.width, ctx.height)])) continue;
        if (!cityCellFree(ctx, x, y)) continue;
        const entry = cityPickWeighted(ctx, table);
        if (!entry) break;
        const ok = entry.standing ? cityPlaceStanding(ctx, entry.name, x, y) : cityPlace(ctx, entry.name, x, y);
        if (ok) placed++;
      }
    }
    return placed;
  }

  // Which day the world clock is on (TimeDateSystem's Variable 114, minutes).
  // Litter is dealt off this rather than off the map seed alone, so a street is
  // strewn differently every morning, the way a beach is re-strewn with shells
  // by the tide (ProceduralBeachGenerator.getTideDependentSeed).
  function cityDayIndex() {
    if (typeof $gameVariables === "undefined" || !$gameVariables) return 0;
    // Nobody drops litter and nobody collects it in a world whose decay is
    // fixed, so the street is strewn exactly as it was strewn the day the
    // world stopped and is never re-dealt: a constant day means one deal, for
    // good.
    if (isFixedDecayWorld()) return 0;
    return Math.floor(($gameVariables.value(114) | 0) / 1440);
  }

  function isEmptyWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
  }

  function isZombieWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isZombieWorld === "function" && WM.isZombieWorld());
  }

  // The worlds whose decay does not follow a timeline. A zombie apocalypse, an
  // empty world and a death world are not "2009, clean; 2012, buried": they are
  // already however far gone they are on the day the player arrives, and they
  // stay exactly that far gone forever. So instead of a year curve they get one
  // level, rolled once off the world seed and never moved again.
  function isFixedDecayWorld() {
    return isEmptyWorld() || isZombieWorld();
  }

  // A value fixed for the lifetime of one world. Off the WORLD seed, not the
  // map seed: every map of the same world has to agree on how far gone that
  // world is, or one street would be knee-deep in green and the next one clean.
  function worldDecaySeed() {
    if (typeof Utils2.getWorldSeed === "function") return Utils2.getWorldSeed() >>> 0;
    return 0;
  }

  function fixedDecayLevel(salt, min, max) {
    let h = (worldDecaySeed() ^ salt) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return min + (h / 4294967296) * (max - min);
  }

  // Litter is an artificial thing: somebody has to drop it. In an empty world
  // and a death world there is nobody to have dropped any, so the streets get
  // nothing strewn on them at all - only what can GROW there (the overgrowth
  // pass below) is allowed to appear.
  function cityLitterAllowed() {
    return !isEmptyWorld();
  }

  // The in-game year, on the same clock and the same 1 January 2001 epoch the
  // spawn era is read from (BSE.Helpers.getCurrentGameYear).
  function cityGameYear() {
    if (typeof $gameVariables === "undefined" || !$gameVariables) return 2001;
    const date = new Date(2001, 0, 1, 10, 0, 0);
    date.setMinutes(date.getMinutes() + (($gameVariables.value(114) | 0)));
    return date.getFullYear() + date.getMonth() / 12;
  }

  // Nobody is emptying the bins any more. The Squishing takes the civic
  // services with everything else: through 2010 and 2011 the rubbish piles up
  // month by month, and from 2012 the streets are simply full of it. Before
  // 2010 a city is as clean as a city ever is.
  const LITTER_RISE_YEAR = 2010;    // the year the collections start failing
  const LITTER_FULL_YEAR = 2012;    // the year the city is buried in it
  const LITTER_COLLAPSE_FACTOR = 14;
  const LITTER_FIXED_MIN = 4;       // how strewn a fixed-decay world can be
  function cityLitterFactor() {
    // Nothing artificial is scattered in an empty or a death world at all.
    if (!cityLitterAllowed()) return 0;
    // A fixed-decay world (the zombie apocalypse) never drifts: its streets
    // hold what they hold, whatever year the clock says, because the
    // collections did not fail gradually there, they simply stopped. How badly
    // is rolled once off the world seed, so one apocalypse is ankle-deep and
    // the next is merely grubby - but each stays as it is forever.
    if (isFixedDecayWorld()) {
      return fixedDecayLevel(0x11ACE5, LITTER_FIXED_MIN, LITTER_COLLAPSE_FACTOR);
    }
    const year = cityGameYear();
    if (year < LITTER_RISE_YEAR) return 1;
    if (year >= LITTER_FULL_YEAR) return LITTER_COLLAPSE_FACTOR;
    // Two years of it getting worse, month by month rather than in one step.
    const t = (year - LITTER_RISE_YEAR) / (LITTER_FULL_YEAR - LITTER_RISE_YEAR);
    return 1 + t * (LITTER_COLLAPSE_FACTOR - 1);
  }

  // ---- pass: overgrowth -----------------------------------------------------
  // The green comes in on the same schedule as the rubbish. A street that is
  // still being swept is still being weeded, so nothing grows through the
  // pavement while the city is being looked after: the cracks only start to
  // open once the maintenance goes with the collections, in 2010. From there
  // year by year the verges spread over the kerb and the vines get into the
  // brickwork, until by the collapse the street grid is something you can only
  // just make out under the green.
  //
  // Modelled on cityLitterFactor, with two differences that matter:
  //
  //   * it is MONOTONIC. Each candidate tile is given a fixed value from the
  //     map seed and is planted once the year's threshold passes it, so a plant
  //     that appeared in 2004 is still there in 2009 and the years only ever
  //     ADD. Re-rolling every year would make the greenery flicker from one
  //     visit to the next.
  //   * it never blocks a route it grows over. On a carriageway or a pavement
  //     only plants that are actually walk-through are used, checked against
  //     the tileset's own passage flags rather than assumed, so a city cannot
  //     be sealed off by its own weeds. (Bush and PottedPlant are impassable in
  //     both city tilesets, which is exactly the trap this avoids.)
  const OVERGROWTH_START_YEAR = 2010;  // the year the maintenance stops
  const OVERGROWTH_FULL_YEAR = 2012;   // the year the green has won
  const OVERGROWTH_MAX_FACTOR = 10;
  const OVERGROWTH_FIXED_MIN = 3;      // how green a fixed-decay world can be
  function cityOvergrowthFactor() {
    // A fixed-decay world sits at one point on the curve whatever the clock
    // says: there is nobody to cut it back and there never will be, so the
    // year it stopped being cut back is the only thing that decides how deep
    // the green is - rolled once off the world seed, and then it is that.
    if (isFixedDecayWorld()) {
      return fixedDecayLevel(0x9EEDED, OVERGROWTH_FIXED_MIN, OVERGROWTH_MAX_FACTOR);
    }
    const year = cityGameYear();
    if (year <= OVERGROWTH_START_YEAR) return 1;
    if (year >= OVERGROWTH_FULL_YEAR) return OVERGROWTH_MAX_FACTOR;
    const t = (year - OVERGROWTH_START_YEAR) / (OVERGROWTH_FULL_YEAR - OVERGROWTH_START_YEAR);
    return 1 + t * (OVERGROWTH_MAX_FACTOR - 1);
  }

  // A fixed value in [0,1) for one tile of one map. Not from ctx.rng: the
  // threshold has to be able to rise past the same tile's value next year, so
  // the value may not depend on how many tiles were tested before it.
  function overgrowthRoll(ctx, x, y) {
    let h = (ctx.seed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (x * 0x85ebca6b), 0xc2b2ae35) >>> 0;
    h = Math.imul(h ^ (y * 0x27d4eb2f), 0x165667b1) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // The plants that may stand on something people used to walk or drive on.
  // Filtered by real passability, so re-tagging a tileset cannot turn this pass
  // into a wall. `standing` props are anchored by their bottom row.
  // Grass is deliberately NOT here: it is a layer-0 terrain autotile, not a
  // prop, and painting it onto the prop layer would put a ground tile in the
  // air. Tarmac going back to green is done properly, by repainting the ground
  // itself (see the conversion step in cityOvergrowth).
  const OVERGROWTH_HARD_TABLE = [
    { name: "Weed", weight: 30 },
    { name: "Flower", weight: 24 },
    { name: "Vine", weight: 22 },
    { name: "Tree", weight: 8, standing: true },
    { name: "TreeStreet", weight: 6, standing: true },
  ];
  // On ground that was already soft, anything goes: nothing is being kept off
  // a verge that a bush could not have grown on anyway.
  const OVERGROWTH_SOFT_TABLE = OVERGROWTH_HARD_TABLE.concat([
    { name: "Bush", weight: 16 },
    { name: "Shrub", weight: 8 },
    { name: "Fern", weight: 6 },
  ]);

  // Every variant of `name` walk-through in this tileset?
  function overgrowthPassable(ctx, name) {
    const variants = cityVariants(ctx, name);
    if (!variants || !variants.length) return false;
    const tsId = ctx.tilesetId;
    if (!tsId) return true;
    return variants.every(v => {
      if (v.type === "single") return isTilePassableInTileset(tsId, v.tileId);
      return (v.grid || []).every(row =>
        (row || []).every(t => !t || isTilePassableInTileset(tsId, t)));
    });
  }

  function cityOvergrowth(ctx, baseDensity) {
    const factor = cityOvergrowthFactor();
    if (factor <= 1) return 0;
    const density = Math.min(0.85, (baseDensity != null ? baseDensity : 0.035) * factor);

    // Soft ground: the verges, the parks, the corners the pavement never
    // reached. Hard ground: pavement and carriageway, where only the
    // walk-through plants are allowed.
    const soft = cityTileSet(
      ["Grass", "GrassFlower", "GrassDark", "GrassJungle", "GrassRock", "DirtGrass", "Dirt", "Mud"],
      ctx.allFeatures);
    const hard = cityTileSet(
      ["Sidewalk", "Pavement", "Road", "DashedLine", "RoadLine", "Asphalt", "Salt"],
      ctx.allFeatures);
    if (!soft.size && !hard.size) return 0;

    const hardTable = OVERGROWTH_HARD_TABLE.filter(e => overgrowthPassable(ctx, e.name));
    const softTable = OVERGROWTH_SOFT_TABLE.filter(e => cityVariants(ctx, e.name));
    if (!hardTable.length && !softTable.length) return 0;

    // The carriageway is not in ctx.openBase (nothing is built on a road), so
    // it is opened for the duration of this pass and put straight back: the
    // passes after this one must see the map they always did.
    const openBase = ctx.openBase;
    ctx.openBase = new Set([...openBase, ...hard]);

    // What tarmac turns back into. Layer 0, so it stays walkable whatever it
    // is: this is the ground itself going green, not something standing on it.
    const greenGround = [...cityTileSet(["Grass", "GrassDark", "GrassFlower", "DirtGrass"], ctx.allFeatures)]
      .filter(t => !ctx.tilesetId || isTilePassableInTileset(ctx.tilesetId, t));

    let placed = 0;
    for (let y = 1; y < ctx.height - 1; y++) {
      for (let x = 1; x < ctx.width - 1; x++) {
        const gIdx = calculateIndex(x, y, 0, ctx.width, ctx.height);
        const ground = ctx.mapData[gIdx];
        const onSoft = soft.has(ground);
        const onHard = !onSoft && hard.has(ground);
        if (!onSoft && !onHard) continue;
        // Hard ground resists: tarmac takes longer to break than a verge does.
        const roll = overgrowthRoll(ctx, x, y);
        const local = density * (onHard ? 0.55 : 1);
        if (roll >= local) continue;

        // The worst-affected fraction of broken tarmac stops being tarmac.
        // Only where nothing is standing on the tile, so a road marking or a
        // manhole is never left floating over a meadow.
        if (onHard && greenGround.length && roll < local * 0.35 &&
            !ctx.isOccupied(x, y) &&
            ctx.mapData[calculateIndex(x, y, 1, ctx.width, ctx.height)] === 0 &&
            ctx.mapData[calculateIndex(x, y, 2, ctx.width, ctx.height)] === 0) {
          ctx.mapData[gIdx] = greenGround[Math.floor(roll * 997) % greenGround.length];
        }

        if (!cityCellFree(ctx, x, y)) continue;
        const table = onHard ? hardTable : softTable;
        const entry = cityPickWeighted(ctx, table);
        if (!entry) continue;
        const ok = entry.standing
          ? cityPlaceStanding(ctx, entry.name, x, y)
          : cityPlace(ctx, entry.name, x, y);
        if (ok) placed++;
      }
    }

    ctx.openBase = openBase;
    return placed;
  }

  // The same pass for a generator that has no city context of its own. A
  // village lays paths and lots without ever building the occupancy map the
  // city dressing runs on, and a road biome is only a carriageway and its
  // verges, so both get a minimal ctx here: occupancy is read straight off the
  // map (anything already standing on a prop layer is in the way), which is all
  // the overgrowth needs to know. Exposed so the road generator can call it.
  function overgrowMapData(mapData, width, height, allFeatures, tilesetId, seed, baseDensity) {
    if (cityOvergrowthFactor() <= 1) return 0;
    const taken = new Uint8Array(width * height);
    const ctx = {
      mapData, width, height, allFeatures, seed, tilesetId,
      rng: createSeededRandom((seed ^ 0x0Bee7) >>> 0),
      isRoad: () => false,
      isOccupied: (x, y) =>
        x < 0 || y < 0 || x >= width || y >= height || taken[y * width + x] !== 0,
      mark: (x, y) => {
        if (x >= 0 && x < width && y >= 0 && y < height) taken[y * width + x] = 1;
      },
      // Everything the pass itself decides is plantable; cityCellFree still
      // refuses any tile with something already on a prop layer.
      openBase: null,
    };
    ctx.openBase = cityTileSet(
      ["Grass", "GrassFlower", "GrassDark", "GrassJungle", "GrassRock", "DirtGrass",
        "Dirt", "Mud", "Sidewalk", "Pavement", "Path", "Road", "DashedLine"],
      allFeatures);
    return cityOvergrowth(ctx, baseDensity);
  }

  // ---- pass: litter --------------------------------------------------------
  // Trash lies about the pavement and is re-dealt every day. Wall art
  // (posters/graffiti) is kept out of city/village generation entirely.
  function cityLitterAndWallArt(ctx, litterCount) {
    let litter = 0;
    // The litter pass runs entirely on its own daily stream, so it can be
    // re-dealt without shifting one prop, tree or building anywhere else on the
    // map: ctx.rng is swapped out for the duration and put straight back, and
    // the passes after this one see exactly the stream they always did.
    const mapRng = ctx.rng;
    ctx.rng = createSeededRandom((ctx.seed ^ Math.imul(cityDayIndex() + 1, 0x9e3779b1)) >>> 0);
    const want = Math.round(litterCount * cityLitterFactor());
    // Four throws a piece is enough while a street is mostly empty; once the
    // collections have failed the pavement is already half covered, so the
    // attempt budget has to grow with the target or the pile stops short of it.
    for (let n = 0; n < want * 6 && litter < want; n++) {
      const x = 2 + Math.floor(ctx.rng() * (ctx.width - 4));
      const y = 2 + Math.floor(ctx.rng() * (ctx.height - 4));
      if (cityPlace(ctx, "Trash", x, y)) litter++;
    }
    ctx.rng = mapRng;
    return { litter, art: 0 };
  }

  // ---- block dressing: parks, car parks, plazas, vacant lots ---------------
  // Repaints a block's ground. The marking layer goes with it: a block is laid
  // over whatever the border-road pass ran through first, and a dashed centre
  // line left behind on a park or a vacant lot is a road marking with no road
  // under it - a line sitting at random in the grass. This runs before each
  // dresser lays its own markings (parking bays), so nothing wanted is lost.
  function cityPaintGround(ctx, rect, tileIds) {
    if (!tileIds || !tileIds.length) return;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 1 || y < 1 || x >= ctx.width - 1 || y >= ctx.height - 1) continue;
        if (ctx.isOccupied(x, y)) continue;
        ctx.mapData[calculateIndex(x, y, 0, ctx.width, ctx.height)] =
          tileIds[Math.floor(ctx.rng() * tileIds.length)];
        ctx.mapData[calculateIndex(x, y, CITY_LAYER_MARK, ctx.width, ctx.height)] = 0;
      }
    }
  }

  // Rubbish dropped on a dressed block, behind the same gate as the street
  // litter pass: nothing artificial is scattered in an empty or a death world,
  // where there was never anybody to drop any. The count is still rolled by the
  // caller either way, so the roll stays where it is in the map's stream.
  function cityScatterTrash(ctx, tiles, want) {
    if (!cityLitterAllowed()) return;
    for (let n = 0; n < want; n++) {
      for (const t of tiles) if (cityPlace(ctx, "Trash", t.x, t.y)) break;
    }
  }

  function cityRectTiles(ctx, rect) {
    const out = [];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (cityCellFree(ctx, x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  // Open blocks are painted their ground and left almost bare now: a lot cut
  // "park"/"parking"/"plaza"/"vacant" is still room the block-fitting pass
  // can hand to an oversized prefab (see generateCityBiome's release step),
  // so nothing here is dressed heavily enough to make that space feel spoken
  // for. Only trash and a little planting, ever.
  function cityDressPark(ctx, rect) {
    const grass = [...cityTileSet(["Grass", "GrassFlower", "GrassDark"], ctx.allFeatures)];
    cityPaintGround(ctx, rect, grass);
    const tiles = cityShuffle(cityRectTiles(ctx, rect), ctx.rng);
    cityScatterTrash(ctx, tiles, 1 + Math.floor(ctx.rng() * 2));
    for (let n = 0, want = 1 + Math.floor(ctx.rng() * 3); n < want; n++) {
      for (const t of tiles) if (cityPlace(ctx, ctx.rng() < 0.5 ? "Flower" : "Bush", t.x, t.y)) break;
    }
  }

  function cityDressCarPark(ctx, rect) {
    const pavement = [...cityTileSet(["Pavement", "Sidewalk"], ctx.allFeatures)];
    cityPaintGround(ctx, rect, pavement);
    const tiles = cityShuffle(cityRectTiles(ctx, rect), ctx.rng);
    cityScatterTrash(ctx, tiles, 1 + Math.floor(ctx.rng() * 2));
  }

  function cityDressPlaza(ctx, rect) {
    const pavement = [...cityTileSet(["Pavement", "Sidewalk"], ctx.allFeatures)];
    cityPaintGround(ctx, rect, pavement);
    const tiles = cityShuffle(cityRectTiles(ctx, rect), ctx.rng);
    cityScatterTrash(ctx, tiles, 1 + Math.floor(ctx.rng() * 2));
    for (const t of tiles) if (cityPlaceStanding(ctx, "PottedPlant", t.x, t.y)) break;
  }

  function cityDressVacantLot(ctx, rect) {
    const dirt = [...cityTileSet(["Dirt", "DirtGrass", "Mud"], ctx.allFeatures)];
    cityPaintGround(ctx, rect, dirt);
    const tiles = cityShuffle(cityRectTiles(ctx, rect), ctx.rng);
    cityScatterTrash(ctx, tiles, 1 + Math.floor(ctx.rng() * 2));
  }

  // The whole street-level pass, cut down to bus stops, street trees, litter
  // and plants: everything else that used to compete with a building for
  // room on the block (verge furniture, road hardware, camp sites) is gone.
  function dressCityStreets(ctx, opts) {
    const o = opts || {};
    const verge = cityVergeTiles(ctx);
    cityStreetTreeRows(ctx, o.streetTrees);
    cityBusStops(ctx, verge, o.busStops != null ? o.busStops : 1);
    cityGreenery(ctx, o.greenery != null ? o.greenery : 0.10);
    // After the greenery (which only plants on ground that was already soft)
    // and before the litter, so a weed can come up through a pavement that has
    // nothing else on it but rubbish is still strewn on top of the lot.
    cityOvergrowth(ctx, o.overgrowth);
    cityLitterAndWallArt(ctx, o.litter != null ? o.litter : 14);
  }

  // ==========================================================================
  // CITY
  // ==========================================================================
  //
  // The old generator could not lay a city on the map it was handed. Its block
  // sizes were written for a 128-tile square (minBlockSize 80, maxBlockSize 90,
  // a 12-tile border) while a procedural map is 64x64: the first block it queued
  // was 40x40, already narrower than its own minimum split width, so no street
  // was ever cut and every city in the world came out as ONE enormous lot with a
  // single prefab on it, ringed by whatever roads its neighbours asked for. It
  // placed no street furniture of any kind.
  //
  // What is generated now:
  //   1. the biome's own ground, so the Desert and Ice variants stay themselves
  //   2. a real street grid - one avenue each way through the centre (which is
  //      what the border roads run into) and secondary streets outward from it
  //      every 8-14 tiles, so a 64-tile square carries 9 to 25 blocks
  //   3. a zoning per block: built / park / car park / plaza / vacant
  //   4. one prefab per built block (the existing prefab pass)
  //   5. pavement, and sidewalks around every carriageway
  //   6. the street itself (dressCityStreets above)
  // Straight through, on the frame that asks for it.
  function generateCityBiome(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    return runSteps(generateCityBiomeSteps(biome, seed, allFeatures, adjacentBiomes, allOtherData));
  }

  // The same seven steps, allowed to stop between them. See RESUMABLE
  // GENERATION in ProceduralMapUtils.js: the same code in the same order, so a
  // city built over four frames is the city built in one.
  function* generateCityBiomeSteps(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const rng = createSeededRandom(seed);

    // 1. Initialize map with base terrain
    const mapData = new Array(width * height * 4).fill(0);

    // Get the terrain feature from the biome definition
    let baseTile = 0;
    if (biome && biome.features && biome.features.length > 0) {
      // Find the first terrain feature in the biome
      const terrainFeature = biome.features.find(f => f.terrain === true);
      if (terrainFeature && allFeatures[terrainFeature.name]) {
        // Get the first tile variant of this terrain feature
        const featureVariants = allFeatures[terrainFeature.name];
        for (const variant of featureVariants) {
          if (variant.type === "single") {
            baseTile = variant.tileId;
            break;
          }
        }
      }
    }

    // Fill entire map with base terrain
    for (let i = 0; i < width * height; i++) {
      mapData[i] = baseTile;
    }

    // Get Road Tiles
    const roadTiles = getFeatureTiles("Road", allFeatures);
    if (!roadTiles || roadTiles.length === 0) return mapData;

    const roadTile = roadTiles[0];
    const dashedLines = getDashedLinesForFeatures(allFeatures);
    const zebra = getZebraForFeatures(allFeatures);

    // 0 free · 1 carriageway · 2 building lot · 3 prop/furniture
    const occupiedMap = new Uint8Array(width * height);
    const isRoadAt = (x, y) =>
      x >= 0 && y >= 0 && x < width && y < height && occupiedMap[y * width + x] === 1;
    const markRoad = (x, y) => {
      if (x >= 0 && x < width && y >= 0 && y < height) occupiedMap[y * width + x] = 1;
    };

    // --- STEP 0: the roads the neighbouring squares run into this one --------
    applyBorderRoadConnections(mapData, width, height, adjacentBiomes, roadTile, dashedLines, zebra, rng);

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const borderDirs = getCityBorderRoadDirections(adjacentBiomes);
    const BORDER_ROAD_WIDTH = 7;
    const borderHalfRoad = Math.floor(BORDER_ROAD_WIDTH / 2);

    const markBorderRun = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) markRoad(x, y);
    };
    if (borderDirs.north) markBorderRun(centerX - borderHalfRoad, 0, centerX + borderHalfRoad, centerY);
    if (borderDirs.south) markBorderRun(centerX - borderHalfRoad, centerY, centerX + borderHalfRoad, height - 1);
    if (borderDirs.west) markBorderRun(0, centerY - borderHalfRoad, centerX, centerY + borderHalfRoad);
    if (borderDirs.east) markBorderRun(centerX, centerY - borderHalfRoad, width - 1, centerY + borderHalfRoad);

    yield;


    // --- STEP 1: the street grid --------------------------------------------
    // Cuts are dealt outward from the centre so the main avenues always meet
    // where the border roads arrive, and everything else hangs off them.
    const MARGIN = 3;
    const MAIN_WIDTH = 5;
    function axisCuts(center, size, mainWidth) {
      const half = Math.floor(mainWidth / 2);
      const cuts = [{ pos: center - half, w: mainWidth, main: true }];
      for (const dir of [-1, 1]) {
        let edge = dir < 0 ? center - half : center - half + mainWidth;
        for (;;) {
          // 16-30 tiles of frontage: wide enough, once inset for pavement,
          // to actually hold the authored city buildings (mostly 12-28 tiles
          // a side). The old 8-14 tile blocks were narrower than almost every
          // building in the pool, so a prefab could never fit and the "built"
          // lots came out as bare pavement instead.
          const block = 16 + Math.floor(rng() * 15);
          const w = rng() < 0.3 ? 5 : 3;                // an avenue or a street
          const pos = dir < 0 ? edge - block - w : edge + block;
          if (pos < MARGIN || pos + w > size - MARGIN) break;
          cuts.push({ pos, w, main: false });
          edge = dir < 0 ? pos : pos + w;
        }
      }
      return cuts.sort((a, b) => a.pos - b.pos);
    }

    const vCuts = axisCuts(centerX, width, borderDirs.north || borderDirs.south ? BORDER_ROAD_WIDTH : MAIN_WIDTH);
    const hCuts = axisCuts(centerY, height, borderDirs.east || borderDirs.west ? BORDER_ROAD_WIDTH : MAIN_WIDTH);

    // Every street that runs toward a bordering city/burg/road/village reaches
    // that edge outright, not just the one centred connector: two city squares
    // sharing an edge should meet as a street grid, not as one avenue with a
    // dead end either side of it. A side with no connectable neighbour still
    // keeps its MARGIN clearance from the map edge.
    const vTop = borderDirs.north ? 0 : MARGIN;
    const vBottom = borderDirs.south ? height : height - MARGIN;
    const hLeft = borderDirs.west ? 0 : MARGIN;
    const hRight = borderDirs.east ? width : width - MARGIN;

    const paintRoad = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      mapData[calculateIndex(x, y, 0, width, height)] = roadTile;
      markRoad(x, y);
    };
    for (const c of vCuts) {
      for (let y = vTop; y < vBottom; y++) {
        for (let x = c.pos; x < c.pos + c.w; x++) paintRoad(x, y);
      }
    }
    for (const c of hCuts) {
      for (let x = hLeft; x < hRight; x++) {
        for (let y = c.pos; y < c.pos + c.w; y++) paintRoad(x, y);
      }
    }

    // Centre lines: only a carriageway wide enough to have two lanes gets one,
    // and only where it is not standing on a junction (a dash across a crossing
    // reads as a lane marking that runs into the traffic it crosses).
    const DASH_CYCLE = window.ProcGenRoads?.DASH_CYCLE ?? 2;
    const DASH_LENGTH = window.ProcGenRoads?.DASH_LENGTH ?? 1;
    if (dashedLines.vertical) {
      for (const c of vCuts) {
        if (c.w < 5) continue;
        const cx = c.pos + Math.floor(c.w / 2);
        for (let y = vTop; y < vBottom; y++) {
          if (y % DASH_CYCLE >= DASH_LENGTH) continue;
          if (hCuts.some(h => y >= h.pos - 1 && y < h.pos + h.w + 1)) continue;
          mapData[calculateIndex(cx, y, 1, width, height)] = dashedLines.vertical;
        }
      }
    }
    if (dashedLines.horizontal) {
      for (const c of hCuts) {
        if (c.w < 5) continue;
        const cy = c.pos + Math.floor(c.w / 2);
        for (let x = hLeft; x < hRight; x++) {
          if (x % DASH_CYCLE >= DASH_LENGTH) continue;
          if (vCuts.some(v => x >= v.pos - 1 && x < v.pos + v.w + 1)) continue;
          mapData[calculateIndex(x, cy, 1, width, height)] = dashedLines.horizontal;
        }
      }
    }

    // Pedestrian crossings: sometimes, on a carriageway wide enough to carry
    // a centre line, well clear of any junction (a crossing belongs
    // mid-block, not stamped over an intersection's own markings). Drawn
    // after the centre lines so a crossing always wins where the two overlap.
    const ZEBRA_CHANCE = 0.4;
    if (zebra.vertical) {
      for (const c of vCuts) {
        if (c.w < 5) continue;
        if (rng() >= ZEBRA_CHANCE) continue;
        const candidates = [];
        for (let y = MARGIN + 2; y < height - MARGIN - 2; y++) {
          if (hCuts.some(h => y >= h.pos - 2 && y < h.pos + h.w + 2)) continue;
          candidates.push(y);
        }
        if (!candidates.length) continue;
        const y = candidates[Math.floor(rng() * candidates.length)];
        window.ProcGenRoads.stampZebraCrossing(mapData, zebra.vertical, "vertical", c.pos, c.w, y, width, height);
      }
    }
    if (zebra.horizontal) {
      for (const c of hCuts) {
        if (c.w < 5) continue;
        if (rng() >= ZEBRA_CHANCE) continue;
        const candidates = [];
        for (let x = MARGIN + 2; x < width - MARGIN - 2; x++) {
          if (vCuts.some(v => x >= v.pos - 2 && x < v.pos + v.w + 2)) continue;
          candidates.push(x);
        }
        if (!candidates.length) continue;
        const x = candidates[Math.floor(rng() * candidates.length)];
        window.ProcGenRoads.stampZebraCrossing(mapData, zebra.horizontal, "horizontal", c.pos, c.w, x, width, height);
      }
    }

    yield;


    // --- STEP 2: the blocks between the streets, and what each one is for ----
    const spans = (cuts, size) => {
      const out = [];
      let from = MARGIN;
      for (const c of cuts) {
        if (c.pos - from >= 4) out.push({ from, to: c.pos });
        from = c.pos + c.w;
      }
      if (size - MARGIN - from >= 4) out.push({ from, to: size - MARGIN });
      return out;
    };
    const xs = spans(vCuts, width);
    const ys = spans(hCuts, height);

    const blocks = [];
    for (const sy of ys) {
      for (const sx of xs) {
        blocks.push({ x: sx.from, y: sy.from, w: sx.to - sx.from, h: sy.to - sy.from });
      }
    }

    // A block too small to hold a building is never zoned as one. Weighted
    // heavily toward "built" so a prefab claims most of the grid first; the
    // open zones (park/parking/plaza/vacant) are what the street-furniture
    // pass dresses with props, and a city that is mostly buildings reads as
    // a city rather than as a furniture showroom.
    const ZONES = [
      { kind: "built", weight: 74 },
      { kind: "park", weight: 8 },
      { kind: "parking", weight: 8 },
      { kind: "plaza", weight: 4 },
      { kind: "vacant", weight: 6 },
    ];
    const zoneFor = (block) => {
      if (block.w < 6 || block.h < 6) return rng() < 0.5 ? "plaza" : "vacant";
      let total = 0;
      for (const z of ZONES) total += z.weight;
      let roll = rng() * total;
      for (const z of ZONES) { roll -= z.weight; if (roll <= 0) return z.kind; }
      return "built";
    };

    const buildingLots = [];
    const openBlocks = [];   // park / plaza / car park / vacant, dressed later
    for (const block of blocks) {
      const kind = zoneFor(block);
      if (kind === "built") {
        // Inset by one so the building never sits flush against the kerb: that
        // one tile is the pavement the sidewalk pass and the furniture use.
        const lot = { x: block.x + 1, y: block.y + 1, w: block.w - 2, h: block.h - 2 };
        if (lot.w < 4 || lot.h < 4) { openBlocks.push({ kind: "vacant", rect: block }); continue; }
        // A block wide or deep enough for two buildings gets two: one prefab
        // per block left the widest blocks as a single house standing in a
        // field of pavement, which is most of why a city read as empty. The
        // halves keep a 2-tile gap between them, and neither is allowed below
        // SPLIT_MIN, the frontage the smaller authored buildings need.
        const SPLIT_MIN = 12;
        const splitAlong = (l, axis) => {
          const size = axis === "x" ? l.w : l.h;
          const half = Math.floor((size - 2) / 2);
          if (half < SPLIT_MIN) return [l];
          return axis === "x"
            ? [{ x: l.x, y: l.y, w: half, h: l.h },
               { x: l.x + half + 2, y: l.y, w: size - half - 2, h: l.h }]
            : [{ x: l.x, y: l.y, w: l.w, h: half },
               { x: l.x, y: l.y + half + 2, w: l.w, h: size - half - 2 }];
        };
        let lots = lot.w >= lot.h ? splitAlong(lot, "x") : splitAlong(lot, "y");
        if (lots.length === 1 && rng() < 0.5) {
          lots = lot.w >= lot.h ? splitAlong(lot, "y") : splitAlong(lot, "x");
        }
        for (const l of lots) buildingLots.push(l);
        for (let y = lot.y; y < lot.y + lot.h; y++) {
          for (let x = lot.x; x < lot.x + lot.w; x++) occupiedMap[y * width + x] = 2;
        }
      } else {
        openBlocks.push({ kind, rect: { x: block.x + 1, y: block.y + 1, w: block.w - 2, h: block.h - 2 } });
      }
    }

    yield;


    // --- STEP 3: prefabs, one per built lot ---------------------------------
    if (biome && biome.prefabs && biome.prefabs.length > 0 && buildingLots.length) {
      const worldCoords = allOtherData?.worldCoords || { x: 0, y: 0 };
      allOtherData.blockHints = buildingLots;
      allOtherData.singlePrefabPerBlock = true;
      allOtherData.strictNoRoadOverlap = true;

      if (window.ProceduralMapPrefabs && window.ProceduralMapPrefabs.applyPrefabsToMap) {
        try {
          window.ProceduralMapPrefabs.applyPrefabsToMap(mapData, biome.name, worldCoords, allOtherData);
          // This lot-aligned placement takes priority over the generic pass
          // DataManager.loadMapData would otherwise still run on this array.
          window.ProceduralMapPrefabs.markPrefabbed(mapData);
        } catch (e) { console.warn(`[CityGenerator] Error: ${e.message}`); }
      }
    }

    // A prefab rarely fills the lot it was given, and what it leaves over is not
    // building, it is the yard behind it. Releasing every lot tile the prefab
    // did not paint gives those tiles back to the pavement and dressing passes,
    // so a block reads as a building with a yard rather than as a building
    // sitting in a fenced-off rectangle of untouched grass.
    for (const lot of buildingLots) {
      for (let y = lot.y; y < lot.y + lot.h; y++) {
        for (let x = lot.x; x < lot.x + lot.w; x++) {
          if (mapData[calculateIndex(x, y, 0, width, height)] !== baseTile) continue;
          if (mapData[calculateIndex(x, y, 1, width, height)] !== 0) continue;
          if (mapData[calculateIndex(x, y, 2, width, height)] !== 0) continue;
          if (mapData[calculateIndex(x, y, 3, width, height)] !== 0) continue;
          occupiedMap[y * width + x] = 0;
        }
      }
    }

    yield;


    // --- STEP 4: pavement, laid after the prefabs so nothing is overwritten --
    const sidewalkTiles = getFeatureTiles("Sidewalk", allFeatures);
    if (sidewalkTiles) {
      const sidewalkTile = sidewalkTiles[0];
      const painted = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (occupiedMap[y * width + x] !== 0) continue;
          // Only the biome's own untouched ground becomes pavement: anything a
          // prefab painted is that prefab's, whatever it happens to be.
          if (mapData[calculateIndex(x, y, 0, width, height)] !== baseTile) continue;
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) {
            for (let dx = -2; dx <= 2 && !near; dx++) if (isRoadAt(x + dx, y + dy)) near = true;
          }
          if (near) painted.push(y * width + x);
        }
      }
      for (const i of painted) mapData[i] = sidewalkTile;
      dlog(`[CityGenerator] ${painted.length} pavement tiles laid.`);
    }

    yield;


    // --- STEP 5: the streets themselves -------------------------------------
    const ctx = {
      mapData, width, height, allFeatures, rng, seed,
      // The overgrowth pass asks the tileset itself which plants are
      // walk-through, so it can never seal a street off (see cityOvergrowth).
      tilesetId: biome && biome.tilesetId,
      isRoad: isRoadAt,
      isOccupied: (x, y) =>
        x < 0 || y < 0 || x >= width || y >= height || occupiedMap[y * width + x] !== 0,
      mark: (x, y) => {
        if (x >= 0 && x < width && y >= 0 && y < height && occupiedMap[y * width + x] === 0) {
          occupiedMap[y * width + x] = 3;
        }
      },
      openBase: cityTileSet(
        ["Grass", "GrassFlower", "GrassDark", "GrassJungle", "GrassRock", "DirtGrass",
          "Dirt", "Sidewalk", "Pavement", "Sand", "Snow", "Mud", "Beach", "Salt"],
        allFeatures
      ),
    };
    ctx.openBase.add(baseTile);

    // Blocks that are not built on are dressed after the buildings.
    for (const b of openBlocks) {
      if (b.rect.w < 2 || b.rect.h < 2) continue;
      if (b.kind === "park") cityDressPark(ctx, b.rect);
      else if (b.kind === "parking") cityDressCarPark(ctx, b.rect);
      else if (b.kind === "plaza") cityDressPlaza(ctx, b.rect);
      else cityDressVacantLot(ctx, b.rect);
    }

    dressCityStreets(ctx, {
      streetTrees: 14,
      busStops: 1,
      greenery: 0.05,
      litter: 5 + Math.floor(rng() * 6),
    });

    yield;


    // --- STEP 6: beach, road poles, water regions ---------------------------
    addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng);

    placeRoadPolesAtIntersections(
      mapData, width, height, allFeatures, biome, seed,
      isRoadAt,
      (x, y) => occupiedMap[y * width + x] !== 0,
      (x, y) => { occupiedMap[y * width + x] = 3; }
    );

    const regiondata = new Array(width * height).fill(0);
    let waterTileIds = new Set();
    ["Water", "Ocean", "Beach"].forEach(f => {
      if (allFeatures[f]) allFeatures[f].forEach(v => { if(v.type==='single') waterTileIds.add(v.tileId); });
    });

    for (let i = 0; i < width * height; i++) {
      if (waterTileIds.has(mapData[i])) regiondata[i] = 99;
    }
    mapData.regiondata = regiondata;

    return mapData;
  }


/* Reworked generateBurgBiome for Circular European-style City */

function generateBurgBiome(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
  const width = PROC_MAP_WIDTH;
  const height = PROC_MAP_HEIGHT;
  const rng = createSeededRandom(seed);

  // 1. Initialize map with base terrain
  const mapData = new Array(width * height * 4).fill(0);

  // Get the terrain feature from the biome definition
  let baseTile = 0;
  if (biome && biome.features && biome.features.length > 0) {
    // Find the first terrain feature in the biome
    const terrainFeature = biome.features.find(f => f.terrain === true);
    if (terrainFeature && allFeatures[terrainFeature.name]) {
      // Get the first tile variant of this terrain feature
      const featureVariants = allFeatures[terrainFeature.name];
      for (const variant of featureVariants) {
        if (variant.type === "single") {
          baseTile = variant.tileId;
          break;
        }
      }
    }
  }

  // Fill entire map with base terrain
  for (let i = 0; i < width * height; i++) {
    mapData[i] = baseTile;
  }

  // Get Road Tiles
  const roadTiles = getFeatureTiles("Road", allFeatures);
  if (!roadTiles || roadTiles.length === 0) return mapData;
  const roadTile = roadTiles[0];
  const dashedLines = getDashedLinesForFeatures(allFeatures);
  const zebra = getZebraForFeatures(allFeatures);

  // --- STEP 0: Draw border roads FIRST, mark them as occupied ---
  applyBorderRoadConnections(mapData, width, height, adjacentBiomes, roadTile, dashedLines, zebra, rng);

  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const borderRoadOccupied = new Array(width * height).fill(false);
  const borderRoadWidth = 7;  // Single road width
  const borderHalfRoad = Math.floor(borderRoadWidth / 2);
  const borderDirs = getCityBorderRoadDirections(adjacentBiomes);

  // Mark border road tiles as occupied (single centered road only)
  if (borderDirs.north) {
    const startX = centerX - borderHalfRoad;
    const endX = startX + borderRoadWidth;
    for (let y = 0; y <= centerY; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          borderRoadOccupied[y * width + x] = true;
        }
      }
    }
  }
  if (borderDirs.south) {
    const startX = centerX - borderHalfRoad;
    const endX = startX + borderRoadWidth;
    for (let y = centerY; y < height; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          borderRoadOccupied[y * width + x] = true;
        }
      }
    }
  }
  if (borderDirs.east) {
    const startY = centerY - borderHalfRoad;
    const endY = startY + borderRoadWidth;
    for (let x = centerX; x < width; x++) {
      for (let y = startY; y < endY; y++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          borderRoadOccupied[y * width + x] = true;
        }
      }
    }
  }
  if (borderDirs.west) {
    const startY = centerY - borderHalfRoad;
    const endY = startY + borderRoadWidth;
    for (let x = 0; x <= centerX; x++) {
      for (let y = startY; y < endY; y++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          borderRoadOccupied[y * width + x] = true;
        }
      }
    }
  }

  dlog("[BurgGenerator] Border roads marked as occupied");

  // --- Generate internal roads sprouting from border roads ---
  const occupiedMapBurg = new Array(width * height).fill(0);
  // Mark border roads in occupied map
  if (borderDirs.north) {
    const startX = centerX - borderHalfRoad;
    const endX = startX + borderRoadWidth;
    for (let y = 0; y <= centerY; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          occupiedMapBurg[y * width + x] = 1;
        }
      }
    }
  }
  if (borderDirs.south) {
    const startX = centerX - borderHalfRoad;
    const endX = startX + borderRoadWidth;
    for (let y = centerY; y < height; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          occupiedMapBurg[y * width + x] = 1;
        }
      }
    }
  }
  if (borderDirs.east) {
    const startY = centerY - borderHalfRoad;
    const endY = startY + borderRoadWidth;
    for (let x = centerX; x < width; x++) {
      for (let y = startY; y < endY; y++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          occupiedMapBurg[y * width + x] = 1;
        }
      }
    }
  }
  if (borderDirs.west) {
    const startY = centerY - borderHalfRoad;
    const endY = startY + borderRoadWidth;
    for (let x = 0; x <= centerX; x++) {
      for (let y = startY; y < endY; y++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          occupiedMapBurg[y * width + x] = 1;
        }
      }
    }
  }
  generateInternalRoadsFromBorders(mapData, width, height, borderDirs, roadTile, dashedLines, occupiedMapBurg, rng);

  // --- Configuration for Circular Layout ---
  const maxRadius = Math.min(centerX, centerY) - 5; // Max radius for roads
  const roadWidth = 3;                             // Single-tile road width for dense burgs
  const ringCount = 3 + Math.floor(rng() * 2);      // 3 to 4 main ring roads
  const spokeCount = 8 + Math.floor(rng() * 4) * 2; // 8, 10, or 12 main spokes
  const ringSpacing = maxRadius / (ringCount + 1); // Space rings evenly

  // Track occupied areas (roads)
  const roadSet = new Set();
  // Populate roadSet from internal roads marked in occupiedMapBurg
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (occupiedMapBurg[y * width + x] === 1) {
        roadSet.add(`${x},${y}`);
      }
    }
  }

  function setRoad(x, y) {
    if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return;
    // Don't overwrite border roads
    if (borderRoadOccupied[y * width + x]) return;
    const idx = calculateIndex(x, y, 0, width, height);
    mapData[idx] = roadTile;
    roadSet.add(`${x},${y}`);
  }

  // --- Step A: Draw Concentric Ring Roads ---
  dlog(`[BurgGenerator] Drawing ${ringCount} concentric rings.`);
  const ringRadii = [];

  for (let i = 1; i <= ringCount; i++) {
    const radius = Math.floor(i * ringSpacing);
    ringRadii.push(radius);

    for (let angle = 0; angle < 360; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      const x = centerX + radius * Math.cos(rad);
      const y = centerY + radius * Math.sin(rad);
      
      // Use a brush to draw the road wider
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          setRoad(Math.floor(x + dx), Math.floor(y + dy));
        }
      }
    }
  }

  // --- Step B: Draw Radial Spokes ---
  dlog(`[BurgGenerator] Drawing ${spokeCount} radial spokes.`);
  const spokeAngles = [];

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i * 360) / spokeCount + (rng() - 0.5) * 10; // Add slight randomness
    spokeAngles.push(angle);
    const rad = (angle * Math.PI) / 180;

    for (let r = 0; r < maxRadius; r++) {
      const x = centerX + r * Math.cos(rad);
      const y = centerY + r * Math.sin(rad);

      // Draw the road
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          setRoad(Math.floor(x + dx), Math.floor(y + dy));
        }
      }
    }
  }

  // --- Step C: Identify Curved Building Lots (Zoning Blocks) ---
  const buildingLots = [];
  const minLotSize = 5; // Minimum size for a building lot
  const lotOverlap = new Array(width * height).fill(false); // To prevent lot overlap

  /**
   * Finds a spot within a region defined by two radii and two angles.
   * Tries to center a lot between roads without overlapping.
   */
  function findLotInSegment(r1, r2, a1, a2) {
    // Calculate angular and radial center
    const avgRadius = (r1 + r2) / 2;
    const avgAngleRad = ((a1 + a2) / 2) * (Math.PI / 180);
    
    // Calculate lot center position
    const cx = centerX + avgRadius * Math.cos(avgAngleRad);
    const cy = centerY + avgRadius * Math.sin(avgAngleRad);
    
    const lotSize = minLotSize + Math.floor(rng() * 5); // 5x5 to 9x9

    // Check the lot area for road or existing lot overlap
    const halfSize = Math.floor(lotSize / 2);
    const startX = Math.floor(cx - halfSize);
    const startY = Math.floor(cy - halfSize);
    
    // Strict Road/Overlap Check
    for (let y = startY; y < startY + lotSize; y++) {
      for (let x = startX; x < startX + lotSize; x++) {
        const key = `${x},${y}`;
        if (roadSet.has(key) || lotOverlap[y * width + x]) {
          return null; // Overlaps with road or another lot
        }
      }
    }
    
    // Mark as occupied by a lot
    for (let y = startY; y < startY + lotSize; y++) {
      for (let x = startX; x < startX + lotSize; x++) {
        lotOverlap[y * width + x] = true;
      }
    }

    // Lot found
    return { x: startX, y: startY, w: lotSize, h: lotSize };
  }


  // 1. Center Lot (Town Square/Castle)
  const centerLotSize = 12 + Math.floor(rng() * 4);
  const centerLotX = centerX - Math.floor(centerLotSize / 2);
  const centerLotY = centerY - Math.floor(centerLotSize / 2);
  
  // Check for road collision in center
  let centerRoadCollision = false;
  for (let y = centerLotY; y < centerLotY + centerLotSize; y++) {
      for (let x = centerLotX; x < centerLotX + centerLotSize; x++) {
          if (roadSet.has(`${x},${y}`)) {
              centerRoadCollision = true;
              break;
          }
      }
  }
  
  if (!centerRoadCollision) {
       buildingLots.push({
          x: centerLotX,
          y: centerLotY,
          w: centerLotSize,
          h: centerLotSize,
          isCenter: true // Flag for placing key prefabs (castle/town hall)
      });
      
      // Mark center as occupied by a lot
      for (let y = centerLotY; y < centerLotY + centerLotSize; y++) {
          for (let x = centerLotX; x < centerLotX + centerLotSize; x++) {
              lotOverlap[y * width + x] = true;
          }
      }
  }


  // 2. Ring Segments (The main city)
  const allAngles = spokeAngles.sort((a, b) => a - b);

  for (let r = 0; r < ringRadii.length; r++) {
    const r1 = r === 0 ? roadWidth + 2 : ringRadii[r - 1] + roadWidth + 2; // Inner radius (start of segment)
    const r2 = ringRadii[r] - roadWidth - 2; // Outer radius (end of segment)
    
    // Ensure segment is wide enough
    if (r2 <= r1 + minLotSize) continue;

    for (let a = 0; a < allAngles.length; a++) {
      const a1 = allAngles[a];
      let a2 = allAngles[(a + 1) % allAngles.length];
      
      // Handle wrap-around case (360 -> 0)
      if (a2 < a1) a2 += 360; 

      // Divide the segment into 1-2 lots radially
      const segmentRadialLength = r2 - r1;
      const lotGap = 2; 

      // Try two lots
      const rMid = r1 + Math.floor(segmentRadialLength * 0.5) - lotGap;
      
      // Lot 1 (Inner)
      const lot1 = findLotInSegment(r1 + lotGap, rMid, a1, a2);
      if (lot1) buildingLots.push(lot1);

      // Lot 2 (Outer)
      const lot2 = findLotInSegment(rMid + lotGap*2, r2, a1, a2);
      if (lot2) buildingLots.push(lot2);
    }
  }

  // --- Step D: Prefab Application ---

  if (biome && biome.prefabs && biome.prefabs.length > 0) {
    dlog(`[BurgGenerator] Applying prefabs to burg with ${buildingLots.length} circular lots.`);
    const worldCoords = allOtherData?.worldCoords || { x: 0, y: 0 };

    // Pass building lots as placement hints
    allOtherData.blockHints = buildingLots;
    allOtherData.singlePrefabPerBlock = true; // Place exactly 1 prefab per lot
    allOtherData.strictNoRoadOverlap = true; // Enforce: no overlap with roads

    if (window.ProceduralMapPrefabs && window.ProceduralMapPrefabs.applyPrefabsToMap) {
      try {
        window.ProceduralMapPrefabs.applyPrefabsToMap(mapData, biome.name, worldCoords, allOtherData);
        // This lot-aligned placement takes priority over the generic pass
        // DataManager.loadMapData would otherwise still run on this array.
        window.ProceduralMapPrefabs.markPrefabbed(mapData);
        dlog(`[BurgGenerator] Prefabs applied.`);
      } catch (e) {
        console.warn(`[BurgGenerator] Error: ${e.message}`);
      }
    }
  }

  // --- Step D.5: Street dressing ---------------------------------------------
  // A burg is a smaller town on the same tileset, so it gets the same streets
  // the city does, only quieter: fewer bins and lamps, one bus stop, more green.
  // Its bookkeeping is its own (roads live in roadSet, lots in lotOverlap), which
  // is exactly why the dressing pass takes them as callbacks.
  {
    const burgCtx = {
      mapData, width, height, allFeatures, rng, seed,
      // The overgrowth pass asks the tileset itself which plants are
      // walk-through, so it can never seal a street off (see cityOvergrowth).
      tilesetId: biome && biome.tilesetId,
      isRoad: (x, y) => roadSet.has(`${x},${y}`),
      isOccupied: (x, y) =>
        x < 0 || y < 0 || x >= width || y >= height ||
        roadSet.has(`${x},${y}`) || lotOverlap[y * width + x],
      mark: (x, y) => {
        if (x >= 0 && x < width && y >= 0 && y < height) lotOverlap[y * width + x] = true;
      },
      openBase: cityTileSet(
        ["Grass", "GrassFlower", "GrassDark", "GrassJungle", "GrassRock", "DirtGrass",
          "Dirt", "Sidewalk", "Pavement", "Sand", "Snow", "Mud", "Beach", "Salt"],
        allFeatures
      ),
    };
    burgCtx.openBase.add(baseTile);
    dressCityStreets(burgCtx, {
      furnitureDensity: 0.24,
      streetTrees: 16,
      busStops: 1,
      greenery: 0.16,
      litter: 6 + Math.floor(rng() * 8),
      camps: rng() < 0.45 ? 1 : 0,
    });
  }

  // --- Step E.1: Directional Beach Generation ---
  addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng);

  // --- Step E.2: RoadPole markers at road intersection corners ---
  // Burg tracks roads in roadSet and building lots in lotOverlap (occupiedMapBurg
  // only holds border/internal roads), so occupancy is derived from both here.
  placeRoadPolesAtIntersections(
    mapData, width, height, allFeatures, biome, seed,
    (x, y) => roadSet.has(`${x},${y}`),
    (x, y) => roadSet.has(`${x},${y}`) || lotOverlap[y * width + x],
    (x, y) => { lotOverlap[y * width + x] = true; }
  );

  // --- Step E: Water/Region Data ---
  const regiondata = new Array(width * height).fill(0);
  let waterTileIds = new Set();
  ["Water", "Ocean", "Beach"].forEach(f => {
    if (allFeatures[f]) allFeatures[f].forEach(v => { if(v.type==='single') waterTileIds.add(v.tileId); });
  });

  for (let i = 0; i < width * height; i++) {
    if (waterTileIds.has(mapData[i])) regiondata[i] = 99;
  }
  mapData.regiondata = regiondata;

  return mapData;
}

  // ===========================================================================
  // NAMING
  // ===========================================================================
  // Nothing underground used to have a name: the banner over a stairway read
  // "Loot Cellar" whichever cellar it was. A structure is named from its own
  // bank of patterns and words, so a mine and an ossuary never sound alike,
  // and the name is derived rather than stored: (world seed, world square,
  // entrance tile, structure) always composes the same one, so a place the
  // party walks back into a hundred hours later is still called what it was.
  function structureNameFor(structureKey, salt) {
    const S = structureFor(structureKey);
    const fallback = () => (window.BiomeNames
      ? window.BiomeNames.display(structureKey)
      : String(structureKey || ""));
    const id = S && S.name;
    const T = window.T;
    if (!id || !T || typeof T.pool !== "function") return fallback();
    const patterns = T.pool("Structures.name." + id + ".pattern");
    if (!patterns || !patterns.length) return fallback();

    let h = (salt | 0) >>> 0;
    if (Utils2 && typeof Utils2.getWorldSeed === "function") {
      h = (h ^ (Utils2.getWorldSeed() >>> 0)) >>> 0;
    }
    const pg = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._procGenData : null;
    if (pg) {
      h = (h ^ Math.imul(pg.originX | 0, 73856093) ^ Math.imul(pg.originY | 0, 19349663)) >>> 0;
    }
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    const rng = createSeededRandom(h);

    const pick = (bank) => {
      const p = T.pool("Structures.name." + id + "." + bank);
      return (p && p.length) ? String(p[Math.floor(rng() * p.length)]) : "";
    };
    const pattern = String(patterns[Math.floor(rng() * patterns.length)]);
    const out = pattern.replace(/\{(\w+)\}/g, (m, k) => pick(k)).replace(/\s+/g, " ").trim();
    return out || fallback();
  }

  // ===== EXPORT DUNGEON FUNCTIONS =====

  // The catalogue is the one place that knows what a structure is. Everything
  // downstream (the forced-biome command, the chest and trap passes, the
  // encounter spawner, the puzzle placer, the entrance roll) reads it from here
  // instead of keeping a list of its own.
  window.StructureNames = { nameFor: structureNameFor };

  window.ProcGenDungeon = {
    // The year-driven overgrowth pass, for the generators that have no city
    // dressing context of their own (the road biome). See cityOvergrowth.
    overgrowMapData,
    overgrowthFactor: cityOvergrowthFactor,
    structure: structureFor,
    structures: () => STRUCTURES.slice(),
    isStructure: (name) => !!structureFor(name),
    lastCarved: () => _lastCarved,
    ORNAMENTS,
    DANGER,
    isDungeonBiome,
    isVillageBiome,
    isCityBiome,
    isBurgBiome,
    getFeatureTiles,
    getRandomFeatureTile,
    isTilePassableInTileset,
    generateDungeonBiome,
    generateVillageBiome,
    generateCityBiome,
    generateBurgBiome,
    // The resumable forms of the two heaviest settlement passes: the stitched
    // window steps these so a town built ahead of the party costs a few
    // milliseconds a frame instead of a whole dropped one.
    generateVillageBiomeSteps,
    generateCityBiomeSteps,
    // The block plan a settlement is drawn from, and its debug rendering.
    planSettlementBlocks,
    settlementLayoutToString,
    VILLAGE_CELL,
    VILLAGE_GRID
  };
})();