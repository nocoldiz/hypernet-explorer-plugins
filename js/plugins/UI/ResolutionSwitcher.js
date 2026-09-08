/*:
 * @target MZ
 * @plugindesc Pins the game to 16:9 (1280x720) resolution with fullscreen toggle
 * @author KYDSGAME
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @param optionName
 * @text Option Menu Name
 * @type text
 * @default Resolution
 * @desc The name that appears in the options menu for resolution
 *
 * @param defaultFullscreen
 * @text Default Fullscreen
 * @type boolean
 * @default true
 * @desc Start the game in fullscreen mode by default
 *
 * @param fadeDuration
 * @text Fullscreen Fade Duration
 * @type number
 * @min 0
 * @max 120
 * @default 30
 * @desc Duration of fade effect in frames when toggling fullscreen
 *
 * @help
 * ============================================================================
 * Resolution Plugin (with Fullscreen Toggle)
 * ============================================================================
 *
 * This plugin pins the game to the 16:9 (1280x720) resolution and lets you
 * toggle fullscreen mode with a smooth transition.
 *
 * The fullscreen setting is automatically added to the Options menu and saved
 * in config.rpgsave, persisting between sessions.
 *
 * Keyboard Controls:
 * - Fullscreen is toggled from Options or the core F11 key
 *
 * ============================================================================
 */

