/*:
 * @plugindesc PIXI.js-powered field battle visualization for army combat
 * @author Omni-Lex
 * @target MZ
 *
 * @param battleWidth
 * @text Battle View Width
 * @type number
 * @default 1200
 * @desc Width of the battle view in pixels.
 *
 * @param battleHeight
 * @text Battle View Height
 * @type number
 * @default 800
 * @desc Height of the battle view in pixels.
 *
 * @param dotSize
 * @text Unit Dot Size
 * @type number
 * @default 4
 * @desc Size of each unit dot in pixels.
 *
 * @param unitHeight
 * @text Unit Sprite Height
 * @type number
 * @default 24
 * @desc On field height in pixels of a troop's character sprite.
 *
 * @param advanceSpeed
 * @text Army Advance Speed
 * @type number
 * @decimals 2
 * @default 0.5
 * @desc Speed at which armies advance (pixels per frame).
 *
 * @param attackRange
 * @text Attack Range
 * @type number
 * @default 30
 * @desc Distance at which units can attack each other.
 *
 * @param injuryChance
 * @text Injury Chance
 * @type number
 * @min 0
 * @max 100
 * @default 50
 * @desc Percentage chance troop gets injured instead of dying (0-100).
 *
 * @command startBattle
 * @text Start Battle
 * @desc Starts a field battle against the AI army (auto-detects event from player interaction).
 *
 * @help
 * Army Battle View System
 *
 * This plugin provides a PIXI.js-powered tactical battle visualization
 * inspired by Total War and Mount & Blade.
 *
 * Features:
 * - Real-time tactical battle visualization
 * - Units represented as colored dots (yellow = player, red = enemy)
 * - Formation system based on unit roles (close quarters, support, ranged)
 * - Dynamic combat with units fighting based on their stats
 * - Living/injured troop counters
 * - Units can die (removed from party) or get injured (HP=1, can't fight)
 * - Visual feedback as troops fall in combat
 * - Zoom and pan controls for better battlefield view
 *
 * Controls:
 * - Mouse Wheel: Zoom in/out (30% - 300%)
 * - Drag: Pan the battlefield view
 *
 * Plugin Command:
 *   ArmyBattleView startBattle
 *     - Initiates battle against the AI army that triggered the event
 *     - Automatically detects the event ID from player interaction
 *
 * Usage in Events:
 *   When player touches an army event, simply call the startBattle command
 *   without any parameters - it will auto-detect the event ID.
 */

var Imported = Imported || {};
Imported.ArmyBattleView = true;

var ArmyBattleView = ArmyBattleView || {};
ArmyBattleView.Params = PluginManager.parameters("ArmyBattleView");

ArmyBattleView.Params.battleWidth = Number(ArmyBattleView.Params.battleWidth || 1200);
ArmyBattleView.Params.battleHeight = Number(ArmyBattleView.Params.battleHeight || 800);
ArmyBattleView.Params.dotSize = Number(ArmyBattleView.Params.dotSize || 4);
ArmyBattleView.Params.unitHeight = Number(ArmyBattleView.Params.unitHeight || 24);
ArmyBattleView.Params.advanceSpeed = Number(ArmyBattleView.Params.advanceSpeed || 0.5);
ArmyBattleView.Params.attackRange = Number(ArmyBattleView.Params.attackRange || 30);
ArmyBattleView.Params.injuryChance = Number(ArmyBattleView.Params.injuryChance || 50);

//=============================================================================
// Plugin Commands
//=============================================================================

PluginManager.registerCommand("ArmyBattleView", "startBattle", args => {
  // Auto-detect event ID from the current interpreter
  let armyEventId = null;

  // Try to get event ID from the interpreter
  if ($gameMap._interpreter && $gameMap._interpreter._eventId) {
    armyEventId = $gameMap._interpreter._eventId;
  }

  // Fallback: Check if player is facing/touching an event
  if (!armyEventId) {
    const direction = $gamePlayer.direction();
    const x = $gameMap.roundXWithDirection($gamePlayer.x, direction);
    const y = $gameMap.roundYWithDirection($gamePlayer.y, direction);

    const events = $gameMap.eventsXy(x, y);
    if (events.length > 0) {
      armyEventId = events[0].eventId();
    }
  }

  // Fallback: Check for events at player's current position
  if (!armyEventId) {
    const events = $gameMap.eventsXy($gamePlayer.x, $gamePlayer.y);
    if (events.length > 0) {
      armyEventId = events[0].eventId();
    }
  }

  if (!armyEventId) {
    console.error("[ArmyBattleView] Could not auto-detect event ID. Make sure this command is called from an event.");
    return;
  }

  const enemyArmy = $gameAIArmies.getArmyByEventId(armyEventId);

  if (!enemyArmy) {
    console.error("[ArmyBattleView] No army found at event ID:", armyEventId);
    return;
  }


  // Store enemy army for battle scene
  $gameTemp._battleEnemyArmy = enemyArmy;
  $gameTemp._battleArmyEventId = armyEventId;

  // Push battle scene
  SceneManager.push(Scene_ArmyBattle);
});

//=============================================================================
// Scene_ArmyBattle - Main battle scene
//=============================================================================

function Scene_ArmyBattle() {
  this.initialize(...arguments);
}

Scene_ArmyBattle.prototype = Object.create(Scene_Base.prototype);
Scene_ArmyBattle.prototype.constructor = Scene_ArmyBattle;

Scene_ArmyBattle.prototype.initialize = function () {
  Scene_Base.prototype.initialize.call(this);
  this._battleEnded = false;
  this._battleResult = null;
  this._popped = false;
};

// Pop the scene at most once so the delayed victory pop and a manual cancel
// cannot both fire and drop the underlying map scene.
Scene_ArmyBattle.prototype.safePop = function () {
  if (this._popped) return;
  this._popped = true;
  SceneManager.pop();
};

Scene_ArmyBattle.prototype.create = function () {
  Scene_Base.prototype.create.call(this);
  this.createBattleView();
};

Scene_ArmyBattle.prototype.createBattleView = function () {
  this._battleView = new ArmyBattleField();
  this.addChild(this._battleView);
  this._battleView.startBattle();
};

Scene_ArmyBattle.prototype.update = function () {
  Scene_Base.prototype.update.call(this);

  if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
    SoundManager.playCancel();
    $gameTemp._battleEnemyArmy = null;
    $gameTemp._battleArmyEventId = null;
    $gameTemp._armyPracticeBattle = false;
    this.safePop();
    return;
  }

  if (this._battleView && this._battleView.isBattleEnded()) {
    if (!this._battleEnded) {
      this._battleEnded = true;
      this._battleResult = this._battleView.getBattleResult();
      this.endBattle();
    }
  }
};

Scene_ArmyBattle.prototype.endBattle = function () {
  // Wait a moment before transitioning
  setTimeout(() => {
    if (this._battleResult === "victory") {
      // Player won - remove enemy army from map
      const eventId = $gameTemp._battleArmyEventId;
      const enemyArmy = $gameTemp._battleEnemyArmy;

      if (eventId) {
        const event = $gameMap.event(eventId);
        if (event) {
          event.erase();
        }
      }

      // Decrease reputation by 25 for defeating a faction army
      // Independent armies don't affect reputation
      if (enemyArmy && !enemyArmy.isIndependent() && $gameFactions) {
        const factionId = enemyArmy.getFactionId();
        if (factionId >= 0) {
          $gameFactions.changeReputation(factionId, -25);
        }
      }
    } else if (this._battleResult === "defeat") {
      // Player lost - game over or retreat
      // For now, just return to map
    }

    // Clean up temp data
    $gameTemp._battleEnemyArmy = null;
    $gameTemp._battleArmyEventId = null;
    $gameTemp._armyPracticeBattle = false;

    // Return to map (guarded so a manual cancel during the wait cannot pop twice)
    this.safePop();
  }, 2000);
};

// Destroy the PIXI display tree so per-battle Text/Graphics/projectiles/
// particles do not leak textures and geometries between battles.
Scene_ArmyBattle.prototype.terminate = function () {
  Scene_Base.prototype.terminate.call(this);
  if (this._battleView) {
    if (this._battleView.destroyField) {
      this._battleView.destroyField();
    } else if (this._battleView.parent) {
      this._battleView.parent.removeChild(this._battleView);
    }
    this._battleView = null;
  }
};

//=============================================================================
// ArmyBattleField - PIXI.js battle visualization
//=============================================================================

function ArmyBattleField() {
  this.initialize(...arguments);
}

ArmyBattleField.prototype = Object.create(PIXI.Container.prototype);
ArmyBattleField.prototype.constructor = ArmyBattleField;

