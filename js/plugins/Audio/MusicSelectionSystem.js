/*:
 * @target MZ
 * @plugindesc Handles battle music selection with independent window and Options menu integration
 * @author Omni-Lex.ai
 *
 * @command openMusicSelectionWindow
 * @text Open Music Selection Window
 * @desc Opens the music selection window in a separate scene
 *
 * @help
 * Music Selection System
 * =====================
 * This plugin provides a standalone music selection system independent from the
 * character creation process. Features include:
 *
 * - Music selection window accessible from Options menu
 * - Configurable battle music tracks
 * - Music preview functionality
 * - Persistent music selection via ConfigManager
 * - Bilingual support (English/Italian)
 *
 * Options holds a "Battle Music" mode selector with four entries:
 * - Biome (the default): every biome in js/db/WorldGen/Biomes.json names its
 *   own battle track in its "battleBgm" field, and a fight plays the track of
 *   the biome the party is standing in. Anywhere without a biome (or whose
 *   biome names no track) falls back to "Drums" (RandomMind/Battle).
 * - Selected Track: plays the one track picked in the "Battle Track" row,
 *   which is shown only while this mode is on.
 * - Random: draws a different one of the tracks below, custom ones included,
 *   at the start of every battle.
 * - None: no music during battles.
 *
 * Available Battle Music:
 * - Drums (RandomMind/Battle)
 * - Shortcuts (ZaneMusic/shortcuts)
 * -  (TallBeard)
 * - Melodic Techno (Moogify/MelodicTechno)
 * - Battle1-Battle8 (KADOGAWA)
 *
 * Custom Battle Music:
 * Players can add their own tracks by copying audio files into the
 * audio/bgm/BattleMusic/ folder. Each file is scanned at startup and shown as a
 * selectable track (named after the filename) in every battle music selector.
 * Desktop / NW.js builds only. See the README in that folder.
 */

