/*:
 * @target MZ
 * @plugindesc Shared utilities for character creation system (localization, gender, traits, constants)
 * @author Omni-Lex
 * @orderAfter DB
 * @orderAfter TraitSelector
 * @orderBefore StartingEquipment
 * @orderBefore CharacterPresets
 * @orderBefore ClassSelection
 * @orderBefore CharacterCreation
 *
 * @help
 * This plugin provides shared utilities for the character creation system:
 * - Localization helpers (getLocalizedChoice)
 * - Gender and reproductive type management
 * - Trait application system (integrates with TraitSelector)
 * - Shared constants (variable IDs, gender/reproduction types)
 * - Parameter modification helpers
 *
 * Dependencies:
 * - DB.js (for localization support)
 * - TraitSelector.js (for trait integration)
 * - Health_Core.js (for archetype system)
 *
 * DO NOT call this plugin directly. It provides utilities for other plugins.
 */

(() => {
  const pluginName = "CharacterCreationShared";


  //=============================================================================
  // Constants - Variable IDs
  //=============================================================================
  const VAR_PLAYER1_GENDER = 38;
  const VAR_PLAYER2_GENDER = 39;
  const VAR_PLAYER3_GENDER = 40;
  const VAR_PLAYER1_REPRODUCTIVE_TYPE = 87;
  const VAR_PLAYER2_REPRODUCTIVE_TYPE = 115;
  const VAR_PLAYER3_REPRODUCTIVE_TYPE = 116;

  //=============================================================================
  // Constants - Gender & Reproduction Types
  //=============================================================================
  const GENDER_TYPES = {
    MALE: 0,
    FEMALE: 1,
    NON_BINARY: 2,
    COCOON: 3
  };

  const REPRODUCTION_TYPES = {
    NONE: -1,
    TESTICLES: 0,    // Male
    UTERUS: 1,       // Female
    OVIPAROUS: 2,    // Egg-laying
    PLANT: 3,        // Spore-based
    MITOSIS: 4       // Asexual (Cocoon)
  };

  //=============================================================================
  // Localization Helpers
  //=============================================================================

  /**
   * Build a menu choice from an already resolved name and description.
   * @param {string} name - Display name
   * @param {string} symbol - Choice symbol
   * @param {string} description - Display description
   * @param {*} value - Optional value
   * @param {string} bgImage - Optional background image
   * @returns {object} Choice object
   */
  function getLocalizedChoice(name, symbol, description, value = null, bgImage = "") {
    return {
      name: name,
      symbol: symbol,
      description: description,
      value: value,
      bgImage: bgImage
    };
  }

  /**
   * Database display name (item, weapon, armor, skill, class, ...) in the
   * active language. data/*.json holds the English names and
   * Hendrix_Localization swaps them at draw time through its
   * Bitmap.drawText / drawTextEx hooks, reading js/i18n/<lang>/items.json and
   * friends. The character creation screens are DOM, so they never reach those
   * hooks: a name pasted straight into HTML stays English in every other
   * language. Every creation panel routes database names through here instead.
   * @param {object|string} entry - Database record, or a raw name
   * @returns {string} Translated name (the original when no translation loaded)
   */
  function dbName(entry) {
    const name = typeof entry === "string" ? entry : (entry && entry.name) || "";
    if (!name) return "";
    return typeof window.Hendrix_Localization === "function"
      ? window.Hendrix_Localization(name)
      : name;
  }

  /**
   * The same service for the prose under the name: a database record's
   * description (js/i18n/<lang>/skills.json, items.json and friends carry one
   * per id, keyed by the English line). A DOM panel that pasted the record's
   * own description showed a translated spell name over an English sentence,
   * so every inspect card routes its description through here.
   * @param {object|string} entry - Database record, or a raw description
   * @returns {string} Translated description (the original when none loaded)
   */
  function dbDescription(entry) {
    const desc = typeof entry === "string" ? entry : (entry && entry.description) || "";
    if (!desc) return "";
    return typeof window.Hendrix_Localization === "function"
      ? window.Hendrix_Localization(desc)
      : desc;
  }

  //=============================================================================
  // Gender & Reproduction System
  //=============================================================================

  /**
   * Get gender variable ID for party member index
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @returns {number} Gender variable ID
   */
  function getGenderVariableId(memberIndex) {
    switch (memberIndex) {
      case 0: return VAR_PLAYER1_GENDER;
      case 1: return VAR_PLAYER2_GENDER;
      case 2: return VAR_PLAYER3_GENDER;
      default:
        console.warn(`Invalid party member index: ${memberIndex}`);
        return VAR_PLAYER1_GENDER;
    }
  }

  /**
   * Get reproductive type variable ID for party member index
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @returns {number} Reproductive type variable ID
   */
  function getReproductiveVariableId(memberIndex) {
    switch (memberIndex) {
      case 0: return VAR_PLAYER1_REPRODUCTIVE_TYPE;
      case 1: return VAR_PLAYER2_REPRODUCTIVE_TYPE;
      case 2: return VAR_PLAYER3_REPRODUCTIVE_TYPE;
      default:
        console.warn(`Invalid party member index: ${memberIndex}`);
        return VAR_PLAYER1_REPRODUCTIVE_TYPE;
    }
  }

  /**
   * Which organs a character starts with, and the hormone balance a body of
   * that build runs at. Both are ANSWERS TO A QUESTION THE PLAYER MAY ALSO
   * ANSWER THEMSELVES on the Bio tab, so both are written here as defaults
   * rather than as facts: gender picks the body it usually comes with, and the
   * panel is free to leave it alone (see `options.keepOrgans`).
   *
   * Male is testes and female a uterus, which is what "default to" means: the
   * organ selector jumps to it the moment the gender is picked, and the player
   * may move it straight off again. Non-binary and cocoon name no body at all,
   * so with `keepOrgans` they change NOTHING: whatever the character already
   * had, or was built with, stands.
   *
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @param {number} genderValue - Gender value (0=Male, 1=Female, 2=Non-binary, 3=Cocoon)
   * @param {object} [options] - { keepOrgans } to leave a body the gender does
   *                             not name exactly as it is
   */
  function applyGenderAndReproduction(memberIndex, genderValue, options) {
    const genderVar = getGenderVariableId(memberIndex);
    const reproductiveVar = getReproductiveVariableId(memberIndex);
    const keepOrgans = !!(options && options.keepOrgans);

    // Set gender variable
    $gameVariables.setValue(genderVar, genderValue);

    // Set reproduction type based on gender
    switch (genderValue) {
      case GENDER_TYPES.MALE:
        $gameVariables.setValue(reproductiveVar, REPRODUCTION_TYPES.TESTICLES);
        break;
      case GENDER_TYPES.FEMALE:
        $gameVariables.setValue(reproductiveVar, REPRODUCTION_TYPES.UTERUS);
        break;
      case GENDER_TYPES.NON_BINARY:
        // Random (0-4: Testicles, Uterus, Oviparous, Plant, Mitosis), unless
        // the caller is asking on behalf of somebody who already has a body.
        if (!keepOrgans) $gameVariables.setValue(reproductiveVar, Math.floor(Math.random() * 5));
        break;
      case GENDER_TYPES.COCOON:
        if (!keepOrgans) $gameVariables.setValue(reproductiveVar, REPRODUCTION_TYPES.MITOSIS);
        break;
      default:
        console.warn(`Unknown gender value: ${genderValue}`);
        if (!keepOrgans) $gameVariables.setValue(reproductiveVar, REPRODUCTION_TYPES.NONE);
    }
  }

  /**
   * The reproductive organs a party member is carrying, as a REPRODUCTION_TYPES
   * value. NONE (-1) is a real answer: a body with no reproductive system at all.
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @returns {number} Reproduction type
   */
  function getReproductionType(memberIndex) {
    const value = $gameVariables.value(getReproductiveVariableId(memberIndex));
    return (value === undefined || value === null) ? REPRODUCTION_TYPES.NONE : value;
  }

  /**
   * Give a party member a set of reproductive organs outright, whatever their
   * gender says. This is the Bio tab's own answer, and it outranks the default
   * the gender pick wrote.
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @param {number} type - REPRODUCTION_TYPES value
   */
  function setReproductionType(memberIndex, type) {
    $gameVariables.setValue(getReproductiveVariableId(memberIndex), Number(type));
  }

  // Where a body of each build sits on the androgenic/oestrogenic scale the
  // creation slider runs on: 0 is wholly oestrogenic, 100 wholly androgenic.
  // These are the DEFAULTS the slider starts at, never a clamp: a character may
  // be built anywhere on the scale whatever gender they were given, which is
  // the whole point of asking the two questions separately.
  const HORMONE_BALANCE_DEFAULTS = {
    [GENDER_TYPES.MALE]: 85,
    [GENDER_TYPES.FEMALE]: 15,
    [GENDER_TYPES.NON_BINARY]: 50,
    [GENDER_TYPES.COCOON]: 50
  };

  /**
   * The balance a body of this gender is usually built at.
   * @param {number} genderValue - Gender value
   * @returns {number} 0-100
   */
  function defaultHormoneBalance(genderValue) {
    const value = HORMONE_BALANCE_DEFAULTS[genderValue];
    return value === undefined ? 50 : value;
  }

  /**
   * The balance an actor actually runs at: their own if they were built with
   * one, otherwise the default for the gender they carry. Never null, so a
   * caller reading hormones off it needs no answer of its own.
   * @param {object} actor - Game_Actor
   * @returns {number} 0-100
   */
  function hormoneBalanceOf(actor) {
    const own = (actor && typeof actor.hormoneBalance === "function")
      ? actor.hormoneBalance() : null;
    if (own !== null && own !== undefined) return own;
    const gender = (actor && typeof actor.gender === "function") ? actor.gender() : 0;
    return defaultHormoneBalance(gender);
  }

  /**
   * Set random gender for a party member
   * @param {number} memberIndex - Party member index (0, 1, 2)
   */
  function applyRandomGender(memberIndex) {
    const randomGender = Math.floor(Math.random() * 4); // 0-3
    applyGenderAndReproduction(memberIndex, randomGender);
  }

  // The body every actor already starts with (Health_Core initializes a new
  // actor's parts from the Humanoid archetype), so a sheet that answers
  // "Humanoid" has nothing to change and the actor is left alone.
  const DEFAULT_ARCHETYPE = "Humanoid"; // i18n-ignore: Archetypes.json key

  /**
   * Settle a character's gender and body archetype from the sprite sheet they
   * were given. js/db/WorldGen/NPCs.json records both for every sheet in the
   * game (window.SpriteCatalog.entry), so a character the wizard only ever
   * asked for a face still gets an identity that matches that face instead of
   * a roll: a slime sheet builds a Slime body, a spider sheet a Spider one.
   *
   * The archetype is applied FIRST and the gender second: changeArchetype
   * writes the reproduction variable from the body plan alone, and the gender
   * is the finer of the two answers.
   *
   * @param {number} memberIndex - Party member index (0, 1, 2)
   * @param {string} sheetName - Character sheet name, as stored on the actor
   * @returns {object|null} The NPCs.json record read, or null when unknown
   */
  function applyIdentityFromSprite(memberIndex, sheetName) {
    const entry = window.SpriteCatalog && window.SpriteCatalog.entry
      ? window.SpriteCatalog.entry(sheetName)
      : null;
    if (!entry) {
      applyRandomGender(memberIndex);
      return null;
    }

    // The sheet's own archetypes are the whole answer: its primary becomes the
    // primary and its SecondaryArchetype the spliced half (an empty one drops
    // whatever the slot used to carry), and the 3D model is regenerated from
    // the pair so the character's body, its anatomy and its model all say the
    // same thing. Humanoid is applied like any other rather than skipped, so a
    // person's sheet also clears whatever the slot held before.
    const archetype = entry.Archetype || DEFAULT_ARCHETYPE;
    const secondary = entry.SecondaryArchetype || null;
    const actor = $gameActors.actor(memberIndex + 1);
    if (actor) {
      if (window.applyArchetypesToActor) {
        window.applyArchetypesToActor(actor, secondary ? [archetype, secondary] : [archetype]);
      } else if (window.changeArchetypeForActor && archetype !== DEFAULT_ARCHETYPE) {
        window.changeArchetypeForActor(actor, archetype);
      }
    }

    if (entry.Gender != null) {
      applyGenderAndReproduction(memberIndex, entry.Gender);
    } else {
      applyRandomGender(memberIndex);
    }
    return entry;
  }

  /**
   * Get gender choices for selection menu
   * @returns {array} Array of gender choice objects
   */
  function getGenderChoices() {
    return [
      {
        name: T('CharCreate.male'),
        symbol: "gender",
        value: GENDER_TYPES.MALE
      },
      {
        name: T('CharCreate.female'),
        symbol: "gender",
        value: GENDER_TYPES.FEMALE
      },
      {
        name: T('CharCreate.nonBinary'),
        symbol: "gender",
        value: GENDER_TYPES.NON_BINARY
      },
      {
        name: T('CharCreate.cocoon'),
        symbol: "gender",
        value: GENDER_TYPES.COCOON
      }
    ];
  }

  //=============================================================================
  // Trait Application System
  //=============================================================================

  /**
   * Apply traits to an actor using trait IDs from TraitSelector
   * @param {Game_Actor} actor - Actor to apply traits to
   * @param {array} traitIds - Array of trait IDs
   */
  function applyTraitsToActor(actor, traitIds) {
    if (!actor || !traitIds || traitIds.length === 0) return;

    // Try to use TraitSelector's applyTraitsByIds method if available
    const TraitSelectorScene = window.Scene_TraitSelector;
    if (TraitSelectorScene && TraitSelectorScene.prototype.applyTraitsByIds) {
      try {
        const tempScene = new TraitSelectorScene();
        tempScene.applyTraitsByIds(traitIds, actor.actorId());
        return;
      } catch (e) {
        console.error('Error using TraitSelector.applyTraitsByIds:', e);
        // Fall through to manual application
      }
    }

    // Fallback: manual trait application if TraitSelector not available
    console.warn('TraitSelector plugin not fully loaded, using fallback trait application');
    const TraitsArray = window.Health && window.Health.Traits;
    if (!TraitsArray) {
      console.error('Cannot apply traits: TraitSelector/DB not loaded');
      return;
    }

    // Store selected traits on the actor
    if (!actor._selectedTraits) {
      actor._selectedTraits = [];
    }

    const selectedTraits = [];

    // Collect trait objects by ID
    traitIds.forEach((traitId) => {
      const trait = TraitsArray.find((t) => t.id === traitId);
      if (trait) {
        selectedTraits.push(trait);
      } else {
        console.warn(`Trait with ID ${traitId} not found in TraitSelector data`);
      }
    });

    // Apply each selected trait
    selectedTraits.forEach((trait) => {
      // Apply positive bonuses
      Object.keys(trait.positive || {}).forEach((param) => {
        addParamToActor(actor, param, trait.positive[param]);
      });

      // Apply negative bonuses
      Object.keys(trait.negative || {}).forEach((param) => {
        addParamToActor(actor, param, trait.negative[param]);
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
  }

  /**
   * Add parameter modification to actor
   * @param {Game_Actor} actor - Actor to modify
   * @param {string} paramName - Parameter name (hp, mp, atk, def, mat, mdf, agi, luk, eva)
   * @param {number} value - Value to add
   */
  function addParamToActor(actor, paramName, value) {
    const paramMap = {
      hp: 0,
      mp: 1,
      atk: 2,
      def: 3,
      mat: 4,
      mdf: 5,
      agi: 6,
      luk: 7
    };

    const paramId = paramMap[paramName];
    if (typeof paramId === 'number') {
      if (!actor._paramPlus) {
        actor._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
      }
      actor._paramPlus[paramId] = (actor._paramPlus[paramId] || 0) + value;
    } else if (paramName === 'eva') {
      console.log(`Evasion modifier: ${value} (implement via traits if needed)`);
    }
  }

  //=============================================================================
  // The navigation bar every creation screen ends with
  //=============================================================================
  // One shape for every step, sub-step and side menu the creator opens: Back on
  // the far left, whatever extra actions the step offers (Random, Skip, ...) in
  // the middle, and Continue on the far right. The three slots are always
  // emitted, empty or not, so a step that has no Back button (the first one) or
  // no extras does not slide Continue across the bar , the two controls the
  // player navigates with sit in exactly the same place on every screen.
  //
  // A slot is never given `display: none` for the same reason: a control that is
  // temporarily unavailable is hidden with `visibility` (see ccSetButtonShown)
  // and keeps its footprint.
  const CCButtons = {
    // Labels, so no screen invents its own wording for the same control.
    backLabel() { return T("CharCreate.back"); },
    continueLabel() { return T("CharCreate.continue"); },
    randomLabel() { return T("CharCreate.randomBust"); },
    titleLabel() { return T("CharCreate.returnToTitle"); },

    /**
     * One button.
     * @param {string} label - Text on the button
     * @param {object} opts - { onclick, id, confirm (gold styling), highlighted
     *                          (keyboard/controller cursor is on it), attrs, cls }
     * @returns {string} HTML
     */
    button(label, opts = {}) {
      const { onclick = "", id = "", confirm = false, highlighted = false, attrs = "", cls: extra = "" } = opts;
      const cls = ["cc-btn-treaty", confirm ? "confirm" : "", highlighted ? "highlighted" : "", extra]
        .filter(Boolean).join(" ");
      return `<button class="${cls}"` +
        `${id ? ` id="${id}"` : ""}${onclick ? ` onclick="${onclick}"` : ""}` +
        `${attrs ? ` ${attrs}` : ""}>${label}</button>`;
    },

    /**
     * The bar itself. Every slot takes raw HTML (or an array of it), so a step
     * that wants two extras just passes both.
     * @param {object} slots - { back, middle, next, cls }
     * @returns {string} HTML
     */
    panel(slots = {}) {
      const { back = "", middle = "", next = "", cls = "" } = slots;
      const mid = Array.isArray(middle) ? middle.join("") : middle;
      return `
        <div class="cc-button-panel cc-nav${cls ? " " + cls : ""}">
          <div class="cc-nav-slot cc-nav-back">${back}</div>
          <div class="cc-nav-slot cc-nav-mid">${mid}</div>
          <div class="cc-nav-slot cc-nav-next">${next}</div>
        </div>
      `;
    },

    /**
     * Same bar, built into an existing element for the screens that wire their
     * buttons up with addEventListener rather than inline handlers.
     * @param {Element} panelEl - The .cc-button-panel element
     * @returns {object} { back, mid, next } slot elements
     */
    slots(panelEl) {
      if (!panelEl) return { back: null, mid: null, next: null };
      panelEl.classList.add("cc-button-panel", "cc-nav");
      panelEl.innerHTML =
        `<div class="cc-nav-slot cc-nav-back"></div>` +
        `<div class="cc-nav-slot cc-nav-mid"></div>` +
        `<div class="cc-nav-slot cc-nav-next"></div>`;
      return {
        back: panelEl.querySelector(".cc-nav-back"),
        mid: panelEl.querySelector(".cc-nav-mid"),
        next: panelEl.querySelector(".cc-nav-next"),
      };
    },

    /**
     * Show / hide a control without moving its neighbours.
     * @param {Element} el - The button
     * @param {boolean} shown - Whether it can be used
     */
    setShown(el, shown) {
      if (!el) return;
      el.classList.toggle("cc-invisible", !shown);
    },
  };

  //=============================================================================
  // Scrolling for the DOM overlays (mouse wheel + L2/R2 triggers)
  //=============================================================================
  // RMMZ swallows every wheel event at the document level (rmmz_core.js,
  // TouchInput._onWheel calls preventDefault), so no DOM overlay ever scrolls
  // on its own: each scrollable pane needs an explicit handler. CCScroll is
  // that handler, shared by every character creation scene, plus a per-frame
  // poll of the analog triggers so L2/R2 scroll exactly what a wheel would.
  //
  // The wheel handler is bound once per container element and resolves
  // everything live from the DOM, so it survives the scene swaps that reuse
  // the shared #character-creation-container without leaking stale closures.
  //
  // A scene can steer it by defining either of these methods:
  //   ccScrollTarget()  -> Element the triggers (and a wheel that lands outside
  //                        any pane) should scroll
  //   ccScrollStep(dir) -> handle one notch itself (dir is -1 up / +1 down);
  //                        return true when consumed, e.g. to move a selection
  //                        instead of scrolling
  const CCScroll = {
    // Pixels per frame at a fully pulled trigger, and the pull below which a
    // trigger reads as released (some pads rest slightly above zero).
    TRIGGER_SPEED: 26,
    TRIGGER_DEADZONE: 0.15,
    // Key-repeat cadence, in frames, for scenes that take discrete steps.
    STEP_WAIT: 20,
    STEP_INTERVAL: 5,
    // How deep below the container a scrollable pane can sit. Panes are always
    // a page's own child or grandchild, so the walk stays cheap even when a
    // pane holds hundreds of cards.
    MAX_DEPTH: 5,

    _px: -1,
    _py: -1,
    _hold: 0,
    _regions: null,
    _regionsAt: -1,

    isScrollable(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.scrollHeight - el.clientHeight < 2) return false;
      const overflow = getComputedStyle(el).overflowY;
      return overflow === "auto" || overflow === "scroll";
    },

    // Nearest scrollable pane at or above `node`, stopping at `root`.
    regionAt(node, root) {
      let el = node;
      while (el && el.nodeType === 1) {
        if (this.isScrollable(el)) return el;
        if (el === root) break;
        el = el.parentElement;
      }
      return null;
    },

    // Every scrollable pane inside `root`, in document order. A pane is never
    // searched for nested panes, and the walk is depth limited, so this stays
    // cheap; the result is cached for a few frames because it only ever runs
    // while a trigger is held.
    regions(root) {
      if (!root) return [];
      if (this._regions && this._regionsAt === Graphics.frameCount) return this._regions;
      const found = [];
      const walk = (el, depth) => {
        if (depth > this.MAX_DEPTH) return;
        for (const child of el.children) {
          if (this.isScrollable(child)) {
            found.push(child);
          } else {
            walk(child, depth + 1);
          }
        }
      };
      walk(root, 0);
      this._regions = found;
      this._regionsAt = Graphics.frameCount;
      return found;
    },

    regionUnderPointer(root) {
      if (this._px < 0 || !document.elementFromPoint) return null;
      const el = document.elementFromPoint(this._px, this._py);
      if (!el || !root.contains(el)) return null;
      return this.regionAt(el, root);
    },

    // The pane L2/R2 act on: whatever the scene names, else the one under the
    // pointer, else the details page (the right page of a spread, which the
    // selection cursor never scrolls for you), else the first pane there is.
    target(root) {
      const scene = SceneManager._scene;
      if (scene && typeof scene.ccScrollTarget === "function") {
        const named = scene.ccScrollTarget();
        if (this.isScrollable(named)) return named;
      }
      const hovered = this.regionUnderPointer(root);
      if (hovered) return hovered;
      const regions = this.regions(root);
      return regions.find((r) => r.closest(".cc-page-right")) || regions[0] || null;
    },

    // Wheel deltas arrive in pixels, lines or pages depending on the device.
    _wheelDelta(e) {
      if (e.deltaMode === 1) return e.deltaY * 40;
      if (e.deltaMode === 2) return e.deltaY * 400;
      return e.deltaY;
    },

    _onWheel(e, root) {
      const scene = SceneManager._scene;
      if (scene && typeof scene.ccScrollStep === "function" &&
        scene.ccScrollStep(e.deltaY > 0 ? 1 : -1)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const pane = this.regionAt(e.target, root) || this.target(root);
      if (!pane) return;
      pane.scrollTop += this._wheelDelta(e);
      e.preventDefault();
      e.stopPropagation();
    },

    // Idempotent: the overlay container outlives the scene that built it.
    bindWheel(container) {
      if (!container || container._ccScrollBound) return;
      container._ccScrollBound = true;
      container.addEventListener("wheel", (e) => this._onWheel(e, container), { passive: false });
      container.addEventListener("pointermove", (e) => {
        this._px = e.clientX;
        this._py = e.clientY;
      });
    },

    // Per-frame trigger poll. Call from the scene's update() while the overlay
    // is visible: L2 scrolls up, R2 scrolls down.
    //
    // The triggers are now read for the WHOLE game, once a frame, by UIScroll
    // in Core/MouseControls.js - the same walk that answers the wheel there.
    // It asks a scene for ccScrollTarget() and ccScrollStep() exactly as this
    // did, so the creation screens keep the panes they name; this stands down
    // when it is present rather than scrolling the same pane a second time.
    // The body below is what a build without that plugin falls back on.
    update(container) {
      if (window.UIScroll && typeof window.UIScroll.updateTriggers === "function") return;
      // Hidden either way: the class CCPanel writes, or a display of its own
      // (the overlay is not always ours to have opened).
      if (!container || CCPanel.isHidden(container)) return;
      const pads = window.AnalogStickInput;
      if (!pads) return;
      const dz = this.TRIGGER_DEADZONE;
      const pull = (v) => (v > dz ? (v - dz) / (1 - dz) : 0);
      const amount = (pull(pads.rightTrigger()) - pull(pads.leftTrigger())) * this.TRIGGER_SPEED;
      if (!amount) {
        this._hold = 0;
        return;
      }
      this._hold++;
      const scene = SceneManager._scene;
      if (scene && typeof scene.ccScrollStep === "function") {
        // Discrete stepping repeats on the same cadence as a held direction.
        const t = this._hold;
        const fires = t === 1 || (t >= this.STEP_WAIT && (t - this.STEP_WAIT) % this.STEP_INTERVAL === 0);
        if (fires && scene.ccScrollStep(amount > 0 ? 1 : -1)) return;
      }
      const pane = this.target(container);
      if (pane) pane.scrollTop += amount;
    }
  };

  //=============================================================================
  // Creature classes , which classes an Archetypes archetype can be played
  // as. Every archetype in js/db/Health/Archetypes.json carries its own
  // roster (DataService loads the file as window.Health.Archetypes), as
  // two arrays of $dataClasses ids:
  //
  //   classes         , the civilised roster, ids 1-62. The humanoids, the
  //                     slime and the mimic take all 62, everyone else the
  //                     classes their culture, creed or nature supports.
  //   creatureClasses , the monstrous roster, ids 63-70 (Feral, Mimic,
  //                     Monster, Mana Cyborg, Ghost, Zombie, Mutant, Drone).
  //                     Never empty, so every archetype can be played as the
  //                     thing it is.
  //
  // A creature built from two archetypes is offered the classes supported by
  // BOTH of them; when the two share nothing, only the fallback (Monster) is
  // offered. Ids are checked against $dataClasses on every call, so a removed
  // class simply drops out of the roster.
  //=============================================================================

  // Offered when an archetype (or a hybrid) supports nothing else.
  const CREATURE_FALLBACK_CLASS_ID = 65; // Monster

  // Highest id of the civilised roster. Everything above it, Feral (63) and
  // every class after it, is a creature class and is only ever reached through
  // an archetype's creatureClasses roster: a person is never built from one,
  // nor rolled into one by any of the randomizers.
  const SENTIENT_CLASS_MAX = 62;

  const CreatureClasses = {
    _data() {
      return (window.Health && window.Health.Archetypes) || null;
    },

    // Drops ids no class in the database answers to.
    _known(ids) {
      if (!Array.isArray(ids)) return [];
      return ids.filter((id) => $dataClasses[id] && $dataClasses[id].name);
    },

    // Severed hides every Magical class, unbound hides every Mundane one
    // (both/untagged always pass); see window.MagicNature. Freelancer (1)
    // and Monster (65, CREATURE_FALLBACK_CLASS_ID) are tagged
    // <Nature: Both> in Classes.json specifically so this never strips them.
    // Falls back to the unfiltered set when a scope would be emptied
    // entirely, so a narrow archetype or hybrid is never left with nothing
    // to be at all.
    _magicAllowed(ids) {
      const MN = window.MagicNature;
      if (!MN || !MN.isFiltering()) return ids;
      const kept = ids.filter((id) => MN.allowsData($dataClasses[id]));
      return kept.length > 0 ? kept : ids;
    },

    // Class id of the "nothing fits" class, Monster by default.
    fallbackId() {
      return CREATURE_FALLBACK_CLASS_ID;
    },

    // Highest class id a person can be built from.
    sentientMax() {
      return SENTIENT_CLASS_MAX;
    },

    // True when the id belongs to the monstrous roster (Feral upward).
    isCreatureClass(classId) {
      return Number(classId) > SENTIENT_CLASS_MAX;
    },

    // Which bodies are PEOPLE. A civilised trade is learned, taught and
    // practised with hands, in a settlement, by something that talks: the folk
    // archetypes (Humanoid, DoubleHeadedHumanoid, Centaur and their like) carry
    // "sentient": true in Archetypes.json, and every beast, ooze, swarm and
    // elemental does not. An archetype the data does not know is not one.
    isSentientArchetype(key) {
      const data = this._data();
      const entry = key && data ? data[key] : null;
      return !!(entry && entry.sentient === true);
    },

    // Whether a finished body may be offered the civilised roster at all. A
    // spliced creature is only as civilised as its worse half: half a person
    // grafted onto a manticore is a monster, and is offered a monster's kinds.
    sentientAllowedFor(key1, key2) {
      if (!this.isSentientArchetype(key1)) return false;
      return !key2 || key2 === key1 || this.isSentientArchetype(key2);
    },

    // Every class a person may be built from or rolled into, the one list the
    // humanoid randomizers draw on.
    sentientRoster() {
      const ids = ($dataClasses || [])
        .filter((c) => c && c.id > 0 && c.id <= SENTIENT_CLASS_MAX && c.name)
        .map((c) => c.id);
      return this._magicAllowed(ids);
    },

    // Every monstrous class in the database: what a creature may be built as
    // when the board offers the whole roster rather than one archetype's.
    creatureRoster() {
      const ids = ($dataClasses || [])
        .filter((c) => c && c.id > SENTIENT_CLASS_MAX && c.name)
        .map((c) => c.id);
      return this._magicAllowed(ids);
    },

    // The sentient classes THE CREATION BOARD offers for a single archetype
    // key: Archetypes.json "sentientClasses", authored per body. A humanoid
    // lists the whole civilised roster, a bird lists nothing at all. [] when
    // the archetype is unknown or takes no civilised trade.
    sentientClassesFor(key) {
      const data = this._data();
      if (!key || !data || !data[key]) return [];
      return this._magicAllowed(this._known(data[key].sentientClasses));
    },

    // The civilised roster of a single archetype key, [] when the archetype is
    // unknown.
    civilisedFor(key) {
      const data = this._data();
      if (!key || !data || !data[key]) return [];
      return this._magicAllowed(this._known(data[key].classes));
    },

    // The monstrous roster of a single archetype key, [] when the archetype is
    // unknown.
    creatureFor(key) {
      const data = this._data();
      if (!key || !data || !data[key]) return [];
      return this._magicAllowed(this._known(data[key].creatureClasses));
    },

    // Everything a single archetype can be played as, its own kind last.
    forArchetype(key) {
      return this.civilisedFor(key).concat(this.creatureFor(key));
    },

    // The two rosters a finished creature is offered, kept apart so the class
    // browser can head them ("Non Sentient" / "Sentient"). One archetype: its
    // own two lists. Two: the intersection of each. The creature list is never
    // empty , a pair that shares nothing at all is still a Monster.
    groupsForArchetypes(key1, key2) {
      const pick = (getter) => {
        let ids = this[getter](key1);
        if (key2 && key2 !== key1) {
          const second = new Set(this[getter](key2));
          ids = ids.filter((id) => second.has(id));
        }
        return ids;
      };
      const creature = pick("creatureFor");
      const sentient = pick("civilisedFor");
      if (!creature.length && !sentient.length) {
        return { creature: [this.fallbackId()], sentient: [] };
      }
      return { creature, sentient };
    },

    // The two rosters as the CREATION BOARD offers them. The monstrous half is
    // groupsForArchetypes'; the civilised half is the archetype's authored
    // "sentientClasses" instead of its NPC "classes" roster, so what a player
    // may build is a data question and not a flag. A hybrid is offered what
    // both bodies support. Only a character being built is held to this: an
    // NPC beast that already wears a trade (and the pet roster that reads the
    // same groups) keeps groupsForArchetypes as it is, so nothing already
    // walking the world is retconned.
    playableGroupsForArchetypes(key1, key2) {
      const groups = this.groupsForArchetypes(key1, key2);
      let sentient = this.sentientClassesFor(key1);
      if (key2 && key2 !== key1) {
        const second = new Set(this.sentientClassesFor(key2));
        sentient = sentient.filter((id) => second.has(id));
      }
      return {
        creature: groups.creature.length ? groups.creature : [this.fallbackId()],
        sentient,
      };
    },

    // The same two rosters as one flat list, the creature's own kind first.
    // Never empty.
    forArchetypes(key1, key2) {
      const groups = this.groupsForArchetypes(key1, key2);
      return groups.creature.concat(groups.sentient);
    },

    // Same, resolved from an actor's stored archetype ("A" or "A / B", written
    // by Health_Core / the creature builder).
    forActor(actor) {
      const stored = actor && actor._currentArchetype;
      if (!stored) return [this.fallbackId()];
      const parts = String(stored).split("/").map((s) => s.trim()).filter(Boolean);
      return this.forArchetypes(parts[0], parts[1]);
    },
  };

  //=============================================================================
  // Attribute names
  //=============================================================================

  // The six attribute abbreviations the whole game prints (STR/CON/DEX/INT/
  // WIS/PSI in English, FRZ/COS/DES/INT/SAG/PSI in Italian) live in
  // js/i18n/<lang>/stats.json, which sits at the i18n root and so is outside
  // what window.T covers. Every creation panel that labels a stat box reads
  // them from here: fetched once per language, on the render thread, the same
  // way NPCEmpathizeUI reads the same bank.
  let _statsBank = null;
  let _statsBankLang = null;
  function statLabels() {
    const lang = (typeof ConfigManager !== "undefined" && ConfigManager.language) || "en";
    if (_statsBank === null || _statsBankLang !== lang) {
      _statsBank = {};
      _statsBankLang = lang;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `js/i18n/${lang}/stats.json`, false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) _statsBank = JSON.parse(xhr.responseText);
      } catch (e) { /* the English names below stand in */ }
    }
    const s = _statsBank;
    return {
      HP: s["HP"] || "HP",
      MP: s["MP"] || "MP",
      AP: s["TP"] || "AP",
      STR: s["ATT"] || "STR",
      CON: s["DEF"] || "CON",
      INT: s["M.ATT"] || "INT",
      WIS: s["M.DEF"] || "WIS",
      DEX: s["AGILITY"] || "DEX",
      PSI: s["LUCK"] || "PSI"
    };
  }

  // One label by its English abbreviation, which is also the key the
  // specialization and trait banks store a governing attribute under.
  function statLabel(abbr) {
    const labels = statLabels();
    return labels[String(abbr || "").toUpperCase()] || abbr;
  }

  //=============================================================================
  // Exports to Global Namespace
  //=============================================================================

  // ---------------------------------------------------------------------
  // CCArt: the one answer to "what does this IconSet glyph / walking sprite
  // look like". Four copies of this maths lived in four creation plugins and
  // each pasted a whole background shorthand into the markup. They now all
  // call this, and it hands back CUSTOM PROPERTIES only: the stylesheet owns
  // the image, the repeat and the pixelation, the markup only says which cell.
  // ---------------------------------------------------------------------
  const CCArt = {
    // An image path handed over as a custom property, made absolute first.
    // See UIPanel.assetUrl (Core/MouseControls.js) for why a relative one
    // never paints: the fallback here is the same answer, for the harnesses
    // that load this file on its own.
    // Unquoted on purpose, like UIPanel.assetUrl: the value lands inside a
    // inline style attribute, where an inner double quote ends the attribute
    // and the picture is never painted.
    url(path) {
      if (window.UIPanel && window.UIPanel.assetUrl) return window.UIPanel.assetUrl(path);
      if (!path) return "none";
      let href;
      try {
        href = new URL(path, document.baseURI).href;
      } catch (e) {
        href = String(path);
      }
      const escaped = href.replace(/[()'"\s]/g, (c) =>
        "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
      return `url(${escaped})`;
    },

    // .cc-rpg-icon (and anything else reading --cc-icon-*).
    icon(iconIndex, size = 32) {
      if (!iconIndex) return `--cc-icon-box:${size}px;`;
      const col = iconIndex % 16;
      const row = Math.floor(iconIndex / 16);
      return `--cc-icon-sheet:${size * 16}px; --cc-icon-x:-${col * size}px; ` +
             `--cc-icon-y:-${row * size}px; --cc-icon-box:${size}px;`;
    },

    // .cc-sprite (and .cc-compact-avatar / .cc-wanted-sprite, which read the
    // same properties). `size` overrides the 48px box a walking frame gets.
    sprite(spriteName, spriteIndex, size) {
      if (!spriteName) return "";
      const url = `img/characters/${spriteName}.png`;
      // isBigCharacter only reads the leading !$ of a FILE name, so a sheet
      // given by folder ("NPCs/!$Wolf1") never matched and every companion in
      // the roster was drawn with the 4x2 maths of a joined sheet: a 1200%
      // zoom onto a corner of a 3x4 sheet, which is to say nothing at all.
      const baseName = String(spriteName).replace(/^.*[/\\]/, "");
      if (ImageManager.isBigCharacter(baseName)) {
        // A $ sheet is always 3x4, but the frame is not square in every pack,
        // so the box is measured off the bitmap instead of assumed.
        const bitmap = ImageManager.loadCharacter(spriteName);
        const frameW = (bitmap.width || 144) / 3;
        const frameH = (bitmap.height || 192) / 4;
        const w = size || 48;
        const h = size ? size : Math.round(w * (frameH / frameW));
        return `--cc-sprite-url:${this.url(url)}; --cc-sprite-x:50%; --cc-sprite-y:0%; ` +
               `--cc-sprite-zoom:300% 400%; --cc-sprite-w:${w}px; --cc-sprite-h:${h}px;`;
      }
      const col = spriteIndex % 4;
      const row = Math.floor(spriteIndex / 4);
      const pctX = ((col * 3 + 1) / 11) * 100;
      const pctY = ((row * 4) / 7) * 100;
      const box = size || 48;
      return `--cc-sprite-url:${this.url(url)}; --cc-sprite-x:${pctX}%; --cc-sprite-y:${pctY}%; ` +
             `--cc-sprite-zoom:1200% 800%; --cc-sprite-w:${box}px; --cc-sprite-h:${box}px;`;
    }
  };

  window.CCArt = CCArt;

  // ------------------------------------------------------------------
  // TraitParams: the one answer to what a trait's stat line means.
  // A trait writes its bonuses in the engine's param names (atk, mdf, luk),
  // which is not what this game calls its attributes, and its HP and MP
  // figures are written on a small scale: a +4 next to a four hundred point
  // pool is nothing, so those two, and only those two, are worth ten each.
  // Every board that applies a trait or prints its badges asks here, so the
  // number the player reads is the number the actor gets.
  // ------------------------------------------------------------------
  const TRAIT_PARAM_IDS = {
    hp: 0, mp: 1, atk: 2, def: 3, mat: 4, mdf: 5, agi: 6, luk: 7,
  };
  const TRAIT_PARAM_ABBR = ["HP", "MP", "STR", "CON", "INT", "WIS", "DEX", "PSI"];
  const TRAIT_VITAL_SCALE = 10;
  window.TraitParams = {
    paramId(paramName) {
      const id = TRAIT_PARAM_IDS[String(paramName || "").toLowerCase()];
      return typeof id === "number" ? id : undefined;
    },
    // HP and MP alone are multiplied; every other attribute is worth its face.
    scale(paramName, value) {
      const key = String(paramName || "").toLowerCase();
      const n = Number(value) || 0;
      return (key === "hp" || key === "mp") ? n * TRAIT_VITAL_SCALE : n;
    },
    // The attribute's name as the rest of the sheet prints it.
    label(paramName) {
      const id = this.paramId(paramName);
      const abbr = typeof id === "number" ? TRAIT_PARAM_ABBR[id] : String(paramName || "").toUpperCase();
      if (typeof window.CCStatLabel === "function") return window.CCStatLabel(abbr);
      return abbr;
    },
    // One badge's text: "+40 HP", "-1 WIS".
    text(paramName, value) {
      const v = this.scale(paramName, value);
      return `${v > 0 ? "+" : ""}${v} ${this.label(paramName)}`;
    },
  };

  // ---------------------------------------------------------------------
  // CCPanel: creation's name for the game-wide window.UIPanel (Core/
  // MouseControls.js). Kept because sixty call sites in this folder say
  // CCPanel; it is the same object, and there is only one implementation.
  // ---------------------------------------------------------------------
  // The fallback is what UIPanel does, for the harnesses that load this file
  // without Core/MouseControls.js: one implementation, two ways in.
  const UI = () => window.UIPanel || {
    open(el) { if (el) { el.classList.remove("ui-closed"); el.classList.add("ui-open"); } },
    close(el) { if (el) { el.classList.remove("ui-open"); el.classList.add("ui-closed"); } },
    isOpen(el) { return !!el && el.classList.contains("ui-open"); },
    isClosed(el) {
      if (!el) return true;
      if (el.classList.contains("ui-closed")) return true;
      return !!(el.style && el.style.display === "none");
    },
    placeAt(el, x, y) {
      if (!el) return;
      el.style.setProperty("--ui-at-x", `${x}px`);
      el.style.setProperty("--ui-at-y", `${y}px`);
    }
  };

  const CCPanel = {
    show(el) { UI().open(el); },
    hide(el) { UI().close(el); },
    isHidden(el) { return UI().isClosed(el); },
    placeAt(el, x, y) { UI().placeAt(el, x, y); }
  };

  window.CCPanel = CCPanel;
  window.CCScroll = CCScroll;
  window.CCButtons = CCButtons;
  window.CreatureClasses = CreatureClasses;
  // The attribute names every creation panel labels its stat boxes with.
  window.CCStatLabels = statLabels;
  window.CCStatLabel = statLabel;
  // Global alias: the creation panels are template-literal heavy, and every
  // database name they print goes through this.
  window.CCDbName = dbName;
  window.CCDbDesc = dbDescription;

  window.CharacterCreationUtils = {
    // Constants
    VAR_PLAYER1_GENDER,
    VAR_PLAYER2_GENDER,
    VAR_PLAYER3_GENDER,
    VAR_PLAYER1_REPRODUCTIVE_TYPE,
    VAR_PLAYER2_REPRODUCTIVE_TYPE,
    VAR_PLAYER3_REPRODUCTIVE_TYPE,
    GENDER_TYPES,
    REPRODUCTION_TYPES,

    // Localization
    getLocalizedChoice,
    dbName,
    dbDescription,
    statLabels,
    statLabel,

    // Gender & Reproduction
    getGenderVariableId,
    getReproductiveVariableId,
    applyGenderAndReproduction,
    applyRandomGender,
    applyIdentityFromSprite,
    getGenderChoices,
    getReproductionType,
    setReproductionType,

    // Endocrine balance (the Bio tab's slider, see ActorCharacterFields)
    defaultHormoneBalance,
    hormoneBalanceOf,

    // Traits
    applyTraitsToActor,
    addParamToActor
  };

  console.log(`${pluginName} loaded successfully.`);
})();
