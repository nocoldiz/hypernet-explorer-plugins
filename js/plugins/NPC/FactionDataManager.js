/*:
 * @target MZ
 * @plugindesc Faction Reputation System for RPG Maker RZ
 * @author Omni-Lex
 *
 * @param showInMenu
 * @text Show in Menu
 * @type boolean
 * @default true
 * @desc Whether to add the Faction Status option to the main menu.
 *
 * @param menuText
 * @text Menu Command Text
 * @type string
 * @default Factions
 * @desc The text shown for the Faction Status command in the menu.
 *
 * @param startingValues
 * @text Starting Reputation Values
 * @type string
 * @default 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
 * @desc Comma-separated starting values for factions.
 *
 * @command open
 * @text Open Faction Screen
 * @desc Opens the faction reputation screen.
 *
 * @command setReputation
 * @text Set Reputation
 * @desc Sets a faction's reputation to a specific value.
 * @arg factionId
 * @type number
 * @min 0
 * @max 17
 * @desc The ID of the faction (0-17).
 * @arg value
 * @type number
 * @min -100
 * @max 100
 * @desc The reputation value (-100 to 100).
 *
 * @command changeReputation
 * @text Change Reputation
 * @desc Changes a faction's reputation by the specified amount.
 * @arg factionId
 * @type number
 * @min 0
 * @max 17
 * @desc The ID of the faction (0-17).
 * @arg change
 * @type number
 * @min -100
 * @max 100
 * @desc The amount to change reputation by (-100 to 100).
 *
 * @command getFactionsByType
 * @text Get Factions by Type
 * @desc Gets all factions of a specific type and stores their count and IDs in variables.
 * @arg typeName
 * @type select
 * @option hardcoded
 * @desc The type of factions to get.
 * @arg variableId
 * @type variable
 * @desc The variable ID to store the count in. Subsequent variables will store faction IDs.
 *
 * @command getHighestReputationFaction
 * @text Get Highest Reputation Faction
 * @desc Gets the faction ID with the highest reputation.
 * @arg variableId
 * @type variable
 * @desc The variable ID to store the faction ID in.
 *
 * @command getLowestReputationFaction
 * @text Get Lowest Reputation Faction
 * @desc Gets the faction ID with the lowest reputation.
 * @arg variableId
 * @type variable
 * @desc The variable ID to store the faction ID in.
 *
 * @command checkQuestAvailability
 * @text Check Quest Availability
 * @desc Checks if a quest is available based on faction reputation.
 * @arg questId
 * @type number
 * @desc The ID of the quest.
 * @arg factionId
 * @type number
 * @min 0
 * @max 17
 * @desc The ID of the faction (0-17).
 * @arg requiredRep
 * @type number
 * @min -100
 * @max 100
 * @desc The required reputation (-100 to 100).
 * @arg switchId
 * @type switch
 * @desc The switch ID to store the result in (ON if available).
 *
 * @command getAvailableQuestCount
 * @text Get Available Quest Count
 * @desc Gets the number of available quests for a faction.
 * @arg factionId
 * @type number
 * @min 0
 * @max 17
 * @desc The ID of the faction (0-17).
 * @arg variableId
 * @type variable
 * @desc The variable ID to store the count in.
 *
 * @help
 * This plugin implements a faction reputation system with 3 hardcoded factions
 * and 7 procedurally generated factions. Reputation ranges from -100 to +100.
 *
 * Plugin Commands:
 *
 * FactionReputationSystem open
 *   - Opens the faction reputation screen
 *
 * FactionReputationSystem setReputation factionId value
 *   - Sets a faction's reputation to a specific value
 *   - Example: FactionReputationSystem setReputation 0 50
 *
 * FactionReputationSystem changeReputation factionId change
 *   - Changes a faction's reputation by the specified amount
 *   - Example: FactionReputationSystem changeReputation 0 10
 *
 * Script Calls:
 *   $gameFactions.getReputation(factionId) - Get reputation value
 *   $gameFactions.setReputation(factionId, value) - Set reputation
 *   $gameFactions.getReputationLevel(factionId) - Get level text
 *   SceneManager.push(Scene_FactionStatus) - Open faction screen
 *
 * The party's own faction:
 *   $gameFactions.hasPlayerFaction() - Has this world a banner of its own?
 *   $gameFactions.foundPlayerFaction(name) - Raise it, once per world. An
 *     empty name takes a procedurally rolled one.
 *   $gameFactions.swearPlayerFactionTo(hyperpowerId) - Swear it to a power, or
 *     null to renounce and stand alone again.
 *   $gameFactions.playerFactionRoster() - {party, army, total}
 *   SceneManager.push(Scene_PlayerFaction) - Open its management screen
 */

//=============================================================================
// Plugin Parameters and Setup
//=============================================================================

let $gameFactions = null;

var Imported = Imported || {};
Imported.FactionReputationSystem = true;

var FRS = FRS || {};
FRS.Params = PluginManager.parameters("FactionDataManager");

FRS.Params.showInMenu =
  String(FRS.Params.showInMenu || "true").toLowerCase() === "true";
FRS.Params.menuText = () => T.param(FRS.Params.menuText, "Factions.menuCommand");
FRS.Params.startingValues = String(
  FRS.Params.startingValues || "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"
)
  .split(",")
  .map(Number);

// The register is built as markup, and since the party names its own faction
// and its own characters, anything read back out of those is written through
// here rather than straight into innerHTML.
FRS.escapeText = (text) => String(text == null ? "" : text)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

//=============================================================================
// Faction Data Manager
//=============================================================================

function FactionDataManager() {
  this.initialize(...arguments);
}

FactionDataManager.prototype.initialize = function () {
  this._factions = [];
  this._i18nData = null;
  this._i18nDataEN = null;
  this._leadersData = {};
  this._ready = false;
  this._readyPromise = Promise.all([
    this._loadI18nData(),
    this._loadCountriesData(),
    this._loadGeopoliticsData(),
    this._loadFactionsData(),
    this._loadLeadersData()
  ]).then(() => {
    this._resolveLeaders();
    this._ready = true;
  });
  this._setupGeopoliticalData();
};

// The keys stored on faction/troop data ("factions.magesguild.troops.x.name",
// "roles.support", "formations.circle", ...) are dotted paths into these five
// files merged into one lookup table. Loaded twice: once for the active
// language and once for English, so .t() always has an English answer to
// fall back on when a translation is missing or a language pack is thin.
FactionDataManager.I18N_SOURCES = [
  { file: "faction.json", key: null },
  { file: "ideology.json", key: null },
  { file: "personalities.json", key: "personalities" },
  { file: "roles.json", key: "roles" },
  { file: "formations.json", key: "formations" }
];

FactionDataManager.prototype._loadI18nSet = async function (lang) {
  const out = {};
  await Promise.all(FactionDataManager.I18N_SOURCES.map(async (src) => {
    try {
      const response = await fetch(`js/i18n/${lang}/${src.file}`);
      const data = await response.json();
      if (src.key) out[src.key] = data;
      else Object.assign(out, data);
    } catch (e) {
      console.error(`Failed to load ${src.file} i18n data (${lang})`, e);
    }
  }));
  return out;
};

