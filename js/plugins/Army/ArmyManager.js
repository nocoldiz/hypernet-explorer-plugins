/*:
 * @plugindesc Mount & Blade style Army Management System v1.1.0 [Claude+GPT]
 * @author Omni-Lex & Antigravity
 * @target MZ
 *
 * @param showInMenu
 * @text Show in Menu
 * @type boolean
 * @default true
 * @desc Whether to add the Army option to the main menu.
 *
 * @param menuText
 * @text Menu Command Text
 * @type string
 * @default Army
 * @desc The text shown for the Army command in the menu.
 *
 * @param maxArmySize
 * @text Maximum Army Size
 * @type number
 * @min 1
 * @max 999
 * @default 100
 * @desc Maximum number of troops you can have in your army.
 *
 * @command buyTroops
 * @text Buy Troops
 * @desc Opens the troop recruitment window.
 * @arg factionId
 * @type number
 * @min -1
 * @default -1
 * @desc The faction ID to recruit from (-1 for all factions).
 *
 * @command debugAddTroops
 * @text Debug: Add All Faction Troops
 * @desc [DEBUG] Adds all troop types from a random faction (10 of each type).
 *
 * @help
 * Army Management System - Mount & Blade Warband Style
 *
 * Refactored to support the D&D Parchment Double-Page Pockets Layout.
 */

var Imported = Imported || {};
Imported.ArmyManager = true;

var ArmyManager = ArmyManager || {};
ArmyManager.Params = PluginManager.parameters("ArmyManager");

ArmyManager.Params.showInMenu = String(ArmyManager.Params.showInMenu || "true").toLowerCase() === "true";
ArmyManager.Params.menuText = T.param(ArmyManager.Params.menuText, 'ArmyManager.menu');
ArmyManager.Params.maxArmySize = Number(ArmyManager.Params.maxArmySize || 100);

// Troop data stores role as a dotted i18n key ("roles.support"), matching
// the "roles.<key>" bank in js/i18n/<lang>/roles.json. Icon markers: real
// IconSet glyphs (indices per js/db/Sprites/Icons.json) instead of emoji.
// Close quarters is the default when a troop has no special role.
const ARMY_ROLE_ICONS = { support: 176, ranged: 370, closequarters: 322, scientist: 186 };

// The last path segment of a "roles.xxx" / "factions.xxx" key, used to key
// into ARMY_ROLE_ICONS without needing the full dotted path.
function armyKeyTail(key) {
  const s = String(key || "");
  const i = s.lastIndexOf(".");
  return i >= 0 ? s.slice(i + 1) : s;
}

// Resolves any dotted i18n path stored on troop/faction data (name, role,
// description, ...) through the Faction data set's own translator, which
// already loads faction.json/roles.json/formations.json for the active
// language and falls back to English when a translation is missing. Not a
// key path (no dot, or FactionDataManager isn't ready yet) simply passes
// the value through unchanged.
function armyT(key) {
  if (!key) return "";
  if (String(key).indexOf(".") < 0) return key;
  if (!window.FactionDataManager || !FactionDataManager.instance) return key;
  return FactionDataManager.instance.t(key);
}

function armyIconHTML(iconIndex, size = 18) {
  const x = (iconIndex % 16) * size;
  const y = Math.floor(iconIndex / 16) * size;
  return `<span class="army-01" style="width:${size}px; height:${size}px; background-size:${size * 16}px auto; ` +
    `background-position:-${x}px -${y}px"></span>`;
}

function armyRoleIconHTML(role, size = 18) {
  const tail = armyKeyTail(role);
  return armyIconHTML(ARMY_ROLE_ICONS[tail] || ARMY_ROLE_ICONS.closequarters, size);
}

function armyRoleLabel(role) {
  return armyT(role) || armyKeyTail(role);
}

let _statsI18n = null;

const _loadStatsI18n = async () => {
  const lang = ConfigManager.language || 'en';
  const url = `js/i18n/${lang}/stats.json`;
  try {
    const response = await fetch(url);
    _statsI18n = await response.json();
  } catch (e) {
    console.error('ArmyManager: Failed to load i18n data from ' + url, e);
  }
};

const _si18n = (key) => {
  if (_statsI18n && _statsI18n[key]) {
    return _statsI18n[key];
  }
  return key;
};

_loadStatsI18n();

// Get localized stat label
function getStatLabel(stat) {
  const labels = {
    HP: _si18n("HP"),
    MP: _si18n("MP"),
    ATK: _si18n("ATT"),
    DEF: _si18n("CON"),
    MAT: _si18n("M.ATT"),
    MDF: _si18n("M.DEF"),
    AGI: _si18n("AGILITY"),
    LUK: _si18n("LUCK")
  };

  return labels[stat] || stat;
}

//=============================================================================
// Game_Army - Manages army data
//=============================================================================

// Declared up front the way the engine declares its own $game globals, so that a
// reference reaching this before DataManager.createGameObjects sees null rather
// than throwing a ReferenceError.
$gameArmy = null;

function Game_Army() {
  this.initialize(...arguments);
}

Game_Army.prototype.initialize = function () {
  this._troops = []; // Array of troop objects
  this._nextTroopId = 1;
  this._squads = []; // Array of squad objects
  this._nextSquadId = 1;
};

Game_Army.prototype.getTroops = function () {
  return this._troops;
};

Game_Army.prototype.getTroopCount = function () {
  return this._troops.length;
};

Game_Army.prototype.canRecruitMore = function () {
  return this._troops.length < ArmyManager.Params.maxArmySize;
};

Game_Army.prototype.addTroop = function (factionId, troopData) {
  if (!this.canRecruitMore()) {
    return false;
  }

  const troop = {
    id: this._nextTroopId++,
    factionId: factionId,
    name: troopData.name,
    hp: troopData.hp,
    mp: troopData.mp,
    atk: troopData.atk,
    def: troopData.def,
    mat: troopData.mat,
    mdf: troopData.mdf,
    agi: troopData.agi,
    luk: troopData.luk,
    hiringCost: troopData.hiringCost,
    weeklyCost: troopData.weeklyCost,
    role: troopData.role, // Store role for icon display
    // The Skab sheet the troop is drawn with on the battlefield
    formation: troopData.formation,
    spritename: troopData.spritename,
    spriteindex: troopData.spriteindex || 0,
    squadId: null // Not in a squad by default
  };

  this._troops.push(troop);
  return true;
};

Game_Army.prototype.removeTroop = function (troopId) {
  const index = this._troops.findIndex(t => t.id === troopId);
  if (index >= 0) {
    // Remove from squad if assigned
    const troop = this._troops[index];
    if (troop.squadId) {
      this.removeTroopFromSquad(troopId);
    }
    this._troops.splice(index, 1);
    return true;
  }
  return false;
};

Game_Army.prototype.getTotalWeeklyCost = function () {
  return this._troops.reduce((sum, troop) => sum + troop.weeklyCost, 0);
};

Game_Army.prototype.getCoherence = function () {
  if (this._troops.length === 0) return 100;

  // Count troops by faction
  const factionCounts = {};
  for (const troop of this._troops) {
    factionCounts[troop.factionId] = (factionCounts[troop.factionId] || 0) + 1;
  }

  // Find largest faction group
  const maxCount = Math.max(...Object.values(factionCounts));

  // Coherence is percentage of largest faction group
  return Math.floor((maxCount / this._troops.length) * 100);
};

Game_Army.prototype.getFactionBreakdown = function () {
  const breakdown = {};

  for (const troop of this._troops) {
    if (!breakdown[troop.factionId]) {
      const faction = $gameFactions ? $gameFactions.getFaction(troop.factionId) : null;

      let factionName = T('ArmyManager.unknownFaction');
      if (faction) {
        factionName = armyT(faction.name);
      }

      breakdown[troop.factionId] = {
        name: factionName,
        count: 0
      };
    }
    breakdown[troop.factionId].count++;
  }

  return breakdown;
};

//=============================================================================
// Squad Management
//=============================================================================

Game_Army.prototype.getSquads = function () {
  return this._squads;
};

