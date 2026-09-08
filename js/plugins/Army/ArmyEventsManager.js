/*:
 * @plugindesc Army Events and Troop Counter Display on World Map
 * @author Omni-Lex
 * @target MZ
 *
 * @param worldMapId
 * @text World Map ID
 * @type number
 * @default 315
 * @desc The map ID where armies are displayed (world map).
 *
 * @param minArmySize
 * @text Minimum Independent Army Size
 * @type number
 * @min 1
 * @default 5
 * @desc Minimum number of troops in an independent army.
 *
 * @param maxArmySize
 * @text Maximum Independent Army Size
 * @type number
 * @min 1
 * @default 30
 * @desc Maximum number of troops in an independent army.
 *
 * @param minFactionArmySize
 * @text Minimum Faction Army Size
 * @type number
 * @min 1
 * @default 200
 * @desc Minimum number of troops in a faction army.
 *
 * @param maxFactionArmySize
 * @text Maximum Faction Army Size
 * @type number
 * @min 1
 * @default 1000
 * @desc Maximum number of troops in a faction army.
 *
 * @param factionArmyPercent
 * @text Faction Army Percentage
 * @type number
 * @min 0
 * @max 100
 * @default 20
 * @desc Percentage of armies that are faction-specific (vs independent).
 *
 * @param armyMovementChance
 * @text Army Movement Chance
 * @type number
 * @min 0
 * @max 100
 * @default 30
 * @desc Percentage chance armies will move when player moves (0-100).
 *
 * @param debugMode
 * @text Debug Mode
 * @type boolean
 * @default false
 * @desc If true, army events are assigned but not moved to random positions.
 *
 * @help
 * Army Events Manager
 *
 * This plugin manages AI armies on the world map and displays troop counts.
 *
 * Features:
 * - Shows player's troop count above sprite on world map
 * - Spawns AI armies at random passable locations based on faction territories
 * - 20% faction armies (200-1000 troops, single faction + subfactions) with minimum 3 per country
 * - 80% independent armies (5-30 troops, multiple factions) - spawn within 60 tiles of player
 * - Armies roam randomly when player moves (configurable chance per step)
 * - Faction armies stay within their country boundaries (region IDs)
 * - Independent armies can roam anywhere on the map
 * - Displays army info above event sprites
 * - Saves and restores army positions
 * - Logs all spawn locations to console with country names
 *
 * Requires WeatherSystemDB.js to define country factions and region IDs.
 * Faction armies spawn in regions matching their faction's countries.
 * Independent armies spawn within 60 tiles of player position.
 * Factions with noStartingTroops: true will not spawn any armies.
 *
 * Events named "Army" on the world map will be automatically
 * populated with random troops and positioned.
 *
 * Integration with ArmyBattleView.js:
 * To start a field battle with an army, use this in the Army event:
 * - In the event's touch/action trigger, add a Plugin Command:
 *   ArmyBattleView startBattle armyEventId
 * - Example: ArmyBattleView startBattle 10
 * - Use "this._eventId" in the script call to get current event ID
 */

var Imported = Imported || {};
Imported.ArmyEventsManager = true;

var ArmyEventsManager = ArmyEventsManager || {};
ArmyEventsManager.Params = PluginManager.parameters("ArmyEventsManager");

ArmyEventsManager.Params.worldMapId = Number(ArmyEventsManager.Params.worldMapId || 315);
ArmyEventsManager.Params.minArmySize = Number(ArmyEventsManager.Params.minArmySize || 5);
ArmyEventsManager.Params.maxArmySize = Number(ArmyEventsManager.Params.maxArmySize || 30);
ArmyEventsManager.Params.minFactionArmySize = Number(ArmyEventsManager.Params.minFactionArmySize || 200);
ArmyEventsManager.Params.maxFactionArmySize = Number(ArmyEventsManager.Params.maxFactionArmySize || 1000);
ArmyEventsManager.Params.factionArmyPercent = Number(ArmyEventsManager.Params.factionArmyPercent || 20);
ArmyEventsManager.Params.armyMovementChance = Number(ArmyEventsManager.Params.armyMovementChance || 30);
ArmyEventsManager.Params.debugMode = String(ArmyEventsManager.Params.debugMode || "false").toLowerCase() === "true";

//=============================================================================
// Game_AIArmy - Stores AI army data
//=============================================================================

function Game_AIArmy() {
  this.initialize(...arguments);
}

Game_AIArmy.prototype.initialize = function (eventId) {
  this._eventId = eventId;
  this._troops = [];
  this._isIndependent = false;
  this._factionId = -1;
  this._leader = null;
  this._x = 0;
  this._y = 0;
  this._validRegions = []; // Region IDs where this army can spawn
};

Game_AIArmy.prototype.getEventId = function () {
  return this._eventId;
};

Game_AIArmy.prototype.getTroops = function () {
  return this._troops;
};

Game_AIArmy.prototype.getTroopCount = function () {
  return this._troops.length;
};

Game_AIArmy.prototype.isIndependent = function () {
  return this._isIndependent;
};