ArmyBattleField.prototype.initialize = function () {
  PIXI.Container.call(this);

  // A practice muster: the company splits in two and drills against itself.
  // Nobody dies, nobody is injured and no army data is written back.
  this._practice = !!$gameTemp._armyPracticeBattle;

  // Calculate battlefield size based on troop counts
  this._calculateBattlefieldSize();

  this._setupBattlefield();
  this._battleEnded = false;
  this._battleResult = null;

  // Camera/viewport controls
  this._viewportX = 0;
  this._viewportY = 0;
  this._zoom = 1.0;
  this._minZoom = 0.3;
  this._maxZoom = 3.0;

  // Mouse/drag state
  this._mousePressed = false;
  this._dragStarted = false;
  this._lastTouchX = 0;
  this._lastTouchY = 0;
};

ArmyBattleField.prototype._calculateBattlefieldSize = function () {
  // Count total troops
  const playerTroopCount = this._practice
    ? $gameArmy.getTroopCount()
    : $gameParty.members().length + $gameArmy.getTroopCount();
  const enemyArmy = $gameTemp._battleEnemyArmy;
  const enemyTroopCount = enemyArmy ? enemyArmy.getTroopCount() : 0;
  const totalTroops = playerTroopCount + enemyTroopCount;


  // Calculate dynamic battlefield size
  // Base size for small armies (< 50 troops)
  let width = 1200;
  let height = 800;

  // Scale up for larger armies
  if (totalTroops > 50) {
    // Add 10 width and 8 height per extra troop above 50
    const extraTroops = totalTroops - 50;
    width += Math.min(extraTroops * 10, 1800); // Cap at 3000 total width
    height += Math.min(extraTroops * 8, 1200); // Cap at 2000 total height
  }

  // Ensure minimum size
  width = Math.max(width, 1200);
  height = Math.max(height, 800);

  // Store dynamic sizes
  this._battleWidth = width;
  this._battleHeight = height;

};

ArmyBattleField.prototype._getBiomeColor = function () {
  // Default color (dark green field)
  let defaultColor = 0x2d5016;

  try {
    // Get current biome name.
    // Use the biome already resolved by the procedural generator instead of
    // searching the world map. _procGenData.currentBiome is kept in sync with the
    // player's world tile, so there is no need to scan map 315 here.
    let biomeName = "Unknown";  // i18n-ignore  biome id

    if ($gameSystem && $gameSystem._procGenData) {
      biomeName = $gameSystem._procGenData.currentBiomeName || $gameSystem._procGenData.currentBiome || "Unknown";  // i18n-ignore  biome id
    }

    // Simplify road biome names
    if (biomeName && biomeName.startsWith("Road ")) {
      biomeName = "Road";
    }


    // Look up biome in WorldGen database
    if (biomeName && biomeName !== "Unknown" && window.WorldGen && window.WorldGen.Biomes) {  // i18n-ignore  biome id
      const biome = window.WorldGen.Biomes.find(b => b.name === biomeName);
      if (biome && biome.color) {
        // Convert hex color string to numeric (e.g., "#191970" -> 0x191970)
        const colorHex = biome.color.replace("#", "0x");
        const colorNum = parseInt(colorHex, 16);
        return colorNum;
      }
    }
  } catch (error) {
    console.warn("[ArmyBattle] Error getting biome color:", error);
  }

  return defaultColor;
};

ArmyBattleField.prototype._setupBattlefield = function () {
  const width = this._battleWidth;
  const height = this._battleHeight;

  // Center on screen
  this.x = (Graphics.width - width) / 2;
  this.y = (Graphics.height - height) / 2;

  // Create content container that will be zoomed/panned
  this._contentContainer = new PIXI.Container();
  this.addChild(this._contentContainer);

  // Background - use biome color
  const biomeColor = this._getBiomeColor();
  this._background = new PIXI.Graphics();
  this._background.beginFill(biomeColor);
  this._background.drawRect(0, 0, width, height);
  this._background.endFill();
  this._contentContainer.addChild(this._background);

  // Containers for units
  this._playerUnits = [];
  this._enemyUnits = [];

  // Containers for effects (projectiles, particles, etc.)
  this._projectiles = [];
  this._particles = [];
  this._effectsContainer = new PIXI.Container();
  this._contentContainer.addChild(this._effectsContainer);

  // UI container (stays fixed, not affected by zoom/pan)
  this._uiContainer = new PIXI.Container();
  this.addChild(this._uiContainer);

  // Counter text
  this._createCounterText();
};

ArmyBattleField.prototype._createCounterText = function () {
  const width = this._battleWidth;
  const height = this._battleHeight;

  // Player counter (bottom)
  this._playerCounterText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 24,
    fill: 0xFFFF00, // Yellow
    stroke: 0x000000,
    strokeThickness: 4
  });
  this._playerCounterText.x = width / 2;
  this._playerCounterText.y = height - 40;
  this._playerCounterText.anchor.set(0.5);
  this._uiContainer.addChild(this._playerCounterText);

  // Enemy counter (top)
  this._enemyCounterText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 24,
    fill: 0xFF0000, // Red
    stroke: 0x000000,
    strokeThickness: 4
  });
  this._enemyCounterText.x = width / 2;
  this._enemyCounterText.y = 40;
  this._enemyCounterText.anchor.set(0.5);
  this._uiContainer.addChild(this._enemyCounterText);

  // Battle result text (hidden initially)
  this._resultText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 48,
    fill: 0xFFFFFF,
    stroke: 0x000000,
    strokeThickness: 6
  });
  this._resultText.x = width / 2;
  this._resultText.y = height / 2;
  this._resultText.anchor.set(0.5);
  this._resultText.visible = false;
  this._uiContainer.addChild(this._resultText);

  // Zoom indicator
  this._zoomText = new PIXI.Text(T('ArmyBattle.zoom', { pct: 100 }), {
    fontFamily: "Arial",
    fontSize: 16,
    fill: 0xFFFFFF,
    stroke: 0x000000,
    strokeThickness: 3
  });
  this._zoomText.x = 10;
  this._zoomText.y = 10;
  this._uiContainer.addChild(this._zoomText);

  // Controls help text
  this._controlsText = new PIXI.Text(T('ArmyBattle.controls'), {
    fontFamily: "Arial",
    fontSize: 14,
    fill: 0xCCCCCC,
    stroke: 0x000000,
    strokeThickness: 2
  });
  this._controlsText.x = 10;
  this._controlsText.y = 30;
  this._uiContainer.addChild(this._controlsText);

  // Commander abilities panel
  this._createCommanderAbilitiesPanel();

  // Create info screen (hidden initially)
  this._createInfoScreen();
};

ArmyBattleField.prototype._createCommanderAbilitiesPanel = function () {
  const width = this._battleWidth;

  // Commander abilities (cooldown in seconds)
  this._commanderAbilities = [
    { name: T('ArmyBattle.ability.rally'), key: "q", cooldown: 30, currentCooldown: 0, effect: "rally" },
    { name: T('ArmyBattle.ability.heal'), key: "w", cooldown: 45, currentCooldown: 0, effect: "heal" },
    { name: T('ArmyBattle.ability.inspire'), key: "e", cooldown: 60, currentCooldown: 0, effect: "inspire" }
  ];

  this._abilityTexts = [];

  for (let i = 0; i < this._commanderAbilities.length; i++) {
    const ability = this._commanderAbilities[i];
    const text = new PIXI.Text(`[${ability.key.toUpperCase()}] ${ability.name}`, {
      fontFamily: "Arial",
      fontSize: 16,
      fill: 0x00FF00,
      stroke: 0x000000,
      strokeThickness: 3
    });
    text.x = width - 180;
    text.y = 60 + i * 25;
    this._uiContainer.addChild(text);
    this._abilityTexts.push(text);
  }
};

ArmyBattleField.prototype._createInfoScreen = function () {
  // Create info screen container (right sidebar)
  this._infoScreen = new PIXI.Container();
  this._infoScreen.visible = true; // Always visible
  this._uiContainer.addChild(this._infoScreen);

  const screenWidth = Graphics.width;
  const screenHeight = Graphics.height;
  const sidebarWidth = Math.floor(screenWidth * 0.20); // 20% of screen width

  // Position sidebar on the right
  this._infoScreen.x = screenWidth - sidebarWidth;
  this._infoScreen.y = 0;

  // Semi-transparent background
  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.85);
  bg.drawRect(0, 0, sidebarWidth, screenHeight);
  bg.endFill();
  this._infoScreen.addChild(bg);

  // Title
  const title = new PIXI.Text("TACTICAL", {
    fontFamily: "Arial",
    fontSize: 20,
    fill: 0xFFFFFF,
    stroke: 0x000000,
    strokeThickness: 3
  });
  title.x = 10;
  title.y = 10;
  this._infoScreen.addChild(title);

  // Create squad list containers
  this._infoPlayerSquads = new PIXI.Container();
  this._infoPlayerSquads.x = 10;
  this._infoPlayerSquads.y = 50;
  this._infoScreen.addChild(this._infoPlayerSquads);

  this._infoEnemySquads = new PIXI.Container();
  this._infoEnemySquads.x = 10;
  this._infoEnemySquads.y = screenHeight / 2;
  this._infoScreen.addChild(this._infoEnemySquads);

  // Selected squad for commands
  this._selectedSquad = null;

  // Command panel (at bottom)
  this._infoCommandPanel = new PIXI.Container();
  this._infoCommandPanel.x = 10;
  this._infoCommandPanel.y = screenHeight - 180;
  this._infoScreen.addChild(this._infoCommandPanel);

  // Store sidebar width for reference
  this._sidebarWidth = sidebarWidth;
};

