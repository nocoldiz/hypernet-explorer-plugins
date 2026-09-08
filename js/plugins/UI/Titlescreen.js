//=============================================================================
// Titlescreen.js
//=============================================================================

/*:
* @target MZ
* @plugindesc Replaces the title screen command window with a vertical, terminal-style menu and adds a floating-network of connected data cards with fade-in mesh lines.
* @author Omni-Lex
* @version 1.5.0
*
* @param windowWidth
* @text Window Width (%)
* @desc The width of the command window as a percentage of the screen width.
* @type number
* @default 35
*
* @param windowX
* @text Window X Offset (%)
* @desc Horizontal center position of the command window as a percentage of the screen width.
* @type number
* @default 20
*
* @param windowPadding
* @text Window Padding
* @desc Padding inside the command window.
* @type number
* @default 18
*
* @param commandPadding
* @text Command Padding
* @desc The space to the left of the command text.
* @type number
* @default 36
*
* @param hideStartOptions
* @text Hide Start Options
* @desc If true, hides the Explore and Sandbox commands from the menu.
* @type boolean
* @default false
*
* @param EnableDisclaimer
* @text Enable Disclaimer
* @desc If true, shows the early-build feedback disclaimer on the title screen (closed with the mouse).
* @type boolean
* @default true
*
* @param VersionText
* @text Version Text
* @desc Build label shown in the top-left corner of the title screen. Leave empty to hide the badge.
* @type string
* @default 0.2.0a - experimental
*
* @help
* -----------------------------------------------------------------------------
* Introduction
* -----------------------------------------------------------------------------
* This plugin replaces the default title screen command window with a full-height,
* terminal-style column menu on the left side and spawns floating cards below
* that rise up, showing random enemies, skills, items, weapons, or armor from the
* game's database. Each card is connected to every other with gold lines that
* smoothly fade in and out, forming a dynamic mesh.
*
* Enhanced features:
* - HTML-based menu with crisp text rendering
* - Animated floating data cards with connection mesh
* - Terminal-style interface design with gold theme
* - Left-aligned command window text
* - ID-based references instead of icon/sprite numbers
*
* No plugin commands.
*
*/

(() => {
    const pluginName = "Titlescreen";
    const params = PluginManager.parameters(pluginName);
    const toPct = v => Number(v) / 100;
    const windowWidthPct = Number(params.windowWidth) || 35;
    const windowXOffsetPct = Number(params.windowX) || 20;
    const windowPadding = Number(params.windowPadding) || 18;
    const commandPadding = Number(params.commandPadding) || 36;
    const { Trivia } = window.Messages || {};
    const hideStartOptions = params.hideStartOptions === 'true';
    // Defaults to ON, so an entry in plugins.js that predates this parameter
    // (undefined) still shows the disclaimer.
    const enableDisclaimer = params.EnableDisclaimer !== 'false';

    const DISCLAIMER_TEXT = () => T('Titlescreen.disclaimer.text');

    // The news panel is the shipped CHANGELOG.txt read out loud: the newest
    // section is what it opens on and its two buttons walk the older ones. The
    // updater owns the read, since it is the plugin that already opens that file
    // to learn which version this copy is. A build running with the updater
    // turned off, or one shipped without a changelog, gets an empty list and the
    // panel falls back to the notice written in its own i18n entry.
    const NEWS_SECTIONS = () => {
        try {
            const updater = window.GameUpdater;
            if (updater && typeof updater.changelogSections === 'function') {
                const list = updater.changelogSections();
                if (Array.isArray(list)) return list;
            }
        } catch (e) {
            console.warn('Titlescreen: the changelog could not be read', e);
        }
        return [];
    };

    // The dash every changelog entry is written under, kept as punctuation
    // rather than as a translated string.
    const NEWS_BULLET = '- ';

    // plugins.js registers this file under its path ("UI/Titlescreen") while the
    // name above is the bare file name, and PluginManager keys parameters by the
    // REGISTERED name. The older parameters are read through `params` above and
    // have always fallen back to their in-code defaults because of that mismatch;
    // changing them now would move the menu, so only the parameters added since
    // are read through this resolver.
    const pathParams = (() => {
        for (const key of ['UI/Titlescreen', pluginName]) {
            const p = PluginManager.parameters(key);
            if (p && Object.keys(p).length) return p;
        }
        return {};
    })();

    // Build label for the corner badge. An untouched parameter localises through
    // the i18n key; one edited in plugins.js (or by a mod) wins as written. An
    // explicitly blanked parameter hides the badge, while an absent one (an
    // entry that predates it) still shows the shipped label.
    //
    // The version itself is read off the first line of CHANGELOG.txt, which is
    // where it is written down and which travels with the build like every
    // other tracked file, so an updated copy names its own version with nothing
    // edited in a plugin. The updater owns that read (GameUpdater.gameVersion)
    // and hands the badge the version followed by the name of the build this
    // copy sits on, i.e. its commit message. A build whose changelog names no
    // version falls back to the label written here, and there the third field
    // is the build number, i.e. how many commits the installed build sits past
    // the numbering origin. A copy that has never updated, one running with the
    // updater plugin turned off, or a web build with no changelog to read,
    // keeps the label exactly as written. A badge is not worth an exception
    // thrown out of a plugin that may not even be loaded, so the pass is
    // guarded end to end.
    // The badge does its own read of CHANGELOG.txt rather than depending on the
    // updater being loaded and having managed its own: the file ships with the
    // build, so the version on its first line is the version that is running,
    // whatever the state of any other plugin. Two fields or three, with or
    // without the letter a release habit puts at the end, and a header is only
    // looked for near the top so a version written inside an entry is never
    // mistaken for one.
    const CHANGELOG_FILE = 'CHANGELOG.txt'; // i18n-ignore: file name
    const CHANGELOG_VERSION_LINE = /^v?(\d+\.\d+(?:\.\d+)?[A-Za-z]*)$/;
    const CHANGELOG_SEARCH_LINES = 40;
    let _changelogVersion; // undefined until read, null when there is none

    const readChangelogVersion = () => {
        if (_changelogVersion !== undefined) return _changelogVersion;
        _changelogVersion = null;
        let text = null;
        try {
            if (typeof require === 'function') {
                const fs = require('fs');
                const nodePath = require('path');
                const base = (typeof process !== 'undefined' && process.cwd) ? process.cwd() : '';
                const file = nodePath.join(base, CHANGELOG_FILE);
                if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8');
            }
        } catch (e) { /* fall through to the web read */ }
        if (text === null) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', CHANGELOG_FILE, false);
                xhr.send();
                // A file:// read answers with status 0 even when it worked.
                const ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText);
                if (ok) text = xhr.responseText;
            } catch (e) { /* no changelog to read */ }
        }
        if (text) {
            const lines = String(text).split(/\r?\n/, CHANGELOG_SEARCH_LINES);
            for (let i = 0; i < lines.length; i++) {
                const found = String(lines[i]).trim().match(CHANGELOG_VERSION_LINE);
                if (found) { _changelogVersion = found[1]; break; }
            }
        }
        return _changelogVersion;
    };

    const VERSION_TEXT = () => {
        const raw = pathParams.VersionText;
        if (raw !== undefined && String(raw).trim() === '') return '';
        let text = T.param(raw, 'Titlescreen.version.text');
        try {
            const own = readChangelogVersion();
            if (own) text = own;
            const updater = window.GameUpdater;
            if (!updater) return text;
            // The version is settled; the updater only adds the name of the
            // build this copy sits on, and the build number when the changelog
            // named nothing.
            if (own) {
                if (typeof updater.applyBuildName === 'function') return updater.applyBuildName(text);
                return text;
            }
            if (typeof updater.versionLabel === 'function') return updater.versionLabel(text);
            if (typeof updater.applyBuildNumber === 'function') return updater.applyBuildNumber(text);
        } catch (e) {
            console.warn('Titlescreen: the updater could not label the version', e);
        }
        return text;
    };

    // The astronomy catalogues below keep their English classification strings
    // as ids (they are matched, compared and slugged), so the display pass runs
    // them through Astronomy.cls at render time instead. Anything with no entry
    // reads as written, which is what proper nouns want.
    const astroSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const astroLabel = (s) => {
        const key = 'Astronomy.cls.' + astroSlug(s);
        return T.has(key) ? T(key) : String(s || '');
    };
    const astroField = (k) => T('Astronomy.field.' + k);
    // Where a copy sitting behind a major update is sent. Patching cannot carry
    // it the rest of the way, so the notice offers the whole game instead of an
    // update. The updater owns the address (its fullDownloadUrl parameter); this
    // is only what a build running without the updater plugin would use.
    const FULL_GAME_FALLBACK = "https://drive.google.com/file/d/1p9vo_Rj5xB0Bx3QJogpShveB2z7vbJzk/view?usp=drive_link";
    const DISCLAIMER_LINK = "https://discord.gg/7gVDZa6v7E";
    const LINKTREE_LINK = "https://linktr.ee/nocoldiz";
    // Donation targets, shown as buttons under the links in the same panel.
    const PATREON_LINK = "https://www.patreon.com/nocoldiz";
    const PAYPAL_LINK = "https://www.paypal.com/donate/?hosted_button_id=A54P863NGUD9L";

    // The game runs under NW.js, where a plain window.open would spawn a bare
    // in-app window: hand the URL to the OS browser when the shell is available.
    const openExternalLink = (url) => {
        try {
            if (typeof nw !== 'undefined' && nw.Shell && nw.Shell.openExternal) {
                nw.Shell.openExternal(url);
                return;
            }
        } catch (e) { /* not running under NW.js */ }
        try {
            if (typeof require === 'function') {
                const gui = require('nw.gui');
                if (gui && gui.Shell && gui.Shell.openExternal) {
                    gui.Shell.openExternal(url);
                    return;
                }
            }
        } catch (e) { /* nw.gui unavailable */ }
        try { window.open(url, '_blank'); } catch (e) { /* nothing else to try */ }
    };

    // Map WASD keys for title menu navigation
    Input.keyMapper[87] = 'up';    // W
    Input.keyMapper[83] = 'down';  // S
    Input.keyMapper[65] = 'left';  // A
    Input.keyMapper[68] = 'right'; // D

    // -------------------------------------------------------------------------
    // Raw gamepad access for the shoulder buttons. RPG Maker's gamepadMapper
    // only exposes L1/R1 (as pageup/pagedown) and ignores the triggers, and the
    // mapper itself is user-remappable, so the title screen polls the pads
    // directly: L1/R1 switch background, L2/R2 zoom the Hyperverse camera.
    // -------------------------------------------------------------------------
    const PAD = {
        L1: 4, R1: 5, L2: 6, R2: 7, L3: 10, R3: 11,
        _held: {},
        pads() { return navigator.getGamepads ? (navigator.getGamepads() || []) : []; },
        connected() {
            for (const p of this.pads()) if (p && p.connected) return true;
            return false;
        },
        // Analog value 0..1 (digital buttons report 0 or 1).
        value(index) {
            let v = 0;
            for (const p of this.pads()) {
                if (!p || !p.connected || !p.buttons) continue;
                const b = p.buttons[index];
                if (!b) continue;
                const bv = typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
                if (bv > v) v = bv;
            }
            return v;
        },
        pressed(index) { return this.value(index) > 0.25; },
        // Edge-triggered: true only on the frame the button goes down.
        triggered(index) {
            const now = this.pressed(index);
            const was = !!this._held[index];
            this._held[index] = now;
            return now && !was;
        }
    };

    // -------------------------------------------------------------------------
    // Screen-adaptive layout for the title's HTML panels.
    //
    // The game renders into a fixed 1280x720 canvas that is stretched (and, on
    // an off-aspect window, letterboxed) into whatever window the player has,
    // while the menu, the disclaimer, the background switcher and the readouts
    // are DOM nodes on document.body measured in real viewport pixels. Anchored
    // to the viewport they kept their pixel size and drifted off the picture at
    // every resolution but the native one, so each panel is placed through this
    // helper instead: offsets are measured from the canvas rect and every metric
    // is given in design pixels, multiplied by the canvas scale.
    // -------------------------------------------------------------------------
    const TitleLayout = {
        // On-screen rectangle of the game canvas. Falls back to the whole window
        // while the canvas is not measurable yet (very early boot).
        rect() {
            const canvas = Graphics._canvas;
            const r = canvas ? canvas.getBoundingClientRect() : null;
            if (r && r.width > 0 && r.height > 0) {
                return { left: r.left, top: r.top, width: r.width, height: r.height };
            }
            return {
                left: 0, top: 0,
                width: window.innerWidth || Graphics.width,
                height: window.innerHeight || Graphics.height
            };
        },

        // How far the canvas is blown up from the 1280x720 design space. Clamped
        // at both ends so a small window still has readable text and a 4K one
        // does not turn the panels into slabs.
        scale(rect) {
            const r = rect || this.rect();
            const s = Math.min(r.width / Graphics.width, r.height / Graphics.height);
            if (!isFinite(s) || s <= 0) return 1;
            return Math.max(0.75, Math.min(2, s));
        },

        // Changes whenever the canvas moves or resizes, so the scene can relayout
        // only when it actually has to.
        signature() {
            const r = this.rect();
            return [r.left, r.top, r.width, r.height].map(Math.round).join(':');
        },

        // Anchor a panel to an edge or corner of the canvas. left/right/top/bottom
        // are insets in design pixels; centerY pins the panel to the canvas' own
        // vertical center rather than the window's. Returns the scale in use so
        // callers can size their own typography with it.
        place(el, opts) {
            const r = this.rect();
            const s = this.scale(r);
            if (!el) return s;
            const vw = window.innerWidth || document.documentElement.clientWidth || r.width;
            const vh = window.innerHeight || document.documentElement.clientHeight || r.height;
            // Where the panel is anchored and how far the canvas is blown up
            // are the two things the stylesheet cannot know. They are handed
            // over as custom properties; every size on the panel is a calc()
            // off --title-scale in css/theme.css.
            const st = el.style;
            el.classList.add('title-anchored');
            st.setProperty('--title-scale', String(s));
            if (opts.left != null) st.setProperty('--title-x', Math.round(r.left + opts.left * s) + 'px');
            if (opts.right != null) st.setProperty('--title-right', Math.round(vw - (r.left + r.width) + opts.right * s) + 'px');
            if (opts.top != null) st.setProperty('--title-y', Math.round(r.top + opts.top * s) + 'px');
            if (opts.bottom != null) st.setProperty('--title-bottom', Math.round(vh - (r.top + r.height) + opts.bottom * s) + 'px');
            if (opts.centerY) {
                st.setProperty('--title-y', Math.round(r.top + r.height / 2) + 'px');
                el.classList.add('title-anchored--midway');
            }
            return s;
        },

        px(v, s) { return Math.round(v * (s == null ? this.scale() : s)) + 'px'; }
    };

    // The engine fades the whole PIXI stage in (Scene_Title.start), but every
    // panel on this screen is HTML sitting above the canvas, so none of it was
    // covered by that fade and the buttons and readouts simply appeared. They are
    // faded in here instead, staggered in the order they are docked.
    //
    // The fade rides on `filter: opacity()` and not on `opacity` itself: several
    // of these panels own their opacity already (the update notice pulses, the
    // background readouts fade themselves in and out), and the two multiply
    // instead of fighting over the one property. It is run through the Web
    // Animations API rather than an inline transition or `style.animation` for
    // the same reason, so nothing a panel writes to its own style is clobbered.
    const OVERLAY_FADE_MS = 420;
    const OVERLAY_FADE_STEP = 55;   // stagger between one panel and the next

    const fadeInOverlay = (el, delay) => {
        if (!el || typeof el.animate !== 'function') return;
        try {
            el.animate(
                [{ filter: 'opacity(0)' }, { filter: 'opacity(1)' }],
                {
                    duration: OVERLAY_FADE_MS,
                    delay: Math.max(0, delay || 0),
                    easing: 'ease-out',
                    // backwards, never forwards: the panel is held transparent
                    // through its stagger and left with no filter of its own once
                    // the fade is over, so nothing lingers on the compositor.
                    fill: 'backwards'
                }
            );
        } catch (e) {
            /* No WAAPI: the panel simply appears, as it did before. */
        }
    };

    // The title is not finished the moment it first appears: Scene_Boot maximizes
    // the window (or asks for fullscreen) and the OS applies that over the next
    // frames, the canvas is resized under the scene, a 3D background builds its
    // own DOM canvas and every HTML panel is then re-placed against the settled
    // rect. All of that used to be watched happening, which is the stutter and
    // the redraw the game opens on. An opaque veil is laid over the whole window
    // before anything is built and lifted once the layout has stopped moving, so
    // the title is only ever seen finished, fading in.
    const VEIL_ID = 'title-fade-veil';
    const VEIL_FADE_MS = 620;

    const TitleVeil = {
        raise() {
            let el = document.getElementById(VEIL_ID);
            if (!el) {
                el = document.createElement('div');
                el.id = VEIL_ID;
                document.body.appendChild(el);
            }
            delete el.dataset.lifting;
            // Longhands and an explicit size, never the `inset` shorthand: it is
            // not honoured in this runtime and collapses the box to nothing.
            // Never in the way of a press: the panels underneath are held
            // hidden until they are placed, so nothing can be clicked by
            // mistake and nothing has to be blocked here either.
            el.className = 'title-veil';
            return el;
        },

        // animated: fade it out and take the node away afterwards. Otherwise it
        // goes at once, which is what leaving the title before it ever settled
        // (or a second title being built) has to do.
        lift(animated) {
            const el = document.getElementById(VEIL_ID);
            if (!el) return;
            if (!animated) {
                if (el.parentNode) el.parentNode.removeChild(el);
                return;
            }
            if (el.dataset.lifting === '1') return;
            el.dataset.lifting = '1';
            el.style.setProperty('--title-veil-fade', `${VEIL_FADE_MS}ms`);
            el.classList.add('title-veil--fading');
            // Read a layout property so the browser starts the transition from
            // opacity 1 instead of folding both values into one recalculation.
            void el.offsetWidth;
            el.classList.add('title-veil--out');
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, VEIL_FADE_MS + 80);
        }
    };

    // Base font of the background readout panels (Hyperverse / Auto Drive). Their
    // inner type is written in em off this value, so rescaling a panel is a
    // single font-size assignment.
    const INFO_BASE_FONT = 12;

    // The Hyperverse readout is the tallest of the two (a title, a subtitle and
    // up to half a dozen stat lines) and shares the right-hand column with the
    // news panel, so it is typed a step smaller than the base. Its inner sizes
    // are em off INFO_BASE_FONT, so this single value shrinks the whole panel.
    const HYPERVERSE_INFO_FONT = 9.5;

    // -------------------------------------------------------------------------
    // Logo Image Sprite
    //
    // Drawn by PIXI in design space, so it already follows the canvas at any
    // window size; only its share of the frame is defined here. The picture is a
    // full 1280x720 plate whose wordmark sits in the middle, hence the negative
    // top offset that crops the empty band above it.
    // -------------------------------------------------------------------------
    const LOGO_WIDTH_PCT = 0.48;   // of the screen width
    const LOGO_TOP_PCT = -0.033;   // of the screen height

    class LogoSprite extends Sprite {
        constructor() {
            super();
            const bitmap = ImageManager.loadPicture('Logo');
            this.bitmap = bitmap;
            bitmap.addLoadListener(() => this.layout());
        }

        layout() {
            const bitmap = this.bitmap;
            if (!bitmap || !bitmap.width) return;
            const scale = Math.min(1, (Graphics.width * LOGO_WIDTH_PCT) / bitmap.width);
            this.scale.set(scale);
            this.x = Math.floor((Graphics.width - bitmap.width * scale) / 2);
            this.y = Math.round(Graphics.height * LOGO_TOP_PCT);
        }
    }

    // -------------------------------------------------------------------------
    // Title window layout with left-aligned text and simple styling
    // -------------------------------------------------------------------------
    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function () {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler('quickContinue', this.commandQuickContinue.bind(this));
        this._commandWindow.setHandler('storymode', this.commandStoryMode.bind(this));
        this._commandWindow.setHandler('sandboxGame', this.commandSandboxGame.bind(this));
        this._commandWindow.setHandler('minigames', this.commandMinigames.bind(this));
        this._commandWindow.setHandler('worlds', this.commandWorlds.bind(this));
        this._commandWindow.setHandler('wiki', this.commandWiki.bind(this));
        this._commandWindow.setHandler('titleMusic', this.commandTitleMusic.bind(this));
        this._commandWindow.setHandler('exitGame', this.commandExitGame.bind(this));
        const ww = Graphics.width * toPct(windowWidthPct);
        const wx = Graphics.width * toPct(windowXOffsetPct) - ww / 2;

        // Calculate required height based on number of items
        const itemHeight = this._commandWindow.itemHeight();
        const numItems = this._commandWindow.maxItems();
        const requiredHeight = numItems * itemHeight + windowPadding * 2;

        // Center the window vertically, but account for the title logo
        const titleOffset = 120; // Reduced from 200 to move window up
        const wy = titleOffset + (Graphics.height - requiredHeight - titleOffset) / 2 - 40;

        this._commandWindow.move(wx, wy);
        this._commandWindow.width = ww;
        this._commandWindow.height = requiredHeight;
        this._commandWindow.padding = windowPadding;
        this._commandWindow._itemPadding = commandPadding;
    };

    // Explore always opens on the Train start map, whatever start position the
    // database carries, so a new game begins on the intro train.
    const EXPLORE_START = { mapId: 557, x: 13, y: 5, dir: 2 };

    Scene_Title.prototype.commandNewGame = function () {
        DataManager.setupNewGame();
        // Straight into character creation: the start map's own event runs
        // the wizard at once, and the curtain keeps the map hidden until it
        // is up.
        $gameSystem._pendingCreationCurtain = true;
        $gamePlayer.reserveTransfer(
            EXPLORE_START.mapId, EXPLORE_START.x, EXPLORE_START.y, EXPLORE_START.dir, 0);
        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    };

    // One-click Continue: resumes the single most recently written save (the
    // shared autosave, a playthrough slot or a quicksave, whichever is
    // newest) without going through the Reconnect slot picker.
    Scene_Title.prototype.commandQuickContinue = function () {
        const savefileId = (window.SaveSystem && window.SaveSystem.mostRecentSaveId)
            ? window.SaveSystem.mostRecentSaveId() : -1;
        if (savefileId < 0) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playLoad();
        this._commandWindow.close();
        this.fadeOutAll();
        DataManager.loadGame(savefileId)
            .then(() => {
                $gameSystem.onAfterLoad();
                if ($gameSystem.versionId() !== $dataSystem.versionId) {
                    const mapId = $gameMap.mapId();
                    const x = $gamePlayer.x;
                    const y = $gamePlayer.y;
                    const d = $gamePlayer.direction();
                    $gamePlayer.reserveTransfer(mapId, x, y, d, 0);
                    $gamePlayer.requestMapReload();
                }
                SceneManager.goto(Scene_Map);
            })
            .catch((error) => {
                console.error(error);
                SoundManager.playBuzzer();
                this._commandWindow.open();
                this.startFadeIn(this.slowFadeSpeed(), false);
            });
    };

    // Story mode: resumes the story band's newest save when one exists, and
    // otherwise begins a new story run. The entry is named Story mode either
    // way.
    Scene_Title.prototype.commandStoryMode = function () {
        if (!storyModeAvailable()) {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
            return;
        }
        if (hasStoryMainSave() && window.SaveSystem.latestStorySlot) {
            const slot = window.SaveSystem.latestStorySlot();
            if (slot >= 0) {
                SoundManager.playLoad();
                this._commandWindow.close();
                this.fadeOutAll();
                DataManager.loadGame(slot).then(() => {
                    $gameSystem.onAfterLoad();
                    SceneManager.goto(Scene_Map);
                }).catch(() => {
                    SoundManager.playBuzzer();
                    this._commandWindow.open();
                    this.startFadeIn(this.slowFadeSpeed(), false);
                });
                return;
            }
        }
        this._commandWindow.close();
        this.fadeOutAll();
        if (!hasActiveWorld()) {
            createStoryWorld().then(() => {
                this.startStoryRun();
            }).catch(e => {
                console.error('[Titlescreen] Story world creation failed', e);
                SoundManager.playBuzzer();
                this._commandWindow.open();
                this.startFadeIn(this.slowFadeSpeed(), false);
            });
            return;
        }
        this.startStoryRun();
    };

    // The story run itself, once a world is standing. Outside the canon year
    // there is no tutorial map to walk, so the run is put down on its own
    // landing and asks for the wizard itself (switch 100 is what the tutorial
    // map would have raised).
    Scene_Title.prototype.startStoryRun = function () {
        DataManager.setupNewGame();
        beginStoryRunTransfer();
        SceneManager.goto(Scene_Map);
    };

    function beginStoryRunTransfer() {
        const landing = storyModeLanding();
        // Switch 49 marks the save as a story run, whichever landing it opens on.
        $gameSwitches.setValue(STORY_MODE_SWITCH, true);
        // The story never opens on its landing either: the wizard comes first.
        $gameSystem._pendingCreationCurtain = true;
        // Switch 100 marks the run as the story's own creation wherever it
        // opens; only a landing without an event to run the wizard has to ask
        // for it itself.
        $gameSwitches.setValue(100, true);
        if (!storyModeAvailable() || !window.StoryModeStart.usesTutorialMap()) {
            $gameSystem._pendingStoryModeCreation = true;
        }
        $gamePlayer.reserveTransfer(landing.mapId, landing.x, landing.y, landing.dir || 2, 0);
    }

    Scene_Title.prototype.createStoryModeWindow = function () {
        const width = 600;
        const height = 300;
        const x = (Graphics.boxWidth - width) / 2;
        const y = (Graphics.boxHeight - height) / 2;
        const rect = new Rectangle(x, y, width, height);
        this._storyModeWindow = new Window_StoryMode(rect);
        this._storyModeWindow.setHandler('continue', this.onStoryModeContinue.bind(this));
        this._storyModeWindow.setHandler('cancel', this.onStoryModeCancel.bind(this));
        this.addChild(this._storyModeWindow);
    };

    Scene_Title.prototype.onStoryModeContinue = function () {
        this._storyModeWindow.close();
        this._commandWindow.close();
        this.fadeOutAll();
        DataManager.setupNewGame();
        beginStoryRunTransfer();
        SceneManager.goto(Scene_Map);
    };

    Scene_Title.prototype.onStoryModeCancel = function () {
        this._storyModeWindow.close();
        this._storyModeWindow.hide();
    };

    Scene_Title.prototype.commandExitGame = function () {
        SceneManager.exit();
    };

    // Arena: opens the party picker (defined in ArenaBattleHandler.js), which
    // lists every party saved in the active world plus a random option, then
    // hands off to the gauntlet. Returns to the title when the run ends.
    Scene_Title.prototype.commandArena = function () {
        if (window.Scene_ArenaPartySelect) {
            SceneManager.push(window.Scene_ArenaPartySelect);
        } else {
            console.warn("Scene_ArenaPartySelect is not defined (ArenaBattleHandler.js not loaded?)");
            this._commandWindow.activate();
        }
    };

    Scene_Title.prototype.commandWorlds = function () {
        if (window.Scene_WorldManage) {
            // One screen for both creating and managing worlds: default to the
            // manage layout, but open straight on the create form when there
            // are no worlds yet.
            const hasWorlds = window.WorldManager &&
                window.WorldManager.listWorlds().length > 0;
            window.Scene_WorldManage.prepare(hasWorlds ? 'manage' : 'create');
            SceneManager.push(window.Scene_WorldManage);
        }
    };

    // The wiki of the world the player is on: the same archive the Worlds
    // screen opens on its wiki tab, read out of the active world's own folder
    // rather than out of a savegame, so it can be read before a party exists.
    // A world is the whole of what it reads, so with none selected the entry
    // stands greyed out instead of opening an empty archive.
    function wikiAvailable() {
        return hasActiveWorld() && !!window.Scene_History &&
            !!(window.WorldManager && window.WorldManager.readWorldFile);
    }

    Scene_Title.prototype.commandWiki = function () {
        if (!wikiAvailable()) {
            this._commandWindow.activate();
            return;
        }
        const history = window.WorldManager.readWorldFile(
            window.WorldManager.activeWorldName, 'history') || {};
        if (!$gameSystem) DataManager.setupNewGame();
        $gameSystem._historicalEvents = history.events || [];
        $gameSystem._historicalHyperpowers = history.hyperpowers || {};
        SceneManager.push(window.Scene_History);
    };

    Scene_Title.prototype.commandSandboxGame = function () {
        DataManager.setupNewGame();
        $gameSystem._isSandboxMode = true;

        // Sandbox skips character creation entirely: mark the creation flow as
        // already complete and build a fixed party of Actor 5 (Eris) at level 62.
        $gameSwitches.setValue(10, true);   // Class selected
        $gameSwitches.setValue(13, true);   // Character created
        $gameSwitches.setValue(33, true);   // Creation sequence complete

        $gameParty._actors = [];
        $gameParty.addActor(5);
        const eris = $gameActors.actor(5);
        if (eris) {
            eris.changeLevel(62, false);
            eris.recoverAll();
        }
        $gameVariables.setValue(29, $gameParty.size()); // party member count

        // Sandbox always starts on the Disk of Discord (map 1421) at 9,9, the
        // same destination as the sandbox menu's "Go to Disk of Discord".
        $gamePlayer.reserveTransfer(1421, 9, 9, 2, 0);

        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    };

    // Minigames: a free-play arcade reachable straight from the title. Opens the
    // minigame picker (Scene_MinigameList); each game returns to that list.
    Scene_Title.prototype.commandMinigames = function () {
        MinigameArcade.ensureGameObjects();
        SceneManager.push(Scene_MinigameList);
    };

    // =========================================================================
    // Minigames free-play arcade
    //
    // A picker (Scene_MinigameList) that launches every stand-alone minigame in
    // the project for free. Each game is opened with SceneManager.push (directly
    // or through its own plugin command), so when the player quits the game it
    // pops straight back to this list. The camper driving system, which is a DOM
    // overlay rather than a pushable scene, is wrapped in Scene_CamperFreeplay.
    // =========================================================================
    const MinigameArcade = {
        _freshContext: false,
        // Whether a real game stands behind the $game* objects. Set by New Game
        // and by loading a save, cleared whenever the title screen comes up.
        _realGame: false,
        // Every game in the free-play list opens on the same fixed bankroll, so
        // a losing streak in one game never leaves the next one unplayable.
        STIPEND_TOKENS: 50,

        // Make sure the $game* objects exist so games that read $gameParty /
        // $gameVariables / $gameSystem don't crash when opened from the title.
        //
        // $gameParty already existing proves nothing about there being a game:
        // Scene_Boot runs DataManager.setupNewGame() before the title is ever
        // drawn, so the objects are present on a cold boot too. _realGame is the
        // only signal that decides, and a throwaway title context is re-armed
        // with the stipend on every entry.
        ensureGameObjects() {
            if (typeof $gameParty === 'undefined' || !$gameParty) {
                DataManager.createGameObjects();
            }
            this._freshContext = !this._realGame;
            // A game in progress keeps its own party, gold and items untouched.
            if (!this._freshContext) return;
            if ($gameParty.members().length === 0 && $gameParty.setupStartingMembers) {
                $gameParty.setupStartingMembers();
            }
            this.grantStipend();
        },

        // True while the arcade is running on its own throwaway context, i.e.
        // opened from the title screen with no save loaded. Wager games read
        // this to run on play money instead of the party's real inventory.
        isFreePlay() {
            return this._freshContext && !this._realGame;
        },

        // Hand out gold, tokens and arcade coins so wager-based games (scratch
        // card, slot machine, horse race, tournament) and coin-op cabinets
        // (ArcadeCabinetManager) are playable for free. Only in a fresh title
        // context, so a real save is never touched. Re-run before every launch:
        // each game starts from the same STIPEND_TOKENS bankroll.
        grantStipend() {
            if (!this._freshContext) return;
            try {
                const g = $gameParty.gold();
                if (g < 100000) $gameParty.gainGold(100000 - g);
                const TOKEN = 124; // shared betting token used by the casino games
                if ($dataItems[TOKEN]) {
                    const have = $gameParty.numItems($dataItems[TOKEN]);
                    const want = this.STIPEND_TOKENS;
                    if (have < want) $gameParty.gainItem($dataItems[TOKEN], want - have);
                    else if (have > want) $gameParty.loseItem($dataItems[TOKEN], have - want);
                }
                const arcadeParams = PluginManager.parameters('ArcadeCabinetManager') || {};
                const coinVar = parseInt(arcadeParams.coinVariable, 10) || 56;
                if ($gameVariables.value(coinVar) < 99) $gameVariables.setValue(coinVar, 99);
            } catch (e) { /* item table may lack the token id - ignore */ }
        },

        // Surfing and fishing normally read the map they are played on: its
        // <Interior>/<Exterior> note for the venue and the world clock for the
        // hour. Free play stands on no map, so the picker asks for both and
        // parks the answer here; those two plugins read it through setup().
        _setup: null,
        setSetup(cfg) { this._setup = cfg || null; },
        clearSetup() { this._setup = null; },
        setup() { return this._setup; },

        // How the Liminal World was answered for on the way in: which vehicle
        // (or none), and the world square of the place it was opened on. Read
        // once, by Scene_CamperFreeplay, and thrown away with the session.
        _liminal: null,
        setLiminal(cfg) { this._liminal = cfg || null; },
        liminal() { return this._liminal; },

        // The Liminal World hands the leader a weapon nobody picked: whatever
        // the item table happens to offer, held for the length of the session.
        // Only ever in the arcade's own throwaway context - a real party keeps
        // what it is carrying.
        equipRandomWeapon() {
            if (!this.isFreePlay()) return null;
            const actor = ($gameParty && $gameParty.leader) ? $gameParty.leader() : null;
            if (!actor || !window.$dataWeapons) return null;
            const pool = $dataWeapons.filter(w => w && w.name && actor.canEquip(w));
            if (!pool.length) return null;
            const weapon = pool[Math.randomInt(pool.length)];
            try {
                $gameParty.gainItem(weapon, 1);
                actor.changeEquip(0, weapon);
            } catch (e) {
                console.warn('[Minigames] Could not hand out a weapon:', e);
                return null;
            }
            return weapon;
        }
    };
    window.MinigameArcade = MinigameArcade;

    // Starting or loading a real game replaces the throwaway context the arcade
    // built, so the free-play flag must not survive into it: an in-game casino
    // has to spend the party's own tokens.
    //
    // Boot runs setupNewGame too, before the title is ever drawn, so the flag it
    // raises there is taken back the moment the title screen is created: standing
    // on the title means no game is being played, whatever the $game* objects
    // happen to still hold.
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        MinigameArcade._realGame = true;
        MinigameArcade._freshContext = false;
        MinigameArcade.clearSetup();
        _DataManager_setupNewGame.call(this);
    };
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        MinigameArcade._realGame = true;
        MinigameArcade._freshContext = false;
        MinigameArcade.clearSetup();
        _DataManager_extractSaveContents.call(this, contents);
    };
    const _Scene_Title_arcadeCreate = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function () {
        MinigameArcade._realGame = false;
        _Scene_Title_arcadeCreate.call(this);
    };

    // Launch helpers -----------------------------------------------------------
    const hasScene = n => !!window[n];

    // Building a Hyperdeck with nothing to build it out of is not a game, so
    // free play opens the whole catalogue and hands over a machine already
    // assembled to take apart. A real save keeps whatever it had.
    function launchHyperdeck() {
        try {
            if (MinigameArcade.isFreePlay() && window.HyperDeck
                && window.HyperDeck.stockFreePlay) {
                window.HyperDeck.stockFreePlay();
            }
        } catch (e) {
            console.warn('Titlescreen: could not stock the free play Hyperdeck.', e);
        }
        SceneManager.push(window.Scene_HyperDeck);
    }
    const hasCmd = (p, c) => !!(PluginManager._commands && PluginManager._commands[p + ':' + c]);

    function launchArcade(scene, gameId) {
        // playGame reads freePlay==='true' to skip the coin cost, then pushes
        // Scene_Arcade + prepareNextScene(gameId).
        PluginManager.callCommand(scene, 'ArcadeCabinetManager', 'playGame',
            { gameId: gameId, freePlay: 'true' });
    }

    function launchLockpick() {
        const LT = window.UnlockingBlocks;
        if (!LT || !window.Scene_UnlockingBlocks) return;
        // Bypass the "needs a lockpick" gate: set the difficulty statics the
        // scene reads, neutralise the switch / self-switch writeback, then push.
        LT.difficulty = 5;
        LT.successSwitch = 0;
        LT.failureSwitch = 0;
        LT.successSelfSwitch = '';
        LT.failureSelfSwitch = '';
        LT.crimeKey = null;
        LT.currentEventId = 0;
        LT.currentMapId = (typeof $gameMap !== 'undefined' && $gameMap.mapId) ? $gameMap.mapId() : 0;
        if (LT.calculateDifficultySettings) LT.calculateDifficultySettings(5, 1.0, 1.0);
        SceneManager.push(window.Scene_UnlockingBlocks);
    }

    // A card duel with no collection behind it: both sides are dealt a deck
    // rolled out of the catalogue at the same strength, so it is an even game
    // between two strangers. Flagged as practice, which is what keeps the win
    // off the streak and stops it paying out a booster pack into a throwaway
    // title context.
    function launchCardBattle() {
        const CG = window.CardGame;
        if (!CG || !window.CardDuel) return;
        window.CardDuel.start({
            playerName: T('Titlescreen.minigame.cardBattleYou'),
            playerDeck: CG.randomDeck(16, 0.5),
            opponentName: T('Titlescreen.minigame.cardBattleFoe'),
            opponentDeck: CG.randomDeck(16, 0.5),
            practice: true
        });
    }

    function launchPiano(scene) {
        if (!window.VisualPiano || !window.VisualPiano.open) return;
        // The piano is a DOM overlay, not a scene: park the list window while it
        // is up and re-activate once the overlay closes (Esc / gamepad B).
        scene.suspendForOverlay(() => !!(window.VisualPiano && window.VisualPiano.isOpen));
        window.VisualPiano.open();
    }

    // Setup pages, shown before a game marked `setup: true` is launched. Surfing
    // and fishing build their world out of the map they are played on, and the
    // arcade has no map, so the player is asked instead of being given the
    // default (open water, whatever hour the empty world clock reads).
    const WATER_VENUES = [
        { venue: 'exterior', label: 'Titlescreen.minigameSetup.exterior' },
        { venue: 'interior', label: 'Titlescreen.minigameSetup.interior' }
    ];
    // SkyRenderer.TIME_MODES (AnimatedBattleBackgrounds): DAY 0, NIGHT 1,
    // DUSK 2, DAWN 3. The names are resolved through it when it is loaded so a
    // renumbering there carries over; the fallbacks keep the picker working
    // when it is not.
    const WATER_TIMES = [
        { mode: 'DAWN',  fallback: 3, label: 'Titlescreen.minigameSetup.morning' },
        { mode: 'DAY',   fallback: 0, label: 'Titlescreen.minigameSetup.afternoon' },
        { mode: 'DUSK',  fallback: 2, label: 'Titlescreen.minigameSetup.evening' },
        { mode: 'NIGHT', fallback: 1, label: 'Titlescreen.minigameSetup.night' }
    ];

    // How the party arrives in the Liminal World. On foot is a walk with
    // nothing in the scene to climb into; every other answer is the garage's own
    // model of the thing, ridden. `transport` only names which network's labels
    // the map is drawn with - nothing is boarded and no fare is paid. The
    // starship is not offered: fly it high enough and it leaves the world.
    const LIMINAL_VEHICLES = [
        { key: null,     label: 'Titlescreen.minigameSetup.onFoot', transport: 'walking' },
        { key: 'camper', label: 'Titlescreen.minigameSetup.camper', transport: 'camper' },
        { key: 'car',    label: 'Titlescreen.minigameSetup.car',    transport: 'carsharing' },
        { key: 'bike',   label: 'Titlescreen.minigameSetup.bike',   transport: 'bicycle' },
        { key: 'boat',   label: 'Titlescreen.minigameSetup.boat',   transport: 'boat' },
        { key: 'broom',  label: 'Titlescreen.minigameSetup.broom',  transport: 'magic_carpet' }
    ];

    // Where the borrowed travel map opens when there is no party to open it on:
    // the square the Omega Tower stands beside, the one fixed point of this
    // world (Destinations.json, "Omega Tower").
    const LIMINAL_MAP_ORIGIN = { x: 79, y: 125 };

    // What the readout calls the place the world was opened beside.
    const liminalPlaceLabel = (key) =>
        (window.WorkSystem && window.WorkSystem.destinationName)
            ? window.WorkSystem.destinationName(key) : key;

    // Only the ones there is actually a vehicle for; walking always is.
    function liminalVehicles() {
        const VM = window.VehicleModels;
        return LIMINAL_VEHICLES.filter(v => !v.key || (VM && VM.has(v.key)) || v.key === 'broom');
    }

    function timeModeId(name, fallback) {
        const modes = window.SkyRenderer && window.SkyRenderer.TIME_MODES;
        return (modes && typeof modes[name] === 'number') ? modes[name] : fallback;
    }

    // The full free-play catalogue. `avail` is evaluated when the picker opens
    // (all plugins are loaded by then), so a game whose plugin is missing is
    // simply hidden instead of crashing.
    function buildMinigameList() {
        const all = [
            { name: T('Titlescreen.minigame.arena'),                   avail: () => hasScene('Scene_ArenaPartySelect'),  run: s => SceneManager.push(window.Scene_ArenaPartySelect) },
            // The whole 3D world, free of any game: the player says how they are
            // getting about and where in Europe to be put down, and is dropped
            // beside that place with a weapon they did not choose. Nothing out
            // there fights them, and what they dig stays dug (VoxelWorldState).
            { name: T('Titlescreen.minigame.liminalWorld'),           avail: () => !!(window.VoxelWorldSystem && window.VoxelWorldSystem.startStandalone), run: s => SceneManager.push(Scene_CamperFreeplay), vehicleSetup: true },
            // A read-only tour of the star map: no ship, no bridges, no
            // refuelling or landing, just the catalog and Grand Tour (see
            // GalaxySim.openStarMapMinigame).
            { name: T('Titlescreen.minigame.galaxyMap'),               avail: () => !!(window.GalaxySim && window.GalaxySim.openStarMapMinigame), run: s => window.GalaxySim.openStarMapMinigame() },
            // No venue step: a dream rolls its own world and has no interest in
            // where the sleeper was standing when it started.
            { name: T('Titlescreen.minigame.dream'),                   avail: () => hasScene('Scene_DreamFreeplay'),     run: s => SceneManager.push(window.Scene_DreamFreeplay) },
            { name: T('Titlescreen.minigame.surfing'),                 avail: () => hasScene('Scene_SurfingGame'),       run: s => SceneManager.push(window.Scene_SurfingGame), setup: true },
            // No venue step: the range builds its own lane and reads nothing
            // off the map the player was standing on.
            { name: T('Titlescreen.minigame.targetRange'),             avail: () => hasScene('Scene_TargetRange'),       run: s => SceneManager.push(window.Scene_TargetRange) },
            { name: T('Titlescreen.minigame.pool'),                    avail: () => hasScene('Scene_Pool'),              run: s => SceneManager.push(window.Scene_Pool) },
            { name: T('Titlescreen.minigame.chess'),                   avail: () => hasCmd('ChessGame', 'startNormalChess'), run: s => PluginManager.callCommand(s, 'ChessGame', 'startNormalChess', {}) },
            { name: T('Titlescreen.minigame.bowling'),                 avail: () => hasScene('Scene_BowlingMinigame'),   run: s => SceneManager.push(window.Scene_BowlingMinigame) },
            { name: T('Titlescreen.minigame.basketball'),              avail: () => hasScene('Scene_BasketballMinigame'), run: s => SceneManager.push(window.Scene_BasketballMinigame) },
            { name: T('Titlescreen.minigame.fishing'),                 avail: () => hasScene('Scene_FishingMinigame'),   run: s => SceneManager.push(window.Scene_FishingMinigame), setup: true },
            { name: T('Titlescreen.minigame.slotMachine'),            avail: () => hasScene('Scene_SlotMachine'),       run: s => SceneManager.push(window.Scene_SlotMachine) },
            { name: T('Titlescreen.minigame.horseRace'),              avail: () => hasScene('Scene_HorseRace'),         run: s => SceneManager.push(window.Scene_HorseRace) },
            { name: T('Titlescreen.minigame.tarotReading'),           avail: () => hasCmd('AnimatedTarotReading', 'openTarot'), run: s => PluginManager.callCommand(s, 'AnimatedTarotReading', 'openTarot', {}) },
            // The scratch card opens on its own counter: the arcade entry deals
            // the free-play bankroll and lets the player pick which card to buy.
            { name: T('Titlescreen.minigame.scratchCard'),            avail: () => hasScene('Scene_ScratchCard'),       run: s => (window.openScratchCardArcade ? window.openScratchCardArcade() : SceneManager.push(window.Scene_ScratchCard)) },
            { name: T('Titlescreen.minigame.monsterTournament'),      avail: () => hasScene('Scene_MonsterTournament'), run: s => SceneManager.push(window.Scene_MonsterTournament) },
            // Free play deals BOTH sides a fresh random deck, so the title
            // screen never reads the party's own collection and nothing that
            // happens at the table is staked, banked or streaked.
            { name: T('Titlescreen.minigame.cardBattle'),             avail: () => !!(window.CardDuel && window.CardGame), run: s => launchCardBattle() },
            { name: T('Titlescreen.minigame.hyperTamer'),             avail: () => hasScene('Scene_HyperTamer'),        run: s => SceneManager.push(window.Scene_HyperTamer) },
            { name: T('Titlescreen.minigame.hyperdeck'),              avail: () => hasScene('Scene_HyperDeck'),         run: s => launchHyperdeck() },
            { name: T('Titlescreen.minigame.periodicTable'),          avail: () => hasScene('Scene_PeriodicTable'),     run: s => SceneManager.push(window.Scene_PeriodicTable) },
            { name: T('Titlescreen.minigame.boosterPack'),            avail: () => hasCmd('BoosterPackSystem', 'openBoosterPack'), run: s => PluginManager.callCommand(s, 'BoosterPackSystem', 'openBoosterPack', {}) },
            { name: T('Titlescreen.minigame.lockpick'),                avail: () => !!(window.UnlockingBlocks && window.Scene_UnlockingBlocks), run: s => launchLockpick() },
            { name: T('Titlescreen.minigame.arcadeSnake'),           avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiSnake') },
            { name: T('Titlescreen.minigame.arcadeFrogger'),         avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiFrogger') },
            { name: T('Titlescreen.minigame.arcadeBubblePop'),      avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'ArcadeBubblePop') },
            { name: T('Titlescreen.minigame.arcadeSpaceInvaders'),  avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiSpaceInvaders') },
            { name: T('Titlescreen.minigame.arcadeBreakout'),        avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiBreakout') },
            { name: T('Titlescreen.minigame.arcadeManpac'),          avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'Manpac') }, // i18n-ignore: arcade cabinet game id
            { name: T('Titlescreen.minigame.arcadeAsteroids'),       avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiAsteroids') },
            { name: T('Titlescreen.minigame.arcadeCentipede'),       avail: () => hasCmd('ArcadeCabinetManager', 'playGame'), run: s => launchArcade(s, 'AsciiCentipede') },
            { name: T('Titlescreen.minigame.piano'),                   avail: () => !!(window.VisualPiano && window.VisualPiano.open), run: s => launchPiano(s) }
        ];
        // A catalogue this long is only findable in one order, and it is not the
        // order it was written in: the list is dealt alphabetically in whatever
        // language it is being read in.
        const collator = (typeof Intl !== 'undefined' && Intl.Collator)
            ? new Intl.Collator(ConfigManager.language || 'en') : null;
        return all
            .filter(e => { try { return e.avail(); } catch (_) { return false; } })
            .sort((a, b) => collator ? collator.compare(a.name, b.name)
                                     : String(a.name).localeCompare(String(b.name)));
    }

    // ----------------------------------------------------------------------
    // Gallery placeholders
    // ----------------------------------------------------------------------
    // No minigame ships a cover picture, and the catalogue is far too long to
    // hand-draw one each, so every card gets a PLACEHOLDER: a small SVG cover
    // built out of the game's own name. The same name always draws the same
    // cover, so a game keeps its face between sessions, and a new entry gets
    // one for free the day it is added. Swapping in a real picture later is a
    // matter of giving the entry a `thumb` and nothing else.
    const MG_THUMB_W = 128;
    const MG_THUMB_H = 96;
    const MG_THUMB_CACHE = {};

    function mgHash(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // The initials the cover is stamped with: the first letter of up to two
    // words, so "Space Invaders" reads SI and "Chess" reads CH.
    function mgInitials(name) {
        const words = String(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
        if (!words.length) return '??';
        if (words.length === 1) return words[0].slice(0, 2);
        return words[0][0] + words[1][0];
    }

    function minigameThumb(name) {
        const key = String(name);
        if (MG_THUMB_CACHE[key]) return MG_THUMB_CACHE[key];
        let seed = mgHash(key);
        const rnd = () => {
            seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
            return seed / 4294967296;
        };
        // One gold family, shifted a little per game, so a wall of covers still
        // reads as one cabinet rather than a bag of sweets.
        const hue = 34 + Math.floor(rnd() * 26);
        const dim = `hsl(${hue}, 70%, 26%)`;
        const lit = `hsl(${hue}, 88%, 62%)`;
        const shapes = [];
        const kind = Math.floor(rnd() * 4);
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(rnd() * MG_THUMB_W);
            const y = Math.floor(rnd() * MG_THUMB_H);
            const r = 6 + Math.floor(rnd() * 22);
            if (kind === 0) {
                shapes.push(`<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="${dim}" stroke-width="2"/>`);
            } else if (kind === 1) {
                shapes.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${dim}" stroke-width="2"/>`);
            } else if (kind === 2) {
                shapes.push(`<path d="M${x - r} ${y + r} L${x} ${y - r} L${x + r} ${y + r} Z" fill="none" stroke="${dim}" stroke-width="2"/>`);
            } else {
                shapes.push(`<line x1="${x - r}" y1="${y - r}" x2="${x + r}" y2="${y + r}" stroke="${dim}" stroke-width="2"/>`);
            }
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MG_THUMB_W}" height="${MG_THUMB_H}" viewBox="0 0 ${MG_THUMB_W} ${MG_THUMB_H}">`
            + `<rect width="${MG_THUMB_W}" height="${MG_THUMB_H}" fill="#0b0906"/>`
            + shapes.join('')
            + `<text x="${MG_THUMB_W / 2}" y="${MG_THUMB_H / 2}" fill="${lit}" font-family="monospace" font-size="34" font-weight="bold"`
            + ` text-anchor="middle" dominant-baseline="central" letter-spacing="3">${mgInitials(name)}</text>`
            + `<rect width="${MG_THUMB_W}" height="${MG_THUMB_H}" fill="none" stroke="${dim}" stroke-width="2"/>`
            + `</svg>`;
        const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        MG_THUMB_CACHE[key] = uri;
        return uri;
    }

    // The minigame picker mirrors the titlescreen menu: a DOM overlay reusing the
    // same .ts-menu-* item styling (see css/theme.css) inside centered, scrollable
    // .mg-menu-* wrappers. Push/pop recreate the scene, so the overlay is rebuilt
    // in create() and torn down in terminate(), exactly like Scene_Title's overlay.
    class Scene_MinigameList extends Scene_MenuBase {
        create() {
            super.create();
            MinigameArcade.ensureGameObjects();
            this._entries = buildMinigameList();
            this._overlayWatch = null;
            // Returning from a game recreates this scene, so a setup answered
            // for the last launch is spent here and never leaks into the next.
            MinigameArcade.clearSetup();
            MinigameArcade.setLiminal(null);
            // The travel map is borrowed for the Liminal World's "where from"
            // step, and the overlay it draws calls back into whatever scene is
            // on top: this one, once it has been taught the methods.
            if (window.FastTravelPicker) window.FastTravelPicker.install(Scene_MinigameList);
            // 'list', then 'venue' and 'time' for the games that ask, and
            // 'vehicle' for the one that asks how you are getting there.
            this._mode = 'list';
            this._pendingEntry = -1;
            this._pendingVenue = null;
            this._pendingVehicle = null;
            const last = Scene_MinigameList._lastIndex || 0;
            this._selectedIndex = Math.min(last, this._entries.length);
            this._lastRenderKey = '';
            this._rows = 1;
            this._cols = 1;
            this.createUIOverlay();
        }

        // Title and rows of the page currently on screen. Selection always
        // spans the rows plus a trailing "Back" item at rows.length.
        currentPage() {
            if (this._mode === 'venue') {
                return {
                    title: T('Titlescreen.minigameSetup.venueTitle'),
                    rows: WATER_VENUES.map(v => T(v.label))
                };
            }
            if (this._mode === 'time') {
                return {
                    title: T('Titlescreen.minigameSetup.timeTitle'),
                    rows: WATER_TIMES.map(t => T(t.label))
                };
            }
            if (this._mode === 'vehicle') {
                return {
                    title: T('Titlescreen.minigameSetup.vehicleTitle'),
                    rows: liminalVehicles().map(v => T(v.label))
                };
            }
            return {
                title: T('Titlescreen.menuOverlay.minigames'),
                rows: this._entries.map(e => e.name)
            };
        }

        createUIOverlay() {
            let container = document.getElementById('minigame-menu-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'minigame-menu-container';
                document.body.appendChild(container);
            }
            this._menuContainer = container;
            window.UIPanel.open(container);
            container.innerHTML = '';
            this.refreshOverlay();
        }

        // Rebuilding the whole list on every cursor step made the panel flicker,
        // so the rows are written once per page and a move only carries the
        // `selected` class from one of them to the next (syncSelection).
        refreshOverlay() {
            if (!this._menuContainer) return;
            const page = this.currentPage();
            const total = page.rows.length + 1; // rows + Back
            const key = this._mode + ':' + total + ':' + ConfigManager.language;
            if (this._lastRenderKey === key) {
                this.syncSelection();
                return;
            }
            this._lastRenderKey = key;

            const rows = page.rows.map((text, i) => ({ text: String(text).toUpperCase(), index: i }));
            rows.push({ text: T('Titlescreen.minigameSetup.back').toUpperCase(), index: rows.length });

            const hooks = i => `data-index="${i}"`
                + ` onmouseenter="SceneManager._scene && SceneManager._scene.onMinigameHover && SceneManager._scene.onMinigameHover(${i})"`
                + ` onclick="SceneManager._scene && SceneManager._scene.onMinigameClick && SceneManager._scene.onMinigameClick(${i})"`;

            if (this._mode === 'list') {
                // The catalogue is a gallery, read left to right: one card per
                // game, its cover above its name, the strip scrolling sideways
                // under the cursor. Nothing is stacked into columns any more,
                // so no title is ever painted on top of its neighbour.
                const cards = rows.map(r => (r.index === page.rows.length
                    ? `<div class="mg-card mg-card-back" ${hooks(r.index)}>
                           <img class="mg-card-cover" src="${minigameThumb(r.text)}" alt="">
                           <div class="mg-card-label">${r.text}</div>
                       </div>`
                    : `<div class="mg-card" ${hooks(r.index)}>
                           <img class="mg-card-cover" src="${minigameThumb(page.rows[r.index])}" alt="">
                           <div class="mg-card-label">${r.text}</div>
                       </div>`)).join('');
                this._menuContainer.innerHTML = `
                <div class="mg-menu-overlay mg-menu-gallery">
                    <div class="mg-menu-title">${String(page.title).toUpperCase()}</div>
                    <div class="mg-gallery">${cards}</div>
                </div>`;
                // A single strip: one row, every card its own column.
                this._rows = 1;
                this._cols = total;
                this._itemNodes = Array.from(this._menuContainer.querySelectorAll('.mg-card'));
                this._selectedNode = null;
                this._layoutSig = this._menuContainer.clientWidth + 'x' + this._menuContainer.clientHeight;
                this.syncSelection();
                return;
            }

            const items = rows.map(r => `
                    <div class="ts-menu-item" ${hooks(r.index)}>
                        <span class="ts-menu-text">${r.text}</span>
                    </div>`).join('');

            this._menuContainer.innerHTML = `
                <div class="mg-menu-overlay">
                    <div class="mg-menu-title">${String(page.title).toUpperCase()}</div>
                    <div class="mg-menu-list">${items}</div>
                </div>`;

            // The setup pages are two to four answers and stay a single column.
            this._rows = total;
            this._cols = 1;

            this._itemNodes = Array.from(this._menuContainer.querySelectorAll('.ts-menu-item'));
            this._selectedNode = null;
            this._layoutSig = this._menuContainer.clientWidth + 'x' + this._menuContainer.clientHeight;
            this.syncSelection();
        }

        syncSelection() {
            const nodes = this._itemNodes;
            if (!nodes || !nodes.length) return;
            const node = nodes[Math.max(0, Math.min(nodes.length - 1, this._selectedIndex))];
            if (node === this._selectedNode) return;
            if (this._selectedNode) this._selectedNode.classList.remove('selected');
            this._selectedNode = node;
            if (!node) return;
            node.classList.add('selected');
            // Only a column taller than the panel scrolls; a grid that fits does
            // not move, so this never yanks the page about under the cursor.
            if (node.scrollIntoView) {
                node.scrollIntoView(this._mode === 'list'
                    ? { block: 'nearest', inline: 'center' }
                    : { block: 'nearest' });
            }
        }

        // The grid is filled down its columns (grid-auto-flow: column over a
        // fixed row count), so an index is (column, row) and up/down stay inside
        // one column while left/right step between them, keeping the row and
        // clamping onto the last entry of a short final column.
        moveCursor(dx, dy, max) {
            // The gallery is one strip, so both axes are the same step: left and
            // right walk it, up and down do the same thing rather than nothing.
            if (this._mode === 'list') {
                const step = dx || dy;
                const next = (this._selectedIndex + step + max) % max;
                if (next === this._selectedIndex) return;
                this._selectedIndex = next;
                SoundManager.playCursor();
                this.syncSelection();
                return;
            }
            const rows = Math.max(1, this._rows || max);
            let col = Math.floor(this._selectedIndex / rows);
            let row = this._selectedIndex % rows;
            const cols = Math.max(1, Math.ceil(max / rows));

            if (dy) {
                const tall = Math.min(rows, max - col * rows); // rows in this column
                row = (row + dy + tall) % tall;
            }
            if (dx) {
                for (let i = 0; i < cols; i++) {
                    col = (col + dx + cols) % cols;
                    const tall = max - col * rows;
                    if (tall > 0) { row = Math.min(row, tall - 1); break; }
                }
            }
            const next = Math.min(max - 1, col * rows + row);
            if (next === this._selectedIndex) return;
            this._selectedIndex = next;
            SoundManager.playCursor();
            this.syncSelection();
        }

        onMinigameHover(index) {
            if (this._overlayWatch || index === this._selectedIndex) return;
            SoundManager.playCursor();
            this._selectedIndex = index;
            this.syncSelection();
        }

        // Picking a game is silent: the title and its arcade play no confirm
        // sound, only the cursor, the buzzer and the cancel.
        onMinigameClick(index) {
            if (this._overlayWatch) return;
            this._selectedIndex = index;
            this.syncSelection();
            this.confirmSelection();
        }

        confirmSelection() {
            const page = this.currentPage();
            if (this._selectedIndex === page.rows.length) { // the Back row
                this.goBack();
                return;
            }
            if (this._mode === 'vehicle') {
                this._pendingVehicle = liminalVehicles()[this._selectedIndex];
                this.openLiminalDestinationPicker();
                return;
            }
            if (this._mode === 'venue') {
                this._pendingVenue = WATER_VENUES[this._selectedIndex].venue;
                this.gotoPage('time');
                return;
            }
            if (this._mode === 'time') {
                const when = WATER_TIMES[this._selectedIndex];
                MinigameArcade.setSetup({
                    venue: this._pendingVenue,
                    timeMode: timeModeId(when.mode, when.fallback)
                });
                const entry = this._entries[this._pendingEntry];
                this._mode = 'list';
                this._selectedIndex = this._pendingEntry;
                if (entry) this.launchEntry(entry);
                return;
            }
            this.onPick(this._selectedIndex);
        }

        onPick(index) {
            Scene_MinigameList._lastIndex = index;
            const entry = this._entries[index];
            // Games that build a world out of the map they stand on ask where
            // and when before they start; everything else goes straight in.
            if (entry && entry.setup) {
                this._pendingEntry = index;
                this._pendingVenue = null;
                this.gotoPage('venue');
                return;
            }
            // The Liminal World asks how you are travelling, then where in the
            // world to be put down, before it opens anything.
            if (entry && entry.vehicleSetup) {
                this._pendingEntry = index;
                this._pendingVehicle = null;
                this.gotoPage('vehicle');
                return;
            }
            this.launchEntry(entry);
        }

        launchEntry(entry) {
            MinigameArcade.grantStipend();
            try {
                entry.run(this);
            } catch (err) {
                console.error('[Minigames] Failed to launch "' + entry.name + '":', err);
            }
        }

        gotoPage(mode) {
            this._mode = mode;
            this._selectedIndex = 0;
            this.refreshOverlay();
        }

        // Back walks the setup pages in reverse before it leaves the arcade.
        goBack() {
            if (this._mode === 'time') {
                this.gotoPage('venue');
                return;
            }
            if (this._mode === 'vehicle' || this._mode === 'venue') {
                this._mode = 'list';
                this._selectedIndex = this._pendingEntry >= 0 ? this._pendingEntry : 0;
                this.refreshOverlay();
                return;
            }
            this.popScene();
        }

        // "Where from": the travel map, borrowed as a chooser. The party is not
        // going anywhere on it - no fare, no fuel, no journey - it is only the
        // one picture the game has of where the places are, and the Liminal
        // World is opened beside whichever of them is pointed at.
        //
        // Without the map (a build with the plugin stripped) the world still
        // opens: it falls back to the random stretch of road it always used.
        openLiminalDestinationPicker() {
            const P = window.FastTravelPicker;
            const veh = this._pendingVehicle || liminalVehicles()[0];
            if (!P || !P.open || !this.openFastTravelUIOverlay) {
                this.startLiminalWorld(null, null);
                return;
            }
            // The map centres and measures from the party's world square, and
            // the arcade's throwaway context has none. The Omega Tower is the one
            // place on this world that is always there, so the map opens on it.
            if (typeof $gameVariables !== 'undefined' &&
                !$gameVariables.value(43) && !$gameVariables.value(44)) {
                $gameVariables.setValue(43, LIMINAL_MAP_ORIGIN.x);
                $gameVariables.setValue(44, LIMINAL_MAP_ORIGIN.y);
            }
            this.suspendForOverlay(() => P.isOpen());
            P.open(this, veh.transport,
                (dest, square) => this.startLiminalWorld(dest, square),
                () => { this._mode = 'vehicle'; this._lastRenderKey = ''; this.refreshOverlay(); });
        }

        // Open the world itself: the vehicle that was chosen (or a pair of legs),
        // put down beside the square that was pointed at, with a weapon the
        // player did not pick.
        startLiminalWorld(dest, square) {
            this._overlayWatch = null;
            MinigameArcade.equipRandomWeapon();
            const veh = this._pendingVehicle || liminalVehicles()[0];
            MinigameArcade.setLiminal({
                vehicle: veh.key,
                footOnly: !veh.key,
                startTile: square || null,
                label: dest ? liminalPlaceLabel(dest.name) : null
            });
            this._mode = 'list';
            if (this._pendingEntry >= 0) this._selectedIndex = this._pendingEntry;
            const entry = this._entries[this._pendingEntry];
            if (entry) this.launchEntry(entry);
        }

        // Park the overlay while a DOM-overlay minigame (piano) is on screen;
        // stillOpen() returns false once the overlay closes, restoring the list.
        suspendForOverlay(stillOpen) {
            window.UIPanel.close(this._menuContainer);
            this._overlayWatch = stillOpen;
        }

        update() {
            super.update();

            if (this._overlayWatch) {
                if (!this._overlayWatch()) {
                    this._overlayWatch = null;
                    window.UIPanel.open(this._menuContainer);
                } else if (this.updateTravelPickerInput) {
                    // The borrowed travel map is driven with the same keys and
                    // pad it is driven with on the world map.
                    this.updateTravelPickerInput();
                }
                return; // an overlay minigame owns input while it is up
            }

            // The grid is measured, so a window resize or fullscreen toggle has
            // to deal the columns again; the signature only differs on the
            // frames where the overlay actually changed size.
            const sig = this._menuContainer
                ? this._menuContainer.clientWidth + 'x' + this._menuContainer.clientHeight
                : '';
            if (sig !== this._layoutSig) {
                this._layoutSig = sig;
                this._lastRenderKey = '';
                this.refreshOverlay();
            }

            const max = this.currentPage().rows.length + 1; // rows + Back
            if (Input.isRepeated('down')) {
                this.moveCursor(0, 1, max);
            } else if (Input.isRepeated('up')) {
                this.moveCursor(0, -1, max);
            } else if (Input.isRepeated('right')) {
                this.moveCursor(1, 0, max);
            } else if (Input.isRepeated('left')) {
                this.moveCursor(-1, 0, max);
            } else if (Input.isTriggered('ok')) {
                this.confirmSelection();
            } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.goBack();
            }
        }

        terminate() {
            super.terminate();
            if (window.FastTravelPicker && window.FastTravelPicker.isOpen()) {
                window.FastTravelPicker.close(this);
            }
            if (this._menuContainer) {
                this._menuContainer.innerHTML = '';
                window.UIPanel.close(this._menuContainer);
                this._menuContainer = null;
            }
        }
    }
    Scene_MinigameList._lastIndex = 0;
    window.Scene_MinigameList = Scene_MinigameList;

    // Wrapper scene for the Liminal World overlay so it fits the push/pop model
    // of the picker: it opens the free-play world on entry and pops back to the
    // list when the player quits with Esc / Cancel.
    class Scene_CamperFreeplay extends Scene_MenuBase {
        create() {
            super.create();
            this._camperStarted = false;
            this._exiting = false;
        }
        // MinigameArcade.liminal() is how the picker was answered on the way in:
        // what is being ridden, and the square to be put down beside. Nothing
        // there is an error when it is missing - the world falls back to the
        // camper on a random stretch of road, as it always did.
        start() {
            super.start();
            if (this._camperStarted) return;
            this._camperStarted = true;
            const sys = window.VoxelWorldSystem;
            if (sys && sys.startStandalone) {
                sys.startStandalone(() => {
                    if (this._exiting) return;
                    this._exiting = true;
                    this.popScene();
                }, MinigameArcade.liminal() || {});
            } else {
                this.popScene();
            }
        }
        terminate() {
            super.terminate();
            const sys = window.VoxelWorldSystem;
            if (sys && sys.isActive && sys.isActive()) sys.stop();
        }
    }
    window.Scene_CamperFreeplay = Scene_CamperFreeplay;


    // -------------------------------------------------------------------------
    // Window_StoryMode
    // -------------------------------------------------------------------------
    class Window_StoryMode extends Window_Command {
        constructor(rect) {
            super(rect);
        }

        makeCommandList() {
            this.addCommand(T('Titlescreen.menu.continue'), 'continue');
        }

        itemRect(index) {
            const rect = super.itemRect(index);
            // Put command at the bottom
            rect.y = this.innerHeight - this.itemHeight() - 10;
            return rect;
        }
    }

    // Override itemTextAlign to force left alignment (backup method)
    const _Window_TitleCommand_itemTextAlign = Window_TitleCommand.prototype.itemTextAlign;
    Window_TitleCommand.prototype.itemTextAlign = function () {
        return 'left';
    };

    // The title menu is set in Square, the terminal face the title screen is
    // built around, and is deliberately the one menu in the game that does not
    // wear the parchment UI serif.
    const _Window_TitleCommand_resetFontSettings = Window_TitleCommand.prototype.resetFontSettings;
    Window_TitleCommand.prototype.resetFontSettings = function () {
        _Window_TitleCommand_resetFontSettings.call(this);
        this.contents.fontFace = 'Square';
    };

    // Nothing that starts or continues a game can run without a world to put it
    // in: the history, the people, the dungeon and the savegame all live in the
    // world folder, and none is invented on the player's behalf any more. With
    // an empty world folder Explore, Reconnect, Story mode and Sandbox are greyed
    // out until one is made from the Worlds screen. The minigame arcade runs on
    // its own throwaway context and stays playable regardless.
    function hasActiveWorld() {
        return !!(window.WorldManager && window.WorldManager.activeWorldName);
    }

    // Whether there is any save at all (autosave, playthrough slot or
    // quicksave) for the one-click Continue command to jump straight into.
    function hasQuickContinueSave() {
        return !!(window.SaveSystem && window.SaveSystem.mostRecentSaveId &&
            window.SaveSystem.mostRecentSaveId() >= 0);
    }

    const _Window_TitleCommand_isContinueEnabled = Window_TitleCommand.prototype.isContinueEnabled;
    Window_TitleCommand.prototype.isContinueEnabled = function () {
        return hasActiveWorld() && _Window_TitleCommand_isContinueEnabled.call(this);
    };

    // Always start the cursor on Continue (or Reconnect, or Explore if no save
    // data exists), ignoring the engine's "remember last selected command"
    // behavior. With no world all three are disabled, so the cursor falls to
    // Worlds: the one thing the player can actually do from here.
    Window_TitleCommand.prototype.selectLast = function () {
        if (hasActiveWorld() && hasQuickContinueSave()) {
            this.selectSymbol('quickContinue');
        } else if (this.isContinueEnabled()) {
            this.selectSymbol('continue');
        } else if (hasActiveWorld()) {
            this.selectSymbol('newGame');
        } else if (storyModeAvailable()) {
            // No world yet: Story mode is the one entry that makes one.
            this.selectSymbol('storymode');
        } else {
            this.selectSymbol('worlds');
        }
    };

    // Story mode runs in every world. It used to be gated on the canon one
    // (2001, ordinary population, ordinary magic) and greyed out everywhere
    // else; now the world it is begun in only decides WHERE it begins, which is
    // what storyModeLanding() answers below.
    function storyModeAvailable() {
        return !!window.WorldManager;
    }

    // --- Where the story begins ---------------------------------------------
    // The year the world was begun in decides where the story opens:
    //   2001        map 169 at 67,33, where the story proper opens
    //   any other   Em's own starting place (her dossier's map)
    //   after 2012  the Omega Tower, the only ground left once Earth is gone
    const STORY_MODE_SWITCH = 49;
    const STORY_CANON_YEAR = 2001;
    const STORY_EARTH_LOST_YEAR = 2012; // Nibiru: 21 December 2012

    const STORY_EM_LANDING = { mapId: 722, x: 48, y: 48, dir: 2 };
    // Where Em's story opens in the canon year, both when the run begins and
    // when her sheet is finished.
    const STORY_CANON_START = { mapId: 169, x: 67, y: 33, dir: 2 };
    // The train the story opens on: Em's sheet is written aboard it, and the
    // run is handed to the map above once she is done.
    const STORY_TRAIN_START = { mapId: 557, x: 15, y: 6, dir: 2 };

    // The year the active world was begun in, which is the only thing that
    // decides which of the three landings above the story uses.
    function storyStartYear() {
        const WM = window.WorldManager;
        if (!WM || !WM.hasActiveWorld || !WM.hasActiveWorld()) return STORY_CANON_YEAR;
        const info = WM.worldInfo() || {};
        const year = Number(info.startYear);
        return isNaN(year) ? STORY_CANON_YEAR : year;
    }

    function storyTowerLanding() {
        const WMT = window.WorldMapTransfer;
        const t = (WMT && WMT.towerLanding) ? WMT.towerLanding() : { mapId: 635, x: 13, y: 38, dir: 8 };
        if (!t.dir) t.dir = 8;
        return t;
    }

    // Em's dossier is the one record that knows her starting square; the
    // constant above is only the fallback for a dossier that has gone missing.
    function storyEmLanding() {
        const presets = window.CharacterPresets;
        const list = (presets && presets.getCharacterPresets && presets.getCharacterPresets()) || [];
        const em = list.find(p => p && (p.proceduralLore === 'em' || p.loreKey === 'em' || p.name === 'Em'));
        if (em && em.mapId) return { mapId: em.mapId, x: em.x, y: em.y, dir: 2 };
        return Object.assign({}, STORY_EM_LANDING);
    }

    // Where a story run is put down when it begins. In the canon year that is
    // the map the story proper opens on, which asks for Em's sheet on arrival;
    // every other year lands on Em's own square.
    function storyModeLanding() {
        const year = storyStartYear();
        if (year > STORY_EARTH_LOST_YEAR) return storyTowerLanding();
        if (year === STORY_CANON_YEAR) return Object.assign({}, STORY_CANON_START);
        return storyEmLanding();
    }

    // Where Em is put down when her creation ends. In the canon year the story
    // proper opens on its own map, so her dossier's square is not where she
    // goes.
    function storyModeCreationLanding() {
        const year = storyStartYear();
        if (year > STORY_EARTH_LOST_YEAR) return storyTowerLanding();
        if (year === STORY_CANON_YEAR) return Object.assign({}, STORY_CANON_START);
        return storyEmLanding();
    }

    // The one answer to "where does the story begin", asked by the title screen
    // here and by the character creation wizard when Em's sheet is finished.
    window.StoryModeStart = {
        CANON_YEAR: STORY_CANON_YEAR,
        year: storyStartYear,
        landing: storyModeLanding,
        creationLanding: storyModeCreationLanding,
        TRAIN_MAP_ID: STORY_TRAIN_START.mapId,
        // The train is the one landing with an event of its own to run the
        // wizard; every other landing asks for it on arrival.
        usesTutorialMap() { return storyModeLanding().mapId === STORY_TRAIN_START.mapId; }
    };

    // Builds the canon world (2001, ordinary population, ordinary magic: the
    // creation defaults) and populates it the same way the Worlds screen does,
    // so a first-time player reaches the story without passing through it.
    async function createStoryWorld() {
        const WM = window.WorldManager;
        let base = (WM.randomWorldName && WM.randomWorldName()) || 'Story';
        let name = base;
        let n = 2;
        while (WM.worldExists(name)) name = base + ' ' + (n++);
        WM.createWorld(name, {});
        WM.setActiveWorld(name);
        if (typeof FactionDataManager !== 'undefined' &&
            FactionDataManager.instance && FactionDataManager.instance._readyPromise) {
            await FactionDataManager.instance._readyPromise;
        }
        if (window.HistoryManager) {
            window.HistoryManager.initializeWorldHistory({ years: null, seed: WM.worldInfo().seed });
        }
        WM.initializeWorld();
        await DataManager.loadGlobalInfo();
    }

    // Story mode has a savefile band of its own (SaveSystem), so the entry
    // resumes one once it has been written. It is named Story mode either way.
    // Only a main story save turns the entry into Continue story: the story
    // autosave and the quicksave band do not count.
    function hasStoryMainSave() {
        return !!(window.SaveSystem && window.SaveSystem.hasStoryMainSave &&
            window.SaveSystem.hasStoryMainSave());
    }

    function storyCommandKey(overlay) {
        const group = overlay ? 'Titlescreen.menuOverlay.' : 'Titlescreen.menu.';
        return group + (hasStoryMainSave() ? 'continueStory' : 'storyMode');
    }

    // Add the Story mode command to the title menu
Window_TitleCommand.prototype.makeCommandList = function () {
    const worldReady = hasActiveWorld();

    this.addCommand(T('Titlescreen.menu.quickContinue'), 'quickContinue',
        worldReady && hasQuickContinueSave());

    if (!hideStartOptions) {
        this.addCommand(T('Titlescreen.menu.explore'), 'newGame', worldReady);
    }

    this.addCommand(T('Titlescreen.menu.reconnect'), 'continue', this.isContinueEnabled());

    // Story mode sits under Select Party: the party comes first, the story is
    // picked once there is someone to play it with.
    this.addCommand(T(storyCommandKey(false)), 'storymode', storyModeAvailable());
    this.addCommand(T('Titlescreen.menu.minigames'), 'minigames');

    if (!hideStartOptions) {
        this.addCommand(T('Titlescreen.menu.sandbox'), 'sandboxGame', worldReady);
    }

    this.addCommand(T('Titlescreen.menu.worlds'), 'worlds');
    this.addCommand(T('Titlescreen.menu.preferences'), 'options');
    this.addCommand(T('Titlescreen.menu.mods'), 'mods');
    this.addCommand(T('Titlescreen.menu.exit'), 'exitGame');
};

    // -------------------------------------------------------------------------
    // Title music selector
    //
    // Every classical piece shipped under audio/bgm/Classical is on the dial, so
    // any of them can be the one the title opens on. The entry names the piece playing
    // and steps to the next one, so the pick is made by ear without leaving the
    // screen. Unpicked, the game always opens on the New World Symphony.
    // -------------------------------------------------------------------------
    // i18n-ignore-start  bgm tracks, named after their file
    const TITLE_MUSIC_DEFAULTS = [
        { name: 'New World Symphony',
          value: "Classical/Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - iv. al" },
        { name: 'Ode to Joy',
          value: 'Classical/Beethoven - Ode to Joy (Concert Band)' }
    ];
    // i18n-ignore-end

    const TITLE_MUSIC_EXT = /\.(ogg|m4a)_?$/i;

    // Only the classical repertoire is on the title's dial: audio/bgm/Classical
    // is walked once and every track found becomes an entry of the switcher.
    function scanTitleMusic() {
        const found = [];
        if (typeof require !== 'function') return found;
        try {
            const fs = require('fs');
            const path = require('path');
            const root = path.join(process.cwd(), 'audio', 'bgm', 'Classical');  // i18n-ignore  asset path
            const seen = {};
            const walk = (dir, prefix) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        walk(path.join(dir, entry.name), prefix + entry.name + '/');
                        continue;
                    }
                    if (!TITLE_MUSIC_EXT.test(entry.name)) continue;
                    const base = entry.name.replace(TITLE_MUSIC_EXT, '');
                    const value = prefix + base;
                    if (seen[value]) continue;   // .ogg and .m4a of the same track
                    seen[value] = true;
                    found.push({ name: base, value });
                }
            };
            walk(root, 'Classical/');  // i18n-ignore  asset path
            found.sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            return [];
        }
        return found;
    }

    // The two openers stay first and in order, so the piece the game opens on
    // is always one arrow away however many tracks the scan turns up.
    const TITLE_MUSIC = TITLE_MUSIC_DEFAULTS.concat(
        scanTitleMusic().filter(t =>
            !TITLE_MUSIC_DEFAULTS.some(d => d.value === t.value)));

    // First on the dial is Random: the title picks a different piece of the
    // repertoire every time it is shown, and it is what a fresh config opens on.
    const TITLE_MUSIC_RANDOM = '__random__';   // i18n-ignore  sentinel value
    TITLE_MUSIC.unshift({ name: null, value: TITLE_MUSIC_RANDOM });

    const TITLE_MUSIC_DEFAULT = TITLE_MUSIC_RANDOM;

    Object.defineProperty(ConfigManager, 'titleMusicName', {
        get() {
            return this._titleMusicName !== undefined
                ? this._titleMusicName : TITLE_MUSIC_DEFAULT;
        },
        set(value) { this._titleMusicName = value; },
        configurable: true
    });

    const _ConfigManager_makeData_titleMusic = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_titleMusic.call(this);
        config.titleMusicName = this.titleMusicName;
        return config;
    };

    const _ConfigManager_applyData_titleMusic = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_titleMusic.call(this, config);
        this.titleMusicName = config.titleMusicName !== undefined
            ? config.titleMusicName : TITLE_MUSIC_DEFAULT;
    };

    function titleMusicIndex() {
        const i = TITLE_MUSIC.findIndex(t => t.value === ConfigManager.titleMusicName);
        if (i >= 0) return i;
        const fallback = TITLE_MUSIC.findIndex(t => t.value === TITLE_MUSIC_DEFAULT);
        return fallback < 0 ? 0 : fallback;
    }

    function titleMusicTrackName(track) {
        return track.value === TITLE_MUSIC_RANDOM
            ? T('Titlescreen.menu.musicRandom') : track.name;
    }

    function titleMusicLabel(overlay) {
        const track = TITLE_MUSIC[titleMusicIndex()];
        const label = T(overlay ? 'Titlescreen.menuOverlay.music' : 'Titlescreen.menu.music');
        const raw = titleMusicTrackName(track);
        const name = overlay ? raw.toUpperCase() : raw;
        return label + ': ' + name;
    }

    // Random draws afresh on every play, so returning to the title is a new piece.
    function titleMusicValue() {
        const track = TITLE_MUSIC[titleMusicIndex()];
        if (track.value !== TITLE_MUSIC_RANDOM) return track.value;
        const pool = TITLE_MUSIC.filter(t => t.value !== TITLE_MUSIC_RANDOM);
        if (!pool.length) return TITLE_MUSIC_DEFAULTS[0].value;
        return pool[Math.floor(Math.random() * pool.length)].value;
    }

    // The title BGM is whichever of the three is currently picked, so the choice
    // is heard the moment it is made and again on every return to the title.
    Scene_Title.prototype.playTitleBgm = function () {
        AudioManager.playBgm({
            name: titleMusicValue(),
            volume: 55, pitch: 100, pan: 0
        });
        AudioManager.stopBgs();
        AudioManager.stopMe();
    };

    Scene_Title.prototype.commandTitleMusic = function () {
        const next = (titleMusicIndex() + 1) % TITLE_MUSIC.length;
        ConfigManager.titleMusicName = TITLE_MUSIC[next].value;
        ConfigManager.save();
        this.playTitleBgm();
        if (this._commandWindow) {
            const index = this._commandWindow.index();
            this._commandWindow.refresh();
            this._commandWindow.select(index);
            this._commandWindow.activate();
        }
        if (this.refreshUIOverlayDOM) this.refreshUIOverlayDOM();
    };
    // -------------------------------------------------------------------------
    // Terminal-style floating card with gold theme
    // -------------------------------------------------------------------------
    class FloatingCard extends PIXI.Container {
        constructor(data, cardId, lane, laneCount) {
            super();
            // Brisk drift: fast enough to keep the screen moving, slow enough
            // that the readouts stay legible on the way up.
            this._speed = 0.55 + Math.random() * 0.6;
            this._cardId = cardId; // Unique identifier for tracking connections
            // Lane assignment keeps cards in non-overlapping vertical columns so
            // they never collide with one another as they drift up.
            this._lane = (lane === undefined) ? 0 : lane;
            this._laneCount = (laneCount === undefined) ? 1 : laneCount;
            this._draw(data);
        }

        _draw({ type, dbData }) {
            const padding = 12;
            const lineHeight = 16;
            let contentWidth = 400;
            let contentHeight = padding;
            // Terminal-style text styles with gold theme (smaller sizes)
            const headerStyle = new PIXI.TextStyle({
                fontFamily: 'Square',
                fill: '#FFD700', // Gold instead of green
                fontSize: 15,
                fontWeight: 'bold'
            });

            const normalStyle = new PIXI.TextStyle({
                fontFamily: 'Square',
                fill: '#FFA500', // Orange-gold instead of cyan
                fontSize: 13,
                // Pixel-based wrapping so descriptions never overflow the card width
                wordWrap: true,
                wordWrapWidth: contentWidth - padding * 2,
                lineHeight: 16
            });

            const dimStyle = new PIXI.TextStyle({
                fontFamily: 'Square',
                fill: '#808080',
                fontSize: 11
            });

            const errorStyle = new PIXI.TextStyle({
                fontFamily: 'Square',
                fill: '#FF6B35', // Orange-red instead of pure red
                fontSize: 13,
                fontWeight: 'bold'
            });

            const elements = [];

            // Terminal header with timestamp and type
            const timestamp = new Date().toISOString().slice(11, 19);
            const header = new PIXI.Text(`[${timestamp}] QUERY_TYPE:\n${type.toUpperCase()}`, dimStyle);
            header.x = padding;
            header.y = contentHeight;
            elements.push(header);
            contentHeight += header.height + 8;

            // Terminal prompt line
            const prompt = new PIXI.Text('> ', headerStyle);
            prompt.x = padding;
            prompt.y = contentHeight;
            elements.push(prompt);

            if (['item', 'weapon', 'armor'].includes(type)) {
                // Terminal-style item display
                const nameText = new PIXI.Text(`${window.translateText(dbData.name).toUpperCase()}`, headerStyle);
                nameText.x = padding + prompt.width;
                nameText.y = contentHeight;
                elements.push(nameText);
                contentHeight += nameText.height + 10;

                // ASCII-style separator
                const separator = new PIXI.Text('='.repeat(28), dimStyle);
                separator.x = padding;
                separator.y = contentHeight;
                elements.push(separator);
                contentHeight += separator.height + 6;

                // Icon and ID reference
                const bmp = ImageManager.loadSystem('IconSet');
                const icon = new Sprite(bmp);
                const idx = dbData.iconIndex;
                icon.setFrame((idx % 16) * 32, Math.floor(idx / 16) * 32, 32, 32);
                icon.x = padding;
                icon.y = contentHeight;
                elements.push(icon);

                // Get the actual database ID instead of icon index
                const dbId = this._getDbId(type, dbData);
                const iconText = new PIXI.Text(`[ID:${dbId.toString().padStart(3, '0')}]`, dimStyle);
                iconText.x = padding + 40;
                iconText.y = contentHeight + 8;
                elements.push(iconText);

                // Move price to next line
                contentHeight += Math.max(32, iconText.height) + 6;
                const euroPrice = (dbData.price / 100).toFixed(2);
                const priceText = new PIXI.Text(`${T('Titlescreen.card.price')}: ${euroPrice}â‚¬`, errorStyle);
                priceText.x = padding;
                priceText.y = contentHeight;
                elements.push(priceText);
                contentHeight += priceText.height + 12;

                // Description with pixel-based word wrap
                const cleanDescription = window.translateText(dbData.description).replace(/\\n/g, ' ').replace(/\n/g, ' ');
                const desc = new PIXI.Text('DESC:\n' + cleanDescription, normalStyle);
                desc.x = padding;
                desc.y = contentHeight;
                elements.push(desc);
                contentHeight += desc.height + 2;

            } else if (type === 'enemy') {
                const note = dbData.note || '';
                const lv = (note.match(/LV:\s*(\d+)/i) || [])[1] || '0';
                const descTxt = (note.match(/\|\s*([^<]+)/) || [])[1] || '';

                // Terminal-style enemy display
                const nameText = new PIXI.Text(`${window.translateText(dbData.name).toUpperCase()}\n[LV.${lv}]`, headerStyle);
                nameText.x = padding + prompt.width;
                nameText.y = contentHeight;
                elements.push(nameText);
                contentHeight += nameText.height + 10;

                // ASCII-style separator
                const separator = new PIXI.Text('-'.repeat(28), dimStyle);
                separator.x = padding;
                separator.y = contentHeight;
                elements.push(separator);
                contentHeight += separator.height + 6;

                // Character image and ID reference
                const charMatch = note.match(/<Char:(\$[^>]+)>/i);
                let hasCharImage = false;

                if (charMatch) {
                    try {
                        const charFileName = charMatch[1];
                        const charBmp = ImageManager.loadBitmap('./img/characters/Monsters/', charFileName);
                        const charSprite = new Sprite(charBmp);
                        charSprite.setFrame(0, 0, 32, 32);
                        charSprite.x = padding;
                        charSprite.y = contentHeight;
                        elements.push(charSprite);
                        hasCharImage = true;
                    } catch (e) {
                        console.warn(`Failed to load character image: ${charMatch[1]}`);
                    }
                }

                // Get the actual database ID for enemy
                const dbId = this._getDbId(type, dbData);
                const charRef = new PIXI.Text(`[ID:${dbId.toString().padStart(3, '0')}]`, dimStyle);
                charRef.x = hasCharImage ? padding + 40 : padding;
                charRef.y = contentHeight + (hasCharImage ? 8 : 0);
                elements.push(charRef);
                contentHeight += Math.max(hasCharImage ? 32 : 0, charRef.height) + 12;
                // Stats in terminal format
                const st = T.obj('Titlescreen.card.stats');
                const pad3 = i => dbData.params[i].toString().padStart(3, '0');
                const stats = new PIXI.Text(
                    `${st.str}=${pad3(2)} ${st.con}=${pad3(3)} ${st.int}=${pad3(4)}\n` +
                    `${st.wis}=${pad3(5)} ${st.dex}=${pad3(6)} ${st.psi}=${pad3(7)}`,
                    errorStyle
                );
                stats.x = padding;
                stats.y = contentHeight;
                elements.push(stats);
                contentHeight += stats.height + 10;

                // Description with pixel-based word wrap
                if (descTxt.trim()) {
                    const desc = new PIXI.Text(T('Titlescreen.card.info') + ':\n' + descTxt.trim(), normalStyle);
                    desc.x = padding;
                    desc.y = contentHeight;
                    elements.push(desc);
                    contentHeight += desc.height + 2;
                }

            } else if (type === 'skill') {
                // Terminal-style skill display
                const nameText = new PIXI.Text(`${window.translateText(dbData.name).toUpperCase()}`, headerStyle);
                nameText.x = padding + prompt.width;
                nameText.y = contentHeight;
                elements.push(nameText);
                contentHeight += nameText.height + 10;

                // ASCII-style separator
                const separator = new PIXI.Text('~'.repeat(28), dimStyle);
                separator.x = padding;
                separator.y = contentHeight;
                elements.push(separator);
                contentHeight += separator.height + 6;

                // Icon and ID reference
                const bmp = ImageManager.loadSystem('IconSet');
                const icon = new Sprite(bmp);
                const idx = dbData.iconIndex;
                icon.setFrame((idx % 16) * 32, Math.floor(idx / 16) * 32, 32, 32);
                icon.x = padding;
                icon.y = contentHeight;
                elements.push(icon);

                // Get the actual database ID for skill
                const dbId = this._getDbId(type, dbData);
                const iconText = new PIXI.Text(`[ID:${dbId.toString().padStart(3, '0')}]`, dimStyle);
                iconText.x = padding + 40;
                iconText.y = contentHeight + 8;
                elements.push(iconText);
                contentHeight += Math.max(32, iconText.height) + 12;

                // Description with pixel-based word wrap
                const cleanDescription = window.translateText(dbData.description).replace(/\\n/g, ' ').replace(/\n/g, ' ');
                const desc = new PIXI.Text('EXEC:\n' + cleanDescription, normalStyle);
                desc.x = padding;
                desc.y = contentHeight;
                elements.push(desc);
                contentHeight += desc.height + 3;
            }

            // Terminal footer
            contentHeight += 8;
            const footer = new PIXI.Text('EOF', dimStyle);
            footer.x = padding;
            footer.y = contentHeight;
            elements.push(footer);
            contentHeight += footer.height + padding;

            // Draw terminal-style background with gold theme
            const g = new PIXI.Graphics();
            // Dark terminal background
            g.beginFill(0x000000, 0.9);
            // Terminal-style border (double line) in gold
            g.lineStyle(1, 0xFFD700, 0.8); // Gold border
            g.drawRect(0, 0, contentWidth, contentHeight);
            g.lineStyle(1, 0xFFD700, 0.4); // Dimmer gold inner border
            g.drawRect(2, 2, contentWidth - 4, contentHeight - 4);
            g.endFill();

            this.addChild(g);

            // Add all elements
            elements.forEach(element => {
                if (element instanceof PIXI.Text) {
                    element.resolution = 2; // Make text sharp and crispy
                }
                this.addChild(element);
            });

            // Set card dimensions and position spread across the full screen
            this.width = contentWidth;
            this.height = contentHeight;

            // Center the card inside its assigned lane; lanes are wider than the
            // card so neighbouring columns can never overlap horizontally.
            const laneW = Graphics.width / this._laneCount;
            this.x = Math.round(this._lane * laneW + (laneW - contentWidth) / 2);
            this.y = Graphics.height + Math.random() * 200;
        }

        _getDbId(type, dbData) {
            // Find the actual database ID by searching through the appropriate array
            const map = {
                enemy: $dataEnemies,
                skill: $dataSkills,
                item: $dataItems,
                weapon: $dataWeapons,
                armor: $dataArmors
            };

            const dataArray = map[type];
            for (let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] === dbData) {
                    return i;
                }
            }
            return 0; // fallback
        }

        _wrapTerminalText(text, maxChars) {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';

            words.forEach(word => {
                if ((currentLine + word).length <= maxChars) {
                    currentLine += (currentLine ? ' ' : '') + word;
                } else {
                    if (currentLine) lines.push(currentLine);
                    currentLine = word;
                    // If a single word is too long, force break it
                    if (word.length > maxChars) {
                        const chunks = [];
                        for (let i = 0; i < word.length; i += maxChars) {
                            chunks.push(word.slice(i, i + maxChars));
                        }
                        lines.push(...chunks.slice(0, -1));
                        currentLine = chunks[chunks.length - 1];
                    }
                }
            });
            if (currentLine) lines.push(currentLine);

            return lines;
        }

        update() {
            this.y -= this._speed;

            // Remove CRT flicker effects - just keep steady alpha
            this.alpha = 1.0;

            if (this.y + this.height < 0 && this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Random DB picker
    // -------------------------------------------------------------------------
    const TYPES = ['enemy', 'skill', 'item', 'weapon', 'armor'];
    function getRandomData() {
        const t = TYPES[Math.floor(Math.random() * TYPES.length)];
        const map = { enemy: $dataEnemies, skill: $dataSkills, item: $dataItems, weapon: $dataWeapons, armor: $dataArmors };
        let entry;
        let attempts = 0;
        do {
            entry = map[t][Math.floor(Math.random() * map[t].length)];
            attempts++;
        } while (
            attempts < 100 &&
            (!entry || !entry.name || entry.name.trim() === '' || entry.name.startsWith('<--'))
        );
        if (!entry || !entry.name || entry.name.trim() === '' || entry.name.startsWith('<--')) return null;
        return { type: t, dbData: entry };
    }

    // -------------------------------------------------------------------------
    // Alternative background: random 3D planets (GalaxySim planet renderer)
    // -------------------------------------------------------------------------
    let _sharedPlanetRenderer = null;
    function getPlanetRenderer() {
        if (_sharedPlanetRenderer) return _sharedPlanetRenderer;
        if (window.GalaxySim && window.GalaxySim.Renderers && window.GalaxySim.Renderers.PlanetRenderer) {
            try {
                _sharedPlanetRenderer = new window.GalaxySim.Renderers.PlanetRenderer();
            } catch (e) {
                _sharedPlanetRenderer = null;
            }
        }
        return _sharedPlanetRenderer;
    }

    const PLANET_TYPES = [
        'earth_like', 'ocean', 'desert', 'ice', 'lava_ocean', 'magma_planet',
        'gas_giant', 'hot_jupiter', 'ice_giant', 'carbon', 'diamond', 'plasma',
        'tundra', 'habitable'
    ];
    const PLANET_COLORS = [
        '#2e8b57', '#006994', '#edc9af', '#e0ffff', '#ff4500', '#dc143c',
        '#ffb366', '#ff8c00', '#4fd0e0', '#2f4f4f', '#b9f2ff', '#ff1493', '#c19a6b'
    ];
    // i18n-ignore-start: real-world astronomical catalogue. Object names,
    // constellations and spectral classes are proper nouns; the classification
    // strings double as ids and are localised at render by astroLabel().
    const PLANET_NAME_PREFIX = [
        'Kepler', 'Gliese', 'Proxima', 'Trappist', 'Wolf', 'Ross', 'HD',
        'Tau Ceti', 'Cygnus', 'Nyx', 'Erebus', 'Helios', 'Theia', 'Vega'
    ];
    // Eccentric-orbit planet/body types, mirroring GalaxySim's DataManager so the
    // displayed eccentricity matches how the sim would actually draw the orbit.
    const ECCENTRIC_PLANET_TYPES = [
        'rogue', 'comet', 'short_period_comet', 'long_period_comet'
    ];

    function makeRandomPlanet(forceType) {
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const rnd = (a, b) => a + Math.random() * (b - a);

        // Prefer the real GalaxySim planet catalog so the readout reflects the
        // same mass ranges / biomes the simulation uses; fall back to local lists.
        // `forceType`, when it names a real catalog key, pins the biome instead
        // of rolling one (used to spread the Hyperverse field across many
        // distinct biomes rather than leaving it to chance).
        const typeData = (window.GalaxySim && window.GalaxySim.PlanetTypes) || null;
        let type, biome = '', minMass = 0.1, maxMass = 5, colorHex = null;
        if (typeData) {
            type = (forceType && typeData[forceType]) ? forceType : pick(Object.keys(typeData));
            const d = typeData[type] || {};
            if (typeof d.minMass === 'number') minMass = d.minMass;
            if (typeof d.maxMass === 'number') maxMass = d.maxMass;
            biome = d.biome || '';
            if (typeof d.color === 'number') {
                colorHex = '#' + d.color.toString(16).padStart(6, '0');
            }
        } else {
            type = forceType || pick(PLANET_TYPES);
        }

        const orbitRadius = rnd(0.2, 12);            // AU
        const eccentricity = ECCENTRIC_PLANET_TYPES.includes(type)
            ? rnd(0.4, 0.85) : rnd(0, 0.2);
        const mass = rnd(minMass, maxMass);          // Earth masses
        const radius = rnd(0.4, 3.2);                // Earth radii
        // Kepler's third law around a ~1 solar-mass star (period in years).
        const period = Math.sqrt(Math.pow(orbitRadius, 3));
        // Rough equilibrium temperature for a Sun-like host (278 K at 1 AU).
        const temperature = Math.round(278 / Math.sqrt(orbitRadius));
        const atmosphere = Math.random() < 0.5;
        const moons = Math.random() < 0.4 ? Math.floor(rnd(1, 5)) : 0;

        return {
            type,
            name: `${pick(PLANET_NAME_PREFIX)}-${Math.floor(Math.random() * 900) + 100}`,
            color: colorHex || pick(PLANET_COLORS),
            biome,
            mass, radius, orbitRadius, eccentricity, period, temperature, atmosphere, moons,
            _procedural: true,
            _seed: Math.floor(Math.random() * 1e6)
        };
    }

    // A floating 3D planet that slides up like the data cards and joins the
    // same connection mesh. Re-renders each frame so the sphere keeps rotating.
    class FloatingPlanet extends PIXI.Container {
        constructor(cardId) {
            super();
            this._isPlanet = true;
            this._speed = 1.5 + Math.random() * 1.5;
            this._cardId = cardId;
            this._planet = makeRandomPlanet();
            this._radius = 85 + Math.random() * 55;
            this._size = Math.ceil(this._radius * 2.8);
            this._time = Math.random() * 100;
            this._build();
        }

        _build() {
            const size = this._size;
            this._canvas = document.createElement('canvas');
            this._canvas.width = size;
            this._canvas.height = size;
            this._ctx = this._canvas.getContext('2d');

            this._renderPlanet();

            this._texture = PIXI.Texture.from(this._canvas);
            this._sprite = new PIXI.Sprite(this._texture);
            this.addChild(this._sprite);

            // Terminal-style full readout to match the card aesthetic
            const pl = k => T('Titlescreen.planet.' + k);
            const p = this._planet;
            const stat = t => ({ text: t, color: '#9fd9ff', size: 10 });
            const lines = [
                { text: p.name.toUpperCase(), color: '#FFD700', size: 13, bold: true },
                { text: pl('type') + p.type.toUpperCase().replace(/_/g, ' '), color: '#FFA500', size: 11 },
                stat(`${pl('radius')} ${p.radius.toFixed(2)}  ${pl('mass')} ${p.mass.toFixed(2)}  [${pl('earth')}=1]`),
                stat(`${pl('orbit')} ${p.orbitRadius.toFixed(2)} AU  ECC ${p.eccentricity.toFixed(2)}`),
                stat(`${pl('period')} ${p.period.toFixed(2)} ${pl('years')}  TEMP ${p.temperature} K`),
                { text: `${pl('atmosphere')} ${p.atmosphere ? pl('yes') : pl('no')}  ${pl('moons')} ${p.moons}`, color: '#FFA500', size: 10 }
            ];
            if (p.biome) {
                lines.push({ text: pl('biome') + window.BiomeNames.display(p.biome).toUpperCase(), color: '#FFA500', size: 10 });
            }
            addInfoLines(this, size, lines, size - 6);

            this.x = Math.random() * Math.max(0, Graphics.width - size);
            this.y = Graphics.height + Math.random() * 200;
        }

        _renderPlanet() {
            const renderer = getPlanetRenderer();
            const size = this._size;
            this._ctx.clearRect(0, 0, size, size);
            if (!renderer) {
                // Fallback: simple shaded disc when the planet renderer is absent
                const g = this._ctx.createRadialGradient(
                    size * 0.4, size * 0.4, this._radius * 0.1,
                    size / 2, size / 2, this._radius
                );
                g.addColorStop(0, this._planet.color);
                g.addColorStop(1, '#000000');
                this._ctx.fillStyle = g;
                this._ctx.beginPath();
                this._ctx.arc(size / 2, size / 2, this._radius, 0, Math.PI * 2);
                this._ctx.fill();
                return;
            }
            const sun = { x: size / 2 - this._radius, y: size / 2 - this._radius };
            try {
                renderer.drawPlanet(
                    this._ctx, size / 2, size / 2, this._radius,
                    this._planet, this._planet._seed, this._time, sun
                );
            } catch (e) {
                // ignore a single bad frame
            }
        }

        update() {
            this.y -= this._speed;
            // Re-render only every 3rd frame to keep the WebGL cost low
            this._frame = (this._frame || 0) + 1;
            if (this._frame % 3 === 0) {
                this._time += 0.15;
                this._renderPlanet();
                if (this._texture && this._texture.baseTexture) {
                    this._texture.baseTexture.update();
                }
            }
            if (this.y + this.height < 0 && this.parent) {
                this.parent.removeChild(this);
                if (this._texture) this._texture.destroy(true);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Alternative backgrounds: stars / black holes (hardcoded) and Local Group
    // galaxies. Rendered to an offscreen canvas and floated like the planets,
    // so they join the same gold connection mesh.
    // -------------------------------------------------------------------------
    function _hexToRgbArr(hex) {
        let h = (hex || '#ffffff').replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function _rgba(hex, a) {
        const c = _hexToRgbArr(hex);
        return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    }
    function _seededRandom(seed) {
        let s = seed || 1;
        return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    }

    // Physical fields: solar masses/radii, surface temperature (K), luminosity
    // (solar) and spectral class for stars; solar masses + dimensionless spin a*
    // for black holes. `radius` stays the on-canvas draw size.
    const HARDCODED_STARS = [
        { kind: 'star', name: 'Sol', type: 'G-type Star', color: '#fff4c4', radius: 78, spectral: 'G2V', solarMass: 1.0, solarRadius: 1.0, tempK: 5778, lum: 1.0 },
        { kind: 'star', name: 'Sirius A', type: 'A-type Star', color: '#cfe6ff', radius: 74, spectral: 'A1V', solarMass: 2.06, solarRadius: 1.71, tempK: 9940, lum: 25.4 },
        { kind: 'star', name: 'Betelgeuse', type: 'Red Supergiant', color: '#ff7a4a', radius: 108, spectral: 'M1-2 Ia-ab', solarMass: 16.5, solarRadius: 764, tempK: 3600, lum: 126000 },
        { kind: 'star', name: 'Rigel', type: 'Blue Supergiant', color: '#aacaff', radius: 94, spectral: 'B8 Ia', solarMass: 21, solarRadius: 78.9, tempK: 12100, lum: 120000 },
        { kind: 'star', name: 'Vega', type: 'A-type Star', color: '#e6f0ff', radius: 70, spectral: 'A0V', solarMass: 2.14, solarRadius: 2.36, tempK: 9602, lum: 40.1 },
        { kind: 'star', name: 'Antares', type: 'Red Supergiant', color: '#ff5530', radius: 104, spectral: 'M1.5 Iab', solarMass: 12, solarRadius: 680, tempK: 3660, lum: 75900 },
        { kind: 'star', name: 'Polaris', type: 'Yellow Supergiant', color: '#fff0d0', radius: 84, spectral: 'F7 Ib', solarMass: 5.4, solarRadius: 37.5, tempK: 6015, lum: 1260 },
        { kind: 'star', name: 'Proxima Centauri', type: 'Red Dwarf', color: '#ff8866', radius: 54, spectral: 'M5.5Ve', solarMass: 0.122, solarRadius: 0.154, tempK: 3042, lum: 0.0017 },
        { kind: 'star', name: 'PSR B1919+21', type: 'Pulsar', exoticType: 'PULSAR', color: '#aef0ff', radius: 46, spectral: 'PSR J1921+2153', solarMass: 1.4, solarRadius: 0.00002, tempK: 900000, lum: 0.005 },
        { kind: 'star', name: 'SGR 1806-20', type: 'Magnetar', exoticType: 'MAGNETAR', color: '#c9a0ff', radius: 48, spectral: 'SGR', solarMass: 1.8, solarRadius: 0.00002, tempK: 6.0e6, lum: 0.02 },
        { kind: 'star', name: 'WR 104', type: 'Wolf-Rayet Star', exoticType: 'WOLF_RAYET', color: '#9db4ff', radius: 72, spectral: 'WC9d', solarMass: 13, solarRadius: 3.2, tempK: 45000, lum: 120000 },
        { kind: 'star', name: 'T Tauri', type: 'Protostar', exoticType: 'PROTOSTAR', color: '#ffb36b', radius: 66, spectral: 'T Tau (YSO)', solarMass: 2.1, solarRadius: 3.3, tempK: 4900, lum: 7.3 },
        { kind: 'star', name: 'HV 2112', type: 'Thorne-Zytkow Object', exoticType: 'THORNE_ZYTKOW', color: '#ff7a52', radius: 100, spectral: 'M3 Ia (TZO cand.)', solarMass: 22, solarRadius: 900, tempK: 3200, lum: 84000 },
        { kind: 'star', name: 'CW Leonis', type: 'Carbon Star', exoticType: 'CARBON_STAR', color: '#ff5b30', radius: 88, spectral: 'C9,5e', solarMass: 0.8, solarRadius: 390, tempK: 2680, lum: 8600 },
        { kind: 'star', name: '3C 58', type: 'Quark Star Candidate', exoticType: 'QUARK_STAR', color: '#8fffe0', radius: 46, spectral: 'PSR J0205+6449', solarMass: 1.4, solarRadius: 0.00002, tempK: 1.0e6, lum: 0.01 },
        { kind: 'star', name: 'Luhman 16A', type: 'L-class Brown Dwarf', exoticType: 'L', color: '#c96b4a', radius: 50, spectral: 'L7.5', solarMass: 0.032, solarRadius: 0.1, tempK: 1350, lum: 0.00002 },
        { kind: 'star', name: 'WISE 0855-0714', type: 'Y-class Brown Dwarf', exoticType: 'Y', color: '#6b4a7a', radius: 46, spectral: 'Y4', solarMass: 0.01, solarRadius: 0.09, tempK: 250, lum: 0.0000008 },
        { kind: 'star', name: 'PSO J318.5-22', type: 'Rogue Planet', exoticType: 'ROGUE_PLANET', color: '#20242e', radius: 52, spectral: 'L7 (planetary mass)', solarMass: 0.0062, solarRadius: 0.13, tempK: 1100, lum: 0 },
        { kind: 'star', name: 'Zeta Reticuli A', type: 'Dyson Sphere Host', color: '#fff4c4', radius: 78, spectral: 'G2V', solarMass: 0.97, solarRadius: 0.94, tempK: 5730, lum: 0.79, dyson: 'active' },
        { kind: 'star', name: 'Zeta Reticuli B', type: 'Dyson Sphere Host', color: '#fff2c0', radius: 76, spectral: 'G1V', solarMass: 0.88, solarRadius: 0.86, tempK: 5410, lum: 0.71, dyson: 'active' },
        { kind: 'blackhole', name: 'Sagittarius A*', type: 'Supermassive Black Hole', color: '#ffaa44', radius: 72, bhMass: 4.3e6, bhSpin: 0.90 },
        { kind: 'blackhole', name: 'Cygnus X-1', type: 'Feeding Black Hole', color: '#88bbff', radius: 60, bhMass: 21.2, bhSpin: 0.97,
          feeding: { donorName: 'HDE 226868', donorType: 'O', donorColor: '#9bb0ff', donorRadius: 22 } },
        { kind: 'blackhole', name: 'Cygnus X-3', type: 'Microquasar (WR Donor)', color: '#9db4ff', radius: 58, bhMass: 7.2, bhSpin: 0.85,
          feeding: { donorName: 'V1521 Cygni', donorType: 'WOLF_RAYET', donorColor: '#9db4ff', donorRadius: 2.3 } },
        { kind: 'blackhole', name: 'SS 433', type: 'Microquasar', color: '#ffcc88', radius: 62, bhMass: 12, bhSpin: 0.9,
          feeding: { donorName: 'V1343 Aquilae', donorType: 'A', donorColor: '#cad7ff', donorRadius: 25 } },
        { kind: 'blackhole', name: 'M87*', type: 'Supermassive Black Hole', color: '#ffcc66', radius: 86, bhMass: 6.5e9, bhSpin: 0.90 },
        { kind: 'blackhole', name: 'TON 618', type: 'Ultramassive Black Hole', color: '#ffddaa', radius: 100, bhMass: 6.6e10, bhSpin: 0.90 },
        { kind: 'blackhole', name: 'Gargantua', type: 'Rotating Black Hole', color: '#ffbb55', radius: 92, bhMass: 1.0e8, bhSpin: 0.999 }
    ];

    // -------------------------------------------------------------------------
    // Shared readout helpers for the floating celestial captions.
    // -------------------------------------------------------------------------
    // Stack centered, stroked info lines below a body's canvas. Each line is
    // { text, color, size, bold? }.
    function addInfoLines(container, size, lines, startY) {
        let yy = (typeof startY === 'number') ? startY : size - 4;
        for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            const style = new PIXI.TextStyle({
                fontFamily: 'Square',
                fill: ln.color || '#FFA500',
                fontSize: ln.size || 10,
                fontWeight: ln.bold ? 'bold' : 'normal',
                stroke: '#000000',
                strokeThickness: 3,
                align: 'center'
            });
            const t = new PIXI.Text(ln.text, style);
            t.resolution = 2;
            t.x = (size - t.width) / 2;
            t.y = yy;
            container.addChild(t);
            yy += t.height + 1;
        }
    }

    function _fmtSolar(n) {
        if (n == null) return '?';
        if (n >= 1e4) return n.toExponential(2);
        if (n >= 100) return Math.round(n).toString();
        if (n >= 1) return n.toFixed(2);
        return n.toFixed(3);
    }

    // Schwarzschild radius (2GM/c^2 ~= 2.95 km per solar mass), auto-scaled.
    // Primordial holes are sub-kilometre, so the small end steps down to metres
    // and millimetres instead of rounding away to "0 km".
    function _fmtSchwarzschild(massSun) {
        const km = 2.95 * massSun;
        if (km >= 1.496e8) return (km / 1.496e8).toFixed(2) + ' AU';
        if (km >= 1e6) return (km / 1e6).toFixed(2) + ' Gm';
        if (km >= 1) return Math.round(km).toLocaleString() + ' km';
        if (km >= 1e-3) return (km * 1000).toFixed(2) + ' m';
        return (km * 1e6).toFixed(3) + ' mm';
    }

    function _fmtLy(ly) {
        if (ly >= 1e6) return (ly / 1e6).toFixed(2) + 'M';
        return Math.round(ly).toLocaleString();
    }

    function _fmtDistance(kly) {
        const ly = (kly || 0) * 1000;
        if (ly >= 1e6) return (ly / 1e6).toFixed(2) + ' Mly';
        return Math.round(ly).toLocaleString() + ' ly';
    }

    // Build the multi-line readout for a star, black hole or galaxy. `extra`
    // carries facts only the 3D model knows, such as whether this particular
    // hole ended up with polar jets.
    function buildCelestialInfoLines(d, extra) {
        const bd = k => T('Titlescreen.body.' + k);
        const stat = t => ({ text: t, color: '#9fd9ff', size: 10 });
        const lines = [
            { text: (d.name || '').toUpperCase(), color: '#FFD700', size: 14, bold: true },
            { text: astroLabel(d.type).toUpperCase(), color: '#FFA500', size: 11 }
        ];
        if (d.kind === 'blackhole') {
            if (d.bhMass != null) lines.push(stat(`${bd('mass')} ${d.bhMass.toExponential(2)} [${bd('sun')}=1]`));
            if (d.bhSpin != null) lines.push(stat(`${bd('spin')} a* ${d.bhSpin.toFixed(3)}`));
            if (d.bhMass != null) lines.push(stat(`${bd('schwarzschild')} ${_fmtSchwarzschild(d.bhMass)}`));
            if (extra && extra.jets != null) {
                lines.push(stat(`${bd('polarJets')} ${extra.jets ? bd('jetsActive') : bd('jetsNone')}`));
            }
        } else if (d.kind === 'galaxy') {
            if (d.diameterLy != null) lines.push(stat(`${bd('diameter')} ${_fmtLy(d.diameterLy)} ${bd('lightYears')}`));
            if (d.distanceKly != null) lines.push(stat(`${bd('distance')} ${_fmtDistance(d.distanceKly)}`));
            if (d.mass != null) lines.push(stat(`${bd('mass')} ${d.mass.toExponential(2)} [${bd('sun')}=1]`));
            if (d.arms) lines.push(stat(`${bd('arms')} ${d.arms}`));
        } else {
            // star
            if (d.spectral) lines.push(stat(`${bd('spectral')} ${d.spectral}`));
            if (d.solarMass != null) lines.push(stat(`${bd('mass')} ${_fmtSolar(d.solarMass)}  ${bd('radius')} ${_fmtSolar(d.solarRadius)}  [${bd('sun')}=1]`));
            if (d.tempK != null) lines.push(stat(`TEMP ${Math.round(d.tempK).toLocaleString()} K  LUM ${_fmtSolar(d.lum)}`));
        }
        return lines;
    }

    const LOCAL_GROUP_GALAXIES = [
        { kind: 'galaxy', name: 'Milky Way', type: 'Barred Spiral', color: '#cfd8ff', shape: 'spiral', radius: 100, diameterLy: 100000, distanceKly: 0, mass: 1.5e12, arms: 4 },
        { kind: 'galaxy', name: 'Andromeda (M31)', type: 'Spiral Galaxy', color: '#dfe6ff', shape: 'spiral', radius: 115, diameterLy: 220000, distanceKly: 2537, mass: 1.5e12, arms: 2 },
        { kind: 'galaxy', name: 'Triangulum (M33)', type: 'Spiral Galaxy', color: '#e0ffe8', shape: 'spiral', radius: 86, diameterLy: 60000, distanceKly: 2730, mass: 5e10, arms: 2 },
        { kind: 'galaxy', name: 'Large Magellanic Cloud', type: 'Dwarf Irregular', color: '#fff0d8', shape: 'irregular', radius: 70, diameterLy: 32000, distanceKly: 163, mass: 1e10 },
        { kind: 'galaxy', name: 'Small Magellanic Cloud', type: 'Dwarf Irregular', color: '#ffe8d0', shape: 'irregular', radius: 60, diameterLy: 18900, distanceKly: 200, mass: 6.5e9 },
        { kind: 'galaxy', name: 'Canis Major Dwarf', type: 'Dwarf Irregular', color: '#ffe0e0', shape: 'irregular', radius: 52, diameterLy: 5000, distanceKly: 25, mass: 1e9 },
        { kind: 'galaxy', name: 'NGC 6822', type: 'Barred Irregular', color: '#e8e0ff', shape: 'irregular', radius: 56, diameterLy: 7000, distanceKly: 1630, mass: 1.6e9 },
        { kind: 'galaxy', name: 'IC 1613', type: 'Dwarf Irregular', color: '#e0f0ff', shape: 'irregular', radius: 56, diameterLy: 10000, distanceKly: 2380, mass: 1e8 },
        { kind: 'galaxy', name: 'M32', type: 'Dwarf Elliptical', color: '#fff4e0', shape: 'elliptical', radius: 60, diameterLy: 6500, distanceKly: 2650, mass: 3e9 },
        { kind: 'galaxy', name: 'M110', type: 'Dwarf Elliptical', color: '#ffeede', shape: 'elliptical', radius: 66, diameterLy: 17000, distanceKly: 2690, mass: 1e10 }
    ];

    function _galaxyShapeFromType(t) {
        const s = String(t || '');
        if (s.indexOf('spiral') !== -1) return 'spiral';
        if (s.indexOf('elliptical') !== -1 || s.indexOf('spheroidal') !== -1) return 'elliptical';
        return 'irregular';
    }
    function _titleCaseType(t) {
        return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    function _galaxyColorHex(c) {
        if (!c) return '#cfd8ff';
        if (typeof c === 'string') return c;
        const h = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
        return '#' + h(c.r) + h(c.g) + h(c.b);
    }

    // Prefer the real GalaxySim Local Group catalog (mass, diameter, distance,
    // arms) so each floating galaxy carries its full readout; the hardcoded list
    // is the fallback when the GalaxySim data has not been loaded.
    let _galaxyPoolCache = null;
    function getGalaxyPool() {
        if (_galaxyPoolCache) return _galaxyPoolCache;
        const src = window.GalaxySim && window.GalaxySim.LocalGroupGalaxies;
        if (!Array.isArray(src) || src.length === 0) {
            _galaxyPoolCache = LOCAL_GROUP_GALAXIES;
            return _galaxyPoolCache;
        }
        _galaxyPoolCache = src.map(g => {
            const radiusKly = g.radius || 5;
            return {
                kind: 'galaxy',
                name: g.name,
                type: _titleCaseType(g.type) + ' Galaxy',
                shape: _galaxyShapeFromType(g.type),
                color: _galaxyColorHex(g.color),
                radius: Math.round(40 + Math.min(80, Math.sqrt(radiusKly) * 11)),
                diameterLy: radiusKly * 2 * 1000,
                distanceKly: g.distance,
                mass: g.mass,
                arms: g.arms || 0
            };
        });
        return _galaxyPoolCache;
    }

    // -------------------------------------------------------------------------
    // Catalogued (hardcoded) bodies. The Hyperverse background alternates every
    // act between one of these real, catalogued objects and a freshly generated
    // procedural one, so the slideshow reads as "known space" / "deep scan".
    // Planet fields mirror makeRandomPlanet() (Earth = 1 for mass and radius,
    // AU for orbits, years for periods, kelvin for temperature) and `type` is a
    // real GalaxySim PlanetTypes key so the 3D surface painter matches.
    // -------------------------------------------------------------------------
    const REAL_PLANETS = [
        { type: 'mercurian', name: 'Mercury', color: '#8c8279', biome: 'Cratered Regolith', mass: 0.055, radius: 0.383, orbitRadius: 0.387, eccentricity: 0.206, period: 0.241, temperature: 440, atmosphere: false, moons: 0 },
        { type: 'acid_ocean', name: 'Venus', color: '#e6cfa0', biome: 'Sulfuric Cloud Deck', mass: 0.815, radius: 0.949, orbitRadius: 0.723, eccentricity: 0.007, period: 0.615, temperature: 737, atmosphere: true, moons: 0 },
        { type: 'earth_like', name: 'Earth', color: '#2e7fbd', biome: 'Biosphere', mass: 1.0, radius: 1.0, orbitRadius: 1.0, eccentricity: 0.017, period: 1.0, temperature: 288, atmosphere: true, moons: 1 },
        { type: 'desert', name: 'Mars', color: '#c1573a', biome: 'Iron Oxide Desert', mass: 0.107, radius: 0.532, orbitRadius: 1.524, eccentricity: 0.093, period: 1.881, temperature: 210, atmosphere: true, moons: 2 },
        { type: 'dwarf', name: 'Ceres', color: '#9a9186', biome: 'Briny Ice Crust', mass: 0.00016, radius: 0.074, orbitRadius: 2.77, eccentricity: 0.076, period: 4.60, temperature: 168, atmosphere: false, moons: 0 },
        { type: 'gas_giant', name: 'Jupiter', color: '#d8a679', biome: 'Ammonia Banding', mass: 317.8, radius: 11.21, orbitRadius: 5.204, eccentricity: 0.049, period: 11.86, temperature: 165, atmosphere: true, moons: 95 },
        { type: 'ringed_gas_giant', name: 'Saturn', color: '#e3cd94', biome: 'Ring System', mass: 95.2, radius: 9.45, orbitRadius: 9.583, eccentricity: 0.057, period: 29.45, temperature: 134, atmosphere: true, moons: 146 },
        { type: 'ice_giant', name: 'Uranus', color: '#a8e0e6', biome: 'Methane Haze', mass: 14.5, radius: 4.01, orbitRadius: 19.19, eccentricity: 0.046, period: 84.02, temperature: 76, atmosphere: true, moons: 28 },
        { type: 'ice_giant', name: 'Neptune', color: '#3f5ec4', biome: 'Supersonic Winds', mass: 17.1, radius: 3.88, orbitRadius: 30.07, eccentricity: 0.009, period: 164.8, temperature: 72, atmosphere: true, moons: 16 },
        { type: 'dwarf', name: 'Pluto', color: '#c3a68a', biome: 'Nitrogen Glacier', mass: 0.0022, radius: 0.186, orbitRadius: 39.48, eccentricity: 0.249, period: 247.9, temperature: 44, atmosphere: true, moons: 5 },
        { type: 'ice', name: 'Europa', moon: true, color: '#d8cbb0', biome: 'Subsurface Ocean', mass: 0.008, radius: 0.245, orbitRadius: 5.204, eccentricity: 0.009, period: 0.0097, temperature: 102, atmosphere: false, moons: 0 },
        { type: 'lava_ocean', name: 'Io', moon: true, color: '#e8d14f', biome: 'Sulfur Volcanism', mass: 0.015, radius: 0.286, orbitRadius: 5.204, eccentricity: 0.004, period: 0.0048, temperature: 110, atmosphere: false, moons: 0 },
        { type: 'tundra', name: 'Titan', moon: true, color: '#c9922f', biome: 'Methane Lakes', mass: 0.0225, radius: 0.404, orbitRadius: 9.583, eccentricity: 0.029, period: 0.0437, temperature: 94, atmosphere: true, moons: 0 }
    ];

    // Real nebulae. `size` is the on-screen build scale, the rest is readout.
    const REAL_NEBULAE = [
        { name: 'Orion Nebula (M42)', sub: 'Emission Nebula', spanLy: 24, distanceLy: 1344, constellation: 'Orion', composition: 'H II, O III', size: 160, palette: [[255, 140, 150], [130, 170, 255], [200, 140, 255]] },
        { name: 'Crab Nebula (M1)', sub: 'Supernova Remnant', spanLy: 11, distanceLy: 6500, constellation: 'Taurus', composition: 'Filaments, synchrotron', size: 130, palette: [[255, 170, 90], [120, 220, 255], [255, 120, 120]] },
        { name: 'Helix Nebula (NGC 7293)', sub: 'Planetary Nebula', spanLy: 2.87, distanceLy: 655, constellation: 'Aquarius', composition: 'H alpha, O III shell', size: 120, palette: [[120, 220, 255], [255, 120, 140], [180, 255, 220]] },
        { name: 'Eagle Nebula (M16)', sub: 'Emission Nebula', spanLy: 70, distanceLy: 7000, constellation: 'Serpens', composition: 'H II, cold dust pillars', size: 170, palette: [[255, 190, 130], [140, 190, 255], [230, 140, 255]] },
        { name: 'Carina Nebula (NGC 3372)', sub: 'Emission Nebula', spanLy: 460, distanceLy: 8500, constellation: 'Carina', composition: 'H II, Wolf-Rayet winds', size: 190, palette: [[255, 130, 120], [255, 210, 150], [150, 180, 255]] },
        { name: 'Horsehead Nebula (B33)', sub: 'Dark Nebula', spanLy: 3.5, distanceLy: 1375, constellation: 'Orion', composition: 'Opaque dust, H alpha rim', size: 120, palette: [[120, 60, 90], [255, 110, 120], [70, 60, 130]] },
        { name: 'Ring Nebula (M57)', sub: 'Planetary Nebula', spanLy: 2.6, distanceLy: 2570, constellation: 'Lyra', composition: 'Ionised shell, He core', size: 110, palette: [[130, 230, 255], [255, 140, 160], [200, 255, 190]] },
        { name: 'Veil Nebula (NGC 6960)', sub: 'Supernova Remnant', spanLy: 110, distanceLy: 2400, constellation: 'Cygnus', composition: 'Shock filaments', size: 180, palette: [[140, 220, 255], [255, 130, 150], [180, 255, 210]] },
        { name: 'Tarantula Nebula (30 Dor)', sub: 'Emission Nebula', spanLy: 650, distanceLy: 160000, constellation: 'Dorado', composition: 'Starburst H II', size: 200, palette: [[255, 150, 140], [255, 200, 130], [160, 190, 255]] },
        { name: 'Lagoon Nebula (M8)', sub: 'Emission Nebula', spanLy: 110, distanceLy: 4100, constellation: 'Sagittarius', composition: 'H II, Bok globules', size: 175, palette: [[255, 130, 160], [180, 150, 255], [255, 200, 170]] },
        { name: 'Cat\'s Eye Nebula (NGC 6543)', sub: 'Planetary Nebula', spanLy: 0.2, distanceLy: 3300, constellation: 'Draco', composition: 'Concentric shells', size: 100, palette: [[150, 255, 230], [255, 160, 120], [160, 190, 255]] },
        { name: 'Rosette Nebula (NGC 2237)', sub: 'Emission Nebula', spanLy: 130, distanceLy: 5200, constellation: 'Monoceros', composition: 'H II, open cluster core', size: 185, palette: [[255, 120, 140], [255, 190, 160], [150, 170, 255]] }
    ];

    // Real galaxy clusters. Mass in solar masses, diameter in Mly.
    const REAL_CLUSTERS = [
        { name: 'Virgo Cluster', members: 1300, diamMly: 15, mass: 1.2e15, z: 0.0038, distMly: 54 },
        { name: 'Coma Cluster (Abell 1656)', members: 1000, diamMly: 20, mass: 7.0e14, z: 0.0231, distMly: 321 },
        { name: 'Perseus Cluster (Abell 426)', members: 1000, diamMly: 15, mass: 6.7e14, z: 0.0179, distMly: 240 },
        { name: 'Fornax Cluster', members: 340, diamMly: 6, mass: 7.0e13, z: 0.0046, distMly: 62 },
        { name: 'Norma Cluster (Abell 3627)', members: 600, diamMly: 20, mass: 1.0e15, z: 0.0163, distMly: 220 },
        { name: 'Hercules Cluster (Abell 2151)', members: 200, diamMly: 8, mass: 1.0e14, z: 0.0367, distMly: 500 },
        { name: 'Bullet Cluster (1E 0657-56)', members: 1000, diamMly: 12, mass: 1.5e15, z: 0.296, distMly: 3700 },
        { name: 'Abell 1689', members: 700, diamMly: 13, mass: 2.3e15, z: 0.183, distMly: 2200 },
        { name: 'El Gordo (ACT-CL J0102-4915)', members: 800, diamMly: 10, mass: 3.0e15, z: 0.870, distMly: 7000 },
        { name: 'Shapley Core (Abell 3558)', members: 1200, diamMly: 18, mass: 1.0e15, z: 0.048, distMly: 650 }
    ];

    // The catalogued half of the Hyperverse: every hardcoded body it can really
    // build, in a fixed order. A kind whose 3D builder is missing is left out,
    // so the list never offers something that would fail to frame. The playlist
    // shuffles this; the CATALOG panel lists it as it stands.
    function buildCatalogBodies() {
        const GS = window.GalaxySim || {};
        // Planets and ordinary stars need the star-map body renderer; black
        // holes, exotic stars and nebulae need the cosmos module. Galaxies and
        // clusters are built locally, so they always work.
        const hasBodies = !!(GS.Renderer3D && GS.Renderer3D.available && GS.Renderer3D.available());
        const hasCosmos = !!GS.Scene3DCosmos;
        const out = [];
        if (hasBodies) {
            for (const p of REAL_PLANETS) out.push(Object.assign({ kind: 'planet', _seed: 0 }, p));
        }
        // The star records are pushed by reference: the playlist's opener pass
        // identifies TON 618 by identity.
        for (const s of HARDCODED_STARS) {
            if (s.kind === 'blackhole') { if (hasCosmos) out.push(s); continue; }
            if (hasBodies || (s.exoticType && hasCosmos)) out.push(s);
        }
        for (const g of getGalaxyPool()) out.push(g);
        for (const c of REAL_CLUSTERS) out.push(Object.assign({ kind: 'cluster' }, c));
        if (hasCosmos) {
            for (const n of REAL_NEBULAE) out.push(Object.assign({ kind: 'nebula' }, n));
        }
        return out;
    }

    // Spectral-class table for procedurally generated stars, mirroring the
    // GalaxySim StarTypes catalog (temperature K, solar mass, solar radius).
    const PROC_STAR_CLASSES = [
        { cls: 'O', color: '#9bb0ff', temp: [30000, 52000], mass: [16, 90], radius: [6.6, 10], w: 0.02, type: 'Blue Giant' },
        { cls: 'B', color: '#aabfff', temp: [10000, 30000], mass: [2.1, 16], radius: [1.8, 6.6], w: 0.1, type: 'Blue-White Star' },
        { cls: 'A', color: '#cad7ff', temp: [7500, 10000], mass: [1.4, 2.1], radius: [1.4, 1.8], w: 0.6, type: 'A-type Star' },
        { cls: 'F', color: '#f8f7ff', temp: [6000, 7500], mass: [1.04, 1.4], radius: [1.15, 1.4], w: 3.0, type: 'Yellow-White Star' },
        { cls: 'G', color: '#fff4ea', temp: [5200, 6000], mass: [0.8, 1.04], radius: [0.96, 1.15], w: 7.6, type: 'G-type Star' },
        { cls: 'K', color: '#ffd2a1', temp: [3700, 5200], mass: [0.45, 0.8], radius: [0.7, 0.96], w: 12.1, type: 'Orange Dwarf' },
        { cls: 'M', color: '#ffb56c', temp: [2400, 3700], mass: [0.08, 0.45], radius: [0.15, 0.7], w: 76.5, type: 'Red Dwarf' }
    ];
    const PROC_STAR_PREFIX = ['HD', 'HIP', 'Gliese', 'Wolf', 'Ross', 'Lacaille', 'Luyten', 'Kruger', 'Struve', 'Kapteyn'];

    // Rare / theoretical classes, mirroring the exotic StarTypes roster. Each
    // maps to a custom Scene3DCosmos.buildExoticStar model via exoticType.
    const PROC_EXOTIC_CLASSES = [
        { x: 'NEUTRON_STAR', cls: 'NS', color: '#bae0ff', temp: [500000, 2000000], mass: [1.1, 2.2], radius: [0.00001, 0.00003], type: 'Neutron Star' },
        { x: 'PULSAR', cls: 'PSR', color: '#aef0ff', temp: [500000, 2000000], mass: [1.2, 2.1], radius: [0.00001, 0.00003], type: 'Pulsar' },
        { x: 'MAGNETAR', cls: 'SGR', color: '#c9a0ff', temp: [1e6, 1e7], mass: [1.4, 2.5], radius: [0.00001, 0.00003], type: 'Magnetar' },
        { x: 'WOLF_RAYET', cls: 'WC', color: '#9db4ff', temp: [30000, 200000], mass: [10, 25], radius: [1, 15], type: 'Wolf-Rayet Star' },
        { x: 'RED_GIANT', cls: 'K III', color: '#ff9966', temp: [3000, 4800], mass: [0.5, 8], radius: [15, 120], type: 'Red Giant' },
        { x: 'RED_SUPERGIANT', cls: 'M Ia', color: '#ff6a3c', temp: [3200, 4100], mass: [10, 40], radius: [200, 1200], type: 'Red Supergiant' },
        { x: 'HYPERGIANT', cls: 'G0 Ia+', color: '#ffe0b0', temp: [4000, 9000], mass: [20, 120], radius: [400, 1800], type: 'Hypergiant' },
        { x: 'CARBON_STAR', cls: 'C-N', color: '#ff3b1f', temp: [2400, 3200], mass: [0.8, 4], radius: [80, 500], type: 'Carbon Star' },
        { x: 'PROTOSTAR', cls: 'YSO', color: '#ffb36b', temp: [2000, 4000], mass: [0.1, 10], radius: [2, 10], type: 'Protostar' },
        { x: 'L', cls: 'L5', color: '#c96b4a', temp: [1300, 2400], mass: [0.06, 0.08], radius: [0.08, 0.15], type: 'L-class Brown Dwarf' },
        { x: 'T', cls: 'T6', color: '#9a5aa8', temp: [500, 1300], mass: [0.02, 0.07], radius: [0.08, 0.12], type: 'T-class Brown Dwarf' },
        { x: 'Y', cls: 'Y2', color: '#6b4a7a', temp: [250, 500], mass: [0.005, 0.03], radius: [0.08, 0.11], type: 'Y-class Brown Dwarf' },
        { x: 'QUARK_STAR', cls: 'QS', color: '#8fffe0', temp: [1e6, 1e7], mass: [2, 2.7], radius: [0.00001, 0.00002], type: 'Quark Star' },
        { x: 'THORNE_ZYTKOW', cls: 'TZO', color: '#ff7a52', temp: [2900, 3500], mass: [15, 30], radius: [500, 1200], type: 'Thorne-Zytkow Object' },
        { x: 'BOSON_STAR', cls: 'BS', color: '#7ad7ff', temp: [3, 30], mass: [1, 1000], radius: [0.5, 4], type: 'Boson Star' },
        { x: 'BLACK_DWARF', cls: 'BD', color: '#3a3a48', temp: [3, 100], mass: [0.4, 1.2], radius: [0.008, 0.02], type: 'Black Dwarf' },
        { x: 'IRON_STAR', cls: 'FE', color: '#8a8f9a', temp: [5, 50], mass: [0.5, 1.4], radius: [0.005, 0.02], type: 'Iron Star' },
        { x: 'QUASI_STAR', cls: 'QS+', color: '#ffc978', temp: [3500, 10000], mass: [1000, 1e7], radius: [4000, 15000], type: 'Quasi-Star' },
        { x: 'DARK_STAR', cls: 'DM', color: '#8a5adf', temp: [5000, 50000], mass: [100, 1e6], radius: [500, 10000], type: 'Dark-Matter Star' },
        { x: 'ELECTROWEAK_STAR', cls: 'EW', color: '#d4ff7a', temp: [1e7, 1e9], mass: [1.3, 2.2], radius: [0.00001, 0.00002], type: 'Electroweak Star' },
        { x: 'ROGUE_PLANET', cls: 'PL', color: '#20242e', temp: [30, 150], mass: [0.000003, 0.003], radius: [0.009, 0.11], type: 'Rogue Planet' }
    ];

    // One procedurally generated star, in the same shape as HARDCODED_STARS.
    function makeProceduralStar() {
        const rnd = (a, b) => a + Math.random() * (b - a);
        // A healthy share of procedural star acts show off the exotic roster
        // (far above their true galactic frequency - this is a showcase).
        if (Math.random() < 0.4) {
            const e = PROC_EXOTIC_CLASSES[Math.floor(Math.random() * PROC_EXOTIC_CLASSES.length)];
            const tempK = Math.round(rnd(e.temp[0], e.temp[1]));
            const solarRadius = rnd(e.radius[0], e.radius[1]);
            const solarMass = rnd(e.mass[0], e.mass[1]);
            const lum = Math.pow(Math.max(solarRadius, 0.0001), 2) * Math.pow(tempK / 5772, 4);
            const prefix = PROC_STAR_PREFIX[Math.floor(Math.random() * PROC_STAR_PREFIX.length)];
            return {
                kind: 'star',
                exoticType: e.x,
                name: `${prefix} ${100 + Math.floor(Math.random() * 9900)}`,
                type: e.type, color: e.color,
                radius: 46 + Math.min(60, Math.pow(Math.max(solarRadius, 0.0001), 0.3) * 12),
                spectral: e.cls,
                solarMass, solarRadius, tempK, lum,
                // The odd derelict megastructure shows up here too.
                dyson: (e.x === 'RED_GIANT' || e.x === 'CARBON_STAR') && Math.random() < 0.06
                    ? 'abandoned' : null
            };
        }
        const total = PROC_STAR_CLASSES.reduce((s, c) => s + c.w, 0);
        let roll = Math.random() * total;
        let cls = PROC_STAR_CLASSES[PROC_STAR_CLASSES.length - 1];
        for (const c of PROC_STAR_CLASSES) { roll -= c.w; if (roll <= 0) { cls = c; break; } }
        const tempK = Math.round(rnd(cls.temp[0], cls.temp[1]));
        const solarRadius = rnd(cls.radius[0], cls.radius[1]);
        const solarMass = rnd(cls.mass[0], cls.mass[1]);
        // Stefan-Boltzmann relative to the Sun (5772 K).
        const lum = Math.pow(solarRadius, 2) * Math.pow(tempK / 5772, 4);
        const sub = Math.floor(Math.random() * 10);
        const lumClass = solarRadius > 5 ? 'III' : (solarRadius < 0.6 ? 'Ve' : 'V');
        const prefix = PROC_STAR_PREFIX[Math.floor(Math.random() * PROC_STAR_PREFIX.length)];
        return {
            kind: 'star',
            name: `${prefix} ${100 + Math.floor(Math.random() * 9900)}`,
            type: cls.type, color: cls.color, radius: 60 + solarRadius * 4,
            spectral: `${cls.cls}${sub}${lumClass}`,
            solarMass, solarRadius, tempK, lum
        };
    }

    // Every black-hole class the Hyperverse knows about, from a primordial
    // pinhead to the ultramassive engine of a quasar, plus the fed ones that
    // arrive with a donor star being stripped. `mass` is a solar-mass range
    // (rolled log-uniformly, since the classes span sixteen decades between
    // them) and `spin` a range of the dimensionless a*.
    const BH_CLASSES = [
        { type: 'Primordial Black Hole', tag: 'PBH J', color: '#9fe8ff', mass: [1e-5, 0.6], spin: [0.00, 0.35], radius: 48 },
        { type: 'Stellar Black Hole', tag: 'XTE J', color: '#88bbff', mass: [3.2, 28], spin: [0.05, 0.90], radius: 62 },
        { type: 'Rotating Black Hole', tag: 'GRS ', color: '#ffbb55', mass: [12, 90], spin: [0.90, 0.998], radius: 66 },
        { type: 'Intermediate-Mass Black Hole', tag: 'HLX-', color: '#c9d6ff', mass: [180, 9e4], spin: [0.20, 0.90], radius: 74 },
        { type: 'Supermassive Black Hole', tag: 'SDSS J', color: '#ffcc66', mass: [1e6, 4e9], spin: [0.30, 0.98], radius: 88 },
        { type: 'Ultramassive Black Hole', tag: 'APM ', color: '#ffddaa', mass: [1e10, 7e10], spin: [0.60, 0.99], radius: 100 },
        { type: 'X-ray Binary Black Hole', tag: 'V404 ', color: '#9db4ff', mass: [6, 24], spin: [0.60, 0.99], radius: 60, donor: true },
        { type: 'Microquasar', tag: 'MAXI J', color: '#ffcc88', mass: [5, 18], spin: [0.75, 0.995], radius: 62, donor: true }
    ];
    // Donor stars a fed hole can be stripping. WOLF_RAYET has its own exotic
    // model; the rest fall through to the ordinary star builder.
    const BH_DONORS = [
        { donorType: 'O', donorColor: '#9bb0ff', donorRadius: 20 },
        { donorType: 'B', donorColor: '#b9c8ff', donorRadius: 12 },
        { donorType: 'A', donorColor: '#cad7ff', donorRadius: 6 },
        { donorType: 'WOLF_RAYET', donorColor: '#9db4ff', donorRadius: 2.3 }
    ];
    const BH_DONOR_NAMES = ['HDE ', 'V1521 ', 'V1343 ', 'BD+', 'HD ', 'GSC '];

    // One procedurally generated black hole of a randomly rolled class.
    function makeProceduralBlackHole() {
        const rnd = (a, b) => a + Math.random() * (b - a);
        const cls = BH_CLASSES[Math.floor(Math.random() * BH_CLASSES.length)];
        const bhMass = Math.pow(10, rnd(Math.log10(cls.mass[0]), Math.log10(cls.mass[1])));
        const d = {
            kind: 'blackhole',
            _procedural: true,
            name: `${cls.tag}${1000 + Math.floor(Math.random() * 8999)}`,
            type: cls.type,
            color: cls.color,
            radius: cls.radius,
            bhMass, bhSpin: rnd(cls.spin[0], cls.spin[1])
        };
        if (cls.donor) {
            const donor = BH_DONORS[Math.floor(Math.random() * BH_DONORS.length)];
            const nm = BH_DONOR_NAMES[Math.floor(Math.random() * BH_DONOR_NAMES.length)];
            d.feeding = Object.assign({
                donorName: `${nm}${100000 + Math.floor(Math.random() * 899999)}`
            }, donor);
        }
        return d;
    }

    // One procedurally generated galaxy, described with the same fields as the
    // Local Group catalog entries so both can drive the same 3D act and the
    // same readout. `_procedural` lets the builder let the model pick its own
    // arm count / bar instead of forcing catalogue values.
    const GX_PREFIX = ['NGC', 'IC', 'UGC', 'PGC', 'Messier', 'Caldwell', 'Arp', 'Maffei', 'Hyperion', 'Malin'];
    function makeProceduralGalaxy() {
        const seed = (Math.floor(Math.random() * 8e6) + 1) >>> 0;
        const rng = _seededRandom(seed + 5);
        return {
            kind: 'galaxy',
            _procedural: true,
            _seed: seed,
            name: GX_PREFIX[seed % GX_PREFIX.length] + ' ' + (1000 + (seed >>> 4) % 8000),
            type: 'Spiral Galaxy',
            shape: 'spiral',
            color: '#cfd8ff',
            radius: 90,
            diameterLy: Math.round(40000 + rng() * 160000),
            distanceKly: Math.round(150 + rng() * 60000),
            mass: 3e10 + rng() * 1.6e12
        };
    }

    // One procedurally generated galaxy cluster, in the same shape as the
    // REAL_CLUSTERS entries so both drive the same act and the same readout.
    const CL_PREFIX = ['Abell', 'MACS', 'RXC', 'SPT-CL', 'PLCK'];
    function makeProceduralCluster() {
        const seed = (Math.floor(Math.random() * 8e6) + 1) >>> 0;
        const rng = _seededRandom(seed + 11);
        const z = 0.02 + rng() * 0.3;
        return {
            kind: 'cluster',
            _procedural: true,
            _seed: seed,
            name: CL_PREFIX[seed % CL_PREFIX.length] + ' ' + (100 + Math.floor(rng() * 4000)),
            members: Math.round(120 + rng() * 2400),
            diamMly: 4 + rng() * 22,
            mass: 1e14 + rng() * 9e14,
            z,
            // Hubble distance for the rolled redshift (H0 ~ 70 km/s/Mpc, 1 Mpc =
            // 3.262 Mly), so the readout stays consistent with z.
            distMly: Math.round((z * 299792.458 / 70) * 3.262)
        };
    }

    // One procedurally generated nebula, described with the same fields as the
    // REAL_NEBULAE catalog. The nicknames deliberately avoid the real ones so a
    // generated nebula never reads as a famous object with the wrong figures.
    const NEB_SUBS = ['Emission Nebula', 'Reflection Nebula', 'Planetary Nebula', 'Supernova Remnant', 'Dark Nebula'];
    const NEB_NICKNAMES = ['Lantern', 'Hourglass', 'Chalice', 'Ember', 'Wraith', 'Kite', 'Cinder', 'Halcyon', 'Basilisk', 'Lyre', 'Moth', 'Serpent', 'Anvil', 'Thimble'];
    const NEB_CATALOGS = ['NGC', 'IC', 'Sh2', 'RCW', 'B'];
    const NEB_CONSTELLATIONS = ['Orion', 'Cygnus', 'Carina', 'Serpens', 'Vela', 'Cassiopeia', 'Monoceros', 'Sagittarius', 'Aquarius', 'Lyra', 'Taurus', 'Draco'];
    const NEB_COMPOSITION = ['H II, O III', 'H alpha, cold dust', 'Ionised shell, He core', 'Shock filaments', 'Opaque dust, H alpha rim', 'H II, Bok globules', 'Synchrotron filaments'];
    function makeProceduralNebula() {
        const seed = (Math.floor(Math.random() * 8e6) + 1) >>> 0;
        const rng = _seededRandom(seed + 3);
        const pick = arr => arr[Math.floor(rng() * arr.length)];
        const nick = pick(NEB_NICKNAMES);
        // Three bright, well separated hues, so generated nebulae do not all
        // come out in the builder's default pink / blue / violet.
        const hue0 = rng();
        const palette = [0, 1, 2].map(i => _hsvToRgb255((hue0 + i / 3 + rng() * 0.08) % 1, 0.45 + rng() * 0.3, 1));
        return {
            kind: 'nebula',
            _procedural: true,
            _seed: seed,
            name: `${nick} Nebula (${pick(NEB_CATALOGS)} ${100 + Math.floor(rng() * 7000)})`,
            sub: pick(NEB_SUBS),
            spanLy: Math.round(4 + rng() * 160),
            distanceLy: Math.round(500 + rng() * 12000),
            constellation: pick(NEB_CONSTELLATIONS),
            composition: pick(NEB_COMPOSITION),
            size: Math.round(110 + rng() * 90),
            palette
        };
    }

    // HSV -> the [r, g, b] 0-255 triples the nebula builder expects.
    function _hsvToRgb255(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
        return rgb.map(c => Math.round(c * 255));
    }

    // One higher-dimensional anomaly. Procedural only: no real catalogue has a
    // counterpart, which is exactly why it belongs to the generated pass.
    const ANOM_GEOMETRY = ['hypercube', 'hypersphere', 'mobius', 'klein'];
    const ANOM_COLORS = [0xb98cff, 0x66e0ff, 0xff77cc, 0x9cffcf, 0xffd27a];
    // i18n-ignore-end
    function makeProceduralAnomaly() {
        const seed = Math.floor(Math.random() * 1e6);
        const rng = _seededRandom(seed + 7);
        // i18n-ignore-start: designations, and the classification id localised by astroLabel()
        const names = ['The Hypercube', 'Anomaly A-700', 'Anomaly B-753', 'Anomaly C-806',
            'Singularity XN-4', 'Rift ' + (100 + Math.floor(rng() * 900))];
        return {
            kind: 'anomaly',
            _procedural: true,
            _seed: seed,
            name: names[Math.floor(rng() * names.length)],
            type: 'Higher-Dimensional Anomaly', // i18n-ignore-end
            geometry: ANOM_GEOMETRY[Math.floor(rng() * ANOM_GEOMETRY.length)],
            color: ANOM_COLORS[Math.floor(rng() * ANOM_COLORS.length)],
            scale: 60,
            flux: rng() * 9.99
        };
    }

    function drawStar2D(ctx, cx, cy, r, color, time) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, color);
        g.addColorStop(1, _rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r2 = r * (1.15 + Math.sin(time * 2) * 0.06);
        const g2 = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r2 * 1.4);
        g2.addColorStop(0, _rgba(color, 0.4));
        g2.addColorStop(1, _rgba(color, 0));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(cx, cy, r2 * 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawBlackHole(ctx, cx, cy, r, color, time) {
        ctx.save();
        // Glowing accretion disk (flattened ellipse), additive
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const rr = r * (1.0 - i * 0.13);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, 0.34);
            const g = ctx.createRadialGradient(0, 0, r * 0.42, 0, 0, rr);
            g.addColorStop(0, _rgba(color, 0));
            g.addColorStop(0.78, _rgba(color, 0.0));
            g.addColorStop(0.9, _rgba(color, 0.55));
            g.addColorStop(1, _rgba(color, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        // Event horizon
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.fill();
        // Bright photon ring
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = Math.max(2, r * 0.05);
        ctx.strokeStyle = _rgba(color, 0.95);
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    function drawGalaxyShape(ctx, cx, cy, r, color, shape, seed) {
        const rnd = _seededRandom(seed);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Bright core bulge
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.3, color);
        core.addColorStop(1, _rgba(color, 0));
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();

        if (shape === 'elliptical') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, 0.62);
            const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
            g.addColorStop(0, _rgba(color, 0.7));
            g.addColorStop(1, _rgba(color, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        } else {
            const tilt = shape === 'spiral' ? 0.5 : 0.85;
            const arms = shape === 'spiral' ? 2 : 0;
            const numStars = 650;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, tilt);
            for (let i = 0; i < numStars; i++) {
                const radius = Math.pow(rnd(), 0.6) * r;
                let angle;
                if (arms > 0) {
                    const arm = Math.floor(rnd() * arms);
                    angle = (radius / r) * 4 + arm * (Math.PI * 2 / arms) + (rnd() - 0.5) * 0.7;
                } else {
                    angle = rnd() * Math.PI * 2;
                }
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                ctx.fillStyle = _rgba(color, 0.55 * (1 - radius / r));
                const sz = rnd() * 1.6 + 0.6;
                ctx.fillRect(x, y, sz, sz);
            }
            ctx.restore();
        }
        ctx.restore();
    }

    function renderStarOrHole(ctx, size, radius, data, time) {
        const cx = size / 2, cy = size / 2;
        if (data.kind === 'blackhole') {
            drawBlackHole(ctx, cx, cy, radius, data.color, time);
            return;
        }
        let drew = false;
        const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
        if (R3D && R3D.available && R3D.available()) {
            try {
                drew = R3D.renderStar(ctx, cx, cy, radius, { name: data.name, color: data.color }, time);
            } catch (e) { drew = false; }
        }
        if (!drew) drawStar2D(ctx, cx, cy, radius, data.color, time);
    }

    function renderGalaxy(ctx, size, radius, data, time, seed) {
        drawGalaxyShape(ctx, size / 2, size / 2, radius, data.color, data.shape, seed);
    }

    // Generic floating celestial body (star, black hole or galaxy) drawn to a
    // canvas, captioned with its name and type, and joined by the gold mesh.
    class FloatingCelestial extends PIXI.Container {
        constructor(cardId, data, renderFn, opts) {
            super();
            this._isCelestial = true;
            this._speed = 1.5 + Math.random() * 1.5;
            this._cardId = cardId;
            this._data = data;
            this._renderFn = renderFn;
            this._animated = !!(opts && opts.animated);
            this._radius = data.radius || 80;
            this._size = Math.ceil(this._radius * 2.6);
            this._time = Math.random() * 100;
            this._seed = Math.floor(Math.random() * 1e6);
            this._build();
        }

        _build() {
            const size = this._size;
            this._canvas = document.createElement('canvas');
            this._canvas.width = size;
            this._canvas.height = size;
            this._ctx = this._canvas.getContext('2d');
            this._renderCanvas();

            this._texture = PIXI.Texture.from(this._canvas);
            this._sprite = new PIXI.Sprite(this._texture);
            this.addChild(this._sprite);

            addInfoLines(this, size, buildCelestialInfoLines(this._data), size - 4);

            this.x = Math.random() * Math.max(0, Graphics.width - size);
            this.y = Graphics.height + Math.random() * 200;
        }

        _renderCanvas() {
            const size = this._size;
            this._ctx.clearRect(0, 0, size, size);
            try {
                this._renderFn(this._ctx, size, this._radius, this._data, this._time, this._seed);
            } catch (e) { /* ignore a bad frame */ }
        }

        update() {
            this.y -= this._speed;
            if (this._animated) {
                this._frame = (this._frame || 0) + 1;
                if (this._frame % 3 === 0) {
                    this._time += 0.15;
                    this._renderCanvas();
                    if (this._texture && this._texture.baseTexture) this._texture.baseTexture.update();
                }
            }
            if (this.y + this.height < 0 && this.parent) {
                this.parent.removeChild(this);
                if (this._texture) this._texture.destroy(true);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Alternative background: bestiary. 2D monster sprites with name, level and
    // English description, drifting up slowly and joined by the same gold mesh.
    // -------------------------------------------------------------------------
    function getRandomMonster() {
        if (!$dataEnemies) return null;
        let entry;
        let attempts = 0;
        do {
            entry = $dataEnemies[Math.floor(Math.random() * $dataEnemies.length)];
            attempts++;
        } while (
            attempts < 100 &&
            (!entry || !entry.name || entry.name.trim() === '' || entry.name.startsWith('<--'))
        );
        if (!entry || !entry.name || entry.name.trim() === '' || entry.name.startsWith('<--')) return null;
        return entry;
    }

    // How an enemy is drawn is one setting for the whole game (the enemy battler
    // option): 1 the animated 3D model, 2 the <Char:> sprite sheet, 3 the flat
    // battler image. The bestiary background obeys it too, so the title screen
    // shows monsters exactly the way the player will meet them in battle.
    function enemyBattlerMode() {
        const modes = window.EnemyBattlerModes;
        if (!modes) return 1;
        return modes.normalize(
            (typeof ConfigManager !== 'undefined') ? ConfigManager.enemyBattlers : modes.MODEL_3D);
    }

    // True when the bestiary should be drawn as live 3D models rather than as
    // 2D cards (the mode is 3D and the Battler3D stack is actually loaded).
    function bestiaryWants3D() {
        const modes = window.EnemyBattlerModes;
        const model3d = modes ? modes.MODEL_3D : 1;
        return enemyBattlerMode() === model3d &&
            !!(window.THREE && window.Battler3D && window.Battler3D.create);
    }

    class FloatingMonster extends PIXI.Container {
        constructor(cardId, lane, laneCount) {
            super();
            this._isMonster = true;
            this._speed = 0.5 + Math.random() * 0.6; // still a touch slower than cards
            this._cardId = cardId;
            // Lane assignment keeps cards in non-overlapping vertical columns so
            // they never collide with one another as they drift up.
            this._lane = (typeof lane === 'number') ? lane : 0;
            this._laneCount = laneCount || 1;
            this._enemy = getRandomMonster();
            this._build();
        }

        _build() {
            const enemy = this._enemy;
            const layoutW = 280;          // centering reference width (no box)
            const centerX = layoutW / 2;
            const note = enemy ? (enemy.note || '') : '';
            const p = (enemy && enemy.params) || [0, 0, 0, 0, 0, 0, 0, 0];
            // Names/descriptions kept in English (the <En:> note tag) per request.
            const lv = (note.match(/<Level:\s*(\d+)>/i) || [])[1] || '0';
            const archetype = (note.match(/<Archetype:\s*([^>]+)>/i) || [])[1] || '';
            // Enemy descriptions use combinatorial {a | b | c} inline text resolved
            // (seeded from the world seed) by the shared EnemyDescription service.
            let descTxt = (note.match(/<En:\s*([^>]+)>/i) || [])[1] || '';
            if (window.EnemyDescription) {
                descTxt = enemy && enemy.id
                    ? window.EnemyDescription.describe(enemy.id)
                    : window.EnemyDescription.resolve(descTxt);
            }

            // Centered text styles (word-wrapped so long names never clip)
            const mkStyle = (fill, size, bold) => new PIXI.TextStyle({
                fontFamily: 'Square', fill, fontSize: size,
                fontWeight: bold ? 'bold' : 'normal',
                align: 'center', wordWrap: true, wordWrapWidth: layoutW, lineHeight: size + 3,
                stroke: '#000000', strokeThickness: 3
            });
            const headerStyle = mkStyle('#FFD700', 16, true);
            const lvlStyle = mkStyle('#FFD27A', 13, true);
            const statStyle = mkStyle('#9fd9ff', 11, true);
            const normalStyle = mkStyle('#FFA500', 12, false);

            const centered = (txt, style) => {
                const t = new PIXI.Text(txt, style);
                t.resolution = 2;
                t.x = 0;
                return t; // align:center spans the full layoutW
            };

            const elements = [];
            const spriteBoxH = 96;
            let yy = 0;

            // Monster sprite: the enemy battler option decides which of the two
            // flat looks leads (Sprites = the <Char:> sheet, 2D = the battler
            // image out of img/enemies); the other one still stands in when the
            // first is missing, so a card is never left empty.
            const buildCharSprite = () => {
                const charMatch = note.match(/<Char:\s*(\$[^>]+)>/i);
                if (!charMatch) return null;
                try {
                    const bmp = ImageManager.loadBitmap('./img/characters/Monsters/', charMatch[1].trim());
                    const spr = new Sprite(bmp);
                    bmp.addLoadListener(() => {
                        const fw = Math.floor(bmp.width / 3);
                        const fh = Math.floor(bmp.height / 4);
                        spr.setFrame(0, 0, fw, fh);
                        const s = Math.min(2.5, spriteBoxH / fh);
                        spr.scale.set(s, s);
                        spr.x = centerX - (fw * s) / 2;
                        spr.y = (spriteBoxH - fh * s) / 2;
                    });
                    return spr;
                } catch (e) { return null; }
            };
            const buildBattlerSprite = () => {
                const bn = enemy.battlerName;
                if (!bn) return null;
                try {
                    const bmp = ($dataSystem && $dataSystem.optSideView)
                        ? ImageManager.loadSvEnemy(bn) : ImageManager.loadEnemy(bn);
                    const spr = new Sprite(bmp);
                    bmp.addLoadListener(() => {
                        const s = Math.min(1, layoutW / bmp.width, spriteBoxH / bmp.height);
                        spr.scale.set(s, s);
                        spr.x = centerX - (bmp.width * s) / 2;
                        spr.y = (spriteBoxH - bmp.height * s) / 2;
                    });
                    return spr;
                } catch (e) { return null; }
            };
            const battlersFirst = window.EnemyBattlerModes &&
                enemyBattlerMode() === window.EnemyBattlerModes.BATTLERS_2D;
            let sprite = battlersFirst
                ? (buildBattlerSprite() || buildCharSprite())
                : (buildCharSprite() || buildBattlerSprite());
            if (sprite) {
                sprite.x = centerX - 24;
                elements.push(sprite);
            }
            yy += spriteBoxH + 6;

            const name = centered(enemy.name.toUpperCase(), headerStyle);
            name.y = yy; elements.push(name); yy += name.height + 2;

            const lvLine = archetype ? `LV ${lv}  Â·  ${archetype.toUpperCase()}` : `LV ${lv}`;
            const lvl = centered(lvLine, lvlStyle);
            lvl.y = yy; elements.push(lvl); yy += lvl.height + 4;

            // Base stats (params: HP, MP, ATK, DEF, MAT, MDF, AGI, LUK)
            const stats = centered(
                `HP ${p[0]}  MP ${p[1]}\n` +
                `ATK ${p[2]} DEF ${p[3]} MAT ${p[4]} MDF ${p[5]} AGI ${p[6]} LUK ${p[7]}`,
                statStyle
            );
            stats.y = yy; elements.push(stats); yy += stats.height + 4;

            if (descTxt.trim()) {
                const desc = centered(descTxt.trim(), normalStyle);
                desc.y = yy; elements.push(desc); yy += desc.height;
            }

            // Solid black backing panel (with a subtle gold edge) so each card is
            // readable and visually separated from the others.
            const padX = 16, padTop = 10, padBot = 12;
            const bg = new PIXI.Graphics();
            bg.beginFill(0x000000, 0.85);
            bg.lineStyle(2, 0xFFD700, 0.45);
            bg.drawRoundedRect(-padX, -padTop, layoutW + padX * 2, yy + padTop + padBot, 10);
            bg.endFill();
            this.addChild(bg);
            elements.forEach(el => this.addChild(el));

            // Center the card inside its assigned lane; lanes are wider than the
            // card so neighbouring columns can never overlap.
            const laneW = Graphics.width / this._laneCount;
            const laneCenter = laneW * (this._lane + 0.5);
            this.x = Math.max(padX, Math.min(Graphics.width - layoutW - padX, laneCenter - layoutW / 2));
            this.y = Graphics.height + Math.random() * 200;
        }

        update() {
            this.y -= this._speed;
            if (this.y + this.height < 0 && this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Alternative background: this world's history artifacts as 3D models that
    // slide upward, each tagged with its name, weapon type and world price.
    // Reuses the shared WeaponThreeScene (THREE overlay) used by the FPS view.
    // -------------------------------------------------------------------------
    const WEAPON_TYPE_NAMES = {
        1: 'Light', 2: 'Sword', 3: 'Heavy', 4: 'Axe', 5: 'Whip', 6: 'Staff',
        7: 'Bow', 8: 'Projectile', 9: 'Gun', 10: 'Claw', 11: 'Glove', 12: 'Spear'
    };

    // Attack element names from a weapon's traits (trait code 31 = attack element).
    function _weaponElements(weapon) {
        const out = [];
        const traits = (weapon && weapon.traits) || [];
        for (const t of traits) {
            if (t.code === 31 && $dataSystem && $dataSystem.elements) {
                const nm = $dataSystem.elements[t.dataId];
                if (nm) out.push(nm);
            }
        }
        return out;
    }

    // Inflicted states from a weapon's traits (trait code 32 = attack state),
    // each with its application chance as a percentage.
    function _weaponStates(weapon) {
        const out = [];
        const traits = (weapon && weapon.traits) || [];
        for (const t of traits) {
            if (t.code === 32 && typeof $dataStates !== 'undefined' && $dataStates && $dataStates[t.dataId]) {
                const st = $dataStates[t.dataId];
                if (st && st.name) out.push({ name: st.name, chance: Math.round((t.value || 0) * 100) });
            }
        }
        return out;
    }

    // Locally regenerate the deterministic artifact weapons from the history
    // seed, mirroring HistorySimulator.generateArtifacts() exactly (same RNG
    // call order) so the names/prices match the world even with no save loaded.
    function generateArtifactWeaponsFromSeed(seed) {
        let rng = seed || 19002001;
        const sRand = () => { const x = Math.sin(rng++) * 10000; return x - Math.floor(x); };
        const adjectives = T.list('Titlescreen.artifact.adjectives');
        const itemNouns = T.list('Titlescreen.artifact.itemNouns');
        const weaponNouns = T.list('Titlescreen.artifact.weaponNouns');
        const armorNouns = T.list('Titlescreen.artifact.armorNouns');

        const make = (id, nounList, kind) => {
            const adj = adjectives[Math.floor(sRand() * adjectives.length)];
            const noun = nounList[Math.floor(sRand() * nounList.length)];
            const obj = {
                id, name: T('Titlescreen.artifact.nameFormat', { adj, noun }), note: '<category: artifact>',
                price: 2500000 + Math.floor(sRand() * 500000), iconIndex: 245
            };
            if (kind === 'weapon') {
                obj.wtypeId = 1 + Math.floor(sRand() * 12);
                obj.params = [0, 0, 150 + Math.floor(sRand() * 100), 0, 150 + Math.floor(sRand() * 100), 0, 0, 0];
                obj.traits = [];
            } else if (kind === 'armor') {
                obj.atypeId = 1 + Math.floor(sRand() * 5);
                obj.etypeId = 2 + Math.floor(sRand() * 3);
                obj.params = [0, 0, 0, 150 + Math.floor(sRand() * 100), 0, 150 + Math.floor(sRand() * 100), 0, 0];
                obj.traits = [];
            }
            return obj;
        };

        const weapons = [];
        for (let i = 0; i < 13; i++) {
            make(1501 + i, itemNouns, 'item');     // keep RNG aligned
            weapons.push(make(1501 + i, weaponNouns, 'weapon'));
            make(1501 + i, armorNouns, 'armor');   // keep RNG aligned
        }
        return weapons;
    }

    // Resolve this world's artifact weapons, preferring real generated data.
    function getArtifactWeapons() {
        let weapons = null;
        try {
            if (window.WorldManager && window.WorldManager.activeWorldName) {
                const gen = window.WorldManager.getField('artifacts', 'generated');
                if (gen && gen.weapons && gen.weapons.length) weapons = gen.weapons;
            }
        } catch (e) { /* ignore */ }
        if (!weapons && typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._generatedArtifacts) {
            const gen = $gameSystem._generatedArtifacts;
            if (gen.weapons && gen.weapons.length) weapons = gen.weapons;
        }
        if (!weapons) {
            let seed = 19002001;
            try {
                if (window.HistoryManager && window.HistoryManager.getSeed) seed = window.HistoryManager.getSeed();
                else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed) seed = $gameSystem._historySeed;
            } catch (e) { /* ignore */ }
            weapons = generateArtifactWeaponsFromSeed(seed);
        }
        return weapons.filter(w => w && w.name);
    }

    // Every ordinary weapon from Weapons.json (used by the 'weapons' mode).
    function getRegularWeapons() {
        if (!$dataWeapons) return [];
        return $dataWeapons.filter(w =>
            w && w.name && w.name.trim() !== '' && !w.name.startsWith('<--') && w.wtypeId
        );
    }

    class ArtifactBackground {
        // kind: 'artifacts' (world history artifacts + price) or
        //       'weapons' (every weapon from Weapons.json + price)
        constructor(kind) {
            this._kind = kind || 'artifacts';
            this._items = [];
            this._lights = [];
            this._enabled = false;
            this._maxItems = 2;
            this._artifacts = this._kind === 'weapons' ? getRegularWeapons() : getArtifactWeapons();
            if (window.THREE && window.WeaponSystemProcedural && window.WeaponThreeScene && this._artifacts.length) {
                try {
                    window.WeaponThreeScene.ref();
                    this._addBrightLights();
                    this._createLabelLayer();
                    this._enabled = true;
                } catch (e) {
                    this._enabled = false;
                }
            }
        }

        get available() {
            return this._enabled;
        }

        // World units of the shared weapon overlay: the game's internal
        // resolution (the overlay canvas is drawn at that size and then
        // stretched over the game canvas), not the browser window.
        _viewSize() {
            return { w: Graphics.width || 816, h: Graphics.height || 624 };
        }

        // Projection from that world space (y-up, centre origin) to window
        // pixels, for the DOM label layer and strand canvas which both cover
        // the whole window.
        _projection() {
            const canvas = document.getElementById('gameCanvas');
            const r = canvas ? canvas.getBoundingClientRect() : null;
            const { w, h } = this._viewSize();
            return {
                left: r ? r.left : 0,
                top: r ? r.top : 0,
                sx: r ? r.width / w : 1,
                sy: r ? r.height / h : 1,
                w, h
            };
        }

        _project(p, worldX, worldY) {
            return {
                x: p.left + (worldX + p.w / 2) * p.sx,
                y: p.top + (p.h / 2 - worldY) * p.sy
            };
        }

        // The shared scene's lights are dim for the FPS gun; brighten the
        // procedural metals while the title is showing (removed on dispose).
        _addBrightLights() {
            const scene = window.WeaponThreeScene.scene;
            const amb = new THREE.AmbientLight(0xffffff, 2.4);
            const hemi = new THREE.HemisphereLight(0xfff4e0, 0x505070, 1.7);
            const key = new THREE.DirectionalLight(0xfff2d0, 2.2); key.position.set(0.5, 1, 2);
            const fill = new THREE.DirectionalLight(0xbcd4ff, 1.4); fill.position.set(-1.2, 0.3, 1);
            const back = new THREE.DirectionalLight(0xffffff, 1.0); back.position.set(0, -0.5, -1.5);
            [amb, hemi, key, fill, back].forEach(l => { scene.add(l); this._lights.push(l); });
        }

        _createLabelLayer() {
            let layer = document.getElementById('title-artifact-labels');
            if (!layer) {
                layer = document.createElement('div');
                layer.id = 'title-artifact-labels';
                layer.className = 'title-label-layer';
                document.body.appendChild(layer);
            }
            layer.innerHTML = '';
            this._labelLayer = layer;

            // Canvas (behind the labels) for the gold strands linking artifacts
            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            canvas.className = 'title-strand-canvas';
            layer.appendChild(canvas);
            this._strandCanvas = canvas;
            this._strandCtx = canvas.getContext('2d');
        }

        _drawStrands(proj) {
            const ctx = this._strandCtx;
            if (!ctx) return;
            // The strand canvas covers the window, so the world points are
            // projected onto it rather than used raw.
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (this._strandCanvas.width !== w || this._strandCanvas.height !== h) {
                this._strandCanvas.width = w;
                this._strandCanvas.height = h;
            }
            ctx.clearRect(0, 0, w, h);
            const pts = this._items.map(it => this._project(proj, it.worldX, it.worldY));
            for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                    const dx = pts[i].x - pts[j].x;
                    const dy = pts[i].y - pts[j].y;
                    const dist = Math.hypot(dx, dy);
                    // Fade strands out with distance so the mesh stays subtle
                    const alpha = Math.max(0, 0.35 * (1 - dist / (w * 0.7)));
                    if (alpha <= 0.01) continue;
                    ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(pts[i].x, pts[i].y);
                    ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
            }
        }

        _makeLabel(weapon) {
            const euro = (weapon.price / 100).toFixed(2);
            const wtype = WEAPON_TYPE_NAMES[weapon.wtypeId] || T('Titlescreen.artifact.fallbackType');
            const div = document.createElement('div');
            div.className = 'title-artifact-label';
            // Readable black panel so the full stat readout stays legible over the
            // 3D models and the gold connection strands.
            div.classList.add('title-artifact-label--plated');

            const name = window.translateText ? window.translateText(weapon.name) : weapon.name;
            const kindTag = this._kind === 'weapons'
                ? T('Titlescreen.card.weapon')
                : T('Titlescreen.card.artifact');

            // Non-zero base parameters, named the way the rest of the game names
            // them: $dataSystem.terms.params, which Hendrix_Localization has
            // already translated in place by the time the title screen draws.
            const PARAM_LABELS = [0, 1, 2, 3, 4, 5, 6, 7].map(i => TextManager.param(i));
            const params = weapon.params || [];
            const statBits = [];
            for (let i = 0; i < PARAM_LABELS.length; i++) {
                const v = params[i] || 0;
                if (v !== 0) statBits.push(`${PARAM_LABELS[i]} ${v > 0 ? '+' : ''}${v}`);
            }

            // Attack element + inflicted states, pulled from the weapon's traits.
            const elements = _weaponElements(weapon);
            const states = _weaponStates(weapon);

            let html =
                `<div class="title-card-name">${name.toUpperCase()}</div>` +
                `<div class="title-card-kind">[${kindTag}] [${wtype.toUpperCase()}]</div>`;
            if (statBits.length) {
                html += `<div class="title-card-stats">${statBits.join('  ')}</div>`;
            }
            if (elements.length) {
                html += `<div class="title-card-element">${T('Titlescreen.card.element')}: ${elements.join(', ').toUpperCase()}</div>`;
            }
            if (states.length) {
                const stTxt = states.map(s => `${s.name.toUpperCase()}${s.chance ? ' ' + s.chance + '%' : ''}`).join(', ');
                html += `<div class="title-card-status">${T('Titlescreen.card.inflicts')}: ${stTxt}</div>`;
            }
            html += `<div class="title-card-price">${euro}â‚¬</div>`;
            div.innerHTML = html;
            this._labelLayer.appendChild(div);
            return div;
        }

        spawn() {
            if (!this._enabled || this._items.length >= this._maxItems) return;
            const weapon = this._artifacts[Math.floor(Math.random() * this._artifacts.length)];
            if (!weapon) return;
            let model;
            try {
                model = window.WeaponSystemProcedural.createModel(weapon);
            } catch (e) {
                model = null;
            }
            if (!model) return;

            // Brighten the procedural materials: dark metals stay dark even under
            // strong lights, so lower metalness/roughness and add a self-emissive
            // tint so each artifact reads clearly against the black background.
            model.traverse(o => {
                if (!o.isMesh || !o.material) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    if (m.color && m.emissive) {
                        m.emissive.copy(m.color).multiplyScalar(0.45);
                        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.7);
                    }
                    if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.45);
                    if ('roughness' in m) m.roughness = Math.min(m.roughness, 0.55);
                });
            });

            const { w, h } = this._viewSize();

            // Normalize on-screen size from the model's own bounding box so every
            // artifact type (long whips, stubby guns, etc.) ends up a consistent,
            // card-sized height instead of varying wildly with a fixed scale.
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3(); box.getSize(size);
            const center = new THREE.Vector3(); box.getCenter(center);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            // Largest dimension as a share of the view height, so the artifacts
            // keep their proportions at any game resolution.
            const targetPx = h * (0.50 + Math.random() * 0.17);
            const scale = targetPx / maxDim;

            // Center the model on a pivot so it spins about its middle and the
            // label can be placed predictably under it.
            model.position.sub(center);
            const pivot = new THREE.Group();
            pivot.add(model);
            pivot.scale.set(scale, scale, scale);

            const halfSpan = 0.5 * (size.y / maxDim) * targetPx + 16;

            // Keep concurrent items on opposite horizontal halves so the larger
            // models (and their full-stat labels) never overlap each other.
            let side;
            if (this._items.length > 0) {
                side = this._items[this._items.length - 1].worldX >= 0 ? -1 : 1;
            } else {
                side = Math.random() < 0.5 ? -1 : 1;
            }
            const worldX = side * w * (0.14 + Math.random() * 0.14);

            const item = {
                model: pivot,
                weapon,
                label: this._makeLabel(weapon),
                worldX,
                worldY: -h / 2 - targetPx - Math.random() * h * 0.23,
                speed: (1.7 + Math.random() * 2.0) * (h / 1080),
                spin: (Math.random() - 0.5) * 0.02 + 0.012,
                tilt: (Math.random() - 0.5) * 0.5,
                halfSpan
            };
            pivot.position.set(item.worldX, item.worldY, 0);
            pivot.rotation.x = item.tilt;
            window.WeaponThreeScene.scene.add(pivot);
            this._items.push(item);
        }

        update() {
            if (!this._enabled) return;
            const { w, h } = this._viewSize();
            const proj = this._projection();
            for (let i = this._items.length - 1; i >= 0; i--) {
                const it = this._items[i];
                it.worldY += it.speed;
                it.model.position.y = it.worldY;
                it.model.rotation.y += it.spin;
                // World (y-up, origin centre) -> window pixels for the DOM label,
                // placed just below the model.
                if (it.label) {
                    const p = this._project(proj, it.worldX, it.worldY);
                    window.UIPanel.placeAt(it.label, p.x, p.y + it.halfSpan * proj.sy);
                }
                if (it.worldY > h / 2 + h * 0.26) {
                    this._removeItem(i);
                }
            }
            this._drawStrands(proj);
            window.WeaponThreeScene.render();
        }

        _removeItem(index) {
            const it = this._items[index];
            if (it) {
                if (it.model && window.WeaponThreeScene.scene) {
                    window.WeaponThreeScene.scene.remove(it.model);
                }
                if (it.label && it.label.parentNode) it.label.parentNode.removeChild(it.label);
            }
            this._items.splice(index, 1);
        }

        dispose() {
            if (!this._enabled) return;
            for (let i = this._items.length - 1; i >= 0; i--) {
                this._removeItem(i);
            }
            this._items = [];
            const scene = window.WeaponThreeScene && window.WeaponThreeScene.scene;
            if (scene) this._lights.forEach(l => scene.remove(l));
            this._lights = [];
            if (this._labelLayer && this._labelLayer.parentNode) {
                this._labelLayer.parentNode.removeChild(this._labelLayer);
            }
            this._labelLayer = null;
            try {
                window.WeaponThreeScene.render();
                window.WeaponThreeScene.deref();
            } catch (e) {
                // ignore
            }
            this._enabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // The bestiary background in its 3D shape: real enemies rendered as their
    // animated 3D model, chosen when the enemy battler option is set to 3D.
    // Mirrors ArtifactBackground (its own THREE scene, models float upward, DOM
    // labels, gold connection strands), but instantiates the modular Battler3D
    // procedural creature that each enemy resolves to, and labels it with the
    // enemy's actual name, level/archetype and description (the same caption the
    // flat bestiary cards carry). Each model is built from a fake battler keyed
    // to the enemy id so it shows that enemy's canonical, textured look (not a
    // random white preview). Models are built with no physics, so they use the
    // kinematic idle pose.
    // -------------------------------------------------------------------------
    class Enemies3DBackground {
        constructor() {
            this._items = [];
            this._enabled = false;
            this._maxItems = 3;
            // Pool of real enemies that resolve to a registered 3D model. Each
            // entry carries the source $dataEnemies row (for name / notes / stats)
            // and the archetype key used to build its procedural model.
            this._pool = this._buildEnemyPool();
            if (window.THREE && window.Battler3D && window.Battler3D.create && this._pool.length) {
                try {
                    this._initScene();
                    this._createLabelLayer();
                    this._enabled = true;
                } catch (e) {
                    this._enabled = false;
                }
            }
        }

        // Collect every named enemy that maps to a registered Battler3D model.
        _buildEnemyPool() {
            const pool = [];
            if (!window.Battler3D || !window.Battler3D.resolveKey || !Array.isArray($dataEnemies)) {
                return pool;
            }
            for (let i = 1; i < $dataEnemies.length; i++) {
                const enemy = $dataEnemies[i];
                if (!enemy || !enemy.name || !enemy.name.trim() || enemy.name.startsWith('<--')) continue;
                let archKey = null;
                try { archKey = window.Battler3D.resolveKey(enemy); } catch (e) { archKey = null; }
                if (archKey) pool.push({ enemy, archKey });
            }
            return pool;
        }

        get available() {
            return this._enabled;
        }

        _viewSize() {
            return { w: window.innerWidth || Graphics.width, h: window.innerHeight || Graphics.height };
        }

        // Dedicated offscreen WebGL scene with an orthographic camera so world
        // units map 1:1 to screen pixels (like the artifact float coordinates).
        _initScene() {
            const { w, h } = this._viewSize();
            this._scene = new THREE.Scene();
            this._camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -3000, 3000);
            this._camera.position.set(0, 0, 1000);
            this._camera.lookAt(0, 0, 0);

            this._renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            this._renderer.setSize(w, h);
            this._renderer.setClearColor(0x000000, 0);
            const cv = this._renderer.domElement;
            cv.id = 'title-enemies3d-canvas';
            cv.className = 'title-scene-canvas';
            document.body.appendChild(cv);
            this._canvasEl = cv;

            // Match the bestiary preview's moderate lighting. The old setup
            // (ambient 1.5 + hemisphere 1.2 + two directionals) blew the skin
            // colours/textures out to flat white; keep the total fill modest so
            // each enemy's tint and surface read correctly.
            this._scene.add(new THREE.AmbientLight(0xffffff, 1.0));
            const key = new THREE.DirectionalLight(0xfff2d0, 1.4); key.position.set(0.5, 1, 2); this._scene.add(key);
            const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(-1.2, 0.3, 1); this._scene.add(fill);
            this._clock = new THREE.Clock();
        }

        _createLabelLayer() {
            let layer = document.getElementById('title-enemies3d-labels');
            if (!layer) {
                layer = document.createElement('div');
                layer.id = 'title-enemies3d-labels';
                layer.className = 'title-label-layer';
                document.body.appendChild(layer);
            }
            layer.innerHTML = '';
            this._labelLayer = layer;

            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            canvas.className = 'title-strand-canvas';
            layer.appendChild(canvas);
            this._strandCanvas = canvas;
            this._strandCtx = canvas.getContext('2d');
        }

        // Gold strands between every pair of battlers (fading with distance), so
        // the enemies are linked just like the planets and artifacts.
        _drawStrands(w, h) {
            const ctx = this._strandCtx;
            if (!ctx) return;
            if (this._strandCanvas.width !== w || this._strandCanvas.height !== h) {
                this._strandCanvas.width = w;
                this._strandCanvas.height = h;
            }
            ctx.clearRect(0, 0, w, h);
            const pts = this._items.filter(it => it.spawned).map(it => ({
                x: it.worldX + w / 2,
                y: h / 2 - it.worldY
            }));
            for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                    const dx = pts[i].x - pts[j].x;
                    const dy = pts[i].y - pts[j].y;
                    const dist = Math.hypot(dx, dy);
                    const alpha = Math.max(0, 0.35 * (1 - dist / (w * 0.7)));
                    if (alpha <= 0.01) continue;
                    ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(pts[i].x, pts[i].y);
                    ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
            }
        }

        _esc(s) {
            return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        }

        // Build the floating caption for a real enemy: its name, a level +
        // archetype subline, a compact stat block and its description (mirrors the
        // bestiary "Enemies" caption). Descriptions use combinatorial {a | b | c}
        // inline text resolved (seeded from the world seed) by EnemyDescription.
        _makeLabel(enemy, archKey) {
            const note = (enemy && enemy.note) || '';
            const p = (enemy && enemy.params) || [0, 0, 0, 0, 0, 0, 0, 0];
            const lv = (note.match(/<Level:\s*(\d+)>/i) || [])[1] || '0';
            const archName = window.Battler3D.displayName ? window.Battler3D.displayName(archKey) : archKey;
            const enRaw = (note.match(/<En:\s*([^>]+)>/i) || [])[1] || '';
            let descTxt;
            if (window.EnemyDescription) {
                descTxt = (enemy && enemy.id)
                    ? window.EnemyDescription.describe(enemy.id)
                    : window.EnemyDescription.resolve(enRaw);
            } else {
                descTxt = enRaw.trim();
            }
            const lvLabel = T('Titlescreen.card.levelAbbr');

            const div = document.createElement('div');
            div.className = 'title-artifact-label title-artifact-label--wide';
            let html =
                `<div class="title-body-name">${this._esc(enemy.name).toUpperCase()}</div>` +
                `<div class="title-body-sub">${lvLabel} ${this._esc(lv)}${archName ? '  &middot;  ' + this._esc(archName).toUpperCase() : ''}</div>` +
                `<div class="title-body-stats">HP ${p[0]} &middot; ATK ${p[2]} &middot; DEF ${p[3]} &middot; AGI ${p[6]}</div>`;
            if (descTxt) {
                html += `<div class="title-body-desc">${this._esc(descTxt)}</div>`;
            }
            div.innerHTML = html;
            this._labelLayer.appendChild(div);
            return div;
        }

        spawn() {
            if (!this._enabled || this._items.length >= this._maxItems) return;
            const pick = this._pool[Math.floor(Math.random() * this._pool.length)];
            if (!pick) return;
            const { enemy, archKey } = pick;
            // Fake battler keyed to the enemy id so the model uses that enemy's
            // deterministic per-id colour/texture (its canonical battle look).
            const fakeBattler = { enemyId: () => enemy.id, index: () => 0 };
            let model;
            try {
                model = window.Battler3D.create(archKey, 0, 0, fakeBattler);
            } catch (e) {
                model = null;
            }
            if (!model) return;

            const { w, h } = this._viewSize();
            const targetPx = 380 + Math.random() * 140;
            const item = {
                key: archKey,
                model,
                pivot: new THREE.Group(),
                label: this._makeLabel(enemy, archKey),
                worldX: (Math.random() - 0.5) * w * 0.8,
                worldY: -h / 2 - targetPx - Math.random() * 250,
                speed: 1.6 + Math.random() * 1.8,
                spin: (Math.random() - 0.5) * 0.01 + 0.006,
                halfSpan: targetPx * 0.5 + 20,
                spawned: false
            };
            this._items.push(item);

            // Build is async; add to the scene once the meshes exist.
            Promise.resolve(model.load(null, 0, 0, 0)).then(() => {
                if (!this._enabled || !model.model) return;
                // Pose one frame so the bounding box reflects the standing shape.
                try { model.update(1 / 60); } catch (e) { /* ignore */ }

                const box = new THREE.Box3().setFromObject(model.model);
                const size = new THREE.Vector3(); box.getSize(size);
                const center = new THREE.Vector3(); box.getCenter(center);
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const scale = targetPx / maxDim;

                model.model.position.sub(center); // centre on the pivot
                if (window.PSXShader) window.PSXShader.applyToObject(model.model);
                item.pivot.add(model.model);
                item.pivot.scale.set(scale, scale, scale);
                item.halfSpan = 0.5 * (size.y / maxDim) * targetPx + 20;
                item.pivot.position.set(item.worldX, item.worldY, 0);
                this._scene.add(item.pivot);
                item.spawned = true;
            }).catch(() => { /* ignore a model that fails to build */ });
        }

        update() {
            if (!this._enabled) return;
            const { w, h } = this._viewSize();
            const dt = this._clock ? this._clock.getDelta() : 1 / 60;

            if (this._renderer && (this._canvasEl.width !== w || this._canvasEl.height !== h)) {
                this._renderer.setSize(w, h);
                this._camera.left = -w / 2; this._camera.right = w / 2;
                this._camera.top = h / 2; this._camera.bottom = -h / 2;
                this._camera.updateProjectionMatrix();
            }

            for (let i = this._items.length - 1; i >= 0; i--) {
                const it = this._items[i];
                it.worldY += it.speed;
                if (it.spawned && it.pivot) {
                    it.pivot.position.y = it.worldY;
                    it.pivot.rotation.y += it.spin;
                }
                if (it.model && it.model.update) {
                    try { it.model.update(dt); } catch (e) { /* ignore a bad frame */ }
                }
                if (it.label) {
                    const px = it.worldX + w / 2;
                    const py = (h / 2 - it.worldY) + it.halfSpan;
                    window.UIPanel.placeAt(it.label, px, py);
                }
                if (it.worldY > h / 2 + 340) {
                    this._removeItem(i);
                }
            }
            this._drawStrands(w, h);
            if (window.PSXShader) {
                window.PSXShader.render(this._renderer, this._scene, this._camera);
            } else {
                this._renderer.render(this._scene, this._camera);
            }
        }

        _removeItem(index) {
            const it = this._items[index];
            if (it) {
                if (it.pivot && this._scene) this._scene.remove(it.pivot);
                if (it.label && it.label.parentNode) it.label.parentNode.removeChild(it.label);
            }
            this._items.splice(index, 1);
        }

        dispose() {
            if (!this._enabled) return;
            for (let i = this._items.length - 1; i >= 0; i--) {
                this._removeItem(i);
            }
            this._items = [];
            if (this._labelLayer && this._labelLayer.parentNode) {
                this._labelLayer.parentNode.removeChild(this._labelLayer);
            }
            this._labelLayer = null;
            if (this._canvasEl && this._canvasEl.parentNode) {
                this._canvasEl.parentNode.removeChild(this._canvasEl);
            }
            // dispose() leaves the WebGL context itself alive. The browser caps
            // live contexts and force-loses the OLDEST past the cap, which is
            // the game's own canvas: PIXI then silently stops rendering and the
            // picture freezes until the game is restarted. The title screen is
            // re-entered freely, so the context has to be handed back here.
            try { if (this._renderer) this._renderer.dispose(); } catch (e) { /* ignore */ }
            try {
                if (this._renderer && this._renderer.forceContextLoss) this._renderer.forceContextLoss();
            } catch (e) { /* ignore */ }
            this._renderer = null;
            this._enabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // Galaxy / cluster models for the Hyperverse acts. GalaxySim's cosmos module
    // only builds whole scales (Local Group, supercluster, cosmic web), so the
    // title screen builds its own single-object galaxy and cluster here, using
    // the cosmos billboard/star textures when they are available.
    // -------------------------------------------------------------------------
    // A fresh texture per model: acts dispose everything they built, so a shared
    // cached one would be freed out from under the next act.
    function makeSoftStarTexture() {
        const s = 64, cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        return new window.THREE.CanvasTexture(cv);
    }

    // Additive glow material used for galaxy cores and cluster members. One
    // material can be shared by many sprites (only the scale differs).
    function makeGlowMaterial(coreRGBA, haloRGBA) {
        const THREE = window.THREE;
        const s = 128, cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, coreRGBA);
        g.addColorStop(0.45, haloRGBA);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        return new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(cv), transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
    }

    function makeGlowSprite(material, sx, sy) {
        const sp = new window.THREE.Sprite(material);
        sp.scale.set(sx, sy, 1);
        return sp;
    }

    // Release every geometry / material / texture under a group.
    function disposeGroupDeep(group) {
        const C = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
        if (C && C.disposeObject3D) { C.disposeObject3D(group); return; }
        group.traverse(obj => {
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
                if (!m) return;
                if (m.map && m.map.dispose) m.map.dispose();
                if (m.dispose) m.dispose();
            });
        });
    }

    // A single spiral / barred / elliptical galaxy: a star point-cloud shaped by
    // logarithmic arms, a bulge, a halo and an additive core glow.
    function buildGalaxyModel(opts) {
        const THREE = window.THREE;
        opts = opts || {};
        const rnd = _seededRandom((opts.seed || 1) + 17);
        const radius = opts.radius || 220;
        const arms = opts.arms || (2 + Math.floor(rnd() * 3));
        const barred = opts.barred != null ? opts.barred : rnd() > 0.45;
        const elliptical = !!opts.elliptical;
        const tint = opts.color || { r: 0.85, g: 0.88, b: 1.0 };
        const group = new THREE.Group();

        const N = 9000;
        const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        const twist = 2.2 + rnd() * 1.6;
        for (let i = 0; i < N; i++) {
            let x, y, z, warm;
            const roll = rnd();
            if (elliptical || roll < 0.22) {
                // Bulge / spheroid: warm, concentrated core population.
                const r = Math.pow(rnd(), elliptical ? 1.6 : 2.2) * radius * (elliptical ? 1.0 : 0.35);
                const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
                const s = Math.sqrt(1 - u * u);
                x = Math.cos(th) * s * r;
                y = u * r * (elliptical ? 0.66 : 0.55);
                z = Math.sin(th) * s * r;
                warm = true;
            } else if (roll < 0.94) {
                // Disc population wound into logarithmic arms.
                const r = Math.pow(rnd(), 0.55) * radius;
                const arm = Math.floor(rnd() * arms);
                const barPull = barred && r < radius * 0.32 ? 0 : 1;
                const ang = barPull * (r / radius) * twist + arm * (Math.PI * 2 / arms)
                    + (rnd() - 0.5) * (0.55 + 0.5 * (1 - r / radius));
                const jitter = (rnd() - 0.5) * radius * 0.05;
                x = Math.cos(ang) * r + jitter;
                z = Math.sin(ang) * r + jitter;
                y = (rnd() - 0.5) * radius * 0.05 * (1 - 0.6 * r / radius);
                if (barred && r < radius * 0.32) {
                    // Central bar: squash the inner disc onto one axis.
                    x = (rnd() - 0.5) * radius * 0.62;
                    z = (rnd() - 0.5) * radius * 0.1;
                }
                warm = rnd() < 0.3;
            } else {
                // Sparse halo.
                const r = radius * (1 + rnd() * 0.5);
                const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
                const s = Math.sqrt(1 - u * u);
                x = Math.cos(th) * s * r; y = u * r * 0.7; z = Math.sin(th) * s * r;
                warm = rnd() < 0.5;
            }
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
            const b = 0.55 + rnd() * 0.45;
            col[i * 3] = (warm ? 1.0 : tint.r) * b;
            col[i * 3 + 1] = (warm ? 0.86 : tint.g) * b;
            col[i * 3 + 2] = (warm ? 0.68 : tint.b) * b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
            size: radius * 0.016, vertexColors: true, map: makeSoftStarTexture(),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95
        });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false;
        group.add(pts);

        const coreMat = makeGlowMaterial('rgba(255,246,214,0.95)', 'rgba(180,190,255,0.35)');
        group.add(makeGlowSprite(coreMat,
            radius * (elliptical ? 1.5 : 0.9), radius * (elliptical ? 1.0 : 0.9)));

        group.rotation.x = (rnd() - 0.5) * 0.9;
        group.rotation.z = (rnd() - 0.5) * 0.5;
        return {
            group, radius, arms: elliptical ? 0 : arms, barred,
            animate: t => { pts.rotation.y = t * 0.05; },
            dispose: () => disposeGroupDeep(group)
        };
    }

    // A galaxy cluster: many member galaxies as additive billboards inside a
    // clustered volume, plus a faint intracluster point haze.
    function buildClusterModel(opts) {
        const THREE = window.THREE;
        opts = opts || {};
        const rnd = _seededRandom((opts.seed || 1) + 29);
        const radius = opts.radius || 420;
        const count = opts.count || 180;
        const group = new THREE.Group();
        // Three shared member materials keep this to 4 textures, not one per
        // galaxy: a cluster is hundreds of billboards.
        const palette = [
            makeGlowMaterial('rgba(255,244,214,0.95)', 'rgba(160,190,255,0.35)'),
            makeGlowMaterial('rgba(228,238,255,0.95)', 'rgba(140,170,255,0.3)'),
            makeGlowMaterial('rgba(255,228,200,0.95)', 'rgba(190,170,255,0.3)')
        ];
        for (let i = 0; i < count; i++) {
            const rr = Math.pow(rnd(), 1.7) * radius;
            const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            const sz = radius * (0.02 + rnd() * 0.07);
            const sp = makeGlowSprite(palette[Math.floor(rnd() * palette.length)], sz * (1 + rnd() * 0.6), sz);
            sp.position.set(Math.cos(th) * s * rr, u * rr * 0.8, Math.sin(th) * s * rr);
            group.add(sp);
        }
        // Brightest cluster galaxy at the core.
        const bcgMat = makeGlowMaterial('rgba(255,250,225,0.98)', 'rgba(180,200,255,0.4)');
        group.add(makeGlowSprite(bcgMat, radius * 0.34, radius * 0.22));

        const n = 2600;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const rr = Math.pow(rnd(), 1.3) * radius * 1.25;
            const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            pos[i * 3] = Math.cos(th) * s * rr;
            pos[i * 3 + 1] = u * rr * 0.85;
            pos[i * 3 + 2] = Math.sin(th) * s * rr;
            const b = 0.3 + rnd() * 0.4;
            col[i * 3] = b * 0.8; col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const haze = new THREE.Points(geo, new THREE.PointsMaterial({
            size: radius * 0.008, vertexColors: true, map: makeSoftStarTexture(),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6
        }));
        haze.frustumCulled = false;
        group.add(haze);

        return {
            group, radius,
            animate: t => { group.rotation.y = t * 0.02; },
            dispose: () => disposeGroupDeep(group)
        };
    }

    // -------------------------------------------------------------------------
    // Gravitational lensing pass for the Hyperverse black hole acts.
    //
    // The hole always sits dead centre (the camera orbits the act group and
    // looks straight at its origin), so the whole thing works in screen space:
    // the sky behind the hole is rendered on its own, this shader bends it, and
    // the hole is drawn crisp on top afterwards. Only the background is warped,
    // so the accretion disk, photon ring and jets keep their modelled shape
    // while the star field genuinely curves around them.
    // -------------------------------------------------------------------------
    const LENS_VERT = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const LENS_FRAG = `
        uniform sampler2D tDiffuse;
        uniform float uAspect;    // canvas width / height
        uniform float uHorizon;   // event-horizon radius, screen units (height = 1)
        uniform float uEinstein;  // Einstein radius in the same units: carries the mass
        uniform float uSpin;      // dimensionless a*
        varying vec2 vUv;

        void main() {
            // Aspect-corrected offset from the hole, which is always centred.
            vec2 d = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
            float r = length(d);
            float rc = max(r, uHorizon * 0.5);

            // Point-mass thin lens: a ray seen at radius r left its source at
            // r * (1 - thetaE^2 / r^2), so the sky is pushed outward from the
            // hole by an offset that falls off as 1/r across the field.
            float k = (uEinstein * uEinstein) / (rc * rc);

            // Kerr frame dragging: a fast-spinning hole also winds the image
            // around its axis, hardest right against the horizon.
            float tw = uSpin * 0.6 * k;
            float cs = cos(tw), sn = sin(tw);
            vec2 src = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) * (1.0 - k);

            vec4 col = texture2D(tDiffuse, vec2(src.x / uAspect, src.y) + 0.5);

            // Magnification mu = 1 / (1 - (thetaE/theta)^4), which piles light
            // up on the Einstein ring the way a real lens does.
            float x = uEinstein / rc;
            float mu = 1.0 / max(abs(1.0 - x * x * x * x), 0.14);
            col.rgb *= clamp(mu, 0.55, 3.2);

            // Photon capture: nothing gets out from just above the horizon, so
            // the bent field is cut to a dark halo the hole is then drawn into.
            col *= smoothstep(uHorizon, uHorizon * 1.5, r);

            gl_FragColor = col;
        }
    `;

    // -------------------------------------------------------------------------
    // Hyperverse: a cinematic 3D background and the default title style. Each
    // ~8 second "act" frames ONE celestial body in close-up (star, planet,
    // galaxy, galaxy cluster, black hole, nebula or higher-dimensional anomaly)
    // with a slow cockpit-style camera drift, then cross-fades (fade out to
    // black, fade in) to another random body. It reuses the GalaxySim 3D
    // builders so the bodies match the in-game star map, and shows a live
    // infobox with the currently framed body's full stats.
    //
    // Acts alternate strictly between CATALOG bodies (real, hardcoded objects
    // with their published figures) and PROCEDURAL ones generated on the spot.
    // Both come out of a single playlist holding the WHOLE catalog with a fresh
    // procedural body between each of its entries, so letting the show run (or
    // stepping it with the NEXT control) visits every catalogued object once
    // before the cycle restarts with newly generated ones.
    //
    // Dragging the mouse / pushing the right stick pans the camera and the
    // wheel / L2 / R2 zooms; either drops the act into free-look, which holds
    // the current body until the input goes idle, exactly like the star map.
    //
    // The framed body is the only object in the scene: nothing else is rendered
    // and nothing is clickable. The one control is NEXT, which cuts straight to
    // the next body in the cycle. Everything that belongs to the ship (engines,
    // warp speed, fuel, home, SB-bridge) and the catalogue/bookmark panels are
    // deliberately absent, there is no ship on the title screen.
    // -------------------------------------------------------------------------
    // Free-look zoom range (a multiplier on the act's fitted camera distance:
    // below 1 is closer, above 1 further out). The opening act is framed at the
    // near end of it, so the title screen leads with the closest view the
    // camera can legally take of the body.
    const HYPERVERSE_MIN_ZOOM = 0.04;
    const HYPERVERSE_MAX_ZOOM = 20;

    class HyperverseBackground {
        constructor() {
            this._enabled = false;
            this._act = null;
            this._starfield = null;
            this._clock = null;
            // The body cycle: every catalogued object interleaved with freshly
            // generated ones, rebuilt (and reshuffled) whenever it runs out.
            this._playlist = null;
            this._playIndex = 0;
            // CATALOG panel: the hardcoded bodies, browsable, one press away
            // from being framed. Built on first open.
            this._catalogPanel = null;
            this._catalogOpen = false;
            this._catalogList = [];
            this._catalogRows = [];
            this._catalogIndex = 0;
            // Frames the title menu must keep ignoring input for after the panel
            // closes, so the press that picked a body never also fires a title
            // command behind it.
            this._catalogGuard = 0;
            // One-shot: the very first list of a session opens on TON 618.
            this._openerDone = false;
            // Lazy render targets + quad for the black-hole lensing pass.
            this._lens = null;
            this._lensFailed = false;
            // Timeline (frames @ ~60fps): fade-in, hold, fade-out ~= 8 seconds.
            this._FADE_IN = 48;
            this._HOLD = 384;
            this._FADE_OUT = 48;
            // Free-look state (pan + zoom); idle for IDLE_MS resumes the show.
            this._look = {
                active: false, dragging: false, yaw: 0, pitch: 0, zoom: 1,
                baseAz: 0, baseEl: 0, lastInput: 0, lastX: 0, lastY: 0
            };
            this._LOOK_IDLE_MS = 5000;

            const GS = window.GalaxySim;
            const hasBodies = !!(GS && GS.Renderer3D && GS.Renderer3D.available && GS.Renderer3D.available());
            const hasCosmos = !!(GS && GS.Scene3DCosmos);
            if (window.THREE && (hasBodies || hasCosmos)) {
                try {
                    this._initScene();
                    this._createInfoBox();
                    this._createControlButtons();
                    this._bindLookInput();
                    this._enabled = true;
                    this._startAct();
                } catch (e) {
                    console.warn('[Hyperverse] init failed:', e);
                    this._enabled = false;
                }
            }
        }

        // ---- Free-look input (mouse drag + wheel; sticks/triggers polled) ----
        _bindLookInput() {
            // Ignore presses that start on the title UI so menu clicks, the
            // background switcher, the NEXT control and the readout never start a
            // camera drag. Match the interactive list itself, not
            // #title-menu-container: that wrapper covers the whole screen, so
            // testing against it would treat every background press as a UI press.
            const onUI = (target) => !!(target && target.closest && target.closest(
                '.ts-menu-overlay, #title-bg-switch, #title-music-switch, #title-hyperverse-info, ' +
                '#title-hyperverse-next, #title-hyperverse-catalog-btn, #title-hyperverse-catalog'));

            this._onDown = (e) => {
                if (e.button !== undefined && e.button !== 0 && e.button !== 2) return;
                if (onUI(e.target)) return;
                this._look.dragging = true;
                this._look.lastX = e.clientX;
                this._look.lastY = e.clientY;
            };
            this._onMove = (e) => {
                if (!this._look.dragging) return;
                const dx = e.clientX - this._look.lastX;
                const dy = e.clientY - this._look.lastY;
                this._look.lastX = e.clientX;
                this._look.lastY = e.clientY;
                if (dx || dy) this._pan(-dx * 0.006, dy * 0.005);
            };
            this._onUp = () => { this._look.dragging = false; };
            this._onWheel = (e) => {
                if (onUI(e.target)) return;
                this._zoom(1 + Math.sign(e.deltaY) * 0.12);
            };
            document.addEventListener('pointerdown', this._onDown);
            document.addEventListener('pointermove', this._onMove);
            document.addEventListener('pointerup', this._onUp);
            document.addEventListener('pointercancel', this._onUp);
            document.addEventListener('wheel', this._onWheel, { passive: true });
        }

        _unbindLookInput() {
            if (!this._onDown) return;
            document.removeEventListener('pointerdown', this._onDown);
            document.removeEventListener('pointermove', this._onMove);
            document.removeEventListener('pointerup', this._onUp);
            document.removeEventListener('pointercancel', this._onUp);
            document.removeEventListener('wheel', this._onWheel);
            this._onDown = this._onMove = this._onUp = this._onWheel = null;
        }

        // Enter free-look, seeding it from wherever the auto camera is now so
        // the view never jumps when the player grabs it.
        _enterLook() {
            const L = this._look;
            L.lastInput = performance.now();
            if (L.active) return;
            L.active = true;
            L.exiting = false;
            // Seed from wherever the camera currently is (auto sway or the pose
            // left behind by a previous free-look) so grabbing it never jumps.
            L.yaw = 0; L.pitch = 0;
            L.zoom = this._lastZoom || 1;
            L.baseAz = this._lastAz || 0;
            L.baseEl = this._lastEl || 0;
            // Grabbing the camera mid fade-out rewinds to the hold, so the body
            // is fully visible again instead of freezing half faded.
            if (this._act && this._act.frame > this._FADE_IN + this._HOLD) {
                this._act.frame = this._FADE_IN + Math.floor(this._HOLD / 2);
            }
            this._renderInfo(this._act ? this._act.info : null);
        }

        _pan(dyaw, dpitch) {
            this._enterLook();
            const L = this._look;
            L.yaw += dyaw;
            L.pitch = Math.max(-1.35, Math.min(1.35, L.pitch + dpitch));
        }

        _zoom(k) {
            this._enterLook();
            const L = this._look;
            // Wider range than the original 0.12-8: further in for a close
            // surface/corona look, further out for a whole-neighbourhood view.
            L.zoom = Math.max(HYPERVERSE_MIN_ZOOM, Math.min(HYPERVERSE_MAX_ZOOM, L.zoom * k));
        }

        _isFreeLook() {
            const L = this._look;
            if (!L.active) return false;
            if (L.dragging) return true;
            if (performance.now() - L.lastInput > this._LOOK_IDLE_MS) {
                L.active = false;
                // Let the held act fade out normally and move the show along.
                // The camera stays where the player left it for that fade-out,
                // so releasing control never snaps the view.
                L.exiting = true;
                if (this._act) this._act.frame = Math.max(this._act.frame, this._FADE_IN + this._HOLD);
                this._renderInfo(this._act ? this._act.info : null);
                return false;
            }
            return true;
        }

        // Poll the pad every frame: right stick pans, L2 / R2 zoom.
        _updatePadLook() {
            const A = window.AnalogStickInput;
            if (A) {
                const rx = A.rightX(), ry = A.rightY();
                if (rx || ry) this._pan(-rx * 0.045, ry * 0.035);
            }
            const zoomIn = PAD.value(PAD.R2), zoomOut = PAD.value(PAD.L2);
            if (zoomIn > 0.08) this._zoom(1 - zoomIn * 0.03);
            if (zoomOut > 0.08) this._zoom(1 + zoomOut * 0.03);
        }

        // The only body-level input: step to the next one in the cycle. Left and
        // right (and R3 on a pad) do the same job as the NEXT control, so the
        // show can be driven without the mouse. L3 opens the CATALOG. The pad's
        // confirm button and Space are the title menu's, so they are
        // deliberately left alone here.
        _updateNextInput() {
            if (PAD.triggered(PAD.L3)) { this.openCatalog(); return; }
            if (Input.isTriggered('right') || Input.isTriggered('left') || PAD.triggered(PAD.R3)) {
                this.nextBody();
            }
        }

        get available() { return this._enabled; }

        _viewSize() {
            return { w: window.innerWidth || Graphics.width, h: window.innerHeight || Graphics.height };
        }

        _initScene() {
            const THREE = window.THREE;
            const { w, h } = this._viewSize();
            this._scene = new THREE.Scene();
            this._camera = new THREE.PerspectiveCamera(52, w / h, 0.01, 80000);
            this._camera.position.set(0, 0, 10);
            this._camera.lookAt(0, 0, 0);

            this._renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            this._renderer.setSize(w, h);
            this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this._renderer.setClearColor(0x000000, 0);
            const cv = this._renderer.domElement;
            cv.id = 'title-hyperverse-canvas';
            cv.className = 'title-scene-canvas title-scene-canvas--faded';
            // A lost GL context invalidates the lensing targets, and three
            // rebuilds its own resources on restore; drop ours so _lensCtx
            // makes them again instead of blitting from a dead texture.
            cv.addEventListener('webglcontextrestored', () => { this._lens = null; });
            document.body.appendChild(cv);
            this._canvasEl = cv;

            // Planets use lit materials; every other body is self-lit so the
            // extra light is harmless. The sun is repositioned per planet act.
            this._sun = new THREE.DirectionalLight(0xffffff, 2.4);
            this._sun.position.set(-4, 3, 6);
            this._scene.add(this._sun);
            this._scene.add(new THREE.AmbientLight(0x223046, 0.6));

            this._starfield = this._buildStarfield();
            this._scene.add(this._starfield);

            this._clock = new THREE.Clock();
        }

        // A deep, persistent starfield for parallax depth (crisp pixel stars).
        _buildStarfield() {
            const THREE = window.THREE;
            const n = 2600, R = 16000;
            const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
                const s = Math.sqrt(1 - u * u), r = R * (0.6 + Math.random() * 0.4);
                pos[i * 3] = Math.cos(th) * s * r;
                pos[i * 3 + 1] = u * r;
                pos[i * 3 + 2] = Math.sin(th) * s * r;
                const warm = Math.random() < 0.35;
                const b = 0.5 + Math.random() * 0.5;
                col[i * 3] = (warm ? 1.0 : 0.75) * b;
                col[i * 3 + 1] = 0.82 * b;
                col[i * 3 + 2] = (warm ? 0.72 : 1.0) * b;
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            const mat = new THREE.PointsMaterial({
                size: 2.2, vertexColors: true, sizeAttenuation: false,
                transparent: true, opacity: 0.9, depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const pts = new THREE.Points(g, mat);
            pts.frustumCulled = false;
            return pts;
        }

        _hashStr(s) {
            let h = 2166136261 >>> 0;
            s = String(s || '');
            for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
            return h >>> 0;
        }

        // ---- The body cycle -------------------------------------------------
        // One pass over every body the Hyperverse can show: the entire catalog
        // of real objects, shuffled, with a freshly generated procedural body
        // slotted between each of them so the two sources keep alternating. Once
        // the list has been walked through it is rebuilt, reshuffled and its
        // procedural half generated anew.
        _buildPlaylist() {
            const shuffle = (arr) => {
                const a = arr.slice();
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
                }
                return a;
            };
            const GS = window.GalaxySim || {};
            // Planets and ordinary stars need the star-map body renderer; black
            // holes, nebulae, exotic stars and anomalies need the cosmos module.
            // Galaxies and clusters are built locally, so they always work.
            const hasBodies = !!(GS.Renderer3D && GS.Renderer3D.available && GS.Renderer3D.available());
            const hasCosmos = !!GS.Scene3DCosmos;

            // The same list the CATALOG panel offers, so stepping the show and
            // picking a body by hand always draw on exactly the same objects.
            const catalog = buildCatalogBodies();

            // The procedural pass mirrors the catalog one for one, walking the
            // available kinds in turn. Planet biomes are drawn round-robin over
            // every GalaxySim PlanetTypes key so a cycle shows many distinct
            // biomes instead of leaving it to chance, and the higher-dimensional
            // anomaly exists only here.
            const makers = [];
            if (hasBodies) makers.push('planet', 'star');
            else if (hasCosmos) makers.push('star');
            makers.push('galaxy', 'cluster');
            if (hasCosmos) makers.push('blackhole', 'nebula', 'anomaly');
            const typeData = GS.PlanetTypes || null;
            const planetTypeKeys = typeData ? shuffle(Object.keys(typeData)) : [];
            let planetSlot = 0;
            const generated = [];
            for (let i = 0; i < catalog.length; i++) {
                const kind = makers[i % makers.length];
                if (kind === 'planet') {
                    const forced = planetTypeKeys.length
                        ? planetTypeKeys[planetSlot++ % planetTypeKeys.length] : null;
                    generated.push(Object.assign({ kind: 'planet' }, makeRandomPlanet(forced)));
                } else if (kind === 'star') generated.push(makeProceduralStar());
                else if (kind === 'galaxy') generated.push(makeProceduralGalaxy());
                else if (kind === 'cluster') generated.push(makeProceduralCluster());
                else if (kind === 'blackhole') generated.push(makeProceduralBlackHole());
                else if (kind === 'nebula') generated.push(makeProceduralNebula());
                else generated.push(makeProceduralAnomaly());
            }

            const cat = shuffle(catalog);
            const gen = shuffle(generated);
            // Which source opens the cycle is a coin flip, so consecutive title
            // visits do not always start on the same sort of body.
            const catFirst = Math.random() < 0.5;
            const list = [];
            for (let i = 0; i < Math.max(cat.length, gen.length); i++) {
                const pair = catFirst ? [cat[i], gen[i]] : [gen[i], cat[i]];
                if (pair[0]) list.push(pair[0]);
                if (pair[1]) list.push(pair[1]);
            }
            // The show always OPENS on TON 618: the ultramassive hole is the
            // strongest image the Hyperverse has and its act carries the
            // lensing shader, so the title screen leads with it. It is pulled
            // out of the shuffled list so the opener is never shown twice in
            // the same pass. Only the first list of a session gets the opener;
            // from the second pass on the cycle runs in its normal alternating
            // order.
            if (!this._openerDone && hasCosmos) {
                this._openerDone = true;
                const opener = HARDCODED_STARS.find(s => s.name === 'TON 618');
                if (opener) {
                    for (let i = list.length - 1; i >= 0; i--) {
                        if (list[i] === opener) list.splice(i, 1);
                    }
                    // A copy, not the catalogue entry itself: `_opener` frames
                    // the act at maximum zoom and must not stick to the shared
                    // record for the later, ordinary passes over the cycle.
                    list.unshift(Object.assign({}, opener, { _opener: true }));
                } else {
                    list.unshift(makeProceduralBlackHole());
                }
            }
            return list;
        }

        // The next datum in the cycle, rebuilding the list once it runs out.
        _nextData() {
            if (!this._playlist || this._playIndex >= this._playlist.length) {
                this._playlist = this._buildPlaylist();
                this._playIndex = 0;
            }
            if (!this._playlist.length) return null;
            return this._playlist[this._playIndex++];
        }

        // Cut straight to the next body, dropping whatever the camera was doing.
        nextBody() {
            if (!this._enabled) return;
            if (this._act) {
                if (this._scene) this._scene.remove(this._act.group);
                try { if (this._act.dispose) this._act.dispose(); } catch (e) { /* ignore */ }
                this._act = null;
            }
            this._startAct();
            if (window.SoundManager) SoundManager.playOk();
        }

        // ---- NEXT / CATALOG controls ----------------------------------------
        // Stacked below the readout in the same gold terminal style as the
        // background switcher, CATALOG under NEXT BODY, both fading with the act
        // they belong to.
        _createControlButtons() {
            this._nextButton = this._makeControlButton('title-hyperverse-next', () => this.nextBody());
            this._catalogButton = this._makeControlButton('title-hyperverse-catalog-btn', () => this.toggleCatalog());
            this._nextPadConnected = null;
            this._catalogPadConnected = null;
            this._refreshControlLabels();
            this.layout();
        }

        // One terminal-styled button. Position, padding and font are set by
        // layout(), which follows the canvas rect instead of the window.
        _makeControlButton(id, onClick) {
            // Always a fresh element: the listeners below are addEventListener
            // based, so a leftover node would stack a second handler.
            const stale = document.getElementById(id);
            if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
            const btn = document.createElement('div');
            btn.id = id;
            document.body.appendChild(btn);
            btn.className = 'title-plate title-ctl-btn';
            // Swallow the press so it never reaches the free-look drag behind it.
            btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onClick();
            });
            return btn;
        }

        // The labels name the pad buttons that do the same job when one is
        // plugged in; they only relabel when that connection state flips, or
        // when the player picks another language while the show is running
        // (the flags are right there on the title, and every other piece of
        // text on screen re-renders on its own).
        _refreshControlLabels() {
            const pad = PAD.connected();
            const lang = activeLanguage();
            if (this._nextButton &&
                (pad !== this._nextPadConnected || lang !== this._nextLabelLang)) {
                this._nextPadConnected = pad;
                this._nextLabelLang = lang;
                this._nextButton.textContent =
                    T('Titlescreen.hyperverse.nextBody') + (pad ? ' (R3)' : ' ›');
            }
            if (this._catalogButton &&
                (pad !== this._catalogPadConnected || lang !== this._catalogLabelLang)) {
                this._catalogPadConnected = pad;
                this._catalogLabelLang = lang;
                this._catalogButton.textContent =
                    T('Titlescreen.hyperverse.catalogButton') + (pad ? ' (L3)' : '');
            }
        }

        // ---- CATALOG panel ---------------------------------------------------
        // The hardcoded bodies, grouped by kind, in the same corner as the
        // readout (which steps aside while the list is up). Picking an entry cuts
        // straight to that body, so the show can be driven to a named object
        // instead of waited out. While it is open it owns the keyboard: the title
        // menu behind it stops reading input until it closes.
        get catalogOpen() { return this._catalogOpen; }

        // True while the title menu must leave the keyboard alone: the panel is
        // up, or the press that closed it has not been consumed yet.
        blocksTitleInput() { return this._catalogOpen || this._catalogGuard > 0; }

        toggleCatalog() {
            if (this._catalogOpen) this.closeCatalog();
            else this.openCatalog();
        }

        openCatalog() {
            if (!this._enabled || this._catalogOpen) return;
            this._catalogList = buildCatalogBodies();
            if (!this._catalogPanel) this._createCatalogPanel();
            // Open on whatever is framed right now when that body is catalogued,
            // so the list starts where the eye already is.
            const cur = this._act && this._act.data ? this._act.data : null;
            const at = cur ? this._catalogList.findIndex(
                d => d === cur || (d.kind === cur.kind && d.name === cur.name)) : -1;
            this._catalogIndex = at >= 0 ? at : 0;
            this._catalogOpen = true;
            this._renderCatalog();
            window.UIPanel.open(this._catalogPanel);
            // A frame later, so the transition actually runs.
            requestAnimationFrame(() => {
                if (this._catalogPanel && this._catalogOpen) {
                    this._catalogPanel.classList.add('title-faded-in');
                }
            });
            this._scrollCatalogIntoView();
            if (window.SoundManager) SoundManager.playOk();
        }

        closeCatalog() {
            if (!this._catalogOpen) return;
            this._catalogOpen = false;
            this._catalogGuard = 2;
            if (this._catalogPanel) {
                this._catalogPanel.classList.remove('title-faded-in');
                window.UIPanel.close(this._catalogPanel);
            }
            this._renderInfo(this._act ? this._act.info : null);
        }

        _createCatalogPanel() {
            const stale = document.getElementById('title-hyperverse-catalog');
            if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
            const box = document.createElement('div');
            box.id = 'title-hyperverse-catalog';
            document.body.appendChild(box);
            this._catalogPanel = box;
            box.className = 'title-plate title-catalog';
            // Presses on the panel are its own: never the free-look drag behind.
            box.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
            this.layout();
        }

        // Rebuild the whole list. Rows carry real listeners rather than inline
        // handlers, so the panel never has to reach back through SceneManager.
        _renderCatalog() {
            const box = this._catalogPanel;
            if (!box) return;
            const em = px => (px / INFO_BASE_FONT).toFixed(3) + 'em';
            box.innerHTML = '';
            this._catalogRows = [];

            const header = document.createElement('div');
            header.textContent = T('Titlescreen.hyperverse.catalogTitle') +
                ' [' + this._catalogList.length + ']';
            header.className = 'title-catalog-head';
            box.appendChild(header);

            const list = document.createElement('div');
            // Positioned so the rows measure their offsetTop against the scroll
            // box itself, which is what _scrollCatalogIntoView works in; minHeight
            // lets the flex child actually shrink and scroll.
            list.className = 'title-catalog-list';
            // RMMZ preventDefaults every wheel event at the document level, so a
            // DOM pane never scrolls on its own: this one scrolls itself, and
            // swallows the event so it cannot also zoom the camera behind.
            list.addEventListener('wheel', (e) => {
                const step = e.deltaMode === 1 ? e.deltaY * 40
                    : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
                list.scrollTop += step;
                e.preventDefault();
                e.stopPropagation();
            });
            this._catalogListEl = list;
            box.appendChild(list);

            const GROUPS = [
                ['planet', 'planets'], ['star', 'stars'], ['blackhole', 'blackHoles'],
                ['galaxy', 'galaxies'], ['cluster', 'clusters'], ['nebula', 'nebulae']
            ];
            for (const [kind, key] of GROUPS) {
                const members = this._catalogList
                    .map((d, i) => ({ d, i }))
                    .filter(e => e.d.kind === kind);
                if (!members.length) continue;
                const gh = document.createElement('div');
                gh.textContent = T('Titlescreen.hyperverse.groups.' + key);
                gh.className = 'title-catalog-group';
                list.appendChild(gh);
                for (const { d, i } of members) list.appendChild(this._catalogRow(d, i, em));
            }
            if (!this._catalogList.length) {
                const empty = document.createElement('div');
                empty.textContent = T('Titlescreen.hyperverse.catalogEmpty');
                empty.className = 'title-catalog-empty';
                list.appendChild(empty);
            }

            const foot = document.createElement('div');
            foot.textContent = T('Titlescreen.hyperverse.catalogControls');
            foot.className = 'title-catalog-foot';
            box.appendChild(foot);

            this._syncCatalogSelection();
            // The row typography is written in em off the panel font, which the
            // layout pass owns; re-run it so a rebuild picks up the current size.
            this.layout();
        }

        // The classification a row shows, taken from wherever that kind keeps it:
        // a planet's `type` is a raw PlanetTypes key, a nebula carries `sub`, and
        // a cluster has no type of its own.
        _catalogTypeLabel(d) {
            if (d.kind === 'planet') return String(d.type || '').replace(/_/g, ' ').toUpperCase();
            if (d.kind === 'nebula') return astroLabel(d.sub).toUpperCase();
            if (d.kind === 'cluster') return astroField('galaxyCluster').toUpperCase();
            return astroLabel(d.type).toUpperCase();
        }

        _catalogRow(d, index, em) {
            const row = document.createElement('div');
            row.className = 'title-catalog-row';
            const name = document.createElement('span');
            name.textContent = d.name;
            name.className = 'title-catalog-name';
            const type = document.createElement('span');
            type.textContent = this._catalogTypeLabel(d);
            type.className = 'title-catalog-type';
            row.appendChild(name);
            row.appendChild(type);
            row.addEventListener('mouseenter', () => {
                if (this._catalogIndex === index) return;
                this._catalogIndex = index;
                this._syncCatalogSelection();
            });
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this._pickCatalog(index);
            });
            this._catalogRows[index] = row;
            return row;
        }

        _syncCatalogSelection() {
            for (let i = 0; i < this._catalogRows.length; i++) {
                const row = this._catalogRows[i];
                if (!row) continue;
                const on = i === this._catalogIndex;
                row.classList.toggle('title-catalog-row--on', on);
            }
        }

        _scrollCatalogIntoView() {
            const row = this._catalogRows[this._catalogIndex];
            const list = this._catalogListEl;
            if (!row || !list) return;
            const top = row.offsetTop, bottom = top + row.offsetHeight;
            if (top < list.scrollTop) list.scrollTop = top;
            else if (bottom > list.scrollTop + list.clientHeight) {
                list.scrollTop = bottom - list.clientHeight;
            }
        }

        // Frame the picked body and close. A datum whose model refuses to build
        // buzzes and leaves the list open rather than dropping the act.
        _pickCatalog(index) {
            const d = this._catalogList[index];
            if (!d) return;
            this._catalogIndex = index;
            if (this.showBody(d)) {
                this.closeCatalog();
                if (window.SoundManager) SoundManager.playOk();
            } else if (window.SoundManager) {
                SoundManager.playBuzzer();
            }
        }

        // While the list is up it owns up/down (move), left/right (page),
        // OK (frame it) and cancel / L3 (close).
        _updateCatalogInput() {
            // Polled first and unconditionally: the pad's edge state has to be
            // read every frame the list is up or a later press reads as stale.
            const padClose = PAD.triggered(PAD.L3);
            if (padClose || Input.isTriggered('cancel')) {
                this.closeCatalog();
                if (window.SoundManager) SoundManager.playCancel();
                return;
            }
            // L2 / R2 scroll the pane while the list has the pad, the way they
            // zoom the camera while it does not.
            if (this._catalogListEl) {
                const down = PAD.value(PAD.R2), up = PAD.value(PAD.L2);
                if (down > 0.15) this._catalogListEl.scrollTop += down * 18;
                if (up > 0.15) this._catalogListEl.scrollTop -= up * 18;
            }
            const n = this._catalogList.length;
            if (!n) return;
            if (Input.isTriggered('ok')) { this._pickCatalog(this._catalogIndex); return; }
            let idx = this._catalogIndex;
            if (Input.isRepeated('down')) idx++;
            else if (Input.isRepeated('up')) idx--;
            else if (Input.isRepeated('right')) idx += 8;
            else if (Input.isRepeated('left')) idx -= 8;
            idx = ((idx % n) + n) % n;
            if (idx === this._catalogIndex) return;
            this._catalogIndex = idx;
            this._syncCatalogSelection();
            this._scrollCatalogIntoView();
            if (window.SoundManager) SoundManager.playCursor();
        }

        // ---- Infobox -------------------------------------------------------
        _createInfoBox() {
            let box = document.getElementById('title-hyperverse-info');
            if (!box) {
                box = document.createElement('div');
                box.id = 'title-hyperverse-info';
                document.body.appendChild(box);
            }
            this._infoBox = box;
            box.className = 'title-plate title-info-box';
            this.layout();
        }

        // Everything hugs the bottom-right corner of the canvas and scales with
        // it: CATALOG at the bottom, NEXT above it, and the readout above both.
        // The catalog panel takes the readout's slot (they are never up at the
        // same time). Their inner type is sized in em off INFO_BASE_FONT, so a
        // resize only has to move the box font-size.
        layout() {
            const rect = TitleLayout.rect();
            // The one measurement that is not a multiple of the scale: how wide
            // the readout may be before it eats the picture behind it.
            const width = s => Math.round(Math.min(340 * s, rect.width * 0.3)) + 'px';
            if (this._infoBox) {
                const s = TitleLayout.place(this._infoBox, { right: 22, bottom: 114 });
                this._infoBox.style.setProperty('--title-w', width(s));
            }
            if (this._catalogPanel) {
                const s = TitleLayout.place(this._catalogPanel, { right: 22, bottom: 114 });
                this._catalogPanel.style.setProperty('--title-w', width(s));
                // Tall enough to browse, short enough to clear the background
                // switcher and its panel in the opposite corner.
                this._catalogPanel.style.setProperty('--title-maxh',
                    Math.round(rect.height * 0.58) + 'px');
            }
            if (this._nextButton) TitleLayout.place(this._nextButton, { right: 22, bottom: 68 });
            if (this._catalogButton) TitleLayout.place(this._catalogButton, { right: 22, bottom: 22 });
        }

        _renderInfo(lines) {
            if (!this._infoBox || !lines) return;
            const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            // The header states which pass produced this body, so the alternation
            // between catalogued and generated objects is readable at a glance.
            const hard = !!(this._act && this._act.hardcoded);
            const source = hard ? T('Titlescreen.hyperverse.catalog') : T('Titlescreen.hyperverse.procedural');
            const lead = T('Titlescreen.hyperverse.lead');
            // A body picked out of the catalog is not at any position in the
            // cycle, so it shows the source alone.
            const picked = !!(this._act && this._act.picked);
            const pos = !picked && this._playlist && this._playlist.length
                ? ` [${this._playIndex}/${this._playlist.length}]` : '';
            // Every inner size is relative to the box font (INFO_BASE_FONT), which
            // is the single value the layout pass rescales.
            const em = px => (px / INFO_BASE_FONT).toFixed(3) + 'em';
            const header = `<div class="title-info-head">${lead}${source}${pos}</div>`;
            const body = lines.map(ln => {
                return `<div class="title-info-line${ln.bold ? ' title-info-line--bold' : ' title-info-line--spaced'}"` +
                    ` style="--title-ink:${ln.color || 'var(--title-amber)'}; --title-size:${em(ln.size || 12)}">${esc(ln.text)}</div>`;
            }).join('');
            const hint = (color, text) =>
                `<div class="title-info-foot" style="--title-ink:${color}">${text}</div>`;
            const foot = this._look.active
                ? hint('#7fe08f', T('Titlescreen.hyperverse.freeLook'))
                : hint('#6f8a99', T('Titlescreen.hyperverse.controls'));
            this._infoBox.innerHTML = header + body + foot;
        }

        _title(t) { return { text: t, color: '#FFD700', size: 18, bold: true }; }
        _sub(t) { return { text: t, color: '#FFA500', size: 13 }; }
        _stat(t) { return { text: t, color: '#9fd9ff', size: 12 }; }

        // ---- Act selection + build -----------------------------------------
        // Frame the next body in the cycle. A datum whose model cannot be built
        // is skipped rather than retried blindly, so a broken kind costs one step
        // of the cycle instead of stalling the show.
        _startAct() {
            if (!this._enabled) return;
            let act = null, data = null;
            for (let tries = 0; tries < 6 && !act; tries++) {
                data = this._nextData();
                if (!data) break;
                try { act = this._actForData(data); } catch (e) { act = null; }
                if (act && !act.group) act = null;
            }
            if (!act) { this._act = null; return; }
            this._beginAct(act, data);
        }

        // Cut to one specific body, whichever the player asked for, dropping the
        // act on screen. Returns false (leaving the show alone) when its model
        // cannot be built.
        showBody(data) {
            if (!this._enabled || !data) return false;
            let act = null;
            try { act = this._actForData(data); } catch (e) { act = null; }
            if (!act || !act.group) return false;
            if (this._act) {
                if (this._scene) this._scene.remove(this._act.group);
                try { if (this._act.dispose) this._act.dispose(); } catch (e) { /* ignore */ }
                this._act = null;
            }
            act.picked = true;
            this._beginAct(act, data);
            return true;
        }

        // Put a built act on screen: source flag, camera framing, sway and the
        // fade timeline. Shared by the cycle and by a hand-picked body.
        _beginAct(act, data) {
            act.hardcoded = !(data && data._procedural);
            // The session's opening body is framed as close as the camera goes,
            // instead of at the act's ordinary fitted distance.
            if (data && data._opener) act.openZoom = HYPERVERSE_MIN_ZOOM;
            this._look.active = false;
            this._look.exiting = false;
            this._look.yaw = this._look.pitch = 0;
            this._look.zoom = 1;
            this._lastZoom = 1;

            this._scene.add(act.group);
            act.frame = 0;
            act.total = this._FADE_IN + this._HOLD + this._FADE_OUT;
            // Gentle cockpit sway parameters, randomised per act.
            act.baseAz = Math.random() * Math.PI * 2;
            act.swayAz = 0.10 + Math.random() * 0.10;
            act.swayEl = 0.04 + Math.random() * 0.05;
            act.azRate = 0.10 + Math.random() * 0.08;
            act.elPhase = Math.random() * Math.PI * 2;
            this._act = act;
            this._renderInfo(act.info);
        }

        // ---- Per-body acts --------------------------------------------------
        // Build one act straight from a catalogue-shaped datum. Catalogued and
        // generated bodies carry the same fields, so every kind takes the same
        // path whichever pass of the cycle produced it.
        _actForData(d) {
            if (!d) return null;
            if (d.kind === 'blackhole') return this._blackHoleAct(d);
            if (d.kind === 'galaxy') return this._galaxyAct(d);
            if (d.kind === 'star') return this._starAct(d);
            if (d.kind === 'planet') return this._planetAct(d);
            if (d.kind === 'cluster') return this._clusterAct(d);
            if (d.kind === 'nebula') return this._nebulaAct(d);
            if (d.kind === 'anomaly') return this._anomalyAct(d);
            return null;
        }

        _clusterAct(d) {
            const res = buildClusterModel({
                seed: d._seed != null ? d._seed : this._hashStr(d.name),
                radius: 420,
                count: Math.max(90, Math.min(320, Math.round(d.members / 5)))
            });
            if (!res || !res.group) return null;
            return {
                group: res.group,
                data: d,
                animate: (t) => { if (res.animate) res.animate(t); },
                dispose: () => res.dispose(),
                viewRadius: res.radius, distK: 1.45, baseElev: 0.30,
                info: this._clusterInfo(d)
            };
        }

        _nebulaAct(d) {
            const C = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
            if (!C || !C.buildNebula) return null;
            const size = d.size || 150;
            const res = C.buildNebula({
                seed: d._seed != null ? d._seed : this._hashStr(d.name),
                size, layers: 16, palette: d.palette
            });
            if (!res || !res.group) return null;
            return {
                group: res.group,
                data: d,
                animate: (t) => { res.group.rotation.y = t * 0.02; },
                dispose: () => res.dispose(),
                viewRadius: size * 0.95, distK: 1.4, baseElev: 0.10,
                info: this._nebulaInfo(d)
            };
        }

        _anomalyAct(d) {
            const C = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
            if (!C || !C.buildAnomaly) return null;
            const scale = d.scale || 60;
            const res = C.buildAnomaly({
                type: d.geometry, scale, color: d.color,
                seed: d._seed != null ? d._seed : this._hashStr(d.name)
            });
            if (!res || !res.group) return null;
            return {
                group: res.group,
                data: d,
                animate: (t) => { res.animate(t); res.group.rotation.y += 0.003; },
                dispose: () => res.dispose(),
                viewRadius: scale * 2.4, distK: 1.5, baseElev: 0.16,
                info: this._anomalyInfo(d)
            };
        }

        // Planets stay still; only the camera drifts (per the brief).
        _planetAct(p) {
            const R3 = window.GalaxySim && window.GalaxySim.Renderer3D;
            if (!R3 || !R3.buildPlanetGroup) return null;
            const seed = p._procedural
                ? ((p._seed || Math.floor(Math.random() * 1e6)) >>> 0)
                : this._hashStr(p.name);
            const group = R3.buildPlanetGroup(p, seed);
            if (!group) return null;
            return {
                group, data: p, animate: () => {}, dispose: () => R3.disposeBodyGroup(group),
                viewRadius: 1.5, distK: 1.3, baseElev: 0.10, sunAngle: true, solid: true,
                info: this._planetInfo(p)
            };
        }

        _starAct(d) {
            const C = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
            // Exotic classes (pulsars, magnetars, protostars, boson stars,
            // rogue planets...) use their bespoke Scene3DCosmos model - the
            // same one the in-game star map renders.
            if (d.exoticType && C && C.buildExoticStar) {
                const res = C.buildExoticStar(
                    { name: d.name, type: d.exoticType, color: d.color },
                    { radius: 1, seed: this._hashStr(d.name) });
                if (res) {
                    let dysonRes = null;
                    if (d.dyson && C.buildDysonSphere) {
                        dysonRes = C.buildDysonSphere({
                            radius: 2.4, mode: d.dyson, seed: this._hashStr(d.name)
                        });
                        res.group.add(dysonRes.group);
                    }
                    const wide = d.exoticType === 'PULSAR' || d.exoticType === 'MAGNETAR' ||
                        d.exoticType === 'WOLF_RAYET' || d.exoticType === 'PROTOSTAR';
                    return {
                        group: res.group,
                        data: d,
                        animate: (t) => { res.animate(t); if (dysonRes) dysonRes.animate(t); },
                        dispose: () => res.dispose(),
                        viewRadius: dysonRes ? 3.2 : (wide ? 5.5 : 1.8),
                        distK: 1.35, baseElev: 0.10, solid: true,
                        info: buildCelestialInfoLines(d)
                    };
                }
            }
            const R3 = window.GalaxySim.Renderer3D;
            if (!R3 || !R3.buildStarGroup) return null;
            const system = {
                name: d.name, color: d.color, radius: d.solarRadius,
                temperature: d.tempK, spectralType: d.spectral
            };
            const group = R3.buildStarGroup(system, this._hashStr(d.name));
            if (!group) return null;
            // Dyson shell around an ordinary star (the Zeta Reticuli pair).
            let dysonRes = null;
            if (d.dyson && C && C.buildDysonSphere) {
                dysonRes = C.buildDysonSphere({
                    radius: 2.3, mode: d.dyson, seed: this._hashStr(d.name)
                });
                group.add(dysonRes.group);
            }
            return {
                group,
                data: d,
                animate: (t) => {
                    if (group._body) group._body.rotation.y = t * 0.06;
                    const m = group._mats;
                    if (m) {
                        if (m[0] && m[0].map) { m[0].map.offset.x = (t * 0.01) % 1; m[0].map.offset.y = Math.sin(t * 0.05) * 0.02; }
                        if (m[1]) m[1].opacity = 0.36 + Math.sin(t * 2.2) * 0.07;
                    }
                    if (dysonRes) dysonRes.animate(t);
                },
                dispose: () => {
                    // The Dyson shell owns real geometry of its own; release it
                    // before the shared-geometry star group teardown.
                    if (dysonRes) dysonRes.dispose();
                    R3.disposeBodyGroup(group);
                },
                viewRadius: dysonRes ? 3.1 : 1.3, distK: 1.35, baseElev: 0.06, solid: true,
                info: buildCelestialInfoLines(d)
            };
        }

        _blackHoleAct(d) {
            const C = window.GalaxySim.Scene3DCosmos;
            if (!C || !C.buildBlackHole) return null;
            const R = 60;
            // Fast-spinning holes are the ones that launch a beam, so the spin
            // drives the odds; the seed comes from the name so a given hole
            // always shows up with (or without) its jets. A hole caught feeding
            // on a donor star is accreting hard and always beams.
            const spin = d.bhSpin != null ? d.bhSpin : 0.5;
            // The giants - supermassive and up - are drawn as Gargantua: a
            // wide, near-uniform disk with its far side lensed over and under
            // the shadow. Everything smaller keeps the plain ring.
            const grand = (d.bhMass || 0) >= 1e6;
            const res = C.buildBlackHole({
                radius: R,
                seed: this._hashStr(d.name),
                jets: d.feeding ? true : undefined,
                jetChance: 0.1 + spin * 0.6,
                jetScale: 4.5 + spin * 3,
                style: grand ? 'interstellar' : undefined
            });
            if (!res || !res.group) return null;
            // X-ray binary: the donor star being stripped + its mass-transfer
            // stream, slowly circling the hole on a pivot.
            let pivot = null, donorGroup = null, donorObj = null, stream = null;
            // The donor rides clear of the disk it is feeding, or the stream
            // has nothing to wrap around on its way in.
            const dOrbit = R * (grand ? 19 : 7.5);
            if (d.feeding) {
                const f = d.feeding;
                const donorRec = {
                    name: f.donorName || d.name + T('Titlescreen.card.donorSuffix'),
                    type: f.donorType || 'O',
                    color: f.donorColor || '#9bb0ff',
                    radius: f.donorRadius || 10,
                };
                const dR = R * 0.85;
                if (C.isExoticStarType && C.isExoticStarType(donorRec.type) && C.buildExoticStar) {
                    donorObj = C.buildExoticStar(donorRec, { radius: 1, seed: this._hashStr(donorRec.name) });
                    donorGroup = donorObj && donorObj.group;
                } else {
                    const R3 = window.GalaxySim.Renderer3D;
                    donorGroup = R3 && R3.buildStarGroup ? R3.buildStarGroup(donorRec) : null;
                }
                if (donorGroup) {
                    pivot = new window.THREE.Group();
                    res.group.add(pivot);
                    donorGroup.scale.setScalar(dR);
                    donorGroup.position.set(dOrbit, 0, 0);
                    pivot.add(donorGroup);
                    if (C.buildAccretionStream) {
                        stream = C.buildAccretionStream({
                            // toRadius is the rim of the disk the stream winds
                            // onto; length is the full separation, since the
                            // stream now wraps around the hole rather than
                            // stopping short of it.
                            fromRadius: dR,
                            toRadius: R * (grand ? 9.4 : 3.8),
                            length: dOrbit,
                            seed: this._hashStr(donorRec.name) + 7,
                        });
                        stream.group.position.copy(donorGroup.position);
                        stream.group.lookAt(0, 0, 0);
                        pivot.add(stream.group);
                    }
                }
            }
            return {
                group: res.group,
                data: d,
                animate: (t) => {
                    res.animate(t);
                    if (pivot) pivot.rotation.y = t * 0.018;
                    if (donorObj) donorObj.animate(t);
                    else if (donorGroup && donorGroup._body) donorGroup._body.rotation.y = t * 0.07;
                    if (stream) stream.animate(t);
                },
                // Jets need room in frame; a bare hole can sit closer, a
                // Gargantua-style disk is wide on its own, and a feeding binary
                // needs the whole donor orbit and its coiling stream visible.
                viewRadius: R * Math.max(res.hasJets ? 6 : 4, grand ? 11 : 0,
                    pivot ? dOrbit / R + 2.5 : 0),
                // Screen-space lensing (see LENS_FRAG). Real Einstein radii
                // grow as sqrt(M), which across the 1e-5 -> 7e10 solar-mass
                // range these holes span is eight orders of magnitude, far too
                // wide to put on screen. The deflection scale is therefore
                // mapped logarithmically, so every class reads as itself: a
                // primordial pinhead barely shimmers, a stellar hole smears the
                // field, and an ultramassive one wraps the sky right around it.
                lens: {
                    horizon: R,
                    massK: Math.max(0.25, Math.min(7,
                        0.55 + 0.5 * Math.log10(Math.max(1, d.bhMass || 10)))),
                    spin,
                    screenR: 0
                },
                dispose: () => {
                    // Detach the donor before the generic teardown: a default
                    // star group shares Renderer3D's sphere geometry, which
                    // must never be disposed with the act.
                    if (donorGroup && !donorObj) {
                        pivot.remove(donorGroup);
                        const R3 = window.GalaxySim.Renderer3D;
                        if (R3 && R3.disposeBodyGroup) R3.disposeBodyGroup(donorGroup);
                    }
                    res.dispose();
                },
                distK: 1.35, baseElev: 0.22, solid: true,
                info: buildCelestialInfoLines(d, { jets: res.hasJets })
            };
        }

        _galaxyAct(d) {
            const seed = d._seed != null ? d._seed : this._hashStr(d.name);
            const shape = d.shape || _galaxyShapeFromType(d.type);
            // Catalogued galaxies force their published shape; procedural ones
            // let the model choose, then adopt what it produced for the readout.
            const opts = d._procedural
                ? { seed, radius: 220 }
                : {
                    seed, radius: 220, arms: d.arms || (shape === 'spiral' ? 2 : 0) || 2,
                    barred: /barred/i.test(d.type || ''), elliptical: shape === 'elliptical'
                };
            const res = buildGalaxyModel(opts);
            if (!res || !res.group) return null;
            const info = buildCelestialInfoLines(d._procedural
                ? Object.assign({}, d, {
                    type: res.barred ? 'Barred Spiral Galaxy' : 'Spiral Galaxy', // i18n-ignore: ids, localised by astroLabel()
                    arms: res.arms
                })
                : d);
            return {
                group: res.group,
                data: d,
                animate: (t) => { if (res.animate) res.animate(t); },
                dispose: () => res.dispose(),
                viewRadius: res.radius, distK: 1.35, baseElev: 0.5,
                info
            };
        }

        // ---- Custom infobox line sets --------------------------------------
        _planetInfo(p) {
            const pl = k => T('Titlescreen.planet.' + k);
            // Catalogued bodies span six orders of magnitude in mass (Ceres to
            // Jupiter), so small values keep significant digits instead of 0.00.
            const num = v => (v >= 1 ? v.toFixed(2) : Number(v).toPrecision(2));
            const lines = [
                this._title(String(p.name).toUpperCase()),
                this._sub(pl(p.moon ? 'moon' : 'planet')
                    + String(p.type || '').toUpperCase().replace(/_/g, ' ')),
                this._stat(`${pl('radius')} ${num(p.radius)}  ${pl('mass')} ${num(p.mass)}  [${pl('earth')}=1]`),
                this._stat(`${pl('orbit')} ${p.orbitRadius.toFixed(2)} AU  ECC ${p.eccentricity.toFixed(2)}`),
                this._stat(`${pl('period')} ${p.period.toFixed(2)} ${pl('years')}  TEMP ${p.temperature} K`),
                this._stat(`${pl('atmosphere')} ${p.atmosphere ? pl('yes') : pl('no')}  ${pl('moons')} ${p.moons}`)
            ];
            if (p.biome) lines.push(this._stat(pl('biome') + window.BiomeNames.display(p.biome).toUpperCase()));
            return lines;
        }

        _clusterInfo(d) {
            const lines = [
                this._title(String(d.name).toUpperCase()),
                this._sub(astroField('galaxyCluster')),
                this._stat(`${astroField('members')} ~${d.members} ${astroField('galaxies')}`),
                this._stat(`${astroField('diameter')} ${d.diamMly.toFixed(1)} Mly`), // i18n-ignore: Mly is a unit
                this._stat(`${astroField('mass')} ${d.mass.toExponential(2)} [${astroField('sun')}=1]`),
                this._stat(`REDSHIFT z ${d.z.toFixed(3)}`)
            ];
            if (d.distMly != null) {
                lines.push(this._stat(`${astroField('distance')} ${Math.round(d.distMly).toLocaleString()} Mly`)); // i18n-ignore: Mly is a unit
            }
            return lines;
        }

        // Readout for a nebula (span / distance / composition). Generated ones
        // carry the same fields as the catalogued entries.
        _nebulaInfo(d) {
            return [
                this._title(String(d.name).toUpperCase()),
                this._sub(astroLabel(d.sub).toUpperCase()),
                this._stat(`${astroField('span')} ${d.spanLy} ${astroField('lightYears')}`),
                this._stat(`${astroField('distance')} ${d.distanceLy.toLocaleString()} ${astroField('lightYears')}`),
                this._stat(`${astroField('constellation')} ${d.constellation.toUpperCase()}`),
                this._stat(`${astroField('composition')} ${d.composition}`)
            ];
        }

        _anomalyInfo(d) {
            return [
                this._title(String(d.name).toUpperCase()),
                this._sub(astroLabel('Higher-Dimensional Anomaly').toUpperCase()), // i18n-ignore: id argument
                this._stat(`${astroField('geometry')} ${T('Astronomy.geometry.' + d.geometry)}`),
                this._stat(`${astroField('dimensions')} 4D -> 3D ${astroField('projection')}`),
                this._stat(`${T('Titlescreen.anomaly.flux')} ${(d.flux || 0).toFixed(2)} ct/s`),
                this._stat(T('Titlescreen.anomaly.curvature'))
            ];
        }

        // No per-frame spawning: the act system drives the whole background.
        spawn() {}

        update() {
            if (!this._enabled) return;
            const { w, h } = this._viewSize();
            const t = this._clock ? this._clock.getElapsedTime() : 0;

            if (this._renderer && (this._renderer._lastW !== w || this._renderer._lastH !== h)) {
                this._renderer.setSize(w, h);
                this._camera.aspect = w / h;
                this._camera.updateProjectionMatrix();
                this._renderer._lastW = w;
                this._renderer._lastH = h;
            }

            if (this._starfield) this._starfield.rotation.y = t * 0.006;

            if (this._catalogGuard > 0) this._catalogGuard--;
            // The catalog is modal: while it is up it takes the pad and the
            // keyboard, so browsing never pans the camera or steps the show.
            if (this._catalogOpen) {
                this._updateCatalogInput();
            } else {
                this._updatePadLook();
                this._updateNextInput();
            }
            this._refreshControlLabels();
            // The controls stay legible even between acts, so a body that failed
            // to build never leaves invisible buttons in the corner.
            if (!this._act) {
                if (this._nextButton) this._nextButton.style.setProperty('--title-fade', '0.5');
                if (this._catalogButton) this._catalogButton.style.setProperty('--title-fade', '0.5');
            }

            if (!this._act) {
                this._startAct();
            } else {
                const act = this._act;
                const free = this._isFreeLook();
                // Free-look holds the act: the timeline only advances far enough
                // to finish the fade-in, so the body stays framed while explored.
                // Browsing the catalog holds it the same way, so the body being
                // compared against the list never fades out mid-choice.
                if ((!free && !this._catalogOpen) || act.frame < this._FADE_IN) act.frame++;
                try { if (act.animate) act.animate(t); } catch (e) { /* skip a bad frame */ }

                // Cockpit camera: fit the body, gentle sway + a slow dolly-in.
                const vFovHalf = (this._camera.fov * Math.PI / 180) / 2;
                const fit = act.viewRadius / Math.tan(vFovHalf);
                const dolly = 1 - 0.07 * Math.min(1, act.frame / act.total);
                // Solid bodies stop at their surface; diffuse ones (galaxies,
                // nebulae, clusters) can be flown right into. Same near limit
                // free-look uses below, so the opener sits exactly where a
                // player zooming all the way in would end up.
                const near = act.viewRadius * (act.solid ? 1.05 : 0.05);
                let dist = fit * act.distK * dolly;
                if (act.openZoom) dist = Math.max(near, dist * act.openZoom);
                let az = act.baseAz + Math.sin(t * act.azRate) * act.swayAz;
                let el = act.baseElev + Math.sin(t * act.azRate * 0.7 + act.elPhase) * act.swayEl;
                if (free || this._look.exiting) {
                    az = this._look.baseAz + this._look.yaw;
                    el = Math.max(-1.45, Math.min(1.45, this._look.baseEl + this._look.pitch));
                    dist = Math.max(near, fit * act.distK * this._look.zoom);
                }
                // The lens follows the camera: the horizon's on-screen radius
                // (uv units, screen height = 1) is all the shader needs, since
                // the hole is always framed dead centre.
                if (act.lens) {
                    act.lens.screenR = act.lens.horizon / (2 * dist * Math.tan(vFovHalf));
                }
                this._lastAz = az;
                this._lastEl = el;
                // Read the auto camera's zoom back off the distance it settled
                // on (normally the dolly, at the near limit for the opener), so
                // grabbing free-look mid-act never snaps the view.
                this._lastZoom = (free || this._look.exiting)
                    ? this._look.zoom : dist / (fit * act.distK);
                const ce = Math.cos(el), se = Math.sin(el);
                this._camera.position.set(Math.cos(az) * ce * dist, se * dist, Math.sin(az) * ce * dist);
                this._camera.lookAt(0, 0, 0);

                // Keep depth precision sane across the huge scale range.
                this._camera.near = Math.max(0.005, dist * 0.02);
                this._camera.far = Math.max(60000, dist * 6);
                this._camera.updateProjectionMatrix();

                if (act.sunAngle && this._sun) {
                    this._sun.position.set(Math.cos(az + 1.15) * dist, dist * 0.45, Math.sin(az + 1.15) * dist);
                }

                // Cross-fade timeline (0 -> 1 in, hold, 1 -> 0 out).
                let op = 1;
                if (act.frame < this._FADE_IN) op = act.frame / this._FADE_IN;
                else if (act.frame > this._FADE_IN + this._HOLD) {
                    op = Math.max(0, 1 - (act.frame - this._FADE_IN - this._HOLD) / this._FADE_OUT);
                }
                if (this._canvasEl) this._canvasEl.style.setProperty('--title-fade', op.toFixed(3));
                // The readout steps aside for the catalog panel, which stands in
                // the same corner.
                if (this._infoBox) {
                    this._infoBox.style.setProperty('--title-fade', this._catalogOpen ? '0' : op.toFixed(3));
                }
                // The controls belong to the act, but must stay usable through
                // the fade-out, so they never dim below half.
                const ctlOp = Math.max(0.5, op).toFixed(3);
                if (this._nextButton) this._nextButton.style.setProperty('--title-fade', ctlOp);
                if (this._catalogButton) this._catalogButton.style.setProperty('--title-fade', ctlOp);

                if (act.frame >= act.total) {
                    this._scene.remove(act.group);
                    try { if (act.dispose) act.dispose(); } catch (e) { /* ignore */ }
                    this._act = null;
                    this._startAct();
                }
            }

            // Black hole acts take the lensing path; everything else renders
            // straight through (via the PSX downsample when it is on).
            const lens = this._act && this._act.lens;
            if (lens && lens.screenR > 0 && !this._lensFailed) {
                try { this._renderLensed(lens); return; }
                catch (e) {
                    // One failure retires the pass for the rest of the session
                    // rather than throwing (and rebuilding targets) every frame.
                    console.warn('[Hyperverse] lensing pass disabled:', e);
                    this._lensFailed = true;
                    this._disposeLens();
                }
            }
            if (window.PSXShader) {
                try { window.PSXShader.render(this._renderer, this._scene, this._camera); }
                catch (e) { this._renderer.render(this._scene, this._camera); }
            } else {
                this._renderer.render(this._scene, this._camera);
            }
        }

        // ---- Lensing pass ---------------------------------------------------
        // Lazily build (and resize) the two render targets and the fullscreen
        // quad the lensing pass needs. One quad and one scene are shared: the
        // material is swapped between the lens shader and the final blit.
        _lensCtx(w, h) {
            const THREE = window.THREE;
            let L = this._lens;
            if (!L) {
                const lensMat = new THREE.ShaderMaterial({
                    uniforms: {
                        tDiffuse: { value: null },
                        uAspect: { value: 1 },
                        uHorizon: { value: 0.1 },
                        uEinstein: { value: 0.1 },
                        uSpin: { value: 0 }
                    },
                    vertexShader: LENS_VERT,
                    fragmentShader: LENS_FRAG,
                    depthTest: false, depthWrite: false, transparent: false
                });
                lensMat.blending = THREE.NoBlending;
                const blitMat = new THREE.MeshBasicMaterial({
                    map: null, depthTest: false, depthWrite: false, transparent: false
                });
                blitMat.blending = THREE.NoBlending;
                const geo = new THREE.PlaneGeometry(2, 2);
                const quad = new THREE.Mesh(geo, lensMat);
                quad.frustumCulled = false;
                const scene = new THREE.Scene();
                scene.add(quad);
                const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
                cam.position.z = 1;
                L = this._lens = { geo, quad, scene, cam, lensMat, blitMat, sky: null, comp: null, w: 0, h: 0 };
            }
            if (L.w !== w || L.h !== h) {
                if (L.sky) L.sky.dispose();
                if (L.comp) L.comp.dispose();
                // The sky is sampled with a moving offset, so it filters
                // linearly; the composite is only ever blitted 1:1 or upscaled
                // from the PSX resolution, where nearest is the whole point.
                L.sky = new THREE.WebGLRenderTarget(w, h, {
                    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
                });
                L.comp = new THREE.WebGLRenderTarget(w, h, {
                    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
                    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
                });
                L.lensMat.uniforms.tDiffuse.value = L.sky.texture;
                L.blitMat.map = L.comp.texture;
                L.blitMat.needsUpdate = true;
                L.w = w; L.h = h;
            }
            return L;
        }

        // Four passes: sky alone -> bent sky -> hole on top -> present. The
        // internal targets run at the resolution the PSX downsample would have
        // used and the final blit is nearest-filtered, so the retro look
        // survives the detour (the per-material PSX patches are untouched).
        _renderLensed(lens) {
            const r = this._renderer, act = this._act;
            const psx = window.PSXShader;
            const scale = (psx && psx.enabled && psx.downscale < 0.999) ? psx.downscale : 1;
            const cw = r.domElement.width, ch = r.domElement.height;
            const L = this._lensCtx(
                Math.max(1, Math.floor(cw * scale)), Math.max(1, Math.floor(ch * scale)));

            const u = L.lensMat.uniforms;
            u.uAspect.value = ch ? cw / ch : 1;
            u.uHorizon.value = lens.screenR;
            u.uEinstein.value = lens.screenR * Math.sqrt(lens.massK);
            u.uSpin.value = lens.spin || 0;

            // The finally leaves the renderer and the scene exactly as the
            // plain path expects them, so a failed frame falls back cleanly
            // instead of stranding a hidden body or a bound render target.
            try {
                // 1. The sky the hole is standing in front of, on its own.
                act.group.visible = false;
                r.setRenderTarget(L.sky);
                r.clear();
                r.render(this._scene, this._camera);
                act.group.visible = true;

                // 2. Bend it into the composite target.
                L.quad.material = L.lensMat;
                r.setRenderTarget(L.comp);
                r.clear();
                r.render(L.scene, L.cam);

                // 3. The hole itself, unwarped, over the bent sky (the star
                //    field is already in there, lensed, so it sits this out).
                if (this._starfield) this._starfield.visible = false;
                r.autoClearColor = false;
                r.render(this._scene, this._camera);
                r.autoClearColor = true;
                if (this._starfield) this._starfield.visible = true;

                // 4. Present.
                r.setRenderTarget(null);
                L.quad.material = L.blitMat;
                r.render(L.scene, L.cam);
            } finally {
                if (act.group) act.group.visible = true;
                if (this._starfield) this._starfield.visible = true;
                r.autoClearColor = true;
                r.setRenderTarget(null);
                L.quad.material = L.blitMat;
            }
        }

        _disposeLens() {
            const L = this._lens;
            if (!L) return;
            this._lens = null;
            try {
                if (L.sky) L.sky.dispose();
                if (L.comp) L.comp.dispose();
                if (L.geo) L.geo.dispose();
                if (L.lensMat) L.lensMat.dispose();
                if (L.blitMat) L.blitMat.dispose();
            } catch (e) { /* ignore */ }
        }

        dispose() {
            this._unbindLookInput();
            for (const el of [this._nextButton, this._catalogButton, this._catalogPanel]) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            }
            this._nextButton = this._catalogButton = this._catalogPanel = null;
            this._catalogListEl = null;
            this._catalogRows = [];
            this._catalogOpen = false;
            this._catalogGuard = 0;
            if (!this._enabled) return;
            if (this._act) {
                if (this._scene) this._scene.remove(this._act.group);
                try { if (this._act.dispose) this._act.dispose(); } catch (e) { /* ignore */ }
                this._act = null;
            }
            if (this._starfield) {
                if (this._scene) this._scene.remove(this._starfield);
                if (this._starfield.geometry) this._starfield.geometry.dispose();
                if (this._starfield.material) this._starfield.material.dispose();
                this._starfield = null;
            }
            if (this._infoBox && this._infoBox.parentNode) this._infoBox.parentNode.removeChild(this._infoBox);
            this._infoBox = null;
            if (this._canvasEl && this._canvasEl.parentNode) this._canvasEl.parentNode.removeChild(this._canvasEl);
            this._canvasEl = null;
            this._disposeLens();
            // dispose() leaves the WebGL context itself alive. The browser caps
            // live contexts and force-loses the OLDEST past the cap, which is
            // the game's own canvas: PIXI then silently stops rendering and the
            // picture freezes until the game is restarted. The title screen is
            // re-entered freely, so the context has to be handed back here.
            try { if (this._renderer) this._renderer.dispose(); } catch (e) { /* ignore */ }
            try {
                if (this._renderer && this._renderer.forceContextLoss) this._renderer.forceContextLoss();
            } catch (e) { /* ignore */ }
            this._renderer = null;
            this._enabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // Auto Drive: the camper driving the REAL world map behind the title, on
    // autopilot. This is a thin wrapper around VoxelWorldSystem: the drive
    // scene renders the actual 3D world (terrain, biomes, roads, traffic,
    // weather and time of day) and its autopilot follows the tagged road
    // network, choosing a random way on at every crossroad and T-junction.
    // The wrapper only owns the little region / road / speed readout and the
    // scene's lifetime; the drive runs its own render loop.
    // -------------------------------------------------------------------------
    class AutoDriveBackground {
        constructor() {
            const sys = window.VoxelWorldSystem;
            this._enabled = !!(window.THREE && sys && sys.startTitleDrive);
            this._drive = null;
            this._startTries = 0;
            if (!this._enabled) return;
            this._createInfoBox();
            this._start();
        }

        get available() { return this._enabled; }

        // The world's road tags are fetched asynchronously at boot, so the drive
        // may have to wait a beat for a route to plan; update() keeps trying.
        _start() {
            const sys = window.VoxelWorldSystem;
            if (!sys || this._drive) return;
            try {
                if (window.MinigameArcade) {
                    // The world lookups read $gameSystem / $gameVariables, which
                    // do not exist on a cold title screen.
                    window.MinigameArcade.ensureGameObjects();
                } else if (typeof $gameParty === 'undefined' || !$gameParty) {
                    DataManager.createGameObjects();
                }
                this._drive = sys.startTitleDrive();
            } catch (e) {
                console.warn('[AutoDrive] could not start the world drive:', e);
                this._enabled = false;
            }
        }

        // ---- Infobox -------------------------------------------------------
        _createInfoBox() {
            let box = document.getElementById('title-autodrive-info');
            if (!box) { box = document.createElement('div'); box.id = 'title-autodrive-info'; document.body.appendChild(box); }
            this._infoBox = box;
            box.className = 'title-plate title-info-box title-info-box--slow';
            const ap = k => T('Titlescreen.autopilot.' + k);
            const em = px => (px / INFO_BASE_FONT).toFixed(3) + 'em';
            box.innerHTML =
                `<div class="title-info-head">${ap('header')}</div>` +
                `<div class="title-drive-road" id="ad-road">--</div>` +
                `<div class="title-drive-place" id="ad-place">--</div>` +
                `<div class="title-drive-stat" id="ad-speed">${ap('speed')} -- km/h</div>` +
                `<div class="title-drive-stat" id="ad-head">${ap('heading')} --</div>` +
                `<div class="title-info-foot">${ap('lookHint')}</div>`;
            this._roadEl = box.querySelector('#ad-road');
            this._placeEl = box.querySelector('#ad-place');
            this._speedEl = box.querySelector('#ad-speed');
            this._headEl = box.querySelector('#ad-head');
            this.layout();
        }

        // Bottom-right of the canvas, scaled with it.
        layout() {
            if (!this._infoBox) return;
            const rect = TitleLayout.rect();
            const s = TitleLayout.place(this._infoBox, { right: 22, bottom: 22 });
            this._infoBox.style.setProperty('--title-w',
                Math.round(Math.min(320 * s, rect.width * 0.3)) + 'px');
        }

        spawn() {}

        update() {
            if (!this._enabled) return;
            // Still waiting on the world data: retry roughly twice a second.
            if (!this._drive) {
                if (++this._startTries % 30 === 0) this._start();
                return;
            }
            this._infoBox.classList.add('title-faded-in');

            // The drive renders itself; only the readout needs refreshing, and
            // four times a second is plenty for a status panel.
            this._tick = (this._tick || 0) + 1;
            if (this._tick % 15 !== 0) return;
            let info = null;
            try { info = this._drive.getTitleInfo(); } catch (e) { return; }
            if (!info) return;
            const ap = k => T('Titlescreen.autopilot.' + k);
            const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            this._roadEl.textContent = esc(info.road);
            this._placeEl.textContent = esc(info.place).toUpperCase();
            this._speedEl.textContent = `${ap('speed')} ${info.kmh} km/h`;
            const dirs = T.obj('Titlescreen.autopilot.compass');
            this._headEl.textContent =
                `${ap('heading')} ${dirs[info.heading] || info.heading}`;
        }

        dispose() {
            const sys = window.VoxelWorldSystem;
            // Only ever stop OUR drive: a free-play drive opened from the
            // minigames menu owns the system by then.
            if (this._drive && sys && sys.isActive() && sys.isTitleDrive()) sys.stop();
            this._drive = null;
            if (this._infoBox && this._infoBox.parentNode) this._infoBox.parentNode.removeChild(this._infoBox);
            this._infoBox = null;
            this._enabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // Scene_Title mesh + cards with fixed connection tracking and hover interaction
    // -------------------------------------------------------------------------
    const _Scene_Title_create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function () {
        // Up before a single piece of the screen is built, so not one frame of
        // the assembly (or of the window still settling) is ever seen.
        TitleVeil.raise();
        this._veilLifted = false;
        _Scene_Title_create.call(this);
        this._connections = {};
        this._cardIdCounter = 0; // Counter for unique card IDs
        this._lineGraphics = new PIXI.Graphics();
        this.addChildAt(this._lineGraphics, 0);
        this._floatingContainer = new PIXI.Container();
        this.addChildAt(this._floatingContainer, 1);

        // Create and add logo image
        this._logoSprite = new LogoSprite();
        this.addChild(this._logoSprite);

        // Create HTML overlay for the command menu
        this._selectedCommandIndex = 0;
        this.createUIOverlay();

        // Resolve which background style to show (Random reshuffles each launch).
        // _bgSelection tracks the option-menu-level choice (may be 'random'),
        // while _bgMode is the concrete renderer actually on screen.
        this._bgSelection = this._resolveBackgroundSelection();
        this._bgMode = this._resolveBackgroundMode();
        if (this._bgMode === 'artifacts' || this._bgMode === 'weapons') {
            this._weaponBg = new ArtifactBackground(this._bgMode);
            // Fall back to the classic cards if the 3D stack is unavailable
            if (!this._weaponBg.available) this._bgMode = 'cards';
        } else if (this._bgMode === 'bestiary') {
            // 3D or flat is the enemy battler option's call, not a mode of its own.
            this.startBestiaryBackground();
        } else if (this._bgMode === 'hyperverse') {
            this._hyperverseBg = new HyperverseBackground();
            // Fall back to the classic cards if GalaxySim/THREE is unavailable
            if (!this._hyperverseBg.available) { this._hyperverseBg = null; this._bgMode = 'cards'; }
        } else if (this._bgMode === 'autodrive') {
            this._autoDriveBg = new AutoDriveBackground();
            // Fall back to the classic cards if THREE is unavailable
            if (!this._autoDriveBg.available) { this._autoDriveBg = null; this._bgMode = 'cards'; }
        }

        // Top-right button to change the active background on the fly
        this.createBgSwitchButton();

        // ... and the music selector on the plate right under it
        this.createMusicSwitchButton();

        // Top-left build badge (VersionText parameter)
        this.createVersionBadge();

        // English / Italian flags, docked under the badge
        // The game is locked to English, so the flag selector stays off the title.
        if (!(window.HendrixLocalization && window.HendrixLocalization.isLocked && window.HendrixLocalization.isLocked())) {
            this.createLanguageSelector();
        }

        // Update notice under the flags, plus the launch check that fills it in
        this.createUpdateButton();
        this.beginUpdateCheck();

        // Bottom-right early-build disclaimer (EnableDisclaimer parameter)
        this.createDisclaimerBox();

        // 3D backgrounds live in a DOM canvas above the game canvas, so the
        // logo is re-layered on top of them.
        this.updateLogoLayer();

        // Size and place every HTML panel against the canvas (update() repeats
        // this whenever the window changes), and keep them invisible until the
        // canvas has stopped resizing, so the boot maximize / fullscreen switch
        // is never seen rescaling the UI.
        this.layoutOverlays();
        this.beginOverlaySettle();

        // Spawn initial background items with a short stagger so the screen
        // fills promptly without a long gap before the steady cadence kicks in.
        // The first one goes out immediately; the rest follow in quick succession.
        for (let i = 0; i < 4; i++) {
            const delay = i * 140;
            if (delay === 0) { this.spawnBackgroundItem(); continue; }
            setTimeout(() => {
                if (this._isDestroyed) return;
                this.spawnBackgroundItem();
            }, delay);
        }
    };

    // The single source of truth shared with the options menu
    // (ConfigManager.titleBackground). 0 is the "random" pseudo-mode; the rest
    // map one-to-one to a concrete renderer. Keep this in step with the option
    // ordering in GameOptions.js (titleBgNames).
    // 6 was the retired standalone "Enemies 3D" preset: the bestiary now draws
    // its monsters in 3D or flat according to the enemy battler option, so an
    // old config carrying 6 simply lands on the bestiary.
    const BG_CONFIG_TO_MODE = {
        0: 'random', 1: 'cards', 2: 'space', 3: 'artifacts',
        4: 'bestiary', 5: 'weapons', 6: 'bestiary', 7: 'hyperverse', 8: 'autodrive'
    };
    const BG_MODE_TO_CONFIG = {
        random: 0, cards: 1, space: 2, artifacts: 3,
        bestiary: 4, weapons: 5, hyperverse: 7, autodrive: 8
    };

    // The option-menu-level selection ('random' or a concrete mode), read from
    // ConfigManager so the on-screen switcher and the options menu stay synced.
    Scene_Title.prototype._resolveBackgroundSelection = function () {
        let mode = (typeof ConfigManager !== 'undefined') ? ConfigManager.titleBackground : 7;
        if (mode === undefined || mode === null) mode = 7;
        return BG_CONFIG_TO_MODE[mode] || 'hyperverse';
    };

    // Map the saved option (0 Random, 1 Cards, 2 Space, 3 Artifacts, 4 Bestiary,
    // 5 Weapons, 7 Hyperverse, 8 Camper Drive) to a concrete
    // renderer. Hyperverse is the default. The unified "Space" preset mixes
    // planets, stars, black holes and galaxies into one starfield.
    Scene_Title.prototype._resolveBackgroundMode = function () {
        let mode = (typeof ConfigManager !== 'undefined') ? ConfigManager.titleBackground : 7;
        if (mode === undefined || mode === null) mode = 7;
        if (mode === 0) {
            const choices = ['cards', 'space', 'bestiary'];
            if (window.THREE && window.WeaponSystemProcedural && window.WeaponThreeScene) {
                choices.push('artifacts', 'weapons');
            }
            if (window.THREE && window.GalaxySim) {
                choices.push('hyperverse');
            }
            if (window.THREE && window.VoxelWorldSystem && window.VoxelWorldSystem.startTitleDrive) {
                choices.push('autodrive');
            }
            return choices[Math.floor(Math.random() * choices.length)];
        }
        return BG_CONFIG_TO_MODE[mode] || 'hyperverse';
    };

    // Human-readable labels for the on-screen background switcher.
    const BG_MODE_LABELS = () => T.obj('Titlescreen.bgMode');

    // The selections offered by the top-right switcher, in cycle order:
    // Hyperverse (the default) first, Camper Drive second, then the rest, with
    // 'random' always last. Only modes whose renderer is actually loaded are
    // offered; 'random' is always available and reshuffles the concrete
    // background each pick. Keep in step with TITLE_BG_ORDER in GameOptions.js.
    Scene_Title.prototype.getAvailableBackgroundModes = function () {
        const modes = [];
        if (window.THREE && window.GalaxySim) modes.push('hyperverse');
        if (window.THREE && window.VoxelWorldSystem && window.VoxelWorldSystem.startTitleDrive) {
            modes.push('autodrive');
        }
        modes.push('cards', 'space', 'bestiary');
        if (window.THREE && window.WeaponSystemProcedural && window.WeaponThreeScene) {
            modes.push('artifacts', 'weapons');
        }
        modes.push('random');
        return modes;
    };

    // Bring the bestiary background up in the shape the enemy battler option
    // asks for: the animated 3D models when it is set to 3D (and the Battler3D
    // stack is there), otherwise the flat monster cards, which pick the <Char:>
    // sheet or the battler image for themselves. Nothing to build in the flat
    // case: the cards are ordinary floating PIXI items.
    Scene_Title.prototype.startBestiaryBackground = function () {
        if (!bestiaryWants3D()) return;
        const bg = new Enemies3DBackground();
        if (bg.available) this._enemies3dBg = bg;
        else bg.dispose();
    };

    // Step to the next (dir = 1) or previous (dir = -1) selection, wrapping.
    Scene_Title.prototype.cycleBackgroundMode = function (dir) {
        const modes = this.getAvailableBackgroundModes();
        if (!modes.length) return;
        const step = dir === -1 ? -1 : 1;
        let idx = modes.indexOf(this._bgSelection);
        if (idx < 0) idx = modes.indexOf(this._bgMode);
        if (idx < 0) idx = 0;
        SoundManager.playCursor();
        this.setBackgroundMode(modes[(idx + step + modes.length) % modes.length]);
    };

    // Tear the current background down and switch to `mode`, reusing the same
    // container / mesh so the transition is seamless.
    Scene_Title.prototype.setBackgroundMode = function (mode) {
        // Record the option-menu-level selection and push it to ConfigManager so
        // the options menu stays in sync, then resolve to a concrete renderer.
        // 'random' reshuffles a concrete background but keeps the label 'RANDOM'.
        this._bgSelection = mode;
        if (typeof ConfigManager !== 'undefined' && BG_MODE_TO_CONFIG[mode] !== undefined) {
            ConfigManager.titleBackground = BG_MODE_TO_CONFIG[mode];
            if (typeof ConfigManager.save === 'function') ConfigManager.save();
        }
        if (mode === 'random') mode = this._resolveBackgroundMode();

        if (this._weaponBg) { this._weaponBg.dispose(); this._weaponBg = null; }
        if (this._enemies3dBg) { this._enemies3dBg.dispose(); this._enemies3dBg = null; }
        if (this._hyperverseBg) { this._hyperverseBg.dispose(); this._hyperverseBg = null; }
        if (this._autoDriveBg) { this._autoDriveBg.dispose(); this._autoDriveBg = null; }

        // Clear the floating PIXI items, destroying per-instance canvas textures
        // (planets / celestials) while leaving shared textures like IconSet alone.
        if (this._floatingContainer) {
            for (let i = this._floatingContainer.children.length - 1; i >= 0; i--) {
                const c = this._floatingContainer.children[i];
                this._floatingContainer.removeChild(c);
                if (c._texture) { try { c._texture.destroy(true); } catch (e) { /* ignore */ } }
            }
        }
        this._connections = {};
        this._lastMembershipSig = null;
        if (this._lineGraphics) this._lineGraphics.clear();

        this._bgMode = mode;
        // A background that fails to build must never leave the title stuck:
        // fall back to the always-available cards preset instead of throwing.
        try {
            if (mode === 'artifacts' || mode === 'weapons') {
                this._weaponBg = new ArtifactBackground(mode);
                if (!this._weaponBg.available) { this._weaponBg.dispose(); this._weaponBg = null; this._bgMode = 'cards'; }
            } else if (mode === 'bestiary') {
                this.startBestiaryBackground();
            } else if (mode === 'hyperverse') {
                this._hyperverseBg = new HyperverseBackground();
                if (!this._hyperverseBg.available) { this._hyperverseBg.dispose(); this._hyperverseBg = null; this._bgMode = 'cards'; }
            } else if (mode === 'autodrive') {
                this._autoDriveBg = new AutoDriveBackground();
                if (!this._autoDriveBg.available) { this._autoDriveBg.dispose(); this._autoDriveBg = null; this._bgMode = 'cards'; }
            }
        } catch (e) {
            console.warn('[Titlescreen] background "' + mode + '" failed to start:', e);
            this._weaponBg = this._enemies3dBg = this._hyperverseBg = this._autoDriveBg = null;
            this._bgMode = 'cards';
        }

        this._bgSpawnCd = 0; // repopulate the new background promptly
        this.refreshBgSwitchLabel();
        this.updateLogoLayer();
    };

    // Top-right control that steps through the background styles. The two
    // chevrons are separate hit targets (previous / next); with a pad plugged in
    // they are relabelled L1 / R1, which are the buttons that do the same job.
    Scene_Title.prototype.createBgSwitchButton = function () {
        // Always a fresh element: listeners are added with addEventListener, so
        // reusing a leftover node would stack a second handler per scene.
        const stale = document.getElementById('title-bg-switch');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
        const btn = document.createElement('div');
        btn.id = 'title-bg-switch';
        document.body.appendChild(btn);
        this._bgSwitchButton = btn;
        // Above the title menu overlay (z 100) so nothing can swallow the click.
        // Position and metrics come from layoutBgSwitchButton (canvas-relative).
        btn.className = 'title-plate title-plate-btn';

        const makeArrow = (dir) => {
            const el = document.createElement('span');
            el.className = 'title-keycap';
            el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (SceneManager._scene === this) this.cycleBackgroundMode(dir);
            });
            return el;
        };

        this._bgSwitchPrev = makeArrow(-1);
        this._bgSwitchNext = makeArrow(1);
        this._bgSwitchLabel = document.createElement('span');
        btn.appendChild(this._bgSwitchPrev);
        btn.appendChild(this._bgSwitchLabel);
        btn.appendChild(this._bgSwitchNext);

        // Swallow the press so it never reaches the canvas / free-look drag.
        btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (SceneManager._scene === this) this.cycleBackgroundMode(1);
        });

        this._bgPadConnected = null;   // forces the first badge refresh
        this.refreshBgSwitchLabel();
        this.layoutBgSwitchButton();
    };

    // The title music selector, cut from the same plate as the background
    // switcher and docked directly under it: the piece is picked by ear from
    // the title itself, with the chevrons stepping the short playlist.
    Scene_Title.prototype.createMusicSwitchButton = function () {
        const stale = document.getElementById('title-music-switch');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
        const btn = document.createElement('div');
        btn.id = 'title-music-switch';
        btn.className = 'title-plate title-plate-btn';
        document.body.appendChild(btn);
        this._musicSwitchButton = btn;

        const makeArrow = (dir) => {
            const el = document.createElement('span');
            el.className = 'title-keycap';
            el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (SceneManager._scene === this) this.cycleTitleMusic(dir);
            });
            return el;
        };

        this._musicSwitchPrev = makeArrow(-1);
        this._musicSwitchNext = makeArrow(1);
        this._musicSwitchLabel = document.createElement('span');
        btn.appendChild(this._musicSwitchPrev);
        btn.appendChild(this._musicSwitchLabel);
        btn.appendChild(this._musicSwitchNext);

        btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (SceneManager._scene === this) this.cycleTitleMusic(1);
        });

        this._musicSwitchPrev.textContent = '‹';
        this._musicSwitchNext.textContent = '›';
        this.refreshMusicSwitchLabel();
        this.layoutMusicSwitchButton();
    };

    // Docked under the background switcher, sharing its right edge, the same
    // way the news panel is docked under this one.
    Scene_Title.prototype.layoutMusicSwitchButton = function () {
        const btn = this._musicSwitchButton;
        if (!btn) return;
        const rect = TitleLayout.rect();
        const s = TitleLayout.scale(rect);
        const above = this._bgSwitchButton ? this._bgSwitchButton.getBoundingClientRect() : null;
        const below = above && above.height > 0
            ? (above.bottom - rect.top) / s
            : 18 + 34;
        TitleLayout.place(btn, { right: 18, top: Math.round(below + 8) });
    };

    Scene_Title.prototype.refreshMusicSwitchLabel = function () {
        if (!this._musicSwitchLabel) return;
        this._musicSwitchLabel.textContent =
            T('Titlescreen.music.label') +
            titleMusicTrackName(TITLE_MUSIC[titleMusicIndex()]).toUpperCase();
    };

    Scene_Title.prototype.cycleTitleMusic = function (dir) {
        const n = TITLE_MUSIC.length;
        const next = ((titleMusicIndex() + (dir || 1)) % n + n) % n;
        ConfigManager.titleMusicName = TITLE_MUSIC[next].value;
        ConfigManager.save();
        this.playTitleBgm();
        this.refreshMusicSwitchLabel();
        this.layoutMusicSwitchButton();
        this.layoutDisclaimerBox();
    };

    // Top-left build badge. Text only, never interactive, so it can sit over the
    // background without stealing a press from the free-look drag. An empty
    // VersionText parameter hides it entirely.
    Scene_Title.prototype.createVersionBadge = function () {
        const stale = document.getElementById('title-version');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
        const text = VERSION_TEXT();
        if (!text) { this._versionBadge = null; return; }
        const el = document.createElement('div');
        el.id = 'title-version';
        el.textContent = text;
        document.body.appendChild(el);
        this._versionBadge = el;
        el.className = 'title-plate title-hint-plate';
        this.layoutVersionBadge();
    };

    // Mirrors the background switcher's inset in the opposite corner, with every
    // metric in design pixels so it keeps its proportions at any window size.
    Scene_Title.prototype.layoutVersionBadge = function () {
        const el = this._versionBadge;
        if (!el) return;
        TitleLayout.place(el, { top: 18, left: 18 });
    };

    // -------------------------------------------------------------------------
    // Language selector: one flag per language the build actually ships, read
    // from the i18n folders through HendrixLocalization (English and Italian
    // lead, the rest follow in scan order and say how far along they are in
    // their tooltip, exactly as the options menu labels them).
    //
    // The flags are inline SVG rather than pictures, so the panel costs no asset
    // and stays crisp at any window size. Every one is drawn on the same 60x40
    // canvas and stretched to fill its 3:2 button, so no flag is distorted; the
    // clip-path id is namespaced because the markup lives on document.body
    // alongside every other overlay.
    // -------------------------------------------------------------------------

    // i18n-ignore-start: flag artwork, not text.
    const svgFlag = (body) =>
        '<svg viewBox="0 0 60 40" width="100%" height="100%" preserveAspectRatio="none">' + body + '</svg>';

    // Vertical / horizontal tricolours, the shape most of these flags take.
    const svgBandsV = (a, b, c) => svgFlag(
        '<path d="M0,0 h20 v40 h-20 z" fill="' + a + '"/>' +
        '<path d="M20,0 h20 v40 h-20 z" fill="' + b + '"/>' +
        '<path d="M40,0 h20 v40 h-20 z" fill="' + c + '"/>'
    );
    const svgBandsH = (a, b, c) => svgFlag(
        '<path d="M0,0 h60 v13.34 h-60 z" fill="' + a + '"/>' +
        '<path d="M0,13.34 h60 v13.33 h-60 z" fill="' + b + '"/>' +
        '<path d="M0,26.67 h60 v13.33 h-60 z" fill="' + c + '"/>'
    );

    // One taegeuk trigram: three bars, drawn to the left of the centre and
    // rotated into its corner. `pattern` is outer-to-inner, true for a solid
    // bar (yang) and false for a broken one (yin).
    const svgTrigram = (angle, pattern) => {
        const bars = pattern.map((solid, i) => {
            const x = 12.55 + i * 2.7;
            return solid
                ? '<rect x="' + x + '" y="16.5" width="1.5" height="7"/>'
                : '<rect x="' + x + '" y="16.5" width="1.5" height="2.9"/>' +
                  '<rect x="' + x + '" y="20.6" width="1.5" height="2.9"/>';
        }).join('');
        return '<g transform="rotate(' + angle + ' 30 20)" fill="#000000">' + bars + '</g>';
    };

    // Flag artwork per language symbol. A language with no entry still appears
    // in the selector, as its uppercased symbol in the title's gold.
    const LANGUAGE_FLAG_ART = {
        en: svgFlag(
            '<clipPath id="ts-flag-uk"><path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z"/></clipPath>' +
            '<path d="M0,0 v40 h60 v-40 z" fill="#012169"/>' +
            '<path d="M0,0 L60,40 M60,0 L0,40" stroke="#FFFFFF" stroke-width="8"/>' +
            '<path d="M0,0 L60,40 M60,0 L0,40" clip-path="url(#ts-flag-uk)" stroke="#C8102E" stroke-width="5.3"/>' +
            '<path d="M30,0 v40 M0,20 h60" stroke="#FFFFFF" stroke-width="13.3"/>' +
            '<path d="M30,0 v40 M0,20 h60" stroke="#C8102E" stroke-width="8"/>'
        ),
        it: svgBandsV('#008C45', '#F4F5F0', '#CD212A'),
        // Naguka: no real-world nation to draw, so a tribal banner instead.
        // Swamp green field, bone-white crossbones (docs/Lore.md: Kola-borehole
        // goblins gone corpse-paint metalhead).
        nk: svgFlag(
            '<path d="M0,0 h60 v40 h-60 z" fill="#2E4620"/>' +
            '<g transform="rotate(35 30 20)" fill="#E8DFC0">' +
            '<rect x="14" y="17.5" width="32" height="5" rx="2.5"/>' +
            '<circle cx="14" cy="20" r="3"/><circle cx="46" cy="20" r="3"/>' +
            '</g>' +
            '<g transform="rotate(-35 30 20)" fill="#E8DFC0">' +
            '<rect x="14" y="17.5" width="32" height="5" rx="2.5"/>' +
            '<circle cx="14" cy="20" r="3"/><circle cx="46" cy="20" r="3"/>' +
            '</g>'
        ),
        fr: svgBandsV('#002395', '#FFFFFF', '#ED2939'),
        ru: svgBandsH('#FFFFFF', '#0039A6', '#D52B1E'),
        ko: svgFlag(
            '<path d="M0,0 v40 h60 v-40 z" fill="#FFFFFF"/>' +
            // The taegeuk is drawn split left/right, so it has to be turned until
            // red sits above blue: the dividing line runs along the flag's
            // top-left/bottom-right diagonal, 33.69 degrees off the horizontal,
            // which puts the base split 56.31 degrees from where it is wanted.
            '<g transform="rotate(-56.31 30 20)">' +
            '<circle cx="30" cy="20" r="8" fill="#CD2E3A"/>' +
            '<path d="M30,12 A4,4 0 0,1 30,20 A4,4 0 0,0 30,28 A8,8 0 0,1 30,12 z" fill="#0047A0"/>' +
            '</g>' +
            svgTrigram(45, [true, true, true]) +          // geon, upper hoist
            svgTrigram(-45, [true, false, true]) +         // ri, lower hoist
            svgTrigram(135, [false, true, false]) +        // gam, upper fly
            svgTrigram(-135, [false, false, false])        // gon, lower fly
        )
    };
    // i18n-ignore-end

    // The languages offered, in the order the localization plugin ranks them.
    const selectableLanguages = () => {
        const api = window.HendrixLocalization;
        const list = (api && api.getAvailableLanguages) ? api.getAvailableLanguages() : null;
        return (list && list.length) ? list : ['en'];
    };

    const activeLanguage = () => {
        const api = window.HendrixLocalization;
        if (api && api.getCurrentLanguage) return api.getCurrentLanguage();
        return (typeof ConfigManager !== 'undefined' && ConfigManager.language) || 'en';
    };

    // Endonyms ("English", "Italiano"), so each flag names itself in its own
    // language whichever one is active, with the completion share appended for
    // the languages that are not carried all the way (the options menu labels
    // them the same way).
    const languageName = (symbol) => {
        const api = window.HendrixLocalization;
        if (api && api.getLanguageMenuLabel) return api.getLanguageMenuLabel(symbol);
        if (api && api.getLanguageName) return api.getLanguageName(symbol);
        return String(symbol || '').toUpperCase();
    };

    // Docked under the build badge in the top-left corner, the mirror of the way
    // the news panel hangs off the background switcher.
    Scene_Title.prototype.createLanguageSelector = function () {
        const stale = document.getElementById('title-language');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        const box = document.createElement('div');
        box.id = 'title-language';
        document.body.appendChild(box);
        this._languageBox = box;
        this._languageButtons = [];
        box.className = 'title-plate title-lang-box';

        this._languageLabel = document.createElement('span');
        this._languageLabel.textContent = T('Titlescreen.language.label');
        box.appendChild(this._languageLabel);

        for (const symbol of selectableLanguages()) {
            const art = LANGUAGE_FLAG_ART[symbol];
            const btn = document.createElement('div');
            if (art) {
                btn.innerHTML = art;
            } else {
                // No artwork for this folder: name it instead of showing a hole.
                btn.textContent = String(symbol).toUpperCase();
            }
            btn.title = languageName(symbol);
            btn._langSymbol = symbol;
            btn.className = 'title-lang-btn';
            btn.addEventListener('mouseenter', () => {
                if (activeLanguage() !== symbol) btn.classList.add('title-lang-btn--hover');
            });
            btn.addEventListener('mouseleave', () => this.refreshLanguageSelector());
            // Swallow the press so it never reaches the canvas / free-look drag.
            btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (SceneManager._scene === this) this.setTitleLanguage(symbol);
            });
            box.appendChild(btn);
            this._languageButtons.push(btn);
        }

        box.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });

        this.refreshLanguageSelector();
        this.layoutLanguageSelector();
    };

    // The active flag keeps a gold frame and full colour; the other is framed in
    // nothing and dimmed, so the current language reads at a glance.
    Scene_Title.prototype.refreshLanguageSelector = function () {
        if (!this._languageBox) return;
        if (this._languageLabel) this._languageLabel.textContent = T('Titlescreen.language.label');
        const current = activeLanguage();
        for (const btn of this._languageButtons || []) {
            const on = btn._langSymbol === current;
            btn.classList.toggle('title-lang-btn--on', on);
            btn.classList.remove('title-lang-btn--hover');
            btn.title = languageName(btn._langSymbol);
        }
    };

    // Switch the game language and re-translate everything the title screen is
    // already showing: the menu column, the background label and the news panel
    // (rebuilt only if the player has not dismissed it).
    Scene_Title.prototype.setTitleLanguage = function (symbol) {
        if (activeLanguage() === symbol) return;
        const api = window.HendrixLocalization;
        if (api && api.setLanguage) {
            if (!api.setLanguage(symbol)) return;
        } else if (typeof ConfigManager !== 'undefined') {
            ConfigManager.language = symbol;
            ConfigManager.save();
            SoundManager.playCursor();
        }

        this.refreshLanguageSelector();
        if (this._commandWindow) this._commandWindow.refresh();
        this._lastCommandIndex = -1;
        this.refreshUIOverlayDOM();
        this.refreshBgSwitchLabel();
        this.createVersionBadge();
        this.refreshUpdateButton();
        if (this._disclaimerBox) {
            this.removeDisclaimerBox();
            this.createDisclaimerBox();
        }
        this.layoutOverlays();
    };

    // Every metric in design pixels, and the panel is hung off the measured
    // bottom of the build badge so it follows it whatever the badge says (an
    // empty VersionText hides the badge and the selector takes its corner).
    Scene_Title.prototype.layoutLanguageSelector = function () {
        const box = this._languageBox;
        if (!box) return;
        const rect = TitleLayout.rect();
        const s = TitleLayout.scale(rect);
        const badge = this._versionBadge;
        const badgeRect = badge ? badge.getBoundingClientRect() : null;
        const below = badgeRect && badgeRect.height > 0
            ? (badgeRect.bottom - rect.top) / s + 8
            : 18; // no badge: take the corner inset itself
        TitleLayout.place(box, { left: 18, top: Math.round(below) });
        // The flags are 3:2, the ratio they are all drawn at; the whole strip
        // is sized off --title-scale in the stylesheet.
    };

    Scene_Title.prototype.removeLanguageSelector = function () {
        if (this._languageBox && this._languageBox.parentNode) {
            this._languageBox.parentNode.removeChild(this._languageBox);
        }
        this._languageBox = null;
        this._languageLabel = null;
        this._languageButtons = [];
    };

    // -------------------------------------------------------------------------
    // Update notice: the launch check, and the button it puts under the flags.
    //
    // The updater reads the branch once per session on its own (autoCheck); this
    // panel is only its face. It stays out of the way until there is something
    // to say, so an up-to-date copy sees the corner exactly as before, and the
    // menu column keeps its own UPDATES entry either way.
    //
    // The updater is an optional plugin: turned off in plugins.js, or on a web
    // build where there is no local file system, window.GameUpdater is simply
    // not there. Nothing below may assume it is, and nothing below may assume
    // that a GameUpdater which IS there is the version this file was written
    // against, so every call goes through updaterCall, which answers undefined
    // for a method that is missing or that throws. The title screen then behaves
    // exactly as it did before the updater existed: no notice, no check, and a
    // version badge as written.
    // -------------------------------------------------------------------------

    const updaterApi = () => {
        try {
            const api = window.GameUpdater;
            return (api && typeof api.isAvailable === 'function' && api.isAvailable()) ? api : null;
        } catch (e) {
            return null;
        }
    };

    // One guarded call into the updater. A missing method is not a failure, it
    // is an older (or newer) updater that does not offer it.
    const updaterCall = function (method) {
        const api = updaterApi();
        if (!api || typeof api[method] !== 'function') return undefined;
        try {
            return api[method].apply(api, Array.prototype.slice.call(arguments, 1));
        } catch (e) {
            console.warn('Titlescreen: the updater failed on ' + method, e);
            return undefined;
        }
    };

    // The address the whole game is downloaded from. The updater carries it as
    // a plugin parameter so it can be changed in one place; an updater that is
    // absent or older than this leaves the shipped fallback standing.
    const fullGameLink = () => {
        const url = updaterCall('fullDownloadUrl');
        return (typeof url === 'string' && url) ? url : FULL_GAME_FALLBACK;
    };

    // Docked under the language flags, the way they are docked under the badge.
    Scene_Title.prototype.createUpdateButton = function () {
        const stale = document.getElementById('title-update');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
        if (!updaterApi()) { this._updateButton = null; return; }

        const btn = document.createElement('div');
        btn.id = 'title-update';
        document.body.appendChild(btn);
        this._updateButton = btn;
        btn.className = 'title-plate title-update-btn';

        // Swallow the press so it never reaches the canvas / free-look drag.
        btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (SceneManager._scene !== this) return;
            if (btn.style.cursor !== 'pointer') return;
            // A major update is waiting and this copy is behind it. Patching
            // across it would leave the game half on the old build, so the
            // notice never offers the update itself: the press goes straight
            // out to the download page for the whole game. Taking the files
            // anyway is still possible, but only from the updater screen, which
            // says what it costs before it does it.
            if (this._updateAction === 'fullgame') {
                SoundManager.playOk();
                openExternalLink(fullGameLink());
                return;
            }
            // Nothing here can be downloaded: a major update is answered off
            // the title screen, so the press opens the updater, which explains
            // it and takes the confirmation that it has been done.
            if (this._updateAction === 'major') {
                if (window.Scene_GameUpdater) {
                    SoundManager.playOk();
                    SceneManager.push(window.Scene_GameUpdater);
                }
                return;
            }
            this.startUpdateDownload();
        });

        this.refreshUpdateButton();
    };

    // How much of a build's name the button can carry before the corner of the
    // title screen starts to look like a paragraph.
    const UPDATE_NAME_MAX = 34;

    const updateBuildLabel = (result) => {
        const name = result && result.latestName ? String(result.latestName).trim() : '';
        if (name) {
            const short = name.length > UPDATE_NAME_MAX
                ? name.slice(0, UPDATE_NAME_MAX - 1).trimEnd() + '…'
                : name;
            return T('Titlescreen.update.download', { name: short });
        }
        const build = result ? result.latestBuild : null;
        return (typeof build === 'number')
            ? T('Titlescreen.update.downloadBuild', { build: build })
            : T('Titlescreen.update.readyPlain');
    };

    // The button is one line of text, except when it also has to say the whole
    // game must be downloaded again: then it carries a second line under the
    // first, since that is not a thing the game can do for the player.
    const setUpdateLabel = (btn, main, second) => {
        if (!btn) return;
        btn.classList.toggle('title-update-btn--two-line', !!second);
        if (!second) {
            btn.textContent = main;
            return;
        }
        btn.textContent = '';
        const head = document.createElement('div');
        head.textContent = main;
        const note = document.createElement('div');
        note.className = 'title-update-note';
        note.textContent = second;
        btn.appendChild(head);
        btn.appendChild(note);
    };

    // The notice has six states and they are named, not painted: ready (gold,
    // pulsing, clickable), warn (amber, pulsing), notice (amber, still), busy
    // (working, not clickable), dim (nothing left to say) and gone.
    const UPDATE_STATES = ['ready', 'warn', 'notice', 'busy', 'dim'];
    const setUpdateState = (btn, state) => {
        if (!btn) return;
        for (const st of UPDATE_STATES) {
            btn.classList.toggle('title-update-btn--' + st, st === state);
        }
        if (state) window.UIPanel.open(btn); else window.UIPanel.close(btn);
    };

    // While a build is coming down the notice fills like a bar: the ratio is
    // painted as a background layer rather than a child, so the label can be
    // rewritten on every tick without losing it. A null ratio clears the fill.
    const setUpdateFill = (btn, ratio) => {
        if (!btn) return;
        if (typeof ratio !== 'number' || !isFinite(ratio)) {
            btn.classList.remove('title-update-btn--filling');
            btn.style.removeProperty('--title-update-fill');
            return;
        }
        const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
        btn.classList.add('title-update-btn--filling');
        btn.style.setProperty('--title-update-fill', pct + '%');
    };

    // A major update is one the file patch cannot fully carry, so the notice
    // says the whole game has to be downloaded again: while the update is being
    // offered, and afterwards for as long as the copy has taken one without
    // being downloaded whole.
    const majorPendingLine = () => T('Titlescreen.update.majorLine');
    const majorTakenLine   = () => T('Titlescreen.update.majorInstalledLine');
    const majorTaken = (result) => {
        if (result && typeof result.majorInstalled === 'boolean') return result.majorInstalled;
        return !!updaterCall('majorInstalled');
    };

    // Four states, and one of them is silence: checking says so quietly, a build
    // waiting is a real button, a copy that has taken a major update says so
    // until it is downloaded whole, and an up-to-date copy (or one that could
    // not reach the branch) shows nothing at all. While the build is being
    // fetched the button becomes its own progress readout, so nothing else has
    // to open.
    Scene_Title.prototype.refreshUpdateButton = function () {
        const btn = this._updateButton;
        if (!btn) return;
        if (this._updateBusy) return;
        setUpdateFill(btn, null);
        const api = updaterApi();
        const result = api ? updaterCall('autoResult') : null;
        // The launch check answers long after the panels have been faded in, so a
        // notice that turns up now fades itself in rather than snapping into the
        // corner. While the settle is still running the sweep covers it instead.
        const wasHidden = window.UIPanel.isClosed(btn);
        const fadeIn = () => {
            if (!wasHidden || !this._overlaysSettled) return;
            if (window.UIPanel.isClosed(btn)) return;
            fadeInOverlay(btn, 0);
        };

        // A build fetched and swapped in by an earlier visit to this screen (or
        // by the updater itself) only wants the game closed so it reads the new
        // files on the next launch. If it was a major update, closing is not
        // the end of it.
        if (updaterCall('needsRestart')) {
            this._updateAction = 'restart';
            setUpdateLabel(btn, T('Titlescreen.update.restartReady'),
                majorTaken(result) ? majorTakenLine() : '');
            btn.title = majorTaken(result)
                ? T('Titlescreen.update.majorInstalledTip')
                : T('Titlescreen.update.restartTip');
            setUpdateState(btn, 'ready');
            this.layoutUpdateButton();
            fadeIn();
            return;
        }

        // A build is waiting, but taking it would cross a major update and this
        // copy is behind that update. A patch cannot finish the job, so the
        // notice does not offer one: it sends the player to the full download
        // instead, which is the only thing that leaves the copy whole. The
        // updater screen still lists the build for anyone who wants the files
        // regardless, and warns there that a download follows either way.
        if (result && result.available && result.major && !this._updateDone) {
            this._updateAction = 'fullgame';
            setUpdateLabel(btn, T('Titlescreen.update.redownload'), majorPendingLine());
            btn.title = T('Titlescreen.update.redownloadTip');
            setUpdateState(btn, 'warn');
        } else if (result && result.available && !this._updateDone) {
            // An ordinary build: the one above has already taken every major
            // one, so nothing here needs the second line.
            this._updateAction = 'install';
            setUpdateLabel(btn, updateBuildLabel(result), '');
            btn.title = T('Titlescreen.update.tip');
            setUpdateState(btn, 'ready');
        } else if (result && majorTaken(result)) {
            // Nothing left to fetch, but this copy was patched across a major
            // update and is not whole: the one thing left is a full download.
            // The button opens the updater screen, which explains it and is
            // where the player says they have done it.
            this._updateAction = 'major';
            setUpdateLabel(btn, T('Titlescreen.update.majorInstalled'), majorTakenLine());
            btn.title = T('Titlescreen.update.majorInstalledTip');
            setUpdateState(btn, 'notice');
        } else if (!result) {
            this._updateAction = null;
            setUpdateLabel(btn, T('Titlescreen.update.checking'), '');
            btn.title = T('Titlescreen.update.checkingTip');
            setUpdateState(btn, 'dim');
        } else {
            this._updateAction = null;
            setUpdateState(btn, null);
        }
        this.layoutUpdateButton();
        fadeIn();
    };

    // Hung off the measured bottom of the language panel, so it follows however
    // many flags the build ships.
    Scene_Title.prototype.layoutUpdateButton = function () {
        const btn = this._updateButton;
        if (!btn) return;
        const rect = TitleLayout.rect();
        const s = TitleLayout.scale(rect);
        const above = this._languageBox || this._versionBadge;
        const aboveRect = above ? above.getBoundingClientRect() : null;
        const below = aboveRect && aboveRect.height > 0
            ? (aboveRect.bottom - rect.top) / s + 8
            : 18; // nothing above it: take the corner inset itself
        TitleLayout.place(btn, { left: 18, top: Math.round(below) });

    };

    // Pressing the notice installs the build there and then: the newest commit
    // is fetched, swapped in and the game closed so it comes back up onto it,
    // with the button itself reporting every step. The updater screen is still
    // there under the menu for anyone who wants to read a build before taking
    // it, or to go back to an older one, but the ordinary case never has to
    // open it.
    Scene_Title.prototype.startUpdateDownload = function () {
        if (this._updateBusy) return;
        const api = updaterApi();
        if (!api) return;
        // Already fetched, waiting only on the close. The label change is the
        // player's warning that the game is about to shut down on its own;
        // the delay holds it on screen long enough to be read before it does.
        if (updaterCall('needsRestart')) {
            SoundManager.playOk();
            this._updateBusy = true;
            if (this._updateButton) this._updateButton.textContent = T('Titlescreen.update.restarting');
            setTimeout(() => updaterCall('restart'), 1600);
            return;
        }
        // The updater is working for somebody else (a check left running, or an
        // install started before the screen was rebuilt): let it finish.
        if (updaterCall('isBusy')) return;
        const result = updaterCall('autoResult');
        if (!result || !result.available || !result.latest) return;
        // Never patch across a major update from here, whatever route reached
        // this method: the copy would come out half on the old build and the
        // title screen has nothing to say about it afterwards. The updater
        // screen is where that trade is explained and taken.
        if (result.major) {
            SoundManager.playOk();
            openExternalLink(fullGameLink());
            return;
        }
        // An updater that cannot fetch (an older one, or one loaded without its
        // download half) has nothing this button can drive.
        if (typeof api.check !== 'function' || typeof api.install !== 'function') return;

        // Downloads switched off in the plugin parameters: only the updater
        // screen can explain that, so hand over to it.
        if (api.downloadsEnabled && !api.downloadsEnabled()) {
            if (window.Scene_GameUpdater) {
                SoundManager.playOk();
                SceneManager.push(window.Scene_GameUpdater);
            }
            return;
        }

        const btn = this._updateButton;
        const sha = result.latest;
        this._updateBusy = true;
        SoundManager.playOk();

        const say = (text, ratio) => {
            if (!btn) return;
            btn.textContent = text;
            setUpdateState(btn, 'busy');
            setUpdateFill(btn, (ratio === undefined) ? null : ratio);
        };
        const release = (text, dim) => {
            this._updateBusy = false;
            if (!btn) return;
            setUpdateFill(btn, null);
            btn.textContent = text;
            btn.title = text;
            btn.classList.toggle('title-update-btn--dim', !!dim);
        };

        const onProgress = (p) => {
            if (!p) return;
            if (p.phase === 'download') {
                const ratio = typeof p.ratio === 'number'
                    ? Math.max(0, Math.min(1, p.ratio)) : 0;
                say(T('Titlescreen.update.downloading', {
                    percent: Math.round(ratio * 100)
                }), ratio);
            } else if (p.phase === 'apply' || p.phase === 'done') {
                say(T('Titlescreen.update.installing'), 1);
            } else {
                say(T('Titlescreen.update.preparing'), 0);
            }
        };

        say(T('Titlescreen.update.preparing'), 0);

        // The launch check already measured this build, so the plan is usually
        // in hand; anything else is measured now.
        const planned = updaterCall('plan', sha);
        const ready = (planned && planned.changed.length)
            ? Promise.resolve(planned)
            : api.check(sha, onProgress);

        ready.then((plan) => {
            if (!plan || !plan.changed.length) {
                // The comparison found nothing after all: this copy is already
                // the build being offered, so the notice has nothing left to say.
                this._updateDone = true;
                release(T('Titlescreen.update.upToDate'), true);
                setTimeout(() => setUpdateState(btn, null), 2500);
                return null;
            }
            return api.install(sha, onProgress);
        }).then((done) => {
            if (!done) return;
            // A major update is not finished by closing: the copy is patched
            // but not whole, so say it here and hold the notice long enough to
            // be read. It stands under the flags on the next launch as well.
            // Either way the label change IS the warning that the game is
            // about to close on its own and has to be reopened by hand; the
            // delay only holds it on screen long enough to actually be read.
            const major = !!updaterCall('majorInstalled');
            if (major) {
                setUpdateLabel(btn, T('Titlescreen.update.restarting'), majorTakenLine());
                if (btn) {
                    setUpdateState(btn, 'busy');
                }
                this.layoutUpdateButton();
            } else {
                say(T('Titlescreen.update.restarting'));
            }
            setTimeout(() => updaterCall('restart'), major ? 3000 : 1600);
        }).catch((err) => {
            console.warn('Titlescreen: the update could not be installed', err);
            release(T('Titlescreen.update.failed'), false);
            if (btn) {
                setUpdateState(btn, 'notice');
            }
        });
    };

    Scene_Title.prototype.removeUpdateButton = function () {
        if (this._updateButton && this._updateButton.parentNode) {
            this._updateButton.parentNode.removeChild(this._updateButton);
        }
        this._updateButton = null;
    };

    // How long the launch check waits before it starts. The first check of a
    // fresh copy hashes the whole game folder, so it is held back until the
    // title screen has finished building and settling its panels.
    const UPDATE_CHECK_DELAY = 1200;

    // Ask the updater what the branch holds. The call is idempotent and cached
    // for the session, so entering the title again costs nothing and answers at
    // once; the badge is rebuilt afterwards because the answer may have numbered
    // this build.
    //
    // Coming back here from a game is the one re-entry that is not free: the
    // session may have run for hours, so the updater reads the branch again and
    // that read is held back exactly like the launch one, rather than starting
    // while this screen is still building itself. The button keeps showing
    // whatever the last check said until the new answer lands.
    Scene_Title.prototype.beginUpdateCheck = function () {
        const api = updaterApi();
        if (!api || typeof api.autoCheck !== 'function') return;

        const run = () => {
            if (this._isDestroyed) return;
            const check = updaterCall('autoCheck');
            if (!check || typeof check.then !== 'function') return;
            check.then(() => {
                if (this._isDestroyed || SceneManager._scene !== this) return;
                this.createVersionBadge();
                this.refreshUpdateButton();
                this.layoutOverlays();
            }).catch(() => { /* the updater already reports its own failures */ });
        };

        // Already answered this session and nothing played since: no reason to
        // make the player wait for the notice a second time.
        if (updaterCall('autoResult') && !updaterCall('recheckPending')) run();
        else setTimeout(run, UPDATE_CHECK_DELAY);
    };

    // Top-right corner of the canvas, with every metric in design pixels so the
    // badge keeps its proportions at any window size.
    Scene_Title.prototype.layoutBgSwitchButton = function () {
        const btn = this._bgSwitchButton;
        if (!btn) return;
        const s = TitleLayout.place(btn, { top: 18, right: 18 });
        const px = v => TitleLayout.px(v, s);

        for (const el of [this._bgSwitchPrev, this._bgSwitchNext]) {
            if (!el) continue;

        }
        this._bgSwitchArrowScale = s;
        this._applyBgSwitchArrowFont();
    };

    // The chevrons carry a smaller face when they are relabelled L1 / R1, so the
    // font is applied from one place shared by the layout and the pad refresh.
    Scene_Title.prototype._applyBgSwitchArrowFont = function () {
        if (!this._bgSwitchPrev || !this._bgSwitchNext) return;
        const fs = TitleLayout.px(this._bgPadConnected ? 11 : 16, this._bgSwitchArrowScale);

    };

    Scene_Title.prototype.refreshBgSwitchLabel = function () {
        if (!this._bgSwitchButton || !this._bgSwitchLabel) return;
        const labels = BG_MODE_LABELS();
        const sel = this._bgSelection || this._bgMode;
        const name = labels[sel] || String(sel || '').toUpperCase();
        this._bgSwitchLabel.textContent = T('Titlescreen.background.label') + name;

        const pad = PAD.connected();
        if (pad !== this._bgPadConnected) {
            this._bgPadConnected = pad;
            this._bgSwitchPrev.textContent = pad ? 'L1' : '‹';
            this._bgSwitchNext.textContent = pad ? 'R1' : '›';
            this._applyBgSwitchArrowFont();
        }
    };

    // L1 / R1 step the background; polled raw so a remapped gamepadMapper (or a
    // menu that is eating pageup/pagedown) cannot break it.
    // The music switcher answers to the shoulders under the background's, and
    // to PageUp / PageDown on the keyboard, so the chevrons beside the track
    // name are never the only way to change it.
    Scene_Title.prototype.updateMusicSwitchInput = function () {
        if (!this._musicSwitchButton) return;
        const prev = PAD.triggered(PAD.L2) || Input.isTriggered('pageup');
        const next = PAD.triggered(PAD.R2) || Input.isTriggered('pagedown');
        if (prev) this.cycleTitleMusic(-1);
        else if (next) this.cycleTitleMusic(1);
    };

    Scene_Title.prototype.updateBgSwitchInput = function () {
        if (!this._bgSwitchButton) return;
        const prev = PAD.triggered(PAD.L1);
        const next = PAD.triggered(PAD.R1);
        if (prev) this.cycleBackgroundMode(-1);
        else if (next) this.cycleBackgroundMode(1);
        // Cheap poll: only relabels when the connection state actually flips.
        if (PAD.connected() !== this._bgPadConnected) this.refreshBgSwitchLabel();
    };

    // -------------------------------------------------------------------------
    // Early-build news panel. A dismissable gold terminal panel docked in the
    // top-right corner, directly under the background switcher and clear of both
    // the command column and the bottom-right readouts, carrying the build
    // notice, the Discord invite, the Linktree and the two donation buttons.
    // Gated by the EnableDisclaimer parameter (ON by default).
    //
    // The body is set in the UI serif rather than the title's Square: the notice is a
    // full paragraph and the URLs are long, and a proportional serif keeps both
    // readable at the small panel size. Square is kept for the header and the
    // short labels, so the panel still reads as part of the terminal.
    // -------------------------------------------------------------------------
    Scene_Title.prototype.createDisclaimerBox = function () {
        if (!enableDisclaimer) return;

        // Always a fresh node: the listeners below are addEventListener-based,
        // so a leftover element from a previous title visit would double-fire.
        const stale = document.getElementById('title-disclaimer');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        const box = document.createElement('div');
        box.id = 'title-disclaimer';
        document.body.appendChild(box);
        this._disclaimerBox = box;
        // Geometry (position, width, padding, font) is applied by
        // layoutDisclaimerBox so the panel tracks the canvas at any resolution.
        box.className = 'title-plate title-news-panel';

        const close = document.createElement('div');
        close.textContent = '✕';
        close.className = 'title-news-close';
        close.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            SoundManager.playCancel();
            this.removeDisclaimerBox();
        });

        const header = document.createElement('div');
        header.textContent = T('Titlescreen.news.header');
        header.className = 'title-news-head';

        // What the panel actually says: one version section of the changelog,
        // walked with the two buttons over it. The list is capped and scrolls on
        // its own, so a section as long as a release note cannot stretch the
        // panel down over the readouts in the corner.
        const navRow = document.createElement('div');
        navRow.className = 'title-news-nav';

        const navButton = (label, step) => {
            const btn = document.createElement('div');
            btn.textContent = label;
            btn.className = 'title-news-navbtn';
            btn.addEventListener('mouseenter', () => {
            });
            btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (btn.dataset.off) return;
                SoundManager.playCursor();
                this.showNewsSection(this._newsIndex + step);
            });
            return btn;
        };

        // The file is written newest first, so going back walks DOWN it.
        const olderBtn = navButton(T('Titlescreen.news.older'), 1);
        const newerBtn = navButton(T('Titlescreen.news.newer'), -1);

        const versionLabel = document.createElement('div');
        versionLabel.className = 'title-news-version';

        navRow.appendChild(olderBtn);
        navRow.appendChild(versionLabel);
        navRow.appendChild(newerBtn);

        const text = document.createElement('div');
        text.className = 'title-news-body';
        // RMMZ preventDefaults every wheel event at the document level, so a DOM
        // pane never scrolls on its own: this one scrolls itself and swallows the
        // event so it cannot also reach the background behind the panel.
        text.addEventListener('wheel', (e) => {
            const step = e.deltaMode === 1 ? e.deltaY * 40
                : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
            text.scrollTop += step;
            e.preventDefault();
            e.stopPropagation();
        });

        this._newsNav = navRow;
        this._newsOlder = olderBtn;
        this._newsNewer = newerBtn;
        this._newsVersion = versionLabel;
        this._newsBody = text;
        this._newsSections = NEWS_SECTIONS();
        this._newsIndex = 0;

        // Escape hatch for the collision bugs the notice above asks players to
        // report: ForceConsole ungates the engine's own debug-through in
        // released builds, so a player wedged in a wall can always walk out.
        const noclipTip = document.createElement('div');
        noclipTip.textContent = T('Titlescreen.disclaimer.noclip');
        noclipTip.className = 'title-news-tip';

        // Donation buttons: same terminal frame as the rest of the title, tinted
        // with each service's own colour so they read as two distinct choices.
        const donateLabel = document.createElement('div');
        donateLabel.textContent = T('Titlescreen.support.header');
        donateLabel.className = 'title-donate-label';

        // What a patron actually gets, stated on the title screen rather than
        // buried in a tier list: a named planet (PatreonRewards builds the
        // system) and the coordinates of their own hatch, which are never in any
        // data file and are handed over on Patreon alone.
        const patronPerk = document.createElement('div');
        patronPerk.textContent = T('Titlescreen.support.patronPerk');
        patronPerk.className = 'title-news-tip title-news-tip--perk';

        const donateRow = document.createElement('div');
        donateRow.className = 'title-donate-row';

        const donateButton = (label, url) => {
            const btn = document.createElement('div');
            btn.textContent = label;
            btn.className = 'title-donate-btn';
            btn.addEventListener('mouseenter', () => {
                btn.classList.add('title-donate-btn--on');
            });
            btn.addEventListener('mouseleave', () => {
                btn.classList.remove('title-donate-btn--on');
            });
            btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                SoundManager.playOk();
                openExternalLink(url);
            });
            return btn;
        };

        donateRow.appendChild(donateButton('PATREON', PATREON_LINK));
        donateRow.appendChild(donateButton('PAYPAL', PAYPAL_LINK));
        // The community links sit on the same row rather than as their own
        // rows above it: four buttons, one strip.
        donateRow.appendChild(donateButton('DISCORD', DISCLAIMER_LINK));
        donateRow.appendChild(donateButton('LINKS', LINKTREE_LINK));

        // Swallow presses on the panel itself so they never reach the canvas
        // (free-look drag / card interaction behind it).
        box.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });

        box.appendChild(close);
        box.appendChild(header);
        box.appendChild(navRow);
        box.appendChild(text);
        box.appendChild(noclipTip);
        box.appendChild(donateLabel);
        box.appendChild(patronPerk);
        box.appendChild(donateRow);
        // Filled before it is measured: the layout pass trims the list to the
        // room left under it, which it can only read once there is a list.
        this.showNewsSection(0);
        this.layoutDisclaimerBox();
    };

    // Draws one version section of the changelog into the news panel and
    // re-labels the buttons around it. An index past either end of the file is
    // clamped rather than wrapped, and the button that would walk off the end is
    // dimmed and stops answering. A build with no changelog to read shows the
    // notice written in the i18n entry instead and hides the buttons entirely.
    Scene_Title.prototype.showNewsSection = function (index) {
        const body = this._newsBody;
        if (!body) return;
        const sections = this._newsSections || [];
        const last = sections.length - 1;
        const i = Math.max(0, Math.min(Number(index) || 0, last));
        this._newsIndex = i;
        const section = sections[i] || null;

        while (body.firstChild) body.removeChild(body.firstChild);
        if (this._newsVersion) this._newsVersion.textContent = section ? section.version : '';
        window.UIPanel.toggle(this._newsNav, sections.length > 0);

        if (!section) {
            const fallback = document.createElement('div');
            fallback.textContent = DISCLAIMER_TEXT() || T('Titlescreen.news.empty');
            body.appendChild(fallback);
            return;
        }
        // The list is read in the order the file writes it, entries under the
        // dash and the group headings the long sections are written in, which
        // are drawn as headings rather than as another line of news.
        for (const entry of section.entries) {
            const row = document.createElement('div');
            const heading = entry && typeof entry === 'object' ? entry.heading : null;
            row.textContent = heading ? String(heading) : NEWS_BULLET + entry;
            row.className = 'title-news-line';
            if (heading) {
                row.className = 'title-news-section' +
                    (body.firstChild ? ' title-news-section--spaced' : '');
            }
            body.appendChild(row);
        }
        body.scrollTop = 0;

        const dim = (btn, off) => {
            if (!btn) return;
            if (off) {
                btn.dataset.off = '1';
                btn.classList.add('title-news-navbtn--off');
            } else {
                delete btn.dataset.off;
                btn.classList.remove('title-news-navbtn--off');
            }
        };
        dim(this._newsOlder, i >= last);
        dim(this._newsNewer, i <= 0);
    };

    // Docked under the background switcher, sharing its right edge. The gap is
    // measured off the switcher's real height (its label grows when a pad is
    // plugged in), falling back to a design-pixel estimate while the button is
    // not measurable yet. The width is capped against the canvas rather than the
    // viewport so the panel never grows over the menu column on a narrow window.
    Scene_Title.prototype.layoutDisclaimerBox = function () {
        const box = this._disclaimerBox;
        if (!box) return;
        const rect = TitleLayout.rect();
        const s = TitleLayout.scale(rect);
        const btn = this._musicSwitchButton || this._bgSwitchButton;
        const btnRect = btn ? btn.getBoundingClientRect() : null;
        const below = btnRect && btnRect.height > 0
            ? (btnRect.bottom - rect.top) / s
            : 18 + 34 + 42; // switcher inset, its design height, the music plate
        TitleLayout.place(box, { right: 18, top: Math.round(below + 10) });
        box.style.setProperty('--title-w',
            Math.round(Math.min(320 * s, rect.width * 0.3)) + 'px');
        // The one part of the panel that grows with its content is the one part
        // that is capped: everything under it keeps its place whichever section
        // is being read. The cap is then trimmed to whatever room is actually
        // left over the bottom of the canvas, so the links and the donation
        // buttons under the list are on screen at any resolution rather than
        // pushed off the edge by a long release note.
        const body = this._newsBody;
        if (body) {
            body.style.setProperty('--title-maxh', TitleLayout.px(110, s));
            const boxRect = box.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            const canvasBottom = rect.top + rect.height;
            const spill = boxRect.bottom - (canvasBottom - 18 * s);
            if (spill > 0 && bodyRect.height > 0) {
                body.style.setProperty('--title-maxh',
                    Math.round(Math.max(60 * s, bodyRect.height - spill)) + 'px');
            }
        }
    };

    Scene_Title.prototype.removeDisclaimerBox = function () {
        if (this._disclaimerBox && this._disclaimerBox.parentNode) {
            this._disclaimerBox.parentNode.removeChild(this._disclaimerBox);
        }
        this._disclaimerBox = null;
        this._newsBody = null;
        this._newsNav = null;
        this._newsOlder = null;
        this._newsNewer = null;
        this._newsVersion = null;
    };

    // Backgrounds that render into their own DOM canvas, which sits ON TOP of
    // the game canvas and would otherwise cover the logo drawn by PIXI.
    const DOM_CANVAS_MODES = ['hyperverse', 'autodrive', 'artifacts', 'weapons'];

    // For those modes the PIXI logo is hidden and an identically placed <img>
    // is layered above the 3D canvas instead, so planets, galaxies and the road
    // always pass BEHIND the Hypernet Explorer logo.
    Scene_Title.prototype.updateLogoLayer = function () {
        // The bestiary only owns a DOM canvas while it is running in 3D.
        const needsOverlay = DOM_CANVAS_MODES.includes(this._bgMode) || !!this._enemies3dBg;
        if (!needsOverlay) {
            if (this._logoSprite) this._logoSprite.visible = true;
            window.UIPanel.close(this._logoOverlay);
            return;
        }
        if (this._logoSprite) this._logoSprite.visible = false;
        let img = this._logoOverlay;
        if (!img) {
            img = document.getElementById('title-logo-overlay');
            if (!img) {
                img = document.createElement('img');
                img.id = 'title-logo-overlay';
                img.src = 'img/pictures/Logo.png';
                // If the picture cannot be loaded, fall back to the PIXI logo
                // rather than leaving the title with no logo at all.
                img.onerror = () => {
                    window.UIPanel.close(img);
                    if (this._logoSprite) this._logoSprite.visible = true;
                };
                document.body.appendChild(img);
            }
            // Transparent until syncLogoOverlay has placed it once: the
            // picture's own dimensions are read off the PIXI bitmap, which is
            // usually still loading when the scene is built, and a shown but
            // unplaced <img> paints the whole 1280x720 plate at the top-left
            // corner for those frames.
            img.className = 'title-logo-overlay';
            this._logoOverlay = img;
        }
        window.UIPanel.open(img);
        this.syncLogoOverlay();
    };

    // Place the overlay exactly where the PIXI logo would be, mapping game
    // coordinates through the (possibly letterboxed) canvas rect.
    Scene_Title.prototype.syncLogoOverlay = function () {
        const img = this._logoOverlay;
        const sprite = this._logoSprite;
        if (!img || window.UIPanel.isClosed(img) || !sprite || !sprite.bitmap) return;
        const bmp = sprite.bitmap;
        if (!bmp.isReady || !bmp.isReady() || !bmp.width) return;
        const canvas = Graphics._canvas;
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        if (!rect || !rect.width) return;
        const sx = rect.width / Graphics.width;
        const sy = rect.height / Graphics.height;
        const w = bmp.width * sprite.scale.x;
        const h = bmp.height * sprite.scale.y;
        window.UIPanel.placeAt(img, Math.round(rect.left + sprite.x * sx),
            Math.round(rect.top + sprite.y * sy));
        img.style.setProperty('--title-w', Math.round(w * sx) + 'px');
        img.style.setProperty('--title-h', Math.round(h * sy) + 'px');
        // Now that it has a box, it can be shown. Every early return above leaves
        // it transparent, so it is never painted at its natural size. The PIXI
        // logo it stands in for is covered by the scene's own fade-in; this one
        // is not, so it is faded up by hand the first time it is placed.
        if (img.style.opacity !== '1') {
            img.classList.add('title-faded-in');
            fadeInOverlay(img, 0);
        }
    };

    // The window is still settling while the title is being built: Scene_Boot
    // maximizes the window (or asks for fullscreen) and the OS applies that over
    // the following frames, so the canvas rect the HTML panels are first sized
    // against is not the final one. Sizing them straight away made the menu and
    // the readouts visibly jump to a bigger scale a moment after the title
    // appeared. They are therefore held invisible until the canvas rect has
    // stopped moving, then shown once at their final size. The timeout is a
    // safety net so the UI is never withheld, whatever the canvas is doing.
    const LAYOUT_SETTLE_FRAMES = 6;
    const LAYOUT_SETTLE_TIMEOUT = 120;

    // Every HTML panel sized off the canvas rect, i.e. everything that would be
    // seen rescaling. Collected by id rather than by scene field because a
    // background builds its own readouts and controls on its own schedule, and a
    // panel that turns up mid-hold has to be held as well.
    //
    // The logo overlay is deliberately absent: it is re-pinned to the PIXI logo
    // every frame (and gates itself on being placed, see syncLogoOverlay), so it
    // never shows at the wrong size and hiding it here would only blink it.
    //
    // The order matters, if only a little: it is also the order the panels are
    // faded up in once the hold is over (fadeInOverlays), so it reads menu first,
    // then the top-left stack (badge, flags, update notice), then the background
    // switcher and the disclaimer, then whatever the background itself puts up.
    const SCALED_OVERLAY_IDS = [
        'title-menu-container',
        'title-version',
        'title-language',
        'title-update',
        'title-bg-switch',
        'title-music-switch',
        'title-disclaimer',
        'title-hyperverse-info',
        'title-hyperverse-catalog',
        'title-hyperverse-next',
        'title-hyperverse-catalog-btn',
        'title-autodrive-info',
        'title-artifact-labels',
        'title-enemies3d-labels'
    ];

    Scene_Title.prototype.scaledOverlayNodes = function () {
        return SCALED_OVERLAY_IDS
            .map(id => document.getElementById(id))
            .filter(Boolean);
    };

    // visibility rather than display or opacity: the panels keep their box so the
    // layout pass can still measure them (the disclaimer is docked under the
    // measured height of the switcher), and their own fade-ins are left alone.
    Scene_Title.prototype.setScaledOverlaysVisible = function (visible) {
        for (const el of this.scaledOverlayNodes()) {
            el.classList.toggle('title-invisible', !visible);
        }
    };

    Scene_Title.prototype.beginOverlaySettle = function () {
        this._overlaysSettled = false;
        this._layoutStableFrames = 0;
        this._layoutSettleFrames = 0;
        this.setScaledOverlaysVisible(false);
    };

    // Reveal once the canvas rect has held still for a few consecutive frames.
    // Panels created after the hold started (a background's readout) are hidden
    // on the way through, so nothing slips out at the wrong size.
    Scene_Title.prototype.updateOverlaySettle = function () {
        if (this._overlaysSettled) return;
        this._layoutSettleFrames++;
        this._layoutStableFrames++;
        if (this._layoutStableFrames < LAYOUT_SETTLE_FRAMES &&
            this._layoutSettleFrames < LAYOUT_SETTLE_TIMEOUT) {
            this.setScaledOverlaysVisible(false);
            return;
        }
        this._overlaysSettled = true;
        this.layoutOverlays();
        this.setScaledOverlaysVisible(true);
        this.fadeInOverlays();
        this.liftFadeVeil();
    };

    // Take the veil away once the panels are placed and shown. It is held for
    // two more frames first, so what comes out from under it is the finished
    // screen and not the frame the panels were shown on.
    Scene_Title.prototype.liftFadeVeil = function () {
        if (this._veilLifted) return;
        this._veilLifted = true;
        const raf = window.requestAnimationFrame;
        if (typeof raf !== 'function') { TitleVeil.lift(true); return; }
        raf(() => raf(() => TitleVeil.lift(true)));
    };

    // Fade the panels up in the order SCALED_OVERLAY_IDS lists them. A panel that
    // is not on screen (the update notice with no build waiting) still takes its
    // slot in the stagger, so the rhythm does not change with what the build
    // happens to be showing.
    Scene_Title.prototype.fadeInOverlays = function () {
        this.scaledOverlayNodes().forEach((el, i) => fadeInOverlay(el, i * OVERLAY_FADE_STEP));
    };

    // Re-place every HTML panel against the current canvas rect. Run once the
    // scene is built and again whenever the canvas moves or resizes (window
    // resize, fullscreen toggle, resolution change), which is what keeps the
    // title readable and correctly framed at any resolution.
    Scene_Title.prototype.layoutOverlays = function () {
        const rect = TitleLayout.rect();
        const scale = TitleLayout.scale(rect);
        this._layoutSignature = TitleLayout.signature();

        // Stretch the menu wrapper over the canvas so the menu's percentage
        // placement is relative to the picture and not to the window, and hand
        // the stylesheet the scale its metrics are multiplied by.
        if (this._menuContainer) {
            const st = this._menuContainer.style;
            st.setProperty('--title-x', Math.round(rect.left) + 'px');
            st.setProperty('--title-y', Math.round(rect.top) + 'px');
            st.setProperty('--title-w', Math.round(rect.width) + 'px');
            st.setProperty('--title-h', Math.round(rect.height) + 'px');
            st.setProperty('--ts-ui-scale', String(scale));
        }

        if (this._logoSprite) this._logoSprite.layout();
        this.layoutBgSwitchButton();
        // After the switcher: the music plate is docked under its measured bottom.
        this.layoutMusicSwitchButton();
        this.layoutVersionBadge();
        // After the badge: the selector is docked under its measured bottom.
        this.layoutLanguageSelector();
        // ... and the update notice under the selector's.
        this.layoutUpdateButton();
        this.layoutDisclaimerBox();
        if (this._hyperverseBg && this._hyperverseBg.layout) this._hyperverseBg.layout();
        if (this._autoDriveBg && this._autoDriveBg.layout) this._autoDriveBg.layout();
        this.syncLogoOverlay();
    };

    // Spawn one background item according to the active mode.
    Scene_Title.prototype.spawnBackgroundItem = function () {
        if (this._bgMode === 'hyperverse' || this._bgMode === 'autodrive') {
            // These backgrounds drive their own animation; nothing to spawn.
            return;
        }
        if (this._bgMode === 'space') {
            // Unified starfield: planets, stars, black holes and galaxies share
            // one preset, each kept within its own cap so the mix stays balanced.
            if (!this._floatingContainer) return;
            const kids = this._floatingContainer.children;
            const planets = kids.filter(c => c._isPlanet).length;
            const galaxies = kids.filter(c => c._isCelestial && c._data && c._data.kind === 'galaxy').length;
            const stars = kids.filter(c => c._isCelestial && c._data && c._data.kind !== 'galaxy').length;
            if (planets + stars + galaxies >= 6) return;
            const options = [];
            if (planets < 2) options.push('planet');
            if (stars < 3) options.push('star');
            if (galaxies < 2) options.push('galaxy');
            if (options.length === 0) return;
            const choice = options[Math.floor(Math.random() * options.length)];
            if (choice === 'planet') {
                this._floatingContainer.addChild(new FloatingPlanet(this._cardIdCounter++));
            } else if (choice === 'star') {
                const d = HARDCODED_STARS[Math.floor(Math.random() * HARDCODED_STARS.length)];
                this._floatingContainer.addChild(new FloatingCelestial(this._cardIdCounter++, d, renderStarOrHole, { animated: true }));
            } else {
                const pool = getGalaxyPool();
                const d = pool[Math.floor(Math.random() * pool.length)];
                this._floatingContainer.addChild(new FloatingCelestial(this._cardIdCounter++, d, renderGalaxy, { animated: false }));
            }
        } else if (this._bgMode === 'bestiary') {
            // 3D bestiary: the models are spawned by their own scene.
            if (this._enemies3dBg) { this._enemies3dBg.spawn(); return; }
            if (!this._floatingContainer) return;
            const MAX_MONSTERS = 2;
            const monsters = this._floatingContainer.children.filter(c => c._isMonster);
            if (monsters.length >= MAX_MONSTERS) return;
            // Assign each card to a free horizontal lane so cards never collide.
            const laneW = 340;
            const laneCount = Math.max(1, Math.floor(Graphics.width / laneW));
            const occupied = new Set(monsters.map(c => c._lane));
            const free = [];
            for (let i = 0; i < laneCount; i++) if (!occupied.has(i)) free.push(i);
            if (free.length === 0) return;
            const lane = free[Math.floor(Math.random() * free.length)];
            const monster = new FloatingMonster(this._cardIdCounter++, lane, laneCount);
            this._floatingContainer.addChild(monster);
        } else if (this._bgMode === 'artifacts' || this._bgMode === 'weapons') {
            if (this._weaponBg) this._weaponBg.spawn();
        } else {
            if (!this._floatingContainer) return;
            const cards = this._floatingContainer.children.filter(c => !c._isPlanet && !c._isMonster && !c._isCelestial);
            // Cards are 400px wide; give each lane a little breathing room so
            // adjacent columns can never touch.
            const laneW = 440;
            const laneCount = Math.max(1, Math.floor(Graphics.width / laneW));
            // A lane is only free once its newest card has fully entered the
            // screen, so a spawning card (which starts at the bottom edge) can
            // never overlap the card already above it in the same column.
            const occupied = new Set(
                cards.filter(c => c.y + c.height > Graphics.height).map(c => c._lane)
            );
            const free = [];
            for (let i = 0; i < laneCount; i++) if (!occupied.has(i)) free.push(i);
            if (free.length === 0) return;
            const lane = free[Math.floor(Math.random() * free.length)];
            const data = getRandomData();
            if (!data) return;
            const newCard = new FloatingCard(data, this._cardIdCounter++, lane, laneCount);
            this._floatingContainer.addChild(newCard);
        }
    };

    // --- HTML UI Overlay methods (following CharacterCreation.js pattern) ---

    Scene_Title.prototype.createUIOverlay = function () {
        // Mute native command window and stop it from processing input
        if (this._commandWindow) {
            this._commandWindow.visible = false;
            this._commandWindow.opacity = 0;
            this._commandWindow.deactivate();
        }

        // Create HTML container
        let container = document.getElementById("title-menu-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "title-menu-container";
            document.body.appendChild(container);
        }

        this._menuContainer = container;
        window.UIPanel.open(this._menuContainer);
        // Leave hit-testing to the stylesheet: the container spans the whole
        // screen, so forcing pointer-events here would make it swallow every
        // press on the background and kill the 3D free-look drag / wheel zoom.
        // Only .ts-menu-overlay (the actual list) takes pointer events.

        this._menuContainer.innerHTML = "";

        this._lastCommandIndex = -1;
        this.refreshUIOverlayDOM();
    };

    Scene_Title.prototype.getTitleCommandText = function () {
        const commands = [];
        // Mirrors Window_TitleCommand.makeCommandList: with no world there is
        // nowhere to start a game, so every entry that would need one is shown
        // greyed out rather than silently kicking the player to another screen.
        const worldReady = hasActiveWorld();

        commands.push({
            text: T('Titlescreen.menuOverlay.quickContinue'),
            symbol: 'quickContinue',
            enabled: worldReady && hasQuickContinueSave()
        });

        if (!hideStartOptions) {
            commands.push({
                text: T('Titlescreen.menuOverlay.explore'),
                symbol: 'newGame',
                enabled: worldReady
            });
        }

        commands.push({
            text: T('Titlescreen.menuOverlay.reconnect'),
            symbol: 'continue',
            enabled: this._commandWindow ? this._commandWindow.isContinueEnabled() : false
        });

        commands.push({
            text: T(storyCommandKey(true)),
            symbol: 'storymode',
            enabled: storyModeAvailable()
        });

        // Keep these in the SAME order as Window_TitleCommand.makeCommandList: the
        // DOM overlay maps its click/selection index straight onto the command
        // window, so any mismatch fires the wrong handler.
        commands.push({
            text: T('Titlescreen.menuOverlay.minigames'),
            symbol: 'minigames'
        });

        if (!hideStartOptions) {
            commands.push({
                text: T('Titlescreen.menuOverlay.sandbox'),
                symbol: 'sandboxGame',
                enabled: worldReady
            });
        }

        const activeWorld = window.WorldManager ? window.WorldManager.activeWorldName : null;

        commands.push({
            text: T('Titlescreen.menuOverlay.worlds') +
                (activeWorld
                    ? ` [${activeWorld.toUpperCase()}]`
                    : ` [${T('Titlescreen.menuOverlay.noWorld')}]`),
            symbol: 'worlds'
        });

        commands.push({
            text: T('Titlescreen.menuOverlay.preferences'),
            symbol: 'options'
        });

        commands.push({
            text: T('Titlescreen.menuOverlay.mods'),
            symbol: 'mods'
        });

        commands.push({
            text: T('Titlescreen.menuOverlay.exit'),
            symbol: 'exitGame'
        });

        return commands;
    };

    Scene_Title.prototype.refreshUIOverlayDOM = function () {
        if (!this._menuContainer || !this._commandWindow) return;

        const commands = this.getTitleCommandText();
        const activeIndex = this._selectedCommandIndex;

        if (this._lastCommandIndex === activeIndex) return;

        this._lastCommandIndex = activeIndex;

        const menuItems = commands.map((cmd, index) => {
            const isSelected = index === activeIndex;
            const isDisabled = cmd.enabled === false;
            // i18n-ignore-start: css class names and inline handlers, not text.
            // The only user-facing string here is cmd.text, already localised in
            // getTitleCommandText.
            return `
                <div class="ts-menu-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}"
                     data-index="${index}" data-symbol="${cmd.symbol}"
                     onmouseenter="SceneManager._scene && SceneManager._scene.onTitleCommandHover && SceneManager._scene.onTitleCommandHover(${index})"
                     onclick="SceneManager._scene && SceneManager._scene.onTitleCommandClick && SceneManager._scene.onTitleCommandClick(${index})">
                    <span class="ts-menu-text">${cmd.text}</span>
                </div>
            `;
            // i18n-ignore-end
        }).join("");

        this._menuContainer.innerHTML = `
            <div class="ts-menu-overlay">
                <div class="ts-menu-list">
                    ${menuItems}
                </div>
            </div>
        `;
    };

    Scene_Title.prototype.onTitleCommandHover = function (index) {
        if (!this._commandWindow) return;
        if (this._storyModeWindow && this._storyModeWindow.visible) return;

        const commands = this.getTitleCommandText();
        const cmd = commands[index];
        if (!cmd || cmd.enabled === false) return;
        if (this._selectedCommandIndex === index) return;

        SoundManager.playCursor();
        this._selectedCommandIndex = index;
        this._lastCommandIndex = -1; // Force refresh so highlight follows the mouse
        this.refreshUIOverlayDOM();
    };

    Scene_Title.prototype.onTitleCommandClick = function (index) {
        if (!this._commandWindow) return;
        if (this._storyModeWindow && this._storyModeWindow.visible) return;

        const commands = this.getTitleCommandText();
        const cmd = commands[index];

        if (cmd.enabled === false) return;

        // No confirm sound on the title: choosing an entry is silent.
        this._selectedCommandIndex = index;
        this._lastCommandIndex = -1; // Force refresh so the click highlight matches
        this.refreshUIOverlayDOM();

        this._commandWindow.select(index);
        this._commandWindow.callOkHandler();
    };

    Scene_Title.prototype.terminate = function () {
        this._isDestroyed = true;
        // Leaving before the title ever settled would otherwise leave a black
        // sheet over the scene that follows.
        TitleVeil.lift(false);
        if (this._weaponBg) {
            this._weaponBg.dispose();
            this._weaponBg = null;
        }
        if (this._enemies3dBg) {
            this._enemies3dBg.dispose();
            this._enemies3dBg = null;
        }
        if (this._hyperverseBg) {
            this._hyperverseBg.dispose();
            this._hyperverseBg = null;
        }
        if (this._autoDriveBg) {
            this._autoDriveBg.dispose();
            this._autoDriveBg = null;
        }
        if (this._bgSwitchButton && this._bgSwitchButton.parentNode) {
            this._bgSwitchButton.parentNode.removeChild(this._bgSwitchButton);
        }
        this._bgSwitchButton = null;
        this._bgSwitchLabel = this._bgSwitchPrev = this._bgSwitchNext = null;
        if (this._musicSwitchButton && this._musicSwitchButton.parentNode) {
            this._musicSwitchButton.parentNode.removeChild(this._musicSwitchButton);
        }
        this._musicSwitchButton = null;
        this._musicSwitchLabel = this._musicSwitchPrev = this._musicSwitchNext = null;
        if (this._versionBadge && this._versionBadge.parentNode) {
            this._versionBadge.parentNode.removeChild(this._versionBadge);
        }
        this._versionBadge = null;
        this.removeLanguageSelector();
        this.removeUpdateButton();
        this.removeDisclaimerBox();
        if (this._logoOverlay && this._logoOverlay.parentNode) {
            this._logoOverlay.parentNode.removeChild(this._logoOverlay);
        }
        this._logoOverlay = null;
        if (this._menuContainer) {
            const container = this._menuContainer;
            container.classList.add('title-menu--leaving');

            if (window._tsOverlayTimeout) {
                clearTimeout(window._tsOverlayTimeout);
            }
            window._tsOverlayTimeout = setTimeout(() => {
                if (container) {
                    container.innerHTML = "";
                    container.classList.remove('title-menu--leaving');
                    window.UIPanel.close(container);
                }
                window._tsOverlayTimeout = null;
            }, 200);
        }
    };

    Scene_Title.prototype.updateUIInput = function () {
        if (!this._commandWindow) return;
        if (this._storyModeWindow && this._storyModeWindow.visible) return;
        // The Hyperverse catalog is modal: while its list is up (and for the
        // frame after the press that closed it) the keyboard belongs to the
        // body picker, so choosing a body never also fires a title command.
        if (this._hyperverseBg && this._hyperverseBg.blocksTitleInput()) return;

        // Some other plugin's Input.initialize hook (e.g. KanbanQuestLog.js
        // remaps 87/65/83/68 to its own 'w'/'a'/'s'/'d' actions) runs at boot
        // AFTER this file's own top-level keyMapper assignment, silently
        // stealing W/A/S/D away from up/down/left/right and breaking menu
        // navigation. Reassert it every frame the title overlay is up so this
        // menu's WASD navigation always wins regardless of load order.
        Input.keyMapper[87] = 'up';
        Input.keyMapper[83] = 'down';
        Input.keyMapper[65] = 'left';
        Input.keyMapper[68] = 'right';

        const commands = this.getTitleCommandText();
        const maxItems = commands.length;
        if (maxItems <= 0) return;

        let moved = false;
        let index = this._selectedCommandIndex;

        if (Input.isTriggered('down') || Input.isRepeated('down')) {
            // Find next enabled item
            let newIndex = index;
            do {
                newIndex = (newIndex + 1) % maxItems;
            } while (commands[newIndex].enabled === false && newIndex !== index);
            if (newIndex !== index) {
                index = newIndex;
                moved = true;
            }
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            // Find previous enabled item
            let newIndex = index;
            do {
                newIndex = (newIndex - 1 + maxItems) % maxItems;
            } while (commands[newIndex].enabled === false && newIndex !== index);
            if (newIndex !== index) {
                index = newIndex;
                moved = true;
            }
        } else if (Input.isTriggered('ok')) {
            // callOkHandler bypasses the window's own enabled check, so a
            // greyed-out entry (no world yet) has to be refused here.
            const chosen = commands[this._selectedCommandIndex];
            if (!chosen || chosen.enabled === false) {
                SoundManager.playBuzzer();
            } else {
                // Silent confirm, as on the mouse path.
                this._commandWindow.select(this._selectedCommandIndex);
                this._commandWindow.callOkHandler();
            }
        } else if (Input.isTriggered('cancel')) {
            // No cancel on title screen - do nothing
        }

        if (moved) {
            SoundManager.playCursor();
            this._selectedCommandIndex = index;
            this._lastCommandIndex = -1; // Force refresh
            this.refreshUIOverlayDOM();
        }
    };

    const _Scene_Title_start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function () {
        _Scene_Title_start.call(this);
        this.startFadeIn(this.fadeSpeed(), false);
        // After start, sync our HTML overlay's highlighted index with the
        // command window's actual selection (Reconnect, or Explore if no save exists)
        // and force a redraw so the overlay reflects it immediately.
        if (this._commandWindow) {
            this._selectedCommandIndex = this._commandWindow.index();
            this._lastCommandIndex = -1;
            this.refreshUIOverlayDOM();
        }
    };

    const parameters = PluginManager.parameters(pluginName);
    const heightMultiplier = parseFloat(parameters['heightMultiplier']) || 2.0;

    // Simply make the command window taller
    const _Scene_Title_commandWindowRect = Scene_Title.prototype.commandWindowRect;
    Scene_Title.prototype.commandWindowRect = function () {
        const rect = _Scene_Title_commandWindowRect.call(this);

        // Make the window taller
        rect.height = rect.height * heightMultiplier;

        // Keep it within screen bounds
        const maxHeight = Graphics.height - rect.y - 20;
        if (rect.height > maxHeight) {
            rect.height = maxHeight;
        }

        return rect;
    };

    // Override update to handle HTML UI input
    const _Scene_Title_update = Scene_Title.prototype.update;
    Scene_Title.prototype.update = function () {
        _Scene_Title_update.call(this);

        // L1 / R1 (and the chevrons' badge state) for the background switcher
        this.updateBgSwitchInput();
        this.updateMusicSwitchInput();

        // Follow the canvas when the window changes (resize, fullscreen toggle):
        // the signature only differs on the frames where it actually moved.
        if (TitleLayout.signature() !== this._layoutSignature) {
            this.layoutOverlays();
            // The canvas is still moving, so the panels are not at their final
            // size yet: restart the settle count.
            this._layoutStableFrames = 0;
        }
        this.updateOverlaySettle();

        // Keep the DOM logo pinned to the PIXI logo (image load, window resize)
        if (this._logoOverlay) this.syncLogoOverlay();

        // Update the Hyperverse cinematic background, if active
        if (this._hyperverseBg) {
            this._hyperverseBg.update();
        }

        // Update the Auto Drive background, if active
        if (this._autoDriveBg) {
            this._autoDriveBg.update();
        }

        // Update all floating items (cards or planets)
        if (this._floatingContainer) {
            this._floatingContainer.children.forEach(c => c.update && c.update());
        }

        // Update the 3D weapon background, if active
        if (this._weaponBg) {
            this._weaponBg.update();
        }

        // Update the 3D enemies background, if active
        if (this._enemies3dBg) {
            this._enemies3dBg.update();
        }

        // Spawn new background items on a single uniform cadence across every
        // mode, each mode capped, so the on-screen density and the rate at which
        // new elements appear feels the same regardless of background style.
        this._bgSpawnCd = (this._bgSpawnCd || 0) - 1;
        if (this._bgSpawnCd <= 0) {
            this.spawnBackgroundItem(); // no-op when the mode is already at its cap
            this._bgSpawnCd = 45;       // ~0.75s between attempts, so gaps refill fast
        }

        if (!this._floatingContainer) return;

        const cards = this._floatingContainer.children;
        const fadeSpeed = 0.03; // Slightly faster fade for better visibility

        // The pair set only changes when a card spawns or despawns, so the O(n²)
        // pair rebuild (with its per-pair string keys) is throttled: it runs when
        // the card membership changes or at most every 30 frames. Membership is
        // detected via a cheap length + last-card-id signature. Each frame we
        // only animate alphas for the cached pairs and redraw the moving lines.
        const lastCard = cards.length ? cards[cards.length - 1] : null;
        const membershipSig = cards.length + ':' + (lastCard ? lastCard._cardId : -1);
        this._pairRecalcCd = (this._pairRecalcCd || 0) - 1;
        if (membershipSig !== this._lastMembershipSig || this._pairRecalcCd <= 0) {
            this._lastMembershipSig = membershipSig;
            this._pairRecalcCd = 30;

            // Mark every existing connection as "should fade out" first...
            for (const key in this._connections) {
                this._connections[key].shouldExist = false;
            }
            // ...then (re)assert the pairs that currently exist.
            for (let i = 0; i < cards.length; i++) {
                for (let j = i + 1; j < cards.length; j++) {
                    const cardA = cards[i];
                    const cardB = cards[j];
                    const key = cardA._cardId < cardB._cardId
                        ? `${cardA._cardId}_${cardB._cardId}`
                        : `${cardB._cardId}_${cardA._cardId}`;

                    let conn = this._connections[key];
                    if (!conn) {
                        conn = this._connections[key] = { a: cardA, b: cardB, alpha: 0 };
                    }
                    conn.shouldExist = true;
                }
            }
        }

        // Animate connection alphas each frame based on the cached shouldExist
        // flag, and redraw the (moving) lines.
        if (this._lineGraphics) this._lineGraphics.clear();
        for (const key in this._connections) {
            const conn = this._connections[key];

            if (conn.shouldExist) {
                if (conn.alpha < 0.4) conn.alpha = Math.min(conn.alpha + fadeSpeed, 0.4);
            } else {
                conn.alpha -= fadeSpeed;
                if (conn.alpha <= 0) {
                    delete this._connections[key];
                    continue;
                }
            }

            // Draw the connection line (positions move every frame)
            if (this._lineGraphics) {
                const { a, b, alpha } = conn;
                if (a && b && a.parent && b.parent) {
                    this._lineGraphics.lineStyle(2, 0xFFD700, alpha); // Thicker gold lines
                    this._lineGraphics.moveTo(a.x + a.width / 2, a.y + a.height / 2);
                    this._lineGraphics.lineTo(b.x + b.width / 2, b.y + b.height / 2);
                }
            }
        }

        // Update HTML UI input
        if (this._menuContainer) {
            this.updateUIInput();
        }
    };
})();

//=============================================================================
// The title music is a record off the concert hall shelf
//=============================================================================
// The title screen used to play whatever single track the database named. It
// now plays whatever the music switcher is set to, and audio/bgm/Classical is
// still a station of the radio's dial. The database's own title BGM is what
// plays if the switcher is unavailable.
(() => {
    'use strict';

    const CLASSICAL_DIR = 'audio/bgm/Classical';  // i18n-ignore  asset path
    const AUDIO_EXT = /\.(ogg|m4a)_?$/i;

    let cache = null;

    function tracks() {
        if (cache) return cache;
        cache = [];
        if (typeof require !== 'function') return cache;
        try {
            const fs = require('fs');
            const path = require('path');
            const dir = path.join(process.cwd(), CLASSICAL_DIR);
            cache = fs.readdirSync(dir)
                .filter(name => AUDIO_EXT.test(name))
                .map(name => 'Classical/' + name.replace(AUDIO_EXT, ''))  // i18n-ignore  bgm key
                .sort();
        } catch (e) {
            cache = [];
        }
        return cache;
    }

    // The title opens on whatever the music switcher is set to, so the piece
    // heard on arrival is the one the player picked and not a fresh draw.
    const _Scene_Title_playTitleMusic = Scene_Title.prototype.playTitleMusic;
    Scene_Title.prototype.playTitleMusic = function () {
        if (this.playTitleBgm) {
            this.playTitleBgm();
            return;
        }
        _Scene_Title_playTitleMusic.call(this);
    };

    window.TitleClassicalMusic = { tracks };
})();