Game_AIArmy.prototype.getFactionId = function () {
  return this._factionId;
};

Game_AIArmy.prototype.getLeader = function () {
  return this._leader;
};

Game_AIArmy.prototype.setPosition = function (x, y) {
  this._x = x;
  this._y = y;
};

Game_AIArmy.prototype.getPosition = function () {
  return { x: this._x, y: this._y };
};

Game_AIArmy.prototype.getValidRegions = function () {
  return this._validRegions;
};

Game_AIArmy.prototype.generateRandomArmy = function () {
  const isFactionArmy = Math.random() * 100 < ArmyEventsManager.Params.factionArmyPercent;

  if (isFactionArmy) {
    this._generateFactionArmy();
  } else {
    this._generateIndependentArmy();
  }
};

Game_AIArmy.prototype._generateFactionArmy = function () {
  this._isIndependent = false;

  // Get all main factions (those with iconIndex)
  const allFactions = $gameFactions.getAllFactions();
  const mainFactions = allFactions.filter(f =>
    f.iconIndex &&
    f.troops &&
    f.troops.length > 0 &&
    !f.noStartingTroops // Exclude factions with noStartingTroops: true
  );

  if (mainFactions.length === 0) return;

  // Pick random main faction
  const faction = mainFactions[Math.floor(Math.random() * mainFactions.length)];
  this._factionId = faction.id;

  // Where this army patrols: what its power HOLDS TODAY.
  //
  // This used to read `country.faction` straight off the static WorldGen table,
  // which is the map as it stood before the century ran. HistorySimulator then
  // spent 1900-2001 moving nations between powers - coups, wars, occupations,
  // the Americas becoming Canadafrica across 1992-94, Northpoint declaring
  // itself in Greenland in December 2001 - and no army ever heard about any of
  // it, so a hyperpower that lost a territory in 1994 still had troops walking
  // it. The faction table's own lookup already prefers the simulation's map
  // (countriesOfHyperpower reads HistoryManager.getNationsState first), so the
  // armies now stand where the archive says they stand.
  this._validRegions = regionsHeldBy(faction);

  // Select a random leader from the faction's leader pool
  // A faction has no roster of its own: it fields the political class of the
  // nations its power holds (FactionDataManager.getFactionLeaders).
  const factionLeaders = $gameFactions.getFactionLeaders(faction);
  if (factionLeaders.length > 0) {
    const randomLeaderIndex = Math.floor(Math.random() * factionLeaders.length);
    this._leader = factionLeaders[randomLeaderIndex];
  }

  // Get all related subfactions
  const relatedFactions = [faction];
  for (const f of allFactions) {
    if (f?.parentHyperpower && f.parentHyperpower === faction.parentHyperpower
        && f.id !== faction.id && f.troops && f.troops.length > 0) {
      relatedFactions.push(f);
    }
  }

  // Generate random number of troops (faction armies are much larger)
  const troopCount = Math.floor(
    Math.random() * (ArmyEventsManager.Params.maxFactionArmySize - ArmyEventsManager.Params.minFactionArmySize + 1)
  ) + ArmyEventsManager.Params.minFactionArmySize;

  // Add random troops from this faction and subfactions
  for (let i = 0; i < troopCount; i++) {
    const selectedFaction = relatedFactions[Math.floor(Math.random() * relatedFactions.length)];
    const troop = selectedFaction.troops[Math.floor(Math.random() * selectedFaction.troops.length)];

    this._troops.push({
      factionId: selectedFaction.id,
      name: troop.name,
      name_it: troop.name_it,
      hp: troop.hp,
      mp: troop.mp,
      atk: troop.atk,
      def: troop.def,
      mat: troop.mat,
      mdf: troop.mdf,
      agi: troop.agi,
      luk: troop.luk,
      role: troop.role,
      spritename: troop.spritename,
      spriteindex: troop.spriteindex
    });
  }
};

// The world-map region ids a faction's power currently holds. Falls back to the
// static table's own `faction` column for an orphan faction, a world whose
// history was never run, or a power that holds nothing under any name the map
// knows: an army with nowhere to be would never spawn at all.
function regionsHeldBy(faction) {
  const countries = (window.WorldGen && window.WorldGen.Countries) || [];
  if (!countries.length) return [];
  const byName = {};
  for (const c of countries) if (c && c.id > 0) byName[c.country] = c.id;

  const power = $gameFactions.hyperpowerOfFaction(faction);
  if (power) {
    const held = $gameFactions.countriesOfHyperpower(power.name)
      .map(name => byName[name])
      .filter(id => id > 0);
    if (held.length) return held;
  }
  return countries
    .filter(c => c && c.faction === faction.name && c.id > 0)
    .map(c => c.id);
}