ArmyBattleField.prototype.startBattle = function () {
  if (this._practice) {
    this._setupPracticeArmies();
  } else {
    this._setupPlayerArmy();
    this._setupEnemyArmy();
  }
  this._countAliveUnits();
  this._updateCounters();

  // Initialize info screen
  this._refreshInfoScreen();

  // Start battle loop
  this._battleActive = true;
};

// Splits the company down the middle and deploys the two halves against each
// other. Scientists stay in the workshop here as they do in a real battle.
ArmyBattleField.prototype._setupPracticeArmies = function () {
  const width = this._battleWidth;
  const height = this._battleHeight;

  const roster = $gameArmy.getTroops().filter(t => !/scientist/i.test(String(t.role || "")));  // i18n-ignore  troop db id
  const sides = [[], []];
  roster.forEach((troop, i) => {
    // Drill copies: the real roster entry is never handed to the combat code.
    sides[i % 2].push({
      ...troop,
      id: "drill_" + i,  // i18n-ignore  internal id
      currentHp: troop.hp,
      isLeader: false,
      role: String(troop.role || "close quarters").toLowerCase(),  // i18n-ignore  troop db id
      formation: troop.formation || "Line"  // i18n-ignore  troop db id
    });
  });

  const deploy = (troops, isPlayer, color) => {
    const squads = Object.values(this._groupBy(troops, 'name'));
    const zoneStart = isPlayer ? Math.floor(height * 0.55) : 100;
    const zoneEnd = isPlayer ? height - 100 : Math.floor(height * 0.45);
    const spacing = squads.length > 1 ? (zoneEnd - zoneStart) / (squads.length - 1) : 0;
    squads.forEach((squad, index) => {
      const yPos = isPlayer ? zoneEnd - (index * spacing) : zoneStart + (index * spacing);
      this._applyTacticalFormation(squad, width / 2, yPos, color, isPlayer, squad[0].formation);
    });
  };

  deploy(sides[0], true, 0xFFFF00);
  deploy(sides[1], false, 0x66CCFF);
};

ArmyBattleField.prototype._setupPlayerArmy = function () {
  const width = this._battleWidth;
  const height = this._battleHeight;

  // Group party members and troops
  const partyMembers = $gameParty.members().map(actor => ({
    ...actor, name: actor.name(), hp: actor.mhp, currentHp: actor.hp, role: "close quarters", formation: "Line", isLeader: true  // i18n-ignore  troop db ids
  }));
  // Scientist-role troops stay behind working the tech tree (see
  // ArmyManager.js produceDailyMaterials); they never take the field.
  const combatTroops = $gameArmy.getTroops().filter(t => !/scientist/i.test(String(t.role || "")));
  const allTroops = [...partyMembers, ...combatTroops];


  // Group by name to keep specific squads together
  const groups = Object.values(this._groupBy(allTroops, 'name'));
  const numSquads = groups.length;

  // Player gets bottom half of battlefield (with margin)
  const playerZoneStart = Math.floor(height * 0.55); // Start at 55% down
  const playerZoneEnd = height - 100; // End 100px from bottom
  const playerZoneHeight = playerZoneEnd - playerZoneStart;

  // Calculate spacing to fit all squads in player zone
  const spacing = numSquads > 1 ? playerZoneHeight / (numSquads - 1) : 0;

  // Deploy squads from bottom to top
  groups.forEach((squad, index) => {
    const formationType = squad[0].formation || "Line";  // i18n-ignore  troop db id
    // Position from bottom upward
    const yPos = playerZoneEnd - (index * spacing);
    this._applyTacticalFormation(squad, width / 2, yPos, 0xFFFF00, true, formationType);
  });

};