FactionDataManager.prototype._loadI18nData = async function () {
  const lang = ConfigManager.language || "en";
  this._i18nDataEN = await this._loadI18nSet("en");
  this._i18nData = (lang === "en") ? this._i18nDataEN : await this._loadI18nSet(lang);
};

FactionDataManager.prototype._loadLeadersData = async function () {
  try {
    const response = await fetch(`js/db/WorldGen/Leaders.json`);
    this._leadersData = await response.json();
  } catch (e) {
    console.error("Failed to load leaders data", e);
  }
};

FactionDataManager.prototype._resolveLeaders = function () {
  const leaders = this._leadersData;
  if (!leaders) return;

  // Resolve Factions
  if (this._factions) {
    this._factions.forEach(faction => {
      if (faction.leaders) {
        faction.leaders = faction.leaders.map(key => leaders[key] || { name: key });
      }
    });
  }

  // Resolve Geopolitics (Hyperpowers and Historical Factions)
  if (this._hyperpowers) {
    for (const power in this._hyperpowers) {
      if (this._hyperpowers[power].leaders) {
        this._hyperpowers[power].leaders = this._hyperpowers[power].leaders.map(key => leaders[key] || { name: key });
      }
      // holy_leaders use the same key->object resolution (e.g. papacy track).
      if (this._hyperpowers[power].holy_leaders) {
        this._hyperpowers[power].holy_leaders = this._hyperpowers[power].holy_leaders.map(key => leaders[key] || { name: key });
      }
    }
  }

  if (this._historicalFactions) {
    for (const faction in this._historicalFactions) {
      if (this._historicalFactions[faction].leaders) {
        this._historicalFactions[faction].leaders = this._historicalFactions[faction].leaders.map(key => leaders[key] || { name: key });
      }
    }
  }
};

FactionDataManager.prototype._loadCountriesData = async function () {
  try {
    const response = await fetch(`js/db/WorldGen/Countries.json`);
    const data = await response.json();
    this._countries = {};
    for (const item of data) {
      this._countries[item.country] = {
        controller: item.controller || 'Neutral',
        faction: item.faction || 'Neutral',
        // The continent it stands on. World generation only lets a power take
        // nations in its own region (HistorySimulator.handleNationPolitics),
        // so this has to survive the trip from the data file.
        region: item.region || null
      };
    }
  } catch (e) {
    console.error("Failed to load countries data", e);
  }
};

FactionDataManager.prototype._loadGeopoliticsData = async function () {
  try {
    const response = await fetch(`js/db/WorldGen/Hyperpowers.json`);
    const data = await response.json();
    this._hyperpowers = data.hyperpowers || {};
    this._historicalFactions = data.factions || {};
  } catch (e) {
    console.error("Failed to load geopolitics data", e);
  }
};

FactionDataManager.prototype._loadFactionsData = async function () {
  try {
    const response = await fetch(`js/db/WorldGen/Factions.json`);
    this._factions = await response.json();
    this._buildRelationshipMatrix();
  } catch (e) {
    console.error("Failed to load factions data", e);
  }
};

FactionDataManager.prototype._buildRelationshipMatrix = function () {
  const n = Array.isArray(this._factions) ? this._factions.length : 0;
  if (n === 0) return;

  // Initialize NxN matrix to 0
  this._relationships = Array.from({ length: n }, () => new Array(n).fill(0));

  // Populate from explicit relationships[] arrays in each faction entry, if present
  let hasExplicit = false;
  this._factions.forEach((faction, i) => {
    if (!Array.isArray(faction.relationships)) return;
    hasExplicit = true;
    faction.relationships.forEach(({ factionId, strength }) => {
      const j = Number(factionId);
      if (j >= 0 && j < n && i !== j) {
        const s = Math.max(-2, Math.min(2, Number(strength) || 0));
        this._relationships[i][j] = s;
        this._relationships[j][i] = s; // mirror
      }
    });
  });

  // Fallback: derive from factionType pairings when no explicit data exists
  if (!hasExplicit) {
    const TYPE_COMPAT = {
      Law:      { Criminal: -2, Military: 1,  Religious: 0, Mercenary: -1 },
      Criminal: { Law: -2,      Military: -1, Religious: -1, Mercenary: 1  },
      Military: { Law: 1,       Criminal: -1, Religious: 0,  Mercenary: -1 },
      Religious:{ Law: 0,       Criminal: -1, Military: 0,   Mercenary: 0  },
      Mercenary:{ Law: -1,      Criminal: 1,  Military: -1,  Religious: 0  },
    };
    this._factions.forEach((fi, i) => {
      this._factions.forEach((fj, j) => {
        if (i >= j) return;
        const ti = fi.type || fi.factionType || '';
        const tj = fj.type || fj.factionType || '';
        const s = TYPE_COMPAT[ti]?.[tj] ?? TYPE_COMPAT[tj]?.[ti] ?? 0;
        this._relationships[i][j] = s;
        this._relationships[j][i] = s;
      });
    });
  }
};

FactionDataManager.prototype._digI18n = function (root, path) {
  if (!root) return undefined;
  if (root[path] !== undefined) return root[path];
  const keys = path.split(".");
  let current = root;
  for (const key of keys) {
    if (current == null || current[key] === undefined) return undefined;
    current = current[key];
  }
  return current;
};

// Resolves a dotted i18n path stored on faction/troop/role/formation data
// (e.g. "factions.magesguild.troops.apprenticemage.name"). Falls back to the
// English data set when the active language is missing the key, and to the
// raw key itself (never blank) when neither has it.
FactionDataManager.prototype.t = function (path) {
  let value = this._digI18n(this._i18nData, path);
  if (value === undefined) value = this._digI18n(this._i18nDataEN, path);
  if (value === undefined) return path;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return path;
};

FactionDataManager.prototype._setupGeopoliticalData = function () {
  // Data is now loaded from Geopolitics.json in _loadGeopoliticsData
};



FactionDataManager.instance = new FactionDataManager();

//=============================================================================
// Register Plugin Commands
//=============================================================================

PluginManager.registerCommand("FactionDataManager", "open", (args) => {
  SceneManager.push(Scene_FactionStatus);
});

//=============================================================================
// World initialization
//=============================================================================

// The diplomatic accords are rolled when the world is made, not when somebody
// first opens the faction screen, so every savegame of the world reads the same
// treaties (they live in the world folder, npcs.json "diplomacy"). Runs after
// politics, since it is the same layer of the world: who is in office and who
// they have signed with. Throwing while the faction table is still loading is
// how a step asks WorldManager to try it again.
if (typeof window !== "undefined" && window.WorldManager?.registerWorldInitializer) {
  window.WorldManager.registerWorldInitializer("factionDiplomacy", 55, () => {
    if (!$gameFactions || !FactionDataManager.instance
      || !Array.isArray(FactionDataManager.instance._factions)
      || !FactionDataManager.instance._factions.length) {
      throw new Error("FactionDataManager: factions not loaded yet");
    }
    const table = $gameFactions.generateDiplomacy();
    if (!table) throw new Error("FactionDataManager: hyperpowers not loaded yet");
    $gameSystem._factionDiplomacy = table;
  });
}

PluginManager.registerCommand("FactionDataManager", "setReputation", (args) => {
  const factionId = Number(args.factionId || 0);
  const value = Number(args.value || 0);
  $gameFactions.setReputation(factionId, value);
});

