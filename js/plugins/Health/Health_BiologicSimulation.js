/*:
 * @target MZ
 * @plugindesc [Add-on] A deep, real-time biologic simulation for Actor 1.
 * @author Omni-Lex
 * @help
 * This plugin is an add-on for the Core Limb Damage System.
 * It has a soft dependency; it will function without the core system,
 * but some features (like Ley Vein blockages) will not work.
 *
 * This plugin simulates vital signs, hormones, brain activity, and more.
 * It adds a "Biologics" command to the main menu.
 *
 * @command OpenBiologicSimulation
 * @desc Opens the biologic simulation window.
 * 
 * @command MakePregnant
 * @desc Makes the player pregnant (requires Switch 69 ON for uterus).
 *
 * @command ShortenPregnancy
 * @desc Reduces pregnancy timer by 1 month (30 days).
 * 
 * @command BirthSeed
 * @desc Plants one seed from stockpile (Plant-type reproduction only).
 *
 * @command InfectMember
 * @desc Asks which party member to infect, then gives them the disease.
 * Works on the map and in battle. Used by the disease vials.
 *
 * @arg disease
 * @type string
 * @desc Disease id from js/db/Health/Diseases.json (e.g. influenza, rabies).
 *
 * @arg silent
 * @type boolean
 * @default false
 * @desc true infects the leader outright, without asking.
 *
 * @command Diagnose
 * @desc Opens a screen listing every illness the party carries, including
 * ones still inside their window period; each can be paid to be named.
 *
 * @command CureDiseases
 * @desc Opens a screen to buy a course of medicine for every diagnosed
 * illness the party carries.
 *
 */

