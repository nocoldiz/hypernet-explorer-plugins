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
 * Battle music can also be left to chance: the separate "Random Battle Music"
 * switch in Options draws a different one of the tracks below, custom ones
 * included, at the start of every battle, and hides the track selection while
 * it is on.
 *
 * The default entry is "Drums" (RandomMind/Battle).
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

  // The entry every fight falls back to when nothing else is chosen.
  const MUSIC_DEFAULT  = "RandomMind/Battle";

  // Folder (under audio/bgm/) players can drop their own battle tracks into.
  const CUSTOM_FOLDER = "BattleMusic";

  // Music tracks available for selection
  const MUSIC_TRACKS = [
    { get name() { return T('MusicSelection.trackNone'); },              value: MUSIC_NONE, composer: "" },
    { get name() { return T('MusicSelection.trackMap'); }, value: MUSIC_MAP,  composer: "" },
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

  // Battle Music Configuration
  Object.defineProperty(ConfigManager, "battleMusicName", {
    get: function () {
      return this._battleMusicName !== undefined ? this._battleMusicName : MUSIC_DEFAULT;
    },
    set: function (value) {
      this._battleMusicName = value;
    },
    configurable: true,
  });

  // Random battle music is its own switch, not an entry in the track list: while
  // it is on the track selection is meaningless and hidden, and turning it off
  // hands the player back whatever track they had picked before.
  Object.defineProperty(ConfigManager, "battleMusicRandom", {
    get: function () { return !!this._battleMusicRandom; },
    set: function (value) { this._battleMusicRandom = !!value; },
    configurable: true,
  });

  const _ConfigManager_makeData = ConfigManager.makeData;
  ConfigManager.makeData = function () {
    const config = _ConfigManager_makeData.call(this);
    config.battleMusicName = this.battleMusicName;
    config.battleMusicRandom = this.battleMusicRandom;
    return config;
  };

  const _ConfigManager_applyData = ConfigManager.applyData;
  ConfigManager.applyData = function (config) {
    _ConfigManager_applyData.call(this, config);
    this.battleMusicName = this.readBattleMusicName(config);
    this.battleMusicRandom = this.readBattleMusicRandom(config);
  };

  ConfigManager.readBattleMusicName = function (config) {
    return config.battleMusicName !== undefined
      ? config.battleMusicName
      : MUSIC_DEFAULT;
  };

  // A config saved back when Random was a track reads as the switch being on,
  // and the stored track falls back to the default so turning the switch off
  // lands on something playable.
  ConfigManager.readBattleMusicRandom = function (config) {
    if (config.battleMusicName === MUSIC_RANDOM) {
      this.battleMusicName = MUSIC_DEFAULT;
      return true;
    }
    return !!config.battleMusicRandom;
  };

  // ---------------------------------------------------------------------------
  // Random track ("Random" entry, sits right under None)
  // ---------------------------------------------------------------------------
  // Every real file in the list, sentinels excluded. Player-supplied tracks in
  // audio/bgm/BattleMusic are already in MUSIC_TRACKS by now, so they take part
  // in the draw like any shipped one.
  function playableTracks() {
    return MUSIC_TRACKS.filter(t =>
      t.value !== MUSIC_NONE && t.value !== MUSIC_MAP &&
      t.value !== MUSIC_RANDOM);
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
  // as themselves (their callers special-case them) and Random becomes this
  // battle's draw. Anything else is already a bgm file name.
  function resolveBattleBgmName(selection) {
    if (selection === undefined && ConfigManager.battleMusicRandom) {
      return _randomPick || rollRandomTrack();
    }
    const sel = selection !== undefined ? selection : ConfigManager.battleMusicName;
    if (sel !== MUSIC_RANDOM) return sel;
    return _randomPick || rollRandomTrack();
  }

  // One draw per battle. MapBattleMode's in-place fights go through setup too,
  // so both battle paths reroll.
  const _BattleManager_setup = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    if (ConfigManager.battleMusicRandom) rollRandomTrack();
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

  // Audition a selection from a menu. Random draws a fresh example so the entry
  // demonstrates itself instead of going silent.
  function previewTrackValue(value, volume) {
    let sel = value;
    if (value === MUSIC_RANDOM) sel = rollRandomTrack();
    if (sel === MUSIC_NONE) AudioManager.stopBgm();
    else if (sel === MUSIC_MAP || !sel) { /* leave whatever is playing */ }
    else AudioManager.playBgm({ name: sel, volume: volume, pitch: 100, pan: 0 });
  }

  // Plugin command
  PluginManager.registerCommand(pluginName, "openMusicSelectionWindow", () => {
    if (window.Scene_MusicSelection) SceneManager.push(window.Scene_MusicSelection);
  });

  // Add Battle Music option to Options menu
  if (window.GameOptions) {
    // The label is passed as a getter, not a resolved string: the option is
    // registered once at boot, and a fixed string would keep the boot language
    // after the player switches language in the very same menu.
    window.GameOptions.registerOption('battleMusicName', () => T('MusicSelection.battleMusic'),
      () => ConfigManager.battleMusicName,
      function(value) { ConfigManager.battleMusicName = value; ConfigManager.save(); },
      'audio', 'custom',
      function(value) { return this.battleMusicStatusText(); },
      function() { this.changeBattleMusic(1); },
      function() { this.changeBattleMusic(-1); }
    );
    window.GameOptions.registerOption('battleMusicRandom', () => T('MusicSelection.randomBattleMusic'),
      () => ConfigManager.battleMusicRandom,
      function(value) { ConfigManager.battleMusicRandom = value; ConfigManager.save(); },
      'audio', 'boolean'
    );
    // Turning the switch on removes the track row outright, so the list has to
    // be rebuilt rather than repainted.
    window.GameOptions.markRebuildsList('battleMusicRandom');
    window.GameOptions.setVisibility('battleMusicName', () => !ConfigManager.battleMusicRandom);
  } else {
    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function () {
      _Window_Options_addGeneralOptions.call(this);
      this.addCommand(T('MusicSelection.battleMusic'), "battleMusicName");
    };

    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function (index) {
      const symbol = this.commandSymbol(index);
      if (symbol === "battleMusicName") return this.battleMusicStatusText();
      return _Window_Options_statusText.call(this, index);
    };

    const _Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function () {
      const symbol = this.commandSymbol(this.index());
      if (symbol === "battleMusicName") { this.changeBattleMusic(); }
      else { _Window_Options_processOk.call(this); }
    };
  }

  Window_Options.prototype.battleMusicStatusText = function () {
    const track = MUSIC_TRACKS.find(t => t.value === ConfigManager.battleMusicName);
    const fallback = MUSIC_TRACKS.find(t => t.value === MUSIC_DEFAULT);
    return track ? track.name : (fallback ? fallback.name : MUSIC_DEFAULT);
  };

  // Step the selection one entry either way. A stored value that is no longer in
  // the list (a custom file the player deleted) reads as index -1, which would
  // step to the second entry going forwards and the second-to-last going back,
  // so it is pinned to the head of the list first.
  Window_Options.prototype.changeBattleMusic = function (dir) {
    const step = dir === -1 ? -1 : 1;
    let currentIndex = MUSIC_TRACKS.findIndex(t => t.value === ConfigManager.battleMusicName);
    if (currentIndex < 0) currentIndex = 0;
    const next = MUSIC_TRACKS[(currentIndex + step + MUSIC_TRACKS.length) % MUSIC_TRACKS.length];
    ConfigManager.battleMusicName = next.value;
    ConfigManager.save();
    previewTrackValue(next.value, 60);
    this.redrawItem(this.findSymbol("battleMusicName"));
    this.playCursorSound();
  };

  // Public API for MusicSelectionSystemUI.js and CharacterCreation.js
  window.MusicSelectionSystem = {
    MUSIC_TRACKS, MUSIC_NONE, MUSIC_MAP, MUSIC_RANDOM, MUSIC_DEFAULT,
    getLocalizedText, scanCustomTracks,
    playableTracks, resolveBattleBgmName, rollRandomTrack, previewTrackValue
  };
})();