Game_Army.prototype.createSquad = function (troopName) {
  const squad = {
    id: this._nextSquadId++,
    name: troopName,
    leaderId: null, // Actor ID of the leader
    troopIds: [] // Array of troop IDs in this squad
  };
  this._squads.push(squad);
  return squad;
};

Game_Army.prototype.getSquadById = function (squadId) {
  return this._squads.find(s => s.id === squadId);
};

Game_Army.prototype.assignLeaderToSquad = function (squadId, actorId) {
  const squad = this.getSquadById(squadId);
  if (squad) {
    squad.leaderId = actorId;
    return true;
  }
  return false;
};

Game_Army.prototype.removeLeaderFromSquad = function (squadId) {
  const squad = this.getSquadById(squadId);
  if (squad) {
    squad.leaderId = null;
    return true;
  }
  return false;
};

Game_Army.prototype.addTroopToSquad = function (troopId, squadId) {
  const troop = this._troops.find(t => t.id === troopId);
  const squad = this.getSquadById(squadId);

  if (!troop || !squad) return false;

  // Verify troop name matches squad
  if (troop.name !== squad.name) return false;

  // Remove from old squad if any
  if (troop.squadId) {
    this.removeTroopFromSquad(troopId);
  }

  troop.squadId = squadId;
  if (!squad.troopIds.includes(troopId)) {
    squad.troopIds.push(troopId);
  }
  return true;
};

Game_Army.prototype.removeTroopFromSquad = function (troopId) {
  const troop = this._troops.find(t => t.id === troopId);
  if (!troop || !troop.squadId) return false;

  const squad = this.getSquadById(troop.squadId);
  if (squad) {
    const index = squad.troopIds.indexOf(troopId);
    if (index >= 0) {
      squad.troopIds.splice(index, 1);
    }

    // Remove empty squads
    if (squad.troopIds.length === 0) {
      const squadIndex = this._squads.findIndex(s => s.id === squad.id);
      if (squadIndex >= 0) {
        this._squads.splice(squadIndex, 1);
      }
    }
  }

  troop.squadId = null;
  return true;
};

Game_Army.prototype.getTroopWithBonuses = function (troopId) {
  const troop = this._troops.find(t => t.id === troopId);
  if (!troop) return null;

  const troopWithBonuses = { ...troop };

  if (troop.squadId) {
    const squad = this.getSquadById(troop.squadId);
    if (squad && squad.leaderId) {
      const leader = $gameActors.actor(squad.leaderId);
      if (leader) {
        const bonusPercent = 0.08;
        troopWithBonuses.hp = Math.floor(troop.hp + leader.mhp * bonusPercent);
        troopWithBonuses.mp = Math.floor(troop.mp + leader.mmp * bonusPercent);
        troopWithBonuses.atk = Math.floor(troop.atk + leader.atk * bonusPercent);
        troopWithBonuses.def = Math.floor(troop.def + leader.def * bonusPercent);
        troopWithBonuses.mat = Math.floor(troop.mat + leader.mat * bonusPercent);
        troopWithBonuses.mdf = Math.floor(troop.mdf + leader.mdf * bonusPercent);
        troopWithBonuses.agi = Math.floor(troop.agi + leader.agi * bonusPercent);
        troopWithBonuses.luk = Math.floor(troop.luk + leader.luk * bonusPercent);
        troopWithBonuses.hasLeader = true;
        troopWithBonuses.leaderName = leader.name();
      }
    }
  }

  return troopWithBonuses;
};

Game_Army.prototype.autoOrganizeSquads = function () {
  const troopsByName = {};
  for (const troop of this._troops) {
    if (!troopsByName[troop.name]) {
      troopsByName[troop.name] = [];
    }
    troopsByName[troop.name].push(troop);
  }

  for (const troopName in troopsByName) {
    const troops = troopsByName[troopName];
    if (troops.length >= 2) {
      let squad = this._squads.find(s => s.name === troopName);
      if (!squad) {
        squad = this.createSquad(troopName);
      }

      for (const troop of troops) {
        this.addTroopToSquad(troop.id, squad.id);
      }
    }
  }
};

//=============================================================================
// Workforce: "scientist" role troops never fight (see ArmyBattleView.js
// _setupPlayerArmy/_setupEnemyArmy), instead they passively work the party's
// active Tech Tree research project (ProceduralTechTree.js) every game day.
//=============================================================================
function isScientistTroop(troop) {
  return /scientist/i.test(String((troop && troop.role) || ""));
}

Game_Army.prototype.getScientistTroops = function () {
  return this._troops.filter(isScientistTroop);
};

// Delivers a day's worth of materials for the active research project
// straight into the party's inventory, one line per required material
// (all of them advance together, not one material at a time).
Game_Army.prototype.produceDailyMaterials = function () {
  if (!window.ProceduralTechTree || !$gameParty) return;
  if (!this.getScientistTroops().length) return;

  const project = window.ProceduralTechTree.getActiveProject();
  if (!project) return;
  const tree = window.ProceduralTechTree.treeById(project.treeId);
  const node = tree && tree.byId[project.nodeId];
  if (!node) return;

  const output = window.ProceduralTechTree.workforceDailyOutput(node);
  const delivered = [];
  output.forEach(m => {
    if (m.qty <= 0) return;
    const item = $dataItems[m.id];
    if (!item) return;
    $gameParty.gainItem(item, m.qty);
    delivered.push({ item: item, qty: m.qty });
  });

  if (delivered.length && window.ParchmentToast && typeof window.ParchmentToast.show === "function") {
    const dbName = it => (typeof window.translateText === "function") ? window.translateText(it.name) : it.name;
    const names = delivered.map(d => `${dbName(d.item)} x${d.qty}`).join(", ");
    window.ParchmentToast.show(T('ArmyManager.workforceDelivered', { list: names }), { severity: "info", duration: 150 });
  }
};

// Runs once per in-game day (Variable 113's date string rolling over), the
// same day-boundary pattern RealEstateMarket.js uses for its own daily tick.
let _armyWorkforceRawDate = null;
let _armyWorkforceDayKeyCache = "";
function armyWorkforceDayKey() {
  const dateStr = ($gameVariables && $gameVariables.value(113)) || "";
  if (dateStr === _armyWorkforceRawDate) return _armyWorkforceDayKeyCache;
  _armyWorkforceRawDate = dateStr;
  const parts = String(dateStr).split(" ").filter(Boolean);
  _armyWorkforceDayKeyCache = parts.slice(0, 3).join(" ");
  return _armyWorkforceDayKeyCache;
}

let _armyWorkforceFrameTick = 0;
const _Scene_Map_update_ArmyWorkforce = Scene_Map.prototype.update;
Scene_Map.prototype.update = function () {
  _Scene_Map_update_ArmyWorkforce.call(this);
  if (typeof $gameArmy === "undefined" || !$gameArmy || !$gameSystem) return;
  if (++_armyWorkforceFrameTick < 60) return;
  _armyWorkforceFrameTick = 0;
  const dayKey = armyWorkforceDayKey();
  if (!dayKey) return;
  if ($gameSystem._armyLastProductionDayKey === undefined) {
    $gameSystem._armyLastProductionDayKey = dayKey;
    return;
  }
  if ($gameSystem._armyLastProductionDayKey !== dayKey) {
    $gameSystem._armyLastProductionDayKey = dayKey;
    $gameArmy.produceDailyMaterials();
  }
};

//=============================================================================
// DataManager Integration
//=============================================================================

const _DataManager_createGameObjects_ArmyManager = DataManager.createGameObjects;
DataManager.createGameObjects = function () {
  _DataManager_createGameObjects_ArmyManager.call(this);
  $gameArmy = new Game_Army();
};

const _DataManager_makeSaveContents_ArmyManager = DataManager.makeSaveContents;
DataManager.makeSaveContents = function () {
  const contents = _DataManager_makeSaveContents_ArmyManager.call(this);
  contents.army = $gameArmy;
  return contents;
};

