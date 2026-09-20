/*:
 * @target MZ
 * @plugindesc Steam Achievements Integration v1.0.0
 * @author Omni-Lex
 * @url 
 * @help
 * ============================================================================
 * Steam Achievements Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin integrates Steam achievements into your RPG Maker MZ game
 * using the Greenworks library.
 * 
 * ----------------------------------------------------------------------------
 * Setup Instructions:
 * ----------------------------------------------------------------------------
 * 
 * 1. Install Greenworks:
 *    - Download the appropriate Greenworks version for your NW.js version
 *    - Place greenworks.js in your project's js/libs/ folder
 *    - Place the Greenworks binaries in your project root
 * 
 * 2. Configure Steam:
 *    - Create a steam_appid.txt file in your project root with your App ID
 *    - Ensure Steam is running when testing
 * 
 * 3. Achievement Setup:
 *    - Define your achievements in Steamworks Partner site
 *    - Use the achievement IDs in the plugin parameters
 * 
 * ----------------------------------------------------------------------------
 * Plugin Commands:
 * ----------------------------------------------------------------------------
 * 
 * Grant Achievement - Unlocks a Steam achievement
 * Check Achievement - Checks if an achievement is unlocked
 * Reset Achievement - Resets an achievement (for testing)
 * Show Achievement Progress - Shows achievement overlay
 * 
 * ----------------------------------------------------------------------------
 * Script Calls:
 * ----------------------------------------------------------------------------
 * 
 * SteamAchievements.unlock("ACHIEVEMENT_ID");
 * SteamAchievements.isUnlocked("ACHIEVEMENT_ID");
 * SteamAchievements.reset("ACHIEVEMENT_ID");
 * SteamAchievements.getProgress("ACHIEVEMENT_ID");
 * SteamAchievements.setProgress("ACHIEVEMENT_ID", current, max);
 * 
 * @param enableDebugMode
 * @text Debug Mode
 * @desc Enable console logging for debugging
 * @type boolean
 * @default true
 * 
 * @param autoInitialize
 * @text Auto Initialize
 * @desc Automatically initialize Steam on game start
 * @type boolean
 * @default true
 * 
 * @param showNotifications
 * @text Show Notifications
 * @desc Show in-game notifications when achievements unlock
 * @type boolean
 * @default true
 * 
 * @param notificationDuration
 * @text Notification Duration
 * @desc Duration of achievement notifications in frames
 * @type number
 * @min 60
 * @max 600
 * @default 180
 * 
 * @param achievements
 * @text Achievement List
 * @desc List of achievements with their Steam IDs
 * @type struct<Achievement>[]
 * @default []
 * 
 * @command unlockAchievement
 * @text Grant Achievement
 * @desc Unlocks a Steam achievement
 * 
 * @arg achievementId
 * @text Achievement ID
 * @desc The Steam achievement ID to unlock
 * @type string
 * 
 * @command checkAchievement
 * @text Check Achievement
 * @desc Checks if achievement is unlocked and stores in variable
 * 
 * @arg achievementId
 * @text Achievement ID
 * @desc The Steam achievement ID to check
 * @type string
 * 
 * @arg variableId
 * @text Variable ID
 * @desc Variable to store the result (1 = unlocked, 0 = locked)
 * @type variable
 * 
 * @command resetAchievement
 * @text Reset Achievement
 * @desc Resets a Steam achievement (for testing)
 * 
 * @arg achievementId
 * @text Achievement ID
 * @desc The Steam achievement ID to reset
 * @type string
 * 
 * @command setAchievementProgress
 * @text Set Achievement Progress
 * @desc Sets progress for a Steam achievement stat
 * 
 * @arg achievementId
 * @text Achievement ID
 * @desc The Steam achievement ID
 * @type string
 * 
 * @arg current
 * @text Current Progress
 * @desc Current progress value
 * @type number
 * @min 0
 * 
 * @arg max
 * @text Maximum Progress
 * @desc Maximum progress value
 * @type number
 * @min 1
 * 
 * @command showAchievementOverlay
 * @text Show Achievement Progress
 * @desc Shows the Steam achievement overlay
 */

