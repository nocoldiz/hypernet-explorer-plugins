/*:
 * @target MZ
 * @plugindesc Weather, Time & Temperature System v1.5.0 (MUSH Audio Engine Integration)
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Weather, Time & Temperature System Plugin for RPG Maker MZ
 * ============================================================================
 * * This plugin creates a dynamic weather system with realistic temperature
 * and sunlight simulation that changes based on time of day, weather, seasons,
 * and the selected country.
 *
 * REQUIRES: MUSH_Audio_Engine.js (must be loaded before this plugin)
 *
 * * Features:
 * - Dynamic weather, temperature, and sunlight based on country data.
 * - Weather changes when entering maps with <Exterior> tag.
 * - Weather effects are removed in maps with <Interior> tag.
 * - Time of day tinting system based on realistic sunrise/sunset times.
 * - Screen tint is affected by temperature (blue for cold, red for hot).
 * - Screen tint is removed upon entering a battle.
 * - Interior maps are now tinted based on temperature only.
 * - Temperature simulation based on country's seasonal day/night temps.
 * - Map-specific base temperatures and forced weather.
 * - NEW v1.5.0: Integrated with MUSH Audio Engine - uses channel 4 for weather BGS
 * - NEW v1.5.0: Weather BGS plays alongside map BGS without overriding it
 * - NEW v1.5.0: Plays random rain sounds (Rain1-4) during rain/storm on exterior maps
 * - NEW v1.5.0: Plays random night ambience (5 variants) during nighttime on exterior maps
 * - NEW v1.5.0: Rain BGS has priority over night BGS
 * - Status effects applied based on weather type:
 * - Rain: Status Effect 28 (Wet)
 * - Storm: Status Effect 27 (Static)
 * - Snow: Status Effect 25 (Hot)
 * - Seeded random weather based on real time and date.
 * - Current hour saved in Variable 23.
 * - Temperature saved in Variable 61 (in Celsius).
 * - On map ID 315, country is set automatically by region ID.
 * * Map Tags:
 * - <Exterior> - Enables weather changes and time tints on this map.
 *                 Also enables weather/night BGS on MUSH Audio Engine channel 4.
 * - <Interior> - Disables time tints, but enables temperature tints.
 *                 Stops channel 4 BGS (weather sounds won't play indoors).
 * - <Dark> - Forces midnight lighting regardless of time or interior/exterior status.
 * - <Light> - Forces midday lighting regardless of time or interior/exterior status.
 * - <BaseTemp:X> - Sets base temperature for this map (X = temperature in Celsius).
 * - <ForceWeather:TYPE> - Forces specific weather on this map (none/rain/storm/snow).
 * - <Night:filename> - Overrides the night ambience sound for this map (e.g., night-ambience).
 * * Examples:
 * - <BaseTemp:25> - Sets map base temperature to 25°C.
 * - <ForceWeather:rain> - Always raining on this map.
 * - <Night:night-cricket3> - Always plays night-cricket3 at night on this map.
 *
 * MUSH Audio Engine Integration:
 * - Weather and night BGS play on channel 4 (won't override map BGS)
 * - Rain sounds: Rain1, Rain2, Rain3, Rain4 (random selection)
 * - Night sounds: night-ambience, night-ambience2, night-ambience3,
 *                 night-cricket3, night-crickets (random selection)
 * - Only plays on exterior maps
 * - Rain BGS has priority over night BGS
 * * @param weatherChangeChance
 * @text Weather Change Chance
 * @desc Chance of weather changing when entering an exterior map (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 15
 * * @param sunlightColorMode
 * @text Sunlight Color Mode
 * @desc Controls how the day/night tint cycle works on exterior maps
 * @type select
 * @option Full Cycle (Default)
 * @value full
 * @option Day Only (No tint)
 * @value day
 * @option Night Only
 * @value night
 * @option Dusk Only
 * @value dusk
 * @default full
 * * @param enableTimeDebug
 * @text Enable Time Debug
 * @desc Show console messages for time changes (for development)
 * @type boolean
 * @default false
 * * @param enableTempDebug
 * @text Enable Temperature Debug
 * @desc Show console messages for temperature changes (for development)
 * @type boolean
 * @default false
 * * @command forceWeatherChange
 * @text Force Weather Change
 * @desc Forces a random weather change immediately
 * * @command forceTimeUpdate
 * @text Force Time Update
 * @desc Forces an immediate time and tint update
 * * @command forceTemperatureUpdate
 * @text Force Temperature Update
 * @desc Forces an immediate temperature recalculation
 * * @command changeSunlightMode
 * @text Change Sunlight Mode
 * @desc Changes the sunlight color mode during gameplay
 * @command setMapExterior
 * @text Set Map to Exterior
 * @desc Forces the current map to be treated as exterior (enables weather and time tints)
 *
 * @command setMapInterior
 * @text Set Map to Interior
 * @desc Forces the current map to be treated as interior (disables time tints, keeps temperature tints)
 *
 * @command toggleMapType
 * @text Toggle Map Type
 * @desc Toggles between interior and exterior mode for the current map
 * * @arg mode
 * @text Mode
 * @desc Select the sunlight color mode
 * @type select
 * @option Full Cycle
 * @value full
 * @option Day Only
 * @value day
 * @option Night Only
 * @value night
 * @option Dusk Only
 * @value dusk
 * @default full
 * @command setCountryByRegion
 * @text Set Country by Region
 * @desc Sets the country based on the current region ID the player is standing on
 * * * @command setCurrentCountry
 * @text Set Current Country
 * @desc Sets the country for weather, temperature, and sun patterns.
 * * @arg countryId
 * @text Country ID
 * @desc The ID of the country from the Countries data list in the plugin.
 * @type number
 * @min 1
 * @default 78
 * * @command addCustomWeatherEffect
 * @text Add Custom Weather Effect
 * @desc Add custom animated weather effects using PIXI
 * * @arg effectType
 * @text Effect Type
 * @desc Type of custom weather effect
 * @type select
 * @option Fireflies
 * @value fireflies
 * @option Pollen
 * @value pollen
 * @option Leaves
 * @value leaves
 * @option Sakura Petals
 * @value sakura
 * @option Dust Storm
 * @value dust
 * @option Ash Fall
 * @value ash
 * @option Magic Particles
 * @value magic
 * @option Bubbles
 * @value bubbles
 * @option Embers
 * @value embers
 * @option Aurora
 * @value aurora
 * @default fireflies
 * * @arg intensity
 * @text Intensity
 * @desc Intensity of the effect (1-10)
 * @type number
 * @min 1
 * @max 10
 * @default 5
 * * @arg duration
 * @text Duration
 * @desc Duration of transition in frames
 * @type number
 * @min 1
 * @default 60
 * */