(function () {
  "use strict";

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

  // Biologic Simulation Scene
  function Scene_BiologicSimulation() {
    this.initialize(...arguments);
  }
  let brainI18nData = null;

  const loadBrainI18nData = async () => {
    const lang = ConfigManager.language || "en";
    const url = `js/i18n/${lang}/brain.json`;
    try {
      const response = await fetch(url);
      brainI18nData = await response.json();
    } catch (e) {
      console.error("Health_BiologicSimulation: Failed to load brain i18n data from " + url, e);
    }
  };

  const resolveBrainI18nPath = (path, obj) => {
    if (!path || !obj) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  // BrainRegions.json stores i18n keys ("brain.prefrontalcortex.name") rather
  // than prose, so every consumer has to resolve them or the raw key leaks into
  // the UI. Falls back to a title-cased tail of the key while brain.json loads.
  const brainI18nText = (key) => {
    if (!key) return "";
    const resolved = brainI18nData ? resolveBrainI18nPath(key, brainI18nData) : null;
    if (typeof resolved === "string" && resolved) return resolved;
    if (!/^brain\./.test(key)) return key;
    const tail = key.split(".").slice(1, -1).join(" ");
    return tail.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Pathogen records store the English species id (old saves hold it too);
  // the label is resolved here, at the one place that prints it.
  const pathogenLabel = (name) => {
    const table = T.has('Biologic.pathogen') ? T.obj('Biologic.pathogen') : null;
    return (table && table[name]) || name || "";
  };

  // Every DOM metric goes through this: the simulation seeds some fields only
  // once the relevant subsystem ticks, and an absent field used to render as
  // "NaN%" / "undefined".
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function getGameDateFromVariable() {
    const dateStr = (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
    // Format: "01 JAN 2001 12:00"
    const parts = dateStr.split(' ').filter(Boolean);
    if (parts.length < 4) {
      return { day: 1, month: 0, year: 2001, hours: 8, minutes: 0 };
    }

    const day = parseInt(parts[0]) || 1;
    const monthStr = (parts[1] || '').toUpperCase();
    const year = parseInt(parts[2]) || 2001;
    const timeStr = (parts[3] || '12:00').split(':');
    const hours = parseInt(timeStr[0]) || 0;
    const minutes = parseInt(timeStr[1]) || 0;

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let month = months.indexOf(monthStr);
    if (month === -1) {
      const itMonths = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
      month = itMonths.indexOf(monthStr);
    }
    if (month === -1) {
      month = 0;
    }

    return { day, month, year, hours, minutes };
  }

  function convertGameDateToTimestamp(dateObj) {
    const baseYear = 2001;
    let days = (dateObj.year - baseYear) * 365;

    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let i = 0; i < dateObj.month; i++) {
      days += daysPerMonth[i];
    }

    days += dateObj.day;
    days += (dateObj.hours * 60 + dateObj.minutes) / (24 * 60);

    return days;
  }

  // Reproduction type is stored per party member: var 87 (member 1),
  // var 115 (member 2), var 116 (member 3). Select by party index so
  // actors 2/3 do not inherit actor 1's reproductive data.
  function getReproductionVarId(actor) {
    var idx = actor ? $gameParty.members().indexOf(actor) : 0;
    if (idx === 1) return 115;
    if (idx === 2) return 116;
    return 87;
  }

  function getReproductionType(actor) {
    var v = $gameVariables.value(getReproductionVarId(actor));
    return (v === undefined || v === null) ? 0 : v;
  }

  // How long a pregnancy runs is the species' business, not this plugin's:
  // every archetype in Archetypes.json carries a `pregnancyDuration` in
  // game days and Health_Core resolves it (the median of the two for a hybrid,
  // always one day for mitosis).
  var FALLBACK_TERM = 270; // Health_Core absent; the human term.

  function getPregnancyDuration(actor) {
    var api = window.HealthCore;
    if (!api || !api.getPregnancyDuration) return FALLBACK_TERM;
    return api.getPregnancyDuration(actor, getReproductionType(actor));
  }

  // The fetal biometrics and the hormone curve below are written on the human
  // scale (millimetres and grams per day of a humanoid term). A species with a
  // shorter or longer term walks the same ladder, so its gestational age is
  // mapped onto that scale before those figures are read.
  function getHumanTerm() {
    var api = window.HealthCore;
    var days = api && api.getArchetypePregnancyDuration
      ? api.getArchetypePregnancyDuration("Humanoid")
      : 0;
    return days > 0 ? days : FALLBACK_TERM;
  }

  function toHumanScaleAge(actor, age) {
    var term = getPregnancyDuration(actor);
    return term > 0 ? (age / term) * getHumanTerm() : age;
  }

  const getBrainRegions = () => window.Health ? window.Health.BrainRegions : null;
  const getPersonalityData = () => window.Health ? window.Health.PersonalityData : null;

  // Gender is stored per-actor: actor 1 -> Var 38, actor 2 -> Var 39,
  // actor 3 -> Var 40. Reading Var 38 unconditionally gave actors 2/3 the
  // Player-1 gender.
  function getGenderVarId(actor) {
    var id = actor && actor.actorId ? actor.actorId() : 1;
    return id === 2 ? 39 : id === 3 ? 40 : 38;
  }

  // Gender itself lives on the actor now (ActorCharacterFields); variables
  // 38-40 were freed, so they are only read as a fallback for a runtime that
  // does not carry that plugin.
  function readGender(actor) {
    if (actor && typeof actor.gender === "function") return actor.gender() || 0;
    return $gameVariables.value(getGenderVarId(actor)) || 0;
  }

  function writeGender(actor, value) {
    if (actor && typeof actor.setGender === "function") actor.setGender(value);
    else $gameVariables.setValue(getGenderVarId(actor), value);
  }

  // ── Endocrine implants ────────────────────────────────────────────────────
  // Two implants installed on the torso (BODY on a creature) write the sex
  // hormones directly, and they are applied AFTER the gender-appropriate
  // clamps in updateHormones: a body produces what its organs produce, so the
  // gland outranks the range the recorded gender would allow. Both are
  // declared in js/db/Health/ProstheticTypes.json.
  const ANDROGEN_GLAND = "ANDROGEN_GLAND";
  const ESTROGEN_AUTOINJECTOR = "ESTROGEN_AUTOINJECTOR";
  const ANDROGEN_FLOOR = 900;     // ng/dL the gland holds the blood at
  const ANDROGEN_CEILING = 1200;  // ng/dL it pumps up to
  const ANDROGEN_RATE = 25;       // ng/dL added per simulation tick
  const ESTROGEN_FLOOR = 300;     // pg/mL the reservoir maintains between shots
  const ESTROGEN_DOSE = 120;      // pg/mL of one daily shot
  const ESTROGEN_CEILING = 450;   // pg/mL

  const getProstheticTypes = () => window.Health ? window.Health.ProstheticTypes : null;

  function hasImplant(actor, prostheticKey) {
    const installed = actor && actor._prosthetics;
    if (!installed) return false;
    for (const partKey in installed) {
      if (installed[partKey] === prostheticKey) return true;
    }
    return false;
  }

  // Which day of the world clock (variable 114, game minutes) we stand on.
  function currentGameDay() {
    return Math.floor(($gameVariables.value(114) || 0) / 1440);
  }

  // The autoinjector fires once per game day. It records the day it was fitted
  // without dosing (fitting an implant is not a shot) and settles at most one
  // dose per day afterwards, so the days spent away from the panel do not pile
  // up into a single flood.
  function applyEstrogenInjection(actor) {
    if (!actor || !actor._biologicData || !actor._biologicData.hormones) return false;
    if (!hasImplant(actor, ESTROGEN_AUTOINJECTOR)) return false;
    const bio = actor._biologicData;
    const today = currentGameDay();
    if (bio.lastEstrogenInjectionDay === today) return false;
    const fitting = bio.lastEstrogenInjectionDay === undefined;
    bio.lastEstrogenInjectionDay = today;
    if (fitting) return false;
    bio.hormones.estrogen = Math.min(
      ESTROGEN_CEILING,
      Math.max(ESTROGEN_FLOOR, num(bio.hormones.estrogen, 0) + ESTROGEN_DOSE)
    );
    return true;
  }

  function runEstrogenAutoinjector(actor) {
    if (!applyEstrogenInjection(actor)) return;
    if (window.ParchmentToast) {
      window.ParchmentToast.show(
        T('Biologic.estrogenShotDelivered', { name: actor.name() }),
        { severity: "info", duration: 200 }
      );
    }
  }

  function applyEndocrineImplants(actor, bio) {
    if (!actor || !bio || !bio.hormones) return;
    if (hasImplant(actor, ANDROGEN_GLAND)) {
      bio.hormones.testosterone = Math.min(
        ANDROGEN_CEILING,
        Math.max(ANDROGEN_FLOOR, num(bio.hormones.testosterone, 0) + ANDROGEN_RATE)
      );
    }
    if (hasImplant(actor, ESTROGEN_AUTOINJECTOR)) {
      bio.hormones.estrogen = Math.min(
        ESTROGEN_CEILING,
        Math.max(ESTROGEN_FLOOR, num(bio.hormones.estrogen, 0))
      );
    }
  }

  // The panel is not where a day passes, so the injector is also swept on the
  // map: once per game day, never per step.
  let _lastInjectorSweepDay = -1;
  const _Party_increaseSteps = Game_Party.prototype.increaseSteps;
  Game_Party.prototype.increaseSteps = function () {
    _Party_increaseSteps.call(this);
    const today = currentGameDay();
    if (today === _lastInjectorSweepDay) return;
    _lastInjectorSweepDay = today;
    this.members().forEach(runEstrogenAutoinjector);
  };

  // ── The endocrine balance ────────────────────────────────────────────────
  // A body's sex hormones used to be read off its gender alone: male bodies
  // ran one range, female bodies another, and anybody else took a middle one.
  // A character is now BUILT at a point on the scale between the two (the Bio
  // tab's slider, stored by ActorCharacterFields as `hormoneBalance`), so the
  // range is interpolated from that point instead: 0 is a wholly oestrogenic
  // body, 100 a wholly androgenic one, 50 an even one. The two endpoints are
  // exactly the ranges the gender switch used, so a body built at its gender's
  // own default reads precisely as it always did.
  //
  // A character nobody ever asked (an NPC, anybody made before the slider)
  // answers null and falls back to their gender's default, which is why this
  // takes an actor rather than a number.
  // Each bound below is written at FOUR points on the scale: the two ends, and
  // the two default builds at 15 and 85. Anchoring the middle two that way is
  // what keeps an ordinary character exactly as they were, since 15 and 85 are
  // the female and male ranges the old gender switch used, and 50 lands almost
  // exactly on the old non-binary bracket. The two ends then reach a little
  // past either ordinary body, which is what the last fifteen points of the
  // slider are for. Written out rather than extrapolated so every bound stays
  // positive and stays the right side of the other one at both ends.
  const HORMONE_DEFAULTS = { 0: 85, 1: 15, 2: 50, 3: 50 }; // male / female / non-binary / cocoon
  const HORMONE_SCALE = [0, 0.15, 0.85, 1];
  const HORMONE_ENDPOINTS = {
    testosterone: { //                     ng/dL
      min:   [5, 10, 250, 320],
      max:   [40, 80, 1000, 1200],
      start: [8, 15, 300, 380],
      span:  [30, 55, 700, 820]
    },
    estrogen: { //                         pg/mL
      min:   [30, 20, 10, 7],
      max:   [500, 400, 50, 35],
      start: [45, 30, 10, 7],
      span:  [455, 370, 30, 20]
    },
    progesterone: { //                     ng/mL
      min:   [0.8, 0.5, 0.1, 0.05],
      max:   [26, 20, 0.5, 0.3],
      start: [0.8, 0.5, 0.1, 0.05],
      span:  [25, 19.5, 0.4, 0.25]
    }
  };

  // Read one of those four-point curves at a point on the scale.
  function lerp(points, t) {
    var x = Math.max(0, Math.min(1, t));
    for (var i = 1; i < HORMONE_SCALE.length; i++) {
      if (x > HORMONE_SCALE[i]) continue;
      var a = HORMONE_SCALE[i - 1];
      var b = HORMONE_SCALE[i];
      var k = b > a ? (x - a) / (b - a) : 0;
      return points[i - 1] + (points[i] - points[i - 1]) * k;
    }
    return points[points.length - 1];
  }

  // Where this actor's body sits, 0-100. Never null: an unasked body answers
  // with the default for the gender it carries.
  function hormoneBalanceOf(actor) {
    var own = (actor && typeof actor.hormoneBalance === "function") ? actor.hormoneBalance() : null;
    if (own !== null && own !== undefined) return Math.max(0, Math.min(100, own));
    var gender = readGender(actor);
    return HORMONE_DEFAULTS[gender] === undefined ? 50 : HORMONE_DEFAULTS[gender];
  }

  // Was this body deliberately tuned? A body that was keeps the identity it
  // was given: updateGenderFromHormones does not re-label it from its own
  // blood, or a character built androgynous on purpose would be renamed by the
  // first panel they opened.
  function hormoneBalanceIsSet(actor) {
    return !!(actor && typeof actor.hormoneBalance === "function" && actor.hormoneBalance() !== null);
  }

  // The range one hormone is held between at this point on the scale.
  function hormoneRange(name, balance) {
    var ends = HORMONE_ENDPOINTS[name];
    if (!ends) return null;
    var t = Math.max(0, Math.min(100, balance)) / 100;
    return { min: lerp(ends.min, t), max: lerp(ends.max, t) };
  }

  // And the value a body of this build is born with, rolled inside that range.
  function initialHormone(name, balance) {
    var ends = HORMONE_ENDPOINTS[name];
    if (!ends) return 0;
    var t = Math.max(0, Math.min(100, balance)) / 100;
    return lerp(ends.start, t) + Math.random() * lerp(ends.span, t);
  }

  // Read by the character creation Bio tab, which prints what the slider is
  // actually doing to the blood rather than an abstract number.
  window.HormoneBalance = {
    of: hormoneBalanceOf,
    isSet: hormoneBalanceIsSet,
    rangeFor(name, balance) { return hormoneRange(name, balance); },
    defaultFor(gender) {
      return HORMONE_DEFAULTS[gender] === undefined ? 50 : HORMONE_DEFAULTS[gender];
    }
  };

  // What an endocrine implant does is written in the blood rather than in a
  // parameter table, so the augment register (PartyAugmentsMenu) asks the
  // system that implements it for the line to print.
  window.EndocrineImplants = {
    describe(prostheticKey) {
      if (prostheticKey === ANDROGEN_GLAND) {
        return T('Biologic.androgenGlandOutput', { low: ANDROGEN_FLOOR, high: ANDROGEN_CEILING });
      }
      if (prostheticKey === ESTROGEN_AUTOINJECTOR) {
        return T('Biologic.estrogenAutoinjectorOutput', { dose: ESTROGEN_DOSE, floor: ESTROGEN_FLOOR });
      }
      return null;
    }
  };

  // ── Blood type ──────────────────────────────────────────────────────────
  // The ABO/Rh table, plus four vanishingly rare antigen-negative variants,
  // lives in js/db/Health/BloodTypes.json (window.Health.BloodTypes). This is
  // the one place that rolls it, looks it up, localizes it and computes real
  // ABO/Rh transfusion compatibility, so the party Biologics screen,
  // NPCEmpathizeUI and CharacterCreationFull all read the same answer.
  window.BloodTypeService = {
    list() {
      return (window.Health && window.Health.BloodTypes) || [];
    },

    get(id) {
      if (!id) return null;
      return this.list().find((entry) => entry.id === id) || null;
    },

    // Localized "O+ (Common)" style pieces, plus the raw fields the party
    // Biologics screen already reads directly (bloodType.type / .rarity).
    describe(id) {
      const entry = this.get(id);
      if (!entry) return null;
      const key = entry.id.toLowerCase();
      const nameKey = 'Biologic.bloodTypes.' + key + '.name';
      const descKey = 'Biologic.bloodTypes.' + key + '.desc';
      return {
        id: entry.id,
        type: entry.type,
        abo: entry.abo,
        rh: entry.rh,
        rareAntigen: entry.rareAntigen || null,
        rarityKey: entry.rarityKey,
        rarity: T('Biologic.rarity.' + entry.rarityKey),
        name: T.has(nameKey) ? T(nameKey) : entry.type,
        desc: T.has(descKey) ? T(descKey) : '',
      };
    },

    // Deterministic pick from a name, weighted by real-world population
    // frequency, so an actor or NPC nobody has assigned one to by hand always
    // rolls the same type for the same name.
    rollForName(name) {
      const table = this.list();
      if (!table.length) return null;
      let hash = 0;
      const str = String(name || '');
      for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff;
      const rand = Math.abs(hash) % 10000;
      let cumulative = 0;
      for (const entry of table) {
        cumulative += entry.percent * 100;
        if (rand < cumulative) return entry.id;
      }
      return table[0].id;
    },

    // A party member's blood type is chosen once and then sticky: set by hand
    // in Detailed character creation (actor._ccBloodType), or rolled from
    // their name the first time anything asks. Mirrored onto
    // _biologicData.bloodType once that exists, for the older direct reads.
    forActor(actor) {
      if (!actor) return null;
      if (!actor._ccBloodType) {
        actor._ccBloodType = this.rollForName(actor.name ? actor.name() : '');
      }
      const described = this.describe(actor._ccBloodType);
      if (actor._biologicData) actor._biologicData.bloodType = described;
      return described;
    },

    setForActor(actor, id) {
      if (!actor || !this.get(id)) return false;
      actor._ccBloodType = id;
      if (actor._biologicData) actor._biologicData.bloodType = this.describe(id);
      return true;
    },

    // The same weighted roll, seeded per NPC name and per world the way every
    // other seeded-but-unrecorded NPC trait is (NPCShared.Rng), so a stranger
    // always reads the same blood type in the same world without needing a
    // saved record for every citizen.
    forNpc(npcName) {
      const table = this.list();
      const Shared = window.NPCShared;
      if (!table.length || !Shared) return null;
      const rng = new Shared.Rng(Shared.nameHash(String(npcName || '') + '_blood') ^ Shared.worldSeed());
      const roll = rng.next() * 100;
      let cumulative = 0;
      for (const entry of table) {
        cumulative += entry.percent;
        if (roll < cumulative) return this.describe(entry.id);
      }
      return this.describe(table[0].id);
    },

    _aboCompatible(donorAbo, recipientAbo) {
      if (!donorAbo || !recipientAbo) return donorAbo === recipientAbo;
      if (donorAbo === 'O') return true;
      if (recipientAbo === 'AB') return true;
      return donorAbo === recipientAbo;
    },

    _rhCompatible(donorRh, recipientRh) {
      if (!donorRh || !recipientRh) return donorRh === recipientRh;
      if (donorRh === '-') return true;
      return recipientRh === '+';
    },

    // Real ABO/Rh transfusion rules: O is the universal ABO donor, AB the
    // universal ABO recipient, and Rh-negative blood can be given to either
    // Rh but only received from Rh-negative. The rare antigen-negative
    // variants layer one exception on top: Rh-null carries none of the Rh
    // system at all, so it donates to any Rh phenotype but can only be
    // replenished by another Rh-null carrier; a Duffy/Diego/Kidd-negative
    // recipient reacts against that antigen on repeat exposure, so (Rh-null
    // aside) they can only safely receive from a donor missing the same one.
    canDonate(donorId, recipientId) {
      const donor = this.get(donorId);
      const recipient = this.get(recipientId);
      if (!donor || !recipient) return false;

      // Synthetic-Δ is a universal artificial fluorocarbon carrier
      if (donor.id === 'SYNTH_DELTA') return true;

      // Synthetic recipients
      if (recipient.id === 'SYNTH_DELTA') {
        return donor.id === 'SYNTH_DELTA' || donor.id === 'SYNTH_PSI' || donor.id === 'O_NEG';
      }
      if (recipient.id === 'SYNTH_PSI') {
        return donor.id === 'SYNTH_PSI' || donor.id === 'SYNTH_DELTA';
      }
      if (donor.id === 'SYNTH_PSI') {
        return recipient.id === 'SYNTH_PSI' || recipient.id === 'SYNTH_DELTA';
      }

      // Exotic Invertebrate / Hemocyanin / Chlorocruorin
      if (recipient.id === 'AZURE_HEMOCYANIN') {
        return donor.id === 'AZURE_HEMOCYANIN' || donor.id === 'SYNTH_DELTA';
      }
      if (donor.id === 'AZURE_HEMOCYANIN') {
        return recipient.id === 'AZURE_HEMOCYANIN' || recipient.id === 'SYNTH_DELTA';
      }
      if (recipient.id === 'CHLOROCRUORIN') {
        return donor.id === 'CHLOROCRUORIN' || donor.id === 'SYNTH_DELTA';
      }
      if (donor.id === 'CHLOROCRUORIN') {
        return recipient.id === 'CHLOROCRUORIN' || recipient.id === 'SYNTH_DELTA';
      }

      // Golden Blood / Rh-null
      if (recipient.id === 'RH_NULL') {
        return donor.id === 'RH_NULL' || donor.id === 'SYNTH_DELTA';
      }
      if (donor.id === 'RH_NULL') {
        return !recipient.rareAntigen || recipient.rareAntigen === 'rhNull';
      }

      // Bombay phenotype (hh)
      if (recipient.id === 'BOMBAY_HH') {
        return donor.id === 'BOMBAY_HH' || donor.id === 'SYNTH_DELTA';
      }
      if (donor.id === 'BOMBAY_HH') {
        return true;
      }

      // Rare antigen-null types (Duffy, Diego, Kidd, Colton, Lutheran)
      if (recipient.rareAntigen) {
        return donor.rareAntigen === recipient.rareAntigen || donor.id === 'SYNTH_DELTA';
      }

      // Standard ABO/Rh rules
      return this._aboCompatible(donor.abo, recipient.abo) && this._rhCompatible(donor.rh, recipient.rh);
    },

    isUniversalDonor(id) {
      const entry = this.get(id);
      return !!entry && ((entry.abo === 'O' && entry.rh === '-' && !entry.rareAntigen) || entry.id === 'SYNTH_DELTA' || entry.id === 'RH_NULL');
    },

    isUniversalRecipient(id) {
      const entry = this.get(id);
      return !!entry && (entry.abo === 'AB' && entry.rh === '+' && !entry.rareAntigen);
    },

    checkPartyCompatibility(actor, testBloodId) {
      const bloodId = testBloodId || (actor && (actor._ccBloodType || actor._bloodType));
      const results = { canDonateTo: [], canReceiveFrom: [] };
      if (!bloodId || typeof $gameParty === 'undefined' || !$gameParty.members) return results;

      const currentActorId = actor ? (typeof actor.actorId === 'function' ? actor.actorId() : actor._actorId) : null;
      $gameParty.members().forEach((member) => {
        if (!member) return;
        const memberId = typeof member.actorId === 'function' ? member.actorId() : member._actorId;
        if (memberId === currentActorId) return;

        const memberBloodId = member._ccBloodType || member._bloodType || (window.BloodTypeService && window.BloodTypeService.forActor(member)?.id) || "O_POS";
        const memberName = member.name ? member.name() : `Member ${memberId}`;
        const memberBloodEntry = this.get(memberBloodId);
        const memberTypeLabel = memberBloodEntry ? memberBloodEntry.type : memberBloodId;

        if (this.canDonate(bloodId, memberBloodId)) {
          results.canDonateTo.push({ name: memberName, type: memberTypeLabel, id: memberBloodId });
        }
        if (this.canDonate(memberBloodId, bloodId)) {
          results.canReceiveFrom.push({ name: memberName, type: memberTypeLabel, id: memberBloodId });
        }
      });
      return results;
    },
  };

  function getActorBustImagePath(actor) {
    if (!actor) return null;
    const actorId = actor.actorId && actor.actorId();
    const characterName = actor.characterName();
    const { SpritesAssociation } = window.Sprites || {};

    if (actorId === 1) {
      const player1BustName = $gameActors.actor(1).vnBust();
      if (player1BustName && player1BustName !== "") return "img/busts/" + player1BustName;
      if ($gameSwitches.value(77)) {
        const player1MonsterName = $gameActors.actor(1).vnBattler();
        if (player1MonsterName && player1MonsterName !== "") return "img/enemies/" + player1MonsterName;
      }
      if (characterName && SpritesAssociation) {
        const spritesheetName = characterName.split('.')[0];
        const characterIndex = actor.characterIndex();
        if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
          return "img/busts/" + SpritesAssociation[spritesheetName][characterIndex];
        }
      }
      return "img/busts/7";
    }

    if (actorId === 2) {
      const player2BustName = $gameActors.actor(2).vnBust();
      if (player2BustName && player2BustName !== "") return "img/busts/" + player2BustName;
      if ($gameSwitches.value(78)) {
        const player2MonsterName = $gameActors.actor(2).vnBattler();
        if (player2MonsterName && player2MonsterName !== "") return "img/enemies/" + player2MonsterName;
      }
      if (characterName && SpritesAssociation) {
        const spritesheetName = characterName.split('.')[0];
        const characterIndex = actor.characterIndex();
        if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
          return "img/busts/" + SpritesAssociation[spritesheetName][characterIndex];
        }
      }
      return "img/busts/7";
    }

    if (actorId === 3) {
      const player3BustName = $gameActors.actor(3).vnBust();
      if (player3BustName && player3BustName !== "") return "img/busts/" + player3BustName;
      if ($gameSwitches.value(79)) {
        const player3MonsterName = $gameActors.actor(3).vnBattler();
        if (player3MonsterName && player3MonsterName !== "") return "img/enemies/" + player3MonsterName;
      }
      if (characterName && SpritesAssociation) {
        const spritesheetName = characterName.split('.')[0];
        const characterIndex = actor.characterIndex();
        if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
          return "img/busts/" + SpritesAssociation[spritesheetName][characterIndex];
        }
      }
      return "img/busts/7";
    }

    if (characterName && SpritesAssociation) {
      const spritesheetName = characterName.split('.')[0];
      const characterIndex = actor.characterIndex();
      if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
        return "img/busts/" + SpritesAssociation[spritesheetName][characterIndex];
      }
    }
    return "img/busts/7";
  }

  function Window_BiologicSimulation() {
    this.initialize(...arguments);
  }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_BiologicSimulation.prototype = Object.create(
      Window_StatusBase.prototype
    );
  } else {
    Window_BiologicSimulation.prototype = Object.create(
      Window_Selectable.prototype
    );
  }

  Window_BiologicSimulation.prototype.constructor = Window_BiologicSimulation;

  Scene_BiologicSimulation.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_BiologicSimulation.prototype.constructor = Scene_BiologicSimulation;

  // Published so the parchment main menu can open it. The Biologic entry guarded on this name
  // and, finding nothing, warned to the console instead of showing the panel.
  window.Scene_BiologicSimulation = Scene_BiologicSimulation;

  Scene_BiologicSimulation.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    $gameSwitches.setValue(128, true);
    this._category = 0;
    // Tab ids; the label is read from Biologic.tab.<id> at draw time.
    this._categories = [
      "overview", "vitals", "hormones", "immune",
      "leyVeins", "brain", "reproduction", "diseases",
    ];
    this._lastKeyboardScrollY = 0;
  };

  Scene_BiologicSimulation.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    this.createBiologicWindow();
    if (this._biologicWindow) {
      this._biologicWindow.visible = false;
      this._biologicWindow.deactivate();
    }
    this.createUIBiologicOverlay();
    window.CharSwitcher.installTabKey(this, (dir) => this.cycleUIActor(dir));
    // Brain region names are i18n keys; without brain.json the DOM would show
    // "brain.prefrontalcortex.name". Load it here (the window that used to
    // trigger the fetch is never drawn) and re-render once it arrives.
    if (!brainI18nData) {
      loadBrainI18nData().then(() => {
        if (SceneManager._scene === this) this.refreshUIBiologic();
      });
    }
  };

  Scene_BiologicSimulation.prototype.cycleUIActor = function (dir) {
    const count = $gameParty.members().length;
    if (count <= 1) return;
    const newIdx = (Scene_BiologicSimulation._targetActorIndex + dir + count) % count;
    this.selectUIActor(newIdx);
  };

  Scene_BiologicSimulation.prototype.createBiologicWindow = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      var rect = this.biologicWindowRect();
      this._biologicWindow = new Window_BiologicSimulation(rect);
    } else {
      this._biologicWindow = new Window_BiologicSimulation();
    }
    this.addWindow(this._biologicWindow);
  };

  Scene_BiologicSimulation.prototype.biologicWindowRect = function () {
    var ww = Graphics.boxWidth;
    var wh = Graphics.boxHeight;
    return new Rectangle(0, 0, ww, wh);
  };

  Scene_BiologicSimulation.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    if (this.isActive()) {
      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        this.popScene();
        SoundManager.playCancel();
      } else {
        this.updateUIBiologicInput();
      }
    }
  };

  Scene_BiologicSimulation.prototype.terminate = function () {
    Scene_MenuBase.prototype.terminate.call(this);
    // Clear the 1s simulation interval so it does not keep running (and leaking
    // a new interval on every open) after the window is closed.
    if (this._biologicWindow && this._biologicWindow.stopBiologicSimulation) {
      this._biologicWindow.stopBiologicSimulation();
    }
    window.CharSwitcher.removeTabKey(this);
    if (this._dndContainer) {
      const container = this._dndContainer;
      container.style.transition = "opacity 0.2s ease-out";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      setTimeout(() => {
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 200);
      this._dndContainer = null;
    }
  };

  Scene_BiologicSimulation.prototype.createUIBiologicOverlay = function () {
    this._dndContainer = document.createElement("div");
    this._dndContainer.id = "biologic-container";

    const useTranslation = ConfigManager.language === "it";
    const closeText = T('Biologic.close');

    this._dndContainer.innerHTML = `
        <div class="book-spread">
            <div class="left-page bio-01">
                <div class="page-header-bar bio-02">
                  <div class="back-button focusable bio-03" onclick="SceneManager._scene.popScene()">
                    ${T('Biologic.back')}
                  </div>
                  <h1 class="title bio-04">${T('Biologic.biology')}</h1>
                </div>
                <div class="bio-left-header bio-09"></div>
                <div class="bio-chapter"></div>
            </div>

            <div class="right-page">
                <div class="bio-parts-pane"></div>
            </div>
        </div>
    `;

    document.body.appendChild(this._dndContainer);
    this.bindUIBiologicWheel();
    this.refreshUIBiologic();
  };

  // RMMZ calls preventDefault on every wheel event at the document level
  // (TouchInput._onWheel), so a DOM overlay never scrolls on its own.
  Scene_BiologicSimulation.prototype.bindUIBiologicWheel = function () {
    const container = this._dndContainer;
    if (!container || container._bioWheelBound) return;
    container._bioWheelBound = true;
    container.addEventListener("wheel", (e) => {
      // Both pages scroll now (the chapter on the left, the anatomy list on the
      // right), so the wheel belongs to whichever pane the cursor is over.
      let page = e.target && e.target.closest ? e.target.closest(".bio-chapter, .bio-parts-pane") : null;
      if (!page) page = container.querySelector(".bio-chapter");
      if (!page) return;
      // Wheel deltas arrive in pixels, lines or pages depending on the device.
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
      page.scrollTop += delta;
      if (this._biologicWindow) this.syncUIScrollVar(page);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  };

  // The window keeps a per-chapter scroll offset so switching tabs and coming
  // back lands where you left off.
  Scene_BiologicSimulation.prototype.syncUIScrollVar = function (page) {
    const win = this._biologicWindow;
    if (!win || !page) return;
    const byCategory = { 0: "_partsScrollY", 1: "_vitalScrollY", 5: "_brainScrollY" };
    win[byCategory[win._category] || "_vitalScrollY"] = page.scrollTop;
  };

  Scene_BiologicSimulation.prototype.drawUIStatusBust = function (actor, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const bustPath = getActorBustImagePath(actor);
    if (!bustPath) return;

    const bitmap = ImageManager.loadBitmap('', bustPath);
    const drawBust = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const shouldCrop = !bustPath.includes('img/enemies/');
      const sourceWidth = bitmap.width > 0 ? bitmap.width : 889;
      const sourceHeight = bitmap.height > 0 ? bitmap.height : 1200;

      let cropTop = 0;
      let cropLeft = 0;
      let croppedSourceWidth = sourceWidth;
      let croppedSourceHeight = sourceHeight;

      if (shouldCrop) {
        cropTop = 320;
        cropLeft = Math.round(sourceWidth * 0.2);
        croppedSourceWidth = Math.round(sourceWidth * 0.6);
        croppedSourceHeight = sourceHeight - cropTop;
      }

      const aspectRatio = croppedSourceWidth / croppedSourceHeight;
      let drawWidth = canvas.width;
      let drawHeight = Math.round(canvas.width / aspectRatio);

      if (drawHeight > canvas.height) {
        drawHeight = canvas.height;
        drawWidth = Math.round(canvas.height * aspectRatio);
      }

      const drawX = Math.round((canvas.width - drawWidth) / 2);
      const drawY = Math.round((canvas.height - drawHeight) / 2);

      ctx.drawImage(bitmap.canvas, cropLeft, cropTop, croppedSourceWidth, croppedSourceHeight, drawX, drawY, drawWidth, drawHeight);
    };

    if (bitmap.isReady()) {
      drawBust();
    } else {
      bitmap.addLoadListener(drawBust);
    }
  };

  Scene_BiologicSimulation.prototype.selectUIActor = function (index) {
    if (index >= 0 && index < $gameParty.members().length) {
      Scene_BiologicSimulation._targetActorIndex = index;
      SoundManager.playCursor();

      if (this._biologicWindow) {
        this._biologicWindow.stopBiologicSimulation();
        this._biologicWindow._actor = $gameParty.members()[index];
        this._biologicWindow.initializeBiologicData();
        this._biologicWindow.startBiologicSimulation();
      }
      this.refreshUIBiologic();
    }
  };

  Scene_BiologicSimulation.prototype.selectUICategory = function (index) {
    if (index >= 0 && index < this._categories.length) {
      this._category = index;
      if (this._biologicWindow) {
        this._biologicWindow._category = index;
      }
      SoundManager.playCursor();
      this.refreshUIBiologic();
    }
  };

  Scene_BiologicSimulation.prototype.cycleUICategory = function (dir) {
    const n = this._categories.length;
    this.selectUICategory((this._category + dir + n) % n);
  };

  // The right stick scrolls the open page, pushed the way the page should go.
  // Analog, so the further it is pushed the faster the page runs.
  Scene_BiologicSimulation.prototype.updateUIStickScroll = function (page) {
    if (!page) return;
    const pads = window.AnalogStickInput;
    if (!pads || typeof pads.rightY !== 'function') return;
    const dz = 0.15;
    const y = pads.rightY();
    if (Math.abs(y) <= dz) return;
    const amount = ((Math.abs(y) - dz) / (1 - dz)) * Math.sign(y);
    page.scrollTop += amount * 16;
    this.syncUIScrollVar(page);
  };

  Scene_BiologicSimulation.prototype.updateUIBiologicInput = function () {
    if (!this.isActive()) return;

    // The arrows own the chapter tabs, the bumpers own the character.
    if (Input.isTriggered('right')) {
      this.cycleUICategory(1);
    } else if (Input.isTriggered('left')) {
      this.cycleUICategory(-1);
    }

    if (Input.isTriggered('pagedown')) {
      this.cycleUIActor(1);
    } else if (Input.isTriggered('pageup')) {
      this.cycleUIActor(-1);
    }

    const chapter = this._dndContainer ? this._dndContainer.querySelector(".bio-chapter") : null;
    if (chapter) {
      this.updateUIStickScroll(chapter);
      if (Input.isPressed('down')) {
        chapter.scrollTop += 8;
        this.syncUIScrollVar(chapter);
      } else if (Input.isPressed('up')) {
        chapter.scrollTop -= 8;
        this.syncUIScrollVar(chapter);
      }
    }
  };

  Scene_BiologicSimulation.prototype.refreshUIBiologic = function () {
    if (!this._dndContainer) return;
    const actor = this._biologicWindow ? this._biologicWindow._actor : $gameParty.members()[Scene_BiologicSimulation._targetActorIndex] || $gameParty.members()[0];
    if (!actor) return;

    const useTranslation = ConfigManager.language === "it";

    if (this._biologicWindow) {
      this._category = this._biologicWindow._category;
    }

    const allMembers = $gameParty.members();
    let companionTabsHTML = "";
    allMembers.forEach((member, idx) => {
      const isSelected = idx === Scene_BiologicSimulation._targetActorIndex ? "selected" : "";
      companionTabsHTML += `
            <div class="companion-tab ${isSelected}" onclick="SceneManager._scene.selectUIActor(${idx})">
                ${member.name()}
            </div>
        `;
    });
    // The bumpers switch character here, so the shared L / R hints apply.
    const companionHTML = window.CharSwitcher.inner(
      `<div class="companion-tabs-row bio-06">${companionTabsHTML}</div>`,
      allMembers.length
    );

    const bio = actor._biologicData;
    if (!bio) {
      if (this._biologicWindow) this._biologicWindow.initializeBiologicData();
    }

    const bloodType = actor._biologicData.bloodType;
    const personality = actor._biologicData.personality;
    const pName = _personalityText(personality.name, 'name');
    const classLabel = actor.currentClass() ? actor.currentClass().name : T('Biologic.classFallback');
    const repVarId = getReproductionVarId(actor);
    const repTypeNum = $gameVariables.value(repVarId) !== undefined ? $gameVariables.value(repVarId) : -1;

    const repLabels = T.list('Biologic.reproductionType');
    let repText = T('Biologic.none');
    if (repTypeNum >= 0 && repTypeNum < repLabels.length) {
      repText = repLabels[repTypeNum];
    }

    const leftProfileHTML = `
        <div class="metric-row"><span class="metric-label">${T('Biologic.class')}</span><span class="metric-value">${classLabel} (Lv ${actor.level})</span></div>
        <div class="metric-row"><span class="metric-label">${T('Biologic.bloodType')}</span><span class="metric-value">${bloodType.type} (${bloodType.rarity})</span></div>
        <div class="metric-row"><span class="metric-label">${T('Biologic.personality')}</span><span class="metric-value bio-07">${pName}</span></div>
        <div class="metric-row"><span class="metric-label">${T('Biologic.reproduction')}</span><span class="metric-value">${repText}</span></div>
    `;
    // The identity rows are no longer a card of their own on the left page:
    // they open the Overview chapter, which is where the rest of "who is this"
    // already lives.
    this._profileRowsHTML = leftProfileHTML;

    // Only redraw the bust canvas when its driving value (the bust image path)
    // changes; the canvas itself is not rebuilt by this refresh.
    const bustPath = getActorBustImagePath(actor);
    if (bustPath !== this._lastBustPath) {
      this._lastBustPath = bustPath;
      this.drawUIStatusBust(actor, "biologic-bust");
    }

    // position:static here: the sticky pinning is owned by the wrapping
    // .bio-right-header (which also holds the character switcher) so the two
    // rows pin together instead of colliding at top:0.
    let categoryTabsHTML = `<div class="category-tabs-top bio-08">`;
    this._categories.forEach((cat, idx) => {
      const isSelected = idx === this._category ? "selected" : "";
      const catName = T('Biologic.tab.' + cat);
      categoryTabsHTML += `
            <div class="category-tab-top ${isSelected}" onclick="SceneManager._scene.selectUICategory(${idx})">
                ${catName}
            </div>
        `;
    });
    categoryTabsHTML += `</div>`;

    const header = this._dndContainer.querySelector(".bio-left-header");
    const headerHTML = `<div class="companion-switcher bio-10">${companionHTML}</div>${categoryTabsHTML}`;
    if (header && headerHTML !== this._lastHeaderHTML) {
      this._lastHeaderHTML = headerHTML;
      header.innerHTML = headerHTML;
    }

    const chapterPane = this._dndContainer.querySelector(".bio-chapter");
    const chapterScrollTop = chapterPane ? chapterPane.scrollTop : 0;

    let rightHTML = "";

    switch (this._category) {
      case 0:
        rightHTML += this.renderChapterOverview(actor, useTranslation);
        break;
      case 1:
        rightHTML += this.renderChapterVitals(actor, useTranslation);
        break;
      case 2:
        rightHTML += this.renderChapterHormones(actor, useTranslation);
        break;
      case 3:
        rightHTML += this.renderChapterImmune(actor, useTranslation);
        break;
      case 4:
        rightHTML += this.renderChapterLeyVeins(actor, useTranslation);
        break;
      case 5:
        rightHTML += this.renderChapterBrain(actor, useTranslation);
        break;
      case 6:
        rightHTML += this.renderChapterReproduction(actor, useTranslation);
        break;
      // Appended rather than slotted in beside Vitals: the chapter indices are
      // read by name in a dozen places (the brain page is 5, the parts page 0),
      // so a new tab goes on the end and nothing else moves.
      case 7:
        rightHTML += this.renderChapterDiseases(actor);
        break;
    }

    if (chapterPane && rightHTML !== this._lastRightHTML) {
      this._lastRightHTML = rightHTML;
      chapterPane.innerHTML = rightHTML;
      chapterPane.scrollTop = chapterScrollTop;
    }

    // The anatomy list is not a chapter: it stands on the right page whatever
    // the left page is showing.
    const partsPane = this._dndContainer.querySelector(".bio-parts-pane");
    const partsHTML = this.renderBodyPartsPane(actor);
    if (partsPane && partsHTML !== this._lastPartsHTML) {
      const partsScroll = partsPane.scrollTop;
      this._lastPartsHTML = partsHTML;
      partsPane.innerHTML = partsHTML;
      partsPane.scrollTop = partsScroll;
    }
  };

  // Where each humanoid part sits on the body plate, as percentages of the
  // plate: x is the centre of the chip, y its top. Anything not named here is
  // not part of the human plan and goes in the grid beside the body.
  const BODY_MAP = {
    HEAD: [50, 0], LEFT_EYE: [26, 8], BRAIN: [50, 8], RIGHT_EYE: [74, 8],
    LEFT_EAR: [26, 16], NOSE: [50, 16], RIGHT_EAR: [74, 16],
    MOUTH: [37, 24], TEETH: [63, 24],
    LEFT_ARM: [12, 33], TORSO: [50, 32], RIGHT_ARM: [88, 33],
    LEFT_HAND: [12, 41], LEFT_LUNG: [36, 40], RIGHT_LUNG: [64, 40], RIGHT_HAND: [88, 41],
    LEFT_FINGERS: [12, 49], HEART: [36, 48], RIGHT_FINGERS: [88, 49],
    LIVER: [36, 56], STOMACH: [64, 56],
    SPLEEN: [36, 64], INTESTINES: [64, 64],
    GENITALS: [50, 72],
    LEFT_LEG: [34, 80], RIGHT_LEG: [66, 80],
    LEFT_FOOT: [34, 88], RIGHT_FOOT: [66, 88],
    LEFT_TOES: [34, 96], RIGHT_TOES: [66, 96]
  };

  // A body is drawn as a body only when the anatomy really is the human plan:
  // a head, a torso and the four limbs. Creatures and anything rebuilt by a
  // hit source fall back to the flat grid.
  const HUMANOID_CORE = ["HEAD", "TORSO", "LEFT_ARM", "RIGHT_ARM", "LEFT_LEG", "RIGHT_LEG"];
  function isHumanoidAnatomy(parts) {
    if (!parts) return false;
    return HUMANOID_CORE.every((k) => !!parts[k]);
  }

  // Drawn to scale and centred: the old path was stretched by
  // preserveAspectRatio="none" across the whole plate, which flattened the
  // head into a lump.
  const BODY_SILHOUETTE = `
      <svg class="bio-body-figure" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <circle cx="50" cy="13" r="10"/>
          <rect x="46" y="21" width="8" height="8" rx="3"/>
          <path d="M50 28c-8 0-14 3-16 9l-4 27c-0.8 5 7 6 7.6 1L40 45v22c0 8 1 16 2 24h16c1-8 2-16 2-24V45l2.4 20c0.6 5 8.4 4 7.6-1l-4-27c-2-6-8-9-16-9z"/>
          <path d="M42 93l-3 38-2 42c0 5 8 5 8.4 0L49 129l1-36z"/>
          <path d="M58 93l3 38 2 42c0 5-8 5-8.4 0L51 129l-1-36z"/>
      </svg>`;

  // ---- The creature plate ------------------------------------------------
  // A character whose anatomy is not the human plan is drawn as its OWN 3D
  // model: window.ActorModel3D is the one answer to which model portrays a
  // character, so the figure on this page is the figure the status screen
  // shows. It is rendered once, flat filled in a single ink, and cached as an
  // image, so the page never carries a live GL context of its own.
  const creatureSilhouettes = {};

  const silhouetteInk = () => {
    try {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--text-primary-hover").trim();
      if (v) return v;
    } catch (e) {}
    return "#e0b000";
  };

  // One colour, no lighting, no billboards: a silhouette, not a portrait.
  function paintFlat(root, color) {
    const flat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) o.material = flat;
      else if (o.isSprite || o.isPoints || o.isLine) o.visible = false;
    });
  }

  function drawCreatureSilhouette(battler, actor) {
    let renderer = null;
    try {
      const W = 360, H = 560;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      const scene3d = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 300);
      try { battler.update(1 / 60); } catch (e) {}
      // A limb this character has lost is missing from the silhouette too.
      const HC = window.HealthCore;
      const states = (HC && HC.partStates) ? HC.partStates(actor) : actor._bodyParts;
      try { if (states && battler.hideBrokenParts) battler.hideBrokenParts(states); } catch (e) {}
      const fit = window.ActorModel3D.framing(battler, camera, 1.12);
      const holder = new THREE.Group();
      holder.position.copy(fit.center).multiplyScalar(-1);
      holder.add(battler.model);
      scene3d.add(holder);
      paintFlat(battler.model, silhouetteInk());
      camera.position.set(0, 0, fit.distance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene3d, camera);
      return canvas.toDataURL("image/png");
    } catch (e) {
      return null;
    } finally {
      if (renderer) {
        try { renderer.dispose(); } catch (e) {}
        try { renderer.forceContextLoss(); } catch (e) {}
      }
    }
  }

  // Returns the cached image, or null while it is being built: the page
  // re-renders itself once the model has arrived.
  function creatureSilhouette(actor) {
    const AM = window.ActorModel3D;
    if (!AM || !AM.infoFor || typeof THREE === "undefined") return null;
    let info = null;
    try { info = AM.infoFor(actor); } catch (e) { info = null; }
    if (!info) return null;
    const key = actor.actorId() + ":" + (AM.keyFor(info) || "");
    if (Object.prototype.hasOwnProperty.call(creatureSilhouettes, key)) {
      return creatureSilhouettes[key];
    }
    creatureSilhouettes[key] = null;
    const scene = SceneManager._scene;
    Promise.resolve(AM.build(info)).then((battler) => {
      const url = (battler && battler.model) ? drawCreatureSilhouette(battler, actor) : null;
      creatureSilhouettes[key] = url;
      if (url && SceneManager._scene === scene && scene.refreshUIBiologic) scene.refreshUIBiologic();
    }).catch(() => { creatureSilhouettes[key] = null; });
    return null;
  }

  // The limb and organ plate, drawn once and shown on every chapter.
  Scene_BiologicSimulation.prototype.renderBodyPartsPane = function (actor) {
    const parts = actor._bodyParts || {};
    const humanoid = isHumanoidAnatomy(parts);

    const chipHTML = (key, part, placed, gridStyle) => {
      // Broken, cut off or destroyed: which word a finished part gets is the
      // difficulty's and the part's business (window.HealthCore.partStatusLabel).
      const HC = window.HealthCore;
      const statusText = (HC && HC.partStatusLabel) ? HC.partStatusLabel(actor, key, part) : "";
      const isDestroyed = !!statusText || part.damaged || part.currentHp <= 0;
      const rate = part.maxHp > 0 ? (part.currentHp / part.maxHp) * 100 : 0;
      const hpText = isDestroyed ? (statusText || T('Biologic.destroyed')) : `${Math.ceil(part.currentHp)}/${part.maxHp}`;
      const band = isDestroyed ? 'gauge-band--bad' : window.NeedGauge.band(rate);
      const pos = placed ? BODY_MAP[key] : null;
      const style = pos
        ? ` style="left:${pos[0]}%;top:${pos[1]}%"`
        : (gridStyle ? ` style="${gridStyle}"` : "");
      const cls = (placed ? "bodypart-cell bodypart-cell--placed" : "bodypart-cell")
        + (gridStyle ? " bodypart-cell--flank" : "")
        + (isDestroyed ? " destroyed" : "");
      return `
              <div class="${cls}"${style}>
                  <span class="bodypart-vital-lbl">${part.name}</span>
                  <span class="bodypart-vital-val gauge-ink ${band}">${hpText}</span>
                  <div class="bodypart-vital-bar">
                      <div class="bodypart-vital-bar-fill gauge-fill ${band}" style="width:${isDestroyed ? 0 : rate}%"></div>
                  </div>
              </div>
          `;
    };

    if (!humanoid) {
      // Chips flank the figure two to a row, so none of them covers the model
      // or its neighbour. The order the anatomy is declared in is kept.
      const keys = Object.keys(parts).filter((k) => !!parts[k]);
      const rows = Math.max(1, Math.ceil(keys.length / 2));
      let chips = "";
      keys.forEach((key, i) => {
        const col = (i % 2 === 0) ? 1 : 3;
        const row = Math.floor(i / 2) + 1;
        chips += chipHTML(key, parts[key], false, `grid-column:${col};grid-row:${row}`);
      });
      const silhouette = creatureSilhouette(actor);
      const figure = silhouette
        ? `<img class="bio-creature-figure" src="${silhouette}" alt="" style="grid-row:1 / span ${rows}">`
        : `<div class="bio-creature-figure bio-creature-figure--pending" style="grid-row:1 / span ${rows}"></div>`;
      return `
          <div class="card-header bio-parts-title">${T('Biologic.bodyParts')}</div>
          <div class="bio-creature-plate" style="grid-template-rows:repeat(${rows}, auto)">
              ${figure}
              ${chips}
          </div>
      `;
    }

    let plateHTML = "";
    let extraHTML = "";
    for (const key in parts) {
      const part = parts[key];
      if (!part) continue;
      if (BODY_MAP[key]) plateHTML += chipHTML(key, part, true);
      else extraHTML += chipHTML(key, part, false);
    }

    const extrasBlock = extraHTML
      ? `<div class="bio-parts-extra-title">${T('Biologic.additionalAnatomy')}</div>
         <div class="bio-parts-grid">${extraHTML}</div>`
      : "";

    return `
          <div class="card-header bio-parts-title">${T('Biologic.bodyParts')}</div>
          <div class="bio-body-plate">
              ${BODY_SILHOUETTE}
              ${plateHTML}
          </div>
          ${extrasBlock}
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterOverview = function (actor, useTranslation) {
    const states = actor.states();
    let statesHTML = "";
    states.forEach(state => {
      statesHTML += `
              <span class="badge info bio-11">
                  ${state.name}
              </span>
          `;
    });
    if (statesHTML === "") statesHTML = `<span>${T('Biologic.noActiveStates')}</span>`;

    return `
          <div class="card">
              <div class="card-header">${T('Biologic.tab.overview')}</div>
              ${this._profileRowsHTML || ""}
          </div>
          <div class="card">
              <div class="card-header">${T('Biologic.statesReactions')}</div>
              <div class="bio-13">
                  ${statesHTML}
              </div>
          </div>
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterVitals = function (actor, useTranslation) {
    const vitals = actor._biologicData.vitalSigns || {};
    const cellular = actor._biologicData.cellularActivity;
    if (!vitals.bloodPressure) vitals.bloodPressure = { systolic: 120, diastolic: 80 };
    if (!vitals.nutrients) vitals.nutrients = { calories: 2000, protein: 60, carbs: 250, fats: 70, water: 2200 };

    const hr = Math.floor(num(vitals.heartRate, 72));
    const hrStatus = hr < 60 ? (T('Biologic.bradycardia')) : (hr > 100 ? (T('Biologic.tachycardia')) : (T('Biologic.normal')));
    const hrColor = (hr < 60 || hr > 100) ? "danger" : "success";

    const s = Math.floor(num(vitals.bloodPressure.systolic, 120));
    const d = Math.floor(num(vitals.bloodPressure.diastolic, 80));
    const bpStatus = s > 140 ? (T('Biologic.hypertension')) : (s < 90 ? (T('Biologic.hypotension')) : (T('Biologic.normal')));
    const bpColor = bpStatus !== (T('Biologic.normal')) ? "danger" : "success";

    const temp = num(vitals.bodyTemperature, 36.8);
    const tempStatus = temp > 37.5 ? (T('Biologic.fever')) : (temp < 36.0 ? (T('Biologic.hypothermia')) : (T('Biologic.normal')));
    const tempColor = tempStatus !== (T('Biologic.normal')) ? "danger" : "success";

    const o2 = Math.floor(num(vitals.oxygenSaturation, 98));
    const o2Status = o2 < 95 ? (T('Biologic.low')) : (T('Biologic.normal'));
    const o2Color = o2 < 95 ? "danger" : "success";

    const cort = Math.floor(num(vitals.cortisol, 15));
    const cortStatus = cort > 25 ? (T('Biologic.highStress')) : (cort < 10 ? (T('Biologic.low')) : (T('Biologic.normal')));
    const cortColor = cort > 25 ? "danger" : (cort < 10 ? "warning" : "success");

    const resp = Math.floor(vitals.heartRate / 4) + Math.floor(Math.random() * 4);
    const respStatus = resp > 20 ? (T('Biologic.high')) : (resp < 12 ? (T('Biologic.low')) : (T('Biologic.normal')));
    const respColor = respStatus !== (T('Biologic.normal')) ? "danger" : "success";

    const pH = (7.4 + (Math.random() - 0.5) * 0.1);
    const pHStatus = pH < 7.35 ? (T('Biologic.acidic')) : (pH > 7.45 ? (T('Biologic.alkaline')) : (T('Biologic.normal')));
    const pHColor = pHStatus !== (T('Biologic.normal')) ? "danger" : "success";

    const glucose = 90 + Math.floor((num(vitals.nutrients.carbs, 250) / 300) * 50) + Math.floor(Math.random() * 20);
    const glucoseStatus = glucose > 140 ? (T('Biologic.high')) : (glucose < 70 ? (T('Biologic.low')) : (T('Biologic.normal')));
    const glucoseColor = glucoseStatus !== (T('Biologic.normal')) ? "danger" : "success";

    const hydration = Math.floor((num(vitals.nutrients.water, 2200) / 2500) * 100);
    const hydrationStatus = hydration < 70 ? (T('Biologic.dehydrated')) : (hydration > 100 ? (T('Biologic.overhydrated')) : (T('Biologic.normal')));
    const hydrationColor = hydrationStatus !== (T('Biologic.normal')) ? "danger" : "success";

    let cellularHTML = "";
    if (cellular) {
      const forming = Math.floor(num(cellular.cellsForming, 0));
      const dying = Math.floor(num(cellular.cellsDying, 0));
      const totalCells = num(cellular.totalCells, 37200000000000);
      cellularHTML = `
              <div class="card">
                  <div class="card-header">${T('Biologic.cellularActivity')}</div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.cellsForming')}</span><span class="metric-value">${forming.toLocaleString()}/sec</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.cellsDying')}</span><span class="metric-value">${dying.toLocaleString()}/sec</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.netCellChange')}</span><span class="metric-value" style="color:${forming >= dying ? 'var(--text-text-alt-18)' : 'var(--text-settings-active)'}">${forming >= dying ? "+" : ""}${(forming - dying).toLocaleString()}/sec</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.mitosisRate')}</span><span class="metric-value">${num(cellular.mitosisRate, 0).toFixed(3)}%</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.apoptosisRate')}</span><span class="metric-value">${num(cellular.apoptosisRate, 0).toFixed(3)}%</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.totalCellCount')}</span><span class="metric-value">${totalCells.toExponential(2)}</span></div>
              </div>
          `;
    }

    return `
          <div class="card">
              <div class="card-header">${T('Biologic.cardiovascularVitalSigns')}</div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.heartRate')}</span><span class="badge ${hrColor}">${hr} BPM (${hrStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.bloodPressure')}</span><span class="badge ${bpColor}">${s}/${d} mmHg (${bpStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.bodyTemperature')}</span><span class="badge ${tempColor}">${temp.toFixed(1)}°C (${tempStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.oxygenSaturation')}</span><span class="badge ${o2Color}">${o2}% (${o2Status})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.cortisolStress')}</span><span class="badge ${cortColor}">${cort} μg/dL (${cortStatus})</span></div>
          </div>
          <div class="card">
              <div class="card-header">${T('Biologic.metabolism')}</div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.respiratoryRate')}</span><span class="badge ${respColor}">${T('Biologic.unit.breathsPerMinute', { n: resp })} (${respStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.bloodPh')}</span><span class="badge ${pHColor}">${pH.toFixed(2)} (${pHStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.bloodGlucose')}</span><span class="badge ${glucoseColor}">${glucose} mg/dL (${glucoseStatus})</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.hydrationLevel')}</span><span class="badge ${hydrationColor}">${hydration}% (${hydrationStatus})</span></div>
          </div>
          ${cellularHTML}
          <div class="card">
              <div class="card-header">${T('Biologic.nutritionalReserves')}</div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.calories')}</span><span class="metric-value">${Math.floor(num(vitals.nutrients.calories, 0))} kcal</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.protein')}</span><span class="metric-value">${Math.floor(num(vitals.nutrients.protein, 0))}g</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.carbohydrates')}</span><span class="metric-value">${Math.floor(num(vitals.nutrients.carbs, 0))}g</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.fats')}</span><span class="metric-value">${Math.floor(num(vitals.nutrients.fats, 0))}g</span></div>
              <div class="metric-row"><span class="metric-label">${T('Biologic.water')}</span><span class="metric-value">${Math.floor(num(vitals.nutrients.water, 0))}ml</span></div>
          </div>
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterHormones = function (actor, useTranslation) {
    const hormones = actor._biologicData.hormones || {};
    const testosterone = num(hormones.testosterone, 0);
    const estrogen = num(hormones.estrogen, 0);
    const progesterone = num(hormones.progesterone, 0);

    const testStatus = testosterone > 800 ? (T('Biologic.high')) : (testosterone < 300 ? (T('Biologic.low')) : (T('Biologic.balanced')));
    const testColor = testStatus === (T('Biologic.balanced')) ? "success" : "warning";

    const estStatus = estrogen > 70 ? (T('Biologic.high')) : (estrogen < 15 ? (T('Biologic.low')) : (T('Biologic.balanced')));
    const estColor = estStatus === (T('Biologic.balanced')) ? "success" : "warning";

    const progStatus = progesterone > 20 ? (T('Biologic.high')) : (progesterone < 1 ? (T('Biologic.low')) : (T('Biologic.balanced')));
    const progColor = progStatus === (T('Biologic.balanced')) ? "success" : "warning";

    const adr = num(hormones.adrenaline, 12);
    const adrStatus = adr > 30 ? (T('Biologic.adrenalineRush')) : (T('Biologic.normal'));
    const adrColor = adr > 30 ? "danger" : "success";

    const ins = num(hormones.insulin, 15);
    const insStatus = ins > 25 ? (T('Biologic.high')) : (ins < 5 ? (T('Biologic.hypoglycemic')) : (T('Biologic.stable')));
    const insColor = insStatus === (T('Biologic.stable')) ? "success" : "danger";

    // The model stores this as `thyroid`; the old `thyroidStimulatingHormone`
    // read never existed, so the panel always printed the same 2.1 placeholder.
    const tsh = num(hormones.thyroid, 2.1);
    // Melatonin is not simulated: track the game clock so it at least reflects
    // the day/night cycle instead of a frozen number. Peaks around 03:00.
    const hour = Math.floor(($gameVariables.value(114) || 0) / 60) % 24;
    const mel = num(hormones.melatonin, 4 + 26 * Math.pow(Math.max(0, Math.cos((hour - 3) * Math.PI / 12)), 3));

    return `
          <div class="card">
              <div class="card-header">${T('Biologic.endocrineSexHormones')}</div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.testosterone')}</span>
                  <span class="badge ${testColor}">${Math.floor(testosterone)} ng/dL (${testStatus})</span>
              </div>
              <div class="gauge-container">
                  <div class="gauge-outer"><div class="gauge-inner hp" style="width:${Math.min(100, (testosterone / 1200) * 100)}%"></div></div>
              </div>

              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.estrogen')}</span>
                  <span class="badge ${estColor}">${Math.floor(estrogen)} pg/mL (${estStatus})</span>
              </div>
              <div class="gauge-container">
                  <div class="gauge-outer"><div class="gauge-inner magic" style="width:${Math.min(100, (estrogen / 150) * 100)}%"></div></div>
              </div>

              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.progesterone')}</span>
                  <span class="badge ${progColor}">${progesterone.toFixed(1)} ng/mL (${progStatus})</span>
              </div>
              <div class="gauge-container">
                  <div class="gauge-outer"><div class="gauge-inner mp" style="width:${Math.min(100, (progesterone / 40) * 100)}%"></div></div>
              </div>
          </div>
          
          <div class="card">
              <div class="card-header">${T('Biologic.adrenalsGrowthRegulators')}</div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.adrenaline')}</span>
                  <span class="badge ${adrColor}">${adr.toFixed(1)} pg/mL (${adrStatus})</span>
              </div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.insulinLevel')}</span>
                  <span class="badge ${insColor}">${ins.toFixed(1)} μIU/mL (${insStatus})</span>
              </div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.thyroidStimulatingHormone')}</span>
                  <span class="metric-value">${tsh.toFixed(2)} μIU/mL</span>
              </div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.melatoninSleepCycle')}</span>
                  <span class="metric-value">${mel.toFixed(1)} pg/mL</span>
              </div>
          </div>
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterImmune = function (actor, useTranslation) {
    const immune = actor._biologicData.immuneSystem || {};
    const wbc = Math.floor(num(immune.whiteBloodCells, 7000));
    const wbcStatus = wbc > 11000 ? (T('Biologic.activeInfection')) : (wbc < 4000 ? (T('Biologic.immunodeficient')) : (T('Biologic.normal')));
    const wbcColor = wbc > 11000 ? "danger" : (wbc < 4000 ? "warning" : "success");

    const ab = Math.floor(num(immune.antibodies, 1100));
    const abStatus = ab > 1600 ? (T('Biologic.hyperactive')) : (ab < 700 ? (T('Biologic.deficiency')) : (T('Biologic.strong')));
    const abColor = ab > 1600 ? "warning" : (ab < 700 ? "danger" : "success");

    // Infections list
    let infectionsHTML = "";
    let foundPathogen = false;

    if (immune.viruses && immune.viruses.length > 0) {
      foundPathogen = true;
      immune.viruses.forEach(v => {
        infectionsHTML += `
                  <div class="metric-row bio-14">
                      <div>
                          <strong class="bio-15">${pathogenLabel(v.name)} (${T('Biologic.virus')})</strong>
                          <div class="bio-16">${T('Biologic.viralCopies')}: ${Math.floor(v.copies).toLocaleString()}/mL</div>
                      </div>
                      <span class="badge danger">${T('Biologic.active')}</span>
                  </div>
              `;
      });
    }

    if (immune.bacteria && immune.bacteria.length > 0) {
      foundPathogen = true;
      immune.bacteria.forEach(b => {
        infectionsHTML += `
                  <div class="metric-row bio-14">
                      <div>
                          <strong class="bio-15">${pathogenLabel(b.name)} (${T('Biologic.bacterium')})</strong>
                          <div class="bio-16">${T('Biologic.cfuCount')}: ${Math.floor(b.cfu).toLocaleString()}/mL</div>
                      </div>
                      <span class="badge danger">${T('Biologic.infection')}</span>
                  </div>
              `;
      });
    }

    if (!foundPathogen) {
      infectionsHTML = `<div class="bio-17">
              ${T('Biologic.noActivePathogensOrSystemic')}
          </div>`;
    }

    return `
          <div class="card">
              <div class="card-header">${T('Biologic.immunology')}</div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.whiteBloodCells')}</span>
                  <span class="badge ${wbcColor}">${wbc.toLocaleString()} /μL (${wbcStatus})</span>
              </div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.antibodies')}</span>
                  <span class="badge ${abColor}">${ab.toLocaleString()} mg/dL (${abStatus})</span>
              </div>
          </div>
          
          <div class="card">
              <div class="card-header bio-15">${T('Biologic.activePathogensInfections')}</div>
              <div class="bio-18">
                  ${infectionsHTML}
              </div>
          </div>
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterLeyVeins = function (actor, useTranslation) {
    const ley = actor._biologicData.leyVeins || {};
    const bodyParts = actor._bodyParts || {};

    // leyVeins stores `flow` (0-100, from the MP ratio); the meridians hold a
    // per-part `flow` already expressed as a percentage.
    const flow = Math.floor(num(ley.flow, 0));
    const flowStatus = flow > 120 ? (T('Biologic.overload')) : (flow < 40 ? (T('Biologic.stagnant')) : (T('Biologic.harmonious')));
    const flowColor = flow > 120 ? "danger" : (flow < 40 ? "warning" : "success");

    const leyStability = (flow > 120 || flow < 40) ? (T('Biologic.unstable')) : (T('Biologic.stable'));
    const stabilityColor = leyStability === (T('Biologic.stable')) ? "success" : "danger";

    // Draw Ley Veins table
    let tableRows = "";
    for (let vein in ley.meridians) {
      const meridian = ley.meridians[vein] || {};
      const part = bodyParts[vein];
      const partName = part ? part.name : (meridian.name || vein);
      // Channel integrity is the health of the body part the meridian runs
      // through; a severed part reads 0.
      let integrityPercent;
      if (part && num(part.maxHp, 0) > 0) {
        integrityPercent = part.damaged ? 0 : Math.floor((num(part.currentHp, 0) / part.maxHp) * 100);
      } else {
        integrityPercent = Math.max(0, 100 - Math.floor(num(meridian.blockage, 0)));
      }
      integrityPercent = Math.max(0, Math.min(100, integrityPercent));
      const currentFlow = Math.floor(num(meridian.flow, 0));

      let rowColor = "success";
      if (integrityPercent < 30) rowColor = "danger";
      else if (integrityPercent < 75) rowColor = "warning";

      tableRows += `
              <div class="meridian-row">
                  <span class="meridian-name">${partName}</span>
                  <span class="meridian-val meridian-val--${rowColor}">${integrityPercent}%</span>
                  <span class="meridian-track"><span class="meridian-fill meridian-fill--${rowColor}" style="width:${integrityPercent}%"></span></span>
                  <span class="meridian-flow" title="${T('Biologic.flowIntensity')}">≈ ${currentFlow}%</span>
              </div>
          `;
    }

    return `
          <div class="card bio-26 bio-span-2 ley-summary">
              <div class="ley-summary-item">
                  <span class="metric-label">${T('Biologic.manaFlowRate')}</span>
                  <span class="badge ${flowColor}">${flow}% (${flowStatus})</span>
              </div>
              <div class="ley-summary-item">
                  <span class="metric-label">${T('Biologic.channelStability')}</span>
                  <span class="badge ${stabilityColor}">${leyStability}</span>
              </div>
          </div>
          
          <div class="card bio-26 bio-span-2">
              <div class="card-header bio-27">${T('Biologic.meridianChannelStatus')}</div>
              <div class="meridian-list">
                  ${tableRows}
              </div>
          </div>
      `;
  };

  Scene_BiologicSimulation.prototype.renderChapterBrain = function (actor, useTranslation) {
    const brain = actor._biologicData.brainActivity;
    if (!brain) return "";

    // These are computed by the window from the region activities; the DOM used
    // to read jungianState / egoLevel / orgoneLevel, which nothing ever writes,
    // so the panel sat on "Balanced" and three frozen 50% bars.
    const win = this._biologicWindow;
    const moodKey = win ? win.calculateCurrentMood(brain) : "Neutral"; // i18n-ignore: mood id
    const moodLabelKey = 'Biologic.mood.' + moodKey;
    const mood = T.has(moodLabelKey) ? T(moodLabelKey) : moodKey;
    const thought = (win && win.getOrUpdateCurrentThought())
      || (T('Biologic.mentalSilence'));
    const ego = win ? num(win.calculateEgoValue(brain), 50) : 50;
    const subc = win ? num(win.calculateSubconsciousValue(brain), 50) : 50;
    const orgone = win ? num(win.calculateOrgonePercentage(brain), 50) : 50;

    // Localized brain region display list
    let regionsHTML = "";
    if (brain.regions && typeof brain.regions === 'object') {
      for (let rId in brain.regions) {
        const r = brain.regions[rId];
        const regionName = brainI18nText(r.name_it && useTranslation ? r.name_it : r.name) || rId;
        const funcDesc = brainI18nText(r.function_it && useTranslation ? r.function_it : r.function);
        const activity = Math.floor(num(r.activity, 0));

        let badgeStatus = T('Biologic.moderate');
        let badgeColor = "success";
        if (activity > 80) {
          badgeStatus = T('Biologic.hyperactive');
          badgeColor = "danger";
        } else if (activity < 40) {
          badgeStatus = T('Biologic.hypoactive');
          badgeColor = "warning";
        }

        // Every region carries its own transmitter panel (the motor cortex has
        // acetylcholine/GABA, the prefrontal dopamine/serotonin/norepinephrine),
        // so list all of them with their oxygen draw instead of a bare bar.
        const nts = r.neurotransmitters || {};
        const ntLabels = T.obj('Biologic.ntAbbrev') || {};
        const ntHTML = Object.keys(nts)
          .filter((k) => Number.isFinite(Number(nts[k])))
          .map((k) => `<span class="brain-nt-chip"><span class="brain-nt-key">${ntLabels[k] || k}</span> ${Number(nts[k]).toFixed(2)}</span>`)
          .join("");
        const oxygenVal = num(r.oxygenConsumption, 0);

        regionsHTML += `
                  <div class="brain-region-card brain-region-card--${badgeColor}">
                      <div class="brain-region-header">
                          <strong class="bio-32">${regionName}</strong>
                          <span class="badge ${badgeColor} bio-33">${activity}% (${badgeStatus})</span>
                      </div>
                      <div class="brain-region-bar"><div class="brain-region-bar-fill badge-fill--${badgeColor}" style="width:${Math.max(0, Math.min(100, activity))}%"></div></div>
                      <div class="brain-region-func">${funcDesc}</div>
                      <div class="brain-region-meta">
                          <span class="brain-region-o2">${T('Biologic.oxygenConsumption')}: ${oxygenVal.toFixed(1)}</span>
                          <span class="brain-region-nt">${ntHTML}</span>
                      </div>
                  </div>
              `;
      }
    }

    // brainActivity.waves holds frequencies in Hz (alpha 8-13, gamma 30-50),
    // not fractions: the old x100 read them as percentages and printed 4000%.
    // The bar shows each band's share of the total spectral power instead.
    const waves = brain.waves || {};
    const waveBands = [
      { label: T('Biologic.wave.gamma'), hz: num(waves.gamma, 0), band: "gamma" },
      { label: T('Biologic.wave.beta'), hz: num(waves.beta, 0), band: "beta" },
      { label: T('Biologic.wave.alpha'), hz: num(waves.alpha, 0), band: "alpha" },
      { label: T('Biologic.wave.theta'), hz: num(waves.theta, 0), band: "theta" },
      { label: T('Biologic.wave.delta'), hz: num(waves.delta, 0), band: "delta" }
    ];
    const waveTotal = waveBands.reduce((sum, b) => sum + b.hz, 0);
    waveBands.forEach((b) => {
      b.share = waveTotal > 0 ? (b.hz / waveTotal) * 100 : 20;
    });

    return `
          <div class="card">
              <div class="card-header">${T('Biologic.jungianPsychicalRegister')}</div>
              <div class="metric-row">
                  <span class="metric-label">${T('Biologic.cognitiveAlignment')}</span>
                  <span class="badge success">${mood}</span>
              </div>
              <div class="metric-row bio-34">
                  <span class="metric-label">${T('Biologic.activeThought')}</span>
                  <span class="metric-value bio-15">"${thought}"</span>
              </div>
              <hr class="bio-35">
              
              <div class="metric-row bio-36">
                  <span>${T('Biologic.ego')}: ${Math.floor(ego)}%</span>
                  <span>${T('Biologic.subconscious')}: ${Math.floor(subc)}%</span>
              </div>
              <div class="gauge-container">
                  <div class="gauge-outer bio-37">
                      <div class="gauge-inner hp bio-38" style="width:${ego}%"></div>
                      <div class="gauge-inner magic bio-39" style="width:${subc}%"></div>
                  </div>
              </div>
              <div class="metric-row bio-40">
                  <span class="metric-label">${T('Biologic.orgoneEnergyCharge')}</span>
                  <span class="metric-value">${Math.floor(orgone)}%</span>
              </div>
              <div class="gauge-container">
                  <div class="gauge-outer"><div class="gauge-inner orgone" style="width:${Math.max(0, Math.min(100, orgone))}%"></div></div>
              </div>
          </div>

          <div class="card">
              <div class="card-header">${T('Biologic.electroencephalogramSpectrum')}</div>
              <div class="metric-row bio-41">
                  ${waveBands.map((b) => `<span>${b.label}: ${b.hz.toFixed(1)} Hz</span>`).join("")}
              </div>
              <div class="gauge-container bio-42">
                  <div class="gauge-outer bio-43">
                      ${waveBands.map((b) => `<div class="bio-44 eeg-band--${b.band}" style="width:${b.share}%"></div>`).join("")}
                  </div>
              </div>
          </div>

          <div class="card bio-26 bio-span-2">
              <div class="card-header">${T('Biologic.brainRegionalCortexRegistry')}</div>
              <div class="bio-brain-regions">
                  ${regionsHTML}
              </div>
          </div>
      `;
  };

  // The Diseases chapter is not drawn here: Health_DiseaseSystem owns the
  // sheet and the status screen prints the identical one, so a patient reads
  // the same wherever the player opens them.
  Scene_BiologicSimulation.prototype.renderChapterDiseases = function (actor) {
    const api = window.DiseaseSystem;
    if (!api || !api.panelHTML) return `<div class="card-header">${T('Biologic.tab.diseases')}</div>`;
    return `
      <div class="card">
        <div class="card-header">${T('Biologic.tab.diseases')}</div>
        ${api.panelHTML(actor)}
      </div>
    `;
  };

  Scene_BiologicSimulation.prototype.renderChapterReproduction = function (actor, useTranslation) {
    const repType = $gameVariables.value(getReproductionVarId(actor));
    const uterus = actor._uterusData;

    if (repType === -1) {
      return `
              <div class="card bio-46">
                  <div class="bio-47"></div>
                  <h3>${T('Biologic.reproductiveSystemShielded')}</h3>
                  <p class="bio-48">
                      ${T('Biologic.thisActorIsAsexualSterile')}
                  </p>
              </div>
          `;
    }

    if (repType === 0) {
      // Field names must match what initializeUterusData actually writes
      // (spermMotility, spermMorphology, testosteroneProduction); the old
      // short names rendered "undefined%".
      const testes = actor.testesData || {};
      const spermCount = num(testes.spermCount, 350000000);
      const motility = num(testes.spermMotility, 65);
      const morphology = num(testes.spermMorphology, 8);
      const testosterone = num(testes.testosteroneProduction,
        num(actor._biologicData && actor._biologicData.hormones && actor._biologicData.hormones.testosterone, 650));
      // fertilityRate / dailySpermProduction are stored zeroed and nothing
      // ever fills them, so derive them here.
      const dailyProduction = Math.floor((testosterone / 500) * 100);
      const fertility = (
        (motility / 80) * 100 +
        (morphology / 14) * 100 +
        Math.min(100, (spermCount / 500000000) * 100)
      ) / 3;
      return `
              <div class="card">
                  <div class="card-header">${T('Biologic.maleReproductiveGlands')}</div>
                  <div class="metric-columns">
                  <div class="metric-row"><span class="metric-label">${T('Biologic.spermDensity')}</span><span class="metric-value">${(spermCount / 1000000).toFixed(0)}M /mL</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.dailyProductionRate')}</span><span class="metric-value">${T('Biologic.unit.millionPerDay', { n: dailyProduction.toFixed(0) })}</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.spermMotility')}</span><span class="metric-value">${motility.toFixed(1)}%</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.normalMorphology')}</span><span class="metric-value">${morphology.toFixed(1)}%</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.testosteroneOutput')}</span><span class="metric-value">${testosterone.toFixed(0)} ng/dL</span></div>
                  <div class="metric-row"><span class="metric-label">${T('Biologic.fertilityIndex')}</span><span class="metric-value">${fertility.toFixed(1)}%</span></div>
                  </div>
              </div>
          `;
    }

    if (uterus) {
      const isPregnant = uterus.isPregnant;
      let detailsHTML = "";

      if (isPregnant) {
        const gestationalAge = uterus.gestationalAge || 0;
        // The term is the actor's archetype's, so the bands below are read off
        // how far along the pregnancy is rather than off a fixed day count.
        const term = getPregnancyDuration(actor);
        const progress = term > 0 ? gestationalAge / term : 0;
        const trimester = progress < 1 / 3 ? 1 : (progress < 2 / 3 ? 2 : 3);
        const progressPercent = Math.min(100, progress * 100);

        // One ladder of gestational bands; the prose is Biologic.fetalBand.<id>.
        const fetalBandId =
          progress >= 8 / 9 ? "term"
            : progress >= 2 / 3 ? "late"
              : progress >= 1 / 3 ? "organogenesis"
                : "embryonic";
        const fetalWeights = { term: "2.8kg", late: "1.2kg", organogenesis: "150g", embryonic: "< 1g" };
        const sizeDesc = T('Biologic.fetalBand.' + fetalBandId + '.size');
        const weightDesc = fetalWeights[fetalBandId];
        const fetalStage = T('Biologic.fetalBand.' + fetalBandId + '.stage');
        const milestone = T('Biologic.fetalBand.' + fetalBandId + '.milestone');

        detailsHTML = `
                  <div class="card bio-49">
                      <div class="card-header bio-15">${T('Biologic.activeGestationalRegistry')}</div>
                      <div class="metric-columns">
                      <div class="metric-row"><span class="metric-label">${T('Biologic.gestationalState')}</span><span class="badge danger">${T('Biologic.pregnant')}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.gestationalAge')}</span><span class="metric-value">${gestationalAge} ${T('Biologic.days')} (${(gestationalAge / 7).toFixed(1)} ${T('Biologic.weeks')})</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.currentTrimester')}</span><span class="metric-value">${trimester}° ${T('Biologic.trimester')}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.gestationalTerm')}</span><span class="metric-value">${term} ${T('Biologic.days')}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.gestationalProgress')}</span><span class="metric-value">${progressPercent.toFixed(1)}%</span></div>
                      </div>
                      <div class="gauge-container">
                          <div class="gauge-outer"><div class="gauge-inner hp" style="width:${progressPercent}%"></div></div>
                      </div>
                  </div>
                  
                  <div class="card">
                      <div class="card-header">${T('Biologic.fetalBiometricRegister')}</div>
                      <div class="metric-columns">
                      <div class="metric-row"><span class="metric-label">${T('Biologic.developmentalStage')}</span><span class="metric-value bio-50">${fetalStage}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.estimatedFetalLength')}</span><span class="metric-value">${sizeDesc}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.estimatedFetalWeight')}</span><span class="metric-value">${weightDesc}</span></div>
                      </div>
                      <div class="metric-row bio-51"><span class="metric-label bio-52">${T('Biologic.developmentalMilestone')}</span></div>
                      <p class="bio-53">${milestone}</p>
                  </div>
              `;
      } else {
        // Read the cycle the model actually keeps (ovulationCycle / eggCount);
        // the old uterus.ovulating / eggReserve / daysToNextCycle fields do not
        // exist, so this panel was frozen on its placeholder values.
        const cycle = uterus.ovulationCycle || {};
        const cycleLength = num(cycle.cycleLength, 28);
        const dayInCycle = num(cycle.dayInCycle, 1);
        const ovulationDay = num(cycle.ovulationDay, 14);
        const isFertile = cycle.fertile !== undefined
          ? !!cycle.fertile
          : Math.abs(dayInCycle - ovulationDay) <= 2;
        let daysToNext = ovulationDay - dayInCycle;
        if (daysToNext < 0) daysToNext += cycleLength;
        const ovulating = isFertile ? (T('Biologic.ovulatingHighFertility')) : (T('Biologic.lutealPhaseLowFertility'));
        detailsHTML = `
                  <div class="card">
                      <div class="card-header">${T('Biologic.physiologicalOvarianCycle')}</div>
                      <div class="metric-columns">
                      <div class="metric-row"><span class="metric-label">${T('Biologic.cycleStatus')}</span><span class="badge ${isFertile ? 'success' : 'info'}">${ovulating}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.dayOfCycle')}</span><span class="metric-value">${dayInCycle} / ${cycleLength}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.estimatedEggReserve')}</span><span class="metric-value">${Math.floor(num(uterus.eggCount, 400000)).toLocaleString()} ${T('Biologic.oocytes')}</span></div>
                      <div class="metric-row"><span class="metric-label">${T('Biologic.daysToNextOvulation')}</span><span class="metric-value">${daysToNext} ${T('Biologic.days')}</span></div>
                      </div>
                  </div>


                  <div class="card bio-54">
                      <p class="bio-55">
                          ${T('Biologic.noActiveConceptionSeedlingGermination')}
                      </p>
                  </div>
              `;
      }
      return detailsHTML;
    }

    return `<div class="bio-56">${T('Biologic.noReproductiveRegisterDataAvailable')}</div>`;
  };

  // State Reaction System for Biologic Simulation
  Window_BiologicSimulation.prototype.applyStateReactions = function () {
    if (!this._actor || !this._actor._biologicData) return;

    var states = this._actor._states;
    var bio = this._actor._biologicData;

    // Reset to base values first
    this.resetBiologicToBase();

    // Apply state effects
    for (var i = 0; i < states.length; i++) {
      var stateId = states[i];
      this.applyStateEffect(stateId, bio);
    }
  };

  Window_BiologicSimulation.prototype.resetBiologicToBase = function () {
    var bio = this._actor._biologicData;

    // Reset vital signs to normal ranges
    bio.vitalSigns.heartRate = Math.max(
      60,
      Math.min(100, bio.vitalSigns.heartRate)
    );
    bio.vitalSigns.bloodPressure.systolic = Math.max(
      110,
      Math.min(140, bio.vitalSigns.bloodPressure.systolic)
    );
    bio.vitalSigns.bodyTemperature = Math.max(
      36.0,
      Math.min(37.5, bio.vitalSigns.bodyTemperature)
    );
    bio.vitalSigns.cortisol = Math.max(
      10,
      Math.min(25, bio.vitalSigns.cortisol)
    );

    // Reset immune system
    bio.immuneSystem.whiteBloodCells = Math.max(
      4000,
      Math.min(11000, bio.immuneSystem.whiteBloodCells)
    );
    bio.immuneSystem.antibodies = Math.max(
      700,
      Math.min(1600, bio.immuneSystem.antibodies)
    );

    // Clear temporary infections and pathogens
    bio.immuneSystem.viruses = bio.immuneSystem.viruses.filter(function (v) {
      return !v.temporary;
    });
    bio.immuneSystem.bacteria = bio.immuneSystem.bacteria.filter(function (b) {
      return !b.temporary;
    });

    // Reset ley vein activity to normal
    for (var meridian in bio.leyVeins.meridians) {
      if (bio.leyVeins.meridians[meridian].status === "Normal") {
        bio.leyVeins.meridians[meridian].magicalActivity = 100;
      }
    }

    // Reset brain activity to normal
    if (bio.brainActivity) {
      for (var region in bio.brainActivity.regions) {
        var regionData = bio.brainActivity.regions[region];
        if (regionData.normalActivity) {
          regionData.activity = regionData.normalActivity;
        }
      }
    }
  };

  Window_BiologicSimulation.prototype.applyStateEffect = function (
    stateId,
    bio
  ) {
    switch (stateId) {
      case 1: // Dead
        bio.vitalSigns.heartRate = 0;
        bio.vitalSigns.bloodPressure.systolic = 0;
        bio.vitalSigns.bloodPressure.diastolic = 0;
        bio.vitalSigns.bodyTemperature = 20.0;
        bio.vitalSigns.oxygenSaturation = 0;
        bio.immuneSystem.whiteBloodCells = 0;
        if (bio.brainActivity) {
          for (var region in bio.brainActivity.regions) {
            bio.brainActivity.regions[region].activity = 0;
          }
          bio.brainActivity.neurons.firing = 0;
          bio.brainActivity.overallActivity = 0;
        }
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = 0;
        }
        break;

      case 2: // Guard
        bio.immuneSystem.whiteBloodCells += 2000;
        bio.immuneSystem.antibodies += 300;
        bio.vitalSigns.cortisol += 5;
        bio.hormones.adrenaline += 10;
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity += 20;
          bio.brainActivity.regions.sensoryCortex.activity += 15;
        }
        break;

      case 3: // Immortal
        bio.vitalSigns.heartRate = 45; // Slow, efficient heartbeat
        bio.hormones.growth += 2;
        bio.immuneSystem.whiteBloodCells += 5000;
        bio.immuneSystem.antibodies += 500;
        if (bio.brainActivity) {
          for (var region in bio.brainActivity.regions) {
            bio.brainActivity.regions[region].activity = Math.min(
              100,
              bio.brainActivity.regions[region].activity + 25
            );
          }
        }
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = 150;
        }
        break;

      case 4: // Poison
        bio.vitalSigns.heartRate += 20;
        bio.vitalSigns.bodyTemperature += 1.0;
        bio.immuneSystem.whiteBloodCells += 3000;
        bio.vitalSigns.cortisol += 10;
        bio.immuneSystem.bacteria.push({
          name: "Toxin-producing bacteria", // i18n-ignore: pathogen id
          type: "Pathogenic", // i18n-ignore: pathogen class id
          count: 50000 + Math.floor(Math.random() * 50000),
          temporary: true,
        });
        if (bio.brainActivity) {
          bio.brainActivity.regions.brainstem.activity -= 15;
          bio.brainActivity.regions.prefrontalCortex.activity -= 20;
        }
        break;

      case 5: // Blind
        bio.vitalSigns.cortisol += 8;
        bio.hormones.adrenaline += 15;
        if (bio.brainActivity) {
          bio.brainActivity.regions.occipitalLobe.activity -= 60; // Visual processing severely reduced
          bio.brainActivity.regions.sensoryCortex.activity += 10; // Other senses compensate
        }
        // Affect head meridian
        if (bio.leyVeins.meridians.head) {
          bio.leyVeins.meridians.head.magicalActivity = Math.max(
            50,
            bio.leyVeins.meridians.head.magicalActivity - 30
          );
        }
        break;

      case 6: // Silence
        bio.vitalSigns.cortisol += 5;
        if (bio.brainActivity) {
          bio.brainActivity.regions.temporalLobe.activity -= 30; // Language processing affected
        }
        // Reduce magical flow
        bio.leyVeins.flow = Math.max(30, bio.leyVeins.flow - 20);
        break;

      case 7: // Rage
        bio.vitalSigns.heartRate += 40;
        bio.vitalSigns.bloodPressure.systolic += 30;
        bio.vitalSigns.bloodPressure.diastolic += 20;
        bio.vitalSigns.bodyTemperature += 0.8;
        bio.hormones.adrenaline += 50;
        bio.hormones.testosterone += 100;
        bio.vitalSigns.cortisol += 15;
        if (bio.brainActivity) {
          bio.brainActivity.regions.amygdala.activity += 60; // Fear/emotion center highly active
          bio.brainActivity.regions.prefrontalCortex.activity -= 25; // Reduced rational thinking
          bio.brainActivity.waves.beta += 15; // Increased beta waves
        }
        break;

      case 8: // Confusion
        bio.vitalSigns.cortisol += 12;
        bio.hormones.adrenaline += 20;
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity -= 40;
          bio.brainActivity.regions.hippocampus.activity -= 25; // Memory affected
          bio.brainActivity.waves.theta += 10; // Increased theta waves (confusion)
        }
        // Head magicalActivity lives on leyVeins.meridians, not brainActivity.regions
        // (regions has no 'head' key - the old path threw every tick).
        if (bio.leyVeins && bio.leyVeins.meridians.head) {
          bio.leyVeins.meridians.head.magicalActivity = Math.max(
            40,
            bio.leyVeins.meridians.head.magicalActivity - 40
          );
        }
        break;

      case 9: // Charm
        bio.hormones.estrogen += 50;
        bio.vitalSigns.heartRate += 10;
        bio.vitalSigns.cortisol -= 5;
        if (bio.brainActivity) {
          bio.brainActivity.regions.amygdala.activity -= 20; // Reduced fear response
          bio.brainActivity.regions.prefrontalCortex.activity += 15; // Enhanced social processing
        }
        break;

      case 10: // Sleep
        bio.vitalSigns.heartRate -= 15;
        bio.vitalSigns.bloodPressure.systolic -= 20;
        bio.vitalSigns.bloodPressure.diastolic -= 15;
        bio.vitalSigns.bodyTemperature -= 0.5;
        bio.vitalSigns.cortisol -= 8;
        bio.hormones.growth += 1;
        if (bio.brainActivity) {
          bio.brainActivity.waves.delta += 10; // Increased delta waves
          bio.brainActivity.waves.theta += 5;
          bio.brainActivity.waves.beta -= 15;
          bio.brainActivity.overallActivity -= 30;
          for (var region in bio.brainActivity.regions) {
            bio.brainActivity.regions[region].activity *= 0.6; // Reduced activity across all regions
          }
        }
        break;

      case 11: // Freeze
        bio.vitalSigns.heartRate -= 25;
        bio.vitalSigns.bodyTemperature -= 5.0;
        bio.vitalSigns.bloodPressure.systolic -= 30;
        if (bio.brainActivity) {
          bio.brainActivity.regions.motorCortex.activity -= 70; // Severely reduced motor function
          bio.brainActivity.regions.cerebellum.activity -= 60; // Balance/coordination affected
          bio.brainActivity.overallActivity -= 40;
        }
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = Math.max(
            20,
            bio.leyVeins.meridians[meridian].magicalActivity - 60
          );
        }
        break;

      case 12: // Paralysis
        bio.vitalSigns.heartRate -= 10;
        bio.vitalSigns.cortisol += 20;
        bio.hormones.adrenaline += 30;
        if (bio.brainActivity) {
          bio.brainActivity.regions.motorCortex.activity -= 80; // Motor control severely affected
          bio.brainActivity.regions.cerebellum.activity -= 70;
          bio.brainActivity.regions.prefrontalCortex.activity += 10; // Increased awareness of paralysis
        }
        // Affect limb meridians
        if (bio.leyVeins.meridians.arms) {
          bio.leyVeins.meridians.arms.magicalActivity = Math.max(
            10,
            bio.leyVeins.meridians.arms.magicalActivity - 70
          );
        }
        if (bio.leyVeins.meridians.legs) {
          bio.leyVeins.meridians.legs.magicalActivity = Math.max(
            10,
            bio.leyVeins.meridians.legs.magicalActivity - 70
          );
        }
        break;

      case 13: // Stun
        bio.vitalSigns.heartRate += 25;
        bio.vitalSigns.cortisol += 15;
        bio.hormones.adrenaline += 40;
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity -= 50;
          bio.brainActivity.regions.sensoryCortex.activity -= 30;
          bio.brainActivity.waves.alpha -= 10;
          bio.brainActivity.waves.beta += 20; // Chaotic brain activity
        }
        // Head magicalActivity lives on leyVeins.meridians, not brainActivity.regions
        // (regions has no 'head' key - the old path threw every tick).
        if (bio.leyVeins && bio.leyVeins.meridians.head) {
          bio.leyVeins.meridians.head.magicalActivity = Math.max(
            30,
            bio.leyVeins.meridians.head.magicalActivity - 50
          );
        }
        break;

      // Continue with more states...
      case 15: // HP Regeneration
        bio.vitalSigns.heartRate += 5;
        bio.hormones.growth += 3;
        bio.immuneSystem.whiteBloodCells += 1500;
        bio.vitalSigns.nutrients.protein += 20;
        if (bio.brainActivity) {
          bio.brainActivity.regions.brainstem.activity += 10; // Enhanced vital functions
        }
        if (bio.cellularActivity) {
          bio.cellularActivity.cellsForming *= 1.5; // Increased cell formation
          bio.cellularActivity.mitosisRate *= 1.3;
        }
        break;

      case 16: // MP Regeneration
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = Math.min(
            200,
            bio.leyVeins.meridians[meridian].magicalActivity + 50
          );
        }
        bio.leyVeins.flow = Math.min(150, bio.leyVeins.flow + 30);
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity += 15; // Enhanced mental focus
        }
        break;

      case 44: // Infected
        bio.vitalSigns.heartRate += 30;
        bio.vitalSigns.bodyTemperature += 2.5;
        bio.immuneSystem.whiteBloodCells += 6000;
        bio.vitalSigns.cortisol += 20;

        if (bio.brainActivity) {
          bio.brainActivity.overallActivity -= 20; // Reduced brain function due to infection
          bio.brainActivity.regions.brainstem.activity += 15; // Fighting infection
        }

        // Count total persistent infections (not temporary)
        var persistentInfections = 0;
        bio.immuneSystem.bacteria.forEach(function (bacterium) {
          if (!bacterium.temporary) persistentInfections++;
        });
        bio.immuneSystem.viruses.forEach(function (virus) {
          if (!virus.temporary) persistentInfections++;
        });

        // Only add new infection if less than 3 persistent infections
        if (persistentInfections < 3) {
          var pathogenTypes = ["bacteria", "virus"];
          var chosenType = pathogenTypes[Math.floor(Math.random() * pathogenTypes.length)];

          if (chosenType === "bacteria") {
            // i18n-ignore-start: species ids, resolved at the render point
            var bacteriaNames = [
              "Staphylococcus aureus",
              "Streptococcus pyogenes",
              "Escherichia coli",
              "Pseudomonas aeruginosa",
              "Clostridium difficile"
            ];
            // i18n-ignore-end
            var randomBacteria = bacteriaNames[Math.floor(Math.random() * bacteriaNames.length)];
            bio.immuneSystem.bacteria.push({
              name: randomBacteria,
              type: "Pathogenic", // i18n-ignore: pathogen class id
              count: 100000 + Math.floor(Math.random() * 300000),
              temporary: false, // Persistent infection
              infectionStartDate: convertGameDateToTimestamp(getGameDateFromVariable()) // Track infection start date for gradual reduction
            });
          } else {
            // i18n-ignore-start: species ids, resolved at the render point
            var virusNames = [
              "Influenza Virus",
              "Rhinovirus",
              "Inflammatory Virus",
              "Herpesvirus",
              "Coronavirus"
            ];
            // i18n-ignore-end
            var randomVirus = virusNames[Math.floor(Math.random() * virusNames.length)];
            bio.immuneSystem.viruses.push({
              name: randomVirus,
              type: "Pathogenic", // i18n-ignore: pathogen class id
              count: 30000 + Math.floor(Math.random() * 100000),
              temporary: false, // Persistent infection
              infectionStartDate: convertGameDateToTimestamp(getGameDateFromVariable()) // Track infection start date for gradual reduction
            });
          }
        }
        break;

      case 48: // Bleeding
        bio.vitalSigns.heartRate += 35;
        bio.vitalSigns.bloodPressure.systolic -= 20;
        bio.vitalSigns.bloodPressure.diastolic -= 15;
        bio.immuneSystem.whiteBloodCells += 2500;
        bio.vitalSigns.cortisol += 15;

        if (bio.brainActivity) {
          bio.brainActivity.overallActivity -= 15; // Reduced due to blood loss
          bio.brainActivity.regions.brainstem.activity += 20; // Compensating for blood loss
        }

        if (bio.cellularActivity) {
          bio.cellularActivity.cellsDying *= 1.3; // Increased cell death due to bleeding
        }

        bio.immuneSystem.bacteria.push({
          name: "Hemolytic bacteria", // i18n-ignore: pathogen id
          type: "Opportunistic", // i18n-ignore: pathogen class id
          count: 40000 + Math.floor(Math.random() * 60000),
          temporary: true,
        });
        break;

      case 20: // Provoked
        bio.vitalSigns.heartRate += 30;
        bio.vitalSigns.bloodPressure.systolic += 20;
        bio.hormones.adrenaline += 40;
        bio.vitalSigns.cortisol += 12;
        if (bio.brainActivity) {
          bio.brainActivity.regions.amygdala.activity += 50; // Heightened emotion
          bio.brainActivity.regions.motorCortex.activity += 25; // Increased motor readiness
          bio.brainActivity.waves.beta += 20; // Increased alertness
        }
        break;

      case 23: // Status Ailment Block
        bio.immuneSystem.whiteBloodCells += 3000;
        bio.immuneSystem.antibodies += 400;
        bio.vitalSigns.cortisol += 5;
        // Increase overall immune system strength
        for (var pathogen in bio.immuneSystem.viruses) {
          if (bio.immuneSystem.viruses[pathogen].count > 0) {
            bio.immuneSystem.viruses[pathogen].count *= 0.7; // Reduce virus count
          }
        }
        for (var bacterium in bio.immuneSystem.bacteria) {
          if (bio.immuneSystem.bacteria[bacterium].count > 0) {
            bio.immuneSystem.bacteria[bacterium].count *= 0.7; // Reduce bacteria count
          }
        }
        break;

      case 25: // Hot
        bio.vitalSigns.bodyTemperature += 2.5; // Increase temperature
        bio.vitalSigns.heartRate += 15;
        bio.vitalSigns.sweatRate = (bio.vitalSigns.sweatRate || 0) + 30;
        bio.vitalSigns.cortisol += 5;
        break;

      case 26: // Cold
        bio.vitalSigns.bodyTemperature -= 2.5; // Decrease temperature
        bio.vitalSigns.heartRate -= 10;
        bio.vitalSigns.cortisol += 8;
        if (bio.brainActivity) {
          bio.brainActivity.regions.motorCortex.activity -= 30; // Reduced motor control in cold
          bio.brainActivity.overallActivity -= 15;
        }
        break;

      case 27: // Static
        bio.leyVeins.flow = Math.min(200, bio.leyVeins.flow + 60);
        bio.vitalSigns.heartRate += 20;
        bio.vitalSigns.bodyTemperature += 1.5;
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = Math.min(
            250,
            bio.leyVeins.meridians[meridian].magicalActivity + 40
          );
        }
        if (bio.brainActivity) {
          bio.brainActivity.waves.gamma += 30; // High frequency brain activity
        }
        break;

      case 31: // Berserk
        bio.vitalSigns.heartRate += 50;
        bio.vitalSigns.bodyTemperature += 1.5;
        bio.vitalSigns.bloodPressure.systolic += 40;
        bio.hormones.adrenaline += 80;
        bio.hormones.testosterone += 150;
        bio.vitalSigns.cortisol += 20;
        if (bio.brainActivity) {
          bio.brainActivity.regions.amygdala.activity = 100; // Maximum fear/rage
          bio.brainActivity.regions.prefrontalCortex.activity = 10; // Minimal rational control
          bio.brainActivity.regions.motorCortex.activity += 40;
          bio.brainActivity.waves.beta = 100;
        }
        break;

      case 36: // Arcane Surge
        // Increase all meridians to very high levels (max 999%)
        for (var meridian in bio.leyVeins.meridians) {
          bio.leyVeins.meridians[meridian].magicalActivity = 999;
        }
        bio.leyVeins.flow = 300;
        bio.vitalSigns.heartRate += 25;
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity += 35;
          bio.brainActivity.waves.gamma += 50;
        }
        break;

      case 40: // Vulnerability
        bio.immuneSystem.whiteBloodCells = Math.max(500, bio.immuneSystem.whiteBloodCells - 3000);
        bio.immuneSystem.antibodies = Math.max(100, bio.immuneSystem.antibodies - 300);
        bio.vitalSigns.cortisol += 15;
        bio.hormones.adrenaline += 20;
        break;

      case 41: // Nausea
        bio.vitalSigns.heartRate += 10;
        bio.vitalSigns.cortisol += 8;
        if (bio.brainActivity) {
          bio.brainActivity.regions.cerebellum.activity -= 25; // Balance center affected
          bio.brainActivity.regions.brainstem.activity += 15; // Nausea processing
        }
        // Slight temperature fluctuation from nausea
        bio.vitalSigns.bodyTemperature += 0.3;
        break;

      case 42: // Drunk
        bio.vitalSigns.heartRate += 20;
        bio.vitalSigns.bodyTemperature += 1.0;
        bio.vitalSigns.bloodPressure.systolic += 15;
        bio.vitalSigns.cortisol -= 5; // Reduced stress due to alcohol
        bio.hormones.dopamine = (bio.hormones.dopamine || 50) + 30;
        if (bio.brainActivity) {
          bio.brainActivity.regions.prefrontalCortex.activity -= 50; // Severe impairment of judgment
          bio.brainActivity.regions.motorCortex.activity -= 35; // Reduced motor control
          bio.brainActivity.regions.cerebellum.activity -= 40; // Balance severely affected
          bio.brainActivity.waves.theta += 25; // Increased theta (confusion/drowsiness)
          bio.brainActivity.overallActivity -= 30;
        }
        break;

      case 43: // Burned
        bio.vitalSigns.bodyTemperature += 3.0; // Significant temperature increase
        bio.vitalSigns.heartRate += 40;
        bio.vitalSigns.bloodPressure.systolic += 25;
        bio.vitalSigns.cortisol += 20;
        bio.immuneSystem.whiteBloodCells += 4000; // Immune response to burns
        if (bio.brainActivity) {
          bio.brainActivity.regions.sensoryCortex.activity += 60; // Heightened pain sensation
          bio.brainActivity.regions.amygdala.activity += 50; // Fear response
        }
        if (bio.cellularActivity) {
          bio.cellularActivity.cellsDying *= 1.5; // Cell death from burns
        }
        break;
    }

    // Ensure values stay within reasonable bounds
    bio.vitalSigns.heartRate = Math.max(
      0,
      Math.min(200, bio.vitalSigns.heartRate)
    );
    bio.vitalSigns.bloodPressure.systolic = Math.max(
      0,
      Math.min(300, bio.vitalSigns.bloodPressure.systolic)
    );
    bio.vitalSigns.bloodPressure.diastolic = Math.max(
      0,
      Math.min(200, bio.vitalSigns.bloodPressure.diastolic)
    );
    bio.vitalSigns.bodyTemperature = Math.max(
      15.0,
      Math.min(45.0, bio.vitalSigns.bodyTemperature)
    );
    bio.vitalSigns.oxygenSaturation = Math.max(
      0,
      Math.min(100, bio.vitalSigns.oxygenSaturation)
    );
    bio.immuneSystem.whiteBloodCells = Math.max(
      0,
      Math.min(50000, bio.immuneSystem.whiteBloodCells)
    );
    bio.immuneSystem.antibodies = Math.max(
      0,
      Math.min(5000, bio.immuneSystem.antibodies)
    );
    bio.vitalSigns.cortisol = Math.max(
      0,
      Math.min(100, bio.vitalSigns.cortisol)
    );

    // Bound brain activity values
    if (bio.brainActivity) {
      for (var region in bio.brainActivity.regions) {
        bio.brainActivity.regions[region].activity = Math.max(
          0,
          Math.min(100, bio.brainActivity.regions[region].activity)
        );
      }
      bio.brainActivity.overallActivity = Math.max(
        0,
        Math.min(100, bio.brainActivity.overallActivity)
      );
    }
  };
  // Override the refresh method to include state reactions
  // State Reaction System for Biologic Simulation

  // Enhanced drawImmuneSystem to show viruses and bacteria
  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawImmuneSystem = function (startY) {
    return;
    var data = this._actor._biologicData.immuneSystem;
    var y = startY;
    var lineHeight = this.lineHeight();

    this.drawText(
      "White Blood Cells: " + data.whiteBloodCells + "/μL",
      6,
      y,
      300
    );
    y += lineHeight;

    this.drawText("Antibodies: " + data.antibodies + " mg/dL", 6, y, 300);
    y += lineHeight * 2;

    // Active Infections
    this.changeTextColor(this.systemColor());
    this.drawText("Active Infections:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.infections.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
      y += lineHeight;
    } else {
      for (var i = 0; i < data.infections.length; i++) {
        var infection = data.infections[i];
        var severityText = ["Mild", "Moderate", "Severe"][
          infection.severity - 1
        ];
        var text =
          infection.location +
          ": " +
          infection.type +
          " (" +
          severityText +
          ")";

        if (infection.severity >= 2) {
          this.changeTextColor(this.textColor(2)); // Red for moderate/severe
        }

        this.drawText(text, 20, y, 400);
        this.resetTextColor();
        y += lineHeight;
      }
    }

    y += lineHeight;

    // Viruses
    this.changeTextColor(this.systemColor());
    this.drawText("Active Viruses:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.viruses.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
      y += lineHeight;
    } else {
      for (var i = 0; i < Math.min(data.viruses.length, 5); i++) {
        var virus = data.viruses[i];
        var typeColor =
          virus.type === "Pathogenic"
            ? this.textColor(2)
            : virus.type === "Beneficial"
              ? this.textColor(3)
              : this.normalColor();

        this.drawText(virus.name + ":", 20, y, 200);
        this.changeTextColor(typeColor);
        this.drawText(virus.type + " (" + virus.count + ")", 230, y, 200);
        this.resetTextColor();
        y += lineHeight;
      }
      if (data.viruses.length > 5) {
        this.drawText(
          "... and " + (data.viruses.length - 5) + " more",
          20,
          y,
          200
        );
        y += lineHeight;
      }
    }

    y += lineHeight;

    // Bacteria
    this.changeTextColor(this.systemColor());
    this.drawText("Active Bacteria:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.bacteria.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
    } else {
      for (var i = 0; i < Math.min(data.bacteria.length, 5); i++) {
        var bacteria = data.bacteria[i];
        var typeColor =
          bacteria.type === "Pathogenic"
            ? this.textColor(2)
            : bacteria.type === "Beneficial"
              ? this.textColor(3)
              : this.normalColor();

        this.drawText(bacteria.name + ":", 20, y, 200);
        this.changeTextColor(typeColor);
        this.drawText(bacteria.type + " (" + bacteria.count + ")", 230, y, 200);
        this.resetTextColor();
        y += lineHeight;
      }
      if (data.bacteria.length > 5) {
        this.drawText(
          "... and " + (data.bacteria.length - 5) + " more",
          20,
          y,
          200
        );
      }
    }
  };
  // i18n-ignore-end

  Scene_BiologicSimulation._targetActorIndex = 0;

  Scene_Menu.prototype.commandBiologics = function () {
    Scene_BiologicSimulation._targetActorIndex = 0;
    SceneManager.push(Scene_BiologicSimulation);
  };

  var _Game_Interpreter_pluginCommand_pregnancy =
    Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand_pregnancy.call(this, command, args);

    if (command === "MakePregnant") {
      Window_BiologicSimulation.makePregnant();
    }

    if (command === "ShortenPregnancy") {
      Window_BiologicSimulation.shortenPregnancy();
    }
  };
  var _Game_Interpreter_pluginCommand_biologic =
    Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand_biologic.call(this, command, args);

    if (command === "OpenBiologicSimulation") {
      SceneManager.push(Scene_BiologicSimulation);
    }
  };
  if (Utils.RPGMAKER_NAME === "MZ") {
    PluginManager.registerCommand(
      "Health_BiologicSimulation",
      "MakePregnant",
      (args) => {
        Window_BiologicSimulation.makePregnant();
      }
    );
  }
  // MZ compatibility for biologic simulation command
  if (Utils.RPGMAKER_NAME === "MZ") {
    PluginManager.registerCommand(
      "Health_Core",
      "OpenBiologicSimulation",
      (args) => {
        SceneManager.push(Scene_BiologicSimulation);
      }
    );
  }

  PluginManager.registerCommand(
    "Health_BiologicSimulation",
    "ShortenPregnancy",
    (args) => {
      Window_BiologicSimulation.shortenPregnancy();
    }
  );

  // ── Infecting somebody on purpose ─────────────────────────────────────────
  // Every disease in the library has a sealed vial on the shelf, and every
  // vial's common event ends here. The choice is put through $gameMessage
  // rather than a scene of its own precisely so it works in both places the
  // vial can be opened: a choice list is drawn by Scene_Message, which both
  // Scene_Map and Scene_Battle are.
  window.BiologicInfection = {
    // Who can be handed a disease right now. In a fight that is the battle
    // line; outside one it is everybody travelling with the party.
    targets() {
      if (!window.$gameParty) return [];
      const inBattle = typeof $gameParty.inBattle === "function" && $gameParty.inBattle();
      const list = inBattle ? $gameParty.battleMembers() : $gameParty.members();
      return (list || []).filter((actor) => actor && !actor.isDead());
    },

    // Hand one member one disease, and say so. Everything about how the
    // illness then behaves (its window period, its course, its slide into
    // something worse) belongs to Health_DiseaseSystem; this only starts it.
    infect(actor, diseaseId) {
      const api = window.DiseaseSystem;
      if (!api || !actor || !diseaseId) return false;
      const disease = api.getDisease(diseaseId);
      if (!disease) {
        console.warn("[Health_BiologicSimulation] no such disease: " + diseaseId);
        return false;
      }
      // infectActor announces it itself, and answers false when the member is
      // already carrying it, which is what the refusal line reports.
      const took = api.infectActor(actor, diseaseId, T("Biologic.infect.source"));
      if (!took && window.ParchmentToast) {
        window.ParchmentToast.show(
          T("Biologic.infect.already", { actor: actor.name(), disease: disease.name }),
          { severity: "warning", duration: 200 }
        );
      }
      return took;
    },

    // The prompt. One member alive means there is nothing to ask.
    ask(diseaseId) {
      const api = window.DiseaseSystem;
      const disease = api && api.getDisease(diseaseId);
      const members = this.targets();
      if (!disease || !members.length) return;
      if (members.length === 1) {
        this.infect(members[0], diseaseId);
        return;
      }
      if (!window.$gameMessage) {
        this.infect(members[0], diseaseId);
        return;
      }
      $gameMessage.add(T("Biologic.infect.prompt", { disease: disease.name }));
      $gameMessage.setChoices(
        members.map((actor) => actor.name()).concat(T("Biologic.infect.cancel")),
        0,
        members.length            // the cancel row is also what Escape picks
      );
      $gameMessage.setChoiceCallback((index) => {
        const actor = members[index];
        if (actor) this.infect(actor, diseaseId);
      });
    },
  };

  PluginManager.registerCommand(
    "Health_BiologicSimulation",
    "InfectMember",
    (args) => {
      const diseaseId = String((args && args.disease) || "").trim();
      if (!diseaseId) return;
      const silent = String((args && args.silent) || "").toLowerCase() === "true";
      if (silent) {
        const first = window.BiologicInfection.targets()[0];
        if (first) window.BiologicInfection.infect(first, diseaseId);
        return;
      }
      window.BiologicInfection.ask(diseaseId);
    }
  );

  // ── Being looked over by somebody who knows ───────────────────────────────
  // A doctor's visit is not a free reading of the chart: every illness in the
  // party, the ones still inside their window period included, is named only
  // once it has been paid for, one at a time. Naming a disease is what lets
  // the morning dose round start treating it, so the exam screen lists
  // everything carried, undiagnosed entries shown as a price to pay rather
  // than a name to read.
  const DIAGNOSIS_COST = 2500; // 25 euros a disease, per Economy convention (gold/100)

  window.BiologicDiagnosis = {
    COST: DIAGNOSIS_COST,

    // Everyone the exam covers. Away from a fight that is the whole
    // travelling party; in one, only the line that is actually present.
    targets() {
      if (!window.$gameParty) return [];
      const inBattle = typeof $gameParty.inBattle === "function" && $gameParty.inBattle();
      const list = inBattle ? $gameParty.battleMembers() : $gameParty.members();
      return (list || []).filter(Boolean);
    },

    // Every carried illness, named or not, as one row per (member, disease).
    entries() {
      const api = window.DiseaseSystem;
      if (!api) return [];
      const list = [];
      for (const actor of this.targets()) {
        for (const entry of api.actorEntries(actor)) {
          const disease = api.resolve(entry);
          if (disease) list.push({ actor, entry, disease });
        }
      }
      return list;
    },

    // Naming one illness for good: ends its window period the same way a
    // long-enough carry would have.
    reveal(row) {
      row.entry.diagnosed = true;
      if (row.actor.refresh) row.actor.refresh();
    },
  };

  function Window_BiologicDiagnosis() {
    this.initialize(...arguments);
  }

  Window_BiologicDiagnosis.prototype = Object.create(Window_Command.prototype);
  Window_BiologicDiagnosis.prototype.constructor = Window_BiologicDiagnosis;

  Window_BiologicDiagnosis.prototype.makeCommandList = function () {
    for (const row of window.BiologicDiagnosis.entries()) {
      const name = row.entry.diagnosed
        ? T("Biologic.diagnose.rowKnown", { actor: row.actor.name(), disease: row.disease.name })
        : T("Biologic.diagnose.rowUnknown", { actor: row.actor.name() });
      this.addCommand(name, "reveal", true, row);
    }
  };

  Window_BiologicDiagnosis.prototype.drawItem = function (index) {
    const cmd = this._list[index];
    const row = cmd.ext;
    const rect = this.itemLineRect(index);
    this.resetTextColor();
    this.changePaintOpacity(this.isCommandEnabled(index));
    this.drawText(cmd.name, rect.x, rect.y, rect.width - 140);
    if (row.entry.diagnosed) {
      // MZ keeps the palette on ColorManager; Window_Base.textColor was an MV method, and
      // this window does not carry the shim Window_BiologicSimulation has.
      this.changeTextColor(ColorManager.textColor(3));
      this.drawText(T("Biologic.diagnose.knownTag"), rect.x, rect.y, rect.width, "right");
      this.resetTextColor();
    } else {
      this.drawCurrencyValue(window.BiologicDiagnosis.COST, $dataSystem.currencyUnit, rect.x, rect.y, rect.width);
    }
  };

  // Every row acts the instant it is chosen rather than through a generic ok
  // handler, since what happens (pay and reveal, or nothing) depends on the
  // row itself. The window stays open and active either way.
  Window_BiologicDiagnosis.prototype.processOk = function () {
    const cmd = this._list[this.index()];
    const row = cmd && cmd.ext;
    if (!row) return;
    if (row.entry.diagnosed) {
      SoundManager.playBuzzer();
      return;
    }
    if ($gameParty.gold() < window.BiologicDiagnosis.COST) {
      SoundManager.playBuzzer();
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T("Biologic.diagnose.tooExpensive"), { severity: "warning", duration: 150 });
      }
      return;
    }
    $gameParty.loseGold(window.BiologicDiagnosis.COST);
    window.BiologicDiagnosis.reveal(row);
    SoundManager.playShop();
    if (window.ParchmentToast) {
      window.ParchmentToast.show(
        T("Biologic.diagnose.revealed", { actor: row.actor.name(), disease: row.disease.name }),
        { severity: "good", duration: 200 }
      );
    }
    this.refresh();
    this.activate();
  };

  function Scene_BiologicDiagnosis() {
    this.initialize(...arguments);
  }

  Scene_BiologicDiagnosis.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_BiologicDiagnosis.prototype.constructor = Scene_BiologicDiagnosis;

  Scene_BiologicDiagnosis.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    const rowCount = window.BiologicDiagnosis.entries().length;
    const ww = 640;
    const wh = this.calcWindowHeight(Math.min(Math.max(rowCount, 1), 10), true);
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    this._listWindow = new Window_BiologicDiagnosis(new Rectangle(wx, wy, ww, wh));
    this._listWindow.setHandler("cancel", this.popScene.bind(this));
    this.addWindow(this._listWindow);
  };

  PluginManager.registerCommand("Health_BiologicSimulation", "Diagnose", () => {
    if (!window.BiologicDiagnosis.entries().length) {
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T("Biologic.diagnose.empty"), { severity: "info", duration: 180 });
      }
      return;
    }
    SceneManager.push(Scene_BiologicDiagnosis);
  });

  // ── Buying a course of medicine ────────────────────────────────────────────
  // Only a named illness can be shopped for: nobody hands over a course of
  // drugs for something they have not identified. Each row offers the one
  // remedy a doctor would actually reach for - neither the cheapest, weakest
  // dose nor the priciest one, the middle-priced cure on the shelf - priced
  // for however many doses are still missing from the pack.
  const CURE_MANAGE_STOCK_DAYS = 14; // a fortnight's stock for an illness only managed, never cured

  window.BiologicCure = {
    // The remedy a doctor prescribes: a cure over a mere suppressant, and
    // among same-kind options the one sitting in the middle of the price
    // range, not the bargain bin or the premium shelf.
    pickRemedy(diseaseId) {
      const api = window.Medicines;
      if (!api) return null;
      const all = api.forDisease(diseaseId);
      const cures = all.filter((r) => r.kind === "cure");
      const pool = cures.length ? cures : all;
      if (!pool.length) return null;
      const priced = pool
        .map((r) => ({ r, price: ($dataItems[r.itemId] && $dataItems[r.itemId].price) || 0 }))
        .sort((a, b) => a.price - b.price);
      return priced[Math.floor((priced.length - 1) / 2)].r;
    },

    // One row per named illness that has a remedy at all, with what is still
    // missing from the pack to see the course through.
    rows() {
      const api = window.DiseaseSystem;
      if (!api) return [];
      const list = [];
      for (const actor of window.BiologicDiagnosis.targets()) {
        for (const entry of api.actorEntries(actor)) {
          const disease = api.resolve(entry);
          if (!disease) continue;
          const st = api.courseState(actor, entry);
          if (!st || !st.known) continue;
          const remedy = this.pickRemedy(entry.id);
          if (!remedy) continue;
          const item = $dataItems[remedy.itemId];
          if (!item) continue;
          const courseDays = remedy.kind === "cure" ? remedy.days : CURE_MANAGE_STOCK_DAYS;
          const held = $gameParty.numItems(item);
          const needed = Math.max(0, courseDays - held);
          list.push({ actor, entry, disease, remedy, item, needed, cost: needed * (item.price || 0) });
        }
      }
      return list;
    },

    // Stocking the pack. The caller is expected to have already checked gold
    // and `needed`; this just moves it.
    buy(row) {
      $gameParty.loseGold(row.cost);
      $gameParty.gainItem(row.item, row.needed);
    },
  };

  function Window_BiologicCure() {
    this.initialize(...arguments);
  }

  Window_BiologicCure.prototype = Object.create(Window_Command.prototype);
  Window_BiologicCure.prototype.constructor = Window_BiologicCure;

  Window_BiologicCure.prototype.makeCommandList = function () {
    for (const row of window.BiologicCure.rows()) {
      const name = T("Biologic.cure.rowLine", { actor: row.actor.name(), disease: row.disease.name });
      this.addCommand(name, "buy", true, row);
    }
  };

  Window_BiologicCure.prototype.drawItem = function (index) {
    const cmd = this._list[index];
    const row = cmd.ext;
    const rect = this.itemLineRect(index);
    this.resetTextColor();
    this.changePaintOpacity(this.isCommandEnabled(index));
    this.drawText(cmd.name, rect.x, rect.y, rect.width - 140);
    if (row.needed <= 0) {
      // Same as the diagnosis list: the palette lives on ColorManager in MZ.
      this.changeTextColor(ColorManager.textColor(3));
      this.drawText(T("Biologic.cure.stockedTag"), rect.x, rect.y, rect.width, "right");
      this.resetTextColor();
    } else {
      this.drawCurrencyValue(row.cost, $dataSystem.currencyUnit, rect.x, rect.y, rect.width);
    }
  };

  Window_BiologicCure.prototype.processOk = function () {
    const cmd = this._list[this.index()];
    const row = cmd && cmd.ext;
    if (!row) return;
    if (row.needed <= 0) {
      SoundManager.playBuzzer();
      return;
    }
    if ($gameParty.gold() < row.cost) {
      SoundManager.playBuzzer();
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T("Biologic.cure.tooExpensive"), { severity: "warning", duration: 150 });
      }
      return;
    }
    const actorName = row.actor.name();
    const itemName = row.item.name;
    const iconIndex = row.item.iconIndex;
    const count = row.needed;
    window.BiologicCure.buy(row);
    SoundManager.playShop();
    if (window.ParchmentToast) {
      window.ParchmentToast.show(
        T("Biologic.cure.bought", { actor: actorName, item: itemName, count }),
        { severity: "good", duration: 200, icon: iconIndex }
      );
    }
    this.refresh();
    this.activate();
  };

  function Scene_BiologicCure() {
    this.initialize(...arguments);
  }

  Scene_BiologicCure.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_BiologicCure.prototype.constructor = Scene_BiologicCure;

  Scene_BiologicCure.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    const rowCount = window.BiologicCure.rows().length;
    const ww = 640;
    const wh = this.calcWindowHeight(Math.min(Math.max(rowCount, 1), 10), true);
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    this._listWindow = new Window_BiologicCure(new Rectangle(wx, wy, ww, wh));
    this._listWindow.setHandler("cancel", this.popScene.bind(this));
    this.addWindow(this._listWindow);
  };

  PluginManager.registerCommand("Health_BiologicSimulation", "CureDiseases", () => {
    if (!window.BiologicCure.rows().length) {
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T("Biologic.cure.empty"), { severity: "info", duration: 180 });
      }
      return;
    }
    SceneManager.push(Scene_BiologicCure);
  });

  Window_BiologicSimulation.prototype.determinePersonality = function (name) {
    const personalityData = getPersonalityData();
    if (!personalityData || !personalityData.list) {
      console.error("PersonalityData is not loaded!");
      return {
        name: T('Biologic.defaultPersonality'),
        name_it: T('Biologic.defaultPersonality'),
        modifiers: {},
        thoughts: { en: ["..."], it: ["..."] },
      };
    }
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) & 0xffffffff;
    }
    var personalityList = personalityData.list;
    var index = Math.abs(hash) % personalityList.length;
    return JSON.parse(JSON.stringify(personalityList[index]));
  };

  Window_BiologicSimulation.prototype.initialize = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.initialize.call(
        this,
        new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight)
      );
    } else {
      Window_Selectable.prototype.initialize.call(
        this,
        0,
        0,
        Graphics.boxWidth,
        Graphics.boxHeight
      );
    }
    this._brainScrollY = 0;
    this._maxBrainScroll = 0;
    this._vitalScrollY = 0;
    this._maxVitalScroll = 0;
    this._partsScrollY = 0;
    this._maxPartsScroll = 0;
    this._actor = $gameParty.members()[Scene_BiologicSimulation._targetActorIndex] || $gameParty.members()[0];
    this._category = 0; // 0: Home, 1: Vital Signs, 2: Hormones, 3: Immune System, 4: Ley Veins, 5: Brain Activity, 6: Reproduction
    // Only the length of this list is read; the labels live in Biologic.tab.
    this._categories = [
      "overview", "vitals", "hormones", "immune",
      "leyVeins", "brain", "reproduction", "diseases",
    ];

    this.initializeBiologicData();
    this.refresh();
    this.activate();
    this.select(0);

    // Initialize thought system
    this._currentThought = "";
    this._thoughtStartTime = 0;
    this._thoughtDuration = 0;

    // Start real-time simulation
    this.startBiologicSimulation();
  };

  // Override cursor movement for brain tab
  Window_BiologicSimulation.prototype.cursorUp = function (wrap) {
    if (this._category === 5) {
      // Brain Activity tab
      this._brainScrollY = Math.max(0, this._brainScrollY - this.lineHeight());
      this.refresh();
    } else if (this._category === 1) {
      // Vital Signs tab
      this._vitalScrollY = Math.max(0, this._vitalScrollY - this.lineHeight());
      this.refresh();
    } else if (this._category === 0) {
      // Home / Body Parts tab
      this._partsScrollY = Math.max(0, this._partsScrollY - this.lineHeight());
      this.refresh();
    } else {
      // Normal cursor behavior for other tabs
      Window_Selectable.prototype.cursorUp.call(this, wrap);
    }
  };

  Window_BiologicSimulation.prototype.cursorDown = function (wrap) {
    if (this._category === 5) {
      // Brain Activity tab
      this._brainScrollY = Math.min(
        this._maxBrainScroll,
        this._brainScrollY + this.lineHeight()
      );
      this.refresh();
    } else if (this._category === 1) {
      // Vital Signs tab
      this._vitalScrollY = Math.min(
        this._maxVitalScroll,
        this._vitalScrollY + this.lineHeight()
      );
      this.refresh();
    } else if (this._category === 0) {
      // Home / Body Parts tab
      this._partsScrollY = Math.min(
        this._maxPartsScroll,
        this._partsScrollY + this.lineHeight()
      );
      this.refresh();
    } else {
      // Normal cursor behavior for other tabs
      Window_Selectable.prototype.cursorDown.call(this, wrap);
    }
  };

  // Add scroll wheel support
  Window_BiologicSimulation.prototype.processWheel = function () {
    if (this.isCursorMovable()) {
      const threshold = 20;
      if (Input.wheelY >= threshold) {
        // Scroll down with mouse wheel
        this.cursorDown(false);
      } else if (Input.wheelY <= -threshold) {
        // Scroll up with mouse wheel
        this.cursorUp(false);
      }
    }
  };

  Window_BiologicSimulation.prototype.startBiologicSimulation = function () {
    var self = this;
    this._simulationInterval = setInterval(function () {
      self.updateBiologicActivity();
      self.refresh();
    }, 1000); // Update every second
  };

  Window_BiologicSimulation.prototype.stopBiologicSimulation = function () {
    if (this._simulationInterval) {
      clearInterval(this._simulationInterval);
      this._simulationInterval = null;
    }
  };
  Window_BiologicSimulation.prototype.updateBiologicActivity = function () {
    if (!this._actor || !this._actor._biologicData) return;

    var bio = this._actor._biologicData;
    // Needs live on the actor now (TimeDateSystem), not game variables 54/55.
    var hungerRate = this._actor.hunger ? this._actor.hunger() : 50; // 0-100, 0 = very hungry
    var sleepRate = this._actor.sleep ? this._actor.sleep() : 50; // 0-100, 0 = very sleepy

    // Update vital signs with natural fluctuation
    this.updateVitalSigns(bio, hungerRate, sleepRate);

    // Update hormones
    this.updateHormones(bio, hungerRate, sleepRate);

    // Update immune system activity
    this.updateImmuneSystem(bio, hungerRate, sleepRate);

    // Update brain activity
    this.updateBrainActivity(bio, hungerRate, sleepRate);

    // Update ley veins
    this.updateLeyVeinsActivity(bio);

    // Update cellular activity
    this.updateCellularActivity(bio, hungerRate, sleepRate);
    this.updatePregnancy();
  };

  Window_BiologicSimulation.prototype.updateVitalSigns = function (
    bio,
    hunger,
    sleep
  ) {
    var vitalMods = bio.personality.modifiers?.vitals || {};

    var baseHeart = 70 * (vitalMods.heartRate || 1.0);
    var baseTemp = 36.8; // Temperature is usually stable
    var baseBP = {
      systolic: 120 * (vitalMods.bloodPressure || 1.0),
      diastolic: 80 * (vitalMods.bloodPressure || 1.0),
    };

    // Hunger effects (0 = very hungry)
    var hungerMultiplier = (100 - hunger) / 100; // Higher when hungry
    baseHeart += hungerMultiplier * 15; // Heart rate increases when hungry
    baseTemp -= hungerMultiplier * 0.5; // Temperature drops when hungry

    // Sleep effects (0 = very sleepy)
    var sleepMultiplier = (100 - sleep) / 100; // Higher when tired
    baseHeart += sleepMultiplier * 20; // Heart rate increases when tired
    baseTemp += sleepMultiplier * 0.3; // Temperature rises when tired
    baseBP.systolic += sleepMultiplier * 15;

    // Natural fluctuation
    bio.vitalSigns.heartRate += (Math.random() - 0.5) * 4;
    bio.vitalSigns.heartRate = Math.max(
      40,
      Math.min(120, baseHeart + (Math.random() - 0.5) * 10)
    );

    bio.vitalSigns.bodyTemperature += (Math.random() - 0.5) * 0.1;
    bio.vitalSigns.bodyTemperature = Math.max(
      35.0,
      Math.min(38.5, baseTemp + (Math.random() - 0.5) * 0.5)
    );

    bio.vitalSigns.bloodPressure.systolic += (Math.random() - 0.5) * 2;
    bio.vitalSigns.bloodPressure.systolic = Math.max(
      90,
      Math.min(160, baseBP.systolic + (Math.random() - 0.5) * 15)
    );

    bio.vitalSigns.bloodPressure.diastolic += (Math.random() - 0.5) * 2;
    bio.vitalSigns.bloodPressure.diastolic = Math.max(
      60,
      Math.min(100, baseBP.diastolic + (Math.random() - 0.5) * 10)
    );

    bio.vitalSigns.oxygenSaturation += (Math.random() - 0.5) * 1;
    bio.vitalSigns.oxygenSaturation = Math.max(
      90,
      Math.min(100, bio.vitalSigns.oxygenSaturation)
    );

    // Update nutrients based on hunger
    if (hunger < 30) {
      // Very hungry
      bio.vitalSigns.nutrients.calories = Math.max(
        0,
        bio.vitalSigns.nutrients.calories - Math.random() * 5
      );
      bio.vitalSigns.nutrients.protein = Math.max(
        0,
        bio.vitalSigns.nutrients.protein - Math.random() * 2
      );
      bio.vitalSigns.nutrients.carbs = Math.max(
        0,
        bio.vitalSigns.nutrients.carbs - Math.random() * 3
      );
      bio.vitalSigns.nutrients.fats = Math.max(
        0,
        bio.vitalSigns.nutrients.fats - Math.random() * 1
      );
    }

    // Cortisol increases with hunger and sleep deprivation
    var baseCortisol = 15 * (vitalMods.cortisol || 1.0);
    var stressLevel = (100 - hunger + (100 - sleep)) / 2;
    bio.vitalSigns.cortisol = Math.max(
      5,
      Math.min(
        50,
        baseCortisol + (stressLevel / 100) * 20 + (Math.random() - 0.5) * 3
      )
    );
  };

  Window_BiologicSimulation.prototype.updateHormones = function (
    bio,
    hunger,
    sleep
  ) {
    var hormoneMods = bio.personality.modifiers?.hormones || {};

    // Hormones fluctuate based on circadian rhythm, hunger, and sleep
    // Growth hormone increases during sleep deprivation (body trying to compensate)
    if (sleep < 40) {
      bio.hormones.growth += Math.random() * 0.5;
    } else {
      bio.hormones.growth += (Math.random() - 0.5) * 0.2;
    }
    bio.hormones.growth = Math.max(0.5, Math.min(8, bio.hormones.growth));

    // Insulin fluctuates with hunger
    if (hunger < 50) {
      bio.hormones.insulin += Math.random() * 2; // Increases when hungry
    } else {
      bio.hormones.insulin += (Math.random() - 0.5) * 1;
    }
    bio.hormones.insulin = Math.max(2, Math.min(20, bio.hormones.insulin));

    // Adrenaline increases with stress (hunger/sleep deprivation)
    var stressLevel = (100 - hunger + (100 - sleep)) / 2;
    bio.hormones.adrenaline +=
      (stressLevel / 100) * 5 + (Math.random() - 0.5) * 10;
    var adrMod = hormoneMods.adrenaline || 1.0;
    bio.hormones.adrenaline = Math.max(
      10 * adrMod,
      Math.min(100 * adrMod, bio.hormones.adrenaline)
    );

    // Sex hormones fluctuate naturally
    bio.hormones.testosterone += (Math.random() - 0.5) * 20;
    bio.hormones.estrogen += (Math.random() - 0.5) * 15;
    bio.hormones.progesterone += (Math.random() - 0.5) * 1;

    // Keep within gender-appropriate ranges (modified by personality)
    var testMod = hormoneMods.testosterone || 1.0;
    var estMod = hormoneMods.estrogen || 1.0;

    // Held inside the range this BODY runs at rather than the one its gender
    // would imply: a character built androgynous stays androgynous, and one
    // built at their gender's own default is clamped exactly as before (the
    // endpoints of the scale are the two ranges this used to switch between).
    var balance = hormoneBalanceOf(this._actor);
    var testRange = hormoneRange("testosterone", balance);
    var estRange = hormoneRange("estrogen", balance);
    bio.hormones.testosterone = Math.max(
      testRange.min * testMod,
      Math.min(testRange.max * testMod, bio.hormones.testosterone)
    );
    bio.hormones.estrogen = Math.max(
      estRange.min * estMod,
      Math.min(estRange.max * estMod, bio.hormones.estrogen)
    );

    // An implanted gland is the body's actual endocrine output, so it is
    // written after the gender-appropriate ranges above rather than inside
    // them, and the autoinjector settles its daily dose while the panel runs.
    runEstrogenAutoinjector(this._actor);
    applyEndocrineImplants(this._actor, bio);

    bio.hormones.progesterone = Math.max(
      0.1,
      Math.min(25, bio.hormones.progesterone)
    );

    // Thyroid fluctuates slightly
    bio.hormones.thyroid += (Math.random() - 0.5) * 0.3;
    bio.hormones.thyroid = Math.max(0.5, Math.min(5.0, bio.hormones.thyroid));
  };
  Window_BiologicSimulation.prototype.updateBrainActivity = function (
    bio,
    hunger,
    sleep
  ) {
    if (!bio.brainActivity) {
      this.initializeBrainActivity(bio);
    }

    var brain = bio.brainActivity;
    var alertnessLevel = (hunger + sleep) / 200; // 0-1 scale

    // Update brain wave patterns
    brain.waves.alpha += (Math.random() - 0.5) * 5;
    brain.waves.beta += (Math.random() - 0.5) * 8;
    brain.waves.theta += (Math.random() - 0.5) * 3;
    brain.waves.delta += (Math.random() - 0.5) * 2;
    brain.waves.gamma += (Math.random() - 0.5) * 10;

    // Adjust based on sleep level
    if (sleep < 30) {
      // Very tired
      brain.waves.delta += 5; // Increase delta waves
      brain.waves.theta += 3;
      brain.waves.beta -= 5;
      brain.waves.gamma -= 3;
    } else if (sleep > 70) {
      // Well rested
      brain.waves.beta += 3;
      brain.waves.gamma += 2;
      brain.waves.alpha += 2;
    }

    // Keep waves in realistic ranges
    brain.waves.alpha = Math.max(0, Math.min(30, brain.waves.alpha));
    brain.waves.beta = Math.max(0, Math.min(40, brain.waves.beta));
    brain.waves.theta = Math.max(0, Math.min(20, brain.waves.theta));
    brain.waves.delta = Math.max(0, Math.min(15, brain.waves.delta));
    brain.waves.gamma = Math.max(0, Math.min(25, brain.waves.gamma));

    // Update brain regions activity
    for (var region in brain.regions) {
      var regionData = brain.regions[region];

      // Base activity changes
      regionData.activity += (Math.random() - 0.5) * 10;

      // Apply alertness effects
      if (alertnessLevel < 0.3) {
        // Low alertness
        regionData.activity *= 0.7;
      } else if (alertnessLevel > 0.8) {
        // High alertness
        regionData.activity *= 1.2;
      }

      // Keep activity in range
      regionData.activity = Math.max(10, Math.min(100, regionData.activity));

      // Update status based on activity
      // i18n-ignore-start: activity band ids, resolved at the render point
      if (regionData.activity > 80) {
        regionData.status = "Highly Active";
      } else if (regionData.activity > 60) {
        regionData.status = "Active";
      } else if (regionData.activity > 40) {
        regionData.status = "Moderate";
      } else if (regionData.activity > 20) {
        regionData.status = "Low Activity";
      } else {
        regionData.status = "Minimal";
      }
      // i18n-ignore-end

      // Update oxygen consumption based on activity
      regionData.oxygenConsumption =
        (regionData.activity / 100) * regionData.maxOxygen;

      // Update neurotransmitter levels with fluctuation
      for (var nt in regionData.neurotransmitters) {
        regionData.neurotransmitters[nt] += (Math.random() - 0.5) * 2;
        regionData.neurotransmitters[nt] = Math.max(
          0,
          Math.min(100, regionData.neurotransmitters[nt])
        );
      }
    }

    // Update overall brain stats
    var totalActivity = 0;
    var activeRegions = 0;

    for (var region in brain.regions) {
      totalActivity += brain.regions[region].activity;
      if (brain.regions[region].activity > 50) activeRegions++;
    }

    brain.overallActivity = totalActivity / Object.keys(brain.regions).length;
    brain.activeRegions = activeRegions;
    brain.totalRegions = Object.keys(brain.regions).length;

    // Update neuron activity
    brain.neurons.firing += Math.floor((Math.random() - 0.5) * 1000000);
    brain.neurons.firing = Math.max(
      50000000,
      Math.min(200000000, brain.neurons.firing)
    );

    brain.neurons.connections += Math.floor((Math.random() - 0.5) * 100000);
    brain.neurons.connections = Math.max(
      100000000000,
      Math.min(150000000000, brain.neurons.connections)
    );
  };

  Window_BiologicSimulation.prototype.initializeBrainActivity = function (bio) {
    // Deep copy the BrainRegions data to avoid modifying the global constant
    const brainRegions = getBrainRegions();
    if (!brainRegions) {
      console.error("BrainRegions data is not loaded!");
      return;
    }
    var regions = JSON.parse(JSON.stringify(brainRegions));

    // Apply personality modifiers
    var personality = bio.personality;
    if (personality && personality.modifiers?.brain) {
      var brainMods = personality.modifiers?.brain;
      for (var regionKey in regions) {
        if (regions.hasOwnProperty(regionKey) && brainMods[regionKey]) {
          var mod = brainMods[regionKey];
          var regionData = regions[regionKey];
          // Apply modifier and clamp
          regionData.activity = Math.max(
            10,
            Math.min(100, regionData.activity * mod)
          );
          // Set this modified value as the new 'normal' for resets
          regionData.normalActivity = regionData.activity;
        }
      }
    }

    bio.brainActivity = {
      overallActivity: 65 + Math.random() * 20,
      activeRegions: 0,
      totalRegions: 0,

      waves: {
        alpha: 8 + Math.random() * 5, // 8-13 Hz (relaxed awareness)
        beta: 15 + Math.random() * 15, // 13-30 Hz (active thinking)
        theta: 4 + Math.random() * 4, // 4-8 Hz (drowsy)
        delta: 1 + Math.random() * 3, // 0.5-4 Hz (deep sleep)
        gamma: 30 + Math.random() * 20, // 30-100 Hz (consciousness)
      },

      neurons: {
        total: 86000000000, // ~86 billion neurons
        firing: 100000000 + Math.floor(Math.random() * 50000000),
        connections: 125000000000, // ~125 trillion connections
        activeConnections: 0,
      },

      regions: regions, // Use the modified regions object
    };

    // Initialize oxygen consumption
    for (var region in bio.brainActivity.regions) {
      var regionData = bio.brainActivity.regions[region];
      regionData.oxygenConsumption =
        (regionData.activity / 100) * regionData.maxOxygen;
    }
  };

  Window_BiologicSimulation.prototype.updateLeyVeinsActivity = function (bio) {
    // Ley veins fluctuate with magical energy
    var mpRatio = this._actor.mp / this._actor.mmp;
    bio.leyVeins.flow =
      Math.floor(mpRatio * 100) + Math.floor((Math.random() - 0.5) * 10);
    bio.leyVeins.flow = Math.max(0, Math.min(150, bio.leyVeins.flow));

    // Meridians fluctuate slightly
    for (var meridian in bio.leyVeins.meridians) {
      var meridianData = bio.leyVeins.meridians[meridian];
      if (meridianData.status === "Normal") {
        meridianData.flow += (Math.random() - 0.5) * 5;
        meridianData.flow = Math.max(80, Math.min(120, meridianData.flow));

        if (meridianData.magicalActivity) {
          meridianData.magicalActivity += (Math.random() - 0.5) * 10;
          meridianData.magicalActivity = Math.max(
            90,
            Math.min(110, meridianData.magicalActivity)
          );
        }
      }
    }
  };
  Window_BiologicSimulation.prototype.updateCellularActivity = function (
    bio,
    hunger,
    sleep
  ) {
    if (!bio.cellularActivity) {
      bio.cellularActivity = {
        cellsDying: Math.floor(Math.random() * 100000) + 50000,
        cellsForming: Math.floor(Math.random() * 100000) + 60000,
        mitosisRate: Math.random() * 100,
        apoptosisRate: Math.random() * 100,
        totalCells: 37200000000000, // Approximate human cell count
      };
    }

    var activity = bio.cellularActivity;
    var healthMultiplier = (hunger + sleep) / 200; // 0-1 scale

    // Cells forming (mitosis)
    var baseFormation = 100000 * healthMultiplier;
    activity.cellsForming = Math.floor(
      baseFormation * (0.8 + Math.random() * 0.4)
    );

    // Cells dying (apoptosis)
    var baseDeath = 80000 * (2 - healthMultiplier); // Dies more when unhealthy
    activity.cellsDying = Math.floor(baseDeath * (0.8 + Math.random() * 0.4));

    // Update rates
    activity.mitosisRate =
      (activity.cellsForming / activity.totalCells) * 100000000;
    activity.apoptosisRate =
      (activity.cellsDying / activity.totalCells) * 100000000;

    // Net change in cell count
    var netChange = activity.cellsForming - activity.cellsDying;
    activity.totalCells = Math.max(
      30000000000000,
      activity.totalCells + netChange
    );
  };

  Window_BiologicSimulation.prototype.updateImmuneSystem = function (
    bio,
    hunger,
    sleep
  ) {
    // Immune system weakens with poor nutrition and sleep
    var immuneEfficiency = (hunger + sleep) / 200; // 0-1 scale

    // White blood cells fluctuate
    bio.immuneSystem.whiteBloodCells += (Math.random() - 0.5) * 500;
    var baseWBC = 7500 * immuneEfficiency;
    bio.immuneSystem.whiteBloodCells = Math.max(
      2000,
      Math.min(15000, baseWBC + (Math.random() - 0.5) * 2000)
    );

    // Antibodies fluctuate
    bio.immuneSystem.antibodies += (Math.random() - 0.5) * 50;
    var baseAntibodies = 1200 * immuneEfficiency;
    bio.immuneSystem.antibodies = Math.max(
      400,
      Math.min(2000, baseAntibodies + (Math.random() - 0.5) * 200)
    );

    // Cellular death and regeneration
    if (!bio.cellularActivity) {
      bio.cellularActivity = {
        cellsDying: 0,
        cellsForming: 0,
        mitosisRate: 0,
        apoptosisRate: 0,
        totalCells: 37200000000000,
      };
    }

    // Update cellular activity
    this.updateCellularActivity(bio, hunger, sleep);

    // Gradually reduce persistent infections over time using game date
    var reductionRate = immuneEfficiency * 500; // Reduced based on immune efficiency
    var currentGameDate = convertGameDateToTimestamp(getGameDateFromVariable());

    // Process bacteria
    for (var i = bio.immuneSystem.bacteria.length - 1; i >= 0; i--) {
      var bacterium = bio.immuneSystem.bacteria[i];
      if (!bacterium.temporary && bacterium.infectionStartDate !== undefined) {
        // Calculate days elapsed since infection started
        var daysInfected = Math.max(0, currentGameDate - bacterium.infectionStartDate);

        // Gradually reduce persistent infection count based on immune efficiency and days infected
        var dailyReduction = reductionRate / (daysInfected + 1); // Earlier infections reduce faster with good immunity
        bacterium.count = Math.max(0, bacterium.count - dailyReduction);

        // Remove infection if count reaches 0 or after 30 days of infection
        if (bacterium.count <= 0 || daysInfected > 30) {
          bio.immuneSystem.bacteria.splice(i, 1);
        }
      }
    }

    // Process viruses
    for (var j = bio.immuneSystem.viruses.length - 1; j >= 0; j--) {
      var virus = bio.immuneSystem.viruses[j];
      if (!virus.temporary && virus.infectionStartDate !== undefined) {
        // Calculate days elapsed since infection started
        var daysInfected = Math.max(0, currentGameDate - virus.infectionStartDate);

        // Gradually reduce persistent infection count based on immune efficiency and days infected
        var dailyReduction = reductionRate / (daysInfected + 1); // Earlier infections reduce faster with good immunity
        virus.count = Math.max(0, virus.count - dailyReduction);

        // Remove infection if count reaches 0 or after 14 days of infection (viruses clear faster)
        if (virus.count <= 0 || daysInfected > 14) {
          bio.immuneSystem.viruses.splice(j, 1);
        }
      }
    }
  };

  Window_BiologicSimulation.prototype.initializeBiologicData = function () {
    if (!this._actor._biologicData) {
      this._actor._biologicData = {};
      // Determine personality first, as it affects baselines
      this._actor._biologicData.personality = this.determinePersonality(
        this._actor.name()
      );
      var personality = this._actor._biologicData.personality;
      var vitalMods = personality.modifiers?.vitals || {};
      var hormoneMods = personality.modifiers?.hormones || {};
      // Initialize vital signs
      var baseHP = this._actor.mhp;
      var baseMP = this._actor.mmp;

      this._actor._biologicData.vitalSigns = {
        heartRate: 60 + Math.floor(Math.random() * 40), // 60-100 BPM
        bloodPressure: {
          systolic: 110 + Math.floor(Math.random() * 30), // 110-140
          diastolic: 70 + Math.floor(Math.random() * 20), // 70-90
        },
        bodyTemperature: 36.0 + Math.random() * 1.5, // 36.0-37.5°C
        oxygenSaturation: 95 + Math.floor(Math.random() * 5), // 95-100%
        nutrients: {
          calories: 1800 + Math.floor(Math.random() * 400), // 1800-2200
          protein: 50 + Math.floor(Math.random() * 30), // 50-80g
          carbs: 200 + Math.floor(Math.random() * 100), // 200-300g
          fats: 60 + Math.floor(Math.random() * 40), // 60-100g
          water: 2000 + Math.floor(Math.random() * 500), // 2000-2500ml
        },
        cortisol: 10 + Math.floor(Math.random() * 15), // 10-25 μg/dL
      };

      // Initialize hormones from the balance this body was built at (which
      // falls back to its gender's own default when nobody ever said).
      var balance = hormoneBalanceOf(this._actor);
      this._actor._biologicData.hormones = {
        testosterone: this.getInitialTestosterone(balance),
        estrogen: this.getInitialEstrogen(balance),
        progesterone: this.getInitialProgesterone(balance),
        cortisol: 10 + Math.floor(Math.random() * 15),
        adrenaline: 20 + Math.floor(Math.random() * 30),
        insulin: 5 + Math.floor(Math.random() * 10),
        growth: 1 + Math.random() * 4,
        thyroid: 1.0 + Math.random() * 3.0,
      };

      // Initialize immune system
      this._actor._biologicData.immuneSystem = {
        whiteBloodCells: 4000 + Math.floor(Math.random() * 7000), // 4000-11000/μL
        antibodies: 700 + Math.floor(Math.random() * 900), // 700-1600 mg/dL
        viruses: [],
        bacteria: [],
        infections: this.checkForInfections(),
      };

      // Initialize ley veins (magical system)
      this._actor._biologicData.leyVeins = {
        // Based on current MP. mmp is 0 for some creature archetypes, which
        // used to seed the whole ley panel with NaN.
        flow: this._actor.mmp > 0 ? Math.floor((this._actor.mp / this._actor.mmp) * 100) : 0,
        meridians: {
          head: { status: "Normal", flow: 100, blockage: 0 },
          heart: { status: "Normal", flow: 100, blockage: 0 },
          lungs: { status: "Normal", flow: 100, blockage: 0 },
          liver: { status: "Normal", flow: 100, blockage: 0 },
          kidneys: { status: "Normal", flow: 100, blockage: 0 },
          arms: { status: "Normal", flow: 100, blockage: 0 },
          legs: { status: "Normal", flow: 100, blockage: 0 },
        },
      };

      // Initialize brain activity
      this.initializeBrainActivity(this._actor._biologicData);
      this.initializeUterusData();
      // Blood type is chosen once (Detailed character creation) or rolled
      // once from the name, then stuck to the actor from then on.
      window.BloodTypeService.forActor(this._actor);

      this.updateLeyVeinsFromDamage();

    }
  };
  Window_BiologicSimulation.prototype.initializeUterusData = function () {
    if (!this._actor._uterusData) {
      var pregnancyType = getReproductionType(this._actor) || 0;
      // If male (pregnancyType === 0), initialize testes data instead
      if (pregnancyType === 0) {
        if (!this._actor.testesData) {
          var bio = this._actor._biologicData;
          this._actor.testesData = {
            spermCount: 200000000 + Math.floor(Math.random() * 300000000),
            spermMotility: 50 + Math.random() * 30,
            spermMorphology: 4 + Math.random() * 10,
            testosteroneProduction: bio.hormones.testosterone,
            fertilityRate: 0,
            dailySpermProduction: 0,
            lastUpdate: convertGameDateToTimestamp(getGameDateFromVariable())
          };
        }
        return; // Exit early for male
      }
      this._actor._uterusData = {
        pregnancyType: pregnancyType, // 0=testicles, 1=uterus, 2=oviparous, 3=plant, 4=mitosis
        isPregnant: false,
        conceptionDate: null,
        dueDate: null,
        gestationalAge: 0,
        fetus: null,
        // Uterus-specific data
        ovulationCycle: {
          dayInCycle: Math.floor(Math.random() * 28) + 1,
          cycleLength: 28,
          ovulationDay: 14,
          fertile: false,
        },
        eggCount: 300000 + Math.floor(Math.random() * 200000),
        // Oviparous-specific data
        eggDevelopment: 0, // 0-100%
        eggsToLay: 0,
        // Plant-specific data
        seedDevelopment: 0, // 0-100%
        seedsReady: 0,
        // Mitosis-specific data
        mitosisDevelopment: 0, // 0-100%
        lastStatusCheck: convertGameDateToTimestamp(getGameDateFromVariable()),
        lastCycleUpdate: convertGameDateToTimestamp(getGameDateFromVariable()),
        birthReady: false,
      };
    }

    // Always sync with the actor's reproduction variable (87/115/116 by party index)
    this._actor._uterusData.pregnancyType = getReproductionType(this._actor) || 0;
  };
  Window_BiologicSimulation.prototype.updatePregnancy = function () {
    if (!this._actor._uterusData) return;

    var uterus = this._actor._uterusData;
    var pregnancyType = getReproductionType(this._actor) || 0;

    if (!uterus.isPregnant) {
      // Update ovulation cycle for uterus type when not pregnant
      if (pregnancyType === 1) {
        this.updateOvulationCycle();
      }
      return;
    }

    if (uterus.conceptionDate) {
      var now = convertGameDateToTimestamp(getGameDateFromVariable());
      var elapsed = now - uterus.conceptionDate;  // elapsed is in days
      uterus.gestationalAge = Math.floor(elapsed);
      // One term for every kind of pregnancy, taken from the actor's archetype.
      var term = getPregnancyDuration(this._actor);

      switch (pregnancyType) {
        case 1: // Uterus
          if (uterus.gestationalAge >= term) {
            this.giveBirth();
            return;
          }
          this.updateFetusData();
          this.applyPregnancyEffects();
          break;

        case 2: // Oviparous
          uterus.eggDevelopment = Math.min(100, (elapsed / term) * 100);
          if (uterus.eggDevelopment >= 100) {
            this.layEggs();
            return;
          }
          noteDevelopment(this._actor, uterus, 'egg', uterus.eggDevelopment);
          this.applyOviparousEffects();
          break;

        case 3: // Plant seeds
          uterus.seedDevelopment = Math.min(100, (elapsed / term) * 100);
          if (uterus.seedDevelopment >= 100) {
            this.produceSeed();
            return;
          }
          noteDevelopment(this._actor, uterus, 'seed', uterus.seedDevelopment);
          this.applyPlantEffects();
          break;

        case 4: // Mitosis
          uterus.mitosisDevelopment = Math.min(100, (elapsed / term) * 100);
          if (uterus.mitosisDevelopment >= 100) {
            this.completeMitosis();
            return;
          }
          noteDevelopment(this._actor, uterus, 'mitosis', uterus.mitosisDevelopment);
          this.applyMitosisEffects();
          break;
      }

      // Random status effects (check every 1 day in game time)
      if (now - uterus.lastStatusCheck > 1) {
        this.applyPregnancyStatuses();
        uterus.lastStatusCheck = now;
      }
    }
  };

  // ==========================================================================
  // Pregnancy notices
  // ==========================================================================
  // A pregnancy is the one part of the biologic simulation that moves while
  // nobody is looking at it, so every step it takes is announced the same way
  // everything else transient is: one parchment toast, keyed per actor so a
  // catch-up pass over several days never stacks the same notice twice.
  function pregToast(actor, text, opts) {
    if (!text || !window.ParchmentToast || !actor) return;
    var o = opts || {};
    try {
      window.ParchmentToast.show(text, {
        severity: o.severity || 'info',
        duration: o.duration || 220,
        icon: o.icon,
        key: 'pregnancy:' + actor.actorId() + ':' + (o.key || 'update'), // i18n-ignore: toast dedupe key
      });
    } catch (e) { /* toasts are optional */ }
  }

  // Egg, seed and mitosis have no fetal bands to cross, so their progress is
  // announced at the quarters instead. The last quarter announced is kept on
  // the record, so a jump from 10% to 80% reports once rather than three times.
  function noteDevelopment(actor, uterus, kind, percent) {
    var quarter = Math.min(3, Math.floor((Number(percent) || 0) / 25));
    if (quarter <= 0) return;
    var seen = uterus.notedQuarter || 0;
    if (quarter <= seen) return;
    uterus.notedQuarter = quarter;
    pregToast(actor, T('Biologic.toast.' + kind + 'Progress', {
      actor: actor.name(), percent: quarter * 25,
    }), { key: kind + 'Progress' });
  }

  // The record keeps the band id; the prose is re-resolved on every update,
  // so a language change is picked up without touching the save.
  function applyFetusStage(fetus, stageId, actor) {
    var moved = fetus.stageId !== stageId;
    fetus.stageId = stageId;
    fetus.stage = T('Biologic.fetusStage.' + stageId + '.stage');
    fetus.description = T('Biologic.fetusStage.' + stageId + '.description');
    // Each band the fetus crosses is worth telling the party about once.
    if (moved && actor) {
      pregToast(actor, T('Biologic.toast.fetusStage', {
        actor: actor.name(), stage: fetus.stage, week: fetus.week,
      }), { key: 'stage:' + stageId });
    }
    fetus.developments = T.list('Biologic.fetusStage.' + stageId + '.developments');
  }

  Window_BiologicSimulation.prototype.updateFetusData = function () {
    var age = toHumanScaleAge(this._actor, this._actor._uterusData.gestationalAge);
    var previous = this._actor._uterusData.fetus;
    var actor = this._actor;
    var fetus = {
      stageId: previous ? previous.stageId : null,
      stage: "",
      week: Math.floor(age / 7),
      description: "",
      size: "",
      weight: "",
      developments: [],
    };

    if (age < 14) {
      // Weeks 0-2
      applyFetusStage(fetus, "implantation", actor);
      fetus.size = T('Biologic.fetusStage.implantation.size');
      fetus.weight = T('Biologic.fetusStage.implantation.weight');
    } else if (age < 56) {
      // Weeks 2-8
      applyFetusStage(fetus, "embryonic", actor);
      var sizeProgress = ((age - 14) / 42) * 15;
      fetus.size = (0.5 + sizeProgress).toFixed(1) + " mm";
      fetus.weight = "< 1 g";
    } else if (age < 84) {
      // Weeks 8-12
      applyFetusStage(fetus, "earlyFetal", actor);
      var sizeProgress = ((age - 56) / 28) * 45;
      fetus.size = (16 + sizeProgress).toFixed(1) + " mm";
      var weightProgress = ((age - 56) / 28) * 14;
      fetus.weight = weightProgress.toFixed(1) + " g";
    } else if (age < 168) {
      // Weeks 12-24
      applyFetusStage(fetus, "midFetal", actor);
      var sizeProgress = ((age - 84) / 84) * 239;
      fetus.size = (61 + sizeProgress).toFixed(0) + " mm";
      var weightProgress = ((age - 84) / 84) * 586;
      fetus.weight = (14 + weightProgress).toFixed(0) + " g";
    } else {
      // Weeks 24-38+
      applyFetusStage(fetus, "lateFetal", actor);
      var sizeProgress = ((age - 168) / 102) * 200;
      fetus.size = (300 + sizeProgress).toFixed(0) + " mm";
      var weightProgress = ((age - 168) / 102) * 2700;
      fetus.weight = (600 + weightProgress).toFixed(0) + " g";
    }

    this._actor._uterusData.fetus = fetus;
  };

  Window_BiologicSimulation.prototype.applyPregnancyEffects = function () {
    if (!this._actor._biologicData) return;

    var bio = this._actor._biologicData;
    var age = toHumanScaleAge(this._actor, this._actor._uterusData.gestationalAge);
    var trimester = age < 84 ? 1 : age < 196 ? 2 : 3;

    // Heart rate increases during pregnancy
    bio.vitalSigns.heartRate += 10 + trimester * 5;

    // Blood pressure changes
    if (trimester === 1 || trimester === 2) {
      bio.vitalSigns.bloodPressure.systolic -= 5;
    } else {
      bio.vitalSigns.bloodPressure.systolic += 10;
    }

    // Slightly elevated body temperature
    bio.vitalSigns.bodyTemperature += 0.3;

    // Dramatic hormone changes
    bio.hormones.progesterone = 20 + trimester * 5;
    bio.hormones.estrogen = 300 + (age / getHumanTerm()) * 300;

    // Increased caloric needs
    bio.vitalSigns.nutrients.calories -= 5 * trimester;
    bio.vitalSigns.nutrients.protein -= 2 * trimester;
  };
  Window_BiologicSimulation.prototype.applyOviparousEffects = function () {
    if (!this._actor._biologicData) return;

    var bio = this._actor._biologicData;
    var development = this._actor._uterusData.eggDevelopment;

    // Increased metabolic rate
    bio.vitalSigns.heartRate += 5 + (development / 100) * 10;
    bio.vitalSigns.bodyTemperature += 0.5;

    // Increased calcium needs for shell formation
    bio.vitalSigns.nutrients.protein -= 3;
    bio.vitalSigns.nutrients.calories -= 10;
  };

  Window_BiologicSimulation.prototype.applyPlantEffects = function () {
    if (!this._actor._biologicData) return;

    var bio = this._actor._biologicData;
    var development = this._actor._uterusData.seedDevelopment;

    // Increased photosynthesis-like activity
    bio.vitalSigns.oxygenSaturation += 2;
    bio.vitalSigns.bodyTemperature -= 0.3; // Cooler

    // Need more water and nutrients
    bio.vitalSigns.nutrients.water -= 5;
    bio.vitalSigns.nutrients.carbs -= 2;
  };

  Window_BiologicSimulation.prototype.applyMitosisEffects = function () {
    if (!this._actor._biologicData) return;

    var bio = this._actor._biologicData;
    var development = this._actor._uterusData.mitosisDevelopment;

    // Extreme cellular activity
    bio.vitalSigns.heartRate += 15 + (development / 100) * 25;
    bio.vitalSigns.bodyTemperature += 1.0 + (development / 100) * 0.5;

    if (bio.cellularActivity) {
      bio.cellularActivity.cellsForming *= 2.0 + (development / 100);
      bio.cellularActivity.mitosisRate *= 3.0;
    }

    // High energy demands
    bio.vitalSigns.nutrients.calories -= 15;
    bio.vitalSigns.nutrients.protein -= 5;
    bio.vitalSigns.nutrients.carbs -= 8;
  };
  Window_BiologicSimulation.prototype.applyPregnancyStatuses = function () {
    var age = toHumanScaleAge(this._actor, this._actor._uterusData.gestationalAge);
    var trimester = age < 84 ? 1 : age < 196 ? 2 : 3;

    // First trimester: 40% chance of nausea
    if (trimester === 1 && Math.random() < 0.4) {
      if (!this._actor.isStateAffected(41)) {
        this._actor.addState(41); // Nausea
      }
    }

    // Random hot/cold flashes (20% chance)
    if (Math.random() < 0.2) {
      if (Math.random() < 0.5) {
        if (!this._actor.isStateAffected(25)) {
          this._actor.addState(25); // Hot
        }
      } else {
        if (!this._actor.isStateAffected(26)) {
          this._actor.addState(26); // Cold
        }
      }
    }
  };

  Window_BiologicSimulation.prototype.updateOvulationCycle = function () {
    var now = convertGameDateToTimestamp(getGameDateFromVariable());
    var uterus = this._actor._uterusData;
    var ovulation = uterus.ovulationCycle;

    // Progress cycle by one day every game day
    if (now - uterus.lastCycleUpdate > 1) {
      var daysPassed = Math.floor(now - uterus.lastCycleUpdate);
      for (var i = 0; i < daysPassed; i++) {
        ovulation.dayInCycle = (ovulation.dayInCycle % ovulation.cycleLength) + 1;

        // Decrease egg count with each cycle
        if (ovulation.dayInCycle === 1) {
          uterus.eggCount = Math.max(0, uterus.eggCount - 1);
        }
      }
      uterus.lastCycleUpdate = now;
    }

    // Determine fertile window (days 12-16)
    ovulation.fertile =
      ovulation.dayInCycle >= 12 && ovulation.dayInCycle <= 16;
  };

  // Whatever a pregnancy produces is a person the party now travels with: it is
  // registered as a child in the followers menu (PetFollowerSystem.js), with a
  // face of its own out of the Skab pixel pack and a generated name. Mitosis is
  // the exception and goes through announceMitosis below.
  function registerOffspring(actor) {
    if (!actor || !window.PetSystem || !window.PetSystem.birthChild) return null;
    var child = window.PetSystem.birthChild(actor);
    if (!child) return null;
    window.skipLocalization = true;
    $gameMessage.add(T('PetFollower.born', { name: child.name }));
    window.skipLocalization = false;
    return child;
  }

  Window_BiologicSimulation.prototype.giveBirth = function () {
    var uterus = this._actor._uterusData;
    uterus.isPregnant = false;
    uterus.conceptionDate = null;
    uterus.dueDate = null;
    uterus.gestationalAge = 0;
    uterus.fetus = null;
    uterus.birthReady = true;
    uterus.notedQuarter = 0;

    pregToast(this._actor, T('Biologic.toast.birth', { actor: this._actor.name() }),
      { severity: 'good', duration: 300, key: 'birth' });
    registerOffspring(this._actor);
  };
  Window_BiologicSimulation.prototype.layEggs = function () {
    var uterus = this._actor._uterusData;
    uterus.eggsToLay = Math.floor(Math.random() * 4) + 1; // 1-4 eggs
    uterus.isPregnant = false;
    uterus.conceptionDate = null;
    uterus.dueDate = null;
    uterus.gestationalAge = 0;
    uterus.eggDevelopment = 0;
    uterus.birthReady = true;

    uterus.notedQuarter = 0;
    pregToast(this._actor, T.n('Biologic.eggsReadyToLay', uterus.eggsToLay),
      { severity: 'good', duration: 300, key: 'eggs' });

    // A clutch is a clutch: every egg is one of the family.
    for (var i = 0; i < uterus.eggsToLay; i++) {
      registerOffspring(this._actor);
    }
  };

  Window_BiologicSimulation.prototype.produceSeed = function () {
    var uterus = this._actor._uterusData;
    uterus.seedsReady += 1;

    // Don't stop pregnancy, just reset the timer to produce another seed
    uterus.conceptionDate = convertGameDateToTimestamp(getGameDateFromVariable());
    // The next seed takes another full term of whatever this actor is.
    uterus.dueDate = uterus.conceptionDate + getPregnancyDuration(this._actor);
    uterus.gestationalAge = 0;
    uterus.seedDevelopment = 0;
    // Keep isPregnant = true so it continues producing

    uterus.notedQuarter = 0;
    pregToast(this._actor, T('Biologic.seedProduced', { count: uterus.seedsReady }),
      { severity: 'good', duration: 300, key: 'seed' });
  };

  Window_BiologicSimulation.prototype.completeMitosis = function () {
    var uterus = this._actor._uterusData;
    uterus.isPregnant = false;
    uterus.conceptionDate = null;
    uterus.dueDate = null;
    uterus.gestationalAge = 0;
    uterus.mitosisDevelopment = 0;
    uterus.birthReady = true;

    uterus.notedQuarter = 0;
    pregToast(this._actor, T('Biologic.mitosisCompleteAPerfectCloneHasBeenCreated'),
      { severity: 'good', duration: 300, key: 'mitosis' });

    // A copy of a traveller is a traveller: it takes a place in the party while
    // there is one free, and only falls back to walking behind when the party is
    // full. Either way it is named after the original and numbered.
    announceMitosis(this._actor);
  };

  function announceMitosis(actor) {
    if (!actor || !window.PetSystem || !window.PetSystem.mitosisSplit) return null;
    var split = window.PetSystem.mitosisSplit(actor);
    if (!split) return null;
    window.skipLocalization = true;
    $gameMessage.add(
      T(split.joined ? 'PetFollower.cloneJoined' : 'PetFollower.cloneFollows',
        { parent: actor.name(), name: split.name })
    );
    window.skipLocalization = false;
    return split;
  }
  // The three sex hormones a body is born with, rolled at the point on the
  // androgenic/oestrogenic scale it was BUILT at rather than switched on its
  // gender label. Balance 85 rolls exactly what "male" used to roll, 15 what
  // "female" did and 50 what "non-binary" did, so nothing about an ordinary
  // character changed.
  Window_BiologicSimulation.prototype.getInitialTestosterone = function (balance) {
    return Math.floor(initialHormone("testosterone", balance)); // ng/dL
  };

  Window_BiologicSimulation.prototype.getInitialEstrogen = function (balance) {
    return Math.floor(initialHormone("estrogen", balance)); // pg/mL
  };

  Window_BiologicSimulation.prototype.getInitialProgesterone = function (balance) {
    return initialHormone("progesterone", balance); // ng/mL
  };

  Window_BiologicSimulation.prototype.checkForInfections = function () {
    var infections = [];

    // Check damaged body parts for potential infections
    if (this._actor && this._actor._bodyParts) {
      var conMod = this._actor.conMod ?? Math.floor(((this._actor.def || 10) - 10) / 2);
      for (var partKey in this._actor._bodyParts) {
        var part = this._actor._bodyParts[partKey];
        if (part.damaged) {
          // CON Fortitude save against wound infection (DC 13)
          var d20 = Math.floor(Math.random() * 20) + 1;
          var fortitudeSave = (d20 === 20) || (d20 !== 1 && (d20 + conMod >= 13));

          if (!fortitudeSave) {
            infections.push({
              location: part.name,
              type: Math.random() < 0.7 ? T('Biologic.bacterial') : T('Biologic.viral'),
              severity: Math.floor(Math.random() * 3) + 1, // 1-3
            });
          }
        }
      }
    }

    return infections;
  };

  Window_BiologicSimulation.prototype.updateLeyVeinsFromDamage = function () {
    if (!this._actor._bodyParts || !this._actor._biologicData) return;

    var leyVeins = this._actor._biologicData.leyVeins;
    var mpRatio = this._actor.mmp > 0 ? this._actor.mp / this._actor.mmp : 0;
    var overallFlow = Math.floor(mpRatio * 100);
    leyVeins.flow = overallFlow;

    // Rebuild meridians from actual body parts, distributing mana flow per part.
    // Broken parts (damaged=true) receive 0 flow; their share is redistributed
    // to healthy parts. This is purely cosmetic ,  actual MP is unchanged.
    var bodyParts = this._actor._bodyParts;
    var newMeridians = {};

    var numParts = Object.keys(bodyParts).length;
    var healthyCount = 0;
    for (var k in bodyParts) {
      if (!bodyParts[k].damaged) healthyCount++;
    }

    // Per-part base flow if all parts were healthy (equal share of total)
    var basePerPart = numParts > 0 ? overallFlow : 0;
    // Redistributed flow for each healthy part (broken parts' shares funnelled here)
    var healthyFlow = healthyCount > 0
      ? Math.min(150, Math.round(overallFlow * numParts / healthyCount))
      : 0;

    for (var partKey in bodyParts) {
      var part = bodyParts[partKey];
      var flow, status;

      if (part.damaged) {
        flow = 0;
        status = T('Biologic.blocked');
      } else {
        flow = healthyFlow;
        status = T('Biologic.normal');
      }

      // Preserve magicalActivity from previous tick if it exists
      var prev = leyVeins.meridians[partKey];
      var magicalActivity = prev
        ? prev.magicalActivity
        : 85 + Math.floor(Math.random() * 30);

      newMeridians[partKey] = {
        name: part.name,
        status: status,
        flow: flow,
        // blockage kept for reference: % of parts that are broken
        blockage: numParts > 0 ? Math.round((numParts - healthyCount) / numParts * 100) : 0,
        magicalActivity: magicalActivity,
      };
    }

    leyVeins.meridians = newMeridians;
  };

  Window_BiologicSimulation.prototype.updateGenderFromHormones = function () {
    if (!this._actor._biologicData) return;
    // A body somebody deliberately built keeps the identity they gave it. The
    // blood of a character made androgynous on purpose says nothing this has
    // any business acting on, and re-labelling them on the first panel they
    // opened would undo the answer the creation slider was there to ask for.
    if (hormoneBalanceIsSet(this._actor)) return;

    var hormones = this._actor._biologicData.hormones;
    var testosterone = hormones.testosterone;
    var estrogen = hormones.estrogen;

    // Normalize hormone levels to comparable scales
    var testosteroneNorm = testosterone / 1000; // Max ~1000 ng/dL
    var estrogenNorm = estrogen / 400; // Max ~400 pg/mL

    var difference = Math.abs(testosteroneNorm - estrogenNorm);
    var average = (testosteroneNorm + estrogenNorm) / 2;
    var tolerance = average * 0.1; // 10% tolerance

    var currentGender = readGender(this._actor);
    var newGender = currentGender;

    if (difference <= tolerance) {
      // Balanced hormones = non-binary
      newGender = 2;
    } else if (testosteroneNorm > estrogenNorm) {
      // Higher testosterone = male
      newGender = 0;
    } else {
      // Higher estrogen = female
      newGender = 1;
    }

    if (newGender !== currentGender) {
      writeGender(this._actor, newGender);
      // Hormones drift while the player is reading a panel, so this reports
      // through the shared notification popup rather than interrupting with a
      // message box, and it names the direction the body moved in rather than
      // the label it landed on: a shift toward masculinity or femininity.
      var MASCULINITY = { 0: 1, 2: 0, 1: -1 }; // male / non-binary / female
      var from = MASCULINITY[currentGender];
      var to = MASCULINITY[newGender];
      var towardMasculine = (from !== undefined && to !== undefined && to !== from)
        ? to > from
        : testosteroneNorm > estrogenNorm;
      var direction = towardMasculine ? T('Biologic.masculinity') : T('Biologic.femininity');
      if (window.ParchmentToast) {
        window.ParchmentToast.show(
          T('Biologic.genderShifted', { direction: direction }),
          { severity: "warning", duration: 240 }
        );
      }
    }
  };

  Window_BiologicSimulation.prototype.maxItems = function () {
    return this._categories.length;
  };

  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawBodyPartsGrid = function (startY) {
    return;
    var actor = this._actor;
    if (!actor) return;
    var useTranslation = ConfigManager.language === "it";
    var lineHeight = this.lineHeight();
    var contentWidth = this.contents.width - 12;
    var contentHeight = this.contents.height - startY - lineHeight * 2;

    if (!actor._bodyParts) {
      if (typeof window.initializeBodyParts === 'function') {
        window.initializeBodyParts(actor);
      } else {
        this.drawText(T('Biologic.noData'), 6, startY, contentWidth);
        return;
      }
    }

    var bodyPartsArray = [];
    for (var partKey in actor._bodyParts) {
      if (actor._bodyParts[partKey]) bodyPartsArray.push(actor._bodyParts[partKey]);
    }

    if (bodyPartsArray.length === 0) {
      this.drawText(T('Biologic.noData'), 6, startY, contentWidth);
      return;
    }

    var cols = 3;
    var gap = 6;
    var cellW = Math.floor((contentWidth - gap * (cols - 1)) / cols);
    var gaugeH = 5;
    var cellH = lineHeight + gaugeH + 6;
    var startX = 6;
    var visibleAreaTop = startY;
    var visibleAreaBottom = startY + contentHeight;

    // Calculate total content height for scrolling
    var totalRows = Math.ceil(bodyPartsArray.length / cols);
    var totalContentH = totalRows * (cellH + gap);
    this._maxPartsScroll = Math.max(0, totalContentH - contentHeight);

    for (var i = 0; i < bodyPartsArray.length; i++) {
      var part = bodyPartsArray[i];
      var col = i % cols;
      var row = Math.floor(i / cols);
      var cx = startX + col * (cellW + gap);
      var cy = startY + row * (cellH + gap) - this._partsScrollY;

      if (cy + cellH < visibleAreaTop) continue;
      if (cy > visibleAreaBottom) break;

      var rate = (part.maxHp > 0 && !part.damaged) ? part.currentHp / part.maxHp : 0;
      var barY = cy + cellH - gaugeH - 1;

      // Cell background
      this.contents.fillRect(cx, cy, cellW, cellH, ColorManager.gaugeBackColor());

      // HP bar
      var fillW = Math.floor(cellW * rate);
      if (fillW > 0) {
        this.contents.gradientFillRect(cx, barY, fillW, gaugeH, ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2());
      }

      // Cell border
      this.contents.strokeRect(cx, cy, cellW, cellH, ColorManager.outlineColor());

      // Part name
      this.contents.fontSize = 13;
      if (part.damaged) {
        this.changeTextColor(ColorManager.deathColor());
        this.drawText(part.name, cx + 3, cy + 1, cellW - 6);
        var tw = this.textWidth(part.name);
        var strikeY = cy + 1 + Math.floor(lineHeight / 2);
        this.contents.fillRect(cx + 3, strikeY, Math.min(tw, cellW - 6), 2, ColorManager.deathColor());
      } else {
        this.resetTextColor();
        this.drawText(part.name, cx + 3, cy + 1, cellW - 6);
      }
    }

    // Draw scroll indicator if needed
    if (this._maxPartsScroll > 0) {
      var scrollPercent = this._partsScrollY / this._maxPartsScroll;
      var indicatorY = visibleAreaTop + contentHeight * scrollPercent;
      var indicatorHeight = Math.max(
        10,
        contentHeight * (contentHeight / (contentHeight + this._maxPartsScroll))
      );
      this.contents.fillRect(
        this.contents.width - 8,
        indicatorY,
        4,
        indicatorHeight,
        this.textColor(7)
      );
    }

    this.resetFontSettings();
  };
  // i18n-ignore-end

  Window_BiologicSimulation.prototype.refresh = function () {
    if (this.contents) this.contents.clear();

    if (!this._actor) return;

    this.applyStateReactions();
    if (!brainI18nData) {
      loadBrainI18nData().then(() => {
        if (this._category === 5) this.refresh();
      });
    }

    this.initializeBiologicData();
    // Before the gender read below, not after: an implanted gland decides the
    // blood, and settling it here keeps the panel from reporting a shift on
    // its first frame that the next tick immediately reverses.
    runEstrogenAutoinjector(this._actor);
    applyEndocrineImplants(this._actor, this._actor._biologicData);
    this.updateLeyVeinsFromDamage();
    // Only the player (actor 1) has hormone-driven gender changes; running this
    // every tick for companions would flip their gender variable each refresh.
    if (this._actor.actorId && this._actor.actorId() === 1) {
      this.updateGenderFromHormones();
    }

    if (SceneManager._scene && typeof SceneManager._scene.refreshUIBiologic === 'function') {
      SceneManager._scene.refreshUIBiologic();
    }
  };
  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawVitalSigns = function (startY) {
    return;
    var data = this._actor._biologicData.vitalSigns;
    var cellular = this._actor._biologicData.cellularActivity;
    var y = startY - this._vitalScrollY; // Apply scroll offset
    var lineHeight = this.lineHeight();
    var contentHeight = this.contents.height - startY - lineHeight * 2; // Reserve space for instructions
    var visibleAreaTop = startY;
    var visibleAreaBottom = visibleAreaTop + contentHeight;

    // Calculate total content height for scrolling
    var tempY = startY;

    // Basic vital signs (5 lines)
    tempY += lineHeight * 7; // 5 + 2 spacing

    // Cellular Activity section (7 lines if exists)
    if (cellular) {
      tempY += lineHeight * 8; // Title + 5 data lines + 2 spacing
    }

    // Nutrients section (7 lines)
    tempY += lineHeight * 8; // Title + 5 nutrients + 2 spacing

    // Additional detailed vital signs
    tempY += lineHeight * 15; // Extended vital signs data

    this._maxVitalScroll = Math.max(0, tempY - visibleAreaBottom);

    // Helper function to check if line is visible
    var isLineVisible = function (lineY) {
      return (
        lineY >= visibleAreaTop - lineHeight &&
        lineY <= visibleAreaBottom + lineHeight
      );
    };

    // Basic Vital Signs
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Basic Vital Signs:", 6, y, 200);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Heart Rate: " + Math.floor(data.heartRate) + " BPM",
        20,
        y,
        300
      );
      var hrStatus =
        data.heartRate < 60
          ? "Bradycardia"
          : data.heartRate > 100
            ? "Tachycardia"
            : "Normal";
      var hrColor =
        data.heartRate < 60 || data.heartRate > 100
          ? this.textColor(18)
          : this.textColor(3);
      this.changeTextColor(hrColor);
      this.drawText("(" + hrStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Blood Pressure: " +
        Math.floor(data.bloodPressure.systolic) +
        "/" +
        Math.floor(data.bloodPressure.diastolic),
        20,
        y,
        300
      );
      var bpStatus =
        data.bloodPressure.systolic > 140
          ? "Hypertension"
          : data.bloodPressure.systolic < 90
            ? "Hypotension"
            : "Normal";
      var bpColor =
        bpStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(bpColor);
      this.drawText("(" + bpStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Body Temperature: " + data.bodyTemperature.toFixed(1) + "°C",
        20,
        y,
        300
      );
      var tempStatus =
        data.bodyTemperature > 37.5
          ? "Fever"
          : data.bodyTemperature < 36.0
            ? "Hypothermia"
            : "Normal";
      var tempColor =
        tempStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(tempColor);
      this.drawText("(" + tempStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Oxygen Saturation: " + Math.floor(data.oxygenSaturation) + "%",
        20,
        y,
        300
      );
      var o2Status = data.oxygenSaturation < 95 ? "Low" : "Normal";
      var o2Color =
        o2Status !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(o2Color);
      this.drawText("(" + o2Status + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Cortisol: " + Math.floor(data.cortisol) + " μg/dL",
        20,
        y,
        300
      );
      var cortisolStatus =
        data.cortisol > 25
          ? "High Stress"
          : data.cortisol < 10
            ? "Low"
            : "Normal";
      var cortisolColor =
        cortisolStatus === "High Stress"
          ? this.textColor(2)
          : cortisolStatus === "Low"
            ? this.textColor(18)
            : this.textColor(3);
      this.changeTextColor(cortisolColor);
      this.drawText("(" + cortisolStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight * 2;

    // Additional Vital Parameters
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Extended Vital Parameters:", 6, y, 200);
      this.resetTextColor();
    }
    y += lineHeight;

    // Calculate respiratory rate based on heart rate
    var respiratoryRate =
      Math.floor(data.heartRate / 4) + Math.floor(Math.random() * 4);
    if (isLineVisible(y)) {
      this.drawText(
        "Respiratory Rate: " + respiratoryRate + " brt/min",
        20,
        y,
        300
      );
      var respStatus =
        respiratoryRate > 20 ? "High" : respiratoryRate < 12 ? "Low" : "Normal";
      var respColor =
        respStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(respColor);
      this.drawText("(" + respStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    // Blood pH estimation
    var bloodPH = 7.4 + (Math.random() - 0.5) * 0.1;
    if (isLineVisible(y)) {
      this.drawText("Blood pH: " + bloodPH.toFixed(2), 20, y, 300);
      var pHStatus =
        bloodPH < 7.35 ? "Acidic" : bloodPH > 7.45 ? "Alkaline" : "Normal";
      var pHColor =
        pHStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(pHColor);
      this.drawText("(" + pHStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    // Blood glucose estimation based on nutrients
    var bloodGlucose =
      90 +
      Math.floor((data.nutrients.carbs / 300) * 50) +
      Math.floor(Math.random() * 20);
    if (isLineVisible(y)) {
      this.drawText("Blood Glucose: " + bloodGlucose + " mg/dL", 20, y, 300);
      var glucoseStatus =
        bloodGlucose > 140 ? "High" : bloodGlucose < 70 ? "Low" : "Normal";
      var glucoseColor =
        glucoseStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(glucoseColor);
      this.drawText("(" + glucoseStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    // Hydration status
    var hydrationPercent = Math.floor((data.nutrients.water / 2500) * 100);
    if (isLineVisible(y)) {
      this.drawText("Hydration Level: " + hydrationPercent + "%", 20, y, 300);
      var hydrationStatus =
        hydrationPercent < 70
          ? "Dehydrated"
          : hydrationPercent > 100
            ? "Overhydrated"
            : "Normal";
      var hydrationColor =
        hydrationStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(hydrationColor);
      this.drawText("(" + hydrationStatus + ")", 450, y, 150);
      this.resetTextColor();
    }
    y += lineHeight * 2;

    // Cellular Activity
    if (cellular) {
      if (isLineVisible(y)) {
        this.changeTextColor(this.systemColor());
        this.drawText("Cellular Activity:", 6, y, 200);
        this.resetTextColor();
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Cells Forming: " + cellular.cellsForming.toLocaleString() + "/sec",
          20,
          y,
          300
        );
        var formationRate =
          cellular.cellsForming > 120000
            ? "High"
            : cellular.cellsForming < 80000
              ? "Low"
              : "Normal";
        var formationColor =
          formationRate === "Low"
            ? this.textColor(18)
            : formationRate === "High"
              ? this.textColor(3)
              : this.normalColor();
        this.changeTextColor(formationColor);
        this.drawText("(" + formationRate + ")", 450, y, 150);
        this.resetTextColor();
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Cells Dying: " + cellular.cellsDying.toLocaleString() + "/sec",
          20,
          y,
          300
        );
        var deathRate =
          cellular.cellsDying > 100000
            ? "High"
            : cellular.cellsDying < 60000
              ? "Low"
              : "Normal";
        var deathColor =
          deathRate === "High"
            ? this.textColor(2)
            : deathRate === "Low"
              ? this.textColor(3)
              : this.normalColor();
        this.changeTextColor(deathColor);
        this.drawText("(" + deathRate + ")", 450, y, 150);
        this.resetTextColor();
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Net Cell Change: " +
          (cellular.cellsForming - cellular.cellsDying).toLocaleString() +
          "/sec",
          20,
          y,
          400
        );
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Mitosis Rate: " + cellular.mitosisRate.toFixed(3) + "%",
          20,
          y,
          300
        );
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Apoptosis Rate: " + cellular.apoptosisRate.toFixed(3) + "%",
          20,
          y,
          300
        );
      }
      y += lineHeight;

      if (isLineVisible(y)) {
        this.drawText(
          "Total Cells: " + cellular.totalCells.toExponential(2),
          20,
          y,
          300
        );
      }
      y += lineHeight * 2;
    }

    // Nutrients
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Nutritional Status:", 6, y, 200);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Calories: " + Math.floor(data.nutrients.calories) + " kcal",
        20,
        y,
        250
      );
      var calStatus =
        data.nutrients.calories < 1500
          ? "Deficit"
          : data.nutrients.calories > 2500
            ? "Surplus"
            : "Normal";
      var calColor =
        calStatus === "Deficit"
          ? this.textColor(2)
          : calStatus === "Surplus"
            ? this.textColor(18)
            : this.textColor(3);
      this.changeTextColor(calColor);
      this.drawText("(" + calStatus + ")", 270, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Protein: " + Math.floor(data.nutrients.protein) + "g",
        20,
        y,
        250
      );
      var proteinStatus =
        data.nutrients.protein < 40
          ? "Low"
          : data.nutrients.protein > 100
            ? "High"
            : "Normal";
      var proteinColor =
        proteinStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(proteinColor);
      this.drawText("(" + proteinStatus + ")", 270, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Carbohydrates: " + Math.floor(data.nutrients.carbs) + "g",
        20,
        y,
        250
      );
      var carbStatus =
        data.nutrients.carbs < 150
          ? "Low"
          : data.nutrients.carbs > 350
            ? "High"
            : "Normal";
      var carbColor =
        carbStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(carbColor);
      this.drawText("(" + carbStatus + ")", 270, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Fats: " + Math.floor(data.nutrients.fats) + "g",
        20,
        y,
        250
      );
      var fatStatus =
        data.nutrients.fats < 40
          ? "Low"
          : data.nutrients.fats > 120
            ? "High"
            : "Normal";
      var fatColor =
        fatStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(fatColor);
      this.drawText("(" + fatStatus + ")", 270, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Water: " + Math.floor(data.nutrients.water) + "ml",
        20,
        y,
        250
      );
      var waterStatus =
        data.nutrients.water < 1800
          ? "Low"
          : data.nutrients.water > 3000
            ? "High"
            : "Normal";
      var waterColor =
        waterStatus !== "Normal" ? this.textColor(18) : this.textColor(3);
      this.changeTextColor(waterColor);
      this.drawText("(" + waterStatus + ")", 270, y, 150);
      this.resetTextColor();
    }
    y += lineHeight;

    // Draw scroll indicator if needed
    if (this._maxVitalScroll > 0) {
      var scrollPercent = this._vitalScrollY / this._maxVitalScroll;
      var indicatorY = visibleAreaTop + contentHeight * scrollPercent;
      var indicatorHeight = Math.max(
        10,
        contentHeight * (contentHeight / (contentHeight + this._maxVitalScroll))
      );

      this.contents.fillRect(
        this.contents.width - 8,
        indicatorY,
        4,
        indicatorHeight,
        this.textColor(7)
      );
    }
  };
  // i18n-ignore-end

  // Calculate current mood based on brain activity (Jungian psychology)
  Window_BiologicSimulation.prototype.calculateCurrentMood = function (brain) {
    if (!brain || !brain.regions) return "Neutral";

    var amygdala = brain.regions.amygdala ? brain.regions.amygdala.activity : 50;
    var prefrontal = brain.regions.prefrontalCortex ? brain.regions.prefrontalCortex.activity : 50;
    var hippocampus = brain.regions.hippocampus ? brain.regions.hippocampus.activity : 50;

    var dominantEmotion = amygdala;
    var rationalControl = prefrontal;
    var memory = hippocampus;

    // Determine mood based on brain region dominance
    // i18n-ignore-start: mood ids, resolved through Biologic.mood at the render point
    if (amygdala > 80 && prefrontal < 30) {
      return "Enraged";
    } else if (amygdala > 70 && prefrontal < 50) {
      return "Angry";
    } else if (amygdala < 30 && prefrontal > 80) {
      return "Serene";
    } else if (amygdala > 60 && prefrontal > 70) {
      return "Passionate";
    } else if (amygdala < 40 && prefrontal > 60) {
      return "Contemplative";
    } else if (amygdala > 40 && prefrontal < 40) {
      return "Anxious";
    } else if (memory > 80) {
      return "Nostalgic";
    } else if (amygdala < 50 && prefrontal > 50) {
      return "Calm";
    } else {
      return "Neutral";
    }
    // i18n-ignore-end
  };

  // Get or update current thought (lasts 1-10 seconds)
  Window_BiologicSimulation.prototype.getOrUpdateCurrentThought = function () {
    var currentTime = Date.now();

    // Check if thought duration has expired or thought not initialized
    if (
      !this._currentThought ||
      currentTime - this._thoughtStartTime >= this._thoughtDuration
    ) {
      this._currentThought = this.generateRandomThought();
      this._thoughtStartTime = currentTime;
      this._thoughtDuration = (1 + Math.random() * 9) * 1000; // 1-10 seconds in milliseconds
    }

    return this._currentThought;
  };

  // Generate thought based on biological and brain state
  // Generate thought based on biological and brain state
  // A personality's English `name` in PersonalityData.json is its id - every
  // by-name lookup in the other plugins keys on it - so what the player reads
  // is reached FROM it, out of js/i18n/<lang>/plugins/Personality.json.
  function _personalityText(name, field) {
    if (!name) return '';
    const key = 'Personality.' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + field;
    return T.has(key) ? T(key) : String(name);
  }

  Window_BiologicSimulation.prototype.generateRandomThought = function () {
    var useItalian = ConfigManager.language === "it";
    var actor = this._actor;
    if (!actor || !actor._biologicData) {
      return T('Biologic.emptyVoid');
    }

    var bio = actor._biologicData;
    var personality = bio.personality;

    // --- PERSONALITY THOUGHT INJECTION ---
    // 25% chance to pull a thought from the personality list
    if (
      personality &&
      personality.thoughts &&
      Math.random() < 0.25 // 25% chance
    ) {
      // PersonalityData.json names its thought pool by key; the lines live in
      // js/i18n/<lang>/plugins/PersonalityThoughts.json and are taken from the
      // active language whole (T.pool), never mixed with English.
      var thoughts = Array.isArray(personality.thoughts)
        ? personality.thoughts : T.pool(String(personality.thoughts));
      if (thoughts && thoughts.length > 0) {
        return thoughts[Math.floor(Math.random() * thoughts.length)];
      }
    }
    // --- END INJECTION ---

    var hp = actor.hp;
    var maxHp = actor.mhp;
    var mp = actor.mp;
    var maxMp = actor.mmp;
    // Needs live on the actor now (TimeDateSystem), not game variables 54/55.
    var hunger = actor.hunger ? actor.hunger() : 50; // 0-100
    var sleep = actor.sleep ? actor.sleep() : 50; // 0-100
    var tp = actor.tp || 0;
    var maxTp = actor.maxTp() || 100;
    var apPercent = (tp / maxTp) * 100;

    var hpPercent = (hp / maxHp) * 100;
    var mpPercent = (mp / maxMp) * 100;

    var heartRate = bio.vitalSigns.heartRate || 60;
    var temperature = bio.vitalSigns.bodyTemperature || 37;
    var cortisol = bio.vitalSigns.cortisol || 15;
    var adrenaline = bio.hormones.adrenaline || 20;

    // Determine primary biological state
    var primaryState = this.determinePrimaryBiologicalState(
      hpPercent,
      mpPercent,
      hunger,
      sleep,
      apPercent,
      heartRate,
      temperature,
      cortisol,
      adrenaline
    );

    // Generate thoughts based on the primary state
    return this.generateThoughtFromState(primaryState, useItalian, actor, bio);
  };

  // Determine the primary biological/mental state
  Window_BiologicSimulation.prototype.determinePrimaryBiologicalState = function (
    hpPercent,
    mpPercent,
    hunger,
    sleep,
    apPercent,
    heartRate,
    temperature,
    cortisol,
    adrenaline
  ) {
    // Critical states take priority
    if (hpPercent <= 10) return "dying";
    if (hpPercent <= 25) return "wounded";
    if (hunger <= 10) return "starving";
    if (sleep <= 10) return "exhausted";
    if (temperature >= 40) return "fevering";
    if (temperature <= 35) return "freezing";

    // High energy/stress states
    if (apPercent >= 90 && cortisol >= 70) return "berserking";
    if (apPercent >= 75 && adrenaline >= 60) return "energized";
    if (cortisol >= 80) return "panicked";
    if (adrenaline >= 75) return "adrenaline_rush";

    // Depletion states
    if (hunger <= 30) return "hungry";
    if (sleep <= 30) return "drowsy";
    if (apPercent <= 20) return "exhausted_ap";
    if (mpPercent <= 20) return "mana_depleted";

    // Positive states
    if (hpPercent >= 90 && sleep >= 80 && hunger >= 70) return "excellent";
    if (hpPercent >= 75 && apPercent >= 60) return "confident";
    if (sleep >= 70 && hunger >= 60) return "well_rested";

    // Default balanced state
    return "neutral";
  };

  // Generate thoughts based on determined state
  Window_BiologicSimulation.prototype.generateThoughtFromState = function (
    state,
    useItalian,
    actor,
    bio
  ) {
    var thoughts = [];

    switch (state) {
      case "dying":
        thoughts = T.pool('Biologic.thoughts.dying');
        break;

      case "wounded":
        thoughts = T.pool('Biologic.thoughts.wounded');
        break;

      case "starving":
        thoughts = T.pool('Biologic.thoughts.starving');
        break;

      case "exhausted":
        thoughts = T.pool('Biologic.thoughts.exhausted');
        break;

      case "fevering":
        thoughts = T.pool('Biologic.thoughts.fevering');
        break;

      case "freezing":
        thoughts = T.pool('Biologic.thoughts.freezing');
        break;

      case "berserking":
        thoughts = T.pool('Biologic.thoughts.berserking');
        break;

      case "energized":
        thoughts = T.pool('Biologic.thoughts.energized');
        break;

      case "panicked":
        thoughts = T.pool('Biologic.thoughts.panicked');
        break;

      case "adrenaline_rush":
        thoughts = T.pool('Biologic.thoughts.adrenaline_rush');
        break;

      case "hungry":
        thoughts = T.pool('Biologic.thoughts.hungry');
        break;

      case "drowsy":
        thoughts = T.pool('Biologic.thoughts.drowsy');
        break;

      case "exhausted_ap":
        thoughts = T.pool('Biologic.thoughts.exhausted_ap');
        break;

      case "mana_depleted":
        thoughts = T.pool('Biologic.thoughts.mana_depleted');
        break;

      case "excellent":
        thoughts = T.pool('Biologic.thoughts.excellent');
        break;

      case "confident":
        thoughts = T.pool('Biologic.thoughts.confident');
        break;

      case "well_rested":
        thoughts = T.pool('Biologic.thoughts.well_rested');
        break;

      case "neutral":
      default:
        thoughts = T.pool('Biologic.thoughts.neutral');
        break;
    }

    // Mix in some abstract thoughts occasionally
    if (Math.random() < 0.3) {
      thoughts.push(...this.getAbstractThoughtsForState(state, useItalian));
    }

    return thoughts[Math.floor(Math.random() * thoughts.length)];
  };

  // Get abstract thoughts that relate to the current state
  Window_BiologicSimulation.prototype.getAbstractThoughtsForState = function (
    state,
    useItalian
  ) {
    var abstract = T.pool('Biologic.thoughtsAbstract');

    return abstract;
  };

  // Calculate Ego Strength (based on prefrontal cortex - Jungian sense of self)
  Window_BiologicSimulation.prototype.calculateEgoValue = function (brain) {
    if (!brain || !brain.regions) return 50;

    var prefrontal = brain.regions.prefrontalCortex ? brain.regions.prefrontalCortex.activity : 50;
    var motorCortex = brain.regions.motorCortex ? brain.regions.motorCortex.activity : 50;
    var sensoryCortex = brain.regions.sensoryCortex ? brain.regions.sensoryCortex.activity : 50;

    // Ego is how well the conscious mind controls actions and perceptions
    var ego = (prefrontal + motorCortex + sensoryCortex) / 3;
    return Math.min(100, Math.max(0, ego));
  };

  // Calculate Subconscious (based on limbic system - amygdala, hippocampus, brainstem)
  Window_BiologicSimulation.prototype.calculateSubconsciousValue = function (brain) {
    if (!brain || !brain.regions) return 50;

    var amygdala = brain.regions.amygdala ? brain.regions.amygdala.activity : 50;
    var hippocampus = brain.regions.hippocampus ? brain.regions.hippocampus.activity : 50;
    var brainstem = brain.regions.brainstem ? brain.regions.brainstem.activity : 50;

    // Subconscious is the limbic system's influence (emotions, memories, instincts)
    var subconscious = (amygdala + hippocampus + brainstem) / 3;
    return Math.min(100, Math.max(0, subconscious));
  };

  // Calculate Orgone Energy (Wilhelm Reich's bioenergy concept - based on overall vitality and ley veins)
  Window_BiologicSimulation.prototype.calculateOrgonePercentage = function (brain) {
    if (!brain) return 50;

    var actor = this._actor;
    if (!actor || !actor._biologicData) return 50;

    var bio = actor._biologicData;

    // Orgone is based on:
    // - Overall brain activity (consciousness)
    var brainEnergy = brain.overallActivity || 50;

    // - Ley vein magical activity (meridian energy)
    var leyVeinEnergy = 0;
    var leyVeinCount = 0;
    if (bio.leyVeins && bio.leyVeins.meridians) {
      for (var meridian in bio.leyVeins.meridians) {
        leyVeinEnergy += bio.leyVeins.meridians[meridian].magicalActivity || 0;
        leyVeinCount++;
      }
    }
    leyVeinEnergy = leyVeinCount > 0 ? leyVeinEnergy / leyVeinCount : 50;

    // - Vital signs (heartbeat, breathing)
    var heartRateNormalized = Math.min(100, (bio.vitalSigns.heartRate / 100) * 100);

    // - Immune system strength
    var immuneEnergy = Math.min(100, (bio.immuneSystem.whiteBloodCells / 10000) * 100);

    // Calculate final orgone energy
    var orgone =
      brainEnergy * 0.35 + leyVeinEnergy * 0.35 + heartRateNormalized * 0.15 + immuneEnergy * 0.15;

    return Math.min(100, Math.max(0, orgone));
  };

  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawBrainActivity = function (startY) {
    return;
    var brain = this._actor._biologicData.brainActivity;
    if (!brain) return;

    var y = startY - this._brainScrollY; // Apply scroll offset
    var lineHeight = this.lineHeight();
    var contentHeight = this.contents.height - startY - lineHeight * 2; // Reserve space for instructions
    var visibleAreaTop = startY;
    var visibleAreaBottom = visibleAreaTop + contentHeight;
    var totalContentHeight = 0;

    // Calculate total content height for scrolling
    var tempY = startY;

    // Mood and current thought (3 lines)
    tempY += lineHeight * 3;

    // Psychological Profile section (5 lines: header + ego + subconscious + orgone + spacing)
    tempY += lineHeight * 5;

    // Overall brain stats (4 lines)
    tempY += lineHeight * 4;

    // Brain waves section (7 lines: title + 3 wave pairs + gamma)
    tempY += lineHeight * 7;

    // Brain regions section
    tempY += lineHeight * 2; // Title + spacing

    // Sort regions by activity for display
    var regionArray = [];
    for (var regionKey in brain.regions) {
      var region = brain.regions[regionKey];
      var name = region.name;
      var func = region.function;

      if (typeof name === 'string' && name.includes('.')) {
        name = (brainI18nData ? resolveBrainI18nPath(name, brainI18nData) : null) || name;
      }
      if (typeof func === 'string' && func.includes('.')) {
        func = (brainI18nData ? resolveBrainI18nPath(func, brainI18nData) : null) || func;
      }

      regionArray.push({
        key: regionKey,
        name: name,
        activity: region.activity,
        status: region.status,
        function: func,
        oxygen: region.oxygenConsumption,
        neurotransmitters: region.neurotransmitters,
      });
    }
    // Sort alphabetically by name
    regionArray.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    // Each region takes 4 lines now (name/status, function, neurotransmitters, and a blank line for spacing)
    tempY += regionArray.length * lineHeight * 4;

    // Neurotransmitter summary section
    tempY += lineHeight * 8; // Title + 6 neurotransmitters + spacing

    this._maxBrainScroll = Math.max(0, tempY - visibleAreaBottom);

    // Helper function to check if line is visible
    var isLineVisible = function (lineY) {
      return (
        lineY >= visibleAreaTop - lineHeight &&
        lineY <= visibleAreaBottom + lineHeight
      );
    };

    // Draw content only if visible

    // Draw mood and current thought
    var currentMood = this.calculateCurrentMood(brain);
    var currentThought = this.getOrUpdateCurrentThought();
    var egoValue = this.calculateEgoValue(brain);
    var subconsciousValue = this.calculateSubconsciousValue(brain);
    var orgonePercentage = this.calculateOrgonePercentage(brain);

    if (isLineVisible(y)) {
      this.changeTextColor(this.textColor(3)); // Yellow for mood
      this.drawText("Mood: " + currentMood, 6, y, 400);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText("» " + currentThought, 6, y, 500);
    }
    y += lineHeight * 2; // Add spacing

    // Draw Jungian/Reich psychology stats
    if (isLineVisible(y)) {
      this.changeTextColor(this.textColor(3)); // Yellow for section header
      this.drawText("Psychological Profile:", 6, y, 300);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText("Ego Strength: " + Math.floor(egoValue) + "%", 6, y, 300);
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText("Subconscious: " + Math.floor(subconsciousValue) + "%", 6, y, 300);
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.changeTextColor(this.textColor(1)); // Blue for orgone
      this.drawText("Orgone Energy: " + Math.floor(orgonePercentage) + "%", 6, y, 300);
      this.resetTextColor();
    }
    y += lineHeight * 2; // Add spacing

    // Overall brain stats
    if (isLineVisible(y)) {
      this.changeTextColor(this.textColor(3)); // Yellow for brain activity
      this.drawText(
        "Overall Activity: " + Math.floor(brain.overallActivity) + "%",
        6,
        y,
        300
      );
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Active Regions: " + brain.activeRegions + "/" + brain.totalRegions,
        6,
        y,
        300
      );
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Neurons Firing: " + brain.neurons.firing.toLocaleString() + "/sec",
        6,
        y,
        400
      );
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Total Connections: " + brain.neurons.connections.toExponential(2),
        6,
        y,
        400
      );
    }
    y += lineHeight * 2;

    // Brain waves
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Brain Waves (Hz):", 6, y, 200);
      this.resetTextColor();
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Alpha (8-13): " + brain.waves.alpha.toFixed(1),
        20,
        y,
        220
      );
      this.drawText(
        "Beta (13-30): " + brain.waves.beta.toFixed(1),
        330,
        y,
        200
      );
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText("Theta (4-8): " + brain.waves.theta.toFixed(1), 20, y, 200);
      this.drawText(
        "Delta (0.5-4): " + brain.waves.delta.toFixed(1),
        330,
        y,
        200
      );
    }
    y += lineHeight;

    if (isLineVisible(y)) {
      this.drawText(
        "Gamma (30-100): " + brain.waves.gamma.toFixed(1),
        20,
        y,
        200
      );
    }
    y += lineHeight * 2;

    // Brain regions
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Brain Regions:", 6, y, 200);
      this.resetTextColor();
    }
    y += lineHeight;

    for (var i = 0; i < regionArray.length; i++) {
      var region = regionArray[i];
      var statusColor = this.normalColor();

      if (region.status === "Hyperactive") {
        statusColor = this.textColor(3); // Yellow
      } else if (region.status === "Active") {
        statusColor = this.textColor(23); // Light blue
      } else if (region.status === "Low" || region.status === "Minimal") {
        statusColor = this.textColor(18); // Orange/Red
      }

      // Region name and status
      if (isLineVisible(y)) {
        this.drawText(region.name + ":", 20, y, 400);
      }
      y += lineHeight;

      // Activity and oxygen on second line
      if (isLineVisible(y)) {
        this.changeTextColor(statusColor);
        this.drawText(
          "  Activity: " + Math.floor(region.activity) + "% (" + region.status + ")",
          30,
          y,
          350
        );
        this.resetTextColor();
        this.drawText(
          "O₂: " + region.oxygen.toFixed(1),
          550,
          y,
          120
        );
      }
      y += lineHeight;
      y += lineHeight;

      // Function description
      if (isLineVisible(y)) {
        this.drawText("  Function: " + region.function, 30, y, 400);
      }
      y += lineHeight;

      // Neurotransmitters for this region
      if (isLineVisible(y)) {
        var ntText = "  NT: ";
        var ntArray = [];
        for (var nt in region.neurotransmitters) {
          ntArray.push(
            nt.charAt(0).toUpperCase() +
            nt.slice(1) +
            ": " +
            Math.floor(region.neurotransmitters[nt])
          );
        }
        ntText += ntArray.join(", ");
        this.changeTextColor(this.textColor(6)); // Light gray
        this.drawText(ntText, 30, y, 500);
        this.resetTextColor();
      }
      y += lineHeight;

      // --- FIX START: Add an extra line for vertical spacing between entries ---
      y += lineHeight;
      // --- FIX END ---
    }

    y += lineHeight;

    // Overall neurotransmitter summary
    if (isLineVisible(y)) {
      this.changeTextColor(this.systemColor());
      this.drawText("Overall Neurotransmitter Levels:", 6, y, 300);
      this.resetTextColor();
    }
    y += lineHeight;

    // Calculate average neurotransmitter levels across all regions
    var avgNeurotransmitters = {
      dopamine: 0,
      serotonin: 0,
      norepinephrine: 0,
      acetylcholine: 0,
      gaba: 0,
      glutamate: 0,
    };
    var ntCounts = {};

    for (var regionKey in brain.regions) {
      var region = brain.regions[regionKey];
      for (var nt in region.neurotransmitters) {
        if (avgNeurotransmitters.hasOwnProperty(nt)) {
          avgNeurotransmitters[nt] += region.neurotransmitters[nt];
          ntCounts[nt] = (ntCounts[nt] || 0) + 1;
        }
      }
    }

    // Calculate averages
    for (var nt in avgNeurotransmitters) {
      if (ntCounts[nt] > 0) {
        avgNeurotransmitters[nt] = avgNeurotransmitters[nt] / ntCounts[nt];
      }
    }

    // Display neurotransmitter averages
    var ntDisplayNames = {
      dopamine: "Dopamine",
      serotonin: "Serotonin",
      norepinephrine: "Norepinephrine",
      acetylcholine: "Acetylcholine",
      gaba: "GABA",
      glutamate: "Glutamate",
    };

    var ntPairs = [
      ["dopamine", "serotonin"],
      ["norepinephrine", "acetylcholine"],
      ["gaba", "glutamate"],
    ];

    for (var i = 0; i < ntPairs.length; i++) {
      if (isLineVisible(y)) {
        var nt1 = ntPairs[i][0];
        var nt2 = ntPairs[i][1];
        this.drawText(
          ntDisplayNames[nt1] + ": " + Math.floor(avgNeurotransmitters[nt1]),
          20,
          y,
          200
        );
        this.drawText(
          ntDisplayNames[nt2] + ": " + Math.floor(avgNeurotransmitters[nt2]),
          250,
          y,
          200
        );
      }
      y += lineHeight;
    }

    // Draw scroll indicator if needed
    if (this._maxBrainScroll > 0) {
      var scrollPercent = this._brainScrollY / this._maxBrainScroll;
      var indicatorY = visibleAreaTop + contentHeight * scrollPercent;
      var indicatorHeight = Math.max(
        10,
        contentHeight * (contentHeight / (contentHeight + this._maxBrainScroll))
      );

      this.contents.fillRect(
        this.contents.width - 8,
        indicatorY,
        4,
        indicatorHeight,
        this.textColor(7)
      );
    }
  };
  // i18n-ignore-end
  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawHormones = function (startY) {
    return;
    var data = this._actor._biologicData.hormones;
    var y = startY;
    var lineHeight = this.lineHeight();

    this.changeTextColor(this.systemColor());
    this.drawText("Sex Hormones:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    this.drawText(
      "Testosterone: " + Math.floor(data.testosterone) + " ng/dL",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Estrogen: " + Math.floor(data.estrogen) + " pg/mL",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Progesterone: " + data.progesterone.toFixed(2) + " ng/mL",
      20,
      y,
      300
    );
    y += lineHeight * 2;

    this.changeTextColor(this.systemColor());
    this.drawText("Other Hormones:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    this.drawText(
      "Cortisol: " + Math.floor(data.cortisol) + " μg/dL",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Adrenaline: " + Math.floor(data.adrenaline) + " pg/mL",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Insulin: " + Math.floor(data.insulin) + " mIU/L",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Growth Hormone: " + data.growth.toFixed(2) + " ng/mL",
      20,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Thyroid (TSH): " + data.thyroid.toFixed(2) + " mIU/L",
      20,
      y,
      300
    );

    // Show current gender based on hormones
    var currentGender = $gameActors.actor(1).gender();
    var genderNames = ["Male", "Female", "Non-Binary"];
    var genderNames_it = ["Maschio", "Femmina", "Non-Binario"];
    var genderName =
      ConfigManager.language === "it"
        ? genderNames_it[currentGender]
        : genderNames[currentGender];

    y += lineHeight * 2;
    this.changeTextColor(this.textColor(3));
    this.drawText("Current Gender: " + genderName, 6, y, 300);
    this.resetTextColor();
  };
  // i18n-ignore-end

  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawImmuneSystem = function (startY) {
    return;
    var data = this._actor._biologicData.immuneSystem;
    var y = startY;
    var lineHeight = this.lineHeight();

    this.drawText(
      "White Blood Cells: " + Math.floor(data.whiteBloodCells) + "/μL",
      6,
      y,
      300
    );
    y += lineHeight;

    this.drawText(
      "Antibodies: " + Math.floor(data.antibodies) + " mg/dL",
      6,
      y,
      300
    );
    y += lineHeight * 2;

    // Active Infections
    this.changeTextColor(this.systemColor());
    this.drawText("Active Infections:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.infections.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
      y += lineHeight;
    } else {
      for (var i = 0; i < data.infections.length; i++) {
        var infection = data.infections[i];
        var severityText = ["Mild", "Moderate", "Severe"][
          infection.severity - 1
        ];
        var text =
          infection.location +
          ": " +
          infection.type +
          " (" +
          severityText +
          ")";

        if (infection.severity >= 2) {
          this.changeTextColor(this.textColor(2)); // Red for moderate/severe
        }

        this.drawText(text, 20, y, 400);
        this.resetTextColor();
        y += lineHeight;
      }
    }

    y += lineHeight;

    // Viruses
    this.changeTextColor(this.systemColor());
    this.drawText("Active Viruses:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.viruses.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
      y += lineHeight;
    } else {
      for (var i = 0; i < Math.min(data.viruses.length, 5); i++) {
        var virus = data.viruses[i];
        var typeColor =
          virus.type === "Pathogenic"
            ? this.textColor(2)
            : virus.type === "Beneficial"
              ? this.textColor(3)
              : this.normalColor();

        this.drawText(virus.name + ":", 20, y, 200);
        this.changeTextColor(typeColor);
        this.drawText(
          virus.type + " (" + virus.count.toLocaleString() + ")",
          230,
          y,
          200
        );
        this.resetTextColor();
        y += lineHeight;
      }
      if (data.viruses.length > 5) {
        this.drawText(
          "... and " + (data.viruses.length - 5) + " more",
          20,
          y,
          200
        );
        y += lineHeight;
      }
    }

    y += lineHeight;

    // Bacteria
    this.changeTextColor(this.systemColor());
    this.drawText("Active Bacteria:", 6, y, 200);
    this.resetTextColor();
    y += lineHeight;

    if (data.bacteria.length === 0) {
      this.drawText(T('Biologic.noneDetected'), 20, y, 300);
    } else {
      for (var i = 0; i < Math.min(data.bacteria.length, 5); i++) {
        var bacteria = data.bacteria[i];
        var typeColor =
          bacteria.type === "Pathogenic"
            ? this.textColor(2)
            : bacteria.type === "Beneficial"
              ? this.textColor(3)
              : this.normalColor();

        this.drawText(bacteria.name + ":", 20, y, 200);
        this.changeTextColor(typeColor);
        this.drawText(
          bacteria.type + " (" + bacteria.count.toLocaleString() + ")",
          230,
          y,
          200
        );
        this.resetTextColor();
        y += lineHeight;
      }
      if (data.bacteria.length > 5) {
        this.drawText(
          "... and " + (data.bacteria.length - 5) + " more",
          20,
          y,
          200
        );
      }
    }
  };
  // i18n-ignore-end

  // i18n-ignore-start: unreachable canvas fallback (opens with `return;`, no caller); the DOM panel renders this section.
  Window_BiologicSimulation.prototype.drawLeyVeins = function (startY) {
    return;
    var data = this._actor._biologicData.leyVeins;
    var bodyParts = this._actor._bodyParts;
    var y = startY;
    var lh = this.lineHeight();
    var useIt = ConfigManager.language === "it";

    // ── Overall flow header ───────────────────────────────────────────────────
    this.changeTextColor(this.textColor(3));
    var overallLabel = useIt
      ? "Flusso Mana Totale: " + Math.floor(data.flow) + "%"
      : "Overall Mana Flow: " + Math.floor(data.flow) + "%";
    this.drawText(overallLabel, 6, y, 350);
    this.resetTextColor();

    // Overall mana bar (full width)
    var barX = 360, barY = y + 4, barW = this.contentsWidth() - 366, barH = lh - 8;
    var bgColor = Utils.RPGMAKER_NAME === "MZ" ? ColorManager.gaugeBackColor() : this.textColor(19);
    var fgColor1 = Utils.RPGMAKER_NAME === "MZ" ? ColorManager.mpGaugeColor1() : this.textColor(22);
    var fgColor2 = Utils.RPGMAKER_NAME === "MZ" ? ColorManager.mpGaugeColor2() : this.textColor(23);
    this.contents.fillRect(barX, barY, barW, barH, bgColor);
    var fillW = Math.floor(barW * Math.min(data.flow, 100) / 100);
    if (fillW > 0) {
      // Gradient-like: fill left half with fgColor1, right half with fgColor2
      var half = Math.floor(fillW / 2);
      this.contents.fillRect(barX, barY, half, barH, fgColor1);
      this.contents.fillRect(barX + half, barY, fillW - half, barH, fgColor2);
    }

    y += lh + 4;
    this.drawHorzLine(y);
    y += 8;

    // ── Column headers ────────────────────────────────────────────────────────
    this.contents.fontSize = 16;
    this.changeTextColor(this.systemColor());
    var hPart = T('Biologic.bodyPart');
    var hFlow = T('Biologic.manaFlow');
    var hHP = T('Biologic.hp');
    var hAct = T('Biologic.activity');
    this.drawText(hPart, 6, y, 140);
    this.drawText(hFlow, 150, y, 190);
    this.drawText(hHP, 348, y, 52);
    this.drawText(hAct, 408, y, 80);
    this.resetTextColor();
    this.resetFontSettings();
    y += Math.floor(lh * 0.9);
    this.drawHorzLine(y);
    y += 6;

    // ── Body part rows ────────────────────────────────────────────────────────
    if (!bodyParts) return;

    var numParts = Object.keys(bodyParts).length;
    var healthyCount = 0;
    for (var k in bodyParts) { if (!bodyParts[k].damaged) healthyCount++; }

    // Base per-part flow = what one part gets when all parts are healthy.
    // Bar is scaled against this: 100% bar = normal share, >100% = redistributed extra.
    // Max representable = 150 (the cap in updateLeyVeinsFromDamage).
    var basePerPart = numParts > 0 ? data.flow : 0; // overallFlow / numParts × numParts = overallFlow
    var barMax = 150; // bars scale to this so redistribution is visually apparent

    // Accent color for overloaded (redistributed) flow
    var overloadColor = Utils.RPGMAKER_NAME === "MZ" ? ColorManager.ctGaugeColor1() : this.textColor(29);

    for (var partKey in bodyParts) {
      var part = bodyParts[partKey];
      var mer = data.meridians[partKey];
      if (!mer) continue;

      var hpRatio = part.maxHp > 0 ? part.currentHp / part.maxHp : 0;
      var flowVal = Math.floor(mer.flow);
      // Per-part normal share (no redistribution)
      var normalShare = numParts > 0 ? Math.floor(data.flow) : 0;
      var isOverloaded = !part.damaged && healthyCount < numParts && flowVal > normalShare;

      // Part name
      this.resetTextColor();
      this.contents.fontSize = 18;
      this.drawText(mer.name || part.name, 6, y, 140);

      // Mana flow gauge bar ,  scaled so barMax fills the full bar width
      var gX = 150, gY = y + 5, gW = 190, gH = lh - 10;
      this.contents.fillRect(gX, gY, gW, gH, bgColor);
      if (flowVal > 0) {
        var gFill = Math.floor(gW * Math.min(flowVal, barMax) / barMax);
        if (isOverloaded) {
          // Show normal share in mp color, extra in accent (overload)
          var normalFill = Math.floor(gW * Math.min(normalShare, barMax) / barMax);
          var h1 = Math.floor(normalFill / 2);
          this.contents.fillRect(gX, gY, h1, gH, fgColor1);
          this.contents.fillRect(gX + h1, gY, normalFill - h1, gH, fgColor2);
          this.contents.fillRect(gX + normalFill, gY, gFill - normalFill, gH, overloadColor);
        } else {
          var h1 = Math.floor(gFill / 2);
          this.contents.fillRect(gX, gY, h1, gH, fgColor1);
          this.contents.fillRect(gX + h1, gY, gFill - h1, gH, fgColor2);
        }
      }
      // Flow value label inside bar
      this.contents.fontSize = 15;
      // A canvas window, so the colour has to be a string: read the theme's.
      this.changeTextColor(part.damaged ? this.textColor(2)
        : (getComputedStyle(document.documentElement).getPropertyValue('--text-highlight-active').trim() || '#ffffff'));
      var flowLabel = part.damaged ? (T('Biologic.blocked')) : flowVal + "%";
      this.drawText(flowLabel, gX + 4, y, gW - 8);

      // HP %
      this.contents.fontSize = 17;
      this.changeTextColor(part.damaged ? this.textColor(2) : this.normalColor());
      var hpText = part.damaged ? ", " : Math.floor(hpRatio * 100) + "%";
      this.drawText(hpText, 348, y, 52, "right");

      // Magical activity
      if (mer.magicalActivity !== undefined) {
        this.changeTextColor(this.textColor(3));
        this.contents.fontSize = 15;
        this.drawText(Math.floor(mer.magicalActivity) + "%", 408, y, 80);
      }

      this.resetTextColor();
      this.resetFontSettings();
      y += lh;
    }
  };
  // i18n-ignore-end

  Window_BiologicSimulation.prototype.drawHorzLine = function (y) {
    return;
    var lineY = y + this.lineHeight() / 2 - 1;
    this.contents.paintOpacity = 48;
    var color =
      Utils.RPGMAKER_NAME === "MZ"
        ? ColorManager.normalColor()
        : this.normalColor();
    this.contents.fillRect(0, lineY, this.contentsWidth(), 2, color);
    this.contents.paintOpacity = 255;
  };

  Window_BiologicSimulation.prototype.cursorRight = function (wrap) {
    this._brainScrollY = 0; // Reset brain scroll
    this._vitalScrollY = 0; // Reset vital scroll
    this._partsScrollY = 0; // Reset parts scroll
    this._category = (this._category + 1) % this._categories.length;
    this.refresh();
  };

  Window_BiologicSimulation.prototype.cursorLeft = function (wrap) {
    this._brainScrollY = 0; // Reset brain scroll
    this._vitalScrollY = 0; // Reset vital scroll
    this._partsScrollY = 0; // Reset parts scroll
    this._category =
      (this._category - 1 + this._categories.length) % this._categories.length;
    this.refresh();
  };

  Window_BiologicSimulation.prototype.processCancel = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.processCancel.call(this);
    } else {
      Window_Selectable.prototype.processCancel.call(this);
    }
    SceneManager.pop();
  };

  // Helper methods for color compatibility
  Window_BiologicSimulation.prototype.systemColor = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.systemColor()
      : Window_Base.prototype.systemColor.call(this);
  };

  Window_BiologicSimulation.prototype.normalColor = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.normalColor()
      : Window_Base.prototype.normalColor.call(this);
  };

  Window_BiologicSimulation.prototype.textColor = function (n) {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.textColor(n)
      : Window_Base.prototype.textColor.call(this, n);
  };

  Window_BiologicSimulation.prototype.resetTextColor = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      this.changeTextColor(ColorManager.normalColor());
    } else {
      Window_Base.prototype.resetTextColor.call(this);
    }
  };

  Window_BiologicSimulation.prototype.changeTextColor = function (color) {
    if (Utils.RPGMAKER_NAME === "MZ") {
      this.contents.textColor = color;
    } else {
      Window_Base.prototype.changeTextColor.call(this, color);
    }
  };
  // Static methods for pregnancy plugin commands

  Window_BiologicSimulation.makePregnant = function () {
    var actor = $gameParty.members()[0];
    if (!actor) return;

    var pregnancyType = $gameVariables.value(87) || 0;

    // Check if reproduction is possible
    if (pregnancyType === 0) {
      var message = T('Biologic.noReproductiveSystemAvailableSetVariable87Fi');
      window.skipLocalization = true;
      $gameMessage.add(message);
      window.skipLocalization = false;
      return;
    }
    // Initialize uterus data if it doesn't exist
    if (!actor._uterusData) {
      actor._uterusData = {
        pregnancyType: pregnancyType,
        isPregnant: false,
        conceptionDate: null,
        dueDate: null,
        gestationalAge: 0,
        fetus: null,
        ovulationCycle: {
          dayInCycle: Math.floor(Math.random() * 28) + 1,
          cycleLength: 28,
          ovulationDay: 14,
          fertile: false,
        },
        eggCount: 300000 + Math.floor(Math.random() * 200000),
        eggDevelopment: 0,
        eggsToLay: 0,
        seedDevelopment: 0,
        seedsReady: 0,
        mitosisDevelopment: 0,
        // Seed with game-day timestamps (not Date.now() ms) so updateOvulationCycle,
        // which compares game-day timestamps, sees a sane delta and progresses.
        lastStatusCheck: convertGameDateToTimestamp(getGameDateFromVariable()),
        lastCycleUpdate: convertGameDateToTimestamp(getGameDateFromVariable()),
        birthReady: false,
      };
    }

    var uterus = actor._uterusData;

    // Check if already pregnant
    if (uterus.isPregnant) {
      var message = T('Biologic.alreadyInReproductiveProcess');
      window.skipLocalization = true;
      $gameMessage.add(message);
      window.skipLocalization = false;
      return;
    }

    // Make pregnant based on type using game date
    var currentGameDate = convertGameDateToTimestamp(getGameDateFromVariable());
    uterus.isPregnant = true;
    uterus.conceptionDate = currentGameDate;
    uterus.gestationalAge = 0;
    uterus.lastStatusCheck = currentGameDate;

    // The term belongs to the actor's archetype, whatever the reproduction is.
    var term = getPregnancyDuration(actor);
    uterus.dueDate = currentGameDate + term;
    uterus.notedQuarter = 0;

    var message = "";

    switch (pregnancyType) {
      case 1: // Uterus
        message = T.n('Biologic.pregnancyInitiatedDue', term);
        break;

      case 2: // Oviparous
        uterus.eggDevelopment = 0;
        message = T.n('Biologic.eggDevelopmentInitiated', term);
        break;

      case 3: // Plant seeds
        uterus.seedDevelopment = 0;
        message = T.n('Biologic.seedGenerationInitiated', term);
        break;

      case 4: // Mitosis
        uterus.mitosisDevelopment = 0;
        message = T.n('Biologic.mitosisInitiated', term);
        break;
    }

    window.skipLocalization = true;
    $gameMessage.add(message);
    window.skipLocalization = false;
  };











  var _Game_Interpreter_pluginCommand_pregnancy =
    Game_Interpreter.prototype.pluginCommand;
  Window_BiologicSimulation.shortenPregnancy = function () {
    var actor = $gameParty.members()[0];
    if (!actor || !actor._uterusData) return;

    var uterus = actor._uterusData;
    var pregnancyType = $gameVariables.value(87) || 0;

    if (!uterus.isPregnant) {
      var message = T('Biologic.notCurrentlyInReproductiveProcess');
      window.skipLocalization = true;
      $gameMessage.add(message);
      window.skipLocalization = false;
      return;
    }

    // Reduce by 30 game days (1 month) for all types
    var thirtyGameDays = 30;
    uterus.conceptionDate -= thirtyGameDays;
    uterus.dueDate -= thirtyGameDays;

    // Recalculate progress
    var now = convertGameDateToTimestamp(getGameDateFromVariable());
    var elapsed = now - uterus.conceptionDate;  // elapsed is in days
    uterus.gestationalAge = Math.floor(elapsed);

    var message = "";
    var shouldComplete = false;
    // Same term the pregnancy itself runs on: the actor's archetype's.
    var term = getPregnancyDuration(actor);

    switch (pregnancyType) {
      case 1: // Uterus
        if (uterus.gestationalAge >= term) {
          shouldComplete = true;
          message = T('Biologic.pregnancyAcceleratedToCompletionBirthIsImmin');
        } else {
          var daysRemaining = term - uterus.gestationalAge;
          message = T.n('Biologic.pregnancyShortened', daysRemaining);
        }
        break;

      case 2: // Oviparous
        // elapsed is in game-days; mirror updateUterusStatus' term.
        uterus.eggDevelopment = Math.min(100, (elapsed / term) * 100);

        if (uterus.eggDevelopment >= 100) {
          shouldComplete = true;
          message = T('Biologic.eggDevelopmentAcceleratedToCompletionEggsRea');
        } else {
          message = T('Biologic.eggDevelopmentShortened', { percent: uterus.eggDevelopment.toFixed(1) });
        }
        break;

      case 3: // Plant seeds
        // elapsed is in game-days; mirror updateUterusStatus' term.
        uterus.seedDevelopment = Math.min(100, (elapsed / term) * 100);

        if (uterus.seedDevelopment >= 100) {
          shouldComplete = true;
          message = T('Biologic.seedGenerationAcceleratedToCompletionSeedIsR');
        } else {
          var hoursRemaining = Math.ceil(((100 - uterus.seedDevelopment) / 100) * (term * 24));
          message = T.n('Biologic.seedGenerationShortened', hoursRemaining);
        }
        break;

      case 4: // Mitosis
        // elapsed is in game-days; mirror updateUterusStatus' term.
        uterus.mitosisDevelopment = Math.min(100, (elapsed / term) * 100);

        if (uterus.mitosisDevelopment >= 100) {
          shouldComplete = true;
          message = T('Biologic.mitosisAcceleratedToCompletionCellDivisionCo');
        } else {
          var minutesRemaining = Math.ceil(((100 - uterus.mitosisDevelopment) / 100) * 60);
          message = T.n('Biologic.mitosisShortened', minutesRemaining);
        }
        break;
    }

    window.skipLocalization = true;
    $gameMessage.add(message);
    window.skipLocalization = false;
  };
  Window_BiologicSimulation.birthSeed = function () {
    var actor = $gameParty.members()[0];
    if (!actor || !actor._uterusData) return;

    var uterus = actor._uterusData;
    var pregnancyType = $gameVariables.value(87) || 0;

    if (pregnancyType !== 3) {
      var message = T('Biologic.thisCommandOnlyWorksForPlantTypeReproduction');
      window.skipLocalization = true;
      $gameMessage.add(message);
      window.skipLocalization = false;
      return;
    }

    if (uterus.seedsReady <= 0) {
      var message = T('Biologic.noSeedsAvailableToPlant');
      window.skipLocalization = true;
      $gameMessage.add(message);
      window.skipLocalization = false;
      return;
    }

    // Remove one seed from stockpile
    uterus.seedsReady -= 1;

    var message = T('Biologic.seedPlanted', { count: uterus.seedsReady });
    window.skipLocalization = true;
    $gameMessage.add(message);
    window.skipLocalization = false;
    pregToast(actor, message, { severity: 'good', duration: 300, key: 'conceived' });

    // A planted seed is where a plant pregnancy actually produces somebody, so
    // the sprout joins the family here rather than when the seed was grown.
    registerOffspring(actor);

    // Trigger birth event
    $gameTemp.reserveCommonEvent(139);
  };
  var _Game_Interpreter_pluginCommand_birthSeed =
    Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand_birthSeed.call(this, command, args);

    if (command === "BirthSeed") {
      Window_BiologicSimulation.birthSeed();
    }
  };

  // For MZ
  if (Utils.RPGMAKER_NAME === "MZ") {
    PluginManager.registerCommand(
      "Health_BiologicSimulation",
      "BirthSeed",
      (args) => {
        Window_BiologicSimulation.birthSeed();
      }
    );
  }
  // ==========================================================================
  // The clock
  // ==========================================================================
  // Gestation used to advance only while the biologic panel was open, so a
  // pregnancy waited for the player to look at it. It runs off the game clock
  // now, once an hour and again on every map load, which is what a night's
  // sleep or a fast travel crosses. The panel's own methods do the work: they
  // touch nothing but `this._actor`, so a bare object standing in for the
  // window is enough.
  function tickPregnancies() {
    if (!window.$gameParty || !window.$gameVariables) return;
    for (const actor of $gameParty.members()) {
      const uterus = actor && actor._uterusData;
      if (!uterus || !uterus.isPregnant) continue;
      const proxy = Object.create(Window_BiologicSimulation.prototype);
      proxy._actor = actor;
      try { proxy.updatePregnancy(); }
      catch (e) { console.warn('[Health_BiologicSimulation] pregnancy tick failed', e); }
    }
  }

  // One stamp per game hour, off the same date variable the gestational clock
  // is measured against.
  function gameHourStamp() {
    const d = getGameDateFromVariable();
    return Math.floor(convertGameDateToTimestamp(d) * 24);
  }

  if (typeof Scene_Map !== 'undefined') {
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
      _Scene_Map_onMapLoaded.call(this);
      tickPregnancies();
    };
  }

  if (typeof Game_Map !== 'undefined') {
    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function (sceneActive) {
      _Game_Map_update.call(this, sceneActive);
      if (!sceneActive || !window.$gameVariables) return;
      // gameHourStamp() parses a date STRING out of variable 113: a split, a
      // filter and four parseInt calls, and it ran on every frame of every map
      // purely to discover that the hour had not turned yet.
      //
      // The cheap test is the unparsed string itself. It is the same variable
      // the stamp is derived from, so this adds no second source of truth for
      // the clock: an hour cannot turn without the date text changing, and the
      // text cannot change without the parse running on that frame. One string
      // compare now stands in front of the parse.
      const dateText = $gameVariables.value(113);
      if (dateText === this._lastPregnancyDateText) return;
      this._lastPregnancyDateText = dateText;
      const hourStamp = gameHourStamp();
      if (hourStamp === this._lastPregnancyHour) return;
      this._lastPregnancyHour = hourStamp;
      tickPregnancies();
    };
  }

  // Add compatibility methods for MV if running in MZ
  if (Utils.RPGMAKER_NAME === "MZ") {
    if (!Window_BiologicSimulation.prototype.drawActorName) {
      Window_BiologicSimulation.prototype.drawActorName = function (
        actor,
        x,
        y,
        width
      ) {
        width = width || 168;
        this.changeTextColor(ColorManager.hpColor(actor));
        this.drawText(actor.name(), x, y, width);
      };
    }
  }
})();