PluginManager.registerCommand(
  "FactionDataManager",
  "changeReputation",
  (args) => {
    const factionId = Number(args.factionId || 0);
    const change = Number(args.change || 0);
    $gameFactions.changeReputation(factionId, change);
  }
);

PluginManager.registerCommand(
  "FactionDataManager",
  "getFactionsByType",
  (args) => {
    const typeName = String(args.typeName || "");
    const variableId = Number(args.variableId || 0);
    $gameFactions.getFactionsByType(typeName, variableId);
  }
);

PluginManager.registerCommand(
  "FactionDataManager",
  "getHighestReputationFaction",
  (args) => {
    const variableId = Number(args.variableId || 0);
    $gameFactions.getHighestReputationFaction(variableId);
  }
);

PluginManager.registerCommand(
  "FactionDataManager",
  "getLowestReputationFaction",
  (args) => {
    const variableId = Number(args.variableId || 0);
    $gameFactions.getLowestReputationFaction(variableId);
  }
);

PluginManager.registerCommand(
  "FactionDataManager",
  "checkQuestAvailability",
  (args) => {
    const questId = Number(args.questId || 0);
    const factionId = Number(args.factionId || 0);
    const requiredRep = Number(args.requiredRep || 0);
    const switchId = Number(args.switchId || 0);
    $gameFactions.checkQuestAvailability(
      questId,
      factionId,
      requiredRep,
      switchId
    );
  }
);

PluginManager.registerCommand(
  "FactionDataManager",
  "getAvailableQuestCount",
  (args) => {
    const factionId = Number(args.factionId || 0);
    const variableId = Number(args.variableId || 0);
    $gameFactions.getAvailableQuestCount(factionId, variableId);
  }
);

//=============================================================================
// Menu Integration
//=============================================================================

const _Window_MenuCommand_makeCommandList_FactionDataManager =
  Window_MenuCommand.prototype.makeCommandList;
Window_MenuCommand.prototype.makeCommandList = function () {
  _Window_MenuCommand_makeCommandList_FactionDataManager.call(this);
  if (FRS.Params.showInMenu) {
    this.addCommand(FRS.Params.menuText(), "factions", true);
    // Set icon for the newly added command
    this._list[this._list.length - 1].icon = 247;
  }
};

const _Scene_Menu_createCommandWindow_FactionDataManager =
  Scene_Menu.prototype.createCommandWindow;
Scene_Menu.prototype.createCommandWindow = function () {
  _Scene_Menu_createCommandWindow_FactionDataManager.call(this);
  this._commandWindow.setHandler(
    "factions",
    this.commandFactionStatus.bind(this)
  );
};

Scene_Menu.prototype.commandFactionStatus = function () {
  SceneManager.push(Scene_FactionStatus);
};

//=============================================================================
// Game_Factions - Handles faction data and operations
//=============================================================================

function Game_Factions() {
  this.initialize(...arguments);
}

Game_Factions.prototype.initialize = function () {
  this._reputations = [];
  this.initializeReputations();
};

Game_Factions.prototype.initializeReputations = function () {
  // Initialize reputations from plugin parameters
  const numFactions = FactionDataManager.instance._factions.length;
  this._reputations = FRS.Params.startingValues.slice(0, numFactions);

  // Fill with zeros if there are not enough values
  while (this._reputations.length < numFactions) {
    this._reputations.push(0);
  }
};

Game_Factions.prototype.getReputation = function (factionId) {
  if (factionId >= 0 && factionId < this._reputations.length) {
    return this._reputations[factionId];
  }
  return 0;
};

Game_Factions.prototype.setReputation = function (factionId, value) {
  if (factionId >= 0 && factionId < this._reputations.length) {
    this._reputations[factionId] = Math.max(-100, Math.min(100, value));

    // Update relationships with other factions
    this.updateRelatedFactions(factionId, value);
  }
};

Game_Factions.prototype.changeReputation = function (factionId, change) {
  if (factionId >= 0 && factionId < this._reputations.length) {
    const before = this.getReputation(factionId);
    const newValue = before + change;
    this.setReputation(factionId, newValue);
    this.announceReputation(factionId, before, this.getReputation(factionId));
  }
};

// Standing is one of the few numbers the world reads back at the party, so a
// change to it is told rather than left to be found in a menu. Only the change
// the party actually caused is announced: the ripple through allied and rival
// factions would be a wall of popups, so it is suppressed here.
Game_Factions.prototype.announceReputation = function (factionId, before, after) {
  if (this._repCascading || before === after || !window.ParchmentToast) return;
  const faction = this.getFaction(factionId);
  if (!faction) return;
  const band = this.reputationBandOf(after);
  window.ParchmentToast.reputation(faction.name, after - before, {
    value: after,
    band: this.reputationLevelOf(after),
    bandChanged: band !== this.reputationBandOf(before)
  });
};

// Applies `change` to a faction AND to the hyperpower it answers to: earning a
// branch's goodwill colours the power's standing too, which is read under its
// own "hp:<id>" key (Factions.json `parentHyperpower`).
Game_Factions.prototype.changeReputationWithParents = function (factionId, change) {
  this.changeReputation(factionId, change);
  const faction = this.getFaction(factionId);
  const hp = this.hyperpowerOfFaction(faction);
  if (hp) this.changeReputation(this.hyperpowerStandingKey(hp.id), change);
};

Game_Factions.prototype.updateRelatedFactions = function (factionId, newValue) {
  if (this._repCascading) return;
  // Skip if relationships aren't initialized
  if (!FactionDataManager.instance || !FactionDataManager.instance._relationships) {
    // Relationships system not set up, skip related faction updates
    return;
  }

  // Check if this is a significant reputation change
  const oldValue = this.getReputation(factionId);
  const change = newValue - oldValue;

  // Only update related factions if change is significant (>= 10 points)
  if (Math.abs(change) >= 10) {
    this._repCascading = true;
    try {
    for (let i = 0; i < FactionDataManager.instance._factions.length; i++) {
      if (i !== factionId) {
        const relationship = FactionDataManager.instance._relationships[factionId][i];

        // Update related faction's reputation based on relationship
        if (relationship !== 0) {
          const relatedChange = Math.floor(change * relationship * 0.2);
          if (relatedChange !== 0) {
            this.changeReputation(i, relatedChange);
          }
        }
      }
    }
    } finally { this._repCascading = false; }
  }
};

Game_Factions.prototype.getReputationLevel = function (factionId) {
  const reputation = this.getReputation(factionId);

  // The band is a label, not an id: nothing matches on it.
  if (reputation >= 80) return T("Factions.repLevel.exalted");
  if (reputation >= 60) return T("Factions.repLevel.revered");
  if (reputation >= 40) return T("Factions.repLevel.honored");
  if (reputation >= 20) return T("Factions.repLevel.friendly");
  if (reputation >= -20) return T("Factions.repLevel.neutral");
  if (reputation >= -40) return T("Factions.repLevel.unfriendly");
  if (reputation >= -60) return T("Factions.repLevel.hostile");
  if (reputation >= -80) return T("Factions.repLevel.hated");
  return T("Factions.repLevel.nemesis");
};

