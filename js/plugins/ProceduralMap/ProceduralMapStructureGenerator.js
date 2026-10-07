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

  // ===== COASTLINE =====

  /**
   * The settlement's shore: sea, sand, seashells and the diagonal corners,
   * drawn by the same shared coastline every other square uses
   * (ProcGenBeach.drawWaterEdges), so a town meets the fields and the beach
   * next to it tile for tile. It used to draw a shore of its own, shallower,
   * cornerless and tied to nothing, which left a band of water or a straight
   * wall of grass against the sea on every seam a town shared with the coast.
   *
   * The sea is capped shallower than in open country (SETTLEMENT_MAX_DEPTH) so
   * the streets survive, and a prefab the settlement already stood on its lots
   * keeps its cells: the shoreline is laid after the lots.
   */
  function addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng, worldCoords) {
    const BeachGen = window.ProcGenBeach;
    if (!adjacentBiomes || !BeachGen || !BeachGen.drawWaterEdges) return;

    let waterTiles = [];
    for (const featureName of ["Water", "Ocean", "Beach"]) {
      waterTiles = getFeatureTiles(featureName, allFeatures) || [];
      if (waterTiles.length > 0) break;
    }
    if (waterTiles.length === 0) return;

    const prefabMask = mapData.prefabMask;
    const opts = settlementCoastOptions(worldCoords);
    opts.keep = prefabMask ? (x, y) => !!prefabMask[y * width + x] : null;
    BeachGen.drawWaterEdges(
      mapData, waterTiles, adjacentBiomes, Math.floor(rng() * 0x7fffffff), width, height, rng, null, allFeatures, "",
      opts
    );
  }

  /** Where a settlement's shoreline is anchored and how deep it may cut. */
  function settlementCoastOptions(worldCoords) {
    const pg = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData;
    const cache = pg && pg.biomeCoordinateCache;
    const wc = worldCoords || { x: pg ? pg.worldX || 0 : 0, y: pg ? pg.worldY || 0 : 0 };
    const diagonalBiomes = cache && Utils2.checkDiagonalMapBiomesFromCache
      ? Utils2.checkDiagonalMapBiomesFromCache(wc.x || 0, wc.y || 0, cache)
      : null;
    const BeachGen = window.ProcGenBeach;
    return {
      worldCoords: wc,
      diagonalBiomes,
      maxDepth: BeachGen ? BeachGen.SETTLEMENT_MAX_DEPTH : undefined,
    };
  }

  /**
   * The sea addDirectionalBeach is going to lay over this settlement, handed
   * to the prefab placer before the lots are built (allOtherData.seaMask). The
   * shoreline is laid after the lots and spares whatever stands on them, so
   * without this a lot on the waterline came out as a house in the sea.
   */
  function predictSettlementSea(width, height, adjacentBiomes, worldCoords) {
    const BeachGen = window.ProcGenBeach;
    if (!adjacentBiomes || !BeachGen || !BeachGen.predictCoastWater) return null;
    try {
      return BeachGen.predictCoastWater(adjacentBiomes, width, height, settlementCoastOptions(worldCoords));
    } catch (e) {
      return null;
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
  //   walls       how its walls came to be (WALL STYLES) and what of
  //   ecology     the surface families whose creatures it shelters, for the
  //               quest system's "is this creature native to the site" only.
  //               It does NOT tilt where the structure opens: that roll is by
  //               weight alone, under any surface at all.
  //   enemy       who lives there, and how dangerous it is
  //
  // Which terrain feature opens onto a structure is NOT written here: it is
  // the `access` key of the structure's own biome in Biomes.json (DoorDungeon,
  // StairsDown, StairsUp, or Cave: a natural cave only at a cave mouth), read through
  // entrancesOf. A building is behind a dungeon door, a crypt down a stairway,
  // a temple up one. Every structure can turn up under any surface at all,
  // field or desert alike, by its catalogue weight; an empty list means the
  // place is never rolled (the Sewer is the Grate's alone).
  const DANGER = { SAFE: "safe", ORDINARY: "ordinary", HOSTILE: "hostile", DEADLY: "deadly" };

  // i18n-ignore-start  biome ids, layout/rule/feature names and enemy tags: every
  // one of these is a database id, never text the player sees. What IS shown -
  // the structure's display name and its rolled proper name - comes from
  // js/i18n/<lang>/plugins/Biomes.json and Structures.json.
  const STRUCTURES = [
    // --- the five that already existed, reworked ---------------------------
    {
      key: "Dungeon", layout: "bsp", weight: 24, name: "dungeon",
      ecology: ["dead", "urban", "mountain", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "DungeonFloor", "Dirt"],
                 rim: ["DungeonWall", "CaveWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone"] },
      patterns: ["border", "checker", "runner", "none", "none"],
      ornaments: ["braziers", "stoneRims", "statuePairs"],
      dressing: { floor: 0.05, wall: 0.1 },
      enemy: { biomes: ["Dungeon", "Abandoned", "Ruins"], cap: 4, boss: true },
      chests: [4, 7],
      hazards: true,
    },
    {
      key: "Crypt", layout: "tombs", weight: 20, name: "crypt",
      ecology: ["dead", "rural", "desert"],
      danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Dirt", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone", "sandstone"] },
      patterns: ["border", "medallion", "none"],
      ornaments: ["nicheGraves", "bonePiles", "candleRing"],
      dressing: { floor: 0.06, wall: 0.1 },
      enemy: { biomes: ["Crypt", "Graveyard"], archetypes: ["Undead", "Skeleton", "Ghost", "ConstructedUndead", "Vampire"], cap: 4, boss: true },
      chests: [4, 7],
      hazards: true,
    },
    {
      key: "LootCellar", layout: "cellar", weight: 26, name: "cellar",
      ecology: ["rural", "urban", "dead"],
      danger: DANGER.SAFE,
      palette: { main: ["DungeonFloor"], accents: ["WoodenFloor", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["wood", "stone"] },
      patterns: ["border", "none", "none"],
      ornaments: ["cratePiles", "braziers"],
      dressing: { floor: 0.08, wall: 0.07 },
      enemy: { biomes: ["Sewer", "Abandoned"], cap: [0, 1], boss: false },
      chests: [1, 2],
    },
    {
      key: "CaveDen", layout: "cavern", weight: 20, name: "den",
      ecology: ["mountain", "wood", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["CaveFloor"], accents: ["Dirt"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["rock", "redrock"] },
      patterns: ["none"],
      ornaments: ["bonePiles", "rockFall"],
      dressing: { floor: 0.12, wall: 0.1 },
      enemy: { biomes: ["Cave", "Underdark"], cap: 8, boss: false, uniform: true },
      chests: [0, 1],
    },
    {
      key: "TempleInside", layout: "temple", weight: 8, name: "temple",
      ecology: ["dead", "weird", "wood"],
      danger: DANGER.DEADLY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "Carpet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["sandstone", "stone"] },
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
      ecology: [],
      danger: DANGER.ORDINARY,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "CaveFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick"] },
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
      ecology: [],
      danger: DANGER.HOSTILE,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Parquet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone", "brick"] },
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
      ecology: ["dead", "urban", "desert"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["DungeonFloor", "CaveFloor"],
                 rim: ["CaveWall", "DungeonWall"], wall: "dungeon" },
      walls: { style: "hewn", materials: ["rock", "stone"] },
      patterns: ["none", "speckle"],
      ornaments: ["nicheGraves", "bonePiles", "candleRing"],
      dressing: { floor: 0.09, wall: 0.12 },
      enemy: { biomes: ["Crypt", "Graveyard", "Underdark"], archetypes: ["Undead", "Skeleton", "Ghost", "Bat", "Spider"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "Mineshaft", layout: "drifts", weight: 16, name: "mine",
      ecology: ["mountain", "desert", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["CaveFloor", "WoodenFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "hewn", materials: ["rock", "redrock"] },
      patterns: ["runner", "none"],
      ornaments: ["pitProps", "oreVeins", "railLine", "cratePiles"],
      dressing: { floor: 0.07, wall: 0.1 },
      enemy: { biomes: ["Mines", "Underdark"], archetypes: ["Gnome", "Golem", "Insectoid", "CrystalEntity", "Bat"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "CaveFrozen", layout: "cavern", weight: 12, name: "frozenCave",
      ecology: ["ice"],
      danger: DANGER.HOSTILE,
      palette: { main: ["CaveFloor"], accents: ["Salt", "Pavement"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["rock"] },
      patterns: ["speckle", "none"],
      ornaments: ["iceSpikes", "rockFall", "crystalClusters"],
      dressing: { floor: 0.1, wall: 0.08 },
      enemy: { biomes: ["CaveIce", "Ice", "Permafrost", "MountainIce"], cap: 5, boss: true },
      chests: [1, 3],
    },
    {
      key: "Cistern", layout: "piers", weight: 12, name: "cistern",
      ecology: ["wet", "urban", "rural"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Pavement"], accents: ["DungeonFloor", "CaveFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone", "brick"] },
      patterns: ["border", "checker", "none"],
      ornaments: ["waterLanes", "columnRows", "puddles"],
      dressing: { floor: 0.05, wall: 0.13 },
      enemy: { biomes: ["CaveFlooded", "SeaBed", "Sewer"], cap: 5, boss: true },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "FungalWarren", layout: "warren", weight: 14, name: "fungal",
      ecology: ["wood", "wet", "mountain"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Dirt"], accents: ["CaveFloor", "Grass"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["moss"] },
      patterns: ["speckle", "none"],
      ornaments: ["mushroomBeds", "vineCurtains", "puddles"],
      dressing: { floor: 0.14, wall: 0.1 },
      enemy: { biomes: ["Mushroom", "Underdark", "Swamp"], archetypes: ["Plant", "Mushroom", "Insectoid", "Slime", "InsectSwarm"], cap: 6, boss: true },
      chests: [1, 3],
    },
    {
      key: "CrystalCavern", layout: "chambers", weight: 10, name: "crystal",
      ecology: ["mountain", "ice", "weird"],
      danger: DANGER.HOSTILE,
      palette: { main: ["CaveFloor"], accents: ["Salt", "Pavement"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["rock"] },
      patterns: ["speckle", "none"],
      ornaments: ["crystalClusters", "oreVeins"],
      dressing: { floor: 0.1, wall: 0.09 },
      enemy: { biomes: ["Crystals", "Underdark", "Mines"], archetypes: ["CrystalEntity", "Golem", "Elemental", "Gnome"], cap: 5, boss: true },
      chests: [2, 4],
    },
    {
      key: "Oubliette", layout: "cells", weight: 11, name: "oubliette",
      ecology: ["dead", "urban", "mountain"],
      danger: DANGER.HOSTILE,
      palette: { main: ["DungeonFloor"], accents: ["Pavement", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone"] },
      patterns: ["border", "none"],
      ornaments: ["cellDoors", "chains", "bonePiles"],
      dressing: { floor: 0.07, wall: 0.14 },
      enemy: { biomes: ["Dungeon", "Abandoned", "Crypt"], archetypes: ["Humanoid", "Undead", "Ghost", "ArmoredKnight"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "SunkenLibrary", layout: "halls", weight: 7, name: "library",
      ecology: ["weird", "dead", "urban"],
      danger: DANGER.DEADLY,
      palette: { main: ["Parquet"], accents: ["Carpet", "WoodenFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick", "wood"] },
      patterns: ["runner", "border", "medallion"],
      ornaments: ["shelfStacks", "readingDesks", "candleRing"],
      dressing: { floor: 0.06, wall: 0.1 },
      enemy: { biomes: ["Eldritch", "Limbo", "Abandoned"], archetypes: ["Ghost", "Voidspawn", "Humanoid", "Demon"], cap: 4, boss: false },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "UnderForge", layout: "grid", weight: 9, name: "forge",
      ecology: ["volcanic", "mountain", "urban"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Metal"], accents: ["DungeonFloor", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick", "stone"] },
      patterns: ["checker", "border", "none"],
      ornaments: ["lavaFlow", "forgeGear", "chains"],
      dressing: { floor: 0.08, wall: 0.12 },
      enemy: { biomes: ["Volcano", "Hell", "Factory", "FactoryInside"], archetypes: ["FireElemental", "Golem", "Demon", "Robot"], cap: 5, boss: true },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "ColdWarBunker", layout: "grid", weight: 10, name: "bunker",
      ecology: ["urban", "rural", "ice"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Metal"], accents: ["TechnoFloor", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["checker", "border", "none"],
      ornaments: ["techPanels", "cratePiles", "railLine"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Factory", "FactoryInside", "Spacecenter", "Abandoned"], archetypes: ["Robot", "Drone", "RoboticDefender", "Turret", "Humanoid"], cap: 5, boss: true },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "BuriedLab", layout: "grid", weight: 8, name: "lab",
      ecology: ["urban", "weird"],
      danger: DANGER.HOSTILE,
      palette: { main: ["TechnoFloor"], accents: ["Metal", "Techno"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["checker", "border"],
      ornaments: ["glassWalls", "techPanels", "readingDesks"],
      dressing: { floor: 0.07, wall: 0.11 },
      enemy: { biomes: ["Laboratory", "Spacecenter", "Factory"], archetypes: ["Robot", "Mutant", "Slime", "Bacterial", "Drone"], cap: 5, boss: true },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "ProfaneShrine", layout: "rings", weight: 6, name: "shrine",
      ecology: ["weird", "dead", "volcanic"],
      danger: DANGER.DEADLY,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick", "stone"] },
      patterns: ["medallion", "border"],
      ornaments: ["pentagramCentre", "candleRing", "bloodStains", "statuePairs"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Hell", "Eldritch", "Limbo"], archetypes: ["Demon", "Voidspawn", "Vampire", "TentacledCreature", "Ghost"], cap: 4, boss: false },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "SmugglerTunnel", layout: "tube", weight: 14, name: "smuggler",
      ecology: ["rural", "urban", "wet"],
      danger: DANGER.SAFE,
      palette: { main: ["Dirt"], accents: ["WoodenFloor", "CaveFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "hewn", materials: ["redrock", "rock"] },
      patterns: ["none", "runner"],
      ornaments: ["cratePiles", "pitProps"],
      dressing: { floor: 0.09, wall: 0.08 },
      enemy: { biomes: ["Abandoned", "Docks", "City"], archetypes: ["Humanoid", "Beast"], cap: [0, 2], boss: false },
      chests: [2, 3],
    },
    {
      key: "SeaGrotto", layout: "cavern", weight: 11, name: "grotto",
      ecology: ["wet"],
      danger: DANGER.ORDINARY,
      palette: { main: ["CaveFloor"], accents: ["Sand", "Dirt"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["rock"] },
      patterns: ["speckle", "none"],
      ornaments: ["tidePool", "shellBeds", "rockFall"],
      dressing: { floor: 0.11, wall: 0.08 },
      enemy: { biomes: ["CaveFlooded", "SeaBed", "Beach", "Ocean"], archetypes: ["AquaticFish", "Crustacean", "Octopus", "Turtle", "Serpent"], cap: 5, boss: true },
      chests: [1, 3],
    },
    {
      key: "LavaTube", layout: "tube", weight: 7, name: "lavaTube",
      ecology: ["volcanic", "mountain"],
      danger: DANGER.DEADLY,
      palette: { main: ["CaveFloor"], accents: ["Dirt", "Metal"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["redrock"] },
      patterns: ["speckle", "none"],
      ornaments: ["lavaFlow", "rockFall", "crystalClusters"],
      dressing: { floor: 0.08, wall: 0.08 },
      enemy: { biomes: ["Volcano", "Hell"], archetypes: ["FireElemental", "Hellhound", "Dragon", "Demon", "Elemental"], cap: 4, boss: false },
      chests: [1, 3],
    },
    {
      key: "Barrow", layout: "mound", weight: 10, name: "barrow",
      ecology: ["rural", "dead", "ice", "mountain"],
      danger: DANGER.HOSTILE,
      palette: { main: ["Dirt"], accents: ["DungeonFloor", "Grass"],
                 rim: ["CaveWall", "DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone"] },
      patterns: ["border", "medallion", "none"],
      ornaments: ["nicheGraves", "statuePairs", "hoard", "bonePiles"],
      dressing: { floor: 0.08, wall: 0.1 },
      enemy: { biomes: ["Graveyard", "Crypt", "Highlands"], archetypes: ["Undead", "Skeleton", "ArmoredKnight", "Ghost", "Totem"], cap: 4, boss: true },
      chests: [3, 5],
      hazards: true,
    },
    {
      key: "MetroStation", layout: "platform", weight: 9, name: "metro",
      ecology: ["urban"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Pavement"], accents: ["Metal", "DungeonFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster", "stone"] },
      patterns: ["border", "checker", "none"],
      ornaments: ["railLine", "platformFittings", "techPanels"],
      dressing: { floor: 0.07, wall: 0.12 },
      enemy: { biomes: ["Metro", "City", "Abandoned", "Sewer"], archetypes: ["Humanoid", "TrashCreature", "Robot", "Slime", "Ghost"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "SaltWorks", layout: "drifts", weight: 9, name: "salt",
      ecology: ["desert", "wet", "ice"],
      danger: DANGER.ORDINARY,
      palette: { main: ["Salt"], accents: ["Dirt", "CaveFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "hewn", materials: ["rock"] },
      patterns: ["border", "runner", "none"],
      ornaments: ["pitProps", "oreVeins", "cratePiles", "puddles"],
      dressing: { floor: 0.07, wall: 0.09 },
      enemy: { biomes: ["Mines", "Desert", "SaltFlats", "Underdark"], archetypes: ["Golem", "Crustacean", "Elemental", "Insectoid"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    // --- the interior biomes, generated as structures ------------------------
    // These were already biomes (an authored map wears them as its <Biome:>
    // tag, which is what their enemy rosters were written for). Down here they
    // are places the party finds behind a dungeon door, down a stairway or up
    // one (Biomes.json `access`). `ownRoster` keeps an authored map tagged
    // with one of them on its own encounters: the catalogue's numbers are for
    // the generated version only.
    {
      key: "HardwareStore", layout: "shopfloor", weight: 9, name: "hardware",
      ecology: ["urban", "rural"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Pavement"], accents: ["Metal", "DungeonFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster", "brick"] },
      patterns: ["checker", "border", "none"],
      ornaments: ["cratePiles", "techPanels"],
      dressing: { floor: 0.03, wall: 0.06 },
      enemy: { biomes: ["HardwareStore", "City"], cap: 3, boss: false },
      chests: [1, 3],
    },
    {
      key: "GroceryStore", layout: "shopfloor", weight: 8, name: "grocery",
      ecology: ["urban"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Pavement"], accents: ["TechnoFloor", "Metal"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["checker", "none"],
      ornaments: ["cratePiles", "puddles"],
      dressing: { floor: 0.03, wall: 0.05 },
      enemy: { biomes: ["GroceryStore", "City"], cap: 3, boss: false },
      chests: [1, 2],
    },
    {
      key: "Store", layout: "shopfloor", weight: 8, name: "shop",
      ecology: ["urban", "rural"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Parquet"], accents: ["Carpet", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster", "brick", "wood"] },
      patterns: ["border", "runner", "none"],
      ornaments: ["cratePiles"],
      dressing: { floor: 0.03, wall: 0.05 },
      enemy: { biomes: ["Store", "City"], cap: 3, boss: false },
      chests: [1, 3],
    },
    {
      key: "Hospital", layout: "ward", weight: 8, name: "hospital",
      ecology: ["urban"],
      danger: DANGER.HOSTILE, ownRoster: true,
      palette: { main: ["TechnoFloor"], accents: ["Pavement", "Metal"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["border", "checker", "none"],
      ornaments: ["techPanels", "bloodStains"],
      dressing: { floor: 0.04, wall: 0.08 },
      enemy: { biomes: ["Hospital", "Laboratory"], archetypes: ["Mutant", "Undead", "Ghost", "Robot"], cap: 4, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "Clinic", layout: "ward", weight: 7, name: "clinic",
      ecology: ["urban", "rural"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["TechnoFloor"], accents: ["Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["border", "none"],
      ornaments: ["techPanels"],
      dressing: { floor: 0.03, wall: 0.06 },
      enemy: { biomes: ["Clinic", "Hospital"], cap: 3, boss: false },
      chests: [1, 3],
    },
    {
      key: "Tavern", layout: "taproom", weight: 9, name: "tavern",
      ecology: ["rural", "urban"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["WoodenFloor"], accents: ["Parquet", "Carpet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["wood", "stone"] },
      patterns: ["runner", "border", "none"],
      ornaments: ["cratePiles", "braziers"],
      dressing: { floor: 0.04, wall: 0.07 },
      enemy: { biomes: ["Tavern", "Village"], archetypes: ["Humanoid", "Beast"], cap: 3, boss: false },
      chests: [1, 3],
    },
    {
      key: "Restaurant", layout: "taproom", weight: 7, name: "restaurant",
      ecology: ["urban"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Parquet"], accents: ["Carpet", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster", "brick"] },
      patterns: ["checker", "border", "none"],
      ornaments: ["cratePiles"],
      dressing: { floor: 0.03, wall: 0.05 },
      enemy: { biomes: ["Restaurant", "City"], cap: 3, boss: false },
      chests: [1, 2],
    },
    {
      key: "Farmhouse", layout: "house", weight: 8, name: "farmhouse",
      ecology: ["rural"],
      danger: DANGER.SAFE, ownRoster: true,
      palette: { main: ["WoodenFloor"], accents: ["Dirt", "Carpet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["wood", "stone"] },
      patterns: ["runner", "none"],
      ornaments: ["cratePiles"],
      dressing: { floor: 0.05, wall: 0.06 },
      enemy: { biomes: ["Farmhouse", "Farm"], cap: [1, 3], boss: false },
      chests: [1, 3],
    },
    {
      key: "HousesInside", layout: "house", weight: 9, name: "house",
      ecology: ["urban", "rural"],
      danger: DANGER.SAFE, ownRoster: true,
      palette: { main: ["WoodenFloor"], accents: ["Carpet", "Parquet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster", "wood"] },
      patterns: ["border", "runner", "none"],
      ornaments: ["cratePiles"],
      dressing: { floor: 0.03, wall: 0.05 },
      enemy: { biomes: ["HousesInside", "Houses"], cap: [1, 3], boss: false },
      chests: [1, 3],
    },
    {
      key: "AbandonedInside", layout: "house", weight: 10, name: "abandoned",
      ecology: ["dead", "urban"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["DungeonFloor"], accents: ["Dirt", "WoodenFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "ruined", materials: ["brick", "plaster", "stone"] },
      patterns: ["speckle", "none"],
      ornaments: ["rockFall", "vineCurtains", "puddles"],
      dressing: { floor: 0.08, wall: 0.1 },
      enemy: { biomes: ["AbandonedInside", "Abandoned", "Ruins"], cap: 4, boss: true },
      chests: [1, 3],
      hazards: true,
    },
    {
      key: "Basement", layout: "house", weight: 9, name: "basement",
      ecology: ["urban", "rural"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Pavement"], accents: ["DungeonFloor", "Dirt"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick", "plaster"] },
      patterns: ["border", "none"],
      ornaments: ["cratePiles", "puddles"],
      dressing: { floor: 0.05, wall: 0.08 },
      enemy: { biomes: ["Basement", "Sewer"], cap: 3, boss: false },
      chests: [1, 3],
    },
    {
      key: "Laboratory", layout: "grid", weight: 7, name: "laboratory",
      ecology: ["urban", "weird"],
      danger: DANGER.HOSTILE, ownRoster: true,
      palette: { main: ["TechnoFloor"], accents: ["Metal", "Techno"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["plaster"] },
      patterns: ["checker", "border"],
      ornaments: ["glassWalls", "techPanels"],
      dressing: { floor: 0.05, wall: 0.1 },
      enemy: { biomes: ["Laboratory", "Spacecenter"], archetypes: ["Robot", "Mutant", "Slime", "Drone"], cap: 5, boss: true },
      chests: [2, 5],
      hazards: true,
    },
    {
      key: "FactoryInside", layout: "factory", weight: 8, name: "factory",
      ecology: ["urban"],
      danger: DANGER.HOSTILE, ownRoster: true,
      palette: { main: ["Metal"], accents: ["Pavement", "DungeonFloor"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["brick", "plaster"] },
      patterns: ["checker", "none"],
      ornaments: ["forgeGear", "chains", "techPanels"],
      dressing: { floor: 0.05, wall: 0.1 },
      enemy: { biomes: ["FactoryInside", "Factory"], archetypes: ["Robot", "Golem", "Drone", "Humanoid"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "CastleInside", layout: "keep", weight: 8, name: "castle",
      ecology: ["dead", "mountain"],
      danger: DANGER.HOSTILE, ownRoster: true,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Pavement"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone"] },
      patterns: ["runner", "border", "medallion"],
      ornaments: ["braziers", "statuePairs", "columnRows"],
      dressing: { floor: 0.04, wall: 0.1 },
      enemy: { biomes: ["CastleInside", "Castle"], archetypes: ["ArmoredKnight", "Humanoid", "Undead", "Ghost"], cap: 5, boss: true },
      chests: [3, 6],
      hazards: true,
    },
    {
      key: "ChurchInside", layout: "temple", weight: 7, name: "church",
      ecology: ["dead", "rural"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["DungeonFloor"], accents: ["Carpet", "Parquet"],
                 rim: ["DungeonWall"], wall: "dungeon" },
      walls: { style: "built", materials: ["stone", "sandstone"] },
      patterns: ["runner", "medallion", "border"],
      ornaments: ["candleRing", "statuePairs"],
      dressing: { floor: 0.04, wall: 0.08 },
      enemy: { biomes: ["ChurchInside", "Graveyard"], archetypes: ["Undead", "Ghost", "Skeleton"], cap: 4, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "Mines", layout: "shaft", weight: 12, name: "mines",
      ecology: ["mountain", "desert"],
      danger: DANGER.ORDINARY, ownRoster: true,
      palette: { main: ["Dirt"], accents: ["CaveFloor", "WoodenFloor"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "hewn", materials: ["rock", "redrock"] },
      patterns: ["runner", "none"],
      ornaments: ["pitProps", "oreVeins", "railLine"],
      dressing: { floor: 0.07, wall: 0.1 },
      enemy: { biomes: ["Underdark", "Cave", "Petro cave"], archetypes: ["Gnome", "Golem", "Insectoid", "CrystalEntity", "Bat"], cap: 5, boss: true },
      chests: [2, 4],
      hazards: true,
    },
    {
      key: "Lair", layout: "cavern", weight: 8, name: "lair",
      ecology: ["mountain", "volcanic", "wood"],
      danger: DANGER.DEADLY, ownRoster: true,
      palette: { main: ["CaveFloor"], accents: ["Dirt"],
                 rim: ["CaveWall"], wall: "cave" },
      walls: { style: "natural", materials: ["redrock", "rock"] },
      patterns: ["speckle", "none"],
      ornaments: ["bonePiles", "hoard", "rockFall"],
      dressing: { floor: 0.1, wall: 0.08 },
      enemy: { biomes: ["Lair", "Cave", "Underdark"], cap: 4, boss: true },
      chests: [2, 4],
    },
  ];

  // i18n-ignore-end

  const STRUCTURE_INDEX = {};
  for (const s of STRUCTURES) STRUCTURE_INDEX[s.key.toLowerCase()] = s;

  // Biomes.json `access` names, to the entrance ids the entrance roll speaks.
  const ACCESS_IDS = { StairsDown: "stairsDown", StairsUp: "stairsUp", Cave: "cave", DoorDungeon: "doorDungeon" };
  // The terrain features that open onto a structure, off its biome's own
  // `access` key. Read on first use (the biomes are registered lazily) and
  // kept; [] until the biomes are there to be read.
  function entrancesOf(S) {
    if (!S) return [];
    if (S._entrances) return S._entrances;
    const list = (window.WorldGen && window.WorldGen.Biomes) || null;
    if (!list || !list.length) return [];
    const b = list.find((x) => x && x.name === S.key);
    S._entrances = ((b && b.access) || []).map((a) => ACCESS_IDS[a] || a);
    return S._entrances;
  }
  for (const s of STRUCTURES) {
    Object.defineProperty(s, "entrances", { get() { return entrancesOf(this); }, enumerable: false });
  }

  // The carve of the most recent structure generated (see generateDungeonBiome).
  let _lastCarved = null;
  // The same pass's rooms, wall faces and furniture plan (publishInterior).
  let _lastInterior = null;

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
   * Place sidewalks around roads
   * Scans for road tiles and paves up to `band` tiles away from them. A city
   * wears the wide default band; a village asks for band 1, because a two-ring
   * pavement laid around every lane stops reading as a pavement and reads as a
   * paved square with a village lost somewhere inside it.
   * IMPORTANT: Does not overwrite Path/PathDesert/PathIce tiles
   */function placeSidewalksAroundRoads(mapData, width, height, roadSet, sidewalkTiles, rng, pathTileIds, baseTile, band = 3) {
    if (!sidewalkTiles || sidewalkTiles.length === 0) return;

    const sidewalkTile = sidewalkTiles[0];
    const placedSidewalks = new Set();
    const pathTileSet = new Set(pathTileIds || []);
    const outer = Math.max(1, band);
    // The wide band starts one tile off the kerb; a narrow one is the kerb.
    const inner = outer >= 3 ? 2 : 1;

    for (const roadKey of roadSet) {
      const [rx, ry] = roadKey.split(',').map(Number);

      for (let dy = -outer; dy <= outer; dy++) {
        for (let dx = -outer; dx <= outer; dx++) {
          const sx = rx + dx;
          const sy = ry + dy;
          const sidewalkKey = `${sx},${sy}`;

          if (placedSidewalks.has(sidewalkKey) || roadSet.has(sidewalkKey)) continue;
          if (sx < 1 || sx >= width - 1 || sy < 1 || sy >= height - 1) continue;

          const dist = Math.max(Math.abs(dx), Math.abs(dy));

          if (dist >= inner && dist <= outer) {
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

  // The structure's own wall materials (S.walls.materials, see WALL STYLES),
  // never the whole sheet: the sheet also holds a hedge and a blank slot.
  function pickA4WallMaterial(tilesetId, rng, S) {
    const tops = A4_WALL_TOP_KINDS[tilesetId];
    if (!tops || !tops.length) return null;
    const wanted = (S && S.walls && S.walls.materials) || ["stone"];
    let pool = [];
    for (const m of wanted)
      for (const k of A4_WALL_MATERIALS[m] || []) if (tops.indexOf(k) >= 0 && pool.indexOf(k) < 0) pool.push(k);
    if (!pool.length) pool = A4_WALL_MATERIALS.stone.filter((k) => tops.indexOf(k) >= 0);
    if (!pool.length) return null;
    const top = pool[Math.floor(rng() * pool.length)];
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
      wallA4: pickA4WallMaterial(tilesetId, rng, S),
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

  // ===========================================================================
  // WALL STYLES AND MATERIALS
  // ===========================================================================
  // A structure's walls came to be in one of three ways, and the catalogue
  // entry says which (`walls.style`):
  //   built    masonry laid by hand: straight faces, square corners, every face
  //            the full WALL_HEIGHT, and the carve normalised so no face ever
  //            stands shorter than the one beside it
  //   ruined   built once and fallen in since (an abandoned building): the
  //            ruled plan is still there, but the walls are broken through in
  //            places, the corners crumbled and the faces two or three tiles
  //   hewn     cut through rock with tools (a mine, a smuggler's run, the
  //            catacombs): the plan is still deliberate, but its edges are
  //            chipped back into the rock and the faces come out two or three
  //            tiles tall
  //   natural  never built at all (a cave, a grotto, a lava tube): the outline
  //            is eroded by noise, bitten into by alcoves and left jagged where
  //            a built wall would be levelled, rock pillars are kept standing,
  //            and the faces rise and fall along the rock between one and three
  //            tiles
  // `walls.materials` names families of A4 wall autotiles on the Dungeon
  // tileset's MightyPack Int-A4 sheet (see A4_WALL_TOP_KINDS for how a top
  // kind pairs with its side). The hedge (114), the wooden palisade (98) and
  // the unpainted slot (119) are on no list: they used to be dealt out like any
  // other wall, which is how a crypt came to be walled with a privet hedge.
  const WALL_STYLES = ["built", "ruined", "hewn", "natural"];
  const A4_WALL_MATERIALS = {
    stone:     [80, 81, 82, 85, 99],
    brick:     [83, 84, 86, 87, 100, 101],
    sandstone: [102, 103],
    plaster:   [112, 113],
    wood:      [96, 97],
    rock:      [117],
    redrock:   [115, 118],
    moss:      [116],
  };

  function wallStyleOf(S) {
    const st = S && S.walls && S.walls.style;
    return WALL_STYLES.indexOf(st) >= 0 ? st : "built";
  }

  // Smooth value noise on a lattice of `cell` tiles, seeded, in [0, 1). The
  // natural wall pass reads it to decide where the rock bulges in and where it
  // has been worn back, so neighbouring tiles agree and the outline wanders
  // instead of fraying tile by tile.
  function valueNoise2D(seed, cell) {
    const hash = (ix, iy) => {
      let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = x / cell, gy = y / cell;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = smooth(gx - ix), fy = smooth(gy - iy);
      const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      const top = a + (b - a) * fx, bot = c + (d - c) * fx;
      return top + (bot - top) * fy;
    };
  }

  // ===========================================================================
  // INTERIOR FURNISHING
  // ===========================================================================
  // Every piece in js/db/Items/Furniture.json carries `interiors`: the list of
  // ProceduralInteriors it belongs in, empty for most of the catalogue. A piece
  // with a non-empty list also carries `interiorKind`, what it IS to a room (a
  // tomb, a shelf, a light, bones...). Both are written by
  // tools/build-biome-furniture.js, which reads the two tables between the
  // markers below to learn which kinds each structure's rooms ask for and which
  // eras of art each structure accepts. Keep them pure literals: the tool
  // evaluates their text.
  //
  // A ROOM is furnished from a kit, a list of lines, each one kind of thing:
  //   k     the interiorKind
  //   at    where it goes (KIND_PLACE[k] when left out)
  //   n     [min, max] pieces
  //   d     pieces per floor tile of the room, instead of n
  //   fill  for `wall`, `rows` and `colonnade`: the share of the slots used
  // A STRUCTURE names the kits its rooms take:
  //   eras     the art it accepts: old (wood, stone, iron), modern (plastic,
  //            screens, steel), occult (bones, sigils, ritual) and any (art
  //            with no period to it)
  //   main     the kit of its largest room, or of the room the layout marked
  //   deep     the kit of the room farthest from the way in
  //   passage  the kit of anything narrower than four tiles
  //   rooms    [kit, weight] for every other room
  // i18n-ignore-start  kit, kind and structure ids, never shown
  // interior-furnishing-start
  const INTERIOR_ROOMS = {
    hall:       [{ k: "light", n: [2, 4] }, { k: "banner", n: [1, 3] }, { k: "statue", n: [0, 2] }, { k: "rug", n: [0, 1] }, { k: "column", fill: 1 }, { k: "debris", d: 0.008 }],
    passage:    [{ k: "walllight", n: [0, 2] }, { k: "debris", d: 0.006 }, { k: "bones", d: 0.004 }],
    guard:      [{ k: "table", n: [1, 1] }, { k: "weapon", n: [1, 2] }, { k: "crate", n: [1, 2] }, { k: "barrel", n: [0, 2] }, { k: "bed", n: [0, 2] }, { k: "light", n: [1, 2] }],
    store:      [{ k: "crate", d: 0.08 }, { k: "barrel", n: [1, 3] }, { k: "sack", n: [1, 3] }, { k: "shelf", n: [0, 2] }, { k: "vase", n: [0, 2] }, { k: "light", n: [0, 1] }],
    cell:       [{ k: "bed", n: [0, 1] }, { k: "chain", n: [1, 2] }, { k: "bones", d: 0.03 }, { k: "debris", d: 0.02 }, { k: "bin", n: [0, 1] }],
    ossuary:    [{ k: "bones", d: 0.07 }, { k: "tomb", at: "edge", n: [1, 3] }, { k: "candle", n: [1, 2] }, { k: "headstone", at: "edge", n: [0, 2] }],
    tombs:      [{ k: "tomb", fill: 0.85 }, { k: "candle", n: [1, 4] }, { k: "vase", n: [0, 2] }, { k: "statue", n: [0, 2] }, { k: "bones", d: 0.015 }],
    shrine:     [{ k: "rug", n: [0, 1] }, { k: "altar", n: [1, 1] }, { k: "statue", n: [2, 2] }, { k: "candle", n: [2, 4] }, { k: "pew", fill: 0.8 }, { k: "banner", n: [1, 3] }, { k: "light", n: [0, 2] }],
    nave:       [{ k: "rug", n: [1, 1] }, { k: "column", fill: 1 }, { k: "pew", fill: 0.9 }, { k: "banner", n: [2, 4] }, { k: "light", n: [2, 4] }],
    sanctum:    [{ k: "altar", n: [1, 1] }, { k: "statue", n: [2, 4] }, { k: "candle", n: [2, 6] }, { k: "banner", n: [1, 2] }, { k: "relic", at: "corner", n: [0, 1] }],
    lair:       [{ k: "throne", n: [0, 1] }, { k: "bones", d: 0.05 }, { k: "treasure", n: [1, 3] }, { k: "splatter", d: 0.015 }, { k: "light", n: [1, 2] }, { k: "cage", n: [0, 1] }],
    library:    [{ k: "shelf", fill: 0.9 }, { k: "shelf", at: "stacks", fill: 0.85 }, { k: "table", n: [0, 1] }, { k: "book", d: 0.015 }, { k: "candle", n: [1, 3] }, { k: "light", n: [0, 2] }],
    study:      [{ k: "rug", n: [0, 1] }, { k: "table", n: [1, 1] }, { k: "shelf", fill: 0.5 }, { k: "book", d: 0.025 }, { k: "potion", n: [1, 3] }, { k: "candle", n: [1, 2] }, { k: "relic", at: "corner", n: [0, 1] }],
    barracks:   [{ k: "bed", n: [2, 6] }, { k: "crate", n: [1, 3] }, { k: "table", n: [0, 1] }, { k: "weapon", n: [0, 2] }, { k: "light", n: [1, 2] }],
    machine:    [{ k: "machine", fill: 0.6 }, { k: "panel", n: [1, 4] }, { k: "pipe", n: [0, 2] }, { k: "crate", n: [0, 2] }, { k: "light", n: [1, 2] }],
    control:    [{ k: "machine", fill: 0.5 }, { k: "table", n: [1, 1] }, { k: "panel", n: [2, 4] }, { k: "sign", n: [0, 1] }, { k: "light", n: [1, 2] }],
    lab:        [{ k: "specimen", fill: 0.6 }, { k: "table", at: "rows", fill: 0.6 }, { k: "machine", n: [1, 2] }, { k: "potion", d: 0.015 }, { k: "medical", n: [0, 2] }, { k: "panel", n: [1, 2] }],
    infirmary:  [{ k: "medical", n: [2, 4] }, { k: "specimen", n: [0, 2] }, { k: "table", n: [0, 1] }, { k: "panel", n: [0, 2] }, { k: "light", n: [1, 2] }],
    forge:      [{ k: "forge", n: [1, 2] }, { k: "cauldron", n: [0, 1] }, { k: "tool", n: [1, 3] }, { k: "weapon", n: [0, 2] }, { k: "barrel", n: [0, 2] }, { k: "crate", n: [0, 2] }, { k: "chain", n: [0, 2] }],
    mine:       [{ k: "ore", d: 0.04 }, { k: "timber", n: [0, 2] }, { k: "tool", n: [0, 2] }, { k: "cart", n: [0, 1] }, { k: "light", n: [1, 2] }, { k: "crate", n: [0, 2] }],
    stope:      [{ k: "prop", fill: 1 }, { k: "ore", d: 0.06 }, { k: "rock", d: 0.015 }, { k: "cart", n: [0, 2] }, { k: "tool", n: [1, 2] }, { k: "light", n: [1, 3] }, { k: "ladder", n: [0, 1] }],
    cavern:     [{ k: "stalagmite", d: 0.03 }, { k: "rock", d: 0.02 }, { k: "rock", at: "scatter", d: 0.006 }, { k: "bones", d: 0.006 }, { k: "splatter", d: 0.006 }],
    den:        [{ k: "bones", d: 0.05 }, { k: "rock", d: 0.025 }, { k: "stalagmite", d: 0.015 }, { k: "splatter", d: 0.01 }],
    grove:      [{ k: "mushroom", n: [3, 6] }, { k: "vine", n: [1, 4] }, { k: "rock", d: 0.015 }, { k: "splatter", d: 0.008 }],
    geode:      [{ k: "crystal", n: [3, 6] }, { k: "ore", d: 0.025 }, { k: "stalagmite", d: 0.015 }],
    ice:        [{ k: "ice", n: [3, 6] }, { k: "stalagmite", d: 0.02 }, { k: "bones", d: 0.006 }, { k: "crystal", n: [0, 2] }],
    grotto:     [{ k: "reef", n: [2, 4] }, { k: "shell", d: 0.025 }, { k: "rock", d: 0.025 }, { k: "splatter", d: 0.006 }],
    magma:      [{ k: "lava", n: [1, 3] }, { k: "rock", d: 0.03 }, { k: "stalagmite", d: 0.015 }, { k: "bones", n: [0, 2] }],
    camp:       [{ k: "campfire", n: [1, 1] }, { k: "bed", n: [1, 3] }, { k: "crate", n: [1, 3] }, { k: "sack", n: [1, 2] }, { k: "barrel", n: [0, 2] }, { k: "light", n: [0, 1] }],
    smuggle:    [{ k: "crate", d: 0.1 }, { k: "barrel", n: [2, 4] }, { k: "sack", n: [2, 4] }, { k: "table", n: [0, 1] }, { k: "light", n: [1, 2] }],
    hoard:      [{ k: "treasure", d: 0.04 }, { k: "crate", n: [1, 3] }, { k: "vase", n: [1, 3] }, { k: "statue", n: [0, 2] }, { k: "relic", n: [0, 1] }],
    vault:      [{ k: "rug", n: [1, 1] }, { k: "column", fill: 1 }, { k: "statue", n: [2, 2] }, { k: "banner", n: [1, 3] }, { k: "light", n: [2, 4] }, { k: "treasure", d: 0.02 }, { k: "shelf", n: [0, 2] }],
    platform:   [{ k: "pew", at: "edge", n: [2, 5] }, { k: "sign", n: [1, 3] }, { k: "vending", n: [1, 2] }, { k: "bin", n: [1, 3] }, { k: "light", n: [1, 3] }, { k: "debris", d: 0.008 }],
    ritual:     [{ k: "circle", n: [1, 1] }, { k: "candle", at: "ring", n: [4, 8] }, { k: "statue", n: [0, 2] }, { k: "splatter", d: 0.015 }, { k: "cage", n: [0, 2] }, { k: "flesh", d: 0.006 }, { k: "relic", at: "corner", n: [0, 1] }],
    pump:       [{ k: "pipe", n: [2, 5] }, { k: "machine", n: [0, 2] }, { k: "grate", n: [1, 3] }, { k: "panel", n: [0, 2] }, { k: "ladder", n: [0, 1] }, { k: "debris", d: 0.01 }],
    cistern:    [{ k: "fountain", n: [0, 1] }, { k: "vase", n: [1, 3] }, { k: "splatter", d: 0.008 }, { k: "light", n: [1, 3] }],
    // --- the shops, the houses and the working buildings ---------------------
    salesfloor: [{ k: "goods", fill: 0.9 }, { k: "shelf", fill: 0.7 }, { k: "counter", n: [1, 2] }, { k: "sign", n: [1, 3] }, { k: "bin", n: [0, 2] }, { k: "vending", n: [0, 1] }, { k: "crate", n: [1, 3] }, { k: "debris", d: 0.008 }, { k: "light", n: [1, 2] }],
    hardwarefloor: [{ k: "shelf", at: "stacks", fill: 0.9 }, { k: "shelf", fill: 0.7 }, { k: "tool", n: [2, 5] }, { k: "counter", n: [1, 2] }, { k: "crate", n: [2, 4] }, { k: "barrel", n: [1, 3] }, { k: "pipe", n: [0, 2] }, { k: "sign", n: [1, 2] }, { k: "light", n: [1, 2] }],
    office:     [{ k: "table", n: [1, 2] }, { k: "shelf", fill: 0.6 }, { k: "machine", n: [0, 1] }, { k: "panel", n: [0, 2] }, { k: "painting", n: [0, 2] }, { k: "bin", n: [0, 1] }, { k: "rug", n: [0, 1] }],
    ward:       [{ k: "medical", fill: 0.7 }, { k: "bed", at: "rows", fill: 0.7 }, { k: "panel", n: [1, 2] }, { k: "bin", n: [0, 1] }, { k: "splatter", d: 0.008 }],
    surgery:    [{ k: "medical", at: "centre", n: [1, 1] }, { k: "specimen", n: [1, 3] }, { k: "machine", n: [1, 2] }, { k: "panel", n: [1, 3] }, { k: "potion", n: [1, 3] }, { k: "splatter", d: 0.02 }],
    reception:  [{ k: "counter", n: [1, 2] }, { k: "pew", at: "edge", n: [1, 3] }, { k: "sign", n: [1, 2] }, { k: "painting", n: [0, 2] }, { k: "vase", n: [0, 2] }, { k: "bin", n: [0, 1] }],
    taproom:    [{ k: "counter", n: [1, 2] }, { k: "table", at: "rows", fill: 0.7 }, { k: "barrel", n: [2, 4] }, { k: "light", n: [2, 4] }, { k: "banner", n: [0, 2] }, { k: "painting", n: [1, 3] }, { k: "debris", d: 0.006 }],
    kitchen:    [{ k: "appliance", fill: 0.7 }, { k: "forge", n: [0, 1] }, { k: "cauldron", n: [0, 1] }, { k: "table", n: [1, 1] }, { k: "barrel", n: [1, 3] }, { k: "sack", n: [1, 3] }, { k: "vase", n: [1, 3] }],
    bedroom:    [{ k: "rug", n: [0, 1] }, { k: "bed", n: [1, 2] }, { k: "shelf", n: [1, 2] }, { k: "table", n: [0, 1] }, { k: "crate", n: [0, 2] }, { k: "candle", n: [0, 2] }, { k: "painting", n: [0, 2] }],
    parlour:    [{ k: "rug", n: [1, 1] }, { k: "table", n: [1, 1] }, { k: "shelf", fill: 0.5 }, { k: "painting", n: [1, 2] }, { k: "vase", n: [1, 2] }, { k: "light", n: [1, 2] }],
    factory:    [{ k: "machine", at: "stacks", fill: 0.8 }, { k: "machine", fill: 0.6 }, { k: "pipe", n: [2, 5] }, { k: "crate", d: 0.03 }, { k: "barrel", n: [1, 3] }, { k: "panel", n: [1, 3] }, { k: "debris", d: 0.01 }],
    workshop:   [{ k: "table", n: [1, 2] }, { k: "tool", n: [2, 4] }, { k: "shelf", fill: 0.6 }, { k: "crate", n: [1, 3] }, { k: "barrel", n: [0, 2] }, { k: "light", n: [1, 2] }],
    ruin:       [{ k: "debris", d: 0.05 }, { k: "splatter", d: 0.015 }, { k: "crate", n: [0, 2] }, { k: "shelf", n: [0, 1] }, { k: "vine", n: [0, 2] }, { k: "bones", d: 0.01 }],
    throneroom: [{ k: "rug", n: [1, 1] }, { k: "throne", n: [1, 1] }, { k: "statue", n: [2, 4] }, { k: "column", fill: 1 }, { k: "banner", n: [2, 4] }, { k: "light", n: [2, 4] }],
    armory:     [{ k: "weapon", fill: 0.7 }, { k: "weapon", at: "edge", n: [1, 3] }, { k: "crate", n: [1, 2] }, { k: "table", n: [0, 1] }, { k: "banner", n: [0, 2] }],
    landing:    [{ k: "crate", n: [1, 3] }, { k: "timber", n: [0, 2] }, { k: "tool", n: [0, 2] }, { k: "ladder", n: [0, 1] }, { k: "light", n: [1, 2] }, { k: "cart", n: [0, 1] }],
    brood:      [{ k: "bones", d: 0.05 }, { k: "splatter", d: 0.02 }, { k: "rock", d: 0.02 }, { k: "stalagmite", d: 0.01 }],
    dock:       [{ k: "crate", d: 0.08 }, { k: "barrel", n: [2, 4] }, { k: "sack", n: [1, 3] }, { k: "weapon", n: [0, 2] }, { k: "light", n: [1, 2] }, { k: "debris", d: 0.01 }],
    hold:       [{ k: "crate", d: 0.1 }, { k: "barrel", n: [2, 5] }, { k: "chain", n: [0, 2] }, { k: "sack", n: [1, 3] }, { k: "debris", d: 0.015 }, { k: "shell", d: 0.01 }],
    pit:        [{ k: "splatter", d: 0.02 }, { k: "bones", d: 0.02 }, { k: "weapon", at: "edge", n: [1, 3] }, { k: "cage", n: [0, 2] }, { k: "banner", n: [1, 3] }, { k: "light", n: [2, 4] }],
    winery:     [{ k: "barrel", at: "stacks", fill: 0.9 }, { k: "barrel", n: [2, 4] }, { k: "vase", n: [1, 3] }, { k: "table", n: [0, 1] }, { k: "light", n: [1, 2] }],
  };
  // `layouts` lists the plans a structure is drawn from, [layout, weight]: the
  // variant is rolled per entrance, so one stairway always opens onto the same
  // shape and the next one down the road onto another.
  const INTERIOR_PLANS = {
    Dungeon:        { eras: ["old", "occult", "any"], main: "hall", deep: "lair", rooms: [["store", 3], ["guard", 2], ["cell", 2], ["ossuary", 1], ["study", 1], ["armory", 1]], layouts: [["bsp", 4], ["maze", 1], ["keep", 1]] },
    Crypt:          { eras: ["old", "occult", "any"], main: "shrine", deep: "lair", rooms: [["tombs", 5], ["ossuary", 3]], layouts: [["tombs", 3], ["undercroft", 2], ["pyramid", 1]] },
    LootCellar:     { eras: ["old", "any"], main: "store", rooms: [["store", 1]], layouts: [["cellar", 1]] },
    CaveDen:        { eras: ["old", "occult", "any"], main: "den", passage: "cavern", rooms: [["cavern", 2], ["brood", 1]], layouts: [["cavern", 3], ["burrow", 2], ["sinkhole", 1]] },
    TempleInside:   { eras: ["old", "occult", "any"], main: "nave", rooms: [["shrine", 2], ["tombs", 1], ["study", 1], ["hall", 2]], layouts: [["temple", 3], ["pyramid", 1], ["undercroft", 1]] },
    Sewer:          { eras: ["modern", "old", "any"], main: "pump", rooms: [["pump", 3], ["store", 1], ["camp", 1]], layouts: [["canals", 3], ["undercroft", 1]] },
    PatronVault:    { eras: ["old", "any"], main: "vault", rooms: [["hoard", 3], ["vault", 1]], layouts: [["vault", 1]] },
    Catacombs:      { eras: ["old", "occult", "any"], main: "shrine", deep: "ossuary", rooms: [["tombs", 3], ["ossuary", 3]], layouts: [["warren", 3], ["maze", 1], ["galleries", 1]] },
    Mineshaft:      { eras: ["old", "any"], main: "stope", rooms: [["mine", 4], ["camp", 1], ["store", 1]], layouts: [["drifts", 3], ["shaft", 2], ["strata", 1]] },
    CaveFrozen:     { eras: ["old", "any"], main: "ice", passage: "cavern", rooms: [["ice", 3], ["cavern", 2], ["den", 1]], layouts: [["cavern", 2], ["fissure", 3]] },
    Cistern:        { eras: ["old", "any"], main: "cistern", rooms: [["cistern", 2], ["pump", 1]], layouts: [["piers", 3], ["undercroft", 2]] },
    FungalWarren:   { eras: ["old", "occult", "any"], main: "grove", passage: "cavern", rooms: [["grove", 4], ["cavern", 1], ["den", 1]], layouts: [["warren", 2], ["roots", 2], ["sinkhole", 1]] },
    CrystalCavern:  { eras: ["old", "occult", "any"], main: "geode", passage: "cavern", rooms: [["geode", 3], ["cavern", 2]], layouts: [["chambers", 3], ["shards", 1], ["fissure", 1]] },
    Oubliette:      { eras: ["old", "occult", "any"], main: "guard", deep: "lair", rooms: [["cell", 6], ["store", 1], ["armory", 1]], layouts: [["cells", 3], ["arena", 1], ["keep", 1]] },
    SunkenLibrary:  { eras: ["old", "occult", "any"], main: "study", rooms: [["library", 4], ["study", 1]], layouts: [["halls", 3], ["galleries", 2]] },
    UnderForge:     { eras: ["old", "any"], main: "forge", rooms: [["forge", 3], ["store", 2], ["workshop", 1], ["machine", 1]], layouts: [["grid", 2], ["greathall", 2], ["factory", 1]] },
    ColdWarBunker:  { eras: ["modern", "any"], main: "control", rooms: [["barracks", 2], ["machine", 2], ["store", 2], ["infirmary", 1], ["office", 1]], layouts: [["grid", 3], ["maze", 1], ["ward", 1]] },
    BuriedLab:      { eras: ["modern", "occult", "any"], main: "lab", rooms: [["lab", 3], ["infirmary", 2], ["machine", 1], ["store", 1]], layouts: [["grid", 3], ["ward", 1], ["factory", 1]] },
    ProfaneShrine:  { eras: ["occult", "old", "any"], main: "ritual", rooms: [["shrine", 2], ["ossuary", 1], ["cell", 1]], layouts: [["rings", 3], ["shards", 1], ["pyramid", 1]] },
    SmugglerTunnel: { eras: ["old", "modern", "any"], main: "camp", rooms: [["smuggle", 3], ["camp", 1], ["hold", 1]], layouts: [["tube", 3], ["cove", 2], ["hull", 1], ["maze", 1]] },
    SeaGrotto:      { eras: ["old", "any"], main: "grotto", passage: "cavern", rooms: [["grotto", 3], ["cavern", 1], ["hold", 1]], layouts: [["cavern", 2], ["cove", 2], ["sinkhole", 1], ["river", 1], ["hull", 1]] },
    LavaTube:       { eras: ["old", "occult", "any"], main: "magma", passage: "cavern", rooms: [["magma", 3], ["cavern", 1]], layouts: [["tube", 3], ["caldera", 2], ["fissure", 1]] },
    Barrow:         { eras: ["old", "occult", "any"], main: "tombs", deep: "hoard", rooms: [["tombs", 3], ["ossuary", 1], ["hoard", 1]], layouts: [["mound", 3], ["pyramid", 1], ["galleries", 1]] },
    MetroStation:   { eras: ["modern", "any"], main: "platform", rooms: [["platform", 2], ["machine", 1], ["store", 1], ["office", 1]], layouts: [["platform", 3], ["maze", 1]] },
    SaltWorks:      { eras: ["old", "any"], main: "stope", rooms: [["mine", 3], ["store", 1], ["camp", 1]], layouts: [["drifts", 2], ["strata", 2], ["shaft", 1]] },
    // --- the interior biomes the catalogue took in ---------------------------
    HardwareStore:  { eras: ["modern", "old", "any"], main: "hardwarefloor", rooms: [["store", 3], ["workshop", 2], ["office", 1]], layouts: [["shopfloor", 4], ["house", 1]] },
    GroceryStore:   { eras: ["modern", "any"], main: "salesfloor", rooms: [["store", 3], ["kitchen", 1], ["office", 1]], layouts: [["shopfloor", 4], ["house", 1]] },
    Store:          { eras: ["modern", "any", "old"], main: "salesfloor", rooms: [["store", 3], ["office", 1]], layouts: [["shopfloor", 3], ["house", 1]] },
    Hospital:       { eras: ["modern", "any"], main: "reception", rooms: [["ward", 3], ["surgery", 1], ["infirmary", 1], ["office", 1], ["store", 1]], layouts: [["ward", 4], ["grid", 1]] },
    Clinic:         { eras: ["modern", "any"], main: "reception", rooms: [["infirmary", 2], ["surgery", 1], ["office", 1]], layouts: [["ward", 2], ["house", 2]] },
    Tavern:         { eras: ["old", "any"], main: "taproom", rooms: [["bedroom", 3], ["kitchen", 1], ["store", 1]], layouts: [["taproom", 4], ["house", 1]] },
    Restaurant:     { eras: ["modern", "any", "old"], main: "taproom", rooms: [["kitchen", 2], ["store", 1], ["office", 1]], layouts: [["taproom", 3], ["house", 1]] },
    Farmhouse:      { eras: ["old", "any"], main: "parlour", rooms: [["bedroom", 2], ["kitchen", 1], ["store", 2], ["workshop", 1]], layouts: [["house", 4], ["galleries", 1]] },
    HousesInside:   { eras: ["any", "modern", "old"], main: "parlour", rooms: [["bedroom", 3], ["kitchen", 1], ["study", 1], ["store", 1]], layouts: [["house", 1]] },
    AbandonedInside:{ eras: ["any", "modern", "old"], main: "ruin", rooms: [["ruin", 3], ["store", 1], ["bedroom", 1], ["office", 1]], layouts: [["house", 2], ["grid", 2], ["maze", 1]] },
    Basement:       { eras: ["any", "modern", "old"], main: "store", rooms: [["store", 3], ["workshop", 1], ["machine", 1], ["ruin", 1]], layouts: [["house", 2], ["cellar", 1], ["galleries", 1], ["maze", 1]] },
    Laboratory:     { eras: ["modern", "any"], main: "lab", rooms: [["lab", 3], ["infirmary", 1], ["machine", 1], ["office", 1], ["store", 1]], layouts: [["grid", 3], ["ward", 1], ["factory", 1]] },
    FactoryInside:  { eras: ["modern", "any"], main: "factory", rooms: [["office", 1], ["store", 2], ["machine", 2], ["workshop", 1]], layouts: [["factory", 4], ["grid", 1]] },
    CastleInside:   { eras: ["old", "occult", "any"], main: "throneroom", rooms: [["armory", 2], ["barracks", 2], ["store", 1], ["guard", 1], ["hall", 1], ["cell", 1], ["kitchen", 1]], layouts: [["keep", 4], ["greathall", 2], ["arena", 1]] },
    ChurchInside:   { eras: ["old", "occult", "any"], main: "nave", rooms: [["shrine", 2], ["tombs", 1], ["study", 1], ["ossuary", 1]], layouts: [["temple", 3], ["undercroft", 2]] },
    Mines:          { eras: ["old", "any"], main: "stope", rooms: [["mine", 3], ["landing", 2], ["camp", 1], ["store", 1]], layouts: [["shaft", 3], ["drifts", 2], ["strata", 2]] },
    Lair:           { eras: ["old", "occult", "any"], main: "lair", passage: "cavern", rooms: [["den", 2], ["hoard", 1], ["cavern", 1], ["brood", 1]], layouts: [["cavern", 3], ["burrow", 2], ["roots", 1], ["caldera", 1]] },
  };
  // The rooms each layout names itself, whatever the plan says (the nave of a
  // temple, the wards of a hospital, the pit of an arena). The tagging tool
  // folds these into what each structure asks for, so a variant's own rooms
  // never stand empty for want of pieces.
  const LAYOUT_HINTS = {
    vault: ["vault", "hoard"], cellar: ["store"], temple: ["nave", "sanctum", "passage"],
    cells: ["passage", "cell", "guard"], rings: ["ritual", "passage"], piers: ["cistern"],
    halls: ["library", "study"], platform: ["platform", "passage"], drifts: ["passage"],
    shopfloor: [], ward: ["ward", "surgery", "reception", "passage"],
    taproom: ["taproom", "kitchen", "store", "bedroom"], factory: ["factory"],
    keep: ["throneroom"], greathall: ["throneroom"], shaft: ["landing", "passage"],
    burrow: ["brood"], pyramid: ["sanctum", "passage"], cove: ["dock"], arena: ["pit", "passage"],
    galleries: ["passage"], maze: ["passage"], hull: ["hold"],
  };
  // interior-furnishing-end

  // Where each kind of thing stands when a kit line does not say:
  //   dais       centred against the room's north wall (an altar, a throne)
  //   centre     the middle of the room
  //   flank      a matched pair either side of the room's axis, by the wall
  //   wall       side by side along the north wall, backs to the rock
  //   stacks     unbroken lines down a hall's long axis, aisles between them
  //   rows       a grid of one piece with an aisle kept down the middle
  //   colonnade  two lines of one piece down a big room's long sides
  //   corner     the room's inner corners
  //   edge       anywhere against the rock, in little clusters
  //   cluster    a clump round one spot
  //   scatter    loose about the open floor
  //   hung       on the wall faces themselves
  //   ring       round the room's centre piece
  //   flat       laid on the floor and walked over (rugs, sigils, stains)
  //   seat       drawn up to a table (never placed on its own)
  const KIND_PLACE = {
    tomb: "rows", headstone: "rows", bones: "scatter", altar: "dais", throne: "dais",
    circle: "flat", statue: "flank", column: "colonnade", light: "corner", walllight: "hung",
    candle: "corner", banner: "hung", painting: "hung", mask: "hung", sign: "hung", shelf: "wall",
    book: "scatter", table: "centre", seat: "seat", pew: "rows", bed: "edge", crate: "edge",
    barrel: "corner", sack: "edge", vase: "corner", cage: "edge", chain: "hung", machine: "wall",
    panel: "hung", pipe: "edge", grate: "flat", debris: "scatter", rug: "flat", splatter: "flat",
    ore: "edge", crystal: "cluster", rock: "edge", stalagmite: "edge", ice: "cluster",
    mushroom: "cluster", vine: "hung", reef: "cluster", shell: "scatter", flesh: "scatter",
    tool: "edge", cart: "edge", timber: "edge", prop: "colonnade", ladder: "hung",
    cauldron: "centre", forge: "wall", weapon: "edge", treasure: "scatter", relic: "centre",
    trap: "scatter", medical: "edge", specimen: "wall", fountain: "centre", campfire: "centre",
    vending: "wall", bin: "edge", potion: "scatter", lava: "flat",
    counter: "edge", goods: "stacks", appliance: "wall",
  };
  // The order a room's kit is laid in: what is under everything first, then
  // the pieces a room is arranged AROUND (the altar, the table, the statues
  // flanking them), then the furniture lining the walls, and the loose clutter
  // last, into whatever floor is left.
  const PLACE_ORDER = ["flat", "dais", "centre", "flank", "ring", "wall", "stacks", "colonnade", "rows",
    "corner", "edge", "cluster", "scatter", "hung"];
  // i18n-ignore-end

  // Pieces bigger than this are never dealt into a room: a lighthouse is in the
  // furniture catalogue, and a 7x16 sprite in an 8x6 store-room is not dressing.
  const INTERIOR_MAX_W = 5, INTERIOR_MAX_H = 5;

  // structure key -> kind -> [furniture id], built once from the catalogue the
  // first time a structure is furnished. Nothing here is per-map, so a cache
  // for the session is right. `null` until asked; an empty object when the
  // catalogue is not loaded (an offline harness without it), which simply
  // leaves every interior unfurnished.
  let _interiorIndex = null;
  function interiorFurnitureIndex() {
    if (_interiorIndex) return _interiorIndex;
    const out = {};
    const cat = (window.Items && window.Items.Furniture) || null;
    if (cat) {
      for (const id of Object.keys(cat)) {
        const f = cat[id];
        if (!f || !Array.isArray(f.interiors) || !f.interiors.length || !f.interiorKind) continue;
        if ((f.width || 1) > INTERIOR_MAX_W || (f.height || 1) > INTERIOR_MAX_H) continue;
        for (const key of f.interiors) {
          const byKind = out[key] || (out[key] = {});
          (byKind[f.interiorKind] || (byKind[f.interiorKind] = [])).push(id);
        }
      }
    }
    _interiorIndex = out;
    return out;
  }

  // What a piece occupies: its size, the cells that block a step (the same
  // answer FurnitureSystem gives the engine at runtime, so the connectivity
  // guarantee made here is the one the party will actually walk), whether it
  // is hung on a wall, and whether it is flat on the floor.
  const _footprints = new Map();
  function pieceFootprint(id) {
    if (_footprints.has(id)) return _footprints.get(id);
    let fp = null;
    const FS = window.FurnitureSystem;
    if (FS && typeof FS.pieceFootprint === "function") fp = FS.pieceFootprint(id);
    if (!fp) {
      // FurnitureSystem is not loaded (an offline harness): read the stored
      // collision grid with the same tall-piece rule the plugin applies, where
      // a solid piece more than one tile tall blocks only its bottom row.
      const cat = (window.Items && window.Items.Furniture) || {};
      const f = cat[id];
      if (f) {
        const w = f.width || 1, h = f.height || 1;
        const solid = Array.isArray(f.collision) && f.collision.some((row) => row.some((c) => c));
        const hung = !!f.wall;
        const blocks = [];
        if (solid && !hung) {
          for (let dy = h > 1 ? h - 1 : 0; dy < h; dy++)
            for (let dx = 0; dx < w; dx++) blocks.push([dx, dy]);
        }
        const BELOW = ["Carpets", "Liquids", "Magic", "Terrain", "Pavement", "Water", "Underwater", "Grass"];
        fp = { w, h, blocks, hung, flat: !solid && !hung && BELOW.indexOf(f.category) >= 0 };
      }
    }
    _footprints.set(id, fp);
    return fp;
  }

  // A short, stable fingerprint of a furniture plan. FurnitureSystem stores
  // it with what it seeds, so a square is furnished once, and furnished afresh
  // only if the plan for it is ever a different one.
  function furnitureSignature(list) {
    let h = 2166136261 >>> 0;
    const feed = (s) => {
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    };
    for (const p of list) feed(p.id + "@" + p.x + "," + p.y + ";");
    return list.length + ":" + h.toString(36);
  }

  // ===========================================================================
  // THE PROCEDURAL INTERIORS GENERATOR
  // ===========================================================================
  // Every structure in the catalogue is drawn by this one pipeline, a pass at a
  // time over a shared context:
  //
  //   layout      LAYOUTS[S.layout] carves the plan and names its rooms
  //   clip        the border margin is made solid; rooms the clip erased go
  //   entrance    one corridor to the south border (none on a sealed floor)
  //   join        every carved tile is made reachable from the way in
  //   walls       the carve is shaped by the structure's wall style
  //   shell       floor, A4 wall faces and the solid rock ceiling are drawn
  //   floors      each room lays one accent in one pattern
  //   ground      water lanes, tide pools and lava, which replace the floor
  //   rooms       doorways are found and every room is given a role
  //   furnish     the catalogue's furniture is set out by each room's kit
  //   dress       the tile ornaments and the biome's own prop scatter
  //   unseal      nothing put down may cut the plan in two
  //   keep-out    the dead mass is painted with the no-go region
  //
  // What comes out is the map data plus, as plain properties on it, what the
  // passes after generation need: the room rectangles, the spawn and entrance,
  // door and boss hints, and `furniture`, the pieces FurnitureSystem seeds onto
  // the square when the party arrives (see FurnitureSystem.furnishInterior).
  //
  // The Ceiling / rim / wall tile model and its one hard rule still stand: the
  // floor is always enclosed by impassable wall or rock, and nothing walkable
  // may ever touch it from outside. See [[dungeon-generation-rework]].
  // See RESUMABLE GENERATION in ProceduralMapUtils.js.
  const { runSteps } = window.ProcGenUtils;

  const WALL_HEIGHT = 3;
  const ROCK_DEPTH = WALL_HEIGHT + 1;
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function generateDungeonBiome(biome, seed, allFeatures, adjacentBiomes, allOtherData = {}) {
    const ctx = interiorContext(biome, seed, allFeatures, allOtherData);
    (LAYOUTS[ctx.layout] || LAYOUTS.bsp)(ctx);
    clipToMargin(ctx);
    carveEntrance(ctx);
    joinOrphans(ctx);
    shapeWalls(ctx);
    if (ctx.afterCarve) ctx.afterCarve();
    renderShell(ctx);
    paintRoomFloors(ctx);
    layGroundOrnaments(ctx);
    findDoorways(ctx);
    assignRoomRoles(ctx);
    furnishRooms(ctx);
    dressWithFeatures(ctx);
    unsealPlan(ctx);
    paintKeepOut(ctx);
    return publishInterior(ctx);
  }

  function interiorContext(biome, seed, allFeatures, allOtherData) {
    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;
    const rng = createSeededRandom(seed);
    // Which structure is being drawn. An unknown name falls back to the plain
    // dungeon rather than rendering as an unpaved void.
    const S = structureFor(biome && biome.name) || STRUCTURE_INDEX["dungeon"];
    const ctx = {
      biome, seed, allFeatures, width, height, rng, S,
      layout: rollLayout(S, rng),
      style: wallStyleOf(S),
      tilesetId: biome.tilesetId,
      MARGIN: 3,
      // The lower tower (DungeonFloorSystem): a floor with no way off but its
      // own staircase events, so the south-border entrance is left out
      // entirely rather than carved and then merely blocked.
      sealEntrance: !!(allOtherData && allOtherData.worldCoords && allOtherData.worldCoords.sealEntrance),
      carved: Array.from({ length: height }, () => new Array(width).fill(false)),
      rooms: [],
      canalRows: [],
      sewerWaterWidth: 1,
      narrow: [],
      // A loot cellar that came out roomy and well stocked instead of the
      // cramped hole most of them are (see the cellar layout).
      cellarGrand: false,
      furniture: [],
      // Rock painted as a lake of molten rock (the caldera), and carved cells
      // standing under water (a river, a pool, a lagoon).
      lakeMask: new Uint8Array(width * height),
      waterCells: new Set(),
      afterCarve: null,
    };
    ctx.pal = buildPalette(S, allFeatures, ctx.tilesetId, rng);
    ctx.hasOrnament = (nm) => (S.ornaments || []).indexOf(nm) >= 0;
    ctx.isFloor = (x, y) => x >= 0 && x < width && y >= 0 && y < height && ctx.carved[y][x];
    return ctx;
  }

  // Which of its plans this structure is drawn as, rolled off the map seed so
  // a stairway always opens onto the same shape (INTERIOR_PLANS.layouts).
  let _forcedLayout = null;
  function rollLayout(S, rng) {
    // The offline harnesses draw every variant of every structure through
    // forceLayout; the roll still happens, so the rest of the seed is the same.
    const forced = _forcedLayout;
    const plan = INTERIOR_PLANS[S.key];
    const list = (plan && plan.layouts || []).filter(([nm]) => LAYOUTS[nm]);
    if (!list.length) return forced && LAYOUTS[forced] ? forced : S.layout;
    const total = list.reduce((a, l) => a + l[1], 0);
    let r = rng() * total;
    let pick = list[list.length - 1][0];
    for (const [nm, w] of list) { r -= w; if (r <= 0) { pick = nm; break; } }
    return forced && LAYOUTS[forced] ? forced : pick;
  }

  // --- carving helpers -------------------------------------------------------
  function carveRect(ctx, rx, ry, rw, rh) {
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++)
        if (x >= 0 && x < ctx.width && y >= 0 && y < ctx.height) ctx.carved[y][x] = true;
  }
  function carveH(ctx, x1, x2, y, thick = 1) {
    const a = Math.min(x1, x2), b = Math.max(x1, x2);
    for (let x = a; x <= b; x++)
      for (let t = 0; t < thick; t++)
        if (y + t >= 0 && y + t < ctx.height && x >= 0 && x < ctx.width) ctx.carved[y + t][x] = true;
  }
  function carveV(ctx, y1, y2, x, thick = 1) {
    const a = Math.min(y1, y2), b = Math.max(y1, y2);
    for (let y = a; y <= b; y++)
      for (let t = 0; t < thick; t++)
        if (y >= 0 && y < ctx.height && x + t >= 0 && x + t < ctx.width) ctx.carved[y][x + t] = true;
  }
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // A room is a rectangle the dressing passes aim at. `hint` names the kit a
  // layout already knows the room wants (a nave, a cell, a guard room); every
  // room without one is dealt a kit by assignRoomRoles.
  function addRoom(ctx, rx, ry, rw, rh, hint) {
    const M = ctx.MARGIN;
    const x = clampTo(rx, M, ctx.width - M - rw);
    const y = clampTo(ry, M, ctx.height - M - rh);
    carveRect(ctx, x, y, rw, rh);
    const r = { x, y, width: rw, height: rh };
    if (hint) r.hint = hint;
    ctx.rooms.push(r);
    return r;
  }
  function pushRoom(ctx, x, y, w, h, hint) {
    const r = { x, y, width: w, height: h };
    if (hint) r.hint = hint;
    ctx.rooms.push(r);
    return r;
  }
  // Cut an L-shaped passage from a point to the nearest tile already carved,
  // so a chamber placed with a free hand can never end up walled off.
  // `own` is the room the point sits in: its own floor is not "the plan", or
  // the nearest carved tile is the one under the point and nothing is cut.
  function connectToPlan(ctx, cx, cy, thick = 1, own = null) {
    const M = ctx.MARGIN;
    const inOwn = (x, y) => own && x >= own.x && x < own.x + own.width && y >= own.y && y < own.y + own.height;
    let best = null, bestD = Infinity;
    for (let y = M; y < ctx.height - M; y++)
      for (let x = M; x < ctx.width - M; x++) {
        if (!ctx.carved[y][x] || inOwn(x, y)) continue;
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    if (!best || bestD === 0) return;
    carveH(ctx, cx, best.x, cy, thick);
    carveV(ctx, cy, best.y, best.x, thick);
  }
  // Reduce a carve to its largest connected pocket: what makes an organic
  // carve read as ONE place rather than a handful of sealed bubbles.
  function keepLargestPocket(ctx) {
    const { width, height, carved } = ctx;
    const compOf = new Int32Array(width * height);
    let bestComp = 0, bestSize = 0, compId = 0;
    for (let sy = 0; sy < height; sy++)
      for (let sx = 0; sx < width; sx++) {
        if (!carved[sy][sx] || compOf[sx + sy * width]) continue;
        compId++;
        let size = 0;
        const stack = [sx + sy * width];
        compOf[sx + sy * width] = compId;
        while (stack.length) {
          const k = stack.pop();
          size++;
          const px = k % width, py = (k / width) | 0;
          for (const [dx, dy] of DIRS4) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nk = nx + ny * width;
            if (!carved[ny][nx] || compOf[nk]) continue;
            compOf[nk] = compId;
            stack.push(nk);
          }
        }
        if (size > bestSize) { bestSize = size; bestComp = compId; }
      }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (carved[y][x] && compOf[x + y * width] !== bestComp) carved[y][x] = false;
    return bestSize;
  }
  // Copy a sub-grid produced by one of the shared cave algorithms into the
  // carve at (ox, oy).
  function stampCave(ctx, sub, w, h, ox, oy, FLOOR) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (sub[y * w + x] === FLOOR) ctx.carved[oy + y][ox + x] = true;
  }
  function floodFrom(ctx, sx, sy, open) {
    const { width, height } = ctx;
    const seen = new Uint8Array(width * height);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height || !open(sx, sy)) return seen;
    const stack = [sx + sy * width];
    seen[sx + sy * width] = 1;
    while (stack.length) {
      const k = stack.pop();
      const x = k % width, y = (k / width) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nk = nx + ny * width;
        if (seen[nk] || !open(nx, ny)) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    return seen;
  }

  // ===========================================================================
  // LAYOUTS
  // ===========================================================================
  // One function per `layout` in the catalogue. Each carves its plan into
  // ctx.carved and pushes the rooms it wants dressed, marking with a `hint`
  // the ones whose purpose the plan itself already decides.
  const LAYOUTS = {
    // Patron's vault: one great hall, strongrooms hung off its flanks and a
    // deep back chamber behind it, every one joined to the hall by a 3-wide
    // spoke so nothing is ever walled off.
    vault(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hallW = 25 + Math.floor(rng() * 4);
      const hallH = 17 + Math.floor(rng() * 5);
      const hx = Math.max(MARGIN + 1, Math.floor((width - hallW) / 2));
      const hy = clampTo(height - MARGIN - hallH - 4 - Math.floor(rng() * 4), MARGIN + 16, height - MARGIN - hallH - 1);
      carveRect(ctx, hx, hy, hallW, hallH);
      pushRoom(ctx, hx, hy, hallW, hallH, "vault");
      const hcx = hx + (hallW >> 1), hcy = hy + (hallH >> 1);
      const spoke = (ax, ay, bx, by) => {
        const ty = clampTo(ay, MARGIN, height - MARGIN - 3);
        carveH(ctx, ax, bx, ty, 3);
        carveV(ctx, ty, by, clampTo(bx, MARGIN, width - MARGIN - 3), 3);
      };
      const bw = 17 + Math.floor(rng() * 5), bh = 10 + Math.floor(rng() * 4);
      const bx0 = clampTo(hcx - (bw >> 1), MARGIN + 1, width - MARGIN - bw - 1);
      const by0 = clampTo(hy - bh - 4 - Math.floor(rng() * 3), MARGIN + 1, hy - bh - 2);
      carveRect(ctx, bx0, by0, bw, bh);
      pushRoom(ctx, bx0, by0, bw, bh, "hoard");
      spoke(bx0 + (bw >> 1), by0 + (bh >> 1), hcx, hcy);
      const SIDES = ["W", "E", "NW", "NE"];
      const strongrooms = 10 + Math.floor(rng() * 4);
      for (let i = 0; i < strongrooms; i++) {
        const side = SIDES[i % SIDES.length];
        const cw = 9 + Math.floor(rng() * 4), ch = 7 + Math.floor(rng() * 4);
        const gap = 2 + Math.floor(rng() * 3);
        let cx0, cy0;
        if (side === "W" || side === "E") {
          cx0 = side === "W" ? hx - cw - gap : hx + hallW + gap;
          cy0 = hy - 3 + Math.floor(rng() * Math.max(1, hallH - ch + 6));
        } else {
          cx0 = side === "NW" ? MARGIN + 1 + Math.floor(rng() * 3) : width - MARGIN - cw - 1 - Math.floor(rng() * 3);
          cy0 = by0 - 1 + Math.floor(rng() * Math.max(1, bh - ch + 3));
        }
        cx0 = clampTo(cx0, MARGIN + 1, width - MARGIN - cw - 1);
        cy0 = clampTo(cy0, MARGIN + 1, height - MARGIN - ch - 1);
        carveRect(ctx, cx0, cy0, cw, ch);
        pushRoom(ctx, cx0, cy0, cw, ch);
        spoke(cx0 + (cw >> 1), cy0 + (ch >> 1), hcx, hcy);
      }
    },

    // Loot cellar: one small vaulted store-room behind the stairs, near the
    // south border. The roomy kind is a rare find (cellarGrand). The small
    // kind never drops below 6x5: the Bunker origin scatters six gold hoards
    // over the cellar's open floor and has to fit them all.
    cellar(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      ctx.cellarGrand = rng() < 0.12;
      const grand = ctx.cellarGrand;
      const rw = grand ? 9 + Math.floor(rng() * 8) : 6 + Math.floor(rng() * 4);
      const rh = grand ? 7 + Math.floor(rng() * 6) : 5 + Math.floor(rng() * 3);
      const rx = Math.max(MARGIN + 1, Math.floor((width - rw) / 2) + Math.floor(rng() * 7) - 3);
      const ry = Math.max(MARGIN + 1, height - MARGIN - rh - 2 - Math.floor(rng() * 4));
      carveRect(ctx, rx, ry, rw, rh);
      pushRoom(ctx, rx, ry, rw, rh, "store");
      if (rng() < (grand ? 0.55 : 0.18)) {
        const aw = (grand ? 4 : 3) + Math.floor(rng() * 3);
        const ah = (grand ? 4 : 3) + Math.floor(rng() * 3);
        const left = rng() < 0.5;
        const ax = left ? rx - aw : rx + rw;
        const ay = ry + 1 + Math.floor(rng() * Math.max(1, rh - ah - 1));
        carveRect(ctx, ax, ay, aw, ah);
        pushRoom(ctx, ax, ay, aw, ah, "store");
      }
    },

    // Temple: a central nave capped by a wide sanctum, crossed by full-width
    // transepts whose ends are tied together by flanking galleries, with side
    // chapels hung off them. The nave is laid with pews facing the sanctum.
    temple(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2);
      const naveW = 7 + Math.floor(rng() * 3);
      const naveTop = MARGIN + 8 + Math.floor(rng() * 6);
      const naveBot = height - MARGIN - 3;
      carveRect(ctx, cx - (naveW >> 1), naveTop, naveW, naveBot - naveTop);
      pushRoom(ctx, cx - (naveW >> 1), naveTop, naveW, naveBot - naveTop, "nave");
      const sw = naveW + 10 + Math.floor(rng() * 8);
      const sh = 8 + Math.floor(rng() * 5);
      const sy = Math.max(MARGIN + 1, naveTop - sh);
      if (naveTop - sy > 0) {
        carveRect(ctx, cx - (sw >> 1), sy, sw, naveTop - sy);
        pushRoom(ctx, cx - (sw >> 1), sy, sw, naveTop - sy, "sanctum");
      }
      const tx1 = MARGIN + 4 + Math.floor(rng() * 5);
      const tx2 = width - MARGIN - 4 - Math.floor(rng() * 5);
      const nTransepts = 2 + Math.floor(rng() * 2);
      const transepts = [];
      for (let t = 0; t < nTransepts; t++) {
        const th = 4 + Math.floor(rng() * 3);
        const span = naveBot - naveTop - 10;
        const ty = naveTop + 3 + Math.floor((span * (t + 0.2 + rng() * 0.6)) / nTransepts);
        carveRect(ctx, tx1, ty, tx2 - tx1, th);
        transepts.push(pushRoom(ctx, tx1, ty, tx2 - tx1, th, "passage"));
      }
      if (transepts.length > 1) {
        const first = transepts[0], last = transepts[transepts.length - 1];
        const gw = 3 + Math.floor(rng() * 2);
        for (const gx of [tx1, tx2 - gw]) {
          carveRect(ctx, gx, first.y, gw, last.y + last.height - first.y);
          pushRoom(ctx, gx, first.y, gw, last.y + last.height - first.y, "passage");
        }
      }
      const nChapels = 2 + Math.floor(rng() * 3);
      for (let c = 0; c < nChapels; c++) {
        const west = rng() < 0.5;
        const hall = transepts[Math.floor(rng() * transepts.length)];
        const cw = 6 + Math.floor(rng() * 5), chh = 5 + Math.floor(rng() * 4);
        const chx = west ? Math.max(MARGIN, tx1 - cw - 3) : Math.min(width - MARGIN - cw, tx2 + 3);
        // Level with the transept's own top edge, joined along it: a passage
        // meeting the chapel part way down leaves a step the wall levelling
        // would carry right across the chapel (see the cell mouths).
        const chy = Math.max(MARGIN + 1, Math.min(height - MARGIN - chh - 1, hall.y));
        carveRect(ctx, chx, chy, cw, chh);
        pushRoom(ctx, chx, chy, cw, chh);
        const py = Math.max(hall.y, chy);
        if (west) carveH(ctx, chx + cw - 1, tx1, py, 2);
        else carveH(ctx, tx2 - 1, chx, py, 2);
      }
    },

    // Cavern (den, frozen cave, grotto): one organic chamber, anywhere from a
    // cramped hollow to a cave filling the map, reduced to its largest pocket.
    cavern(ctx) {
      const { rng, width, height, MARGIN, seed } = ctx;
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const dw = Math.min(innerW, 18 + Math.floor(rng() * (innerW - 18 + 1)));
      const dh = Math.min(innerH, 14 + Math.floor(rng() * (innerH - 14 + 1)));
      const ox = MARGIN + Math.floor(rng() * (innerW - dw + 1));
      const oy = MARGIN + Math.max(0, innerH - dh - Math.floor(rng() * 8));
      const FLOOR = 1, CEIL = 2;
      const sub = rng() < 0.5
        ? Utils2.generateCaveWithDrunkenWalk(dw, dh, dw, 0.45, seed ^ 0xdE11, FLOOR, CEIL)
        : Utils2.generateCaveWithCellularAutomata(dw, dh, dw, seed ^ 0xdE11, FLOOR, CEIL);
      stampCave(ctx, sub, dw, dh, ox, oy, FLOOR);
      if (keepLargestPocket(ctx) < 60) {
        const ecx = ox + (dw >> 1), ecy = oy + (dh >> 1);
        const erx = Math.max(6, dw >> 1), ery = Math.max(5, dh >> 1);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const nx = (x - ecx) / erx, ny = (y - ecy) / ery;
            ctx.carved[y][x] = nx * nx + ny * ny <= 1;
          }
      }
      organicRoomGrid(ctx, 10, 30);
    },

    // Canals (sewer): a grid of tunnels, the water 2-4 tiles wide down the
    // middle of each with a dry lane to walk either side. The junctions are
    // the rooms; the pump chambers sit between them.
    canals(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      ctx.sewerWaterWidth = 2 + Math.floor(rng() * 3);
      const thick = ctx.sewerWaterWidth + 2;
      const pitch = 11;
      const colsX = [];
      for (let y = MARGIN + 4; y < height - MARGIN - 4; y += pitch) { carveH(ctx, MARGIN, width - MARGIN - 1, y, thick); ctx.canalRows.push(y + 1); }
      for (let x = MARGIN + 4; x < width - MARGIN - 4; x += pitch) { carveV(ctx, MARGIN, height - MARGIN - 1, x, thick); colsX.push(x); }
      // Pump chambers: dry rooms cut into the blocks between the tunnels,
      // each opening onto the tunnel north of it. They are where a sewer's
      // furniture lives; the tunnels themselves are water and walkway.
      for (let i = 0; i + 1 < ctx.canalRows.length; i++) {
        for (let j = 0; j + 1 < colsX.length; j++) {
          if (rng() < 0.45) continue;
          const bx0 = colsX[j] + thick + 1, bx1 = colsX[j + 1] - 2;
          const by0 = ctx.canalRows[i] - 1 + thick + 1, by1 = ctx.canalRows[i + 1] - 3;
          const rw = bx1 - bx0, rh = by1 - by0;
          if (rw < 4 || rh < 4) continue;
          const r = addRoom(ctx, bx0, by0, rw, rh);
          carveV(ctx, ctx.canalRows[i] - 1 + thick - 1, r.y, r.x + (rw >> 1));
        }
      }
    },

    // Tombs (crypt): a grid of burial chambers joined by straight corridors.
    // The chambers vary in size so a crypt has its great vaults as well as
    // its niches, and the rows of the grid are where the tombs are laid.
    tombs(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const pitch = 11;
      const grid = [];
      for (let gy = MARGIN + 1; gy + 5 < height - MARGIN; gy += pitch) {
        const row = [];
        for (let gx = MARGIN + 1; gx + 5 < width - MARGIN; gx += pitch) {
          const w = 5 + Math.floor(rng() * 4), h = 5 + Math.floor(rng() * 4);
          const r = addRoom(ctx, gx, gy, Math.min(w, width - MARGIN - gx - 1), Math.min(h, height - MARGIN - gy - 1));
          row.push(r);
        }
        grid.push(row);
      }
      for (let i = 0; i < grid.length; i++)
        for (let j = 0; j < grid[i].length; j++) {
          const r = grid[i][j];
          const cx = r.x + (r.width >> 1), cy = r.y + (r.height >> 1);
          if (j + 1 < grid[i].length) { const o = grid[i][j + 1]; carveH(ctx, cx, o.x + (o.width >> 1), cy); }
          if (i + 1 < grid.length && grid[i + 1][j]) { const o = grid[i + 1][j]; carveV(ctx, cy, o.y + (o.height >> 1), cx); }
        }
    },

    // Warren (catacombs, fungal warren): an organic carve threaded through
    // the rock with rectangular alcoves cut into its flanks.
    warren(ctx) {
      const { rng, width, height, MARGIN, seed } = ctx;
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const FLOOR = 1, CEIL = 2;
      const sub = Utils2.generateCaveWithCellularAutomata(innerW, innerH, innerW, seed ^ 0x7A55, FLOOR, CEIL);
      stampCave(ctx, sub, innerW, innerH, MARGIN, MARGIN, FLOOR);
      if (keepLargestPocket(ctx) < 200) addRoom(ctx, Math.floor(width / 2) - 9, Math.floor(height / 2) - 6, 18, 12);
      const nAlcoves = 9 + Math.floor(rng() * 9);
      for (let i = 0; i < nAlcoves; i++) {
        const aw = 4 + Math.floor(rng() * 4), ah = 4 + Math.floor(rng() * 3);
        const ax = MARGIN + 1 + Math.floor(rng() * (width - MARGIN * 2 - aw - 2));
        const ay = MARGIN + 1 + Math.floor(rng() * (height - MARGIN * 2 - ah - 2));
        const r = addRoom(ctx, ax, ay, aw, ah);
        connectToPlan(ctx, r.x + (aw >> 1), r.y + (ah >> 1), 1, r);
      }
      organicRoomGrid(ctx, 12, 50);
    },

    // Drifts (mine, salt works): parallel galleries driven the length of the
    // map, cross-cuts joining them, and one worked-out stope.
    drifts(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const top = MARGIN + 2, bot = height - MARGIN - 3;
      const nDrifts = 3 + Math.floor(rng() * 3);
      const span = width - MARGIN * 2 - 8;
      const xs = [];
      for (let i = 0; i < nDrifts; i++) {
        const dx = clampTo(MARGIN + 4 + Math.floor((span * (i + 0.5)) / nDrifts) + Math.floor(rng() * 5) - 2, MARGIN + 1, width - MARGIN - 4);
        const dw = 2 + Math.floor(rng() * 2);
        carveV(ctx, top, bot, dx, dw);
        pushRoom(ctx, dx, top, dw, bot - top, "passage");
        xs.push(dx);
      }
      const nCuts = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < nCuts; i++) {
        const cy = clampTo(top + 4 + Math.floor(((bot - top - 8) * (i + rng() * 0.7)) / nCuts), MARGIN + 1, height - MARGIN - 3);
        carveH(ctx, xs[0], xs[xs.length - 1] + 2, cy, 2);
      }
      // Side workings: short headings off the drifts, each a room of its own.
      const nWork = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < nWork; i++) {
        const ww = 5 + Math.floor(rng() * 4), wh = 4 + Math.floor(rng() * 3);
        const x0 = xs[Math.floor(rng() * xs.length)];
        const r = addRoom(ctx, x0 + (rng() < 0.5 ? -ww - 1 : 3), top + 3 + Math.floor(rng() * (bot - top - wh - 6)), ww, wh);
        connectToPlan(ctx, r.x + (ww >> 1), r.y + (wh >> 1), 2, r);
      }
      const sw = 12 + Math.floor(rng() * 8), sh = 9 + Math.floor(rng() * 6);
      const stope = addRoom(ctx, xs[Math.floor(rng() * xs.length)] - (sw >> 1),
        top + 2 + Math.floor(rng() * Math.max(1, (bot - top) - sh - 4)), sw, sh, null);
      connectToPlan(ctx, stope.x + (sw >> 1), stope.y + (sh >> 1), 2, stope);
    },

    // Cell block (oubliette): a spine corridor with a row of cells down each
    // side and a guard room at the head of it.
    cells(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2);
      const top = MARGIN + 6, bot = height - MARGIN - 4;
      const spineW = 3;
      carveV(ctx, top, bot, cx - 1, spineW);
      pushRoom(ctx, cx - 1, top, spineW, bot - top, "passage");
      const cellW = 5 + Math.floor(rng() * 3), cellH = 4 + Math.floor(rng() * 2);
      const gw = 11 + Math.floor(rng() * 6), gh = 7 + Math.floor(rng() * 4);
      // A full wall's depth between one cell and the next (and between the
      // guard room and the first cells), two tiles of rock between a cell and
      // the spine: anything thinner is opened by the depth pass and the block
      // comes out as one long gallery.
      for (let y = Math.max(top + 1, MARGIN + 1 + gh + ROCK_DEPTH); y + cellH < bot; y += cellH + ROCK_DEPTH) {
        for (const side of [-1, 1]) {
          if (rng() < 0.12) continue;
          const rx = side < 0 ? cx - 3 - cellW : cx + spineW + 1;
          const r = addRoom(ctx, rx, y, cellW, cellH, "cell");
          // The mouth is cut along the cell's top row. Cut lower, it puts a
          // short step in the north edge, and levelling that step to a full
          // wall's height raises the rock beside it too, column after column,
          // until the cell has merged into the spine.
          const my = r.y;
          if (side < 0) carveH(ctx, r.x + cellW - 1, cx - 1, my);
          else carveH(ctx, cx + spineW - 1, r.x, my);
        }
      }
      const guard = addRoom(ctx, cx - (gw >> 1), MARGIN + 1, gw, gh, "guard");
      carveV(ctx, guard.y + gh - 1, top, cx, 2);
    },

    // Rings (profane shrine): concentric galleries round a sanctum, joined by
    // four radial spokes; everything faces the middle, where the sigil is.
    rings(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2) + 2;
      const nRings = 2 + Math.floor(rng() * 2);
      const step = 7 + Math.floor(rng() * 3);
      const maxR = Math.min(cx - MARGIN - 2, cy - MARGIN - 2, height - MARGIN - cy - 2);
      const inner = 5 + Math.floor(rng() * 2);
      addRoom(ctx, cx - inner, cy - inner, inner * 2 + 1, inner * 2 + 1, "ritual");
      for (let i = 1; i <= nRings; i++) {
        const r = Math.min(maxR - 1, inner + i * step);
        if (r <= inner + 1) break;
        const band = 2 + Math.floor(rng() * 2);
        carveH(ctx, cx - r, cx + r, cy - r, band);
        carveH(ctx, cx - r, cx + r, cy + r, band);
        carveV(ctx, cy - r, cy + r, cx - r, band);
        carveV(ctx, cy - r, cy + r, cx + r, band);
        pushRoom(ctx, cx - r, cy - r, r * 2, band, "passage");
        pushRoom(ctx, cx - r, cy + r, r * 2, band, "passage");
      }
      const rOut = Math.min(maxR - 1, inner + nRings * step);
      carveV(ctx, cy - rOut, cy - inner, cx, 2);
      carveV(ctx, cy + inner, cy + rOut, cx, 2);
      carveH(ctx, cx - rOut, cx - inner, cy, 2);
      carveH(ctx, cx + inner, cx + rOut, cy, 2);
      // Side shrines in the corners of the outer ring.
      const nSide = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < nSide; i++) {
        const sw = 6 + Math.floor(rng() * 3), sh = 5 + Math.floor(rng() * 3);
        const left = i % 2 === 0, up = i < 2;
        const sx = left ? cx - rOut - sw - 2 : cx + rOut + 3;
        const sy = up ? cy - rOut + 1 : cy + rOut - sh;
        if (sx < MARGIN + 1 || sx + sw > width - MARGIN - 1 || sy < MARGIN + 1 || sy + sh > height - MARGIN - 1) continue;
        const r = addRoom(ctx, sx, sy, sw, sh);
        connectToPlan(ctx, r.x + (sw >> 1), r.y + (sh >> 1), 2, r);
      }
    },

    // Piers (cistern): a vaulted hall whose roof stands on a grid of square
    // piers, so the space is one room and a maze at the same time.
    piers(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const x0 = MARGIN + 2, y0 = MARGIN + 2;
      const x1 = width - MARGIN - 3, y1 = height - MARGIN - 3;
      carveRect(ctx, x0, y0, x1 - x0, y1 - y0);
      pushRoom(ctx, x0, y0, x1 - x0, y1 - y0, "cistern");
      const pier = 2 + Math.floor(rng() * 2);
      const bay = pier + 4 + Math.floor(rng() * 2);
      for (let y = y0 + 3; y + pier < y1 - 2; y += bay)
        for (let x = x0 + 3; x + pier < x1 - 2; x += bay)
          for (let dy = 0; dy < pier; dy++)
            for (let dx = 0; dx < pier; dx++) ctx.carved[y + dy][x + dx] = false;
      // The bays between the piers are what get dressed.
      for (let y = y0 + 3 + pier; y + bay - pier < y1 - 2; y += bay)
        for (let x = x0 + 3 + pier; x + bay - pier < x1 - 2; x += bay)
          if (rng() < 0.4) pushRoom(ctx, x, y, bay - pier, bay - pier);
    },

    // Stack halls (sunken library): long parallel halls of shelving tied
    // together at both ends, with a rotunda reading room through the middle.
    halls(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const top = MARGIN + 3, bot = height - MARGIN - 4;
      const nHalls = 3 + Math.floor(rng() * 3);
      const hw = 6 + Math.floor(rng() * 3);
      const gap = 3 + Math.floor(rng() * 2);
      const totalW = nHalls * hw + (nHalls - 1) * gap;
      const startX = Math.max(MARGIN + 2, Math.floor((width - totalW) / 2));
      for (let i = 0; i < nHalls; i++) {
        const hx = startX + i * (hw + gap);
        if (hx + hw >= width - MARGIN) break;
        carveRect(ctx, hx, top, hw, bot - top);
        pushRoom(ctx, hx, top, hw, bot - top, "library");
      }
      carveH(ctx, startX, startX + totalW, top, 3);
      carveH(ctx, startX, startX + totalW, bot - 3, 3);
      const rr = 6 + Math.floor(rng() * 3);
      const rcx = startX + (totalW >> 1), rcy = Math.floor((top + bot) / 2);
      for (let dy = -rr; dy <= rr; dy++)
        for (let dx = -rr; dx <= rr; dx++)
          if (dx * dx + dy * dy <= rr * rr) {
            const gx = rcx + dx, gy = rcy + dy;
            if (gx > MARGIN && gy > MARGIN && gx < width - MARGIN && gy < height - MARGIN) ctx.carved[gy][gx] = true;
          }
      pushRoom(ctx, rcx - rr + 2, rcy - rr + 2, rr * 2 - 3, rr * 2 - 3, "study");
    },

    // Tube (smuggler's run, lava tube): ONE winding passage with bulges along
    // it and a chamber at the far end, walked with momentum so it wanders
    // without knotting.
    tube(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      let px = Math.floor(width / 2) + Math.floor(rng() * 9) - 4;
      let py = height - MARGIN - 4;
      let dir = 8;
      const steps = 150 + Math.floor(rng() * 90);
      const bulges = [];
      for (let i = 0; i < steps; i++) {
        const w2 = 2 + Math.floor(rng() * 3);
        for (let dy = 0; dy < w2; dy++)
          for (let dx = 0; dx < w2; dx++)
            ctx.carved[clampTo(py + dy, MARGIN, height - MARGIN - 1)][clampTo(px + dx, MARGIN, width - MARGIN - 1)] = true;
        if (rng() < 0.08) bulges.push({ x: px, y: py });
        if (rng() < 0.28) dir = [2, 4, 6, 8][Math.floor(rng() * 4)];
        const run = 1 + Math.floor(rng() * 2);
        if (dir === 8) py -= run; else if (dir === 2) py += run;
        else if (dir === 4) px -= run; else px += run;
        if (px < MARGIN + 2) { px = MARGIN + 2; dir = 6; }
        if (px > width - MARGIN - 4) { px = width - MARGIN - 4; dir = 4; }
        if (py < MARGIN + 2) { py = MARGIN + 2; dir = 2; }
        if (py > height - MARGIN - 4) { py = height - MARGIN - 4; dir = 8; }
      }
      for (const b of bulges.slice(0, 8)) {
        const bw = 6 + Math.floor(rng() * 5), bh = 5 + Math.floor(rng() * 4);
        addRoom(ctx, b.x - (bw >> 1), b.y - (bh >> 1), bw, bh);
      }
      const ew = 12 + Math.floor(rng() * 8), eh = 9 + Math.floor(rng() * 6);
      const end = addRoom(ctx, px - (ew >> 1), py - (eh >> 1), ew, eh, null);
      connectToPlan(ctx, end.x + (ew >> 1), end.y + (eh >> 1), 2, end);
    },

    // Chambers (crystal cavern): Voronoi pockets joined by the tunnels drawn
    // between their seeds.
    chambers(ctx) {
      const { width, height, MARGIN, seed } = ctx;
      const innerW = width - MARGIN * 2, innerH = height - MARGIN * 2;
      const FLOOR = 1, CEIL = 2;
      const sub = Utils2.generateCaveWithVoronoi(innerW, innerH, innerW, seed ^ 0xC0FFEE, FLOOR, CEIL);
      stampCave(ctx, sub, innerW, innerH, MARGIN, MARGIN, FLOOR);
      if (keepLargestPocket(ctx) < 200) addRoom(ctx, Math.floor(width / 2) - 10, Math.floor(height / 2) - 7, 20, 14);
      organicRoomGrid(ctx, 10, 40);
    },

    // Platform (metro station): one long concourse, running tunnels leaving
    // both ends, a stair down from the south border, and the service rooms
    // the station staff kept behind it.
    platform(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hh = 13 + Math.floor(rng() * 5);
      const hy = clampTo(Math.floor(height / 2) - (hh >> 1) + Math.floor(rng() * 7) - 3, MARGIN + 13, height - MARGIN - hh - 6);
      const hx = MARGIN + 4, hw = width - MARGIN * 2 - 8;
      carveRect(ctx, hx, hy, hw, hh);
      pushRoom(ctx, hx, hy, hw, hh, "platform");
      const ty = hy + (hh >> 1);
      carveH(ctx, MARGIN, hx, ty, 3);
      carveH(ctx, hx + hw - 1, width - MARGIN - 1, ty, 3);
      const cx = hx + (hw >> 1);
      carveV(ctx, hy + hh - 1, height - MARGIN - 2, cx, 3);
      pushRoom(ctx, cx - 1, hy + hh, 3, height - MARGIN - hy - hh - 2, "passage");
      const nService = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < nService; i++) {
        const sw = 7 + Math.floor(rng() * 4), sh = 5 + Math.floor(rng() * 3);
        const sx = hx + 2 + Math.floor((hw - sw - 4) * (i + 0.5) / nService);
        const r = addRoom(ctx, sx, hy - sh - ROCK_DEPTH, sw, sh);
        carveV(ctx, r.y + sh - 1, hy, r.x + (sw >> 1), 2);
      }
    },

    // Mound (barrow): a central burial hall with a ring of chambers round
    // it, each on its own short spoke. Symmetric on purpose: it was built.
    mound(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2) + 3;
      const hw = 13 + Math.floor(rng() * 7), hh = 9 + Math.floor(rng() * 5);
      addRoom(ctx, cx - (hw >> 1), cy - (hh >> 1), hw, hh, null);
      const nCh = 5 + Math.floor(rng() * 4);
      const radius = Math.min(cx - MARGIN - 10, cy - MARGIN - 10, height - MARGIN - cy - 10);
      for (let i = 0; i < nCh; i++) {
        const ang = (Math.PI * 2 * i) / nCh + rng() * 0.4;
        const rr = radius - 2 + Math.floor(rng() * 4);
        const chw = 6 + Math.floor(rng() * 5), chh = 5 + Math.floor(rng() * 4);
        const r = addRoom(ctx, Math.round(cx + Math.cos(ang) * rr) - (chw >> 1), Math.round(cy + Math.sin(ang) * rr) - (chh >> 1), chw, chh);
        const rcx = r.x + (chw >> 1), rcy = r.y + (chh >> 1);
        carveH(ctx, rcx, cx, rcy, 2);
        carveV(ctx, rcy, cy, cx, 2);
      }
    },

    // Grid (forge, bunker, buried lab): orthogonal service corridors with
    // rooms hung off them, one doorway each. Built by people with a ruler.
    // A room stands a full ROCK_DEPTH off the corridors above and below it,
    // or the rock between them is too thin to carry a wall face and the depth
    // pass opens it, merging the room into the corridor; and two tiles off
    // the corridors beside it, since one tile is a fin and goes the same way.
    grid(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cols = 3 + Math.floor(rng() * 2);
      const rowsN = 2 + Math.floor(rng() * 2);
      const cw = Math.floor((width - MARGIN * 2 - 6) / cols);
      const ch = Math.floor((height - MARGIN * 2 - 6) / rowsN);
      const corr = 2 + Math.floor(rng() * 2);
      const xs = [], ys = [];
      for (let i = 0; i <= cols; i++) xs.push(MARGIN + 3 + i * cw);
      for (let i = 0; i <= rowsN; i++) ys.push(MARGIN + 3 + i * ch);
      for (const y of ys) carveH(ctx, xs[0], xs[xs.length - 1], clampTo(y, MARGIN, height - MARGIN - corr), corr);
      for (const x of xs) carveV(ctx, ys[0], ys[ys.length - 1], clampTo(x, MARGIN, width - MARGIN - corr), corr);
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rowsN; j++) {
          if (rng() < 0.15) continue;
          const rw = cw - corr - 4, rh = ch - corr - ROCK_DEPTH * 2;
          if (rw < 4 || rh < 4) continue;
          const r = addRoom(ctx, xs[i] + corr + 2, ys[j] + corr + ROCK_DEPTH, rw, rh);
          const dx = r.x + 1 + Math.floor(rng() * Math.max(1, rw - 2));
          carveV(ctx, r.y - 1, ys[j] + corr - 1, clampTo(dx, MARGIN, width - MARGIN - 1));
        }
    },

    // Dungeon: BSP rooms and winding corridors, the room band rolled per
    // dungeon, one to three neighbours knocked through into great halls.
    bsp(ctx) {
      const { rng, width, height, seed } = ctx;
      const minRoom = 4 + Math.floor(rng() * 3);
      const maxRoom = 13 + Math.floor(rng() * 10);
      const bsp = Utils2.generateDungeonBSP(width, height, seed, minRoom, maxRoom);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (bsp.carved[y][x]) ctx.carved[y][x] = true;
      if (bsp.rooms) ctx.rooms.push(...bsp.rooms.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
      if (bsp.narrowCorridors) ctx.narrow.push(...bsp.narrowCorridors);
      const rooms = ctx.rooms;
      if (rooms.length > 4) {
        const nHalls = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < nHalls; i++) {
          const a = rooms[Math.floor(rng() * rooms.length)];
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
          addRoom(ctx, nx, ny, nw, nh);
        }
      }
    },
  };

  // ===========================================================================
  // MORE LAYOUTS
  // ===========================================================================
  // The variants a structure can be drawn as (INTERIOR_PLANS.layouts). Every
  // built one keeps to the two spacing rules the wall model needs: a full
  // ROCK_DEPTH of rock north of any room that has floor beyond it, two tiles
  // of rock between rooms side by side, and doorways cut along a room's top
  // row (see the grid and cell layouts for why).

  // A block of rooms on a grid inside a rectangle, each joined to its
  // neighbour on the right along their shared top row and to the room below
  // through the rock band, so the block is one connected suite. `hint(i, j)`
  // may name a room's kit. Returns the rooms as rows[j][i].
  function roomGrid(ctx, x0, y0, w, h, cols, rows, hint) {
    const HG = 2, VG = ROCK_DEPTH;
    const cw = Math.floor((w - (cols - 1) * HG) / cols);
    const ch = Math.floor((h - (rows - 1) * VG) / rows);
    if (cw < 4 || ch < 4) return [];
    const grid = [];
    for (let j = 0; j < rows; j++) {
      const row = [];
      for (let i = 0; i < cols; i++) {
        const rx = x0 + i * (cw + HG), ry = y0 + j * (ch + VG);
        carveRect(ctx, rx, ry, cw, ch);
        row.push(pushRoom(ctx, rx, ry, cw, ch, hint ? hint(i, j) : null));
      }
      grid.push(row);
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const r = grid[j][i];
        if (i + 1 < cols) carveH(ctx, r.x + r.width - 1, grid[j][i + 1].x, r.y);
        if (j + 1 < rows && (i === 0 || ctx.rng() < 0.5)) {
          const dx = r.x + 1 + Math.floor(ctx.rng() * Math.max(1, r.width - 2));
          carveV(ctx, r.y + r.height - 1, grid[j + 1][i].y, dx);
        }
      }
    return grid;
  }
  // Join every room of a grid's bottom row to a hall below it.
  function dropDoors(ctx, rooms, hallTop) {
    for (const r of rooms) carveV(ctx, r.y + r.height - 1, hallTop, r.x + (r.width >> 1));
  }
  // A filled noisy blob: the organic layouts' building block.
  function carveBlob(ctx, cx, cy, rx, ry, rough) {
    const { width, height, MARGIN } = ctx;
    const n = valueNoise2D((ctx.seed ^ (cx * 7919 + cy * 104729)) | 0, 3);
    for (let y = cy - ry - 2; y <= cy + ry + 2; y++)
      for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
        if (x <= MARGIN || y <= MARGIN || x >= width - MARGIN - 1 || y >= height - MARGIN - 1) continue;
        const dx = (x - cx) / Math.max(1, rx), dy = (y - cy) / Math.max(1, ry);
        if (dx * dx + dy * dy <= 1 + (n(x, y) - 0.5) * (rough || 0.5)) ctx.carved[y][x] = true;
      }
  }
  // A wandering tunnel: momentum walk, `w` tiles wide, from (x, y) heading
  // roughly along (hx, hy). Returns the end point.
  function carveWalk(ctx, x, y, hx, hy, steps, w) {
    const { width, height, MARGIN, rng } = ctx;
    let ang = Math.atan2(hy, hx);
    for (let i = 0; i < steps; i++) {
      for (let dy = 0; dy < w; dy++)
        for (let dx = 0; dx < w; dx++) {
          const gx = clampTo(Math.round(x) + dx, MARGIN + 1, width - MARGIN - 2);
          const gy = clampTo(Math.round(y) + dy, MARGIN + 1, height - MARGIN - 2);
          ctx.carved[gy][gx] = true;
        }
      ang += (rng() - 0.5) * 0.7;
      // Drift back toward the heading so a tunnel goes somewhere.
      const want = Math.atan2(hy, hx);
      ang += Math.atan2(Math.sin(want - ang), Math.cos(want - ang)) * 0.15;
      x = clampTo(x + Math.cos(ang), MARGIN + 2, width - MARGIN - 3 - w);
      y = clampTo(y + Math.sin(ang), MARGIN + 2, height - MARGIN - 3 - w);
    }
    return { x: Math.round(x), y: Math.round(y) };
  }
  // Mark carved cells as standing water, keeping a dry rim: a cell is only
  // flooded when all four of its neighbours are floor.
  function floodCells(ctx, test) {
    for (let y = ctx.MARGIN + 1; y < ctx.height - ctx.MARGIN - 1; y++)
      for (let x = ctx.MARGIN + 1; x < ctx.width - ctx.MARGIN - 1; x++) {
        if (!ctx.carved[y][x] || !test(x, y)) continue;
        if (!ctx.isFloor(x - 1, y) || !ctx.isFloor(x + 1, y) || !ctx.isFloor(x, y - 1) || !ctx.isFloor(x, y + 1)) continue;
        ctx.waterCells.add(x + y * ctx.width);
      }
  }

  Object.assign(LAYOUTS, {
    // Shop floor (hardware store, grocery, general store): one long sales
    // floor behind the door, and the stockrooms and the office behind that.
    shopfloor(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const fw = width - MARGIN * 2 - 4 - Math.floor(rng() * 10);
      const fh = 16 + Math.floor(rng() * 8);
      const fx = MARGIN + 2 + Math.floor(rng() * Math.max(1, width - MARGIN * 2 - 4 - fw));
      const fy = height - MARGIN - 2 - fh;
      carveRect(ctx, fx, fy, fw, fh);
      // The floor takes the shop's own kit: a hardware store's is tools and
      // timber, a grocer's tins and crates (INTERIOR_PLANS main).
      const plan = INTERIOR_PLANS[ctx.S.key];
      pushRoom(ctx, fx, fy, fw, fh, (plan && plan.main) || "salesfloor");
      const backTop = MARGIN + 2, backH = fy - ROCK_DEPTH - backTop;
      const cols = 2 + Math.floor(rng() * 3), rows = backH >= 22 ? 2 : 1;
      const grid = roomGrid(ctx, fx, backTop, fw, backH, cols, rows, null);
      if (grid.length) dropDoors(ctx, grid[grid.length - 1], fy);
    },

    // Wards (hospital, clinic): a long corridor with wards either side, the
    // operating theatre at its head and reception where the party walks in.
    ward(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2);
      const recH = 7 + Math.floor(rng() * 3), recW = 16 + Math.floor(rng() * 8);
      const recY = height - MARGIN - 2 - recH;
      carveRect(ctx, cx - (recW >> 1), recY, recW, recH);
      pushRoom(ctx, cx - (recW >> 1), recY, recW, recH, "reception");
      const top = MARGIN + 12;
      carveV(ctx, top, recY, cx - 1, 3);
      pushRoom(ctx, cx - 1, top, 3, recY - top, "passage");
      const sw = 14 + Math.floor(rng() * 6), sh = 7 + Math.floor(rng() * 2);
      const theatre = addRoom(ctx, cx - (sw >> 1), MARGIN + 1, sw, sh, "surgery");
      carveV(ctx, theatre.y + sh - 1, top, cx, 2);
      const wardW = 9 + Math.floor(rng() * 4), wardH = 6 + Math.floor(rng() * 2);
      for (let y = Math.max(top + 1, theatre.y + sh + ROCK_DEPTH); y + wardH < recY - ROCK_DEPTH; y += wardH + ROCK_DEPTH) {
        for (const side of [-1, 1]) {
          if (rng() < 0.1) continue;
          const rx = side < 0 ? cx - 4 - wardW : cx + 4;
          const r = addRoom(ctx, rx, y, wardW, wardH, rng() < 0.75 ? "ward" : null);
          if (side < 0) carveH(ctx, r.x + wardW - 1, cx - 1, r.y);
          else carveH(ctx, cx + 1, r.x, r.y);
        }
      }
    },

    // Taproom (tavern, restaurant): the common room behind the door, the
    // kitchen and the cellar store behind the bar, the guest rooms beyond.
    taproom(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const tw = 26 + Math.floor(rng() * 14), th = 12 + Math.floor(rng() * 6);
      const tx = Math.floor((width - tw) / 2) + Math.floor(rng() * 7) - 3;
      const ty = height - MARGIN - 2 - th;
      carveRect(ctx, tx, ty, tw, th);
      pushRoom(ctx, tx, ty, tw, th, "taproom");
      const backTop = MARGIN + 2, backH = ty - ROCK_DEPTH - backTop;
      const gx = MARGIN + 2, gw = width - MARGIN * 2 - 4;
      const cols = 4 + Math.floor(rng() * 2), rows = backH >= 34 ? 3 : (backH >= 22 ? 2 : 1);
      let n = 0;
      const grid = roomGrid(ctx, gx, backTop, gw, backH, cols, rows, (i, j) => {
        const k = n++;
        if (j === rows - 1 && i === 0) return "kitchen";
        if (j === rows - 1 && i === 1) return "store";
        return k % 5 === 4 ? null : "bedroom";
      });
      if (grid.length) {
        const bottom = grid[grid.length - 1].filter((r) => r.x + r.width > tx && r.x < tx + tw);
        dropDoors(ctx, bottom.length ? bottom : [grid[grid.length - 1][0]], ty);
      }
    },

    // Factory floor: one great production hall (sometimes two, side by side)
    // with the offices and stores along its back wall.
    factory(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hy = MARGIN + 14 + Math.floor(rng() * 4);
      const hh = height - MARGIN - 2 - hy;
      const x0 = MARGIN + 2, wAll = width - MARGIN * 2 - 4;
      if (rng() < 0.35) {
        const w1 = Math.floor((wAll - 2) / 2);
        carveRect(ctx, x0, hy, w1, hh); pushRoom(ctx, x0, hy, w1, hh, "factory");
        carveRect(ctx, x0 + w1 + 2, hy, wAll - w1 - 2, hh); pushRoom(ctx, x0 + w1 + 2, hy, wAll - w1 - 2, hh, "factory");
        carveH(ctx, x0 + w1 - 1, x0 + w1 + 2, hy, 2);
      } else {
        carveRect(ctx, x0, hy, wAll, hh); pushRoom(ctx, x0, hy, wAll, hh, "factory");
      }
      const grid = roomGrid(ctx, x0, MARGIN + 2, wAll, hy - ROCK_DEPTH - MARGIN - 2, 3 + Math.floor(rng() * 2), 1, null);
      if (grid.length) dropDoors(ctx, grid[0], hy);
    },

    // House (farmhouse, a house, an abandoned one, a basement): a block of
    // rooms of a few sizes, a door through every wall between neighbours.
    house(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hw = 30 + Math.floor(rng() * (width - MARGIN * 2 - 34));
      const hh = 26 + Math.floor(rng() * (height - MARGIN * 2 - 30));
      const hx = Math.floor((width - hw) / 2), hy = height - MARGIN - 2 - hh;
      roomGrid(ctx, hx, hy, hw, hh, 2 + Math.floor(rng() * 2), 2 + Math.floor(rng() * 2), null);
    },

    // Keep (castle interior, a dungeon under one): a three by three block of
    // rooms around a great hall at its heart.
    keep(ctx) {
      const { width, height, MARGIN } = ctx;
      const grid = roomGrid(ctx, MARGIN + 2, MARGIN + 2, width - MARGIN * 2 - 4, height - MARGIN * 2 - 4, 3, 3, null);
      if (grid.length === 3) {
        // The heart of the keep. It is not widened: the bands either side of
        // it are only two tiles, and opening it into them merged the whole
        // middle row into one hall.
        grid[1][1].hint = "throneroom";
      }
    },

    // Great hall (a dwarven hold, a forge, a castle): one colossal pillared
    // hall with workshops and stores above and below it.
    greathall(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hw = width - MARGIN * 2 - 8 - Math.floor(rng() * 8);
      const hh = 14 + Math.floor(rng() * 6);
      const hx = Math.floor((width - hw) / 2), hy = MARGIN + 14;
      carveRect(ctx, hx, hy, hw, hh);
      pushRoom(ctx, hx, hy, hw, hh, "throneroom");
      const above = roomGrid(ctx, hx, MARGIN + 2, hw, hy - ROCK_DEPTH - MARGIN - 2, 3 + Math.floor(rng() * 2), 1, null);
      if (above.length) dropDoors(ctx, above[0], hy);
      const belowTop = hy + hh + ROCK_DEPTH;
      const below = roomGrid(ctx, hx, belowTop, hw, height - MARGIN - 2 - belowTop, 2 + Math.floor(rng() * 3), 1, null);
      if (below.length) for (const r of below[0]) carveV(ctx, hy + hh - 1, r.y, r.x + (r.width >> 1));
    },

    // Shaft (a deep mine): one vertical shaft from top to bottom with landings
    // cut off it on alternating sides, each a gallery ending in a working.
    shaft(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const sw = 4 + Math.floor(rng() * 2);
      const sx = Math.floor(width / 2) - (sw >> 1) + Math.floor(rng() * 9) - 4;
      carveV(ctx, MARGIN + 1, height - MARGIN - 2, sx, sw);
      pushRoom(ctx, sx, MARGIN + 1, sw, height - MARGIN * 2 - 3, "landing");
      let side = rng() < 0.5 ? -1 : 1;
      for (let y = MARGIN + 3; y < height - MARGIN - 9; y += 7 + Math.floor(rng() * 4)) {
        const len = 6 + Math.floor(rng() * 10);
        const gx0 = side < 0 ? Math.max(MARGIN + 2, sx - len) : sx + sw;
        const gx1 = side < 0 ? sx : Math.min(width - MARGIN - 3, sx + sw + len);
        carveRect(ctx, gx0, y, gx1 - gx0, 3);
        pushRoom(ctx, gx0, y, gx1 - gx0, 3, "passage");
        const cw = 7 + Math.floor(rng() * 5), ch = 5 + Math.floor(rng() * 3);
        const cx = side < 0 ? gx0 - cw + 2 : gx1 - 2;
        addRoom(ctx, cx, y, cw, ch, null);
        side = rng() < 0.75 ? -side : side;
      }
    },

    // Caldera (a magma chamber, a lair over the fire): one huge vault round a
    // lake of molten rock, side hollows off its rim.
    caldera(ctx) {
      const { rng, width, height } = ctx;
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2);
      const rx = 22 + Math.floor(rng() * 4), ry = 20 + Math.floor(rng() * 3);
      carveBlob(ctx, cx, cy, rx, ry, 0.35);
      const lx = Math.round(rx * (0.35 + rng() * 0.15)), ly = Math.round(ry * (0.3 + rng() * 0.15));
      for (let y = cy - ly; y <= cy + ly; y++)
        for (let x = cx - lx; x <= cx + lx; x++) {
          const dx = (x - cx) / lx, dy = (y - cy) / ly;
          if (dx * dx + dy * dy <= 1) { ctx.carved[y][x] = false; ctx.lakeMask[x + y * width] = 1; }
        }
      const nSide = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < nSide; i++) {
        const a = rng() * Math.PI * 2;
        carveBlob(ctx, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 4 + Math.floor(rng() * 3), 3 + Math.floor(rng() * 3), 0.6);
      }
      organicRoomGrid(ctx, 10, 30);
    },

    // Fissure (a glacier crevasse, a cracked cavern): long jagged cracks that
    // branch and meet, opening here and there into a wider hall.
    fissure(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const n = 3 + Math.floor(rng() * 3);
      const ends = [];
      for (let i = 0; i < n; i++) {
        const sx = MARGIN + 3 + Math.floor(rng() * (width - MARGIN * 2 - 6));
        const e = carveWalk(ctx, sx, MARGIN + 3, (rng() - 0.5) * 0.8, 1, 50 + Math.floor(rng() * 40), 2 + Math.floor(rng() * 2));
        ends.push(e);
        if (rng() < 0.7) carveWalk(ctx, e.x, e.y, rng() < 0.5 ? -1 : 1, 0.2, 20 + Math.floor(rng() * 20), 2);
      }
      for (let i = 0; i + 1 < ends.length; i++) carveWalk(ctx, ends[i].x, ends[i].y, ends[i + 1].x - ends[i].x, ends[i + 1].y - ends[i].y + 0.01, 40, 2);
      const halls = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < halls; i++) {
        const e = ends[Math.floor(rng() * ends.length)];
        carveBlob(ctx, e.x, e.y, 6 + Math.floor(rng() * 4), 5 + Math.floor(rng() * 3), 0.6);
      }
      organicRoomGrid(ctx, 10, 22);
    },

    // Burrow (an ant or termite nest, a creature's den): narrow winding
    // tunnels branching from the way in, a brood chamber at every end.
    burrow(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const stack = [{ x: Math.floor(width / 2), y: height - MARGIN - 6, a: -Math.PI / 2, depth: 0 }];
      let chambers = 0;
      while (stack.length && chambers < 16) {
        const b = stack.pop();
        const e = carveWalk(ctx, b.x, b.y, Math.cos(b.a), Math.sin(b.a), 8 + Math.floor(rng() * 8), 2);
        const r = 3 + Math.floor(rng() * 2);
        carveBlob(ctx, e.x, e.y, r + 1, r, 0.5);
        pushRoom(ctx, clampTo(e.x - r, MARGIN, width - MARGIN - 1), clampTo(e.y - r, MARGIN, height - MARGIN - 1), r * 2 + 1, r * 2, "brood");
        chambers++;
        if (b.depth < 3) {
          const kids = 2 + (rng() < 0.4 ? 1 : 0);
          for (let k = 0; k < kids; k++) stack.push({ x: e.x, y: e.y, a: b.a + (k - (kids - 1) / 2) * 0.9 + (rng() - 0.5) * 0.4, depth: b.depth + 1 });
        }
      }
    },

    // Roots (a root hollow, a fungal warren under a wood): tunnels groping
    // down from the surface like roots, hollows at their tips.
    roots(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        let p = { x: MARGIN + 4 + Math.floor(((width - MARGIN * 2 - 8) * (i + 0.5)) / n), y: MARGIN + 2 };
        for (let seg = 0; seg < 4; seg++) {
          p = carveWalk(ctx, p.x, p.y, (rng() - 0.5) * 1.2, 1, 8 + Math.floor(rng() * 8), 3 - Math.min(2, seg >> 1));
          if (rng() < 0.5) {
            const tip = carveWalk(ctx, p.x, p.y, rng() < 0.5 ? -1 : 1, 0.6, 8 + Math.floor(rng() * 6), 2);
            carveBlob(ctx, tip.x, tip.y, 4, 3, 0.6);
          }
        }
        carveBlob(ctx, p.x, p.y, 5 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 2), 0.5);
      }
      // Whatever the roots never reached is joined to them along the bottom.
      carveWalk(ctx, MARGIN + 4, height - MARGIN - 8, 1, 0, width - MARGIN * 2 - 10, 3);
      organicRoomGrid(ctx, 10, 25);
    },

    // River (karst caves, a sewer outfall, a grotto): an underground river
    // crossing the map, dry banks either side, fords to cross it by and
    // caverns opening off the banks.
    river(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cy = Math.floor(height / 2) + Math.floor(rng() * 9) - 4;
      const amp = 4 + rng() * 6, f = 0.08 + rng() * 0.08, ph = rng() * 6.28;
      const ww = 3 + Math.floor(rng() * 2), bank = 2 + Math.floor(rng() * 2);
      const fordEvery = 10 + Math.floor(rng() * 5), fordAt = Math.floor(rng() * fordEvery);
      const centre = [];
      for (let x = MARGIN; x < width - MARGIN; x++) {
        const y = Math.round(cy + Math.sin(x * f + ph) * amp);
        centre[x] = y;
        for (let dy = -bank - (ww >> 1); dy <= bank + ww - (ww >> 1); dy++) {
          const gy = clampTo(y + dy, MARGIN + 1, height - MARGIN - 2);
          ctx.carved[gy][x] = true;
        }
      }
      const isFord = (x) => (x - fordAt) % fordEvery < 2;
      ctx.afterCarve = () => floodCells(ctx, (x, y) => {
        if (centre[x] == null || isFord(x)) return false;
        const dy = y - centre[x];
        return dy >= -(ww >> 1) && dy < ww - (ww >> 1);
      });
      const nCav = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < nCav; i++) {
        const x = MARGIN + 6 + Math.floor(rng() * (width - MARGIN * 2 - 12));
        const up = rng() < 0.5;
        const by = centre[x] + (up ? -(10 + Math.floor(rng() * 8)) : 10 + Math.floor(rng() * 8));
        carveBlob(ctx, x, clampTo(by, MARGIN + 6, height - MARGIN - 7), 5 + Math.floor(rng() * 4), 4 + Math.floor(rng() * 3), 0.6);
        carveV(ctx, centre[x], clampTo(by, MARGIN + 6, height - MARGIN - 7), x, 2);
      }
      organicRoomGrid(ctx, 10, 26);
    },

    // Sinkhole (a cenote, a collapsed cavern): one great round drop with a
    // pool at its foot, ledges round it and caves off its rim.
    sinkhole(ctx) {
      const { rng, width, height } = ctx;
      const cx = Math.floor(width / 2) + Math.floor(rng() * 7) - 3, cy = Math.floor(height / 2) - 2;
      const r = 17 + Math.floor(rng() * 4);
      carveBlob(ctx, cx, cy, r + 2, r, 0.4);
      const pr = 6 + Math.floor(rng() * 4);
      ctx.afterCarve = () => floodCells(ctx, (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= pr * pr);
      const nCave = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < nCave; i++) {
        const a = (Math.PI * 2 * i) / nCave + rng() * 0.6;
        carveBlob(ctx, Math.round(cx + Math.cos(a) * (r + 4)), Math.round(cy + Math.sin(a) * (r + 3)), 4 + Math.floor(rng() * 3), 3 + Math.floor(rng() * 2), 0.6);
      }
      organicRoomGrid(ctx, 10, 26);
    },

    // Pyramid (a sand tomb, a barrow, a profane temple): concentric corridors
    // each opening onto the next at one side only, so the way to the burial
    // chamber at the heart winds all the way round.
    pyramid(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      let x0 = MARGIN + 2, y0 = MARGIN + 2, x1 = width - MARGIN - 3, y1 = height - MARGIN - 3;
      const rings = [];
      for (let i = 0; i < 4; i++) {
        const cw = 2 + (i === 1 ? 2 : 0);
        if (x1 - x0 < 20 || y1 - y0 < 18) break;
        carveH(ctx, x0, x1, y0, cw); carveH(ctx, x0, x1, y1 - cw + 1, cw);
        carveV(ctx, y0, y1, x0, cw); carveV(ctx, y0, y1, x1 - cw + 1, cw);
        pushRoom(ctx, x0, y0, x1 - x0 + 1, cw, cw >= 4 ? "tombs" : "passage");
        rings.push({ x0, y0, x1, y1, cw });
        x0 += cw + 2; x1 -= cw + 2; y0 += cw + ROCK_DEPTH; y1 -= cw + ROCK_DEPTH;
      }
      if (x1 - x0 >= 6 && y1 - y0 >= 5) {
        carveRect(ctx, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        pushRoom(ctx, x0, y0, x1 - x0 + 1, y1 - y0 + 1, "sanctum");
      }
      // One opening between each ring and the next, never on the same side:
      // the sides turn by one ring to ring, from a rolled start.
      const turn = Math.floor(rng() * 4);
      for (let i = 0; i < rings.length; i++) {
        const o = rings[i];
        const inner = rings[i + 1] || { x0, y0, x1, y1, cw: 1 };
        const side = (i + turn) % 4;
        const mx = (o.x0 + o.x1) >> 1;
        if (side === 0) carveV(ctx, o.y0, inner.y0, mx, 2);
        else if (side === 1) carveV(ctx, inner.y1, o.y1, mx, 2);
        else if (side === 2) carveH(ctx, o.x0, inner.x0, inner.y0, 1);
        else carveH(ctx, inner.x1, o.x1, inner.y0, 1);
      }
    },

    // Cove (a smugglers' cove, a sea cave): a cavern round a lagoon, rough
    // timber docks along its edge and storerooms dug off the back.
    cove(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = MARGIN + 18 + Math.floor(rng() * 8), cy = Math.floor(height / 2) + 4;
      const rx = 15 + Math.floor(rng() * 4), ry = 13 + Math.floor(rng() * 4);
      carveBlob(ctx, cx, cy, rx, ry, 0.5);
      const lx = Math.round(rx * 0.55), ly = Math.round(ry * 0.5);
      ctx.afterCarve = () => floodCells(ctx, (x, y) => ((x - cx) / lx) ** 2 + ((y - cy) / ly) ** 2 <= 1);
      const nDock = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < nDock; i++) {
        const dx = cx - lx + Math.floor(rng() * lx * 2) - 3, dy = i % 2 ? cy + ly - 1 : cy - ly - 3;
        pushRoom(ctx, clampTo(dx, MARGIN + 1, width - MARGIN - 8), clampTo(dy, MARGIN + 1, height - MARGIN - 5), 7, 4, "dock");
      }
      const sx = cx + rx + 3;
      const grid = roomGrid(ctx, sx, MARGIN + 4, width - MARGIN - 2 - sx, height - MARGIN * 2 - 8, 1 + Math.floor(rng() * 2), 2, null);
      for (const row of grid) for (const r of row) connectToPlan(ctx, r.x, r.y, 2, r);
    },

    // Maze (maintenance tunnels, a catacomb, a bunker's ducts): a true maze of
    // two-wide passages, with a few rooms opened out of its blocks.
    maze(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const PX = 4, PY = 2 + ROCK_DEPTH;
      const gx = Math.floor((width - MARGIN * 2 - 4) / PX), gy = Math.floor((height - MARGIN * 2 - 4) / PY);
      const ox = MARGIN + 2, oy = MARGIN + 2;
      const cell = (i, j) => ({ x: ox + i * PX, y: oy + j * PY });
      const seen = new Uint8Array(gx * gy);
      const stack = [[Math.floor(gx / 2), gy - 1]];
      seen[stack[0][0] + stack[0][1] * gx] = 1;
      const join = (a, b) => {
        const A = cell(a[0], a[1]), B = cell(b[0], b[1]);
        if (A.y === B.y) carveRect(ctx, Math.min(A.x, B.x), A.y, Math.abs(A.x - B.x) + 2, 2);
        else carveRect(ctx, A.x, Math.min(A.y, B.y), 2, Math.abs(A.y - B.y) + 2);
      };
      carveRect(ctx, cell(stack[0][0], stack[0][1]).x, cell(stack[0][0], stack[0][1]).y, 2, 2);
      while (stack.length) {
        const [i, j] = stack[stack.length - 1];
        const next = shuffled(ctx, [[1, 0], [-1, 0], [0, 1], [0, -1]])
          .map(([dx, dy]) => [i + dx, j + dy])
          .filter(([a, b]) => a >= 0 && b >= 0 && a < gx && b < gy && !seen[a + b * gx]);
        if (!next.length) { stack.pop(); continue; }
        const n = next[0];
        seen[n[0] + n[1] * gx] = 1;
        join([i, j], n);
        stack.push(n);
      }
      // Loops, so it is a maze one can be chased round.
      for (let k = 0; k < gx * gy * 0.08; k++) {
        const i = Math.floor(rng() * (gx - 1)), j = Math.floor(rng() * gy);
        join([i, j], [i + 1, j]);
      }
      const nRooms = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < nRooms; k++) {
        const i = Math.floor(rng() * (gx - 2)), j = Math.floor(rng() * (gy - 1));
        const A = cell(i, j), B = cell(i + 2, j + 1);
        carveRect(ctx, A.x, A.y, B.x - A.x + 2, B.y - A.y + 2);
        pushRoom(ctx, A.x, A.y, B.x - A.x + 2, B.y - A.y + 2, null);
      }
    },

    // Undercroft (a church's, a crypt's, a cistern's): a low vaulted hall on
    // rows of piers, with chapels opening off its north side.
    undercroft(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const hw = width - MARGIN * 2 - 6 - Math.floor(rng() * 8), hh = 18 + Math.floor(rng() * 6);
      const hx = Math.floor((width - hw) / 2), hy = height - MARGIN - 2 - hh;
      carveRect(ctx, hx, hy, hw, hh);
      pushRoom(ctx, hx, hy, hw, hh, null);
      const bay = 5 + Math.floor(rng() * 2);
      for (let y = hy + 3; y + 2 < hy + hh - 2; y += bay)
        for (let x = hx + 3; x + 2 < hx + hw - 2; x += bay) {
          ctx.carved[y][x] = false; ctx.carved[y][x + 1] = false;
          ctx.carved[y + 1][x] = false; ctx.carved[y + 1][x + 1] = false;
        }
      const grid = roomGrid(ctx, hx, MARGIN + 2, hw, hy - ROCK_DEPTH - MARGIN - 2, 3 + Math.floor(rng() * 2), hy - MARGIN > 30 ? 2 : 1, null);
      if (grid.length) dropDoors(ctx, grid[grid.length - 1], hy);
    },

    // Shards (a void rift, a shattered geode): islands of floor in the dark,
    // strung together by narrow causeways.
    shards(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const pts = [];
      for (let tries = 0; tries < 200 && pts.length < 9; tries++) {
        const p = { x: MARGIN + 8 + Math.floor(rng() * (width - MARGIN * 2 - 16)), y: MARGIN + 8 + Math.floor(rng() * (height - MARGIN * 2 - 16)) };
        if (pts.some((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < 15)) continue;
        pts.push(p);
      }
      for (const p of pts) {
        const rx = 4 + Math.floor(rng() * 4), ry = 4 + Math.floor(rng() * 3);
        carveBlob(ctx, p.x, p.y, rx, ry, 0.6);
        pushRoom(ctx, p.x - rx, p.y - ry, rx * 2 + 1, ry * 2 + 1, null);
      }
      // A spanning tree of causeways, nearest first.
      const inTree = [0];
      while (inTree.length < pts.length) {
        let best = null;
        for (const a of inTree)
          for (let b = 0; b < pts.length; b++) {
            if (inTree.includes(b)) continue;
            const d = Math.abs(pts[a].x - pts[b].x) + Math.abs(pts[a].y - pts[b].y);
            if (!best || d < best.d) best = { a, b, d };
          }
        const A = pts[best.a], B = pts[best.b];
        carveH(ctx, A.x, B.x, A.y, 2);
        carveV(ctx, A.y, B.y, B.x, 2);
        inTree.push(best.b);
      }
    },

    // Galleries (a wine cellar, catacomb loculi, library stacks): long
    // parallel vaulted aisles tied together by a hall at one or both ends.
    galleries(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const gw = 30 + Math.floor(rng() * (width - MARGIN * 2 - 40));
      const gx = Math.floor((width - gw) / 2);
      const gh = 4 + Math.floor(rng() * 2);
      const tops = [];
      for (let y = MARGIN + 3; y + gh < height - MARGIN - 4; y += gh + ROCK_DEPTH) {
        carveRect(ctx, gx, y, gw, gh);
        pushRoom(ctx, gx, y, gw, gh, null);
        tops.push(y);
      }
      const hw = 4;
      carveV(ctx, tops[0], height - MARGIN - 3, gx - hw, hw);
      pushRoom(ctx, gx - hw, tops[0], hw, height - MARGIN - 3 - tops[0], "passage");
      for (const y of tops) carveH(ctx, gx - 1, gx, y, gh);
      if (rng() < 0.5) {
        carveV(ctx, tops[0], tops[tops.length - 1] + gh - 1, gx + gw, hw);
        for (const y of tops) carveH(ctx, gx + gw - 1, gx + gw, y, gh);
      }
    },

    // Strata (salt works, a fossil bed, a mine following a seam): long
    // horizontal seams worked one above the other, joined by ramps at
    // alternating ends.
    strata(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const seams = [];
      for (let y = MARGIN + 3; y + 5 < height - MARGIN - 3; y += 5 + ROCK_DEPTH + Math.floor(rng() * 3)) {
        const h = 4 + Math.floor(rng() * 2);
        const x0 = MARGIN + 2 + Math.floor(rng() * 8), x1 = width - MARGIN - 3 - Math.floor(rng() * 8);
        carveRect(ctx, x0, y, x1 - x0, h);
        pushRoom(ctx, x0, y, x1 - x0, h, null);
        seams.push({ x0, x1, y, h });
        // Pockets where the seam ran thick.
        if (rng() < 0.6) carveBlob(ctx, x0 + Math.floor(rng() * (x1 - x0)), y + (h >> 1), 3 + Math.floor(rng() * 3), 2, 0.5);
      }
      for (let i = 0; i + 1 < seams.length; i++) {
        const a = seams[i], b = seams[i + 1];
        const x = i % 2 ? Math.max(a.x0, b.x0) + 1 : Math.min(a.x1, b.x1) - 3;
        carveV(ctx, a.y, b.y, x, 2);
      }
    },

    // Hull (a buried wreck): a ship's hull lying on its side in the rock,
    // its length divided by bulkheads into holds, a brig and a cabin.
    hull(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const L = width - MARGIN * 2 - 8, beam = 20 + Math.floor(rng() * 6);
      const x0 = MARGIN + 4, cy = Math.floor(height / 2);
      const bulk = 9 + Math.floor(rng() * 3);
      const comps = [];
      for (let x = x0; x < x0 + L - 4; x += bulk + 2) {
        const cxr = (x + bulk / 2 - (x0 + L / 2)) / (L / 2);
        const half = Math.max(4, Math.round((beam / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(cxr), 2.4)))));
        const w = Math.min(bulk, x0 + L - x);
        carveRect(ctx, x, cy - half, w, half * 2);
        comps.push(pushRoom(ctx, x, cy - half, w, half * 2, rng() < 0.7 ? "hold" : null));
      }
      for (let i = 0; i + 1 < comps.length; i++) {
        const a = comps[i], b = comps[i + 1];
        carveH(ctx, a.x + a.width - 1, b.x, Math.max(a.y, b.y), 2);
      }
    },

    // Arena (fighting pits under a castle, an oubliette's games): a sanded pit
    // ringed by a corridor, the cells and the armoury along the ring.
    arena(ctx) {
      const { rng, width, height, MARGIN } = ctx;
      const cx = Math.floor(width / 2), cy = Math.floor(height / 2) + 2;
      const pw = 20 + Math.floor(rng() * 8), ph = 12 + Math.floor(rng() * 4);
      const px = cx - (pw >> 1), py = cy - (ph >> 1);
      carveRect(ctx, px, py, pw, ph);
      pushRoom(ctx, px, py, pw, ph, "pit");
      const rx0 = px - 4, rx1 = px + pw + 2, ry0 = py - ROCK_DEPTH - 2, ry1 = py + ph + ROCK_DEPTH;
      carveH(ctx, rx0, rx1 + 1, ry0, 2); carveH(ctx, rx0, rx1 + 1, ry1, 2);
      carveV(ctx, ry0, ry1 + 1, rx0, 2); carveV(ctx, ry0, ry1 + 1, rx1, 2);
      pushRoom(ctx, rx0, ry0, rx1 - rx0 + 2, 2, "passage");
      carveV(ctx, ry0 + 1, py, cx - 1, 2);
      carveV(ctx, py + ph - 1, ry1, cx + 1, 2);
      const above = roomGrid(ctx, rx0, MARGIN + 2, rx1 - rx0 + 2, ry0 - ROCK_DEPTH - MARGIN - 2, 3 + Math.floor(rng() * 2), 1, null);
      if (above.length) dropDoors(ctx, above[0], ry0);
      const belowTop = ry1 + 2 + ROCK_DEPTH;
      if (height - MARGIN - 2 - belowTop >= 5) {
        const below = roomGrid(ctx, rx0, belowTop, rx1 - rx0 + 2, height - MARGIN - 2 - belowTop, 3, 1, null);
        if (below.length) for (const r of below[0]) carveV(ctx, ry1 + 1, r.y, r.x + (r.width >> 1));
      }
    },
  });

  // An organic carve publishes no rectangles of its own, and everything that
  // dresses a structure works room by room. Lay a coarse grid over the carve
  // and keep the cells that are mostly floor: those are the "rooms" of a cave,
  // the places a mushroom bed or a scatter of bones can be aimed at. `size` is
  // the cell, `minFloor` how many floor tiles one must hold to count.
  function organicRoomGrid(ctx, size, minFloor) {
    const { width, height, MARGIN, carved } = ctx;
    for (let gy = MARGIN; gy + size <= height - MARGIN; gy += size)
      for (let gx = MARGIN; gx + size <= width - MARGIN; gx += size) {
        let n = 0;
        for (let y = gy; y < gy + size; y++) for (let x = gx; x < gx + size; x++) if (carved[y][x]) n++;
        if (n >= minFloor) pushRoom(ctx, gx, gy, size, size);
      }
  }

  // --- 2. Border margin, phantom rooms ---------------------------------------
  function clipToMargin(ctx) {
    const { width, height, MARGIN, carved, rooms } = ctx;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (x < MARGIN || x >= width - MARGIN || y < MARGIN || y >= height - MARGIN) carved[y][x] = false;
    // The clip can erase a room outright, and a phantom rectangle is worse
    // than none: every dressing pass aims at rooms, and one aimed at a room
    // that is not there silently places nothing.
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
    if (!rooms.length) {
      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (carved[y][x]) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
      if (maxX >= minX) rooms.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }

  // --- 3. Entrance: a corridor from the plan down to the south border -------
  function carveEntrance(ctx) {
    const { width, height, MARGIN, carved } = ctx;
    let target = null, best = Infinity;
    const tcx = Math.floor(width / 2);
    for (let y = MARGIN; y < height - MARGIN; y++)
      for (let x = MARGIN; x < width - MARGIN; x++) {
        if (!carved[y][x]) continue;
        const dist = (height - 1 - y) * 2 + Math.abs(x - tcx);
        if (dist < best) { best = dist; target = { x, y }; }
      }
    if (!target) {
      const rx = tcx - 3, ry = Math.floor(height / 2) - 3;
      carveRect(ctx, rx, ry, 6, 6);
      ctx.rooms.push({ x: rx, y: ry, width: 6, height: 6 });
      target = { x: tcx, y: ry };
    }
    const bx = Math.max(MARGIN, Math.min(width - MARGIN - 1, target.x));
    if (ctx.sealEntrance) {
      // No corridor through the margin at all. entranceX/Y are read as "how
      // far from the door should a chest be", so they point at the room the
      // flood starts from rather than at nothing.
      carveH(ctx, bx, target.x, target.y);
      ctx.spawnX = target.x; ctx.spawnY = target.y; ctx.spawnDir = 2;
      ctx.entranceX = target.x; ctx.entranceY = target.y;
    } else {
      carveV(ctx, target.y, height - 1, bx);
      carveH(ctx, bx, target.x, target.y);
      ctx.spawnX = bx; ctx.spawnY = height - 2; ctx.spawnDir = 8;
      ctx.entranceX = bx; ctx.entranceY = height - 1;
    }
    // The way in is sacred: a prop on the entrance corridor walls the party
    // in at the door, on the one tile they cannot walk around.
    const protectedTiles = new Set();
    for (let y = Math.min(target.y, ctx.spawnY) - 1; y <= height - 1; y++) {
      if (y < 0) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const px = bx + dx;
        if (px >= 0 && px < width) protectedTiles.add(px + y * width);
      }
    }
    for (let x = Math.min(bx, target.x); x <= Math.max(bx, target.x); x++) protectedTiles.add(x + target.y * width);
    ctx.protectedTiles = protectedTiles;
    ctx.entranceColumn = bx;
  }

  // --- 4. Every carved tile reachable from the way in ------------------------
  // One pocket is joined per turn and a plan can hold a dozen, so the guard is
  // generous: stopping early is exactly the bug this pass exists to prevent.
  function joinOrphans(ctx) {
    const { width, height, MARGIN, carved } = ctx;
    for (let guard = 0; guard < 40; guard++) {
      const seen = floodFrom(ctx, ctx.spawnX, ctx.spawnY, (x, y) => carved[y][x]);
      let orphan = null;
      for (let y = MARGIN; y < height - MARGIN && !orphan; y++)
        for (let x = MARGIN; x < width - MARGIN; x++)
          if (carved[y][x] && !seen[x + y * width]) { orphan = { x, y }; break; }
      if (!orphan) return;
      let near = null, nearD = Infinity;
      for (let y = MARGIN; y < height - MARGIN; y++)
        for (let x = MARGIN; x < width - MARGIN; x++) {
          if (!seen[x + y * width]) continue;
          const d = Math.abs(x - orphan.x) + Math.abs(y - orphan.y);
          if (d < nearD) { nearD = d; near = { x, y }; }
        }
      if (!near) return;
      carveH(ctx, orphan.x, near.x, orphan.y);
      carveV(ctx, orphan.y, near.y, near.x);
    }
  }

  // --- 5. Walls: shape the carve by how its walls came to be -----------------
  function shapeWalls(ctx) {
    if (ctx.style === "natural") {
      erodeOutline(ctx, true);
      biteAlcoves(ctx, 5 + Math.floor(ctx.rng() * 7));
      joinOrphans(ctx);
    } else if (ctx.style === "hewn") {
      erodeOutline(ctx, false);
    } else if (ctx.style === "ruined") {
      // Breaches: the wall worn back in patches and broken through in a few
      // places, never pushed in, so no room loses its floor.
      erodeOutline(ctx, false);
      biteAlcoves(ctx, 3 + Math.floor(ctx.rng() * 5));
    }
    // The depth pass pushes floor off the topmost rows the margin allows, and
    // floor up there can be the only thing joining a pocket to the rest (an
    // eroded outline puts it there far more often than a ruled one). So the
    // two alternate until the carve is whole; anything still cut off after
    // that is filled in rather than left as floor nobody can stand on.
    for (let i = 0; i < 4; i++) {
      normaliseRock(ctx);
      if (!orphanedFloor(ctx)) return;
      joinOrphans(ctx);
    }
    const seen = floodFrom(ctx, ctx.spawnX, ctx.spawnY, (x, y) => ctx.carved[y][x]);
    for (let y = 0; y < ctx.height; y++)
      for (let x = 0; x < ctx.width; x++)
        if (ctx.carved[y][x] && !seen[x + y * ctx.width]) ctx.carved[y][x] = false;
    normaliseRock(ctx);
  }

  function orphanedFloor(ctx) {
    const seen = floodFrom(ctx, ctx.spawnX, ctx.spawnY, (x, y) => ctx.carved[y][x]);
    for (let y = 0; y < ctx.height; y++)
      for (let x = 0; x < ctx.width; x++)
        if (ctx.carved[y][x] && !seen[x + y * ctx.width]) return true;
    return false;
  }

  // Wear the outline of the carve. Within two tiles of the rock face, value
  // noise decides where the rock has been worn back (carved out) and, for a
  // natural wall, where it bulges in (filled). A hewn wall is only ever cut
  // back, never pushed in, so a passage dug to a width keeps that width; a
  // natural one does both and is smoothed after with one cellular pass, which
  // is what turns noise into rock. The entrance corridor is never touched.
  function erodeOutline(ctx, natural) {
    const { width, height, MARGIN, carved, seed } = ctx;
    const coarse = valueNoise2D(seed ^ 0x51ED, natural ? 5 : 3);
    const fine = valueNoise2D(seed ^ 0xA11C, 2);
    const band = new Uint8Array(width * height);
    for (let y = MARGIN; y < height - MARGIN; y++)
      for (let x = MARGIN; x < width - MARGIN; x++) {
        const me = carved[y][x];
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (carved[ny][nx] !== me) { edge = true; break; }
          }
        if (edge) band[x + y * width] = 1;
      }
    const fillAt = natural ? 0.3 : -1;
    const cutAt = natural ? 0.68 : 0.72;
    const next = carved.map((row) => row.slice());
    for (let y = MARGIN + 1; y < height - MARGIN - 1; y++)
      for (let x = MARGIN + 1; x < width - MARGIN - 1; x++) {
        const k = x + y * width;
        if (!band[k] || ctx.protectedTiles.has(k)) continue;
        const n = coarse(x, y) * 0.7 + fine(x, y) * 0.3;
        if (carved[y][x] && n < fillAt) next[y][x] = false;
        else if (!carved[y][x] && n > cutAt) next[y][x] = true;
      }
    if (natural) {
      // One smoothing pass, banded, so the noise reads as rock and not as
      // speckle: a tile goes with the majority of its eight neighbours.
      const src = next.map((row) => row.slice());
      for (let y = MARGIN + 1; y < height - MARGIN - 1; y++)
        for (let x = MARGIN + 1; x < width - MARGIN - 1; x++) {
          const k = x + y * width;
          if (!band[k] || ctx.protectedTiles.has(k)) continue;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && src[y + dy][x + dx]) n++;
          if (n >= 6) next[y][x] = true;
          else if (n <= 2) next[y][x] = false;
        }
    }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) carved[y][x] = next[y][x];
  }

  // Natural rock is pocked with hollows a built wall never has: small round
  // bites taken out of the face, each opening off the floor it fronts.
  function biteAlcoves(ctx, count) {
    const { width, height, MARGIN, carved, rng } = ctx;
    const faces = [];
    for (let y = MARGIN + 3; y < height - MARGIN - 3; y++)
      for (let x = MARGIN + 3; x < width - MARGIN - 3; x++) {
        if (carved[y][x]) continue;
        let floorN = 0;
        for (const [dx, dy] of DIRS4) if (carved[y + dy][x + dx]) floorN++;
        if (floorN === 1) faces.push({ x, y });
      }
    for (let i = 0; i < count && faces.length; i++) {
      const f = faces.splice(Math.floor(rng() * faces.length), 1)[0];
      const rx = 1 + Math.floor(rng() * 2), ry = 1 + Math.floor(rng() * 2);
      for (let dy = -ry; dy <= ry; dy++)
        for (let dx = -rx; dx <= rx; dx++) {
          const gx = f.x + dx, gy = f.y + dy;
          if (gx <= MARGIN || gy <= MARGIN || gx >= width - MARGIN - 1 || gy >= height - MARGIN - 1) continue;
          if ((dx * dx) / (rx * rx + 0.5) + (dy * dy) / (ry * ry + 0.5) <= 1) carved[gy][gx] = true;
        }
    }
  }

  // Uniform rock depth above every floor tile. A wall face stands on the rock
  // north of a floor tile and is capped by one ceiling row, so a band of rock
  // thinner than WALL_HEIGHT + 1 draws a shorter face than its neighbour, or
  // (one row thin) no face at all, leaving a ceiling tile sitting straight on
  // the floor. Thin dividers are opened (connectivity only grows); a band the
  // map edge caps pushes the floor down instead. A built wall also has every
  // jog shorter than a face levelled, so each corner is a full wall tall; a
  // hewn or natural one keeps its jogs, because a rock face that steps is what
  // rock looks like. Every style loses one-tile fins, the one shape the blob
  // autotile cannot corner round.
  function normaliseRock(ctx) {
    const { width, height, carved } = ctx;
    const levelNicks = ctx.style === "built";
    for (let pass = 0; pass < 24; pass++) {
      let changed = false;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || (y > 0 && carved[y - 1][x])) continue;
          let depth = 0;
          while (y - 1 - depth >= 0 && !carved[y - 1 - depth][x]) depth++;
          if (depth >= ROCK_DEPTH) continue;
          if (y - 1 - depth < 0) carved[y][x] = false;
          else for (let k = 1; k <= depth; k++) carved[y - k][x] = true;
          changed = true;
        }
      if (levelNicks) {
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            if (!carved[y][x] || (y > 0 && carved[y - 1][x])) continue;
            for (const dx of [-1, 1]) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
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
      for (let y = 0; y < height; y++)
        for (let x = 1; x < width - 1; x++) {
          if (carved[y][x] || !carved[y][x - 1] || !carved[y][x + 1]) continue;
          carved[y][x] = true;
          changed = true;
        }
      if (!changed) break;
    }
  }

  // --- 6. The shell: floor, wall faces, ceiling ------------------------------
  // How tall the face standing north of the floor at column x is. A built wall
  // is always the full WALL_HEIGHT. A hewn face runs two or three tiles in
  // stretches; a natural one wanders between one and three along the rock.
  function faceHeightFn(ctx) {
    if (ctx.style === "built") return () => WALL_HEIGHT;
    const n = valueNoise2D(ctx.seed ^ 0xFACE, ctx.style === "natural" ? 4 : 6);
    if (ctx.style === "hewn" || ctx.style === "ruined") return (x, y) => (n(x, y) < 0.35 ? 2 : 3);
    return (x, y) => {
      const v = n(x, y);
      return v < 0.25 ? 1 : (v < 0.6 ? 2 : 3);
    };
  }

  function renderShell(ctx) {
    const { width, height, carved, pal } = ctx;
    const mapData = new Array(width * height * 4).fill(0);
    ctx.mapData = mapData;
    const idx0 = (x, y) => calculateIndex(x, y, 0, width, height);
    // ceilingMask marks every cell painted as rock ceiling, real A4 blend or
    // the flat rim tile alike, so later passes (lavaFlow) can ask "is this
    // rock" without caring which of the two drew it.
    const ceilingMask = Array.from({ length: height }, () => new Array(width).fill(false));
    const wallCells = Array.from({ length: height }, () => new Array(width).fill(false));
    ctx.ceilingMask = ceilingMask;
    ctx.wallCells = wallCells;
    const faceH = faceHeightFn(ctx);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (!carved[y][x] || ctx.isFloor(x, y - 1)) continue;
        let depth = 0;
        while (y - 1 - depth >= 0 && !carved[y - 1 - depth][x]) depth++;
        // The topmost rock row is always left to the ceiling, so a face is
        // never drawn with open space above it.
        const wallH = Math.min(faceH(x, y), depth - 1);
        // A lava lake is open ground, not rock: no face rises out of it.
        for (let k = 1; k <= wallH; k++) {
          if (ctx.lakeMask[x + (y - k) * width]) break;
          wallCells[y - k][x] = true;
        }
      }
    const isWallCell = (x, y) => x >= 0 && x < width && y >= 0 && y < height && wallCells[y][x];
    if (pal.wallA4) {
      // Real A4 blob walls. Both kinds are blended against their own kind's
      // cardinal neighbours, exactly as the map editor bakes a hand-painted
      // autotile. The ceiling is the SOLID FILL of the whole dead mass: a blob
      // autotile only reads as rock when it is a filled region.
      const isLake = (x, y) => !!ctx.lakeMask[x + y * width] && !carved[y][x];
      const isCeil = (x, y) => x >= 0 && x < width && y >= 0 && y < height && !carved[y][x] && !wallCells[y][x] && !isLake(x, y);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (carved[y][x]) mapData[idx0(x, y)] = pal.main;
          else if (isLake(x, y) && pal.lava) mapData[idx0(x, y)] = pal.lava;
          else if (wallCells[y][x]) {
            mapData[idx0(x, y)] = wallAutotileId(pal.wallA4.side,
              isWallCell(x - 1, y), isWallCell(x + 1, y), isWallCell(x, y - 1), isWallCell(x, y + 1));
          } else {
            ceilingMask[y][x] = true;
            mapData[idx0(x, y)] = ceilingAutotileId(pal.wallA4.top,
              isCeil(x - 1, y), isCeil(x + 1, y), isCeil(x, y - 1), isCeil(x, y + 1));
          }
        }
    } else {
      // A tileset with no registered A4 sheet: the flat rim tile in a thin
      // band round the plan (deeper to the north, where the faces stand), the
      // void beyond it, and the 3-tile wall column on the faces.
      const ROCK_RIM = 2, ROCK_RIM_SIDE = 1;
      const near = Array.from({ length: height }, () => new Array(width).fill(false));
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (!carved[y][x]) continue;
          for (let dy = -ROCK_RIM; dy <= ROCK_RIM_SIDE; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            const rim = dy < 0 ? ROCK_RIM : ROCK_RIM_SIDE;
            for (let dx = -rim; dx <= rim; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < width) near[ny][nx] = true;
            }
          }
        }
      const wall = pal.wall;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (carved[y][x]) { mapData[idx0(x, y)] = pal.main; continue; }
          if (wallCells[y][x]) {
            // Count down from the floor: bottom, middle, top of the column.
            let k = 1;
            while (y + k < height && !carved[y + k][x]) k++;
            mapData[idx0(x, y)] = k === 1 ? wall.bot : (k === 2 ? wall.mid : wall.top);
          } else if (near[y][x]) {
            ceilingMask[y][x] = true;
            mapData[idx0(x, y)] = pal.rim;
          }
        }
    }
  }

  // --- 7. Room floors: one accent and one pattern per room -------------------
  // Corridors keep the main texture, which holds the place together; a room
  // lays its own accent over it. Only carved tiles are painted.
  function paintRoomFloors(ctx) {
    const { width, height, carved, pal, rng, mapData } = ctx;
    const setFloorTile = (x, y, tile) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      if (!carved[y][x] || !tile) return;
      mapData[calculateIndex(x, y, 0, width, height)] = tile;
    };
    for (const r of ctx.rooms) {
      if (r.width < 3 || r.height < 3) continue;
      let kind = pal.patterns[Math.floor(rng() * pal.patterns.length)];
      // A pattern laid over a hall that fills the map stops being a pattern
      // and becomes the floor, so a big space only ever gets an edging.
      if (r.width * r.height > 700 && kind !== "border") kind = rng() < 0.5 ? "border" : "none";
      if (kind === "none") continue;
      const accent = pal.accents[Math.floor(rng() * pal.accents.length)];
      paintPattern(setFloorTile, r, pal.main, accent, kind, rng);
    }
  }

  // --- 8. Water, tide pools, lava: what the ground IS -------------------------
  // A flooded tile must have floor above AND below it, so a channel can never
  // cut the plan in two.
  function layGroundOrnaments(ctx) {
    const { width, height, MARGIN, carved, pal, rng, mapData } = ctx;
    const regiondata = new Array(width * height).fill(0);
    ctx.regiondata = regiondata;
    const waterTile = pal.water;
    const floodRow = (cy, bandWidth = 1) => {
      for (let x = MARGIN; x < width - MARGIN; x++) {
        if (!ctx.isFloor(x, cy - 1) || !ctx.isFloor(x, cy + bandWidth)) continue;
        let clear = true;
        for (let dy = 0; dy < bandWidth; dy++) if (!ctx.isFloor(x, cy + dy)) { clear = false; break; }
        if (!clear) continue;
        for (let dy = 0; dy < bandWidth; dy++) {
          if (ctx.protectedTiles.has(x + (cy + dy) * width)) continue;
          mapData[calculateIndex(x, cy + dy, 0, width, height)] = waterTile;
          regiondata[(cy + dy) * width + x] = 99;
        }
      }
    };
    // The layout's own standing water: a river, a cenote's pool, a lagoon.
    if (waterTile) {
      for (const k of ctx.waterCells) {
        const x = k % width, y = (k / width) | 0;
        if (!carved[y][x] || ctx.protectedTiles.has(k)) continue;
        mapData[calculateIndex(x, y, 0, width, height)] = waterTile;
        regiondata[k] = 99;
      }
    }
    if (waterTile && ctx.hasOrnament("waterLanes")) {
      if (ctx.canalRows.length) for (const cy of ctx.canalRows) floodRow(cy, ctx.sewerWaterWidth);
      else {
        const pitch = 6 + Math.floor(rng() * 3);
        for (let cy = MARGIN + 5; cy < height - MARGIN - 4; cy += pitch) floodRow(cy);
      }
    }
    if (waterTile && ctx.hasOrnament("tidePool")) {
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
            if (!ctx.isFloor(gx, gy) || !ctx.isFloor(gx, gy - 1) || !ctx.isFloor(gx, gy + 1)) continue;
            if (!ctx.isFloor(gx - 1, gy) || !ctx.isFloor(gx + 1, gy)) continue;
            mapData[calculateIndex(gx, gy, 0, width, height)] = waterTile;
            regiondata[gy * width + gx] = 99;
          }
      }
    }
    if (pal.lava && ctx.hasOrnament("lavaFlow")) {
      // Molten rock runs through the mass the plan is cut into, never through
      // the plan: only ceiling tiles are painted, behind the wall ring.
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (carved[y][x] || !ctx.ceilingMask[y][x]) continue;
          const vein = Math.sin(x * 0.21 + y * 0.13) + Math.sin(y * 0.31 - x * 0.07);
          if (vein > 1.1 && rng() < 0.75) mapData[calculateIndex(x, y, 0, width, height)] = pal.lava;
        }
    }
    ctx.isWet = (x, y) => regiondata[y * width + x] === 99 ||
      (waterTile && mapData[calculateIndex(x, y, 0, width, height)] === waterTile);
  }

  // --- 9. Rooms: doorways and roles ------------------------------------------
  // A doorway is a floor tile on a room's own edge with floor outside the room
  // next to it. It and the tile inside it are kept clear of furniture, so no
  // room is ever furnished shut, however its kit lands.
  function findDoorways(ctx) {
    const { width, height } = ctx;
    const reserved = new Uint8Array(width * height);
    for (const k of ctx.protectedTiles) reserved[k] = 1;
    const inRoom = (r, x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    for (const r of ctx.rooms) {
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++) {
          if (!ctx.isFloor(x, y)) continue;
          if (x !== r.x && x !== r.x + r.width - 1 && y !== r.y && y !== r.y + r.height - 1) continue;
          for (const [dx, dy] of DIRS4) {
            const ox = x + dx, oy = y + dy;
            if (inRoom(r, ox, oy) || !ctx.isFloor(ox, oy)) continue;
            reserved[x + y * width] = 1;
            const ix = x - dx, iy = y - dy;
            if (ctx.isFloor(ix, iy)) reserved[ix + iy * width] = 1;
          }
        }
    }
    ctx.reserved = reserved;
  }

  function roomFloorCount(ctx, r) {
    let n = 0;
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) if (ctx.isFloor(x, y) && !ctx.isWet(x, y)) n++;
    return n;
  }

  function assignRoomRoles(ctx) {
    const plan = INTERIOR_PLANS[ctx.S.key] || INTERIOR_PLANS.Dungeon;
    const { rng, rooms } = ctx;
    for (const r of rooms) {
      r.floor = roomFloorCount(ctx, r);
      if (r.hint && INTERIOR_ROOMS[r.hint]) r.role = r.hint;
    }
    const free = () => rooms.filter((r) => !r.role && Math.min(r.width, r.height) >= 4);
    if (plan.main && !rooms.some((r) => r.role === plan.main)) {
      // The largest room the layout left unnamed; failing that (a burrow is
      // all brood chambers, a pyramid all corridors round its sanctum) the
      // largest room of all, so a structure always has its heart.
      const big = free().sort((a, b) => b.floor - a.floor)[0] ||
        rooms.filter((r) => Math.min(r.width, r.height) >= 4).sort((a, b) => b.floor - a.floor)[0];
      if (big) big.role = plan.main;
    }
    if (plan.deep && !rooms.some((r) => r.role === plan.deep && r.deep)) {
      let far = null, farD = -1;
      for (const r of free()) {
        const d = Math.abs(r.x + (r.width >> 1) - ctx.entranceX) + Math.abs(r.y + (r.height >> 1) - ctx.entranceY);
        if (d > farD) { farD = d; far = r; }
      }
      if (far) { far.role = plan.deep; far.deep = true; }
    }
    const weights = plan.rooms || [];
    const total = weights.reduce((s, w) => s + w[1], 0);
    for (const r of rooms) {
      if (r.role) continue;
      if (Math.min(r.width, r.height) < 4) { r.role = plan.passage || "passage"; continue; }
      let pick = rng() * total, role = weights.length ? weights[0][0] : "passage";
      for (const [nm, w] of weights) { pick -= w; if (pick <= 0) { role = nm; break; } }
      r.role = role;
    }
  }

  // --- 10. Furnish ------------------------------------------------------------
  function furnishRooms(ctx) {
    const { width, height, rng } = ctx;
    ctx.occ = new Uint8Array(width * height);      // a piece's sprite stands here
    ctx.block = new Uint8Array(width * height);    // a piece blocks a step here
    ctx.flatOcc = new Uint8Array(width * height);  // a rug or a sigil lies here
    ctx.hungOcc = new Uint8Array(width * height);  // something hangs on this face
    const index = interiorFurnitureIndex()[ctx.S.key] || {};
    ctx.furnitureIndex = index;
    if (!Object.keys(index).length) return;
    // How many tiles the party can reach, with nothing placed yet. Every piece
    // that blocks is checked against it: if it strands even one tile, it goes.
    ctx.reach = countReach(ctx);
    // The rooms that matter most are furnished first, so a crowded map
    // spends its floor on the sanctum, not the corridor.
    const order = ctx.rooms.slice().sort((a, b) => rolePriority(ctx, b) - rolePriority(ctx, a));
    for (const r of order) {
      const kit = INTERIOR_ROOMS[r.role];
      if (!kit || r.floor < 4) continue;
      const lines = kit.map((line, i) => ({ line, i, at: line.at || KIND_PLACE[line.k] || "scatter" }))
        .sort((a, b) => (PLACE_ORDER.indexOf(a.at) - PLACE_ORDER.indexOf(b.at)) || (a.i - b.i));
      for (const { line, at } of lines) {
        const ids = index[line.k];
        if (!ids || !ids.length) continue;
        const want = line.n
          ? line.n[0] + Math.floor(rng() * (line.n[1] - line.n[0] + 1))
          : (line.d ? Math.round(line.d * r.floor * (0.7 + rng() * 0.6)) : 0);
        const fill = line.fill == null ? null : line.fill;
        if (!want && fill == null) continue;
        const fn = PLACERS[at];
        ctx.placing = at;
        if (fn) fn(ctx, r, line, ids, want, fill);
      }
    }
  }

  function rolePriority(ctx, r) {
    const plan = INTERIOR_PLANS[ctx.S.key] || {};
    if (r.role === plan.main) return 3;
    if (r.deep) return 2;
    if (r.role === "passage" || r.role === plan.passage) return 0;
    return 1;
  }

  function countReach(ctx) {
    const { width, height } = ctx;
    const seen = floodFrom(ctx, ctx.spawnX, ctx.spawnY, (x, y) => ctx.carved[y][x] && !ctx.block[x + y * width]);
    let n = 0;
    for (let i = 0; i < width * height; i++) if (seen[i]) n++;
    return n;
  }

  // A deterministic shuffle of a pool, so one room's pick does not depend on
  // the order the catalogue happened to be read in.
  function shuffled(ctx, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Can this piece stand with its top-left at (x, y)? Its blocking cells need
  // clear, dry, unreserved floor; the rest of its sprite (a tall piece's
  // upper rows) may stand over the wall behind it, but never over another
  // piece; and its bottom row has to be on the floor, not hanging off rock.
  function canStand(ctx, fp, x, y) {
    const { width, height } = ctx;
    if (x < 0 || y < 0 || x + fp.w > width || y + fp.h > height) return false;
    const blocked = new Set(fp.blocks.map(([dx, dy]) => dx + "," + dy));
    for (let dy = 0; dy < fp.h; dy++)
      for (let dx = 0; dx < fp.w; dx++) {
        const gx = x + dx, gy = y + dy, k = gx + gy * width;
        const floor = ctx.carved[gy][gx];
        const bottom = dy === fp.h - 1;
        const isBlock = blocked.has(dx + "," + dy);
        if (isBlock || bottom) {
          if (!floor || ctx.isWet(gx, gy) || ctx.occ[k] || ctx.block[k]) return false;
          if (ctx.reserved[k] && (isBlock || !fp.blocks.length)) return false;
        } else if (floor && ctx.occ[k]) return false;
      }
    return true;
  }

  // Set a piece down. A blocking piece is only kept if the party can still
  // reach every tile it could reach before, less the tiles the piece covers.
  function commitPiece(ctx, id, fp, x, y, flipped) {
    const { width } = ctx;
    const cells = fp.blocks.map(([dx, dy]) => (x + dx) + (y + dy) * width);
    if (cells.length) {
      for (const k of cells) ctx.block[k] = 1;
      const reach = countReach(ctx);
      if (reach !== ctx.reach - cells.length) {
        for (const k of cells) ctx.block[k] = 0;
        return false;
      }
      ctx.reach = reach;
    }
    for (let dy = 0; dy < fp.h; dy++)
      for (let dx = 0; dx < fp.w; dx++) {
        const gx = x + dx, gy = y + dy;
        if (ctx.carved[gy][gx]) ctx.occ[gx + gy * width] = 1;
      }
    // `at` is how the piece was placed (see KIND_PLACE). FurnitureSystem
    // copies only the piece, the tile and the mirror into the world store.
    const rec = { id, x, y, at: ctx.placing || "scatter" };
    if (flipped) rec.flipped = true;
    ctx.furniture.push(rec);
    return true;
  }

  function tryStand(ctx, id, x, y, flipped) {
    const fp = pieceFootprint(id);
    if (!fp || fp.hung) return false;
    if (!canStand(ctx, fp, x, y)) return false;
    return commitPiece(ctx, id, fp, x, y, flipped);
  }

  // Floor tiles of a room whose north neighbour is rock: where things stand
  // with their backs to the wall, and under which the faces hang.
  function northWallCells(ctx, r) {
    const out = [];
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++)
        if (ctx.isFloor(x, y) && !ctx.isFloor(x, y - 1)) out.push({ x, y });
    return out;
  }
  function roomCells(ctx, r, test) {
    const out = [];
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++)
        if (ctx.isFloor(x, y) && !ctx.isWet(x, y) && (!test || test(x, y))) out.push({ x, y });
    return out;
  }
  const rockSides = (ctx, x, y) => {
    let n = 0;
    for (const [dx, dy] of DIRS4) if (!ctx.isFloor(x + dx, y + dy)) n++;
    return n;
  };
  const roomCentre = (r) => ({ x: r.x + (r.width >> 1), y: r.y + (r.height >> 1) });
  // The pieces of a pool that fit a room at all, shuffled.
  function fitting(ctx, ids, maxW, maxH) {
    return shuffled(ctx, ids).filter((id) => {
      const fp = pieceFootprint(id);
      return fp && fp.w <= maxW && fp.h <= maxH;
    });
  }

  // Chairs drawn up to a table: either end of it and along its near side.
  function seatTable(ctx, tx, ty, fp) {
    const seats = ctx.furnitureIndex.seat;
    if (!seats || !seats.length) return;
    const pool = fitting(ctx, seats, 1, 2);
    if (!pool.length) return;
    const seatId = pool[0];
    const sfp = pieceFootprint(seatId);
    const by = ty + fp.h - 1;
    const spots = [[tx - 1, by, false], [tx + fp.w, by, true]];
    for (let i = 0; i < fp.w; i++) spots.push([tx + i, by + 1, false]);
    let n = 1 + Math.floor(ctx.rng() * Math.min(4, spots.length));
    for (const [sx, sy, flip] of shuffled(ctx, spots)) {
      if (n <= 0) break;
      if (tryStand(ctx, seatId, sx, sy - sfp.h + 1, flip)) n--;
    }
  }

  const PLACERS = {
    // Centred against the north wall: the altar at the head of the shrine.
    dais(ctx, r, line, ids, want) {
      const c = roomCentre(r);
      const wall = northWallCells(ctx, r).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x) || a.y - b.y);
      let placed = 0;
      for (const id of fitting(ctx, ids, r.width - 2, r.height + 2)) {
        if (placed >= want) break;
        const fp = pieceFootprint(id);
        for (const cell of wall.slice(0, 8)) {
          const x0 = cell.x - (fp.w >> 1), y0 = cell.y - fp.h + 1;
          let backed = true;
          for (let dx = 0; dx < fp.w; dx++) if (ctx.isFloor(x0 + dx, cell.y - 1) || !ctx.isFloor(x0 + dx, cell.y)) backed = false;
          if (!backed) continue;
          if (tryStand(ctx, id, x0, y0)) { r.daisAt = { x: x0, y: cell.y, w: fp.w }; placed++; break; }
        }
      }
      return placed;
    },
    // The middle of the room, spiralling out a little if it is taken.
    centre(ctx, r, line, ids, want) {
      const c = roomCentre(r);
      let placed = 0;
      for (const id of fitting(ctx, ids, r.width - 2, r.height)) {
        if (placed >= want) break;
        const fp = pieceFootprint(id);
        let done = false;
        for (let rad = 0; rad <= 3 && !done; rad++)
          for (let oy = -rad; oy <= rad && !done; oy++)
            for (let ox = -rad; ox <= rad && !done; ox++) {
              if (Math.max(Math.abs(ox), Math.abs(oy)) !== rad) continue;
              const x0 = c.x - (fp.w >> 1) + ox, y0 = c.y - fp.h + 1 + oy;
              if (tryStand(ctx, id, x0, y0)) {
                done = true;
                placed++;
                if (!r.centreAt) r.centreAt = { x: x0 + (fp.w >> 1), y: y0 + fp.h - 1 };
                if (line.k === "table") seatTable(ctx, x0, y0, fp);
              }
            }
      }
      return placed;
    },
    // A matched pair either side of whatever the room is arranged round (the
    // altar), or of its north wall's centre: the same piece twice, the right
    // one mirrored.
    flank(ctx, r, line, ids, want) {
      const pairs = Math.max(1, Math.round(want / 2));
      let anchor = r.daisAt;
      if (!anchor) {
        const c = roomCentre(r);
        const w = northWallCells(ctx, r).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
        if (!w) return 0;
        anchor = { x: w.x, y: w.y, w: 1 };
      }
      let placed = 0, reach = 1;
      for (const id of fitting(ctx, ids, Math.max(1, (r.width >> 1) - 1), r.height + 2)) {
        if (placed >= pairs) break;
        const fp = pieceFootprint(id);
        for (let gap = reach; gap <= reach + 3; gap++) {
          const lx = anchor.x - gap - fp.w, rx = anchor.x + anchor.w + gap;
          const y0 = anchor.y - fp.h + 1;
          if (!canStand(ctx, fp, lx, y0) || !canStand(ctx, fp, rx, y0)) continue;
          if (!commitPiece(ctx, id, fp, lx, y0, false)) continue;
          if (!commitPiece(ctx, id, fp, rx, y0, true)) {
            // The right twin would have stranded something: take the left one
            // back up too, so the pair stays a pair or is not there at all.
            ctx.furniture.pop();
            for (const [dx, dy] of fp.blocks) ctx.block[(lx + dx) + (anchor.y - fp.h + 1 + dy) * ctx.width] = 0;
            for (let dy = 0; dy < fp.h; dy++)
              for (let dx = 0; dx < fp.w; dx++) ctx.occ[(lx + dx) + (y0 + dy) * ctx.width] = 0;
            ctx.reach = countReach(ctx);
            continue;
          }
          placed++;
          reach = gap + fp.w + 1;
          break;
        }
      }
      return placed * 2;
    },
    // Round the room's centre piece, or its middle: candles about a sigil.
    ring(ctx, r, line, ids, want) {
      const c = r.centreAt || roomCentre(r);
      const pool = fitting(ctx, ids, 1, 2);
      if (!pool.length) return 0;
      const id = pool[0];
      const fp = pieceFootprint(id);
      const rad = 2 + (Math.min(r.width, r.height) >= 9 ? 1 : 0);
      let placed = 0;
      const steps = Math.max(want, 4);
      for (let i = 0; i < steps && placed < want; i++) {
        const a = (Math.PI * 2 * i) / steps;
        const x = Math.round(c.x + Math.cos(a) * rad), y = Math.round(c.y + Math.sin(a) * rad);
        if (tryStand(ctx, id, x, y - fp.h + 1)) placed++;
      }
      return placed;
    },
    // Side by side along the north wall, backs to the rock. Shelving runs
    // shoulder to shoulder; anything else keeps a tile between pieces.
    wall(ctx, r, line, ids, want, fill) {
      const wall = northWallCells(ctx, r);
      if (!wall.length) return 0;
      const pool = fitting(ctx, ids, Math.max(1, r.width - 1), r.height + 3).slice(0, 2);
      if (!pool.length) return 0;
      const gap = line.k === "shelf" ? 0 : 1;
      const byRow = {};
      for (const c of wall) (byRow[c.y] || (byRow[c.y] = [])).push(c.x);
      let placed = 0, turn = 0;
      const target = fill == null ? want : Infinity;
      const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b);
      for (const y of rows) {
        const xs = byRow[y].sort((a, b) => a - b);
        for (let i = 0; i < xs.length && placed < target;) {
          if (fill != null && ctx.rng() > fill) { i++; continue; }
          const id = pool[turn % pool.length];
          const fp = pieceFootprint(id);
          const x0 = xs[i];
          let backed = true;
          for (let dx = 0; dx < fp.w; dx++) if (ctx.isFloor(x0 + dx, y - 1) || !ctx.isFloor(x0 + dx, y)) backed = false;
          if (backed && tryStand(ctx, id, x0, y - fp.h + 1)) {
            placed++; turn++;
            i += fp.w + gap;
          } else i++;
        }
      }
      if (fill == null && placed < want) {
        // A count rather than a fill: the slots taken in order may all have
        // been in one corner, so try the rest of the wall at random.
        for (const c of shuffled(ctx, wall)) {
          if (placed >= want) break;
          const id = pool[turn % pool.length];
          const fp = pieceFootprint(id);
          let backed = true;
          for (let dx = 0; dx < fp.w; dx++) if (ctx.isFloor(c.x + dx, c.y - 1) || !ctx.isFloor(c.x + dx, c.y)) backed = false;
          if (backed && tryStand(ctx, id, c.x, c.y - fp.h + 1)) { placed++; turn++; }
        }
      }
      return placed;
    },
    // Shelving in unbroken lines down a hall's long axis with aisles kept
    // between them: the stacks of a library. A line against each long wall
    // and one down the middle (back to back on an even width) when the hall
    // is wide enough, each broken now and then by a cross aisle, and both
    // ends of the hall left open so the aisles join up.
    stacks(ctx, r, line, ids, want, fill) {
      const vertical = r.height >= r.width;
      const across = vertical ? r.width : r.height;
      if (across < 5) return 0;
      const pool = fitting(ctx, ids, vertical ? 1 : 3, vertical ? 3 : 2);
      if (!pool.length) return 0;
      const id = pool[0];
      const fp = pieceFootprint(id);
      const lanes = [0, across - 1];
      if (across >= 8 && across % 2 === 0) lanes.push((across >> 1) - 1, across >> 1);
      else if (across >= 7) lanes.push(across >> 1);
      const f = fill == null ? 0.85 : fill;
      let placed = 0;
      if (vertical) {
        for (const off of lanes)
          for (let y = r.y + 1; y + fp.h - 1 <= r.y + r.height - 2; y += fp.h)
            if (ctx.rng() <= f && tryStand(ctx, id, r.x + off, y)) placed++;
      } else {
        for (const off of lanes)
          for (let x = r.x + 1; x + fp.w - 1 <= r.x + r.width - 2; x += fp.w)
            if (ctx.rng() <= f && tryStand(ctx, id, x, r.y + off - fp.h + 1)) placed++;
      }
      return placed;
    },
    // Two lines of one piece down a big room's long sides: the columns of a
    // nave, the pit props of a stope.
    colonnade(ctx, r, line, ids, want, fill) {
      if (r.width < 7 || r.height < 7) return 0;
      const pool = fitting(ctx, ids, 1, 5);
      if (!pool.length) return 0;
      const id = pool[0];
      const fp = pieceFootprint(id);
      const vertical = r.height >= r.width;
      const pitch = 3 + (ctx.rng() < 0.5 ? 1 : 0);
      const f = fill == null ? 1 : fill;
      let placed = 0;
      if (vertical) {
        const lines = [r.x + 1, r.x + r.width - 2];
        for (let y = r.y + 2 + fp.h - 1; y < r.y + r.height - 2; y += pitch)
          for (const x of lines) if (ctx.rng() <= f && tryStand(ctx, id, x, y - fp.h + 1)) placed++;
      } else {
        const lines = [r.y + 1 + fp.h - 1, r.y + r.height - 2];
        for (let x = r.x + 2; x < r.x + r.width - 2; x += pitch)
          for (const y of lines) if (ctx.rng() <= f && tryStand(ctx, id, x, y - fp.h + 1)) placed++;
      }
      return placed;
    },
    // A grid of one piece with an aisle down the middle: pews facing the
    // altar, tombs in their ranks, the shelving of a stack room.
    rows(ctx, r, line, ids, want, fill) {
      const x0 = r.x + 1, x1 = r.x + r.width - 2;
      const yStart = r.daisAt ? r.daisAt.y + 2 : r.y + 1;
      const y1 = r.y + r.height - 2;
      const usable = x1 - x0 + 1;
      if (usable < 3 || y1 - yStart < 1) return 0;
      const aisle = usable % 2 === 0 ? 2 : 1;
      const half = (usable - aisle) >> 1;
      const pool = fitting(ctx, ids, Math.max(1, half), Math.max(1, y1 - yStart + 1));
      if (!pool.length) return 0;
      const id = pool[0];
      const fp = pieceFootprint(id);
      const gapX = line.k === "pew" ? 0 : 1;
      const f = fill == null ? 1 : fill;
      const midL = x0 + half - 1, midR = x0 + half + aisle;
      let placed = 0;
      const cap = fill == null && want ? want : Infinity;
      for (let by = yStart + fp.h - 1; by <= y1 && placed < cap; by += fp.h + 1) {
        for (let x = midL - fp.w + 1; x >= x0 && placed < cap; x -= fp.w + gapX)
          if (ctx.rng() <= f && tryStand(ctx, id, x, by - fp.h + 1)) { placed++; if (line.k === "table" && ctx.rng() < 0.6) seatTable(ctx, x, by - fp.h + 1, fp); }
        for (let x = midR; x + fp.w - 1 <= x1 && placed < cap; x += fp.w + gapX)
          if (ctx.rng() <= f && tryStand(ctx, id, x, by - fp.h + 1, true)) { placed++; if (line.k === "table" && ctx.rng() < 0.6) seatTable(ctx, x, by - fp.h + 1, fp); }
      }
      return placed;
    },
    // The room's inner corners, the same piece in each.
    corner(ctx, r, line, ids, want) {
      const corners = [[r.x, r.y], [r.x + r.width - 1, r.y], [r.x, r.y + r.height - 1], [r.x + r.width - 1, r.y + r.height - 1]];
      const cells = roomCells(ctx, r, (x, y) =>
        (!ctx.isFloor(x, y - 1) || !ctx.isFloor(x, y + 1)) && (!ctx.isFloor(x - 1, y) || !ctx.isFloor(x + 1, y)));
      cells.sort((a, b) => {
        const da = Math.min(...corners.map(([cx, cy]) => Math.abs(cx - a.x) + Math.abs(cy - a.y)));
        const db = Math.min(...corners.map(([cx, cy]) => Math.abs(cx - b.x) + Math.abs(cy - b.y)));
        return da - db;
      });
      const pool = fitting(ctx, ids, 2, 3);
      if (!pool.length) return 0;
      const id = pool[0];
      const fp = pieceFootprint(id);
      let placed = 0;
      const used = [];
      for (const c of cells) {
        if (placed >= want) break;
        if (used.some((u) => Math.abs(u.x - c.x) + Math.abs(u.y - c.y) < 3)) continue;
        const x0 = c.x === r.x + r.width - 1 || ctx.isFloor(c.x - 1, c.y) ? c.x - fp.w + 1 : c.x;
        if (tryStand(ctx, id, x0, c.y - fp.h + 1, x0 !== c.x)) { placed++; used.push(c); }
      }
      return placed;
    },
    // Against the rock anywhere round the room, in little clusters: crates
    // stacked together, a row of beds, rocks fallen from the face.
    edge(ctx, r, line, ids, want) {
      const cells = shuffled(ctx, roomCells(ctx, r, (x, y) => rockSides(ctx, x, y) >= 1));
      const pool = fitting(ctx, ids, 3, 4).slice(0, 3);
      if (!pool.length) return 0;
      let placed = 0;
      const queue = [];
      let ci = 0;
      while (placed < want && (queue.length || ci < cells.length)) {
        const c = queue.length ? queue.shift() : cells[ci++];
        const id = pool[Math.floor(ctx.rng() * pool.length)];
        const fp = pieceFootprint(id);
        const x0 = ctx.isFloor(c.x - 1, c.y) && !ctx.isFloor(c.x + 1, c.y) ? c.x - fp.w + 1 : c.x;
        if (tryStand(ctx, id, x0, c.y - fp.h + 1, x0 !== c.x)) {
          placed++;
          // A cluster grows from what was just put down, along the rock.
          if (ctx.rng() < 0.55)
            for (const [dx, dy] of shuffled(ctx, DIRS4)) {
              const nx = c.x + dx * fp.w, ny = c.y + dy;
              if (ctx.isFloor(nx, ny) && rockSides(ctx, nx, ny) >= 1) queue.push({ x: nx, y: ny });
            }
        }
      }
      return placed;
    },
    // A clump round one spot: a bed of mushrooms, a crystal cluster.
    cluster(ctx, r, line, ids, want) {
      const open = roomCells(ctx, r);
      if (!open.length) return 0;
      const pool = fitting(ctx, ids, 2, 3).slice(0, 3);
      if (!pool.length) return 0;
      let placed = 0;
      for (let seeds = 0; seeds < 3 && placed < want; seeds++) {
        const s = open[Math.floor(ctx.rng() * open.length)];
        const around = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) around.push({ x: s.x + dx, y: s.y + dy });
        for (const c of shuffled(ctx, around)) {
          if (placed >= want) break;
          const id = pool[Math.floor(ctx.rng() * pool.length)];
          const fp = pieceFootprint(id);
          if (tryStand(ctx, id, c.x, c.y - fp.h + 1, ctx.rng() < 0.5)) placed++;
        }
      }
      return placed;
    },
    // Loose about the open floor: bones, books, debris.
    scatter(ctx, r, line, ids, want) {
      const cells = shuffled(ctx, roomCells(ctx, r, (x, y) => rockSides(ctx, x, y) === 0));
      const pool = fitting(ctx, ids, 2, 3).slice(0, 4);
      if (!pool.length) return 0;
      let placed = 0;
      for (const c of cells) {
        if (placed >= want) break;
        const id = pool[Math.floor(ctx.rng() * pool.length)];
        const fp = pieceFootprint(id);
        if (tryStand(ctx, id, c.x, c.y - fp.h + 1, ctx.rng() < 0.5)) placed++;
      }
      return placed;
    },
    // On the wall faces themselves, spread out along them: banners, wall
    // torches, panels, chains. A one-tile piece hangs at eye level, the middle
    // row of the face; a taller one fills down from the top.
    hung(ctx, r, line, ids, want) {
      const faces = northWallCells(ctx, r).filter((c) => ctx.wallCells[c.y - 1] && ctx.wallCells[c.y - 1][c.x]);
      if (!faces.length) return 0;
      const pool = fitting(ctx, ids, 3, 3).slice(0, 2);
      if (!pool.length) return 0;
      faces.sort((a, b) => a.x - b.x || a.y - b.y);
      const picks = [];
      const step = faces.length / Math.max(1, want);
      for (let i = 0; i < want; i++) picks.push(faces[Math.min(faces.length - 1, Math.floor(step * (i + 0.5)))]);
      let placed = 0;
      for (const c of picks) {
        const id = pool[placed % pool.length];
        const fp = pieceFootprint(id);
        const x0 = c.x - (fp.w >> 1);
        const tops = fp.h === 1 ? [c.y - 2, c.y - 1] : [c.y - 3, c.y - fp.h - 1, c.y - fp.h];
        for (const y0 of tops) {
          if (canHang(ctx, fp, x0, y0)) {
            for (let dy = 0; dy < fp.h; dy++)
              for (let dx = 0; dx < fp.w; dx++) ctx.hungOcc[(x0 + dx) + (y0 + dy) * ctx.width] = 1;
            // Hung, whatever its folder: a sign or a wall torch whose folder is
            // not a wall-mounted one still hangs here, on rock nobody walks.
            ctx.furniture.push({ id, x: x0, y: y0, at: "hung", hung: true });
            placed++;
            break;
          }
        }
      }
      return placed;
    },
    // Laid on the floor and walked over. A rug or a sigil goes in the middle
    // of the room (in front of the altar when there is one); a stain or a
    // grate anywhere on the open floor.
    flat(ctx, r, line, ids, want) {
      const pool = fitting(ctx, ids, Math.max(1, r.width - 2), Math.max(1, r.height - 2));
      if (!pool.length) return 0;
      const centred = line.k === "rug" || line.k === "circle";
      let placed = 0;
      const tryLay = (id, x0, y0) => {
        const fp = pieceFootprint(id);
        if (!fp || x0 < 0 || y0 < 0 || x0 + fp.w > ctx.width || y0 + fp.h > ctx.height) return false;
        for (let dy = 0; dy < fp.h; dy++)
          for (let dx = 0; dx < fp.w; dx++) {
            const gx = x0 + dx, gy = y0 + dy, k = gx + gy * ctx.width;
            if (!ctx.carved[gy][gx] || ctx.isWet(gx, gy) || ctx.flatOcc[k] || ctx.protectedTiles.has(k)) return false;
            if (!fp.flat && (ctx.occ[k] || ctx.block[k])) return false;
          }
        if (!fp.flat && fp.blocks.length) return tryStand(ctx, id, x0, y0);
        for (let dy = 0; dy < fp.h; dy++)
          for (let dx = 0; dx < fp.w; dx++) ctx.flatOcc[(x0 + dx) + (y0 + dy) * ctx.width] = 1;
        ctx.furniture.push({ id, x: x0, y: y0, at: "flat", flat: true });
        return true;
      };
      if (centred) {
        const c = r.daisAt ? { x: r.daisAt.x + (r.daisAt.w >> 1), y: r.daisAt.y + 2 } : roomCentre(r);
        for (const id of pool) {
          if (placed >= want) break;
          const fp = pieceFootprint(id);
          if (tryLay(id, c.x - (fp.w >> 1), c.y - (fp.h >> 1))) { placed++; r.centreAt = r.centreAt || c; }
        }
        return placed;
      }
      for (const c of shuffled(ctx, roomCells(ctx, r))) {
        if (placed >= want) break;
        if (tryLay(pool[Math.floor(ctx.rng() * pool.length)], c.x, c.y)) placed++;
      }
      return placed;
    },
  };

  function canHang(ctx, fp, x0, y0) {
    const { width, height } = ctx;
    if (x0 < 0 || y0 < 0 || x0 + fp.w > width || y0 + fp.h > height) return false;
    for (let dy = 0; dy < fp.h; dy++)
      for (let dx = 0; dx < fp.w; dx++) {
        const gx = x0 + dx, gy = y0 + dy;
        if (!ctx.wallCells[gy][gx] || ctx.hungOcc[gx + gy * width]) return false;
      }
    // Every column must hang over floor, or the piece is on a face that
    // fronts nothing (the back of a pillar seen from the wrong side).
    for (let dx = 0; dx < fp.w; dx++) {
      let y = y0 + fp.h;
      while (y < height && ctx.wallCells[y][x0 + dx]) y++;
      if (!ctx.isFloor(x0 + dx, y)) return false;
    }
    return true;
  }

  // --- 11. Tile dressing: ornaments and the biome's own props ---------------
  // The tile features (skulls, torches, drains...) are still laid on layer 2,
  // where ProceduralTerrainInteractions can harvest them. They now work round
  // the furniture: nothing is stamped where a piece stands, lies or hangs, and
  // a furnished structure scatters them more thinly, since its rooms already
  // hold their things.
  function dressWithFeatures(ctx) {
    const { width, height, MARGIN, carved, rng, mapData, allFeatures, S, rooms, biome, pal } = ctx;
    const waterTile = pal.water;
    const furnished = ctx.furniture.length > 0;
    const taken = (x, y) => {
      const k = x + y * width;
      return ctx.occ[k] || ctx.flatOcc[k] || ctx.hungOcc[k] || ctx.block[k];
    };
    const structural = new Set([
      "DungeonFloor", "DungeonWall", "Ceiling", "Water", "CaveFloor", "CaveWall", "MountainWall",
      "Dirt", "Pavement", "Salt", "Parquet", "TechnoFloor", "Metal", "WoodenFloor",
      "Grass", "Sand", "Techno", "Carpet", "Lava", "Soil", "Path", "Mud", "StoneBlock",
    ]);
    const WALL_MOUNTED = new Set(["Torch", "Chain", "Drain", "Grate", "Banner", "Cobweb", "Sconce", "Lamp", "Pipe"]);
    const floorDecorPool = [], wallDecorPool = [];
    for (const f of biome.features || []) {
      const nm = typeof f === "string" ? f : f.name;
      if (structural.has(nm)) continue;
      const arr = allFeatures[nm];
      if (!Array.isArray(arr) || !arr.length) continue;
      const weight = (typeof f === "object" && Number(f.density) > 0) ? Number(f.density) : 1;
      (WALL_MOUNTED.has(nm) ? wallDecorPool : floorDecorPool).push({ variants: arr, weight });
    }
    if (ctx.layout === "canals") {
      const drainVariants = (allFeatures["Drain"] || []).filter((v) => v.tileId || (v.grid && v.grid.length));
      if (drainVariants.length && !wallDecorPool.some((p) => p.variants === allFeatures["Drain"])) {
        wallDecorPool.push({ variants: drainVariants, weight: 1.5 });
      }
    }
    const variantSize = (v) => v.type === "grid" ? { w: Math.max(...v.grid.map((r) => r.length)), h: v.grid.length } : { w: 1, h: 1 };
    const pickWeighted = (pool) => {
      let total = 0;
      for (const p of pool) total += p.weight;
      let r = rng() * total;
      for (const p of pool) { r -= p.weight; if (r <= 0) return p; }
      return pool[pool.length - 1];
    };
    // Layer 2 so the decorations are seen by ProceduralTerrainInteractions'
    // action-button scan (it reads layers 3/2 only).
    const stampFeature = (v, ox, oy) => {
      if (v.type === "single") { mapData[calculateIndex(ox, oy, 2, width, height)] = v.tileId; return; }
      for (let r = 0; r < v.grid.length; r++)
        for (let c = 0; c < v.grid[r].length; c++)
          if (v.grid[r][c] > 0) mapData[calculateIndex(ox + c, oy + r, 2, width, height)] = v.grid[r][c];
    };
    const floorFits = (v, ox, oy) => {
      const { w, h } = variantSize(v);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = ox + c, gy = oy + r;
          if (gx < 0 || gy < 0 || gx >= width || gy >= height) return false;
          if (ctx.protectedTiles.has(gx + gy * width) || taken(gx, gy)) return false;
          if (!(ctx.isFloor(gx, gy) && ctx.isFloor(gx - 1, gy) && ctx.isFloor(gx + 1, gy) &&
                ctx.isFloor(gx, gy - 1) && ctx.isFloor(gx, gy + 1))) return false;
          if (mapData[calculateIndex(gx, gy, 0, width, height)] === waterTile) return false;
          if (mapData[calculateIndex(gx, gy, 2, width, height)] !== 0) return false;
        }
      return true;
    };
    const wallFits = (v, wx, wy) => {
      const { w, h } = variantSize(v);
      const top = wy - (h - 1);
      if (top < 0) return false;
      for (let c = 0; c < w; c++) {
        const bx = wx + c;
        if (bx < 0 || bx >= width) return false;
        if (carved[wy][bx] || !ctx.isFloor(bx, wy + 1)) return false;
      }
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = wx + c, gy = top + r;
          if (gx < 0 || gx >= width || gy < 0 || gy >= height) return false;
          if (carved[gy][gx] || ctx.hungOcc[gx + gy * width]) return false;
          if (mapData[calculateIndex(gx, gy, 0, width, height)] === 0) return false;
          if (mapData[calculateIndex(gx, gy, 2, width, height)] !== 0) return false;
        }
      return true;
    };
    const looseFits = (v, ox, oy) => {
      const { w, h } = variantSize(v);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const gx = ox + c, gy = oy + r;
          if (!ctx.isFloor(gx, gy)) return false;
          if (ctx.protectedTiles.has(gx + gy * width) || taken(gx, gy)) return false;
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
      // A furnished structure already has its things; its ornaments thin out.
      const rate = (spec.rate == null ? 0.1 : spec.rate) * (furnished && spec.rule !== "rows" ? 0.6 : 1);
      switch (spec.rule) {
        case "edge":
          for (let y = MARGIN; y < height - MARGIN; y++)
            for (let x = MARGIN; x < width - MARGIN; x++) {
              if (!carved[y][x] || rng() >= rate) continue;
              if (ctx.isFloor(x - 1, y) && ctx.isFloor(x + 1, y) && ctx.isFloor(x, y - 1) && ctx.isFloor(x, y + 1)) continue;
              tryStamp(pick(), x, y);
            }
          break;
        case "corners":
          for (const r of rooms) {
            if (r.width < 4 || r.height < 4) continue;
            for (const [cx, cy] of [[r.x + 1, r.y + 1], [r.x + r.width - 2, r.y + 1], [r.x + 1, r.y + r.height - 2], [r.x + r.width - 2, r.y + r.height - 2]])
              if (rng() < rate) tryStamp(pick(), cx, cy);
          }
          break;
        case "axis":
          for (const r of rooms) {
            const horizontal = r.width >= r.height;
            const mid = horizontal ? r.y + (r.height >> 1) : r.x + (r.width >> 1);
            const from = horizontal ? r.x : r.y, to = horizontal ? r.x + r.width : r.y + r.height;
            for (let k = from; k < to; k++) {
              if (rng() >= rate) continue;
              if (horizontal) tryStamp(pick(), k, mid); else tryStamp(pick(), mid, k);
            }
          }
          break;
        case "centre": {
          let big = null, bestA = 0;
          for (const r of rooms) { const a = r.width * r.height; if (a > bestA) { bestA = a; big = r; } }
          if (!big) break;
          const v = pick(), sz = variantSize(v);
          tryStamp(v, big.x + (big.width >> 1) - (sz.w >> 1), big.y + (big.height >> 1) - (sz.h >> 1));
          break;
        }
        case "rows":
          // Rows of a thing the tile art draws better than any sprite (a
          // colonnade's columns, a stack room's shelving), only where the
          // furniture pass left the room empty.
          for (const r of rooms) {
            if (r.width < 7 || r.height < 7 || rng() > rate) continue;
            let busy = false;
            for (let y = r.y; y < r.y + r.height && !busy; y++)
              for (let x = r.x; x < r.x + r.width; x++) if (taken(x, y)) { busy = true; break; }
            if (busy) continue;
            const pitch = spec.pitch || 4;
            if (r.width >= r.height) {
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
              if (carved[y][x] || !ctx.isFloor(x, y + 1) || rng() >= rate) continue;
              const v = pick();
              if (wallFits(v, x, y)) stampFeature(v, x, y - (variantSize(v).h - 1));
            }
          break;
        default: break;   // "special": laid with the ground
      }
    };
    for (const nm of S.ornaments || []) {
      const spec = ORNAMENTS[nm];
      if (spec && spec.rule !== "special") runOrnament(spec);
    }

    const scale = furnished ? 0.5 : 1;
    if (floorDecorPool.length) {
      const base = (ctx.layout === "cellar" && ctx.cellarGrand) ? 0.18 : (S.dressing && S.dressing.floor) || 0.05;
      const floorRate = base * scale;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (!carved[y][x] || rng() >= floorRate) continue;
          const feat = pickWeighted(floorDecorPool);
          const v = feat.variants[Math.floor(rng() * feat.variants.length)];
          if (floorFits(v, x, y)) stampFeature(v, x, y);
        }
    }
    if (wallDecorPool.length) {
      const base = (ctx.layout === "cellar" && ctx.cellarGrand) ? 0.12 : (S.dressing && S.dressing.wall) || 0.1;
      const wallRate = base * (furnished ? 0.7 : 1);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (carved[y][x] || !ctx.isFloor(x, y + 1) || rng() >= wallRate) continue;
          const feat = pickWeighted(wallDecorPool);
          const v = feat.variants[Math.floor(rng() * feat.variants.length)];
          if (wallFits(v, x, y)) stampFeature(v, x, y - (variantSize(v).h - 1));
        }
    }
  }

  // --- 12. Nothing put down may seal the plan --------------------------------
  // The furniture already proved it strands nothing as each piece went down;
  // the tile props did not, so flood the map as the party walks it (furniture
  // included) and take away whatever stands between the entrance and the rest.
  // If a tile is still stranded after that, the furniture beside it goes too.
  // Water counts as open: region 99 is swum, not walked.
  function unsealPlan(ctx) {
    const { width, height, carved, mapData, tilesetId } = ctx;
    const tilePassable = (t) => !t || isTilePassableInTileset(tilesetId, t);
    const walkable = (x, y) => {
      if (!carved[y][x] || ctx.block[x + y * width]) return false;
      if (ctx.regiondata[y * width + x] === 99) return true;
      return tilePassable(mapData[calculateIndex(x, y, 0, width, height)]) &&
             tilePassable(mapData[calculateIndex(x, y, 2, width, height)]);
    };
    for (let pass = 0; pass < 6; pass++) {
      const seen = floodFrom(ctx, ctx.spawnX, ctx.spawnY, walkable);
      const stranded = [];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (walkable(x, y) && !seen[x + y * width]) stranded.push([x, y]);
      if (!stranded.length) return;
      for (const [x, y] of stranded) {
        mapData[calculateIndex(x, y, 2, width, height)] = 0;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (carved[ny][nx]) mapData[calculateIndex(nx, ny, 2, width, height)] = 0;
        }
      }
      if (pass >= 3) {
        const near = new Set();
        for (const [x, y] of stranded)
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add((x + dx) + (y + dy) * width);
        ctx.furniture = ctx.furniture.filter((p) => {
          const fp = pieceFootprint(p.id);
          if (!fp || !fp.blocks.length) return true;
          const hit = fp.blocks.some(([dx, dy]) => near.has((p.x + dx) + (p.y + dy) * width));
          if (hit) for (const [dx, dy] of fp.blocks) ctx.block[(p.x + dx) + (p.y + dy) * width] = 0;
          return !hit;
        });
      }
    }
  }

  // --- 13. The dead mass is painted keep-out ---------------------------------
  // The rock is only as solid as the tileset says, and a tileset does not
  // have to say much: so every cell that is not carved floor carries the
  // keep-out region, which RegionRules makes impassable indoors (flight
  // included) and which every placement pass refuses to spawn on. Water keeps
  // the terrain tag it has always been read by.
  function paintKeepOut(ctx) {
    const { width, height, carved, mapData } = ctx;
    const NO_GO_REGION = (window.RegionRules && window.RegionRules.NO_GO_REGION) || 7;
    const regionLayerEnd = width * height * 6;
    for (let i = mapData.length; i < regionLayerEnd; i++) mapData[i] = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (!carved[y][x]) mapData[calculateIndex(x, y, 5, width, height)] = NO_GO_REGION;
  }

  // --- 14. Publish -------------------------------------------------------------
  function publishInterior(ctx) {
    const { mapData, rooms, rng } = ctx;
    mapData.regiondata = ctx.regiondata;
    mapData.rooms = rooms.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height, role: r.role || "" }));
    if (ctx.layout === "cellar") mapData.cellarGrand = ctx.cellarGrand;
    mapData.spawnX = ctx.spawnX;
    mapData.spawnY = ctx.spawnY;
    mapData.spawnDir = ctx.spawnDir;
    mapData.entranceX = ctx.entranceX;
    mapData.entranceY = ctx.entranceY;
    // The furniture plan, seeded onto the square by FurnitureSystem when the
    // party arrives. Like `rooms`, it is only read at entry time, so it does
    // not matter that it is not carried through a save.
    mapData.furniture = ctx.furniture.slice();
    mapData.furnitureSignature = furnitureSignature(ctx.furniture);

    // Door hints: the mouth of a 1-wide corridor (BSP layout only), still a
    // real bottleneck on the FINAL carve, away from the entrance and from
    // each other, and not where a piece of furniture stands.
    const isDoorBottleneck = (c) => c.horizontal
      ? !ctx.isFloor(c.x, c.y - 1) && !ctx.isFloor(c.x, c.y + 1)
      : !ctx.isFloor(c.x - 1, c.y) && !ctx.isFloor(c.x + 1, c.y);
    if (ctx.narrow.length) {
      const shuffledHints = ctx.narrow
        .filter((c) => ctx.isFloor(c.x, c.y) && isDoorBottleneck(c) && !ctx.occ[c.x + c.y * ctx.width] &&
          Math.abs(c.x - ctx.entranceX) + Math.abs(c.y - ctx.entranceY) > 6)
        .sort(() => rng() - 0.5);
      const doorHints = [];
      for (const c of shuffledHints) {
        if (doorHints.length >= 6) break;
        if (doorHints.some((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 5)) continue;
        doorHints.push(c);
      }
      mapData.doorHints = doorHints;
    }
    // Boss room hint: the room whose centre is farthest from the entrance.
    if (rooms.length) {
      let bestRoom = null, bestDist = -1;
      for (const r of rooms) {
        const cx = r.x + Math.floor(r.width / 2), cy = r.y + Math.floor(r.height / 2);
        const dist = Math.abs(cx - ctx.entranceX) + Math.abs(cy - ctx.entranceY);
        if (dist > bestDist) { bestDist = dist; bestRoom = { x: cx, y: cy }; }
      }
      mapData.bossRoomHint = bestRoom;
    }
    // The carve and the furnishing of the last structure generated, for the
    // debugger and the offline harnesses. Held here rather than on mapData,
    // which is what goes into the savegame.
    _lastCarved = ctx.carved;
    _lastInterior = {
      structure: ctx.S.key, layout: ctx.layout, style: ctx.style, wallA4: ctx.pal.wallA4,
      carved: ctx.carved, wallCells: ctx.wallCells, rooms: mapData.rooms,
      furniture: mapData.furniture, block: ctx.block,
      spawnX: ctx.spawnX, spawnY: ctx.spawnY, protectedTiles: ctx.protectedTiles,
    };
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
    // A village is houses, not tarmac: at most one street beyond the central
    // cross, and every open block that fronts it built on. The lots are what
    // the prefab pass has to work with, so the plan hands it as many as the
    // grid can hold rather than spending the room on more carriageway.
    const layout = planSettlementBlocks(GRID, GRID, rng, {
      // Every 2x2 of open blocks that can be one becomes one: the village
      // prefabs on disk are 16 tiles square and only a 2x2 block holds one,
      // so a plan that turned half of them down was a plan for an empty
      // village. The single-block lots left over are what the small prefabs
      // and the yards get.
      buildingChance: 1,
      houseChance: 0.95,
      extraRoads: rng() < 0.5 ? 1 : 0,
    });

    // The high street is as wide as the road arriving at that border, so the
    // two are one carriageway and not one road beside another. Only an axis a
    // neighbouring road or settlement actually arrives on earns that width:
    // with nothing arriving, the main street is a lane like every other street
    // in the village, because a village has no reason to pave a dual
    // carriageway through its own middle.
    const SIDE_ROAD_W = 3;
    const mainColW = (borderDirs.north || borderDirs.south) ? 7 : SIDE_ROAD_W;
    const mainRowW = (borderDirs.east || borderDirs.west) ? 7 : SIDE_ROAD_W;
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
    // One lot per house block, one per 2x2 building block, and one per open
    // block left over, so no block of the plan is wasted. A lot is the WHOLE
    // block: the kerb ring the pavement pass would otherwise claim belongs to
    // the building standing on it, because a prefab is laid before the
    // pavement is and the pavement never paints over one. Each is handed over
    // as a rectangle, not just a point, so the placement pass can pick a
    // prefab that actually fits it.
    const villageLots = [];
    const lotFor = (c, r, wCells, hCells) => ({
      x: ox + c * CELL,
      y: oy + r * CELL,
      // One tile short of the block, which is the gap the placement pass
      // insists on between two prefabs: a lot the full 9 tiles wide would let
      // neighbouring buildings touch, and the collision check would then
      // refuse the second one and leave that block empty.
      w: wCells * CELL - 1,
      h: hCells * CELL - 1,
    });
    // Judged on the block's inner ground, not on its kerb: the ring now
    // belongs to the lot, and a lot beside the high street always has kerb on
    // it, which would otherwise reject every block the village is built on.
    const lotClearOfBorderRoad = (lot) => {
      for (let y = lot.y + 1; y < lot.y + lot.h - 1; y++) {
        for (let x = lot.x + 1; x < lot.x + lot.w - 1; x++) {
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
    // The blocks nothing was planned on: a village used to leave them as bare
    // green, which is most of the back of the grid. They take a prefab too,
    // after every planned lot has had its turn.
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (layout.at(c, r) !== "O") continue;
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
          allOtherData.seaMask = predictSettlementSea(width, height, adjacentBiomes, worldCoords);
          window.ProceduralMapPrefabs.applyPrefabsToMap(mapData, biome.name, worldCoords, allOtherData);
          // This placement is the one that took the map's roads and lots into
          // account; it must take priority over the generic, hint-blind pass
          // DataManager.loadMapData would otherwise still run on this same
          // array and stamp a second, uncoordinated round of buildings on top.
          window.ProceduralMapPrefabs.markPrefabbed(mapData);
        } catch (e) { console.warn(e); }
      }
    }

    // No footpath spurs: a village lot fronts its street directly. The short
    // stubs of Path that used to run from the middle of each lot out to the
    // carriageway read as walkways going nowhere wherever the lot stood empty.

    yield;


    // --- Sidewalks ---
    // UPDATED Call: Passes baseTile to ensure sidewalks don't overwrite prefabs
    const sidewalkTiles = getFeatureTiles(pathFeatureName, allFeatures);
    if (sidewalkTiles) {
      const tilesToProtect = [...pathTiles];
      if (streetIsPaved) tilesToProtect.push(streetTile);
      // Band 1: a village gets a kerb, not the city's three-tile apron.
      placeSidewalksAroundRoads(mapData, width, height, roadSet, sidewalkTiles, rng, tilesToProtect, baseTile, 1);
    }

    addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng, allOtherData && allOtherData.worldCoords);

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
   * @param {number} [stop] - How far in the run goes, in place of the map centre.
   *   The city plan stops its connectors on the orbital road that rings the
   *   reserved superblock, so nothing is painted across the reserve itself.
   */
  function drawBorderConnectionRoad(mapData, centerX, centerY, direction, roadTile, dashedLines, width, height, zebra, rng, stop) {
    const runEnd = (typeof stop === "number") ? stop : null;
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

      const stopY = runEnd !== null ? runEnd : centerY;
      for (let y = 0; y <= stopY; y++) {
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

      if (zebra?.vertical && rng && stopY > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossY = ZEBRA_MARGIN + Math.floor(rng() * (stopY - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.vertical, "vertical", startX, roadWidth, crossY, width, height);
      }
    } else if (direction === "south") {
      // Draw single vertical road from center downward to south edge
      const startX = centerX - halfRoad;
      const endX = startX + roadWidth;
      const centerLineX = centerX;

      const fromY = runEnd !== null ? runEnd : centerY;
      for (let y = fromY; y < height; y++) {
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

      const southSpan = height - fromY;
      if (zebra?.vertical && rng && southSpan > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossY = fromY + ZEBRA_MARGIN + Math.floor(rng() * (southSpan - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.vertical, "vertical", startX, roadWidth, crossY, width, height);
      }
    } else if (direction === "east") {
      // Draw single horizontal road from center rightward to east edge
      const startY = centerY - halfRoad;
      const endY = startY + roadWidth;
      const centerLineY = centerY;

      const fromX = runEnd !== null ? runEnd : centerX;
      for (let x = fromX; x < width; x++) {
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

      const eastSpan = width - fromX;
      if (zebra?.horizontal && rng && eastSpan > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossX = fromX + ZEBRA_MARGIN + Math.floor(rng() * (eastSpan - ZEBRA_MARGIN * 2));
        window.ProcGenRoads?.stampZebraCrossing(mapData, zebra.horizontal, "horizontal", startY, roadWidth, crossX, width, height);
      }
    } else if (direction === "west") {
      // Draw single horizontal road from center leftward to west edge
      const startY = centerY - halfRoad;
      const endY = startY + roadWidth;
      const centerLineY = centerY;

      const stopX = runEnd !== null ? runEnd : centerX;
      for (let x = 0; x <= stopX; x++) {
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

      if (zebra?.horizontal && rng && stopX > ZEBRA_MARGIN * 2 && rng() < ZEBRA_CHANCE) {
        const crossX = ZEBRA_MARGIN + Math.floor(rng() * (stopX - ZEBRA_MARGIN * 2));
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
  function applyBorderRoadConnections(mapData, width, height, adjacentBiomes, roadTile, dashedLines, zebra, rng, stops) {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const borderDirs = getCityBorderRoadDirections(adjacentBiomes);

    const stop = stops || {};
    if (borderDirs.north) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "north", roadTile, dashedLines, width, height, zebra, rng, stop.north);
    }
    if (borderDirs.south) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "south", roadTile, dashedLines, width, height, zebra, rng, stop.south);
    }
    if (borderDirs.east) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "east", roadTile, dashedLines, width, height, zebra, rng, stop.east);
    }
    if (borderDirs.west) {
      drawBorderConnectionRoad(mapData, centerX, centerY, "west", roadTile, dashedLines, width, height, zebra, rng, stop.west);
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

    // A cell a prefab built on stays the prefab's (see cityCellFree).
    const prefabMask = mapData.prefabMask;
    const footprintClear = (sx, sy, w, h) => {
      for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const ox = sx + gx, oy = sy + gy;
        if (ox < 0 || ox >= width || oy < 0 || oy >= height) return false;
        if (isOccupied(ox, oy)) return false;
        if (prefabMask && prefabMask[oy * width + ox]) return false;
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
  // nothing on any object layer and nothing else claiming the tile. A cell a
  // prefab built on is the prefab's (its roof may be bare on the object
  // layers, which is how a tree came to grow out of one); the cells it left
  // empty are open ground like any other.
  function cityCellFree(ctx, x, y) {
    if (x < 1 || y < 1 || x >= ctx.width - 1 || y >= ctx.height - 1) return false;
    if (ctx.isOccupied(x, y)) return false;
    const prefabMask = ctx.mapData.prefabMask;
    if (prefabMask && prefabMask[y * ctx.width + x]) return false;
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
  // Ground the Goblin Horde holds is filthier and wilder than anywhere else,
  // the longer it has been theirs the worse (window.HordeGround, DataService):
  // up to six times the rubbish and four times the green, falling back to the
  // ordinary street over the years after a liberation. 1 on anybody else's
  // ground. Read for the square the party is on.
  function hordeDecayFactor(kind) {
    const HG = window.HordeGround;
    if (!HG || typeof HG[kind] !== "function") return 1;
    try { return Number(HG[kind]()) || 1; } catch (e) { return 1; }
  }

  function cityLitterFactor() {
    return cityLitterBaseFactor() * hordeDecayFactor("litter");
  }

  function cityLitterBaseFactor() {
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
    return cityOvergrowthBaseFactor() * hordeDecayFactor("overgrowth");
  }

  function cityOvergrowthBaseFactor() {
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
            !(ctx.mapData.prefabMask && ctx.mapData.prefabMask[y * ctx.width + x]) &&
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
  // Lays a block's ground. ONE tile for the whole block, drawn once: rolling a
  // variant per tile turned every open block into a speckled chequerboard of
  // grass, dirt and sand, which is what a block nobody built on used to look
  // like from the road. The marking layer is cleared with it: a block is laid
  // over whatever the border-road pass ran through first, and a dashed centre
  // line left behind on a park or a vacant lot is a road marking with no road
  // under it - a line sitting at random in the grass. This runs before each
  // dresser lays its own markings (parking bays), so nothing wanted is lost.
  function cityPaintGround(ctx, rect, tileIds) {
    if (!tileIds || !tileIds.length) return;
    const tile = tileIds[Math.floor(ctx.rng() * tileIds.length)];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 1 || y < 1 || x >= ctx.width - 1 || y >= ctx.height - 1) continue;
        if (ctx.isOccupied(x, y)) continue;
        ctx.mapData[calculateIndex(x, y, 0, ctx.width, ctx.height)] = tile;
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
  //   2. the block plan below: a reserved 32x32 superblock inside an orbital
  //      road, and the land left over cut into ordinary blocks by streets the
  //      border roads run into
  //   3. a zoning per block: built / park / car park / plaza / vacant
  //   4. one prefab per built block (the existing prefab pass)
  //   5. pavement, and sidewalks around every carriageway
  //   6. the street itself (dressCityStreets above)
  // Straight through, on the frame that asks for it.
  // ==========================================================================
  // CITY BLOCK PLAN
  // ==========================================================================
  //
  // A 64x64 square with a centred cross avenue can never hold a 32x32 lot: the
  // avenue cuts every quadrant down to 29 tiles a side, so the big authored city
  // prefabs (32 tiles and up) had nowhere to stand and only the 17x13 houses
  // were ever built. The plan below reserves ONE superblock big enough for them
  // and rings it with an orbital road, the way a European city carries its
  // traffic around a cathedral precinct rather than through it.
  //
  //   +----------------------------+   the reserve is pushed into a corner, so
  //   | . . . . . . . . . . . . . .|   what is left over is an L of open land
  //   | +======================+ . |   with real depth on two sides rather than
  //   | |                      | . |   four thin strips: the ordinary blocks,
  //   | |   reserved 32x32     | . |   and the smaller buildings with them.
  //   | |                      | . |
  //   | +======================+ . |   ===  the orbital road
  //   | . . . . . . . . . . . . . .|   . .  the fringe, cut into ordinary blocks
  //   +----------------------------+
  //
  // The border connection roads still arrive down the middle of each edge; each
  // one stops where it meets the orbital, which is what carries it on around.
  //
  // Pure function of (size, borderDirs, rng): no map data, no tile ids, so the
  // node harness in test/test_proc_cityblocks.js can plan a city without the
  // RMMZ runtime behind it.
  const CITY_SUPER_LOT = 32;   // the lot the biggest prefabs need
  const CITY_SUPER_SKIRT = 1;  // its pavement, as every other lot gets
  const CITY_RESERVE = CITY_SUPER_LOT + CITY_SUPER_SKIRT * 2;
  const CITY_RING_W = 3;       // the orbital road around the reserve
  const CITY_MARGIN = 2;
  const CITY_BORDER_ROAD_WIDTH = 7;
  const CITY_STREET_W = 3;
  const CITY_AVENUE_W = 5;
  const CITY_BLOCK_MIN = 15;   // frontage between two fringe streets: a 15-tile
                               // block is a 13-tile lot, the depth the 17x13
                               // houses need
  const CITY_BLOCK_MAX = 24;

  function cityRectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  // The largest piece of `block` that lies wholly outside `hole`, or null when
  // nothing usable is left. A block straddling a road becomes the frontage on
  // its near side instead of being thrown away.
  function cityClipOutOf(block, hole) {
    if (!block || !hole || !cityRectsOverlap(block, hole)) return block || null;
    const parts = [
      { x: block.x, y: block.y, w: hole.x - block.x, h: block.h },
      { x: hole.x + hole.w, y: block.y, w: block.x + block.w - (hole.x + hole.w), h: block.h },
      { x: block.x, y: block.y, w: block.w, h: hole.y - block.y },
      { x: block.x, y: hole.y + hole.h, w: block.w, h: block.y + block.h - (hole.y + hole.h) },
    ].filter(p => p.w >= 4 && p.h >= 4);
    if (!parts.length) return null;
    parts.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    return parts[0];
  }

  // Where the reserve sits on one axis. It keeps clear of the map edge (the
  // orbital and a margin), it is pushed toward one end so the land left over is
  // deep enough to build on, and its ring must still cross the centre axis,
  // because the border roads arrive down the middle of each edge and stop when
  // they reach it.
  function cityPlaceReserve(size, center, rng) {
    const lo = CITY_RING_W + CITY_MARGIN;
    const hi = size - CITY_RESERVE - CITY_RING_W - CITY_MARGIN;
    if (hi < lo) return null;
    const halfBorder = Math.floor(CITY_BORDER_ROAD_WIDTH / 2);
    const from = Math.max(lo, center + halfBorder + 1 - CITY_RESERVE);
    const to = Math.min(hi, center - halfBorder - 1);
    if (to < from) return null;
    // Hard against one end or the other, never part way: every tile the
    // reserve is moved inward is a tile taken off the deep band, and the band
    // has to stay wide enough for the 17x13 houses (a 19-tile block).
    const pos = rng() < 0.5 ? lo : hi;
    return Math.max(from, Math.min(to, pos));
  }

  // Cut one fringe band into blocks with streets across it. `axis` is the axis
  // the streets are dealt along: "x" for a band that runs left to right, "y"
  // for one that runs top to bottom. Each street reaches the whole way across
  // the band, and out to the map edge where a neighbour is there to meet it.
  function cityCutBand(band, axis, reach, rng, cuts, blocks) {
    if (!band || band.w < 4 || band.h < 4) return;
    const start = axis === "x" ? band.x : band.y;
    const end = axis === "x" ? band.x + band.w : band.y + band.h;
    const marks = [];
    let at = start;
    for (;;) {
      const block = CITY_BLOCK_MIN + Math.floor(rng() * (CITY_BLOCK_MAX - CITY_BLOCK_MIN + 1));
      const w = rng() < 0.25 ? CITY_AVENUE_W : CITY_STREET_W;
      const pos = at + block;
      // Stop before a street that would leave a tail too short to build on:
      // every block a band is cut into is at least CITY_BLOCK_MIN deep.
      if (pos + w + CITY_BLOCK_MIN > end) break;
      marks.push({ pos, w });
      at = pos + w;
    }
    for (const m of marks) {
      cuts.push({ pos: m.pos, w: m.w, from: reach.from, to: reach.to });
    }
    let from = start;
    for (const m of marks.concat([{ pos: end, w: 0 }])) {
      if (m.pos - from >= CITY_BLOCK_MIN) {
        blocks.push(axis === "x"
          ? { x: from, y: band.y, w: m.pos - from, h: band.h }
          : { x: band.x, y: from, w: band.w, h: m.pos - from });
      }
      from = m.pos + m.w;
    }
  }

  function planCityBlocks(width, height, borderDirs, rng) {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const dirs = borderDirs || { north: false, south: false, east: false, west: false };
    const M = CITY_MARGIN;

    // --- the reserved superblock and its orbital road ---------------------
    const rx = cityPlaceReserve(width, centerX, rng);
    const ry = cityPlaceReserve(height, centerY, rng);
    let reserve = null, core = null, superLot = null;
    if (rx !== null && ry !== null) {
      reserve = { x: rx, y: ry, w: CITY_RESERVE, h: CITY_RESERVE };
      core = {
        x: rx - CITY_RING_W, y: ry - CITY_RING_W,
        w: CITY_RESERVE + CITY_RING_W * 2, h: CITY_RESERVE + CITY_RING_W * 2,
      };
      superLot = {
        x: rx + CITY_SUPER_SKIRT, y: ry + CITY_SUPER_SKIRT,
        w: CITY_SUPER_LOT, h: CITY_SUPER_LOT, reserved: true,
      };
    }

    // How far each border connection road runs before it meets the orbital.
    const stops = core ? {
      north: reserve.y - 1,
      south: reserve.y + reserve.h,
      west: reserve.x - 1,
      east: reserve.x + reserve.w,
    } : { north: centerY, south: centerY, west: centerX, east: centerX };

    // The corridors those roads occupy. Nothing is built in them.
    const halfBorder = Math.floor(CITY_BORDER_ROAD_WIDTH / 2);
    const corridors = [];
    if (dirs.north) corridors.push({ x: centerX - halfBorder, y: 0, w: CITY_BORDER_ROAD_WIDTH, h: stops.north + 1 });
    if (dirs.south) corridors.push({ x: centerX - halfBorder, y: stops.south, w: CITY_BORDER_ROAD_WIDTH, h: height - stops.south });
    if (dirs.west) corridors.push({ x: 0, y: centerY - halfBorder, w: stops.west + 1, h: CITY_BORDER_ROAD_WIDTH });
    if (dirs.east) corridors.push({ x: stops.east, y: centerY - halfBorder, w: width - stops.east, h: CITY_BORDER_ROAD_WIDTH });

    // --- the fringe: the frame of open land around the core ---------------
    // Left and right take the full height, top and bottom only the core's own
    // width, so the four bands tile the frame exactly and never overlap.
    const vCuts = [];   // vertical streets   (x band, y range)
    const hCuts = [];   // horizontal streets (y band, x range)
    const raw = [];
    if (core) {
      const left = { x: M, y: M, w: core.x - M, h: height - M * 2 };
      const right = { x: core.x + core.w, y: M, w: width - M - (core.x + core.w), h: height - M * 2 };
      const top = { x: core.x, y: M, w: core.w, h: core.y - M };
      const bottom = { x: core.x, y: core.y + core.h, w: core.w, h: height - M - (core.y + core.h) };
      // A street across a tall band runs the band width, and on out to the map
      // edge when the square that way is one a road can be joined to.
      cityCutBand(left, "y", { from: dirs.west ? 0 : left.x, to: core.x }, rng, hCuts, raw);
      cityCutBand(right, "y", { from: right.x, to: dirs.east ? width : right.x + right.w }, rng, hCuts, raw);
      cityCutBand(top, "x", { from: dirs.north ? 0 : top.y, to: core.y }, rng, vCuts, raw);
      cityCutBand(bottom, "x", { from: bottom.y, to: dirs.south ? height : bottom.y + bottom.h }, rng, vCuts, raw);
    } else {
      // No room for a reserve (a smaller map than the procedural square): fall
      // back to a plain grid over the whole square.
      const band = { x: M, y: M, w: width - M * 2, h: height - M * 2 };
      cityCutBand(band, "x", { from: M, to: height - M }, rng, vCuts, raw);
      const columns = raw.splice(0, raw.length);
      for (const col of columns) cityCutBand(col, "y", { from: col.x, to: col.x + col.w }, rng, hCuts, raw);
    }

    const blocks = [];
    if (superLot) blocks.push({ x: reserve.x, y: reserve.y, w: reserve.w, h: reserve.h, reserved: true });
    for (let block of raw) {
      for (const corridor of corridors) {
        block = cityClipOutOf(block, corridor);
        if (!block) break;
      }
      if (block) blocks.push(block);
    }

    return { centerX, centerY, reserve, core, superLot, stops, corridors, vCuts, hCuts, blocks };
  }

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

    const paintRoad = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      mapData[calculateIndex(x, y, 0, width, height)] = roadTile;
      markRoad(x, y);
    };

    // --- STEP 0: the plan, then the roads the neighbours run into this one ---
    // The whole layout is decided up front (see planCityBlocks): where the
    // reserved 32x32 superblock stands, the orbital road around it, and the
    // ordinary grid in the land left over. Everything below only paints it.
    const borderDirs = getCityBorderRoadDirections(adjacentBiomes);
    const plan = planCityBlocks(width, height, borderDirs, rng);
    const centerX = plan.centerX;
    const centerY = plan.centerY;
    const core = plan.core;
    const inCore = (x, y) =>
      !!core && x >= core.x && x < core.x + core.w && y >= core.y && y < core.y + core.h;
    const inReserve = (x, y) => {
      const r = plan.reserve;
      return !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    };

    // The connection roads stop at the orbital instead of running on into the
    // reserve: the ring is what carries them across the middle of the map.
    applyBorderRoadConnections(mapData, width, height, adjacentBiomes, roadTile, dashedLines, zebra, rng, plan.stops);

    const BORDER_ROAD_WIDTH = 7;
    const borderHalfRoad = Math.floor(BORDER_ROAD_WIDTH / 2);
    const markBorderRun = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) markRoad(x, y);
    };
    if (borderDirs.north) markBorderRun(centerX - borderHalfRoad, 0, centerX + borderHalfRoad, plan.stops.north);
    if (borderDirs.south) markBorderRun(centerX - borderHalfRoad, plan.stops.south, centerX + borderHalfRoad, height - 1);
    if (borderDirs.west) markBorderRun(0, centerY - borderHalfRoad, plan.stops.west, centerY + borderHalfRoad);
    if (borderDirs.east) markBorderRun(plan.stops.east, centerY - borderHalfRoad, width - 1, centerY + borderHalfRoad);

    // The orbital itself: the core rect minus the reserve it encloses.
    if (core) {
      for (let y = core.y; y < core.y + core.h; y++) {
        for (let x = core.x; x < core.x + core.w; x++) {
          if (!inReserve(x, y)) paintRoad(x, y);
        }
      }
    }

    yield;


    // --- STEP 1: the street grid --------------------------------------------
    // The planner cut the fringe into blocks; these are the streets between
    // them. Each one carries the range it runs over, so a street in the left
    // band stops at the orbital instead of crossing the reserve, and reaches
    // the map edge only where a neighbour is there to meet it.
    const vCuts = plan.vCuts;   // vertical streets,   y from .from to .to
    const hCuts = plan.hCuts;   // horizontal streets, x from .from to .to

    for (const c of vCuts) {
      for (let y = c.from; y < c.to; y++) {
        for (let x = c.pos; x < c.pos + c.w; x++) if (!inCore(x, y)) paintRoad(x, y);
      }
    }
    for (const c of hCuts) {
      for (let y = c.pos; y < c.pos + c.w; y++) {
        for (let x = c.from; x < c.to; x++) if (!inCore(x, y)) paintRoad(x, y);
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
        for (let y = c.from; y < c.to; y++) {
          if (y % DASH_CYCLE >= DASH_LENGTH) continue;
          if (hCuts.some(h => y >= h.pos - 1 && y < h.pos + h.w + 1)) continue;
          if (inCore(cx, y)) continue;
          mapData[calculateIndex(cx, y, 1, width, height)] = dashedLines.vertical;
        }
      }
    }
    if (dashedLines.horizontal) {
      for (const c of hCuts) {
        if (c.w < 5) continue;
        const cy = c.pos + Math.floor(c.w / 2);
        for (let x = c.from; x < c.to; x++) {
          if (x % DASH_CYCLE >= DASH_LENGTH) continue;
          if (vCuts.some(v => x >= v.pos - 1 && x < v.pos + v.w + 1)) continue;
          if (inCore(x, cy)) continue;
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
        for (let y = c.from + 2; y < c.to - 2; y++) {
          if (hCuts.some(h => y >= h.pos - 2 && y < h.pos + h.w + 2)) continue;
          if (core && y >= core.y - 2 && y < core.y + core.h + 2) continue;
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
        for (let x = c.from + 2; x < c.to - 2; x++) {
          if (vCuts.some(v => x >= v.pos - 2 && x < v.pos + v.w + 2)) continue;
          if (core && x >= core.x - 2 && x < core.x + core.w + 2) continue;
          candidates.push(x);
        }
        if (!candidates.length) continue;
        const x = candidates[Math.floor(rng() * candidates.length)];
        window.ProcGenRoads.stampZebraCrossing(mapData, zebra.horizontal, "horizontal", c.pos, c.w, x, width, height);
      }
    }

    yield;


    // --- STEP 2: the blocks between the streets, and what each one is for ----
    // Already cut by the planner, and already clear of the orbital and its
    // reserve. The reserved block is the first one in the list.
    const blocks = plan.blocks;

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
      if (block.reserved) return "built";   // the superblock is what it is for
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
        // The reserve's lot is the planner's: centred in the block, with the
        // skirt left over as its pavement.
        const lot = block.reserved
          ? { x: plan.superLot.x, y: plan.superLot.y, w: plan.superLot.w, h: plan.superLot.h }
          : { x: block.x + 1, y: block.y + 1, w: block.w - 2, h: block.h - 2 };
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
        // The reserve exists to hand ONE 32x32 lot to the biggest prefabs, so
        // it is never halved however wide it is.
        let lots = block.reserved
          ? [lot]
          : (lot.w >= lot.h ? splitAlong(lot, "x") : splitAlong(lot, "y"));
        if (!block.reserved && lots.length === 1 && rng() < 0.5) {
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

    // A block zoned park, car park, plaza or vacant is not a reason to leave a
    // hole in the city. Every one of them is offered to the prefab pass as a lot
    // of its own, alongside the blocks zoned for building, so the pass fills the
    // grid as far as its pool reaches instead of the generator painting a
    // speckled rectangle of ground where a building could have stood. What comes
    // back unbuilt is what the dressing pass gets.
    const openLots = [];
    for (const b of openBlocks) {
      if (b.rect.w < 4 || b.rect.h < 4) continue;
      openLots.push({ x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, open: true });
      for (let y = b.rect.y; y < b.rect.y + b.rect.h; y++) {
        for (let x = b.rect.x; x < b.rect.x + b.rect.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          occupiedMap[y * width + x] = 2;
        }
      }
    }
    const prefabLots = buildingLots.concat(openLots);

    yield;


    // --- STEP 3: prefabs, one per lot, built blocks and open blocks alike ----
    if (biome && biome.prefabs && biome.prefabs.length > 0 && prefabLots.length) {
      const worldCoords = allOtherData?.worldCoords || { x: 0, y: 0 };
      allOtherData.blockHints = prefabLots;
      allOtherData.singlePrefabPerBlock = true;
      allOtherData.strictNoRoadOverlap = true;

      if (window.ProceduralMapPrefabs && window.ProceduralMapPrefabs.applyPrefabsToMap) {
        try {
          allOtherData.seaMask = predictSettlementSea(width, height, adjacentBiomes, worldCoords);
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
    for (const lot of prefabLots) {
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
    // An open block the prefab pass built on is a building now, not a park: the
    // release step above gave back every tile the prefab did not paint, so a
    // tile still marked occupied inside the block is the building itself.
    const blockWasBuiltOn = (rect) => {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (occupiedMap[y * width + x] === 2) return true;
        }
      }
      return false;
    };
    for (const b of openBlocks) {
      if (b.rect.w < 2 || b.rect.h < 2) continue;
      if (blockWasBuiltOn(b.rect)) continue;
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
    addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng, allOtherData && allOtherData.worldCoords);

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
        allOtherData.seaMask = predictSettlementSea(width, height, adjacentBiomes, worldCoords);
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
  addDirectionalBeach(mapData, width, height, adjacentBiomes, allFeatures, rng, allOtherData && allOtherData.worldCoords);

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
    litterFactor: cityLitterFactor,
    structure: structureFor,
    structures: () => STRUCTURES.slice(),
    isStructure: (name) => !!structureFor(name),
    lastCarved: () => _lastCarved,
    lastInterior: () => _lastInterior,
    entrancesOf,
    LAYOUT_HINTS,
    layouts: () => Object.keys(LAYOUTS),
    forceLayout: (nm) => { _forcedLayout = nm || null; },
    // The furnishing tables, for FurnitureSystem, the tools and the tests.
    INTERIOR_ROOMS,
    INTERIOR_PLANS,
    KIND_PLACE,
    A4_WALL_MATERIALS,
    WALL_STYLES,
    wallStyleOf,
    interiorFurnitureIndex,
    resetInteriorIndex: () => { _interiorIndex = null; _footprints.clear(); },
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
    planCityBlocks,
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