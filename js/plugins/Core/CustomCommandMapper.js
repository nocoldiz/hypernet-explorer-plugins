//=============================================================================
// CustomCommandMapper.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Adds a Commands option to the game menu for remapping keyboard and controller inputs
 * @author Omni-Lex
 * @url https://your-website.com
 *
 * @help CustomCommandMapper.js
 *
 * This plugin adds a "Commands" option to the Options menu where players
 * can customize keyboard and gamepad controls separately.
 *
 * Features:
 * - Separate menus for keyboard and gamepad configuration
 * - Remap all default RPG Maker commands
 * - Additional custom commands: Zoom In (Q/LB), Zoom Out (E/RB), 
 *   Kick (C/RT), Run (Shift/LT)
 * - Settings are saved automatically
 *
 * @param commandsText
 * @text Commands Menu Text
 * @desc Text displayed for the Commands option in the Options menu
 * @default Commands
 *
 * @param keyboardText
 * @text Keyboard Text
 * @desc Text for keyboard configuration option
 * @default Keyboard
 *
 * @param gamepadText
 * @text Gamepad Text
 * @desc Text for gamepad configuration option
 * @default Gamepad
 *
 * @param pressKeyText
 * @text Press Key Text
 * @desc Text shown when waiting for key input
 * @default Press a key...
 *
 * @param pressButtonText
 * @text Press Button Text
 * @desc Text shown when waiting for button input
 * @default Press a button...
 *
 * Terms of Use:
 * Free for commercial and non-commercial use.
 */

