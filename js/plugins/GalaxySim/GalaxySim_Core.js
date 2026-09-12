/*:
 * @target MZ
 * @plugindesc GalaxySim Core - Main plugin entry point for modular galaxy simulation
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim Core Module
 * ============================================================================
 * This is the main entry point for the modular GalaxySim system.
 *
 * REQUIRED MODULE LOAD ORDER:
 * 1. DataService.js (external database)
 * 2. GalaxySim_Math.js
 * 3. GalaxySim_DataManager.js
 * 4. GalaxySim_Renderer_Planets.js
 * 5. GalaxySim_Renderer_Stars.js
 * 6. GalaxySim_Renderer_Cosmology.js
 * 7. GalaxySim_Renderer_Effects.js
 * 8. GalaxySim_Scene.js
 * 9. GalaxySim_Core.js (this file - load last)
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 * OpenStarMap - Opens the star map scene
 * SetCurrentSystem <systemName> - Sets the current system
 * LandToSpaceport - Choice list of the orbited planet's landing sites, then teleports there
 * Refuel - Engages refuelling, or auto-plots a course to the nearest refuelling star
 *
 * ============================================================================
 * Refuelling
 * ============================================================================
 * Only an ordinary fusing star (Morgan-Keenan O, B, A, F, G, K, M) can power a
 * Hyperflux refuel; remnants, brown dwarfs and black holes cannot. The Refuel
 * command (and the star map's Refuel button) resolves that automatically:
 *   - parked at a fusing star already: it just starts the pumps
 *   - a fusing star in this very system: it plots the short hop to it
 *   - otherwise: it plots the course to the nearest system that has one
 * Either way the pumps engage by themselves the moment the ship arrives.
 * A full tank is a two-minute stop: the ship eases in toward the star while
 * the pumps run and drifts back out once they stop, and the ETA is counted
 * down in the same window that counts down an arrival.
 * A black hole fills the Schrodingerite magazine instead, in half a minute,
 * and its once-a-week harvest is a thirty-second flyby of the disk.
 *
 * ============================================================================
 * Variables Used
 * ============================================================================
 * Variable 94: Ship speed multiplier
 * Variable 95: Fuel level
 * Variable 96: Current star system
 * Variable 97: Target star system
 *
 * ============================================================================
 * Infinite fuel
 * ============================================================================
 * If the party leader is named "Test" (or Sandbox mode is active), the
 * starship fuel (variable 95) never depletes.
 *
 * @command OpenStarMap
 * @text Open Star Map
 * @desc Opens the advanced star map interface
 *
 * @command SetCurrentSystem
 * @text Set Current System
 * @desc Sets the player's current star system
 *
 * @arg systemName
 * @text System Name
 * @desc Name of the star system (e.g., "Sol", "Alpha Centauri")
 * @type string
 * @default Sol
 *
 * @command LandToSpaceport
 * @text Land to Spaceport
 * @desc Shows the hardcoded landing sites of the planet the ship is currently orbiting and teleports there
 *
 * @command Refuel
 * @text Refuel
 * @desc Starts refuelling, or auto-plots a course to the nearest star that can refuel the ship
 *
 * @arg openStarMap
 * @text Open Star Map
 * @desc Show the star map after plotting, so the flight to the fuel star actually runs
 * @type boolean
 * @default true
 *
 * @command ShipControls
 * @text Ship Controls
 * @desc Opens the minimal and fast ship controls HUD
 *
 * @command ship controls
 * @text Ship Controls
 * @desc Opens the minimal and fast ship controls HUD
 */

