/*:
 * @target MZ
 * @plugindesc Pins the game to 16:9 (1280x720) resolution, owns fullscreen and sizes the Options window
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
 * ----------------------------------------------------------------------------
 * This file also carries what used to be Core/FullscreenOptions.js: the
 * first-run fullscreen default and the full-window Options rect. The two were
 * split, both wrapped Scene_Boot.start, and they fought each other on boot,
 * one synchronously and one on a timer. One owner now.
 *
 * The boot window state belongs to js/main.js, which sets it once from the
 * saved preference before the first frame is painted. Nothing here resizes or
 * moves the OS window afterwards, including Scene_Boot's own adjustWindow:
 * on NW.js any programmatic window change drops fullscreen, which is what made
 * the boot screen shrink to a black window and jump back. A "windowed" answer
 * is left strictly alone: fullscreen is never asked for on its behalf.
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

    // Whether the config file already carried a fullscreen preference. Only a
    // first run (no stored answer) gets the distributed-build default; anything
    // else keeps whatever the player picked in the options menu.
    let hasStoredPreference = false;

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        hasStoredPreference = !!config && "fullscreen" in config;
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
    // Fullscreen
    // F10 now belongs to Core/SaveSystem.js's quickload, so no key is bound
    // here: the toggle is reached from Options or the core F11 key.
    // ========================================================================

    // ------------------------------------------------------------------------
    // Fitting the canvas to the window
    //
    // Graphics scales the canvas against window.innerWidth/innerHeight and only
    // recomputes on a resize event. js/main.js puts the window into fullscreen
    // before the first frame is painted, which is before Graphics exists and
    // before Graphics._setupEventHandlers() has attached that listener: the
    // transition's own resize event is delivered to nobody, so the canvas keeps
    // the scale it was built at and the game sits letterboxed inside a window
    // that really is fullscreen. Toggling the option off and on used to be the
    // only way out, because that fires a resize Graphics is listening for.
    //
    // The canvas is therefore re-fitted by hand whenever the window changes
    // size, and kept re-fitting until it stops: the OS animates a fullscreen
    // transition over several frames, so one call at the start of it measures
    // the old window. This replaces the blind 150ms/50ms timers the two old
    // plugins used, which guessed at the same thing and often guessed early.
    // ------------------------------------------------------------------------
    const FIT_STABLE_FRAMES = 4;
    const FIT_TIMEOUT_MS = 2000;
    let fitHandle = 0;

    function refitCanvas() {
        if (typeof Graphics._updateAllElements === 'function') {
            Graphics._updateAllElements();
        }
    }

    function refitCanvasWhenSettled() {
        if (typeof requestAnimationFrame !== 'function') {
            refitCanvas();
            return;
        }
        if (fitHandle) {
            cancelAnimationFrame(fitHandle);
        }
        let lastW = -1;
        let lastH = -1;
        let stable = 0;
        const deadline = Date.now() + FIT_TIMEOUT_MS;
        const step = function() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (w === lastW && h === lastH) {
                stable++;
            } else {
                stable = 0;
                lastW = w;
                lastH = h;
                refitCanvas();
            }
            if (stable >= FIT_STABLE_FRAMES || Date.now() > deadline) {
                fitHandle = 0;
                refitCanvas();
                return;
            }
            fitHandle = requestAnimationFrame(step);
        };
        fitHandle = requestAnimationFrame(step);
    }

    // The single way this plugin ever changes the window. It is a no-op when
    // the window already agrees, which is the normal case on boot because
    // js/main.js has already read the same preference off disk: a player who
    // asked for a window is never sent fullscreen, and a player who asked for
    // fullscreen is never sent through a windowed frame to get there.
    function applyFullscreen(wanted) {
        if (wanted) {
            // Always issued, never skipped on a state check: the window can
            // report itself fullscreen while the window manager has it framed,
            // and a redundant request costs nothing.
            Graphics._requestFullScreen();
        } else if (Graphics._isFullScreen()) {
            Graphics._cancelFullScreen();
        }
        // The canvas is fitted to window.innerWidth and Graphics only
        // recomputes on a resize event, so it is re-fitted by hand either way.
        refitCanvasWhenSettled();
    }

    // Options and the map toggle both fade out, switch, and fade back in.
    function fadeThroughFullscreen(scene, wanted, onSwitched) {
        if (!scene) {
            applyFullscreen(wanted);
            if (onSwitched) onSwitched();
            return;
        }
        const frame = 16.67;
        scene.startFadeOut(fadeDuration, false);
        setTimeout(() => {
            applyFullscreen(wanted);
            setTimeout(() => {
                scene.startFadeIn(fadeDuration, false);
                if (onSwitched) onSwitched();
            }, fadeDuration * frame);
        }, fadeDuration * frame);
    }

    Scene_Map.prototype.toggleFullscreenWithFade = function() {
        const newValue = !ConfigManager.fullscreen;
        ConfigManager.fullscreen = newValue;
        ConfigManager.save();
        fadeThroughFullscreen(this, newValue);
    };

    // Boot is the one place the state may not be asked about, only asserted.
    // js/main.js requests fullscreen before the window has been mapped, which
    // is early enough for NW.js to set its own isFullscreen flag and for the
    // window manager to drop the request on the floor: the window then reports
    // itself fullscreen while sitting in a frame, and every "are we there yet"
    // check answers yes. The request is therefore simply re-issued a few times
    // over the first second, without asking. That is what the old pair of
    // plugins achieved with a blind 150ms timer, and it is why merging them
    // into one polite, guarded call stopped the game going fullscreen at all.
    //
    // A windowed preference issues nothing: it is never sent to fullscreen.
    const BOOT_ASSERT_DELAYS = [0, 120, 400, 900];

    function assertFullscreenAtBoot(wanted) {
        if (!wanted) {
            refitCanvasWhenSettled();
            return;
        }
        const request = function() {
            if (typeof nw !== 'undefined') {
                nw.Window.get().enterFullscreen();
            } else if (typeof Graphics._requestFullScreen === 'function') {
                Graphics._requestFullScreen();
            }
            refitCanvasWhenSettled();
        };
        for (const delay of BOOT_ASSERT_DELAYS) {
            if (delay === 0) request();
            else setTimeout(request, delay);
        }
    }

    // ========================================================================
    // Scene_Boot - Apply resolution and fullscreen on game start
    // ========================================================================

    // Stock MZ calls window.moveBy() / window.resizeBy() here to fit the OS
    // window to $dataSystem.advanced.screenWidth. On NW.js that drops the
    // window out of fullscreen, and it fired on every boot: the fullscreen
    // boot screen was seen collapsing into a small black window, which another
    // plugin's timer then put back. js/main.js already sized the window from
    // the saved preference before the first paint, so there is nothing to fit.
    Scene_Boot.prototype.adjustWindow = function() {
    };

    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        _Scene_Boot_create.call(this);
        SceneManager.changeResolution(defaultResolution);
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);

        // Apply saved resolution
        if ($gameSystem) {
            SceneManager.changeResolution($gameSystem.getCurrentResolution());
        }

        // Only the first-run default is a playtest's business: a stored answer
        // is honoured whether the game was launched from the editor or not.
        if (!hasStoredPreference && !Utils.isOptionValid('test')) {
            // First launch of a distributed build: fullscreen is the default.
            ConfigManager.fullscreen = defaultFullscreen;
            ConfigManager.save();
            hasStoredPreference = true;
        }

        // Every later fullscreen change re-fits the canvas, which Graphics
        // cannot do for itself: it only recomputes on a resize event, and the
        // boot transition happened before it was listening for one.
        if (typeof nw !== 'undefined') {
            const win = nw.Window.get();
            win.on('enter-fullscreen', refitCanvasWhenSettled);
            win.on('leave-fullscreen', refitCanvasWhenSettled);
            win.focus();
        }

        assertFullscreenAtBoot(ConfigManager.fullscreen);
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
        fadeThroughFullscreen(SceneManager._scene, value, () => this.refresh());
    };

    // The options window fills the whole game window (was Core/FullscreenOptions.js).
    const _Window_Options_initialize = Window_Options.prototype.initialize;
    Window_Options.prototype.initialize = function(rect) {
        rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        _Window_Options_initialize.call(this, rect);
    };

})();