(() => {
    'use strict';

    const pluginName = "CustomCommandMapper";
    const parameters = PluginManager.parameters(pluginName);

    // Copy lives in js/i18n/<lang>/plugins/CommandMapper.json.
    function getTranslation(key) {
        return T('CommandMapper.' + key);
    }

    // Default key mappings
    const defaultKeyMap = {
        ok: 90,        // Z
        cancel: 88,    // X
        shift: 16,     // Shift
        menu: 27,      // Escape
        pageup: 81,    // Q (also Zoom In)
        pagedown: 87,  // W
        up: 38,        // Arrow Up
        down: 40,      // Arrow Down
        left: 37,      // Arrow Left
        right: 39,     // Arrow Right
        zoomIn: 81,    // Q
        zoomOut: 69,   // E
        kick: 67,      // C
        run: 16,       // Shift
        remoteTalk: 90 // Z (Action)
    };

    // Default gamepad mappings
    const defaultGamepadMap = {
        ok: 0,         // A button
        cancel: 1,     // B button
        shift: 2,      // X button
        menu: 3,       // Y button
        pageup: 4,     // LB
        pagedown: 5,   // RB
        up: 12,        // D-pad Up
        down: 13,      // D-pad Down
        left: 14,      // D-pad Left
        right: 15,     // D-pad Right
        zoomIn: 4,     // LB
        zoomOut: 5,    // RB
        kick: 7,       // RT
        run: 6,        // LT
        remoteTalk: 0  // A button (Action)
    };

    // Command display names - now handled by translations
    // Use getTranslation('commandNames.action') to get the translated name

    // i18n-ignore-start: physical key and gamepad button labels, universal
    // Key code to name mapping
    const keyCodeNames = {
        8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt',
        20: 'Caps Lock', 27: 'Escape', 32: 'Space', 33: 'Page Up', 34: 'Page Down',
        35: 'End', 36: 'Home', 37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down',
        45: 'Insert', 46: 'Delete', 48: '0', 49: '1', 50: '2', 51: '3', 52: '4',
        53: '5', 54: '6', 55: '7', 56: '8', 57: '9', 65: 'A', 66: 'B', 67: 'C',
        68: 'D', 69: 'E', 70: 'F', 71: 'G', 72: 'H', 73: 'I', 74: 'J', 75: 'K',
        76: 'L', 77: 'M', 78: 'N', 79: 'O', 80: 'P', 81: 'Q', 82: 'R', 83: 'S',
        84: 'T', 85: 'U', 86: 'V', 87: 'W', 88: 'X', 89: 'Y', 90: 'Z',
        112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6',
        118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
        186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
        219: '[', 220: '\\', 221: ']', 222: '\''
    };

    // Gamepad button names
    const gamepadButtonNames = {
        0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
        8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3',
        12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right', 16: 'Home'
    };
    // i18n-ignore-end

    //-----------------------------------------------------------------------------
    // ConfigManager
    //-----------------------------------------------------------------------------

    ConfigManager.customKeyMap = null;
    ConfigManager.customGamepadMap = null;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.customKeyMap = this.customKeyMap || JSON.parse(JSON.stringify(defaultKeyMap));
        config.customGamepadMap = this.customGamepadMap || JSON.parse(JSON.stringify(defaultGamepadMap));
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.customKeyMap = config.customKeyMap || JSON.parse(JSON.stringify(defaultKeyMap));
        this.customGamepadMap = config.customGamepadMap || JSON.parse(JSON.stringify(defaultGamepadMap));
        this.applyCustomKeyMap();
    };

    // Core engine action names must keep their physical key/button, otherwise
    // built-in menu paging and dashing break. Custom actions that collide with a
    // core action on the same key (e.g. zoomIn on Q/pageup) fall back to the core
    // twin in the Input helpers below.
    const CORE_ACTIONS = ['ok', 'cancel', 'shift', 'menu', 'pageup', 'pagedown', 'up', 'down', 'left', 'right'];
    // Every action the config UI lists as rebindable.
    const MAPPABLE_ACTIONS = ['ok', 'cancel', 'shift', 'menu', 'pageup', 'pagedown', 'up', 'down', 'left', 'right', 'zoomIn', 'zoomOut', 'kick', 'run', 'remoteTalk'];

    function rebuildMapper(mapper, mapping) {
        const managed = new Set(Object.keys(mapping));
        // Drop any existing bindings for actions we manage so a rebind cannot
        // leave the previous key still pointing at the same action (ghost binding).
        for (const code of Object.keys(mapper)) {
            if (managed.has(mapper[code])) delete mapper[code];
        }
        const entries = Object.entries(mapping);
        // Apply non-core first, then core, so a core action always wins a collision.
        for (const [action, code] of entries) {
            if (CORE_ACTIONS.includes(action)) continue;
            if (code === null || code === undefined || code === '') continue; // skip unassigned slots
            mapper[code] = action;
        }
        for (const [action, code] of entries) {
            if (!CORE_ACTIONS.includes(action)) continue;
            if (code === null || code === undefined || code === '') continue;
            mapper[code] = action;
        }
    }

    ConfigManager.applyCustomKeyMap = function() {
        if (this.customKeyMap) {
            rebuildMapper(Input.keyMapper, this.customKeyMap);
        }
        if (this.customGamepadMap) {
            rebuildMapper(Input.gamepadMapper, this.customGamepadMap);
        }
    };

    ConfigManager.resetKeyMap = function() {
        this.customKeyMap = JSON.parse(JSON.stringify(defaultKeyMap));
        this.applyCustomKeyMap();
        this.save();
    };

    ConfigManager.resetGamepadMap = function() {
        this.customGamepadMap = JSON.parse(JSON.stringify(defaultGamepadMap));
        this.applyCustomKeyMap();
        this.save();
    };

    //-----------------------------------------------------------------------------
    // Input
    //-----------------------------------------------------------------------------

    const _Input_clear = Input.clear;
    Input.clear = function() {
        _Input_clear.call(this);
        ConfigManager.applyCustomKeyMap();
    };

    // Register custom actions
    // zoomIn/zoomOut/run default to the same physical key as pageup/pagedown/shift,
    // which win the mapper slot, so fall back to the core twin to keep firing there.
    Input.isZoomInTriggered = function() {
        return this.isTriggered('zoomIn') || this.isTriggered('pageup');
    };

    Input.isZoomOutTriggered = function() {
        return this.isTriggered('zoomOut') || this.isTriggered('pagedown');
    };

    Input.isKickTriggered = function() {
        return this.isTriggered('kick');
    };

    Input.isRunPressed = function() {
        return this.isPressed('run') || this.isPressed('shift');
    };

    //-----------------------------------------------------------------------------
    // Right mouse button as a universal "back"
    //-----------------------------------------------------------------------------
    // Core already folds keyboard ESC/X into 'cancel' (Input._isEscapeCompatible),
    // and the gamepad B button is mapped straight to 'cancel', so those two reach
    // every menu that tests 'cancel'. A right-click only ever surfaced as
    // TouchInput.isCancelled(), which most custom scenes never checked, leaving
    // right-click a dead button in dozens of menus. Folding it in here gives the
    // three back inputs identical reach without touching each scene.
    //
    // Scoped to menu scenes on purpose: on the map right-click already means
    // "open the menu" and in battle it drives targeting, and neither should also
    // see a synthetic cancel pulse.
    function rightClickIsBack(keyName) {
        if (keyName !== 'cancel' && keyName !== 'escape') return false;
        const scene = SceneManager._scene;
        if (!scene) return false;
        if (scene instanceof Scene_Map || scene instanceof Scene_Battle) return false;
        return TouchInput.isCancelled();
    }

    const _Input_isTriggered = Input.isTriggered;
    Input.isTriggered = function(keyName) {
        if (rightClickIsBack(keyName)) return true;
        return _Input_isTriggered.call(this, keyName);
    };

    const _Input_isRepeated = Input.isRepeated;
    Input.isRepeated = function(keyName) {
        if (rightClickIsBack(keyName)) return true;
        return _Input_isRepeated.call(this, keyName);
    };

    //-----------------------------------------------------------------------------
    // Window_Options
    //-----------------------------------------------------------------------------

    const _Window_Options_makeCommandList = Window_Options.prototype.makeCommandList;
    Window_Options.prototype.makeCommandList = function() {
        const useTranslation = ConfigManager.language === 'it';
        _Window_Options_makeCommandList.call(this);
        this.addCommand(getTranslation('commands'), 'commands');
    };

    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function(index) {
        const symbol = this.commandSymbol(index);
        if (symbol === 'commands') {
            return '';
        }
        return _Window_Options_statusText.call(this, index);
    };

    const _Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function() {
        const symbol = this.commandSymbol(this.index());
        if (symbol === 'commands') {
            this.playOkSound();
            this.callCommandsMenu();
        } else {
            _Window_Options_processOk.call(this);
        }
    };

    Window_Options.prototype.callCommandsMenu = function() {
        SceneManager.push(Scene_CommandConfig);
    };

    //-----------------------------------------------------------------------------
    // Scene_CommandConfig
    //-----------------------------------------------------------------------------

    function Scene_CommandConfig() {
        this.initialize(...arguments);
    }

    Scene_CommandConfig.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_CommandConfig.prototype.constructor = Scene_CommandConfig;

    Scene_CommandConfig.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_CommandConfig.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createCommandWindow();
    };

    Scene_CommandConfig.prototype.createCommandWindow = function() {
        const rect = this.commandWindowRect();
        this._commandWindow = new Window_CommandConfigType(rect);
        this._commandWindow.setHandler('keyboard', this.commandKeyboard.bind(this));
        this._commandWindow.setHandler('gamepad', this.commandGamepad.bind(this));
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._commandWindow);
    };

    Scene_CommandConfig.prototype.commandWindowRect = function() {
        const ww = 400;
        const wh = this.calcWindowHeight(3, true);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - wh) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_CommandConfig.prototype.commandKeyboard = function() {
        SceneManager.push(Scene_KeyboardConfig);
    };

    Scene_CommandConfig.prototype.commandGamepad = function() {
        SceneManager.push(Scene_GamepadConfig);
    };

    //-----------------------------------------------------------------------------
    // Window_CommandConfigType
    //-----------------------------------------------------------------------------

    function Window_CommandConfigType() {
        this.initialize(...arguments);
    }

    Window_CommandConfigType.prototype = Object.create(Window_Command.prototype);
    Window_CommandConfigType.prototype.constructor = Window_CommandConfigType;

    Window_CommandConfigType.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_CommandConfigType.prototype.makeCommandList = function() {
        const useTranslation = ConfigManager.language === 'it';
        this.addCommand(getTranslation('keyboard'), 'keyboard');
        this.addCommand(getTranslation('gamepad'), 'gamepad');
        this.addCommand(TextManager.cancel, 'cancel');
    };

    //-----------------------------------------------------------------------------
    // Scene_KeyboardConfig
    //-----------------------------------------------------------------------------

    function Scene_KeyboardConfig() {
        this.initialize(...arguments);
    }

    Scene_KeyboardConfig.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_KeyboardConfig.prototype.constructor = Scene_KeyboardConfig;

    Scene_KeyboardConfig.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._waitingForInput = false;
        this._selectedAction = null;
        this._inputTimeout = null;
        this._timeoutDuration = 300; // 5 seconds (300 frames at 60fps)
        this._keyboardHandler = null;
    };

    Scene_KeyboardConfig.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this.setupKeyboardListener();
    };

    Scene_KeyboardConfig.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        this.removeKeyboardListener();
        if (this._resetHelpTimer) {
            clearTimeout(this._resetHelpTimer);
            this._resetHelpTimer = null;
        }
    };

    Scene_KeyboardConfig.prototype.setupKeyboardListener = function() {
        this._keyboardHandler = this.onKeyDown.bind(this);
        document.addEventListener('keydown', this._keyboardHandler);
    };

    Scene_KeyboardConfig.prototype.removeKeyboardListener = function() {
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
            this._keyboardHandler = null;
        }
    };

    Scene_KeyboardConfig.prototype.onKeyDown = function(event) {
        if (this._waitingForInput) {
            event.preventDefault();
            const keyCode = event.keyCode;
            this.assignKey(keyCode);
        }
    };

    Scene_KeyboardConfig.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createKeyListWindow();
    };

    Scene_KeyboardConfig.prototype.createHelpWindow = function() {
        const useTranslation = ConfigManager.language === 'it';
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this._helpWindow.setText(getTranslation('selectCommand'));
        this.addWindow(this._helpWindow);
    };

    Scene_KeyboardConfig.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_KeyboardConfig.prototype.createKeyListWindow = function() {
        const rect = this.keyListWindowRect();
        this._keyListWindow = new Window_KeyList(rect);
        this._keyListWindow.setHandler('ok', this.onKeyListOk.bind(this));
        this._keyListWindow.setHandler('cancel', this.popScene.bind(this));
        this._keyListWindow.setHandler('reset', this.onReset.bind(this));
        this.addWindow(this._keyListWindow);
    };

    Scene_KeyboardConfig.prototype.keyListWindowRect = function() {
        const wx = 0;
        const wy = this._helpWindow.y + this._helpWindow.height;
        const ww = Graphics.boxWidth;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_KeyboardConfig.prototype.onKeyListOk = function() {
        const useTranslation = ConfigManager.language === 'it';
        const action = this._keyListWindow.currentAction();
        if (action === 'reset') {
            this.onReset();
            return;
        }
        this._selectedAction = action;
        this._waitingForInput = true;
        this._inputTimeout = this._timeoutDuration;
        this._helpWindow.setText(getTranslation('pressKey'));
        this._keyListWindow.deactivate();
    };

    Scene_KeyboardConfig.prototype.onReset = function() {
        const useTranslation = ConfigManager.language === 'it';
        ConfigManager.resetKeyMap();
        this._keyListWindow.refresh();
        this._keyListWindow.activate();
        this._helpWindow.setText(getTranslation('keysReset'));
        if (this._resetHelpTimer) clearTimeout(this._resetHelpTimer);
        this._resetHelpTimer = setTimeout(() => {
            this._resetHelpTimer = null;
            if (this._helpWindow) this._helpWindow.setText(getTranslation('selectCommand'));
        }, 2000);
    };

    Scene_KeyboardConfig.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._waitingForInput) {
            this.updateInputTimeout();
        }
    };

    Scene_KeyboardConfig.prototype.updateInputTimeout = function() {
        const useTranslation = ConfigManager.language === 'it';
        
        // Decrement timeout counter
        if (this._inputTimeout !== null) {
            this._inputTimeout--;
            if (this._inputTimeout <= 0) {
                // Timeout reached, cancel input
                this._waitingForInput = false;
                this._selectedAction = null;
                this._inputTimeout = null;
                this._helpWindow.setText(getTranslation('selectCommand'));
                this._keyListWindow.activate();
                SoundManager.playBuzzer();
            }
        }
    };

    Scene_KeyboardConfig.prototype.assignKey = function(keyCode) {
        const useTranslation = ConfigManager.language === 'it';
        
        if (keyCode === 27) { // ESC to cancel
            this._waitingForInput = false;
            this._selectedAction = null;
            this._inputTimeout = null;
            this._helpWindow.setText(getTranslation('selectCommand'));
            this._keyListWindow.activate();
            return;
        }
        
        // Remove old mapping for this key
        for (const action in ConfigManager.customKeyMap) {
            if (ConfigManager.customKeyMap[action] === keyCode) {
                ConfigManager.customKeyMap[action] = null;
            }
        }
        
        ConfigManager.customKeyMap[this._selectedAction] = keyCode;
        ConfigManager.applyCustomKeyMap();
        ConfigManager.save();
        
        this._waitingForInput = false;
        this._selectedAction = null;
        this._inputTimeout = null;
        this._keyListWindow.refresh();
        this._keyListWindow.activate();
        this._helpWindow.setText(getTranslation('selectCommand'));
    };

    //-----------------------------------------------------------------------------
    // Scene_GamepadConfig
    //-----------------------------------------------------------------------------

    function Scene_GamepadConfig() {
        this.initialize(...arguments);
    }

    Scene_GamepadConfig.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_GamepadConfig.prototype.constructor = Scene_GamepadConfig;

    Scene_GamepadConfig.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._waitingForInput = false;
        this._selectedAction = null;
        this._inputTimeout = null;
        this._timeoutDuration = 300; // 5 seconds (300 frames at 60fps)
    };

    Scene_GamepadConfig.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createButtonListWindow();
    };

    Scene_GamepadConfig.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        if (this._resetHelpTimer) {
            clearTimeout(this._resetHelpTimer);
            this._resetHelpTimer = null;
        }
    };

    Scene_GamepadConfig.prototype.createHelpWindow = function() {
        const useTranslation = ConfigManager.language === 'it';
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this._helpWindow.setText(getTranslation('selectCommandGamepad'));
        this.addWindow(this._helpWindow);
    };

    Scene_GamepadConfig.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_GamepadConfig.prototype.createButtonListWindow = function() {
        const rect = this.buttonListWindowRect();
        this._buttonListWindow = new Window_ButtonList(rect);
        this._buttonListWindow.setHandler('ok', this.onButtonListOk.bind(this));
        this._buttonListWindow.setHandler('cancel', this.popScene.bind(this));
        this._buttonListWindow.setHandler('reset', this.onReset.bind(this));
        this.addWindow(this._buttonListWindow);
    };

    Scene_GamepadConfig.prototype.buttonListWindowRect = function() {
        const wx = 0;
        const wy = this._helpWindow.y + this._helpWindow.height;
        const ww = Graphics.boxWidth;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_GamepadConfig.prototype.onButtonListOk = function() {
        const useTranslation = ConfigManager.language === 'it';
        const action = this._buttonListWindow.currentAction();
        if (action === 'reset') {
            this.onReset();
            return;
        }
        this._selectedAction = action;
        this._waitingForInput = true;
        this._inputTimeout = this._timeoutDuration;
        this._helpWindow.setText(getTranslation('pressButton'));
        this._buttonListWindow.deactivate();
    };

    Scene_GamepadConfig.prototype.onReset = function() {
        const useTranslation = ConfigManager.language === 'it';
        ConfigManager.resetGamepadMap();
        this._buttonListWindow.refresh();
        this._buttonListWindow.activate();
        this._helpWindow.setText(getTranslation('gamepadReset'));
        if (this._resetHelpTimer) clearTimeout(this._resetHelpTimer);
        this._resetHelpTimer = setTimeout(() => {
            this._resetHelpTimer = null;
            if (this._helpWindow) this._helpWindow.setText(getTranslation('selectCommandGamepad'));
        }, 2000);
    };

    Scene_GamepadConfig.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._waitingForInput) {
            this.updateButtonInput();
        }
    };

    Scene_GamepadConfig.prototype.updateButtonInput = function() {
        const useTranslation = ConfigManager.language === 'it';
        
        // Decrement timeout counter
        if (this._inputTimeout !== null) {
            this._inputTimeout--;
            if (this._inputTimeout <= 0) {
                // Timeout reached, cancel input
                this._waitingForInput = false;
                this._selectedAction = null;
                this._inputTimeout = null;
                this._helpWindow.setText(getTranslation('selectCommandGamepad'));
                this._buttonListWindow.activate();
                SoundManager.playBuzzer();
                return;
            }
        }
        
        const gamepad = navigator.getGamepads()[0];
        if (gamepad) {
            for (let i = 0; i < gamepad.buttons.length; i++) {
                if (gamepad.buttons[i].pressed) {
                    if (i === 1) { // B button to cancel
                        this._waitingForInput = false;
                        this._selectedAction = null;
                        this._inputTimeout = null;
                        this._helpWindow.setText(getTranslation('selectCommandGamepad'));
                        this._buttonListWindow.activate();
                        return;
                    }
                    
                    // Remove old mapping for this button
                    for (const action in ConfigManager.customGamepadMap) {
                        if (ConfigManager.customGamepadMap[action] === i) {
                            ConfigManager.customGamepadMap[action] = null;
                        }
                    }
                    
                    ConfigManager.customGamepadMap[this._selectedAction] = i;
                    ConfigManager.applyCustomKeyMap();
                    ConfigManager.save();
                    
                    this._waitingForInput = false;
                    this._selectedAction = null;
                    this._inputTimeout = null;
                    this._buttonListWindow.refresh();
                    this._buttonListWindow.activate();
                    this._helpWindow.setText(getTranslation('selectCommandGamepad'));
                    return;
                }
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Window_KeyList
    //-----------------------------------------------------------------------------

    function Window_KeyList() {
        this.initialize(...arguments);
    }

    Window_KeyList.prototype = Object.create(Window_Selectable.prototype);
    Window_KeyList.prototype.constructor = Window_KeyList;

    Window_KeyList.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
        this.select(0);
        this.activate();
    };

    Window_KeyList.prototype.maxItems = function() {
        return MAPPABLE_ACTIONS.length + 1; // commands + 1 reset option
    };

    Window_KeyList.prototype.itemHeight = function() {
        return this.lineHeight();
    };

    Window_KeyList.prototype.drawItem = function(index) {
        const useTranslation = ConfigManager.language === 'it';
        const actions = MAPPABLE_ACTIONS;
        if (index === actions.length) {
            const rect = this.itemRectWithPadding(index);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(getTranslation('resetToDefault'), rect.x, rect.y, rect.width, 'center');
            this.resetTextColor();
        } else {
            const action = actions[index];
            const keyCode = ConfigManager.customKeyMap[action];
            const keyName = keyCodeNames[keyCode] || getTranslation('unassigned');
            const rect = this.itemRectWithPadding(index);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(getTranslation('commandNames.' + action), rect.x, rect.y, 300);
            this.resetTextColor();
            this.drawText(keyName, rect.x + 300, rect.y, rect.width - 300, 'right');
        }
    };

    Window_KeyList.prototype.currentAction = function() {
        const actions = MAPPABLE_ACTIONS;
        const index = this.index();
        if (index === actions.length) {
            return 'reset';
        }
        return actions[index];
    };

    Window_KeyList.prototype.processOk = function() {
        if (this.isCurrentItemEnabled()) {
            this.playOkSound();
            this.updateInputData();
            this.callOkHandler();
        } else {
            this.playBuzzerSound();
        }
    };

    //-----------------------------------------------------------------------------
    // Window_ButtonList
    //-----------------------------------------------------------------------------

    function Window_ButtonList() {
        this.initialize(...arguments);
    }

    Window_ButtonList.prototype = Object.create(Window_Selectable.prototype);
    Window_ButtonList.prototype.constructor = Window_ButtonList;

    Window_ButtonList.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
        this.select(0);
        this.activate();
    };

    Window_ButtonList.prototype.maxItems = function() {
        return MAPPABLE_ACTIONS.length + 1; // commands + 1 reset option
    };

    Window_ButtonList.prototype.itemHeight = function() {
        return this.lineHeight();
    };

    Window_ButtonList.prototype.drawItem = function(index) {
        const useTranslation = ConfigManager.language === 'it';
        const actions = MAPPABLE_ACTIONS;
        if (index === actions.length) {
            const rect = this.itemRectWithPadding(index);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(getTranslation('resetToDefault'), rect.x, rect.y, rect.width, 'center');
            this.resetTextColor();
        } else {
            const action = actions[index];
            const button = ConfigManager.customGamepadMap[action];
            const buttonName = gamepadButtonNames[button] || getTranslation('unassigned');
            const rect = this.itemRectWithPadding(index);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(getTranslation('commandNames.' + action), rect.x, rect.y, 300);
            this.resetTextColor();
            this.drawText(buttonName, rect.x + 300, rect.y, rect.width - 300, 'right');
        }
    };

    Window_ButtonList.prototype.currentAction = function() {
        const actions = MAPPABLE_ACTIONS;
        const index = this.index();
        if (index === actions.length) {
            return 'reset';
        }
        return actions[index];
    };

    Window_ButtonList.prototype.processOk = function() {
        if (this.isCurrentItemEnabled()) {
            this.playOkSound();
            this.updateInputData();
            this.callOkHandler();
        } else {
            this.playBuzzerSound();
        }
    };

    // Initialize on game start
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        ConfigManager.applyCustomKeyMap();
    };

})();