(() => {
    const pluginName = "ResolutionSwitcher";
    const parameters = PluginManager.parameters(pluginName);
    const defaultResolution = '16:9';
    const optionName = T.param(parameters['optionName'], 'ResolutionSwitcher.resolution');
    // Fullscreen is the default presentation; only an explicit "false" opts out.
    const defaultFullscreen = parameters['defaultFullscreen'] !== 'false';
    const fadeDuration = Number(parameters['fadeDuration']) || 30;

    const resolutions = {
        '16:9': { width: 1280, height: 720 }
    };

    // ========================================================================
    // ConfigManager - Handle resolution and fullscreen saving/loading
    // ========================================================================

    // Resolution property
    Object.defineProperty(ConfigManager, "resolution", {
        get: function() {
            if ($gameSystem && $gameSystem._currentResolution) {
                return $gameSystem._currentResolution;
            }
            return this._storedResolution || defaultResolution;
        },
        set: function(value) {
            this._storedResolution = value;
            if ($gameSystem) {
                $gameSystem._currentResolution = value;
                SceneManager.changeResolution(value);
            }
        },
        configurable: true
    });

    // Fullscreen property
    Object.defineProperty(ConfigManager, "fullscreen", {
        get: function() {
            return this._fullscreen !== undefined ? this._fullscreen : defaultFullscreen;
        },
        set: function(value) {
            this._fullscreen = value;
        },
        configurable: true
    });

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.resolution = this.resolution;
        config.fullscreen = this.fullscreen;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.resolution = this.readResolution(config, "resolution");
        this.fullscreen = this.readFlag(config, "fullscreen", defaultFullscreen);
    };

    ConfigManager.readResolution = function(config, name) {
        return '16:9';
    };

    // ========================================================================
    // Game_System - Resolution management
    // ========================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._currentResolution = '16:9';
    };

    Game_System.prototype.changeResolution = function(resolution) {
        if (!resolutions[resolution]) {
            console.error(`Invalid resolution: ${resolution}`);
            return;
        }
        
        this._currentResolution = resolution;
        ConfigManager.resolution = resolution;
        ConfigManager.save();
        SceneManager.changeResolution(resolution);
    };

    Game_System.prototype.getCurrentResolution = function() {
        return this._currentResolution || ConfigManager._storedResolution || defaultResolution;
    };

    // ========================================================================
    // SceneManager - Apply resolution changes
    // ========================================================================

    SceneManager.changeResolution = function(resolution) {
        const res = resolutions[resolution];
        if (!res) return;

        Graphics.resize(res.width, res.height);
        this.updateCanvasPosition();
        
        if (this._scene) {
            this._scene.refresh();
        }
    };

    SceneManager.updateCanvasPosition = function() {
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.style.marginLeft = 'auto';
            canvas.style.marginRight = 'auto';
            canvas.style.display = 'block';
        }
    };

    // ========================================================================
    // Graphics - Handle resize
    // ========================================================================

    const _Graphics_resize = Graphics.resize;
    Graphics.resize = function(width, height) {
        _Graphics_resize.call(this, width, height);
        this._app.stage.scale.set(1, 1);
    };

    // ========================================================================
    // Scene_Base - Refresh functionality
    // ========================================================================

    Scene_Base.prototype.refresh = function() {
        if (this._windowLayer) {
            this._windowLayer.children.forEach(window => {
                if (window.refresh) {
                    window.refresh();
                }
            });
        }
    };

    // ========================================================================
    // Fullscreen toggle
    // F10 now belongs to Core/SaveSystem.js's quickload, so no key is bound
    // here: the toggle is reached from Options or the core F11 key.
    // ========================================================================

    Scene_Map.prototype.toggleFullscreenWithFade = function() {
        const newValue = !ConfigManager.fullscreen;
        ConfigManager.fullscreen = newValue;
        ConfigManager.save();
        
        this.startFadeOut(fadeDuration, false);
        setTimeout(() => {
            if (newValue) {
                Graphics._requestFullScreen();
            } else {
                Graphics._cancelFullScreen();
            }
            setTimeout(() => {
                this.startFadeIn(fadeDuration, false);
            }, fadeDuration * 16.67);
        }, fadeDuration * 16.67);
    };

    // ========================================================================
    // Scene_Boot - Apply resolution and fullscreen on game start
    // ========================================================================

    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        _Scene_Boot_create.call(this);
        SceneManager.changeResolution('16:9');
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        
        // Apply saved resolution
        if ($gameSystem) {
            const currentRes = $gameSystem.getCurrentResolution();
            SceneManager.changeResolution(currentRes);
            
            // Maximize window if 16:9 and not fullscreen
            if (currentRes === '16:9' && !ConfigManager.fullscreen) {
                this.maximizeWindow();
            }
        }
        
        // Apply saved fullscreen setting
        const shouldBeFullscreen = ConfigManager.fullscreen;
        if (shouldBeFullscreen && !Graphics._isFullScreen()) {
            Graphics._requestFullScreen();
        } else if (!shouldBeFullscreen && Graphics._isFullScreen()) {
            Graphics._cancelFullScreen();
        }
    };

    Scene_Boot.prototype.maximizeWindow = function() {
        if (typeof nw !== 'undefined' && nw.Window) {
            const win = nw.Window.get();
            win.maximize();
        }
    };

    // ========================================================================
    // DataManager - Save resolution in save files
    // ========================================================================

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.resolution = $gameSystem.getCurrentResolution();
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        $gameSystem._currentResolution = '16:9';
        ConfigManager.resolution = '16:9';
        SceneManager.changeResolution('16:9');
    };

    // ========================================================================
    // Window_Options - Options menu integration
    // ========================================================================

    if (window.GameOptions) {
        window.GameOptions.registerOption('fullscreen', T('ResolutionSwitcher.fullscreen'), 
            () => ConfigManager.fullscreen, 
            (value) => {
                ConfigManager.fullscreen = value;
                ConfigManager.save();
                const scene = SceneManager._scene;
                if (scene && scene._optionsWindow) {
                    scene._optionsWindow.fadeOutAndToggleFullscreen(value);
                }
            }, 
            'video', 'boolean');
    } else {
        const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
        Window_Options.prototype.addGeneralOptions = function() {
            _Window_Options_addGeneralOptions.call(this);
            this.addCommand(T('ResolutionSwitcher.fullscreen'), 'fullscreen');
        };
    }

    const _Window_Options_getConfigValue = Window_Options.prototype.getConfigValue;
    Window_Options.prototype.getConfigValue = function(symbol) {
        if (symbol === 'fullscreen') {
            return ConfigManager.fullscreen;
        }
        return _Window_Options_getConfigValue.call(this, symbol);
    };

    const _Window_Options_setConfigValue = Window_Options.prototype.setConfigValue;
    Window_Options.prototype.setConfigValue = function(symbol, value) {
        if (symbol === 'fullscreen') {
            ConfigManager.fullscreen = value;
            ConfigManager.save();
            this.fadeOutAndToggleFullscreen(value);
        } else {
            _Window_Options_setConfigValue.call(this, symbol, value);
        }
    };

    Window_Options.prototype.fadeOutAndToggleFullscreen = function(value) {
        const scene = SceneManager._scene;
        if (scene) {
            scene.startFadeOut(fadeDuration, false);
            setTimeout(() => {
                if (value) {
                    Graphics._requestFullScreen();
                } else {
                    Graphics._cancelFullScreen();
                }
                setTimeout(() => {
                    scene.startFadeIn(fadeDuration, false);
                    this.refresh();
                }, fadeDuration * 16.67);
            }, fadeDuration * 16.67);
        }
    };


})();