// Helper to group array by key
ArmyBattleField.prototype._groupBy = function (xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

ArmyBattleField.prototype._setupEnemyArmy = function () {
  const enemyArmy = $gameTemp._battleEnemyArmy;
  if (!enemyArmy) {
    console.warn('[ArmyBattle] No enemy army found!');
    return;
  }

  const width = this._battleWidth;
  const height = this._battleHeight;

  // Map and normalize enemy troop data. Scientist-role troops sit out the
  // fight on the enemy side too, same as the player's own workforce.
  const enemyTroops = enemyArmy.getTroops().filter(t => !/scientist/i.test(String(t.role || ""))).map(troop => {
    return {
      ...troop,
      currentHp: troop.hp,
      isLeader: false,
      // Default to 'close quarters' if role is missing, as per plugin standard
      role: (troop.role || "close quarters").toLowerCase(),  // i18n-ignore  troop db id
      // Ensure formation defaults to 'Line' if not specified in the database
      formation: troop.formation || "Line"  // i18n-ignore  troop db id
    };
  });


  // Group troops by name so specific units (e.g., all "Sipahi Cavalry") stay together
  const squads = Object.values(this._groupBy(enemyTroops, 'name'));
  const numSquads = squads.length;

  // Enemy gets top half of battlefield (with margin)
  const enemyZoneStart = 100; // Start 100px from top
  const enemyZoneEnd = Math.floor(height * 0.45); // End at 45% down
  const enemyZoneHeight = enemyZoneEnd - enemyZoneStart;

  // Calculate spacing to fit all squads in enemy zone
  const spacing = numSquads > 1 ? enemyZoneHeight / (numSquads - 1) : 0;

  // Deploy squads from top to bottom
  squads.forEach((squad, index) => {
    const formationType = squad[0].formation;
    const color = 0xFF0000; // Red for Enemy
    // Position from top downward
    const yPos = enemyZoneStart + (index * spacing);


    this._applyTacticalFormation(
      squad,
      width / 2,
      yPos,
      color,
      false, // isPlayer = false
      formationType
    );
  });

};
ArmyBattleField.prototype._applyTacticalFormation = function (troops, centerX, centerY, color, isPlayer, type) {
  // Sprites take more room on the field than the old dots did.
  const spacing = 18;
  const count = troops.length;

  troops.forEach((troop, i) => {
    let relX = 0;
    let relY = 0;

    // i18n-ignore-start  formation ids from the troop database
    switch (type) {
      case "Wedge":
        const rowW = Math.floor(Math.sqrt(i * 2));
        relY = rowW * spacing * (isPlayer ? 1 : -1);
        relX = (i - (rowW * (rowW + 1)) / 2) * spacing - (rowW * spacing) / 2;
        break;

      case "Line":
        relX = (i - count / 2) * spacing;
        relY = 0;
        break;

      case "Double":
        relX = (Math.floor(i / 2) - count / 4) * spacing;
        relY = (i % 2) * spacing * (isPlayer ? 1 : -1);
        break;

      case "Phalanx": // Tight rectangular block
        const pWidth = Math.ceil(Math.sqrt(count) * 1.5);
        relX = (i % pWidth - pWidth / 2) * (spacing * 0.7);
        relY = Math.floor(i / pWidth) * (spacing * 0.7) * (isPlayer ? 1 : -1);
        break;

      case "Circle":
        const radius = (count * spacing) / (2 * Math.PI);
        const angle = (i / count) * Math.PI * 2;
        relX = Math.cos(angle) * radius;
        relY = Math.sin(angle) * radius;
        break;

      case "Scattered":
        relX = (Math.random() - 0.5) * count * spacing;
        relY = (Math.random() - 0.5) * 40;
        break;

      case "Box": // Hollow square
        const side = Math.ceil(count / 4);
        if (i < side) { relX = i * spacing; relY = 0; }
        else if (i < side * 2) { relX = side * spacing; relY = (i - side) * spacing; }
        else if (i < side * 3) { relX = (side * 3 - i) * spacing; relY = side * spacing; }
        else { relX = 0; relY = (side * 4 - i) * spacing; }
        relX -= (side * spacing) / 2;
        break;

      case "Crescent":
        const cAngle = (i / count - 0.5) * Math.PI;
        relX = Math.sin(cAngle) * (count * spacing / 2);
        relY = Math.cos(cAngle) * 30 * (isPlayer ? 1 : -1);
        break;

      case "Column":
        relX = 0;
        relY = i * spacing * (isPlayer ? 1 : -1);
        break;
    // i18n-ignore-end
    }

    const unit = this._createUnit(troop, centerX + relX, centerY + relY, color, isPlayer);
    if (isPlayer) this._playerUnits.push(unit); else this._enemyUnits.push(unit);
    this._contentContainer.addChild(unit.sprite);

    // Only add name label for the first unit of the squad
    if (i === 0) {
      this._contentContainer.addChild(unit.nameLabel);
      // Mark this as the squad's label holder
      unit.isSquadLabelHolder = true;
    }
  });
};

//=============================================================================
// ArmyUnitSprite - a troop drawn with its own Skab character sheet
//
// Troops carry a `spritename` ("Skab/!$Name") straight from Factions.json, so
// the battlefield shows the same people the roster hired instead of a field of
// coloured dots. The sheet is walked frame by frame while the unit moves and
// faced along its velocity.
//=============================================================================

function ArmyUnitSprite() {
  this.initialize(...arguments);
}

ArmyUnitSprite.prototype = Object.create(Sprite.prototype);
ArmyUnitSprite.prototype.constructor = ArmyUnitSprite;

// A troop with no sheet of its own still needs a body: pick one off the
// fallback list by role so the field never shows a blank square.
ArmyUnitSprite.FALLBACK = {
  ranged: "Skab/!$Hunter",  // i18n-ignore  asset path
  support: "Skab/!$Medic",  // i18n-ignore  asset path
  melee: "Skab/!$FootSoldier"  // i18n-ignore  asset path
};

ArmyUnitSprite.prototype.initialize = function (troop, role, color) {
  Sprite.prototype.initialize.call(this);
  this._sheetIndex = Number(troop.spriteindex || 0);
  this._pattern = 1;
  this._direction = 2;
  this._animCount = 0;
  this._frameReady = false;
  this.anchor.set(0.5, 1);

  const sheet = ArmyUnitSprite.resolveSheet(troop, role);
  this.bitmap = ImageManager.loadCharacter(sheet);
  this.bitmap.addLoadListener(() => this._setupFrame());

  // The team ring under the feet: which side a unit is on has to stay readable
  // once every troop wears its own colours.
  const ring = new PIXI.Graphics();
  ring.lineStyle(1, color, 0.9);
  ring.drawEllipse(0, 0, 6, 2.5);
  this.addChild(ring);
};

ArmyUnitSprite.resolveSheet = function (troop, role) {
  const named = troop && troop.spritename;
  if (named) return named;
  const r = String(role || "");  // i18n-ignore  troop db id
  if (r.includes("ranged")) return ArmyUnitSprite.FALLBACK.ranged;  // i18n-ignore  troop db id
  if (r.includes("support")) return ArmyUnitSprite.FALLBACK.support;  // i18n-ignore  troop db id
  return ArmyUnitSprite.FALLBACK.melee;
};

ArmyUnitSprite.prototype._setupFrame = function () {
  const bitmap = this.bitmap;
  if (!bitmap || !bitmap.width) return;
  const file = String(bitmap.url || "").split("/").pop();
  const big = /^[!$]*\$/.test(file);
  this._cw = bitmap.width / (big ? 3 : 12);
  this._ch = bitmap.height / (big ? 4 : 8);
  this._blockX = big ? 0 : (this._sheetIndex % 4) * 3 * this._cw;
  this._blockY = big ? 0 : Math.floor(this._sheetIndex / 4) * 4 * this._ch;
  this._frameReady = true;

  // Every sheet is a different height, so scale to a fixed field height
  // instead of trusting the art to be uniform.
  const target = ArmyBattleView.Params.unitHeight;
  const scale = this._ch > 0 ? target / this._ch : 1;
  this.scale.set(scale, scale);
  this._refreshFrame();
};

ArmyUnitSprite.prototype._refreshFrame = function () {
  if (!this._frameReady) return;
  const row = (this._direction - 2) / 2;
  this.setFrame(
    this._blockX + this._pattern * this._cw,
    this._blockY + row * this._ch,
    this._cw,
    this._ch
  );
};

// Face along the movement and walk the sheet while there is movement to walk.
ArmyUnitSprite.prototype.stepAnimation = function (vx, vy) {
  const moving = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01;
  let dir = this._direction;
  if (moving) {
    if (Math.abs(vx) > Math.abs(vy)) dir = vx > 0 ? 6 : 4;
    else dir = vy > 0 ? 2 : 8;
  }
  let pattern = this._pattern;
  if (moving) {
    this._animCount += 1;
    if (this._animCount >= 10) {
      this._animCount = 0;
      pattern = (this._pattern + 1) % 4;
    }
  } else if (this._pattern !== 1) {
    pattern = 1;
  }
  if (dir !== this._direction || pattern !== this._pattern) {
    this._direction = dir;
    this._pattern = pattern === 3 ? 1 : pattern;
    this._refreshFrame();
  }
};

ArmyBattleField.prototype._createUnit = function (troop, x, y, color, isPlayer) {
  const role = (troop.role || "close quarters").toLowerCase();  // i18n-ignore  troop db id

  const sprite = new ArmyUnitSprite(troop, role, color);
  sprite.x = x;
  sprite.y = y;

  // Create name label
  const troopName = (typeof armyT === "function") ? armyT(troop.name) : troop.name;

  const nameLabel = new PIXI.Text(troopName, {
    fontFamily: "Arial",
    fontSize: 12,
    fill: color,
    stroke: 0x000000,
    strokeThickness: 3
  });
  nameLabel.anchor.set(0.5, 1); // Center horizontally, bottom of text at anchor
  nameLabel.x = x;
  nameLabel.y = y - ArmyBattleView.Params.unitHeight - 2; // Position above unit

  return {
    sprite: sprite,
    nameLabel: nameLabel,
    troop: troop,
    x: x,
    y: y,
    targetX: x,
    targetY: y,
    isPlayer: isPlayer,
    isAlive: true,
    targetEnemy: null,
    attackCooldown: 0,
    role: role,
    morale: 100, // 0-100, affects combat effectiveness
    velocityX: 0,
    velocityY: 0,
    isCharging: false,
    isRouting: false,
    lastX: x,
    lastY: y
  };
};

ArmyBattleField.prototype.update = function () {
  if (!this._battleActive) return;

  // Check for TAB key to toggle info screen visibility
  if (Input.isTriggered("tab")) {
    this._infoScreen.visible = !this._infoScreen.visible;
  }

  // Process input for zoom and drag
  this._processInput();

  // Process commander abilities
  this._processCommanderAbilities();

  // Update all units
  this._updateUnits();

  // Update projectiles
  this._updateProjectiles();

  // Update particles
  this._updateParticles();

  // Count alive units once per frame, shared by both consumers below.
  this._countAliveUnits();

  // Check for battle end
  this._checkBattleEnd();

  // Update counters
  this._updateCounters();

  // Update ability cooldowns display
  this._updateAbilityCooldowns();

  // Refresh info screen periodically (every 30 frames)
  if (Graphics.frameCount % 30 === 0 && this._infoScreen.visible) {
    this._refreshInfoScreen();
  }
};

ArmyBattleField.prototype._processInput = function () {
  // Keyboard / controller pan (arrows, WASD via global mapping, d-pad/stick)
  const panSpeed = 8;
  let panned = false;
  if (Input.isPressed("left"))  { this._viewportX += panSpeed; panned = true; }
  if (Input.isPressed("right")) { this._viewportX -= panSpeed; panned = true; }
  if (Input.isPressed("up"))    { this._viewportY += panSpeed; panned = true; }
  if (Input.isPressed("down"))  { this._viewportY -= panSpeed; panned = true; }
  if (panned) this._applyViewportTransform();

  // Handle mouse wheel zoom
  const wheelDelta = TouchInput.wheelY;
  if (wheelDelta !== 0) {
    const zoomFactor = wheelDelta > 0 ? 0.9 : 1.1;
    this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, this._zoom * zoomFactor));
    this._applyViewportTransform();
  }

  // Get mouse position
  const x = TouchInput.x;
  const y = TouchInput.y;

  // Check if mouse is within battlefield bounds
  const width = this._battleWidth;
  const height = this._battleHeight;
  const localX = x - this.x;
  const localY = y - this.y;

  if (localX < 0 || localY < 0 || localX > width || localY > height) {
    // Mouse outside battlefield
    return;
  }

  // Handle mouse press/drag
  if (TouchInput.isPressed()) {
    if (!this._mousePressed) {
      // Mouse just pressed
      this._mousePressed = true;
      this._dragStarted = false;
      this._lastTouchX = x;
      this._lastTouchY = y;
    } else {
      // Mouse is being dragged
      const dx = x - this._lastTouchX;
      const dy = y - this._lastTouchY;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this._dragStarted = true;
        this._viewportX += dx;
        this._viewportY += dy;
        this._applyViewportTransform();
      }

      this._lastTouchX = x;
      this._lastTouchY = y;
    }
  } else {
    // Mouse released
    this._mousePressed = false;
    this._dragStarted = false;
  }
};