const _DataManager_extractSaveContents_ArmyManager = DataManager.extractSaveContents;
DataManager.extractSaveContents = function (contents) {
  _DataManager_extractSaveContents_ArmyManager.call(this, contents);
  $gameArmy = contents.army || new Game_Army();
};

//=============================================================================
// UI Styles Injections
//=============================================================================
function loadUIArmyResources() {

}

//=============================================================================
// Keyboard Input Managers
//=============================================================================
class UIArmyInputManager {
  static init(container, scene) {
    this.container = container;
    this.scene = scene;
    this.active = false;
  }
  static activate() { this.active = true; }
  static deactivate() { this.active = false; }
  static update() {
    if (!this.active) return;

    // If confirmation dialog is open
    if (this.scene._confirmOpen) {
      if (Input.isTriggered('left') || Input.isTriggered('right')) {
        SoundManager.playCursor();
        this.scene._confirmChoice = this.scene._confirmChoice === 'yes' ? 'no' : 'yes';
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('ok')) {
        // Confirm on the highlighted answer is the same call the click makes,
        // so the keyboard and the pointer walk one path.
        this.scene.confirmRelease(this.scene._confirmChoice);
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene._confirmOpen = false;
        this.scene.refreshUIDOM();
      }
      return;
    }

    // L1/R1 cycle between the command and troop tabs from anywhere
    if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
      SoundManager.playCursor();
      this.scene._activeTab = this.scene._activeTab === 'commands' ? 'troops' : 'commands';
      this.scene.refreshUIDOM();
      return;
    }

    if (this.scene._activeTab === 'commands') {
      const cmdCount = this.scene.commandList().length;
      if (Input.isTriggered('down')) {
        SoundManager.playCursor();
        this.scene._commandIndex = (this.scene._commandIndex + 1) % cmdCount;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('up')) {
        SoundManager.playCursor();
        this.scene._commandIndex = (this.scene._commandIndex - 1 + cmdCount) % cmdCount;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('ok')) {
        this.scene.handleCommandOk();
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene.popScene();
      }
    } else if (this.scene._activeTab === 'troops') {
      const troops = $gameArmy.getTroops();
      if (troops.length === 0) return;

      if (Input.isTriggered('down')) {
        SoundManager.playCursor();
        this.scene._troopIndex = (this.scene._troopIndex + 1) % troops.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('up')) {
        SoundManager.playCursor();
        this.scene._troopIndex = (this.scene._troopIndex - 1 + troops.length) % troops.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('ok')) {
        this.scene.promptReleaseTroop(this.scene._troopIndex);
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene._activeTab = 'commands';
        this.scene.refreshUIDOM();
      }
    }
  }
}

class UIBuyTroopsInputManager {
  static init(container, scene) {
    this.container = container;
    this.scene = scene;
    this.active = false;
  }
  static activate() { this.active = true; }
  static deactivate() { this.active = false; }
  static update() {
    if (!this.active) return;
    const shop = this.scene._troopShopWindow;
    if (!shop) return;
    const maxItems = shop.maxItems();
    if (maxItems === 0) {
      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene.popScene();
      }
      return;
    }

    if (Input.isTriggered('down')) {
      SoundManager.playCursor();
      this.scene.updateSelection(this.scene._selectedIndex + 1);
    } else if (Input.isTriggered('up')) {
      SoundManager.playCursor();
      this.scene.updateSelection(this.scene._selectedIndex - 1);
    } else if (Input.isTriggered('ok')) {
      this.scene.buyTroopAtIndex(this.scene._selectedIndex);
    } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
      SoundManager.playCancel();
      this.scene.popScene();
    }
  }
}

class UISquadsInputManager {
  static init(container, scene) {
    this.container = container;
    this.scene = scene;
    this.active = false;
  }
  static activate() { this.active = true; }
  static deactivate() { this.active = false; }
  static update() {
    if (!this.active) return;

    if (this.scene._activeTab === 'squads') {
      const squads = $gameArmy.getSquads();
      if (squads.length === 0) {
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
          SoundManager.playCancel();
          this.scene.popScene();
        }
        return;
      }

      if (Input.isTriggered('down')) {
        SoundManager.playCursor();
        this.scene._squadIndex = (this.scene._squadIndex + 1) % squads.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('up')) {
        SoundManager.playCursor();
        this.scene._squadIndex = (this.scene._squadIndex - 1 + squads.length) % squads.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('ok')) {
        SoundManager.playOk();
        this.scene._activeTab = 'leaders';
        this.scene._leaderIndex = 0;
        this.scene.refreshLeaderList();
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene.popScene();
      }
    } else if (this.scene._activeTab === 'leaders') {
      const leaders = this.scene._leadersList;
      if (leaders.length === 0) return;

      if (Input.isTriggered('down')) {
        SoundManager.playCursor();
        this.scene._leaderIndex = (this.scene._leaderIndex + 1) % leaders.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('up')) {
        SoundManager.playCursor();
        this.scene._leaderIndex = (this.scene._leaderIndex - 1 + leaders.length) % leaders.length;
        this.scene.refreshUIDOM();
      } else if (Input.isTriggered('ok')) {
        this.scene.selectLeaderAtIndex(this.scene._leaderIndex);
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene._activeTab = 'squads';
        this.scene.refreshUIDOM();
      }
    }
  }
}

//=============================================================================
// Scene and Window Definitions (Standard MZ Boilerplate & Dummies)
//=============================================================================

function Scene_Army() {
  this.initialize(...arguments);
}
Scene_Army.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Army.prototype.constructor = Scene_Army;
Scene_Army.prototype.initialize = function () {
  Scene_MenuBase.prototype.initialize.call(this);
};
window.Scene_Army = Scene_Army;

function Scene_BuyTroops() {
  this.initialize(...arguments);
}
Scene_BuyTroops.prototype = Object.create(Scene_MenuBase.prototype);
Scene_BuyTroops.prototype.constructor = Scene_BuyTroops;
Scene_BuyTroops.prototype.initialize = function () {
  Scene_MenuBase.prototype.initialize.call(this);
};
Scene_BuyTroops.prototype.prepare = function (factionId) {
  this._factionId = factionId;
};
window.Scene_BuyTroops = Scene_BuyTroops;

function Scene_Squads() {
  this.initialize(...arguments);
}
Scene_Squads.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Squads.prototype.constructor = Scene_Squads;
Scene_Squads.prototype.initialize = function () {
  Scene_MenuBase.prototype.initialize.call(this);
};
window.Scene_Squads = Scene_Squads;

// Dummy Windows inheriting from Window_Base
function Window_ArmyInfo() {
  this.initialize(...arguments);
}
Window_ArmyInfo.prototype = Object.create(Window_Base.prototype);
Window_ArmyInfo.prototype.constructor = Window_ArmyInfo;
Window_ArmyInfo.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_ArmyInfo = Window_ArmyInfo;

function Window_ArmyCommand() {
  this.initialize(...arguments);
}
Window_ArmyCommand.prototype = Object.create(Window_Base.prototype);
Window_ArmyCommand.prototype.constructor = Window_ArmyCommand;
Window_ArmyCommand.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_ArmyCommand = Window_ArmyCommand;

function Window_TroopList() {
  this.initialize(...arguments);
}
Window_TroopList.prototype = Object.create(Window_Base.prototype);
Window_TroopList.prototype.constructor = Window_TroopList;
Window_TroopList.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_TroopList = Window_TroopList;

function Window_TroopStats() {
  this.initialize(...arguments);
}
Window_TroopStats.prototype = Object.create(Window_Base.prototype);
Window_TroopStats.prototype.constructor = Window_TroopStats;
Window_TroopStats.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_TroopStats = Window_TroopStats;

function Window_RecruitStats() {
  this.initialize(...arguments);
}
Window_RecruitStats.prototype = Object.create(Window_Base.prototype);
Window_RecruitStats.prototype.constructor = Window_RecruitStats;
Window_RecruitStats.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_RecruitStats = Window_RecruitStats;

function Window_SquadList() {
  this.initialize(...arguments);
}
Window_SquadList.prototype = Object.create(Window_Base.prototype);
Window_SquadList.prototype.constructor = Window_SquadList;
Window_SquadList.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_SquadList = Window_SquadList;