Game_AIArmy.prototype._generateFactionArmyForCountry = function (faction, countryId) {
  this._isIndependent = false;
  this._factionId = faction.id;

  // Set valid region to the specific country
  this._validRegions = [countryId];

  // Select a random leader from the faction's leader pool
  // A faction has no roster of its own: it fields the political class of the
  // nations its power holds (FactionDataManager.getFactionLeaders).
  const factionLeaders = $gameFactions.getFactionLeaders(faction);
  if (factionLeaders.length > 0) {
    const randomLeaderIndex = Math.floor(Math.random() * factionLeaders.length);
    this._leader = factionLeaders[randomLeaderIndex];
  }

  // Get all related subfactions
  const allFactions = $gameFactions.getAllFactions();
  const relatedFactions = [faction];
  for (const f of allFactions) {
    if (f?.parentHyperpower && f.parentHyperpower === faction.parentHyperpower
        && f.id !== faction.id && f.troops && f.troops.length > 0) {
      relatedFactions.push(f);
    }
  }

  // Generate random number of troops (faction armies are much larger)
  const troopCount = Math.floor(
    Math.random() * (ArmyEventsManager.Params.maxFactionArmySize - ArmyEventsManager.Params.minFactionArmySize + 1)
  ) + ArmyEventsManager.Params.minFactionArmySize;

  // Add random troops from this faction and subfactions
  for (let i = 0; i < troopCount; i++) {
    const selectedFaction = relatedFactions[Math.floor(Math.random() * relatedFactions.length)];
    const troop = selectedFaction.troops[Math.floor(Math.random() * selectedFaction.troops.length)];

    this._troops.push({
      factionId: selectedFaction.id,
      name: troop.name,
      name_it: troop.name_it,
      hp: troop.hp,
      mp: troop.mp,
      atk: troop.atk,
      def: troop.def,
      mat: troop.mat,
      mdf: troop.mdf,
      agi: troop.agi,
      luk: troop.luk,
      role: troop.role,
      spritename: troop.spritename,
      spriteindex: troop.spriteindex
    });
  }
};

Game_AIArmy.prototype._generateIndependentArmy = function () {
  this._isIndependent = true;
  this._factionId = -1;

  // Get region IDs for all countries (independent armies can spawn anywhere)
  if (window.WorldGen && window.WorldGen.Countries) {
    this._validRegions = window.WorldGen.Countries
      .filter(country => country.id > 0)
      .map(country => country.id);
  }

  // Get all factions with troops
  const allFactions = $gameFactions.getAllFactions();
  const factionsWithTroops = allFactions.filter(f => f.troops && f.troops.length > 0);

  if (factionsWithTroops.length === 0) return;

  // Generate random number of total troops
  const totalTroopCount = Math.floor(
    Math.random() * (ArmyEventsManager.Params.maxArmySize - ArmyEventsManager.Params.minArmySize + 1)
  ) + ArmyEventsManager.Params.minArmySize;

  // Determine number of squads (minimum 2, maximum 5)
  const minSquads = 2;
  const maxSquads = Math.min(5, Math.floor(totalTroopCount / 3)); // At least 3 troops per squad
  const numSquads = Math.floor(Math.random() * (maxSquads - minSquads + 1)) + minSquads;

  // Distribute troops among squads
  const squadSizes = [];
  let remainingTroops = totalTroopCount;

  for (let i = 0; i < numSquads; i++) {
    if (i === numSquads - 1) {
      // Last squad gets all remaining troops
      squadSizes.push(remainingTroops);
    } else {
      // Random size for this squad (at least 3, at most half of remaining)
      const minSize = 3;
      const maxSize = Math.max(minSize, Math.floor(remainingTroops / (numSquads - i)));
      const size = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
      squadSizes.push(size);
      remainingTroops -= size;
    }
  }

  // Create each squad with multiple copies of the same troop type
  for (let squadIndex = 0; squadIndex < numSquads; squadIndex++) {
    const squadSize = squadSizes[squadIndex];

    // Pick a random faction and troop type for this squad
    const faction = factionsWithTroops[Math.floor(Math.random() * factionsWithTroops.length)];
    const troopTemplate = faction.troops[Math.floor(Math.random() * faction.troops.length)];

    // Add multiple copies of this troop type to form the squad
    for (let i = 0; i < squadSize; i++) {
      this._troops.push({
        factionId: faction.id,
        name: troopTemplate.name,
        name_it: troopTemplate.name_it,
        hp: troopTemplate.hp,
        mp: troopTemplate.mp,
        atk: troopTemplate.atk,
        def: troopTemplate.def,
        mat: troopTemplate.mat,
        mdf: troopTemplate.mdf,
        agi: troopTemplate.agi,
        luk: troopTemplate.luk,
        role: troopTemplate.role,
        spritename: troopTemplate.spritename,
        spriteindex: troopTemplate.spriteindex
      });
    }
  }
};

Game_AIArmy.prototype.getFactionName = function () {
  if (this._isIndependent) {
    return "indie";
  }

  const faction = $gameFactions.getFaction(this._factionId);
  if (faction) {
    return (typeof armyT === "function") ? armyT(faction.name) : faction.name;
  }

  return T('ArmyEvents.unknownCountry');
};

