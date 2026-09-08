//=============================================================================
// CharacterCreationFull.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.0.0] Detailed creation mode: the whole character sheet is edited inside the Empathize panel
 * @author Hypernet Explorer
 *
 * @param specializationPoints
 * @text Specialization points
 * @desc Points each character has to raise specializations with at creation. Levels granted by class or traits are free.
 * @type number
 * @min 0
 * @default 12
 *
 * @help
 * ============================================================================
 * Detailed creation mode
 * ============================================================================
 *
 * A third answer to the wizard's "creation mode" question, sitting between
 * Quick and the pre-made dossiers, and offered during the story mode as well.
 *
 * Instead of walking the wizard's per-character steps one screen at a time, it
 * hands the member over to the Empathize panel (NPC/NPCEmpathizeUI.js) opened
 * on their own profile, with an extra "Create" tab that makes every field of
 * that profile editable: humanoid or creature, name, gender, class, level,
 * portrait, sprite, age, nation of birth, traits, specializations,
 * personality, ideology, faction, wealth, morality, romantic and sexual
 * orientation, reproduction, and a re-roll of the backstory and life history.
 * Every other tab of the panel (Info, History, Biologics, Health, Romance,
 * Life, Wiki) stays where it is, so the sheet being edited can be read the way
 * the player will read it in play.
 *
 * The heavier editors are the ones the wizard already uses: the sprite grid,
 * the bust gallery, the 3D model editor, the class browser, the creature
 * builder and the trait selector are all pushed over the panel and return to
 * it.
 *
 * Closing the panel resumes CharacterCreation at the add-member prompt, so the
 * party is built one detailed member at a time.
 *
 * Requires: NPC/NPCEmpathize + NPC/NPCEmpathizeUI, CharacterCreation and its
 * sibling editors. Must load AFTER NPCEmpathizeUI.
 */

