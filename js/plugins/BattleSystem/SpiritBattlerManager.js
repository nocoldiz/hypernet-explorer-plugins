/*:
 * @target MZ
 * @plugindesc Manages a spirit battling system where a dummy actor becomes a spirit. (v2.3)
 * @author JINI
 * @version 2.3.0
 *
 * @param controllingSwitch
 * @text Controlling Switch
 * @desc The switch ID that activates the spirit battling system.
 * @type switch
 * @default 46
 *
 * @param dummyActorId
 * @text Dummy Actor ID
 * @desc The ID of the actor who will act as the spirit battler.
 * @type actor
 * @default 4
 *
 * @param dummyClassId
 * @text Dummy Class ID
 * @desc The ID of the class for the dummy actor. Skills are managed by the plugin.
 * @type class
 * @default 65
 *
 * @param switchCommandName
 * @text Switch Command Name
 * @desc The name for the in-battle command to switch spirits.
 * @type string
 * @default Switch
 *
 * @command addAllspirits
 * @text Add All spirits (for Testing)
 * @desc Adds all enemies with a <LV:x> tag to the defeated list, making them available.
 *
 * @help SpiritBattlerManager.js (v2.3)
 *
 * This plugin implements a spirit battler system using a single dummy actor.
 *
 * ============================================================================
 * Version 2.3 Notes
 * ============================================================================
 * - Fixed defeated enemies not showing in the available list
 * - spirit battle system now only activates if switch is ON and roster has spirits
 * - Switch command is properly hidden when switch 46 is off
 * - Enemy ID 1 is always unlocked with 0 cost
 * - If entering battle without roster, proceeds as normal battle
 *
 * ============================================================================
 * SETUP
 * ============================================================================
 *
 * 1. Plugin Parameters:
 * - Set the 'Controlling Switch'.
 * - Set the 'Dummy Actor ID' to the actor you will use as a spirit proxy.
 * - Set the 'Dummy Class ID' for that actor.
 *
 * 2. Database Setup:
 * - Dummy Actor: In the database, select your dummy actor (e.g., Actor 4).
 * - REMOVE its Face and Character graphics. Leave them blank.
 * - Assign its class to your dummy class (e.g., Class 65).
 *
 * 3. Enemy Note Tags:
 * - For any enemy to be usable, add a note tag: <LV: x>
 * - Example: <LV: 25>
 *
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'SpiritBattlerManager';
    const PARAMS = PluginManager.parameters(PLUGIN_NAME);
    const CONTROL_SWITCH_ID = Number(PARAMS['controllingSwitch'] || 46);
    const DUMMY_ACTOR_ID = Number(PARAMS['dummyActorId'] || 4);
    const DUMMY_CLASS_ID = Number(PARAMS['dummyClassId'] || 65);
    const SWITCH_COMMAND_NAME = () => T.param(PARAMS['switchCommandName'], 'Battle.spirit.switchCommand');
    
    // Helper function to extract level from note text
    function extractLevelFromNote(enemy) {
        if (!enemy || !enemy.note) return null;
        
        // Look for a bare "LV: X" at the start of the note or the documented
        // inline "<LV: X>" tag anywhere in the note.
        const match = enemy.note.match(/(?:^|<)LV:\s*(\d+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }

        return null;
    }

    // Helper function to check if enemy has level
    function hasLevel(enemy) {
        return extractLevelFromNote(enemy) !== null;
    }

    //=============================================================================
    // ** Plugin Command
    //=============================================================================
    PluginManager.registerCommand(PLUGIN_NAME, "addAllspirits", args => {
        console.log("=== ADD 20 RANDOM spirits COMMAND ===");
        
        // Get all enemies with level tags
        const allValidEnemies = [];
        for (let i = 1; i < $dataEnemies.length; i++) {
            const enemy = $dataEnemies[i];
            if (enemy && hasLevel(enemy)) {
                allValidEnemies.push(enemy.id);
            }
        }
        
        console.log(`Found ${allValidEnemies.length} valid enemies with level tags`);
        
        // Clear current unlocked list and add 20 random spirits
        $gameSystem._unlockedspirits = [];
        
        // Shuffle and take up to 20
        const shuffled = [...allValidEnemies].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, shuffled.length));
        
        selected.forEach(enemyId => {
            $gameSystem.addUnlockedspirit(enemyId);
        });
        
        console.log(`Added ${selected.length} random spirits to unlocked list`);
        console.log("Selected spirit IDs:", selected);
        console.log("=== END COMMAND ===");
    });

    //=============================================================================
    // ** Game_System
    //=============================================================================
    Game_System.prototype.isspiritsystemEnabled = function() {
        return $gameSwitches.value(CONTROL_SWITCH_ID);
    };

    // Check if spirit battle should actually activate (switch ON + has spirits in roster)
    Game_System.prototype.shouldUsespiritBattle = function() {
        if (!this.isspiritsystemEnabled()) return false;
        const roster = this.spiritRoster().filter(id => id > 0);
        return roster.length > 0;
    };

    //=============================================================================
    // ** Game_Actor
    //=============================================================================
    Game_Actor.prototype.setBattlerName = function(name) {
        this._battlerName = name;
    };

    Game_Actor.prototype.setFaceName = function(name) {
        this._faceName = name;
    };

    const _Game_Actor_battlerName = Game_Actor.prototype.battlerName;
    Game_Actor.prototype.battlerName = function() {
        if (this._battlerName !== undefined) return this._battlerName;
        return _Game_Actor_battlerName.call(this);
    };
    const _Game_Actor_characterName = Game_Actor.prototype.characterName;
    Game_Actor.prototype.characterName = function() {
        if (this._characterName !== undefined) return this._characterName;
        return _Game_Actor_characterName.call(this);
    };
    const _Game_Actor_faceName = Game_Actor.prototype.faceName;
    Game_Actor.prototype.faceName = function() {
        if (this._faceName !== undefined) return this._faceName;
        return _Game_Actor_faceName.call(this);
    };

    Game_Actor.prototype.syncTospirit = function(enemyId) {
        const enemy = $dataEnemies[enemyId];
        if (!enemy) return;
        this._spiritEnemyId = enemyId;
        const level = Math.min(extractLevelFromNote(enemy) || 1, 99);
        this.setName(enemy.name);
        this.setBattlerName(enemy.battlerName);
        this.setFaceName("");
        this.changeLevel(level, false);
        this.clearSkills();
        for (const action of enemy.actions) {
            if (action.skillId > 0) this.learnSkill(action.skillId);
        }
        this.recoverAll();
    };

    Game_Actor.prototype.resetFromspirit = function() {
        this._spiritEnemyId = 0;
        const actorData = $dataActors[this._actorId];
        this.setName(actorData.name);
        this.setBattlerName(actorData.battlerName);
        this.setFaceName(actorData.faceName);
        this.changeLevel(1, false);
        this.initSkills();
        this.recoverAll();
    };
    
    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function(paramId) {
        if (this._spiritEnemyId && $gameSystem.isspiritsystemEnabled()) {
            const enemy = $dataEnemies[this._spiritEnemyId];
            // Guard against a stale/invalid spirit ID so we do not throw on a
            // missing enemy or params row.
            if (enemy && enemy.params) {
                return enemy.params[paramId];
            }
        }
        return _Game_Actor_paramBase.call(this, paramId);
    };

    Game_Actor.prototype.clearSkills = function() { this._skills = []; };

    //=============================================================================
    // ** Game_Party & BattleManager
    //=============================================================================
    const _Game_Party_initialize = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() {
        _Game_Party_initialize.call(this);
        this._activespiritRosterIndex = 0;
        this._battlespiritstatus = [];
    };

    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        // Only setup spirit battle if switch is on AND roster has spirits
        if ($gameSystem.shouldUsespiritBattle()) {
            this.setupspiritBattle();
        }
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
        if ($gameSystem.shouldUsespiritBattle()) {
            $gamePlayer.refresh();
            $gameMap.requestRefresh();
        }
    };

    BattleManager.setupspiritBattle = function() {
        $gameSystem._originalPartyMembers = $gameParty.allMembers().map(actor => actor.actorId());
        $gameParty._actors = [];
        $gameParty.addActor(DUMMY_ACTOR_ID);
        const dummyActor = $gameActors.actor(DUMMY_ACTOR_ID);
        const roster = $gameSystem.spiritRoster().filter(id => id > 0);
        $gameParty._battlespiritstatus = roster.map(() => true);
        $gameParty._activespiritRosterIndex = 0;
        if (roster.length > 0) {
            dummyActor.syncTospirit(roster[0]);
        } else {
            dummyActor.resetFromspirit();
        }
    };

    const _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function() {
        if ($gameSystem._originalPartyMembers && $gameSystem._originalPartyMembers.length > 0) {
            this.restoreOriginalParty();
        }
        _BattleManager_updateBattleEnd.call(this);
    };

    BattleManager.restoreOriginalParty = function() {
        $gameActors.actor(DUMMY_ACTOR_ID).resetFromspirit();
        $gameParty._actors = [];
        $gameSystem._originalPartyMembers.forEach(actorId => $gameParty.addActor(actorId));
        $gameSystem._originalPartyMembers = [];
        $gamePlayer.refresh();
        $gameMap.requestRefresh();
    };

    //=============================================================================
    // ** Death and Switching Logic
    //=============================================================================
    const _Game_Actor_die = Game_Actor.prototype.die;
    Game_Actor.prototype.die = function() {
        _Game_Actor_die.call(this);
        if ($gameSystem.shouldUsespiritBattle() && this.actorId() === DUMMY_ACTOR_ID) {
            $gameParty._battlespiritstatus[$gameParty._activespiritRosterIndex] = false;
            const nextIndex = $gameParty._battlespiritstatus.findIndex(status => status === true);
            if (nextIndex !== -1) {
                const roster = $gameSystem.spiritRoster().filter(id => id > 0);
                const nextspiritId = roster[nextIndex];
                $gameParty._activespiritRosterIndex = nextIndex;
                this.syncTospirit(nextspiritId);
                this.performRebirth();
                BattleManager.refreshStatus();
            }
        }
    };
    Game_Actor.prototype.performRebirth = function() { this.requestAnimation(52); };

    //=============================================================================
    // ** Battle Command: Switch
    //=============================================================================
    // Whether the acting battler is offered the spirit switch, and under what
    // name. This is the one answer: the vanilla command window below asks it,
    // and so does the HTML command window in BattleSystemEnhanchedCommands.js,
    // which builds its own rows from scratch and cannot inherit an addCommand.
    window.SpiritBattle = window.SpiritBattle || {};
    window.SpiritBattle.switchRow = function (actor) {
        if (!actor || actor.actorId() !== DUMMY_ACTOR_ID) return null;
        if (!$gameSystem.shouldUsespiritBattle()) return null;
        const status = $gameParty._battlespiritstatus || [];
        return { name: SWITCH_COMMAND_NAME(), enabled: status.filter(s => s).length > 1 };
    };

    const _Window_ActorCommand_makeCommandList = Window_ActorCommand.prototype.makeCommandList;
    Window_ActorCommand.prototype.makeCommandList = function() {
        _Window_ActorCommand_makeCommandList.call(this);
        const row = window.SpiritBattle.switchRow(this._actor);
        if (row) this.addCommand(row.name, 'switchspirit', row.enabled);
    };

    const _Scene_Battle_createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function() {
        _Scene_Battle_createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler('switchspirit', this.commandSwitchspirit.bind(this));
    };

    Scene_Battle.prototype.commandSwitchspirit = function() {
        const roster = $gameSystem.spiritRoster().filter(id => id > 0);
        const status = $gameParty._battlespiritstatus;
        let nextIndex = $gameParty._activespiritRosterIndex;
        for (let i = 1; i < roster.length; i++) {
            const potentialIndex = (nextIndex + i) % roster.length;
            if (status[potentialIndex]) {
                 nextIndex = potentialIndex;
                 break;
            }
        }
        $gameParty._activespiritRosterIndex = nextIndex;
        const activeActor = BattleManager.actor();
        if (activeActor) activeActor.syncTospirit(roster[nextIndex]);
        this.endCommandSelection();
        BattleManager.endTurn();
    };

    //=============================================================================
    // ** Data Management
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.initspiritBattlerData();
    };
    
    Game_System.prototype.initspiritBattlerData = function() {
        if (!this._spiritRoster) this._spiritRoster = [0, 0, 0, 0];
        if (!this._unlockedspirits) this._unlockedspirits = [];
        if (!this._originalPartyMembers) this._originalPartyMembers = [];

        // Always ensure enemy ID 1 is available if it has LV tag
        if ($dataEnemies && $dataEnemies[1] && hasLevel($dataEnemies[1])) {
            if (!this._unlockedspirits.includes(1)) {
                this._unlockedspirits.push(1);
            }
        }
    };
    
    Game_System.prototype.spiritRoster = function() {
        if (!this._spiritRoster) this.initspiritBattlerData();
        return this._spiritRoster;
    };
    
    Game_System.prototype.unlockedspirits = function() {
        if (!this._unlockedspirits) this.initspiritBattlerData();
        return this._unlockedspirits;
    };
    
    Game_System.prototype.addUnlockedspirit = function(enemyId) {
        if (!$dataEnemies[enemyId]) {
            return;
        }

        const enemy = $dataEnemies[enemyId];

        if (!hasLevel(enemy)) {
            return;
        }
        
        // Ensure unlocked spirits array exists
        if (!this._unlockedspirits) {
            this._unlockedspirits = [];
        }
        
        // Add to front of array (most recent first)
        const index = this._unlockedspirits.indexOf(enemyId);
        if (index > -1) {
            // Remove if already exists
            this._unlockedspirits.splice(index, 1);
        }
        
        // Add to front
        this._unlockedspirits.unshift(enemyId);
        
        // Keep only latest 20
        if (this._unlockedspirits.length > 20) {
            this._unlockedspirits = this._unlockedspirits.slice(0, 20);
        }
    };
    
    const _Game_Troop_onBattleEnd = Game_Troop.prototype.onBattleEnd;
    Game_Troop.prototype.onBattleEnd = function() {
        _Game_Troop_onBattleEnd.call(this);
        // Only harvest spirits when the spirit system is enabled (switch 46);
        // otherwise every dead enemy in every battle pollutes _unlockedspirits.
        if (!$gameSystem.isspiritsystemEnabled()) return;
        // Add defeated spirits to the unlocked list
        this.deadMembers().forEach(enemy => {
            $gameSystem.addUnlockedspirit(enemy.enemyId());
        });
    };
    
    //=============================================================================
    // ** Menu Integration
    //=============================================================================
    const _Window_MenuCommand_addMainCommands = Window_MenuCommand.prototype.addMainCommands;
    Window_MenuCommand.prototype.addMainCommands = function() {
        _Window_MenuCommand_addMainCommands.call(this);
        if ($gameSystem.isspiritsystemEnabled()) {
            this.addCommand("spirits", 'spiritManager', true);
        }
    };
    
    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('spiritManager', () => SceneManager.push(Scene_spiritManager));
    };

    //=============================================================================
    // ** spirit Manager Scene
    //=============================================================================
    function Scene_spiritManager() { this.initialize(...arguments); }
    Scene_spiritManager.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_spiritManager.prototype.constructor = Scene_spiritManager;
    
    Scene_spiritManager.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createGoldWindow();
        this.createRosterWindow();
        this.createAvailableWindow();
    };
    
    Scene_spiritManager.prototype.createGoldWindow = function() {
        this._goldWindow = new Window_Gold(new Rectangle(Graphics.boxWidth - 240, this.mainAreaTop(), 240, this.calcWindowHeight(1, true)));
        this.addWindow(this._goldWindow);
    };
    
    Scene_spiritManager.prototype.createRosterWindow = function() {
        const rect = new Rectangle(0, this._goldWindow.y + this._goldWindow.height + 8, 300, this.mainAreaHeight() - this._goldWindow.height - 8);
        this._rosterWindow = new Window_spiritRoster(rect);
        this._rosterWindow.setHandler('cancel', this.popScene.bind(this));
        this._rosterWindow.setHelpWindow(this._helpWindow);
        this.addWindow(this._rosterWindow);
    };
    
    Scene_spiritManager.prototype.createAvailableWindow = function() {
        const rect = new Rectangle(300, this._rosterWindow.y, Graphics.boxWidth - 300, this._rosterWindow.height);
        this._availableWindow = new Window_spiritAvailable(rect);
        this._availableWindow.setHandler('ok', this.onAvailableOk.bind(this));
        this._availableWindow.setHandler('cancel', this.activateRosterWindow.bind(this));
        this._availableWindow.setHelpWindow(this._helpWindow);
        this.addWindow(this._availableWindow);
        this._rosterWindow.setHandler('ok', this.activateAvailableWindow.bind(this));
    };
    
    Scene_spiritManager.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this._rosterWindow.activate();
        this._rosterWindow.select(0);
        this._helpWindow.setText(T('Battle.spirit.selectSlot'));
    };
    
    Scene_spiritManager.prototype.activateRosterWindow = function() {
        this._rosterWindow.activate();
        this._availableWindow.deselect();
    };
    
    Scene_spiritManager.prototype.activateAvailableWindow = function() {
        if ($gameSystem.spiritRoster().filter(id => id === 0).length > 0) {
            this._availableWindow.activate();
            this._availableWindow.select(0);
            this._rosterWindow.deactivate();
        } else {
             this._helpWindow.setText(T('Battle.spirit.rosterFull'));
             SoundManager.playBuzzer();
             this._rosterWindow.activate();
        }
    };
    
    Scene_spiritManager.prototype.onAvailableOk = function() {
        const spirit = this._availableWindow.item();
        const cost = this.getspiritCost(spirit);
        if ($gameParty.gold() < cost) {
            SoundManager.playBuzzer();
            this._helpWindow.setText(T('Battle.spirit.notEnoughGold'));
            this.activateAvailableWindow();
            return;
        }
        const firstEmptyIndex = $gameSystem.spiritRoster().indexOf(0);
        if (firstEmptyIndex !== -1) {
            $gameParty.loseGold(cost);
            $gameSystem.spiritRoster()[firstEmptyIndex] = spirit.id;
            SoundManager.playOk();
            this._rosterWindow.refresh();
            this._goldWindow.refresh();
            this.activateRosterWindow();
        }
    };
    
    Scene_spiritManager.prototype.getspiritCost = function(enemy) {
        // Enemy ID 1 always costs 0, others cost level * 100 (reduced from 1000)
        if (enemy && enemy.id === 1) return 0;
        const level = extractLevelFromNote(enemy);
        return level ? level * 100 : 0;
    };

    //=============================================================================
    // ** spirit Roster Window
    //=============================================================================
    function Window_spiritRoster() { this.initialize(...arguments); }
    Window_spiritRoster.prototype = Object.create(Window_Selectable.prototype);
    Window_spiritRoster.prototype.constructor = Window_spiritRoster;
    
    Window_spiritRoster.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };
    
    Window_spiritRoster.prototype.maxItems = function() { return 4; };
    Window_spiritRoster.prototype.itemHeight = function() { return this.lineHeight() * 2; };
    
    Window_spiritRoster.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);
        const enemyId = $gameSystem.spiritRoster()[index];
        this.drawText(T('Battle.spirit.slot', { n: index + 1 }), rect.x, rect.y, rect.width, 'left');
        if (enemyId > 0) {
            const enemy = $dataEnemies[enemyId];
            const name = enemy ? enemy.name : T('Battle.spirit.unknown');
            this.drawText(name, rect.x, rect.y + this.lineHeight(), rect.width, 'right');
        } else {
            this.changeTextColor(ColorManager.powerDownColor());
            this.drawText(T('Battle.spirit.empty'), rect.x, rect.y + this.lineHeight(), rect.width, 'right');
            this.resetTextColor();
        }
    };

    //=============================================================================
    // ** spirit Available Window
    //=============================================================================
    function Window_spiritAvailable() { this.initialize(...arguments); }
    Window_spiritAvailable.prototype = Object.create(Window_Selectable.prototype);
    Window_spiritAvailable.prototype.constructor = Window_spiritAvailable;
    
    Window_spiritAvailable.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };
    
    Window_spiritAvailable.prototype.makeItemList = function() {
        // Get all unlocked spirits and filter out ones without level data.
        const unlockedIds = $gameSystem.unlockedspirits();
        this._data = [];
        for (const id of unlockedIds) {
            const enemy = $dataEnemies[id];
            if (enemy && hasLevel(enemy)) {
                this._data.push(enemy);
            }
        }
    };
    
    Window_spiritAvailable.prototype.maxItems = function() { return this._data ? this._data.length : 0; };
    Window_spiritAvailable.prototype.item = function() { return this._data[this.index()]; };
    
    Window_spiritAvailable.prototype.drawItem = function(index) {
        const item = this._data[index];
        const rect = this.itemLineRect(index);
        const level = extractLevelFromNote(item) || 1;
        
        // Enemy ID 1 always costs 0, others cost level * 100 (reduced from 1000)
        const goldCost = item.id === 1 ? 0 : level * 100;
        const euroCost = (goldCost / 100).toFixed(2);
        const costText = `${euroCost}€`;
        const costWidth = this.textWidth(costText);
        const canAfford = $gameParty.gold() >= goldCost;
        
        this.changePaintOpacity(canAfford);
        this.drawText(item.name, rect.x + 4, rect.y, rect.width - costWidth - 8);
        this.drawText(costText, rect.x, rect.y, rect.width - 4, 'right');
        this.changePaintOpacity(true);
    };
    
    Window_spiritAvailable.prototype.updateHelp = function() {
        if (!this.item()) { this._helpWindow.clear(); return; }
        const spirit = this.item();
        const level = extractLevelFromNote(spirit) || 'N/A';
        const costText = spirit.id === 1 ? T('Battle.spirit.free') : '';
        this._helpWindow.setText(T('Battle.spirit.entry', { name: spirit.name, level: level, cost: costText }));
    };
    
    Window_spiritAvailable.prototype.refresh = function() {
        this.makeItemList();
        Window_Selectable.prototype.refresh.call(this);
    };

})();