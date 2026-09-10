/*:
 * @target MZ
 * @plugindesc v1.1 Divided options menu into thematic tabs and provides an entry point for other plugins. Merged with VolumePercentageDisplay.
 * @author Omni-Lex & Assistant
 *
 * @help GameOptions.js
 *
 * This plugin restructures the Options menu to use tabs at the top.
 * It provides a global object `GameOptions` for other plugins to register their options.
 *
 * Entry Point for other plugins:
 * GameOptions.registerOption(symbol, name, getter, setter, category, type, statusTextFn, cursorRightFn, cursorLeftFn)
 *
 * Parameters from VolumePercentageDisplay are included.
 *
 * @param barColor1
 * @text Bar Color 1 (Start)
 * @desc The starting gradient color for the volume bar
 * @type number
 * @min 0
 * @max 31
 * @default 20
 *
 * @param barColor2
 * @text Bar Color 2 (End)
 * @desc The ending gradient color for the volume bar
 * @type number
 * @min 0
 * @max 31
 * @default 21
 *
 * @param defaultBgmVolume
 * @text Default BGM Volume
 * @desc Default volume for background music (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param defaultBgsVolume
 * @text Default BGS Volume
 * @desc Default volume for background sounds (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param defaultMeVolume
 * @text Default ME Volume
 * @desc Default volume for music effects (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param defaultSeVolume
 * @text Default SE Volume
 * @desc Default volume for sound effects (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param defaultFootstepsVolume
 * @text Default Footsteps Volume
 * @desc Default volume for footstep sounds (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 30
 *
 * @param defaultDialogueVoicesVolume
 * @text Default Dialogue Voices Volume
 * @desc Default volume for the letter blips under a dialogue line (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 60
 *
 * @param defaultWeatherVolume
 * @text Default Weather Volume
 * @desc Default volume for weather and outdoor ambience, rain, storms, night (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 80
 */

/**
 * How an enemy is drawn in battle. The numbers are historical: 1 is the 3D
 * battler (procedural or GLB, the default), 2 is the enemy's own <Char:> sprite
 * sheet, and 3 is the flat battler image named by the enemy's battlerName, out
 * of img/enemies. Mode 3 was once mode 0 and retired with the old art; it is
 * back because tools/enemies/export_enemy_sprites.mjs renders every 3D battler
 * to a front-facing 256x256 PNG, so the still image IS the model, at no
 * per-frame cost. Mode 0 is dead and reads as 3D, so an existing config that
 * still carries it keeps working.
 */
window.EnemyBattlerModes = {
    MODEL_3D: 1,
    SPRITES: 2,
    BATTLERS_2D: 3,
    VALUES: [1, 2, 3],
    // The one place a stored or passed-in value is turned into a real mode.
    normalize(v) {
        return (v === 2 || v === 3) ? v : 1;
    },
    // Cycle to the next/previous mode, wrapping.
    step(v, dir) {
        const i = this.VALUES.indexOf(this.normalize(v));
        const n = this.VALUES.length;
        return this.VALUES[(i + dir + n) % n];
    }
};