Game_AIArmy.prototype.getFactionColor = function () {
  if (this._isIndependent) {
    return "#FFFF00"; // Yellow for independent
  }

  // Generate consistent color based on faction ID
  const hue = (this._factionId * 137.508) % 360; // Golden angle for distribution
  return `hsl(${hue}, 70%, 60%)`;
};

//=============================================================================
// Game_AIArmies - Manages all AI armies
//=============================================================================

// Declared up front the way the engine declares its own $game globals, so that a
// reference reaching this before DataManager.createGameObjects sees null rather
// than throwing a ReferenceError.
$gameAIArmies = null;

function Game_AIArmies() {
  this.initialize(...arguments);
}

Game_AIArmies.prototype.initialize = function () {
  this._armies = [];
  this._initialized = false;
};

Game_AIArmies.prototype.initializeArmies = function () {
  if (this._initialized) return;

  // An army is a faction's people under arms, and there are no people and no
  // factions left in an empty world: nothing marches on the world map.
  // See WorldManager.populationMode.
  const WM = window.WorldManager;
  if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return;

  // Find all Army events on world map
  if ($gameMap.mapId() !== ArmyEventsManager.Params.worldMapId) return;

  // Only initialize if player has troops
  if (!$gameArmy || $gameArmy.getTroopCount() === 0) {
    return;
  }

  const events = $gameMap.events();
  const armyEvents = events.filter(e => e && e.event() && e.event().name === "Army");
  const totalArmies = armyEvents.length;

  if (totalArmies === 0) return;

  // Check if we have saved faction army data (returning to map)
  if ($gameSystem._savedFactionArmies && $gameSystem._savedFactionArmies.length > 0) {
    this._restoreAndRegenerateArmies(armyEvents);
    this._initialized = true;
    return;
  }

  // Calculate faction army distribution
  const factionArmyCount = Math.floor(totalArmies * (ArmyEventsManager.Params.factionArmyPercent / 100));

  // Build faction-country pairs
  const allFactions = $gameFactions.getAllFactions();
  const mainFactions = allFactions.filter(f =>
    f.iconIndex &&
    f.troops &&
    f.troops.length > 0 &&
    !f.noStartingTroops
  );

  const factionCountryPairs = [];
  if (window.WorldGen && window.WorldGen.Countries) {
    for (const faction of mainFactions) {
      const countries = window.WorldGen.Countries.filter(
        country => country.faction === faction.name && country.id > 0
      );
      for (const country of countries) {
        factionCountryPairs.push({
          faction: faction,
          countryId: country.id,
          countryName: country.country
        });
      }
    }
  }

  // Calculate army assignments: minimum 3 per faction-country pair
  const minArmiesPerCountry = 3;
  const guaranteedFactionArmies = factionCountryPairs.length * minArmiesPerCountry;
  const extraFactionArmies = Math.max(0, factionArmyCount - guaranteedFactionArmies);

  // Create assignment list
  const factionAssignments = [];
  for (const pair of factionCountryPairs) {
    for (let i = 0; i < minArmiesPerCountry; i++) {
      factionAssignments.push(pair);
    }
  }

  // Add extra faction armies randomly
  for (let i = 0; i < extraFactionArmies; i++) {
    const randomPair = factionCountryPairs[Math.floor(Math.random() * factionCountryPairs.length)];
    factionAssignments.push(randomPair);
  }

  // Shuffle faction assignments
  for (let i = factionAssignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [factionAssignments[i], factionAssignments[j]] = [factionAssignments[j], factionAssignments[i]];
  }


  // Generate armies
  for (let i = 0; i < armyEvents.length; i++) {
    const event = armyEvents[i];
    const army = new Game_AIArmy(event.eventId());

    // Assign army type
    if (i < factionAssignments.length) {
      // Faction army
      const assignment = factionAssignments[i];
      army._generateFactionArmyForCountry(assignment.faction, assignment.countryId);
    } else {
      // Independent army
      army._generateIndependentArmy();
    }

    // Set event graphic based on leader
    const leader = army.getLeader();
    if (leader) {
      event.setImage(leader.spritename, leader.spriteindex);
    }

    // Find random passable position or use current position in debug mode
    if (ArmyEventsManager.Params.debugMode) {
      // Debug mode: use current event position
      army.setPosition(event.x, event.y);
    } else {
      // Normal mode: move to random position
      let pos;
      if (army.isIndependent()) {
        // Independent armies spawn near player (60-tile radius)
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;
        pos = this._findPassablePositionNearPlayer(playerX, playerY, 60);
      } else {
        // Faction armies spawn based on their faction regions
        pos = this._findRandomPassablePosition(army.getValidRegions());
      }
      army.setPosition(pos.x, pos.y);
      event.locate(pos.x, pos.y);
    }

    // Debug logging: Show where army spawned
    const regionId = $gameMap.regionId(army.getPosition().x, army.getPosition().y);
    const countryName = this._getCountryNameFromRegionId(regionId);
    const factionName = army.getFactionName();
    const troopCount = army.getTroopCount();
    const pos = army.getPosition();

    this._armies.push(army);
  }

  // Debug logging: Summary

  // Count armies by faction
  const factionCounts = {};
  let independentCount = 0;

  for (const army of this._armies) {
    if (army.isIndependent()) {
      independentCount++;
    } else {
      const factionName = army.getFactionName();
      factionCounts[factionName] = (factionCounts[factionName] || 0) + 1;
    }
  }

  for (const [faction, count] of Object.entries(factionCounts)) {
  }

  this._initialized = true;
};