(() => {
  const pluginName = "MusicSelectionSystem";

  // Special sentinel values
  const MUSIC_NONE     = "__none__";
  const MUSIC_RANDOM   = "__random__";
  const MUSIC_MAP      = "__map__";
  const MUSIC_BIOME    = "__biome__";

  // The entry every fight falls back to when nothing else is chosen: the
  // track of the biome the fight happens in.
  const MUSIC_DEFAULT  = MUSIC_BIOME;

  // What Biome plays where no biome names a track of its own.
  const MUSIC_FALLBACK = "RandomMind/Battle";

  // The procedural map, whose biome changes square by square.
  const PROC_MAP_ID = 636;

  // Folder (under audio/bgm/) players can drop their own battle tracks into.
  const CUSTOM_FOLDER = "BattleMusic";

  // Music tracks available for selection
  const MUSIC_TRACKS = [
    { get name() { return T('MusicSelection.trackNone'); },              value: MUSIC_NONE, composer: "" },
    { get name() { return T('MusicSelection.trackMap'); }, value: MUSIC_MAP,  composer: "" },
    { get name() { return T('MusicSelection.trackBiome'); }, value: MUSIC_BIOME, composer: "" },
    { name: "Drums", value: "RandomMind/Battle", composer: "RandomMind" },  // i18n-ignore  bgm track, named after its file
    { name: "Shortcuts", value: "ZaneMusic/shortcuts", composer: "ZaneMusic" },  // i18n-ignore  bgm track, named after its file
    { name: "Melodic Techno", value: "Moogify/MelodicTechno", composer: "Moogify" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle1", value: "Battle1", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle2", value: "Battle2", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle3", value: "Battle3", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle4", value: "Battle4", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle5", value: "Battle5", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle6", value: "Battle6", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle7", value: "Battle7", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
    { name: "Battle8", value: "Battle8", composer: "KADOGAWA" },  // i18n-ignore  bgm track, named after its file
  ];

  // Scan audio/bgm/BattleMusic for player-supplied tracks (desktop / NW.js only).
  // Each audio file becomes a selectable track whose value is "BattleMusic/<name>".
  function scanCustomTracks() {
    const tracks = [];
    try {
      if (window.Utils && Utils.isNwjs && Utils.isNwjs()) {
        const fs = require("fs");
        const path = require("path");
        const dir = path.join(path.dirname(process.mainModule.filename), "audio", "bgm", CUSTOM_FOLDER);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const seen = {};
        for (const file of fs.readdirSync(dir)) {
          const m = file.match(/^(.+)\.(ogg|m4a|mp3|wav)$/i);
          if (!m) continue;
          const base = m[1];
          if (seen[base]) continue; // ignore duplicate extensions (e.g. .ogg + .m4a)
          seen[base] = true;
          tracks.push({ name: base, value: CUSTOM_FOLDER + "/" + base, composer: "Custom" });  // i18n-ignore  composer id for player-supplied tracks
        }
      }
    } catch (e) {
      console.error("MusicSelectionSystem: failed to scan custom battle music", e);
    }
    return tracks;
  }

  // Append any custom tracks found on disk so they show up in every selector.
  Array.prototype.push.apply(MUSIC_TRACKS, scanCustomTracks());

  // Helper function for localized text
  function getLocalizedText(english, italian) {
    return ConfigManager.language === "it" ? italian : english;
  }

  // ---------------------------------------------------------------------------
  // Battle music mode
  // ---------------------------------------------------------------------------
  // The mode selector's entries, in the order Options cycles them. Every mode
  // but "track" is one sentinel selection; "track" plays battleMusicTrack.
  const MODES = ["biome", "track", "random", "none"];
  const MODE_SENTINEL = { biome: MUSIC_BIOME, random: MUSIC_RANDOM, none: MUSIC_NONE };

  function isModeSentinel(value) {
    return value === MUSIC_BIOME || value === MUSIC_RANDOM || value === MUSIC_NONE;
  }

  // The whole selection lives in battleMusicName: a mode sentinel, or a track
  // (Continue Map Music included) when the mode is Selected Track. Every menu
  // that writes it (Options, the Music Selection scene, character creation)
  // therefore agrees on the mode without knowing about it.
  Object.defineProperty(ConfigManager, "battleMusicName", {
    get: function () {
      return this._battleMusicName !== undefined ? this._battleMusicName : MUSIC_DEFAULT;
    },
    set: function (value) {
      this._battleMusicName = value;
      if (value && !isModeSentinel(value)) this._battleMusicTrack = value;
    },
    configurable: true,
  });

  // The track Selected Track plays. Remembered while another mode is on, so
  // switching back lands on the player's own pick.
  Object.defineProperty(ConfigManager, "battleMusicTrack", {
    get: function () { return this._battleMusicTrack || MUSIC_FALLBACK; },
    set: function (value) {
      if (!value || isModeSentinel(value)) return;
      this._battleMusicTrack = value;
      if (this.battleMusicMode === "track") this._battleMusicName = value;
    },
    configurable: true,
  });

  Object.defineProperty(ConfigManager, "battleMusicMode", {
    get: function () {
      const sel = this.battleMusicName;
      for (const mode of Object.keys(MODE_SENTINEL)) {
        if (MODE_SENTINEL[mode] === sel) return mode;
      }
      return "track";
    },
    set: function (mode) {
      if (MODE_SENTINEL[mode]) this._battleMusicName = MODE_SENTINEL[mode];
      else if (mode === "track") this._battleMusicName = this.battleMusicTrack;
    },
    configurable: true,
  });

  const _ConfigManager_makeData = ConfigManager.makeData;
  ConfigManager.makeData = function () {
    const config = _ConfigManager_makeData.call(this);
    config.battleMusicName = this.battleMusicName;
    config.battleMusicTrack = this.battleMusicTrack;
    config.battleMusicBiomeDefault = true;
    return config;
  };

  const _ConfigManager_applyData = ConfigManager.applyData;
  ConfigManager.applyData = function (config) {
    _ConfigManager_applyData.call(this, config);
    this._battleMusicTrack = config.battleMusicTrack && !isModeSentinel(config.battleMusicTrack)
      ? config.battleMusicTrack : undefined;
    this.battleMusicName = this.readBattleMusicName(config);
  };

  // Older configs are read into the mode they meant: the Random switch (and
  // the Random track before it) becomes Random, keeping the track it hid, and
  // a config saved before Biome existed, still holding the old default (Drums)
  // it never chose, moves onto Biome once. The flag keeps a deliberate later
  // pick of Drums.
  ConfigManager.readBattleMusicName = function (config) {
    if (config.battleMusicRandom || config.battleMusicName === MUSIC_RANDOM) {
      const hidden = config.battleMusicName;
      if (hidden && !isModeSentinel(hidden) && !this._battleMusicTrack) this._battleMusicTrack = hidden;
      return MUSIC_RANDOM;
    }
    if (config.battleMusicName === undefined) return MUSIC_DEFAULT;
    if (!config.battleMusicBiomeDefault && config.battleMusicName === MUSIC_FALLBACK) {
      return MUSIC_DEFAULT;
    }
    return config.battleMusicName;
  };

  // ---------------------------------------------------------------------------
  // Biome track
  // ---------------------------------------------------------------------------
  // The biome the party stands in: the procedural square first, then a static
  // map's <Biome: X> note. "" where there is neither.
  function currentBiomeName() {
    try {
      const pg = window.$gameSystem && $gameSystem._procGenData;
      if (pg && pg.currentBiome && window.$gameMap && $gameMap.mapId() === PROC_MAP_ID) {
        return String(pg.currentBiome);
      }
      const note = window.$dataMap && $dataMap.note;
      const m = note && /<Biome:\s*(.+?)>/i.exec(note);
      return m ? m[1].trim() : "";
    } catch (e) {
      console.error("MusicSelectionSystem: could not read the current biome", e);
      return "";
    }
  }

  // The battle track a biome names, by exact name first and then by the head
  // word ("Road t-up" reads as "Road"). An alien biome without a track of its
  // own borrows AlienPlanet's.
  function biomeBattleTrack(name) {
    const biomes = window.WorldGen && Array.isArray(window.WorldGen.Biomes) ? window.WorldGen.Biomes : [];
    if (!name || !biomes.length) return "";
    const find = n => biomes.find(b => b && b.name === n && b.battleBgm);
    const hit = find(name) || find(String(name).split(/\s+/)[0]) ||
      (/^Alien/.test(name) ? find("AlienPlanet") : null);
    return hit ? hit.battleBgm : "";
  }

  function currentBiomeBattleTrack() {
    return biomeBattleTrack(currentBiomeName()) || MUSIC_FALLBACK;
  }

  // ---------------------------------------------------------------------------
  // Random track
  // ---------------------------------------------------------------------------
  // Every real file in the list, sentinels excluded. Player-supplied tracks in
  // audio/bgm/BattleMusic are already in MUSIC_TRACKS by now, so they take part
  // in the draw like any shipped one.
  function playableTracks() {
    return MUSIC_TRACKS.filter(t =>
      t.value !== MUSIC_NONE && t.value !== MUSIC_MAP &&
      t.value !== MUSIC_RANDOM && t.value !== MUSIC_BIOME);
  }

  // What Random resolved to for the battle currently starting. Drawn once per
  // battle, in BattleManager.setup: playBattleBgm runs twice for a normal
  // encounter (once under the encounter flash, once in Scene_Battle.start), and
  // drawing per call would swap the track mid-transition.
  let _randomPick = null;

  function rollRandomTrack() {
    let pool = playableTracks().map(t => t.value);
    if (pool.length === 0) { _randomPick = null; return null; }
    // Never twice in a row while there is anything else to pick.
    if (pool.length > 1 && _randomPick) {
      const rest = pool.filter(v => v !== _randomPick);
      if (rest.length) pool = rest;
    }
    _randomPick = pool[Math.randomInt(pool.length)];
    return _randomPick;
  }

  // Turn a stored selection into something playable. None and Map pass through
  // as themselves (their callers special-case them), Random becomes this
  // battle's draw and Biome the local biome's track. Anything else is already
  // a bgm file name.
  function resolveBattleBgmName(selection) {
    const sel = selection !== undefined ? selection : ConfigManager.battleMusicName;
    if (sel === MUSIC_BIOME) return currentBiomeBattleTrack();
    if (sel !== MUSIC_RANDOM) return sel;
    return _randomPick || rollRandomTrack();
  }

  // One draw per battle. MapBattleMode's in-place fights go through setup too,
  // so both battle paths reroll.
  const _BattleManager_setup = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    if (ConfigManager.battleMusicMode === "random") rollRandomTrack();
  };

  // Apply battle music when battle starts
  const _BattleManager_playBattleBgm = BattleManager.playBattleBgm;
  BattleManager.playBattleBgm = function () {
    const sel = resolveBattleBgmName();
    if (sel === MUSIC_NONE) {
      AudioManager.stopBgm();
    } else if (sel === MUSIC_MAP) {
      // Keep current map music playing ,  do nothing
    } else if (sel) {
      AudioManager.playBgm({ name: sel, volume: 90, pitch: 100, pan: 0 });
    } else {
      _BattleManager_playBattleBgm.call(this);
    }
  };

  // Audition a selection from a menu. Random draws a fresh example and Biome
  // plays the local biome's track, so neither entry goes silent.
  function previewTrackValue(value, volume) {
    let sel = value;
    if (value === MUSIC_RANDOM) sel = rollRandomTrack();
    else if (value === MUSIC_BIOME) sel = currentBiomeBattleTrack();
    if (sel === MUSIC_NONE) AudioManager.stopBgm();
    else if (sel === MUSIC_MAP || !sel) { /* leave whatever is playing */ }
    else AudioManager.playBgm({ name: sel, volume: volume, pitch: 100, pan: 0 });
  }

  // Plugin command
  PluginManager.registerCommand(pluginName, "openMusicSelectionWindow", () => {
    if (window.Scene_MusicSelection) SceneManager.push(window.Scene_MusicSelection);
  });

  // The tracks the Battle Track row cycles: every real file plus Continue Map
  // Music, the mode sentinels being the mode row's business.
  function selectableTracks() {
    return MUSIC_TRACKS.filter(t => !isModeSentinel(t.value));
  }

  function modeLabel(mode) {
    return T('MusicSelection.mode.' + (MODES.includes(mode) ? mode : MODES[0]));
  }

  // Add the Battle Music mode and Battle Track rows to the Options menu
  if (window.GameOptions) {
    // Labels are passed as getters, not resolved strings: the options are
    // registered once at boot, and a fixed string would keep the boot language
    // after the player switches language in the very same menu.
    window.GameOptions.registerOption('battleMusicMode', () => T('MusicSelection.battleMusic'),
      () => ConfigManager.battleMusicMode,
      function(value) { ConfigManager.battleMusicMode = value; ConfigManager.save(); },
      'audio', 'custom',
      function(value) { return modeLabel(value); },
      function() { this.changeBattleMusicMode(1); },
      function() { this.changeBattleMusicMode(-1); }
    );
    window.GameOptions.registerOption('battleMusicName', () => T('MusicSelection.battleTrack'),
      () => ConfigManager.battleMusicTrack,
      function(value) { ConfigManager.battleMusicTrack = value; ConfigManager.save(); },
      'audio', 'custom',
      function(value) { return this.battleMusicStatusText(); },
      function() { this.changeBattleMusic(1); },
      function() { this.changeBattleMusic(-1); }
    );
    // The mode decides whether the track row exists at all, so moving it has
    // to rebuild the list rather than repaint it.
    window.GameOptions.markRebuildsList('battleMusicMode');
    window.GameOptions.setVisibility('battleMusicName', () => ConfigManager.battleMusicMode === "track");
  } else {
    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function () {
      _Window_Options_addGeneralOptions.call(this);
      this.addCommand(T('MusicSelection.battleMusic'), "battleMusicMode");
      if (ConfigManager.battleMusicMode === "track") {
        this.addCommand(T('MusicSelection.battleTrack'), "battleMusicName");
      }
    };

    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function (index) {
      const symbol = this.commandSymbol(index);
      if (symbol === "battleMusicMode") return modeLabel(ConfigManager.battleMusicMode);
      if (symbol === "battleMusicName") return this.battleMusicStatusText();
      return _Window_Options_statusText.call(this, index);
    };

    const _Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function () {
      const symbol = this.commandSymbol(this.index());
      if (symbol === "battleMusicMode") { this.changeBattleMusicMode(1); this.refresh(); }
      else if (symbol === "battleMusicName") { this.changeBattleMusic(); }
      else { _Window_Options_processOk.call(this); }
    };
  }

  Window_Options.prototype.battleMusicStatusText = function () {
    const tracks = selectableTracks();
    const track = tracks.find(t => t.value === ConfigManager.battleMusicTrack);
    return track ? track.name : (tracks[0] ? tracks[0].name : MUSIC_FALLBACK);
  };

  // Step the mode one entry either way and audition what it now plays.
  Window_Options.prototype.changeBattleMusicMode = function (dir) {
    const step = dir === -1 ? -1 : 1;
    let idx = MODES.indexOf(ConfigManager.battleMusicMode);
    if (idx < 0) idx = 0;
    ConfigManager.battleMusicMode = MODES[(idx + step + MODES.length) % MODES.length];
    ConfigManager.save();
    previewTrackValue(ConfigManager.battleMusicName, 60);
    const row = this.findSymbol("battleMusicMode");
    if (row >= 0) this.redrawItem(row);
    this.playCursorSound();
  };

  // Step the track one entry either way. A stored value that is no longer in
  // the list (a custom file the player deleted) reads as index -1, which would
  // step to the second entry going forwards and the second-to-last going back,
  // so it is pinned to the head of the list first.
  Window_Options.prototype.changeBattleMusic = function (dir) {
    const step = dir === -1 ? -1 : 1;
    const tracks = selectableTracks();
    if (!tracks.length) return;
    let currentIndex = tracks.findIndex(t => t.value === ConfigManager.battleMusicTrack);
    if (currentIndex < 0) currentIndex = 0;
    const next = tracks[(currentIndex + step + tracks.length) % tracks.length];
    ConfigManager.battleMusicTrack = next.value;
    ConfigManager.save();
    previewTrackValue(next.value, 60);
    const row = this.findSymbol("battleMusicName");
    if (row >= 0) this.redrawItem(row);
    this.playCursorSound();
  };

  // Public API for MusicSelectionSystemUI.js and CharacterCreation.js
  window.MusicSelectionSystem = {
    MUSIC_TRACKS, MUSIC_NONE, MUSIC_MAP, MUSIC_RANDOM, MUSIC_BIOME, MUSIC_DEFAULT, MUSIC_FALLBACK,
    MODES, getLocalizedText, scanCustomTracks,
    playableTracks, selectableTracks, resolveBattleBgmName, rollRandomTrack, previewTrackValue,
    currentBiomeName, biomeBattleTrack, currentBiomeBattleTrack
  };
})();