(() => {
  "use strict";

  const pluginName = "GalaxySim_Core";

  // ============================================================================
  // Check Dependencies
  // ============================================================================

  if (!window.GalaxySim) {
    throw new Error("GalaxySim_Core: GalaxySim namespace not found. Ensure all modules are loaded.");
  }

  const requiredModules = ['Math', 'DataManager'];   // i18n-ignore: module ids
  requiredModules.forEach((module) => {
    if (!window.GalaxySim[module]) {
      throw new Error(`GalaxySim_Core: Missing required module: ${module}`);
    }
  });

  if (!window.Scene_AdvancedStarMap3D) {
    throw new Error("GalaxySim_Core: Scene_AdvancedStarMap3D not found. Ensure GalaxySim_Scene3D.js is loaded.");
  }

  console.log("GalaxySim: All modules loaded successfully");

  // ============================================================================
  // Infinite Fuel (Test / Sandbox mode)
  // ============================================================================
  // Variable that stores the starship fuel level.
  const FUEL_VAR = 95;
  const INFINITE_FUEL_VALUE = 999999;

  // Mirrors the convention used across the project.
  function isInfiniteFuel() {
    try {
      if ($gameSystem && $gameSystem._isSandboxMode) return true;
      const leader = $gameParty && $gameParty.leader();
      // i18n-ignore-start: the debug party name, compared not shown
      if (leader && leader.name() === "Test") return true;
      if ($gameVariables && $gameVariables.value(105) === "Test") return true;
      // i18n-ignore-end
    } catch (e) {
      /* state not ready */
    }
    return false;
  }
  // Exposed so other GalaxySim modules (e.g. the ship background) can reuse it.
  window.GalaxySim.isInfiniteFuel = isInfiniteFuel;

  // Keep every fuel topped up around each consumption tick. Galaxy-scale travel
  // now burns Hyperflux (playerShip.hyperflux); the classic var-95 tank is only
  // spent by map movement, but we still pin it here so nothing runs the ship dry
  // in sandbox. Schrodingerite (SB-Bridge charges) is refilled too.
  function topUpExoticFuels(dm) {
    if (!dm) return;
    const D = window.GalaxySim.DataManager;
    if (dm.setHyperflux) dm.setHyperflux((D && D.HYPERFLUX_MAX) || 92000);
    if (dm.setSchrodingerite) dm.setSchrodingerite((D && D.SCHRODINGERITE_MAX) || 92);
  }
  window.GalaxySim.topUpExoticFuels = topUpExoticFuels;

  if (window.GalaxySim.DataManager &&
      window.GalaxySim.DataManager.prototype.updateShipPosition) {
    const _updateShipPosition = window.GalaxySim.DataManager.prototype.updateShipPosition;
    window.GalaxySim.DataManager.prototype.updateShipPosition = function () {
      const cheat = isInfiniteFuel();
      if (cheat) { $gameVariables.setValue(FUEL_VAR, INFINITE_FUEL_VALUE); topUpExoticFuels(this); }
      _updateShipPosition.call(this);
      if (cheat) { $gameVariables.setValue(FUEL_VAR, INFINITE_FUEL_VALUE); topUpExoticFuels(this); }
    };
  }

  // ============================================================================
  // Star map launcher: the real-time 3D scene is the only star map now (the
  // legacy 2D-canvas scene and its renderers have been retired). The 3D scene
  // itself guards against a missing WebGL context and bounces back cleanly.
  // ============================================================================
  function pushStarMapScene() {
    if (!window.Scene_AdvancedStarMap3D) {
      console.error("[GalaxySim] 3D star map scene unavailable.");
      return;
    }
    SceneManager.push(Scene_AdvancedStarMap3D);
  }
  window.GalaxySim.pushStarMapScene = pushStarMapScene;

  // ============================================================================
  // Plugin Commands
  // ============================================================================

  PluginManager.registerCommand(pluginName, "OpenStarMap", (args) => {
    pushStarMapScene();
  });

  PluginManager.registerCommand(pluginName, "SetCurrentSystem", (args) => {
    const systemName = args.systemName || "Sol";   // i18n-ignore: system id

    if (!$gameSystem.starMapData) {
      $gameSystem.starMapData = new window.GalaxySim.DataManager();
    }

    $gameSystem.starMapData.setCurrentSystem(systemName);
    $gameVariables.setValue(96, systemName);
    console.log(`Current system set to: ${systemName}`);
  });

  // Shows a choice list of the hardcoded landing sites for the planet the ship
  // currently orbits (ship.currentPlanet), then teleports to whichever is picked
  // via GS.teleportToLandingSite. If the planet/moon has no spaceports, brings up
  // the landing-site picker so the player can choose a landing square.
  PluginManager.registerCommand(pluginName, "LandToSpaceport", () => {
    const dm = $gameSystem.starMapData;
    const ship = dm && dm.playerShip;
    let planet = null;
    let moonOf = null;
    if (ship && ship.currentPlanet) {
      const sys = dm.getSystem(ship.currentSystem);
      if (sys && sys.planets) {
        planet = sys.planets.find((p) => p.name === ship.currentPlanet);
        if (!planet) {
          for (const p of sys.planets) {
            if (p.moons) {
              const m = p.moons.find((moon) => moon.name === ship.currentPlanet);
              if (m) { planet = m; moonOf = p; break; }
            }
          }
        }
      }
    }
    const locs = (planet && planet.landingLocations) || [];
    if (!locs.length) {
      if (planet) {
        if (!openLandingGridPicker(planet, moonOf)) {
          $gameMessage.add(T('Galaxy.core.noSpaceports'));
        }
      } else {
        $gameMessage.add(T('Galaxy.core.noSpaceports'));
      }
      return;
    }
    $gameMessage.setChoices(locs.map((l) => l.name).concat(T('Galaxy.core.cancel')), 0, locs.length);
    $gameMessage.setChoiceCallback((n) => {
      if (n >= 0 && n < locs.length && window.GalaxySim.teleportToLandingSite) {
        window.GalaxySim.teleportToLandingSite(locs[n]);
      }
    });
  });

  PluginManager.registerCommand(pluginName, "ship controls", () => {
    openShipControls();
  });
  PluginManager.registerCommand(pluginName, "ShipControls", () => {
    openShipControls();
  });
  if (pluginName !== "GalaxySim/GalaxySim_Core") {
    PluginManager.registerCommand("GalaxySim/GalaxySim_Core", "ship controls", () => {
      openShipControls();
    });
    PluginManager.registerCommand("GalaxySim/GalaxySim_Core", "ShipControls", () => {
      openShipControls();
    });
  }

  // ============================================================================
  // Refuel: engage the pumps where the ship is, or auto-plot the course to the
  // nearest star that can actually refuel it (see DataManager.planRefuel /
  // beginAutoRefuel). Shared by the "Refuel" plugin command and anything else
  // that wants the one-press behaviour.
  // ============================================================================
  function notify(text, severity) {
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(text, { severity: severity || "info", duration: 180 });
    } else if (typeof $gameMessage !== "undefined" && $gameMessage) {
      $gameMessage.add(text);
    }
  }

  // Returns the executed plan (see DataManager.beginAutoRefuel), or null when
  // the star map data isn't available at all.
  function autoRefuel(opts) {
    opts = opts || {};
    const dm = window.GalaxySim.getDataManager();
    if (!dm || !dm.beginAutoRefuel) return null;
    const plan = dm.beginAutoRefuel();
    const star = plan.starName || plan.systemName || T('Galaxy.core.theStar');
    if (opts.silent) return plan;

    if (plan.started) {
      notify(T('Galaxy.core.refuellingFrom', { star: star }));
    } else if (plan.plotted) {
      const dist = plan.distance ? T('Galaxy.core.distanceLy', { ly: plan.distance.toFixed(1) }) : "";
      notify(T('Galaxy.core.coursePlotted', { star: star, distance: dist }));
      if (plan.shortFuel) {
        notify(T('Galaxy.core.mayRunOut'), "warning");
      }
    } else if (plan.status === "refuelling") {
      notify(T('Galaxy.core.alreadyRefuelling', { star: star }));
    } else if (plan.status === "full") {
      notify(T('Galaxy.core.tankFull'));
    } else {
      notify(T('Galaxy.core.noStarInRange'), "warning");
    }
    return plan;
  }
  window.GalaxySim.autoRefuel = autoRefuel;

  PluginManager.registerCommand(pluginName, "Refuel", (args) => {
    const plan = autoRefuel();
    if (!plan) return;
    // Travel only advances while the star map is running (see
    // Scene_AdvancedStarMap3D._updateShipAndTravel), so a plotted course opens
    // it unless the event explicitly asked not to.
    const open = String(args && args.openStarMap) !== "false";
    const inStarMap = window.Scene_AdvancedStarMap3D &&
      SceneManager._scene instanceof window.Scene_AdvancedStarMap3D;
    if (plan.plotted && open && !inStarMap) pushStarMapScene();
  });

  // ============================================================================
  // Game_System Integration
  // ============================================================================

  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _Game_System_initialize.call(this);
    this.starMapData = new window.GalaxySim.DataManager();
  };

  // ============================================================================
  // DataManager Save/Load Integration
  // ============================================================================

  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);

    // $gameSystem.starMapData can come back from a core JsonEx round-trip
    // (the whole $gameSystem object, this field included) as a classless
    // plain object rather than a StarMapDataManager instance -- JsonEx only
    // restores a class by looking it up on the global `window`, and old
    // saves may predate that registration. Rebuild it rather than crash.
    if ($gameSystem.starMapData) {
      if (typeof $gameSystem.starMapData.toJSON !== "function") {
        const raw = $gameSystem.starMapData;
        $gameSystem.starMapData = new window.GalaxySim.DataManager();
        $gameSystem.starMapData.fromJSON(raw);
      }
      contents.starMapData = $gameSystem.starMapData.toJSON();
    }

    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);

    if (contents.starMapData) {
      $gameSystem.starMapData = new window.GalaxySim.DataManager();
      $gameSystem.starMapData.fromJSON(contents.starMapData);
    } else if ($gameSystem.starMapData && typeof $gameSystem.starMapData.fromJSON !== "function") {
      // Old save predating the contents.starMapData mirror: $gameSystem's own
      // embedded copy is the only data we have, already decoded classless.
      const raw = $gameSystem.starMapData;
      $gameSystem.starMapData = new window.GalaxySim.DataManager();
      $gameSystem.starMapData.fromJSON(raw);
    }
  };

  // ============================================================================
  // Helper Functions (exposed globally)
  // ============================================================================

  window.GalaxySim.openStarMap = function () {
    pushStarMapScene();
  };

  // Free-play viewer for the title screen minigame list: the ship, engines,
  // fuel and every bridge/landing/refuel action are hidden and disabled (see
  // Scene_AdvancedStarMap3D.create and the .gx-minigame CSS), leaving a
  // read-only tour of the catalog and Grand Tour. The flag is consumed once
  // by the scene's create(), so it never leaks into a normal OpenStarMap call.
  window.GalaxySim.openStarMapMinigame = function () {
    window.GalaxySim.minigameMode = true;
    pushStarMapScene();
  };

  window.GalaxySim.getDataManager = function () {
    if (!$gameSystem.starMapData) {
      $gameSystem.starMapData = new window.GalaxySim.DataManager();
    }
    return $gameSystem.starMapData;
  };

  window.GalaxySim.getCurrentSystem = function () {
    const dataManager = window.GalaxySim.getDataManager();
    return dataManager.getSystem(dataManager.currentSystem);
  };

  window.GalaxySim.setCurrentSystem = function (systemName) {
    const dataManager = window.GalaxySim.getDataManager();
    dataManager.setCurrentSystem(systemName);
    $gameVariables.setValue(96, systemName);
  };

  // ============================================================================
  // Planet definition helpers (breathable atmosphere / life)
  // ============================================================================
  function planetTypeInfo(planet) {
    const type = planet && (planet.type || (typeof planet === "string" ? planet : null));
    const PT = window.GalaxySim.PlanetTypes || {};
    return (type && PT[type]) || null;
  }
  function planetBreathable(planet) {
    const info = planetTypeInfo(planet);
    return !!(info && info.breathable);
  }
  function fnv1a(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  // Deterministic per-planet life: only supportLife types can host life, and
  // then only ~10% do. Seeded from the planet name + world seed so a given
  // planet always yields the same answer for the info box and for landing.
  function planetHasLife(planet) {
    // Authored life beats the roll: a body whose record states `life: true`
    // (the patron worlds, PatreonRewards) is inhabited by definition.
    if (planet && planet.life === true) return true;
    const info = planetTypeInfo(planet);
    if (!info || !info.supportLife) return false;
    let seed = 19002001;
    try {
      if (window.HistoryManager && window.HistoryManager.getSeed) {
        seed = window.HistoryManager.getSeed();
      }
    } catch (e) { /* default */ }
    const name = (planet && planet.name) || "";
    const roll = (fnv1a(name + "|life|" + seed) % 10000) / 10000;
    return roll < 0.10;
  }
  window.GalaxySim.planetTypeInfo = planetTypeInfo;
  window.GalaxySim.planetBreathable = planetBreathable;
  window.GalaxySim.planetHasLife = planetHasLife;
  // The descriptor a landed world is named and coloured by. Exposed so the
  // 3D world can open a planet without going through the surface generator
  // (see VoxelWorldSystem.startAlienWalk).
  window.GalaxySim.makeLandedDescriptor = (planet, opts) => makeLandedDescriptor(planet, opts);

  // ============================================================================
  // Life signs: what a scan actually reads off a world
  // ============================================================================
  // A biosphere is rare (planetHasLife above, and only on a supportLife type),
  // but a dead world is not automatically an empty one. The alien biomes grow
  // tentacles, tentacled rock and crystal tentacles - things the instruments
  // cannot call life and cannot call geology - and a world carrying them scans
  // as WEAK. Which biomes can grow them at all is a property of the biome
  // (js/db/WorldGen/AlienBiomes.json: a feature flagged `lifeSign`), and which
  // worlds of that biome actually do is a deterministic per-planet roll, so a
  // given planet always reads the same in the info box, in the catalogue, in
  // the biosignature sweep and on the ground.
  const LIFE = { NONE: "none", WEAK: "weak", STRONG: "strong" };
  const WEAK_LIFE_CHANCE = 0.34;
  window.GalaxySim.LifeSigns = LIFE;

  const _biosignBiomeCache = {};
  // Does the biome a planet type lands on declare any `lifeSign` feature?
  function biomeGrowsBiosigns(biomeName) {
    if (!biomeName) return false;
    if (_biosignBiomeCache[biomeName] === undefined) {
      const list = (window.WorldGen && window.WorldGen.Biomes) || [];
      const biome = list.find((b) => b && b.name === biomeName);
      // Asked before DataService merged the alien biomes in: answer no, but do
      // not cache it, or the whole sim would read as barren for the session.
      if (!biome) return false;
      _biosignBiomeCache[biomeName] = (biome.features || []).some(
        (f) => f && typeof f === "object" && f.lifeSign
      );
    }
    return _biosignBiomeCache[biomeName];
  }
  window.GalaxySim.biomeGrowsBiosigns = biomeGrowsBiosigns;

  function planetLifeSigns(planet) {
    if (planetHasLife(planet)) return LIFE.STRONG;
    const info = planetTypeInfo(planet);
    if (!info || !biomeGrowsBiosigns(info.biome)) return LIFE.NONE;
    let seed = 19002001;
    try {
      if (window.HistoryManager && window.HistoryManager.getSeed) {
        seed = window.HistoryManager.getSeed();
      }
    } catch (e) { /* default */ }
    const name = (planet && planet.name) || "";
    const roll = (fnv1a(name + "|biosign|" + seed) % 10000) / 10000;
    return roll < WEAK_LIFE_CHANCE ? LIFE.WEAK : LIFE.NONE;
  }
  window.GalaxySim.planetLifeSigns = planetLifeSigns;

  // ============================================================================
  // What a world weighs: its own level, and how it reads against the party
  // ============================================================================
  // Nothing out here answers to the Omega Tower and nothing answers to the
  // party: a world's creatures are built around the WORLD. Every planet carries
  // one level, rolled from its own name and the world seed, and the species
  // that walk its surface are drawn from around that number (see
  // alienSpeciesRoster below, which is the encounter list on an alien map).
  // Two planets of the same star can therefore be a stroll and a massacre, and
  // which is which does not change as the party grows.
  //
  // Nothing is stored: the roll is a hash, so a world reads the same in the
  // info box, in the catalogue, in a scan and under the party's feet, in this
  // session and in every later one.
  const PLANET_LEVEL_MIN = 1;
  const PLANET_LEVEL_MAX = 110;  // the top of the ordinary level ladder

  function planetLevel(planet) {
    const name = (planet && planet.name) || "";
    if (!name) return PLANET_LEVEL_MIN;
    const span = PLANET_LEVEL_MAX - PLANET_LEVEL_MIN + 1;
    return PLANET_LEVEL_MIN + (fnv1a(name + "|level|" + worldSeedInt()) % span);
  }
  window.GalaxySim.planetLevel = planetLevel;

  // The level of the world being stood on, or 0 anywhere else.
  function currentPlanetLevel() {
    const landed = getSurfacePlanet();
    return landed ? planetLevel(landed) : 0;
  }
  window.GalaxySim.currentPlanetLevel = currentPlanetLevel;

  // The level the space around the ship answers to: the world it is orbiting
  // if it is orbiting one, else the system it is sitting in. Rolled exactly as
  // a planet's is (the roll only ever looks at a name), so a derelict in orbit
  // of a lethal world holds lethal things, and a quiet system stays quiet from
  // its star out to its last rock.
  function currentSpaceLevel() {
    const dm = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem.starMapData : null;
    const ship = dm && dm.playerShip;
    const name = (ship && (ship.currentPlanet || ship.currentSystem)) || "";
    return name ? planetLevel({ name }) : 0;
  }
  window.GalaxySim.currentSpaceLevel = currentSpaceLevel;

  // What the biosignature reads as. The instruments cannot phrase a level, so
  // they phrase the only thing that matters to the people reading them: how the
  // life down there stands against the people who would meet it.
  //
  //   Weak    the world's level is well under the party's; a landing is a walk
  //   Strong  the two are within reach of each other; a landing is a fight
  //   Hyper   the world is well above them; a landing is a way to die
  //
  // A world with no biosphere has no reading at all (the tentacle-only worlds
  // scan as trace signs, LIFE.WEAK, which is a statement about life being
  // present, not about danger).
  const BIO = { WEAK: "weak", STRONG: "strong", HYPER: "hyper" };
  window.GalaxySim.BioTiers = BIO;
  const BIO_WEAK_UNDER = 0.75;   // under three quarters of the party's level
  const BIO_HYPER_OVER = 1.35;   // over a third above it

  function partyLevelForBio() {
    if (typeof $gameParty === "undefined" || !$gameParty || !$gameParty.members) return 1;
    const members = $gameParty.members();
    if (!members || !members.length) return 1;
    const sum = members.reduce((t, a) => t + ((a && a.level) || 1), 0);
    return Math.max(1, Math.round(sum / members.length));
  }

  function planetBioTier(planet) {
    if (!planetHasLife(planet)) return null;
    const ratio = planetLevel(planet) / partyLevelForBio();
    if (ratio < BIO_WEAK_UNDER) return BIO.WEAK;
    if (ratio > BIO_HYPER_OVER) return BIO.HYPER;
    return BIO.STRONG;
  }
  window.GalaxySim.planetBioTier = planetBioTier;

  // The word a tier is shown as, ready for any readout.
  function bioTierLabel(tier) {
    return tier ? T('Galaxy.bio.' + tier) : "";
  }
  window.GalaxySim.bioTierLabel = bioTierLabel;

  // Alien surface = the procedural map (636) generated from an alien biome
  // (biome names produced by AlienBiomes.json all start with "Alien").
  function isAlienSurface() {
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== 636) return false;
    const pg = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._procGenData : null;
    return !!(pg && /^Alien/.test(String(pg.currentBiome || "")));
  }
  function currentAlienHasLife() {
    return !!(typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._alienPlanetHasLife);
  }
  // What the world under the party's feet scans as. The proc-gen reads this to
  // decide whether the biome's biosign features (the tentacles) grow here; a
  // world with a full biosphere carries them too, so STRONG counts as WEAK.
  function currentAlienLifeSigns() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return LIFE.NONE;
    if ($gameSystem._alienPlanetHasLife) return LIFE.STRONG;
    return $gameSystem._alienLifeSigns || LIFE.NONE;
  }
  function currentAlienGrowsBiosigns() {
    const signs = currentAlienLifeSigns();
    return signs === LIFE.WEAK || signs === LIFE.STRONG;
  }
  window.GalaxySim.isAlienSurface = isAlienSurface;
  window.GalaxySim.currentAlienHasLife = currentAlienHasLife;
  window.GalaxySim.currentAlienLifeSigns = currentAlienLifeSigns;
  window.GalaxySim.currentAlienGrowsBiosigns = currentAlienGrowsBiosigns;

  // ============================================================================
  // EVA suits: on a planet with a non-breathable atmosphere the whole party
  // wears the vac-suit sprite; the originals are restored when they leave the
  // surface (any transfer off map 636).
  // ============================================================================
  const EVA_SPRITE = "Skab/Originals/!$MargheritaHackEVA";
  // Em is not handed one of the party's spare suits: she has a sealed sheet of
  // her own and a wardrobe that already reads the ground she is standing on
  // (CharacterPresets.emSheet), so writing the shared suit over her would put
  // the party's vac-suit in the savegame where her dossier's face belongs.
  function wearsPartyEVASuit(actor) {
    const CP = window.CharacterPresets;
    return !(actor && CP && CP.isEmActor && CP.isEmActor(actor));
  }
  function applyEVASuits() {
    if (typeof $gameParty === "undefined" || !$gameParty || !$gameSystem) return;
    if ($gameSystem._evaSuitActive) return;
    const backup = [];
    $gameParty.members().forEach((a) => {
      if (!wearsPartyEVASuit(a)) return;
      backup.push({ id: a.actorId(), name: a.characterName(), index: a.characterIndex() });
      a.setCharacterImage(EVA_SPRITE, 0);
    });
    $gameSystem._evaSuitBackup = backup;
    $gameSystem._evaSuitActive = true;
    if (typeof $gamePlayer !== "undefined" && $gamePlayer) $gamePlayer.refresh();
  }
  function removeEVASuits() {
    if (typeof $gameSystem === "undefined" || !$gameSystem || !$gameSystem._evaSuitActive) return;
    ($gameSystem._evaSuitBackup || []).forEach((b) => {
      const a = $gameActors.actor(b.id);
      if (a) a.setCharacterImage(b.name, b.index);
    });
    $gameSystem._evaSuitBackup = null;
    $gameSystem._evaSuitActive = false;
    if (typeof $gamePlayer !== "undefined" && $gamePlayer) $gamePlayer.refresh();
  }
  window.GalaxySim.applyEVASuits = applyEVASuits;
  window.GalaxySim.removeEVASuits = removeEVASuits;

  // ============================================================================
  // Landing on a planet surface (proc map 636). Shared by the star map's Land
  // action and the Sandbox "Teleport to Planet" tool. Builds a "landed planet"
  // descriptor (satellites + colour palette) so the battle sky and the weather
  // day-tint can reflect the specific world.
  // ============================================================================
  function hexToRgbArr(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function intToRgbArr(n) {
    if (typeof n !== "number" || !isFinite(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // ============================================================================
  // How long a day is out there, and what colour the daylight is
  // ----------------------------------------------------------------------------
  // Every world the party can stand on turns at its own rate under its own star,
  // and both of those things are readable off data the galaxy already has: the
  // star's spectral type gives the colour of its light, and the body's orbit
  // gives the length of its day.
  //
  // NONE OF THIS TOUCHES THE CLOCK. TimeDateSystem keeps Earth time everywhere,
  // always: hunger, sleep, shop hours, the calendar and every schedule in the
  // game are Earth hours and stay Earth hours no matter which planet the party
  // is standing on. What changes is only what the SKY is doing over their heads,
  // which is read off the Earth clock rather than replacing it - see
  // localHourFor() below, which turns elapsed Earth minutes into a local hour
  // for the tint systems and nothing else.
  // ============================================================================

  // Relative Rayleigh scattering of red, green and blue. Short wavelengths
  // scatter far more (the reason Earth's sky is blue and its sunsets are red),
  // so a star's light, filtered through this, is the colour of the sky it makes.
  // A blue-white giant gives a deep violet-blue sky; a red dwarf, which puts out
  // almost no blue for the air to scatter, gives a dim rust-coloured one.
  const RAYLEIGH = [0.35, 0.75, 1.0];
  // Everything is expressed RELATIVE to a sun-like G star, so Earth's own sky
  // and daylight come out exactly as they always were and only genuinely
  // different stars shift anything.
  let _sunRef = null;
  function _starRgb(type) {
    const ST = window.GalaxySim.StarTypes || {};
    const c = ST[type] && ST[type].color;
    if (typeof c !== "number" || !isFinite(c)) return null;
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  }
  function _sunReference() {
    if (_sunRef) return _sunRef;
    const g = _starRgb("G") || [255, 244, 234];
    _sunRef = { light: g, sky: g.map((c, i) => c * RAYLEIGH[i]) };
    return _sunRef;
  }
  const _clampRel = (v) => Math.max(0.12, Math.min(1.8, v));

  // What the sky and the daylight look like under a given star, as multipliers
  // on the colours Earth's own sky already uses: [1, 1, 1] under a sun-like
  // star, warm and dim under a red dwarf, cold and blue under a hot giant.
  function starLight(system) {
    const type = (system && system.type) || "G";
    const rgb = _starRgb(type) || _starRgb("G") || [255, 244, 234];
    const ref = _sunReference();
    return {
      type,
      rgb,
      temp: (system && typeof system.temperature === "number") ? Math.round(system.temperature) : null,
      // Multiplier on the sun's own colour: what the light landing on the ground
      // is tinted like.
      lightRel: rgb.map((c, i) => _clampRel(c / (ref.light[i] || 1))),
      // ...and on the sky above it, once the air has scattered that light.
      skyRel: rgb.map((c, i) => _clampRel((c * RAYLEIGH[i]) / (ref.sky[i] || 1))),
    };
  }
  window.GalaxySim.starLight = starLight;

  // What you weigh standing on a world, in Earth gravities. Surface gravity is
  // the mass over the square of the radius and nothing else, and the catalogue
  // carries both in Earth units already, so this is the whole of the physics:
  // a moon the size of ours pulls at a sixth of a gee and a super-earth twice
  // Earth's mass at half again its radius pulls at nearly one.
  function surfaceGravity(body) {
    const m = (body && typeof body.mass === "number" && body.mass > 0) ? body.mass : 1;
    const r = (body && typeof body.radius === "number" && body.radius > 0) ? body.radius : 1;
    return m / (r * r);
  }
  window.GalaxySim.surfaceGravity = surfaceGravity;

  // How close a world has to orbit before its star's tide stops it turning.
  // Locking time runs roughly as the sixth power of the orbit and falls with
  // the star's mass, so for a fixed system age the locking radius goes as the
  // cube root of that mass. Around a sun this reaches just past Mercury; around
  // a red dwarf it swallows the whole habitable zone, which is the real reason
  // most temperate worlds in this galaxy have one face in permanent daylight
  // and the other in permanent night.
  function tidalLockRadius(system) {
    const m = (system && typeof system.mass === "number" && system.mass > 0) ? system.mass : 1;
    return 0.30 * Math.cbrt(m);
  }

  function _spinSeed(body) {
    const s = String((body && (body.name || body.type)) || "world");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }

  // How the sky moves over a body: the length of its solar day in Earth hours,
  // whether it is tidally locked, and - when it is locked to its own star - the
  // one hour it is stuck at forever.
  //
  //   dayHours   Earth hours from one local noon to the next.
  //   locked     the same face is always turned toward what it is locked to.
  //   lockedTo   'star' (nothing overhead ever moves) or 'planet' (a moon,
  //              which still gets day and night, just very slowly: our own
  //              moon is locked to us and its day is a fortnight long).
  //   frozen     the sun never rises or sets here. Only locked-to-star worlds,
  //              and moons of one.
  //   fixedHour  what o'clock it is, forever, on a frozen world - which side of
  //              the terminator you landed on decides it.
  function worldRotation(body, system, opts) {
    opts = opts || {};
    const out = { dayHours: 24, locked: false, lockedTo: null, frozen: false, fixedHour: 12 };
    if (!body) return out;
    const lockAt = tidalLockRadius(system);

    if (opts.isMoon || body.isMoon) {
      // A moon settles into showing its planet one face, so its day is however
      // long it takes to go round: a fortnight of light and a fortnight of dark.
      const per = (typeof body.period === "number" && isFinite(body.period) && body.period > 0)
        ? body.period : 27.3;
      out.locked = true;
      out.lockedTo = "planet";   // i18n-ignore: internal key
      out.dayHours = Math.max(2, Math.min(20000, per * 24));
      // ...unless the planet it belongs to is itself frozen against its star,
      // in which case the whole arrangement is stopped and so is the moon.
      const host = opts.parentPlanet;
      if (host && worldRotation(host, system).frozen) {
        out.frozen = true;
        out.lockedTo = "star";   // i18n-ignore: internal key
        out.dayHours = null;
      }
      return out;
    }

    const a = (typeof body.orbitRadius === "number" && isFinite(body.orbitRadius))
      ? body.orbitRadius : 1;
    if (a > 0 && a <= lockAt) {
      out.locked = true;
      out.lockedTo = "star";   // i18n-ignore: internal key
      out.frozen = true;
      out.dayHours = null;
      return out;
    }

    // Free to turn. Gas giants spin fast because they never stopped collapsing;
    // rock spins slower. Then the tide brakes it - and the tidal torque falls off
    // as the sixth power of the orbit, so the braking is brutal just outside the
    // locking radius and effectively nothing further out. That is what leaves
    // Mercury with a day of months and Earth with one of hours, off the same
    // two lines.
    const r = _spinSeed(body);
    const gas = (typeof body.mass === "number" && body.mass > 20);
    const base = gas ? 8 + r * 12 : 14 + r * 20;
    const brake = (a > 0 && lockAt > 0) ? Math.pow(lockAt / a, 6) : 0;
    out.dayHours = Math.min(6000, base * (1 + 500 * brake));
    return out;
  }
  window.GalaxySim.worldRotation = worldRotation;
  window.GalaxySim.tidalLockRadius = tidalLockRadius;

  // What o'clock it is on the world in a landed descriptor, given the Earth
  // clock's own elapsed minutes. This is the ONLY place the two clocks meet,
  // and it is one-way: Earth time is read, never written. A world with a six
  // hour day runs through four dawns while an Earth day passes; a world with a
  // thousand hour day sits in the same afternoon for a month and a half; a
  // frozen world never moves off its one hour at all.
  function localHourFor(desc, totalEarthMinutes) {
    const day = desc && desc.day;
    if (!day) return null;
    if (day.frozen) return day.fixedHour;
    const dh = day.dayHours;
    if (!(dh > 0)) return null;
    if (Math.abs(dh - 24) < 1e-6) return null;   // an Earth-length day: no remapping at all
    const h = (Number(totalEarthMinutes) || 0) / 60;
    return (((h % dh) + dh) % dh) / dh * 24;
  }
  window.GalaxySim.localHourFor = localHourFor;

  // Where on a frozen world the party set down. The landing grid's columns are
  // lines of longitude, so the column decides which side of the terminator this
  // is: the sub-stellar point is eternal noon, the far side eternal midnight,
  // and the ring between them an eternal sunrise or sunset that never finishes.
  function frozenHourForCell(gx, w) {
    if (!(w > 0)) return 12;
    const f = (((Number(gx) || 0) % w) + w) % w / w;
    return (12 + f * 24) % 24;
  }
  window.GalaxySim.frozenHourForCell = frozenHourForCell;

  // Which of the texture painter's families a world belongs to: "terrestrial"
  // (elevation-banded ocean, coast and mountain), "rocky" (crater fields), or
  // null for the ones nothing has been written for yet.
  function terrainFamilyOf(planet) {
    const R3D = window.GalaxySim.Renderer3D;
    if (!planet || !R3D) return null;
    const type = planet.type;
    if (R3D.isGasGiant(type) || R3D.isVolcanic(type) || R3D.isIcy(type)) return null;
    return R3D.isTerrestrial(type) ? "terrestrial" : "rocky";
  }

  function makeLandedDescriptor(planet, opts) {
    opts = opts || {};
    const PT = window.GalaxySim.PlanetTypes || {};
    const info = PT[planet.type] || {};
    const rgb = intToRgbArr(info.color) || [140, 150, 170];
    // The star this world is under, and how the world turns beneath it. The
    // system is whichever one the ship is in, since that is the only one a
    // landing can be made from.
    let system = opts.system || null;
    if (!system) {
      try { system = window.GalaxySim.getCurrentSystem(); } catch (e) { system = null; }
    }
    const star = starLight(system);
    // How big the star looks from here. Angular diameter is twice the star's
    // radius over the distance to it, and the sun's own radius is 0.00465 AU,
    // so the whole of it against the sun-from-Earth reference cancels down to
    // the star's radius in solar radii over the orbit in AU. A red dwarf world
    // has to huddle close to stay warm and gets a star three times the size of
    // ours; a world of a red giant gets one that fills a quarter of the sky.
    const orbitAU = (opts.isMoon && opts.parentPlanet)
      ? opts.parentPlanet.orbitRadius : planet.orbitRadius;
    star.apparent = (system && system.radius > 0 && orbitAU > 0)
      ? Math.max(0.25, Math.min(14, system.radius / orbitAU))
      : 1;
    const day = worldRotation(planet, system, opts);
    if (day.frozen) {
      const g = opts.gridCell || {};
      const gw = (opts.grid && opts.grid.w) || planetGridSize(planet).w;
      day.fixedHour = frozenHourForCell(
        (typeof g.gx === "number") ? g.gx : Math.floor(gw / 2), gw);
    }
    const moons = (planet.moons || []).map((m) => ({
      radius: (typeof m.radius === "number" && isFinite(m.radius)) ? m.radius : 0.3,
      color: m.color || "#cfd8e6",
      type: m.type || "rocky",
    }));
    // Screen-tint offset that biases the world's daylight toward its palette
    // (kept gentle so day never goes fully monochrome), plus the colour of the
    // star's own light on top of it: an ochre world under a red dwarf is not
    // the same daylight as the same ochre world under a blue giant.
    const tintOffset = rgb.map((c, i) => {
      const ground = Math.max(-90, Math.min(70, (c - 165) * 0.45));
      const lit = Math.max(-80, Math.min(60, (star.lightRel[i] - 1) * 110));
      return Math.round(Math.max(-140, Math.min(110, ground + lit)));
    });
    // What the sky over it is: the planet's own haze, pushed toward the colour
    // its star's light scatters to. Written so a sun-like star multiplies by
    // exactly one and leaves the old palette untouched.
    const skyBlend = rgb.map((c, i) => Math.round(
      Math.max(0, Math.min(255, c * (0.55 + 0.45 * star.skyRel[i])))));
    const airlessTypes = new Set([
      'mercurian', 'sub_mercurian', 'rocky', 'c_type_asteroid', 's_type_asteroid',
      'm_type_asteroid', 'trojan_asteroid', 'planetesimal', 'centaur', 'comet',
      'short_period_comet', 'long_period_comet', 'dwarf', 'irregular', 'carbonaceous'
    ]);
    const atmosphere = (planet.atmosphere !== undefined)
      ? !!planet.atmosphere
      : (opts.isMoon ? false : !airlessTypes.has(planet.type));
    return {
      name: planet.name || "",
      type: planet.type || "",
      atmosphere,
      radius: (typeof planet.radius === "number" && isFinite(planet.radius)) ? planet.radius : 1.0,
      rgb,
      skyBlend,          // sky gradient blends toward this
      tintOffset,        // [dr, dg, db] added to the weather day-tint
      star,              // { type, rgb, temp, lightRel, skyRel }
      day,               // { dayHours, locked, lockedTo, frozen, fixedHour }
      gravity: surfaceGravity(planet),   // Earth gravities at the surface
      // The planet's own elevation field and the landing grid it was picked
      // from: enough for the 3D world to raise exactly the coastlines and
      // mountains the landing picture showed.
      terrain: {
        seed: (window.GalaxySim.Renderer3D && window.GalaxySim.Renderer3D._seedFor)
          ? window.GalaxySim.Renderer3D._seedFor(planet) : 0,
        family: terrainFamilyOf(planet),
        // Which painter's relief the ground is cut from - "terrestrial",
        // "rocky", "icy", "volcanic" or "gas". `family` answers for the 2D
        // surface maps and has only ever known two of them; this one answers
        // for the 3D ground, which raises an ice moon out of the ice field and
        // a lava world out of the lava field instead of raising both out of
        // Earth's. See Renderer3D.surfaceFamilyOf / .planetElevation.
        surface: (window.GalaxySim.Renderer3D && window.GalaxySim.Renderer3D.surfaceFamilyOf)
          ? window.GalaxySim.Renderer3D.surfaceFamilyOf(planet.type) : "rocky",
        isOcean: planet.type === "ocean",   // i18n-ignore: planet type id
        grid: opts.grid || planetGridSize(planet),
        cell: opts.gridCell || null,
      },
      moons,
    };
  }
  window.GalaxySim.hexToRgbArr = hexToRgbArr;

  // Landing-grid size for a planet: bigger radius -> more squares. Grid is a
  // bounded w x h coordinate space (toroidal wrap both axes, see
  // WorldMapReturn.js's alien branch of _resolveAdjacentBiomeAndTransfer),
  // sliced from the planet's 256x128 equirectangular texture, so h stays at
  // roughly half of w to match that 2:1 aspect ratio.
  function planetGridSize(planet) {
    const r = (planet && typeof planet.radius === "number" && isFinite(planet.radius)) ? planet.radius : 1.0;
    const w = Math.max(6, Math.min(24, Math.round(6 + r * 5)));
    const h = Math.max(4, Math.round(w / 2));
    return { w, h };
  }
  window.GalaxySim.planetGridSize = planetGridSize;

  // Descriptor of the planet the party is currently standing on, or null when
  // not on an alien surface. Map 636 is ALSO reused for ordinary Earth biomes
  // reached from the world map, so this is gated on isAlienSurface() (map 636 +
  // an "Alien*" biome) as well as a galaxy-landing descriptor being present -
  // the planet sky / tint must never bleed onto a normal Earth proc map.
  function getSurfacePlanet() {
    if (!isAlienSurface()) return null;
    return (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._landedPlanet) || null;
  }
  window.GalaxySim.getSurfacePlanet = getSurfacePlanet;

  // Set up and enter the procedural surface for a planet ({ name, type, moons? }).
  // Reserves the transfer to map 636; the caller closes whatever scene it is in.
  // opts.gridCell = {gx, gy} picks which square of the planet's landing grid
  // (see planetGridSize) to touch down on; omitted/out-of-range defaults to
  // the grid's center square, matching the previous fixed-landing behavior
  // for callers that don't offer a picker (Sandbox teleport, etc.).
  // Where the party actually lands on a freshly generated alien square: the
  // exact center of the map, unless the terrain there is impassable (open
  // water, a crater rim...), in which case the nearest walkable tile instead.
  // Earth's own generators each promise their own open center/borders
  // (mountain ranges keep a clearing, roads/rivers never seal a crossing...),
  // but the alien elevation-banded terrestrial fill and crater fields are
  // continuous, so nothing guarantees the map's exact center is solid ground.
  function alienLandingSpawn(width, height) {
    const preferX = Math.floor(width / 2);
    const preferY = Math.floor(height / 2);
    const pg = $gameSystem && $gameSystem._procGenData;
    const AT = window.ProcGenAlienTerrain;
    if (AT && AT.findPassableLandingTile && pg && pg.generatedMapData) {
      return AT.findPassableLandingTile(
        pg.generatedMapData, pg.currentBiomeTileset, width, height, preferX, preferY
      );
    }
    return { x: preferX, y: preferY };
  }

  function enterPlanetSurface(planet, opts) {
    if (!planet || !planet.type) return false;
    opts = opts || {};
    const PT = window.GalaxySim.PlanetTypes || {};
    const biomeName = (PT[planet.type] && PT[planet.type].biome) || "Ice";   // i18n-ignore: biome id

    const breathable = planetBreathable(planet);
    // forceLife overrides the deterministic 10% roll (Sandbox "with Life" variant),
    // guaranteeing the surface generates random procedural species.
    $gameSystem._alienPlanetHasLife = opts.forceLife ? true : planetHasLife(planet);
    // What the surface scans as, which is what decides whether the biome's
    // tentacles grow on this particular world (see currentAlienGrowsBiosigns).
    $gameSystem._alienLifeSigns = ($gameSystem._alienPlanetHasLife || opts.forceLife)
      ? LIFE.STRONG : planetLifeSigns(planet);
    $gameSystem._awayFromShip = true;
    if (breathable) { removeEVASuits(); } else { applyEVASuits(); }

    // Fresh, totally-random enemy roster per planet (all landings share the
    // same proc coordinate, so the per-event caches must be cleared).
    $gameSystem._procGenEnemyTroops = {};
    $gameSystem._procGenEnemyPositions = {};
    $gameSystem._procGenDefeatedEnemies = [];

    $gameVariables.setValue(141, -1); // galaxy-sim landing marker
    $gameVariables.setValue(142, 0);
    $gameVariables.setValue(143, 0);

    const { w, h } = planetGridSize(planet);
    const cell = opts.gridCell || {};
    const gx = (typeof cell.gx === "number" && isFinite(cell.gx)) ? ((Math.floor(cell.gx) % w) + w) % w : Math.floor(w / 2);
    const gy = (typeof cell.gy === "number" && isFinite(cell.gy)) ? ((Math.floor(cell.gy) % h) + h) % h : Math.floor(h / 2);
    $gameSystem._procGenData.alienGrid = { w, h, gx, gy, biome: biomeName };
    // Built here rather than above, because which column of the landing grid
    // this is decides what o'clock it is forever on a tidally locked world.
    $gameSystem._landedPlanet = makeLandedDescriptor(planet, {
      gridCell: { gx, gy }, grid: { w, h },
      isMoon: !!opts.isMoon, parentPlanet: opts.parentPlanet || null,
    });
    // The same descriptor, kept for as long as the landing lasts rather than
    // only while map 636 is loaded: a cave, a structure or a building on the
    // planet is still off Earth, and anything that has to know which world the
    // party is on there (the minimap, for one) has nothing else to ask.
    $gameSystem._offEarthPlanet = $gameSystem._landedPlanet;
    $gameVariables.setValue(43, gx);
    $gameVariables.setValue(44, gy);

    const ok = $gameSystem.generateProceduralMap && $gameSystem.generateProceduralMap();
    if (!ok) return false;

    const PROC_MAP_ID = 636, W = 64, H = 64;
    const spawn = alienLandingSpawn(W, H);
    $gamePlayer.reserveTransfer(PROC_MAP_ID, spawn.x, spawn.y, 2, 0);
    return true;
  }
  window.GalaxySim.enterPlanetSurface = enterPlanetSurface;

  // Current planet-grid position/size while standing on an alien surface, or
  // null. Used by WorldMap.js to render the on-foot minimap/M-key overview.
  function getAlienGridInfo() {
    if (!isAlienSurface()) return null;
    const grid = (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData)
      ? $gameSystem._procGenData.alienGrid : null;
    return grid || null;
  }
  window.GalaxySim.getAlienGridInfo = getAlienGridInfo;

  // ----------------------------------------------------------------------------
  // OFF EARTH
  // ----------------------------------------------------------------------------
  // isAlienSurface() answers for map 636 alone, so every map reached FROM the
  // surface (a cave, a wreck, a building interior) reads as Earth again, and
  // anything drawing a chart there falls back to an Earth tile that has nothing
  // to do with where the party is standing. The landing itself outlives those
  // maps: _procGenData.alienGrid is only struck out on leaving the planet
  // (clearAlienSurfaceState), and _offEarthPlanet is kept beside it.
  function offEarthGrid() {
    const pg = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._procGenData : null;
    return (pg && pg.alienGrid) || null;
  }
  function isOffEarth() { return !!offEarthGrid(); }
  function getOffEarthPlanet() {
    if (!isOffEarth()) return null;
    return ((typeof $gameSystem !== "undefined" && $gameSystem)
      ? ($gameSystem._offEarthPlanet || $gameSystem._landedPlanet) : null) || null;
  }
  function getOffEarthGridInfo() { return isOffEarth() ? offEarthGrid() : null; }
  window.GalaxySim.isOffEarth = isOffEarth;
  window.GalaxySim.getOffEarthPlanet = getOffEarthPlanet;
  window.GalaxySim.getOffEarthGridInfo = getOffEarthGridInfo;

  // ============================================================================
  // Alien ground terrain bridge
  // ----------------------------------------------------------------------------
  // ProceduralMapBiomeGenerator.js's alien-surface terrain generators need two
  // things from GalaxySim to sample the SAME field the landing-grid picker's
  // texture was painted from (see Renderer3D.terrestrialElevation /
  // .rockyCraterList): the planet's noise seed, and (for the rocky/cratered
  // family) its crater scatter. Both are cheap to recompute but session-cached
  // per landing so a square regenerated twice (revisit, save/load) samples the
  // identical data every time.
  // ============================================================================
  let _landedTerrainCache = null; // { key, seed, craters }
  function _landedTerrainState() {
    const planet = getSurfacePlanet();
    if (!planet) return null;
    const key = planet.name || "";
    if (_landedTerrainCache && _landedTerrainCache.key === key) return _landedTerrainCache;
    const R3D = window.GalaxySim.Renderer3D;
    if (!R3D) return null;
    _landedTerrainCache = { key, seed: R3D._seedFor(planet), craters: null };
    return _landedTerrainCache;
  }

  // Noise seed for the current landed planet -- identical to the one the
  // landing-grid picker's texture was painted with (getAlienGridTextureCanvas).
  function getLandedPlanetSeed() {
    const state = _landedTerrainState();
    return state ? state.seed : 0;
  }
  window.GalaxySim.getLandedPlanetSeed = getLandedPlanetSeed;

  // The current landed planet's crater scatter (Renderer3D.rockyCraterList),
  // cached per landing so every square draws from the same list.
  function getLandedCraterList(count) {
    const state = _landedTerrainState();
    if (!state) return [];
    if (!state.craters) {
      const R3D = window.GalaxySim.Renderer3D;
      state.craters = (R3D && R3D.rockyCraterList) ? R3D.rockyCraterList(state.seed, count) : [];
    }
    return state.craters;
  }
  window.GalaxySim.getLandedCraterList = getLandedCraterList;

  // Which of Renderer3D's texture-painter families the current landed planet
  // belongs to: "terrestrial" (paintTerrestrial -- gets the elevation-banded
  // ocean/coast/mountain ground), "rocky" (the paintRocky fallback bucket --
  // gets macro crater fields), or null (icy/volcanic/gas-giant: not reworked
  // yet, ProceduralMapBiomeGenerator.js keeps the plain terrain fill for those).
  function getLandedTerrainFamily() {
    return terrainFamilyOf(getSurfacePlanet());
  }
  window.GalaxySim.getLandedTerrainFamily = getLandedTerrainFamily;

  // Lazily-built, session-cached equirectangular texture canvas for the
  // currently-landed planet or a targeted planet (keyed by planet name -- cheap
  // to regenerate, not persisted to save data). Returns null off an alien surface
  // unless a target planet is explicitly provided.
  let _alienGridTextureCache = null; // { key, canvas }
  function getAlienGridTextureCanvas(targetPlanet) {
    const landed = targetPlanet || getSurfacePlanet() || getOffEarthPlanet();
    const R3D = window.GalaxySim.Renderer3D;
    if (!landed || !R3D || !R3D.getPlanetTextureCanvas) return null;
    const key = landed.name || "";
    if (_alienGridTextureCache && _alienGridTextureCache.key === key) {
      return _alienGridTextureCache.canvas;
    }
    const seed = R3D._seedFor ? R3D._seedFor(landed) : 0;
    const canvas = R3D.getPlanetTextureCanvas(landed, seed);
    if (!canvas) return null;
    _alienGridTextureCache = { key, canvas };
    return canvas;
  }
  window.GalaxySim.getAlienGridTextureCanvas = getAlienGridTextureCanvas;

  // ============================================================================
  // Setting down again somewhere else on the same planet
  // ----------------------------------------------------------------------------
  // Not enterPlanetSurface: the party is already on this world, so the life
  // roll, the life signs, the EVA suits and the enemy caches must all be left
  // exactly as they are. Landing again is the grid cell, the two world-coordinate
  // variables the generator reads and a fresh map, which is the same work a
  // border crossing does (WorldMapReturn's alien branch) with the destination
  // picked rather than walked into. A party that had gone underground comes back
  // up: the ship sets down on the surface, never in the caves under it.
  // ============================================================================
  function relandOnPlanet(gx, gy) {
    if (!isAlienSurface()) return false;
    const grid = getAlienGridInfo();
    if (!grid) return false;
    const nx = ((Math.floor(gx) % grid.w) + grid.w) % grid.w;
    const ny = ((Math.floor(gy) % grid.h) + grid.h) % grid.h;
    grid.gx = nx;
    grid.gy = ny;
    $gameVariables.setValue(43, nx);
    $gameVariables.setValue(44, ny);
    $gameSystem._procGenData.biomeLayerStack = [];
    if (!($gameSystem.generateProceduralMap && $gameSystem.generateProceduralMap())) return false;
    const PROC_MAP_ID = 636, W = 64, H = 64;
    const spawn = alienLandingSpawn(W, H);
    $gamePlayer.reserveTransfer(PROC_MAP_ID, spawn.x, spawn.y, 2, 0);
    return true;
  }
  window.GalaxySim.relandOnPlanet = relandOnPlanet;

  // ============================================================================
  // The other way down: a liminal walk
  // ----------------------------------------------------------------------------
  // Instead of generating a 64x64 surface square to walk about on, open the 3D
  // world on the planet itself: one biome from pole to pole, in the world's own
  // colours and under its own sky, with whatever lives there roaming it.
  //
  // Offered wherever a landing site is confirmed - from orbit (the star map's
  // landing grid) and on the ground (Scene_AlienLandingGrid) - so both routes
  // resolve it here rather than each keeping a copy.
  //
  // `planet` is either a raw planet (from orbit) or the landed descriptor of the
  // world the party is already standing on; the descriptor is reused as-is with
  // its grid cell moved, because everything else about it was settled on the way
  // down and must not be rolled again.
  // ============================================================================
  function startLiminalWalk(planet, gx, gy, opts) {
    opts = opts || {};
    const VW = window.VoxelWorldSystem;
    if (!VW || !VW.startAlienWalk || !planet || !planet.type) return false;
    // A flyby is the same world opened the same way; the only difference is
    // what the party arrives in, so it takes the same route in.
    if (opts.flyby && !VW.startAlienFlyby) return false;
    const PT = window.GalaxySim.PlanetTypes || {};
    const biomeName = (PT[planet.type] && PT[planet.type].biome) || null;
    const list = (window.WorldGen && window.WorldGen.Biomes) || [];
    const biome = biomeName ? list.find((b) => b && b.name === biomeName) : null;
    if (!biome) return false;

    const grid = opts.grid || planetGridSize(planet);
    const cell = {
      gx: ((Math.floor(gx) % grid.w) + grid.w) % grid.w,
      gy: ((Math.floor(gy) % grid.h) + grid.h) % grid.h,
    };

    // Its own creatures, where it has any.
    let species = null;
    const hasLife = (opts.hasLife != null) ? !!opts.hasLife : planetHasLife(planet);
    if (hasLife) {
      species = (alienSpeciesRoster(planet) || [])
        .map((sp) => sp.enemyId).filter((id) => id > 0);
      if (!species.length) species = null;
    }

    // The square that was picked comes along: on a tidally locked world it is
    // the whole difference between landing in eternal noon and eternal night.
    const desc = planet.terrain
      ? planet
      : makeLandedDescriptor(planet, {
          gridCell: cell, grid,
          isMoon: !!opts.isMoon, parentPlanet: opts.parentPlanet || null,
        });
    if (desc.terrain) {
      desc.terrain.grid = grid;
      desc.terrain.cell = { gx: cell.gx, gy: cell.gy };
    }
    if (desc.day && desc.day.frozen) desc.day.fixedHour = frozenHourForCell(cell.gx, grid.w);
    if (opts.flyby) {
      return !!VW.startAlienFlyby(biome, desc, species, { atHelm: !!opts.atHelm });
    }
    return !!VW.startAlienWalk(biome, desc, species);
  }
  window.GalaxySim.startLiminalWalk = startLiminalWalk;

  // ============================================================================
  // Flying the ship by hand, from the bridge
  // ----------------------------------------------------------------------------
  // The bridge is opened from INSIDE the ship (VoxelWorldSystem.startShipBridge,
  // which map 721's bridge door calls), so unlike the flyby nobody has picked a
  // world off a landing grid: this has to work out for itself what the ship is
  // currently over, and open that.
  //
  // A ship in orbit of a world opens that world's sky, at the square under it.
  // A ship anywhere else - deep space, a star, its own hangar - has no world to
  // fly over, and the caller falls back on the one the party is standing on.
  // Answers true when it opened something.
  // ============================================================================
  function startShipBridgeFlight() {
    const dm = window.GalaxySim.dataManager || window.GalaxySim.DataManager;
    const ship = dm && dm.playerShip;
    if (!ship || ship.isMoving) return false;
    const planetName = ship.currentPlanet;
    if (!planetName) return false;
    const system = dm.getSystem && dm.getSystem(ship.currentSystem);
    if (!system || !system.planets) return false;
    let planet = system.planets.find((p) => p && p.name === planetName);
    // A moon is a world to fly over like any other.
    let parent = null;
    if (!planet) {
      for (const p of system.planets) {
        const moon = (p.moons || []).find((m) => m && m.name === planetName);
        if (moon) { planet = moon; parent = p; break; }
      }
    }
    if (!planet || !planet.type) return false;
    // The square the ship is over: nobody chose one, so it is the middle of the
    // world's own grid, which is the same square a flyby would start on if the
    // player had picked the centre of the picture.
    const grid = planetGridSize(planet);
    return startLiminalWalk(planet, Math.floor(grid.w / 2), Math.floor(grid.h / 2), {
      isMoon: !!parent, parentPlanet: parent, flyby: true, atHelm: true,
    });
  }
  window.GalaxySim.startShipBridgeFlight = startShipBridgeFlight;

  // ============================================================================
  // Landing-site picker on foot (Scene_AlienLandingGrid)
  // ----------------------------------------------------------------------------
  // In orbit the landing square is chosen from the star map's own overlay
  // (GalaxySim_Overlay's showLandingGrid). On the ground there is no world map to
  // go back to, so every "return to the world map" route diverts here instead:
  // the same unwrapped planet texture cut into the same landing grid, the square
  // the party is standing on marked in red, and confirming one sets the ship down
  // on it. Cancelling leaves the party exactly where they were.
  // ============================================================================
  const LG_PAD = 40;      // page margin around the grid
  const LG_TITLE_H = 52;  // strip above it
  const LG_HELP_H = 40;   // strip below it

  // The grid is drawn as large as the page allows while keeping its own cell
  // aspect: the texture is equirectangular and planetGridSize keeps h at half of
  // w, so the picture is twice as wide as it is tall and the squares stay square.
  function landingGridDestSize(grid) {
    const availW = Graphics.boxWidth - LG_PAD * 2;
    const availH = Graphics.boxHeight - LG_PAD * 2 - LG_TITLE_H - LG_HELP_H;
    let w = availW;
    let h = Math.round((w * grid.h) / grid.w);
    if (h > availH) {
      h = availH;
      w = Math.round((h * grid.w) / grid.h);
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  // The two ways down, asked once a square has been chosen. The same pair the
  // star map's landing grid offers from orbit (GalaxySim_Overlay's mode
  // buttons): set the ship down and walk the generated surface square, or open
  // the 3D world on the planet itself.
  class Window_LandingMode extends Window_Command {
    makeCommandList() {
      this.addCommand(T('Galaxy.hud.landHere'), "land");
      this.addCommand(T('Galaxy.hud.liminalWalk'), "walk");
      this.addCommand(T('Galaxy.hud.flyby'), "flyby");
    }
  }
  window.Window_LandingMode = Window_LandingMode;

  class Scene_AlienLandingGrid extends Scene_MenuBase {
    create() {
      super.create();
      this._planet = Scene_AlienLandingGrid._targetPlanet || getSurfacePlanet();
      this._moonOf = Scene_AlienLandingGrid._targetMoonOf || null;
      Scene_AlienLandingGrid._targetPlanet = null;
      Scene_AlienLandingGrid._targetMoonOf = null;
      if (this._planet && !isAlienSurface()) {
        const { w, h } = planetGridSize(this._planet);
        this._grid = { w, h, gx: Math.floor(w / 2), gy: Math.floor(h / 2) };
      } else {
        this._grid = getAlienGridInfo() || { w: 1, h: 1, gx: 0, gy: 0 };
      }
      this._cursor = { gx: this._grid.gx, gy: this._grid.gy };
      this._leaving = false;
      this.createGridSprite();
      this.createTextSprite();
      this.createModeWindow();
      this.redrawAll();
    }

    createModeWindow() {
      const w = 320;
      const h = this.calcWindowHeight(3, true);
      const rect = new Rectangle(
        Math.floor((Graphics.boxWidth - w) / 2),
        Math.floor((Graphics.boxHeight - h) / 2),
        w, h
      );
      const win = new Window_LandingMode(rect);
      win.setHandler("land", this.commandLand.bind(this));
      win.setHandler("walk", this.commandLiminalWalk.bind(this));
      win.setHandler("flyby", this.commandFlyby.bind(this));
      win.setHandler("cancel", this.commandModeCancel.bind(this));
      win.hide();
      win.deactivate();
      this._modeWindow = win;
      this.addWindow(win);
    }

    createGridSprite() {
      const size = landingGridDestSize(this._grid);
      const sprite = new Sprite(new Bitmap(size.w, size.h));
      sprite.x = Math.floor((Graphics.boxWidth - size.w) / 2);
      sprite.y = LG_PAD + LG_TITLE_H +
        Math.floor((Graphics.boxHeight - LG_PAD * 2 - LG_TITLE_H - LG_HELP_H - size.h) / 2);
      this._gridSprite = sprite;
      this.addChild(sprite);
    }

    createTextSprite() {
      this._textSprite = new Sprite(new Bitmap(Graphics.boxWidth, Graphics.boxHeight));
      this.addChild(this._textSprite);
    }

    redrawAll() {
      const R3D = window.GalaxySim.Renderer3D;
      const texture = getAlienGridTextureCanvas(this._planet);
      const bmp = this._gridSprite.bitmap;
      bmp.clear();
      if (R3D && R3D.drawPlanetGrid && texture) {
        R3D.drawPlanetGrid(bmp.context, {
          textureCanvas: texture,
          destW: bmp.width, destH: bmp.height,
          gridW: this._grid.w, gridH: this._grid.h,
          highlightCell: this._cursor,
          playerCell: isAlienSurface() ? { gx: this._grid.gx, gy: this._grid.gy } : null,
        });
        bmp.baseTexture.update();
      }
      this.redrawText();
    }

    redrawText() {
      const bmp = this._textSprite.bitmap;
      const width = bmp.width - LG_PAD * 2;
      bmp.clear();
      bmp.fontFace = $gameSystem.mainFontFace();
      bmp.outlineColor = "rgba(0, 0, 0, 0.75)";
      bmp.fontSize = 26;
      bmp.textColor = "#ffe9a8";
      const name = (this._planet && this._planet.name) || "";
      const title = name
        ? `${T('Galaxy.hud.chooseLandingSite')} · ${name}`
        : T('Galaxy.hud.chooseLandingSite');
      bmp.drawText(title, LG_PAD, LG_PAD, width, LG_TITLE_H, "left");

      // Draw action buttons: Land Here, Liminal Walk, Flyby
      const buttons = [
        { id: "land", text: T('Galaxy.hud.landHere') },
        { id: "walk", text: T('Galaxy.hud.liminalWalk') },
        { id: "flyby", text: T('Galaxy.hud.flyby') },
      ];
      this._buttonRects = [];
      let btnX = LG_PAD;
      const btnH = 32;
      const btnW = 140;
      const btnGap = 12;
      const helpY = Graphics.boxHeight - LG_PAD - LG_HELP_H;
      const btnY = helpY + Math.floor((LG_HELP_H - btnH) / 2);
      const ctx = bmp.context;
      bmp.fontSize = 15;
      for (const b of buttons) {
        ctx.save();
        ctx.fillStyle = "rgba(16, 26, 46, 0.85)";
        ctx.strokeStyle = "#4b7ab8";
        ctx.lineWidth = 1.5;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(btnX, btnY, btnW, btnH, 4);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(btnX, btnY, btnW, btnH);
          ctx.strokeRect(btnX, btnY, btnW, btnH);
        }
        ctx.restore();
        bmp.textColor = "#d8e6f8";
        bmp.drawText(b.text, btnX, btnY, btnW, btnH, "center");
        this._buttonRects.push({ id: b.id, x: btnX, y: btnY, w: btnW, h: btnH });
        btnX += btnW + btnGap;
      }

      bmp.fontSize = 18;
      bmp.textColor = "#cfd8e6";
      bmp.drawText(`${this._cursor.gx}, ${this._cursor.gy}`, LG_PAD, helpY, width, LG_HELP_H, "right");
    }

    buttonAt(px, py) {
      if (!this._buttonRects) return null;
      for (const b of this._buttonRects) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
          return b.id;
        }
      }
      return null;
    }

    moveCursor(dx, dy) {
      this._cursor.gx = ((this._cursor.gx + dx) % this._grid.w + this._grid.w) % this._grid.w;
      this._cursor.gy = ((this._cursor.gy + dy) % this._grid.h + this._grid.h) % this._grid.h;
      SoundManager.playCursor();
      this.redrawAll();
    }

    // Which square a screen point falls on, or null off the picture.
    cellAt(px, py) {
      const sprite = this._gridSprite;
      const bmp = sprite.bitmap;
      const x = px - sprite.x;
      const y = py - sprite.y;
      if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return null;
      return {
        gx: Math.min(this._grid.w - 1, Math.floor((x / bmp.width) * this._grid.w)),
        gy: Math.min(this._grid.h - 1, Math.floor((y / bmp.height) * this._grid.h)),
      };
    }

    // A square has been chosen; now which of the two ways down.
    confirm() {
      SoundManager.playOk();
      this._modeWindow.select(0);
      this._modeWindow.show();
      this._modeWindow.activate();
    }

    commandModeCancel() {
      this._modeWindow.hide();
      this._modeWindow.deactivate();
    }

    // Set the ship down: a fresh surface square at the chosen grid cell.
    commandLand() {
      this._leaving = true;
      let ok = false;
      if (isAlienSurface()) {
        ok = relandOnPlanet(this._cursor.gx, this._cursor.gy);
      } else if (this._planet) {
        ok = enterPlanetSurface(this._planet, {
          gridCell: { gx: this._cursor.gx, gy: this._cursor.gy },
          isMoon: !!this._moonOf,
          parentPlanet: this._moonOf || null,
        });
      }
      if (ok) {
        SceneManager.goto(Scene_Map);
      } else {
        SoundManager.playBuzzer();
        this._leaving = false;
        this.commandModeCancel();
        this._modeWindow.activate();
      }
    }

    // Walk the whole world instead: the 3D planet, at the chosen longitude.
    commandLiminalWalk() {
      const planet = this._planet;
      const hasLife = (planet && planetHasLife) ? planetHasLife(planet) : !!($gameSystem && $gameSystem._alienPlanetHasLife);
      const started = planet && startLiminalWalk(planet, this._cursor.gx, this._cursor.gy, {
        grid: { w: this._grid.w, h: this._grid.h },
        hasLife: hasLife,
        isMoon: !!this._moonOf,
        parentPlanet: this._moonOf || null,
      });
      if (!started) {
        SoundManager.playBuzzer();
        this.commandModeCancel();
        this._modeWindow.activate();
        return;
      }
      this._leaving = true;
      this.popScene();
    }

    // A flyby over the 3D world: the party remains aboard and flies over it.
    commandFlyby() {
      const planet = this._planet;
      const hasLife = (planet && planetHasLife) ? planetHasLife(planet) : !!($gameSystem && $gameSystem._alienPlanetHasLife);
      const started = planet && startLiminalWalk(planet, this._cursor.gx, this._cursor.gy, {
        grid: { w: this._grid.w, h: this._grid.h },
        hasLife: hasLife,
        isMoon: !!this._moonOf,
        parentPlanet: this._moonOf || null,
        flyby: true,
        atHelm: true,
      });
      if (!started) {
        SoundManager.playBuzzer();
        this.commandModeCancel();
        this._modeWindow.activate();
        return;
      }
      this._leaving = true;
      this.popScene();
    }

    update() {
      super.update();
      // Never read the press that opened the scene, nor one made on the way out,
      // and leave the grid alone while the way down is being chosen.
      if (this._leaving || !this.isActive()) return;
      if (this._modeWindow && this._modeWindow.active) return;
      let dx = 0, dy = 0;
      if (Input.isRepeated("left")) dx = -1;
      else if (Input.isRepeated("right")) dx = 1;
      if (Input.isRepeated("up")) dy = -1;
      else if (Input.isRepeated("down")) dy = 1;
      if (dx || dy) this.moveCursor(dx, dy);
      // A click on buttons or picks the square outright
      if (TouchInput.isTriggered()) {
        const btn = this.buttonAt(TouchInput.x, TouchInput.y);
        if (btn === "land") {
          SoundManager.playOk();
          this.commandLand();
          return;
        } else if (btn === "walk") {
          SoundManager.playOk();
          this.commandLiminalWalk();
          return;
        } else if (btn === "flyby") {
          SoundManager.playOk();
          this.commandFlyby();
          return;
        }
        const cell = this.cellAt(TouchInput.x, TouchInput.y);
        if (cell) {
          this._cursor = cell;
          this.redrawAll();
          this.confirm();
          return;
        }
      }
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.popScene();
      } else if (Input.isTriggered("ok")) {
        this.confirm();
      }
    }
  }
  window.Scene_AlienLandingGrid = Scene_AlienLandingGrid;

  // Open the picker, or answer false when there is nothing to pick from (not on
  // a planet surface, or the renderer that draws the planet is not loaded). Every
  // "return to the world map" route asks this first while the party is planetside.
  function openLandingGridPicker(planet, moonOf) {
    const targetPlanet = planet || getSurfacePlanet();
    if (!targetPlanet) return false;
    if (!planet && (!isAlienSurface() || !getAlienGridInfo())) return false;
    const R3D = window.GalaxySim.Renderer3D;
    if (!R3D || !R3D.drawPlanetGrid || !getAlienGridTextureCanvas(targetPlanet)) return false;
    Scene_AlienLandingGrid._targetPlanet = targetPlanet;
    Scene_AlienLandingGrid._targetMoonOf = moonOf || null;
    SceneManager.push(Scene_AlienLandingGrid);
    return true;
  }
  window.GalaxySim.openLandingGridPicker = openLandingGridPicker;

  // Which hand-authored landing site the party is standing on, and whether it
  // is off Earth. A landing site is an ordinary authored map with no biome and
  // no procedural state of its own, so nothing about the map itself says the
  // party is on another world: the answer is the system and planet the ship was
  // orbiting when it set down, recorded here and held until the party leaves
  // that map. Read it through offworldLandingSite() (the sprite catalogue asks
  // it who is likely to be walking about, see SpriteCatalog.alienShare).
  const HOME_SYSTEM = "Sol";     // i18n-ignore: system id
  const HOME_PLANET = "Earth";   // i18n-ignore: planet id
  function landingSiteRecord(loc) {
    const dm = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem.starMapData : null;
    const ship = dm && dm.playerShip;
    const system = (ship && ship.currentSystem) || null;
    const planet = (ship && ship.currentPlanet) || null;
    return {
      name: loc.name || "", mapId: loc.mapId, x: loc.x || 1, y: loc.y || 1,
      system, planet,
      // Earth's own spaceports are landing sites too, and they are not alien
      // ground. Anything the ship reached from another system or another world
      // is: an unresolved system reads as home rather than guessing otherwise.
      offworld: !!(system && (system !== HOME_SYSTEM || (planet && planet !== HOME_PLANET))),
    };
  }
  function landingSite() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    const rec = $gameSystem._gxLandingSite;
    if (!rec || typeof $gameMap === "undefined" || !$gameMap) return null;
    return $gameMap.mapId() === rec.mapId ? rec : null;
  }
  function offworldLandingSite() {
    const rec = landingSite();
    return (rec && rec.offworld) ? rec : null;
  }
  window.GalaxySim.landingSite = landingSite;
  window.GalaxySim.offworldLandingSite = offworldLandingSite;

  // Teleport the party to a hand-authored landing site ({ name, mapId, x, y },
  // optionally `dir`: the direction the party is left facing, 2/4/6/8, down by
  // default), e.g. one of Earth's spaceports. Deliberately does not touch the scene stack
  // (callers close/pop their own UI). When the site sits on the world map (315),
  // the Starship is parked one tile below the arrival point and the position is
  // persisted to VehiclePosition, mirroring FastTravelSystem's completeTravelAirship
  // so the ship is physically there and the player steps off it on foot.
  function teleportToLandingSite(loc) {
    if (!loc || loc.mapId == null) return false;
    if (typeof $gameSystem !== "undefined" && $gameSystem) {
      $gameSystem._awayFromShip = true;
      $gameSystem._gxLandingSite = landingSiteRecord(loc);
    }
    // A landing site is a hand-authored map, never a procedural planet surface,
    // so the previous landing ends here (see clearAlienSurfaceState).
    clearAlienSurfaceState();
    const x = loc.x || 1, y = loc.y || 1;
    if (loc.mapId === 315 && window.VehiclePosition) {
      const shipVehicle = $gameMap.vehicle && $gameMap.vehicle("airship");
      if (shipVehicle) shipVehicle.setLocation(315, x, y + 1);
      window.VehiclePosition.set("airship", 315, x, y + 1, x, y + 1);
    }
    const dir = [2, 4, 6, 8].includes(loc.dir) ? loc.dir : 2;
    $gamePlayer.reserveTransfer(loc.mapId, x, y, dir, 0);
    return true;
  }
  window.GalaxySim.teleportToLandingSite = teleportToLandingSite;

  // The landing grid is what makes the procedural generator answer "this
  // planet's biome" for every square it is asked about (generateProceduralMap's
  // alienGrid branch, and WorldMapReturn's edge crossing, which keys off an
  // "Alien*" currentBiome). Both live in $gameSystem._procGenData, which is
  // world state that outlives the trip, so leaving the planet has to strike
  // them out: otherwise every Earth square entered afterwards still generates
  // as the surface of the last planet visited.
  function clearAlienSurfaceState() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    const pg = $gameSystem._procGenData;
    if (pg) {
      pg.alienGrid = null;
      if (/^Alien/.test(String(pg.currentBiome || ""))) {
        pg.currentBiome = null;
        pg.currentRoadDirection = null;
      }
    }
    $gameSystem._alienPlanetHasLife = false;
    $gameSystem._alienLifeSigns = LIFE.NONE;
    $gameSystem._offEarthPlanet = null;
    _alienGridTextureCache = null;
  }
  window.GalaxySim.clearAlienSurfaceState = clearAlienSurfaceState;

  // Leaving the alien surface (any map that isn't the proc map) drops the suits
  // and the landed-planet descriptor. Arriving in the Starship interior (map 721)
  // clears the "away from ship" flag that keeps Return to Ship visible planetside.
  // Both the ship interior and Earth's world map (315) also end the landing
  // itself: nothing reached through either is on a planet surface any more, so
  // the next procedural map generated resolves against Earth again.
  const SHIP_INTERIOR_MAP = 721;
  const EARTH_WORLD_MAP = 315;
  const _GS_Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _GS_Game_Map_setup.call(this, mapId);
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (mapId !== 636) {
      if ($gameSystem._evaSuitActive) removeEVASuits();
      $gameSystem._landedPlanet = null;
    }
    // The landing site is the map it names and nothing else: stepping off it
    // (into a building, back onto the world map) ends it.
    if ($gameSystem._gxLandingSite && $gameSystem._gxLandingSite.mapId !== mapId) {
      $gameSystem._gxLandingSite = null;
    }
    if (mapId === SHIP_INTERIOR_MAP || mapId === EARTH_WORLD_MAP) {
      clearAlienSurfaceState();
    }
    if (mapId === SHIP_INTERIOR_MAP) {
      $gameSystem._awayFromShip = false;
      // First time aboard, the telescope's refit is pinned to the quest log.
      hubbleQuestOpen();
      // Entering spaceship interior sets the respawn point to the helm (map 721, x 28, y 10)
      const mapVar = (window.BSE && window.BSE.Params && window.BSE.Params.respawnMapVar) || 25;
      const xVar = (window.BSE && window.BSE.Params && window.BSE.Params.respawnXVar) || 26;
      const yVar = (window.BSE && window.BSE.Params && window.BSE.Params.respawnYVar) || 27;
      $gameVariables.setValue(mapVar, 721);
      $gameVariables.setValue(xVar, 28);
      $gameVariables.setValue(yVar, 10);
      $gameSystem._respawnProcSurface = null;
      $gameSystem._respawnPointSet = true;
    }
  };

  // ============================================================================
  // Procedural alien species. A living world (see currentAlienHasLife) hosts a
  // roster of 1-6 species, deterministic from the world seed AND the world's own
  // name, so every planet has its own creatures rather than the galaxy sharing
  // one set. Each species maps to a base enemy id (its 3D look, which the
  // battler system already re-rolls per world seed) and a procedurally generated
  // name. Encountering one records it for the Aliens tab of the bestiary.
  //
  // What decides WHICH base enemies a world may draw is the world's own level
  // (planetLevel): the look is picked from the creatures built at around that
  // level, which is how a planet ends up uniformly gentle or uniformly lethal
  // and how the biosignature tier can promise anything about a landing.
  // ============================================================================
  function worldSeedInt() {
    try {
      if (window.HistoryManager && window.HistoryManager.getSeed) {
        return (window.HistoryManager.getSeed() >>> 0);
      }
    } catch (e) { /* default */ }
    return 19002001;
  }
  function mulberry(seedInt) {
    let s = seedInt >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function alienSpeciesName(seedInt) {
    const syll = ["xa", "zor", "qui", "nu", "thi", "ka", "vel", "om", "ir", "ssu",
      "gla", "uut", "ny", "za", "rho", "kel", "vor", "ith", "ax", "un", "dra", "eph"];
    const rnd = mulberry(seedInt);
    const parts = 2 + Math.floor(rnd() * 2);
    let n = "";
    for (let i = 0; i < parts; i++) n += syll[Math.floor(rnd() * syll.length)];
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  // The level a creature is built at, off its own note. Same tag the battle
  // system reads (BSE.Helpers.getEnemyLevel); parsed here so the roster does
  // not depend on the battle plugins having loaded first.
  function enemyNoteLevel(enemy) {
    const m = String((enemy && enemy.note) || "").match(/<Level:\s*(\d+)>/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Base enemy ids usable as a procedural species look (has a battler, not a
  // boss). With a level, only the creatures built within a band of it, widening
  // until the band holds something so no world is ever left without fauna.
  const ALIEN_BAND = 0.35;      // ±35% of the world's level on the first pass
  const ALIEN_BAND_PASSES = 4;  // then 70%, 105%, 140%, then the whole table

  function alienSpeciesPool(level) {
    const pool = [];
    if (typeof $dataEnemies === "undefined" || !$dataEnemies) return pool;
    for (let i = 1; i < $dataEnemies.length; i++) {
      const e = $dataEnemies[i];
      if (e && e.name && e.battlerName && !/<Boss>/i.test(e.note || "")) {
        pool.push({ id: i, level: enemyNoteLevel(e) });
      }
    }
    if (!level || !pool.length) return pool.map((p) => p.id);
    for (let pass = 1; pass <= ALIEN_BAND_PASSES; pass++) {
      const reach = level * ALIEN_BAND * pass;
      const inBand = pool.filter((p) => p.level > 0 && Math.abs(p.level - level) <= reach);
      if (inBand.length) return inBand.map((p) => p.id);
    }
    return pool.map((p) => p.id);
  }

  // A world's species roster, cached per world seed AND planet on $gameSystem.
  // Called with no argument it answers for the world being stood on; off a
  // surface (the sandbox, a menu) there is no planet to speak of and the old
  // galaxy-wide roster is what comes back.
  function alienSpeciesRoster(planet) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return [];
    const world = planet || getSurfacePlanet();
    const worldName = (world && world.name) || "";
    const seed = worldSeedInt();
    const level = worldName ? planetLevel(world) : 0;
    const cacheKey = seed + "|" + worldName;
    if (!$gameSystem._alienSpeciesRoster) $gameSystem._alienSpeciesRoster = {};
    if ($gameSystem._alienSpeciesRoster[cacheKey]) return $gameSystem._alienSpeciesRoster[cacheKey];
    const pool = alienSpeciesPool(level);
    // The planet's name is mixed into the stream as well as into the cache key,
    // so two worlds of one galaxy hold different creatures under different names.
    const nameHash = worldName ? fnv1a(worldName) : 0;
    const rnd = mulberry((seed ^ 0x5bd1e995) + nameHash);
    const count = pool.length ? (1 + Math.floor(rnd() * 6)) : 0; // 1..6
    const chosen = [];
    const used = new Set();
    for (let i = 0; i < count && pool.length; i++) {
      let eid, tries = 0;
      do { eid = pool[Math.floor(rnd() * pool.length)]; tries++; } while (used.has(eid) && tries < 24);
      used.add(eid);
      chosen.push({
        key: "sp" + seed + "_" + nameHash.toString(36) + "_" + i,
        name: alienSpeciesName(Math.imul(seed, 131) + nameHash + i * 977 + 7),
        enemyId: eid,
        worldSeed: seed,
        planet: worldName,
        level: enemyNoteLevel($dataEnemies[eid]),
      });
    }
    $gameSystem._alienSpeciesRoster[cacheKey] = chosen;
    return chosen;
  }
  function findAlienSpecies(key) {
    return alienSpeciesRoster().find((s) => s.key === key) || null;
  }
  function discoverAlienSpecies(sp) {
    if (!sp || typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!$gameSystem._discoveredAlienSpecies) $gameSystem._discoveredAlienSpecies = {};
    if (!$gameSystem._discoveredAlienSpecies[sp.key]) {
      $gameSystem._discoveredAlienSpecies[sp.key] = {
        key: sp.key, name: sp.name, enemyId: sp.enemyId, worldSeed: sp.worldSeed,
        planet: sp.planet || "", level: sp.level || 0,
      };
    }
  }
  function getDiscoveredAlienSpecies() {
    const d = (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._discoveredAlienSpecies) || {};
    return Object.keys(d).map((k) => d[k]);
  }
  // The set of base enemy ids that are ONLY seen as procedural aliens (so the
  // bestiary's Earth tab can exclude them). An id also seen on Earth stays Earth.
  function isAlienSpeciesEnemyId(eid) {
    const disc = getDiscoveredAlienSpecies();
    return disc.some((s) => s.enemyId === eid);
  }
  window.GalaxySim.alienSpeciesRoster = alienSpeciesRoster;
  window.GalaxySim.findAlienSpecies = findAlienSpecies;
  window.GalaxySim.discoverAlienSpecies = discoverAlienSpecies;
  window.GalaxySim.getDiscoveredAlienSpecies = getDiscoveredAlienSpecies;
  window.GalaxySim.isAlienSpeciesEnemyId = isAlienSpeciesEnemyId;

  // ==========================================================================
  // Crafting materials (see VehicleSystemRepair / ThinkerMenu, items 849-871)
  // ==========================================================================
  const MAT = {
    arcane: 849, ethereal: 850, quantum: 851, circuit: 852, microchip: 853,
    battery: 854, plastic: 855, resin: 856, nanotube: 857, plant: 858,
    wood: 859, bone: 860, cloth: 861, meat: 862, steel: 863, titanium: 864,
    varlenia: 865, crystal: 866, glass: 867, leather: 868, herb: 869,
    oil: 870, acid: 871, lead: 926,
  };

  function matItem(id) { return $dataItems ? $dataItems[id] : null; }
  function matName(id) {
    const it = matItem(id);
    return it ? String(it.name).trim() : "#" + id;
  }
  function matOwned(id) {
    const it = matItem(id);
    return (it && $gameParty) ? $gameParty.numItems(it) : 0;
  }
  function matGive(id, qty) {
    const it = matItem(id);
    if (it && $gameParty && qty > 0) $gameParty.gainItem(it, qty);
  }
  function matTake(cost) {
    Object.keys(cost || {}).forEach((id) => {
      const it = matItem(Number(id));
      if (it && $gameParty) $gameParty.loseItem(it, cost[id]);
    });
  }
  function matAfford(cost) {
    if ($gameSystem && $gameSystem._isSandboxMode) return true;
    return Object.keys(cost || {}).every((id) => matOwned(Number(id)) >= cost[id]);
  }
  window.GalaxySim.MAT = MAT;
  window.GalaxySim.matName = matName;
  window.GalaxySim.matOwned = matOwned;

  // Deterministic 32-bit hash of a string, mixed with the world seed, so any
  // per-body roll (a Hubble fault, an asteroid's ore body) is the same in every
  // savegame of the same world.
  function worldSeed() {
    try {
      if (window.HistoryManager && window.HistoryManager.getSeed) {
        return window.HistoryManager.getSeed() >>> 0;
      }
    } catch (e) { /* history not loaded yet */ }
    return 19002001;
  }
  function seededHash(key, salt) {
    let h = (2166136261 ^ worldSeed() ^ (salt || 0)) >>> 0;
    const s = String(key || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 15;
    return h >>> 0;
  }
  function seededFloat(key, salt) { return seededHash(key, salt) / 4294967296; }

  // ==========================================================================
  // The Hubble Space Telescope: a wreck in a 1 AU orbit that can be serviced
  // --------------------------------------------------------------------------
  // The telescope in the Sol system (Systems.json, `hubble: true`) starts every
  // world with real faults: a handful of assemblies are critically damaged and
  // the rest are worn. Servicing spends crafting materials, part by part, and a
  // fully restored telescope doubles the range of the biosignature sweep.
  // ==========================================================================
  // i18n-ignore-start: `name` is the state key (hubbleState()[name]) and the
  // service button's data-part; the label and note live in Galaxy.hubblePart.
  const HUBBLE_PARTS = [
    {
      name: "Primary Mirror", critical: true,
      cost: { [MAT.glass]: 24, [MAT.crystal]: 12, [MAT.titanium]: 8 },
    },
    {
      name: "Secondary Mirror", critical: false,
      cost: { [MAT.glass]: 14, [MAT.crystal]: 6 },
    },
    {
      name: "Corrective Optics (COSTAR)", critical: true,
      cost: { [MAT.glass]: 18, [MAT.crystal]: 10, [MAT.circuit]: 6 },
    },
    {
      name: "WFPC2 Camera", critical: false,
      cost: { [MAT.circuit]: 10, [MAT.microchip]: 6, [MAT.glass]: 8 },
    },
    {
      name: "STIS Spectrograph", critical: false,
      cost: { [MAT.circuit]: 12, [MAT.microchip]: 8, [MAT.battery]: 4 },
    },
    {
      name: "NICMOS Cooler", critical: false,
      cost: { [MAT.nanotube]: 6, [MAT.steel]: 10, [MAT.battery]: 6 },
    },
    {
      name: "Fine Guidance Sensor", critical: true,
      cost: { [MAT.microchip]: 10, [MAT.circuit]: 10, [MAT.glass]: 6 },
    },
    {
      name: "Gyroscope Assembly", critical: true,
      cost: { [MAT.steel]: 16, [MAT.titanium]: 10, [MAT.circuit]: 8 },
    },
    {
      name: "Reaction Wheels", critical: false,
      cost: { [MAT.steel]: 14, [MAT.titanium]: 8 },
    },
    {
      name: "Solar Array (Port)", critical: true,
      cost: { [MAT.circuit]: 12, [MAT.glass]: 10, [MAT.plastic]: 8 },
    },
    {
      name: "Solar Array (Starboard)", critical: true,
      cost: { [MAT.circuit]: 12, [MAT.glass]: 10, [MAT.plastic]: 8 },
    },
    {
      name: "Battery Bank", critical: false,
      cost: { [MAT.battery]: 14, [MAT.acid]: 8, [MAT.steel]: 6 },
    },
    {
      name: "High-Gain Antenna", critical: false,
      cost: { [MAT.circuit]: 8, [MAT.steel]: 10, [MAT.titanium]: 4 },
    },
    {
      name: "Aperture Door", critical: false,
      cost: { [MAT.steel]: 12, [MAT.plastic]: 6 },
    },
    {
      name: "Thermal Blanket", critical: false,
      cost: { [MAT.cloth]: 16, [MAT.plastic]: 10, [MAT.resin]: 6 },
    },
    {
      name: "DF-224 Computer", critical: true,
      cost: { [MAT.microchip]: 12, [MAT.circuit]: 14, [MAT.quantum]: 1 },
    },
  ];

  function hubbleState() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._hubbleParts) {
      // First look at the telescope in this world decides how badly it has
      // aged: four assemblies are critical, three more are worn, the rest hold.
      const state = {};
      const order = HUBBLE_PARTS
        .map((p, i) => ({ p, k: seededFloat(p.name, 1013 + i) }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.p);
      order.forEach((part, i) => {
        const roll = seededFloat(part.name, 2027 + i);
        if (i < 4) state[part.name] = Math.round(2 + roll * 22);
        else if (i < 7) state[part.name] = Math.round(35 + roll * 30);
        else state[part.name] = Math.round(72 + roll * 28);
      });
      $gameSystem._hubbleParts = state;
    }
    return $gameSystem._hubbleParts;
  }

  // i18n-ignore-end

  // Label and note for a part id, falling back to the id itself.
  function hubblePartText(name, field) {
    const key = 'Galaxy.hubblePart.' + name + '.' + field;
    return T.has(key) ? T(key) : (field === 'label' ? name : '');
  }

  const Hubble = {
    PARTS: HUBBLE_PARTS,
    partDef(name) { return HUBBLE_PARTS.find((p) => p.name === name) || null; },
    partHealth(name) {
      const s = hubbleState();
      if (!s) return 100;
      const v = s[name];
      return typeof v === "number" ? v : 100;
    },
    // Every part with its live condition and what putting it right would cost.
    parts() {
      return HUBBLE_PARTS.map((p) => {
        const health = Hubble.partHealth(p.name);
        return {
          name: p.name,
          label: hubblePartText(p.name, 'label'),
          critical: p.critical,
          note: hubblePartText(p.name, 'note'),
          health,
          cost: Hubble.repairCost(p.name),
          canAfford: matAfford(Hubble.repairCost(p.name)),
        };
      });
    },
    // Material cost scales with how much of the part is actually missing, so a
    // scratch is cheap and a write-off costs the full bill.
    repairCost(name) {
      const def = Hubble.partDef(name);
      if (!def) return {};
      const missing = Math.max(0, 100 - Hubble.partHealth(name)) / 100;
      if (missing <= 0) return {};
      const out = {};
      Object.keys(def.cost).forEach((id) => {
        out[id] = Math.max(1, Math.ceil(def.cost[id] * missing));
      });
      return out;
    },
    condition() {
      const list = HUBBLE_PARTS.map((p) => Hubble.partHealth(p.name));
      return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    },
    // Operational once nothing critical is broken and the optics are whole.
    isOperational() {
      return HUBBLE_PARTS.every((p) => Hubble.partHealth(p.name) >= (p.critical ? 100 : 60));
    },
    brokenCount() {
      return HUBBLE_PARTS.filter((p) => Hubble.partHealth(p.name) < 35).length;
    },
    repair(name) {
      const s = hubbleState();
      if (!s || Hubble.partHealth(name) >= 100) return false;
      const cost = Hubble.repairCost(name);
      if (!matAfford(cost)) return false;
      matTake(cost);
      s[name] = 100;
      hubbleQuestSync();
      return true;
    },
    // Service everything affordable, cheapest job first, and report what was done.
    // The journal is synced once at the end so a whole afternoon's work reads as
    // one entry rather than sixteen.
    repairAll() {
      const done = [];
      hubbleQuestDeferred = true;
      try {
        HUBBLE_PARTS.slice()
          .sort((a, b) => Hubble.partHealth(b.name) - Hubble.partHealth(a.name))
          .forEach((p) => { if (Hubble.repair(p.name)) done.push(p.name); });
      } finally {
        hubbleQuestDeferred = false;
      }
      hubbleQuestSync();
      return done;
    },
    questId() { return HUBBLE_QUEST_ID; },
    openQuest() { return hubbleQuestOpen(); },
    syncQuest() { return hubbleQuestSync(); },
  };
  window.GalaxySim.Hubble = Hubble;

  // ==========================================================================
  // The refit contract: the telescope's restoration as a journal quest
  // --------------------------------------------------------------------------
  // The first time the party boards the Starship (map 721) the refit is pinned
  // to the Kanban quest log with one objective per assembly. Every job done in
  // the servicing bay syncs the checklist, and the note closes itself once the
  // telescope is operational again (see Hubble.isOperational).
  // ==========================================================================
  const HUBBLE_QUEST_ID = "galaxysim_hubble_refit";   // i18n-ignore: journal id
  let hubbleQuestDeferred = false;   // set while repairAll batches its jobs

  function hubbleQuestText(key, params) {
    return T('Galaxy.hubbleQuest.' + key, params);
  }

  // One objective per assembly, counted done at the condition the servicing bay
  // calls serviceable: a critical assembly has to be whole, the rest sound.
  function hubbleQuestSteps() {
    return HUBBLE_PARTS.map((p) => {
      const health = Hubble.partHealth(p.name);
      return {
        name: p.name,
        text: hubblePartText(p.name, 'label') || p.name,
        detail: health + "%",
        done: health >= (p.critical ? 100 : 60),
      };
    });
  }

  function hubbleQuestMeta() {
    return {
      giver: hubbleQuestText('giver'),
      body: hubbleQuestText('body'),
      objectives: hubbleQuestText('objectives'),
      terms: T.list('Galaxy.hubbleQuest.terms'),
      reward: hubbleQuestText('reward'),
      diff: 3,
    };
  }

  // Pin the refit to the journal. Does nothing if the note is already there, or
  // if this world's telescope somehow needs no work at all.
  function hubbleQuestOpen() {
    if (!window.KanbanQuest || typeof $gameSystem === "undefined" || !$gameSystem) return false;
    if ($gameSystem._hubbleQuestAdded) return false;
    if (Hubble.isOperational()) return false;
    $gameSystem._hubbleQuestAdded = true;
    window.KanbanQuest.addQuest(HUBBLE_QUEST_ID, hubbleQuestText('title'),
      hubbleQuestText('log.opened'), hubbleQuestMeta());
    hubbleQuestSync(true);
    return true;
  }

  // Write the live checklist onto the note, log whatever has been serviced since
  // the last sync, and close the quest once nothing sits below its limit.
  function hubbleQuestSync(silent) {
    if (hubbleQuestDeferred) return;
    if (!window.KanbanQuest || typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!$gameSystem._hubbleQuestAdded) return;
    const quest = typeof window.KanbanQuest.getQuest === "function"
      ? window.KanbanQuest.getQuest(HUBBLE_QUEST_ID) : null;
    if (!quest) return;

    const steps = hubbleQuestSteps();
    const done = steps.filter((s) => s.done);
    const seen = $gameSystem._hubbleQuestServiced || [];
    const fresh = done.filter((s) => seen.indexOf(s.name) < 0);
    $gameSystem._hubbleQuestServiced = done.map((s) => s.name);

    const firstUndone = steps.findIndex((s) => !s.done);
    if (typeof window.KanbanQuest.setProgress === "function") {
      window.KanbanQuest.setProgress(HUBBLE_QUEST_ID, {
        done: done.length,
        total: steps.length,
        mode: "par",       // i18n-ignore: the journal's any-order marker
        status: "active",  // i18n-ignore: journal status id
        steps: steps.map((s, i) => ({
          text: s.text,
          done: s.done,
          current: !s.done && i === firstUndone,
          detail: s.detail,
        })),
      });
    }

    if (!silent && fresh.length) {
      window.KanbanQuest.updateQuest(HUBBLE_QUEST_ID, fresh.length === 1
        ? hubbleQuestText('log.serviced',
          { name: fresh[0].text, done: done.length, total: steps.length })
        : hubbleQuestText('log.servicedMany',
          { count: fresh.length, done: done.length, total: steps.length }));
    }

    if (quest.column !== "done" && Hubble.isOperational()) {
      window.KanbanQuest.updateQuest(HUBBLE_QUEST_ID, hubbleQuestText('log.complete'));
      window.KanbanQuest.completeQuest(HUBBLE_QUEST_ID);
    }
  }

  // ==========================================================================
  // Strip mining: taking an asteroid apart with the ship's lasers
  // --------------------------------------------------------------------------
  // Any real asteroid (not one of the Solar System's artificial objects) holds
  // an ore body of 30-200 units rolled from the world seed. Mining runs a second
  // at a time: each tick burns Hyperflux and returns a few units of ore, until
  // the body is stripped. Progress is stored per system+body, so a half-mined
  // asteroid is still half-mined on the next visit.
  // ==========================================================================
  const MINEABLE_TYPES = new Set([
    "c_type_asteroid", "s_type_asteroid", "m_type_asteroid", "trojan_asteroid",
    "planetesimal", "centaur", "comet", "short_period_comet", "long_period_comet",
  ]);
  // Ore tables per asteroid class: [itemId, weight]. Varlenia is deliberately
  // absent here -- it is rolled separately, and almost never.
  const ORE_TABLES = {
    m_type_asteroid: [[MAT.steel, 38], [MAT.titanium, 26], [MAT.lead, 18], [MAT.circuit, 8], [MAT.crystal, 6]],
    s_type_asteroid: [[MAT.steel, 30], [MAT.glass, 26], [MAT.crystal, 16], [MAT.titanium, 12], [MAT.lead, 8]],
    c_type_asteroid: [[MAT.oil, 30], [MAT.acid, 22], [MAT.resin, 18], [MAT.glass, 14], [MAT.bone, 6]],
    trojan_asteroid: [[MAT.glass, 28], [MAT.crystal, 22], [MAT.steel, 20], [MAT.acid, 14]],
    planetesimal: [[MAT.steel, 28], [MAT.glass, 24], [MAT.lead, 18], [MAT.crystal, 14], [MAT.titanium, 10]],
    centaur: [[MAT.glass, 30], [MAT.acid, 22], [MAT.crystal, 20], [MAT.resin, 14]],
    comet: [[MAT.glass, 34], [MAT.acid, 26], [MAT.resin, 18], [MAT.crystal, 12]],
  };
  const MINING_FUEL_PER_SEC = 220;   // Hyperflux, out of a 92 000 tank
  const VARLENIA_CHANCE = 0.012;     // per tick; the reason anyone mines at all
  const QUANTUM_CHANCE = 0.006;

  function oreTableFor(body) {
    return ORE_TABLES[body && body.type] ||
      ORE_TABLES[String(body && body.type).indexOf("comet") >= 0 ? "comet" : "planetesimal"];
  }

  const Mining = {
    FUEL_PER_SEC: MINING_FUEL_PER_SEC,
    isMineable(body) {
      if (!body || body.artificial) return false;
      return MINEABLE_TYPES.has(body.type);
    },
    key(system, body) {
      return String((system && system.name) || "?") + "|" + String((body && body.name) || "?");
    },
    // Total ore the body holds: 30-200 units, seeded so the same rock is always
    // the same rock.
    capacity(system, body) {
      const k = Mining.key(system, body);
      const base = 30 + Math.floor(seededFloat(k, 4099) * 171);
      // Metal-rich bodies are worth the fuel; icy ones much less so.
      const mult = body && body.type === "m_type_asteroid" ? 1.15
        : (body && String(body.type).indexOf("comet") >= 0 ? 0.75 : 1);
      return Math.max(30, Math.min(200, Math.round(base * mult)));
    },
    mined(system, body) {
      const log = (typeof $gameSystem !== "undefined" && $gameSystem &&
        $gameSystem._gxMinedBodies) || {};
      return log[Mining.key(system, body)] || 0;
    },
    remaining(system, body) {
      return Math.max(0, Mining.capacity(system, body) - Mining.mined(system, body));
    },
    isDepleted(system, body) {
      return Mining.remaining(system, body) <= 0;
    },
    progress(system, body) {
      const cap = Mining.capacity(system, body);
      return cap > 0 ? Math.min(1, Mining.mined(system, body) / cap) : 1;
    },
    // Seconds of laser time the rest of this body will take, at the mean rate.
    etaSeconds(system, body) {
      return Math.ceil(Mining.remaining(system, body) / 4);
    },
    // One second of mining. Burns fuel, cuts ore, hands it to the party.
    // Returns { ok, reason, gained: {itemId: qty}, amount, depleted }.
    tick(system, body, dm) {
      const out = { ok: false, reason: "", gained: {}, amount: 0, depleted: false };
      if (!Mining.isMineable(body)) { out.reason = "not-mineable"; return out; }
      const left = Mining.remaining(system, body);
      if (left <= 0) { out.reason = "depleted"; out.depleted = true; return out; }
      if (dm && dm.getHyperflux) {
        const fuel = dm.getHyperflux();
        if (fuel < MINING_FUEL_PER_SEC) { out.reason = "fuel"; return out; }
        dm.setHyperflux(fuel - MINING_FUEL_PER_SEC);
      }
      const k = Mining.key(system, body);
      const roll = Math.random();
      // A trained miner aboard cuts cleaner: the party's best Mining level (see
      // SpecializationXP.multiplier) raises what each pass brings up.
      const skill = window.SpecializationXP
        ? window.SpecializationXP.multiplier("Mining", 0.12) : 1;
      const amount = Math.min(left,
        Math.max(1, Math.round((2 + Math.floor(Math.random() * 5)) * skill))); // 2-6 units
      const table = oreTableFor(body);
      const total = table.reduce((a, e) => a + e[1], 0);
      let pick = Math.random() * total;
      let itemId = table[0][0];
      for (const [id, w] of table) {
        pick -= w;
        if (pick <= 0) { itemId = id; break; }
      }
      out.gained[itemId] = amount;
      matGive(itemId, amount);
      // The rare seams. Varlenia is the whole reason a crew burns 220 units of
      // Hyperflux a second to chew on a rock.
      if (roll < VARLENIA_CHANCE) {
        out.gained[MAT.varlenia] = 1;
        matGive(MAT.varlenia, 1);
      } else if (roll < VARLENIA_CHANCE + QUANTUM_CHANCE) {
        out.gained[MAT.quantum] = 1;
        matGive(MAT.quantum, 1);
      }
      if (!$gameSystem._gxMinedBodies) $gameSystem._gxMinedBodies = {};
      $gameSystem._gxMinedBodies[k] = Mining.mined(system, body) + amount;
      out.amount = amount;
      out.ok = true;
      out.depleted = Mining.remaining(system, body) <= 0;
      return out;
    },
  };
  window.GalaxySim.Mining = Mining;

  // ==========================================================================
  // Anomalies: the one world in a system that is signalling
  // --------------------------------------------------------------------------
  // Moved out to js/plugins/Procedural/ProceduralAdventureSystem.js, which
  // plays the same branching encounter on Earth's biomes as well. It publishes
  // itself as GalaxySim.Anomaly, which is what the star map's "?" marker and
  // its Investigate button still read (GalaxySim_Scene3D / _Bodies / _Overlay).
  // ==========================================================================

  // ============================================================================
  // Nibiru: the world that is on its way
  // ----------------------------------------------------------------------------
  // One body, four states, and the calendar is the only thing that moves it
  // (Variable 114, the world clock - see TimeDateSystem):
  //
  //   2001-01-01 .. 2010-01-01   APPROACH  a lone rogue planet in the star
  //                              field, its own starless system, closing on the
  //                              Sun and slowing as it comes.
  //   2010-01-01 .. 2012-12-21   INBOUND   inside the Solar System: a planet of
  //                              Sol falling in from beyond Eris onto Earth's
  //                              own orbit, riding Earth's phase so the two
  //                              arrive at the same place at the same moment.
  //   2012-12-21 onward          whichever of the two endings the world earned:
  //                              SATURN, if switch 200 is on when the day comes
  //                              (Nibiru is taken by the giant instead and
  //                              Saturn burns, very nearly a star), otherwise
  //                              OMEGA - switch 199 goes on, Nibiru and Earth
  //                              are both gone, and what stands in Earth's
  //                              orbit is the Omega Tower.
  //
  // Nothing here is stored except which ending was taken: the position of the
  // planet is a function of the clock and is recomputed whenever the day turns.
  // DataManager._syncTimeline calls sync() from getSystem/getAllSystems, so the
  // star map, the catalog and travel all read the same table; tick() keeps the
  // clock running (and the switches honest) for a party that never looks up.
  // ============================================================================
  const NIBIRU_NAME = "Nibiru";          // i18n-ignore: body id
  const OMEGA_TOWER_NAME = "Omega Tower"; // i18n-ignore: body id
  const SATURN_NAME = "Saturn";           // i18n-ignore: body id
  // Switch 200 ("TowerClimbed"): the Earth is spared - Saturn takes the blow.
  // Switch 199 ("EarthDestroyed"): raised by the impact itself, the day Earth
  // stops existing. Read the first, write the second; never the other way.
  const SW_SPARE_EARTH = 200;
  const SW_EARTH_LOST = 199;

  // The world clock counts minutes from this moment (TimeDateSystem's epoch).
  const CLOCK_EPOCH = new Date(2001, 0, 1, 10, 0, 0);
  const minutesAt = (y, m, d) =>
    Math.round((new Date(y, m, d, 0, 0, 0) - CLOCK_EPOCH) / 60000);
  const T_ENTER = minutesAt(2010, 0, 1);    // crosses into the Solar System
  const T_IMPACT = minutesAt(2012, 11, 21); // 21 December 2012

  // How far out it starts, and the bearing it comes in on (a fixed direction:
  // the thing has been falling toward us since long before anyone was counting).
  const APPROACH_LY = 21.5;
  const APPROACH_DIR = (() => {
    const v = { x: 0.58, y: 0.13, z: -0.80 };
    const L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / L, y: v.y / L, z: v.z / L };
  })();
  // Where it enters the system, in AU: outside Eris, inside the far comets.
  const ENTRY_AU = 62;

  const gxClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function nibiruNow() {
    const TDS = window.TimeDateSystem;
    if (TDS && TDS.getGameTimeMinutes) {
      const m = TDS.getGameTimeMinutes();
      if (typeof m === "number" && isFinite(m)) return Math.max(0, m);
    }
    if (typeof $gameVariables !== "undefined" && $gameVariables) {
      return Math.max(0, Number($gameVariables.value(114)) || 0);
    }
    return 0;
  }

  // Which ending the world took, resolved once and then remembered. Switch 199
  // is the world-shared half of the answer (it is what the rest of the game
  // reads); `_gxNibiruOutcome` is this savegame's own record, and is what keeps
  // a spared Earth spared even if switch 200 is turned off afterwards.
  function nibiruOutcome() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return "omega";
    if ($gameSystem._gxNibiruOutcome) return $gameSystem._gxNibiruOutcome;
    const sw = (typeof $gameSwitches !== "undefined" && $gameSwitches) ? $gameSwitches : null;
    if (sw && sw.value(SW_EARTH_LOST)) return ($gameSystem._gxNibiruOutcome = "omega");
    const spared = !!(sw && sw.value(SW_SPARE_EARTH));
    const res = spared ? "saturn" : "omega";
    $gameSystem._gxNibiruOutcome = res;
    if (res === "omega" && sw) sw.setValue(SW_EARTH_LOST, true);
    return res;
  }

  function nibiruState() {
    const t = nibiruNow();
    if (t >= T_IMPACT) return { t, phase: nibiruOutcome() };
    if (t >= T_ENTER) return { t, phase: "inbound" };
    return { t, phase: "approach" };
  }

  // Resolve the state AND say so, once, on the turn it changes. A phase that has
  // never been recorded (a fresh party, a save made after the fact) is written
  // down silently: an announcement is for a crossing the player lived through.
  function nibiruAdvance() {
    const s = nibiruState();
    if (typeof $gameSystem === "undefined" || !$gameSystem) return s;
    const seen = $gameSystem._gxNibiruPhase;
    if (seen !== s.phase) {
      $gameSystem._gxNibiruPhase = s.phase;
      if (seen) {
        if (s.phase === "inbound") notify(T('Galaxy.nibiru.entered'), "warning");
        else if (s.phase === "saturn") notify(T('Galaxy.nibiru.hitSaturn'), "warning");
        else if (s.phase === "omega") notify(T('Galaxy.nibiru.hitEarth'), "warning");
      }
    }
    return s;
  }

  // --- The bodies ------------------------------------------------------------
  function nibiruRogueSystem(t) {
    const M = window.GalaxySim.Math || {};
    const u = gxClamp(t / T_ENTER, 0, 1);
    // Eased, so the decade is spent closing rather than crossing the sky at a
    // constant rate: inside a light year by 2009, and never quite standing on
    // the Sun (the floor keeps it its own dot on the map right up to the day it
    // stops being one).
    const d = Math.max(0.02, APPROACH_LY * Math.pow(1 - u, 1.35));
    return {
      name: NIBIRU_NAME,
      type: "ROGUE_PLANET",
      color: (M.STAR_COLORS && M.STAR_COLORS.ROGUE_PLANET) || "#2e3a4e",
      position: { x: APPROACH_DIR.x * d, y: APPROACH_DIR.y * d, z: APPROACH_DIR.z * d },
      mass: 1.26e-5,      // solar masses: about four Earths
      radius: 0.0163,     // solar radii
      temperature: 42,
      luminosity: 0,
      binary: false,
      companions: null,
      dyson: null,
      feeding: null,
      planetType: "rogue",
      belts: null,
      galaxy: null,
      hardcoded: true,
      planets: [],
      note: T('Galaxy.nibiru.noteFar'),
      // What makes the panel draw the countdown (see Overlay.impactCountdown).
      impactBody: true,
    };
  }

  function nibiruPlanet(sol, t) {
    const M = window.GalaxySim.Math || {};
    const v = gxClamp((t - T_ENTER) / (T_IMPACT - T_ENTER), 0, 1);
    // Slow to leave the cold, and then a rush: most of the fall happens in the
    // last months, which is exactly when anyone starts looking.
    const r = 1 + (ENTRY_AU - 1) * Math.pow(1 - v, 0.75);
    const earth = (sol.planets || []).find((p) => p.name === "Earth");   // i18n-ignore: body id
    return {
      name: NIBIRU_NAME,
      type: "rogue",
      color: (M.PLANET_COLORS && M.PLANET_COLORS.rogue) || "#4a3b34",
      orbitRadius: r,
      radius: 1.9,
      mass: 4.2,
      period: Math.sqrt(Math.pow(r, 3) / (sol.mass || 1)) * 365,
      // Earth's own angle, held all the way in: the two are not going to miss.
      phase: (earth && typeof earth.phase === "number") ? earth.phase : 0,
      atmosphere: true,
      landingLocations: null,
      note: T('Galaxy.nibiru.noteNear'),
      artificial: null,
      probeStyle: null,
      hubble: false,
      noLanding: false,
      debris: null,
      moons: [],
      impactBody: true,
    };
  }

  function omegaTowerPlanet(earth) {
    return {
      name: OMEGA_TOWER_NAME,
      type: "mega_iron",
      color: "#0b0b10",
      orbitRadius: (earth && earth.orbitRadius) || 1,
      // Drawn at the size of the world it stands in for, the way every other
      // artificial body here is (see the monolith): true scale would be a
      // speck nobody could find in Earth's orbit.
      radius: 1,
      mass: 1e-9,
      period: (earth && earth.period) || 365,
      phase: (earth && typeof earth.phase === "number") ? earth.phase : 0,
      atmosphere: false,
      // The tower has one door and it is not on a surface anyone walks to: the
      // landing grid is refused (noLanding) and this is the only way down.
      landingLocations: [{
        name: T('Galaxy.nibiru.towerLanding'), mapId: 635, x: 13, y: 38, dir: 8,
      }],
      note: T('Galaxy.nibiru.towerNote'),
      artificial: "omegatower",
      probeStyle: null,
      hubble: false,
      noLanding: true,
      debris: null,
      // The Moon outlived its world, and the base on it with it.
      moons: (earth && earth.moons) || [],
    };
  }

  // The ship cannot stay parked at something that no longer exists.
  function nibiruReseatShip(dm) {
    const ship = dm && dm.playerShip;
    if (!ship) return;
    if (ship.currentSystem === NIBIRU_NAME && !dm.systems.has(NIBIRU_NAME)) {
      ship.currentSystem = "Sol";   // i18n-ignore: system id
      ship.currentPlanet = NIBIRU_NAME;
      if (typeof $gameVariables !== "undefined" && $gameVariables) {
        $gameVariables.setValue(96, ship.currentSystem);
      }
      dm.currentSystem = ship.currentSystem;
    }
    const sys = dm.systems.get(ship.currentSystem);
    if (sys && ship.currentPlanet &&
      !(sys.planets || []).some((p) => p.name === ship.currentPlanet)) {
      ship.currentPlanet = null;
    }
  }

  // Rewrite the registry to match `s`. Returns false when the table is not
  // loaded yet, so the caller retries rather than recording the state as done.
  function nibiruApply(dm, s) {
    const sol = dm.systems.get("Sol");   // i18n-ignore: system id
    if (!sol || !Array.isArray(sol.planets)) return false;

    // Whatever the last pass left, taken back out: every state is built whole.
    const wasInSystem = dm.systems.has(NIBIRU_NAME);
    if (s.phase !== "approach" && wasInSystem) {
      dm.systems.delete(NIBIRU_NAME);
      if (dm.hardcodedSystems) dm.hardcodedSystems.delete(NIBIRU_NAME);
    }
    if (s.phase !== "inbound") {
      sol.planets = sol.planets.filter((p) => p.name !== NIBIRU_NAME);
    }

    if (s.phase === "approach") {
      dm.systems.set(NIBIRU_NAME, nibiruRogueSystem(s.t));
      if (dm.hardcodedSystems) dm.hardcodedSystems.add(NIBIRU_NAME);
    } else if (s.phase === "inbound") {
      const at = sol.planets.findIndex((p) => p.name === NIBIRU_NAME);
      const body = nibiruPlanet(sol, s.t);
      if (at >= 0) sol.planets[at] = body;
      else sol.planets.push(body);
    } else if (s.phase === "saturn") {
      const saturn = sol.planets.find((p) => p.name === SATURN_NAME);
      if (saturn && !saturn.ignited) {
        // Not enough to be a star, and far too much to still be a planet.
        saturn.type = "magma_planet";
        saturn.ignited = true;
        saturn.atmosphere = true;
        saturn.color = "#ff7a2a";
        saturn.note = T('Galaxy.nibiru.saturnNote');
      }
    } else if (s.phase === "omega") {
      const at = sol.planets.findIndex((p) => p.name === "Earth");   // i18n-ignore: body id
      if (at >= 0) sol.planets[at] = omegaTowerPlanet(sol.planets[at]);
      else if (!sol.planets.some((p) => p.name === OMEGA_TOWER_NAME)) {
        sol.planets.push(omegaTowerPlanet(null));
      }
    }

    nibiruReseatShip(dm);
    return true;
  }

  let _nibiruBusy = false;

  const Nibiru = {
    // The whole timeline, for anything that wants to ask.
    ENTER_MINUTE: T_ENTER,
    IMPACT_MINUTE: T_IMPACT,
    phase() { return nibiruState().phase; },
    minutesToImpact() { return Math.max(0, T_IMPACT - nibiruNow()); },

    // Reconcile a DataManager's registry with the calendar. Called from
    // getSystem/getAllSystems, so it must be cheap when nothing has changed:
    // a state key of (phase, day, language) decides that in one comparison.
    sync(dm) {
      if (_nibiruBusy || !dm || !dm.systems) return;
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      const s = nibiruAdvance();
      // The terminal states do not move, so they are keyed on the phase alone;
      // the two travelling ones are recomputed once a day. Language is in the
      // key because the notes and the landing site are written text.
      const moving = s.phase === "approach" || s.phase === "inbound";
      const lang = (window.T && T.language) ? T.language() : "";
      const key = s.phase + "|" + (moving ? Math.floor(s.t / 1440) : 0) + "|" + lang;
      if (key === dm._nibiruKey) return;
      _nibiruBusy = true;
      try {
        if (nibiruApply(dm, s)) dm._nibiruKey = key;
      } catch (e) {
        console.error("[GalaxySim] Nibiru: could not apply the timeline", e);
        dm._nibiruKey = key; // never loop on a broken state
      } finally {
        _nibiruBusy = false;
      }
    },

    // "Earth Impact" for the body that is carrying it, null for everything else.
    countdownFor(body) {
      if (!body || !body.impactBody) return null;
      const left = Math.max(0, T_IMPACT - nibiruNow());
      if (left <= 0) return T('Galaxy.nibiru.countdownNow');
      const total = Math.ceil(left);
      const days = Math.floor(total / 1440);
      const hh = String(Math.floor((total % 1440) / 60)).padStart(2, "0");
      const mm = String(total % 60).padStart(2, "0");
      const years = Math.floor(days / 365);
      if (years > 0) {
        return T('Galaxy.nibiru.countdownYears',
          { years, days: days - years * 365, hh, mm });
      }
      return T('Galaxy.nibiru.countdownDays', { days, hh, mm });
    },

    // Keeps the timeline moving for a party that never opens the star map: the
    // switches and the announcements do not wait on anyone looking up.
    tick() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      if (typeof $gameSwitches === "undefined" || !$gameSwitches) return;
      nibiruAdvance();
      const dm = $gameSystem.starMapData;
      if (dm && dm.systems && dm.systems.size > 0) this.sync(dm);
    },
  };
  window.GalaxySim.Nibiru = Nibiru;

  // ============================================================================
  // The Friday moons
  // ----------------------------------------------------------------------------
  // Earth has three moons on a Friday. The Moon is always up there; Moon 2 and
  // Moon 3 (authored in js/db/GalaxySim/Systems.json, each flagged `friday`)
  // are taken back out of Earth's moon list on every other day of the week, so
  // the star map, the catalog and travel all agree that they are not there.
  //
  // Which day it is comes from the battle sky's own calendar (SkyRenderer, in
  // AnimatedBattleBackgrounds.js), so the sky over the party and the sky the
  // star map draws are never out of step about it; the world clock is only the
  // fallback for a sky that has not loaded.
  //
  // A ship left in one of those orbits when the week turns cannot stay there:
  // it is put back into Earth's orbit - or the Omega Tower's, if that is what
  // is standing in Earth's place by then - and the party is told.
  // ============================================================================
  const FRIDAY_MOON_NAMES = ["Moon 2", "Moon 3"];   // i18n-ignore: body ids
  const EARTH_NAME = "Earth";                        // i18n-ignore: body id
  const isFridayMoon = (name) => FRIDAY_MOON_NAMES.indexOf(name) >= 0;

  function isFridayNow() {
    const SR = window.SkyRenderer;
    if (SR && SR.isFriday) {
      try { return !!SR.isFriday(); } catch (e) { /* fall through to the clock */ }
    }
    const d = new Date(CLOCK_EPOCH.getTime() + nibiruNow() * 60000);
    return d.getDay() === 5;
  }

  // Whichever body is standing in Earth's orbit: the Earth itself, or the tower
  // that replaced it (omegaTowerPlanet carries Earth's moons over with it, the
  // same array, which is why this pass can be blind to which one it has).
  function fridayMoonHost(dm) {
    const sol = dm && dm.systems && dm.systems.get("Sol");   // i18n-ignore: system id
    if (!sol || !Array.isArray(sol.planets)) return null;
    return sol.planets.find((p) => p.name === EARTH_NAME) ||
      sol.planets.find((p) => p.name === OMEGA_TOWER_NAME) || null;
  }

  // The ship cannot be left orbiting a moon that is not out today.
  function fridayReseatShip(dm, host) {
    const ship = dm && dm.playerShip;
    if (!ship || !host) return;
    let moved = false;
    if (isFridayMoon(ship.targetPlanet)) {
      ship.targetPlanet = host.name;
      moved = true;
    }
    if (isFridayMoon(ship.currentPlanet)) {
      ship.currentPlanet = host.name;
      ship.parkedBody = null;
      moved = true;
    }
    if (moved) notify(T('Galaxy.fridayMoons.reseated', { body: host.name }), "warning");
  }

  // Take the Friday moons out of the host's moon list, or put them back where
  // they were. The ones taken out are held on the data manager itself: the
  // registry is rebuilt from the data files on every load, so none of this is
  // ever saved (see StarMapDataManager.toJSON).
  function fridayMoonsApply(dm, friday) {
    const host = fridayMoonHost(dm);
    if (!host) return false;
    if (!Array.isArray(host.moons)) host.moons = [];
    if (!Array.isArray(dm._fridayMoonStash)) dm._fridayMoonStash = [];
    const stash = dm._fridayMoonStash;
    if (friday) {
      while (stash.length) {
        const moon = stash.shift();
        if (!host.moons.some((m) => m && m.name === moon.name)) host.moons.push(moon);
      }
    } else {
      for (let i = host.moons.length - 1; i >= 0; i--) {
        const moon = host.moons[i];
        if (!moon || !(moon.friday || isFridayMoon(moon.name))) continue;
        host.moons.splice(i, 1);
        stash.unshift(moon);
      }
      fridayReseatShip(dm, host);
    }
    return true;
  }

  const FridayMoons = {
    NAMES: FRIDAY_MOON_NAMES.slice(),
    isFriday: isFridayNow,
    isFridayMoon,

    // Reconcile a data manager's Sol with the day of the week. Called from
    // getSystem/getAllSystems (see _syncTimeline), so it has to be cheap when
    // nothing has changed: the whole state is one boolean.
    sync(dm) {
      if (!dm || !dm.systems) return;
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      const friday = isFridayNow();
      const key = friday ? "1" : "0";
      if (key === dm._fridayKey) return;
      try {
        if (fridayMoonsApply(dm, friday)) dm._fridayKey = key;
      } catch (e) {
        console.error("[GalaxySim] Friday moons: could not apply the calendar", e);
        dm._fridayKey = key; // never loop on a broken state
      }
    },

    // For a party that never opens the star map: the orbit still has to be
    // vacated on the stroke of Saturday, whether or not anyone is looking.
    tick() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      const dm = $gameSystem.starMapData;
      if (dm && dm.systems && dm.systems.size > 0) this.sync(dm);
    },
  };
  window.GalaxySim.FridayMoons = FridayMoons;

  // Once a second is far more often than either calendar needs, and cheap
  // enough that it never has to be thought about again.
  const NIBIRU_TICK_FRAMES = 60;
  let _nibiruTickCount = 0;
  const _GS_Game_Map_update_nibiru = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _GS_Game_Map_update_nibiru.call(this, sceneActive);
    if (++_nibiruTickCount < NIBIRU_TICK_FRAMES) return;
    _nibiruTickCount = 0;
    try { Nibiru.tick(); } catch (e) { console.error(e); }
    try { FridayMoons.tick(); } catch (e) { console.error(e); }
  };

  // ============================================================================
  // Ship Controls HUD (Empathize UI style, minimal & fast HUD)
  // ============================================================================
  let _shipControlsOverlay = null;
  let _shipControlsTimer = null;
  let _shipControlsTab = "current";
  let _shipControlsFilter = "";
  let _shipControlsKeyHandler = null;

  function isShipControlsOpen() {
    return !!_shipControlsOverlay;
  }
  window.GalaxySim.isShipControlsOpen = isShipControlsOpen;

  // Lock map mouse / touch controls so the character does not move when controls are open
  if (typeof Scene_Map !== "undefined" && Scene_Map.prototype) {
    const _GS_Scene_Map_isMapTouchOk = Scene_Map.prototype.isMapTouchOk;
    Scene_Map.prototype.isMapTouchOk = function () {
      if (isShipControlsOpen()) return false;
      return _GS_Scene_Map_isMapTouchOk ? _GS_Scene_Map_isMapTouchOk.call(this) : true;
    };

    const _GS_Scene_Map_processMapTouch = Scene_Map.prototype.processMapTouch;
    Scene_Map.prototype.processMapTouch = function () {
      if (isShipControlsOpen()) {
        if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.clearDestination) {
          $gameTemp.clearDestination();
        }
        return;
      }
      if (_GS_Scene_Map_processMapTouch) {
        _GS_Scene_Map_processMapTouch.call(this);
      }
    };
  }

  function ensureShipControlsStyles() {
    if (document.getElementById("gx-ship-controls-style")) return;
    const st = document.createElement("style");
    st.id = "gx-ship-controls-style";
    st.textContent = `
      #gx-ship-controls-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: var(--shadow-black-translucent-50, rgba(0, 0, 0, 0.5));
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        -webkit-user-select: none;
        font-family: var(--font-ui, sans-serif);
        box-sizing: border-box;
        padding: 20px;
      }
      #gx-ship-controls-modal {
        position: relative;
        width: min(1060px, 96vw);
        height: min(740px, 92vh);
        background: transparent;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        animation: paperRustle 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .gx-sc-close-btn {
        position: absolute;
        top: 6px; right: 10px;
        z-index: 50;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; line-height: 1; font-weight: bold;
        color: var(--text-text-alt-4, #9ca3af);
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.12));
        border-radius: 50%;
        cursor: pointer;
        user-select: none;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
      }
      .gx-sc-close-btn:hover {
        color: var(--text-primary-hover, #ffffff);
        background: var(--bg-danger-medium-7, #e11d48);
        border-color: var(--border-focus-hover, #ffd700);
      }
      .gx-sc-tab-bar {
        display: flex;
        gap: 4px;
        padding: 0 16px;
        background: none;
        border-bottom: none;
        flex-shrink: 0;
      }
      .gx-sc-tab-hint {
        align-self: flex-end;
        margin-right: 6px;
        padding: 5px 9px 6px;
        font-size: var(--fs-chip, 10px);
        font-weight: bold;
        letter-spacing: 0.06em;
        color: var(--text-text-alt-4, #9ca3af);
        border-radius: 4px;
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.08));
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
      }
      .gx-sc-tab {
        padding: 7px 18px 8px;
        font-size: var(--fs-body, 14px);
        cursor: pointer;
        user-select: none;
        border: none;
        border-radius: 6px 6px 0 0;
        background: var(--bg-secondary-hover, #232a3b);
        color: var(--text-text-alt-4, #9ca3af);
        font-family: var(--font-ui, sans-serif);
        transition: color 0.12s;
      }
      .gx-sc-tab:hover:not(.active) {
        color: var(--border-focus-hover, #ffd700);
      }
      .gx-sc-tab.active {
        background: var(--bg-secondary-hover, #232a3b);
        color: var(--text-primary-hover, #f3f4f6);
        font-weight: bold;
        box-shadow: inset 0 0 0 2px var(--border-focus-hover, #ffd700);
      }
      .gx-sc-cat-count {
        display: inline-block;
        font-size: 11px;
        opacity: 0.75;
        margin-left: 4px;
      }
      .gx-sc-panel-body {
        display: flex;
        flex: 1;
        overflow: hidden;
        min-height: 0;
        background: var(--bg-secondary-hover, #1f2536);
        box-shadow: 0 30px 75px var(--shadow-black-translucent-45, rgba(0, 0, 0, 0.45));
        border-radius: 0 0 6px 6px;
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.12));
      }
      .gx-sc-left-col {
        width: 330px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--border-focus-hover, #ffd700) transparent;
        border-right: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.12));
        padding: 16px 18px;
        gap: 14px;
        box-sizing: border-box;
      }
      .gx-sc-right-panel {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        padding: 16px 20px 24px;
        min-width: 0;
        min-height: 0;
        scrollbar-width: thin;
        scrollbar-color: var(--border-focus-hover, #ffd700) transparent;
        box-sizing: border-box;
      }
      .gx-sc-ident {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.12));
      }
      .gx-sc-ship-avatar {
        width: 44px;
        height: 44px;
        border-radius: 6px;
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
      }
      .gx-sc-ident-text {
        flex: 1;
        min-width: 0;
      }
      .gx-sc-ident-title {
        font-size: var(--fs-title, 16px);
        font-weight: bold;
        color: var(--text-primary-hover, #f3f4f6);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gx-sc-ident-sub {
        font-size: var(--fs-body, 13px);
        color: var(--text-text-alt-4, #9ca3af);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gx-sc-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .gx-sc-sec-hdr {
        font-size: var(--fs-heading, 11px);
        font-weight: bold;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--text-text-alt-4, #9ca3af);
        margin-bottom: 2px;
      }
      .gx-sc-vital-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--fs-body, 13px);
      }
      .gx-sc-vital-lbl {
        width: 90px;
        flex-shrink: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--text-text-alt-4, #9ca3af);
      }
      .gx-sc-vital-track {
        flex: 1;
        height: 7px;
        background: var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
        border-radius: 4px;
        overflow: hidden;
      }
      .gx-sc-vital-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.2s ease;
      }
      .gx-sc-vital-pct {
        width: 52px;
        text-align: right;
        flex-shrink: 0;
        font-size: var(--fs-body, 13px);
        color: var(--text-text-alt-4, #9ca3af);
      }
      .gx-sc-slider {
        width: 100%;
        accent-color: var(--border-focus-hover, #ffd700);
        cursor: pointer;
        margin: 4px 0;
      }
      .gx-sc-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 10px;
        font-size: 12px;
        font-family: var(--font-ui, sans-serif);
        cursor: pointer;
        border-radius: 4px;
        user-select: none;
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.06));
        color: var(--text-primary-hover, #f3f4f6);
        transition: background 0.12s, border-color 0.12s, color 0.12s;
      }
      .gx-sc-btn:hover {
        border-color: var(--border-focus-hover, #ffd700);
        color: var(--border-focus-hover, #ffd700);
        background: rgba(255, 215, 0, 0.08);
      }
      .gx-sc-btn.stop {
        background: var(--bg-danger-medium-7, #e11d48);
        border-color: var(--border-focus-hover, #ffd700);
        color: #ffffff;
        font-weight: bold;
      }
      .gx-sc-btn.bridge {
        border-color: var(--gx-accent-bridge, #a880ff);
        color: var(--gx-accent-bridge, #a880ff);
      }
      .gx-sc-btn.bridge:hover {
        border-color: var(--border-focus-hover, #ffd700);
        color: var(--border-focus-hover, #ffd700);
      }
      .gx-sc-btn.bookmark-on {
        color: var(--border-focus-hover, #ffd700);
        border-color: var(--border-focus-hover, #ffd700);
      }
      .gx-sc-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        margin-bottom: 5px;
        border-radius: 4px;
        border: 1px solid transparent;
        border-bottom: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.08));
        transition: background 0.12s, border-color 0.12s;
      }
      .gx-sc-row:hover {
        border-color: var(--border-focus-hover, #ffd700);
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.05));
      }
      .gx-sc-row.depth-1 {
        padding-left: 24px;
      }
      .gx-sc-row.depth-2 {
        padding-left: 42px;
      }
      .gx-sc-item-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .gx-sc-item-name {
        font-weight: bold;
        font-size: var(--fs-body, 14px);
        color: var(--text-primary-hover, #f3f4f6);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gx-sc-item-sub {
        font-size: var(--fs-label, 12px);
        color: var(--text-text-alt-4, #9ca3af);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gx-sc-item-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .gx-sc-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
        color: var(--text-text-alt-4, #9ca3af);
      }
      .gx-sc-badge.here {
        background: rgba(16, 185, 129, 0.15);
        border-color: var(--text-cost-ok, #10b981);
        color: var(--text-cost-ok, #10b981);
        font-weight: bold;
      }
      .gx-sc-search-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
        border-radius: 4px;
        background: var(--bg-primary-hover-translucent-35, rgba(255, 255, 255, 0.06));
        font-family: var(--font-ui, sans-serif);
        font-size: var(--fs-body, 14px);
        color: var(--text-primary-hover, #f3f4f6);
        outline: none;
        box-sizing: border-box;
        margin-bottom: 12px;
      }
      .gx-sc-search-input:focus {
        border-color: var(--border-focus-hover, #ffd700);
        background: rgba(255, 255, 255, 0.09);
      }
      .gx-sc-pips {
        display: flex;
        gap: 3px;
        align-items: center;
      }
      .gx-sc-pip {
        width: 8px;
        height: 12px;
        border-radius: 2px;
        background: var(--border-primary-hover-translucent-15, rgba(255, 255, 255, 0.15));
      }
      .gx-sc-pip.on {
        background: var(--gx-accent-bridge, #a880ff);
        box-shadow: 0 0 5px var(--gx-accent-bridge, #a880ff);
      }
      .gx-sc-empty {
        padding: 32px 16px;
        text-align: center;
        color: var(--text-text-alt-4, #9ca3af);
        font-size: var(--fs-body, 14px);
      }
    `;
    document.head.appendChild(st);
  }

  function escHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function calcSysDistance(s1, s2) {
    if (!s1 || !s2) return 0;
    const p1 = s1.position || s1;
    const p2 = s2.position || s2;
    const dx = (p2.x || 0) - (p1.x || 0);
    const dy = (p2.y || 0) - (p1.y || 0);
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function getShipPosition(dm) {
    if (!dm || !dm.playerShip) return { x: 0, y: 0, z: 0 };
    const ship = dm.playerShip;
    if (ship.position && typeof ship.position.x === "number") {
      return ship.position;
    }
    const curSys = dm.getSystem(ship.currentSystem);
    if (curSys && curSys.position) {
      return curSys.position;
    }
    return { x: 0, y: 0, z: 0 };
  }

  function getCatalogStarsNearby(dm) {
    if (!dm || !dm.playerShip) return [];
    if (!dm.proceduralGenerated && typeof dm.generateProceduralSystems === "function") {
      dm.generateProceduralSystems();
    }
    const ship = dm.playerShip;
    const shipPos = getShipPosition(dm);
    const radius = 100;
    const result = [];
    const seen = new Set();

    const addSys = (sys) => {
      if (!sys || !sys.name || seen.has(sys.name)) return;
      if (sys.farHardcoded) return;
      if (String(sys.name).startsWith("PATRON.") || sys.isPatron) return;
      const d = calcSysDistance(shipPos, sys);
      if (d <= radius) {
        seen.add(sys.name);
        result.push(sys);
      }
    };

    const cur = (ship && ship.currentSystem) || dm.currentSystem;
    const GM = (window.GalaxySim && window.GalaxySim.Math) || {};
    const curSeed = GM.galaxySeedOfSystemName ? GM.galaxySeedOfSystemName(cur) : null;
    if (curSeed != null) {
      if (typeof dm.generateGalaxySystems === "function") {
        dm.generateGalaxySystems(curSeed).forEach(addSys);
      }
    } else {
      const baseSystems = dm.getAllSystems ? dm.getAllSystems() : [];
      baseSystems.forEach(addSys);

      if (typeof dm.generateLazyChunk === "function") {
        const LAZY_CHUNK_LY = 64;
        const cx0 = Math.floor((shipPos.x || 0) / LAZY_CHUNK_LY);
        const cz0 = Math.floor((shipPos.y || 0) / LAZY_CHUNK_LY);
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const chunkStars = dm.generateLazyChunk(cx0 + dx, cz0 + dz);
            if (chunkStars && chunkStars.length) {
              chunkStars.forEach(addSys);
            }
          }
        }
      }
    }

    result.sort((a, b) => calcSysDistance(shipPos, a) - calcSysDistance(shipPos, b));
    return result;
  }

  function getPatronStarsList(dm) {
    if (!dm) return [];
    let list = [];
    if (window.PatreonRewards && typeof window.PatreonRewards.catalogEntries === "function") {
      list = window.PatreonRewards.catalogEntries(dm);
    } else {
      const systems = (dm.getAllSystems ? dm.getAllSystems() : [])
        .filter(s => s && String(s.name).startsWith("PATRON."));
      list = systems.map(s => ({
        patron: { name: s.label || s.name, planetName: s.label || s.name },
        system: s,
        planet: (s.planets && s.planets[0]) || null,
        name: s.label || s.name,
        sub: s.name,
      }));
    }
    const shipPos = getShipPosition(dm);
    return [...list].sort((a, b) => calcSysDistance(shipPos, a.system) - calcSysDistance(shipPos, b.system));
  }

  const LOCAL_GROUP_FALLBACK = [
    { name: "Milky Way", type: "barred_spiral", distance: 0, radius: 50 },
    { name: "Large Magellanic Cloud", type: "irregular", distance: 160, radius: 7 },
    { name: "Small Magellanic Cloud", type: "irregular", distance: 200, radius: 3.5 },
    { name: "Ursa Minor Dwarf", type: "dwarf_spheroidal", distance: 205, radius: 1.5 },
    { name: "Draco Dwarf", type: "dwarf_spheroidal", distance: 240, radius: 1.8 },
    { name: "Sculptor Dwarf", type: "dwarf_spheroidal", distance: 280, radius: 2.2 },
    { name: "Sextans Dwarf", type: "dwarf_spheroidal", distance: 310, radius: 2.0 },
    { name: "Carina Dwarf", type: "dwarf_spheroidal", distance: 330, radius: 1.6 },
    { name: "Fornax Dwarf", type: "dwarf_spheroidal", distance: 450, radius: 4.0 },
    { name: "Leo II", type: "dwarf_spheroidal", distance: 670, radius: 2.0 },
    { name: "Leo I", type: "dwarf_spheroidal", distance: 820, radius: 2.4 },
    { name: "NGC 6822", type: "irregular", distance: 1630, radius: 4 },
    { name: "IC 10", type: "irregular", distance: 2200, radius: 3.0 },
    { name: "M32", type: "elliptical", distance: 2490, radius: 4 },
    { name: "Andromeda (M31)", type: "spiral", distance: 2537, radius: 110 },
    { name: "M110 (NGC 205)", type: "elliptical", distance: 2700, radius: 8.5 },
    { name: "Triangulum (M33)", type: "spiral", distance: 3000, radius: 30 },
    { name: "Wolf - Lundmark - Melotte (WLM)", type: "irregular", distance: 3040, radius: 5.5 },
    { name: "Aquarius Dwarf", type: "irregular", distance: 3200, radius: 2.0 },
    { name: "Sagittarius DIG", type: "irregular", distance: 3400, radius: 1.8 },
    { name: "Pegasus Dwarf", type: "irregular", distance: 3600, radius: 3.0 }
  ];

  function getNearestGalaxiesList() {
    let src = null;
    if (window.GalaxySim && Array.isArray(window.GalaxySim.LocalGroupGalaxies) && window.GalaxySim.LocalGroupGalaxies.length > 0) {
      src = window.GalaxySim.LocalGroupGalaxies;
    } else if (typeof $dataService !== "undefined" && $dataService && typeof $dataService.get === "function") {
      src = $dataService.get("GalaxySim/LocalGroupGalaxies");
    }
    const list = (Array.isArray(src) && src.length > 0) ? src : LOCAL_GROUP_FALLBACK;
    return [...list].sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  /** True for a system that belongs to a procedural galaxy rather than to the
   *  Milky Way. The name shapes that mean that are owned by
   *  GalaxySim.Math.galaxySeedOfSystemName, never re-derived from a literal. */
  function isForeignGalaxySystem(name) {
    const GM = (window.GalaxySim && window.GalaxySim.Math) || {};
    return GM.galaxySeedOfSystemName
      ? GM.galaxySeedOfSystemName(name) != null
      : false;
  }

  function getGalaxySeed(name) {
    if (window.GalaxySim?.Scene3DCosmos?.galaxySeedFromName) {
      return window.GalaxySim.Scene3DCosmos.galaxySeedFromName(name);
    }
    let h = 2166136261 >>> 0;
    const s = String(name || "galaxy");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h = h >>> 0;
    const S = window.GalaxySim?.Math?.Strangeness;
    return S ? S.stampTier(h, 0) : h;
  }

  function getBiosignaturesList(dm) {
    if (!dm || typeof $gameSystem === "undefined" || !$gameSystem) return { strong: [], weak: [] };
    const origin = getShipPosition(dm);
    const lifeLog = $gameSystem._gxLifeLog || [];
    const weakLog = $gameSystem._gxWeakLifeLog || [];
    const GS = window.GalaxySim || {};

    const resolveList = (log, isWeak) => {
      const out = [];
      log.forEach((key) => {
        const cut = String(key).indexOf("|");
        if (cut < 0) return;
        const sysName = key.slice(0, cut);
        const planetName = key.slice(cut + 1);
        const sys = dm.getSystem ? dm.getSystem(sysName) : null;
        if (!sys) return;
        const planet = (sys.planets || []).find((p) => p.name === planetName);
        if (!planet) return;
        const dist = calcSysDistance(origin, sys);
        const tier = GS.planetBioTier ? GS.planetBioTier(planet) : null;
        const tierLabel = tier && GS.bioTierLabel ? GS.bioTierLabel(tier) : null;
        out.push({ system: sys, planet, dist, tier, tierLabel, isWeak });
      });
      out.sort((a, b) => a.dist - b.dist);
      return out;
    };

    return {
      strong: resolveList(lifeLog, false),
      weak: resolveList(weakLog, true),
    };
  }

  function scanBiosignatures(dm) {
    if (!dm) return { found: 0, weak: 0, fresh: 0 };
    const origin = getShipPosition(dm);
    const log = ($gameSystem._gxLifeLog = $gameSystem._gxLifeLog || []);
    const weakLog = ($gameSystem._gxWeakLifeLog = $gameSystem._gxWeakLifeLog || []);
    let fresh = 0;
    let found = 0;
    let weak = 0;
    const GS = window.GalaxySim || {};
    const boosted = !!(GS.Hubble && GS.Hubble.isOperational && GS.Hubble.isOperational());
    const radius = 500 * (boosted ? 2 : 1);
    const SIGNS = (GS.LifeSigns || { WEAK: "weak", STRONG: "strong" });

    const allSystems = dm.getAllSystems ? dm.getAllSystems() : [];
    allSystems.forEach((sys) => {
      if (!sys || !sys.position) return;
      if (calcSysDistance(origin, sys) > radius) return;
      (sys.planets || []).forEach((p) => {
        const signs = GS.planetLifeSigns ? GS.planetLifeSigns(p)
          : ((GS.planetHasLife && GS.planetHasLife(p)) ? SIGNS.STRONG : "none");
        if (signs !== SIGNS.STRONG && signs !== SIGNS.WEAK) return;
        const key = sys.name + "|" + p.name;
        if (signs === SIGNS.STRONG) {
          found++;
          const stale = weakLog.indexOf(key);
          if (stale !== -1) weakLog.splice(stale, 1);
          if (log.indexOf(key) === -1) { log.push(key); fresh++; }
        } else {
          weak++;
          if (log.indexOf(key) === -1 && weakLog.indexOf(key) === -1) {
            weakLog.push(key);
            fresh++;
          }
        }
      });
    });

    if (window.SceneManager && window.SceneManager._scene && typeof window.SceneManager._scene._awardSpec === "function") {
      window.SceneManager._scene._awardSpec("Radio Astronomy", 1);
      if (fresh) window.SceneManager._scene._awardSpec("Astrobiology", 1);
    }
    if (window.SoundManager) {
      if (found || weak) SoundManager.playOk(); else SoundManager.playBuzzer();
    }
    notify(T('Galaxy.shipControls.bioscanReport', { found, weak, fresh }), "info");
    return { found, weak, fresh };
  }

  function getSpaceportsList(dm) {
    if (!dm) return [];
    const origin = getShipPosition(dm);
    const spaceports = [];
    const systems = (dm.getAllSystems ? dm.getAllSystems() : [])
      .filter((s) => s && (s.hardcoded || s.farHardcoded));

    systems.forEach((sys) => {
      (sys.planets || []).forEach((planet) => {
        (planet.landingLocations || []).forEach((loc) => {
          spaceports.push({
            name: loc.name,
            bodyName: planet.name,
            parentPlanet: null,
            isMoon: false,
            system: sys,
            dist: calcSysDistance(origin, sys),
            far: !!sys.farHardcoded,
          });
        });
        (planet.moons || []).forEach((moon) => {
          (moon.landingLocations || []).forEach((loc) => {
            spaceports.push({
              name: loc.name,
              bodyName: moon.name,
              parentPlanet: planet.name,
              isMoon: true,
              system: sys,
              dist: calcSysDistance(origin, sys),
              far: !!sys.farHardcoded,
            });
          });
        });
      });
    });

    spaceports.sort((a, b) => a.dist - b.dist);
    return spaceports;
  }

  function openShipControls(initialTab) {
    const dm = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem.starMapData : null;
    if (!dm || !dm.playerShip) {
      if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
      return;
    }

    const validTabs = ["current", "bookmarks", "catalog", "patrons", "life", "spaceports", "galaxies"];
    if (initialTab && validTabs.includes(initialTab)) {
      _shipControlsTab = initialTab;
      _shipControlsFilter = "";
    }

    ensureShipControlsStyles();
    closeShipControls(true);

    if (typeof TouchInput !== "undefined" && TouchInput.clear) TouchInput.clear();
    if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.clearDestination) {
      $gameTemp.clearDestination();
    }

    const overlay = document.createElement("div");
    overlay.id = "gx-ship-controls-overlay";
    overlay.className = "npc-empathize-overlay npc-shown";
    overlay.innerHTML = `<div id="gx-ship-controls-modal" class="npc-empathize-inner"></div>`;
    document.body.appendChild(overlay);
    _shipControlsOverlay = overlay;

    // Lock all mouse / touch / pointer events from propagating to the map canvas
    const stopAllPointer = (e) => {
      e.stopPropagation();
      if (typeof TouchInput !== "undefined" && TouchInput.clear) TouchInput.clear();
      if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.clearDestination) {
        $gameTemp.clearDestination();
      }
    };
    overlay.addEventListener("mousedown", stopAllPointer);
    overlay.addEventListener("mouseup", stopAllPointer);
    overlay.addEventListener("pointerdown", stopAllPointer);
    overlay.addEventListener("pointerup", stopAllPointer);
    overlay.addEventListener("touchstart", stopAllPointer, { passive: true });
    overlay.addEventListener("touchend", stopAllPointer, { passive: true });
    overlay.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeShipControls();
    });

    overlay.addEventListener("click", (e) => {
      stopAllPointer(e);
      if (e.target === overlay) {
        closeShipControls();
      }
    });

    _shipControlsKeyHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeShipControls();
      } else if (!document.activeElement || document.activeElement.tagName !== "INPUT") {
        const tabs = ["current", "bookmarks", "catalog", "patrons", "life", "spaceports", "galaxies"];
        if (e.key >= "1" && e.key <= "7") {
          const idx = parseInt(e.key, 10) - 1;
          if (tabs[idx]) {
            _shipControlsTab = tabs[idx];
            _shipControlsFilter = "";
            if (window.SoundManager && window.SoundManager.playCursor) SoundManager.playCursor();
            renderShipControls();
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          const curIdx = tabs.indexOf(_shipControlsTab);
          const nextIdx = (curIdx + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
          _shipControlsTab = tabs[nextIdx];
          _shipControlsFilter = "";
          if (window.SoundManager && window.SoundManager.playCursor) SoundManager.playCursor();
          renderShipControls();
        }
      }
    };
    window.addEventListener("keydown", _shipControlsKeyHandler, true);

    if (window.SoundManager && window.SoundManager.playOk) SoundManager.playOk();
    renderShipControls();

    _shipControlsTimer = setInterval(() => {
      if (!_shipControlsOverlay) return;
      if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.isDestinationValid && $gameTemp.isDestinationValid()) {
        $gameTemp.clearDestination();
      }
      const ship = dm.playerShip;
      if (ship && ship.isMoving) {
        if (typeof dm.updateShipPosition === "function") {
          dm.updateShipPosition();
        }
        updateShipControlsLive();
      }
    }, 300);
  }

  function closeShipControls(silent) {
    if (typeof TouchInput !== "undefined" && TouchInput.clear) TouchInput.clear();
    if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.clearDestination) {
      $gameTemp.clearDestination();
    }
    if (_shipControlsTimer) {
      clearInterval(_shipControlsTimer);
      _shipControlsTimer = null;
    }
    if (_shipControlsKeyHandler) {
      window.removeEventListener("keydown", _shipControlsKeyHandler, true);
      _shipControlsKeyHandler = null;
    }
    if (_shipControlsOverlay) {
      _shipControlsOverlay.remove();
      _shipControlsOverlay = null;
      if (!silent && window.SoundManager && window.SoundManager.playCancel) {
        SoundManager.playCancel();
      }
    }
  }

  function updateShipControlsLive() {
    if (!_shipControlsOverlay) return;
    const dm = $gameSystem?.starMapData;
    if (!dm || !dm.playerShip) return;
    const ship = dm.playerShip;

    // Hyperflux
    const hfVal = dm.getHyperflux ? dm.getHyperflux() : 0;
    const hfEl = _shipControlsOverlay.querySelector("[data-sc-hf-val]");
    const hfFill = _shipControlsOverlay.querySelector("[data-sc-hf-fill]");
    if (hfEl) hfEl.textContent = `${Math.floor(hfVal)}/100`;
    if (hfFill) hfFill.style.width = `${Math.max(0, Math.min(100, hfVal))}%`;

    // Speed / ETA
    const etaEl = _shipControlsOverlay.querySelector("[data-sc-eta]");
    if (etaEl && ship.isMoving) {
      let etaSeconds = 0;
      if (ship.travelDistance && ship.departureTime) {
        const sliderSpeed = $gameVariables.value(94) || 1;
        const isIntra = !!ship.targetSystem && ship.targetSystem === ship.currentSystem;
        const mult = isIntra ? Math.min(sliderSpeed, 2) : sliderSpeed;
        const baseSpeed = isIntra ? 1 : 0.5;
        const elapsed = (Date.now() - ship.departureTime) / 1000;
        const totalSec = ship.travelDistance > 0 ? (ship.travelDistance * 0.95) / (mult * baseSpeed) : 0;
        etaSeconds = Math.max(0, Math.round(totalSec - elapsed));
      }
      etaEl.textContent = `${T('Galaxy.shipControls.flyingTo', { target: ship.targetPlanet || ship.targetStar || ship.targetSystem || "" })} · ${T('Galaxy.shipControls.eta', { seconds: etaSeconds })}`;
    } else if (etaEl && !ship.isMoving) {
      // Arrived: full re-render
      renderShipControls();
    }
  }

  function renderShipControls() {
    if (!_shipControlsOverlay) return;
    const modal = _shipControlsOverlay.querySelector("#gx-ship-controls-modal");
    if (!modal) return;

    const dm = $gameSystem?.starMapData;
    if (!dm || !dm.playerShip) return;
    const ship = dm.playerShip;
    const currentSys = dm.getSystem(ship.currentSystem);
    const speed = $gameVariables.value(94) || 1;

    // Fuel & Pellets
    const hf = dm.getHyperflux ? dm.getHyperflux() : 0;
    const pellets = dm.getSchrodingerite ? dm.getSchrodingerite() : 0;

    // Pips
    let pipsHtml = "";
    for (let i = 0; i < 6; i++) {
      pipsHtml += `<span class="gx-sc-pip ${i < pellets ? "on" : ""}"></span>`;
    }

    // Location text
    let locText = T('Galaxy.shipControls.deepSpace');
    if (ship.isMoving) {
      const dest = ship.targetPlanet || ship.targetStar || ship.targetSystem || "";
      locText = T('Galaxy.shipControls.flyingTo', { target: dest });
    } else if (ship.currentPlanet) {
      locText = T('Galaxy.shipControls.orbiting', { name: ship.currentPlanet });
    } else if (ship.parkedBody && ship.parkedBody.name) {
      locText = T('Galaxy.shipControls.parkedAtStar', { name: ship.parkedBody.name });
    }

    // ETA calculation
    let etaSeconds = 0;
    if (ship.isMoving && ship.travelDistance && ship.departureTime) {
      const isIntra = !!ship.targetSystem && ship.targetSystem === ship.currentSystem;
      const mult = isIntra ? Math.min(speed, 2) : speed;
      const baseSpeed = isIntra ? 1 : 0.5;
      const elapsed = (Date.now() - ship.departureTime) / 1000;
      const totalSec = ship.travelDistance > 0 ? (ship.travelDistance * 0.95) / (mult * baseSpeed) : 0;
      etaSeconds = Math.max(0, Math.round(totalSec - elapsed));
    }
    const etaText = T('Galaxy.shipControls.eta', { seconds: etaSeconds });

    // Counts for tabs
    let currentBodiesCount = 0;
    if (currentSys) {
      currentBodiesCount = 1 + (currentSys.companions ? currentSys.companions.length : 0);
      (currentSys.planets || []).forEach((p) => {
        currentBodiesCount += 1 + (p.moons ? p.moons.length : 0);
      });
    }
    const bookmarks = $gameSystem._gxBookmarks || [];
    const catalogStars = getCatalogStarsNearby(dm);
    const patronStars = getPatronStarsList(dm);
    const lifeData = getBiosignaturesList(dm);
    const lifeCount = lifeData.strong.length + lifeData.weak.length;
    const spaceportsList = getSpaceportsList(dm);
    const spaceportsCount = spaceportsList.length;
    const nearestGalaxies = getNearestGalaxiesList();

    modal.innerHTML = `
      <div class="npc-close-btn gx-sc-close-btn" id="gx-ship-controls-close" data-sc-close title="${T('Galaxy.hud.close')}">&times;</div>

      <div class="npc-tab-bar gx-sc-tab-bar">
        <div class="npc-tab-hint gx-sc-tab-hint">1-7 / TAB</div>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'current' ? 'active' : ''}" data-sc-tab="current">
          ${T('Galaxy.shipControls.tabCurrentSystem')} <span class="gx-sc-cat-count">${currentBodiesCount}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'bookmarks' ? 'active' : ''}" data-sc-tab="bookmarks">
          ${T('Galaxy.shipControls.tabBookmarks')} <span class="gx-sc-cat-count">${bookmarks.length}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'catalog' ? 'active' : ''}" data-sc-tab="catalog">
          ${T('Galaxy.shipControls.tabCatalogStars')} <span class="gx-sc-cat-count">${catalogStars.length}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'patrons' ? 'active' : ''}" data-sc-tab="patrons">
          ${T('Galaxy.shipControls.tabPatronStars')} <span class="gx-sc-cat-count">${patronStars.length}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'life' ? 'active' : ''}" data-sc-tab="life">
          ${T('Galaxy.shipControls.tabBiosignatures')} <span class="gx-sc-cat-count">${lifeCount}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'spaceports' ? 'active' : ''}" data-sc-tab="spaceports">
          ${T('Galaxy.shipControls.tabSpaceports')} <span class="gx-sc-cat-count">${spaceportsCount}</span>
        </button>
        <button class="npc-tab gx-sc-tab ${_shipControlsTab === 'galaxies' ? 'active' : ''}" data-sc-tab="galaxies">
          ${T('Galaxy.shipControls.tabGalaxies')} <span class="gx-sc-cat-count">${nearestGalaxies.length}</span>
        </button>
      </div>

      <div class="npc-panel-body gx-sc-panel-body">
        <div class="npc-left-col gx-sc-left-col">
          <div class="gx-sc-ident">
            <div class="gx-sc-ship-avatar">&#x25C6;</div>
            <div class="gx-sc-ident-text">
              <div class="gx-sc-ident-title">${T('Galaxy.shipControls.title')}</div>
              <div class="gx-sc-ident-sub">${escHtml(locText)}</div>
            </div>
          </div>

          <div class="gx-sc-section">
            <div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.currentSystem')}</div>
            <div style="font-size: 15px; font-weight: bold; color: var(--text-primary-hover, #f3f4f6); line-height: 1.2;">
              ${escHtml(ship.currentSystem || "Sol")}
            </div>
            ${ship.isMoving ? `
              <div data-sc-eta style="margin-top: 4px; font-size: 12px; color: var(--text-amber-hint, #f59e0b);">
                ${T('Galaxy.shipControls.flyingTo', { target: ship.targetPlanet || ship.targetStar || ship.targetSystem || "" })} · ${etaText}
              </div>
              <button class="gx-sc-btn stop" data-sc-stop style="margin-top: 6px; width: 100%;">${T('Galaxy.shipControls.stop')}</button>
            ` : `
              <div style="margin-top: 4px; font-size: 12px; color: var(--text-text-alt-4, #9ca3af);">
                ${T('Galaxy.shipControls.stopped')}
              </div>
            `}
          </div>

          <div class="gx-sc-section">
            <div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.resources')}</div>
            <div class="npc-vital-row gx-sc-vital-row">
              <span class="npc-vital-lbl gx-sc-vital-lbl">${T('Galaxy.shipControls.hyperfluxFuel')}</span>
              <div class="npc-vital-track gx-sc-vital-track">
                <div class="npc-vital-fill gx-sc-vital-fill" data-sc-hf-fill style="width:${Math.max(0, Math.min(100, hf))}%; background: var(--text-cost-ok, #10b981);"></div>
              </div>
              <span class="npc-vital-pct gx-sc-vital-pct" data-sc-hf-val>${Math.floor(hf)}/100</span>
            </div>
            <div class="npc-vital-row gx-sc-vital-row" style="margin-top: 4px;">
              <span class="npc-vital-lbl gx-sc-vital-lbl">${T('Galaxy.shipControls.sbPellets')}</span>
              <div class="gx-sc-pips" style="flex: 1;">${pipsHtml}</div>
              <span class="npc-vital-pct gx-sc-vital-pct" style="color: var(--gx-accent-bridge, #a880ff); font-weight: bold;">${pellets}/6</span>
            </div>
          </div>

          <div class="gx-sc-section">
            <div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.warpSpeed')}</div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 12px; color: var(--text-text-alt-4, #9ca3af);">${T('Galaxy.shipControls.speed')}</span>
              <span class="gx-sc-speed-val" style="font-weight: bold; font-size: 15px; color: var(--text-primary-hover, #f3f4f6);">×${speed}</span>
            </div>
            <input type="range" class="gx-sc-slider" data-sc-speed-input min="1" max="100" value="${speed}">
            <div style="display: flex; gap: 4px; margin-top: 4px;">
              <button class="gx-sc-btn" data-sc-speed-down style="flex: 1;">−</button>
              <button class="gx-sc-btn" data-sc-speed-up style="flex: 1;">+</button>
              <button class="gx-sc-btn" data-sc-speed-set="1">×1</button>
              <button class="gx-sc-btn" data-sc-speed-set="10">×10</button>
              <button class="gx-sc-btn" data-sc-speed-set="50">×50</button>
              <button class="gx-sc-btn" data-sc-speed-set="100">×100</button>
            </div>
          </div>
        </div>

        <div class="npc-right-panel gx-sc-right-panel" id="gx-sc-content-area"></div>
      </div>
    `;

    renderShipControlsContent();
    attachShipControlsEvents();
  }

  function renderShipControlsContent() {
    const area = _shipControlsOverlay?.querySelector("#gx-sc-content-area");
    if (!area) return;

    const dm = $gameSystem?.starMapData;
    if (!dm || !dm.playerShip) return;
    const ship = dm.playerShip;
    const currentSys = dm.getSystem(ship.currentSystem);

    if (_shipControlsTab === "current") {
      if (!currentSys) {
        area.innerHTML = `<div class="npc-empty gx-sc-empty">${T('Galaxy.tab.currentEmpty')}</div>`;
        return;
      }

      let html = `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.starsGroup')}</div>`;

      // Primary Star
      const isParkedPrimary = !ship.isMoving && ship.parkedBody && ship.parkedBody.name === currentSys.name;
      html += `
        <div class="gx-sc-row">
          <div class="gx-sc-item-info">
            <span class="gx-sc-item-name">${escHtml(currentSys.label || currentSys.name)}</span>
            <span class="gx-sc-item-sub">${T('Galaxy.shipControls.primaryStar')} · ${escHtml(String(currentSys.type || "?").replace(/_/g, " "))}</span>
          </div>
          <div class="gx-sc-item-actions">
            ${isParkedPrimary ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
              <button class="gx-sc-btn focusable" data-sc-course='{"kind":"star","name":"${escHtml(currentSys.name)}","systemName":"${escHtml(currentSys.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
              <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"star","name":"${escHtml(currentSys.name)}","systemName":"${escHtml(currentSys.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
            `}
          </div>
        </div>
      `;

      // Companions
      (currentSys.companions || []).forEach((c) => {
        const isParked = !ship.isMoving && ship.parkedBody && ship.parkedBody.name === c.name;
        html += `
          <div class="gx-sc-row">
            <div class="gx-sc-item-info">
              <span class="gx-sc-item-name">${escHtml(c.name)}</span>
              <span class="gx-sc-item-sub">${T('Galaxy.shipControls.companionStar')} · ${escHtml(String(c.type || "?").replace(/_/g, " "))}</span>
            </div>
            <div class="gx-sc-item-actions">
              ${isParked ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                <button class="gx-sc-btn focusable" data-sc-course='{"kind":"star","name":"${escHtml(c.name)}","systemName":"${escHtml(currentSys.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"star","name":"${escHtml(c.name)}","systemName":"${escHtml(currentSys.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
              `}
            </div>
          </div>
        `;
      });

      // Planets & Moons
      const planets = (currentSys.planets || []).slice().sort((a, b) => (a.orbitRadius || 0) - (b.orbitRadius || 0));
      if (planets.length > 0) {
        html += `<div class="npc-sec-hdr gx-sc-sec-hdr" style="margin-top: 14px;">${T('Galaxy.shipControls.planetsGroup')}</div>`;
        planets.forEach((p) => {
          const isHere = !ship.isMoving && ship.currentPlanet === p.name;
          const auStr = p.orbitRadius != null ? ` · ${p.orbitRadius.toFixed(2)} AU` : "";
          html += `
            <div class="gx-sc-row depth-1">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(p.name)}</span>
                <span class="gx-sc-item-sub">${T('Galaxy.shipControls.planet')} · ${escHtml(String(p.type || "?").replace(/_/g, " "))}${auStr}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  <button class="gx-sc-btn focusable" data-sc-course='{"kind":"planet","name":"${escHtml(p.name)}","systemName":"${escHtml(currentSys.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"planet","name":"${escHtml(p.name)}","systemName":"${escHtml(currentSys.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                `}
              </div>
            </div>
          `;

          // Moons
          (p.moons || []).forEach((m) => {
            const isMoonHere = !ship.isMoving && ship.currentPlanet === m.name;
            html += `
              <div class="gx-sc-row depth-2">
                <div class="gx-sc-item-info">
                  <span class="gx-sc-item-name">${escHtml(m.name)}</span>
                  <span class="gx-sc-item-sub">${T('Galaxy.shipControls.moon')} (${escHtml(p.name)}) · ${escHtml(String(m.type || "?").replace(/_/g, " "))}</span>
                </div>
                <div class="gx-sc-item-actions">
                  ${isMoonHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                    <button class="gx-sc-btn focusable" data-sc-course='{"kind":"moon","name":"${escHtml(m.name)}","parentPlanet":"${escHtml(p.name)}","systemName":"${escHtml(currentSys.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                    <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"moon","name":"${escHtml(m.name)}","parentPlanet":"${escHtml(p.name)}","systemName":"${escHtml(currentSys.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                  `}
                </div>
              </div>
            `;
          });
        });
      }

      area.innerHTML = html;
    } else if (_shipControlsTab === "bookmarks") {
      const bookmarks = $gameSystem._gxBookmarks || [];
      if (!bookmarks.length) {
        area.innerHTML = `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noBookmarks')}</div>`;
        return;
      }

      let html = `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.tabBookmarks')}</div>`;
      bookmarks.forEach((bm) => {
        const isStar = bm.kind === "star";
        const isGalaxy = bm.kind === "galaxy";
        let isHere = false;
        if (isGalaxy) {
          if (bm.name === "Milky Way") {
            isHere = !ship.isMoving && (!ship.currentSystem || !isForeignGalaxySystem(ship.currentSystem));
          } else {
            const seed = getGalaxySeed(bm.name);
            isHere = !ship.isMoving && ship.currentSystem && (ship.currentSystem.startsWith("GX." + seed + ".") || ship.currentGalaxy === bm.name);
          }
        } else if (isStar) {
          isHere = (!ship.isMoving && ship.currentSystem === bm.name && ship.parkedBody && ship.parkedBody.name === bm.name);
        } else {
          isHere = (!ship.isMoving && ship.currentPlanet === bm.name);
        }
        const sub = bm.systemName ? `${bm.systemName} · ${bm.kind || ""}` : (bm.kind || "");
        html += `
          <div class="gx-sc-row">
            <div class="gx-sc-item-info">
              <span class="gx-sc-item-name">${escHtml(bm.name)}</span>
              <span class="gx-sc-item-sub">${escHtml(sub)}</span>
            </div>
            <div class="gx-sc-item-actions">
              ${isHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                ${!isGalaxy ? `<button class="gx-sc-btn focusable" data-sc-course='{"kind":"${escHtml(bm.kind)}","name":"${escHtml(bm.name)}","systemName":"${escHtml(bm.systemName || bm.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>` : ''}
                <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"${escHtml(bm.kind)}","name":"${escHtml(bm.name)}","systemName":"${escHtml(bm.systemName || bm.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${isGalaxy ? T('Galaxy.shipControls.jump') : T('Galaxy.shipControls.sbJump')}</button>
              `}
              <button class="gx-sc-btn bookmark bookmark-on focusable" data-sc-unbookmark='{"name":"${escHtml(bm.name)}"}' style="margin:0;" title="${T('Galaxy.hud.bookmarkRemove')}">★</button>
            </div>
          </div>
        `;
      });
      area.innerHTML = html;
    } else if (_shipControlsTab === "catalog") {
      let systems = getCatalogStarsNearby(dm);
      const shipPos = getShipPosition(dm);

      // Search filter
      const q = (_shipControlsFilter || "").trim().toLowerCase();
      if (q) {
        systems = systems.filter((s) => {
          const n = (s.name || "").toLowerCase();
          const l = (s.label || "").toLowerCase();
          const t = (s.type || "").toLowerCase();
          return n.includes(q) || l.includes(q) || t.includes(q);
        });
      }

      // Sort by distance from ship
      systems.sort((a, b) => calcSysDistance(shipPos, a) - calcSysDistance(shipPos, b));

      // Cap at 100 for maximum rendering speed
      const displaySystems = systems.slice(0, 100);
      const bookmarks = $gameSystem._gxBookmarks || [];

      let html = `
        <div class="gx-sc-search-wrap">
          <input type="text" class="gx-sc-search-input" data-sc-search-input placeholder="${T('Galaxy.shipControls.searchPlaceholder')}" value="${escHtml(_shipControlsFilter)}">
        </div>
      `;

      if (!displaySystems.length) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noStarsFound')}</div>`;
      } else {
        html += `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.tabCatalogStars')}</div>`;
        displaySystems.forEach((sys) => {
          const isCurrentSys = !ship.isMoving && ship.currentSystem === sys.name;
          const dist = calcSysDistance(shipPos, sys);
          const pCount = sys.planets ? sys.planets.length : 0;
          const pStr = pCount === 1 ? T('Galaxy.shipControls.planetsCountOne') : T('Galaxy.shipControls.planetsCount', { count: pCount });
          const distStr = dist > 0 ? ` · ${dist.toFixed(1)} ly` : "";
          const isBookmarked = bookmarks.some(b => b.name === sys.name);

          html += `
            <div class="gx-sc-row">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(sys.label || sys.name)}</span>
                <span class="gx-sc-item-sub">${escHtml(String(sys.type || "?").replace(/_/g, " "))} · ${pStr}${distStr}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isCurrentSys ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  <button class="gx-sc-btn focusable" data-sc-course='{"kind":"star","name":"${escHtml(sys.name)}","systemName":"${escHtml(sys.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"star","name":"${escHtml(sys.name)}","systemName":"${escHtml(sys.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                `}
                <button class="gx-sc-btn bookmark ${isBookmarked ? 'bookmark-on' : ''} focusable" data-sc-toggle-bm='{"kind":"star","name":"${escHtml(sys.name)}","systemName":"${escHtml(sys.name)}"}' style="margin:0;" title="${isBookmarked ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">${isBookmarked ? "★" : "☆"}</button>
              </div>
            </div>
          `;
        });
      }

      area.innerHTML = html;

      // Preserve focus on search input if active
      const searchInput = area.querySelector("[data-sc-search-input]");
      if (searchInput && document.activeElement && document.activeElement.hasAttribute("data-sc-search-input")) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    } else if (_shipControlsTab === "patrons") {
      let patronStars = getPatronStarsList(dm);
      const shipPos = getShipPosition(dm);

      // Search filter
      const q = (_shipControlsFilter || "").trim().toLowerCase();
      if (q) {
        patronStars = patronStars.filter((rec) => {
          const n = (rec.name || "").toLowerCase();
          const pn = (rec.patron?.name || "").toLowerCase();
          const sn = (rec.system?.name || "").toLowerCase();
          const t = (rec.system?.type || "").toLowerCase();
          return n.includes(q) || pn.includes(q) || sn.includes(q) || t.includes(q);
        });
      }

      patronStars.sort((a, b) => calcSysDistance(shipPos, a.system) - calcSysDistance(shipPos, b.system));

      const bookmarks = $gameSystem._gxBookmarks || [];

      let html = `
        <div class="gx-sc-search-wrap">
          <input type="text" class="gx-sc-search-input" data-sc-search-input placeholder="${T('Galaxy.shipControls.searchPatronsPlaceholder')}" value="${escHtml(_shipControlsFilter)}">
        </div>
      `;

      if (!patronStars.length) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noPatronsFound')}</div>`;
      } else {
        html += `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.patronsGroup')}</div>`;
        patronStars.forEach((rec) => {
          const isCurrentSys = !ship.isMoving && ship.currentSystem === rec.system?.name;
          const dist = calcSysDistance(shipPos, rec.system);
          const distStr = dist > 0 ? ` · ${dist.toFixed(1)} ly` : "";
          const isBookmarked = bookmarks.some(b => b.name === rec.system?.name || b.name === rec.name);
          const patronName = rec.patron?.name || rec.name;
          const starType = String(rec.system?.type || "?").replace(/_/g, " ");

          html += `
            <div class="gx-sc-row">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(rec.name)}</span>
                <span class="gx-sc-item-sub">${escHtml(patronName)} · ${escHtml(starType)}${distStr}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isCurrentSys ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  <button class="gx-sc-btn focusable" data-sc-course='{"kind":"star","name":"${escHtml(rec.system?.name || rec.name)}","systemName":"${escHtml(rec.system?.name || rec.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"star","name":"${escHtml(rec.system?.name || rec.name)}","systemName":"${escHtml(rec.system?.name || rec.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                `}
                <button class="gx-sc-btn bookmark ${isBookmarked ? 'bookmark-on' : ''} focusable" data-sc-toggle-bm='{"kind":"star","name":"${escHtml(rec.system?.name || rec.name)}","systemName":"${escHtml(rec.system?.name || rec.name)}"}' style="margin:0;" title="${isBookmarked ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">${isBookmarked ? "★" : "☆"}</button>
              </div>
            </div>
          `;
        });
      }

      area.innerHTML = html;

      // Preserve focus on search input if active
      const searchInput = area.querySelector("[data-sc-search-input]");
      if (searchInput && document.activeElement && document.activeElement.hasAttribute("data-sc-search-input")) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    } else if (_shipControlsTab === "life") {
      const lifeData = getBiosignaturesList(dm);
      const q = (_shipControlsFilter || "").trim().toLowerCase();
      const filterFn = (w) => {
        if (!q) return true;
        const n = (w.planet.name || "").toLowerCase();
        const sn = (w.system.label || w.system.name || "").toLowerCase();
        const t = (w.planet.type || "").toLowerCase();
        const tl = (w.tierLabel || "").toLowerCase();
        return n.includes(q) || sn.includes(q) || t.includes(q) || tl.includes(q);
      };
      const strongList = lifeData.strong.filter(filterFn);
      const weakList = lifeData.weak.filter(filterFn);
      const totalRaw = lifeData.strong.length + lifeData.weak.length;
      const totalFiltered = strongList.length + weakList.length;
      const bookmarks = $gameSystem._gxBookmarks || [];

      let html = `
        <div class="gx-sc-search-wrap" style="display: flex; gap: 8px;">
          <input type="text" class="gx-sc-search-input" data-sc-search-input placeholder="${T('Galaxy.shipControls.searchBiosignaturesPlaceholder')}" value="${escHtml(_shipControlsFilter)}" style="flex: 1;">
          <button class="gx-sc-btn focusable" data-sc-bioscan style="white-space: nowrap;">${T('Galaxy.shipControls.scanBiosignatures')}</button>
        </div>
      `;

      if (totalRaw === 0) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noBiosignatures')}</div>`;
      } else if (totalFiltered === 0) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noBiosignaturesFound')}</div>`;
      } else {
        const renderRow = (w) => {
          const isHere = !ship.isMoving && ship.currentPlanet === w.planet.name;
          const distStr = w.dist > 0 ? ` · ${w.dist.toFixed(1)} ly` : "";
          const isBookmarked = bookmarks.some(b => b.name === w.planet.name);
          const typeStr = String(w.planet.type || "?").replace(/_/g, " ");
          const tierStr = w.tierLabel ? ` · ${w.tierLabel}` : "";

          return `
            <div class="gx-sc-row">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(w.planet.name)}</span>
                <span class="gx-sc-item-sub">${escHtml(w.system.label || w.system.name)} · ${escHtml(typeStr)}${escHtml(tierStr)}${distStr}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  <button class="gx-sc-btn focusable" data-sc-course='{"kind":"planet","name":"${escHtml(w.planet.name)}","systemName":"${escHtml(w.system.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"planet","name":"${escHtml(w.planet.name)}","systemName":"${escHtml(w.system.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                `}
                <button class="gx-sc-btn bookmark ${isBookmarked ? 'bookmark-on' : ''} focusable" data-sc-toggle-bm='{"kind":"planet","name":"${escHtml(w.planet.name)}","systemName":"${escHtml(w.system.name)}"}' style="margin:0;" title="${isBookmarked ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">${isBookmarked ? "★" : "☆"}</button>
              </div>
            </div>
          `;
        };

        if (strongList.length > 0) {
          html += `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.lifeBearingGroup')}</div>`;
          strongList.forEach(w => { html += renderRow(w); });
        }
        if (weakList.length > 0) {
          html += `<div class="npc-sec-hdr gx-sc-sec-hdr" style="margin-top: 14px;">${T('Galaxy.shipControls.traceLifeGroup')}</div>`;
          weakList.forEach(w => { html += renderRow(w); });
        }
      }

      area.innerHTML = html;

      const searchInput = area.querySelector("[data-sc-search-input]");
      if (searchInput && document.activeElement && document.activeElement.hasAttribute("data-sc-search-input")) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    } else if (_shipControlsTab === "spaceports") {
      let spaceports = getSpaceportsList(dm);
      const q = (_shipControlsFilter || "").trim().toLowerCase();
      if (q) {
        spaceports = spaceports.filter((sp) => {
          const n = (sp.name || "").toLowerCase();
          const bn = (sp.bodyName || "").toLowerCase();
          const sn = (sp.system.label || sp.system.name || "").toLowerCase();
          return n.includes(q) || bn.includes(q) || sn.includes(q);
        });
      }

      const bookmarks = $gameSystem._gxBookmarks || [];

      let html = `
        <div class="gx-sc-search-wrap">
          <input type="text" class="gx-sc-search-input" data-sc-search-input placeholder="${T('Galaxy.shipControls.searchSpaceportsPlaceholder')}" value="${escHtml(_shipControlsFilter)}">
        </div>
      `;

      if (!spaceports.length) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noSpaceportsFound')}</div>`;
      } else {
        html += `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.landingSitesGroup')}</div>`;
        spaceports.forEach((sp) => {
          const isHere = !ship.isMoving && ship.currentPlanet === sp.bodyName;
          const distStr = sp.dist > 0 ? ` · ${sp.dist.toFixed(1)} ly` : "";
          const isBookmarked = bookmarks.some(b => b.name === sp.name || b.name === sp.bodyName);
          const bodyLabel = sp.isMoon ? `${sp.bodyName} (${sp.parentPlanet})` : sp.bodyName;
          const sub = `${bodyLabel} · ${sp.system.label || sp.system.name}${distStr}`;

          html += `
            <div class="gx-sc-row">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(sp.name)}</span>
                <span class="gx-sc-item-sub">${escHtml(sub)}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  ${!sp.far ? `<button class="gx-sc-btn focusable" data-sc-course='{"kind":"${sp.isMoon ? "moon" : "planet"}","name":"${escHtml(sp.bodyName)}","parentPlanet":"${escHtml(sp.parentPlanet || "")}","systemName":"${escHtml(sp.system.name)}"}' style="margin:0;">${T('Galaxy.shipControls.setCourse')}</button>` : ''}
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"${sp.isMoon ? "moon" : "planet"}","name":"${escHtml(sp.bodyName)}","parentPlanet":"${escHtml(sp.parentPlanet || "")}","systemName":"${escHtml(sp.system.name)}"}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.sbJump')}</button>
                `}
                <button class="gx-sc-btn bookmark ${isBookmarked ? 'bookmark-on' : ''} focusable" data-sc-toggle-bm='{"kind":"${sp.isMoon ? "moon" : "planet"}","name":"${escHtml(sp.name)}","systemName":"${escHtml(sp.system.name)}"}' style="margin:0;" title="${isBookmarked ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">${isBookmarked ? "★" : "☆"}</button>
              </div>
            </div>
          `;
        });
      }

      area.innerHTML = html;

      const searchInput = area.querySelector("[data-sc-search-input]");
      if (searchInput && document.activeElement && document.activeElement.hasAttribute("data-sc-search-input")) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    } else if (_shipControlsTab === "galaxies") {
      let galaxies = getNearestGalaxiesList();
      const q = (_shipControlsFilter || "").trim().toLowerCase();
      if (q) {
        galaxies = galaxies.filter((g) => {
          const n = (g.name || "").toLowerCase();
          const t = (g.type || "").toLowerCase();
          return n.includes(q) || t.includes(q);
        });
      }

      const bookmarks = $gameSystem._gxBookmarks || [];
      let html = `
        <div class="gx-sc-search-wrap">
          <input type="text" class="gx-sc-search-input" data-sc-search-input placeholder="${T('Galaxy.shipControls.searchGalaxiesPlaceholder')}" value="${escHtml(_shipControlsFilter)}">
        </div>
      `;

      if (!galaxies.length) {
        html += `<div class="npc-empty gx-sc-empty">${T('Galaxy.shipControls.noGalaxiesFound')}</div>`;
      } else {
        html += `<div class="npc-sec-hdr gx-sc-sec-hdr">${T('Galaxy.shipControls.galaxiesGroup')}</div>`;
        galaxies.forEach((g) => {
          let isHere = false;
          if (g.name === "Milky Way") {
            isHere = !ship.isMoving && (!ship.currentSystem || !isForeignGalaxySystem(ship.currentSystem));
          } else {
            const seed = getGalaxySeed(g.name);
            isHere = !ship.isMoving && ship.currentSystem && (ship.currentSystem.startsWith("GX." + seed + ".") || ship.currentGalaxy === g.name);
          }

          const dist = g.distance != null ? g.distance : 0;
          const distStr = dist === 0 ? "0 kly" : `${dist} kly`;
          const typeStr = (g.type || "Galaxy").replace(/_/g, " ");
          const isBookmarked = bookmarks.some(b => b.name === g.name);

          html += `
            <div class="gx-sc-row">
              <div class="gx-sc-item-info">
                <span class="gx-sc-item-name">${escHtml(g.name)}</span>
                <span class="gx-sc-item-sub">${escHtml(typeStr)} · ${distStr}</span>
              </div>
              <div class="gx-sc-item-actions">
                ${isHere ? `<span class="gx-sc-badge here npc-badge">${T('Galaxy.shipControls.here')}</span>` : `
                  <button class="gx-sc-btn bridge focusable" data-sc-sb='{"kind":"galaxy","name":"${escHtml(g.name)}","distance":${dist}}' title="${T('Galaxy.hud.openSchrDingerBohrBridge')}">${T('Galaxy.shipControls.jump')}</button>
                `}
                <button class="gx-sc-btn bookmark ${isBookmarked ? 'bookmark-on' : ''} focusable" data-sc-toggle-bm='{"kind":"galaxy","name":"${escHtml(g.name)}"}' style="margin:0;" title="${isBookmarked ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">${isBookmarked ? "★" : "☆"}</button>
              </div>
            </div>
          `;
        });
      }

      area.innerHTML = html;

      // Preserve focus on search input if active
      const searchInput = area.querySelector("[data-sc-search-input]");
      if (searchInput && document.activeElement && document.activeElement.hasAttribute("data-sc-search-input")) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }
  }

  function attachShipControlsEvents() {
    if (!_shipControlsOverlay) return;
    const modal = _shipControlsOverlay.querySelector("#gx-ship-controls-modal");
    if (!modal) return;
    const dm = $gameSystem?.starMapData;
    if (!dm) return;

    // Close button
    modal.querySelector("[data-sc-close]")?.addEventListener("click", () => closeShipControls());

    // Tabs
    modal.querySelectorAll("[data-sc-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        _shipControlsTab = btn.getAttribute("data-sc-tab");
        _shipControlsFilter = "";
        if (window.SoundManager && window.SoundManager.playCursor) SoundManager.playCursor();
        renderShipControls();
      });
    });

    // Speed slider & buttons
    const slider = modal.querySelector(".gx-sc-slider");
    if (slider) {
      slider.addEventListener("input", (e) => {
        setShipControlsSpeed(Number(e.target.value));
      });
    }
    modal.querySelector("[data-sc-speed-down]")?.addEventListener("click", () => {
      const cur = $gameVariables.value(94) || 1;
      setShipControlsSpeed(Math.max(1, cur - 1));
    });
    modal.querySelector("[data-sc-speed-up]")?.addEventListener("click", () => {
      const cur = $gameVariables.value(94) || 1;
      setShipControlsSpeed(Math.min(100, cur + 1));
    });
    modal.querySelectorAll("[data-sc-speed-set]").forEach((b) => {
      b.addEventListener("click", () => {
        setShipControlsSpeed(Number(b.getAttribute("data-sc-speed-set")));
      });
    });

    // Stop
    modal.querySelector("[data-sc-stop]")?.addEventListener("click", () => {
      if (dm.stopTravel) dm.stopTravel(true);
      if (window.SoundManager && window.SoundManager.playCancel) SoundManager.playCancel();
      renderShipControls();
    });

    // Event delegation on content area
    const contentArea = modal.querySelector("#gx-sc-content-area");
    if (contentArea) {
      contentArea.addEventListener("input", (e) => {
        if (e.target && e.target.matches && e.target.matches("[data-sc-search-input]")) {
          _shipControlsFilter = e.target.value;
          renderShipControlsContent();
        }
      });

      contentArea.addEventListener("click", (e) => {
        const bioscanBtn = e.target.closest("[data-sc-bioscan]");
        if (bioscanBtn) {
          scanBiosignatures(dm);
          renderShipControls();
          return;
        }

        const courseBtn = e.target.closest("[data-sc-course]");
        if (courseBtn) {
          try {
            const data = JSON.parse(courseBtn.getAttribute("data-sc-course"));
            handleShipControlsSetCourse(data);
          } catch (err) { console.error(err); }
          return;
        }

        const sbBtn = e.target.closest("[data-sc-sb]");
        if (sbBtn) {
          try {
            const data = JSON.parse(sbBtn.getAttribute("data-sc-sb"));
            handleShipControlsSbJump(data);
          } catch (err) { console.error(err); }
          return;
        }

        const unbmBtn = e.target.closest("[data-sc-unbookmark]");
        if (unbmBtn) {
          try {
            const data = JSON.parse(unbmBtn.getAttribute("data-sc-unbookmark"));
            handleShipControlsToggleBookmark(data);
          } catch (err) { console.error(err); }
          return;
        }

        const toggleBmBtn = e.target.closest("[data-sc-toggle-bm]");
        if (toggleBmBtn) {
          try {
            const data = JSON.parse(toggleBmBtn.getAttribute("data-sc-toggle-bm"));
            handleShipControlsToggleBookmark(data);
          } catch (err) { console.error(err); }
          return;
        }
      });
    }
  }

  function setShipControlsSpeed(val) {
    const v = Math.max(1, Math.min(100, Math.round(val) || 1));
    $gameVariables.setValue(94, v);
    const dm = $gameSystem?.starMapData;
    if (dm && typeof dm.recalculateDepartureOnSpeedChange === "function") {
      dm.recalculateDepartureOnSpeedChange();
    }
    if (window.SoundManager && window.SoundManager.playCursor) SoundManager.playCursor();
    const speedValEl = _shipControlsOverlay?.querySelector(".gx-sc-speed-val");
    if (speedValEl) speedValEl.textContent = `×${v}`;
    const slider = _shipControlsOverlay?.querySelector(".gx-sc-slider");
    if (slider) slider.value = v;
    updateShipControlsLive();
  }

  function handleShipControlsSetCourse(target) {
    const dm = $gameSystem?.starMapData;
    if (!dm || !target) return;
    const ship = dm.playerShip;

    // Check if already there
    if (!ship.isMoving && ship.currentSystem === target.systemName) {
      if (target.kind === "star" && ship.parkedBody && ship.parkedBody.name === target.name) {
        if (window.SoundManager) SoundManager.playBuzzer();
        notify(T('Galaxy.shipControls.alreadyThere'), "info");
        return;
      }
      if (target.kind !== "star" && ship.currentPlanet === target.name) {
        if (window.SoundManager) SoundManager.playBuzzer();
        notify(T('Galaxy.shipControls.alreadyThere'), "info");
        return;
      }
    }

    let ok = false;
    if (target.kind === "star") {
      if (target.systemName === target.name) {
        ok = dm.startTravelToSystem(target.name);
      } else {
        ok = dm.startTravelToStar(target.systemName, target.name) || dm.startTravelToSystem(target.systemName);
      }
    } else if (target.kind === "planet") {
      ok = dm.startTravelToPlanet(target.systemName, target.name);
    } else if (target.kind === "moon") {
      const pName = target.parentPlanet || target.name;
      ok = dm.startTravelToPlanet(target.systemName, pName);
    } else {
      ok = dm.startTravelToSystem(target.systemName || target.name);
    }

    if (ok) {
      if (window.SoundManager) SoundManager.playOk();
      notify(T('Galaxy.shipControls.courseSetTo', { name: target.name }), "info");
      renderShipControls();
    } else {
      if (window.SoundManager) SoundManager.playBuzzer();
    }
  }

  function handleShipControlsSbJump(target) {
    const dm = $gameSystem?.starMapData;
    if (!dm || !target) return;
    const ship = dm.playerShip;

    // Check if already there
    if (ship && !ship.isMoving) {
      if (target.kind === "galaxy") {
        let isHere = false;
        if (target.name === "Milky Way") {
          isHere = !ship.currentSystem || !isForeignGalaxySystem(ship.currentSystem);
        } else {
          const seed = getGalaxySeed(target.name);
          isHere = ship.currentSystem && (ship.currentSystem.startsWith("GX." + seed + ".") || ship.currentGalaxy === target.name);
        }
        if (isHere) {
          if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
          notify(T('Galaxy.shipControls.alreadyThere'), "info");
          return;
        }
      } else if (ship.currentSystem === target.systemName) {
        if (target.kind === "star" && ship.parkedBody && ship.parkedBody.name === target.name) {
          if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
          notify(T('Galaxy.shipControls.alreadyThere'), "info");
          return;
        }
        if (target.kind !== "star" && ship.currentPlanet === target.name) {
          if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
          notify(T('Galaxy.shipControls.alreadyThere'), "info");
          return;
        }
      }
    }

    const infinite = isInfiniteFuel();
    const pellets = dm.getSchrodingerite ? dm.getSchrodingerite() : 0;
    if (!infinite && pellets < 1) {
      if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
      notify(T('Galaxy.shipControls.noPellets'), "warning");
      return;
    }

    if (!infinite && dm.setSchrodingerite) {
      dm.setSchrodingerite(pellets - 1);
    }

    let ok = false;
    if (target.kind === "galaxy") {
      if (target.name === "Milky Way") {
        ok = dm.teleportToSystem("Sol");
        ship.currentGalaxy = "Milky Way";
        if (window.SceneManager && window.SceneManager._scene && typeof window.SceneManager._scene._exitGalaxyFocus === "function") {
          window.SceneManager._scene._exitGalaxyFocus();
        }
      } else {
        const seed = getGalaxySeed(target.name);
        const sysList = dm.generateGalaxySystems ? dm.generateGalaxySystems(seed) : null;
        const targetSysName = (sysList && sysList.length > 0) ? sysList[0].name : ("GX." + seed + ".0");
        ok = dm.teleportToSystem(targetSysName);
        ship.currentGalaxy = target.name;
        if (window.SceneManager && window.SceneManager._scene && typeof window.SceneManager._scene._enterGalaxyFocus === "function") {
          window.SceneManager._scene._enterGalaxyFocus(target.name);
        }
      }
    } else if (target.kind === "star") {
      if (target.systemName === target.name) {
        ok = dm.teleportToSystem(target.name);
      } else {
        ok = dm.parkAtStar(target.systemName, target.name);
      }
    } else if (target.kind === "planet") {
      ok = dm.teleportToPlanetOrbit(target.systemName, target.name);
    } else if (target.kind === "moon") {
      const pName = target.parentPlanet || target.name;
      ok = dm.teleportToPlanetOrbit(target.systemName, pName);
    } else {
      ok = dm.teleportToSystem(target.systemName || target.name);
    }

    if (ok) {
      if (window.$gameScreen && window.$gameScreen.startFlash) {
        $gameScreen.startFlash([200, 235, 255, 220], 25);
      }
      if (window.AudioManager && window.AudioManager.playSe) {
        AudioManager.playSe({ name: "Teleport", pan: 0, pitch: 120, volume: 90 });
      }
      if (window.SoundManager && window.SoundManager.playOk) SoundManager.playOk();
      notify(T('Galaxy.shipControls.sbJumpTo', { name: target.name }), "info");
      renderShipControls();
    } else {
      if (!infinite && dm.setSchrodingerite) {
        dm.setSchrodingerite(pellets);
      }
      if (window.SoundManager && window.SoundManager.playBuzzer) SoundManager.playBuzzer();
    }
  }

  function handleShipControlsToggleBookmark(target) {
    if (!$gameSystem._gxBookmarks) $gameSystem._gxBookmarks = [];
    const list = $gameSystem._gxBookmarks;
    const idx = list.findIndex(b => b.name === target.name);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push({
        kind: target.kind || "star",
        name: target.name,
        systemName: target.systemName || null,
      });
    }
    if (window.SoundManager) SoundManager.playCursor();
    renderShipControls();
  }

  window.GalaxySim.openShipControls = openShipControls;
  window.GalaxySim.closeShipControls = closeShipControls;
  window.GalaxySim.getBiosignaturesList = getBiosignaturesList;
  window.GalaxySim.scanBiosignatures = scanBiosignatures;
  window.GalaxySim.getSpaceportsList = getSpaceportsList;

  console.log("GalaxySim_Core: Plugin initialized successfully");

})();
