/*:
 * @target MZ
 * @plugindesc The wizard pages that pick a class, an anatomy, an origin or a personality
 * @author Omni-Lex
 * @orderAfter CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js. Four pages of the spread share one
 * shape - a board of cards on the left, the card under the cursor written
 * out in full on the right - and they are the four kept here:
 *
 *   - Class: every vocation, its element, its magic system and its skills,
 *   - Anatomy: the archetype a creature is built from, and its second one,
 *   - Origin: where the party begins, and everything that comes with it,
 *   - Personality: the disposition a character is played with.
 *
 * The trait, specialization, bio and companion pages have the same shape and
 * live in CharacterCreationSteps.js; the two files are siblings, split by
 * subject rather than by page.
 *
 * Every method here was a method of Scene_CharacterCreation and still is:
 * the class body below is copied onto its prototype at load.
 */

(() => {
  "use strict";

  const Scene_CharacterCreation = window.Scene_CharacterCreation;
  if (!Scene_CharacterCreation) return;

  const {
    ccT,
    STEP,
    creatureArchetypeKeys,
    archetypeDisplayName,
    actorArchetypeKeys,
    actorArchetypeKey,
    actorSecondaryArchetypeKey,
    applyArchetypeToActor,
    applySecondaryArchetypeToActor,
    personalityCatalog,
  } = window.CCKit;

  // The origin page reads back exactly what the origin it is describing will
  // hand over, so it asks the plugin that owns the loadouts rather than
  // repeating them.
  const {
    CRAFTING_SPEC_IDS,
    loadoutEntryData,
    ARCANIST_SKILLS_PER_MEMBER,
    LOST_CONVOKER_SKILLS_PER_MEMBER,
    originRoll,
    hypernetPartCount,
    plagueVialCount,
    resolveOriginLoadout,
    plannedStartingEuros,
    AUGMENTED_ORIGIN_MIN,
    AUGMENTED_ORIGIN_MAX,
    CARD_ORIGIN_CARDS,
    bunkerGoldPiles,
  } = window.CCOrigins || {};

  // Written as a class body so the methods move onto the wizard exactly as
  // they were declared while they still lived inside it, accessors and all.
  class CCPickerPages {
    _choiceStepFullHtml(stepData, activeIndex) {
      const choices = (stepData && stepData.choices) || [];
      const choice = choices[activeIndex] || {};

      const optionCards = choices.map((ch, index) => {
        const isSelected = index === activeIndex;
        // A choice that names a walking sheet shows it: the vehicle board is
        // read by shape before it is read by name.
        const spriteHtml = ch.sprite
          ? `<div class="cc-option-sprite" style="${this.getSpriteStyle(ch.sprite, 0)}"></div>`
          : "";
        return `
          <div class="cc-card-option ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onOptionCardClick(${index})">
            ${spriteHtml}
            <div class="cc-option-title cc-option-title--wide">${ch.name || ""}</div>
          </div>
        `;
      }).join("");

      const description = this.cleanText(choice.description || "");

      return `
        <div class="cc-page cc-page-full cc-col cc-page-roomy">
          <div class="cc-class-header cc-col cc-col-gap-2 cc-header-block">
            <h2 class="cc-header-gothic cc-title-display">${choice.name || (stepData && stepData.title) || ""}</h2>
            ${description ? `<p class="cc-lede">${description}</p>` : ''}
          </div>
          <div class="cc-select-grid cc-compact cc-two-col cc-scroll-pane cc-grid-start">
            ${optionCards}
          </div>
        </div>
      `;
    }

    // ── Class board ──────────────────────────────────────────────────────────
    // The class step is a spread, not a wall of buttons: the roster is on the
    // left, narrowed by a search strip, and everything the choice actually
    // decides (growth, proficiencies, the skills it opens with and the ones it
    // grows into, the kit it starts with) is on the right.

    // The class behind one choice card, or null for the board's own commands
    // (Random, Browse the full roster).
    _classOfChoice(choice) {
      if (!choice) return null;
      const symbol = choice.symbol || "";
      if (symbol.indexOf("quick_class_") !== 0 && symbol !== "mana_cyborg") return null;
      const id = symbol === "mana_cyborg" ? 66 : choice.value;
      return $dataClasses[id] || null;
    }

    // The class's own line, in the active language, or its signature passive
    // when it has one: the note field carries both languages at once.
    _classNote(c, fallback) {
      let note = (c && c.note) || fallback || "";
      if (ConfigManager.language === "it") {
        const match = note.match(/<it:\s*([\s\S]*?)>/);
        note = match ? match[1].trim() : note.replace(/<[^>]+>/g, "").trim();
      } else {
        const match = note.match(/<en:\s*([\s\S]*?)>/);
        note = match ? match[1].trim() : note.replace(/<(it|en):\s*[\s\S]*?>/g, "").trim();
      }
      if (c && window.BattleSystemPassiveSkills) {
        const passiveDesc = window.BattleSystemPassiveSkills.getPassiveDescription(c.id);
        if (passiveDesc) note = passiveDesc;
      }
      return note;
    }

    _classElementId(c) {
      const match = ((c && c.note) || "").match(/<elem:\s*(\d+)>/);
      return match ? parseInt(match[1], 10) : 0;
    }

    _classElementName(elementId) {
      if (!elementId || !$dataSystem.elements[elementId]) return "";
      const key = 'ClassSelect.element.' + elementId;
      return T.has(key) ? T(key) : $dataSystem.elements[elementId];
    }

    _classPickerLeftHtml(stepData, activeIndex) {
      const choices = (stepData && stepData.choices) || [];
      const query = (Scene_CharacterCreation._classSearchQuery || "").toLowerCase().trim();
      const actor = Scene_CharacterCreation.getCurrentActor();
      const currentClassId = actor ? actor._classId : 0;

      const visible = choices.map((ch, index) => ({ ch, index })).filter(({ ch }) => {
        const c = this._classOfChoice(ch);
        if (!c) return !query;   // commands only show on the unfiltered board
        if (!query) return true;
        return (ch.name || "").toLowerCase().indexOf(query) >= 0;
      });

      // A card carries the name and nothing else: the numbers behind it are the
      // dossier's job, and reading a name is what the board is for.
      // A grouped roster (the creature board: monstrous kinds, then people)
      // heads each run of cards where it starts, so the two are told apart
      // without reading the names.
      let lastGroup = null;
      const cardsHtml = visible.map(({ ch, index }) => {
        const c = this._classOfChoice(ch);
        const isSelected = index === activeIndex;
        const isCurrent = c && c.id === currentClassId;
        let head = "";
        if (ch.group && ch.group !== lastGroup) {
          lastGroup = ch.group;
          head = `<div class="cc-class-group-head">${ch.groupTitle || ""}</div>`;
        }
        return `
          ${head}
          <div class="cc-card-option cc-class-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}"
               onclick="SceneManager._scene.onOptionCardClick(${index})">
            <div class="cc-option-title">${ch.name || ""}</div>
          </div>
        `;
      }).join("");

      const emptyHtml = `<div class="cc-class-empty">${ccT('CharCreate.noClassMatches', 'No class matches that search.')}</div>`;

      return `
        <div class="cc-page cc-page-left cc-class-board cc-col">
          <input type="text" class="cc-bio-select cc-class-search" value="${query.replace(/"/g, '&quot;')}"
                 placeholder="${ccT('CharCreate.search', 'Search...')}"
                 oninput="SceneManager._scene.onClassSearch(this.value)" />
          <div class="cc-select-grid cc-compact cc-two-col cc-class-grid">
            ${cardsHtml || emptyHtml}
          </div>
        </div>
      `;
    }

    // The icon each element wears, shared with the status screen's element row.
    _classElementIcon(elementId) {
      const ELEMENT_ICONS = [0, 96, 64, 65, 66, 67, 68, 69, 70, 71];
      return ELEMENT_ICONS[elementId] || 0;
    }

    // The magical system the class casts through (<MagicalSystem:> on the
    // class note), in the active language.
    _classMagicSystem(c) {
      const match = ((c && c.note) || "").match(/<MagicalSystem:\s*([^>]+)>/i);
      if (!match) return "";
      const key = match[1].trim();
      const label = T('SkillsMenu.magicSystem.' + key);
      return label && label !== 'SkillsMenu.magicSystem.' + key ? label : key;
    }

    _classPickerRightHtml(stepData, activeIndex) {
      const choices = (stepData && stepData.choices) || [];
      const choice = choices[activeIndex] || {};
      const c = this._classOfChoice(choice);

      // Random / browse commands have no dossier to show, only their own line.
      if (!c) {
        return `
          <div class="cc-page cc-page-right cc-class-detail cc-col cc-col-centered">
            <h2 class="cc-header-gothic cc-text-centered">${choice.name || ""}</h2>
            <p class="cc-class-quote">${this.cleanText(choice.description || "")}</p>
          </div>
        `;
      }

      const actor = Scene_CharacterCreation.getCurrentActor();
      const isCurrent = !!(actor && actor._classId === c.id);
      const note = this._classNote(c, choice.description);

      // What the class IS, rather than what its numbers are: the element it
      // fights with, the magical system it casts through and the passive it
      // carries into every battle. The stat table the page used to open with
      // said less than any of the three.
      const elementId = this._classElementId(c);
      // Physical is what a class with no element of its own reads as, so it is
      // left unsaid: the row would be noise on most of the roster.
      const showElement = elementId > 1;
      const elementName = showElement ? this._classElementName(elementId) : "";
      const magicSystem = this._classMagicSystem(c);
      const passives = window.BattleSystemPassiveSkills;
      const passiveName = passives && passives.getPassiveName ? passives.getPassiveName(c.id) : "";
      const passiveDesc = passives && passives.getPassiveEffect ? passives.getPassiveEffect(c.id) : "";

      const metaRow = (label, value) => value
        ? `<div class="cc-dossier-row"><span class="cc-dossier-label">${label}</span><span class="cc-dossier-value">${value}</span></div>`
        : "";
      const elementValue = elementName
        ? `${this._ccIconHtml(this._classElementIcon(elementId), 18)} <span>${elementName}</span>`
        : "";
      // The element now has its own badge under the class name, so the
      // profile card only needs the magic system it casts through.
      const metaRows = [
        metaRow(T('ClassSelect.magicSystemHeading'), magicSystem),
      ].join("");

      const passiveHtml = passiveName ? `
        <div class="cc-class-passive">
          <div class="cc-class-passive-name">${this._ccIconHtml(87, 18)} <span>${passiveName}</span></div>
          ${passiveDesc ? `<p class="cc-class-passive-desc">${passiveDesc}</p>` : ''}
        </div>
      ` : "";
      // The other half of what a class IS: the one act it can pull off the
      // floor, once a day (window.LimitBreak, BattleSystemActiveSkills). The
      // ability says what the class always does; this says what it does when
      // it has nothing left.
      const limit = window.LimitBreak && window.LimitBreak.cardForClass
        ? window.LimitBreak.cardForClass(c.id) : null;
      const limitHtml = limit && limit.name ? `
        <div class="cc-class-passive">
          <div class="cc-class-passive-name">${this._ccIconHtml(76, 18)} <span>${limit.name}</span>
            <span class="cc-class-passive-tag">${T('CharCreate.limitBreak')}</span></div>
          ${limit.desc ? `<p class="cc-class-passive-desc">${limit.desc}</p>` : ''}
        </div>
      ` : "";

      // Weapon proficiencies read as a list of arms, one per line with its own
      // icon, exactly like the skills below them: a row of word chips made the
      // reader parse a paragraph to learn what the class can hold.
      const hasEquipTrait = (code, dataId) =>
        (c.traits || []).some((t) => t.code === code && t.dataId === dataId && t.value === 1);
      const weaponNames = {
        1: T('CharCreate.light'), 2: T('CharCreate.sword'), 3: T('CharCreate.heavy'),
        4: T('CharCreate.axe'), 5: T('CharCreate.whip'), 6: T('CharCreate.staff'),
        7: T('CharCreate.bow'), 8: T('CharCreate.projectile'), 9: T('CharCreate.gun'),
        10: T('CharCreate.claw'), 11: T('CharCreate.glove'), 12: T('CharCreate.spear')
      };
      const weaponIcons = (window.StartingEquipment && window.StartingEquipment.weaponTypeIcons) || {};
      const weaponRows = [];
      for (let wId = 1; wId <= 12; wId++) {
        if (hasEquipTrait(51, wId)) {
          weaponRows.push(this._ccLoadoutRowHtml(weaponIcons[wId] || 96, weaponNames[wId] || "", ""));
        }
      }

      // Element rates that are not 100%: the class's own resistances and holes.
      const affinityBadges = (c.traits || [])
        .filter((t) => t.code === 11 && t.value !== 1 && $dataSystem.elements[t.dataId])
        .map((t) => {
          const pct = Math.round(t.value * 100);
          const resistant = t.value < 1;
          return `<span class="cc-element-badge ${resistant ? 'good' : 'bad'}">${this._classElementName(t.dataId)} ${pct}%</span>`;
        });

      // Split at the class cap's midpoint, not just alternated into a CSS
      // grid: a reader scanning for "what do I get at level 70" should find
      // the whole back half of the plan in one column, not zigzagging
      // between two lists that interleave low and high levels.
      const sortedLearnings = (c.learnings || [])
        .filter((l) => l.level > 1)
        .sort((a, b) => a.level - b.level);
      const roadmapRowHtml = (l) => {
        const sk = $dataSkills[l.skillId];
        if (!sk) return "";
        return this._ccLoadoutRowHtml(sk.iconIndex || 79, window.CCDbName(sk),
          `${ccT('CharCreate.abbrev.level', 'Lv')} ${l.level}`,
          { valueColor: 'var(--text-primary-hover)', hover: this._ccHoverAttrs("skill", sk.id) });
      };
      const roadmapLow = sortedLearnings.filter((l) => l.level <= 50).map(roadmapRowHtml).join("");
      const roadmapHigh = sortedLearnings.filter((l) => l.level > 50).map(roadmapRowHtml).join("");
      const roadmapRows = (roadmapLow || roadmapHigh)
        ? `<div class="cc-loadout-two-col">
            <div class="cc-loadout-col">${roadmapLow}</div>
            <div class="cc-loadout-col">${roadmapHigh}</div>
          </div>`
        : "";

      const card = (title, body) => body
        ? `<div class="cc-dossier-card cc-class-section"><h3 class="cc-subheader">${title}</h3>${body}</div>`
        : "";
      const badgeRow = (badges) => badges.length
        ? `<div class="cc-badge-wrap">${badges.join("")}</div>` : "";

      return `
        <div class="cc-page cc-page-right cc-class-detail cc-col">
          <div class="cc-class-detail-head">
            <h2 class="cc-header-gothic cc-flush">${window.CCDbName(c)}</h2>
            ${showElement ? `<div class="cc-badge-wrap cc-row-centered">
              <span class="cc-element-badge${isCurrent ? ' good' : ''}">${elementValue}</span>
            </div>` : ''}
            ${note ? `<p class="cc-class-quote">"${note}"</p>` : ''}
          </div>

          <div class="cc-class-detail-body">
            ${card(ccT('CharCreate.classAbilities', 'Class Abilities'), metaRows + passiveHtml + limitHtml)}
            ${this._ccLoadoutSectionHtml(
              T('CharCreate.startingWeaponProficiencies'),
              weaponRows.join(""),
              T('CharCreate.none'),
              true,
              'cc-loadout-grid-cols'
            )}
            ${card(ccT('CharCreate.elementalAffinities', 'Elemental Affinities'), badgeRow(affinityBadges))}
            ${Scene_CharacterCreation.isQuickMode() ? "" : this._ccLoadoutSectionHtml(T('CharCreate.skillRoadmap'), roadmapRows, "", true)}
          </div>
        </div>
      `;
    }

    onClassSearch(query) {
      Scene_CharacterCreation._classSearchQuery = query || "";
      // Only the roster is redrawn: rebuilding the spread would take the search
      // field, and the caret in it, away between one keystroke and the next.
      const container = this._dndContainer;
      const leftPage = container && container.querySelector(".cc-page-left");
      if (!leftPage) { this._lastStep = -1; this.refreshUIOverlayDOM(); return; }
      const activeIndex = this._gridWindow ? this._gridWindow.index() : 0;
      const fresh = this._ccSwapPage(leftPage, this._classPickerLeftHtml(this.currentStepData(), activeIndex));
      const input = fresh && fresh.querySelector(".cc-class-search");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }

    // The class dossier follows the PICK, never the pointer: the right page
    // used to be rewritten by every card the mouse crossed on its way to the
    // one being aimed at, so the sheet being read kept vanishing.

    // ── Archetype step (creatures) ──────────────────────────────────────────
    // A creature's identity step asks WHAT IT IS, not what gender it presents
    // as, so where a person sees the gender board a creature sees the archetype
    // roster. The tab has always been called "Archetype"; until now it opened
    // the gender board anyway, which is why picking an archetype from it was
    // impossible. (A creature's gender still lives on the Bio tab, with the
    // rest of its registry details.)
    // Each card carries what the choice is worth: the archetype's name, how
    // many parts the body would have, and which half of a spliced body it is
    // already filling. A click picks the primary, the corner button picks the
    // second half, so both halves are settled on the one board.
    _archetypeStepLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-left"></div>`;
      const primary = actorArchetypeKey(actor);
      const secondary = actorSecondaryArchetypeKey(actor);
      const table = (window.Health && window.Health.Archetypes) || {};

      const cards = creatureArchetypeKeys().map((key) => {
        const isPrimary = key === primary;
        const isSecondary = key === secondary;
        const entry = table[key] || null;
        const partCount = entry && entry.parts ? Object.keys(entry.parts).length : 0;
        const role = isPrimary
          ? `<span class="cc-role-badge primary">${ccT('CharCreate.primary', 'Primary')}</span>`
          : (isSecondary ? `<span class="cc-role-badge secondary">${ccT('CharCreate.secondary', 'Secondary')}</span>` : "");
        // Nothing is its own other half, so the pick-as-second button is left
        // off the card that already holds the primary.
        const secondBtn = isPrimary ? "" : `
          <button class="cc-archetype-second-btn" title="${ccT('CharCreate.secondaryArchetype', 'Secondary Archetype')}"
                  onclick="event.stopPropagation(); SceneManager._scene.onSelectArchetypeSecondCard('${key}')">${isSecondary ? '-' : '+'}</button>
        `;
        return `
          <div class="cc-card-option cc-archetype-card ${isPrimary ? 'selected' : ''} ${isSecondary ? 'is-secondary' : ''}" onclick="SceneManager._scene.onSelectArchetypeCard('${key}')">
            <div class="cc-option-title cc-option-title--tight">${archetypeDisplayName(key)}</div>
            <div class="cc-archetype-card-meta">${partCount} ${ccT('CharCreate.bodyParts', 'Body parts')}</div>
            ${role}
            ${secondBtn}
          </div>
        `;
      }).join("");

      return `
        <div class="cc-page cc-page-left cc-col">
          <h3 class="cc-subheader cc-subheader--flush">${ccT('CharCreate.chooseAnArchetype', 'Choose an archetype')}</h3>
          <p class="cc-text-desc cc-text-desc--intro">
            ${ccT('CharCreate.archetypeBoardHint', 'Pick one archetype for a baseline body, or add a second to splice a hybrid.')}
          </p>
          <div class="cc-select-grid cc-compact cc-three-col cc-archetype-grid cc-scroll-pane cc-grid-start">
            ${cards}
          </div>
        </div>
      `;
    }

    // The body the pick builds, part by part, the way the creature builder has
    // always printed it: every part with the share of HP it carries and, on a
    // spliced body, which archetype it came from.
    _archetypeAnatomyRowsHtml(keys) {
      const HC = window.HealthCore;
      const table = (window.Health && window.Health.Archetypes) || {};
      let parts;
      if (HC && HC.mergeArchetypeParts) {
        parts = HC.mergeArchetypeParts(keys);
      } else {
        parts = {};
        (keys || []).forEach((key, index) => {
          const entry = table[key];
          for (const partKey in (entry && entry.parts) || {}) {
            if (!parts[partKey]) parts[partKey] = Object.assign({}, entry.parts[partKey], { fromArchetype: index });
          }
        });
      }
      const partKeys = Object.keys(parts || {});
      if (!partKeys.length) {
        return `<p class="cc-text-desc cc-text-desc--body">${ccT('CharCreate.noAnatomicalOrgansDefined', 'No anatomical organs defined')}</p>`;
      }
      const spliced = (keys || []).length > 1;
      return partKeys.map((partKey) => {
        const part = parts[partKey];
        const name = (HC && HC.archetypePartName)
          ? HC.archetypePartName(part)
          : ((window.getArchetypeText ? window.getArchetypeText(part.name) : part.name) || partKey);
        const badge = !spliced ? "" : (part.fromArchetype === 1
          ? `<span class="cc-role-badge secondary">${ccT('CharCreate.secondary', 'Secondary')}</span>`
          : `<span class="cc-role-badge primary">${ccT('CharCreate.primary', 'Primary')}</span>`);
        return `
          <div class="cc-archetype-part-row cc-dossier-row cc-dossier-row--tight">
            <span class="cc-dossier-label">${name}${badge}</span>
            <span class="cc-dossier-value">${part.hpPercent}% HP${part.vital ? ` ${ccT('CharCreate.vital', 'Vital')}` : ''}</span>
          </div>
        `;
      }).join("");
    }

    _archetypeStepRightHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-right"></div>`;
      const keys = actorArchetypeKeys(actor);
      const current = keys[0] || null;
      const secondary = keys[1] || null;
      const table = (window.Health && window.Health.Archetypes) || {};
      const anatomyRows = this._archetypeAnatomyRowsHtml(keys);
      const partCount = (anatomyRows.match(/cc-archetype-part-row/g) || []).length;
      const classIds = [];
      keys.forEach((key) => {
        const entry = table[key] || null;
        ((entry && (entry.creatureClasses || entry.classes)) || []).forEach((id) => {
          if (!classIds.includes(id)) classIds.push(id);
        });
      });
      const classNames = classIds
        .map((id) => ($dataClasses[id] ? window.CCDbName($dataClasses[id]) : null))
        .filter(Boolean);
      const title = secondary
        ? `${archetypeDisplayName(current)} + ${archetypeDisplayName(secondary)}`
        : (archetypeDisplayName(current) || ccT('CharCreate.pending', 'Pending'));

      return `
        <div class="cc-page cc-page-right cc-col">
          <div class="cc-row-centered cc-title-band">
            <div class="cc-header-gothic cc-title-display cc-title-display--sm">
              ${title}
            </div>
          </div>

          <div class="cc-dossier-card cc-card-padded">
            <div class="cc-dossier-row cc-dossier-row--lead">
              <span class="cc-dossier-label">${ccT('CharCreate.bodyParts', 'Body parts')}:</span>
              <span class="cc-dossier-value">${partCount}</span>
            </div>
            <div class="cc-dossier-row cc-dossier-row--lead">
              <span class="cc-dossier-label">${ccT('CharCreate.classesOfThisArchetype', 'Classes of this archetype')}:</span>
              <span class="cc-dossier-value">${classNames.length}</span>
            </div>
          </div>

          <div class="cc-dossier-card cc-card-padded cc-scroll-pane">
            <h3 class="cc-subheader cc-subheader--flush">${ccT('CharCreate.anatomy', 'Anatomy')}</h3>
            ${anatomyRows}
            <h3 class="cc-subheader">${ccT('CharCreate.classesOfThisArchetype', 'Classes of this archetype')}</h3>
            <p class="cc-text-desc cc-text-desc--body">
              ${classNames.length ? classNames.join(", ") : ccT('CharCreate.onlyWhatYourArchetypesSupport', 'Only what your archetypes support.')}
            </p>
          </div>

          <button class="cc-sidebar-btn primary cc-btn-full cc-btn-full--tall" onclick="SceneManager._scene.onOpenCreature3DStudio()">
            ${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.custom3dModel', '3D Model')}</span>
          </button>
        </div>
      `;
    }

    // Everything that reads the chosen archetype after a pick: the sidebar and
    // the tab subtitle always, the two pages of the board only while the board
    // is the thing on screen. Repainting them unconditionally is what put the
    // archetype spread over whatever tab the sidebar's dropdown was used from.
    _repaintArchetypeStep() {
      const container = this._dndContainer;
      if (!container) { this.refreshUIOverlayDOM(); return; }
      if (this._step === STEP.GENDER && this._isCurrentMemberCreature()) {
        // The page's own wrapper is dropped, since the element being filled IS
        // that wrapper. The pattern has to allow the newline the template
        // starts with, or the whole spread ends up nested inside itself.
        const strip = (html) => html
          .replace(/^\s*<div class="cc-page[^>]*>/, "")
          .replace(/<\/div>\s*$/, "");
        const leftPage = container.querySelector(".cc-page-left");
        if (leftPage) leftPage.innerHTML = strip(this._archetypeStepLeftHtml());
        const rightPage = container.querySelector(".cc-page-right");
        if (rightPage) rightPage.innerHTML = strip(this._archetypeStepRightHtml());
      }
      // The archetype picks also live on the Bio tab now, for a person as much
      // as for a creature: repaint it too, so a primary pick that collapses the
      // secondary back to "None" (picking the half already held) shows that
      // instead of leaving a stale option selected in an unrepainted dropdown,
      // and so the weapons the new body holds are counted again.
      if (this._step === STEP.BIO) {
        const leftPage = container.querySelector(".cc-page-left");
        if (leftPage) leftPage.outerHTML = this._bioPickerLeftHtml();
      }
      const sidebar = container.querySelector(".cc-compact-sidebar");
      if (sidebar) sidebar.outerHTML = this._renderCompactSidebarHtml();
      this._refreshTopFolderTabs();
    }

    onSelectArchetypeCard(key) {
      // A dossier is what it is: the story mode's goblin gunmancer and its slime
      // mimic are the character, not a starting point to be edited away from.
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (!applyArchetypeToActor(actor, key)) {
        SoundManager.playBuzzer();
        return;
      }
      this._repaintArchetypeStep();
    }

    // The same card taken as the second archetype. Picking the one already
    // held there drops it again, so the corner button toggles.
    onSelectArchetypeSecondCard(key) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const isSecond = actorSecondaryArchetypeKey(actor) === key;
      if (!applySecondaryArchetypeToActor(actor, isSecond ? null : key)) {
        SoundManager.playBuzzer();
        return;
      }
      this._repaintArchetypeStep();
    }

    // Point the static creature flag at whoever is being built now. The flag is
    // what the linear flow reads (which steps to skip, where the gender step
    // hands over, what Back means), and it used to be written only when the
    // player toggled the humanoid/creature switch. Switching party tabs left it
    // describing the PREVIOUS member: opening a creature and then going back to
    // a person left that person unable to reach the class step, and confirming
    // their identity step handed them to the creature builder.

    _isCurrentMemberCreature() {
      return Scene_CharacterCreation.currentMemberIsCreature();
    }

    // Rewrites the top tab bar wherever it sits: the main board wraps it in a
    // slot, the settings board writes it straight into the layout.

    _isClassPickerStep() {
      return this._step === STEP.CLASS &&
        !Scene_CharacterCreation._isCreatureMode &&
        Scene_CharacterCreation.usesQuickFlow();
    }

    // True when the ORIGIN step renders the list-left / description-right spread.
    _isOriginPickerStep() {
      return this._step === STEP.ORIGIN;
    }

    // True when the PERSONALITY step renders the same spread. Guarded on the
    // catalogue as well: with no archetypes loaded the step is skipped before it
    // ever draws, and the one remaining "Random" card belongs on the ordinary
    // right page rather than alone on a two-page spread.
    _isPersonalityPickerStep() {
      return this._step === STEP.PERSONALITY && personalityCatalog().length > 0;
    }

    // One row per member naming the spells the rolled deal taught them, so a
    // party can read exactly which esoteric skills they are being handed rather
    // than a count. Empty for an origin that teaches nothing.
    _rolledSkillRows(symbol, row) {
      const roll = originRoll(symbol);
      if (!roll) return [];
      const members = $gameParty ? $gameParty.members() : [];
      const rows = [];
      roll.perMember.forEach((share, index) => {
        if (!share.skillIds || share.skillIds.length === 0) return;
        const names = share.skillIds
          .map((id) => $dataSkills[id])
          .filter(Boolean)
          .map((skill) => window.CCDbName(skill))
          .join(", ");
        const who = members[index] ? members[index].name() : String(index + 1);
        rows.push(row(who, names));
      });
      return rows;
    }

    // Builds the right page for the origin step: the highlighted origin's
    // description plus a short "what you start with" dossier.
    _originStepDetailsHtml(stepData, activeIndex) {
      const choice = (stepData.choices && stepData.choices[activeIndex]) || {};
      const row = (label, value) =>
        `<div class="cc-dossier-row"><span class="cc-dossier-label">${label}</span><span class="cc-dossier-value">${value}</span></div>`;
      // Loadout row: icon + real name on the left, quantity on the right,
      // read out of the database the entry names (items, but also the weapons
      // and the armor a rolled origin deals) so it always matches what is
      // actually granted. The name goes through CCDbName: this page is DOM, so
      // it never reaches the draw-time translator that localizes database names
      // elsewhere.
      const itemRow = (entry) => {
        const data = loadoutEntryData(entry);
        if (!data) return "";
        return `
          <div class="cc-dossier-row">
            <span class="cc-dossier-label cc-row-inline">
              <span class="cc-rpg-icon" style="${this._ccIconStyle(data.iconIndex)}"></span>${window.CCDbName(data)}
            </span>
            <span class="cc-dossier-value">x${entry.qty}</span>
          </div>
        `;
      };

      // Non-item context rows (where you land / extra effects), keyed by symbol.
      const contexts = {
        origin_train: [row(T('CharCreate.start'), T('CharCreate.trainPickADestination'))],
        origin_space: [row(T('CharCreate.start'), T('CharCreate.deepSpace'))],
        origin_camper: [row(T('CharCreate.start'), T('CharCreate.yourCamperParkedInACity'))],
        origin_car: [row(T('CharCreate.start'), T('CharCreate.yourCarParkedInACity'))],
        origin_bike: [row(T('CharCreate.start'), T('CharCreate.aRandomOverlandBiome'))],
        origin_lot: [
          row(T('CharCreate.start'), T('CharCreate.aRandomWorldMapTile')),
          row(T('CharCreate.specializations'), T('CharCreate.craftingSpecsAllMembers', { count: CRAFTING_SPEC_IDS.length })),
        ],
        origin_dungeon: [row(T('CharCreate.start'), T('CharCreate.theTowerGate'))],
        origin_mayor: [row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice'))],
        origin_criminal: [
          row(T('CharCreate.start'), T('CharCreate.yourCamperParkedInACity')),
          row(T('CharCreate.bounty'), T('CharCreate.10000OnYourHead')),
        ],
        origin_stranded: [row(T('CharCreate.start'), T('CharCreate.aRandomRemoteWorldMapSpot'))],
        origin_bunker: [
          row(T('CharCreate.start'), T('CharCreate.aLootCellarUnderARandomBiome')),
          row(T('CharCreate.hoards'), T('CharCreate.goldPilesInCellar', { count: bunkerGoldPiles() })),
          row(T('CharCreate.wayBack'), T('CharCreate.aPermanentHatchOnTheSurface')),
        ],
        origin_ceo: [
          row(T('CharCreate.start'), T('CharCreate.limecorpHeadquarters')),
          row(T('CharCreate.assets'), T('CharCreate.80OfLimecorpShares')),
        ],
        origin_artifact: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.inheritance'), T('CharCreate.1AncientArtifactDrawnAtRandom')),
        ],
        origin_crash: [row(T('CharCreate.start'), T('CharCreate.aRandomPlanetInAnUnchartedGalaxy'))],
        origin_warlord: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.troops'), T('CharCreate.40FromRandomFactions')),
          row(T('CharCreate.upkeep'), T('CharCreate.2WeeksOfTheirWagesInCash')),
        ],
        origin_faction_leader: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.troops'), T('CharCreate.40FromTheFactionYouPick')),
          row(T('CharCreate.upkeep'), T('CharCreate.2WeeksOfTheirWagesInCash')),
        ],
        origin_deserter: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.troops'), T('CharCreate.40FromTheFactionYouDeserted')),
        ],
        origin_augmented: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.augments'), T('CharCreate.augmentsPerMember', {
            min: AUGMENTED_ORIGIN_MIN, max: AUGMENTED_ORIGIN_MAX
          })),
        ],
        origin_card_collector: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.collection'), T('CharCreate.cardsInCollection', { count: CARD_ORIGIN_CARDS })),
          row(T('CharCreate.deck'), T('CharCreate.cardsSleevedDeck')),
        ],
        origin_arcanist: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.esotericSpells'), T('CharCreate.esotericSpellsPerMember', {
            count: ARCANIST_SKILLS_PER_MEMBER,
          })),
        ].concat(this._rolledSkillRows("origin_arcanist", row)),
        origin_mercenary: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.armament'), T('CharCreate.oneRangedWeaponEach')),
        ],
        origin_lost_convoker: [
          row(T('CharCreate.start'), T('CharCreate.aRandomSquareOfTheWorld')),
          row(T('CharCreate.summoningRites'), T('CharCreate.summoningRitesPerMember', {
            count: LOST_CONVOKER_SKILLS_PER_MEMBER,
          })),
        ].concat(this._rolledSkillRows("origin_lost_convoker", row)),
        origin_skeleton_key: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.supplies'), T('CharCreate.nothingButTheKey')),
        ],
        origin_plague: [
          row(T('CharCreate.start'), T('CharCreate.aCityOfYourChoice')),
          row(T('CharCreate.stock'), T('CharCreate.sealedVials', { count: plagueVialCount() })),
        ],
        origin_diplomat: [
          row(T('CharCreate.start'), T('CharCreate.theOnuAssemblyInBrussels')),
        ],
        origin_hypernet_explorer: [
          row(T('CharCreate.start'), T('CharCreate.theHypernetPoint')),
          row(T('CharCreate.components'), T('CharCreate.componentsCarried', {
            count: hypernetPartCount(),
          })),
        ],
      };

      // Cash first (an exact figure, never an adjective), then every item this
      // origin hands out, in the quantities the party will actually receive.
      const cashRow = row(
        T('CharCreate.cash'),
        T('CharCreate.cashAmount', {
          amount: plannedStartingEuros(choice.symbol).toLocaleString(
            T.language() === "it" ? "it-IT" : "en-US"),
        })
      );
      const itemsHtml = resolveOriginLoadout(choice.symbol).map(itemRow).join("");

      // Where you land and what you are carrying read differently and are laid
      // out differently. The context rows are sentences and keep the full width
      // of the page; the loadout is a list of short "icon name / xN" rows, and a
      // generous origin runs to a dozen of them, so they are set two to a line
      // rather than as one long column the page has to scroll through.
      const contextRows = (contexts[choice.symbol] || []).join("") + cashRow;
      const itemsGrid = itemsHtml
        ? `<div class="cc-dossier-grid cc-loadout-grid">${itemsHtml}</div>`
        : "";
      const dossierHtml = (contextRows || itemsGrid)
        ? `<div class="cc-dossier-card"><h3 class="cc-subheader">${T('CharCreate.startingOut')}</h3>${contextRows}${itemsGrid}</div>`
        : "";

      return `
        <div class="cc-page cc-page-right cc-col">
          <h2 class="cc-header-gothic">${choice.name || ""}</h2>
          <p class="cc-lede cc-lede--page">
            ${this.cleanText(choice.description || "")}
          </p>

          <div class="cc-scroll-pane">
            ${dossierHtml}
          </div>
          <button class="cc-sidebar-btn primary cc-btn-full cc-btn-full--tall" onclick="SceneManager._scene.onFinishPartyCreation()">
            ${this._ccIconHtml(78, 20)} <span>${T('CharCreate.embark') || "Embark & Begin Journey"}</span>
          </button>
        </div>
      `;
    }

    // Builds the right page for the personality step: what the highlighted
    // disposition is, one line it puts in the character's head, and what it does
    // to the body carrying it (PersonalityData.json `modifiers`, which the
    // biologic sim multiplies the baselines by). The Random card has no
    // archetype to read, so it shows its own description alone.
    _personalityStepDetailsHtml(stepData, activeIndex) {
      const choice = (stepData.choices && stepData.choices[activeIndex]) || {};
      const entry = choice.symbol === "personality_random"
        ? null : personalityCatalog()[choice.value];

      const row = (label, value) =>
        `<div class="cc-dossier-row"><span class="cc-dossier-label">${label}</span><span class="cc-dossier-value">${value}</span></div>`;

      // "prefrontalCortex" -> "Prefrontal Cortex", then through the translators:
      // the vitals and hormones are named in the biologic panel's own strings,
      // the brain regions in js/i18n/<lang>/brain.json (an English-source file,
      // so it is the database translator that answers for those).
      const statLabel = (key) => {
        if (T.has('Biologic.' + key)) return T('Biologic.' + key);
        const words = String(key)
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return window.CCDbName(words);
      };

      // A modifier is a multiplier on the baseline: 1.3 reads as +30%, 0.9 as
      // -10%, and the sign is what the player is actually reading for.
      const modRows = [];
      const modifiers = (entry && entry.modifiers) || {};
      Object.keys(modifiers).forEach((group) => {
        const stats = modifiers[group] || {};
        Object.keys(stats).forEach((key) => {
          const pct = Math.round((Number(stats[key]) - 1) * 100);
          if (!pct) return;
          modRows.push(row(statLabel(key), (pct > 0 ? "+" : "") + pct + "%"));
        });
      });

      // The archetype's own voice: PersonalityData.json carries its thoughts in
      // English and Italian only, so anything else reads the English bank.
      const thoughts = (entry && entry.thoughts) || null;
      const voice = thoughts
        ? (thoughts[T.language()] || thoughts.en || [])[0] || "" : "";

      const voiceHtml = voice
        ? `<div class="cc-dossier-card"><h3 class="cc-subheader">${T('CharCreate.personalityVoice')}</h3>
             <p class="cc-text-desc cc-flush cc-note-quiet">"${this.cleanText(voice)}"</p>
           </div>`
        : "";
      const modsHtml = modRows.length
        ? `<div class="cc-dossier-card"><h3 class="cc-subheader">${T('CharCreate.personalityBody')}</h3>
             <div class="cc-dossier-grid">${modRows.join("")}</div>
           </div>`
        : "";

      return `
        <div class="cc-page cc-page-right cc-col">
          <h2 class="cc-header-gothic">${choice.name || ""}</h2>
          <p class="cc-lede cc-lede--page">
            ${this.cleanText(choice.description || "")}
          </p>

          <div class="cc-scroll-pane">
            ${voiceHtml}
            ${modsHtml}
          </div>
        </div>
      `;
    }


    // Renders an IconSet glyph inline via CSS background-position (same
    // approach as TraitSelector.getIconStyle) so dossier item rows don't need
    // a canvas draw pass on every cursor move.
  }

  for (const key of Object.getOwnPropertyNames(CCPickerPages.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Scene_CharacterCreation.prototype, key,
      Object.getOwnPropertyDescriptor(CCPickerPages.prototype, key)
    );
  }
})();