Game_Factions.prototype.getReputationColor = function (factionId) {
  return this.reputationColorOf(this.getReputation(factionId));
};

Game_Factions.prototype.getReputationPerks = function (factionId) {
  const reputation = this.getReputation(factionId);
  const perks = [];

  // Generic perks based on reputation level
  if (reputation >= 20) {
    perks.push(T("Factions.perk.basicServices"));
  }
  if (reputation >= 40) {
    perks.push(T("Factions.perk.discount10"));
    perks.push(T("Factions.perk.uncommonItems"));
  }
  if (reputation >= 60) {
    perks.push(T("Factions.perk.discount25"));
    perks.push(T("Factions.perk.rareItems"));
    perks.push(T("Factions.perk.battleSupport"));
  }
  if (reputation >= 80) {
    perks.push(T("Factions.perk.discount40"));
    perks.push(T("Factions.perk.exclusiveItems"));
    perks.push(T("Factions.perk.specialQuests"));
    perks.push(T("Factions.perk.safeHouses"));
  }

  // Negative perks
  if (reputation <= -20) {
    perks.push(T("Factions.perk.servicesUnavailable"));
  }
  if (reputation <= -40) {
    perks.push(T("Factions.perk.refuseInteract"));
    perks.push(T("Factions.perk.suspiciousGuards"));
  }
  if (reputation <= -60) {
    perks.push(T("Factions.perk.dangerousTerritory"));
    perks.push(T("Factions.perk.attackOnSight"));
  }
  if (reputation <= -80) {
    perks.push(T("Factions.perk.bountyHunters"));
    perks.push(T("Factions.perk.alliesTurn"));
  }

  return perks;
};

//=============================================================================
// Standing, made good on
//=============================================================================
//
// getReputationPerks above has always promised the player a 10, 25 and 40 per
// cent discount, services withdrawn at -20 and a hall that will not deal with
// them at all at -40. Nothing implemented any of it: reputation was moved from
// 44 places and asked from six, four of which only drew it. These are the
// numbers that list is describing, defined once so a counter, a courier and an
// employer all quote the same standing.
//
// Which faction is owed the courtesy is a question of WHERE the party is: the
// power that holds the country they are standing in, and the first faction that
// answers to it. A place no power holds (the sea, a procedural nowhere, a world
// whose history was never run) has nobody to be in favour with, and everything
// below falls back to neutral.
const STANDING_DISCOUNTS = [[80, 0.40], [60, 0.25], [40, 0.10]];
// Being disliked is not a discount in reverse: a hall that would rather not
// serve you charges for the trouble before it stops serving you.
const STANDING_SURCHARGES = [[-60, 0.35], [-40, 0.20], [-20, 0.08]];
// At and below this, "refuse to interact" in the perk list is literal.
const STANDING_REFUSAL = -40;

Game_Factions.prototype.hyperpowerHoldingCountry = function (country) {
  if (!country) return null;
  const name = String(country);
  for (const hp of this.getHyperpowers()) {
    if (hp.data && hp.data.homeNation === name) return hp;
    if (this.countriesOfHyperpower(hp.name).includes(name)) return hp;
  }
  return null;
};

// Where the party is standing, as the weather system knows it: it is the one
// place in the tree that resolves a map to a real country.
Game_Factions.prototype.currentCountryName = function () {
  const cc = (typeof $gameWeather !== "undefined" && $gameWeather)
    ? $gameWeather.currentCountry : null;
  if (!cc) return null;
  return cc.country || cc.name || null;
};

// The faction whose good opinion is worth something here, or null.
Game_Factions.prototype.localFactionId = function () {
  const hp = this.hyperpowerHoldingCountry(this.currentCountryName());
  if (!hp) return null;
  const factions = this.getHyperpowerFactions(hp.id);
  return factions.length ? factions[0].id : null;
};

// The standing that governs a counter here, for this character. Falls back to
// the party leader, since a shop is served by whoever is in front.
Game_Factions.prototype.localStanding = function (actor) {
  const id = this.localFactionId();
  if (id === null) return 0;
  const who = actor || (window.$gameParty && $gameParty.leader ? $gameParty.leader() : null);
  return this.getReputationFor(who, id);
};

// The multiplier a marked price is quoted at. One number, so a discount and a
// surcharge can never both apply and the bands stay where the perk list says.
Game_Factions.prototype.standingPriceMultiplier = function (actor) {
  const rep = this.localStanding(actor);
  for (const [floor, off] of STANDING_DISCOUNTS) if (rep >= floor) return 1 - off;
  for (const [ceil, on] of STANDING_SURCHARGES) if (rep <= ceil) return 1 + on;
  return 1;
};

// Whether the hall will deal with the party at all.
Game_Factions.prototype.standingRefusesService = function (actor) {
  return this.localFactionId() !== null && this.localStanding(actor) <= STANDING_REFUSAL;
};

Game_Factions.prototype.standingRefusalThreshold = function () {
  return STANDING_REFUSAL;
};

//=============================================================================
// Per-character standing
//=============================================================================
//
// The number above is the world's: it is shared by every savegame of the world
// (npcs.json) and it is what every existing caller moves. It is not, however,
// what a hall thinks of the person standing in it. Each actor carries their own
// DELTA on top of it, so two travellers can be welcome in different places, and
// a delegate's seat is theirs and not the party's.
//
// The delta is a plain own property on Game_Actor, which is what puts it in the
// binary savegame (the same convention as actor._diseases and actor._cravings).
// Keys are faction ids written as strings, plus "hp:<id>" for the five
// hyperpowers that have no faction entry of their own and therefore no slot in
// the world array (Goblin Horde, Free States of Midwest, Cascadia Protectorate,
// Eastern Seaboard, Continental Union).
const FACTION_REP_MIN = -100;
const FACTION_REP_MAX = 100;

const _factionRepClamp = (v) =>
  Math.max(FACTION_REP_MIN, Math.min(FACTION_REP_MAX, Math.round(Number(v) || 0)));

// A standing key is either a faction id (number, or a numeric string) or one of
// the synthetic "hp:<id>" keys. Returns null for anything else.
Game_Factions.prototype.standingKey = function (factionId) {
  if (typeof factionId === "number" && Number.isFinite(factionId)) return String(factionId);
  const s = String(factionId == null ? "" : factionId);
  if (/^-?\d+$/.test(s)) return s;
  if (/^hp:\d+$/.test(s)) return s;
  return null;
};

// The actor's own ledger, created on first write. Read paths tolerate its
// absence so a savegame made before this existed reads as "no opinions yet".
Game_Factions.prototype.actorDeltas = function (actor) {
  if (!actor) return null;
  if (!actor._factionRep) actor._factionRep = {};
  return actor._factionRep;
};

// The world's number for a key. Synthetic "hp:" keys have no world slot, so
// they answer 0 and live entirely in the per-character ledger.
Game_Factions.prototype.baseStanding = function (factionId) {
  const key = this.standingKey(factionId);
  if (key === null || key.charAt(0) === "h") return 0;
  return this.getReputation(Number(key));
};

