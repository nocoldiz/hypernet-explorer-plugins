/*:
 * @target MZ
 * @plugindesc HTML credits roll for the title screen menu
 * @author Omni-Lex
 * @version 3.0
 *
 * @param Credits Speed
 * @desc Speed at which credits scroll (1-10, higher is faster)
 * @type number
 * @min 1
 * @max 10
 * @default 3
 *
 * @param Background Image
 * @desc Background image for the credits screen (leave blank for default)
 * @type file
 * @dir img/titles1/
 * @default
 *
 * @help
 * ===========================================================================
 * Credits
 * ===========================================================================
 *
 * Adds a Credits entry to the title menu, above Exit.
 *
 * The roll is an HTML overlay like the rest of the game's menus, wearing the
 * title screen's own chrome ('Square' monospace, gold on black) and styled
 * from css/theme.css (#credits-overlay).
 *
 * The credits themselves are a data table below: every entry is a name, an
 * optional author and any number of addresses. Only the section titles are
 * translated (TitleCredits.sections in the i18n files); a person, a pack or a
 * URL reads the same in every language.
 *
 * Controls: the roll scrolls on its own, Up/Down and the wheel take it over,
 * OK pauses and resumes, Cancel returns to the title.
 *
 * ===========================================================================
 */

(() => {
    'use strict';

    const pluginName = "TitleMenuCreditsSettings";

    //=============================================================================
    // Plugin Parameters
    //=============================================================================

    const parameters = PluginManager.parameters(pluginName);
    const creditsSpeed = Number(parameters['Credits Speed'] || 3);
    const backgroundImage = parameters['Background Image'] || "";

    //=============================================================================
    // Credits data
    //=============================================================================
    // section: an i18n key under TitleCredits.sections
    // name:    what was used (a pack, a plugin, a piece of music)
    // by:      who made it, when they are credited by name
    // urls:    where it came from, written without the protocol

    const CREDITS_SECTIONS = [
        {
            section: 'team',
            entries: [
                { name: 'Mapper', by: 'fedepperez', urls: ['github.com/fedepperez'] }
            ]
        },
        {
            section: 'localization',
            entries: [
                { name: 'Korean Localization', by: 'citrusMB', urls: ['github.com/citrusMB'] },
                { name: 'Russian Translation', by: 'Lobshisdik', urls: ['github.com/Lobshisdik'] },
                { name: 'French Localization', by: 'sarvvvvvv', urls: ['github.com/sarvvvvvv'] }
            ]
        },
        {
            section: 'sprites',
            entries: [
                { name: 'Horror Monster Battler Sprite Pack', by: 'invalid-user621', urls: ['invalid-user621.itch.io/horror-monster-battler-sprite-pack'] },
                { name: 'Watercolour Monster Pack', by: 'metalsnail', urls: ['metalsnail.itch.io/watercolour-monster-pack'] },
                { name: 'The Mighty Pack', by: 'themightypalm', urls: ['themightypalm.itch.io/the-mighty-pack'] },
                { name: '95% Off Ultimate Portrait Pack', urls: ['itch.io/s/121612/95-off-ultimate-portrait-pack'] }
            ]
        },
        {
            section: 'tilesets',
            entries: [
                { name: 'Damp Dungeons', by: 'arex-v', urls: ['arex-v.itch.io/damp-dungeons'] },
                { name: 'Modern Exteriors', by: 'limezu', urls: ['limezu.itch.io/modernexteriors'] },
                { name: 'Chronicle Tileset Pack', by: 'wardwellgames', urls: ['wardwellgames.itch.io/chronicle-tileset-pack'] },
                { name: 'Ashlands Tileset', by: 'finalbossblues', urls: ['finalbossblues.itch.io/ashlands-tileset'] },
                { name: 'TF Jungle Tileset', by: 'finalbossblues', urls: ['finalbossblues.itch.io/tf-jungle-tileset'] },
                { name: 'Atlantis Tileset', by: 'finalbossblues', urls: ['finalbossblues.itch.io/atlantis-tileset'] },
                { name: 'Dark Dimension Tileset', by: 'finalbossblues', urls: ['finalbossblues.itch.io/dark-dimension-tileset'] },
                { name: 'TF Beach Tileset', by: 'finalbossblues', urls: ['finalbossblues.itch.io/tf-beach-tileset'] },
                { name: 'Fantasy', by: 'arex-v', urls: ['arex-v.itch.io/fantasy'] },
                { name: 'Occult Steampunk', by: 'arex-v', urls: ['arex-v.itch.io/occult-steampunk'] }
            ]
        },
        {
            section: 'plugins',
            entries: [
                { name: 'Smooth Battle Log 2.0', urls: ['forums.rpgmakerweb.com/index.php?threads/smooth-battle-log-2-0-mz.131465/'] },
                { name: 'Event Spawner', by: 'cocomode', urls: ['cocomode.itch.io/event-spawner'] },
                { name: 'Enemy Levels Plugin for RPG Maker MZ', by: 'cocomode', urls: ['cocomode.itch.io/enemy-levels-plugin-for-rpg-maker-mz'] },
                { name: 'Customized Dynamically Generated Chest Loot', by: 'cocomode', urls: ['cocomode.itch.io/customized-dynamically-generated-chest-loot-for-rpg-maker-mz'] },
                { name: 'Revealed Area Map for RPG Maker MZ', by: 'cocomode', urls: ['cocomode.itch.io/revealed-area-map-for-rpg-maker-mz'] },
                { name: 'TurnInPlace.js', by: 'mjshi', urls: ['github.com/mjshi/RPGMakerRepo/blob/master/TurnInPlace.js'] },
                { name: "SLIM's This and That's", urls: ['forums.rpgmakerweb.com/index.php?threads/slims-this-and-thats-mz-edition.125627/'] },
                { name: "CandaCi's Resources for MZ", urls: ['forums.rpgmakerweb.com/index.php?threads/candacis-resources-for-mz.126137/'] },
                { name: "Avery's Experimental XP to MZ Conversions", urls: ['forums.rpgmakerweb.com/index.php?threads/averys-experimental-xp-to-mz-conversions-default-and-original.153808/'] }
            ]
        },
        {
            section: 'ui',
            entries: [
                { name: 'Pixel UI & SFX Pack', by: 'jdsherbert', urls: ['jdsherbert.itch.io/pixel-ui-sfx-pack'] },
                { name: 'Effekseer Animation MZ', by: 'nowis-337', urls: ['nowis-337.itch.io/effekseer-animation-mz'] },
                { name: 'RPG Maker MV UPP Windowskin Pack', by: 'theunpropro', urls: ['theunpropro.itch.io/rpg-maker-mv-upp-windowskin-pack'] }
            ]
        },
        {
            section: 'maps',
            entries: [
                { name: 'Europa MZ Free Semi-Detailed Map of Europe', urls: ['forums.rpgmakerweb.com/index.php?threads/europa-mz-free-semi-detailed-map-of-europe.125607/'] },
                { name: 'The Metropolitan Museum of Art, Collection Search', urls: ['metmuseum.org/art/collection/search'] }
            ]
        },
        {
            section: 'music',
            entries: [
                { name: 'Creepy Forest F', urls: ['opengameart.org/content/creepy-forest-f'] },
                { name: 'Cave Theme', urls: ['opengameart.org/content/cave-theme'] },
                { name: 'Three Red Hearts: Prepare to Dev', by: 'tallbeard', urls: ['tallbeard.itch.io/three-red-hearts-prepare-to-dev'] },
                { name: 'Swamp Environment Audio', urls: ['opengameart.org/content/swamp-environment-audio'] },
                { name: 'Ambient Noise', urls: ['opengameart.org/content/ambient-noise'] },
                { name: 'Ambient Mountain, River, Wind & Waterfall', urls: ['opengameart.org/content/ambient-mountain-river-wind-and-forest-and-waterfall'] },
                { name: 'Music Loop Bundle', by: 'tallbeard', urls: ['tallbeard.itch.io/music-loop-bundle'] },
                { name: 'Music Loops', by: 'comigo', urls: ['comigo.itch.io/music-loops'] },
                { name: 'Techno Trance Melodic Techno 03', by: 'moogify', urls: ['pixabay.com/music/techno-trance-melodic-techno-03-extended-version-moogify-9867/'] },
                { name: 'Techno Trance Dark Dub Techno, Somewhere We Got Lost', urls: ['pixabay.com/music/techno-trance-dark-dub-techno-somewhere-we-got-lost-no-copyright-music-144827/'] },
                { name: 'Medieval Exploration', urls: ['youtube.com/watch?v=XZO331MAAi0', 'youtube.com/watch?v=wGqJseFSWbA'] },
                // The radio's dial is the audio/bgm folder tree, so everything
                // broadcasting on it is credited here, one entry per station.
                { name: 'Royalty-free music library (Action, Atmospheric, Calm, Dark, Horror, Jazz, Techno and the rest of the dial)', by: 'Kevin MacLeod', urls: ['incompetech.com/', 'creativecommons.org/licenses/by/4.0/'] },
                { name: 'Fantasy and chiptune loops', by: 'RandomMind', urls: ['opengameart.org/users/randommind'] },
                { name: 'Shortcuts', by: 'Zane Little Music', urls: ['opengameart.org/users/zane-little-music'] },
                { name: 'Public-domain classical recordings (Concert Hall station)', by: 'Musopen and the European Archive, via Wikimedia Commons', urls: ['musopen.org/', 'commons.wikimedia.org/wiki/Category:Musopen', 'creativecommons.org/publicdomain/mark/1.0/'] },
                { name: 'Clocks', by: 'Nocoldiz', urls: ['nocoldiz.itch.io/'] }
            ]
        },
        {
            section: 'sound',
            entries: [
                { name: 'Underwater', by: 'freesound_community', urls: ['pixabay.com/sound-effects/underwater-6236/'] },
                { name: 'SFX', by: 'freesound_community', urls: ['pixabay.com/'] },
                { name: 'SFX', by: 'David Dumais', urls: ['pixabay.com/sound-effects/'] },
                { name: 'SFX', by: 'u_xjrmmgxfru', urls: ['pixabay.com/sound-effects/'] },
                { name: 'Tyler J Warren SFX', urls: ['tylerjwarren.itch.io/'] },
                { name: "Fantozzi's Footsteps (Grass/Sand & Stone)", by: 'Fantozzi', urls: ['opengameart.org/content/fantozzis-footsteps-grasssand-stone'] },
                { name: '42 Snow and Gravel Footsteps', by: 'Corsica_S, extracted by qubodup', urls: ['opengameart.org/content/42-snow-and-gravel-footsteps'] },
                { name: 'concrete footsteps 1.wav', by: 'patchytherat', urls: ['freesound.org/people/patchytherat/sounds/535052/'] },
                { name: 'footsteps concrete', by: 'Yuval', urls: ['freesound.org/people/Yuval/sounds/205748/'] },
                { name: 'Footsteps - Stone, Rock, Concrete, Cement', by: 'SecureSubset', urls: ['freesound.org/people/SecureSubset/sounds/813622/'] },
                // The 3D world speaks with the same voice as the 2D one: every
                // blow, every cube coming apart, every block set down and every
                // landing is played out of the footstep material library above
                // (js/db/WorldGen/FootstepMaterials.json), so the CC0 and CC-BY
                // packs credited here carry the voxel world as well.
                { name: '3D world material sounds (digging, building, landing)', by: 'the CC0 / CC-BY footstep packs above', urls: ['opengameart.org/'] }
            ]
        },
        {
            section: 'data',
            entries: [
                { name: 'Disease Descriptions', by: 'Wikipedia contributors', urls: ['wikipedia.org'] },
                { name: 'News System Content', by: 'Wikipedia contributors', urls: ['wikipedia.org'] }
            ]
        }
    ];

    //=============================================================================
    // Scene_Title Modifications
    //=============================================================================

    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler("credits", this.commandCredits.bind(this));
        this._commandWindow.setHandler("exitGame", this.commandExitGame.bind(this));
    };

    Scene_Title.prototype.commandCredits = function() {
        SceneManager.push(Scene_Credits);
    };

    Scene_Title.prototype.commandExitGame = function() {
        SceneManager.exit();
    };

    //=============================================================================
    // Window_TitleCommand Modifications
    //=============================================================================

    const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _Window_TitleCommand_makeCommandList.call(this);
        // Titlescreen.js already ends its list with its own Exit entry, so the
        // Credits entry goes just above it instead of being appended after it
        // (appending would also duplicate Exit).
        const at = this._list.findIndex(c => c.symbol === "exitGame");
        const entry = { name: T('TitleCredits.credits'), symbol: "credits", enabled: true, ext: null };
        if (at >= 0) {
            this._list.splice(at, 0, entry);
        } else {
            this._list.push(entry);
            this.addCommand(T('TitleCredits.exit'), "exitGame");
        }
    };

    // Titlescreen.js draws its own DOM overlay from getTitleCommandText and maps
    // the clicked index straight onto the command window, so the entry has to be
    // spliced into that list at the very same place or Credits never shows up.
    if (Scene_Title.prototype.getTitleCommandText) {
        const _Scene_Title_getTitleCommandText = Scene_Title.prototype.getTitleCommandText;
        Scene_Title.prototype.getTitleCommandText = function() {
            const commands = _Scene_Title_getTitleCommandText.call(this);
            const at = commands.findIndex(c => c.symbol === "exitGame");
            const entry = { text: T('TitleCredits.credits'), symbol: "credits" };
            if (at >= 0) {
                commands.splice(at, 0, entry);
            } else {
                commands.push(entry);
            }
            return commands;
        };
    }

    //=============================================================================
    // Layout
    //=============================================================================
    // The game renders into a fixed 1280x720 canvas that is stretched (and, on an
    // off-aspect window, letterboxed) into whatever window the player has, while
    // the roll is a DOM node on document.body measured in real viewport pixels.
    // It is therefore placed over the measured canvas rect and typed in design
    // pixels multiplied by the canvas scale, the way Titlescreen.js places its
    // own panels.

    const canvasRect = () => {
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
    };

    // Clamped at both ends so a small window still has readable text and a 4K one
    // does not turn the panel into a slab.
    const canvasScale = (rect) => {
        const r = rect || canvasRect();
        const s = Math.min(r.width / Graphics.width, r.height / Graphics.height);
        if (!isFinite(s) || s <= 0) return 1;
        return Math.max(0.75, Math.min(2, s));
    };

    const rectSignature = (r) => [r.left, r.top, r.width, r.height].map(Math.round).join(':');

    //=============================================================================
    // Markup
    //=============================================================================

    const escapeHtml = (text) => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const entryHtml = (entry) => {
        const parts = ['<div class="credits-entry">'];
        parts.push('<div class="credits-entry-name">' + escapeHtml(entry.name));
        if (entry.by) {
            parts.push('<span class="credits-entry-by"> ' +
                escapeHtml(T('TitleCredits.by')) + ' ' + escapeHtml(entry.by) + '</span>');
        }
        parts.push('</div>');
        for (const url of entry.urls || []) {
            parts.push('<div class="credits-entry-link">' + escapeHtml(url) + '</div>');
        }
        parts.push('</div>');
        return parts.join('');
    };

    const creditsBodyHtml = () => {
        const parts = [];
        for (const block of CREDITS_SECTIONS) {
            parts.push('<div class="credits-section">');
            parts.push('<div class="credits-section-title">' +
                escapeHtml(T('TitleCredits.sections.' + block.section)) + '</div>');
            for (const entry of block.entries) parts.push(entryHtml(entry));
            parts.push('</div>');
        }
        // Trailing air, so the last address clears the frame before the roll ends.
        parts.push('<div class="credits-tail"></div>');
        return parts.join('');
    };

    //=============================================================================
    // Scene_Credits
    //=============================================================================

    function Scene_Credits() {
        this.initialize(...arguments);
    }

    Scene_Credits.prototype = Object.create(Scene_Base.prototype);
    Scene_Credits.prototype.constructor = Scene_Credits;

    // Design pixels per frame at speed 10, i.e. a shade over a line a second at
    // the default 3.
    const SCROLL_UNIT = 0.6;
    // How far one wheel notch or one held direction takes the roll.
    const STEP_PIXELS = 48;

    Scene_Credits.prototype.initialize = function() {
        Scene_Base.prototype.initialize.call(this);
        this._scrollRest = 0;      // sub-pixel remainder of the automatic roll
        this._paused = false;
        this._layoutKey = null;
    };

    Scene_Credits.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        this.createBackground();
        this.createOverlay();
    };

    Scene_Credits.prototype.createBackground = function() {
        this._backgroundSprite = new Sprite();
        if (backgroundImage) {
            this._backgroundSprite.bitmap = ImageManager.loadTitle1(backgroundImage);
        } else {
            this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        }
        this.addChild(this._backgroundSprite);
    };

    Scene_Credits.prototype.createOverlay = function() {
        // Always a fresh element: the listeners below are added with
        // addEventListener, so a leftover node would stack a second handler.
        const stale = document.getElementById('credits-overlay');
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        const overlay = document.createElement('div');
        overlay.id = 'credits-overlay';
        overlay.innerHTML =
            '<div class="credits-panel">' +
                '<div class="credits-title">' + escapeHtml(T('TitleCredits.title')) + '</div>' +
                '<div class="credits-scroll"><div class="credits-body">' +
                    creditsBodyHtml() +
                '</div></div>' +
                '<div class="credits-hint">' + escapeHtml(T('TitleCredits.hint')) + '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._scroller = overlay.querySelector('.credits-scroll');

        // RMMZ preventDefaults every wheel event on document, so a pane only
        // scrolls if it handles the notch itself and keeps it from getting there.
        overlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scrollBy(e.deltaY > 0 ? STEP_PIXELS : -STEP_PIXELS);
        }, { passive: false });
        // Swallow presses so they never reach the canvas underneath.
        overlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });

        this.layoutOverlay();
    };

    // Every metric in design pixels: the panel's own type is written in em off
    // this font size, so rescaling the whole roll is one assignment.
    Scene_Credits.prototype.layoutOverlay = function() {
        const overlay = this._overlay;
        if (!overlay) return;
        const rect = canvasRect();
        this._layoutKey = rectSignature(rect);
        const s = canvasScale(rect);
        overlay.style.left = Math.round(rect.left) + 'px';
        overlay.style.top = Math.round(rect.top) + 'px';
        overlay.style.width = Math.round(rect.width) + 'px';
        overlay.style.height = Math.round(rect.height) + 'px';
        overlay.style.fontSize = Math.round(13 * s) + 'px';
    };

    Scene_Credits.prototype.scrollBy = function(pixels) {
        if (!this._scroller) return;
        this._paused = true;      // the player has taken the roll over
        this._scrollRest = 0;
        this._scroller.scrollTop += pixels;
    };

    Scene_Credits.prototype.maxScroll = function() {
        const el = this._scroller;
        return el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0;
    };

    Scene_Credits.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        if (!this._overlay) return;

        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            this.popScene();
            return;
        }
        if (Input.isTriggered('ok')) {
            this._paused = !this._paused;
            SoundManager.playCursor();
        }
        if (Input.isRepeated('down')) this.scrollBy(STEP_PIXELS);
        if (Input.isRepeated('up')) this.scrollBy(-STEP_PIXELS);

        if (this._layoutKey !== rectSignature(canvasRect())) this.layoutOverlay();

        if (this._paused) return;

        // The roll runs on whole pixels, so the remainder is carried rather than
        // dropped: a slow speed would otherwise never move at all.
        this._scrollRest += creditsSpeed * SCROLL_UNIT;
        const step = Math.floor(this._scrollRest);
        if (step > 0) {
            this._scrollRest -= step;
            this._scroller.scrollTop += step;
        }
        // Only the automatic roll ends the scene; a player reading at their own
        // pace is left where they are. A roll short enough to fit the frame has
        // nowhere to go and simply stays up until Cancel.
        const max = this.maxScroll();
        if (max > 0 && this._scroller.scrollTop >= max) {
            this.popScene();
        }
    };

    Scene_Credits.prototype.terminate = function() {
        Scene_Base.prototype.terminate.call(this);
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._scroller = null;
    };
})();
