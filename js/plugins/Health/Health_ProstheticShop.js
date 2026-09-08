/*:
 * @target MZ
 * @plugindesc [Add-on] Prosthetic shop (Refactored UI - Full Screen Steps)
 * @author Omni-Lex 
 * @help
 * This plugin is an add-on for the Core Limb Damage System.
 *
 * Flow:
 * 1. Party member selection
 * 2. Command menu (Install bodypart / Remove bodypart / Replace bodypart /
 *    Install implant / Cancel)
 * 3a. [Install bodypart]  → Archetype select → Part list → confirm purchase
 * 3b. [Install from pack] → Body part items the party is already carrying
 * 3c. [Remove bodypart]   → Actor part list → (if implant) confirm warning
 * 3d. [Install implant]  → Body part grid → Prosthetic list
 *
 * Body part install price  : hpPercent * 1000 gold
 * Body part removal price  : hpPercent * 100  gold
 * Vital parts cannot be removed.
 * Installing a body part grants the abs(statEffect.amount) bonus to that param.
 * Removing a body part reverts that bonus.
 *
 * ---------------------------------------------------------------------------
 * Field surgery (the FieldSurgery command)
 * ---------------------------------------------------------------------------
 * The same theatre carried in a rucksack. The party picks a patient AND a
 * surgeon, and nothing is bought: only body parts already in the pack can be
 * fitted, an augment can be taken out but never seated, and no fee is charged.
 *
 * Every operation is a roll, reported before it is taken:
 *   the surgeon's Surgery specialization  35 / 50 / 65 / 78 / 90 by tier
 *   under a roof +10, in a cave -5, in the open -10
 *   rain -15, a storm -25, snow +5 (cold slows the bleeding)
 *   operating on yourself -15
 * A failure wounds the patient somewhere else. A vital organ is only ever at
 * risk in Blood and Oil, and only there does a part taken to 0 HP leave the
 * body, carrying its augment with it.
 *
 * @command OpenProstheticShop
 * @desc Opens the prosthetic shop.
 *
 * @command FieldSurgery
 * @text Field surgery
 * @desc Operate in the field: pick a patient and a surgeon, fit parts from the pack, or take an augment out.
 *
 */
