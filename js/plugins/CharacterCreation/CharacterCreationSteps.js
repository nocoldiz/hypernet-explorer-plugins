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
    CharacterCreationData,
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

  // What the story mode leaves Em to answer for herself on the bio page. Her
  // dossier is locked like any other authored one, so these are named here and
  // let past that lock rather than by unlocking the whole page: what she
  // believes, what she does for a living and the body she was born in are the
  // player's, while her name, her face, her class and her gender are the
  // story's (see _storyModeEmLocksField).
  const STORY_EM_OPEN_FIELDS = ["ideology", "job", "reproduction"];
  // The same three, named as the pick kinds the sheet draws them with.
  const STORY_EM_OPEN_PICKS = { creed: "ideology", job: "job" };

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
        { id: "all", label: ccT("CharCreate.filterAll"), icon: 87 },
        { id: "genetic", label: ccT('Traits.tabGenetic'), icon: 292 },
        { id: "physical", label: ccT('Traits.tabPhysical'), icon: 135 },
        { id: "mental", label: ccT('Traits.tabMental'), icon: 183 },
        { id: "magical", label: ccT('Traits.tabMagical'), icon: 165 },
        { id: "diseases", label: ccT('Traits.tabDiseases'), icon: 177 }
      ];
    }

    // The packages the simple board deals, or an empty list when the trait
    // plugin is too old to know about them.
    // The shelf depends on who is standing at it: a beast is offered the beast
    // packages and a person the person ones, so the cache is keyed on that and
    // not held flat. Switching the member's class across the sentience line
    // therefore re-deals the board on the next draw instead of showing a dog a
    // merchant's kit.
    _traitPackages() {
      const api = window.TraitPoints;
      if (!api || typeof api.packages !== "function") return [];
      const NC = window.NPCCreature;
      const beast = !!(NC && NC.isNonSentientActor(Scene_CharacterCreation.getCurrentActor()));
      const key = beast ? "beast" : "person";
      if (!this._ccTraitPackageCache) this._ccTraitPackageCache = {};
      if (!this._ccTraitPackageCache[key] || !this._ccTraitPackageCache[key].length) {
        this._ccTraitPackageCache[key] = api.packages(beast) || [];
      }
      return this._ccTraitPackageCache[key];
    }

    // Which package the member is standing on: the one whose whole list they
    // carry. Editing it on the detailed board drops the mark, which is exactly
    // what should happen - the build is then the player's, not the package's.
    _activeTraitPackageId(actor) {
      const picked = selectedTraitIds(actor).map(String);
      const pack = this._traitPackages().find((entry) =>
        entry.traits.length === picked.length &&
        entry.traits.every((id) => picked.includes(String(id))));
      return pack ? pack.id : "";
    }

    // The simple trait board: one card per kind of person, each holding a small
    // set of traits that fits the budget on its own. The whole two hundred card
    // library is the detailed board's business, and the note at the foot says so.
    _traitPackageBoardHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      const packages = this._traitPackages();
      const activeId = this._activeTraitPackageId(actor);

      const cardsHtml = packages.map((pack) => {
        const traitNames = pack.rows
          .map((tr) => (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id)
          .join(", ");
        return `
          <div class="cc-card-option cc-trait-pack ${pack.id === activeId ? 'selected' : ''}"
               data-pack-id="${pack.id}"
               onclick="SceneManager._scene.onTraitPackageSelect('${pack.id}')">
            <span class="cc-rpg-icon" style="${this._ccIconStyle(pack.icon || 87, 20)}"></span>
            <div class="cc-option-title">${pack.name}</div>
            <div class="cc-option-sub">${traitNames}</div>
            <span class="trait-cost">${pack.cost}</span>
          </div>
        `;
      }).join("");

      const emptyHtml = `<div class="cc-class-empty">${ccT('Traits.noneInCategory')}</div>`;

      return `
        <div class="cc-page cc-page-left ts-page cc-trait-board cc-page-column">
          <div class="cc-select-grid cc-trait-grid">
            ${cardsHtml || emptyHtml}
          </div>
        </div>
      `;
    }

    _traitPickerLeftHtml() {
      // Simple mode asks the one question the two hundred cards are underneath:
      // what kind of person is this. The card library itself belongs to the
      // detailed board, which edits whatever the package dealt.
      if (Scene_CharacterCreation.isSimpleMode()) return this._traitPackageBoardHtml();
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
            <span>${cat.label}</span>
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

      // The board is hunted through by name, so it is ordered by name rather
      // than by whatever order the bank happens to hold.
      const ordered = filtered.slice().sort((a, b) => {
        const an = (a.name && resolveTraitName(a.name, a.id)) || a.id;
        const bn = (b.name && resolveTraitName(b.name, b.id)) || b.id;
        return String(an).localeCompare(String(bn));
      });

      const cardsHtml = ordered.map((trait) => {
        const isSelected = selectedTraits.some((id) => String(id) === String(trait.id));
        const name = (trait.name && resolveTraitName(trait.name, trait.id)) || trait.id;
        // An illness costs nothing, so it carries no price tag.
        const cost = Number.isFinite(Number(trait.cost)) ? Number(trait.cost) : 1;
        const costHtml = trait.diseaseId
          ? ""
          : `<span class="trait-cost ${cost < 0 ? 'refund' : ''}">${cost < 0 ? `+${-cost}` : cost}</span>`;

        return `
          <div class="cc-card-option ${isSelected ? 'selected' : ''}"
               data-trait-id="${trait.id}"
               onclick="SceneManager._scene.onTraitToggle('${trait.id}')">
            <span class="cc-rpg-icon" style="${this._ccIconStyle(trait.icon || 87, 20)}"></span>
            <div class="cc-option-title">${name}</div>
            ${costHtml}
          </div>
        `;
      }).join("");

      const emptyHtml = `<div class="cc-class-empty">${ccT('Traits.noneInCategory')}</div>`;

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

      // The simple board deals whole packages: there is no purse to spend and
      // nothing to put down card by card, so the running total, the two editing
      // buttons and the remove crosses belong to the detailed board alone.
      const isSimpleTraits = Scene_CharacterCreation.isSimpleMode();
      const purseHtml = isSimpleTraits ? "" : `
        <div class="ts-purse ts-purse--sheet">
          <div class="ts-purse-cell spend">
            <span class="ts-purse-value">${spent}</span>
            <span class="ts-purse-label">${ccT('Traits.purseSpent')}</span>
          </div>
          <div class="ts-purse-cell refund">
            <span class="ts-purse-value">+${refunded}</span>
            <span class="ts-purse-label">${ccT('Traits.purseRefunds')}</span>
          </div>
          <div class="ts-purse-cell ${remaining < 0 ? 'over' : ''}">
            <span class="ts-purse-value">${remaining}</span>
            <span class="ts-purse-label">${ccT('Traits.purseLeft')}</span>
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
          ? `<span class="trait-cost refund">${ccT('Traits.tabDiseases')}</span>`
          : cost < 0
            ? `<span class="trait-cost refund">+${-cost} ${ccT('Traits.refundWord')}</span>`
            : `<span class="trait-cost">${cost} ${ccT('Traits.pts')}</span>`;

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
          const sNames = hoveredTrait.skills.map((sid) => ($dataSkills[sid] ? $dataSkills[sid].name : ccTp('CharCreate.skillNumber', { id: sid }))).join(", ");
          extraGrants += `<div class="cc-grant-note"><strong>${ccT('Traits.grantsSkills')}:</strong> ${sNames}</div>`;
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
          <div class="cc-picked-chip ${tr.diseaseId ? 'illness' : ''}"${isSimpleTraits ? "" : ` onclick="SceneManager._scene.onTraitToggle('${tr.id}')"`}>
            <span class="cc-rpg-icon" style="${this._ccIconStyle(tr.icon || 87, 18)}"></span>
            <span>${name}</span>
            ${badge}
            ${isSimpleTraits ? "" : `<span class="cc-slot-remove">&#10005;</span>`}
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
        .join(" ") || `<span class="cc-note-faint">${ccT('CharCreate.noDefiningTraits')}</span>`;

      const totalBonusesTitle = (ccT('Traits.totalBonuses')).replace(/[:\s]+$/, '');

      return `
        <div class="cc-page cc-page-right ts-page cc-trait-detail cc-page-column">
          <div class="ts-sheet-head">
            ${purseHtml}
            ${isSimpleTraits ? "" : `
            <div class="ts-sheet-actions">
              <button class="cc-compact-btn" onclick="SceneManager._scene.onTraitResetForCurrentActor()">${ccT('Traits.resetTraits')}</button>
              <button class="cc-compact-btn" onclick="SceneManager._scene.onRandomizeTraitsForCurrentActor()">${ccT('CharCreate.randomize')}</button>
            </div>`}
          </div>

          ${detailHtml}

          ${isSimpleTraits ? "" : `
          <div class="ts-picked-block">
            <h3 class="cc-subheader ts-section-head">
              <span>${ccT('Traits.selectedTraitsLabel')}</span>
              <span class="ts-count">${traitOnlyIds.length}/8</span>
            </h3>
            <div class="cc-picked-row">
              ${pickedChips || `<span class="cc-picked-empty">${ccT('CharCreate.noDefiningTraits')}</span>`}
            </div>
          </div>`}

          ${diseaseChips ? `
            <div class="ts-picked-block">
              <h3 class="cc-subheader ts-section-head">
                <span>${ccT('Traits.tabDiseases')}</span>
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

    // Taking a package REPLACES the build: its traits are the member's whole
    // list, and what the old ones granted goes back first so nothing is kept
    // twice. Illnesses are untouched - they are not bought and not part of any
    // package. Clicking the package a member already stands on puts it down.
    onTraitPackageSelect(packageId) {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      const pack = this._traitPackages().find((entry) => entry.id === packageId);
      if (!pack) { SoundManager.playBuzzer(); return; }

      // A character on the simple board always stands on a package: clicking the
      // one they already carry changes nothing rather than leaving them with no
      // traits at all.
      if (this._activeTraitPackageId(actor) === pack.id) { SoundManager.playCursor(); return; }
      const putDown = false;
      const TP = window.TraitPoints;
      if (TP && TP.revertGrants) TP.revertGrants(actor, actor._appliedTraitIds || actor._selectedTraits);
      actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
      this._ccApplyTraitIds(actor, putDown ? [] : pack.traits.slice());
      if (actor.refresh) actor.refresh();

      Scene_CharacterCreation._hoveredTraitId = putDown ? null : pack.traits[0];
      if (putDown) SoundManager.playCancel();
      else SoundManager.playCursor();
      const bioStep = window.CCSteps ? window.CCSteps.BIO : 6;
      if (this._step === bioStep) {
        const container = this._dndContainer;
        if (container) {
          const sidebarSlot = container.querySelector(".cc-sidebar-slot");
          if (sidebarSlot) sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
          const leftPage = container.querySelector(".cc-page-left");
          if (leftPage) this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
          const rightPage = container.querySelector(".cc-page-right");
          if (rightPage) this._ccSwapPage(rightPage, this._bioPickerRightHtml());
          this._refreshTopFolderTabs();
          return;
        }
      }
      this._refreshTraitBoard();
    }

    // The facing page follows what was PICKED, never what the pointer happens to
    // be passing over: a sheet that rewrote itself under a wandering mouse was
    // unreadable. Kept as an entry point for the pad, which moves a real cursor.
    onTraitPackageHover(packageId) {
      const pack = this._traitPackages().find((entry) => entry.id === packageId);
      if (!pack || !pack.traits.length) return;
      this.onTraitCardHover(pack.traits[0]);
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
      // The facing page reads the card that was just clicked, since it no longer
      // follows the pointer.
      Scene_CharacterCreation._hoveredTraitId = trait.id;
      this._refreshTraitBoard();
    }

    // Writes a picked list back onto the member and re-applies what it grants.
    // The appliers all end by storing the whole trait objects, so the list is
    // never assumed to still be ids after this: every read goes back through
    // selectedTraitIds / selectedTraitObjects.
    _ccApplyTraitIds(actor, ids) {
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
      if (TP && TP.revertGrants) TP.revertGrants(actor, actor._appliedTraitIds || actor._selectedTraits);
      actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
      this._ccApplyTraitIds(actor, []);
      actor._selectedTraits = [];
      actor._appliedTraitIds = [];

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
    // Picking a card changes nothing about the card library itself, only which
    // cards are marked: rebuilding the left page would throw the grid back to
    // the top and lose the place the player was reading. So the marks are moved
    // in place, and the page is only rebuilt when the cards are not there yet.
    _markTraitCardsInPlace(container) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (Scene_CharacterCreation.isSimpleMode()) {
        const packs = container.querySelectorAll(".cc-trait-pack[data-pack-id]");
        if (!packs.length) return false;
        const activeId = this._activeTraitPackageId(actor);
        packs.forEach((el) => {
          el.classList.toggle("selected", el.dataset.packId === String(activeId));
        });
        return true;
      }
      const cards = container.querySelectorAll(".cc-trait-grid .cc-card-option[data-trait-id]");
      if (!cards.length) return false;
      const picked = this._ccPickedCardIds(actor).map(String);
      cards.forEach((el) => {
        el.classList.toggle("selected", picked.includes(el.dataset.traitId));
      });
      return true;
    }

    _refreshTraitBoard() {
      const container = this._dndContainer;
      if (!container) { this.refreshUIOverlayDOM(); return; }
      if (!this._markTraitCardsInPlace(container)) {
        this._ccSwapPage(container.querySelector(".cc-page-left"), this._traitPickerLeftHtml());
      }
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
        { id: 1, name: "Accounting", category: "Commerce", stat: "INT", description: "Keeping and interpreting financial grimories and transaction records." },
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
    // is the one that counts. Nothing is granted in a discipline no mechanic
    // reads yet: the same rule Game_Actor#specializationClassBonus keeps, said
    // again here because the board works the whole catalogue out in one pass
    // rather than asking the actor 800 times per redraw.
    _specGrantRankIn(ctx, spec) {
      if (!ctx || !spec) return 0;
      const implemented = (window.Specializations && typeof window.Specializations.isImplemented === "function")
        ? window.Specializations.isImplemented(spec)
        : spec.implemented !== false;
      if (!implemented) return 0;
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
      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All"; // i18n-ignore: specialization category id
      // No strip on a pad, so no filter either (CCSearch).
      const q = window.CCSearch.query(Scene_CharacterCreation._specSearchQuery).toLowerCase().trim();
      const S = window.Specializations || {};
      const nameOf = (sp) => (S.displayName ? S.displayName(sp) : sp.name) || "";
      const descOf = (sp) => (S.describe ? S.describe(sp) : sp.description) || "";

      if (this._specsReadOnly()) {
        return this._specsWithLevels(Scene_CharacterCreation.getCurrentActor())
          .slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      }
      const byCat = activeCat === "All" // i18n-ignore: specialization category id
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
      const rankNames = ccList('SpecMenu.rankNames');
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
      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All"; // i18n-ignore: specialization category id
      const readOnly = this._specsReadOnly();
      const showCatLabel = readOnly || activeCat === "All" || activeCat === SPEC_TAB_CURRENT; // i18n-ignore: specialization category id
      return specs.map((spec) => {
        const specName = S.displayName ? S.displayName(spec) : spec.name;
        const specCatLabel = S.categoryLabel ? S.categoryLabel(spec.category) : (spec.category || "General") /* i18n-ignore: specialization category id */;
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

      const activeCat = Scene_CharacterCreation._activeSpecCategory || "All"; // i18n-ignore: specialization category id
      const categories = this._specsCategories();
      const remaining = this._specsRemaining(actor);
      const budget = CC_SPEC_BUDGET;

      // Category Tabs. Each tab carries its own category on the element, so a
      // later redraw can move the highlight without having to work out which
      // tab is which from its translated label.
      const railFocused = !!this._pageRailFocused;
      const catTabsHtml = categories.map((cat) => {
        const isActive = cat === activeCat;
        const catLabel = cat === "All" // i18n-ignore: specialization category id
          ? T('SpecMenu.ui.all')
          : cat === SPEC_TAB_CURRENT
            ? ccT('CharCreate.specsCurrent')
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
            ${window.CCSearch.html({
              className: "cc-bio-select cc-search-field",
              placeholder: T('SpecMenu.ui.searchPlaceholder'),
              value: Scene_CharacterCreation._specSearchQuery,
              oninput: "SceneManager._scene.onSpecSearch(this.value)",
            })}
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
        const catLabel = (window.Specializations && window.Specializations.categoryLabel) ? window.Specializations.categoryLabel(hoveredSpec.category) : (hoveredSpec.category || "General") /* i18n-ignore: specialization category id */;
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
            <div class="cc-detail-desc">${specDesc || ccT('CharCreate.specGenericDesc')}</div>
            <div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('SpecMenu.ui.category')}:</span><span class="cc-dossier-value">${catLabel}</span></div>
            <div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('SpecMenu.ui.governingStat')}:</span><span class="cc-dossier-value">${ccStatLabel(hoveredSpec.stat || "INT")}</span></div>
            ${grantRank > 0 ? `<div class="cc-dossier-row"><span class="cc-dossier-label">${ccT('CharCreate.specGranted')}:</span><span class="cc-dossier-value">${this._specRankName(grantRank)}</span></div>` : ''}
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
        const name = spec ? ((window.Specializations && window.Specializations.displayName) ? window.Specializations.displayName(spec) : spec.name) : ccTp('CharCreate.specNumber', { id: idStr });
        const isGranted = grantRank >= rank;
        return `
          <div class="cc-spec-badge-row${isGranted ? ' granted' : ''}" onmouseenter="SceneManager._scene.onSpecCardHover(${idStr})">
            <span class="cc-spec-badge-row-name">${name}</span>
            <span class="cc-spec-stat-badge cc-inline-gutter">${this._specRankName(rank)}</span>
            ${readOnly ? '' : `<button class="cc-spec-badge-delete" title="${ccT('CharCreate.removeAllocated')}" ${isGranted ? 'disabled' : ''} onclick="event.stopPropagation(); SceneManager._scene.onSpecDeleteAllocated(${idStr})">&times;</button>`}
          </div>
        `;
      }).join("");

      return `
        <div class="cc-page cc-page-right cc-spec-detail ts-page cc-page-column">
          ${readOnly ? '' : `
          <div class="cc-row-end cc-row-end-wrap">
            <button class="cc-compact-btn" onclick="SceneManager._scene.onSuggestSpecsForCurrentActor()">${ccT('CharCreate.suggestSpecs')}</button>
            <button class="cc-compact-btn" onclick="SceneManager._scene.onResetSpecsForCurrentActor()">${ccT('CharCreate.resetSpecs')}</button>
            <button class="cc-compact-btn" onclick="SceneManager._scene.onRandomizeSpecsForCurrentActor()">${ccT('CharCreate.randomize')}</button>
          </div>`}
          ${detailHtml}
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
      const candidates = (Array.isArray(catalog) ? catalog : []).filter((sp) => {
        if (!sp) return false;
        if (window.Specializations && typeof window.Specializations.isImplemented === "function") {
          return window.Specializations.isImplemented(sp);
        }
        return sp.implemented !== false;
      });
      if (candidates.length === 0) return remaining;
      let left = remaining;
      let attempts = 0;
      while (left > 0 && attempts < 400) {
        attempts++;
        const spec = candidates[Math.floor(Math.random() * candidates.length)];
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

    // A starting build for the class actually picked: every specialization the
    // class has a head start in (Specialization.json classStart) gets maxed out,
    // richest affinity first, before anything else is touched. A class with fewer
    // affinities than the budget affords spends what is left over on implemented
    // specializations only.
    _applySuggestedSpecs(actor, catalog) {
      if (!actor) return;
      const cat = Array.isArray(catalog) ? catalog : this._specsCatalog();
      if (!Array.isArray(cat) || cat.length === 0) return;
      actor._specTrained = {};

      const grantCtx = this._specGrantContext(actor);
      const className = grantCtx ? grantCtx.className : null;
      let remaining = typeof CC_SPEC_BUDGET !== "undefined" ? CC_SPEC_BUDGET : 12;

      const affinityOrder = cat
        .filter((sp) => {
          if (!className || !sp.classStart || !sp.classStart[className]) return false;
          if (window.Specializations && typeof window.Specializations.isImplemented === "function") {
            return window.Specializations.isImplemented(sp);
          }
          return sp.implemented !== false;
        })
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
        this._randomSpendSpecs(actor, grantCtx, cat, remaining);
      }
      actor._specPointsSpent = (typeof CC_SPEC_BUDGET !== "undefined" ? CC_SPEC_BUDGET : 12) - remaining;
    }

    onSuggestSpecsForCurrentActor() {
      if (this._specsReadOnly()) { SoundManager.playBuzzer(); return; }
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      this._applySuggestedSpecs(actor);
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
      });
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
      // Only a VIP closes the dossier chip to the other seats: a party may hold
      // any number of dossiers the player saved, but one VIP at most.
      const hasAnotherPreset = this._hasAuthoredPresetInParty(true);
      const isPresetDisabled = hasAnotherPreset && !isPresetActor;
      // A dossier the world holds one of is filed under VIP rather than under
      // Preset, so the chip that is marked is the board the member came off.
      const API = window.CharacterPresets || {};
      const takenPreset = (isPresetActor && API.findPresetForActor)
        ? API.findPresetForActor(actor) : null;
      const isVipActor = !!(takenPreset && API.isVipPreset && API.isVipPreset(takenPreset));
      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !isPresetActor && !isPreset && !!(actor._isCreatureActor || $gameSwitches.value(77 + currentMemberIndex));
      // Drawn as the Bio tab's own kind of question: a titled section with a
      // row of chips, the same shape gender and class wear, rather than a
      // stripe of pills that belonged to the old sidebar.
      return `
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.characterType')}</span></div>
          <div class="cc-bio-chips-row">
            <button class="cc-bio-chip cc-type-chip ${!isCreature && !isPresetActor && !isPreset ? 'selected' : ''}" onclick="SceneManager._scene.onSetCharacterType('humanoid')">
              ${ccT('CharCreate.humanoid')}
            </button>
            <button class="cc-bio-chip cc-type-chip ${isCreature && !isPresetActor && !isPreset ? 'selected' : ''}" onclick="SceneManager._scene.onSetCharacterType('creature')">
              ${ccT('CharCreate.creature')}
            </button>
            <button class="cc-bio-chip cc-type-chip ${(isPresetActor || isPreset) && !isVipActor ? 'selected' : ''} ${isPresetDisabled ? 'disabled' : ''}"
               title="${isPresetDisabled ? ccT('CharCreate.onlyOnePreset') : ccT('CharCreate.presetDossiers')}"
               onclick="${isPresetDisabled ? 'SoundManager.playBuzzer()' : "SceneManager._scene.onSetCharacterType('preset')"}">
              ${ccT('CharCreate.preset')}
            </button>
            <button class="cc-bio-chip cc-type-chip ${isVipActor ? 'selected' : ''} ${isPresetDisabled ? 'disabled' : ''}"
               title="${isPresetDisabled ? ccT('CharCreate.onlyOnePreset') : ccT('CharCreate.vipDossiers')}"
               onclick="${isPresetDisabled ? 'SoundManager.playBuzzer()' : "SceneManager._scene.onSetCharacterType('vip')"}">
              ${ccT('CharCreate.vip')}
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
    // ── Choices, made in a modal rather than in a dropdown ───────────────────
    //
    // Every choice that used to be a <select> is drawn as this plate and opened
    // with CCPick. The markup carries only what the choice is FOR - a kind and,
    // where the page draws several alike, which one - so the option list is
    // built from live data at the moment it is asked for rather than baked into
    // a string that goes stale the instant anything else on the sheet changes.
    //
    // The plate is .focusable, so the ring reaches it, and CCNav.confirm()'s
    // synthesised click is exactly what a mouse does to it. That is the whole
    // reason the dropdowns went: a click on a native <select> opens a list the
    // host browser draws in its own chrome, which no pad can walk.
    // The dossier lock kills the pointer on every control of a locked sheet
    // (.cc-preset-locked in theme.css). The handful of fields the story mode
    // leaves Em (STORY_EM_OPEN_FIELDS) have to come back out from under it, or
    // the handler that would allow the change is never reached by a mouse.
    _storyOpenClass(field) {
      if (!field) return "";
      const CP = window.CharacterPresets;
      const isStoryEm = !!(CP && CP.isStoryModeEm && CP.isStoryModeEm());
      return (isStoryEm && STORY_EM_OPEN_FIELDS.includes(field)) ? " cc-open-edit" : "";
    }

    _pickTriggerHtml(kind, label, arg) {
      const openClass = this._storyOpenClass(STORY_EM_OPEN_PICKS[kind]);
      const text = (label == null || label === "") ? ccT('CharCreate.none') : label;
      const safe = String(text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const hasArg = arg !== undefined && arg !== null;
      const at = hasArg ? `, ${JSON.stringify(arg)}` : "";
      return `<div class="cc-bio-select cc-pick-trigger focusable${openClass}" tabindex="0"
           data-nav-key="pick-${kind}${hasArg ? '-' + arg : ''}"
           data-pick-kind="${kind}"
           onclick="SceneManager._scene.onOpenPick('${kind}'${at})">
        <span class="cc-pick-trigger-label">${safe}</span>
        <span class="cc-pick-trigger-caret">▾</span>
      </div>`;
    }

    // ── The option banks ─────────────────────────────────────────────────────
    // One method per choice, each reading the same catalogue the <option> loop
    // it replaced read. They are the single source for both the list the modal
    // shows and the label the trigger wears, so the two can never disagree.

    _jobPickOptions() {
      const allJobs = (window.WorkSystem && window.WorkSystem.Jobs) || [];
      const jobLabel = (j) => (window.WorkSystem && window.WorkSystem.jobName)
        ? window.WorkSystem.jobName(j)
        : (j.name || ccTp('CharCreate.jobNumber', { id: j.id }));
      // Sorted on the name the player actually reads, so the list is walkable
      // in every language rather than in Jobs.json's authoring order.
      const rows = allJobs.slice()
        .map((j) => ({ value: j.id, label: jobLabel(j) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      return [{ value: 0, label: ccT('CharCreate.bio.joblessOption') }].concat(rows);
    }

    _creedPickOptions() {
      const all = (window.NPCShared && window.NPCShared.ideologyList &&
        window.NPCShared.ideologyList()) || [];
      // The fallback is still needed for the case where no ideology bank loaded.
      const coreQuickPicks = [
        { id: "techno_monism" }, { id: "transhumanism" }, { id: "cyber_anarchism" },
        { id: "democratic_socialist" }, { id: "high_frequency_trader" },
        { id: "neo_feudalism" }, { id: "pragmatist" },
      ];
      const rows = (all.length > 0 ? all : coreQuickPicks)
        .map((item) => ({ value: item.id || item, label: this._formatIdeologyName(item) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      // A creed held is a creed chosen: the list opens on nobody's. The story
      // mode's Em is offered the whole bank like anybody else - what she
      // believes after the Ritual took everything else is the player's to say.
      return [{ value: "", label: ccT('CharCreate.none') }].concat(rows);
    }

    _hometownPickOptions() {
      const hometowns = (window.WorkSystem && window.WorkSystem.Destinations)
        ? Object.keys(window.WorkSystem.Destinations)
        : ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"]; // i18n-ignore: WorkSystem.Destinations ids
      const current = $gameSystem._ccHometown || "Paris"; // i18n-ignore: WorkSystem.Destinations id
      // A dossier may name a town the work destinations never list (Em's
      // Wimbledon): without this the list silently fell back to its first entry
      // and the sheet claimed a birthplace nobody had chosen.
      const list = hometowns.includes(current) ? hometowns : [current].concat(hometowns);
      return list.map((city) => ({ value: city, label: city }));
    }

    // The vocations the class board would have dealt this member, read off the
    // board's own choice list so the two can never drift apart. The one card
    // that is not a vocation at all - the command that hands the screen over to
    // the full roster scene - is dropped: a modal cannot leave the wizard.
    _classPickOptions() {
      const stepData = (CharacterCreationData && CharacterCreationData[STEP.CLASS]) || {};
      const choices = stepData.choices || [];
      return choices
        .filter((ch) => ch && ch.symbol && ch.symbol !== "select_class")
        .map((ch) => ({
          value: ch.symbol,
          label: ch.name || "",
          hint: (typeof this._classOfChoice === "function" && this._classOfChoice(ch))
            ? this._classElementName(this._classElementId(this._classOfChoice(ch)))
            : "",
          group: ch.groupTitle || ""
        }));
    }

    // The simple board deals whole packages rather than single traits, so the
    // sheet asks the one question those cards asked: what kind of person is
    // this. Each row carries the traits the package holds, so the list reads
    // the same as the board it replaced.
    _traitPackPickOptions() {
      return this._traitPackages().map((pack) => ({
        value: pack.id,
        label: pack.name,
        hint: pack.rows
          .map((tr) => (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id)
          .join(", ")
      }));
    }

    _bondPickOptions() {
      const bonds = this._romanceBanks().rel.bonds || [];
      return bonds.map((b) => ({
        value: b.key,
        label: this._romanceText(b.name),
        hint: b.desc ? this._romanceText(b.desc) : ""
      }));
    }

    // ── The dispatcher ───────────────────────────────────────────────────────

    _pickOptions(kind, arg) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      switch (kind) {
        case "archetype":
        case "archetype2": {
          // The two halves of a spliced body are always two different
          // archetypes, so neither list offers what the other one holds.
          const primary = actorArchetypeKey(actor) || "Humanoid"; // i18n-ignore: Archetypes.json keys
          const second = actorSecondaryArchetypeKey(actor) || "";
          const taken = kind === "archetype" ? second : primary;
          const rows = creatureArchetypeKeys()
            .filter((opt) => opt !== taken)
            .map((opt) => ({ value: opt, label: archetypeDisplayName(opt) }));
          return kind === "archetype2"
            ? [{ value: "", label: ccT('CharCreate.none') }].concat(rows)
            : rows;
        }
        case "job":      return this._jobPickOptions();
        case "creed":    return this._creedPickOptions();
        case "hometown": return this._hometownPickOptions();
        case "bond":     return this._bondPickOptions(arg);
        case "class":    return this._classPickOptions();
        case "traitpack": return this._traitPackPickOptions();
        default:         return [];
      }
    }

    _pickTitle(kind) {
      switch (kind) {
        case "archetype":  return ccT('CharCreate.pickArchetype');
        case "archetype2": return ccT('CharCreate.pickSecondaryArchetype');
        case "job":        return ccT('CharCreate.pickJob');
        case "creed":      return ccT('CharCreate.pickCreed');
        case "hometown":   return ccT('CharCreate.pickHometown');
        case "bond":       return ccT('CharCreate.pickBond');
        case "class":      return ccT('CharCreate.pickClass');
        case "traitpack":  return ccT('CharCreate.pickTraitPackage');
        default:           return "";
      }
    }

    // What that choice currently is, so the sheet opens on it.
    _pickCurrent(kind, arg) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      switch (kind) {
        case "archetype":  return actorArchetypeKey(actor) || "";
        case "archetype2": return actorSecondaryArchetypeKey(actor) || "";
        case "job":        return (actor && actor._jobId != null) ? actor._jobId : 0;
        case "creed":      return (actor && actor._ideologyId) || "";
        case "hometown":   return $gameSystem._ccHometown || "Paris"; // i18n-ignore: WorkSystem.Destinations id
        case "bond": {
          const state = actor ? this._romanceState(actor) : null;
          return (state && state.bonds[arg]) || "none";
        }
        case "class":     return actor ? "quick_class_" + actor._classId : "";
        case "traitpack": return this._activeTraitPackageId(actor);
        default: return "";
      }
    }

    // Where a picked value goes. Each arm calls the handler the <select>'s
    // onchange called, so nothing downstream of the choice knows the dropdown
    // is gone.
    _applyPick(kind, value, arg) {
      switch (kind) {
        case "archetype":  this.onSelectCreatureArchetype(value); break;
        case "archetype2": this.onSelectCreatureSecondaryArchetype(value); break;
        case "job":        this.onBioOptionChange('job', value); break;
        case "creed":      this.onBioOptionChange('ideology', value); break;
        case "hometown":   this.onBioOptionChange('hometown', value); break;
        case "bond":       this.onRomanceBondChange(arg, value); break;
        case "class":      this.onSimpleClassPick(value); break;
        case "traitpack":  this.onTraitPackageSelect(value); break;
        default: break;
      }
    }

    // The class board's cards, taken from the sheet instead. A card is a symbol
    // rather than a class id (the roll is a card too), so the symbol is read
    // here and the vocation behind it is handed to the one place a class is
    // ever changed.
    onSimpleClassPick(symbol) {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return;
      let classId = 0;
      if (symbol === "random_class") {
        const CC = window.CreatureClasses;
        const roster = (CC && Scene_CharacterCreation.isCreatureActor &&
          Scene_CharacterCreation.isCreatureActor(actor))
          ? (CC.creatureRoster ? CC.creatureRoster() : [])
          : (CC && CC.sentientRoster ? CC.sentientRoster() : []);
        if (roster.length) classId = roster[Math.floor(Math.random() * roster.length)];
      } else if (String(symbol).indexOf("quick_class_") === 0) {
        classId = parseInt(String(symbol).slice("quick_class_".length), 10);
      } else if (symbol === "mana_cyborg") {
        classId = 66;
      }
      if (!classId || typeof $dataClasses === "undefined" || !$dataClasses[classId]) {
        SoundManager.playBuzzer();
        return;
      }
      this.onBioOptionChange("class", classId);
      if (typeof markStepCompleted === "function") markStepCompleted(STEP.CLASS);
    }

    onOpenPick(kind, arg) {
      if (!window.CCPick) return;
      const options = this._pickOptions(kind, arg) || [];
      if (!options.length) { SoundManager.playBuzzer(); return; }
      // Which device opened the sheet, asked of the one place that answers it.
      const fromController = !window.CCSearch.enabled();
      window.CCPick.open({
        title: this._pickTitle(kind),
        options,
        value: this._pickCurrent(kind, arg),
        fromController: !!fromController,
        onPick: (value) => {
          this._applyPick(kind, value, arg);
          const container = this._dndContainer;
          if (!container) {
            this._lastStep = -1;
            this._lastIndex = -1;
            this.refreshUIOverlayDOM();
          }
        }
      });
    }

    // The label a trigger wears: the chosen option's own label, looked up in
    // the same bank the modal will show, so a value with no matching row reads
    // as unset rather than as whatever happened to be first.
    _pickLabel(kind, arg) {
      const value = this._pickCurrent(kind, arg);
      const row = (this._pickOptions(kind, arg) || [])
        .find((o) => String(o.value) === String(value));
      return row ? row.label : "";
    }

    _archetypeBioHtml(actor, isCreature) {
      const currentArch = actorArchetypeKey(actor) || (isCreature ? "Beast" : "Humanoid"); // i18n-ignore: Archetypes.json keys
      const secondArch = actorSecondaryArchetypeKey(actor) || "";
      // Neither list offers what the other one holds: the two halves of a
      // spliced body are always two different archetypes.
      // What the spliced body can hold, asked of the one place that answers it.
      // Two different numbers: how many grips the body has at all (hands, plus
      // a mouth for the class that fights with a blade in its teeth) and how
      // many weapons it swings at full strength, which is one unless the class
      // dual wields. Every hand can still close round a weapon past that, at a
      // penalty. Both are shown, for a person as much as for a creature,
      // because splicing on a second archetype is what changes them.
      const HS = window.HandSlots;
      const layout = (HS && HS.layout) ? HS.layout(actor) : null;
      const slots = layout ? layout.slots : 0;
      const maxWeapons = (HS && HS.freeWeapons) ? HS.freeWeapons(actor) : 0;
      const slotsHtml = `<div class="cc-bio-note">` +
        `${ccTp('CharCreate.weaponSlotsHeld', { n: maxWeapons })}` +
        ` <span class="cc-bio-note-dim">${ccTp('CharCreate.handSlotsHeld', { n: slots })}</span>` +
        `</div>`;
      const primaryHtml = isCreature ? `
          <div class="cc-bio-section-title">${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.primaryArchetype')}</span></div>
          ${this._pickTriggerHtml('archetype', this._pickLabel('archetype'))}
          <div class="cc-bio-section-title cc-gap-above">` : `
          <div class="cc-bio-section-title">`;
      return `
        <div class="cc-bio-section">
          ${primaryHtml}${this._ccIconHtml(224, 16)} <span>${ccT('CharCreate.secondaryArchetype')}</span></div>
          ${this._pickTriggerHtml('archetype2', this._pickLabel('archetype2'))}
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
        { val: 0, label: ccT('CharCreate.bio.gender.male') },
        { val: 1, label: ccT('CharCreate.bio.gender.female') },
        { val: 2, label: ccT('CharCreate.bio.gender.nonBinary') },
        { val: 3, label: ccT('CharCreate.bio.gender.cocoon') }
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
      const reproOpenClass = this._storyOpenClass("reproduction");
      const reproChipsHtml = ccReproChoices().map((r) => {
        const isSelected = currentRepro === r.val;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}${reproOpenClass}" onclick="SceneManager._scene.onBioOptionChange('reproduction', ${r.val})">${r.label}</button>`;
      }).join("");

      // And the endocrine balance the body runs at.
      const hormoneBalance = this._currentHormoneBalance();

      // Ideologies
      const allIdeologies = (window.NPCShared && window.NPCShared.ideologyList && window.NPCShared.ideologyList()) || [];

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

      // Morality Alignments
      const alignments = [
        { val: 2, label: ccT('CharCreate.bio.morality.saintly') },
        { val: 1, label: ccT('CharCreate.bio.morality.principled') },
        { val: 0, label: ccT('CharCreate.bio.morality.pragmatic') },
        { val: -1, label: ccT('CharCreate.bio.morality.ruthless') },
        { val: -2, label: ccT('CharCreate.bio.morality.vile') },
      ];
      const currentMorality = actor._morality != null ? actor._morality : 0;
      const moralityChips = alignments.map((a) => {
        const isSelected = currentMorality === a.val;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('morality', ${a.val})">${a.label}</button>`;
      }).join("");

      // Hometowns
      const hometowns = (window.WorkSystem && window.WorkSystem.Destinations)
        ? Object.keys(window.WorkSystem.Destinations)
        : ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"]; // i18n-ignore: WorkSystem.Destinations ids
      const currentHometown = $gameSystem._ccHometown || "Paris"; // i18n-ignore: WorkSystem.Destinations id
      // A dossier may name a town the work destinations never list (Em's
      // Wimbledon): without this the select silently fell back to its first
      // entry and the sheet claimed a birthplace nobody had chosen.

      // Age Bands
      const ageBands = [
        { key: "age_young", label: ccT('CharCreate.bio.age.young'), age: 22 },
        { key: "age_adult", label: ccT('CharCreate.bio.age.adult'), age: 32 },
        { key: "age_middle", label: ccT('CharCreate.bio.age.middle'), age: 48 },
        { key: "age_elder", label: ccT('CharCreate.bio.age.elder'), age: 68 },
      ];
      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const currentAge = ($gameSystem._ccBirthAge && $gameSystem._ccBirthAge[memberIdx]) || 28;
      const ageChips = ageBands.map((band) => {
        const isSelected = Math.abs(currentAge - band.age) < 10;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('age', ${band.age})">${band.label}</button>`;
      }).join("");

      // Wealth Tiers
      const wealthTiers = [
        { tier: 0, label: ccT('CharCreate.bio.wealth.destitute') },
        { tier: 1, label: ccT('CharCreate.bio.wealth.working') },
        { tier: 2, label: ccT('CharCreate.bio.wealth.middle') },
        { tier: 3, label: ccT('CharCreate.bio.wealth.wealthy') },
      ];
      const currentWealth = actor._wealthTier != null ? actor._wealthTier : 2;
      const wealthChips = wealthTiers.map((w) => {
        const isSelected = currentWealth === w.tier;
        return `<button class="cc-bio-chip ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBioOptionChange('wealth', ${w.tier})">${w.label}</button>`;
      }).join("");

      // Blood Types from BloodTypeService or comprehensive list
      // i18n-ignore-start: BloodTypeService fallback rows, .type is the id stored on the actor
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
        { id: "KIDD_B_NEG", type: "Kidd(b-)", rarityKey: "veryRare", category: "rare_human" }, // i18n-ignore-end
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
              <span>${ccT('CharCreate.bio.compatTitle')}</span>
              <span class="cc-blood-panel-selected">${ccT('CharCreate.bio.compatSelected')}: <b>${currentBloodEntry.type}</b></span>
            </div>
            <div class="cc-stack-gapped">
              <div class="cc-blood-line cc-blood-line--donate">
                <span class="cc-blood-line-label">↳ ${ccT('CharCreate.bio.canDonate')}</span>
                <span>${compat.canDonateTo.length > 0 ? compat.canDonateTo.map(m => `<b>${m.name}</b> (${m.type})`).join(", ") : `<span class="cc-note-quiet">${ccT('CharCreate.bio.noDonor')}</span>`}</span>
              </div>
              <div class="cc-blood-line cc-blood-line--receive">
                <span class="cc-blood-line-label">↳ ${ccT('CharCreate.bio.canReceive')}</span>
                <span>${compat.canReceiveFrom.length > 0 ? compat.canReceiveFrom.map(m => `<b>${m.name}</b> (${m.type})`).join(", ") : `<span class="cc-note-quiet">${ccT('CharCreate.bio.noRecipient')}</span>`}</span>
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
              <span class="cc-blood-line-label">${ccT('CharCreate.bio.traitLabel')}</span> ${specialTrait}
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
      const currentJobName = currentJob ? (window.WorkSystem && window.WorkSystem.jobName ? window.WorkSystem.jobName(currentJob) : (currentJob.name || ccTp('CharCreate.jobNumber', { id: currentJob.id }))) : ccT('CharCreate.bio.jobless');


      let jobItemsBadges = "";
      if (currentJob && Array.isArray(currentJob.items) && currentJob.items.length > 0) {
        jobItemsBadges = currentJob.items.map((itemId) => {
          const item = (typeof $dataItems !== 'undefined' && $dataItems[itemId]) ? $dataItems[itemId] : null;
          const itemName = item ? item.name : ccTp('CharCreate.itemNumber', { id: itemId });
          const iconIndex = item ? item.iconIndex : 160;
          return `
            <span class="cc-element-badge cc-element-badge--plain">
              ${this._ccIconHtml(iconIndex, 14)} <span>${itemName}</span>
            </span>
          `;
        }).join(" ");
      }

      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const isCreature = !!(actor && (actor._isCreatureActor || $gameSwitches.value(77 + memberIndex)));

      // Story mode reads Em's sheet rather than writing it: the whole detailed
      // page is drawn, down to her organs, her standing and her blood, and the
      // page lock (see _presetLockFreeStep) is what keeps it from being edited.
      const isSimpleMode = Scene_CharacterCreation.isSimpleMode() && !isStoryEm;

      // A character on a creature class is not a person and is not asked a
      // person's questions: no trade, no creed, no political graph and no
      // social standing. This is the class's own <NonSentient> tag read through
      // window.NPCCreature, NOT the creature/humanoid pill: a humanoid body may
      // be played as a Ghost or a Zombie, and a creature may hold a civilised
      // trade, so the class is the only thing that answers. The rows are left
      // off the sheet entirely rather than shown and quietly ignored, and they
      // come back the moment the class crosses back over the line. The same
      // rule the detailed panel and the Empathize panel play by.
      const feral = !!(window.NPCCreature && window.NPCCreature.isNonSentientActor(actor));

      const professionSectionHtml = feral ? '' : `
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(193, 16)} <span>${ccT('CharCreate.professionJob')}</span></div>
          ${this._pickTriggerHtml('job', this._pickLabel('job'))}
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
                <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.gender')}</span></div>
                <div class="cc-bio-chips-row">${genderChipsHtml}</div>
              </div>
              ${this._simpleSheetPickersHtml()}
              ${professionSectionHtml}
              ${feral ? '' : `
              <div class="cc-bio-section cc-bio-section-flush">
                <div class="cc-bio-section-title">${this._ccIconHtml(183, 16)} <span>${ccT('CharCreate.creedIdeology')}</span></div>
                ${this._pickTriggerHtml('creed', this._pickLabel('creed'))}
              </div>`}
            </div>
          </div>
        `;
      }

      // Detailed mode asks every bio question on this one sheet and has no
      // facing board to put beside it, so the page takes the whole spread.
      return `
        <div class="cc-page cc-page-left cc-page-full ts-page cc-page-column">
          <div class="cc-bio-container cc-step-scroll">
            ${typePillsHtml}
            ${archetypeBioHtml}
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.gender')}</span></div>
              <div class="cc-bio-chips-row">${genderChipsHtml}</div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(267, 16)} <span>${ccT('CharCreate.reproductiveOrgans')}</span></div>
              <div class="cc-bio-chips-row">${reproChipsHtml}</div>
              <div class="cc-bio-section-title cc-gap-above">${this._ccIconHtml(179, 16)} <span>${ccT('CharCreate.hormoneBalance')}</span></div>
              <div class="cc-bio-slider-row">
                <span class="cc-bio-slider-end">${ccT('CharCreate.hormoneOestrogenic')}</span>
                <input id="cc-hormone-slider" class="cc-bio-slider" type="range" min="0" max="100" step="1" value="${hormoneBalance}"
                  oninput="SceneManager._scene.onHormoneSliderPreview(this.value)"
                  onchange="SceneManager._scene.onBioOptionChange('hormones', this.value)">
                <span class="cc-bio-slider-end">${ccT('CharCreate.hormoneAndrogenic')}</span>
              </div>
              <div id="cc-hormone-readout" class="cc-bio-slider-readout">${this._hormoneReadoutHtml(hormoneBalance)}</div>
            </div>
            ${professionSectionHtml}
            <div class="cc-bio-section">
              <div class="cc-row-wide">
                ${feral ? '' : `
                <div class="cc-col-grow">
                  <div class="cc-bio-section-title">${this._ccIconHtml(183, 16)} <span>${ccT('CharCreate.creedIdeology')}</span></div>
                  <div class="cc-row-inline">
                    ${this._pickTriggerHtml('creed', this._pickLabel('creed'))}
                    <button type="button" class="cc-bio-chip" onclick="if(window.PoliticalGraph3D && SceneManager._scene){ SceneManager._scene.markReturnStep(); SceneManager._scene.closeStepUI(); window.PoliticalGraph3D.openModal({ focusId: SceneManager._scene._pickCurrent('creed'), onSelect: function(id) { Scene_CharacterCreation.applyIdeologySelection(id); } }); }" title="${ccT('CharCreate.openPoliticalGraph')}">${ccT('CharCreate.politicalGraph')}</button>
                  </div>
                </div>`}
                <div class="cc-col-grow">
                  <div class="cc-bio-section-title">${this._ccIconHtml(190, 16)} <span>${ccT('CharCreate.originCity')}</span></div>
                  ${this._pickTriggerHtml('hometown', this._pickLabel('hometown'))}
                </div>
              </div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.moralityAlignment')}</span></div>
              <div class="cc-bio-chips-row">${moralityChips}</div>
            </div>
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(113, 16)} <span>${ccT('CharCreate.ageBand')}</span></div>
              <div class="cc-bio-chips-row">${ageChips}</div>
            </div>
            ${feral ? '' : `
            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(208, 16)} <span>${ccT('CharCreate.socialStanding')}</span></div>
              <div class="cc-bio-chips-row">${wealthChips}</div>
            </div>`}
            <div class="cc-bio-section cc-bio-section-flush">
              <div class="cc-bio-section-title">${this._ccIconHtml(176, 16)} <span>${ccT('CharCreate.bloodType')}</span></div>
              <div class="cc-note-label cc-note-label-spaced">${ccT('CharCreate.bio.bloodStandard')}</div>
              <div class="cc-bio-chips-row cc-gap-below-tight">${renderChips(standardBloods)}</div>
              <div class="cc-note-label cc-note-label-spaced">${ccT('CharCreate.bio.bloodExotic')}</div>
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
      let html = backstory && window.NPCHistSim?.buildBackstoryHTML
        ? window.NPCHistSim.buildBackstoryHTML(backstory)
        : "";
      if (html) {
        html = html.replace(/<div class="npc-backstory-events">[\s\S]*?<\/div>/g, "");
        html = html.replace(/<div class="npc-backstory-meta">[\s\S]*?<\/div>/g, "");
        return html;
      }
      return `<div class="npc-backstory-text">${ccT('CharCreate.bio.noBackstory')}</div>`;
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
            <span class="cc-class-passive-tag">${ccT('CharCreate.limitBreak')}</span></div>
          ${limit.desc ? `<p class="cc-class-passive-desc">${limit.desc}</p>` : ''}
        </div>
      ` : "";

      // Weapon proficiencies
      const hasEquipTrait = (code, dataId) =>
        (c.traits || []).some((t) => t.code === code && t.dataId === dataId && t.value === 1);
      const weaponNames = {
        1: ccT('CharCreate.light'), 2: ccT('CharCreate.sword'), 3: ccT('CharCreate.heavy'),
        4: ccT('CharCreate.axe'), 5: ccT('CharCreate.whip'), 6: ccT('CharCreate.staff'),
        7: ccT('CharCreate.bow'), 8: ccT('CharCreate.projectile'), 9: ccT('CharCreate.gun'),
        10: ccT('CharCreate.claw'), 11: ccT('CharCreate.glove'), 12: ccT('CharCreate.spear')
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
        .filter((l) => l.level >= 1 && l.level <= 10)
        .sort((a, b) => a.level - b.level);

      const roadmapRowHtml = (l) => {
        const sk = (typeof $dataSkills !== 'undefined') ? $dataSkills[l.skillId] : null;
        if (!sk) return "";
        const iconIndex = sk.iconIndex || 79;
        const sName = window.CCDbName ? window.CCDbName(sk) : sk.name;
        const lvLabel = `${ccT('CharCreate.abbrev.level')} ${l.level}`;
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
            <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.classProfile')}</h4>
            ${passiveHtml}
            ${limitHtml}
          </div>

          ${weaponRows.length ? (
            typeof this._ccLoadoutSectionHtml === "function" ? this._ccLoadoutSectionHtml(
              ccT('CharCreate.startingWeaponProficiencies'),
              weaponRows.join(""),
              ccT('CharCreate.none'),
              true,
              'cc-loadout-grid-cols'
            ) : `
              <div class="cc-dossier-card cc-class-section cc-gap-below">
                <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.startingWeaponProficiencies')}</h4>
                <div class="cc-loadout-grid-cols">${weaponRows.join("")}</div>
              </div>
            `
          ) : ''}

          ${roadmapRows ? (
            typeof this._ccLoadoutSectionHtml === "function" ? this._ccLoadoutSectionHtml(
              ccT('CharCreate.skillRoadmap') + ' (Lv 1 - 10)',
              `<div class="cc-loadout-col">${roadmapRows}</div>`,
              "",
              true
            ) : `
              <div class="cc-dossier-card cc-class-section cc-gap-above-tight">
                <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.skillRoadmap')} (Lv 1 - 10)</h4>
                <div class="cc-loadout-col">${roadmapRows}</div>
              </div>
            `
          ) : ''}
        </div>
      `;
    }

    // The character's written history, given the whole spread. It is the
    // longest prose in creation and the one thing on the sheet that is read
    // rather than operated, so it is set as one wide column at the detail type
    // scale instead of being squeezed into a page beside a board of chips.
    //
    // The prose itself is not written here: _bioBackstoryHtml is the one place
    // that answers "what is this character's history", dossier or generated,
    // and it is asked the same question it was asked on the Bio page.
    _descriptionPageHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-full"></div>`;

      const memberIdx = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const age = ($gameSystem._ccBirthAge && $gameSystem._ccBirthAge[memberIdx]) || 28;
      const avatarStyle = actor.characterName()
        ? this.getSpriteStyle(actor.characterName(), actor.characterIndex()) : "";
      const classData = (typeof $dataClasses !== 'undefined') ? $dataClasses[actor._classId] : null;
      const className = classData
        ? (window.CCDbName ? window.CCDbName(classData) : classData.name)
        : ccT('CharCreate.defaultClassName');

      // A written dossier carries the biography its own entry states, and that
      // one is not rerolled: there is nothing to reroll it to.
      const rewritable = !this._presetLoreHtml(actor);
      const rewriteHtml = rewritable ? `
        <button class="cc-sidebar-btn cc-desc-rewrite focusable" tabindex="0"
                data-nav-key="cc-desc-rewrite"
                onclick="SceneManager._scene.onRegenerateBackstory()">
          <span>${ccT('CharCreate.regenerateBackstory')}</span>
        </button>` : "";

      return `
        <div class="cc-page cc-page-full cc-description-page cc-col">
          <div class="cc-bio-identity cc-description-head">
            <span class="cc-compact-avatar cc-avatar-sm" style="${avatarStyle}"></span>
            <span class="cc-bio-identity-name">${actor.name()}</span>
            <span class="cc-bio-identity-class">(${className})</span>
            <span class="cc-col-grow"></span>
            ${rewriteHtml}
          </div>
          <div class="cc-description-body cc-scroll-pane">
            ${this._bioBackstoryHtml(actor, age)}
          </div>
        </div>
      `;
    }

    // The history is rewritten by dropping the cached one and asking for it
    // again: the society registry is what holds it, so that is what is cleared.
    onRegenerateBackstory() {
      if (this._refusePresetEdit()) return;
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor || !actor.name()) { SoundManager.playBuzzer(); return; }
      const profile = window.NPCSocietyRegistry?.getProfile?.(actor.name()) || null;
      if (!profile) { SoundManager.playBuzzer(); return; }
      // The picks BackstoryGenerator makes are seeded by the name, so dropping
      // the cached bio and asking again writes the same life back out. Only the
      // salted reroll gives a different one.
      if (window.NPCHistSim?.rerollBackstory) {
        window.NPCHistSim.rerollBackstory(actor.name());
      } else {
        profile.backstory = null;
      }
      // A history the player asked for is a history they chose, so the tab
      // stops reading as untouched.
      actor._ccBackstory = true;
      this._ensureActorLore(actor, actor._gender);
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
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
      const className = classData ? (window.CCDbName ? window.CCDbName(classData) : classData.name) : ccT('CharCreate.defaultClassName');

      const isSimpleMode = Scene_CharacterCreation.isSimpleMode();
      const simpleClassHtml = isSimpleMode ? this._renderSimpleClassDetailsHtml(actor, classData) : "";
      const sheetHistoryHtml = isSimpleMode ? this._simpleSheetHistoryHtml(actor, age) : "";

      return `
        <div class="cc-page cc-page-right ts-page cc-page-column">
          <div class="cc-dossier-card cc-step-scroll-padded">
            <div class="cc-bio-identity">
              <span class="cc-compact-avatar cc-avatar-sm" style="${avatarStyle}"></span>
              <span class="cc-bio-identity-name">${actor.name()}</span>
              <span class="cc-bio-identity-class">(${className})</span>
            </div>

            ${sheetHistoryHtml}

            ${simpleClassHtml}

          </div>
        </div>
      `;
    }

    _simpleSheetTraitsHtml(actor) {
      if (!actor) return "";
      const picked = selectedTraitObjects ? (selectedTraitObjects(actor) || []) : [];
      const traitBadges = picked.length ? picked.map((tr) => {
        const name = (tr.name && resolveTraitName(tr.name, tr.id)) || tr.id;
        const icon = tr.icon || 87;
        const hoverAttrs = typeof this._ccHoverAttrs === "function" ? this._ccHoverAttrs("trait", tr.id) : "";
        return `<span class="cc-element-badge cc-element-badge--icon" ${hoverAttrs}>`
          + `<span class="cc-badge-icon">${this._ccIconHtml(icon, 16)}</span>`
          + `<span class="cc-badge-name">${name}</span></span>`;
      }).filter(Boolean).join("") : `<span class="cc-note-faint">${ccT('CharCreate.noDefiningTraits')}</span>`;

      return `
        <div class="cc-dossier-card cc-class-section cc-gap-below">
          <h4 class="cc-subheader cc-subheader-tight">${ccT('CharCreate.traits')}</h4>
          <div class="cc-badge-wrap">${traitBadges}</div>
        </div>
      `;
    }

    // The two choices the simple sheet used to send a player to another tab
    // for: which vocation this member takes, and which package of traits they
    // are the kind of person for. Both are ordinary pick triggers, shown side
    // by side in a row on the left page.
    _simpleSheetPickersHtml() {
      const packLabel = this._pickLabel('traitpack');
      return `
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(322, 16)} <span>${ccT('CharCreate.class')}</span></div>
          ${this._pickTriggerHtml('class', this._pickLabel('class'))}
        </div>
        <div class="cc-bio-section">
          <div class="cc-bio-section-title">${this._ccIconHtml(87, 16)} <span>${ccT('CharCreate.traits')}</span></div>
          ${this._pickTriggerHtml('traitpack', packLabel)}
        </div>
      `;
    }

    // The life the sheet wrote, on the sheet rather than behind a tab. Same
    // block the description page draws, and the same button rewrites it.
    _simpleSheetHistoryHtml(actor, age) {
      if (!actor) return "";
      const rewritable = !this._presetLoreHtml(actor);
      const rewriteHtml = rewritable ? `
        <button class="cc-sidebar-btn cc-desc-rewrite focusable" tabindex="0"
                data-nav-key="cc-desc-rewrite"
                onclick="SceneManager._scene.onRegenerateBackstory()">
          <span>${ccT('CharCreate.regenerateBackstory')}</span>
        </button>` : "";
      return `
        <div class="cc-dossier-card cc-class-section cc-gap-above">
          <h3 class="cc-subheader">
            <span>${ccT('CharCreate.description')}</span>
            ${rewriteHtml}
          </h3>
          ${this._bioBackstoryHtml(actor, age)}
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

    // Every question the quick flow never put to the player, answered at
    // random rather than carried into the world as null: a member built in
    // simple mode embarks with the same complete sheet the detailed panel
    // would have written. Nothing already chosen is overwritten. The
    // specialization purse is deliberately not spent here: what it still holds
    // is banked at embarkation (_bankUnspentSpecPoints) and spent later from
    // the specialization menu.
    _ensureSimpleModeStatsAndTraits(actor) {
      if (!actor) return;
      const rand = (list) => (list && list.length ? list[Math.floor(Math.random() * list.length)] : null);
      // A beast holds no trade, no creed, no purse and no romance. The
      // boundary is window.NPCCreature's to answer, never a class id read here.
      const feral = !!(window.NPCCreature && window.NPCCreature.isNonSentientActor &&
        window.NPCCreature.isNonSentientActor(actor));

      // Auto-assign random traits if not yet selected
      if (!actor._selectedTraits || actor._selectedTraits.length === 0) {
        if (window.randomizeTraitsForActor) {
          const aId = typeof actor.actorId === "function" ? actor.actorId() : 1;
          window.randomizeTraitsForActor(aId);
        } else if (window.Health && Array.isArray(window.Health.Traits)) {
          const nonGenetic = window.Health.Traits.filter(t => (t.category || "mental") !== "genetic");
          if (nonGenetic.length > 0) {
            const pick = rand(nonGenetic);
            if (typeof applyTraitsToActor === 'function') {
              applyTraitsToActor(actor, [pick.id]);
            } else {
              actor._selectedTraits = [pick.id];
            }
          }
        }
      }

      // The specialization purse, spent for them. Simple mode never opens the
      // board, so a sheet that leaves it here arrives with nothing trained;
      // the same roll the Randomize button makes is made quietly instead.
      // Em is the exception: the story mode deals her board and it is read
      // only, so nothing may be spent behind it either.
      if (!Scene_CharacterCreation._storyMode &&
          (!actor._specTrained || Object.keys(actor._specTrained).length === 0)) {
        const catalog = this._specsCatalog ? this._specsCatalog() : [];
        if (Array.isArray(catalog) && catalog.length) {
          actor._specTrained = {};
          this._randomSpendSpecs(actor, this._specGrantContext(actor), catalog, CC_SPEC_BUDGET);
        }
      }

      // Ensure gender defaults for organs & hormones
      const memberIdx = ($gameParty && $gameParty.members) ? $gameParty.members().indexOf(actor) : 0;
      const seat = memberIdx >= 0 ? memberIdx : 0;
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

      // Morality, on the bio page's own five-step scale.
      if (!feral && actor._morality == null) {
        actor._morality = rand([2, 1, 0, -1, -2]);
      }

      // Age, written where the bio page writes it: one birth age per seat.
      if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
      if (!$gameSystem._ccBirthAge[seat]) {
        $gameSystem._ccBirthAge[seat] = 18 + Math.floor(Math.random() * 52);
      }

      // Wealth, as the tier index the bio page stores (0 to 3).
      if (!feral && actor._wealthTier == null) {
        actor._wealthTier = Math.floor(Math.random() * 4);
      }

      // Blood, asked of the one service that owns the table.
      if (!actor._ccBloodType && !actor._bloodType) {
        const bloods = (window.BloodTypeService && window.BloodTypeService.list)
          ? window.BloodTypeService.list() : [];
        const blood = rand(bloods);
        if (blood) {
          actor._ccBloodType = blood.id;
          actor._bloodType = blood.type || blood.id;
          if (window.BloodTypeService.setForActor) {
            window.BloodTypeService.setForActor(actor, blood.id);
          }
        }
      }

      // One hometown for the whole party, the way the bio page writes it.
      if (!$gameSystem._ccHometown) {
        const towns = (window.WorkSystem && window.WorkSystem.Destinations)
          ? Object.keys(window.WorkSystem.Destinations) : [];
        const town = rand(towns);
        if (town) $gameSystem._ccHometown = town;
      }

      // A trade. Only the id is written: the starting goods a job hands out
      // belong to the player picking it on the bio page, not to a silent roll.
      if (!feral && !actor._jobId) {
        const job = rand((window.WorkSystem && window.WorkSystem.Jobs) || []);
        if (job) actor._jobId = job.id;
      }

      // The society profile holds the creed and the personality; it is minted
      // here if this member never reached a step that made one.
      let profile = null;
      if (window.NPCSocietyRegistry) {
        try {
          if (window.NPCSocietyRegistry.ensureProfile && actor.name()) {
            const cls = actor.currentClass();
            window.NPCSocietyRegistry.ensureProfile(actor.name(), cls ? cls.id : null);
          }
          if (window.NPCSocietyRegistry.getActorProfile) {
            profile = window.NPCSocietyRegistry.getActorProfile(actor.actorId());
          }
        } catch (e) {
          console.warn("[CharacterCreation] could not read the society profile", e);
        }
      }

      // A creed, written by id and by slot both, the way NPCShared reads it.
      if (!feral && !actor._ideologyId) {
        const creeds = (window.NPCShared && window.NPCShared.ideologyList)
          ? window.NPCShared.ideologyList() : [];
        const creed = rand(creeds);
        if (creed) {
          actor._ideologyId = creed.id;
          if (profile) {
            profile.ideologyId = creed.id;
            profile.ideologyIndex = creeds.indexOf(creed);
          }
        }
      }

      // A personality, which the whole NPC simulation reads a member's replies
      // out of. A beast answers in its class voice, so it is not asked.
      if (!feral && profile && (profile.personalityIndex == null || profile.personalityIndex < 0)) {
        const data = window._NPCSocietyDataLoader;
        const bank = (data && data.personalities) || [];
        if (bank.length) profile.personalityIndex = Math.floor(Math.random() * bank.length);
      }

      // Orientation, Kinsey placement and the way this character is tied to
      // somebody, rolled on the same weighted banks the world uses. Quiet: the
      // romance page is not on screen when this runs.
      if (!feral && !actor._ccRomance && typeof this._rollRomanceForActor === "function") {
        this._rollRomanceForActor(actor, true);
      }
    }

    // The bio page stays open in story mode (see _presetLockFreeStep), so the
    // four fields Em does not get to choose are refused here rather than by the
    // dossier lock: the chips and selects are already drawn as settled, this
    // catches the pad, the randomizer and anything else reaching in.
    _storyModeEmLocksField(field) {
      const CP = window.CharacterPresets;
      if (!CP || !CP.isStoryModeEm || !CP.isStoryModeEm()) return false;
      // Only what the story itself settles. Her creed, her trade and the body
      // she was born in are the player's (see STORY_EM_OPEN_FIELDS): the
      // Ritual left her a will, a living to make and a body, and none of the
      // three is written down anywhere the story depends on.
      return field === "class" || field === "gender";
    }

    onBioOptionChange(field, value) {
      const CP = window.CharacterPresets;
      const isStoryEm = !!(CP && CP.isStoryModeEm && CP.isStoryModeEm());
      // The lines of Em's sheet the story mode leaves open. Her dossier is
      // otherwise locked (the bio page is not a lock-free step), so these three
      // are let past the dossier lock by name rather than by opening the page.
      if (isStoryEm && STORY_EM_OPEN_FIELDS.includes(field)) {
        // nothing to refuse: these are hers to change
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
        const container = this._dndContainer;
        if (container) {
          const sidebarSlot = container.querySelector(".cc-sidebar-slot");
          if (sidebarSlot) sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
          const leftPage = container.querySelector(".cc-page-left");
          if (leftPage) this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
          const rightPage = container.querySelector(".cc-page-right");
          if (rightPage) this._ccSwapPage(rightPage, this._bioPickerRightHtml());
          this._refreshTopFolderTabs();
          return;
        }
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
        const sidebarSlot = container.querySelector(".cc-sidebar-slot");
        if (sidebarSlot) sidebarSlot.innerHTML = this._renderCompactSidebarHtml();
        // Most of these fields are a row of chips and nothing else: which one
        // is marked is the only thing that changed, so the mark is moved and
        // the page is left standing. Rebuilding it threw the reader back up
        // the sheet on every pick.
        if (!this._ccMarkBioChip(container, field, value)) {
          const leftPage = container.querySelector(".cc-page-left");
          if (leftPage) this._ccSwapPage(leftPage, this._bioPickerLeftHtml());
          const rightPage = container.querySelector(".cc-page-right");
          if (rightPage) this._ccSwapPage(rightPage, this._bioPickerRightHtml());
        }
        this._refreshTopFolderTabs();
        return;
      }
      this.refreshUIOverlayDOM();
    }

    // Moves the mark inside one row of bio chips, and answers whether it could.
    // A field whose pick rewrites a label, an option list or a readout is not
    // one of these and gets the full rebuild instead.
    _ccMarkBioChip(container, field, value) {
      const CHIP_ONLY = ["morality", "age", "wealth", "blood", "reproduction"];
      if (!CHIP_ONLY.includes(field) || !container.querySelectorAll) return false;
      const call = "onBioOptionChange('" + field + "'";
      const chips = Array.from(container.querySelectorAll(".cc-bio-chip"))
        .filter((el) => String(el.getAttribute("onclick") || "").indexOf(call) >= 0);
      if (!chips.length) return false;
      const wanted = call + ", " + (field === "blood" ? "'" + value + "'" : String(Number(value))) + ")";
      let marked = false;
      chips.forEach((el) => {
        const hit = String(el.getAttribute("onclick") || "").indexOf(wanted) >= 0;
        el.classList.toggle("selected", hit);
        if (hit) marked = true;
      });
      return marked;
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
        ${desc ? `<div class="cc-bio-slider-readout"><b>${ccT("CharCreate.romance.kinseyLabel")} ${current}</b>, ${desc}</div>` : ""}
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
        return `<div class="cc-bio-slider-readout cc-note-quiet">${ccT("CharCreate.romance.noOthers")}</div>`;
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
            ${this._pickTriggerHtml('bond', this._pickLabel('bond', other.actorId()), other.actorId())}
            ${desc && currentKey !== "none" ? `<div class="cc-bio-slider-readout">${desc}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    _romancePickerLeftHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return `<div class="cc-page cc-page-left"></div>`;
      // An orientation, a Kinsey placement and a relationship style are a
      // person's answers. A character on a creature class holds none of them
      // (window.NPCCreature owns the boundary, and the Empathize panel refuses
      // the same rows), so the page says so instead of offering a beast a
      // choice of romantic style. Crossing back to a civilised class brings
      // the whole page back with the answers it had.
      if (window.NPCCreature && window.NPCCreature.isNonSentientActor(actor)) {
        return `
          <div class="cc-page cc-page-full ts-page cc-page-column">
            <div class="cc-bio-container cc-step-scroll">
              <div class="cc-note-label">${ccT("CharCreate.romance.nonSentient")}</div>
            </div>
          </div>
        `;
      }

      const state = this._romanceState(actor);
      const banks = this._romanceBanks();
      const sexual = this._romanceEntry(banks.orient.sexual, state.sexualKey);
      const romantic = this._romanceEntry(banks.orient.romantic, state.romanticKey);
      const style = this._romanceEntry(banks.rel.styles, state.styleKey);

      const pctLine = (o) => o && o.pct != null
        ? `<div class="cc-bio-slider-readout">${o.pct}% ${ccT("CharCreate.romance.ofPopulation")}${o.esoteric ? ", " + ccT("CharCreate.romance.esoteric") : ""}</div>`
        : "";
      const descLine = (o) => o && o.desc
        ? `<div class="cc-bio-slider-readout">${this._romanceText(o.desc)}</div>` : "";


      return `
        <div class="cc-page cc-page-full ts-page cc-page-column">
          <div class="cc-bio-container cc-step-scroll">
            <div class="cc-row-end">
              <button class="cc-compact-btn" onclick="SceneManager._scene.onRandomizeRomanceForCurrentActor()">${ccT("CharCreate.randomize")}</button>
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(84, 16)} <span>${ccT("CharCreate.romance.romanticOrientation")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceOrientChipsHtml("romantic", state.romanticKey)}</div>
              ${descLine(romantic)}
              ${pctLine(romantic)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(267, 16)} <span>${ccT("CharCreate.romance.sexualOrientation")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceOrientChipsHtml("sexual", state.sexualKey)}</div>
              ${descLine(sexual)}
              ${pctLine(sexual)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(87, 16)} <span>${ccT("CharCreate.romance.kinseyScale")}</span></div>
              ${this._romanceKinseyHtml(state)}
            </div>
            <div class="cc-bio-section cc-bio-section--plain">
              <div class="cc-bio-section-title">${this._ccIconHtml(190, 16)} <span>${ccT("CharCreate.romance.style")}</span></div>
              <div class="cc-bio-chips-row">${this._romanceStyleChipsHtml(state.styleKey)}</div>
              ${descLine(style)}
            </div>
            <div class="cc-bio-section cc-bio-section-flush">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT("CharCreate.romance.bonds")}</span></div>
              ${this._romanceBondsHtml(actor, state)}
            </div>
          </div>
        </div>
      `;
    }

    _romancePickerRightHtml() {
      return "";
    }

    _romanceRepaint() {
      const container = this._dndContainer;
      if (container) {
        const page = container.querySelector(".cc-page-full") || container.querySelector(".cc-page-left");
        if (page) this._ccSwapPage(page, this._romancePickerLeftHtml());
        const rightPage = container.querySelector(".cc-page-right");
        if (rightPage) rightPage.innerHTML = "";
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
    // `quiet` rolls without repainting: the embarkation gate calls this with
    // the romance page nowhere on screen.
    _rollRomanceForActor(actor, quiet) {
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
      if (!quiet) this._romanceRepaint();
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

      const hometowns = ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"]; // i18n-ignore: WorkSystem.Destinations ids
      $gameSystem._ccHometown = hometowns[Math.floor(Math.random() * hometowns.length)];

      if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
      $gameSystem._ccBirthAge[memberIdx] = 18 + Math.floor(Math.random() * 52);

      actor._wealthTier = Math.floor(Math.random() * 4);

      // A body as well as a life: any of the six organ sets, and a balance
      // anywhere on the scale rather than one of the two defaults.
      const reproChoices = ccReproChoices();
      this.onBioOptionChange("reproduction", reproChoices[Math.floor(Math.random() * reproChoices.length)].val);
      if (actor.setHormoneBalance) actor.setHormoneBalance(Math.floor(Math.random() * 101));

      // i18n-ignore-start: BloodTypeService fallback rows, .type is the id stored on the actor
      const bloodList = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [];
      if (bloodList.length > 0) {
        const picked = bloodList[Math.floor(Math.random() * bloodList.length)];
        actor._ccBloodType = picked.id;
        actor._bloodType = picked.type || picked.id;
        if (window.BloodTypeService && window.BloodTypeService.setForActor) {
          window.BloodTypeService.setForActor(actor, picked.id);
        }
      } else {
        const bloodTypes = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "Synthetic-Δ", "Azure (Hemocyanin)"]; // i18n-ignore: blood type ids
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

      // i18n-ignore-start: pet kind ids, matched against _petCategories
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
      // i18n-ignore-end

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

        const icon = kind === "Animal" ? 292 : (kind === "Construct" ? 141 : (kind === "Undead" ? 136 : 176)); // i18n-ignore: pet kind ids
        const desc = ccT('CharCreate.petDesc');

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
            const icon = kind === "Animal" ? 292 : (kind === "Construct" ? 141 : (kind === "Undead" ? 136 : 176)); // i18n-ignore: pet kind ids // i18n-ignore: pet kind ids

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
              desc: ccTp('CharCreate.petDescKind', { kind: kind.toLowerCase() })
            });
          }
        }
      } catch (e) {}

      catalog.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      this._cachedPetCatalog = catalog;
      return catalog;
    }

    _petCategories() {
      // i18n-ignore-start: pet kind ids
      return [
        { id: "all",       label: ccT('CharCreate.filterAll') },
        { id: "Animal",    label: ccT('CharCreate.petKindAnimals') },
        { id: "Creature",  label: ccT('CharCreate.petKindCreatures') },
        { id: "Construct", label: ccT('CharCreate.petKindConstructs') },
        { id: "Undead",    label: ccT('CharCreate.petKindUndead') },
      ];
      // i18n-ignore-end
    }

    // Travelling alone leads the board. It was always allowed, but the only way
    // to say so was to take a companion and then hand it back, so the card that
    // means "none" sits first, ahead of every filter and every search.
    // The board belongs to a familiar in the story mode and to the party's
    // pets everywhere else, and every word on it follows the tab rather than
    // half of them saying one thing and half the other.
    _petWord(storyKey, petsKey) {
      return Scene_CharacterCreation._storyMode
        ? ccT(storyKey)
        : ccT(petsKey);
    }

    _petNoneCard() {
      return {
        id: PET_NONE_ID,
        name: this._petWord('CharCreate.noCompanion', 'CharCreate.petsNone'),
        kind: ccT('CharCreate.petKindNone'),
        sprite: "",
        spriteIndex: 0,
        desc: this._petWord('CharCreate.noCompanionDesc', 'CharCreate.petsNoneDesc'),
      };
    }

    _petPickerLeftHtml() {
      const activeCat = Scene_CharacterCreation._activePetCategory || "all";
      // No strip on a pad, so no filter either (CCSearch).
      const searchQuery = window.CCSearch.query(Scene_CharacterCreation._petSearchQuery).trim().toLowerCase();
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
            ${window.CCSearch.html({
              className: "backpack-search-input cc-rail-search",
              placeholder: this._petWord('CharCreate.petSearchPlaceholder', 'CharCreate.petsSearchPlaceholder'),
              value: Scene_CharacterCreation._petSearchQuery,
              oninput: "SceneManager._scene.onPetSearch(this.value)",
            })}
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
        return `<div class="cc-empty-note">${this._petWord('CharCreate.petNoneFound', 'CharCreate.petsNoneFound')}</div>`;
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
      // The none card leads the board, so it leads the sidebar too: a party
      // that has taken no companion was being read back the first monster in
      // the catalogue, which said it had one.
      const catalog = [this._petNoneCard()].concat(this._petCatalog());
      const selectedPet = $gameSystem._partyPet;
      const hoveredId = Scene_CharacterCreation._hoveredPetId || (selectedPet ? selectedPet.id : PET_NONE_ID);
      const pet = catalog.find((p) => p.id === hoveredId) || catalog[0];
      if (!pet) return `<div class="cc-compact-sidebar"></div>`;
      const isChosen = selectedPet && selectedPet.id === pet.id;
      // Travelling alone has no sprite, no stat line and no traits to spend:
      // the sidebar says what it means and offers the reroll, nothing else.
      if (pet.id === PET_NONE_ID) {
        return `
          <div class="cc-compact-sidebar cc-pet-sidebar">
            <div class="cc-compact-sidebar-body">
              <div class="cc-compact-identity-card">
                <span class="cc-pet-sidebar-name">${pet.name}</span>
              </div>
              <p class="cc-text-desc cc-text-desc--body">${pet.desc}</p>
            </div>
            <div class="cc-compact-actions cc-stack">
              <button class="cc-compact-btn primary" onclick="SceneManager._scene.onRandomizePet()">${ccT('CharCreate.randomizeCompanion')}</button>
            </div>
          </div>
        `;
      }
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
                  <div class="cc-compact-avatar" ${window.CCArt.walkAttr(pet.sprite, pet.spriteIndex || 0)} style="${spriteStyle}"></div>
                </div>
                <div class="cc-col cc-col-gap-1 cc-col-grow">
                  <div class="cc-row-spread">
                    <span class="cc-pet-sidebar-name">${pet.name}</span>
                  </div>
                </div>
              </div>
            </div>

            ${statsHtml}

            <div class="cc-bio-section">
              <div class="cc-bio-section-title">${this._ccIconHtml(246, 16)} <span>${ccT('CharCreate.petTraitsTitle')}</span></div>
              <div class="cc-bio-chips-row">
                <button class="cc-bio-chip ${traits.sentient ? 'selected' : ''}" onclick="SceneManager._scene.onTogglePetTrait('sentient')">${ccT('CharCreate.petTraitSentient')}</button>
                <button class="cc-bio-chip ${traits.magical ? 'selected' : ''}" onclick="SceneManager._scene.onTogglePetTrait('magical')">${ccT('CharCreate.petTraitMagical')}</button>
                <button class="cc-bio-chip ${traits.geneticFreak ? 'selected' : ''}" onclick="SceneManager._scene.onTogglePetTrait('geneticFreak')">${ccT('CharCreate.petTraitGeneticFreak')}</button>
              </div>
            </div>

          </div>

          <div class="cc-compact-actions cc-stack">
            <button class="cc-compact-btn primary" onclick="SceneManager._scene.onRandomizePet()">${ccT('CharCreate.randomizeCompanion')}</button>
          </div>
        </div>
      `;
    }

    onPetTabClick() {
      this._pageRailFocused = false;
      Scene_CharacterCreation._railFocus = null;
      Scene_CharacterCreation._isPetMode = true;
      Scene_CharacterCreation._isVehicleMode = false;
      Scene_CharacterCreation._isPartyPresetMode = false;
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
        badge.textContent = ccTp('CharCreate.petCount', { n: filtered.length }); // i18n-ignore: argument is an i18n key
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
        const petTabLabel = this._dndContainer && this._dndContainer.querySelector(".cc-pet-tab span");
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
            <div class="cc-pet-kind">${isSel ? ccT('CharCreate.vehicleOwned') : ccT('CharCreate.vehicleFree')}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="cc-page cc-page-full ts-page cc-page-column">
          <div class="cc-row-controls">
            <h3 class="cc-subheader cc-subheader--flush">${T('CharCreate.chooseYourVehicle')}</h3>
          </div>
          <div class="cc-pet-grid">
            ${cards}
          </div>
        </div>
      `;
    }

    _vehicleSidebarHtml() {
      // The garage is read off its own cards now, so the column beside them is
      // left empty rather than repeating what a card already says.
      return "";
      /* eslint-disable no-unreachable */
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
            <button class="cc-compact-btn ${isSel ? '' : 'primary'}" onclick="SceneManager._scene.onVehicleCardToggle('${v.symbol}')">${isSel ? ccT('CharCreate.vehicleDrop') : ccT('CharCreate.vehicleTake')}</button>
          </div>
        </div>
      `;
      /* eslint-enable no-unreachable */
    }

    onVehicleTabClick() {
      // The story mode sets out in The Beast, parked where Em left it, and is
      // never asked what it drives.
      if (Scene_CharacterCreation._storyMode) { SoundManager.playBuzzer(); return; }
      this._pageRailFocused = false;
      Scene_CharacterCreation._railFocus = null;
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = true;
      Scene_CharacterCreation._isPartyPresetMode = false;
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
      // See onProceedToScenario: the scenario cards are walked by the origin
      // board, and the board is only dealt its choices by setupStep.
      this.setupStep();
      this._lastStep = -1;
      this._lastIndex = -1;
    }

    // The Randomize Party button on the scenario board: three new characters
    // without leaving the page.
    onChaosRerollParty() {
      this.createTotalRandomPartyAll();
      Scene_CharacterCreation._isScenarioMode = true;
      this._step = STEP.ORIGIN;
      // See onProceedToScenario: without this the origin board keeps whatever
      // choices the last step dealt it and the pad cannot pick a scenario.
      this.setupStep();
      // The wizard is silent on a confirm: only the cursor, the refusal and
      // the cancel are heard on it (test_cc_reachability).
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // Rerolling the whole party from the action bar is a reroll and nothing
    // more: it stays on the page the player is reading instead of throwing them
    // forward onto the scenario board.
    onActionBarRandomizeParty() {
      const step = this._step;
      this.createTotalRandomPartyAll({ advance: false });
      this._step = step;
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    createTotalRandomPartyAll(options = {}) {
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
      Scene_CharacterCreation._randomizedAllParty = options.advance !== false;

      if (options.advance === false) return;

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
          // i18n-ignore-start: mirror of the Health trait rows, which carry their own i18n
          : ((window.HealthCore && window.HealthCore.Traits) || [
            { id: "claustrophobic", name: "Claustrophobic", cost: -3 },
            { id: "genius", name: "Genius", cost: 3 },
            { id: "athletic", name: "Athletic", cost: 5 },
            { id: "lucky", name: "Lucky", cost: 3 },
            { id: "paranoid", name: "Paranoid", cost: -1 } // i18n-ignore-end
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
        if (typeof applyTraitsToActor === 'function') {
          applyTraitsToActor(currentActor, picked);
        } else {
          currentActor._selectedTraits = picked;
        }
      }

      // Random Specializations (Allocate 12 budget points across catalog)
      const specCatalog = this._specsCatalog ? this._specsCatalog() : ((window.Specializations && window.Specializations.list) || []);
      currentActor._specTrained = {};
      if (Array.isArray(specCatalog) && specCatalog.length > 0) {
        const specGrantCtx = this._specGrantContext ? this._specGrantContext(currentActor) : null;
        if (typeof this._randomSpendSpecs === "function") {
          const left = this._randomSpendSpecs(currentActor, specGrantCtx, specCatalog, CC_SPEC_BUDGET);
          currentActor._specPointsSpent = CC_SPEC_BUDGET - left;
        }
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
        : ["Paris", "Tokyo", "Neo-Cairo", "Brussels", "Berlin", "London", "Rome", "New York", "Geneva", "Athens"]; // i18n-ignore: WorkSystem.Destinations ids
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

      // i18n-ignore-start: BloodTypeService fallback rows, .type is the id stored on the actor
      const bloodList = (window.BloodTypeService && window.BloodTypeService.list && window.BloodTypeService.list()) || [];
      if (bloodList.length > 0) {
        const pickedBlood = bloodList[Math.floor(Math.random() * bloodList.length)];
        currentActor._ccBloodType = pickedBlood.id;
        currentActor._bloodType = pickedBlood.type || pickedBlood.id;
        if (window.BloodTypeService && window.BloodTypeService.setForActor) {
          window.BloodTypeService.setForActor(currentActor, pickedBlood.id);
        }
      } else {
        const bloodTypes = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "Synthetic-Δ", "Azure (Hemocyanin)"]; // i18n-ignore: blood type ids
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

      // The bust comes off the sheet that was just picked, asked of the one
      // service that pairs them (it reads the sprite catalogue as well as the
      // older SpritesAssociation table, and lends a single bust to every index).
      // A stranger is rolled in only for a sheet that carries no portrait.
      const pairedBust = window.selectBustForActorSprite
        ? window.selectBustForActorSprite(targetActorId)
        : null;
      if (!pairedBust && window.selectRandomBustForActor) {
        window.selectRandomBustForActor(targetActorId);
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