(() => {
  "use strict";

  const pluginName = "WeatherSystem";
  const parameters = PluginManager.parameters(pluginName);
  const weatherChangeChance = Number(parameters["weatherChangeChance"] || 15);
  const enableTimeDebug = parameters["enableTimeDebug"] === "true";
  const enableTempDebug = parameters["enableTempDebug"] === "true";

  //---------------------------------------------------------------------------
  // Weather audio level
  //---------------------------------------------------------------------------
  // Everything the system plays on MUSH channel 4 (rain, storms, night
  // ambience) is scaled by the Weather Volume slider in the options, on top of
  // the normal BGS volume. WEATHER_BGS_BASE is the level the loops were mixed
  // for; the slider only ever scales it.
  const WEATHER_BGS_BASE = 30;
  const WEATHER_CHANNEL = 4;

  // The configured level, defended against a config written before the option
  // existed (or one carrying a null/NaN from an older build).
  const weatherVolumeConfig = () => {
    const v = Number(ConfigManager.weatherVolume);
    return isFinite(v) ? v.clamp(0, 100) : 80;
  };

  // Scales any authored ambience level by the slider.
  const scaleAmbience = (base) => Math.round((Number(base) || 0) * weatherVolumeConfig() / 100);

  // A scene that borrows the weather channel (battle, fishing) quiets it by a
  // factor instead of writing a level of its own, so the slider still owns the
  // volume while the channel is on loan and a later slider move is still heard.
  let duckFactor = 1;
  const weatherBgsVolume = () => scaleAmbience(WEATHER_BGS_BASE);
  const duckedBgsVolume = () => Math.round(weatherBgsVolume() * duckFactor);

  // Re-applies the current level to whatever is already playing on the weather
  // channel, so moving the slider is heard immediately rather than at the next
  // weather change. Also used to silence the channel when the slider hits 0.
  // The pitch is always restated as 100: a borrower that passed a copy of the
  // buffer through playMushBgs loses the prototype accessors, which lands a
  // pitch of 0 on the buffer and stops it dead.
  const refreshWeatherBgsVolume = () => {
    if (typeof AudioManager.getBgsFromChannel !== "function") return;
    const buffer = AudioManager.getBgsFromChannel(WEATHER_CHANNEL);
    if (!buffer || !buffer.name) return;
    AudioManager.updateMushBgsParameters(buffer, {
      name: buffer.name,
      volume: duckedBgsVolume(),
      pitch: 100,
      pan: (buffer.pan || 0) * 100
    });
  };

  //---------------------------------------------------------------------------
  // Outdoor ambience
  //---------------------------------------------------------------------------
  // The biome ambience (wind, crickets, surf, town tone) that WorldMapReturn and
  // the procedural generator play on the ordinary BGS channel IS the outdoor
  // weather bed, and it is far louder than the rain loop on channel 4, so the
  // slider has to reach it too or moving it changes nothing audible. Indoors the
  // same ambience is room tone, which belongs to the plain BGS volume alone.
  let ambience = null; // { name, base, pitch, pan } while an outdoor bed plays

  // The same rule checkMapTags() uses to decide whether weather happens here.
  const isOutdoorMap = () => {
    if (!$dataMap || !$dataMap.meta) return false;
    if ($dataMap.meta.Interior || $dataMap.meta.Covered) return false;
    if (!$dataMap.meta.Exterior) return false;
    if (typeof window.isProceduralInteriorMap === "function" &&
        window.isProceduralInteriorMap()) return false;
    return true;
  };

  // The level a biome bed should play at here: scaled by the slider under the
  // open sky, left at its authored level once there is a roof over it. Decided
  // at every application rather than once, since the generator asks for the
  // ambience of the map it is about to transfer the party to.
  const ambienceVolume = (base) => (isOutdoorMap() ? scaleAmbience(base) : base);

  // Plays a biome ambience track and remembers its authored level, so the
  // slider can rescale it later without restarting the loop.
  const playAmbience = (bgs) => {
    if (!bgs || !bgs.name) return;
    ambience = {
      name: bgs.name,
      base: Number(bgs.volume) || 0,
      pitch: Number(bgs.pitch) || 100,
      pan: Number(bgs.pan) || 0
    };
    AudioManager.playBgs({
      name: ambience.name,
      volume: ambienceVolume(ambience.base),
      pitch: ambience.pitch,
      pan: ambience.pan
    });
  };

  // Rescales the playing bed. Anything that replaced or stopped it (a map's own
  // authored BGS, a minigame) drops the record instead.
  const refreshAmbienceVolume = () => {
    if (!ambience) return;
    const current = AudioManager._currentBgs;
    if (!current || current.name !== ambience.name) {
      ambience = null;
      return;
    }
    current.volume = ambienceVolume(ambience.base);
    AudioManager.updateBgsParameters(current);
  };

  const refreshWeatherVolume = () => {
    refreshWeatherBgsVolume();
    refreshAmbienceVolume();
  };

  // Exposed for the options menu (Core/GameOptions.js), for the two generators
  // that play the outdoor bed, and for anything that borrows the weather
  // channel and needs the player's chosen level.
  window.WeatherAudio = {
    base: WEATHER_BGS_BASE,
    channel: WEATHER_CHANNEL,
    volume: duckedBgsVolume,
    scale: scaleAmbience,
    refresh: refreshWeatherVolume,
    playAmbience: playAmbience,
    duck: (factor) => {
      const f = Number(factor);
      duckFactor = isFinite(f) ? f.clamp(0, 1) : 1;
      refreshWeatherBgsVolume();
    },
    restore: () => {
      duckFactor = 1;
      refreshWeatherBgsVolume();
    }
  };

  // DEPENDENCY CHECK: Ensure MUSH Audio Engine is loaded
  if (!AudioManager.playMushBgs || !AudioManager.stopMushBgs || !AudioManager.getBgsFromChannel) {
    const errorMsg = [
      // i18n-ignore-start  console diagnostic
      "==============================================================",
      "ERROR: WeatherSystem v1.5.0 requires MUSH_Audio_Engine.js",
      "==============================================================",
      "The WeatherSystem plugin now uses MUSH Audio Engine to play",
      "weather BGS on channel 4 without overriding map BGS.",
      "",
      "Please ensure MUSH_Audio_Engine.js is:",
      "1. Installed in your js/plugins/ folder",
      "2. Activated in the Plugin Manager",
      "3. Loaded BEFORE WeatherSystem.js",
      "=============================================================="
      // i18n-ignore-end
    ].join("\n");

    console.error(errorMsg);

    if (Utils.isNwjs() && Utils.isOptionValid('test')) {
      alert(errorMsg);
    }

    throw new Error("WeatherSystem: Missing required plugin MUSH_Audio_Engine.js");
  }

  // --- COUNTRY DATA ---
  // For organization, it's best to move this to its own JS file (e.g., countries.js)
  // and include it in your project.
  const { Countries } = window.WorldGen;

  const defaultCountry = Countries.find((c) => c.id === 102);

  const WeatherTypes = {
    NONE: "none",
    RAIN: "rain",
    STORM: "storm",
    SNOW: "snow",
  };

  const FixedTints = {
    day: [255, 255, 255],
    night: [155, 155, 190],
    dusk: [255, 220, 150],
  };

  const WeatherTemperatureEffects = {
    none: 0,
    rain: -3,
    storm: -5,
    snow: -8,
  };

  // ============================================================================
  // PUDDLE SYSTEM - Dynamic puddle spawning during rain
  // ============================================================================
  const PUDDLE_SOURCE_MAP = 574;
  const MAX_PUDDLES = 15;
  const INITIAL_PUDDLE_COUNT = 5;
  const PUDDLE_SPAWN_INTERVAL = 10000; // 10 seconds

  // Cache for puddle template
  let cachedPuddleTemplate = null;

  // Cache for valid spawn tiles (invalidated on map change)
  let _cachedValidTiles = null;
  let _cachedValidTilesMapId = -1;

  // Backup of weather state + puddle positions saved before a scene change
  // (menu open, battle, etc.). Restored when Scene_Map resumes without a transfer.
  let _weatherBackup = null;

  /**
   * Load puddle template event from map 574
   */
  function loadPuddleTemplate() {
    if (cachedPuddleTemplate) return cachedPuddleTemplate;

    const mapFileName = `Map574.json`;

    // Try StorageManager first (desktop builds)
    try {
      if (typeof StorageManager !== "undefined" && StorageManager.fileExists) {
        const basePath = StorageManager.isLocalMode() ? "data\\" : "data/";
        const fullPath = basePath + mapFileName;

        if (StorageManager.fileExists(fullPath)) {
          const mapData = JSON.parse(StorageManager.fileRead(fullPath));
          if (mapData && mapData.events) {
            const puddleEvent = mapData.events.find(
              (e) => e && e.name === "Puddle"  // i18n-ignore  event name  // i18n-ignore  event name
            );
            if (puddleEvent) {
              cachedPuddleTemplate = puddleEvent;
              if (enableTimeDebug) {
                console.log("[Weather] Loaded puddle template from map 574");
              }
              return cachedPuddleTemplate;
            }
          }
        }
      }
    } catch (e) {
      if (enableTimeDebug) {
        console.warn(`[Weather] StorageManager load failed: ${e.message}`);
      }
    }

    // Try XHR (web builds)
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `data/${mapFileName}`, false); // synchronous
      xhr.send();

      if (xhr.status === 200) {
        const mapData = JSON.parse(xhr.responseText);
        if (mapData && mapData.events) {
          const puddleEvent = mapData.events.find(
            (e) => e && e.name === "Puddle"  // i18n-ignore  event name
          );
          if (puddleEvent) {
            cachedPuddleTemplate = puddleEvent;
            if (enableTimeDebug) {
              console.log("[Weather] Loaded puddle template from map 574 (XHR)");
            }
            return cachedPuddleTemplate;
          }
        }
      }
    } catch (e) {
      if (enableTimeDebug) {
        console.warn(`[Weather] XHR load failed: ${e.message}`);
      }
    }

    console.warn("[Weather] Failed to load puddle template from map 574");
    return null;
  }

  /**
   * Find valid tiles for puddle spawning.
   * Result is cached per map ID; call invalidatePuddleTileCache() on map change.
   */
  function findPassableTilesForPuddles() {
    const currentMapId = $gameMap.mapId();
    if (_cachedValidTiles && _cachedValidTilesMapId === currentMapId) {
      return _cachedValidTiles;
    }

    // Build a set of occupied tiles from non-puddle events (O(events), not O(tiles))
    const occupiedTiles = new Set();
    for (const ev of $gameMap.events()) {
      if (!ev || ev._erased) continue;
      // Skip puddle events themselves so we don't block our own slots
      if ($gameSystem._weatherPuddles && $gameSystem._weatherPuddles.includes(ev._eventId)) continue;
      occupiedTiles.add(ev.x + "," + ev.y);
    }

    const tiles = [];
    const width = $gameMap.width();
    const height = $gameMap.height();

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!$gameMap.isPassable(x, y, 2)) continue;

        const region = $gameMap.regionId(x, y);
        if (region === 10 || region === 103) continue;

        if (occupiedTiles.has(x + "," + y)) continue;
        if ($gamePlayer.x === x && $gamePlayer.y === y) continue;

        const terrain = $gameMap.terrainTag(x, y);
        const isPreferredTerrain = terrain === 1 || terrain === 2 || terrain === 5 || terrain === 7;

        tiles.push({ x, y, priority: isPreferredTerrain ? 1 : 0.5 });
      }
    }

    // Stable weighted shuffle ,  preferred tiles first, then randomize within each tier
    const preferred = tiles.filter(t => t.priority === 1).sort(() => Math.random() - 0.5);
    const rest = tiles.filter(t => t.priority !== 1).sort(() => Math.random() - 0.5);
    _cachedValidTiles = preferred.concat(rest);
    _cachedValidTilesMapId = currentMapId;
    return _cachedValidTiles;
  }

  function invalidatePuddleTileCache() {
    _cachedValidTiles = null;
    _cachedValidTilesMapId = -1;
  }

  /**
   * Create a puddle event at specified position
   */
  function createPuddleEvent(template, x, y) {
    if (!$gameMap || !$dataMap) return null;

    // Find next available event ID
    let nextId = $dataMap.events.length;
    while ($dataMap.events[nextId]) {
      nextId++;
    }

    // Deep clone template data
    const puddleData = JSON.parse(JSON.stringify(template));
    puddleData.id = nextId;
    puddleData.x = x;
    puddleData.y = y;

    // Add to map data
    $dataMap.events[nextId] = puddleData;

    // Create Game_Event instance
    const puddleEvent = new Game_Event($gameMap.mapId(), nextId);
    puddleEvent._isWeatherPuddle = true; // Mark as puddle
    puddleEvent.locate(x, y);
    puddleEvent.refresh();

    // Freeze the event so it costs nothing per frame:
    // no auto-triggers, no movement, no condition checks.
    // However, we MUST allow the Fog of War transition to update so they regain color.
    puddleEvent.update = function () {
      if (this.updateFogOfWarTransition) this.updateFogOfWarTransition();
    };

    // Add to map's event list
    $gameMap._events[nextId] = puddleEvent;

    // Add just this one new sprite instead of rebuilding all character sprites
    if (SceneManager._scene && SceneManager._scene._spriteset) {
      const spriteset = SceneManager._scene._spriteset;
      if (spriteset._tilemap && spriteset._characterSprites) {
        const sprite = new Sprite_Character(puddleEvent);
        spriteset._characterSprites.push(sprite);
        spriteset._tilemap.addChild(sprite);
      }
    }

    return nextId;
  }

  // Plugin commands
  PluginManager.registerCommand(pluginName, "forceWeatherChange", (args) => {
    $gameWeather.forceRandomChange();
  });
  PluginManager.registerCommand(pluginName, "forceTimeUpdate", (args) => {
    $gameWeather.updateTimeAndWeather();
  });
  PluginManager.registerCommand(
    pluginName,
    "forceTemperatureUpdate",
    (args) => {
      $gameWeather.updateTemperature();
    }
  );
  PluginManager.registerCommand(pluginName, "setCurrentCountry", (args) => {
    const countryId = Number(args.countryId || 78);
    $gameWeather.setCurrentCountry(countryId);
  });
  const addCustomWeatherEffectCommand = (args) => {
    const effectType = args.effectType || "fireflies";
    const intensity = Number(args.intensity || 5);
    const duration = Number(args.duration || 60);
    $gameWeather.setCustomWeather(effectType, intensity, duration);
  };
  PluginManager.registerCommand(
    pluginName,
    "addCustomWeatherEffect",
    addCustomWeatherEffectCommand
  );
  // Legacy command name kept for old events and esoteric skill common events.
  PluginManager.registerCommand(
    pluginName,
    "setNightVisionEffect",
    addCustomWeatherEffectCommand
  );
  PluginManager.registerCommand(pluginName, "setCountryByRegion", (args) => {
    const regionId = $gameMap.regionId($gamePlayer.x, $gamePlayer.y);
    let countryId = regionId;

    // Check if country with this ID exists
    const countryData = Countries.find((c) => c.id === countryId);
    if (!countryData) {
      countryId = 12; // Default to ID 12 if not found
    }

    $gameWeather.setCurrentCountry(countryId);
  });
  PluginManager.registerCommand(pluginName, "setMapExterior", (args) => {
    if ($gameWeather) {
      $gameWeather.setMapExterior();
    }
  });

  PluginManager.registerCommand(pluginName, "setMapInterior", (args) => {
    if ($gameWeather) {
      $gameWeather.setMapInterior();
    }
  });

  PluginManager.registerCommand(pluginName, "toggleMapType", (args) => {
    if ($gameWeather) {
      $gameWeather.toggleMapType();
    }
  });

  // The country banner used to carry its own copy of the popup machinery: the
  // same parchment element, in the same top-left corner, with its own fade
  // clock, which put it straight on top of the toast stack. It is now a thin
  // caller of the shared notification service, so it queues with every other
  // popup instead of overlapping them.
  class Window_CountryPopup extends Window_Base {
    constructor() {
      super(new Rectangle(0, 0, 0, 0));
      this.opacity = 0;
      this.visible = false;
      this.displayDuration = 180;
      this.countryName = '';
      this.superpowerName = '';

      // Purge the element the old implementation left behind.
      const old = document.getElementById('html-country-popup');
      if (old) old.remove();
    }

    show(countryName, superpowerName) {
      this.countryName = countryName || '';
      this.superpowerName = superpowerName || '';
      if (!this.countryName || !window.ParchmentToast) return;
      window.ParchmentToast.show(
        `<div class="country-popup-name">${this.countryName}</div>` +
        (this.superpowerName ? `<div class="country-popup-super">${this.superpowerName}</div>` : ''),
        {
          severity: 'info',
          duration: this.displayDuration,
          html: true,
          key: `country:${this.countryName}:${this.superpowerName}`  // i18n-ignore  toast dedupe key
        }
      );
    }
  }

  // Helper function to parse game date from Variable 113.
  // The parse is memoized on the raw string: Variable 113 only changes a few
  // times per second at most, but this is called several times per frame, so
  // caching avoids redundant string splitting / parseInt / indexOf work.
  const MONTHS_EN = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const MONTHS_IT = [
    "GEN", "FEB", "MAR", "APR", "MAG", "GIU",
    "LUG", "AGO", "SET", "OTT", "NOV", "DIC",
  ];
  let _dateCacheStr = null;
  let _dateCacheVal = null;
  function getGameDateFromVariable() {
    const dateStr = $gameVariables.value(113) || "01 JAN 2001 12:00";
    // Fast path: same string as last parse, return cached result.
    // Callers only read the fields, so sharing the object is safe.
    if (dateStr === _dateCacheStr && _dateCacheVal) return _dateCacheVal;

    // Format: "01 JAN 2001 12:00"
    const parts = dateStr.split(" ").filter(Boolean);
    if (parts.length < 4) {
      const fallback = { day: 1, month: 0, year: 2001, hours: 8, minutes: 0 };
      _dateCacheStr = dateStr;
      _dateCacheVal = fallback;
      return fallback;
    }

    const day = parseInt(parts[0]) || 1;
    const monthStr = (parts[1] || '').toUpperCase();
    const year = parseInt(parts[2]) || 2001;
    const timeStr = (parts[3] || '12:00').split(":");
    const hours = parseInt(timeStr[0]) || 0;
    const minutes = parseInt(timeStr[1]) || 0;

    let month = MONTHS_EN.indexOf(monthStr);
    if (month === -1) {
      month = MONTHS_IT.indexOf(monthStr);
    }
    if (month === -1) {
      month = 0;
    }

    const result = { day, month, year, hours, minutes };
    _dateCacheStr = dateStr;
    _dateCacheVal = result;
    return result;
  }

  // Helper function to get season from game date
  function getGameSeasonFromVariable() {
    const date = getGameDateFromVariable();
    const month = date.month;
    if (month >= 2 && month <= 4) return "SPRING";
    if (month >= 5 && month <= 7) return "SUMMER";
    if (month >= 8 && month <= 10) return "AUTUMN";
    return "WINTER";
  }

  // Helper function to get day of year from game date
  function getGameDayOfYearFromVariable() {
    const date = getGameDateFromVariable();
    const tempDate = new Date(date.year, date.month, date.day);
    const start = new Date(date.year, 0, 0);
    const diff = tempDate - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  // Weather, Time & Temperature System Manager
  class Game_WeatherTimeSystem {
    constructor() {
      this.currentWeatherType = WeatherTypes.NONE;
      this.isInterior = false;
      this.forcedLighting = null; // null = normal, 'dark' = midnight, 'light' = midday
      this.customWeatherType = null;
      this.customWeatherIntensity = 0;
      this.currentHour = 12;
      this.currentTintIndex = 12;
      this.targetTintIndex = 12;
      this.tintTransitionProgress = 1.0;
      this.tintTransitionDuration = 60;
      this.currentTemperature = 20;
      this.mapBaseTemperature = null;
      this.mapForcedWeather = null;
      this.mapCustomNightSound = null; // Custom night sound for this map

      this.dynamicTints = []; // For country-based tints
      this.currentCountry = defaultCountry; // Initialize with default

      this._lastCheckedRegionId = -1; // MODIFICATION: For world map region tracking
      $gameVariables.setValue(80, -1);

      // Puddle system
      this._lastPuddleSpawnTime = 0;

      // Weather Stability System
      this._weatherStabilityTimer = 0; // Real-world time when weather can change
      this._lastWeatherChangeGameTime = 0; // In-game total minutes when weather last changed
      this._lockedWeatherType = WeatherTypes.NONE; // The weather that is currently locked by the timer

      this.initialize();
    }

    initialize() {
      this.updateTimeAndWeather();
    }
    // The id, not a label: BattleSystemPassiveSkills lowercases and matches
    // it, and window.weatherName carries it. Display goes through
    // window.WeatherNames.label(id).
    // i18n-ignore-start  weather ids
    getWeatherDisplayName() {
      switch (this.currentWeatherType) {
        case WeatherTypes.NONE:
          return "Clear";
        case WeatherTypes.RAIN:
          return "Rain";
        case WeatherTypes.STORM:
          return "Storm";
        case WeatherTypes.SNOW:
          return "Snow";
        default:
          return "Unknown";
      }
    }
    // i18n-ignore-end
    setCurrentCountry(countryId) {
      const countryData = Countries.find((c) => c.id === countryId);
      if (countryData) {
        this.currentCountry = countryData;
        $gameVariables.setValue(86, countryId);

        if (enableTimeDebug) {
          console.log(`Country set to: ${this.currentCountry.country}`);
        }
      } else {
        this.currentCountry = defaultCountry;
        $gameVariables.setValue(86, 255);
        console.warn(`Country with ID ${countryId} not found. Using default.`);
      }
      this.forceTimeUpdate();
    }

    _parseTime(timeStr) {
      if (!timeStr || !timeStr.includes(":")) return 6; // Default to 6 AM if invalid
      const [h, m] = timeStr.split(":").map(Number);
      return h + m / 60;
    }

    _interpolateColor(color1, color2, factor) {
      const r = Math.round(color1[0] + factor * (color2[0] - color1[0]));
      const g = Math.round(color1[1] + factor * (color2[1] - color1[1]));
      const b = Math.round(color1[2] + factor * (color2[2] - color1[2]));
      return [r, g, b];
    }

    _generateDynamicTints() {
      const season = this.getSeason().toLowerCase();
      const seasonData = this.getActiveSeasons()[season];
      if (!seasonData) return;

      // The generated tints only depend on the season's sunrise/sunset and the
      // active climate (country, or biome on OmegaTower maps). Skip the (fairly
      // heavy) 24-keyframe rebuild when neither has changed and we already have
      // a valid table - this runs every in-game minute otherwise.
      const climateKey = this.getActiveClimateKey();
      if (
        this.dynamicTints.length === 24 &&
        this._tintsSeason === season &&
        this._tintsClimateKey === climateKey
      ) {
        return;
      }
      this._tintsSeason = season;
      this._tintsClimateKey = climateKey;

      const sunrise = this._parseTime(seasonData.sunrise);
      const sunset = this._parseTime(seasonData.sunset);

      const solarNoon = sunrise + (sunset - sunrise) / 2;
      const solarMidnight = ((sunset + (24 + sunrise)) / 2) % 24;

      // Enhanced keyframes with golden hour tints at sunrise and sunset
      const keyFrames = [
        { hour: solarMidnight, color: [150, 150, 185] }, // Midnight - Darkest night
        { hour: sunrise - 1.5, color: [160, 160, 195] }, // Pre-dawn - Getting lighter
        { hour: sunrise - 0.75, color: [185, 145, 165] }, // Early dawn - Purple/pink pre-sunrise
        { hour: sunrise - 0.25, color: [255, 150, 80] }, // Dawn golden hour begins - Deep orange
        { hour: sunrise, color: [255, 180, 90] }, // Sunrise golden hour - Warm golden orange
        { hour: sunrise + 0.25, color: [255, 200, 110] }, // Post-sunrise - Golden yellow
        { hour: sunrise + 0.75, color: [255, 220, 140] }, // Morning golden hour fading
        { hour: sunrise + 1.5, color: [250, 240, 200] }, // Late morning - Soft warm light
        { hour: solarNoon, color: [255, 255, 255] }, // Noon - Bright white
        { hour: sunset - 1.5, color: [250, 240, 200] }, // Early evening - Soft warm light
        { hour: sunset - 0.75, color: [255, 220, 130] }, // Pre-sunset golden hour begins
        { hour: sunset - 0.25, color: [255, 190, 100] }, // Sunset golden hour - Rich golden
        { hour: sunset, color: [255, 170, 80] }, // Sunset peak - Deep golden orange
        { hour: sunset + 0.25, color: [255, 150, 90] }, // Post-sunset - Warm orange fading
        { hour: sunset + 0.75, color: [220, 130, 150] }, // Dusk - Purple/pink twilight
        { hour: sunset + 1.5, color: [175, 160, 195] }, // Late dusk - Blue hour begins
        { hour: sunset + 3, color: [165, 160, 195] }, // Early night - Darker still
        { hour: sunset + 5, color: [155, 155, 190] }, // Deep night - Very dark
        { hour: (sunset + 24 + solarMidnight) / 2, color: [152, 152, 187] }, // Mid-evening - Nearly midnight darkness
      ].sort((a, b) => a.hour - b.hour);

      const lastFrame = keyFrames[keyFrames.length - 1];
      keyFrames.unshift({ hour: lastFrame.hour - 24, color: lastFrame.color });
      const firstFrame = keyFrames[1];
      keyFrames.push({ hour: firstFrame.hour + 24, color: firstFrame.color });

      this.dynamicTints = [];
      // Generate tints for each hour (24 entries total)
      for (let h = 0; h < 24; h++) {
        let startFrame, endFrame;
        for (let i = 0; i < keyFrames.length - 1; i++) {
          if (h >= keyFrames[i].hour && h < keyFrames[i + 1].hour) {
            startFrame = keyFrames[i];
            endFrame = keyFrames[i + 1];
            break;
          }
        }

        if (startFrame && endFrame) {
          // Smooth interpolation between keyframes
          const frameDuration = endFrame.hour - startFrame.hour;
          const progress =
            frameDuration > 0 ? (h - startFrame.hour) / frameDuration : 0;
          this.dynamicTints.push(
            this._interpolateColor(startFrame.color, endFrame.color, progress)
          );
        } else {
          this.dynamicTints.push([255, 255, 255]); // Failsafe
        }
      }
    }
    setMapExterior() {
      const wasInterior = this.isInterior;
      this.isInterior = false;

      if (enableTimeDebug) {
        console.log(`Map manually set to EXTERIOR mode`);
      }

      // If we were previously interior, initialize exterior settings
      if (wasInterior) {
        // Reset tint transition to current time
        this.currentTintIndex = this.currentHour;
        this.targetTintIndex = this.currentHour;
        this.tintTransitionProgress = 1.0;

        // Update weather and time
        this.updateTimeAndWeather();

        // Apply weather based on forced weather or random chance
        if (this.mapForcedWeather !== null) {
          this.setWeather(this.mapForcedWeather);
        } else {
          // Always trigger weather change when switching to exterior
          this.changeWeather();
        }

        // NEW BGS SYSTEM - Start playing BGS when switching to exterior
        this.updateEnvironmentBgs();
      }

      // Update tinting to include time-of-day effects
      this.updateTimeOfDayTint();
    }

    // Add this method to Game_WeatherTimeSystem class
    setMapInterior() {
      const wasExterior = !this.isInterior;
      this.isInterior = true;

      if (enableTimeDebug) {
        console.log(`Map manually set to INTERIOR mode`);
      }

      // MUSH AUDIO ENGINE - Stop channel 4 BGS when switching to interior
      this.stopWeatherBgs();

      // Clear weather effects when switching to interior
      if (wasExterior) {
        this.clearWeather();
      }

      // Update temperature (in case it changed)
      this.updateTemperature();

      // Apply interior tinting (temperature only, no time effects)
      this.updateTimeOfDayTint();
    }

    // Add this method to Game_WeatherTimeSystem class
    toggleMapType() {
      if (this.isInterior) {
        this.setMapExterior();
      } else {
        this.setMapInterior();
      }
    }

    // Add this method to Game_WeatherTimeSystem class to get current status
    getMapTypeStatus() {
      return this.isInterior ? "Interior" : "Exterior";  // i18n-ignore  map note-tag values
    }

    updateTimeAndWeather() {
      this._generateDynamicTints(); // Generate tints based on current country/season

      const gameDate = getGameDateFromVariable();
      const newHour = gameDate.hours;

      this.dayOfYear = getGameDayOfYearFromVariable();
      this.seed = this.dayOfYear * 24 + newHour + this.getPlayerNameHash();

      // Also treat a mismatch between variable 23 and the actual hour as a "change",
      // $gameVariables defaults uninitialized numbers to 0, but currentHour starts at
      // 12 (matching the default 01 JAN 2001 12:00 game-start time). When the game
      // actually starts at noon, this.currentHour === newHour on the very first call,
      // so the block below never runs and variable 23 is left stuck at 0 ("midnight")
      // until the clock first ticks past whatever hour differs from 12, during which
      // every NPC reads hour 0 and gets scheduled to sleep on the starting map.
      const hourChanged = this.currentHour !== newHour || $gameVariables.value(23) !== newHour;
      if (hourChanged) {
        // Check for in-game time jumps of 4+ hours
        const currentMinutes = $gameVariables.value(114) || 0;
        const gameTimeDiff = Math.abs(
          currentMinutes - (this._lastWeatherChangeGameTime || 0)
        );

        if (gameTimeDiff >= 240) {
          if (enableTimeDebug) {
            console.log(
              `[Weather] In-game time jumped by ${Math.floor(
                gameTimeDiff / 60
              )} hours. Triggering weather change.`
            );
          }
          this.changeWeather(true);
        }

        const oldHour = this.currentHour;
        this.currentHour = newHour;

        if ($gameVariables) {
          $gameVariables.setValue(23, this.currentHour);
        }

        this.startTintTransition(newHour);

        // NEW BGS SYSTEM - Update BGS when hour changes (for day/night transitions)
        this.updateEnvironmentBgs();

        if (enableTimeDebug) {
          console.log(
            `Time synchronized to: ${this.currentHour
            }:00 (from Variable 113: ${$gameVariables.value(113)})`
          );
        }
      }

      this.updateTemperature();
    }

    getDayOfYear(date) {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date - start;
      const oneDay = 1000 * 60 * 60 * 24;
      return Math.floor(diff / oneDay);
    }

    getPlayerNameHash() {
      let historySeed = 19002001;
      if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
        historySeed = window.HistoryManager.getSeed();
      } else if ($gameSystem && $gameSystem._historySeed !== undefined) {
        historySeed = $gameSystem._historySeed;
      }
      return historySeed;
    }

    getSeason() {
      return getGameSeasonFromVariable();
    }

    // --- OmegaTower biome-driven climate -------------------------------------
    // Maps tagged <Country: OmegaTower> derive their weather (temperature,
    // precipitation, day/night length and screen tint) from the map's biome
    // instead of the country's seasons. Biome season tables live in
    // Biomes.json / AlienBiomes.json (both merged into window.WorldGen.Biomes).
    getCurrentBiomeName() {
      // Procedural world map (636) tracks the active biome on $gameSystem.
      if (
        $gameMap &&
        $gameMap.mapId() === 636 &&
        $gameSystem &&
        $gameSystem._procGenData &&
        $gameSystem._procGenData.currentBiome
      ) {
        return $gameSystem._procGenData.currentBiome;
      }
      // Static maps declare their biome with a <Biome: X> note tag.
      if ($dataMap && $dataMap.meta && $dataMap.meta.Biome) {
        return String($dataMap.meta.Biome).trim();
      }
      return null;
    }

    // Season table for the current biome, but only on OmegaTower maps.
    // Returns null (falling back to the country) everywhere else.
    getBiomeSeasons() {
      if (!this.currentCountry || this.currentCountry.country !== "OmegaTower") {
        return null;
      }
      const biomeName = this.getCurrentBiomeName();
      if (!biomeName) return null;
      const list = (window.WorldGen && window.WorldGen.Biomes) || [];
      const key = biomeName.toLowerCase();
      const biome = list.find((b) => b.name.toLowerCase() === key);
      if (biome && biome.seasons) {
        this._activeBiomeName = biome.name;
        return biome.seasons;
      }
      return null;
    }

    // The season table currently driving weather/tint: the map biome's on
    // OmegaTower maps, otherwise the current country's.
    getActiveSeasons() {
      const biomeSeasons = this.getBiomeSeasons();
      if (biomeSeasons) return biomeSeasons;
      this._activeBiomeName = null;
      return this.currentCountry.seasons;
    }

    // Cache key so the tint table rebuilds when the driving climate changes
    // (country <-> biome, or between biomes when crossing OmegaTower maps).
    getActiveClimateKey() {
      if (this._activeBiomeName) return "biome:" + this._activeBiomeName;
      return "country:" + this.currentCountry.id;
    }

    seededRandom() {
      this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
      return this.seed / 0x7fffffff;
    }

    changeWeather(force = false) {
      const now = Date.now();
      const currentMinutes = $gameVariables.value(114) || 0;

      // Skip determining NEW weather if stability timer is active and it's not a forced change (like a large time jump)
      if (
        !force &&
        this._weatherStabilityTimer &&
        now < this._weatherStabilityTimer
      ) {
        const gameTimeDiff = Math.abs(
          currentMinutes - (this._lastWeatherChangeGameTime || 0)
        );
        if (gameTimeDiff < 240) {
          if (enableTimeDebug) {
            console.log(
              `[Weather] Stability active. Restoring locked weather: ${this._lockedWeatherType}. (Real: ${Math.ceil(
                (this._weatherStabilityTimer - now) / 60000
              )}m left, Game: ${Math.ceil((240 - gameTimeDiff) / 60)}h left)`
            );
          }
          // IMPORTANT: Always call setWeather to ensure visuals are correct (e.g. after exiting interior)
          this.setWeather(this._lockedWeatherType || WeatherTypes.NONE);
          return;
        }
      }

      const gameDate = getGameDateFromVariable();
      this.dayOfYear = getGameDayOfYearFromVariable();
      this.currentHour = gameDate.hours;
      this.seed = this.dayOfYear * 24 + this.currentHour + this.getPlayerNameHash();

      const newWeather = this.determineWeather();
      this._lockedWeatherType = newWeather; // Lock the new choice
      this.setWeather(newWeather);

      // Set new stability duration (5-10 real-world minutes)
      const stabilityMinutes = 5 + this.seededRandom() * 5;
      this._weatherStabilityTimer = now + stabilityMinutes * 60 * 1000;
      this._lastWeatherChangeGameTime = currentMinutes;

      if (enableTimeDebug) {
        console.log(
          `[Weather] Weather set to: ${newWeather}. Stability active for ${stabilityMinutes.toFixed(
            1
          )} real minutes.`
        );
      }
    }

    determineWeather() {
      const season = this.getSeason().toLowerCase();
      const seasonData = this.getActiveSeasons()[season];
      if (!seasonData) {
        console.error(
          `No season data for ${season} in ${this._activeBiomeName || this.currentCountry.country}`
        );
        return WeatherTypes.NONE;
      }

      const { precipitation } = seasonData;
      const random = this.seededRandom() * 100;

      const precipChance = Math.min(70, precipitation * 10);

      if (random > precipChance) {
        return WeatherTypes.NONE;
      }

      if (this.currentTemperature <= 1) {
        return WeatherTypes.SNOW;
      } else {
        return this.seededRandom() < 0.25
          ? WeatherTypes.STORM
          : WeatherTypes.RAIN;
      }
    }

    updateTemperature() {
      const season = this.getSeason().toLowerCase();
      const seasonData = this.getActiveSeasons()[season];
      if (!seasonData) {
        console.error(
          `No season data for ${season} in ${this._activeBiomeName || this.currentCountry.country}`
        );
        return;
      }

      const { dayTemp, nightTemp, sunrise, sunset } = seasonData;

      const sunriseHour = this._parseTime(sunrise);
      const sunsetHour = this._parseTime(sunset);
      const gameDate = getGameDateFromVariable();
      const currentHourFloat = gameDate.hours + gameDate.minutes / 60;

      let baseTemperature;
      const peakTempHour = sunriseHour + (sunsetHour - sunriseHour) * 0.6;

      if (currentHourFloat >= sunriseHour && currentHourFloat <= sunsetHour) {
        // Daytime
        const sunriseTemp = (dayTemp + nightTemp) / 2;
        if (currentHourFloat <= peakTempHour) {
          const progress =
            (currentHourFloat - sunriseHour) / (peakTempHour - sunriseHour);
          baseTemperature =
            sunriseTemp +
            (dayTemp - sunriseTemp) * Math.sin((progress * Math.PI) / 2);
        } else {
          const sunsetTemp = sunriseTemp;
          const progress =
            (currentHourFloat - peakTempHour) / (sunsetHour - peakTempHour);
          baseTemperature =
            dayTemp +
            (sunsetTemp - dayTemp) * Math.sin((progress * Math.PI) / 2);
        }
      } else {
        // Nighttime
        const sunsetTemp = (dayTemp + nightTemp) / 2;
        let progress;
        if (currentHourFloat > sunsetHour) {
          progress =
            (currentHourFloat - sunsetHour) / (24 + sunriseHour - sunsetHour);
        } else {
          progress =
            (24 + currentHourFloat - sunsetHour) /
            (24 + sunriseHour - sunsetHour);
        }
        baseTemperature =
          sunsetTemp +
          (nightTemp - sunsetTemp) * Math.sin((progress * Math.PI) / 2);
      }

      let temperature = baseTemperature;
      temperature += WeatherTemperatureEffects[this.currentWeatherType] || 0;

      if (this.mapBaseTemperature !== null) {
        const timeVariation = baseTemperature - (dayTemp + nightTemp) / 2;
        const weatherEffect =
          WeatherTemperatureEffects[this.currentWeatherType] || 0;
        temperature = this.mapBaseTemperature + timeVariation + weatherEffect;
      }

      // NEW: If on procedural map 636, blend with biome temperature
      if ($gameMap && $gameMap.mapId() === 636 && $gameSystem._procGenData) {
        const procGenData = $gameSystem._procGenData;
        const biomeDayTemp = procGenData.biomeDayTemperature;
        const biomeNightTemp = procGenData.biomeNightTemperature;

        if (biomeDayTemp !== undefined && biomeNightTemp !== undefined) {
          // Calculate biome temperature based on current time
          let biomeTemperature;
          if (
            currentHourFloat >= sunriseHour &&
            currentHourFloat <= sunsetHour
          ) {
            // Daytime - use day temperature
            const progress =
              (currentHourFloat - sunriseHour) / (sunsetHour - sunriseHour);
            biomeTemperature =
              biomeNightTemp +
              (biomeDayTemp - biomeNightTemp) *
              Math.sin((progress * Math.PI) / 2);
          } else {
            // Nighttime - use night temperature
            let nightProgress;
            if (currentHourFloat > sunsetHour) {
              nightProgress =
                (currentHourFloat - sunsetHour) /
                (24 + sunriseHour - sunsetHour);
            } else {
              nightProgress =
                (24 + currentHourFloat - sunsetHour) /
                (24 + sunriseHour - sunsetHour);
            }
            biomeTemperature =
              (biomeDayTemp + biomeNightTemp) / 2 +
              (biomeNightTemp - (biomeDayTemp + biomeNightTemp) / 2) *
              Math.sin((nightProgress * Math.PI) / 2);
          }

          // Calculate median between country temperature and biome temperature
          const countryTemp = temperature;
          temperature = (countryTemp + biomeTemperature) / 2;

          if (enableTempDebug) {
            console.log(`[Map 636] Biome temperature blend:`);
            console.log(`- Country temp: ${countryTemp.toFixed(2)}°C`);
            console.log(`- Biome temp: ${biomeTemperature.toFixed(2)}°C`);
            console.log(`- Median temp: ${temperature.toFixed(2)}°C`);
          }
        }
      }

      const newTemperature = Math.round(temperature);

      if (this.currentTemperature !== newTemperature) {
        this.currentTemperature = newTemperature;
        if ($gameVariables)
          $gameVariables.setValue(61, this.currentTemperature);

        if (enableTempDebug) {
          console.log(`Temperature updated to: ${this.currentTemperature}°C`);
          console.log(`- Base calc: ${baseTemperature.toFixed(2)}°C`);
          console.log(`- Country: ${this.currentCountry.country}`);
          console.log(
            `- Weather: ${this.getWeatherName()} (${WeatherTemperatureEffects[this.currentWeatherType] || 0
            }°C)`
          );
        }
      }
    }

    getWeatherName() {
      return (
        Object.keys(WeatherTypes).find(
          (key) => WeatherTypes[key] === this.currentWeatherType
        ) || "Unknown"  // i18n-ignore  weather id
      );
    }

    startTintTransition(targetHour) {
      if (this.sunlightMode !== "full") return;
      this.targetTintIndex = targetHour;
      this.tintTransitionProgress = 0.0;
      if (enableTimeDebug) {
        console.log(
          `Starting tint transition from ${this.currentTintIndex} to ${this.targetTintIndex}`
        );
      }
    }

    _getTemperatureTintEffect() {
      const temp = this.currentTemperature;

      const COLD_THRESHOLD = 5;
      const EXTREME_COLD = -20;
      const HOT_THRESHOLD = 25;
      const EXTREME_HOT = 40;

      const EXTREME_COLD_TINT = [-20, 0, 50]; // r, g, b offsets for ice blue
      const EXTREME_HOT_TINT = [40, 20, -20]; // r, g, b offsets for red/orange
      const NEUTRAL_TINT = [0, 0, 0];

      let r = 0,
        g = 0,
        b = 0;

      if (temp < COLD_THRESHOLD) {
        const progress =
          (COLD_THRESHOLD - temp) / (COLD_THRESHOLD - EXTREME_COLD);
        const clampedProgress = Math.max(0, Math.min(1, progress));
        r =
          NEUTRAL_TINT[0] +
          (EXTREME_COLD_TINT[0] - NEUTRAL_TINT[0]) * clampedProgress;
        g =
          NEUTRAL_TINT[1] +
          (EXTREME_COLD_TINT[1] - NEUTRAL_TINT[1]) * clampedProgress;
        b =
          NEUTRAL_TINT[2] +
          (EXTREME_COLD_TINT[2] - NEUTRAL_TINT[2]) * clampedProgress;
      } else if (temp > HOT_THRESHOLD) {
        const progress = (temp - HOT_THRESHOLD) / (EXTREME_HOT - HOT_THRESHOLD);
        const clampedProgress = Math.max(0, Math.min(1, progress));
        r =
          NEUTRAL_TINT[0] +
          (EXTREME_HOT_TINT[0] - NEUTRAL_TINT[0]) * clampedProgress;
        g =
          NEUTRAL_TINT[1] +
          (EXTREME_HOT_TINT[1] - NEUTRAL_TINT[1]) * clampedProgress;
        b =
          NEUTRAL_TINT[2] +
          (EXTREME_HOT_TINT[2] - NEUTRAL_TINT[2]) * clampedProgress;
      }

      return [Math.round(r), Math.round(g), Math.round(b)];
    }

    // What o'clock it is in the sky, which is only the same thing as what
    // o'clock it is on the clock while the party is on Earth. Returns Earth's
    // own hour whenever there is no alien world under their feet, so nothing
    // about the ordinary game changes.
    _skyHourFloat(gameDate) {
      const earthHour = gameDate.hours + gameDate.minutes / 60;
      const GS = window.GalaxySim;
      if (!GS || !GS.getSurfacePlanet || !GS.localHourFor) return earthHour;
      const lp = GS.getSurfacePlanet();
      if (!lp || !lp.day) return earthHour;
      // Elapsed Earth minutes, not the hour of the day: a world whose day is not
      // a whole number of Earth hours has to be counted from the start of time,
      // or its dawn would jump every midnight.
      // Variable 114 counts game minutes from an epoch of 10:00, and the 3D
      // world reads it the same way with the same 600 added: the two skies have
      // to agree about what time it is over the same planet.
      const total = ((typeof $gameVariables !== "undefined" && $gameVariables)
        ? $gameVariables.value(114) : 0) + 600;
      const local = GS.localHourFor(lp, total);
      return (local == null) ? earthHour : local;
    }

    // --- MODIFICATION START ---
    // Modified function to handle interior and exterior tinting rules
    updateTimeOfDayTint(force = false) {
      let timeOffsetR = 0,
        timeOffsetG = 0,
        timeOffsetB = 0;

      // Forced lighting overrides: Dark = midnight (hour 0), Light = midday (hour 12)
      if (this.forcedLighting === 'dark') {
        const [timeTintR, timeTintG, timeTintB] = this.getTintForTimeFloat(0);
        timeOffsetR = timeTintR - 255;
        timeOffsetG = timeTintG - 255;
        timeOffsetB = timeTintB - 255;
      } else if (this.forcedLighting === 'light') {
        const [timeTintR, timeTintG, timeTintB] = this.getTintForTimeFloat(12);
        timeOffsetR = timeTintR - 255;
        timeOffsetG = timeTintG - 255;
        timeOffsetB = timeTintB - 255;
      } else if (!this.isInterior) {
        // Apply time-of-day tint ONLY for exteriors (always using full cycle mode)
        // Smooth tint transition based on current hour and minutes
        const gameDate = getGameDateFromVariable();
        // The hour the SKY is at. On Earth that is simply the hour on the clock.
        // On another world it is that world's own rotation instead: a planet
        // with a six hour day runs through four dawns while an Earth day passes,
        // and one that is tidally locked to its star never moves off the single
        // hour its landing longitude put it at - permanent noon on the near
        // side, permanent midnight on the far side, an unfinishing sunset on the
        // terminator between them. The CLOCK itself is not touched by any of
        // this: TimeDateSystem stays on Earth hours everywhere, for hunger,
        // sleep, the calendar and every schedule in the game. This reads it.
        const currentHourFloat = this._skyHourFloat(gameDate);

        // Get tint for current hour (with smooth interpolation within the hour)
        const [timeTintR, timeTintG, timeTintB] =
          this.getTintForTimeFloat(currentHourFloat);
        timeOffsetR = timeTintR - 255;
        timeOffsetG = timeTintG - 255;
        timeOffsetB = timeTintB - 255;
      }

      // Get the temperature-based tint offset for BOTH interiors and exteriors
      const [tempOffsetR, tempOffsetG, tempOffsetB] =
        this._getTemperatureTintEffect();

      // Combine the offsets
      let finalOffsetR = timeOffsetR + tempOffsetR;
      let finalOffsetG = timeOffsetG + tempOffsetG;
      let finalOffsetB = timeOffsetB + tempOffsetB;

      // On an alien planet surface (map 636), bias the day/time tint toward that
      // world's palette so its daylight reads with the planet's own colour.
      if (typeof window.GalaxySim !== 'undefined' && window.GalaxySim.getSurfacePlanet) {
        const lp = window.GalaxySim.getSurfacePlanet();
        if (lp && lp.tintOffset) {
          finalOffsetR += lp.tintOffset[0];
          finalOffsetG += lp.tintOffset[1];
          finalOffsetB += lp.tintOffset[2];
        }
      }

      // Clamp the final values to ensure they are within the valid range for startTint
      finalOffsetR = Math.max(-255, Math.min(255, finalOffsetR));
      finalOffsetG = Math.max(-255, Math.min(255, finalOffsetG));
      finalOffsetB = Math.max(-255, Math.min(255, finalOffsetB));

      // Skip the tint reassignment (and tone array allocation) when nothing
      // changed. Guards forced-call paths and any redundant invocation.
      // A forced call (map entry / load) bypasses the guard so the correct
      // day/night tint is asserted on the freshly created/restored $gameScreen
      // even when the computed offsets match the cached values.
      if (
        !force &&
        this._lastTintR === finalOffsetR &&
        this._lastTintG === finalOffsetG &&
        this._lastTintB === finalOffsetB
      ) {
        return;
      }
      this._lastTintR = finalOffsetR;
      this._lastTintG = finalOffsetG;
      this._lastTintB = finalOffsetB;

      $gameScreen.startTint([finalOffsetR, finalOffsetG, finalOffsetB, 0], 0);
    }

    // New method for smooth hourly tint interpolation
    getTintForTimeFloat(hourFloat) {
      if (this.dynamicTints.length !== 24) return [255, 255, 255]; // Failsafe

      const currentHour = Math.floor(hourFloat);
      const nextHour = (currentHour + 1) % 24;
      const progress = hourFloat - currentHour;

      // Day time from 10 to 17 should use normal colors with no tint
      if (hourFloat >= 10 && hourFloat < 18) {
        return [255, 255, 255];
      }

      // Hour 9 should end the fading (transition to normal at 10)
      if (currentHour === 9) {
        const currentTint = this.dynamicTints[9];
        const nextTint = [255, 255, 255]; // Normal color
        return this._interpolateColor(currentTint, nextTint, progress);
      }

      // Hour 18 should start the fading (transition from normal at 18 to night at 19)
      if (currentHour === 18) {
        const currentTint = [255, 255, 255]; // Normal color
        const nextTint = this.dynamicTints[19];
        return this._interpolateColor(currentTint, nextTint, progress);
      }

      // Default behavior for other hours
      const currentTint = this.dynamicTints[currentHour];
      const nextTint = this.dynamicTints[nextHour];

      return this._interpolateColor(currentTint, nextTint, progress);
    }
    // --- MODIFICATION END ---

    clearTimeOfDayTint() {
      $gameScreen.startTint([0, 0, 0, 0], 30);
    }

    parseMapTags() {
      if (!$dataMap || !$dataMap.meta) return;

      this.mapBaseTemperature = null;
      if ($dataMap.meta.BaseTemp !== undefined) {
        const baseTemp = parseInt($dataMap.meta.BaseTemp);
        if (!isNaN(baseTemp)) {
          this.mapBaseTemperature = baseTemp;
        }
      }

      this.mapForcedWeather = null;
      if ($dataMap.meta.ForceWeather !== undefined) {
        const weatherStr = $dataMap.meta.ForceWeather.toLowerCase();
        if (Object.values(WeatherTypes).includes(weatherStr)) {
          this.mapForcedWeather = weatherStr;
        }
      }

      // Parse Night tag for custom night ambience
      this.mapCustomNightSound = null;
      if ($dataMap.meta.Night !== undefined) {
        const nightSound = $dataMap.meta.Night.trim();
        if (nightSound.length > 0) {
          this.mapCustomNightSound = nightSound;
          if (enableTimeDebug) {
            console.log(`[Map Tag] Custom night sound set to: ${nightSound}`);
          }
        }
      }

      // Parse Country tag (only when NOT on world map 315)
      if ($gameMap.mapId() !== 315 && $dataMap.meta.Country !== undefined) {
        const countryName = $dataMap.meta.Country.trim();
        const matchedCountry = Countries.find(
          (c) => c.country.toLowerCase() === countryName.toLowerCase()
        );

        if (matchedCountry) {
          this.setCurrentCountry(matchedCountry.id);
          if (enableTimeDebug) {
            console.log(
              `[Map Tag] Country set to: ${matchedCountry.country} (ID: ${matchedCountry.id})`
            );
          }
        } else {
          console.warn(
            `[Map Tag] Country "${countryName}" not found in Countries data`
          );
        }
      }
    }

    // --- MODIFICATION START ---
    // Modified function to handle tinting correctly on map load
    checkMapTags(isNewMap = true) {
      if (!$dataMap || !$dataMap.meta) return;

      const wasInterior = this.isInterior;
      const hasInteriorTag = !!$dataMap.meta.Interior;
      const hasExteriorTag = !!$dataMap.meta.Exterior;
      const hasCoveredTag = !!$dataMap.meta.Covered; // NEW: Check for Covered tag
      const hasDarkTag = !!$dataMap.meta.Dark;
      const hasLightTag = !!$dataMap.meta.Light;

      // Set forced lighting override based on Dark/Light tags
      if (hasDarkTag) {
        this.forcedLighting = 'dark';
      } else if (hasLightTag) {
        this.forcedLighting = 'light';
      } else {
        this.forcedLighting = null;
      }

      // Procedural map 636 carries an <Exterior> tag, but the biome decides:
      // caves, dungeons, crypts, sewers, cellars and temple interiors are
      // roofed over, as is every layer below the surface. The generator owns
      // that test (window.isProceduralInteriorMap); fall back to the plain
      // depth check if it has not loaded.
      const isUnderground =
        typeof window.isProceduralInteriorMap === "function"
          ? window.isProceduralInteriorMap()
          : $gameMap.mapId() === 636 &&
            $gameSystem._procGenData &&
            $gameSystem._procGenData.biomeLayerStack &&
            $gameSystem._procGenData.biomeLayerStack.length > 0;

      // Modified logic: Interior if has Interior tag, OR if it's covered, OR if underground on map 636, OR if no tags at all
      this.isInterior =
        hasInteriorTag ||
        hasCoveredTag ||
        isUnderground ||
        (!hasInteriorTag && !hasExteriorTag);

      this.parseMapTags();
      // NEW: Special handling for covered maps - treat them like interiors but with different messaging
      if (this.isInterior) {
        // MUSH AUDIO ENGINE - Stop channel 4 BGS when entering interior
        this.stopWeatherBgs();

        // PUDDLE SYSTEM - Clear puddles when entering interior
        this.clearPuddles();

        this.clearWeather();
        this.updateTemperature();
        this.updateTimeOfDayTint(); // Apply temperature tint only

        // NEW: Different debug messages for covered vs interior
        if (enableTimeDebug) {
          if (isUnderground) {
            console.log(
              "Map loaded: UNDERGROUND CAVE (weather/light/BGS disabled)"
            );
          } else if (hasCoveredTag) {
            console.log("Map loaded: COVERED (weather/light/BGS disabled)");
          } else if (hasInteriorTag) {
            console.log("Map loaded: INTERIOR (channel 4 BGS disabled)");
          } else {
            console.log("Map loaded: DEFAULT INTERIOR (no tags, channel 4 BGS disabled)");
          }
        }
      } else if (hasExteriorTag) {
        this.updateTimeAndWeather();

        if (wasInterior) {
          this.currentTintIndex = this.currentHour;
          this.targetTintIndex = this.currentHour;
          this.tintTransitionProgress = 1.0;
        }

        this.updateTimeOfDayTint();

        if (this.mapForcedWeather !== null) {
          this.setWeather(this.mapForcedWeather);
        } else if (isNewMap && this.seededRandom() * 100 < weatherChangeChance) {
          this.changeWeather();
        } else {
          this.setWeather(this._lockedWeatherType || this.currentWeatherType); // re-apply current or locked weather
        }

        // MUSH AUDIO ENGINE - Trigger BGS update when entering exterior map
        this.updateEnvironmentBgs();

        // PUDDLE SYSTEM - Spawn puddles if it's already raining
        if (
          this.currentWeatherType === WeatherTypes.RAIN ||
          this.currentWeatherType === WeatherTypes.STORM
        ) {
          this.spawnPuddles(INITIAL_PUDDLE_COUNT);
          this._lastPuddleSpawnTime = Date.now();
        }

        if (enableTimeDebug) {
          console.log("Map loaded: EXTERIOR (weather/light/channel 4 BGS enabled)");
        }
      }
    }

    // --- MODIFICATION END ---

    forceRandomChange() {
      const types = Object.values(WeatherTypes);
      const newWeather = types[Math.floor(this.seededRandom() * types.length)];
      this._lockedWeatherType = newWeather; // Lock the manually forced weather
      this.setWeather(newWeather);

      // Reset stability timers when manually forcing weather
      this._weatherStabilityTimer = Date.now() + (5 + this.seededRandom() * 5) * 60000;
      this._lastWeatherChangeGameTime = $gameVariables.value(114) || 0;
    }

    forceTimeUpdate() {
      this.updateTimeAndWeather();
      this.updateTimeOfDayTint();
    }

    // On the world map (315) the country - and therefore the day/night tint - is
    // derived from the region tile the player stands on. Called both per-frame and
    // on map load so the correct lighting shows immediately on entry rather than
    // only after the player takes a step.
    checkWorldMapCountry() {
      if ($gameMap && typeof $gameMap.mapId === 'function' && $gameMap.mapId() === 315 && $gamePlayer && typeof $gamePlayer.regionId === 'function') {
        const regionId = $gamePlayer.regionId();

        if (regionId > 0 && regionId !== this._lastCheckedRegionId) {
          this._lastCheckedRegionId = regionId;

          const countryData = Countries.find((c) => c.id === regionId);

          if (countryData) {
            console.log(
              `[WeatherSystem] World Map: Player entered region of ${countryData.country}.`
            );

            this.setCurrentCountry(regionId);
            this.changeWeather();
          }
        }
      } else if (this._lastCheckedRegionId !== -1) {
        this._lastCheckedRegionId = -1;
      }
    }

    // MUSH AUDIO ENGINE BGS SYSTEM - Channel 4 for weather/environment BGS
    // This ensures weather BGS doesn't override map BGS

    // Play random rain BGS on channel 4
    playRandomRainBgs() {
      if (!this.isExterior()) return;

      // Check if a rain BGS is already playing on channel 4
      const currentBgs = AudioManager.getBgsFromChannel(4);
      if (currentBgs && currentBgs.name && currentBgs.name.startsWith('rain')) {
        // Already playing a rain sound, don't change it - but do keep it at the
        // level the player has chosen, in case the slider moved meanwhile.
        refreshWeatherBgsVolume();
        return;
      }

      const rainSounds = ['rain-calming', 'rain-calming2', 'rain-gentle', 'rain-light', 'rain-liquid', 'rain-shower',
        'rain-steady-loop', 'rain-soft-loop', 'rain-patter-loop', 'rain-heavy-long'];
      const randomRain = rainSounds[Math.floor(Math.random() * rainSounds.length)];

      const bgsSetting = {
        name: randomRain,
        volume: duckedBgsVolume(),
        pitch: 100,
        pan: 0
      };

      // Play on channel 4, don't auto-remove, pause during battle
      AudioManager.playMushBgs(bgsSetting, 4, false, 'Pause');

      if (enableTimeDebug) {
        console.log(`[MUSH Audio] Playing rain BGS on channel 4: ${randomRain}`);
      }
    }

    // Play random night BGS on channel 4
    playRandomNightBgs() {
      if (!this.isExterior()) return;

      // Don't play night BGS if it's raining (rain has priority)
      if (this.currentWeatherType === WeatherTypes.RAIN ||
        this.currentWeatherType === WeatherTypes.STORM) {
        return;
      }

      // Determine which night sound to play
      let nightSound;

      if (this.mapCustomNightSound !== null) {
        // Use custom night sound for this map
        nightSound = this.mapCustomNightSound;

        // Check if this exact custom sound is already playing
        const currentBgs = AudioManager.getBgsFromChannel(4);
        if (currentBgs && currentBgs.name === nightSound) {
          // Already playing the correct custom sound, don't restart it
          refreshWeatherBgsVolume();
          return;
        }
      } else {
        // Use random night sound from default array
        // Check if a night BGS is already playing on channel 4
        const currentBgs = AudioManager.getBgsFromChannel(4);
        if (currentBgs && currentBgs.name &&
          (currentBgs.name.includes('night') || currentBgs.name.includes('cricket'))) {
          // Already playing a night sound, don't change it
          refreshWeatherBgsVolume();
          return;
        }

        const nightSounds = ['night-ambience', 'night-ambience2', 'night-ambience3', 'night-cricket3', 'night-crickets'];
        nightSound = nightSounds[Math.floor(Math.random() * nightSounds.length)];
      }

      const bgsSetting = {
        name: nightSound,
        volume: duckedBgsVolume(),
        pitch: 100,
        pan: 0
      };

      // Play on channel 4, don't auto-remove, pause during battle
      AudioManager.playMushBgs(bgsSetting, 4, false, 'Pause');

      if (enableTimeDebug) {
        console.log(`[MUSH Audio] Playing night BGS on channel 4: ${nightSound}${this.mapCustomNightSound ? ' (custom)' : ''}`);
      }
    }

    // Check if current time is night
    isNightTime() {
      const season = this.getSeason().toLowerCase();
      const seasonData = this.getActiveSeasons()[season];
      if (!seasonData) return false;

      const sunsetHour = this._parseTime(seasonData.sunset);
      const sunriseHour = this._parseTime(seasonData.sunrise);

      // Night is after sunset or before sunrise
      if (sunsetHour < sunriseHour) {
        // Normal case (sunset before midnight, sunrise after midnight)
        return this.currentHour >= sunsetHour || this.currentHour < sunriseHour;
      } else {
        // Edge case (polar regions)
        return this.currentHour >= sunsetHour && this.currentHour < sunriseHour;
      }
    }

    // Check if map is exterior
    isExterior() {
      return !this.isInterior;
    }

    // Update BGS based on weather and time (using MUSH Audio Engine channel 4)
    updateEnvironmentBgs() {
      if (!this.isExterior()) {
        // Stop channel 4 BGS when entering interior
        this.stopWeatherBgs();
        return;
      }

      // Priority 1: Rain BGS
      if (this.currentWeatherType === WeatherTypes.RAIN ||
        this.currentWeatherType === WeatherTypes.STORM) {
        this.playRandomRainBgs();
        return;
      }

      // Priority 2: Night BGS
      if (this.isNightTime()) {
        this.playRandomNightBgs();
        return;
      }

      // No special BGS needed, stop channel 4
      this.stopWeatherBgs();
    }

    // Stop weather BGS on channel 4
    stopWeatherBgs() {
      // Don't stop rain BGS if player is in any vehicle
      if ($gamePlayer && typeof $gamePlayer.isInVehicle === 'function' && $gamePlayer.isInVehicle() && $gamePlayer.vehicle() && typeof $gamePlayer.vehicle().isShip === 'function' && $gamePlayer.vehicle().isShip()) {
        if (enableTimeDebug) {
          console.log("[MUSH Audio] Weather BGS kept playing - player in vehicle");
        }
        return;
      }

      // Stop BGS on channel 4 (MUSH Audio Engine)
      if (AudioManager.getBgsFromChannel && AudioManager.getBgsFromChannel(4)) {
        AudioManager.stopMushBgs(4);
        if (enableTimeDebug) {
          console.log("[MUSH Audio] Weather BGS stopped on channel 4");
        }
      }
    }

    // Legacy method for compatibility (now redirects to MUSH system)
    stopRainBgs() {
      this.stopWeatherBgs();
    }
    setWeather(weatherType) {
      if (this.isInterior) return;

      const oldWeather = this.currentWeatherType;
      this.currentWeatherType = weatherType;

      // Update window.weatherName whenever weather changes
      window.weatherName = this.getWeatherDisplayName();

      switch (weatherType) {
        case WeatherTypes.NONE:
          $gameScreen.changeWeather("none", 0, 60);
          break;
        case WeatherTypes.RAIN:
          $gameScreen.changeWeather("rain", 7, 60);
          break;
        case WeatherTypes.STORM:
          $gameScreen.changeWeather("storm", 9, 60);
          break;
        case WeatherTypes.SNOW:
          $gameScreen.changeWeather("snow", 5, 60);
          break;
      }

      // NEW BGS SYSTEM - Update BGS when weather changes
      this.updateEnvironmentBgs();

      // PUDDLE SYSTEM - Spawn puddles when rain starts, clear when it stops
      if (weatherType === WeatherTypes.RAIN || weatherType === WeatherTypes.STORM) {
        if (oldWeather !== WeatherTypes.RAIN && oldWeather !== WeatherTypes.STORM) {
          // Rain just started - spawn initial puddles
          this.spawnPuddles(INITIAL_PUDDLE_COUNT);
          this._lastPuddleSpawnTime = Date.now();
        }
      } else {
        // Weather cleared - remove all puddles
        this.clearPuddles();
      }

      if (oldWeather !== weatherType) {
        this.updateTemperature();
      }
    }

    // Modify the clearWeather method
    clearWeather() {
      this.currentWeatherType = WeatherTypes.NONE;
      window.weatherName = this.getWeatherDisplayName(); // Add this line
      $gameScreen.changeWeather("Clear", 0, 0);  // i18n-ignore  RPG Maker weather id

      // NEW BGS SYSTEM - Update BGS when clearing weather (might trigger night BGS)
      this.updateEnvironmentBgs();

      // PUDDLE SYSTEM - Clear puddles when weather clears
      this.clearPuddles();

      this.clearCustomWeather();
    }

    update() {
      // Periodic update of time and weather (handles hour changes and time jumps).
      // The tint and temperature only change at in-game-minute granularity (the
      // sub-hour tint interpolation is driven by gameDate.minutes), so there is no
      // visual benefit to recomputing them every frame. Gating both behind the
      // minute change turns a ~60x/sec workload into ~1x/in-game-minute.
      const gameDate = getGameDateFromVariable();
      if (this._lastUpdateMinute !== gameDate.minutes) {
        this._lastUpdateMinute = gameDate.minutes;
        this.updateTimeAndWeather();
        this.updateTimeOfDayTint();
      } else if (this._tintReassertFrames > 0) {
        // For a few frames after entering/loading a map, force the day/night
        // tint back onto the screen even if the in-game minute has not changed.
        // $gameScreen is freshly (re)created on map entry and its tone can be
        // clobbered/uninitialised on the first frame; without this the value
        // guard in updateTimeOfDayTint would suppress the reassert until the
        // clock next ticks (i.e. only after the player takes a step).
        this._tintReassertFrames--;
        this.updateTimeOfDayTint(true);
      }

      // --- Automatically set country on world map ---
      this.checkWorldMapCountry();

      // PUDDLE SYSTEM - Gradually spawn more puddles over time during rain
      if (
        !this.isInterior &&
        (this.currentWeatherType === WeatherTypes.RAIN ||
          this.currentWeatherType === WeatherTypes.STORM)
      ) {
        const currentTime = Date.now();

        // Initialize spawn timer if not set
        if (!this._lastPuddleSpawnTime) {
          this._lastPuddleSpawnTime = currentTime;
        }

        // Spawn 1 puddle every PUDDLE_SPAWN_INTERVAL (10 seconds)
        if (currentTime - this._lastPuddleSpawnTime >= PUDDLE_SPAWN_INTERVAL) {
          const currentPuddleCount = $gameSystem._weatherPuddles
            ? $gameSystem._weatherPuddles.length
            : 0;

          if (currentPuddleCount < MAX_PUDDLES) {
            this.spawnPuddles(1);
          }

          this._lastPuddleSpawnTime = currentTime;
        }
      }
    }

    setCustomWeather(type, intensity, duration) {
      if (this.isInterior) return;

      this.customWeatherType = type;
      this.customWeatherIntensity = intensity;

      $gameScreen.changeWeather("none", 0, 30);

      if (SceneManager._scene && SceneManager._scene._spriteset) {
        SceneManager._scene._spriteset.setCustomWeather(
          type,
          intensity,
          duration
        );
      }
    }

    clearCustomWeather() {
      this.customWeatherType = null;
      this.customWeatherIntensity = 0;

      if (SceneManager._scene && SceneManager._scene._spriteset) {
        SceneManager._scene._spriteset.clearCustomWeather();
      }
    }

    // ============================================================================
    // PUDDLE SYSTEM METHODS
    // ============================================================================

    /**
     * Spawn puddles on the current map
     * @param {number} count - Number of puddles to spawn
     */
    spawnPuddles(count = 5) {
      if (this.isInterior) return;
      if (!$gameMap || !$dataMap) return;

      // Only spawn during rain/storm
      if (
        this.currentWeatherType !== WeatherTypes.RAIN &&
        this.currentWeatherType !== WeatherTypes.STORM
      ) {
        return;
      }

      // Initialize puddle tracking
      if (!$gameSystem._weatherPuddles) {
        $gameSystem._weatherPuddles = [];
      }

      // Check if we've hit the max puddle limit
      const currentPuddleCount = $gameSystem._weatherPuddles.length;
      if (currentPuddleCount >= MAX_PUDDLES) {
        return;
      }

      // Load puddle template
      const puddleTemplate = loadPuddleTemplate();
      if (!puddleTemplate) {
        console.warn("[Weather] Puddle template not found on map 574");
        return;
      }

      // Find valid spawn tiles
      const validTiles = findPassableTilesForPuddles();
      if (validTiles.length === 0) {
        if (enableTimeDebug) {
          console.log("[Weather] No valid tiles for puddle spawning");
        }
        return;
      }

      // Adjust count to not exceed max puddles
      const actualCount = Math.min(
        count,
        MAX_PUDDLES - currentPuddleCount,
        validTiles.length
      );

      // Spawn puddles
      let spawnedCount = 0;
      for (let i = 0; i < validTiles.length && spawnedCount < actualCount; i++) {
        const tile = validTiles[i];

        // Check if there's already a puddle nearby (avoid clustering)
        const hasPuddleNearby = $gameSystem._weatherPuddles.some((eventId) => {
          const puddleEvent = $gameMap._events[eventId];
          if (!puddleEvent) return false;
          const dx = Math.abs(puddleEvent.x - tile.x);
          const dy = Math.abs(puddleEvent.y - tile.y);
          return dx <= 2 && dy <= 2; // 2-tile minimum spacing
        });

        if (hasPuddleNearby) continue;

        const puddleEventId = createPuddleEvent(puddleTemplate, tile.x, tile.y);
        if (puddleEventId !== null) {
          $gameSystem._weatherPuddles.push(puddleEventId);
          spawnedCount++;
        }
      }

      if (enableTimeDebug && spawnedCount > 0) {
        console.log(
          `[Weather] Spawned ${spawnedCount} puddles (total: ${$gameSystem._weatherPuddles.length}/${MAX_PUDDLES})`
        );
      }
    }

    /**
     * Clear all puddles from the current map
     */
    clearPuddles() {
      if (!$gameSystem._weatherPuddles || $gameSystem._weatherPuddles.length === 0) {
        return;
      }

      const puddleCount = $gameSystem._weatherPuddles.length;

      for (const eventId of $gameSystem._weatherPuddles) {
        const ev = $gameMap && $gameMap._events && $gameMap._events[eventId];
        // Only erase and remove if it's actually a puddle event we created
        if (ev && ev._isWeatherPuddle) {
          ev.erase();
          delete $gameMap._events[eventId];

          // Also remove from data map since it was dynamically added
          if ($dataMap && $dataMap.events && $dataMap.events[eventId]) {
            delete $dataMap.events[eventId];
          }
        }
      }

      // Clear tracking array
      $gameSystem._weatherPuddles = [];

      // Reset spawn timer
      this._lastPuddleSpawnTime = 0;

      // Invalidate tile cache so next rain recalculates from scratch
      invalidatePuddleTileCache();

      // Take the puddle sprites off the map one by one. This used to rebuild the
      // whole character spriteset instead, and Spriteset_Map.createCharacters
      // only ever ADDS: every sprite the previous build made stayed in the
      // tilemap, so each pass (this runs on every battle or menu return that
      // rained) left another full copy of every event, player and follower
      // standing on the map, each copy carrying its own enemy level plate.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      const sprites = spriteset && spriteset._characterSprites;
      if (sprites) {
        for (let i = sprites.length - 1; i >= 0; i--) {
          const sprite = sprites[i];
          const ch = sprite && sprite._character;
          if (!ch || !ch._isWeatherPuddle) continue;
          if (sprite.removeEnemyLevelLabel) sprite.removeEnemyLevelLabel();
          if (sprite.parent) sprite.parent.removeChild(sprite);
          sprites.splice(i, 1);
        }
      }

      if (enableTimeDebug && puddleCount > 0) {
        console.log(`[Weather] Cleared ${puddleCount} puddles`);
      }
    }
  }

  window.$gameWeather = null;

  const _DataManager_createGameObjects = DataManager.createGameObjects;
  DataManager.createGameObjects = function () {
    _DataManager_createGameObjects.call(this);
    $gameWeather = new Game_WeatherTimeSystem();
    // PUDDLE SYSTEM - Initialize puddle tracking
    if ($gameSystem) {
      $gameSystem._weatherPuddles = [];
    }
  };

  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);
    contents.weather = $gameWeather;
    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    if (contents.weather) {
      // Create a new instance with proper prototype
      $gameWeather = new Game_WeatherTimeSystem();

      // Copy saved properties to the new instance
      Object.assign($gameWeather, contents.weather);

      // Ensure critical properties are initialized
      if (!$gameWeather.currentCountry)
        $gameWeather.currentCountry = defaultCountry;
      if ($gameWeather._lastCheckedRegionId === undefined)
        $gameWeather._lastCheckedRegionId = -1;
      if ($gameWeather._lastPuddleSpawnTime === undefined)
        $gameWeather._lastPuddleSpawnTime = 0;
      if ($gameWeather._weatherStabilityTimer === undefined)
        $gameWeather._weatherStabilityTimer = 0;
      if ($gameWeather._lastWeatherChangeGameTime === undefined)
        $gameWeather._lastWeatherChangeGameTime = 0;
      if ($gameWeather._lockedWeatherType === undefined)
        $gameWeather._lockedWeatherType = $gameWeather.currentWeatherType || WeatherTypes.NONE;

      // Regenerate dynamic tints with the proper method
      $gameWeather.dynamicTints = [];
      $gameWeather._generateDynamicTints();

      // PUDDLE SYSTEM - Clear puddles on load (they will respawn if needed).
      // The restored $gameMap._events may contain dynamically-added puddle
      // Game_Events, but $dataMap is loaded fresh from the map file and has no
      // matching entries, so their event() lookups would be undefined. Strip the
      // live puddle events out here to keep the loaded map save-safe.
      if ($gameMap && $gameMap._events) {
        for (const key of Object.keys($gameMap._events)) {
          const ev = $gameMap._events[key];
          if (ev && ev._isWeatherPuddle) {
            delete $gameMap._events[key];
          }
        }
      }
      if ($gameSystem && $gameSystem._weatherPuddles) {
        $gameSystem._weatherPuddles = [];
      }
    } else {
      $gameWeather = new Game_WeatherTimeSystem();
    }
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    if ($gameWeather) {
      // If it's a transfer, just empty the array - old map's dynamic events are already gone.
      // If it's not a transfer (menu/battle return), clearPuddles handles safe removal.
      if (this._transfer) {
        $gameSystem._weatherPuddles = [];
      } else {
        $gameWeather.clearPuddles();
      }
      $gameWeather.updateTimeAndWeather();
      // Only allow random weather re-roll on genuine map transfers
      $gameWeather.checkMapTags(!!this._transfer);
      // On the world map resolve the country from the player's region and apply its
      // day/night tint right away. checkMapTags above tinted using the previous
      // country; force a fresh resolution so the correct lighting is visible on the
      // very first frame instead of after a step.
      if ($gameMap.mapId() === 315) {
        $gameWeather._lastCheckedRegionId = -1;
        $gameWeather.checkWorldMapCountry();
      }
      // Force the day/night tint back onto the fresh screen immediately, and
      // keep reasserting it for a short window so the correct lighting shows on
      // load/entry instead of only after the first step.
      $gameWeather._tintReassertFrames = 12;
      $gameWeather.updateTimeOfDayTint(true);
    }
  };

  // Save weather + puddle positions when leaving Scene_Map (menu open, battle, etc.)
  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    _Scene_Map_terminate.call(this);
    if ($gameWeather && $gameSystem) {
      const wt = $gameWeather.currentWeatherType;
      if (wt === WeatherTypes.RAIN || wt === WeatherTypes.STORM) {
        // Record puddle positions so we can restore them on resume
        const puddles = ($gameSystem._weatherPuddles || []).map((id) => {
          const ev = $gameMap && $gameMap._events && $gameMap._events[id];
          return ev ? { x: ev.x, y: ev.y } : null;
        }).filter(Boolean);
        _weatherBackup = { weatherType: wt, puddles };
        if (enableTimeDebug) {
          console.log(`[Weather] Saved backup: ${wt}, ${puddles.length} puddles`);
        }
      } else {
        _weatherBackup = null;
      }
    }
  };

  // Restore rain + puddles when Scene_Map resumes without a map transfer
  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _Scene_Map_start.call(this);
    // The screen tint is cleared on battle entry; battle return resumes Scene_Map
    // without an onMapLoaded transfer. Invalidate the cached tint and reassert it
    // so the skip-if-unchanged guard in updateTimeOfDayTint doesn't leave the
    // screen untinted after a battle / menu.
    if ($gameWeather) {
      $gameWeather._lastTintR = NaN;
      $gameWeather._lastUpdateMinute = undefined;
      $gameWeather._tintReassertFrames = 12;
      $gameWeather.updateTimeOfDayTint(true);
    }
    if (!this._transfer && _weatherBackup && $gameWeather) {
      const backup = _weatherBackup;
      _weatherBackup = null;

      const wt = backup.weatherType;
      const power = wt === WeatherTypes.STORM ? 9 : 7;
      const screenType = wt === WeatherTypes.STORM ? "storm" : "rain";

      // Re-apply weather visuals immediately (duration 0 = no fade)
      $gameScreen.changeWeather(screenType, power, 0);
      $gameWeather.currentWeatherType = wt;
      $gameWeather.isInterior = false;

      // Restart the weather BGS on channel 4
      $gameWeather.updateEnvironmentBgs();

      // Restore puddles at their exact saved positions
      const template = loadPuddleTemplate();
      if (template && backup.puddles.length > 0) {
        if (!$gameSystem._weatherPuddles) $gameSystem._weatherPuddles = [];
        for (const pos of backup.puddles) {
          const id = createPuddleEvent(template, pos.x, pos.y);
          if (id !== null) $gameSystem._weatherPuddles.push(id);
        }
        if (enableTimeDebug) {
          console.log(`[Weather] Restored ${backup.puddles.length} puddles after menu`);
        }
      }
    }
  };

  // Update the Scene_Map integration to use the new window
  const _Scene_Map_createDisplayObjects =
    Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects = function () {
    _Scene_Map_createDisplayObjects.call(this);
    this.createCountryPopupWindow();
  };

  Scene_Map.prototype.createCountryPopupWindow = function () {
    this._countryPopupWindow = new Window_CountryPopup();
    this.addChild(this._countryPopupWindow);
  };

  const _Scene_Map_createSpriteset = Scene_Map.prototype.createSpriteset;
  Scene_Map.prototype.createSpriteset = function () {
    _Scene_Map_createSpriteset.call(this);
  };

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);
    if ($gameWeather) {
      $gameWeather.update();
    }
  };

  const _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start.call(this);
    if (!$gameWeather) {
      $gameWeather = new Game_WeatherTimeSystem();
    }
  };

  // --- MODIFICATION END ---

  // Custom Weather Particle System
  // Shared texture cache: previously every particle generated its own texture via
  // renderer.generateTexture(), which wasted GPU memory and forced one draw call
  // per particle (no batching). Caching by a shape/color key lets PIXI batch all
  // same-texture sprites into a single draw call, and the temp Graphics is freed.
  const _particleTextureCache = Object.create(null);
  function getParticleTexture(key, buildGraphics) {
    let tex = _particleTextureCache[key];
    if (tex) return tex;
    const g = buildGraphics();
    tex = Graphics.app.renderer.generateTexture(g);
    g.destroy(true);
    _particleTextureCache[key] = tex;
    return tex;
  }

  class Weather_CustomParticle extends PIXI.Sprite {
    constructor(texture, config) {
      super(texture);
      this.config = config;
      this.reset();
    }
    reset() { }
    update() { }
  }
  class Weather_CustomLayer extends PIXI.Container {
    constructor() {
      super();
      this.particles = [];
      this.maxParticles = 100;
      this.intensity = 5;
      this.effectType = null;
      this.targetIntensity = 5;
      this.transitionDuration = 60;
      this.transitionTime = 0;
    }
    setWeather(type, intensity, duration) {
      this.effectType = type;
      this.targetIntensity = intensity;
      this.transitionDuration = duration;
      this.transitionTime = 0;
      this.maxParticles = this.getMaxParticles(type, intensity);
      this.clearParticles();
      this.createParticles();
    }
    getMaxParticles(type, intensity) {
      const base = {
        fireflies: 20,
        pollen: 40,
        leaves: 15,
        sakura: 30,
        dust: 60,
        ash: 50,
        magic: 35,
        bubbles: 25,
        embers: 40,
        aurora: 10,
      };
      return Math.floor((base[type] || 30) * (intensity / 5));
    }
    clearParticles() {
      // removeChildren() detaches all sprites in one pass. Cached textures are
      // shared/reused, so we deliberately do NOT destroy them here.
      this.removeChildren();
      this.particles.length = 0;
    }
    createParticles() {
      for (let i = 0; i < this.maxParticles; i++) {
        const particle = this.createParticle();
        if (particle) {
          this.particles.push(particle);
          this.addChild(particle);
        }
      }
    }
    createParticle() {
      switch (this.effectType) {
        case "fireflies":
          return this.createFirefly();
        case "pollen":
          return this.createPollen();
        case "leaves":
          return this.createLeaf();
        case "sakura":
          return this.createSakuraPetal();
        case "dust":
          return this.createDust();
        case "ash":
          return this.createAsh();
        case "magic":
          return this.createMagicParticle();
        case "bubbles":
          return this.createBubble();
        case "embers":
          return this.createEmber();
        case "aurora":
          return this.createAurora();
        default:
          return null;
      }
    }
    createFirefly() {
      const t = getParticleTexture("firefly", () =>
        new PIXI.Graphics().beginFill(0xffff88, 1).drawCircle(0, 0, 2).endFill()
      );
      const f = new Weather_CustomParticle(t, {
        speed: 0.5 + Math.random() * 0.5,
        glowPhase: Math.random() * Math.PI * 2,
        wanderAngle: Math.random() * Math.PI * 2,
        baseAlpha: 0.8 + Math.random() * 0.2,
      });
      f.reset = function () {
        this.x = Math.random() * Graphics.width;
        this.y = Math.random() * Graphics.height;
        this.vx = 0;
        this.vy = 0;
      };
      f.update = function () {
        this.config.wanderAngle += (Math.random() - 0.5) * 0.1;
        this.vx += Math.cos(this.config.wanderAngle) * this.config.speed * 0.1;
        this.vy += Math.sin(this.config.wanderAngle) * this.config.speed * 0.1;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.x += this.vx;
        this.y += this.vy;
        this.config.glowPhase += 0.05;
        this.alpha =
          this.config.baseAlpha * (0.5 + 0.5 * Math.sin(this.config.glowPhase));
        if (this.x < -10) this.x = Graphics.width + 10;
        if (this.x > Graphics.width + 10) this.x = -10;
        if (this.y < -10) this.y = Graphics.height + 10;
        if (this.y > Graphics.height + 10) this.y = -10;
      };
      f.reset();
      return f;
    }
    createPollen() {
      const t = getParticleTexture("pollen", () =>
        new PIXI.Graphics().beginFill(0xffffcc, 0.8).drawCircle(0, 0, 1.5).endFill()
      );
      const p = new Weather_CustomParticle(t, {
        floatSpeed: 0.3 + Math.random() * 0.4,
        swayAmount: 2 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
      });
      p.reset = function () {
        this.x = Math.random() * Graphics.width;
        this.y = -10;
        this.baseX = this.x;
      };
      p.update = function () {
        this.y += this.config.floatSpeed;
        this.config.phase += 0.02;
        this.x =
          this.baseX + Math.sin(this.config.phase) * this.config.swayAmount;
        if (this.y > Graphics.height + 10) this.reset();
      };
      p.reset();
      return p;
    }
    createLeaf() {
      const c = [0x8b7355, 0xcd853f, 0xd2691e, 0xff8c00][
        Math.floor(Math.random() * 4)
      ];
      const t = getParticleTexture("leaf_" + c, () =>
        new PIXI.Graphics()
          .beginFill(c, 0.9)
          .moveTo(0, -4)
          .quadraticCurveTo(3, 0, 0, 4)
          .quadraticCurveTo(-3, 0, 0, -4)
          .endFill()
      );
      const l = new Weather_CustomParticle(t, {
        fallSpeed: 1 + Math.random() * 1.5,
        swaySpeed: 0.02 + Math.random() * 0.02,
        swayAmount: 30 + Math.random() * 20,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        phase: Math.random() * Math.PI * 2,
      });
      l.anchor.set(0.5);
      l.reset = function () {
        this.x = Math.random() * (Graphics.width + 200) - 100;
        this.y = -20;
        this.baseX = this.x;
        this.scale.set(0.8 + Math.random() * 0.4);
      };
      l.update = function () {
        this.y += this.config.fallSpeed;
        this.config.phase += this.config.swaySpeed;
        this.x =
          this.baseX + Math.sin(this.config.phase) * this.config.swayAmount;
        this.rotation += this.config.rotationSpeed;
        if (this.y > Graphics.height + 20) this.reset();
      };
      l.reset();
      return l;
    }
    createSakuraPetal() {
      const t = getParticleTexture("sakura", () =>
        new PIXI.Graphics()
          .beginFill(0xffb7c5, 0.9)
          .moveTo(0, -3)
          .quadraticCurveTo(2, -1, 2, 1)
          .quadraticCurveTo(0, 3, -2, 1)
          .quadraticCurveTo(-2, -1, 0, -3)
          .endFill()
      );
      const p = new Weather_CustomParticle(t, {
        fallSpeed: 0.5 + Math.random() * 0.5,
        spinSpeed: 0.02 + Math.random() * 0.03,
        swayAmount: 20 + Math.random() * 20,
        phase: Math.random() * Math.PI * 2,
      });
      p.anchor.set(0.5);
      p.reset = function () {
        this.x = Math.random() * (Graphics.width + 100) - 50;
        this.y = -10;
        this.baseX = this.x;
        this.scale.set(0.7 + Math.random() * 0.3);
      };
      p.update = function () {
        this.y += this.config.fallSpeed;
        this.config.phase += this.config.spinSpeed;
        this.x =
          this.baseX + Math.sin(this.config.phase * 2) * this.config.swayAmount;
        this.rotation = Math.sin(this.config.phase) * 0.5;
        if (this.y > Graphics.height + 10) this.reset();
      };
      p.reset();
      return p;
    }
    createDust() {
      const t = getParticleTexture("dust", () =>
        new PIXI.Graphics().beginFill(0xd2b48c, 0.3).drawCircle(0, 0, 2).endFill()
      );
      const d = new Weather_CustomParticle(t, {
        speedX: 2 + Math.random() * 3,
        speedY: (Math.random() - 0.5) * 0.5,
        fadeSpeed: 0.002 + Math.random() * 0.003,
      });
      d.reset = function () {
        this.x = -20;
        this.y = Math.random() * Graphics.height;
        this.alpha = 0.3 + Math.random() * 0.3;
        this.scale.set(1 + Math.random());
      };
      d.update = function () {
        this.x += this.config.speedX;
        this.y += this.config.speedY;
        this.alpha -= this.config.fadeSpeed;
        if (this.x > Graphics.width + 20 || this.alpha <= 0) this.reset();
      };
      d.reset();
      return d;
    }
    createAsh() {
      const t = getParticleTexture("ash", () =>
        new PIXI.Graphics().beginFill(0x808080, 0.7).drawRect(-1, -1, 2, 2).endFill()
      );
      const a = new Weather_CustomParticle(t, {
        fallSpeed: 0.3 + Math.random() * 0.4,
        driftSpeed: (Math.random() - 0.5) * 0.5,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
      });
      a.reset = function () {
        this.x = Math.random() * Graphics.width;
        this.y = -10;
        this.alpha = 0.4 + Math.random() * 0.4;
      };
      a.update = function () {
        this.y += this.config.fallSpeed;
        this.x += this.config.driftSpeed;
        this.rotation += this.config.rotationSpeed;
        if (this.y > Graphics.height + 10) this.reset();
      };
      a.reset();
      return a;
    }
    createMagicParticle() {
      const c = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00][
        Math.floor(Math.random() * 4)
      ];
      const t = getParticleTexture("magic_" + c, () =>
        new PIXI.Graphics().beginFill(c, 1).drawStar(0, 0, 4, 3, 2).endFill()
      );
      const m = new Weather_CustomParticle(t, {
        orbitRadius: 50 + Math.random() * 100,
        orbitSpeed: 0.02 + Math.random() * 0.03,
        centerX: Math.random() * Graphics.width,
        centerY: Math.random() * Graphics.height,
        phase: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2,
      });
      m.anchor.set(0.5);
      m.reset = function () {
        this.scale.set(0.5 + Math.random() * 0.5);
      };
      m.update = function () {
        this.config.phase += this.config.orbitSpeed;
        this.x =
          this.config.centerX +
          Math.cos(this.config.phase) * this.config.orbitRadius;
        this.y =
          this.config.centerY +
          Math.sin(this.config.phase) * this.config.orbitRadius * 0.5;
        this.config.pulsePhase += 0.05;
        this.alpha = 0.5 + 0.5 * Math.sin(this.config.pulsePhase);
        this.rotation += 0.05;
        this.config.centerX += (Math.random() - 0.5) * 0.5;
        this.config.centerY += (Math.random() - 0.5) * 0.5;
        if (this.config.centerX < -100)
          this.config.centerX = Graphics.width + 100;
        if (this.config.centerX > Graphics.width + 100)
          this.config.centerX = -100;
        if (this.config.centerY < -100)
          this.config.centerY = Graphics.height + 100;
        if (this.config.centerY > Graphics.height + 100)
          this.config.centerY = -100;
      };
      m.reset();
      return m;
    }
    createBubble() {
      const t = getParticleTexture("bubble", () =>
        new PIXI.Graphics()
          .lineStyle(1, 0xffffff, 0.5)
          .beginFill(0xffffff, 0.1)
          .drawCircle(0, 0, 5)
          .endFill()
      );
      const b = new Weather_CustomParticle(t, {
        riseSpeed: 0.5 + Math.random() * 0.5,
        wobbleSpeed: 0.03 + Math.random() * 0.02,
        wobbleAmount: 10 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        popTimer: 300 + Math.random() * 300,
      });
      b.reset = function () {
        this.x = Math.random() * Graphics.width;
        this.y = Graphics.height + 20;
        this.baseX = this.x;
        this.scale.set(0.5 + Math.random() * 1);
        this.config.popTimer = 300 + Math.random() * 300;
      };
      b.update = function () {
        this.y -= this.config.riseSpeed;
        this.config.phase += this.config.wobbleSpeed;
        this.x =
          this.baseX + Math.sin(this.config.phase) * this.config.wobbleAmount;
        this.config.popTimer--;
        if (this.y < -20 || this.config.popTimer <= 0) {
          if (this.config.popTimer <= 0) {
            this.scale.x += 0.1;
            this.scale.y += 0.1;
            this.alpha -= 0.1;
            if (this.alpha <= 0) this.reset();
          } else {
            this.reset();
          }
        }
      };
      b.reset();
      return b;
    }
    createEmber() {
      const t = getParticleTexture("ember", () =>
        new PIXI.Graphics().beginFill(0xff4500, 1).drawCircle(0, 0, 2).endFill()
      );
      const e = new Weather_CustomParticle(t, {
        riseSpeed: 1 + Math.random() * 1.5,
        driftX: (Math.random() - 0.5) * 2,
        lifespan: 200 + Math.random() * 200,
        currentLife: 0,
      });
      e.reset = function () {
        this.x = Math.random() * Graphics.width;
        this.y = Graphics.height + 10;
        this.config.currentLife = 0;
        this.alpha = 1;
        this.scale.set(1);
      };
      e.update = function () {
        this.y -= this.config.riseSpeed;
        this.x += this.config.driftX + (Math.random() - 0.5) * 0.5;
        this.config.currentLife++;
        const lifeRatio = this.config.currentLife / this.config.lifespan;
        this.alpha = 1 - lifeRatio;
        this.scale.set(1 - lifeRatio * 0.5);
        this.tint = this.interpolateColor(0xff4500, 0x8b0000, lifeRatio);
        if (this.config.currentLife >= this.config.lifespan || this.y < -10)
          this.reset();
      };
      e.interpolateColor = function (c1, c2, r) {
        const r1 = (c1 >> 16) & 255,
          g1 = (c1 >> 8) & 255,
          b1 = c1 & 255;
        const r2 = (c2 >> 16) & 255,
          g2 = (c2 >> 8) & 255,
          b2 = c2 & 255;
        const r_ = Math.round(r1 + (r2 - r1) * r),
          g_ = Math.round(g1 + (g2 - g1) * r),
          b_ = Math.round(b1 + (b2 - b1) * r);
        return (r_ << 16) + (g_ << 8) + b_;
      };
      e.reset();
      return e;
    }
    createAurora() {
      const w = Graphics.width / 10;
      const c = [0x00ff00, 0x00ffff, 0xff00ff, 0x0000ff][
        Math.floor(Math.random() * 4)
      ];
      // Bake a fixed-height band per color; height variety comes from scale.y.
      const t = getParticleTexture("aurora_" + c, () =>
        new PIXI.Graphics().beginFill(c, 0.3).drawRect(0, 0, w, 150).endFill()
      );
      const a = new Weather_CustomParticle(t, {
        waveSpeed: 0.01 + Math.random() * 0.02,
        waveAmount: 20 + Math.random() * 30,
        phase: Math.random() * Math.PI * 2,
        baseY: Math.random() * Graphics.height * 0.5,
        fadePhase: Math.random() * Math.PI * 2,
      });
      a.reset = function () {
        this.x = Math.floor(Math.random() * 10) * (Graphics.width / 10);
        this.y = this.config.baseY;
        this.scale.set(1, 0.66 + Math.random() * 0.66);
      };
      a.update = function () {
        this.config.phase += this.config.waveSpeed;
        this.y =
          this.config.baseY +
          Math.sin(this.config.phase) * this.config.waveAmount;
        this.config.fadePhase += 0.02;
        this.alpha = 0.1 + 0.2 * Math.sin(this.config.fadePhase);
        this.x += Math.sin(this.config.phase * 0.5) * 0.5;
      };
      a.reset();
      return a;
    }
    update() {
      const transitioning = this.transitionTime < this.transitionDuration;
      // Idle layer (no active effect): skip the whole pass instead of running an
      // empty iteration every frame.
      if (!transitioning && this.particles.length === 0) return;

      if (transitioning) {
        this.transitionTime++;
        const ratio = this.transitionTime / this.transitionDuration;
        this.intensity += (this.targetIntensity - this.intensity) * ratio;
        this.alpha = this.intensity / 10;
      }
      // Plain for-loop avoids a per-frame closure allocation.
      const ps = this.particles;
      for (let i = 0; i < ps.length; i++) {
        if (ps[i].update) ps[i].update();
      }
    }
    clear() {
      this.clearParticles();
      this.effectType = null;
    }
  }
  const _Spriteset_Map_createWeather = Spriteset_Map.prototype.createWeather;
  Spriteset_Map.prototype.createWeather = function () {
    _Spriteset_Map_createWeather.call(this);
    this._customWeatherLayer = new Weather_CustomLayer();
    this.addChild(this._customWeatherLayer);
  };
  const _Spriteset_Map_updateWeather = Spriteset_Map.prototype.updateWeather;
  Spriteset_Map.prototype.updateWeather = function () {
    _Spriteset_Map_updateWeather.call(this);
    if (this._customWeatherLayer) this._customWeatherLayer.update();
  };
  Spriteset_Map.prototype.setCustomWeather = function (
    type,
    intensity,
    duration
  ) {
    if (this._customWeatherLayer)
      this._customWeatherLayer.setWeather(type, intensity, duration);
  };
  Spriteset_Map.prototype.clearCustomWeather = function () {
    if (this._customWeatherLayer) this._customWeatherLayer.clear();
  };
  const _Game_WeatherTimeSystem_clearWeather =
    Game_WeatherTimeSystem.prototype.clearWeather;
  Game_WeatherTimeSystem.prototype.clearWeather = function () {
    _Game_WeatherTimeSystem_clearWeather.call(this);
    this.clearCustomWeather();
  };

  // Display copy for a weather id. The id itself stays English because the
  // battle system matches on it; only this label is translated.
  window.WeatherNames = {
    label(id) {
      const key = 'Weather.name.' + String(id || 'Unknown');  // i18n-ignore  weather id fallback
      return T.has(key) ? T(key) : String(id || '');
    }
  };

  //===========================================================================
  // Exposure: the temperature, felt
  //===========================================================================
  // This plugin has always simulated temperature properly - per country, per
  // season, day and night curves, per weather type, with <BaseTemp:> overrides -
  // and written it to variable 61, where exactly one thing read it: the hunger
  // drain in TimeDateSystem. A number on the HUD and nothing else.
  //
  // What it costs now is stated here, so that the body, the status screen and
  // anything else that wants to know all ask the same question.
  //
  //   - The comfortable band is the same 12-26 C the hunger multiplier uses,
  //     because it is the same physiology.
  //   - Outside it, severity climbs to 1 at 20 degrees past either edge.
  //   - WHAT THE PARTY IS WEARING is the other half. Weight is the honest proxy
  //     the database already carries: a heavy kit is warm, which is what you
  //     want at -15 and exactly what you do not want at 40. So the same armour
  //     that saves a character in the tundra is what fells them in the desert.
  //   - Indoors nobody is exposed. `<Interior>` maps only take the tint.
  //
  // Cold takes the hands and the feet first, so it is dexterity and then the
  // swing. Heat takes the head and the wind, so it is concentration and then
  // stamina. Both are on the 1-20 ability scale and both are small, because
  // this is meant to be a reason to dress for the trip and buy a room for the
  // night, not a second health bar.
  const COMFORT_MIN = 12;
  const COMFORT_MAX = 26;
  // Degrees past the comfortable band at which exposure is as bad as it gets.
  const EXPOSURE_RANGE = 20;
  // Kit weight in grams at which a character is dressed for anything.
  const FULL_INSULATION_GRAMS = 12000;
  // The most insulation can do either way: warm kit halves the cold and adds
  // half again to the heat.
  const INSULATION_RELIEF = 0.5;
  const INSULATION_PENALTY = 0.5;
  const EXPOSURE_DEBUFFS = {
    cold: { agi: -3, atk: -2, mat: -1 },
    heat: { mat: -3, agi: -2, def: -1 },
  };
  const EXPOSURE_PARAM_KEYS = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
  // The same variable updateTemperature() writes (see the header, and :1309).
  const TEMPERATURE_VARIABLE = 61;

  window.WeatherExposure = {
    // Degrees celsius where the party is standing, or null if nobody is keeping
    // a thermometer (the plugin's own variable, so this is always answered).
    temperature() {
      if (typeof $gameVariables === 'undefined' || !$gameVariables) return null;
      const t = Number($gameVariables.value(TEMPERATURE_VARIABLE));
      return Number.isFinite(t) ? t : null;
    },

    // Inside is inside. A roofed map is tinted by temperature but nobody
    // standing in it is out in the weather.
    isSheltered() {
      if (window.$gameWeather && typeof window.$gameWeather.isInterior !== 'undefined') {
        return window.$gameWeather.isInterior;
      }
      if (typeof $gameMap === 'undefined' || !$gameMap) return true;
      try {
        const meta = ($dataMap && $dataMap.meta) || {};
        if (meta.Interior) return true;
        if (typeof window.isProceduralInteriorMap === 'function' &&
            window.isProceduralInteriorMap($gameMap.mapId())) return true;
      } catch (e) { /* an unreadable map is treated as open sky */ }
      return false;
    },

    // How much of the kit a character has on, 0..1.
    insulationOf(actor) {
      const utils = window.ItemSystemUtils;
      if (!actor || !utils || typeof utils.getItemWeight !== 'function') return 0;
      let grams = 0;
      try {
        for (const piece of actor.equips() || []) {
          if (piece && !DataManager.isWeapon(piece)) grams += utils.getItemWeight(piece);
        }
      } catch (e) { return 0; }
      return Math.max(0, Math.min(1, grams / FULL_INSULATION_GRAMS));
    },

    // { kind: 'cold'|'heat'|null, severity: 0..1 } for one character, with what
    // they are wearing already taken into account.
    exposureOf(actor) {
      const none = { kind: null, severity: 0 };
      if (!actor) return none;
      const t = this.temperature();
      if (t === null) return none;
      const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
      if (actor._weatherExpCache && actor._weatherExpFrame === frame && actor._weatherExpTemp === t) {
        return actor._weatherExpCache;
      }
      if (this.isSheltered()) {
        actor._weatherExpCache = none;
        actor._weatherExpFrame = frame;
        actor._weatherExpTemp = t;
        return none;
      }
      const kind = t < COMFORT_MIN ? 'cold' : (t > COMFORT_MAX ? 'heat' : null);
      if (!kind) {
        actor._weatherExpCache = none;
        actor._weatherExpFrame = frame;
        actor._weatherExpTemp = t;
        return none;
      }
      const past = kind === 'cold' ? COMFORT_MIN - t : t - COMFORT_MAX;
      let severity = Math.max(0, Math.min(1, past / EXPOSURE_RANGE));
      const insulation = this.insulationOf(actor);
      severity *= kind === 'cold'
        ? (1 - INSULATION_RELIEF * insulation)
        : (1 + INSULATION_PENALTY * insulation);
      const res = { kind, severity: Math.max(0, Math.min(1, severity)) };
      actor._weatherExpCache = res;
      actor._weatherExpFrame = frame;
      actor._weatherExpTemp = t;
      return res;
    },

    // What exposure costs one param. Rounded away from zero so the first bite of
    // a cold snap is felt rather than rounded off.
    paramDelta(actor, paramId) {
      const key = EXPOSURE_PARAM_KEYS[paramId];
      if (!key) return 0;
      const { kind, severity } = this.exposureOf(actor);
      if (!kind || severity <= 0) return 0;
      const table = EXPOSURE_DEBUFFS[kind];
      if (!table || !table[key]) return 0;
      const raw = table[key] * severity;
      return raw < 0 ? -Math.max(1, Math.round(-raw)) : Math.max(1, Math.round(raw));
    },
  };

  const _Game_Actor_paramPlus_Weather = Game_Actor.prototype.paramPlus;
  Game_Actor.prototype.paramPlus = function (paramId) {
    let v = _Game_Actor_paramPlus_Weather.call(this, paramId);
    try { v += window.WeatherExposure.paramDelta(this, paramId); } catch (e) { /* a stat is not worth a crash */ }
    return v;
  };

  //===========================================================================
  // The Whether Channel: the HypernetOS weather app
  //===========================================================================
  // Current conditions where the party stands, read off $gameWeather, plus a
  // five-day outlook and a climate sheet for any country in the table. The
  // outlook is not a promise the simulation keeps: it is rolled from the
  // country's season (precipitation and cloud cover) with a hash of the date,
  // so the same day always prints the same forecast and the page never
  // rewrites itself while it is being read.
  const WHETHER_APP_ID = 'app-weather';

  function whetherHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h / 4294967296;
  }

  // Season of a day of the year, north of the equator, the same four the
  // country table is keyed by.
  function whetherSeasonOf(month) {
    if (month === 11 || month <= 1) return 'winter';
    if (month <= 4) return 'spring';
    if (month <= 7) return 'summer';
    return 'autumn';
  }

  // One forecast day: { weather, high, low, precipChance, cloud, wind }.
  function whetherForecastDay(country, year, month, day) {
    const seasons = country && country.seasons;
    const season = seasons ? seasons[whetherSeasonOf(month)] : null;
    if (!season) return null;
    const tag = country.id + ':' + year + '-' + month + '-' + day;
    const r1 = whetherHash(tag + 'w'), r2 = whetherHash(tag + 't'), r3 = whetherHash(tag + 'c');
    // Precipitation in the table is mm a day; 3 mm is a wet climate.
    const precipChance = Math.max(0.03, Math.min(0.9, (season.precipitation || 0) / 3.5));
    const cloud = Math.max(0, Math.min(100, (season.cloudCover || 30) + (r3 - 0.5) * 40));
    let weather = WeatherTypes.NONE;
    const high = season.dayTemp + (r2 - 0.5) * 6;
    if (r1 < precipChance) {
      if (high <= 1) weather = WeatherTypes.SNOW;
      else weather = r1 < precipChance * 0.25 ? WeatherTypes.STORM : WeatherTypes.RAIN;
    }
    const effect = WeatherTemperatureEffects[weather] || 0;
    return {
      weather,
      high: Math.round(high + effect),
      low: Math.round(season.nightTemp + (r2 - 0.5) * 4 + effect),
      precipChance: Math.round(precipChance * 100),
      cloud: Math.round(cloud),
      wind: Math.round((season.windSpeed || 8) * (0.7 + r3 * 0.6))
    };
  }

  function whetherForecast(country, date, days) {
    const out = [];
    const d = new Date(date.year, date.month, date.day);
    for (let i = 0; i < days; i++) {
      const f = whetherForecastDay(country, d.getFullYear(), d.getMonth(), d.getDate());
      if (f) out.push(Object.assign({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay() }, f));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function whetherLabel(id) {
    const name = { none: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow' }[id] || 'Unknown';  // i18n-ignore  weather ids
    return window.WeatherNames.label(name);
  }

  function whetherGlyph(id) {
    // Sky drawn in text, the way a 2001 weather site would.
    const cls = { none: 'sun', rain: 'rain', storm: 'storm', snow: 'snow' }[id] || 'sun';
    return `<span class="whether-glyph whether-glyph--${cls}"></span>`;
  }

  let _cachedSortedWhetherCountries = null;

  window.WhetherChannel = {
    hash: whetherHash,
    seasonOf: whetherSeasonOf,
    forecastDay: whetherForecastDay,
    forecast: whetherForecast,

    countries: () => {
      if (!_cachedSortedWhetherCountries) {
        _cachedSortedWhetherCountries = Countries.filter(c => c && c.seasons).slice().sort((a, b) => String(a.country).localeCompare(String(b.country)));
      }
      return _cachedSortedWhetherCountries;
    },

    current: function() {
      const gw = typeof $gameWeather !== 'undefined' ? $gameWeather : null;
      const country = gw && gw.currentCountry ? gw.currentCountry : defaultCountry;
      const date = getGameDateFromVariable();
      const seasonKey = (gw && gw.getSeason ? gw.getSeason() : whetherSeasonOf(date.month)).toLowerCase();
      const season = country && country.seasons ? country.seasons[seasonKey] : null;
      return {
        country,
        date,
        seasonKey,
        season,
        weather: gw ? gw.currentWeatherType : WeatherTypes.NONE,
        temperature: gw && Number.isFinite(gw.currentTemperature) ? Math.round(gw.currentTemperature) : null,
        sheltered: window.WeatherExposure ? window.WeatherExposure.isSheltered() : false
      };
    },

    launch: function() {
      const OS = window.HypernetOS;
      if (!OS || !OS.WindowManager) return;
      const T_ = (k, p) => T('Weather.app.' + k, p);
      const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const html = `
        <div class="whether">
          <div class="whether-banner">
            <div class="whether-logo">${T_('appName')}</div>
            <div class="whether-tagline">${T_('tagline')}</div>
          </div>
          <div class="whether-toolbar">
            <label>${T_('location')}</label>
            <select id="whether-country" class="focusable"></select>
            <button id="whether-here" class="focusable">${T_('here')}</button>
            <span class="whether-updated" id="whether-updated"></span>
          </div>
          <div class="whether-body" id="whether-body"></div>
        </div>`;

      const win = OS.WindowManager.createWindow({ id: WHETHER_APP_ID, title: T_('appName'), icon: 184, width: 640, height: 520, contentHTML: html });
      if (win._whetherBound) return;
      win._whetherBound = true;
      const q = s => win.querySelector(s);

      const sel = q('#whether-country');
      sel.innerHTML = this.countries().map(c => `<option value="${c.id}">${esc(c.country)}</option>`).join('');

      const render = (countryId) => {
        const cur = this.current();
        const here = !countryId || (cur.country && cur.country.id === countryId);
        const country = here ? cur.country : Countries.find(c => c.id === countryId);
        if (!country) return;
        sel.value = String(country.id);
        const stale = OS.staleDate && OS.staleDate();
        q('#whether-updated').textContent = T_('updated', { date: stale || (String(cur.date.day).padStart(2, '0') + '/' + String(cur.date.month + 1).padStart(2, '0') + '/' + cur.date.year + ' ' + String(cur.date.hours).padStart(2, '0') + ':' + String(cur.date.minutes).padStart(2, '0')) });

        const seasonKey = here ? cur.seasonKey : whetherSeasonOf(cur.date.month);
        const season = country.seasons ? country.seasons[seasonKey] : null;
        const nowWeather = here ? cur.weather : (whetherForecastDay(country, cur.date.year, cur.date.month, cur.date.day) || {}).weather;
        const nowTemp = here && cur.temperature != null ? cur.temperature : (season ? Math.round((season.dayTemp + season.nightTemp) / 2) : null);
        const days = T.list('HypernetOS.dayAbbr');
        const months = T.list('Weather.app.months');

        const outlook = whetherForecast(country, cur.date, 5).map((f, i) => `
          <div class="whether-day${i === 0 ? ' today' : ''}">
            <div class="whether-day-name">${i === 0 ? T_('today') : esc(days[f.weekday])}</div>
            <div class="whether-day-date">${f.day} ${esc(months[f.month] || '')}</div>
            ${whetherGlyph(f.weather)}
            <div class="whether-day-cond">${esc(whetherLabel(f.weather))}</div>
            <div class="whether-day-temps"><b>${f.high}&deg;</b> / ${f.low}&deg;</div>
            <div class="whether-day-extra">${T_('precip', { n: f.precipChance })}</div>
          </div>`).join('');

        q('#whether-body').innerHTML = `
          <div class="whether-now">
            <div class="whether-now-left">
              ${whetherGlyph(nowWeather)}
              <div class="whether-now-temp">${nowTemp != null ? nowTemp + '&deg;C' : '--'}</div>
            </div>
            <div class="whether-now-right">
              <div class="whether-now-place">${esc(country.country)}${country.region ? ' <small>(' + esc(country.region) + ')</small>' : ''}</div>
              <div class="whether-now-cond">${esc(whetherLabel(nowWeather))}${here && cur.sheltered ? ' <small>' + T_('indoors') + '</small>' : ''}</div>
              <table class="whether-facts">
                <tr><td>${T_('season')}</td><td>${esc(T('Weather.app.seasons.' + seasonKey))}</td></tr>
                ${season ? `
                <tr><td>${T_('sunrise')}</td><td>${esc(season.sunrise)}</td></tr>
                <tr><td>${T_('sunset')}</td><td>${esc(season.sunset)}</td></tr>
                <tr><td>${T_('dayNight')}</td><td>${Math.round(season.dayTemp)}&deg; / ${Math.round(season.nightTemp)}&deg;</td></tr>
                <tr><td>${T_('humidity')}</td><td>${season.dayHumidity != null ? season.dayHumidity + '%' : '--'}</td></tr>
                <tr><td>${T_('wind')}</td><td>${season.windSpeed != null ? T_('kmh', { n: season.windSpeed }) : '--'}</td></tr>
                <tr><td>${T_('cloud')}</td><td>${season.cloudCover != null ? season.cloudCover + '%' : '--'}</td></tr>` : ''}
              </table>
            </div>
          </div>
          <div class="whether-outlook-title">${T_('outlook')}</div>
          <div class="whether-outlook">${outlook}</div>
          <div class="whether-footer">${T_('disclaimer')}</div>`;
      };

      sel.addEventListener('change', () => render(parseInt(sel.value, 10)));
      q('#whether-here').addEventListener('click', (e) => { e.stopPropagation(); render(null); });
      render(null);
    }
  };

  function registerWhether() {
    if (!window.HypernetOS || !window.HypernetOS.registerApp) return false;
    window.HypernetOS.registerApp({
      id: WHETHER_APP_ID,
      name: T('Weather.app.appName'),
      icon: 184,
      category: 'reference',
      launchFn: () => window.WhetherChannel.launch(),
      desktopShortcut: true
    });
    return true;
  }
  if (!registerWhether()) {
    const _Scene_Boot_create_whether = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
      _Scene_Boot_create_whether.call(this);
      registerWhether();
    };
  }

})();
