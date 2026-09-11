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
 * CAMPAIGN ARMIES (window.ArmyCampaign)
 * Beside the roaming "Army" events above, the world map carries one marching
 * army per hyperpower plus a handful of private columns, each led by a LIVING
 * main player out of the book of leaders (NPCPolitics). They stand under
 * crossed swords, apart from the adventure "???" plates and Eris's heart, and
 * walking into one offers three things: Empathize with the leader, ask for a
 * parlay, or attack it with the party's own army. A main player's state army
 * is the big one; a leader out of office fields a few hundred.
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

//=============================================================================
// CAMPAIGN ARMIES - the marching armies of the powers, on the world map
//=============================================================================
// The world map already carried two kinds of marker: the "???" plate of an
// unplayed adventure and Eris's heart, both drawn by WorldMapReturn out of
// ProceduralAdventureSystem. This is the third, and it is a real event rather
// than a plate: crossed swords standing over the square an army is camped on,
// walking the map with it.
//
// WHO LEADS ONE
// Every army out here is led by a living main player: a politician the book of
// leaders wrote down (Leaders.json, seated by NPCPolitics, so `leaderId` is
// set) and who is still alive on the day the armies are rolled. Nobody else
// raises one, so the field is the century's actual cast rather than a bag of
// invented names.
//
//   - The seated head of a hyperpower marches that power's own army, and a
//     main player's army is the bigger one: a state fields thousands.
//   - Any other living recorded leader - a party leader out of office, a
//     figure between posts - marches an INDEPENDENT army, a few hundred at
//     most, and roams wherever it likes rather than keeping to a border.
//
// WHAT YOU CAN DO WITH ONE
// Walking into one asks three questions and never starts a fight on its own:
//   - Empathize with its leader, which is the ordinary Empathize panel opened
//     on that leader's own article (NPCEmpathize).
//   - Ask for a parlay, answered by what the power thinks of the party, what
//     kind of person the leader is and how big the party's own army is: safe
//     passage, a demand, or a refusal.
//   - Attack it, which is the field battle (ArmyBattleView) with the party's
//     own troops against theirs.
//
// The roster is rolled once a day from the world seed, so every savegame of a
// world sees the same armies in the same places on the same date, and it is
// kept in the world's own system data along with the ground they have covered
// since.
//=============================================================================

