//=============================================================================
// MusicArtistDisplay.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v1.2.0 Announces the track and artist of the playing BGM, as a toast or as a procedural cassette drawn on top of the map
 * @author Hypernet
 *
 * @param labelFont
 * @text Cassette Label Font
 * @desc The handwritten face the cassette label is written in. A CSS font stack; the first face present is used.
 * @type string
 * @default "Segoe Script", "Bradley Hand", "Ink Free", "Comic Sans MS", cursive
 *
 * @param cooldownMinutes
 * @text Per-track Cooldown
 * @desc How long a track must wait before it may be announced again, in real minutes.
 * @type number
 * @min 0
 * @max 120
 * @default 5
 *
 * @param cassetteMs
 * @text Cassette Duration
 * @desc How long the whole cassette animation lasts, in milliseconds (entry, hold and exit together).
 * @type number
 * @min 600
 * @max 10000
 * @default 4000
 *
 * @help MusicArtistDisplay.js
 *
 * Who wrote the music the player is walking around to. Options -> Audio
 * carries "Show music artist" with four answers:
 *
 *   First time  the cassette, but only the first time a track is ever heard.
 *               Every track it has introduced is remembered in the config, and
 *               a track already on that list plays unannounced. Changing the
 *               option at all wipes the list, so picking this again introduces
 *               the whole library from the beginning.
 *   Every time  the cassette, every time a track comes round again (subject to
 *               the per-track cooldown below).
 *   Minimal     the track and its artist go through window.ParchmentToast, the
 *               same notification every other system in the game speaks with.
 *   Off         nothing is announced.
 *
 * "First time" is the default. The cassette is what both cassette answers
 * draw; they differ only in how often a track is allowed to introduce itself.
 *
 * Whatever the answer, a track is only ever announced when the player put it
 * on themselves: the radio is tuned to it, or HyperAmp is playing it off the
 * desktop. The map's own score is never announced.
 *
 * -----------------------------------------------------------------------
 * Who the artist is
 * -----------------------------------------------------------------------
 * A BGM has no metadata: what the game knows about a track is the path it
 * lives at under audio/bgm, and that path is already sorted by who made it
 * ("KevinMacLeod/Atmospheric/Frozen Star"). The first folder names the
 * artist, the last segment the title, and anything between them the genre
 * the library filed it under, which the cassette prints as its tag. A track
 * sitting at the root of audio/bgm is an engine asset and is credited as
 * such; a track the player dropped into audio/bgm/BattleMusic is credited as
 * their own. ARTIST_FOLDERS below only spells names that the folder spells
 * differently ("TallBeard" is Abstraction, by that bundle's own readme);
 * every other folder is credited exactly as it is named, so a new artist
 * folder needs no code change to be credited.
 *
 * -----------------------------------------------------------------------
 * When it is announced
 * -----------------------------------------------------------------------
 * Never in battle, and never over anything but the map, except for HyperAmp,
 * whose window is not on the map at all and whose track is announced through
 * the toast wherever the desktop is open. A fight is not the moment to read a
 * sleeve note, and the battle BGM belongs to the battle rather than to a
 * record.
 *
 * Walking between two maps replays their music every time the player crosses
 * back, so every track carries a cooldown (5 real minutes by default) before
 * it may introduce itself again. The announcement is also held back briefly
 * after the music starts and dropped if the music changes again in that
 * window, so a chain of map transfers announces where the player ended up
 * rather than everything they passed through.
 *
 * -----------------------------------------------------------------------
 * The cassette
 * -----------------------------------------------------------------------
 * Nothing about it is an image file, and nothing about it is a second 3D
 * scene either: the tape is painted to canvases and shown as PIXI sprites
 * added on top of the map, so it is drawn by the game's own renderer, over
 * everything else on the screen, and costs no WebGL context of its own.
 *
 * The shell is a rounded rectangle in moulded plastic (a seeded tint, a
 * gradient, a sheen and a grain), the window is a recess with two reels
 * turning at the speed their tape packs imply (the take-up reel starts small
 * and therefore fast), and the label is drawn to its own canvas: one of six
 * procedural layouts, a seeded paper palette, the artist and title written
 * out by hand, and up to three IconSet stickers stuck on at an angle.
 * Everything is seeded from the track name, so one track is always the same
 * tape and two tracks never share one.
 *
 * It winds in on whichever side of the screen the party HUD is not using:
 * the right when the HUD is on, the left when it is off.
 *
 * The label is written in the handwritten face named by the Cassette Label
 * Font parameter, falling back through the stack to the system's cursive.
 * Every glyph is placed with its own small offset and rotation, so the
 * writing reads as a hand even where none of the named faces is installed.
 *
 * No plugin commands.
 */

(() => {
    'use strict';

    const pluginName = 'MusicArtistDisplay';
    const parameters = PluginManager.parameters(pluginName);

    const LABEL_FONT = String(parameters['labelFont'] ||
        '"Segoe Script", "Bradley Hand", "Ink Free", "Comic Sans MS", cursive');
    const COOLDOWN_MS = Math.max(0, Number(parameters['cooldownMinutes'] || 5)) * 60000;
    const CASSETTE_MS = Math.max(600, Number(parameters['cassetteMs'] || 4000));

    // The order the player cycles through. The default is off: nothing is drawn
    // over the map until the player asks for it, and the first answer along the
    // cycle is the one worth giving, a tape once per track rather than every time.
    const MODE_FIRST = 0;       // the cassette, once per track
    const MODE_CASSETTE = 1;    // the cassette, every time
    const MODE_MINIMAL = 2;
    const MODE_OFF = 3;
    const MODE_COUNT = 4;
    // On by default, and once per track: the announcement now only ever fires
    // for music the player chose to put on (the radio and HyperAmp), so it is
    // never in the way of the map's own score.
    const MODE_DEFAULT = MODE_FIRST;

    // The mode is written to the config by name rather than by number, because
    // the numbering changed when "first time" was added: a config written by an
    // older build holds a number in the old order and is read through
    // LEGACY_MODES, so an answer the player gave then still means what they meant.
    const MODE_KEYS = ['firstTime', 'cassette', 'minimal', 'off'];  // i18n-ignore  config keys
    const LEGACY_MODES = [MODE_OFF, MODE_MINIMAL, MODE_CASSETTE];

    // How many track names the "first time" list holds before the oldest are
    // dropped. The library is a few hundred tracks, so this is a ceiling on a
    // config file rather than a limit anyone reaches.
    const HEARD_MAX = 512;

    // How long the music must have been playing before it is announced, and
    // how long an announcement waits for the map to be ready to carry it. The
    // delay is what stops a run of map transfers announcing every track the
    // player crossed instead of the one they arrived on.
    const ANNOUNCE_DELAY_MS = 1400;
    const ANNOUNCE_GRACE_MS = 30000;
    const POLL_MS = 200;

    const NOTE_ICON = 80;   // IconSet "Music Note"

    //=========================================================================
    // ConfigManager
    //=========================================================================
    ConfigManager.musicArtistDisplay = MODE_DEFAULT;
    ConfigManager.musicArtistHeard = [];

    function readMode(stored) {
        if (typeof stored === 'string') {
            const i = MODE_KEYS.indexOf(stored);
            return i >= 0 ? i : MODE_DEFAULT;
        }
        const v = Number(stored);
        if (!Number.isFinite(v)) return MODE_DEFAULT;
        const legacy = LEGACY_MODES[Math.floor(v)];
        return legacy === undefined ? MODE_DEFAULT : legacy;
    }

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.musicArtistDisplay = MODE_KEYS[this.musicArtistDisplay] || MODE_KEYS[MODE_DEFAULT];
        config.musicArtistHeard = heardList().slice();
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        this.musicArtistDisplay = readMode(config.musicArtistDisplay);
        this.musicArtistHeard = Array.isArray(config.musicArtistHeard)
            ? config.musicArtistHeard.filter(s => typeof s === 'string').slice(-HEARD_MAX)
            : [];
    };

    const mode = () => {
        const v = ConfigManager.musicArtistDisplay;
        return (Number.isFinite(v) && v >= 0 && v < MODE_COUNT) ? v : MODE_OFF;
    };

    // Both cassette answers draw the tape; only how often differs.
    const showsCassette = () => {
        const m = mode();
        return m === MODE_FIRST || m === MODE_CASSETTE;
    };

    //=========================================================================
    // What has already introduced itself
    //=========================================================================
    function heardList() {
        if (!Array.isArray(ConfigManager.musicArtistHeard)) ConfigManager.musicArtistHeard = [];
        return ConfigManager.musicArtistHeard;
    }

    const hasHeard = (key) => heardList().indexOf(key) >= 0;

    function markHeard(key) {
        const list = heardList();
        if (list.indexOf(key) >= 0) return;
        list.push(key);
        while (list.length > HEARD_MAX) list.shift();
        ConfigManager.save();
    }

    // Touching the option at all starts the library over, so the answer can be
    // given again and mean something.
    function forgetHeard() {
        ConfigManager.musicArtistHeard = [];
    }

    if (window.GameOptions && typeof window.GameOptions.registerOption === 'function') {
        const modeNames = () => [
            T('MusicArtist.mode.firstTime'),
            T('MusicArtist.mode.cassette'),
            T('MusicArtist.mode.minimal'),
            T('MusicArtist.mode.off')
        ];
        const step = function (dir) {
            let v = Number(this.getConfigValue('musicArtistDisplay'));
            if (!Number.isFinite(v)) v = MODE_DEFAULT;
            v = (v + dir + MODE_COUNT) % MODE_COUNT;
            this.setConfigValue('musicArtistDisplay', v);
        };
        // The label is registered as a function so it re-resolves whenever the
        // options list is rebuilt, which is how it follows a language change.
        window.GameOptions.registerOption('musicArtistDisplay', () => T('MusicArtist.optionName'),
            () => mode(),
            (value) => {
                const changed = ConfigManager.musicArtistDisplay !== value;
                ConfigManager.musicArtistDisplay = value;
                if (changed) forgetHeard();
                ConfigManager.save();
                if (!showsCassette()) Cassette.stop();
            },
            'audio', 'boolean',
            (value) => modeNames()[value] || modeNames()[MODE_OFF],
            function () { step.call(this, 1); },
            function () { step.call(this, -1); }
        );
    }

    //=========================================================================
    // Who made the track
    //=========================================================================
    // Only the folders whose name is not the credit. Everything else is
    // credited verbatim, so dropping a new artist's folder into audio/bgm
    // credits them without touching this file.
    const ARTIST_FOLDERS = {
        kevinmacleod: 'Kevin MacLeod',      // i18n-ignore  artist name
        tallbeard: 'Abstraction',           // i18n-ignore  artist name, per audio/bgm/TallBeard/_README.txt
        old: 'KADOKAWA'                     // i18n-ignore  engine asset library
    };
    // Folders that hold no single artist: the credit is resolved per track.
    const SPECIAL_FOLDERS = {
        battlemusic: () => T('MusicArtist.artist.custom'),
        biomes: () => T('MusicArtist.artist.procedural'),
        strudel: () => T('MusicArtist.artist.procedural'),
        midi: () => T('MusicArtist.artist.unknown')
    };
    const ROOT_ARTIST = 'KADOKAWA';         // i18n-ignore  engine asset library

    // A filename is not a title: it carries underscores where it means spaces
    // and runs its words together ("HarvestSeason", "Battle3"). An all-caps run
    // is left alone so an acronym is not cut into letters, and a number is only
    // separated off a word of two letters or more, so "Time v2" stays a version
    // rather than becoming "Time v 2".
    const prettify = (s) => String(s)
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Za-z]{2,})(\d)/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();

    // A name is spelled the way its owner spells it: "RandomMind" is a handle,
    // not two words run together, so an artist folder is never re-spaced the
    // way a title is.
    const prettifyName = (s) => String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

    /**
     * Splits a BGM path into who made it, what it is called and what shelf it
     * was on. Never throws and never returns blanks: an unreadable name still
     * yields a printable title.
     */
    function parseTrack(name) {
        const raw = String(name || '').replace(/^\.?\//, '');
        const parts = raw.split('/').filter(s => s.length);
        if (!parts.length) return null;

        let title = prettify(parts[parts.length - 1]);
        let genre = parts.length >= 3 ? prettify(parts[1]) : '';
        let artist;

        if (parts.length === 1) {
            artist = ROOT_ARTIST;
        } else {
            const folder = parts[0].toLowerCase();
            if (SPECIAL_FOLDERS[folder]) {
                artist = SPECIAL_FOLDERS[folder]();
                // A loose file in one of these folders often carries its own
                // credit in the filename ("Evangelion - Cruel Angel's Thesis").
                const dash = title.indexOf(' - ');
                if (dash > 0) {
                    artist = title.slice(0, dash).trim();
                    title = title.slice(dash + 3).trim();
                }
            } else {
                artist = ARTIST_FOLDERS[folder] || prettifyName(parts[0]);
            }
        }

        if (!title) title = raw;
        return { key: raw, title, artist, genre };
    }

    //=========================================================================
    // When it is announced
    //=========================================================================
    const _lastShown = new Map();   // track key -> timestamp
    let _pending = null;            // { track, dueAt, expiresAt }
    let _timer = null;

    const inBattle = () =>
        (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.inBattle()) ||
        (SceneManager._scene instanceof Scene_Battle) ||
        (SceneManager.isNextScene && SceneManager.isNextScene(Scene_Battle));

    // A track is only introduced when the player put it on themselves: the
    // radio is tuned to it, or HyperAmp is playing it off the desktop. The
    // map's own score, a shop's loop and a battle theme are the game speaking,
    // not a record with a sleeve, and none of them are announced.
    const radioPlaying = () => !!(window.TunableRadio && window.TunableRadio.isOn &&
        window.TunableRadio.isOn());
    const playerPlaying = () => {
        const state = window.HyperAmp && window.HyperAmp._state;
        return !!(state && state.touched && state.index >= 0);
    };
    const chosenByPlayer = () => radioPlaying() || playerPlaying();

    // Announcements belong to the map and to nothing else: a menu, a shop, the
    // title screen and a fight all borrow the music without owning it. HyperAmp
    // is the exception, because its window is not on the map at all: what it
    // plays is announced wherever the desktop is open, through the toast.
    function canAnnounceNow() {
        if (mode() === MODE_OFF) return false;
        if (!chosenByPlayer()) return false;
        if (inBattle()) return false;
        const scene = SceneManager._scene;
        if (!(scene instanceof Scene_Map)) return playerPlaying();
        // The scene object exists a while before its windows do, and the poll
        // runs on a real timer rather than on the frame loop, so it lands in
        // that gap: Scene_Map#isBusy reads the message window it has not built
        // yet. A map with no message window is not ready to carry anything.
        if (!scene._messageWindow) return false;
        if (scene.isBusy && scene.isBusy()) return false;
        if (typeof $gameMessage !== 'undefined' && $gameMessage && $gameMessage.isBusy()) return false;
        if (!ConfigManager.bgmVolume) return false;
        return true;
    }

    function startTimer() {
        if (_timer !== null) return;
        _timer = setInterval(pollPending, POLL_MS);
    }

    function stopTimer() {
        if (_timer === null) return;
        clearInterval(_timer);
        _timer = null;
    }

    function currentBgmName() {
        const bgm = AudioManager._currentBgm;
        return bgm ? String(bgm.name || '') : '';
    }

    function pollPending() {
        if (!_pending) { stopTimer(); return; }
        const now = Date.now();

        // The music moved on while we were waiting: whatever was queued is no
        // longer what the player is listening to.
        if (currentBgmName() !== _pending.track.key) { _pending = null; stopTimer(); return; }
        if (now > _pending.expiresAt) { _pending = null; stopTimer(); return; }
        if (now < _pending.dueAt) return;
        if (!canAnnounceNow()) return;

        const track = _pending.track;
        _pending = null;
        stopTimer();
        announce(track);
    }

    function schedule(name) {
        const track = parseTrack(name);
        if (!track) { _pending = null; return; }
        if (mode() === MODE_OFF) { _pending = null; return; }
        if (!chosenByPlayer()) { _pending = null; stopTimer(); return; }

        if (mode() === MODE_FIRST && hasHeard(track.key)) {
            // It has introduced itself once already, and once is the answer.
            _pending = null;
            stopTimer();
            return;
        }

        const last = _lastShown.get(track.key);
        if (last !== undefined && Date.now() - last < COOLDOWN_MS) {
            // Still inside its cooldown, so the walk back and forth between two
            // maps says nothing.
            _pending = null;
            stopTimer();
            return;
        }
        const now = Date.now();
        _pending = { track, dueAt: now + ANNOUNCE_DELAY_MS, expiresAt: now + ANNOUNCE_GRACE_MS };
        startTimer();
    }

    function announce(track) {
        _lastShown.set(track.key, Date.now());
        if (mode() === MODE_FIRST) markHeard(track.key);
        if (showsCassette() && window.PIXI && (SceneManager._scene instanceof Scene_Map)) {
            Cassette.play(track);
        } else {
            showToast(track);
        }
    }

    const _AudioManager_playBgm = AudioManager.playBgm;
    AudioManager.playBgm = function (bgm, pos) {
        _AudioManager_playBgm.call(this, bgm, pos);
        try {
            schedule(bgm && bgm.name);
        } catch (e) {
            console.error('MusicArtistDisplay: failed to read the playing track', e);
        }
    };

    const _AudioManager_stopBgm = AudioManager.stopBgm;
    AudioManager.stopBgm = function () {
        _AudioManager_stopBgm.call(this);
        _pending = null;
        stopTimer();
    };

    //=========================================================================
    // Minimal: the shared notification
    //=========================================================================
    function showToast(track) {
        if (!window.ParchmentToast) return;
        window.ParchmentToast.show(T('MusicArtist.byLine', { artist: track.artist }), {
            title: track.title,
            icon: NOTE_ICON,
            duration: 260,
            key: 'nowPlaying:' + track.key   // i18n-ignore  dedupe key
        });
    }

    //=========================================================================
    // Seeded randomness
    //=========================================================================
    // One track is always the same tape: every choice below (paper, ink,
    // layout, shell texture, stickers) is drawn from a stream seeded on the
    // track's own name.
    function hashString(str) {
        let h = 2166136261 >>> 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

    //=========================================================================
    // The cassette label
    //=========================================================================
    // Moulded plastic, read as three stops: the lit face, the body of the
    // colour and the edge it is bevelled with. A tape is a manufactured
    // object, so these are shop colours rather than natural ones.
    const SHELL_TINTS = [
        { hi: '#cdd2d9', lo: '#848b95', edge: '#4a5058' },   // grey
        { hi: '#4d525a', lo: '#24272c', edge: '#0f1114' },   // black
        { hi: '#ece2cb', lo: '#bcae8e', edge: '#7b6f52' },   // cream
        { hi: '#8497b5', lo: '#42536d', edge: '#26314a' },   // steel blue
        { hi: '#c48d66', lo: '#7f5637', edge: '#4a3020' },   // amber brown
        { hi: '#bcc9c3', lo: '#71827b', edge: '#3d4a45' },   // sea grey
        { hi: '#dab8c7', lo: '#9a6b80', edge: '#5a3a4a' },   // rose smoke
        { hi: '#d0bd6e', lo: '#8d7d31', edge: '#54491c' }    // brushed gold
    ];

    // Paper, ink and one accent per label. Deliberately washed out: a label is
    // paper under a decade of light, not a print.
    const LABEL_PALETTES = [
        { paper: '#f2ead6', ink: '#2b2a26', accent: '#b5442f' },
        { paper: '#e8e6df', ink: '#25303a', accent: '#2f6ea8' },
        { paper: '#f6f2ea', ink: '#3a2e28', accent: '#c9922f' },
        { paper: '#dfe6e2', ink: '#20302a', accent: '#3f8a63' },
        { paper: '#f0e2e2', ink: '#3a252c', accent: '#a8446a' },
        { paper: '#e6e2ef', ink: '#2c2740', accent: '#6a52a8' },
        { paper: '#fbf6e3', ink: '#33301f', accent: '#8a6a25' },
        { paper: '#dcdcd6', ink: '#2a2a28', accent: '#5c5c56' }
    ];

    // Stickers. Elements, hearts, stars and instruments: what someone would
    // actually stick on a mixtape, never a stat arrow or a status ailment.
    const STICKER_ICONS = [
        64, 65, 66, 67, 68, 69, 70, 71, 73, 75, 78, 79, 80,
        84, 85, 86, 87, 88, 89, 200, 202, 204
    ];

    const ICON_SHEET_COLS = 16;
    const ICON_CELL = 32;
    let _iconSheet = null;

    function iconSheet() {
        if (_iconSheet) return _iconSheet;
        const img = new Image();
        img.src = 'img/system/IconSet.png';
        _iconSheet = img;
        return _iconSheet;
    }

    /**
     * Writes text as a hand rather than as a font: every glyph gets its own
     * baseline wobble, rotation and advance, so the line reads as handwriting
     * even where none of the named script faces is installed. Shrinks itself
     * to fit maxW. Returns the size it settled on.
     */
    function handwrite(ctx, text, x, y, size, color, align, maxW, rng) {
        const str = String(text || '');
        if (!str) return size;
        let px = size;
        ctx.font = px + 'px ' + LABEL_FONT;   // i18n-ignore  css font shorthand
        let w = ctx.measureText(str).width;
        if (maxW && w > maxW) {
            px = Math.max(10, px * (maxW / w));
            ctx.font = px + 'px ' + LABEL_FONT;   // i18n-ignore  css font shorthand
            w = ctx.measureText(str).width;
        }
        let cx = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
        ctx.save();
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        for (const ch of str) {
            const cw = ctx.measureText(ch).width;
            ctx.save();
            ctx.translate(cx + cw / 2, y + (rng() - 0.5) * px * 0.08);
            ctx.rotate((rng() - 0.5) * 0.06);
            ctx.fillText(ch, -cw / 2, 0);
            ctx.restore();
            cx += cw * (0.985 + rng() * 0.035);
        }
        ctx.restore();
        return px;
    }

    // Small print (SIDE A, STEREO, the genre tag) is machine-printed on a real
    // inlay, so it stays in the UI face and only the writing is handwritten.
    function stamp(ctx, text, x, y, size, color, align) {
        ctx.save();
        ctx.font = '600 ' + size + 'px "Bitter", serif';   // i18n-ignore  css font shorthand
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(text), x, y);
        ctx.restore();
    }

    function withAlpha(hex, alpha) {
        const h = hex.replace('#', '');
        const n = parseInt(h, 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    // ---- the six layouts -------------------------------------------------
    // Each one paints the paper and its furniture only; the writing and the
    // stickers go on top of whichever was picked.
    const LABEL_STYLES = {
        plain(ctx, W, H, pal) {
            ctx.strokeStyle = withAlpha(pal.ink, 0.35);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(W * 0.08, H * 0.72);
            ctx.lineTo(W * 0.92, H * 0.72);
            ctx.stroke();
        },
        ruled(ctx, W, H, pal) {
            ctx.strokeStyle = withAlpha(pal.ink, 0.18);
            ctx.lineWidth = 1.5;
            for (let i = 1; i <= 4; i++) {
                const y = H * (0.16 + i * 0.18);
                ctx.beginPath();
                ctx.moveTo(W * 0.06, y);
                ctx.lineTo(W * 0.94, y);
                ctx.stroke();
            }
        },
        banded(ctx, W, H, pal) {
            ctx.fillStyle = pal.accent;
            ctx.fillRect(0, 0, W, H * 0.30);
            ctx.fillStyle = withAlpha(pal.ink, 0.10);
            ctx.fillRect(0, H * 0.30, W, 4);
        },
        split(ctx, W, H, pal) {
            ctx.save();
            ctx.fillStyle = withAlpha(pal.accent, 0.85);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(W * 0.42, 0);
            ctx.lineTo(W * 0.20, H);
            ctx.lineTo(0, H);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        },
        grid(ctx, W, H, pal) {
            ctx.strokeStyle = withAlpha(pal.ink, 0.12);
            ctx.lineWidth = 1;
            for (let x = W * 0.05; x < W * 0.96; x += W * 0.045) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = H * 0.08; y < H; y += H * 0.12) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }
        },
        stripes(ctx, W, H, pal) {
            ctx.fillStyle = pal.accent;
            ctx.fillRect(0, H * 0.05, W, H * 0.055);
            ctx.fillRect(0, H * 0.86, W, H * 0.055);
            ctx.fillStyle = withAlpha(pal.ink, 0.18);
            ctx.fillRect(0, H * 0.115, W, 2);
        }
    };
    const STYLE_KEYS = Object.keys(LABEL_STYLES);

    function drawStickers(ctx, W, H, rng) {
        const sheet = iconSheet();
        if (!sheet.complete || !sheet.naturalWidth) return;   // not decoded yet: the tape simply has none
        if (rng() < 0.45) return;                             // not every tape is stickered
        const count = 1 + Math.floor(rng() * 3);
        // Anchors sit clear of where the title is written.
        const spots = [
            [W * 0.12, H * 0.24], [W * 0.88, H * 0.22], [W * 0.90, H * 0.78],
            [W * 0.10, H * 0.80], [W * 0.50, H * 0.14], [W * 0.72, H * 0.86]
        ];
        for (let i = spots.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = spots[i]; spots[i] = spots[j]; spots[j] = t;
        }
        for (let i = 0; i < count && i < spots.length; i++) {
            const idx = pick(rng, STICKER_ICONS);
            const sx = (idx % ICON_SHEET_COLS) * ICON_CELL;
            const sy = Math.floor(idx / ICON_SHEET_COLS) * ICON_CELL;
            const size = H * (0.26 + rng() * 0.22);
            const [x, y] = spots[i];
            ctx.save();
            ctx.translate(x + (rng() - 0.5) * W * 0.03, y + (rng() - 0.5) * H * 0.06);
            ctx.rotate((rng() - 0.5) * 0.9);
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.drawImage(sheet, sx, sy, ICON_CELL, ICON_CELL, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
    }

    function buildLabelCanvas(track, rng) {
        // Drawn at the label's own aspect (84 x 26 shell units) and scaled down
        // onto the shell, so the writing stays crisp at any resolution.
        const W = 840, H = 260;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        const pal = pick(rng, LABEL_PALETTES);
        const styleKey = pick(rng, STYLE_KEYS);

        ctx.fillStyle = pal.paper;
        ctx.fillRect(0, 0, W, H);
        LABEL_STYLES[styleKey](ctx, W, H, pal);

        // Paper grain: a light speckle so the label never reads as flat fill.
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = pal.ink;
        for (let i = 0; i < 900; i++) {
            ctx.fillRect(rng() * W, rng() * H, 1, 1);
        }
        ctx.restore();

        // Who made it is what the option is called, so the artist is written
        // first and large enough to be read at the size the tape is drawn.
        const onBand = (styleKey === 'banded');
        handwrite(ctx, track.artist, W * 0.07, H * (onBand ? 0.23 : 0.30), 56,
            onBand ? pal.paper : pal.ink, 'left', W * 0.86, rng);
        handwrite(ctx, track.title, W * 0.5, H * 0.66, 72, withAlpha(pal.ink, 0.85),
            'center', W * 0.86, rng);

        stamp(ctx, T('MusicArtist.cassette.sideA'), W * 0.94, H * 0.95, 30,
            withAlpha(pal.ink, 0.65), 'right');
        stamp(ctx, track.genre ? track.genre.toUpperCase() : T('MusicArtist.cassette.stereo'),
            W * 0.06, H * 0.95, 28, withAlpha(pal.ink, 0.5), 'left');

        drawStickers(ctx, W, H, rng);

        // A worn edge: the label has been handled.
        ctx.strokeStyle = withAlpha(pal.ink, 0.25);
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
        return canvas;
    }

    //=========================================================================
    // The cassette itself
    //=========================================================================
    // Everything below is measured in shell units: a real cassette is
    // 100 x 63mm, so one unit is one millimetre and the whole tape is drawn to
    // scale. CAS_PX turns a unit into a game pixel and CAS_SS is how far the
    // canvases are supersampled past that, so the shell keeps a clean edge and
    // the handwriting stays readable however large the window is.
    const CAS_UNIT_W = 100, CAS_UNIT_H = 63;
    const CAS_PX = 2.15;
    const CAS_SS = 2;
    const K = CAS_PX * CAS_SS;          // canvas pixels per shell unit
    const CAS_MARGIN = 24;              // how far the tape rests from the corner
    const SHADOW_PAD = 22;              // canvas room around the shell for its shadow

    const u = (v) => v * K;
    const TAU = Math.PI * 2;

    // Where everything sits on the shell, in units from its centre.
    const LABEL_W = 84, LABEL_H = 26, LABEL_CY = -14.5;
    const WIN_W = 66, WIN_H = 21, WIN_CY = 13.5;
    const REEL_X = 17;
    const PACK_MAX_R = 10;              // the radius the pack canvas is drawn at
    const PACK_RADII = [9.4, 5.4];      // supply reel full, take-up reel nearly empty

    function roundRectPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function newCanvas(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(w));
        canvas.height = Math.max(1, Math.ceil(h));
        return canvas;
    }

    /**
     * The shell and everything that does not move: the moulded plastic, the
     * label stuck on it, the window recess, the screws and the head opening.
     * Drawn once per tape, with the origin at the centre of the shell.
     */
    function buildBodyCanvas(track, rng) {
        const sw = u(CAS_UNIT_W), sh = u(CAS_UNIT_H), sr = u(4);
        const canvas = newCanvas(sw + SHADOW_PAD * 2, sh + SHADOW_PAD * 2);
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        const shell = pick(rng, SHELL_TINTS);

        // ---- the shell it is moulded from --------------------------------
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = u(4.5);
        ctx.shadowOffsetY = u(2.4);
        ctx.fillStyle = shell.edge;
        roundRectPath(ctx, -sw / 2, -sh / 2, sw, sh, sr);
        ctx.fill();
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, -sw / 2, -sh / 2, sw, sh, sr);
        ctx.clip();
        const body = ctx.createLinearGradient(-sw / 2, -sh / 2, sw * 0.4, sh / 2);
        body.addColorStop(0, shell.hi);
        body.addColorStop(0.55, shell.lo);
        body.addColorStop(1, shell.edge);
        ctx.fillStyle = body;
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        // The sheen off the top-left corner: what tells the eye it is plastic.
        const sheen = ctx.createLinearGradient(-sw / 2, -sh / 2, -sw * 0.05, sh / 2);
        sheen.addColorStop(0, 'rgba(255,255,255,0.24)');
        sheen.addColorStop(0.55, 'rgba(255,255,255,0.05)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        // Moulding grain, so the plastic is never a flat fill.
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000000';
        for (let i = 0; i < 1600; i++) {
            ctx.fillRect(-sw / 2 + rng() * sw, -sh / 2 + rng() * sh, 1, 1);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Bevel: a light rim inside the edge and a dark one on it.
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = u(0.5);
        roundRectPath(ctx, -sw / 2 + u(0.9), -sh / 2 + u(0.9), sw - u(1.8), sh - u(1.8), sr - u(0.9));
        ctx.stroke();
        ctx.strokeStyle = shell.edge;
        ctx.lineWidth = u(0.7);
        roundRectPath(ctx, -sw / 2, -sh / 2, sw, sh, sr);
        ctx.stroke();

        // ---- the label, stuck on by hand ---------------------------------
        const label = buildLabelCanvas(track, rng);
        const lw = u(LABEL_W), lh = u(LABEL_H);
        ctx.save();
        ctx.translate((rng() - 0.5) * u(1.2), u(LABEL_CY) + (rng() - 0.5) * u(0.8));
        ctx.rotate((rng() - 0.5) * 0.03);
        ctx.shadowColor = 'rgba(0,0,0,0.42)';
        ctx.shadowBlur = u(1.2);
        ctx.shadowOffsetY = u(0.6);
        ctx.drawImage(label, -lw / 2, -lh / 2, lw, lh);
        ctx.restore();

        // ---- the window the reels turn behind ----------------------------
        const ww = u(WIN_W), wh = u(WIN_H), wy = u(WIN_CY) - u(WIN_H) / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        roundRectPath(ctx, -ww / 2 - u(1.8), wy - u(1.8), ww + u(3.6), wh + u(3.6), u(4.2));
        ctx.fill();
        const well = ctx.createLinearGradient(0, wy, 0, wy + wh);
        well.addColorStop(0, '#090b0e');
        well.addColorStop(1, '#1d222a');
        ctx.fillStyle = well;
        roundRectPath(ctx, -ww / 2, wy, ww, wh, u(3));
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = u(0.4);
        ctx.stroke();
        // The tape itself, running between the two packs.
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(-u(20), wy + wh - u(3.4), u(40), u(1.3));
        ctx.restore();

        // ---- furniture ---------------------------------------------------
        const screwR = u(1.6);
        [[-45.5, -26], [45.5, -26], [-45.5, 26], [45.5, 26]].forEach(([x, y]) => {
            const cx = u(x), cy = u(y);
            const g = ctx.createRadialGradient(cx - screwR * 0.4, cy - screwR * 0.4, screwR * 0.1, cx, cy, screwR);
            g.addColorStop(0, '#b9bec4');
            g.addColorStop(1, '#5c6169');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, screwR, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = u(0.35);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - screwR * 0.6, cy);
            ctx.lineTo(cx + screwR * 0.6, cy);
            ctx.stroke();
        });

        // The head opening along the bottom edge.
        ctx.fillStyle = '#0d0f12';
        [-24, 0, 24].forEach((x) => {
            roundRectPath(ctx, u(x) - u(3.6), u(26.5), u(7.2), u(3.7), u(1.2));
            ctx.fill();
        });
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = u(0.3);
        [-24, 0, 24].forEach((x) => {
            roundRectPath(ctx, u(x) - u(3.6), u(26.5), u(7.2), u(3.7), u(1.2));
            ctx.stroke();
        });

        return canvas;
    }

    /**
     * One reel: a hub, six teeth and one longer spoke. Without something
     * asymmetric on it the rotation is invisible at this size.
     */
    function buildReelCanvas() {
        const outer = u(7);
        const canvas = newCanvas(outer * 2 + 4, outer * 2 + 4);
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);

        const hubR = u(4.2);
        const hub = ctx.createRadialGradient(-hubR * 0.35, -hubR * 0.35, hubR * 0.1, 0, 0, hubR);
        hub.addColorStop(0, '#f4eee2');
        hub.addColorStop(1, '#b3aa99');
        ctx.fillStyle = hub;
        ctx.beginPath();
        ctx.arc(0, 0, hubR, 0, TAU);
        ctx.fill();

        for (let t = 0; t < 6; t++) {
            const long = (t === 0);
            ctx.save();
            ctx.rotate((t / 6) * TAU);
            ctx.fillStyle = long ? '#b8543a' : '#e2dbcb';
            roundRectPath(ctx, hubR * 0.75, -u(1), long ? u(3.4) : u(1.7), u(2), u(0.5));
            ctx.fill();
            ctx.restore();
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.40)';
        ctx.lineWidth = u(0.35);
        ctx.beginPath();
        ctx.arc(0, 0, hubR, 0, TAU);
        ctx.stroke();

        ctx.fillStyle = '#16181c';
        ctx.beginPath();
        ctx.arc(0, 0, u(1.5), 0, TAU);
        ctx.fill();
        return canvas;
    }

    /** The pack of tape wound on a reel, drawn at its widest and scaled down. */
    function buildPackCanvas() {
        const r = u(PACK_MAX_R);
        const canvas = newCanvas(r * 2 + 4, r * 2 + 4);
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);

        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
        g.addColorStop(0, '#4a3527');
        g.addColorStop(1, '#150f0a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();

        // Wraps, so the pack reads as wound tape rather than a brown disc.
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(1, u(0.14));
        for (let rr = r * 0.34; rr < r; rr += Math.max(1.6, u(0.55))) {
            ctx.beginPath();
            ctx.arc(0, 0, rr, 0, TAU);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = u(0.3);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
        return canvas;
    }

    /** The clear plastic over the window: one soft diagonal, one hard streak. */
    function buildGlareCanvas() {
        const ww = u(WIN_W), wh = u(WIN_H);
        const canvas = newCanvas(ww, wh);
        const ctx = canvas.getContext('2d');
        roundRectPath(ctx, 0, 0, ww, wh, u(3));
        ctx.clip();

        const g = ctx.createLinearGradient(0, 0, ww * 0.75, wh);
        g.addColorStop(0, 'rgba(226,240,255,0.20)');
        g.addColorStop(0.45, 'rgba(226,240,255,0.05)');
        g.addColorStop(1, 'rgba(226,240,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, ww, wh);

        ctx.save();
        ctx.translate(ww * 0.22, 0);
        ctx.rotate(-0.35);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(0, -wh, ww * 0.09, wh * 3);
        ctx.translate(ww * 0.16, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(0, -wh, ww * 0.04, wh * 3);
        ctx.restore();
        return canvas;
    }

    // Reel, pack and glare are the same on every tape, so their canvases are
    // painted once and their textures shared between tapes.
    let _sharedTex = null;
    function sharedTextures() {
        if (_sharedTex) return _sharedTex;
        _sharedTex = {
            reel: PIXI.Texture.from(buildReelCanvas()),
            pack: PIXI.Texture.from(buildPackCanvas()),
            glare: PIXI.Texture.from(buildGlareCanvas())
        };
        return _sharedTex;
    }

    function spriteFrom(texture, scale) {
        const sp = new PIXI.Sprite(texture);
        sp.anchor.set(0.5);
        sp.scale.set(scale === undefined ? 1 / CAS_SS : scale);
        return sp;
    }

    /**
     * Builds one tape as a PIXI container. Returns it with the handles the
     * frame loop needs: the two reels and the two tape packs, whose radii
     * decide how fast their reel turns.
     */
    function buildCassette(track) {
        const rng = mulberry32(hashString(track.key));
        const shared = sharedTextures();
        const root = new PIXI.Container();

        const bodyTex = PIXI.Texture.from(buildBodyCanvas(track, rng));
        const body = spriteFrom(bodyTex);
        root.addChild(body);

        const reels = [];
        const packs = [];
        [-REEL_X, REEL_X].forEach((x, i) => {
            const pack = spriteFrom(shared.pack, (PACK_RADII[i] / PACK_MAX_R) / CAS_SS);
            pack.position.set(x * CAS_PX, WIN_CY * CAS_PX);
            root.addChild(pack);
            packs.push(pack);

            const reel = spriteFrom(shared.reel);
            reel.position.set(x * CAS_PX, WIN_CY * CAS_PX);
            root.addChild(reel);
            reels.push(reel);
        });

        const glare = spriteFrom(shared.glare);
        glare.position.set(0, WIN_CY * CAS_PX);
        root.addChild(glare);

        // Only the tape's own canvas is its own; the shared ones outlive it.
        return { root, reels, packs, packRadii: PACK_RADII.slice(), ownTextures: [bodyTex] };
    }

    //=========================================================================
    // The overlay
    //=========================================================================
    // The tape is a child of the map scene itself, added last, so the game's
    // own renderer draws it over everything else on the screen and no second
    // WebGL context is opened for it.
    const Cassette = {
        tape: null, _host: null, _raf: null, _startedAt: 0, _lastFrame: 0,

        // The party HUD owns the top-left corner, so the tape takes the right
        // when it is on and that same corner when it is not.
        _restingPosition() {
            const w = (typeof Graphics !== 'undefined' && Graphics.width) ? Graphics.width : 816;
            const halfW = (CAS_UNIT_W * CAS_PX) / 2;
            const halfH = (CAS_UNIT_H * CAS_PX) / 2;
            const hudOn = !!ConfigManager.partyHud;
            const x = hudOn ? (w - halfW - CAS_MARGIN) : (halfW + CAS_MARGIN);
            return { x, y: halfH + CAS_MARGIN, fromRight: hudOn };
        },

        play(track) {
            const scene = SceneManager._scene;
            if (!window.PIXI || !(scene instanceof Scene_Map)) { showToast(track); return; }
            this.stop();
            let tape;
            try {
                tape = buildCassette(track);
            } catch (e) {
                console.error('MusicArtistDisplay: failed to build the cassette', e);
                showToast(track);
                return;
            }
            this.tape = tape;
            this._host = scene;
            scene.addChild(tape.root);
            this._startedAt = performance.now();
            this._lastFrame = this._startedAt;
            // Placed before the first frame is drawn, so it never shows up for
            // one frame in the top-left corner on its way in.
            this.layout(0, 0);
            if (this._raf === null) this._raf = requestAnimationFrame((t) => this.frame(t));
        },

        // Where the tape stands at t (0..1 through the whole animation) and how
        // far its reels have turned in dt seconds.
        layout(t, dt) {
            const tape = this.tape;
            if (!tape) return;
            const rest = this._restingPosition();
            const root = tape.root;

            // Winds in from off its own edge, holds while it plays, and drifts
            // back out the way it came.
            const ENTER = 0.18, EXIT = 0.82;
            const offset = (rest.fromRight ? 1 : -1) * ((CAS_UNIT_W * CAS_PX) + CAS_MARGIN * 2);
            let slide, alpha, tilt, grow;
            if (t < ENTER) {
                const k = t / ENTER;
                const e = 1 - Math.pow(1 - k, 3);
                slide = offset * (1 - e);
                alpha = e;
                tilt = (1 - e) * (rest.fromRight ? 0.22 : -0.22);
                grow = 0.9 + e * 0.1;
            } else if (t < EXIT) {
                slide = 0;
                alpha = 1;
                tilt = 0;
                grow = 1;
            } else {
                const k = (t - EXIT) / (1 - EXIT);
                const e = k * k;
                slide = offset * e * 0.55;
                alpha = 1 - k;
                tilt = e * (rest.fromRight ? 0.16 : -0.16);
                grow = 1 - e * 0.06;
            }

            // A slow drift while it is held, so the tape is never a still image.
            const held = (performance.now() - this._startedAt) / 1000;
            root.position.set(rest.x + slide, rest.y + Math.sin(held * 1.7) * 1.6);
            root.rotation = tilt + Math.sin(held * 1.15) * 0.012;
            root.scale.set(grow);
            root.alpha = alpha;

            // Both reels pull the same tape, so each turns at the speed its own
            // pack radius implies: the near-empty take-up reel races.
            const TAPE_SPEED = 46;   // units of tape per second
            tape.reels.forEach((reel, i) => {
                reel.rotation -= (TAPE_SPEED / tape.packRadii[i]) * dt;
            });
            // And the packs trade tape as it runs.
            const wind = t * 0.06;
            const base = (i) => (tape.packRadii[i] / PACK_MAX_R) / CAS_SS;
            tape.packs[0].scale.set(base(0) * (1 - wind));
            tape.packs[1].scale.set(base(1) * (1 + wind * 1.6));
        },

        frame(now) {
            this._raf = null;
            const tape = this.tape;
            if (!tape) return;

            // The tape belongs to the map: a battle, a menu or a mode change
            // takes it off the screen at once rather than leaving it hanging.
            if (tape.root._destroyed || SceneManager._scene !== this._host ||
                !showsCassette() || inBattle() ||
                !(SceneManager._scene instanceof Scene_Map)) {
                this.stop();
                return;
            }

            const dt = Math.min(0.1, (now - this._lastFrame) / 1000);
            this._lastFrame = now;
            const t = Math.min(1, (now - this._startedAt) / CASSETTE_MS);
            this.layout(t, dt);

            if (t >= 1) { this.stop(); return; }
            this._raf = requestAnimationFrame((n) => this.frame(n));
        },

        stop() {
            if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null; }
            const tape = this.tape;
            this.tape = null;
            this._host = null;
            if (!tape) return;
            try {
                const root = tape.root;
                if (root.parent) root.parent.removeChild(root);
                // The shared reel, pack and glare textures are left alone; only
                // the shell this tape painted for itself goes with it.
                if (!root._destroyed) root.destroy({ children: true });
                tape.ownTextures.forEach((tex) => {
                    if (tex && !tex.destroyed) tex.destroy(true);
                });
            } catch (e) {
                console.error('MusicArtistDisplay: failed to take the cassette off the screen', e);
            }
        }
    };

    // A scene change destroys its children, the tape among them, so it is taken
    // down while it is still ours to take down.
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        Cassette.stop();
        _Scene_Map_terminate.call(this);
    };

    // The IconSet is wanted the instant a label is drawn, so it is asked for
    // once at boot rather than on the frame the tape is built.
    iconSheet();

    window.MusicArtistDisplay = {
        parseTrack,
        current: () => parseTrack(currentBgmName()),
        show: (name) => {
            const track = parseTrack(name || currentBgmName());
            if (track) announce(track);
        },
        heard: () => heardList().slice(),
        forgetHeard,
        MODE_FIRST, MODE_CASSETTE, MODE_MINIMAL, MODE_OFF
    };
})();