ArmyBattleField.prototype._applyViewportTransform = function () {
  // Apply zoom and pan to content container
  this._contentContainer.scale.set(this._zoom, this._zoom);
  this._contentContainer.position.set(this._viewportX, this._viewportY);

  // Update zoom indicator
  if (this._zoomText) {
    this._zoomText.text = T('ArmyBattle.zoom', { pct: Math.round(this._zoom * 100) });
  }
};

ArmyBattleField.prototype._updateUnits = function () {
  const speed = ArmyBattleView.Params.advanceSpeed;
  const baseAttackRange = ArmyBattleView.Params.attackRange;

  // Decrement per-hit flash timers and restore tints (replaces per-hit setTimeout).
  this._updateFlashTimers();

  // Update player units
  for (let idx = 0; idx < this._playerUnits.length; idx++) {
    const unit = this._playerUnits[idx];
    if (!unit.isAlive) continue;

    // Check for routing behavior
    if (unit.isRouting) {
      this._updateRoutingUnit(unit);
      continue;
    }

    // Check if unit is holding position
    if (unit.holdPosition) {
      // Units holding position only attack enemies in range, don't move
      const nearestEnemy = this._acquireTarget(unit, this._enemyUnits, idx);
      if (nearestEnemy) {
        const distance = this._getDistance(unit.sprite.x, unit.sprite.y, nearestEnemy.sprite.x, nearestEnemy.sprite.y);
        const attackRange = unit.role.includes("ranged") ? baseAttackRange * 3 : baseAttackRange;
        if (distance <= attackRange) {
          this._attackEnemy(unit, nearestEnemy);
        }
      }
      continue;
    }

    // Find nearest enemy
    const nearestEnemy = this._acquireTarget(unit, this._enemyUnits, idx);

    if (nearestEnemy) {
      const distance = this._getDistance(unit.sprite.x, unit.sprite.y, nearestEnemy.sprite.x, nearestEnemy.sprite.y);

      // Determine attack range based on role
      let attackRange = baseAttackRange;
      if (unit.role.includes("ranged")) {
        attackRange = baseAttackRange * 3; // 3x range for ranged units
      }

      // Ranged units try to maintain distance
      if (unit.role.includes("ranged")) {
        const idealRange = baseAttackRange * 2.5;
        if (distance < idealRange) {
          // Retreat from enemy
          const angle = Math.atan2(unit.sprite.y - nearestEnemy.sprite.y, unit.sprite.x - nearestEnemy.sprite.x);
          unit.sprite.x += Math.cos(angle) * speed * 0.7;
          unit.sprite.y += Math.sin(angle) * speed * 0.7;
          unit.isCharging = false;
        } else if (distance > attackRange) {
          // Move to ideal range
          const angle = Math.atan2(nearestEnemy.sprite.y - unit.sprite.y, nearestEnemy.sprite.x - unit.sprite.x);
          unit.sprite.x += Math.cos(angle) * speed * 0.5;
          unit.sprite.y += Math.sin(angle) * speed * 0.5;
          unit.isCharging = false;
        } else {
          // In range, attack
          this._attackEnemy(unit, nearestEnemy);
        }
      } else {
        // Melee units charge in
        if (distance > attackRange) {
          const angle = Math.atan2(nearestEnemy.sprite.y - unit.sprite.y, nearestEnemy.sprite.x - unit.sprite.x);
          const moveSpeed = speed * (unit.morale / 100);
          unit.velocityX = Math.cos(angle) * moveSpeed;
          unit.velocityY = Math.sin(angle) * moveSpeed;
          unit.sprite.x += unit.velocityX;
          unit.sprite.y += unit.velocityY;

          // Check if charging (moving fast)
          const velocity = Math.sqrt(unit.velocityX * unit.velocityX + unit.velocityY * unit.velocityY);
          unit.isCharging = velocity > speed * 0.8;
        } else {
          unit.velocityX = 0;
          unit.velocityY = 0;
          unit.isCharging = false;
          this._attackEnemy(unit, nearestEnemy);
        }
      }
    }

    // Clamp position to battlefield boundaries
    this._clampUnitPosition(unit);
  }

  // Update enemy units (same logic)
  for (let idx = 0; idx < this._enemyUnits.length; idx++) {
    const unit = this._enemyUnits[idx];
    if (!unit.isAlive) continue;

    if (unit.isRouting) {
      this._updateRoutingUnit(unit);
      continue;
    }

    const nearestPlayer = this._acquireTarget(unit, this._playerUnits, idx);

    if (nearestPlayer) {
      const distance = this._getDistance(unit.sprite.x, unit.sprite.y, nearestPlayer.sprite.x, nearestPlayer.sprite.y);

      let attackRange = baseAttackRange;
      if (unit.role.includes("ranged")) {
        attackRange = baseAttackRange * 3;
      }

      if (unit.role.includes("ranged")) {
        const idealRange = baseAttackRange * 2.5;
        if (distance < idealRange) {
          const angle = Math.atan2(unit.sprite.y - nearestPlayer.sprite.y, unit.sprite.x - nearestPlayer.sprite.x);
          unit.sprite.x += Math.cos(angle) * speed * 0.7;
          unit.sprite.y += Math.sin(angle) * speed * 0.7;
          unit.isCharging = false;
        } else if (distance > attackRange) {
          const angle = Math.atan2(nearestPlayer.sprite.y - unit.sprite.y, nearestPlayer.sprite.x - unit.sprite.x);
          unit.sprite.x += Math.cos(angle) * speed * 0.5;
          unit.sprite.y += Math.sin(angle) * speed * 0.5;
          unit.isCharging = false;
        } else {
          this._attackEnemy(unit, nearestPlayer);
        }
      } else {
        if (distance > attackRange) {
          const angle = Math.atan2(nearestPlayer.sprite.y - unit.sprite.y, nearestPlayer.sprite.x - unit.sprite.x);
          const moveSpeed = speed * (unit.morale / 100);
          unit.velocityX = Math.cos(angle) * moveSpeed;
          unit.velocityY = Math.sin(angle) * moveSpeed;
          unit.sprite.x += unit.velocityX;
          unit.sprite.y += unit.velocityY;

          const velocity = Math.sqrt(unit.velocityX * unit.velocityX + unit.velocityY * unit.velocityY);
          unit.isCharging = velocity > speed * 0.8;
        } else {
          unit.velocityX = 0;
          unit.velocityY = 0;
          unit.isCharging = false;
          this._attackEnemy(unit, nearestPlayer);
        }
      }
    }

    // Clamp position to battlefield boundaries
    this._clampUnitPosition(unit);
  }

  this._stepUnitAnimations();
};

// One pass over every unit turning the frame's real displacement into a facing
// and a walk frame, so units that were pushed, routed or held still all read
// correctly rather than only the ones that took the charge branch.
ArmyBattleField.prototype._stepUnitAnimations = function () {
  const step = (unit) => {
    if (!unit.isAlive || !unit.sprite.stepAnimation) return;
    const dx = unit.sprite.x - unit.lastX;
    const dy = unit.sprite.y - unit.lastY;
    unit.lastX = unit.sprite.x;
    unit.lastY = unit.sprite.y;
    unit.sprite.stepAnimation(dx, dy);
  };
  for (const unit of this._playerUnits) step(unit);
  for (const unit of this._enemyUnits) step(unit);
};

ArmyBattleField.prototype._clampUnitPosition = function (unit) {
  // Clamp unit position to battlefield boundaries
  const margin = 20; // Keep units 20px away from edges
  const minX = margin;
  const maxX = this._battleWidth - margin;
  const minY = margin;
  const maxY = this._battleHeight - margin;

  unit.sprite.x = Math.max(minX, Math.min(maxX, unit.sprite.x));
  unit.sprite.y = Math.max(minY, Math.min(maxY, unit.sprite.y));

  // Update name label position only if this unit is the squad's label holder
  if (unit.isSquadLabelHolder) {
    const dotSize = ArmyBattleView.Params.dotSize;
    unit.nameLabel.x = unit.sprite.x;
    unit.nameLabel.y = unit.sprite.y - dotSize - 2;
  }
};

ArmyBattleField.prototype._findNearestEnemy = function (unit, enemies) {
  let nearest = null;
  let nearestDistSq = Infinity;

  // Compare squared distances: nearest by dist^2 == nearest by dist, so this
  // drops the per-candidate sqrt from the O(N*M) search without changing which
  // unit is picked.
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;

    const distSq = this._getDistanceSq(unit.sprite.x, unit.sprite.y, enemy.sprite.x, enemy.sprite.y);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }

  return nearest;
};