const GameOptions = {
    _options: {},
    _themesCache: null,

    /**
     * Scan css/themes directory and load all theme files dynamically.
     * @returns {string[]} An array of theme filenames.
     */
    // The look the ASCII layer wears (UI/ASCIIMode.js). It is not a stylesheet:
    // picking it turns the experimental ASCII mode on, and turning that mode on
    // from the Experimental page picks it here. One state, two doors.
    ASCII_THEME: 'ascii', // i18n-ignore: sentinel, not a label

    getThemes: function () {
        if (this._themesCache) return this._themesCache;

        const defaultTheme = 'omega_tower.css';
        let themes = [defaultTheme];

        if (Utils.isNwjs()) {
            try {
                const fs = require('fs');
                const path = require('path');
                const base = path.dirname(process.mainModule.filename);
                const themesDir = path.join(base, 'css', 'themes');
                if (fs.existsSync(themesDir)) {
                    const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.css'));
                    const otherFiles = [];
                    files.forEach(file => {
                        if (file !== defaultTheme && file !== 'vars.css') {
                            otherFiles.push(file);
                        }
                    });
                    otherFiles.sort();
                    themes = themes.concat(otherFiles);
                }
            } catch (e) {
                console.error("GameOptions: Failed to load theme files dynamically.", e);
            }
        } else {
            // Web browser fallback
            themes.push('omega_tower.css');
        }

        themes.push(this.ASCII_THEME);
        this._themesCache = themes;
        return themes;
    },

    asciiThemeIndex: function () {
        return this.getThemes().indexOf(this.ASCII_THEME);
    },

    isAsciiTheme: function (index) {
        return this.getThemes()[index] === this.ASCII_THEME;
    },

    // The name a theme is offered under. Filenames are title-cased; the ASCII
    // entry is named in the player's language.
    themeName: function (index) {
        const file = this.getThemes()[index];
        if (!file) return '';
        if (file === this.ASCII_THEME) return T('GameOptions.label.themeAscii');
        return file.replace('.css', '').split(/[_-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    },

    /**
     * Put one preset on screen, now. Every theme token the game draws with is a
     * CSS custom property on :root, so a preset is applied by injecting it as a
     * stylesheet that sits after the linked one in the cascade: nothing has to
     * be rebuilt and no restart is needed. The same content is written to
     * css/vars.css so the choice survives a restart.
     *
     * Presets keep full token parity (docs/task/ui_fixing.md), which is what
     * makes a live swap safe: every property the old preset defined is defined
     * by the new one too, so no surface is left reading a token that no longer
     * has a value.
     * @param {string} themeFile - A filename from getThemes, never the ASCII entry.
     */
    _injectTheme: function (themeFile) {
        if (!themeFile || themeFile === this.ASCII_THEME) return;
        if (!Utils.isNwjs()) {
            // In a browser there is no disk to write: point a second <link> at
            // the preset instead, which the cascade applies over vars.css.
            let link = document.getElementById('active-theme-link');
            if (!link) {
                link = document.createElement('link');
                link.id = 'active-theme-link';
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
            link.href = 'css/themes/' + themeFile;
            this._forceRepaint();
            return;
        }
        try {
            const fs = require('fs');
            const path = require('path');
            const base = path.dirname(process.mainModule.filename);
            const selectedThemePath = path.join(base, 'css', 'themes', themeFile);
            const varsPath = path.join(base, 'css', 'vars.css');
            if (!fs.existsSync(selectedThemePath)) return;
            const content = fs.readFileSync(selectedThemePath, 'utf8');
            // Written for the next boot; injected for this one.
            fs.writeFileSync(varsPath, content, 'utf8');
            let style = document.getElementById('active-theme-override');
            if (!style) {
                style = document.createElement('style');
                style.id = 'active-theme-override';
                document.head.appendChild(style);
            }
            style.textContent = content;
            // Force a repaint. Updating the :root vars alone won't make
            // Chromium repaint cached gradient/url() background-images on
            // surfaces that weren't structurally mutated (e.g. the options
            // menu's #menu-container / .book-spread). Without this, scenes
            // that only re-render a small inner subtree show no theme change.
            this._forceRepaint();
        } catch (e) {
            console.error("GameOptions: Failed to apply theme.", e);
        }
    },

    /**
     * Persist a theme selection. Kept as the old name because other plugins
     * call it; it now applies the preset as well, since a theme change is
     * immediate everywhere.
     * @param {number} themeIndex - Index of theme in getThemes list.
     */
    persistTheme: function (themeIndex) {
        this.setTheme(themeIndex);
    },

    /**
     * Apply the stored theme without touching the ASCII mode flag. This is the
     * boot path (ConfigManager.applyData): the saved value is already the
     * player's choice, and ASCIIMode restores its own state from the same save.
     * @param {number} themeIndex - Index of theme in getThemes list.
     */
    applyTheme: function (themeIndex) {
        const themes = this.getThemes();
        if (this.isAsciiTheme(themeIndex)) return;
        this._injectTheme(themes[themeIndex] || themes[0]);
    },

    // Guards the two directions of the ASCII theme against each other: picking
    // the ASCII theme turns ASCII mode on, and turning ASCII mode on picks the
    // ASCII theme. Without this they would call each other forever.
    _themeSyncing: false,

    /**
     * The one entry point for a theme change the player made. Applies the look
     * on the spot, with no restart, and keeps the ASCII mode toggle in step.
     * @param {number} themeIndex - Index of theme in getThemes list.
     */
    setTheme: function (themeIndex) {
        const themes = this.getThemes();
        const index = (themeIndex >= 0 && themeIndex < themes.length) ? themeIndex : 0;
        ConfigManager.activeTheme = index;
        if (this._themeSyncing) return;
        this._themeSyncing = true;
        try {
            if (this.isAsciiTheme(index)) {
                // Remember what to come back to, then hand the look to ASCII.
                ConfigManager.asciiModeEnabled = 1;
            } else {
                if (ConfigManager.asciiModeEnabled) ConfigManager.asciiModeEnabled = 0;
                ConfigManager.themeBeforeAscii = index;
                this._injectTheme(themes[index]);
            }
        } finally {
            this._themeSyncing = false;
        }
        this._notifyThemeChange();
    },

    /**
     * Called by UI/ASCIIMode.js whenever the experimental ASCII Mode option
     * moves. Turning it on forces the theme to ASCII; turning it off puts the
     * previous theme back.
     * @param {number|boolean} value - The new ASCII mode value.
     */
    onAsciiModeChanged: function (value) {
        const asciiIndex = this.asciiThemeIndex();
        if (asciiIndex < 0 || this._themeSyncing) return;
        this._themeSyncing = true;
        try {
            if (value) {
                if (ConfigManager.activeTheme !== asciiIndex) {
                    ConfigManager.themeBeforeAscii = ConfigManager.activeTheme || 0;
                }
                ConfigManager.activeTheme = asciiIndex;
            } else if (ConfigManager.activeTheme === asciiIndex) {
                const back = ConfigManager.themeBeforeAscii || 0;
                ConfigManager.activeTheme = back;
                this._injectTheme(this.getThemes()[back]);
            }
        } finally {
            this._themeSyncing = false;
        }
        this._notifyThemeChange();
    },

    // Anything holding DOM it drew from theme tokens can listen for this and
    // redraw itself. Nothing has to: the tokens are live already.
    _notifyThemeChange: function () {
        if (typeof document === 'undefined' || !document.dispatchEvent) return;
        document.dispatchEvent(new CustomEvent('gamethemechange', {
            detail: { index: ConfigManager.activeTheme, name: this.themeName(ConfigManager.activeTheme) }
        }));
    },

    /**
     * Force a synchronous repaint of the DOM. Toggling display off/on invalidates
     * the body's layout and paint subtree so var-driven background-images pick up
     * the new theme values. The state is reverted before the browser yields, so
     * no intermediate frame is painted (no visible flicker).
     */
    _forceRepaint: function () {
        const b = document.body;
        if (!b) return;
        const prev = b.style.display;
        b.style.display = 'none';
        void b.offsetHeight; // force reflow
        b.style.display = prev;
    },

    /**
     * Register a new option
     * @param {string} symbol - Unique identifier (matches ConfigManager property)
     * @param {string|function} name - Display name in the menu. Pass a function
     *        when the label must follow the active language (it is resolved
     *        every time the list is built, e.g. the Language option itself).
     * @param {function} getter - Function returning the current value
     * @param {function} setter - Function accepting the new value
     * @param {string} category - Tab ID ('audio', 'video', 'gameplay', 'experimental')
     * @param {string} type - 'boolean' or 'number'
     * @param {function} statusTextFn - Optional function returning custom status text
     * @param {function} cursorRightFn - Optional function for custom right action
     * @param {function} cursorLeftFn - Optional function for custom left action
     */
    // Hide a row unless fn() says otherwise. The shader tab uses it to show
    // only the knobs the look the player picked actually has: SnapVertex has a
    // vertex snap, pixel art has a palette, and listing both at once is a page
    // of settings half of which do nothing.
    setVisibility: function (symbol, fn) {
        const opt = this._options[symbol];
        if (opt) opt.visible = fn;
    },

    // Mark a row whose value changes WHICH rows exist, so the list is rebuilt
    // and not just repainted when it moves.
    markRebuildsList: function (symbol) {
        const opt = this._options[symbol];
        if (opt) opt.rebuildsList = true;
    },

    registerOption: function (symbol, name, getter, setter, category = 'gameplay', type = 'boolean', statusTextFn = null, cursorRightFn = null, cursorLeftFn = null) {
        this._options[symbol] = { name, getter, setter, category, type, statusTextFn, cursorRightFn, cursorLeftFn };
    },

    // Hardcoded order and categorization. Gameplay is first so it opens by default.
    // Each tab is a list of titled groups: the settings of one subject sit
    // together under their own heading instead of one long undivided column.
    // Anything registered into the tab's category but named in no group is
    // gathered under the trailing "other" heading, so a plugin's new option
    // still shows up without being listed here.
    tabs: [
        {
            id: 'gameplay',
            nameKey: 'gameplay',
            categories: ['gameplay'],
            groups: [
                { key: 'combat', symbols: ['enemyDifficulty', 'mapBattleMode', 'cpuPartyMembers', 'autoIdle'] },
                { key: 'battleLog', symbols: ['smoothBattleLog', 'battleCommandPosition', 'battleLogBgOpacity', 'battleLogSkillNames'] },
                { key: 'exploration', symbols: ['fowEnabled', 'fogOfWar', 'mapStreaming', 'mapTooltips'] },
                { key: 'saving', symbols: ['autosaveEnabled', 'autosaveInterval'] },
                // Language is left out while the game is locked to English; if it
                // is ever unlocked the registered row lands under "other".
                { key: 'system', symbols: ['commandRemember', 'runInBackground'] }
            ]
        },
        {
            id: 'video',
            nameKey: 'video',
            categories: ['video'],
            groups: [
                { key: 'display', symbols: ['fullscreen', 'TDDP_pixelPerfectMode', 'TDDP_allowStretching', 'showFps'] },
                { key: 'interface', symbols: ['uiScale', 'fontScale', 'activeTheme', 'partyHud', 'worldMinimap', 'titleBackground'] },
                { key: 'battleView', symbols: ['enemyBattlers'] },
                { key: 'lighting', symbols: ['nightLight'] }
            ]
        },
        {
            id: 'audio',
            nameKey: 'audio',
            categories: ['audio'],
            groups: [
                { key: 'mix', symbols: ['masterVolume', 'bgmMute', 'bgmVolume', 'bgsVolume', 'meVolume', 'seVolume'] },
                { key: 'worldSound', symbols: ['weatherVolume', 'footstepsVolume', 'uisVolume', 'vscVolume'] },
                { key: 'music', symbols: ['musicArtistDisplay', 'battleMusicRandom', 'battleMusicName'] },
                { key: 'voices', symbols: ['dialogueVoices', 'dialogueVoicesVolume'] }
            ]
        },
        {
            id: 'shader',
            nameKey: 'shader',
            categories: ['shader'],
            groups: [
                { key: 'look', symbols: ['retroShaderMode'] },
                { key: 'snapVertex', symbols: ['retroDownscale', 'retroColorLevels', 'retroVertexSnap', 'retroDither'] },
                { key: 'pixelArt', symbols: ['pixelArtPixelSize', 'pixelArtWeaponDetail', 'pixelArtPalette',
                    'pixelArtColorLevels', 'pixelArtLightSteps', 'pixelArtSaturation', 'pixelArtInk', 'pixelArtDither'] }
            ]
        },
        {
            id: 'experimental',
            nameKey: 'experimental',
            categories: ['experimental'],
            groups: [
                { key: 'ascii', symbols: ['asciiModeEnabled', 'asciiHudEnabled'] }
            ]
        }
    ]
};

// `tab.symbols` stays the flat ordered list every older call site reads; the
// groups are the source of truth for it.
GameOptions.tabs.forEach(tab => {
    tab.symbols = tab.groups.reduce((acc, g) => acc.concat(g.symbols), []);
});

// The groups of a tab, with every registered option of its categories that no
// group claims gathered into a trailing "other" heading.
GameOptions.tabGroups = function (tab) {
    const cats = tab.categories || [tab.id];
    const claimed = tab.symbols;
    const rest = Object.keys(this._options).filter(
        sym => cats.includes(this._options[sym].category) && !claimed.includes(sym));
    return rest.length ? tab.groups.concat([{ key: 'other', symbols: rest }]) : tab.groups;
};

window.GameOptions = GameOptions;

(() => {
    'use strict';

    const pluginName = "GameOptions";
    const parameters = PluginManager.parameters(pluginName);
    const barColor1 = Number(parameters['barColor1'] || 20);
    const barColor2 = Number(parameters['barColor2'] || 21);
    const defaultBgmVolume = Number(parameters['defaultBgmVolume'] || 90);
    const defaultBgsVolume = Number(parameters['defaultBgsVolume'] || 50);
    const defaultMeVolume = Number(parameters['defaultMeVolume'] || 90);
    const defaultSeVolume = Number(parameters['defaultSeVolume'] || 90);
    const defaultFootstepsVolume = Number(parameters['defaultFootstepsVolume'] || 30);
    const defaultDialogueVoicesVolume = Number(parameters['defaultDialogueVoicesVolume'] || 60);
    const defaultWeatherVolume = Number(parameters['defaultWeatherVolume'] || 80);

    //=============================================================================
    // Retro shader config (the low-poly/low-res shader helper, PSXShader.js)
    //=============================================================================
    // Defaults mirror the shader helper. The look is a light period flavour
    // rather than a full emulation: a small wobble, shallow banding and a gentle
    // downsample, so the 3D scenes stay legible. vertexSnap and colorLevels are
    // stored as raw tunables; downscale and dither are stored as 0..100
    // percentages so they map cleanly onto the slider UI.
    const RETRO_DEFAULTS = {
        mode: 'snapvertex',
        vertexSnap: 420,   // lower = chunkier
        colorLevels: 48,   // fewer = more banding
        downscale: 88,     // percent of full resolution; lower = more pixelated
        dither: 18         // percent dither strength
    };

    // Bumped whenever the defaults above are retuned. A config written before
    // the current tuning is pulled back onto the new defaults once, otherwise
    // every existing player keeps the old heavy settings forever.
    const RETRO_TUNE = 6;

    // The pixel-art look's own tunables (window.PixelArtShader). Same storage
    // convention: raw numbers for the counts, 0..100 percentages for anything
    // that is a slider. pixelSize and weaponDetail are the two halves of the
    // pixel size: the scene's, and the finer one the first person weapon gets
    // so a gun that covers a few dozen pixels still reads as a sprite.
    const PIXELART_DEFAULTS = {
        pixelSize: 50,      // percent of full resolution
        weaponDetail: 200,  // percent of that, for the weapon overlay
        palette: 'none',    // which palette the colours are snapped to ('none' = unlimited colours)
        colorLevels: 0,     // shades per channel when the palette is off (0 = unlimited)
        lightSteps: 5,      // cel bands
        saturation: 115,    // percent, 100 = untouched
        ink: 25,            // percent, how dark the darkest band is pushed
        dither: 25          // percent dither strength
    };

    // Push the stored config onto the live shader helper. Vertex snap, color
    // levels and dither are baked into the GLSL when a material is patched, so
    // those take effect for models built after the change (next battle/scene);
    // enabled and downscale are read per frame and update instantly.
    function applyRetroConfig() {
        const cfg = (key, fallback) => (ConfigManager[key] != null ? ConfigManager[key] : fallback);

        // Which look every 3D scene wears. RetroShader owns the answer and the
        // two shaders' enabled flags; window.PSXShader is only the facade that
        // forwards to whichever it names.
        if (window.RetroShader) {
            window.RetroShader.setMode(cfg('retroShaderMode', RETRO_DEFAULTS.mode));
        }

        const snap = window.SnapVertexShader;
        if (snap) {
            snap.vertexSnap = cfg('retroVertexSnap', RETRO_DEFAULTS.vertexSnap);
            snap.colorLevels = cfg('retroColorLevels', RETRO_DEFAULTS.colorLevels);
            snap.downscale = Math.max(0.1, cfg('retroDownscale', RETRO_DEFAULTS.downscale) / 100);
            snap.dither = cfg('retroDither', RETRO_DEFAULTS.dither) / 100;
        }

        const pxa = window.PixelArtShader;
        if (pxa) {
            // The palette is baked into a lookup texture, so changing which one
            // is in force has to throw the built one away.
            const paletteName = cfg('pixelArtPalette', PIXELART_DEFAULTS.palette);
            if (pxa.setPalette) {
                pxa.setPalette(paletteName);
            } else {
                const palette = paletteName !== 'none' && paletteName !== false;
                if (!!pxa.palette !== palette && pxa.invalidatePalette) pxa.invalidatePalette();
                pxa.palette = palette;
            }
            pxa.downscale = Math.max(0.1, cfg('pixelArtPixelSize', PIXELART_DEFAULTS.pixelSize) / 100);
            pxa.weaponBoost = Math.max(1, cfg('pixelArtWeaponDetail', PIXELART_DEFAULTS.weaponDetail) / 100);
            pxa.levels = cfg('pixelArtColorLevels', PIXELART_DEFAULTS.colorLevels);
            pxa.lightSteps = cfg('pixelArtLightSteps', PIXELART_DEFAULTS.lightSteps);
            pxa.saturation = cfg('pixelArtSaturation', PIXELART_DEFAULTS.saturation) / 100;
            pxa.inkStrength = cfg('pixelArtInk', PIXELART_DEFAULTS.ink) / 100;
            pxa.dither = cfg('pixelArtDither', PIXELART_DEFAULTS.dither) / 100;
        }
    }

    //=============================================================================
    // Interface scaling (UI zoom + font size)
    //=============================================================================
    // Both are whole percentages stepped through a select-style row. UI Scale
    // zooms the DOM menu overlays (every parchment menu roots at #menu-container,
    // see the `#menu-container > *` rule in theme.css); Font Scale drives the
    // root font size the DOM menus size their text from AND the canvas window
    // font size used by RPG Maker's own windows.
    const SCALE_MIN = 70, SCALE_MAX = 150, SCALE_STEP = 5, SCALE_DEFAULT = 100;
    const clampScale = (v) => {
        const n = Number(v);
        if (!isFinite(n)) return SCALE_DEFAULT;
        return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) / SCALE_STEP) * SCALE_STEP;
    };

    GameOptions.uiScale = () => clampScale(ConfigManager.uiScale) / 100;
    GameOptions.fontScale = () => clampScale(ConfigManager.fontScale) / 100;

    // --- Viewport fit -------------------------------------------------------
    // The DOM menus are authored against one design box: the parchment book
    // spread. Every card, gap and font inside it is an absolute px/rem value
    // picked to fill 1560x960, so a menu only holds its contents on a viewport
    // at least that big. A desktop at 1080p clears it; a Steam Deck at 1280x800
    // is short of it and the bottom of a page (the Back/Confirm bar above all)
    // would fall off the spread.
    //
    // Rather than re-author two hundred menus for a second breakpoint, the whole
    // spread is zoomed by however much the viewport differs. Layout still happens
    // at (at least) the design size, so a menu renders exactly as it does on the
    // author's monitor, only scaled.
    //
    // The spread itself is FULL BLEED (theme.css): it no longer caps at the
    // design box and centres inside a padded backdrop, so there is no longer any
    // padding to subtract here.
    const DESIGN_W = 1560, DESIGN_H = 960;   // book spread design box
    const DESIGN_PAD = 0;                    // full-bleed: backdrop has no inset
    const FIT_MIN = 0.5;                     // past this, panes scroll instead

    // --- Handheld (Steam Deck) --------------------------------------------
    // The Deck's panel is 1280x800: 0.82 of the design box, so type authored
    // for the desktop lands on screen at 0.82 of its size on a 7" display, which
    // is where the legibility complaint comes from. Zooming less is the only
    // lever, and zooming less means needing less room.
    //
    // theme.css has a `@media (max-width: 1366px) and (max-height: 860px)` block
    // that compacts the chrome at exactly this size (page padding, card gaps,
    // header rules, button bars). That block buys back roughly 10% in each axis,
    // so the handheld lays out in a smaller box and is scaled down less: 0.91
    // instead of 0.82. Combined with the raised per-rule font sizes, text on a
    // Deck comes out visibly larger than it was, not merely the same.
    //
    // The two must be kept in step: widen the media query and this box has to
    // grow with it, or the compaction will apply to a menu that was not sized
    // down and the pages will run short.
    const HANDHELD_MAX_W = 1366, HANDHELD_MAX_H = 860;
    const HANDHELD_W = 1400, HANDHELD_H = 880;

    function designBox() {
        const w = window.innerWidth || DESIGN_W;
        const h = window.innerHeight || DESIGN_H;
        if (w <= HANDHELD_MAX_W && h <= HANDHELD_MAX_H) {
            return { w: HANDHELD_W, h: HANDHELD_H };
        }
        return { w: DESIGN_W, h: DESIGN_H };
    }
    GameOptions.designBox = designBox;

    // How many design boxes' worth of room the viewport actually has. Over 1 on
    // anything roomier than the design size, under 1 on a handheld.
    function headroom() {
        const box = designBox();
        const w = window.innerWidth || box.w + DESIGN_PAD;
        const h = window.innerHeight || box.h + DESIGN_PAD;
        return Math.min((w - DESIGN_PAD) / box.w, (h - DESIGN_PAD) / box.h);
    }

    // What a default install sees: 1 wherever the design box already fits.
    GameOptions.uiFit = function () {
        return Math.max(FIT_MIN, Math.min(1, headroom()));
    };

    // The player's UI Scale is a ceiling rather than a multiplier on top of the
    // fit, and the headroom is the other ceiling. Asking for 150% on a screen
    // with room for 107% gets 107% instead of a menu whose Confirm button hangs
    // off the bottom; asking for 70% always gets 70%, since shrinking is never
    // the thing that pushes a control off the display.
    GameOptions.uiZoom = function () {
        return Math.min(GameOptions.uiScale(), Math.max(FIT_MIN, headroom()));
    };

    // Applied to the document root so it survives scene changes; every DOM menu
    // built afterwards picks it up with no extra wiring.
    function applyInterfaceScale() {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--ui-scale', String(GameOptions.uiScale()));
        root.style.setProperty('--ui-fit', String(GameOptions.uiFit()));
        const zoom = GameOptions.uiZoom();
        root.style.setProperty('--ui-zoom', String(zoom));

        // Full-bleed panel size, in the panel's OWN (pre-zoom) coordinate space.
        // The panel carries `zoom: var(--ui-zoom)`, which multiplies every px
        // length it lays out with, so a panel sized viewport/zoom px renders at
        // exactly the viewport: edge to edge, no bars, at any zoom. Percentages
        // are not usable here because their behaviour under `zoom` differs
        // between the legacy and standardised implementations; px does not.
        //
        // Because zoom never exceeds the headroom, viewport/zoom is never
        // smaller than the 1560x960 design box, so a menu authored against that
        // box always has at least as much room as its author had.
        const box = designBox();
        const w = window.innerWidth || box.w;
        const h = window.innerHeight || box.h;
        root.style.setProperty('--ui-panel-w', (w / zoom) + 'px');
        root.style.setProperty('--ui-panel-h', (h / zoom) + 'px');
        const fs = GameOptions.fontScale();
        root.style.setProperty('--ui-font-scale', String(fs));
        root.style.fontSize = (16 * fs) + 'px';
    }
    GameOptions.applyInterfaceScale = applyInterfaceScale;

    // The fit half of the scale depends on the window, so it has to be redone
    // whenever the window changes: entering or leaving fullscreen, a resolution
    // switch, or the handheld/desktop-mode swap on a Steam Deck. Open menus pick
    // the new value up on the next frame with no rebuild, since it is only a
    // custom property the CSS reads.
    let _fitRaf = 0;
    function scheduleFitRefresh() {
        if (_fitRaf) return;
        _fitRaf = requestAnimationFrame(() => {
            _fitRaf = 0;
            applyInterfaceScale();
        });
    }
    window.addEventListener('resize', scheduleFitRefresh);
    document.addEventListener('fullscreenchange', scheduleFitRefresh);
    document.addEventListener('webkitfullscreenchange', scheduleFitRefresh);

    // Canvas windows read their size from here, so the same slider scales the
    // in-game message/menu windows. Open windows pick it up on their next refresh.
    const _Game_System_mainFontSize = Game_System.prototype.mainFontSize;
    Game_System.prototype.mainFontSize = function () {
        return Math.round(_Game_System_mainFontSize.call(this) * GameOptions.fontScale());
    };

    //=============================================================================
    // Enemy difficulty (stat scaling)
    //=============================================================================
    // Stored as a 0..100 slider so it reuses the standard number/slider UI.
    // 50 is the neutral middle: no stat edits at all. Each step away from the
    // middle is worth 2% per point, so the ends read as -100% / +100%.
    const ENEMY_DIFFICULTY_DEFAULT = 50;
    const ENEMY_DIFFICULTY_SCALE = 2;

    // Slider value -> signed stat percentage shown to the player.
    const enemyDifficultyPercent = function (value) {
        const v = value != null ? value : ENEMY_DIFFICULTY_DEFAULT;
        return Math.round((v - ENEMY_DIFFICULTY_DEFAULT) * ENEMY_DIFFICULTY_SCALE);
    };

    // Multiplier applied to every enemy parameter. Exactly 1 while the slider
    // sits in the middle, which keeps the vanilla numbers byte-identical.
    GameOptions.enemyStatMultiplier = function () {
        const pct = enemyDifficultyPercent(ConfigManager.enemyDifficulty);
        if (pct === 0) return 1;
        return Math.max(0, 1 + pct / 100);
    };

    // Signed percentage, exposed for other plugins/UI that want to display it.
    GameOptions.enemyDifficultyPercent = function () {
        return enemyDifficultyPercent(ConfigManager.enemyDifficulty);
    };

    // Label for the option row and the inspect panel, e.g. "Normal", "+40%".
    const enemyDifficultyLabel = function (value) {
        const pct = enemyDifficultyPercent(value);
        if (pct === 0) return T('GameOptions.normal');
        return (pct > 0 ? '+' : '') + pct + '%';
    };

    //=============================================================================
    // ConfigManager (Merged from VolumePercentageDisplay)
    //=============================================================================

    // Dialogue voices are on out of the box: the property exists before any
    // config is loaded so an options row read early never reports it off.
    ConfigManager.dialogueVoices = true;

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);

        // Apply defaults if not set. Read straight off the stored config (and
        // coerce), rather than trusting whatever is already on ConfigManager:
        // a config written by an older build can carry a null/NaN volume, which
        // is not `undefined` and would otherwise survive into the sliders.
        const volume = (stored, fallback) => {
            const n = Number(stored);
            return isFinite(n) ? n.clamp(0, 100) : fallback;
        };
        if (this.bgmVolume === undefined) this.bgmVolume = defaultBgmVolume;
        if (this.bgsVolume === undefined) this.bgsVolume = defaultBgsVolume;
        if (this.meVolume === undefined) this.meVolume = defaultMeVolume;
        if (this.seVolume === undefined) this.seVolume = defaultSeVolume;
        this.footstepsVolume = volume(config.footstepsVolume, defaultFootstepsVolume);
        // Animalese chattering under the dialogue box (see DialogueSystem's
        // letter voices). On unless the player turns it off.
        // A config written before the toggle was turned on by default stored a
        // false the player never chose, so it is opted in once and the flag
        // below records that the migration has run.
        if (config.dialogueVoicesDefaultOn) {
            this.dialogueVoices = config.dialogueVoices === undefined ? true : !!config.dialogueVoices;
        } else {
            this.dialogueVoices = true;
        }
        // How loud those blips are, kept off seVolume so the chatter can be
        // quieted without quieting the rest of the sound effects.
        this.dialogueVoicesVolume = volume(config.dialogueVoicesVolume, defaultDialogueVoicesVolume);
        // Weather/outdoor ambience (the MUSH channel 4 BGS the WeatherSystem
        // drives: rain, storms, night). Kept off bgsVolume so a player can quiet
        // the rain without silencing a map's own background sound.
        this.weatherVolume = volume(config.weatherVolume, defaultWeatherVolume);

        // Volume the BGM mute toggle restores when it is switched back off.
        // Kept separate from bgmVolume so muting can survive a save/load.
        this.bgmVolumeBeforeMute = config.bgmVolumeBeforeMute !== undefined
            ? config.bgmVolumeBeforeMute
            : defaultBgmVolume;

        // MUSH Audio Engine defaults
        if (this.uisVolume === undefined) this.uisVolume = 100;
        if (this.vscVolume === undefined) this.vscVolume = 100;
        if (this.masterVolume === undefined) this.masterVolume = 100;

        // Enemy battler display mode: 1 = 3D (procedural/GLB models, the
        // default), 2 = Sprites (<Char:> sprite from enemy info), 3 = 2D
        // battler images (img/enemies, rendered from the 3D models). A config
        // still carrying the dead 0 reads as 3D. Migrates the old standalone
        // charBasedSprites toggle into the set.
        this.enemyBattlers = config.enemyBattlers !== undefined
            ? window.EnemyBattlerModes.normalize(config.enemyBattlers)
            : (config.charBasedSprites ? 2 : 1);
        // Back-compat mirror for any code still reading charBasedSprites.
        this.charBasedSprites = (this.enemyBattlers === 2);
        this.activeTheme = config.activeTheme !== undefined ? config.activeTheme : 0;
        // The theme to come back to when the ASCII layer is switched off.
        this.themeBeforeAscii = config.themeBeforeAscii !== undefined ? config.themeBeforeAscii : 0;
        this.showFps = config.showFps !== undefined ? config.showFps : false;
        this.runInBackground = config.runInBackground !== undefined
            ? !!config.runInBackground
            : false;
        // Title screen background style: 0 Random, 1 Cards, 2 Space
        // (planets + stars + black holes + galaxies), 3 Artifacts, 4 Bestiary,
        // 5 Weapons, 7 Hyperverse (default), 8 Camper Drive. 6 was the separate
        // "Enemies 3D" preset, now folded into the bestiary: the bestiary draws
        // its monsters as 3D models or as flat cards according to enemyBattlers,
        // so a config still carrying 6 reads as the bestiary.
        this.titleBackground = config.titleBackground !== undefined ? config.titleBackground : 7;
        if (this.titleBackground === 6) this.titleBackground = 4;
        // CPU party members: when on, every party member except the leader
        // (first member) is auto-controlled in battle. Disabled by default.
        this.cpuPartyMembers = config.cpuPartyMembers !== undefined ? config.cpuPartyMembers : false;
        // Tactical map battle (BattleSystem/MapBattleMode.js): off by default.
        this.mapBattleMode = config.mapBattleMode !== undefined ? config.mapBattleMode : false;
        // Procedural map streaming (Map/WorldMapReturn.js, window.ProcStitch): on
        // by default. Off falls back to one square per map, crossed with a pan.
        this.mapStreaming = config.mapStreaming !== undefined ? config.mapStreaming : true;
        // The map tips (Map/MapLegend.js): three states rather than a toggle,
        // on from the first game. The row below, the initial settings page of
        // character creation and Bubba's ask menu all write this one key.
        this.showMapNotices = config.showMapNotices !== undefined ? config.showMapNotices : 'first';
        // Enemy difficulty slider: 0..100 with 50 = untouched stats. Anything
        // else scales every enemy parameter (see the Game_Enemy.paramBase hook).
        this.enemyDifficulty = config.enemyDifficulty !== undefined ? config.enemyDifficulty : ENEMY_DIFFICULTY_DEFAULT;

        // Retro shader tunables. The `psx*` fallbacks migrate configs written
        // before the options were renamed.
        const stale = (config.retroTune || 0) < RETRO_TUNE;
        const retro = (key, legacy, fallback) => {
            if (stale) return fallback;
            if (config[key] !== undefined) return config[key];
            if (config[legacy] !== undefined) return config[legacy];
            return fallback;
        };
        this.retroTune = RETRO_TUNE;
        // The old boolean becomes the three-way look picker: a player who had
        // the shader off keeps it off, everyone else lands on SnapVertex, which
        // is what the boolean used to mean.
        this.retroShaderMode = config.retroShaderMode !== undefined
            ? config.retroShaderMode
            : ((config.retroEnabled === false || config.psxEnabled === false)
                ? 'off' : RETRO_DEFAULTS.mode);
        this.retroVertexSnap = retro('retroVertexSnap', 'psxVertexSnap', RETRO_DEFAULTS.vertexSnap);
        this.retroColorLevels = retro('retroColorLevels', 'psxColorLevels', RETRO_DEFAULTS.colorLevels);
        this.retroDownscale = retro('retroDownscale', 'psxDownscale', RETRO_DEFAULTS.downscale);
        this.retroDither = retro('retroDither', 'psxDither', RETRO_DEFAULTS.dither);

        // Pixel-art look. No legacy names to migrate: it did not exist before.
        const pxa = (key, fallback) => (stale ? fallback : (config[key] !== undefined ? config[key] : fallback));
        this.pixelArtPixelSize = pxa('pixelArtPixelSize', PIXELART_DEFAULTS.pixelSize);
        this.pixelArtWeaponDetail = pxa('pixelArtWeaponDetail', PIXELART_DEFAULTS.weaponDetail);
        const paletteCfg = pxa('pixelArtPalette', PIXELART_DEFAULTS.palette);
        this.pixelArtPalette = (paletteCfg === false || paletteCfg === 'none') ? 'none'
            : (paletteCfg === true) ? 'aurora256' : paletteCfg;
        this.pixelArtColorLevels = pxa('pixelArtColorLevels', PIXELART_DEFAULTS.colorLevels);
        this.pixelArtLightSteps = pxa('pixelArtLightSteps', PIXELART_DEFAULTS.lightSteps);
        this.pixelArtSaturation = pxa('pixelArtSaturation', PIXELART_DEFAULTS.saturation);
        this.pixelArtInk = pxa('pixelArtInk', PIXELART_DEFAULTS.ink);
        this.pixelArtDither = pxa('pixelArtDither', PIXELART_DEFAULTS.dither);
        applyRetroConfig();

        // Interface scaling
        this.uiScale = clampScale(config.uiScale !== undefined ? config.uiScale : SCALE_DEFAULT);
        this.fontScale = clampScale(config.fontScale !== undefined ? config.fontScale : SCALE_DEFAULT);
        applyInterfaceScale();

        if (Graphics._fpsCounter) {
            if (this.showFps) {
                Graphics._fpsCounter._boxDiv.style.display = "block";
                Graphics._fpsCounter._showFps = true;
            } else {
                Graphics._fpsCounter._boxDiv.style.display = "none";
            }
            Graphics._fpsCounter._update();
        }

        // Apply the loaded theme immediately
        GameOptions.applyTheme(this.activeTheme);
    };

    // Override to use 1% increments for volume
    ConfigManager.volumeOffset = function () {
        return 1;
    };

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.footstepsVolume = this.footstepsVolume;
        config.dialogueVoices = this.dialogueVoices;
        config.dialogueVoicesDefaultOn = true;
        config.dialogueVoicesVolume = this.dialogueVoicesVolume;
        config.weatherVolume = this.weatherVolume;
        config.bgmVolumeBeforeMute = this.bgmVolumeBeforeMute;
        config.enemyBattlers = this.enemyBattlers;
        config.charBasedSprites = this.charBasedSprites;
        config.activeTheme = this.activeTheme;
        config.themeBeforeAscii = this.themeBeforeAscii;
        config.showFps = this.showFps;
        config.runInBackground = this.runInBackground;
        config.titleBackground = this.titleBackground;
        config.cpuPartyMembers = this.cpuPartyMembers;
        config.mapBattleMode = this.mapBattleMode;
        config.mapStreaming = this.mapStreaming;
        config.showMapNotices = this.showMapNotices;
        config.enemyDifficulty = this.enemyDifficulty;
        config.retroTune = RETRO_TUNE;
        config.retroShaderMode = this.retroShaderMode;
        config.retroVertexSnap = this.retroVertexSnap;
        config.retroColorLevels = this.retroColorLevels;
        config.retroDownscale = this.retroDownscale;
        config.retroDither = this.retroDither;
        config.pixelArtPixelSize = this.pixelArtPixelSize;
        config.pixelArtWeaponDetail = this.pixelArtWeaponDetail;
        config.pixelArtPalette = this.pixelArtPalette;
        config.pixelArtColorLevels = this.pixelArtColorLevels;
        config.pixelArtLightSteps = this.pixelArtLightSteps;
        config.pixelArtSaturation = this.pixelArtSaturation;
        config.pixelArtInk = this.pixelArtInk;
        config.pixelArtDither = this.pixelArtDither;
        config.uiScale = this.uiScale;
        config.fontScale = this.fontScale;
        return config;
    };

    //=============================================================================
    // Simplified Window_OptionsTabs (Hidden, maintained for compatibility)
    //=============================================================================
    class Window_OptionsTabs extends Window_Command {
        constructor(rect) {
            super(rect);
            this.visible = false;
            this._lastIndex = -1;
        }
        isOpenAndActive() {
            return this.isOpen() && this.active;
        }
        processTouch() {
            // Do nothing to prevent standard window touch handling from interfering with custom DOM
        }
        makeCommandList() {
            GameOptions.tabs.forEach(tab => {
                this.addCommand(T('GameOptions.label.' + tab.nameKey), 'tab', true, tab.id);
            });
        }
        maxCols() {
            return 1;
        }
        setOptionsWindow(optionsWindow) {
            this._optionsWindow = optionsWindow;
        }
        update() {
            super.update();
            if (this._optionsWindow && this._lastIndex !== this.index()) {
                this._lastIndex = this.index();
                this._optionsWindow.refresh();
                this._optionsWindow.select(0);
            }
            if (this.active && Input.isRepeated('left')) {
                this.deactivate();
                this._optionsWindow.activate();
                this._optionsWindow.select(0);
            }
        }
    }

    //=============================================================================
    // Simplified Window_Options (Hidden, maintained for compatibility)
    //=============================================================================
    const _Window_Options_makeCommandList = Window_Options.prototype.makeCommandList;
    Window_Options.prototype.makeCommandList = function () {
        if (!SceneManager._scene._optionsTabsWindow) {
            _Window_Options_makeCommandList.call(this);
            return;
        }
        const currentTabId = SceneManager._scene._optionsTabsWindow.currentExt();
        const tab = GameOptions.tabs.find(t => t.id === currentTabId);
        if (!tab) return;

        // A registered name may be a function so the label re-resolves against
        // the active language every time the list is rebuilt.
        const optionName = opt => (typeof opt.name === 'function' ? opt.name() : opt.name);

        const coreSymbols = ['alwaysDash', 'commandRemember', 'bgmVolume', 'bgsVolume', 'meVolume', 'seVolume'];
        const shown = (opt) => {
            if (!opt || typeof opt.visible !== 'function') return true;
            try { return !!opt.visible(); } catch (e) { return true; }
        };

        // Rows are emitted group by group. The first row of a group carries the
        // group's heading, which the DOM list renders above it; the command list
        // itself stays flat so selection indices are unaffected.
        GameOptions.tabGroups(tab).forEach(group => {
            let first = this._list.length;
            group.symbols.forEach(symbol => {
                const custom = GameOptions._options[symbol];
                if (custom && !shown(custom)) return;
                if (custom) {
                    this.addCommand(optionName(custom), symbol);
                } else if (coreSymbols.includes(symbol)) {
                    let name = symbol;
                    if (symbol === 'alwaysDash') name = TextManager.alwaysDash;
                    else if (symbol === 'commandRemember') name = TextManager.commandRemember;
                    else if (symbol === 'bgmVolume') name = TextManager.bgmVolume;
                    else if (symbol === 'bgsVolume') name = TextManager.bgsVolume;
                    else if (symbol === 'meVolume') name = TextManager.meVolume;
                    else if (symbol === 'seVolume') name = TextManager.seVolume;
                    this.addCommand(name, symbol);
                }
            });
            if (this._list.length > first) this._list[first].group = group.key;
        });
    };

    const _Window_Options_getConfigValue = Window_Options.prototype.getConfigValue;
    Window_Options.prototype.getConfigValue = function (symbol) {
        const custom = GameOptions._options[symbol];
        if (custom && custom.getter) {
            return custom.getter.call(this);
        }
        return _Window_Options_getConfigValue.call(this, symbol);
    };

    const _Window_Options_setConfigValue = Window_Options.prototype.setConfigValue;
    Window_Options.prototype.setConfigValue = function (symbol, value) {
        const custom = GameOptions._options[symbol];
        if (custom && custom.setter) {
            custom.setter.call(this, value);
            return;
        }
        _Window_Options_setConfigValue.call(this, symbol, value);
    };

    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function (index) {
        const symbol = this.commandSymbol(index);
        const custom = GameOptions._options[symbol];
        if (custom) {
            if (custom.statusTextFn) {
                return custom.statusTextFn.call(this, this.getConfigValue(symbol));
            }
            const value = this.getConfigValue(symbol);
            if (custom.type === 'number') {
                return value + "%";
            }
            return this.booleanStatusText(value);
        }
        return _Window_Options_statusText.call(this, index);
    };

    const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
    Window_Options.prototype.cursorRight = function (wrap) {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        const custom = GameOptions._options[symbol];

        if (custom && custom.cursorRightFn) {
            custom.cursorRightFn.call(this);
            this.redrawItem(index);
        } else if (custom && custom.type === 'number') {
            let value = Number(this.getConfigValue(symbol));
            if (!isFinite(value)) value = 0;
            value = (value + 1).clamp(0, 100);
            this.setConfigValue(symbol, value);
            this.redrawItem(index);
        } else if (this.isVolumeSymbol(symbol)) {
            let value = this.getConfigValue(symbol);
            value = (value + 1).clamp(0, 100);
            this.setConfigValue(symbol, value);
            this.redrawItem(index);
        } else {
            _Window_Options_cursorRight.call(this, wrap);
        }
    };

    const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
    Window_Options.prototype.cursorLeft = function (wrap) {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        const custom = GameOptions._options[symbol];

        if (custom && custom.cursorLeftFn) {
            custom.cursorLeftFn.call(this);
            this.redrawItem(index);
        } else if (custom && custom.type === 'number') {
            let value = Number(this.getConfigValue(symbol));
            if (!isFinite(value)) value = 0;
            value = (value - 1).clamp(0, 100);
            this.setConfigValue(symbol, value);
            this.redrawItem(index);
        } else if (this.isVolumeSymbol(symbol)) {
            let value = this.getConfigValue(symbol);
            value = (value - 1).clamp(0, 100);
            this.setConfigValue(symbol, value);
            this.redrawItem(index);
        } else {
            _Window_Options_cursorLeft.call(this, wrap);
        }
    };

    const _Window_Options_update = Window_Options.prototype.update;
    Window_Options.prototype.update = function () {
        const wasIndex0 = this.index() === 0;
        _Window_Options_update.call(this);
        if (this.active && wasIndex0 && Input.isRepeated('up')) {
            this.deactivate();
            this.deselect();
            SceneManager._scene._optionsTabsWindow.activate();
        }
    };

    Window_Options.prototype.isOpenAndActive = function () {
        return this.isOpen() && this.active;
    };

    Window_Options.prototype.processTouch = function () {
        // Do nothing to prevent standard window touch handling from interfering with custom DOM
    };

    //=============================================================================
    // Scene_Options (D&D Double Page Parchment Layout Redesign)
    //=============================================================================
    const _Scene_Options_create = Scene_Options.prototype.create;
    Scene_Options.prototype.create = function () {
        // Compatibility with MUSH Audio Engine
        if (window.Mush && window.Mush.parameters && window.Mush.parameters.mushAudioEngine) {
            const par = window.Mush.parameters.mushAudioEngine;
            if (par.menuOptions.uisVolumeFeature && par.genFeatures.uis) {
                GameOptions.registerOption('uisVolume', T.param(par.menuOptions.uisVolumeText, 'GameOptions.label.uiVolume'),
                    () => ConfigManager.uisVolume,
                    (value) => ConfigManager.uisVolume = value,
                    'audio', 'number');
            }
            if (par.menuOptions.vscVolumeFeature) {
                GameOptions.registerOption('vscVolume', T.param(par.menuOptions.vscVolumeText, 'GameOptions.label.voiceVolume'),
                    () => ConfigManager.vscVolume,
                    (value) => ConfigManager.vscVolume = value,
                    'audio', 'number');
            }
            if (par.menuOptions.masterVolumeFeature) {
                GameOptions.registerOption('masterVolume', T.param(par.menuOptions.masterVolumeText, 'GameOptions.label.masterVolume'),
                    () => ConfigManager.masterVolume,
                    (value) => ConfigManager.masterVolume = value,
                    'audio', 'number');
            }
        }

        Scene_MenuBase.prototype.create.call(this);

        // Hidden windows kept purely as data/config helpers. They never handle
        // input themselves, the standalone OptionsInputManager drives the scene.
        this._optionsWindow = new Window_Options(new Rectangle(0, 0, 1, 1));
        this._optionsWindow.visible = false;
        this.addWindow(this._optionsWindow);

        this._optionsTabsWindow = new Window_OptionsTabs(new Rectangle(0, 0, 1, 1));
        this._optionsTabsWindow.visible = false;
        this._optionsTabsWindow.setOptionsWindow(this._optionsWindow);
        this.addWindow(this._optionsTabsWindow);

        this._optionsTabsWindow.deactivate();
        this._optionsWindow.deactivate();
        this._optionsWindow.deselect();

        // DOM navigation state (source of truth)
        this._activeTab = 0;              // Gameplay is first -> opens by default
        this._selectedIndex = 0;
        this._activeSection = 'tabs';     // 'tabs' | 'options'
        this._closing = false;

        // Build initial option list for the default tab
        this.refreshTabData();

        // WASD tracking (see menurework spec §2)
        this._wasdInput = { up: false, down: false, left: false, right: false };
        this._wasdHeld = { up: false, down: false, left: false, right: false };
        this._wasdHoldFrames = { up: 0, down: 0, left: 0, right: 0 };
        this._wasdListener = (event) => {
            if (event.repeat) return;
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdInput.up = true; this._wasdHeld.up = true; event.preventDefault(); }
            if (key === 's') { this._wasdInput.down = true; this._wasdHeld.down = true; event.preventDefault(); }
            if (key === 'a') { this._wasdInput.left = true; this._wasdHeld.left = true; event.preventDefault(); }
            if (key === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; event.preventDefault(); }
        };
        this._wasdUpListener = (event) => {
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdHeld.up = false; this._wasdHoldFrames.up = 0; }
            if (key === 's') { this._wasdHeld.down = false; this._wasdHoldFrames.down = 0; }
            if (key === 'a') { this._wasdHeld.left = false; this._wasdHoldFrames.left = 0; }
            if (key === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
        };
        window.addEventListener('keydown', this._wasdListener);
        window.addEventListener('keyup', this._wasdUpListener);

        this.createUIOptionsDOM();
        OptionsInputManager.activate(this);
    };

    Scene_Options.prototype.createUIOptionsDOM = function () {
        this._dndContainer = document.createElement('div');
        this._dndContainer.id = 'menu-container';
        this._dndContainer.style.opacity = "0";
        this._dndContainer.style.transition = "opacity 0.22s ease-out";
        document.body.appendChild(this._dndContainer);

        const it = ConfigManager.language === 'it';
        const mainTitle =T('GameOptions.preferences');
        const backLabel =T('GameOptions.back');
        const resetLabel = T('GameOptions.resetDefaults');

        // Spec skeleton: book-spread -> left-page (header bar + tab strip + list) + right-page (inspect)
        this._dndContainer.innerHTML = `
            <div class="book-spread options-spread">
                <div class="left-page">
                    <div class="page-header-bar">
                        <button class="back-button" id="opt-back-btn" onclick="SceneManager._scene.goBack()">${backLabel}</button>
                        <h2 class="title">${mainTitle}</h2>
                        <button class="back-button" id="opt-reset-btn" onclick="SceneManager._scene.resetToDefaults()">${resetLabel}</button>
                    </div>
                    <div class="backpack-tabs" id="options-categories"></div>
                    <div id="options-list" class="pockets-scroll"></div>
                </div>
                <div class="right-page">
                    <div class="item-inspect" id="options-inspect"></div>
                </div>
            </div>
        `;

        this.renderTabs();
        this.renderOptions();
        this.updateHighlight();

        this._dndContainer.addEventListener("wheel", (e) => {
            e.preventDefault();
            const list = document.getElementById('options-list');
            if (list) list.scrollTop += e.deltaY;
        }, { passive: false });

        this._dndContainer.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.goBack();
        });

        // Hover preview: moving the mouse over an option row updates the right
        // page (inspect) to that row without committing the selection; leaving
        // the list reverts to the currently selected option. Delegated on the
        // list element so it survives the innerHTML rebuilds in renderOptions.
        //
        // Bound to mousemove, not mouseover, and gated on the pointer actually
        // having moved: changing a value rebuilds the whole list markup, and the
        // fresh row built under a parked cursor fires a mouseover of its own.
        // That phantom hover fired after updateHighlight() had already drawn the
        // selected option, so every keyboard edit yanked the right page onto
        // whatever row the mouse happened to be resting on (the last one, party
        // formation, more often than not). A rebuild moves no pointer, so
        // mousemove does not fire for it. Scroll-generated mousemoves repeat the
        // last coordinates, hence the position check rather than a bare guard.
        const optionsList = this._dndContainer.querySelector('#options-list');
        if (optionsList) {
            let lastX = null, lastY = null;
            optionsList.addEventListener('mousemove', (e) => {
                if (e.clientX === lastX && e.clientY === lastY) return;
                lastX = e.clientX;
                lastY = e.clientY;
                const row = e.target.closest && e.target.closest('.option-row');
                if (!row || !optionsList.contains(row)) return;
                const idx = parseInt(row.dataset.idx, 10);
                if (!isNaN(idx)) this.previewOption(idx);
            });
            optionsList.addEventListener('mouseleave', () => {
                lastX = lastY = null;
                this.clearPreview();
            });
        }

        // Force reflow and trigger smooth fade-in once painted
        setTimeout(() => {
            if (this._dndContainer) this._dndContainer.style.opacity = "1";
        }, 16);
    };


    //=========================================================================
    // Settings preview images (img/pictures/Settings/)
    //=========================================================================
    // Each option symbol may map to an illustrative image shown in the inspect
    // panel. Boolean toggles use {on, off} variants; sliders/selects use {img}.
    // Empty placeholder files exist for every entry, swap in real art anytime.
    const SETTINGS_IMAGE_DIR = 'img/pictures/Settings/';
    const OPTION_IMAGES = {
        // Gameplay
        fogOfWar:        { on: 'FogOfWarON',        off: 'FogOfWarOFF' },
        autoIdle:        { on: 'AutoIdleON',        off: 'AutoIdleOFF' },
        commandRemember: { on: 'CommandRememberON', off: 'CommandRememberOFF' },
        autosaveEnabled: { on: 'AutoSaveON',        off: 'AutoSaveOFF' },
        enemyDifficulty: { img: 'EnemyDifficulty' },
        combatMode:      { on: 'CombatModeON',      off: 'CombatModeOFF' },
        autosaveInterval: { img: 'SaveInterval' },
        battleLogBgOpacity: { img: 'BattleLogOpacity' },
        language:        { img: 'Language' }, // i18n-ignore: icon filename
        cpuPartyMembers: { on: 'CpuPartyON',        off: 'CpuPartyOFF' },
        // Video
        // Indexed by the mode value itself, and mode 0 (the dead value that
        // reads as 3D) no longer exists, so index 0 is deliberately empty.
        enemyBattlers:   { states: [null, 'EnemyBattlers3D', 'EnemyBattlersSprites', 'EnemyBattlers2D'] },
        fullscreen:      { on: 'FullscreenON',      off: 'FullscreenOFF' },
        globalLighting:  { on: 'GlobalLightingON',  off: 'GlobalLightingOFF' },
        nightLight:      { on: 'NightLightON',      off: 'NightLightOFF' },
        charBasedSprites: { on: 'CharSpritesON',    off: 'CharSpritesOFF' },
        showFps:         { on: 'ShowFpsON',         off: 'ShowFpsOFF' },
        partyHud:        { on: 'PartyHudON',        off: 'PartyHudOFF' },
        activeTheme:     { img: 'ActiveTheme' },
        battleMusicName: { img: 'BattleMusic' },
        battleMusicRandom: { img: 'BattleMusic' },
        titleBackground: { img: 'TitleBackground' },
        uiScale:         { img: 'UiScale' },
        fontScale:       { img: 'FontScale' },
        TDDP_pixelPerfectMode: { on: 'PixelPerfectON', off: 'PixelPerfectOFF' },
        TDDP_allowStretching:  { on: 'StretchingON',   off: 'StretchingOFF' },
        // Shader (the low-poly/low-res retro pass, PSXShader.js). Every one of
        // these changes what the 3D scenes look like, so each gets its own shot.
        retroShaderMode: { img: 'RetroShaderON' },
        pixelArtPixelSize: { img: 'RetroResolution' },
        pixelArtDither:  { img: 'RetroDither' },
        pixelArtColorLevels: { img: 'RetroColorLevels' },
        retroDownscale:  { img: 'RetroResolution' },
        retroDither:     { img: 'RetroDither' },
        retroColorLevels: { img: 'RetroColorLevels' },
        retroVertexSnap: { img: 'RetroVertexSnap' },
        // Experimental: ASCII mode is a 3-way select (0 Off, 1 On, 2 Only UI).
        asciiModeEnabled: { states: ['AsciiModeOFF', 'AsciiModeON', 'AsciiHUDON'] },
        asciiHudEnabled: { on: 'AsciiHUDON',        off: 'AsciiHUDOFF' },
        // Tactical map battle (BattleSystem/MapBattleMode.js).
        mapBattleMode:   { on: 'MapBattleON',       off: 'MapBattleOFF' },
        // 3D
        battler3d:       { on: 'Battler3DON',       off: 'Battler3DOFF' },
        enemyBattlerMode: { on: 'EnemyBattlerON',   off: 'EnemyBattlerOFF' }
    };

    //=========================================================================
    // Per-option warnings (inspect panel)
    //=========================================================================


    // Most entries above still point at a blank 1x1 stub (~70 bytes) rather than
    // real art. Those must not render, an empty framed box next to the option is
    // worse than no illustration at all, so the file is measured once and any
    // stub is treated as "no image". Web builds cannot stat files; there the
    // <img> onload handler below catches the same case from naturalWidth.
    const PLACEHOLDER_MAX_BYTES = 256;
    const _imageUsableCache = {};
    const settingsImageUsable = (relPath) => {
        if (relPath in _imageUsableCache) return _imageUsableCache[relPath];
        let usable = true;
        if (Utils.isNwjs()) {
            let fs, full;
            try {
                fs = require('fs');
                const path = require('path');
                const base = path.dirname(process.mainModule.filename);
                full = path.join(base, relPath.split('/').join(path.sep));
            } catch (e) {
                // No filesystem access here; leave it to the <img> handlers.
                full = null;
            }
            if (full) {
                try {
                    const stat = fs.statSync(full);
                    usable = stat.isFile() && stat.size > PLACEHOLDER_MAX_BYTES;
                } catch (e) {
                    usable = false; // missing file
                }
            }
        }
        _imageUsableCache[relPath] = usable;
        return usable;
    };

    // Resolve the preview image path for an option given its current value.
    const settingsImageFor = (symbol, value) => {
        const entry = OPTION_IMAGES[symbol];
        if (!entry) return null;
        let name = null;
        if (entry.states) {
            // Multi-state select: one image per integer value (clamped).
            const idx = Math.max(0, Math.min(entry.states.length - 1, value | 0));
            name = entry.states[idx];
        } else if (entry.on || entry.off) {
            name = value ? entry.on : entry.off;
        } else {
            name = entry.img;
        }
        if (!name) return null;
        const path = SETTINGS_IMAGE_DIR + name + '.png';
        return settingsImageUsable(path) ? path : null;
    };


    //=========================================================================
    // Standalone input manager (menurework spec §5), keyboard + controller
    //=========================================================================
    const OptionsInputManager = {
        _scene: null,
        _active: false,
        activate(scene) { this._scene = scene; this._active = true; },
        deactivate() { this._active = false; this._scene = null; },
        update() {
            const scene = this._scene;
            if (!this._active || !scene || !scene._dndContainer) return;

            // WASD hold-repeat simulation (spec §2)
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (scene._wasdHeld[dir]) {
                    scene._wasdHoldFrames[dir]++;
                    const t = scene._wasdHoldFrames[dir];
                    if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        scene._wasdInput[dir] = true;
                    }
                } else {
                    scene._wasdHoldFrames[dir] = 0;
                }
            }
            const isDown = Input.isRepeated('down') || scene._wasdInput.down;
            const isUp = Input.isRepeated('up') || scene._wasdInput.up;
            const isRight = Input.isRepeated('right') || scene._wasdInput.right;
            const isLeft = Input.isRepeated('left') || scene._wasdInput.left;
            scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

            // L1/R1 tab cycling, fires from anywhere (spec §2)
            if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                scene.cycleTab(Input.isTriggered('pageup') ? -1 : 1);
                return;
            }

            // OK
            if (Input.isTriggered('ok')) { scene.handleOk(); return; }

            // Cancel, always check both 'escape' and 'cancel' (gamepad B)
            if (Input.isTriggered('escape') || Input.isTriggered('cancel')) {
                scene.handleCancel();
                return;
            }

            if (isUp || isDown || isLeft || isRight) {
                scene.handleMove({ up: isUp, down: isDown, left: isLeft, right: isRight });
            }
        }
    };
    window._OptionsInputManager = OptionsInputManager;

    //=========================================================================
    // Rendering
    //=========================================================================
    Scene_Options.prototype._optionsList = function () {
        return this._optionsWindow._list || [];
    };

    Scene_Options.prototype.refreshTabData = function () {
        this._optionsTabsWindow.select(this._activeTab);
        this._optionsWindow.refresh();
    };

    Scene_Options.prototype.renderTabs = function () {
        const c = this._dndContainer && this._dndContainer.querySelector('#options-categories');
        if (!c) return;
        const it = ConfigManager.language === 'it';
        c.innerHTML = GameOptions.tabs.map((tab, idx) => {
            const dispName = T('GameOptions.label.' + tab.nameKey);
            return `<div class="backpack-tab" data-tab="${idx}" onclick="SceneManager._scene.selectTab(${idx})">
                        <span>${dispName}</span>
                    </div>`;
        }).join('');
    };

    Scene_Options.prototype.renderOptions = function () {
        const c = this._dndContainer && this._dndContainer.querySelector('#options-list');
        if (!c) return;
        const w = this._optionsWindow;
        const list = this._optionsList();
        const it = ConfigManager.language === 'it';
        const t = (en, i) => it ? i : en;

        if (list.length === 0) {
            c.innerHTML = `<div class="item-grid-empty">${T('GameOptions.noSettingsHere')}</div>`;
            return;
        }

        c.innerHTML = list.map((cmd, idx) => {
            const symbol = cmd.symbol;
            const name = cmd.name;
            const custom = GameOptions._options[symbol];
            const value = w.getConfigValue(symbol);
            const labelHTML = `<span class="option-label"><span class="option-name">${name}</span></span>`;
            // The first row of a group prints the group's heading above itself.
            const headerHTML = cmd.group
                ? `<div class="option-group-header">${T('GameOptions.group.' + cmd.group)}</div>`
                : '';

            // Number / volume slider. A slider may provide a statusTextFn when the
            // raw 0..100 position is not what the player should read (e.g. enemy
            // difficulty, where the middle means "no change").
            if ((custom && custom.type === 'number') || w.isVolumeSymbol(symbol)) {
                // A stale config can hand back null/NaN; never let that reach the
                // label ("undefined%") or the fill width.
                const num = Number(value);
                const pct = isFinite(num) ? num.clamp(0, 100) : 0;
                const valueStr = (custom && custom.statusTextFn) ? w.statusText(idx) : `${pct}%`;
                return headerHTML + `<div class="option-row option-row--slider" data-idx="${idx}" onclick="SceneManager._scene.focusOption(${idx})">
                            <div class="option-row-head">
                                ${labelHTML}
                                <span class="option-value">${valueStr}</span>
                            </div>
                            <div class="option-slider-bar" onclick="event.stopPropagation(); SceneManager._scene.setSliderValue(${idx}, event)">
                                <div class="option-slider-fill" style="width: ${pct}%"></div>
                            </div>
                        </div>`;
            }

            // Custom select-list options (theme, etc.)
            if (custom && custom.cursorLeftFn && custom.cursorRightFn) {
                const statusStr = w.statusText(idx);
                return headerHTML + `<div class="option-row" data-idx="${idx}" onclick="SceneManager._scene.focusOption(${idx})">
                            ${labelHTML}
                            <span class="option-status-toggle enabled option-select">
                                <span class="arrow-btn" onclick="event.stopPropagation(); SceneManager._scene.decreaseOption(${idx})">◀</span>
                                <span class="option-select-val">${statusStr}</span>
                                <span class="arrow-btn" onclick="event.stopPropagation(); SceneManager._scene.increaseOption(${idx})">▶</span>
                            </span>
                        </div>`;
            }

            // Boolean toggle
            return headerHTML + `<div class="option-row" data-idx="${idx}" onclick="SceneManager._scene.toggleOption(${idx})">
                        ${labelHTML}
                        <span class="option-status-toggle ${value ? 'enabled' : 'disabled'}">${value ? T('GameOptions.active') : T('GameOptions.inactive')}</span>
                    </div>`;
        }).join('');
    };

    Scene_Options.prototype.renderInspect = function (overrideIdx) {
        const container = this._dndContainer && this._dndContainer.querySelector('#options-inspect');
        if (!container) return;
        const it = ConfigManager.language === 'it';
        const t = (en, i) => it ? i : en;
        const tab = GameOptions.tabs[this._activeTab];
        const tabName = T('GameOptions.label.' + tab.nameKey);
        const w = this._optionsWindow;
        const list = this._optionsList();

        // A hovered row previews its details on the right page without moving the
        // committed selection. Falls back to the selected index when not hovering.
        const hasPreview = overrideIdx != null && !!list[overrideIdx];

        // The right page is always kept: folding the spread when there was
        // nothing to describe made the whole layout jump sideways as the cursor
        // moved between options. An empty tab simply leaves the page blank.
        this.setSpreadSolo(false);
        if (list.length === 0) {
            container.classList.add('item-inspect--empty');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('item-inspect--empty');
        const idx = hasPreview ? overrideIdx : this._selectedIndex;
        const cmd = list[idx];
        const symbol = cmd.symbol;
        const custom = GameOptions._options[symbol];
        const isNum = (custom && custom.type === 'number') || w.isVolumeSymbol(symbol);
        const isSelect = custom && custom.cursorLeftFn && custom.cursorRightFn;
        const typeLabel = isNum ? T('GameOptions.slider') : isSelect ? T('GameOptions.selection') : T('GameOptions.toggle');

        let valStr;
        if (isNum) valStr = (custom && custom.statusTextFn) ? w.statusText(idx) : w.getConfigValue(symbol) + '%';
        else if (isSelect) valStr = w.statusText(idx);
        else valStr = w.getConfigValue(symbol) ? T('GameOptions.active2') : T('GameOptions.inactive2');

        // Pass the live value so boolean toggles pick on/off art and multi-state
        // selects (Skill Categorization, Enemy Battlers) pick their per-state art.
        const imgVal = isNum ? null : w.getConfigValue(symbol);
        const imgPath = settingsImageFor(symbol, imgVal);
        // The wrapper is dropped outright when the art is missing or is still a
        // blank stub, so no empty frame is left sitting on the page.
        const imgHTML = imgPath
            ? `<div class="opt-inspect-img-wrap"><img class="opt-inspect-img" src="${imgPath}" alt=""
                    onerror="this.parentNode.classList.add('is-hidden');"
                    onload="if(this.naturalWidth<=2||this.naturalHeight<=2)this.parentNode.classList.add('is-hidden');"></div>`
            : '';

        // Options whose new value only takes effect after a game restart.
        const RESTART_REQUIRED = ['activeTheme'];
        const restartHTML = RESTART_REQUIRED.includes(symbol)
            ? `<div class="inspect-bullet-item opt-note">${T('GameOptions.requiresRestartToApply')}</div>`
            : '';

        // Per-option warnings shown under the value.
        // Per-option warnings live in GameOptions.warn, keyed by option symbol.
        const noteKey = 'GameOptions.warn.' + symbol;
        const noteHTML = T.has(noteKey)
            ? `<div class="inspect-bullet-item opt-note">${T(noteKey)}</div>`
            : '';

        // Plain-language explanation of what the option does. `desc.<symbol>` is
        // the general sentence; `descState.<symbol>` is one line per value of a
        // select, with the value in force highlighted. Options with neither key
        // simply render no explanation block.
        const descKey = 'GameOptions.desc.' + symbol;
        const stateKey = 'GameOptions.descState.' + symbol;
        const stateLines = T.has(stateKey) ? T.list(stateKey) : [];
        const curValue = isNum ? -1 : (w.getConfigValue(symbol) | 0);
        const descLines = [];
        if (T.has(descKey)) descLines.push(`<div class="inspect-bullet-item">${T(descKey)}</div>`);
        stateLines.forEach((line, i) => {
            const on = i === curValue;
            descLines.push(`<div class="inspect-bullet-item${on ? ' opt-state-on' : ''}">${line}</div>`);
        });
        const descHTML = descLines.length
            ? `<div class="inspect-section-title">${T('GameOptions.howItWorks')}</div>${descLines.join('')}`
            : '';

        container.innerHTML = `
            <div class="inspect-header">
                <div class="inspect-title-box">
                    <div class="inspect-name">${cmd.name}</div>
                    <div class="inspect-rarity opt-inspect-kind">${tabName} · ${typeLabel}</div>
                </div>
            </div>
            ${imgHTML}
            <div class="inspect-lore">
                ${descHTML}
                <div class="inspect-section-title">${T('GameOptions.currentValue')}</div>
                <div class="inspect-spec-row"><span class="inspect-spec-label">${cmd.name}</span><span class="inspect-spec-value">${valStr}</span></div>
                ${noteHTML}
                ${restartHTML}
            </div>`;
    };

    // Fold the spread to a single full-width page (and back). The class carries
    // the whole change: the right page is dropped, the binding spine with it, and
    // the left page widens to the full sheet.
    Scene_Options.prototype.setSpreadSolo = function (solo) {
        const spread = this._dndContainer && this._dndContainer.querySelector('.book-spread');
        if (!spread) return;
        spread.classList.toggle('options-solo', !!solo);
    };

    // Hover preview helpers: render the inspect panel for a hovered row without
    // changing the committed selection. _hoverPreviewIdx guards against redundant
    // re-renders as mouseover bubbles up from a row's child elements.
    Scene_Options.prototype.previewOption = function (index) {
        if (this._hoverPreviewIdx === index) return;
        this._hoverPreviewIdx = index;
        this.renderInspect(index);
    };

    Scene_Options.prototype.clearPreview = function () {
        if (this._hoverPreviewIdx == null) return;
        this._hoverPreviewIdx = null;
        this.renderInspect();
    };

    // Lightweight selection update, no full grid rebuild on plain navigation
    Scene_Options.prototype.updateHighlight = function () {
        if (!this._dndContainer) return;
        const tabEls = this._dndContainer.querySelectorAll('.backpack-tab');
        tabEls.forEach((el, i) => {
            el.classList.toggle('active', i === this._activeTab);
            el.classList.toggle('selected', this._activeSection === 'tabs' && i === this._activeTab);
        });
        const rows = this._dndContainer.querySelectorAll('.option-row');
        rows.forEach((el, i) => {
            el.classList.toggle('active', this._activeSection === 'options' && i === this._selectedIndex);
        });
        if (this._activeSection === 'options') {
            const active = this._dndContainer.querySelector('.option-row.active');
            if (active) active.scrollIntoView({ block: 'nearest' });
        }
        // Real navigation clears any stale hover preview so the next mouseover
        // (even onto the same row) re-renders the right page.
        this._hoverPreviewIdx = null;
        this.renderInspect();
    };

    //=========================================================================
    // Navigation (keyboard / controller -> via OptionsInputManager)
    //=========================================================================
    Scene_Options.prototype.handleMove = function (d) {
        if (this._activeSection === 'tabs') {
            if (d.left) this.cycleTab(-1);
            else if (d.right) this.cycleTab(1);
            else if (d.down) this.enterOptions();
            return;
        }
        // options section (single-column list)
        const total = this._optionsList().length;
        if (d.up) {
            if (this._selectedIndex > 0) {
                this._selectedIndex--;
                SoundManager.playCursor();
                this.updateHighlight();
            } else {
                this._activeSection = 'tabs';
                SoundManager.playCursor();
                this.updateHighlight();
            }
        } else if (d.down) {
            if (this._selectedIndex < total - 1) {
                this._selectedIndex++;
                SoundManager.playCursor();
                this.updateHighlight();
            }
        } else if (d.left) {
            this.adjustValue(-1);
        } else if (d.right) {
            this.adjustValue(1);
        }
    };

    Scene_Options.prototype.handleOk = function () {
        if (this._activeSection === 'tabs') { this.enterOptions(); return; }
        this.activateOption(this._selectedIndex);
    };

    Scene_Options.prototype.handleCancel = function () {
        if (this._activeSection === 'options') {
            this._activeSection = 'tabs';
            SoundManager.playCancel();
            this.updateHighlight();
        } else {
            this.goBack();
        }
    };

    Scene_Options.prototype.enterOptions = function () {
        if (this._optionsList().length === 0) return;
        this._activeSection = 'options';
        this._selectedIndex = 0;
        SoundManager.playCursor();
        this.updateHighlight();
    };

    Scene_Options.prototype.cycleTab = function (dir) {
        const n = GameOptions.tabs.length;
        this._activeTab = (this._activeTab + dir + n) % n;
        this._selectedIndex = 0;
        SoundManager.playCursor();
        this.refreshTabData();
        this.renderTabs();
        this.renderOptions();
        this.updateHighlight();
    };

    // Adjust the focused option's value: number/volume -> slider, select -> cycle, boolean -> toggle
    Scene_Options.prototype.adjustValue = function (dir) {
        const w = this._optionsWindow;
        const idx = this._selectedIndex;
        const symbol = w.commandSymbol(idx);
        if (!symbol) return;
        const custom = GameOptions._options[symbol];
        w.select(idx);
        const isNum = (custom && custom.type === 'number') || w.isVolumeSymbol(symbol);
        const isSelect = custom && (custom.cursorLeftFn || custom.cursorRightFn);
        if (isNum || isSelect) {
            if (dir > 0) w.cursorRight(false); else w.cursorLeft(false);
        } else {
            w.setConfigValue(symbol, !w.getConfigValue(symbol));
            w.redrawItem(idx);
        }
        SoundManager.playCursor();
        if (custom && custom.rebuildsList) this._rebuildRows();
        this.renderOptions();
        this.updateHighlight();
    };

    // A row whose value decides which OTHER rows exist (the shader style) has
    // to rebuild the list, not just repaint it, and the cursor has to survive
    // the list getting shorter.
    Scene_Options.prototype._rebuildRows = function () {
        this._optionsWindow.refresh();
        const n = this._optionsList().length;
        this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, n - 1));
        this._optionsWindow.select(this._selectedIndex);
    };

    // OK on an option: sliders do nothing; select/boolean advance/toggle
    Scene_Options.prototype.activateOption = function (idx) {
        const w = this._optionsWindow;
        const symbol = w.commandSymbol(idx);
        if (!symbol) return;
        const custom = GameOptions._options[symbol];
        const isNum = (custom && custom.type === 'number') || w.isVolumeSymbol(symbol);
        if (isNum) return;
        this._selectedIndex = idx;
        this.adjustValue(1);
    };

    //=========================================================================
    // Mouse handlers (invoked from inline onclick)
    //=========================================================================
    Scene_Options.prototype.selectTab = function (index) {
        if (index === this._activeTab && this._activeSection === 'tabs') return;
        this._activeTab = index;
        this._selectedIndex = 0;
        this._activeSection = 'tabs';
        SoundManager.playOk();
        this.refreshTabData();
        this.renderTabs();
        this.renderOptions();
        this.updateHighlight();
    };

    Scene_Options.prototype.focusOption = function (index) {
        this._activeSection = 'options';
        this._selectedIndex = index;
        SoundManager.playCursor();
        this.updateHighlight();
    };

    Scene_Options.prototype.toggleOption = function (index) {
        this._activeSection = 'options';
        this._selectedIndex = index;
        this.activateOption(index);
    };

    Scene_Options.prototype.increaseOption = function (index) {
        this._activeSection = 'options';
        this._selectedIndex = index;
        this.adjustValue(1);
    };

    Scene_Options.prototype.decreaseOption = function (index) {
        this._activeSection = 'options';
        this._selectedIndex = index;
        this.adjustValue(-1);
    };

    Scene_Options.prototype.setSliderValue = function (index, event) {
        const w = this._optionsWindow;
        const symbol = w.commandSymbol(index);
        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        let newValue = Math.round((clickX / rect.width) * 100).clamp(0, 100);

        this._activeSection = 'options';
        this._selectedIndex = index;
        w.select(index);
        w.setConfigValue(symbol, newValue);
        w.redrawItem(index);
        SoundManager.playCursor();
        this.renderOptions();
        this.updateHighlight();
    };

    //=========================================================================
    // Lifecycle
    //=========================================================================
    Scene_Options.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        OptionsInputManager.update();
    };

    // Reset every setting to its default. There is no defaults table of its
    // own: applyData({}) is the single place, core and plugin alike, where an
    // absent key falls back to its default, so an empty config IS the defaults.
    Scene_Options.prototype.resetToDefaults = function () {
        ConfigManager.applyData({});
        ConfigManager.save();
        SoundManager.playLoad();
        this._rebuildRows();
        this.renderOptions();
        this.updateHighlight();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('GameOptions.resetDefaultsDone'));
        }
    };

    Scene_Options.prototype.goBack = function () {
        if (this._closing) return;
        this._closing = true;
        SoundManager.playCancel();
        if (this._dndContainer) {
            this._dndContainer.style.opacity = "0";
            this._dndContainer.style.pointerEvents = "none";
            setTimeout(() => this.popScene(), 220);
        } else {
            this.popScene();
        }
    };

    Scene_Options.prototype.terminate = function () {
        if (this._wasdListener) {
            window.removeEventListener('keydown', this._wasdListener);
            window.removeEventListener('keyup', this._wasdUpListener);
            this._wasdListener = this._wasdUpListener = null;
        }
        OptionsInputManager.deactivate();
        ConfigManager.save();
        if (this._dndContainer) {
            if (this._dndContainer.parentNode) {
                this._dndContainer.parentNode.removeChild(this._dndContainer);
            }
            this._dndContainer = null;
        }
        const style = document.getElementById("options-styles");
        if (style) style.remove();
        const fonts = document.getElementById("fonts");
        if (fonts) fonts.remove();
        Scene_MenuBase.prototype.terminate.call(this);
    };

    //=========================================================================
    // Mute BGM (sits right above the BGM Volume slider in the Audio tab)
    //=========================================================================
    // A plain toggle: turning it on drops bgmVolume to 0 (which stops the
    // playing track immediately, since ConfigManager.bgmVolume writes straight
    // through to AudioManager), turning it off restores the volume the player
    // had before muting. The state is derived from bgmVolume itself, so
    // dragging the slider back up unmutes the toggle with no extra bookkeeping.
    GameOptions.registerOption('bgmMute', T('GameOptions.label.muteBgm'),
        () => ConfigManager.bgmVolume === 0,
        (value) => {
            if (value) {
                if (ConfigManager.bgmVolume > 0) {
                    ConfigManager.bgmVolumeBeforeMute = ConfigManager.bgmVolume;
                }
                ConfigManager.bgmVolume = 0;
            } else {
                const prev = ConfigManager.bgmVolumeBeforeMute;
                ConfigManager.bgmVolume = (prev > 0) ? prev : defaultBgmVolume;
            }
        },
        'audio', 'boolean');

    // Register Footsteps Volume (Merged from VolumePercentageDisplay).
    // The getter defends against a null/NaN value inherited from an older
    // config, which would otherwise render as "undefined%".
    GameOptions.registerOption('footstepsVolume', T('GameOptions.label.footstepsVolume'),
        () => {
            const v = Number(ConfigManager.footstepsVolume);
            return isFinite(v) ? v : defaultFootstepsVolume;
        },
        (value) => ConfigManager.footstepsVolume = value,
        'audio', 'number');

    // Dialogue Voices: each letter of a typed dialogue line is chattered with a
    // vowel or consonant blip, pitched by the speaker's own voice, a keyword's
    // gold run a third higher. On by default; the blips live in
    // audio/se/Vowels and audio/se/Consonants.
    GameOptions.registerOption('dialogueVoices', T('GameOptions.label.dialogueVoices'),
        () => !!ConfigManager.dialogueVoices,
        (value) => ConfigManager.dialogueVoices = !!value,
        'audio', 'boolean');

    // How loud the letter blips are. Its own slider rather than a share of the
    // SE volume, so the chatter can be turned down on its own.
    GameOptions.registerOption('dialogueVoicesVolume', T('GameOptions.label.dialogueVoicesVolume'),
        () => {
            const v = Number(ConfigManager.dialogueVoicesVolume);
            return isFinite(v) ? v : defaultDialogueVoicesVolume;
        },
        (value) => ConfigManager.dialogueVoicesVolume = value,
        'audio', 'number');

    // Weather Volume: the rain/storm/night ambience the WeatherSystem plays on
    // MUSH channel 4. The setter re-applies the level to whatever is already
    // playing, so dragging the slider is audible while the menu is open.
    GameOptions.registerOption('weatherVolume', T('GameOptions.label.weatherVolume'),
        () => {
            const v = Number(ConfigManager.weatherVolume);
            return isFinite(v) ? v : defaultWeatherVolume;
        },
        (value) => {
            ConfigManager.weatherVolume = value;
            if (window.WeatherAudio && window.WeatherAudio.refresh) {
                window.WeatherAudio.refresh();
            }
        },
        'audio', 'number');

    // Enemy battler display mode: cycle 3D -> Sprites -> 2D. Replaces the old
    // standalone Char-based Sprites toggle (Sprites == that behaviour).
    // 3D (the procedural models) is the default; 2D draws the still render of
    // that same model out of img/enemies, for machines that would rather not
    // run WebGL in a fight.
    const ENEMY_BATTLER_MODES = window.EnemyBattlerModes.VALUES;
    // The name list is one entry per mode in ENEMY_BATTLER_MODES order, so it
    // is looked up by position rather than by the mode number.
    const enemyBattlerNames = () => T.list('GameOptions.enemyBattler');
    const enemyBattlerName = (v) => {
        const names = enemyBattlerNames();
        return names[Math.max(0, ENEMY_BATTLER_MODES.indexOf(v))] || names[0];
    };
    const setEnemyBattlers = (v) => {
        ConfigManager.enemyBattlers = window.EnemyBattlerModes.normalize(v);
        ConfigManager.charBasedSprites = (ConfigManager.enemyBattlers === 2); // legacy mirror
    };
    GameOptions.registerOption('enemyBattlers', T('GameOptions.label.enemyBattlers'),
        () => window.EnemyBattlerModes.normalize(ConfigManager.enemyBattlers),
        (value) => setEnemyBattlers(value),
        'video', 'boolean',
        (value) => enemyBattlerName(window.EnemyBattlerModes.normalize(value)),
        function () {
            this.setConfigValue('enemyBattlers',
                window.EnemyBattlerModes.step(this.getConfigValue('enemyBattlers'), 1));
        },
        function () {
            this.setConfigValue('enemyBattlers',
                window.EnemyBattlerModes.step(this.getConfigValue('enemyBattlers'), -1));
        }
    );

    // Register Show FPS
    GameOptions.registerOption('showFps', T('GameOptions.label.showFps'),
        () => ConfigManager.showFps,
        (value) => {
            ConfigManager.showFps = value;
            if (Graphics._fpsCounter) {
                if (value) {
                    Graphics._fpsCounter._boxDiv.style.display = "block";
                    Graphics._fpsCounter._showFps = true;
                } else {
                    Graphics._fpsCounter._boxDiv.style.display = "none";
                }
                Graphics._fpsCounter._update();
            }
        },
        'video', 'boolean');

    // Register Run In Background: with this on the game keeps updating while
    // the window is not focused, so alt tabbing no longer freezes it.
    GameOptions.registerOption('runInBackground', T('GameOptions.label.runInBackground'),
        () => ConfigManager.runInBackground === true,
        (value) => { ConfigManager.runInBackground = value; },
        'gameplay', 'boolean');

    const _SceneManager_isGameActive = SceneManager.isGameActive;
    SceneManager.isGameActive = function () {
        if (ConfigManager.runInBackground) return true;
        return _SceneManager_isGameActive.call(this);
    };

    // Register Theme Switcher. Every preset, plus the ASCII layer, applied on
    // the spot: the tokens are swapped live and nothing needs a restart.
    const themeCount = () => GameOptions.getThemes().length;

    GameOptions.registerOption('activeTheme', T('GameOptions.label.activeTheme'),
        () => ConfigManager.activeTheme !== undefined ? ConfigManager.activeTheme : 0,
        (value) => GameOptions.setTheme(value),
        'video', 'boolean',
        (value) => GameOptions.themeName(value) || GameOptions.themeName(0),
        function () {
            let v = this.getConfigValue('activeTheme');
            v = (v + 1) % themeCount();
            this.setConfigValue('activeTheme', v);
        },
        function () {
            let v = this.getConfigValue('activeTheme');
            v = (v - 1 + themeCount()) % themeCount();
            this.setConfigValue('activeTheme', v);
        }
    );

    // Map Battle is a shipped battle mode, so it lives on the Gameplay page
    // beside the other combat settings: it replaces the standard battle scene.
    // Off by default; it is also offered up front as a combat mode during
    // character creation.
    GameOptions.registerOption('mapBattleMode', T('GameOptions.label.mapBattle'),
        () => ConfigManager.mapBattleMode === true,
        (value) => {
            // In a LAN session the host's setting is everybody's setting
            // (Multiplayer/MultiplayerSystem.js keeps it in step).
            if (window.MultiplayerRemote && window.MultiplayerRemote.isMapBattleLocked()) {
                if (window.ParchmentToast && window.ParchmentToast.show) {
                    window.ParchmentToast.show(T('Multiplayer.lan.mapBattleLockedByHost'));
                }
                return;
            }
            ConfigManager.mapBattleMode = !!value;
        },
        'gameplay', 'boolean');

    //=========================================================================
    // Retro shader options (the low-poly/low-res 3D shader, PSXShader.js)
    //=========================================================================
    // Which look every three.js viewport in the game wears: the battle scene,
    // the voxel world, the minigames, GalaxySim, the menu previews and the title
    // screen all render through whichever this names.
    const SHADER_MODES = ['off', 'snapvertex', 'pixelart'];
    const shaderModeName = (value) => {
        const key = SHADER_MODES.indexOf(value) === -1 ? 'off' : value;
        return T('GameOptions.shaderMode.' + key);
    };
    const stepShaderMode = (dir) => function () {
        const cur = SHADER_MODES.indexOf(this.getConfigValue('retroShaderMode'));
        const idx = (Math.max(0, cur) + dir + SHADER_MODES.length) % SHADER_MODES.length;
        this.setConfigValue('retroShaderMode', SHADER_MODES[idx]);
    };
    GameOptions.registerOption('retroShaderMode', T('GameOptions.label.shaderStyle'),
        () => ConfigManager.retroShaderMode || RETRO_DEFAULTS.mode,
        (value) => { ConfigManager.retroShaderMode = value; applyRetroConfig(); },
        'shader', 'boolean',
        shaderModeName, stepShaderMode(1), stepShaderMode(-1)
    );

    // Internal render resolution slider (lower = more pixelated). 100% disables
    // the low-res downsample pass entirely.
    GameOptions.registerOption('retroDownscale', T('GameOptions.label.renderResolution'),
        () => ConfigManager.retroDownscale != null ? ConfigManager.retroDownscale : RETRO_DEFAULTS.downscale,
        (value) => { ConfigManager.retroDownscale = value; applyRetroConfig(); },
        'shader', 'number');

    // Dither strength slider.
    GameOptions.registerOption('retroDither', T('GameOptions.label.dithering'),
        () => ConfigManager.retroDither != null ? ConfigManager.retroDither : RETRO_DEFAULTS.dither,
        (value) => { ConfigManager.retroDither = value; applyRetroConfig(); },
        'shader', 'number');

    // Color depth select (shades per channel; fewer = more banding).
    const RETRO_COLOR_MIN = 2, RETRO_COLOR_MAX = 64, RETRO_COLOR_STEP = 2;
    GameOptions.registerOption('retroColorLevels', T('GameOptions.label.colorLevels'),
        () => ConfigManager.retroColorLevels != null ? ConfigManager.retroColorLevels : RETRO_DEFAULTS.colorLevels,
        (value) => { ConfigManager.retroColorLevels = value; applyRetroConfig(); },
        'shader', 'boolean',
        (value) => String(value),
        function () {
            let v = this.getConfigValue('retroColorLevels');
            v = Math.min(RETRO_COLOR_MAX, v + RETRO_COLOR_STEP);
            this.setConfigValue('retroColorLevels', v);
        },
        function () {
            let v = this.getConfigValue('retroColorLevels');
            v = Math.max(RETRO_COLOR_MIN, v - RETRO_COLOR_STEP);
            this.setConfigValue('retroColorLevels', v);
        }
    );

    // Vertex snap grid select (lower = chunkier wobble).
    const RETRO_SNAP_MIN = 40, RETRO_SNAP_MAX = 300, RETRO_SNAP_STEP = 10;
    GameOptions.registerOption('retroVertexSnap', T('GameOptions.label.vertexSnap'),
        () => ConfigManager.retroVertexSnap != null ? ConfigManager.retroVertexSnap : RETRO_DEFAULTS.vertexSnap,
        (value) => { ConfigManager.retroVertexSnap = value; applyRetroConfig(); },
        'shader', 'boolean',
        (value) => String(value),
        function () {
            let v = this.getConfigValue('retroVertexSnap');
            v = Math.min(RETRO_SNAP_MAX, v + RETRO_SNAP_STEP);
            this.setConfigValue('retroVertexSnap', v);
        },
        function () {
            let v = this.getConfigValue('retroVertexSnap');
            v = Math.max(RETRO_SNAP_MIN, v - RETRO_SNAP_STEP);
            this.setConfigValue('retroVertexSnap', v);
        }
    );

    //=========================================================================
    // Pixel-art shader options (window.PixelArtShader)
    //=========================================================================
    // The same knobs the SnapVertex look has, in the terms this one is built
    // from: how big a pixel is, how many bands of light, how inked the darks,
    // and whether the colours are snapped to AAP-Splendor128 (the palette the
    // background converter tool reduces to) or just quantized.
    const registerPixelArtStep = (symbol, name, min, max, step, fmt) => {
        const move = (dir) => function () {
            const cur = Number(this.getConfigValue(symbol));
            const v = Math.min(max, Math.max(min, cur + dir * step));
            this.setConfigValue(symbol, v);
        };
        GameOptions.registerOption(symbol, name,
            () => ConfigManager[symbol],
            (value) => { ConfigManager[symbol] = value; applyRetroConfig(); },
            'shader', 'boolean',
            fmt || ((value) => String(value)),
            move(1), move(-1)
        );
    };
    const pct = (value) => value + '%';

    // Pixel size: the whole look. Lower = bigger pixels.
    registerPixelArtStep('pixelArtPixelSize', T('GameOptions.label.pixelSize'), 10, 100, 5, pct);
    // The weapon overlay renders this much finer than the scene.
    registerPixelArtStep('pixelArtWeaponDetail', T('GameOptions.label.weaponDetail'), 100, 400, 25, pct);

    // Which set of inks the colours are snapped to: None (unlimited colours, default),
    // Aurora 256, Splendor 128, or LCD (monochrome Game Boy).
    const PIXEL_PALETTES = ['none', 'aurora256', 'splendor128', 'lcd'];
    const stepPalette = (dir) => function () {
        const cur = PIXEL_PALETTES.indexOf(this.getConfigValue('pixelArtPalette'));
        const idx = (Math.max(0, cur) + dir + PIXEL_PALETTES.length) % PIXEL_PALETTES.length;
        this.setConfigValue('pixelArtPalette', PIXEL_PALETTES[idx]);
    };
    GameOptions.registerOption('pixelArtPalette', T('GameOptions.label.pixelPalette'),
        () => ConfigManager.pixelArtPalette,
        (value) => { ConfigManager.pixelArtPalette = value; applyRetroConfig(); },
        'shader', 'boolean',
        (value) => T('GameOptions.palette.' + (PIXEL_PALETTES.indexOf(value) === -1 ? 'none' : value)),
        stepPalette(1), stepPalette(-1)
    );
    GameOptions.markRebuildsList('pixelArtPalette');

    registerPixelArtStep('pixelArtColorLevels', T('GameOptions.label.colorLevels'), 2, 32, 1);
    registerPixelArtStep('pixelArtLightSteps', T('GameOptions.label.lightBands'), 2, 12, 1);
    registerPixelArtStep('pixelArtSaturation', T('GameOptions.label.saturation'), 50, 200, 5, pct);
    registerPixelArtStep('pixelArtInk', T('GameOptions.label.inkedShadows'), 0, 80, 5, pct);
    registerPixelArtStep('pixelArtDither', T('GameOptions.label.dithering'), 0, 100, 5, pct);

    //=========================================================================
    // The shader tab shows one look's knobs at a time
    //=========================================================================
    // Vertex snap means nothing to the pixel-art look and a palette means
    // nothing to SnapVertex, so each row is listed only while the look it
    // belongs to is the one the player picked.
    const shaderModeIs = (mode) => () =>
        (ConfigManager.retroShaderMode || RETRO_DEFAULTS.mode) === mode;
    ['retroDownscale', 'retroColorLevels', 'retroVertexSnap', 'retroDither']
        .forEach((sym) => GameOptions.setVisibility(sym, shaderModeIs('snapvertex')));
    ['pixelArtPixelSize', 'pixelArtWeaponDetail', 'pixelArtPalette', 'pixelArtColorLevels',
     'pixelArtLightSteps', 'pixelArtSaturation', 'pixelArtInk', 'pixelArtDither']
        .forEach((sym) => GameOptions.setVisibility(sym, shaderModeIs('pixelart')));
    // Shades per channel is what the pixel-art look quantizes with when it is
    // NOT snapping to a palette; with one on it does nothing.
    GameOptions.setVisibility('pixelArtColorLevels', () =>
        shaderModeIs('pixelart')() && ConfigManager.pixelArtPalette === 'none');
    GameOptions.markRebuildsList('retroShaderMode');

    //=========================================================================
    // Interface scaling (Video tab)
    //=========================================================================
    // Stepped selects rather than 0..100 sliders: the useful range is 70..150%,
    // which the plain slider row cannot express.
    const registerScaleOption = (symbol, name) => {
        const step = (dir) => function () {
            const v = clampScale(this.getConfigValue(symbol) + dir * SCALE_STEP);
            this.setConfigValue(symbol, v);
        };
        GameOptions.registerOption(symbol, name,
            () => clampScale(ConfigManager[symbol]),
            (value) => { ConfigManager[symbol] = clampScale(value); applyInterfaceScale(); },
            'video', 'boolean',
            (value) => clampScale(value) + '%',
            step(1), step(-1)
        );
    };
    registerScaleOption('uiScale', T('GameOptions.label.uiScaling'));
    registerScaleOption('fontScale', T('GameOptions.label.fontScaling'));

    // Title Screen Background switcher (select between the floating-card,
    // 3D planet, or 3D procedural weapon backgrounds; Random reshuffles each launch)
    const titleBgNames = () => T.list('GameOptions.titleBackground');
    // Cycle order as seen by the player: Hyperverse (the default) first, Camper
    // Drive second, then the rest, with Random always last. The stored config
    // ids keep their original numbering so existing configs stay valid; only the
    // order they are stepped through changes. 6 (the old Enemies 3D preset) is
    // gone from the cycle: the bestiary covers it. Mirrors
    // Scene_Title.getAvailableBackgroundModes in Titlescreen.js.
    const TITLE_BG_ORDER = [7, 8, 1, 2, 4, 3, 5, 0];
    const stepTitleBg = (v, dir) => {
        let i = TITLE_BG_ORDER.indexOf(v);
        if (i < 0) i = 0;
        return TITLE_BG_ORDER[(i + dir + TITLE_BG_ORDER.length) % TITLE_BG_ORDER.length];
    };
    GameOptions.registerOption('titleBackground', T('GameOptions.label.titleBackground'),
        () => ConfigManager.titleBackground !== undefined ? ConfigManager.titleBackground : 7,
        (value) => ConfigManager.titleBackground = value,
        'video', 'boolean',
        (value) => titleBgNames()[value === 6 ? 4 : value] || titleBgNames()[0],
        function () {
            this.setConfigValue('titleBackground', stepTitleBg(this.getConfigValue('titleBackground'), 1));
        },
        function () {
            this.setConfigValue('titleBackground', stepTitleBg(this.getConfigValue('titleBackground'), -1));
        }
    );

    //=========================================================================
    // Enemy Difficulty slider (buff / nerf every enemy parameter)
    //=========================================================================
    // Slider stays a plain 0..100 number so it renders (and click-drags) like
    // the volume sliders; the displayed value is the signed stat percentage.
    GameOptions.registerOption('enemyDifficulty', T('GameOptions.label.enemyDifficulty'),
        () => ConfigManager.enemyDifficulty != null ? ConfigManager.enemyDifficulty : ENEMY_DIFFICULTY_DEFAULT,
        (value) => ConfigManager.enemyDifficulty = value,
        'gameplay', 'number',
        (value) => enemyDifficultyLabel(value));

    // Scale enemy parameters at paramBase so buffs/states and Health_Core's
    // limb-damage modifiers (which hook Game_Enemy.param) still layer on top of
    // the adjusted base. Enemies already in a running battle keep the stats they
    // were built with; the new value applies from the next battle on.
    const _Game_Enemy_paramBase_difficulty = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function (paramId) {
        const base = _Game_Enemy_paramBase_difficulty.call(this, paramId);
        const mult = GameOptions.enemyStatMultiplier();
        if (mult === 1) return base;
        return Math.round(base * mult);
    };

    //=========================================================================
    // Map tooltips (the written tips and compass targets the map shows)
    //=========================================================================
    // The setting lives on switch 75, which the map hints and the story-mode
    // rules of BattleSystemEnhanced already read, so it belongs to the save
    // rather than to ConfigManager. Outside a running game there is nothing to
    // read, and the row reads as off.
    // Three states, not a toggle: a tip read once and never again, a tip read
    // every time the party stands there, or none at all. ConfigManager.
    // showMapNotices is the setting; switch 75, which the map hints and the
    // story-mode rules of BattleSystemEnhanced read, follows it so the two
    // never disagree about whether the map is talking.
    const MAP_NOTICE_MODES = ['first', 'always', 'off'];   // i18n-ignore: setting values

    const mapNoticeMode = () => (window.MapLegend ? window.MapLegend.noticesMode()
        : (MAP_NOTICE_MODES.includes(ConfigManager.showMapNotices) ? ConfigManager.showMapNotices : 'first'));

    const setMapNoticeMode = (mode) => {
        if (window.MapLegend) window.MapLegend.setNoticesMode(mode);
        else ConfigManager.showMapNotices = mode;
        if (window.$gameSwitches) $gameSwitches.setValue(75, mode !== 'off');
    };

    const stepMapNotices = (dir) => function () {
        const i = Math.max(0, MAP_NOTICE_MODES.indexOf(mapNoticeMode()));
        setMapNoticeMode(MAP_NOTICE_MODES[(i + dir + MAP_NOTICE_MODES.length) % MAP_NOTICE_MODES.length]);
    };

    GameOptions.registerOption('mapTooltips', T('GameOptions.label.mapTooltips'),
        mapNoticeMode,
        setMapNoticeMode,
        'gameplay', 'boolean',
        (value) => T('MapLegend.setting.mode.' + (MAP_NOTICE_MODES.includes(value) ? value : 'first')),
        stepMapNotices(1), stepMapNotices(-1));

    //=========================================================================
    // CPU Party Members (auto-control every party member except the leader)
    //=========================================================================
    // Registered here, consumed via the Game_Actor.isAutoBattle override below.
    //=========================================================================
    // Procedural map streaming (Map/WorldMapReturn.js)
    //=========================================================================
    // On, neighbouring procedural squares sharing a tileset are stitched into one
    // seamless map and walked across without a transition. Off, one square is
    // loaded at a time and its border is crossed with a Zelda-style screen pan.
    GameOptions.registerOption('mapStreaming', T('GameOptions.label.mapStreaming'),
        () => ConfigManager.mapStreaming !== false,
        (value) => {
            ConfigManager.mapStreaming = !!value;
            if (window.ProcStitch && window.ProcStitch.onStreamingChanged) {
                window.ProcStitch.onStreamingChanged(!!value);
            }
        },
        'gameplay', 'boolean');

    GameOptions.registerOption('cpuPartyMembers', T('GameOptions.label.cpuPartyMembers'),
        () => ConfigManager.cpuPartyMembers,
        (value) => ConfigManager.cpuPartyMembers = value,
        'gameplay', 'boolean');

    // When the option is on, treat any in-battle actor that isn't the party
    // leader (first member) as auto-battle. This is the same mechanism the
    // SummonSystem uses for summoned actors: isAutoBattle() true makes
    // canInput() false (no command window) and makeActions() auto-selects
    // actions via makeAutoBattleActions(), so no changes to the battle turn
    // loop or command windows are needed.
    // Apply the interface scale once at load as well: a config that fails to
    // load never reaches applyData, and the menus should still open at a sane
    // (100%) scale rather than with the tokens unset.
    applyInterfaceScale();

    // A second human is playing: local split-screen (SplitScreenMultiplayer.js)
    // or a live network session (MultiplayerSystem.js drives switch 66
    // "connected" and switch 67 "multiplayer mode"). Shared with
    // BattleSystem/MapBattleMode.js, which asks the same question about the
    // tactical command menu.
    window.isMultiplayerSession = function () {
        const ss = window.SplitScreenManager || window.$gameSplitScreen;
        if (ss && ss.active) return true;
        if (window.$gameSwitches) {
            if ($gameSwitches.value(66) || $gameSwitches.value(67)) return true;
        }
        const nm = window.NetworkManager;
        return !!(nm && nm.isConnected && nm.isConnected());
    };

    // The option's effective state. Ignored outright in multiplayer: party slot
    // 2 (and beyond) is the OTHER player's character there, and handing it to the
    // auto-battle AI would take the controller out of their hands.
    window.isCpuPartyMembersActive = function () {
        return ConfigManager.cpuPartyMembers === true && !window.isMultiplayerSession();
    };

    const _Game_Actor_isAutoBattle_cpuParty = Game_Actor.prototype.isAutoBattle;
    Game_Actor.prototype.isAutoBattle = function () {
        if (window.isCpuPartyMembersActive() && $gameParty.inBattle()
            && this !== $gameParty.leader()) {
            return true;
        }
        return _Game_Actor_isAutoBattle_cpuParty.call(this);
    };

    //=========================================================================
    // The UI face on the canvas windows
    //=========================================================================
    // theme.css dresses every DOM menu in --font-ui. RPG Maker's own windows
    // are painted into a canvas and never read a stylesheet, so they are told
    // the same face here and the two halves of the UI finally agree.
    //
    // The face has to be pulled in on purpose: a canvas draw does not fetch a
    // webfont the way a DOM node does, so a window drawn before anything on the
    // page has used the face would fall back without it.
    const UI_FONT_FACE = "Bitter";

    // Where the parchment face is deliberately NOT worn:
    //   - the minigames and the arcade, which each carry their own display font
    //     and are pastiches of somebody else's machine rather than of our UI,
    //   - the title screen's own menu, which is set in Square,
    //   - the simulated desktop, which is DOM and dressed as its own operating
    //     system in hypernet.css, so it never asks this question at all.
    const UI_FONT_EXEMPT_SCENES = [
        "Scene_Title",
        "Scene_Arcade", "Scene_GameSelect", "Scene_HighScores", "Scene_InitialEntry",
        "Scene_BoosterPack", "Scene_CardBooster", "Scene_CardCollection", "Scene_CardDuel",
        "Scene_Chess", "Scene_FishingMinigame", "Scene_HyperTamer", "Scene_UnlockingBlocks",
        "Scene_MonsterTournament", "Scene_PeriodicTable", "Scene_RamanScan",
        "Scene_ScratchCard", "Scene_ScratchCardSelect", "Scene_SurfingGame",
        "Scene_TargetRange", "Scene_Tarot", "Scene_TarotBase", "Scene_TarotNPC",
        "Scene_TokenConverter",
    ];

    // The scene being drawn for is the one on screen, or the one being built
    // when a window asks during a scene change. A scene not on the list can
    // still step aside by setting `_uiFontExempt` on itself.
    function isUiFontExempt() {
        const scene = SceneManager._nextScene || SceneManager._scene;
        if (!scene) return false;
        if (scene._uiFontExempt) return true;
        const name = scene.constructor && scene.constructor.name;
        return UI_FONT_EXEMPT_SCENES.indexOf(name) >= 0;
    }

    const _Game_System_mainFontFace_uiFont = Game_System.prototype.mainFontFace;
    Game_System.prototype.mainFontFace = function () {
        if (isUiFontExempt()) return _Game_System_mainFontFace_uiFont.call(this);
        return UI_FONT_FACE + ", " + $dataSystem.advanced.fallbackFonts;
    };

    // Loaded alongside the engine's own fonts, both weights, so the first
    // window drawn is already wearing it. The faces themselves are declared in
    // theme.css: asking for them here only makes the page fetch them.
    // One weight of one face, added to the document so both the DOM and the
    // canvas can draw with it. A face already there is left alone.
    function addUiFontFace(family, url, weight) {
        if (!window.FontFace || !document.fonts) return;
        try {
            const font = new FontFace(family, `url(${url})`, { weight, style: "normal" });
            font.load().then((loaded) => document.fonts.add(loaded)).catch((err) => {
                console.error(`GameOptions: the UI face ${family} ${weight} did not load from ${url}`, err);
            });
        } catch (err) {
            console.error(`GameOptions: the UI face ${family} ${weight} could not be declared`, err);
        }
    }

    const _Scene_Boot_loadGameFonts_uiFont = Scene_Boot.prototype.loadGameFonts;
    Scene_Boot.prototype.loadGameFonts = function () {
        _Scene_Boot_loadGameFonts_uiFont.call(this);
        // Built here rather than left to the @font-face in theme.css: this URL
        // is relative to index.html, the one path the engine itself proves
        // works (it is how Terminus.ttf is fetched), so the canvas half of the
        // UI does not depend on how a stylesheet's own relative url() resolves.
        // Weight 400 is the semibold cut: see the note on the @font-face in
        // theme.css. The two must name the same file or the canvas windows
        // would be drawn a shade lighter than the DOM menus beside them.
        addUiFontFace(UI_FONT_FACE, "fonts/Bitter-SemiBold.ttf", "400");
        addUiFontFace(UI_FONT_FACE, "fonts/Bitter-Bold.ttf", "700");
        // The title menu's own face, drawn into a canvas for the same reason.
        addUiFontFace("Square", "fonts/Square.ttf", "400");
    };

    window.UIFont = { face: UI_FONT_FACE, isExempt: isUiFontExempt };

})();

