/*:
 * @target MZ
 * @plugindesc The premade dossiers inside the wizard: the board, the skins, applying one to a member
 * @author Omni-Lex
 * @orderAfter CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js. This module owns one subject: a
 * premade dossier, from the moment the board of them is put up to the
 * moment one has been stamped onto a party member.
 *
 *   - the dossier board and the dossier page facing it,
 *   - the alternate looks a dossier was drawn in, and the key that cycles them,
 *   - applying a dossier: its class, traits, specs, gear, bio and its lore,
 *   - the lock a taken dossier puts on a member, and what refuses an edit,
 *   - the sidebar the board shows instead of a character's own,
 *   - where a dossier's landing is recorded, and the walk it takes.
 *
 * The dossier records themselves - reading them, saving them, their lore and
 * their skins - are CharacterCreationPresets.js, which loads before the
 * wizard. This file is the wizard's side of them and nothing else.
 *
 * Every method here was a method of Scene_CharacterCreation and still is:
 * the class body below is copied onto its prototype at load.
 *
 * @command joinPresetCharacter
 * @text Dossier Joins The Party
 * @desc Signs a premade dossier on by its id, built exactly as the wizard
 * builds it. With no seat free they wait on the Dynamics roster instead.
 *
 * @arg presetId
 * @text Dossier Id
 * @type number
 * @min 1
 * @default 1
 * @desc The id of the premade dossier to sign on.
 */

