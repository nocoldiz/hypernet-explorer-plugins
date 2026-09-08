/*:
 * @target MZ
 * @plugindesc Dynamic class selection system with detailed information, skill categories, and confirmation dialogs
 * @author Omni-Lex
 * @orderAfter CharacterCreationShared
 * @orderAfter StartingEquipment
 * @orderAfter CharacterPresets
 * @orderBefore CharacterCreation
 *
 * @command openClassSelection
 * @text Open Class Selection
 * @desc Opens the class selection menu
 *
 * @param availableClasses
 * @text Available Classes
 * @desc List of class IDs that can be selected (comma-separated)
 * @type string
 * @default 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62
 *
 * @param classNameVariable
 * @text Class Name Variable
 * @desc Variable ID to store the selected class name
 * @type variable
 * @default 1
 *
 * @help
 * This plugin provides a comprehensive class selection UI system:
 * - Window_ClassSelection (class list with levels)
 * - Window_ClassDetails (class description, stats, weapons, skills)
 * - Window_ClassLevelUpSkills (level-up skill list)
 * - Window_SkillCategories (primary/secondary skill categories from Categories.json)
 * - Window_ClassSelectionTitle (title bar)
 * - Scene_ClassSelection (scene orchestrator)
 *
 * Primary/secondary skill categories per class live in
 * js/db/Skills/Categories.json ("classSkillCategories"), the single source of
 * truth, not in class noteboxes.
 *
 * Class Notetags:
 * <en: English description here>
 * <it: Italian description here>
 * <elem: 2> (element ID: 1=Physical, 2=Fire, 3=Ice, etc.)
 *
 * Dependencies:
 * - CharacterCreationShared.js (for localization)
 * - StartingEquipment.js (for weapon equipment)
 * - CharacterPresets.js (for tracking functions)
 *
 * Exports:
 * - window.ClassSelection.Scene_ClassSelection
 */