// What this character is worth to that faction: the world's opinion plus their
// own. Falls back to the world number when no actor is given, so a call site
// that has not been taught about characters yet keeps working.
Game_Factions.prototype.getReputationFor = function (actor, factionId) {
  const key = this.standingKey(factionId);
  if (key === null) return 0;
  const base = this.baseStanding(key);
  if (!actor) return _factionRepClamp(base);
  const deltas = actor._factionRep;
  const delta = deltas ? Number(deltas[key]) || 0 : 0;
  return _factionRepClamp(base + delta);
};

// Moves one character's opinion only. The world number is left alone: a caller
// that wants both moves both.
Game_Factions.prototype.changeReputationFor = function (actor, factionId, change) {
  const key = this.standingKey(factionId);
  if (key === null || !actor || !change) return;
  const deltas = this.actorDeltas(actor);
  // The delta is clamped against the band the total can occupy, so a character
  // cannot bank goodwill past the ceiling and spend it later.
  const base = this.baseStanding(key);
  const current = Number(deltas[key]) || 0;
  const wanted = current + Number(change);
  deltas[key] = Math.max(FACTION_REP_MIN - base, Math.min(FACTION_REP_MAX - base, Math.round(wanted)));
};

Game_Factions.prototype.setReputationFor = function (actor, factionId, value) {
  const key = this.standingKey(factionId);
  if (key === null || !actor) return;
  const deltas = this.actorDeltas(actor);
  deltas[key] = _factionRepClamp(value) - this.baseStanding(key);
};

// The same bands and colours the world number uses, read for one character.
Game_Factions.prototype.reputationLevelOf = function (reputation) {
  if (reputation >= 80) return T("Factions.repLevel.exalted");
  if (reputation >= 60) return T("Factions.repLevel.revered");
  if (reputation >= 40) return T("Factions.repLevel.honored");
  if (reputation >= 20) return T("Factions.repLevel.friendly");
  if (reputation >= -20) return T("Factions.repLevel.neutral");
  if (reputation >= -40) return T("Factions.repLevel.unfriendly");
  if (reputation >= -60) return T("Factions.repLevel.hostile");
  if (reputation >= -80) return T("Factions.repLevel.hated");
  return T("Factions.repLevel.nemesis");
};

// The nine reputation bands, low to high, as the suffix of the class and of
// the --faction-rep-* token that inks it. The ramp itself lives in the themes
// (css/themes/*.css), so the terminal preset can pitch it against black
// instead of being stuck with the parchment preset's greens.
Game_Factions.REP_BANDS = [
  [80, "exalted"], [60, "revered"], [40, "honored"], [20, "friendly"],
  [-20, "neutral"], [-40, "unfriendly"], [-60, "hostile"], [-80, "hated"],
];

Game_Factions.prototype.reputationBandOf = function (reputation) {
  for (const [floor, band] of Game_Factions.REP_BANDS) {
    if (reputation >= floor) return band;
  }
  return "nemesis";
};

// The class a DOM element carries to be inked by the band. Prefer this over
// reputationColorOf everywhere the badge is HTML: it keeps the colour in the
// stylesheet where a preset can reach it.
Game_Factions.prototype.reputationClassOf = function (reputation) {
  return "faction-rep--" + this.reputationBandOf(reputation);
};

// The literal colour of a band, resolved from the theme at call time. Only for
// the canvas windows, which cannot carry a class: Window_Base.changeTextColor
// wants a string.
Game_Factions.prototype.reputationColorOf = function (reputation) {
  const token = "--faction-rep-" + this.reputationBandOf(reputation);
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || "#ffffff";
};

Game_Factions.prototype.getReputationLevelFor = function (actor, factionId) {
  return this.reputationLevelOf(this.getReputationFor(actor, factionId));
};

Game_Factions.prototype.getReputationColorFor = function (actor, factionId) {
  return this.reputationColorOf(this.getReputationFor(actor, factionId));
};

//=============================================================================
// Hyperpower parentage
//=============================================================================
//
// `parentHyperpower` in Factions.json holds the NAME a power is filed under in
// js/db/WorldGen/Hyperpowers.json. It used to hold that power's numeric id,
// which collided with the faction ids and filed the whole Mages Guild branch
// under faction 8, the Naguka. The lore's tree is hyperpower -> the factions
// that answer to it, so that is what these resolve.

// Ordered [name, data] pairs from Hyperpowers.json, sorted by id.
Game_Factions.prototype.getHyperpowers = function () {
  const src = (window.WorldGen && window.WorldGen.Hyperpowers &&
    window.WorldGen.Hyperpowers.hyperpowers) ||
    (FactionDataManager.instance && FactionDataManager.instance._hyperpowers) || {};
  return Object.keys(src)
    .map((name) => ({ name: name, id: Number(src[name].id), data: src[name] }))
    .filter((h) => Number.isFinite(h.id))
    .sort((a, b) => a.id - b.id);
};

Game_Factions.prototype.getHyperpower = function (hyperpowerId) {
  return this.getHyperpowers().find((h) => h.id === hyperpowerId) || null;
};

// Every faction that answers to a hyperpower. `parentHyperpower` in
// Factions.json holds the power's NAME, the key it is filed under in
// Hyperpowers.json, so the two files are joined by name rather than by an id
// that used to collide with the faction ids.
Game_Factions.prototype.getHyperpowerFactions = function (hyperpowerId) {
  const hp = this.getHyperpower(hyperpowerId);
  if (!hp) return [];
  return this.getAllFactions()
    .filter((f) => f && f.parentHyperpower === hp.name)
    .sort((a, b) => a.id - b.id);
};

// The power a faction answers to, or null for an orphan. An orphan is listed in
// the book like any other faction, but it holds no seat at the assembly, takes
// no nation and cannot be sworn to.
Game_Factions.prototype.hyperpowerOfFaction = function (faction) {
  if (!faction || !faction.parentHyperpower) return null;
  return this.getHyperpowers().find((hp) => hp.name === faction.parentHyperpower) || null;
};

Game_Factions.prototype.isOrphanFaction = function (faction) {
  return !!faction && !faction.parentHyperpower;
};

// Every nation a power currently holds. The world simulation's map wins, since
// a century of conquest moves nations between powers; the country table answers
// for a world whose history was never run.
Game_Factions.prototype.countriesOfHyperpower = function (powerName) {
  const held = [];
  const sim = window.HistoryManager && window.HistoryManager.getNationsState
    ? window.HistoryManager.getNationsState() : null;
  if (sim && Object.keys(sim).length) {
    for (const [nation, info] of Object.entries(sim)) {
      if (info && info.controller === powerName) held.push(nation);
    }
    if (held.length) return held.sort();
  }
  const countries = (window.WorldGen && window.WorldGen.Countries) || [];
  return countries
    .filter((c) => c && (c.controller === powerName || (c.controller === "Neutral" && c.faction === powerName)))
    .map((c) => c.country)
    .sort();
};

// The leaders a faction can field: it has none of its own any more. It fields
// the political class of every nation its power holds, and of the nation that
// power is seated in (Leaders.json `country`). An orphan fields nobody.
Game_Factions.prototype.getFactionLeaders = function (faction) {
  const hp = this.hyperpowerOfFaction(faction);
  if (!hp) return [];
  const HM = window.HistoryManager;
  if (HM && typeof HM.leaderPoolFor === "function") {
    const pool = HM.leaderPoolFor(hp.name);
    if (pool && pool.length) return pool;
  }
  const book = (window.WorldGen && window.WorldGen.Leaders) || {};
  const nations = new Set(this.countriesOfHyperpower(hp.name));
  if (hp.data && hp.data.homeNation) nations.add(hp.data.homeNation);
  return Object.values(book).filter((l) => l && nations.has(l.country));
};