function Window_LeaderSelect() {
  this.initialize(...arguments);
}
Window_LeaderSelect.prototype = Object.create(Window_Base.prototype);
Window_LeaderSelect.prototype.constructor = Window_LeaderSelect;
Window_LeaderSelect.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
};
window.Window_LeaderSelect = Window_LeaderSelect;

function Window_TroopShop() {
  this.initialize(...arguments);
}
Window_TroopShop.prototype = Object.create(Window_Base.prototype);
Window_TroopShop.prototype.constructor = Window_TroopShop;
Window_TroopShop.prototype.initialize = function (rect) {
  Window_Base.prototype.initialize.call(this, rect);
  this._factionId = -1;
  this._data = [];
};
Window_TroopShop.prototype.setFactionFilter = function (factionId) {
  this._factionId = factionId;
  this.makeItemList();
};
Window_TroopShop.prototype.makeItemList = function () {
  this._data = [];
  const allFactions = $gameFactions ? $gameFactions.getAllFactions() : [];
  const targetFactions = this._factionId === -1 ? allFactions : allFactions.filter(f => f.id === this._factionId);
  for (const f of targetFactions) {
    if (f.troops) {
      for (const troop of f.troops) {
        this._data.push({ factionId: f.id, troop: troop });
      }
    }
  }
};
Window_TroopShop.prototype.maxItems = function () {
  return this._data ? this._data.length : 0;
};
window.Window_TroopShop = Window_TroopShop;

//=============================================================================
// Scene_Army - Main army management scene
//=============================================================================

Scene_Army.prototype.create = function () {
  loadUIArmyResources();
  Scene_MenuBase.prototype.create.call(this);

  if (this._windowLayer) {
    this._windowLayer.visible = false;
  }
  if (this._cancelButton) {
    this._cancelButton.visible = false;
  }

  this._activeTab = 'commands'; // 'commands' or 'troops'
  this._commandIndex = 0;
  this._troopIndex = 0;
  this._confirmOpen = false;
  this._confirmChoice = 'no';
  this._troopToRelease = null;

  this.createDummyWindows();
  this.createUIDOM();
};

Scene_Army.prototype.createDummyWindows = function () {
  const rect = new Rectangle(0, 0, 0, 0);
  this._helpWindow = new Window_Help(rect);
  this._infoWindow = new Window_ArmyInfo(rect);
  this._commandWindow = new Window_ArmyCommand(rect);
  this._troopListWindow = new Window_TroopList(rect);
  this._statsWindow = new Window_TroopStats(rect);
  this._helpWindow.visible = false;
  this._infoWindow.visible = false;
  this._commandWindow.visible = false;
  this._troopListWindow.visible = false;
  this._statsWindow.visible = false;
  this.addWindow(this._helpWindow);
  this.addWindow(this._infoWindow);
  this.addWindow(this._commandWindow);
  this.addWindow(this._troopListWindow);
  this.addWindow(this._statsWindow);
};

// In an Em playthrough the camp is her own force, so the page wears the same
// name the main menu gives it (CharacterCreationPresets.emLabel).
function armyPageTitle() {
  const base = T('ArmyManager.armyOverview');
  const CP = window.CharacterPresets;
  if (CP && CP.emLabel && CP.isEmPlaythrough && CP.isEmPlaythrough()) {
    return CP.emLabel("menuWorkforce", base);  // i18n-ignore  label key
  }
  return base;
}

Scene_Army.prototype.createUIDOM = function () {
  this._dndContainer = document.createElement('div');
  this._dndContainer.id = 'menu-container';
  document.body.appendChild(this._dndContainer);

  UIArmyInputManager.init(this._dndContainer, this);
  UIArmyInputManager.activate();
  this.refreshUIDOM();
};

