/*:
 * @target MZ
 * @plugindesc Procedural Terrain Interactions v1.2.0 - press the action button facing a terrain feature on the procedural map to Fell / Mine / Pick Up / Dismantle it; walk into a structure entrance (StairsDown cellars, StairsUp temples, Cave dens, Grates, Hatches) to enter it. Removals are stored in the world folder so every savegame in the same world keeps them gone.
 * @author Hypernet
 *
 * @help
 * ============================================================================
 * Procedural Terrain Interactions (formerly Procedural Terrain Dismantle)
 * ============================================================================
 * ONLY on the procedural map (map 636). When the player presses the action
 * button while facing a terrain feature (Tree, Rock, Mushroom, Plant, House,
 * Tech, ...), a small choice appears:
 *
 *   <Action> / Cancel
 *
 * where <Action> depends on the feature:
 *   - Trees     -> "Fell down"   (requires an Axe-type weapon in inventory)
 *   - Rocks     -> "Mine"        (requires War Pick #163, any Heavy weapon,
 *                                  or the Chipped Pickaxe armor #60)
 *   - Plants    -> "Pick Up"     (no requirement)
 *   - Anything  -> "Dismantle"   (no requirement)
 *
 * Choosing the action removes the feature from the map and rewards the player
 * with crafting materials (the same database items used by the Thinker crafting
 * menu and the Furniture builder). Mining rocks can sometimes also yield an
 * ingot. Rewards are announced with the shared ParchmentToast popup (the same
 * one used for battle rewards).
 *
 * FORAGING. Picking foliage, herbs and mushrooms pays Plant matter as it always
 * did AND, roughly two picks in five, a real edible item on top of it. What
 * turns up depends on the country the party is standing in: acorns and
 * chanterelles in a forest, cloudberries on the tundra, dates and prickly pear
 * in a desert, cattail root and samphire on a marsh, blind mushrooms
 * underground. It is entirely data-driven - a food carries
 * <Forage: key[:weight], ...> in data/Items.json naming the countries it grows
 * in, the biome resolves to those same keys (FORAGE_FAMILIES), and the draw is
 * weighted, so a common berry turns up constantly and a Moonberry hardly ever.
 * Training Foraging raises the odds. A few features ARE a specific plant
 * (Wheat, Corn, Sunflower, Cactus, Kelp, Reed, Mushroom) and pay that plant
 * whatever the country. Alien surfaces forage nothing: another world's flora is
 * not a hedgerow, and what it offers is butchered off a Tentacle instead.
 *
 * Removals are persisted to the active world's folder (save/worlds/<name>/
 * terrain.json) keyed by the composite proc-map key (biome + world coordinate
 * + underground depth), so a feature dismantled in one savegame stays gone for
 * every other savegame that visits the same world tile - and it will not be
 * re-placed when the map regenerates.
 *
 * That includes scenery stamped by a PREFAB (an authored map dropped onto the
 * square, ProceduralMapPrefabs): it is felled, mined and dismantled like any
 * generated feature, and the prefab pass reads the removals back through
 * TerrainInteractions.removedTilesFor(), so the tree cut down in a prefab
 * orchard is stamped bare every time that square is built again. It is keyed by
 * world coordinate, not by prefab, so the same prefab standing on another
 * square still has all of its trees.
 *
 * Structure entrances (coordinate-seeded, generated on entry) are WALKED INTO,
 * not pressed: there is no choice window and the action button does nothing on
 * them. A passable entrance (a grate set into the floor) opens when the party
 * steps onto it; an impassable one (a cave mouth, stairs against a wall) opens
 * when the party walks into it and is stopped by it.
 * Which structure an entrance opens onto is ROLLED, per entrance tile, out of
 * the catalogue in ProceduralMapStructureGenerator: an entry declares which
 * features may reach it and which surface country favours it, so ice fields
 * keep frozen caves under them and a graveyard catacombs. The roll is seeded
 * on (world seed, world square, tile), so one stairway always leads to the
 * same place and two stairways on a square rarely to the same kind of place.
 *   - StairsDown -> any structure at all (cellar, dungeon, crypt, catacombs,
 *                  mine, cistern, warren, oubliette, library, forge, bunker,
 *                  lab, shrine, tunnel, grotto, lava tube, barrow, station,
 *                  salt works, cave den, temple...)
 *   - StairsUp   -> the ones built above ground and buried since (temple,
 *                  shrine, library, barrow)
 *   - Cave       -> the cave family (den, frozen, crystal, fungal, lava
 *                  tube, sea grotto)
 *   - Grate      -> Sewer, and only a Sewer: they belong to the towns and
 *                  burgs that declare them as their own lower layer
 *   - Hatch      -> a patron's own villa (PatreonRewards: one of the eight
 *                  villa interiors, pinned to their world square). The vault
 *                  that used to be down there is now the rarest structure
 *                  StairsDown can roll, like any other.
 *   - DoorHouse / DoorInn / DoorShop / DoorSkyscraper / DoorDungeon
 *                -> handed to ProceduralHouseSystem, which owns the interiors
 *                   (seeded house / inn / shop / tower-block pools and the
 *                   coordinate-seeded dungeon behind a DoorDungeon).
 *
 * Requires: ProceduralMapUtils, Map/WorldMapReturn, Crafting/FurnitureSystem,
 * Core/WorldManager and Core/ParchmentToast.
 */
