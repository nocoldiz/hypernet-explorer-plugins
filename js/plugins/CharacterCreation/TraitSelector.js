//=============================================================================
// TraitSelector.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Trait Selector Menu v1.4.0
 * @author Omni-Lex
 * @version 1.4.0
 * @description A trait selection menu that affects player stats and abilities
 *
 * @help TraitSelector.js
 *
 * This plugin creates a trait selection menu where players spend a purse of
 * trait points on traits that affect their character's base stats, skills,
 * items and equipment. Every trait in js/db/Health/Traits.json carries a
 * `cost`: a positive one is paid out of the purse, a negative one is a
 * drawback that pays points back into it.
 *
 * The scene is drawn entirely by the shared character creation overlay
 * (#character-creation-container), so it uses the same book spread, cards,
 * dossier panels and treaty buttons as every other creation step.
 *
 * Plugin Command:
 * Use "Open Trait Selector" in the plugin commands menu
 *
 * Script call to open the trait selector:
 * SceneManager.push(Scene_TraitSelector);
 *
 * @command openTraitSelector
 * @text Open Trait Selector
 * @desc Opens the trait selection menu
 *
 * @command openTraitSelectorForCreation
 * @text Open Trait Selector (Character Creation)
 * @desc Opens the trait selector and returns to character creation when done
 *
 * @arg actorId
 * @text Actor ID
 * @desc The ID of the actor to apply traits to (leave blank for default)
 * @type actor
 * @default 1
 *
 * @command randomizeTraits
 * @text Randomize Traits
 * @desc Rolls a compatible set of traits the point budget can pay for and applies it to the actor
 *
 * @param switchIds
 * @text Switch IDs to Reset
 * @desc Comma-separated list of switch IDs that will be turned OFF when opening the menu
 * @type string
 * @default 1,2,3,4,5,6,7,8,9,10,11,12
 *
 * @param actorId
 * @text Actor ID
 * @desc The ID of the actor that will receive the trait bonuses
 * @type actor
 * @default 1
 */

(() => {
  "use strict";

  const pluginName = "TraitSelector";
  const parameters = PluginManager.parameters(pluginName);
  const switchIds = String(parameters["switchIds"] || "")
    .split(",")
    .map((id) => parseInt(id.trim()))
    .filter((id) => id > 0);
  const actorId = parseInt(parameters["actorId"]) || 1;
  // The one list every trait UI in this file reads: the browsable categories,
  // the randomizer and the Detailed editor's re-roll all go through it. A
  // trait of the wrong nature is not offered at all in a severed or unbound
  // world (window.MagicNature), so it is never browsed, never rolled and never
  // printed on a sheet. A trait a character ALREADY carries is untouched: the
  // level decides what is offered from now on, not what somebody is.
  const getTraits = () => {
    const all = (window.Health ? window.Health.Traits || [] : []);
    const MN = window.MagicNature;
    if (!MN || !MN.isFiltering()) return all;
    const kept = all.filter(t => MN.allowsTrait(t));
    // Never hand back an empty trait book: a world with no traits at all would
    // leave character creation with a step it cannot complete.
    return kept.length ? kept : all;
  };
  // Database display names, localized. This plugin loads before
  // CharacterCreationShared, so the lookup stays lazy.
  const dbName = (entry) =>
    window.CCDbName ? window.CCDbName(entry) : (entry && entry.name) || "";

  // Columns in the trait card grid; keep in sync with .cc-trait-grid in
  // theme.css so keyboard up/down moves the cursor by one visual row.
  const TRAIT_GRID_COLS = 4;

  // --- Trait points -------------------------------------------------------
  // A trait is not one of four interchangeable slots any more. Every entry in
  // js/db/Health/Traits.json carries a `cost` in the -4..+5 range and a
  // character is born with a purse to spend: a strong trait is expensive, and
  // a trait that is nothing but a burden costs a negative number, paying
  // points back so a build can afford something it otherwise could not.
  //
  // The two caps are what keep that honest. Without the refund cap a sheet
  // could be twenty afflictions deep and buy the whole book with them; without
  // the pick cap a purse full of one-point traits would print a character
  // sheet nobody can read.
  const TRAIT_POINT_BUDGET = 10;
  const TRAIT_REFUND_CAP = 6;
  const TRAIT_MAX_PICKS = 8;

  // Nothing is free: a trait whose data forgot to price it is charged a point.
  // Illnesses are not traits and are never priced (see the diseases tab).
  const traitCost = (trait) => {
    if (!trait || trait.diseaseId) return 0;
    const cost = Number(trait.cost);
    return Number.isFinite(cost) ? cost : 1;
  };

  // What a set of traits has spent, what its drawbacks paid back and what is
  // left. `refunded` is the raw sum of the drawbacks; only `credit`, the part
  // under the cap, actually buys anything.
  const traitTally = (traits) => {
    const rows = traits || [];
    let spent = 0;
    let refunded = 0;
    rows.forEach((trait) => {
      const cost = traitCost(trait);
      if (cost >= 0) spent += cost;
      else refunded -= cost;
    });
    const credit = Math.min(refunded, TRAIT_REFUND_CAP);
    return {
      spent,
      refunded,
      credit,
      available: TRAIT_POINT_BUDGET + credit,
      remaining: TRAIT_POINT_BUDGET + credit - spent,
      count: rows.length,
    };
  };

  // Whether one more trait fits: the purse, the refund cap and the pick cap.
  // A drawback past the cap is refused rather than silently paying nothing.
  const traitFits = (trait, traits) => {
    const tally = traitTally(traits);
    if (tally.count >= TRAIT_MAX_PICKS) return false;
    const cost = traitCost(trait);
    if (cost < 0) return tally.refunded - cost <= TRAIT_REFUND_CAP;
    return cost <= tally.remaining;
  };

  // A cost badge reads as what the trait does to the purse: a plain number is
  // what it takes out, a "+n" in the refund colour is what it pays in.
  const costBadgeHTML = (cost) =>
    cost < 0
      ? `<span class="trait-cost refund">+${-cost}</span>`
      : `<span class="trait-cost">${cost}</span>`;

  // Roll a build the purse can actually pay for. `rng` is any () => [0,1) so
  // the seeded generators elsewhere (NPC society, the character sheet) can
  // hand in their own and stay reproducible. Drawbacks are rolled first: what
  // they pay back is what the rest of the build is bought with.
  const pickRandomTraits = (options) => {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    // Genetic traits are biology, settled by the body chosen earlier in
    // creation, so no roll ever draws one: a caller that wants them has to
    // hand in a pool that holds them.
    const bag = (opts.pool || getTraits().filter((trait) => (trait.category || "mental") !== "genetic")).slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = bag[i];
      bag[i] = bag[j];
      bag[j] = swap;
    }

    const picked = [];
    const compatible = (trait) => !picked.some((bound) =>
      (trait.incompatible || []).includes(bound.id) ||
      (bound.incompatible || []).includes(trait.id)
    );
    const consider = (trait) => {
      if (picked.includes(trait)) return;
      if (compatible(trait) && traitFits(trait, picked)) picked.push(trait);
    };

    const wantedDrawbacks = Math.floor(rng() * 3); // 0-2 burdens to fund the rest
    if (wantedDrawbacks > 0) {
      for (const trait of bag) {
        if (picked.length >= wantedDrawbacks) break;
        if (traitCost(trait) < 0) consider(trait);
      }
    }
    // Then spend the purse down. The bag is walked to the end rather than
    // stopped at the first trait that does not fit, so the last point or two
    // still find something cheap to buy.
    for (const trait of bag) {
      if (traitTally(picked).remaining <= 0) break;
      if (traitCost(trait) >= 0) consider(trait);
    }
    return picked;
  };

  // "diseases" is a fifth tab and not a fifth kind of trait: what is picked
  // there is an illness the character walks in already carrying, it costs no
  // trait points at all, and it is handed to Health_DiseaseSystem rather
  // than folded into paramPlus.
  const TRAIT_CATEGORIES = ["genetic", "physical", "mental", "magical", "diseases"];
  const TRAIT_CATEGORY_LABELS = {
    genetic: "tabGenetic",
    physical: "tabPhysical",
    mental: "tabMental",
    magical: "tabMagical",
    diseases: "tabDiseases",
  };   // i18n-ignore: keys into Traits.<tab*>
  const DISEASE_CATEGORY = "diseases";  // i18n-ignore: category key

  // The illness library, dressed as trait cards so one grid draws both. A
  // stage nobody catches (AIDS is reached, never contracted) is left off the
  // board; everything else in the library can be chosen freely.
  const getDiseaseCards = () => {
    const api = window.DiseaseSystem;
    if (!api || !api.all) return [];
    return api.all()
      .filter((d) => !d.stageOnly)
      .map((d) => ({
        id: "disease:" + d.id,          // i18n-ignore: card identity
        diseaseId: d.id,
        category: DISEASE_CATEGORY,
        icon: 180,
        name: d.name,
        description: d.desc,
        positive: {},
        negative: {},
        skills: [], items: [], equipment: [], switches: [], incompatible: [],
        _disease: d,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const t = (key, params) => T('Traits.' + key, params);

  let _statsI18n = null;

  const _loadStatsI18n = async () => {
    const lang = ConfigManager.language || 'en';
    const url = `js/i18n/${lang}/stats.json`;
    try {
      const response = await fetch(url);
      _statsI18n = await response.json();
    } catch (e) {
      console.error('TraitSelector: Failed to load i18n data from ' + url, e);
    }
  };

  const _si18n = (key) => {
    if (_statsI18n && _statsI18n[key]) {
      return _statsI18n[key];
    }
    return key;
  };

  _loadStatsI18n();

  let i18nData = null;

  const loadI18nData = async () => {
    const lang = ConfigManager.language || "en";
    const url = `js/i18n/${lang}/traits.json`;
    try {
      const response = await fetch(url);
      i18nData = await response.json();
    } catch (e) {
      console.error("TraitSelector: Failed to load i18n data from " + url, e);
    }
  };

  const resolveI18nPath = (path, obj) => {
    if (!path || !obj) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  // Register plugin commands
  PluginManager.registerCommand(pluginName, "openTraitSelector", (args) => {
    Scene_TraitSelector.prepare(false, null);
    SceneManager.push(Scene_TraitSelector);
  });

  // New command: Open trait selector during character creation
  PluginManager.registerCommand(pluginName, "openTraitSelectorForCreation", (args) => {
    const targetActorId = args.actorId ? parseInt(args.actorId) : actorId;
    Scene_TraitSelector.prepare(true, targetActorId);
    SceneManager.push(Scene_TraitSelector);
  });

  // Helper function to get translated trait property
  const getTraitText = (trait, type) => {
    if (!trait) return "";
    const intKey = trait[type];
    if (intKey && i18nData) {
      const localized = resolveI18nPath(intKey, i18nData);
      if (localized) return localized;
    }
    const useTranslation = ConfigManager.language === "it";
    const value = trait[type];
    if (typeof value === "object" && value !== null) {
      return useTranslation ? value.it : value.en;
    }
    return value || (trait[type] || "");
  };

  // The engine's own param names (ATT, M.DEF, LUCK) are not what this game
  // calls its attributes: a trait's stat line reads STR, WIS and PSI like the
  // sheet beside it. window.TraitParams is the one place that says so.
  const getParamDisplayName = (paramKey) => {
    if (paramKey === "eva") return "EVA";
    return window.TraitParams ? window.TraitParams.label(paramKey) : String(paramKey).toUpperCase();
  };

  // Specializations (js/db/Skills/Specialization.json via SpecializationMenu.js)
  // that this trait grants a head start in, sorted by name. Returns [] until
  // window.Specializations finishes its async load.
  const getTraitGrantedSpecializations = (trait) => {
    if (!trait || !trait.name || !window.Specializations || !window.Specializations.ready) return [];
    const slug = trait.name.split(".")[1];
    if (!slug) return [];
    const rows = [];
    window.Specializations.list.forEach((spec) => {
      const lvl = spec.traitStart && spec.traitStart[slug];
      if (lvl) rows.push({ name: window.Specializations.displayName(spec), levelName: window.Specializations.levelName(lvl) });
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  };

  //-----------------------------------------------------------------------------
  // Scene_TraitSelector
  //-----------------------------------------------------------------------------
  // The whole scene is the shared character creation overlay: a book spread
  // whose LEFT page holds the category tabs, the trait cards and the details of
  // the highlighted trait, and whose RIGHT page holds the point purse, every
  // bound trait written out in full, the running tally and the granted skills.
  // No RPG Maker window is drawn, the cursor lives in the scene itself.

  class Scene_TraitSelector extends Scene_MenuBase {
    static _returnToCharacterCreation = false; // Flag to control return behavior
    static _targetActorId = null; // Track which actor to apply traits to

    static prepare(returnToCreation = false, targetActorId = null) {
      Scene_TraitSelector._returnToCharacterCreation = returnToCreation;
      Scene_TraitSelector._targetActorId = targetActorId;
    }

    create() {
      super.create();
      this._selectedTraits = [];
      this._selectedDiseases = [];
      this._currentCategory = TRAIT_CATEGORIES[0];
      this._cursor = 0;
      // Confirmation prompt: null when closed, otherwise the focused answer.
      this._confirmYes = null;
      this._categoryCache = {};
      // Only keyboard movement scrolls the grid to the cursor; mouse hover
      // must never yank the list under the pointer.
      this._keyboardCursor = true;

      // The shared search + filter strip (UI/MenuSearchBar.js), in this page's
      // vocabulary: a trait costs points and has a nature, and nothing here is
      // weighed or levelled.
      this._traitBar = window.MenuSearchBar ? window.MenuSearchBar.create({
        id: 'traits',
        placeholder: t('searchPlaceholder'),
        sorts: ['name', 'price'],
        onChange: () => {
          this._cursor = 0;
          // The grid only ever rebuilds on a category switch; a new filter is
          // a new grid too, so the signature is cleared to force one.
          if (this._sig) this._sig.category = null;
          this.syncOverlay(false);
          if (this._traitBar) this._traitBar.restoreFocus();
        }
      }) : null;

      loadI18nData().then(() => {
        this.resetSwitches();
        this.resetActorTraits();
        this.loadActorTraits();
        this.createUIOverlay();
      });
    }

    terminate() {
      super.terminate();
      if (window.CCNav) window.CCNav.detach(this);
      if (this._traitBar) { this._traitBar.dispose(); this._traitBar = null; }
      if (this._dndContainer) {
        window.CCPanel.hide(this._dndContainer);
      }
    }

    createBackground() {
      this._backgroundSprite = new Sprite();
      this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
      this.addChild(this._backgroundSprite);
    }

    createUIOverlay() {
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

      this._sig = { category: null, selection: null, cursor: -1, hover: -1, specsReady: null, confirm: null };
      this._gridCount = 0;
      // Wheel + L2/R2 scrolling for the pages. See CCScroll.
      if (window.CCScroll) window.CCScroll.bindWheel(this._dndContainer);
      // Reset, Random and Continue sit under the board, and the picked chips
      // beside it: none of them is a card, so the grid cursor cannot reach
      // them. The focus ring can. See CharacterCreationNav.js.
      if (window.CCNav) window.CCNav.attach(this, this._dndContainer);
      this.buildOverlayDOM();
    }

    // CCScroll hook: the triggers scroll the card grid, the pane the cursor
    // lives in (a wheel over any other pane still scrolls that pane).
    ccScrollTarget() {
      return this._el ? this._el.grid : null;
    }

    // Sprite from IconSet.png at an arbitrary size. The sheet is 16 icons wide
    // at 32px each, so scaling the whole sheet keeps every cell square.
    getIconStyle(iconIndex, size = 32) {
      return window.CCArt.icon(iconIndex, size);
    }

    currentTraits() {
      const category = this._currentCategory || TRAIT_CATEGORIES[0];
      if (!this._categoryCache) this._categoryCache = {};
      if (category === DISEASE_CATEGORY) {
        if (!this._diseaseCards || !this._diseaseCards.length) this._diseaseCards = getDiseaseCards();
        return this._diseaseCards;
      }
      if (!this._categoryCache[category]) {
        const rows = getTraits().filter((trait) => (trait.category || "mental") === category);
        // Do not memoise an empty result: window.Health may still be loading.
        if (!rows.length) return rows;
        this._categoryCache[category] = rows;
      }
      return this.filterTraits(this._categoryCache[category]);
    }

    // Whatever the search strip is asking for, applied to the open tab. It is
    // applied OUTSIDE the category cache, so narrowing the search never bakes a
    // filtered list into the tab it came from. A trait has a name, a nature and
    // a price in points; it has no weight and no level, so the strip is never
    // asked to offer those here.
    filterTraits(rows) {
      if (!this._traitBar) return rows;
      return this._traitBar.apply(rows, (trait) => ({
        name: getTraitText(trait, "name"),
        subtitle: getTraitText(trait, "description"),
        category: trait.nature || "",
        price: trait.diseaseId ? 0 : traitCost(trait)
      }));
    }

    currentTrait() {
      return this.currentTraits()[this._cursor] || null;
    }

    onTabClick(category) {
      if (this._currentCategory === category) return;
      SoundManager.playCursor();
      this._currentCategory = category;
      this._cursor = 0;
      this.syncOverlay(false);
    }

    cycleCategory(step) {
      const at = TRAIT_CATEGORIES.indexOf(this._currentCategory);
      const next = TRAIT_CATEGORIES[(at + step + TRAIT_CATEGORIES.length) % TRAIT_CATEGORIES.length];
      this.onTabClick(next);
    }

    // A trait can be bound unless it is already bound, the purse cannot pay
    // for it, or it clashes with something already bound.
    traitState(trait) {
      // An illness never competes for trait points, so it is never blocked and
      // never shows up in the tally.
      if (trait && trait.diseaseId) {
        return { selected: this._selectedDiseases.includes(trait), incompatible: false, unaffordable: false, blocked: false };
      }
      const selected = this._selectedTraits.includes(trait);
      const incompatible = !selected && this._selectedTraits.some(
        (bound) =>
          (trait.incompatible || []).includes(bound.id) ||
          (bound.incompatible || []).includes(trait.id)
      );
      const unaffordable = !selected && !incompatible && !traitFits(trait, this._selectedTraits);
      const blocked = !selected && (incompatible || unaffordable);
      return { selected, incompatible, unaffordable, blocked };
    }

    // The purse as the right page prints it.
    tally() {
      return traitTally(this._selectedTraits);
    }

    calculateTotalBonuses() {
      const totals = { hp: 0, mp: 0, atk: 0, def: 0, mat: 0, mdf: 0, agi: 0, luk: 0 };
      this._selectedTraits.forEach((trait) => {
        Object.keys(trait.positive || {}).forEach((k) => { if (totals[k] !== undefined) totals[k] += trait.positive[k]; });
        Object.keys(trait.negative || {}).forEach((k) => { if (totals[k] !== undefined) totals[k] += trait.negative[k]; });
      });
      return totals;
    }

    // --- Overlay rendering -------------------------------------------------
    // The markup is built exactly once; every later change patches only the
    // panel that actually changed (state classes on the cards, the detail
    // card, the purse, the bound traits). Nothing rebuilds on cursor movement,
    // so the overlay never flickers.

    // The page is two columns with one job each.
    //
    // LEFT is the shop: the purse strip the player is spending out of, the
    // category tabs, the search strip and then nothing but trait cards, all the
    // way down. The old layout also wedged a fixed 26%-tall details box under
    // the grid, which left the cards a narrow band in the middle of the page and
    // put the description of the highlighted trait in a box too short to hold
    // it; the details have moved to the right page, where there is room.
    //
    // RIGHT is the sheet being written: the open trait in full at the top, the
    // bound traits under it, one summary card for everything they add up to, and
    // the Back / Random / Continue bar. Five separately-scrolling dossier cards
    // used to compete for that page and none of them ever had enough height.
    buildOverlayDOM() {
      const tabsHtml = TRAIT_CATEGORIES.map((category) =>
        `<div class="ts-tab" data-category="${category}">${t(TRAIT_CATEGORY_LABELS[category])}</div>`
      ).join("");

      this._dndContainer.innerHTML = `
        <div class="cc-pockets-spread">
          <div class="cc-page cc-page-left ts-page">
            <h2 class="cc-header-gothic">${t('titleTraits')}</h2>

            <!-- The purse, at the top of the page it is spent on. -->
            <div class="ts-purse" id="ts-points"></div>

            <div class="ts-tab-row" id="ts-tabs">${tabsHtml}</div>
            <div class="ts-search-slot" id="ts-search-slot"></div>
            <div class="cc-select-grid cc-trait-grid" id="ts-grid"></div>
          </div>

          <div class="cc-page cc-page-right ts-page">
            <!-- The page is headed by whatever the cursor is on, so the name is
                 not repeated inside the card below it. -->
            <h2 class="cc-header-gothic" id="ts-info-title">${t("titleTraits")}</h2>

            <!-- The trait under the cursor, written out in full. -->
            <div class="ts-detail" id="ts-info"></div>

            <h3 class="cc-subheader ts-section-head">
              <span>${t("selectedTraitsLabel")}</span>
              <span class="ts-count" id="ts-picked-count"></span>
            </h3>
            <div class="ts-picked-list" id="ts-picked"></div>

            <div class="cc-dossier-card ts-summary" id="ts-diseases-card">
              <h3 class="cc-subheader">${t("selectedDiseasesLabel")}</h3>
              <div class="ts-badge-row" id="ts-diseases"></div>
            </div>

            <!-- What the build adds up to. Bonuses and granted skills were two
                 cards fighting for the same few centimetres; they are one. -->
            <div class="cc-dossier-card ts-summary">
              <div class="ts-summary-row">
                <span class="cc-dossier-label">${t("totalBonuses")}</span>
                <div class="ts-badge-row" id="ts-bonuses"></div>
              </div>
              <div class="ts-summary-row">
                <span class="cc-dossier-label">${t("finalSkills")}</span>
                <div class="ts-badge-row" id="ts-skills"></div>
              </div>
            </div>

            <div class="cc-button-panel" id="ts-buttons"></div>
          </div>

          <!-- The runtime does not honour the "inset" shorthand: it silently
               collapses the overlay onto the top-left corner of the spread, so
               the four longhands (plus a size) are spelled out here. -->
          <div id="ts-prompt"></div>
        </div>
      `;

      const q = (selector) => this._dndContainer.querySelector(selector);
      this._el = {
        tabs: q("#ts-tabs"),
        diseases: q("#ts-diseases"),
        diseasesCard: q("#ts-diseases-card"),
        grid: q("#ts-grid"),
        info: q("#ts-info"),
        infoTitle: q("#ts-info-title"),
        points: q("#ts-points"),
        picked: q("#ts-picked"),
        pickedCount: q("#ts-picked-count"),
        bonuses: q("#ts-bonuses"),
        skills: q("#ts-skills"),
        prompt: q("#ts-prompt"),
      };

      this._el.tabs.querySelectorAll(".ts-tab").forEach((el) => {
        el.addEventListener("click", () => this.onTabClick(el.dataset.category));
      });

      this.buildButtons(q("#ts-buttons"));
      this.syncOverlay(true);
    }

    // Back / Random / Continue, in the shared three-slot bar every creation
    // screen ends with, so the two controls the player navigates with sit where
    // they sat on the step before this one.
    buildButtons(panelEl) {
      const CCB = window.CCButtons;
      const slots = CCB.slots(panelEl);

      const back = document.createElement("button");
      back.className = "cc-btn-treaty";
      back.textContent = CCB.backLabel();
      back.addEventListener("click", () => this.onTraitsBack());
      slots.back.appendChild(back);

      const reset = document.createElement("button");
      reset.className = "cc-btn-treaty";
      reset.textContent = t("resetTraits");
      reset.addEventListener("click", () => this.onTraitsReset());
      slots.mid.appendChild(reset);

      const random = document.createElement("button");
      random.className = "cc-btn-treaty";
      random.textContent = CCB.randomLabel();
      random.addEventListener("click", () => this.onTraitsRandom());
      slots.mid.appendChild(random);

      this._confirmEl = document.createElement("button");
      this._confirmEl.className = "cc-btn-treaty confirm";
      this._confirmEl.textContent = CCB.continueLabel();
      this._confirmEl.addEventListener("click", () => this.openPrompt());
      slots.next.appendChild(this._confirmEl);
    }

    // One card. Illnesses are browsed in the same grid but are not bought with
    // points, so only a real trait carries a price on its card.
    traitCardHTML(trait, idx) {
      if (!trait) return "";
      const state = this.traitState(trait);
      const classes = ["cc-card-option"];
      if (state.selected) classes.push("selected");
      if (state.blocked) classes.push("disabled");
      if (idx === this._cursor) classes.push("highlighted");
      return `
        <div class="${classes.join(" ")}" data-idx="${idx}">
          <span class="cc-rpg-icon" style="${this.getIconStyle(trait.icon, 22)}"></span>
          <div class="cc-option-title">${getTraitText(trait, "name")}</div>
          ${trait.diseaseId ? "" : costBadgeHTML(traitCost(trait))}
        </div>`;
    }

    // Draws (or redraws) the window onto the card grid. Only called when the
    // list contents actually change (category switch, filter change, or a trait
    // being toggled). Cursor and hover changes use patchCardClasses instead so
    // the DOM nodes are never destroyed mid-hover or mid-click.
    mountGrid() {
      const traits = this.currentTraits();
      this._gridCount = traits.length;
      window.MenuVirtualList.render(this._el.grid, {
        key: `${this._currentCategory}|${this._traitBar ? this._traitBar.query : ""}`,
        count: traits.length,
        renderItem: (idx) => this.traitCardHTML(traits[idx], idx),
        onWindow: (win) => {
          win.querySelectorAll(".cc-card-option").forEach((el) => {
            const idx = parseInt(el.dataset.idx, 10);
            el.addEventListener("click", () => this.onTraitCardClick(idx));
            el.addEventListener("mouseenter", () => this.onTraitCardHover(idx));
          });
        }
      });
    }

    // Rebuilds the card grid. Only ever called on a category switch or filter change.
    renderGrid() {
      this.mountGrid();
      this._el.grid.scrollTop = 0;

      this._el.tabs.querySelectorAll(".ts-tab").forEach((el) => {
        el.classList.toggle("active", el.dataset.category === this._currentCategory);
      });

      // The strip is redrawn with the grid (the natures on offer change with
      // the tab), then handed its caret back.
      const searchSlot = this._dndContainer.querySelector("#ts-search-slot");
      if (searchSlot && this._traitBar) {
        searchSlot.innerHTML = this._traitBar.html();
        this._traitBar.restoreFocus();
      }

      this._sig.category = this._currentCategory;
      this._sig.cursor = -1;
    }

    // Patches CSS classes on the already-rendered card nodes for cursor and
    // selection state changes. Unlike mountGrid, this never touches innerHTML or
    // removes/re-adds event listeners, so hover and click events are never lost.
    patchCardClasses() {
      const traits = this.currentTraits();
      const win = this._el.grid && this._el.grid.querySelector(".mvl-window");
      if (!win) return;
      win.querySelectorAll(".cc-card-option").forEach((el) => {
        const idx = parseInt(el.dataset.idx, 10);
        if (isNaN(idx)) return;
        const trait = traits[idx];
        if (!trait) return;
        const state = this.traitState(trait);
        el.classList.toggle("selected", state.selected);
        el.classList.toggle("disabled", state.blocked);
        el.classList.toggle("highlighted", idx === this._cursor);
      });
    }

    // Keeps card visual state in sync. For cursor-only moves, patches classes
    // on existing nodes (no innerHTML wipe). For selection changes (a trait was
    // picked or dropped), does a full mountGrid so the cost badges and states
    // are accurate, then scrolls to the cursor if needed.
    syncCards(scrollToCursor, selectionChanged) {
      if (selectionChanged) {
        // Selection changed: re-render so cost badges and blocked states update.
        this.mountGrid();
      } else {
        // Cursor moved: patch classes only - no DOM rebuild, no listener loss.
        this.patchCardClasses();
      }
      if (scrollToCursor && this._keyboardCursor) {
        window.MenuVirtualList.scrollToIndex(this._el.grid, this._cursor);
      }
    }

    // Detail card for the trait under the cursor. It heads the right page, so
    // the page's own title is the trait's name.
    renderInfo(trait) {
      if (!trait) {
        this._el.info.innerHTML = "";
        if (this._el.infoTitle) this._el.infoTitle.textContent = t("titleTraits");
        return;
      }
      if (this._el.infoTitle) {
        this._el.infoTitle.textContent = trait.diseaseId ? trait.name : getTraitText(trait, "name");
      }
      if (trait.diseaseId) return this.renderDiseaseInfo(trait);

      const statBadges = (stats, color) => Object.keys(stats || {}).map((key) => {
        const value = window.TraitParams ? window.TraitParams.scale(key, stats[key]) : stats[key];
        const sign = value > 0 ? "+" : "";
        return `<span class="cc-element-badge" class="cc-inked" style="--cc-ink:${color}">${getParamDisplayName(key)} ${sign}${value}</span>`;
      }).join("");

      const iconBadge = (iconIndex, label, suffix) =>
        `<span class="cc-element-badge"><span class="cc-rpg-icon cc-rpg-icon-gap" style="${this.getIconStyle(iconIndex, 16)}"></span>${label}${suffix ? ` ${suffix}` : ""}</span>`;

      // trait.items is a flat array with one entry per copy, so tally by id.
      const itemCounts = {};
      (trait.items || []).forEach((id) => { itemCounts[id] = (itemCounts[id] || 0) + 1; });
      const itemBadges = Object.keys(itemCounts).map((id) => {
        const item = $dataItems[id];
        return item ? iconBadge(item.iconIndex, dbName(item), itemCounts[id] > 1 ? `x${itemCounts[id]}` : "") : "";
      }).join("");

      const skillBadges = (trait.skills || []).map((id) => {
        const skill = $dataSkills[id];
        return skill ? iconBadge(skill.iconIndex, dbName(skill), "") : "";
      }).join("");

      const specBadges = getTraitGrantedSpecializations(trait)
        .map((row) => `<span class="cc-element-badge">${row.name} (${row.levelName})</span>`)
        .join("");

      const row = (label, content) => content ? `
        <div class="ts-detail-row">
          <span class="cc-dossier-label">${label}</span>
          <div class="ts-badge-row">${content}</div>
        </div>
      ` : "";

      // Why a card cannot be taken, said in words on the page that describes it,
      // rather than left to the dimmed card in the grid.
      const state = this.traitState(trait);
      const blockedNote = state.incompatible
        ? `<div class="ts-detail-note">${t("incompatibleNote")}</div>`
        : state.unaffordable
          ? `<div class="ts-detail-note">${t("unaffordableNote")}</div>`
          : "";

      this._el.info.innerHTML = `
        <div class="cc-dossier-card ts-detail-card">
          <div class="ts-detail-head">
            <span class="cc-rpg-icon" style="${this.getIconStyle(trait.icon, 30)}"></span>
            <span class="ts-detail-label">${t("costLabel")}</span>
            ${costBadgeHTML(traitCost(trait))}
          </div>
          <p class="ts-detail-desc">${getTraitText(trait, "description")}</p>
          ${blockedNote}
          ${row(t("benefits"), statBadges(trait.positive, "var(--text-forest-green)"))}
          ${row(t("drawbacks"), statBadges(trait.negative, "var(--accent-red-3)"))}
          ${row(t("grantsSkills"), skillBadges)}
          ${row(t("startingItems"), itemBadges)}
          ${row(`${_si18n("Specializations")}:`, specBadges)}
        </div>
      `;
    }

    // The purse, at the head of the page it is spent on: what has been spent out
    // of what is available, how much of the refund cap the drawbacks have
    // already claimed, and how many of the picks are gone. Three plain figures
    // side by side rather than three label/value rows down a card , the player
    // reads this constantly and it must not cost the grid any height.
    renderPoints() {
      const tally = this.tally();
      const overspent = tally.remaining < 0;
      const cell = (label, value, cls) => `
        <div class="ts-purse-cell${cls ? ` ${cls}` : ""}">
          <span class="ts-purse-value">${value}</span>
          <span class="ts-purse-label">${label}</span>
        </div>
      `;
      this._el.points.innerHTML =
        cell(t("pointsLabel"), `${tally.spent} / ${tally.available}`, overspent ? "over" : "spend") +
        cell(t("refundLabel"), `${tally.credit} / ${TRAIT_REFUND_CAP}`, "refund") +
        cell(t("picksLabel"), `${tally.count} / ${TRAIT_MAX_PICKS}`);
    }

    // Every bound trait written out where it is bound: icon, name, price and
    // what it actually says, however many there are. Clicking one releases it;
    // nothing here reacts to the pointer merely passing over it.
    renderPicked() {
      const picked = this._selectedTraits;
      if (this._el.pickedCount) {
        this._el.pickedCount.textContent = `${picked.length} / ${TRAIT_MAX_PICKS}`;
      }
      if (!picked.length) {
        this._el.picked.innerHTML = `<div class="ts-picked-empty">${t("emptySlot")}</div>`;
        return;
      }
      // One row a trait: icon, name, what it cost and the way to drop it. The
      // description is not repeated here , the same trait's card on the left is
      // one keypress away and prints it in full above.
      this._el.picked.innerHTML = picked.map((trait, index) => `
        <div class="cc-trait-picked" data-nav data-picked="${index}">
          <span class="cc-rpg-icon" style="${this.getIconStyle(trait.icon, 20)}"></span>
          <span class="cc-trait-picked-name">${getTraitText(trait, "name")}</span>
          ${costBadgeHTML(traitCost(trait))}
          <span class="cc-slot-remove">✕</span>
        </div>
      `).join("");
      this._el.picked.querySelectorAll("[data-picked]").forEach((node) => {
        const at = parseInt(node.dataset.picked, 10);
        node.addEventListener("click", () => this.onPickedClick(at));
      });
    }

    // The illnesses chosen on the diseases tab, listed on the right page under
    // the bound traits. The card hides itself while none are picked, so a
    // party built without one never sees it.
    renderDiseases() {
      if (!this._el.diseases) return;
      const cards = this._selectedDiseases;
      this._el.diseasesCard.classList.toggle("ui-closed", !cards.length);
      this._el.diseases.innerHTML = cards.map((card, idx) => `
        <span class="cc-element-badge cc-element-badge--clickable focusable" data-nav data-disease-slot="${idx}">
          <span class="cc-rpg-icon cc-rpg-icon-gap" style="${this.getIconStyle(card.icon, 16)}"></span>${card.name} ✕
        </span>
      `).join("");
      this._el.diseases.querySelectorAll("[data-disease-slot]").forEach((node) => {
        const at = parseInt(node.dataset.diseaseSlot, 10);
        node.addEventListener("click", () => this.releaseTrait(this._selectedDiseases[at]));
      });
    }

    // The open card for an illness is the disease system's own dossier, so it
    // reads exactly as it will on the character sheet afterwards.
    renderDiseaseInfo(card) {
      const api = window.DiseaseSystem;
      this._el.info.innerHTML = `
        <div class="cc-dossier-card ts-detail-card">
          <div class="ts-detail-head">
            <span class="cc-rpg-icon" style="${this.getIconStyle(card.icon, 30)}"></span>
            <span class="ts-detail-label">${card.name}</span>
          </div>
          ${api && api.diseaseDossierHTML ? api.diseaseDossierHTML(card.diseaseId) : `<p class="ts-detail-desc">${card.description}</p>`}
        </div>
      `;
    }

    renderBonuses() {
      const totals = this.calculateTotalBonuses();
      const badges = Object.keys(totals).filter((key) => totals[key] !== 0).map((key) => {
        const value = window.TraitParams ? window.TraitParams.scale(key, totals[key]) : totals[key];
        const color = value > 0 ? "var(--text-forest-green)" : "var(--accent-red-3)";
        return `<span class="cc-element-badge" class="cc-inked" style="--cc-ink:${color}">${getParamDisplayName(key)} ${value > 0 ? "+" : ""}${value}</span>`;
      }).join("");
      this._el.bonuses.innerHTML = badges ||
        `<span class="ts-summary-empty">${t('noBonusesYet')}</span>`;
    }

    renderSkills() {
      const ids = [];
      this._selectedTraits.forEach((trait) => {
        (trait.skills || []).forEach((id) => {
          if ($dataSkills[id] && !ids.includes(id)) ids.push(id);
        });
      });
      this._el.skills.innerHTML = ids.length ? ids.map((id) => {
        const skill = $dataSkills[id];
        return `<span class="cc-element-badge"><span class="cc-rpg-icon cc-rpg-icon-gap" style="${this.getIconStyle(skill.iconIndex, 16)}"></span>${dbName(skill)}</span>`;
      }).join("") : `<span class="ts-summary-empty">${t("noSkills")}</span>`;
    }

    // "Confirm these traits?" - yes or no, nothing else.
    renderPrompt() {
      const layer = this._el.prompt;
      if (this._confirmYes === null) {
        window.CCPanel.hide(layer);
        layer.innerHTML = "";
        this._promptBtns = null;
        return;
      }
      if (!this._promptBtns) {
        layer.innerHTML = `
          <div class="ts-prompt-box">
            <h2 class="cc-header-gothic ts-prompt-title">${t('confirmTraits')}</h2>
            <!-- Same three-slot bar as the page behind it, so the answer that
                 goes back is on the left and the one that goes on is on the
                 right, exactly where Back and Continue are. -->
            ${window.CCButtons.panel({
              // The prompt owns the keyboard while it is up: left and right
              // swap the answer, Confirm takes it, Cancel says no. See
              // updateInput, which is named here so the reachability suite can
              // see who walks these two.
              back: window.CCButtons.button(t('no'), { attrs: 'data-yes="0" data-nav-owner="updateInput"' }),
              next: window.CCButtons.button(t('yes'), { confirm: true, attrs: 'data-yes="1" data-nav-owner="updateInput"' }),
              cls: "cc-nav--bare",
            })}
          </div>
        `;
        this._promptBtns = Array.from(layer.querySelectorAll("[data-yes]"));
        this._promptBtns.forEach((btn) => {
          btn.addEventListener("click", () => this.answerPrompt(btn.dataset.yes === "1"));
        });
      }
      window.CCPanel.show(layer);
      this._promptBtns.forEach((btn) => {
        btn.classList.toggle("highlighted", (btn.dataset.yes === "1") === this._confirmYes);
      });
    }

    // Single entry point: compares cheap signatures and patches only what
    // actually changed. Safe to call every frame.
    syncOverlay(force) {
      if (!this._el) return;
      const sig = this._sig;

      // The grid also rebuilds when window.Health lands after the first render
      // (the category was empty at build time).
      const starved = this._gridCount === 0 && this.currentTraits().length > 0;
      if (force || starved || sig.category !== this._currentCategory) this.renderGrid();

      const selectionSig = this._selectedTraits.map((trait) => trait.id).join(",") +
        "|" + this._selectedDiseases.map((card) => card.id).join(","); // i18n-ignore: signature
      const selectionChanged = force || sig.selection !== selectionSig;
      if (selectionChanged) {
        sig.selection = selectionSig;
        this.renderPoints();
        this.renderPicked();
        this.renderDiseases();
        this.renderBonuses();
        this.renderSkills();
        // Continue only reads as available when openPrompt would actually open:
        // at least one trait bound, and the purse not overspent.
        if (this._confirmEl) {
          const tally = this.tally();
          this._confirmEl.classList.toggle("disabled", tally.count < 1 || tally.remaining < 0);
        }
      }

      const cursorChanged = sig.cursor !== this._cursor;
      if (cursorChanged || selectionChanged) {
        sig.cursor = this._cursor;
        this.syncCards(cursorChanged, selectionChanged);
      }

      // window.Specializations loads asynchronously; fold its readiness into
      // the signature so the open card picks the rows up when it lands.
      const specsReady = !!(window.Specializations && window.Specializations.ready);
      const hovered = this.currentTrait();
      const hoverId = hovered ? hovered.id : -1;
      if (sig.hover !== hoverId || sig.specsReady !== specsReady) {
        sig.hover = hoverId;
        sig.specsReady = specsReady;
        this.renderInfo(hovered);
      }

      if (sig.confirm !== this._confirmYes) {
        sig.confirm = this._confirmYes;
        this.renderPrompt();
      }
    }

    // --- Interaction -------------------------------------------------------

    onTraitCardClick(index) {
      this._cursor = index;
      this.toggleTrait(this.currentTrait());
    }

    onTraitCardHover(index) {
      if (this._cursor !== index) {
        this._keyboardCursor = false;
        this._cursor = index;
      }
    }

    onPickedClick(index) {
      const trait = this._selectedTraits[index];
      if (trait) this.releaseTrait(trait);
    }

    // Binds a free trait, releases a bound one, buzzes on anything blocked.
    toggleTrait(trait) {
      if (!trait) return;
      if (trait.diseaseId) {
        const at = this._selectedDiseases.indexOf(trait);
        if (at >= 0) { SoundManager.playCancel(); this._selectedDiseases.splice(at, 1); }
        else { this._selectedDiseases.push(trait); }
        this.syncOverlay(false);
        return;
      }
      const state = this.traitState(trait);
      if (state.selected) {
        this.releaseTrait(trait);
      } else if (state.blocked) {
        SoundManager.playBuzzer();
      } else {
        this._selectedTraits.push(trait);
        this.syncOverlay(false);
      }
    }

    releaseTrait(trait) {
      if (trait && trait.diseaseId) {
        const idx = this._selectedDiseases.indexOf(trait);
        if (idx < 0) return;
        SoundManager.playCancel();
        this._selectedDiseases.splice(idx, 1);
        this.syncOverlay(false);
        return;
      }
      const at = this._selectedTraits.indexOf(trait);
      if (at < 0) return;
      SoundManager.playCancel();
      this._selectedTraits.splice(at, 1);
      this.syncOverlay(false);
    }

    releaseLast() {
      if (this._selectedTraits.length > 0) {
        this.releaseTrait(this._selectedTraits[this._selectedTraits.length - 1]);
      } else {
        SoundManager.playBuzzer();
      }
    }

    // Leave without a build. Character creation normally resumes one step AFTER
    // the one that opened this screen, so backing out asks it to resume ON that
    // step instead: Back means "let me choose again", not "go on without
    // traits". (This used to decrement _interruptedStep by hand, which quietly
    // did nothing when the trait step was the flow's very first one.)
    onTraitsBack() {
      SoundManager.playCancel();
      const SC = window.Scene_CharacterCreation;
      if (Scene_TraitSelector._returnToCharacterCreation && SC && SC.cancelSubScreens) {
        SC.cancelSubScreens();
      }
      Scene_TraitSelector._returnToCharacterCreation = false;
      Scene_TraitSelector._targetActorId = null;
      this.popScene();
    }

    // Roll a build the purse can pay for and drop it straight into the picks, so
    // the player can see what they were given and edit it, rather than being
    // handed a finished sheet. Illnesses are left alone: they are chosen, never
    // rolled. Genetic traits stay out of the roll for the same reason the
    // plugin-command randomizer skips them , that category is decided by the
    // biology chosen earlier in creation.
    onTraitsRandom() {
      this._selectedTraits = pickRandomTraits({
        pool: getTraits().filter((trait) => (trait.category || "mental") !== "genetic"),
      });
      this._cursor = 0;
      this.syncOverlay(false);
    }

    // Put the whole build down: every trait and every illness on the sheet goes
    // back and the purse reads full again. Nothing has been handed to the
    // member yet at this point, so this only ever clears the page.
    onTraitsReset() {
      if (this._selectedTraits.length === 0 && this._selectedDiseases.length === 0) {
        SoundManager.playBuzzer();
        return;
      }
      SoundManager.playCancel();
      this._selectedTraits = [];
      this._selectedDiseases = [];
      this._cursor = 0;
      this.syncOverlay(false);
    }

    // A build is sealable once it carries at least one trait and has not
    // overspent. Leaving points on the table is the player's business.
    openPrompt() {
      const tally = this.tally();
      if (tally.count < 1 || tally.remaining < 0) {
        SoundManager.playBuzzer();
        return;
      }
      this._confirmYes = true;
      this.syncOverlay(false);
    }

    answerPrompt(yes) {
      if (!yes) {
        SoundManager.playCancel();
        this._confirmYes = null;
        this.syncOverlay(false);
        return;
      }
      this._confirmYes = null;
      this.applyTraits();
      Scene_TraitSelector._returnToCharacterCreation = false;
      Scene_TraitSelector._targetActorId = null;
      this.popScene();
    }

    // The ring hands the board back when it walks off its own top or left edge.
    onNavLeave() {
      this._sig = { category: null, selection: null, cursor: -1, hover: -1, specsReady: null, confirm: null };
      this.syncOverlay(true);
    }

    // Step off the board and onto the page's own controls.
    _ccEnterNav(dir) {
      return !!window.CCNav && window.CCNav.tryEnterFromBoard(dir);
    }

    updateInput() {
      // The ring owns the buttons and the picked chips whenever it is up, and
      // is read first so one press never moves two cursors.
      if (window.CCNav && window.CCNav.update()) return;
      if (this._confirmYes !== null) {
        if (Input.isTriggered("left") || Input.isTriggered("right")) {
          SoundManager.playCursor();
          this._confirmYes = !this._confirmYes;
        } else if (Input.isTriggered("ok")) {
          this.answerPrompt(this._confirmYes);
        } else if (Input.isTriggered("cancel")) {
          this.answerPrompt(false);
        }
        return;
      }

      // L1 / R1 on a pad, Q / PageUp-PageDown or Tab / Shift+Tab on the
      // keyboard, cycle the tabs. See CCNav.railDir().
      const railDir = window.CCNav ? window.CCNav.railDir() : 0;
      if (railDir) { this.cycleCategory(railDir); return; }

      const maxItems = this.currentTraits().length;
      if (maxItems <= 0) return;

      const cols = TRAIT_GRID_COLS;
      let index = Math.min(this._cursor, maxItems - 1);
      let moved = false;

      if (Input.isRepeated("down")) {
        index = (index + cols < maxItems) ? index + cols : index % cols;
        moved = true;
      } else if (Input.isRepeated("up")) {
        if (index - cols >= 0) {
          index -= cols;
        } else {
          let target = Math.floor((maxItems - 1) / cols) * cols + (index % cols);
          if (target >= maxItems) target -= cols;
          index = target >= 0 ? target : 0;
        }
        moved = true;
      } else if (Input.isRepeated("right") && index % cols < cols - 1 && index + 1 < maxItems) {
        index++; moved = true;
      } else if (Input.isRepeated("right") && this._ccEnterNav("right")) {
        // The right edge of the board is the doorway onto the picked chips
        // and the buttons under them.
        return;
      } else if (Input.isRepeated("left") && index % cols > 0) {
        index--; moved = true;
      } else if (Input.isTriggered("ok")) {
        // Once the purse can no longer pay for what the cursor is on, the only
        // thing left to do is seal the build, so OK raises the prompt instead
        // of buzzing. A card blocked by a clash still buzzes (another trait can
        // be afforded, just not that one), and OK on a bound card releases it.
        const trait = this.currentTrait();
        const state = trait ? this.traitState(trait) : null;
        if (state && state.unaffordable) {
          this.openPrompt();
        } else {
          this.toggleTrait(trait);
        }
      } else if (Input.isTriggered("cancel")) {
        this.releaseLast();
      }

      if (moved) {
        SoundManager.playCursor();
        this._keyboardCursor = true;
        this._cursor = index;
      }
    }

    update() {
      super.update();

      if (this._dndContainer && this._dndContainer.style.display !== "none") {
        // A focused search field owns the keyboard: the cursor must not walk
        // the grid under the caret (UI/MenuSearchBar.js).
        if (!(window.MenuSearchBar && window.MenuSearchBar.isTyping())) this.updateInput();
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);
        // syncOverlay is signature-driven: it touches the DOM only when
        // something really changed, so polling it every frame is free.
        this.syncOverlay(false);
        // The page rebuilds its markup underneath the ring, so the ring is
        // stamped back on afterwards rather than before.
        if (window.CCNav) window.CCNav.paint();
      }
    }

    // --- Applying the picked traits ---------------------------------------

    applyTraits() {
      const targetId = Scene_TraitSelector._targetActorId || actorId;
      const actor = $gameActors.actor(targetId);

      if (!actor) {
        console.error(`Actor with ID ${targetId} not found!`);
        return;
      }

      // Revert any previously applied trait grants first so re-entering this
      // step (via Back) does not stack param bonuses or re-grant skills/items.
      revertTraitGrants(actor, actor._selectedTraits);
      actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];

      // Store selected traits on the actor
      actor._selectedTraits = this._selectedTraits.slice(); // Copy array

      this._selectedTraits.forEach((trait) => {
        Object.keys(trait.positive).forEach((param) => {
          this.addParam(actor, param, trait.positive[param]);
        });
        Object.keys(trait.negative).forEach((param) => {
          this.addParam(actor, param, trait.negative[param]);
        });

        trait.skills.forEach((skillId) => {
          if ($dataSkills[skillId]) {
            actor.learnSkill(skillId);
          }
        });

        trait.items.forEach((itemId) => {
          if ($dataItems[itemId]) {
            $gameParty.gainItem($dataItems[itemId], 1);
          }
        });

        trait.equipment.forEach((itemId) => {
          if ($dataWeapons[itemId]) {
            $gameParty.gainItem($dataWeapons[itemId], 1);
          } else if ($dataArmors[itemId]) {
            $gameParty.gainItem($dataArmors[itemId], 1);
          }
        });

        trait.switches.forEach((switchId) => {
          $gameSwitches.setValue(switchId, true);
        });
      });

      // Whatever was picked on the diseases tab is handed straight to
      // Health_DiseaseSystem: it is an illness, not a stat block, and it
      // arrives already running so its window period and its course start the
      // moment the character does. Re-entering this step replaces the list
      // rather than stacking it.
      this.applySelectedDiseases(actor);

      actor.refresh();
    }

    applySelectedDiseases(actor) {
      const api = window.DiseaseSystem;
      if (!api || !api.infectActor) return;
      // Everything that is caught, runs a course and answers to a treatment
      // now lives in the illness library and is picked here - Possession and
      // Lycanthropy among them, which spent a while masquerading as traits.
      // Whatever a disease grants (skills, param deltas) comes from the library
      // too, so nothing on this path is folded into paramPlus.
      const wanted = this._selectedDiseases.map((card) => card.diseaseId);
      for (const entry of [...(actor._diseases || [])]) {
        if ((actor._ccDiseases || []).includes(entry.id) && !wanted.includes(entry.id)) {
          api.cureActor(actor, entry.id);
        }
      }
      for (const id of wanted) api.infectActor(actor, id, null, null, { silent: true, diagnosed: true });
      actor._ccDiseases = wanted.slice();
    }

    // New method to apply traits by ID array (for use by other plugins like ClassSelector)
    applyTraitsByIds(traitIds, targetActorId = null) {
      const targetId = targetActorId || actorId;
      const actor = $gameActors.actor(targetId);

      if (!actor) {
        console.error(`Actor with ID ${targetId} not found!`);
        return;
      }

      // Get the Traits array from ProstheticsData
      const TraitsArray = window.Health && window.Health.Traits;
      if (!TraitsArray) {
        console.error('Traits array not found. Is DB.js loaded?');
        return;
      }

      // An empty list is a build with nothing in it, not a call to ignore:
      // bailing here left the grants of the trait just dropped on the actor,
      // which is how the last trait of a build became impossible to remove.
      if (!traitIds || traitIds.length === 0) {
        revertTraitGrants(actor, actor._selectedTraits);
        actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
        actor._selectedTraits = [];
        actor.refresh();
        return;
      }

      // Revert any previously applied trait grants first so re-applying (via
      // preset/programmatic path) does not stack param bonuses or re-grant
      // skills/items/equipment (mirrors applyTraits).
      revertTraitGrants(actor, actor._selectedTraits);
      actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];

      // Store selected traits on the actor
      if (!actor._selectedTraits) {
        actor._selectedTraits = [];
      }

      const selectedTraits = [];

      // Collect trait objects by ID. What comes in is an id, but every screen
      // that has already applied a build hands the whole trait object back, so
      // both shapes resolve here rather than being dropped as unknown ids.
      traitIds.forEach((entry) => {
        const traitId = (entry && typeof entry === "object") ? entry.id : entry;
        const trait = TraitsArray.find((t) => String(t.id) === String(traitId));
        if (trait) {
          if (!selectedTraits.includes(trait)) selectedTraits.push(trait);
        } else {
          console.warn(`Trait with ID ${traitId} not found in TraitSelector data`);
        }
      });

      // Apply each selected trait
      selectedTraits.forEach((trait) => {
        // Apply positive bonuses
        Object.keys(trait.positive || {}).forEach((param) => {
          this.addParam(actor, param, trait.positive[param]);
        });

        // Apply negative bonuses
        Object.keys(trait.negative || {}).forEach((param) => {
          this.addParam(actor, param, trait.negative[param]);
        });

        // Learn skills
        (trait.skills || []).forEach((skillId) => {
          if ($dataSkills[skillId]) {
            actor.learnSkill(skillId);
          }
        });

        // Add items
        (trait.items || []).forEach((itemId) => {
          if ($dataItems[itemId]) {
            $gameParty.gainItem($dataItems[itemId], 1);
          }
        });

        // Add equipment
        (trait.equipment || []).forEach((itemId) => {
          if ($dataWeapons[itemId]) {
            $gameParty.gainItem($dataWeapons[itemId], 1);
          } else if ($dataArmors[itemId]) {
            $gameParty.gainItem($dataArmors[itemId], 1);
          }
        });

        // Set switches
        (trait.switches || []).forEach((switchId) => {
          $gameSwitches.setValue(switchId, true);
        });
      });

      // Store selected traits and refresh
      actor._selectedTraits = selectedTraits;
      actor.refresh();

      console.log(
        `Applied ${selectedTraits.length} trait(s) to actor ${targetId}: ${selectedTraits
          .map((t) => getTraitText(t, 'name'))
          .join(', ')}`
      );
    }

    addParam(actor, paramName, value) {
      const paramId = window.TraitParams.paramId(paramName);
      if (typeof paramId === "number") {
        if (!actor._paramPlus) {
          actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
        }
        actor._paramPlus[paramId] =
          (actor._paramPlus[paramId] || 0) + window.TraitParams.scale(paramName, value);
      }
    }

    resetActorTraits() {
      const targetId = Scene_TraitSelector._targetActorId || actorId;
      const actor = $gameActors.actor(targetId);

      if (!actor) {
        console.error(`Actor with ID ${targetId} not found!`);
        return;
      }

      // The parameter bonuses are NOT wiped on the way in any more. Applying a
      // build zeroes and rebuilds them anyway, so wiping them here only ever
      // hurt the player who opened this screen and backed out again: they left
      // with the traits they came in with and none of the numbers.
      actor.refresh();
    }

    // The build the member already carries, so reopening this screen resumes
    // it instead of opening on an empty sheet that silently replaced the whole
    // thing on the way out. Either shape is read: the picked list is kept as
    // whole traits here and as bare ids by the creation board.
    loadActorTraits() {
      const targetId = Scene_TraitSelector._targetActorId || actorId;
      const actor = $gameActors.actor(targetId);
      if (!actor) return;

      const bank = getTraits();
      this._selectedTraits = ((actor._selectedTraits) || [])
        .map((entry) => {
          const id = (entry && typeof entry === "object") ? entry.id : entry;
          return bank.find((trait) => String(trait.id) === String(id));
        })
        .filter(Boolean);

      const cards = getDiseaseCards();
      this._selectedDiseases = ((actor._ccDiseases) || [])
        .map((id) => cards.find((card) => card.diseaseId === id))
        .filter(Boolean);
      if (this._selectedDiseases.length) this._diseaseCards = cards;
    }

    resetSwitches() {
      switchIds.forEach((id) => {
        $gameSwitches.setValue(id, false);
      });
    }
  }

  // Reverse a previously applied set of trait grants so re-applying does not
  // stack. Forgets trait skills and removes granted items/equipment. Param
  // bonuses are handled separately by fully resetting _paramPlus.
  function revertTraitGrants(actor, traits) {
    if (!actor || !traits) return;
    const bank = (window.Health && window.Health.Traits) || [];
    traits.forEach((entry) => {
      // A picked list is written as whole traits by this plugin and as bare ids
      // by the creation board, so a revert reads either shape or it silently
      // leaves the granted skills and items behind.
      const trait = (entry && typeof entry === "object")
        ? entry
        : bank.find((t) => String(t.id) === String(entry));
      if (!trait) return;
      (trait.skills || []).forEach((skillId) => {
        if ($dataSkills[skillId]) {
          actor.forgetSkill(skillId);
        }
      });
      (trait.items || []).forEach((itemId) => {
        if ($dataItems[itemId]) {
          $gameParty.loseItem($dataItems[itemId], 1);
        }
      });
      (trait.equipment || []).forEach((itemId) => {
        if ($dataWeapons[itemId]) {
          $gameParty.loseItem($dataWeapons[itemId], 1);
        } else if ($dataArmors[itemId]) {
          $gameParty.loseItem($dataArmors[itemId], 1);
        }
      });
    });
  }

  // Helper function to randomize traits for a specific actor
  function randomizeTraitsForActor(targetActorId = null) {
    const targetId = targetActorId || actorId;

    // Genetic-category traits are never randomly picked: they represent inherent
    // biology decided elsewhere in creation, so random rolls draw only from the
    // physical / mental / magical categories. The roll spends the same purse a
    // player would and can never hand back a build the budget cannot pay for.
    const selectedTraits = pickRandomTraits({
      pool: getTraits().filter((trait) => (trait.category || "mental") !== "genetic"),
    });

    // Apply the traits
    const actor = $gameActors.actor(targetId);

    if (!actor) {
      console.error(`Actor with ID ${targetId} not found!`);
      return;
    }

    // Revert previously applied trait grants so double-randomizing does not
    // leave stale skills or duplicate items, then reset param bonuses.
    revertTraitGrants(actor, actor._selectedTraits);
    actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
    actor._selectedTraits = [];

    const paramMap = {
      hp: 0, mp: 1, atk: 2, def: 3,
      mat: 4, mdf: 5, agi: 6, luk: 7
    };

    // Apply each selected trait
    selectedTraits.forEach((trait) => {
      // Apply positive and negative bonuses
      [trait.positive, trait.negative].forEach((stats) => {
        Object.keys(stats || {}).forEach((param) => {
          const paramId = paramMap[param];
          if (typeof paramId === "number") {
            actor._paramPlus[paramId] = (actor._paramPlus[paramId] || 0) + stats[param];
          }
        });
      });

      // Learn skills
      trait.skills.forEach((skillId) => {
        if ($dataSkills[skillId]) {
          actor.learnSkill(skillId);
        }
      });

      // Add items
      trait.items.forEach((itemId) => {
        if ($dataItems[itemId]) {
          $gameParty.gainItem($dataItems[itemId], 1);
        }
      });

      // Add equipment
      trait.equipment.forEach((itemId) => {
        if ($dataWeapons[itemId]) {
          $gameParty.gainItem($dataWeapons[itemId], 1);
        } else if ($dataArmors[itemId]) {
          $gameParty.gainItem($dataArmors[itemId], 1);
        }
      });

      // Set switches
      trait.switches.forEach((switchId) => {
        $gameSwitches.setValue(switchId, true);
      });
    });

    // Store selected traits
    actor._selectedTraits = selectedTraits;
    actor.refresh();

    console.log("Randomized traits:", selectedTraits.map(t => getTraitText(t, "name")).join(", "));
  }

  PluginManager.registerCommand(pluginName, "randomizeTraits", (args) => {
    randomizeTraitsForActor(actorId);
  });

  // Export globally
  window.Scene_TraitSelector = Scene_TraitSelector;
  window.randomizeTraitsForActor = randomizeTraitsForActor;

  // The trait economy, for every other screen that has to price a trait, print
  // a purse or roll a build the budget can pay for (the character sheet, the
  // NPC society generator, the detailed creation panel).
  window.TraitPoints = {
    BUDGET: TRAIT_POINT_BUDGET,
    REFUND_CAP: TRAIT_REFUND_CAP,
    MAX_PICKS: TRAIT_MAX_PICKS,
    costOf: traitCost,
    tally: traitTally,
    fits: traitFits,
    pick: pickRandomTraits,
    costBadgeHTML,
    // The illness library dressed as trait cards. It is not part of
    // window.Health.Traits, so any other board that draws the five tabs (the
    // dossier panel in character creation) has to ask for it here or its
    // Diseases tab comes up empty.
    diseaseCards: getDiseaseCards,
    // Undoing a build (the Reset button on the creation board) has to take the
    // granted skills, items and equipment back off the actor.
    revertGrants: revertTraitGrants,
    DISEASE_CATEGORY,
  };
})();
