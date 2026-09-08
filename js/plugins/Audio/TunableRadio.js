//=============================================================================
// TunableRadio.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v2.0.0] Tunable Radio - folder stations, drawn over the map, keeps playing until switched off
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help TunableRadio.js
 *
 * @param noiseFile
 * @text Noise File
 * @desc BGM file to play for static/noise (without extension)
 * @type string
 * @default Noise
 *
 * @param enableFavorites
 * @text Enable Favorites
 * @desc Allow players to mark stations as favorites
 * @type boolean
 * @default true
 *
 * @param enableAutoScan
 * @text Enable Auto Scan
 * @desc Add auto-scan feature to find next valid station
 * @type boolean
 * @default true
 *
 * @param radioVolume
 * @text Radio Volume
 * @desc Default volume for radio playback (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 85
 *
 * @command openRadio
 * @text Open Radio
 * @desc Opens the radio interface over the map
 *
 * @command closeRadio
 * @text Close Radio
 * @desc Closes the radio interface (the music keeps playing)
 *
 * @command stopRadio
 * @text Stop Radio
 * @desc Switches the set off and gives the map its own music back
 *
 * @command scanStations
 * @text Scan for Stations
 * @desc Rescans the BGM folder for new stations
 *
 * @command setVolume
 * @text Set Radio Volume
 * @desc Sets the radio volume
 * @arg volume
 * @type number
 * @min 0
 * @max 100
 * @default 85
 *
 * -----------------------------------------------------------------------
 * Stations are folders
 * -----------------------------------------------------------------------
 * audio/bgm is already sorted by who made the music, so the library IS the
 * dial: every folder under audio/bgm is one station, and the files inside it
 * are that station's playlist, played in order and wrapping round. A new
 * folder dropped into audio/bgm is a new station with no code change, and a
 * folder inside a folder ("KevinMacLeod/Calm") is a station of its own, so an
 * artist with genre folders broadcasts one station per genre. The loose files
 * at the root of audio/bgm are the last station on the dial.
 *
 * Stations are dealt across AM, FM and EM in turn, with a band of static
 * between any two of them, so tuning past a station is a real movement rather
 * than a menu.
 *
 * -----------------------------------------------------------------------
 * The set is drawn over the map
 * -----------------------------------------------------------------------
 * The radio is not a scene: it is a panel raised over the live map behind a
 * light dim, the way the Empathize panel is, so the world keeps moving while
 * the player tunes. Closing the panel does not switch the set off.
 *
 * -----------------------------------------------------------------------
 * Web radio
 * -----------------------------------------------------------------------
 * The ADD plate opens a field to paste a streaming address into, the way Euro
 * Truck takes a live_streams list. A stream is a station like any other, on a
 * frequency of its own picked out of its url, so it always comes back to the
 * same place on the dial. The list is kept in webradio.txt beside the game,
 * one station per line as "Name | url", and can be edited by hand.
 *
 * -----------------------------------------------------------------------
 * It keeps playing until it is switched off
 * -----------------------------------------------------------------------
 * While the set is on it owns the BGM: a map's own music, a battle's music
 * and everything else that asks to be played is held back, so the station
 * carries straight through a map transfer and through a fight and is still
 * playing on the other side. The power switch on the panel (and the Stop
 * Radio plugin command) gives the map its music back.
 *
 * The BATTLE plate says whether that includes a fight. ON, the station plays
 * over the battle and the battle's own music never starts; OFF, the set stands
 * down for the fight and comes back on the moment the party is on the map
 * again.
 *
 * The set opens on the concert hall (audio/bgm/Classical) the first time it is
 * switched on, and every time the needle crosses a station the signal is heard
 * going: a burst of the static file, faded out over whatever it has landed on.
 *
 * Controls:
 * - Left/Right: tune
 * - Up/Down: change band
 * - Page Up/Down: auto-scan for the next station
 * - Enter/Space: toggle favourite
 * - Shift + Left/Right: jump between favourites
 * - Shift + Up/Down: volume
 * - Escape: close the panel (the music keeps playing)
 */

(() => {
    'use strict';

    const pluginName = 'TunableRadio';
    const DEBUG = false;
    const dlog = (...args) => { if (DEBUG) console.log(...args); };
    const parameters = (typeof PluginManager !== 'undefined' && PluginManager.parameters)
        ? PluginManager.parameters(pluginName) : {};
    const noiseFile = parameters['noiseFile'] || 'Noise';
    const enableFavorites = parameters['enableFavorites'] !== 'false';
    const enableAutoScan = parameters['enableAutoScan'] !== 'false';
    const defaultVolume = parseInt(parameters['radioVolume']) || 85;

    const BGM_DIR = 'audio/bgm';  // i18n-ignore  asset path
    // Both the plain names and the "_" twins an encrypted build leaves on disk.
    const AUDIO_EXT = /\.(ogg|m4a)_?$/i;
    const BANDS = ['AM', 'FM', 'EM'];  // i18n-ignore  band names, printed on the dial exactly as they are

    const has = (key) => (typeof T === 'function' && T.has ? T.has(key) : false);
    const t = (key, args) => (typeof T === 'function' ? T(key, args) : key);

    //=========================================================================
    // The library: every folder under audio/bgm is a station
    //=========================================================================

    // Walks a folder tree and returns one entry per playable file, as its BGM
    // key (the path under audio/bgm with no extension) and the folder it sits
    // in. readdir/isDir are injected so the walk can be tested without a disk.
    function walkLibrary(readdir, isDir, dir, prefix, out) {
        let entries = [];
        try { entries = readdir(dir); } catch (e) { return out; }
        entries.slice().sort((a, b) => String(a).localeCompare(String(b))).forEach(name => {
            const full = dir + '/' + name;
            if (isDir(full)) {
                walkLibrary(readdir, isDir, full, prefix ? prefix + '/' + name : name, out);
                return;
            }
            if (!AUDIO_EXT.test(name)) return;
            const base = name.replace(AUDIO_EXT, '');
            if (!prefix && base === noiseFile) return;
            const key = prefix ? prefix + '/' + base : base;
            if (!out.some(e => e.key === key)) out.push({ key, folder: prefix || '' });
        });
        return out;
    }

    // A folder's printed name. The folder id itself is what the dial remembers,
    // so it stays as it is on disk; this is only the label on the screen.
    function stationLabel(folder) {
        const key = 'Radio.station.' + (folder ? folder.replace(/\//g, '.') : 'root');
        if (has(key)) return t(key);
        if (!folder) return t('Radio.station.root');
        const leaf = folder.slice(folder.lastIndexOf('/') + 1);
        return leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    }

    // Who is broadcasting: the top folder is the artist, the way
    // MusicArtistDisplay reads the same paths.
    function stationArtist(folder) {
        if (!folder) return t('Radio.station.root');
        const top = folder.split('/')[0];
        const key = 'Radio.station.' + top;
        return has(key) ? t(key) : top.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    }

    // One station per folder, in a stable order, each with its own playlist.
    function buildStations(entries) {
        const byFolder = new Map();
        (entries || []).forEach(e => {
            const folder = e.folder || '';
            if (!byFolder.has(folder)) byFolder.set(folder, []);
            byFolder.get(folder).push(e.key);
        });
        // The root's loose files are the last station on the dial: every other
        // station is somebody's folder, and the root is what is left over.
        const ids = Array.from(byFolder.keys()).sort((a, b) => {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
        });
        const stations = [];
        ids.forEach(folder => {
            const tracks = byFolder.get(folder).slice().sort((a, b) => a.localeCompare(b));
            if (!tracks.length) return;
            stations.push({
                id: folder || 'root',
                folder,
                name: stationLabel(folder),
                artist: stationArtist(folder),
                tracks
            });
        });
        return stations;
    }

    //=========================================================================
    // Web radio: a stream is a station like any other
    //=========================================================================
    // Euro Truck's live_streams.sii, as a plain text file at the game root: one
    // station per line, "Name | url", and a line opening with # is a note.
    // Whatever the player pastes into the panel is written back to it, so the
    // list outlives the save it was never part of and can be edited by hand.
    const WEB_RADIO_FILE = 'webradio.txt';  // i18n-ignore  file name at the game root

    function webRadioPath() {
        if (typeof require !== 'function') return null;
        try {
            return require('path').join(process.cwd(), WEB_RADIO_FILE);
        } catch (e) {
            return null;
        }
    }

    function parseWebRadios(text) {
        const out = [];
        String(text || '').split(/\r?\n/).forEach(line => {
            const raw = line.trim();
            if (!raw || raw.charAt(0) === '#') return;
            const bar = raw.indexOf('|');
            const name = bar >= 0 ? raw.slice(0, bar).trim() : '';
            const url = (bar >= 0 ? raw.slice(bar + 1) : raw).trim();
            if (!/^https?:\/\//i.test(url)) return;
            if (out.some(w => w.url === url)) return;
            out.push({ name: name || url.replace(/^https?:\/\//i, '').split('/')[0], url });
        });
        return out;
    }

    function readWebRadios() {
        const file = webRadioPath();
        if (!file) return [];
        try {
            const fs = require('fs');
            if (!fs.existsSync(file)) return [];
            return parseWebRadios(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            console.warn('TunableRadio: could not read ' + WEB_RADIO_FILE, e);
            return [];
        }
    }

    function writeWebRadios(list) {
        const file = webRadioPath();
        if (!file) return false;
        try {
            const fs = require('fs');
            const body = [t('Radio.webRadioFileHeader')]
                .concat(list.map(w => w.name + ' | ' + w.url))
                .join('\n') + '\n';
            fs.writeFileSync(file, body, 'utf8');
            return true;
        } catch (e) {
            console.warn('TunableRadio: could not write ' + WEB_RADIO_FILE, e);
            return false;
        }
    }

    const STREAM_ID = 'stream:';  // i18n-ignore  station id prefix

    function webStation(entry) {
        return {
            id: STREAM_ID + entry.url,
            folder: '',
            name: entry.name,
            artist: t('Radio.webRadio'),
            stream: entry.url,
            tracks: []
        };
    }

    // One number per url, the same every time, so a stream keeps the frequency
    // it was first heard on.
    function hashString(text) {
        let h = 2166136261;
        for (let i = 0; i < String(text).length; i++) {
            h ^= String(text).charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // Dealt across the three bands in turn, with static either side of every
    // station so the dial has somewhere to be between two of them. A stream is
    // not dealt in turn: it lands on a frequency of its own, picked out of its
    // url, the way a station found by accident does.
    function layoutBands(stations, streams) {
        const slots = { AM: [], FM: [], EM: [] };
        (stations || []).forEach((st, i) => {
            const band = BANDS[i % BANDS.length];
            if (!slots[band].length) slots[band].push(null);
            slots[band].push(st);
            slots[band].push(null);
        });
        BANDS.forEach(band => { if (!slots[band].length) slots[band].push(null); });
        (streams || []).forEach(st => {
            const h = hashString(st.id);
            const band = BANDS[h % BANDS.length];
            // Station and static alternate (even slots are static), so the
            // pair goes in at an ODD index: that is what keeps the parity.
            const gaps = Math.floor(slots[band].length / 2) + 1;
            const at = 1 + ((h >>> 3) % gaps) * 2;
            slots[band].splice(at, 0, st, null);
        });
        return slots;
    }

    // The numbers printed under the needle, one per slot of that band.
    function bandFrequencies(band, count) {
        const out = [];
        const span = Math.max(count - 1, 1);
        for (let i = 0; i < count; i++) {
            const p = i / span;
            if (band === 'AM') out.push((540 + p * 1160).toFixed(0) + ' kHz');
            else if (band === 'FM') out.push((88.1 + p * 19.8).toFixed(1) + ' MHz');
            else out.push((1420 + p * 8580).toFixed(0) + ' MHz');
        }
        return out;
    }

    // Which track of a station follows the one playing. A station is a loop: it
    // never runs out, it comes round again.
    function nextTrackIndex(index, count) {
        if (!count || count <= 0) return 0;
        return (((index | 0) + 1) % count + count) % count;
    }

    //=========================================================================
    // The set
    //=========================================================================

    const radio = {
        ready: false,
        on: false,               // switched on and holding the BGM
        open: false,             // panel drawn over the map
        band: 0,
        slot: 0,
        volume: defaultVolume,
        favorites: [],
        stations: [],
        slots: { AM: [null], FM: [null], EM: [null] },
        frequencies: { AM: [], FM: [], EM: [] },
        trackIndex: {},
        playing: null,
        scanning: false,
        scanDirection: 1,
        // Does the set play over a fight, or does it stand down and come back
        // on when the fight is over?
        inBattle: true,
        suspended: false,
        _stream: null,
        _authorized: false,
        _lastSeek: 0,
        _timer: null,
        _playingFile: null,
        _retune: null,
        _lastHiss: 0
    };

    const bandName = () => BANDS[radio.band] || BANDS[0];
    const bandSlots = () => radio.slots[bandName()] || [null];
    function clampSlot() {
        const len = bandSlots().length;
        radio.slot = ((radio.slot % len) + len) % len;
    }
    function currentStation() {
        clampSlot();
        return bandSlots()[radio.slot] || null;
    }
    function currentFrequency() {
        clampSlot();
        return (radio.frequencies[bandName()] || [])[radio.slot] || '--.-';
    }

    function rebuild(entries, streams) {
        const folders = buildStations(entries);
        const web = (streams || []).map(webStation);
        radio.stations = folders.concat(web);
        radio.slots = layoutBands(folders, web);
        radio.frequencies = {};
        BANDS.forEach(band => {
            radio.frequencies[band] = bandFrequencies(band, radio.slots[band].length);
        });
        radio.ready = true;
    }

    function scanDisk() {
        if (typeof require !== 'function') return [];
        try {
            const fs = require('fs');
            const path = require('path');
            const root = path.join(process.cwd(), BGM_DIR);
            return walkLibrary(
                d => fs.readdirSync(d),
                f => { try { return fs.statSync(f).isDirectory(); } catch (e) { return false; } },
                root, '', []);
        } catch (e) {
            console.warn('TunableRadio: could not read the BGM folder', e);
            return [];
        }
    }

    function initializeRadio() {
        rebuild(scanDisk(), readWebRadios());
        dlog('TunableRadio: ' + radio.stations.length + ' stations');
    }

    // Where the needle sits the first time the set is switched on: the concert
    // hall, rather than whatever happens to be first on the dial.
    const DEFAULT_STATION = 'Classical';  // i18n-ignore  folder name under audio/bgm

    function tuneToDefault() {
        for (let b = 0; b < BANDS.length; b++) {
            const list = radio.slots[BANDS[b]] || [];
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].id === DEFAULT_STATION) {
                    radio.band = b;
                    radio.slot = i;
                    return true;
                }
            }
        }
        // No concert hall on this dial: the first station of any band will do.
        for (let b = 0; b < BANDS.length; b++) {
            const list = radio.slots[BANDS[b]] || [];
            const i = list.findIndex(x => x);
            if (i >= 0) { radio.band = b; radio.slot = i; return true; }
        }
        return false;
    }

    // A station the player pasted in, tuned to straight away.
    function addWebRadio(name, url) {
        const parsed = parseWebRadios((name ? name + ' | ' : '') + url);
        if (!parsed.length) return false;
        const list = readWebRadios();
        if (!list.some(w => w.url === parsed[0].url)) {
            list.push(parsed[0]);
            writeWebRadios(list);
        }
        rebuild(scanDisk(), list);
        const id = STREAM_ID + parsed[0].url;
        for (let b = 0; b < BANDS.length; b++) {
            const i = (radio.slots[BANDS[b]] || []).findIndex(x => x && x.id === id);
            if (i >= 0) { radio.band = b; radio.slot = i; onTuned(); break; }
        }
        return true;
    }

    //=========================================================================
    // Persistence: the set is part of the party's kit, so it rides the save
    //=========================================================================

    function saveState() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        $gameSystem._tunableRadio = {
            on: radio.on,
            band: radio.band,
            slot: radio.slot,
            volume: radio.volume,
            favorites: radio.favorites,
            trackIndex: radio.trackIndex,
            inBattle: radio.inBattle
        };
    }

    function loadState() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        const s = $gameSystem._tunableRadio;
        if (!s) {
            radio.on = false;
            radio.playing = null;
            return;
        }
        radio.on = !!s.on;
        radio.band = Number(s.band) || 0;
        radio.slot = Number(s.slot) || 0;
        radio.volume = Number.isFinite(s.volume) ? s.volume : defaultVolume;
        radio.favorites = Array.isArray(s.favorites) ? s.favorites : [];
        radio.trackIndex = (s.trackIndex && typeof s.trackIndex === 'object')
            ? s.trackIndex : {};
        radio.inBattle = s.inBattle !== false;
        clampSlot();
    }

    //=========================================================================
    // Playback. While the set is on, it owns the BGM.
    //=========================================================================

    // A stream is not a BGM: it is an <audio> element of its own, so nothing
    // about the engine's one music buffer has to know what a url is.
    function stopStream() {
        if (!radio._stream) return;
        try {
            radio._stream.pause();
            radio._stream.src = '';
        } catch (e) {
            // the element is already gone
        }
        radio._stream = null;
    }

    function playStream(url) {
        stopStream();
        radio._authorized = true;
        try { AudioManager.stopBgm(); } finally { radio._authorized = false; }
        if (typeof Audio === 'undefined') return;
        const el = new Audio();
        el.src = url;
        el.volume = Math.max(0, Math.min(1, radio.volume / 100)) *
            (typeof ConfigManager !== 'undefined' && Number.isFinite(ConfigManager.bgmVolume)
                ? ConfigManager.bgmVolume / 100 : 1);
        el.addEventListener('error', () => {
            // A stream that will not answer is a dead frequency, not a crash.
            console.warn('TunableRadio: stream would not play', url);
            hiss(1);
        });
        el.play().catch(e => console.warn('TunableRadio: stream refused to start', e));
        radio._stream = el;
    }

    // The sound of the signal going: a burst of the static file, faded out over
    // the top of whatever the dial has landed on.
    let hissBuffer = null;
    function hiss(strength) {
        if (typeof WebAudio === 'undefined' || typeof AudioManager === 'undefined') return;
        try {
            if (!hissBuffer) {
                hissBuffer = new WebAudio(
                    'audio/bgm/' + Utils.encodeURI(noiseFile) + AudioManager.audioFileExt());
            }
            hissBuffer.volume = Math.max(0, Math.min(1,
                (radio.volume / 100) * 0.5 * (strength || 1)));
            hissBuffer.play(false, 0);
            hissBuffer.fadeOut(0.9);
        } catch (e) {
            hissBuffer = null;
        }
    }

    function playBgmAsRadio(name, volume, pitch) {
        // Tuning across a run of static used to hand the engine the same noise
        // file over and over, and every one of those is a fresh decode on the
        // main thread. A file already on air is left alone; only its volume
        // follows the knob.
        const buffer = AudioManager._bgmBuffer;
        if (radio._playingFile === name && buffer && buffer.isPlaying && buffer.isPlaying()) {
            buffer.volume = Math.max(0, Math.min(100, volume)) / 100;
            if (AudioManager._currentBgm) AudioManager._currentBgm.volume = volume;
            return;
        }
        radio._playingFile = name;
        radio._authorized = true;
        try {
            AudioManager.playBgm({ name, volume, pitch: pitch || 100, pan: 0 });
        } finally {
            radio._authorized = false;
        }
    }

    function playCurrentStation() {
        if (radio._retune !== null) { clearTimeout(radio._retune); radio._retune = null; }
        const station = currentStation();
        radio.on = true;
        radio.suspended = false;
        if (station && station.stream) {
            radio.playing = station.name;
            playStream(station.stream);
            radio._lastSeek = 0;
            startTicker();
            saveState();
            return;
        }
        stopStream();
        if (station && station.tracks.length) {
            const n = station.tracks.length;
            const i = (((radio.trackIndex[station.id] | 0) % n) + n) % n;
            radio.trackIndex[station.id] = i;
            radio.playing = station.tracks[i];
            playBgmAsRadio(radio.playing, radio.volume);
        } else {
            radio.playing = null;
            // A dead frequency hisses a little quieter than a station, and a
            // touch off pitch, so the two never sound like the same thing.
            playBgmAsRadio(noiseFile, Math.max(20, radio.volume - 20),
                100 + Math.random() * 10 - 5);
        }
        radio._lastSeek = 0;
        startTicker();
        saveState();
    }

    function advanceTrack() {
        const station = currentStation();
        if (!station || !station.tracks.length) return;
        radio.trackIndex[station.id] =
            nextTrackIndex(radio.trackIndex[station.id] | 0, station.tracks.length);
        playCurrentStation();
    }

    // A BGM loops for ever on its own, so the end of a track is read off the
    // playhead running backwards rather than off an event nobody fires.
    function tick() {
        if (!radio.on) { stopTicker(); return; }
        if (radio._stream) return;   // a stream ends when the station ends
        const buffer = AudioManager._bgmBuffer;
        if (!buffer || typeof buffer.seek !== 'function') return;
        let seek = 0;
        try { seek = buffer.seek(); } catch (e) { return; }
        if (!Number.isFinite(seek)) return;
        if (seek + 0.75 < radio._lastSeek) {
            radio._lastSeek = 0;
            advanceTrack();
            return;
        }
        radio._lastSeek = seek;
    }

    function startTicker() {
        if (radio._timer !== null) return;
        radio._timer = setInterval(tick, 700);
    }

    function stopTicker() {
        if (radio._timer === null) return;
        clearInterval(radio._timer);
        radio._timer = null;
    }

    // The power switch: the map gets its own music back.
    function powerOff() {
        if (!radio.on) return;
        radio.on = false;
        radio.suspended = false;
        radio.playing = null;
        radio._playingFile = null;
        if (radio._retune !== null) { clearTimeout(radio._retune); radio._retune = null; }
        stopStream();
        stopTicker();
        saveState();
        AudioManager.stopBgm();
        try {
            if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.autoplay &&
                typeof Scene_Map !== 'undefined' && SceneManager._scene instanceof Scene_Map) {
                $gameMap.autoplay();
            }
        } catch (e) {
            console.warn('TunableRadio: could not give the map its music back', e);
        }
    }

    // Anything that is not the radio asking for the BGM is held back while the
    // set is on, which is what carries one station through a map transfer and
    // through a battle without a gap.
    const _AudioManager_playBgm = AudioManager.playBgm;
    AudioManager.playBgm = function (bgm, pos) {
        if (radio.on && !radio._authorized) return;
        return _AudioManager_playBgm.call(this, bgm, pos);
    };

    const _AudioManager_stopBgm = AudioManager.stopBgm;
    AudioManager.stopBgm = function () {
        if (radio.on && !radio._authorized) return;
        return _AudioManager_stopBgm.call(this);
    };

    if (AudioManager.fadeOutBgm) {
        const _AudioManager_fadeOutBgm = AudioManager.fadeOutBgm;
        AudioManager.fadeOutBgm = function (duration) {
            if (radio.on && !radio._authorized) return;
            return _AudioManager_fadeOutBgm.call(this, duration);
        };
    }

    if (AudioManager.fadeInBgm) {
        const _AudioManager_fadeInBgm = AudioManager.fadeInBgm;
        AudioManager.fadeInBgm = function (duration) {
            if (radio.on && !radio._authorized) return;
            return _AudioManager_fadeInBgm.call(this, duration);
        };
    }

    //=========================================================================
    // Tuning
    //=========================================================================

    function setBand(index) {
        radio.band = ((index % BANDS.length) + BANDS.length) % BANDS.length;
        radio.slot = 0;
        onTuned();
    }

    function cycleBand(direction) {
        setBand(radio.band + direction);
    }

    function tune(direction) {
        const len = bandSlots().length;
        radio.slot = ((radio.slot + direction) % len + len) % len;
        onTuned();
    }

    // Sweeping the dial with the key held down asked for a new file on every
    // repeat, and the decodes piled up until the map stuttered. The needle and
    // the panel answer at once; the tuner itself is given a beat to settle on a
    // frequency before anything is loaded.
    const RETUNE_DELAY = 180;

    function onTuned() {
        const now = Date.now();
        if (now - radio._lastHiss > 220) { radio._lastHiss = now; hiss(1); }
        if (radio._retune !== null) clearTimeout(radio._retune);
        radio._retune = setTimeout(() => {
            radio._retune = null;
            playCurrentStation();
            RadioUI.refresh();
        }, RETUNE_DELAY);
        saveState();
        RadioUI.refresh();
        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
    }

    function isFavorite() {
        return radio.favorites.some(f => f.band === radio.band && f.slot === radio.slot);
    }

    function toggleFavorite() {
        if (!enableFavorites) return;
        const i = radio.favorites.findIndex(f => f.band === radio.band && f.slot === radio.slot);
        if (i >= 0) {
            radio.favorites.splice(i, 1);
            if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
        } else {
            radio.favorites.push({ band: radio.band, slot: radio.slot });
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
        }
        saveState();
        RadioUI.refresh();
    }

    function jumpFavorite(direction) {
        if (!enableFavorites || !radio.favorites.length) return;
        const n = radio.favorites.length;
        const i = radio.favorites.findIndex(f => f.band === radio.band && f.slot === radio.slot);
        const next = radio.favorites[i < 0
            ? (direction > 0 ? 0 : n - 1)
            : (((i + direction) % n) + n) % n];
        radio.band = next.band;
        radio.slot = next.slot;
        onTuned();
    }

    // The scan runs on the panel's own frames rather than in a loop, so the
    // needle is seen crossing the static instead of teleporting to a station.
    function startScan(direction) {
        if (!enableAutoScan) return;
        radio.scanning = true;
        radio.scanDirection = direction;
    }

    function scanStep() {
        if (!radio.scanning) return;
        radio.slot += radio.scanDirection;
        if (radio.slot >= bandSlots().length || radio.slot < 0) {
            radio.band = ((radio.band + radio.scanDirection) % BANDS.length + BANDS.length) % BANDS.length;
            radio.slot = radio.scanDirection > 0 ? 0 : bandSlots().length - 1;
        }
        if (currentStation()) {
            radio.scanning = false;
            onTuned();
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
        } else {
            RadioUI.refresh();
        }
    }

    function adjustVolume(change) {
        radio.volume = Math.max(0, Math.min(100, radio.volume + change));
        if (AudioManager._bgmBuffer) AudioManager._bgmBuffer.volume = radio.volume / 100;
        if (AudioManager._currentBgm) AudioManager._currentBgm.volume = radio.volume;
        if (radio._stream) radio._stream.volume = Math.max(0, Math.min(1, radio.volume / 100));
        saveState();
        RadioUI.refresh();
        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
    }

    //=========================================================================
    // The panel, raised over the live map
    //=========================================================================

    const RadioUI = {
        _root: null,
        _els: null,
        _last: {},
        _raf: null,
        _frame: 0,
        _keydown: null,

        isOpen() { return !!this._root; },

        open() {
            if (this._root || typeof document === 'undefined') return;
            radio.open = true;
            const root = document.createElement('div');
            root.id = 'radio-overlay';
            // The cabinet's own ground. The dim behind it is a light one: the
            // map keeps moving under the set the way it does under Empathize.
            root.className = 'radio-shell';
            root.innerHTML = this.markup();
            document.body.appendChild(root);
            this._root = root;
            this._els = null;
            this._last = {};
            requestAnimationFrame(() => { if (this._root) this._root.classList.add('radio-shown'); });
            this.bindButtons();
            this._keydown = (e) => {
                if (e.key !== 'Escape') return;
                if (this.isModalOpen()) this.closeAddModal();
                else this.close();
                e.preventDefault();
            };
            document.addEventListener('keydown', this._keydown);
            this.loop();
            this.refresh();
        },

        close() {
            if (!this._root) return;
            radio.open = false;
            if (this._keydown) {
                document.removeEventListener('keydown', this._keydown);
                this._keydown = null;
            }
            if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null; }
            const root = this._root;
            this._root = null;
            this._els = null;
            root.classList.add('radio-leaving');
            setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 220);
            if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
        },

        markup() {
            let ticks = { AM: '', FM: '', EM: '' };
            BANDS.forEach(band => {
                for (let i = 0; i <= 6; i++) {
                    const pct = (i / 6) * 100;
                    const label = band === 'AM' ? (540 + i * 193)
                        : band === 'FM' ? (88.1 + i * 3.3).toFixed(1)
                            : (1420 + i * 1430);
                    ticks[band] += `<span class="dial-tick" style="--ui-at-x:${pct}%">${label}</span>`;
                }
            });
            const scale = (band) => `
                <div class="dial-scale">
                    <span class="dial-scale-label${band === 'FM' ? ' dial-scale-label--fm' : band === 'EM' ? ' dial-scale-label--em' : ''}">${band}</span>
                    <div class="dial-tick-row">${ticks[band]}</div>
                </div>`;
            return `
                <div id="skeuo-radio-frame">
                    <div id="radio-cabinet-header">
                        <div id="brand-logo">${t('Radio.receiver')}</div>
                        <div id="power-toggle" title="${t('Radio.power')}"></div>
                    </div>
                    <div id="radio-main-grid">
                        <div id="tuning-console">
                            <div id="dial-glass-face">
                                <div id="dial-needle"></div>
                                ${scale('AM')}
                                ${scale('FM')}
                                ${scale('EM')}
                            </div>
                            <div id="digital-readout-row">
                                <div id="nixie-display">--.-</div>
                                <div class="magic-eye-row">
                                    <span class="magic-eye-label">${t('Radio.magicEye')}</span>
                                    <div id="magic-eye-tube">
                                        <div id="magic-eye-glow" class="radio-eye--static"></div>
                                    </div>
                                </div>
                            </div>
                            <div id="station-info-screen">
                                <div id="song-title-marquee">...</div>
                                <div id="station-sub-details">...</div>
                            </div>
                        </div>
                    </div>
                    <div id="radio-control-deck">
                        <div class="control-knob-container">
                            <div class="knob-label">${t('Radio.volume')}</div>
                            <div class="knob-base" id="knob-volume"><div class="knob-pointer"></div></div>
                        </div>
                        <div id="band-push-buttons">
                            <div class="band-btn" id="btn-band-am">AM</div>
                            <div class="band-btn" id="btn-band-fm">FM</div>
                            <div class="band-btn" id="btn-band-em">EM</div>
                        </div>
                        <div id="action-deck-buttons">
                            <div class="utility-btn" id="btn-fav">&#9733;</div>
                            <div class="utility-btn" id="btn-scan">${t('Radio.scan')}</div>
                            <div class="utility-btn" id="btn-add" title="${t('Radio.addStationHint')}">${t('Radio.addStation')}</div>
                            <div class="utility-btn" id="btn-battle"></div>
                            <div class="utility-btn" id="btn-close">${t('Radio.close')}</div>
                        </div>
                        <div class="control-knob-container">
                            <div class="knob-label">${t('Radio.tuning')}</div>
                            <div class="knob-base" id="knob-tuning"><div class="knob-pointer"></div></div>
                        </div>
                    </div>
                    <div id="radio-add-modal" class="radio-modal" hidden>
                        <div class="radio-modal-panel">
                            <div class="radio-modal-title">${t('Radio.addStationTitle')}</div>
                            <div class="radio-modal-hint">${t('Radio.addStationHint')}</div>
                            <input id="radio-add-name" class="radio-modal-field" type="text"
                                placeholder="${t('Radio.addStationName')}">
                            <input id="radio-add-url" class="radio-modal-field" type="text"
                                placeholder="${t('Radio.addStationUrl')}">
                            <div class="radio-modal-error" id="radio-add-error"></div>
                            <div class="radio-modal-buttons">
                                <div class="utility-btn" id="radio-add-ok">${t('Radio.addStationOk')}</div>
                                <div class="utility-btn" id="radio-add-cancel">${t('Radio.addStationCancel')}</div>
                            </div>
                        </div>
                    </div>
                </div>`;
        },

        // The paste-a-link modal. It is a real text field, so while it is open
        // the dial stops listening to the keyboard (see handleInput).
        openAddModal() {
            const modal = this._root && this._root.querySelector('#radio-add-modal');
            if (!modal) return;
            modal.hidden = false;
            const err = this._root.querySelector('#radio-add-error');
            if (err) err.innerText = '';
            const url = this._root.querySelector('#radio-add-url');
            if (url) { url.value = ''; url.focus(); }
            const name = this._root.querySelector('#radio-add-name');
            if (name) name.value = '';
        },

        closeAddModal() {
            const modal = this._root && this._root.querySelector('#radio-add-modal');
            if (modal) modal.hidden = true;
        },

        isModalOpen() {
            const modal = this._root && this._root.querySelector('#radio-add-modal');
            return !!(modal && !modal.hidden);
        },

        submitAddModal() {
            const name = this._root.querySelector('#radio-add-name');
            const url = this._root.querySelector('#radio-add-url');
            const err = this._root.querySelector('#radio-add-error');
            const ok = addWebRadio(name ? name.value : '', url ? url.value : '');
            if (!ok) {
                if (err) err.innerText = t('Radio.addStationBad');
                return;
            }
            this.closeAddModal();
            this.refresh();
        },

        bindButtons() {
            // One listener on the cabinet, not one per plate: the panel repaints
            // itself while it is open, so a plate must not depend on the element
            // it was born as still being the element under the cursor.
            const acts = {};
            const on = (id, fn) => { acts[id] = fn; };
            this._root.addEventListener('click', (e) => {
                const hit = e.target && e.target.closest
                    ? e.target.closest('[id]') : null;
                if (!hit) return;
                const fn = acts[hit.id];
                if (!fn) return;
                e.preventDefault();
                e.stopPropagation();
                fn();
            });
            // The power switch stops the broadcast; the CLOSE plate only puts
            // the panel away, and the station carries on playing behind it.
            on('power-toggle', () => { powerOff(); this.close(); });
            on('btn-close', () => this.close());
            on('btn-band-am', () => setBand(0));
            on('btn-band-fm', () => setBand(1));
            on('btn-band-em', () => setBand(2));
            on('btn-fav', () => toggleFavorite());
            on('btn-scan', () => startScan(1));
            on('btn-add', () => this.openAddModal());
            on('btn-battle', () => {
                radio.inBattle = !radio.inBattle;
                saveState();
                this.refresh();
                if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            });
            on('radio-add-ok', () => this.submitAddModal());
            on('radio-add-cancel', () => this.closeAddModal());
            const urlField = this._root.querySelector('#radio-add-url');
            if (urlField) urlField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { this.submitAddModal(); e.preventDefault(); }
            });
            const tuner = this._root.querySelector('#knob-tuning');
            if (tuner) tuner.addEventListener('wheel', (e) => {
                tune(e.deltaY > 0 ? 1 : -1);
                e.preventDefault();
            }, { passive: false });
        },

        loop() {
            this._raf = requestAnimationFrame(() => {
                this._raf = null;
                if (!this._root) return;
                this._frame++;
                this.handleInput();
                if (radio.scanning && this._frame % 20 === 0) scanStep();
                // The panel is drawn over the live map, so it repaints only
                // when the dial has actually moved: every write here costs the
                // map a frame. refresh() is diffed, and the scan is the only
                // thing that changes the set on its own.
                if (radio.scanning && this._frame % 10 === 0) this.refresh();
                this.loop();
            });
        },

        handleInput() {
            if (typeof Input === 'undefined') return;
            // While the player is typing a url, the arrow keys belong to the
            // text field and not to the dial.
            if (this.isModalOpen()) return;
            const shift = Input.isPressed('shift');
            if (radio.scanning && (Input.isTriggered('ok') || Input.isTriggered('cancel'))) {
                radio.scanning = false;
                this.refresh();
                return;
            }
            if (Input.isRepeated('left')) shift ? jumpFavorite(-1) : tune(-1);
            else if (Input.isRepeated('right')) shift ? jumpFavorite(1) : tune(1);
            else if (Input.isRepeated('up')) shift ? adjustVolume(5) : cycleBand(-1);
            else if (Input.isRepeated('down')) shift ? adjustVolume(-5) : cycleBand(1);
            else if (Input.isTriggered('pageup')) startScan(-1);
            else if (Input.isTriggered('pagedown')) startScan(1);
            else if (Input.isTriggered('ok')) toggleFavorite();
            else if (Input.isTriggered('cancel')) this.close();
        },

        els() {
            if (!this._root) return null;
            let els = this._els;
            if (!els || !els.nixie || !els.nixie.isConnected) {
                const q = (id) => this._root.querySelector('#' + id);
                els = this._els = {
                    nixie: q('nixie-display'),
                    needle: q('dial-needle'),
                    eyeGlow: q('magic-eye-glow'),
                    songMarquee: q('song-title-marquee'),
                    subDetails: q('station-sub-details'),
                    btnAM: q('btn-band-am'),
                    btnFM: q('btn-band-fm'),
                    btnEM: q('btn-band-em'),
                    btnFav: q('btn-fav'),
                    btnBattle: q('btn-battle'),
                    knobVol: q('knob-volume'),
                    knobTune: q('knob-tuning')
                };
                this._last = {};
            }
            return els;
        },

        refresh() {
            const els = this.els();
            if (!els) return;
            const last = this._last;
            const station = currentStation();
            const freq = currentFrequency();

            if (els.nixie && last.nixie !== freq) { els.nixie.innerText = freq; last.nixie = freq; }

            if (els.needle) {
                const len = Math.max(bandSlots().length - 1, 1);
                const pct = (radio.slot / len) * 100;
                const left = `calc(32px + ${pct}% * 0.88)`;
                if (last.needle !== left) {
                    els.needle.style.setProperty('--radio-needle', left);
                    last.needle = left;
                }
            }

            if (els.eyeGlow) {
                // The tube is lit by what the set is doing: locked on, hunting,
                // or hissing.
                const state = station ? 'music' : radio.scanning ? 'scanning' : 'static';
                if (last.eye !== state) { els.eyeGlow.className = 'radio-eye--' + state; last.eye = state; }
            }

            if (els.songMarquee && els.subDetails) {
                let marquee, ink, sub;
                if (station) {
                    marquee = station.name;
                    ink = 'var(--radio-lit)';
                    sub = station.stream
                        ? t('Radio.onAirStream', { url: station.stream })
                        : t('Radio.onAirInfo', {
                            artist: station.artist,
                            track: trackTitle(radio.playing)
                        });
                } else {
                    marquee = t('Radio.static');
                    ink = 'var(--radio-dead)';
                    sub = t('Radio.offAir');
                }
                if (last.marquee !== marquee) { els.songMarquee.innerText = marquee; last.marquee = marquee; }
                if (last.ink !== ink) { els.songMarquee.style.setProperty('--radio-ink', ink); last.ink = ink; }
                if (last.sub !== sub) { els.subDetails.innerText = sub; last.sub = sub; }
            }

            [['btnAM', 0], ['btnFM', 1], ['btnEM', 2]].forEach(([key, index]) => {
                const el = els[key];
                if (!el) return;
                const cls = 'band-btn' + (radio.band === index ? ' active' : '');
                if (last[key] !== cls) { el.className = cls; last[key] = cls; }
            });

            if (els.btnBattle) {
                const label = radio.inBattle ? t('Radio.battleOn') : t('Radio.battleOff');
                if (last.battle !== label) { els.btnBattle.innerText = label; last.battle = label; }
                const cls = 'utility-btn' + (radio.inBattle ? ' active' : '');
                if (last.battleCls !== cls) { els.btnBattle.className = cls; last.battleCls = cls; }
            }

            if (els.btnFav) {
                const cls = 'utility-btn' + (isFavorite() ? ' gold-star' : '');
                if (last.fav !== cls) { els.btnFav.className = cls; last.fav = cls; }
            }

            if (els.knobVol) {
                const rot = (radio.volume / 100) * 270 - 135;
                if (last.volRot !== rot) {
                    els.knobVol.style.setProperty('--radio-turn', rot + 'deg');
                    last.volRot = rot;
                }
            }
            if (els.knobTune) {
                const rot = radio.slot * 35;
                if (last.tuneRot !== rot) {
                    els.knobTune.style.setProperty('--radio-turn', rot + 'deg');
                    last.tuneRot = rot;
                }
            }
        },

    };

    function trackTitle(key) {
        if (!key) return '';
        const leaf = String(key).slice(String(key).lastIndexOf('/') + 1);
        return leaf;
    }

    //=========================================================================
    // Ways in
    //=========================================================================

    function openRadio() {
        if (!radio.ready) initializeRadio();
        if (!radio.on) {
            // Nothing tuned yet (a fresh party, or the set was switched off on
            // a slot that no longer exists): open on the concert hall.
            if (!currentStation()) tuneToDefault();
            playCurrentStation();
        }
        RadioUI.open();
    }

    function closeRadio() {
        RadioUI.close();
    }

    window.TunableRadio = {
        open: openRadio,
        close: closeRadio,
        stop: powerOff,
        isOn: () => radio.on,
        isOpen: () => RadioUI.isOpen(),
        // What the set is playing, so the artist card knows the music is the
        // radio's rather than the map's.
        nowPlaying: () => (radio.on ? radio.playing : null),
        stations: () => radio.stations.slice(),
        rescan: () => { initializeRadio(); },
        addWebRadio,
        // Pure parts, for the test harness.
        __test: {
            walkLibrary, buildStations, layoutBands, bandFrequencies, nextTrackIndex,
            parseWebRadios, webStation, hashString
        }
    };

    //=========================================================================
    // Engine hooks
    //=========================================================================

    // The panel is raised over the live map, so the party must not walk about
    // behind it and Escape must not open the main menu underneath it.
    if (typeof Game_Player !== 'undefined' && Game_Player.prototype.canMove) {
        const _Game_Player_canMove = Game_Player.prototype.canMove;
        Game_Player.prototype.canMove = function () {
            if (radio.open) return false;
            return _Game_Player_canMove.call(this);
        };
    }

    if (typeof Scene_Map !== 'undefined' && Scene_Map.prototype.updateCallMenu &&
        Scene_Map.prototype.terminate) {
        const _Scene_Map_updateCallMenu = Scene_Map.prototype.updateCallMenu;
        Scene_Map.prototype.updateCallMenu = function () {
            if (radio.open) return;
            _Scene_Map_updateCallMenu.call(this);
        };

        // A fight is not the place for the cabinet, but the station keeps
        // playing right through it.
        const _Scene_Map_terminate = Scene_Map.prototype.terminate;
        Scene_Map.prototype.terminate = function () {
            RadioUI.close();
            _Scene_Map_terminate.call(this);
        };
    }

    if (typeof Scene_Boot !== 'undefined' && Scene_Boot.prototype.start) {
        const _Scene_Boot_start = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function () {
            _Scene_Boot_start.call(this);
            try { initializeRadio(); } catch (e) {
                console.error('TunableRadio: station scan failed', e);
            }
        };
    }

    // A save remembers whether the set was left on, and puts it back on air on
    // the way in.
    if (typeof DataManager !== 'undefined' && DataManager.extractSaveContents &&
        DataManager.setupNewGame) {
        const _DataManager_extractSaveContents = DataManager.extractSaveContents;
        DataManager.extractSaveContents = function (contents) {
            _DataManager_extractSaveContents.call(this, contents);
            radio.on = false;
            loadState();
            if (radio.on) {
                radio.on = false;
                playCurrentStation();
            }
        };

        const _DataManager_setupNewGame = DataManager.setupNewGame;
        DataManager.setupNewGame = function () {
            _DataManager_setupNewGame.call(this);
            radio.on = false;
            radio.playing = null;
            stopTicker();
        };
    }

    if (typeof PluginManager !== 'undefined' && PluginManager.registerCommand) {
        PluginManager.registerCommand(pluginName, 'openRadio', () => openRadio());
        PluginManager.registerCommand(pluginName, 'closeRadio', () => closeRadio());
        PluginManager.registerCommand(pluginName, 'stopRadio', () => powerOff());
        PluginManager.registerCommand(pluginName, 'scanStations', () => {
            initializeRadio();
            if (typeof $gameMessage !== 'undefined' && $gameMessage) {
                $gameMessage.add(t('Radio.stationsUpdated'));
            }
        });
        PluginManager.registerCommand(pluginName, 'setVolume', args => {
            adjustVolume((parseInt(args.volume) || defaultVolume) - radio.volume);
        });
    }

    // A fight either belongs to the station or it does not, and the plate on
    // the panel is the answer. When the set plays through, the battle's own
    // music never starts; when it stands down, the station comes back on the
    // moment the party is on the map again.
    if (typeof BattleManager !== 'undefined' && BattleManager.playBattleBgm) {
        const _BattleManager_playBattleBgm = BattleManager.playBattleBgm;
        BattleManager.playBattleBgm = function () {
            if (radio.on && !radio.inBattle) {
                radio.on = false;
                radio.suspended = true;
                stopStream();
                stopTicker();
            }
            if (radio.on) return;
            return _BattleManager_playBattleBgm.call(this);
        };
    }

    if (typeof Scene_Map !== 'undefined' && Scene_Map.prototype.start) {
        const _Scene_Map_start = Scene_Map.prototype.start;
        Scene_Map.prototype.start = function () {
            _Scene_Map_start.call(this);
            if (radio.suspended) {
                radio.suspended = false;
                playCurrentStation();
            }
        };
    }

    window.RadioDebug = {
        stations: () => radio.stations.map(s => s.id + ' (' + s.tracks.length + ')'),
        state: () => ({ on: radio.on, band: bandName(), slot: radio.slot, playing: radio.playing }),
        rescan: () => initializeRadio()
    };
})();