/*~struct~Achievement:
 * @param id
 * @text Steam Achievement ID
 * @desc The achievement ID as defined in Steamworks
 * @type string
 * 
 * @param name
 * @text Display Name
 * @desc The name to display in-game
 * @type string
 * 
 * @param description
 * @text Description
 * @desc Achievement description
 * @type string
 * 
 * @param hidden
 * @text Hidden
 * @desc Is this a hidden achievement?
 * @type boolean
 * @default false
 * 
 * @param statId
 * @text Associated Stat ID
 * @desc Steam stat ID for progress tracking (optional)
 * @type string
 */

(() => {
    'use strict';

    const pluginName = 'SteamAchievements';
    const parameters = PluginManager.parameters(pluginName);
    
    // Parse parameters
    const enableDebugMode = parameters['enableDebugMode'] === 'true';
    const autoInitialize = parameters['autoInitialize'] === 'true';
    const showNotifications = parameters['showNotifications'] === 'true';
    const notificationDuration = Number(parameters['notificationDuration'] || 180);
    let achievements = [];
    try {
        achievements = JSON.parse(parameters['achievements'] || '[]').map(a => {
            // Struct array entries are JSON strings; tolerate already-parsed objects too.
            return typeof a === 'string' ? JSON.parse(a) : a;
        });
    } catch (e) {
        console.warn('SteamAchievements: failed to parse achievements parameter, using empty list.', e);
        achievements = [];
    }

    // Steam Achievements Manager
    class SteamAchievementsManager {
        constructor() {
            this.steamClient = null;
            this.initialized = false;
            this.achievementCache = new Map();
            this.statsCache = new Map();
            this.pendingUnlocks = [];
            this.notificationQueue = [];
        }

        initialize() {
            if (this.initialized) return true;

            try {
                // Check if running in NW.js environment
                if (typeof require === 'undefined') {
                    this.log('Not running in NW.js environment, Steam features disabled');
                    return false;
                }

                // Try to load steamworks.js
                try {
                    const steamworks = require('../libs/steamworks');
                    this.steamClient = steamworks.init(4193010);
                } catch (e) {
                    this.log('steamworks.js not found or failed to initialize. Is Steam running?');
                    return false;
                }

                this.initialized = true;
                this.log('Steam API initialized successfully via steamworks.js');

                // Get Steam user info
                if (this.steamClient && this.steamClient.localplayer) {
                    const name = this.steamClient.localplayer.getName();
                    this.log(`Steam User: ${name}`);
                }

                // Load initial achievement states
                this.loadAchievementStates();

                // Setup callbacks
                this.setupCallbacks();

                return true;

            } catch (error) {
                this.log(`Initialization error: ${error.message}`);
                return false;
            }
        }

        setupCallbacks() {
            // steamworks.js callbacks are handled differently or might not be needed for basic use.
        }

        loadAchievementStates() {
            if (!this.steamClient) return;

            achievements.forEach(achievement => {
                const achievementData = achievement;
                const id = achievementData.id;
                
                try {
                    const unlocked = this.steamClient.achievement.isUnlocked(id);
                    this.achievementCache.set(id, unlocked);
                    this.log(`Achievement ${id}: ${unlocked ? 'Unlocked' : 'Locked'}`);
                } catch (e) {
                    this.log(`Failed to get achievement state for ${id}`);
                }
            });
        }

        unlock(achievementId) {
            if (!this.initialized) {
                this.log(`Cannot unlock ${achievementId}: Steam not initialized`);
                this.pendingUnlocks.push(achievementId);
                return false;
            }

            if (!this.steamClient) {
                this.log('Steam client not available');
                return false;
            }

            // Check if already unlocked
            if (this.achievementCache.get(achievementId)) {
                this.log(`Achievement ${achievementId} already unlocked`);
                return true;
            }

            try {
                // Activate achievement
                this.steamClient.achievement.activate(achievementId);
                this.log(`Achievement ${achievementId} unlocked successfully`);
                this.achievementCache.set(achievementId, true);
                
                // Show notification
                if (showNotifications) {
                    this.showNotification(achievementId);
                }

                // Store stats
                this.storeStats();
                return true;

            } catch (error) {
                this.log(`Error unlocking achievement ${achievementId}: ${error.message}`);
                return false;
            }
        }

        isUnlocked(achievementId) {
            if (!this.initialized) {
                this.log('Steam not initialized');
                return false;
            }

            // Check cache first
            if (this.achievementCache.has(achievementId)) {
                return this.achievementCache.get(achievementId);
            }

            // Try to get from Steam
            if (this.steamClient) {
                try {
                    const unlocked = this.steamClient.achievement.isUnlocked(achievementId);
                    this.achievementCache.set(achievementId, unlocked);
                    return unlocked;
                } catch (e) {
                    this.log(`Failed to check achievement ${achievementId}`);
                    return false;
                }
            }

            return false;
        }

        reset(achievementId) {
            if (!this.initialized || !this.steamClient) {
                this.log('Cannot reset achievement: Steam not initialized');
                return false;
            }

            try {
                // Clear achievement (for testing only)
                this.steamClient.achievement.clear(achievementId);
                this.log(`Achievement ${achievementId} reset`);
                this.achievementCache.set(achievementId, false);
                this.storeStats();
                return true;
            } catch (error) {
                this.log(`Error resetting achievement ${achievementId}: ${error.message}`);
            }

            return false;
        }

        setProgress(achievementId, current, max) {
            if (!this.initialized || !this.steamClient) {
                this.log('Cannot set progress: Steam not initialized');
                return false;
            }

            // Find associated stat ID
            const achievement = achievements.find(a => a.id === achievementId);

            if (!achievement) {
                this.log(`Achievement ${achievementId} not found in configuration`);
                return false;
            }

            const achievementData = achievement;
            const statId = achievementData.statId;

            if (!statId) {
                this.log(`No stat ID associated with achievement ${achievementId}`);
                return false;
            }

            try {
                // Set stat value
                this.steamClient.stat.set(statId, current);
                this.statsCache.set(statId, { current, max });
                
                // Check if achievement should unlock
                if (current >= max && !this.isUnlocked(achievementId)) {
                    this.unlock(achievementId);
                }

                // Store stats
                this.storeStats();
                
                this.log(`Set stat ${statId} to ${current}/${max}`);
                return true;
            } catch (error) {
                this.log(`Error setting stat: ${error.message}`);
            }

            return false;
        }

        getProgress(achievementId) {
            const achievement = achievements.find(a => a.id === achievementId);

            if (!achievement) return { current: 0, max: 0 };

            const achievementData = achievement;
            const statId = achievementData.statId;

            if (!statId) return { current: 0, max: 0 };

            if (this.statsCache.has(statId)) {
                return this.statsCache.get(statId);
            }

            if (this.steamClient) {
                try {
                    const value = this.steamClient.stat.get(statId);
                    return { current: value, max: 100 }; // Default max
                } catch (e) {
                    return { current: 0, max: 0 };
                }
            }

            return { current: 0, max: 0 };
        }

        storeStats() {
            if (!this.steamClient) return;

            try {
                // steamworks.js might auto-store, but let's try to call it if it exists.
                if (this.steamClient.stat && this.steamClient.stat.store) {
                    this.steamClient.stat.store();
                }
                this.log('Stats stored called');
            } catch (error) {
                this.log(`Error storing stats: ${error.message}`);
            }
        }

        showNotification(achievementId) {
            const achievement = achievements.find(a => a.id === achievementId);

            if (!achievement) return;

            const achievementData = achievement;

            if (!showNotifications) return;

            this.notificationQueue.push({
                name: achievementData.name || achievementId,
                description: achievementData.description || T('SteamAchievements.unlocked'),
                duration: notificationDuration
            });
            scheduleAchievementDrain();
        }

        processPendingUnlocks() {
            if (!this.initialized || this.pendingUnlocks.length === 0) return;

            const pending = [...this.pendingUnlocks];
            this.pendingUnlocks = [];

            pending.forEach(achievementId => {
                this.unlock(achievementId);
            });
        }

        log(message) {
            if (enableDebugMode) {
                console.log(`[Steam Achievements] ${message}`);
            }
        }
    }

    // Create global instance
    window.SteamAchievements = new SteamAchievementsManager();

    // Plugin Commands
    PluginManager.registerCommand(pluginName, 'unlockAchievement', args => {
        SteamAchievements.unlock(args.achievementId);
    });

    PluginManager.registerCommand(pluginName, 'checkAchievement', args => {
        const unlocked = SteamAchievements.isUnlocked(args.achievementId);
        $gameVariables.setValue(Number(args.variableId), unlocked ? 1 : 0);
    });

    PluginManager.registerCommand(pluginName, 'resetAchievement', args => {
        SteamAchievements.reset(args.achievementId);
    });

    PluginManager.registerCommand(pluginName, 'setAchievementProgress', args => {
        SteamAchievements.setProgress(
            args.achievementId,
            Number(args.current),
            Number(args.max)
        );
    });

    PluginManager.registerCommand(pluginName, 'showAchievementOverlay', args => {
        if (SteamAchievements.steamClient && SteamAchievements.steamClient.overlay) {
            SteamAchievements.steamClient.overlay.activate('achievements');
        }
    });

    // The achievement popup is the shared notification (ParchmentToast), so an
    // unlock looks like every other popup and shows up wherever it happens,
    // not only on the map and the battlefield. The queue below is drained on a
    // timer rather than by a window's update loop.
    let drainTimer = null;

    // Armed only while something is actually waiting, rather than a permanent
    // 250 ms wakeup that outlived the title screen, every menu and every battle
    // for the whole session whether or not achievements were ever unlocked.
    function scheduleAchievementDrain() {
        if (drainTimer !== null) return;
        drainTimer = setTimeout(drainAchievementQueue, 250);
    }

    function drainAchievementQueue() {
        drainTimer = null;
        if (!showNotifications) {
            SteamAchievements.notificationQueue.length = 0;
            return;
        }
        // The toast service may not have loaded yet: keep the unlock and come
        // back for it instead of spinning on a timer that never stops.
        if (!window.ParchmentToast) {
            if (SteamAchievements.notificationQueue.length) scheduleAchievementDrain();
            return;
        }
        const pending = SteamAchievements.notificationQueue.splice(0);
        if (!pending.length) return;
        window.ParchmentToast.group(pending.map(n => () => {
            window.ParchmentToast.show(
                `<div class="achiev-notif-label">${T('SteamAchievements.unlocked')}</div>` +
                `<div class="achiev-notif-name">${n.name}</div>`,
                {
                    severity: 'good',
                    duration: n.duration,
                    html: true,
                    key: `achievement:${n.name}`
                }
            );
        }));
    }

    // Initialize on game start
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        if (autoInitialize) {
            setTimeout(() => {
                SteamAchievements.initialize();
            }, 100);
        }
    };

    // Process pending unlocks when returning to map
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        SteamAchievements.processPendingUnlocks();
    };

    // Save/Load compatibility
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.steamAchievements = {
            cache: Array.from(SteamAchievements.achievementCache.entries()),
            pending: SteamAchievements.pendingUnlocks
        };
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if (contents.steamAchievements) {
            SteamAchievements.achievementCache = new Map(contents.steamAchievements.cache);
            SteamAchievements.pendingUnlocks = contents.steamAchievements.pending || [];
        }
    };

})();