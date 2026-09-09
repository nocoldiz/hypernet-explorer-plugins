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
      return ccT('CharCreate.traitTypeLabel', 'TRAIT');
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
      const desc = window.CCDbDesc(item) || ccT('CharCreate.standardIssueGear', "Standard issue item or gear.");
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
        ${price ? `<div class="cc-item-tooltip-price">${ccT('CharCreate.estimatedValue', 'Estimated Value')}: ${price}</div>` : ""}
      `;

      this._ccPositionTooltip(event, tooltip);
    }

    onItemLeave() {
      const tooltip = document.getElementById("cc-item-tooltip");
      window.CCPanel.hide(tooltip);
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

      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !actor._isPresetActor && !this._presetWindow && !!(actor._isCreatureActor || $gameSwitches.value(77 + currentMemberIndex));
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
        ? (window.WorkSystem && window.WorkSystem.jobName ? window.WorkSystem.jobName(identityJob) : (identityJob.name || `Job #${identityJob.id}`))
        : ccT('CharCreate.bio.joblessShort', 'Jobless');

      const startingGold = CC_BASE_START_GOLD + (typeof classStartingMoney === 'function' ? classStartingMoney(actor._classId) : 0) + (typeof traitStartingMoney === 'function' ? traitStartingMoney(actor) : 0) + (typeof wealthStartingMoney === 'function' ? wealthStartingMoney(actor) : 0);
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
              <div class="cc-compact-avatar-wrap" title="${isLocked ? ccT('CharCreate.spriteLockedHint', 'Preset sprite (locked)') : ccT('CharCreate.spriteClickHint', 'Sprite: click to open the grid selector')}" onclick="${isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenSpriteGallery()'}">
                <div class="cc-compact-avatar" style="${avatarStyle}"></div>
              </div>
            ` : ''}
            <div class="cc-col cc-col-gap-1 cc-col-grow">
              <div class="cc-row-inline cc-row-gap-tight">
                <input type="text" class="cc-bio-select cc-name-input ${isLocked ? 'cc-locked' : ''}" value="${actor.name() || ccT('CharCreate.defaultName', 'Hero')}" oninput="SceneManager._scene.onNameChange(this.value)" placeholder="${ccT('CharCreate.defaultName', 'Hero')}" ${isLocked ? 'readonly disabled' : ''} />
                ${!isLocked ? `
                  <button class="cc-profile-open-btn cc-profile-open-btn--icon" onclick="SceneManager._scene.onRandomizeNameClick()" title="${ccT('CharCreate.randomize', 'Randomize Name')}">
                    ${this._ccIconHtml(83, 16)}
                  </button>
                ` : ''}
              </div>
              <div class="cc-row-inline cc-identity-line">
                <span class="cc-identity-name">${jobName} ${className}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // 2. Full-Width Portrait Showcase Card (2D Bust for Humanoid, 3D Archetype Selector + Studio for Creature)
      let profileBoxHtml = "";
      if (!isPetActive) {
        if (isCreature) {
          // The archetypes a creature can actually BE, named the way the rest of
          // the game names them. This used to list Battler3D's ~600 raw
          // lowercase structure keys ("bigcat", "chromaticmanticore"), none of
          // which the health side could resolve back to a body.
          const currentArch = actorArchetypeKey(actor) || "Beast"; // i18n-ignore: Archetypes.json key
          const secondArch = actorSecondaryArchetypeKey(actor) || "";

          // A creature is its model, so the card names the model it already has
          // (settled from its archetype the moment it was made) and opens the
          // sculptor. No 2D bust is ever borrowed for a monster.
          const modelLabel = secondArch
            ? `${archetypeDisplayName(currentArch)} / ${archetypeDisplayName(secondArch)}`
            : archetypeDisplayName(currentArch);

          // The primary/secondary archetype pickers live on the Bio tab now,
          // alongside the rest of who the creature is. The sidebar keeps only
          // the model preview and the shortcut into the sculptor.
          profileBoxHtml = `
            <div class="cc-compact-portrait-card cc-col cc-col-gap-2">
              <div class="cc-compact-bust-full empty cc3d-live-portrait cc-clip" title="${modelLabel}" onclick="SceneManager._scene.onOpenCreature3DStudio()">
                <div class="cc3d-live-portrait-fallback cc-col cc-col-gap-2 cc-fill-center"></div>
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
            ? ccT('CharCreate.bustLockedHint', 'Preset portrait (locked)')
            : ccT('CharCreate.bustClickHint', 'Portrait: click to choose a bust');
          const bustClick = isLocked ? 'SoundManager.playBuzzer()' : 'SceneManager._scene.onOpenBustGallery()';

          profileBoxHtml = `
            <div class="cc-compact-portrait-card">
              ${bustUrl ? `
                <div class="cc-compact-bust-full ${isLocked ? 'locked' : ''}" title="${bustTitle}" onclick="${bustClick}" style="--cc-bust:${window.CCArt.url(bustUrl)}"></div>
              ` : `
                <div class="cc-compact-bust-full empty ${isLocked ? 'locked' : ''}" title="${bustTitle}" onclick="${bustClick}">
                  <div class="cc-col cc-col-gap-2 cc-fill-center">
                    ${this._ccIconHtml(224, 28)}
                    <span class="cc-portrait-caption cc-portrait-caption--empty">${ccT('CharCreate.noBustSelected', 'No portrait chosen')}</span>
                  </div>
                </div>
              `}
              ${isLocked ? `
                <div class="cc-compact-portrait-controls">
                  <div class="cc-portrait-footnote">
                    ${this._ccIconHtml(195, 14)} <span>${ccT('CharCreate.presetLocked', 'Preset')}</span>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }
      }

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

      const moneyRowHtml = this._ccLoadoutRowHtml(
        208,
        ccT('CharCreate.startingFunds', 'Starting Funds'),
        startingMoneyFormatted,
        { nameColor: 'var(--text-primary-hover)', valueColor: 'var(--text-cost-ok)' }
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
      const randomizeBtnsHtml = Scene_CharacterCreation._storyMode ? '' : `
            <button class="cc-compact-btn" onclick="SceneManager._scene.onQuickRandomizeMember()">${ccT('CharCreate.randomizeMember', 'Randomize Member')}</button>
            <button class="cc-compact-btn" onclick="SceneManager._scene.createTotalRandomPartyAll()">${ccT('CharCreate.randomizeParty', 'Randomize Party')}</button>`;

      return `
        <div class="cc-compact-sidebar">
          <div class="cc-compact-sidebar-body">
            ${identityHeaderHtml}
            ${profileBoxHtml}
            ${statsHtml}
            ${traitsSectionHtml}
            ${skillsSectionHtml}
            ${startingItemsSectionHtml}
          </div>
          <div class="cc-compact-actions cc-col cc-col-gap-2">
            ${randomizeBtnsHtml}
            <button class="cc-compact-btn primary" onclick="SceneManager._scene.onProceedToScenario()">${this._partyConfirmLabel()}</button>
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
      const genderName = actor.genderName ? actor.genderName() : ($gameVariables.value(38 + (Scene_CharacterCreation._currentPartyMemberIndex || 0)) === 0 ? "Male ♂" : "Female ♀");
      const startingGold = CC_BASE_START_GOLD + (typeof classStartingMoney === 'function' ? classStartingMoney(actor._classId) : 0) + (typeof traitStartingMoney === 'function' ? traitStartingMoney(actor) : 0) + (typeof wealthStartingMoney === 'function' ? wealthStartingMoney(actor) : 0);
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
      `).join("") || `<span class="cc-note-faint">${ccT('CharCreate.noPersonalEquipment', 'No personal equipment')}</span>`;

      // Traits badges
      const traitsBadges = selectedTraitObjects(actor).map(tr => {
        const name = (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id;
        return `<span class="cc-element-badge cc-element-badge--tight" ${this._ccHoverAttrs("trait", tr.id)}>${name}</span>`;
      }).join(" ");

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
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('CharCreate.name', 'Name')}:</span><span class="cc-dossier-value">${actor.name()}</span></div>
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('ClassSelect.vocation', 'Vocation')}:</span><span class="cc-dossier-value">${className}</span></div>
            <div class="cc-dossier-row cc-dossier-row--lead"><span class="cc-dossier-label">${ccT('CharCreate.gender', 'Gender')}:</span><span class="cc-dossier-value">${genderName}</span></div>
          </div>

          <div class="cc-gap-below">
            <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.coreAttributes', 'Core Attributes')}</span>
            <div class="cc-stat-grid">${statBoxes}</div>
          </div>

          <div class="cc-dossier-card cc-card-padded cc-gap-below cc-col cc-col-grow-scroll">
            <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.personalInventory', 'Personal Inventory & Gear')}</span>
            <div class="cc-col cc-col-gap-hair cc-scroll-pane">
              ${itemsRows}
            </div>
          </div>

          ${traitsBadges ? `
            <div class="cc-gap-above-hair">
              <span class="cc-dossier-label cc-section-label">${ccT('CharCreate.traits', 'Traits')}</span>
              <div class="cc-chip-row">${traitsBadges}</div>
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
          ${section(ccT('Traits.tabDiseases', 'Diseases'), illnessBadges ? `<div class="cc-badge-wrap cc-badge-grid-3">${illnessBadges}</div>` : "")}
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

      // The party's shared bag, apart from the scenario's own exclusive kit:
      // what the party is already carrying going into the choice above.
      const partyInventory = $gameParty.allItems().filter((it) => it && it.name).map((it) => {
        const type = DataManager.isWeapon(it) ? "weapon" : DataManager.isArmor(it) ? "armor" : "item";
        return { name: window.CCDbName(it), iconIndex: it.iconIndex || 176, qty: $gameParty.numItems(it), type, id: it.id };
      });

      // Scenarios are divided into suggested scenarios and other scenarios
      const suggestedSymbols = ["origin_train", "origin_camper", "origin_space", "origin_stranded", "origin_lot", "origin_dungeon", "origin_ceo"];
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
          <div class="cc-scenario-group-title">${ccT('CharCreate.suggestedScenarios', 'Suggested Scenarios')}</div>
          ${suggestedEntries.map((e) => renderCard(e.choice, e.index)).join("")}
        ` : ''}
        ${otherEntries.length ? `
          <div class="cc-scenario-group-title">${ccT('CharCreate.otherScenarios', 'Other Scenarios')}</div>
          ${otherEntries.map((e) => renderCard(e.choice, e.index)).join("")}
        ` : ''}
      `;

      return `
        <div class="cc-scenario-dossier">
          <div class="cc-page cc-scenario-list">
            <div class="cc-scenario-list-head">
              <h2 class="cc-subheader">${ccT('CharCreate.scenarioPickPrompt', 'Pick the scenario this party starts in')}</h2>
              <span class="ts-count">${(stepData.choices || []).length}</span>
            </div>
            <div class="cc-select-grid cc-scenario-grid">
              ${scenarioSectionsHtml}
            </div>
            <div class="cc-scenario-list-actions">
              <button class="cc-compact-btn primary cc-scenario-embark" onclick="SceneManager._scene.onFinishPartyCreation()">${ccT('CharCreate.embark', "Embark")}</button>
              ${chaos ? `
              <button class="cc-compact-btn cc-scenario-reroll" onclick="SceneManager._scene.onChaosRerollParty()">
                ${this._ccIconHtml(136, 16)} <span>${ccT('CharCreate.randomizeParty', 'Randomize Party')}</span>
              </button>` : `
              <button class="cc-compact-btn cc-scenario-back" onclick="SceneManager._scene.onReturnToPartyDossier()">
                ${this._ccIconHtml(82, 16)} <span>${ccT('CharCreate.returnToParty', 'Return to Party Configuration')}</span>
              </button>`}
            </div>
          </div>

          <div class="cc-page cc-scenario-brief">
            <div class="cc-scenario-brief-head">
              <h2 class="cc-header-gothic">${originChoice.name || ""}</h2>
              <div class="cc-money-badge">${this._ccIconHtml(208, 16)} <span>${this._formatGoldToEuros(totalGold)}</span></div>
            </div>
            <p class="cc-class-quote">${this.cleanText(originChoice.description || "")}</p>

            <div class="cc-scenario-brief-body">
              <div class="cc-dossier-card cc-class-section">
                <h3 class="cc-subheader">
                  <span>${ccT('CharCreate.scenarioExclusiveItems', 'Exclusive kit')}</span>
                  ${goldBonus ? `<span class="cc-scenario-bonus">+${this._formatGoldToEuros(goldBonus)}</span>` : ''}
                </h3>
                ${exclusive.length
                  ? `<div class="cc-compact-loadout-grid cc-loadout-open cc-loadout-grid-cols">${exclusive.map((e) => this._scenarioItemRowHtml(e)).join("")}</div>`
                  : `<span class="cc-class-none">${ccT('CharCreate.scenarioNoExclusiveItems', 'No exclusive kit for this scenario')}</span>`}
              </div>

              <div class="cc-dossier-card cc-class-section">
                <h3 class="cc-subheader">
                  <span>${ccT('CharCreate.scenarioPartyInventory', 'Party inventory')}</span>
                  ${partyInventory.length ? `<span class="ts-count">${partyInventory.length}</span>` : ''}
                </h3>
                ${partyInventory.length
                  ? `<div class="cc-compact-loadout-grid cc-loadout-open cc-loadout-grid-cols-3">${partyInventory.map((e) => this._scenarioItemRowHtml(e)).join("")}</div>`
                  : `<span class="cc-class-none">${ccT('CharCreate.scenarioNoPartyInventory', 'The party is not carrying anything yet')}</span>`}
              </div>
            </div>

          </div>

          <div class="cc-page cc-scenario-roster-col">
            <h3 class="cc-subheader cc-scenario-roster-head">
              <span>${ccT('CharCreate.scenarioRoster', 'Party dossiers')}</span>
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
        return ccT('CharCreate.beginAdventure', 'Begin Adventure');
      }
      return this._hasPresetInParty(false)
        ? ccT('CharCreate.startGame', 'Start Game')
        : ccT('CharCreate.confirmPartyScenario', 'Confirm Party & Scenario');
    }

    onProceedToScenario() {
      // The story mode asks for no scenario and no vehicle: Em's dossier says
      // where the party wakes up and The Beast is already parked outside, so
      // the button on her sheet ends creation.
      if (Scene_CharacterCreation._storyMode) {
        this.finishStoryModeCreation();
        return;
      }
      // If any party member is a preset character, skip scenario selection and finalize immediately!
      if (this._hasPresetInParty(false)) {
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
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onReturnToPartyDossier() {
      Scene_CharacterCreation._isScenarioMode = false;
      this._step = STEP.CLASS;
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
})();