// No faction speaks for a hyperpower any longer: a power's own head faction is
// not in Factions.json at all, and its troops were handed down to the branches
// that answer to it. Kept as a null answer because a good deal of code still
// asks the question.
Game_Factions.prototype.getHyperpowerHead = function () {
  return null;
};

// The emblem a power is drawn under: its own (Hyperpowers.json `iconIndex`,
// inherited from the head faction it used to be spoken for by), or the first of
// its branches to carry one.
Game_Factions.prototype.hyperpowerIcon = function (hyperpowerId) {
  const hp = this.getHyperpower(hyperpowerId);
  if (hp && hp.data && hp.data.iconIndex) return hp.data.iconIndex;
  const branch = this.getHyperpowerFactions(hyperpowerId).find((f) => f && f.iconIndex);
  return branch ? branch.iconIndex : 0;
};

// Factions that answer to nobody: the orphans, which stand on their own.
Game_Factions.prototype.getIndependentFactions = function () {
  return this.getAllFactions()
    .filter((f) => f && !f.parentHyperpower)
    .sort((a, b) => a.id - b.id);
};

// The standing key a hyperpower is read and written through. Every power now
// has one of its own, since none of them is spoken for by a faction.
Game_Factions.prototype.hyperpowerStandingKey = function (hyperpowerId) {
  return "hp:" + hyperpowerId;
};

// The name a hyperpower is read under. Its key in Hyperpowers.json is English
// prose, so a translation is looked for first, then the localized name of the
// faction that speaks for it, and only then the raw key.
Game_Factions.prototype.hyperpowerLabel = function (hp) {
  if (!hp) return "";
  const slug = String(hp.name).toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = "Factions.power." + slug;
  if (typeof T.has === "function" && T.has(key)) return T(key);
  return hp.name;
};

//=============================================================================
// The party's own faction
//=============================================================================
//
// A party may raise one banner of its own, and only one: founding is a thing
// the world remembers, not the savegame. The record lives on $gameFactions,
// which WorldManager already keeps in the world folder (npcs.json, field
// "factions"), so every savegame of that world walks into the same faction
// with the same roll and the same allegiance.
//
// It is NOT written into the Factions.json array. That array's indices are
// what NPCSociety rolls an NPC's `factionIndex` against, and appending to it
// would both move every existing index and start handing the player's banner
// out to strangers. The screens that list factions ask for this record
// separately instead.

// Well clear of the shipped ids (Factions.json stops at 66), so a standing key
// of its own can never collide with one of theirs.
Game_Factions.PLAYER_FACTION_ID = 900;

// The emblem it flies until there is a way to choose one.
Game_Factions.PLAYER_FACTION_ICON = 84;

Game_Factions.prototype.playerFaction = function () {
  return this._playerFaction || null;
};

Game_Factions.prototype.hasPlayerFaction = function () {
  return !!this._playerFaction;
};

// A name rolled out of the word banks in the language book, so an impatient
// founder never has to type one. Rolled with Math.random rather than the world
// seed: the founder can ask for another until one of them fits.
Game_Factions.prototype.rollPlayerFactionName = function () {
  const pool = (key) => (typeof T.pool === "function" ? T.pool(key) : []);
  const pick = (key) => {
    const bank = pool(key);
    return bank.length ? bank[Math.floor(Math.random() * bank.length)] : "";
  };
  const forms = pool("Factions.player.nameForm");
  const form = forms.length ? forms[Math.floor(Math.random() * forms.length)] : "{adj} {noun}";
  const parts = {
    adj: pick("Factions.player.nameAdj"),
    noun: pick("Factions.player.nameNoun"),
    ward: pick("Factions.player.nameWard"),
  };
  const name = String(form)
    .replace(/\{(\w+)\}/g, (m, k) => parts[k] || "")
    .replace(/\s+/g, " ")
    .trim();
  return name || T("Factions.player.fallbackName");
};

// The one founding. Answers null when this world already has a banner: the
// screens ask hasPlayerFaction() first, and this is the last word on it.
Game_Factions.prototype.foundPlayerFaction = function (name) {
  if (this._playerFaction) return null;
  const typed = String(name == null ? "" : name).trim().slice(0, 48);
  this._playerFaction = {
    id: Game_Factions.PLAYER_FACTION_ID,
    name: typed || this.rollPlayerFactionName(),
    isPlayer: true,
    iconIndex: Game_Factions.PLAYER_FACTION_ICON,
    // The power it has sworn to, by name, so it reads exactly like the
    // `parentHyperpower` every other faction carries. Null is "sworn to
    // nobody", which is where a new banner starts.
    parentHyperpower: null,
    founded: this._todayStamp(),
  };
  return this._playerFaction;
};

Game_Factions.prototype.renamePlayerFaction = function (name) {
  const record = this.playerFaction();
  if (!record) return false;
  const typed = String(name == null ? "" : name).trim().slice(0, 48);
  if (!typed) return false;
  record.name = typed;
  return true;
};

// The day it was raised, in whatever the clock plugin prints. A build without
// the clock simply has no date to show.
Game_Factions.prototype._todayStamp = function () {
  const TDS = window.TimeDateSystem;
  if (TDS && typeof TDS.getDateString === "function") {
    try { return TDS.getDateString(); } catch (e) { /* no clock, no date */ }
  }
  return null;
};

// Swearing to a power. `hyperpowerId` null renounces and stands the banner up
// on its own again.
Game_Factions.prototype.swearPlayerFactionTo = function (hyperpowerId) {
  const record = this.playerFaction();
  if (!record) return false;
  if (hyperpowerId === null || hyperpowerId === undefined) {
    record.parentHyperpower = null;
    return true;
  }
  const hp = this.getHyperpower(Number(hyperpowerId));
  if (!hp) return false;
  record.parentHyperpower = hp.name;
  return true;
};

// The power it answers to, resolved, or null while it stands alone.
Game_Factions.prototype.playerFactionOverlord = function () {
  const record = this.playerFaction();
  if (!record || !record.parentHyperpower) return null;
  return this.getHyperpowers().find((hp) => hp.name === record.parentHyperpower) || null;
};