(() => {
  "use strict";

  const pluginName = "CharacterCreationClassSelector";

  let _statsI18n = null;

  const _loadStatsI18n = async () => {
    const lang = ConfigManager.language || "en";
    const url = `js/i18n/${lang}/stats.json`;
    try {
      const response = await fetch(url);
      _statsI18n = await response.json();
    } catch (e) {
      console.error("CharacterCreationClassSelector: Failed to load i18n data from " + url, e);
    }
  };

  // The <elem:> tag stores the engine's element id; the label is resolved here,
  // falling back to $dataSystem so a newly added element still shows.
  const elementLabel = (elementId) => {
    const key = 'ClassSelect.element.' + elementId;
    return T.has(key) ? T(key) : $dataSystem.elements[elementId];
  };

  const _si18n = (key) => {
    if (_statsI18n && _statsI18n[key]) {
      return _statsI18n[key];
    }
    return key;
  };

  _loadStatsI18n();

  //=============================================================================
  // Specializations (js/db/Skills/Specialization.json via SpecializationMenu.js)
  // that a class grants a head start in, sorted by name. Returns [] until
  // window.Specializations finishes its async load.
  //=============================================================================

  const getClassGrantedSpecializations = (className) => {
    if (!className || !window.Specializations || !window.Specializations.ready) return [];
    const rows = [];
    window.Specializations.list.forEach((spec) => {
      const lvl = spec.classStart && spec.classStart[className];
      if (lvl) rows.push({ name: window.Specializations.displayName(spec), levelName: window.Specializations.levelName(lvl) });
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  };

  const getClassSpecializationsHTML = (className) => {
    const rows = getClassGrantedSpecializations(className);
    if (!rows.length) return "";
    const badges = rows.map((r) =>
      `<span class="cc-element-badge cc-chip">${r.name} <span class="cc-chip-sub">(${r.levelName})</span></span>`
    ).join(" ");
    return `
      <div class="cc-dossier-card cc-card-tight">
        <h3 class="cc-subheader">${T('ClassSelect.startingSpecializations')}</h3>
        <div class="cc-chip-row">
          ${badges}
        </div>
      </div>
    `;
  };

  //=============================================================================
  // Plugin Parameters
  //=============================================================================

  const parameters = PluginManager.parameters(pluginName);
  const availableClassesParam =
    parameters["availableClasses"] ||
    "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62";
  const availableClasses = availableClassesParam
    .split(",")
    .map((id) => Number(id.trim()));

  // Classes 1-62 are the sentient roster a person is built from; Feral (63)
  // and everything after it are the creature classes (Feral, Mimic, Monster,
  // Mana Cyborg, Ghost, Zombie, Mutant, Drone), offered only to a creature
  // whose archetypes list them. See the classes / creatureClasses rosters in
  // Archetypes.json.
  const SENTIENT_CLASS_MAX = window.CreatureClasses.sentientMax();

  //=============================================================================
  // Aliases for dependencies
  //=============================================================================

  const { weaponTypeIcons } = window.StartingEquipment || {};
  const { equipRandomCompatibleWeapon, equipClassStartingArmor, GLOBAL_STARTER_SKILLS, getClassStartingItems, giveClassStartingItems } = window.StartingEquipment || {};

  // IconSet glyph via CSS background-position (same convention as
  // TraitSelector.getIconStyle / Scene_CharacterCreation._ccIconStyle), used to
  // render the "Starting Items" dossier card below.
  function iconStyle(iconIndex) {
    return window.CCArt.icon(iconIndex, 32);
  }
  const { markFirstCreationComplete } = window.CharacterPresets || {};

  //=============================================================================
  // Window_ClassSelection - Class List
  //=============================================================================

  class Window_ClassSelection extends Window_Selectable {
    initialize(rect) {
      super.initialize(rect);
      this._data = this.makeClassList();
      this.refresh();
      this.select(0);
      this.activate();
    }

    makeClassList() {
      // How many of the entries at the head of the list are creature classes,
      // which is where the board draws its "Non Sentient" / "Sentient" heads.
      this._creatureCount = 0;

      const known = (ids) => ids.filter((id) => id > 0 && $dataClasses[id]);
      const filter = window.$ccArchetypeClassFilter;

      // Severed hides every Magical class, unbound hides every Mundane one
      // (both/untagged always pass); see window.MagicNature. Freelancer and
      // Monster are tagged <Nature: Both> in Classes.json specifically so
      // they are never among the ones filtered out, whichever way the world
      // leans: there is always at least a themeless class to fall back on.
      // A scope that would filter down to nothing keeps its unfiltered set
      // rather than lock the step out (same "never a locked door" rule the
      // sprite/bust wardrobes use).
      const magicAllowed = (ids) => {
        const MN = window.MagicNature;
        if (!MN || !MN.isFiltering()) return ids;
        const kept = ids.filter((id) => MN.allowsData($dataClasses[id]));
        return kept.length > 0 ? kept : ids;
      };

      // A creature is scoped by its archetypes and comes in two groups, its own
      // kind first. See CreatureClasses.groupsForArchetypes.
      if (filter && !Array.isArray(filter) && (filter.creature || filter.sentient)) {
        const creature = magicAllowed(known(filter.creature || []));
        const sentient = magicAllowed(known(filter.sentient || []));
        if (creature.length || sentient.length) {
          this._creatureCount = creature.length;
          return creature.concat(sentient);
        }
      }

      // Everyone else browses the sentient roster. A caller may scope it to a
      // list of ids; a null/empty filter means the whole roster.
      let list = magicAllowed(known(availableClasses).filter(
        (classId) => classId <= SENTIENT_CLASS_MAX
      ));
      if (Array.isArray(filter) && filter.length > 0) {
        const allowed = new Set(filter);
        const scoped = list.filter((classId) => allowed.has(classId));
        if (scoped.length > 0) list = scoped;
      }
      return list;
    }

    // Index of the first sentient class, i.e. where the second group starts.
    // -1 when the list is not grouped.
    groupBreak() {
      return this._creatureCount > 0 ? this._creatureCount : -1;
    }

    maxItems() {
      return this._data ? this._data.length : 1;
    }

    itemAt(index) {
      return this._data ? this._data[index] : null;
    }

    drawItem(index) {
      const classId = this.itemAt(index);
      if (classId) {
        const rect = this.itemLineRect(index);
        const className = $dataClasses[classId].name;
        const classLevel = this.getClassLevel(classId);
        const displayText = `${className} (Lv. ${classLevel})`;
        this.drawText(displayText, rect.x, rect.y, rect.width);
      }
    }

    getClassLevel(classId) {
      const actor = $gameParty.members()[0];
      if (!actor) return 1;

      if (actor._classId === classId) {
        return actor._level;
      }

      return actor._classLevels ? actor._classLevels[classId] || 1 : 1;
    }

    processOk() {
      const classId = this.itemAt(this.index());
      if (classId) {
        this.callOkHandler();
      }
    }

    select(index) {
      super.select(index);
      this.callHandler("select");
    }

    onTouchSelect(trigger) {
      super.onTouchSelect(trigger);
      this.callHandler("select");
    }

    currentClass() {
      return $dataClasses[this.itemAt(this.index())];
    }

    currentClassId() {
      return this.itemAt(this.index());
    }
  }

  //=============================================================================
  // Window_ClassLevelUpSkills - Level-Up Skills List
  //=============================================================================


  //=============================================================================
  // Window_SkillCategories - Skill Categories from Notetags
  //=============================================================================


  //=============================================================================
  // Window_ClassDetails - Class Information Display
  //=============================================================================

  class Window_ClassDetails extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this._class = null;
      this.refresh();
    }

    setClass(classData) {
      if (this._class !== classData) {
        this._class = classData;
        this.refresh();
      }
    }

    refresh() {
      this.contents.clear();
      if (this._class) {
        this.drawClassDetails();
      }
    }

    drawClassDetails() {
      const statsHeight = this.calcStatsHeight();
      const skillsHeight = this.calcSkillsHeight();
      this.drawClassNote();
      const bottomMargin = 10;
      const availableHeight = this.contents.height - bottomMargin;
      const statsStartY = availableHeight - statsHeight - skillsHeight;
      const skillsStartY = availableHeight - skillsHeight;
      this.drawParameters(statsStartY);
      this.drawLearnableSkills(skillsStartY);
    }

    calcStatsHeight() {
      return Math.ceil(6 / 2) * (this.lineHeight() * 0.9) + this.lineHeight();
    }

    calcSkillsHeight() {
      let skillCount = 0;
      if (this._class.learnings && this._class.learnings.length > 0) {
        skillCount = this._class.learnings.filter(
          (learning) => learning.level === 1
        ).length;
      }
      return (
        Math.max(1, skillCount) * (this.lineHeight() * 0.85) + this.lineHeight()
      );
    }

    drawClassNote() {
      let note = this._class.note || T('ClassSelect.noDescription');
      const rawNote = this._class.note || "";

      if (ConfigManager.language === "it") {
        const match = note.match(/<it:\s*([\s\S]*?)>/);
        if (match) {
          note = match[1].trim();
        } else {
          note = note.replace(/<[^>]+>/g, "").trim();
        }
      } else {
        const match = note.match(/<en:\s*([\s\S]*?)>/);
        if (match) {
          note = match[1].trim();
        } else {
          note = note.replace(/<(it|en):\s*[\s\S]*?>/g, "").trim();
        }
      }

      // Surface the class's signature passive instead of the flavor blurb.
      if (window.BattleSystemPassiveSkills && this._class) {
        const passiveDesc =
          window.BattleSystemPassiveSkills.getPassiveDescription(this._class.id);
        if (passiveDesc) note = passiveDesc;
      }

      this.changeTextColor(ColorManager.systemColor());
      this.resetTextColor();
      const maxLines = 3;
      const maxLength = this.contents.width * maxLines - 10;
      const truncatedNote =
        note.length > maxLength ? note.substring(0, maxLength) + "..." : note;

      let currentY = 0;
      this.drawTextEx(truncatedNote, 0, currentY, this.contents.width);

      // Extract and display element
      const elemMatch = rawNote.match(/<elem:\s*(\d+)>/);
      if (elemMatch) {
        const elementId = parseInt(elemMatch[1]);
        if (elementId > 0 && elementId < $dataSystem.elements.length) {
          const elementName = elementLabel(elementId);

          const elementIcons = [0, 96, 64, 65, 66, 67, 68, 69, 70, 71];
          const elementIcon = elementIcons[elementId] || 0;

          currentY += this.lineHeight() * 3 + 10;
          this.changeTextColor(ColorManager.systemColor());
          this.drawText(T('ClassSelect.elementHeading'), 0, currentY, 120);
          this.resetTextColor();
          this.drawText(elementName, 140, currentY, this.contents.width - 200);

          if (elementIcon > 0) {
            const textWidth = this.textWidth(elementName);
            this.drawIcon(elementIcon, 140 + textWidth + 8, currentY);
          }
        }
      }

      // Extract and display magic system (gen_class_magic_system_tags.js):
      // shares the element's row when there is one, since every class
      // already carries an <elem:> tag; opens its own row otherwise.
      const magicMatch = rawNote.match(/<MagicalSystem:\s*([^>]+)>/i);
      if (magicMatch) {
        if (!elemMatch) currentY += this.lineHeight() * 3 + 10;
        const systemKey = magicMatch[1].trim();
        const systemName = T('SkillsMenu.magicSystem.' + systemKey) || systemKey;
        const colX = Math.floor(this.contents.width * 0.55);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(T('ClassSelect.magicSystemHeading'), colX, currentY, 110);
        this.resetTextColor();
        this.drawText(systemName, colX + 110, currentY, this.contents.width - colX - 110);
      }
    }

    drawWeaponAndMagicIcons(y) {
      let iconX = 0;
      const iconWidth = ImageManager.iconWidth + 4;
      for (let weaponTypeId = 1; weaponTypeId <= 12; weaponTypeId++) {
        if (this.canUseWeaponType(weaponTypeId)) {
          const icon = weaponTypeIcons ? weaponTypeIcons[weaponTypeId] : 96;
          this.drawIcon(icon, iconX, y);
          iconX += iconWidth;
        }
      }
    }

    canUseWeaponType(weaponTypeId) {
      if (!this._class || !this._class.traits) return false;
      return this._class.traits.some(
        (trait) =>
          trait.code === 51 &&
          trait.dataId === weaponTypeId &&
          trait.value === 1
      );
    }

    drawParameters(y) {
      const paramNames = [
        _si18n("ATT"),
        _si18n("DEF"),
        _si18n("M.ATT"),
        _si18n("M.DEF"),
        _si18n("AGILITY"),
        _si18n("LUCK")
      ];
      const paramIds = [2, 3, 4, 5, 6, 7];
      for (let i = 0; i < paramNames.length; i++) {
        const x = (i % 2) * (this.contents.width / 2);
        const paramY = y + Math.floor(i / 2) * (this.lineHeight() * 0.9);
        const paramValue = this._class.params[paramIds[i]][1];
        this.changeTextColor(ColorManager.textColor(1));
        this.drawText(paramNames[i] + ":", x, paramY, 80);
        this.resetTextColor();
        this.drawText(String(paramValue), x + 80, paramY, 60, "right");
      }
    }

    drawLearnableSkills(y) {
      this.drawWeaponAndMagicIcons(y);
      let level1Skills = [];
      if (this._class.learnings && this._class.learnings.length > 0) {
        level1Skills = this._class.learnings
          .filter((learning) => learning.level === 1)
          .map((learning) => $dataSkills[learning.skillId].name);
      }

      if (level1Skills.length === 0) {
        this.drawText(
          T('ClassSelect.noSkillsAtLevel1'),
          0,
          y + this.lineHeight(),
          this.contents.width
        );
        return;
      }
      let skillY = y + this.lineHeight() * 0.9;
      const skillLineHeight = this.lineHeight() * 0.85;
      for (const skillName of level1Skills) {
        this.drawText(skillName, 0, skillY, this.contents.width);
        skillY += skillLineHeight;
      }
    }
  }

  //=============================================================================
  // Window_ClassSelectionTitle - Title Bar
  //=============================================================================

  class Window_ClassSelectionTitle extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this.refresh();
    }

    refresh() {
      this.contents.clear();
      this.drawText(T('ClassSelect.selectYourClass'), 0, 0, this.contents.width, "center");
    }
  }

  //=============================================================================
  // Scene_ClassSelection - Scene Orchestrator
  //=============================================================================

  class Scene_ClassSelection extends Scene_MenuBase {
    create() {
      super.create();
      this.createTitleWindow();
      this.createClassWindow();
      this.createDetailsWindow();
      this.createUIOverlay();
    }

    terminate() {
      super.terminate();
      if (window.CCNav) window.CCNav.detach(this);
      if (this._dndContainer) {
        window.CCPanel.hide(this._dndContainer);
      }
    }

    createUIOverlay() {
      // 1. Mute native windows
      if (this._titleWindow) {
        this._titleWindow.visible = false;
        this._titleWindow.opacity = 0;
      }
      if (this._classWindow) {
        this._classWindow.visible = false;
        this._classWindow.opacity = 0;
      }
      if (this._detailsWindow) {
        this._detailsWindow.visible = false;
        this._detailsWindow.opacity = 0;
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
      this._lastShowSub = false;
      // Wheel + L2/R2 scrolling for the detail panes. See CCScroll.
      if (window.CCScroll) window.CCScroll.bindWheel(this._dndContainer);
      // The dossier facing the list has buttons and chips of its own, walked
      // with the focus ring. See CharacterCreationNav.js.
      if (window.CCNav) window.CCNav.attach(this, this._dndContainer);
      this.refreshUIOverlayDOM();
    }

    cleanText(str) {
      if (!str) return "";
      return str.replace(/\\C\[\d+\]/gi, "").replace(/\\C/gi, "");
    }

    splitCamelCase(text) {
      return text.replace(/([A-Z])/g, " $1").trim();
    }

    canUseWeaponType(c, weaponTypeId) {
      if (!c || !c.traits) return false;
      return c.traits.some(
        (trait) =>
          trait.code === 51 &&
          trait.dataId === weaponTypeId &&
          trait.value === 1
      );
    }

    refreshUIOverlayDOM() {
      if (!this._dndContainer) return;

      const showSub = !!(this._levelUpListWindow || this._skillCategoriesWindow || this._statsWindow);
      const c = this._classWindow.currentClass();

      // Mute windows dynamically
      if (this._levelUpListWindow) {
        this._levelUpListWindow.visible = false;
        this._levelUpListWindow.opacity = 0;
      }
      if (this._skillCategoriesWindow) {
        this._skillCategoriesWindow.visible = false;
        this._skillCategoriesWindow.opacity = 0;
      }
      if (this._statsWindow) {
        this._statsWindow.visible = false;
        this._statsWindow.opacity = 0;
      }

      let leftHtml = "";
      let rightHtml = "";
      let overlayHtml = "";

      // --- NORMAL VOCATION DOSSIER VIEW ---
      {
        const classList = this._classWindow._data;
        const activeIndex = this._classWindow.index();

        // A creature's roster arrives in two groups, its own kind first. The
        // heads span the whole board and are not cards, so the card indices the
        // click handler and the partial update walk stay the flat list's.
        const groupBreak = this._classWindow.groupBreak();
        const sectionHead = (label) => `
            <h3 class="cc-roster-head">${label}</h3>
          `;

        // The nine elements are tagged from the shared ladder (--element-1..9
        // in the presets), so a card here and a skill row elsewhere agree.
        const _elemColors = {
          1:"var(--element-1)",2:"var(--element-2)",3:"var(--element-3)",4:"var(--element-4)",
          5:"var(--element-5)",6:"var(--element-6)",7:"var(--element-7)",8:"var(--element-8)",
          9:"var(--element-9)"
        };

        const classCards = classList.map((classId, index) => {
          const isSelected = index === activeIndex;
          const classObj = $dataClasses[classId];
          if (!classObj) return "";
          const className = window.CCDbName(classObj);
          const em = classObj.note && classObj.note.match(/<elem:\s*(\d+)>/);
          const eColor = em ? (_elemColors[parseInt(em[1])] || "var(--border-gold-amber-30)") : "var(--border-gold-amber-30)";

          let head = "";
          if (groupBreak > 0) {
            if (index === 0) head = sectionHead(T('ClassSelect.ui.nonSentient'));
            else if (index === groupBreak) head = sectionHead(T('ClassSelect.ui.sentient'));
          }

          return `
            ${head}
            <div class="cc-class-row focusable ${isSelected ? 'selected' : ''}"
                 style="--cc-class-elem:${eColor}"
                 onclick="SceneManager._scene.onClassCardClick(${index})">
              <span class="cc-class-row-name">${className}</span>
            </div>
          `;
        }).join("");

        if (c) {
          // English, on purpose: it is the key Specialization.json's classStart
          // table is written against. Display goes through CCDbName instead.
          const className = c.name;
          let note = c.note || "";

          // Parse localized description
          if (ConfigManager.language === "it") {
            const match = note.match(/<it:\s*([\s\S]*?)>/);
            note = match ? match[1].trim() : note.replace(/<[^>]+>/g, "").trim();
          } else {
            const match = note.match(/<en:\s*([\s\S]*?)>/);
            note = match ? match[1].trim() : note.replace(/<(it|en):\s*[\s\S]*?>/g, "").trim();
          }

          // Surface the class's signature passive instead of the flavor blurb.
          if (window.BattleSystemPassiveSkills) {
            const passiveDesc =
              window.BattleSystemPassiveSkills.getPassiveDescription(c.id);
            if (passiveDesc) note = passiveDesc;
          }

          // Parse element
          let elementHtml = "";
          const elemMatch = c.note.match(/<elem:\s*(\d+)>/);
          if (elemMatch) {
            const elementId = parseInt(elemMatch[1]);
            if (elementId > 0 && elementId < $dataSystem.elements.length) {
              const elementName = elementLabel(elementId);
              elementHtml = `<div class="cc-element-badge cc-element-badge-spaced">${elementName}</div>`;
            }
          }

          // Stat parameters
          const str = c.params[2][1];
          const con = c.params[3][1];
          const mat = c.params[4][1];
          const mdf = c.params[5][1];
          const agi = c.params[6][1];
          const luk = c.params[7][1];

          // Weapons proficiencies
        const weaponNames = {
          1: T('CharCreate.light'),
          2: T('CharCreate.sword'),
          3: T('CharCreate.heavy'),
          4: T('CharCreate.axe'),
          5: T('CharCreate.whip'),
          6: T('CharCreate.staff'),
          7: T('CharCreate.bow'),
          8: T('CharCreate.projectile'),
          9: T('CharCreate.gun'),
          10: T('CharCreate.claw'),
          11: T('CharCreate.glove'),
          12: T('CharCreate.spear')
        };

          const weaponBadges = [];
          for (let wId = 1; wId <= 12; wId++) {
            if (this.canUseWeaponType(c, wId)) {
              weaponBadges.push(`<span class="cc-element-badge cc-chip">${weaponNames[wId] || "Weapon"}</span>`);
            }
          }

          // Initial Level 1 Skills
          let lv1SkillsHtml = "";
          if (c.learnings && c.learnings.length > 0) {
            const lv1 = c.learnings.filter(l => l.level === 1);
            if (lv1.length > 0) {
              lv1SkillsHtml = lv1.map(l => {
                const sk = $dataSkills[l.skillId];
                return sk ? `<span class="cc-element-badge cc-chip">${window.CCDbName(sk)}</span>` : "";
              }).join(" ");
            }
          }
          if (!lv1SkillsHtml) {
            lv1SkillsHtml = `<span class="cc-class-empty">${T('CharCreate.noStartingSkills')}</span>`;
          }

          // Thematic class starting items (Items.json only), off the class's
          // own <StartItems:> note tag. See CharacterCreationEquipment.js.
          const classItems = typeof getClassStartingItems === "function" ? getClassStartingItems(c.id) : [];
          const classItemsHtml = classItems
            .map((e) => {
              const it = $dataItems[e.id];
              if (!it) return "";
              return `
                <div class="cc-dossier-row">
                  <span class="cc-dossier-label cc-class-icon-label">
                    <span class="cc-rpg-icon" style="${iconStyle(it.iconIndex)}"></span>${window.CCDbName(it)}
                  </span>
                  <span class="cc-dossier-value">x${e.qty}</span>
                </div>
              `;
            }).join("");
          const startingItemsCardHtml = classItemsHtml
            ? `
                <div class="cc-dossier-card cc-card-tight">
                  <h3 class="cc-subheader">${T('CharCreate.startingItems')}</h3>
                  ${classItemsHtml}
                </div>
              `
            : "";

          // Creature flow: the roster on screen is only what the creature's
          // archetypes support, so label it instead of implying the full list.
          const creatureNote = window.$ccCreatureClassFlow
            ? `<p class="cc-text-desc">${T('CharCreate.onlyWhatYourArchetypesSupport')}</p>`
            : "";

          // ── Nature & Magical System pills ──────────────────────────────────
          const _nature = window.MagicNature ? window.MagicNature.natureOf(c) : null;
          const _natureColors = { magical:"var(--nature-magical)", mundane:"var(--nature-mundane)", both:"var(--nature-both)" };
          const _natureSoft = { magical:"var(--nature-magical-soft)", mundane:"var(--nature-mundane-soft)", both:"var(--nature-both-soft)" };
          const _natureLabels = { magical: T('ClassSelect.natureMagical'), mundane: T('ClassSelect.natureMundane'), both: T('ClassSelect.natureBoth') };
          const naturePill = _nature
            ? `<span class="cc-element-badge cc-chip" style="--cc-chip-line:${_natureSoft[_nature]}; --cc-chip-ink:${_natureColors[_nature]}">✦ ${_natureLabels[_nature]}</span>`
            : "";
          const _magicMatch = c.note.match(/<MagicalSystem:\s*([^>]+)>/i);
          const magicSystemPill = _magicMatch
            ? `<span class="cc-element-badge cc-chip">⊕ ${T('SkillsMenu.magicSystem.' + _magicMatch[1].trim()) || _magicMatch[1].trim()}</span>`
            : "";

          // ── Dual Wield ─────────────────────────────────────────────────────
          const hasDualWield = c.traits.some(t => t.code === 55 && t.dataId === 1);
          const dualWieldBadge = hasDualWield
            ? `<span class="cc-element-badge cc-chip cc-chip-gold">⚔ ${T('ClassSelect.dualWield')}</span>`
            : "";

          // ── XParam Bonuses ─────────────────────────────────────────────────
          const _xNames = [
            T('ClassSelect.xparam.hit'), T('ClassSelect.xparam.eva'),
            T('ClassSelect.xparam.cri'), T('ClassSelect.xparam.cev'),
            T('ClassSelect.xparam.mev'), T('ClassSelect.xparam.mrf'),
            T('ClassSelect.xparam.cnt'), T('ClassSelect.xparam.hrg'),
            T('ClassSelect.xparam.mrg'), T('ClassSelect.xparam.trg')
          ];
          const xBonuses = c.traits.filter(t => t.code === 22 && t.value !== 0).map(t => {
            const sign = t.value >= 0 ? "+" : "";
            return `<div class="cc-class-bonus-row">
              <span class="cc-class-bonus-name">${_xNames[t.dataId] || T('ClassSelect.xparam.unknown', { n: t.dataId })}</span>
              <span class="cc-class-bonus-value${t.value >= 0 ? '' : ' negative'}">${sign}${Math.round(t.value*100)}%</span>
            </div>`;
          });
          const bonusesSectionHtml = xBonuses.length ? `
            <div class="cc-dossier-card cc-card-tight">
              <h3 class="cc-subheader">${T('ClassSelect.bonuses')}</h3>
              ${xBonuses.join("")}
            </div>` : "";

          // ── Learnset (all levels) with MP / AP costs + hover description ───
          const _learnRows = (c.learnings || [])
            .slice().sort((a,b) => a.level - b.level)
            .map(l => {
              const sk = $dataSkills[l.skillId];
              if (!sk) return "";
              const mp = sk.mpCost || 0;
              const ap = sk.tpCost || 0;
              const desc = window.CCDbDesc(sk).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
              const isStart = l.level === 1;
              return `<div class="cc-class-learn-row${isStart ? ' start' : ''}" title="${desc}">
                <span class="cc-class-learn-level">
                  ${isStart ? '★' : T('ClassSelect.levelShort')+l.level}
                </span>
                <span class="cc-class-learn-name">${window.CCDbName(sk)}</span>
                ${mp ? `<span class="cc-class-learn-cost">${mp}MP</span>` : ""}
                ${ap ? `<span class="cc-class-learn-cost ap">${ap}AP</span>` : ""}
              </div>`;
            }).join("");
          const learnsetHtml = _learnRows ? `
            <div class="cc-dossier-card cc-card-tight">
              <h3 class="cc-subheader">${T('ClassSelect.learnset')}</h3>
              <div class="cc-class-learnset">
                ${_learnRows}
              </div>
            </div>` : "";

          leftHtml = `
            <div class="cc-page cc-page-left cc-page-column">
              <h2 class="cc-header-gothic">${T('CharCreate.classes')}</h2>
              ${creatureNote}
              <div class="cc-class-list">
                ${classCards}
              </div>
            </div>
          `;

        // The attribute abbreviations the rest of the game prints, English
        // where CharacterCreationShared has not loaded (a harness, a stripped
        // build).
        const _SL = (typeof window.CCStatLabels === 'function')
          ? window.CCStatLabels()
          : { STR: "STR", CON: "CON", INT: "INT", WIS: "WIS", DEX: "DEX", PSI: "PSI" };
        rightHtml = `
          <div class="cc-page cc-page-right">
            <h2 class="cc-header-gothic">${window.CCDbName(c)}</h2>
            <p class="cc-class-quote">"${note}"</p>

            <div class="cc-class-pills">
              ${elementHtml}${naturePill}${magicSystemPill}
            </div>

            <div class="cc-dossier-card cc-card-tight">
              <div class="cc-class-stat-grid">
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.STR}:</span><span class="cc-dossier-value">${str}</span></div>
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.CON}:</span><span class="cc-dossier-value">${con}</span></div>
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.DEX}:</span><span class="cc-dossier-value">${agi}</span></div>
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.INT}:</span><span class="cc-dossier-value">${mat}</span></div>
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.WIS}:</span><span class="cc-dossier-value">${mdf}</span></div>
                <div class="cc-dossier-row"><span class="cc-dossier-label">${_SL.PSI}:</span><span class="cc-dossier-value">${luk}</span></div>
              </div>
            </div>

            ${bonusesSectionHtml}

            <div class="cc-dossier-card cc-card-tight">
              <h3 class="cc-subheader">${T('CharCreate.startingWeaponProficiencies')||'Weapon Proficiencies'}</h3>
              <div class="cc-chip-row">
                ${weaponBadges.join("") || `<span class="cc-class-empty">${T('CharCreate.none')||'None'}</span>`}
                ${dualWieldBadge}
              </div>
            </div>

            ${learnsetHtml}

            ${startingItemsCardHtml}

            ${getClassSpecializationsHTML(className)}

            ${window.CCButtons.panel({
              back: window.CCButtons.button(window.CCButtons.backLabel(), {
                onclick: "SceneManager._scene.onClassCancel()",
              }),
              next: window.CCButtons.button(window.CCButtons.continueLabel(), {
                onclick: "SceneManager._scene.onClassSelect()",
                confirm: true,
              }),
              cls: "cc-nav--spaced",
            })}
          </div>
        `;
        }
      }

      // Find or create .cc-pockets-spread
      let spread = this._dndContainer.querySelector(".cc-pockets-spread");
      if (!spread) {
        this._dndContainer.innerHTML = `
          <div class="cc-pockets-spread">
            <div class="cc-page cc-page-left"></div>
            <div class="cc-page cc-page-right"></div>
          </div>
        `;
        spread = this._dndContainer.querySelector(".cc-pockets-spread");
      }

      const activeIndex = this._classWindow ? this._classWindow.index() : 0;
      const isStructureChange = !spread.querySelector(".cc-page-left") || !spread.querySelector(".cc-page-right");

      if (isStructureChange) {
        spread.innerHTML = `
          ${leftHtml}
          ${rightHtml}
          ${overlayHtml}
        `;
      } else {
        // Optimized partial update!
        const leftPage = spread.querySelector(".cc-page-left");
        const rightPage = spread.querySelector(".cc-page-right");

        if (rightPage && rightHtml) {
          const rightInnerHtml = rightHtml.replace(/^\s*<div[^>]*>/, '').replace(/<\/div>\s*$/, '');
          rightPage.innerHTML = rightInnerHtml;
        }

        if (leftPage) {
          const cards = leftPage.querySelectorAll(".cc-wanted-card");
          cards.forEach((card, idx) => {
            if (idx === activeIndex) {
              card.classList.add("selected");
            } else {
              card.classList.remove("selected");
            }
          });
        }
      }

      // Record states for the next check
      this._lastIndex = activeIndex;
      this._lastShowSub = showSub;

      this._scrollToSelectedCard();
    }

    // The roster is longer than the page: keep the row the cursor is standing
    // on inside the scroll box. The section heads are not cards, so the card
    // list still indexes as the flat class list does.
    _scrollToSelectedCard() {
      if (!this._dndContainer || !this._classWindow) return;
      const board = this._dndContainer.querySelector(".cc-page-left .cc-presets-board");
      if (!board) return;
      const card = board.querySelectorAll(".cc-class-card")[this._classWindow.index()];
      if (!card) return;
      const boardRect = board.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (cardRect.bottom > boardRect.bottom) {
        board.scrollTop += cardRect.bottom - boardRect.bottom + 4;
      } else if (cardRect.top < boardRect.top) {
        board.scrollTop -= boardRect.top - cardRect.top + 4;
      }
    }

    onClassCardClick(index) {
      if (this._classWindow) {
        if (this._classWindow.index() === index) {
          this._classWindow.processOk();
        } else {
          this._classWindow.select(index);
          this.refreshUIOverlayDOM();
        }
      }
    }

    // The focus ring hands the list back when it walks off its own top or left
    // edge; the list redraws so its cursor is visible again.
    onNavLeave() {
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // Step off the list and onto the facing page's controls, if the press was
    // a direction and there is anything over there to land on.
    _ccEnterNav(dir) {
      if (!window.CCNav) return false;
      const pressed = ["up", "down", "left", "right"].some(
        (d) => Input.isTriggered(d) || Input.isRepeated(d));
      if (!pressed) return false;
      return window.CCNav.tryEnterFromBoard(dir);
    }

    updateUIInput() {
      // The ring owns the page's own controls whenever it is up, and is read
      // first so one press never moves two cursors.
      if (window.CCNav && window.CCNav.update()) return;
      if (this._classWindow) {
        const windowObj = this._classWindow;
        if (!windowObj || !windowObj.active) return;

        const maxItems = windowObj.maxItems();
        if (maxItems <= 0) return;

        let moved = false;
        let index = windowObj.index();

        if (Input.isTriggered('down') || Input.isRepeated('down')) {
          if (index + 2 < maxItems) {
            index += 2;
          } else {
            index = index % 2;
          }
          moved = true;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
          if (index - 2 >= 0) {
            index -= 2;
          } else {
            let target = Math.floor((maxItems - 1) / 2) * 2 + (index % 2);
            if (target >= maxItems) target -= 2;
            index = target >= 0 ? target : 0;
          }
          moved = true;
        } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
          if (index % 2 === 0 && index + 1 < maxItems) {
            index += 1;
            moved = true;
          } else if (this._ccEnterNav("right")) {
            // The right edge of the list is the doorway onto the dossier
            // facing it and the buttons underneath it.
            return;
          }
        } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
          if (index % 2 === 1 && index - 1 >= 0) {
            index -= 1;
            moved = true;
          }
        } else if (Input.isTriggered('ok')) {
          windowObj.processOk();
          return;
        } else if (Input.isTriggered('cancel')) {
          SoundManager.playCancel();
          this.onClassCancel();
          return;
        }

        if (moved) {
          SoundManager.playCursor();
          windowObj.select(index);
          this.refreshUIOverlayDOM();
        }
      }
    }

    update() {
      super.update();

      if (this._dndContainer && this._dndContainer.style.display !== "none") {
        const currentIndex = this._classWindow ? this._classWindow.index() : 0;
        const showSub = !!(this._levelUpListWindow || this._skillCategoriesWindow || this._statsWindow);

        if (this._lastIndex !== currentIndex ||
          this._lastShowSub !== showSub) {
          this.refreshUIOverlayDOM();
        }

        this.updateUIInput();
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);
        // The page rebuilds its markup underneath the ring, so the ring is
        // stamped back on afterwards rather than before.
        if (window.CCNav) window.CCNav.paint();
      }
    }

    createTitleWindow() {
      const rect = this.titleWindowRect();
      this._titleWindow = new Window_ClassSelectionTitle(rect);
      this._titleWindow.visible = false;
      this._titleWindow.opacity = 0;
      this.addWindow(this._titleWindow);
    }

    createClassWindow() {
      const rect = this.classWindowRect();
      this._classWindow = new Window_ClassSelection(rect);
      this._classWindow.setHandler("ok", this.onClassSelect.bind(this));
      this._classWindow.setHandler("cancel", this.onClassCancel.bind(this));
      this._classWindow.setHandler(
        "select",
        this.onClassSelectionChange.bind(this)
      );
      this._classWindow.visible = false;
      this._classWindow.opacity = 0;
      this.addWindow(this._classWindow);
    }

    createDetailsWindow() {
      const rect = this.detailsWindowRect();
      this._detailsWindow = new Window_ClassDetails(rect);
      this._detailsWindow.visible = false;
      this._detailsWindow.opacity = 0;
      this.addWindow(this._detailsWindow);

      if (this._classWindow.currentClass()) {
        this._detailsWindow.setClass(this._classWindow.currentClass());
      }
    }

    titleWindowRect() {
      const padding = 24;
      const width = Graphics.boxWidth - padding * 2;
      const height = this.calcWindowHeight(1, false);
      return new Rectangle(padding, padding, width, height);
    }

    classWindowRect() {
      const titleHeight = this.titleWindowRect().height;
      const padding = 24;
      const width = Math.floor((Graphics.boxWidth - padding * 2) / 2);
      const top = padding + titleHeight + 8;
      const height = Graphics.boxHeight - top - padding;
      return new Rectangle(padding, top, width, height);
    }

    detailsWindowRect() {
      const titleHeight = this.titleWindowRect().height;
      const padding = 24;
      const classWidth = this.classWindowRect().width;
      const width = Math.floor((Graphics.boxWidth - padding * 2) / 2);
      const top = padding + titleHeight + 8;
      const height = Graphics.boxHeight - top - padding;
      const x = padding + classWidth + 8;
      return new Rectangle(x, top, width, height);
    }

    onClassSelectionChange() {
      if (this._classWindow.currentClass()) {
        this._detailsWindow.setClass(this._classWindow.currentClass());
      }
    }

    // A caller that PUSHED this selector over a scene of its own (the Detailed
    // creation editor) is returned to by popping, so it comes back with its own
    // state instead of the wizard restarting underneath it. Answers true when
    // it has taken the exit.
    _returnToPushingCaller() {
      if (!window.$ccClassReturnByPop) return false;
      window.$ccClassReturnByPop = false;
      window.$ccArchetypeClassFilter = null;
      window.$ccCreatureClassFlow = null;
      SceneManager.pop();
      return true;
    }

    onClassCancel() {
      if (this._returnToPushingCaller()) return;
      // Creature flow: the roster on screen was derived from the creature's
      // archetypes, so Back returns to the creature builder (where those
      // archetypes can be changed) rather than to the wizard's class step,
      // which creatures never see.
      const creatureFlow = window.$ccCreatureClassFlow;
      if (creatureFlow && window.Scene_CreateCreature && window.Scene_CharacterCreation) {
        window.$ccCreatureClassFlow = null;
        window.$ccArchetypeClassFilter = null;
        const wizard = window.Scene_CharacterCreation;
        wizard._isCreatureMode = true;
        // Restore the paused-wizard state the builder was originally opened
        // with: the resume point it aborts to, and its stack entry.
        wizard._interruptedStep =
          (window.CCSteps && window.CCSteps.CLASS) != null ? window.CCSteps.CLASS : 5;
        if (SceneManager._stack) SceneManager._stack.push(wizard);
        if (window.Scene_CreateCreature.setTargetActorId) {
          window.Scene_CreateCreature.setTargetActorId(creatureFlow.actorId);
        }
        SceneManager.goto(window.Scene_CreateCreature);
        return;
      }
      // Return to the class selection step in character creation
      if (window.Scene_CharacterCreation) {
        window.Scene_CharacterCreation._isCreatureMode = false;
        window.Scene_CharacterCreation.prepare(
          (window.CCSteps && window.CCSteps.CLASS) != null ? window.CCSteps.CLASS : 5
        );
        SceneManager.goto(window.Scene_CharacterCreation);
      } else {
        this.popScene();
      }
    }

    onClassSelect() {
      const classId = this._classWindow.itemAt(this._classWindow.index());
      const className = $dataClasses[classId].name;

      // Get the current actor being created
      const Scene_CharacterCreation = window.Scene_CharacterCreation;
      const currentActor = Scene_CharacterCreation ? Scene_CharacterCreation.getCurrentActor() : null;
      const currentActorId = Scene_CharacterCreation ? Scene_CharacterCreation.getCurrentActorId() : null;

      // Set the class for the current actor
      if (currentActor) {
        currentActor.changeClass(classId, true);
        if (typeof giveClassStartingItems === "function") {
          giveClassStartingItems(currentActor, classId);
        }
      }

      // Creature flow: a classed creature keeps the base skills its body parts
      // grant on top of whatever the class brings, so re-teach them after the
      // class change.
      const creatureFlow = window.$ccCreatureClassFlow;
      if (creatureFlow) {
        window.$ccCreatureClassFlow = null;
        window.$ccArchetypeClassFilter = null;
        const creature = currentActor || $gameActors.actor(creatureFlow.actorId);
        if (creature && window.HealthCore && window.HealthCore.ensureBodyPartSkills) {
          window.HealthCore.ensureBodyPartSkills(creature);
        }
      }

      // Global requirement: Add item 591 to all new characters (only once for party member 1)
      const currentMemberIndex = Scene_CharacterCreation ? Scene_CharacterCreation._currentPartyMemberIndex : 0;
      if (currentMemberIndex === 0 && $dataItems[714]) {
        $gameParty.gainItem($dataItems[714], 1);
      }

      // Add global starter skills to current actor
      if (currentActor && GLOBAL_STARTER_SKILLS) {
        GLOBAL_STARTER_SKILLS.forEach((skillId) => {
          if ($dataSkills[skillId]) {
            currentActor.learnSkill(skillId);
          }
        });

        // Equip the class's fixed starting weapon(s) and armor
        if (equipRandomCompatibleWeapon) {
          equipRandomCompatibleWeapon(currentActor, classId);
        }
        if (equipClassStartingArmor) {
          equipClassStartingArmor(currentActor, classId);
        }
      }

      // Starting money is NOT granted here: CharacterCreation.giveStartingMoney
      // hands out the party's 100€ base purse plus every member's class/trait
      // money at the end of creation, so it covers the quick-mode, random and
      // creature class paths too and cannot be wiped by the preset step.

      // Store class name in variable (only for party member 1)
      if (currentMemberIndex === 0) {
        const variableId = Number(parameters["classNameVariable"] || 0);
        if (variableId > 0) {
          $gameVariables.setValue(variableId, className);
        }
      }

      if (markFirstCreationComplete) {
        markFirstCreationComplete();
      }

      // Detailed creation editor: it owns the rest of the character sheet, so
      // the class change lands back in its panel rather than in the wizard.
      if (this._returnToPushingCaller()) return;

      // Resume character creation at the Traits step after confirming class selection
      if (Scene_CharacterCreation) {
        Scene_CharacterCreation.prepare(
          (window.CCSteps && window.CCSteps.TRAITS) != null ? window.CCSteps.TRAITS : 6
        );
        SceneManager.goto(Scene_CharacterCreation);
      } else {
        this.popScene();
      }
    }

    onSubWindowCancel() {
      if (this._levelUpListWindow) {
        this._levelUpListWindow.close();
        this._levelUpListWindow = null;
      }
      if (this._skillCategoriesWindow) {
        this._skillCategoriesWindow.close();
        this._skillCategoriesWindow = null;
      }
      if (this._statsWindow) {
        this._statsWindow.close();
        this._statsWindow = null;
      }
    }

    statsWindowRect() {
      const width = 600;
      const height = this.calcWindowHeight(18, false);
      const x = (Graphics.boxWidth - width) / 2;
      const y = (Graphics.boxHeight - height) / 2;
      return new Rectangle(x, y, width, height);
    }

    levelUpListWindowRect() {
      const width = 600;
      const height = this.calcWindowHeight(15, true);
      const x = (Graphics.boxWidth - width) / 2;
      const y = (Graphics.boxHeight - height) / 2;
      return new Rectangle(x, y, width, height);
    }

    skillCategoriesWindowRect() {
      const width = 600;
      const height = this.calcWindowHeight(10, false);
      const x = (Graphics.boxWidth - width) / 2;
      const y = (Graphics.boxHeight - height) / 2;
      return new Rectangle(x, y, width, height);
    }
  }

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "openClassSelection", () => {
    window.$ccArchetypeClassFilter = null;
    window.$ccCreatureClassFlow = null;
    SceneManager.push(Scene_ClassSelection);
  });

  //=============================================================================
  // Exports to Global Namespace
  //=============================================================================

  window.ClassSelection = {
    Scene_ClassSelection
  };

  // Backward compatibility
  window.Scene_ClassSelection = Scene_ClassSelection;

  console.log(`${pluginName} loaded successfully.`);
})();