Game_AIArmies.prototype._getCountryNameFromRegionId = function (regionId) {
  if (window.WorldGen && window.WorldGen.Countries) {
    const country = window.WorldGen.Countries.find(c => c.id === regionId);
    return country ? country.country : T('ArmyEvents.unknownCountry');
  }
  return T('ArmyEvents.unknownCountry');
};

Game_AIArmies.prototype._findRandomPassablePosition = function (validRegions) {
  const maxAttempts = 1000;
  let attempts = 0;

  // If no valid regions specified, use any passable position
  if (!validRegions || validRegions.length === 0) {
    while (attempts < maxAttempts) {
      const x = Math.floor(Math.random() * $gameMap.width());
      const y = Math.floor(Math.random() * $gameMap.height());

      if ($gameMap.isPassable(x, y, 2) && $gameMap.isPassable(x, y, 4) &&
        $gameMap.isPassable(x, y, 6) && $gameMap.isPassable(x, y, 8)) {
        return { x, y };
      }

      attempts++;
    }
  } else {
    // Find passable position within valid regions
    while (attempts < maxAttempts) {
      const x = Math.floor(Math.random() * $gameMap.width());
      const y = Math.floor(Math.random() * $gameMap.height());

      const regionId = $gameMap.regionId(x, y);

      if (validRegions.includes(regionId) &&
        $gameMap.isPassable(x, y, 2) && $gameMap.isPassable(x, y, 4) &&
        $gameMap.isPassable(x, y, 6) && $gameMap.isPassable(x, y, 8)) {
        return { x, y };
      }

      attempts++;
    }
  }

  // Fallback to center
  return { x: Math.floor($gameMap.width() / 2), y: Math.floor($gameMap.height() / 2) };
};

Game_AIArmies.prototype.getArmyByEventId = function (eventId) {
  return this._armies.find(army => army.getEventId() === eventId);
};

Game_AIArmies.prototype.getAllArmies = function () {
  return this._armies;
};

Game_AIArmies.prototype.restoreArmyPositions = function () {
  if ($gameMap.mapId() !== ArmyEventsManager.Params.worldMapId) return;

  // Only restore faction armies - independent armies will be regenerated
  for (const army of this._armies) {
    if (!army.isIndependent()) {
      const event = $gameMap.event(army.getEventId());
      if (event) {
        const pos = army.getPosition();
        event.locate(pos.x, pos.y);
      }
    }
  }
};

Game_AIArmies.prototype.updateArmyPosition = function (eventId, x, y) {
  const army = this.getArmyByEventId(eventId);
  if (army) {
    army.setPosition(x, y);
  }
};

Game_AIArmies.prototype._restoreAndRegenerateArmies = function (armyEvents) {
  const savedFactionArmies = $gameSystem._savedFactionArmies || [];
  const playerX = $gamePlayer.x;
  const playerY = $gamePlayer.y;


  // Restore faction armies
  let eventIndex = 0;
  for (const savedArmy of savedFactionArmies) {
    if (eventIndex >= armyEvents.length) break;

    const event = armyEvents[eventIndex];
    const army = new Game_AIArmy(event.eventId());

    // Restore faction army data
    army._isIndependent = false;
    army._factionId = savedArmy.factionId;
    army._leader = savedArmy.leader;
    army._troops = savedArmy.troops;
    army._validRegions = savedArmy.validRegions;
    army._x = savedArmy.x;
    army._y = savedArmy.y;

    // Set event graphic
    if (army._leader) {
      event.setImage(army._leader.spritename, army._leader.spriteindex);
    }

    // Restore position
    event.locate(savedArmy.x, savedArmy.y);

    this._armies.push(army);
    eventIndex++;
  }

  // Generate independent armies around player (within 60-tile radius)
  const independentArmyCount = armyEvents.length - savedFactionArmies.length;

  for (let i = eventIndex; i < armyEvents.length; i++) {
    const event = armyEvents[i];
    const army = new Game_AIArmy(event.eventId());

    // Generate independent army
    army._generateIndependentArmy();

    // Set event graphic (independent armies have no leader sprite, use default)
    // Independent armies can keep their default sprite or we could set a generic one

    // Find passable position within 60-tile radius of player
    const pos = this._findPassablePositionNearPlayer(playerX, playerY, 60);
    army.setPosition(pos.x, pos.y);
    event.locate(pos.x, pos.y);

    const regionId = $gameMap.regionId(pos.x, pos.y);
    const countryName = this._getCountryNameFromRegionId(regionId);
    const factionName = T('ArmyEvents.independent');
    const troopCount = army.getTroopCount();

    this._armies.push(army);
  }

  // Debug logging: Summary
};