// Who has joined. Nobody is recruited into it from the outside yet: it is the
// people already sworn to the party, which is the party itself plus every
// soldier the army has hired (Army/ArmyManager.js).
Game_Factions.prototype.playerFactionRoster = function () {
  const party = [];
  const members = (window.$gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
  (members || []).forEach((m) => { if (m) party.push(m.name()); });

  const army = [];
  const troops = (window.$gameArmy && $gameArmy.getTroops) ? $gameArmy.getTroops() : [];
  (troops || []).forEach((t) => {
    if (!t) return;
    const named = FactionDataManager.instance ? FactionDataManager.instance.t(t.name) : String(t.name);
    army.push(named);
  });

  return { party: party, army: army, total: party.length + army.length };
};

// What the banner is worth as a body, for the wiki's stat line. It has no
// centuries behind it, so the numbers are the roll's own: what the party can
// do, and how many of them there are.
Game_Factions.prototype.playerFactionStats = function () {
  const members = (window.$gameParty && $gameParty.members) ? ($gameParty.members() || []) : [];
  const live = members.filter(Boolean);
  const mean = (read) => live.length
    ? Math.round(live.reduce((sum, m) => sum + (Number(read(m)) || 0), 0) / live.length)
    : 0;
  const roster = this.playerFactionRoster();
  return {
    arcane: mean((m) => m.mat || 0),
    velocity: mean((m) => m.agi || 0),
    information: Math.min(400, roster.total * 8),
  };
};

// The accord scale a median standing lands on. Standings run -100..100 and the
// accords run -2..2, so the bands are the reputation bands folded in pairs.
Game_Factions.PLAYER_ACCORD_BANDS = [[60, 2], [20, 1], [-20, 0], [-60, -1]];

// A banner raised this year has signed nothing with anybody, so what it holds
// towards a power is what the people under it hold: the MEDIAN of every party
// member's standing with that power, read on the accord scale. The median and
// not the mean, so one loathed companion cannot drag the whole faction into a
// war and one adored one cannot buy it an alliance.
Game_Factions.prototype.playerAccordValue = function (standingKey) {
  const members = (window.$gameParty && $gameParty.members)
    ? ($gameParty.members() || []).filter(Boolean) : [];
  if (!members.length) return 0;
  const values = members.map((m) => this.getReputationFor(m, standingKey)).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  for (const band of Game_Factions.PLAYER_ACCORD_BANDS) {
    if (median >= band[0]) return band[1];
  }
  return -2;
};

// The list row the faction screen prints it as, shaped exactly like the rows
// getFactionList builds for the shipped factions so every reader downstream
// (the badge, the dossier, the accords) needs no special case beyond the
// `isPlayer` flag itself.
Game_Factions.prototype.playerFactionRecord = function () {
  const record = this.playerFaction();
  if (!record) return null;
  const overlord = this.playerFactionOverlord();
  return {
    kind: "faction",
    isSub: !!overlord,
    isPlayer: true,
    faction: record,
    hyperpower: overlord,
    standingKey: String(record.id),
    name: record.name,
    iconIndex: record.iconIndex,
    children: [],
  };
};

//=============================================================================
// Diplomatic accords
//=============================================================================
//
// Who has signed what with whom. The accords are rolled ONCE, when the world is
// made, out of the world seed, and written into the world folder (npcs.json
// "diplomacy", reached through $gameSystem._factionDiplomacy), so every
// savegame of a world walks into the same geopolitics instead of each one
// rolling its own.
//
// Two layers:
//   powers   the hyperpower-to-hyperpower table, and it is symmetric: if
//            Britannia has signed nothing but threats with the Soviet Union,
//            the Soviet Union has signed the same with Britannia.
//   factions one row per faction that answers to a power. It STARTS from its
//            power's row and then drifts, because a branch is not its parent:
//            an intelligence bureau can be at war with a power its own
//            government still trades with. Independents get a row of their own.
//
// Values are the same -2..2 scale as getRelationship, so getRelationshipName
// reads them without translation.

// How likely each accord is when one is rolled from nothing. Weighted towards
// the middle: a world where every power hates every other power is not a world
// with any diplomacy left in it.
Game_Factions.ACCORD_WEIGHTS = [
  { value: -2, weight: 8 },
  { value: -1, weight: 20 },
  { value: 0, weight: 36 },
  { value: 1, weight: 24 },
  { value: 2, weight: 12 },
];

Game_Factions.prototype._accordRng = function (salt) {
  const shared = window.NPCShared;
  const seed = shared && typeof shared.worldSeed === "function" ? shared.worldSeed() >>> 0 : 1;
  let hash = 5381;
  const text = String(salt);
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  if (shared && shared.Rng) return new shared.Rng((seed ^ hash) >>> 0);
  // Standalone fallback (tests, or a build without the NPC suite): the same
  // xorshift the suite uses, so a seed means the same world either way.
  let state = ((seed ^ hash) >>> 0) || 1;
  return {
    next() {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    },
  };
};

Game_Factions.prototype._rollAccord = function (rng) {
  const table = Game_Factions.ACCORD_WEIGHTS;
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng.next() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.value;
  }
  return 0;
};

// A branch's own line on one power, drifted off whatever its parent signed.
// Most of the row is inherited - a branch that agreed with its government about
// nothing would not still be one of its branches - so roughly a third of the
// columns move, and only rarely by the two steps that make a real break.
Game_Factions.prototype._driftAccord = function (rng, base) {
  const roll = rng.next();
  let value = base;
  if (roll < 0.05) value = base + 2;
  else if (roll < 0.19) value = base + 1;
  else if (roll < 0.31) value = base - 1;
  else if (roll < 0.35) value = base - 2;
  return Math.max(-2, Math.min(2, value));
};

// Roll the whole table. Called once per world, by the world initializer below.
Game_Factions.prototype.generateDiplomacy = function () {
  const powers = this.getHyperpowers();
  if (!powers.length) return null;

  const table = { version: 1, powers: {}, factions: {} };

  powers.forEach((hp) => { table.powers[hp.id] = {}; });
  powers.forEach((a, i) => {
    powers.slice(i + 1).forEach((b) => {
      const rng = this._accordRng("accord:" + a.id + ":" + b.id);
      const value = this._rollAccord(rng);
      table.powers[a.id][b.id] = value;
      table.powers[b.id][a.id] = value;
    });
  });

  this.getAllFactions().forEach((faction) => {
    if (!faction) return;
    const rng = this._accordRng("accord:faction:" + faction.id);
    const parentPower = this.hyperpowerOfFaction(faction);
    const parent = parentPower ? parentPower.id : undefined;
    const row = {};
    powers.forEach((hp) => {
      if (parent !== undefined && hp.id === parent) {
        // Its own power: a branch is loyal by default, and only rarely not.
        row[hp.id] = rng.next() < 0.15 ? this._driftAccord(rng, 1) : 2;
        return;
      }
      const base = parent !== undefined ? (table.powers[parent] || {})[hp.id] : undefined;
      row[hp.id] = base === undefined ? this._rollAccord(rng) : this._driftAccord(rng, base);
    });
    table.factions[faction.id] = row;
  });

  return table;
};

// The world's table, rolled on first ask if the world predates this system.
Game_Factions.prototype.diplomacy = function () {
  if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
  let table = $gameSystem._factionDiplomacy;
  if (table && table.powers) return table;
  table = this.generateDiplomacy();
  if (table) $gameSystem._factionDiplomacy = table;
  return table;
};

Game_Factions.prototype.getPowerAccord = function (hyperpowerIdA, hyperpowerIdB) {
  if (hyperpowerIdA === hyperpowerIdB) return 2;
  const table = this.diplomacy();
  const row = table && table.powers ? table.powers[hyperpowerIdA] : null;
  const value = row ? row[hyperpowerIdB] : undefined;
  return value === undefined ? 0 : value;
};

