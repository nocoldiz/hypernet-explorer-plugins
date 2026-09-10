/*:
 * @target MZ
 * @plugindesc The wizard's trait, specialization, bio and companion pages, plus the member randomizer
 * @author Omni-Lex
 * @orderAfter CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js. These are the pages of the creation
 * spread that draw a board of cards and a facing detail page:
 * 
 *   - Traits: the trait bank and the illnesses a character starts carrying,
 *   - Specializations: the 12-point budget and its +/- board,
 *   - Bio: gender, reproduction, age, wealth, morality, blood, ideology,
 *   - Companion: the pet catalogue and its virtualised grid,
 *   - the randomizer that fills a whole member (or the whole party) in.
 * 
 * Every method here was a method of Scene_CharacterCreation and still is:
 * the class body below is copied onto its prototype at load.
 *
 * DO NOT call this plugin directly.
 */

(() => {
  "use strict";

  const Scene_CharacterCreation = window.Scene_CharacterCreation;
  if (!Scene_CharacterCreation) return;

  const {
    ccT,
    ccTp,
    ccStatLabel,
    ccStatLabels,
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
  } = window.CCKit;

  // The same plugins the orchestrator leans on, imported here for the pages
  // that were lifted out of it: the bio page writes the gender/reproduction
  // variables, and the randomizer dresses a member from scratch.
  const {
    applyTraitsToActor,
    VAR_PLAYER1_GENDER,
    VAR_PLAYER2_GENDER,
    VAR_PLAYER3_GENDER,
    VAR_PLAYER1_REPRODUCTIVE_TYPE,
    VAR_PLAYER2_REPRODUCTIVE_TYPE,
    VAR_PLAYER3_REPRODUCTIVE_TYPE,
  } = window.CharacterCreationUtils || {};
  const {
    equipRandomCompatibleWeapon,
    equipClassStartingArmor,
    giveClassStartingItems,
  } = window.StartingEquipment || {};
  const { markStepCompleted } = window.CharacterPresets || {};

  // The companion board's own "nobody" card. Not a monster and never in the
  // catalogue: picking it is picking to travel alone.
  const PET_NONE_ID = "none";

  // Written as a class body so the methods move onto the wizard exactly as
  // they were declared while they still lived inside it, accessors and all.
  class CCStepPages {
    _isTraitPickerStep() {
      return this._step === STEP.TRAITS;
    }

    // The illnesses a character can be created already carrying. They are not
    // traits and do not live in window.Health.Traits: the library dresses them
    // as cards so one grid draws both, and the trait plugin hands them over.
    _ccDiseaseCards() {
      const api = window.TraitPoints;
      if (!api || typeof api.diseaseCards !== "function") return [];
      if (!this._ccDiseaseCardCache || !this._ccDiseaseCardCache.length) {
        this._ccDiseaseCardCache = api.diseaseCards() || [];
      }
      return this._ccDiseaseCardCache;
    }

    // Every card the board can draw, whichever tab is open.
    _ccTraitBank() {
      return ((window.Health && window.Health.Traits) || []).concat(this._ccDiseaseCards());
    }

    // The card ids that are currently picked: bound traits plus, as card ids,
    // the illnesses the character already carries (those are kept as bare
    // disease ids on the actor, which is what the illness library wants).
    _ccPickedCardIds(actor) {
      const traits = selectedTraitIds(actor).map(String);
      const diseases = ((actor && actor._ccDiseases) || []).map((id) => "disease:" + id);
      return traits.concat(diseases);
    }

    _traitCategories() {
      return [
        { id: "all", label: ccT("CharCreate.filterAll", "All"), icon: 87 },
        { id: "genetic", label: ccT('Traits.tabGenetic', "Genetic"), icon: 292 },
        { id: "physical", label: ccT('Traits.tabPhysical', "Physical"), icon: 135 },
        { id: "mental", label: ccT('Traits.tabMental', "Mental"), icon: 183 },
        { id: "magical", label: ccT('Traits.tabMagical', "Magical"), icon: 165 },
        { id: "diseases", label: ccT('Traits.tabDiseases', "Diseases"), icon: 177 }
      ];
    }

    _traitPickerLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const traitBank = this._ccTraitBank();
      const selectedTraits = this._ccPickedCardIds(actor);
      const activeCategory = Scene_CharacterCreation._activeTraitCategory || "all";
      const categories = this._traitCategories();

      const railFocused = !!this._pageRailFocused;
      const tabsHtml = categories.map((cat) => {
        const isActive = activeCategory === cat.id;
        return `
          <div class="ts-tab ${isActive ? 'active' : ''} ${isActive && railFocused ? 'selected' : ''}" onclick="SceneManager._scene.onTraitCategorySelect('${cat.id}')">
            ${this._ccIconHtml(cat.icon, 16)} <span>${cat.label}</span>
          </div>
        `;
      }).join("");

      // Filter traits. "All" is all TRAITS: illnesses are free and have their
      // own tab, so mixing them into the priced list would only bury it.
      const filtered = activeCategory === "all"
        ? traitBank.filter((t) => !t.diseaseId)
        : activeCategory === "diseases"
          ? traitBank.filter((t) => !!t.diseaseId)
          : traitBank.filter((t) => !t.diseaseId && t.category === activeCategory);

      const cardsHtml = filtered.map((trait) => {
        const isSelected = selectedTraits.some((id) => String(id) === String(trait.id));
        const name = (trait.name && resolveTraitName(trait.name, trait.id)) || trait.id;
        // An illness costs nothing, so it carries no price tag.
        const cost = Number.isFinite(Number(trait.cost)) ? Number(trait.cost) : 1;
        const costHtml = trait.diseaseId
          ? ""
          : `<span class="trait-cost ${cost < 0 ? 'refund' : ''}">${cost < 0 ? `+${-cost}` : cost}</span>`;

        return `
          <div class="cc-card-option ${isSelected ? 'selected' : ''}"
               onclick="SceneManager._scene.onTraitToggle('${trait.id}')"
               onmouseenter="SceneManager._scene.onTraitCardHover('${trait.id}')">
            <span class="cc-rpg-icon" style="${this._ccIconStyle(trait.icon || 87, 20)}"></span>
            <div class="cc-option-title">${name}</div>
            ${costHtml}
          </div>
        `;
      }).join("");

      const emptyHtml = `<div class="cc-class-empty">${ccT('Traits.noneInCategory', 'Nothing here')}</div>`;

      return `
        <div class="cc-page cc-page-left ts-page cc-trait-board cc-page-column">
          <div class="ts-tab-row">${tabsHtml}</div>
          <div class="cc-select-grid cc-trait-grid">
            ${cardsHtml || emptyHtml}
          </div>
        </div>
      `;
    }

    _traitPickerRightHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const traitBank = this._ccTraitBank();
      const selectedTraits = this._ccPickedCardIds(actor);
      const hoveredId = Scene_CharacterCreation._hoveredTraitId || selectedTraits[0] || (traitBank[0] && traitBank[0].id);
      const hoveredTrait = traitBank.find((t) => String(t.id) === String(hoveredId)) || traitBank[0];

      // The purse used to head the card grid on the left page; it reads as the
      // sheet's running total, so it heads the sheet page instead. An illness
      // is not bought: it is something the character walks in already
      // carrying, so it never touches the purse.
      let spent = 0, refunded = 0;
      selectedTraits.forEach((id) => {
        const tr = traitBank.find((t) => String(t.id) === String(id));
        if (tr && !tr.diseaseId) {
          const cost = Number.isFinite(Number(tr.cost)) ? Number(tr.cost) : 1;
          if (cost >= 0) spent += cost;
          else refunded -= cost;
        }
      });
      const credit = Math.min(refunded, 6);
      const remaining = 10 + credit - spent;

      const purseHtml = `
        <div class="ts-purse ts-purse--sheet">
          <div class="ts-purse-cell spend">
            <span class="ts-purse-value">${spent}</span>
            <span class="ts-purse-label">${ccT('Traits.purseSpent', 'Spent')}</span>
          </div>
          <div class="ts-purse-cell refund">
            <span class="ts-purse-value">+${refunded}</span>
            <span class="ts-purse-label">${ccT('Traits.purseRefunds', 'Refunds')}</span>
          </div>
          <div class="ts-purse-cell ${remaining < 0 ? 'over' : ''}">
            <span class="ts-purse-value">${remaining}</span>
            <span class="ts-purse-label">${ccT('Traits.purseLeft', 'Remaining')}</span>
          </div>
        </div>
      `;

      // Details of hovered trait
      let detailHtml = "";
      if (hoveredTrait) {
        const name = hoveredTrait.diseaseId
          ? hoveredTrait.name
          : ((hoveredTrait.name && resolveTraitName(hoveredTrait.name, hoveredTrait.id)) || hoveredTrait.id);
        const desc = hoveredTrait.diseaseId
          ? (hoveredTrait.description || "")
          : ((hoveredTrait.description && resolveTraitDesc(hoveredTrait.description, hoveredTrait.id)) || "");
        const cost = Number.isFinite(Number(hoveredTrait.cost)) ? Number(hoveredTrait.cost) : 1;
        const costBadge = hoveredTrait.diseaseId
          ? `<span class="trait-cost refund">${ccT('Traits.tabDiseases', 'Diseases')}</span>`
          : cost < 0
            ? `<span class="trait-cost refund">+${-cost} ${ccT('Traits.refundWord', 'refund')}</span>`
            : `<span class="trait-cost">${cost} ${ccT('Traits.pts', 'pts')}</span>`;

        let statRows = "";
        if (hoveredTrait.positive) {
          statRows += Object.entries(hoveredTrait.positive)
            .map(([k, v]) => `<span class="cc-element-badge cc-badge-good">${window.TraitParams.text(k, v)}</span>`)
            .join(" ");
        }
        if (hoveredTrait.negative) {
          statRows += Object.entries(hoveredTrait.negative)
            .map(([k, v]) => `<span class="cc-element-badge cc-badge-bad">${window.TraitParams.text(k, v)}</span>`)
            .join(" ");
        }

        let extraGrants = "";
        if (hoveredTrait.skills && hoveredTrait.skills.length > 0 && typeof $dataSkills !== "undefined") {
          const sNames = hoveredTrait.skills.map((sid) => ($dataSkills[sid] ? $dataSkills[sid].name : `Skill #${sid}`)).join(", ");
          extraGrants += `<div class="cc-grant-note"><strong>${ccT('Traits.grantsSkills', 'Skills')}:</strong> ${sNames}</div>`;
        }

        detailHtml = `
          <div class="cc-dossier-card ts-detail-card cc-gap-below">
            <div class="ts-detail-head">
              <span class="cc-rpg-icon" style="${this._ccIconStyle(hoveredTrait.icon || 87, 26)}"></span>
              <span class="ts-detail-label">${name}</span>
              ${costBadge}
            </div>
            <div class="ts-detail-desc">${desc}</div>
            ${statRows ? `<div class="ts-badge-row cc-row-start cc-gap-above-tight">${statRows}</div>` : ''}
            ${extraGrants}
          </div>
        `;
      }

      // Selected chips: traits carry their price, illnesses carry none.
      const chipFor = (id) => {
        const tr = traitBank.find((t) => String(t.id) === String(id));
        if (!tr) return "";
        const name = tr.diseaseId ? tr.name : ((tr.name && resolveTraitName(tr.name, tr.id)) || id);
        const cost = Number.isFinite(Number(tr.cost)) ? Number(tr.cost) : 1;
        const badge = tr.diseaseId
          ? ""
          : `<span class="trait-cost ${cost < 0 ? 'refund' : ''}">${cost < 0 ? `+${-cost}` : cost}</span>`;
        return `
          <div class="cc-picked-chip ${tr.diseaseId ? 'illness' : ''}" onclick="SceneManager._scene.onTraitToggle('${tr.id}')">
            <span class="cc-rpg-icon" style="${this._ccIconStyle(tr.icon || 87, 18)}"></span>
            <span>${name}</span>
            ${badge}
            <span class="cc-slot-remove">&#10005;</span>
          </div>
        `;
      };
      const traitOnlyIds = selectedTraits.filter((id) => String(id).indexOf("disease:") !== 0);
      const diseaseIds = selectedTraits.filter((id) => String(id).indexOf("disease:") === 0);
      const pickedChips = traitOnlyIds.map(chipFor).filter(Boolean).join("");
      const diseaseChips = diseaseIds.map(chipFor).filter(Boolean).join("");

      // Calculate total bonuses
      const totals = { hp: 0, mp: 0, atk: 0, def: 0, mat: 0, mdf: 0, agi: 0, luk: 0 };
      selectedTraits.forEach((id) => {
        const tr = traitBank.find((t) => String(t.id) === String(id));
        if (tr) {
          Object.keys(tr.positive || {}).forEach((k) => { if (totals[k] !== undefined) totals[k] += tr.positive[k]; });
          Object.keys(tr.negative || {}).forEach((k) => { if (totals[k] !== undefined) totals[k] += tr.negative[k]; });
        }
      });
      const bonusBadges = Object.entries(totals)
        .filter(([k, v]) => v !== 0)
        .map(([k, v]) => `<span class="cc-element-badge ${v > 0 ? 'cc-badge-good' : 'cc-badge-bad'}">${window.TraitParams.text(k, v)}</span>`)
        .join(" ") || `<span class="cc-note-faint">${ccT('CharCreate.noDefiningTraits', 'No trait modifiers')}</span>`;

      const totalBonusesTitle = (ccT('Traits.totalBonuses', 'Total Modifiers')).replace(/[:\s]+$/, '');

      return `
        <div class="cc-page cc-page-right ts-page cc-trait-detail cc-page-column">
          <div class="ts-sheet-head">
            ${purseHtml}
            <div class="ts-sheet-actions">
              <button class="cc-profile-open-btn" onclick="SceneManager._scene.onTraitResetForCurrentActor()">${ccT('Traits.resetTraits', 'Reset')}</button>
              <button class="cc-profile-open-btn" onclick="SceneManager._scene.onRandomizeTraitsForCurrentActor()">${ccT('CharCreate.randomize', 'Randomize')}</button>
            </div>
          </div>

          ${detailHtml}

          <div class="ts-picked-block">
            <h3 class="cc-subheader ts-section-head">
              <span>${ccT('Traits.selectedTraitsLabel', 'Selected Traits')}</span>
              <span class="ts-count">${traitOnlyIds.length}/8</span>
            </h3>
            <div class="cc-picked-row">
              ${pickedChips || `<span class="cc-picked-empty">${ccT('CharCreate.noDefiningTraits', 'None selected')}</span>`}
            </div>
          </div>

          ${diseaseChips ? `
            <div class="ts-picked-block">
              <h3 class="cc-subheader ts-section-head">
                <span>${ccT('Traits.tabDiseases', 'Diseases')}</span>
                <span class="ts-count">${diseaseIds.length}</span>
              </h3>
              <div class="cc-picked-row">${diseaseChips}</div>
            </div>
          ` : ''}

          <div class="cc-dossier-card ts-summary">
            <div class="ts-summary-row">
              <span class="cc-dossier-label">${totalBonusesTitle}:</span>
              <div class="ts-badge-row cc-row-start">${bonusBadges}</div>
            </div>
          </div>
        </div>
      `;
    }

    onTraitCategorySelect(category) {
      Scene_CharacterCreation._activeTraitCategory = category;
      SoundManager.playCursor();
      const container = this._dndContainer;
      if (container) {
        const leftPage = container.querySelector(".cc-page-left");
        if (leftPage) {
          this._ccSwapPage(leftPage, this._traitPickerLeftHtml());
          return;
        }
      }
      this.refreshUIOverlayDOM();
    }

    onTraitCardHover(traitId) {
      if (String(Scene_CharacterCreation._hoveredTraitId) === String(traitId)) return;
      Scene_CharacterCreation._hoveredTraitId = traitId;
      const rightPage = this._dndContainer && this._dndContainer.querySelector(".cc-page-right");
      if (rightPage) {
        this._ccSwapPage(rightPage, this._traitPickerRightHtml());
      }
    }

    onTraitToggle(traitId) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (!actor._selectedTraits) actor._selectedTraits = [];
      const traitBank = this._ccTraitBank();
      const trait = traitBank.find((t) => String(t.id) === String(traitId));
      if (!trait) return;

      // An illness is not bought and does not count against the eight picks:
      // it is handed straight to the illness library, which owns whatever it
      // grants. Nothing on this path touches the trait purse.
      if (trait.diseaseId) {
        this._toggleStartingDisease(actor, trait);
        this._refreshTraitBoard();
        return;
      }

      const picked = selectedTraitIds(actor);
      const idx = picked.findIndex((id) => String(id) === String(trait.id));
      if (idx >= 0) {
        picked.splice(idx, 1);
        SoundManager.playCancel();
      } else {
        const selectedObjects = picked
          .map((id) => traitBank.find((t) => String(t.id) === String(id)))
          .filter(Boolean);
        const cost = Number.isFinite(Number(trait.cost)) ? Number(trait.cost) : 1;
        let spent = 0, refunded = 0;
        selectedObjects.forEach((t) => {
          const c = Number.isFinite(Number(t.cost)) ? Number(t.cost) : 1;
          if (c >= 0) spent += c;
          else refunded -= c;
        });
        const credit = Math.min(refunded, 6);
        const remaining = 10 + credit - spent;
        if (selectedObjects.length >= 8) {
          SoundManager.playBuzzer();
          return;
        }
        if (cost < 0 && (refunded - cost > 6)) {
          SoundManager.playBuzzer();
          return;
        }
        if (cost >= 0 && cost > remaining) {
          SoundManager.playBuzzer();
          return;
        }
        // Check incompatibility
        const incompatible = selectedObjects.some((bound) =>
          (trait.incompatible || []).some((incId) => String(incId) === String(bound.id)) ||
          (bound.incompatible || []).some((incId) => String(incId) === String(trait.id))
        );
        if (incompatible) {
          SoundManager.playBuzzer();
          return;
        }
        picked.push(trait.id);
      }

      this._ccApplyTraitIds(actor, picked);
      this._refreshTraitBoard();
    }

    // Writes a picked list back onto the member and re-applies what it grants.
    // The appliers all end by storing the whole trait objects, so the list is
    // never assumed to still be ids after this: every read goes back through
    // selectedTraitIds / selectedTraitObjects.
    _ccApplyTraitIds(actor, ids) {
      actor._selectedTraits = ids.slice();
      if (typeof applyTraitsToActor === 'function') {
        applyTraitsToActor(actor, ids);
      } else if (window.Scene_TraitSelector && typeof window.Scene_TraitSelector.prototype.applyTraitsByIds === 'function') {
        window.Scene_TraitSelector.prototype.applyTraitsByIds(ids, actor.actorId());
      }
    }

    // Puts the whole build down: every trait and every illness chosen here goes
    // back, and what they granted goes back with them, so the purse reads full
    // again and the member starts the step from nothing.
    onTraitResetForCurrentActor() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const hadSomething = selectedTraitIds(actor).length > 0 || ((actor._ccDiseases || []).length > 0);
      if (!hadSomething) {
        SoundManager.playBuzzer();
        return;
      }

      const TP = window.TraitPoints;
      if (TP && TP.revertGrants) TP.revertGrants(actor, actor._selectedTraits);
      actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
      this._ccApplyTraitIds(actor, []);
      actor._selectedTraits = [];

      const api = window.DiseaseSystem;
      ((actor._ccDiseases || []).slice()).forEach((id) => {
        if (api && api.cureActor) api.cureActor(actor, id);
      });
      actor._ccDiseases = [];

      if (actor.refresh) actor.refresh();
      SoundManager.playCancel();
      this._refreshTraitBoard();
    }

    // Both pages of the trait spread plus the dossier sidebar, redrawn from the
    // actor as it stands now.
    _refreshTraitBoard() {
      const container = this._dndContainer;
      if (!container) { this.refreshUIOverlayDOM(); return; }
      this._ccSwapPage(container.querySelector(".cc-page-left"), this._traitPickerLeftHtml());
      this._ccSwapPage(container.querySelector(".cc-page-right"), this._traitPickerRightHtml());
      const sidebarSlot = container.querySelector(".cc-sidebar-slot");
      if (sidebarSlot) sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
      this._refreshTopFolderTabs();
    }

    // Picks up or puts down an illness the character starts the game with. The
    // library owns what it does; all that is kept here is which ones were
    // chosen at creation, so putting one down again can cure exactly that one.
    _toggleStartingDisease(actor, card) {
      if (!actor._ccDiseases) actor._ccDiseases = [];
      const api = window.DiseaseSystem;
      const at = actor._ccDiseases.indexOf(card.diseaseId);
      if (at >= 0) {
        actor._ccDiseases.splice(at, 1);
        if (api && api.cureActor) api.cureActor(actor, card.diseaseId);
        SoundManager.playCancel();
      } else {
        actor._ccDiseases.push(card.diseaseId);
        if (api && api.infectActor) {
          api.infectActor(actor, card.diseaseId, null, null, { silent: true, diagnosed: true });
        }
      }
    }

    onRandomizeTraitsForCurrentActor() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const targetActorId = (Scene_CharacterCreation._currentPartyMemberIndex || 0) + 1;
      if (window.randomizeTraitsForActor) {
        window.randomizeTraitsForActor(targetActorId);
      } else {
        const traitBank = (window.Health && window.Health.Traits) || [];
        const picked = [];
        const drawbacks = traitBank.filter((t) => (Number(t.cost) || 1) < 0 && t.category !== "genetic");
        const positives = traitBank.filter((t) => (Number(t.cost) || 1) >= 0 && t.category !== "genetic");
        if (drawbacks.length > 0) {
          picked.push(drawbacks[Math.floor(Math.random() * drawbacks.length)].id);
        }
        for (let i = 0; i < 2 && positives.length > 0; i++) {
          const p = positives[Math.floor(Math.random() * positives.length)];
          if (!picked.includes(p.id)) picked.push(p.id);
        }
        this._ccApplyTraitIds(actor, picked);
      }
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onTraitConfirm() {
      markStepCompleted(STEP.TRAITS);
      this.nextStep();
    }

    // ── Specializations Step Helpers & Handlers ──
    _isSpecsPickerStep() {
      return this._step === STEP.SPECIALIZATIONS;
    }

    // The story mode is played as a character who already lived: her
    // specializations are the record of that life, not a purse to spend. The
    // board is opened there to be read, so it lists only what she actually
    // stands above Untrained in and hands out no controls at all.
    _specsReadOnly() {
      return !!Scene_CharacterCreation._storyMode;
    }

    _specsCatalog() {
      if (window.Specializations && window.Specializations.ready && window.Specializations.list) {
        return window.Specializations.list;
      }
      // i18n-ignore-start: a mirror of Specialization.json, shown only when
      // window.Specializations has not loaded. The live path names every entry
      // through Specializations.displayName / categoryLabel.
      return [
        { id: 1, name: "Accounting", category: "Commerce", stat: "INT", description: "Keeping and interpreting financial ledgers and transaction records." },
        { id: 2, name: "Acrobatics", category: "Athletics", stat: "DEX", description: "Controlled tumbling, vaulting, and balance in motion." },
        { id: 3, name: "Acting", category: "Social", stat: "PSI", description: "Portraying characters convincingly for an audience." },
        { id: 10, name: "Algorithm Design", category: "Technology", stat: "INT", description: "Formulating computational steps for hypernet routines." },
        { id: 20, name: "Anatomy", category: "Medicine", stat: "INT", description: "Knowledge of physical structures and biological organs." },
        { id: 30, name: "Arcane Synthesis", category: "Arcana", stat: "INT", description: "Channeling raw mana into stable thaumaturgical constructs." },
        { id: 40, name: "Blacksmithing", category: "Crafting", stat: "STR", description: "Forging steel, alloys, and tempered blades." },
        { id: 50, name: "Brawling", category: "Combat", stat: "STR", description: "Close-quarters unarmed pugilism and dirty infighting." },
        { id: 60, name: "Cybernetics", category: "Technology", stat: "INT", description: "Maintaining and augmenting neural prosthetic cyberware." },
        { id: 70, name: "Marksmanship", category: "Combat", stat: "DEX", description: "Precision shooting with ballistic and projectile weaponry." },
        { id: 80, name: "Lockpicking", category: "Crime", stat: "DEX", description: "Bypassing tumblers, digital pins, and electronic security." },
        { id: 90, name: "Persuasion", category: "Social", stat: "PSI", description: "Influencing negotiations and securing favorable terms." },
        { id: 100, name: "Survival", category: "Survival", stat: "CON", description: "Foraging, navigation, and wilderness endurance." },
        { id: 110, name: "Culinary Arts", category: "Culinary", stat: "DEX", description: "Preparing nourishing and morale-boosting cuisine." },
      ];
    }

    _specsCategories() {
      if (window.Specializations && window.Specializations.ready && window.Specializations.categories) {
        return [SPEC_TAB_CURRENT, "All", ...window.Specializations.categories];
      }
      return [SPEC_TAB_CURRENT, "All", "Combat", "Technology", "Crafting", "Social", "Medicine", "Athletics", "Commerce", "Crime", "Arcana", "Survival", "Culinary"];
      // i18n-ignore-end
    }

    // The class and the traits a member walks in with already hand them a head
    // start in some specializations. Both tables live on the specialization
    // itself (Specialization.json "classStart" / "traitStart"), so the whole
    // grant is worked out from one context built once per redraw instead of
    // rummaging through the trait bank for every one of the 800 entries.
    _specGrantContext(actor) {
      if (!actor) return { className: null, slugs: [] };
      let cls = null;
      if (typeof $dataClasses !== "undefined" && $dataClasses && actor._classId) cls = $dataClasses[actor._classId];
      if (!cls && actor.currentClass) cls = actor.currentClass();
      const bank = (window.Health && window.Health.Traits) || [];
      const slugs = ((actor._selectedTraits) || []).map((entry) => {
        // The board keeps bound traits as ids, the older selector kept the
        // whole trait object. Either is read here.
        const trait = (entry && entry.name) ? entry : bank.find((t) => String(t.id) === String(entry));
        return (trait && trait.name) ? String(trait.name).split(".")[1] : null;
      }).filter(Boolean);
      return { className: cls ? cls.name : null, slugs };
    }

    // The head start itself, as a card rank (0 to 4). When the class and more
    // than one trait name the same specialization, the most generous of them
    // is the one that counts.
    _specGrantRankIn(ctx, spec) {
      if (!ctx || !spec) return 0;
      let best = 1;
      if (ctx.className && spec.classStart) {
        const lvl = spec.classStart[ctx.className] || 0;
        if (lvl > best) best = lvl;
      }
      if (spec.traitStart) {
        ctx.slugs.forEach((slug) => {
          const lvl = spec.traitStart[slug] || 0;
          if (lvl > best) best = lvl;
        });
      }
      return Math.max(0, Math.min(5, best) - 1);
    }

    _specGrantRank(actor, spec) {
      return this._specGrantRankIn(this._specGrantContext(actor), spec);
    }

    // What the card shows: the points spent on it, never below the free head
    // start the class and the traits already gave.
    _specRankIn(ctx, actor, spec) {
      if (!actor || !spec) return 0;
      const trained = (actor._specTrained && actor._specTrained[spec.id]) || 0;
      return Math.max(trained, this._specGrantRankIn(ctx, spec));
    }

    _specRank(actor, spec) {
      return this._specRankIn(this._specGrantContext(actor), actor, spec);
    }

    // Every specialization the member already stands above Untrained in,
    // whether it was bought or granted. This is what the "Current" tab lists.
    _specsWithLevels(actor) {
      if (!actor) return [];
      const ctx = this._specGrantContext(actor);
      return this._specsCatalog().filter((sp) => this._specRankIn(ctx, actor, sp) > 0);
    }

    // The specialization catalogue narrowed by the open category tab and the
    // search field. One filter, used by the board and by every partial redraw
    // of it, so a search can never survive a category change (or the reverse)
    // just because two copies of the filter disagreed on how to read a spec's
    // description.
    _filteredSpecs() {
      const catalog = this._specsCatalog();
      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All";
      const q = (Scene_CharacterCreation._specSearchQuery || "").toLowerCase().trim();
      const S = window.Specializations || {};
      const nameOf = (sp) => (S.displayName ? S.displayName(sp) : sp.name) || "";
      const descOf = (sp) => (S.describe ? S.describe(sp) : sp.description) || "";

      if (this._specsReadOnly()) {
        return this._specsWithLevels(Scene_CharacterCreation.getCurrentActor())
          .slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      }
      const byCat = activeCat === "All"
        ? catalog
        : activeCat === SPEC_TAB_CURRENT
          ? this._specsWithLevels(Scene_CharacterCreation.getCurrentActor())
          : catalog.filter((sp) => sp.category === activeCat);
      const sorted = byCat.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      if (!q) return sorted;
      return sorted.filter((sp) =>
        nameOf(sp).toLowerCase().includes(q) ||
        descOf(sp).toLowerCase().includes(q) ||
        (sp.stat && sp.stat.toLowerCase().includes(q))
      );
    }

    // How many of the budget points are still unspent, and the spend recorded
    // on the member while we are counting them.
    _specsRemaining(actor) {
      if (!actor) return 0;
      if (!actor._specTrained) actor._specTrained = {};
      // Only the ranks bought above a class or trait head start are paid for:
      // the head start itself was never taken out of the purse.
      const ctx = this._specGrantContext(actor);
      const catalog = this._specsCatalog();
      let spent = 0;
      Object.keys(actor._specTrained).forEach((k) => {
        const spec = catalog.find((sp) => String(sp.id) === String(k));
        const floor = this._specGrantRankIn(ctx, spec);
        spent += Math.max(0, (actor._specTrained[k] || 0) - floor);
      });
      actor._specPointsSpent = spent;
      return Math.max(0, CC_SPEC_BUDGET - spent);
    }

    // The rank ladder is the specialization menu's own wording, so a tier is
    // named the same here as it is on the specialization menu proper
    // (js/i18n/*/plugins/SpecMenu.json). `rank` is this card's own 0-4 scale
    // (0 = nothing bought); window.Specializations.levelName is 1-based with
    // 1 itself meaning Untrained, so it wants rank+1 or a rank-1 trained pick
    // reads back as Untrained.
    _specRankName(rank) {
      const rankNames = ccList('SpecMenu.rankNames',
        ["Untrained", "Novice (+1)", "Adept (+2)", "Expert (+3)", "Master (+4)"]);
      return (window.Specializations && window.Specializations.levelName) ? window.Specializations.levelName(rank + 1) : (rankNames[rank] || rankNames[0]);
    }

    // One card per specialization. Shared by the first draw and by every
    // in-place redraw of the grid. The category sits top-right, out of the
    // way of the name; the rank name takes the category's old spot next to
    // the stat badge, so a card reads its own trained level without the
    // player having to hover it into the detail panel.
    _specCardsHtml(specs, actor, remaining) {
      const S = window.Specializations || {};
      const ctx = this._specGrantContext(actor);
      // A single-category tab already tells the player what they are looking
      // at, so repeating that category on every card is only useful on the
      // mixed-category tabs (All, and Current which spans whatever the
      // member trained).
      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All";
      const readOnly = this._specsReadOnly();
      const showCatLabel = readOnly || activeCat === "All" || activeCat === SPEC_TAB_CURRENT;
      return specs.map((spec) => {
        const specName = S.displayName ? S.displayName(spec) : spec.name;
        const specCatLabel = S.categoryLabel ? S.categoryLabel(spec.category) : (spec.category || "General");
        // A class or trait head start is a floor the card can never fall below.
        const grantRank = this._specGrantRankIn(ctx, spec);
        const currentRank = Math.max((actor && actor._specTrained && actor._specTrained[spec.id]) || 0, grantRank);
        const isHovered = Scene_CharacterCreation._hoveredSpecId === spec.id;
        const pipsHtml = [1, 2, 3, 4].map((tier) => `<div class="cc-spec-pip ${currentRank >= tier ? 'active' : ''}${grantRank >= tier ? ' bonus' : ''}"></div>`).join("");
        return `
          <div class="cc-spec-card ${isHovered ? 'selected' : ''}" data-spec-id="${spec.id}" onmouseenter="SceneManager._scene.onSpecCardHover(${spec.id})">
            <div class="cc-spec-info">
              <div class="cc-spec-title-row">
                <div class="cc-spec-title">${specName}</div>
                ${showCatLabel ? `<span class="cc-spec-cat-label">${specCatLabel}</span>` : ''}
              </div>
              <div class="cc-spec-meta">
                <span class="cc-spec-stat-badge">${ccStatLabel(spec.stat || 'INT')}</span>
                <span class="cc-spec-level-name">${this._specRankName(currentRank)}</span>
              </div>
            </div>
            ${readOnly ? '' : `
            <div class="cc-spec-controls">
              <button class="cc-spec-btn cc-spec-btn-minus" ${currentRank <= grantRank ? 'disabled' : ''} onclick="SceneManager._scene.onSpecPointAdjust(${spec.id}, -1)">-</button>
              <div class="cc-spec-pips">${pipsHtml}</div>
              <button class="cc-spec-btn cc-spec-btn-plus" ${(remaining <= 0 || currentRank >= 4) ? 'disabled' : ''} onclick="SceneManager._scene.onSpecPointAdjust(${spec.id}, 1)">+</button>
            </div>`}
          </div>
        `;
      }).join("");
    }

    // The grid's contents, or the line that says the filter matched nothing.
    _specGridInnerHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const remaining = this._specsRemaining(actor);
      // The same division the specialization menu draws: what the game already
      // does something with, then the disciplines that are still only a line on
      // the sheet, under their own heading. Points are spent on either side of
      // it exactly the same way, it is a reading order and nothing more.
      const S = window.Specializations || {};
      const isDone = (sp) => (S.isImplemented ? S.isImplemented(sp) : sp.implemented !== false);
      const all = this._filteredSpecs();
      const done = all.filter(isDone);
      const todo = all.filter((sp) => !isDone(sp));
      let cards = this._specCardsHtml(done, actor, remaining);
      if (todo.length) {
        cards += `<div class="cc-spec-group-title">${T('SpecMenu.ui.notImplemented')}</div>`;
        cards += this._specCardsHtml(todo, actor, remaining);
      }
      if (cards.length > 0) return cards;
      return `<div class="cc-empty-note">${T('SpecMenu.ui.noMatches')}</div>`;
    }

    // Redraw just the card grid in place, leaving the search field (and the
    // caret sitting in it) exactly where it is.
    _refreshSpecGrid() {
      const grid = this._dndContainer && this._dndContainer.querySelector(".cc-spec-grid");
      if (!grid) { this.refreshUIOverlayDOM(); return false; }
      grid.innerHTML = this._specGridInnerHtml();
      grid.scrollTop = 0;
      return true;
    }

    _specsPickerLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-left"></div>`;

      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All";
      const categories = this._specsCategories();
      const remaining = this._specsRemaining(actor);
      const budget = CC_SPEC_BUDGET;

      // Category Tabs. Each tab carries its own category on the element, so a
      // later redraw can move the highlight without having to work out which
      // tab is which from its translated label.
      const railFocused = !!this._pageRailFocused;
      const catTabsHtml = categories.map((cat) => {
        const isActive = cat === activeCat;
        const catLabel = cat === "All"
          ? T('SpecMenu.ui.all')
          : cat === SPEC_TAB_CURRENT
            ? ccT('CharCreate.specsCurrent', "Current")
            : ((window.Specializations && window.Specializations.categoryLabel) ? window.Specializations.categoryLabel(cat) : cat);
        return `
          <button class="cc-spec-tab ${isActive ? 'active' : ''} ${isActive && railFocused ? 'selected' : ''}" data-cat="${cat}" onclick="SceneManager._scene.onSpecCategorySelect('${cat}')">
            ${catLabel}
          </button>
        `;
      }).join("");

      const readOnly = this._specsReadOnly();

      return `
        <div class="cc-page cc-page-left cc-spec-board ts-page cc-page-column">
          ${readOnly ? '' : `
          <div class="cc-row-end">
            <div class="ts-purse">
              <span class="ts-purse-chip">${T('CharCreate.budgetPoints', { remaining: remaining, total: budget })}</span>
            </div>
          </div>
          <div class="cc-spec-tab-row">${catTabsHtml}</div>
          <div class="cc-gap-below-tight">
            <input type="text" class="cc-bio-select cc-search-field" placeholder="${T('SpecMenu.ui.searchPlaceholder')}" oninput="SceneManager._scene.onSpecSearch(this.value)" value="${Scene_CharacterCreation._specSearchQuery || ''}">
          </div>`}
          <div class="cc-spec-grid cc-pad-below">
            ${this._specGridInnerHtml()}
          </div>
        </div>
      `;
    }

    _specsPickerRightHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const catalog = this._specsCatalog();
      if (!actor) return `<div class="cc-page cc-page-right"></div>`;
      if (!actor._specTrained) actor._specTrained = {};

      // Everything the member stands above Untrained in, the granted head
      // starts included, so the roll matches what the "Current" tab lists.
      const grantCtx = this._specGrantContext(actor);
      const trainedEntries = this._specsWithLevels(actor)
        .map((sp) => [sp.id, this._specRankIn(grantCtx, actor, sp), this._specGrantRankIn(grantCtx, sp)]);
      const hoveredId = Scene_CharacterCreation._hoveredSpecId || (trainedEntries[0] ? Number(trainedEntries[0][0]) : catalog[0]?.id);
      const hoveredSpec = catalog.find((s) => s.id === hoveredId) || catalog[0];

      let detailHtml = "";
      if (hoveredSpec) {
        const specName = (window.Specializations && window.Specializations.displayName) ? window.Specializations.displayName(hoveredSpec) : hoveredSpec.name;
        const specDesc = (window.Specializations && window.Specializations.describe) ? window.Specializations.describe(hoveredSpec) : (hoveredSpec.description || "");
        const catLabel = (window.Specializations && window.Specializations.categoryLabel) ? window.Specializations.categoryLabel(hoveredSpec.category) : (hoveredSpec.category || "General");
        const rank = this._specRankIn(grantCtx, actor, hoveredSpec);
        const grantRank = this._specGrantRankIn(grantCtx, hoveredSpec);
        const rankLabel = this._specRankName(rank);

        detailHtml = `
          <div class="cc-dossier-card ts-detail">
            <div class="cc-detail-head">
              <div class="cc-detail-head-ident">
                <span class="cc-spec-stat-badge">${ccStatLabel(hoveredSpec.stat || 'INT')}</span>
                <span class="cc-detail-title">${specName}</span>
              </div>
              <span class="trait-cost cc-detail-rank">${rankLabel}</span>
            </div>
            <div class="cc-detail-desc">${specDesc || ccT('CharCreate.specGenericDesc', 'Proficiency acquired through rigorous study and fieldwork.')}</div>
            <div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('SpecMenu.ui.category', 'Category')}:</span><span class="cc-dossier-value">${catLabel}</span></div>
            <div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('SpecMenu.ui.governingStat', 'Governing Attribute')}:</span><span class="cc-dossier-value">${ccStatLabel(hoveredSpec.stat || "INT")}</span></div>
            ${grantRank > 0 ? `<div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('CharCreate.specGranted', 'Granted by Class and Traits')}:</span><span class="cc-dossier-value">${this._specRankName(grantRank)}</span></div>` : ''}
          </div>
        `;
      }

      // Trained Specs listed as full-width rows (.cc-spec-badge-row) so a long
      // roster reads top to bottom instead of wrapping into a chip cloud. Each
      // row carries its own delete button; a granted rank has no such button
      // since selling back what nobody paid for isn't possible.
      const readOnly = this._specsReadOnly();
      const trainedBadges = trainedEntries.map(([idStr, rank, grantRank]) => {
        const spec = catalog.find((s) => s.id === Number(idStr));
        const name = spec ? ((window.Specializations && window.Specializations.displayName) ? window.Specializations.displayName(spec) : spec.name) : `Spec #${idStr}`;
        const isGranted = grantRank >= rank;
        return `
          <div class="cc-spec-badge-row${isGranted ? ' granted' : ''}" onmouseenter="SceneManager._scene.onSpecCardHover(${idStr})">
            <span class="cc-spec-badge-row-name">${name}</span>
            <span class="cc-spec-stat-badge cc-inline-gutter">${this._specRankName(rank)}</span>
            ${readOnly ? '' : `<button class="cc-spec-badge-delete" title="${ccT('CharCreate.removeAllocated', 'Remove')}" ${isGranted ? 'disabled' : ''} onclick="event.stopPropagation(); SceneManager._scene.onSpecDeleteAllocated(${idStr})">&times;</button>`}
          </div>
        `;
      }).join("");

      return `
        <div class="cc-page cc-page-right cc-spec-detail ts-page cc-page-column">
          ${readOnly ? '' : `
          <div class="cc-row-end cc-row-end-wrap">
            <button class="cc-profile-open-btn" onclick="SceneManager._scene.onSuggestSpecsForCurrentActor()">${ccT('CharCreate.suggestSpecs', 'Suggested')}</button>
            <button class="cc-profile-open-btn" onclick="SceneManager._scene.onResetSpecsForCurrentActor()">${ccT('CharCreate.resetSpecs', 'Reset')}</button>
            <button class="cc-profile-open-btn" onclick="SceneManager._scene.onRandomizeSpecsForCurrentActor()">${ccT('CharCreate.randomize', 'Randomize')}</button>
          </div>`}
          ${detailHtml}

          <h3 class="cc-subheader cc-gap-above">
            <span>${ccT('CharCreate.allocatedTalents', 'Allocated Talents')} (${trainedEntries.length})</span>
          </h3>
          <div class="cc-stack cc-stack-roster">
            ${trainedBadges || `<span class="cc-note-faint cc-note-faint-padded">${ccT('CharCreate.noTalentsSpent', 'No specialization points allocated yet.')}</span>`}
          </div>
        </div>
      `;
    }

    onSpecCategorySelect(category) {
      Scene_CharacterCreation._activeSpecCategory = category;
      SoundManager.playCursor();
      const container = this._dndContainer;
      if (!container) { this.refreshUIOverlayDOM(); return; }

      // The tabs are ".cc-spec-tab" and always have been; this looked for
      // ".cc-spec-tab-btn", found nothing, and so the highlight never left the
      // tab the board opened on however many times the player changed category.
      const tabBtns = container.querySelectorAll(".cc-spec-tab");
      const railFocused = !!this._pageRailFocused;
      tabBtns.forEach((btn) => {
        const isActive = btn.getAttribute("data-cat") === category;
        btn.classList.toggle("active", isActive);
        btn.classList.toggle("selected", isActive && railFocused);
      });

      this._refreshSpecGrid();
    }

    onSpecSearch(query) {
      Scene_CharacterCreation._specSearchQuery = query || "";
      // Only the grid is rewritten: rebuilding the board would take the search
      // field, and the caret in it, away between one keystroke and the next.
      this._refreshSpecGrid();
    }

    onSpecCardHover(specId) {
      Scene_CharacterCreation._hoveredSpecId = specId;
      const rightPage = this._dndContainer && this._dndContainer.querySelector(".cc-page-right");
      if (rightPage) {
        this._ccSwapPage(rightPage, this._specsPickerRightHtml());
      }
    }

    onSpecPointAdjust(specId, delta) {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (!actor._specTrained) actor._specTrained = {};

      const budget = CC_SPEC_BUDGET;
      const grantCtx = this._specGrantContext(actor);
      const spec = this._specsCatalog().find((sp) => String(sp.id) === String(specId));
      // The head start the class and the traits hand out is the floor: it was
      // never paid for, so it can never be sold back for a point elsewhere.
      const grantRank = this._specGrantRankIn(grantCtx, spec);
      const current = Math.max(actor._specTrained[specId] || 0, grantRank);
      const spent = budget - this._specsRemaining(actor);

      if (delta > 0) {
        if (spent >= budget || current >= 4) {
          SoundManager.playBuzzer();
          return;
        }
        actor._specTrained[specId] = current + 1;
      } else if (delta < 0) {
        if (current <= grantRank) {
          SoundManager.playBuzzer();
          return;
        }
        actor._specTrained[specId] = current - 1;
        SoundManager.playCancel();
      }

      this._patchSpecBoard();
    }

    // The delete button on an allocated talent row: hands back every point
    // spent on it in one go. A granted rank is still the floor here, exactly
    // as it is for the minus button, so a head start from the class or a
    // trait can never be sold away.
    onSpecDeleteAllocated(specId) {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      if (!actor._specTrained) actor._specTrained = {};

      const grantCtx = this._specGrantContext(actor);
      const spec = this._specsCatalog().find((sp) => String(sp.id) === String(specId));
      const grantRank = this._specGrantRankIn(grantCtx, spec);
      const current = Math.max(actor._specTrained[specId] || 0, grantRank);
      if (current <= grantRank) {
        SoundManager.playBuzzer();
        return;
      }

      actor._specTrained[specId] = grantRank;
      SoundManager.playCancel();
      this._patchSpecBoard();
    }

    // Patches every card's pips/level-name/button state, the budget chip and
    // the right page in place, without touching the grid markup, the tabs or
    // the search field. Shared by the single-card +/- above and by the
    // board-wide buttons below (Suggested, Reset, Randomize): those touch
    // many specializations at once, and a full _redrawSpecBoard() would
    // rebuild the whole grid for it, losing the player's scroll position and
    // (mid-typing) the caret in the search field.
    _patchSpecBoard() {
      const container = this._dndContainer;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!container || !actor) { this._redrawSpecBoard(); return; }
      if (!actor._specTrained) actor._specTrained = {};

      // The "Current" tab lists only what is actually trained, so a
      // wholesale change to actor._specTrained (Reset, Randomize, Suggested)
      // can add or drop cards from it; patching cards already in the DOM
      // would leave it stale. Every other tab's membership never depends on
      // rank, so patching in place is enough there.
      if (Scene_CharacterCreation._activeSpecCategory === SPEC_TAB_CURRENT) {
        this._refreshSpecGrid();
      }

      const budget = CC_SPEC_BUDGET;
      const remaining = this._specsRemaining(actor);
      const grantCtx = this._specGrantContext(actor);

      const budgetChip = container.querySelector(".ts-purse-chip");
      if (budgetChip) {
        budgetChip.innerHTML = T('CharCreate.budgetPoints', { remaining: remaining, total: budget });
      }

      const catalogById = new Map(this._specsCatalog().map((sp) => [String(sp.id), sp]));
      container.querySelectorAll(".cc-spec-card[data-spec-id]").forEach((card) => {
        const cId = card.getAttribute("data-spec-id");
        const cGrant = this._specGrantRankIn(grantCtx, catalogById.get(String(cId)));
        const cRank = Math.max((actor._specTrained[cId]) || 0, cGrant);

        const minusBtn = card.querySelector(".cc-spec-btn-minus");
        if (minusBtn) minusBtn.disabled = (cRank <= cGrant);
        const plusBtn = card.querySelector(".cc-spec-btn-plus");
        if (plusBtn) plusBtn.disabled = (remaining <= 0 || cRank >= 4);

        const pips = card.querySelectorAll(".cc-spec-pip");
        pips.forEach((pip, idx) => {
          pip.classList.toggle("active", idx < cRank);
          pip.classList.toggle("bonus", idx < cGrant);
        });

        const levelNameEl = card.querySelector(".cc-spec-level-name");
        if (levelNameEl) levelNameEl.textContent = this._specRankName(cRank);
      });

      const rightPage = container.querySelector(".cc-page-right");
      if (rightPage) this._ccSwapPage(rightPage, this._specsPickerRightHtml());
    }

    // Full spec board rebuild, used only when there is no DOM to patch in
    // place yet (_patchSpecBoard's fallback).
    _redrawSpecBoard() {
      const contentPane = this._dndContainer && this._dndContainer.querySelector(".cc-content-pane");
      if (contentPane) {
        contentPane.innerHTML = `
          <div class="cc-pockets-spread">
            ${this._specsPickerLeftHtml()}
            ${this._specsPickerRightHtml()}
          </div>
        `;
        return;
      }
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // Spends `remaining` (a closure-shared counter local to the caller) into
    // fresh picks, cheapest bias toward small purchases so one big roll does
    // not empty the purse into a single specialization. Shared by Randomize
    // and by whatever budget Suggested leaves over.
    _randomSpendSpecs(actor, grantCtx, catalog, remaining) {
      let left = remaining;
      let attempts = 0;
      while (left > 0 && attempts < 400) {
        attempts++;
        const spec = catalog[Math.floor(Math.random() * catalog.length)];
        if (!spec) continue;
        const floor = this._specGrantRankIn(grantCtx, spec);
        const current = Math.max(actor._specTrained[spec.id] || 0, floor);
        if (current < 4) {
          const add = Math.min(left, 4 - current, Math.floor(Math.random() * 2) + 1);
          actor._specTrained[spec.id] = current + add;
          left -= add;
        }
      }
      return left;
    }

    onRandomizeSpecsForCurrentActor() {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const catalog = this._specsCatalog();
      actor._specTrained = {};
      if (!Array.isArray(catalog) || catalog.length === 0) return;

      // Points are rolled on top of whatever the class and the traits already
      // gave, never underneath it.
      const grantCtx = this._specGrantContext(actor);
      this._randomSpendSpecs(actor, grantCtx, catalog, CC_SPEC_BUDGET);

      this._patchSpecBoard();
    }

    // Clears every point the player spent, keeping only the free tiers the
    // class and traits grant: a clean refund back to a full purse, with
    // nothing else about the board reset.
    onResetSpecsForCurrentActor() {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      actor._specTrained = {};
      SoundManager.playCancel();
      this._patchSpecBoard();
    }

    // A one-click starting build for the class actually picked: every
    // specialization the class has a head start in (Specialization.json
    // classStart) gets maxed out, richest affinity first, before anything
    // else is touched. A class with fewer affinities than the budget affords
    // spends what is left over the same way Randomize does, so the purse is
    // never left holding points back.
    onSuggestSpecsForCurrentActor() {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const catalog = this._specsCatalog();
      actor._specTrained = {};
      if (!Array.isArray(catalog) || catalog.length === 0) return;

      const grantCtx = this._specGrantContext(actor);
      const className = grantCtx.className;
      let remaining = CC_SPEC_BUDGET;

      const affinityOrder = catalog
        .filter((sp) => className && sp.classStart && sp.classStart[className])
        .sort((a, b) => (b.classStart[className] || 0) - (a.classStart[className] || 0));

      affinityOrder.forEach((spec) => {
        if (remaining <= 0) return;
        const floor = this._specGrantRankIn(grantCtx, spec);
        const current = Math.max(actor._specTrained[spec.id] || 0, floor);
        if (current >= 4) return;
        const add = Math.min(remaining, 4 - current);
        actor._specTrained[spec.id] = current + add;
        remaining -= add;
      });

      if (remaining > 0) {
        this._randomSpendSpecs(actor, grantCtx, catalog, remaining);
      }

      this._patchSpecBoard();
    }

    // ── Macro BIO Step Helpers & Handlers ──
    _isBioPickerStep() {
      return this._step === STEP.BIO;
    }

    _formatIdeologyName(raw) {
      if (!raw) return this._formatIdeologyName("pragmatist");
      let key = typeof raw === "object" ? (raw.id || raw.key || raw.name) : raw;
      if (!key.startsWith("ideology.")) key = "ideology." + key;

      if (typeof T === "function") {
        try {
          const trans = T(key);
          if (trans && trans !== key && !trans.startsWith("ideology.")) return trans;
        } catch (e) {}
      }
      if (window.DataService && window.DataService.t) {
        try {
          const trans = window.DataService.t(key);
          if (trans && trans !== key && !trans.startsWith("ideology.")) return trans;
        } catch (e) {}
      }

      return String(key).split(".").pop().split(/[_\-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }

    // The organs this member is carrying right now. The variable is the store
    // (Health_BiologicSimulation reads the same one), CharacterCreationUtils
    // owns which variable that is.
    _currentReproductionType() {
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const CCU = window.CharacterCreationUtils;
      if (CCU && CCU.getReproductionType) return CCU.getReproductionType(memberIdx);
      return $gameVariables.value([87, 115, 116][memberIdx] || 87);
    }

    // Where this character's body sits on the endocrine scale: their own answer
    // if they have one, otherwise the default for the gender they carry.
    _currentHormoneBalance() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const CCU = window.CharacterCreationUtils;
      if (CCU && CCU.hormoneBalanceOf) return CCU.hormoneBalanceOf(actor);
      const own = (actor && actor.hormoneBalance) ? actor.hormoneBalance() : null;
      return own === null || own === undefined ? 50 : own;
    }

    // What the slider is actually doing to the blood, named and numbered. The
    // ranges come from the system that will hold the hormones there
    // (window.HormoneBalance, Health_BiologicSimulation), so the panel never
    // promises a body the simulation would not build.
    _hormoneReadoutHtml(balance) {
      const lean = ccHormoneLean(balance);
      const HB = window.HormoneBalance;
      if (!HB || !HB.rangeFor) return `<b>${lean}</b>`;
      const test = HB.rangeFor("testosterone", balance);
      const est = HB.rangeFor("estrogen", balance);
      if (!test || !est) return `<b>${lean}</b>`;
      const numbers = ccTp('CharCreate.hormoneReadout', {
        tLow: Math.round(test.min), tHigh: Math.round(test.max),
        eLow: Math.round(est.min), eHigh: Math.round(est.max)
      }, `Testosterone ${Math.round(test.min)}-${Math.round(test.max)} ng/dL, estrogen ${Math.round(est.min)}-${Math.round(est.max)} pg/mL`);
      return `<b>${lean}</b> &middot; ${numbers}`;
    }

    // Humanoid / Creature / Preset used to sit in the sidebar on every step;
    // it now opens straight into the Bio tab, so it leads that tab the same
    // way it used to lead the sidebar.
    _renderTypePillsHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return "";
      // The story mode is played as the dossier that was picked on its own board:
      // there is no humanoid, creature or second dossier to switch to, so the
      // pills are not drawn rather than drawn and refused.
      if (Scene_CharacterCreation._storyMode) return "";
      const isPreset = !!this._presetWindow;
      const isPresetActor = !!(actor._isPresetActor);
      const hasAnotherPreset = this._hasPresetInParty(true);
      const isPresetDisabled = hasAnotherPreset && !isPresetActor;
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !isPresetActor && !isPreset && !!(actor._isCreatureActor || $gameSwitches.value(77 + currentMemberIndex));
      // Drawn as the Bio tab's own kind of question: a titled section with a
      // row of chips, the same shape gender and class wear, rather than a
      // stripe of pills that belonged to the old sidebar.
      return `
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.characterType', 'Character Type')}</span></div>
          <div class="cc-bio-chips-row">
            <button class="cc-bio-chip cc-type-chip ${!isCreature && !isPresetActor && !isPreset ? 'selected' : ''}" onclick="SceneManager._scene.onSetCharacterType('humanoid')">
              ${ccT('CharCreate.humanoid', 'Humanoid')}
            </button>
            <button class="cc-bio-chip cc-type-chip ${isCreature && !isPresetActor && !isPreset ? 'selected' : ''}" onclick="SceneManager._scene.onSetCharacterType('creature')">
              ${ccT('CharCreate.creature', 'Creature')}
            </button>
            <button class="cc-bio-chip cc-type-chip ${(isPresetActor || isPreset) ? 'selected' : ''} ${isPresetDisabled ? 'disabled' : ''}"
               title="${isPresetDisabled ? ccT('CharCreate.onlyOnePreset', 'Only 1 preset character allowed in the party') : ccT('CharCreate.presetDossiers', 'Preset Dossiers')}"
               onclick="${isPresetDisabled ? 'SoundManager.playBuzzer()' : "SceneManager._scene.onSetCharacterType('preset')"}">
              ${ccT('CharCreate.preset', 'Preset')}
            </button>
          </div>
        </div>
      `;
    }

    // The body a character is spliced from. Both selects funnel through
    // applyArchetypesToActor (see onSelectCreatureArchetype /
    // onSelectCreatureSecondaryArchetype), which settles the 3D config from
    // the full canonical pair every time: changing the primary rebuilds the
    // model as the new kind, changing the secondary re-grafts its parts onto
    // it. Neither call is special-cased here, they already share the one path.
    //
    // A person is offered the second half too, and only the second half: a
    // humanoid is a humanoid, but it may be spliced with anything, which grafts
    // that body's extra parts on (more arms means more weapons held, see
    // HandSlots in ItemSystemEquipment.js).
    _archetypeBioHtml(actor, isCreature) {
      const currentArch = actorArchetypeKey(actor) || (isCreature ? "Beast" : "Humanoid"); // i18n-ignore: Archetypes.json keys
      const secondArch = actorSecondaryArchetypeKey(actor) || "";
      // Neither list offers what the other one holds: the two halves of a
      // spliced body are always two different archetypes.
      const archetypeOptions = (selected, taken) => creatureArchetypeKeys()
        .filter((opt) => opt !== taken)
        .map((opt) => `<option value="${opt}" ${opt === selected ? 'selected' : ''}>${archetypeDisplayName(opt)}</option>`)
        .join("");
      const primaryOptionsHtml = archetypeOptions(currentArch, secondArch);
      const secondaryOptionsHtml = `<option value="" ${secondArch ? '' : 'selected'}>${ccT('CharCreate.none', 'None')}</option>` +
        archetypeOptions(secondArch, currentArch);
      // What the spliced body can hold, asked of the one place that answers it.
      // Two different numbers: how many grips the body has at all (hands, plus
      // a mouth for the class that fights with a blade in its teeth) and how
      // many of those may hold a WEAPON, which is half of them unless the class
      // dual wields. Both are shown, for a person as much as for a creature,
      // because splicing on a second archetype is what changes them.
      const HS = window.HandSlots;
      const layout = (HS && HS.layout) ? HS.layout(actor) : null;
      const slots = layout ? layout.slots : 0;
      const maxWeapons = (HS && HS.maxWeapons) ? HS.maxWeapons(actor) : 0;
      const slotsHtml = `<div class="cc-bio-note">` +
        `${ccTp('CharCreate.weaponSlotsHeld', { n: maxWeapons }, `Weapons held: ${maxWeapons}`)}` +
        ` <span class="cc-bio-note-dim">${ccTp('CharCreate.handSlotsHeld', { n: slots }, `(${slots} grips)`)}</span>` +
        `</div>`;
      const primaryHtml = isCreature ? `
          <div class="cc-bio-section-title">${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.primaryArchetype', 'Primary Archetype')}</span></div>
          <select class="cc-bio-select" onchange="SceneManager._scene.onSelectCreatureArchetype(this.value)">
            ${primaryOptionsHtml}
          </select>
          <div class="cc-bio-section-title cc-gap-above">` : `
          <div class="cc-bio-section-title">`;
      return `
        <div class="cc-bio-section">
          ${primaryHtml}${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.secondaryArchetype', 'Secondary Archetype')}</span></div>
          <select class="cc-bio-select" onchange="SceneManager._scene.onSelectCreatureSecondaryArchetype(this.value)">
            ${secondaryOptionsHtml}
          </select>
          ${slotsHtml}
        </div>
      `;
    }

    _bioPickerLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-left"></div>`;

      // Story mode is played as Em and only as Em: her gender, her class, her
      // creed and her lack of a job are hers, not the player's, so the controls
      // that would edit them are settled and then shown as settled. See
      // CharacterPresets.isStoryModeEm.
      const CP = window.CharacterPresets;
      const isStoryEm = !!(CP && CP.isStoryModeEm && CP.isStoryModeEm(actor));
      if (isStoryEm && CP.applyStoryModeEmLocks) CP.applyStoryModeEmLocks(actor);

      const typePillsHtml = this._renderTypePillsHtml();
      const memberIdxForType = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreatureActor = !!(actor._isCreatureActor || $gameSwitches.value(77 + memberIdxForType));
      // The second half is asked of a person as much as of a creature; only
      // the creature is asked what its first half is.
      const archetypeBioHtml = this._archetypeBioHtml(actor, isCreatureActor);

      // Gender picker
      const genders = [
        { val: 0, label: ccT('CharCreate.bio.gender.male', "Male ♂") },
        { val: 1, label: ccT('CharCreate.bio.gender.female', "Female ♀") },
        { val: 2, label: ccT('CharCreate.bio.gender.nonBinary', "Non binary ⚦") },
        { val: 3, label: ccT('CharCreate.bio.gender.cocoon', "Cocoon ⯐") }
      ];
      const currentMemberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const currentGender = $gameVariables.value(38 + currentMemberIdx);
      const genderChipsHtml = genders.map((g) => {
        const isSelected = currentGender === g.val;
        const click = isStoryEm ? 'SoundManager.playBuzzer()' : `SceneManager._scene.onSetActorGender(${g.val})`;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''} ${isStoryEm ? 'disabled' : ''}" onclick="${click}">${g.label}</button>`;
      }).join("");

      // Reproductive organs: the gender pick writes a default in here, and this
      // is where the player overrides it.
      const currentRepro = this._currentReproductionType();
      const reproChipsHtml = ccReproChoices().map((r) => {
        const isSelected = currentRepro === r.val;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('reproduction', ${r.val})">${r.label}</button>`;
      }).join("");

      // And the endocrine balance the body runs at.
      const hormoneBalance = this._currentHormoneBalance();

      // Ideologies
      const emCreedChoices = (isStoryEm && CP && CP.storyModeEmIdeologyChoices)
        ? CP.storyModeEmIdeologyChoices() : [];
      const allIdeologies = (window.NPCShared && window.NPCShared.ideologyList && window.NPCShared.ideologyList()) || [];
      const currentIdeology = actor._ideologyId || "";

      // A handful of creeds used to sit above the list as chips, which said that
      // those seven were the ones worth having. Every creed is in the list (and
      // on the graph beside it), so the list is the only way one is picked. The
      // fallback is still needed for the case where no ideology bank loaded.
      const coreQuickPicks = [
        { id: "techno_monism" },
        { id: "transhumanism" },
        { id: "cyber_anarchism" },
        { id: "democratic_socialist" },
        { id: "high_frequency_trader" },
        { id: "neo_feudalism" },
        { id: "pragmatist" },
      ];

      // Full dropdown options with clean translated names
      // Alphabetical on the displayed creed name: the bank arrives grouped by
      // political family, which reads as no order at all in a flat dropdown.
      const ideologyOptionsHtml = (allIdeologies.length > 0 ? allIdeologies : coreQuickPicks)
        .map((item) => ({ id: item.id || item, label: this._formatIdeologyName(item) }))
        .filter((entry) => !isStoryEm || emCreedChoices.includes(entry.id))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((entry) => {
          const isSelected = currentIdeology === entry.id;
          return `<option value="${entry.id}" ${isSelected ? 'selected' : ''}>${entry.label}</option>`;
        }).join("");
      // A creed held is a creed chosen: the list opens on nobody's. The story
      // mode's Em opens on Thelema instead and is offered the short shelf of
      // creeds that fits her, nothing else (CharacterPresets).
      const ideologyChoicesHtml = isStoryEm ? ideologyOptionsHtml : `
        <option value="" ${currentIdeology ? '' : 'selected'}>${ccT('CharCreate.none', 'None')}</option>
        ${ideologyOptionsHtml}`;

      // Morality Alignments
      const alignments = [
        { val: 2, label: ccT('CharCreate.bio.morality.saintly', "Saintly (+2)") },
        { val: 1, label: ccT('CharCreate.bio.morality.principled', "Principled (+1)") },
        { val: 0, label: ccT('CharCreate.bio.morality.pragmatic', "Pragmatic (0)") },
        { val: -1, label: ccT('CharCreate.bio.morality.ruthless', "Ruthless (-1)") },
        { val: -2, label: ccT('CharCreate.bio.morality.vile', "Vile (-2)") },
      ];
      const currentMorality = actor._morality != null ? actor._morality : 0;
      const moralityChips = alignments.map((a) => {
        const isSelected = currentMorality === a.val;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('morality', ${a.val})">${a.label}</button>`;
      }).join("");

      // Hometowns
      const hometowns = (window.WorkSystem && window.WorkSystem.Destinations)
        ? Object.keys(window.WorkSystem.Destinations)
        : ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"];
      const currentHometown = $gameSystem._ccHometown || "Paris";
      // A dossier may name a town the work destinations never list (Em's
      // Wimbledon): without this the select silently fell back to its first
      // entry and the sheet claimed a birthplace nobody had chosen.
      const hometownList = hometowns.includes(currentHometown)
        ? hometowns : [currentHometown].concat(hometowns);
      const hometownOptions = hometownList.map((city) => `<option value="${city}" ${city === currentHometown ? 'selected' : ''}>${city}</option>`).join("");

      // Age Bands
      const ageBands = [
        { key: "age_young", label: ccT('CharCreate.bio.age.young', "Young (18-25)"), age: 22 },
        { key: "age_adult", label: ccT('CharCreate.bio.age.adult', "Adult (26-40)"), age: 32 },
        { key: "age_middle", label: ccT('CharCreate.bio.age.middle', "Middle-Aged (41-60)"), age: 48 },
        { key: "age_elder", label: ccT('CharCreate.bio.age.elder', "Elder (61+)"), age: 68 },
      ];
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const currentAge = ($gameSystem._ccBirthAge && $gameSystem._ccBirthAge[memberIdx]) || 28;
      const ageChips = ageBands.map((band) => {
        const isSelected = Math.abs(currentAge - band.age) < 10;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('age', ${band.age})">${band.label}</button>`;
      }).join("");

      // Wealth Tiers
      const wealthTiers = [
        { tier: 0, label: ccT('CharCreate.bio.wealth.destitute', "Destitute") },
        { tier: 1, label: ccT('CharCreate.bio.wealth.working', "Working Class") },
        { tier: 2, label: ccT('CharCreate.bio.wealth.middle', "Middle Class") },
        { tier: 3, label: ccT('CharCreate.bio.wealth.wealthy', "Wealthy") },
      ];
      const currentWealth = actor._wealthTier != null ? actor._wealthTier : 2;
      const wealthChips = wealthTiers.map((w) => {
        const isSelected = currentWealth === w.tier;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('wealth', ${w.tier})">${w.label}</button>`;
      }).join("");

      // Blood Types from BloodTypeService or comprehensive list
      const bloodList = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [
        { id: "O_POS", type: "O+", rarityKey: "common", category: "standard" },
        { id: "A_POS", type: "A+", rarityKey: "common", category: "standard" },
        { id: "B_POS", type: "B+", rarityKey: "common", category: "standard" },
        { id: "AB_POS", type: "AB+", rarityKey: "uncommon", category: "standard" },
        { id: "O_NEG", type: "O-", rarityKey: "uncommon", category: "standard" },
        { id: "A_NEG", type: "A-", rarityKey: "uncommon", category: "standard" },
        { id: "B_NEG", type: "B-", rarityKey: "rare", category: "standard" },
        { id: "AB_NEG", type: "AB-", rarityKey: "rare", category: "standard" },
        { id: "SYNTH_DELTA", type: "Synthetic-Δ", rarityKey: "rare", category: "synthetic" },
        { id: "SYNTH_PSI", type: "Synthetic-Ψ", rarityKey: "veryRare", category: "synthetic" },
        { id: "AZURE_HEMOCYANIN", type: "Azure (Hemocyanin)", rarityKey: "veryRare", category: "exotic" },
        { id: "CHLOROCRUORIN", type: "Chlorocruorin (Green)", rarityKey: "veryRare", category: "exotic" },
        { id: "RH_NULL", type: "Rh-null", rarityKey: "ultraRare", category: "rare_human" },
        { id: "BOMBAY_HH", type: "Bombay (hh)", rarityKey: "ultraRare", category: "rare_human" },
        { id: "DUFFY_NEG", type: "Duffy-", rarityKey: "veryRare", category: "rare_human" },
        { id: "DIEGO_B_NEG", type: "Diego(b-)", rarityKey: "veryRare", category: "rare_human" },
        { id: "KIDD_B_NEG", type: "Kidd(b-)", rarityKey: "veryRare", category: "rare_human" },
        { id: "COLTON_NEG", type: "Colton(a-)", rarityKey: "veryRare", category: "rare_human" },
        { id: "LUTHERAN_NEG", type: "Lutheran(a-b-)", rarityKey: "veryRare", category: "rare_human" }
      ];

      const currentBloodId = actor._ccBloodType || actor._bloodType || "O_POS";
      const currentBloodEntry = bloodList.find(b => b.id === currentBloodId || b.type === currentBloodId) || bloodList[0];

      // Transfusion party compatibility
      const compat = (window.BloodTypeService && window.BloodTypeService.checkPartyCompatibility)
        ? window.BloodTypeService.checkPartyCompatibility(actor, currentBloodEntry.id)
        : { canDonateTo: [], canReceiveFrom: [] };

      const otherMembersCount = ($gameParty && $gameParty.members)
        ? $gameParty.members().filter(m => m && (typeof m.actorId === 'function' ? m.actorId() : m._actorId) !== (typeof actor.actorId === 'function' ? actor.actorId() : actor._actorId)).length
        : 0;

      let compatHtml = "";
      if (otherMembersCount > 0) {
        compatHtml = `
          <div class="cc-blood-panel">
            <div class="cc-blood-panel-head">
              <span>${ccT('CharCreate.bio.compatTitle', "Party Transfusion Compatibility")}</span>
              <span class="cc-blood-panel-selected">${ccT('CharCreate.bio.compatSelected', "Selected")}: <b>${currentBloodEntry.type}</b></span>
            </div>
            <div class="cc-stack-gapped">
              <div class="cc-blood-line cc-blood-line--donate">
                <span class="cc-blood-line-label">↳ ${ccT('CharCreate.bio.canDonate', "Can donate to:")}</span>
                <span>${compat.canDonateTo.length > 0 ? compat.canDonateTo.map(m => `<b>${m.name}</b> (${m.type})`).join(", ") : `<span class="cc-note-quiet">${ccT('CharCreate.bio.noDonor', "None (Incompatible donor)")}</span>`}</span>
              </div>
              <div class="cc-blood-line cc-blood-line--receive">
                <span class="cc-blood-line-label">↳ ${ccT('CharCreate.bio.canReceive', "Can receive from:")}</span>
                <span>${compat.canReceiveFrom.length > 0 ? compat.canReceiveFrom.map(m => `<b>${m.name}</b> (${m.type})`).join(", ") : `<span class="cc-note-quiet">${ccT('CharCreate.bio.noRecipient', "None (Requires matched donor)")}</span>`}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        // One line per blood id worth remarking on, and one catch-all for any
        // other antigen-null profile. The wording is i18n's (CharCreate.bio.
        // bloodTrait), keyed by the same id BloodTypeService hands out.
        const BLOOD_TRAIT_IDS = ["O_NEG", "AB_POS", "SYNTH_DELTA", "AZURE_HEMOCYANIN", "RH_NULL", "BOMBAY_HH"];
        const traitKey = BLOOD_TRAIT_IDS.includes(currentBloodEntry.id)
          ? currentBloodEntry.id
          : (currentBloodEntry.rareAntigen ? "RARE_ANTIGEN" : null);
        const specialTrait = traitKey ? ccT('CharCreate.bio.bloodTrait.' + traitKey, "") : "";
        if (specialTrait) {
          compatHtml = `
            <div class="cc-blood-trait">
              <span class="cc-blood-line-label">${ccT('CharCreate.bio.traitLabel', "Trait:")}</span> ${specialTrait}
            </div>
          `;
        }
      }

      const standardBloods = bloodList.filter(b => b.category === "standard");
      const specialBloods = bloodList.filter(b => b.category !== "standard");

      const renderChips = (list) => list.map((bt) => {
        const isSelected = currentBloodEntry.id === bt.id || currentBloodId === bt.type;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('blood', '${bt.id}')" title="${bt.type} (${bt.rarityKey})">${bt.type}</button>`;
      }).join("");

      // Jobs / Occupations from Jobs.json (0 = Jobless)
      const allJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
      const currentJobId = actor._jobId != null ? actor._jobId : 0;
      const currentJob = currentJobId > 0 ? (allJobs.find(j => j.id === currentJobId) || null) : null;
      const currentJobName = currentJob ? (window.WorkSystem && window.WorkSystem.jobName ? window.WorkSystem.jobName(currentJob) : (currentJob.name || `Job #${currentJob.id}`)) : ccT('CharCreate.bio.jobless', "Jobless / Unemployed");

      const joblessOptionHtml = `<option value="0" ${currentJobId === 0 ? 'selected' : ''}>-- ${ccT('CharCreate.bio.joblessOption', "None")} --</option>`;
      // Sorted on the name the player actually reads, so the list is walkable
      // in every language rather than in Jobs.json's authoring order.
      const sortedJobs = allJobs.slice().map((j) => ({
        job: j,
        label: window.WorkSystem && window.WorkSystem.jobName ? window.WorkSystem.jobName(j) : (j.name || `Job #${j.id}`)
      })).sort((a, b) => a.label.localeCompare(b.label));
      const jobOptionsHtml = joblessOptionHtml + sortedJobs.map((entry) => {
        const isSelected = currentJob && currentJob.id === entry.job.id;
        return `<option value="${entry.job.id}" ${isSelected ? 'selected' : ''}>${entry.label}</option>`;
      }).join("");

      let jobItemsBadges = "";
      if (currentJob && Array.isArray(currentJob.items) && currentJob.items.length > 0) {
        jobItemsBadges = currentJob.items.map((itemId) => {
          const item = (typeof $dataItems !== 'undefined' && $dataItems[itemId]) ? $dataItems[itemId] : null;
          const itemName = item ? item.name : `Item #${itemId}`;
          const iconIndex = item ? item.iconIndex : 160;
          return `
            <span class="cc-element-badge cc-element-badge--plain">
              ${this._ccIconHtml(iconIndex, 14)} <span>${itemName}</span>
            </span>
          `;
        }).join(" ");
      }

      // Classes list for Simple Mode
      let availableClasses = [];
      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !!(actor && (actor._isCreatureActor || $gameSwitches.value(77 + memberIndex)));
      if (isCreature && window.CreatureClasses) {
        const cIds = typeof window.CreatureClasses.creatureRoster === "function"
          ? window.CreatureClasses.creatureRoster()
          : (window.CreatureClasses.forActor(actor) || []);
        const sAllowed = typeof window.CreatureClasses.sentientAllowedFor === "function"
          ? window.CreatureClasses.sentientAllowedFor(
              typeof actorArchetypeKey === "function" ? actorArchetypeKey(actor) : null,
              typeof actorSecondaryArchetypeKey === "function" ? actorSecondaryArchetypeKey(actor) : null)
          : true;
        const sIds = (sAllowed && window.CreatureClasses.sentientRoster) ? window.CreatureClasses.sentientRoster() : [];
        const combined = Array.from(new Set([...cIds, ...sIds]));
        availableClasses = combined.map(id => (typeof $dataClasses !== 'undefined' ? $dataClasses[id] : null)).filter(Boolean);
      } else if (window.CreatureClasses && window.CreatureClasses.sentientRoster) {
        availableClasses = window.CreatureClasses.sentientRoster().map(id => (typeof $dataClasses !== 'undefined' ? $dataClasses[id] : null)).filter(Boolean);
      } else if (typeof $dataClasses !== 'undefined') {
        availableClasses = $dataClasses.filter(c => c && c.id > 0 && c.name);
      }
      availableClasses.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const currentClassId = (actor && actor._classId) ? actor._classId : 1;
      const classChipsHtml = availableClasses.map((c) => {
        const cName = window.CCDbName ? window.CCDbName(c) : c.name;
        const isSelected = currentClassId === c.id;
        const click = isStoryEm ? 'SoundManager.playBuzzer()' : `SceneManager._scene.onBioOptionChange('class', ${c.id})`;
        return `<button type="button" class="cc-bio-chip ${isSelected ? 'selected' : ''} ${isStoryEm ? 'disabled' : ''}" onclick="${click}">${cName}</button>`;
      }).join("");

      // Story mode reads Em's sheet rather than writing it: the whole detailed
      // page is drawn, down to her organs, her standing and her blood, and the
      // page lock (see _presetLockFreeStep) is what keeps it from being edited.
      const isSimpleMode = Scene_CharacterCreation.isSimpleMode() && !isStoryEm;

      const professionSectionHtml = `
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(193, 16)} <span>${ccT('CharCreate.professionJob', "Profession")}</span></div>
          <select class="cc-bio-select" onchange="SceneManager._scene.onBioOptionChange('job', this.value)">
            ${jobOptionsHtml}
          </select>
          ${jobItemsBadges ? `
            <div class="cc-stack-tight">
              <div class="cc-row-chips">${jobItemsBadges}</div>
            </div>
          ` : ''}
        </div>
      `;

      if (isSimpleMode) {
        return `
          <div class="cc-page cc-page-left ts-page cc-page-column">
            <div class="cc-bio-container cc-step-scroll">
              ${typePillsHtml}
              ${archetypeBioHtml}
              <div class="cc-bio-section">
                <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.gender', "Gender")}</span></div>
                <div class="cc-bio-chips-row">${genderChipsHtml}</div>
              </div>
              ${professionSectionHtml}
              <div class="cc-bio-section">
                <div class="cc-bio-section-title">${this._ccIconHtml(183, 16)} <span>${ccT('CharCreate.creedIdeology', "Creed")}</span></div>
                <select id="cc-ideology-select" class="cc-bio-select" onchange="SceneManager._scene.onBioOptionChange('ideology', this.value)">
                  ${ideologyChoicesHtml}
                </select>
              </div>
              <div class="cc-bio-section cc-bio-section-flush">
                <div class="cc-bio-section-title">${this._ccIconHtml(322, 16)} <span>${ccT('CharCreate.class', "Class")}</span></div>
                <div class="cc-bio-chips-row">
                  ${classChipsHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="cc-page cc-page-left ts-page cc-page-column">
          <div class="cc-bio-container cc-step-scroll">
            ${typePillsHtml}
            ${archetypeBioHtml}
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.gender', "Gender")}</span></div>
              <div class="cc-bio-chips-row">${genderChipsHtml}</div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(267, 16)} <span>${ccT('CharCreate.reproductiveOrgans', "Reproductive Organs")}</span></div>
              <div class="cc-bio-chips-row">${reproChipsHtml}</div>
              <div class="cc-bio-section-title cc-gap-above">${this._ccIconHtml(179, 16)} <span>${ccT('CharCreate.hormoneBalance', "Endocrine Balance")}</span></div>
              <div class="cc-bio-slider-row">
                <span class="cc-bio-slider-end">${ccT('CharCreate.hormoneOestrogenic', "Oestrogenic")}</span>
                <input id="cc-hormone-slider" class="cc-bio-slider" type="range" min="0" max="100" step="1" value="${hormoneBalance}"
                  oninput="SceneManager._scene.onHormoneSliderPreview(this.value)"
                  onchange="SceneManager._scene.onBioOptionChange('hormones', this.value)">
                <span class="cc-bio-slider-end">${ccT('CharCreate.hormoneAndrogenic', "Androgenic")}</span>
              </div>
              <div id="cc-hormone-readout" class="cc-bio-slider-readout">${this._hormoneReadoutHtml(hormoneBalance)}</div>
            </div>
            ${professionSectionHtml}
            <div class="cc-bio-section">
              <div class="cc-row-wide">
                <div class="cc-col-grow">
                  <div class="cc-bio-section-title">${this._ccIconHtml(183, 16)} <span>${ccT('CharCreate.creedIdeology', "Creed")}</span></div>
                  <div class="cc-row-inline">
                    <select id="cc-ideology-select" class="cc-bio-select cc-col-grow" onchange="SceneManager._scene.onBioOptionChange('ideology', this.value)">
                      ${ideologyChoicesHtml}
                    </select>
                    <button type="button" class="cc-bio-chip" onclick="if(window.PoliticalGraph3D && SceneManager._scene){ SceneManager._scene.markReturnStep(); SceneManager._scene.closeStepUI(); window.PoliticalGraph3D.openModal({ focusId: (document.getElementById('cc-ideology-select') ? document.getElementById('cc-ideology-select').value : ''), onSelect: function(id) { Scene_CharacterCreation.applyIdeologySelection(id); } }); }" title="${ccT('CharCreate.openPoliticalGraph', 'Open the political graph')}">${ccT('CharCreate.politicalGraph', 'Graph')}</button>
                  </div>
                </div>
                <div class="cc-col-grow">
                  <div class="cc-bio-section-title">${this._ccIconHtml(190, 16)} <span>${ccT('CharCreate.originCity', "Hometown")}</span></div>
                  <select class="cc-bio-select" onchange="SceneManager._scene.onBioOptionChange('hometown', this.value)">${hometownOptions}</select>
                </div>
              </div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.moralityAlignment', "Morality")}</span></div>
              <div class="cc-bio-chips-row">${moralityChips}</div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(113, 16)} <span>${ccT('CharCreate.ageBand', "Age")}</span></div>
              <div class="cc-bio-chips-row">${ageChips}</div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(208, 16)} <span>${ccT('CharCreate.socialStanding', "Social Standing")}</span></div>
              <div class="cc-bio-chips-row">${wealthChips}</div>
            </div>
            <div class="cc-bio-section cc-bio-section-flush">
              <div class="cc-bio-section-title">${this._ccIconHtml(176, 16)} <span>${ccT('CharCreate.bloodType', "Blood Type")}</span></div>
              <div class="cc-note-label cc-note-label-spaced">${ccT('CharCreate.bio.bloodStandard', "Standard Blood")}</div>
              <div class="cc-bio-chips-row cc-gap-below-tight">${renderChips(standardBloods)}</div>
              <div class="cc-note-label cc-note-label-spaced">${ccT('CharCreate.bio.bloodExotic', "Exotic Blood")}</div>
              <div class="cc-bio-chips-row">${renderChips(specialBloods)}</div>
              ${compatHtml}
            </div>
          </div>
        </div>
      `;
    }

    // The character's real backstory, drawn the same way the status screen and
    // the Empathize panel draw it. The age control on the facing page is the
    // one field the generator itself reads, so a re-aged character is dealt
    // the events of the lifetime the player just gave them.
    // The fixed biography of a taken dossier, or "" for a character the player
    // is writing from scratch. Em's resolves through the same call, so her
    // canon (or rolled-branch) background is what her sheet shows.
    _presetLoreHtml(actor) {
      const CP = window.CharacterPresets;
      if (!actor || !actor._isPresetActor || !CP || !CP.getPresetLore) return "";
      const preset = CP.findPresetForActor ? CP.findPresetForActor(actor) : null;
      const lore = CP.getPresetLore(preset || { id: actor._presetId });
      if (!lore) return "";
      return `<div class="npc-backstory-text">${lore}</div>`;
    }

    _bioBackstoryHtml(actor, age) {
      // A dossier is a written character, not a generated one: it reads the
      // fixed biography its own entry carries (CharacterPresets.getPresetLore),
      // never the life record the society simulator would deal a stranger. The
      // dated event list belongs to that generated record, so it goes with it,
      // which is also why story mode's Em is never shown one.
      const presetLoreHtml = this._presetLoreHtml(actor);
      if (presetLoreHtml) return presetLoreHtml;

      const profile = window.NPCSocietyRegistry?.getProfile?.(actor.name()) || null;
      if (profile && age) {
        const nowYear = window.NPCLifeSim?.currentYear?.() ?? 2001;
        const birthYear = nowYear - age;
        if (profile._birthYearOverride !== birthYear) {
          profile._birthYearOverride = birthYear;
          profile.backstory = null;
        }
      }
      const lore = this._ensureActorLore(actor, actor._gender) || profile;
      const backstory = lore && lore.backstory;
      const html = backstory && window.NPCHistSim?.buildBackstoryHTML
        ? window.NPCHistSim.buildBackstoryHTML(backstory)
        : "";
      if (html) return html;
      return `<div class="npc-backstory-text">${ccT('CharCreate.bio.noBackstory', 'No backstory recorded yet.')}</div>`;
    }

    _renderSimpleClassDetailsHtml(actor, c) {
      if (!c) return "";
      const passives = window.BattleSystemPassiveSkills;
      const passiveName = passives && passives.getPassiveName ? passives.getPassiveName(c.id) : "";
      const passiveDesc = passives && passives.getPassiveEffect ? passives.getPassiveEffect(c.id) : "";

      const note = typeof this._classNote === "function" ? this._classNote(c, "") : (c.description || "");

      const passiveHtml = passiveName ? `
        <div class="cc-class-passive cc-gap-above-tight">
          <div class="cc-class-passive-name">${this._ccIconHtml(87, 18)} <span>${passiveName}</span></div>
          ${passiveDesc ? `<p class="cc-class-passive-desc">${passiveDesc}</p>` : ''}
        </div>
      ` : "";
      // ...and the once-a-day act the class pulls off the floor.
      const limit = window.LimitBreak && window.LimitBreak.cardForClass
        ? window.LimitBreak.cardForClass(c.id) : null;
      const limitHtml = limit && limit.name ? `
        <div class="cc-class-passive cc-gap-above-tight">
          <div class="cc-class-passive-name">${this._ccIconHtml(76, 18)} <span>${limit.name}</span>
            <span class="cc-class-passive-tag">${ccT('CharCreate.limitBreak', 'Limit break')}</span></div>
          ${limit.desc ? `<p class="cc-class-passive-desc">${limit.desc}</p>` : ''}
        </div>
      ` : "";

      // Weapon proficiencies
      const hasEquipTrait = (code, dataId) =>
        (c.traits || []).some((t) => t.code === code && t.dataId === dataId && t.value === 1);
      const weaponNames = {
        1: ccT('CharCreate.light', 'Light'), 2: ccT('CharCreate.sword', 'Sword'), 3: ccT('CharCreate.heavy', 'Heavy'),
        4: ccT('CharCreate.axe', 'Axe'), 5: ccT('CharCreate.whip', 'Whip'), 6: ccT('CharCreate.staff', 'Staff'),
        7: ccT('CharCreate.bow', 'Bow'), 8: ccT('CharCreate.projectile', 'Projectile'), 9: ccT('CharCreate.gun', 'Gun'),
        10: ccT('CharCreate.claw', 'Claw'), 11: ccT('CharCreate.glove', 'Glove'), 12: ccT('CharCreate.spear', 'Spear')
      };
      const weaponIcons = (window.StartingEquipment && window.StartingEquipment.weaponTypeIcons) || {};
      const weaponRows = [];
      for (let wId = 1; wId <= 12; wId++) {
        if (hasEquipTrait(51, wId)) {
          if (typeof this._ccLoadoutRowHtml === "function") {
            weaponRows.push(this._ccLoadoutRowHtml(weaponIcons[wId] || 96, weaponNames[wId] || "", ""));
          } else {
            weaponRows.push(`
              <div class="cc-loadout-row">
                <span class="cc-loadout-item-name">${this._ccIconHtml(weaponIcons[wId] || 96, 16)} <span>${weaponNames[wId] || ""}</span></span>
              </div>
            `);
          }
        }
      }

      // Learnings up to level 10
      const sortedLearnings = (c.learnings || [])
        .filter((l) => l.level > 1 && l.level <= 10)
        .sort((a, b) => a.level - b.level);

      const roadmapRowHtml = (l) => {
        const sk = (typeof $dataSkills !== 'undefined') ? $dataSkills[l.skillId] : null;
        if (!sk) return "";
        const iconIndex = sk.iconIndex || 79;
        const sName = window.CCDbName ? window.CCDbName(sk) : sk.name;
        const lvLabel = `${ccT('CharCreate.abbrev.level', 'Lv')} ${l.level}`;
        const hoverAttrs = typeof this._ccHoverAttrs === "function" ? this._ccHoverAttrs("skill", sk.id) : "";
        if (typeof this._ccLoadoutRowHtml === "function") {
          return this._ccLoadoutRowHtml(iconIndex, sName, lvLabel, { valueColor: 'var(--text-primary-hover)', hover: hoverAttrs });
        }
        return `
          <div class="cc-loadout-row" ${hoverAttrs}>
            <span class="cc-loadout-item-name">${this._ccIconHtml(iconIndex, 16)} <span>${sName}</span></span>
            <span class="cc-loadout-item-value">${lvLabel}</span>
          </div>
        `;
      };

      const roadmapRows = sortedLearnings.map(roadmapRowHtml).join("");

      return `
        <div class="cc-class-detail cc-class-detail--ruled">
          <h3 class="cc-subheader cc-subheader--lead">
            ${window.CCDbName ? window.CCDbName(c) : c.name}
          </h3>
          <div class="cc-dossier-card cc-class-section cc-gap-below">
            <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.classProfile', 'Class Skills')}</h4>
            ${passiveHtml}
            ${limitHtml}
          </div>

          ${weaponRows.length ? (
            typeof this._ccLoadoutSectionHtml === "function" ? this._ccLoadoutSectionHtml(
              ccT('CharCreate.startingWeaponProficiencies', 'Starting Weapon Proficiencies'),
              weaponRows.join(""),
              ccT('CharCreate.none', 'None'),
              true,
              'cc-loadout-grid-cols'
            ) : `
              <div class="cc-dossier-card cc-class-section cc-gap-below">
                <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.startingWeaponProficiencies', 'Starting Weapon Proficiencies')}</h4>
                <div class="cc-loadout-grid-cols">${weaponRows.join("")}</div>
              </div>
            `
          ) : ''}

          ${roadmapRows ? (
            typeof this._ccLoadoutSectionHtml === "function" ? this._ccLoadoutSectionHtml(
              ccT('CharCreate.skillRoadmap', 'Skill Roadmap') + ' (Lv 1 - 10)',
              `<div class="cc-loadout-col">${roadmapRows}</div>`,
              "",
              true
            ) : `
              <div class="cc-dossier-card cc-class-section cc-gap-above-tight">
                <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.skillRoadmap', 'Skill Roadmap')} (Lv 1 - 10)</h4>
                <div class="cc-loadout-col">${roadmapRows}</div>
              </div>
            `
          ) : ''}
        </div>
      `;
    }

    _bioPickerRightHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-right"></div>`;

      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const age = ($gameSystem._ccBirthAge && $gameSystem._ccBirthAge[memberIdx]) || 28;

      let avatarStyle = "";
      if (actor.characterName()) {
        avatarStyle = this.getSpriteStyle(actor.characterName(), actor.characterIndex());
      }
      const classData = (typeof $dataClasses !== 'undefined') ? $dataClasses[actor._classId] : null;
      const className = classData ? (window.CCDbName ? window.CCDbName(classData) : classData.name) : ccT('CharCreate.defaultClassName', 'Operative');

      // The biography every other screen shows for this character, not a
      // sentence assembled out of the picker's own fields: the backstory the
      // NPC society writes against the world's timeline, formative events and
      // birth line included.
      const storyHtml = this._bioBackstoryHtml(actor, age);
      const isSimpleMode = Scene_CharacterCreation.isSimpleMode();
      const simpleClassHtml = isSimpleMode ? this._renderSimpleClassDetailsHtml(actor, classData) : "";

      return `
        <div class="cc-page cc-page-right ts-page cc-page-column">
          <div class="cc-dossier-card cc-step-scroll-padded">
            <div class="cc-bio-identity">
              <span class="cc-compact-avatar cc-avatar-sm" style="${avatarStyle}"></span>
              <span class="cc-bio-identity-name">${actor.name()}</span>
              <span class="cc-bio-identity-class">(${className})</span>
            </div>

            <h3 class="cc-subheader cc-subheader-ruled">
              ${ccT('CharCreate.narrativeHistory', 'Backstory')}
            </h3>
            ${storyHtml}

            ${simpleClassHtml}

          </div>
        </div>
      `;
    }

    onSetActorGender(genderVal) {
      if (this._storyModeEmLocksField("gender")) { SoundManager.playBuzzer(); return; }
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      $gameVariables.setValue(38 + memberIdx, genderVal);
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (actor) {
        actor._gender = genderVal;
        if (actor.setGender) actor.setGender(genderVal);
      }
      const isSimple = Scene_CharacterCreation.isSimpleMode();
      // In simple mode, reproductive organs are always automatically set to the gender default.
      // In detailed mode, existing custom organs are kept unless unset.
      const CCU = window.CharacterCreationUtils;
      if (CCU && CCU.applyGenderAndReproduction) {
        CCU.applyGenderAndReproduction(memberIdx, genderVal, { keepOrgans: !isSimple });
      }
      const untouched = isSimple || (!actor || !actor.hormoneBalance || actor.hormoneBalance() === null);
      if (actor && actor.setHormoneBalance && untouched && (genderVal === 0 || genderVal === 1) &&
          CCU && CCU.defaultHormoneBalance) {
        actor.setHormoneBalance(CCU.defaultHormoneBalance(genderVal));
      }
      SoundManager.playCursor();
      const container = this._dndContainer;
      if (typeof document !== 'undefined' && typeof document.createElement === 'function' && container) {
        const leftPage = container.querySelector ? container.querySelector(".cc-page-left") : null;
        if (leftPage && typeof this._ccSwapPage === 'function') this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
        const rightPage = container.querySelector ? container.querySelector(".cc-page-right") : null;
        if (rightPage && typeof this._ccSwapPage === 'function') this._ccSwapPage(rightPage, this._bioPickerRightHtml());
        const sidebar = container.querySelector ? container.querySelector(".cc-compact-sidebar") : null;
        if (sidebar) sidebar.outerHTML = this._renderCompactSidebarHtml();
        return;
      }
      this.refreshUIOverlayDOM();
    }

    _ensureSimpleModeStatsAndTraits(actor) {
      if (!actor) return;
      // Auto-assign random traits if not yet selected
      if (!actor._selectedTraits || actor._selectedTraits.length === 0) {
        if (window.randomizeTraitsForActor) {
          const aId = typeof actor.actorId === "function" ? actor.actorId() : 1;
          window.randomizeTraitsForActor(aId);
        } else if (window.Health && Array.isArray(window.Health.Traits)) {
          const nonGenetic = window.Health.Traits.filter(t => (t.category || "mental") !== "genetic");
          if (nonGenetic.length > 0) {
            const pick = nonGenetic[Math.floor(Math.random() * nonGenetic.length)];
            actor._selectedTraits = [pick.id];
          }
        }
      }
      // Auto-assign specializations if not yet trained. The story mode never
      // spends anything here: what its protagonist knows is what her dossier
      // wrote down, and the board there only reads it back.
      if (!Scene_CharacterCreation._storyMode &&
          (!actor._specTrained || Object.keys(actor._specTrained).length === 0)) {
        const catalog = typeof this._specsCatalog === "function" ? this._specsCatalog() : [];
        if (Array.isArray(catalog) && catalog.length > 0) {
          actor._specTrained = {};
          const grantCtx = typeof this._specGrantContext === "function" ? this._specGrantContext(actor) : null;
          if (typeof this._randomSpendSpecs === "function") {
            this._randomSpendSpecs(actor, grantCtx, catalog, typeof CC_SPEC_BUDGET !== "undefined" ? CC_SPEC_BUDGET : 12);
          }
        }
      }
      // Ensure gender defaults for organs & hormones
      const memberIdx = ($gameParty && $gameParty.members) ? $gameParty.members().indexOf(actor) : 0;
      if (memberIdx >= 0) {
        const CCU = window.CharacterCreationUtils;
        const currentGender = $gameVariables.value(38 + memberIdx);
        if (CCU && CCU.applyGenderAndReproduction) {
          CCU.applyGenderAndReproduction(memberIdx, currentGender, { keepOrgans: false });
        }
        if (actor.setHormoneBalance && CCU && CCU.defaultHormoneBalance) {
          actor.setHormoneBalance(CCU.defaultHormoneBalance(currentGender));
        }
      }

      // Ensure Morality if unset
      if (actor._morality == null) {
        const moralityVals = [2, 1, 0, -1, -2];
        actor._morality = moralityVals[Math.floor(Math.random() * moralityVals.length)];
      }

      // Ensure Age if unset
      if (!actor._ageBand) {
        const ageVals = ["young", "adult", "middle", "elder"];
        actor._ageBand = ageVals[Math.floor(Math.random() * ageVals.length)];
      }

      // Ensure Wealth if unset
      if (!actor._wealthTier) {
        const wealthVals = ["destitute", "working", "middle", "wealthy"];
        actor._wealthTier = wealthVals[Math.floor(Math.random() * wealthVals.length)];
      }

      // Ensure Blood if unset
      if (!actor._bloodType && !actor._bloodTypeId) {
        const bloods = ["O_POS", "A_POS", "B_POS", "AB_POS", "O_NEG", "A_NEG", "B_NEG", "AB_NEG"];
        actor._bloodTypeId = bloods[Math.floor(Math.random() * bloods.length)];
      }

      // Ensure Hometown if unset
      if (!actor._hometownId && typeof getAvailableHometowns === "function") {
        const towns = getAvailableHometowns();
        if (towns && towns.length > 0) {
          actor._hometownId = towns[Math.floor(Math.random() * towns.length)].id;
        }
      }
    }

    // The bio page stays open in story mode (see _presetLockFreeStep), so the
    // four fields Em does not get to choose are refused here rather than by the
    // dossier lock: the chips and selects are already drawn as settled, this
    // catches the pad, the randomizer and anything else reaching in.
    _storyModeEmLocksField(field) {
      const CP = window.CharacterPresets;
      if (!CP || !CP.isStoryModeEm || !CP.isStoryModeEm()) return false;
      // The creed is not here: it is the one field of hers the player writes,
      // and onBioOptionChange judges it by the value rather than by the field.
      return field === "class" || field === "gender" || field === "job";
    }

    onBioOptionChange(field, value) {
      const CP = window.CharacterPresets;
      const isStoryEm = !!(CP && CP.isStoryModeEm && CP.isStoryModeEm());
      // Her creed is the one line of Em's sheet the story mode leaves open, and
      // only as far as the shelf of creeds that fits her goes.
      if (isStoryEm && field === "ideology") {
        const allowed = (CP.storyModeEmIdeologyChoices && CP.storyModeEmIdeologyChoices()) || [];
        if (!allowed.includes(String(value))) { SoundManager.playBuzzer(); return; }
      } else {
        if (this._refusePresetEdit()) return;
        if (this._storyModeEmLocksField(field)) { SoundManager.playBuzzer(); return; }
      }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      actor._bioSet = true;

      if (field === "class") {
        const classId = Number(value) || 1;
        actor.changeClass(classId, true);
        if (typeof equipRandomCompatibleWeapon === "function") {
          equipRandomCompatibleWeapon(actor, classId);
        }
        if (typeof equipClassStartingArmor === "function") {
          equipClassStartingArmor(actor, classId);
        }
        if (typeof giveClassStartingItems === "function") {
          giveClassStartingItems(actor, classId);
        }
        if (window.HealthCore && typeof window.HealthCore.ensureBodyPartSkills === "function" && typeof actor.isLearnedSkill === "function") {
          window.HealthCore.ensureBodyPartSkills(actor);
        }
        SoundManager.playCursor();
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
        return;
      }

      if (field === "job") {
        const jobId = Number(value) || 0;
        actor._jobId = jobId;
        if (actor._grantedJobItemIds && $gameParty) {
          actor._grantedJobItemIds.forEach(id => {
            if (typeof $dataItems !== 'undefined' && $dataItems[id]) {
              if (typeof $gameParty.loseItem === 'function') {
                $gameParty.loseItem($dataItems[id], 1);
              } else if (typeof $gameParty.gainItem === 'function') {
                $gameParty.gainItem($dataItems[id], -1);
              }
            }
          });
          actor._grantedJobItemIds = [];
        }
        if (jobId > 0) {
          const allJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
          const jobData = allJobs.find(j => j.id === jobId);
          if (jobData && Array.isArray(jobData.items)) {
            actor._grantedJobItemIds = [...jobData.items];
            if ($gameParty) {
              jobData.items.forEach(id => {
                if (typeof $dataItems !== 'undefined' && $dataItems[id]) {
                  $gameParty.gainItem($dataItems[id], 1);
                }
              });
            }
          }
        }
      } else if (field === "ideology") {
        actor._ideologyId = value;
        // Same as the wizard's own ideology step: the registry is NPCSocietyRegistry.
        if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getActorProfile) {
          const prof = window.NPCSocietyRegistry.getActorProfile(actor.actorId());
          if (prof) prof.ideologyId = value;
        }
      } else if (field === "morality") {
        actor._morality = Number(value);
      } else if (field === "hometown") {
        $gameSystem._ccHometown = value;
      } else if (field === "age") {
        if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
        $gameSystem._ccBirthAge[memberIdx] = Number(value);
      } else if (field === "wealth") {
        actor._wealthTier = Number(value);
      } else if (field === "blood") {
        actor._ccBloodType = value;
        actor._bloodType = value;
        if (window.BloodTypeService && window.BloodTypeService.setForActor) {
          window.BloodTypeService.setForActor(actor, value);
        }
      } else if (field === "reproduction") {
        // The player's own answer, which outranks whatever the gender pick
        // defaulted into the selector.
        const CCU = window.CharacterCreationUtils;
        if (CCU && CCU.setReproductionType) CCU.setReproductionType(memberIdx, Number(value));
        else $gameVariables.setValue([87, 115, 116][memberIdx] || 87, Number(value));
      } else if (field === "hormones") {
        // Written on the actor, where Health_BiologicSimulation reads it to
        // build (and then hold) the blood. Saying it at all is what makes it
        // theirs: an untouched body answers null and keeps taking its gender's
        // default, here and in the simulation both.
        if (actor.setHormoneBalance) actor.setHormoneBalance(Number(value));
      }

      const container = this._dndContainer;
      if (container) {
        const leftPage = container.querySelector(".cc-page-left");
        this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
        const rightPage = container.querySelector(".cc-page-right");
        this._ccSwapPage(rightPage, this._bioPickerRightHtml());
        return;
      }
      this.refreshUIOverlayDOM();
    }

    // Live feedback while the handle is being dragged. A full re-render on
    // every input event would rebuild the input mid-drag and drop it, so this
    // writes the value and repaints the one line that reports it; the release
    // (onchange) then goes through onBioOptionChange like every other control.
    onHormoneSliderPreview(value) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor || !actor.setHormoneBalance) return;
      const balance = Math.max(0, Math.min(100, Number(value) || 0));
      actor.setHormoneBalance(balance);
      const readout = document.getElementById("cc-hormone-readout");
      if (readout) readout.innerHTML = this._hormoneReadoutHtml(balance);
    }


    // ────────────────────────────────────────────────────────────────────
    // Romance tab: orientation, Kinsey placement, relationship style, bonds
    // ────────────────────────────────────────────────────────────────────
    // Nothing here is invented for the wizard. The two banks are the ones the
    // Empathize panel already reads an NPC out of (js/db/NPC/Orientations.json
    // and js/db/NPC/Relationships.json), so a character built here answers the
    // same questions, in the same words, as anybody the world generated; what
    // the player picks is written back as the same override the sandbox and a
    // landed proposal write (profile._orientOverride / _relStyleOverride).
    _romanceBanks() {
      if (!Scene_CharacterCreation._romanceBanks) {
        const read = (url) => {
          try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
          } catch (e) {
            console.warn("[CharacterCreation] could not read " + url, e);
          }
          return null;
        };
        Scene_CharacterCreation._romanceBanks = {
          orient: read("js/db/NPC/Orientations.json") || { sexual: [], romantic: [], kinseyScale: {} },
          rel: read("js/db/NPC/Relationships.json") || { styles: [], bonds: [] },
        };
      }
      return Scene_CharacterCreation._romanceBanks;
    }

    // Both banks carry i18n keys rather than words, the same way Orientations
    // and Relationships are read everywhere else: window.T, not the wizard's
    // own CharCreate-prefixed wrapper, since these keys name their own bank.
    _romanceText(value) {
      if (!value) return "";
      const key = String(value);
      return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : key;
    }

    _romanceEntry(list, key) {
      return (list || []).find((o) => o.key === key) || null;
    }

    // What an untouched character answers: the commonest orientation there is,
    // its matching romantic half, the Kinsey step that orientation sits on and
    // the commonest way of being tied to somebody. A default is not a choice,
    // so none of it is written onto the actor until the player picks.
    _romanceDefaults(actor) {
      const banks = this._romanceBanks();
      // A member who came out of a dossier answers with the dossier's own
      // orientation rather than the commonest one: Em is written asexual and
      // aromantic, so that is what her page opens on until the player says
      // otherwise.
      const preset = (actor && window.CharacterPresets && window.CharacterPresets.findPresetForActor)
        ? window.CharacterPresets.findPresetForActor(actor) : null;
      const sexual = (preset && this._romanceEntry(banks.orient.sexual, preset.sexualOrientation)) ||
        (banks.orient.sexual || [])[0] || null;
      const romantic = (preset && this._romanceEntry(banks.orient.romantic, preset.romanticOrientation)) ||
        (sexual && this._romanceEntry(banks.orient.romantic, sexual.correspondsTo)) ||
        (banks.orient.romantic || [])[0] || null;
      const styles = (banks.rel.styles || []).slice().sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
      return {
        sexualKey: sexual ? sexual.key : null,
        romanticKey: romantic ? romantic.key : null,
        kinsey: sexual && sexual.kinsey !== undefined ? sexual.kinsey : null,
        styleKey: styles[0] ? styles[0].key : null,
        bonds: {},
      };
    }

    _romanceState(actor) {
      const stored = (actor && actor._ccRomance) || {};
      const state = Object.assign(this._romanceDefaults(actor), stored);
      state.bonds = Object.assign({}, stored.bonds || {});
      return state;
    }

    // The society profile is keyed by name, and during creation a member may
    // not have been minted into one yet, so this is best-effort: where a
    // profile exists it is handed the same overrides the sandbox writes, and
    // the Empathize panel then reads the player's answer back instead of the
    // roll it would otherwise still be making.
    _romanceMirrorToProfile(actor) {
      if (!actor || !actor._ccRomance) return;
      const name = actor.name();
      if (!name) return;
      let profile = null;
      if (window.NPCEmpathize && window.NPCEmpathize._helpers && window.NPCEmpathize._helpers._getProfile) {
        try { profile = window.NPCEmpathize._helpers._getProfile(name); } catch (e) {}
      }
      if (!profile && typeof $gameSystem !== "undefined" && $gameSystem._npcSociety) {
        profile = $gameSystem._npcSociety[name] || null;
      }
      if (!profile) return;
      const state = actor._ccRomance;
      profile._orientOverride = profile._orientOverride || {};
      if (state.sexualKey) profile._orientOverride.sexualKey = state.sexualKey;
      if (state.romanticKey) profile._orientOverride.romanticKey = state.romanticKey;
      if (state.styleKey) profile._relStyleOverride = state.styleKey;
    }

    _romanceOrientChipsHtml(kind, currentKey) {
      const banks = this._romanceBanks();
      const list = banks.orient[kind] || [];
      const field = kind === "sexual" ? "sexual" : "romantic";
      return list.map((o) => {
        const selected = o.key === currentKey;
        const title = this._romanceText(o.desc).replace(/"/g, "&quot;");
        return `<button class="cc-bio-chip ${selected ? "selected" : ""}" title="${title}" onclick="SceneManager._scene.onRomanceOptionChange('${field}', '${o.key}')">${this._romanceText(o.name)}</button>`;
      }).join("");
    }

    // The Kinsey placement follows from the orientation, and is then the
    // player's to move: picking an orientation resets it to where that
    // orientation sits, picking a step here overrules that. X is the step for
    // a body that reports no attraction at all, so it stands apart from the 0
    // to 6 run rather than sitting after it.
    _romanceKinseyHtml(state) {
      const scale = this._romanceBanks().orient.kinseyScale || {};
      const steps = ["0", "1", "2", "3", "4", "5", "6", "X"];
      const current = state.kinsey === null || state.kinsey === undefined ? null : String(state.kinsey);
      const chips = steps.map((step) => {
        const selected = current === step;
        const title = this._romanceText(scale[step]).replace(/"/g, "&quot;");
        return `<button class="cc-bio-chip ${selected ? "selected" : ""}" title="${title}" onclick="SceneManager._scene.onRomanceOptionChange('kinsey', '${step}')">${step}</button>`;
      }).join("");
      const desc = current !== null ? this._romanceText(scale[current]) : "";
      return `
        <div class="cc-bio-chips-row">${chips}</div>
        ${desc ? `<div class="cc-bio-slider-readout"><b>${ccT("CharCreate.romance.kinseyLabel", "Kinsey")} ${current}</b>, ${desc}</div>` : ""}
      `;
    }

    _romanceStyleChipsHtml(currentKey) {
      const styles = this._romanceBanks().rel.styles || [];
      return styles.map((s) => {
        const selected = s.key === currentKey;
        const title = this._romanceText(s.desc).replace(/"/g, "&quot;");
        return `<button class="cc-bio-chip ${selected ? "selected" : ""}" title="${title}" onclick="SceneManager._scene.onRomanceOptionChange('style', '${s.key}')">${this._romanceText(s.name)}</button>`;
      }).join("");
    }

    // One row per other member of the party: who they are, and what this
    // character already is to them. The tie is written on both sides at once
    // (see onRomanceBondChange), so the row the other member sees on their own
    // Romance page always agrees with this one.
    _romanceBondsHtml(actor, state) {
      const bonds = this._romanceBanks().rel.bonds || [];
      const others = ($gameParty ? $gameParty.members() : []).filter((m) => m && m.actorId() !== actor.actorId());
      if (others.length === 0) {
        return `<div class="cc-bio-slider-readout cc-note-quiet">${ccT("CharCreate.romance.noOthers", "Nobody else has been created yet. Add a second member and their standing with this one can be set here.")}</div>`;
      }
      return others.map((other) => {
        const currentKey = state.bonds[other.actorId()] || "none";
        const options = bonds.map((b) => {
          const selected = b.key === currentKey;
          return `<option value="${b.key}" ${selected ? "selected" : ""}>${this._romanceText(b.name)}</option>`;
        }).join("");
        const entry = this._romanceEntry(bonds, currentKey);
        const desc = entry ? this._romanceText(entry.desc) : "";
        const avatar = other.characterName() ? this.getSpriteStyle(other.characterName(), other.characterIndex()) : "";
        return `
          <div class="cc-stack-gapped cc-gap-below">
            <div class="cc-row-inline">
              <span class="cc-compact-avatar cc-avatar-xs" style="${avatar}"></span>
              <span class="cc-col-grow cc-romance-name">${other.name()}</span>
            </div>
            <select class="cc-bio-select" onchange="SceneManager._scene.onRomanceBondChange(${other.actorId()}, this.value)">${options}</select>
            ${desc && currentKey !== "none" ? `<div class="cc-bio-slider-readout">${desc}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    _romancePickerLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-left"></div>`;

      const state = this._romanceState(actor);
      const banks = this._romanceBanks();
      const sexual = this._romanceEntry(banks.orient.sexual, state.sexualKey);
      const romantic = this._romanceEntry(banks.orient.romantic, state.romanticKey);
      const style = this._romanceEntry(banks.rel.styles, state.styleKey);

      const pctLine = (o) => o && o.pct != null
        ? `<div class="cc-bio-slider-readout">${o.pct}% ${ccT("CharCreate.romance.ofPopulation", "of the population")}${o.esoteric ? ", " + ccT("CharCreate.romance.esoteric", "esoteric") : ""}</div>`
        : "";
      const descLine = (o) => o && o.desc
        ? `<div class="cc-bio-slider-readout">${this._romanceText(o.desc)}</div>` : "";


      return `
        <div class="cc-page cc-page-left ts-page cc-page-column">
          <div class="cc-bio-container cc-step-scroll">
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(84, 16)} <span>${ccT("CharCreate.romance.romanticOrientation", "Romantic Orientation")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceOrientChipsHtml("romantic", state.romanticKey)}</div>
              ${descLine(romantic)}
              ${pctLine(romantic)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(267, 16)} <span>${ccT("CharCreate.romance.sexualOrientation", "Sexual Orientation")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceOrientChipsHtml("sexual", state.sexualKey)}</div>
              ${descLine(sexual)}
              ${pctLine(sexual)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(87, 16)} <span>${ccT("CharCreate.romance.kinseyScale", "Kinsey Scale Placement")}</span></div>
              ${this._romanceKinseyHtml(state)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(190, 16)} <span>${ccT("CharCreate.romance.style", "Preferred Relationship Style")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceStyleChipsHtml(state.styleKey)}</div>
              ${descLine(style)}
            </div>
            <div class="cc-bio-section cc-bio-section-flush">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT("CharCreate.romance.bonds", "Standing With The Rest Of The Party")}</span></div>
              ${this._romanceBondsHtml(actor, state)}
            </div>
          </div>
        </div>
      `;
    }

    _romancePickerRightHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-right"></div>`;

      const state = this._romanceState(actor);
      const banks = this._romanceBanks();
      const sexual = this._romanceEntry(banks.orient.sexual, state.sexualKey);
      const romantic = this._romanceEntry(banks.orient.romantic, state.romanticKey);
      const style = this._romanceEntry(banks.rel.styles, state.styleKey);
      const scale = banks.orient.kinseyScale || {};
      const kinseyKey = state.kinsey === null || state.kinsey === undefined ? null : String(state.kinsey);

      const classData = $dataClasses[actor._classId];
      const className = classData ? window.CCDbName(classData) : ccT("CharCreate.defaultClassName", "Operative");
      let avatarStyle = "";
      if (actor.characterName()) {
        avatarStyle = this.getSpriteStyle(actor.characterName(), actor.characterIndex());
      }

      const params = {
        name: actor.name(),
        romantic: this._romanceText(romantic && romantic.name),
        sexual: this._romanceText(sexual && sexual.name),
        style: this._romanceText(style && style.name),
        kinsey: kinseyKey === null ? "" : kinseyKey,
      };

      const bondEntries = Object.keys(state.bonds || {})
        .map((id) => ({ other: $gameActors.actor(Number(id)), key: state.bonds[id] }))
        .filter((b) => b.other && b.key && b.key !== "none" && $gameParty.members().includes(b.other));
      const bondLines = bondEntries.map((b) => {
        const entry = this._romanceEntry(banks.rel.bonds, b.key);
        return `<li class="cc-bond-line"><b>${this._romanceText(entry && entry.name)}</b>: ${b.other.name()}</li>`;
      }).join("");

      return `
        <div class="cc-page cc-page-right ts-page cc-page-column">
          <div class="cc-row-end">
            <button class="cc-profile-open-btn" onclick="SceneManager._scene.onRandomizeRomanceForCurrentActor()">${ccT("CharCreate.randomize", "Randomize")}</button>
          </div>
          <div class="cc-dossier-card cc-step-scroll-padded">
            <div class="cc-bio-identity">
              <span class="cc-compact-avatar cc-avatar-sm" style="${avatarStyle}"></span>
              <span class="cc-bio-identity-name">${actor.name()}</span>
              <span class="cc-bio-identity-class">(${className})</span>
            </div>
            <h3 class="cc-subheader cc-subheader-ruled">
              ${ccT("CharCreate.romance.summaryTitle", "Attachment Record")}
            </h3>
            <p class="cc-text-desc cc-prose-left">
              ${ccTp("CharCreate.romance.summaryPara1", params, "")}
            </p>
            ${kinseyKey !== null ? `
              <p class="cc-text-desc cc-prose-left">
                ${ccTp("CharCreate.romance.summaryPara2", params, "")} ${this._romanceText(scale[kinseyKey])}
              </p>
            ` : ""}
            ${bondLines ? `
              <h3 class="cc-subheader cc-subheader-ruled">
                ${ccT("CharCreate.romance.bondsTitle", "Ties Already Held")}
              </h3>
              <ul class="cc-bond-list">${bondLines}</ul>
            ` : `
              <p class="cc-text-desc cc-prose-aside">
                ${ccT("CharCreate.romance.noBonds", "This one starts out tied to nobody in the party.")}
              </p>
            `}
          </div>
        </div>
      `;
    }

    _romanceRepaint() {
      const container = this._dndContainer;
      if (container) {
        const leftPage = container.querySelector(".cc-page-left");
        this._ccSwapPage(leftPage, this._romancePickerLeftHtml());
        const rightPage = container.querySelector(".cc-page-right");
        this._ccSwapPage(rightPage, this._romancePickerRightHtml());
        this._refreshTopFolderTabs();
        return;
      }
      this.refreshUIOverlayDOM();
    }

    onRomanceOptionChange(field, value) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const banks = this._romanceBanks();
      const state = this._romanceState(actor);

      if (field === "sexual") {
        state.sexualKey = value;
        // The scale placement belongs to the orientation: picking one moves
        // the handle to where that orientation sits, and the player is then
        // free to move it off again.
        const entry = this._romanceEntry(banks.orient.sexual, value);
        state.kinsey = entry && entry.kinsey !== undefined ? entry.kinsey : null;
      } else if (field === "romantic") {
        state.romanticKey = value;
      } else if (field === "kinsey") {
        state.kinsey = value === "X" ? "X" : Number(value);
      } else if (field === "style") {
        state.styleKey = value;
      }

      actor._ccRomance = state;
      this._romanceMirrorToProfile(actor);
      this._romanceRepaint();
    }

    onRandomizeRomanceForCurrentActor() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      this._rollRomanceForActor(actor);
      this._romanceRepaint();
    }

    // A tie is a fact about two people, so it is written on both of them: the
    // other side gets the bond's inverse, which for a symmetric tie is the tie
    // itself and for a directed one (parent/child, mentor/student) is its
    // matching half.
    onRomanceBondChange(otherActorId, bondKey) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      const other = $gameActors.actor(Number(otherActorId));
      if (!actor || !other) return;

      const bonds = this._romanceBanks().rel.bonds || [];
      const entry = this._romanceEntry(bonds, bondKey);
      const inverseKey = entry && entry.inverse ? entry.inverse : bondKey;

      const state = this._romanceState(actor);
      const otherState = this._romanceState(other);
      if (bondKey === "none") {
        delete state.bonds[other.actorId()];
        delete otherState.bonds[actor.actorId()];
      } else {
        state.bonds[other.actorId()] = bondKey;
        otherState.bonds[actor.actorId()] = inverseKey;
      }
      actor._ccRomance = state;
      other._ccRomance = otherState;
      this._romanceMirrorToProfile(actor);
      this._romanceMirrorToProfile(other);
      this._romanceRepaint();
    }

    // The same weighted rolls the world uses for an NPC, done once here rather
    // than from the world seed: this is the player asking for a surprise, not
    // the world settling what somebody it generated turned out to be.
    // Rolling one character's attachments, kept apart from the button so the
    // whole-member randomizer can roll them too: "Randomize Member" leaves
    // nothing on the sheet untouched.
    _rollRomanceForActor(actor) {
      if (!actor) return;
      const banks = this._romanceBanks();
      const weighted = (list, key) => {
        if (!list || list.length === 0) return null;
        const total = list.reduce((sum, o) => sum + (Number(o[key]) || 0), 0);
        if (total <= 0) return list[Math.floor(Math.random() * list.length)];
        let roll = Math.random() * total;
        for (const o of list) {
          roll -= Number(o[key]) || 0;
          if (roll <= 0) return o;
        }
        return list[list.length - 1];
      };

      const state = this._romanceState(actor);
      const sexual = weighted(banks.orient.sexual, "pct");
      const romantic = (sexual && this._romanceEntry(banks.orient.romantic, sexual.correspondsTo)) ||
        weighted(banks.orient.romantic, "pct");
      const style = weighted(banks.rel.styles, "weight");
      if (sexual) {
        state.sexualKey = sexual.key;
        state.kinsey = sexual.kinsey !== undefined ? sexual.kinsey : null;
      }
      if (romantic) state.romanticKey = romantic.key;
      if (style) state.styleKey = style.key;

      actor._ccRomance = state;
      this._romanceMirrorToProfile(actor);
      this._romanceRepaint();
    }

    onRandomizeBioForCurrentActor() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      // Nothing about story mode's Em is rolled: she is who the story says.
      const CP = window.CharacterPresets;
      if (CP && CP.isStoryModeEm && CP.isStoryModeEm(actor)) { SoundManager.playBuzzer(); return; }
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      actor._bioSet = true;

      const allJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
      if (allJobs.length > 0) {
        const randomJob = allJobs[Math.floor(Math.random() * allJobs.length)];
        this.onBioOptionChange("job", randomJob.id);
      }

      const ideologies = ["techno_monism", "neo_feudalism", "cyber_anarchism", "transhumanism", "econ_dominion", "pragmatist", "democratic_socialist", "high_frequency_trader"];
      actor._ideologyId = ideologies[Math.floor(Math.random() * ideologies.length)];
      if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getActorProfile) {
        const prof = window.NPCSocietyRegistry.getActorProfile(actor.actorId());
        if (prof) prof.ideologyId = actor._ideologyId;
      }

      actor._morality = Math.floor(Math.random() * 5) - 2;

      const hometowns = ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"];
      $gameSystem._ccHometown = hometowns[Math.floor(Math.random() * hometowns.length)];

      if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
      $gameSystem._ccBirthAge[memberIdx] = 18 + Math.floor(Math.random() * 52);

      actor._wealthTier = Math.floor(Math.random() * 4);

      // A body as well as a life: any of the six organ sets, and a balance
      // anywhere on the scale rather than one of the two defaults.
      const reproChoices = ccReproChoices();
      this.onBioOptionChange("reproduction", reproChoices[Math.floor(Math.random() * reproChoices.length)].val);
      if (actor.setHormoneBalance) actor.setHormoneBalance(Math.floor(Math.random() * 101));

      const bloodList = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [];
      if (bloodList.length > 0) {
        const picked = bloodList[Math.floor(Math.random() * bloodList.length)];
        actor._ccBloodType = picked.id;
        actor._bloodType = picked.type || picked.id;
        if (window.BloodTypeService && window.BloodTypeService.setForActor) {
          window.BloodTypeService.setForActor(actor, picked.id);
        }
      } else {
        const bloodTypes = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "Synthetic-Δ", "Azure (Hemocyanin)"];
        actor._bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];
      }

      const container = this._dndContainer;
      if (container) {
        const leftPage = container.querySelector(".cc-page-left");
        this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
        const rightPage = container.querySelector(".cc-page-right");
        this._ccSwapPage(rightPage, this._bioPickerRightHtml());
        const sidebar = container.querySelector(".cc-compact-sidebar");
        if (sidebar) sidebar.outerHTML = this._renderCompactSidebarHtml();
        return;
      }
      this.refreshUIOverlayDOM();
    }

    // ── Familiar selection screen ──
    _petCatalog() {
      if (this._cachedPetCatalog && this._cachedPetCatalog.length > 0) {
        return this._cachedPetCatalog;
      }

      const catalog = [];
      const npcDb = (window.WorldGen && window.WorldGen.NPCs) || {};

      const formatName = (raw) => {
        return raw
          .replace(/^.*[\/\\]/, '')
          .replace(/^[\$!]+/, '')
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
          .trim();
      };

      const classifyKind = (entry, name) => {
        if (entry && entry.animal) return "Animal";
        if (entry && entry.creature) return "Creature";
        if (entry && entry.zombie) return "Undead";
        const lower = name.toLowerCase();
        if (/dog|cat|wolf|bear|falcon|crow|pig|cow|deer|fox|bat|rabbit|mole|goat|hyena|lion|tiger|horse|eagle|fish|whale|turtle|snake|toad|frog|beetle|ant|fly|crab|spider|scorpion|snail|bee|wasp|chicken|goose|pigeon|sheep|donkey|monkey|kangaroo|elephant|panda|penguin|otter|duck|camel|boar|rat|squirrel|skunk|opossum|weasel|slug|moth|grasshopper|chick|bull|doe|pug|mastiff|beaver|badger|hawk|raven|alligator|crocodile|dolphin|flamingo|leech|lizard|lobster|magpie|mule|parrot|pelican|poodle|rooster|salmon|seagull|shark|sparrow|viper|vulture|yak|zebra/.test(lower)) {
          return "Animal";
        }
        if (/golem|automaton|construct|mecha|turret|blade|dummy|statue|cube|sign|cone|tank|robot|sentinel|drone/.test(lower)) {
          return "Construct";
        }
        if (/zombie|skeleton|lich|ghost|specter|wight|mummy|cadaver|revenant|undead|bones|skull|ghoul|walker|death|exhumed|dessicated|necro|ossified|rot|shuffler/.test(lower)) {
          return "Undead";
        }
        return "Creature";
      };

      // 1. Load from NPCs.json database (animal, creature, beast entries)
      for (const [spriteKey, data] of Object.entries(npcDb)) {
        if (!data || (data.animal !== true && data.creature !== true && data.Archetype !== "Beast")) continue;
        const cleanName = formatName(spriteKey);
        const kind = classifyKind(data, cleanName);
        const id = spriteKey.toLowerCase().replace(/[^a-z0-9]/g, '_');

        let hash = 0;
        for (let i = 0; i < spriteKey.length; i++) {
          hash = (hash * 31 + spriteKey.charCodeAt(i)) & 0xffff;
        }
        const hp = 80 + (hash % 240);
        const atk = 10 + ((hash >> 3) % 26);
        const def = 8 + ((hash >> 6) % 22);
        const agi = 8 + ((hash >> 9) % 24);

        const icon = kind === "Animal" ? 292 : (kind === "Construct" ? 141 : (kind === "Undead" ? 136 : 176));
        const desc = ccT('CharCreate.petDesc', "A companion attuned to the surrounding ecosystem. Resilient, vigilant, and devoted to trailing and safeguarding the party.");

        catalog.push({
          id: id,
          name: cleanName,
          species: cleanName,
          kind: kind,
          icon: icon,
          sprite: spriteKey,
          spriteIndex: 0,
          hp: hp,
          atk: atk,
          def: def,
          agi: agi,
          desc: desc
        });
      }

      // 2. Also check img/characters/Monsters if Node fs is available
      try {
        const fs = require('fs');
        const path = require('path');
        const monstersPath = path.join(path.dirname(process.mainModule.filename), 'img/characters/Monsters/');
        if (fs.existsSync(monstersPath)) {
          const files = fs.readdirSync(monstersPath).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
          for (const file of files) {
            const rawName = file.replace(/\.(png|jpg|jpeg)$/i, '');
            const spriteKey = "Monsters/" + rawName;
            const id = spriteKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (catalog.some(c => c.id === id)) continue;
            const cleanName = formatName(rawName);
            const kind = classifyKind(null, cleanName);

            let hash = 0;
            for (let i = 0; i < rawName.length; i++) {
              hash = (hash * 31 + rawName.charCodeAt(i)) & 0xffff;
            }
            const hp = 80 + (hash % 240);
            const atk = 10 + ((hash >> 3) % 26);
            const def = 8 + ((hash >> 6) % 22);
            const agi = 8 + ((hash >> 9) % 24);
            const icon = kind === "Animal" ? 292 : (kind === "Construct" ? 141 : (kind === "Undead" ? 136 : 176));

            catalog.push({
              id: id,
              name: cleanName,
              species: cleanName,
              kind: kind,
              icon: icon,
              sprite: spriteKey,
              spriteIndex: 0,
              hp: hp,
              atk: atk,
              def: def,
              agi: agi,
              desc: ccTp('CharCreate.petDescKind', { kind: kind.toLowerCase() }, `A wilderness ${kind.toLowerCase()} companion attuned to the surrounding ecosystem.`)
            });
          }
        }
      } catch (e) {}

      catalog.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      this._cachedPetCatalog = catalog;
      return catalog;
    }

    _petCategories() {
      return [
        { id: "all",       label: ccT('CharCreate.filterAll', 'All') },
        { id: "Animal",    label: ccT('CharCreate.petKindAnimals', 'Animals') },
        { id: "Creature",  label: ccT('CharCreate.petKindCreatures', 'Creatures') },
        { id: "Construct", label: ccT('CharCreate.petKindConstructs', 'Constructs') },
        { id: "Undead",    label: ccT('CharCreate.petKindUndead', 'Undead') },
      ];
    }

    // Travelling alone leads the board. It was always allowed, but the only way
    // to say so was to take a companion and then hand it back, so the card that
    // means "none" sits first, ahead of every filter and every search.
    // The board belongs to a familiar in the story mode and to the party's
    // pets everywhere else, and every word on it follows the tab rather than
    // half of them saying one thing and half the other.
    _petWord(storyKey, storyFallback, petsKey, petsFallback) {
      return Scene_CharacterCreation._storyMode
        ? ccT(storyKey, storyFallback)
        : ccT(petsKey, petsFallback);
    }

    _petNoneCard() {
      return {
        id: PET_NONE_ID,
        name: this._petWord('CharCreate.noCompanion', 'No familiar', 'CharCreate.petsNone', 'No pet'),
        kind: ccT('CharCreate.petKindNone', 'Alone'),
        sprite: "",
        spriteIndex: 0,
        desc: this._petWord('CharCreate.noCompanionDesc', 'Set out with nobody at your heel.', 'CharCreate.petsNoneDesc', 'Set out with nobody at your heel.'),
      };
    }

    _petPickerLeftHtml() {
      const activeCat = Scene_CharacterCreation._activePetCategory || "all";
      const searchQuery = (Scene_CharacterCreation._petSearchQuery || "").trim().toLowerCase();
      const categories = this._petCategories();
      const catalog = this._petCatalog();
      let filtered = activeCat === "all" ? catalog : catalog.filter((p) => p.kind === activeCat);
      if (searchQuery) {
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(searchQuery) || p.kind.toLowerCase().includes(searchQuery));
      }
      // The count is of monsters, so it is taken before the none card joins them.
      const petCount = filtered.length;
      filtered = [this._petNoneCard()].concat(filtered);

      const petRailFocused = !!this._pageRailFocused;
      const catTabsHtml = categories.map((cat) => `
        <button class="ts-tab ${cat.id === activeCat ? 'active' : ''} ${cat.id === activeCat && petRailFocused ? 'selected' : ''}" onclick="SceneManager._scene.onPetCategorySelect('${cat.id}')">
          ${cat.label}
        </button>
      `).join("");

      // Store filtered list for the virtual scroll handler
      Scene_CharacterCreation._petVirtFiltered = filtered;
      // Reset scroll offset when filter/search changes
      const filterKey = activeCat + "|" + searchQuery;
      if (Scene_CharacterCreation._petVirtFilterKey !== filterKey) {
        Scene_CharacterCreation._petVirtFilterKey = filterKey;
        Scene_CharacterCreation._petVirtScrollTop = 0;
      }

      // Render only the initial visible window of cards (no full 600+ render)
      const initialCards = this._buildPetCardsWindow(filtered, 0);

      return `
        <div class="cc-page cc-page-full ts-page cc-page-column">
          <div class="cc-row-controls">
            <input type="text" class="backpack-search-input cc-rail-search"
                   placeholder="${this._petWord('CharCreate.petSearchPlaceholder', 'Search familiar monsters...', 'CharCreate.petsSearchPlaceholder', 'Search pet monsters...')}"
                   value="${Scene_CharacterCreation._petSearchQuery || ''}"
                   oninput="SceneManager._scene.onPetSearch(this.value)" />
            <span class="cc-count-badge">${ccTp('CharCreate.petCount', { n: petCount }, petCount + ' monsters')}</span>
          </div>
          <div class="ts-tab-row">${catTabsHtml}</div>
          <div class="cc-pet-grid" id="cc-pet-grid-virt">
            ${initialCards}
          </div>
        </div>
      `;
    }

    // ── Virtual scroll: what the grid actually measures ──
    // The window used to be computed from guesses: four columns, a 110px card
    // and a 480px viewport. The grid is `auto-fill minmax(130px, 1fr)`, so it
    // draws five or six columns on a wide board, and every guessed row was a
    // row of height the spacer added and nothing filled: the roster ended
    // halfway up a scrollbar that kept going. The live grid is measured
    // instead, and the guesses are only the fallback for the first render,
    // before there is a grid to measure.
    _petGridMetrics() {
      const CARD_MIN = 130;
      const GAP = 8;
      const fallback = { cols: 4, rowH: 118, viewH: 480 };
      const grid = typeof document !== "undefined" && document.getElementById
        ? document.getElementById("cc-pet-grid-virt") : null;
      if (!grid) return fallback;

      let cols = 0;
      if (typeof window !== "undefined" && window.getComputedStyle) {
        const template = window.getComputedStyle(grid).gridTemplateColumns || "";
        cols = template.split(" ").filter((v) => v && v !== "none").length;
      }
      if (!cols) {
        const inner = (grid.clientWidth || 0) - 12; // the grid's own 6px padding
        cols = Math.max(1, Math.floor((inner + GAP) / (CARD_MIN + GAP)));
      }
      const card = grid.querySelector(".cc-pet-card");
      const rowH = ((card && card.offsetHeight) || (fallback.rowH - GAP)) + GAP;
      const viewH = grid.clientHeight || fallback.viewH;
      return { cols: cols, rowH: rowH, viewH: viewH };
    }

    // ── Virtual scroll: card window renderer ──
    // Renders a slice of `filtered` that covers the viewport + overscan buffer.
    // `scrollTop` is the current scroll position of the grid container.
    _buildPetCardsWindow(filtered, scrollTop, metrics) {
      if (!filtered || filtered.length === 0) {
        return `<div class="cc-empty-note">${this._petWord('CharCreate.petNoneFound', 'No familiar monsters match this filter', 'CharCreate.petsNoneFound', 'No pet monsters match this filter')}</div>`;
      }

      const OVERSCAN_ROWS = 3; // extra rows rendered above/below the viewport
      const m = metrics || this._petGridMetrics();
      const COLS = Math.max(1, m.cols);
      const ROW_H = Math.max(1, m.rowH);

      const visibleRows = Math.ceil(m.viewH / ROW_H) + OVERSCAN_ROWS * 2;
      const visibleCount = visibleRows * COLS;

      const totalItems  = filtered.length;
      const totalRows   = Math.ceil(totalItems / COLS);
      const totalHeight = totalRows * ROW_H;

      const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN_ROWS);
      const startIdx = firstRow * COLS;
      const endIdx   = Math.min(totalItems, startIdx + visibleCount);

      const topPad    = firstRow * ROW_H;
      const renderedRows = Math.ceil((endIdx - startIdx) / COLS);
      // The last rendered row has no gap under it, and the grid's own gap sits
      // between the spacer and the cards: counting a full row height for both
      // is what left a strip of nothing under the final card.
      const bottomPad = Math.max(0, totalHeight - topPad - renderedRows * ROW_H);

      const selectedPet = $gameSystem._partyPet;
      const slice = filtered.slice(startIdx, endIdx);

      const cardsHtml = slice.map((pet) => {
        // With nobody chosen, the none card is the one standing selected.
        const isSelected = selectedPet ? selectedPet.id === pet.id : pet.id === PET_NONE_ID;
        return `
          <div class="cc-pet-card ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onPetCardSelect('${pet.id}')">
            <div class="cc-pet-avatar">
              <div class="cc-sprite cc-sprite-x12" style="${this.getSpriteStyle(pet.sprite, pet.spriteIndex || 0)}"></div>
            </div>
            <div class="cc-pet-name" title="${pet.name}">${pet.name}</div>
            <div class="cc-pet-kind">${pet.kind}</div>
          </div>
        `;
      }).join("");

      // Spacer divs maintain correct scrollbar height without DOM nodes for off-screen cards
      const topSpacer    = topPad    > 0 ? `<div class="cc-grid-spacer" style="--cc-spacer-h:${topPad}px"></div>` : "";
      const bottomSpacer = bottomPad > 0 ? `<div class="cc-grid-spacer" style="--cc-spacer-h:${bottomPad}px"></div>` : "";

      return `${topSpacer}${cardsHtml}${bottomSpacer}`;
    }

    // ── Virtual scroll: attach scroll listener after DOM insertion ──
    // Called once per full DOM rebuild. Re-binds are guarded by _petVirtBound.
    _attachPetVirtualScroll() {
      const grid = document.getElementById("cc-pet-grid-virt");
      if (!grid || grid._petVirtBound) return;
      grid._petVirtBound = true;

      // The first window was built before this grid existed, off the fallback
      // guesses, so it is rebuilt once now that the real column count, card
      // height and viewport can be measured. Without this the scrollbar is
      // sized for a grid nobody is looking at.
      const savedScroll = Scene_CharacterCreation._petVirtScrollTop || 0;
      const remeasure = (scrollTop) => {
        const filtered = Scene_CharacterCreation._petVirtFiltered || [];
        grid.innerHTML = this._buildPetCardsWindow(filtered, scrollTop, this._petGridMetrics());
        grid._petVirtBound = true; // re-mark after innerHTML wipe
      };
      if (savedScroll > 0) grid.scrollTop = savedScroll;
      remeasure(savedScroll);

      // Passive scroll listener: patches grid content only, no layout rebuild
      grid.addEventListener("scroll", () => {
        const st = grid.scrollTop;
        Scene_CharacterCreation._petVirtScrollTop = st;
        remeasure(st);
      }, { passive: true });

      // A board that changes width (the window resized, the sidebar folded)
      // changes its column count with it, so the window is measured again.
      if (typeof ResizeObserver !== "undefined" && !grid._petVirtResize) {
        grid._petVirtResize = new ResizeObserver(() => remeasure(grid.scrollTop));
        grid._petVirtResize.observe(grid);
      }
    }

    // The three optional traits a chosen companion can carry, kept as one
    // scene-level toggle set: they describe how the eventual companion is
    // built, not any one catalogue entry, the same way its eventual name is
    // never tied to the card being previewed either.
    _petTraits() {
      if (!Scene_CharacterCreation._petTraits) {
        Scene_CharacterCreation._petTraits = { sentient: false, magical: false, geneticFreak: false };
      }
      return Scene_CharacterCreation._petTraits;
    }

    // The companion sidebar: the beast the board is pointing at, its numbers and
    // its nature. This used to be the right half of the spread, which cost the
    // roster half its width and said nothing the sidebar could not.
    _petSidebarHtml() {
      const catalog = this._petCatalog();
      const selectedPet = $gameSystem._partyPet;
      const hoveredId = Scene_CharacterCreation._hoveredPetId || (selectedPet ? selectedPet.id : (catalog[0] && catalog[0].id));
      const pet = catalog.find((p) => p.id === hoveredId) || catalog[0];
      if (!pet) return `<div class="cc-compact-sidebar"></div>`;
      const isChosen = selectedPet && selectedPet.id === pet.id;
      const traits = this._petTraits();
      const attrs = (window.PetSystem && window.PetSystem.previewAttrs)
        ? window.PetSystem.previewAttrs(traits.sentient, traits.magical, traits.geneticFreak)
        : { STR: 10, CON: 10, INT: 10, WIS: 10, PSI: 10 };

      const spriteStyle = this.getSpriteStyle(pet.sprite, pet.spriteIndex || 0);
      const SL = ccStatLabels();

      // The companion reads down the sidebar the way a party member does: the
      // same identity card, the same portrait box and the same eight stat
      // boxes, so a beast and a character are looked at in the same place
      // rather than one being a table of rows and the other a stat sheet.
      const stats = [
        { key: "HP",  label: SL.HP,  val: pet.hp,   color: "var(--stat-hp)", vital: true },
        { key: "STR", label: SL.STR, val: pet.atk,  color: "var(--stat-str)" },
        { key: "CON", label: SL.CON, val: pet.def,  color: "var(--stat-con)" },
        { key: "DEX", label: SL.DEX, val: pet.agi,  color: "var(--stat-dex)" },
        { key: "INT", label: SL.INT, val: attrs.INT, color: "var(--stat-int)" },
        { key: "WIS", label: SL.WIS, val: attrs.WIS, color: "var(--stat-wis)" },
        { key: "PSI", label: SL.PSI, val: attrs.PSI, color: "var(--stat-psi)" },
      ];
      const statsHtml = `
        <div class="cc-vitals-block">
          <div class="cc-stat-grid">
            ${stats.map((st) => {
              if (st.vital) {
                return `
                  <div class="cc-stat-box">
                    <span class="cc-stat-label cc-inked" style="--cc-ink:${st.color}">${st.label}</span>
                    <span class="cc-stat-val">${st.val}</span>
                  </div>
                `;
              }
              const mod = Math.floor((st.val - 10) / 2);
              const modStr = mod >= 0 ? "+" + mod : String(mod);
              return `
                <div class="cc-stat-box">
                  <span class="cc-stat-label">${st.label}</span>
                  <span class="cc-stat-val">${st.val} <span class="cc-stat-mod">(${modStr})</span></span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;

      return `
        <div class="cc-compact-sidebar cc-pet-sidebar">
          <div class="cc-compact-sidebar-body">
            <div class="cc-compact-identity-card">
              <div class="cc-row-inline cc-row-gap-wide">
                <div class="cc-compact-avatar-wrap cc-compact-avatar-wrap--static" title="${pet.species}">
                  <div class="cc-compact-avatar" style="${spriteStyle}"></div>
                </div>
                <div class="cc-col cc-col-gap-1 cc-col-grow">
                  <div class="cc-row-spread">
                    <span class="cc-pet-sidebar-name">${pet.name}</span>
                    <button class="cc-profile-open-btn cc-profile-open-btn--icon" onclick="SceneManager._scene.onRandomizePet()" title="${ccT('CharCreate.randomize', 'Randomize')}">
                      ${this._ccIconHtml(83, 16)}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            ${statsHtml}

            ${this._ccLoadoutSectionHtml(
              ccT('CharCreate.petTraitsTitle', 'Traits'),
              `<div class="cc-row-inline cc-gap-below">
                 <button class="cc-bio-chip ${traits.sentient ? 'active' : ''}" onclick="SceneManager._scene.onTogglePetTrait('sentient')">${ccT('CharCreate.petTraitSentient', 'Sentient')}</button>
                 <button class="cc-bio-chip ${traits.magical ? 'active' : ''}" onclick="SceneManager._scene.onTogglePetTrait('magical')">${ccT('CharCreate.petTraitMagical', 'Magical')}</button>
                 <button class="cc-bio-chip ${traits.geneticFreak ? 'active' : ''}" onclick="SceneManager._scene.onTogglePetTrait('geneticFreak')">${ccT('CharCreate.petTraitGeneticFreak', 'Genetic Freak')}</button>
               </div>`,
              "",
              true
            )}

          </div>

          <div class="cc-compact-actions cc-stack">
            <button class="cc-compact-btn ${isChosen ? '' : 'primary'}" onclick="SceneManager._scene.onPetCardSelect('${pet.id}')">${isChosen ? ccT('CharCreate.selectedCompanion', 'Companion selected') : this._petWord('CharCreate.chooseAsCompanion', 'Choose as initial familiar', 'CharCreate.petsChoose', 'Choose as starting pet')}</button>
          </div>
        </div>
      `;
    }

    onPetTabClick() {
      this._pageRailFocused = false;
      Scene_CharacterCreation._railFocus = null;
      Scene_CharacterCreation._isPetMode = true;
      Scene_CharacterCreation._isVehicleMode = false;
      if (this._presetWindow) this.onPresetCancel();
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onPetSearch(query) {
      Scene_CharacterCreation._petSearchQuery = query;
      const activeCat = Scene_CharacterCreation._activePetCategory || "all";
      const q = (query || "").trim().toLowerCase();
      const catalog = this._petCatalog();
      let filtered = activeCat === "all" ? catalog : catalog.filter((p) => p.kind === activeCat);
      if (q) {
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q));
      }
      Scene_CharacterCreation._petVirtFiltered = filtered;
      Scene_CharacterCreation._petVirtScrollTop = 0;

      const grid = document.getElementById("cc-pet-grid-virt");
      // The tally beside the search box, which the page prints as a count badge:
      // the old selector named the money badge and never found anything, so the
      // count froze at whatever the last full rebuild had written.
      const badge = this._dndContainer && this._dndContainer.querySelector(".cc-count-badge");
      if (badge) {
        badge.textContent = ccTp('CharCreate.petCount', { n: filtered.length }, filtered.length + ' monsters');
      }
      if (grid) {
        grid.scrollTop = 0;
        grid.innerHTML = this._buildPetCardsWindow(filtered, 0, this._petGridMetrics());
        grid._petVirtBound = true;
      } else {
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
      }
    }

    onPetCategorySelect(category) {
      Scene_CharacterCreation._activePetCategory = category;
      Scene_CharacterCreation._petVirtScrollTop = 0;
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // Flips one of the three optional traits and redraws just the sidebar,
    // the same in-place update onPetCardSelect does for a new hover.
    onTogglePetTrait(key) {
      const traits = this._petTraits();
      traits[key] = !traits[key];
      SoundManager.playCursor();

      const sidebarSlot = this._dndContainer && this._dndContainer.querySelector(".cc-sidebar-slot");
      const sidebar = this._dndContainer && this._dndContainer.querySelector(".cc-compact-sidebar");
      if (sidebarSlot) sidebarSlot.innerHTML = this._petSidebarHtml();
      else if (sidebar) sidebar.outerHTML = this._petSidebarHtml();
      else {
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
      }
    }

    onPetCardSelect(petId) {
      if (petId === PET_NONE_ID) {
        this.onRemovePet();
        return;
      }
      const pet = this._petCatalog().find((p) => p.id === petId);
      if (!pet) return;
      $gameSystem._partyPet = pet;
      Scene_CharacterCreation._hoveredPetId = petId;

      const sidebarSlot = this._dndContainer && this._dndContainer.querySelector(".cc-sidebar-slot");
      const sidebar = this._dndContainer && this._dndContainer.querySelector(".cc-compact-sidebar");
      const grid = document.getElementById("cc-pet-grid-virt");
      if ((sidebarSlot || sidebar) && grid) {
        if (sidebarSlot) sidebarSlot.innerHTML = this._petSidebarHtml();
        else sidebar.outerHTML = this._petSidebarHtml();
        const cards = grid.querySelectorAll(".cc-pet-card");
        cards.forEach((c) => {
          if (c.getAttribute("onclick") && c.getAttribute("onclick").includes(`'${petId}'`)) {
            c.classList.add("selected");
          } else {
            c.classList.remove("selected");
          }
        });
        const tabDot = this._dndContainer && this._dndContainer.querySelector(".cc-pet-tab .cc-tab-dot");
        if (tabDot) tabDot.classList.add("done");
        const petTabLabel = this._dndContainer && this._dndContainer.querySelector(".cc-pet-tab span:nth-child(2)");
        if (petTabLabel) petTabLabel.textContent = pet.name;
      } else {
        this._lastStep = -1;
        this._lastIndex = -1;
        this.refreshUIOverlayDOM();
      }
    }

    onRemovePet(event) {
      if (event) event.stopPropagation();
      $gameSystem._partyPet = null;
      SoundManager.playCancel();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onRandomizePet() {
      const catalog = this._petCatalog();
      const pet = catalog[Math.floor(Math.random() * catalog.length)];
      $gameSystem._partyPet = pet;
      Scene_CharacterCreation._hoveredPetId = pet.id;
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    //=========================================================================
    // The Vehicles tab
    //=========================================================================
    //
    // The story mode's vehicle page, opened as a page of the dossier by every
    // mode instead of only by the story mode, and a party may take more than one
    // of them. The picks are choice symbols on $gameSystem._ccStartVehicles;
    // applyStartingVehicles (CharacterCreation.js) is what turns them into keys
    // in the pack when creation ends, so nothing here touches the party.
    _vehicleCatalog() {
      const CCV = window.CCStartVehicles;
      if (!CCV) return [];
      return CCV.symbols().map((symbol) => {
        const spec = CCV.spec(symbol);
        const suffix = symbol.replace("vehicle_", "");
        const key = suffix.charAt(0).toUpperCase() + suffix.slice(1);
        return {
          symbol: symbol,
          spec: spec,
          name: ccT("CharCreate.choice.vehicle" + key + ".name", key),
          desc: ccT("CharCreate.choice.vehicle" + key + ".desc", ""),
          sprite: spec.sprite,
        };
      });
    }

    _selectedVehicleSymbols() {
      if (!Array.isArray($gameSystem._ccStartVehicles)) $gameSystem._ccStartVehicles = [];
      return $gameSystem._ccStartVehicles;
    }

    _vehiclePickerLeftHtml() {
      const catalog = this._vehicleCatalog();
      const chosen = this._selectedVehicleSymbols();
      const cards = catalog.map((v) => {
        const isSel = chosen.indexOf(v.symbol) >= 0;
        return `
          <div class="cc-pet-card cc-vehicle-card ${isSel ? 'selected' : ''}" onclick="SceneManager._scene.onVehicleCardToggle('${v.symbol}')" onmouseenter="SceneManager._scene.onVehicleCardHover('${v.symbol}')">
            <div class="cc-pet-avatar">
              <div class="cc-sprite cc-sprite-x12" style="${this.getSpriteStyle(v.sprite, 0)}"></div>
            </div>
            <div class="cc-pet-name" title="${v.name}">${v.name}</div>
            <div class="cc-pet-kind">${isSel ? ccT('CharCreate.vehicleOwned', 'In the garage') : ccT('CharCreate.vehicleFree', 'Not taken')}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="cc-page cc-page-full ts-page cc-page-column">
          <div class="cc-row-controls">
            <h3 class="cc-subheader cc-subheader--flush">${T('CharCreate.chooseYourVehicle')}</h3>
            <span class="cc-count-badge">${ccTp('CharCreate.vehicleCount', { n: chosen.length }, chosen.length + ' selected')}</span>
          </div>
          <div class="cc-pet-grid">
            ${cards}
          </div>
        </div>
      `;
    }

    _vehicleSidebarHtml() {
      const catalog = this._vehicleCatalog();
      if (catalog.length === 0) return `<div class="cc-compact-sidebar"></div>`;
      const chosen = this._selectedVehicleSymbols();
      const hovered = Scene_CharacterCreation._hoveredVehicleSymbol || chosen[0] || catalog[0].symbol;
      const v = catalog.find((c) => c.symbol === hovered) || catalog[0];
      const isSel = chosen.indexOf(v.symbol) >= 0;
      return `
        <div class="cc-compact-sidebar cc-vehicle-sidebar">
          <div class="cc-compact-sidebar-body">
            <div class="cc-compact-identity-card">
              <div class="cc-row-spread">
                <span class="cc-pet-sidebar-name">${v.name}</span>
              </div>
            </div>

            <div class="cc-compact-portrait-card cc-vehicle-portrait">
              <div class="cc-compact-bust-full empty cc-fill-center">
                <div class="cc-wanted-sprite cc-sprite-x4" style="${this.getSpriteStyle(v.sprite, 0)}"></div>
              </div>
            </div>

            <p class="cc-text-desc cc-text-desc--body">${v.desc}</p>

          </div>

          <div class="cc-compact-actions cc-stack">
            <button class="cc-compact-btn ${isSel ? '' : 'primary'}" onclick="SceneManager._scene.onVehicleCardToggle('${v.symbol}')">${isSel ? ccT('CharCreate.vehicleDrop', 'Leave it behind') : ccT('CharCreate.vehicleTake', 'Take this vehicle')}</button>
          </div>
        </div>
      `;
    }

    onVehicleTabClick() {
      // The story mode sets out in The Beast, parked where Em left it, and is
      // never asked what it drives.
      if (Scene_CharacterCreation._storyMode) { SoundManager.playBuzzer(); return; }
      this._pageRailFocused = false;
      Scene_CharacterCreation._railFocus = null;
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = true;
      if (this._presetWindow) this.onPresetCancel();
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onVehicleCardHover(symbol) {
      if (Scene_CharacterCreation._hoveredVehicleSymbol === symbol) return;
      Scene_CharacterCreation._hoveredVehicleSymbol = symbol;
      const sidebarSlot = this._dndContainer && this._dndContainer.querySelector(".cc-sidebar-slot");
      if (sidebarSlot) sidebarSlot.innerHTML = this._vehicleSidebarHtml();
    }

    onVehicleCardToggle(symbol) {
      const chosen = this._selectedVehicleSymbols();
      const at = chosen.indexOf(symbol);
      if (at >= 0) {
        chosen.splice(at, 1);
        SoundManager.playCancel();
      } else {
        chosen.push(symbol);
      }
      Scene_CharacterCreation._hoveredVehicleSymbol = symbol;
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onRandomizeVehicles() {
      const catalog = this._vehicleCatalog();
      if (catalog.length === 0) return;
      const pick = catalog[Math.floor(Math.random() * catalog.length)];
      $gameSystem._ccStartVehicles = [pick.symbol];
      Scene_CharacterCreation._hoveredVehicleSymbol = pick.symbol;
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // NEW: Creates a completely random character and skips to Add Party Member step
    createTotalRandomCharacter() {
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;

      if (!this._randomizeMemberCharacter(currentMemberIndex)) {
        this.nextStep();
        return;
      }

      // Remember that this member was rolled randomly so the add-member step can
      // offer a "Reroll character" option.
      Scene_CharacterCreation._lastMemberWasRandom = true;

      // A random character has everything decided already, so skip the trait
      // and flavor steps and land directly on the Add Party Member prompt.
      this._step = STEP.ADD_MEMBER;
      this.setupStep();
    }

    // Randomize every party slot at once, then jump straight to the origin step
    // instead of asking to add more members. (Settings/difficulty already ran at
    // the start of the flow.)
    // The world of chaos builds nobody: three characters are rolled and the
    // wizard opens on the scenario board with them already seated. Rolled once
    // per visit to the wizard, so re-entering a sub screen does not hand the
    // player a different party than the one on the page.
    startChaosParty() {
      this.createTotalRandomPartyAll();
      Scene_CharacterCreation._isScenarioMode = true;
      this._step = STEP.ORIGIN;
      this._lastStep = -1;
      this._lastIndex = -1;
    }

    // The Randomize Party button on the scenario board: three new characters
    // without leaving the page.
    onChaosRerollParty() {
      this.createTotalRandomPartyAll();
      Scene_CharacterCreation._isScenarioMode = true;
      this._step = STEP.ORIGIN;
      // The wizard is silent on a confirm: only the cursor, the refusal and
      // the cancel are heard on it (test_cc_reachability).
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    createTotalRandomPartyAll() {
      const MAX_PARTY = 3;

      for (let i = 0; i < MAX_PARTY; i++) {
        const actorId = i + 1; // Actor IDs are 1-based
        // Make sure the slot exists in the party before randomizing it.
        if (!$gameParty.members().some((a) => a.actorId() === actorId)) {
          $gameParty.addActor(actorId);
        }
        Scene_CharacterCreation._isCreatureMode = false;
        this._randomizeMemberCharacter(i);
      }

      // Reset back to the first member for any downstream references.
      Scene_CharacterCreation._currentPartyMemberIndex = 0;
      Scene_CharacterCreation._isCreatureMode = false;
      // Remember this jump so Back from origin can return to character-type
      // selection instead of stepping through skipped per-member steps.
      Scene_CharacterCreation._randomizedAllParty = true;

      // Jump to the origin step (nextStep increments ADD_MEMBER -> ORIGIN). The
      // origin handler finalizes creation.
      this._step = STEP.ADD_MEMBER;
      this.nextStep();
    }

    // Randomizes a single party member (name, class/creature, gender,
    // reproduction, traits, sprite and bust). Returns false if the actor is
    // missing. Does NOT advance the wizard step.
    _randomizeMemberCharacter(currentMemberIndex, options = {}) {
      Scene_CharacterCreation._currentPartyMemberIndex = currentMemberIndex;
      const currentActor = Scene_CharacterCreation.getCurrentActor();

      if (!currentActor) {
        console.error("No actor available for randomization!");
        return false;
      }

      // Generate random name using Markov chain from "names" database
      const randomName = Scene_CharacterCreation.generateRandomMarkovName(currentMemberIndex);

      // Set the actor's name
      currentActor.setName(randomName);

      // Get the correct creature switch based on current party member (77, 78, or 79)
      const creatureSwitchId = 77 + currentMemberIndex; // 77 for actor 1, 78 for actor 2, 79 for actor 3

      // Randomly decide: regular character (forceHumanoid forces regular)
      const isCreature = options.forceHumanoid ? false : (Math.random() < 0.2);

      if (isCreature) {
        // Set up as creature
        $gameSwitches.setValue(creatureSwitchId, true);
        Scene_CharacterCreation._isCreatureMode = true;
        currentActor._isCreatureActor = true;
        currentActor.changeClass(65, false);
      } else {
        // Set up as regular character
        $gameSwitches.setValue(creatureSwitchId, false);
        Scene_CharacterCreation._isCreatureMode = false;
        currentActor._isCreatureActor = false;

        // Random class selection, out of the sentient roster alone (1-62): the
        // creature classes above it belong to a creature's archetypes.
        const validClasses = (window.CreatureClasses && window.CreatureClasses.sentientRoster)
          ? window.CreatureClasses.sentientRoster()
          : [1, 2, 3, 4, 5, 6, 7, 8];
        if (validClasses.length > 0) {
          const randomClass = { id: validClasses[Math.floor(Math.random() * validClasses.length)] };
          currentActor.changeClass(randomClass.id, true);

          // Equip the class's fixed starting weapon(s) and armor
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

      // Random gender (0-3: Male, Female, Non-binary, Cocoon)
      const randomGender = Math.floor(Math.random() * 4);

      // Determine which variables to use based on party member index
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
          genderVar = VAR_PLAYER1_GENDER;
          reproductiveVar = VAR_PLAYER1_REPRODUCTIVE_TYPE;
      }

      // Set gender variable
      $gameVariables.setValue(genderVar, randomGender);

      // Set reproduction type based on gender
      switch (randomGender) {
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

      // Random traits
      const targetActorId = currentMemberIndex + 1; // Actor IDs are 1-based
      // Randomized humanoids are portrayed by the bust picked just below; they
      // never get a sculpted 3D model, so pin the exclusive portrait style.
      const randomActor = $gameActors.actor(targetActorId);
      if (randomActor && randomActor.setPortraitMode) randomActor.setPortraitMode("bust");
      if (window.randomizeTraitsForActor) {
        window.randomizeTraitsForActor(targetActorId);
      } else {
        const traitBank = (window.Health && window.Health.Traits && window.Health.Traits.length > 0)
          ? window.Health.Traits
          : ((window.HealthCore && window.HealthCore.Traits) || [
            { id: "claustrophobic", name: "Claustrophobic", cost: -3 },
            { id: "genius", name: "Genius", cost: 3 },
            { id: "athletic", name: "Athletic", cost: 5 },
            { id: "lucky", name: "Lucky", cost: 3 },
            { id: "paranoid", name: "Paranoid", cost: -1 }
          ]);
        const picked = [];
        const drawbacks = traitBank.filter((t) => (Number(t.cost) || 1) < 0 && t.category !== "genetic");
        const positives = traitBank.filter((t) => (Number(t.cost) || 1) >= 0 && t.category !== "genetic");
        if (drawbacks.length > 0) {
          picked.push(drawbacks[Math.floor(Math.random() * drawbacks.length)].id);
        }
        for (let i = 0; i < 2 && positives.length > 0; i++) {
          const p = positives[Math.floor(Math.random() * positives.length)];
          if (p && !picked.includes(p.id)) picked.push(p.id);
        }
        currentActor._selectedTraits = picked;
        if (typeof applyTraitsToActor === 'function') {
          applyTraitsToActor(currentActor, picked);
        }
      }

      // Random Specializations (Allocate 12 budget points across catalog)
      const specCatalog = this._specsCatalog ? this._specsCatalog() : ((window.Specializations && window.Specializations.list) || []);
      currentActor._specTrained = {};
      if (Array.isArray(specCatalog) && specCatalog.length > 0) {
        // The class and the traits were rolled a moment ago, so their head
        // starts are read now and the budget is spent strictly on top of them.
        const specGrantCtx = this._specGrantContext ? this._specGrantContext(currentActor) : null;
        let specRemaining = CC_SPEC_BUDGET;
        let attempts = 0;
        while (specRemaining > 0 && attempts < 400) {
          attempts++;
          const spec = specCatalog[Math.floor(Math.random() * specCatalog.length)];
          if (!spec) continue;
          const floor = specGrantCtx ? this._specGrantRankIn(specGrantCtx, spec) : 0;
          const currentRank = Math.max(currentActor._specTrained[spec.id] || 0, floor);
          if (currentRank < 4) {
            const add = Math.min(specRemaining, 4 - currentRank, Math.floor(Math.random() * 2) + 1);
            currentActor._specTrained[spec.id] = currentRank + add;
            specRemaining -= add;
          }
        }
        currentActor._specPointsSpent = CC_SPEC_BUDGET - specRemaining;
      }

      // Random Bio & Ideology
      currentActor._bioSet = true;
      const allIdeologies = (window.NPCShared && window.NPCShared.ideologyList && window.NPCShared.ideologyList()) || [];
      const coreIdeologies = ["techno_monism", "neo_feudalism", "cyber_anarchism", "transhumanism", "pragmatist", "democratic_socialist", "high_frequency_trader"];
      const idPool = allIdeologies.length > 0 ? allIdeologies.map(i => i.id || i) : coreIdeologies;
      currentActor._ideologyId = idPool[Math.floor(Math.random() * idPool.length)];
      if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getActorProfile) {
        const prof = window.NPCSocietyRegistry.getActorProfile(currentActor.actorId());
        if (prof) prof.ideologyId = currentActor._ideologyId;
      }

      currentActor._morality = Math.floor(Math.random() * 5) - 2;

      const hometowns = (window.WorkSystem && window.WorkSystem.Destinations)
        ? Object.keys(window.WorkSystem.Destinations)
        : ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"];
      $gameSystem._ccHometown = hometowns[Math.floor(Math.random() * hometowns.length)];

      if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
      $gameSystem._ccBirthAge[currentMemberIndex] = 18 + Math.floor(Math.random() * 52);

      currentActor._wealthTier = Math.floor(Math.random() * 4);

      // A body as well as a life, exactly as the Bio tab's own randomizer does.
      const reproRoll = ccReproChoices();
      const CCU_random = window.CharacterCreationUtils;
      const rolledRepro = reproRoll[Math.floor(Math.random() * reproRoll.length)].val;
      if (CCU_random && CCU_random.setReproductionType) CCU_random.setReproductionType(currentMemberIndex, rolledRepro);
      else $gameVariables.setValue([87, 115, 116][currentMemberIndex] || 87, rolledRepro);
      if (currentActor.setHormoneBalance) currentActor.setHormoneBalance(Math.floor(Math.random() * 101));

      const bloodList = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [];
      if (bloodList.length > 0) {
        const pickedBlood = bloodList[Math.floor(Math.random() * bloodList.length)];
        currentActor._ccBloodType = pickedBlood.id;
        currentActor._bloodType = pickedBlood.type || pickedBlood.id;
        if (window.BloodTypeService && window.BloodTypeService.setForActor) {
          window.BloodTypeService.setForActor(currentActor, pickedBlood.id);
        }
      } else {
        const bloodTypes = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "Synthetic-Δ", "Azure (Hemocyanin)"];
        currentActor._bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];
      }

      // Random Job & Job Items
      const allJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
      if (allJobs.length > 0) {
        const randomJob = allJobs[Math.floor(Math.random() * allJobs.length)];
        currentActor._jobId = randomJob.id;
        if (Array.isArray(randomJob.items) && $gameParty) {
          if (currentActor._grantedJobItemIds) {
            currentActor._grantedJobItemIds.forEach(id => {
              if (typeof $dataItems !== 'undefined' && $dataItems[id]) {
                if (typeof $gameParty.loseItem === 'function') {
                  $gameParty.loseItem($dataItems[id], 1);
                } else if (typeof $gameParty.gainItem === 'function') {
                  $gameParty.gainItem($dataItems[id], -1);
                }
              }
            });
          }
          currentActor._grantedJobItemIds = [...randomJob.items];
          randomJob.items.forEach(id => {
            if (typeof $dataItems !== 'undefined' && $dataItems[id]) {
              $gameParty.gainItem($dataItems[id], 1);
            }
          });
        }
      }

      // Attachments, the one page of the sheet the roll used to skip.
      if (typeof this._rollRomanceForActor === "function") {
        this._rollRomanceForActor(currentActor);
      }

      // Random sprite selection
      let selectedSprite = null;
      if (window.selectRandomSpriteForActor) {
        selectedSprite = window.selectRandomSpriteForActor(targetActorId);
        if (selectedSprite) {
          console.log(`Total Random: Selected sprite ${selectedSprite.name} (${selectedSprite.index}) for actor ${targetActorId}`);
        } else {
          console.warn("Total Random: no sprite options available for actor " + targetActorId);
        }
      } else {
        console.warn("selectRandomSpriteForActor not available for total randomization");
      }

      // Set bust based on SpritesAssociation for the selected sprite
      if (selectedSprite && window.Sprites && window.Sprites.SpritesAssociation) {
        const SpritesAssociation = window.Sprites.SpritesAssociation;
        const spriteName = selectedSprite.name;
        const spriteIndex = selectedSprite.index;

        // Check if this sprite has an associated bust
        if (SpritesAssociation[spriteName] && SpritesAssociation[spriteName][spriteIndex]) {
          const associatedBust = SpritesAssociation[spriteName][spriteIndex];

          // The bust is a bust for every member: it belongs in the actor's own
          // bust field, not the monster-battler one.
          if (randomActor) {
            randomActor.setVnBust(associatedBust);
            console.log(`Total Random: Set bust ${associatedBust} for actor ${targetActorId}`);
          }
        } else {
          // No association found, fall back to random bust selection
          console.log(`Total Random: No SpritesAssociation found for ${spriteName}[${spriteIndex}], selecting random bust`);
          if (window.selectRandomBustForActor) {
            const selectedBust = window.selectRandomBustForActor(targetActorId);
            console.log(`Total Random: Selected random bust ${selectedBust} for actor ${targetActorId}`);
          }
        }
      } else {
        // SpritesAssociation not available, fall back to random bust selection
        console.log(`Total Random: SpritesAssociation not available, selecting random bust`);
        if (window.selectRandomBustForActor) {
          const selectedBust = window.selectRandomBustForActor(targetActorId);
          console.log(`Total Random: Selected random bust ${selectedBust} for actor ${targetActorId}`);
        }
      }

      return true;
    }
  }

  for (const key of Object.getOwnPropertyNames(CCStepPages.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Scene_CharacterCreation.prototype, key,
      Object.getOwnPropertyDescriptor(CCStepPages.prototype, key)
    );
  }
})();