(function () {
  "use strict";

  // A body part's skillId may be a single number or an array of numbers.
  // Normalize to a clean array of positive ids (falls back if Health_Core's
  // helper is unavailable for any reason).
  function skillIdList(value) {
    if (window.HealthCore && window.HealthCore.normalizeSkillIds) {
      return window.HealthCore.normalizeSkillIds(value);
    }
    if (Array.isArray(value)) return value.filter((id) => typeof id === "number" && id > 0);
    return typeof value === "number" && value > 0 ? [value] : [];
  }

  // Write a freshly grafted/replaced body part onto the actor: build the part
  // record, apply its stat effect, learn its own skill(s), clear any pending
  // removed-part debuff, and grant the part-type bonus skills
  // (Mouth/Hands/Eyes/Feet) immediately so they are not missing until the next
  // map load re-runs ensureAllPartyBodyPartSkills. Shared by the install and
  // replace shop paths.
  // ==========================================================================
  // What an operation teaches
  // ==========================================================================
  // Every graft is surgery, so Surgery (265) is always earned. What else is
  // learned depends on what was actually fitted: bolting a hydraulic arm on is
  // not the same trade as grafting living gills or seating a mana crystal.
  // Matched on the implant key by keyword rather than by a table of all 69, so
  // an implant added to ProstheticCompatibility.json is classified without a
  // code change.
  // i18n-ignore-start: specialization names and keyword probes, matched
  // against Specialization.json rather than shown as prose
  const IMPLANT_SPEC_KEYWORDS = [
    // Machinery, electronics and fabricated hardware.
    ["Cybernetics", [
      "CYBER", "MECHANICAL", "NEURAL", "HYDRAULIC", "STEAM", "GYRO", "SPRING",
      "MAGNETIC", "HOVER", "GRAPPLING", "TOOLS", "BLADE", "LOCK_PICKS",
      "TELESCOPIC", "SONIC", "SENSOR", "FILTRATION", "FILTER", "PURIFIER",
      "EXTRACTOR", "SYNTHESIZER", "IRON", "REINFORCEMENT", "ADAMANTINE",
      "NEEDLES", "SPIKES", "CONDUCTOR", "PROCESSOR", "ABSORBERS", "PADS",
      "SOLES", "COILS", "BOILER", "RIBCAGE", "FURNACE", "INJECTOR"
    ]],
    // Anything worked in mana, spirit or rune.
    ["Runecrafting", [
      "ARCANE", "MANA", "RUNIC", "ASTRAL", "SPIRIT", "VOID", "SHADOW",
      "ANCIENT", "CRYSTAL", "ELEMENTAL", "PHOENIX", "EARTH_SENSE", "ESSENCE"
    ]],
    // Grown, grafted or otherwise alive.
    ["Biomancy", [
      "BEAST", "VAMPIRIC", "VENOM", "AQUATIC", "LIVING", "TREE", "SPORE",
      "MITOSIS", "TESTES", "UTERUS", "OVIDUCT", "DRAGON", "HAWK", "ELVEN",
      "SCENT", "SILVER_TONGUE", "FANGS", "TEETH", "CLAWS", "GLAND", "GILLS",
      "FINS", "VINES", "GOLEM", "TITAN", "LIMB", "ARM"
    ]]
  ];

  function implantSpec(prostheticKey) {
    const key = String(prostheticKey || "").toUpperCase();
    if (!key) return null;
    for (const [spec, words] of IMPLANT_SPEC_KEYWORDS) {
      if (words.some(w => key.includes(w))) return spec;
    }
    return "Bionic Installation";
  }
  // i18n-ignore-end

  // Called by both install paths (the window method and the standalone one).
  function trainOnImplant(prostheticKey) {
    if (!window.SpecializationXP) return;
    window.SpecializationXP.awardCapped("Surgery", 2);
    const spec = implantSpec(prostheticKey);
    if (spec) window.SpecializationXP.awardCapped(spec, 2);
  }

  function graftBodyPart(actor, item, partKey, archPart, itemId, socketKey) {
    if (!actor._bodyParts) actor._bodyParts = {};
    // The socket is filled again, so the portrait draws that limb once more
    // (Health_Core's severed-part register, read by partStates).
    if (actor._severedParts) delete actor._severedParts[partKey];
    const hpPercentage = item.hpPercent / 100;
    actor._bodyParts[partKey] = {
      name: item.name,
      maxHp: Math.round(actor.mhp * hpPercentage),
      currentHp: Math.round(actor.mhp * hpPercentage),
      vital: item.vital,
      damaged: false,
      equipSlot: archPart.equipSlot || null,
      childParts: archPart.childParts || [],
      multiple: archPart.multiple || false,
      appliedStatEffect: false,
      // A prosthetic arm is still an arm: it holds a weapon if the part it
      // replaced did (ItemSystem/ItemSystemEquipment.js).
      canHoldWeapon: !!archPart.canHoldWeapon,
      hpPercent: item.hpPercent,
      statEffect: item.statEffect,
      skillId: item.skillId || 0,
      itemId: itemId,
      // The limb it was fitted onto, when it is a hand or a foot. Names alone
      // cannot say it any more: a foot may be screwed onto an arm, and this is
      // what tells the body it comes off with that arm rather than with the
      // leg it is named after (HealthCore.dependentPartKeys).
      attachedTo: socketKey || null,
    };

    if (item.statEffect && item.statBonus > 0) {
      if (!actor._bodyPartStatEffects) actor._bodyPartStatEffects = {};
      const p = item.statEffect.param;
      if (!actor._bodyPartStatEffects[p]) actor._bodyPartStatEffects[p] = 0;
      actor._bodyPartStatEffects[p] += item.statBonus;
    }

    skillIdList(item.skillId).forEach((sid) => { if ($dataSkills[sid]) actor.learnSkill(sid); });

    if (actor._removedPartDebuffs && actor._removedPartDebuffs[partKey]) {
      const debuff = actor._removedPartDebuffs[partKey];
      const p = debuff.param;
      const amount = debuff.amount;
      if (actor._statModifiers && actor._statModifiers[p] !== undefined) {
        actor._statModifiers[p] -= amount;
        if (actor._statModifiers[p] === 0) delete actor._statModifiers[p];
      }
      delete actor._removedPartDebuffs[partKey];
    }

    if (window.HealthCore && window.HealthCore.ensureBodyPartSkills) {
      window.HealthCore.ensureBodyPartSkills(actor);
    }
  }

  // Display label for a part's skill(s): joined skill names, or "" if none.
  function skillNames(value) {
    return skillIdList(value)
      .map((id) => ($dataSkills && $dataSkills[id] ? $dataSkills[id].name : ""))
      .filter(Boolean)
      .join(", ");
  }

  // ── Shared character-switcher hint helper (idempotent across plugins) ──────
  // Shows controller bumper hints (L / R) around a .companion-tabs-row when a
  // gamepad is connected, or a single TAB hint otherwise. Also installs a Tab
  // keyboard shortcut that cycles characters only while no controller is
  // connected (the bumpers / pageup-pagedown handle it when one is).
  if (!window.CharSwitcher) {
    window.CharSwitcher = {
      isControllerConnected() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < pads.length; i++) {
          if (pads[i] && pads[i].connected) return true;
        }
        return false;
      },
      parts(memberCount) {
        if (!memberCount || memberCount <= 1) return { left: '', right: '' };
        if (this.isControllerConnected()) {
          return {
            left: '<span class="char-switch-hint">L</span>',
            right: '<span class="char-switch-hint">R</span>'
          };
        }
        return { left: '', right: '<span class="char-switch-hint">TAB</span>' };
      },
      inner(tabsRowHTML, memberCount) {
        const p = this.parts(memberCount);
        return p.left + tabsRowHTML + p.right;
      },
      wrap(tabsRowHTML, memberCount) {
        return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
      },
      installTabKey(scene, onCycle) {
        if (scene._charSwitchTabListener) return;
        scene._charSwitchTabListener = (e) => {
          if (e.key !== 'Tab') return;
          e.preventDefault();
          if (this.isControllerConnected()) return;
          onCycle(e.shiftKey ? -1 : 1);
        };
        window.addEventListener('keydown', scene._charSwitchTabListener);
      },
      removeTabKey(scene) {
        if (scene._charSwitchTabListener) {
          window.removeEventListener('keydown', scene._charSwitchTabListener);
          scene._charSwitchTabListener = null;
        }
      }
    };
  }

  var pluginName = "Health_ProstheticShop";
  var parameters = {};
  // Getters for dynamic database access to prevent load-order timing issues
  const getBodyParts = () => window.Health ? window.Health.BodyParts : null;
  const getProstheticTypes = () => window.Health ? window.Health.ProstheticTypes : null;
  const getProstheticCompatibility = () => window.Health ? window.Health.ProstheticCompatibility : null;

  // What a socket takes. Health_Core resolves a part key by name (LEFT_WING and
  // RIGHT_PROP are both wings), so a creature's own anatomy is offered implants
  // even though ProstheticCompatibility.json never names its part keys. Falls
  // back to the flat table when the core plugin is absent.
  function implantsForPart(partKey) {
    if (window.HealthCore && window.HealthCore.implantsForPart) {
      return window.HealthCore.implantsForPart(partKey);
    }
    const table = getProstheticCompatibility();
    return (table && table[partKey]) ? table[partKey].filter(Boolean) : [];
  }

  // "STR +6" for every parameter, then the skill the implant teaches. What a
  // buyer is really paying for is often the skill, so it is never left out.
  function implantEffectText(prosthetic) {
    const parts = [];
    for (const paramId in (prosthetic.effects || {})) {
      const value = prosthetic.effects[paramId];
      parts.push(`${getParamName(parseInt(paramId, 10))} ${value >= 0 ? "+" : ""}${value}`);
    }
    for (const sid of skillIdList(prosthetic.skill)) {
      const skill = $dataSkills && $dataSkills[sid];
      if (skill && skill.name) parts.push(T('Prosthetics.grantsSkill', { skill: skill.name }));
    }
    return parts;
  }

  // "TrashCreature" is a key, not a name: the screen prints it spaced.
  function archetypeLabel(key) {
    return String(key || "").replace(/([A-Z])/g, " $1").trim();
  }

  // The augment fitted in a socket, in the player's language, or "" for none.
  function implantName(prostheticKey) {
    const ProstheticTypes = getProstheticTypes();
    const prosthetic = prostheticKey && ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
    if (!prosthetic) return "";
    return ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en;
  }

  // A Surgery tier as its name rather than its number, where the ladder is up.
  function specLevelName(level) {
    return (window.Specializations && window.Specializations.ready)
      ? window.Specializations.levelName(level) : String(level);
  }

  // ===========================================================================
  // Field surgery
  // ---------------------------------------------------------------------------
  // The same theatre, carried in a rucksack. One party member cuts, another is
  // cut, and nothing is bought: only what is already in the pack can be fitted,
  // and an augment can be taken out but never put in (there is no sterile bench
  // to seat one on). Whether the operation works at all is a roll.
  // ===========================================================================
  const SURGERY_SPEC = "Surgery";  // i18n-ignore  Specialization.json name

  // Base odds by the surgeon's Surgery tier (Untrained .. Master).
  const SURGERY_BASE_BY_LEVEL = [0, 35, 50, 65, 78, 90];
  const SURGERY_SELF_PENALTY = -15;  // operating on yourself, one-handed
  // Where it happens. A roof and a table beat a wet field; a cave is in between.
  const SURGERY_VENUE = { interior: 10, cavern: -5, exterior: -10 };
  // Rain gets into the wound. Snow is cold, and cold is the one thing a field
  // surgeon can use: it slows the bleeding.
  const SURGERY_WEATHER = { rain: -15, storm: -25, snow: 5, none: 0 };
  const SURGERY_MIN_CHANCE = 5;
  const SURGERY_MAX_CHANCE = 97;

  // A cave and a tiled room are both under cover, but only one of them is a
  // theatre. An explicit <Exterior> beats everything, the way it does for the
  // minigames' venue check.
  function surgeryVenue() {
    const note = (window.$dataMap && $dataMap.note) || "";
    if (/<Exterior>/i.test(note)) return "exterior";
    try {
      if (typeof window.isProceduralInteriorMap === "function" && window.isProceduralInteriorMap()) {
        return "cavern";
      }
    } catch (e) { /* procedural stack not loaded */ }
    if (/<Interior>/i.test(note)) return "interior";
    return "exterior";
  }

  function surgeryWeather() {
    const type = (window.$gameWeather && $gameWeather.currentWeatherType) || "none";
    return Object.prototype.hasOwnProperty.call(SURGERY_WEATHER, type) ? type : "none";
  }

  // Everything that decides whether the knife goes where it was meant to. The
  // surgeon-select page shows this breakdown before anybody is opened up.
  function surgeryOdds(surgeon, patient) {
    const level = (window.SpecializationXP && surgeon)
      ? window.SpecializationXP.levelOf(surgeon, SURGERY_SPEC) : 1;
    const venue = surgeryVenue();
    const weather = surgeryWeather();
    const self = !!(surgeon && patient && surgeon === patient);
    const base = SURGERY_BASE_BY_LEVEL[level] || SURGERY_BASE_BY_LEVEL[1];
    const venueMod = SURGERY_VENUE[venue] || 0;
    const weatherMod = SURGERY_WEATHER[weather] || 0;
    const selfMod = self ? SURGERY_SELF_PENALTY : 0;
    const chance = Math.max(SURGERY_MIN_CHANCE,
      Math.min(SURGERY_MAX_CHANCE, base + venueMod + weatherMod + selfMod));
    return { chance, level, base, venue, venueMod, weather, weatherMod, self, selfMod };
  }

  // Where a slip lands. A vital organ is only ever on the table in Blood and
  // Oil; on every other difficulty the knife finds something survivable.
  function pickSlipPart(patient) {
    if (!patient || !patient._bodyParts) return null;
    const bloodAndOil = !!(window.$gameSystem && $gameSystem._bloodAndOilMode);
    const candidates = Object.keys(patient._bodyParts).filter((key) => {
      const part = patient._bodyParts[key];
      if (!part || part.damaged) return false;
      return bloodAndOil || !isPartVital(patient, key, part);
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // The wound a failed operation leaves. Returns what was hurt, for the report.
  function applySurgicalSlip(patient, margin) {
    const partKey = pickSlipPart(patient);
    if (!partKey) return null;
    const part = patient._bodyParts[partKey];
    // A near miss nicks; a botched one opens the part up. margin is how far
    // past the odds the roll landed, 0..100.
    const share = 0.3 + Math.min(0.6, Math.max(0, margin) / 100);
    const amount = Math.max(1, Math.round((part.maxHp || 10) * share));
    const dealt = (window.HealthCore && window.HealthCore.injureBodyPart)
      ? window.HealthCore.injureBodyPart(patient, partKey, amount, { cut: true }) : 0;
    return { partKey, partName: part.name || partKey, dealt, lost: !patient._bodyParts[partKey] };
  }

  window.FieldSurgery = {
    odds: surgeryOdds,
    venue: surgeryVenue,
    weather: surgeryWeather
  };

  // A hand is not something that can be stuck straight onto a body, and neither
  // is a foot: both go on the end of a limb, so fitting either needs an arm or
  // a leg with nothing on the end of it yet. To rebuild a whole leg the surgeon
  // therefore fits the leg first and the foot after
  // (window.HealthCore.openLimbSockets).
  //
  // Which limb is the patient's business and nothing else's: a left hand goes
  // onto a right arm perfectly well, a foot goes onto an arm, a hand goes onto
  // a leg, and somebody may leave the clinic with two right arms. The one thing
  // a limb cannot do is carry two.
  //
  // Returns the reason the graft is refused, or null when it can go ahead.
  function graftBlockedReason(actor, partKey) {
    const HC = window.HealthCore;
    if (!HC || !HC.needsLimbSocket || !HC.openLimbSockets) return null;
    // Limbs, organs and every grasping thing that stands on its own - a
    // tentacle, a pseudopod, a wisp - go straight onto the body and add their
    // weapon slot with them. Only what fits on the END of a limb waits for one.
    if (!HC.needsLimbSocket(partKey)) return null;
    if (HC.openLimbSockets(actor).length > 0) return null;
    return T('Prosthetics.needsBareLimb');
  }

  // The limb a graft goes onto: the one the patient picked, or the only one
  // going. Anything that is not an extremity answers null and is fitted to the
  // body itself, exactly as before.
  function socketForGraft(actor, partKey, chosen) {
    const HC = window.HealthCore;
    if (!HC || !HC.needsLimbSocket || !HC.needsLimbSocket(partKey)) return null;
    if (chosen) return chosen;
    const open = HC.openLimbSockets(actor);
    return open.length === 1 ? open[0] : null;
  }

  function implantablePartKeys(actor) {
    if (!actor || !actor._bodyParts) return [];
    return Object.keys(actor._bodyParts).filter((k) => implantsForPart(k).length > 0);
  }
  const getArchetypes = () => window.Health ? window.Health.Archetypes : null;

  // --- Utility constants & functions ---

  const AUTO_ASSIGN_IMPLANTS = [
    "TESTES",       // 0
    "UTERUS",       // 1
    "OVIDUCT",      // 2
    "SPORE_GLAND",  // 3
    "MITOSIS_GLAND",// 4
    "TESTES",       // 5
  ];

  // Maps party index (0/1/2) to the game variable for reproduction type
  function getReproductionVariableId(actor) {
    const idx = $gameParty.members().indexOf(actor);
    return [87, 115, 116][idx] !== undefined ? [87, 115, 116][idx] : 87;
  }

  if (Utils.RPGMAKER_NAME === "MZ") {
    parameters = PluginManager.parameters(pluginName);
  } else {
    parameters = PluginManager.parameters(pluginName);
  }

  if (Utils.RPGMAKER_NAME === "MZ" && !window.Window_StatusBase) {
    throw new Error("Window_StatusBase is required for this plugin in RPG Maker MZ");
  }

  function getParamName(paramId) {
    return T.list('Prosthetics.paramNames')[paramId] || T('Prosthetics.statFallback');
  }

  function formatPriceInEuros(goldPrice) {
    return (goldPrice / 100).toFixed(2) + "€";
  }

  function getTranslated(dataObject, propertyName) {
    const val = dataObject[propertyName];
    if (val && typeof val === "string" && val.includes('.')) {
      return window.getArchetypeText(val);
    }
    const lang = ConfigManager.language;
    const langKey = `${propertyName}_${lang}`;
    return lang !== "en" && dataObject[langKey] ? dataObject[langKey] : dataObject[propertyName];
  }

  function initializeBodyParts(actor) {
    const BodyParts = getBodyParts();
    if (actor && !actor._bodyParts && BodyParts) {
      actor._bodyParts = {};
      actor._statModifiers = {};
      for (const partKey in BodyParts) {
        const basePart = BodyParts[partKey];
        const hpPercentage = basePart.hp / 100;
        actor._bodyParts[partKey] = {
          name: getTranslated(basePart, "name"),
          damageMsg: getTranslated(basePart, "damageMsg") || null,
          maxHp: Math.round(actor.mhp * hpPercentage),
          currentHp: Math.round(actor.mhp * hpPercentage),
          vital: basePart.vital,
          damaged: false,
          equipSlot: basePart.equipSlot || null,
          childParts: basePart.childParts || [],
          multiple: basePart.multiple || false,
          appliedStatEffect: false,
        };
      }
    }
  }

  const getTextColor = function (id) {
    if (this && this.textColor) return this.textColor(id);
    if (Utils.RPGMAKER_NAME === "MZ" && window.ColorManager) return ColorManager.textColor(id);
    return "rgba(255,255,255,1)";
  };

  const getSystemColor = function () {
    if (this && this.systemColor) return this.systemColor();
    if (Utils.RPGMAKER_NAME === "MZ" && window.ColorManager) return ColorManager.systemColor();
    return "rgba(176,224,248,1)";
  };

  // Helper: infer hpPercent for an existing body part
  function inferHpPercent(part, actor) {
    if (part.hpPercent !== undefined) return part.hpPercent;
    if (actor.mhp > 0) return Math.round((part.maxHp / actor.mhp) * 100);
    return 10;
  }

  // Helper: look up statEffect for a part key
  function lookupStatEffect(partKey, part, actor) {
    if (part.statEffect) return part.statEffect;
    const Archetypes = getArchetypes();
    if (actor._currentArchetype && Archetypes) {
      const arch = Archetypes[actor._currentArchetype];
      if (arch && arch.parts && arch.parts[partKey]) return arch.parts[partKey].statEffect;
    }
    return null;
  }

  // Returns true if the given part should be treated as vital for this actor.
  // LEFT_LUNG / RIGHT_LUNG are only vital when their partner is already damaged.
  const LUNG_PAIRS = { LEFT_LUNG: "RIGHT_LUNG", RIGHT_LUNG: "LEFT_LUNG" };
  function isPartVital(actor, partKey, basePart) {
    if (partKey in LUNG_PAIRS) {
      const partner = actor._bodyParts && actor._bodyParts[LUNG_PAIRS[partKey]];
      // Vital only when the other lung is missing or fully damaged
      return !partner || partner.damaged;
    }
    return !!(basePart && basePart.vital);
  }

  // Compute the effective stat bonus from a statEffect object.
  // HP (param 0) and MP (param 1) are multiplied by 10.
  // All other stats grant their raw D&D bonus (+1 to +3).
  function computeStatBonus(statEffect) {
    if (!statEffect) return 0;
    const raw = Math.abs(statEffect.amount);
    if (statEffect.param === 0 || statEffect.param === 1) return raw * 10;
    return raw;
  }

  // --- END UTILITY ---

  // --- Daily randomized prosthetic shop availability ---
  const prostheticShopCache = {};

  function _prostheticGetDateKey() {
    const dateStr = $gameVariables.value(113) || '01 JAN 2001 12:00';
    const parts = dateStr.split(' ').filter(Boolean);
    if (parts.length < 3) return '2001-01-01';
    const day = parseInt(parts[0]) || 1;
    const monthStr = (parts[1] || '').toUpperCase();
    const year = parseInt(parts[2]) || 2001;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let month = months.indexOf(monthStr);
    if (month === -1) {
      const itMonths = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
      month = itMonths.indexOf(monthStr);
    }
    if (month === -1) month = 0;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Canonical world seed so prosthetic stock is consistent per world
  function _prostheticGetWorldSeed() {
    let historySeed = 19002001;
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
      historySeed = window.HistoryManager.getSeed();
    } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
      historySeed = $gameSystem._historySeed;
    }
    return historySeed >>> 0;
  }

  function _prostheticSeededShuffle(array, seed) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function getDailyProstheticArchetypes(mapId, x, y) {
    const dateKey = _prostheticGetDateKey();
    const cacheKey = `${mapId}_${x}_${y}_${dateKey}`;
    if (prostheticShopCache[cacheKey]) return prostheticShopCache[cacheKey];

    const Archetypes = getArchetypes();
    if (!Archetypes) return null;

    const allKeys = Object.keys(Archetypes);
    const dateNum = parseInt(dateKey.replace(/-/g, ''), 10);
    const base = mapId * 10000000 + x * 10000 + y * 100 + (dateNum % 10000);
    const seed = (base ^ _prostheticGetWorldSeed()) >>> 0;
    const shuffled = _prostheticSeededShuffle(allKeys, seed);

    // 4–6 archetypes available per day
    const rand = (Math.sin(seed + 42) * 10000) % 1;
    const count = Math.min(allKeys.length, 4 + Math.floor(Math.abs(rand) * 3));
    const selected = shuffled.slice(0, count);

    prostheticShopCache[cacheKey] = selected;
    return selected;
  }
  // --- END Daily randomization ---

  const INSTALLATION_FEE = 5000; // 50€ flat labor fee for any installation

  function buildBodyPartItemLookup() {
    const lookup = {};
    const Archetypes = getArchetypes();
    if (!Archetypes) return lookup;
    for (const archKey of Object.keys(Archetypes)) {
      const arch = Archetypes[archKey];
      if (!arch || !arch.parts) continue;
      for (const partKey of Object.keys(arch.parts)) {
        const part = arch.parts[partKey];
        if (!part.itemId) continue;
        if (!lookup[part.itemId]) lookup[part.itemId] = [];
        lookup[part.itemId].push({ archetypeKey: archKey, partKey, part });
      }
    }
    return lookup;
  }

  // One item can stand for several genuinely different slots: a hydra's three
  // heads all drop item 1204, as do an ophanim's four wheels, an octopus'
  // tentacles and a mutant's extra limbs. Taking only the first match hid every
  // slot but one, so the centre and right heads were ungraftable. The slot key
  // is the real identity here -- the same leg shared by 29 archetypes is one
  // option, not 29.
  function distinctPartMatches(matches, actor) {
    const bodyParts = (actor && actor._bodyParts) || null;
    const bySlot = new Map();
    for (const match of matches) {
      if (!bySlot.has(match.partKey)) bySlot.set(match.partKey, match);
    }
    // Some archetypes spell one slot differently (Goblin EYE_LEFT vs Humanoid
    // LEFT_EYE); an identical part name means it is the same slot, so keep one
    // entry -- under the key the patient's body already uses where there is a
    // choice, so the surgery fills that slot instead of bolting a second one on
    // under the alias key.
    const byName = new Map();
    for (const match of bySlot.values()) {
      const nameKey = String(getTranslated(match.part, "name") || match.partKey).toLowerCase();
      const kept = byName.get(nameKey);
      if (!kept || (bodyParts && bodyParts[match.partKey] && !bodyParts[kept.partKey])) {
        byName.set(nameKey, match);
      }
    }
    return Array.from(byName.values());
  }

  function getInventoryBodyParts(actor) {
    const lookup = buildBodyPartItemLookup();
    const results = [];
    for (let i = 1; i < $dataItems.length; i++) {
      const item = $dataItems[i];
      if (!item || !item.note) continue;
      const note = item.note.toLowerCase();
      if (!note.includes('<category: bodypart>') && !note.includes('<category:bodypart>')) continue;
      if ($gameParty.numItems(item) <= 0) continue;
      const matches = lookup[i];
      if (!matches || matches.length === 0) continue;
      for (const { archetypeKey, partKey, part } of distinctPartMatches(matches, actor)) {
        const statBonus = computeStatBonus(part.statEffect);
        results.push({
          isInventoryPart: true,
          isArchetypePart: true,
          item,
          itemId: i,
          archetypeKey,
          partKey,
          blockedReason: graftBlockedReason(actor, partKey),
          name: getTranslated(part, "name"),
          hpPercent: part.hpPercent,
          vital: part.vital,
          statEffect: part.statEffect || null,
          statBonus,
          skillId: part.skillId || 0,
          cost: INSTALLATION_FEE,
          alreadyOwned: false,
          archPart: part,
        });
      }
    }
    return results;
  }

  // ===========================================================================
  // Window_PartySelect  (Step 1)
  // ===========================================================================
  function Window_PartySelect() { this.initialize(...arguments); }
  Window_PartySelect.prototype = Object.create(Window_Command.prototype);
  Window_PartySelect.prototype.constructor = Window_PartySelect;

  Window_PartySelect.prototype.initialize = function () {
    const ww = 400;
    const members = $gameParty.members();
    const wh = members.length * 36 + 24;
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_Command.prototype.initialize.call(this, new Rectangle(wx, wy, ww, wh));
    } else {
      Window_Command.prototype.initialize.call(this, wx, wy, ww, wh);
    }
  };

  Window_PartySelect.prototype.makeCommandList = function () {
    for (const actor of $gameParty.members()) {
      this.addCommand(actor.name(), "selectMember", true, actor);
    }
  };

  Window_PartySelect.prototype.getSelectedActor = function () {
    return this.currentExt();
  };

  // ===========================================================================
  // Window_ShopCommand  (Step 2)
  // ===========================================================================
  function Window_ShopCommand() { this.initialize(...arguments); }
  Window_ShopCommand.prototype = Object.create(Window_Command.prototype);
  Window_ShopCommand.prototype.constructor = Window_ShopCommand;

  Window_ShopCommand.prototype.initialize = function () {
    const ww = 400;
    const wh = 5 * 36 + 24; // 5 commands
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_Command.prototype.initialize.call(this, new Rectangle(wx, wy, ww, wh));
    } else {
      Window_Command.prototype.initialize.call(this, wx, wy, ww, wh);
    }
  };

  Window_ShopCommand.prototype.makeCommandList = function () {
    this.addCommand(T('Prosthetics.installBodypart'), "installBodypart", true);
    this.addCommand(T('Prosthetics.removeBodypart'), "removeBodypart", true);
    this.addCommand(T('Prosthetics.replaceBodypart'), "replaceBodypart", true);
    this.addCommand(T('Prosthetics.installImplant'), "installImplant", true);
    this.addCommand(T('Prosthetics.cancel'), "cancel", true);
  };

  // ===========================================================================
  // Window_ArchetypeSelect  (Install bodypart – step A)
  // ===========================================================================
  function Window_ArchetypeSelect() { this.initialize(...arguments); }
  Window_ArchetypeSelect.prototype = Object.create(Window_Command.prototype);
  Window_ArchetypeSelect.prototype.constructor = Window_ArchetypeSelect;

  Window_ArchetypeSelect.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_Command.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Command.prototype.initialize.call(this, 0, 0, width, height);
    }
  };

  Window_ArchetypeSelect.prototype.maxCols = function () { return 3; };

  Window_ArchetypeSelect.prototype.makeCommandList = function () {
    const Archetypes = getArchetypes();
    if (!Archetypes) return;
    for (const key of Object.keys(Archetypes)) {
      const label = key.replace(/([A-Z])/g, " $1").trim();
      this.addCommand(label, "archetype", true, key);
    }
  };

  Window_ArchetypeSelect.prototype.getSelectedKey = function () {
    return this.currentExt();
  };

  // ===========================================================================
  // Window_ArchetypePartList  (Install bodypart – step B)
  // ===========================================================================
  function Window_ArchetypePartList() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_ArchetypePartList.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_ArchetypePartList.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_ArchetypePartList.prototype.constructor = Window_ArchetypePartList;

  Window_ArchetypePartList.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._archetypeKey = null;
    this._partList = [];
    this.refresh();
  };

  Window_ArchetypePartList.prototype.setContext = function (actor, archetypeKey) {
    this._actor = actor;
    this._archetypeKey = archetypeKey;
    this.refresh();
    this.select(0);
  };

  Window_ArchetypePartList.prototype.maxItems = function () { return this._partList.length; };
  Window_ArchetypePartList.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_ArchetypePartList.prototype.setupPartList = function () {
    this._partList = [];
    const Archetypes = getArchetypes();
    if (!this._archetypeKey || !Archetypes) return;
    const archetype = Archetypes[this._archetypeKey];
    if (!archetype || !archetype.parts) return;

    for (const partKey of Object.keys(archetype.parts)) {
      const part = archetype.parts[partKey];

      // Skip vital parts and parts whose key or name contains "Core" or "Body"
      if (part.vital) continue;
      const keyLower = partKey.toLowerCase();
      const nameLower = (part.name || "").toLowerCase();
      if (keyLower.includes("core") || keyLower.includes("body") ||
        nameLower.includes("core") || nameLower.includes("body") ||
        nameLower.includes("head") || nameLower.includes("head")) continue;

      // Key-based check first, then name-based: hide if the actor already owns
      // any part whose name is contained in this part's name (case-insensitive).
      // e.g. actor has "Right Hand" → hides archetype parts like "Right Hand (Cyber)"
      const partName = getTranslated(part, "name").toLowerCase();
      let alreadyOwned = !!(this._actor && this._actor._bodyParts && this._actor._bodyParts[partKey]);
      if (!alreadyOwned && this._actor && this._actor._bodyParts) {
        for (const existingKey in this._actor._bodyParts) {
          const existingName = (this._actor._bodyParts[existingKey].name || "").toLowerCase();
          if (existingName && partName.includes(existingName)) { alreadyOwned = true; break; }
        }
      }
      // A party with a surgeon in it pays for the parts, not for the theatre.
      const surgeonRate = window.SpecializationXP
        ? window.SpecializationXP.discount("Surgery", 0.06, 0.7) : 1;
      const cost = Math.round((part.hpPercent * 1000 +
        Math.abs((part.statEffect && part.statEffect.amount) || 0) * 10000) * surgeonRate);
      const statBonus = computeStatBonus(part.statEffect);

      this._partList.push({
        isArchetypePart: true,
        partKey,
        blockedReason: graftBlockedReason(this._actor, partKey),
        archetypeKey: this._archetypeKey,
        name: getTranslated(part, "name"),
        hpPercent: part.hpPercent,
        vital: part.vital,
        statEffect: part.statEffect || null,
        statBonus,
        skillId: part.skillId || 0,
        cost,
        alreadyOwned,
        archPart: part,   // keep full archetype part data for installation
      });
    }
  };

  Window_ArchetypePartList.prototype.drawItem = function (index) {
    const item = this._partList[index];
    if (!item) return;

    const rect = this.itemRect(index);
    const x = rect.x + 4;
    const width = rect.width - 8;
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

    if (item.alreadyOwned || item.blockedReason) {
      this.contents.paintOpacity = 96;
      this.changeTextColor(getTextColor.call(this, 7));
    } else {
      this.contents.paintOpacity = 255;
      this.resetTextColor();
    }

    // Name
    this.drawText(item.name, x, rect.y, width - 160);

    // Price or OWNED badge
    if (item.alreadyOwned) {
      this.changeTextColor(getTextColor.call(this, 3));
      this.drawText(T('Prosthetics.owned'), x + width - 160, rect.y, 160, "right");
    } else if (item.blockedReason) {
      this.changeTextColor(getTextColor.call(this, 7));
      this.drawText(item.blockedReason, x + width - 320, rect.y, 320, "right");
    } else {
      this.resetTextColor();
      this.drawText(formatPriceInEuros(item.cost), x + width - 160, rect.y, 160, "right");
    }

    // Second line: stat bonus + skill name
    const y2 = rect.y + this.lineHeight();
    const partSkillNames = skillNames(item.skillId);
    if (item.statEffect && item.statBonus > 0) {
      const paramName = getParamName(item.statEffect.param);
      const skillText = partSkillNames ? "  ★ " + partSkillNames : "";
      this.changeTextColor(getTextColor.call(this, 3));
      this.drawText(`${paramName} +${item.statBonus}${skillText}`, x, y2, width);
    } else if (partSkillNames) {
      this.changeTextColor(getTextColor.call(this, 6));
      this.drawText("★ " + partSkillNames, x, y2, width);
    }

    this.contents.paintOpacity = 255;
    this.resetTextColor();
  };

  Window_ArchetypePartList.prototype.refresh = function () {
    this.contents.clear();
    this.setupPartList();
    this.drawAllItems();
  };

  Window_ArchetypePartList.prototype.isOkEnabled = function () {
    const item = this._partList[this.index()];
    return !!(item && !item.alreadyOwned && !item.blockedReason);
  };

  Window_ArchetypePartList.prototype.processOk = function () {
    if (!this.isOkEnabled()) { SoundManager.playBuzzer(); return; }
    this.callHandler("ok");
  };

  Window_ArchetypePartList.prototype.getCurrentSelection = function () {
    return this._partList[this.index()];
  };

  // ===========================================================================
  // Window_RemovePartList  (Remove bodypart)
  // ===========================================================================
  function Window_RemovePartList() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_RemovePartList.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_RemovePartList.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_RemovePartList.prototype.constructor = Window_RemovePartList;

  Window_RemovePartList.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._partList = [];
    this.refresh();
  };

  Window_RemovePartList.prototype.setActor = function (actor) {
    this._actor = actor;
    this.refresh();
    this.select(0);
  };

  Window_RemovePartList.prototype.maxItems = function () { return this._partList.length; };
  Window_RemovePartList.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_RemovePartList.prototype.setupPartList = function () {
    this._partList = [];
    if (!this._actor || !this._actor._bodyParts) return;

    for (const partKey of Object.keys(this._actor._bodyParts)) {
      const part = this._actor._bodyParts[partKey];
      const hasImplant = !!(this._actor._prosthetics && this._actor._prosthetics[partKey]);
      const hpPercent = inferHpPercent(part, this._actor);
      const cost = hpPercent * 100;
      const statEffect = lookupStatEffect(partKey, part, this._actor);
      const statBonus = computeStatBonus(statEffect);

      this._partList.push({
        isRemoveBodypart: true,
        partKey,
        name: part.name || partKey,
        vital: isPartVital(this._actor, partKey, part),
        hasImplant,
        hpPercent,
        cost,
        statEffect,
        statBonus,
        skillId: part.skillId || 0,
      });
    }
  };

  Window_RemovePartList.prototype.drawItem = function (index) {
    const item = this._partList[index];
    if (!item) return;

    const rect = this.itemRect(index);
    const x = rect.x + 4;
    const width = rect.width - 8;
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

    if (item.vital) {
      this.contents.paintOpacity = 96;
      this.changeTextColor(getTextColor.call(this, 7));
    } else {
      this.contents.paintOpacity = 255;
      this.resetTextColor();
    }

    // Name  (* = has implant)
    const nameText = item.name + (item.hasImplant ? " *" : "");
    this.drawText(nameText, x, rect.y, width - 160);

    // VITAL badge or removal price
    if (item.vital) {
      this.changeTextColor(getTextColor.call(this, 18));
      this.drawText(T('Prosthetics.vitalBadge'), x + width - 160, rect.y, 160, "right");
    } else {
      this.resetTextColor();
      this.drawText(formatPriceInEuros(item.cost), x + width - 160, rect.y, 160, "right");
    }

    // Second line: stat loss + skill name
    const y2 = rect.y + this.lineHeight();
    const partSkillNames = skillNames(item.skillId);
    const skillText = partSkillNames ? "  ★ " + partSkillNames : "";
    if (item.statEffect && item.statBonus > 0) {
      const paramName = getParamName(item.statEffect.param);
      this.changeTextColor(getTextColor.call(this, 7));
      this.drawText(
        T('Prosthetics.loses', { p1: paramName, p2: item.statBonus }) + skillText,
        x, y2, width
      );
    } else if (skillText) {
      this.changeTextColor(getTextColor.call(this, 7));
      this.drawText("★ " + partSkillNames, x, y2, width);
    }

    this.contents.paintOpacity = 255;
    this.resetTextColor();
  };

  Window_RemovePartList.prototype.refresh = function () {
    this.contents.clear();
    this.setupPartList();
    this.drawAllItems();
  };

  Window_RemovePartList.prototype.isOkEnabled = function () {
    const item = this._partList[this.index()];
    return !!(item && !item.vital);
  };

  Window_RemovePartList.prototype.processOk = function () {
    if (!this.isOkEnabled()) { SoundManager.playBuzzer(); return; }
    this.callHandler("ok");
  };

  Window_RemovePartList.prototype.getCurrentSelection = function () {
    return this._partList[this.index()];
  };

  // ===========================================================================
  // Window_ConfirmRemove  (Yes/No when implant would be lost)
  // ===========================================================================
  function Window_ConfirmRemove() { this.initialize(...arguments); }
  Window_ConfirmRemove.prototype = Object.create(Window_Command.prototype);
  Window_ConfirmRemove.prototype.constructor = Window_ConfirmRemove;

  Window_ConfirmRemove.prototype.initialize = function () {
    const ww = Math.min(520, Math.floor(Graphics.boxWidth * 0.75));
    const wh = 3 * 36 + 24; // warning line + 2 choices
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_Command.prototype.initialize.call(this, new Rectangle(wx, wy, ww, wh));
    } else {
      Window_Command.prototype.initialize.call(this, wx, wy, ww, wh);
    }
  };

  Window_ConfirmRemove.prototype.makeCommandList = function () {
    this.addCommand(T('Prosthetics.yesRemoveIt'), "confirm", true);
    this.addCommand(T('Prosthetics.cancel'), "cancel", true);
  };

  // Push items down one line to leave room for the warning text
  Window_ConfirmRemove.prototype.itemRect = function (index) {
    const rect = Window_Command.prototype.itemRect.call(this, index);
    rect.y += this.lineHeight();
    return rect;
  };

  Window_ConfirmRemove.prototype.drawAllItems = function () {
    this.changeTextColor(getTextColor.call(this, 17)); // orange/yellow
    this.drawText(
      T('Prosthetics.warningImplantWillBeLost'),
      0, 0, this.contents.width, "center"
    );
    this.resetTextColor();
    Window_Command.prototype.drawAllItems.call(this);
  };

  // ===========================================================================
  // Window_ReplacePartList  (Replace bodypart – step A: pick part to replace)
  // ===========================================================================
  function Window_ReplacePartList() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_ReplacePartList.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_ReplacePartList.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_ReplacePartList.prototype.constructor = Window_ReplacePartList;

  Window_ReplacePartList.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._partList = [];
    this.refresh();
  };

  Window_ReplacePartList.prototype.setActor = function (actor) {
    this._actor = actor;
    this.refresh();
    this.select(0);
  };

  Window_ReplacePartList.prototype.maxItems = function () { return this._partList.length; };
  Window_ReplacePartList.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_ReplacePartList.prototype.setupPartList = function () {
    this._partList = [];
    const Archetypes = getArchetypes();
    if (!this._actor || !this._actor._bodyParts) return;

    for (const partKey of Object.keys(this._actor._bodyParts)) {
      const part = this._actor._bodyParts[partKey];
      const hpPercent = inferHpPercent(part, this._actor);
      const removalFee = hpPercent * 100;
      const statEffect = lookupStatEffect(partKey, part, this._actor);
      const statBonus = computeStatBonus(statEffect);

      // Only show parts that have at least one replacement option in any archetype
      let hasReplacement = false;
      if (Archetypes) {
        for (const archKey of Object.keys(Archetypes)) {
          const arch = Archetypes[archKey];
          if (arch && arch.parts && arch.parts[partKey]) { hasReplacement = true; break; }
        }
      }
      if (!hasReplacement) continue;

      this._partList.push({
        isReplaceSelectPart: true,
        partKey,
        name: part.name || partKey,
        vital: part.vital,
        hpPercent,
        removalFee,
        statEffect,
        statBonus,
      });
    }
  };

  Window_ReplacePartList.prototype.drawItem = function (index) {
    const item = this._partList[index];
    if (!item) return;

    const rect = this.itemRect(index);
    const x = rect.x + 4;
    const width = rect.width - 8;
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
    this.resetTextColor();

    this.drawText(item.name, x, rect.y, width - 160);

    // Show removal fee on the right
    this.changeTextColor(getTextColor.call(this, 17));
    this.drawText(
      T('Prosthetics.removal') + formatPriceInEuros(item.removalFee),
      x + width - 160, rect.y, 160, "right"
    );

    // Second line: vital badge or stat loss
    if (item.vital) {
      this.changeTextColor(getTextColor.call(this, 18));
      this.drawText(T('Prosthetics.vitalBadge'), x, rect.y + this.lineHeight(), width);
    } else if (item.statEffect && item.statBonus > 0) {
      const paramName = getParamName(item.statEffect.param);
      this.changeTextColor(getTextColor.call(this, 7));
      this.drawText(
        T('Prosthetics.loses', { p1: paramName, p2: item.statBonus }),
        x, rect.y + this.lineHeight(), width
      );
    }

    this.resetTextColor();
    this.contents.paintOpacity = 255;
  };

  Window_ReplacePartList.prototype.refresh = function () {
    this.contents.clear();
    this.setupPartList();
    this.drawAllItems();
  };

  Window_ReplacePartList.prototype.isOkEnabled = function () {
    return !!(this._partList[this.index()]);
  };

  Window_ReplacePartList.prototype.getCurrentSelection = function () {
    return this._partList[this.index()];
  };

  // ===========================================================================
  // Window_ReplaceArchetypePartList  (Replace bodypart – step B: pick replacement)
  // ===========================================================================
  function Window_ReplaceArchetypePartList() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_ReplaceArchetypePartList.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_ReplaceArchetypePartList.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_ReplaceArchetypePartList.prototype.constructor = Window_ReplaceArchetypePartList;

  Window_ReplaceArchetypePartList.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._partKey = null;
    this._removalFee = 0;
    this._partList = [];
    this.refresh();
  };

  Window_ReplaceArchetypePartList.prototype.setContext = function (actor, partKey, removalFee) {
    this._actor = actor;
    this._partKey = partKey;
    this._removalFee = removalFee || 0;
    this.refresh();
    this.select(0);
  };

  Window_ReplaceArchetypePartList.prototype.maxItems = function () { return this._partList.length; };
  Window_ReplaceArchetypePartList.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_ReplaceArchetypePartList.prototype.setupPartList = function () {
    this._partList = [];
    const Archetypes = getArchetypes();
    if (!this._partKey || !Archetypes) return;

    for (const archKey of Object.keys(Archetypes)) {
      const archetype = Archetypes[archKey];
      if (!archetype || !archetype.parts) continue;
      const part = archetype.parts[this._partKey];
      if (!part) continue;

      const installCost = part.hpPercent * 1000 + Math.abs((part.statEffect && part.statEffect.amount) || 0) * 10000;
      const totalCost = installCost + this._removalFee;
      const statBonus = computeStatBonus(part.statEffect);
      const partName = getTranslated(part, "name");
      const archLabel = archKey.replace(/([A-Z])/g, " $1").trim();

      this._partList.push({
        isReplacePart: true,
        partKey: this._partKey,
        archetypeKey: archKey,
        archetypeLabel: archLabel,
        name: partName,
        hpPercent: part.hpPercent,
        vital: part.vital,
        statEffect: part.statEffect || null,
        statBonus,
        skillId: part.skillId || 0,
        installCost,
        removalFee: this._removalFee,
        cost: totalCost,
        archPart: part,
      });
    }
  };

  Window_ReplaceArchetypePartList.prototype.drawItem = function (index) {
    const item = this._partList[index];
    if (!item) return;

    const rect = this.itemRect(index);
    const x = rect.x + 4;
    const width = rect.width - 8;
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
    this.resetTextColor();

    // Name + archetype source
    this.drawText(item.name, x, rect.y, width - 200);
    this.changeTextColor(getTextColor.call(this, 6));
    this.drawText("[" + item.archetypeLabel + "]", x + width - 380, rect.y, 180, "right");

    // Total cost
    this.resetTextColor();
    this.drawText(formatPriceInEuros(item.cost), x + width - 160, rect.y, 160, "right");

    // Second line: stat bonus + skill name
    const y2 = rect.y + this.lineHeight();
    const partSkillNames = skillNames(item.skillId);
    if (item.statEffect && item.statBonus > 0) {
      const paramName = getParamName(item.statEffect.param);
      const skillText = partSkillNames ? "  ★ " + partSkillNames : "";
      this.changeTextColor(getTextColor.call(this, 3));
      this.drawText(`${paramName} +${item.statBonus}${skillText}`, x, y2, width);
    } else if (partSkillNames) {
      this.changeTextColor(getTextColor.call(this, 6));
      this.drawText("★ " + partSkillNames, x, y2, width);
    }

    this.resetTextColor();
    this.contents.paintOpacity = 255;
  };

  Window_ReplaceArchetypePartList.prototype.refresh = function () {
    this.contents.clear();
    this.setupPartList();
    this.drawAllItems();
  };

  Window_ReplaceArchetypePartList.prototype.isOkEnabled = function () {
    return !!(this._partList[this.index()]);
  };

  Window_ReplaceArchetypePartList.prototype.getCurrentSelection = function () {
    return this._partList[this.index()];
  };

  // ===========================================================================
  // Window_BodyPartSelect  (Install implant – step A)
  // ===========================================================================
  function Window_BodyPartSelect() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_BodyPartSelect.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_BodyPartSelect.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_BodyPartSelect.prototype.constructor = Window_BodyPartSelect;

  Window_BodyPartSelect.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._bodyPartKeys = [];
    this.refresh();
    this.activate();
    this.select(0);
  };

  Window_BodyPartSelect.prototype.setActor = function (actor) {
    this._actor = actor;
    this.refresh();
    this.select(0);
  };

  Window_BodyPartSelect.prototype.colSpacing = function () { return 12; };
  Window_BodyPartSelect.prototype.maxCols = function () { return 2; };
  Window_BodyPartSelect.prototype.maxItems = function () { return this._bodyPartKeys.length; };
  Window_BodyPartSelect.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_BodyPartSelect.prototype.setupBodyParts = function () {
    if (!this._actor) { this._bodyPartKeys = []; return; }
    if (!this._actor._bodyParts) initializeBodyParts(this._actor);
    this._bodyPartKeys = implantablePartKeys(this._actor);
  };

  Window_BodyPartSelect.prototype.drawItem = function (index) {
    const partKey = this._bodyPartKeys[index];
    if (!partKey || !this._actor) return;

    const rect = this.itemRect(index);
    const part = this._actor._bodyParts[partKey];
    const currentProstheticKey = this._actor._prosthetics ? this._actor._prosthetics[partKey] : null;

    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
    this.resetTextColor();

    this.changeTextColor(getSystemColor.call(this));
    this.drawText(part.name, rect.x, rect.y, rect.width);
    this.resetTextColor();

    let statusText = T('Prosthetics.original');
    const ProstheticTypes = getProstheticTypes();
    if (currentProstheticKey && ProstheticTypes && ProstheticTypes[currentProstheticKey]) {
      const prosthetic = ProstheticTypes[currentProstheticKey];
      statusText = ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en;
      this.changeTextColor(getTextColor.call(this, 3));
    } else {
      this.changeTextColor(getTextColor.call(this, 0));
    }
    this.drawText(statusText, rect.x, rect.y + this.lineHeight(), rect.width);
    this.resetTextColor();
  };

  Window_BodyPartSelect.prototype.refresh = function () {
    this.contents.clear();
    this.setupBodyParts();
    this.drawAllItems();
  };

  Window_BodyPartSelect.prototype.getPartKey = function () {
    return this._bodyPartKeys[this.index()];
  };

  // ===========================================================================
  // Window_ProstheticList  (Install implant – step B)
  // ===========================================================================
  function Window_ProstheticList() { this.initialize(...arguments); }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_ProstheticList.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_ProstheticList.prototype = Object.create(Window_Selectable.prototype);
  }
  Window_ProstheticList.prototype.constructor = Window_ProstheticList;

  Window_ProstheticList.prototype.initialize = function () {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight - 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
    } else {
      Window_Selectable.prototype.initialize.call(this, 0, 0, width, height);
    }
    this._actor = null;
    this._partKey = null;
    this._prostheticList = [];
    this._selectedProsthetics = {};
    this.refresh();
  };

  Window_ProstheticList.prototype.setActor = function (actor) {
    this._actor = actor;
    this.refresh();
  };

  Window_ProstheticList.prototype.setPartKey = function (partKey) {
    if (this._partKey !== partKey) {
      this._partKey = partKey;
      this.refresh();
      this.select(0);
    }
  };

  Window_ProstheticList.prototype.maxItems = function () { return this._prostheticList.length; };
  Window_ProstheticList.prototype.itemHeight = function () { return this.lineHeight() * 2; };

  Window_ProstheticList.prototype.setupProstheticList = function () {
    this._prostheticList = [];
    if (!this._partKey || !this._actor) return;

    const currentProstheticKey = this._actor._prosthetics ? this._actor._prosthetics[this._partKey] : null;

    this._prostheticList.push({
      isRemoveOption: true,
      name: T('Prosthetics.removeCurrentProsthetic'),
      canRemove: !!currentProstheticKey,
      currentProsthetic: currentProstheticKey,
    });

    const ProstheticTypes = getProstheticTypes();
    const compatibleProsthetics = implantsForPart(this._partKey);
    for (var i = 0; i < compatibleProsthetics.length; i++) {
      const prostheticKey = compatibleProsthetics[i];
      const prosthetic = ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
      if (!prosthetic) continue;
      this._prostheticList.push({
        isProsthetic: true,
        partKey: this._partKey,
        prostheticKey,
        prosthetic,
        name: ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en,
        cost: prosthetic.cost,
        isCurrentlyInstalled: currentProstheticKey === prostheticKey,
      });
    }
  };

  Window_ProstheticList.prototype.drawItem = function (index) {
    const item = this._prostheticList[index];
    if (!item) return;

    const rect = this.itemRect(index);
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

    if (item.isRemoveOption) {
      this.changeTextColor(item.canRemove ? getTextColor.call(this, 17) : getTextColor.call(this, 7));
      this.drawText(item.name, rect.x, rect.y, rect.width, "center");
      if (item.currentProsthetic) {
        const ProstheticTypes = getProstheticTypes();
        const pData = ProstheticTypes ? ProstheticTypes[item.currentProsthetic] : null;
        const curName = pData ? (T.language() === "it" ? pData.name_it : pData.name_en) : T('Prosthetics.unknown');
        this.changeTextColor(getTextColor.call(this, 0));
        this.drawText(T('Prosthetics.current') + curName, rect.x, rect.y + this.lineHeight(), rect.width, "center");
      } else {
        this.changeTextColor(getTextColor.call(this, 7));
        this.drawText(T('Prosthetics.originalPart'), rect.x, rect.y + this.lineHeight(), rect.width, "center");
      }
    } else if (item.isProsthetic) {
      const x = rect.x + 12;
      const width = rect.width - 24;
      if (item.isCurrentlyInstalled) {
        this.contents.paintOpacity = 96;
        this.changeTextColor(getTextColor.call(this, 7));
      } else {
        this.contents.paintOpacity = 255;
        this.resetTextColor();
      }

      this.drawText(item.name, x, rect.y, width - 100);

      if (item.isCurrentlyInstalled) {
        this.drawText("---", x + width - 100, rect.y, 100, "right");
        this.changeTextColor(getTextColor.call(this, 3));
        this.drawText(T('Prosthetics.installed'), x + width - 200, rect.y, 100, "right");
      } else {
        this.drawText(formatPriceInEuros(item.cost), x + width - 100, rect.y, 100, "right");
      }

      const effectText = implantEffectText(item.prosthetic).join("  ");
      if (effectText) this.drawText(effectText, x, rect.y + this.lineHeight(), width);

      this.contents.paintOpacity = 255;
      this.resetTextColor();
    }
  };

  Window_ProstheticList.prototype.refresh = function () {
    this.contents.clear();
    this.setupProstheticList();
    this.drawAllItems();
  };

  Window_ProstheticList.prototype.isOkEnabled = function () {
    const item = this._prostheticList[this.index()];
    if (!item) return false;
    if (item.isRemoveOption) return item.canRemove;
    if (item.isProsthetic) return !item.isCurrentlyInstalled;
    return false;
  };

  Window_ProstheticList.prototype.processOk = function () {
    if (!this._prostheticList[this.index()]) return;
    this.callHandler("ok");
  };

  Window_ProstheticList.prototype.installProstheticImmediate = function (actor, partKey, prostheticKey) {
    const ProstheticTypes = getProstheticTypes();
    const prosthetic = ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
    if (!prosthetic) return;

    if (!actor._prosthetics) actor._prosthetics = {};
    if (!actor._prostheticEffects) actor._prostheticEffects = {};

    this.removeProstheticImmediate(actor, partKey);
    actor._prosthetics[partKey] = prostheticKey;

    if (prosthetic.effects) {
      for (const paramId in prosthetic.effects) {
        if (!actor._prostheticEffects[paramId]) actor._prostheticEffects[paramId] = 0;
        actor._prostheticEffects[paramId] += prosthetic.effects[paramId];
      }
    }

    skillIdList(prosthetic.skill).forEach((sid) => { if ($dataSkills[sid]) actor.learnSkill(sid); });

    const reproVarId = getReproductionVariableId(actor);
    if (prostheticKey === "UTERUS") $gameVariables.setValue(reproVarId, 1);
    else if (prostheticKey === "OVIDUCT") $gameVariables.setValue(reproVarId, 2);
    else if (prostheticKey === "SPORE_GLAND") $gameVariables.setValue(reproVarId, 3);
    else if (prostheticKey === "MITOSIS_GLAND") $gameVariables.setValue(reproVarId, 4);
    else if (prostheticKey === "TESTES") $gameVariables.setValue(reproVarId, 0);

    trainOnImplant(prostheticKey);
    actor.refresh();
  };

  Window_ProstheticList.prototype.removeProstheticImmediate = function (actor, partKey) {
    const currentProstheticKey = actor._prosthetics ? actor._prosthetics[partKey] : null;
    if (!currentProstheticKey) return;
    const ProstheticTypes = getProstheticTypes();
    const prosthetic = ProstheticTypes ? ProstheticTypes[currentProstheticKey] : null;
    if (!prosthetic) return;

    if (prosthetic.effects) {
      for (const paramId in prosthetic.effects) {
        if (actor._prostheticEffects && actor._prostheticEffects[paramId]) {
          actor._prostheticEffects[paramId] -= prosthetic.effects[paramId];
          if (actor._prostheticEffects[paramId] === 0) delete actor._prostheticEffects[paramId];
        }
      }
    }

    // What the augment taught goes with it, unless the limb it sat on (or
    // another augment) still owes that skill.
    if (window.HealthCore && window.HealthCore.forgetProstheticSkills) {
      window.HealthCore.forgetProstheticSkills(actor, partKey);
    } else {
      skillIdList(prosthetic.skill).forEach((sid) => actor.forgetSkill(sid));
    }

    const reproVarId = getReproductionVariableId(actor);
    if (["UTERUS", "OVIDUCT", "SPORE_GLAND", "MITOSIS_GLAND"].includes(currentProstheticKey)) {
      $gameVariables.setValue(reproVarId, 0);
    }

    delete actor._prosthetics[partKey];
    actor.refresh();
  };

  Window_ProstheticList.prototype.getCurrentSelection = function () {
    return this._prostheticList[this.index()];
  };

  // ===========================================================================
  // Window_ProstheticCost  (bottom info bar – shared by all flows)
  // ===========================================================================
  function Window_ProstheticCost() { this.initialize(...arguments); }
  Window_ProstheticCost.prototype = Object.create(Window_Base.prototype);
  Window_ProstheticCost.prototype.constructor = Window_ProstheticCost;

  Window_ProstheticCost.prototype.initialize = function () {
    const height = 120;
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_Base.prototype.initialize.call(this, new Rectangle(0, Graphics.boxHeight - height, Graphics.boxWidth, height));
    } else {
      Window_Base.prototype.initialize.call(this, 0, Graphics.boxHeight - height, Graphics.boxWidth, height);
    }
    this._totalCost = 0;
    this._selection = null;
    this.refresh();
  };

  Window_ProstheticCost.prototype.setSelection = function (item) {
    this._selection = item;
    this._totalCost = (item && item.cost) ? item.cost : 0;
    this.refresh();
  };

  Window_ProstheticCost.prototype.refresh = function () {
    this.contents.clear();
    const sel = this._selection;
    const w = this.contents.width - 12;

    // Line 1: cost
    if (sel && sel.isProsthetic && !sel.isCurrentlyInstalled) {
      this.drawText(T('Prosthetics.cost') + formatPriceInEuros(this._totalCost), 6, 0, w);
    } else if (sel && sel.isRemoveOption && sel.canRemove) {
      this.drawText(T('Prosthetics.removalFree'), 6, 0, w);
    } else if (sel && sel.isArchetypePart && !sel.alreadyOwned) {
      this.drawText(T('Prosthetics.cost') + formatPriceInEuros(this._totalCost), 6, 0, w);
    } else if (sel && sel.isRemoveBodypart && !sel.vital) {
      this.drawText(T('Prosthetics.removal2') + formatPriceInEuros(this._totalCost), 6, 0, w);
    } else if (sel && sel.isReplaceSelectPart) {
      this.drawText(
        T('Prosthetics.removalFee') + formatPriceInEuros(sel.removalFee),
        6, 0, w
      );
    } else if (sel && sel.isReplacePart) {
      this.drawText(
        T('Prosthetics.total') + formatPriceInEuros(sel.cost) +
        "  (" + T('Prosthetics.install') + formatPriceInEuros(sel.installCost) +
        " + " + T('Prosthetics.removal') + formatPriceInEuros(sel.removalFee) + ")",
        6, 0, w
      );
    } else {
      this.drawText(T('Prosthetics.cost2'), 6, 0, w);
    }

    // Line 2: current money
    this.drawText(
      T('Prosthetics.currentMoney') + formatPriceInEuros($gameParty.gold()),
      6, this.lineHeight(), w
    );
    this.resetTextColor();
  };

  Window_ProstheticCost.prototype.canAfford = function () {
    return $gameParty.gold() >= this._totalCost && this._totalCost > 0;
  };

  // ===========================================================================
  // ===========================================================================
  // UIShopInputManager (High-performance keyboard & gamepad menu navigator)
  // ===========================================================================
  class UIShopInputManager {
    static init(container, scene) {
      this.container = container;
      this.scene = scene;
      this.activeElements = [];
      this.focusIndex = 0;
      this.actionElements = [];
      this.actionIndex = 0;
      this.mode = 'list'; // 'list' or 'actions'
      this.active = false;
    }

    // The ring walks every control on the page in reading order, the one Back
    // stamp at the top of it included. Only some of them are rows of the list,
    // so a row says which entry it is with data-row rather than by its place in
    // the ring.
    static activate() {
      this.activeElements = Array.from(this.container.querySelectorAll('.focusable'));
      this.actionElements = Array.from(this.container.querySelectorAll('.action-focusable'));
      this.focusIndex = Math.max(0, this.activeElements.findIndex((el) => el.dataset.row !== undefined));
      this.actionIndex = 0;
      this.mode = 'list';
      this.active = true;
      this.updateFocus();
    }

    // Which entry of _activeListItems the element stands for, or -1 for a
    // control that is not a row.
    static rowOf(el) {
      const raw = el && el.dataset ? el.dataset.row : undefined;
      return raw === undefined ? -1 : parseInt(raw, 10);
    }

    static focusedRow() {
      return this.rowOf(this.activeElements[this.focusIndex]);
    }

    // Put the cursor on one entry of the list, wherever it sits in the ring.
    static focusRow(row) {
      const idx = this.activeElements.findIndex((el) => this.rowOf(el) === row);
      if (idx >= 0) this.focusIndex = idx;
    }

    static deactivate() {
      this.active = false;
    }

    static update() {
      if (!this.active) return;

      // Bumpers (L1/R1) cycle the active patient outside the picker view.
      if (this.scene && this.scene._viewState !== 'party' && $gameParty.members().length > 1) {
        if (Input.isTriggered('pagedown')) { this.scene.cyclePatient(1); return; }
        if (Input.isTriggered('pageup')) { this.scene.cyclePatient(-1); return; }
      }

      if (this.mode === 'list') {
        this.updateListNavigation();
      } else if (this.mode === 'actions') {
        this.updateActionsNavigation();
      }
    }

    static updateListNavigation() {
      if (this.activeElements.length === 0) {
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
          SoundManager.playCancel();
          this.scene.onUICancel();
        }
        return;
      }

      let moved = false;
      const len = this.activeElements.length;

      if (Input.isTriggered('down') || Input.isRepeated('down')) {
        this.focusIndex = (this.focusIndex + 1) % len;
        moved = true;
      } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
        this.focusIndex = (this.focusIndex - 1 + len) % len;
        moved = true;
      }

      if (Input.isTriggered('ok')) {
        const el = this.activeElements[this.focusIndex];
        if (el) {
          SoundManager.playOk();
          el.click();
        }
        return;
      }

      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.scene.onUICancel();
        return;
      }

      if (moved) {
        SoundManager.playCursor();
        this.updateFocus();
        this.scene.onUIFocusChange(this.focusedRow());
      }
    }

    static updateActionsNavigation() {
      if (this.actionElements.length === 0) {
        this.mode = 'list';
        return;
      }

      let moved = false;
      const len = this.actionElements.length;

      if (Input.isTriggered('right')) {
        if (this.actionIndex + 1 < len) {
          this.actionIndex += 1;
        } else {
          this.actionIndex = 0;
        }
        moved = true;
      } else if (Input.isTriggered('left')) {
        if (this.actionIndex - 1 >= 0) {
          this.actionIndex -= 1;
        } else {
          this.actionIndex = len - 1;
        }
        moved = true;
      } else if (Input.isTriggered('ok')) {
        const el = this.actionElements[this.actionIndex];
        if (el) {
          // A greyed out button is refused here too: the keyboard must not be
          // a way around a price the mouse is stopped by.
          if (el.classList.contains('disabled')) {
            SoundManager.playBuzzer();
            return;
          }
          el.click();
        }
        return;
      } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.mode = 'list';
        this.updateFocus();
        return;
      }

      if (moved) {
        SoundManager.playCursor();
        this.updateFocus();
      }
    }

    static updateFocus() {
      this.activeElements.forEach((el, idx) => {
        if (this.mode === 'list' && idx === this.focusIndex) {
          el.classList.add('selected');
          el.scrollIntoView({ block: 'nearest' });
        } else {
          el.classList.remove('selected');
        }
      });

      this.actionElements.forEach((el, idx) => {
        if (this.mode === 'actions' && idx === this.actionIndex) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });
    }
  }

  // Helper Implant Install/Remove procedures (isolated from windows)
  function installProstheticImmediate(actor, partKey, prostheticKey) {
    const ProstheticTypes = getProstheticTypes();
    const prosthetic = ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
    if (!prosthetic) return;

    if (!actor._prosthetics) actor._prosthetics = {};
    if (!actor._prostheticEffects) actor._prostheticEffects = {};

    removeProstheticImmediate(actor, partKey);
    actor._prosthetics[partKey] = prostheticKey;

    if (prosthetic.effects) {
      for (const paramId in prosthetic.effects) {
        if (!actor._prostheticEffects[paramId]) actor._prostheticEffects[paramId] = 0;
        actor._prostheticEffects[paramId] += prosthetic.effects[paramId];
      }
    }

    skillIdList(prosthetic.skill).forEach((sid) => { if ($dataSkills[sid]) actor.learnSkill(sid); });

    const reproVarId = getReproductionVariableId(actor);
    if (prostheticKey === "UTERUS") $gameVariables.setValue(reproVarId, 1);
    else if (prostheticKey === "OVIDUCT") $gameVariables.setValue(reproVarId, 2);
    else if (prostheticKey === "SPORE_GLAND") $gameVariables.setValue(reproVarId, 3);
    else if (prostheticKey === "MITOSIS_GLAND") $gameVariables.setValue(reproVarId, 4);
    else if (prostheticKey === "TESTES") $gameVariables.setValue(reproVarId, 0);

    trainOnImplant(prostheticKey);
    actor.refresh();
  }

  function removeProstheticImmediate(actor, partKey) {
    const currentProstheticKey = actor._prosthetics ? actor._prosthetics[partKey] : null;
    if (!currentProstheticKey) return;
    const ProstheticTypes = getProstheticTypes();
    const prosthetic = ProstheticTypes ? ProstheticTypes[currentProstheticKey] : null;
    if (!prosthetic) return;

    if (prosthetic.effects) {
      for (const paramId in prosthetic.effects) {
        if (actor._prostheticEffects && actor._prostheticEffects[paramId]) {
          actor._prostheticEffects[paramId] -= prosthetic.effects[paramId];
          if (actor._prostheticEffects[paramId] === 0) delete actor._prostheticEffects[paramId];
        }
      }
    }

    // What the augment taught goes with it, unless the limb it sat on (or
    // another augment) still owes that skill.
    if (window.HealthCore && window.HealthCore.forgetProstheticSkills) {
      window.HealthCore.forgetProstheticSkills(actor, partKey);
    } else {
      skillIdList(prosthetic.skill).forEach((sid) => actor.forgetSkill(sid));
    }

    const reproVarId = getReproductionVariableId(actor);
    if (["UTERUS", "OVIDUCT", "SPORE_GLAND", "MITOSIS_GLAND"].includes(currentProstheticKey)) {
      $gameVariables.setValue(reproVarId, 0);
    }

    delete actor._prosthetics[partKey];
    actor.refresh();
  }

  // Fitting and pulling an augment, for the callers that are not this shop:
  // the augmented origin fits the party's starting hardware through it, so a
  // stat bonus, a learned skill and a reproduction change are all applied the
  // one way rather than reimplemented per caller.
  window.ProstheticShop = window.ProstheticShop || {};
  window.ProstheticShop.installImplant = installProstheticImmediate;
  window.ProstheticShop.removeImplant = removeProstheticImmediate;
  window.ProstheticShop.inventoryBodyParts = getInventoryBodyParts;

  function getGenderName(actor) {
    const idx = $gameParty.members().indexOf(actor);
    const varId = [38, 39, 40][idx] !== undefined ? [38, 39, 40][idx] : 38;
    const val = $gameVariables.value(varId);
    return T.list('Prosthetics.genderNames')[val] || T('Prosthetics.notAvailable');
  }

  function getReproductionName(actor) {
    const varId = getReproductionVariableId(actor);
    const val = $gameVariables.value(varId);
    const names = T.obj('Prosthetics.reproductionNames') || {};
    return names[val] || T('Prosthetics.notAvailable');
  }

  // ===========================================================================
  // Scene_ProstheticShop - Beautiful custom DOM parchment character manual
  // ===========================================================================
  function Scene_ProstheticShop() { this.initialize(...arguments); }
  Scene_ProstheticShop.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_ProstheticShop.prototype.constructor = Scene_ProstheticShop;

  Scene_ProstheticShop.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    this._selectedActor = null;
    this._selectedArchetypeKey = null;
    this._selectedPartKey = null;
    this._removalFee = 0;
    this._viewState = 'party'; // 'party', 'command', 'install_archetype', 'install_part', 'remove_part', 'replace_part', 'replace_archetype', 'implant_select_part', 'implant_select_prosthetic', 'surgeon_select', 'socket_select'
    this._activeListItems = [];
    this._notification = null;
    this._notificationTimeout = null;
    this._focusedRow = -1;
    this._dailyArchetypes = null;
    // Field surgery: the plugin command sets the flag, and the scene keeps it
    // for its whole life. Nothing is bought here and no augment goes in.
    this._fieldMode = !!(window.$gameTemp && $gameTemp._fieldSurgeryMode);
    if (window.$gameTemp) $gameTemp._fieldSurgeryMode = false;
    this._surgeon = null;
  };

  // In the field nothing is paid for: the party is spending its own supplies
  // and somebody's steady hand, not a clinic's time.
  Scene_ProstheticShop.prototype.priceOf = function (cost) {
    return this._fieldMode ? 0 : (cost || 0);
  };

  Scene_ProstheticShop.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    // Name the skill this menu runs on while it is open.
    if (window.SpecBadge) window.SpecBadge.show('Surgery');  // i18n-ignore  Specialization.json id

    // Inject styles unique to this scene
    this._dndContainer = document.createElement('div');
    this._dndContainer.id = 'menu-container';
    document.body.appendChild(this._dndContainer);

    this._onContextMenu = (event) => {
      event.preventDefault();
    };
    window.addEventListener("contextmenu", this._onContextMenu);

    UIShopInputManager.init(this._dndContainer, this);
    const _seedData = $gameTemp._prostheticShopSeedData;
    if (_seedData) {
      this._dailyArchetypes = getDailyProstheticArchetypes(_seedData.mapId, _seedData.x, _seedData.y);
      $gameTemp._prostheticShopSeedData = null;
    }
    this._viewState = 'party';
    this.refreshUIShopDOM();

    // Tab cycles the patient outside the picker view (no controller connected).
    window.CharSwitcher.installTabKey(this, (dir) => {
      if (this._viewState !== 'party') this.cyclePatient(dir);
    });
  };

  Scene_ProstheticShop.prototype.terminate = function () {
    Scene_MenuBase.prototype.terminate.call(this);
    window.CharSwitcher.removeTabKey(this);
    if (this._dndContainer) {
      document.body.removeChild(this._dndContainer);
      this._dndContainer = null;
    }
    UIShopInputManager.deactivate();
    if (this._notificationTimeout) {
      clearTimeout(this._notificationTimeout);
      this._notificationTimeout = null;
    }
    if (this._onContextMenu) {
      window.removeEventListener("contextmenu", this._onContextMenu);
    }
  };

  Scene_ProstheticShop.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    UIShopInputManager.update();
  };

  // A transient line about what just happened on the table. The game has one
  // notification service (Core/ParchmentToast.js) and this screen does not
  // draw a second one of its own.
  Scene_ProstheticShop.prototype.showClinicNotification = function (msg) {
    if (!msg) return;
    if (window.ParchmentToast) window.ParchmentToast.show(msg);
  };

  // ==========================================================================
  // The page as data
  //
  // Everything from here down decides WHAT the screen says. The markup that
  // says it lives in Health_ProstheticShopUI.js (docs/task/ui_fixing.md, "The
  // plugin split"): this file builds no tag and names no colour.
  // ==========================================================================

  // The heading, the brief under it, and this._activeListItems, for whichever
  // step of the flow the scene is standing on. The rows carry data only; how a
  // row is drawn is the UI module's business.
  Scene_ProstheticShop.prototype.buildPage = function () {
    this._activeListItems = [];
    const builder = {
      party: this.pageParty,
      surgeon_select: this.pageSurgeon,
      command: this.pageCommand,
      install_archetype: this.pageArchetypes,
      install_part: this.pageArchetypeParts,
      install_inventory: this.pageInventoryParts,
      remove_part: this.pageRemovable,
      replace_part: this.pageReplaceable,
      replace_archetype: this.pageReplacements,
      socket_select: this.pageSockets,
      implant_select_part: this.pageImplantSockets,
      implant_select_prosthetic: this.pageImplants
    }[this._viewState];
    const page = builder ? builder.call(this) : { title: "", brief: "" };
    page.kind = this._viewState;
    return page;
  };

  Scene_ProstheticShop.prototype.pageParty = function () {
    return {
      title: T('Prosthetics.hospitalRegister'),
      brief: T('Prosthetics.selectAPatientToInspectVitalSystemsPerformBi')
    };
  };

  Scene_ProstheticShop.prototype.pageSurgeon = function () {
    $gameParty.members().forEach((actor) => {
      const odds = surgeryOdds(actor, this._selectedActor);
      this._activeListItems.push({
        isSurgeon: true, actor, odds, levelName: specLevelName(odds.level)
      });
    });
    return {
      title: T('Prosthetics.chooseSurgeon'),
      brief: T('Prosthetics.chooseSurgeonDesc', { p1: this._selectedActor ? this._selectedActor.name() : "" })
    };
  };

  Scene_ProstheticShop.prototype.pageCommand = function () {
    // In the field only what is already in the pack can be fitted, an augment
    // may be taken out but never seated, and nothing is for sale.
    const commands = this._fieldMode
      ? [
          { cmd: 'inventory', icon: 176, label: T('Prosthetics.installFromInventory') },
          { cmd: 'remove', icon: 196, label: T('Prosthetics.removeBodypart') },
          { cmd: 'implant', icon: 128, label: T('Prosthetics.removeAugment') }
        ]
      : [
          { cmd: 'install', icon: 189, label: T('Prosthetics.installBodypart') },
          { cmd: 'inventory', icon: 176, label: T('Prosthetics.installFromInventory') },
          { cmd: 'remove', icon: 196, label: T('Prosthetics.removeBodypart') },
          { cmd: 'replace', icon: 180, label: T('Prosthetics.replaceBodypart') },
          { cmd: 'implant', icon: 128, label: T('Prosthetics.installImplant') }
        ];
    return {
      title: this._fieldMode ? T('Prosthetics.fieldTheatre') : T('Prosthetics.biologicLaboratory'),
      brief: this._fieldMode
        ? T('Prosthetics.fieldTheatreDesc', {
            p1: this._selectedActor ? this._selectedActor.name() : "",
            p2: this._surgeon ? this._surgeon.name() : "",
            p3: this.currentOdds().chance
          })
        : T('Prosthetics.performHeavyIndustryLimbConfigurationsOrMicr', { p1: this._selectedActor ? this._selectedActor.name() : "" }),
      commands
    };
  };

  // The archetypes a supplier has on the shelf today.
  Scene_ProstheticShop.prototype.archetypeKeys = function () {
    const Archetypes = getArchetypes();
    if (!Archetypes) return [];
    return this._dailyArchetypes
      ? this._dailyArchetypes.filter((k) => Archetypes[k])
      : Object.keys(Archetypes);
  };

  Scene_ProstheticShop.prototype.pageArchetypes = function () {
    const count = this._dailyArchetypes ? this._dailyArchetypes.length : 0;
    this._activeListItems.push({
      isArchetypeChoice: true, key: '__INVENTORY__', name: T('Prosthetics.inventoryOwnedParts')
    });
    for (const key of this.archetypeKeys()) {
      this._activeListItems.push({ isArchetypeChoice: true, key, name: archetypeLabel(key) });
    }
    return {
      title: T('Prosthetics.archetypeDissect'),
      brief: T('Prosthetics.chooseArchetypeCode') + (count ? T('Prosthetics.suppliersAvailable', { count }) : "")
    };
  };

  Scene_ProstheticShop.prototype.pageArchetypeParts = function () {
    const Archetypes = getArchetypes();
    const archetype = (this._selectedArchetypeKey && Archetypes) ? Archetypes[this._selectedArchetypeKey] : null;
    if (archetype && archetype.parts) {
      // A party with a surgeon in it pays for the parts, not for the theatre.
      const surgeonRate = window.SpecializationXP
        ? window.SpecializationXP.discount(SURGERY_SPEC, 0.06, 0.7) : 1;
      for (const partKey of Object.keys(archetype.parts)) {
        const part = archetype.parts[partKey];
        if (part.vital) continue;
        const keyLower = partKey.toLowerCase();
        const nameLower = (part.name || "").toLowerCase();
        if (keyLower.includes("core") || keyLower.includes("body") ||
          nameLower.includes("core") || nameLower.includes("body") ||
          nameLower.includes("head")) continue;

        const partName = getTranslated(part, "name").toLowerCase();
        let alreadyOwned = !!(this._selectedActor && this._selectedActor._bodyParts && this._selectedActor._bodyParts[partKey]);
        if (!alreadyOwned && this._selectedActor && this._selectedActor._bodyParts) {
          for (const existingKey in this._selectedActor._bodyParts) {
            const existingName = (this._selectedActor._bodyParts[existingKey].name || "").toLowerCase();
            if (existingName && partName.includes(existingName)) { alreadyOwned = true; break; }
          }
        }
        const cost = Math.round((part.hpPercent * 1000 +
          Math.abs((part.statEffect && part.statEffect.amount) || 0) * 10000) * surgeonRate);

        this._activeListItems.push({
          isArchetypePart: true,
          partKey,
          blockedReason: graftBlockedReason(this._selectedActor, partKey),
          archetypeKey: this._selectedArchetypeKey,
          name: getTranslated(part, "name"),
          hpPercent: part.hpPercent,
          vital: part.vital,
          statEffect: part.statEffect || null,
          statBonus: computeStatBonus(part.statEffect),
          skillId: part.skillId || 0,
          cost,
          alreadyOwned,
          archPart: part
        });
      }
    }
    return {
      title: T('Prosthetics.surgicalCatalog'),
      brief: T('Prosthetics.selectALimbOrOrganToGraftFromTheSource', { p1: archetypeLabel(this._selectedArchetypeKey) })
    };
  };

  Scene_ProstheticShop.prototype.pageInventoryParts = function () {
    this._activeListItems = getInventoryBodyParts(this._selectedActor);
    this._activeListItems.forEach((entry) => {
      entry.alreadyOwned = !!(this._selectedActor && this._selectedActor._bodyParts &&
        this._selectedActor._bodyParts[entry.partKey]);
      entry.archetypeLabel = archetypeLabel(entry.archetypeKey);
    });
    return {
      title: T('Prosthetics.inventoryParts'),
      brief: T('Prosthetics.installBodyPartsYouAlreadyOwnInstallationFee', { p1: formatPriceInEuros(INSTALLATION_FEE) })
    };
  };

  Scene_ProstheticShop.prototype.pageRemovable = function () {
    if (this._selectedActor && this._selectedActor._bodyParts) {
      for (const partKey of Object.keys(this._selectedActor._bodyParts)) {
        const part = this._selectedActor._bodyParts[partKey];
        const hpPercent = inferHpPercent(part, this._selectedActor);
        const statEffect = lookupStatEffect(partKey, part, this._selectedActor);
        this._activeListItems.push({
          isRemoveBodypart: true,
          partKey,
          name: part.name || partKey,
          vital: isPartVital(this._selectedActor, partKey, part),
          hasImplant: !!(this._selectedActor._prosthetics && this._selectedActor._prosthetics[partKey]),
          hpPercent,
          cost: hpPercent * 100,
          statEffect,
          statBonus: computeStatBonus(statEffect),
          skillId: part.skillId || 0
        });
      }
    }
    return {
      title: T('Prosthetics.extractSystems'),
      brief: T('Prosthetics.chooseAnActiveLimbOrOrganToRemoveVitalOrgans')
    };
  };

  Scene_ProstheticShop.prototype.pageReplaceable = function () {
    const Archetypes = getArchetypes();
    if (this._selectedActor && this._selectedActor._bodyParts) {
      for (const partKey of Object.keys(this._selectedActor._bodyParts)) {
        const part = this._selectedActor._bodyParts[partKey];
        let hasReplacement = false;
        if (Archetypes) {
          for (const archKey of Object.keys(Archetypes)) {
            const arch = Archetypes[archKey];
            if (arch && arch.parts && arch.parts[partKey]) { hasReplacement = true; break; }
          }
        }
        if (!hasReplacement) continue;

        const hpPercent = inferHpPercent(part, this._selectedActor);
        const statEffect = lookupStatEffect(partKey, part, this._selectedActor);
        this._activeListItems.push({
          isReplaceSelectPart: true,
          partKey,
          name: part.name || partKey,
          vital: part.vital,
          hpPercent,
          removalFee: hpPercent * 100,
          statEffect,
          statBonus: computeStatBonus(statEffect)
        });
      }
    }
    return {
      title: T('Prosthetics.replaceSystem'),
      brief: T('Prosthetics.chooseAnActiveBiologicalPartToReplaceWithAnA')
    };
  };

  Scene_ProstheticShop.prototype.pageReplacements = function () {
    const Archetypes = getArchetypes();
    if (this._selectedPartKey && Archetypes) {
      for (const archKey of this.archetypeKeys()) {
        const archetype = Archetypes[archKey];
        if (!archetype || !archetype.parts) continue;
        const part = archetype.parts[this._selectedPartKey];
        if (!part) continue;

        const installCost = part.hpPercent * 1000 + Math.abs((part.statEffect && part.statEffect.amount) || 0) * 10000;
        this._activeListItems.push({
          isReplacePart: true,
          partKey: this._selectedPartKey,
          archetypeKey: archKey,
          archetypeLabel: archetypeLabel(archKey),
          name: getTranslated(part, "name"),
          hpPercent: part.hpPercent,
          vital: part.vital,
          statEffect: part.statEffect || null,
          statBonus: computeStatBonus(part.statEffect),
          skillId: part.skillId || 0,
          installCost,
          removalFee: this._removalFee,
          cost: installCost + this._removalFee,
          archPart: part
        });
      }
    }
    return {
      title: T('Prosthetics.selectReplacement'),
      brief: T('Prosthetics.chooseAReplacementDeviceModelToInstallOntoPa', { p1: this._selectedPartKey || "" })
    };
  };

  // A hand or a foot has to go somewhere, and with more than one bare limb
  // going the patient says which. Sides mean nothing here: the list is every
  // arm and leg with a free end, and any of them takes either.
  Scene_ProstheticShop.prototype.pageSockets = function () {
    const HC = window.HealthCore;
    const sockets = (HC && HC.openLimbSockets) ? HC.openLimbSockets(this._selectedActor) : [];
    sockets.forEach((partKey) => {
      const part = this._selectedActor._bodyParts[partKey];
      this._activeListItems.push({ isSocket: true, partKey, name: (part && part.name) || partKey, cost: 0 });
    });
    const pending = this._pendingGraft;
    return {
      title: T('Prosthetics.attachmentPoint'),
      brief: T('Prosthetics.chooseAttachmentPoint', { p1: (pending && pending.item.name) || "" })
    };
  };

  Scene_ProstheticShop.prototype.pageImplantSockets = function () {
    for (const partKey of implantablePartKeys(this._selectedActor)) {
      const part = this._selectedActor._bodyParts[partKey];
      const currentProstheticKey = this._selectedActor._prosthetics ? this._selectedActor._prosthetics[partKey] : null;
      this._activeListItems.push({
        isImplantSocket: true,
        partKey,
        name: part.name,
        currentProstheticKey,
        currentProstheticName: implantName(currentProstheticKey) || T('Prosthetics.original')
      });
    }
    return {
      title: T('Prosthetics.chooseSocket'),
      brief: T('Prosthetics.chooseAnImplantCompatibleBiologicalOrCyberne')
    };
  };

  Scene_ProstheticShop.prototype.pageImplants = function () {
    if (this._selectedPartKey && this._selectedActor) {
      const currentProstheticKey = this._selectedActor._prosthetics ? this._selectedActor._prosthetics[this._selectedPartKey] : null;
      this._activeListItems.push({
        isRemoveOption: true,
        name: T('Prosthetics.removeCurrentProsthetic'),
        canRemove: !!currentProstheticKey,
        currentProsthetic: currentProstheticKey,
        note: currentProstheticKey ? T('Prosthetics.uninstallActiveDevice') : T('Prosthetics.limbHasOriginalPart')
      });

      const ProstheticTypes = getProstheticTypes();
      // Nothing new goes in out here: a field kit can take an augment out, but
      // seating one needs a bench nobody is carrying.
      const compatible = this._fieldMode ? [] : implantsForPart(this._selectedPartKey);
      for (const prostheticKey of compatible) {
        const prosthetic = ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
        if (!prosthetic) continue;
        this._activeListItems.push({
          isProsthetic: true,
          partKey: this._selectedPartKey,
          prostheticKey,
          prosthetic,
          name: implantName(prostheticKey),
          note: implantEffectText(prosthetic).join(" | "),
          cost: prosthetic.cost,
          isCurrentlyInstalled: currentProstheticKey === prostheticKey
        });
      }
    }
    return {
      title: this._fieldMode ? T('Prosthetics.removeAugment') : T('Prosthetics.prostheticsList'),
      brief: this._fieldMode
        ? T('Prosthetics.fieldAugmentRemovalDesc')
        : T('Prosthetics.selectAnAdvancedMicroChipOrProstheticImplant', { p1: this._selectedPartKey || "" })
    };
  };

  // The facing page for the row in hand: a dossier for a surgeon, a note for a
  // socket, and for anything that is an operation, its price and its button.
  Scene_ProstheticShop.prototype.previewModel = function (item) {
    if (!item) return null;

    if (item.isSurgeon) {
      return { kind: 'surgeon', name: item.actor.name(), odds: item.odds, levelName: item.levelName };
    }
    if (item.isSocket) {
      return {
        kind: 'socket',
        socketName: item.name,
        fitting: this._pendingGraft ? this._pendingGraft.item.name : ""
      };
    }
    if (item.isArchetypeChoice || item.isImplantSocket || item.isReplaceSelectPart) return null;

    const state = this._viewState;
    let model = null;
    if (state === 'install_part' || state === 'install_inventory') {
      model = {
        title: T('Prosthetics.surgicalBlueprint'),
        desc: T('Prosthetics.thisSurgeryWillPermanentlyGraftANewOntoSBiol', { p1: item.name, p2: this._selectedActor.name() }),
        actionLabel: T('Prosthetics.graftLimb'),
        actionSymbol: "install"
      };
    } else if (state === 'remove_part') {
      model = {
        title: T('Prosthetics.amputationProtocol'),
        desc: item.vital
          ? T('Prosthetics.criticalVitalPartsCannotBeAmputatedWithoutCa')
          : T('Prosthetics.surgicallyAmputatingWillRemoveAllItsStatBonu', { p1: item.name }),
        warning: (!item.vital && item.hasImplant) ? T('Prosthetics.implantWarning') : "",
        actionLabel: T('Prosthetics.amputate'),
        actionSymbol: "remove"
      };
    } else if (state === 'replace_archetype') {
      model = {
        title: T('Prosthetics.upgradeProtocol'),
        desc: T('Prosthetics.performFullSwapOfTheCurrentLimbForACustomize', { p1: item.name }),
        actionLabel: T('Prosthetics.replaceSystem2'),
        actionSymbol: "replace"
      };
    } else if (state === 'implant_select_prosthetic') {
      model = item.isRemoveOption
        ? {
            title: T('Prosthetics.reconfigurationProtocol'),
            desc: T('Prosthetics.uninstallTheCurrentlyEquippedProstheticDevic'),
            actionLabel: T('Prosthetics.uninstall'),
            actionSymbol: "remove_implant",
            free: true
          }
        : {
            title: T('Prosthetics.implantProtocol'),
            desc: T('Prosthetics.installTheAdvancedProstheticMicroDeviceInsid', { p1: item.name }),
            actionLabel: T('Prosthetics.installImplant2'),
            actionSymbol: "install_implant"
          };
    }
    if (!model) return null;

    model.kind = 'operation';
    model.cost = model.free ? 0 : this.priceOf(item.cost);
    model.costText = model.free ? T('Prosthetics.free') : formatPriceInEuros(model.cost);
    model.enabled = this.canPerformAction(model.actionSymbol, item);
    model.ledger = this._fieldMode
      ? { field: true, chance: this.currentOdds().chance, breakdown: this.oddsBreakdownText() }
      : { field: false, affordable: $gameParty.gold() >= model.cost, funds: formatPriceInEuros($gameParty.gold()) };
    return model;
  };

  Scene_ProstheticShop.prototype.refreshUIShopDOM = function () {
    if (!this._dndContainer) return;
    this._page = this.buildPage();
    window.ProstheticShopUI.render(this);
  };

  // The row the ring is standing on changed: the facing page follows it.
  Scene_ProstheticShop.prototype.onUIFocusChange = function (rowIndex) {
    this._focusedRow = rowIndex;
    this.refreshRightPageSurgeryPreview(rowIndex);
  };

  Scene_ProstheticShop.prototype.refreshRightPageSurgeryPreview = function (rowIndex) {
    const item = rowIndex >= 0 ? this._activeListItems[rowIndex] : null;
    window.ProstheticShopUI.renderPreview(this, this.previewModel(item), item);
  };

  Scene_ProstheticShop.prototype.onUICancel = function () {
    if (this._viewState === 'party') {
      this.popScene();
    } else if (this._viewState === 'surgeon_select') {
      this._viewState = 'party';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'command') {
      this._viewState = this._fieldMode ? 'surgeon_select' : 'party';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'install_archetype') {
      this._viewState = 'command';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'install_part') {
      this._viewState = 'install_archetype';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'install_inventory') {
      this._viewState = this._fieldMode ? 'command' : 'install_archetype';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'remove_part') {
      this._viewState = 'command';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'replace_part') {
      this._viewState = 'command';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'replace_archetype') {
      this._viewState = 'replace_part';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'socket_select') {
      // Backing out abandons the graft, and nothing has been charged for it:
      // the limb is chosen before the knife comes out.
      this._viewState = (this._pendingGraft && this._pendingGraft.returnState) || 'command';
      this._pendingGraft = null;
      this.refreshUIShopDOM();
    } else if (this._viewState === 'implant_select_part') {
      this._viewState = 'command';
      this.refreshUIShopDOM();
    } else if (this._viewState === 'implant_select_prosthetic') {
      this._viewState = 'implant_select_part';
      this.refreshUIShopDOM();
    }
  };

  Scene_ProstheticShop.prototype.selectActor = function (idx) {
    const members = $gameParty.members();
    if (members[idx]) {
      this._selectedActor = members[idx];
      // In the field somebody has to hold the knife, and who it is decides the
      // odds, so the patient is followed by the surgeon rather than the menu.
      this._viewState = this._fieldMode ? 'surgeon_select' : 'command';
      this.refreshUIShopDOM();
    }
  };

  Scene_ProstheticShop.prototype.selectSurgeon = function (idx) {
    const members = $gameParty.members();
    if (!members[idx]) return;
    this._surgeon = members[idx];
    SoundManager.playOk();
    this._viewState = 'command';
    this.refreshUIShopDOM();
  };

  // The odds this operation runs at, as the surgeon-select page reported them.
  Scene_ProstheticShop.prototype.currentOdds = function () {
    return surgeryOdds(this._surgeon || this._selectedActor, this._selectedActor);
  };

  // Why the odds are what they are, in one line: the hands, the roof and the
  // weather, each named with what it is worth.
  Scene_ProstheticShop.prototype.oddsBreakdownText = function () {
    const odds = this.currentOdds();
    const signed = (n) => (n >= 0 ? "+" + n : String(n));
    const levelName = window.Specializations && window.Specializations.ready
      ? window.Specializations.levelName(odds.level) : String(odds.level);
    const parts = [
      T('Prosthetics.oddsSurgery', { level: levelName, value: odds.base }),
      T('Prosthetics.oddsVenue', { venue: T('Prosthetics.venue.' + odds.venue), value: signed(odds.venueMod) })
    ];
    if (odds.weatherMod !== 0) {
      parts.push(T('Prosthetics.oddsWeather', {
        weather: T('Prosthetics.weather.' + odds.weather), value: signed(odds.weatherMod)
      }));
    }
    if (odds.self) {
      parts.push(T('Prosthetics.oddsSelf', { value: signed(odds.selfMod) }));
    }
    return parts.join(" · ");
  };

  // One operation, rolled. Returns true when the hands were steady; a failure
  // wounds the patient somewhere else and reports what it cost.
  Scene_ProstheticShop.prototype.rollSurgery = async function () {
    const odds = this.currentOdds();
    const isSelfSurgery = !!odds.self;
    if (!this._fieldMode && !isSelfSurgery) return true;

    const surgeon = this._surgeon || this._selectedActor;
    const medMod = Math.floor(((((surgeon.mat || 10) + (surgeon.agi || 10)) / 2) - 10) / 2);

    let success = false;
    let nat1 = false;
    let nat20 = false;
    let roll = Math.floor(Math.random() * 100) + 1;

    if (window.Dice3D) {
      const res = await window.Dice3D.rollPercentage(odds.chance, {
        actionName: isSelfSurgery ? 'Self Surgery' : 'Field Surgery',
        statName: 'DEX/INT',
        modifier: medMod
      });
      success = res.success;
      nat1 = res.nat1;
      nat20 = res.nat20;
      roll = success ? 1 : 100;
    } else {
      success = (roll <= odds.chance);
    }

    if (window.SpecializationXP) {
      window.SpecializationXP.awardCapped(SURGERY_SPEC, success ? 3 : 1, { actor: surgeon, soloist: true });
    }
    if (success) return true;

    const slip = applySurgicalSlip(this._selectedActor, roll - odds.chance);
    SoundManager.playBuzzer();
    if (slip && slip.lost) {
      this.showClinicNotification(T('Prosthetics.surgeryFailedPartLost', { part: slip.partName }));
    } else if (slip) {
      this.showClinicNotification(T('Prosthetics.surgeryFailedWound', { part: slip.partName, damage: slip.dealt }));
    } else {
      this.showClinicNotification(T('Prosthetics.surgeryFailed'));
    }
    this.refreshUIShopDOM();
    return false;
  };

  Scene_ProstheticShop.prototype.switchSelectedActor = function (idx) {
    const members = $gameParty.members();
    if (members[idx]) {
      this._selectedActor = members[idx];
      SoundManager.playOk();
      // A new patient in the field means the odds are a different question, so
      // the surgeon is chosen again rather than carried over silently.
      this._viewState = this._fieldMode ? 'surgeon_select' : 'command';
      this.refreshUIShopDOM();
    }
  };

  // Cycle the active patient via Tab / L1-R1, returning to the command view for
  // the new patient (mirrors clicking a companion tab).
  Scene_ProstheticShop.prototype.cyclePatient = function (dir) {
    const members = $gameParty.members();
    if (members.length <= 1) return;
    const cur = members.indexOf(this._selectedActor);
    const next = ((cur < 0 ? 0 : cur) + dir + members.length) % members.length;
    this.switchSelectedActor(next);
  };

  Scene_ProstheticShop.prototype.chooseCommand = function (cmd) {
    if (cmd === 'install') {
      this._viewState = 'install_archetype';
      this.refreshUIShopDOM();
    } else if (cmd === 'inventory') {
      // Parts already in the pack: the only ones a field kit can fit, and a
      // first-class entry in the clinic too rather than a row buried in the
      // archetype catalogue.
      this._viewState = 'install_inventory';
      this.refreshUIShopDOM();
    } else if (cmd === 'remove') {
      this._viewState = 'remove_part';
      this.refreshUIShopDOM();
    } else if (cmd === 'replace') {
      this._viewState = 'replace_part';
      this.refreshUIShopDOM();
    } else if (cmd === 'implant') {
      this._viewState = 'implant_select_part';
      this.refreshUIShopDOM();
    } else if (cmd === 'cancel') {
      this._viewState = 'party';
      this.refreshUIShopDOM();
    }
  };

  Scene_ProstheticShop.prototype.chooseArchetype = function (key) {
    if (key === '__INVENTORY__') {
      this._viewState = 'install_inventory';
    } else {
      this._selectedArchetypeKey = key;
      this._viewState = 'install_part';
    }
    this.refreshUIShopDOM();
  };

  Scene_ProstheticShop.prototype.selectListItem = function (idx) {
    if (this._viewState === 'replace_part') {
      const item = this._activeListItems[idx];
      if (item) {
        this._selectedPartKey = item.partKey;
        this._removalFee = item.removalFee;
        this._viewState = 'replace_archetype';
        this.refreshUIShopDOM();
      }
    } else if (this._viewState === 'implant_select_part') {
      const item = this._activeListItems[idx];
      if (item) {
        this._selectedPartKey = item.partKey;
        this._viewState = 'implant_select_prosthetic';
        this.refreshUIShopDOM();
      }
    } else if (this._viewState === 'socket_select') {
      this.chooseGraftSocket(idx);
    } else {
      UIShopInputManager.focusRow(idx);
      this._focusedRow = idx;
      UIShopInputManager.mode = 'actions';
      UIShopInputManager.actionIndex = 0;
      UIShopInputManager.updateFocus();
    }
  };

  /**
   * Does this graft need the patient to say where it goes? Only a hand or a
   * foot does, and only when there is more than one bare limb to choose
   * between: with a single free limb there is nothing to decide, and with none
   * the graft was refused before it got here (graftBlockedReason).
   */
  Scene_ProstheticShop.prototype.needsSocketChoice = function (item) {
    if (this._graftSocketKey) return false;
    const HC = window.HealthCore;
    if (!HC || !HC.needsLimbSocket || !item || !HC.needsLimbSocket(item.partKey)) return false;
    return HC.openLimbSockets(this._selectedActor).length > 1;
  };

  /** The limb was picked: fit the part that was waiting on the answer. */
  Scene_ProstheticShop.prototype.chooseGraftSocket = function (idx) {
    const socket = this._activeListItems[idx];
    const pending = this._pendingGraft;
    if (!socket || !pending) return;
    this._graftSocketKey = socket.partKey;
    this._viewState = pending.returnState;
    this._pendingGraft = null;
    try {
      this.executeSurgeryAction('install', pending.item);
    } finally {
      this._graftSocketKey = null;
    }
  };

  /**
   * Whether this operation may go ahead at all: the same answer the greyed out
   * button is drawn from, asked again where the money actually changes hands so
   * no input route can walk past it.
   */
  Scene_ProstheticShop.prototype.canPerformAction = function (action, item) {
    if (!item) return false;
    if (action === "remove" && item.vital) return false;
    if (action === "remove_implant") return !item.isRemoveOption || item.canRemove !== false;
    if (item.blockedReason) return false;
    if (item.alreadyOwned && (action === "install")) return false;
    const price = this.priceOf(item.isInventoryPart && action === "install" ? INSTALLATION_FEE : item.cost);
    return $gameParty.gold() >= price;
  };

  Scene_ProstheticShop.prototype.executeSurgeryAction = async function (action, itemOverride) {
    const item = itemOverride || this._activeListItems[this._focusedRow];
    if (!item) return;

    if (!this.canPerformAction(action, item)) {
      SoundManager.playBuzzer();
      return;
    }

    const actor = this._selectedActor;

    // A hand or a foot goes on the end of a limb, and which limb is the
    // patient's call. Asked before anything is charged and before the knife
    // comes out, so backing out of the question costs nothing.
    if (action === "install" && this.needsSocketChoice(item)) {
      this._pendingGraft = { item, returnState: this._viewState };
      this._viewState = 'socket_select';
      this.refreshUIShopDOM();
      return;
    }


    // A field operation or self-surgery is rolled: a failure costs the patient a wound
    // and nothing changes hands, not even the part that was going to go in.
    if (!(await this.rollSurgery())) return;

    if (action === "install") {
      if (item.isInventoryPart) {
        $gameParty.loseGold(this.priceOf(INSTALLATION_FEE));
        if (item.itemId && $dataItems[item.itemId]) $gameParty.loseItem($dataItems[item.itemId], 1);
      } else {
        $gameParty.loseGold(this.priceOf(item.cost));
      }

      const archPart = item.archPart;
      const itemId = item.itemId || (archPart && archPart.itemId) || 0;
      graftBodyPart(actor, item, item.partKey, archPart, itemId,
        socketForGraft(actor, item.partKey, this._graftSocketKey));

      actor.refresh();
      SoundManager.playShop();
      this.showClinicNotification(T('Prosthetics.limbGraftedSuccessfully'));

      this._viewState = item.isInventoryPart ? 'install_inventory' : 'install_part';
      this.refreshUIShopDOM();

    } else if (action === "remove") {
      $gameParty.loseGold(this.priceOf(item.cost));

      if (item.hasImplant && actor._prosthetics && actor._prosthetics[item.partKey]) {
        removeProstheticImmediate(actor, item.partKey);
      }

      if (item.statEffect && item.statBonus > 0 && actor._bodyPartStatEffects) {
        const p = item.statEffect.param;
        if (actor._bodyPartStatEffects[p]) {
          actor._bodyPartStatEffects[p] -= item.statBonus;
          if (actor._bodyPartStatEffects[p] <= 0) delete actor._bodyPartStatEffects[p];
        }
      }

      // Amputated, so what the limb taught leaves with it: its own moves and
      // the ones it granted for being a hand, a mouth, an eye or a foot, kept
      // only where another part of that kind is still attached.
      const removedPart = actor._bodyParts[item.partKey];
      if (removedPart) {
        if (window.HealthCore && window.HealthCore.forgetPartSkills) {
          window.HealthCore.forgetPartSkills(actor, removedPart, item.partKey);
        } else {
          skillIdList(removedPart.skillId).forEach((sid) => actor.forgetSkill(sid));
        }
      }
      if (removedPart && removedPart.itemId && $dataItems[removedPart.itemId]) {
        $gameParty.gainItem($dataItems[removedPart.itemId], 1);
      }

      // Off the body, so the portrait stops drawing it.
      if (window.HealthCore && window.HealthCore.partStates) {
        actor._severedParts = actor._severedParts || {};
        actor._severedParts[item.partKey] = true;
      }
      delete actor._bodyParts[item.partKey];
      actor.refresh();
      SoundManager.playShop();
      this.showClinicNotification(T('Prosthetics.limbAmputatedSuccessfully'));

      this._viewState = 'remove_part';
      this.refreshUIShopDOM();

    } else if (action === "replace") {
      $gameParty.loseGold(this.priceOf(item.cost));

      const partKey = item.partKey;
      const archPart = item.archPart;

      const oldPart = actor._bodyParts && actor._bodyParts[partKey];
      if (oldPart) {
        const oldStatEffect = lookupStatEffect(partKey, oldPart, actor);
        const oldBonus = computeStatBonus(oldStatEffect);
        if (oldBonus > 0 && actor._bodyPartStatEffects) {
          const p = oldStatEffect.param;
          if (actor._bodyPartStatEffects[p]) {
            actor._bodyPartStatEffects[p] -= oldBonus;
            if (actor._bodyPartStatEffects[p] <= 0) delete actor._bodyPartStatEffects[p];
          }
        }
        if (actor._prosthetics && actor._prosthetics[partKey]) {
          removeProstheticImmediate(actor, partKey);
        }
        if (window.HealthCore && window.HealthCore.forgetPartSkills) {
          window.HealthCore.forgetPartSkills(actor, oldPart, partKey);
        } else {
          skillIdList(oldPart.skillId).forEach((sid) => actor.forgetSkill(sid));
        }
        if (oldPart.itemId && $dataItems[oldPart.itemId]) {
          $gameParty.gainItem($dataItems[oldPart.itemId], 1);
        }
      }

      graftBodyPart(actor, item, partKey, archPart, (archPart && archPart.itemId) || 0,
        (oldPart && oldPart.attachedTo) || socketForGraft(actor, partKey, null));

      actor.refresh();
      SoundManager.playShop();
      this.showClinicNotification(T('Prosthetics.deviceReplacedSuccessfully'));

      this._viewState = 'replace_part';
      this.refreshUIShopDOM();

    } else if (action === "install_implant") {
      $gameParty.loseGold(this.priceOf(item.cost));
      installProstheticImmediate(actor, item.partKey, item.prostheticKey);
      SoundManager.playShop();
      this.showClinicNotification(T('Prosthetics.prostheticInstalledSuccessfully'));

      this._viewState = 'implant_select_prosthetic';
      this.refreshUIShopDOM();

    } else if (action === "remove_implant") {
      removeProstheticImmediate(actor, this._selectedPartKey);
      SoundManager.playShop();
      this.showClinicNotification(T('Prosthetics.prostheticUninstalledSuccessfully'));

      this._viewState = 'implant_select_prosthetic';
      this.refreshUIShopDOM();
    }
  };

  Scene_ProstheticShop.prototype.cancelSurgeryAction = function () {
    SoundManager.playCancel();
    UIShopInputManager.mode = 'list';
    UIShopInputManager.updateFocus();
  };

  // ==========================================================================
  // What the UI module is allowed to ask this file
  //
  // The drawing lives next door and needs the same words and the same prices
  // the logic works in. It reads them through here rather than keeping a
  // second copy of any of them.
  // ==========================================================================
  window.ProstheticShop.ring = UIShopInputManager;
  window.ProstheticShop.text = {
    price: formatPriceInEuros,
    paramName: getParamName,
    skillNames,
    archetypeLabel,
    implantName,
    genderName: getGenderName,
    reproductionName: getReproductionName
  };

  // ===========================================================================
  // Game_Actor.prototype.param  – prosthetic + body-part stat bonuses
  // ===========================================================================
  var _Game_Actor_param_prosthetic = Game_Actor.prototype.param;
  Game_Actor.prototype.param = function (paramId) {
    var value = _Game_Actor_param_prosthetic.call(this, paramId);
    if (this._prostheticEffects && this._prostheticEffects[paramId]) value += this._prostheticEffects[paramId];
    if (this._bodyPartStatEffects && this._bodyPartStatEffects[paramId]) value += this._bodyPartStatEffects[paramId];
    return Math.max(1, value);
  };

  // ===========================================================================
  // Scene_Menu integration
  // ===========================================================================
  var _Scene_Menu_createCommandWindow_prosthetic = Scene_Menu.prototype.createCommandWindow;
  Scene_Menu.prototype.createCommandWindow = function () {
    _Scene_Menu_createCommandWindow_prosthetic.call(this);
    this._commandWindow.setHandler("prostheticShop", this.commandProstheticShop.bind(this));
  };

  Scene_Menu.prototype.commandProstheticShop = function () {
    SceneManager.push(Scene_ProstheticShop);
  };

  // ===========================================================================
  // autoAssignProsthetic  (targets actor 1 only)
  // ===========================================================================
  Game_System.prototype.autoAssignProsthetic = function () {
    const actor = $gameActors.actor(1);
    const assignmentDone = $gameSwitches.value(88);
    const storedName = $gameVariables.value(89);
    const currentName = actor.name();
    const shouldAssign = !assignmentDone || currentName !== storedName;

    if (shouldAssign) {
      const v87Value = $gameVariables.value(87);
      const implantName = AUTO_ASSIGN_IMPLANTS[v87Value] !== undefined
        ? AUTO_ASSIGN_IMPLANTS[v87Value]
        : "TESTES";
      console.log(`Auto-assigning implant: ${implantName} (V87 value: ${v87Value})`);
      $gameSwitches.setValue(88, true);
      $gameVariables.setValue(89, currentName);
    } else {
      console.log(`Prosthetic auto-assignment skipped. (Name: ${currentName})`);
    }
  };

  // ===========================================================================
  // Plugin Commands
  // ===========================================================================
  var _Game_Interpreter_pluginCommand_prosthetic = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand_prosthetic.call(this, command, args);
    if (command === "OpenProstheticShop") {
      $gameSystem.autoAssignProsthetic();
      const _ev = $gameMap.event(this.eventId());
      if (_ev) $gameTemp._prostheticShopSeedData = { mapId: $gameMap.mapId(), x: _ev.x, y: _ev.y };
      SceneManager.push(Scene_ProstheticShop);
    }
  };

  if (Utils.RPGMAKER_NAME === "MZ") {
    PluginManager.registerCommand("Health_ProstheticShop", "OpenProstheticShop", () => {
      $gameSystem.autoAssignProsthetic();
      const _ev = $gameMap && $gameMap._interpreter ? $gameMap.event($gameMap._interpreter.eventId()) : null;
      if (_ev) $gameTemp._prostheticShopSeedData = { mapId: $gameMap.mapId(), x: _ev.x, y: _ev.y };
      SceneManager.push(Scene_ProstheticShop);
    });
  }

  // The same theatre with nobody to pay and nobody qualified: one member cuts,
  // another is cut, and only what is already in the pack can be fitted.
  const openFieldSurgery = () => {
    $gameSystem.autoAssignProsthetic();
    $gameTemp._fieldSurgeryMode = true;
    SceneManager.push(Scene_ProstheticShop);
  };
  PluginManager.registerCommand("Health_ProstheticShop", "FieldSurgery", openFieldSurgery);

  const _Game_Interpreter_pluginCommand_fieldSurgery = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand_fieldSurgery.call(this, command, args);
    if (command === "FieldSurgery") openFieldSurgery();
  };
})();