// What one faction has signed with one power. A faction that speaks for a power
// answers with that power's own line, so the head and the power never disagree.
Game_Factions.prototype.getFactionAccord = function (factionId, hyperpowerId) {
  const faction = this.getFaction(factionId);
  if (!faction) return 0;
  const table = this.diplomacy();
  const row = table && table.factions ? table.factions[factionId] : null;
  const value = row ? row[hyperpowerId] : undefined;
  if (value !== undefined) return value;
  // No row: fall back to whatever its power signed, and to nothing at all for
  // an independent.
  const parentPower = this.hyperpowerOfFaction(faction);
  if (parentPower) return this.getPowerAccord(parentPower.id, hyperpowerId);
  return 0;
};

// Every accord one list entry holds, one per hyperpower, in the powers' own
// order. A power is not listed against itself; a BRANCH is listed against its
// own parent, because that line is the interesting one - a branch that has
// drifted off its government's row can be reading it as hostile.
Game_Factions.prototype.getAccordsFor = function (record) {
  if (!record) return [];
  const isPower = record.kind === "hyperpower";
  if (!isPower && !record.faction) return [];
  // The party's own banner is not in the rolled table at all: its line with
  // each power is the party's own median standing (playerAccordValue).
  const isPlayer = !isPower && !!record.faction.isPlayer;

  return this.getHyperpowers()
    .filter((hp) => !isPower || hp.id !== record.hyperpower.id)
    .map((hp) => {
      const value = isPower
        ? this.getPowerAccord(record.hyperpower.id, hp.id)
        : isPlayer
          ? this.playerAccordValue(this.hyperpowerStandingKey(hp.id))
          : this.getFactionAccord(record.faction.id, hp.id);
      return {
        hyperpower: hp,
        name: this.hyperpowerLabel(hp),
        value: value,
        isOwnPower: !isPower && record.faction.parentHyperpower === hp.name,
      };
    });
};

Game_Factions.prototype.getRelationship = function (factionId1, factionId2) {
  // Return 0 if relationships aren't initialized
  if (!FactionDataManager.instance || !FactionDataManager.instance._relationships) {
    return 0;
  }

  if (
    factionId1 >= 0 &&
    factionId1 < FactionDataManager.instance._factions.length &&
    factionId2 >= 0 &&
    factionId2 < FactionDataManager.instance._factions.length
  ) {
    return FactionDataManager.instance._relationships[factionId1][factionId2];
  }
  return 0;
};

Game_Factions.prototype.getRelationshipName = function (
  factionId1,
  factionId2
) {
  return this.relationshipNameOf(this.getRelationship(factionId1, factionId2));
};

// The same five words, read off a bare -2..2 value: the diplomatic accords are
// scored on that scale too and name themselves through here.
Game_Factions.prototype.relationshipNameOf = function (relationship) {
  switch (relationship) {
    case 2:
      return T("Factions.relation.allied");
    case 1:
      return T("Factions.relation.friendly");
    case 0:
      return T("Factions.relation.neutral");
    case -1:
      return T("Factions.relation.unfriendly");
    case -2:
      return T("Factions.relation.hostile");
    default:
      return T("Factions.relation.unknown");
  }
};

Game_Factions.prototype.getAllFactions = function () {
  return FactionDataManager.instance._factions;
};

// Factions are found by their own `id`, never by their slot in the file: the
// heads that used to sit in Factions.json are gone and the ids that are left
// have gaps in them (js/db/WorldGen/Factions.json).
Game_Factions.prototype.getFaction = function (factionId) {
  const id = Number(factionId);
  if (!Number.isFinite(id)) return null;
  const all = FactionDataManager.instance._factions || [];
  return all.find((f) => f && f.id === id) || null;
};

Game_Factions.prototype.getFactionsByType = function (typeName, variableId) {
  let factionIds = [];

  // Map faction types to indices
  const typeIndices = {
    hardcoded: [0, 1, 2],
  };

  // Get faction IDs by type
  if (typeIndices[typeName]) {
    factionIds = typeIndices[typeName];
  }

  // Store count in variableId
  $gameVariables.setValue(variableId, factionIds.length);

  // Store faction IDs in subsequent variables
  for (let i = 0; i < factionIds.length; i++) {
    $gameVariables.setValue(variableId + i + 1, factionIds[i]);
  }
};

Game_Factions.prototype.getHighestReputationFaction = function (variableId) {
  let highestRepFaction = 0;
  let highestRep = -101;

  for (let i = 0; i < this._reputations.length; i++) {
    if (this._reputations[i] > highestRep) {
      highestRep = this._reputations[i];
      highestRepFaction = i;
    }
  }

  $gameVariables.setValue(variableId, highestRepFaction);
};

Game_Factions.prototype.getLowestReputationFaction = function (variableId) {
  let lowestRepFaction = 0;
  let lowestRep = 101;

  for (let i = 0; i < this._reputations.length; i++) {
    if (this._reputations[i] < lowestRep) {
      lowestRep = this._reputations[i];
      lowestRepFaction = i;
    }
  }

  $gameVariables.setValue(variableId, lowestRepFaction);
};

Game_Factions.prototype.checkQuestAvailability = function (
  questId,
  factionId,
  requiredRep,
  switchId
) {
  const reputation = this.getReputation(factionId);
  const isAvailable = reputation >= requiredRep;

  $gameSwitches.setValue(switchId, isAvailable);
};

Game_Factions.prototype.getAvailableQuestCount = function (
  factionId,
  variableId
) {
  // This is a placeholder function that would normally check quest data
  // For now, we'll simulate based on reputation
  const reputation = this.getReputation(factionId);
  let questCount = 0;

  if (reputation >= -20) questCount += 1;
  if (reputation >= 20) questCount += 1;
  if (reputation >= 40) questCount += 1;
  if (reputation >= 60) questCount += 2;
  if (reputation >= 80) questCount += 3;

  $gameVariables.setValue(variableId, questCount);
};

//=============================================================================
// DataManager Integration
//=============================================================================

const _DataManager_createGameObjects = DataManager.createGameObjects;
DataManager.createGameObjects = function () {
  _DataManager_createGameObjects.call(this);
  // A new game in an existing world continues that world's reputations.
  const worldFactions = window.WorldManager && window.WorldManager.activeWorldName
    ? window.WorldManager.getField("npcs", "factions")
    : null;
  $gameFactions = worldFactions || new Game_Factions();
};

const _DataManager_makeSaveContents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function () {
  const contents = _DataManager_makeSaveContents.call(this);
  // Faction reputations are world state: they live in the world folder
  // (npcs.json) instead of the binary savegame.
  if (window.WorldManager) {
    window.WorldManager.setField("npcs", "factions", $gameFactions);
  } else {
    contents.factions = $gameFactions;
  }
  return contents;
};

const _DataManager_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function (contents) {
  _DataManager_extractSaveContents.call(this, contents);
  const worldFactions = window.WorldManager
    ? window.WorldManager.getField("npcs", "factions")
    : null;
  $gameFactions = worldFactions || contents.factions;
  if (!$gameFactions) {
    $gameFactions = new Game_Factions();
  }
  // Migrate factions from old saves into the world store
  if (window.WorldManager && !worldFactions && contents.factions) {
    window.WorldManager.setField("npcs", "factions", contents.factions);
  }
  // Re-establish the singleton instance on the loaded object if it's lost
  if ($gameFactions && !FactionDataManager.instance) {
    FactionDataManager.instance = new FactionDataManager();
  }
};