(() => {
  "use strict";

  const Empathize = window.NPCEmpathize;
  if (!Empathize || !Empathize.Scene_NPCEmpathize) {
    console.error("[CharacterCreationFull] NPCEmpathizeUI.js is not loaded, detailed creation mode is unavailable.");
    return;
  }

  const Scene_NPCEmpathize = Empathize.Scene_NPCEmpathize;
  const _getProfile = Empathize._helpers && Empathize._helpers._getProfile;

  // The editor's own tab id. Deliberately outside the panel's built-in set so
  // the base _render() falls through to _buildMoreHTML, which is where this
  // plugin hangs the editor page.
  const CC_TAB = "ccEdit";

  // Reproduction type variable per party member (see CharacterCreationShared).
  const REPRO_VARS = [87, 115, 116];
  // Creature switch per party member.
  const CREATURE_SWITCHES = [77, 78, 79];
  const CREATURE_CLASS_ID = 65;
  const DEFAULT_CLASS_ID = 1;
  const NAME_MAX_LENGTH = 16;

  // Levels offered on the level row. A creation-time character is not meant to
  // be tuned point by point, only placed on a band.
  const LEVEL_CHOICES = [1, 3, 5, 10, 15, 20, 30, 50];

  // Points each character has to raise specializations with. Only levels above
  // what their class and traits already grant are paid for.
  const SPEC_POINT_BUDGET = (() => {
    const raw = PluginManager.parameters("CharacterCreationFull").specializationPoints;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : 12;
  })();

  // Age bands, the same ones the wizard's birth-date step deals in.
  const AGE_BANDS = [
    { key: "ageYoung", lo: 18, hi: 25 },
    { key: "ageAdult", lo: 26, hi: 40 },
    { key: "ageMiddle", lo: 41, hi: 60 },
    { key: "ageElder", lo: 61, hi: 90 },
  ];

  // Every "pick" row gets a small random button beside it, except
  // "specializations": its picker is a drill-down into categories rather than
  // a flat list of values, so applying a uniformly random top-level option
  // would only open a random category instead of rolling anything, and it
  // already has its own dedicated "specsRandom" row right below it.
  const RAND_ROW_EXCLUDE = new Set(["specializations"]);

  // A picker with more options than this gets a search box over its list. Below
  // it the whole list is on screen at once and a box would only be in the way.
  const PICKER_SEARCH_MIN_OPTIONS = 10;

  // Rows a picker builds at once. The specialization search answers out of all
  // 800 of them, and a one-letter query still leaves hundreds: past this the
  // list is asking for a narrower query rather than a longer page.
  const PICKER_MAX_ROWS = 60;

  //===========================================================================
  // Localization + small HTML helpers
  //===========================================================================

  const T = (key, params) => window.T("CharCreate." + key, params);
  const TE = (key, params) => window.T("Empathize." + key, params);

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Search over a picker's options. Both halves of a row are matched, since the
  // subtitle is where a specialization's tier and a nation's description live,
  // and every word of the query has to land somewhere so "master cook" finds
  // the cooking a character has mastered.
  function filterOptions(options, query) {
    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((option) => {
      const haystack = `${option.label || ""} ${option.sub || ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  function iconSpan(iconIndex, size) {
    if (!iconIndex && iconIndex !== 0) return "";
    return `<span class="cc-rpg-icon" style="${window.CCArt.icon(iconIndex, size)}"></span>`;
  }

  //===========================================================================
  // Editing session
  //===========================================================================

  // Module-level rather than scene-level: pushing the sprite grid, the class
  // browser or the creature builder destroys the panel's scene instance, and a
  // fresh one is built from these when the sub-editor pops back.
  const Session = {
    active: false,
    memberIndex: 0,
    actorId: 1,
    tab: CC_TAB,
    // Wizard step to resume at when the panel finally closes. interruptedStep
    // + 1 is the landing step, so BIRTHDATE resumes on ADD_MEMBER.
    resumeStep: -1,
    // Name the profile is filed under, so a rename can carry the edits over.
    profileName: "",
    // Class + traits the specialization budget was last spent against, or null
    // before the member has been opened once. See resetSpecPointsIfBuildChanged.
    specBuild: null,
  };

  // The wizard is still underneath the panel on the scene stack. A session that
  // somehow outlived its wizard (a plugin command tearing the flow down, a
  // load) must never turn an ordinary Empathize visit into an editor.
  function wizardOnStack() {
    const stack = SceneManager._stack;
    return !!(stack && window.Scene_CharacterCreation && stack.indexOf(window.Scene_CharacterCreation) !== -1);
  }

  function isEditing(scene) {
    if (!Session.active || !scene || scene._actorId !== Session.actorId) return false;
    return wizardOnStack();
  }

  function editedActor() {
    return $gameActors ? $gameActors.actor(Session.actorId) : null;
  }

  function editedProfile() {
    const actor = editedActor();
    if (!actor || !_getProfile) return null;
    const name = actor.name();
    if (!name) return null;
    // Minting a profile walks the whole society registry, so only ask for one
    // when this name does not have one yet: the editor reads it several times
    // per redraw.
    const existing = _getProfile(name);
    if (existing) { existing.playerCreated = true; return existing; }
    if (!window.NPCSocietyRegistry) return null;
    window.NPCSocietyRegistry.ensureProfile(name, actor.currentClass() ? actor.currentClass().id : null);
    const minted = _getProfile(name) || null;
    // The sheet is only ever opened on a character the player is building, so
    // the profile behind it is flagged as such: NPCPolitics hands a made
    // character no party unless the party row below declares one.
    if (minted) minted.playerCreated = true;
    return minted;
  }

  // ---------------------------------------------------------------------
  // PARTY AFFILIATION
  // ---------------------------------------------------------------------
  // A made character starts with no political party. The detailed sheet is the
  // only place one is offered, and only parties standing in the party's home
  // nation whose own creed sits nearest the creed picked above.

  function partyChoices(profile) {
    const POL = window.NPCPolitics;
    if (!POL || !POL.partyChoicesFor) return [];
    const town = $gameSystem && $gameSystem._ccHometown;
    const country = POL.countryOfHometown ? POL.countryOfHometown(town) : null;
    if (!country) return [];
    const creed = profile ? window.NPCShared.ideologyFor(profile) : null;
    return POL.partyChoicesFor(country, creed ? creed.id : null);
  }

  function declaredPartyLabel(profile) {
    const name = profile && profile.declaredPartyName;
    return name ? String(name) : T("detailed.none");
  }

  // Writing the declaration also corrects an identity the politics sim may
  // already have minted for this name during creation, so the sheet and the
  // Empathize panel never disagree.
  function applyParty(profile, name) {
    if (!profile) return;
    profile.declaredPartyName = name || null;
    const actor = editedActor();
    const identity = actor && window.NPCPolitics?.getIdentity?.(actor.name());
    if (!identity) return;
    const party = name && window.NPCPolitics.getPower
      ? (window.NPCPolitics.getPower(identity.power)?.parties || [])
          .find((p) => p.name === name && (!identity.country || p.country === identity.country))
      : null;
    identity.partyId = party ? party.id : null;
  }

  // A renamed character is the same character: move the edited profile onto the
  // new key rather than letting a freshly rolled one be generated under it.
  function carryProfileToNewName(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    const society = $gameSystem && $gameSystem._npcSociety;
    if (!society || !society[oldName]) return;
    const profile = society[oldName];
    delete society[oldName];
    if (!society[newName]) society[newName] = profile;
  }

  function isCreature() {
    return !!($gameSwitches && $gameSwitches.value(CREATURE_SWITCHES[Session.memberIndex] || 77));
  }

  // A creature played as one of the creature classes (Feral, Mimic, Monster,
  // Mana Cyborg, Ghost, Zombie, Mutant, Drone) is not a person and is not asked
  // a person's questions. It holds no creed and no banner, and it brings no
  // money in (see giveStartingMoney in CharacterCreation.js), so the rows that
  // ask about those are not offered to it at all rather than offered and then
  // quietly ignored. Everything a body has , anatomy, biology, talents ,
  // stays: those are questions a beast has answers to.
  function isNonSentient() {
    const NC = window.NPCCreature;
    return !!(NC && NC.isNonSentientActor(editedActor()));
  }

  // Strip the three things a beast cannot hold off a profile. Used when the
  // sheet turns out to belong to one, so a creed picked before the class was
  // changed does not survive as an answer to a question that is no longer
  // asked. The "no creed" shape is the one NPCShared.ideologyFor reads as
  // none: index -1 and no id.
  function clearSocialTies(profile) {
    if (!profile) return;
    profile.ideologyIndex = -1;
    profile.ideologyId = null;
    profile.factionIndex = -1;
    profile.wealthTierChosen = 0;
    profile.wealthTierBase = 0;
    profile.money = 0;
  }

  function model3DAvailable() {
    return !!(window.Scene_CC3DModel && window.CC3DModel && window.CC3DModel.isAvailable());
  }

  //===========================================================================
  // Field writers
  //===========================================================================

  function applyGender(value) {
    const actor = editedActor();
    if (!actor) return;
    if (actor.setGender) actor.setGender(value);
    const utils = window.CharacterCreationUtils;
    if (utils && utils.applyGenderAndReproduction) {
      // Derives the reproduction type from the gender, the way the wizard's own
      // gender step does; re-applying it here keeps switch 69 in step with it.
      utils.applyGenderAndReproduction(Session.memberIndex, value);
      applyReproduction(reproductionValue());
    }
    const profile = editedProfile();
    if (profile) profile.gender = value;
  }

  function reproductionValue() {
    const varId = REPRO_VARS[Session.memberIndex] || REPRO_VARS[0];
    return $gameVariables ? $gameVariables.value(varId) : 0;
  }

  function applyReproduction(value) {
    const varId = REPRO_VARS[Session.memberIndex] || REPRO_VARS[0];
    if ($gameVariables) $gameVariables.setValue(varId, value);
    // Switch 69 is the party-wide "someone can carry a pregnancy" flag the
    // biologic simulation reads, and only the first member owns it.
    if (Session.memberIndex === 0 && $gameSwitches) $gameSwitches.setValue(69, value === 1);
  }

  function applyKind(creature) {
    const actor = editedActor();
    if (!actor) return;
    const switchId = CREATURE_SWITCHES[Session.memberIndex] || 77;
    if ($gameSwitches) $gameSwitches.setValue(switchId, creature);
    if (window.Scene_CharacterCreation) window.Scene_CharacterCreation._isCreatureMode = creature;
    if (creature) {
      if (actor.currentClass() && actor.currentClass().id !== CREATURE_CLASS_ID) {
        actor.changeClass(CREATURE_CLASS_ID, false);
      }
    } else if (actor.currentClass() && actor.currentClass().id === CREATURE_CLASS_ID) {
      actor.changeClass(DEFAULT_CLASS_ID, false);
    }
    // The art style follows the kind: a person is drawn as a bust, a creature
    // is sculpted in 3D. Nothing asks the player which of the two they want.
    if (actor.setPortraitMode) {
      if (creature) { if (actor.portraitMode() !== "sprite") actor.setPortraitMode("model"); }
      else actor.setPortraitMode("bust");
    }
    const profile = editedProfile();
    if (profile) profile.isCreature = creature;
  }

  function applyLevel(level) {
    const actor = editedActor();
    if (!actor) return;
    actor.changeLevel(level, false);
    actor.recoverAll();
  }

  //---------------------------------------------------------------------------
  // Wealth
  //---------------------------------------------------------------------------
  // The band a character was raised in, which is a fact about them and not a
  // reading of the party purse. It is written to BOTH fields: wealthTierChosen
  // is the choice, kept forever, and wealthTierBase is what every other reader
  // of the profile already looks at. NPCSociety's party-member sync recomputes
  // wealthTierBase from the purse on every read, and defers to the chosen band
  // while the purse is still empty, which is the whole of character creation.
  function applyWealth(profile, tier) {
    if (!profile) return;
    const clamped = Math.max(0, Math.min(4, Number(tier) || 0));
    profile.wealthTierChosen = clamped;
    profile.wealthTierBase = clamped;
  }

  function wealthTier(profile) {
    if (!profile) return 0;
    return profile.wealthTierChosen != null ? profile.wealthTierChosen : (profile.wealthTierBase || 0);
  }

  function wealthLabel(tier) {
    return [TE("destitute"), TE("poor"), TE("workingClass"), TE("middleClass"), TE("wealthy")][tier] || "";
  }

  // What this band puts into the party purse at the end of creation, spelled the
  // way the game spells money. window.CharacterCreationMoney is the wizard's own
  // table, so the row and the payout can never drift apart.
  function wealthMoneyLabel(tier) {
    const money = window.CharacterCreationMoney;
    if (!money || !money.formatWealth) return "";
    return money.formatWealth(tier);
  }

  // Blood type is otherwise rolled once from the actor's name the first time
  // anything asks (window.BloodTypeService, Health_BiologicSimulation); this
  // is the one place it can be set by hand instead, and the one place it can
  // be re-rolled at random rather than staying pinned to the name.
  function applyBloodType(id) {
    const actor = editedActor();
    if (!actor || !window.BloodTypeService) return;
    window.BloodTypeService.setForActor(actor, id);
  }

  function randomizeBloodType() {
    const actor = editedActor();
    const BTS = window.BloodTypeService;
    if (!actor || !BTS) return;
    const table = BTS.list();
    if (!table.length) return;
    let roll = Math.random() * 100;
    let chosen = table[0];
    for (const entry of table) {
      roll -= entry.percent;
      if (roll <= 0) { chosen = entry; break; }
    }
    BTS.setForActor(actor, chosen.id);
  }

  function applyAge(age) {
    if (!$gameSystem._ccBirthAge) $gameSystem._ccBirthAge = [];
    $gameSystem._ccBirthAge[Session.memberIndex] = age;
    const profile = editedProfile();
    if (!profile) return;
    const nowYear = (window.NPCLifeSim && window.NPCLifeSim.currentYear)
      ? window.NPCLifeSim.currentYear() : 2001;
    profile._birthYearOverride = nowYear - age;
    // The life record and the bio were both written against the old age, so
    // they are re-dealt here rather than left contradicting the sheet.
    const actor = editedActor();
    if (actor && window.NPCLifeSim && window.NPCLifeSim.rerollLifeRecord) {
      window.NPCLifeSim.rerollLifeRecord(actor.name(), profile._homeGroupName || null);
    }
    rerollBackstory();
  }

  function currentAge() {
    const stored = $gameSystem._ccBirthAge && $gameSystem._ccBirthAge[Session.memberIndex];
    if (stored) return stored;
    const actor = editedActor();
    const name = actor && actor.name();
    if (name && window.NPCLifeSim && window.NPCLifeSim.ageOf) {
      const age = window.NPCLifeSim.ageOf(name);
      if (age != null) return age;
    }
    return null;
  }

  function hometownList() {
    const destinations = window.WorkSystem && window.WorkSystem.Destinations;
    if (destinations && typeof destinations === "object") {
      const names = Object.keys(destinations);
      if (names.length) {
        return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }
    }
    return [];
  }

  // The nation ids the backstory generator draws from. `_birthplaceOverride`
  // stores one of these verbatim, so the list is of ids; the label each reads as
  // comes from WorldNames, and the picker sorts on the label.
  function nationList() {
    const countries = window.HistorySimulator_COUNTRIES;
    if (!countries) return [];
    return Object.keys(countries).sort((a, b) => nationLabel(a).localeCompare(nationLabel(b)));
  }

  function nationLabel(id) {
    return window.WorldNames ? window.WorldNames.nation(id) : String(id || "");
  }

  // The Romance tab's own copy of this bank is private to NPCEmpathizeUI, so it
  // is read once here as well and kept for the session.
  let _orientationBank = null;
  function orientationBank() {
    if (_orientationBank) return _orientationBank;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "js/db/NPC/Orientations.json", false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        _orientationBank = JSON.parse(xhr.responseText);
        return _orientationBank;
      }
    } catch (e) {
      console.warn("[CharacterCreationFull] could not read Orientations.json", e);
    }
    _orientationBank = { sexual: [], romantic: [] };
    return _orientationBank;
  }

  // Orientations.json carries i18n keys rather than words, so an orientation
  // reads in the player's language; anything unkeyed is shown as written.
  function dbText(value) {
    if (!value) return "";
    // window.T, not the local CharCreate-prefixed wrapper: these keys name
    // their own namespace.
    const key = String(value);
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : key;
  }

  function orientationName(entry) {
    return entry ? dbText(entry.name) : "";
  }

  function currentOrientation(kind) {
    const profile = editedProfile();
    const key = profile && profile._orientOverride
      ? profile._orientOverride[kind === "sexual" ? "sexualKey" : "romanticKey"] : null;
    if (!key) return null;
    return (orientationBank()[kind] || []).find((o) => o.key === key) || null;
  }

  function applyOrientation(kind, key) {
    const profile = editedProfile();
    if (!profile) return;
    if (!profile._orientOverride) profile._orientOverride = {};
    profile._orientOverride[kind === "sexual" ? "sexualKey" : "romanticKey"] = key;
  }

  function societyData() {
    return window._NPCSocietyDataLoader || null;
  }

  // The English `name` is the personality's id; its label comes from
  // js/i18n/<lang>/plugins/Personality.json.
  function personalityName(entry) {
    if (!entry || !entry.name) return "";
    const key = "Personality." + String(entry.name).toLowerCase().replace(/[^a-z0-9]/g, "") + ".name";
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : String(entry.name);
  }

  // A creed is written to the profile by slot AND by name: everything that
  // reads one back (NPCShared.ideologyFor) answers on the id first, so setting
  // the index alone would leave the character believing whatever they were
  // first dealt. Both go together, always.
  function setIdeology(profile, index) {
    const list = (window.NPCShared && window.NPCShared.ideologyList()) || [];
    profile.ideologyIndex = index;
    profile.ideologyId = list[index] ? list[index].id : null;
  }

  function ideologyName(entry) {
    if (!entry) return "";
    const translated = window.DataService && window.DataService.t
      ? window.DataService.t(entry.name) : null;
    if (translated && translated !== entry.name) return translated;
    return String(entry.name || "").split(".").pop()
      .split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function factionName(entry) {
    if (!entry) return "";
    const loader = window._NPCSocietyDataLoader;
    const localized = loader && loader.getFactionName ? loader.getFactionName(entry) : null;
    if (localized) return localized;
    const seg = String(entry.name || "").split(".")[1] || String(entry.name || "?");
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }

  function traitName(trait) {
    if (!trait) return "?";
    if (window.CCDbName) {
      const named = window.CCDbName(trait);
      if (named && named.indexOf(".") === -1) return named;
    }
    const seg = String(trait.name || "").split(".")[1] || String(trait.name || "?");
    return seg.split(/[_\-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function actorTraits() {
    const actor = editedActor();
    return (actor && actor._selectedTraits) || [];
  }

  // The panel reads traits off the society profile, the game reads them off the
  // actor. The editor is the one place both are set at once, so the chosen four
  // are mirrored across after every trait edit.
  function syncTraitsToProfile() {
    const profile = editedProfile();
    if (!profile) return;
    const ids = actorTraits().map((t) => t && t.id).filter((id) => id != null);
    if (ids.length) profile.traitIds = ids;
    delete profile._specCache;
  }

  function specOverrides() {
    const profile = editedProfile();
    if (!profile) return {};
    if (!profile._specOverrides) profile._specOverrides = {};
    return profile._specOverrides;
  }

  // The free head start this specialization comes with, whole: what the class
  // the character has and the traits they carry grant it (SpecializationMenu's
  // classStart / traitStart tables). It is handed over for nothing, and it is
  // what a level is measured against , levels above it are bought with points,
  // and levels below it are SOLD BACK for points, which is the only way a
  // character ends up knowing less than their class and traits would give them.
  function specGrant(specId) {
    const actor = editedActor();
    if (!actor) return 1;
    const fromClass = actor.specializationClassBonus ? actor.specializationClassBonus(specId) : 1;
    const fromTraits = actor.specializationTraitBonus ? actor.specializationTraitBonus(specId) : 1;
    return Math.max(1, fromClass || 1, fromTraits || 1);
  }

  // How much of that head start is currently taken (see
  // Game_Actor#specializationGrantedLevel): the whole of it until some of it is
  // traded away.
  function specKeptGrant(specId) {
    const actor = editedActor();
    if (actor && actor.specializationGrantedLevel) return actor.specializationGrantedLevel(specId);
    return specGrant(specId);
  }

  // Effective level: the kept head start, or whatever was bought on top of it.
  function specLevel(specId) {
    const actor = editedActor();
    if (actor && actor.specializationLevel) return actor.specializationLevel(specId);
    return Math.max(specKeptGrant(specId), specOverrides()[specId] || 1);
  }

  // Leaving a level costs that level's number of points, so the ladder from
  // Untrained to Master is 1 + 2 + 3 + 4 = 10 and the last steps are the dear
  // ones. Dropping back down a level refunds exactly what it cost.
  function specStepCost(level) {
    return Math.max(1, level);
  }

  // What standing at `level` is worth, counted from Untrained. The difference
  // between two of these is the price of moving between them, in either
  // direction.
  function specTotalCost(level) {
    let total = 0;
    for (let step = 1; step < level; step++) total += specStepCost(step);
    return total;
  }

  // Every specialization this character has spent or refunded points on: the
  // ones trained above their grant, and the ones whose grant was signed away.
  function touchedSpecIds() {
    const actor = editedActor();
    if (!actor) return [];
    const ids = new Set();
    Object.keys(actor._specLevels || {}).forEach((key) => ids.add(Number(key)));
    Object.keys(actor._specGrantsKept || {}).forEach((key) => ids.add(Number(key)));
    return Array.from(ids);
  }

  // Net spend: what every touched specialization is worth now, less what it was
  // worth for free. A specialization taken below its grant contributes a
  // negative number, which is the refund that pays for another one.
  function specPointsSpent() {
    let spent = 0;
    touchedSpecIds().forEach((specId) => {
      spent += specTotalCost(specLevel(specId)) - specTotalCost(specGrant(specId));
    });
    return spent;
  }

  function specPointsLeft() {
    return SPEC_POINT_BUDGET - specPointsSpent();
  }

  // Writes a specialization's level, from either side of its free grant: below
  // it the grant itself is what is being given up (nothing is trained), at or
  // above it the grant is taken whole and the levels over it are bought.
  function applySpecLevel(specId, level) {
    const actor = editedActor();
    if (!actor) return;
    const grant = specGrant(specId);
    const target = Math.max(1, Math.min(5, level));
    if (actor.setSpecializationGrantKept) {
      actor.setSpecializationGrantKept(specId, target < grant ? target : null);
    }
    if (actor.setSpecializationTrainedLevel) {
      actor.setSpecializationTrainedLevel(specId, target > grant ? target : 1);
    }
    const overrides = specOverrides();
    if (target === grant) delete overrides[specId];
    else overrides[specId] = target;
    const profile = editedProfile();
    if (profile) delete profile._specCache;
  }

  // One click raises a specialization by one level if the points are there;
  // clicking a Master hands every point back, the bought levels and the free
  // head start alike, and leaves it Untrained. Answers false when the step
  // could not be paid for.
  function raiseSpecLevel(specId) {
    const current = specLevel(specId);
    if (current >= 5) {
      applySpecLevel(specId, 1);
      return true;
    }
    if (specStepCost(current) > specPointsLeft()) return false;
    applySpecLevel(specId, current + 1);
    return true;
  }

  // The other direction, which is how a free level is turned into points spent
  // elsewhere. Answers false at Untrained, where there is nothing left to give.
  function lowerSpecLevel(specId) {
    const current = specLevel(specId);
    if (current <= 1) return false;
    applySpecLevel(specId, current - 1);
    return true;
  }

  // Everything the character was given back to what it was given as, and every
  // point back in hand. The class and the traits are what the free grants are
  // read off, so changing either makes every trade made against the old ones
  // meaningless: the budget starts again rather than being patched up.
  function resetSpecPoints() {
    const actor = editedActor();
    if (!actor) return;
    Object.keys(actor._specLevels || {}).forEach((key) => {
      actor.setSpecializationTrainedLevel(Number(key), 1);
    });
    if (actor.clearSpecializationGrantsKept) actor.clearSpecializationGrantsKept();
    const profile = editedProfile();
    if (profile) {
      profile._specOverrides = {};
      delete profile._specCache;
    }
    // The budget now stands against whatever the build is right now, so a
    // reset made from inside the panel is not taken for a change on the way
    // back in.
    Session.specBuild = specBuildSignature();
  }

  // The class and the trait set the current spend was budgeted against. A
  // change to either resets the points (see resetSpecPoints).
  function specBuildSignature() {
    const actor = editedActor();
    if (!actor) return "";
    const classId = actor.currentClass() ? actor.currentClass().id : 0;
    const traits = actorTraits()
      .map((trait) => trait && trait.id)
      .filter((id) => id != null)
      .sort((a, b) => a - b);
    return classId + ":" + traits.join(",");
  }

  // Resets the budget when, and only when, the build it was spent against has
  // moved. Called on every return into the panel (a class browser or trait
  // selector visit rebuilds the scene) and after the in-panel trait reroll.
  function resetSpecPointsIfBuildChanged() {
    const signature = specBuildSignature();
    if (Session.specBuild === signature) return false;
    // Nothing to reset the first time a member is opened: the signature is
    // simply being recorded.
    const known = Session.specBuild !== null;
    Session.specBuild = signature;
    if (known) resetSpecPoints();
    return known;
  }

  // Spend the whole budget at random, on top of whatever the class and traits
  // already grant: grants are taken whole, only levels above them are bought.
  function randomizeSpecializations() {
    const actor = editedActor();
    if (!actor || !window.Specializations || !window.Specializations.ready) return;
    resetSpecPoints();
    const pool = window.Specializations.list;
    if (!pool.length) return;
    // Each pass buys one level of a random specialization it can still afford.
    // The guard covers the case where nothing left in the pool fits the change.
    let guard = pool.length * 8;
    while (specPointsLeft() > 0 && guard-- > 0) {
      const spec = pool[Math.floor(Math.random() * pool.length)];
      const current = specLevel(spec.id);
      if (current >= 5 || specStepCost(current) > specPointsLeft()) continue;
      applySpecLevel(spec.id, current + 1);
    }
  }

  function randomName() {
    const actor = editedActor();
    if (!actor || !window.generateSeededMarkovName) return;
    const seed = (Date.now() + actor.actorId() * 7919) >>> 0;
    try {
      const name = window.generateSeededMarkovName(
        seed & 0xffff, (seed >>> 16) & 0xffff, actor.actorId(),
        "names", // i18n-ignore: TextGen database id
        2, 4, 12
      );
      if (!name || name === window.T("Markov.unknownName")) return;
      const previous = actor.name();
      actor.setName(name.charAt(0).toUpperCase() + name.slice(1));
      carryProfileToNewName(previous, actor.name());
      Session.profileName = actor.name();
    } catch (e) {
      // No generator: the character keeps the name it has.
    }
  }

  function rerollBackstory() {
    const actor = editedActor();
    if (!actor || !window.NPCHistSim || !window.NPCHistSim.rerollBackstory) return;
    window.NPCHistSim.rerollBackstory(actor.name());
  }

  function rerollLife() {
    const actor = editedActor();
    if (!actor || !window.NPCLifeSim || !window.NPCLifeSim.rerollLifeRecord) return;
    const profile = editedProfile();
    window.NPCLifeSim.rerollLifeRecord(actor.name(), profile ? profile._homeGroupName : null);
  }

  function pick(list) {
    return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  // "Surprise me": every field the editor owns, rolled at once. The heavier
  // editors (sprite, class browser, creature builder) are not opened; their
  // fields are filled with the same randomizers the wizard's own random paths
  // use, so this is a complete character and not a half-filled sheet.
  // `keepBuild` skips the one step that changes what the character mechanically
  // is (their class, out of the sentient roster; a creature's archetype is
  // never touched here at all, only the creature builder sets it), so the
  // "keep kind & class" row can reroll everything else about a character
  // without disturbing the build the player already settled on.
  function randomizeEverything(opts) {
    const keepBuild = !!(opts && opts.keepBuild);
    const actor = editedActor();
    if (!actor) return;
    randomName();
    applyGender(Math.floor(Math.random() * 4));
    if (!keepBuild && !isCreature()) {
      // A person is rolled out of the sentient roster (1-62) alone; Feral and
      // the classes above it are a creature's own.
      const chosen = pick(window.CreatureClasses.sentientRoster());
      if (chosen) {
        actor.changeClass(chosen, true);
        if (window.equipRandomCompatibleWeapon) window.equipRandomCompatibleWeapon(actor, chosen);
      }
    }
    if (window.selectRandomSpriteForActor) window.selectRandomSpriteForActor(actor.actorId());
    if (window.selectRandomBustForActor && actor.portraitMode() !== "model" && !actor.vnBust()) {
      window.selectRandomBustForActor(actor.actorId());
    }
    if (window.randomizeTraitsForActor) {
      window.randomizeTraitsForActor(actor.actorId());
      syncTraitsToProfile();
    }
    // After the class and the traits, so the points are spent on top of the
    // floors those two just settled.
    randomizeSpecializations();
    randomizeBloodType();
    // The hometown is no longer a row the player picks, but NPCSociety and the
    // dossiers still read $gameSystem._ccHometown, so it is rolled here.
    const towns = hometownList();
    if (towns.length) $gameSystem._ccHometown = pick(towns);
    const band = pick(AGE_BANDS);
    applyAge(band.lo + Math.floor(Math.random() * (band.hi - band.lo + 1)));

    const profile = editedProfile();
    const data = societyData();
    const feral = isNonSentient();
    if (profile && data) {
      if (data.personalities && data.personalities.length) {
        profile.personalityIndex = Math.floor(Math.random() * data.personalities.length);
      }
      // Nothing a beast does not have is rolled for it, and anything a
      // previous pass over this sheet left behind is cleared: the rows are
      // gone from the panel, so a stale creed would be unreachable as well as
      // wrong.
      if (feral) {
        clearSocialTies(profile);
      } else {
        if (data.ideologies && data.ideologies.length) {
          setIdeology(profile, Math.floor(Math.random() * data.ideologies.length));
        }
        if (data.factions && data.factions.length) {
          profile.factionIndex = Math.random() < 0.25
            ? Math.floor(Math.random() * data.factions.length) : -1;
        }
        applyWealth(profile, Math.floor(Math.random() * 5));
      }
      profile.moralityScore = Math.floor(Math.random() * 201) - 100;
    }
    const nations = nationList();
    if (profile && nations.length) profile._birthplaceOverride = pick(nations);
    const bank = orientationBank();
    const sexual = pick(bank.sexual || []);
    const romantic = pick(bank.romantic || []);
    if (sexual) applyOrientation("sexual", sexual.key);
    if (romantic) applyOrientation("romantic", romantic.key);
    rerollBackstory();
    rerollLife();
  }

  //===========================================================================
  // Rows
  //===========================================================================

  // A row is { id, label, value, kind }. `kind` is only used for the arrow
  // glyph: "open" leaves the panel for one of the wizard's own editors, "pick"
  // opens an in-panel list, "run" does something immediately.
  function buildSections() {
    const actor = editedActor();
    if (!actor) return [];
    const profile = editedProfile();
    const data = societyData();
    const creature = isCreature();
    const feral = isNonSentient();
    // Enforced here rather than on the class row's callback: the class can be
    // changed from the wizard's own selector, which returns to this panel
    // without telling it what happened. The panel is rebuilt on every return,
    // so this is the one place that always sees the current class, and the
    // clear is idempotent.
    if (feral) clearSocialTies(profile);
    const sections = [];

    // Asked first, ahead of name, class or anything else: a creed is the
    // lens the rest of the sheet is read through, so it is what the panel
    // opens on rather than one more row buried in Standing. A beast is not
    // asked at all , it has no creed to hold.
    if (!feral) {
      sections.push({
        title: T("detailed.section.ideology"),
        rows: [
          {
            id: "ideology", label: T("detailed.row.ideology"),
            value: ideologyName(profile ? window.NPCShared.ideologyFor(profile) : null), kind: "pick",
          },
        ],
      });
      // Only offered where there is a ballot to join: a hometown whose nation
      // stands no parties leaves the row off the sheet entirely.
      if (partyChoices(profile).length) {
        sections[sections.length - 1].rows.push({
          id: "party", label: T("detailed.row.party"),
          value: declaredPartyLabel(profile), kind: "pick",
        });
      }
    }

    const identity = [
      { id: "name", label: T("detailed.row.name"), value: actor.name(), kind: "open" },
      { id: "nameRandom", label: T("detailed.row.nameRandom"), value: "", kind: "run" },
      {
        id: "kind", label: T("detailed.row.kind"),
        value: creature ? T("detailed.kind.creature") : T("detailed.kind.humanoid"), kind: "pick",
      },
    ];
    if (creature) {
      identity.push({
        id: "archetype", label: T("detailed.row.archetype"),
        value: archetypeLabel(actor), kind: "open",
      });
    }
    identity.push(
      { id: "gender", label: TE("genderLbl"), value: genderLabel(actor.gender()), kind: "pick" },
      {
        id: "class", label: T("detailed.row.class"),
        value: actor.currentClass() ? actor.currentClass().name : "", kind: "open",
      },
      { id: "level", label: T("detailed.row.level"), value: String(actor.level), kind: "pick" }
    );
    identity.push({ id: "appearance", label: T("detailed.row.appearance"), value: "", kind: "open" });
    // Art style is not a row: a person wears a hand-drawn bust, a creature
    // wears its sculpted 3D model, so only a creature is offered the sculptor.
    if (model3DAvailable() && creature) {
      identity.push({ id: "model3d", label: T("detailed.row.model3d"), value: "", kind: "open" });
    }
    sections.push({ title: T("detailed.section.identity"), rows: identity });

    const nationValue = profile && profile._birthplaceOverride ? nationLabel(profile._birthplaceOverride) : "";
    sections.push({
      title: T("detailed.section.origins"),
      rows: [
        {
          id: "age", label: T("detailed.row.age"),
          value: currentAge() != null ? `${currentAge()} ${TE("yearsAbbr")}` : T("detailed.unset"),
          kind: "pick",
        },
        {
          id: "birthNation", label: T("detailed.row.birthNation"),
          value: nationValue || T("detailed.unset"), kind: "pick",
        },
      ],
    });

    const traitList = actorTraits().map(traitName).join(", ");
    sections.push({
      title: T("detailed.section.talents"),
      rows: [
        { id: "traits", label: TE("traits"), value: traitList, kind: "open" },
        { id: "traitsRandom", label: T("detailed.row.traitsRandom"), value: "", kind: "run" },
      ],
    });

    // Its own section, and deliberately downstream of both the class (Identity)
    // and the traits (Talents): those two are what the free head starts are read
    // off, so changing either hands every point back and the spend has to be
    // made again. Spending first and picking a class after would only be work
    // thrown away.
    sections.push({
      title: TE("specializations"),
      rows: [
        {
          id: "specializations", label: T("detailed.row.specPoints"),
          // The points left lead the row: they are what the section is for, and
          // the summary of what they went on follows them.
          value: T("detailed.specPointsShort", { left: specPointsLeft(), total: SPEC_POINT_BUDGET }) +
            " · " + specSummary(),
          kind: "pick",
        },
        { id: "specsRandom", label: T("detailed.row.specsRandom"), value: "", kind: "run" },
      ],
    });

    sections.push({
      title: T("detailed.section.biology"),
      rows: [
        { id: "bloodType", label: T("detailed.row.bloodType"), value: bloodTypeLabel(actor), kind: "pick" },
        { id: "bloodTypeRandom", label: T("detailed.row.bloodTypeRandom"), value: "", kind: "run" },
      ],
    });

    const personalities = (data && data.personalities) || [];
    const ideologies = (data && data.ideologies) || [];
    const factions = (data && data.factions) || [];
    // A beast keeps its temperament (a personality is a disposition, which an
    // animal plainly has) and its morality (whether it is vicious or gentle),
    // and loses the two rows that are a society's business: the banner it
    // stands under and the money it was born into.
    const societyRows = [
      {
        id: "personality", label: T("detailed.row.personality"),
        value: personalityName(personalities[profile ? profile.personalityIndex : -1]), kind: "pick",
      },
    ];
    if (!feral) {
      societyRows.push(
        {
          id: "faction", label: T("detailed.row.faction"),
          value: (profile && profile.factionIndex >= 0)
            ? factionName(factions[profile.factionIndex]) : T("detailed.none"),
          kind: "pick",
        },
        {
          id: "wealth", label: T("detailed.row.wealth"),
          // Named with the money it brings to the party purse, since that is
          // what choosing it actually does (see wealthStartingMoney in
          // CharacterCreation.js).
          value: `${wealthLabel(wealthTier(profile))} · ${wealthMoneyLabel(wealthTier(profile))}`,
          kind: "pick",
        }
      );
    }
    societyRows.push({
      id: "morality", label: T("detailed.row.morality"),
      value: `${moralityLabel(profile ? profile.moralityScore : 0)} (${(profile && profile.moralityScore) || 0})`,
      kind: "pick",
    });
    sections.push({ title: T("detailed.section.society"), rows: societyRows });

    sections.push({
      title: T("detailed.section.romance"),
      rows: [
        {
          id: "romantic", label: T("detailed.row.romantic"),
          value: orientationName(currentOrientation("romantic")) || T("detailed.rolled"), kind: "pick",
        },
        {
          id: "sexual", label: T("detailed.row.sexual"),
          value: orientationName(currentOrientation("sexual")) || T("detailed.rolled"), kind: "pick",
        },
        {
          id: "reproduction", label: T("detailed.row.reproduction"),
          value: reproductionLabel(reproductionValue()), kind: "pick",
        },
      ],
    });

    sections.push({
      title: T("detailed.section.history"),
      rows: [
        { id: "rerollBackstory", label: T("detailed.row.rerollBackstory"), value: "", kind: "run" },
        { id: "rerollLife", label: T("detailed.row.rerollLife"), value: "", kind: "run" },
      ],
    });

    sections.push({
      title: T("detailed.section.finish"),
      rows: [
        { id: "randomizeKeepBuild", label: T("detailed.row.randomizeKeepBuild"), value: "", kind: "run" },
        { id: "randomizeAll", label: T("detailed.row.randomizeAll"), value: "", kind: "run" },
        { id: "done", label: T("detailed.row.done"), value: "", kind: "run", primary: true },
      ],
    });

    return sections;
  }

  function genderLabel(value) {
    return [T("male"), T("female"), T("nonBinary"), T("cocoon")][value] || T("male");
  }

  function reproductionLabel(value) {
    const key = "genital." + (String(value) === "-1" ? "none" : String(value));
    return window.T.has("Empathize." + key) ? TE(key) : T("detailed.unset");
  }

  function bloodTypeLabel(actor) {
    const BTS = window.BloodTypeService;
    if (!BTS || !actor) return T("detailed.unset");
    const entry = BTS.forActor(actor);
    return entry ? `${entry.type} (${entry.rarity})` : T("detailed.unset");
  }

  function moralityLabel(score) {
    const value = Number(score) || 0;
    if (value < -60) return TE("evil");
    if (value < -20) return TE("dishonest");
    if (value < 20) return TE("neutral");
    if (value < 60) return TE("honest");
    return TE("virtuous");
  }

  function archetypeLabel(actor) {
    const archetype = actor && actor._currentArchetype;
    if (!archetype) return T("detailed.unset");
    if (!window.HealthCore || !window.HealthCore.getArchetypeDisplayName) return String(archetype);
    return String(archetype).split("/").map((part) => {
      const key = part.trim();
      return key ? window.HealthCore.getArchetypeDisplayName(key) : "";
    }).filter(Boolean).join(" / ") || String(archetype);
  }

  // What this character is actually good at, best first. Only what they are
  // trained in is named: a specialization whose free head start was signed away
  // has been touched, but the character is Untrained in it and there is nothing
  // to boast about.
  function specSummary() {
    if (!window.Specializations || !window.Specializations.ready) return T("detailed.unset");
    const trained = touchedSpecIds()
      .map((specId) => ({ specId: specId, level: specLevel(specId) }))
      .filter((entry) => entry.level > 1)
      .sort((a, b) => b.level - a.level);
    if (!trained.length) return T("detailed.unset");
    const named = trained.slice(0, 3).map((entry) => {
      const spec = window.Specializations.byId.get(entry.specId);
      return spec ? window.Specializations.displayName(spec) : "";
    }).filter(Boolean).join(", ");
    return named + (trained.length > 3 ? ` +${trained.length - 3}` : "");
  }

  //===========================================================================
  // Pickers
  //===========================================================================

  // One specialization as a picker row. Where the character stands, what the
  // next level up costs, and what their class and traits handed them for free,
  // which is the part the "−" chip can sell back.
  function specOption(spec) {
    const level = specLevel(spec.id);
    const grant = specGrant(spec.id);
    const cost = level >= 5
      ? T("detailed.specRefund")
      : T("detailed.specCost", { n: specStepCost(level) });
    const granted = grant > 1
      ? " " + T("detailed.specGranted", { level: window.Specializations.levelName(grant) })
      : "";
    return {
      key: String(spec.id),
      label: window.Specializations.displayName(spec),
      sub: `${window.Specializations.levelName(level)} · ${cost}${granted}`,
      disabled: level < 5 && specStepCost(level) > specPointsLeft(),
      // Anything above Untrained can be given back, whether it was bought or
      // handed over, and the points go back in the pot.
      lower: level > 1 ? T("detailed.specLower", { n: specStepCost(level - 1) }) : null,
    };
  }

  // Every picker answers with a flat list of { key, label, sub }. The scene
  // keeps the open picker in _ccPicker and calls back into apply() with the key.
  // `query` is whatever is in the picker's search box: only the specialization
  // list looks at it (a search there crosses categories), and everything else
  // is filtered on the answer rather than building a different one.
  function buildPicker(id, arg, query) {
    const bank = orientationBank();
    const data = societyData();
    switch (id) {
      case "kind":
        return {
          title: T("detailed.row.kind"),
          options: [
            { key: "humanoid", label: T("detailed.kind.humanoid"), sub: T("detailed.kind.humanoidDesc") },
            { key: "creature", label: T("detailed.kind.creature"), sub: T("detailed.kind.creatureDesc") },
          ],
        };
      case "gender":
        return {
          title: TE("genderLbl"),
          options: [0, 1, 2, 3].map((v) => ({ key: String(v), label: genderLabel(v) })),
        };
      case "level":
        return {
          title: T("detailed.row.level"),
          options: LEVEL_CHOICES.map((v) => ({ key: String(v), label: `${TE("levelAbbr")}${v}` })),
        };
      case "bloodType": {
        const BTS = window.BloodTypeService;
        const table = BTS ? BTS.list() : [];
        return {
          title: T("detailed.row.bloodType"),
          options: table.map((raw) => {
            const entry = BTS.describe(raw.id);
            return { key: entry.id, label: `${entry.type} (${entry.rarity})`, sub: entry.name };
          }),
        };
      }
      case "age":
        return {
          title: T("detailed.row.age"),
          options: AGE_BANDS.map((band) => ({
            key: band.key,
            label: T("choice." + band.key + ".name"),
            sub: T("choice." + band.key + ".desc"),
          })).concat([{ key: "__random", label: T("detailed.random") }]),
        };
      case "birthNation":
        return {
          title: T("detailed.row.birthNation"),
          options: [{ key: "__random", label: T("detailed.random") }].concat(
            nationList().map((nation) => ({ key: nation, label: nationLabel(nation) }))
          ),
        };
      case "personality":
        return {
          title: T("detailed.row.personality"),
          options: ((data && data.personalities) || []).map((entry, index) => ({
            key: String(index), label: personalityName(entry), icon: entry.iconIndex || 4,
          })),
        };
      case "ideology":
        return {
          title: T("detailed.row.ideology"),
          options: ((data && data.ideologies) || []).map((entry, index) => ({
            key: String(index), label: ideologyName(entry), icon: 186,
          })),
        };
      case "party":
        return {
          title: T("detailed.row.party"),
          note: T("detailed.partyNote"),
          options: [{ key: "__none", label: T("detailed.none"), icon: 187 }].concat(
            partyChoices(editedProfile()).map((entry) => ({
              key: entry.name, label: entry.name, icon: 187,
              sub: entry.exact ? T("detailed.partyMatch") : "",
            }))
          ),
        };
      case "faction":
        return {
          title: T("detailed.row.faction"),
          options: [{ key: "-1", label: T("detailed.none") }].concat(
            ((data && data.factions) || []).map((entry, index) => ({
              key: String(index), label: factionName(entry), icon: entry.iconIndex || 187,
            }))
          ),
        };
      case "wealth":
        return {
          title: T("detailed.row.wealth"),
          note: T("detailed.wealthNote"),
          options: [0, 1, 2, 3, 4].map((tier) => ({
            key: String(tier),
            label: wealthLabel(tier),
            sub: wealthMoneyLabel(tier),
            icon: 314,
          })),
        };
      case "morality":
        return {
          title: T("detailed.row.morality"),
          options: [
            { key: "-80", label: TE("evil") },
            { key: "-40", label: TE("dishonest") },
            { key: "0", label: TE("neutral") },
            { key: "40", label: TE("honest") },
            { key: "80", label: TE("virtuous") },
          ],
        };
      case "romantic":
      case "sexual": {
        const list = bank[id === "sexual" ? "sexual" : "romantic"] || [];
        return {
          title: id === "sexual" ? T("detailed.row.sexual") : T("detailed.row.romantic"),
          options: list.map((entry) => ({
            key: entry.key,
            label: orientationName(entry),
            sub: dbText(entry.desc),
          })),
        };
      }
      case "reproduction":
        return {
          title: T("detailed.row.reproduction"),
          options: [-1, 0, 1, 2, 3, 4].map((v) => ({ key: String(v), label: reproductionLabel(v) })),
        };
      case "specializations": {
        // Two levels: the category list, then the specializations inside it.
        if (!window.Specializations || !window.Specializations.ready) {
          return { title: TE("specializations"), options: [] };
        }
        // The points a character has to spend are only ever shown here, where
        // they are being spent.
        const budget = T("detailed.specPoints", { left: specPointsLeft(), total: SPEC_POINT_BUDGET });
        if (!arg) {
          // Searching the categories would only ever find one of seventeen
          // words, which is not what somebody typing "cooking" is after: as
          // soon as there is a query the screen becomes the whole roster of
          // 800, and the categories are the way in when there is not.
          if (query) {
            return {
              title: T("detailed.pickCategory"),
              note: budget,
              options: window.Specializations.list.map(specOption),
            };
          }
          const categories = window.Specializations.categories && window.Specializations.categories.length
            ? window.Specializations.categories
            : [...new Set(window.Specializations.list.map((s) => s.category).filter(Boolean))];
          return {
            title: T("detailed.pickCategory"),
            note: budget,
            options: [{ key: "__randomize", label: T("detailed.row.specsRandom"), sub: T("detailed.specsRandomHint") }]
              .concat(categories.map((category) => ({ key: category, label: category }))),
          };
        }
        return {
          title: arg,
          arg: arg,
          note: budget,
          options: window.Specializations.list
            .filter((spec) => spec.category === arg)
            .map(specOption),
        };
      }
      default:
        return null;
    }
  }

  // Applies a picked option. Answers true when the picker should stay open
  // (the specialization list, which is cycled level by level).
  function applyPick(id, key, arg) {
    const actor = editedActor();
    const profile = editedProfile();
    switch (id) {
      case "kind":
        applyKind(key === "creature");
        if (key === "creature") openCreatureBuilder();
        return false;
      case "gender":
        applyGender(Number(key));
        return false;
      case "level":
        applyLevel(Number(key));
        return false;
      case "bloodType":
        applyBloodType(key);
        return false;
      case "age": {
        const band = key === "__random" ? pick(AGE_BANDS) : AGE_BANDS.find((b) => b.key === key);
        if (band) applyAge(band.lo + Math.floor(Math.random() * (band.hi - band.lo + 1)));
        return false;
      }
      case "birthNation": {
        if (!profile) return false;
        const nations = nationList();
        profile._birthplaceOverride = key === "__random" ? pick(nations) : key;
        rerollBackstory();
        return false;
      }
      case "personality":
        if (profile) profile.personalityIndex = Number(key);
        return false;
      case "ideology":
        if (profile) {
          setIdeology(profile, Number(key));
          // A declaration that no longer answers to the new creed is dropped
          // rather than left standing under a belief it contradicts.
          if (profile.declaredPartyName &&
              !partyChoices(profile).some((p) => p.name === profile.declaredPartyName)) {
            applyParty(profile, null);
          }
        }
        return false;
      case "party":
        applyParty(profile, key === "__none" ? null : key);
        return false;
      case "faction":
        if (profile) profile.factionIndex = Number(key);
        return false;
      case "wealth":
        applyWealth(profile, Number(key));
        return false;
      case "morality":
        if (profile) profile.moralityScore = Number(key);
        return false;
      case "romantic":
      case "sexual":
        applyOrientation(id === "sexual" ? "sexual" : "romantic", key);
        return false;
      case "reproduction":
        applyReproduction(Number(key));
        return false;
      case "specializations": {
        if (!arg && !/^\d+$/.test(key)) {
          if (key === "__randomize") {
            randomizeSpecializations();
            return true; // stay on the category list, points readout refreshes
          }
          return { arg: key }; // drilled into a category
        }
        // A specialization, either from inside a category or straight off the
        // search results the category screen shows while a query is typed
        // (buildPicker), which is why a numeric key is taken here too.
        if (!raiseSpecLevel(Number(key))) SoundManager.playBuzzer();
        return true; // stay in the list so several can be raised in a row
      }
      default:
        return false;
    }
  }

  //===========================================================================
  // Sub-editors (the wizard's own screens, pushed over the panel)
  //===========================================================================

  // The wizard's resume point must stay unset while the panel is open: the
  // sprite grid, the creature builder and the class browser all read it to
  // decide whether they are being driven by a paused wizard, and here they are
  // not, they are being driven by this editor and must simply pop back to it.
  function clearWizardResume() {
    const SC = window.Scene_CharacterCreation;
    if (!SC) return;
    SC._interruptedStep = -1;
    // A chain of screens the wizard was still owed belongs to the run this
    // editor took over from; leaving one queued would have the next rebuilt
    // wizard open it out of nowhere.
    if (SC.clearSubScreens) SC.clearSubScreens();
  }

  function openNameInput() {
    const actor = editedActor();
    if (!actor || typeof Scene_Name === "undefined") return;
    Session.profileName = actor.name();
    clearWizardResume();
    SceneManager.push(Scene_Name);
    SceneManager.prepareNextScene(actor.actorId(), NAME_MAX_LENGTH);
  }

  function openSpriteGrid() {
    if (!window.Scene_SpriteGridSelector) return;
    clearWizardResume();
    SceneManager.push(window.Scene_SpriteGridSelector);
    if (SceneManager._nextScene && SceneManager._nextScene.setActor) {
      SceneManager._nextScene.setActor(Session.actorId);
    }
  }

  function openBustGallery() {
    if (!window.Scene_BustSelector) return;
    clearWizardResume();
    // Opened over this panel rather than over the sprite grid, so confirming
    // pops once and lands back here.
    window.Scene_BustSelector._confirmPops = 1;
    SceneManager.push(window.Scene_BustSelector);
    if (SceneManager._nextScene && SceneManager._nextScene.setActor) {
      SceneManager._nextScene.setActor(Session.actorId);
    }
  }

  function open3DModel() {
    if (!model3DAvailable()) return;
    clearWizardResume();
    window.Scene_CC3DModel.setup(Session.actorId, null, { returnByPop: true, confirmPops: 1 });
    SceneManager.push(window.Scene_CC3DModel);
  }

  function openClassBrowser() {
    if (!window.Scene_ClassSelection) return;
    clearWizardResume();
    // A creature's roster is the one its archetypes support, in the two groups
    // the browser heads ("Non Sentient" / "Sentient"); a humanoid gets the
    // whole sentient list (the archetype-of-classes shortcut is the quick
    // flow's).
    if (isCreature() && window.CreatureClasses) {
      const actor = editedActor();
      const archetypes = String((actor && actor._currentArchetype) || "").split("/").map((s) => s.trim());
      window.$ccArchetypeClassFilter =
        window.CreatureClasses.playableGroupsForArchetypes(archetypes[0] || null, archetypes[1] || null);
    } else {
      window.$ccArchetypeClassFilter = null;
    }
    window.$ccCreatureClassFlow = null;
    window.$ccClassReturnByPop = true;
    SceneManager.push(window.Scene_ClassSelection);
  }

  function openTraitSelector() {
    if (!window.Scene_TraitSelector) return;
    clearWizardResume();
    window.Scene_TraitSelector.prepare(false, Session.actorId);
    SceneManager.push(window.Scene_TraitSelector);
  }

  function openCreatureBuilder() {
    const builder = window.Scene_CreateCreature;
    if (!builder) return;
    // With no paused wizard the builder finishes by popping, which lands back
    // in this panel instead of routing into the class browser.
    clearWizardResume();
    if (builder.setTargetActorId) builder.setTargetActorId(Session.actorId);
    SceneManager.push(builder);
  }

  //===========================================================================
  // Public entry point
  //===========================================================================

  window.CharacterCreationFull = {
    // The wizard only offers Detailed mode when everything it leans on is here.
    isAvailable() {
      return !!(window.NPCEmpathize && window.NPCEmpathize.Scene_NPCEmpathize && window.NPCSocietyRegistry);
    },

    isEditing() {
      return Session.active;
    },

    // Hand a party member over to the panel. `memberIndex` is 0-based; the
    // actor id is one more than that, the same convention the wizard uses.
    open(memberIndex) {
      const CCSteps = window.CCSteps || {};
      Session.active = true;
      Session.memberIndex = memberIndex || 0;
      Session.actorId = Session.memberIndex + 1;
      Session.tab = CC_TAB;
      // interruptedStep + 1 is the landing step: the add-member prompt.
      Session.resumeStep = CCSteps.BIRTHDATE != null ? CCSteps.BIRTHDATE : -1;
      const actor = editedActor();
      Session.profileName = actor ? actor.name() : "";
      // A member of their own: whatever the one before them spent their points
      // against says nothing about this one.
      Session.specBuild = null;
      // The creature switch can still be carrying a previous playthrough's
      // answer, so it is squared with the class this member actually has
      // before the first row is drawn.
      if (actor && $gameSwitches) {
        const isCreatureClass = !!(actor.currentClass() && actor.currentClass().id === CREATURE_CLASS_ID);
        $gameSwitches.setValue(CREATURE_SWITCHES[Session.memberIndex] || 77, isCreatureClass);
        if (window.Scene_CharacterCreation) window.Scene_CharacterCreation._isCreatureMode = isCreatureClass;
      }
      // A member arriving here has whatever the wizard left them with; make
      // sure the society profile the panel edits exists before it renders.
      editedProfile();
      clearWizardResume();
      Scene_NPCEmpathize._eventId = null;
      Scene_NPCEmpathize._actorId = Session.actorId;
      Scene_NPCEmpathize._entity = null;
      Scene_NPCEmpathize._initialTab = CC_TAB;
      Scene_NPCEmpathize._returnStack.length = 0;
      SceneManager.push(Scene_NPCEmpathize);
    },

    // The panel is closing: hand the wizard back its resume point so it lands
    // on the add-member prompt for this member.
    finish() {
      if (!Session.active) return;
      // The chosen traits live on the actor; the panel reads them off the
      // society profile, so they are mirrored across one last time. Money and
      // the starting kit are handed out by the wizard at the end of creation,
      // so nothing is granted here.
      syncTraitsToProfile();
      Session.active = false;
      if (window.Scene_CharacterCreation && Session.resumeStep >= 0) {
        window.Scene_CharacterCreation._interruptedStep = Session.resumeStep;
        // Forward, not Back: the editor was finished, not backed out of.
        window.Scene_CharacterCreation._resumeOnStep = false;
      }
    },
  };

  //===========================================================================
  // Scene_NPCEmpathize extension
  //===========================================================================

  const _create = Scene_NPCEmpathize.prototype.create;
  Scene_NPCEmpathize.prototype.create = function () {
    if (isEditing(this)) {
      // The panel is rebuilt from scratch every time a sub-editor pops back:
      // restore the tab that was open, reconcile a rename, and take the
      // wizard's resume point back off the table.
      this._activeTab = Session.tab || CC_TAB;
      this._ccPicker = null;
      clearWizardResume();
      // Spent the moment the class browser hands back; left set it would send
      // an ordinary class selection popping instead of resuming the wizard.
      window.$ccClassReturnByPop = false;
      const actor = editedActor();
      if (actor && Session.profileName && actor.name() !== Session.profileName) {
        carryProfileToNewName(Session.profileName, actor.name());
        Session.profileName = actor.name();
      }
      syncTraitsToProfile();
      // A class change (the class browser) or a new trait set moves every free
      // grant the points were spent against, so the budget starts over.
      resetSpecPointsIfBuildChanged();
    }
    _create.call(this);
  };

  // The editor tab replaces the chat (there is nobody to talk to yet) and the
  // More list (its only entry, Leave, is the editor's own Done row).
  const _tabOrder = Scene_NPCEmpathize.prototype._tabOrder;
  Scene_NPCEmpathize.prototype._tabOrder = function () {
    if (!isEditing(this) || this._entity) return _tabOrder.call(this);
    return [CC_TAB, "info", "background", "biologics", "health", "romance", "lifeHistory", "wiki"];
  };

  const _buildTabsHTML = Scene_NPCEmpathize.prototype._buildTabsHTML;
  Scene_NPCEmpathize.prototype._buildTabsHTML = function (T2) {
    if (!isEditing(this) || this._entity) return _buildTabsHTML.call(this, T2);
    const labels = {
      info: T2.info, background: T2.history, biologics: T2.biologicsTab,
      health: T2.healthTab, romance: T2.romanceTab, lifeHistory: T2.lifeHistory, wikiTab: T2.wikiTab,
    };
    return this._buildBackBtnHTML(T2) + this._tabOrder().map((id) => {
      const label = id === CC_TAB ? T("detailed.tab") : (id === "wiki" ? labels.wikiTab : labels[id]);
      return `<div class="npc-tab${this._activeTab === id ? " active" : ""}"
           onmousedown="event.stopPropagation();SceneManager._scene._setTab('${id}')">${esc(label)}</div>`;
    }).join("");
  };

  const _setTab = Scene_NPCEmpathize.prototype._setTab;
  Scene_NPCEmpathize.prototype._setTab = function (tab) {
    this._ccPicker = null;
    if (this._ccBar) this._ccBar.collapseField();
    if (isEditing(this)) Session.tab = tab;
    _setTab.call(this, tab);
  };

  // The picker's search box, shared with every other long list in the game
  // (UI/MenuSearchBar.js) rather than a box of its own: that field already
  // handles focus, the caret and keeping its own keystrokes away from the
  // panel's WASD/arrow navigation, which a hand-rolled input kept getting
  // wrong. One bar is reused for whichever picker is open; a fresh id would
  // only orphan the old one in the module's bar registry.
  function ensureCCBar(scene) {
    if (!window.MenuSearchBar) return null;
    if (!scene._ccBar) {
      scene._ccBar = window.MenuSearchBar.create({
        id: "cc-picker",
        placeholder: T("detailed.search"),
        onChange: () => { scene._contentIndex = 0; scene._render(); },
      });
    }
    return scene._ccBar;
  }

  // The editor page hangs off _buildMoreHTML: the base _render() routes every
  // tab it does not know to it, which is exactly what CC_TAB is.
  const _buildMoreHTML = Scene_NPCEmpathize.prototype._buildMoreHTML;
  Scene_NPCEmpathize.prototype._buildMoreHTML = function (T2) {
    if (!isEditing(this) || this._activeTab !== CC_TAB) return _buildMoreHTML.call(this, T2);
    return this._ccPicker ? this._buildCCPickerHTML() : this._buildCCEditorHTML();
  };

  Scene_NPCEmpathize.prototype._buildCCEditorHTML = function () {
    const actor = editedActor();
    if (!actor) return `<p class="cc-empty-note">${esc(T("detailed.unavailable"))}</p>`;

    let html = `<div class="npc-profile-name">${esc(actor.name())}</div>` +
      `<div class="npc-profile-sub">${esc(T("detailed.title"))}</div>` +
      `<div class="npc-cc-hint">${esc(T("detailed.hint"))}</div>`;

    buildSections().forEach((section) => {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${esc(section.title)}</div>`;
      section.rows.forEach((row) => {
        const arrow = row.kind === "open" ? "›" : row.kind === "pick" ? "▾" : "✦";
        const randBtn = row.kind === "pick" && !RAND_ROW_EXCLUDE.has(row.id)
          ? `<span class="npc-cc-row-rand"
               onmousedown="event.stopPropagation();SceneManager._scene._ccRandomizeRow('${row.id}')">${esc(T("detailed.random"))}</span>`
          : "";
        html += `<div class="npc-cc-row${row.primary ? " npc-cc-row--primary" : ""}"
             onmousedown="event.stopPropagation();SceneManager._scene._ccActivateRow('${row.id}')">
          <span class="npc-cc-row-lbl">${esc(row.label)}</span>
          <span class="npc-cc-row-val">${esc(row.value || "")}</span>
          ${randBtn}
          <span class="npc-cc-row-arrow">${arrow}</span>
        </div>`;
      });
    });
    return html;
  };

  Scene_NPCEmpathize.prototype._buildCCPickerHTML = function () {
    const picker = this._ccPicker;
    const bar = ensureCCBar(this);
    const query = bar ? bar.query : "";
    const data = buildPicker(picker.id, picker.arg, query);
    if (!data) return this._buildCCEditorHTML();

    let html = `<div class="npc-back-btn"
         onmousedown="event.stopPropagation();SceneManager._scene._ccClosePicker()">← ${esc(T("detailed.back"))}</div>` +
      `<div class="npc-sec-hdr npc-sec-hdr--spaced">${esc(data.title)}</div>`;
    // A picker can carry a running total (the specialization point budget),
    // which is the only place those points are ever shown.
    if (data.note) html += `<div class="npc-cc-note">${esc(data.note)}</div>`;
    if (!data.options.length) {
      return html + `<p class="cc-empty-note">${esc(T("detailed.noOptions"))}</p>`;
    }

    // A list long enough to have to be hunted through gets a search box. The
    // nations, the ideologies, the factions and every
    // specialization category are all in the hundreds; the four-option pickers
    // are not, and a box over them would only be in the way.
    const searchable = data.options.length > PICKER_SEARCH_MIN_OPTIONS;
    if (searchable && bar) html += bar.html();
    const matches = searchable && query ? filterOptions(data.options, query) : data.options;
    if (!matches.length) {
      return html + `<p class="cc-empty-note">${esc(T("detailed.noMatches"))}</p>`;
    }
    // Searching the specializations from the category screen has all 800 of
    // them to answer with, and a broad query still leaves hundreds. Only the
    // first screenful is built; anything past that is asking for a better
    // query, not a longer page.
    const options = matches.slice(0, PICKER_MAX_ROWS);
    const hidden = matches.length - options.length;

    options.forEach((option) => {
      // Town and nation keys carry spaces and apostrophes, so the key travels
      // through the inline handler encoded and is decoded on the way back.
      // encodeURIComponent leaves an apostrophe alone, which would close the
      // handler's string literal ("Ma'at City"), so that one is forced.
      const key = encodeURIComponent(String(option.key)).replace(/'/g, "%27");
      // A level that can be given back carries its own chip, the way the
      // editor rows carry their reroll button: the row itself always raises.
      const lowerBtn = option.lower
        ? `<span class="npc-cc-row-rand"
             onmousedown="event.stopPropagation();SceneManager._scene._ccLowerOption('${key}')"
             title="${esc(option.lower)}">−</span>`
        : "";
      html += `<div class="npc-cc-row${option.disabled ? " npc-cc-row--spent" : ""}"
           onmousedown="event.stopPropagation();SceneManager._scene._ccPickOption('${key}')">
        <span class="npc-cc-row-lbl">${option.icon ? iconSpan(option.icon, 16) + " " : ""}${esc(option.label)}</span>
        ${option.sub ? `<span class="npc-cc-row-sub">${esc(option.sub)}</span>` : ""}
        ${lowerBtn}
        <span class="npc-cc-row-arrow">✓</span>
      </div>`;
    });
    if (hidden > 0) {
      html += `<div class="npc-cc-hint">${esc(T("detailed.moreMatches", { n: hidden }))}</div>`;
    }
    return html;
  };

  //---------------------------------------------------------------------------
  // Row + picker handling
  //---------------------------------------------------------------------------

  Scene_NPCEmpathize.prototype._ccActivateRow = function (id) {
    if (!isEditing(this)) return;
    switch (id) {
      case "name": openNameInput(); return;
      case "nameRandom": randomName(); break;
      case "archetype": openCreatureBuilder(); return;
      case "class": openClassBrowser(); return;
      case "appearance": openSpriteGrid(); return;
      case "model3d": open3DModel(); return;
      case "traits": openTraitSelector(); return;
      case "traitsRandom":
        if (window.randomizeTraitsForActor) window.randomizeTraitsForActor(Session.actorId);
        syncTraitsToProfile();
        resetSpecPointsIfBuildChanged();
        break;
      case "specsRandom": randomizeSpecializations(); break;
      case "bloodTypeRandom": randomizeBloodType(); break;
      case "rerollBackstory": rerollBackstory(); break;
      case "rerollLife": rerollLife(); break;
      case "randomizeKeepBuild": randomizeEverything({ keepBuild: true }); break;
      case "randomizeAll": randomizeEverything(); break;
      case "done": this._leave(true); return;
      default:
        if (buildPicker(id, null)) {
          this._ccPicker = { id: id, arg: null };
          if (this._ccBar) this._ccBar.resetQuiet();
          this._contentIndex = 0;
        }
    }
    this._render();
  };

  // The small random button beside a "pick" row: rolls one option out of that
  // row's own picker list and applies it directly, the same way choosing it
  // by hand would, without ever opening the picker overlay.
  Scene_NPCEmpathize.prototype._ccRandomizeRow = function (id) {
    if (!isEditing(this)) return;
    const data = buildPicker(id, null);
    const choices = data ? data.options.filter((o) => !o.disabled) : [];
    if (!choices.length) return;
    const option = choices[Math.floor(Math.random() * choices.length)];
    applyPick(id, option.key, null);
    this._render();
  };

  Scene_NPCEmpathize.prototype._ccPickOption = function (encodedKey) {
    if (!isEditing(this) || !this._ccPicker) return;
    let key = encodedKey;
    try { key = decodeURIComponent(encodedKey); } catch (e) { /* raw key */ }
    const result = applyPick(this._ccPicker.id, key, this._ccPicker.arg);
    if (result && result.arg !== undefined) {
      this._ccPicker = { id: this._ccPicker.id, arg: result.arg };
      // Drilling into a category is a new list, so the search starts clean.
      if (this._ccBar) this._ccBar.resetQuiet();
      this._contentIndex = 0;
    } else if (!result) {
      this._ccPicker = null;
      if (this._ccBar) this._ccBar.resetQuiet();
      this._contentIndex = 0;
    }
    // A picker that stays open (specializations) keeps its cursor, and its
    // search, where they are.
    this._render();
  };

  // The "−" chip on a specialization row: one level back down, the points
  // returned to the pot. Levels a class or a trait granted go the same way,
  // which is how they are turned into points spent somewhere else.
  Scene_NPCEmpathize.prototype._ccLowerOption = function (encodedKey) {
    if (!isEditing(this) || !this._ccPicker || this._ccPicker.id !== "specializations") return;
    let key = encodedKey;
    try { key = decodeURIComponent(encodedKey); } catch (e) { /* raw key */ }
    if (!lowerSpecLevel(Number(key))) SoundManager.playBuzzer();
    this._render();
  };

  Scene_NPCEmpathize.prototype._ccClosePicker = function () {
    if (!this._ccPicker) return;
    SoundManager.playCancel();
    // Drilled into a specialization category: back up to the category list.
    this._ccPicker = this._ccPicker.arg ? { id: this._ccPicker.id, arg: null } : null;
    if (this._ccBar) this._ccBar.resetQuiet();
    this._contentIndex = 0;
    this._render();
  };

  //---------------------------------------------------------------------------
  // Keyboard / controller navigation
  //---------------------------------------------------------------------------

  const _contentNavEnabled = Scene_NPCEmpathize.prototype._contentNavEnabled;
  Scene_NPCEmpathize.prototype._contentNavEnabled = function () {
    if (isEditing(this) && this._activeTab === CC_TAB) return true;
    return _contentNavEnabled.call(this);
  };

  const _contentItems = Scene_NPCEmpathize.prototype._contentItems;
  Scene_NPCEmpathize.prototype._contentItems = function () {
    if (isEditing(this) && this._activeTab === CC_TAB) {
      if (!this._rightEl) return [];
      // The search field (UI/MenuSearchBar.js) is mouse-only by its own
      // convention, the same as everywhere else it is used: opening it is a
      // click, so it carries no tabindex and is never one of the nav stops.
      return Array.from(this._rightEl.querySelectorAll(".npc-cc-row, .npc-back-btn"));
    }
    return _contentItems.call(this);
  };

  const _contentBack = Scene_NPCEmpathize.prototype._contentBack;
  Scene_NPCEmpathize.prototype._contentBack = function () {
    if (isEditing(this) && this._activeTab === CC_TAB && this._ccPicker) {
      this._ccClosePicker();
      return;
    }
    _contentBack.call(this);
  };

  //---------------------------------------------------------------------------
  // Portrait as a button, and closing the panel
  //---------------------------------------------------------------------------

  const _render = Scene_NPCEmpathize.prototype._render;
  Scene_NPCEmpathize.prototype._render = function () {
    _render.call(this);
    if (!isEditing(this)) return;
    // Every keystroke in a picker's search box rebuilds the list, and with it
    // the field: MenuSearchBar.restoreFocus() puts the focus and caret back
    // (a no-op when the field is not on screen at all).
    if (this._ccBar) this._ccBar.restoreFocus();
    if (!this._leftEl) return;
    // Clicking the portrait is the shortest way into the sprite grid, which is
    // also where the bust gallery and the 3D editor are reached from.
    const wrap = this._leftEl.querySelector(".npc-portrait-wrap");
    if (!wrap) return;
    wrap.classList.add("npc-cc-portrait");
    wrap.title = T("detailed.portraitHint");
    wrap.onmousedown = (event) => {
      event.stopPropagation();
      openSpriteGrid();
    };
  };

  const _leave = Scene_NPCEmpathize.prototype._leave;
  Scene_NPCEmpathize.prototype._leave = function (force) {
    // Walking a wiki hyperlink back is not leaving the editor.
    if (isEditing(this) && (force || !Scene_NPCEmpathize._returnStack.length)) {
      window.CharacterCreationFull.finish();
    }
    _leave.call(this, force);
  };

  console.log("[CharacterCreationFull] v1.0.0 loaded.");
})();