Game_AIArmies.prototype._findPassablePositionNearPlayer = function (centerX, centerY, radius) {
  const attempts = 100; // Try up to 100 times to find a passable position

  for (let i = 0; i < attempts; i++) {
    // Random angle and distance within radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;

    const x = Math.round(centerX + Math.cos(angle) * distance);
    const y = Math.round(centerY + Math.sin(angle) * distance);

    // Check if position is valid and passable
    if ($gameMap.isValid(x, y) && this._isPositionPassable(x, y)) {
      return { x, y };
    }
  }

  // Fallback: return player position if no passable position found
  console.warn(`[ArmyEventsManager] Could not find passable position within ${radius} tiles of player, using player position`);
  return { x: centerX, y: centerY };
};

Game_AIArmies.prototype._isPositionPassable = function (x, y) {
  // Check if the position is passable in at least one direction
  return (
    $gameMap.isPassable(x, y, 2) ||
    $gameMap.isPassable(x, y, 4) ||
    $gameMap.isPassable(x, y, 6) ||
    $gameMap.isPassable(x, y, 8)
  );
};

Game_AIArmies.prototype.saveFactionArmies = function () {
  if ($gameMap.mapId() !== ArmyEventsManager.Params.worldMapId) return;

  const factionArmies = [];

  for (const army of this._armies) {
    if (!army.isIndependent()) {
      factionArmies.push({
        factionId: army._factionId,
        leader: army._leader,
        troops: army._troops,
        validRegions: army._validRegions,
        x: army._x,
        y: army._y
      });
    }
  }

  $gameSystem._savedFactionArmies = factionArmies;
};

//=============================================================================
// DataManager Integration
//=============================================================================

const _DataManager_createGameObjects_ArmyEvents = DataManager.createGameObjects;
DataManager.createGameObjects = function () {
  _DataManager_createGameObjects_ArmyEvents.call(this);
  $gameAIArmies = new Game_AIArmies();
};

const _DataManager_makeSaveContents_ArmyEvents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function () {
  const contents = _DataManager_makeSaveContents_ArmyEvents.call(this);
  contents.aiArmies = $gameAIArmies;
  return contents;
};

const _DataManager_extractSaveContents_ArmyEvents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function (contents) {
  _DataManager_extractSaveContents_ArmyEvents.call(this, contents);
  $gameAIArmies = contents.aiArmies || new Game_AIArmies();
};

//=============================================================================
// Game_System - Initialize saved faction armies storage
//=============================================================================

const _Game_System_initialize_ArmyEvents = Game_System.prototype.initialize;
Game_System.prototype.initialize = function () {
  _Game_System_initialize_ArmyEvents.call(this);
  this._savedFactionArmies = [];
};

//=============================================================================
// Scene_Map - Initialize and update armies
//=============================================================================

const _Scene_Map_onMapLoaded_ArmyEvents = Scene_Map.prototype.onMapLoaded;
Scene_Map.prototype.onMapLoaded = function () {
  _Scene_Map_onMapLoaded_ArmyEvents.call(this);

  if ($gameMap.mapId() === ArmyEventsManager.Params.worldMapId) {
    $gameAIArmies.initializeArmies();
    $gameAIArmies.restoreArmyPositions();

    // Create army labels after armies are initialized
    if (this._spriteset) {
      this._spriteset.createArmyLabels();
    }
  }
};

//=============================================================================
// Game_Event - Track army movement and add roaming behavior
//=============================================================================

const _Game_Event_locate_ArmyEvents = Game_Event.prototype.locate;
Game_Event.prototype.locate = function (x, y) {
  _Game_Event_locate_ArmyEvents.call(this, x, y);

  if ($gameMap.mapId() === ArmyEventsManager.Params.worldMapId) {
    if (this.event().name === "Army") {
      $gameAIArmies.updateArmyPosition(this.eventId(), x, y);
    }
  }
};

const _Game_Event_update_ArmyEvents = Game_Event.prototype.update;
Game_Event.prototype.update = function () {
  _Game_Event_update_ArmyEvents.call(this);

  if ($gameMap.mapId() === ArmyEventsManager.Params.worldMapId) {
    if (this.event().name === "Army") {
      this.updateArmyMovement();
    }
  }
};

Game_Event.prototype.updateArmyMovement = function () {
  // Only move if player is moving
  if (!$gamePlayer.isMoving()) {
    return;
  }

  // Don't move if already moving
  if (this.isMoving()) {
    return;
  }

  // Random chance to move based on parameter
  if (Math.random() * 100 > ArmyEventsManager.Params.armyMovementChance) {
    return;
  }

  const army = $gameAIArmies.getArmyByEventId(this.eventId());
  if (!army) {
    return;
  }

  // Try to move in a random valid direction
  this.moveArmyRandom(army);
};