Scene_Army.prototype.refreshUIDOM = function () {
  if (!this._dndContainer) return;

  const troops = $gameArmy.getTroops();
  const troopCount = $gameArmy.getTroopCount();
  const maxTroops = ArmyManager.Params.maxArmySize;
  const weeklyCost = $gameArmy.getTotalWeeklyCost();
  const coherence = $gameArmy.getCoherence();
  const breakdown = $gameArmy.getFactionBreakdown();

  const weeklyEuros = (weeklyCost / 100).toFixed(2);

  // Coherence color scale
  let coherenceColor = "var(--text-cost-bad)"; // low red
  if (coherence >= 80) coherenceColor = "var(--text-cost-ok)"; // high green
  else if (coherence >= 50) coherenceColor = "var(--accent-gold-2)"; // gold

  // The two camp commands read as the backpack's category strip rather than as
  // a stack of full width cards: the roster below them is what the page is for,
  // and it now gets the height those cards were spending.
  const cmds = this.commandList();
  const commandsHTML = `
    <div class="backpack-tabs-row">${cmds.map((cmd, idx) => {
      const isFocused = this._activeTab === 'commands' && idx === this._commandIndex ? 'selected' : '';
      return `<div class="backpack-tab ${isFocused}" onclick="SceneManager._scene.clickCommand(${idx})">${cmd.label}</div>`;
    }).join('')}</div>`;

  // Regimental breakdown, written as chips under the roster instead of as a
  // table: two columns of headings were a band of chrome for one count each.
  const sortedBreakdown = Object.values(breakdown).sort((a, b) => b.count - a.count);
  const regimentChips = sortedBreakdown.length > 0
    ? sortedBreakdown.map(f => `<span class="army-regiment-chip">${f.name}<b>${f.count}</b></span>`).join('')
    : `<span class="army-regiment-empty">${T('ArmyManager.noRegiments')}</span>`;

  // The roster, drawn the way the backpack draws its pockets: one compact slot
  // per troop, a stripe down the left of it and the weekly upkeep on the right.
  let rosterHTML = "";
  if (troops.length > 0) {
    troops.forEach((troop, idx) => {
      const isSelected = this._activeTab === 'troops' && idx === this._troopIndex;
      const name = armyT(troop.name);
      const euros = (troop.weeklyCost / 100).toFixed(2);
      const faction = $gameFactions ? $gameFactions.getFaction(troop.factionId) : null;
      const factionName = faction ? armyT(faction.name) : T('ArmyManager.independent');
      rosterHTML += `
        <div class="item-slot item-slot--compact ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.clickTroop(${idx})">
          <div class="item-rarity-bar army-role-bar"></div>
          <div class="item-slot-icon">${armyRoleIconHTML(troop.role)}</div>
          <div class="item-slot-info">
            <div class="item-slot-name">${name}</div>
            <div class="army-slot-sub">${factionName} &middot; ${armyRoleLabel(troop.role)}</div>
          </div>
          <span class="item-slot-count">&euro;${euros}${T('ArmyManager.perWeekShort')}</span>
        </div>`;
    });
  } else {
    rosterHTML = `<div class="item-grid-empty">${T('ArmyManager.emptyArmy')}</div>`;
  }

  // ---- Right page: the dossier, built as the backpack's inspect card ----
  let dossierHTML = "";
  if (this._activeTab === 'troops' && troops[this._troopIndex]) {
    const baseTroop = troops[this._troopIndex];
    const troop = $gameArmy.getTroopWithBonuses(baseTroop.id);
    const name = armyT(troop.name);
    const roleLabel = armyRoleLabel(troop.role);
    const faction = $gameFactions ? $gameFactions.getFaction(troop.factionId) : null;
    const factionName = faction ? armyT(faction.name) : T('ArmyManager.independent');

    const leaderText = troop.hasLeader ? `
        <div class="army-07">
             ${T('ArmyManager.ledByCommander', { name: troop.leaderName })}
        </div>
    ` : "";

    const stats = [
      { label: getStatLabel("HP"), base: baseTroop.hp, val: troop.hp },
      { label: getStatLabel("MP"), base: baseTroop.mp, val: troop.mp },
      { label: getStatLabel("ATK"), base: baseTroop.atk, val: troop.atk },
      { label: getStatLabel("DEF"), base: baseTroop.def, val: troop.def },
      { label: getStatLabel("MAT"), base: baseTroop.mat, val: troop.mat },
      { label: getStatLabel("MDF"), base: baseTroop.mdf, val: troop.mdf },
      { label: getStatLabel("AGI"), base: baseTroop.agi, val: troop.agi },
      { label: getStatLabel("LUK"), base: baseTroop.luk, val: troop.luk }
    ];

    const statsGrid = stats.map(st => {
      const bonus = st.val - st.base;
      const bonusSpan = bonus > 0 ? `<span class="stat-bonus">(+${bonus})</span>` : "";
      return `
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${st.label}:</span>
          <span class="inspect-spec-value">${st.val} ${bonusSpan}</span>
        </div>`;
    }).join('');

    dossierHTML = `
      <div class="item-inspect">
        <div class="inspect-header">
          <div class="inspect-frame">${armyRoleIconHTML(troop.role, 32)}</div>
          <div class="inspect-title-box">
            <h3 class="inspect-name">${name}</h3>
            <div class="inspect-rarity">${T('ArmyManager.regimentLabel')} ${factionName} &middot; ${roleLabel}</div>
          </div>
        </div>
        <div class="inspect-meta-grid">
          <div class="inspect-meta-item"><span>${T('ArmyManager.hiringBounty')}</span><span class="inspect-meta-val">&euro;${(troop.hiringCost / 100).toFixed(2)}</span></div>
          <div class="inspect-meta-item"><span>${T('ArmyManager.upkeep')}</span><span class="inspect-meta-val">&euro;${(troop.weeklyCost / 100).toFixed(2)}${T('ArmyManager.perWeekShort')}</span></div>
        </div>
        ${leaderText}
        <div class="inspect-lore">
          <div class="inspect-section-title">${T('ArmyManager.combatStatistics')}</div>
          <div class="army-14">${statsGrid}</div>
        </div>
        <div class="inspect-actions">
          <div class="inspect-btn inspect-btn--danger" onclick="SceneManager._scene.promptReleaseTroop(${this._troopIndex})">${T('ArmyManager.release')}</div>
        </div>
      </div>`;
  } else {
    dossierHTML = `
      <div class="item-inspect item-inspect--empty army-inspect-empty">
        <div class="inspect-placeholder-icon"></div>
        <h3 class="title">${T('ArmyManager.companyDossier')}</h3>
        <p class="inspect-placeholder-text">${T('ArmyManager.dossierHint')}</p>
      </div>`;
  }

  // Cursive parchment confirmation box overlay
  let confirmDialogHTML = "";
  if (this._confirmOpen && this._troopToRelease) {
    const name = armyT(this._troopToRelease.name);
    confirmDialogHTML = `
        <div class="army-dialog-overlay">
            <div class="army-dialog">
                <h3>${T('ArmyManager.releaseTitle')}</h3>
                <p>${T('ArmyManager.releaseBody', { name: `<strong>${name}</strong>` })}</p>
                <div class="army-dialog-buttons">
                    <button class="army-dialog-btn ${this._confirmChoice === 'yes' ? 'selected' : ''}" onclick="SceneManager._scene.confirmRelease('yes')">${T('ArmyManager.yes')}</button>
                    <button class="army-dialog-btn ${this._confirmChoice === 'no' ? 'selected' : ''}" onclick="SceneManager._scene.confirmRelease('no')">${T('ArmyManager.no')}</button>
                </div>
            </div>
        </div>
    `;
  }

  this._dndContainer.innerHTML = `
    <div class="book-spread">
        <!-- Left page: the company and its roster -->
        <div class="left-page army-left">
            <div class="page-header-bar">
                <div class="back-button focusable" onclick="SceneManager._scene.leaveCamp()">${T('ArmyManager.back')}</div>
                <h2 class="title">${armyPageTitle()}</h2>
            </div>

            <div class="vitals-box army-19">
                <div class="army-20">
                    <span>${T('ArmyManager.companyStrength')}</span>
                    <span class="army-21">${T('ArmyManager.troopsOf', { count: troopCount, max: maxTroops })}</span>
                </div>
                <div class="army-20">
                    <span>${T('ArmyManager.weeklyBaseUpkeep')}</span>
                    <span class="army-22">&euro;${weeklyEuros}</span>
                </div>
                <div class="army-23">
                    <span>${T('ArmyManager.militaryCoherence')}</span>
                    <span style="color:${coherenceColor}">${coherence}%</span>
                </div>
                <div class="coherence-bar-outer">
                    <div class="coherence-bar-fill" style="width:${coherence}%; background:${coherenceColor}"></div>
                </div>
            </div>

            <div class="backpack-tabs">${commandsHTML}</div>

            <div class="army-roster">${rosterHTML}</div>

            <div class="army-regiments">
                <div class="army-regiments-title">${T('ArmyManager.regimentalBreakdown')}</div>
                <div class="army-regiments-chips">${regimentChips}</div>
            </div>

            <div class="army-28">
                ${T('ArmyManager.manualFooter')}
            </div>
        </div>

        <!-- Right page: the dossier of the troop under the cursor -->
        <div class="right-page army-right">
            ${dossierHTML}
        </div>
    </div>
    ${confirmDialogHTML}
  `;
};

// Single source of truth for the left-page command cards. "Leave Camp" is no
// longer a card: the standard .back-button in the page header handles it.
Scene_Army.prototype.commandList = function () {
  return [
    { label: T('ArmyManager.reviewTroops'), key: "troops" },
    { label: T('ArmyManager.manageSquads'), key: "squads" },
    { label: T('ArmyManager.practiceBattle'), key: "practice" }
  ];
};

Scene_Army.prototype.leaveCamp = function () {
  if (this._confirmOpen) return;
  SoundManager.playCancel();
  this.popScene();
};

Scene_Army.prototype.clickCommand = function (index) {
  if (this._confirmOpen) return;
  this._commandIndex = index;
  this._activeTab = 'commands';
  this.handleCommandOk();
};

Scene_Army.prototype.clickTroop = function (index) {
  if (this._confirmOpen) return;
  this._troopIndex = index;
  this._activeTab = 'troops';
  this.refreshUIDOM();
};

Scene_Army.prototype.handleCommandOk = function () {
  if (this._commandIndex === 0) {
    // Review Troops
    const troops = $gameArmy.getTroops();
    if (troops.length > 0) {
      SoundManager.playOk();
      this._activeTab = 'troops';
      this._troopIndex = 0;
      this.refreshUIDOM();
    } else {
      SoundManager.playBuzzer();
    }
  } else if (this._commandIndex === 1) {
    // Manage Squads
    SoundManager.playOk();
    SceneManager.push(Scene_Squads);
  } else if (this._commandIndex === 2) {
    this.startPracticeBattle();
  }
};

// The drill: the company splits in two and fights itself on the battle field,
// with no casualties and nothing written back to the roster. Scientists are
// left out of the muster, as they are out of a real battle.
Scene_Army.prototype.startPracticeBattle = function () {
  const fighters = $gameArmy.getTroops()
    .filter(t => !/scientist/i.test(String(t.role || "")));  // i18n-ignore  troop db id
  if (fighters.length < 2 || typeof Scene_ArmyBattle === "undefined") {
    SoundManager.playBuzzer();
    if (window.ParchmentToast) {
      window.ParchmentToast.show(T('ArmyManager.practiceTooFew'), { severity: "warning" });
    }
    return;
  }
  SoundManager.playOk();
  $gameTemp._armyPracticeBattle = true;
  $gameTemp._battleEnemyArmy = null;
  $gameTemp._battleArmyEventId = null;
  SceneManager.push(Scene_ArmyBattle);
};

Scene_Army.prototype.promptReleaseTroop = function (index) {
  const troops = $gameArmy.getTroops();
  const troop = troops[index];
  if (troop) {
    SoundManager.playOk();
    this._confirmOpen = true;
    this._confirmChoice = 'no';
    this._troopToRelease = troop;
    this.refreshUIDOM();
  }
};

Scene_Army.prototype.confirmRelease = function (choice) {
  this._confirmChoice = choice;
  this.handleConfirmOk();
};

