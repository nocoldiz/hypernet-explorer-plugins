/*:
 * @target MZ
 * @plugindesc Every panel the creation spread reads back: the sidebar, the personal dossier, the scenario sheet and the starting loadout
 * @author Omni-Lex
 * @orderAfter CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js. Nothing here asks a question or takes
 * a choice: this is everything the spread draws to show what the party has
 * become so far.
 *
 *   - the compact sidebar that stands beside every page,
 *   - the personal dossier: one member's whole sheet, read back,
 *   - the scenario dossier: the party as it will be handed to the world,
 *   - the loadout rows and the starting inventory an origin adds up to,
 *   - the hover plates a stat or an item raises.
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
    ccTp,
    ccStatLabels,
    resolveTraitName,
    resolveTraitDesc,
    selectedTraitObjects,
    archetypeDisplayName,
    actorArchetypeKey,
    actorSecondaryArchetypeKey,
    portraitIsModel,
    storyModeModelPath,
    CharacterCreationData,
    STEP,
  } = window.CCKit;

  // What a party is worth on the day it starts: the purse its class, traits
  // and wealth add up to, and the goods its origin hands over.
  const {
    CC_BASE_START_GOLD,
    classStartingMoney,
    traitStartingMoney,
    wealthStartingMoney,
    scenarioGoldBonus,
    giveStartingMoney,
    loadoutEntryData,
    resolveOriginLoadout,
  } = window.CCOrigins || {};
  // What ONE member brings into that purse. A beast brings nothing:
  // giveStartingMoney drops all three contributions for a creature class (see
  // CharacterCreationOrigins), so a card that added them up anyway would
  // advertise money that never arrives. The base the party opens on is not any
  // one member's and is added by the caller.
  function memberStartingGold(actor) {
    const NC = window.NPCCreature;
    if (!actor || (NC && NC.isNonSentientActor(actor))) return 0;
    return (typeof classStartingMoney === "function" ? classStartingMoney(actor._classId) : 0) +
      (typeof traitStartingMoney === "function" ? traitStartingMoney(actor) : 0) +
      (typeof wealthStartingMoney === "function" ? wealthStartingMoney(actor) : 0);
  }

  const { getClassStartingItems } = window.StartingEquipment || {};
  const { applyTraitsToActor } = window.CharacterCreationUtils || {};

  // Written as a class body so the methods move onto the wizard exactly as
  // they were declared while they still lived inside it, accessors and all.
  class CCDossierPages {
    _ccTooltipEl() {
      let tooltip = document.getElementById("cc-item-tooltip");
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "cc-item-tooltip";
        tooltip.className = "cc-item-tooltip";
        document.body.appendChild(tooltip);
      }
      return tooltip;
    }

    _ccPositionTooltip(event, tooltip) {
      window.CCPanel.show(tooltip);
      const mouseX = (event && event.clientX) || 100;
      const mouseY = (event && event.clientY) || 100;
      window.CCPanel.placeAt(tooltip,
        Math.min(window.innerWidth - 330, mouseX + 16),
        Math.min(window.innerHeight - 180, mouseY + 16));
    }

    // A stat box's own card: what the stat actually governs, read off the
    // i18n bank (CharCreate.statInfo.<key>) so it translates with the rest of
    // the sheet instead of carrying its own hardcoded prose.
    onStatHover(event, statKey) {
      const tooltip = this._ccTooltipEl();
      const SL = ccStatLabels();
      const label = SL[statKey] || statKey;
      const desc = ccT('CharCreate.statInfo.' + statKey, '');
      tooltip.innerHTML = `
        <div class="cc-item-tooltip-header">
          <span class="cc-item-tooltip-title">${label}</span>
        </div>
        ${desc ? `<div class="cc-item-tooltip-desc">${desc}</div>` : ""}
      `;
      this._ccPositionTooltip(event, tooltip);
    }

    // The tag a trait card wears: what kind of trait it is (physical, mental,
    // magical, genetic) rather than the word TRAIT, which the card already
    // says by being one. A trait with no category keeps the generic tag.
    _ccTraitCategoryLabel(trait) {
      const cat = trait && trait.category ? String(trait.category).toLowerCase() : "";
      if (cat) {
        const label = ccT('CharCreate.traitCategoryLabel.' + cat, '');
        if (label) return label;
        return cat.toUpperCase();
      }
      return ccT('CharCreate.traitTypeLabel');
    }

    // ── Item Hover Tooltip Handlers ──
    onItemHover(event, type, id, qty) {
      // A trait is not a $data* record, so it is resolved off the trait bank
      // (window.Health.Traits) the same way the trait board's own detail
      // panel resolves the one it has highlighted.
      if (type === "trait") {
        const bank = (window.Health && window.Health.Traits) || [];
        const trait = bank.find((t) => String(t.id) === String(id));
        if (!trait) return;
        const tooltip = this._ccTooltipEl();
        const name = (trait.name && resolveTraitName(trait.name, trait.id)) || trait.id;
        const desc = (trait.description && resolveTraitDesc(trait.description, trait.id)) || "";
        let traitStatsHtml = "";
        if (trait.positive) {
          traitStatsHtml += Object.entries(trait.positive)
            .map(([k, v]) => `<span class="ts-badge pos">${window.TraitParams.text(k, v)}</span>`).join(" ");
        }
        if (trait.negative) {
          traitStatsHtml += Object.entries(trait.negative)
            .map(([k, v]) => `<span class="ts-badge neg">${window.TraitParams.text(k, v)}</span>`).join(" ");
        }
        tooltip.innerHTML = `
          <div class="cc-item-tooltip-header">
            ${this._ccIconHtml(trait.icon || 87, 20)}
            <span class="cc-item-tooltip-title">${name}</span>
            <span class="cc-item-tooltip-type">${this._ccTraitCategoryLabel(trait)}</span>
          </div>
          ${desc ? `<div class="cc-item-tooltip-desc">${desc}</div>` : ""}
          ${traitStatsHtml ? `<div class="cc-item-tooltip-stats">${traitStatsHtml}</div>` : ""}
        `;
        this._ccPositionTooltip(event, tooltip);
        return;
      }

      let item = null;
      if (type === "weapon") item = $dataWeapons[id];
      else if (type === "armor") item = $dataArmors[id];
      else if (type === "skill") item = $dataSkills[id];
      else item = $dataItems[id];
      if (!item) return;

      const tooltip = this._ccTooltipEl();

      const name = window.CCDbName(item);
      // The description is translated the same way the name is: the record's
      // own line is English, and the DOM never reaches the engine's draw hooks.
      const desc = window.CCDbDesc(item) || ccT('CharCreate.standardIssueGear');
      const iconHtml = this._ccIconHtml(item.iconIndex, 20);
      // A skill card is tagged with the school it belongs to (Arcanism,
      // Swordsmanship), read off the same Categories.json the skill menus use,
      // rather than with the word SKILL.
      let typeLabel = type ? type.toUpperCase() : "ITEM";
      if (type === "skill") {
        const SM = window.SkillMaster;
        const cat = SM && SM.getSkillCategory ? SM.getSkillCategory(item.id) : "";
        const catName = cat && SM.getCategoryDisplayName ? SM.getCategoryDisplayName(cat) : "";
        if (catName) typeLabel = String(catName).toUpperCase();
      }
      // A skill has no shop price, so the card that describes one says what it
      // costs to cast instead of pretending it is for sale.
      const isSkill = type === "skill";
      const price = !isSkill && item.price ? this._formatGoldToEuros(item.price) : "";

      let statsHtml = "";
      if (isSkill) {
        if (item.mpCost > 0) {
          statsHtml += `<span class="ts-badge neg">${T('SkillMaster.mpLabel')} ${item.mpCost}</span> `;
        }
        if (item.tpCost > 0) {
          statsHtml += `<span class="ts-badge neg">${T('SkillMaster.apLabel')} ${item.tpCost}</span> `;
        }
        // What the skill is trained as, so a spell on the growth plan can be
        // read as the specialization it belongs to.
        const spec = window.SkillSpecs && window.SkillSpecs.forSkill
          ? window.SkillSpecs.forSkill(item) : null;
        const specName = spec && (window.Specializations && window.Specializations.displayName
          ? window.Specializations.displayName(spec) : spec.name);
        if (specName) statsHtml += `<span class="ts-badge pos">${specName}</span> `;
      } else if (item.params) {
        // The engine's own param names (ATK, MDF, LUK) are not what this game
        // calls its attributes: the card reads STR, WIS and PSI like the sheet
        // beside it, out of the same bank, translated with it.
        const SL = ccStatLabels();
        const paramLabels = [SL.HP, SL.MP, SL.STR, SL.CON, SL.INT, SL.WIS, SL.DEX, SL.PSI];
        item.params.forEach((v, idx) => {
          if (v !== 0) {
            statsHtml += `<span class="ts-badge ${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v} ${paramLabels[idx]}</span> `;
          }
        });
      }

      tooltip.innerHTML = `
        <div class="cc-item-tooltip-header">
          ${iconHtml}
          <span class="cc-item-tooltip-title">${name}</span>
          <span class="cc-item-tooltip-type">${typeLabel}</span>
        </div>
        <div class="cc-item-tooltip-desc">${desc}</div>
        ${statsHtml ? `<div class="cc-item-tooltip-stats">${statsHtml}</div>` : ""}
        ${price ? `<div class="cc-item-tooltip-price">${ccT('CharCreate.estimatedValue')}: ${price}</div>` : ""}
      `;

      this._ccPositionTooltip(event, tooltip);
    }

    onItemLeave() {
      const tooltip = document.getElementById("cc-item-tooltip");
      window.CCPanel.hide(tooltip);
    }

    // The name, on whatever the player is holding. A keyboard types it straight
    // into the card. A pad has no letters and no Escape to leave a caret with,
    // so a field there is a box you fall into and cannot climb out of: the card
    // reads the name out instead and the Randomize die beside it, which the
    // focus ring does reach, is how a controller settles on one. The engine's
    // own letter grid is deliberately not an answer here - the wizard never
    // opens it (test_character_creation.js 11c).
    _nameFieldHtml(actor, isLocked) {
      const shown = String(actor.name() || ccT('CharCreate.defaultName'))
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      if (window.CCNav && window.CCNav.padInHand && window.CCNav.padInHand()) {
        return `<div class="cc-bio-select cc-name-input cc-name-read ${isLocked ? 'cc-locked' : ''}"
                     title="${ccT('CharCreate.renameHint')}">${shown}</div>`;
      }
      return `<input type="text" class="cc-bio-select cc-name-input ${isLocked ? 'cc-locked' : ''}" value="${shown}" oninput="SceneManager._scene.onNameChange(this.value)" placeholder="${ccT('CharCreate.defaultName')}" ${isLocked ? 'readonly disabled' : ''} />`;
    }

    // ── Top Folder Tabs (Party Tabs Left, Step Tabs Right) ──

    _formatGoldToEuros(gold) {
      const euros = (Number(gold) || 0) / 100;
      const isIt = (typeof ConfigManager !== 'undefined' && ConfigManager.language === 'it');
      return euros.toLocaleString(isIt ? 'it-IT' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
    }

    // True when this member is a monster, whichever way it was made one: the
    // flag the creature builder writes, a monstrous class, or the per-slot
    // creature switch the character-type step sets.

    _ccLoadoutRowHtml(iconIndex, name, value, opts) {
      const o = opts || {};
      const hover = o.hover || "";
      return `
        <div class="cc-compact-loadout-item ${hover ? 'cc-row-hoverable' : ''}" ${hover}>
          <span class="cc-dossier-label cc-loadout-name-cell" style="--cc-ink:${o.nameColor || 'var(--text-card-medium)'}">
            <span class="cc-loadout-icon">${this._ccIconHtml(iconIndex, 18)}</span>
            <span class="cc-loadout-name">${name}</span>
          </span>
          ${value ? `<span class="cc-dossier-value cc-loadout-value" style="--cc-ink:${o.valueColor || 'var(--text-success-active)'}">${value}</span>` : ''}
        </div>
      `;
    }

    // The hover attributes any loadout row wears to raise the inspect card.
    // Items had one and skills did not, so the sidebar could tell you what a
    // sling does but not what a spell does.
    _ccHoverAttrs(type, id, qty) {
      return `onmouseenter="SceneManager._scene.onItemHover(event, '${type}', ${id}, ${qty == null ? 1 : qty})" onmouseleave="SceneManager._scene.onItemLeave()"`;
    }

    // The gear the Bio tab's job selector hands out (actor._grantedJobItemIds,
    // kept in sync by onBioOptionChange) so it shows up next to the class kit
    // everywhere the starting loadout is listed: the sidebar and the scenario
    // resume sheet.
    _ccPushJobItems(actor, list) {
      if (!actor || !Array.isArray(actor._grantedJobItemIds)) return;
      const counts = {};
      actor._grantedJobItemIds.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
      Object.keys(counts).forEach((idStr) => {
        const item = $dataItems[Number(idStr)];
        if (item) list.push({ name: window.CCDbName(item), iconIndex: item.iconIndex || 176, qty: counts[idStr], type: "item", id: item.id });
      });
    }

    // A loadout block: the sidebar's gold rule with its tally, then the rows.
    // `open` lets the rows run their full length instead of scrolling inside
    // the sidebar's short well, which is what a dossier page wants. `extraClass`
    // switches the rows from the default single column to another layout, e.g.
    // the class dossier's weapon proficiencies, which read better as a grid.
    // A section heading names the section and nothing else: the rows under it
    // ARE the count, so "4 skills" over four skills was the list saying its
    // own length back to the player.
    _ccLoadoutSectionHtml(title, rowsHtml, emptyText, open, extraClass) {
      return `
        <div class="cc-gap-above-hair">
          <div class="cc-loadout-section-head">
            <span class="cc-loadout-section-title">${title}</span>
          </div>
          <div class="cc-compact-loadout-grid ${open ? 'cc-loadout-open' : ''} ${extraClass || ''}">
            ${rowsHtml || `<span class="cc-loadout-empty">${emptyText || ''}</span>`}
          </div>
        </div>
      `;
    }

    // The portrait showcase card: the 2D bust or the live 3D model, whichever
    // the Bio tab's portrait choice says, for a person and a creature alike.
    // The sidebar wears it, except on the simple bio sheet, where it trades
    // places with the written history (see _bioSwapsPortraitAndHistory).
    _ccPortraitCardHtml(actor, isLocked, isCreature) {
      let profileBoxHtml = "";
      // The Romance tab shows her bust, never the model.
      const storyModel = storyModeModelPath(actor);
      const storyBust = !!storyModel && this._step === STEP.ROMANCE;
      if (storyModel && !storyBust) {
        // Story mode's Em stands in her own dossier model, which the scene
        // drops into this frame (_syncCC3DPortrait). Clicking it still opens
        // the bust gallery her portrait elsewhere is picked from.
        const emTitle = isLocked ? ccT('CharCreate.bustLockedHint') : ccT('CharCreate.bustClickHint');
        const emClick = isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenBustGallery()';
        profileBoxHtml = `
          <div class="cc-compact-portrait-card cc-col cc-col-gap-2">
            <div class="cc-compact-bust-full empty cc3d-live-portrait cc-clip" title="${emTitle}" onclick="${emClick}">
              <div class="cc3d-live-portrait-fallback cc-col cc-col-gap-2 cc-fill-center">
                ${this._ccIconHtml(224, 28)}
                <span class="cc-portrait-caption">${actor.name()}</span>
              </div>
            </div>
          </div>
        `;
      } else if (!storyBust && portraitIsModel(actor)) {
        // The archetypes the member is built from, named the way the rest of
        // the game names them. This used to list Battler3D's ~600 raw
        // lowercase structure keys ("bigcat", "chromaticmanticore"), none of
        // which the health side could resolve back to a body.
        const currentArch = actorArchetypeKey(actor) || (isCreature ? "Beast" : "Humanoid"); // i18n-ignore: Archetypes.json keys
        const secondArch = actorSecondaryArchetypeKey(actor) || "";

        // The card names the model the member already has and opens the
        // sculptor.
        const modelLabel = secondArch
          ? `${archetypeDisplayName(currentArch)} / ${archetypeDisplayName(secondArch)}`
          : archetypeDisplayName(currentArch);
        const modelTitle = isLocked ? ccT('CharCreate.bustLockedHint') : modelLabel;
        const modelClick = isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenCreature3DStudio()';

        // The primary/secondary archetype pickers live on the Bio tab now,
        // alongside the rest of who the member is. The sidebar keeps only
        // the model preview and the shortcut into the sculptor.
        profileBoxHtml = `
          <div class="cc-compact-portrait-card cc-col cc-col-gap-2">
            <div class="cc-compact-bust-full empty cc3d-live-portrait cc-clip" title="${modelTitle}" onclick="${modelClick}">
              <div class="cc3d-live-portrait-fallback cc-col cc-col-gap-2 cc-fill-center">
                ${this._ccIconHtml(224, 28)}
                <span class="cc-portrait-caption">${modelLabel}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        const bustName = this._getActorBust(actor);
        const bustUrl = this._getBustUrl(bustName);

        // The portrait is its own button now: the bust is clicked and the
        // gallery opens on it. The Appearance button underneath said the
        // same thing twice and ate a row of the sidebar.
        const bustTitle = isLocked
          ? ccT('CharCreate.bustLockedHint')
          : ccT('CharCreate.bustClickHint');
        const bustClick = isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenBustGallery()';

        profileBoxHtml = `
          <div class="cc-compact-portrait-card">
            ${bustUrl ? `
              <div class="cc-compact-bust-full ${isLocked ? 'locked' : ''}" title="${bustTitle}" onclick="${bustClick}">
                <img class="cc-compact-bust-img" src="${bustUrl}" alt=""
                     onerror="this.onerror=null; this.src='img/busts/7.png';">
              </div>
            ` : `
              <div class="cc-compact-bust-full empty ${isLocked ? 'locked' : ''}" title="${bustTitle}" onclick="${bustClick}">
                <div class="cc-col cc-col-gap-2 cc-fill-center">
                  ${this._ccIconHtml(224, 28)}
                  <span class="cc-portrait-caption cc-portrait-caption--empty">${ccT('CharCreate.noBustSelected')}</span>
                </div>
              </div>
            `}
            ${isLocked ? `
              <div class="cc-compact-portrait-controls">
                <div class="cc-portrait-footnote">
                  ${this._ccIconHtml(195, 14)} <span>${ccT('CharCreate.presetLocked')}</span>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
      return profileBoxHtml;
    }

    // The simple bio sheet reads the history in the sidebar's portrait well,
    // where it scrolls, and stands the model on the facing page instead.
    _bioSwapsPortraitAndHistory() {
      return !this._presetWindow && this._isBioPickerStep() && Scene_CharacterCreation.isSimpleMode()
        && !Scene_CharacterCreation._isPetMode && !Scene_CharacterCreation._isVehicleMode;
    }

    _renderCompactSidebarHtml() {
      // The preset board reads its own dossier down the sidebar too: browsing
      // wanted posters used to leave this panel showing the (still blank) seat
      // being filled, unrelated to whichever dossier was highlighted, so taking
      // one was a guess until it was actually applied. See
      // _renderPresetPreviewSidebarHtml.
      if (this._presetWindow) return this._renderPresetPreviewSidebarHtml();

      const actor = Scene_CharacterCreation.getCurrentActor();
      // Guarded before the actor is read, not after: with no current member the
      // three reads below threw and took the whole overlay refresh with them,
      // leaving a blank screen instead of an empty sidebar.
      if (!actor) return `<div class="cc-compact-sidebar"></div>`;

      // The companion board reads its own dossier down the sidebar, the way a
      // character does: the picked beast, its numbers and its nature, with the
      // whole board left over for the roster.
      if (Scene_CharacterCreation._isPetMode) return this._petSidebarHtml();
      // The garage reads its dossier down the sidebar the same way.
      if (Scene_CharacterCreation._isVehicleMode) return this._vehicleSidebarHtml();

      const isCreature = (Scene_CharacterCreation.isCreatureActor && Scene_CharacterCreation.isCreatureActor(actor))
        || !!(actor && (actor._isCreatureActor || (window.NPCCreature && window.NPCCreature.isNonSentientActor && window.NPCCreature.isNonSentientActor(actor))));
      const isPreset = !!this._presetWindow;
      const isPetActive = false;

      const isLocked = this._isActorLockedPreset(actor);

      const classData = $dataClasses[actor._classId];
      const className = classData ? window.CCDbName(classData) : "Class";
      // The identity card reads as an occupation, not a body: "{job} {class}",
      // e.g. "Jobless Witch". The job is the same one the Bio tab tracks
      // (actor._jobId, 0 = jobless), so both places always agree.
      const identityJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
      const identityJobId = actor._jobId != null ? actor._jobId : 0;
      const identityJob = identityJobId > 0 ? (identityJobs.find((j) => j.id === identityJobId) || null) : null;
      const jobName = identityJob
        ? (window.WorkSystem && window.WorkSystem.jobName ? window.WorkSystem.jobName(identityJob) : (identityJob.name || ccTp('CharCreate.jobNumber', { id: identityJob.id })))
        : ccT('CharCreate.bio.joblessShort');

      const startingGold = CC_BASE_START_GOLD + memberStartingGold(actor);
      const startingMoneyFormatted = this._formatGoldToEuros(startingGold);

      let avatarStyle = "";
      if (actor.characterName()) {
        avatarStyle = this.getSpriteStyle(actor.characterName(), actor.characterIndex());
      }

      // 1. Identity Card (Sprite on Left of Name opens Sprite Gallery + Randomize Button + Class/Gender)
      const identityHeaderHtml = `
        <div class="cc-compact-identity-card">
          <div class="cc-row-inline cc-row-gap-wide">
            ${!isPetActive ? `
              <div class="cc-compact-avatar-wrap" title="${isLocked ? ccT('CharCreate.spriteLockedHint') : ccT('CharCreate.spriteClickHint')}" onclick="${isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenSpriteGallery()'}">
                <div class="cc-compact-avatar" style="${avatarStyle}"></div>
              </div>
            ` : ''}
            <div class="cc-col cc-col-gap-1 cc-col-grow">
              <div class="cc-row-inline cc-row-gap-tight">
                ${this._nameFieldHtml(actor, isLocked)}
              </div>
              <div class="cc-row-inline cc-identity-line">
                <span class="cc-identity-name">${jobName} ${className}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // 2. Full-Width Portrait Showcase Card, or on the simple bio sheet the
      // written history in its place.
      const sidebarAge = (actor && Number(actor._ccAge)) || 28;
      const profileBoxHtml = this._bioSwapsPortraitAndHistory()
        ? `<div class="cc-compact-portrait-card cc-sidebar-history">${this._simpleSheetHistoryHtml(actor, sidebarAge)}</div>`
        : this._ccPortraitCardHtml(actor, isLocked, isCreature);

      // 3. Core 8-Stat Grid (Status Screen Styled with Red HP and Modifiers)
      // Traits push their positive/negative deltas into actor._paramPlus the
      // moment they are toggled (see onTraitToggle -> _ccApplyTraitIds), so
      // folding it in here is what makes a stat change show up on the sidebar
      // as soon as the trait is picked, not only once the sheet is left and
      // reopened.
      const _baseStatNoEquip = (paramId, fallback) => {
        if (!classData) return fallback;
        const base = classData.params[paramId][1];
        const plus = (actor && actor._paramPlus) ? (actor._paramPlus[paramId] || 0) : 0;
        const rate = (actor && typeof actor.paramRate === "function") ? actor.paramRate(paramId) : 1;
        // The engine never lets a parameter fall below its own floor (1 for
        // MHP, 0 for the rest), so a pile of negative traits must read as that
        // floor here too instead of showing an impossible negative HP.
        const min = (actor && typeof actor.paramMin === "function") ? actor.paramMin(paramId) : (paramId === 0 ? 1 : 0);
        const value = Math.round((base + plus) * rate);
        if (!isFinite(value)) return fallback;
        return Math.max(min, value);
      };
      const SL = ccStatLabels();
      const stats = [
        { key: "HP",  label: SL.HP,  val: _baseStatNoEquip(0, 450), color: "var(--stat-hp)" },
        { key: "MP",  label: SL.MP,  val: _baseStatNoEquip(1, 100), color: "var(--stat-mp)" },
        { key: "STR", label: SL.STR, val: _baseStatNoEquip(2, 12),  color: "var(--stat-str)" },
        { key: "CON", label: SL.CON, val: _baseStatNoEquip(3, 10),  color: "var(--stat-con)" },
        { key: "DEX", label: SL.DEX, val: _baseStatNoEquip(6, 10),  color: "var(--stat-dex)" },
        { key: "INT", label: SL.INT, val: _baseStatNoEquip(4, 10),  color: "var(--stat-int)" },
        { key: "WIS", label: SL.WIS, val: _baseStatNoEquip(5, 10),  color: "var(--stat-wis)" },
        { key: "PSI", label: SL.PSI, val: _baseStatNoEquip(7, 10),  color: "var(--stat-psi)" }
      ];
      // HP and MP used to be two bar gauges above the stat grid; now they lead
      // it as plain boxes like every other stat, freeing the two bar rows'
      // worth of height for the portrait above to grow into.
      const statsHtml = `
        <div class="cc-vitals-block">
          <div class="cc-stat-grid">
            ${stats.map((st, idx) => {
              const statHover = `onmouseenter="SceneManager._scene.onStatHover(event, '${st.key}')" onmouseleave="SceneManager._scene.onItemLeave()"`;
              const isVital = idx < 2; // HP, MP
              if (isVital) {
                return `
                  <div class="cc-stat-box" ${statHover}>
                    <span class="cc-stat-label cc-inked" style="--cc-ink:${st.color}">${st.label}</span>
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

      // 5. Level-1 Starting Skills - loadout row layout (matches Starting Items)
      const lv1SkillsList = [];
      if (classData && classData.learnings) {
        classData.learnings
          .filter(l => l.level === 1)
          .forEach(l => {
            const sk = $dataSkills[l.skillId];
            if (sk) lv1SkillsList.push({ name: window.CCDbName(sk), iconIndex: sk.iconIndex || 79, id: sk.id });
          });
      }
      const skillsLoadoutHtml = lv1SkillsList.map((sk) => this._ccLoadoutRowHtml(sk.iconIndex, sk.name, "",
        { hover: this._ccHoverAttrs("skill", sk.id) })).join("");

      const skillsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.startingSkills'),
        skillsLoadoutHtml,
        T('CharCreate.noStartingSkills'),
        true
      );

      // 6. Starting Items & Money in Inventory
      const itemsList = [];
      actor.weapons().forEach((w) => {
        if (w) itemsList.push({ name: window.CCDbName(w), iconIndex: w.iconIndex || 116, qty: 1, type: "weapon", id: w.id });
      });
      actor.armors().forEach((a) => {
        if (a) itemsList.push({ name: window.CCDbName(a), iconIndex: a.iconIndex || 144, qty: 1, type: "armor", id: a.id });
      });
      if (typeof getClassStartingItems === "function") {
        const classItems = getClassStartingItems(actor._classId) || [];
        classItems.forEach((entry) => {
          const item = $dataItems[entry.id];
          if (item) itemsList.push({ name: window.CCDbName(item), iconIndex: item.iconIndex || 176, qty: entry.qty || 1, type: "item", id: item.id });
        });
      }
      this._ccPushJobItems(actor, itemsList);

      // The coin already says what the row is, and the name column is narrow
      // enough that the label only ever arrived as "Starting ...". The sum is
      // the whole of it.
      const moneyRowHtml = this._ccLoadoutRowHtml(
        208,
        startingMoneyFormatted,
        '',
        { nameColor: 'var(--text-cost-ok)' }
      );

      const loadoutItemsHtml = itemsList.map((it) => this._ccLoadoutRowHtml(
        it.iconIndex, it.name, `x${it.qty}`,
        { hover: `onmouseenter="SceneManager._scene.onItemHover(event, '${it.type}', ${it.id}, ${it.qty})" onmouseleave="SceneManager._scene.onItemLeave()"` }
      )).join("");

      const startingItemsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.startingItems'),
        moneyRowHtml + loadoutItemsHtml,
        T('CharCreate.noGear'),
        true
      );

      // 7. The traits the member carries, priced the way the trait board prices
      // them, plus whatever illness they walk in with. It reads down the
      // sidebar beside the skills and the kit, so what a character IS is on the
      // same page as what they were given, on every step and not just on the
      // trait board.
      const traitRowsHtml = selectedTraitObjects(actor).map((tr) => {
        return this._ccLoadoutRowHtml(
          tr.icon || 87,
          (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id,
          "",
          { hover: this._ccHoverAttrs("trait", tr.id) }
        );
      }).join("");

      const illnessRowsHtml = ((actor._ccDiseases) || []).map((id) => {
        const card = this._ccDiseaseCards().find((c) => c.diseaseId === id);
        if (!card) return "";
        return this._ccLoadoutRowHtml(card.icon || 180, card.name, "", { nameColor: 'var(--text-text-alt-10)' });
      }).filter(Boolean).join("");

      const traitTotal = selectedTraitObjects(actor).length + ((actor._ccDiseases || []).length);
      const traitsSectionHtml = this._ccLoadoutSectionHtml(
        T('CharCreate.traits'),
        traitRowsHtml + illnessRowsHtml,
        T('CharCreate.noDefiningTraits'),
        true
      );

      // Rolling a character, or a whole party, is the wizard's business. The
      // story mode is played as one of four dossiers and nothing else, so the two
      // buttons that would throw that dossier away are not drawn there.
      // Rolling the open member moved to the action bar beside the one that
      // rolls the whole party (see _actionBarRandomizeMemberHtml).
      const randomizeBtnsHtml = ''

      // Filing the sheet as a dossier of the player's own is a party level
      // action now: the button lives in the action bar (see
      // _actionBarSavePresetHtml) beside the one that rolls the whole party.

      return `
        <div class="cc-compact-sidebar">
          <div class="cc-compact-sidebar-body">
            ${identityHeaderHtml}
            ${profileBoxHtml}
            ${statsHtml}
            ${traitsSectionHtml}
            ${Scene_CharacterCreation.isSimpleMode() ? "" : skillsSectionHtml}
            ${startingItemsSectionHtml}
          </div>
          <div class="cc-compact-actions cc-col cc-col-gap-2">
            ${randomizeBtnsHtml}
          </div>
        </div>
      `;
    }

    // The preset board's own sidebar: the same sections a real member's carries
    // (identity, stats, traits, starting skills, starting kit), read straight
    // off the highlighted dossier's own record rather than off the actor,
    // which is not touched until "Apply" is actually pressed. Stats are the
    // class's own table at the dossier's level, with no trait deltas folded
    // in -- those only exist once applyTraitsToActor has run on a real actor,
    // which this preview deliberately never touches.

    _renderPersonalDossierHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-right"></div>`;

      const classData = $dataClasses[actor._classId];
      const className = classData ? window.CCDbName(classData) : "Class";
      const genderVal = actor.gender ? actor.gender() : 0;
      const genderName = [
        ccT('CharCreate.male'), ccT('CharCreate.female'), ccT('CharCreate.nonBinary2'), ccT('CharCreate.cocoon')
      ][genderVal] || ccT('CharCreate.none2');
      const startingGold = CC_BASE_START_GOLD + memberStartingGold(actor);
      const startingMoneyFormatted = this._formatGoldToEuros(startingGold);
      const bustName = this._getActorBust(actor);
      const bustUrl = this._getBustUrl(bustName);

      // 8 Core Stats (HP, MP, STR, CON, INT, WIS, DEX, PSI)
      // Use class lv1 base × trait param rates only - equipment flat bonuses excluded.
      const _dossierStatNoEquip = (paramId, fallback) => {
        if (!classData) return fallback;
        const base = classData.params[paramId][1];
        const rate = (actor && typeof actor.paramRate === "function") ? actor.paramRate(paramId) : 1;
        return Math.round(base * rate) || fallback;
      };
      const SL = ccStatLabels();
      const stats = [
        { key: "HP",  label: SL.HP,  val: _dossierStatNoEquip(0, 450), color: "var(--stat-hp)" },
        { key: "MP",  label: SL.MP,  val: _dossierStatNoEquip(1, 100), color: "var(--stat-mp)" },
        { key: "STR", label: SL.STR, val: _dossierStatNoEquip(2, 12),  color: "var(--stat-str)" },
        { key: "CON", label: SL.CON, val: _dossierStatNoEquip(3, 10),  color: "var(--stat-con)" },
        { key: "DEX", label: SL.DEX, val: _dossierStatNoEquip(6, 10),  color: "var(--stat-dex)" },
        { key: "INT", label: SL.INT, val: _dossierStatNoEquip(4, 10),  color: "var(--stat-int)" },
        { key: "WIS", label: SL.WIS, val: _dossierStatNoEquip(5, 10),  color: "var(--stat-wis)" },
        { key: "PSI", label: SL.PSI, val: _dossierStatNoEquip(7, 10),  color: "var(--stat-psi)" }
      ];

      const statBoxes = stats.map(st => `
        <div class="cc-stat-box" onmouseenter="SceneManager._scene.onStatHover(event, '${st.key}')" onmouseleave="SceneManager._scene.onItemLeave()">
          <span class="cc-stat-label">${st.label}</span>
          <span class="cc-stat-val">${st.val}</span>
        </div>
      `).join("");

      // Personal Inventory Items
      const itemsList = [];
      actor.weapons().forEach(w => {
        if (w) itemsList.push({ name: window.CCDbName(w), iconIndex: w.iconIndex || 116, qty: 1, type: "weapon", id: w.id });
      });
      actor.armors().forEach(a => {
        if (a) itemsList.push({ name: window.CCDbName(a), iconIndex: a.iconIndex || 144, qty: 1, type: "armor", id: a.id });
      });
      if (typeof getClassStartingItems === "function") {
        const classItems = getClassStartingItems(actor._classId) || [];
        classItems.forEach(entry => {
          const item = $dataItems[entry.id];
          if (item) itemsList.push({ name: window.CCDbName(item), iconIndex: item.iconIndex || 176, qty: entry.qty || 1, type: "item", id: item.id });
        });
      }
      {
        selectedTraitObjects(actor).forEach(tr => {
          if (tr && tr.items) {
            tr.items.forEach(entry => {
              const itemId = (typeof entry === "object") ? entry.id : entry;
              const qty = (typeof entry === "object") ? (entry.qty || 1) : 1;
              const item = $dataItems[itemId];
              if (item) itemsList.push({ name: window.CCDbName(item), iconIndex: item.iconIndex || 176, qty: qty, type: "item", id: item.id });
            });
          }
        });
      }

      const itemsRows = itemsList.map(it => `
        <div class="cc-compact-loadout-item"
             onmouseenter="SceneManager._scene.onItemHover(event, '${it.type}', ${it.id}, ${it.qty})"
             onmouseleave="SceneManager._scene.onItemLeave()">
          <span class="cc-loadout-icon">${this._ccIconHtml(it.iconIndex, 14)}</span>
          <span class="cc-loadout-name">${it.name}</span>
          <span class="cc-loadout-qty">x${it.qty}</span>
        </div>
      `).join("") || `<span class="cc-note-faint">${ccT('CharCreate.noPersonalEquipment')}</span>`;

      // Traits badges. They read as the scenario sheet's do: named down a
      // column with no plate around them, in the order a list is read in.
      const traitsBadges = selectedTraitObjects(actor).map(tr => {
        const name = (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id;
        return { name, id: tr.id };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((tr) => `<span class="cc-element-badge" ${this._ccHoverAttrs("trait", tr.id)}>${tr.name}</span>`)
        .join("");

      return `
        <div class="cc-page cc-page-right cc-col">
          <div class="cc-row-end">
            <div class="cc-money-badge">
              ${this._ccIconHtml(208, 16)} <span>${startingMoneyFormatted}</span>
            </div>
          </div>

          <div class="cc-dossier-photo-frame cc-photo-frame">
            ${bustUrl ? `
              <div class="cc-dossier-large-bust" style="--cc-bust:${window.CCArt.url(bustUrl)}"></div>
            ` : ''}
            <div class="cc-wanted-sprite cc-sprite-x2 cc-sprite-tight" style="${this.getSpriteStyle(actor.characterName(), actor.characterIndex())}"></div>
          </div>

          <div class="cc-dossier-card cc-card-padded">
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('CharCreate.name')}:</span><span class="cc-dossier-value">${actor.name()}</span></div>
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('ClassSelect.vocation')}:</span><span class="cc-dossier-value">${className}</span></div>
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('CharCreate.gender')}:</span><span class="cc-dossier-value">${genderName}</span></div>
          </div>

          <div class="cc-gap-below">
            <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.coreAttributes')}</span>
            <div class="cc-stat-grid">${statBoxes}</div>
          </div>

          <div class="cc-dossier-card cc-card-padded cc-gap-below cc-col cc-col-grow-scroll">
            <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.personalInventory')}</span>
            <div class="cc-col cc-col-gap-hair cc-scroll-pane">
              ${itemsRows}
            </div>
          </div>

          ${traitsBadges ? `
            <div class="cc-gap-above-hair">
              <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.traits')}</span>
              <div class="cc-badge-wrap cc-badge-grid-3">${traitsBadges}</div>
            </div>
          ` : ''}
        </div>
      `;
    }

    // ── Dedicated Scenario / Mission Dossier Page ──
    // ── The scenario board ───────────────────────────────────────────────────
    // The last question of creation: where this party wakes up. The scenarios
    // are the question, so they hold the left page; the right page is the
    // answer sheet, the party as it will actually be played, one full dossier
    // per member, headed by the kit this scenario alone hands out.

    // What the scenario adds to the party purse on top of what the characters
    // themselves bring, from the same table giveStartingMoney pays out of.
    _scenarioGoldBonus(originSymbol) {
      return scenarioGoldBonus(originSymbol);
    }

    _scenarioItemRowHtml(entry) {
      return this._ccLoadoutRowHtml(entry.iconIndex, entry.name, `x${entry.qty}`, {
        hover: `onmouseenter="SceneManager._scene.onItemHover(event, '${entry.type}', ${entry.id}, ${entry.qty})" onmouseleave="SceneManager._scene.onItemLeave()"`
      });
    }

    // One member's whole sheet: who they are, what they can take, what they
    // know and what they are carrying when the game starts.
    _scenarioMemberSheetHtml(actor) {
      const classData = $dataClasses[actor._classId];
      const className = classData ? window.CCDbName(classData) : T('CharCreate.class');
      const bustUrl = this._getBustUrl(this._getActorBust(actor));
      const money = CC_BASE_START_GOLD
        + (typeof classStartingMoney === 'function' ? classStartingMoney(actor._classId) : 0)
        + (typeof traitStartingMoney === 'function' ? traitStartingMoney(actor) : 0)
        + (typeof wealthStartingMoney === 'function' ? wealthStartingMoney(actor) : 0);

      const stat = (label, value, key) => `
        <div class="cc-scenario-stat" onmouseenter="SceneManager._scene.onStatHover(event, '${key}')" onmouseleave="SceneManager._scene.onItemLeave()"><span>${label}</span><b>${value}</b></div>
      `;

      // A trait reads like the skills and the kit beside it: its own icon first,
      // then its name, so the three sections of the sheet are scanned the same
      // way instead of one column of bare words next to two of pictures.
      const traitBadges = selectedTraitObjects(actor).map((tr) => {
        const name = (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id;
        return `<span class="cc-element-badge cc-element-badge--icon" ${this._ccHoverAttrs("trait", tr.id)}>`
          + `<span class="cc-badge-icon">${this._ccIconHtml(tr.icon || 87, 16)}</span>`
          + `<span class="cc-badge-name">${name}</span></span>`;
      }).filter(Boolean).join("");

      const illnessBadges = ((actor._ccDiseases) || []).map((id) => {
        const card = this._ccDiseaseCards().find((c) => c.diseaseId === id);
        if (!card) return "";
        return `<span class="cc-element-badge bad cc-element-badge--icon">`
          + `<span class="cc-badge-icon">${this._ccIconHtml(card.icon || 180, 16)}</span>`
          + `<span class="cc-badge-name">${card.name}</span></span>`;
      }).filter(Boolean).join("");

      const actorSkills = actor.skills().filter(Boolean);
      const skillRows = actorSkills.map((sk) =>
        this._ccLoadoutRowHtml(sk.iconIndex || 79, window.CCDbName(sk), "",
          { hover: this._ccHoverAttrs("skill", sk.id) })
      ).join("");

      const carried = [];
      actor.weapons().forEach((w) => {
        if (w) carried.push({ name: window.CCDbName(w), iconIndex: w.iconIndex || 116, qty: 1, type: "weapon", id: w.id });
      });
      actor.armors().forEach((a) => {
        if (a) carried.push({ name: window.CCDbName(a), iconIndex: a.iconIndex || 144, qty: 1, type: "armor", id: a.id });
      });
      if (typeof getClassStartingItems === "function") {
        (getClassStartingItems(actor._classId) || []).forEach((e) => {
          const item = $dataItems[e.id];
          if (item) carried.push({ name: window.CCDbName(item), iconIndex: item.iconIndex || 176, qty: e.qty || 1, type: "item", id: item.id });
        });
      }
      this._ccPushJobItems(actor, carried);

      const section = (title, body) => body
        ? `<div class="cc-scenario-section"><h4>${title}</h4>${body}</div>` : "";

      return `
        <div class="cc-scenario-sheet">
          <div class="cc-scenario-sheet-head">
            ${bustUrl ? `<div class="cc-scenario-sheet-bust" style="--cc-bust:${window.CCArt.url(bustUrl)}"></div>` : ''}
            <div class="cc-scenario-sheet-sprite" style="${this.getSpriteStyle(actor.characterName(), actor.characterIndex())}"></div>
            <div class="cc-scenario-sheet-id">
              <span class="cc-scenario-sheet-name">${actor.name()}</span>
              <span class="cc-scenario-sheet-class">${className}</span>
              <span class="cc-scenario-sheet-money">${this._formatGoldToEuros(money)}</span>
            </div>
          </div>

          <div class="cc-scenario-stat-grid">
            ${stat(T('CharCreate.abbrev.hp'), actor.mhp, 'HP')}
            ${stat(T('CharCreate.abbrev.mp'), actor.mmp, 'MP')}
            ${stat(T('CharCreate.abbrev.str'), actor.param(2), 'STR')}
            ${stat(T('CharCreate.abbrev.con'), actor.param(3), 'CON')}
            ${stat(T('CharCreate.abbrev.int'), actor.param(4), 'INT')}
            ${stat(T('CharCreate.abbrev.wis'), actor.param(5), 'WIS')}
            ${stat(T('CharCreate.abbrev.dex'), actor.param(6), 'DEX')}
            ${stat(T('CharCreate.abbrev.psi'), actor.param(7), 'PSI')}
          </div>

          ${section(T('CharCreate.traits'), traitBadges ? `<div class="cc-badge-wrap cc-badge-grid-3">${traitBadges}</div>` : "")}
          ${section(ccT('Traits.tabDiseases'), illnessBadges ? `<div class="cc-badge-wrap cc-badge-grid-3">${illnessBadges}</div>` : "")}
          ${this._ccLoadoutSectionHtml(
            T('CharCreate.startingSkills'),
            skillRows,
            T('CharCreate.noStartingSkills'),
            true,
            'cc-loadout-grid-cols-3'
          )}
          ${this._ccLoadoutSectionHtml(
            T('CharCreate.startingItems'),
            carried.map((e) => this._scenarioItemRowHtml(e)).join(""),
            T('CharCreate.noGear'),
            true,
            'cc-loadout-grid-cols-3'
          )}
        </div>
      `;
    }

    _renderScenarioDossierHtml() {
      const stepData = CharacterCreationData[STEP.ORIGIN] || { choices: [] };
      const activeIndex = this._gridWindow ? this._gridWindow.index() : 0;
      const originChoice = (stepData.choices && stepData.choices[activeIndex]) || {};
      const originSymbol = originChoice.symbol || $gameSystem._ccOriginSymbol || "origin_train";

      // The flat purse is paid once to the whole party, not once per member
      // (giveStartingMoney does the same), so it sits outside the loop below.
      const partyMembers = $gameParty ? $gameParty.members() : [];
      let totalGold = CC_BASE_START_GOLD + this._scenarioGoldBonus(originSymbol);
      partyMembers.forEach((a) => {
        const NC = window.NPCCreature;
        if (NC && NC.isNonSentientActor(a)) return;
        totalGold += (typeof classStartingMoney === 'function' ? classStartingMoney(a._classId) : 0)
          + (typeof traitStartingMoney === 'function' ? traitStartingMoney(a) : 0)
          + (typeof wealthStartingMoney === 'function' ? wealthStartingMoney(a) : 0);
      });

      // The kit this scenario alone hands out, on top of what the characters
      // already carry: the one thing the choice on the left actually changes
      // about the loadout, so it is shown apart rather than folded into the
      // party's consolidated inventory where it used to be invisible.
      const exclusive = (resolveOriginLoadout(originSymbol) || []).map((e) => {
        const data = loadoutEntryData(e);
        if (!data) return null;
        const type = e.kind === "weapon" || e.kind === "armor" ? e.kind : "item";
        return { name: window.CCDbName(data), iconIndex: data.iconIndex || 176, qty: e.qty || 1, type, id: data.id };
      }).filter(Boolean);
      const goldBonus = this._scenarioGoldBonus(originSymbol);
      // The custom card's brief carries the shelf of saved scenarios, and reads
      // as the one picked: its own name and description under the card's.
      const isCustom = originSymbol === "origin_custom";
      const customPanel = isCustom ? this._customScenarioPanelHtml() : "";
      const customActive = isCustom && window.CCOrigins && window.CCOrigins.activeCustomScenario
        ? window.CCOrigins.activeCustomScenario() : null;
      const briefQuote = customActive
        ? `${customActive.name}${customActive.description ? `: ${customActive.description}` : ""}`
        : (originChoice.description || "");

      // The party's shared bag, apart from the scenario's own exclusive kit:
      // what the party is already carrying going into the choice above.
      const partyInventory = $gameParty.allItems().filter((it) => it && it.name).map((it) => {
        const type = DataManager.isWeapon(it) ? "weapon" : DataManager.isArmor(it) ? "armor" : "item";
        return { name: window.CCDbName(it), iconIndex: it.iconIndex || 176, qty: $gameParty.numItems(it), type, id: it.id };
      });

      // Scenarios are divided into suggested scenarios and other scenarios
      // CharacterCreationOrigins owns both the suggested block and the reading
      // order of the rest (alphabetical), so the cards below are drawn in the
      // order the choices already arrive in.
      const suggestedSymbols = (window.CCOrigins && window.CCOrigins.SUGGESTED_ORIGINS)
        || ["origin_train", "origin_camper", "origin_space", "origin_stranded", "origin_lot", "origin_dungeon", "origin_ceo", "origin_patron_vault"];
      const allChoices = stepData.choices || [];
      const suggestedEntries = [];
      const otherEntries = [];

      allChoices.forEach((choice, index) => {
        if (suggestedSymbols.includes(choice.symbol)) {
          suggestedEntries.push({ choice, index });
        } else {
          otherEntries.push({ choice, index });
        }
      });

      // A chaos world skipped creation outright, so there is no party
      // configuration to return to: that seat in the left bar is a reroll of
      // the three characters instead.
      const chaos = Scene_CharacterCreation.isChaosWorld();

      const renderCard = (choice, index) => `
        <div class="cc-card-option cc-scenario-card ${index === activeIndex ? 'selected' : ''}"
             onclick="SceneManager._scene.onOptionCardClick(${index})">
          <div class="cc-option-title">${choice.name}</div>
        </div>
      `;

      const scenarioSectionsHtml = `
        ${suggestedEntries.length ? `
          <div class="cc-scenario-group-title">${ccT('CharCreate.suggestedScenarios')}</div>
          ${suggestedEntries.map((e) => renderCard(e.choice, e.index)).join("")}
        ` : ''}
        ${otherEntries.length ? `
          <div class="cc-scenario-group-title">${ccT('CharCreate.otherScenarios')}</div>
          ${otherEntries.map((e) => renderCard(e.choice, e.index)).join("")}
        ` : ''}
      `;

      return `
        <div class="cc-scenario-dossier">
          <div class="cc-page cc-scenario-list">
            <div class="cc-scenario-list-head">
              <h2 class="cc-subheader">${ccT('CharCreate.scenarioPickPrompt')}</h2>
              <span class="ts-count">${(stepData.choices || []).length}</span>
            </div>
            <div class="cc-select-grid cc-scenario-grid">
              ${scenarioSectionsHtml}
            </div>
          </div>

          <div class="cc-page cc-scenario-brief">
            <div class="cc-scenario-brief-head">
              <h2 class="cc-header-gothic">${originChoice.name || ""}</h2>
              <div class="cc-money-badge">${this._ccIconHtml(208, 16)} <span>${this._formatGoldToEuros(totalGold)}</span></div>
            </div>
            <p class="cc-class-quote">${this.emphasizeText(briefQuote)}</p>

            <div class="cc-scenario-brief-body">
              ${customPanel}
              <div class="cc-dossier-card cc-class-section">
                <h3 class="cc-subheader">
                  <span>${ccT('CharCreate.scenarioExclusiveItems')}</span>
                  ${goldBonus ? `<span class="cc-scenario-bonus">+${this._formatGoldToEuros(goldBonus)}</span>` : ''}
                </h3>
                ${exclusive.length
                  ? `<div class="cc-compact-loadout-grid cc-loadout-open cc-loadout-grid-cols">${exclusive.map((e) => this._scenarioItemRowHtml(e)).join("")}</div>`
                  : `<span class="cc-class-none">${ccT('CharCreate.scenarioNoExclusiveItems')}</span>`}
              </div>

              <div class="cc-dossier-card cc-class-section">
                <h3 class="cc-subheader">
                  <span>${ccT('CharCreate.scenarioPartyInventory')}</span>
                  ${partyInventory.length ? `<span class="ts-count">${partyInventory.length}</span>` : ''}
                </h3>
                ${partyInventory.length
                  ? `<div class="cc-compact-loadout-grid cc-loadout-open cc-loadout-grid-cols-3">${partyInventory.map((e) => this._scenarioItemRowHtml(e)).join("")}</div>`
                  : `<span class="cc-class-none">${ccT('CharCreate.scenarioNoPartyInventory')}</span>`}
              </div>
            </div>

          </div>

          <div class="cc-page cc-scenario-roster-col">
            <h3 class="cc-subheader cc-scenario-roster-head">
              <span>${ccT('CharCreate.scenarioRoster')}</span>
              <span class="ts-count">${partyMembers.length}</span>
            </h3>
            <div class="cc-scenario-sheets">
              ${partyMembers.map((a) => this._scenarioMemberSheetHtml(a)).join("")}
            </div>
          </div>
        </div>
      `;
    }

    // What the sidebar's own primary button says. The story mode never reaches
    // the scenario board (Em's dossier says where the party wakes up) and is
    // asked nothing after her sheet, so its one button begins the adventure.
    _partyConfirmLabel() {
      if (Scene_CharacterCreation._storyMode) {
        return ccT('CharCreate.beginAdventure');
      }
      return this._hasAuthoredPresetInParty(false)
        ? ccT('CharCreate.startGame')
        : ccT('CharCreate.confirmPartyScenario');
    }

    onProceedToScenario() {
      // The story mode asks for no scenario and no vehicle: Em's dossier says
      // where the party wakes up and The Beast is already parked outside, so
      // the button on her sheet ends creation.
      if (Scene_CharacterCreation._storyMode) {
        this.finishStoryModeCreation();
        return;
      }
      // A hand-authored VIP dossier says where the party wakes up, so it skips the
      // scenario board. A dossier the player saved is only a character sheet: it
      // picks its scenario like anybody else.
      if (this._hasAuthoredPresetInParty(false)) {
        this.onFinishPartyCreation();
        return;
      }
      if (Scene_CharacterCreation.isSimpleMode()) {
        const partyMembers = $gameParty ? $gameParty.members() : [];
        partyMembers.forEach((actor) => {
          if (typeof this._ensureSimpleModeStatsAndTraits === "function") {
            this._ensureSimpleModeStatsAndTraits(actor);
          }
        });
      }
      Scene_CharacterCreation._isScenarioMode = true;
      this._step = STEP.ORIGIN;
      // The scenario cards are a BOARD (.cc-card-option), so the ring steps
      // over them and the origin window is what walks them. Setting the step
      // without setting the board up left that window holding the PREVIOUS
      // step's choices, and a pad could open the page but never pick a
      // scenario on it: only a mouse could, through the card's own onclick.
      this.setupStep();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // ── Custom scenarios ─────────────────────────────────────────────────────
    // The last suggested card is the player's own scenario. Its brief page
    // lists every scenario in the scenarios folder (CharacterCreationOrigins
    // owns the files and the data); picking one makes it the scenario this run
    // starts, and the editor writes new ones and rewrites old ones. The kit and
    // the cash on the brief are read off the picked scenario by the same
    // resolveOriginLoadout / scenarioGoldBonus every other card uses.

    _ccCustomList(reload) {
      if (reload || !this._ccCustomScenarios) {
        const CCO = window.CCOrigins || {};
        this._ccCustomScenarios = CCO.listCustomScenarios ? CCO.listCustomScenarios() : [];
      }
      return this._ccCustomScenarios;
    }

    // One line of plain words per role the scenario opens in, for the brief.
    _customScenarioSummaryRows(sc) {
      const CCO = window.CCOrigins || {};
      const rows = [];
      const row = (label, value) => rows.push(
        `<div class="cc-dossier-row"><span class="cc-dossier-label">${label}</span><span class="cc-dossier-value">${value}</span></div>`);
      row(ccT('CharCreate.custom.where'), this._customStartLabel(sc));
      if (sc.bounty) row(ccT('CharCreate.custom.bounty'), this._formatGoldToEuros(sc.bounty * 100));
      if (sc.knowledge) row(ccT('CharCreate.custom.knowledge'), String(sc.knowledge));
      if (sc.levels) row(ccT('CharCreate.custom.levels'), `+${sc.levels}`);
      if (sc.army.count) {
        row(ccT('CharCreate.custom.troops'), ccTp('CharCreate.custom.troopsLine', {
          count: sc.army.count, from: this._customFactionLabel(sc.army.factionId, true),
        }));
      }
      if (sc.allegiance.kind !== "none") row(ccT('CharCreate.custom.allegiance'), this._customAllegianceLabel(sc)); // i18n-ignore: allegiance kind
      if (sc.mayor.town) row(ccT('CharCreate.custom.mayor'), this._ccPlaceLabel(sc.mayor.town));
      if (sc.politicalParty.mode !== "none") row(ccT('CharCreate.custom.party'), this._customPartyLabel(sc)); // i18n-ignore: join mode
      if (sc.foundedFaction.mode !== "none") row(ccT('CharCreate.custom.faction'), this._customFoundedLabel(sc)); // i18n-ignore: join mode
      if (sc.perks.length) {
        row(ccT('CharCreate.custom.perks'), sc.perks.map((p) => ccT(`CharCreate.custom.perk.${p}`)).join(", "));
      }
      if (CCO.CUSTOM_MEMBER_REPUTATION && sc.reputation.length) {
        row(ccT('CharCreate.custom.standing'), sc.reputation.map((r) =>
          `${this._customFactionLabel(r.factionId)} ${r.value > 0 ? "+" : ""}${r.value}`).join(", "));
      }
      return rows.join("");
    }

    _ccPlaceLabel(name) {
      return (window.WorldNames && window.WorldNames.localize) ? window.WorldNames.localize(name) : name;
    }

    _customStartLabel(sc) {
      const base = ccT(`CharCreate.custom.start.${sc.start.kind}`);
      if (sc.start.kind === "town" && sc.start.town) return `${base}: ${this._ccPlaceLabel(sc.start.town)}`; // i18n-ignore: start kind
      if (sc.start.kind === "square") { // i18n-ignore: start kind
        const WMT = window.WorldMapTransfer;
        return WMT && WMT.squareLabel ? WMT.squareLabel(sc.start.x, sc.start.y) : `${base} (${sc.start.x} ${sc.start.y})`;
      }
      return base;
    }

    _customFactionLabel(id, mixedWhenNone) {
      const CCO = window.CCOrigins || {};
      const f = (CCO.customFactionOptions ? CCO.customFactionOptions() : []).find((o) => o.id === id);
      if (f) return f.name;
      return mixedWhenNone ? ccT('CharCreate.custom.mixed') : ccT('CharCreate.custom.none');
    }

    _customAllegianceLabel(sc) {
      const CCO = window.CCOrigins || {};
      const al = sc.allegiance;
      if (al.kind === "faction") return this._customFactionLabel(al.id); // i18n-ignore: allegiance kind
      if (al.kind === "hyperpower") { // i18n-ignore: allegiance kind
        const hp = (CCO.customHyperpowerOptions ? CCO.customHyperpowerOptions() : []).find((o) => o.id === al.id);
        return hp ? hp.name : ccT('CharCreate.custom.none');
      }
      return ccT('CharCreate.custom.allegianceKind.none');
    }

    _customPartyLabel(sc) {
      const p = sc.politicalParty;
      if (p.mode === "join") return ccT('CharCreate.custom.mode.join'); // i18n-ignore: join mode
      const CCO = window.CCOrigins || {};
      const creed = (CCO.customCreedOptions ? CCO.customCreedOptions() : []).find((c) => c.id === p.ideologyId);
      const name = p.name || ccT('CharCreate.custom.partyUnnamed');
      return creed ? `${name} (${creed.name})` : name;
    }

    _customFoundedLabel(sc) {
      const f = sc.foundedFaction;
      if (f.mode === "join") { // i18n-ignore: join mode
        const CCO = window.CCOrigins || {};
        const rec = (CCO.customFoundedFactionOptions ? CCO.customFoundedFactionOptions() : []).find((r) => r.id === f.id);
        return rec ? rec.name : (f.name || ccT('CharCreate.custom.none'));
      }
      return f.name || ccT('CharCreate.custom.defaultFactionName');
    }

    // The card on the brief page: every saved scenario, the one picked, and
    // what can be done with them.
    _customScenarioPanelHtml() {
      const CCO = window.CCOrigins || {};
      const list = this._ccCustomList(false);
      let active = CCO.activeCustomScenario ? CCO.activeCustomScenario() : null;
      // The first scenario on the shelf is picked until another one is, so the
      // brief always reads back a real scenario when there is one.
      if (!active && list.length && CCO.setActiveCustomScenario) {
        CCO.setActiveCustomScenario(list[0].scenario, list[0].file);
        active = CCO.activeCustomScenario();
      }
      const activeFile = CCO.activeCustomScenarioFile ? CCO.activeCustomScenarioFile() : null;
      const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const rows = list.length
        ? list.map((entry, i) => `
            <button type="button" class="cc-sidebar-btn cc-cs-row focusable ${entry.file === activeFile ? 'selected cc-modal-row-picked' : ''}"
                    onclick="SceneManager._scene.onCustomScenarioPick(${i})">${esc(entry.scenario.name)}</button>`).join("")
        : `<span class="cc-class-none">${ccT('CharCreate.custom.noneSaved')}</span>`;
      const btn = (key, action, disabled) => `
        <button type="button" class="cc-sidebar-btn cc-cs-action focusable" ${disabled ? 'disabled' : ''}
                onclick="${disabled ? 'SoundManager.playBuzzer()' : `SceneManager._scene.onCustomScenarioAction('${action}')`}">${ccT(key)}</button>`;
      const folder = CCO.customScenarioFolder ? CCO.customScenarioFolder() : null;
      return `
        <div class="cc-dossier-card cc-class-section cc-cs-panel">
          <h3 class="cc-subheader">
            <span>${ccT('CharCreate.custom.panelTitle')}</span>
            <span class="ts-count">${list.length}</span>
          </h3>
          <div class="cc-cs-list">${rows}</div>
          <div class="cc-cs-actions">
            ${btn('CharCreate.custom.new', 'new')}
            ${btn('CharCreate.custom.edit', 'edit', !active)}
            ${btn('CharCreate.custom.duplicate', 'duplicate', !active)}
            ${btn('CharCreate.custom.delete', 'delete', !activeFile)}
            ${btn('CharCreate.custom.reload', 'reload')}
            ${folder ? btn('CharCreate.custom.folder', 'folder') : ''}
          </div>
          ${active ? `<div class="cc-cs-summary">${this._customScenarioSummaryRows(active)}</div>` : ''}
        </div>`;
    }

    _repaintCustomBrief() {
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onCustomScenarioPick(index) {
      const CCO = window.CCOrigins || {};
      const entry = this._ccCustomList(false)[index];
      if (!entry || !CCO.setActiveCustomScenario) return;
      CCO.setActiveCustomScenario(entry.scenario, entry.file);
      SoundManager.playCursor();
      this._repaintCustomBrief();
    }

    onCustomScenarioAction(action) {
      const CCO = window.CCOrigins || {};
      const active = CCO.activeCustomScenario ? CCO.activeCustomScenario() : null;
      const file = CCO.activeCustomScenarioFile ? CCO.activeCustomScenarioFile() : null;
      if (action === "new") {
        this._openCustomScenarioEditor(null, null, null);
      } else if (action === "edit" && active) {
        this._openCustomScenarioEditor(active, file, null);
      } else if (action === "duplicate" && active) {
        const copy = JSON.parse(JSON.stringify(active));
        copy.name = ccTp('CharCreate.custom.copyName', { name: active.name });
        copy.id = "";
        this._openCustomScenarioEditor(copy, null, null);
      } else if (action === "delete" && file) {
        this._ccConfirm({
          title: ccT('CharCreate.custom.deleteTitle'),
          body: ccTp('CharCreate.custom.deleteBody', { name: active ? active.name : file }),
          acceptLabel: ccT('CharCreate.custom.delete'),
        }, () => {
          if (CCO.deleteCustomScenario) CCO.deleteCustomScenario(file);
          if (CCO.setActiveCustomScenario) CCO.setActiveCustomScenario(null);
          this._ccCustomList(true);
          this._repaintCustomBrief();
        });
      } else if (action === "reload") {
        SoundManager.playCursor();
        this._ccCustomList(true);
        this._repaintCustomBrief();
      } else if (action === "folder") {
        // Confirming is silent in the wizard; only a refusal is heard.
        if (!CCO.openCustomScenarioFolder || !CCO.openCustomScenarioFolder()) SoundManager.playBuzzer();
      }
    }

    // ── The scenario editor ──────────────────────────────────────────────────
    // A sheet over the board, drawn on the same parchment as every other
    // modal of the wizard. Everything a scenario holds is a button, so a pad
    // walks it with the sheet's own cursor (see _ccModalPollInput); the only
    // fields to type in are the names, which a pad leaves as they are. Every
    // list (towns, factions, creeds, the item database) opens through CCPick,
    // the wizard's one pick sheet, with its search strip.
    //
    // `onSaved`, when given, runs once the scenario is written: the board's
    // Confirm with no scenario picked opens a blank editor and begins it as
    // soon as it is saved.
    _openCustomScenarioEditor(scenario, file, onSaved) {
      const CCO = window.CCOrigins || {};
      if (!CCO.normalizeCustomScenario) return;
      const container = this._dndContainer || document.getElementById("character-creation-container");
      if (!container) return;
      const existing = container.querySelector(".cc-modal-veil");
      if (existing) existing.remove();

      let draft = CCO.normalizeCustomScenario(scenario || CCO.blankCustomScenario());
      const veil = document.createElement("div");
      veil.className = "cc-modal-veil cc-cs-veil";
      veil.setAttribute("data-nav-modal", "1");
      container.appendChild(veil);
      const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const L = CCO.CUSTOM_LIMITS || {};
      let error = "";

      const close = () => {
        document.removeEventListener("keydown", onKey, true);
        if (this._ccModalState && this._ccModalState.veil === veil) this._ccModalState = null;
        veil.remove();
      };

      // --- controls -------------------------------------------------------
      const pickBtn = (act, value, extra) =>
        `<button type="button" class="cc-sidebar-btn cc-cs-pick" data-act="${act}" ${extra || ""}>${esc(value)}</button>`;
      const stepper = (field, value, shown, steps) => `
        <span class="cc-cs-stepper">
          ${steps.slice().reverse().map((d) => `<button type="button" class="cc-sidebar-btn cc-cs-step" data-act="step" data-field="${field}" data-delta="${-d}">-${d >= 1000 ? (d / 1000) + "k" : d}</button>`).join("")}
          <span class="cc-cs-value">${esc(shown == null ? value : shown)}</span>
          ${steps.map((d) => `<button type="button" class="cc-sidebar-btn cc-cs-step" data-act="step" data-field="${field}" data-delta="${d}">+${d >= 1000 ? (d / 1000) + "k" : d}</button>`).join("")}
        </span>`;
      const text = (field, value, max, hint) =>
        `<input type="text" class="cc-pick-search cc-modal-input cc-cs-text" data-text="${field}" maxlength="${max}"
                autocomplete="off" spellcheck="false" value="${esc(value)}" placeholder="${esc(hint || "")}">`;
      const line = (label, control) => `
        <div class="cc-cs-line"><span class="cc-modal-label cc-cs-label">${esc(label)}</span><span class="cc-cs-control">${control}</span></div>`;
      const section = (title, body) => `
        <div class="cc-dossier-card cc-cs-section"><h3 class="cc-subheader"><span>${esc(title)}</span></h3>${body}</div>`;
      const euros = (n) => this._formatGoldToEuros(n * 100);

      const dbOf = (kind) => (kind === "weapon" ? $dataWeapons : kind === "armor" ? $dataArmors : $dataItems);

      const render = () => {
        const scroller = veil.querySelector(".cc-cs-body");
        const keepScroll = scroller ? scroller.scrollTop : 0;
        const d = draft;
        const startLines = [line(ccT('CharCreate.custom.where'), pickBtn("start", ccT(`CharCreate.custom.start.${d.start.kind}`)))];
        if (d.start.kind === "town") { // i18n-ignore: start kind
          startLines.push(line(ccT('CharCreate.custom.town'),
            d.mayor.town
              ? `<span class="cc-cs-value">${esc(this._ccPlaceLabel(d.mayor.town))}</span>`
              : pickBtn("startTown", d.start.town ? this._ccPlaceLabel(d.start.town) : ccT('CharCreate.custom.pick'))));
        }
        if (d.start.kind === "square") { // i18n-ignore: start kind
          startLines.push(line(ccT('CharCreate.custom.squareX'), stepper("start.x", d.start.x, null, [1, 10])));
          startLines.push(line(ccT('CharCreate.custom.squareY'), stepper("start.y", d.start.y, null, [1, 10])));
        }

        const kitRows = d.items.length ? d.items.map((row, i) => {
          const data = (dbOf(row.kind) || [])[row.id];
          const name = data ? window.CCDbName(data) : `#${row.id}`;
          return `
            <div class="cc-cs-line cc-cs-kit-row">
              <span class="cc-cs-label cc-row-inline">${data ? `<span class="cc-rpg-icon" style="${this._ccIconStyle(data.iconIndex)}"></span>` : ''}${esc(name)}</span>
              <span class="cc-cs-control">
                ${stepper(`item.${i}`, row.qty, `x${row.qty}`, [1, 10])}
                <button type="button" class="cc-sidebar-btn cc-cs-remove" data-act="removeItem" data-index="${i}">${esc(ccT('CharCreate.custom.remove'))}</button>
              </span>
            </div>`;
        }).join("") : `<span class="cc-class-none">${esc(ccT('CharCreate.custom.noItems'))}</span>`;

        const repRows = d.reputation.length ? d.reputation.map((row, i) => `
            <div class="cc-cs-line">
              <span class="cc-cs-label">${esc(this._customFactionLabel(row.factionId))}</span>
              <span class="cc-cs-control">
                ${stepper(`rep.${i}`, row.value, `${row.value > 0 ? "+" : ""}${row.value}`, [5, 25])}
                <button type="button" class="cc-sidebar-btn cc-cs-remove" data-act="removeRep" data-index="${i}">${esc(ccT('CharCreate.custom.remove'))}</button>
              </span>
            </div>`).join("") : `<span class="cc-class-none">${esc(ccT('CharCreate.custom.noStanding'))}</span>`;

        const allegianceLines = [line(ccT('CharCreate.custom.allegiance'), pickBtn("allegianceKind", ccT(`CharCreate.custom.allegianceKind.${d.allegiance.kind}`)))];
        if (d.allegiance.kind !== "none") { // i18n-ignore: allegiance kind
          allegianceLines.push(line(ccT('CharCreate.custom.allegianceWhich'), pickBtn("allegianceWhich", this._customAllegianceLabel(d))));
          allegianceLines.push(`<p class="cc-modal-body cc-cs-note">${esc(ccT('CharCreate.custom.memberNote'))}</p>`);
        }

        const partyLines = [line(ccT('CharCreate.custom.party'), pickBtn("partyMode", ccT(`CharCreate.custom.mode.${d.politicalParty.mode}`)))];
        if (d.politicalParty.mode === "found") { // i18n-ignore: join mode
          const creed = (CCO.customCreedOptions() || []).find((c) => c.id === d.politicalParty.ideologyId);
          partyLines.push(line(ccT('CharCreate.custom.partyName'), text("politicalParty.name", d.politicalParty.name, L.name || 48, ccT('CharCreate.custom.partyUnnamed'))));
          partyLines.push(line(ccT('CharCreate.custom.creed'), pickBtn("creed", creed ? creed.name : ccT('CharCreate.custom.pick'))));
        }
        if (d.politicalParty.mode !== "none") partyLines.push(`<p class="cc-modal-body cc-cs-note">${esc(ccT('CharCreate.custom.partyNote'))}</p>`); // i18n-ignore: join mode

        const factionLines = [line(ccT('CharCreate.custom.faction'), pickBtn("factionMode", ccT(`CharCreate.custom.mode.${d.foundedFaction.mode}`)))];
        if (d.foundedFaction.mode === "join") { // i18n-ignore: join mode
          const world = CCO.customFoundedFactionOptions() || [];
          factionLines.push(world.length
            ? line(ccT('CharCreate.custom.factionWhich'), pickBtn("factionWhich", this._customFoundedLabel(d)))
            : `<p class="cc-modal-body cc-cs-note">${esc(ccT('CharCreate.custom.noFoundedFactions'))}</p>`);
        } else if (d.foundedFaction.mode === "found") { // i18n-ignore: join mode
          factionLines.push(line(ccT('CharCreate.custom.factionName'), text("foundedFaction.name", d.foundedFaction.name, L.name || 48, ccT('CharCreate.custom.defaultFactionName'))));
          factionLines.push(line(ccT('CharCreate.custom.motto'), text("foundedFaction.motto", d.foundedFaction.motto, L.motto || 120, "")));
          factionLines.push(line(ccT('CharCreate.custom.swornUnder'), pickBtn("factionPatron", this._customFactionLabel(d.foundedFaction.patronFactionId))));
        }

        const perkButtons = (CCO.CUSTOM_PERKS || []).map((p) => `
          <button type="button" class="cc-sidebar-btn cc-cs-perk ${d.perks.indexOf(p) >= 0 ? 'selected cc-modal-row-picked' : ''}" data-act="perk" data-perk="${p}">${esc(ccT(`CharCreate.custom.perk.${p}`))}</button>`).join("");

        veil.innerHTML = `
          <div class="cc-modal cc-cs-editor" role="dialog" aria-modal="true">
            <h3 class="cc-modal-title">${esc(ccT('CharCreate.custom.editorTitle'))}</h3>
            <div class="cc-cs-body cc-scroll-pane">
              ${section(ccT('CharCreate.custom.sectionGeneral'),
                line(ccT('CharCreate.custom.name'), text("name", d.name, L.name || 48, ccT('CharCreate.custom.defaultName'))) +
                line(ccT('CharCreate.custom.description'), text("description", d.description, L.description || 400, ccT('CharCreate.custom.descriptionHint'))))}
              ${section(ccT('CharCreate.custom.sectionStart'), startLines.join(""))}
              ${section(ccT('CharCreate.custom.sectionPurse'),
                line(ccT('CharCreate.custom.cash'), stepper("euros", d.euros, euros(d.euros), [100, 1000, 100000])) +
                line(ccT('CharCreate.custom.bounty'), stepper("bounty", d.bounty, euros(d.bounty), [100, 1000, 10000])) +
                line(ccT('CharCreate.custom.knowledge'), stepper("knowledge", d.knowledge, null, [10, 100, 1000])) +
                line(ccT('CharCreate.custom.levels'), stepper("levels", d.levels, `+${d.levels}`, [1, 5])))}
              ${section(ccT('CharCreate.custom.sectionKit'), kitRows + `
                <div class="cc-cs-actions">
                  <button type="button" class="cc-sidebar-btn cc-cs-action" data-act="addItem" data-kind="item">${esc(ccT('CharCreate.custom.addItem'))}</button>
                  <button type="button" class="cc-sidebar-btn cc-cs-action" data-act="addItem" data-kind="weapon">${esc(ccT('CharCreate.custom.addWeapon'))}</button>
                  <button type="button" class="cc-sidebar-btn cc-cs-action" data-act="addItem" data-kind="armor">${esc(ccT('CharCreate.custom.addArmor'))}</button>
                </div>`)}
              ${section(ccT('CharCreate.custom.sectionArmy'),
                line(ccT('CharCreate.custom.troops'), stepper("army.count", d.army.count, null, [1, 10])) +
                line(ccT('CharCreate.custom.troopsFrom'), pickBtn("armyFaction", this._customFactionLabel(d.army.factionId, true))) +
                line(ccT('CharCreate.custom.upkeep'), stepper("army.upkeepWeeks", d.army.upkeepWeeks, ccTp('CharCreate.custom.weeks', { n: d.army.upkeepWeeks }), [1])))}
              ${section(ccT('CharCreate.custom.sectionRoles'),
                allegianceLines.join("") +
                line(ccT('CharCreate.custom.mayor'), pickBtn("mayor", d.mayor.town ? this._ccPlaceLabel(d.mayor.town) : ccT('CharCreate.custom.nobody'))) +
                (d.mayor.town ? `<p class="cc-modal-body cc-cs-note">${esc(ccT('CharCreate.custom.mayorNote'))}</p>` : "") +
                partyLines.join("") + factionLines.join(""))}
              ${section(ccT('CharCreate.custom.sectionStanding'), repRows + `
                <div class="cc-cs-actions">
                  <button type="button" class="cc-sidebar-btn cc-cs-action" data-act="addRep">${esc(ccT('CharCreate.custom.addStanding'))}</button>
                </div>`)}
              ${section(ccT('CharCreate.custom.sectionPerks'), `<div class="cc-cs-actions">${perkButtons}</div>`)}
            </div>
            <p class="cc-modal-error">${esc(error)}</p>
            <div class="cc-modal-actions army-dialog-buttons">
              <button type="button" class="army-dialog-btn cc-sidebar-btn cc-modal-cancel" data-act="cancel">${esc(T('CharCreate.cancel'))}</button>
              <button type="button" class="army-dialog-btn cc-sidebar-btn primary cc-modal-accept" data-act="save">${esc(ccT(onSaved ? 'CharCreate.custom.saveBegin' : 'CharCreate.custom.save'))}</button>
            </div>
          </div>`;
        const body = veil.querySelector(".cc-cs-body");
        if (body) body.scrollTop = keepScroll;
        Array.from(veil.querySelectorAll("input.cc-cs-text")).forEach((el) => {
          el.addEventListener("input", () => setText(el.getAttribute("data-text"), el.value));
        });
        paintCursor();
      };

      const setText = (path, value) => {
        const parts = path.split(".");
        if (parts.length === 1) draft[parts[0]] = value;
        else if (draft[parts[0]]) draft[parts[0]][parts[1]] = value;
      };

      // Every change goes back through the normaliser, so the sheet can never
      // hold a value the file could not.
      const commit = () => {
        draft = CCO.normalizeCustomScenario(draft);
        error = "";
        render();
      };

      const pick = (title, options, value, onPick) => {
        if (!window.CCPick) return;
        window.CCPick.open({
          title, options, value,
          container,
          onPick: (v) => { onPick(v); SoundManager.playCursor(); commit(); },
        });
      };

      const step = (field, delta) => {
        const [head, tail] = field.split(".");
        if (head === "item") {
          const row = draft.items[Number(tail)];
          if (row) row.qty = Math.max(1, Math.min(L.qty || 999, row.qty + delta));
        } else if (head === "rep") {
          const row = draft.reputation[Number(tail)];
          if (row) row.value = Math.max(-100, Math.min(100, row.value + delta));
        } else if (tail) {
          draft[head][tail] = Math.max(0, (Number(draft[head][tail]) || 0) + delta);
        } else {
          draft[head] = Math.max(0, (Number(draft[head]) || 0) + delta);
        }
        SoundManager.playCursor();
        commit();
      };

      const factionOptions = (noneLabel) => {
        const opts = CCO.customFactionOptions().map((f) => ({ value: f.id, label: f.name }));
        return noneLabel ? [{ value: -1, label: noneLabel }].concat(opts) : opts;
      };

      const itemOptions = (kind) => {
        const db = dbOf(kind) || [];
        const out = [];
        for (let id = 1; id < db.length; id++) {
          const data = db[id];
          if (!data || !data.name || !data.name.trim() || data.name.trim().startsWith("<--")) continue;
          out.push({
            value: id, label: window.CCDbName(data),
            icon: `<span class="cc-rpg-icon" style="${this._ccIconStyle(data.iconIndex)}"></span>`,
            hint: data.price ? this._formatGoldToEuros(data.price) : "",
          });
        }
        return out;
      };

      const save = () => {
        draft = CCO.normalizeCustomScenario(draft);
        const result = CCO.saveCustomScenario(draft, file);
        if (!result || !result.ok) {
          SoundManager.playBuzzer();
          error = ccT('CharCreate.custom.saveFailed');
          render();
          return;
        }
        file = result.file;
        CCO.setActiveCustomScenario(result.scenario, result.file);
        this._ccCustomList(true);
        if (window.ParchmentToast) {
          window.ParchmentToast.show(ccTp('CharCreate.custom.saved', { name: result.scenario.name }), { severity: "success" }); // i18n-ignore: severity id
        }
        close();
        if (onSaved) onSaved();
        else this._repaintCustomBrief();
      };

      const act = (el) => {
        const action = el.getAttribute("data-act");
        const d = draft;
        switch (action) {
          case "cancel": SoundManager.playCancel(); close(); return;
          case "save": save(); return;
          case "step": step(el.getAttribute("data-field"), Number(el.getAttribute("data-delta")) || 0); return;
          case "start":
            pick(ccT('CharCreate.custom.where'), CCO.CUSTOM_START_KINDS.map((k) => ({ value: k, label: ccT(`CharCreate.custom.start.${k}`) })),
              d.start.kind, (v) => { d.start.kind = v; if (v !== "town") d.mayor.town = ""; }); // i18n-ignore: start kind
            return;
          case "startTown":
            pick(ccT('CharCreate.custom.town'), CCO.customPlaceOptions().map((n) => ({ value: n, label: this._ccPlaceLabel(n) })),
              d.start.town, (v) => { d.start.town = v; });
            return;
          case "mayor":
            pick(ccT('CharCreate.custom.mayor'), [{ value: "", label: ccT('CharCreate.custom.nobody') }]
              .concat(CCO.customTownOptions().map((n) => ({ value: n, label: this._ccPlaceLabel(n) }))),
              d.mayor.town, (v) => { d.mayor.town = v; if (v) { d.start.kind = "town"; d.start.town = v; } }); // i18n-ignore: start kind
            return;
          case "armyFaction":
            pick(ccT('CharCreate.custom.troopsFrom'), factionOptions(ccT('CharCreate.custom.mixed')), d.army.factionId, (v) => { d.army.factionId = Number(v); });
            return;
          case "allegianceKind":
            pick(ccT('CharCreate.custom.allegiance'), CCO.CUSTOM_ALLEGIANCE_KINDS.map((k) => ({ value: k, label: ccT(`CharCreate.custom.allegianceKind.${k}`) })),
              d.allegiance.kind, (v) => {
                d.allegiance.kind = v;
                const first = v === "faction" ? CCO.customFactionOptions()[0] : v === "hyperpower" ? CCO.customHyperpowerOptions()[0] : null; // i18n-ignore: allegiance kinds
                d.allegiance.id = first ? first.id : 0;
              });
            return;
          case "allegianceWhich": {
            const list = d.allegiance.kind === "hyperpower" ? CCO.customHyperpowerOptions() : CCO.customFactionOptions(); // i18n-ignore: allegiance kind
            pick(ccT('CharCreate.custom.allegianceWhich'), list.map((o) => ({ value: o.id, label: o.name })), d.allegiance.id, (v) => { d.allegiance.id = Number(v); });
            return;
          }
          case "partyMode":
            pick(ccT('CharCreate.custom.party'), CCO.CUSTOM_JOIN_MODES.map((k) => ({ value: k, label: ccT(`CharCreate.custom.mode.${k}`) })),
              d.politicalParty.mode, (v) => { d.politicalParty.mode = v; });
            return;
          case "creed":
            pick(ccT('CharCreate.custom.creed'), CCO.customCreedOptions().map((c) => ({ value: c.id, label: c.name })),
              d.politicalParty.ideologyId, (v) => { d.politicalParty.ideologyId = v; });
            return;
          case "factionMode":
            pick(ccT('CharCreate.custom.faction'), CCO.CUSTOM_JOIN_MODES.map((k) => ({ value: k, label: ccT(`CharCreate.custom.mode.${k}`) })),
              d.foundedFaction.mode, (v) => { d.foundedFaction.mode = v; });
            return;
          case "factionWhich":
            pick(ccT('CharCreate.custom.factionWhich'), CCO.customFoundedFactionOptions().map((r) => ({
              value: r.id, label: r.name, hint: r.founder || "",
            })), d.foundedFaction.id, (v) => {
              const rec = CCO.customFoundedFactionOptions().find((r) => r.id === v);
              d.foundedFaction.id = v;
              if (rec) d.foundedFaction.name = rec.name;
            });
            return;
          case "factionPatron":
            pick(ccT('CharCreate.custom.swornUnder'), factionOptions(ccT('CharCreate.custom.none')), d.foundedFaction.patronFactionId,
              (v) => { d.foundedFaction.patronFactionId = Number(v); });
            return;
          case "addItem": {
            const kind = el.getAttribute("data-kind") || "item"; // i18n-ignore: database kind
            const title = ccT(kind === "weapon" ? 'CharCreate.custom.addWeapon' : kind === "armor" ? 'CharCreate.custom.addArmor' : 'CharCreate.custom.addItem');
            pick(title, itemOptions(kind), null, (v) => { d.items.push({ kind, id: Number(v), qty: 1 }); });
            return;
          }
          case "removeItem": d.items.splice(Number(el.getAttribute("data-index")), 1); SoundManager.playCancel(); commit(); return;
          case "addRep":
            pick(ccT('CharCreate.custom.addStanding'), factionOptions(null).filter((o) => !d.reputation.some((r) => r.factionId === o.value)),
              null, (v) => { d.reputation.push({ factionId: Number(v), value: 25 }); });
            return;
          case "removeRep": d.reputation.splice(Number(el.getAttribute("data-index")), 1); SoundManager.playCancel(); commit(); return;
          case "perk": {
            const perk = el.getAttribute("data-perk");
            const at = d.perks.indexOf(perk);
            if (at >= 0) d.perks.splice(at, 1); else d.perks.push(perk);
            SoundManager.playCursor();
            commit();
            return;
          }
          default: return;
        }
      };

      veil.addEventListener("click", (e) => {
        const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
        if (el && veil.contains(el)) { act(el); return; }
        if (e.target === veil) { SoundManager.playCancel(); close(); }
      });

      // Escape closes the sheet, unless a pick is open over it (the pick
      // answers its own Escape).
      const onKey = (e) => {
        if (window.CCPick && window.CCPick.isOpen()) return;
        if (e.key === "Escape") { e.stopPropagation(); SoundManager.playCancel(); close(); }
      };
      document.addEventListener("keydown", onKey, true);

      // The pad's cursor: every button on the sheet, in reading order, walked
      // by the sheet's own state (CharacterCreationRoster, _ccModalPollInput).
      const buttons = () => Array.from(veil.querySelectorAll("button[data-act]"));
      const paintCursor = () => {
        const st = this._ccModalState;
        if (!st || st.veil !== veil) return;
        const list = buttons();
        if (st.index >= list.length) st.index = list.length - 1;
        list.forEach((b, i) => b.classList.toggle("cc-nav-focus", i === st.index));
        const cur = list[st.index];
        if (cur && cur.scrollIntoView && st.padMoved) cur.scrollIntoView({ block: "nearest" });
      };
      this._ccModalState = {
        veil, buttons, index: 0, close,
        press: () => {
          const st = this._ccModalState;
          const cur = buttons()[st ? st.index : -1];
          if (cur) act(cur);
        },
        paint: () => { if (this._ccModalState) this._ccModalState.padMoved = true; paintCursor(); },
      };
      render();
      const nameInput = veil.querySelector("input.cc-cs-text");
      const nav = window.CCNav;
      if (nameInput && nameInput.focus && !(nav && nav.padInHand && nav.padInHand())) nameInput.focus();
    }

    onReturnToPartyDossier() {
      Scene_CharacterCreation._isScenarioMode = false;
      // Simple mode has one page per character and the class board is not one
      // of them any more, so the party is returned to on the sheet itself.
      this._step = (Scene_CharacterCreation.isSimpleMode() && !Scene_CharacterCreation._storyMode)
        ? STEP.BIO
        : STEP.CLASS;
      SoundManager.playCancel();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }


    _startingInventoryEntries() {
      const entries = [];
      for (const item of $gameParty.allItems()) {
        if (!item || !item.name) continue;
        entries.push({ item, qty: $gameParty.numItems(item), name: window.CCDbName(item), note: "" });
      }
      for (const member of $gameParty.members()) {
        for (const gear of member.equips()) {
          if (!gear || !gear.name) continue;
          entries.push({ item: gear, qty: 1, name: window.CCDbName(gear), note: member.name() });
        }
      }
      return entries;
    }

    // The inventory card that closes the party panel, under the last slot.
    _startingInventoryHtml(entries) {
      const title = T('CharCreate.startingInventory');
      if (!entries.length) {
        return `
          <div class="cc-party-card">
            <div class="cc-party-card-header">
              <div class="cc-party-card-name">${title}</div>
            </div>
            <div class="cc-party-card-body">
              <div class="cc-party-card-vacant-text">${T('CharCreate.nothingYet')}</div>
            </div>
          </div>
        `;
      }

      const chips = entries.map((e) => {
        const worn = e.note
          ? `<span class="cc-inv-worn">${T('CharCreate.wornBy')} ${e.note}</span>`
          : "";
        const count = e.qty > 1 ? `<span class="cc-inv-qty">x${e.qty}</span>` : "";
        return `
          <div class="cc-inv-chip">
            <span class="cc-rpg-icon" style="${this._ccIconStyle(e.item.iconIndex, 22)}"></span>
            <span class="cc-inv-name">${e.name}</span>
            ${count}
            ${worn}
          </div>
        `;
      }).join("");

      return `
        <div class="cc-party-card">
          <div class="cc-party-card-header">
            <div class="cc-party-card-name">${title}</div>
            <div class="cc-party-card-class">${entries.length} ${T('CharCreate.entries')}</div>
          </div>
          <div class="cc-party-card-body">
            <div class="cc-inv-list">${chips}</div>
          </div>
        </div>
      `;
    }

    // Generate the NPC-system lore (society profile + historical backstory) for
    // a finalized actor so it can be shown behind the party card and browsed
    // later in the Party section of the NPC wiki (openForActor). Called only
    // when a member's signature changes (see _wizardPartyPanelHtml), never on a
    // plain cursor move.
  }

  for (const key of Object.getOwnPropertyNames(CCDossierPages.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Scene_CharacterCreation.prototype, key,
      Object.getOwnPropertyDescriptor(CCDossierPages.prototype, key)
    );
  }

  // The same hover card, for everybody else. The wizard raises these plates
  // through SceneManager._scene, which only answers while the wizard is the
  // scene on screen; any other panel that lists a skill, a trait or a piece of
  // gear (the wiki's character sheets) wants the very same card, so the three
  // handlers are published on a host of their own. Nothing in them reads the
  // wizard's state: they resolve the record and write the plate.
  const _host = Object.create(Scene_CharacterCreation.prototype);
  window.CCTooltip = {
    // type: "weapon" | "armor" | "skill" | "item" | "trait"
    showItem(event, type, id, qty) { _host.onItemHover(event, type, id, qty); },
    showStat(event, statKey) { _host.onStatHover(event, statKey); },
    hide() { _host.onItemLeave(); },
    // The attributes a tag wears to raise and drop the card.
    attrs(type, id, qty) {
      return `onmouseenter="window.CCTooltip&&window.CCTooltip.showItem(event,'${type}',${Number(id)},${qty == null ? 1 : Number(qty)})"` +
        ` onmouseleave="window.CCTooltip&&window.CCTooltip.hide()"`;
    },
  };
})();