Game_Event.prototype.moveArmyRandom = function (army) {
  const directions = [2, 4, 6, 8]; // down, left, right, up
  const validDirections = [];

  // Check which directions are valid
  for (const dir of directions) {
    if (this.canMoveInDirection(dir, army)) {
      validDirections.push(dir);
    }
  }

  // Move in a random valid direction
  if (validDirections.length > 0) {
    const randomDir = validDirections[Math.floor(Math.random() * validDirections.length)];
    this.moveStraight(randomDir);
  }
};

Game_Event.prototype.canMoveInDirection = function (direction, army) {
  const x2 = $gameMap.roundXWithDirection(this.x, direction);
  const y2 = $gameMap.roundYWithDirection(this.y, direction);

  // Check if passable
  if (!$gameMap.isPassable(x2, y2, this.reverseDir(direction))) {
    return false;
  }

  // Check if another event is blocking
  if (this.isCollidedWithEvents(x2, y2)) {
    return false;
  }

  // For faction armies, check if target tile is within valid regions
  if (!army.isIndependent()) {
    const validRegions = army.getValidRegions();
    const targetRegion = $gameMap.regionId(x2, y2);

    if (validRegions.length > 0 && !validRegions.includes(targetRegion)) {
      return false; // Can't move outside faction territory
    }
  }

  return true;
};

//=============================================================================
// Game_Player - Save faction armies when leaving world map
//=============================================================================

const _Game_Player_performTransfer_ArmyEvents = Game_Player.prototype.performTransfer;
Game_Player.prototype.performTransfer = function () {
  const currentMapId = $gameMap.mapId();
  const newMapId = this._newMapId;

  // Save faction armies when leaving world map
  if (currentMapId === ArmyEventsManager.Params.worldMapId && newMapId !== ArmyEventsManager.Params.worldMapId) {
    if ($gameAIArmies) {
      $gameAIArmies.saveFactionArmies();
    }
  }

  // Clear initialized flag when leaving world map so armies reinitialize on return
  if (currentMapId === ArmyEventsManager.Params.worldMapId && newMapId !== ArmyEventsManager.Params.worldMapId) {
    if ($gameAIArmies) {
      $gameAIArmies._initialized = false;
    }
  }

  _Game_Player_performTransfer_ArmyEvents.call(this);
};

//=============================================================================
// Spriteset_Map - Add troop counter sprites
//=============================================================================

const _Spriteset_Map_createCharacters_ArmyEvents = Spriteset_Map.prototype.createCharacters;
Spriteset_Map.prototype.createCharacters = function () {
  _Spriteset_Map_createCharacters_ArmyEvents.call(this);
  // Don't create army labels here - they need to be created after armies are initialized
};

Spriteset_Map.prototype.createArmyLabels = function () {
  this._armyLabelSprites = [];

  // Player troop counter
  const playerLabel = new Sprite_PlayerTroopCounter();
  this._armyLabelSprites.push(playerLabel);
  this._tilemap.addChild(playerLabel);

  // Army event labels
  for (const event of $gameMap.events()) {
    if (event && event.event() && event.event().name === "Army") {
      const army = $gameAIArmies.getArmyByEventId(event.eventId());
      if (army) {
        const label = new Sprite_ArmyLabel(event, army);
        this._armyLabelSprites.push(label);
        this._tilemap.addChild(label);
      }
    }
  }
};

const _Spriteset_Map_update_ArmyEvents = Spriteset_Map.prototype.update;
Spriteset_Map.prototype.update = function () {
  _Spriteset_Map_update_ArmyEvents.call(this);
  this.updateArmyLabels();
};

Spriteset_Map.prototype.updateArmyLabels = function () {
  if (this._armyLabelSprites) {
    for (const sprite of this._armyLabelSprites) {
      sprite.update();
    }
  }
};

//=============================================================================
// Sprite_PlayerTroopCounter - Shows player's troop count
//=============================================================================

function Sprite_PlayerTroopCounter() {
  this.initialize(...arguments);
}

Sprite_PlayerTroopCounter.prototype = Object.create(Sprite.prototype);
Sprite_PlayerTroopCounter.prototype.constructor = Sprite_PlayerTroopCounter;

Sprite_PlayerTroopCounter.prototype.initialize = function () {
  Sprite.prototype.initialize.call(this);
  this.createBitmap();
  this._lastTroopCount = -1;
  this._cachedTroopCount = 0;
  this.z = 7;
};

Sprite_PlayerTroopCounter.prototype.createBitmap = function () {
  this.bitmap = new Bitmap(120, 32);
  this.bitmap.fontSize = 18;
  this.bitmap.outlineWidth = 4;
  this.bitmap.outlineColor = "black";
};

Sprite_PlayerTroopCounter.prototype.update = function () {
  Sprite.prototype.update.call(this);

  const player = $gamePlayer;
  const screenX = player.screenX();
  const screenY = player.screenY() - 24; // On sprite

  this.x = screenX - 60;
  this.y = screenY;

  // Troop/party counts change rarely; poll every 30 frames instead of every
  // frame. Position tracking above stays per-frame for smoothness.
  if (Graphics.frameCount % 30 === 0 || this._lastTroopCount < 0) {
    const troopCount = $gameArmy.getTroopCount();
    const partyCount = $gameParty.members().length;
    const totalCount = troopCount + partyCount;
    this._cachedTroopCount = troopCount;

    if (this._lastTroopCount !== totalCount) {
      this._lastTroopCount = totalCount;
      this.refresh();
    }
  }

  // Hide if no troops are hired
  this.visible = this._cachedTroopCount > 0;
};