// Per-hit white flash restore, frame-counted instead of via setTimeout.
ArmyBattleField.prototype._updateFlashTimers = function () {
  if (this._destroyed) return;
  const tick = (units) => {
    for (const u of units) {
      if (u.flashTimer > 0) {
        u.flashTimer--;
        if (u.flashTimer === 0 && u.sprite) {
          u.sprite.tint = u._flashOriginalTint;
        }
      }
    }
  };
  tick(this._playerUnits);
  tick(this._enemyUnits);
};

// Starts (or refreshes) a unit's white hit-flash for ~100ms (6 frames @60fps).
ArmyBattleField.prototype._startHitFlash = function (unit) {
  if (!unit.sprite) return;
  if (!(unit.flashTimer > 0)) {
    unit._flashOriginalTint = unit.sprite.tint;
  }
  unit.sprite.tint = 0xFFFFFF;
  unit.flashTimer = 6;
};

// Returns the unit's cached target, re-acquiring the nearest enemy only every
// 12 frames (staggered by unit index) or when the current target is dead. This
// avoids running the O(N*M) nearest search for every unit every frame.
ArmyBattleField.prototype._acquireTarget = function (unit, enemies, idx) {
  const cached = unit.target;
  const due = ((Graphics.frameCount + idx) % 12) === 0;
  if (cached && cached.isAlive && !due) return cached;
  const found = this._findNearestEnemy(unit, enemies);
  unit.target = found;
  return found;
};

ArmyBattleField.prototype._getDistance = function (x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};

ArmyBattleField.prototype._getDistanceSq = function (x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};

ArmyBattleField.prototype._attackEnemy = function (attacker, defender) {
  // Cooldown system
  if (attacker.attackCooldown > 0) {
    attacker.attackCooldown--;
    return;
  }

  // Ranged units fire projectiles
  if (attacker.role.includes("ranged")) {
    this._fireProjectile(attacker, defender);
    attacker.attackCooldown = 90; // Slower attack speed for ranged
    return;
  }

  // Melee combat
  const attackerStats = attacker.troop;
  const defenderStats = defender.troop;

  let baseDamage = Math.max(1, attackerStats.atk - defenderStats.def / 2);

  // Morale affects damage (50% morale = 50% damage)
  baseDamage *= (attacker.morale / 100);

  // Charge bonus: +50% damage if charging
  if (attacker.isCharging) {
    baseDamage *= 1.5;
    this._createParticle(attacker.sprite.x, attacker.sprite.y, 0xFFAA00, "CHARGE!");
  }

  // Flanking bonus: Check if attacking from behind
  const isFlanking = this._checkFlanking(attacker, defender);
  if (isFlanking) {
    baseDamage *= 1.3; // +30% damage from behind
    defender.morale -= 5; // Reduce defender morale
  }

  // Critical hit chance (10% base + luck/100)
  const critChance = 0.1 + (attackerStats.luk || 0) / 1000;
  const isCrit = Math.random() < critChance;
  if (isCrit) {
    baseDamage *= 2;
    this._createParticle(defender.sprite.x, defender.sprite.y, 0xFF0000, "CRIT!");
  }

  // Variance
  const variance = 0.2;
  const damage = Math.floor(baseDamage * (1 + (Math.random() * variance * 2 - variance)));

  // Apply damage
  defenderStats.currentHp -= damage;

  // Flash defender white
  this._startHitFlash(defender);

  // Morale damage
  defender.morale -= damage / 10;
  if (defender.morale < 0) defender.morale = 0;

  // Check if morale broken (route at 20% morale)
  if (!this._practice && defender.morale < 20 && Math.random() < 0.3) {
    defender.isRouting = true;
  }

  // Check if dead
  if (defenderStats.currentHp <= 0) {
    this._killUnit(defender);
  }

  // Set cooldown (60 frames = 1 second at 60fps)
  attacker.attackCooldown = 60;
};

ArmyBattleField.prototype._killUnit = function (unit) {
  if (this._practice) {
    // A drill has no casualties: the unit is patched up and sent back in.
    unit.troop.currentHp = unit.troop.hp;
    unit.morale = 100;
    unit.isRouting = false;
    unit.sprite.tint = 0xFFFFFF;
    return;
  }
  const injuryChance = ArmyBattleView.Params.injuryChance;
  const isInjured = Math.random() * 100 < injuryChance;

  if (isInjured) {
    // Injured - set HP to 1 and remove from battle
    unit.troop.currentHp = 1;
    unit.isAlive = false;
    unit.sprite.visible = false;
    if (unit.isSquadLabelHolder) {
      unit.nameLabel.visible = false;
    }

    // Mark troop as injured in army data
    if (unit.isPlayer && !unit.troop.isLeader) {
      const actualTroop = $gameArmy.getTroops().find(t => t.id === unit.troop.id);
      if (actualTroop) {
        actualTroop.hp = 1; // Set to injured state
      }
    }
  } else {
    // Dead - remove completely
    unit.isAlive = false;
    unit.sprite.visible = false;
    if (unit.isSquadLabelHolder) {
      unit.nameLabel.visible = false;
    }

    // Remove from army data
    if (unit.isPlayer) {
      if (unit.troop.isLeader) {
        // Party member died
        const actorId = parseInt(unit.troop.id.replace("actor_", ""));
        const actor = $gameActors.actor(actorId);
        if (actor) {
          actor.setHp(0);
        }
      } else {
        // Regular troop died
        $gameArmy.removeTroop(unit.troop.id);
      }
    }
  }
};

// Counts alive units for both sides in a single pass, caching the results so
// _updateCounters and _checkBattleEnd reuse them instead of four filter() allocs.
ArmyBattleField.prototype._countAliveUnits = function () {
  let playerAlive = 0;
  for (const u of this._playerUnits) if (u.isAlive) playerAlive++;
  let enemyAlive = 0;
  for (const u of this._enemyUnits) if (u.isAlive) enemyAlive++;
  this._playerAliveCount = playerAlive;
  this._enemyAliveCount = enemyAlive;
};

ArmyBattleField.prototype._updateCounters = function () {
  this._playerCounterText.text = T('ArmyBattle.playerArmy', { count: this._playerAliveCount });
  this._enemyCounterText.text = T('ArmyBattle.enemyArmy', { count: this._enemyAliveCount });
};

ArmyBattleField.prototype._checkBattleEnd = function () {
  if (this._practice) return; // the drill runs until the player leaves it
  if (this._playerAliveCount === 0) {
    this._endBattle("defeat");
  } else if (this._enemyAliveCount === 0) {
    this._endBattle("victory");
  }
};

ArmyBattleField.prototype._endBattle = function (result) {
  this._battleActive = false;
  this._battleEnded = true;
  this._battleResult = result;

  // Show result text
  this._resultText.text = result === "victory" ? "VICTORY!" : "DEFEAT!";
  this._resultText.style.fill = result === "victory" ? 0x00FF00 : 0xFF0000;
  this._resultText.visible = true;
};

ArmyBattleField.prototype.isBattleEnded = function () {
  return this._battleEnded;
};

ArmyBattleField.prototype.getBattleResult = function () {
  return this._battleResult;
};

//=============================================================================
// Combat Mechanics - Flanking, Projectiles, Particles, Routing
//=============================================================================

ArmyBattleField.prototype._checkFlanking = function (attacker, defender) {
  // Calculate angle from defender to attacker
  const angle = Math.atan2(attacker.sprite.y - defender.sprite.y, attacker.sprite.x - defender.sprite.x);

  // Calculate defender's facing direction (towards their enemies)
  const defenderFacing = defender.isPlayer ? -Math.PI / 2 : Math.PI / 2; // Up for player, down for enemy

  // Calculate angle difference
  let angleDiff = Math.abs(angle - defenderFacing);
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

  // Flanking if attacking from more than 90 degrees off facing
  return angleDiff > Math.PI / 2;
};

ArmyBattleField.prototype._fireProjectile = function (attacker, defender) {
  const projectile = {
    sprite: new PIXI.Graphics(),
    x: attacker.sprite.x,
    y: attacker.sprite.y,
    targetX: defender.sprite.x,
    targetY: defender.sprite.y,
    target: defender,
    attacker: attacker,
    speed: 5,
    damage: Math.max(1, attacker.troop.atk - defender.troop.def / 2) * (attacker.morale / 100),
    alive: true
  };

  // Draw projectile (small yellow circle)
  projectile.sprite.beginFill(attacker.isPlayer ? 0xFFFF00 : 0xFF0000);
  projectile.sprite.drawCircle(0, 0, 2);
  projectile.sprite.endFill();
  projectile.sprite.x = projectile.x;
  projectile.sprite.y = projectile.y;

  this._projectiles.push(projectile);
  this._effectsContainer.addChild(projectile.sprite);
};