(() => {
  "use strict";

  const T = (key, args) => (typeof window.T === "function" ? window.T(key, args) : key);

  const EVENT_PREFIX = "ArmyMarch:";        // i18n-ignore  event name key
  const SWORD_ICON = 322;                   // IconSet: Longsword (js/db/Sprites/Icons.json)
  const MARKER_COLOR = "#ffb3b3";
  // A power's own army against a leader's private one.
  const POWER_ARMY_MIN = 800;
  const POWER_ARMY_MAX = 3000;
  const INDEPENDENT_ARMY_MIN = 60;
  const INDEPENDENT_ARMY_MAX = 400;
  const MAX_INDEPENDENT_ARMIES = 6;
  // A parlay is answered once per army per day: an answer the party did not
  // like is not a thing to ask again five seconds later.
  const PARLAY_COOLDOWN_DAYS = 1;

  // i18n-ignore-start  sprite sheets (img/characters/NPCs, one character each)
  const POWER_SPRITES = ["NPCs/!$ValiantKnight1", "NPCs/!$GeniusGeneral1", "NPCs/!$GeniusGeneral2"];
  const INDEPENDENT_SPRITES = ["NPCs/!$WanderingKnight1", "NPCs/!$WastelandKnight1", "NPCs/!$OrcWarrior1"];
  // i18n-ignore-end

  const WORLD_MAP_ID = () => ArmyEventsManager.Params.worldMapId;

  //---------------------------------------------------------------------------
  // The day, and a seeded roll of it
  //---------------------------------------------------------------------------
  function nowMinutes() {
    const clock = window.TimeDateSystem;
    if (clock && typeof clock.getGameTimeMinutes === "function") return clock.getGameTimeMinutes();
    return (typeof $gameVariables !== "undefined" && $gameVariables) ? $gameVariables.value(114) : 0;
  }

  function dayIndex() { return Math.floor(nowMinutes() / 1440); }

  function worldSeed() {
    const U = window.ProcGenUtils;
    try { return U && U.getWorldSeed ? String(U.getWorldSeed()) : "esoteric"; }  // i18n-ignore  default seed
    catch (e) { return "esoteric"; }  // i18n-ignore  default seed
  }

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function irange(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  //---------------------------------------------------------------------------
  // What an army is MADE OF, what it costs and how it feels about it
  //---------------------------------------------------------------------------
  // A campaign army used to be a single number, `troopCount`, and a number is
  // not a thing you can read an article about. Every army now carries the same
  // three answers the party's own army carries (ArmyManager: a formation, a
  // weekly upkeep and a coherence) plus the one the battlefield always had and
  // the roster never did: morale.
  //
  //   FORMATION  the troop types under the standard, each with the drill it
  //              fights in (Factions.json `formation`) and how many stand in
  //              it. Rolled from the leading faction's own roster, seeded off
  //              the army id, so it is the same column in every savegame.
  //   UPKEEP     the sum of the roster's weekly costs, in cents, exactly the
  //              way the party pays for its own troops.
  //   COHERENCE  the share of the column that fights under its largest single
  //              type, which is Game_Army.getCoherence's own question.
  //   MORALE     what that column is worth on the day. A state army under a
  //              charismatic seated head is a confident one; a private column
  //              of expensive mixed hirelings is not.

  // Any dotted key on faction data ("factions.x.troops.y.name") read through
  // the faction data set's own translator, which already has the language
  // loaded. Anything that is not a key path passes through untouched.
  function factionText(key) {
    if (!key) return "";
    const s = String(key);
    if (s.indexOf(".") < 0) return s;
    try {
      const inst = window.FactionDataManager && window.FactionDataManager.instance;
      return (inst && typeof inst.t === "function") ? inst.t(s) : s;
    } catch (e) { return s; }
  }

  // The roster an army recruits out of: its own faction's, or - for a leader
  // whose power fields no troops of its own - whatever the world has.
  function troopPoolFor(army) {
    if (typeof $gameFactions === "undefined" || !$gameFactions) return [];
    const faction = (army.factionId !== null && army.factionId !== undefined)
      ? $gameFactions.getFaction(army.factionId) : null;
    if (faction && faction.troops && faction.troops.length) return faction.troops;
    const all = $gameFactions.getAllFactions() || [];
    const any = all.find(f => f && f.troops && f.troops.length);
    return any ? any.troops : [];
  }

  // The column itself: three to six troop types, the biggest of them the core
  // of the line, the rest thinning out behind it.
  function rollFormation(army) {
    const pool = troopPoolFor(army);
    if (!pool.length) return [];
    const rng = mulberry32(hashStr(worldSeed() + ":troops:" + army.id));
    const types = [];
    const taken = new Set();
    const wanted = Math.min(pool.length, irange(rng, 3, 6));
    while (types.length < wanted) {
      const i = irange(rng, 0, pool.length - 1);
      if (taken.has(i)) continue;
      taken.add(i);
      types.push(pool[i]);
    }
    // Weights that fall away from the head of the column, so a formation reads
    // as a line with support behind it rather than as an even split.
    const weights = types.map((_, i) => (1 / (i + 1)) * (0.75 + rng() * 0.5));
    const total = weights.reduce((a, b) => a + b, 0);
    const groups = [];
    let placed = 0;
    for (let i = 0; i < types.length; i++) {
      const troop = types[i];
      const last = i === types.length - 1;
      let count = last
        ? army.troopCount - placed
        : Math.round(army.troopCount * (weights[i] / total));
      count = Math.max(1, count);
      if (!last && placed + count >= army.troopCount) break;
      placed += count;
      groups.push({
        name: troop.name,
        formation: troop.formation,
        role: troop.role,
        weeklyCost: Number(troop.weeklyCost) || 0,
        count,
      });
    }
    if (!groups.length) return [];
    // Rounding never gets to change how many are under arms.
    const drift = army.troopCount - groups.reduce((s, g) => s + g.count, 0);
    groups[0].count = Math.max(1, groups[0].count + drift);
    return groups;
  }

  function upkeepOf(groups) {
    return (groups || []).reduce((sum, g) => sum + g.count * (Number(g.weeklyCost) || 0), 0);
  }

  // The same question Game_Army.getCoherence asks of the party's own troops:
  // what share of the column fights under one standard.
  function coherenceOf(groups, troopCount) {
    if (!groups || !groups.length || !troopCount) return 100;
    const biggest = Math.max.apply(null, groups.map(g => g.count));
    return Math.floor((biggest / troopCount) * 100);
  }

  // Morale, rolled fresh with the roster each day.
  function moraleOf(army, groups, rng) {
    let morale = 45;
    morale += (Number(army.charisma) || 50) * 0.25;           // who is leading it
    morale += army.kind === "power" ? 12 : 0;                  // a state pays on time
    morale += (coherenceOf(groups, army.troopCount) - 50) * 0.12;
    // A column that costs more per head than a line soldier is worth is a
    // column of expensive specialists holding a line they cannot hold.
    const perHead = army.troopCount ? upkeepOf(groups) / army.troopCount : 0;
    if (perHead > 12000) morale -= 8;
    morale += (rng ? rng() : 0.5) * 10 - 5;
    return Math.max(5, Math.min(100, Math.round(morale)));
  }

  // Everything above, stamped onto a freshly rolled army record.
  function describeArmy(army, rng) {
    army.formation = rollFormation(army);
    army.upkeep = upkeepOf(army.formation);
    army.coherence = coherenceOf(army.formation, army.troopCount);
    army.morale = moraleOf(army, army.formation, rng);
    return army;
  }

  // The party's own army answered in the shape of a campaign record, so the
  // wiki can list it beside the powers' columns without a second reader.
  function playerArmy() {
    if (typeof $gameArmy === "undefined" || !$gameArmy) return null;
    const troops = $gameArmy.getTroops() || [];
    if (!troops.length) return null;
    const byType = new Map();
    for (const t of troops) {
      const key = String(t.name) + "|" + String(t.formation);
      if (!byType.has(key)) {
        byType.set(key, {
          name: t.name, formation: t.formation, role: t.role,
          weeklyCost: Number(t.weeklyCost) || 0, count: 0,
        });
      }
      byType.get(key).count++;
    }
    const leader = (typeof $gameParty !== "undefined" && $gameParty && $gameParty.leader && $gameParty.leader()) || null;
    return {
      id: "party",                                   // i18n-ignore  record key
      kind: "party",                                 // i18n-ignore  record key
      powerName: null,
      factionId: null,
      leaderName: leader ? leader.name() : "",
      troopCount: troops.length,
      formation: Array.from(byType.values()).sort((a, b) => b.count - a.count),
      upkeep: $gameArmy.getTotalWeeklyCost(),
      coherence: $gameArmy.getCoherence(),
      morale: typeof $gameArmy.getMorale === "function" ? $gameArmy.getMorale() : 100,
    };
  }

  // Every column standing today, the party's own included, biggest first.
  function listArmies(opts) {
    const out = roll().slice();
    if (!opts || opts.includeParty !== false) {
      const own = playerArmy();
      if (own) out.push(own);
    }
    return out.sort((a, b) => b.troopCount - a.troopCount);
  }

  // The columns a given leader holds, by the name their article is written
  // under. A seated head holds their power's army; anybody else holds their
  // own, and somebody who holds neither holds nothing.
  function armiesOfLeader(name) {
    if (!name) return [];
    const wanted = String(name).trim().toLowerCase();
    return roll().filter(a => String(a.leaderName || "").trim().toLowerCase() === wanted);
  }

  // The columns a hyperpower has in the field, by the name its article is
  // written under. The party's own column belongs to nobody and is never in
  // here; a power whose head holds no army answers with an empty list.
  function armiesOfPower(name) {
    if (!name) return [];
    const wanted = String(name).trim().toLowerCase();
    return roll().filter(a => String(a.powerName || "").trim().toLowerCase() === wanted);
  }

  //---------------------------------------------------------------------------
  // The cast: living main players, and which of them is seated
  //---------------------------------------------------------------------------
  // A politician counts as a MAIN PLAYER when the book of leaders wrote them
  // down: `leaderId` is the record NPCPolitics seated them from. An invented
  // party functionary has none, and does not raise an army. Neither does a
  // dead one, however famous: the roster is rolled from the living.
  function livingMainPlayers() {
    const P = window.NPCPolitics;
    if (!P || !P.listPowers) return [];
    const out = [];
    for (const powerName of P.listPowers()) {
      const power = P.getPower(powerName);
      if (!power || !power.politicians) continue;
      for (const id of Object.keys(power.politicians)) {
        const pol = power.politicians[id];
        if (!pol || !pol.alive || !pol.leaderId) continue;
        out.push({
          id: pol.id,
          name: pol.name,
          leaderId: pol.leaderId,
          powerName: power.name || powerName,
          seated: String(power.headId) === String(pol.id),
          charisma: Number(pol.charisma) || 50,
          cunning: Number(pol.cunning) || 50,
        });
      }
    }
    return out;
  }

  // The faction a power fields its army under, and the world-map regions that
  // power holds TODAY (the simulation's map, not the static table).
  function factionOfPower(powerName) {
    if (typeof $gameFactions === "undefined" || !$gameFactions) return null;
    const factions = $gameFactions.getAllFactions() || [];
    return factions.find(f => f && f.parentHyperpower === powerName && f.troops && f.troops.length)
      || factions.find(f => f && f.name === powerName && f.troops && f.troops.length)
      || null;
  }

  function regionsOfPower(powerName) {
    const countries = (window.WorldGen && window.WorldGen.Countries) || [];
    if (!countries.length || typeof $gameFactions === "undefined" || !$gameFactions) return [];
    const byName = {};
    for (const c of countries) if (c && c.id > 0) byName[c.country] = c.id;
    return ($gameFactions.countriesOfHyperpower(powerName) || [])
      .map(name => byName[name])
      .filter(id => id > 0);
  }

  // WHO MAY NOT COMMAND
  // Two offices keep their holder off a horse. A power's seated head is the
  // government, not a general: a state that puts its head of state at the front
  // of its own field army has no head of state. And the moral guide the century
  // seated over it (HistorySimulator's holy leaders) commands nothing at all -
  // that is the whole point of the office. The state's army therefore marches
  // under one of the power's OTHER recorded leaders, and a power with nobody
  // left to give it to fields no army that day.
  function moralLeaderNames() {
    const names = new Set();
    try {
      const hm = window.HistoryManager;
      const holy = hm && (hm._currentHolyLeaders || (hm._histField && hm._histField("holyLeaders", {})));
      for (const leader of Object.values(holy || {})) {
        if (leader && leader.name) names.add(String(leader.name));
      }
    } catch (e) { /* the century was never run */ }
    return names;
  }

  //---------------------------------------------------------------------------
  // The roster
  //---------------------------------------------------------------------------
  function state() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._armyCampaign) $gameSystem._armyCampaign = { day: -1, armies: [] };
    return $gameSystem._armyCampaign;
  }

  function roll() {
    const s = state();
    if (!s) return [];
    const day = dayIndex();
    if (s.day === day && Array.isArray(s.armies) && s.armies.length) return s.armies;

    const rng = mulberry32(hashStr(worldSeed() + ":armies:" + day));
    const moral = moralLeaderNames();
    const cast = livingMainPlayers().filter(l => !moral.has(l.name));
    const armies = [];

    // One army per power that still has a living head - the state stands - but
    // the head does not ride out with it: it is given to another of the power's
    // recorded leaders, and a power with nobody else to give it to fields none.
    const commanders = [];
    for (const head of cast.filter(l => l.seated)) {
      const bench = cast.filter(l => !l.seated && l.powerName === head.powerName);
      if (!bench.length) continue;
      commanders.push(bench[irange(rng, 0, bench.length - 1)]);
    }
    for (const leader of commanders) {
      const faction = factionOfPower(leader.powerName);
      armies.push({
        id: "pw:" + leader.powerName + ":" + leader.id,   // i18n-ignore  record key
        kind: "power",                                     // i18n-ignore  record key
        powerName: leader.powerName,
        factionId: faction ? faction.id : null,
        leaderName: leader.name,
        leaderId: leader.leaderId,
        charisma: leader.charisma,
        cunning: leader.cunning,
        troopCount: irange(rng, POWER_ARMY_MIN, POWER_ARMY_MAX),
        sprite: POWER_SPRITES[irange(rng, 0, POWER_SPRITES.length - 1)],
        x: -1, y: -1, parlayDay: -1,
      });
      describeArmy(armies[armies.length - 1], rng);
      assignOrders(armies[armies.length - 1], rng);
    }

    // And a handful of private ones, from the leaders who hold no seat today and
    // were not handed their power's own army.
    const loose = cast.filter(l => !l.seated && !commanders.some(c => c.id === l.id));
    for (let i = loose.length - 1; i > 0; i--) {
      const j = irange(rng, 0, i);
      const t = loose[i]; loose[i] = loose[j]; loose[j] = t;
    }
    for (const leader of loose.slice(0, MAX_INDEPENDENT_ARMIES)) {
      const faction = factionOfPower(leader.powerName);
      armies.push({
        id: "in:" + leader.powerName + ":" + leader.id,   // i18n-ignore  record key
        kind: "independent",                               // i18n-ignore  record key
        powerName: leader.powerName,
        factionId: faction ? faction.id : null,
        leaderName: leader.name,
        leaderId: leader.leaderId,
        charisma: leader.charisma,
        cunning: leader.cunning,
        troopCount: irange(rng, INDEPENDENT_ARMY_MIN, INDEPENDENT_ARMY_MAX),
        sprite: INDEPENDENT_SPRITES[irange(rng, 0, INDEPENDENT_SPRITES.length - 1)],
        x: -1, y: -1, parlayDay: -1,
      });
      describeArmy(armies[armies.length - 1], rng);
      assignOrders(armies[armies.length - 1], rng);
    }

    s.day = day;
    s.armies = armies;
    // A new day is a new board: every column is stood up somewhere else, the
    // way the adventure plates and Eris's square are laid again each morning.
    s.lastSim = nowMinutes();
    return armies;
  }

  function armyById(id) {
    const s = state();
    return s ? (s.armies || []).find(a => a.id === id) || null : null;
  }


  //---------------------------------------------------------------------------
  // WHAT AN ARMY IS DOING TODAY
  //---------------------------------------------------------------------------
  // The roster used to be a list of camps that wandered a step at a time in no
  // particular direction. An army now has ORDERS, and the orders are the thing
  // the map, the marker and the article all read:
  //
  //   patrolling   walking the ground its power holds, or - for a private
  //                column - whatever ground it happens to be on
  //   garrisoned   sitting on a city. A power's army garrisons a city inside
  //                its own borders; a private column garrisons an independent
  //                one, a city no hyperpower holds
  //   marching     crossing the map towards another city
  //   reinforcing  marching towards a friendly column that is in the field
  //   battling     standing against a hostile column, losing people every hour
  //   retreating   beaten, walking away from whoever beat it
  //
  // The orders are rolled with the roster, once a day, so the armies are
  // shuffled every morning exactly as the adventure plates and Eris's square
  // are. They are then SIMULATED while the party walks: a step on the world map
  // is time passing, and time passing is armies marching, arriving, meeting and
  // fighting whether or not anybody is watching.
  //
  // None of it happens at all until the party has an army of its own. A player
  // with no troops has nothing to do with a marching column but be run over by
  // it, so for them the map stays as it was.

  // i18n-ignore-start  record keys
  const STATUS_PATROL = "patrolling";
  const STATUS_GARRISON = "garrisoned";
  const STATUS_MARCH = "marching";
  const STATUS_REINFORCE = "reinforcing";
  const STATUS_BATTLE = "battling";
  const STATUS_RETREAT = "retreating";
  // i18n-ignore-end

  // One simulated move per this many minutes of game time.
  const SIM_MINUTES = 15;
  // ...and never more than this many catch-up moves in one go, so a night's
  // sleep does not spend a second walking every column across the map.
  const SIM_MAX_STEPS = 32;
  const GARRISON_MIN_HOURS = 6;
  const GARRISON_MAX_HOURS = 30;
  const CITY_BIOME_RE = /city|town|village|burg|metropol/i;

  // Has the party an army of its own? Everything below is switched off when it
  // has not.
  function partyHasArmy() {
    return typeof $gameArmy !== "undefined" && !!$gameArmy && $gameArmy.getTroopCount() > 0;
  }

  // The biome painted on a world-map square, which is how a city is recognised
  // out here: the world map has no settlement table, it has ground.
  function worldBiomeAt(x, y) {
    try {
      const U = window.ProcGenUtils;
      if (!U || !U.classifyWorldColumn) return "";
      return U.classifyWorldColumn(z => $gameMap.tileId(x, y, z)).biome || "";
    } catch (e) { return ""; }
  }

  function isCityTile(x, y) {
    return CITY_BIOME_RE.test(worldBiomeAt(x, y));
  }

  // The regions no hyperpower holds: where a private column is welcome and a
  // state army is not.
  function independentRegions() {
    const countries = (window.WorldGen && window.WorldGen.Countries) || [];
    if (!countries.length || typeof $gameFactions === "undefined" || !$gameFactions) return [];
    const held = new Set();
    const P = window.NPCPolitics;
    const powers = (P && P.listPowers) ? P.listPowers() : [];
    for (const name of powers) {
      for (const country of ($gameFactions.countriesOfHyperpower(name) || [])) held.add(country);
    }
    return countries.filter(c => c && c.id > 0 && !held.has(c.country)).map(c => c.id);
  }

  // The ground an army may stand on: its power's, or - for a private column -
  // the ground no power claims, falling back to the whole map when the world
  // knows of no such ground.
  function groundOf(army) {
    if (army.kind === "power") return regionsOfPower(army.powerName);
    const free = independentRegions();
    return free.length ? free : [];
  }

  // A city on that ground, hunted for from a seeded offset so two armies of one
  // power do not pile onto the same gate.
  function findCityFor(army, rng) {
    if (typeof $gameMap === "undefined" || !$gameMap) return null;
    const regions = groundOf(army);
    const w = $gameMap.width(), h = $gameMap.height();
    for (let attempt = 0; attempt < 900; attempt++) {
      const x = irange(rng, 0, w - 1);
      const y = irange(rng, 0, h - 1);
      if (!passableAt(x, y)) continue;
      if (regions.length && !regions.includes($gameMap.regionId(x, y))) continue;
      if (!isCityTile(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // The orders an army wakes up with. A state army mostly sits on its cities; a
  // private column mostly moves.
  function assignOrders(army, rng) {
    army.status = STATUS_PATROL;
    army.targetX = -1;
    army.targetY = -1;
    army.engagedWith = null;
    army.holdUntil = -1;
    army.startCount = army.troopCount;
    const roll = rng ? rng() : Math.random();
    const wantsCity = army.kind === "power" ? roll < 0.65 : roll < 0.55;
    if (!wantsCity) return army;
    const city = findCityFor(army, rng || mulberry32(hashStr(army.id)));
    if (!city) return army;
    // Standing on the gate already is a garrison; anywhere else is a march to
    // it, and the march is the thing the marker will say it is doing.
    if (army.x === city.x && army.y === city.y) {
      army.status = STATUS_GARRISON;
      army.holdUntil = nowMinutes() + irange(rng, GARRISON_MIN_HOURS, GARRISON_MAX_HOURS) * 60;
    } else {
      army.status = STATUS_MARCH;
      army.targetX = city.x;
      army.targetY = city.y;
    }
    return army;
  }

  // Who fights whom. Two columns of one power never come to blows; a private
  // column will raid anybody; two powers fight when the day says they do, which
  // is a seeded answer so both savegames of a world see the same war.
  function hostile(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if (a.powerName && a.powerName === b.powerName && a.kind === b.kind) return false;
    if (a.kind !== "power" || b.kind !== "power") return true;
    const pair = [a.powerName, b.powerName].sort().join("|");   // i18n-ignore  record key
    return mulberry32(hashStr(worldSeed() + ":war:" + pair + ":" + dayIndex()))() < 0.35;
  }

  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  // One step of one army towards a square, taken on the roster rather than on
  // the map: the placed event walks the same way on its own update.
  function stepTowards(army, tx, ty) {
    if (typeof $gameMap === "undefined" || !$gameMap) return;
    const dx = tx - army.x, dy = ty - army.y;
    if (!dx && !dy) return;
    const tryMove = (nx, ny) => {
      if (!passableAt(nx, ny)) return false;
      army.x = nx; army.y = ny;
      return true;
    };
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (tryMove(army.x + Math.sign(dx), army.y)) return;
      if (dy && tryMove(army.x, army.y + Math.sign(dy))) return;
    } else {
      if (tryMove(army.x, army.y + Math.sign(dy))) return;
      if (dx && tryMove(army.x + Math.sign(dx), army.y)) return;
    }
  }

  function wander(army, rng) {
    const regions = groundOf(army);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const start = irange(rng, 0, 3);
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = dirs[(start + i) % 4];
      const nx = army.x + dx, ny = army.y + dy;
      if (!passableAt(nx, ny)) continue;
      if (regions.length && !regions.includes($gameMap.regionId(nx, ny))) continue;
      army.x = nx; army.y = ny;
      return;
    }
  }

  // An hour of a field battle: both columns lose people to the other's weight
  // and morale, and the one that breaks first walks away. Nobody is deleted
  // where the party could have walked in on it: a broken army retreats, and
  // only a column that is fought down to nothing leaves the roster.
  function battleTick(a, b, rng) {
    const power = army => Math.max(1, army.troopCount * (0.5 + army.morale / 200));
    const lossA = Math.max(1, Math.round(power(b) * 0.02 * (0.6 + rng() * 0.8)));
    const lossB = Math.max(1, Math.round(power(a) * 0.02 * (0.6 + rng() * 0.8)));
    a.troopCount = Math.max(0, a.troopCount - lossA);
    b.troopCount = Math.max(0, b.troopCount - lossB);
    a.morale = Math.max(0, a.morale - lossA / Math.max(1, a.startCount || a.troopCount) * 100 * 0.6 - 1);
    b.morale = Math.max(0, b.morale - lossB / Math.max(1, b.startCount || b.troopCount) * 100 * 0.6 - 1);
    for (const army of [a, b]) {
      army.formation = trimFormation(army);
      army.upkeep = upkeepOf(army.formation);
      army.coherence = coherenceOf(army.formation, army.troopCount);
    }
    const broke = army => army.troopCount <= 0 ||
      army.morale < 20 || army.troopCount < (army.startCount || army.troopCount) * 0.35;
    if (broke(a) || broke(b)) {
      const beaten = broke(a) ? a : b;
      const winner = beaten === a ? b : a;
      disengage(a, b);
      if (beaten.troopCount > 0) {
        beaten.status = STATUS_RETREAT;
        beaten.holdUntil = nowMinutes() + 6 * 60;
        beaten.targetX = beaten.x + Math.sign(beaten.x - winner.x) * 8;
        beaten.targetY = beaten.y + Math.sign(beaten.y - winner.y) * 8;
      }
      winner.status = STATUS_PATROL;
      winner.startCount = winner.troopCount;
    }
  }

  // The column after its losses: the formation is thinned from the back, so an
  // army that has been fought over a day loses its support before its line.
  function trimFormation(army) {
    const groups = (army.formation || []).map(g => Object.assign({}, g));
    let over = groups.reduce((s, g) => s + g.count, 0) - army.troopCount;
    for (let i = groups.length - 1; i >= 0 && over > 0; i--) {
      const take = Math.min(groups[i].count, over);
      groups[i].count -= take;
      over -= take;
    }
    return groups.filter(g => g.count > 0);
  }

  function disengage(a, b) {
    a.engagedWith = null;
    b.engagedWith = null;
  }

  function armiesLeft() {
    const s = state();
    return s ? (s.armies || []) : [];
  }

  // One simulated move for every column on the board.
  function simStep(stepIndex) {
    const armies = armiesLeft();
    const now = nowMinutes();
    for (const army of armies) {
      const rng = mulberry32(hashStr(worldSeed() + ":sim:" + army.id + ":" + now + ":" + stepIndex));
      if (army.troopCount <= 0) continue;
      switch (army.status) {
        case STATUS_BATTLE: {
          const foe = armyById(army.engagedWith);
          if (!foe || foe.troopCount <= 0) { army.engagedWith = null; army.status = STATUS_PATROL; break; }
          if (foe.id < army.id) break;                  // resolved once, by one of the two
          battleTick(army, foe, rng);
          break;
        }
        case STATUS_RETREAT:
          if (now >= army.holdUntil) { army.status = STATUS_PATROL; army.startCount = army.troopCount; }
          else stepTowards(army, army.targetX, army.targetY);
          break;
        case STATUS_GARRISON:
          if (now >= army.holdUntil) assignOrders(army, rng);
          break;
        case STATUS_REINFORCE: {
          const friend = armyById(army.engagedWith);
          if (!friend || friend.status !== STATUS_BATTLE) { army.engagedWith = null; army.status = STATUS_PATROL; break; }
          if (distance(army, friend) <= 1) {
            // The column arrives and is folded into the fight it came for.
            friend.troopCount += army.troopCount;
            friend.formation = (friend.formation || []).concat(army.formation || []);
            friend.upkeep = upkeepOf(friend.formation);
            friend.morale = Math.min(100, friend.morale + 8);
            army.troopCount = 0;
          } else {
            stepTowards(army, friend.x, friend.y);
          }
          break;
        }
        case STATUS_MARCH:
          if (army.targetX < 0 || (army.x === army.targetX && army.y === army.targetY)) {
            army.status = STATUS_GARRISON;
            army.holdUntil = now + irange(rng, GARRISON_MIN_HOURS, GARRISON_MAX_HOURS) * 60;
          } else {
            stepTowards(army, army.targetX, army.targetY);
          }
          break;
        default:
          // Patrolling: a step somewhere legal, and now and then a reason to be
          // somewhere else instead.
          if (rng() < 0.08) assignOrders(army, rng);
          else wander(army, rng);
          break;
      }
    }

    // Who has walked into whom. A column already fighting is not pulled into a
    // second fight, and a friend nearby marches to the sound of the guns.
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.troopCount <= 0) continue;
      for (let j = i + 1; j < armies.length; j++) {
        const b = armies[j];
        if (b.troopCount <= 0 || distance(a, b) > 1) continue;
        if (a.status === STATUS_BATTLE || b.status === STATUS_BATTLE) continue;
        if (!hostile(a, b)) continue;
        a.status = b.status = STATUS_BATTLE;
        a.engagedWith = b.id;
        b.engagedWith = a.id;
        a.startCount = a.troopCount;
        b.startCount = b.troopCount;
      }
    }
    for (const army of armies) {
      if (army.status !== STATUS_PATROL && army.status !== STATUS_GARRISON) continue;
      const friend = armies.find(o => o.status === STATUS_BATTLE && o.troopCount > 0 &&
        o.powerName === army.powerName && o.id !== army.id && distance(o, army) < 40);
      if (!friend) continue;
      army.status = STATUS_REINFORCE;
      army.engagedWith = friend.id;
    }

    // A column fought down to nothing is off the board.
    const s = state();
    if (s) s.armies = armies.filter(a => a.troopCount > 0);
  }

  // Time passing is the thing that moves them, and on the world map time passes
  // because the party walks. Called from Game_Player.increaseSteps.
  function simulate() {
    if (!partyHasArmy()) return 0;
    const s = state();
    if (!s) return 0;
    roll();
    const now = nowMinutes();
    if (typeof s.lastSim !== "number" || s.lastSim > now) { s.lastSim = now; return 0; }
    let steps = Math.floor((now - s.lastSim) / SIM_MINUTES);
    if (steps <= 0) return 0;
    s.lastSim = now;
    steps = Math.min(steps, SIM_MAX_STEPS);
    for (let i = 0; i < steps; i++) simStep(i);
    syncPlacedEvents();
    return steps;
  }

  // The events standing on the world map follow the roster they were placed
  // from: an army the simulation walked ten squares while the party was in a
  // dungeon is standing ten squares away when they come out.
  function syncPlacedEvents() {
    if (typeof $gameMap === "undefined" || !$gameMap) return;
    for (const ev of placedEvents) {
      const army = armyById(ev._armyCampaignId);
      if (!army) { ev.erase(); continue; }
      if (army.troopCount <= 0) { ev.erase(); continue; }
      if (Math.abs(ev.x - army.x) + Math.abs(ev.y - army.y) > 2) ev.locate(army.x, army.y);
    }
  }

  //---------------------------------------------------------------------------
  // Standing them on the map
  //---------------------------------------------------------------------------
  function passableAt(x, y) {
    return $gameMap.isPassable(x, y, 2) && $gameMap.isPassable(x, y, 4) &&
      $gameMap.isPassable(x, y, 6) && $gameMap.isPassable(x, y, 8);
  }

  // A power's army camps inside its own borders; a private one camps anywhere.
  // The spot is seeded off the army and the day, so it is the same spot in
  // every savegame of the world until the roster is rolled again.
  function findCamp(army) {
    const rng = mulberry32(hashStr(worldSeed() + ":camp:" + army.id + ":" + dayIndex()));
    const regions = army.kind === "power" ? regionsOfPower(army.powerName) : [];
    const w = $gameMap.width(), h = $gameMap.height();
    for (let attempt = 0; attempt < 600; attempt++) {
      const x = irange(rng, 0, w - 1);
      const y = irange(rng, 0, h - 1);
      if (!passableAt(x, y)) continue;
      if (regions.length && !regions.includes($gameMap.regionId(x, y))) continue;
      return { x, y };
    }
    // A power that holds nothing the map knows still has to stand somewhere.
    for (let attempt = 0; attempt < 600; attempt++) {
      const x = irange(rng, 0, w - 1);
      const y = irange(rng, 0, h - 1);
      if (passableAt(x, y)) return { x, y };
    }
    return { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  }

  function makeEventData(army, x, y) {
    return {
      id: 0,
      name: EVENT_PREFIX + army.id,
      note: "",
      x, y,
      pages: [{
        conditions: {
          actorId: 1, actorValid: false, itemId: 1, itemValid: false,
          selfSwitchCh: "A", selfSwitchValid: false, switch1Id: 1, switch1Valid: false,
          switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0,
        },
        directionFix: false,
        image: { characterIndex: 0, characterName: army.sprite, direction: 2, pattern: 1, tileId: 0 },
        list: [{ code: 0, indent: 0, parameters: [] }],
        moveFrequency: 3,
        moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: true, wait: false },
        moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false, through: false,
        trigger: 0, walkAnime: true,
      }],
    };
  }

  function injectEvent(data) {
    const id = $dataMap.events.length;
    data.id = id;
    $dataMap.events[id] = data;
    const ev = new Game_Event($gameMap._mapId, id);
    $gameMap._events[id] = ev;
    return ev;
  }

  let placedEvents = [];   // Game_Event[] standing on this visit to the world map

  function placeArmies() {
    placedEvents = [];
    if (typeof $gameMap === "undefined" || !$gameMap || !$dataMap) return placedEvents;
    if ($gameMap.mapId() !== WORLD_MAP_ID()) return placedEvents;
    // The campaign is only on the board for a party that fields troops of its
    // own. With nothing to march, parlay or fight with, the columns are not
    // something the player can take part in, so they are not drawn at all.
    if (!partyHasArmy()) return placedEvents;
    for (const army of roll()) {
      if (army.x < 0 || army.y < 0 || !passableAt(army.x, army.y)) {
        const camp = findCamp(army);
        army.x = camp.x;
        army.y = camp.y;
      }
      const ev = injectEvent(makeEventData(army, army.x, army.y));
      ev._armyCampaignId = army.id;
      placedEvents.push(ev);
    }
    if ($gameMap.requestRefresh) $gameMap.requestRefresh();
    return placedEvents;
  }

  //---------------------------------------------------------------------------
  // The troops themselves, built only when it comes to a fight
  //---------------------------------------------------------------------------
  // The roster carries a number, not a list: three thousand troop records for
  // an army nobody attacked would be three thousand records in every savegame.
  // The list is built at the moment the battle starts, out of the faction's own
  // troop table, exactly as the roaming armies build theirs.
  function buildBattleArmy(army) {
    const ai = new Game_AIArmy(0);
    ai._isIndependent = army.kind !== "power";
    ai._factionId = army.factionId;
    ai._leader = { name: army.leaderName };
    ai._validRegions = army.kind === "power" ? regionsOfPower(army.powerName) : [];

    const faction = (army.factionId !== null && typeof $gameFactions !== "undefined" && $gameFactions)
      ? $gameFactions.getFaction(army.factionId) : null;
    const pool = (faction && faction.troops && faction.troops.length) ? faction.troops : null;
    if (!pool) return ai;

    // The column that takes the field is the column the article lists: the
    // formation is rolled once with the roster and every reader of it, the
    // wiki and the battlefield alike, works off that one answer.
    const groups = (army.formation && army.formation.length)
      ? army.formation : rollFormation(army);
    const push = (troop, times) => {
      for (let i = 0; i < times; i++) {
        ai._troops.push({
          factionId: faction.id,
          name: troop.name, name_it: troop.name_it,
          hp: troop.hp, mp: troop.mp, atk: troop.atk, def: troop.def,
          mat: troop.mat, mdf: troop.mdf, agi: troop.agi, luk: troop.luk,
          role: troop.role, spritename: troop.spritename, spriteindex: troop.spriteindex,
        });
      }
    };
    for (const group of groups) {
      const troop = pool.find(t => t.name === group.name) || pool[0];
      push(troop, group.count);
    }
    return ai;
  }

  //---------------------------------------------------------------------------
  // Walking into one
  //---------------------------------------------------------------------------
  // The word the marker and the walk-in menu both print.
  function statusLabel(army) {
    const key = "ArmyEvents.campaign.status." + String(army.status || STATUS_PATROL);
    const text = T(key);
    return text === key ? String(army.status || "") : text;
  }

  function armyTitle(army) {
    return army.kind === "power"
      ? T("ArmyEvents.campaign.powerArmy", { power: army.powerName, leader: army.leaderName })
      : T("ArmyEvents.campaign.independentArmy", { leader: army.leaderName });
  }

  function openMenu(army) {
    // Walking into a fight is a different question from walking into a camp:
    // there are two columns in front of the party and the only thing to decide
    // is whose side to come down on.
    const foe = army.status === STATUS_BATTLE ? armyById(army.engagedWith) : null;
    const ids = ["empathize", "parlay", "attack", "leave"];  // i18n-ignore  record keys
    const labels = [
      T("ArmyEvents.campaign.choiceEmpathize"),
      T("ArmyEvents.campaign.choiceParlay"),
      T("ArmyEvents.campaign.choiceAttack"),
      T("ArmyEvents.campaign.choiceLeave"),
    ];
    $gameMessage.setBackground(0);
    $gameMessage.add(armyTitle(army));
    $gameMessage.add(T("ArmyEvents.campaign.strength", { count: army.troopCount }));
    if (foe) {
      $gameMessage.add(T("ArmyEvents.campaign.engagedWith", {
        leader: foe.leaderName, count: foe.troopCount,
      }));
      // Helping one side means taking the field against the other, with the
      // side you came for standing beside you.
      ids.splice(0, 0, "sideThis", "sideOther");   // i18n-ignore  record keys
      labels.splice(0, 0,
        T("ArmyEvents.campaign.choiceHelp", { leader: army.leaderName }),
        T("ArmyEvents.campaign.choiceHelp", { leader: foe.leaderName }));
      // ...and "attack the army" is dropped: with two columns on the square it
      // no longer says which of them the party would be attacking.
      const attackAt = ids.indexOf("attack");   // i18n-ignore  record key
      ids.splice(attackAt, 1);
      labels.splice(attackAt, 1);
    }
    $gameMessage.setChoices(labels, 0, ids.length - 1);
    $gameMessage.setChoiceBackground(0);
    $gameMessage.setChoicePositionType(2);
    $gameMessage.setChoiceCallback(n => {
      switch (ids[n]) {
        case "empathize": empathize(army); break;
        case "parlay": parlay(army); break;
        case "attack": attack(army); break;
        case "sideThis": joinBattle(army, foe); break;
        case "sideOther": joinBattle(foe, army); break;
        default: break;
      }
    });
  }

  // Coming in on one side of a field battle: the ally's column stands with the
  // party's own and the other one is what has to be beaten. Winning it is the
  // ally's win too, and the power whose army the party helped remembers it.
  function joinBattle(ally, enemy) {
    if (!ally || !enemy) return false;
    if (!partyHasArmy()) {
      toast(T("ArmyEvents.campaign.noArmy"), "warning");
      return false;
    }
    if (typeof $gameFactions !== "undefined" && $gameFactions) {
      if (ally.factionId !== null) $gameFactions.changeReputationWithParents(ally.factionId, 6);
      if (enemy.factionId !== null) $gameFactions.changeReputationWithParents(enemy.factionId, -10);
    }
    $gameTemp._battleEnemyArmy = buildBattleArmy(enemy);
    $gameTemp._battleAllyArmy = buildBattleArmy(ally);
    $gameTemp._battleArmyEventId = null;
    $gameTemp._battleCampaignSides = { allyId: ally.id, enemyId: enemy.id };
    SceneManager.push(Scene_ArmyBattle);
    return true;
  }

  // How a battle the party took part in is written back into the roster: the
  // column that lost the field is gone, the one they stood with holds it.
  function resolveJoinedBattle(result) {
    const sides = $gameTemp && $gameTemp._battleCampaignSides;
    if (!sides) return false;
    $gameTemp._battleCampaignSides = null;
    const ally = armyById(sides.allyId);
    const enemy = armyById(sides.enemyId);
    if (ally && enemy) disengage(ally, enemy);
    // Standing in somebody's line is worth more than saying you would: the
    // power whose field the party held remembers the win, and the one they
    // broke remembers being broken.
    if (typeof $gameFactions !== "undefined" && $gameFactions) {
      const shift = result === "victory" ? 1 : -1;   // i18n-ignore  result key
      if (ally && ally.factionId !== null) $gameFactions.changeReputationWithParents(ally.factionId, 12 * shift);
      if (enemy && enemy.factionId !== null) $gameFactions.changeReputationWithParents(enemy.factionId, -14 * shift);
    }
    if (result === "victory") {   // i18n-ignore  result key
      if (enemy) enemy.troopCount = 0;
      if (ally) { ally.status = STATUS_PATROL; ally.startCount = ally.troopCount; }
    } else if (ally) {
      ally.status = STATUS_RETREAT;
      ally.holdUntil = nowMinutes() + 6 * 60;
      ally.targetX = ally.x;
      ally.targetY = ally.y;
    }
    const st = state();
    if (st) st.armies = (st.armies || []).filter(a => a.troopCount > 0);
    syncPlacedEvents();
    return true;
  }

  function empathize(army) {
    const E = window.NPCEmpathize;
    if (!E) return;
    // A leader the book wrote down has an article of their own; anyone else is
    // opened by name, the way any NPC is.
    if (army.leaderId && E.openEntity) E.openEntity("leader", String(army.leaderId));  // i18n-ignore  entity type
    else if (E.openByName) E.openByName(army.leaderName);
  }

  function toast(text, kind) {
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show({ text, type: kind || "info" });   // i18n-ignore  toast kind
    }
  }

  // What a parlay is worth: what the power thinks of the party, what kind of
  // person is being asked, and the size of the army doing the asking. A leader
  // answers once a day, so a refusal cannot be re-rolled on the spot.
  function parlay(army) {
    const day = dayIndex();
    if (army.parlayDay >= 0 && day - army.parlayDay < PARLAY_COOLDOWN_DAYS) {
      toast(T("ArmyEvents.campaign.parlayAlreadyAnswered", { leader: army.leaderName }), "warning");
      return "waiting";   // i18n-ignore  outcome key
    }
    army.parlayDay = day;

    const rep = (army.factionId !== null && typeof $gameFactions !== "undefined" && $gameFactions)
      ? Number($gameFactions.getReputation(army.factionId)) || 0 : 0;
    const ourTroops = (typeof $gameArmy !== "undefined" && $gameArmy) ? $gameArmy.getTroopCount() : 0;
    const rng = mulberry32(hashStr(worldSeed() + ":parlay:" + army.id + ":" + day));

    // A leader who thinks little of the party still hears out one that arrived
    // with an army of its own: standing and strength are both arguments.
    const standing = rep + (army.charisma - 50) * 0.2 +
      Math.min(25, (ourTroops / Math.max(1, army.troopCount)) * 40) +
      rng() * 20 - 10;

    if (standing >= 35) {
      // Goodwill: the road is open, and the power notices the courtesy.
      if (typeof $gameFactions !== "undefined" && $gameFactions && army.factionId !== null) {
        $gameFactions.changeReputationWithParents(army.factionId, 3);
      }
      toast(T("ArmyEvents.campaign.parlayWelcome", { leader: army.leaderName }), "success");
      return "welcome";   // i18n-ignore  outcome key
    }
    if (standing >= 0) {
      toast(T("ArmyEvents.campaign.parlayPassage", { leader: army.leaderName }));
      return "passage";   // i18n-ignore  outcome key
    }
    if (standing >= -25) {
      toast(T("ArmyEvents.campaign.parlayDemand", { leader: army.leaderName }), "warning");
      return "demand";    // i18n-ignore  outcome key
    }
    if (typeof $gameFactions !== "undefined" && $gameFactions && army.factionId !== null) {
      $gameFactions.changeReputationWithParents(army.factionId, -2);
    }
    toast(T("ArmyEvents.campaign.parlayRefused", { leader: army.leaderName }), "warning");
    return "refused";     // i18n-ignore  outcome key
  }

  function attack(army) {
    const ourTroops = (typeof $gameArmy !== "undefined" && $gameArmy) ? $gameArmy.getTroopCount() : 0;
    if (ourTroops <= 0) {
      toast(T("ArmyEvents.campaign.noArmy"), "warning");
      return false;
    }
    // Raising a hand against a power is remembered whatever the battle does.
    if (typeof $gameFactions !== "undefined" && $gameFactions && army.factionId !== null) {
      $gameFactions.changeReputationWithParents(army.factionId, -8);
    }
    $gameTemp._battleEnemyArmy = buildBattleArmy(army);
    $gameTemp._battleArmyEventId = null;
    SceneManager.push(Scene_ArmyBattle);
    return true;
  }

  const _Game_Event_start_campaign = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    const name = this.event() && this.event().name;
    if (name && name.startsWith(EVENT_PREFIX)) {
      const army = armyById(name.slice(EVENT_PREFIX.length));
      if (army) {
        try { openMenu(army); }
        catch (e) { console.error("[ArmyCampaign] army event failed", e); }
        return;
      }
    }
    _Game_Event_start_campaign.call(this);
  };

  // An army walks the map with the player, and where it walked to is kept: the
  // roster is rolled once a day, but its positions move all day long.
  const _Game_Event_update_campaign = Game_Event.prototype.update;
  Game_Event.prototype.update = function () {
    _Game_Event_update_campaign.call(this);
    if (!this._armyCampaignId) return;
    const army = armyById(this._armyCampaignId);
    if (!army) return;
    army.x = this.x;
    army.y = this.y;
    if (!$gamePlayer.isMoving() || this.isMoving()) return;
    // A garrison sits on its gate and a column in the field stands where it is
    // fighting: neither wanders off while the party watches.
    if (army.status === STATUS_GARRISON || army.status === STATUS_BATTLE) return;
    if (Math.random() * 100 > ArmyEventsManager.Params.armyMovementChance) return;
    const regions = groundOf(army);
    // Under orders it walks TOWARDS somewhere, and the marker says so; with
    // none it patrols, which is the step in any legal direction it always was.
    const target = (army.status === STATUS_MARCH || army.status === STATUS_RETREAT)
      ? { x: army.targetX, y: army.targetY }
      : (army.status === STATUS_REINFORCE ? armyById(army.engagedWith) : null);
    const legal = [2, 4, 6, 8].filter(dir => {
      const x2 = $gameMap.roundXWithDirection(this.x, dir);
      const y2 = $gameMap.roundYWithDirection(this.y, dir);
      if (!$gameMap.isPassable(x2, y2, this.reverseDir(dir))) return false;
      if (this.isCollidedWithEvents(x2, y2)) return false;
      // A state's army keeps to the ground its power holds, and a private
      // column to the ground no power claims.
      return !regions.length || regions.includes($gameMap.regionId(x2, y2));
    });
    if (!legal.length) return;
    if (target && target.x >= 0) {
      const towards = legal.slice().sort((d1, d2) => {
        const cost = dir => Math.abs($gameMap.roundXWithDirection(this.x, dir) - target.x)
          + Math.abs($gameMap.roundYWithDirection(this.y, dir) - target.y);
        return cost(d1) - cost(d2);
      })[0];
      this.moveStraight(towards);
      return;
    }
    this.moveStraight(legal[Math.floor(Math.random() * legal.length)]);
  };

  //---------------------------------------------------------------------------
  // The crossed swords over the camp
  //---------------------------------------------------------------------------
  // The marker is the army's own: the adventure plate and Eris's heart are
  // drawn by WorldMapReturn out of the adventure plugin, and neither of them
  // knows anything about armies.
  class Sprite_ArmyMarch extends Sprite {
    initialize(event, army) {
      super.initialize();
      this._event = event;
      this._army = army;
      this.z = 7;
      this.anchor.x = 0.5;
      this.anchor.y = 1;
      this.bitmap = new Bitmap(160, 76);
      this._icon = new Sprite();
      this._icon.bitmap = ImageManager.loadSystem("IconSet");   // i18n-ignore  asset name
      const cell = 32;
      this._icon.setFrame((SWORD_ICON % 16) * cell, Math.floor(SWORD_ICON / 16) * cell, cell, cell);
      this._icon.scale.x = this._icon.scale.y = 0.75;
      this._icon.x = 68;
      this._icon.y = 0;
      this.addChild(this._icon);
      this.refresh();
    }

    // Three lines, read top down: who is in command, what the column is doing
    // and how many of them there are.
    refresh() {
      const army = this._army;
      this.bitmap.clear();
      this.bitmap.outlineWidth = 4;
      this.bitmap.outlineColor = "black";   // i18n-ignore  colour
      this.bitmap.fontSize = 14;
      this.bitmap.textColor = "white";      // i18n-ignore  colour
      this.bitmap.drawText(String(army.leaderName || ""), 0, 0, 160, 18, "center");
      this.bitmap.fontSize = 13;
      this.bitmap.textColor = army.status === STATUS_BATTLE ? "#ff8080" : "#ffe0a0";  // i18n-ignore  colour
      this.bitmap.drawText(statusLabel(army), 0, 17, 160, 18, "center");
      this.bitmap.fontSize = 16;
      this.bitmap.textColor = MARKER_COLOR;
      this.bitmap.drawText(String(army.troopCount), 0, 52, 160, 20, "center");
      this._shownStatus = army.status;
      this._shownCount = army.troopCount;
    }

    update() {
      super.update();
      this.x = this._event.screenX();
      this.y = this._event.screenY() - 30;
      this.visible = !this._event._erased;
      // Orders change under the party's feet, and the plate says so without
      // being redrawn every frame.
      if (this._shownStatus !== this._army.status || this._shownCount !== this._army.troopCount) {
        this.refresh();
      }
    }
  }

  // The label pass the roaming armies already run is where these join in: one
  // list of sprites, updated once a frame, whatever put them there.
  const _createArmyLabels_campaign = Spriteset_Map.prototype.createArmyLabels;
  Spriteset_Map.prototype.createArmyLabels = function () {
    _createArmyLabels_campaign.call(this);
    if (!this._armyLabelSprites) this._armyLabelSprites = [];
    for (const ev of placedEvents) {
      const army = armyById(ev._armyCampaignId);
      if (!army) continue;
      const marker = new Sprite_ArmyMarch(ev, army);
      this._armyLabelSprites.push(marker);
      this._tilemap.addChild(marker);
    }
  };

  // The armies are stood up as the world map is set up, before its spriteset
  // asks for the markers.
  const _Game_Map_setupEvents_campaign = Game_Map.prototype.setupEvents;
  Game_Map.prototype.setupEvents = function () {
    _Game_Map_setupEvents_campaign.call(this);
    try {
      if (this.mapId() === WORLD_MAP_ID()) placeArmies();
      else placedEvents = [];
    } catch (e) {
      console.error("[ArmyCampaign] could not place the armies", e);
    }
  };

  // A step on the world map is a quarter of an hour of somebody else's war.
  const _Game_Player_increaseSteps_campaign = Game_Player.prototype.increaseSteps;
  Game_Player.prototype.increaseSteps = function () {
    if (_Game_Player_increaseSteps_campaign) _Game_Player_increaseSteps_campaign.call(this);
    try {
      if ($gameMap.mapId() === WORLD_MAP_ID()) simulate();
    } catch (e) {
      console.error("[ArmyCampaign] the campaign could not be simulated", e);
    }
  };

  window.ArmyCampaign = {
    roll,
    simulate,
    partyHasArmy,
    assignOrders,
    statusLabel,
    hostile,
    joinBattle,
    resolveJoinedBattle,
    syncPlacedEvents,
    listArmies,
    armiesOfLeader,
    armiesOfPower,
    playerArmy,
    rollFormation,
    upkeepOf,
    coherenceOf,
    moraleOf,
    factionText,
    armies() { const s = state(); return s ? s.armies || [] : []; },
    armyById,
    livingMainPlayers,
    buildBattleArmy,
    placeArmies,
    placedEvents() { return placedEvents.slice(); },
    parlay,
    attack,
    empathize,
    openMenu,
    eventPrefix: EVENT_PREFIX,
    swordIcon: SWORD_ICON,
  };
})();