(() => {
  "use strict";

  const Scene_CharacterCreation = window.Scene_CharacterCreation;
  if (!Scene_CharacterCreation) return;

  const {
    ccT,
    ccTp,
    ccStatLabels,
    resolveTraitName,
    selectedTraitObjects,
    markFirstCreationComplete,
    presetSkins,
    presetSkinLabel,
    availablePresets,
    skinKeyPadOn,
    skinKeyLabel,
    beginStoryModeControlsLegend,
    Window_CharacterCreationTitle,
    STEP,
  } = window.CCKit;

  // The dossier records, the traits a dossier hands over and the two origins a
  // dossier can be anchored to, read off the plugins that own them.
  const {
    markPresetUsed,
    unmarkPresetUsed,
    getPresetLore,
    hasCompletedFirstCreation,
    Window_CharacterPresets,
  } = window.CharacterPresets || {};
  const { applyTraitsToActor } = window.CharacterCreationUtils || {};
  const { GLOBAL_STARTER_SKILLS } = window.StartingEquipment || {};
  const {
    startsAtOmegaTower,
    startAtOmegaTower,
    grantMinimumCards,
    classStartingMoney,
    CC_BASE_START_GOLD,
  } = window.CCOrigins || {};

  // What a dossier starts with. Most of them spell their own kit out and are
  // played exactly as written. The story mode's three do not: they are a class and
  // a face and nothing else, so they start as their class does, with the very
  // weapon, armour, items, level-1 skills and purse the class step hands a
  // character built by hand. The board that shows the kit and the code that
  // grants it both read this, so what the player is shown is what the player
  // gets. `fromClass` says which of the two answers this is, because a class kit
  // is granted by the class helpers themselves (they equip as well as give).
  // The one dossier the story mode is played as. Read off the world's own pool
  // rather than off availablePresets(), which answers with the story mode board's
  // dossiers while the story mode is running.
  function storyModeEmPreset() {
    return storyModePresetBy((entry) => entry.proceduralLore === "em");
  }

  // Read off the world's own pool rather than off availablePresets(), which
  // answers with the story mode board's dossiers while the story mode is running.
  function storyModePresetBy(test) {
    const api = window.CharacterPresets || {};
    const all = (typeof api.getCharacterPresets === "function") ? api.getCharacterPresets() : [];
    return all.find((entry) => entry && test(entry)) || null;
  }

  function presetLoadout(preset) {
    const own = {
      skills: preset.skills || [],
      weapons: preset.weapons || [],
      armors: preset.armors || [],
      items: preset.items || [],
      money: preset.money || 0,
      fromClass: false,
    };
    const spellsItOut = own.skills.length > 0 || own.weapons.length > 0 ||
      own.armors.length > 0 || own.items.length > 0 || own.money > 0;
    if (spellsItOut) return own;

    const SE = window.StartingEquipment || {};
    const classData = $dataClasses[preset.classId];
    if (!classData) return own;
    const idQty = (id, amount) => ({ id, amount });
    return {
      skills: (classData.learnings || [])
        .filter((l) => l && l.level === 1 && $dataSkills[l.skillId])
        .map((l) => l.skillId),
      weapons: (SE.getClassStartWeapons ? SE.getClassStartWeapons(preset.classId) : [])
        .map((id) => idQty(id, 1)),
      armors: (SE.getClassStartArmors ? SE.getClassStartArmors(preset.classId) : [])
        .map((id) => idQty(id, 1)),
      items: (SE.getClassStartingItems ? SE.getClassStartingItems(preset.classId) : [])
        .map((entry) => idQty(entry.id, entry.qty || 1)),
      // The purse a hand-built character of this class would have been handed at
      // the end of creation (giveStartingMoney), which a dossier party never
      // reaches: it lands through its dossier instead (see _walkPresetLanding).
      money: (CC_BASE_START_GOLD || 0) +
        (typeof classStartingMoney === "function" ? classStartingMoney(preset.classId) : 0),
      fromClass: true,
    };
  }

  // Written as a class body so the methods move onto the wizard exactly as
  // they were declared while they still lived inside it, accessors and all.
  class CCPresetFlow {
    showPresetSelection() {
      if (availablePresets().length === 0) {
        SoundManager.playBuzzer();
        if (this._gridWindow) this._gridWindow.activate();
        return;
      }
      // A party carries one dossier at most: it is the dossier that decides the
      // purse, the kit and where the party wakes up.
      if (this._hasPresetInParty(true)) {
        SoundManager.playBuzzer();
        if (this._gridWindow) this._gridWindow.activate();
        return;
      }

      // Hide current windows
      if (this._titleWindow) {
        this._titleWindow.visible = false;
        this._titleWindow.opacity = 0;
      }
      if (this._gridWindow) {
        this._gridWindow.visible = false;
        this._gridWindow.opacity = 0;
      }

      // Create preset selection windows
      if (!this._presetTitleWindow) this.createPresetTitleWindow();
      if (!this._presetWindow) this.createPresetWindow();
      if (this._presetWindow) {
        this._presetWindow.select(0);
        this._presetWindow.activate();
      }
    }

    createPresetTitleWindow() {
      const rect = this.titleWindowRect();
      this._presetTitleWindow = new Window_CharacterCreationTitle(rect);
      this._presetTitleWindow.setTitle(T('CharCreate.selectCharacter'));
      this._presetTitleWindow.visible = false;
      this._presetTitleWindow.opacity = 0;
      this.addWindow(this._presetTitleWindow);
    }

    createPresetWindow() {
      const rect = this.presetWindowRect();
      this._presetWindow = new Window_CharacterPresets(rect);
      this._presetWindow.setHandler("ok", this.onPresetSelect.bind(this));
      this._presetWindow.setHandler("cancel", this.onPresetCancel.bind(this));
      if (this._presetWindow.setSkinHandler) {
        this._presetWindow.setSkinHandler(this.onPresetSkinChange.bind(this));
      }
      this._presetWindow.visible = false;
      this._presetWindow.opacity = 0;
      this.addWindow(this._presetWindow);
    }

    presetWindowRect() {
      const titleRect = this.titleWindowRect();
      const x = 50;
      const y = titleRect.y + titleRect.height + 20;
      const width = Graphics.boxWidth - 100;
      const height = Graphics.boxHeight - y - 50;
      return new Rectangle(x, y, width, height);
    }

    // MODIFIED: Reworked to apply full character preset data (inventory, skills, equips, etc.)
    // Taking a dossier fills the member's seat and nothing else. It used to
    // set the party down on the dossier's own map the instant it was picked,
    // which ended creation before the other two seats could be filled; the
    // landing is remembered here and only walked when the party is confirmed.
    onPresetSelect() {
      const index = this._presetWindow ? this._presetWindow.index() : 0;
      this.onApplyPresetToCurrentMember(index);
    }

    // Where a taken dossier means to put the party down, kept until the party
    // is confirmed. Cleared on the way out (see onFinishPartyCreation).
    _recordPresetLanding(preset) {
      if (!preset) return;
      $gameSystem._ccPresetLanding = {
        id: preset.id,
        name: preset.name,
        mapId: preset.mapId,
        x: preset.x,
        y: preset.y,
        storyModeOnly: !!preset.storyModeOnly
      };
    }

    // The landing a taken dossier asked for, walked at the end of creation
    // instead of at the moment the dossier was picked. Returns true when it
    // took the party somewhere, so the scenario logic knows to stand down.
    _walkPresetLanding() {
      const landing = $gameSystem._ccPresetLanding;
      if (!landing) return false;
      $gameSystem._ccPresetLanding = null;

      $gameSwitches.setValue(13, true);
      $gameSwitches.setValue(33, true);
      markFirstCreationComplete();
      grantMinimumCards();

      // The story mode is done with the wizard here, and the legend that teaches
      // the controls starts on the map it lands on. It is put down by the same
      // transfer every other dossier gets: creation is reached from the title
      // screen as much as from the story mode map itself, so "stay where you are"
      // left the party wherever the title had them. The flag is read as well as
      // the landing's own mark, because the story mode is played as Em now, whose
      // record is one of the world's own and carries no story mode mark.
      const wasStoryMode = !!(landing.storyModeOnly || Scene_CharacterCreation._storyMode);
      if (wasStoryMode) {
        Scene_CharacterCreation._storyMode = false;
        beginStoryModeControlsLegend();
      }
      // The story mode does not land where Em's dossier says: her square is
      // where she lives, not where the story opens. window.StoryModeStart owns
      // that answer (the canon year opens on its own map, a later year on her
      // square, and a world begun after 2012 on the Omega Tower).
      if (wasStoryMode && window.StoryModeStart && window.StoryModeStart.creationLanding) {
        const start = window.StoryModeStart.creationLanding();
        if (start && start.mapId) {
          landing.mapId = start.mapId;
          landing.x = start.x;
          landing.y = start.y;
        }
      }
      const target = $dataMapInfos && $dataMapInfos[landing.mapId];
      if ($gameTemp) $gameTemp._ccOriginLanding = true;
      if (!wasStoryMode && startsAtOmegaTower()) {
        startAtOmegaTower();
      } else if (target) {
        $gamePlayer.reserveTransfer(landing.mapId, landing.x, landing.y, 2, 0);
      } else {
        console.error(
          `CharacterCreation: preset "${landing.name}" points at missing map ${landing.mapId}; staying put`
        );
      }
      return true;
    }

    // Applies one preset dossier (class, inventory, skills, traits, gear,
    // switches) onto the actor being created. `skinData` is the look picked on
    // the dossier page; without one the dossier's own sprite and bust stand.
    //
    // `opts` is how a dossier is stamped onto somebody who is JOINING a party
    // that is already under way (joinPresetCharacter, below) rather than being
    // built at the start of one:
    //   joining     - the party keeps its purse, its stock and its vehicle; the
    //                 dossier hands over only what belongs to the person.
    //   memberIndex - which of the three seats they sit in, for the switches and
    //                 variables that speak per seat. -1 means no seat at all,
    //                 which is a sheet built on the bench's scratch slot.
    _applyPreset(preset, actor, skinData, opts = {}) {
      const look = skinData || presetSkins(preset)[0] || preset;
      const joining = !!opts.joining;
      const seat = Number.isInteger(opts.memberIndex)
        ? opts.memberIndex
        : (Scene_CharacterCreation._currentPartyMemberIndex || 0);

      // Mark preset properties on actor
      actor._isPresetActor = true;
      actor._presetKey = (preset.name || preset.id || "").toString().toLowerCase();
      actor._presetName = preset.name;
      actor._presetId = preset.id;

      // Set actor properties
      actor.setName(preset.name);
      actor.setCharacterImage(look.sprite, look.spriteIndex || 0);

      // A stale dossier classId would otherwise take the actor's class down
      // with it; fall back to the default class instead.
      if ($dataClasses[preset.classId]) {
        actor.changeClass(preset.classId, false);
      } else {
        console.error(
          `CharacterCreation: preset "${preset.name}" has unknown class ${preset.classId}`
        );
      }

      if (preset.level > 1) {
        actor.changeLevel(Math.max(1, Math.min(99, preset.level)), false);
      }

      // Clear party's current inventory and gold. Never when somebody joins a
      // party already on the road: the dossier is a person, not a new game.
      if (!joining) {
        $gameParty.initAllItems();
        $gameParty.gainGold(-$gameParty.gold());
      }

      // Apply the dossier's money and kit. A dossier that spells out no kit of
      // its own starts as its class does, and that half is handed over by the
      // very helpers the class step uses, so it is worn and not merely carried
      // (see presetLoadout).
      const loadout = presetLoadout(preset);
      // A dossier's purse is the money a game STARTS with, so a latecomer
      // brings their kit and their gear but not a second founding fortune.
      if (!joining) $gameParty.gainGold(loadout.money);
      if (loadout.fromClass) {
        const SE = window.StartingEquipment || {};
        if (SE.equipRandomCompatibleWeapon) SE.equipRandomCompatibleWeapon(actor, preset.classId);
        if (SE.equipClassStartingArmor) SE.equipClassStartingArmor(actor, preset.classId);
        if (SE.giveClassStartingItems) SE.giveClassStartingItems(actor, preset.classId);
      } else {
        loadout.items.forEach((itemData) => {
          if ($dataItems[itemData.id])
            $gameParty.gainItem($dataItems[itemData.id], itemData.amount);
        });
        loadout.weapons.forEach((itemData) => {
          if ($dataWeapons[itemData.id])
            $gameParty.gainItem($dataWeapons[itemData.id], itemData.amount);
        });
        loadout.armors.forEach((itemData) => {
          if ($dataArmors[itemData.id])
            $gameParty.gainItem($dataArmors[itemData.id], itemData.amount);
        });
      }

      if (!joining && $dataItems[714]) {
        $gameParty.gainItem($dataItems[714], 1);
      }

      // The skills the dossier starts knowing: its own list, or its class's
      // level-1 learnings when it names none (see presetLoadout).
      loadout.skills.forEach((skillId) => {
        if ($dataSkills[skillId]) actor.learnSkill(skillId);
      });

      // NEW: Add global starter skills
      GLOBAL_STARTER_SKILLS.forEach((skillId) => {
        if ($dataSkills[skillId]) {
          actor.learnSkill(skillId);
        }
      });

      // Refresh actor to apply class traits
      actor.refresh();

      if (preset.characterType === "creature") {
        if (Array.isArray(preset.archetypes) && preset.archetypes.length > 0 &&
            typeof window.applyCreatureSelection === "function") {
          const mode = preset.archetypes.length >= 2 ? "hybrid" : "baseline";
          window.applyCreatureSelection(
            actor.actorId(),
            mode,
            preset.archetypes[0],
            preset.archetypes[1] || null,
            null,
            null
          );
        }
      } else {
        // A humanoid dossier must not inherit a creature flag left over from
        // whatever the seat was set to before the preset was applied, or its
        // bust never shows: _getActorBust treats any creature-flagged actor
        // as a monster drawn from its 3D model instead of a 2D portrait.
        actor._isCreatureActor = false;
        const slot = $gameParty.members().indexOf(actor);
        if (slot >= 0) $gameSwitches.setValue(77 + slot, false);
        else if (seat >= 0) $gameSwitches.setValue(77 + seat, false);
        if (actor.setPortraitMode) actor.setPortraitMode("bust");
        Scene_CharacterCreation._isCreatureMode = false;
      }

      // Apply preset traits if defined
      if (preset.traits && Array.isArray(preset.traits) && preset.traits.length > 0) {
        actor._selectedTraits = [...preset.traits];
        if (typeof applyTraitsToActor === 'function') {
          applyTraitsToActor(actor, preset.traits);
        }
      }

      // Apply preset specializations
      if (preset.specializations && Array.isArray(preset.specializations)) {
        if (!actor._specTrained) actor._specTrained = {};
        preset.specializations.forEach((entry) => {
          if (entry && entry.id) {
            actor._specTrained[entry.id] = entry.level;
            if (actor.setSpecializationTrainedLevel) {
              actor.setSpecializationTrainedLevel(entry.id, entry.level);
            }
          }
        });
      }

      // Equip items from preset
      (preset.equips || []).forEach((entry, slotId) => {
        const itemId = (entry && typeof entry === 'object') ? entry.id : entry;
        if (itemId > 0) {
          const isWeapon = (entry && typeof entry === 'object')
            ? !!entry.w
            : actor.equipSlots()[slotId] === 1;
          const item = isWeapon ? $dataWeapons[itemId] : $dataArmors[itemId];
          if (item) {
            actor.changeEquip(slotId, item);
          }
        }
      });

      // Store class name in variable
      const classParams = PluginManager.parameters("CharacterCreationClassSelector");
      const variableId = Number(classParams["classNameVariable"] || 0);
      if (variableId > 0) {
        const cls = $dataClasses[preset.classId];
        $gameVariables.setValue(
          variableId,
          cls ? cls.name : ""
        );
      }

      if (look.busts) {
        actor.setVnBust(look.busts);
        if (actor.setPortraitMode) actor.setPortraitMode("bust");
      }

      // Set switches
      if (preset.switches && Array.isArray(preset.switches)) {
        preset.switches.forEach((switchId) => {
          $gameSwitches.setValue(switchId, true);
        });
      }

      const currentMemberIndex = seat;
      const creatureSwitchId = 77 + currentMemberIndex;

      // Switches 77/78/79 and variables 38+ speak for a seat. A sheet built on
      // the bench's scratch slot sits in none of them, so it writes to none.
      if (currentMemberIndex >= 0) {
        if (preset.characterType) {
          $gameSwitches.setValue(creatureSwitchId, preset.characterType === "creature");
        } else if (preset.isCreature !== undefined) {
          $gameSwitches.setValue(creatureSwitchId, preset.isCreature);
        } else {
          $gameSwitches.setValue(creatureSwitchId, false);
        }
      }

      if (preset.gender !== undefined) {
        if (currentMemberIndex >= 0) $gameVariables.setValue(38 + currentMemberIndex, preset.gender);
        actor._gender = preset.gender;
        if (actor.setGender) actor.setGender(preset.gender);
      }

      window.CharacterPresets?.applyPresetIdentity?.(preset, actor);
      // The camper a dossier arrives in belongs to the founding of a party.
      if (!joining) window.CharacterPresets?.applyPresetVehicle?.(preset);

      // A dossier is played as it was written, so the Bio page it hands over is
      // already answered rather than sitting on its own defaults with nobody
      // allowed to touch them.
      this._initPresetBio(preset, actor, currentMemberIndex);

      actor.refresh();
    }

    // The bio a dossier implies. Age comes off its birth date, wealth off its
    // purse, and everything the dossier does not state is settled from its own
    // id so the same person is always the same person.
    _initPresetBio(preset, actor, seatIndex) {
      if (!preset || !actor) return;
      const memberIdx = Number.isInteger(seatIndex)
        ? seatIndex
        : (Scene_CharacterCreation._currentPartyMemberIndex || 0);
      actor._bioSet = true;

      const nowYear = (window.TimeDateSystem && window.TimeDateSystem.getCurrentDateObj)
        ? window.TimeDateSystem.getCurrentDateObj().getFullYear() : 2012;
      const birthYear = parseInt(String(preset.birthDate || "").slice(0, 4), 10);
      if (!isNaN(birthYear)) {
        const age = Math.max(1, nowYear - birthYear);
        actor._ccAge = age;
        if (memberIdx >= 0) {
          if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
          $gameSystem._ccBirthAge[memberIdx] = age;
        }
      }

      // Euros, the way the rest of the game counts money: destitute under 200,
      // working class under 1000, middle class under 5000, wealthy above it.
      // A dossier that states its own standing outranks its purse: what is in
      // somebody's pocket on the day they set out is not what they came from.
      if (preset.socialClass != null) {
        actor._wealthTier = Number(preset.socialClass);
      } else {
        const euros = (Number(preset.money) || 0) / 100;
        actor._wealthTier = euros >= 5000 ? 3 : euros >= 1000 ? 2 : euros >= 200 ? 1 : 0;
      }

      // The body the dossier was written with. Nothing had been writing this,
      // so every dossier sat on the reproduction selector's default (testicles)
      // no matter which gender it declared; a dossier that names no organs
      // takes the ones its gender usually comes with.
      const CCU = window.CharacterCreationUtils;
      if (memberIdx >= 0 && CCU) {
        if (preset.reproduction != null && CCU.setReproductionType) {
          CCU.setReproductionType(memberIdx, Number(preset.reproduction));
        } else if (preset.gender !== undefined && CCU.applyGenderAndReproduction) {
          CCU.applyGenderAndReproduction(memberIdx, preset.gender, { keepOrgans: true });
        }
      }

      if (actor._morality == null) actor._morality = 0;
      if (!actor._jobId) actor._jobId = 0;

      if (!actor._ccBloodType && !actor._bloodType) {
        const bloods = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [];
        const common = bloods.filter((b) => b && b.rarityKey === "common");
        const pool = common.length ? common : bloods;
        if (pool.length) {
          const blood = pool[(Number(preset.id) || 0) % pool.length];
          actor._ccBloodType = blood.id;
          actor._bloodType = blood.id;
          if (window.BloodTypeService && window.BloodTypeService.setForActor) {
            window.BloodTypeService.setForActor(actor, blood.id);
          }
        }
      }
    }

    onPresetCancel() {
      // The story mode's dossier choice is mandatory: there is nowhere to back
      // out to (see startStoryModeDossier), so leaving the board means
      // taking the dossier standing in front of you. That is what a step tab
      // clicked from the board does too, which is how the story mode reaches its
      // own bio and romance pages with a character already on them.
      if (Scene_CharacterCreation._storyMode) {
        const actor = Scene_CharacterCreation.getCurrentActor();
        if (!actor || !actor._isPresetActor) {
          this._applyPresetToMember(this._presetWindow ? this._presetWindow.index() : 0);
        }
        // The board parked the step on CREATION_MODE, a page the story mode never
        // asks; the sheet the dossier is now on opens on the bio page instead.
        this._step = STEP.BIO;
      }

      // Return to character type selection
      if (this._presetTitleWindow) {
        this._presetTitleWindow.close();
        this._presetTitleWindow = null;
      }
      if (this._presetWindow) {
        this._presetWindow.close();
        this._presetWindow = null;
      }

      // Re-activate grid window for keyboard input (DOM handles visuals)
      if (this._gridWindow) {
        this._gridWindow.activate();
      }

      this.refreshUIOverlayDOM();
    }


    // The story mode is played as Em and nobody else: no board is opened and no
    // dossier is chosen. Her own record is stamped onto the seat straight away,
    // which is what hands over the liminal cuffs and parks The Beast where she
    // left it, and the wizard opens on her sheet so the player still reads who
    // they are before setting out. Taking her record also spends this world's
    // Em (markPresetUsed -> recordEndlessPick), so the next one to fall through
    // a door is a drifter from another branch rather than the native one.
    startStoryModeDossier() {
      $gameSwitches.setValue(9, false);   // permadeath off (roguelite)
      $gameSystem._bloodAndOilMode = false;
      $gameSwitches.setValue(46, false);  // monster mode off
      if (!hasCompletedFirstCreation()) {
        ConfigManager.mapBattleMode = false;
        ConfigManager.save();
      }
      $gameSwitches.setValue(33, true);   // roguelite difficulty, applied silently
      // The pages the story mode's old walk used to tick off on its way past
      // them. Nothing walks them any more, so they are marked here instead, and
      // a later creation still knows they have been answered once.
      const presets = window.CharacterPresets;
      if (presets && typeof presets.markStepCompleted === "function") {
        [STEP.SETTINGS, STEP.DIFFICULTY, STEP.COMBAT_MODE].forEach((step) => {
          if (step != null) presets.markStepCompleted(step);
        });
      }
      this._applyStoryModeEmPreset();
      // Her sheet opens on the page the story mode leaves the player to write:
      // the bio. STEP.CREATION_MODE, where the old board parked the wizard, is
      // a page the story mode never asks.
      this._step = STEP.BIO;
      this.setupStep();
    }

    // Em's dossier, taken without a board in front of it. Everything the
    // ordinary pick does (_applyPresetToMember) minus the board: the record is
    // spent, the landing is remembered and the seat is filled.
    _applyStoryModeEmPreset() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor || actor._isPresetActor) return;
      const preset = storyModeEmPreset();
      if (!preset) {
        console.error("CharacterCreation: the story mode Em dossier is missing.");
        return;
      }
      try {
        this._applyPreset(preset, actor, presetSkins(preset)[0] || preset);
      } catch (e) {
        console.error('CharacterCreation: failed to apply the story mode dossier "Em"', e);
        return;
      }
      if (typeof markPresetUsed === "function") markPresetUsed(preset.id);
      // The story mode is Em's playthrough and nobody else's: her own dossier
      // switch stands alone, and every other dossier switch the record would
      // hand out (Bubba's 49, the shared 50) stays off.
      const EM_STORY_SWITCH = 48;
      const CPApi = window.CharacterPresets;
      const dossierSwitches = (CPApi && typeof CPApi.getPresetSwitchIds === "function")
        ? CPApi.getPresetSwitchIds()
        : (preset.switches || []);
      dossierSwitches.forEach((id) => {
        if (id > 0 && id !== EM_STORY_SWITCH) $gameSwitches.setValue(id, false);
      });
      $gameSwitches.setValue(EM_STORY_SWITCH, true);
      // Her creed and her lack of a job are story mode's, not the dossier's, so
      // they are written on now rather than waiting for the bio page to draw.
      const CP = window.CharacterPresets;
      if (CP && CP.applyStoryModeEmLocks) CP.applyStoryModeEmLocks(actor);
      actor.refresh();
      actor.recoverAll();
      $gameSystem._currentPresetId = preset.id;
      this._recordPresetLanding(preset);
    }

    // Leaving the wizard, whether for good or only as far as one of the screens
    // a step opens. The overlay is torn down at once rather than faded: the
    // screen that follows shares the very same #character-creation-container
    // and starts filling it on the same frame, so a 200ms fade-out was 200ms of
    // the NEXT screen sitting there half transparent, which read as the wizard
    // being slow. A scene change is already its own transition.

    calculatePresetAge(birthDate) {
      if (!birthDate) return null;
      const parts = birthDate.split("-").map(Number);
      const birthYear = parts[0];
      const birthMonth = parts[1] || 1;
      const birthDay = parts[2] || 1;
      if (!birthYear) return null;
      if (!window.TimeDateSystem || !window.TimeDateSystem.getGameTimeMinutes || !window.TimeDateSystem.getDateTimeFromMinutes) {
        return null;
      }
      const minutes = window.TimeDateSystem.getGameTimeMinutes();
      const currentDate = window.TimeDateSystem.getDateTimeFromMinutes(minutes);
      let age = currentDate.year - birthYear;
      const curMonth = Number(currentDate.monthNum);
      if (curMonth < birthMonth || (curMonth === birthMonth && currentDate.day < birthDay)) {
        age -= 1;
      }
      return age >= 0 ? age : null;
    }

    // Preset birthDate is stored as "YYYY-MM-DD"; the dossier displays dates
    // as DD/MM/YYYY.
    formatPresetBirthDate(birthDate) {
      if (!birthDate) return "";
      const parts = birthDate.split("-");
      if (parts.length !== 3) return birthDate;
      const [year, month, day] = parts;
      return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    }


    _hasPresetInParty(excludeCurrentMember = true) {
      const currentIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      for (let i = 0; i < 3; i++) {
        if (excludeCurrentMember && i === currentIdx) continue;
        const actor = $gameActors.actor(i + 1);
        if (actor && actor._isPresetActor) return true;
      }
      return false;
    }

    _isActorLockedPreset(actor) {
      if (!actor) actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor || !actor._isPresetActor) return false;
      // A dossier the player wrote (a saved character, a retired companion) is
      // theirs: taken as a starting point and edited from there, however far
      // they like. Only the hand-authored ones are played as written.
      const CP = window.CharacterPresets;
      if (CP && CP.isAuthoredPreset && !CP.isAuthoredPreset(actor._presetId)) return false;
      const name = (actor._presetName || actor.name() || "").trim().toLowerCase();
      const key = (actor._presetKey || "").trim().toLowerCase();
      if (name === "em" || key === "em") {
        // Em is the one dossier an ordinary playthrough may rewrite: she is a
        // different Em every time. Story mode is the exception, because there
        // she is not a dossier at all, she is the protagonist.
        return !!(window.CharacterPresets && window.CharacterPresets.isStoryModeEm &&
          window.CharacterPresets.isStoryModeEm(actor));
      }
      return true;
    }

    // Drops a taken dossier's lock: the type pills are the one way out of one
    // (see onSetCharacterType), since every other control refuses to touch a
    // locked preset actor and there would otherwise be no way back from a
    // dossier picked by mistake. The dossier itself goes back into the
    // world's pool, since this playthrough never actually kept it.
    _clearPresetLock(actor) {
      if (!actor || !actor._isPresetActor) return;
      if (actor._presetId && typeof unmarkPresetUsed === "function") {
        unmarkPresetUsed(actor._presetId);
      }
      if ($gameSystem && $gameSystem._currentPresetId === actor._presetId) {
        $gameSystem._currentPresetId = 0;
      }
      actor._isPresetActor = false;
      actor._presetKey = "";
      actor._presetName = "";
      actor._presetId = 0;
    }

    // True when the seat being edited holds a dossier that is played as it was
    // written. Every control that would rewrite the character asks this first,
    // so a taken dossier keeps the class, face, bio and kit it came with.
    _presetEditBlocked() {
      if (this._presetWindow) return false;   // the dossier board itself is not a member sheet
      if (this._presetLockFreeStep()) return false;
      return this._isActorLockedPreset(Scene_CharacterCreation.getCurrentActor());
    }

    // The pages a taken dossier leaves open. The story mode is played as Em and
    // never gets the ordinary wizard, so the page that says who she holds close
    // - the ties - is the player's to write there even though the dossier is
    // locked. The bio page is not: Em's sheet is read there in full, every
    // detail of it, and none of it is the player's to rewrite. Everywhere else a
    // dossier is played exactly as written. The garage is not among them any
    // more: the story mode sets out in The Beast, parked where Em left it, and
    // is never asked what it drives.
    _presetLockFreeStep() {
      if (!Scene_CharacterCreation._storyMode) return false;
      return this._step === STEP.ROMANCE;
    }

    // What the button under a dossier says. The wizard stamps the dossier onto
    // the seat being edited and carries on filling the party; the story mode has
    // only this one seat to fill, so taking a dossier there settles the party
    // outright, and the one page still owed after it is the vehicle.
    _presetConfirmLabel() {
      return Scene_CharacterCreation._storyMode
        ? ccT('CharCreate.confirmParty', 'Confirm Party')
        : T('CharCreate.applyToMember');
    }

    // The same question, answered out loud: the buzzer is how the board says no.
    _refusePresetEdit() {
      if (!this._presetEditBlocked()) return false;
      SoundManager.playBuzzer();
      return true;
    }

    // ── Compact Left Sidebar Column ──
    // One loadout line: icon, name, and an optional value on the right. The
    // sidebar, the class dossier and the scenario sheet all print their skills
    // and their kit through this, so the three lists read as the same list.

    // The dossier board and the dossier facing it. Lifted out of
    // refreshUIOverlayDOM so the preset screen is drawn the way every other
    // page of the spread is: a left method and a right one, asked for by the
    // dispatcher and owned by the module whose subject they are.
    // Throwing a dossier away. Only the player's own: a saved character or a
    // retired companion is theirs to keep or drop, while a hand-authored one is
    // part of the game and has no button at all (CharacterPresets.isAuthoredPreset).
    _presetIsPlayerMade(preset) {
      const CP = window.CharacterPresets;
      if (!preset || !CP || !CP.isAuthoredPreset) return false;
      return !CP.isAuthoredPreset(preset.id);
    }

    _presetDeleteButtonHtml(preset, activeIndex) {
      if (!this._presetIsPlayerMade(preset)) return "";
      return `
          <button class="cc-sidebar-btn cc-btn-full cc-btn-danger" onclick="SceneManager._scene.onDeletePreset(${activeIndex})">
            ${this._ccIconHtml(168, 18)} <span>${ccT('CharCreate.deletePreset', 'Delete Dossier')}</span>
          </button>`;
    }

    // Asked on the same parchment every other confirmation is asked on, and
    // answered by CharacterPresets.removePresetById, which refuses anything the
    // game itself wrote even when something asks it to.
    onDeletePreset(index) {
      const preset = this._presetWindow && this._presetWindow.itemAt
        ? this._presetWindow.itemAt(index)
        : null;
      if (!this._presetIsPlayerMade(preset)) { SoundManager.playBuzzer(); return; }
      this._ccConfirm({
        title: ccT('CharCreate.deletePreset', 'Delete Dossier'),
        body: ccTp('CharCreate.deletePresetBody', { name: preset.name },
          `Delete the dossier of ${preset.name}? This cannot be undone.`),
        acceptLabel: ccT('CharCreate.deletePreset', 'Delete Dossier')
      }, () => {
        const CP = window.CharacterPresets;
        if (!CP || !CP.removePresetById(preset.id, { playerOnly: true })) {
          SoundManager.playBuzzer();
          return;
        }
        SoundManager.playCancel();
        if (this._presetWindow && this._presetWindow.rebuild) {
          this._presetWindow.rebuild();
          const max = this._presetWindow.maxItems ? this._presetWindow.maxItems() : 0;
          if (this._presetWindow.select) this._presetWindow.select(Math.max(0, Math.min(index, max - 1)));
        }
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
      });
    }

    _presetPickerRightHtml(activeIndex) {
      const preset = this._presetWindow.currentPreset();
      const skins = preset ? presetSkins(preset) : [];
      const currentSkinIdx = this._presetWindow && this._presetWindow.skinIndex ? this._presetWindow.skinIndex(activeIndex) : 0;
      const currentSkin = skins[currentSkinIdx] || skins[0] || preset;
      const className = preset && $dataClasses[preset.classId] ? window.CCDbName($dataClasses[preset.classId]) : T('CharCreate.class');
      // A dossier's prose lives in the i18n bank under CharPresets.lore.<id>,
      // and Em's is composed on the spot; reading preset.lore straight off the
      // record found nothing for every dossier but a retired party member, so
      // the panel had fallen back to the generic line for all of them.
      const presetLore = preset
        ? (typeof getPresetLore === "function" ? getPresetLore(preset) : (preset.lore || ""))
        : "";
      // A dossier the story mode deals is a CLASS being chosen, so the page reads
      // as one: what the class does for a living, and what each of the skills it
      // opens with actually does in a fight. Every other dossier is a person,
      // and keeps its own prose.
      const briefHtml = (preset && preset.storyModeOnly)
        ? this._storyModeClassBriefHtml(preset)
        : `<p class="cc-text-desc cc-text-desc--body">
            ${this.cleanText(presetLore || ccT('CharCreate.presetNoLore', 'A distinguished operative prepared for network field operations.'))}
          </p>`;
      const presetGold = preset ? (presetLoadout(preset).money || 200000) : 200000;
      const presetMoneyFormatted = this._formatGoldToEuros(presetGold);

      // Some dossiers were drawn more than once: the same person in a second
      // outfit, a second office, a second state of being. Those alternates
      // are picked here, before the character is taken, and the look chosen
      // is the one they are then played as. Only shown for a dossier that
      // actually has more than one, so nobody else grows an empty row.
      const skinsHtml = skins.length > 1 ? `
          <div class="cc-skins-row">
            ${skins.map((s, si) => `
              <div class="cc-wanted-card cc-skin-card ${si === currentSkinIdx ? 'selected' : ''}"
                   onclick="SceneManager._scene.onPresetSkinClick(${si})">
                <div class="cc-wanted-sprite" style="${this.getSpriteStyle(s.sprite, s.spriteIndex)}"></div>
                <div class="cc-skin-name">${this.cleanText(presetSkinLabel(s))}</div>
              </div>
            `).join("")}
          </div>
          <div class="cc-skins-hint">
            <span class="cc-key-chip" data-pad="${skinKeyPadOn() ? "1" : "0"}">${skinKeyLabel()}</span>
            <span>${T('CharPresets.skinHint')} (${currentSkinIdx + 1}/${skins.length})</span>
          </div>` : "";

      const rightHtml = preset ? `
        <div class="cc-page cc-page-right cc-col">
          <div class="cc-row-end">
            <div class="cc-money-badge">${presetMoneyFormatted}</div>
          </div>
          <div class="cc-dossier-photo-frame">
            <div class="cc-wanted-sprite cc-sprite-x18 cc-sprite-tight" style="${this.getSpriteStyle(currentSkin.sprite, currentSkin.spriteIndex)}"></div>
          </div>
          ${skinsHtml}
          <div class="cc-dossier-card cc-card-padded">
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('CharCreate.dossierName', 'Name')}</span><span class="cc-dossier-value">${preset.name}</span></div>
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${T('CharCreate.vocation')}</span><span class="cc-dossier-value">${className}</span></div>
          </div>
          <div class="cc-scroll-pane">
            ${briefHtml}
          </div>
          <button class="cc-sidebar-btn cc-btn-full cc-btn-full--tall" onclick="SceneManager._scene.onApplyPresetToCurrentMember(${activeIndex})">
            ${this._ccIconHtml(189, 18)} <span>${this._presetConfirmLabel()}</span>
          </button>
          ${this._presetDeleteButtonHtml(preset, activeIndex)}
        </div>
      ` : `<div class="cc-page cc-page-right"></div>`;
      return rightHtml;
    }

    // What a story mode class is and what it opens with, written for somebody who
    // has never played this before: the prose lives in CharPresets.storyModeClass
    // and CharPresets.storyModeSkill, and nothing outside the story mode board
    // reads either bank. A skill with no brief of its own falls back to the
    // database line every other menu shows.
    _storyModeClassBriefHtml(preset) {
      const classId = preset && preset.classId;
      const classData = $dataClasses[classId];
      if (!classData) return "";
      const briefKey = "CharPresets.storyModeClass." + classId;
      const brief = T.has(briefKey) ? T(briefKey) : "";

      const skillsHtml = (classData.learnings || [])
        .filter((l) => l && l.level === 1 && $dataSkills[l.skillId])
        .map((l) => {
          const skill = $dataSkills[l.skillId];
          const key = "CharPresets.storyModeSkill." + skill.id;
          const text = T.has(key) ? T(key) : String(skill.description || "");
          return `
            <div class="cc-dossier-card cc-storymode-skill cc-card-padded cc-card-padded--tight">
              <div class="cc-subheader cc-subheader--flush cc-row-inline">
                ${this._ccIconHtml(skill.iconIndex || 79, 20)}
                <span>${window.CCDbName(skill)}</span>
              </div>
              <p class="cc-text-desc cc-text-desc--body cc-flush cc-text-desc--body">${this.cleanText(text)}</p>
            </div>
          `;
        }).join("");

      return `
        ${brief ? `<p class="cc-text-desc cc-text-desc--body cc-gap-below">${this.cleanText(brief)}</p>` : ""}
        ${skillsHtml ? `<h3 class="cc-subheader cc-subheader--flush">${T('CharCreate.startingSkills')}</h3>${skillsHtml}` : ""}
      `;
    }

    _presetPickerLeftHtml(activeIndex) {
      const presets = availablePresets();
      const presetsCards = presets.map((p, index) => {
        const isSelected = index === activeIndex;
        const cardSkins = presetSkins(p);
        const cardSkin = cardSkins[this._presetWindow && this._presetWindow.skinIndex ? this._presetWindow.skinIndex(index) : 0] || cardSkins[0] || p;
        return `
          <div class="cc-wanted-card ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onPresetCardClick(${index})">
            <div class="cc-wanted-sprite" style="${this.getSpriteStyle(cardSkin.sprite, cardSkin.spriteIndex)}"></div>
            <div class="cc-wanted-name">${p.name}</div>
            <div class="cc-wanted-class">${$dataClasses[p.classId] ? window.CCDbName($dataClasses[p.classId]) : "Operative"}</div>
          </div>
        `;
      }).join("");

      const leftHtml = `
        <div class="cc-page cc-page-left">
          <div class="cc-presets-board cc-dossier-board">${presetsCards}</div>
        </div>
      `;
      return leftHtml;
    }


    // The sidebar of the dossier board: the highlighted dossier read out as
    // stats, traits, skills and kit. It carries no button of its own. The
    // sidebar is the party panel's confirm elsewhere in the wizard, but here it
    // previews the very dossier the right page details, so a button on both
    // printed the same words twice on one screen for one action. The one that
    // takes the dossier sits under the dossier (see _presetPickerRightHtml).
    _renderPresetPreviewSidebarHtml() {
      const preset = this._presetWindow ? this._presetWindow.currentPreset() : null;
      if (!preset) return `<div class="cc-compact-sidebar"></div>`;

      const activeIndex = this._presetWindow.index ? this._presetWindow.index() : 0;
      const skins = presetSkins(preset);
      const skinIdx = this._presetWindow.skinIndex ? this._presetWindow.skinIndex(activeIndex) : 0;
      const skin = skins[skinIdx] || skins[0] || preset;
      const avatarStyle = skin.sprite ? this.getSpriteStyle(skin.sprite, skin.spriteIndex || 0) : "";

      const classData = $dataClasses[preset.classId];
      const className = classData ? window.CCDbName(classData) : ccT('CharCreate.class', 'Class');

      const identityHeaderHtml = `
        <div class="cc-compact-identity-card">
          <div class="cc-row-inline cc-row-gap-wide">
            <div class="cc-compact-avatar-wrap">
              <div class="cc-compact-avatar" style="${avatarStyle}"></div>
            </div>
            <div class="cc-col cc-col-gap-1 cc-col-grow">
              <div class="cc-detail-title">${preset.name || ""}</div>
              <div class="cc-identity-name">${className}</div>
            </div>
          </div>
        </div>
      `;

      const level = Math.max(1, Math.min(99, preset.level || 1));
      const paramAt = (paramId, fallback) => {
        const table = classData && classData.params && classData.params[paramId];
        return (table && table[level] != null) ? table[level] : fallback;
      };
      const SL = ccStatLabels();
      const stats = [
        { key: "HP",  label: SL.HP,  val: paramAt(0, 450), color: "var(--stat-hp)" },
        { key: "MP",  label: SL.MP,  val: paramAt(1, 100), color: "var(--stat-mp)" },
        { key: "STR", label: SL.STR, val: paramAt(2, 12),  color: "var(--stat-str)" },
        { key: "CON", label: SL.CON, val: paramAt(3, 10),  color: "var(--stat-con)" },
        { key: "DEX", label: SL.DEX, val: paramAt(6, 10),  color: "var(--stat-dex)" },
        { key: "INT", label: SL.INT, val: paramAt(4, 10),  color: "var(--stat-int)" },
        { key: "WIS", label: SL.WIS, val: paramAt(5, 10),  color: "var(--stat-wis)" },
        { key: "PSI", label: SL.PSI, val: paramAt(7, 10),  color: "var(--stat-psi)" }
      ];
      const statsHtml = `
        <div class="cc-vitals-block">
          <div class="cc-stat-grid">
            ${stats.map((st, idx) => {
              const statHover = `onmouseenter="SceneManager._scene.onStatHover(event, '${st.key}')" onmouseleave="SceneManager._scene.onItemLeave()"`;
              const isVital = idx < 2;
              if (isVital) {
                return `
                  <div class="cc-stat-box" ${statHover}>
                    <span class="cc-stat-label" class="cc-inked" style="--cc-ink:${st.color}">${st.label}</span>
                    <span class="cc-stat-val">${st.val}</span>
                  </div>
                `;
              }
              const mod = Math.floor((st.val - 10) / 2);
              const modStr = mod >= 0 ? "+" + mod : String(mod);
              return `
                <div class="cc-stat-box" ${statHover}>
                  <span class="cc-stat-label">${st.label}</span>
                  <span class="cc-stat-val">${st.val} <span class="cc-stat-mod">(${modStr})</span></span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;

      const traitObjs = selectedTraitObjects({ _selectedTraits: preset.traits });
      const traitRowsHtml = traitObjs.map((tr) => {
        return this._ccLoadoutRowHtml(
          tr.icon || 87,
          (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id,
          "",
          { hover: this._ccHoverAttrs("trait", tr.id) }
        );
      }).join("");
      const traitsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.traits'),
        traitRowsHtml,
        T('CharCreate.noDefiningTraits'),
        true,
        'cc-loadout-grid-cols'
      );

      // What this dossier actually walks out with, its own or its class's (see
      // presetLoadout): the same answer _applyPreset grants from.
      const loadout = presetLoadout(preset);

      const skillsList = loadout.skills.map((id) => $dataSkills[id]).filter(Boolean)
        .map((sk) => ({ name: window.CCDbName(sk), iconIndex: sk.iconIndex || 79, id: sk.id }));
      const skillsLoadoutHtml = skillsList.map((sk) => this._ccLoadoutRowHtml(sk.iconIndex, sk.name, "",
        { hover: this._ccHoverAttrs("skill", sk.id) })).join("");
      const skillsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.startingSkills'),
        skillsLoadoutHtml,
        T('CharCreate.noStartingSkills'),
        true,
        'cc-loadout-grid-cols'
      );

      const itemsList = [];
      loadout.weapons.forEach((entry) => {
        const w = entry && $dataWeapons[entry.id];
        if (w) itemsList.push({ name: window.CCDbName(w), iconIndex: w.iconIndex || 116, qty: entry.amount || 1, type: "weapon", id: w.id });
      });
      loadout.armors.forEach((entry) => {
        const a = entry && $dataArmors[entry.id];
        if (a) itemsList.push({ name: window.CCDbName(a), iconIndex: a.iconIndex || 144, qty: entry.amount || 1, type: "armor", id: a.id });
      });
      loadout.items.forEach((entry) => {
        const it = entry && $dataItems[entry.id];
        if (it) itemsList.push({ name: window.CCDbName(it), iconIndex: it.iconIndex || 176, qty: entry.amount || 1, type: "item", id: it.id });
      });
      const moneyRowHtml = this._ccLoadoutRowHtml(
        208,
        ccT('CharCreate.startingFunds', 'Starting Funds'),
        this._formatGoldToEuros(loadout.money),
        { nameColor: 'var(--text-primary-hover)', valueColor: 'var(--text-cost-ok)' }
      );
      const loadoutItemsHtml = itemsList.map((it) => this._ccLoadoutRowHtml(
        it.iconIndex, it.name, `x${it.qty}`, { hover: this._ccHoverAttrs(it.type, it.id, it.qty) }
      )).join("");
      const startingItemsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.startingItems'),
        moneyRowHtml + loadoutItemsHtml,
        T('CharCreate.noGear'),
        true,
        'cc-loadout-grid-cols'
      );

      return `
        <div class="cc-compact-sidebar">
          <div class="cc-compact-sidebar-body">
            ${identityHeaderHtml}
            ${statsHtml}
            ${traitsSectionHtml}
            ${skillsSectionHtml}
            ${startingItemsSectionHtml}
          </div>
        </div>
      `;
    }

    // ── Persistent Personal Dossier (Stats + Inventory + Money + Connected Bust) ──

    onApplyPresetToCurrentMember(presetIndex) {
      const presets = availablePresets();
      if (!this._applyPresetToMember(presetIndex)) return;
      // The story mode fills one seat and no more: the dossier it just took is
      // the party, so the board hands over to the face it is played with and
      // the adventure begins from there (see finishStoryModeCreation). It is
      // never opened on the story mode's own way in any more, which is played as
      // Em without a board at all, only if something reopens it.
      if (Scene_CharacterCreation._storyMode) {
        this.goToStoryModeSpriteBoard(presets[presetIndex] ||
          (this._presetWindow && this._presetWindow.currentPreset()));
        return;
      }
      this.onPresetCancel();
    }

    // The dossier settles the class; the face is still the player's. The sprite
    // board opens on that dossier's own sheets alone - the witches, the ring,
    // the goblins, the slimes - so a look can be chosen without stepping
    // outside what the dossier is. Confirming it (or backing out of it) brings
    // the wizard back on the vehicle page, the story mode's last question, which
    // is the step after the one the chain is opened from.
    goToStoryModeSpriteBoard(preset) {
      const board = window.Scene_SpriteGridSelector;
      const presetsApi = window.CharacterPresets;
      const pool = (preset && presetsApi && presetsApi.getStoryModeSpritePool)
        ? presetsApi.getStoryModeSpritePool(preset.spritePoolKey)
        : null;
      if (!board || !pool || pool.length === 0) {
        this.finishStoryModeCreation();
        return;
      }
      // The board keeps its own windows over the spread; they come down here
      // the way leaving it any other way brings them down (see onPresetCancel).
      if (this._presetTitleWindow) {
        this._presetTitleWindow.close();
        this._presetTitleWindow = null;
      }
      if (this._presetWindow) {
        this._presetWindow.close();
        this._presetWindow = null;
      }
      board._restrictToSheets = pool.slice();
      Scene_CharacterCreation.openSubScreens(STEP.ADD_MEMBER, ["sprite"]);
    }

    // Stamps one dossier onto the seat being edited. Answers whether it took,
    // and leaves the board alone: what happens next is the caller's business,
    // which is the whole reason it is not part of onApplyPresetToCurrentMember.
    _applyPresetToMember(presetIndex) {
      const presets = availablePresets();
      const preset = presets[presetIndex] || (this._presetWindow && this._presetWindow.currentPreset());
      if (!preset) return false;
      // One dossier to a party: a second one would overwrite the first one's
      // purse, kit and landing.
      if (this._hasPresetInParty(true)) {
        SoundManager.playBuzzer();
        return false;
      }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (actor) {
        const skins = presetSkins(preset);
        const skinIdx = this._presetWindow && this._presetWindow.skinIndex ? this._presetWindow.skinIndex(presetIndex) : 0;
        const skinData = skins[skinIdx] || skins[0] || preset;
        try {
          this._applyPreset(preset, actor, skinData);
        } catch (e) {
          console.error(`CharacterCreation: failed to apply preset "${preset.name}"`, e);
        }
        if (!preset.storyModeOnly && typeof markPresetUsed === "function") {
          markPresetUsed(preset.id);
        }
        actor.refresh();
        actor.recoverAll();
        $gameSystem._currentPresetId = preset.id;
        this._recordPresetLanding(preset);
      }
      return true;
    }

    // Memoized left-page party panel for the custom wizard. Rebuilding it runs
    // NPC-society lore generation (history simulation + backstory) for up to
    // three actors, so it must not run on every cursor move. We build a cheap
    // change signature from each member's displayed data (class, gender, name,
    // traits, gear) plus the active member, step and language; when the
    // signature is unchanged the cached HTML is returned untouched. This keeps
    // option navigation lag-free, since a plain cursor move never alters the
    // party panel.

    onPresetCardClick(index) {
      if (this._presetWindow) {
        // Clicking the highlighted dossier again takes it, except in the
        // story mode, where taking one begins the adventure: there the board is
        // browsed with the mouse and committed to with the button under it, so
        // a second click on the card that was already highlighted cannot end
        // creation by accident.
        if (this._presetWindow.index() === index && !Scene_CharacterCreation._storyMode) {
          this.onPresetSelect();
        } else if (this._presetWindow.index() === index) {
          SoundManager.playCursor();
        } else {
          this._presetWindow.select(index);
          this.refreshUIOverlayDOM();
        }
      }
    }

    onPresetCancelClick() {
      this.onPresetCancel();
    }

    // A thumbnail in the dossier's look picker was clicked.
    onPresetSkinClick(skinIndex) {
      if (this._presetWindow && this._presetWindow.selectSkin) {
        this._presetWindow.selectSkin(skinIndex);
      }
    }

    // Keeps the chip under the look thumbnails naming the button that is
    // actually there right now. Cheap: the DOM is only touched when the answer
    // changes.
    syncSkinKeyChip() {
      if (!this._dndContainer) return;
      const chip = this._dndContainer.querySelector(".cc-skins-hint .cc-key-chip");
      if (!chip) return;
      const onPad = skinKeyPadOn() ? "1" : "0";
      if (chip.dataset.pad === onPad) return;
      chip.dataset.pad = onPad;
      chip.textContent = skinKeyLabel();
    }

    // The highlighted dossier changed look (thumbnail, shoulder button, TAB).
    // Only three things on screen follow the look, so they are patched in
    // place: rebuilding the spread here reloaded every poster's sprite, which
    // made the board blink and threw away the dossier's scroll position on
    // each step through the looks.
    onPresetSkinChange() {
      if (!this._dndContainer || !this._presetWindow) return;
      const spread = this._dndContainer.querySelector(".cc-pockets-spread");
      const preset = this._presetWindow.currentPreset();
      if (!spread || !preset) {
        // No spread built yet (or nothing highlighted): fall back to the full
        // rebuild, which also stamps the board from scratch.
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
        return;
      }

      const skins = presetSkins(preset);
      const skinIdx = this._presetWindow.skinIndex ? this._presetWindow.skinIndex() : 0;
      const skin = skins[skinIdx] || skins[0] || preset;
      const spriteStyle = this.getSpriteStyle(skin.sprite, skin.spriteIndex);

      // The dossier portrait keeps the layout it was drawn with.
      const portrait = spread.querySelector(".cc-page-right .cc-dossier-photo-frame .cc-wanted-sprite");
      if (portrait) {
        portrait.setAttribute("style", spriteStyle);
      portrait.classList.add("cc-sprite-x18", "cc-sprite-tight");
      }

      // Which thumbnail wears the stamp, and the count under the row.
      spread.querySelectorAll(".cc-skin-card").forEach((el, i) => {
        el.classList.toggle("selected", i === skinIdx);
      });
      const hint = spread.querySelector(".cc-skins-hint span:last-child");
      if (hint) hint.textContent = `${T('CharPresets.skinHint')} (${skinIdx + 1}/${skins.length})`;

      // The board poster of the dossier being read, so the two agree. Scoped to
      // the board so the look thumbnails, which are wanted cards too, are left
      // alone.
      const cards = spread.querySelectorAll(".cc-page-left .cc-presets-board .cc-wanted-card");
      const card = cards[this._presetWindow.index()];
      const boardSprite = card && card.querySelector(".cc-wanted-sprite");
      if (boardSprite) boardSprite.setAttribute("style", spriteStyle);
    }

  }

  //===========================================================================
  // Signing a dossier on mid-adventure
  //===========================================================================
  // The wizard is not the only way a premade dossier enters a party: an event
  // can call one up by its id long after the game began. The person is built by
  // the very method the wizard's board uses, so they arrive with the class,
  // level, skills, traits, specializations, gear, look, bust, creature form,
  // bio and lore the dossier states, and with nothing the wizard would only
  // hand a party being founded (its purse, its stock, its camper, its landing).
  //
  // With no seat free they sign on all the same and wait on the Inactive list
  // in Dynamics -> Roster, exactly as a recruit who says yes to a full party
  // does (NPCSystemParty.benchRecruit).

  // The scratch slot a benched dossier's sheet is built on: a map-battle ally
  // actor, never in the party outside a fight, handed back blank the moment the
  // sheet has been snapshotted off it. The same slot NPCSystemParty uses.
  const BENCH_SCRATCH_ACTOR_ID = 8;

  // Stamps a dossier onto an actor without a scene under it. _applyPreset only
  // ever reaches for `this` to answer the bio, which the prototype answers too.
  function stampPreset(preset, actor, memberIndex) {
    const skins = presetSkins(preset);
    Scene_CharacterCreation.prototype._applyPreset.call(
      Scene_CharacterCreation.prototype,
      preset, actor, skins[0] || preset,
      { joining: true, memberIndex }
    );
    actor.refresh();
    actor.recoverAll();
  }

  /**
   * Sign a premade dossier on by its id, into the party or onto the bench.
   * @param {number} presetId - Dossier id, as listed in the preset records
   * @returns {object} { ok, reason?, actorId?, inactive?, preset? }
   */
  function joinPresetCharacter(presetId) {
    if (!$gameParty || !$gameActors) return { ok: false, reason: "noParty" };
    const api = window.CharacterPresets || {};
    const id = Number(presetId);
    const all = (typeof api.getCharacterPresets === "function") ? api.getCharacterPresets() : [];
    const preset = all.find((entry) => entry && Number(entry.id) === id);
    if (!preset) {
      console.error(`CharacterCreation: no dossier with id ${presetId} to sign on`);
      return { ok: false, reason: "unknownPreset" };
    }
    if ($gameParty.members().some((mem) => mem.name() === preset.name)) {
      return { ok: false, reason: "alreadyHere" };
    }

    const actorId = (typeof api.freeCompanionActorId === "function") ? api.freeCompanionActorId() : 0;
    if (actorId && $gameActors.actor(actorId)) {
      const actor = $gameActors.actor(actorId);
      stampPreset(preset, actor, $gameParty.members().length);
      $gameParty.addActor(actorId);
      if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);
      if (typeof markPresetUsed === "function" && !preset.storyModeOnly) markPresetUsed(preset.id);
      window.ParchmentToast?.show?.(T("CharPresets.dossierJoined", { name: preset.name }));
      return { ok: true, actorId, inactive: false, preset };
    }

    // No seat: build the sheet on the scratch slot, snapshot it onto the bench
    // and leave nothing of them behind on the slot.
    const scratch = $gameActors.actor(BENCH_SCRATCH_ACTOR_ID);
    const bench = api.benchActorAsPreset;
    if (!bench || !scratch || ($gameParty._actors || []).includes(BENCH_SCRATCH_ACTOR_ID)) {
      return { ok: false, reason: "partyFull" };
    }
    stampPreset(preset, scratch, -1);
    const result = bench(scratch, {
      isCreature: preset.characterType === "creature" || !!preset.isCreature,
      lore: (typeof getPresetLore === "function" && getPresetLore(preset)) || preset.lore || "",
    });
    $gameActors._data[BENCH_SCRATCH_ACTOR_ID] = null;
    if (!result || !result.ok) return { ok: false, reason: "partyFull" };
    if (typeof markPresetUsed === "function" && !preset.storyModeOnly) markPresetUsed(preset.id);
    window.ParchmentToast?.show?.(T("CharPresets.dossierJoinedInactive", { name: preset.name }));
    return { ok: true, inactive: true, preset: result.preset };
  }

  const joinPresetCommand = (args) => {
    joinPresetCharacter(Number((args && (args.presetId ?? args.id)) || 0));
  };
  PluginManager.registerCommand("CharacterCreationPresetFlow", "joinPresetCharacter", joinPresetCommand);
  // Legacy keys: the dossier records and the wizard both answer to this too.
  PluginManager.registerCommand("CharacterPresets", "joinPresetCharacter", joinPresetCommand);
  PluginManager.registerCommand("CharacterCreation", "joinPresetCharacter", joinPresetCommand);

  window.CCPresetJoin = { joinPresetCharacter };

  for (const key of Object.getOwnPropertyNames(CCPresetFlow.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Scene_CharacterCreation.prototype, key,
      Object.getOwnPropertyDescriptor(CCPresetFlow.prototype, key)
    );
  }
})();