Sprite_PlayerTroopCounter.prototype.refresh = function () {
  this.bitmap.clear();

  const text = `${this._lastTroopCount}`;
  this.bitmap.textColor = "#00FF00"; // Green
  this.bitmap.drawText(text, 0, 0, 120, 32, "center");
};


//=============================================================================
// Sprite_ArmyLabel - Shows army info above events
//=============================================================================

function Sprite_ArmyLabel() {
  this.initialize(...arguments);
}

Sprite_ArmyLabel.prototype = Object.create(Sprite.prototype);
Sprite_ArmyLabel.prototype.constructor = Sprite_ArmyLabel;

Sprite_ArmyLabel.prototype.initialize = function (event, army) {
  Sprite.prototype.initialize.call(this);
  this._event = event;
  this._army = army;
  this.createBitmap();
  this.refresh();
  this.z = 7;
};

Sprite_ArmyLabel.prototype.createBitmap = function () {
  this.bitmap = new Bitmap(200, 56);
  this.bitmap.fontSize = 16;
  this.bitmap.outlineWidth = 3;
  this.bitmap.outlineColor = "black";

  // Create icon sprite
  this._iconSprite = new Sprite();
  this._iconSprite.bitmap = ImageManager.loadSystem("IconSet");
  this.addChild(this._iconSprite);
};

Sprite_ArmyLabel.prototype.update = function () {
  Sprite.prototype.update.call(this);

  const screenX = this._event.screenX();
  const screenY = this._event.screenY() - 32; // Above sprite

  this.x = screenX - 100;
  this.y = screenY;
};

Sprite_ArmyLabel.prototype.refresh = function () {
  this.bitmap.clear();

  const troopCount = this._army.getTroopCount();
  const leader = this._army.getLeader();
  const isIndependent = this._army.isIndependent();

  // Get faction info
  let factionIconIndex = 0;
  let leaderName = T('ArmyEvents.unknownLeader');

  if (!isIndependent) {
    const faction = $gameFactions.getFaction(this._army.getFactionId());
    if (faction) {
      // If this is a subfaction, use parent faction's icon
      if (faction.parentHyperpower) {
        const parentPower = $gameFactions.hyperpowerOfFaction(faction);
        if (parentPower) {
          factionIconIndex = $gameFactions.hyperpowerIcon(parentPower.id) || 0;
        } else {
          factionIconIndex = faction.iconIndex || 0;
        }
      } else {
        factionIconIndex = faction.iconIndex || 0;
      }
    }
  }

  // Get leader name
  if (leader) {
    const useItalian = ConfigManager.language === 'it';
    leaderName = useItalian && leader.name_it ? leader.name_it : leader.name;
  } else {
    leaderName = isIndependent ? T('ArmyEvents.independent') : T('ArmyEvents.army');
  }

  // Calculate text width for centering
  const textWidth = this.bitmap.measureTextWidth(leaderName);
  const iconDisplayWidth = 20; // Scaled down icon size
  const iconSpacing = 4; // Space between icon and text
  const hasIcon = !isIndependent && factionIconIndex > 0;
  const totalWidth = hasIcon ? (iconDisplayWidth + iconSpacing + textWidth) : textWidth;

  // Calculate starting X to center everything
  const bitmapWidth = 200;
  const startX = (bitmapWidth - totalWidth) / 2;

  // Draw faction icon (if not independent) - centered
  if (hasIcon) {
    this._iconSprite.visible = true;
    const iconWidth = 32;
    const iconHeight = 32;
    const sx = (factionIconIndex % 16) * iconWidth;
    const sy = Math.floor(factionIconIndex / 16) * iconHeight;

    this._iconSprite.setFrame(sx, sy, iconWidth, iconHeight);
    // Scale down to 20x20
    this._iconSprite.scale.x = 0.625;
    this._iconSprite.scale.y = 0.625;
    this._iconSprite.x = startX;
    this._iconSprite.y = 2;
  } else {
    this._iconSprite.visible = false;
  }

  // Draw leader name (centered, next to icon if present)
  const textX = hasIcon ? (startX + iconDisplayWidth + iconSpacing) : startX;
  this.bitmap.textColor = "#FFFFFF";
  this.bitmap.drawText(leaderName, textX, 0, textWidth, 24, "left");

  // Draw troop count (just the number, centered below)
  this.bitmap.fontSize = 20;
  this.bitmap.textColor = "#FFFF00"; // Yellow
  this.bitmap.drawText(`${troopCount}`, 0, 28, 200, 28, "center");
  this.bitmap.fontSize = 16; // Reset font size
};