(() => {
  "use strict";

  const PROC_MAP_ID = 636;
  // One world square, which is what everything stored in the world folder is
  // measured in (see storedSpot).
  const PROC_MAP_WIDTH = 64;
  const PROC_MAP_HEIGHT = 64;


  // Crafting material database item ids (data/Items.json 849-871). These are the
  // exact ids the Furniture and Thinker crafting systems use.
  const MAT = {
    ARCANE: 849, ETHEREAL: 850, CIRCUIT: 852, MICROCHIP: 853, BATTERY: 854,
    PLASTIC: 855, PLANT: 858, WOOD: 859, BONE: 860, CLOTH: 861, MEAT: 862,
    STEEL: 863, TITANIUM: 864, VARLENIA: 865, CRYSTAL: 866, GLASS: 867,
    LEATHER: 868, HERB: 869, OIL: 870, ACID: 871
  };
  const INGOTS = [MAT.STEEL, MAT.TITANIUM, MAT.VARLENIA];
  // Salvaged steel is scrap pulled off something somebody built, not something
  // a pick turns up in the ground, so the mining bonus draws from the two ores
  // that are actually mined.
  const MINE_INGOTS = [MAT.TITANIUM, MAT.VARLENIA];

  // Interaction verbs.
  const VERB = { FELL: "fell", MINE: "mine", PICK: "pick", DISMANTLE: "dismantle" };
  // Tool requirements.
  const REQ = { AXE: "axe", ROCK: "rock" };
  // Axe = wtypeId 4, Heavy = wtypeId 3 (data/System.json weaponTypes).
  const WTYPE_HEAVY = 3;
  const WTYPE_AXE = 4;
  const PICK_WEAPON_ID = 163; // War Pick
  const PICK_ARMOR_ID = 60;   // Chipped Pickaxe

  // Action sound effects (audio/se/). One is picked at random per action, with
  // a small pitch wobble so repeated harvesting does not sound identical.
  // i18n-ignore-start  audio/se filenames
  const ACTION_SE = {
    [VERB.FELL]: ["wood_01", "wood_02", "wood_03", "wood_04", "wood_05"],       // chopping wood
    [VERB.MINE]: ["stones_01", "stones_02", "stones_03", "stones_04"],          // striking stone
    [VERB.PICK]: ["Items/cloth1", "Items/cloth2", "Items/cloth3", "Items/cloth4"], // foliage rustle
    [VERB.DISMANTLE]: ["Break"]                                                 // breaking apart
  };
  // i18n-ignore-end

  function playActionSe(verb) {
    const list = ACTION_SE[verb] || ACTION_SE[VERB.DISMANTLE];
    const name = list[Math.floor(Math.random() * list.length)];
    const pitch = 90 + Math.floor(Math.random() * 21); // 90-110
    if (typeof AudioManager !== "undefined") {
      AudioManager.playSe({ name, volume: 90, pitch, pan: 0 });
    }
  }

  function verbLabel(verb) {
    switch (verb) {
      case VERB.FELL: return T('Terrain.verb.fell');
      case VERB.MINE: return T('Terrain.verb.mine');
      case VERB.PICK: return T('Terrain.verb.pick');
      default: return T('Terrain.verb.dismantle');
    }
  }

  // ==========================================================================
  // Feature -> interaction/reward table
  // ==========================================================================
  // rewards: array of [itemId, min, max]. ingot: undefined | "low" | "high"
  // adds a chance of a bonus ingot (mining only). spec: the specialization the
  // work teaches (window.SpecializationXP) - felling a tree is not the same
  // trade as stripping a reactor, and the sheet should say so.
  // i18n-ignore-start  Features.json ids and SpecializationXP ids, never labels
  const FEATURE_CONFIG = {};
  function assign(names, cfg) {
    for (const n of names) FEATURE_CONFIG[n] = cfg;
  }

  // --- Trees: need an axe, drop wood + plant matter ---
  // ("TreIce" is the AlienBase tileset's own spelling of a frozen tree.)
  assign([
    "Tree", "TreeIce", "TreIce", "TreeSwamp", "TreeDead", "TreeTrunk", "TreeStump",
    "TreeStreet", "Palm", "Bamboo", "Mangrove"
  ], {
    verb: VERB.FELL, req: REQ.AXE, spec: "Lumberjacking",
    rewards: [[MAT.WOOD, 1, 3], [MAT.PLANT, 1, 2]]
  });

  // --- Loose/worked wood: just pick it up ---
  assign([
    "Log", "LogIce", "Wood", "WoodIce", "Wooden", "WoodPillar", "Driftwood",
    "Branches", "Stick"
  ], {
    verb: VERB.PICK, spec: "Foraging", rewards: [[MAT.WOOD, 1, 2]]
  });

  // --- Plants / foliage: pick up, drop plant matter, and often something to
  // eat: `forage` sends the pick through the wild-food tables further down, so
  // what comes off a bush depends on the country the bush is standing in. ---
  // ("Lylipad" is the AlienBase tileset's own spelling of a lilypad.)
  assign([
    "Plant", "PlantIce", "Leaves", "LeavesIce", "Lilypad", "Lylipad", "Lily", "Weed", "WeedIce",
    "WeedSwamp", "Bush", "JungleBush", "Cactus", "Cattail", "Clover", "Coral", "Corn", "Crop",
    "Fern", "Flower", "FlowerIce", "Ivy", "Kelp", "Lichen", "Moss", "Moor", "MoorIce",
    "Reed", "Rose", "Sedge", "SeaPlant", "Seaweed", "Shrub", "Sprout", "Sunflower", "Thistle",
    "Thorn", "Vine", "Wheat", "Hay", "HayIce", "Soil", "Fruit", "PottedPlant"
  ], {
    verb: VERB.PICK, spec: "Foraging", forage: true, rewards: [[MAT.PLANT, 1, 2]]
  });

  // --- Herbs: plant matter + a herb extract, and the same wild larder ---
  assign(["Herb"], {
    verb: VERB.PICK, spec: "Herbalism", forage: true,
    rewards: [[MAT.PLANT, 1, 2], [MAT.HERB, 1, 1]]
  });

  // --- Shells: picked off the sand, and they are shell rather than leaf ---
  assign(["Seashell"], { verb: VERB.PICK, spec: "Beach Combing", rewards: [[MAT.BONE, 1, 2]] });

  // --- Tentacles: what an alien world puts up where a scan reads nothing but a
  // weak life sign (GalaxySim.planetLifeSigns). It is not a plant and it is not
  // a rock, so it is butchered rather than picked or mined: every kind pays
  // MEAT, and the two that have grown into something harder pay that on top.
  // None of them asks for a tool - underneath the shell it is all flesh. ---
  assign(["Tentacle"], {
    verb: VERB.DISMANTLE, spec: "Butchery",
    rewards: [[MAT.MEAT, 1, 3], [MAT.LEATHER, 0, 1]]
  });
  assign(["RockTentacle"], {
    verb: VERB.DISMANTLE, spec: "Butchery",
    rewards: [[MAT.MEAT, 1, 2], [MAT.CRYSTAL, 0, 1]], ingot: "low"
  });
  assign(["CrystalTentacle"], {
    verb: VERB.DISMANTLE, spec: "Butchery",
    rewards: [[MAT.MEAT, 1, 2], [MAT.CRYSTAL, 1, 2]]
  });

  // --- Mushrooms: pick up, plant matter, and a mushroom (FEATURE_FORAGE pins
  // these to the "fungus" pool: a mushroom is a mushroom in any country) ---
  assign(["Mushroom", "MushroomIce"], {
    verb: VERB.PICK, spec: "Foraging", forage: true, rewards: [[MAT.PLANT, 1, 2]]
  });

  // --- Rocks & rock-built things: need a pickaxe/heavy tool, drop stone-borne
  // crystal + ingots. No Salvaged steel: that is scrap off something built, and
  // a boulder was not built by anyone. ---
  // (Statue removed: it now shows a read-only inscription, see CUSTOM_HANDLERS.)
  // ("Rockj" is a typo the AlienBase tileset carries; it is a rock like the rest.)
  assign([
    "Rock", "RockDesert", "RockIce", "RockGrass", "RockJungle", "JungleRock", "RockPath", "Rockj",
    "RockFormation", "RockFormationDesert", "RockFormationIce",
    "WaterRock", "Pebble", "PebbleIce", "Stalagmite", "Stalactite",
    "Stalattite", "Rubble", "Wall", "WoodPillar", "Arch", "Aqueduct", "Column", "Pillar",
    "ColumnBroken", "StoneBlock", "Pyramid", "MysticStone", "Marble", "Monument",
    "Podium", "Boulder"
  ], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Masonry", rewards: [[MAT.CRYSTAL, 0, 1]], ingot: "low"
  });

  // --- A hole somebody else already dug: shovelled out, not quarried. What
  // comes up is the junk that was buried in it, which is the one place a pick
  // does turn up Salvaged steel. ---
  assign(["DirtExcavation"], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Masonry", rewards: [[MAT.STEEL, 0, 1], [MAT.PLASTIC, 0, 1]]
  });

  // --- Ore veins / deposits / mine shafts: better ingot odds ---
  assign(["Ore", "Deposit", "MineShaft", "Mineral"], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Mining", rewards: [[MAT.TITANIUM, 1, 2]], ingot: "high"
  });

  // --- Gems / crystals: crystal + ingot chance ---
  assign(["Gem", "Crystal"], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Mining", rewards: [[MAT.CRYSTAL, 1, 2]], ingot: "low"
  });

  // --- Burials: need a tool, drop bone (+ crystal) - and opening one is a
  // CRIME. A grave belongs to whoever is in it, and breaking into it is grave
  // robbing, charged the moment the work is done (`crime`, filed by
  // performDismantle through CrimeSystem). It covers what is actually a burial:
  // a grave, a tomb, a coffin, a sarcophagus. ---
  // (Skull removed: it now grants a random Skull-named item, see CUSTOM_HANDLERS.)
  assign([
    "Grave", "GraveIce", "Tomb", "Coffin", "Sarcophagus"
  ], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Mining", crime: "graverobbing",
    rewards: [[MAT.BONE, 1, 2], [MAT.CRYSTAL, 0, 1]]
  });

  // --- Loose remains: the same salvage, but bones lying on the ground are
  // nobody's grave and taking them is nobody's business. ---
  assign(["Bones", "SkeletonBonus"], {
    verb: VERB.MINE, req: REQ.ROCK, spec: "Mining", rewards: [[MAT.BONE, 1, 2], [MAT.CRYSTAL, 0, 1]]
  });

  // --- Buildings & wooden structures: dismantle for wood + steel ---
  // (Throne/Stool removed: they're sittable now. SignInn/SignItems/SignPostIce
  // removed: they show their own dialogue/menu, see CUSTOM_HANDLERS.)
  assign([
    "Building", "House", "HouseIce", "Cottage", "Manor", "Castle", "Fortress", "Tower",
    "Temple", "Church", "Inn", "Tavern", "Warehouse", "Factory", "Prison", "Windmill",
    "Chimney", "ChimneyIce", "Roof", "Blacksmith", "Ruin", "DragonsLair", "BeastDen",
    "Lair", "MonsterNest", "Nest", "Hive", "Bridge", "Fence", "Gate", "Door", "Ladder",
    "LadderDown", "Mannequin", "Scarecrow", "ScarecrowIce", "Coop", "MiniHouse",
    "Table", "TableBroken", "Shelf", "Sign", "SignArmor",
    "SignMagic", "SignTravel", "SignWeapon", "SignWeaponShop",
    "Barrel", "BarrelIce", "Cart", "Rope", "Bucket", "SnowRoof",
    // The city street's own woodwork: a stall, a hoarding, a run of washing.
    "FoodCart", "Clothes"
  ], {
    verb: VERB.DISMANTLE, spec: "Carpentry", rewards: [[MAT.WOOD, 1, 3], [MAT.STEEL, 0, 1]]
  });

  // --- Metal / smithing props: dismantle for steel ---
  // (Fountain/Shovel removed: Fountain now offers Drink/Bathe, Shovel is picked
  // up as item 138, see CUSTOM_HANDLERS.)
  assign([
    "Anvil", "Cauldron", "Furnace", "Lamp", "Lantern", "Chain", "BucketIce",
    "Well", "WellIce", "Workbench", "CraftStation", "Tech", "Gear", "MetalScrap",
    "Rail", "RailLeft", "RailRight", "Pole", "Streetlight", "Mailbox", "Brazier",
    "Bell",
    // City street ironmongery: the poles, barriers and railings of a road.
    "RoadPole", "RoadBarrier"
  ], {
    verb: VERB.DISMANTLE, spec: "Metalworking", rewards: [[MAT.STEEL, 1, 2]]
  });

  // --- Glass / vases / windows ---
  // (Vase/VaseIce/VasePlant removed: they're "Break"-able for random food now.
  // Mirror removed: it calls Common Event 169. See CUSTOM_HANDLERS.)
  // ("Glass" is a pane on some fifty tilesets and a floor autotile on the city
  // sheet; the autotile is laid on layer 0, which featureAt never reads, so only
  // the pane ever reaches this table.)
  assign(["Window", "WindowIce", "WindowBroken", "VaseBroken", "Glass"], {
    verb: VERB.DISMANTLE, spec: "Glassblowing", rewards: [[MAT.GLASS, 1, 2]]
  });

  // --- Cloth / banners ---
  assign(["Banner", "Flag", "Decoration", "SpiderWeb", "Cobweb", "Carpet"], {
    verb: VERB.DISMANTLE, spec: "Sewing", rewards: [[MAT.CLOTH, 1, 2]]
  });

  // --- Oil / fire props ---
  // (Torch/Candle removed: they're now toggleable lights, see CUSTOM_HANDLERS.)
  assign(["CampfireIce", "Oil", "Lava"], {
    verb: VERB.DISMANTLE, spec: "Chemistry", rewards: [[MAT.OIL, 1, 1]]
  });

  // --- Sealed drums of somebody else's chemistry: acid, and the drum ---
  assign(["ToxicBarrel"], {
    verb: VERB.DISMANTLE, spec: "Chemistry", rewards: [[MAT.ACID, 1, 2], [MAT.PLASTIC, 0, 1]]
  });

  // --- Moulded plastic roadside furniture ---
  assign(["TrafficCone"], {
    verb: VERB.DISMANTLE, spec: "Metalworking", rewards: [[MAT.PLASTIC, 1, 2]]
  });

  // --- Tech / sci-fi: dismantle for steel + plastic + electronics ---
  assign([
    "Antenna", "Circuit", "CodePattern", "Elevator", "Holo", "Hologram", "MetalPanel",
    "Neon", "Pipe", "PowerNode", "QuantumField", "Reactor", "Robot", "SpaceDebris",
    "Spacecraft", "Transmitter", "AlienStructure",
    "Capsule", "Generator", "ColumnTech", "Debris"
  ], {
    verb: VERB.DISMANTLE, spec: "Electronics",
    rewards: [[MAT.STEEL, 1, 2], [MAT.PLASTIC, 1, 2], [MAT.MICROCHIP, 0, 1]]
  });

  // --- Magic / occult: dismantle for arcane essence + ethereal + crystal ---
  assign([
    "Alchemy", "Altar", "ArcaneRuin", "Aura", "Cursed", "Divine", "Ether", "Glow",
    "ManaSource", "Orb", "Portal", "Rune", "Sacred", "Shadow", "Shrine", "Spectral",
    "SpellCircle", "Spirit", "SummonCircle", "Void", "GhostTrap", "TrapArea"
  ], {
    verb: VERB.DISMANTLE, spec: "Alchemy",
    rewards: [[MAT.ARCANE, 1, 2], [MAT.ETHEREAL, 0, 1], [MAT.CRYSTAL, 0, 1]]
  });

  // Pure terrain / hazards / water features that make no sense to remove: never
  // offer an interaction (also keeps climbing & swimming behaviour intact).
  const SKIP = new Set([
    "Island", "Badland", "Magma", "Ember", "Lagoon", "Whirlpool", "Oasis", "Geyser",
    "Geothermal", "Sulfur", "SpringIce", "Spring", "Ice", "Snow", "Sand", "Stone",
    "Grass", "GrassDark", "Road", "Sidewalk", "Water", "Ocean", "Mountain", "Cliff",
    // Ground the map is made of, and marks left on it: a crack, a crater, a
    // stain, a splash of blood and a drift of snow are the terrain itself.
    "Crack", "Crater", "Stain", "Blood", "SnowPile", "IcePool", "GrassWater",
    "Salt", "Beach", "Mud", "Dirt",
    // Building/dungeon entrances + interactive signposts: used via
    // ProceduralHouseSystem (enter / refuel / fast-travel), never harvested.
    "DoorHouse", "DoorInn", "DoorShop", "DoorSkyscraper", "DoorDungeon",
    "SignPark", "SignBus",
    // The city tileset's trade doors and its way down into the sewer: walked
    // into like every other entrance, never taken apart for their timber.
    "DoorClinic", "DoorPoliceStation", "DoorWeaponStore", "DoorGym",
    "DoorHardwareStore", "DoorIceCream", "DoorMusicStore", "DoorSewers",
    "GarageDoor", "Manhole",
    // Paint on and in the road: bays, crossings, lane markings, a gully
    // grating. There is nothing there to pick up, and clearing it would leave a
    // hole in the road with no tile under it. Writing on a wall is read, never
    // taken away. The city sheet paints its bays with ParkingDrawing and the
    // Road sheet with Parking, so both are named.
    "Parking", "ZebraHorizontal", "ZebraVertical",
    "DashedLine", "DashedLineHorizontal", "DashedLineVertical",
    "Path", "PathDesert", "PathIce",
    //
    // The floor names that used to be listed here (Pavement, Parquet,
    // WoodenFloor, Metal, Techno, TechnoFloor, Glass) are NOT skipped: they are
    // A5 ground autotiles on the city sheet, laid on layer 0 where featureAt
    // never looks, so listing them bought nothing there - and on some fifty
    // other tilesets the same names are real B-E props (a pane of glass, a
    // paving slab), which skipping them would have quietly made inert.
    "ParkingDrawing", "Drain", "Graffiti", "Poster",
    // Purely a step-on trigger (wets the party, see the moveStraight hook below),
    // never an action-button interaction.
    "Puddle"
  ]);

  // Generic fallback for any other real, named layer-2 feature.
  const DEFAULT_CONFIG = { verb: VERB.DISMANTLE, spec: "Carpentry", rewards: [[MAT.WOOD, 1, 2]] };
  // i18n-ignore-end

  // Scenery a prefab painted that the biome tileset gives no feature name to.
  // A prefab is an authored map, and nearly everything it puts on the object
  // layers IS a named feature of the biome tileset (classified above like any
  // other) -- but the handful that is not used to be dead decoration standing in
  // the middle of a square where everything around it comes apart. Whatever a
  // prefab stood on an object layer is salvaged like the rest.
  function prefabFixtureAt(x, y, tileId) {
    // A5 (1536-1663) and A1-A4 (2048+) autotiles are ground and walls, never
    // loose scenery, so a bare floor inside a prefab is not "dismantlable".
    if (!tileId || tileId >= 1536) return false;
    const P = window.ProceduralMapPrefabs;
    const rects = (P && typeof P.getPrefabFootprints === "function") ? P.getPrefabFootprints() : null;
    if (!rects) return false;
    return rects.some(r => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height);
  }

  // Resolve the interaction config for a feature name, or null to skip.
  function classify(name) {
    if (!name) return null;
    if (SKIP.has(name)) return null;
    // Ignore raw terrain autotiles / unmapped tiles.
    if (name.startsWith("A5 ") || name.startsWith("Extended ") || name === "Unknown") return null;  // i18n-ignore  tile ids
    return FEATURE_CONFIG[name] || DEFAULT_CONFIG;
  }

  // ==========================================================================
  // Tool requirement checks
  // ==========================================================================
  function partyHasWeaponType(wtypeId) {
    if (!$gameParty) return false;
    // Unequipped inventory weapons.
    if ($gameParty.weapons().some(w => w && w.wtypeId === wtypeId)) return true;
    // Equipped weapons on party members.
    return $gameParty.members().some(a =>
      a.weapons().some(w => w && w.wtypeId === wtypeId)
    );
  }

  function meetsRequirement(req) {
    if (!req) return true;
    if ($gameSystem && $gameSystem._isSandboxMode) return true;
    if (req === REQ.AXE) {
      return partyHasWeaponType(WTYPE_AXE);
    }
    if (req === REQ.ROCK) {
      return (
        ($dataWeapons[PICK_WEAPON_ID] && $gameParty.hasItem($dataWeapons[PICK_WEAPON_ID], true)) ||
        partyHasWeaponType(WTYPE_HEAVY) ||
        ($dataArmors[PICK_ARMOR_ID] && $gameParty.hasItem($dataArmors[PICK_ARMOR_ID], true))
      );
    }
    return true;
  }

  function requirementError(req) {
    if (req === REQ.AXE) {
      return T('Terrain.needAxe');
    }
    return T('Terrain.needPickaxe');
  }

  // ==========================================================================
  // Reward popup (shared ParchmentToast, same as battle rewards)
  // ==========================================================================
  function itemData(id) {
    return (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[id] : null;
  }

  function showRewardPopup(gained) {
    if (!gained.length || !window.ParchmentToast) return;
    window.ParchmentToast.reward({
      entries: gained.map(g => ({ obj: itemData(g.id), qty: g.qty }))
    });
  }

  // ==========================================================================
  // Reward rolling & granting
  // ==========================================================================
  function addGain(list, id, qty) {
    if (qty <= 0) return;
    const existing = list.find(g => g.id === id);
    if (existing) existing.qty += qty;
    else list.push({ id, qty });
  }

  function rollRewards(cfg, name) {
    const gained = [];
    for (const [id, min, max] of cfg.rewards) {
      const q = min + Math.floor(Math.random() * (max - min + 1));
      addGain(gained, id, q);
    }
    if (cfg.ingot) {
      const chance = cfg.ingot === "high" ? 0.6 : 0.25;
      if (Math.random() < chance) {
        const ingot = Math.random() < 0.75 ? MINE_INGOTS[0] : MINE_INGOTS[1];
        addGain(gained, ingot, 1);
      }
    }
    // Foliage is not only biomatter: a bush that grows where the party is
    // standing quite often has something on it worth eating (see below).
    if (cfg.forage) {
      const food = rollForage(name, cfg.forage);
      if (food) addGain(gained, food, 1);
    }
    return gained;
  }

  function grantRewards(gained) {
    for (const g of gained) {
      const item = itemData(g.id);
      if (item) $gameParty.gainItem(item, g.qty);
    }
  }

  // ==========================================================================
  // Wild food: what a plant IS, as opposed to what it is made of
  // ==========================================================================
  // Picking foliage has always paid Plant matter, the crafting token. It now
  // also, often, pays the thing the plant actually is: a real, edible
  // <category:Food> item taken off the ground. Which one depends entirely on
  // WHERE the party is standing - a bilberry does not grow on a salt flat and
  // a date palm does not grow on a glacier - so:
  //
  //   - every forageable food in data/Items.json carries a note tag
  //         <Forage: key[:weight], key[:weight], ...>
  //     naming the countries it belongs to. The weight is optional and is
  //     relative WITHIN one pool, which is how a Cloudberry can be common on
  //     the tundra while a Moonberry stays a once-in-a-long-while find.
  //   - the biome the party is standing in resolves to those same keys
  //     (FORAGE_FAMILIES below), and the roll is taken from the union of the
  //     pools it names.
  //
  // Nothing here is hard-coded to an item id: tagging a new food <Forage: ...>
  // in the database is the whole of adding it to the wild.
  //
  // Alien surfaces deliberately resolve to NOTHING. Another world's flora is
  // not a hedgerow, and what an alien square offers is butchered off a
  // Tentacle, not picked off a bush.

  const FORAGE_DEFAULT_WEIGHT = 6;
  // How often a pick turns up food at all, before training. Foraging pushes it
  // up by the usual 8% a tier (Untrained 0.40 -> Master 0.53), which is what
  // being good at this is supposed to mean.
  const FORAGE_BASE_CHANCE = 0.40;

  // i18n-ignore-start  Biomes.json ids and <Forage:> pool keys, never labels
  const FORAGE_FAMILIES = [
    // Frozen country: nothing ripens here except what the cold made itself.
    { key: "ice", test: /^(ice|snow|permafrost|tundra|glacier|taiga|caveice|cavefrozen|mountainice|forestice|villageice|cityice|burgice)/i },
    // Burnt ground: the fungus that fruits in ash and the fruit that likes heat.
    { key: "volcanic", test: /^(volcano|hell|ember|lava)/i },
    // Dry country, where the food stores water or sugar and nothing else.
    { key: "desert", test: /^(desert|saltflats|saltworks|badlands|canyon|steppe|savannah|mountaindesert|citydesert|villagedesert|burgdesert)/i },
    // The water's edge, fresh or salt.
    { key: "wet", test: /^(swamp|mangrove|lake|river|riverbank|beach|ocean|docks|seabed|caveflooded|cistern|seagrotto|bridge|villageriver|villagesea)/i },
    // Temperate woods: the richest larder on the list.
    { key: "woodland", test: /^(forest|bamboo|spiritwoods|park|fairy|taiga)/i },
    // Hot woods.
    { key: "tropical", test: /^(jungle|foresttropical|mangrove)/i },
    // Worked land, and the verges that feed better than the field does. The
    // steppe and the savannah are in here as well as in the desert: open
    // grassland is dry country with a hedgerow running through it.
    { key: "rural", test: /^(farm|fields|meadows|village|highlands|orchard|road|park|steppe|savannah)/i },
    // Rock and altitude.
    { key: "mountain", test: /^(mountain|highlands|canyon|cliff|mines|lair|crystals)/i },
    // Underground, where a plant has to manage without the sun. Everything
    // built down there and buried since (a sunken library, a cold-war bunker,
    // a buried lab) counts: whatever is growing in it grew in the dark.
    { key: "cave", test: /^(cave|underdark|mines|mineshaft|crystals|crystalcavern|fungalwarren|mushroom|catacombs|crypt|dungeon|barrow|grotto|smugglertunnel|oubliette|lootcellar|sewer|lair|sunkenlibrary|underforge|coldwarbunker|buriedlab|profaneshrine|patronvault)/i },
    // Damp and dark enough that the fungus is the crop.
    { key: "fungus", test: /^(mushroom|fungalwarren)/i },
    // Pavement, and whatever is winning against it.
    { key: "urban", test: /^(city|burg|metro|highway|office|omegatower|houses|factory|landfill|train|arena|prison|sewer|spacecenter|laboratory|abandoned|ruins|graveyard|villa|castle|temple|church|park)/i },
    // Places that are not really countries at all.
    { key: "weird", test: /^(eldritch|limbo|dreamscape|abstract|digital|heaven|space|spiritwoods|fairy)/i },
  ];

  // A feature that IS one particular plant overrides the biome table: wheat is
  // wheat wherever the field stands, and a mushroom is a mushroom. A number is
  // an item id, a string is a pool key.
  const FEATURE_FORAGE = {
    Wheat: 1728, Corn: 1735, Sunflower: 1733, Cactus: 1743,
    Kelp: 1783, Seaweed: 1783, SeaPlant: 1783,
    Cattail: 1777, Reed: 1777,
    Mushroom: "fungus", MushroomIce: "fungus",
  };
  // i18n-ignore-end

  // pool key -> [{ id, weight }], and item id -> the set of keys it claims.
  // Scanned once out of $dataItems, which does not change during a session.
  let _forageIndex = null;
  function forageIndex() {
    if (_forageIndex) return _forageIndex;
    const pools = {};
    const keysById = {};
    if (typeof $dataItems !== "undefined" && $dataItems) {
      for (let i = 1; i < $dataItems.length; i++) {
        const it = $dataItems[i];
        if (!it || !it.name || !it.note) continue;
        const tag = it.note.match(/<Forage:\s*([^>]*)>/i);
        if (!tag) continue;
        for (const part of tag[1].split(",")) {
          const [rawKey, rawWeight] = part.split(":");
          const key = (rawKey || "").trim().toLowerCase();
          if (!key) continue;
          const weight = Math.max(1, parseInt(rawWeight, 10) || FORAGE_DEFAULT_WEIGHT);
          (pools[key] = pools[key] || []).push({ id: i, weight });
          (keysById[i] = keysById[i] || new Set()).add(key);
        }
      }
    }
    _forageIndex = { pools, keysById };
    return _forageIndex;
  }

  // The pool keys the square the party is standing on answers to. Empty for an
  // alien surface, and empty for a biome no family recognises, which is the
  // signal to hand out no food at all.
  function currentForageKeys() {
    const pg = $gameSystem && $gameSystem._procGenData;
    const biome = pg && pg.currentBiome ? String(pg.currentBiome) : "";
    if (!biome || /^alien/i.test(biome)) return [];
    const keys = [];
    for (const fam of FORAGE_FAMILIES) {
      if (fam.test.test(biome) && keys.indexOf(fam.key) < 0) keys.push(fam.key);
    }
    return keys;
  }

  // One weighted draw across every pool in `keys`, as a single item id, or 0.
  // `narrowTo`, when it is given and has anything to say, keeps only the
  // candidates that ALSO belong to one of those keys: it is how a pool named by
  // the feature is still pulled back to the country the party is standing in,
  // so a mushroom picked in a forest does not come up a blind cave mushroom.
  // If the country has none of them, the whole pool stands.
  function drawFromPools(keys, narrowTo) {
    const { pools, keysById } = forageIndex();
    let candidates = [];
    for (const key of keys) {
      for (const entry of pools[key] || []) candidates.push(entry);
    }
    if (narrowTo && narrowTo.length) {
      const local = candidates.filter(e =>
        keysById[e.id] && narrowTo.some(k => keysById[e.id].has(k)));
      if (local.length) candidates = local;
    }
    let total = 0;
    for (const entry of candidates) total += entry.weight;
    if (total <= 0) return 0;
    let roll = Math.random() * total;
    for (const entry of candidates) {
      roll -= entry.weight;
      if (roll <= 0) return entry.id;
    }
    return 0;
  }

  // The food a single pick turns up, or 0 for the times it turns up nothing.
  // `spec` is the feature's own `forage` value: true means "whatever grows
  // here", and FEATURE_FORAGE can override it with a fixed plant or pool.
  function rollForage(name, spec) {
    const keys = currentForageKeys();
    // No country, no larder. An alien surface forages nothing at all - what it
    // offers is butchered off a Tentacle - and so does any biome the table does
    // not recognise, which is the safe answer rather than a hedgerow on Mars.
    if (!keys.length) return 0;

    const override = name && Object.prototype.hasOwnProperty.call(FEATURE_FORAGE, name)
      ? FEATURE_FORAGE[name] : null;
    const target = override !== null ? override : spec;

    let chance = FORAGE_BASE_CHANCE;
    if (window.SpecializationXP && typeof window.SpecializationXP.multiplier === "function") {
      chance *= window.SpecializationXP.multiplier("Foraging");  // i18n-ignore  Specialization.json id
    }
    if (Math.random() >= Math.min(0.95, chance)) return 0;

    // A named plant is itself, in any country - but only if it is real.
    if (typeof target === "number") return itemData(target) ? target : 0;
    // A named pool keeps its kind and takes the country as a filter.
    if (typeof target === "string") {
      return drawFromPools([target], keys.filter(k => k !== target));
    }
    return drawFromPools(keys);
  }

  // ==========================================================================
  // World-folder persistence of dismantled features
  // ==========================================================================
  // Stored as save/worlds/<name>/terrain.json:
  //   { dismantled: { "<procMapKey>": { "x,y": featureName } } }
  // A plain object (NOT a Set/Map) so JsonEx serialises it on flush.
  function terrainStore() {
    if (!window.WorldManager || typeof window.WorldManager.getFile !== "function") return null;
    const store = window.WorldManager.getFile("terrain");
    if (!store.dismantled) store.dismantled = {};
    return store;
  }

  // Composite per-coordinate key (biome + world coord + depth), identical to the
  // furniture system so removals track the exact world tile they were made on.
  function currentMapKey() {
    if (window.FurnitureSystem && typeof window.FurnitureSystem.furnitureMapKey === "function") {
      return String(window.FurnitureSystem.furnitureMapKey());
    }
    return String($gameMap ? $gameMap.mapId() : 0);
  }

  // The same key composed for an EXPLICIT biome + world coordinate rather than
  // for the map the party is standing on. The prefab pass asks for a square's
  // removals from DataManager.loadMapData, before Game_Map has switched to it,
  // so currentMapKey() would still be answering for the square being left.
  // Mirrors WorldMapReturn's FurnitureSystem.mapKeyProvider exactly.
  function procMapKeyFor(biomeName, worldCoords) {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg || !biomeName || !worldCoords) return null;
    const depth = (pg.biomeLayerStack && pg.biomeLayerStack.length) || 0;
    const sess = pg._dungeonSession;
    const salt = (sess && sess.salt) ? `:${sess.salt}` : "";
    return `proc:${biomeName}:${worldCoords.x},${worldCoords.y}:${depth}${salt}`;
  }

  // Every tile the party has removed on one proc-map square, as a Set of "x,y",
  // or null when that square has none. ProceduralMapPrefabs reads it so a felled
  // tree is stamped bare instead of being put back by the prefab it stood in.
  function removedTilesFor(biomeName, worldCoords) {
    const store = terrainStore();
    if (!store) return null;
    const key = procMapKeyFor(biomeName, worldCoords);
    const tiles = key && store.dismantled[key];
    if (!tiles) return null;
    const keys = Object.keys(tiles);
    return keys.length ? new Set(keys) : null;
  }

  // ---- map coordinates vs square-local ones ------------------------------
  //
  // The key above names ONE world square, and everything filed under it is
  // filed in that square's own 64x64 coordinates: the prefab pass reads these
  // removals while stamping a square's own array, long before it is a map.
  //
  // What the party interacts with is a map coordinate, and map 636 holds a
  // WINDOW of up to nine squares laid side by side, so the two are not the same
  // number. Storing the map one was how a tree felled at map x=100 came back as
  // "x=100 of this square" - a column that square does not have - and how
  // replaying it into a differently shaped window blanked whatever happened to
  // sit at that index instead, which on a square carrying a prefab is the
  // prefab.
  function storedSpot(mapX, mapY) {
    if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return { x: mapX, y: mapY };
    const S = window.ProcStitch;
    const local = (S && typeof S.localToParty === "function")
      ? S.localToParty(mapX, mapY) : { x: mapX, y: mapY };
    // A tile just over a seam belongs to the neighbouring square, which is a
    // different key: not this square's business, and not recorded here.
    if (local.x < 0 || local.y < 0 ||
        local.x >= PROC_MAP_WIDTH || local.y >= PROC_MAP_HEIGHT) return null;
    return local;
  }

  // The way back: where a stored spot of the party's square sits on the map as
  // it is laid out right now. Answers null for a spot that is not a square
  // coordinate at all, which is what a store written before this was fixed is
  // full of - healed by being ignored rather than by blanking a random tile.
  function spotOnMap(x, y) {
    if (x < 0 || y < 0 || x >= PROC_MAP_WIDTH || y >= PROC_MAP_HEIGHT) return null;
    const S = window.ProcStitch;
    if (!S || typeof S.toMap !== "function") return { x, y };
    const wx = $gameVariables ? $gameVariables.value(43) : 0;
    const wy = $gameVariables ? $gameVariables.value(44) : 0;
    return S.toMap(wx, wy, x, y);
  }

  // `flushNow` is what a deliberate removal does: one felled tree, written out
  // at once. It is false only for removals that arrive in a stream (a vehicle
  // driven through a hedgerow clears a tile per step), because a flush writes
  // EVERY world file and doing that six times a second while driving would
  // stall the map. Those are written on the throttle below instead, and by the
  // next savegame whatever happens.
  function recordDismantled(tiles, name, flushNow = true) {
    const store = terrainStore();
    if (!store) return;
    const key = currentMapKey();
    if (!store.dismantled[key]) store.dismantled[key] = {};
    for (const t of tiles) {
      const spot = storedSpot(t.x, t.y);
      if (!spot) continue;
      store.dismantled[key][`${spot.x},${spot.y}`] = name;
    }
    // Flush immediately so other savegames in the same world see the removal
    // even before the next in-game save.
    if (flushNow && typeof window.WorldManager.flush === "function") {
      try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
    }
  }

  // Frames between two world-folder writes made by a streamed removal.
  const STREAMED_FLUSH_FRAMES = 600;
  let _lastStreamedFlush = -STREAMED_FLUSH_FRAMES;

  function flushStreamedRemovals() {
    const now = (typeof Graphics !== "undefined" && Graphics) ? Graphics.frameCount : 0;
    if (now - _lastStreamedFlush < STREAMED_FLUSH_FRAMES) return;
    _lastStreamedFlush = now;
    if (window.WorldManager && typeof window.WorldManager.flush === "function") {
      try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
    }
  }

  // Zero out the feature layers (1-3) of a single tile in the live map data.
  function clearFeatureTileData(x, y) {
    if (!$dataMap || !$dataMap.data) return;
    const w = $dataMap.width;
    const h = $dataMap.height;
    for (const z of [1, 2, 3]) {
      $dataMap.data[z * w * h + y * w + x] = 0;
    }
  }

  // Tile ids of a feature that must never be cleared by a stored removal, on
  // the current tileset. A patron's Hatch is stamped after generation and is
  // not dismantlable, but it can land on a tile where something else was felled
  // long ago - and that old record would quietly delete it on every load.
  function undeletableTileIds() {
    const U = window.ProcGenUtils;
    const tilesetId = currentTilesetId();
    if (!U || !U.Cache || !tilesetId) return null;
    const all = U.Cache.getTilesetFeatures(tilesetId) || {};
    const ids = new Set();
    for (const v of all["Hatch"] || []) {  // i18n-ignore  feature id
      if (v && v.type === "single" && v.tileId) ids.add(v.tileId);
    }
    return ids.size ? ids : null;
  }

  // Re-apply all stored removals for the current proc-map coordinate.
  function applyDismantledToMap() {
    const store = terrainStore();
    if (!store) return;
    const tiles = store.dismantled[currentMapKey()];
    if (!tiles) return;
    if (!$dataMap || !$dataMap.data) return;
    const w = $dataMap.width;
    const h = $dataMap.height;
    const keep = undeletableTileIds();
    for (const coord of Object.keys(tiles)) {
      const [xs, ys] = coord.split(",");
      const sx = parseInt(xs, 10);
      const sy = parseInt(ys, 10);
      if (isNaN(sx) || isNaN(sy)) continue;
      const on = spotOnMap(sx, sy);
      if (!on) continue;
      const x = on.x, y = on.y;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (keep && keep.has($dataMap.data[2 * w * h + y * w + x])) continue;
      for (const z of [1, 2, 3]) {
        $dataMap.data[z * w * h + y * w + x] = 0;
      }
    }
    if ($gameMap) $gameMap.requestRefresh();
  }

  // ==========================================================================
  // Feature lookup at (x, y)
  // ==========================================================================
  // Per-tileset lookup tables, built lazily and memoised:
  //   tileToFeature : tileId -> feature name
  //   tileToGrid    : tileId -> { grid, gr, gc } for multi-tile (grid) variants,
  //                   so a faced tile can be traced back to the full footprint.
  const _lookupCache = {};
  function getLookup(tilesetId) {
    if (_lookupCache[tilesetId]) return _lookupCache[tilesetId];
    const U = window.ProcGenUtils;
    const allFeatures = U.Cache.getTilesetFeatures(tilesetId);
    const tileToFeature = U.createTileToFeatureMap(allFeatures);
    const tileToGrid = {};
    for (const variants of Object.values(allFeatures)) {
      if (!Array.isArray(variants)) continue;
      for (const variant of variants) {
        const grid = (variant && variant.type === "grid") ? variant.grid : null;
        if (!grid) continue;
        for (let gr = 0; gr < grid.length; gr++) {
          for (let gc = 0; gc < grid[gr].length; gc++) {
            const tid = grid[gr][gc];
            if (tid && tileToGrid[tid] === undefined) {
              tileToGrid[tid] = { grid, gr, gc };
            }
          }
        }
      }
    }
    _lookupCache[tilesetId] = { tileToFeature, tileToGrid };
    return _lookupCache[tilesetId];
  }

  function currentTilesetId() {
    const tileset = $gameMap ? $gameMap.tileset() : null;
    return tileset ? tileset.id : 0;
  }

  // Returns { name, layer, tileId } for the feature occupying (x, y), or null.
  function featureAt(x, y) {
    const U = window.ProcGenUtils;
    if (!U || !$gameMap) return null;
    const tilesetId = currentTilesetId();
    if (!tilesetId) return null;
    const { tileToFeature } = getLookup(tilesetId);
    // Scan the object feature layers (top-most first). Layer 0 is base terrain,
    // layer 1 holds terrain-shape features (mountain/water) we must not touch.
    for (const z of [3, 2]) {
      const tileId = $gameMap.tileId(x, y, z);
      if (tileId !== 0) {
        return { name: U.getFeatureNameFromTileId(tileId, tileToFeature), layer: z, tileId };
      }
    }
    return null;
  }

  // Every tile that composes the feature the player faces. Single-tile features
  // return just [{x,y}]; multi-tile (grid) features return the whole footprint,
  // reconstructed from the faced tile's position inside its grid variant.
  function computeFootprint(x, y, layer, tileId) {
    const tilesetId = currentTilesetId();
    if (!tilesetId) return [{ x, y }];
    const { tileToGrid } = getLookup(tilesetId);
    const entry = tileToGrid[tileId];
    if (!entry) return [{ x, y }];

    const grid = entry.grid;
    const originX = x - entry.gc;
    const originY = y - entry.gr;
    const tiles = [];
    for (let gr = 0; gr < grid.length; gr++) {
      for (let gc = 0; gc < grid[gr].length; gc++) {
        const cx = originX + gc;
        const cy = originY + gr;
        if (cx < 0 || cy < 0 || cx >= $dataMap.width || cy >= $dataMap.height) continue;
        // Only take a cell that still actually holds this variant's tile, so we
        // never clear a neighbouring feature that happens to sit in the box.
        if ($gameMap.tileId(cx, cy, layer) === grid[gr][gc]) {
          tiles.push({ x: cx, y: cy });
        }
      }
    }
    if (!tiles.some(t => t.x === x && t.y === y)) tiles.push({ x, y });
    return tiles;
  }

  // ==========================================================================
  // Interaction flow
  // ==========================================================================
  function performDismantle(name, cfg, tiles, onRemove) {
    if (onRemove) {
      // Not a tile on any map: the caller owns the thing and takes it away.
      onRemove();
    } else {
      // Remove every tile of the feature (whole footprint for multi-tile pieces),
      // then refresh the tilemap once.
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
    }
    const gained = rollRewards(cfg, name);
    grantRewards(gained);
    playActionSe(cfg.verb);
    showRewardPopup(gained);
    // Some things are not yours to take apart. A feature whose entry names a
    // crime files it the moment the work is done, on the same charge sheet
    // everything else in the game writes to (CrimeSystem), so the bounty, the
    // wanted heat and the trial all see it.
    if (cfg.crime && window.CrimeSystem && typeof window.CrimeSystem.addPresetCrime === "function") {
      window.CrimeSystem.addPresetCrime(cfg.crime);
    }
    // The work itself is the lesson, and which lesson depends on what was
    // taken apart: an axe in a trunk teaches Lumberjacking, a prybar in a
    // reactor housing teaches Electronics. Capped per day like all the rest.
    if (cfg.spec && window.SpecializationXP) {
      window.SpecializationXP.awardCapped(cfg.spec, 1);
    }
  }

  // ==========================================================================
  // SignPost: Read (place name) / Dismantle (1 wood) / Cancel
  // ==========================================================================
  // A deterministic, readable name for the current proc-map settlement, derived
  // from the world seed + the player's world coordinate (Vars 43/44), so the
  // same tile always reads the same place name across savegames/visits.
  // i18n-ignore-start  invented English place-name syllables; a settlement's
  // name is a proper noun and is never translated
  const PLACE_PREFIX = [
    "Ash", "Bram", "Ever", "Frost", "Gold", "Grey", "Hollow", "Iron", "Long",
    "Marsh", "Mill", "North", "Oak", "Raven", "Red", "Silver", "Stone", "Thorn",
    "West", "Wind", "Wolf", "Amber", "Black", "Clear", "Fern", "Green", "High",
    "Moss", "Pine", "Rook", "Elder", "Fox", "Hart", "Lark", "Sable"
  ];
  const PLACE_SUFFIX = [
    "bury", "borough", "brook", "dale", "field", "ford", "gate", "haven", "hill",
    "hollow", "mere", "moor", "stead", "ton", "vale", "wick", "wood", "worth",
    "cross", "shire", "reach", "bridge", "fall", "glen", "march", "port",
    "ridge", "stone", "combe", "thorpe"
  ];
  // i18n-ignore-end

  function currentPlaceName() {
    let wx = 0, wy = 0;
    if (typeof $gameVariables !== "undefined" && $gameVariables) {
      wx = $gameVariables.value(43) | 0;
      wy = $gameVariables.value(44) | 0;
    }
    // A hand-authored name (a real city, a special landmark, ...) always wins
    // over the generated placeholder for this exact world tile.
    const overrides = window.WorldGen && window.WorldGen.HardcodedBiomeNames;
    const override = overrides ? overrides[`${wx},${wy}`] : null;
    if (override) return override;

    const U = window.ProcGenUtils;
    let seed;
    if (U && typeof U.getWorldSeed === "function" && typeof U.hashCoords === "function") {
      seed = U.hashCoords(U.getWorldSeed(), wx, wy) >>> 0;
    } else {
      seed = ((19002001 ^ (wx * 73856093) ^ (wy * 19349663)) >>> 0);
    }
    const pre = PLACE_PREFIX[seed % PLACE_PREFIX.length];
    const suf = PLACE_SUFFIX[Math.floor(seed / PLACE_PREFIX.length) % PLACE_SUFFIX.length];
    return pre + suf;
  }

  // Dismantle a signpost for a single unit of wood (fixed reward per request).
  function performSignPostDismantle(name, tiles) {
    for (const t of tiles) clearFeatureTileData(t.x, t.y);
    if ($gameMap) $gameMap.requestRefresh();
    recordDismantled(tiles, name);
    const gained = [{ id: MAT.WOOD, qty: 1 }];
    grantRewards(gained);
    playActionSe(VERB.DISMANTLE);
    showRewardPopup(gained);
  }

  function showSignPostMenu(name, tiles) {
    const choices = [T('Terrain.read'), T('Terrain.verb.dismantle'), T('Terrain.cancel')];
    $gameMessage._eventActivator = "p1";
    window.skipLocalization = true;
    $gameMessage.setChoices(choices, 0, 2);
    window.skipLocalization = false;
    $gameMessage.setChoiceCallback((index) => {
      // Defer past the choice window teardown so any follow-up dialogue shows.
      if (index === 0) {
        setTimeout(() => {
          window.skipLocalization = true;
          $gameMessage.add(currentPlaceName());
          window.skipLocalization = false;
        }, 0);
      } else if (index === 1) {
        setTimeout(() => performSignPostDismantle(name, tiles), 0);
      }
      // index 2 (Cancel) or dismissed: do nothing.
    });
  }

  // `onRemove`, when given, is what actually takes the thing away - which for
  // anything that is not a tile on this map (the 3D world's billboard trees and
  // boulders) is the only part that differs. Everything else about it is the
  // same work for the same pay.
  function showDismantleMenu(name, cfg, tiles, onRemove) {
    const label = verbLabel(cfg.verb);
    const choices = [label, T('Terrain.cancel')];
    $gameMessage._eventActivator = "p1";
    // Choice/message text is already resolved through T(); wrap so the shared
    // localization layer leaves it untouched.
    window.skipLocalization = true;
    $gameMessage.setChoices(choices, 0, 1);
    window.skipLocalization = false;
    $gameMessage.setChoiceCallback((index) => {
      // Defer past the choice window teardown ($gameMessage is cleared right
      // after this callback), so any follow-up dialogue actually shows.
      if (index !== 0) return;
      setTimeout(() => {
        if (cfg.req && !meetsRequirement(cfg.req)) {
          window.skipLocalization = true;
          $gameMessage.add(requirementError(cfg.req));
          window.skipLocalization = false;
          return;
        }
        performDismantle(name, cfg, tiles, onRemove);
      }, 0);
    });
  }

  // Generic "<Choice 1> / <Choice 2> / ... / Cancel" prompt. `choices` is an
  // array of display labels (already resolved through T()); `onSelect(index)`
  // fires for any pick that ISN'T the trailing, auto-appended Cancel entry.
  function showChoiceMenu(choices, onSelect) {
    const full = choices.concat([T('Terrain.cancel')]);
    $gameMessage._eventActivator = "p1";
    window.skipLocalization = true;
    $gameMessage.setChoices(full, 0, full.length - 1);
    window.skipLocalization = false;
    $gameMessage.setChoiceCallback((index) => {
      if (index < 0 || index >= choices.length) return; // Cancel or dismissed
      setTimeout(() => onSelect(index), 0);
    });
  }

  // Immediate (no confirmation) narrative popup: a couple of lines of
  // generated/flavour text shown via the normal message window.
  function showLoreMessage(lines) {
    setTimeout(() => {
      window.skipLocalization = true;
      for (const line of [].concat(lines)) $gameMessage.add(line);
      window.skipLocalization = false;
    }, 0);
  }

  // A readable feature - a statue, a bookcase, a book on a table - is offered
  // to the Raman probe before it shows its text: Look reads it, Analyze runs
  // the spectrum on the tile. Without a probe the prompt never appears and the
  // feature behaves exactly as it always did.
  function offerFeatureScan(tile, objectType, label, onLook) {
    const scanner = window.RamanScanner;
    if (!scanner || typeof scanner.offer !== "function") { onLook(); return; }
    scanner.offer(onLook, () => {
      setTimeout(() => scanner.scanTile(tile.x, tile.y, objectType, label), 0);
    });
  }

  // ==========================================================================
  // Custom-interaction helpers (items/materials/loot shared by CUSTOM_HANDLERS)
  // ==========================================================================
  const SHOVEL_ITEM_ID = 138;
  const BEER_ITEM_ID   = 498;
  const DRUNK_STATE_ID = 42;  // data/States.json "Drunk"
  const CHEAP_WEAPON_MAX_PRICE = 1500;
  const TRINKET_MAX_PRICE = 6000;
  // What counts as a rare weapon in a patron's vault: the top third of the
  // whole armoury by price.
  const VAULT_WEAPON_MIN_PRICE = 50000;

  // Any real, selectable $dataItems entry whose <category:X> tag matches exactly.
  function itemsWithCategory(category) {
    const re = new RegExp(`<category:\\s*${category}\\s*>`, "i");
    const out = [];
    for (let i = 1; i < $dataItems.length; i++) {
      const it = $dataItems[i];
      if (it && it.name && it.note && re.test(it.note)) out.push(it);
    }
    return out;
  }

  // Any real $dataItems entry whose display name contains the given substring.
  function itemsWithNameContaining(substr) {
    const re = new RegExp(substr, "i");
    const out = [];
    for (let i = 1; i < $dataItems.length; i++) {
      const it = $dataItems[i];
      if (it && it.name && re.test(it.name)) out.push(it);
    }
    return out;
  }

  function randomFrom(list, rng) {
    const roll = rng || Math.random;
    return list.length ? list[Math.floor(roll() * list.length)] : null;
  }

  // A random weapon cheap enough to hand out as a lucky find (price > 0, so
  // unsellable/placeholder 0-price weapons never come up).
  function randomCheapWeapon(maxPrice) {
    const out = [];
    for (let i = 1; i < $dataWeapons.length; i++) {
      const w = $dataWeapons[i];
      if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(w)) continue;
      if (w && w.name && w.name.trim() !== "" && w.price > 0 && w.price <= maxPrice) out.push(w);
    }
    return randomFrom(out);
  }

  // The opposite end of the same rack: a weapon nobody leaves lying in a
  // cellar. Only ever handed out inside a patron's vault, where the whole
  // point is that the racks are worth something.
  function randomRareWeapon(minPrice) {
    const out = [];
    for (let i = 1; i < $dataWeapons.length; i++) {
      const w = $dataWeapons[i];
      if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(w)) continue;
      if (w && w.name && w.name.trim() !== "" && w.price >= minPrice) out.push(w);
    }
    return randomFrom(out);
  }

  // True while the party stands in a patron's vault (PatreonRewards): the gold
  // hoards and the weapon racks in there pay out on a different scale.
  function inPatronVault() {
    const PR = window.PatreonRewards;
    return !!(PR && typeof PR.isInPatronVault === "function" && PR.isInPatronVault());
  }

  // A random accessory (etypeId 5) cheap enough to pass for a trinket buried
  // in a hoard. Takes the caller's rng so the find stays tile-deterministic.
  function randomTrinket(maxPrice, rng) {
    const out = [];
    for (let i = 1; i < $dataArmors.length; i++) {
      const a = $dataArmors[i];
      if (a && a.name && a.name.trim() !== "" && a.etypeId === 5 && a.price > 0 && a.price <= maxPrice) out.push(a);
    }
    return randomFrom(out, rng);
  }

  // Same popup, but for already-resolved data objects (items/weapons/armors)
  // instead of item ids - used for weapon/body-part/book/skull grants where the
  // id isn't known ahead of time.
  function showRewardPopupObjects(entries) {
    entries = entries.filter(e => e && e.obj);
    if (!entries.length || !window.ParchmentToast) return;
    window.ParchmentToast.reward({ entries });
  }

  function grantObjects(entries) {
    for (const e of entries) {
      if (e && e.obj) $gameParty.gainItem(e.obj, e.qty);
    }
  }

  function showGoldPopup(amount) {
    if (!window.ParchmentToast) return;
    window.ParchmentToast.gold(amount);
  }

  // Recovery formula shared with TimeDateSystem's EatFood command
  // (calories*0.10 + protein*2.00 + fat*1.50), read straight off the item's
  // own note tags so it stays in sync if the item is ever re-balanced.
  function hungerRecoveryForItem(item) {
    if (!item || !item.note) return 0;
    const cal  = parseFloat((item.note.match(/<calories:\s*(-?\d+(?:\.\d+)?)>/i)  || [0, 0])[1]) || 0;
    const prot = parseFloat((item.note.match(/<protein:\s*(-?\d+(?:\.\d+)?)>/i)   || [0, 0])[1]) || 0;
    const fat  = parseFloat((item.note.match(/<fat:\s*(-?\d+(?:\.\d+)?)>/i)       || [0, 0])[1]) || 0;
    return (cal * 0.10) + (prot * 2.00) + (fat * 1.50);
  }

  // Deterministic per-tile RNG (same tile always resolves the same way), mixed
  // with the world seed like every other proc-map-coordinate seed in the project.
  function seededRngForTile(x, y, salt) {
    const U = window.ProcGenUtils;
    if (!U || typeof U.getWorldSeed !== "function" || typeof U.hashCoords !== "function" ||
        typeof U.createSeededRandom !== "function") {
      return Math.random;
    }
    const seed = (U.hashCoords(U.getWorldSeed(), x, y) ^ (salt || 0)) >>> 0;
    return U.createSeededRandom(seed);
  }

  // Per-tile container id for Sack/Crate loot (independent of any real event).
  function proceduralContainerId(featureName, x, y) {
    return `proc:${featureName}:${currentMapKey()}:${x},${y}`;
  }

  // Stocked once and once only: ContainerManager keeps the ledger, so a crate
  // the player has emptied is not refilled with the same seeded loot on the
  // next Open.
  function generateSeededLoot(containerId, cat1, cat2, cat3, maxItems, seedRng) {
    const CM = window.ContainerManager;
    if (!CM) return;
    const origRandom = Math.random;
    Math.random = seedRng;
    try { CM.generateContainerItems(containerId, cat1, cat2, cat3, maxItems); }
    finally { Math.random = origRandom; }
  }

  function openLootContainer(containerId) {
    if (!window.Scene_Container) return;
    SceneManager.push(window.Scene_Container);
    SceneManager.prepareNextScene(containerId, false);
  }

  // ==========================================================================
  // Lit torches/candles: world-folder persistence (mirrors "dismantled" above)
  // ==========================================================================
  function litStore() {
    const store = terrainStore();
    if (!store) return null;
    if (!store.litFeatures) store.litFeatures = {};
    return store;
  }

  function isLit(x, y) {
    const store = litStore();
    if (!store) return false;
    const tiles = store.litFeatures[currentMapKey()];
    return !!(tiles && tiles[`${x},${y}`]);
  }

  function setLit(x, y, on) {
    const store = litStore();
    if (!store) return;
    const key = currentMapKey();
    if (!store.litFeatures[key]) store.litFeatures[key] = {};
    if (on) store.litFeatures[key][`${x},${y}`] = true;
    else delete store.litFeatures[key][`${x},${y}`];
    if (typeof window.WorldManager.flush === "function") {
      try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
    }
  }

  // Every currently-lit tile on the CURRENT proc-map coordinate, for
  // DynamicLightingSystem to re-create ad hoc lights when the map (re)loads.
  function getLitTiles() {
    const store = litStore();
    if (!store) return [];
    const tiles = store.litFeatures[currentMapKey()];
    if (!tiles) return [];
    return Object.keys(tiles).map((k) => {
      const [xs, ys] = k.split(",");
      return { x: parseInt(xs, 10), y: parseInt(ys, 10) };
    });
  }

  // Every tile carrying feature `name` on the current map, collapsed to its
  // grid origin so a wall-mounted multi-tile Torch (upper half + lower half,
  // see WALL_MOUNTED below) is counted once, at the same coordinate
  // computeFootprint() hands CUSTOM_HANDLERS as `tiles[0]`.
  function collectFeatureOrigins(name) {
    const U = window.ProcGenUtils;
    const tilesetId = currentTilesetId();
    if (!U || !tilesetId || !$dataMap || !$dataMap.data) return [];
    const { tileToFeature, tileToGrid } = getLookup(tilesetId);
    const w = $dataMap.width;
    const h = $dataMap.height;
    const seen = new Set();
    const origins = [];
    for (const z of [3, 2]) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tileId = $dataMap.data[z * w * h + y * w + x];
          if (!tileId) continue;
          if (U.getFeatureNameFromTileId(tileId, tileToFeature) !== name) continue;
          const grid = tileToGrid[tileId];
          const ox = grid ? x - grid.gc : x;
          const oy = grid ? y - grid.gr : y;
          const key = `${ox},${oy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          origins.push({ x: ox, y: oy });
        }
      }
    }
    return origins;
  }

  // A dungeon isn't dug cold: some of its torches and candles are rolled
  // already burning, once per proc-map coordinate (seeded per tile, so the
  // Preexistent lights and lamps (Torch, Candle, Lamp, Lantern, Streetlight, Brazier)
  // are rolled 80% enabled by default on first entry.
  // In an empty world or dead world (WorldManager), all lights start OFF (0%).
  const LIGHT_FEATURE_NAMES = ["Torch", "Candle", "Lamp", "Lantern", "Streetlight", "Brazier"];
  const LIGHT_INITIAL_LIT_CHANCE = 0.80;

  function rollInitialLitFeatures() {
    const store = litStore();
    if (!store) return;
    if (!store.litRolled) store.litRolled = {};
    const key = currentMapKey();
    if (store.litRolled[key]) return;
    store.litRolled[key] = true;
    if (!store.litFeatures[key]) store.litFeatures[key] = {};

    const isDeadWorld = !!(window.WorldManager && (window.WorldManager.isEmptyWorld?.() || window.WorldManager.isDeathWorld?.()));
    if (isDeadWorld) {
      if (window.WorldManager && typeof window.WorldManager.flush === "function") {
        try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
      }
      return;
    }

    for (const name of LIGHT_FEATURE_NAMES) {
      for (const t of collectFeatureOrigins(name)) {
        const rng = seededRngForTile(t.x, t.y, 0x707C4);
        if (rng() < LIGHT_INITIAL_LIT_CHANCE) {
          store.litFeatures[key][`${t.x},${t.y}`] = true;
        }
      }
    }
    if (window.WorldManager && typeof window.WorldManager.flush === "function") {
      try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
    }
  }

  // ==========================================================================
  // CUSTOM_HANDLERS: one bespoke interaction per feature name. Each handler
  // receives (name, tiles, info, character); `tiles[0]` is the faced tile.
  // ==========================================================================
  const CUSTOM_HANDLERS = {};

  // --- Gold: a hoard whose contents vary. Rolled from the tile seed, so the
  // same lump always holds the same find no matter how often the map is
  // regenerated: mostly coins, sometimes ore, gems or a buried trinket, once
  // in a while a real treasure - and rarely nothing but pyrite. ---
  function rollGoldHoard(t) {
    const rng = seededRngForTile(t.x, t.y, 0x601D);
    const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    if (inPatronVault()) {
      // A patron's vault is not a hoard somebody forgot in a cellar: every pile
      // is real coin, most of them are stacked on bullion, and the gems and
      // trinkets are lying about on top rather than buried in it.
      const objs = [];
      if (rng() < 0.75) {
        const ingot = $dataItems[INGOTS[Math.floor(rng() * INGOTS.length)]];
        if (ingot) objs.push({ obj: ingot, qty: between(4, 10) });
      }
      if (rng() < 0.6) {
        const crystal = $dataItems[MAT.CRYSTAL];
        if (crystal) objs.push({ obj: crystal, qty: between(2, 6) });
      }
      if (rng() < 0.45) {
        const trinket = randomTrinket(TRINKET_MAX_PRICE, rng);
        if (trinket) objs.push({ obj: trinket, qty: 1 });
      }
      return { gold: between(4000, 15000), objs };
    }
    const roll = rng();
    if (roll < 0.32) return { gold: between(120, 400), objs: [] };   // loose change
    if (roll < 0.62) return { gold: between(600, 1200), objs: [] };  // a full purse
    if (roll < 0.76) {                                               // coins over raw ore
      const ingot = $dataItems[INGOTS[Math.floor(rng() * INGOTS.length)]];
      return { gold: between(200, 600), objs: ingot ? [{ obj: ingot, qty: between(1, 3) }] : [] };
    }
    if (roll < 0.86) {                                               // coins mixed with gemstones
      const crystal = $dataItems[MAT.CRYSTAL];
      return { gold: between(300, 800), objs: crystal ? [{ obj: crystal, qty: between(1, 2) }] : [] };
    }
    if (roll < 0.94) {                                               // a trinket lost in the pile
      const trinket = randomTrinket(TRINKET_MAX_PRICE, rng);
      return { gold: between(150, 500), objs: trinket ? [{ obj: trinket, qty: 1 }] : [] };
    }
    if (roll < 0.99) return { gold: between(2200, 4000), objs: [] }; // a genuine treasure
    return { gold: between(5, 40), objs: [], fools: true };          // fool's gold
  }

  CUSTOM_HANDLERS.Gold = (name, tiles) => {
    showChoiceMenu([T('Terrain.collect')], () => {
      const hoard = rollGoldHoard(tiles[0]);
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      $gameParty.gainGold(hoard.gold);
      grantObjects(hoard.objs);
      if (typeof AudioManager !== "undefined") AudioManager.playSe({ name: "Coin", volume: 90, pitch: 100, pan: 0 });
      showGoldPopup(hoard.gold);
      if (hoard.objs.length) showRewardPopupObjects(hoard.objs);
      if (hoard.fools) {
        showLoreMessage(T('Terrain.foolsGold'));
      }
    });
  };

  // --- Beer: Drink (hunger, and the whole party gets Drunk) or Pick up (498) ---
  CUSTOM_HANDLERS.Beer = (name, tiles) => {
    showChoiceMenu([T('Terrain.drink'), T('Terrain.pickUp')], (index) => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const beer = $dataItems[BEER_ITEM_ID];
      if (index === 0) {
        const leader = $gameParty.leader();
        if (leader && beer) leader.addHunger(hungerRecoveryForItem(beer));
        // Shared round: everyone drinks, everyone ends up drunk.
        for (const a of $gameParty.members()) a.addState(DRUNK_STATE_ID);
        playActionSe(VERB.PICK);
      } else {
        if (beer) grantObjects([{ obj: beer, qty: 1 }]);
        playActionSe(VERB.PICK);
        showRewardPopupObjects([{ obj: beer, qty: 1 }]);
      }
    });
  };

  // --- Library: generated book title/author/description, never removed ---
  CUSTOM_HANDLERS.Library = (name, tiles) => {
    const t = tiles[0];
    const RBG = window.RandomBookGenerator;
    if (!RBG) return;
    const rng = seededRngForTile(t.x, t.y, 0x1157A2);
    if (typeof RBG.generateTitle !== "function") return;
    offerFeatureScan(t, "library", T('Terrain.feature.library'), () => {  // i18n-ignore  scanner object type
      const title = RBG.generateTitle(rng);
      const author = typeof RBG.generateAuthor === "function" ? RBG.generateAuthor(rng) : "";
      const description = typeof RBG.generateDescription === "function" ? RBG.generateDescription(rng) : "";
      const heading = author ? `"${title}" - ${author}` : `"${title}"`;
      showLoreMessage(description ? [heading, description] : [heading]);
      // Reading it is worth the same one-off Fun as a book read off an event.
      if (typeof RBG.payReadingFun === "function") RBG.payReadingFun("book", `${t.x},${t.y}`);  // i18n-ignore  reading-log id
    });
  };

  // --- Chair / Throne / Stool: sit, exactly like a region-102 seat tile ---
  const SIT_FEATURES = ["Chair", "Throne", "Stool"];  // i18n-ignore  feature ids
  for (const n of SIT_FEATURES) {
    CUSTOM_HANDLERS[n] = (name, tiles, info, character) => {
      const scene = SceneManager._scene;
      if (scene && typeof scene.showSitOptions === "function") scene.showSitOptions(character);
    };
  }

  // --- Statue: a generated inscription, never removed ---
  CUSTOM_HANDLERS.Statue = (name, tiles) => {
    const t = tiles[0];
    const RBG = window.RandomBookGenerator;
    if (!RBG) return;
    const rng = seededRngForTile(t.x, t.y, 0x57A700E);
    offerFeatureScan(t, "statue", T('Terrain.feature.statue'), () => {  // i18n-ignore  scanner object type
      const subject = RBG.randomSubject(rng);
      showLoreMessage(T('Terrain.statue', { subject: subject }));
      if (typeof RBG.payReadingFun === "function") RBG.payReadingFun("statue", `${t.x},${t.y}`);  // i18n-ignore  reading-log id
    });
  };

  // --- Vase (+ ice/plant variants): Break -> random food item ---
  for (const n of ["Vase", "VaseIce", "VasePlant"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = (name, tiles) => {
      showChoiceMenu([T('Terrain.breakIt')], () => {
        for (const t of tiles) clearFeatureTileData(t.x, t.y);
        if ($gameMap) $gameMap.requestRefresh();
        recordDismantled(tiles, name);
        const food = randomFrom(itemsWithCategory("Food"));  // i18n-ignore  item category
        if (food) {
          grantObjects([{ obj: food, qty: 1 }]);
          showRewardPopupObjects([{ obj: food, qty: 1 }]);
        }
        AudioManager.playSe({ name: "Crash", volume: 90, pitch: 100, pan: 0 });
      });
    };
  }

  // --- Map: opens the fullscreen world map, never removed ---
  CUSTOM_HANDLERS.Map = () => {
    PluginManager.callCommand($gameMap._interpreter || {}, "WorldMap", "openWorldMap", {});
  };

  // --- Pentagram: refill the whole party's MP, never removed ---
  CUSTOM_HANDLERS.Pentagram = () => {
    for (const a of $gameParty.members()) a.setMp(a.mmp);
    if (typeof AudioManager !== "undefined") AudioManager.playSe({ name: "Decision1", volume: 90, pitch: 100, pan: 0 });
    showLoreMessage(T('Terrain.mpRefilled'));
  };

  // --- Bed / Campfire / Tent / Bedroll: open the sleep menu, never removed ---
  for (const n of ["Bed", "Campfire", "Tent", "Bedroll"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = () => {
      const scene = SceneManager._scene;
      if (scene && typeof scene.openSleepMenu === "function") scene.openSleepMenu("main");
    };
  }

  // --- Shovel: Pick Up -> item 138 ---
  CUSTOM_HANDLERS.Shovel = (name, tiles) => {
    showChoiceMenu([verbLabel(VERB.PICK)], () => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const shovel = $dataItems[SHOVEL_ITEM_ID];
      if (shovel) {
        grantObjects([{ obj: shovel, qty: 1 }]);
        showRewardPopupObjects([{ obj: shovel, qty: 1 }]);
      }
      playActionSe(VERB.PICK);
    });
  };

  // --- Sack: Open -> a random set of food items (ContainerSystemUI) ---
  CUSTOM_HANDLERS.Sack = (name, tiles) => {
    const t = tiles[0];
    showChoiceMenu([T('Terrain.open')], () => {
      const containerId = proceduralContainerId(name, t.x, t.y);
      generateSeededLoot(containerId, "Food", null, null, 5, seededRngForTile(t.x, t.y, 0x5ACC));  // i18n-ignore  item category
      AudioManager.playSe({ name: "Open1", volume: 90, pitch: 100, pan: 0 });
      openLootContainer(containerId);
    });
  };

  // --- Backpack: Open -> whatever whoever dropped it was carrying ---
  CUSTOM_HANDLERS.Backpack = (name, tiles) => {
    const t = tiles[0];
    showChoiceMenu([T('Terrain.open')], () => {
      const containerId = proceduralContainerId(name, t.x, t.y);
      generateSeededLoot(containerId, "Tools", "Food", null, 5, seededRngForTile(t.x, t.y, 0xBAC4));  // i18n-ignore  item categories
      AudioManager.playSe({ name: "Open1", volume: 90, pitch: 100, pan: 0 });
      openLootContainer(containerId);
    });
  };

  // --- Globe: a globe is a map on a stand, and opens the same one ---
  CUSTOM_HANDLERS.Globe = () => {
    PluginManager.callCommand($gameMap._interpreter || {}, "WorldMap", "openWorldMap", {});
  };

  // --- Crate (+ ice variant): Open -> random cheap goods (ContainerSystemUI) ---
  for (const n of ["Crate", "CrateIce"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = (name, tiles) => {
      const t = tiles[0];
      showChoiceMenu([T('Terrain.open')], () => {
        const containerId = proceduralContainerId(name, t.x, t.y);
        generateSeededLoot(containerId, "Trash", "Tools", null, 4, seededRngForTile(t.x, t.y, 0xC4A7E));  // i18n-ignore  item categories
        AudioManager.playSe({ name: "Open1", volume: 90, pitch: 100, pan: 0 });
        openLootContainer(containerId);
      });
    };
  }

  // --- Torch / Candle / Lamp / Lantern / Streetlight / Brazier: toggle light on/off OR dismantle ---
  for (const n of LIGHT_FEATURE_NAMES) {
    CUSTOM_HANDLERS[n] = (name, tiles) => {
      const t = tiles[0];
      const lit = isLit(t.x, t.y);
      const toggleLabel = lit ? (T('Terrain.turnOff') || T('Terrain.blowOut') || "Turn Off") : (T('Terrain.turnOn') || T('Terrain.lightUp') || "Turn On");
      const dismantleLabel = verbLabel(VERB.DISMANTLE);
      const cfg = classify(name) || { verb: VERB.DISMANTLE, spec: "Metalworking", rewards: [[MAT.STEEL, 1, 2]] };  // i18n-ignore  spec id

      showChoiceMenu([toggleLabel, dismantleLabel], (index) => {
        if (index === 0) {
          const nextState = !lit;
          setLit(t.x, t.y, nextState);
          if (window.$gameLighting && typeof window.$gameLighting.setAdHocLight === "function") {
            window.$gameLighting.setAdHocLight(`${t.x},${t.y}`, t.x, t.y, nextState);
          }
          AudioManager.playSe({ name: "Switch2", volume: 90, pitch: 100, pan: 0 });
        } else if (index === 1) {
          setLit(t.x, t.y, false);
          if (window.$gameLighting && typeof window.$gameLighting.setAdHocLight === "function") {
            window.$gameLighting.setAdHocLight(`${t.x},${t.y}`, t.x, t.y, false);
          }
          performDismantle(name, cfg, tiles);
        }
      });
    };
  }

  // --- Weapon: a random unexpensive weapon (a rare one in a patron's vault),
  // then disappears ---
  CUSTOM_HANDLERS.Weapon = (name, tiles) => {
    showChoiceMenu([verbLabel(VERB.PICK)], () => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const weapon = inPatronVault()
        ? (randomRareWeapon(VAULT_WEAPON_MIN_PRICE) || randomCheapWeapon(CHEAP_WEAPON_MAX_PRICE))
        : randomCheapWeapon(CHEAP_WEAPON_MAX_PRICE);
      if (weapon) {
        grantObjects([{ obj: weapon, qty: 1 }]);
        showRewardPopupObjects([{ obj: weapon, qty: 1 }]);
      }
      AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
    });
  };

  // --- Clock: the procedural clock overlay, never removed ---
  CUSTOM_HANDLERS.Clock = (name, tiles) => {
    const t = tiles[0];
    if (window.ProceduralAnalogClock && typeof window.ProceduralAnalogClock.showAt === "function") {
      window.ProceduralAnalogClock.showAt($gameMap.mapId(), t.x, t.y);
    }
  };

  // --- Mirror: calls Common Event 169, never removed ---
  CUSTOM_HANDLERS.Mirror = () => {
    $gameTemp.reserveCommonEvent(169);
  };

  // --- Fountain: Drink (hunger) or Bathe (100% hygiene), never removed ---
  CUSTOM_HANDLERS.Fountain = () => {
    showChoiceMenu([T('Terrain.drink'), T('Terrain.bathe')], (index) => {
      AudioManager.playSe({ name: "Water2", volume: 90, pitch: 100, pan: 0 });
      if (index === 0) {
        const leader = $gameParty.leader();
        if (leader) leader.addHunger(15);
      } else {
        for (const a of $gameParty.members()) a.addHygiene(1000);
      }
    });
  };

  // --- Book: a random category:Books item, then disappears ---
  CUSTOM_HANDLERS.Book = (name, tiles) => {
    const t = tiles[0];
    const scanner = window.RamanScanner;
    const canScan = !!(scanner && typeof scanner.available === "function" && scanner.available());
    // Taking it is still the first thing on offer; the probe only adds a
    // second verb next to it.
    const choices = [verbLabel(VERB.PICK)];
    if (canScan) choices.push(scanner.analyzeLabel());
    showChoiceMenu(choices, (index) => {
      if (index === 1) {
        scanner.scanTile(t.x, t.y, "library", T('Terrain.feature.book'));  // i18n-ignore  scanner object type
        return;
      }
      for (const t2 of tiles) clearFeatureTileData(t2.x, t2.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const book = randomFrom(itemsWithCategory("Books"));  // i18n-ignore  item category
      if (book) {
        grantObjects([{ obj: book, qty: 1 }]);
        showRewardPopupObjects([{ obj: book, qty: 1 }]);
      }
      playActionSe(VERB.PICK);
    });
  };

  // --- Structure entrances: descend/climb into a coordinate-seeded generated
  // structure biome (Sewer, LootCellar, Dungeon, Crypt, TempleInside,
  // CaveDen). The seed is
  // perturbed per entrance tile so two entrances on the same map open onto
  // different, but deterministic, structures. The border of the generated map
  // returns the player here (WorldMapReturn's _dungeonSession).
  //
  // Entering is a MOVEMENT, not an action-button interaction: every entrance
  // below is registered in WALK_ENTRANCES and fired by the Game_Player
  // moveStraight hook at the bottom of this file. Each entry returns true only
  // when the party actually went in, so a refused entrance does not lock out
  // the next step.
  function enterStructureBiome(t, biomeName, seSound, saltOverride) {
    const pg = $gameSystem._procGenData;
    if (!pg) return false;
    // The entrance tile is passed as the seed salt. It used to be poked into
    // pg.seed instead, which did nothing at all: procMapSeed builds the seed from
    // the WORLD seed and coordinates and never reads pg.seed, so every grate on a
    // square opened onto one and the same sewer.
    //
    // saltOverride lets a caller pin the salt instead (the Bunker hatch does,
    // see WALK_ENTRANCES.StairsDown): that hatch is the one entrance that must
    // always reopen onto a cellar generated earlier with a KNOWN salt, rather
    // than a fresh one keyed to the hatch's own tile position.
    const salt = (saltOverride != null) ? (saltOverride | 0) : (((t.x * 131) + (t.y * 977)) | 0);
    PluginManager.callCommand($gameMap._interpreter || {}, "WorldMapReturn", "startForcedBiome",
      { Biome: biomeName, Salt: salt });
    AudioManager.playSe({ name: seSound || "Door1", volume: 90, pitch: 100, pan: 0 });
    return true;
  }

  // Feature name -> "the party walked into this, take them in". Populated by the
  // entrance handlers below and read by tryWalkEntrance / tryInteract.
  const WALK_ENTRANCES = {};

  // --- Grate: descends into a fresh Sewer biome, seeded from the grate tile ---
  WALK_ENTRANCES.Grate = (tiles) => enterStructureBiome(tiles[0], "Sewer");  // i18n-ignore  biome id

  // --- Where an entrance leads ---
  //
  // An entrance is not a door onto one fixed place. Every structure in the
  // catalogue (ProceduralMapStructureGenerator) declares which terrain
  // features may open onto it, and the roll picks from those: a flight of
  // stairs can reach a cellar, a dungeon, a crypt, catacombs, a mine, a
  // flooded cistern, a buried library, a bunker, a barrow, an underground
  // station... A cave mouth only ever reaches the cave-family structures and
  // a flight of steps upward only the things built above ground and buried
  // since. The Sewer and a patron's Vault declare no entrance at all: they
  // belong to the Grate and the Hatch, which name them outright.
  //
  // The destination is rolled once per entrance tile (world seed, world
  // square, tile), so a given stairway always leads to the same place, and two
  // stairways on one square rarely to the same kind of place.
  //
  // The roll is TILTED BY THE COUNTRY the entrance is cut into: ice fields
  // keep frozen caves under them, a graveyard catacombs, a city its bunkers
  // and its dead metro. `affinity` on a catalogue entry names the surface
  // families that favour it; the tilt is a weight and never a rule, so every
  // structure stays reachable anywhere. Alien surfaces belong to no family
  // and simply take the base weights.
  const SURFACE_FAMILIES = [
    // Matched against the surface biome's own name first, then against the
    // `lowerLayer` it declares, which is what a square already says is
    // underneath it.
    { key: "ice", test: /^(ice|snow|permafrost|tundra|glacier|taiga|caveice|mountainice|forestice|villageice|cityice|burgice)/i },
    { key: "volcanic", test: /^(volcano|hell|ember|lava)/i },
    { key: "desert", test: /^(desert|saltflats|badlands|canyon|steppe|savannah|mountaindesert|citydesert|villagedesert|burgdesert)/i },
    { key: "wet", test: /^(swamp|mangrove|lake|river|riverbank|beach|ocean|docks|seabed|caveflooded|floodedcave|bridge|villageriver|villagesea)/i },
    { key: "wood", test: /^(forest|jungle|bamboo|spiritwoods|mushroom|fairy)/i },
    { key: "dead", test: /^(graveyard|ruins|abandoned|villa|temple|church|crypt|castle|eldritchtomb)/i },
    { key: "urban", test: /^(city|burg|metro|highway|office|factory|laboratory|spacecenter|omegatower|houses|docks|landfill|park|train|arena|prison)/i },
    { key: "rural", test: /^(farm|fields|meadows|village|highlands|park|orchard)/i },
    // No volcano here: it has its own family, and letting it be mountain as
    // well handed the generic mountain structures a bonus on the one country
    // whose whole point is the forge and the lava tube.
    { key: "mountain", test: /^(mountain|highlands|mines|underdark|crystals|cave|lair)/i },
    { key: "weird", test: /^(eldritch|limbo|dreamscape|abstract|digital|heaven|space|spiritwoods)/i },
  ];
  const AFFINITY_BONUS = 30;

  // The country is read from the surface biome's own name and from NOTHING
  // else. Folding in the `lowerLayer` it declares looked like more signal and
  // was the opposite: 69 of the 111 biomes declare "Cave" down there, so
  // almost every square in the world came out favouring the cave-family
  // structures, and a taiga ended up preferring an ordinary den to the frozen
  // cave that is the whole point of standing in a taiga.
  function surfaceFamilies() {
    const pg = $gameSystem._procGenData;
    const out = new Set();
    if (!pg || !pg.currentBiome) return out;
    const name = String(pg.currentBiome);
    // A landing on another world is nobody's country: the alien biomes are
    // out of scope here and leave every structure on its base weight.
    if (/^alien/i.test(name)) return out;
    for (const fam of SURFACE_FAMILIES) if (fam.test.test(name)) out.add(fam.key);
    return out;
  }

  // `entrance` is the catalogue's name for the feature: stairsDown, cave,
  // stairsUp. Returns a biome name, or null when the catalogue is not loaded,
  // in which case the caller falls back to what it always used to open.
  function pickStructure(entrance, t) {
    const D = window.ProcGenDungeon;
    if (!D || typeof D.structures !== "function") return null;
    const pool = D.structures().filter((s) =>
      s.entrances && s.entrances.indexOf(entrance) >= 0 && (s.weight || 0) > 0);
    if (!pool.length) return null;

    const families = surfaceFamilies();
    const weights = pool.map((s) => {
      const favoured = (s.affinity || []).some((a) => families.has(a));
      return (s.weight || 1) + (favoured ? AFFINITY_BONUS : 0);
    });
    const total = weights.reduce((a, b) => a + b, 0);

    // The world square is mixed into the salt: seededRngForTile hashes the tile
    // against the world seed alone, so without it the same tile of two
    // different squares would open onto the same kind of structure. The
    // entrance kind is in there too, so a stairway and a cave mouth on the
    // same tile could never resolve alike.
    const pg = $gameSystem._procGenData;
    let salt = 0x57A125;
    for (let i = 0; i < entrance.length; i++) salt = (Math.imul(salt, 31) + entrance.charCodeAt(i)) | 0;
    if (pg) salt = (salt ^ Math.imul(pg.originX | 0, 73856093) ^ Math.imul(pg.originY | 0, 19349663)) | 0;
    const rng = seededRngForTile(t.x, t.y, salt);
    let roll = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i].key;
    }
    return pool[0].key;
  }

  // The hatch of a Bunker-origin start is one of these stairways, and it is
  // always the cellar the party woke up in: its layout is fixed by (world
  // seed, world coords), so descending rebuilds that very cellar. It gets the
  // 'bunker' session instead of the plain 'sandbox' one, so climbing back out
  // rebuilds the bunker's own surface square (see
  // WorldMapReturn.exitDungeonSession) rather than leaving the surface to be
  // re-resolved off the cellar's map.
  function isBunkerHatch(t) {
    const rec = $gameSystem._bunkerOrigin;
    const pg = $gameSystem._procGenData;
    if (!rec || !pg) return false;
    return pg.originX === rec.worldX && pg.originY === rec.worldY &&
      t.x === rec.entranceX && t.y === rec.entranceY;
  }

  WALK_ENTRANCES.StairsDown = (tiles) => {
    const bunker = isBunkerHatch(tiles[0]);
    const target = bunker ? "LootCellar"                                   // i18n-ignore  biome id
      : (pickStructure("stairsDown", tiles[0]) || "LootCellar");           // i18n-ignore  biome id
    // The Bunker hatch is pinned to salt 0, the same salt CharacterCreation
    // used the one time it built this cellar from scratch (see
    // CharacterCreation.startBunkerOrigin). Letting it fall through to the
    // tile-based salt every other entrance gets would key this descent to the
    // hatch's own tile position instead, generating a SECOND, different
    // cellar every time the party climbed back down.
    if (!enterStructureBiome(tiles[0], target, null, bunker ? 0 : null)) return false;
    if (bunker && $gameSystem._procGenData) {
      const pg = $gameSystem._procGenData;
      pg._dungeonSession = { type: "bunker" };
    }
    return true;
  };

  // --- Hatch: a patron's private way down into their own villa (one of the
  // "villas" interiors, opened by PatreonRewards.openHatch). Only ever
  // stamped on that patron's own world square, and never dismantled: it is not
  // in the dismantle table and this handler removes nothing, so the hatch is
  // still there on every later visit. Faced anywhere else it does nothing. ---
  WALK_ENTRANCES.Hatch = (tiles) => {
    const PR = window.PatreonRewards;
    if (!PR || typeof PR.openHatch !== "function") return false;
    if (typeof PR.isPatronHatch === "function" && !PR.isPatronHatch(tiles[0])) return false;
    PR.openHatch(tiles[0]);
    return true;
  };

  // --- StairsUp: climbs into something that was built above ground and has
  // been buried since - a temple of long halls guarded by enemies far above
  // the party's level, a shrine, a reading room, the chambers of a barrow ---
  WALK_ENTRANCES.StairsUp = (tiles) =>
    enterStructureBiome(tiles[0], pickStructure("stairsUp", tiles[0]) || "TempleInside");  // i18n-ignore  biome id

  // --- Cave: enters the cave family - a den packed with one species, a
  // frozen hollow, a crystal cavern, a fungal warren, a lava tube, a sea
  // grotto - whichever the country above it keeps ---
  WALK_ENTRANCES.Cave = (tiles) =>
    enterStructureBiome(tiles[0], pickStructure("cave", tiles[0]) || "CaveDen");  // i18n-ignore  biome id
  // The AlienBase tileset (305), and so every alien-biome tileset that shares
  // its note, spells the same cave mouth "CaveEntrance". Same hole in the ground.
  WALK_ENTRANCES.CaveEntrance = WALK_ENTRANCES.Cave;  // i18n-ignore  feature id

  // --- Building and dungeon doors: walked into like every other entrance, and
  // handed to ProceduralHouseSystem, which owns the interiors (the seeded house
  // / inn / shop / tower-block pools, the trade doors' own premises, the lock
  // and lockpick rules, the door swing, and the return point). The tile is
  // passed explicitly: the party is stopped in front of an impassable door but
  // stands ON a passable doorway, so only the entrance tile itself identifies
  // which building this is. ---
  function enterBuildingDoor(name, x, y) {
    const PHS = window.ProceduralHouseSystem;
    if (!PHS || typeof PHS.enterDoorFeatureAt !== "function") return false;
    return PHS.enterDoorFeatureAt(name, x, y) === true;
  }
  // The generic doors, plus every door on the city tileset that names its own
  // trade (DoorClinic, DoorPoliceStation, DoorWeaponStore, ...). The trade list
  // is read from the house system rather than repeated here, so adding a trade
  // there is enough to make its door walkable.
  const BUILDING_DOOR_NAMES = ["DoorHouse", "DoorInn", "DoorShop", "DoorSkyscraper", "DoorDungeon"];  // i18n-ignore  Features.json ids
  const TRADE_DOOR_NAMES = [
    "DoorClinic", "DoorPoliceStation", "DoorWeaponStore", "DoorGym",
    "DoorHardwareStore", "DoorIceCream", "DoorMusicStore", "GarageDoor",
  ];  // i18n-ignore  Features.json ids
  for (const doorName of BUILDING_DOOR_NAMES.concat(TRADE_DOOR_NAMES)) {
    WALK_ENTRANCES[doorName] = (tiles, x, y) => enterBuildingDoor(doorName, x, y);
  }

  // --- DoorSewers / Manhole: the way down into the sewer, which is what a
  // Grate already is. A city keeps its own lower layer (Biomes.json declares
  // Sewer under City and Burg) and these are its other three doors onto it. ---
  WALK_ENTRANCES.DoorSewers = (tiles) => enterStructureBiome(tiles[0], "Sewer");  // i18n-ignore  biome id
  WALK_ENTRANCES.Manhole = WALK_ENTRANCES.DoorSewers;  // i18n-ignore  feature id

  // The map keeps taking input while the transfer fades, and an impassable
  // entrance is bumped into on every frame the direction is held, so an opened
  // entrance is held shut for a moment. The window is short enough to heal
  // itself if an entry ever fails silently.
  let _walkEntranceLockUntil = 0;

  // The party has stepped onto (or been stopped by) the tile at x,y: if it holds
  // a structure entrance, go in. Returns true when an entrance took over.
  function tryWalkEntrance(x, y) {
    // Cheapest rejections first: this runs on every step, and on every frame a
    // direction is held against an impassable tile.
    if (Graphics.frameCount < _walkEntranceLockUntil) return false;
    if ($gamePlayer.isInVehicle()) return false;
    // Surface only. Entrances are placed on surface biomes, but the same names
    // are also used as decor inside generated structures (a grate mounted on a
    // dungeon wall), and brushing past one of those must not open a second
    // structure from inside the first.
    const pg = $gameSystem._procGenData;
    if (!pg || pg._dungeonSession) return false;
    if (pg.biomeLayerStack && pg.biomeLayerStack.length > 0) return false;

    const info = featureAt(x, y);
    if (!info || !info.name) return false;
    const enter = WALK_ENTRANCES[info.name];
    if (!enter) return false;

    if ($gameMap.isEventRunning()) return false;
    if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) return false;
    // Never override a real event standing on the tile (an entrance event of
    // its own, a chest, an NPC): the same rule the action button follows.
    if ($gameMap.events().some(e => e && e.x === x && e.y === y)) return false;

    const tiles = computeFootprint(x, y, info.layer, info.tileId);
    // x,y is the tile actually walked into/onto; tiles is its whole footprint.
    if (!enter(tiles, x, y)) return false;
    _walkEntranceLockUntil = Graphics.frameCount + 60;
    return true;
  }

  // --- Stove: opens the cooking menu, never removed ---
  CUSTOM_HANDLERS.Stove = () => {
    PluginManager.callCommand($gameMap._interpreter || {}, "CookingSystem", "openCookingMenu", {});
  };

  // --- Piano: opens the playable visual keyboard, never removed ---
  CUSTOM_HANDLERS.Piano = () => {
    PluginManager.callCommand($gameMap._interpreter || {}, "VisualPiano", "openPiano", {});
  };

  // --- GasPump / RefuelStation: opens the vehicle refuel station, never
  // removed. Both names are tagged on the Road tileset (the pumps come from
  // two different source sheets), so both must reach the station, otherwise
  // one of them falls through to the generic dismantle table. ---
  CUSTOM_HANDLERS.GasPump = () => {
    const scene = SceneManager._scene;
    if (scene && typeof scene.showRefuelWindow === "function") scene.showRefuelWindow();
  };
  CUSTOM_HANDLERS.RefuelStation = CUSTOM_HANDLERS.GasPump;

  // --- Skull: a random item whose name contains "Skull", then disappears ---
  CUSTOM_HANDLERS.Skull = (name, tiles) => {
    showChoiceMenu([verbLabel(VERB.PICK)], () => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const skullItem = randomFrom(itemsWithNameContaining("skull"));
      if (skullItem) {
        grantObjects([{ obj: skullItem, qty: 1 }]);
        showRewardPopupObjects([{ obj: skullItem, qty: 1 }]);
      }
      playActionSe(VERB.PICK);
    });
  };

  // --- Spike: a random BodyPart item + 1 wood, then dismantled ---
  CUSTOM_HANDLERS.Spike = (name, tiles) => {
    showChoiceMenu([verbLabel(VERB.DISMANTLE)], () => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const bodyPart = randomFrom(itemsWithCategory("BodyPart"));
      const wood = $dataItems[MAT.WOOD];
      const entries = [];
      if (bodyPart) entries.push({ obj: bodyPart, qty: 1 });
      if (wood) entries.push({ obj: wood, qty: 1 });
      grantObjects(entries);
      playActionSe(VERB.DISMANTLE);
      showRewardPopupObjects(entries);
    });
  };

  // --- TilledSoil: a farm plot, never harvested for loose plant matter. Empty
  // soil opens the plant growth menu for this exact tile (PlantGrowthSystem
  // keeps procedural plots in the world folder, so a field sown here is the
  // same field in every savegame of the world). Soil that already carries a
  // crop has a plant event standing on it, which handles its own menu. ---
  CUSTOM_HANDLERS.TilledSoil = (name, tiles) => {
    const t = tiles[0];
    if (window.PlantGrowthSystem && typeof window.PlantGrowthSystem.openProceduralPlot === "function") {
      window.PlantGrowthSystem.openProceduralPlot(t.x, t.y);
    }
  };

  // --- SignItems / SignInn: a one-line dialogue, never removed ---
  CUSTOM_HANDLERS.SignItems = () => showLoreMessage(T('Terrain.signShop'));
  CUSTOM_HANDLERS.SignInn   = () => showLoreMessage(T('Terrain.signInn'));

  // ==========================================================================
  // The street (tileset 303)
  // ==========================================================================

  // --- Trashcan: a bin is a container, and what is in a city bin is a bin's
  // worth of rubbish, the odd thing somebody threw out by mistake, and food
  // nobody should eat. Stocked once per bin from its own tile seed, so emptying
  // one does not refill it and the bin two streets away holds something else. ---
  CUSTOM_HANDLERS.Trashcan = (name, tiles) => {
    const t = tiles[0];
    showChoiceMenu([T('Terrain.rummage')], () => {
      const containerId = proceduralContainerId(name, t.x, t.y);
      generateSeededLoot(containerId, "Trash", "Misc", "Food", 4,  // i18n-ignore  item categories
        seededRngForTile(t.x, t.y, 0x7245A5));
      AudioManager.playSe({ name: "Open1", volume: 80, pitch: 85, pan: 0 });
      openLootContainer(containerId);
    });
  };

  // --- Trash: a heap of litter on the pavement. Picking it up hands over a
  // random piece of rubbish; taking it apart pays the usual salvage. The removal
  // is recorded like every other, or walking out of a city and back in would
  // re-deal the same bag on the same tile and make a street corner an endless
  // supply of loot. What the daily re-deal gives instead is NEW litter, on new
  // tiles, every morning (the city generator's own daily stream). ---
  CUSTOM_HANDLERS.Trash = (name, tiles) => {
    showChoiceMenu([T('Terrain.pickUp'), T('Terrain.verb.dismantle')], (index) => {
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      if (index === 0) {
        const junk = randomFrom(itemsWithCategory("Trash"));  // i18n-ignore  item category
        if (junk) {
          grantObjects([{ obj: junk, qty: 1 }]);
          showRewardPopupObjects([{ obj: junk, qty: 1 }]);
        }
        playActionSe(VERB.PICK);
      } else {
        const gained = rollRewards({ rewards: [[MAT.PLASTIC, 1, 2], [MAT.CLOTH, 0, 1]] });
        grantRewards(gained);
        playActionSe(VERB.DISMANTLE);
        showRewardPopup(gained);
        if (window.SpecializationXP) window.SpecializationXP.awardCapped("Carpentry", 1);
      }
    });
  };

  // --- PublicPhone: a working box. The phone system owns the call. ---
  CUSTOM_HANDLERS.PublicPhone = () => {
    PluginManager.callCommand($gameMap._interpreter || {}, "PublicPhoneSystem", "openPublicPhone", {});
  };

  // --- BusStop: a shelter is boarded, exactly like the sign beside it, so the
  // party never has to hunt for the pole when the shelter is what they see. ---
  CUSTOM_HANDLERS.BusStop = () => {
    const scene = SceneManager._scene;
    if (scene && typeof scene.startFastTravel === "function") scene.startFastTravel("bus");
  };

  // --- BasketballPole / BasketBall: a hoop in the park, and a game on it ---
  for (const n of ["BasketballPole", "BasketBall"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = () => {
      PluginManager.callCommand($gameMap._interpreter || {}, "BasketballMinigame", "startBasketballGame", {});
    };
  }

  // --- Benches, picnic tables and folding chairs: sat on, like every other
  // seat in the game. A folding chair belongs to whoever pitched it, so it can
  // also be taken, which is what the second entry is for. ---
  for (const n of ["Bench", "PicnicTable"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = (name, tiles, info, character) => {
      const scene = SceneManager._scene;
      if (scene && typeof scene.showSitOptions === "function") scene.showSitOptions(character);
    };
  }
  CUSTOM_HANDLERS.FoldableChair = (name, tiles, info, character) => {
    showChoiceMenu([T('Terrain.sit'), verbLabel(VERB.PICK)], (index) => {
      if (index === 0) {
        const scene = SceneManager._scene;
        if (scene && typeof scene.showSitOptions === "function") scene.showSitOptions(character);
        return;
      }
      for (const t of tiles) clearFeatureTileData(t.x, t.y);
      if ($gameMap) $gameMap.requestRefresh();
      recordDismantled(tiles, name);
      const gained = rollRewards({ rewards: [[MAT.STEEL, 1, 1], [MAT.CLOTH, 1, 1]] });
      grantRewards(gained);
      playActionSe(VERB.PICK);
      showRewardPopup(gained);
    });
  };

  // --- SleepingBag: somebody's bed, and it works as one ---
  CUSTOM_HANDLERS.SleepingBag = () => {
    const scene = SceneManager._scene;
    if (scene && typeof scene.openSleepMenu === "function") scene.openSleepMenu("main");
  };

  // --- Graffiti / Poster: read what is on the wall. Both are generated rather
  // than written: a wall carries whatever the city is saying this week. ---
  for (const n of ["Graffiti", "Poster"]) {  // i18n-ignore  feature ids
    CUSTOM_HANDLERS[n] = (name, tiles) => {
      const t = tiles[0];
      const rng = seededRngForTile(t.x, t.y, name === "Graffiti" ? 0x64AFF1 : 0x905732);
      let text = "";
      if (typeof window.generateMarkovString === "function") {
        try { text = String(window.generateMarkovString("all") || ""); } catch (e) { text = ""; }
      }
      if (!text) {
        const RBG = window.RandomBookGenerator;
        if (RBG && typeof RBG.generateTitle === "function") text = RBG.generateTitle(rng);
      }
      showLoreMessage(T(name === "Graffiti" ? 'Terrain.graffiti' : 'Terrain.poster', { text: text }));
    };
  }

  // --- The rest of the street signs: read-only, one line apiece ---
  CUSTOM_HANDLERS.SignShop       = () => showLoreMessage(T('Terrain.signShop'));
  CUSTOM_HANDLERS.SignStop       = () => showLoreMessage(T('Terrain.signStop'));
  CUSTOM_HANDLERS.SignDanger     = () => showLoreMessage(T('Terrain.signDanger'));
  CUSTOM_HANDLERS.SignHelicopter = () => showLoreMessage(T('Terrain.signHelipad'));

  // --- Hydrant: opened rather than broken. A hydrant in the street is where a
  // city washes, which is what half of it is used for on a hot day. ---
  CUSTOM_HANDLERS.Hydrant = () => {
    showChoiceMenu([T('Terrain.bathe'), T('Terrain.drink')], (index) => {
      AudioManager.playSe({ name: "Water2", volume: 90, pitch: 100, pan: 0 });
      if (index === 0) {
        for (const a of $gameParty.members()) a.addHygiene(1000);
      } else {
        const leader = $gameParty.leader();
        if (leader) leader.addHunger(10);
      }
    });
  };

  // Attempt a terrain interaction with a single tile. Returns true if a menu
  // was opened (interaction handled).
  function tryInteractAt(character, x, y) {
    // Never override real events sitting on the tile.
    if ($gameMap.events().some(e => e && e.x === x && e.y === y)) return false;

    const info = featureAt(x, y);
    if (!info || !info.name) return false;

    // SignPost / SignPostIce have their own Read / Dismantle / Cancel menu.
    if (info.name === "SignPost" || info.name === "SignPostIce") {
      const tiles = computeFootprint(x, y, info.layer, info.tileId);
      showSignPostMenu(info.name, tiles);
      return true;
    }

    // Structure entrances are walked into, never pressed (see WALK_ENTRANCES and
    // the moveStraight hook below). The action button is still consumed here, so
    // a cave mouth or a hatch can never fall through to the generic dismantle
    // table and be harvested for wood.
    if (WALK_ENTRANCES[info.name]) return true;

    // Bespoke, non-generic interactions (Gold, Beer, Library, sittable
    // furniture, ...). Checked before the generic dismantle table so a name
    // present in both never falls through to the wrong behaviour.
    const customHandler = CUSTOM_HANDLERS[info.name];
    if (customHandler) {
      const tiles = computeFootprint(x, y, info.layer, info.tileId);
      customHandler(info.name, tiles, info, character);
      return true;
    }

    let cfg = classify(info.name);
    // Unnamed scenery inside a prefab: generic salvage rather than nothing.
    if (!cfg && !SKIP.has(info.name) && prefabFixtureAt(x, y, info.tileId)) {
      cfg = DEFAULT_CONFIG;
    }
    if (!cfg) return false;

    const tiles = computeFootprint(x, y, info.layer, info.tileId);
    showDismantleMenu(info.name, cfg, tiles);
    return true;
  }

  // Public entry: attempt a terrain interaction with the tile the character
  // faces, falling back to the tile the character is actually standing on.
  // The fallback is what makes a WALKABLE feature (tilled soil, and anything
  // else passable enough to stand on top of) usable from directly overhead:
  // a field that fills the whole plot has no bare edge to face, and standing
  // in the middle of one facing off the plot altogether would otherwise never
  // reach the very tile the party is standing on. Returns true if a menu was
  // opened (interaction handled).
  function tryInteract(character) {
    if (!character || !$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return false;
    if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) return false;
    const U = window.ProcGenUtils;
    if (!U) return false;

    const d = character.direction();
    const fx = $gameMap.roundXWithDirection(character.x, d);
    const fy = $gameMap.roundYWithDirection(character.y, d);

    if (tryInteractAt(character, fx, fy)) return true;
    if (fx === character.x && fy === character.y) return false;
    return tryInteractAt(character, character.x, character.y);
  }

  // ==========================================================================
  // Hooks
  // ==========================================================================
  // Re-apply stored removals whenever the proc map (re)loads a coordinate.
  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _Game_Map_setup.call(this, mapId);
    if (mapId === PROC_MAP_ID) {
      applyDismantledToMap();
      rollInitialLitFeatures();
      // Surfacing puts the party back on the very tile they went in by, so give
      // the entrance a moment before it can swallow a still-held direction key.
      _walkEntranceLockUntil = Graphics.frameCount + 60;
    }
  };

  // ==========================================================================
  // Driving through it
  // ==========================================================================
  // A hedge, a boulder or a garden wall stops somebody on foot. It does not stop
  // a camper doing thirty. Anything the party could have taken apart by hand is
  // simply flattened when a vehicle with a hull and a weight behind it is driven
  // into it: the tile goes the way a dismantled one goes - cleared off the map
  // and recorded in the world folder, so it stays gone for every savegame of
  // that world - but nothing is salvaged out of the wreckage. A wall driven
  // through is rubble, not building material; the party has to get out and take
  // it apart properly to get anything for it.
  //
  // Three vehicles are excluded, each for the same reason: THE STARSHIP flies
  // over the map and never touches a tile in the first place, and THE BROOM and
  // THE BIKE are one rider's own weight on something no bigger than they are.
  // Somebody who cycles into a wall stops.
  const RAM_EXEMPT_BOAT_TYPES = new Set(["bike", "broom"]);  // i18n-ignore  boat sub-type ids

  /** Is the party at the wheel of something heavy enough to drive through scenery? */
  function ridingRammingVehicle() {
    if (typeof $gamePlayer === "undefined" || !$gamePlayer) return false;
    if (!$gamePlayer.isInVehicle || !$gamePlayer.isInVehicle()) return false;
    // The Starship: it is an airship, it is above all of this.
    if ($gamePlayer.isInAirship && $gamePlayer.isInAirship()) return false;
    // The engine's single 'boat' slot carries the Car, the Boat, the Bike and
    // the Broom; which one it is right now is $gameSystem._boatType.
    if ($gamePlayer.isInBoat && $gamePlayer.isInBoat()) {
      const sub = (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._boatType) || "car";
      return !RAM_EXEMPT_BOAT_TYPES.has(sub);
    }
    // The 'ship' slot is the Camper, and anything else with a hull.
    return true;
  }

  // Flatten whatever stands on (x, y), if it is something a vehicle may flatten.
  // Answers whether the tile was actually cleared.
  function ramFeatureAt(x, y) {
    if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return false;
    // A real event on the tile owns it; the tilemap underneath is not ours to edit.
    if ($gameMap.events().some(e => e && e.x === x && e.y === y)) return false;

    const info = featureAt(x, y);
    if (!info || !info.name) return false;
    // A way in is a way in, not an obstacle. Driving at a cave mouth or a
    // stairwell must never quietly delete it (they are WALKED into, see above).
    if (WALK_ENTRANCES[info.name]) return false;
    // Anything with a bespoke interaction of its own - a seam of gold, a
    // fountain, a lit torch, a statue with an inscription on it - is left
    // standing. Those are places, not scenery in the way.
    if (CUSTOM_HANDLERS[info.name]) return false;

    const cfg = classify(info.name);
    if (!cfg) return false;

    const tiles = computeFootprint(x, y, info.layer, info.tileId);
    for (const t of tiles) clearFeatureTileData(t.x, t.y);
    $gameMap.requestRefresh();
    // Streamed, not deliberate: written on the throttle (see recordDismantled).
    recordDismantled(tiles, info.name, false);
    flushStreamedRemovals();
    playActionSe(cfg.verb);
    return true;
  }

  // Movement-driven terrain: what the party walks onto, or walks into.
  //   - a successful step lands them ON the tile: a Puddle wets the whole party
  //     (State 28), a passable entrance (a grate in the floor) swallows them.
  //   - a failed step means they walked INTO the tile ahead and were stopped by
  //     it, which is how an impassable entrance (a cave mouth, stairs set
  //     against a wall) is entered - or, at the wheel of something heavy, how
  //     the thing in the way stops being in the way.
  const _Game_Player_moveStraight_terrain = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function (d) {
    _Game_Player_moveStraight_terrain.call(this, d);
    if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return;
    // Blocked, and driving something that does not stop for scenery: flatten
    // what is in the way and take the same step again, so ramming reads as one
    // movement rather than a bump followed by a step into the gap. The retry
    // calls the engine's own moveStraight, so nothing here runs twice.
    if (!this.isMovementSucceeded() && ridingRammingVehicle()) {
      const bx = $gameMap.roundXWithDirection(this.x, d);
      const by = $gameMap.roundYWithDirection(this.y, d);
      if (ramFeatureAt(bx, by)) {
        _Game_Player_moveStraight_terrain.call(this, d);
      }
    }
    if (this.isMovementSucceeded()) {
      const info = featureAt(this.x, this.y);
      if (info && info.name === "Puddle") {  // i18n-ignore  feature id
        for (const a of $gameParty.members()) a.addState(28);
      }
      tryWalkEntrance(this.x, this.y);
    } else {
      tryWalkEntrance($gameMap.roundXWithDirection(this.x, d),
        $gameMap.roundYWithDirection(this.y, d));
    }
  };

  // Take apart something that is NOT a tile on the procedural map: the 3D
  // world's billboard trees, boulders, barrels and gravestones. Same table, same
  // tool it asks for, same rewards, same lesson learned - the only difference is
  // that `onRemove` takes the thing out of the world instead of the tilemap
  // being edited. `name` is a feature name off the same list the map uses
  // ("Tree", "Rock", "Flower", ...); anything unlisted salvages generically.
  // Returns false when the thing is not worth taking apart at all.
  function interactWithFeature(name, onRemove) {
    if (!name) return false;
    if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) return false;
    const cfg = classify(name);
    if (!cfg) return false;
    showDismantleMenu(name, cfg, [], onRemove);
    return true;
  }

  window.TerrainInteractions = {
    tryInteract, interactWithFeature, applyDismantledToMap,
    // Every removal recorded for one proc-map square (biome + world coordinate),
    // read by ProceduralMapPrefabs so a prefab never re-stamps scenery the party
    // already took apart on that square. Other squares running the same prefab
    // are untouched: the key is the world coordinate, not the prefab.
    removedTilesFor,
    // Driving through scenery (see "Driving through it"): whether the party is
    // at the wheel of something that flattens what it hits, and the flattening
    // itself. Exposed so anything else that shoves a vehicle across the map
    // (the road AI, a scripted chase) can use the one implementation.
    ridingRammingVehicle, ramFeatureAt,
    // Exposed so FurnitureSystem's Features tab can price a placeable feature
    // off the SAME reward table dismantling it would actually pay out (no
    // duplicated classification data). Returns null for un-dismantlable /
    // skipped names (doors, signs, pure terrain autotiles, ...).
    classify(name) { return classify(name); },
    // Every currently-lit Torch/Candle tile on the current proc-map coordinate;
    // DynamicLightingSystem re-creates their ad hoc lights from this on load.
    getLitTiles,
  };
  // Legacy alias (pre-rename): same object, so wraps applied through either
  // name are seen by every consumer.
  window.TerrainDismantle = window.TerrainInteractions;
})();
