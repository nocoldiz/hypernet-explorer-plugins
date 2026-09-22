//=============================================================================
// F7_DebugCommonEvent.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.1.0] F7/PageUp/PageDown Debug Common Events
 * @author Omni-Lex
 * @url 
 * @help F7_DebugCommonEvent.js
 * 
 * @param commonEventId
 * @text Common Event ID (F7)
 * @desc The ID of the common event to execute when F7 is pressed
 * @type common_event
 * @default 1
 * 
 * @param pageUpEventId
 * @text Common Event ID (PageUp)
 * @desc The ID of the common event to execute when PageUp is pressed
 * @type common_event
 * @default 2
 * 
 * @param pageDownEventId
 * @text Common Event ID (PageDown)
 * @desc The ID of the common event to execute when PageDown is pressed
 * @type common_event
 * @default 3
 * 
 * @param enableInTest
 * @text Enable in Test Mode Only
 * @desc Only allow key execution during test play
 * @type boolean
 * @default true
 * 
 * 
 * 
 * ============================================================================
 * F7/PageUp/PageDown Debug Common Event Plugin
 * ============================================================================
 * 
 * This plugin allows you to execute specified common events by pressing 
 * F7, PageUp, or PageDown keys. Useful for debugging and testing purposes.
 * 
 * Features:
 * - Execute common events with F7, PageUp, and PageDown keys
 * - Option to restrict to test mode only
 * - Optional debug message display
 * - Configurable common event IDs for each key
 * 
 * Usage:
 * 1. Set the Common Event IDs for each key
 * 2. Configure other options as needed
 * 3. Press F7/PageUp/PageDown during gameplay to execute the events
 * 
 * ============================================================================
 * Terms of Use
 * ============================================================================
 * Free for commercial and non-commercial use.
 * 
 */

(() => {
    'use strict';
    
    const pluginName = 'F7_DebugCommonEvent';
    const parameters = PluginManager.parameters(pluginName);
    
    const commonEventId = Number(parameters['commonEventId']) || 1;
    const pageUpEventId = Number(parameters['pageUpEventId']) || 2;
    const pageDownEventId = Number(parameters['pageDownEventId']) || 3;
    const enableInTest = parameters['enableInTest'] === 'true';
    
    // Key codes
    const F7_KEY = 118;
    const PAGEUP_KEY = 33;
    const PAGEDOWN_KEY = 34;
    
    // Store original Scene_Map update method
    const _Scene_Map_update = Scene_Map.prototype.update;
    
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        this.updateDebugKeys();
    };
    
    Scene_Map.prototype.updateDebugKeys = function() {
        if (Input.isTriggered('debug_f7')) {
            this.executeDebugCommonEvent(commonEventId, 'F7');
        }
        if (Input.isTriggered('debug_pageup')) {
            this.executeDebugCommonEvent(pageUpEventId, 'PageUp');
        }
        if (Input.isTriggered('debug_pagedown')) {
            this.executeDebugCommonEvent(pageDownEventId, 'PageDown');
        }
    };
    
    Scene_Map.prototype.executeDebugCommonEvent = function(eventId, keyName) {
        if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive && window.VoxelWorldSystem.isActive()) {
            return;
        }
        // Check if we should only allow this in test mode
        if (enableInTest && !$gameSystem.isJapanese() && !Utils.isOptionValid('test')) {
            return;
        }
        

        
        // Execute the common event
        $gameTemp.reserveCommonEvent(eventId);
        

    };
    
    // Add custom input handlers.
    // NOTE: We deliberately do NOT remap keyMapper[33]/[34] (PageUp/PageDown) - doing so
    // clobbers MZ's built-in 'pageup'/'pagedown', breaking actor-switching and item paging.
    // The direct keydown listener below sets the 'debug_pageup'/'debug_pagedown' states
    // alongside the built-ins, so both keep working.
    Input.keyMapper[F7_KEY] = 'debug_f7';

    // Direct key listening
    const _Input_onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function(event) {
        // A key typed into an HTML field belongs to that field (see
        // window.InputTyping in Core/Hotkeys.js): Page Up/Down inside the
        // radio's station name box is not an auto-scan.
        if (window.InputTyping && window.InputTyping.isTyping()) return;
        _Input_onKeyDown.call(this, event);
        
        // Handle debug keys directly
        if (event.keyCode === F7_KEY) {
            event.preventDefault();
            this._currentState['debug_f7'] = true;
        } else if (event.keyCode === PAGEUP_KEY) {
            event.preventDefault();
            this._currentState['debug_pageup'] = true;
        } else if (event.keyCode === PAGEDOWN_KEY) {
            event.preventDefault();
            this._currentState['debug_pagedown'] = true;
        }
    };
    
    const _Input_onKeyUp = Input._onKeyUp;
    Input._onKeyUp = function(event) {
        // A key typed into an HTML field belongs to that field (see
        // window.InputTyping in Core/Hotkeys.js): Page Up/Down inside the
        // radio's station name box is not an auto-scan.
        if (window.InputTyping && window.InputTyping.isTyping()) return;
        _Input_onKeyUp.call(this, event);
        
        // Handle key releases
        if (event.keyCode === F7_KEY) {
            event.preventDefault();
            this._currentState['debug_f7'] = false;
        } else if (event.keyCode === PAGEUP_KEY) {
            event.preventDefault();
            this._currentState['debug_pageup'] = false;
        } else if (event.keyCode === PAGEDOWN_KEY) {
            event.preventDefault();
            this._currentState['debug_pagedown'] = false;
        }
    };
    
    // Console command for manual execution (useful for additional debugging)
    window.executeDebugCommonEvent = function(eventId = null) {
        const id = eventId || commonEventId;
        if ($dataCommonEvents[id]) {
            $gameTemp.reserveCommonEvent(id);
            console.log(`Manually executed Common Event ${id}`);
        } else {
            console.error(`Common Event ${id} does not exist!`);
        }
    };
    
    // Plugin command support (for MZ plugin commands)
    PluginManager.registerCommand(pluginName, "executeCommonEvent", args => {
        const eventId = Number(args.eventId) || commonEventId;
        if ($dataCommonEvents[eventId]) {
            $gameTemp.reserveCommonEvent(eventId);
       
        }
    });
    
})();