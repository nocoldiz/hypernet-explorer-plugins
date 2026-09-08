/*:
 * @target MZ
 * @plugindesc Makes the options window fill the entire game window and auto-sets fullscreen on distributed builds
 * @author Omni-Lex
 *
 * @help This plugin resizes the options window to occupy the entire game window.
 * On distributed games (non-playtesting), fullscreen mode is enabled the first
 * time the game runs; after that the player's saved choice is honoured.
 */

(function() {
    // Whether the config file already carried a fullscreen preference. Only a
    // first run (no stored choice) gets the distributed-build default; anything
    // else must keep whatever the player picked in the options menu.
    let hasStoredPreference = false;

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        hasStoredPreference = !!config && "fullscreen" in config;
        _ConfigManager_applyData.call(this, config);
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);

        if (Utils.isOptionValid('test')) return;

        if (!hasStoredPreference) {
            // First launch of a distributed build: fullscreen is the default.
            ConfigManager.fullscreen = true;
            ConfigManager.save();
            hasStoredPreference = true;
        }

        const wantsFullscreen = ConfigManager.fullscreen;

        setTimeout(() => {
            // 1. Force NW.js window focus natively
            if (typeof nw !== 'undefined') {
                const win = nw.Window.get();
                win.focus();
            }

            // 2. Match the saved preference
            if (wantsFullscreen) {
                if (typeof Graphics.setFullscreen === 'function') {
                    Graphics.setFullscreen(true);
                } else if (typeof Graphics._requestFullScreen === 'function') {
                    Graphics._requestFullScreen();
                }
            } else {
                if (typeof Graphics.setFullscreen === 'function') {
                    Graphics.setFullscreen(false);
                } else if (typeof Graphics._cancelFullScreen === 'function') {
                    Graphics._cancelFullScreen();
                }
            }

            // 3. Force the Chromium renderer to redraw by faking a resize event
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);

        }, 150);
    };

    // Store the original initialize method
    const _Window_Options_initialize = Window_Options.prototype.initialize;

    // Override the initialize method
    Window_Options.prototype.initialize = function(rect) {
        // Create a rectangle with the size of the game window
        rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        // Call the original method with our modified rectangle
        _Window_Options_initialize.call(this, rect);
    };
})();