Scene_Army.prototype.handleConfirmOk = function () {
  if (this._confirmChoice === 'yes' && this._troopToRelease) {
    SoundManager.playOk();
    $gameArmy.removeTroop(this._troopToRelease.id);
    this._confirmOpen = false;
    this._troopToRelease = null;

    // adjust index
    const troops = $gameArmy.getTroops();
    if (this._troopIndex >= troops.length) {
      this._troopIndex = Math.max(0, troops.length - 1);
    }

    if (troops.length === 0) {
      this._activeTab = 'commands';
    }

    this.refreshUIDOM();
  } else {
    SoundManager.playCancel();
    this._confirmOpen = false;
    this._troopToRelease = null;
    this.refreshUIDOM();
  }
};

Scene_Army.prototype.terminate = function () {
  Scene_MenuBase.prototype.terminate.call(this);
  UIArmyInputManager.deactivate();
  if (this._dndContainer) {
    const container = this._dndContainer;
    container.style.transition = "opacity 0.2s ease-out";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    setTimeout(() => {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 200);
    this._dndContainer = null;
  }
};

//=============================================================================
// Scene_BuyTroops - Troop recruitment scene
//=============================================================================

Scene_BuyTroops.prototype.create = function () {
  loadUIArmyResources();
  Scene_MenuBase.prototype.create.call(this);

  if (this._windowLayer) {
    this._windowLayer.visible = false;
  }
  if (this._cancelButton) {
    this._cancelButton.visible = false;
  }

  this._selectedIndex = 0;
  this._feedbackText = "";
  this._feedbackTimer = null;

  this.createDummyWindows();
  this.createUIDOM();
};

Scene_BuyTroops.prototype.createDummyWindows = function () {
  const rect = new Rectangle(0, 0, 0, 0);
  this._helpWindow = new Window_Help(rect);
  this._goldWindow = new Window_Gold(rect);
  this._troopShopWindow = new Window_TroopShop(rect);
  this._statsWindow = new Window_RecruitStats(rect);
  this._helpWindow.visible = false;
  this._goldWindow.visible = false;
  this._troopShopWindow.visible = false;
  this._statsWindow.visible = false;
  this.addWindow(this._helpWindow);
  this.addWindow(this._goldWindow);
  this.addWindow(this._troopShopWindow);
  this.addWindow(this._statsWindow);

  this._troopShopWindow.setFactionFilter(this._factionId);
};

Scene_BuyTroops.prototype.createUIDOM = function () {
  this._dndContainer = document.createElement('div');
  this._dndContainer.id = 'menu-container';
  document.body.appendChild(this._dndContainer);

  UIBuyTroopsInputManager.init(this._dndContainer, this);
  UIBuyTroopsInputManager.activate();

  // The page is built ONCE here. Everything that changes afterwards (gold,
  // the roster list, the dossier, the feedback note, which row is selected)
  // is patched into its own element instead of tearing the whole book-spread
  // down and rebuilding it, so browsing the shop never flickers or restarts
  // the page's entrance animation.
  this.buildShellHTML();
  this.renderList();
  this.renderDossier();
};

Scene_BuyTroops.prototype.shopList = function () {
  const shop = this._troopShopWindow;
  return (shop && shop._data) || [];
};

Scene_BuyTroops.prototype.buildShellHTML = function () {
  const troopCount = $gameArmy.getTroopCount();
  const maxTroops = ArmyManager.Params.maxArmySize;

  this._dndContainer.innerHTML = `
    <div class="book-spread">
        <!-- Left Page: Recruitment Station -->
        <div class="left-page army-18">
            <div>
                <div class="page-header-bar">
                    <div class="back-button focusable" onclick="SceneManager._scene.leaveCamp()">${T('ArmyManager.back')}</div>
                    <h2 class="title">${T('ArmyManager.recruitCamp')}</h2>
                </div>

                <div class="army-31">
                    "${T('ArmyManager.recruitBlurb')}"
                </div>

                <div class="vitals-box army-19">
                    <div class="army-32">
                        <span>${T('ArmyManager.companyChest')}</span>
                        <span class="army-33" id="bt-gold">€${($gameParty.gold() / 100).toFixed(2)}</span>
                    </div>
                    <div class="army-34">
                        <span>${T('ArmyManager.regimentLimit')}</span>
                        <span class="army-21" id="bt-troopcount">${T('ArmyManager.troopsOf', { count: troopCount, max: maxTroops })}</span>
                    </div>
                </div>

                <div id="bt-dossier"></div>
                <div id="bt-feedback"></div>
            </div>

            <div class="army-28">
                ${T('ArmyManager.escToCampPockets')}
            </div>
        </div>

        <!-- Right Page: Available Troops -->
        <div class="right-page army-35">
            <div class="page-header-bar army-36">
                <h2 class="title">${T('ArmyManager.availableTroops')}</h2>
            </div>
            <div class="army-37" id="bt-list-count"></div>
            <div class="choices-scroll army-38" id="bt-list"></div>
        </div>
    </div>
  `;
};

// Rebuilds the recruit list (row prices/afford-state depend on gold, so this
// runs after every purchase too), preserving scroll position.
Scene_BuyTroops.prototype.renderList = function () {
  if (!this._dndContainer) return;
  const listEl = this._dndContainer.querySelector('#bt-list');
  const countEl = this._dndContainer.querySelector('#bt-list-count');
  if (!listEl) return;

  const list = this.shopList();
  const playerGold = $gameParty.gold();
  const scrollTop = listEl.scrollTop;

  if (countEl) {
    countEl.textContent = list.length > 0
      ? T.n('ArmyManager.recruitsAvailable', list.length, { n: list.length })
      : "";
  }

  if (list.length === 0) {
    listEl.innerHTML = `
        <div class="army-39">
            ${T('ArmyManager.noLocalTroops')}
        </div>
    `;
    return;
  }

  let itemsHTML = "";
  list.forEach((item, index) => {
    const troop = item.troop;
    const isSelected = index === this._selectedIndex;
    const name = armyT(troop.name);
    const roleLabel = armyRoleLabel(troop.role);
    const roleIcon = armyRoleIconHTML(troop.role);
    const hiringPrice = (troop.hiringCost / 100).toFixed(2);
    const canAfford = playerGold >= troop.hiringCost;
    const hint = canAfford ? T('ArmyManager.clickToRecruit') : T('ArmyManager.cannotAfford');

    itemsHTML += `
        <div class="choice-card ${isSelected ? 'selected' : ''} army-40" data-index="${index}" title="${hint}"
             style="opacity:${canAfford ? 1 : 0.65}"
             onclick="SceneManager._scene.clickShopItem(${index})">
            <div class="army-41">
                ${roleIcon}
                <div class="army-42">
                    <div class="army-43" style="color:${canAfford ? 'var(--text-primary-hover)' : 'var(--text-muted-hover)'}">${name}</div>
                    <div class="army-44">${roleLabel}</div>
                </div>
            </div>
            <span class="army-45" style="color:${canAfford ? 'var(--text-cost-ok)' : 'var(--text-cost-bad)'}">€${hiringPrice}</span>
        </div>
    `;
  });

  listEl.innerHTML = itemsHTML;
  listEl.scrollTop = scrollTop;
};

// Rebuilds only the selected-troop dossier panel on the left page.
Scene_BuyTroops.prototype.renderDossier = function () {
  if (!this._dndContainer) return;
  const dossierEl = this._dndContainer.querySelector('#bt-dossier');
  if (!dossierEl) return;

  const item = this.shopList()[this._selectedIndex];
  if (!item) {
    dossierEl.innerHTML = `
        <div class="prophecy-pane army-46">
            ${T('ArmyManager.recruitHint')}
        </div>
    `;
    return;
  }

  const troop = item.troop;
  const name = armyT(troop.name);
  const roleLabel = armyRoleLabel(troop.role);
  const faction = $gameFactions ? $gameFactions.getFaction(item.factionId) : null;
  const factionName = faction ? armyT(faction.name) : T('ArmyManager.independent');

  const stats = [
    { label: getStatLabel("HP"), val: troop.hp },
    { label: getStatLabel("MP"), val: troop.mp },
    { label: getStatLabel("ATK"), val: troop.atk },
    { label: getStatLabel("DEF"), val: troop.def },
    { label: getStatLabel("MAT"), val: troop.mat },
    { label: getStatLabel("MDF"), val: troop.mdf },
    { label: getStatLabel("AGI"), val: troop.agi },
    { label: getStatLabel("LUK"), val: troop.luk }
  ];

  let statsGrid = "";
  stats.forEach(st => {
    statsGrid += `
        <div class="army-08">
            <span class="army-09">${st.label}:</span>
            <span class="army-10">${st.val}</span>
        </div>
    `;
  });

  dossierEl.innerHTML = `
      <div class="army-card army-47">
          <h3 class="army-48">
              ${name}
          </h3>
          <div class="army-13">
              ${T('ArmyManager.factionLabel')} ${factionName} &middot; ${roleLabel}
          </div>

          <div class="army-14">
              ${statsGrid}
          </div>

          <div class="army-49">
              <span>${T('ArmyManager.hiringCost')} <strong class="army-50">€${(troop.hiringCost / 100).toFixed(2)}</strong></span>
              <span>${T('ArmyManager.upkeep')} <strong class="army-51">€${(troop.weeklyCost / 100).toFixed(2)}${T('ArmyManager.perWeekShort')}</strong></span>
          </div>
      </div>
  `;
};

Scene_BuyTroops.prototype.renderHeader = function () {
  if (!this._dndContainer) return;
  const goldEl = this._dndContainer.querySelector('#bt-gold');
  if (goldEl) goldEl.textContent = `€${($gameParty.gold() / 100).toFixed(2)}`;
  const countEl = this._dndContainer.querySelector('#bt-troopcount');
  if (countEl) {
    countEl.textContent = T('ArmyManager.troopsOf', {
      count: $gameArmy.getTroopCount(),
      max: ArmyManager.Params.maxArmySize
    });
  }
};

// Cheap keyboard/click selection change: toggles the 'selected' class on the
// two affected rows directly instead of rebuilding the list, then refreshes
// only the dossier panel.
Scene_BuyTroops.prototype.updateSelection = function (index) {
  if (!this._dndContainer) return;
  const list = this.shopList();
  if (list.length === 0) return;
  const clamped = ((index % list.length) + list.length) % list.length;

  const prevEl = this._dndContainer.querySelector(`#bt-list [data-index="${this._selectedIndex}"]`);
  if (prevEl) prevEl.classList.remove('selected');

  this._selectedIndex = clamped;

  const nextEl = this._dndContainer.querySelector(`#bt-list [data-index="${clamped}"]`);
  if (nextEl) nextEl.classList.add('selected');

  this.renderDossier();
};

Scene_BuyTroops.prototype.leaveCamp = function () {
  SoundManager.playCancel();
  this.popScene();
};

Scene_BuyTroops.prototype.clickShopItem = function (index) {
  this.updateSelection(index);
  this.buyTroopAtIndex(index);
};

Scene_BuyTroops.prototype.buyTroopAtIndex = function (index) {
  const list = this.shopList();
  const item = list[index];
  if (!item) return;

  if (!$gameArmy.canRecruitMore()) {
    SoundManager.playBuzzer();
    this.showFeedback(T('ArmyManager.atCapacity'));
    return;
  }

  if ($gameParty.gold() < item.troop.hiringCost) {
    SoundManager.playBuzzer();
    this.showFeedback(T('ArmyManager.noMoney'));
    return;
  }

  // Buy troop
  $gameParty.loseGold(item.troop.hiringCost);
  $gameArmy.addTroop(item.factionId, item.troop);

  // Faction reputation bonus
  if ($gameFactions && item.factionId !== undefined && item.factionId >= 0) {
    $gameFactions.changeReputation(item.factionId, 1);
  }

  SoundManager.playShop();

  const troopName = armyT(item.troop.name);
  this.renderHeader();
  this.renderList();
  this.showFeedback(T('ArmyManager.contracted', { name: troopName }));
};

Scene_BuyTroops.prototype.showFeedback = function (text) {
  this._feedbackText = text;
  this.renderFeedback();

  if (this._feedbackTimer) clearTimeout(this._feedbackTimer);
  this._feedbackTimer = setTimeout(() => {
    this._feedbackText = "";
    this.renderFeedback();
  }, 3000);
};

Scene_BuyTroops.prototype.renderFeedback = function () {
  if (!this._dndContainer) return;
  const el = this._dndContainer.querySelector('#bt-feedback');
  if (!el) return;
  el.innerHTML = this._feedbackText ? `
    <div class="army-52">
         ${this._feedbackText}
    </div>
  ` : "";
};

Scene_BuyTroops.prototype.terminate = function () {
  Scene_MenuBase.prototype.terminate.call(this);
  UIBuyTroopsInputManager.deactivate();
  if (this._feedbackTimer) clearTimeout(this._feedbackTimer);
  if (this._dndContainer) {
    const container = this._dndContainer;
    container.style.transition = "opacity 0.2s ease-out";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    setTimeout(() => {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 200);
    this._dndContainer = null;
  }
};

//=============================================================================
// Scene_Squads - Squad management scene
//=============================================================================

Scene_Squads.prototype.create = function () {
  loadUIArmyResources();
  Scene_MenuBase.prototype.create.call(this);

  if (this._windowLayer) {
    this._windowLayer.visible = false;
  }
  if (this._cancelButton) {
    this._cancelButton.visible = false;
  }

  // Auto organize
  $gameArmy.autoOrganizeSquads();

  this._activeTab = 'squads'; // 'squads' or 'leaders'
  this._squadIndex = 0;
  this._leaderIndex = 0;
  this._leadersList = [];

  this.createDummyWindows();
  this.createUIDOM();
};

Scene_Squads.prototype.createDummyWindows = function () {
  const rect = new Rectangle(0, 0, 0, 0);
  this._helpWindow = new Window_Help(rect);
  this._squadListWindow = new Window_SquadList(rect);
  this._leaderSelectWindow = new Window_LeaderSelect(rect);
  this._helpWindow.visible = false;
  this._squadListWindow.visible = false;
  this._leaderSelectWindow.visible = false;
  this.addWindow(this._helpWindow);
  this.addWindow(this._squadListWindow);
  this.addWindow(this._leaderSelectWindow);
};

Scene_Squads.prototype.createUIDOM = function () {
  this._dndContainer = document.createElement('div');
  this._dndContainer.id = 'menu-container';
  document.body.appendChild(this._dndContainer);

  UISquadsInputManager.init(this._dndContainer, this);
  UISquadsInputManager.activate();
  this.refreshUIDOM();
};

Scene_Squads.prototype.refreshLeaderList = function () {
  const squads = $gameArmy.getSquads();
  const squad = squads[this._squadIndex];
  if (!squad) {
    this._leadersList = [];
    return;
  }

  this._leadersList = [];
  if (squad.leaderId) {
    this._leadersList.push({ actorId: -1, name: T('ArmyManager.removeLeader') });
  }

  const members = $gameParty.members();
  members.forEach(member => {
    this._leadersList.push({ actorId: member.actorId(), name: member.name() });
  });
};

Scene_Squads.prototype.refreshUIDOM = function () {
  if (!this._dndContainer) return;

  const squads = $gameArmy.getSquads();

  // Left Page: Squad list
  let squadsHTML = "";
  if (squads.length > 0) {
    squads.forEach((sq, idx) => {
      const isSelected = this._activeTab === 'squads' && idx === this._squadIndex;
      let leaderName = T('ArmyManager.noOfficer');
      if (sq.leaderId) {
        const actor = $gameActors.actor(sq.leaderId);
        if (actor) leaderName = T('ArmyManager.leaderNamed', { name: actor.name() });
      }

      squadsHTML += `
            <div class="choice-card ${isSelected ? 'selected' : ''} army-53" onclick="SceneManager._scene.clickSquad(${idx})">
                <span class="role-badge">${armyT(sq.name)} ${T.n('ArmyManager.troopCount', sq.troopIds.length, { n: sq.troopIds.length })}</span>
                <span class="army-54">${leaderName}</span>
            </div>
        `;
    });
  } else {
    squadsHTML = `
        <div class="army-39">
            ${T('ArmyManager.noSquads')}
        </div>
    `;
  }

  // Right Page: Leader selections
  let leadersHTML = "";
  if (this._activeTab === 'leaders') {
    const squad = squads[this._squadIndex];
    this.refreshLeaderList();

    this._leadersList.forEach((item, index) => {
      const isSelected = index === this._leaderIndex;
      const isRemove = item.actorId === -1;

      let statusText = "";
      let isLeadingOther = false;

      if (!isRemove) {
        isLeadingOther = $gameArmy.getSquads().some(s => s.leaderId === item.actorId && s.id !== squad.id);
        if (isLeadingOther) {
          statusText = `<span class="army-55">${T('ArmyManager.leadingOtherSquad')}</span>`;
        }
      }

      leadersHTML += `
            <div class="choice-card ${isSelected ? 'selected' : ''} army-40" style="opacity:${isLeadingOther ? 0.5 : 1}" onclick="SceneManager._scene.clickLeader(${index})">
                <span class="army-56" style="color:${isRemove ? 'var(--text-text-alt-5-hover)' : 'var(--text-muted-hover)'}">${item.name}</span>
                ${statusText}
            </div>
        `;
    });
  } else {
    leadersHTML = `
        <div class="army-06">
            ${T('ArmyManager.squadHint')}
        </div>
    `;
  }

  this._dndContainer.innerHTML = `
    <div class="book-spread">
        <!-- Left Page: Regimental Squads -->
        <div class="left-page army-18">
            <div>
                <div class="page-header-bar">
                    <div class="back-button focusable" onclick="SceneManager._scene.leaveCamp()">${T('ArmyManager.back')}</div>
                    <h2 class="title">${T('ArmyManager.squadOfficers')}</h2>
                </div>

                <div class="army-31">
                    "${T('ArmyManager.squadBlurb')}"
                </div>

                <div class="choices-scroll army-57">
                    ${squadsHTML}
                </div>
            </div>

            <div class="army-28">
                ${T('ArmyManager.escToCompanyCamp')}
            </div>
        </div>

        <!-- Right Page: Officer Assignment -->
        <div class="right-page army-35">
            
            <div class="choices-scroll army-58">
                ${leadersHTML}
            </div>
        </div>
    </div>
  `;
};

Scene_Squads.prototype.leaveCamp = function () {
  SoundManager.playCancel();
  this.popScene();
};

Scene_Squads.prototype.clickSquad = function (index) {
  this._squadIndex = index;
  this._activeTab = 'leaders';
  this._leaderIndex = 0;
  SoundManager.playOk();
  this.refreshUIDOM();
};

Scene_Squads.prototype.clickLeader = function (index) {
  this._leaderIndex = index;
  this.selectLeaderAtIndex(index);
};

Scene_Squads.prototype.selectLeaderAtIndex = function (index) {
  this.refreshLeaderList();
  const squad = $gameArmy.getSquads()[this._squadIndex];
  const item = this._leadersList[index];
  if (!squad || !item) return;

  // Verify leader isn't busy
  if (item.actorId !== -1) {
    const isLeadingOther = $gameArmy.getSquads().some(s => s.leaderId === item.actorId && s.id !== squad.id);
    if (isLeadingOther) {
      SoundManager.playBuzzer();
      return;
    }
  }

  // Set leader
  if (item.actorId === -1) {
    $gameArmy.removeLeaderFromSquad(squad.id);
  } else {
    $gameArmy.assignLeaderToSquad(squad.id, item.actorId);
  }

  SoundManager.playUseSkill();
  this._activeTab = 'squads';
  this.refreshUIDOM();
};

Scene_Squads.prototype.terminate = function () {
  Scene_MenuBase.prototype.terminate.call(this);
  UISquadsInputManager.deactivate();
  if (this._dndContainer) {
    const container = this._dndContainer;
    container.style.transition = "opacity 0.2s ease-out";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    setTimeout(() => {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 200);
    this._dndContainer = null;
  }
};

//=============================================================================
// Scene Updates
//=============================================================================

const _Scene_Army_update = Scene_Army.prototype.update;
Scene_Army.prototype.update = function () {
  _Scene_Army_update.call(this);
  UIArmyInputManager.update();
};

const _Scene_BuyTroops_update = Scene_BuyTroops.prototype.update;
Scene_BuyTroops.prototype.update = function () {
  _Scene_BuyTroops_update.call(this);
  UIBuyTroopsInputManager.update();
};

const _Scene_Squads_update = Scene_Squads.prototype.update;
Scene_Squads.prototype.update = function () {
  _Scene_Squads_update.call(this);
  UISquadsInputManager.update();
};

//=============================================================================
// Plugin Commands
//=============================================================================

PluginManager.registerCommand("ArmyManager", "buyTroops", args => {
  const factionId = Number(args.factionId || -1);
  SceneManager.push(Scene_BuyTroops);
  SceneManager.prepareNextScene(factionId);
});

// Grants up to `count` troops of random types, all belonging to `factionId`,
// respecting the army size cap. Used by the character-creation Faction
// Leader / Deserter origins (player-chosen faction) as well as any other
// caller that wants a "starting roster from this faction" grant. Returns the
// number of troops actually added.
ArmyManager.grantRandomTroops = function (factionId, count) {
  const faction = $gameFactions ? $gameFactions.getFaction(factionId) : null;
  if (!faction || !faction.troops || !faction.troops.length) return 0;
  let granted = 0;
  for (let i = 0; i < count; i++) {
    if (!$gameArmy.canRecruitMore()) break;
    const troop = faction.troops[Math.floor(Math.random() * faction.troops.length)];
    $gameArmy.addTroop(factionId, troop);
    granted++;
  }
  return granted;
};

// Grants up to `count` troops of random types from random eligible factions
// (any faction with a non-empty troop roster), for a faction-agnostic
// "independent" starting army. Used by the Independent Warlord origin.
// Returns the number of troops actually added.
ArmyManager.grantRandomTroopsMixed = function (count) {
  const allFactions = $gameFactions ? $gameFactions.getAllFactions() : [];
  const eligible = allFactions.filter(f => f.troops && f.troops.length);
  if (!eligible.length) return 0;
  let granted = 0;
  for (let i = 0; i < count; i++) {
    if (!$gameArmy.canRecruitMore()) break;
    const faction = eligible[Math.floor(Math.random() * eligible.length)];
    const troop = faction.troops[Math.floor(Math.random() * faction.troops.length)];
    $gameArmy.addTroop(faction.id, troop);
    granted++;
  }
  return granted;
};

PluginManager.registerCommand("ArmyManager", "debugAddTroops", args => {
  const allFactions = $gameFactions ? $gameFactions.getAllFactions() : [];
  const factionsWithTroops = allFactions.filter(f => f.troops && f.troops.length > 0);

  if (factionsWithTroops.length === 0) {
    console.warn("[ArmyManager] No factions with troops available!");
    return;
  }

  const randomFaction = factionsWithTroops[Math.floor(Math.random() * factionsWithTroops.length)];
  const factionName = armyT(randomFaction.name);

  let totalAdded = 0;
  const troopCounts = {};

  for (const troop of randomFaction.troops) {
    let addedCount = 0;

    for (let i = 0; i < 10; i++) {
      if ($gameArmy.canRecruitMore()) {
        $gameArmy.addTroop(randomFaction.id, troop);
        addedCount++;
        totalAdded++;
      } else {
        console.warn(`[ArmyManager] Army at max capacity! Only added ${totalAdded} troops total.`);
        break;
      }
    }

    if (addedCount > 0) {
      const troopName = armyT(troop.name);
      troopCounts[troopName] = addedCount;
    }

    if (!$gameArmy.canRecruitMore()) break;
  }

  for (const [troopName, count] of Object.entries(troopCounts)) {
  }
});