ArmyBattleField.prototype._updateProjectiles = function () {
  for (let i = this._projectiles.length - 1; i >= 0; i--) {
    const proj = this._projectiles[i];

    if (!proj.alive) {
      this._effectsContainer.removeChild(proj.sprite);
      if (proj.sprite && !proj.sprite._destroyed) proj.sprite.destroy();
      this._projectiles.splice(i, 1);
      continue;
    }

    // Move towards target
    const dx = proj.targetX - proj.x;
    const dy = proj.targetY - proj.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < proj.speed || !proj.target.isAlive) {
      // Hit target or target died
      if (proj.target.isAlive) {
        const defenderStats = proj.target.troop;

        // Apply damage with variance
        const variance = 0.2;
        const damage = Math.floor(proj.damage * (1 + (Math.random() * variance * 2 - variance)));

        defenderStats.currentHp -= damage;

        // Flash target
        this._startHitFlash(proj.target);

        // Morale damage
        proj.target.morale -= damage / 10;
        if (proj.target.morale < 0) proj.target.morale = 0;

        // Check if dead
        if (defenderStats.currentHp <= 0) {
          this._killUnit(proj.target);
        }
      }

      proj.alive = false;
    } else {
      // Continue moving
      proj.x += (dx / dist) * proj.speed;
      proj.y += (dy / dist) * proj.speed;
      proj.sprite.x = proj.x;
      proj.sprite.y = proj.y;

      // Update target position (target may have moved)
      if (proj.target.isAlive) {
        proj.targetX = proj.target.sprite.x;
        proj.targetY = proj.target.sprite.y;
      }
    }
  }
};

ArmyBattleField.prototype._createParticle = function (x, y, color, text) {
  const particle = {
    sprite: new PIXI.Text(text || "", {
      fontFamily: "Arial",
      fontSize: 14,
      fill: color,
      stroke: 0x000000,
      strokeThickness: 2
    }),
    x: x,
    y: y,
    lifetime: 60, // 1 second at 60fps
    velocityY: -1
  };

  particle.sprite.x = x;
  particle.sprite.y = y;
  particle.sprite.anchor.set(0.5);

  this._particles.push(particle);
  this._effectsContainer.addChild(particle.sprite);
};

ArmyBattleField.prototype._updateParticles = function () {
  for (let i = this._particles.length - 1; i >= 0; i--) {
    const particle = this._particles[i];

    particle.lifetime--;
    particle.y += particle.velocityY;
    particle.sprite.y = particle.y;
    particle.sprite.alpha = particle.lifetime / 60;

    if (particle.lifetime <= 0) {
      this._effectsContainer.removeChild(particle.sprite);
      if (particle.sprite && !particle.sprite._destroyed) particle.sprite.destroy();
      this._particles.splice(i, 1);
    }
  }
};

// Destroy the whole battle display tree. All unit sprites are procedural
// PIXI.Graphics and all labels are PIXI.Text with their own generated
// textures, so a recursive destroy is safe (no shared/cached base textures).
ArmyBattleField.prototype.destroyField = function () {
  if (this._destroyed) return;

  // Restore any outstanding "Inspire" attack boosts so the persistent army
  // troop stats keep their exact original value if the scene is torn down
  // before the revert timeout fires.
  if (this._playerUnits) {
    for (const unit of this._playerUnits) {
      if (unit._inspireOriginalAtk !== undefined) {
        unit.troop.atk = unit._inspireOriginalAtk;
        unit._inspireOriginalAtk = undefined;
      }
    }
  }

  if (this._projectiles) {
    for (const proj of this._projectiles) {
      if (proj.sprite && !proj.sprite._destroyed) proj.sprite.destroy();
    }
    this._projectiles.length = 0;
  }
  if (this._particles) {
    for (const particle of this._particles) {
      if (particle.sprite && !particle.sprite._destroyed) particle.sprite.destroy();
    }
    this._particles.length = 0;
  }

  if (this.parent) this.parent.removeChild(this);
  this.destroy({ children: true, texture: true, baseTexture: false });
};

ArmyBattleField.prototype._updateRoutingUnit = function (unit) {
  // Routing units flee towards their starting edge
  const fleeDirection = unit.isPlayer ? 1 : -1; // Player flees down, enemy flees up
  const speed = ArmyBattleView.Params.advanceSpeed * 1.5; // Flee faster

  unit.sprite.y += fleeDirection * speed;

  // Change color to indicate routing (darker)
  unit.sprite.tint = 0x888888;

  // Clamp to battlefield boundaries
  this._clampUnitPosition(unit);

  // Remove from battle if reached edge of battlefield
  const margin = 30;
  const height = this._battleHeight;
  if (unit.sprite.y <= margin || unit.sprite.y >= height - margin) {
    unit.isAlive = false;
    unit.sprite.visible = false;
    if (unit.isSquadLabelHolder) {
      unit.nameLabel.visible = false;
    }
  }
};

//=============================================================================
// Commander Abilities System
//=============================================================================

ArmyBattleField.prototype._processCommanderAbilities = function () {
  // Decrease cooldowns
  for (const ability of this._commanderAbilities) {
    if (ability.currentCooldown > 0) {
      ability.currentCooldown -= 1 / 60; // Decrease by 1 second per 60 frames
    }
  }

  // Check for key presses
  for (const ability of this._commanderAbilities) {
    if (ability.currentCooldown <= 0) {
      let keyPressed = false;

      // Check key press based on ability key
      if (ability.key === "q" && Input.isTriggered("pageup")) keyPressed = true;
      if (ability.key === "w" && Input.isTriggered("pagedown")) keyPressed = true;
      if (ability.key === "e" && Input.isTriggered("shift")) keyPressed = true;

      // Fallback: check raw keyboard input
      if (!keyPressed && this._checkKeyPress(ability.key)) {
        keyPressed = true;
      }

      if (keyPressed) {
        this._activateAbility(ability);
        ability.currentCooldown = ability.cooldown;
      }
    }
  }
};

// Raw keyboard tracking: Input._currentState is keyed by mapped action names
// ('up', 'pageup', ...), never by letters, and W/E are remapped globally by
// other plugins, so ability keys need their own physical-key state.
const _abvRawKeys = {};
const _abvHandledKeys = {};
document.addEventListener("keydown", (e) => { _abvRawKeys[e.code] = true; });
document.addEventListener("keyup", (e) => { _abvRawKeys[e.code] = false; });

ArmyBattleField.prototype._checkKeyPress = function (key) {
  const code = /^[a-z]$/i.test(key) ? "Key" + key.toUpperCase() : "Digit" + key;
  if (_abvRawKeys[code]) {
    if (_abvHandledKeys[code]) return false;
    _abvHandledKeys[code] = true;
    return true;
  }
  _abvHandledKeys[code] = false;
  return false;
};

ArmyBattleField.prototype._activateAbility = function (ability) {

  switch (ability.effect) {
    case "rally":
      this._rallyTroops();
      break;
    case "heal":
      this._healSquad();
      break;
    case "inspire":
      this._inspireTroops();
      break;
  }
};

ArmyBattleField.prototype._rallyTroops = function () {
  // Restore morale to routing units
  let ralliedCount = 0;
  for (const unit of this._playerUnits) {
    if (unit.isRouting) {
      unit.isRouting = false;
      unit.morale = 50; // Restore to 50%
      unit.sprite.tint = 0xFFFFFF; // Reset color
      ralliedCount++;
    } else if (unit.isAlive) {
      unit.morale = Math.min(100, unit.morale + 20); // Boost morale
    }
  }

  // Visual feedback
  this._createParticle(
    this._battleWidth / 2,
    this._battleHeight - 200,
    0xFFFF00,
    T('ArmyBattle.rallyBanner', { count: ralliedCount })
  );
};

ArmyBattleField.prototype._healSquad = function () {
  // Heal all player units
  let healedCount = 0;
  for (const unit of this._playerUnits) {
    if (unit.isAlive && unit.troop.currentHp < unit.troop.hp) {
      const healAmount = Math.floor(unit.troop.hp * 0.25); // Heal 25% of max HP
      unit.troop.currentHp = Math.min(unit.troop.hp, unit.troop.currentHp + healAmount);
      healedCount++;
    }
  }

  // Visual feedback
  this._createParticle(
    this._battleWidth / 2,
    this._battleHeight - 200,
    0x00FF00,
    T('ArmyBattle.healBanner', { count: healedCount })
  );
};

