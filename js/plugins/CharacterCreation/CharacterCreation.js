/*:
 * @target MZ
 * @plugindesc Character creation flow orchestrator with step-by-step wizard UI
 * @author Omni-Lex
 * @orderAfter CharacterCreationShared
 * @orderAfter StartingEquipment
 * @orderAfter CharacterPresets
 * @orderAfter ClassSelection
 * @orderAfter TraitSelector
 * @orderAfter Health_Core
 * @command characterCreation
 * @text Character Creation
 * @desc Starts the character creation sequence
 *
 * @command repriseCreation
 * @text Reprise Creation
 * @desc Resumes character creation from class selection step
 *
 * @command repriseCreationCreature
 * @text Reprise Creation Creature
 * @desc Resumes character creation from gender selection (for creatures)
 *
 * @command repriseTraitSelection
 * @text Reprise Trait Selection
 * @desc Opens the trait selector for re-selecting traits
 *
 * @arg actorId
 * @text Actor ID
 * @desc The ID of the actor to select traits for
 * @type actor
 * @default 1
 *
 * @help
 * This plugin orchestrates the entire character creation flow.
 */

(() => {
  const pluginName = "CharacterCreation";
  // Where a party starts - its staples, its money, its origin loadout and the
  // placement each origin performs - lives in CharacterCreationOrigins.js,
  // which loads first. Pulled in by name so the call sites below read exactly
  // as they did while all of it sat in this file.
  const {
    giveStartingSupplies,
    CC_BASE_START_GOLD,
    classStartingMoney,
    selectedTraitObjects,
    selectedTraitIds,
    traitStartingMoney,
    wealthStartingMoney,
    scenarioGoldBonus,
    giveStartingMoney,
    proceduralMapId,
    startOnProceduralSquare,
    startVehicleOrigin,
    startCriminalOrigin,
    startCEOOrigin,
    startBikeOrigin,
    CRAFTING_SPEC_IDS,
    startEmptyLotOrigin,
    startStrandedOrigin,
    anchorAtSpaceCenter,
    startsAtOmegaTower,
    startAtOmegaTower,
    startWorldMapPickerOrigin,
    startMayorOrigin,
    captureOriginSnapshot,
    clearOriginSnapshot,
    reopenOriginStep,
    ORIGIN_LOADOUTS,
    loadoutEntryData,
    ARCANIST_SKILLS_PER_MEMBER,
    LOST_CONVOKER_SKILLS_PER_MEMBER,
    originRoll,
    hypernetPartCount,
    plagueVialCount,
    resetOriginRoll,
    resolveOriginLoadout,
    grantOriginLoadout,
    cullStartingOverload,
    plannedStartingEuros,
    AUGMENTED_ORIGIN_MIN,
    AUGMENTED_ORIGIN_MAX,
    CARD_ORIGIN_CARDS,
    grantMinimumCards,
    grantStartingCards,
    grantStartingAugments,
    startArcanistOrigin,
    startMercenaryOrigin,
    startLostConvokerOrigin,
    startHypernetExplorerOrigin,
    startDungeonOrigin,
    startDiplomatOrigin,
    bunkerGoldPiles,
    startBunkerOrigin,
    startArtifactHeirOrigin,
    startCrashLandedOrigin,
    startWarlordOrigin,
    finishFactionOrigin,
    startFactionPickerOrigin,
  } = window.CCOrigins;

  // Curated, non-blank IconSet indices for the settings-row icons. Mirrors the
  // pool used by the parchment options menu (GameOptions.js) so the initial
  // settings list reads exactly like Scene_Options' left page.
  const SETTINGS_ICON_POOL = [
    64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
    80, 81, 82, 83, 84, 87, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105,
    160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 176, 177, 178, 179,
    208, 209, 210, 211, 212, 213, 214, 215, 311, 312, 313
  ];
  // The cog the Settings tab wears. IconSet has no dedicated gear, so the
  // stone wheel (the one round, toothed glyph in the sheet) stands in for one.
  const SETTINGS_TAB_ICON = 83;

  // Stable hash -> a consistent icon for a given setting key.
  const pickSettingIcon = (key) => {
    let h = 0;
    const s = String(key);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return SETTINGS_ICON_POOL[h % SETTINGS_ICON_POOL.length];
  };

  // Robust i18n resolver with safe fallback that never leaks raw keys
  function ccT(key, fallback) {
    if (typeof T === 'function') {
      try {
        if (T.has && T.has(key)) {
          const res = T(key);
          if (typeof res === 'string' && res.trim() && res !== key) return res;
        }
      } catch (e) {}
    }
    return fallback != null ? fallback : key;
  }

  // The same, for a line that names numbers. ccT cannot carry parameters, and
  // a readout that prints two blood concentrations needs them.
  function ccTp(key, params, fallback) {
    if (typeof T === 'function') {
      try {
        if (T.has && T.has(key)) {
          const res = T(key, params);
          if (typeof res === 'string' && res.trim() && res !== key) return res;
        }
      } catch (e) {}
    }
    return fallback != null ? fallback : key;
  }

  // The attribute abbreviations every stat box is labelled with. They live in
  // js/i18n/<lang>/stats.json, which sits outside what window.T covers, so
  // CharacterCreationShared reads that bank and this is the guarded way in:
  // English stands in where the shared plugin has not loaded.
  const CC_STAT_FALLBACK = {
    HP: "HP", MP: "MP", AP: "AP", STR: "STR", CON: "CON",
    INT: "INT", WIS: "WIS", DEX: "DEX", PSI: "PSI"
  };
  function ccStatLabels() {
    return (typeof window.CCStatLabels === 'function') ? window.CCStatLabels() : CC_STAT_FALLBACK;
  }
  function ccStatLabel(abbr) {
    if (typeof window.CCStatLabel === 'function') return window.CCStatLabel(abbr);
    return CC_STAT_FALLBACK[String(abbr || '').toUpperCase()] || abbr;
  }

  // A localized list, with an English one to fall back on where the namespace
  // is not loaded (a harness, a stripped build).
  function ccList(key, fallback) {
    try {
      if (typeof T === 'function' && T.list) {
        const list = T.list(key);
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (e) {}
    return fallback || [];
  }

  // ==========================================================================
  // The body a character is built with
  // ==========================================================================
  // Two answers the Bio tab asks for and nothing else in the wizard does: the
  // reproductive organs the character starts with, and where their body sits
  // between an oestrogenic and an androgenic endocrine balance.
  //
  // They are asked SEPARATELY from gender on purpose. Picking male or female
  // still defaults the organs to testes or a uterus, because that is the body
  // those words usually come with and a default is what the player expects to
  // find already filled in; picking non-binary or cocoon defaults nothing at
  // all and leaves whatever is there. Either way the selector below is the
  // final word: the gender pick writes a default into it, and the player may
  // move it straight off again.
  const CC_REPRODUCTION_FALLBACK = {
    NONE: -1, TESTICLES: 0, UTERUS: 1, OVIPAROUS: 2, PLANT: 3, MITOSIS: 4
  };
  function ccReproTypes() {
    const CCU = window.CharacterCreationUtils;
    return (CCU && CCU.REPRODUCTION_TYPES) || CC_REPRODUCTION_FALLBACK;
  }
  // The five organ labels are the biologic panel's own (js/i18n/*/plugins/
  // Biologic.json), so the sheet, the register and this selector all call a
  // uterus the same thing.
  function ccReproLabels() {
    return ccList('Biologic.reproductionType', [
      "Testicles", "Uterus", "Oviduct",
      "Sporangium", "Mitotic Gland"
    ]);
  }
  function ccReproChoices() {
    const R = ccReproTypes();
    const labels = ccReproLabels();
    // A bank that answers with a short list (an unfinished locale, a bank that
    // did not load) used to print a chip labelled "undefined" rather than
    // simply falling back to English for the entries it is missing.
    const label = (i, fallback) => labels[i] || fallback;
    return [
      { val: R.TESTICLES, label: label(0, "Testicles") },
      { val: R.UTERUS, label: label(1, "Uterus") },
      { val: R.OVIPAROUS, label: label(2, "Oviduct") },
      { val: R.PLANT, label: label(3, "Sporangium") },
      { val: R.MITOSIS, label: label(4, "Mitotic Gland") },
      { val: R.NONE, label: ccT('CharCreate.reproNone', "Sterile") }
    ];
  }
  // Where a body sits reads as a phrase rather than as a number: "leaning
  // androgenic" is what the slider is actually saying.
  function ccHormoneLean(balance) {
    const bands = ccList('CharCreate.hormoneLean', [
      "Strongly oestrogenic", "Oestrogenic", "Evenly balanced",
      "Androgenic", "Strongly androgenic"
    ]);
    const index = balance < 15 ? 0 : balance < 35 ? 1 : balance < 65 ? 2 : balance < 85 ? 3 : 4;
    return bands[index] || bands[bands.length - 1] || "";
  }

  // ==========================================================================
  // What the naming step carries besides its screens
  // ==========================================================================
  // Common event 97 opened the name and sprite screens, and did three other
  // things on the way past. They are done here now, in the same order the event
  // did them, so removing the event changed nothing about what a new character
  // starts with.
  const CREATION_PAGE_TURN_SE = { name: "PixelUI/PixelUI (1)", volume: 90, pitch: 100, pan: 0 };
  const CREATION_START_GOLD = 2000; // per humanoid member, as the event gave it
  const SWITCH_CREATION_NAMED = 12;
  // The Markov call the event made, argument for argument. Plugin commands are
  // registered under the bare file name (Utils.extractFileName), which is why
  // this says MarkovTextGenerator where the event said UI/MarkovTextGenerator.
  const CREATION_NAME_MARKOV = {
    plugin: "MarkovTextGenerator",
    command: "generateName",
    args: {
      databaseId: "names", chainOrder: "2", minChars: "4", maxChars: "12",
      useWordMode: "false", variableId: "4", displayInMessage: "false",
    },
  };

  // Open one queued sub-screen for `actorId`. False when its scene is missing,
  // so the queue can move on rather than strand the wizard.
  function openCreationSubScreen(screen, actorId) {
    if (screen === "sprite") {
      if (!window.Scene_SpriteGridSelector) return false;
      SceneManager.push(window.Scene_SpriteGridSelector);
      if (SceneManager._nextScene && SceneManager._nextScene.setActor) {
        SceneManager._nextScene.setActor(actorId);
      }
      return true;
    }
    return false;
  }

  // Em's dossier grows restless if it sits unpicked on the preset board: ten
  // seconds in she starts heckling from inside her own card, then again every
  // few seconds until she is picked or the board closes. It borrows
  // NPCConversation's speech-bubble look (the "npc-thought-bubble" class)
  // outright so it reads exactly like the town's bubbles, but anchors on her
  // card's own screen rect instead of a map event: the preset board is DOM
  // already, so there is no projection math to do, and no NPCBubbleLayout
  // arbiter is needed since only one of these can ever be on screen.
  const EM_RESTLESS_DELAY_MS = 10000;
  const EM_RESTLESS_INTERVAL_MS = 6000;
  const EM_RESTLESS_DISPLAY_MS = 4000;
  const EM_RESTLESS_FADE_MS = 350;
  window.EmRestlessBubble = window.EmRestlessBubble || {
    _el: null,
    _card: null,
    _hideAt: 0,
    _fadeAt: 0,

    _element() {
      if (this._el) return this._el;
      const el = document.createElement("div");
      el.className = "npc-thought-bubble";
      document.body.appendChild(el);
      this._el = el;
      return el;
    },

    show(card, text) {
      if (!card || !text) return;
      const el = this._element();
      el.textContent = text;
      el.classList.remove("fading");
      window.CCPanel.show(el);
      void el.offsetWidth; // restart the transition on a recycled element
      el.classList.add("visible");
      this._card = card;
      this._hideAt = Date.now() + EM_RESTLESS_DISPLAY_MS;
      this._fadeAt = 0;
      this._reposition();
    },

    // Card sits in a scrollable board, so its screen rect is re-read every
    // frame rather than cached once at show() time.
    _reposition() {
      if (!this._card || !this._el) return;
      const rect = this._card.getBoundingClientRect();
      const h = this._el.offsetHeight || 0;
      window.CCPanel.placeAt(this._el, rect.left + rect.width / 2, rect.top - h - 14);
    },

    update() {
      if (!this._el || window.CCPanel.isHidden(this._el)) return;
      const now = Date.now();
      if (this._fadeAt) {
        if (now >= this._fadeAt) this.release();
        return;
      }
      if (now >= this._hideAt) {
        this._el.classList.remove("visible");
        this._el.classList.add("fading");
        this._fadeAt = now + EM_RESTLESS_FADE_MS;
        return;
      }
      this._reposition();
    },

    release() {
      if (!this._el) return;
      this._el.classList.remove("visible", "fading");
      window.CCPanel.hide(this._el);
      this._card = null;
      this._hideAt = 0;
      this._fadeAt = 0;
    },
  };

  // Import dependencies from other plugins
  const {
    getLocalizedChoice,
    applyGenderAndReproduction,
    applyRandomGender,
    getGenderChoices,
    applyTraitsToActor,
    VAR_PLAYER1_GENDER,
    VAR_PLAYER2_GENDER,
    VAR_PLAYER3_GENDER,
    VAR_PLAYER1_REPRODUCTIVE_TYPE,
    VAR_PLAYER2_REPRODUCTIVE_TYPE,
    VAR_PLAYER3_REPRODUCTIVE_TYPE
  } = window.CharacterCreationUtils || {};
  // The shared Back / extras / Continue bar (CharacterCreationShared.js).
  const CCButtons = window.CCButtons;
  const { equipRandomCompatibleWeapon, equipClassStartingArmor, GLOBAL_STARTER_SKILLS, applyStartingGear, getClassStartingItems, giveClassStartingItems } = window.StartingEquipment || {};
  const { getCharacterPresets, getAvailableCharacterPresets, markPresetUsed, unmarkPresetUsed, getPresetLore, getPresetHometown, getPresetSkins, getPresetSkin, getPresetSkinLabel, markStepCompleted, isStepCompleted, hasCompletedFirstCreation, Window_CharacterPresets, getEmRestlessLine } = window.CharacterPresets || {};
  // Which button leafs through a dossier's looks, named on a chip under the
  // thumbnail row: the shoulder buttons when a pad is plugged in, TAB
  // otherwise. A pad can be plugged in (or its battery die) while the board is
  // open, so the chip is kept in step rather than only stamped once.
  function skinKeyPadOn() {
    const pad = window.AnalogStickInput;
    return !!(pad && typeof pad.hasPad === "function" && pad.hasPad());
  }
  // i18n-ignore-start: physical controller / keyboard button ids
  function skinKeyLabel() { return skinKeyPadOn() ? "L1 R1" : "TAB"; }
  // i18n-ignore-end

  // Alternate looks a dossier can be played as. Falls back to the dossier's own
  // sprite and bust when the presets plugin is an older build without skins.
  function presetSkins(preset) {
    if (typeof getPresetSkins === "function") return getPresetSkins(preset);
    return preset
      ? [{ key: "", sprite: preset.sprite, spriteIndex: preset.spriteIndex || 0, busts: preset.busts }]
      : [];
  }
  // What a look is called on its thumbnail ("Statesman", "Arcane", "Pontiff").
  // A dossier with only its own look has no label to print, and none is needed:
  // the row is not drawn at all in that case.
  function presetSkinLabel(skinData) {
    if (typeof getPresetSkinLabel === "function") return getPresetSkinLabel(skinData) || "";
    return "";
  }
  // Presets still free in this world (each pre-made character can be played
  // only once per world). Falls back to the full list if the presets plugin is
  // an older build without the per-world API.
  function availablePresets() {
    if (typeof getAvailableCharacterPresets === "function") return getAvailableCharacterPresets();
    return typeof getCharacterPresets === "function" ? getCharacterPresets() : [];
  }
  // The story mode is a streamlined single-character flow that must build a
  // character from scratch, so pre-made dossiers are never offered there. The
  // in-scene flag is cleared at the add-member step, hence the switch 100
  // fallback (same guard the origin step uses).
  function isStoryModeFlow() {
    if (typeof Scene_CharacterCreation !== "undefined" && Scene_CharacterCreation._storyMode) return true;
    return !!($gameSwitches && $gameSwitches.value(100));
  }
  // Detailed creation mode lives in CharacterCreationFull.js: the whole
  // character sheet is edited inside the Empathize panel instead of being
  // walked step by step. The option only exists while that plugin is loaded,
  // and unlike the other modes it is offered during the story mode too.
  function detailedModeAvailable() {
    const full = window.CharacterCreationFull;
    return !!(full && full.isAvailable && full.isAvailable());
  }
  const _markFirstCreationComplete = (window.CharacterPresets || {}).markFirstCreationComplete;
  // Every creation-finished path calls this; besides the original bookkeeping
  // it schedules the new-playthrough autosave (SaveSystem assigns the next
  // free slot and saves once the map has loaded).
  function markFirstCreationComplete() {
    if (_markFirstCreationComplete) _markFirstCreationComplete();
    // The world decides what level its people are made at, and it has to be
    // settled before the gear is dealt so a level 40 party is not kitted out
    // for a level 1 one.
    applyWorldStartingLevel();
    giveStartingSupplies();
    giveStartingMoney();
    // Every member finishes fully equipped: fill any empty equip slot with a
    // random low-stat compatible piece (weapon + every armor slot). Preset and
    // class-chosen gear already in a slot is left untouched. Idempotent, so it
    // is safe to run on each of the (idempotent) completion paths.
    //
    // It lives in the roster module, which loads after this one, so it is
    // looked up when the moment comes rather than held. Calling it by bare name
    // threw a ReferenceError that took every finish path down with it: the last
    // button of creation did nothing at all, whichever button that was.
    const fillGear = window.CharacterCreationParty &&
      window.CharacterCreationParty.fillPartyStartingEquipment;
    if (fillGear) fillGear();
    else console.warn("CharacterCreation: roster module not loaded; empty equip slots left empty.");
    if (window.SaveSystem && window.SaveSystem.scheduleNewPlaythroughSave) {
      window.SaveSystem.scheduleNewPlaythroughSave();
    }
  }

  // --- The world's starting level ----------------------------------------
  // A world is created with the level its people are built at (world.json →
  // startLevel, set on the creation form). Every member the wizard finishes is
  // raised to it, class skills and all: a world begun in a later year opens on
  // monsters no level 1 party can stand in front of, and this is what makes
  // those years playable. Never lowers anybody, so a pre-made dossier keeps
  // whatever rank it was written at when that is the higher of the two, and a
  // world that never touched the option (or an older world) answers 1 and this
  // does nothing at all.
  function applyWorldStartingLevel() {
    // The story mode is the one run that always starts at the bottom: it teaches
    // the game, so its Em is level 1 whatever level the world builds its people
    // at.
    if (isStoryModeFlow()) return;
    const WM = window.WorldManager;
    const level = (WM && WM.startingLevel) ? WM.startingLevel() : 1;
    if (!(level > 1)) return;
    $gameParty.allMembers().forEach((actor) => {
      if (!actor || actor.level >= level) return;
      // `true` shows the level-up log; the party is standing in a menu, so it
      // is passed as false and the skills are learned silently.
      actor.changeLevel(Math.min(99, level), false);
    });
  }


  const { Scene_ClassSelection } = window.ClassSelection || {};

  // --- Trait i18n resolution ---------------------------------------------
  // Trait names are stored as i18n key paths (e.g. "traits.monk-trained.name").
  // Resolve them against the active-language trait bank, falling back to the
  // English bank whenever the localized entry is missing or empty.
  let _traitI18nData = null;   // active language
  let _traitI18nDataEn = null; // english fallback

  const resolveI18nPath = (path, obj) => {
    if (!path || !obj) return null;
    return path.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), obj);
  };

  const loadTraitI18nData = async () => {
    const lang = ConfigManager.language || "en";
    const fetchBank = async (l) => {
      try {
        const response = await fetch(`js/i18n/${l}/traits.json`);
        return await response.json();
      } catch (e) {
        console.error("CharacterCreation: Failed to load trait i18n from js/i18n/" + l + "/traits.json", e);
        return null;
      }
    };
    _traitI18nData = await fetchBank(lang);
    _traitI18nDataEn = lang === "en" ? _traitI18nData : await fetchBank("en");
  };
  loadTraitI18nData();

  // Resolve a single trait name value to its display string.
  const resolveTraitName = (name, traitId) => {
    if (!name && !traitId) return null;
    if (typeof name === "object" && name !== null) {
      // A trait record that still carries its own pair rather than a key.
      const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || (typeof T !== 'undefined' && T.language ? T.language() : "en");
      return lang === "it" ? (name.it || name.en) : name.en;
    }
    const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || (typeof T !== 'undefined' && T.language ? T.language() : "en");
    const bank = (lang === "it" ? _traitI18nData : _traitI18nDataEn) || _traitI18nData;
    const key = String(traitId || name || "").toLowerCase().replace(/[-\s]/g, "_");
    if (bank && bank.traits && bank.traits[key] && bank.traits[key].name) {
      return bank.traits[key].name;
    }
    if (typeof name === "string" && name.includes(".")) {
      const localized = resolveI18nPath(name, _traitI18nData);
      if (localized) return localized;
      const english = resolveI18nPath(name, _traitI18nDataEn);
      if (english) return english;
    }
    return name || traitId;
  };

  // Resolve a single trait description value to its display string.
  const resolveTraitDesc = (desc, traitId) => {
    if (typeof desc === "object" && desc !== null) {
      const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || (typeof T !== 'undefined' && T.language ? T.language() : "en");
      return lang === "it" ? (desc.it || desc.en) : desc.en;
    }
    const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || (typeof T !== 'undefined' && T.language ? T.language() : "en");
    const bank = (lang === "it" ? _traitI18nData : _traitI18nDataEn) || _traitI18nData;
    const key = String(traitId || "").toLowerCase().replace(/[-\s]/g, "_");
    if (bank && bank.traits && bank.traits[key] && bank.traits[key].description) {
      return bank.traits[key].description;
    }
    if (typeof desc === "string" && desc.includes(".")) {
      const localized = resolveI18nPath(desc, _traitI18nData);
      if (localized) return localized;
      const english = resolveI18nPath(desc, _traitI18nDataEn);
      if (english) return english;
    }
    return desc || "";
  };

  // The wizard's own theme. Started once (settings page) and never restarted:
  // every later request goes through AudioManager.playBgm, which leaves the
  // track playing when it is already this one.
  // i18n-ignore-next-line: bgm file name
  const CREATION_BGM = "KevinMacLeod/Jazz/Cool Vibes";

  // Music tracks for the initial settings step (values must match MusicSelectionSystem.js)
  // i18n-ignore-start: bgm file names. Only the first three carry a label of
  // their own (CharCreate.musicTrack); the rest are shown as the file is named.
  const CC_MUSIC_TRACK_FILES = [
    "RandomMind/Battle", "ZaneMusic/shortcuts", "Moogify/MelodicTechno",
    "Battle1", "Battle2", "Battle3", "Battle4",
    "Battle5", "Battle6", "Battle7", "Battle8",
  ];
  // i18n-ignore-end
  // Built per call, not once: the label has to follow a language change.
  function ccMusicTracks() {
    return CC_MUSIC_TRACK_FILES.map((value) => {
      const key = 'CharCreate.musicTrack.' + value.split('/').pop();
      return { name: T.has(key) ? T(key) : value.split('/').pop(), value: value };
    });
  }

  // CC_MUSIC_TRACKS plus any player tracks dropped into audio/bgm/BattleMusic,
  // led by the Random entry so a pick made in the options menu still reads back
  // here instead of silently showing the first track.
  // Resolved at runtime since MusicSelectionSystem.js loads after this plugin.
  function getCCMusicTracks() {
    const mss = window.MusicSelectionSystem;
    const custom = (mss && mss.scanCustomTracks) ? mss.scanCustomTracks() : [];
    const random = (mss && mss.MUSIC_RANDOM)
      ? [{ name: T('MusicSelection.trackRandom'), value: mss.MUSIC_RANDOM }]
      : [];
    return random.concat(ccMusicTracks(), custom);
  }

  // No origin begins inside a vehicle any more: the camper and the car are
  // parked out in the world with the party standing beside them (see
  // startVehicleOrigin), so their interiors are somewhere to climb into rather
  // than somewhere to wake up. Nor does any origin end on world map 315 - the
  // ones that begin "somewhere in the world" begin on the ground of that
  // somewhere (startOnProceduralSquare). The space origin is the one exception
  // to both, and it is not on Earth at all.

  // Full creation mode is disabled for now: the "Full" choice is hidden from the
  // creationMode step and every flow behaves as Normal (so the Full-only flavor
  // steps, hometown and birthdate, never come up). Flip this back to true to
  // restore the mode; nothing else needs changing.
  const FULL_CREATION_MODE_ENABLED = false;

  // --- Creation modes ------------------------------------------------------
  // How much of the wizard a party walks through. The value is persisted on
  // $gameSystem._ccCreationMode, since the mode step is asked once per party
  // and every later member has to be built the same way.
  //
  //   QUICK     three questions , name, sprite, class , and nothing else.
  //             Gender and body archetype are read off the chosen sprite's
  //             NPCs.json record, the bust is the one that sprite comes with
  //             (never browsed), traits are rolled. A creature is asked for its
  //             archetype(s), its monster sprite and its class, and wears the
  //             3D look that belongs to that sprite.
  //   NORMAL    the wizard's ordinary per-character flow. This is the mode
  //             that used to be called Quick.
  //   FULL      the detailed life sim (FULL_CREATION_MODE_ENABLED).
  //   DETAILED  the Empathize dossier editor (CharacterCreationFull.js).
  const CC_MODE = {
    QUICK: "quick",
    NORMAL: "normal",
    FULL: "full",
    DETAILED: "detailed",
  };

  // Saves written before the fast Quick mode existed stored the (then only)
  // board flow under the name "quick"; that flow is called Normal now. The
  // stamp below is written beside every mode chosen since, so an old save is
  // read as Normal rather than silently switching to the three-question wizard.
  const CC_MODE_STAMP = 2;

  function storedCreationMode() {
    if (!$gameSystem || !$gameSystem._ccCreationMode) return null;
    const mode = $gameSystem._ccCreationMode;
    if (mode === CC_MODE.QUICK && $gameSystem._ccCreationModeStamp !== CC_MODE_STAMP) {
      return CC_MODE.NORMAL;
    }
    return mode;
  }

  function setCreationMode(mode) {
    Scene_CharacterCreation._creationMode = mode;
    $gameSystem._ccCreationMode = mode;
    $gameSystem._ccCreationModeStamp = CC_MODE_STAMP;
  }


  // --- Inline class list helpers ------------------------------------------
  // Specialization points a member is given to spend during creation. One
  // number, read by the board, by the +/- buttons and by the summary, so a
  // budget change cannot leave the three disagreeing.
  const CC_SPEC_BUDGET = 12;

  // The board's own tab, sitting in front of the categories: the ones this
  // member already stands above Untrained in, bought or granted. It is an id,
  // not a label, so it never collides with a Specialization.json category.
  const SPEC_TAB_CURRENT = "Current";

  // ── Creature archetypes ─────────────────────────────────────────────────
  // Two namespaces name the same creatures: Health/Archetypes.json spells them
  // in CamelCase ("Crustacean") and is the ONLY vocabulary the body-part merge
  // understands, while Battler3D registers its structures in lowercase
  // ("crustacean"). A key coming back out of a 3D picker is therefore useless
  // to the health side until it is spelled the health side's way, which is what
  // this does. Anything with no Archetypes.json entry answers null, so a caller
  // can tell "no such archetype" from "spelled differently".
  function healthArchetypeKey(key) {
    const table = (window.Health && window.Health.Archetypes) || null;
    if (!key || !table) return null;
    const raw = String(key);
    if (table[raw]) return raw;
    const lower = raw.toLowerCase();
    for (const k in table) {
      if (k.toLowerCase() === lower) return k;
    }
    return null;
  }

  // The body a creature falls back to when nothing has said what it is. Goblin
  // used to stand here; a goblin is a humanoid wearing a goblin's face now, so
  // the fallback is the plainest creature there is instead.
  const DEFAULT_CREATURE_ARCHETYPE = "Beast"; // i18n-ignore: Archetypes.json key

  // Every archetype a creature can be built from, sorted by the name it shows
  // under, so every picker that lists them reads alphabetically.
  function creatureArchetypeKeys() {
    const table = (window.Health && window.Health.Archetypes) || null;
    if (!table) return [];
    return Object.keys(table).sort((a, b) =>
      archetypeDisplayName(a).localeCompare(archetypeDisplayName(b))
    );
  }

  // What an archetype is called on screen. The names live in
  // js/i18n/<lang>/enemyArchetypes.json, keyed by the lowercased archetype, and
  // are read through the same service the health menu and the creature builder
  // use, so all three agree.
  function archetypeDisplayName(key) {
    if (!key) return "";
    if (typeof window.getArchetypeText === "function") {
      const name = window.getArchetypeText(`enemyArchetypes.${String(key).toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */;
      if (name) return name;
    }
    return String(key);
  }

  // The archetypes a member is built from, primary first, always in health
  // spelling. A body may be spliced from two of them; the second one is
  // optional and never repeats the first.
  function actorArchetypeKeys(actor) {
    if (!actor) return [];
    const raw = (actor._creatureArchetypes && actor._creatureArchetypes.length)
      ? actor._creatureArchetypes
      : [actor._currentArchetype];
    const keys = [];
    for (const key of raw) {
      const canonical = healthArchetypeKey(key);
      if (canonical && !keys.includes(canonical)) keys.push(canonical);
    }
    return keys.slice(0, 2);
  }

  function actorArchetypeKey(actor) {
    return actorArchetypeKeys(actor)[0] || null;
  }

  function actorSecondaryArchetypeKey(actor) {
    return actorArchetypeKeys(actor)[1] || null;
  }

  // Put a body on a member: the health spellings are stored (so the body parts
  // merge), the anatomy is rebuilt from the pair, and the 3D config with it.
  // False when nothing in the list names an archetype at all, so a caller can
  // leave the member as it was rather than blanking it.
  function applyArchetypesToActor(actor, keys) {
    if (!actor) return false;
    const canonical = [];
    for (const key of keys || []) {
      const one = healthArchetypeKey(key);
      if (one && !canonical.includes(one)) canonical.push(one);
    }
    if (!canonical.length) return false;
    actor._creatureArchetypes = canonical;
    actor._currentArchetype = canonical[0];
    // The 3D model is settled BEFORE the body, because the model is where the
    // body's grafted parts come from. A primary that changed opens the sculptor
    // on a monster of the new kind; a changed second half only adds or swaps
    // the limbs it brought, leaving anything sculpted by hand alone.
    const CC3D = window.CC3DModel;
    if (CC3D && CC3D.applyArchetypesToConfig && CC3D.setConfig) {
      const cfg = CC3D.applyArchetypesToConfig(CC3D.getConfig(actor.actorId()), canonical);
      if (cfg) {
        CC3D.setConfig(actor.actorId(), cfg);
        // What the model wears IS what the body is made of, so the graft record
        // is rewritten from the model every time either of them moves.
        if (CC3D.graftedParts) {
          const grafts = CC3D.graftedParts(cfg, canonical);
          actor._ccGraftedParts = Object.keys(grafts.parts).length ? grafts.parts : null;
          actor._ccReplacedParts = grafts.replaced.length ? grafts.replaced : null;
        }
      }
    }
    // The anatomy is rebuilt, not merely merged: a member who already had a
    // body kept the old one, so swapping archetype changed the name on the tab
    // and nothing else.
    actor._bodyParts = null;
    if (typeof window.initializeBodyParts === "function") {
      window.initializeBodyParts(actor);
    } else if (window.HealthCore && window.HealthCore.mergeArchetypeParts) {
      window.HealthCore.mergeArchetypeParts(canonical);
    }
    return true;
  }

  // The primary alone, keeping whatever second archetype the member carries
  // (unless the new primary IS that one, in which case the pair collapses).
  function applyArchetypeToActor(actor, key) {
    // A primary the data does not know is refused outright: without this the
    // pair collapsed onto the secondary and a spelling mistake silently
    // promoted the member's second half to being the whole of it.
    if (!healthArchetypeKey(key)) return false;
    return applyArchetypesToActor(actor, [key, actorSecondaryArchetypeKey(actor)]);
  }

  // Shared so the sprite board can settle a member's body from the sheet they
  // were given (CharacterCreationShared.applyIdentityFromSprite): one call puts
  // the archetype on, rebuilds the anatomy and regenerates the 3D model.
  window.applyArchetypesToActor = applyArchetypesToActor;

  // A creature is never left without a body to be drawn as: the moment a member
  // becomes one it is given the model its archetype implies (the kind it
  // already carries, or the first archetype there is), so the sculptor opens on
  // a real monster and every panel has a model to show instead of a bust.
  function ensureCreatureModel(actor) {
    if (!actor) return false;
    const CC3D = window.CC3DModel;
    const hasConfig = !!(CC3D && CC3D.getConfig && CC3D.getConfig(actor.actorId()));
    const primary = actorArchetypeKey(actor);
    if (hasConfig && primary) return true;
    const key = primary || healthArchetypeKey(DEFAULT_CREATURE_ARCHETYPE) || creatureArchetypeKeys()[0];
    if (!key) return false;
    return applyArchetypesToActor(actor, [key, actorSecondaryArchetypeKey(actor)]);
  }

  // The second half of a spliced body. An empty key drops it and leaves the
  // member built from its primary alone. A person carries no archetype of its
  // own until something asks (a new actor's body is Humanoid by default), so
  // the primary a non-creature is spliced onto is Humanoid.
  function applySecondaryArchetypeToActor(actor, key) {
    const primary = actorArchetypeKey(actor) ||
      (actor && actor._isCreatureActor ? null : "Humanoid"); // i18n-ignore: Archetypes.json key
    if (!primary) return false;
    if (!key) return applyArchetypesToActor(actor, [primary]);
    return applyArchetypesToActor(actor, [primary, key]);
  }

  // The whole sentient roster, which is what the board modes' class step lists.
  // A person is built from ids 1-62 alone; the creature classes above them
  // belong to the creature branch, dealt out of the archetype's own
  // creatureClasses list.
  //
  // Memoized: $dataClasses is stable after load and the class-step picker asks
  // for the list on every cursor move (the right-page details), which used to
  // re-filter the whole class table on each keypress.
  // Keyed on the world's magic level too (window.CreatureClasses.sentientRoster
  // filters by it), so switching into a differently-natured world within the
  // same session does not keep serving the first world's cached roster.
  let _sentientClassCache = null;
  let _sentientClassCacheKey = null;
  function getSentientClassList() {
    const key = (window.MagicNature && window.MagicNature.level()) || "normal";
    if (_sentientClassCache && _sentientClassCacheKey === key) return _sentientClassCache;
    _sentientClassCacheKey = key;
    _sentientClassCache = window.CreatureClasses.sentientRoster()
      .map((id) => ({ id, name: $dataClasses[id].name }));
    return _sentientClassCache;
  }

  // Hometown choices for the Full-mode hometown step (asked right after
  // Origin): every location from js/db/WorkSystem/Destinations.json (loaded
  // as window.WorkSystem.Destinations), sorted alphabetically. Falls back to
  // a short Belgian list if the data is not loaded yet.
  function getHometownList() {
    const dest = window.WorkSystem && window.WorkSystem.Destinations;
    if (dest && typeof dest === "object") {
      const names = Object.keys(dest);
      if (names.length > 0) {
        return names.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" })
        );
      }
    }
    // i18n-ignore-start: place names
    return [
      "Ghent", "Antwerp", "Brussels", "Bruges",
      "Ostend", "Liege", "Charleroi",
    ];
    // i18n-ignore-end
  }

  // --- Personality --------------------------------------------------------
  // A character's disposition is one of the archetypes in
  // js/db/Health/PersonalityData.json, stored as an index on their NPC society
  // profile (personalityIndex). Everything downstream reads it from there: the
  // party's own banter (PartyBanter), the thoughts they think (NPCConversation),
  // the biologic sim's stress response and the Empathize dossier. Left alone,
  // the profile carries the one the society generator rolled from the name
  // seed, which is why the step can simply be skipped rather than randomized
  // when a mode does not ask.
  //
  // Whichever shape the file is in, and whichever loader got there first, the
  // same list PartyBanter reads (see personalityList there).
  function personalityCatalog() {
    const loader = window._NPCSocietyDataLoader;
    if (loader && Array.isArray(loader.personalities)) return loader.personalities;
    const data = window.Health && window.Health.PersonalityData;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
  }

  // The archetype's name / description in the active language. The English
  // `name` on the record is the personality's id (every by-name lookup in the
  // other plugins keys on it), so both are reached from it out of
  // js/i18n/<lang>/plugins/Personality.json.
  function _personalityKey(entry, field) {
    if (!entry || !entry.name) return "";
    return "Personality." + String(entry.name).toLowerCase().replace(/[^a-z0-9]/g, "") + "." + field;
  }

  function personalityLabel(entry) {
    if (!entry) return "";
    const key = _personalityKey(entry, "name");
    if (key && window.T && window.T.has(key)) return window.T(key);
    return window.CCDbName(entry.name || "");
  }

  function personalityDescription(entry) {
    if (!entry) return "";
    const key = _personalityKey(entry, "description");
    return (key && window.T && window.T.has(key)) ? window.T(key) : "";
  }

  // Writes the pick onto the member's society profile, minting one if this name
  // has none yet (the name is settled well before this step: it is typed on the
  // gender step's name screen). Silent when the NPC system is not loaded, the
  // same way the trait step is silent without TraitSelector.
  function applyPersonalityIndex(actorId, index) {
    const actor = $gameActors ? $gameActors.actor(actorId) : null;
    if (!actor || !actor.name() || !window.NPCSocietyRegistry) return;
    try {
      const cls = actor.currentClass();
      window.NPCSocietyRegistry.ensureProfile(actor.name(), cls ? cls.id : null);
      const profile = window.NPCSocietyRegistry.getProfile(actor.name());
      if (profile) profile.personalityIndex = index;
    } catch (e) {
      console.warn("CharacterCreation: could not set personality", e);
    }
  }

  const CharacterCreationData = [
    {
      // Initial Settings (options) - shown FIRST (includes difficulty, language, etc.).
      // Shown only once on the very first character creation.
      id: "settings",
      showOnlyOnce: true,
      isSettingsStep: true,
      get title() {
        return T('CharCreate.initialSettings');
      },
      get choices() {
        return [{ name: T('CharCreate.continue'), symbol: "confirm" }];
      },
      handler: function () {
        ConfigManager.save();
        markStepCompleted(STEP.SETTINGS);
        if (typeof STEP.DIFFICULTY !== 'undefined' && STEP.DIFFICULTY != null) {
          markStepCompleted(STEP.DIFFICULTY);
        }
        if ($gameSystem && $gameSystem._difficultyMode) {
          const mode = $gameSystem._difficultyMode;
          $gameSwitches.setValue(9, mode === "permadeath" || mode === "blood_and_oil");
          $gameSystem._bloodAndOilMode = (mode === "blood_and_oil");
          $gameSystem._peacefulMode = (mode === "peaceful");
          $gameSwitches.setValue(33, true);
        }
        // Finalization (markFirstCreationComplete) now happens at the end of
        // creation (origin step) instead of here, since settings is shown first.
        this.nextStep();
      },
    },
    {
      // Combat Mode - RPG / Map Battle / Monsters. Asked once per party
      // (showOnlyOnce); flips the per-save Monsters switch (46). That choice is
      // locked for the save because it is a $gameSwitch and the step never
      // reappears; Map Battle is a ConfigManager option (Options > Gameplay >
      // Map Battle), so picking it here just presets that toggle and it can
      // still be changed later.
      id: "combatMode",
      showOnlyOnce: true,
      get title() {
        return T('CharCreate.selectCombatMode');
      },
      get choices() {
        return [
          getLocalizedChoice(T('CharCreate.choice.combatRpg.name'), "combat_rpg", T('CharCreate.choice.combatRpg.desc')),
          getLocalizedChoice(T('CharCreate.choice.combatMap.name'), "combat_map", T('CharCreate.choice.combatMap.desc')),
          getLocalizedChoice(T('CharCreate.choice.combatMonsters.name'), "combat_monsters", T('CharCreate.choice.combatMonsters.desc')),
        ];
      },
      handler: function (symbol) {
        // RPG (default) leaves the switch off.
        $gameSwitches.setValue(46, symbol === "combat_monsters");
        // Map Battle is a global option rather than a save switch, so it is set
        // both ways here: picking another mode must also clear a Map Battle the
        // player had left on from a previous playthrough, otherwise "Classic
        // RPG" would still open fights on the map.
        ConfigManager.mapBattleMode = (symbol === "combat_map");
        ConfigManager.save();
        markStepCompleted(STEP.COMBAT_MODE);
        this.nextStep();
      },
    },
    {
      // Creation Mode. The page that asked for it (Quick / Normal / Detailed /
      // Use Existing Character) is gone: the mode is Normal unless the sheet's
      // own Simple / Detailed toggle says otherwise, and pre-made dossiers are
      // reached from the character-type pills. The step is kept as an always
      // skipped placeholder so the step layout and STEP.CREATION_MODE stay put.
      id: "creationMode",
      autoSkip: true,
      showOnlyOnce: true,
      get title() {
        return T('CharCreate.chooseCreationMode');
      },
      get choices() {
        return [];
      },
      handler: function () {
        markStepCompleted(STEP.CREATION_MODE);
        this.nextStep();
      },
    },
    {
      // World History, handled at world creation (see WorldManagerUI),
      // so this step is always skipped. Kept in place so the step layout
      // stays consistent.
      id: "worldHistory",
      autoSkip: true,
      get title() {
        return T('CharCreate.worldHistory');
      },
      showOnlyOnce: true,
      get choices() {
        return [];
      },
      handler: function () {
        markStepCompleted(STEP.WORLD_HISTORY);
        this.nextStep();
      },
    },
    {
      // Character Type Selection
      id: "characterType",
      get title() {
        return T('CharCreate.chooseCharacterType');
      },
      get choices() {
        const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;

        if (Scene_CharacterCreation._storyMode) {
          return [
            getLocalizedChoice(T('CharCreate.choice.newCharacter2.name'), "new_character", T('CharCreate.choice.newCharacter2.desc')),
            getLocalizedChoice(T('CharCreate.choice.createCreature2.name'), "create_creature", T('CharCreate.choice.createCreature2.desc'))
          ];
        }

        const allChoices = [
          getLocalizedChoice(T('CharCreate.choice.newCharacter.name'), "new_character", T('CharCreate.choice.newCharacter.desc')),
        ];

        allChoices.push(
          getLocalizedChoice(T('CharCreate.choice.createCreature.name'), "create_creature", T('CharCreate.choice.createCreature.desc'))
        );

        allChoices.push(
          getLocalizedChoice(T('CharCreate.choice.totalRandom.name'), "total_random", T('CharCreate.choice.totalRandom.desc'), 136)
        );

        // Only show "Randomize all party" for the first party member.
        if (currentMemberIndex === 0) {
          allChoices.push(
            getLocalizedChoice(T('CharCreate.choice.randomizeAllParty.name'), "randomize_all_party", T('CharCreate.choice.randomizeAllParty.desc'), 136)
          );
        }

        // Pre-made dossiers are NOT offered here: they live on the
        // creation-mode step alone.

        return allChoices;
      },
      handler: function (symbol) {
        // Randomize the scenic backdrop whenever the player picks a character type
        // (new character, creature, total random, randomize party, or existing preset).
        if (typeof this.randomizeSceneBackground === "function") {
          this.randomizeSceneBackground();
        }
        // Reset the random-member flag for this member; only "Total Random"
        // re-sets it (which unlocks the Reroll option on the add-member step).
        Scene_CharacterCreation._lastMemberWasRandom = false;
        // Clear the randomize-all marker; only "Randomize all party" re-sets it.
        Scene_CharacterCreation._randomizedAllParty = false;
        if (symbol === "new_character") {
          // Set current actor class to 1 for regular character
          const currentActor = Scene_CharacterCreation.getCurrentActor();
          if (currentActor) {
            currentActor.changeClass(1, false);
          }

          // Get the correct creature switch based on current party member (77, 78, or 79)
          const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
          const creatureSwitchId = 77 + currentMemberIndex; // 77 for actor 1, 78 for actor 2, 79 for actor 3

          // Set creature switch OFF for normal character
          $gameSwitches.setValue(creatureSwitchId, false);
          // A person is portrayed by their bust, never by a sculpted model:
          // the art style follows what the character IS, it is not asked for.
          if (currentActor && currentActor.setPortraitMode) currentActor.setPortraitMode("bust");
          if (this.startDetailedEditor(currentMemberIndex)) return;
          this.nextStep(); // Continue to gender selection
        } else if (symbol === "create_creature") {
          // Set current actor class to 65 for creature
          const currentActor = Scene_CharacterCreation.getCurrentActor();
          if (currentActor) {
            currentActor.changeClass(65, false);
          }

          // Get the correct creature switch based on current party member (77, 78, or 79)
          const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
          const creatureSwitchId = 77 + currentMemberIndex; // 77 for actor 1, 78 for actor 2, 79 for actor 3

          // Set creature switch ON for creature mode
          $gameSwitches.setValue(creatureSwitchId, true);
          Scene_CharacterCreation._isCreatureMode = true;
          // A creature is portrayed by its own model, never by a 2D bust, and it
          // has a valid one from the moment it is made.
          if (currentActor) {
            if (currentActor.setPortraitMode) currentActor.setPortraitMode("model");
            ensureCreatureModel(currentActor);
          }

          if (this.startDetailedEditor(currentMemberIndex)) return;
          this.nextStep(); // Continue to gender selection

        } else if (symbol === "total_random") {
          // Total randomization: skip all steps and create random character
          this.createTotalRandomCharacter();
        } else if (symbol === "randomize_all_party") {
          // Randomize every party slot, then jump straight to the options step
          this.createTotalRandomPartyAll();
        } else {
          // Go to preset selection
          this.showPresetSelection();
        }
      },
    },
    {
      // Gender
      id: "gender",
      get title() {
        return T('CharCreate.selectYourGender');
      },
      get choices() {
        return [
          {
            name: T('CharCreate.male'),
            symbol: "gender",
            value: 0,
            description: "Traditional male biology and identity. Pronouns: He/Him. Associated with testicular/insemination biology.",
          },
          {
            name: T('CharCreate.female'),
            symbol: "gender",
            value: 1,
            description: "Traditional female biology and identity. Pronouns: She/Her. Associated with uterine/gestation biology.",
          },
          {
            name: T('CharCreate.nonBinary'),
            symbol: "gender",
            value: 2,
            description: "Fluid or non-conforming presentation. Pronouns: They/Them. Features adaptable biological traits.",
          },
          {
            name: T('CharCreate.cocoon'),
            symbol: "gender",
            value: 3,
            description: "Metamorphic, synthetic, or vegetative chassis. Pronouns: It/They. Operates via mitotic or engineered reproduction.",
          },
        ];
      },
      handler: function (symbol, index) {
        const choice = this.currentStepData().choices[index];
        if (choice) {
          const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;

          // Determine which gender and reproductive type variables to use
          let genderVar, reproductiveVar;
          switch (currentMemberIndex) {
            case 0:
              genderVar = VAR_PLAYER1_GENDER;
              reproductiveVar = VAR_PLAYER1_REPRODUCTIVE_TYPE;
              break;
            case 1:
              genderVar = VAR_PLAYER2_GENDER;
              reproductiveVar = VAR_PLAYER2_REPRODUCTIVE_TYPE;
              break;
            case 2:
              genderVar = VAR_PLAYER3_GENDER;
              reproductiveVar = VAR_PLAYER3_REPRODUCTIVE_TYPE;
              break;
            default:
              console.warn(`Invalid party member index: ${currentMemberIndex}`);
              genderVar = VAR_PLAYER1_GENDER;
              reproductiveVar = VAR_PLAYER1_REPRODUCTIVE_TYPE;
          }

          // Set gender variable
          $gameVariables.setValue(genderVar, choice.value);

          // Set reproduction type based on gender
          switch (choice.value) {
            case 0: // Male
              $gameVariables.setValue(reproductiveVar, 0); // Testicles
              break;
            case 1: // Female
              $gameVariables.setValue(reproductiveVar, 1); // Uterus
              break;
            case 2: // Non-binary
              $gameVariables.setValue(reproductiveVar, Math.floor(Math.random() * 5)); // Random (0-4)
              break;
            case 3: // Cocoon
              $gameVariables.setValue(reproductiveVar, 4); // Mitosis
              break;
          }
        }

        this.leaveGenderStep();
      },
    },
    {
      // Macro BIO Step (the page a new character opens on): Ideology, Morality, Hometown, Age, Personality, Wealth, Blood Type (Optional)
      id: "bio",
      get title() {
        return T('CharCreate.biography') || "Biography & Ideology";
      },
      get choices() {
        return [];
      },
      handler: function () {
        markStepCompleted(STEP.BIO);
        this.nextStep();
      },
    },
    {
      // Romance: who this character is drawn to, and how they want to be tied
      // to somebody. Orientation, the Kinsey placement that follows from it,
      // the relationship style they hold to, and the standing each of the
      // other members of the party starts on with them. The banks are the ones
      // the Empathize panel reads (js/db/NPC/Orientations.json and
      // js/db/NPC/Relationships.json), so what is picked here is the same fact
      // the rest of the game already knows how to read back.
      id: "romance",
      get title() {
        return T('CharCreate.romanceTab') || "Romance & Bonds";
      },
      get choices() {
        return [];
      },
      handler: function () {
        markStepCompleted(STEP.ROMANCE);
        this.nextStep();
      },
    },
    {
      // Class
      id: "class",
      get title() {
        if (Scene_CharacterCreation._isCreatureMode) {
          return T('CharCreate.chooseYourSkills');
        }
        return T('CharCreate.chooseYourClass');
      },
      get choices() {
        const baseChoices = [];

        // A creature is offered every class there is, not only the ones its
        // archetype was born to: what it can be played as is the player's
        // call. The roster is grouped, monstrous kinds first under their own
        // head, so the classes that read as a creature are the ones the board
        // opens on.
        const creatureActor = Scene_CharacterCreation.getCurrentActor();
        if (Scene_CharacterCreation._isCreatureMode && creatureActor && window.CreatureClasses) {
          const classChoice = (id, group) => {
            const c = $dataClasses[id];
            if (!c) return null;
            const passiveDesc =
              (window.BattleSystemPassiveSkills &&
                window.BattleSystemPassiveSkills.getPassiveDescription(id)) ||
              T('CharCreate.startAsClass', { name: window.CCDbName(c) });
            return {
              name: window.CCDbName(c),
              symbol: "quick_class_" + id,
              description: passiveDesc,
              value: id,
              group,
              groupTitle: group === "creature"
                ? T('ClassSelect.ui.nonSentient')
                : T('ClassSelect.ui.sentient'),
            };
          };
          const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
          const creatureIds = typeof window.CreatureClasses.creatureRoster === "function"
            ? window.CreatureClasses.creatureRoster()
            : (window.CreatureClasses.forActor(creatureActor) || []);
          const creatureCards = creatureIds.map((id) => classChoice(id, "creature")).filter(Boolean).sort(byName);
          // The civilised half of the board is the archetype's own
          // "sentientClasses" roster in Archetypes.json: a humanoid lists all
          // 62, a centaur its handful, a slime none at all. A spliced body is
          // offered only what both halves support.
          const sentientIds = typeof window.CreatureClasses.playableGroupsForArchetypes === "function"
            ? (window.CreatureClasses.playableGroupsForArchetypes(
                actorArchetypeKey(creatureActor), actorSecondaryArchetypeKey(creatureActor)).sentient || [])
            : [];
          const sentientCards = sentientIds
            .map((id) => classChoice(id, "sentient")).filter(Boolean).sort(byName);
          const creatureRoster = creatureCards.concat(sentientCards);
          if (creatureRoster.length) return creatureRoster;
        }

        // Board modes: the whole sentient roster is listed on one step, with
        // the highlighted class's dossier on the right page.
        if (Scene_CharacterCreation.usesFullClassList()) {
          getSentientClassList().forEach((c) => {
            // Show the class's signature passive skill as its description.
            const passiveDesc =
              (window.BattleSystemPassiveSkills &&
                window.BattleSystemPassiveSkills.getPassiveDescription(c.id)) ||
              T('CharCreate.startAsClass', { name: window.CCDbName(c) });
            baseChoices.push({
              name: window.CCDbName(c),
              symbol: "quick_class_" + c.id,
              description: passiveDesc,
              value: c.id,
            });
          });
          // The roster reads as an alphabet, and the roll that skips reading it
          // sits at the head of the board instead of at the end of a long list.
          baseChoices.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          baseChoices.unshift(
            getLocalizedChoice(T('CharCreate.choice.randomClass.name'), "random_class", T('CharCreate.choice.randomClass.desc'), 136)
          );
          return baseChoices;
        }

        baseChoices.push(
          getLocalizedChoice(T('CharCreate.choice.selectClass.name'), "select_class", T('CharCreate.choice.selectClass.desc')),
          getLocalizedChoice(T('CharCreate.choice.randomClass.name'), "random_class", T('CharCreate.choice.randomClass.desc')),
        );

        return baseChoices;
      },
      handler: function (symbol, index) {
        if (symbol && symbol.indexOf("quick_class_") === 0) {
          const classId = this.currentStepData().choices[index].value;
          // Board modes: apply the chosen class directly.
          const currentActor = Scene_CharacterCreation.getCurrentActor();
          if (currentActor) {
            currentActor.changeClass(classId, true);
            if (typeof equipRandomCompatibleWeapon === "function") {
              equipRandomCompatibleWeapon(currentActor, classId);
            }
            if (typeof equipClassStartingArmor === "function") {
              equipClassStartingArmor(currentActor, classId);
            }
            if (typeof giveClassStartingItems === "function") {
              giveClassStartingItems(currentActor, classId);
            }
          }
          this.nextStep();
          return;
        }
        if (symbol === "select_class") {
          window.$ccArchetypeClassFilter = null;
          window.$ccCreatureClassFlow = null;
          this.closeStepUI();
          SceneManager.goto(Scene_ClassSelection);
        } else if (symbol === "mana_cyborg") {
          const currentActor = Scene_CharacterCreation.getCurrentActor();
          if (currentActor) {
            currentActor.changeClass(66, false);
            if (typeof equipRandomCompatibleWeapon === 'function') {
              equipRandomCompatibleWeapon(currentActor, 66);
            }
            if (typeof equipClassStartingArmor === "function") {
              equipClassStartingArmor(currentActor, 66);
            }
            if (typeof giveClassStartingItems === "function") {
              giveClassStartingItems(currentActor, 66);
            }
          }
          this.nextStep();
        } else {
          // A person is rolled out of the sentient roster alone (1-62), and
          // narrowed by the world's magic level like every other roll; the
          // creature classes above it belong to the archetypes that list them
          // in Archetypes.json.
          const validClassIds = window.CreatureClasses.sentientRoster();
          if (validClassIds.length > 0) {
            const randomClass = {
              id: validClassIds[Math.floor(Math.random() * validClassIds.length)],
            };
            const currentActor = Scene_CharacterCreation.getCurrentActor();
            if (currentActor) {
              currentActor.changeClass(randomClass.id, true);
              // Equip the class's fixed starting weapon(s) for the random class
              if (typeof equipRandomCompatibleWeapon === "function") {
                equipRandomCompatibleWeapon(currentActor, randomClass.id);
              }
              if (typeof equipClassStartingArmor === "function") {
                equipClassStartingArmor(currentActor, randomClass.id);
              }
              if (typeof giveClassStartingItems === "function") {
                giveClassStartingItems(currentActor, randomClass.id);
              }
            }
          }
          this.nextStep();
        }
      },
    },
    {
      // Traits
      id: "traits",
      get title() {
        return T('CharCreate.selectYourTraits');
      },
      get choices() {
        return [
          getLocalizedChoice(T('CharCreate.choice.pickTraits.name'), "pick_traits", T('CharCreate.choice.pickTraits.desc'), 106),
          getLocalizedChoice(T('CharCreate.choice.randomTraits.name'), "random_traits", T('CharCreate.choice.randomTraits.desc'), 136),
        ];
      },
      handler: function (symbol) {
        if (symbol === "random_traits") {
          const targetActorId = Scene_CharacterCreation.getCurrentActorId();
          if (window.randomizeTraitsForActor) {
            window.randomizeTraitsForActor(targetActorId);
          }
        }
        markStepCompleted(STEP.TRAITS);
        this.nextStep();
      },
    },
    {
      // Specializations (Optional)
      id: "specializations",
      get title() {
        return T('CharCreate.specializations') || "Specializations";
      },
      get choices() {
        return [];
      },
      handler: function () {
        markStepCompleted(STEP.SPECIALIZATIONS);
        this.nextStep();
      },
    },
    {
      // Personality. Asked of every member in Normal mode (and Full), of
      // creatures as much as of people - a beast has a temperament, which is
      // what a personality is. Quick mode never asks: its characters keep the
      // disposition the society generator rolled for their name, which is
      // exactly what this step overrides.
      id: "personality",
      get title() {
        return T('CharCreate.selectYourPersonality');
      },
      get choices() {
        const list = personalityCatalog();
        const choices = list.map((entry, index) => ({
          name: personalityLabel(entry),
          symbol: "personality_" + index,
          description: personalityDescription(entry),
          value: index,
        }));
        choices.push(getLocalizedChoice(
          T('CharCreate.choice.randomPersonality.name'), "personality_random",
          T('CharCreate.choice.randomPersonality.desc')
        ));
        return choices;
      },
      handler: function (symbol, index) {
        const list = personalityCatalog();
        let picked = -1;
        if (symbol === "personality_random") {
          if (list.length) picked = Math.floor(Math.random() * list.length);
        } else {
          const choice = this.currentStepData().choices[index];
          picked = choice ? choice.value : -1;
        }
        if (picked >= 0) {
          applyPersonalityIndex(Scene_CharacterCreation.getCurrentActorId(), picked);
        }
        this.nextStep();
      },
    },
    {
      // Birth date (Full mode only). Asked per member; skipped in the board modes.
      // Stored as an age per member on $gameSystem._ccBirthAge[index].
      id: "birthdate",
      get title() {
        return T('CharCreate.chooseYourBirthDate');
      },
      get choices() {
        return [
          getLocalizedChoice(T('CharCreate.choice.ageYoung.name'), "age_young", T('CharCreate.choice.ageYoung.desc')),
          getLocalizedChoice(T('CharCreate.choice.ageAdult.name'), "age_adult", T('CharCreate.choice.ageAdult.desc')),
          getLocalizedChoice(T('CharCreate.choice.ageMiddle.name'), "age_middle", T('CharCreate.choice.ageMiddle.desc')),
          getLocalizedChoice(T('CharCreate.choice.ageElder.name'), "age_elder", T('CharCreate.choice.ageElder.desc')),
          getLocalizedChoice(T('CharCreate.choice.ageRandom.name'), "age_random", T('CharCreate.choice.ageRandom.desc'), 136),
        ];
      },
      handler: function (symbol) {
        const ranges = {
          age_young: [18, 25],
          age_adult: [26, 40],
          age_middle: [41, 60],
          age_elder: [61, 90],
        };
        let key = symbol;
        if (key === "age_random") {
          const keys = Object.keys(ranges);
          key = keys[Math.floor(Math.random() * keys.length)];
        }
        const [lo, hi] = ranges[key] || ranges.age_adult;
        const age = lo + Math.floor(Math.random() * (hi - lo + 1));
        const idx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
        if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
        $gameSystem._ccBirthAge[idx] = age;
        this.nextStep();
      },
    },
    {
      // Add Party Member
      id: "addMember",
      get title() {
        return T('CharCreate.addAnotherPartyMember');
      },
      get choices() {
        const choices = [
          getLocalizedChoice(T('CharCreate.choice.addMember.name'), "add_member", T('CharCreate.choice.addMember.desc'), null),
          getLocalizedChoice(T('CharCreate.choice.noMoreMembers.name'), "no_more_members", T('CharCreate.choice.noMoreMembers.desc'), null),
        ];
        // When this member was built via "Total Random", let the player keep
        // rerolling it until they are happy with the result.
        if (Scene_CharacterCreation._lastMemberWasRandom) {
          choices.push(
            getLocalizedChoice(T('CharCreate.choice.rerollCharacter.name'), "reroll_character", T('CharCreate.choice.rerollCharacter.desc'), 136)
          );
        }
        return choices;
      },
      handler: function (symbol, index) {
        if (symbol === "reroll_character") {
          // Re-randomize the current member and refresh the left-hand dossier
          // without leaving the add-member step.
          const idx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
          this._randomizeMemberCharacter(idx);
          Scene_CharacterCreation._lastMemberWasRandom = true;
          // Force a full DOM rebuild so the regenerated character (name, class,
          // gender, traits, sprite, backstory) shows in the left dossier.
          this._lastStep = -1;
          this._lastIndex = -1;
          this.refreshUIOverlayDOM();
          return;
        }
        if (symbol === "add_member") {
          // Check if party is full (max 3 members)
          const currentPartySize = $gameParty.size();

          if (currentPartySize >= 3) {
            // Party is full, proceed to initial settings step
            this.nextStep();
            return;
          }

          // Set current party member index for next character
          const nextMemberIndex = $gameParty.size(); // This will be 1 or 2 (for actors 2 or 3)
          Scene_CharacterCreation._currentPartyMemberIndex = nextMemberIndex;

          // Add the next actor to the party
          $gameParty.addActor(nextMemberIndex + 1); // Actor IDs are 1-based (1, 2, 3)

          // Set next actor's class to 1 by default
          const nextActor = $gameActors.actor(nextMemberIndex + 1);
          if (nextActor) {
            nextActor.changeClass(1, false);
          }

          // Reset creature mode flag for new character
          Scene_CharacterCreation._isCreatureMode = false;

          // Go back to Character Type Selection for the new member
          // (nextStep increments WORLD_HISTORY -> CHARACTER_TYPE, skipping the
          // already-completed settings/difficulty steps).
          this._step = STEP.WORLD_HISTORY;
          this.nextStep();
        } else {
          // Proceed to initial settings step (shown only the first time)
          this.nextStep();
        }
      },
    },
    {
      // Vehicle, and the story mode's own step. The story mode never asks for an
      // origin (it always begins on the Icebush map and stays there), so the
      // one piece of the starting kit it does put to the player is what they
      // drive away in, asked last of all once the character is settled. The
      // pick is parked on the story mode map beside the party and its summoning
      // item goes into the pack: owning that item is what makes a vehicle
      // drivable and lists it in the Vehicles menu (see VehicleSystem).
      id: "vehicle",
      get title() {
        return T('CharCreate.chooseYourVehicle');
      },
      get choices() {
        return [
          getLocalizedChoice(T('CharCreate.choice.vehicleCar.name'), "vehicle_car", T('CharCreate.choice.vehicleCar.desc')),
          getLocalizedChoice(T('CharCreate.choice.vehicleCamper.name'), "vehicle_camper", T('CharCreate.choice.vehicleCamper.desc')),
          getLocalizedChoice(T('CharCreate.choice.vehicleBoat.name'), "vehicle_boat", T('CharCreate.choice.vehicleBoat.desc')),
          getLocalizedChoice(T('CharCreate.choice.vehicleBike.name'), "vehicle_bike", T('CharCreate.choice.vehicleBike.desc')),
          getLocalizedChoice(T('CharCreate.choice.vehicleStarship.name'), "vehicle_starship", T('CharCreate.choice.vehicleStarship.desc')),
          getLocalizedChoice(T('CharCreate.choice.vehicleBroom.name'), "vehicle_broom", T('CharCreate.choice.vehicleBroom.desc')),
        ].map((choice) => {
          // A vehicle is recognised by its shape long before its name, so each
          // card carries the sheet the thing is actually drawn from on the map.
          const spec = STORY_MODE_VEHICLES[choice.symbol];
          if (spec && spec.sprite) choice.sprite = spec.sprite;
          return choice;
        });
      },
      handler: function (symbol) {
        applyStoryModeVehicle(symbol);
        markStepCompleted(STEP.VEHICLE);
        // Answering this is what ends the story mode's creation, and it ends it
        // through the one exit that lands the party where its dossier says and
        // puts the story mode down after it (see _walkPresetLanding). Walking on
        // to the origin step instead would pop the scene with the party still
        // standing nowhere.
        this.onFinishPartyCreation();
      },
    },
    {
      // Origin, where the character starts the game. The last interactive step
      // of every creation run for every mode but Full, which still asks one
      // more thing after this (the hometown step right below): it is reached
      // once per run (arriving here ends the wizard, or hands off to the
      // hometown step), and a run always belongs to a brand new party, so it
      // is NOT showOnlyOnce. It used to be, which meant the completion flag
      // written by the first party silenced the step for every later party
      // built in the same savegame, ending creation with no starting point
      // chosen. Hidden entirely in story mode mode (the story mode flow ends at
      // the add-member step, on the story mode map).
      id: "origin",
      get title() {
        return T('CharCreate.chooseYourOrigin');
      },
      get choices() {
        return [
          getLocalizedChoice(T('CharCreate.choice.originTrain.name'), "origin_train", T('CharCreate.choice.originTrain.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCamper.name'), "origin_camper", T('CharCreate.choice.originCamper.desc')),
          getLocalizedChoice(T('CharCreate.choice.originSpace.name'), "origin_space", T('CharCreate.choice.originSpace.desc')),
          getLocalizedChoice(T('CharCreate.choice.originStranded.name'), "origin_stranded", T('CharCreate.choice.originStranded.desc')),
          getLocalizedChoice(T('CharCreate.choice.originLot.name'), "origin_lot", T('CharCreate.choice.originLot.desc')),
          getLocalizedChoice(T('CharCreate.choice.originDungeon.name'), "origin_dungeon", T('CharCreate.choice.originDungeon.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCeo.name'), "origin_ceo", T('CharCreate.choice.originCeo.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCar.name'), "origin_car", T('CharCreate.choice.originCar.desc')),
          getLocalizedChoice(T('CharCreate.choice.originBike.name'), "origin_bike", T('CharCreate.choice.originBike.desc')),
          getLocalizedChoice(T('CharCreate.choice.originMayor.name'), "origin_mayor", T('CharCreate.choice.originMayor.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCriminal.name'), "origin_criminal", T('CharCreate.choice.originCriminal.desc')),
          getLocalizedChoice(T('CharCreate.choice.originBunker.name'), "origin_bunker", T('CharCreate.choice.originBunker.desc')),
          getLocalizedChoice(T('CharCreate.choice.originArtifact.name'), "origin_artifact", T('CharCreate.choice.originArtifact.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCrash.name'), "origin_crash", T('CharCreate.choice.originCrash.desc')),
          getLocalizedChoice(T('CharCreate.choice.originWarlord.name'), "origin_warlord", T('CharCreate.choice.originWarlord.desc')),
          getLocalizedChoice(T('CharCreate.choice.originFactionLeader.name'), "origin_faction_leader", T('CharCreate.choice.originFactionLeader.desc')),
          getLocalizedChoice(T('CharCreate.choice.originDeserter.name'), "origin_deserter", T('CharCreate.choice.originDeserter.desc')),
          getLocalizedChoice(T('CharCreate.choice.originAugmented.name'), "origin_augmented", T('CharCreate.choice.originAugmented.desc')),
          getLocalizedChoice(T('CharCreate.choice.originCardCollector.name'), "origin_card_collector", T('CharCreate.choice.originCardCollector.desc')),
          getLocalizedChoice(T('CharCreate.choice.originArcanist.name'), "origin_arcanist", T('CharCreate.choice.originArcanist.desc')),
          getLocalizedChoice(T('CharCreate.choice.originMercenary.name'), "origin_mercenary", T('CharCreate.choice.originMercenary.desc')),
          getLocalizedChoice(T('CharCreate.choice.originLostConvoker.name'), "origin_lost_convoker", T('CharCreate.choice.originLostConvoker.desc')),
          getLocalizedChoice(T('CharCreate.choice.originSkeletonKey.name'), "origin_skeleton_key", T('CharCreate.choice.originSkeletonKey.desc')),
          getLocalizedChoice(T('CharCreate.choice.originPlague.name'), "origin_plague", T('CharCreate.choice.originPlague.desc')),
          getLocalizedChoice(T('CharCreate.choice.originDiplomat.name'), "origin_diplomat", T('CharCreate.choice.originDiplomat.desc')),
          getLocalizedChoice(T('CharCreate.choice.originHypernetExplorer.name'), "origin_hypernet_explorer", T('CharCreate.choice.originHypernetExplorer.desc')),
        ];
      },
      handler: function (symbol) {
        // Before a single grant: the state this choice is about to rewrite, kept
        // so the player can walk back out of the starting place picker and pick
        // another origin (see reopenOriginStep).
        captureOriginSnapshot();
        markStepCompleted(STEP.ORIGIN);
        // Full mode asks for a hometown right after Origin, from the full
        // Destinations.json list (see the "hometown" step just below this one
        // in the array); every other mode goes straight into the chosen
        // origin's own starting-place logic, exactly as before.
        if (Scene_CharacterCreation.creationMode() === CC_MODE.FULL) {
          this._pendingOriginSymbol = symbol;
          this.nextStep();
          return;
        }
        this._finishOriginChoice(symbol);
      },
    },
    {
      // Hometown (Full mode only), asked right after Origin: every location in
      // js/db/WorkSystem/Destinations.json, in the same scrollable dropdown
      // list every other long picker in this wizard uses. Stored on
      // $gameSystem._ccHometown before the chosen origin's own starting-place
      // logic runs (see _finishOriginChoice). Every other mode never reaches
      // this step (see _stepHiddenForMode / _stepAutoAdvances).
      id: "hometown",
      get title() {
        return T('CharCreate.chooseYourHometown');
      },
      get choices() {
        const dest = window.WorkSystem && window.WorkSystem.Destinations;
        return getHometownList().map((town) => {
          const country = dest && dest[town] && dest[town].country;
          return getLocalizedChoice(town, town, country || "");
        });
      },
      handler: function (symbol) {
        $gameSystem._ccHometown = symbol;
        markStepCompleted(STEP.HOMETOWN);
        this._finishOriginChoice(this._pendingOriginSymbol);
      },
    },
  ];

  // Named step indices derived from the data array above. Every place that used
  // to hardcode a numeric step (here and in the sibling plugins) references
  // these instead, so the wizard order can be changed by simply reordering the
  // array. Also exposed as window.CCSteps for the class-selector / creature
  // plugins which resume the wizard at specific steps.
  const STEP = (() => {
    const byId = {};
    CharacterCreationData.forEach((s, i) => { if (s && s.id) byId[s.id] = i; });
    return {
      SETTINGS: byId.settings,
      DIFFICULTY: byId.difficulty,
      COMBAT_MODE: byId.combatMode,
      CREATION_MODE: byId.creationMode,
      WORLD_HISTORY: byId.worldHistory,
      CHARACTER_TYPE: byId.characterType,
      GENDER: byId.gender,
      CLASS: byId.class,
      TRAITS: byId.traits,
      SPECIALIZATIONS: byId.specializations,
      BIO: byId.bio,
      ROMANCE: byId.romance,
      PERSONALITY: byId.personality,
      HOMETOWN: byId.hometown,
      BIRTHDATE: byId.birthdate,
      ADD_MEMBER: byId.addMember,
      VEHICLE: byId.vehicle,
      ORIGIN: byId.origin,
    };
  })();
  window.CCSteps = STEP;

  //===========================================================================
  // Story mode vehicle
  //===========================================================================
  //
  // The story mode hands the party a vehicle of their choosing, parked on the
  // story mode map (1414, Icebush) a short walk from where they wake up. The
  // boat needs water under it, so it gets a berth of its own.
  const STORY_MODE_VEHICLE_MAP = 1414;
  const STORY_MODE_VEHICLE_PARK = { x: 87, y: 29 };
  const STORY_MODE_BOAT_PARK = { x: 74, y: 29 };
  // Icebush's world square (<Coords 66 92> in Map1414), so the vehicle stands
  // on the world map where the story mode map itself stands.
  const STORY_MODE_VEHICLE_WORLD = { x: 66, y: 92 };

  // Choice symbol -> everything parking that vehicle takes. `key` is the name
  // window.VehiclePosition files it under; `type` is the engine Game_Vehicle it
  // rides in, and the Car, Bike and Boat all share the single 'boat' one, so
  // `boatType` says which of them the slot currently stands for. `switchId` is
  // the availability switch the menus and events gate on (only the Camper and
  // the Car have one; the rest are owned by holding their item). `itemId` is
  // VehicleSystem's summonItemId: the item that proves the party owns it.
  // `sprite` is the walking sheet the vehicle is drawn from on the map, so the
  // card on the board shows the thing itself. It must be the very sheet
  // VehicleSystem parks (its config's sprites.normal): the broom used to name
  // !$Broom, which is a byte copy of the airship sheet, so the card for it
  // showed the starship.
  const STORY_MODE_VEHICLES = {
    vehicle_car: { key: "car", type: "boat", boatType: "car", switchId: 64, itemId: 164, sprite: "Vehicles/!$Car" },
    vehicle_camper: { key: "camper", type: "ship", switchId: 51, itemId: 111, sprite: "Vehicles/!$RV" },
    vehicle_boat: { key: "boat", type: "boat", boatType: "boat", switchId: 0, itemId: 167, park: STORY_MODE_BOAT_PARK, sprite: "Vehicles/!$Boat" },
    vehicle_bike: { key: "bike", type: "boat", boatType: "bike", switchId: 0, itemId: 131, sprite: "Vehicles/!$Bike" },
    vehicle_starship: { key: "airship", type: "airship", switchId: 0, itemId: 166, sprite: "Vehicles/!$Airship" },
    vehicle_broom: { key: "broom", type: "boat", boatType: "broom", switchId: 0, itemId: 168, sprite: "Vehicles/!$BroomStick" },
  };

  /**
   * Park the vehicle the story mode's vehicle step chose and hand over its keys.
   * @param {string} symbol - Choice symbol ("vehicle_car", "vehicle_boat", ...)
   */
  function applyStoryModeVehicle(symbol, slot) {
    const spec = STORY_MODE_VEHICLES[symbol];
    if (!spec) return;
    const base = spec.park || STORY_MODE_VEHICLE_PARK;
    // A party may set out with a whole garage, so each one parks a couple of
    // tiles along from the last rather than every one of them on one square.
    const park = { x: base.x + (Number(slot) || 0) * 2, y: base.y };

    // window.VehiclePosition is the single source of truth VehicleSystem
    // re-places every Game_Vehicle from on map load, so the pick shows up both
    // on the story mode map and on the world map at Icebush's square.
    if (window.VehiclePosition) {
      window.VehiclePosition.set(spec.key, STORY_MODE_VEHICLE_MAP, park.x, park.y,
        STORY_MODE_VEHICLE_WORLD.x, STORY_MODE_VEHICLE_WORLD.y);
    } else {
      console.warn("CharacterCreation: VehicleSystem not loaded; story mode vehicle not parked.");
    }
    // The car, bike and boat share the engine's single 'boat' vehicle, so the
    // shared slot has to be told which one it currently is.
    if (spec.boatType) $gameSystem._boatType = spec.boatType;
    if (spec.switchId > 0) $gameSwitches.setValue(spec.switchId, true);

    // Place it now as well: the story mode map is already loaded behind the
    // wizard, and VehicleSystem only moves vehicles on map load.
    const map = (typeof $gameMap !== "undefined") ? $gameMap : null;
    const vehicle = (map && map.vehicle) ? map.vehicle(spec.type) : null;
    if (vehicle) {
      vehicle.setLocation(STORY_MODE_VEHICLE_MAP, park.x, park.y);
      vehicle.refresh();
    }

    // Owning the item is what makes the vehicle drivable and puts it in the
    // Vehicles menu, so the keys go in the pack along with the vehicle.
    const item = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[spec.itemId] : null;
    if (item && !$gameParty.hasItem(item)) {
      $gameParty.gainItem(item, 1);
    } else if (!item) {
      console.warn(`CharacterCreation: story mode vehicle item ${spec.itemId} not found.`);
    }
    $gameSystem._ccStoryModeVehicle = spec.key;
  }

  //===========================================================================
  // Starting vehicles (the Vehicles tab)
  //===========================================================================
  //
  // The Vehicles tab is the story mode's old vehicle page turned into a page of
  // the dossier every mode can open, and a party may leave with more than one.
  // The picks live on $gameSystem._ccStartVehicles as choice symbols; the
  // story mode parks each of them beside the party the way its single pick was
  // parked, and every other run just hands over the keys (holding the item is
  // what makes a vehicle drivable and lists it in the Vehicles menu), so the
  // vehicle is summoned wherever the chosen origin drops the party.
  function ccStartVehicleKeys() {
    if (!Array.isArray($gameSystem._ccStartVehicles)) $gameSystem._ccStartVehicles = [];
    return $gameSystem._ccStartVehicles;
  }

  function applyStartingVehicles(storyMode) {
    ccStartVehicleKeys().forEach((symbol, slot) => {
      const spec = STORY_MODE_VEHICLES[symbol];
      if (!spec) return;
      if (storyMode) {
        applyStoryModeVehicle(symbol, slot);
        return;
      }
      // The car, bike, boat and broom share the engine's single 'boat' slot,
      // so the first of them taken is the one it currently stands for.
      if (spec.boatType && !$gameSystem._boatType) $gameSystem._boatType = spec.boatType;
      if (spec.switchId > 0) $gameSwitches.setValue(spec.switchId, true);
      const item = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[spec.itemId] : null;
      if (item && !$gameParty.hasItem(item)) $gameParty.gainItem(item, 1);
      else if (!item) console.warn(`CharacterCreation: starting vehicle item ${spec.itemId} not found.`);
    });
  }

  // The one answer to "what did the party leave with", asked by the origins so
  // the camper, car and bike starts never hand out a second set of keys.
  window.CCStartVehicles = {
    symbols: () => Object.keys(STORY_MODE_VEHICLES),
    spec: (symbol) => STORY_MODE_VEHICLES[symbol] || null,
    selected: () => ccStartVehicleKeys().slice(),
    isSelected: (symbol) => ccStartVehicleKeys().indexOf(symbol) >= 0,
    itemIds: () => Object.keys(STORY_MODE_VEHICLES).map((k) => STORY_MODE_VEHICLES[k].itemId),
    ownsItemId: (itemId) => ccStartVehicleKeys().some((k) => STORY_MODE_VEHICLES[k] && STORY_MODE_VEHICLES[k].itemId === itemId),
    apply: applyStartingVehicles,
  };

  // --- Scene_CharacterCreation ---
  class Scene_CharacterCreation extends Scene_MenuBase {
    static _interruptedStep = -1; // Add this line
    static _startStep = 0;
    static _isCreatureMode = false; // Track if started from creature command
    static _traitsProcessed = false; // Track if traits step has been processed once
    static _currentPartyMemberIndex = 0; // Track which party member is being created (0=first, 1=second, 2=third)
    static _lastMemberWasRandom = false; // True when the current member was built via "Total Random" (enables Reroll on the add-member step)
    static _storyMode = false; // Story mode: streamlined single-character creation
    static _chaosPartyRolled = false; // A chaos world rolls its party once per wizard visit

    // Is this the world of chaos (WorldManager's second alternate timeline)?
    // Asked here so no page in the wizard spells the mode string itself.
    static isChaosWorld() {
      return !!(window.ChaosWorld && window.ChaosWorld.active());
    }
    static _isVehicleMode = false; // Vehicles tab: the garage the party sets out with
    static _isSimpleMode = true;  // Simple mode (default) vs Detailed mode
    static _settingsRowIndex = 0; // Currently focused row in the initial settings step
    static _creationMode = null; // CC_MODE.* (runtime; mirrors $gameSystem._ccCreationMode)
    static _randomizedAllParty = false; // True after "Randomize all party" jumped straight to origin
    static _subScreens = [];      // The chain of screens one step hands over to
    static _subScreenIndex = 0;   // Position in that chain: the next one to open
    static _resumeOnStep = false; // Resume ON the interrupted step (Back), not after it

    // ========================================================================
    // Sub-screens: the separate scenes a step hands the player to
    // ========================================================================
    // The name / sprite step used to be common event 97. Reaching it meant
    // popping the wizard off the scene stack, loading the MAP back, waiting for
    // its interpreter to pick the reserved event up, and only then pushing the
    // sprite board; the event pushed the name prompt after it and called back
    // into the wizard through the repriseCreation plugin command. A whole map
    // load in the middle of creation, papered over with a black veil so the
    // player would not see it, and the return trip always landed one step
    // FORWARD - so backing out of either screen skipped the very step the
    // player was trying to get back to.
    //
    // The screens are opened directly now, as a chain with a cursor in it.
    // SceneManager stacks scene CLASSES rather than instances, so closing one
    // always builds a fresh wizard; while the cursor still has somewhere to go
    // that fresh wizard opens the next screen instead of drawing anything (see
    // create), which costs one frame and shows nothing.
    //
    // The cursor is what makes Back mean Back. Confirming a screen advances it;
    // backing out of one rewinds it by two, so the screen BEFORE the one being
    // left is opened again - the player walks the chain backwards exactly as
    // they walked it forwards. Backing out of the first screen has nothing left
    // to rewind to, so the chain ends and the wizard is told to reopen the step
    // that started it.
    static openSubScreens(fromStep, screens) {
      this._interruptedStep = fromStep;
      this._resumeOnStep = false;
      this._subScreens = screens.slice();
      this._subScreenIndex = 0;
      return this._openNextSubScreen();
    }

    // True while the chain still has a screen to open.
    static hasPendingSubScreen() {
      return this._subScreenIndex < this._subScreens.length;
    }

    // Opens the next screen in the chain, skipping any whose scene is not
    // loaded. True when one was opened, false when the wizard should resume.
    static _openNextSubScreen() {
      const actorId = (this._currentPartyMemberIndex || 0) + 1;
      while (this.hasPendingSubScreen()) {
        const screen = this._subScreens[this._subScreenIndex++];
        if (openCreationSubScreen(screen, actorId)) return true;
      }
      return false;
    }

    // Called by a sub-screen the player backed out of instead of confirming.
    static cancelSubScreens() {
      if (this._interruptedStep < 0) return false;
      // The cursor sits one past the screen being left, so -2 lands on the one
      // before it. Below zero there is no earlier screen: end the chain and
      // resume on the step that opened it.
      this._subScreenIndex -= 2;
      if (this._subScreenIndex < 0) {
        this._subScreenIndex = this._subScreens.length;
        this._resumeOnStep = true;
      }
      return true;
    }

    // Drop any chain in progress, for the paths that abandon the whole run.
    static clearSubScreens() {
      this._subScreens = [];
      this._subScreenIndex = 0;
      this._resumeOnStep = false;
    }

    // True while a chain is open, i.e. while the wizard is paused on a member
    // waiting for one of these screens to close.
    static isInSubScreen() {
      return this._interruptedStep >= 0;
    }

    // Where a Back should land, given the step that opened the screen being
    // backed out of. Walks past anything setupStep() would immediately skip,
    // and past a step that does not ask a question of its own but hands
    // straight over to the screen just left - Quick mode's gender step is one,
    // it exists only to open the sprite board, so landing on it would put the
    // player right back where they came from and there would be no way out.
    static backLandingStep(step) {
      const first = this.getStartingStep();
      let s = step;
      while (s > first && (this._stepAutoAdvances(s) || this._stepHandsOverImmediately(s))) {
        s--;
      }
      return Math.max(first, s);
    }

    static _stepHandsOverImmediately(step) {
      return step === STEP.GENDER && !this._isCreatureMode;
    }

    // The mode this party is being built in, as one of CC_MODE. Reads the
    // runtime flag, falling back to the persisted value so reprise paths behave
    // consistently, and answers Normal for anything it cannot make sense of.
    static creationMode() {
      // The story mode is always a streamlined single-character flow, and it is
      // never asked which mode to run in.
      if (this._storyMode) return CC_MODE.NORMAL;
      const mode = this._creationMode || storedCreationMode();
      if (mode === CC_MODE.FULL && !FULL_CREATION_MODE_ENABLED) return CC_MODE.NORMAL;
      if (mode === CC_MODE.QUICK || mode === CC_MODE.FULL || mode === CC_MODE.DETAILED) {
        return mode;
      }
      return CC_MODE.NORMAL;
    }

    // True when the party is being built in Quick mode: the fast three-question
    // flow (name, sprite, class), everything else settled from those answers.
    static isQuickMode() {
      return this.creationMode() === CC_MODE.QUICK;
    }

    // True when the party is being built in Normal mode, the wizard's ordinary
    // per-character flow (this is what used to be called Quick, before the
    // faster mode above took the name).
    static isNormalMode() {
      return this.creationMode() === CC_MODE.NORMAL;
    }

    // True for both of the wizard's own board-driven flows, as opposed to Full
    // (the detailed life sim) and Detailed (the Empathize dossier editor).
    // Everything they share , the inline class list and its two-column layout ,
    // keys off this rather than off one mode.
    static usesQuickFlow() {
      const mode = this.creationMode();
      return mode === CC_MODE.QUICK || mode === CC_MODE.NORMAL;
    }

    // True when the party being built right now chose Detailed mode: the
    // wizard's per-character steps are replaced by the Empathize editor
    // (CharacterCreationFull.js), which every member goes through in turn.
    //
    // Deliberately reads the runtime flag only. The persisted mode is seeded
    // back into it when a creation run starts, and the mode step is
    // showOnlyOnce: were Detailed read from there too, a savegame that once
    // used it would be locked into it for every later party, with no way back
    // to the ordinary board (see the characterCreation plugin command).
    static isDetailedMode() {
      return this._creationMode === "detailed";
    }

    static isSimpleMode() {
      if (this._isSimpleMode === undefined || this._isSimpleMode === null) {
        if ($gameSystem && typeof $gameSystem._ccIsSimpleMode === "boolean") {
          return $gameSystem._ccIsSimpleMode;
        }
        return true;
      }
      return !!this._isSimpleMode;
    }

    // True when the CLASS step lists the whole sentient roster inline, one
    // class to a card, with the highlighted one's dossier on the right page.
    // Quick and Normal only: Full mode opens the detailed class browser,
    // creature mode has its own base/hybrid picker and the story mode defaults to
    // Mana Cyborg.
    static usesFullClassList() {
      return this.usesQuickFlow() && !this._isCreatureMode && !this._storyMode;
    }

    // Steps that are skipped purely because of the chosen creation mode (as
    // opposed to story mode/creature/member-index rules). Used by both
    // _stepAutoAdvances (Back/Forward) and setupStep (forward skip).
    static _stepHiddenForMode(step) {
      if (this.isQuickMode()) {
        // Quick mode asks three things and settles the rest from them: the
        // name and the sprite (the gender step opens both screens itself),
        // then the class. The portrait is always the bust the sprite comes
        // with, gender and body archetype are read off that sprite's NPCs.json
        // record, traits are rolled and the personality stays the one the
        // society generator dealt this name.
        //
        // The gender step itself is NOT hidden: it is the step that opens the
        // name / sprite screens (setupStep), so Back must still land on it.
        if (step === STEP.TRAITS) return true;
        if (step === STEP.PERSONALITY) return true;
        if (step === STEP.HOMETOWN) return true;
        if (step === STEP.BIRTHDATE) return true;
        return false;
      }
      if (!this.isNormalMode()) return false;
      // Normal mode: trait selection is interactive (same as Full, first member
      // only; members 2/3 still auto-randomize via memberIndex >= 1). Only the
      // Full-only flavor steps are skipped.
      if (step === STEP.HOMETOWN) return true;
      if (step === STEP.BIRTHDATE) return true;
      return false;
    }
    // Returns true when setupStep() would auto-advance past this step without
    // ever showing an interactive choice. This mirrors every forward-skip in
    // setupStep() (story mode defaults, creatures skipping class selection,
    // party members 2/3 auto-randomizing traits, the add-member step when the
    // party is full, etc.) plus the static autoSkip / completed showOnlyOnce
    // rules. Back/forward navigation must skip these so they never count as a
    // landing step (otherwise Back becomes a no-op or underflows the step).
    static _stepAutoAdvances(step) {
      const stepData = CharacterCreationData[step];
      if (!stepData) return false;
      if (stepData.autoSkip) return true;
      if (hasCompletedFirstCreation() && stepData.showOnlyOnce && isStepCompleted(step)) {
        return true;
      }
      // Combat mode step is disabled for now (kept in code); always auto-skip so
      // Back/Forward navigation never lands on it. See setupStep().
      if (step === STEP.COMBAT_MODE) return true;

      // The story mode's own flow, and only while it is still running: once its
      // dossier has been taken the pages are reached by tab, and a step the
      // walk skips is a page the tab could not open (see setupStep).
      const isStoryMode = Scene_CharacterCreation._storyMode &&
        !(this.getCurrentActor() || {})._isPresetActor;
      const isCreature = Scene_CharacterCreation._isCreatureMode;
      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;

      if (isStoryMode) {
        if (step === STEP.SETTINGS) return true;             // settings skipped
        if (STEP.DIFFICULTY != null && step === STEP.DIFFICULTY) return true; // difficulty auto-applied
        if (step === STEP.COMBAT_MODE) return true;          // combat mode default (RPG)
        if (step === STEP.TRAITS) return true;               // traits skipped
        if (step === STEP.PERSONALITY) return true;          // personality left as rolled
        if (step === STEP.CLASS) return true;                // class fixed to Mana Cyborg
        if (step === STEP.ADD_MEMBER) return true;           // single-character party (ends)
      }
      // Creation mode is never asked during the story mode: it is always a
      // streamlined single-character flow, so it goes straight to the humanoid /
      // creature choice. Guarded on the switch as well as the in-scene flag
      // (same as the origin step), since the flag is cleared at add-member.
      // The exception is Detailed mode, which the story mode does offer, so the
      // step stays interactive whenever that plugin is loaded.
      if (step === STEP.CREATION_MODE && isStoryModeFlow() && !detailedModeAvailable()) return true;

      // Detailed mode: the character-type step hands the whole member over to
      // the Empathize editor, so every step it covers is walked past by
      // Back/Forward and the editor is the only landing point per member.
      if (Scene_CharacterCreation.isDetailedMode() && detailedModeAvailable() &&
          [STEP.GENDER, STEP.CLASS, STEP.TRAITS, STEP.PERSONALITY,
           STEP.HOMETOWN, STEP.BIRTHDATE].includes(step)) {
        return true;
      }

      if (Scene_CharacterCreation._stepHiddenForMode(step)) return true; // quick-mode skips
      // Party-level "once" steps are interactive only while building the first
      // member; for members 2/3 they are already settled, so Back/Forward (and
      // getStartingStep) skip them. This keeps Back at the character-type step a
      // no-op for later members instead of dropping them into settings/mode.
      if (memberIndex >= 1 &&
          (step === STEP.SETTINGS || (STEP.DIFFICULTY != null && step === STEP.DIFFICULTY) || step === STEP.COMBAT_MODE ||
           step === STEP.CREATION_MODE || step === STEP.HOMETOWN)) {
        return true;
      }
      // Creatures skip the class step in both modes (the creature is built in the
      // full creature scene, then the flow resumes on traits).
      if (step === STEP.CLASS && isCreature) return true;
      if (step === STEP.TRAITS && memberIndex >= 1) return true;      // members 2/3 auto traits
      // Nothing to choose between without PersonalityData.json loaded; the
      // profile keeps whatever the society generator rolled.
      if (step === STEP.PERSONALITY && personalityCatalog().length === 0) return true;
      if (step === STEP.ADD_MEMBER && $gameParty.size() >= 3) return true; // party already full
      // Nobody walks onto the vehicle step any more: it lives on as the
      // Vehicles tab, opened by hand, and the story mode does not open it at all.
      if (step === STEP.VEHICLE) return true;
      if (step === STEP.ORIGIN && $gameSwitches.value(100)) return true;   // story mode switch ends at origin

      return false;
    }
    static getStartingStep() {
      // The first genuinely interactive step: walk forward over every step
      // setupStep() would auto-advance past.
      let step = 0;
      while (step < CharacterCreationData.length && this._stepAutoAdvances(step)) {
        step++;
      }
      return step;
    }
    static prepare(startStep = 0) {
      this._startStep = startStep;
      // The class roster's search strip and element filter live on the class,
      // so a run that ended mid-search would otherwise open the next one on a
      // roster narrowed to something nobody typed.
      this._classSearchQuery = "";
      this._classHoverIndex = -1;
    }
    // Helper method to get the current actor being created
    static getCurrentActor() {
      const actorId = this._currentPartyMemberIndex + 1; // Actor IDs are 1-based
      return $gameActors.actor(actorId);
    }
    // Helper method to get current actor ID
    static getCurrentActorId() {
      return this._currentPartyMemberIndex + 1;
    }

    // Shared Markov-based random name, used by every randomize-name entry
    // point (per-member randomize, randomize-all-party, and the finish-step
    // fallback for an unnamed first member) so a "random name" always means
    // the same thing everywhere instead of some paths using a hardcoded pool.
    static generateRandomMarkovName(memberIndex = 0) {
      if (window.generateSeededMarkovName) {
        // Timestamp plus member index as seed, so re-rolling the same slot
        // twice in a row still yields a different name.
        const seed = Date.now() + memberIndex * 1000;
        const name = window.generateSeededMarkovName(
          Math.floor(seed / 1000),  // worldX equivalent
          Math.floor(seed % 1000),  // worldY equivalent
          memberIndex + 1,          // eventId equivalent
          "names",                  // database ID
          2,                        // chain order
          4,                        // min characters
          12                        // max characters
        );
        if (name) return name;
      }
      if (window.generateMarkovString) {
        const name = window.generateMarkovString("names", { minLength: 4, maxLength: 12 });
        if (name) return name;
      }
      if (window.TextGen && window.TextGen.names && window.TextGen.names.en) {
        const namesList = window.TextGen.names.en.trim().split(/\s+/);
        if (namesList.length > 0) {
          return namesList[Math.floor(Math.random() * namesList.length)];
        }
      }
      return "Random";
    }

    // Assigns a random sprite and its associated bust to an actor.
    static assignRandomSpriteAndBust(actor) {
      if (!actor) return null;
      if (window.selectRandomSpriteForActor) {
        const res = window.selectRandomSpriteForActor(actor.actorId());
        if (res) return res;
      }
      const npcData = window.WorldGen && window.WorldGen.NPCs;
      if (!npcData) return null;
      let charName = window.SpriteCatalog
        ? window.SpriteCatalog.pickNpcKey(Math.random())
        : null;
      if (!charName) {
        const keys = Object.keys(npcData).filter((k) => npcData[k] && npcData[k].npc === true && npcData[k].vip !== true);
        if (keys.length === 0) return null;
        charName = keys[Math.floor(Math.random() * keys.length)];
      }
      const entry = npcData[charName] || {};
      const maxIndex = charName.includes("$") ? 0 : 7;
      const charIndex = Math.floor(Math.random() * (maxIndex + 1));

      actor.setCharacterImage(charName, charIndex);

      let bust = (entry.busts && (entry.busts[charIndex] ?? entry.busts[0])) || null;
      if (!bust && window.Sprites && window.Sprites.SpritesAssociation && window.Sprites.SpritesAssociation[charName]) {
        const assoc = window.Sprites.SpritesAssociation[charName];
        bust = assoc[charIndex] ?? assoc[0];
      }
      if (bust) {
        actor.setVnBust(bust);
        if (actor.setPortraitMode) actor.setPortraitMode("bust");
      }
      const leader = $gameParty && $gameParty.leader();
      if (leader && actor.actorId() === leader.actorId()) {
        if ($gamePlayer) $gamePlayer.refresh();
      }
      return { name: charName, index: charIndex, bust: bust };
    }

    // Applied from the 3D Political Graph's onSelect callback, which fires
    // during confirmSelection() - before SceneManager has swapped _scene back
    // to the wizard, so SceneManager._scene is still the graph itself there.
    // Writing straight onto the actor sidesteps that stale reference; the
    // wizard picks the new value up on its own next render.
    static applyIdeologySelection(id) {
      const actor = this.getCurrentActor();
      if (!actor || !id) return;
      // The story mode's Em holds one of her own shelf of creeds or none of
      // them, whichever door the pick came through (see CharacterPresets).
      const CP = window.CharacterPresets;
      if (CP && CP.isStoryModeEm && CP.isStoryModeEm(actor)) {
        const allowed = (CP.storyModeEmIdeologyChoices && CP.storyModeEmIdeologyChoices()) || [];
        if (!allowed.includes(String(id))) { SoundManager.playBuzzer(); return; }
      }
      actor._ideologyId = id;
      actor._bioSet = true;
      // NPCSociety.js publishes itself as NPCSocietyRegistry; the old name resolved to
      // nothing, so a chosen creed never reached the member's society profile.
      if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getActorProfile) {
        const prof = window.NPCSocietyRegistry.getActorProfile(actor.actorId());
        if (prof) prof.ideologyId = id;
      }
    }
    // Detailed mode: hand this member over to the Empathize editor
    // (CharacterCreationFull.js) instead of walking the wizard's own
    // per-character steps. The editor resumes the wizard at the add-member
    // prompt when it closes, so the steps it covers (portrait, gender, class,
    // traits, hometown, birth date) are never reached; _stepAutoAdvances walks
    // Back past them for the same reason. Answers true when it has taken over.
    startDetailedEditor(memberIndex) {
      if (!Scene_CharacterCreation.isDetailedMode() || !detailedModeAvailable()) return false;
      this._ccHandingOver = true;
      this.hideUI();
      // The board's DOM overlay is separate from the RMMZ windows and would sit
      // over the panel until terminate() fades it out, so it is dropped here,
      // the same thing the story mode's end-of-flow branch does.
      if (this._dndContainer) window.CCPanel.hide(this._dndContainer);
      window.CharacterCreationFull.open(memberIndex || 0);
      return true;
    }

    hideUI() {
      if (this._titleWindow) {
        this._titleWindow.visible = false;
        this._titleWindow.opacity = 0;
      }
      if (this._gridWindow) {
        this._gridWindow.deactivate();
        this._gridWindow.visible = false;
        this._gridWindow.opacity = 0;
      }
    }
    // Add these methods to Scene_CharacterCreation class

    showUI() {
      // DOM handles visuals; just re-activate grid window for keyboard input
      if (this._gridWindow) {
        this._gridWindow.activate();
      }
    }

    initialize() {
      super.initialize();
      const SC = Scene_CharacterCreation;

      // The chain still has a screen to open, so this instance exists only to
      // open it (see create). The resume point belongs to the instance that
      // will actually use it, so leave it alone.
      this._isSubScreenRelay = SC.hasPendingSubScreen();
      if (this._isSubScreenRelay) {
        this._step = SC._interruptedStep;
        return;
      }

      // Resuming from a screen the step handed the player to (the sprite board,
      // the name prompt, the creature builder, the trait selector). Confirming
      // one moves the wizard on; BACKING OUT of the first screen of a chain
      // sets _resumeOnStep, and then the wizard reopens the step that started
      // it - or the last real question before it, where that step is one that
      // would only hand straight back over (see backLandingStep).
      if (SC._interruptedStep >= 0) {
        if (SC._resumeOnStep) {
          this._step = SC.backLandingStep(SC._interruptedStep);
        } else {
          this._step = SC._interruptedStep + 1;
        }
        SC._interruptedStep = -1;
        SC._resumeOnStep = false;
      } else {
        this._step = SC._startStep;
        SC._startStep = 0;
      }

      // Reset traits flag for a fresh character creation, i.e. when starting at
      // (or before) the first interactive step rather than resuming mid-flow.
      if (this._step <= SC.getStartingStep()) {
        SC._traitsProcessed = false;
        SC._currentPartyMemberIndex = 0;
        // Start character creation with only 1 character (Actor 1)
        if ($gameParty && $gameParty.members().length > 1) {
          const extraMembers = $gameParty.members().slice(1);
          extraMembers.forEach(m => $gameParty.removeActor(m.actorId()));
        }
      }
    }

    create() {
      // Relay: a queued sub-screen is opened before anything is built, so this
      // instance draws nothing at all and is gone on the next frame. Only the
      // bare scene skeleton is set up - no background snapshot, no windows, no
      // DOM overlay - which is what keeps the hop invisible.
      if (this._isSubScreenRelay) {
        Scene_Base.prototype.create.call(this);
        this.createWindowLayer();
        if (!Scene_CharacterCreation._openNextSubScreen()) {
          // Every remaining screen turned out to be unavailable: fall through
          // and build the wizard normally, on the step after the one that
          // opened the chain (what it was waiting for is simply not there).
          this._isSubScreenRelay = false;
          this._step = Scene_CharacterCreation._interruptedStep + 1;
          Scene_CharacterCreation._interruptedStep = -1;
          Scene_CharacterCreation._resumeOnStep = false;
        } else {
          return;
        }
      }

      super.create();
      // Ambient loops carried over from wherever the game was before (a biome
      // BGS from the previous playthrough, a map ambience behind the title)
      // would keep running under the whole wizard, so silence them on entry.
      AudioManager.stopBgs();
      // Cached after the first call, so every entry point into the wizard can
      // ask for it and only the first one pays.
      warmCreationAssets();
      this._seedDefaultMemberNames();
      this._seedDefaultFirstMemberSpriteAndBust();
      this.createTitleWindow();
      this.createGridWindow();
      // The story mode never builds a character and never picks one: it is played
      // as Em, whose record is stamped onto the seat on the way in (see
      // startStoryModeDossier) so the wizard opens on her sheet. Only while the
      // seat is still empty, though: once she is on it the wizard is rebuilt
      // around her pages, and stamping her again would spend a second Em.
      if (Scene_CharacterCreation._storyMode &&
          !(Scene_CharacterCreation.getCurrentActor() || {})._isPresetActor) {
        this.startStoryModeDossier();
      } else if (Scene_CharacterCreation.isChaosWorld() &&
                 !Scene_CharacterCreation._chaosPartyRolled) {
        // The world of chaos is not built, it is drawn: three characters are
        // rolled on the way in and the wizard opens on the scenario board with
        // them already seated, where they can be rolled again.
        Scene_CharacterCreation._chaosPartyRolled = true;
        this.startChaosParty();
      } else {
        this.setupStep();
      }
      this.createUIOverlay();
    }

    // A member who has never been named still carries the name the database
    // gave the actor, and the first seat opens on it, so the leader was called
    // whatever data/Actors.json says while every later recruit was rolled a
    // name of its own. A name nobody has written yet is rolled from the same
    // Markov generator the randomize button uses, so the field opens on a name
    // that belongs to this world rather than on the editor's placeholder.
    _seedDefaultMemberNames() {
      const members = ($gameParty && $gameParty.members && $gameParty.members()) || [];
      members.forEach((actor, idx) => {
        if (!actor || actor._isPresetActor || actor._ccNameSeeded) return;
        const given = (actor.name() || "").trim();
        const record = (typeof $dataActors !== "undefined" && $dataActors) ? $dataActors[actor.actorId()] : null;
        const dbName = ((record && record.name) || "").trim();
        // Anything the player has already typed stands, and so does a name a
        // dossier or a randomizer has already written.
        if (given && given !== dbName && given !== "Unnamed" && given !== "Harold") return;
        actor.setName(Scene_CharacterCreation.generateRandomMarkovName(idx));
        actor._ccNameSeeded = true;
      });
    }

    // Always assign a random sprite and associated bust to the first party member
    // when creating character, so the protagonist starts with a valid sprite and matching bust.
    _seedDefaultFirstMemberSpriteAndBust() {
      const members = ($gameParty && $gameParty.members && $gameParty.members()) || [];
      const seats = members.length ? members : [$gameActors.actor(1)];
      seats.forEach((actor) => Scene_CharacterCreation.ensureSpriteAndBust(actor));
    }

    // Actor 1 opens the wizard with the empty characterName data/Actors.json
    // gives it, so a seat that was never rolled drew an empty avatar box and,
    // because the bust is read off the sprite, an empty portrait beside it.
    // Every seat is answered here instead of only the first, and the panels
    // ask again as they draw, so no page can open on a blank frame.
    // Whether a member is a monster, asked of the member rather than of the
    // wizard's static mode flag (which is about the seat being edited, not
    // about this actor). Three things can say so and any one of them is
    // enough: the flag the creature branch writes, a creature class, and the
    // seat switch the older paths set.
    static isCreatureActor(actor) {
      if (!actor) return false;
      if (actor._isCreatureActor) return true;
      const CC = window.CreatureClasses;
      if (CC && CC.isCreatureClass && actor._classId && CC.isCreatureClass(actor._classId)) return true;
      const members = ($gameParty && $gameParty.members && $gameParty.members()) || [];
      const slot = members.indexOf(actor);
      if (slot >= 0 && typeof $gameSwitches !== "undefined" && $gameSwitches.value(77 + slot)) return true;
      return false;
    }

    static ensureSpriteAndBust(actor) {
      if (!actor || actor._isPresetActor) return false;
      const hasSprite = !!actor.characterName();
      // A monster is drawn as the model it was sculpted from and carries no
      // bust at all (_getActorBust refuses one), so asking it for one rolled a
      // stranger's portrait onto it on every redraw. Its sprite is asked for
      // exactly as a person's is; only the bust half is skipped.
      const isCreature = Scene_CharacterCreation.isCreatureActor(actor);
      const hasBust = isCreature ||
        (typeof actor.vnBust === "function" ? !!actor.vnBust() : true);
      if (hasSprite && hasBust) {
        actor._ccSpriteSeeded = true;
        return false;
      }
      if (!hasSprite) {
        if (isCreature && window.selectRandomSpriteForActor) {
          // The grid's own roll, which is the one that knows a monster is
          // never offered a humanoid NPC's sheet (optionsForAudience). The
          // portrait style it may set on the way is put back: a creature is
          // portrayed by its model, not by whatever bust the sheet carries.
          const mode = actor.portraitMode ? actor.portraitMode() : null;
          window.selectRandomSpriteForActor(actor.actorId());
          if (mode && actor.setPortraitMode) actor.setPortraitMode(mode);
        } else {
          Scene_CharacterCreation.assignRandomSpriteAndBust(actor);
        }
      } else if (window.selectRandomBustForActor) {
        window.selectRandomBustForActor(actor.actorId());
      }
      actor._ccSpriteSeeded = true;
      return true;
    }

    // Applies the defaults the story mode's SETTINGS/DIFFICULTY/COMBAT_MODE
    // steps used to set silently (roguelite difficulty, classic RPG combat,
    // Map Battle off), then opens the story mode's own preset board in place
    // of the step-by-step wizard.
    terminate() {
      super.terminate();
      this._destroyCC3DPortrait();
      if (window.CCNav) window.CCNav.detach(this);
      if (window.EmRestlessBubble) window.EmRestlessBubble.release();
      const container = this._dndContainer;
      if (!container) return;
      if (window._ccOverlayTimeout) {
        clearTimeout(window._ccOverlayTimeout);
        window._ccOverlayTimeout = null;
      }
      container.innerHTML = "";
      window.CCPanel.hide(container);
    }

    createUIOverlay() {
      // A step handed this member over to another screen from setupStep(),
      // which runs before this - the Empathize editor in Detailed mode, or the
      // sprite board in Quick mode, where the gender question is never put.
      // Paint nothing, or the wizard's board would flash for the frame before
      // the scene change lands.
      if (this._ccHandingOver) return;
      // 1. Mute native windows
      if (this._titleWindow) {
        this._titleWindow.visible = false;
        this._titleWindow.opacity = 0;
      }
      if (this._gridWindow) {
        this._gridWindow.visible = false;
        this._gridWindow.opacity = 0;
      }

      // 2. Create container
      let container = document.getElementById("character-creation-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "character-creation-container";
        document.body.appendChild(container);
      }
      
      // Clear any pending timeout and ensure styles are clean
      if (window._ccOverlayTimeout) {
        clearTimeout(window._ccOverlayTimeout);
        window._ccOverlayTimeout = null;
      }
      
      this._dndContainer = container;
      window.CCPanel.show(this._dndContainer);
      this._dndContainer.innerHTML = ""; // Wipe clean to prevent stale DOM layout leaking

      this._lastIndex = -1;
      this._lastStep = -1;
      this._lastPresetMode = false;
      // Force the memoized party panel to rebuild on the first render of this scene.
      this._partyPanelSig = null;
      this._partyPanelHtml = null;
      // Re-apply any previously chosen random backdrop so it survives scene/DOM rebuilds.
      this.applySceneBackground(Scene_CharacterCreation._sceneBgImage);
      // Wheel scrolling for every pane of the spread (the details page above
      // all), with the right stick doing the same from a controller. See CCScroll.
      if (window.CCScroll) window.CCScroll.bindWheel(this._dndContainer);
      // Everything on the spread that is not a card on a board - the sidebar
      // buttons, the bio chips, the talent board's +/-, the portraits - is
      // walked by the focus ring instead. See CharacterCreationNav.js.
      if (window.CCNav) window.CCNav.attach(this, this._dndContainer);
      this.refreshUIOverlayDOM();
    }

    // CCScroll hook: the hometown step is a dropdown, so a wheel notch or a
    // trigger pull moves the highlighted row instead of scrolling the list.
    ccScrollStep(dir) {
      const stepData = this.currentStepData();
      if (!stepData || stepData.id !== "hometown") return false;
      const w = this._gridWindow;
      if (!w || !w.active) return false;
      const max = w.maxItems();
      if (max <= 0) return false;
      const idx = Math.max(0, Math.min(max - 1, w.index() + dir));
      if (idx === w.index()) return true;
      SoundManager.playCursor();
      w.select(idx);
      this.refreshUIOverlayDOM();
      return true;
    }

    // Scenic battlebacks used as a randomized backdrop behind the parchment pockets.
    static get SCENE_BACKDROPS() {
      return [
        // i18n-ignore-start: img/battlebacks file names
        "Bridge", "Castle", "Castle1", "Cliff", "Clouds", "Colosseum", "Crystal",
        "Cyberspace", "DarkSpace", "DemonCastle1", "DemonicWorld", "Desert",
        "DirtCave", "Forest", "Fort1", "GrassMaze", "Grassland", "IceCave",
        "IceMaze", "Lava", "LavaCave", "PoisonSwamp", "Port", "RockCave",
        "Ruins1", "Ruins2", "Sand", "Ship", "Snowfield", "Space", "Temple",
        "Tower", "Town1", "Town2", "Town3", "Town4", "Town5", "Wasteland",
        // i18n-ignore-end
      ];
    }

    // Pick a random scenic battleback and use it as the scene backdrop.
    randomizeSceneBackground() {
      const list = Scene_CharacterCreation.SCENE_BACKDROPS;
      const name = list[Math.floor(Math.random() * list.length)];
      Scene_CharacterCreation._sceneBgImage = name;
      this.applySceneBackground(name);
    }

    // Apply (or clear) the randomized backdrop on the overlay container, keeping a
    // dark gradient on top so the parchment text stays readable.
    applySceneBackground(name) {
      if (!this._dndContainer) return;
      if (!name) {
        this._dndContainer.style.removeProperty("--cc-scene-bg");
        return;
      }
      const url = `img/battlebacks2/${name}.png`;
      this._dndContainer.style.setProperty("--cc-scene-bg", window.CCArt.url(url));
    }

    cleanText(str) {
      if (!str) return "";
      return str.replace(/\\C\[\d+\]/gi, "").replace(/\\C/gi, "");
    }

    // Current age of a preset dossier, computed against the live in-game
    // calendar (TimeDateSystem / Variable 114) rather than the real-world
    // clock, so it reflects the game's own timeline. Returns null when the
    // preset has no birthDate or the time system isn't available yet.
    getSpriteStyle(spriteName, spriteIndex) {
      return window.CCArt.sprite(spriteName, spriteIndex);
    }

    // ── RPG Maker IconSet Renderer (Icons.json reference) ──
    _ccIconHtml(iconIndex, size = 24) {
      if (iconIndex == null || iconIndex < 0) return "";
      const col = iconIndex % 16;
      const row = Math.floor(iconIndex / 16);
      return `<span class="cc-rpg-icon" style="${this._ccIconStyle(iconIndex, size)}"></span>`;
    }

    // The thumbnail a party tab wears: the member's own walking sprite, facing
    // the reader and zoomed onto the head and shoulders, so a tab is read by
    // the face on it rather than by a coloured dot. A slot with no sprite yet
    // keeps the dot, which is all there is to say about an empty seat.
    _ccTabPortraitHtml(actor, isDone) {
      const spriteName = actor && actor.characterName && actor.characterName();
      if (!spriteName) {
        return `<span class="cc-tab-dot ${isDone ? 'done' : ''}"></span>`;
      }
      const style = this.getSpriteStyle(spriteName, actor.characterIndex());
      return `
        <span class="cc-tab-portrait ${isDone ? 'done' : ''}">
          <span class="cc-tab-portrait-sprite" style="${style}"></span>
        </span>
      `;
    }

    // The floating card every hover handler below raises, fetched (or made)
    // once and reused: a stat, a trait and an item all land in the same
    // corner of the screen, so they share the one element rather than each
    // standing up their own.
    _renderTopFolderTabsHtml() {
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isPetActive = !!Scene_CharacterCreation._isPetMode;
      // Declared here rather than beside the vehicle tab below: the party tabs
      // read it too, and from there it was still in its temporal dead zone.
      const isVehicleActive = !!Scene_CharacterCreation._isVehicleMode;
      const isScenarioMode = !!Scene_CharacterCreation._isScenarioMode || this._step === STEP.ORIGIN;
      const isSettingsActive = (this._step === STEP.SETTINGS) || (CharacterCreationData[this._step] && CharacterCreationData[this._step].isSettingsStep);
      const partyMembers = $gameParty ? $gameParty.members() : [];
      const partySize = partyMembers.length;

      // Which slot of the rail the pad is resting on, when it is resting on one
      // that is not also the open page (the empty party slot).
      const railFocus = Scene_CharacterCreation._railFocus;

      // 0. Settings Tab (First Tab on the Left)
      const settingsTabHtml = `
        <div class="cc-folder-tab ${isSettingsActive ? 'active' : ''}" onclick="SceneManager._scene.onSettingsTabClick()" title="${ccT('CharCreate.initialSettings', 'Initial Settings')}">
          ${this._ccIconHtml(SETTINGS_TAB_ICON, 16)}
          <span>${ccT('CharCreate.settings', 'Settings')}</span>
        </div>
      `;

      // 1. Top Left: Party Member Tabs + Pet Slot
      const partyTabsHtml = partyMembers.map((partyActor, idx) => {
        const name = partyActor.name() || `Member ${idx + 1}`;
        const isActive = !isSettingsActive && !isScenarioMode && !isPetActive && !isVehicleActive && idx === currentMemberIndex;
        const isComp = partyActor.name() && partyActor._classId > 0 && partyActor.characterName();
        const roman = idx === 0 ? 'I' : (idx === 1 ? 'II' : 'III');
        const isLeader = idx === 0;

        const removeBtn = !isLeader ? `
          <span class="cc-tab-remove-x" title="${ccT('CharCreate.deleteMember', 'Remove Member')}" onclick="event.stopPropagation(); SceneManager._scene.onRemovePartyMember(${idx}, event)">
            ✕
          </span>
        ` : '';

        return `
          <div class="cc-folder-tab ${isActive ? 'active' : ''}" onclick="SceneManager._scene.onPartyMemberTabClick(${idx})">
            ${this._ccTabPortraitHtml(partyActor, isComp)}
            <span><b>${roman}</b> ${name}</span>
            ${removeBtn}
          </div>
        `;
      }).join("");

      // The empty seat. The pad walks onto it like any other tab (it is the slot
      // L1/R1 stop on when the party is short a member) and Confirm fills it.
      // The story mode plays one character and one companion, so the seat is not
      // offered there at all.
      const addBtnHtml = partySize < 3 && !Scene_CharacterCreation._storyMode ? `
        <div class="cc-folder-tab cc-tab-add-plus ${railFocus === 'add' ? 'selected' : ''}" title="${ccT('CharCreate.addPartyMember', 'Add Member')}" onclick="SceneManager._scene.onAddPartyMember()">
          +
        </div>
      ` : '';

      const pet = $gameSystem._partyPet;
      // Only the story mode keeps a familiar: everywhere else the tab is the
      // party's pets, and it is named that.
      const petTabLabel = Scene_CharacterCreation._storyMode
        ? ccT('CharCreate.companion', "Familiar")
        : ccT('CharCreate.petsTab', "Pets");
      const petName = pet ? pet.name : petTabLabel;
      const removePetBtn = pet ? `
        <span class="cc-tab-remove-x" title="${this._petWord('CharCreate.releasePet', 'Release Familiar', 'CharCreate.petsTabRelease', 'Release Pet')}" onclick="event.stopPropagation(); SceneManager._scene.onRemovePet(event)">
          ✕
        </span>
      ` : '';

      const chosenVehicles = (window.CCStartVehicles && window.CCStartVehicles.selected()) || [];
      // The story mode is never asked what it drives: The Beast is already parked
      // where Em left it, so the garage is not offered at all.
      const vehicleTabHtml = Scene_CharacterCreation._storyMode ? '' : `
        <div class="cc-folder-tab cc-vehicle-tab ${!isSettingsActive && !isScenarioMode && isVehicleActive ? 'active' : ''}" onclick="SceneManager._scene.onVehicleTabClick()">
          <span class="cc-tab-dot ${chosenVehicles.length ? 'done' : ''}"></span>
          <span>${ccT('CharCreate.vehiclesTab', 'Vehicles')}${chosenVehicles.length ? ` (${chosenVehicles.length})` : ''}</span>
        </div>
      `;

      const petTabHtml = `
        <div class="cc-folder-tab cc-pet-tab ${!isSettingsActive && !isScenarioMode && isPetActive ? 'active' : ''}" onclick="SceneManager._scene.onPetTabClick()">
          <span class="cc-tab-dot ${pet ? 'done' : ''}"></span>
          <span>${petName}</span>
          ${removePetBtn}
        </div>
      `;

      // 2. Top Right: Creation Step Tabs
      const tabs = this._getCreationTabs();
      const isPreset = !!this._presetWindow;

      // The settings page belongs to no character, so the step rail that edits one
      // is not drawn beside it: it would offer six tabs none of which can be the
      // open page. The familiar and the garage are the same case: neither is a
      // party member's sheet, so neither stands under that rail either.
      const stepTabsHtml = (isSettingsActive || isPetActive || isVehicleActive) ? '' : isScenarioMode ? `
        <div class="cc-folder-tab active" onclick="SceneManager._scene.onReturnToPartyDossier()">
          ${this._ccIconHtml(190, 16)} <span>${ccT('CharCreate.scenarioShared', "Scenario & Origin")}</span>
        </div>
      ` : tabs.map((tab) => {
        if (tab.id === "origin") return ""; // Origin is moved to dedicated scenario confirm
        const isTabActive = !isSettingsActive && !isPreset && !isPetActive && !Scene_CharacterCreation._isVehicleMode && (this._step === tab.step || (tab.id === 'archetype' && this._step === STEP.GENDER));
        const isCompleted = this._isTabCompleted(tab.id);

        return `
          <div class="cc-folder-tab ${isTabActive ? 'active' : ''}" onclick="SceneManager._scene.onTabClick(${tab.step}, '${tab.id}')">
            ${this._ccIconHtml(tab.iconIndex, 16)}
            <span>${tab.title.replace(/\s*\(Optional\)/i, "")}</span>
            ${isCompleted ? '<span class="cc-tab-done-mark">✓</span>' : ''}
          </div>
        `;
      }).join("");

      // The scenario page is the party's, not any one member's: the rail of
      // member tabs would offer pages that cannot be opened from here, so the
      // scenario tab stands alone.
      const leftTabsHtml = isScenarioMode ? '' : `
            ${settingsTabHtml}
            ${partyTabsHtml}
            ${addBtnHtml}
            ${petTabHtml}
            ${vehicleTabHtml}`;

      const isSimple = Scene_CharacterCreation.isSimpleMode();
      const modeToggleHtml = (isSettingsActive || isScenarioMode || Scene_CharacterCreation._storyMode) ? '' : `
        <div class="cc-mode-toggle" title="${ccT('CharCreate.toggleModeTooltip', 'Toggle between Simple and Detailed creation mode')}">
          <button type="button" class="cc-mode-pill ${isSimple ? 'active' : ''}" data-nav="simple-mode" data-nav-key="cc-mode-simple" onclick="event.stopPropagation(); SceneManager._scene.onSetSimpleMode(true)">${ccT('CharCreate.simpleMode', 'Simple mode')}</button>
          <button type="button" class="cc-mode-pill ${!isSimple ? 'active' : ''}" data-nav="detailed-mode" data-nav-key="cc-mode-detailed" onclick="event.stopPropagation(); SceneManager._scene.onSetSimpleMode(false)">${ccT('CharCreate.detailedMode', 'Detailed mode')}</button>
        </div>
      `;

      return `
        <div class="cc-dossier-top-bar">
          <div class="cc-folder-tabs-left">
            ${leftTabsHtml}
          </div>
          <div class="cc-folder-tabs-right">
            ${stepTabsHtml}
            ${modeToggleHtml}
          </div>
        </div>
      `;
    }

    // ── Helper methods for connected busts and currency ──
    _isCreatureActorFor(actor) {
      return Scene_CharacterCreation.isCreatureActor(actor);
    }

    _getActorBust(actor) {
      if (!actor) return null;
      // A monster has no bust: it is drawn as the model it was sculpted from,
      // and a 2D portrait borrowed off a sprite sheet would be somebody else.
      if (this._isCreatureActorFor(actor)) return null;
      if (actor.vnBust && actor.vnBust()) return actor.vnBust();
      const spriteName = actor.characterName();
      const spriteIndex = actor.characterIndex();
      let busts = null;
      if (window.SpriteCatalog && window.SpriteCatalog.busts) {
        busts = window.SpriteCatalog.busts(spriteName);
      }
      if ((!busts || !busts.length) && window.Sprites && window.Sprites.SpritesAssociation) {
        busts = window.Sprites.SpritesAssociation[spriteName];
      }
      if (busts && busts.length) {
        return busts[spriteIndex] !== undefined && busts[spriteIndex] !== null ? busts[spriteIndex] : busts[0];
      }
      return null;
    }

    // Every portrait the wizard paints comes through here, and it is drawn as
    // a CSS background, which has no onerror to catch a miss. window.BustPath
    // is what knows where a name's file really is (a dossier's portrait lives
    // in img/busts/presets/, everybody else's in the flat folder), so a name
    // that resolves to nothing becomes the house bust rather than an empty
    // frame and a load error. A character with no bust at all still answers ""
    // so the panels that draw a 3D body instead keep drawing it.
    _getBustUrl(bustName) {
      if (!bustName) return "";
      if (window.BustPath) return window.BustPath.url(bustName, "img/busts/7.png");
      const raw = String(bustName).replace(/^img\/busts\//i, "").replace(/\.png$/i, "");
      return `img/busts/${raw}.png`;
    }

    refreshUIOverlayDOM() {
      if (this._ccHandingOver) return;
      if (!this._dndContainer) return;

      const _curStepData = this._step < CharacterCreationData.length ? CharacterCreationData[this._step] : null;
      if (!_curStepData) return;
      // A seat can reach the sheet without ever passing the seeding done on
      // entry (a member added mid-flow, a relayed sub-screen), so the page
      // asks for its own sprite and bust before it draws them.
      if (!Scene_CharacterCreation._isPetMode) {
        Scene_CharacterCreation.ensureSpriteAndBust(Scene_CharacterCreation.getCurrentActor());
      }
      if (_curStepData.isSettingsStep) {
        this._refreshSettingsDOM();
        return;
      }

      // Leaving the settings page gives the character's sidebar back, and the
      // tab bar is due a rewrite the next time settings is opened.
      this._tabsShowSettings = false;
      const _openLayout = this._dndContainer.querySelector(".cc-unified-layout");
      if (_openLayout) _openLayout.classList.remove("cc-settings-mode");

      const isPreset = !!this._presetWindow;
      const isScenario = !!Scene_CharacterCreation._isScenarioMode || this._step === STEP.ORIGIN;
      const activeIndex = isPreset ? (this._presetWindow ? this._presetWindow.index() : 0) : (this._gridWindow ? this._gridWindow.index() : 0);
      const currentStep = this._step;
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isPetMode = !!Scene_CharacterCreation._isPetMode;
      const isVehicleMode = !!Scene_CharacterCreation._isVehicleMode;

      // ── Memoization Check to Prevent 60 FPS Dom Rebuilding & Tab Flickering ──
      if (this._lastIndex === activeIndex && 
          this._lastStep === currentStep && 
          this._lastPresetMode === isPreset && 
          this._lastMemberIndex === currentMemberIndex &&
          this._lastPetMode === isPetMode &&
          this._lastVehicleMode === isVehicleMode &&
          this._lastScenarioMode === isScenario) {
        return;
      }

      if (this._presetTitleWindow) {
        this._presetTitleWindow.visible = false;
        this._presetTitleWindow.opacity = 0;
      }
      if (this._presetWindow) {
        this._presetWindow.visible = false;
        this._presetWindow.opacity = 0;
      }

      let leftHtml = "";
      let rightHtml = "";

      if (isScenario) {
        const scenarioContent = this._renderScenarioDossierHtml();
        this._dndContainer.innerHTML = `
          <div class="cc-unified-layout">
            <div class="cc-top-folder-tabs-slot">${this._renderTopFolderTabsHtml()}</div>
            <div class="cc-dossier-main">
              ${scenarioContent}
            </div>
          </div>
        `;
        this._lastIndex = activeIndex;
        this._lastStep = currentStep;
        this._lastPresetMode = isPreset;
        this._lastMemberIndex = currentMemberIndex;
        this._lastPetMode = isPetMode;
      this._lastVehicleMode = isVehicleMode;
        this._lastVehicleMode = isVehicleMode;
        this._lastScenarioMode = isScenario;
        return;
      }

      if (Scene_CharacterCreation._isPetMode) {
        // The dossier moved to the sidebar, so the roster takes the whole board.
        leftHtml = this._petPickerLeftHtml();
        rightHtml = "";
      } else if (isVehicleMode) {
        leftHtml = this._vehiclePickerLeftHtml();
        rightHtml = "";
      } else if (isPreset) {
        leftHtml = this._presetPickerLeftHtml(activeIndex);
        rightHtml = this._presetPickerRightHtml(activeIndex);
      } else {
        const stepData = this.currentStepData();

        if (this._step === STEP.TRAITS || this._isTraitPickerStep()) {
          leftHtml = this._traitPickerLeftHtml();
          rightHtml = this._traitPickerRightHtml();
        } else if (this._step === STEP.SPECIALIZATIONS || this._isSpecsPickerStep()) {
          leftHtml = this._specsPickerLeftHtml();
          rightHtml = this._specsPickerRightHtml();
        } else if (this._step === STEP.BIO || this._isBioPickerStep()) {
          leftHtml = this._bioPickerLeftHtml();
          rightHtml = this._bioPickerRightHtml();
        } else if (this._step === STEP.ROMANCE) {
          leftHtml = this._romancePickerLeftHtml();
          rightHtml = this._romancePickerRightHtml();
        } else if (this._step === STEP.CLASS || this._isClassPickerStep()) {
          leftHtml = this._classPickerLeftHtml(stepData, activeIndex);
          rightHtml = this._classPickerRightHtml(stepData, activeIndex);
        } else if (this._step === STEP.GENDER && this._isCurrentMemberCreature()) {
          leftHtml = this._archetypeStepLeftHtml();
          rightHtml = this._archetypeStepRightHtml();
        } else if (this._step === STEP.GENDER) {
          // A person is never asked here any more: the step hands straight over
          // to the sprite and name screens (setupStep), and their gender comes
          // off the sprite and is changed on the Bio tab. Nothing to draw.
          leftHtml = `<div class="cc-page cc-page-left"></div>`;
          rightHtml = `<div class="cc-page cc-page-right"></div>`;
        } else {
          // Every other step asks its own question. It used to be drawn by the
          // class picker, which looked the highlighted row up in $dataClasses
          // and so headed the birth-date, hometown and personality boards with a
          // class name and a class passive nobody had asked about.
          leftHtml = this._choiceStepFullHtml(stepData, activeIndex);
          rightHtml = "";
        }
      }

      const unifiedLayout = this._dndContainer.querySelector(".cc-unified-layout");
      if (!unifiedLayout || this._lastScenarioMode !== isScenario || this._lastPetMode !== isPetMode || this._lastVehicleMode !== isVehicleMode || this._lastPresetMode !== isPreset) {
        this._dndContainer.innerHTML = `
          <div class="cc-unified-layout">
            <div class="cc-top-folder-tabs-slot">${this._renderTopFolderTabsHtml()}</div>
            <div class="cc-dossier-main">
              <div class="cc-sidebar-slot">${this._renderCompactSidebarHtml()}</div>
              <div class="cc-content-pane${this._presetEditBlocked() ? ' cc-preset-locked' : ''}">
                <div class="cc-pockets-spread">
                  ${leftHtml}
                  ${rightHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        this._refreshTopFolderTabs();

        const pane = this._dndContainer.querySelector(".cc-content-pane");
        if (pane) pane.classList.toggle("cc-preset-locked", this._presetEditBlocked());

        const sidebarSlot = this._dndContainer.querySelector(".cc-sidebar-slot");
        if (sidebarSlot) {
          sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
        } else {
          const sidebar = this._dndContainer.querySelector(".cc-compact-sidebar");
          if (sidebar) sidebar.outerHTML = this._renderCompactSidebarHtml();
        }

        const spread = this._dndContainer.querySelector(".cc-pockets-spread");
        if (spread) {
          spread.innerHTML = `
            ${leftHtml}
            ${rightHtml}
          `;
        }
      }

      this._lastIndex = activeIndex;
      this._lastStep = currentStep;
      this._lastPresetMode = isPreset;
      this._lastMemberIndex = currentMemberIndex;
      this._lastPetMode = isPetMode;
      this._lastVehicleMode = isVehicleMode;
      this._lastScenarioMode = isScenario;

      if (isPetMode) {
        this._attachPetVirtualScroll();
      }
    }

    // Swaps one whole page column of the spread for freshly built markup.
    // The builders already return the column's own <div class="cc-page ...">
    // wrapper, so the wrapper is swapped along with its contents. The old code
    // tried to strip that wrapper with a regex that only matched wrappers
    // carrying nothing but a class attribute; every builder that also sets an
    // inline style slipped through, so a whole new page was nested INSIDE the
    // page being refreshed. .cc-page is 45%/55% wide and never shrinks, so each
    // hover or pick shrank the column to a fraction of the one before it until
    // the board was unreadable.
    _ccSwapPage(el, html) {
      if (!el) return null;
      const holder = document.createElement("template");
      holder.innerHTML = String(html).trim();
      const fresh = holder.content.firstElementChild;
      if (!fresh) { el.innerHTML = ""; return el; }
      // A page entering the spread fades and slides in; that is meant for a
      // genuine step change, not for the dozens of swaps a hovering cursor
      // makes, so a swapped-in page is exempted from it.
      fresh.classList.add("cc-no-anim");
      const scroller = el.scrollTop;
      el.replaceWith(fresh);
      fresh.scrollTop = scroller;
      return fresh;
    }

    // The plain board every step that is not one of the bespoke ones is drawn
    // with: the step's own title, the highlighted choice's own name and its own
    // description, and its choices as cards. No database lookup of any kind, so
    // nothing from an unrelated table can leak into the header.
    static currentMemberIsCreature() {
      const actor = this.getCurrentActor();
      const memberIndex = this._currentPartyMemberIndex || 0;
      return !!(actor && (actor._isCreatureActor || $gameSwitches.value(77 + memberIndex)));
    }

    static syncCreatureModeToCurrentMember() {
      this._isCreatureMode = this.currentMemberIsCreature();
      return this._isCreatureMode;
    }

    // True while the member being built is a creature, whichever way it was
    // made one. The static flag alone lies after a party-tab switch, so the
    // member's own record is what answers.
    _refreshTopFolderTabs() {
      const container = this._dndContainer;
      if (!container) return;
      const slot = container.querySelector(".cc-top-folder-tabs-slot");
      if (slot) { slot.innerHTML = this._renderTopFolderTabsHtml(); return; }
      const bar = container.querySelector(".cc-dossier-top-bar");
      if (bar) bar.outerHTML = this._renderTopFolderTabsHtml();
    }

    // ── Sidebar Tabs & Completion Calculation ──
    _getCreationTabs() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const isSimple = Scene_CharacterCreation.isSimpleMode();

      // Bio leads the strip: it is where the character is named, given a face
      // and given a past, so it is the first thing a player is asked for.
      const bio = {
        id: "bio",
        iconIndex: 183,
        title: ccT('CharCreate.biography', 'Bio & Ideology'),
        subtitle: (actor && actor._bioSet) ? ccT('CharCreate.customized', "Customized") : ccT('CharCreate.optional', "Optional"),
        step: STEP.BIO
      };
      const klass = {
        id: "class",
        iconIndex: 322,
        title: ccT('CharCreate.class', "Class"),
        subtitle: (actor && $dataClasses[actor._classId] && window.CCDbName($dataClasses[actor._classId])) || ccT('CharCreate.pending', "Choose"),
        step: STEP.CLASS
      };

      const traits = {
        id: "traits",
        iconIndex: 87,
        title: ccT('CharCreate.traits', 'Traits'),
        subtitle: actor && actor._selectedTraits && actor._selectedTraits.length > 0 ? `${actor._selectedTraits.length} traits` : ccT('CharCreate.optional', "Optional"),
        step: STEP.TRAITS
      };

      // Simple mode still picks its own traits: they are the one choice that
      // changes how a character plays rather than how they read, so the board
      // is offered here too. Specialization points are not asked for at all in
      // this mode; they are spent for the player when the party is confirmed
      // (see _ensureSimpleModeStatsAndTraits).
      if (isSimple) {
        // Story mode is played as a written character: her traits and the
        // specializations her history gave her are already on the sheet, so
        // both pages are offered to be read even in the simple strip. The ties
        // page is offered too, and it is the one page there she is actually
        // written on (see _presetLockFreeStep).
        if (Scene_CharacterCreation._storyMode) {
          return [bio, {
            id: "romance",
            iconIndex: 84,
            title: ccT('CharCreate.romanceTab', 'Romance & Bonds'),
            subtitle: (actor && actor._ccRomance) ? ccT('CharCreate.customized', "Customized") : ccT('CharCreate.optional', "Optional"),
            step: STEP.ROMANCE
          }, traits, {
            id: "specializations",
            iconIndex: 126,
            title: ccT('CharCreate.specializations', 'Specializations'),
            subtitle: (actor && actor._specPointsSpent ? `${actor._specPointsSpent} pts` : ccT('CharCreate.optional', "Optional")),
            step: STEP.SPECIALIZATIONS
          }];
        }
        return [bio, traits];
      }

      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !!(actor && (actor._isCreatureActor || $gameSwitches.value(77 + memberIndex)));

      // Romance sits beside Bio: the same dossier question, asked about who
      // the character is drawn to rather than about what they are.
      const romance = {
        id: "romance",
        iconIndex: 84,
        title: ccT('CharCreate.romanceTab', 'Romance & Bonds'),
        subtitle: (actor && actor._ccRomance) ? ccT('CharCreate.customized', "Customized") : ccT('CharCreate.optional', "Optional"),
        step: STEP.ROMANCE
      };
      const archetype = {
        id: "archetype",
        iconIndex: 292,
        title: ccT('CharCreate.archetype', "Archetype"),
        subtitle: archetypeDisplayName(actorArchetypeKey(actor)) || ccT('CharCreate.pending', "Choose"),
        step: STEP.GENDER
      };
      const specializations = {
        id: "specializations",
        iconIndex: 126,
        title: ccT('CharCreate.specializations', 'Specializations'),
        subtitle: (actor && actor._specPointsSpent ? `${actor._specPointsSpent} pts` : ccT('CharCreate.optional', "Optional")),
        step: STEP.SPECIALIZATIONS
      };

      return isCreature
        ? [bio, romance, archetype, klass, traits, specializations]
        : [bio, romance, klass, traits, specializations];
    }

    _isTabCompleted(tabId) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return false;
      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !!(actor._isCreatureActor || $gameSwitches.value(77 + memberIndex));

      switch (tabId) {
        case "archetype":
          return isCreature ? !!(actor._creatureArchetypes && actor._creatureArchetypes.length > 0) : true;
        case "appearance":
        case "identity":
          return !!(actor.name() && actor.name().trim() && actor.name() !== "Unnamed" && actor.name() !== "Harold" && actor.characterName() && actor.characterName().length > 0);
        case "class":
          return !!(actor._classId && actor._classId > 0);
        case "traits":
        case "specializations":
        case "bio":
        case "romance":
        case "personality":
          return true; // Optional steps
        case "origin":
          return !!($gameSystem._ccOriginSymbol || actor._originSymbol);
        default:
          return true;
      }
    }

    // How a character is portrayed is not a choice any more: a person wears a
    // hand-drawn bust, a creature wears its sculpted 3D model. So this opens
    // the one editor that belongs to what the member already is.
    onOpenProfileVisualEditor() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !!(actor._isCreatureActor || $gameSwitches.value(77 + memberIndex));

      if (isCreature && window.Scene_CC3DModel && window.CC3DModel &&
          window.CC3DModel.isAvailable && window.CC3DModel.isAvailable()) {
        const archetypes = actor._creatureArchetypes || [DEFAULT_CREATURE_ARCHETYPE];
        window.Scene_CC3DModel.setup(actor.actorId(), Scene_CharacterCreation, {
          creature: true,
          initArchetypes: archetypes,
          returnByPop: true,
          confirmPops: 1
        });
        this.markReturnStep();
        this.closeStepUI();
        SceneManager.push(window.Scene_CC3DModel);
        return;
      }

      this.onOpenSpriteGallery();
    }

    onSetCharacterType(type) {
      // The story mode is played as the dossier it opened on (see _renderTypePillsHtml).
      if (Scene_CharacterCreation._storyMode) { SoundManager.playBuzzer(); return; }
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const creatureSwitchId = 77 + currentMemberIndex;
      const actor = Scene_CharacterCreation.getCurrentActor();

      // The type pills are the one way out of a taken dossier: every other
      // control still refuses a locked preset actor, but clicking a pill here
      // (Humanoid, Creature, or Preset again to browse a different one) drops
      // the lock instead of being refused, or the player would be stuck with
      // whatever dossier they first applied with no way back.
      if (this._isActorLockedPreset(actor)) {
        this._clearPresetLock(actor);
      }

      if (type === 'preset') {
        this.showPresetSelection();
        return;
      }

      if (this._presetWindow) {
        this.onPresetCancel();
      }

      if (type === 'creature') {
        $gameSwitches.setValue(creatureSwitchId, true);
        Scene_CharacterCreation._isCreatureMode = true;
        if (actor) {
          actor._isCreatureActor = true;
          if (actor._classId < 63) {
            actor.changeClass(65, false);
          }
          if (!actorArchetypeKey(actor)) {
            const archetypes = creatureArchetypeKeys().filter((k) => k !== "Humanoid");
            const randomArch = archetypes[Math.floor(Math.random() * archetypes.length)] || DEFAULT_CREATURE_ARCHETYPE;
            applyArchetypeToActor(actor, randomArch);
          }
          if (actor.setPortraitMode) actor.setPortraitMode("model");
          applyArchetypeToActor(actor, actorArchetypeKey(actor));
          // Whatever happened above, the member leaves here with a model to be
          // drawn as: a creature is never portrayed by a borrowed 2D bust.
          ensureCreatureModel(actor);
        }
      } else {
        $gameSwitches.setValue(creatureSwitchId, false);
        Scene_CharacterCreation._isCreatureMode = false;
        if (actor) {
          actor._isCreatureActor = false;
          if (actor._classId >= 63) {
            actor.changeClass(1, false);
          }
          if (actor.setPortraitMode) actor.setPortraitMode("bust");
          // Coming back from the creature branch, the body the creature was
          // built on must go with it: left in place, the member stayed a goblin
          // with a human class. The archetype, its grafts and the 3D config it
          // implied are all put back to plain Humanoid.
          actor._creatureArchetypes = null;
          actor._ccGraftedParts = null;
          actor._ccReplacedParts = null;
          applyArchetypesToActor(actor, ["Humanoid"]); // i18n-ignore: Archetypes.json key
          const CC3D = window.CC3DModel;
          if (CC3D && CC3D.setConfig) CC3D.setConfig(actor.actorId(), null);
          if (CC3D && CC3D.setCreatureSeed) CC3D.setCreatureSeed(actor.actorId(), null);
        }
      }

      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onTabClick(stepIndex, tabId) {
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = false;
      Scene_CharacterCreation._isScenarioMode = false;
      // Only a deliberate visit to the Class tab opens the class step for a
      // creature; the linear flow still walks past it.
      this._classStepRequested = (tabId === "class");
      if (this._presetWindow) {
        this.onPresetCancel();
      }
      if (tabId === "specializations") {
        this._step = STEP.SPECIALIZATIONS;
      } else if (tabId === "bio") {
        this._step = STEP.BIO;
      } else if (tabId === "romance") {
        this._step = STEP.ROMANCE;
      } else if (tabId === "traits") {
        this._step = STEP.TRAITS;
      } else if (tabId === "origin") {
        this._step = STEP.ORIGIN;
        Scene_CharacterCreation._isScenarioMode = true;
      } else if (tabId === "class") {
        this._step = STEP.CLASS;
      } else if (tabId === "identity" || tabId === "archetype") {
        this._step = STEP.GENDER;
      } else {
        this._step = stepIndex;
      }
      this.setupStep();
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onSettingsTabClick() {
      this._pageRailFocused = false;
      Scene_CharacterCreation._railFocus = null;
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = false;
      Scene_CharacterCreation._isScenarioMode = false;
      if (this._presetWindow) {
        this.onPresetCancel();
      }
      this._step = STEP.SETTINGS;
      this.setupStep();
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onSetSimpleMode(isSimple) {
      Scene_CharacterCreation._isSimpleMode = !!isSimple;
      if ($gameSystem) $gameSystem._ccIsSimpleMode = Scene_CharacterCreation._isSimpleMode;
      SoundManager.playCursor();
      if (Scene_CharacterCreation._isSimpleMode) {
        // Traits are a simple-mode page too, so switching modes on that board
        // leaves the player where they were rather than kicking them to Bio.
        if (this._step !== STEP.BIO && this._step !== STEP.TRAITS && this._step !== STEP.SETTINGS && this._step !== STEP.ORIGIN) {
          this._step = STEP.BIO;
        }
      }
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onToggleCreationMode(event) {
      if (event) event.stopPropagation();
      this.onSetSimpleMode(!Scene_CharacterCreation.isSimpleMode());
    }

    // ── The rail on the open page (trait / talent / companion categories) ──
    //
    // These used to be mouse-only: nothing on a pad could reach them, so a
    // player on a controller saw whichever category the board opened on and no
    // other. They are reached the way a list is reached, by walking up off the
    // top row of the grid; Left and Right then walk the rail and the board
    // follows, and Down (or Confirm) drops back onto the cards.
    _activePageRail() {
      if (Scene_CharacterCreation._isPetMode) {
        return {
          ids: this._petCategories().map((c) => c.id),
          active: Scene_CharacterCreation._activePetCategory || "all",
          select: (id) => this.onPetCategorySelect(id),
        };
      }
      if (this._step === STEP.TRAITS) {
        return {
          ids: this._traitCategories().map((c) => c.id),
          active: Scene_CharacterCreation._activeTraitCategory || "all",
          select: (id) => this.onTraitCategorySelect(id),
        };
      }
      if (this._step === STEP.SPECIALIZATIONS) {
        return {
          ids: this._specsCategories(),
          active: Scene_CharacterCreation._activeSpecCategory || "All",
          select: (id) => this.onSpecCategorySelect(id),
        };
      }
      return null;
    }

    _leavePageRail(playSound) {
      if (!this._pageRailFocused) return;
      this._pageRailFocused = false;
      if (playSound) SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // Returns true when the rail has taken the press.
    updatePageRailInput(windowObj) {
      const rail = this._activePageRail();
      if (!rail || rail.ids.length < 2) {
        this._pageRailFocused = false;
        return false;
      }

      if (!this._pageRailFocused) {
        // Up off the top row steps onto the rail above the grid.
        const onTopRow = !windowObj ||
          (windowObj.index() < (windowObj.maxCols ? windowObj.maxCols() : 1));
        if (onTopRow && (Input.isTriggered("up") || Input.isRepeated("up"))) {
          this._pageRailFocused = true;
          SoundManager.playCursor();
          this._lastStep = -1;
          this._lastIndex = -1;
          this.refreshUIOverlayDOM();
          return true;
        }
        return false;
      }

      const cur = Math.max(0, rail.ids.indexOf(rail.active));
      if (Input.isTriggered("right") || Input.isRepeated("right")) {
        rail.select(rail.ids[(cur + 1) % rail.ids.length]);
        return true;
      }
      if (Input.isTriggered("left") || Input.isRepeated("left")) {
        rail.select(rail.ids[(cur - 1 + rail.ids.length) % rail.ids.length]);
        return true;
      }
      if (Input.isTriggered("down") || Input.isRepeated("down") || Input.isTriggered("ok")) {
        this._leavePageRail(true);
        return true;
      }
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        this._leavePageRail(false);
        return true;
      }
      return true;
    }

    // ── The top rail, walked with the shoulder buttons ─────────────────────
    //
    // L1 / R1 (and TAB, for a keyboard) step along the rail exactly as they
    // step along the backpack's category tabs: Settings, then the party in
    // order, then the empty seat if the party is short one, then the
    // companion. Landing on the empty seat does not open a page - there is no
    // character there yet - so it is marked as the resting slot and Confirm
    // fills it.
    _topRailEntries() {
      const entries = [{ kind: "settings" }];
      const size = $gameParty ? $gameParty.size() : 0;
      for (let i = 0; i < size; i++) entries.push({ kind: "member", index: i });
      if (size < 3 && !Scene_CharacterCreation._storyMode) entries.push({ kind: "add" });
      entries.push({ kind: "pet" });
      // No garage in the story mode: it sets out in The Beast (see the vehicle tab).
      if (!Scene_CharacterCreation._storyMode) entries.push({ kind: "vehicle" });
      return entries;
    }

    _topRailIndex(entries) {
      if (Scene_CharacterCreation._railFocus === "add") {
        const i = entries.findIndex((e) => e.kind === "add");
        if (i >= 0) return i;
      }
      const stepData = this._step < CharacterCreationData.length ? CharacterCreationData[this._step] : null;
      const isSettings = this._step === STEP.SETTINGS || (stepData && stepData.isSettingsStep);
      if (isSettings) return 0;
      if (Scene_CharacterCreation._isPetMode) {
        const i = entries.findIndex((e) => e.kind === "pet");
        if (i >= 0) return i;
      }
      if (Scene_CharacterCreation._isVehicleMode) {
        const i = entries.findIndex((e) => e.kind === "vehicle");
        if (i >= 0) return i;
      }
      const member = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const i = entries.findIndex((e) => e.kind === "member" && e.index === member);
      return i >= 0 ? i : 0;
    }

    _openTopRailEntry(entry) {
      if (!entry) return;
      if (entry.kind !== "add") Scene_CharacterCreation._railFocus = null;
      switch (entry.kind) {
        case "settings": this.onSettingsTabClick(); break;
        case "member":   this.onPartyMemberTabClick(entry.index); break;
        case "pet":      this.onPetTabClick(); break;
        case "vehicle":  this.onVehicleTabClick(); break;
        case "add":
          Scene_CharacterCreation._railFocus = "add";
          SoundManager.playCursor();
          this._lastStep = -1;
          this._lastIndex = -1;
          this.refreshUIOverlayDOM();
          break;
      }
    }

    cycleTopRail(direction) {
      const entries = this._topRailEntries();
      if (entries.length < 2) return;
      const cur = this._topRailIndex(entries);
      const next = (cur + direction + entries.length) % entries.length;
      this._openTopRailEntry(entries[next]);
    }

    // Read before any other input on every page of the wizard, so the rail is
    // reachable from wherever the cursor happens to be. Returns true when it
    // has taken the press.
    updateTopRailInput() {
      if (Scene_CharacterCreation._isScenarioMode || this._step === STEP.ORIGIN) return false;
      // L1/PageUp back, R1/PageDown and Tab forward, Shift+Tab back: the one
      // reading of the rail inputs, shared by every rail in creation.
      const railDir = window.CCNav ? window.CCNav.railDir() : 0;
      if (railDir) { this.cycleTopRail(railDir); return true; }
      // Resting on the empty seat: Confirm fills it, Cancel steps back onto the
      // last party tab. Nothing else on the page may read the pad meanwhile.
      if (Scene_CharacterCreation._railFocus === "add") {
        if (Input.isTriggered("ok")) {
          this.onAddPartyMember();
          return true;
        }
        if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
          Scene_CharacterCreation._railFocus = null;
          SoundManager.playCancel();
          this._lastStep = -1;
          this._lastIndex = -1;
          this.refreshUIOverlayDOM();
          return true;
        }
        return true;
      }
      return false;
    }

    onNameChange(newName) {
      if (this._presetEditBlocked()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor || !newName || !newName.trim()) return;
      actor.setName(newName.trim());
      // The field that fired this sits IN the sidebar, and the board is redrawn
      // every frame, so invalidating the memo here threw the input away between
      // one keystroke and the next and the caret went with it: a name could only
      // ever be typed one letter at a time. The memo is deliberately left valid
      // and only the party tab, the other place the name shows, is rewritten.
      this._refreshTopFolderTabs();
    }

    onRandomizeNameClick() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (actor) {
        const generated = Scene_CharacterCreation.generateRandomMarkovName(Scene_CharacterCreation._currentPartyMemberIndex || 0);
        actor.setName(generated);
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
      }
    }

    // Handing the screen to a gallery is a round trip: SceneManager.pop builds
    // a BRAND NEW wizard on the way back, and with nothing remembered that
    // wizard opened on step 0 - the initial settings page - instead of the
    // character whose portrait or sprite was just clicked. Leaving the step
    // behind as the resume point is what makes Escape (and the pad's B, and
    // the right mouse button) land back on the sheet it was called from.
    markReturnStep() {
      Scene_CharacterCreation._startStep = this._step;
    }

    // The sprite is the character's map body, not its portrait: a creature
    // keeps its own route in here exactly like a humanoid does, just scoped
    // to the animal/monster sheets the grid already carries flagged in
    // NPCs.json (CharacterSpriteGridSelector.optionsForAudience). Its 3D
    // battle model has its own editor (onOpenCreature3DStudio / the sidebar's
    // "3D Studio" button); this is only ever the walking sheet.
    onOpenSpriteGallery() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();

      const selectorScene = window.Scene_CharacterSpriteGridSelector || window.Scene_SpriteGridSelector;
      if (selectorScene) {
        if (selectorScene.setup) {
          selectorScene.setup(actor ? actor.actorId() : 1, Scene_CharacterCreation);
        }
        this.markReturnStep();
        this.closeStepUI();
        SceneManager.push(selectorScene);
        if (SceneManager._nextScene && SceneManager._nextScene.setActor) {
          SceneManager._nextScene.setActor(actor ? actor.actorId() : 1);
        }
      }
    }

    // Clicking the sidebar portrait asks one question only: which bust. The
    // sprite keeps its own route in through the avatar beside the name.
    onOpenBustGallery() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (actor && actor._isCreatureActor) {
        this.onOpenCreature3DStudio();
        return;
      }
      if (!window.Scene_BustSelector) {
        this.onOpenSpriteGallery();
        return;
      }
      // Pushed straight over the wizard, so confirming pops once and lands
      // back here instead of hunting for a sprite grid that was never opened.
      window.Scene_BustSelector._confirmPops = 1;
      this.markReturnStep();
      this.closeStepUI();
      SceneManager.push(window.Scene_BustSelector);
      if (SceneManager._nextScene && SceneManager._nextScene.setActor) {
        SceneManager._nextScene.setActor(actor ? actor.actorId() : 1);
      }
    }

    onSelectCreatureArchetype(modelKey) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      // The dropdown offers archetypes, so the key is always one Archetypes.json
      // knows; storing it unchanged used to leave the member with a spelling the
      // body-part merge could not resolve, i.e. a creature with no body at all.
      if (!applyArchetypeToActor(actor, modelKey)) {
        SoundManager.playBuzzer();
        return;
      }
      this._repaintArchetypeStep();
    }

    // The sidebar's other half. An empty value is the None entry: the member
    // goes back to being built from its primary alone.
    onSelectCreatureSecondaryArchetype(modelKey) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (!applySecondaryArchetypeToActor(actor, modelKey || null)) {
        SoundManager.playBuzzer();
        return;
      }
      this._repaintArchetypeStep();
    }

    onOpenCreature3DStudio() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (window.Scene_CC3DModel && window.CC3DModel && window.CC3DModel.isAvailable && window.CC3DModel.isAvailable()) {
        // Sculpting one is what makes the model the creature's portrait.
        if (actor.setPortraitMode) actor.setPortraitMode("model");
        const archetypes = (actor && actor._creatureArchetypes) || [actor._currentArchetype || DEFAULT_CREATURE_ARCHETYPE];
        window.Scene_CC3DModel.setup(actor.actorId(), Scene_CharacterCreation, {
          creature: true,
          initArchetypes: archetypes,
          returnByPop: true,
          confirmPops: 1
        });
        this.markReturnStep();
        this.closeStepUI();
        SceneManager.push(window.Scene_CC3DModel);
      }
    }

    _ensureActorLore(actor, genderVal) {
      if (!actor || !actor.name()) return null;
      const name = actor.name();
      try {
        // Backstory pulls from the world timeline; run history once if absent.
        // Read through HistoryManager so the active-world store (WorldManager)
        // and the $gameSystem fallback are treated uniformly.
        const hasHistory = window.HistoryManager
          ? window.HistoryManager.getEvents().length
          : ($gameSystem._historicalEvents && $gameSystem._historicalEvents.length);
        if (!hasHistory && !this._loreHistoryRan && window.HistoryManager) {
          this._loreHistoryRan = true;
          window.HistoryManager.runSimulation();
        }
        if (window.NPCSocietyRegistry) {
          const cls = actor.currentClass();
          const profile = window.NPCSocietyRegistry.ensureProfile(name, cls ? cls.id : null);
          // Somebody the player built is not dealt a political party by the
          // simulation: NPCPolitics reads this flag and leaves them unaffiliated
          // unless the detailed sheet declared one (profile.declaredPartyName).
          if (profile) profile.playerCreated = true;
          // Drive backstory pronouns from the gender the player picked here
          // (0 he, 1 she, 2 they, 3 xe). Regenerate the cached backstory if the
          // gender changed so the narrative and the NPC wiki stay in sync.
          if (profile && typeof genderVal === "number" && profile.gender !== genderVal) {
            profile.gender = genderVal;
            profile.backstory = null;
          }
          // Flag creatures so the backstory reads "born in the wilds near
          // <city>" instead of being born into a nation. A creature that took a
          // class of its own is still a creature, so the built flag decides and
          // the Monster class is only the fallback signal.
          const isCreature =
            !!actor._isCreatureActor || (cls ? cls.id === 65 : false);
          if (profile && profile.isCreature !== isCreature) {
            profile.isCreature = isCreature;
            profile.backstory = null;
          }
        }
        if (window.NPCHistSim) window.NPCHistSim.generateBackstoryNow(name);
      } catch (e) {
        console.warn("CharacterCreation: ensureActorLore failed", e);
      }
      return window.NPCSocietyRegistry ? window.NPCSocietyRegistry.getProfile(name) : null;
    }

    // --- Class step: right-page details for the highlighted entry ----------

    // True when the CLASS step renders the list-left / details-right spread.
    // Creature mode keeps its own inline layout.
    _ccIconStyle(iconIndex, size = 32) {
      return window.CCArt.icon(iconIndex, size);
    }

    onOptionCardClick(index) {
      if (this._refusePresetEdit()) return;
      if (!this._gridWindow) return;
      const stepData = this.currentStepData();
      if (stepData && stepData.choices && stepData.choices[index]) {
        const choice = stepData.choices[index];
        const actor = Scene_CharacterCreation.getCurrentActor();

        if (this._step === STEP.CLASS) {
          this._gridWindow.select(index);
          if (choice.symbol && choice.symbol.indexOf("quick_class_") === 0) {
            const classId = choice.value;
            if (actor) {
              actor.changeClass(classId, true);
              if (typeof equipRandomCompatibleWeapon === "function") equipRandomCompatibleWeapon(actor, classId);
              if (typeof equipClassStartingArmor === "function") equipClassStartingArmor(actor, classId);
              if (typeof giveClassStartingItems === "function") giveClassStartingItems(actor, classId);
            }
          } else if (choice.symbol === "select_class") {
            window.$ccArchetypeClassFilter = null;
            window.$ccCreatureClassFlow = null;
            this.closeStepUI();
            SceneManager.goto(Scene_ClassSelection);
            return;
          } else if (choice.symbol === "mana_cyborg") {
            if (actor) {
              actor.changeClass(66, false);
              if (typeof equipRandomCompatibleWeapon === 'function') equipRandomCompatibleWeapon(actor, 66);
              if (typeof equipClassStartingArmor === "function") equipClassStartingArmor(actor, 66);
              if (typeof giveClassStartingItems === "function") giveClassStartingItems(actor, 66);
            }
          } else if (choice.symbol === "random_class") {
            const validClassIds = window.CreatureClasses ? window.CreatureClasses.sentientRoster() : [];
            if (validClassIds.length > 0 && actor) {
              const rId = validClassIds[Math.floor(Math.random() * validClassIds.length)];
              actor.changeClass(rId, true);
              if (typeof equipRandomCompatibleWeapon === "function") equipRandomCompatibleWeapon(actor, rId);
              if (typeof equipClassStartingArmor === "function") equipClassStartingArmor(actor, rId);
              if (typeof giveClassStartingItems === "function") giveClassStartingItems(actor, rId);
            }
          }
        } else if (this._step === STEP.ORIGIN) {
          const isAlreadySelected = (this._gridWindow.index() === index) && ($gameSystem._ccOriginSymbol === choice.symbol);
          this._gridWindow.select(index);
          if (choice.symbol) {
            this._selectedOrigin = choice.symbol;
            $gameSystem._ccOriginSymbol = choice.symbol;
            if (actor) actor._originSymbol = choice.symbol;
            if (typeof captureOriginSnapshot === "function") captureOriginSnapshot();
          }
          if (isAlreadySelected) {
            this.onFinishPartyCreation();
            return;
          }
        } else if (this._step === STEP.PERSONALITY) {
          this._gridWindow.select(index);
          if (actor) {
            let pIdx = 0;
            if (choice.symbol === "personality_random") {
              const catalog = personalityCatalog();
              if (catalog.length > 0) {
                pIdx = Math.floor(Math.random() * catalog.length);
              }
            } else {
              pIdx = Number.isFinite(Number(choice.value)) ? Number(choice.value) : index;
            }
            actor._personalityIndex = pIdx;
            applyPersonalityIndex(actor.actorId(), pIdx);
          }
        } else if (this._step === STEP.HOMETOWN) {
          this._gridWindow.select(index);
          $gameSystem._ccHometown = choice.symbol;
        } else {
          this._gridWindow.select(index);
        }

        markStepCompleted(this._step);
      }

      const container = this._dndContainer;
      if (container) {
        const stepData2 = this.currentStepData();
        const choice2 = (stepData2 && stepData2.choices && stepData2.choices[index]) || {};

        // The class board is a spread whose roster is narrowed by its search
        // strip, so a card's position on screen is not its choice index:
        // both pages are rebuilt from the index instead of being patched by
        // DOM order, which used to highlight whichever card happened to sit
        // where the picked one would have been on the unfiltered board.
        if (this._step === STEP.CLASS || this._isClassPickerStep()) {
          Scene_CharacterCreation._classHoverIndex = index;
          this._ccSwapPage(container.querySelector(".cc-page-left"), this._classPickerLeftHtml(stepData2, index));
          this._ccSwapPage(container.querySelector(".cc-page-right"), this._classPickerRightHtml(stepData2, index));
          const sidebarSlot = container.querySelector(".cc-sidebar-slot");
          if (sidebarSlot) sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
          this._refreshTopFolderTabs();
          this._lastIndex = index;
          return;
        }

        // The scenario board's right page is the party as this scenario leaves
        // it: the exclusive kit and the money change with the choice, so the
        // whole spread is rebuilt rather than the highlight being moved.
        if (this._step === STEP.ORIGIN) {
          const dossier = container.querySelector(".cc-scenario-dossier");
          if (dossier) {
            dossier.outerHTML = this._renderScenarioDossierHtml();
            this._lastIndex = index;
            return;
          }
        }

        // Update selected option card styling
        const cards = container.querySelectorAll(".cc-card-option");
        cards.forEach((c, idx) => {
          c.classList.toggle("selected", idx === index);
        });

        // Every other board heads itself with the highlighted choice's own name
        // and description, which used to stay frozen on the first entry however
        // far the cursor moved.
        const headerH2 = container.querySelector(".cc-class-header h2");
        const headerP = container.querySelector(".cc-class-header p");
        if (headerH2) headerH2.textContent = choice2.name || "";
        if (headerP) headerP.textContent = this.cleanText(choice2.description || "");

        // Update sidebar
        const sidebar = container.querySelector(".cc-compact-sidebar");
        if (sidebar) sidebar.outerHTML = this._renderCompactSidebarHtml();

        // Update folder tabs
        this._refreshTopFolderTabs();

        this._lastIndex = index;
        return;
      }

      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onOptionCardConfirm(index) {
      this.onOptionCardClick(index);
    }


    start() {
      super.start();
      this._ccHandingOver = false;
      if (this._dndContainer) {
        window.CCPanel.show(this._dndContainer);
      }
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    createTitleWindow() {
      const rect = this.titleWindowRect();
      this._titleWindow = new Window_CharacterCreationTitle(rect);
      this.addWindow(this._titleWindow);
    }

    createGridWindow() {
      const rect = this.gridWindowRect();
      this._gridWindow = new Window_CharacterCreationGrid(rect);
      this._gridWindow.setScene(this);
      this._gridWindow.setHandler("ok", this.onGridOk.bind(this));
      // MODIFIED: Call onCancel instead of popScene
      this.addWindow(this._gridWindow);
    }

    titleWindowRect() {
      const width = Graphics.boxWidth;
      const height = this.calcWindowHeight(1, false);
      return new Rectangle(0, 0, width, height);
    }

    gridWindowRect() {
      const titleRect = this.titleWindowRect();
      const x = 0;
      const y = titleRect.y + titleRect.height;
      const width = Graphics.boxWidth;
      const height = Graphics.boxHeight - y;
      return new Rectangle(x, y, width, height);
    }

    setupStep() {
      if (this._step >= CharacterCreationData.length) {
        this.popScene();
        return;
      }

      // Skip purely static steps that carry no interactive UI: autoSkip steps,
      // and once-only steps already completed on a prior playthrough. This
      // mirrors nextStep() so that any manual `this._step++` landing on such a
      // step (e.g. a mode skip advancing onto worldHistory) advances cleanly
      // instead of rendering an empty step.
      {
        const sd = CharacterCreationData[this._step];
        if (sd.autoSkip ||
            (hasCompletedFirstCreation() && sd.showOnlyOnce && isStepCompleted(this._step))) {
          this._step++;
          this.setupStep();
          return;
        }
      }

      // ── Class step: clean up all learned character skills ──
      if (this._step === STEP.CLASS) {
        const currentActor = Scene_CharacterCreation.getCurrentActor();
        if (currentActor && currentActor._skills) {
          // Remove all learned skills (non-class skills)
          const learnedSkills = currentActor._skills.clone();
          learnedSkills.forEach(skillId => {
            currentActor.forgetSkill(skillId);
          });
        }
      }

      // Combat mode: step disabled for now (kept in code). Default to classic
      // RPG combat (switch 46 off) and skip without ever showing the choice,
      // for every creation mode. Remove this block to re-enable.
      if (this._step === STEP.COMBAT_MODE) {
        $gameSwitches.setValue(46, false);
        // Map Battle (BattleSystem/MapBattleMode.js) is a ConfigManager option,
        // not a save switch, so a copy of the game that has it on carries it
        // into a brand new party. The step's handler used to clear it; with the
        // step skipped, the FIRST creation of a playthrough clears it here so a
        // new game always starts on the classic battle scene. Later creations
        // (adding a party member) leave it alone: by then it is the player's own
        // Options > Gameplay choice.
        if (!hasCompletedFirstCreation()) {
          ConfigManager.mapBattleMode = false;
          ConfigManager.save();
        }
        markStepCompleted(STEP.COMBAT_MODE);
        this._step++;
        this.setupStep();
        return;
      }

      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isStoryMode = Scene_CharacterCreation._storyMode;
      // The skips below are the story mode's linear flow, and that flow is over
      // the moment its dossier has been taken: from there the pages are only
      // ever opened by a tab the player clicked, and a skip would force the
      // dossier's class back to the story mode's own, throw its traits away, or
      // walk off the end of a wizard that is not running.
      const storyModeFlowRunning = isStoryMode &&
        !(Scene_CharacterCreation.getCurrentActor() || {})._isPresetActor;

      // ── STORY_MODE MODE: auto-skip steps and silently apply defaults ──
      if (storyModeFlowRunning) {
        // Settings: skipped silently (kept at defaults) and marked complete.
        if (this._step === STEP.SETTINGS) {
          markStepCompleted(STEP.SETTINGS);
          this._step++;
          this.setupStep();
          return;
        }

        // Difficulty: always apply roguelite silently.
        if (STEP.DIFFICULTY != null && this._step === STEP.DIFFICULTY) {
          $gameSwitches.setValue(9, false);
          $gameSystem._bloodAndOilMode = false;
          $gameSwitches.setValue(33, true);
          markStepCompleted(STEP.DIFFICULTY);
          this._step++;
          this.setupStep();
          return;
        }

        // Combat mode: story mode always uses classic RPG combat (switch off).
        if (this._step === STEP.COMBAT_MODE) {
          $gameSwitches.setValue(46, false);
          markStepCompleted(STEP.COMBAT_MODE);
          this._step++;
          this.setupStep();
          return;
        }

        // Class: fixed to Mana Cyborg (class 66) in story mode - apply and skip.
        if (this._step === STEP.CLASS) {
          if (!Scene_CharacterCreation._isCreatureMode) {
            const currentActor = Scene_CharacterCreation.getCurrentActor();
            if (currentActor) {
              currentActor.changeClass(66, false);
              if (typeof equipRandomCompatibleWeapon === 'function') {
                equipRandomCompatibleWeapon(currentActor, 66);
              }
              if (typeof equipClassStartingArmor === "function") {
                equipClassStartingArmor(currentActor, 66);
              }
              if (typeof giveClassStartingItems === "function") {
                giveClassStartingItems(currentActor, 66);
              }
            }
          }
          this._step++;
          this.setupStep();
          return;
        }

        // Traits: skip entirely, no traits applied.
        if (this._step === STEP.TRAITS) {
          this._step++;
          this.setupStep();
          return;
        }

        // Add Party Member: never asked (only 1 character in story mode). One
        // question is still owed after it though, the vehicle, so the walk goes
        // on to that rather than ending here. No origin and no travel picker:
        // the story mode starts where it is being played, on the Icebush map, and
        // the player is meant to walk around it rather than be put straight on
        // a train out, so the origin step is where its creation ends.
        if (this._step === STEP.ADD_MEMBER) {
          this._step = STEP.VEHICLE;
          this.setupStep();
          return;
        }
      }
      // ── END STORY_MODE MODE skips ──

      // Creation mode: never asked during the story mode. Normal is applied
      // silently and the wizard moves straight on to the humanoid / creature
      // choice. (Guarded on the switch as well as the in-scene flag, like the
      // origin step below.) Detailed mode is the exception, the story mode offers
      // it, so the step is shown whenever CharacterCreationFull is loaded.
      if (this._step === STEP.CREATION_MODE && isStoryModeFlow() && !detailedModeAvailable()) {
        setCreationMode(CC_MODE.NORMAL);
        markStepCompleted(STEP.CREATION_MODE);
        this._step++;
        this.setupStep();
        return;
      }

      // Origin: not available while the story mode switch (100) is active. The
      // story mode has its own starting point, so creation just ends here and the
      // player stays where they are. (The in-scene _storyMode flag is
      // cleared at the add-member step, so guard on the switch directly.)
      if (this._step === STEP.ORIGIN && $gameSwitches.value(100)) {
        markStepCompleted(STEP.ORIGIN);
        // End-of-creation finalize (settings no longer does it). Idempotent.
        markFirstCreationComplete();
        // The story mode's flow is over here, so the flag that says it is running
        // is put down here too: it outlives the scene, and a later run of the
        // wizard would otherwise open on the story mode's dossier board again.
        Scene_CharacterCreation._storyMode = false;
        Scene_CharacterCreation._chaosPartyRolled = false;
        this.popScene();
        return;
      }

      // Character Type selection is integrated directly into the sidebar toggle.
      // Automatically advance past STEP.CHARACTER_TYPE.
      if (this._step === STEP.CHARACTER_TYPE) {
        this._step++;
        this.setupStep();
        return;
      }

      // Creatures do not meet class selection on the way through: every mode
      // builds them in the full creature scene, which settles their class, and
      // the wizard resumes past it. Asking for it by name is another matter -
      // the Class tab on a creature's dossier used to land here and be bounced
      // straight on to Traits, so the tab did nothing at all.
      if (this._step === STEP.CLASS && Scene_CharacterCreation._isCreatureMode &&
          !this._classStepRequested) {
        this._step++;
        this.setupStep();
        return;
      }

      // Gender & Identity Step: Interactive setup
      if (this._step === STEP.GENDER && storyModeFlowRunning) {
        this._step++;
        this.setupStep();
        return;
      }

      // The gender board is gone. A person's gender comes off the sprite they
      // are given (applyIdentityFromSprite) and is changed on the Bio tab
      // afterwards, so this step no longer asks anything: it opens the sprite
      // and name screens and moves on. A creature still owns the slot, where it
      // is the archetype board.
      if (this._step === STEP.GENDER && !this._isCurrentMemberCreature()) {
        this.leaveGenderStep();
        return;
      }

      // Traits Step: Interactive optional selection
      if (this._step === STEP.TRAITS && storyModeFlowRunning) {
        this._step++;
        this.setupStep();
        return;
      }

      // Personality: nothing to pick from without PersonalityData.json, and the
      // story mode does not ask (like traits and class). Either way the member
      // keeps the disposition their society profile was rolled with.
      if (this._step === STEP.PERSONALITY &&
          (storyModeFlowRunning || personalityCatalog().length === 0)) {
        this._step++;
        this.setupStep();
        return;
      }

      // Whatever else the chosen mode hides: the Full-only flavor steps
      // (hometown / birth date) in both board modes, plus Quick's portrait,
      // trait and personality steps, all already settled above.
      if (Scene_CharacterCreation._stepHiddenForMode(this._step)) {
        this._step++;
        this.setupStep();
        return;
      }

      // Skip "Add another party member?" step if party is already full (3 members)
      if (this._step === STEP.ADD_MEMBER && $gameParty.size() >= 3) {
        // Party is full, skip the add-member prompt and continue to the origin.
        this._step++;
        this.setupStep();
        return;
      }

      // Vehicle: the story mode's own question (see the vehicle step). Every
      // other run walks straight past it, and so does a story mode that has
      // already been given its keys.
      if (this._step === STEP.VEHICLE && (!isStoryModeFlow() || isStepCompleted(this._step))) {
        this._step++;
        this.setupStep();
        return;
      }

      // ── Initial Settings: initialize settings state ──
      if (this._step === STEP.SETTINGS) {
        this._settingsRows = this._buildSettingsRows();
        Scene_CharacterCreation._settingsRowIndex = 0;
        this._injectSettingsStyles();
        if (this._gridWindow) this._gridWindow.deactivate();
        this._lastSettingsHash = null; // force DOM refresh
        this.refreshUIOverlayDOM();
        return;
      }

      const stepData = this.currentStepData();
      this._titleWindow.setTitle(stepData.title);
      this._gridWindow.setChoices(stepData.choices);

      // The settings step deactivates the grid window (it has its own input
      // handler). Re-activate it on every interactive step so keyboard Back/OK
      // keep working afterwards (updateUIInput bails when the window is inactive),
      // otherwise cancel from later steps such as "add party member?" is a no-op (#102).
      this._gridWindow.activate();

      // NEW: Conditionally set cancel handler based on current step
      const firstStep = Scene_CharacterCreation.getStartingStep();
      // The character-type step is the starting step for the 2nd/3rd member
      // too, but Back there still has somewhere real to go (the previous
      // member's "add another?" prompt), so it keeps its cancel handler.
      const isLaterMemberTypeStep = this._step === STEP.CHARACTER_TYPE &&
        (Scene_CharacterCreation._currentPartyMemberIndex || 0) > 0;
      if (this._step <= firstStep && !isLaterMemberTypeStep) {
        // Completely disable cancel handler on first step
        this._gridWindow.setHandler("cancel", null);
      } else {
        // Enable cancel handler for subsequent steps
        this._gridWindow.setHandler("cancel", this.onCancel.bind(this));
      }
    }

    currentStepData() {
      return CharacterCreationData[this._step];
    }

    nextStep() {
      this._classStepRequested = false;
      this._step++;
      // autoSkip steps are always skipped; showOnlyOnce steps only once the
      // first creation is already complete.
      while (this._step < CharacterCreationData.length) {
        const stepData = CharacterCreationData[this._step];
        if (stepData.autoSkip ||
            (hasCompletedFirstCreation() && stepData.showOnlyOnce && isStepCompleted(this._step))) {
          this._step++;
        } else {
          break;
        }
      }
      this.setupStep();
    }

    // NEW: Handles going to the previous step.
    previousStep() {
      this._classStepRequested = false;
      // Character-type step for the second or third party member: this is
      // where "add_member" landed after adding the actor and jumping ahead,
      // so Back undoes exactly that (drops the actor it just added) and
      // returns to the previous member's "add another?" prompt instead of
      // falling through to the title screen.
      if (this._step === STEP.CHARACTER_TYPE && (Scene_CharacterCreation._currentPartyMemberIndex || 0) > 0) {
        const removedIndex = Scene_CharacterCreation._currentPartyMemberIndex;
        $gameParty.removeActor(removedIndex + 1); // Actor IDs are 1-based
        Scene_CharacterCreation._currentPartyMemberIndex = removedIndex - 1;
        Scene_CharacterCreation._isCreatureMode = false;
        this._step = STEP.ADD_MEMBER;
        this.setupStep();
        return;
      }

      // Returning from a "Randomize all party" jump: the whole party was filled
      // and the wizard leapt straight to the origin step. Back should undo that,
      // trim the auto-added members back to the first one, and return to the
      // character-type selection.
      if (this._step === STEP.ORIGIN && Scene_CharacterCreation._randomizedAllParty) {
        Scene_CharacterCreation._randomizedAllParty = false;
        $gameParty.members().slice().forEach((a) => {
          if (a.actorId() !== 1) $gameParty.removeActor(a.actorId());
        });
        Scene_CharacterCreation._currentPartyMemberIndex = 0;
        Scene_CharacterCreation._isCreatureMode = false;
        Scene_CharacterCreation._lastMemberWasRandom = false;
        this._step = STEP.CHARACTER_TYPE;
        this.setupStep();
        return;
      }

      // If we're in creature mode and at the gender step, go back to character
      // type selection and exit creature mode.
      if (Scene_CharacterCreation._isCreatureMode && this._step === STEP.GENDER) {
        this._step = STEP.CHARACTER_TYPE;
        Scene_CharacterCreation._isCreatureMode = false; // Exit creature mode
        this.setupStep();
        return;
      }

      // If we're in creature mode and at the traits step, go back to gender,
      // skipping the (creature-only) creation method and class steps.
      if (Scene_CharacterCreation._isCreatureMode && this._step === STEP.TRAITS) {
        this._step = STEP.GENDER;
        this.setupStep();
        return;
      }

      // Walk back to the previous interactive step, skipping every step that
      // setupStep() would immediately auto-advance past, and every step that
      // asks nothing of its own but hands straight over to another screen (the
      // gender slot of a person, which only opens the sprite and name screens).
      // Otherwise Back lands on a step that jumps forward again, making it a
      // no-op. Never go below the first interactive step.
      const firstStep = Scene_CharacterCreation.getStartingStep();
      this._step--;
      while (this._step > firstStep &&
             (Scene_CharacterCreation._stepAutoAdvances(this._step) ||
              Scene_CharacterCreation._stepHandsOverImmediately(this._step))) {
        this._step--;
      }
      if (this._step < firstStep) this._step = firstStep;
      this.setupStep();
    }
    // The story mode's last button: the sheet is read, the party is Em, and there
    // is nothing else to answer, so this ends creation outright. Any board
    // windows still standing over the spread come down first, the way leaving a
    // board any other way brings them down (see onPresetCancel).
    finishStoryModeCreation() {
      if (this._presetTitleWindow) {
        this._presetTitleWindow.close();
        this._presetTitleWindow = null;
      }
      if (this._presetWindow) {
        this._presetWindow.close();
        this._presetWindow = null;
      }
      this.onFinishPartyCreation();
    }

    onGridOk() {
      if (this._refusePresetEdit()) return;
      const stepData = this.currentStepData();
      const index = this._gridWindow.index();
      const choice = stepData.choices[index];
      if (!choice) {
        return;
    }
      if (stepData.handler) {
        stepData.handler.call(this, choice.symbol, index);
      }
    }

    // The chosen origin's own starting-place logic: grants, then puts the
    // party down somewhere. Shared by the origin step's handler (every mode
    // but Full, which runs this immediately) and the hometown step's handler
    // (Full mode, which runs this once a hometown from Destinations.json has
    // been picked).
    _finishOriginChoice(symbol) {
      // Whatever this origin decides below, the party is about to be set down
      // somewhere for the first time. Checked once on arrival, so no origin
      // can begin standing inside the scenery of a square that was generated
      // for it (see the landing pass in Scene_Map.onMapLoaded).
      if ($gameTemp) $gameTemp._ccOriginLanding = true;
      // Finalize the first creation here (end of the flow). This used to live
      // in the settings step, which now runs first, so it moved to the origin
      // step. markFirstCreationComplete is idempotent.
      markFirstCreationComplete();
      // Supplies and gear are handed out here and only here, from the single
      // ORIGIN_LOADOUTS table the "Starting Out" dossier reads, so no branch
      // below can duplicate an item or quietly hand out something unlisted.
      grantOriginLoadout(symbol);
      // Nobody starts unable to play cards. The collector's own branch deals
      // a shelf below; this is the floor everyone else stands on.
      if (symbol !== "origin_card_collector") grantMinimumCards();
      if (symbol === "origin_space") {
        // Begun off Earth: measured from the pad they lifted off from.
        anchorAtSpaceCenter();
        $gamePlayer.reserveTransfer(721, 27, 7, 2, 0);
      } else if (symbol === "origin_camper") {
        startVehicleOrigin("camper");
      } else if (symbol === "origin_car") {
        startVehicleOrigin("car");
      } else if (symbol === "origin_bike") {
        startBikeOrigin();
      } else if (symbol === "origin_lot") {
        startEmptyLotOrigin();
      } else if (symbol === "origin_dungeon") {
        startDungeonOrigin();
      } else if (symbol === "origin_mayor") {
        startMayorOrigin();
      } else if (symbol === "origin_criminal") {
        startCriminalOrigin();
      } else if (symbol === "origin_stranded") {
        startStrandedOrigin();
      } else if (symbol === "origin_bunker") {
        startBunkerOrigin();
      } else if (symbol === "origin_ceo") {
        startCEOOrigin();
      } else if (symbol === "origin_artifact") {
        startArtifactHeirOrigin();
      } else if (symbol === "origin_crash") {
        startCrashLandedOrigin();
      } else if (symbol === "origin_warlord") {
        startWarlordOrigin();
      } else if (symbol === "origin_faction_leader") {
        // Pauses the wizard and opens the faction picker; finishFactionOrigin
        // (called from its confirm callback) does the granting, and the
        // picker's own popScene() ends the wizard. Must not fall through to
        // the unconditional popScene() below, which would end the wizard
        // (and the freshly-pushed Scene_FactionStatus with it) immediately.
        startFactionPickerOrigin(true);
        return;
      } else if (symbol === "origin_deserter") {
        startFactionPickerOrigin(false);
        return;
      } else if (symbol === "origin_card_collector") {
        grantStartingCards();
        // A collector goes where the games are, and that is any city.
        startWorldMapPickerOrigin();
      } else if (symbol === "origin_arcanist") {
        startArcanistOrigin();
      } else if (symbol === "origin_mercenary") {
        startMercenaryOrigin();
      } else if (symbol === "origin_lost_convoker") {
        startLostConvokerOrigin();
      } else if (symbol === "origin_skeleton_key") {
        // Nothing but the key: every door in the world is as good a starting
        // point as any other, so the player says which one.
        startWorldMapPickerOrigin();
      } else if (symbol === "origin_plague") {
        // A carrier goes where the people are, and the case travels with them:
        // the player picks the city the first seal gets broken in.
        startWorldMapPickerOrigin();
      } else if (symbol === "origin_diplomat") {
        startDiplomatOrigin();
      } else if (symbol === "origin_hypernet_explorer") {
        startHypernetExplorerOrigin();
      } else if (symbol === "origin_augmented") {
        grantStartingAugments();
        // Nowhere in particular to be: the clinic is behind them and any
        // city on the map will do.
        startWorldMapPickerOrigin();
      } else if (symbol === "origin_train") {
        // The one origin that really boards the train: the starting service
        // only runs to the three beginner stations, which is the whitelist
        // FastTravelSystem applies to the 'train' network in creation mode.
        if ($gameTemp) {
          $gameTemp._openCharacterCreationTrainTravel = true;
          $gameTemp._characterCreationTravelType = "train";
          $gameTemp._characterCreationTravelMode = true;
        }
      } else {
        // Default: pick any city on the map and land there on foot.
        startWorldMapPickerOrigin();
      }
      // Everything this origin hands out has been handed out by now, so the
      // pack is trimmed back to 80% of what the party can carry before they
      // take their first step (see cullStartingOverload).
      cullStartingOverload();
      // The two faction origins returned above and land through
      // startWorldMapPickerOrigin, which answers this on its own; everything
      // else has just chosen a spot on a planet that is not there.
      if (startsAtOmegaTower()) startAtOmegaTower();
      // This origin put the party down itself instead of ending in the
      // starting place picker, so there is no picker to walk back out of and
      // no copy of the old world worth keeping.
      if (!$gameTemp || !$gameTemp._openCharacterCreationTrainTravel) clearOriginSnapshot();
      this.popScene();
    }

    // Re-render the current step's choices in place (same step, new option
    // set). Used by the Quick-mode two-step class picker when toggling between
    // the archetype list and an archetype's class list.
    refreshCurrentStepChoices() {
      const stepData = this.currentStepData();
      if (this._titleWindow) this._titleWindow.setTitle(stepData.title);
      if (this._gridWindow) this._gridWindow.setChoices(stepData.choices);
      // Force a full card rebuild even though the step number is unchanged.
      this._lastStep = -1;
      this.refreshUIOverlayDOM();
    }

    // True while the wizard is the first thing a brand-new game shows: nothing
    // has been committed yet, so the only sensible Back from its first step is
    // the title screen. Creations entered from a running game (a second party
    // member, a reprise from the creature builder) must never offer it.
    canExitToTitle() {
      // hasCompletedFirstCreation only flips at the origin step, which is
      // reached once per run (after every party member), so it stays false
      // while building the 2nd/3rd member too. Nothing has been committed
      // yet ONLY while the first member is still being built; from then on a
      // full actor already sits in the party, so Back must never drop the
      // player at the title screen and silently lose it.
      if ((Scene_CharacterCreation._currentPartyMemberIndex || 0) > 0) return false;
      if (typeof hasCompletedFirstCreation !== "function") return false;
      return !hasCompletedFirstCreation();
    }

    // Abandon a new game from the first step and go back to the title. Nothing
    // has been saved yet, so the half-built party is simply dropped; New Game
    // builds a fresh set of game objects. The static flow state outlives the
    // scene, so it is reset here or the next New Game would resume this
    // abandoned wizard mid-step.
    exitToTitle() {
      SoundManager.playCancel();
      Scene_CharacterCreation._interruptedStep = -1;
      Scene_CharacterCreation._startStep = 0;
      Scene_CharacterCreation.clearSubScreens();
      Scene_CharacterCreation._isCreatureMode = false;
      Scene_CharacterCreation._traitsProcessed = false;
      Scene_CharacterCreation._currentPartyMemberIndex = 0;
      Scene_CharacterCreation._lastMemberWasRandom = false;
      Scene_CharacterCreation._storyMode = false;
      Scene_CharacterCreation._chaosPartyRolled = false;
      Scene_CharacterCreation._settingsRowIndex = 0;
      Scene_CharacterCreation._creationMode = null;
      Scene_CharacterCreation._randomizedAllParty = false;
      this.hideUI();
      this.fadeOutAll();
      SceneManager.goto(Scene_Title);
    }

    onCancel() {
      // First step of a new game's creation: Back leaves for the title screen
      // rather than doing nothing (the wizard opens straight after New Game,
      // so there is no other way out of it).
      if (this._step <= Scene_CharacterCreation.getStartingStep() && this.canExitToTitle()) {
        this.exitToTitle();
        return;
      }
      SoundManager.playCancel();
      this.previousStep();
    }

    // What the gender step does once it is finished, whichever way it was
    // reached: a creature is handed to the creature builder, a person to the
    // sprite board and the name prompt. Quick mode never asks the gender
    // question itself , the sprite answers it , but still comes through here,
    // so this is the one place that knows where the wizard goes next.
    leaveGenderStep() {
      if (!Scene_CharacterCreation._isCreatureMode) {
        this.startNamingScreens();
        return;
      }

      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const actorId = currentMemberIndex + 1;

      if (typeof Scene_CreateCreature === 'undefined') {
        console.warn('Scene_CreateCreature not found. Make sure CharacterCreationCreature.js is loaded.');
        // Skip to trait selection (nextStep increments CLASS -> TRAITS)
        this._step = STEP.CLASS;
        this.nextStep();
        return;
      }

      // Both modes open the full creature scene so the whole archetype roster
      // is available (single screen: pick one archetype or two for a hybrid);
      // Quick mode simply asks less of it once the archetypes are settled.
      //
      // Save the step to resume at after creature creation (trait selection).
      // interruptedStep + 1 is the resume step, so CLASS resumes on TRAITS.
      Scene_CharacterCreation._interruptedStep = STEP.CLASS;
      Scene_CharacterCreation._resumeOnStep = false;
      if (Scene_CreateCreature.setTargetActorId) {
        Scene_CreateCreature.setTargetActorId(actorId);
      }
      this.closeStepUI();
      SceneManager.push(Scene_CreateCreature);
    }

    // Naming a person: a suggested name off the Markov generator, the sprite
    // board, then the name prompt with that suggestion already in it. This was
    // common event 97; see the sub-screen block on Scene_CharacterCreation for
    // why it no longer is.
    startNamingScreens() {
      const actorId = Scene_CharacterCreation.getCurrentActorId();

      AudioManager.playSe(CREATION_PAGE_TURN_SE);
      $gameParty.gainGold(CREATION_START_GOLD);
      $gameSwitches.setValue(SWITCH_CREATION_NAMED, true);
      // The suggestion has to exist before the prompt opens, so it is generated
      // here rather than between the two screens. Aimed at the member actually
      // being built: the event could only ever name actor 1, which is why it
      // needed the interpreter hooks that used to sit at the bottom of this file.
      PluginManager.callCommand(this, CREATION_NAME_MARKOV.plugin, CREATION_NAME_MARKOV.command,
        Object.assign({ actorId: String(actorId) }, CREATION_NAME_MARKOV.args));

      this.closeStepUI();

      // Sprite only. The engine's Name Input screen used to be chained on after
      // it (common event 97 ended on one), but the name is asked for on the Bio
      // step now, in the identity card of the dossier itself, so opening the
      // old letter grid here only interrupted the wizard to ask a question it
      // was going to ask again in its own words. The Markov suggestion above
      // still runs, so that field opens pre-filled.
      const screens = ["sprite"];
      if (!Scene_CharacterCreation.openSubScreens(this._step, screens)) {
        // Neither screen is loaded: nothing to wait for, so carry straight on
        // and put the board back, since nothing is taking the screen after all.
        Scene_CharacterCreation._interruptedStep = -1;
        this.reopenStepUI();
        this.nextStep();
      }
    }

    // Put the step's UI away before handing the screen to something else, so
    // the wizard's windows and overlay cannot show through or eat input. The
    // flag also stops createUIOverlay/refreshUIOverlayDOM painting a board that
    // is about to be replaced, for the case where the handover happens during
    // setupStep(), i.e. before the overlay has been built at all.
    closeStepUI() {
      this._ccHandingOver = true;
      if (this._dndContainer) window.CCPanel.hide(this._dndContainer);
      this.hideUI();
      if (this._titleWindow) {
        this._titleWindow.deactivate();
        this._titleWindow.close();
      }
      if (this._gridWindow) {
        this._gridWindow.deactivate();
        this._gridWindow.close();
      }
    }

    // Undo closeStepUI for the rare case where the hand-over did not happen
    // after all, so the step it was leaving stays usable.
    reopenStepUI() {
      this._ccHandingOver = false;
      if (this._dndContainer) window.CCPanel.show(this._dndContainer);
      if (this._titleWindow) this._titleWindow.open();
      if (this._gridWindow) this._gridWindow.open();
      this.showUI();
    }


    // Step off the board and onto the page's own controls, if the press was a
    // direction and there is anything over there to land on. Returns true when
    // the focus ring took over.
    _ccEnterNav(dir) {
      if (!window.CCNav) return false;
      const pressed = ["up", "down", "left", "right"].some(
        (d) => Input.isTriggered(d) || Input.isRepeated(d));
      if (!pressed) return false;
      return window.CCNav.tryEnterFromBoard(dir);
    }

    // The focus ring hands the board back when it walks off its own top or
    // left edge; the board redraws so its cursor is visible again.
    onNavLeave() {
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    updateUIInput() {
      // Settings step: use dedicated input handler instead of grid navigation
      const _sd = this._step < CharacterCreationData.length ? CharacterCreationData[this._step] : null;
      if (_sd && _sd.isSettingsStep) {
        // The settings page walks its own rows with all four directions, so
        // there is no room on it for the ring; anything it was lighting is on
        // another page and has to be let go of rather than left lit.
        if (window.CCNav && window.CCNav.active()) window.CCNav.leave(false);
        this.updateSettingsInput();
        return;
      }

      // The focus ring owns the page's own buttons and chips whenever it is
      // up, and it is read before anything else so the press it takes never
      // also moves the board underneath. See CharacterCreationNav.js.
      if (window.CCNav && window.CCNav.update()) return;

      // The rail comes first, so the shoulder buttons reach the party tabs from
      // any page. The one exception is the dossier board, whose own shoulder
      // buttons leaf a preset through its alternate looks.
      if (!this._presetWindow && this.updateTopRailInput()) return;

      const isPreset = !!this._presetWindow;
      const windowObj = isPreset ? this._presetWindow : this._gridWindow;
      if (!windowObj || !windowObj.active) {
        // No board on this page at all (the scenario dossier, the preview):
        // the whole spread belongs to the focus ring, so any direction opens
        // it rather than dropping the press.
        this._ccEnterNav("down");
        return;
      }

      const maxItems = windowObj.maxItems();
      if (maxItems <= 0) {
        // Nothing to move between, but Back must still work: an empty preset
        // board would otherwise trap the player with no way out.
        if ((Input.isTriggered('cancel') || TouchInput.isCancelled()) && isPreset) {
          SoundManager.playCancel();
          this.onPresetCancel();
          return;
        }
        // An empty board still has a page around it: its buttons are the only
        // thing left to reach, so a direction steps straight onto them.
        this._ccEnterNav("down");
        return;
      }

      // Dossiers that were drawn more than once can be leafed through into
      // their other looks without leaving the card. The shoulder buttons do it
      // both ways, and so does the keyboard: TAB steps forward (it is the
      // button the chip under the thumbnails names) and SHIFT+TAB steps back.
      if (isPreset && windowObj.cycleSkin) {
        const skinDir = window.CCNav ? window.CCNav.railDir() : 0;
        if (skinDir) {
          windowObj.cycleSkin(skinDir);
          return;
        }
        // Shift on its own leafs forward too, for the builds that taught it.
        // Held with Tab it is the modifier railDir() already read as "back",
        // so it is only looked at once Tab has come and gone.
        if (Input.isTriggered('shift')) {
          windowObj.cycleSkin(1);
          return;
        }
      }

      // A pad can be plugged in, or run out of battery, while the board is
      // open, so the chip that names the look button is kept in step.
      if (isPreset) this.syncSkinKeyChip();

      // The category rail above the grid, walked with the same stick.
      if (this.updatePageRailInput(windowObj)) return;

      let moved = false;
      let index = windowObj.index();

      if (Input.isTriggered('down') || Input.isRepeated('down')) {
        const cols = windowObj.maxCols();
        if (index + cols < maxItems) {
          index += cols;
        } else if (this._ccEnterNav("down")) {
          // Off the bottom of the board and onto the page's own buttons. The
          // board only wraps back to its top row when there is nothing below
          // it to step onto.
          return;
        } else {
          index = index % cols;
        }
        moved = true;
      } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
        const cols = windowObj.maxCols();
        if (index - cols >= 0) {
          index -= cols;
        } else {
          let target = Math.floor((maxItems - 1) / cols) * cols + (index % cols);
          if (target >= maxItems) target -= cols;
          index = target >= 0 ? target : 0;
        }
        moved = true;
      } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
        const cols = windowObj.maxCols();
        if (cols > 1 && index % cols < cols - 1 && index + 1 < maxItems) {
          index += 1;
          moved = true;
        } else if (this._ccEnterNav("right")) {
          // The right edge of the board is the doorway onto the facing page:
          // its detail panel, its chips and its buttons.
          return;
        }
      } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
        const cols = windowObj.maxCols();
        if (cols > 1 && index % cols > 0) {
          index -= 1;
          moved = true;
        }
      } else if (Input.isTriggered('ok')) {
        if (isPreset) {
          this.onPresetSelect();
        } else {
          this.onGridOk();
        }
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        // ESC, the pad's B/Circle, and a RIGHT-CLICK anywhere on the page all
        // mean the same thing here: one step back. The right button used to be
        // read by nobody (the grid window's processTouch is stubbed out so the
        // DOM cards can own the mouse), so it fell through to RMMZ's default
        // handling and was as likely to confirm the highlighted card as to do
        // nothing - which is how backing out could walk the wizard FORWARD.
        const firstStep = Scene_CharacterCreation.getStartingStep();
        const isLaterMemberTypeStep = this._step === STEP.CHARACTER_TYPE &&
          (Scene_CharacterCreation._currentPartyMemberIndex || 0) > 0;
        if (isPreset) {
          SoundManager.playCancel();
          this.onPresetCancel();
        } else if (this._step > firstStep || isLaterMemberTypeStep) {
          SoundManager.playCancel();
          this.onCancel();
        } else if (this.canExitToTitle()) {
          // First step of a new game: Cancel leaves for the title screen.
          this.exitToTitle();
        }
      }

      if (moved) {
        SoundManager.playCursor();
        windowObj.select(index);
        this.refreshUIOverlayDOM();
      }
    }

    update() {
      super.update();

      // A relay instance has no UI and is replaced on the next frame; a scene
      // that has handed over is on its way out and its board is already down.
      // Either way there is nothing to draw and no input of ours to read - the
      // frames between a hand-over and the scene change are exactly where a
      // stale board would flash back up and eat the next screen's first click.
      if (this._isSubScreenRelay || this._ccHandingOver) return;

      if (this._dndContainer) {
        window.CCPanel.show(this._dndContainer);
        this.updateUIInput();
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);
        this.refreshUIOverlayDOM();
        // The spread rebuilds its markup underneath the ring, so the ring is
        // stamped back on afterwards rather than before.
        if (window.CCNav) window.CCNav.paint();
        this.updateEmRestlessBubble();
        this._syncCC3DPortrait();
      } else {
        this._destroyCC3DPortrait();
      }
    }

    // ── Live 3D preview of the creature's own sculpted body, sidebar review
    //    card ──
    // The sidebar is rebuilt with innerHTML/outerHTML on every trait toggle,
    // archetype swap and page turn, far too often to stand a fresh WebGL
    // context up inside the render itself. So the markup only ever leaves a
    // named, empty frame (.cc3d-live-portrait) behind, and this is polled once
    // a frame from update(): cheap when nothing changed, and the one place
    // that actually owns the canvas across those rebuilds. Same shape as
    // NPCEmpathizeUI's portrait viewer, which the model itself is shared with
    // (window.ActorModel3D) so the two screens can never disagree about which
    // body a creature has.
    _syncCC3DPortrait() {
      const wrap = this._dndContainer && this._dndContainer.querySelector(".cc3d-live-portrait");
      const actor = wrap ? Scene_CharacterCreation.getCurrentActor() : null;
      const cfg = (actor && window.CC3DModel && window.CC3DModel.isAvailable && window.CC3DModel.isAvailable())
        ? window.CC3DModel.getConfig(actor.actorId()) : null;
      if (!wrap || !actor || !cfg) { this._destroyCC3DPortrait(); return; }
      const info = { kind: "custom", cfg: cfg, actorId: actor.actorId() };
      const key = window.ActorModel3D ? window.ActorModel3D.keyFor(info) : JSON.stringify(cfg);
      if (this._ccPortrait3D && this._ccPortrait3D.key === key && !this._ccPortrait3D.disposed) {
        if (this._ccPortrait3D.canvas.parentNode !== wrap) wrap.appendChild(this._ccPortrait3D.canvas);
        return;
      }
      this._destroyCC3DPortrait();
      this._buildCC3DPortrait(wrap, info, key);
    }

    _buildCC3DPortrait(wrap, info, key) {
      if (typeof THREE === "undefined" || !window.ActorModel3D) return;
      const canvas = document.createElement("canvas");
      canvas.className = "cc3d-live-canvas";
      canvas.classList.add("cc-fill-layer");
      wrap.appendChild(canvas);

      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width) || 220);
      const height = Math.max(1, Math.round(rect.height) || 220);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      } catch (e) {
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return; // no context to be had; the fallback icon/label stays up
      }
      if (!renderer || !renderer.getContext || !renderer.getContext()) {
        if (renderer && renderer.dispose) {
          try { renderer.dispose(); } catch (e) {}
        }
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return;
      }
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(1);

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const keyLight = new THREE.DirectionalLight(0xfff2d0, 1.4); keyLight.position.set(3, 5, 4); scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.7); fillLight.position.set(-3, -2, 2); scene.add(fillLight);

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
      camera.position.set(0, 0, 8);
      const pivot = new THREE.Group();
      scene.add(pivot);

      const state = {
        key: key, canvas: canvas, renderer: renderer, scene: scene, camera: camera, pivot: pivot,
        model: null, rafId: 0, disposed: false, frameAcc: 0, clock: new THREE.Clock()
      };
      this._ccPortrait3D = state;

      window.ActorModel3D.build(info).then((battler) => {
        if (state.disposed || !battler || !battler.model) return;
        try { battler.update(1 / 60); } catch (e) {}
        const fit = window.ActorModel3D.framing(battler, camera, 1.25);
        if (!fit) return;
        const holder = new THREE.Group();
        holder.position.copy(fit.center).multiplyScalar(-1);
        holder.add(battler.model);
        if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
        pivot.add(holder);
        camera.position.set(0, 0, fit.distance);
        camera.lookAt(0, 0, 0);
        state.model = battler;
      }).catch(() => {});

      const FRAME = 1 / 30;
      const animate = () => {
        if (state.disposed) return;
        state.rafId = requestAnimationFrame(animate);
        state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
        if (state.frameAcc < FRAME) return;
        state.frameAcc = 0;
        // A slow turntable, not a held pose: this is a preview card the player
        // is choosing a body from, not a portrait framed once and left alone.
        pivot.rotation.y += 0.01;
        if (window.PSXShader) window.PSXShader.render(renderer, scene, camera);
        else renderer.render(scene, camera);
      };
      animate();
    }

    _destroyCC3DPortrait() {
      const s = this._ccPortrait3D;
      if (!s) return;
      this._ccPortrait3D = null;
      s.disposed = true;
      cancelAnimationFrame(s.rafId);
      // dispose() alone leaves the WebGL context alive, and the browser force-
      // loses the OLDEST context past its cap, which could be the game's own
      // canvas rather than this one.
      try { s.renderer.dispose(); } catch (e) {}
      try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
      if (s.canvas && s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
    }

    // Em's card starts heckling the player once her dossier has sat unpicked
    // on the board for EM_RESTLESS_DELAY_MS, and again every
    // EM_RESTLESS_INTERVAL_MS after that. The clock is kept here rather than
    // stamped once when the board opens, so re-entering preset mode (Cancel
    // then back in) always gives her the same ten seconds of patience.
    updateEmRestlessBubble() {
      const bubble = window.EmRestlessBubble;
      if (!bubble) return;
      if (!this._presetWindow || this._presetApplied) {
        bubble.release();
        this._emBoardOpenedAt = 0;
        this._emBubbleNextAt = 0;
        return;
      }
      if (!this._emBoardOpenedAt) this._emBoardOpenedAt = Date.now();
      bubble.update();

      const now = Date.now();
      if (now - this._emBoardOpenedAt < EM_RESTLESS_DELAY_MS) return;
      if (this._emBubbleNextAt && now < this._emBubbleNextAt) return;
      if (typeof getEmRestlessLine !== "function" || !this._dndContainer) return;

      const presets = availablePresets();
      const emIndex = presets.findIndex((p) => p && p.name === "Em");
      if (emIndex === -1) return; // not on the board this world (already played, or not this preset set)
      const card = this._dndContainer.querySelectorAll(".cc-page-left .cc-presets-board .cc-wanted-card")[emIndex];
      if (!card) return;

      this._emBubbleLastLine = getEmRestlessLine(this._emBubbleLastLine);
      bubble.show(card, this._emBubbleLastLine);
      this._emBubbleNextAt = now + EM_RESTLESS_INTERVAL_MS;
    }
  }

  // --- Window_CharacterCreationTitle ---
  class Window_CharacterCreationTitle extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this._title = "";
    }
    setTitle(title) {
      if (this._title !== title) {
        this._title = title;
        this.refresh();
      }
    }
    refresh() {
      this.contents.clear();
      this.drawText(this._title, 0, 0, this.contents.width, "center");
    }
  }

  // --- Window_CharacterCreationGrid (FIXED) ---
  // Replace the existing Window_CharacterCreationGrid class with this updated version
  class Window_CharacterCreationGrid extends Window_Selectable {
    initialize(rect) {
      super.initialize(rect);
      this._choices = [];
      this._scene = null;
    }

    setScene(scene) {
      this._scene = scene;
      this.refresh();
    }

    // Add after the select() method in Window_CharacterCreationGrid
    select(index) {
      const lastIndex = this.index();
      super.select(index);

      // Play music preview when hovering over battle music choices
      if (
        this.index() !== lastIndex &&
        this._choices &&
        this._choices.length > 0
      ) {
      }
    }
    processTouch() {
      // All mouse interaction is handled via DOM onclick, block RMMZ's
      // TouchInput path so it can't fire processOk/deactivate under DOM buttons.
    }

    setChoices(choices) {
      this._choices = choices || [];
      this._choices.forEach((choice) => {
        if (choice.bgImage) {
          const bitmap = ImageManager.loadPicture(choice.bgImage);
          bitmap.addLoadListener(() => this.refresh());
        }
      });
      this.refresh();
      this.select(0);
      this.activate();
    }

    maxItems() {
      return this._choices ? this._choices.length : 0;
    }

    maxCols() {
      // The board modes' class/creature picker renders as a two-column grid, so
      // the selection cursor must move in two columns too (left/right +
      // up/down).
      const sc = this._scene;
      if (sc && sc._step === STEP.CLASS &&
          Scene_CharacterCreation.usesQuickFlow()) {
        return 2;
      }
      // The origin step renders three across (cc-three-col), so the cursor has
      // to move in three columns or left/right would do nothing and up/down
      // would skip two entries at a time. The personality list is laid out the
      // same way, and only while it actually renders as the picker.
      if (sc && sc._step === STEP.ORIGIN) {
        return 3;
      }
      if (sc && sc._isPersonalityPickerStep && sc._isPersonalityPickerStep()) {
        return 3;
      }
      return 1;
    }

    itemHeight() {
      const numRows = Math.ceil(this.maxItems() / this.maxCols());
      if (numRows === 0) {
        return this.innerHeight;
      }
      return Math.floor(this.innerHeight / numRows);
    }

    // NEW: Helper method to wrap text without breaking words
    wrapText(text, maxWidth) {
      if (!text) return [];

      // Handle color codes and other escape sequences
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine + (currentLine ? " " : "") + word;

        // Measure the text width (accounting for escape sequences)
        const testWidth = this.textSizeEx(testLine).width;

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // Single word is too long, force it on its own line
            lines.push(word);
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    }

    // NEW: Calculate text size including escape sequences
    textSizeEx(text) {
      const tempTextState = this.createTextState(text, 0, 0, 0);
      tempTextState.drawing = false; // Don't actually draw
      this.processAllText(tempTextState);
      return {
        width: tempTextState.outputWidth,
        height: tempTextState.outputHeight,
      };
    }

    // UPDATED: Improved drawItem method with proper word wrapping
    drawItem(index) {
      const choice = this._choices[index];
      if (!choice) return;

      const rect = this.itemRect(index);

      // Draw background image if available
      if (choice.bgImage) {
        const bitmap = ImageManager.loadPicture(choice.bgImage);
        if (bitmap.isReady()) {
          this.contents.blt(
            bitmap,
            0,
            0,
            bitmap.width,
            bitmap.height,
            rect.x,
            rect.y,
            rect.width,
            rect.height
          );
        }
      }

      // Draw semi-transparent background for text readability
      const textPadding = 8;
      this.contents.fillRect(
        rect.x + 4,
        rect.y + 4,
        rect.width - 8,
        rect.height - 8,
        "rgba(0, 0, 0, 0.6)"
      );

      // Draw choice name (title)
      this.resetFontSettings();
      this.changeTextColor(ColorManager.systemColor());
      this.contents.fontSize += 4;

      this.drawText(
        choice.name,
        rect.x,
        rect.y + textPadding,
        rect.width,
        "center"
      );

      // Draw description with word wrapping
      this.resetFontSettings();
      if (choice.description) {
        const descY = rect.y + textPadding + this.lineHeight() + 4; // Add small gap
        const availableWidth = rect.width - textPadding * 2;
        const availableHeight = rect.height - (descY - rect.y) - textPadding;

        this.drawWrappedDescription(
          choice.description,
          rect.x + textPadding,
          descY,
          availableWidth,
          availableHeight
        );
      }
    }

    // NEW: Method to draw wrapped description text
    drawWrappedDescription(description, x, y, maxWidth, maxHeight) {
      const wrappedLines = this.wrapText(description, maxWidth);
      const lineHeight = this.lineHeight();
      const maxLines = Math.floor(maxHeight / lineHeight);

      // Limit the number of lines to fit in the available space
      const linesToDraw = Math.min(wrappedLines.length, maxLines);

      for (let i = 0; i < linesToDraw; i++) {
        const lineY = y + i * lineHeight;
        let lineText = wrappedLines[i];

        // If this is the last line we can draw and there are more lines, add ellipsis
        if (i === linesToDraw - 1 && wrappedLines.length > maxLines) {
          // Check if we need to truncate to fit ellipsis
          const ellipsis = "...";
          const ellipsisWidth = this.textWidth(ellipsis);

          while (
            this.textSizeEx(lineText + ellipsis).width > maxWidth &&
            lineText.length > 0
          ) {
            lineText = lineText.slice(0, -1);
          }
          lineText += ellipsis;
        }

        // Draw the line using drawTextEx to handle color codes
        this.drawTextEx(lineText, x, lineY, maxWidth);
      }
    }
  }

  //=============================================================================
  // Story mode controls legend
  //=============================================================================
  // The legend itself lives in Map/MapLegend.js now: one parchment sheet in the
  // corner of the map carrying the notice of the area underfoot and the tooltip
  // variable. It no longer teaches the controls, so there is nothing left for
  // creation to arm; the hook is kept on CCKit under the name the preset flow
  // calls so that flow does not have to know the rows are gone.

  function beginStoryModeControlsLegend() {
  }

  // The heaviest thing any step opens is the sprite board: it builds its sheet
  // list and scans img/busts (hundreds of files) the first time it is entered.
  // Both are cached for the session, so doing it here - while the player is
  // still reading the first page of the wizard - means the sprite step has
  // nothing left to wait for. (The old call here was to preloadBustData, a
  // function no plugin has defined for a long time.)
  function warmCreationAssets() {
    if (window.SpriteBoard && window.SpriteBoard.warm) window.SpriteBoard.warm();
    else if (window.BustGallery && window.BustGallery.load) window.BustGallery.load();
  }

  // Plugin Commands
  PluginManager.registerCommand(pluginName, "characterCreation", () => {
    openCharacterCreation();
  });

  // The wizard, opened either by the plugin command above (the tutorial map's
  // own event) or by the story mode itself when it begins somewhere with no
  // event to run it (see the Scene_Map hook below).
  function openCharacterCreation() {
    warmCreationAssets();
    // A brand new party: nothing of a previous run's hand-over is still owed.
    Scene_CharacterCreation._interruptedStep = -1;
    Scene_CharacterCreation.clearSubScreens();

    // Story mode: switch 100 is on and the player is on the tutorial map, or
    // the story run asked for the wizard itself because it began in a year
    // that has no tutorial to walk (window.StoryModeStart).
    const isStoryMode = $gameSwitches.value(100) &&
      (isStoryCreationMap($gameMap.mapId()) || !!$gameSystem._pendingStoryModeCreation);
    $gameSystem._pendingStoryModeCreation = false;
    Scene_CharacterCreation._storyMode = isStoryMode;
    Scene_CharacterCreation._currentPartyMemberIndex = 0;
    Scene_CharacterCreation._railFocus = null;
    // A new party is dealt a new kit: the origins that roll their loadout hold
    // one seed for the whole run, so the board never reshuffles under the
    // player, and the next run rolls again.
    resetOriginRoll();
    // Pick up any previously chosen mode (subsequent creations skip the
    // mode step via showOnlyOnce); null means the mode step will set it.
    // Detailed is never carried over: the mode step is silenced once a
    // savegame has built a party, so a carried-over Detailed would lock every
    // later party into the editor with no board and no way back.
    const carriedMode = storedCreationMode();
    Scene_CharacterCreation._creationMode =
      (carriedMode === CC_MODE.DETAILED ? null : carriedMode) || null;

    const startStep = Scene_CharacterCreation.getStartingStep();
    Scene_CharacterCreation.prepare(startStep);

    // Set the current actor's initial class to 1 at the start
    const actor = Scene_CharacterCreation.getCurrentActor();
    if (actor) {
      actor.changeClass(1, false);
      if (!actor._isPresetActor) {
        Scene_CharacterCreation.assignRandomSpriteAndBust(actor);
        actor._ccSpriteSeeded = true;
      }
    }

    SceneManager.push(Scene_CharacterCreation);
  }

  // The tutorial map, the one map that runs the wizard from an event of its
  // own. Every other story landing asks for it here instead, on the first frame
  // the map is up.
  const STORY_TUTORIAL_MAP_ID = 1414;
  // The train the story opens on runs the wizard from an event of its own too,
  // so it counts as a creation map exactly like the tutorial one.
  function isStoryCreationMap(mapId) {
    if (mapId === STORY_TUTORIAL_MAP_ID) return true;
    const train = window.StoryModeStart && window.StoryModeStart.TRAIN_MAP_ID;
    return !!train && mapId === train;
  }

  const _CC_Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    // A run that opens on the wizard (the title screen's own New game and
    // Story mode entries) never shows the map first: the curtain is dropped
    // over the landing and only lifts on the map the wizard hands the party
    // to, so the first thing a new player sees is the first page of creation.
    const curtain = !!($gameSystem && $gameSystem._pendingCreationCurtain);
    const pendingStory = !!($gameSystem && $gameSystem._pendingStoryModeCreation &&
        !isStoryCreationMap($gameMap.mapId()) &&
        !(SceneManager._scene instanceof Scene_CharacterCreation));
    _CC_Scene_Map_start.call(this);
    if (curtain || pendingStory) {
      $gameSystem._pendingCreationCurtain = false;
      this.startFadeOut(1);
    }
    if (pendingStory) openCharacterCreation();
    // Insurance: if the wizard never arrives (an event that did not run, a
    // landing with nothing to open it) the curtain lifts by itself rather
    // than leaving the player on a black screen.
    this._ccCurtainWait = (curtain || pendingStory) ? 90 : 0;
  };

  const _CC_Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _CC_Scene_Map_update.call(this);
    if (this._ccCurtainWait > 0 && --this._ccCurtainWait === 0 &&
        SceneManager._scene === this && !$gameMap.isEventRunning()) {
      this.startFadeIn(this.fadeSpeed(), false);
    }
  };

  // Where a reprise picks the flow back up: one step past the one that was
  // interrupted, or back on the last real question before it when the screen in
  // between was backed out of rather than confirmed (see cancelSubScreens).
  // Consumes both markers.
  function resumeStepAfterInterrupt() {
    const SC = Scene_CharacterCreation;
    const step = SC._resumeOnStep
      ? SC.backLandingStep(SC._interruptedStep)
      : SC._interruptedStep + 1;
    SC._interruptedStep = -1;
    // A reprise re-enters the wizard from outside, so whatever chain was open
    // is over whether or not it ran to the end.
    SC.clearSubScreens();
    return step;
  }

  PluginManager.registerCommand(pluginName, "repriseCreation", () => {
    let startStep;

    if (Scene_CharacterCreation._interruptedStep >= 0) {
      startStep = resumeStepAfterInterrupt();
    } else {
      startStep = STEP.CLASS; // resume a humanoid at class selection
      while (startStep < CharacterCreationData.length) {
        const stepData = CharacterCreationData[startStep];
        if (stepData.showOnlyOnce && isStepCompleted(startStep)) {
          startStep++;
        } else {
          break;
        }
      }
    }

    Scene_CharacterCreation._isCreatureMode = false;
    Scene_CharacterCreation._creationMode =
      storedCreationMode() || Scene_CharacterCreation._creationMode;
    Scene_CharacterCreation.prepare(startStep);
    SceneManager.push(Scene_CharacterCreation);
  });

  PluginManager.registerCommand(pluginName, "repriseCreationCreature", () => {
    Scene_CharacterCreation._creationMode =
      storedCreationMode() || Scene_CharacterCreation._creationMode;

    // The board modes have no separate creature reprise: fall back to a plain
    // humanoid one so the flow can never strand the player in a disabled
    // creature path.
    if (Scene_CharacterCreation.usesQuickFlow()) {
      let startStep = Scene_CharacterCreation._interruptedStep >= 0
        ? resumeStepAfterInterrupt()
        : STEP.CLASS;
      while (startStep < CharacterCreationData.length) {
        const stepData = CharacterCreationData[startStep];
        if (stepData.showOnlyOnce && isStepCompleted(startStep)) {
          startStep++;
        } else {
          break;
        }
      }
      Scene_CharacterCreation._isCreatureMode = false;
      Scene_CharacterCreation.clearSubScreens();
      Scene_CharacterCreation.prepare(startStep);
      SceneManager.push(Scene_CharacterCreation);
      return;
    }

    let startStep;

    if (Scene_CharacterCreation._interruptedStep >= 0) {
      startStep = resumeStepAfterInterrupt();
    } else {
      startStep = STEP.GENDER; // resume a creature at gender selection
      while (startStep < CharacterCreationData.length) {
        const stepData = CharacterCreationData[startStep];
        if (stepData.showOnlyOnce && isStepCompleted(startStep)) {
          startStep++;
        } else {
          break;
        }
      }
    }

    Scene_CharacterCreation._isCreatureMode = true;
    Scene_CharacterCreation.prepare(startStep);
    SceneManager.push(Scene_CharacterCreation);
  });

  PluginManager.registerCommand(pluginName, "repriseTraitSelection", (args) => {
    const targetActorId = args.actorId ? parseInt(args.actorId) : 1;

    if (window.Scene_TraitSelector) {
      window.Scene_TraitSelector.prepare(true, targetActorId);
      SceneManager.push(window.Scene_TraitSelector);
    } else {
      console.error("Scene_TraitSelector not available!");
    }
  });

  // The naming step used to be an event, and an event's actor id is a fixed 1:
  // the Markov generator wrote its suggestion onto actor 1 and the Name Input
  // that followed edited actor 1, so two Game_Interpreter hooks used to sit
  // here rewriting both to point at the member actually being built. The wizard
  // opens those screens itself now (startNamingScreens), aimed at the right
  // actor to begin with, so the hooks are gone with the event.


  // Export to global namespace
  // The handful of helpers and tables the split-out modules still need. They
  // are private to this file otherwise: the kit is the only door, and it is
  // published before the scene so anything that loads after can read it.
  window.CCKit = {
    ccStatLabels,
    actorArchetypeKeys,
    applyArchetypeToActor,
    applySecondaryArchetypeToActor,
    personalityCatalog,
    presetSkins,
    presetSkinLabel,
    availablePresets,
    skinKeyPadOn,
    skinKeyLabel,
    markFirstCreationComplete,
    beginStoryModeControlsLegend,
    Window_CharacterCreationTitle,
    ccT,
    ccTp,
    ccStatLabel,
    ccList,
    ccReproChoices,
    ccHormoneLean,
    selectedTraitObjects,
    selectedTraitIds,
    resolveTraitName,
    resolveTraitDesc,
    CC_SPEC_BUDGET,
    SPEC_TAB_CURRENT,
    creatureArchetypeKeys,
    archetypeDisplayName,
    actorArchetypeKey,
    actorSecondaryArchetypeKey,
    applyArchetypesToActor,
    STEP,
    pickSettingIcon,
    CREATION_BGM,
    getCCMusicTracks,
    CharacterCreationData,
    storedCreationMode,
  };

  window.Scene_CharacterCreation = Scene_CharacterCreation;

  console.log(`${pluginName} loaded successfully.`);
})();
