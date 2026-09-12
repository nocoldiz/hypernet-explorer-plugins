/*:
 * @target MZ
 * @plugindesc GalaxySim Data Manager Module - Star system data management and ship travel
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim Data Manager Module
 * ============================================================================
 * This module handles all star system data management:
 * - Loading hardcoded systems from DataManager
 * - Procedural system generation
 * - Player ship position and travel logic
 * - System queries and distance calculations
 *
 * LOAD ORDER: Must load AFTER GalaxySim_Math.js
 *
 * DEPENDENCIES:
 * - DataManager.js
 * - GalaxySim_Math.js
 */

(() => {
  "use strict";

  // Set true (or run a playtest) to emit the verbose save/load payload logs.
  const DEBUG = false;
  const dlog = (...a) => {
    if (DEBUG || (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.isPlaytest && $gameTemp.isPlaytest())) {
      console.log(...a);
    }
  };

  // Check dependencies
  if (!window.GalaxySim || !window.GalaxySim.Math) {
    throw new Error("GalaxySim_DataManager requires GalaxySim_Math to be loaded first");
  }


  // Import from Math module
  const { RandomGenerator, MAP_RADIUS, SYSTEM_DENSITY, KLY_TO_LY,
    GALAXY_TYPE_SPIRAL, GALAXY_TYPE_ELLIPTICAL, GALAXY_TYPE_IRREGULAR,
    GALAXY_TYPE_DWARF_SPHEROIDAL } = window.GalaxySim.Math;
  const { STAR_COLORS, PLANET_COLORS } = window.GalaxySim.Math;

  // Import from GalaxyData
  const STAR_TYPES = window.GalaxySim.StarTypes;
  const PLANET_TYPES = window.GalaxySim.PlanetTypes;
  const SYSTEMS = window.GalaxySim.Systems;

  // Where a brand-new ship starts: in space, orbiting Earth (see parkAtHomeOrbit).
  const HOME_SYSTEM_NAME = "Sol";     // i18n-ignore: system id
  const HOME_PLANET_NAME = "Earth";   // i18n-ignore: planet id

  // ============================================================================
  // Lazy galaxy field constants
  // ----------------------------------------------------------------------------
  // The star map only stores ~92 procedural systems inside a 130 ly bubble.
  // To make the whole disk explorable, additional systems are generated on
  // demand in light-year "chunks" around the camera as the player zooms in.
  // Generation is deterministic (seeded from proceduralSeed + chunk coords), so
  // nothing needs saving -- the same chunk always yields the same stars. The
  // disk geometry constants mirror GalaxySim_Scene3D_Cosmos GAL.* so lazy stars
  // sit in the same galactic frame as the decorative Milky Way.
  // ============================================================================
  const LAZY_CHUNK_LY = 64;          // disk-plane cell size (ly)
  const LAZY_BASE_PER_CHUNK = 4;     // systems per chunk at the Sun's density
  const LAZY_CHUNK_CACHE = 256;      // generated chunks kept in memory (LRU)
  const MATERIALIZED_LAZY_CACHE = 128; // materialized lazy systems kept in this.systems (LRU)
  // ==========================================================================
  // The strange-system archetypes (see _strangePlan). `from` is the lowest
  // strangeness tier that may build one; `apply` writes the whole plan.
  // ==========================================================================
  const STRANGE_ARCHETYPES = [
    // Nothing shares a plane out here.
    { key: "tilted", from: 3, apply(plan, tier) {
      plan.tilt = Math.min(1.55, 0.35 + tier * 0.07);
      plan.retrograde = Math.min(0.5, 0.1 + tier * 0.025);
    } },
    // Orbits that cross each other, which should not last and does.
    { key: "crossing", from: 4, apply(plan, tier) {
      plan.shuffleOrbits = true;
      plan.tilt = Math.min(1.2, 0.2 + tier * 0.05);
    } },
    // Every world in the system is one a party could walk out onto.
    { key: "garden", from: 5, apply(plan, tier, rng) {
      plan.typePool = HABITABLE_TYPES.slice();
      plan.planetChance = 1;
      plan.minPlanets = 3;
      plan.maxPlanets = 4 + rng.int(0, Math.min(9, tier));
    } },
    // Far too many worlds for one star.
    { key: "swarm", from: 6, apply(plan, tier, rng) {
      plan.planetChance = 1;
      plan.minPlanets = 12;
      plan.maxPlanets = 14 + rng.int(0, tier * 2);
    } },
    // Far too many stars for one system.
    { key: "crowded", from: 7, apply(plan, tier, rng) {
      plan.extraStars = 2 + rng.int(0, Math.min(7, tier - 4));
      plan.planetChance = 0.7;
      plan.tilt = 0.6;
    } },
    // A ring of worlds sharing one orbit.
    { key: "shepherd", from: 9, apply(plan, tier, rng) {
      plan.coOrbital = true;
      plan.planetChance = 1;
      plan.minPlanets = 6;
      plan.maxPlanets = 8 + rng.int(0, tier);
    } },
    // Giants at the star's throat, dust out past the dark.
    { key: "inverted", from: 10, apply(plan, tier) {
      plan.inverted = true;
      plan.planetChance = 0.9;
      plan.minPlanets = 4;
      plan.tilt = Math.min(1.4, 0.3 + tier * 0.06);
    } },
    // The rim: a garden ring around a knot of stars, which is every one of the
    // rules above broken at once.
    { key: "impossible", from: 12, apply(plan, tier, rng) {
      plan.typePool = HABITABLE_TYPES.slice();
      plan.coOrbital = true;
      plan.extraStars = 3 + rng.int(0, 6);
      plan.planetChance = 1;
      plan.minPlanets = 8;
      plan.maxPlanets = 10 + rng.int(0, tier);
      plan.tilt = 1.5;
      plan.retrograde = 0.5;
    } },
  ];

  // The worlds a "garden" system is made of: everything the planet table calls
  // life-bearing, so the set follows the data rather than a list written twice.
  const HABITABLE_TYPES = Object.keys(PLANET_TYPES)
    .filter((k) => PLANET_TYPES[k] && PLANET_TYPES[k].supportLife);

  const GALAXY_SYSTEM_COUNT = 220;   // travelable systems generated per procedural (non-Milky-Way) galaxy
  // A procedural galaxy's OWN lazy field. The Milky Way has streamed a dense
  // star cloud into the disk around the camera since the lazy chunks went in
  // (see generateLazyChunk); every other galaxy had nothing but the 220 named
  // systems above and its central hole, so zooming into one landed in near
  // empty space. These are the same idea in that galaxy's local frame, which
  // buildProceduralGalaxy keeps in WORLD units rather than light-years.
  const GALAXY_LAZY_CHUNK = 60;      // disk-plane cell size (world units)
  const GALAXY_LAZY_PER_CHUNK = 5;   // systems per chunk at the core's density
  const GALAXY_LAZY_CACHE = 256;     // generated galaxy chunks kept in memory (LRU)
  const GAL_SUN_R_LY = 26000;        // Sun distance from the galactic core
  const GAL_DISK_RADIUS_LY = 52000;  // visible disk radius
  const GAL_DISK_SCALE_LY = 9000;    // radial density scale length
  const GAL_THIN_DISK_H_LY = 250;    // vertical scatter (thin disk)

  // ============================================================================
  // Ship fuels (see GalaxySim_Core header).
  //   - Variable 95 ("fuel"): the classic tank, spent only when the ship moves
  //     on the RPG world map (never touched by galaxy-scale travel now).
  //   - Hyperflux: powers galaxy-scale sublight travel between systems. Litres,
  //     capped at 92 000.
  //   - Schrodingerite: a whole-unit exotic charge that fuels the SB-Bridge
  //     instant warp to any selected system, however far. Capped at 92.
  // Hyperflux / Schrodingerite live on playerShip so they persist with the star
  // map save blob (toJSON) rather than consuming RPG variable slots.
  // ============================================================================
  const HYPERFLUX_MAX = 92000;
  const SCHRODINGERITE_MAX = 92;
  // Real-time seconds a completely empty tank takes to fill while the pumps
  // run. Refuelling is a deliberate two-minute stop the ship visibly flies in
  // for (the star map eases the hull toward the star and back out again, see
  // Scene3D's refuel approach), with an ETA counted down in the same window
  // the travel countdown uses.
  const REFUEL_FULL_SECONDS = 120;
  // Hyperflux/second gained while parked in orbit of a main-sequence star and
  // actively refuelling.
  const REFUEL_RATE_PER_SEC = HYPERFLUX_MAX / REFUEL_FULL_SECONDS;
  // Drawing Schrodingerite off a black hole is a far shorter stop than a
  // stellar refuel: half a minute for an empty magazine of charges.
  const SCHRODINGERITE_FULL_SECONDS = 30;
  const SCHRODINGERITE_REFUEL_RATE_PER_SEC = SCHRODINGERITE_MAX / SCHRODINGERITE_FULL_SECONDS;
  // Variable 95 ("fuel") is the classic RPG-world-map tank (see the header
  // note above); a Hyperflux refuel tops it up too, on the same real-time
  // curve as Hyperflux itself, so parking at a star fills both tanks at once
  // instead of leaving the party stranded on the world map with a full ship.
  const MAP_FUEL_MAX = 10000;
  const MAP_FUEL_REFUEL_RATE_PER_SEC = MAP_FUEL_MAX / REFUEL_FULL_SECONDS;
  // The warp-speed slider (Variable 94) is calibrated for crossing light-years
  // between stars; applied unmodified to a hop between two planets a handful
  // of AU apart it made every intra-system trip read as instantaneous
  // regardless of the actual distance. In-system moves run on sublight
  // engines instead, capped well below the interstellar drive (see
  // updateShipPosition's isIntraSystem branch).
  const INTRA_SYSTEM_SPEED_CAP = 2;
  // The seven Morgan-Keenan main-sequence classes (see StarTypes.json). With
  // the exotic star roster (remnants, brown dwarfs, protostars, theoretical
  // objects, rogue planets...) this is now a whitelist: only an ordinary
  // fusing star can power a refuel, everything else can't.
  const MAIN_SEQUENCE_TYPES = new Set(["O", "B", "A", "F", "G", "K", "M"]);
  // How far the auto-refuel search sweeps the lazy field: rings of disk-plane
  // chunks around the ship (see generateLazyChunk / LAZY_CHUNK_LY). Ordinary
  // fusing stars are the bulk of the population, so ring 0-1 nearly always
  // hits; the rest of the budget covers the sparse outer disk.
  const REFUEL_SEARCH_RINGS = 6;

  // Compact accretors that can be found actively feeding on a donor star, and
  // the rare/luminous donor classes they strip. A "feeding" system renders the
  // donor + a mass-transfer stream in the system view (Scene3D_Bodies).
  const FEEDING_ACCRETOR_TYPES = new Set([
    "BLACK_HOLE", "NEUTRON_STAR", "PULSAR", "MAGNETAR", "QUARK_STAR",
  ]);
  const FEEDING_DONOR_TYPES = [
    "RED_GIANT", "RED_SUPERGIANT", "WOLF_RAYET", "CARBON_STAR", "HYPERGIANT",
  ];
  // Companion classes for procedural multi-star (binary/trinary/quaternary)
  // systems, weighted roughly by how common each class is as a bound partner.
  const COMPANION_TYPES = [
    "M", "M", "M", "M", "K", "K", "K", "G", "G", "F", "A", "B",
    "WHITE_DWARF", "L", "T", "RED_GIANT",
  ];
  // Types that never receive stellar modifiers (no companions, no Dyson
  // shells, no feeding donors of their own). The esoteric objects are in here
  // too: whatever a patron's world orbits, it orbits it alone.
  const NO_MODIFIER_TYPES = new Set([
    "ROGUE_PLANET", "SUPERMASSIVE_BLACK_HOLE",
    "BLACK_HOLE_STAR", "CURSED_STAR", "ZOMBIE_STAR", "EYEBALL_STAR",
    "PENTAGRAM_STAR", "ANGELIC_STAR", "OIL_STAR", "CLOCKWORK_STAR",
    "MIRROR_STAR", "BONE_STAR", "HOLLOW_STAR", "CANDLE_STAR",
  ]);

  // The weighted bag every procedural star is drawn from. A class with a
  // frequency of zero is left out of it entirely: those are the esoteric
  // objects (black-hole star, cursed star, zombie star, eyeball star,
  // pentagram star, angelic star, oil star, clockwork star, mirror star, bone
  // star, hollow star, candle star), which exist nowhere in the universe
  // except where they are authored - one per patron's world (PatreonRewards).
  function buildStarTypePool() {
    const pool = [];
    Object.keys(STAR_TYPES).forEach((type) => {
      const freq = Number(STAR_TYPES[type].freq) || 0;
      if (freq <= 0) return;
      const count = Math.max(1, Math.round(freq * 20000));
      for (let i = 0; i < count; i++) pool.push(type);
    });
    return pool;
  }
  // Chance a procedural main-sequence star hides an abandoned Dyson sphere.
  const ABANDONED_DYSON_CHANCE = 0.0006;
  // Schrödingerite harvested from a black hole per visit, and how long (in
  // game-minutes) the SAME black hole takes to recharge before it can be
  // harvested again.
  const SCHRODINGERITE_HARVEST_AMOUNT = 3;
  const SCHRODINGERITE_HARVEST_COOLDOWN_MIN = 7 * 24 * 60; // one game week
  // A harvest is not a button press but a run: half a minute of flying the
  // hull low over the hole, skimming the disk, before the charges are aboard.
  // See beginSchrodingeriteHarvest / tickSchrodingeriteHarvest; the star map
  // dives the ship in for exactly as long as the run lasts.
  const SCHRODINGERITE_HARVEST_SECONDS = 30;

  // ============================================================================
  // Procedural Name Generators
  // ============================================================================

  function generateProceduralGalaxyName(x, y, rng) {
    const catalogPrefixes = [
      'NGC', 'IC', 'UGC', 'PGC', 'SDSS', '2MASS', 'ESO', 'UGPS',
      'WISE', 'MCG', 'CGCG', 'LEDA', 'APG', 'VCC'
    ];

    const catalogType = rng.random();

    if (catalogType < 0.3) {
      const prefix = catalogPrefixes[Math.floor(rng.random() * catalogPrefixes.length)];
      const number = Math.floor(rng.random() * 9999) + 1;
      return `${prefix} ${number}`;
    } else if (catalogType < 0.5) {
      const prefix = catalogPrefixes[Math.floor(rng.random() * catalogPrefixes.length)];
      const ra1 = Math.floor(rng.random() * 24).toString().padStart(2, '0');
      const ra2 = Math.floor(rng.random() * 60).toString().padStart(2, '0');
      const ra3 = (rng.random() * 60).toFixed(2).padStart(5, '0');
      const decSign = rng.random() > 0.5 ? '+' : '-';
      const dec1 = Math.floor(rng.random() * 90).toString().padStart(2, '0');
      const dec2 = Math.floor(rng.random() * 60).toString().padStart(2, '0');
      const dec3 = (rng.random() * 60).toFixed(1).padStart(4, '0');
      return `${prefix} J${ra1}${ra2}${ra3}${decSign}${dec1}${dec2}${dec3}`;
    } else {
      const prefix = catalogPrefixes[Math.floor(rng.random() * catalogPrefixes.length)];
      const sign = rng.random() > 0.5 ? '+' : '-';
      const part1 = Math.floor(rng.random() * 15) + 1;
      const part2 = Math.floor(rng.random() * 99) + 1;
      const part3 = Math.floor(rng.random() * 999) + 1;
      return `${prefix}${sign}${part1.toString().padStart(2, '0')}-${part2.toString().padStart(2, '0')}-${part3.toString().padStart(3, '0')}`;
    }
  }

  // i18n-ignore-start: catalogue designations. Constellation names are
  // Latin and stay Latin in every language; the direction / feature words
  // are the naming grammar of a designation, not a sentence, and match the
  // convention the rest of the star map already uses (see Scene3D_Cosmos).
  function generateProceduralSuperclusterName(x, y, rng) {
    const realConstellations = [
      'Pisces', 'Cetus', 'Sculptor', 'Fornax', 'Eridanus',
      'Hydra', 'Centaurus', 'Perseus', 'Coma', 'Corona Borealis',
      'Hercules', 'Leo', 'Bootes', 'Aquarius', 'Pegasus',
      'Indus', 'Pavo', 'Phoenix', 'Horologium', 'Reticulum',
      'Draco', 'Ursa', 'Lynx', 'Gemini', 'Cancer',
      'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricorn',
      'Taurus', 'Orion', 'Canis', 'Lepus', 'Columba'
    ];

    const directions = [
      'Northern', 'Southern', 'Eastern', 'Western',
      'Upper', 'Lower', 'Central', 'Outer',
      'Near', 'Far', 'Inner', 'Peripheral'
    ];

    const features = [
      'Great', 'Grand', 'Major', 'Greater', 'Vast',
      'Extended', 'Massive', 'Giant', 'Complex'
    ];

    const typeRoll = rng.random();

    if (typeRoll < 0.35) {
      const constellation = realConstellations[Math.floor(rng.random() * realConstellations.length)];
      return `${constellation} Supercluster`;
    } else if (typeRoll < 0.65) {
      const direction = directions[Math.floor(rng.random() * directions.length)];
      const feature = features[Math.floor(rng.random() * features.length)];
      return `${direction} ${feature} Supercluster`;
    } else {
      const prefixes = ['SDSS-C', 'SCL', 'MSC', 'GSC', 'Abell', 'Shapley'];
      const prefix = prefixes[Math.floor(rng.random() * prefixes.length)];
      const number = Math.floor(rng.random() * 9999) + 1000;
      return `${prefix} ${number}`;
    }
  }
  // i18n-ignore-end

  // i18n-ignore-start: catalogue designations. Constellation names are
  // Latin and stay Latin in every language; the direction / feature words
  // are the naming grammar of a designation, not a sentence, and match the
  // convention the rest of the star map already uses (see Scene3D_Cosmos).
  function generateGalaxyGroupName(x, y, rng) {
    const directions = [
      'Northern', 'Southern', 'Eastern', 'Western',
      'Upper', 'Lower', 'Central', 'Outer',
      'Near', 'Far', 'Inner', 'Peripheral'
    ];

    const features = [
      'Void', 'Arm', 'Stream', 'Cloud', 'Arc',
      'Filament', 'Wall', 'Bridge', 'Tail', 'Spur',
      'Cluster', 'Chain', 'Loop', 'Knot'
    ];

    const typeRoll = rng.random();

    if (typeRoll < 0.4) {
      const direction = directions[Math.floor(rng.random() * directions.length)];
      const feature = features[Math.floor(rng.random() * features.length)];
      return `${direction} ${feature} Group`;
    } else if (typeRoll < 0.7) {
      const number = Math.floor(rng.random() * 999) + 1;
      return `Galaxy Group ${number}`;
    } else {
      const consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
      const vowels = 'AEIOU';
      let name = '';
      const length = Math.floor(rng.random() * 3) + 4;
      for (let i = 0; i < length; i++) {
        if (i % 2 === 0) {
          name += consonants[Math.floor(rng.random() * consonants.length)];
        } else {
          name += vowels[Math.floor(rng.random() * vowels.length)];
        }
      }
      return `${name.charAt(0) + name.slice(1).toLowerCase()} Group`;
    }
  }
  // i18n-ignore-end

  // i18n-ignore-start: catalogue designations. Constellation names are
  // Latin and stay Latin in every language; the direction / feature words
  // are the naming grammar of a designation, not a sentence, and match the
  // convention the rest of the star map already uses (see Scene3D_Cosmos).
  function generateSuperclusterName(x, y, rng) {
    const realConstellations = [
      'Pisces', 'Cetus', 'Sculptor', 'Fornax', 'Eridanus',
      'Hydra', 'Centaurus', 'Perseus', 'Coma', 'Corona Borealis',
      'Hercules', 'Leo', 'Bootes', 'Aquarius', 'Pegasus',
      'Indus', 'Pavo', 'Phoenix', 'Horologium', 'Reticulum'
    ];

    const typeRoll = rng.random();

    if (typeRoll < 0.5) {
      const constellation = realConstellations[Math.floor(rng.random() * realConstellations.length)];
      return `${constellation} Supercluster`;
    } else if (typeRoll < 0.75) {
      const directions = ['Northern', 'Southern', 'Eastern', 'Western', 'Central'];
      const features = ['Great', 'Grand', 'Major', 'Greater', 'Vast'];
      const direction = directions[Math.floor(rng.random() * directions.length)];
      const feature = features[Math.floor(rng.random() * features.length)];
      return `${direction} ${feature} Supercluster`;
    } else {
      const prefixes = ['Sloan', 'SDSS', 'SCL', 'MSC', 'GSC'];
      const prefix = prefixes[Math.floor(rng.random() * prefixes.length)];
      const number = Math.floor(rng.random() * 999) + 1;
      return `${prefix}-${number}`;
    }
  }
  // i18n-ignore-end

  function generateProceduralLocalGroup(supercluster) {
    const rng = new RandomGenerator(`cosmic_web_${supercluster.x}_${supercluster.y}`);   // i18n-ignore: rng seed
    const galaxies = [];

    const sectorRadius = 100000 * KLY_TO_LY;
    const targetCount = 1000 + Math.floor(rng.random() * 1500);

    let safetyCounter = 0;

    const getCosmicWebDensity = (x, y) => {
      let freq = 0.00004;
      let amplitude = 1.0;
      let noiseSum = 0;
      let maxVal = 0;

      const warpX = Math.sin(x * freq * 0.5);
      const warpY = Math.cos(y * freq * 0.5);

      const wx = x + (warpX * 0.2 * sectorRadius);
      const wy = y + (warpY * 0.2 * sectorRadius);

      for (let i = 0; i < 3; i++) {
        const nx = wx * freq + (i * 13.2);
        const ny = wy * freq + (i * 57.8);

        let signal = 1.0 - Math.abs(Math.sin(nx) * Math.cos(ny));
        signal = Math.pow(signal, 2);

        noiseSum += signal * amplitude;
        maxVal += amplitude;

        freq *= 2.1;
        amplitude *= 0.5;
      }

      let normalized = noiseSum / maxVal;
      return Math.pow(normalized, 6);
    };

    while (galaxies.length < targetCount && safetyCounter < targetCount * 20) {
      safetyCounter++;

      const angle = rng.random() * Math.PI * 2;
      const dist = Math.sqrt(rng.random()) * sectorRadius;

      const candX = supercluster.x + Math.cos(angle) * dist;
      const candY = supercluster.y + Math.sin(angle) * dist;

      const density = getCosmicWebDensity(candX, candY);

      if (rng.random() > (density + 0.005)) {
        continue;
      }

      const typeRoll = rng.random();
      let type, radius, mass;

      if (density > 0.85 && typeRoll < 0.6) {
        type = GALAXY_TYPE_ELLIPTICAL;
        radius = (60 + rng.random() * 100) * KLY_TO_LY;
        mass = 1e12 + rng.random() * 5e12;
      } else if (density > 0.4) {
        if (typeRoll < 0.7) {
          type = GALAXY_TYPE_SPIRAL;
          radius = (25 + rng.random() * 60) * KLY_TO_LY;
          mass = 5e10 + rng.random() * 8e11;
        } else {
          type = GALAXY_TYPE_ELLIPTICAL;
          radius = (20 + rng.random() * 40) * KLY_TO_LY;
          mass = 1e10 + rng.random() * 1e11;
        }
      } else {
        type = rng.random() < 0.5 ? GALAXY_TYPE_DWARF_SPHEROIDAL : GALAXY_TYPE_IRREGULAR;
        radius = (2 + rng.random() * 8) * KLY_TO_LY;
        mass = 1e7 + rng.random() * 1e9;
      }

      galaxies.push({
        name: generateProceduralGalaxyName(candX, candY, rng),
        x: candX,
        y: candY,
        radius: radius,
        type: type,
        mass: mass,
        color: {
          r: 200 + Math.floor(rng.random() * 55),
          g: density > 0.7 ? 150 + Math.floor(rng.random() * 50) : 180 + Math.floor(rng.random() * 75),
          b: density > 0.7 ? 100 + Math.floor(rng.random() * 50) : 200 + Math.floor(rng.random() * 55)
        },
        supercluster: supercluster
      });
    }

    return galaxies;
  }

  // ============================================================================
  // Star Map Data Manager
  // ============================================================================

  class StarMapDataManager {
    constructor() {
      this.systems = new Map();
      this.hardcodedSystems = new Set();
      this.currentSystem = "Sol";   // i18n-ignore: system id
      this.proceduralSeed = 12345;
      this.proceduralGenerated = false;
      // this.loadSystems(); // Lazy loaded on first request

      this.playerShip = {
        currentSystem: "Sol",   // i18n-ignore: system id
        currentPlanet: null,
        // Set while the ship is parked in orbit of a star/black hole (as
        // opposed to currentPlanet, which covers planet/moon orbit). Mutually
        // exclusive with currentPlanet - entering either clears the other.
        parkedBody: null,
        position: null,
        targetSystem: null,
        targetPlanet: null,
        isMoving: false,
        departureTime: null,
        departurePosition: null,
        targetPosition: null,
        travelDistance: 0,
        // Immutable anchor of the whole trip. departurePosition/travelDistance
        // are rebased every time the warp slider moves (see
        // recalculateDepartureOnSpeedChange), so they only describe the leg
        // being flown right now; anything that draws how far along the route
        // the ship is must measure against these instead.
        originPosition: null,
        originDistance: 0,
        orbitRadius: 0.5,
        // Exotic fuels (see HYPERFLUX_MAX / SCHRODINGERITE_MAX). Start full.
        hyperflux: HYPERFLUX_MAX,
        schrodingerite: SCHRODINGERITE_MAX,
        // True while parked at a main-sequence star and actively refuelling
        // (see startRefuel/stopRefuel/tickRefuel).
        isRefueling: false,
        // Open Schrodingerite flyby, if any: { name, elapsed } (see
        // beginSchrodingeriteHarvest / tickSchrodingeriteHarvest).
        harvestRun: null,
        // Set by beginAutoRefuel: the pumps engage by themselves once the
        // plotted course reaches the fusing star it was aimed at.
        autoRefuelOnArrival: false,
      };

      this.initializeShipPosition();
      // Default start: in space, in low orbit of Earth, so a <Biome: Space> map
      // always has the body it orbits outside the windows. Character-creation
      // scenarios that begin somewhere else (the crash-landed origin, which
      // strands the party on another planet) re-park the ship afterwards.
      this.parkAtHomeOrbit();
    }

    initializeShipPosition() {
      const sol = this.getSystem(HOME_SYSTEM_NAME);
      if (sol) {
        this.playerShip.position = { ...sol.position };
      } else {
        this.playerShip.position = { x: 0, y: 0, z: 0 };
      }
    }

    // Park the ship at its factory berth (Earth orbit). Written straight onto
    // the ship rather than through teleportToPlanetOrbit so it is safe to call
    // from the constructor, before $gameVariables exists.
    parkAtHomeOrbit() {
      const sol = this.getSystem(HOME_SYSTEM_NAME);
      const home = sol && (sol.planets || []).find((p) => p.name === HOME_PLANET_NAME);
      if (!home) return false;
      this.playerShip.currentSystem = sol.name;
      this.playerShip.currentPlanet = home.name;
      this.playerShip.parkedBody = null;
      this.currentSystem = sol.name;
      this.playerShip.position = { ...sol.position };
      return true;
    }

    // Normal (non-warp) course to a SPECIFIC star of an N-ary system: same
    // flight as startTravelToSystem, but arrival parks the ship in orbit of
    // that star (primary, companion or feeding donor) instead of the default
    // free drift at the system centre.
    startTravelToStar(targetSystemName, starName) {
      if (!this.getStarInSystem(targetSystemName, starName)) return false;
      if (!this.startTravelToSystem(targetSystemName)) return false;
      this.playerShip.targetStar = starName || null;
      return true;
    }

    startTravelToSystem(targetSystemName) {
      const targetSystem = this.getSystem(targetSystemName);
      if (!targetSystem) return false;

      this.playerShip.targetSystem = targetSystemName;
      this.playerShip.targetPlanet = null;
      this.playerShip.targetStar = null;
      this.playerShip.isMoving = true;
      this.playerShip.departureTime = Date.now();
      this.playerShip.lastFuelTime = this.playerShip.departureTime;
      this.playerShip.departurePosition = { ...this.playerShip.position };
      this.playerShip.targetPosition = { ...targetSystem.position };
      $gameVariables.setValue(97, targetSystemName);

      const dx = this.playerShip.targetPosition.x - this.playerShip.departurePosition.x;
      const dy = this.playerShip.targetPosition.y - this.playerShip.departurePosition.y;
      const dz = this.playerShip.targetPosition.z - this.playerShip.departurePosition.z;
      this.playerShip.travelDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this._anchorTravelOrigin();

      return true;
    }

    startTravelToPlanet(targetSystemName, targetPlanetName) {
      const targetSystem = this.getSystem(targetSystemName);
      if (!targetSystem) return false;

      const planet = (targetSystem.planets || []).find((p) => p.name === targetPlanetName);
      if (!planet) return false;

      this.playerShip.targetSystem = targetSystemName;
      this.playerShip.targetPlanet = targetPlanetName;
      this.playerShip.isMoving = true;
      this.playerShip.departureTime = Date.now();
      this.playerShip.lastFuelTime = this.playerShip.departureTime;
      this.playerShip.departurePosition = { ...this.playerShip.position };
      $gameVariables.setValue(97, targetSystemName);

      const MIN_VISUAL_WORLD_RADIUS = 0.15;
      const RADIUS_SCALE_FACTOR = 0.01;
      const worldRadius = MIN_VISUAL_WORLD_RADIUS + targetSystem.radius * RADIUS_SCALE_FACTOR;
      const MIN_PIXEL_SIZE = 2;
      const starPixelRadius = Math.max(MIN_PIXEL_SIZE, worldRadius);

      const orbitRadiusWorld = planet.orbitRadius || 1;
      const angle = planet.phase || 0;

      const isEccentric = planet.type === "rogue" || planet.type === "comet" ||
        planet.type === "short_period_comet" || planet.type === "long_period_comet";

      let planetX, planetY;

      if (isEccentric) {
        const eccentricity = 0.6;
        const a = orbitRadiusWorld;
        const b = a * Math.sqrt(1 - eccentricity * eccentricity);
        const c_offset = a * eccentricity;

        planetX = targetSystem.position.x + c_offset + Math.cos(angle) * a;
        planetY = targetSystem.position.y + Math.sin(angle) * b;
      } else {
        planetX = targetSystem.position.x + Math.cos(angle) * orbitRadiusWorld;
        planetY = targetSystem.position.y + Math.sin(angle) * orbitRadiusWorld;
      }

      this.playerShip.targetPosition = {
        x: planetX,
        y: planetY,
        z: targetSystem.position.z,
      };

      const dx = this.playerShip.targetPosition.x - this.playerShip.departurePosition.x;
      const dy = this.playerShip.targetPosition.y - this.playerShip.departurePosition.y;
      const dz = this.playerShip.targetPosition.z - this.playerShip.departurePosition.z;
      this.playerShip.travelDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this._anchorTravelOrigin();

      return true;
    }

    // Pin the start of the route, once per departure. Everything that reports
    // "how far along is the ship" measures from here, so a mid-flight warp
    // change (which rewrites departurePosition/travelDistance) cannot make the
    // trip look like it is starting over.
    _anchorTravelOrigin() {
      this.playerShip.originPosition = { ...this.playerShip.departurePosition };
      this.playerShip.originDistance = this.playerShip.travelDistance;
    }

    /**
     * Fraction of the plotted route already flown, 0..1, measured against the
     * trip's origin rather than the current leg.
     * @param {object} [ship] defaults to the player ship
     */
    travelProgress(ship) {
      const s = ship || this.playerShip;
      if (!s) return 0;
      // A course plotted before origins were tracked (or restored from an old
      // save mid-flight) falls back to the leg it is flying.
      const origin = s.originPosition || s.departurePosition;
      const span = s.originDistance || s.travelDistance;
      if (!origin || !span || !s.position) return 0;
      const dx = s.position.x - origin.x;
      const dy = s.position.y - origin.y;
      const dz = s.position.z - origin.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return Math.max(0, Math.min(1, d / span));
    }

    stopTravel(userStopped = true) {
      this.playerShip.isMoving = false;
      this.playerShip.targetSystem = null;
      this.playerShip.targetPlanet = null;
      this.playerShip.targetStar = null;
      this.playerShip.departureTime = null;
      this.playerShip.lastFuelTime = null;
      this.playerShip.departurePosition = null;
      this.playerShip.targetPosition = null;
      this.playerShip.originPosition = null;
      this.playerShip.originDistance = 0;
      if (userStopped) {
        this.playerShip.stoppedMidTravel = true;
        // A course the player abandoned no longer hands off to the pumps.
        this.playerShip.autoRefuelOnArrival = false;
      }
    }

    updateShipPosition() {
      if (!this.playerShip.isMoving || !this.playerShip.departureTime) {
        return;
      }

      const sliderSpeed = $gameVariables.value(94) || 1;
      // A hop between two bodies of the SAME system is flown on sublight
      // engines, capped well under the interstellar warp slider - otherwise
      // cranking that slider for a light-year crossing also made the next
      // planet a fraction of a second away, however many AU it actually was.
      const isIntraSystem = !!this.playerShip.targetSystem &&
        this.playerShip.targetSystem === this.playerShip.currentSystem;
      const speedMultiplier = isIntraSystem
        ? Math.min(sliderSpeed, INTRA_SYSTEM_SPEED_CAP) : sliderSpeed;
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - this.playerShip.departureTime) / 1000;

      // Travelling to other stars (interstellar) has base speed 0.5.
      const baseSpeed = isIntraSystem ? 1 : 0.5;
      const distanceTraveled = elapsedSeconds * baseSpeed * speedMultiplier;
      const maxProgress = 0.95;
      // Zero-distance travel would make progress NaN; treat it as an instant arrival.
      const progress = this.playerShip.travelDistance > 0
        ? Math.min(distanceTraveled / this.playerShip.travelDistance, maxProgress)
        : maxProgress;

      const dx = this.playerShip.targetPosition.x - this.playerShip.departurePosition.x;
      const dy = this.playerShip.targetPosition.y - this.playerShip.departurePosition.y;
      const dz = this.playerShip.targetPosition.z - this.playerShip.departurePosition.z;

      this.playerShip.position = {
        x: this.playerShip.departurePosition.x + dx * progress,
        y: this.playerShip.departurePosition.y + dy * progress,
        z: this.playerShip.departurePosition.z + dz * progress,
      };

      // Galaxy-scale sublight travel burns Hyperflux (not the map-fuel var 95).
      // Drain from the per-frame delta, not the total elapsed-since-departure
      // (the latter compounds because it is subtracted from already-decremented
      // fuel). Faster warp speeds cost quadratically more, so the slider trades
      // arrival time for Hyperflux.
      const lastFuelTime = this.playerShip.lastFuelTime || this.playerShip.departureTime;
      const deltaSeconds = Math.max(0, (currentTime - lastFuelTime) / 1000);
      this.playerShip.lastFuelTime = currentTime;
      const fuelConsumed = deltaSeconds * speedMultiplier * speedMultiplier * 0.01;
      const fuelValue = this.getHyperflux();
      this.setHyperflux(fuelValue - fuelConsumed);

      if (progress >= maxProgress) {
        // Ship has arrived
        this.playerShip.currentSystem = this.playerShip.targetSystem;
        this.currentSystem = this.playerShip.targetSystem;

        if (this.playerShip.targetPlanet) {
          this.playerShip.currentPlanet = this.playerShip.targetPlanet;
          this.playerShip.parkedBody = null;
        } else if (this.playerShip.targetStar) {
          // Arrival aimed at a specific star of the system (see
          // startTravelToStar): park in its orbit.
          this.playerShip.currentPlanet = null;
          const rec = this.getStarInSystem(
            this.playerShip.currentSystem, this.playerShip.targetStar);
          this.playerShip.parkedBody = {
            kind: (rec && (rec.type === "BLACK_HOLE" || rec.type === "SUPERMASSIVE_BLACK_HOLE"))
              ? "blackhole" : "star",
            name: this.playerShip.targetStar,
            system: this.playerShip.currentSystem,
          };
        } else {
          this.playerShip.currentPlanet = null;
          this.playerShip.parkedBody = null;
        }

        this.playerShip.stoppedMidTravel = false;
        $gameVariables.setValue(96, this.playerShip.currentSystem);
        const autoRefuel = !!this.playerShip.autoRefuelOnArrival;
        this.stopTravel(false);
        // An auto-refuel course (see beginAutoRefuel) starts the pumps the
        // moment the ship settles into the star's orbit.
        if (autoRefuel) {
          this.playerShip.autoRefuelOnArrival = false;
          this.startRefuel();
        }
      }

      if (this.getHyperflux() <= 0) {
        this.stopTravel(true);
      }
    }

    // ---- Fuel accessors ---------------------------------------------------
    getHyperflux() {
      const v = this.playerShip.hyperflux;
      return (typeof v === "number" && isFinite(v)) ? v : HYPERFLUX_MAX;
    }
    setHyperflux(v) {
      this.playerShip.hyperflux = Math.max(0, Math.min(HYPERFLUX_MAX, v || 0));
      return this.playerShip.hyperflux;
    }
    getSchrodingerite() {
      const v = this.playerShip.schrodingerite;
      return (typeof v === "number" && isFinite(v)) ? Math.floor(v) : SCHRODINGERITE_MAX;
    }
    setSchrodingerite(v) {
      this.playerShip.schrodingerite =
        Math.max(0, Math.min(SCHRODINGERITE_MAX, Math.floor(v || 0)));
      return this.playerShip.schrodingerite;
    }
    getMapFuel() {
      return ($gameVariables && $gameVariables.value(95)) || 0;
    }
    setMapFuel(v) {
      const clamped = Math.max(0, Math.min(MAP_FUEL_MAX, v || 0));
      if ($gameVariables) $gameVariables.setValue(95, clamped);
      return clamped;
    }

    // Instantly relocate the ship to a target system (SB-Bridge warp). Consumes
    // no fuel itself -- the caller checks/decrements Schrodingerite -- and works
    // for any resolvable system regardless of distance or galaxy.
    teleportToSystem(targetSystemName) {
      const targetSystem = this.getSystem(targetSystemName);
      if (!targetSystem) return false;
      this.stopTravel(false);
      this.playerShip.currentSystem = targetSystemName;
      this.playerShip.currentPlanet = null;
      this.playerShip.parkedBody = null;
      this.currentSystem = targetSystemName;
      this.playerShip.position = { ...targetSystem.position };
      this.playerShip.stoppedMidTravel = false;
      $gameVariables.setValue(96, targetSystemName);
      return true;
    }

    // Instantly relocate the ship into orbit of a specific planet (SB-Bohr
    // bridge). The system view re-places the ship on the planet each frame from
    // currentPlanet, so setting the state is enough. Fuel is handled by caller.
    teleportToPlanetOrbit(systemName, planetName) {
      const sys = this.getSystem(systemName);
      if (!sys) return false;
      const planet = (sys.planets || []).find((p) => p.name === planetName);
      if (!planet) return false;
      this.stopTravel(false);
      this.playerShip.currentSystem = systemName;
      this.playerShip.currentPlanet = planetName;
      this.playerShip.parkedBody = null;
      this.currentSystem = systemName;
      this.playerShip.position = { ...sys.position };
      this.playerShip.stoppedMidTravel = false;
      $gameVariables.setValue(96, systemName);
      return true;
    }

    // Resolve a named star inside a system: the primary itself, a companion
    // star of an N-ary system, or the donor star of a feeding X-ray binary.
    getStarInSystem(systemName, starName) {
      const sys = this.getSystem(systemName);
      if (!sys) return null;
      if (!starName || starName === sys.name) return sys;
      if (sys.feeding && sys.feeding.donor && sys.feeding.donor.name === starName) {
        return sys.feeding.donor;
      }
      return (sys.companions || []).find((c) => c.name === starName) || null;
    }

    // Park the ship in orbit of the system's own star (or the black hole that
    // stands in for one) - the star-scale equivalent of teleportToPlanetOrbit.
    // Mutually exclusive with currentPlanet: parking at the star means not
    // orbiting any of its planets. In an N-ary system any individual star
    // (companion or feeding donor included) is a valid `starName` target.
    parkAtStar(systemName, starName) {
      const sys = this.getSystem(systemName);
      if (!sys) return false;
      const rec = this.getStarInSystem(systemName, starName) || sys;
      this.stopTravel(false);
      this.playerShip.currentSystem = systemName;
      this.playerShip.currentPlanet = null;
      this.playerShip.parkedBody = {
        kind: (rec.type === "BLACK_HOLE" || rec.type === "SUPERMASSIVE_BLACK_HOLE") ? "blackhole" : "star",
        name: rec.name || sys.name,
        system: systemName,
      };
      this.currentSystem = systemName;
      this.playerShip.position = { ...sys.position };
      this.playerShip.stoppedMidTravel = false;
      $gameVariables.setValue(96, systemName);
      return true;
    }

    // ------------------------------------------------------------------------
    // Refuelling: parked in orbit of a main-sequence star (O, B, A, F, G, K, M
    // - the seven ordinary stellar classes) tops up Hyperflux. White dwarfs
    // and neutron stars are exotic remnants the ship can't draw Hyperflux
    // from, but a black hole is its own fuel stop: parked there, the same
    // pumps draw Schrodingerite instead (see tickRefuel), so a hole is a
    // second kind of filling station rather than a once-a-week harvest.
    // ------------------------------------------------------------------------
    isMainSequenceStar(sys) {
      return !!sys && MAIN_SEQUENCE_TYPES.has(sys.type);
    }

    canRefuel() {
      const ship = this.playerShip;
      if (!ship || ship.isMoving || !ship.parkedBody) return false;
      if (ship.parkedBody.kind === "blackhole") {
        return this.getSchrodingerite() < SCHRODINGERITE_MAX;
      }
      if (ship.parkedBody.kind !== "star") return false;
      if (this.getHyperflux() >= HYPERFLUX_MAX && this.getMapFuel() >= MAP_FUEL_MAX) return false;
      // parkedBody.system is set when parked at a companion/donor star of an
      // N-ary system; older saves (and primary parks) fall back to the name.
      const rec = this.getStarInSystem(
        ship.parkedBody.system || ship.parkedBody.name, ship.parkedBody.name);
      return this.isMainSequenceStar(rec);
    }

    startRefuel() {
      if (!this.canRefuel()) return false;
      this.playerShip.isRefueling = true;
      return true;
    }

    stopRefuel() {
      this.playerShip.isRefueling = false;
    }

    // Called once per frame from the scene loop with the real-time delta
    // (seconds) - a no-op unless actively refuelling under still-valid
    // conditions (still parked at the same fuel-giving body, not moving).
    // Schrodingerite is stored as a whole-unit integer (see setSchrodingerite),
    // so a per-frame fractional gain is banked on the ship until it rounds up
    // to a whole charge, rather than being floored away every tick.
    tickRefuel(deltaSeconds) {
      const ship = this.playerShip;
      if (!ship || !ship.isRefueling) return;
      if (!this.canRefuel()) { ship.isRefueling = false; return; }
      const dt = Math.max(0, deltaSeconds || 0);
      if (ship.parkedBody.kind === "blackhole") {
        ship._schrodingeriteAccum = (ship._schrodingeriteAccum || 0) +
          SCHRODINGERITE_REFUEL_RATE_PER_SEC * dt;
        const whole = Math.floor(ship._schrodingeriteAccum);
        if (whole > 0) {
          ship._schrodingeriteAccum -= whole;
          this.setSchrodingerite(this.getSchrodingerite() + whole);
        }
        if (this.getSchrodingerite() >= SCHRODINGERITE_MAX) ship.isRefueling = false;
        return;
      }
      this.setHyperflux(this.getHyperflux() + REFUEL_RATE_PER_SEC * dt);
      this.setMapFuel(this.getMapFuel() + MAP_FUEL_REFUEL_RATE_PER_SEC * dt);
      if (this.getHyperflux() >= HYPERFLUX_MAX && this.getMapFuel() >= MAP_FUEL_MAX) {
        ship.isRefueling = false;
      }
    }

    // Real-time seconds left before the pumps top out, for the countdown the
    // travel window shows (see ShipBackground's timer and the HUD's refuel
    // hint). Returns 0 when nothing is left to fill. Independent of whether
    // the pumps are actually running, so the ETA can be quoted before the
    // player commits to the stop.
    refuelEtaSeconds() {
      const ship = this.playerShip;
      if (!ship || !ship.parkedBody) return 0;
      if (ship.parkedBody.kind === "blackhole") {
        const missing = SCHRODINGERITE_MAX - this.getSchrodingerite();
        return Math.max(0, Math.ceil(missing / SCHRODINGERITE_REFUEL_RATE_PER_SEC));
      }
      const flux = Math.max(0, HYPERFLUX_MAX - this.getHyperflux()) / REFUEL_RATE_PER_SEC;
      const map = Math.max(0, MAP_FUEL_MAX - this.getMapFuel()) / MAP_FUEL_REFUEL_RATE_PER_SEC;
      return Math.max(0, Math.ceil(Math.max(flux, map)));
    }

    // The body the pumps are drawing from, for the countdown's caption.
    refuelSourceName() {
      const ship = this.playerShip;
      return (ship && ship.parkedBody && ship.parkedBody.name) || "";
    }

    // ------------------------------------------------------------------------
    // Auto-refuel routing: find the nearest star the ship can actually drink
    // from and plot the course there (see planRefuel / beginAutoRefuel). Used by
    // the HUD's Refuel button and the "Refuel" plugin command.
    // ------------------------------------------------------------------------

    // Every star of a system that can power a refuel: the primary itself, any
    // companion of an N-ary system, and the donor of a feeding X-ray binary.
    // Entries are { star, rec } where `star` is the name to pass to
    // parkAtStar/startTravelToStar (null = the system's own primary).
    refuelStarsInSystem(sys) {
      if (!sys) return [];
      const out = [];
      if (this.isMainSequenceStar(sys)) out.push({ star: null, rec: sys });
      (sys.companions || []).forEach((c) => {
        if (this.isMainSequenceStar(c)) out.push({ star: c.name, rec: c });
      });
      const donor = sys.feeding && sys.feeding.donor;
      if (donor && this.isMainSequenceStar(donor)) out.push({ star: donor.name, rec: donor });
      return out;
    }

    systemHasRefuelStar(sys) {
      return this.refuelStarsInSystem(sys).length > 0;
    }

    /**
     * Nearest system holding a refuellable star, measured from the ship (or
     * `opts.from`). Only systems sharing the ship's coordinate frame are
     * considered: a procedural galaxy's interior uses its own local origin, so
     * comparing its systems against the Milky Way's would be meaningless.
     * @param {{from?:object, excludeSystem?:string}} [opts]
     * @returns {?{systemName:string, starName:?string, starType:string,
     *   distance:number}}
     */
    findNearestRefuelStar(opts) {
      opts = opts || {};
      const ship = this.playerShip;
      const from = opts.from || (ship && ship.position) || { x: 0, y: 0, z: 0 };
      let best = null;
      const consider = (sys) => {
        if (!sys || !sys.position || sys.name === opts.excludeSystem) return;
        const stars = this.refuelStarsInSystem(sys);
        if (!stars.length) return;
        const dx = sys.position.x - from.x;
        const dy = sys.position.y - from.y;
        const dz = (sys.position.z || 0) - (from.z || 0);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (best && d >= best.distance) return;
        best = {
          systemName: sys.name,
          starName: stars[0].star,
          starType: stars[0].rec.type,
          distance: d,
        };
      };

      // Inside a procedural galaxy only that galaxy's own systems are reachable
      // in this frame (see GalaxySim.Math.galaxySeedOfSystemName for the two
      // name shapes that mean "out there").
      const GM = (window.GalaxySim && window.GalaxySim.Math) || {};
      const seedOf = GM.galaxySeedOfSystemName || (() => null);
      const cur = (ship && ship.currentSystem) || this.currentSystem;
      const curSeed = seedOf(cur);
      if (curSeed != null) {
        this.generateGalaxySystems(curSeed).forEach(consider);
        return best;
      }

      // Milky Way: the static/procedural catalog inside the bubble first...
      this.getAllSystems().forEach((sys) => {
        if (seedOf(sys.name) == null) consider(sys);
      });
      // ...then the lazy field in expanding rings of chunks around the ship, so
      // a ship stranded out in the sparse disk still finds something to burn.
      const cx0 = Math.floor(from.x / LAZY_CHUNK_LY);
      const cz0 = Math.floor((from.y || 0) / LAZY_CHUNK_LY);
      for (let ring = 0; ring <= REFUEL_SEARCH_RINGS; ring++) {
        // Anything found closer than this ring's inner edge can't be beaten.
        if (best && best.distance <= ring * LAZY_CHUNK_LY) break;
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dz = -ring; dz <= ring; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            this.generateLazyChunk(cx0 + dx, cz0 + dz).forEach(consider);
          }
        }
      }
      return best;
    }

    /**
     * What the ship should do to top its Hyperflux up from where it is now.
     * @returns {{status:string, starName:?string, starType:?string,
     *   systemName:?string, distance:number, estFuel:number, shortFuel:boolean}}
     *   status: "full"       tank already full
     *           "refuelling" pumps already running
     *           "here"       parked at a usable star: just engage
     *           "local"      a usable star in this very system: short hop
     *           "travel"     nearest usable star is in another system
     *           "none"       nothing refuellable within search range
     */
    planRefuel() {
      const ship = this.playerShip;
      const none = {
        status: "none", starName: null, starType: null, systemName: null,
        distance: 0, estFuel: 0, shortFuel: false,
      };
      if (!ship) return none;
      if (ship.isRefueling) {
        const rec = ship.parkedBody && this.getStarInSystem(
          ship.parkedBody.system || ship.parkedBody.name, ship.parkedBody.name);
        return {
          ...none, status: "refuelling",
          starName: (ship.parkedBody && ship.parkedBody.name) || null,
          starType: (rec && rec.type) || null,
          systemName: ship.currentSystem || null,
        };
      }
      if (this.getHyperflux() >= HYPERFLUX_MAX && this.getMapFuel() >= MAP_FUEL_MAX) {
        return { ...none, status: "full" };
      }

      // Already parked at a fusing star: nothing to plot.
      if (this.canRefuel()) {
        const rec = this.getStarInSystem(
          ship.parkedBody.system || ship.parkedBody.name, ship.parkedBody.name);
        return {
          ...none, status: "here",
          starName: ship.parkedBody.name,
          starType: (rec && rec.type) || null,
          systemName: ship.currentSystem || null,
        };
      }

      // The star of the system the ship is already in wins over any neighbour.
      const here = this.getSystem(ship.currentSystem);
      const local = this.refuelStarsInSystem(here)[0];
      if (local && !ship.isMoving) {
        return {
          ...none, status: "local",
          starName: local.star || (here && here.name) || null,
          starType: local.rec.type,
          systemName: here.name,
        };
      }

      const near = this.findNearestRefuelStar();
      if (!near) return none;
      // Burn estimate for the hop: the drain is speed^2 * 0.01 per second over
      // distance / speed seconds, i.e. distance * speed * 0.01 (see
      // updateShipPosition), so warp speed trades arrival time for Hyperflux.
      const speed = ($gameVariables && $gameVariables.value(94)) || 1;
      const estFuel = near.distance * speed * 0.01;
      return {
        status: "travel",
        starName: near.starName || near.systemName,
        starType: near.starType,
        systemName: near.systemName,
        distance: near.distance,
        estFuel,
        shortFuel: estFuel > this.getHyperflux(),
      };
    }

    /**
     * Act on planRefuel: engage the pumps if the ship is already parked at a
     * fusing star, otherwise auto-plot the course to the nearest one and arm
     * the arrival hand-off (autoRefuelOnArrival, see updateShipPosition).
     * @returns {object} the plan, with `started` / `plotted` set
     */
    beginAutoRefuel() {
      const plan = this.planRefuel();
      plan.started = false;
      plan.plotted = false;
      if (plan.status === "here") {
        plan.started = this.startRefuel();
        return plan;
      }
      if (plan.status === "local" || plan.status === "travel") {
        const ok = this.startTravelToStar(plan.systemName, plan.starName) ||
          this.startTravelToSystem(plan.systemName);
        if (ok) {
          // Arrival parks in the fuel star's orbit even if the star lookup fell
          // through to a plain system course.
          this.playerShip.targetStar = plan.starName || this.playerShip.targetStar;
          this.playerShip.autoRefuelOnArrival = true;
          plan.plotted = true;
        }
      }
      return plan;
    }

    // ------------------------------------------------------------------------
    // Schrödingerite harvesting: only while parked at a black hole, gated by a
    // once-per-game-week-per-hole cooldown so it can't be farmed by repeatedly
    // parking/unparking. Cooldown timestamps (in game-minutes, variable 114)
    // are keyed by black hole system name and persisted on $gameSystem, same
    // convention as the bookmark store (_bookmarks).
    // ------------------------------------------------------------------------
    _schrodingeriteHarvestStore() {
      if (!$gameSystem._bhSchrodingeriteHarvest) $gameSystem._bhSchrodingeriteHarvest = {};
      return $gameSystem._bhSchrodingeriteHarvest;
    }

    schrodingeriteCooldownRemaining(name) {
      if (!name) return 0;
      const last = this._schrodingeriteHarvestStore()[name];
      if (last == null) return 0;
      const now = ($gameVariables && $gameVariables.value(114)) || 0;
      return Math.max(0, SCHRODINGERITE_HARVEST_COOLDOWN_MIN - (now - last));
    }

    canHarvestSchrodingerite() {
      const ship = this.playerShip;
      if (!ship || ship.isMoving || !ship.parkedBody || ship.parkedBody.kind !== "blackhole") return false;
      if (ship.harvestRun) return false; // a run is already under way
      return this.schrodingeriteCooldownRemaining(ship.parkedBody.name) <= 0;
    }

    // A harvest is a timed flyby, not an instant grab: this only opens the
    // run (SCHRODINGERITE_HARVEST_SECONDS of skimming the disk), and
    // tickSchrodingeriteHarvest is what finally banks the charges.
    beginSchrodingeriteHarvest() {
      if (!this.canHarvestSchrodingerite()) return false;
      this.playerShip.harvestRun = {
        name: this.playerShip.parkedBody.name,
        elapsed: 0,
      };
      return true;
    }

    isHarvestingSchrodingerite() {
      return !!(this.playerShip && this.playerShip.harvestRun);
    }

    // 0..1 across the flyby, or 0 when no run is under way.
    schrodingeriteHarvestProgress() {
      const run = this.playerShip && this.playerShip.harvestRun;
      if (!run) return 0;
      return Math.max(0, Math.min(1, run.elapsed / SCHRODINGERITE_HARVEST_SECONDS));
    }

    schrodingeriteHarvestRemaining() {
      const run = this.playerShip && this.playerShip.harvestRun;
      if (!run) return 0;
      return Math.max(0, Math.ceil(SCHRODINGERITE_HARVEST_SECONDS - run.elapsed));
    }

    cancelSchrodingeriteHarvest() {
      if (this.playerShip) this.playerShip.harvestRun = null;
    }

    /**
     * Advance an open harvest run by the real-time delta (seconds). Breaking
     * the flyby - leaving the hole's orbit or getting under way - aborts the
     * run with nothing gained. Returns true on the tick that completes it.
     */
    tickSchrodingeriteHarvest(deltaSeconds) {
      const ship = this.playerShip;
      const run = ship && ship.harvestRun;
      if (!run) return false;
      if (ship.isMoving || !ship.parkedBody || ship.parkedBody.kind !== "blackhole" ||
        ship.parkedBody.name !== run.name) {
        ship.harvestRun = null;
        return false;
      }
      run.elapsed += Math.max(0, deltaSeconds || 0);
      if (run.elapsed < SCHRODINGERITE_HARVEST_SECONDS) return false;
      ship.harvestRun = null;
      const now = ($gameVariables && $gameVariables.value(114)) || 0;
      this._schrodingeriteHarvestStore()[run.name] = now;
      this.setSchrodingerite(this.getSchrodingerite() + SCHRODINGERITE_HARVEST_AMOUNT);
      return true;
    }

    // Kept for anything that wants the whole run resolved in one call (the
    // flyby is skipped): begins and immediately completes a harvest.
    harvestSchrodingerite() {
      if (!this.beginSchrodingeriteHarvest()) return false;
      return this.tickSchrodingeriteHarvest(SCHRODINGERITE_HARVEST_SECONDS);
    }

    // A warp change restarts the clock from where the ship is now, so the new
    // speed applies to the rest of the route instead of retroactively to the
    // part already flown. The trip ORIGIN is deliberately left alone: it is
    // what the star map draws the ship's position along, and rebasing it made
    // the craft jump back to the system it departed from.
    recalculateDepartureOnSpeedChange() {
      if (!this.playerShip.isMoving || !this.playerShip.departureTime) {
        return;
      }

      // A course plotted before origins were tracked keeps its true start.
      if (!this.playerShip.originPosition && this.playerShip.departurePosition) {
        this.playerShip.originPosition = { ...this.playerShip.departurePosition };
        this.playerShip.originDistance = this.playerShip.travelDistance;
      }

      this.playerShip.departurePosition = {
        x: this.playerShip.position.x,
        y: this.playerShip.position.y,
        z: this.playerShip.position.z,
      };

      this.playerShip.departureTime = Date.now();
      this.playerShip.lastFuelTime = this.playerShip.departureTime;

      const remainingDx = this.playerShip.targetPosition.x - this.playerShip.position.x;
      const remainingDy = this.playerShip.targetPosition.y - this.playerShip.position.y;
      const remainingDz = this.playerShip.targetPosition.z - this.playerShip.position.z;
      this.playerShip.travelDistance = Math.sqrt(
        remainingDx * remainingDx + remainingDy * remainingDy + remainingDz * remainingDz
      );
    }

    updateShipAtPlanet() {
      // If ship is stationary at a planet, keep it centered on the planet as it moves
      if (this.playerShip.isMoving || !this.playerShip.currentPlanet) {
        return;
      }

      const currentSystem = this.getSystem(this.playerShip.currentSystem);
      if (!currentSystem) return;

      const planet = currentSystem.planets.find((p) => p.name === this.playerShip.currentPlanet);
      if (!planet || !planet.orbitRadius) {
        // If no planet found, center on star
        this.playerShip.position = {
          x: currentSystem.position.x,
          y: currentSystem.position.y,
          z: currentSystem.position.z,
        };
        return;
      }

      // Get the planet's current position
      const time = Date.now() * 0.0001;
      const basePhase = planet.basePhase || 0;
      const planetAngle = basePhase + time * (planet.orbitSpeed || 1);
      const planetOrbitRadius = planet.orbitRadius || 1;

      const isEccentric = planet.type === "rogue" || planet.type === "comet" ||
        planet.type === "short_period_comet" || planet.type === "long_period_comet";

      let planetX, planetY;

      if (isEccentric) {
        const eccentricity = 0.6;
        const a = planetOrbitRadius;
        const b = a * Math.sqrt(1 - eccentricity * eccentricity);
        const c_offset = a * eccentricity;
        planetX = currentSystem.position.x + c_offset + Math.cos(planetAngle) * a;
        planetY = currentSystem.position.y + Math.sin(planetAngle) * b;
      } else {
        planetX = currentSystem.position.x + Math.cos(planetAngle) * planetOrbitRadius;
        planetY = currentSystem.position.y + Math.sin(planetAngle) * planetOrbitRadius;
      }

      // Update planet's phase for rendering
      planet.phase = planetAngle;

      // Place ship at planet's center (overlay)
      this.playerShip.position = {
        x: planetX,
        y: planetY,
        z: currentSystem.position.z,
      };
    }

    updateShipOrbit() {
      const currentSystem = this.getSystem(this.playerShip.currentSystem);
      if (!currentSystem) return;

      const time = Date.now() * 0.0002;
      const orbitRadius = this.playerShip.orbitRadius;

      if (this.playerShip.currentPlanet) {
        const planet = currentSystem.planets.find((p) => p.name === this.playerShip.currentPlanet);
        if (planet && planet.orbitRadius) {
          const planetAngle = planet.phase || 0;
          const planetOrbitRadius = planet.orbitRadius || 1;

          const isEccentric = planet.type === "rogue" || planet.type === "comet" ||
            planet.type === "short_period_comet" || planet.type === "long_period_comet";

          let planetX, planetY;

          if (isEccentric) {
            const eccentricity = 0.6;
            const a = planetOrbitRadius;
            const b = a * Math.sqrt(1 - eccentricity * eccentricity);
            const c_offset = a * eccentricity;

            planetX = currentSystem.position.x + c_offset + Math.cos(planetAngle) * a;
            planetY = currentSystem.position.y + Math.sin(planetAngle) * b;
          } else {
            planetX = currentSystem.position.x + Math.cos(planetAngle) * planetOrbitRadius;
            planetY = currentSystem.position.y + Math.sin(planetAngle) * planetOrbitRadius;
          }

          const orbitAngle = time * 4;
          this.playerShip.position = {
            x: planetX + Math.cos(orbitAngle) * orbitRadius,
            y: planetY + Math.sin(orbitAngle) * orbitRadius,
            z: currentSystem.position.z,
          };
        }
      } else {
        const orbitAngle = time;
        this.playerShip.position = {
          x: currentSystem.position.x + Math.cos(orbitAngle) * orbitRadius * 2,
          y: currentSystem.position.y + Math.sin(orbitAngle) * orbitRadius * 2,
          z: currentSystem.position.z,
        };
      }
    }

    getShipPosition() {
      return this.playerShip.position;
    }

    isShipMoving() {
      return this.playerShip.isMoving;
    }

    getTargetSystem() {
      return this.playerShip.targetSystem;
    }

    loadSystems() {
      Object.keys(SYSTEMS).forEach((key) => {
        const systemData = SYSTEMS[key];
        const system = {
          name: systemData.name,
          type: systemData.type,
          color: STAR_COLORS[systemData.type] || "#ffffff",
          position: systemData.position,
          mass: systemData.mass,
          radius: systemData.radius,
          temperature: systemData.temperature,
          luminosity: systemData.luminosity || this.calculateLuminosity(systemData),
          binary: systemData.binary || false,
          // Authored companion stars ({ name, type, mass, radius, temperature,
          // orbitRadius(AU) }): each is a selectable, travelable arrival target.
          companions: this._normalizeCompanions(systemData.companions),
          // Dyson shell around the star: "active" (Zeta Reticuli) or "abandoned".
          dyson: systemData.dyson || null,
          // X-ray binary: a compact object stripping a donor star.
          feeding: this._normalizeFeeding(systemData.feeding),
          // ROGUE_PLANET systems: the type of the lone dark world itself.
          planetType: systemData.planetType || null,
          // Drawn debris belts ({ innerAu, outerAu, count, thickness, gapsAu }):
          // the asteroid and Kuiper belts (see Scene3DBodies.buildSystem).
          belts: systemData.belts || null,
          // A system authored inside ANOTHER galaxy names it here (a key of
          // LocalGroupGalaxies.json). Its `position` is then read as a position
          // in that galaxy's own disk, not in the Milky Way, and it is
          // registered under that galaxy's naming convention below.
          galaxy: systemData.galaxy || null,
          hardcoded: !systemData.galaxy,
          planets: [],
        };

        if (systemData.planets && systemData.planets.length > 0) {
          systemData.planets.forEach((planet, index) => {
            const planetTypeData = PLANET_TYPES[planet.type];

            const newPlanet = {
              name: planet.name || `${system.name} ${String.fromCharCode(65 + index)}`,
              type: planet.type,
              color: PLANET_COLORS[planet.type] || "#888888",
              orbitRadius: planet.orbitRadius,
              radius: planet.radius || 1.0,
              mass: planet.mass,
              period: Math.sqrt(Math.pow(planet.orbitRadius, 3) / system.mass) * 365,
              // An authored phase pins a body to a spot on its orbit (a
              // co-orbital riding beside Earth, a Counter-Earth behind the Sun);
              // everything else is scattered.
              phase: typeof planet.phase === "number"
                ? planet.phase : Math.random() * Math.PI * 2,
              atmosphere: planet.atmosphere !== false,
              // Hand-authored landing spots ({ name, mapId, x, y }): a planet with
              // any gets a star marker and a location list in its orbit panel.
              landingLocations: planet.landingLocations || null,
              // Authored life, read by GalaxySim.planetHasLife instead of the
              // seeded 10% roll: some worlds are inhabited because they are.
              life: planet.life === true ? true : undefined,
              // Flavour + special-body flags carried straight from the data:
              //   note        one paragraph shown on the selection panel
              //   artificial  built, not formed: "probe" | "teapot" |
              //               "monolith" | "telescope" (see Renderer3D)
              //   probeStyle  which spacecraft an artificial probe is modelled on
              //   hubble      carries a servicing state (GalaxySim.Hubble)
              //   noLanding   nothing to put a landing party on
              //   debris      orbital debris shell, e.g. "kessler"
              note: planet.note || null,
              artificial: planet.artificial || null,
              probeStyle: planet.probeStyle || null,
              hubble: !!planet.hubble,
              noLanding: !!planet.noLanding,
              debris: planet.debris || null,
              moons: [],
            };

            if (planet.moons && planet.moons.length > 0) {
              planet.moons.forEach((moon, moonIndex) => {
                const planetMassInSolar = newPlanet.mass / 333000.0;

                newPlanet.moons.push({
                  name: moon.name || `${newPlanet.name} ${String.fromCharCode(97 + moonIndex)}`,
                  type: moon.type,
                  color: PLANET_COLORS[moon.type] || "#888888",
                  orbitRadius: moon.orbitRadius,
                  radius: moon.radius || 0.27,
                  mass: moon.mass,
                  period: Math.sqrt(Math.pow(moon.orbitRadius, 3) / planetMassInSolar) * 365,
                  phase: typeof moon.phase === "number"
                    ? moon.phase : Math.random() * Math.PI * 2,
                  atmosphere: moon.atmosphere === true,
                  landingLocations: moon.landingLocations || null,
                  note: moon.note || null,
                  // A moon that only exists on a Friday (Earth's second and
                  // third): the calendar takes it out of this array and puts
                  // it back, see GalaxySim.FridayMoons in GalaxySim_Core.
                  friday: moon.friday === true ? true : undefined,
                });
              });
            }

            system.planets.push(newPlanet);
          });
        }

        if (system.galaxy) {
          this._registerFarSystem(system);
        } else {
          this.systems.set(systemData.name, system);
          this.hardcodedSystems.add(systemData.name);
        }
      });

      this.generateFamousNebulaSystems();

      // The table has just been rebuilt from the file, so whatever the
      // calendar had written over it is gone with it (see _syncTimeline).
      this._nibiruKey = null;
      // The Friday moons come back with the freshly loaded data, so the state
      // the calendar last applied has to be re-decided from scratch too.
      this._fridayKey = null;
      this._fridayMoonStash = null;

      console.log(`Loaded ${this.systems.size} hardcoded star systems from GalaxyData`);
    }

    // ------------------------------------------------------------------------
    // Stellar modifiers: companion stars (binary .. quaternary), feeding
    // compact objects and abandoned Dyson shells. Shared by the hardcoded
    // loader (which normalizes authored data) and every procedural generator
    // (which rolls them from its own deterministic rng).
    // ------------------------------------------------------------------------
    _makeCompanionStar(name, type, rng, orbitRadius) {
      const d = STAR_TYPES[type] || STAR_TYPES.M;
      return {
        name,
        type,
        color: STAR_COLORS[type] || "#ffffff",
        mass: rng.range(d.mass[0], d.mass[1]),
        radius: rng.range(d.radius[0], d.radius[1]),
        temperature: rng.range(d.temp[0], d.temp[1]),
        orbitRadius,
      };
    }

    _normalizeCompanions(companions) {
      if (!companions || !companions.length) return null;
      return companions.map((c) => ({
        name: c.name,
        type: c.type,
        color: STAR_COLORS[c.type] || "#ffffff",
        mass: c.mass || 0.5,
        radius: c.radius || 0.5,
        temperature: c.temperature || 4000,
        orbitRadius: c.orbitRadius || 20,
      }));
    }

    _normalizeFeeding(feeding) {
      if (!feeding || !feeding.donor) return null;
      const d = feeding.donor;
      return {
        donor: {
          name: d.name,
          type: d.type,
          color: STAR_COLORS[d.type] || "#ffffff",
          mass: d.mass || 10,
          radius: d.radius || 10,
          temperature: d.temperature || 10000,
          orbitRadius: d.orbitRadius || 0.5,
        },
      };
    }

    // Roll companions / feeding donors / derelict Dyson shells for a freshly
    // generated procedural system. Deterministic: consumes only the caller's
    // seeded rng. ROGUE_PLANET systems are lone dark worlds and skip all of it.
    // ------------------------------------------------------------------------
    // Strange systems: what the far cosmic web does to a star system.
    // ------------------------------------------------------------------------
    // Every procedural system carries a TIER, 0 to 15, read straight off its
    // own name (GalaxySim.Math.Strangeness): 0 in the Local Group, 15 out at
    // the rim of the observable universe. Tier 0 to 2 is ordinary physics and
    // generates exactly what it always did. Above that the system may be built
    // to one of the ARCHETYPES below instead, and the archetypes get stranger
    // and more likely the further out the player has gone.
    //
    // Each archetype is a whole system's worth of decisions, not a modifier
    // sprinkled on top, so a player who travels far enough finds places that
    // could not exist here: a ring of twenty worlds sharing one orbit, a
    // system of nothing but gardens, a knot of nine stars with planets threading
    // between them. That is the point of the far web, and it is why the web is
    // worth crossing.
    //
    // All of it is deterministic from the system's name: the same star out
    // there is the same star on the next visit, and on the next save.
    // ------------------------------------------------------------------------
    _strangeTier(name) {
      const S = window.GalaxySim.Math && window.GalaxySim.Math.Strangeness;
      return S ? S.tierOfSystemName(name) : 0;
    }

    // The plan for one system: which archetype (if any), how many planets, and
    // what the orbits are allowed to do. Consumes the rng in a fixed order so
    // the stream never desyncs between visits.
    _strangePlan(tier, rng) {
      const plan = {
        tier,
        archetype: null,
        planetChance: 0.3,
        minPlanets: 1,
        maxPlanets: 8,
        typePool: null,       // null = every type, as at home
        extraStars: 0,
        tilt: 0,              // radians of orbital inclination allowed
        retrograde: 0,        // share of worlds running backwards
        shuffleOrbits: false, // orbit radii no longer increase outward
        coOrbital: false,     // everything on ONE orbit
        inverted: false,      // giants innermost, pebbles outermost
      };
      if (tier <= 2) return plan;

      // How often the far web bothers to be strange at all: about a third of
      // systems at tier 3, nearly all of them at the rim.
      const odds = Math.min(0.95, (tier - 2) * 0.09);
      const roll = rng.random();
      // Even an ordinary far system is not quite flat or quite tidy.
      plan.planetChance = Math.min(0.85, 0.3 + tier * 0.035);
      plan.tilt = Math.min(1.5, (tier - 2) * 0.09);
      plan.retrograde = Math.min(0.45, (tier - 2) * 0.03);
      plan.maxPlanets = 8 + Math.round((tier - 2) * 0.8);
      if (roll >= odds) return plan;

      // Pick the archetype. The list is ordered by how far out it starts, and
      // the choice is taken from the ones this tier has unlocked, so the rim
      // can still throw up a merely tilted system and home never throws up a
      // ring of gardens.
      const unlocked = STRANGE_ARCHETYPES.filter((a) => tier >= a.from);
      if (!unlocked.length) return plan;
      const pick = unlocked[rng.int(0, unlocked.length - 1)];
      plan.archetype = pick.key;
      pick.apply(plan, tier, rng);
      return plan;
    }

    // Rebuild the orbits of a finished system to the plan. Runs after the
    // planets exist, so every archetype works on the same shape of data.
    _applyStrangeOrbits(system, plan, rng) {
      const planets = system.planets || [];
      if (!planets.length || !plan) return system;

      if (plan.coOrbital) {
        // One orbit, shared: the worlds are strung around a single ring, each
        // at its own point on it. A real system cannot hold this together;
        // out there something does.
        const shared = rng.range(0.6, 6);
        planets.forEach((p, i) => {
          p.orbitRadius = shared;
          p.phase = (i / planets.length) * Math.PI * 2;
        });
      } else if (plan.inverted) {
        // Sorted the wrong way round: the giants crowd the star and the
        // pebbles are flung out past where a system should end.
        const radii = planets.map((p) => p.orbitRadius).sort((a, b) => a - b);
        const byMass = planets.slice().sort((a, b) => b.mass - a.mass);
        byMass.forEach((p, i) => { p.orbitRadius = radii[i]; });
      } else if (plan.shuffleOrbits) {
        // The same radii, redealt: orbits cross, and a year is no longer a
        // measure of how far out a world sits.
        const radii = planets.map((p) => p.orbitRadius);
        for (let i = radii.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          const t = radii[i]; radii[i] = radii[j]; radii[j] = t;
        }
        planets.forEach((p, i) => { p.orbitRadius = radii[i]; });
      }

      // Tilt and direction. `inclination` and `retrograde` are read by the 3D
      // system view; at home neither is ever set, and the view keeps its own
      // small solar-system-like tilt.
      planets.forEach((p) => {
        if (plan.tilt > 0) p.inclination = (rng.random() - 0.5) * 2 * plan.tilt;
        if (plan.retrograde > 0 && rng.random() < plan.retrograde) p.retrograde = true;
        p.period = Math.sqrt(Math.pow(Math.max(0.01, p.orbitRadius), 3) /
          Math.max(0.02, system.mass)) * 365;
      });
      return system;
    }

    _applyStellarModifiers(system, rng) {
      if (!system || NO_MODIFIER_TYPES.has(system.type)) return system;

      // Compact accretors: a share are caught actively feeding on a rare star.
      if (FEEDING_ACCRETOR_TYPES.has(system.type)) {
        if (!system.feeding && rng.random() < 0.35) {
          const donorType = FEEDING_DONOR_TYPES[rng.int(0, FEEDING_DONOR_TYPES.length - 1)];
          system.feeding = {
            donor: this._makeCompanionStar(
              system.name + " Donor", donorType, rng, rng.range(0.3, 1.2)),   // i18n-ignore: body id
          };
          system.binary = true;
        }
        return system;
      }

      // Multi-star systems: ~22% get a companion, each with a decent chance of
      // one more (trinary/quaternary), on widening orbits.
      if (!system.companions) {
        const letters = ["B", "C", "D"];
        const comps = [];
        let orbit = rng.range(12, 30);
        let chance = system.binary ? 1 : 0.22; // honor a pre-rolled binary flag
        for (let i = 0; i < letters.length; i++) {
          if (rng.random() >= chance) break;
          const type = COMPANION_TYPES[rng.int(0, COMPANION_TYPES.length - 1)];
          comps.push(this._makeCompanionStar(system.name + " " + letters[i], type, rng, orbit));
          orbit *= rng.range(1.8, 2.6);
          chance = 0.3;
        }
        if (comps.length) system.companions = comps;
      }
      system.binary = !!(system.companions && system.companions.length);

      // A vanishingly rare derelict megastructure around ordinary stars.
      if (!system.dyson && MAIN_SEQUENCE_TYPES.has(system.type) &&
          rng.random() < ABANDONED_DYSON_CHANCE) {
        system.dyson = "abandoned";
      }
      return system;
    }

    // ROGUE_PLANET "systems" have no star at all: pick what kind of lone dark
    // world it is, and make sure nothing orbits it.
    _finishRoguePlanet(system, rng) {
      const kinds = ["gas_giant", "ice_giant", "rocky", "ice"];
      system.planetType = system.planetType || kinds[rng.int(0, kinds.length - 1)];
      system.planets = [];
      system.binary = false;
      return system;
    }

    // ------------------------------------------------------------------------
    // Famous real-world nebulae (see GalaxySim_Scene3D_Cosmos.FAMOUS_NEBULAE):
    // a handful get a couple of named, hardcoded stars registered here so the
    // Catalog's "Star Systems" list, travel and picking all treat them like
    // any other star. Entries with an `anchorStar` (Orion Nebula <-> Hatsya,
    // Horsehead <-> Alnitak, ...) already have that star in Systems.json, but
    // may still carry extra starsSpec entries (embedded protostars) generated
    // around the anchor's position. Idempotent: safe to call more than once
    // (e.g. a save that already ran this once).
    // ------------------------------------------------------------------------
    generateFamousNebulaSystems() {
      const cosmos = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
      if (!cosmos || !cosmos.FAMOUS_NEBULAE || !cosmos.galLB) return;
      cosmos.FAMOUS_NEBULAE.forEach((spec) => {
        if (!spec.starsSpec || !spec.starsSpec.length) return;
        const anchor = spec.anchorStar ? this.systems.get(spec.anchorStar) : null;
        const center = (anchor && anchor.position) || cosmos.galLB(spec.l, spec.b, spec.d);
        const jitter = (spec.size || 20) * 0.5;
        const rng = new RandomGenerator("NEB:" + spec.name);
        spec.starsSpec.forEach((star) => {
          if (this.systems.has(star.name)) return;
          const position = {
            x: center.x + (rng.random() - 0.5) * jitter,
            y: center.y + (rng.random() - 0.5) * jitter,
            z: center.z + (rng.random() - 0.5) * jitter * 0.6,
          };
          const sys = {
            name: star.name,
            type: star.type,
            color: STAR_COLORS[star.type] || "#ffffff",
            position,
            mass: star.mass,
            radius: star.radius,
            temperature: star.temperature,
            luminosity: this.calculateLuminosity({ mass: star.mass, radius: star.radius }),
            binary: false,
            hardcoded: true,
            nebula: spec.name,
            planets: [],
          };
          this.systems.set(star.name, sys);
          this.hardcodedSystems.add(star.name);
        });
      });
    }

    generateProceduralSystems() {
      if (this.proceduralGenerated) {
        console.log("Procedural systems already generated, skipping...");
        return;
      }
      
      if (this.systems.size === 0) this.loadSystems();

      const MOON_INVALID_PLANET_TYPES = new Set([
        "gas_giant", "hot_jupiter", "warm_jupiter", "cold_jupiter", "ice_giant",
        "ringed_gas_giant", "magnetar", "comet", "short_period_comet", "long_period_comet",
        "asteroid", "c_type_asteroid", "s_type_asteroid", "m_type_asteroid", "trojan_asteroid",
      ]);

      const moonTypePool = Object.keys(PLANET_TYPES).filter((type) => !MOON_INVALID_PLANET_TYPES.has(type));
      const rng = new RandomGenerator(this.proceduralSeed);

      const volume = (4 / 3) * Math.PI * Math.pow(MAP_RADIUS, 3);
      const numProceduralSystems = Math.floor(volume * SYSTEM_DENSITY);

      console.log(`Generating ${numProceduralSystems} procedural systems for the first time...`);

      // freq * 20000 with a floor of 1 keeps the common classes dominant while
      // guaranteeing every rare/theoretical type at least a sliver of the pool
      // (at * 1000, anything under freq 0.0005 rounded to zero and could
      // never spawn at all). A frequency of exactly zero is the exception: it
      // means the class does not occur in nature at all and is only ever
      // authored onto a system (the esoteric objects a patron's world orbits).
      const starTypePool = buildStarTypePool();

      // Distribute stars in a flattened galactic disk rather than a uniform
      // sphere: x/y fill the disk plane (uniform by area), while z is a thin
      // gaussian-ish scatter around the plane (scale height ~6% of the radius).
      // This reads as a believable lens in true 3D instead of a round blob,
      // and leaves the 2D fallback (which only uses x/y) unchanged.
      const DISK_SCALE_HEIGHT = MAP_RADIUS * 0.06;
      for (let i = 0; i < numProceduralSystems; i++) {
        const theta = rng.random() * Math.PI * 2;
        const rPlane = Math.sqrt(rng.random()) * MAP_RADIUS;

        const x = rPlane * Math.cos(theta);
        const y = rPlane * Math.sin(theta);
        // Sum of three uniforms ~ approx normal; thin the disk slightly toward
        // the rim so it tapers like a real galactic plane.
        const gaussian = (rng.random() + rng.random() + rng.random() - 1.5) / 1.5;
        const edgeTaper = 1 - 0.5 * (rPlane / MAP_RADIUS);
        const z = gaussian * DISK_SCALE_HEIGHT * edgeTaper;

        let tooClose = false;
        for (const [name, system] of this.systems) {
          const dx = system.position.x - x;
          const dy = system.position.y - y;
          const dz = (system.position.z || 0) - z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 2) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const starType = starTypePool[rng.int(0, starTypePool.length - 1)];
        const starData = STAR_TYPES[starType];

        const mass = rng.range(starData.mass[0], starData.mass[1]);
        const radius = rng.range(starData.radius[0], starData.radius[1]);
        const temperature = rng.range(starData.temp[0], starData.temp[1]);

        const namePrefix = starType === "ROGUE_PLANET" ? "Rogue" : starType;   // i18n-ignore: designation prefix
        const system = {
          name: `${namePrefix}-${i.toString().padStart(4, "0")}`,
          type: starType,
          color: STAR_COLORS[starType],
          position: { x, y, z },
          mass: mass,
          radius: radius,
          temperature: temperature,
          luminosity: this.calculateLuminosity({ mass, radius }),
          binary: false,
          hardcoded: false,
          planets: [],
        };
        if (starType === "ROGUE_PLANET") this._finishRoguePlanet(system, rng);
        else this._applyStellarModifiers(system, rng);

        if (starType !== "ROGUE_PLANET" && rng.random() < 0.3) {
          const numPlanets = rng.int(1, 8);
          const planetTypes = Object.keys(PLANET_TYPES);

          for (let p = 0; p < numPlanets; p++) {
            const planetType = planetTypes[rng.int(0, planetTypes.length - 1)];
            const planetData = PLANET_TYPES[planetType];

            const planet = {
              name: `${system.name} ${String.fromCharCode(97 + p)}`,
              type: planetType,
              color: PLANET_COLORS[planetType] || "#888888",
              orbitRadius: rng.range(0.1, 10) * (p + 1) * 0.4,
              radius: rng.range(0.5, 3),
              mass: rng.range(planetData.minMass, planetData.maxMass),
              period: 0,
              phase: rng.random() * Math.PI * 2,
              atmosphere: rng.random() < 0.5,
              moons: [],
            };

            planet.period = Math.sqrt(Math.pow(planet.orbitRadius, 3) / system.mass) * 365;

            const moonChance = 0.1 + planet.mass / 20.0;

            if (rng.random() < moonChance && moonTypePool.length > 0) {
              const numMoons = rng.int(1, 4);
              let lastMoonOrbit = rng.range(0.001, 0.003);

              for (let m = 0; m < numMoons; m++) {
                const moonType = moonTypePool[rng.int(0, moonTypePool.length - 1)];
                const moonData = PLANET_TYPES[moonType];

                const moonOrbitRadius = lastMoonOrbit + rng.range(0.001, 0.004);
                lastMoonOrbit = moonOrbitRadius;

                const moonMass = rng.range(moonData.minMass, moonData.maxMass) * 0.05;
                const moonRadius = rng.range(0.1, 0.4);
                const planetMassInSolar = planet.mass / 333000.0;

                const moon = {
                  name: `${planet.name} ${String.fromCharCode(97 + m)}`,
                  type: moonType,
                  color: PLANET_COLORS[moonType] || "#888888",
                  orbitRadius: moonOrbitRadius,
                  radius: moonRadius,
                  mass: moonMass,
                  period: Math.sqrt(Math.pow(moonOrbitRadius, 3) / planetMassInSolar) * 365,
                  phase: rng.random() * Math.PI * 2,
                  atmosphere: false,
                };
                planet.moons.push(moon);
              }
            }

            system.planets.push(planet);
          }
        }

        this.systems.set(system.name, system);
      }

      this.proceduralGenerated = true;
      console.log(`Total systems: ${this.systems.size} (${this.hardcodedSystems.size} hardcoded, ${this.systems.size - this.hardcodedSystems.size} procedural)`);
    }

    generateSingleProceduralSystem(x, y, z, name, rng) {
      const MOON_INVALID_PLANET_TYPES = new Set([
        "gas_giant", "hot_jupiter", "warm_jupiter", "cold_jupiter", "ice_giant",
        "ringed_gas_giant", "magnetar", "comet", "short_period_comet", "long_period_comet",
        "asteroid", "c_type_asteroid", "s_type_asteroid", "m_type_asteroid", "trojan_asteroid",
      ]);

      const moonTypePool = Object.keys(PLANET_TYPES).filter((type) => !MOON_INVALID_PLANET_TYPES.has(type));

      const starTypePool = buildStarTypePool();

      const starType = starTypePool[rng.int(0, starTypePool.length - 1)];
      const starData = STAR_TYPES[starType];

      const mass = rng.range(starData.mass[0], starData.mass[1]);
      const radius = rng.range(starData.radius[0], starData.radius[1]);
      const temperature = rng.range(starData.temp[0], starData.temp[1]);

      const system = {
        name: name,
        type: starType,
        color: STAR_COLORS[starType],
        position: { x, y, z },
        mass: mass,
        radius: radius,
        temperature: temperature,
        luminosity: this.calculateLuminosity({ mass, radius }),
        binary: false,
        hardcoded: false,
        planets: [],
      };
      // How strange this place is allowed to be, read off its own name: 0 at
      // home, up to 15 out at the rim of the cosmic web. See _strangePlan.
      const tier = this._strangeTier(name);
      const plan = this._strangePlan(tier, rng);
      system.strangeTier = tier;
      if (plan.archetype) system.strangeArchetype = plan.archetype;

      if (starType === "ROGUE_PLANET") this._finishRoguePlanet(system, rng);
      else this._applyStellarModifiers(system, rng);

      // A crowded system is knotted with far more stars than the ordinary
      // 22% companion roll would ever give it.
      if (plan.extraStars > 0 && starType !== "ROGUE_PLANET") {
        const comps = system.companions || [];
        for (let c = 0; c < plan.extraStars; c++) {
          const type = COMPANION_TYPES[rng.int(0, COMPANION_TYPES.length - 1)];
          comps.push(this._makeCompanionStar(
            system.name + " " + String.fromCharCode(66 + comps.length), type, rng,
            rng.range(6, 90)));
        }
        system.companions = comps;
        system.binary = true;
      }

      if (starType !== "ROGUE_PLANET" && rng.random() < plan.planetChance) {
        const numPlanets = rng.int(plan.minPlanets, Math.max(plan.minPlanets, plan.maxPlanets));
        const planetTypes = plan.typePool && plan.typePool.length
          ? plan.typePool : Object.keys(PLANET_TYPES);

        for (let p = 0; p < numPlanets; p++) {
          const planetType = planetTypes[rng.int(0, planetTypes.length - 1)];
          const planetData = PLANET_TYPES[planetType];

          const planet = {
            name: `${system.name} ${String.fromCharCode(98 + p)}`,
            type: planetType,
            color: PLANET_COLORS[planetType] || "#888888",
            orbitRadius: rng.range(0.1, 10) * (p + 1) * 0.4,
            radius: rng.range(0.5, 3),
            mass: rng.range(planetData.minMass, planetData.maxMass),
            period: 0,
            phase: rng.random() * Math.PI * 2,
            atmosphere: rng.random() < 0.5,
            moons: [],
          };

          planet.period = Math.sqrt(Math.pow(planet.orbitRadius, 3) / system.mass) * 365;

          const moonChance = 0.1 + planet.mass / 20.0;

          if (rng.random() < moonChance && moonTypePool.length > 0) {
            const numMoons = rng.int(1, 4);
            let lastMoonOrbit = rng.range(0.001, 0.003);

            for (let m = 0; m < numMoons; m++) {
              const moonType = moonTypePool[rng.int(0, moonTypePool.length - 1)];
              const moonData = PLANET_TYPES[moonType];

              const moonOrbitRadius = lastMoonOrbit + rng.range(0.001, 0.004);
              lastMoonOrbit = moonOrbitRadius;

              const moonMass = rng.range(moonData.minMass, moonData.maxMass) * 0.05;
              const moonRadius = rng.range(0.1, 0.4);
              const planetMassInSolar = planet.mass / 333000.0;

              const moon = {
                name: `${planet.name} ${String.fromCharCode(97 + m)}`,
                type: moonType,
                color: PLANET_COLORS[moonType] || "#888888",
                orbitRadius: moonOrbitRadius,
                radius: moonRadius,
                mass: moonMass,
                period: Math.sqrt(Math.pow(moonOrbitRadius, 3) / planetMassInSolar) * 365,
                phase: rng.random() * Math.PI * 2,
                atmosphere: false,
              };
              planet.moons.push(moon);
            }
          }

          system.planets.push(planet);
        }
        this._applyStrangeOrbits(system, plan, rng);
      }

      return system;
    }

    // ------------------------------------------------------------------------
    // Lazy galaxy field: deterministic on-demand systems across the whole disk.
    // ------------------------------------------------------------------------

    _lazyStarTypePool() {
      if (this._starTypePoolCache) return this._starTypePoolCache;
      const pool = buildStarTypePool();
      this._starTypePoolCache = pool.length ? pool : Object.keys(STAR_TYPES);
      return this._starTypePoolCache;
    }

    _makeLazyStar(name, x, y, z, rng) {
      const pool = this._lazyStarTypePool();
      const starType = pool[rng.int(0, pool.length - 1)];
      const starData = STAR_TYPES[starType];
      const mass = rng.range(starData.mass[0], starData.mass[1]);
      const radius = rng.range(starData.radius[0], starData.radius[1]);
      const temperature = rng.range(starData.temp[0], starData.temp[1]);
      const star = {
        name,
        type: starType,
        color: STAR_COLORS[starType] || "#ffffff",
        position: { x, y, z },
        mass, radius, temperature,
        luminosity: this.calculateLuminosity({ mass, radius }),
        binary: false,
        hardcoded: false,
        lazy: true,
        _materialized: false,
        planets: [],
      };
      // Deterministic (same rng stream), so a regenerated chunk always yields
      // the same companions / feeding donors / derelict shells.
      if (starType === "ROGUE_PLANET") this._finishRoguePlanet(star, rng);
      else this._applyStellarModifiers(star, rng);
      return star;
    }

    // Deterministic star-only systems for one disk-plane chunk (cached, LRU).
    // Planets are generated only when a system is entered (materializeLazySystem)
    // so building a chunk stays cheap even across a dense field.
    generateLazyChunk(cx, cz) {
      if (!this._lazyChunks) this._lazyChunks = new Map();
      const key = cx + "," + cz;
      const cached = this._lazyChunks.get(key);
      if (cached) return cached;

      const rng = new RandomGenerator("LZ:" + this.proceduralSeed + ":" + cx + ":" + cz);
      const x0 = cx * LAZY_CHUNK_LY;
      const y0 = cz * LAZY_CHUNK_LY;
      const ccx = x0 + LAZY_CHUNK_LY / 2;
      const ccy = y0 + LAZY_CHUNK_LY / 2;
      const RgcCentre = Math.sqrt((GAL_SUN_R_LY + ccx) ** 2 + ccy * ccy);
      let density = Math.min(6, Math.exp(-(RgcCentre - GAL_SUN_R_LY) / GAL_DISK_SCALE_LY));
      const count = RgcCentre > GAL_DISK_RADIUS_LY
        ? 0
        : Math.round(LAZY_BASE_PER_CHUNK * density * (0.5 + rng.random()));

      const systems = [];
      for (let i = 0; i < count; i++) {
        // Always consume x/y/h in the same order so culling never desyncs the
        // RNG stream -- the chunk regenerates identically every time.
        const x = x0 + rng.random() * LAZY_CHUNK_LY;
        const y = y0 + rng.random() * LAZY_CHUNK_LY;
        const h = (rng.random() + rng.random() + rng.random() - 1.5) / 1.5;
        const z = h * GAL_THIN_DISK_H_LY;
        const Rgc = Math.sqrt((GAL_SUN_R_LY + x) ** 2 + y * y);
        // Skip the inner bubble (static catalog covers it) and the disk rim.
        if (Math.sqrt(x * x + y * y) < MAP_RADIUS || Rgc > GAL_DISK_RADIUS_LY) continue;
        systems.push(this._makeLazyStar("LZ." + cx + "." + cz + "." + i, x, y, z, rng));
      }

      this._lazyChunks.set(key, systems);
      if (this._lazyChunks.size > LAZY_CHUNK_CACHE) {
        this._lazyChunks.delete(this._lazyChunks.keys().next().value);
      }
      return systems;
    }

    // Generate planets/moons (deterministic from the system name) for a planet
    // count of 1-8, mirroring generateSingleProceduralSystem.
    _populatePlanets(system, rng) {
      const MOON_INVALID = new Set([
        "gas_giant", "hot_jupiter", "warm_jupiter", "cold_jupiter", "ice_giant",
        "ringed_gas_giant", "magnetar", "comet", "short_period_comet", "long_period_comet",
        "asteroid", "c_type_asteroid", "s_type_asteroid", "m_type_asteroid", "trojan_asteroid",
      ]);
      const moonTypePool = Object.keys(PLANET_TYPES).filter((t) => !MOON_INVALID.has(t));
      const planetTypes = Object.keys(PLANET_TYPES);
      const numPlanets = rng.int(1, 8);
      for (let p = 0; p < numPlanets; p++) {
        const planetType = planetTypes[rng.int(0, planetTypes.length - 1)];
        const planetData = PLANET_TYPES[planetType];
        const planet = {
          name: `${system.name} ${String.fromCharCode(98 + p)}`,
          type: planetType,
          color: PLANET_COLORS[planetType] || "#888888",
          orbitRadius: rng.range(0.1, 10) * (p + 1) * 0.4,
          radius: rng.range(0.5, 3),
          mass: rng.range(planetData.minMass, planetData.maxMass),
          period: 0,
          phase: rng.random() * Math.PI * 2,
          atmosphere: rng.random() < 0.5,
          moons: [],
        };
        planet.period = Math.sqrt(Math.pow(planet.orbitRadius, 3) / system.mass) * 365;
        const moonChance = 0.1 + planet.mass / 20.0;
        if (rng.random() < moonChance && moonTypePool.length > 0) {
          const numMoons = rng.int(1, 4);
          let lastMoonOrbit = rng.range(0.001, 0.003);
          for (let m = 0; m < numMoons; m++) {
            const moonType = moonTypePool[rng.int(0, moonTypePool.length - 1)];
            const moonData = PLANET_TYPES[moonType];
            const moonOrbitRadius = lastMoonOrbit + rng.range(0.001, 0.004);
            lastMoonOrbit = moonOrbitRadius;
            const planetMassInSolar = planet.mass / 333000.0;
            planet.moons.push({
              name: `${planet.name} ${String.fromCharCode(97 + m)}`,
              type: moonType,
              color: PLANET_COLORS[moonType] || "#888888",
              orbitRadius: moonOrbitRadius,
              radius: rng.range(0.1, 0.4),
              mass: rng.range(moonData.minMass, moonData.maxMass) * 0.05,
              period: Math.sqrt(Math.pow(moonOrbitRadius, 3) / planetMassInSolar) * 365,
              phase: rng.random() * Math.PI * 2,
              atmosphere: false,
            });
          }
        }
        system.planets.push(planet);
      }
    }

    // Promote a lazy system to a full, travelable one: generate its planets and
    // register it in the systems map (kept for the session; never serialized, so
    // saves stay lean -- it regenerates identically from its name on reload).
    materializeLazySystem(system) {
      if (!system || system._materialized) return system;
      system._materialized = true;
      const rng = new RandomGenerator("LZplanets:" + system.name);
      // A rogue planet IS the body: nothing orbits it.
      if (system.type !== "ROGUE_PLANET" && rng.random() < 0.7) {
        this._populatePlanets(system, rng);
      }
      this.systems.set(system.name, system);
      // Track materialized lazy systems and evict the oldest (LRU-ish) so a long
      // tour of the galaxy doesn't grow this.systems unbounded. Lazy systems
      // regenerate identically from their name, so eviction is lossless.
      if (!this._materializedLazy) this._materializedLazy = new Set();
      this._materializedLazy.delete(system.name);
      this._materializedLazy.add(system.name);
      while (this._materializedLazy.size > MATERIALIZED_LAZY_CACHE) {
        const oldest = this._materializedLazy.values().next().value;
        this._materializedLazy.delete(oldest);
        if (oldest === this.currentSystem) {
          this._materializedLazy.add(oldest); // keep the active system resident
          break;
        }
        this.systems.delete(oldest);
      }
      return system;
    }

    // Rebuild a single lazy system from its "LZ.cx.cz.i" name (regenerates its
    // chunk and finds the matching entry).
    _regenerateLazySystem(name) {
      const parts = String(name).split(".");
      if (parts.length < 4 || parts[0] !== "LZ") return null;
      const cx = parseInt(parts[1], 10);
      const cz = parseInt(parts[2], 10);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
      const chunk = this.generateLazyChunk(cx, cz);
      return chunk.find((s) => s.name === name) || null;
    }

    // ------------------------------------------------------------------------
    // Hand-authored systems that belong to ANOTHER galaxy (Titania, out in
    // Andromeda). A procedural galaxy names its systems "GX.<seed>.<i>", so one
    // of these takes a name of the same shape ("GX.<seed>.H<key>") and is
    // appended to that galaxy's own system list by generateGalaxySystems: from
    // there the whole star map (picking, travel, save-restore, zooming out to
    // the right galaxy) treats it as a native of that galaxy with no special
    // cases, which is exactly what PatreonRewards does for a patron world.
    //
    // The seed a galaxy is drawn from is FNV-1a of its name, the same hash the
    // 3D cosmos module uses; it is mirrored here rather than called, because
    // the systems are registered while the data loads and that module may not
    // have loaded yet.
    // ------------------------------------------------------------------------
    _galaxySeedFromName(name) {
      const cosmos = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
      if (cosmos && typeof cosmos.galaxySeedFromName === "function") {
        return cosmos.galaxySeedFromName(name);
      }
      let h = 2166136261 >>> 0;
      const s = String(name || "galaxy");
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      h = h >>> 0;
      // Stamped exactly the way the cosmos module stamps it, or the mirror and
      // the original would disagree by up to fifteen. A galaxy named here is a
      // hand-authored neighbour of ours (Andromeda), so its tier is 0: home.
      const S = window.GalaxySim.Math && window.GalaxySim.Math.Strangeness;
      return S ? S.stampTier(h, 0) : h;
    }

    _registerFarSystem(system) {
      if (!this._farSystems) this._farSystems = [];
      const seed = this._galaxySeedFromName(system.galaxy);
      // The name the rest of the sim knows it by. The readable one is kept as
      // `label`, which every panel already prefers over `name`.
      system.label = system.label || system.name;
      system.galaxySeed = seed;
      system.farHardcoded = true;
      system.name = "GX." + seed + ".H" + system.label.replace(/[^A-Za-z0-9]/g, "");
      this.systems.set(system.name, system);
      // loadSystems runs again on demand, so the registry is replaced by name
      // rather than appended to: the catalog must not list Titania twice.
      const at = this._farSystems.findIndex((s) => s.name === system.name);
      if (at >= 0) this._farSystems[at] = system;
      else this._farSystems.push(system);
      return system;
    }

    // Every authored far system, for the catalog. Cheap: they are built once
    // with the rest of the hardcoded table and never regenerated.
    farSystems() {
      if (this.systems.size === 0) this.loadSystems();
      return (this._farSystems || []).slice();
    }

    // ------------------------------------------------------------------------
    // Procedural (non-Milky-Way) galaxy interiors: a real, travelable set of
    // star systems for whatever named galaxy the player flies into, so the
    // same target/travel/SB-Bridge machinery that drives the Milky Way works
    // unmodified out there too. Deterministic from the galaxy's seed and
    // registered into `this.systems` under a "GX.<seed>.<i>" name so getSystem
    // regenerates them on demand (never serialized, same convention as the
    // lazy field - identical seed always yields identical systems).
    // ------------------------------------------------------------------------
    generateGalaxySystems(seed, radius) {
      if (!this._galaxySystemsCache) this._galaxySystemsCache = new Map();
      const key = String(seed);
      const cached = this._galaxySystemsCache.get(key);
      if (cached) return cached;

      const rng = new RandomGenerator("GX:" + seed);
      // Falls back to the exact same seed-derived radius buildProceduralGalaxy
      // uses (Rdisk = 1500 + seed%700), so a caller that only knows the name -
      // getSystem() regenerating a whole galaxy from a "GX.<seed>.<i>" name on
      // save-restore, before that galaxy's view has been built this session -
      // reconstructs identical positions rather than a mismatched default.
      const R = radius != null ? radius : (1500 + (Math.abs(seed) % 700));
      const list = [];
      for (let i = 0; i < GALAXY_SYSTEM_COUNT; i++) {
        const name = "GX." + seed + "." + i;
        const th = rng.random() * Math.PI * 2;
        const rr = Math.pow(rng.random(), 0.6) * R;
        const x = Math.cos(th) * rr;
        const y = (rng.random() - 0.5) * R * 0.05;
        const z = Math.sin(th) * rr;
        const sys = this.generateSingleProceduralSystem(x, y, z, name, rng);
        list.push(sys);
        this.systems.set(name, sys);
      }
      for (const far of (this._farSystems || [])) {
        if (far.galaxySeed !== seed) continue;
        if (!list.some((s) => s && s.name === far.name)) list.push(far);
      }
      this._galaxySystemsCache.set(key, list);
      return list;
    }

    /** The disk radius buildProceduralGalaxy draws for this seed, in world
     *  units. Both sides derive it the same way so the stars a galaxy holds
     *  land inside the disk it is drawn with. */
    galaxyDiskRadius(seed) {
      return 1500 + (Math.abs(seed) % 700);
    }

    /**
     * One chunk of a procedural galaxy's own star field, in that galaxy's local
     * WORLD-unit frame (x/z across the disk, y its thickness) - the frame
     * buildProceduralGalaxy places everything else in.
     *
     * The Milky Way's equivalent is generateLazyChunk; this mirrors it exactly:
     * star-only bodies (planets are grown on entry by materializeLazySystem),
     * an LRU chunk cache, and an RNG stream consumed in a FIXED order so that
     * culling a star never shifts the ones after it and a chunk regenerates
     * identically every visit.
     */
    generateGalaxyLazyChunk(seed, cx, cz) {
      if (!this._galaxyLazyChunks) this._galaxyLazyChunks = new Map();
      const key = seed + "," + cx + "," + cz;
      const cached = this._galaxyLazyChunks.get(key);
      if (cached) return cached;

      const R = this.galaxyDiskRadius(seed);
      const rng = new RandomGenerator("GZ:" + seed + ":" + cx + ":" + cz);
      const x0 = cx * GALAXY_LAZY_CHUNK;
      const z0 = cz * GALAXY_LAZY_CHUNK;
      const ccx = x0 + GALAXY_LAZY_CHUNK / 2;
      const ccz = z0 + GALAXY_LAZY_CHUNK / 2;
      // Density falls off exponentially from the core, so the bulge is crowded
      // and the rim is sparse, and stops dead at the edge of the drawn disk.
      const rCentre = Math.sqrt(ccx * ccx + ccz * ccz);
      const density = Math.min(6, Math.exp(-rCentre / (R * 0.35)));
      const count = rCentre > R
        ? 0
        : Math.round(GALAXY_LAZY_PER_CHUNK * density * (0.5 + rng.random()));

      const systems = [];
      for (let i = 0; i < count; i++) {
        const x = x0 + rng.random() * GALAXY_LAZY_CHUNK;
        const z = z0 + rng.random() * GALAXY_LAZY_CHUNK;
        const h = (rng.random() + rng.random() + rng.random() - 1.5) / 1.5;
        const y = h * R * 0.012;
        if (Math.sqrt(x * x + z * z) > R) continue;
        systems.push(this._makeLazyStar(
          "GZ." + seed + "." + cx + "." + cz + "." + i, x, y, z, rng));
      }

      this._galaxyLazyChunks.set(key, systems);
      if (this._galaxyLazyChunks.size > GALAXY_LAZY_CACHE) {
        this._galaxyLazyChunks.delete(this._galaxyLazyChunks.keys().next().value);
      }
      return systems;
    }

    /** Rebuild one galaxy lazy star from its "GZ.<seed>.<cx>.<cz>.<i>" name. */
    _regenerateGalaxyLazySystem(name) {
      const parts = String(name).split(".");
      if (parts.length < 5 || parts[0] !== "GZ") return null;
      const seed = parseInt(parts[1], 10);
      const cx = parseInt(parts[2], 10);
      const cz = parseInt(parts[3], 10);
      if (!Number.isFinite(seed) || !Number.isFinite(cx) || !Number.isFinite(cz)) return null;
      const chunk = this.generateGalaxyLazyChunk(seed, cx, cz);
      return chunk.find((s) => s.name === name) || null;
    }

    // Rebuild a whole procedural galaxy's system list from a "GX.<seed>.<i>"
    // name (used by getSystem when a save restores mid-flight out there).
    _regenerateGalaxySystem(name) {
      const parts = String(name).split(".");
      if (parts.length < 3 || parts[0] !== "GX") return null;
      const seed = parseInt(parts[1], 10);
      if (!Number.isFinite(seed)) return null;
      // An authored far system is registered by loadSystems, not generated, so
      // it is already there and its galaxy need not be built to find it.
      if (this.systems.has(name)) return this.systems.get(name);
      this.generateGalaxySystems(seed);
      return this.systems.get(name) || null;
    }

    // Every procedural (non-Milky-Way) galaxy also gets its own central
    // supermassive black hole, a real travelable "system" (name "GX.<seed>.BH")
    // sitting at that galaxy's own local origin - the same position
    // buildProceduralGalaxy puts its decorative hole mesh, so the two coincide
    // and the hole is a normal, clickable star-pickable like any other system.
    // Deterministic + cached, same convention as generateGalaxySystems.
    getGalaxyBlackHole(seed) {
      const name = "GX." + seed + ".BH";
      const existing = this.systems.get(name);
      if (existing) return existing;
      const rng = new RandomGenerator("GXBH:" + seed);
      const mass = 1e5 * Math.pow(10, rng.random() * 3); // 100k - 100M solar masses
      const sys = {
        name,
        type: "SUPERMASSIVE_BLACK_HOLE",
        mass,
        radius: 0.05 + rng.random() * 0.1,
        temperature: null,
        position: { x: 0, y: 0, z: 0 },
        planets: [],
        color: STAR_COLORS.SUPERMASSIVE_BLACK_HOLE || "#442200",
      };
      this.systems.set(name, sys);
      return sys;
    }

    toJSON() {
      const data = {
        currentSystem: this.currentSystem,
        proceduralSeed: this.proceduralSeed,
        playerShip: this.playerShip,
      };
      dlog("StarMapDataManager.toJSON: Saving data", data);
      return data;
    }

    fromJSON(data) {
      if (!data) {
        dlog("StarMapDataManager.fromJSON: No save data provided");
        return;
      }

      dlog("StarMapDataManager.fromJSON: Loading save data", data);

      this.currentSystem = data.currentSystem || "Sol";   // i18n-ignore: system id
      this.proceduralSeed = data.proceduralSeed || 12345;

      if (data.playerShip) {
        this.playerShip = {
          ...this.playerShip,
          ...data.playerShip,
        };
        dlog("StarMapDataManager.fromJSON: Loaded playerShip", this.playerShip);
      }

      this.proceduralGenerated = false;
      // The lazy field is keyed on proceduralSeed; drop the cache so it
      // regenerates against the restored seed.
      this._lazyChunks = null;
      dlog("StarMapDataManager.fromJSON: Restoration complete");
    }

    calculateLuminosity(systemData) {
      const M = systemData.mass || 1;
      const R = systemData.radius || 1;
      return Math.pow(M, 3.5) * Math.pow(R, 2) * 0.001;
    }

    // The registry is not static: the calendar rewrites part of it (Nibiru's
    // approach, and what it leaves behind in 2012). Reconciling here means
    // every reader - the star map, the catalog, travel, the ship - sees the
    // same table without any of them knowing about it. Cheap: the module
    // compares a state key and returns at once when nothing has moved.
    _syncTimeline() {
      const N = window.GalaxySim && window.GalaxySim.Nibiru;
      if (N && N.sync) N.sync(this);
      // After Nibiru: on the day Earth is replaced by the Omega Tower the
      // tower inherits Earth's moon array, so the Friday pass must run on
      // whatever body is standing in Earth's orbit by then.
      const F = window.GalaxySim && window.GalaxySim.FridayMoons;
      if (F && F.sync) F.sync(this);
    }

    getSystem(name) {
      if (this.systems.size === 0) this.loadSystems();
      this._syncTimeline();
      const s = this.systems.get(name);
      if (s) return s;
      // Lazy systems aren't in the map until visited; regenerate on demand so
      // travel / ship placement / save-restore all resolve them by name.
      if (typeof name === "string" && name.startsWith("LZ.")) {
        const lazy = this._regenerateLazySystem(name);
        if (lazy) return this.materializeLazySystem(lazy);
      }
      // The same, for a star streamed into a procedural galaxy's own field.
      if (typeof name === "string" && name.startsWith("GZ.")) {
        const lazy = this._regenerateGalaxyLazySystem(name);
        if (lazy) return this.materializeLazySystem(lazy);
      }
      if (typeof name === "string" && name.startsWith("GX.")) {
        const parts = name.split(".");
        if (parts.length === 3 && parts[2] === "BH") {
          const seed = parseInt(parts[1], 10);
          return Number.isFinite(seed) ? this.getGalaxyBlackHole(seed) : undefined;
        }
        return this._regenerateGalaxySystem(name) || undefined;
      }
      return undefined;
    }

    getAllSystems() {
      if (this.systems.size === 0) this.loadSystems();
      this._syncTimeline();
      return Array.from(this.systems.values());
    }

    getSystemsInRadius(centerX, centerY, radius) {
      return this.getAllSystems().filter((system) => {
        const dx = system.position.x - centerX;
        const dy = system.position.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= radius;
      });
    }

    setCurrentSystem(name) {
      if (this.systems.has(name)) {
        this.currentSystem = name;
        console.log(`Current system set to: ${name}`);
      } else if (typeof name === "string" &&
                 (name.startsWith("LZ.") || name.startsWith("GX.") || name.startsWith("GZ."))) {
        // Lazy/galaxy systems aren't generated until entered; still record them
        // as current so var 96 (written by the caller) stays in sync with
        // currentSystem. getSystem() regenerates the body by name on demand.
        this.currentSystem = name;
        console.log(`Current system set to: ${name}`);
      }
    }
  }

  // ============================================================================
  // Export to namespace
  // ============================================================================

  window.GalaxySim.DataManager = StarMapDataManager;
  // Also exposed by its bare class name: JsonEx's save/load round-trip tags
  // encoded instances with their constructor name and looks it up on the
  // global `window` to restore the prototype, so $gameSystem.starMapData
  // needs the class findable there too, not just under GalaxySim.DataManager.
  window.StarMapDataManager = StarMapDataManager;
  // Exposed so the 3D scene's lazy star field maps world coords to chunks with
  // the exact same cell size used here.
  StarMapDataManager.LAZY_CHUNK_LY = LAZY_CHUNK_LY;
  StarMapDataManager.GALAXY_LAZY_CHUNK = GALAXY_LAZY_CHUNK;
  // Fuel caps, exposed so the HUD can draw gauges against them.
  StarMapDataManager.HYPERFLUX_MAX = HYPERFLUX_MAX;
  StarMapDataManager.SCHRODINGERITE_MAX = SCHRODINGERITE_MAX;
  // Refuel/harvest timings, exposed so the HUD and the ship-interior travel
  // window can quote the same ETAs the pumps actually run on.
  StarMapDataManager.REFUEL_FULL_SECONDS = REFUEL_FULL_SECONDS;
  StarMapDataManager.REFUEL_RATE_PER_SEC = REFUEL_RATE_PER_SEC;
  StarMapDataManager.SCHRODINGERITE_FULL_SECONDS = SCHRODINGERITE_FULL_SECONDS;
  StarMapDataManager.SCHRODINGERITE_HARVEST_SECONDS = SCHRODINGERITE_HARVEST_SECONDS;
  StarMapDataManager.SCHRODINGERITE_HARVEST_AMOUNT = SCHRODINGERITE_HARVEST_AMOUNT;
  window.GalaxySim.NameGenerators = {
    generateProceduralGalaxyName,
    generateProceduralSuperclusterName,
    generateGalaxyGroupName,
    generateSuperclusterName,
    generateProceduralLocalGroup,
  };

})();