ArmyBattleField.prototype._inspireTroops = function () {
  // Grant temporary damage and morale boost.
  // Store the exact original atk so the revert restores it without lossy
  // double-floor degrading the persistent saved army stats.
  const boosted = [];
  for (const unit of this._playerUnits) {
    if (unit.isAlive) {
      unit.morale = 100; // Max morale
      const baseAtk = unit.troop.atk || 10;
      // Only capture the original once, ignore already-boosted stacked casts
      if (unit._inspireOriginalAtk === undefined) {
        unit._inspireOriginalAtk = baseAtk;
      }
      unit.troop.atk = Math.floor(baseAtk * 1.5); // +50% attack for duration
      boosted.push(unit);
    }
  }

  // Visual feedback
  this._createParticle(
    this._battleWidth / 2,
    this._battleHeight - 200,
    0xFF8800,
    T('ArmyBattle.inspireBanner')
  );

  // Reset attack after 10 seconds. Guard against the scene being popped or the
  // field destroyed before the timeout fires.
  setTimeout(() => {
    if (this._destroyed) return;
    for (const unit of boosted) {
      if (unit._inspireOriginalAtk !== undefined) {
        unit.troop.atk = unit._inspireOriginalAtk;
        unit._inspireOriginalAtk = undefined;
      }
    }
  }, 10000);
};

ArmyBattleField.prototype._updateAbilityCooldowns = function () {
  for (let i = 0; i < this._commanderAbilities.length; i++) {
    const ability = this._commanderAbilities[i];
    const text = this._abilityTexts[i];

    if (ability.currentCooldown > 0) {
      text.text = `[${ability.key.toUpperCase()}] ${ability.name} (${Math.ceil(ability.currentCooldown)}s)`;
      text.style.fill = 0x888888; // Gray out when on cooldown
    } else {
      text.text = `[${ability.key.toUpperCase()}] ${ability.name}`;
      text.style.fill = 0x00FF00; // Green when ready
    }
  }
};

//=============================================================================
// Info Screen System
//=============================================================================

ArmyBattleField.prototype._refreshInfoScreen = function () {
  // Group units by squad name. Squad membership is stable for the whole
  // battle (only alive counts change), so build the labels once and then
  // just update their .text instead of rebuilding every PIXI.Text each call.
  const playerSquads = this._groupUnitsBySquad(this._playerUnits);
  const enemySquads = this._groupUnitsBySquad(this._enemyUnits);

  if (!this._infoSquadTextsBuilt) {
    this._buildInfoSquadTexts(playerSquads, enemySquads);
    this._infoSquadTextsBuilt = true;
  }

  this._updateSquadTexts(this._infoPlayerSquadTexts, playerSquads);
  this._updateSquadTexts(this._infoEnemySquadTexts, enemySquads);

  // Refresh command panel
  this._refreshCommandPanel();
};

ArmyBattleField.prototype._buildInfoSquadTexts = function (playerSquads, enemySquads) {
  this._infoPlayerSquadTexts = {};
  this._infoEnemySquadTexts = {};

  // Player title
  const playerTitle = new PIXI.Text("YOUR FORCES", {
    fontFamily: "Arial",
    fontSize: 16,
    fill: 0xFFFF00,
    stroke: 0x000000,
    strokeThickness: 2
  });
  this._infoPlayerSquads.addChild(playerTitle);

  let yOffset = 25;
  for (const [squadName, units] of Object.entries(playerSquads)) {
    const squadLabel = (typeof armyT === "function") ? armyT(squadName) : squadName;
    const displayName = squadLabel.length > 15 ? squadLabel.substring(0, 12) + "..." : squadLabel;

    const squadText = new PIXI.Text("", {
      fontFamily: "Arial",
      fontSize: 12,
      fill: 0xFFFFFF,
      stroke: 0x000000,
      strokeThickness: 2
    });
    squadText.y = yOffset;
    squadText.interactive = true;
    squadText.buttonMode = true;
    squadText.on('pointerdown', () => this._selectSquad(squadName, units, true));
    this._infoPlayerSquads.addChild(squadText);
    this._infoPlayerSquadTexts[squadName] = { text: squadText, displayName, units };

    yOffset += 35;
  }

  // Enemy title
  const enemyTitle = new PIXI.Text("ENEMY FORCES", {
    fontFamily: "Arial",
    fontSize: 16,
    fill: 0xFF0000,
    stroke: 0x000000,
    strokeThickness: 2
  });
  this._infoEnemySquads.addChild(enemyTitle);

  yOffset = 25;
  for (const [squadName, units] of Object.entries(enemySquads)) {
    const squadLabel = (typeof armyT === "function") ? armyT(squadName) : squadName;
    const displayName = squadLabel.length > 15 ? squadLabel.substring(0, 12) + "..." : squadLabel;

    const squadText = new PIXI.Text("", {
      fontFamily: "Arial",
      fontSize: 12,
      fill: 0xFFFFFF,
      stroke: 0x000000,
      strokeThickness: 2
    });
    squadText.y = yOffset;
    this._infoEnemySquads.addChild(squadText);
    this._infoEnemySquadTexts[squadName] = { text: squadText, displayName, units };

    yOffset += 35;
  }
};

ArmyBattleField.prototype._updateSquadTexts = function (cache, squads) {
  for (const squadName in cache) {
    const entry = cache[squadName];
    const units = squads[squadName] || entry.units;
    const aliveCount = units.filter(u => u.isAlive).length;
    const totalCount = units.length;
    entry.text.text = `${entry.displayName}\n${aliveCount}/${totalCount}`;
    entry.text.style.fill = aliveCount > 0 ? 0xFFFFFF : 0x888888;
  }
};

ArmyBattleField.prototype._groupUnitsBySquad = function (units) {
  const squads = {};
  for (const unit of units) {
    const squadName = unit.troop.name;
    if (!squads[squadName]) {
      squads[squadName] = [];
    }
    squads[squadName].push(unit);
  }
  return squads;
};

ArmyBattleField.prototype._selectSquad = function (squadName, units, isPlayer) {
  if (!isPlayer) return; // Can only select player squads

  this._selectedSquad = { name: squadName, units: units };
  this._refreshCommandPanel();
};

ArmyBattleField.prototype._refreshCommandPanel = function () {
  this._infoCommandPanel.removeChildren();

  if (!this._selectedSquad) {
    const noSelection = new PIXI.Text(T('ArmyBattle.clickSquad'), {
      fontFamily: "Arial",
      fontSize: 11,
      fill: 0xCCCCCC
    });
    this._infoCommandPanel.addChild(noSelection);
    return;
  }

  // Show selected squad (truncated)
  const squadName = this._selectedSquad.name.length > 12 ?
    this._selectedSquad.name.substring(0, 9) + "..." :
    this._selectedSquad.name;

  const title = new PIXI.Text(`SELECTED:\n${squadName}`, {
    fontFamily: "Arial",
    fontSize: 12,
    fill: 0xFFFF00,
    stroke: 0x000000,
    strokeThickness: 2
  });
  this._infoCommandPanel.addChild(title);

  // Command buttons (vertical layout)
  const commands = [
    { key: "1", name: T('ArmyBattle.command.hold'), action: "hold" },
    { key: "2", name: T('ArmyBattle.command.attack'), action: "aggressive" },
    { key: "3", name: T('ArmyBattle.command.defend'), action: "defensive" },
    { key: "4", name: T('ArmyBattle.command.retreat'), action: "retreat" }
  ];

  let yOffset = 40;
  for (const cmd of commands) {
    const cmdText = new PIXI.Text(`[${cmd.key}] ${cmd.name}`, {
      fontFamily: "Arial",
      fontSize: 11,
      fill: 0x00FF00,
      stroke: 0x000000,
      strokeThickness: 2
    });
    cmdText.y = yOffset;
    cmdText.interactive = true;
    cmdText.buttonMode = true;
    cmdText.on('pointerdown', () => this._executeSquadCommand(cmd.action));
    this._infoCommandPanel.addChild(cmdText);

    yOffset += 20;
  }
};

ArmyBattleField.prototype._executeSquadCommand = function (action) {
  if (!this._selectedSquad) return;

  const units = this._selectedSquad.units.filter(u => u.isAlive);

  switch (action) {
    case "hold":
      // Set units to hold position (stop moving)
      for (const unit of units) {
        unit.holdPosition = true;
      }
      this._createParticle(this._battleWidth / 2, this._battleHeight / 2, 0xFFFF00,
        `${this._selectedSquad.name} HOLDING POSITION`);
      break;

    case "aggressive":
      for (const unit of units) {
        unit.holdPosition = false;
        unit.morale = Math.min(100, unit.morale + 10);
      }
      this._createParticle(this._battleWidth / 2, this._battleHeight / 2, 0xFF0000,
        `${this._selectedSquad.name} AGGRESSIVE STANCE`);
      break;

    case "defensive":
      for (const unit of units) {
        unit.holdPosition = true;
        unit.troop.def = Math.floor((unit.troop.def || 10) * 1.2);
      }
      this._createParticle(this._battleWidth / 2, this._battleHeight / 2, 0x0000FF,
        `${this._selectedSquad.name} DEFENSIVE +20% DEF`);
      break;

    case "retreat":
      for (const unit of units) {
        unit.isRouting = true;
      }
      this._createParticle(this._battleWidth / 2, this._battleHeight / 2, 0x888888,
        `${this._selectedSquad.name} RETREATING`);
      break;
  }
};
