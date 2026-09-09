/*:
 * @target MZ
 * @plugindesc Dwarf Fortress-inspired limb and organ damage system for Actors 1, 2, and 3
 * @author Omni-Lex
 * @help
 * This plugin implements a detailed limb and organ damage system
 * inspired by Dwarf Fortress. Features include:
 * - Individual health for limbs and organs
 * - Damage distribution to body parts
 * - Special effects for damaged body parts
 * - Health menu integration for body part status
 * - Recovery functionality
 * - Stat penalties for fully damaged body parts
 * - Support for multiple party members (Actors 1, 2, 3)
 * - Switch between players with LEFT/RIGHT arrow keys in Health Status menu
 *
 * Plugin Commands:
 *   HealBodyParts [actorId] [amount] - Heals body parts for specified actor
 *   ChangeArchetype [actorId] [archetypeName] - Changes actor's body archetype
 *   CreateCreature [actorId] - Opens UI to create a creature for specified actor
 *
 * @param Menu Command Name
 * @desc The name of the command in the menu
 * @default Health Status
 *
 * @command HealBodyParts
 * @desc Heals all body parts by specified amount
 * @arg actorId
 * @type number
 * @min 0
 * @max 3
 * @default 0
 * @desc Actor ID (1, 2, or 3). 0 heals the whole party.
 * @arg amount
 * @type number
 * @default 0
 * @desc HP to heal each body part by. 0 is a full recovery: broken parts are restored.
 *
 * @command ChangeArchetype
 * @desc Changes actor's body archetype (Reptilian, Mushroom, etc.)
 * @arg actorId
 * @type number
 * @min 1
 * @max 3
 * @default 1
 * @desc Actor ID (1, 2, or 3)
 * @arg archetypeName
 * @type string
 * @default Humanoid
 * @desc Name of the archetype (must match Archetypes key)
 *
 * @command CreateCreature
 * @desc Opens creature creator UI (archetype, battler, character sprite selection)
 * @arg actorId
 * @type number
 * @min 1
 * @max 3
 * @default 1
 * @desc Actor ID (1, 2, or 3)
 *
 */

(function () {
  // Plugin parameters - Handle both MV and MZ
  var pluginName = "Health_Core";
  var parameters = {};

  // Get parameters based on RPG Maker version
  if (Utils.RPGMAKER_NAME === "MZ") {
    parameters = PluginManager.parameters(pluginName);
  } else {
    // MV style
    var params = PluginManager.parameters(pluginName);
    parameters = params;
  }

  // Check if we're in MZ and load required window classes
  if (Utils.RPGMAKER_NAME === "MZ") {
    // In MZ, Window_StatusBase is required for actor-related drawing methods
    // Make sure it's loaded before creating our custom window
    if (!window.Window_StatusBase) {
      throw new Error(
        "Window_StatusBase is required for this plugin to work in RPG Maker MZ"
      );
    }
  }

  // Define body parts structure
  const { BodyParts } =
    window.Health;

  // Hit location groups for random targeting
  var HitLocations = {
    HEAD: {
      weight: 10,
      parts: [
        "HEAD",
        "BRAIN",
        "LEFT_EYE",
        "RIGHT_EYE",
        "NOSE",
        "LEFT_EAR",
        "RIGHT_EAR",
        "MOUTH",
        "TEETH",
      ],
    },
    TORSO: {
      weight: 40,
      parts: [
        "TORSO",
        "HEART",
        "LEFT_LUNG",
        "RIGHT_LUNG",
        "LIVER",
        "STOMACH",
        "SPLEEN",
        "INTESTINES",
      ],
    },
    LEFT_ARM: { weight: 15, parts: ["LEFT_ARM", "LEFT_HAND", "LEFT_FINGERS"] },
    RIGHT_ARM: {
      weight: 15,
      parts: ["RIGHT_ARM", "RIGHT_HAND", "RIGHT_FINGERS"],
    },
    LEFT_LEG: { weight: 10, parts: ["LEFT_LEG", "LEFT_FOOT", "LEFT_TOES"] },
    RIGHT_LEG: { weight: 10, parts: ["RIGHT_LEG", "RIGHT_FOOT", "RIGHT_TOES"] },
  };
  let i18nData = {};
  let i18nLoading = false;
  let i18nLoaded = false;

  const loadAllI18n = async () => {
    const categories = ["enemyArchetypes", "objectArchetypes", "equip"];
    const lang = ConfigManager.language || "en";
    
    const loadPromises = categories.map(async (category) => {
      const url = `js/i18n/${lang}/${category}.json`;
      try {
        const response = await fetch(url);
        i18nData[category] = await response.json();
        console.log(`Health_Core: Loaded ${category} i18n for ${lang}`);
      } catch (e) {
        console.error(`Health_Core: Failed to load ${category} i18n from ${url}`, e);
        i18nData[category] = {};
      }
    });

    await Promise.all(loadPromises);
    i18nLoaded = true;
  };

  const resolveI18nPath = (path, obj) => {
    if (!path || !obj) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  function getArchetypeText(key) {
    if (!key) return "";
    // If it doesn't look like a key, return as is
    if (typeof key === "string" && !key.includes('.')) return key;

    // Anatomy is named from more than one book: the archetypes below, and
    // BodyParts.json, whose wording lives in the ordinary i18n tree
    // (js/i18n/<lang>/bodyparts.json). Ask the resolver first so any keyed
    // data file is answered for, then fall back to the archetype banks.
    if (typeof T === "function" && T.has && T.has(key)) return T(key);

    if (i18nData.enemyArchetypes) {
      const localized = resolveI18nPath(key, i18nData.enemyArchetypes);
      if (localized) return localized;
    }
    // Object archetypes are a separate list with its own i18n file, but their
    // parts are named through the same keys, so one resolver answers for both.
    if (i18nData.objectArchetypes) {
      const localized = resolveI18nPath(key, i18nData.objectArchetypes);
      if (localized) return localized;
    }
    return key;
  }

  function getEquipText(key) {
    if (!key) return "";
    const lowerKey = key.toLowerCase();
    if (i18nData.equip) {
      return i18nData.equip[lowerKey] || key;
    }
    return key;
  }

  const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
  DataManager.isDatabaseLoaded = function() {
    if (!_DataManager_isDatabaseLoaded.call(this)) return false;
    if (!i18nLoaded) {
      if (!i18nLoading) {
        i18nLoading = true;
        loadAllI18n();
      }
      return false;
    }
    return true;
  };

  /**
   * Retrieves a translated property from a data object.
   * Updated to support i18n keys.
   */
  function getTranslated(dataObject, propertyName) {
    const val = dataObject[propertyName];
    if (val && typeof val === "string" && val.includes('.')) {
      return getArchetypeText(val);
    }
    const lang = ConfigManager.language;
    const langKey = `${propertyName}_${lang}`;
    return lang !== "en" && dataObject[langKey]
      ? dataObject[langKey]
      : dataObject[propertyName];
  }

  // ===========================================================================
  // Splicing anatomies
  // ===========================================================================
  //
  // A hybrid is built by merging its archetypes' parts. Most of the body merges
  // by key: two archetypes that each name a head make a creature with one head,
  // and the primary archetype's version of it is the one that stands.
  //
  // Limbs are the exception. Arms and hands are what a creature holds a weapon
  // with (window.HandSlots), and splicing something with arms onto something
  // else with arms makes a creature with four of them, not two. So a limb whose
  // key is already taken is kept ALONGSIDE the one already there, under a
  // numbered key: LEFT_ARM and LEFT_ARM_2, LEFT_HAND and LEFT_HAND_2. Any
  // number of them merges the same way, so a four-armed archetype spliced onto
  // a two-armed one comes out with six.
  //
  // i18n-ignore-start: body-part key tokens, matched against data, never shown
  const LIMB_TOKENS = new Set([
    "HAND", "HANDS", "ARM", "ARMS", "FOREARM", "CLAW", "CLAWS", "PINCER",
    "PINCERS", "TALON", "TALONS", "TENTACLE", "TENTACLES", "TENDRIL",
    "PSEUDOPOD", "APPENDAGE", "LIMB", "LIMBS", "VINE", "BRANCH", "WISP",
    "SPIRE", "GAUNTLET", "GRIPPER", "FINGER", "FINGERS",
  ]);
  // i18n-ignore-end

  function isLimbPartKey(partKey) {
    for (const token of String(partKey || "").toUpperCase().split("_")) {
      if (LIMB_TOKENS.has(token)) return true;
    }
    return false;
  }

  /**
   * The anatomy an archetype (or a spliced pair, or any longer list) comes to.
   * Every entry is a copy carrying `fromArchetype`, the index of the archetype
   * that brought it, and, on a duplicated limb, `limbCopy`, which is 2 for the
   * second left arm and counts up from there.
   */
  function mergeArchetypeParts(keys) {
    const { Archetypes } = window.Health || {};
    const merged = {};
    if (!Archetypes) return merged;
    if (typeof keys === "string") {
      keys = [keys];
    } else if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      if (keys._currentArchetype || (typeof keys.isActor === "function" && keys.isActor()) || (typeof keys.actorId === "function")) {
        keys = getActorArchetypeKeys(keys);
      } else if (Array.isArray(keys._creatureArchetypes)) {
        keys = keys._creatureArchetypes;
      } else {
        keys = Object.keys(keys);
      }
    }
    if (!Array.isArray(keys)) keys = [];
    keys.forEach((key, index) => {
      const entry = Archetypes[key];
      if (!entry || !entry.parts) return;
      for (const partKey in entry.parts) {
        const part = Object.assign({}, entry.parts[partKey], { fromArchetype: index });
        if (!merged[partKey]) {
          merged[partKey] = part;
          continue;
        }
        // The primary keeps every shared part that is not a limb.
        if (!isLimbPartKey(partKey)) continue;
        let copy = 2;
        while (merged[partKey + "_" + copy]) copy++;
        part.limbCopy = copy;
        merged[partKey + "_" + copy] = part;
      }
    });
    return merged;
  }

  /**
   * What a part is called on screen. A limb a splice gave the body a second of
   * is numbered, so "Left Arm" and "Left Arm 2" are told apart in the health
   * menu and in the equip screen.
   */
  function archetypePartName(part) {
    if (!part) return "";
    const base = getArchetypeText(part.name) || part.name || "";
    if (!part.limbCopy) return base;
    return T("HealthCore.limbCopy", { name: base, n: part.limbCopy });
  }

  /**
   * Whether a part is something the body can carry a weapon in. The flag lives
   * on the archetype (js/db/Health/Archetypes.json); a body part built before
   * the flag existed, or copied by something that did not carry it across, is
   * answered from the archetype the body was built out of. A numbered limb
   * (LEFT_ARM_2) asks about the limb it is a copy of.
   */
  function canPartHoldWeapon(actor, partKey, part) {
    const live = part || (actor && actor._bodyParts ? actor._bodyParts[partKey] : null);
    if (live && live.canHoldWeapon !== undefined) return !!live.canHoldWeapon;
    const { Archetypes } = window.Health || {};
    if (!Archetypes) return false;
    const base = String(partKey || "").replace(/_\d+$/, "");
    for (const key of getActorArchetypeKeys(actor)) {
      const entry = Archetypes[key];
      const source = entry && entry.parts && (entry.parts[partKey] || entry.parts[base]);
      if (source) return !!source.canHoldWeapon;
    }
    return false;
  }

  // ===========================================================================
  // What happens to a part that reaches zero
  // ===========================================================================
  //
  // Three words cover every difficulty, and which one applies is a fact about
  // the mode and about the part:
  //
  //   Broken     - every difficulty, Blood and Oil included. The limb is
  //                ruined and its stat penalty is on, but it is still attached
  //                and still the character's: rest, a potion or a spell mend
  //                it, and the penalty lifts the moment it is back above 1 HP.
  //                In Blood and Oil this is what a part that could have come
  //                off but did not gets: a blunt blow, or a lost coin toss.
  //   Cut off    - Blood and Oil, on a part the archetype says can come off
  //                (canCutoff), struck by Cutting damage. It leaves the body
  //                for good, taking its slot, its skills, its augment and
  //                whatever it was holding. Nothing mends it.
  //   Destroyed  - Blood and Oil, on a part that cannot be severed: a torso, a
  //                mouth, an eye socket. It stays where it is, at zero, ruined
  //                for the rest of the run. Its penalty never lifts, and it can
  //                no longer be used for anything - a destroyed mouth carries
  //                no weapon until a new one is grafted on.
  //
  // The penalty itself is applied on every difficulty (handleDamagedBodyPart);
  // only its permanence is Blood and Oil's doing.

  function isBloodAndOil() {
    return !!(window.$gameSystem && $gameSystem._bloodAndOilMode);
  }

  // ===========================================================================
  // What a weapon does to a body part
  // ===========================================================================
  // What an attack does to a body part:
  // A monster's limb can be cut by Explosive, Piercing and Cutting damage.
  // A party member's limb comes off only under Cutting (slashing) damage.
  // Blunt, Area, Abstract, None cannot sever limbs.
  // ===========================================================================
  const CUTTING_DAMAGE_TYPES = ["Explosive", "Piercing", "Cutting"];
  const PLAYER_CUTTING_DAMAGE_TYPES = ["Cutting"];

  function getActionDamageType(action, subject) {
    // The vector gun's Wide shots mode fans one shot across several parts, and
    // area damage is what spreads it: VectorGunSystem.js is the only place that
    // is decided.
    const s0 = subject || (action && action.subject ? action.subject() : null);
    if (window.VectorGun && window.VectorGun.damageTypeOverride) {
      const forced = window.VectorGun.damageTypeOverride(s0, action);
      if (forced) return forced;
    }
    if (action) {
      const item = typeof action.item === "function" ? action.item() : (action._item ? action.item() : null);
      if (item) {
        const dt = (item.meta && item.meta.DamageType) ||
          (item.note && (item.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        if (dt) return String(dt).trim();
      }
    }
    const s = subject || (action && action.subject ? action.subject() : (window.BattleManager ? BattleManager._subject : null));
    if (s && typeof s.weapons === "function") {
      const weapons = s.weapons() || [];
      for (const w of weapons) {
        if (w) {
          const wdt = (w.meta && w.meta.DamageType) ||
            (w.note && (w.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
          if (wdt) return String(wdt).trim();
        }
      }
    }
    return "Blunt";
  }

  function attackerCanCut(subject, action) {
    const act = action || (window.BattleManager ? BattleManager._action : null);
    const dt = getActionDamageType(act, subject);
    return CUTTING_DAMAGE_TYPES.includes(dt);
  }

  /** The stricter test a party member's body gets: only a slash severs. */
  function attackerCanCutPlayer(subject, action) {
    const act = action || (window.BattleManager ? BattleManager._action : null);
    const dt = getActionDamageType(act, subject);
    return PLAYER_CUTTING_DAMAGE_TYPES.includes(dt);
  }

  /**
   * What a part's penalty is worth right now. A limb that comes off the body
   * owes the archetype's full `amount`; one that is only broken owes the
   * smaller `brokenAmount` (a bruised arm is not an arm on the floor).
   */
  function statEffectAmount(statEffect, removed) {
    if (!statEffect) return 0;
    if (removed) return statEffect.amount || 0;
    return statEffect.brokenAmount !== undefined
      ? statEffect.brokenAmount
      : (statEffect.amount || 0);
  }

  /**
   * Whether a part comes off the body when it is finished, rather than being
   * ruined in place. Read off the live part when it carries the flag (bodies
   * built before it existed do not), otherwise off the archetype the body was
   * built out of, exactly as canPartHoldWeapon does.
   */
  function partCanCutoff(actor, partKey, part) {
    const live = part || (actor && actor._bodyParts ? actor._bodyParts[partKey] : null);
    if (live && live.canCutoff !== undefined) return !!live.canCutoff;
    const { Archetypes } = window.Health || {};
    if (!Archetypes) return false;
    const base = String(partKey || "").replace(/_\d+$/, "");
    for (const key of getActorArchetypeKeys(actor)) {
      const entry = Archetypes[key];
      const source = entry && entry.parts && (entry.parts[partKey] || entry.parts[base]);
      if (source) return !!source.canCutoff;
    }
    return false;
  }

  /** Is this part finished: at zero and marked, however it got there. */
  function isPartBroken(part) {
    return !!part && (part.damaged || part.destroyed || part.currentHp <= 0);
  }

  /**
   * The one word every screen prints over a finished part. Anything still
   * standing gets an empty string, so a caller can use it as the test as well
   * as the label.
   */
  function partStatusLabel(actor, partKey, part) {
    const live = part || (actor && actor._bodyParts ? actor._bodyParts[partKey] : null);
    if (!isPartBroken(live)) return "";
    if (!isBloodAndOil()) return T('HealthCore.statusBroken');
    // The part is still on the body, so it was not cut: either it cannot come
    // off at all (ruined where it stands) or the blow only broke it.
    if (live.ruined) {
      return live._brokenNotCut
        ? T('HealthCore.statusBroken')
        : T('HealthCore.statusDestroyed');
    }
    return T('HealthCore.statusBroken');
  }

  // ===========================================================================
  // What hangs off what
  // ===========================================================================
  //
  // A hand is on the end of an arm, and an arm that is cut off in Blood and Oil
  // takes the hand with it - along with the fingers on the end of that, and
  // whatever the hand was holding. Legs carry feet and toes the same way.
  // Sides are matched so a lost left arm never costs the right hand, and a limb
  // a splice gave the body a second of (LEFT_ARM_2) only answers for its own
  // hand (LEFT_HAND_2).
  // i18n-ignore-start: body-part key tokens, matched against data, never shown
  const LIMB_CHAINS = [
    [
      ["ARM", "ARMS"],
      ["FOREARM"],
      ["HAND", "HANDS", "CLAW", "CLAWS", "PINCER", "PINCERS", "GAUNTLET"],
      ["FINGER", "FINGERS", "DIGIT", "DIGITS", "TALON", "TALONS"]
    ],
    [
      ["LEG", "LEGS", "THIGH", "HAUNCH", "GREAVES"],
      ["SHIN", "KNEE", "CALF", "ANKLE"],
      ["FOOT", "FEET", "PAW", "PAWS", "HOOF", "HOOVES", "SOLE", "SOLES"],
      ["TOE", "TOES"]
    ]
  ];
  // A hand and a foot sit at the same depth in their chains, and that depth is
  // what an extremity is: the thing on the END of a limb rather than the limb
  // itself. Everything above it (an arm, a forearm, a thigh, a shin) is a
  // socket something can be grafted onto.
  const EXTREMITY_RANK = 2;
  const SIDE_TOKENS = ["LEFT", "RIGHT", "FRONT", "REAR", "HIND", "MID", "MIDDLE"];
  // i18n-ignore-end

  /** Which chain a key belongs to and how far down it sits, or null. */
  function limbChainRank(partKey) {
    const tokens = String(partKey || "").toUpperCase().replace(/_\d+$/, "").split("_");
    for (let chain = 0; chain < LIMB_CHAINS.length; chain++) {
      for (let rank = LIMB_CHAINS[chain].length - 1; rank >= 0; rank--) {
        if (LIMB_CHAINS[chain][rank].some(token => tokens.includes(token))) {
          return { chain, rank };
        }
      }
    }
    return null;
  }

  /** The side words in a key, so LEFT_ARM and LEFT_HAND are seen to match. */
  function limbSideOf(partKey) {
    const raw = String(partKey || "").toUpperCase();
    const copy = /_(\d+)$/.exec(raw);
    const tokens = raw.replace(/_\d+$/, "").split("_").filter(t => SIDE_TOKENS.includes(t));
    return tokens.join("_") + (copy ? "#" + copy[1] : "");
  }

  /**
   * Everything that comes off with this limb: the parts further down the same
   * chain, on the same side. An arm hands over its hand and its fingers, a leg
   * its foot and its toes, and a hand or a foot hands over the digits on the
   * end of it.
   *
   * A part the surgeon grafted somewhere unusual says where it went
   * (`attachedTo`), and that beats its name: a foot screwed onto a right arm
   * comes off with the arm, not with the leg it is named after. Those links are
   * followed through, so the toes on that foot go too.
   */
  function dependentPartKeys(actor, partKey) {
    const parts = (actor && actor._bodyParts) || {};
    if (!parts[partKey] && !limbChainRank(partKey)) return [];
    const seen = { [partKey]: true };
    const out = [];
    const queue = [partKey];
    while (queue.length) {
      const current = queue.shift();
      const from = limbChainRank(current);
      const side = limbSideOf(current);
      for (const key in parts) {
        if (seen[key] || !parts[key]) continue;
        const attached = parts[key].attachedTo;
        let follows;
        if (attached) {
          // Grafted onto something by hand: only that socket owns it.
          follows = attached === current;
        } else if (!from) {
          follows = false;
        } else {
          const rank = limbChainRank(key);
          follows = !!rank && rank.chain === from.chain && rank.rank > from.rank &&
            limbSideOf(key) === side;
        }
        if (!follows) continue;
        seen[key] = true;
        out.push(key);
        queue.push(key);
      }
    }
    return out;
  }

  // ===========================================================================
  // Sockets: what a hand or a foot can be grafted onto
  // ===========================================================================
  //
  // A hand is not something that can be stuck straight onto a torso. It goes on
  // the end of a limb, and so does a foot: to fit either, the patient needs a
  // limb with nothing on the end of it yet, and to grow a whole leg back the
  // surgeon fits the leg first and the foot after.
  //
  // Which limb is the patient's choice and nothing more. A left hand goes onto
  // a right arm perfectly well, a foot goes onto an arm, a hand goes onto a
  // leg, and somebody may walk out of the clinic with two right arms and a hand
  // where their shin used to end. What the socket cannot do is take two: one
  // limb, one extremity.

  /** A hand, a foot, a claw, a set of toes: anything past the limb itself. */
  function isExtremityKey(partKey) {
    const rank = limbChainRank(partKey);
    return !!rank && rank.rank >= EXTREMITY_RANK;
  }

  /**
   * Does fitting this need a bare limb to fit it to? Only what goes DIRECTLY
   * onto one does: a hand, a foot, a claw, a paw. Fingers and toes go on the
   * end of those rather than on the limb, and the clinic has never asked them
   * to wait for an arm, so they are left alone.
   */
  function needsLimbSocket(partKey) {
    const rank = limbChainRank(partKey);
    return !!rank && rank.rank === EXTREMITY_RANK;
  }

  /** An arm, a forearm, a leg, a thigh, a shin: something a hand or a foot goes on. */
  function isLimbSocketKey(partKey) {
    const rank = limbChainRank(partKey);
    return !!rank && rank.rank < EXTREMITY_RANK;
  }

  /**
   * The limbs on this body with nothing on the end of them, in the body's own
   * part order. One entry per limb, and it is the DEEPEST segment that is
   * offered: a goblin's hand goes on its forearm, not on its upper arm.
   */
  function openLimbSockets(actor) {
    const parts = (actor && actor._bodyParts) || {};
    const groupOf = (key) => {
      const rank = limbChainRank(key);
      return rank ? rank.chain + "|" + limbSideOf(key) : null;
    };
    const groups = new Map();

    // The deepest limb segment on each side is the one a graft goes onto.
    for (const key in parts) {
      const part = parts[key];
      if (!part || part.attachedTo) continue;
      const rank = limbChainRank(key);
      if (!rank || rank.rank >= EXTREMITY_RANK) continue;
      const id = rank.chain + "|" + limbSideOf(key);
      const group = groups.get(id) || { socketKey: null, socketRank: -1, taken: false };
      if (rank.rank > group.socketRank) { group.socketRank = rank.rank; group.socketKey = key; }
      groups.set(id, group);
    }

    // ...and it is spoken for once something is on the end of it. A grafted
    // part is counted against the socket it names rather than against the side
    // its own name suggests.
    for (const key in parts) {
      const part = parts[key];
      if (!part) continue;
      const rank = limbChainRank(key);
      if (!rank || rank.rank < EXTREMITY_RANK) continue;
      const id = part.attachedTo ? groupOf(part.attachedTo) : rank.chain + "|" + limbSideOf(key);
      const group = id && groups.get(id);
      if (group) group.taken = true;
    }

    const open = [];
    for (const group of groups.values()) {
      if (group.socketKey && !group.taken) open.push(group.socketKey);
    }
    // Back into the body's own order, so the clinic lists limbs the way every
    // other screen does.
    return Object.keys(parts).filter(key => open.includes(key));
  }

  // Initialize actor body parts.
  //
  // The anatomy is the actor's OWN archetype, not the humanoid one: a creature
  // party member (an NPCCreature recruit, or one built in the creature creator)
  // carries "Beast" or "Spider / Humanoid" on _currentArchetype, and filling it
  // with arms and legs it does not have would give it a human body in the
  // health menu and a human body's prosthetics in the shop. A hybrid takes
  // both halves' parts, its first archetype winning any key they share, which
  // is what applyHybridArchetype writes for a creature built in the wizard.
  // Anything with no archetype on file is a person, and gets the humanoid set
  // exactly as it always did.
  function initializeBodyParts(actor) {
    if (actor && !actor._bodyParts) {
      actor._bodyParts = {};
      actor._statModifiers = {};
      actor._removedPartDebuffs = {};

      const { Archetypes } = window.Health;
      const humanoid = Archetypes && Archetypes.Humanoid;
      const keys = getActorArchetypeKeys(actor);
      const sourceParts = mergeArchetypeParts(keys);
      // Hit locations come from the primary.
      let source = (Archetypes && Archetypes[keys[0]]) || humanoid;
      if (!Object.keys(sourceParts).length) {
        Object.assign(sourceParts, (humanoid && humanoid.parts) || {});
        source = humanoid;
      }
      // A part sculpted onto the body in the 3D creature editor
      // (CharacterCreation3DModel.js) REPLACES the archetype's own part in that
      // place: a dragon head dragged onto a goblin is a dragon head here too,
      // with the dragon's HP share and the dragon's vital flag. The record
      // lives on the actor, so rebuilding the body from its archetypes never
      // forgets what was grafted onto it.
      (actor._ccReplacedParts || []).forEach((key) => { delete sourceParts[key]; });
      Object.assign(sourceParts, actor._ccGraftedParts || {});

      for (const partKey in sourceParts) {
        const archetypePart = sourceParts[partKey];
        const hpPercentage = archetypePart.hpPercent / 100;

        actor._bodyParts[partKey] = {
          name: archetypePartName(archetypePart),
          maxHp: Math.round(actor.mhp * hpPercentage),
          currentHp: Math.round(actor.mhp * hpPercentage),
          vital: archetypePart.vital,
          damaged: false,
          equipSlot: archetypePart.equipSlot || null,
          multiple: archetypePart.multiple || false,
          statEffect: archetypePart.statEffect || null,
          damageMsg: getArchetypeText(archetypePart.msg) || null,
          brokenDamageMsg: getArchetypeText(archetypePart.brokenMsg) || null,
          appliedStatEffect: false,
          hpPercent: archetypePart.hpPercent,
          // What the body can hold a weapon in, which is what decides how many
          // weapon slots it has (ItemSystem/ItemSystemEquipment.js).
          canHoldWeapon: !!archetypePart.canHoldWeapon,
          // Whether the part comes off the body when it is finished, or is
          // only ever ruined where it stands (partStatusLabel).
          canCutoff: !!archetypePart.canCutoff,
          limbCopy: archetypePart.limbCopy || 0,
        };
      }

      // Hit locations come from the same archetype the parts did, and only for
      // parts this body actually has (changeArchetype applies the same rule).
      const hitSource = (source && source.hitLocations) ? source
                      : (humanoid && humanoid.hitLocations) ? humanoid : null;
      if (hitSource) {
        HitLocations = {};
        for (const locationKey in hitSource.hitLocations) {
          if (actor._bodyParts[locationKey]) {
            HitLocations[locationKey] = {
              weight: hitSource.hitLocations[locationKey].weight,
              parts: [locationKey],
            };
          }
        }
      }
    }
  }

  // ===========================================================================
  // Multi-skill body parts
  // A body part may grant more than one skill. A part's skillId can be either a
  // single number or an array of numbers. In addition, parts are granted extra
  // skills based on their type (Mouth, Hands, Eyes, Feet) so that any actor who
  // has that kind of body part gains the matching abilities.
  // ===========================================================================

  // Extra skills granted purely by the kind of body part, keyed off the part's
  // (language-independent) key. Matched by substring so Left/Right variants,
  // clusters, etc. are all covered.
  // Talking and wrestling are battle COMMANDS, not skills anybody learns
  // (BattleSystemEnhanchedCommands.js): both read the body themselves, so a
  // mouth grants spitting and a hand grants pushing, and nothing else.
  const PART_TYPE_BONUS_SKILLS = [
    { test: (k) => k.includes("MOUTH"), skills: [10] },
    { test: (k) => k.includes("HAND"), skills: [11] },
    { test: (k) => k.includes("EYE"), skills: [12] },
    { test: (k) => k.includes("FOOT") || k.includes("FEET"), skills: [8] },
  ];

  // Normalize a part.skillId value (number, array, 0, or undefined) into a clean
  // array of positive skill ids.
  function normalizeSkillIds(value) {
    if (Array.isArray(value)) {
      return value.filter((id) => typeof id === "number" && id > 0);
    }
    return typeof value === "number" && value > 0 ? [value] : [];
  }

  // Skills granted by a part's type, based on its key (e.g. "LEFT_HAND").
  function getPartTypeBonusSkills(partKey) {
    const k = String(partKey || "").toUpperCase();
    const out = [];
    for (const rule of PART_TYPE_BONUS_SKILLS) {
      if (rule.test(k)) {
        for (const id of rule.skills) if (!out.includes(id)) out.push(id);
      }
    }
    return out;
  }

  // Every skill id a part grants: its own skillId(s) plus type-based bonuses.
  function getPartSkillIds(part, partKey) {
    const ids = normalizeSkillIds(part && part.skillId);
    for (const id of getPartTypeBonusSkills(partKey)) {
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  // Ensure an actor has learned every skill granted by their (undamaged) body
  // parts. Idempotent: only learns skills that are missing. Scoped to the three
  // health-tracked actors (1, 2, 3).
  function ensureBodyPartSkills(actor) {
    if (!actor || typeof actor.actorId !== "function") return;
    const actorId = actor.actorId();
    if (actorId < 1 || actorId > 3) return;
    if (!actor._bodyParts) initializeBodyParts(actor);
    if (!actor._bodyParts) return;
    for (const partKey in actor._bodyParts) {
      const part = actor._bodyParts[partKey];
      if (!part || part.damaged) continue;
      for (const id of getPartSkillIds(part, partKey)) {
        if ($dataSkills && $dataSkills[id] && !actor.isLearnedSkill(id)) {
          actor.learnSkill(id);
        }
      }
    }
  }

  // Ensure body-part skills for every current party member.
  function ensureAllPartyBodyPartSkills() {
    if (!$gameParty) return;
    for (const actor of $gameParty.members()) ensureBodyPartSkills(actor);
  }

  // Every skill the actor owes to their anatomy: what their body parts grant
  // plus what their installed augments grant. Damaged parts count, because a
  // broken limb is still attached and its skill is still known; only a part
  // that leaves the body (blood and oil) takes its skill with it.
  function anatomySkillIds(actor) {
    const ids = new Set();
    if (!actor || !actor._bodyParts) return ids;
    for (const partKey in actor._bodyParts) {
      for (const id of getPartSkillIds(actor._bodyParts[partKey], partKey)) ids.add(id);
    }
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    if (ProstheticTypes && actor._prosthetics) {
      for (const partKey in actor._prosthetics) {
        const prosthetic = ProstheticTypes[actor._prosthetics[partKey]];
        if (prosthetic) for (const id of normalizeSkillIds(prosthetic.skill)) ids.add(id);
      }
    }
    return ids;
  }

  //---------------------------------------------------------------------------
  // Augments that change how fast a need drains
  //---------------------------------------------------------------------------
  // An augment may carry a `needs` block in ProstheticTypes.json, one entry per
  // need (hunger / sleep / hygiene / social / leisure), whose value multiplies
  // that need's drain: 1 is untouched, 0.6 is a slower burn, 0 never depletes
  // at all, and a NEGATIVE value turns the drain around so the need refills
  // (a skin that cleans itself). Several augments multiply together, and a
  // regenerating one wins the sign, so a self-cleaning dermis still works with
  // a scrubber fitted alongside it.
  function needDrainMultiplier(actor, needKey) {
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    if (!ProstheticTypes || !actor || !actor._prosthetics) return 1;
    let mult = 1;
    for (const partKey in actor._prosthetics) {
      const prosthetic = ProstheticTypes[actor._prosthetics[partKey]];
      const value = prosthetic && prosthetic.needs ? prosthetic.needs[needKey] : undefined;
      if (typeof value === "number") mult *= value;
    }
    return mult;
  }

  //---------------------------------------------------------------------------
  // Which augments a socket takes (name matching)
  //---------------------------------------------------------------------------
  // ProstheticCompatibility.json cannot name all 221 part keys the archetypes
  // grow, and should not have to: a wing is a wing whether the body calls it
  // LEFT_WING, WINGS or RIGHT_PROP. A part key is split into tokens and every
  // general part those tokens name contributes its list, so ARM_CANNON takes
  // both arm implants and gun mounts and TAIL_FIN takes both tail and fin ones.
  // An exact entry for the key itself (LEFT_EYE, TORSO, ...) is merged on top.
  // i18n-ignore-start: part-key tokens, matched against data, never shown
  const PART_FAMILY_TOKENS = {
    HEAD: ["HEAD", "SKULL", "CROWN", "FACE", "HELMET", "HAT", "CAP", "VISAGE"],
    BRAIN: ["BRAIN", "CEREBRUM", "MIND"],
    EYE: ["EYE", "EYES", "OCULUS", "OPTICS", "SIGHT"],
    EAR: ["EAR", "EARS"],
    NOSE: ["NOSE", "SNOUT", "NARES", "TRUNK"],
    MOUTH: ["MOUTH", "MAW", "BEAK", "TONGUE", "JAW", "JAWS", "MANDIBLE", "MANDIBLES", "LIPS", "VOCAL", "PROBOSCIS"],
    TEETH: ["TEETH", "TOOTH", "FANG", "FANGS", "TUSK", "TUSKS"],
    NECK: ["NECK", "COLLAR", "THROAT"],
    TORSO: ["TORSO", "BODY", "CHEST", "CHASSIS", "THORAX", "ABDOMEN", "CEPHALOTHORAX", "MASS", "FORM", "SEGMENT", "PILE", "BASE", "TRUNK", "HULL", "FRAME"],
    SHELL: ["SHELL", "CARAPACE", "PLATE", "PLATES", "PLATING", "CHESTPLATE", "PAULDRON", "GREAVES", "ARMOR", "MANTLE", "MEMBRANE", "RIBCAGE", "SPINE", "PELVIS", "SCALE", "SCALES", "HIDE", "ROBE", "LID", "SHIELD"],
    HEART: ["HEART"],
    LUNG: ["LUNG", "LUNGS", "GILL", "GILLS", "BELLOWS"],
    VISCERA: ["LIVER", "STOMACH", "SPLEEN", "INTESTINE", "INTESTINES", "KIDNEY", "KIDNEYS", "PANCREAS", "GUT", "BOWEL", "VEINS", "ENTRAILS"],
    GLAND: ["GLAND", "GLANDS", "SAC", "SACS", "BLADDER", "POUCH", "ORGAN", "RESERVOIR"],
    ARM: ["ARM", "ARMS", "FOREARM", "APPENDAGE", "LIMB", "LIMBS", "PSEUDOPOD", "SHOULDER", "ELBOW"],
    HAND: ["HAND", "HANDS", "FINGER", "FINGERS", "CLAW", "CLAWS", "PINCER", "PINCERS", "TALON", "TALONS", "DIGIT", "DIGITS", "GRIP"],
    LEG: ["LEG", "LEGS", "THIGH", "SHIN", "PAW", "PAWS", "HAUNCH", "JOINT", "JOINTS", "KNEE"],
    FOOT: ["FOOT", "FEET", "TOE", "TOES", "HOOF", "HOOVES", "SOLE", "SOLES"],
    WING: ["WING", "WINGS", "PINION", "PINIONS", "FEATHER", "FEATHERS", "PROP", "ROTOR"],
    TAIL: ["TAIL", "STINGER", "STINGERS", "FLAGELLUM", "SPINNERET", "SPINNERETS", "RUDDER"],
    TENTACLE: ["TENTACLE", "TENTACLES", "TENDRIL", "TENDRILS", "VINE", "VINES", "BRANCH", "ROOT", "ROOTS", "STALK", "STEM", "FEELER"],
    HORN: ["HORN", "HORNS", "SPIKE", "SPIKES", "SPINES", "SPIRE", "ANTLER", "ANTLERS", "THORN", "THORNS", "CREST", "BARB"],
    FIN: ["FIN", "FINS", "FLIPPER", "FLIPPERS", "FLUKE"],
    CORE: ["CORE", "NUCLEUS", "GEM", "CRYSTAL", "CRYSTALS", "HALO", "WISP", "FOCUS", "REACTOR", "ENGINE", "DRIVE", "DRIVES", "BATTERY", "CELL", "STITCH", "POWER"],
    WEAPON_MOUNT: ["CANNON", "BARREL", "GUN", "AMMO", "TURRET", "BOW", "LAUNCHER", "MUZZLE"],
    WHEEL: ["WHEEL", "WHEELS", "TREAD", "TREADS", "TRACK", "TRACKS", "ROTATION", "MECH", "GEAR", "GEARS", "AXLE"],
    SENSOR: ["SENSOR", "SENSORS", "ANTENNA", "ANTENNAE", "ARRAY", "RADAR", "SCANNER", "DISH", "WHISKERS"],
    HAIR: ["HAIR", "BEARD", "MANE", "FUR", "FRILL", "FLOWER", "PETAL", "PETALS", "BLOOM", "MOSS"],
    GENITALS: ["GENITALS", "GENITAL", "OVIPOSITOR", "CLOACA"]
  };
  // i18n-ignore-end

  let _familyByToken = null;
  function familyByToken() {
    if (_familyByToken) return _familyByToken;
    _familyByToken = {};
    for (const family in PART_FAMILY_TOKENS) {
      for (const token of PART_FAMILY_TOKENS[family]) {
        if (!_familyByToken[token]) _familyByToken[token] = [];
        _familyByToken[token].push(family);
      }
    }
    return _familyByToken;
  }

  // The general parts a concrete part key names, e.g. MID_REAR_LEFT_LEG -> LEG.
  function partFamilies(partKey) {
    const map = familyByToken();
    const out = [];
    for (const token of String(partKey || "").toUpperCase().split(/[^A-Z]+/)) {
      for (const family of (map[token] || [])) {
        if (!out.includes(family)) out.push(family);
      }
    }
    return out;
  }

  //---------------------------------------------------------------------------
  // Mobility and grip: what the anatomy is worth outside a fight
  //---------------------------------------------------------------------------
  // Body parts drove stat penalties, part skills, prosthetic sockets and the 3D
  // model's dismemberment, and nothing else in the game ever asked. A character
  // could lose both legs and still walk the map, sprint, drive and take a manual
  // job at full speed, because movement, work and the vehicles never read
  // `_bodyParts` at all.
  //
  // These two answer the question in the anatomy's own terms, so a quadruped
  // that has lost one of six legs is barely slowed and a biped that has lost one
  // of two is halved, without either caller having to know what shape the
  // character is. A fitted prosthetic counts as a working part, because
  // Health_ProstheticShop puts it into `_bodyParts` like any other.
  //
  // Both answer 1 for a character with no anatomy recorded, so nothing changes
  // for an actor the health system has never touched.
  function _familyShare(actor, family) {
    const parts = (actor && actor._bodyParts) || {};
    const severed = (actor && actor._severedParts) || {};
    let total = 0, working = 0;
    const seen = {};
    const count = (key, part) => {
      if (seen[key]) return;
      if (!partFamilies(key).includes(family)) return;
      seen[key] = true;
      total++;
      if (part && !isPartBroken(part)) working++;
    };
    for (const key in parts) count(key, parts[key]);
    for (const key in severed) count(key, null);
    if (total === 0) return 1;
    return working / total;
  }

  // How much of their legs a character still stands on, 0..1.
  function mobility(actor) {
    return _familyShare(actor, "LEG");
  }

  // How much of their arms and hands they still have, 0..1. What a two-handed
  // job, a steering wheel and a weapon all ask about.
  function grip(actor) {
    const arms = _familyShare(actor, "ARM");
    const hands = _familyShare(actor, "HAND");
    return Math.min(arms, hands);
  }

  // Every augment key this socket accepts: its own entry plus its families'.
  function implantsForPart(partKey) {
    const table = window.Health ? window.Health.ProstheticCompatibility : null;
    if (!table) return [];
    const out = [];
    const add = (list) => {
      for (const key of (list || [])) if (key && !out.includes(key)) out.push(key);
    };
    add(table[String(partKey || "").toUpperCase()]);
    for (const family of partFamilies(partKey)) add(table[family]);
    return out;
  }

  //---------------------------------------------------------------------------
  // Archetype identity and gestation
  //---------------------------------------------------------------------------
  // Every archetype in Archetypes.json declares how long one of its kind is
  // carried, as `pregnancyDuration` in game days. That figure is the only source
  // a pregnancy reads: a hybrid is carried for the median of its two archetypes'
  // terms, and mitosis is always over in a day, since a split is not a gestation.
  const DEFAULT_ARCHETYPE = "Humanoid";
  const MITOSIS_DURATION = 1;
  const REPRODUCTION_MITOSIS = 4;
  // Only reached when Archetypes has not loaded at all.
  const FALLBACK_PREGNANCY_DURATION = 270;

  // An actor's archetype is stored as "A" (one) or "A / B" (a hybrid), written
  // by changeArchetype below and by the creature builder. An actor that never
  // went through either is a plain humanoid.
  function getActorArchetypeKeys(actor) {
    // The spliced pair lives on _creatureArchetypes (what the creation wizard
    // and every archetype setter write); _currentArchetype only ever holds the
    // primary, so reading it alone silently threw the second half away and a
    // robot-spliced humanoid came out with a plain human anatomy. The legacy
    // "A / B" spelling is still understood for bodies written before the pair
    // was stored as a list.
    const pair = actor && actor._creatureArchetypes;
    if (Array.isArray(pair) && pair.length) {
      const list = [];
      for (const key of pair) {
        const one = String(key || "").trim();
        if (one && !list.includes(one)) list.push(one);
      }
      if (list.length) return list;
    }
    const stored = actor && actor._currentArchetype;
    const keys = String(stored || DEFAULT_ARCHETYPE)
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    return keys.length ? keys : [DEFAULT_ARCHETYPE];
  }

  // The i18n bank is keyed by the lower-cased archetype id.
  function getArchetypeDisplayName(key) {
    if (!key) return "";
    const text = getArchetypeText(
      "enemyArchetypes." + String(key).toLowerCase() + ".name"
    );
    return text && !text.includes(".") ? text : String(key);
  }

  //---------------------------------------------------------------------------
  // Object archetypes
  //---------------------------------------------------------------------------
  // ObjectArchetypes.json is a SEPARATE list from Archetypes.json and is
  // deliberately never merged into it: a chair has no class, no creature class,
  // no gestation and no anatomy skills, so it is never offered by the creature
  // archetype selector nor dealt to anything that breeds. Its parts carry HP
  // alone; whatever the object can do belongs to the archetype's own `skills`.
  function getObjectArchetypes() {
    return (window.Health && window.Health.ObjectArchetypes) || {};
  }

  function getObjectArchetypeKeys() {
    return Object.keys(getObjectArchetypes());
  }

  function getObjectArchetype(key) {
    return getObjectArchetypes()[key] || null;
  }

  function getObjectArchetypeDisplayName(key) {
    if (!key) return "";
    const text = getArchetypeText(
      "objectArchetypes." + String(key).toLowerCase() + ".name"
    );
    return text && !text.includes(".") ? text : String(key);
  }

  function getArchetypePregnancyDuration(key) {
    const { Archetypes } = window.Health || {};
    const entry = Archetypes && Archetypes[key];
    const days = entry ? Number(entry.pregnancyDuration) : 0;
    return days > 0 ? days : 0;
  }

  // Days one pregnancy of this actor runs for. Pass the actor's reproduction
  // type so mitosis can take its day.
  function getPregnancyDuration(actor, reproductionType) {
    if (reproductionType === REPRODUCTION_MITOSIS) return MITOSIS_DURATION;
    const terms = getActorArchetypeKeys(actor)
      .map(getArchetypePregnancyDuration)
      .filter((d) => d > 0);
    if (!terms.length) {
      return (
        getArchetypePregnancyDuration(DEFAULT_ARCHETYPE) ||
        FALLBACK_PREGNANCY_DURATION
      );
    }
    const sorted = terms.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median =
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.max(1, Math.round(median));
  }

  // Change actor's archetype to a different body structure
  function changeArchetype(actor, archetypeName) {
    if (!actor) return false;

    // Get Archetypes from ProstheticsData
    const { Archetypes } = window.Health;

    if (!Archetypes || !Archetypes[archetypeName]) {
      console.warn(`Archetype "${archetypeName}" not found in Archetypes`);
      return false;
    }

    const archetype = Archetypes[archetypeName];

    // Clear existing stat modifiers
    if (actor._statModifiers) {
      for (const param in actor._statModifiers) {
        actor._statModifiers[param] = 0;
      }
    } else {
      actor._statModifiers = {};
    }

    // Clear removed parts debuffs
    actor._removedPartDebuffs = {};
    // A new body is a whole body: nothing is missing off it yet.
    actor._severedParts = {};

    // Initialize new body parts from archetype
    actor._bodyParts = {};
    actor._currentArchetype = archetypeName;
    // A whole new body is built from this archetype alone: the spliced pair is
    // rewritten with it, never left behind for getActorArchetypeKeys to find.
    actor._creatureArchetypes = [archetypeName];

    for (const partKey in archetype.parts) {
      const archetypePart = archetype.parts[partKey];
      const hpPercentage = archetypePart.hpPercent / 100;

      actor._bodyParts[partKey] = {
        name: getArchetypeText(archetypePart.name),
        maxHp: Math.round(actor.mhp * hpPercentage),
        currentHp: Math.round(actor.mhp * hpPercentage),
        vital: false, // Players don't have vital parts that cause instant death
        damaged: false,
        canCutoff: archetypePart.canCutoff || false,
        statEffect: archetypePart.statEffect || null,
        damageMsg: getArchetypeText(archetypePart.msg),
        brokenDamageMsg: getArchetypeText(archetypePart.brokenMsg),
        specialEffect: archetypePart.specialEffect || null,
        appliedStatEffect: false,
        canHoldWeapon: !!archetypePart.canHoldWeapon,
        // Part-granted skill(s): number or array of numbers. Stored so
        // ensureBodyPartSkills() teaches the archetype's thematic abilities.
        skillId: archetypePart.skillId || [],
      };
    }

    // Update HitLocations to match archetype
    if (archetype.hitLocations) {
      HitLocations = {};
      for (const locationKey in archetype.hitLocations) {
        HitLocations[locationKey] = {
          weight: archetype.hitLocations[locationKey].weight,
          parts: [locationKey] // Each location maps to itself as the main part
        };
      }
    }

    // Set game variable for reproduction based on actor ID
    // Actor 1 = Variable 87, Actor 2 = Variable 115, Actor 3 = Variable 116
    if ($gameVariables) {
      var reproductionValue = archetype.reproduction !== undefined ? archetype.reproduction : 0;
      var actorId = actor.actorId();
      if (actorId === 1) {
        $gameVariables.setValue(87, reproductionValue);
      } else if (actorId === 2) {
        $gameVariables.setValue(115, reproductionValue);
      } else if (actorId === 3) {
        $gameVariables.setValue(116, reproductionValue);
      }
    }

    // Clear all learned skills and add archetype's base skills
    if (archetype.skills && archetype.skills.length > 0) {
      // Clear all current skills by removing them
      const currentSkills = actor.skills().slice(); // Create a copy of current skills
      currentSkills.forEach(skillId => {
        actor.forgetSkill(skillId);
      });

      // Learn all base skills from the archetype
      archetype.skills.forEach(skillId => {
        if ($dataSkills[skillId]) {
          actor.learnSkill(skillId);
        }
      });

      console.log(`Changed archetype to ${archetypeName}. Cleared skills and added skills:`, archetype.skills);
    }

    // Grant type-based body-part skills (Mouth/Hands/Eyes/Feet) for the new body.
    ensureBodyPartSkills(actor);

    // Refresh actor parameters to apply any changes
    actor.refresh();

    return true;
  }
  // Get a random hit location based on weights
  function getRandomHitLocation() {
    var totalWeight = 0;
    var locations = [];

    for (var loc in HitLocations) {
      totalWeight += HitLocations[loc].weight;
      locations.push({
        name: loc,
        weight: HitLocations[loc].weight,
        cumulative: totalWeight,
      });
    }

    var roll = Math.random() * totalWeight;

    for (var i = 0; i < locations.length; i++) {
      if (roll <= locations[i].cumulative) {
        return HitLocations[locations[i].name];
      }
    }

    return HitLocations.TORSO; // Default to torso if something goes wrong
  }

  // Select random body parts from a hit location
  function selectRandomBodyParts(hitLocation, count) {
    var parts = hitLocation.parts.slice();
    var selected = [];

    // Shuffle the parts array
    for (var i = parts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = parts[i];
      parts[i] = parts[j];
      parts[j] = temp;
    }

    // Select the first 'count' parts or all if there are fewer
    for (var i = 0; i < Math.min(count, parts.length); i++) {
      selected.push(parts[i]);
    }

    return selected;
  }

  // Take the augment installed on a part off with the part. Returns the name of
  // what was lost, so the caller can report it, or "" when the socket was bare.
  function removeImplantWithPart(actor, partKey) {
    if (!actor._prosthetics || !actor._prosthetics[partKey]) return "";
    const prostheticKey = actor._prosthetics[partKey];
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    const prosthetic = ProstheticTypes ? ProstheticTypes[prostheticKey] : null;
    let name = "";
    if (prosthetic) {
      name = ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en;
      if (prosthetic.effects) {
        for (const paramId in prosthetic.effects) {
          if (actor._prostheticEffects && actor._prostheticEffects[paramId]) {
            actor._prostheticEffects[paramId] -= prosthetic.effects[paramId];
            if (actor._prostheticEffects[paramId] === 0) delete actor._prostheticEffects[paramId];
          }
        }
      }
      for (const sid of normalizeSkillIds(prosthetic.skill)) actor.forgetSkill(sid);
    }
    delete actor._prosthetics[partKey];
    return name || "";
  }

  /**
   * Forget what a part granted, but only what nothing else still grants.
   *
   * A part's own skills leave with it. The skills it granted for being the KIND
   * of part it is (a mouth spits, a hand pushes, a foot kicks) are shared with
   * every other part of that kind, so they only go when the last one does: a
   * one-handed character can still push, and the kick goes with the second foot
   * rather than the first. A prosthetic counts as a part for this, and a limb
   * ruined in Blood and Oil counts for nothing.
   */
  function anatomyKeptSkills(actor, skipPartKey, skipProstheticKey) {
    const kept = new Set();
    const parts = (actor && actor._bodyParts) || {};
    for (const key in parts) {
      if (key === skipPartKey) continue;
      const other = parts[key];
      if (!other || other.ruined) continue;
      for (const id of getPartSkillIds(other, key)) kept.add(id);
    }
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    if (ProstheticTypes && actor && actor._prosthetics) {
      for (const key in actor._prosthetics) {
        if (key === skipProstheticKey) continue;
        const prosthetic = ProstheticTypes[actor._prosthetics[key]];
        if (prosthetic) for (const id of normalizeSkillIds(prosthetic.skill)) kept.add(id);
      }
    }
    return kept;
  }

  function forgetPartSkills(actor, part, partKey) {
    const losing = getPartSkillIds(part, partKey);
    if (!losing.length || !actor) return;
    const kept = anatomyKeptSkills(actor, partKey, partKey);
    for (const id of losing) {
      if (!kept.has(id)) actor.forgetSkill(id);
    }
  }

  /**
   * The same rule for an augment pulled on its own: what it taught goes with
   * it, unless the body still owes that skill to a part it kept. The limb it
   * was fitted to stays on, so it counts among what is kept.
   */
  function forgetProstheticSkills(actor, partKey) {
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    const key = actor && actor._prosthetics ? actor._prosthetics[partKey] : null;
    const prosthetic = ProstheticTypes && key ? ProstheticTypes[key] : null;
    if (!prosthetic) return;
    const losing = normalizeSkillIds(prosthetic.skill);
    if (!losing.length) return;
    const kept = anatomyKeptSkills(actor, null, partKey);
    for (const id of losing) {
      if (!kept.has(id)) actor.forgetSkill(id);
    }
  }

  /**
   * Which pieces of the body a skill is owed to, by name: what the skills menu
   * prints so a move that came with a claw, a mouth or a grafted augment says
   * where it came from. A damaged part still counts, because it is still on the
   * body and still teaching; a ruined one does not.
   */
  function skillSourcePartNames(actor, skillId) {
    const names = [];
    const id = Number(skillId);
    if (!actor || !id) return names;
    const push = (name) => {
      if (name && !names.includes(name)) names.push(name);
    };
    const parts = actor._bodyParts || {};
    for (const partKey in parts) {
      const part = parts[partKey];
      if (!part || part.ruined) continue;
      if (getPartSkillIds(part, partKey).includes(id)) {
        push(part.name || archetypePartName({ name: partKey }));
      }
    }
    const ProstheticTypes = window.Health ? window.Health.ProstheticTypes : null;
    if (ProstheticTypes && actor._prosthetics) {
      for (const partKey in actor._prosthetics) {
        const prosthetic = ProstheticTypes[actor._prosthetics[partKey]];
        if (!prosthetic) continue;
        if (!normalizeSkillIds(prosthetic.skill).includes(id)) continue;
        const pName = ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en;
        push(pName || getArchetypeText(prosthetic.name_int)
             || (parts[partKey] && parts[partKey].name) || "");
      }
    }
    return names;
  }

  /**
   * Remember that a limb is not on the body any more. The anatomy itself drops
   * the part - it is gone, and nothing in the health menu should offer to mend
   * it - but a portrait has to be told, or the model keeps drawing an arm that
   * came off two fights ago.
   */
  function markPartMissing(actor, partKey) {
    if (!actor) return;
    if (!actor._severedParts) actor._severedParts = {};
    actor._severedParts[partKey] = true;
  }

  /**
   * What every 3D portrait is shown: the parts the body still has, at whatever
   * HP they are on, plus the ones it no longer has at all. Battler3D's
   * hideBrokenParts reads `destroyed` / `currentHp`, and a limb that is off the
   * body has neither unless it is put back on the list here.
   */
  function partStates(actor) {
    const states = {};
    const parts = (actor && actor._bodyParts) || {};
    for (const key in parts) {
      if (parts[key]) states[key] = parts[key];
    }
    const severed = (actor && actor._severedParts) || {};
    for (const key in severed) {
      if (severed[key] && !states[key]) states[key] = { destroyed: true, currentHp: 0, maxHp: 1 };
    }
    return states;
  }

  /**
   * A limb this character simply does not have: a monster that joins the party
   * still missing what a fight took off it, and never grows back. The penalty
   * it owes stands for good, its skills are not this character's, and anything
   * further down the limb goes with it.
   */
  function loseBodyPart(actor, partKey) {
    if (!actor || !actor._bodyParts) return;
    const part = actor._bodyParts[partKey];
    if (!part) { markPartMissing(actor, partKey); return; }

    dependentPartKeys(actor, partKey).forEach(function (childKey) {
      loseBodyPart(actor, childKey);
    });

    if (part.statEffect && part.statEffect.param !== 0) {
      const paramId = part.statEffect.param;
      const full = statEffectAmount(part.statEffect, true);
      if (!actor._statModifiers) actor._statModifiers = {};
      // The part may already owe its broken penalty (it was ruined before it
      // came off). Only the difference up to the full amount is added, never the
      // whole penalty twice.
      const owed = part.appliedStatEffect
        ? full - statEffectAmount(part.statEffect, false)
        : full;
      actor._statModifiers[paramId] = (actor._statModifiers[paramId] || 0) + owed;
      if (!actor._removedPartDebuffs) actor._removedPartDebuffs = {};
      actor._removedPartDebuffs[partKey] = { param: paramId, amount: full };
    }

    forgetPartSkills(actor, part, partKey);

    releaseEquipmentForPart(actor, partKey);
    markPartMissing(actor, partKey);
    delete actor._bodyParts[partKey];
  }

  /**
   * Hand back whatever a part was carrying. Only the equipment layer knows
   * which slot a given hand (or mouth) answers for, so it is asked; if it is
   * not loaded yet nothing is held and there is nothing to give back.
   */
  function releaseEquipmentForPart(actor, partKey) {
    const HS = window.HandSlots;
    if (HS && HS.releaseSlotForPart) {
      try { HS.releaseSlotForPart(actor, partKey); } catch (e) { /* equip layer not up */ }
    }
  }

  /**
   * Blood and Oil, on a part that cannot be severed: it stays on the body and
   * is finished where it stands. Its penalty is already on (handleDamagedBodyPart
   * ran first); what this adds is permanence. The skills it granted are gone,
   * it can no longer be used for anything - a destroyed mouth carries no
   * weapon - and no amount of rest or healing brings it back.
   */
  function destroyPartInPlace(actor, partKey) {
    var part = actor._bodyParts[partKey];
    if (!part || part.ruined) return;
    part.currentHp = 0;
    part.damaged = true;
    part.ruined = true;
    // A part that COULD have come off and did not was merely broken by this
    // blow; one that can never come off is ruined where it stands. The two read
    // differently on every screen and in the log.
    part._brokenNotCut = partCanCutoff(actor, partKey, part);

    forgetPartSkills(actor, part, partKey);

    // Whatever hung off it is finished with it, each on its own terms.
    dependentPartKeys(actor, partKey).forEach(function (childKey) {
      const child = actor._bodyParts[childKey];
      if (!child || child.ruined) return;
      if (!child.damaged) {
        child.currentHp = 0;
        child.damaged = true;
        handleDamagedBodyPart(actor, childKey);
      }
      if (partCanCutoff(actor, childKey, child)) removeBodyPartOnZeroHp(actor, childKey);
      else destroyPartInPlace(actor, childKey);
    });

    releaseEquipmentForPart(actor, partKey);

    var purpleName = "\c[25]" + part.name + "\c[0]";
    reportPartLoss(T(part._brokenNotCut ? 'HealthCore.partBroken' : 'HealthCore.partRuined',
                     { actor: actor.name(), part: purpleName }));
    actor.refresh();
  }

  /**
   * A part has reached zero in Blood and Oil. A vital one kills, one the body
   * can shed is cut off, and anything else is ruined where it stands.
   */
  /**
   * Blood and Oil is the only mode where a party member's part can leave the
   * body, and even there it is a coin toss: half the time the blow takes the
   * part off (the archetype's msg, the part gone and its full penalty owed),
   * half the time it only breaks it where it stands (brokenMsg, the smaller
   * penalty). A part the archetype says cannot come off is never cut, and
   * only Cutting damage ever takes one off a party member.
   */
  function rollPartCutoff(actor, partKey, part, action) {
    if (!isBloodAndOil()) return false;
    if (!partCanCutoff(actor, partKey, part)) return false;
    if (!attackerCanCutPlayer(null, action)) return false;
    return Math.random() < 0.5;
  }

  /**
   * What Blood and Oil makes of a part at zero. A part that came off is gone;
   * a part that cannot come off is destroyed where it stands for the rest of
   * the run. A part that COULD have come off and did not is only broken,
   * exactly as on every other difficulty, and heals like one.
   */
  function finishPartInBloodAndOil(actor, partKey) {
    const part = actor._bodyParts ? actor._bodyParts[partKey] : null;
    if (!part) return;
    if (part.vital || part._cutOff) {
      removeBodyPartOnZeroHp(actor, partKey);
    } else if (!partCanCutoff(actor, partKey, part)) {
      destroyPartInPlace(actor, partKey);
    }
  }

  // Remove a body part entirely from the actor and apply a permanent stat debuff
  function removeBodyPartOnZeroHp(actor, partKey) {
    var part = actor._bodyParts[partKey];
    if (!part) return;

    if (part.vital) {
      // Vital organ check
      actor.die();
      actor.refresh();
      $gameParty.removeActor(actor.actorId());
      var purplePartName = "\\c[25]" + part.name + "\\c[0]";
      var msg = T('HealthCore.vitalOrganDestroyed', { actor: actor.name(), part: purplePartName });
      if ($gameParty.inBattle() && BattleManager._logWindow) {
        BattleManager._logWindow.push("addText", msg);
      } else {
        $gameMessage.add(msg);
      }
      if ($gameParty.members().length === 0) {
        SceneManager.goto(Scene_Gameover);
      }
      return;
    }

    // Recursively handle child parts first
    if (part.childParts && part.childParts.length > 0) {
      // Create a copy of childParts array to avoid issues while deleting keys
      var children = part.childParts.slice();
      children.forEach(function (childKey) {
        if (actor._bodyParts[childKey]) {
          removeBodyPartOnZeroHp(actor, childKey);
        }
      });
    }

    // An arm does not come off and leave its hand hanging in the air. Whatever
    // is further down the limb goes with it, and each of those parts is severed
    // in its own right, so their penalties, skills and augments are accounted
    // for exactly as this one's are.
    dependentPartKeys(actor, partKey).forEach(function (childKey) {
      removeBodyPartOnZeroHp(actor, childKey);
    });

    // The limb is about to be gone, so what it was holding is handed back now,
    // while the slot list still says which slot was its. Once the part is off
    // the body the hands renumber and the wrong weapon would be the one to go.
    releaseEquipmentForPart(actor, partKey);

    // Apply the permanent stat effect/debuff to actor._statModifiers if not already applied
    if (part.statEffect) {
      var paramId = part.statEffect.param;
      var amount = part.statEffect.amount;
      if (paramId !== 0) { // Exclude max HP from standard statModifiers
        if (!actor._statModifiers[paramId]) {
          actor._statModifiers[paramId] = 0;
        }
        // A part that leaves the body owes the archetype's full amount. If it was
        // already broken it owes only the difference on top of brokenAmount.
        const fullAmount = statEffectAmount(part.statEffect, true);
        actor._statModifiers[paramId] += part.appliedStatEffect
          ? fullAmount - statEffectAmount(part.statEffect, false)
          : fullAmount;
        part.appliedStatEffect = true;
        
        // Also save this in a dedicated object so we know which part caused what debuff
        if (!actor._removedPartDebuffs) {
          actor._removedPartDebuffs = {};
        }
        actor._removedPartDebuffs[partKey] = {
          param: paramId,
          amount: amount
        };
      }
    }

    // Forget what the part granted: its own skills always, and the ones it
    // granted for being a mouth, a hand, an eye or a foot once it was the last
    // of its kind on the body (forgetPartSkills).
    forgetPartSkills(actor, part, partKey);

    // An augment goes with the part it was installed on: the limb is off the
    // body (blood and oil), so its stat bonus, its skills and the record itself
    // all leave with it. A merely broken part keeps everything, which is why
    // this lives here and not in handleDamagedBodyPart.
    var lostImplant = removeImplantWithPart(actor, partKey);

    // Delete the body part from the actor's body parts map. The key is kept on
    // a separate register: the anatomy no longer has the limb, but the 3D
    // portrait still has to know not to draw it (partStates).
    markPartMissing(actor, partKey);
    delete actor._bodyParts[partKey];
    actor.refresh();

    // Display a message that the limb/organ was destroyed/removed
    var purplePartName2 = "\\c[25]" + part.name + "\\c[0]";
    var msg = T('HealthCore.partDestroyed', { actor: actor.name(), part: purplePartName2 });
    reportPartLoss(msg);
    if (lostImplant) {
      reportPartLoss(T('HealthCore.augmentLost', {
        actor: actor.name(),
        augment: "\\c[25]" + lostImplant + "\\c[0]"
      }));
    }
  }

  // Losing a part is announced in the battle log mid-fight and in a message box
  // otherwise; an augment torn off with it is announced the same way.
  function reportPartLoss(msg) {
    if ($gameParty.inBattle() && BattleManager._logWindow) {
      BattleManager._logWindow.push("addText", msg);
    } else {
      $gameMessage.add(msg);
    }
  }

  // Calculate damage to a body part
  function applyDamageToBodyPart(actor, partKey, damage, action) {
    var part = actor._bodyParts[partKey];

    if (!part || part.damaged) return 0;

    // Check if actor has more than 60% health, keep limbs at minimum 1hp if so
    var healthPercentage = actor.hp / actor.mhp;
    if (healthPercentage > 0.6) {
      var appliedDamage = Math.min(part.currentHp - 1, damage);
      if (appliedDamage <= 0) return 0;

      part.currentHp -= appliedDamage;
      return appliedDamage;
    } else {
      // Normal damage application if health is 60% or lower
      var appliedDamage = Math.min(part.currentHp, damage);
      part.currentHp -= appliedDamage;

      // Check if the part is now completely damaged
      if (part.currentHp <= 0) {
        part.damaged = true;
        // Decided before the wound is announced: the log prints the archetype's
        // msg for a part that comes off and its brokenMsg for one that stays.
        part._cutOff = !part.vital && rollPartCutoff(actor, partKey, part, action);
        handleDamagedBodyPart(actor, partKey);

        // --- Blood and Oil mode check ---
        // Only here can a finished part be permanent: cut off on a won coin
        // toss under a slash, destroyed where it stands if the body can never
        // shed it. Anything else, here as on every other difficulty, is merely
        // broken and mends (healBodyParts).
        if (isBloodAndOil()) {
          if (part.vital) {
            // Vital organ check
            actor.die();
            actor.refresh();
            $gameParty.removeActor(actor.actorId());
            var purpleVitalName = "\\c[25]" + part.name + "\\c[0]";
            var msg = T('HealthCore.vitalOrganDestroyed', { actor: actor.name(), part: purpleVitalName });
            if ($gameParty.inBattle() && BattleManager._logWindow) {
              BattleManager._logWindow.push("addText", msg);
            } else {
              $gameMessage.add(msg);
            }
            if ($gameParty.members().length === 0) {
              if (window.SaveSystem && window.SaveSystem.triggerGameOver) {
                window.SaveSystem.triggerGameOver();
              } else {
                SceneManager.goto(Scene_Gameover);
              }
            }
          } else {
            finishPartInBloodAndOil(actor, partKey);
          }
        }
      }

      return appliedDamage;
    }
  }

  // A wound dealt outside a fight: a field surgery that went wrong. Unlike a
  // blow in battle it is not blunted by the "hold limbs at 1 HP while the body
  // is above 60% health" rule, since the knife is already inside. What happens
  // when the part reaches zero is still Blood and Oil's decision: on every
  // other difficulty it is ruined but attached, and keeps its augment.
  // Returns the damage actually dealt.
  function injureBodyPart(actor, partKey, amount, options) {
    const part = actor && actor._bodyParts ? actor._bodyParts[partKey] : null;
    if (!part || part.damaged) return 0;
    const applied = Math.max(0, Math.min(part.currentHp, Math.round(amount || 0)));
    if (applied <= 0) return 0;
    part.currentHp -= applied;
    if (part.currentHp > 0) {
      actor.refresh();
      return applied;
    }
    part.damaged = true;
    // An edge was used on it: a scalpel counts as a slash, a grapple does not.
    // Only an edge takes a part off a party member, here as in battle.
    part._cutOff = !part.vital && !!(options && options.cut) &&
      isBloodAndOil() && partCanCutoff(actor, partKey, part);
    handleDamagedBodyPart(actor, partKey);
    if (isBloodAndOil()) {
      // Severs the part (with its augment), ruins it where it stands if the
      // body cannot shed it, or kills outright on a vital one.
      finishPartInBloodAndOil(actor, partKey);
    }
    actor.refresh();
    return applied;
  }

  // Apply stat effect for a fully damaged part
  function applyStatEffect(actor, partKey) {
    var part = actor._bodyParts[partKey];

    if (part.appliedStatEffect || !part.statEffect) return;

    // Apply the stat effect from the part's statEffect property. A part that is
    // only broken costs the smaller brokenAmount; the archetype's full amount is
    // what a part LEAVING the body costs, and that is read where it comes off
    // (removeBodyPartOnZeroHp / loseBodyPart).
    var paramId = part.statEffect.param;
    var amount = statEffectAmount(part.statEffect, false);

    // Track the stat modifier
    if (!actor._statModifiers[paramId]) {
      actor._statModifiers[paramId] = 0;
    }
    actor._statModifiers[paramId] += amount;

    // Mark as applied
    part.appliedStatEffect = true;

    // Refresh actor to apply stat changes
    actor.refresh();
  }

  // ===========================================================================
  // What a creature's own body is worth
  // ===========================================================================
  //
  // A person's stats are their class's: two arms and a head are what a human is
  // expected to have, so a whole humanoid body adds nothing and only what is
  // LOST (or fitted in the prosthetic shop) ever moves their numbers.
  //
  // A creature is built out of whatever parts it was given - four legs, a tail,
  // a second head, a pair of wings - and those parts ARE its stats. Every part
  // it has grants what that part is worth (the archetype's statEffect read the
  // other way round: a limb worth -3 DEX when it comes off is worth +3 DEX
  // while it is on), on top of its class. Losing one takes the grant with it
  // through the ordinary penalty, so the two never double up.
  //
  // Read live from the body, so the answer is the same whether the creature was
  // built in character creation, grafted in the 3D editor, recruited out of the
  // NPC system or had a part cut off five minutes ago.

  function isCreatureBody(actor) {
    if (!actor) return false;
    if (actor._isCreatureActor) return true;
    const NC = window.NPCCreature;
    return !!(NC && NC.isNonSentientActor && NC.isNonSentientActor(actor));
  }

  function creatureAnatomyBonus(actor, paramId) {
    if (paramId === 0 || !isCreatureBody(actor) || !actor._bodyParts) return 0;
    let total = 0;
    for (const key in actor._bodyParts) {
      const part = actor._bodyParts[key];
      if (!part || !part.statEffect) continue;
      if (part.statEffect.param !== paramId) continue;
      // A part that is off the body, ruined or broken is not granting anything.
      if (part.ruined || part.damaged || part.currentHp <= 0) continue;
      total -= part.statEffect.amount || 0;
    }
    return total;
  }

  // Get parameter name for display
  function getParamName(paramId) {
    return T.list('HealthCore.paramNames')[paramId] || T('HealthCore.statFallback');
  }

  /**
   * The line a wound prints. A part that stays on the body reads its brokenMsg
   * ("Left Arm broken!"); one that is coming off reads the archetype's msg
   * ("Left Arm severed!"). Bodies built before brokenMsg existed fall back to
   * the msg they have.
   */
  function partWoundMsg(part) {
    if (!part) return "";
    const msg = part._cutOff
      ? (part.damageMsg || part.brokenDamageMsg)
      : (part.brokenDamageMsg || part.damageMsg);
    return msg || T('HealthCore.partDamagedFallback', { part: part.name });
  }

  // Handle effects of a damaged body part
  function handleDamagedBodyPart(actor, partKey) {
    var part = actor._bodyParts[partKey];

    // Apply stat effect if part has one and not already applied
    // But exclude any effects on max HP (param 0)
    if (
      !part.appliedStatEffect &&
      part.statEffect &&
      part.statEffect.param !== 0
    ) {
      applyStatEffect(actor, partKey);
    }

    // Unequip items if an equip slot is affected
    /*
    if (part.equipSlot) {
      unequipItemFromSlot(actor, part.equipSlot);
    }*/

    // Mark all child parts as damaged
    if (part.childParts && part.childParts.length > 0) {
      part.childParts.forEach(function (childKey) {
        if (actor._bodyParts[childKey] && !actor._bodyParts[childKey].damaged) {
          actor._bodyParts[childKey].currentHp = 0;
          actor._bodyParts[childKey].damaged = true;
          handleDamagedBodyPart(actor, childKey);
        }
      });
    }

    // Add to battlelog if in battle
    if ($gameParty.inBattle()) {
      $gameTemp.limbDamageLog = {
        name: actor.name(),
        partName: part.name,
        damageMsg: partWoundMsg(part),
        paramName:
          part.statEffect && part.statEffect.param !== 0
            ? getParamName(part.statEffect.param)
            : null,
        amount:
          part.statEffect && part.statEffect.param !== 0
            ? statEffectAmount(part.statEffect, !!part._cutOff)
            : null,
      };
    }
  }

  // Restore all body parts function - used for respawn
  // Put the body back together: a night's sleep, a Recover All, a respawn.
  // Every part that is still the character's own mends completely and its
  // penalty lifts with it. In Blood and Oil a finished part is finished - cut
  // off or ruined for good - so those keep their zero and their penalty, and
  // only what is still standing is made whole.
  function restoreAllBodyParts(actor) {
    if (!actor || !actor._bodyParts) return;
    const permanent = isBloodAndOil();

    // The penalties owed by limbs that are no longer on the body outlive any
    // amount of rest, so the tally is rebuilt from them rather than wiped. A
    // part that IS still on the body owes nothing once it is whole again, so
    // its record is dropped here rather than kept to be charged for ever.
    actor._statModifiers = {};
    const removed = actor._removedPartDebuffs || {};
    for (const key in removed) {
      const debuff = removed[key];
      if (!debuff || !debuff.param) continue;
      if (actor._bodyParts[key] && !(permanent && actor._bodyParts[key].ruined)) {
        delete removed[key];
        continue;
      }
      actor._statModifiers[debuff.param] = (actor._statModifiers[debuff.param] || 0) + debuff.amount;
    }

    for (var part in actor._bodyParts) {
      var bodyPart = actor._bodyParts[part];

      if (permanent && bodyPart.ruined) {
        // Ruined where it stands, and it stays that way. Its penalty is one of
        // the standing ones, so it is put back on the tally.
        bodyPart.currentHp = 0;
        bodyPart.damaged = true;
        if (bodyPart.statEffect && bodyPart.statEffect.param !== 0) {
          const paramId = bodyPart.statEffect.param;
          actor._statModifiers[paramId] = (actor._statModifiers[paramId] || 0) + bodyPart.statEffect.amount;
          bodyPart.appliedStatEffect = true;
        }
        continue;
      }

      // Fully restore the part. Outside Blood and Oil nothing a fight did to
      // a limb survives a full recovery: the break, the ruin and the penalty
      // that came with them all lift together, so a night's sleep is enough to
      // put the character back on their feet whole.
      bodyPart.currentHp = bodyPart.maxHp;
      bodyPart.damaged = false;
      bodyPart.appliedStatEffect = false;
      bodyPart.ruined = false;
      bodyPart._cutOff = false;
      bodyPart._brokenNotCut = false;
      if (actor._severedParts) delete actor._severedParts[part];
    }

    // A limb that is whole again is a limb whose abilities come back.
    ensureBodyPartSkills(actor);

    // Refresh actor to update stats
    actor.refresh();
  }

  // Apply damage to actor with limb damage system
  function applyLimbDamage(actor, damage, action) {
    if (!actor._bodyParts) initializeBodyParts(actor);

    const damageType = getActionDamageType(action, action && action.subject ? action.subject() : null);
    const isMultiPart = (damageType === 'Area' || damageType === 'Explosive');

    if (isMultiPart) {
      // Area and Explosive: spread damage to multiple body parts
      var hitLocation = getRandomHitLocation();
      var partsToHit = selectRandomBodyParts(
        hitLocation,
        Math.floor(Math.random() * 3) + 2
      );
      if (!partsToHit || partsToHit.length === 0) {
        var allKeys = Object.keys(actor._bodyParts).filter(k => actor._bodyParts[k] && !actor._bodyParts[k].damaged);
        if (allKeys.length === 0) allKeys = Object.keys(actor._bodyParts);
        partsToHit = allKeys.slice(0, 3);
      }

      var primaryPartKey = (partsToHit && partsToHit.length > 0) ? partsToHit[0] : (hitLocation && hitLocation.parts ? hitLocation.parts[0] : null);
      actor._lastHitPart = primaryPartKey;
      if (primaryPartKey && actor._bodyParts && actor._bodyParts[primaryPartKey]) {
        actor._lastHitPartName = actor._bodyParts[primaryPartKey].name;
      } else {
        actor._lastHitPartName = '';
      }

      var totalDamageApplied = 0;
      var damagePerPart = Math.floor(damage / partsToHit.length);

      partsToHit.forEach(function (partKey) {
        totalDamageApplied += applyDamageToBodyPart(
          actor,
          partKey,
          damagePerPart,
          action
        );
      });

      var remainingDamage = damage - totalDamageApplied;
      if (remainingDamage > 0 && partsToHit.length > 0) {
        applyDamageToBodyPart(actor, partsToHit[0], remainingDamage, action);
      }
    } else {
      // Piercing, Cutting, Blunt, Abstract, etc.: hit JUST ONE body part
      var hitLocation = getRandomHitLocation();
      var partsToHit = selectRandomBodyParts(hitLocation, 1);
      var partKey = (partsToHit && partsToHit.length > 0) ? partsToHit[0] : (hitLocation && hitLocation.parts ? hitLocation.parts[0] : null);
      if (!partKey) {
        var allKeys = Object.keys(actor._bodyParts);
        partKey = allKeys[Math.floor(Math.random() * allKeys.length)];
      }

      actor._lastHitPart = partKey;
      if (partKey && actor._bodyParts && actor._bodyParts[partKey]) {
        actor._lastHitPartName = actor._bodyParts[partKey].name;
      } else {
        actor._lastHitPartName = '';
      }

      applyDamageToBodyPart(actor, partKey, damage, action);
    }
  }

  // Heal body parts function - used by healing items/spells
  function healBodyParts(actor, amount) {
    if (!actor._bodyParts) return;

    // The same bandage goes further in hands that have dressed a wound before
    // (First Aid, specialization 110), and treating somebody teaches it.
    if (window.SpecializationXP) {
      amount = Math.round(amount * window.SpecializationXP.multiplier('First Aid', 0.10));
      window.SpecializationXP.awardCapped('First Aid', 1);
    }

    // A broken limb is only broken. Anything the character still has mends
    // under a potion or a spell, on every difficulty Blood and Oil included,
    // and the penalty it carries lifts the moment it is back above 1 HP - the
    // point at which the limb is doing something again rather than hanging.
    // What Blood and Oil finished for good is the exception: a part cut off is
    // no longer here to mend, and a part destroyed where it stands (ruined) is
    // passed over, its penalty standing for the rest of the run.
    var needsRefresh = false;
    var mended = false;

    for (var part in actor._bodyParts) {
      var bodyPart = actor._bodyParts[part];

      if (bodyPart.damaged && bodyPart.ruined) continue;

      bodyPart.currentHp = Math.min(
        bodyPart.maxHp,
        bodyPart.currentHp + amount
      );

      if (!bodyPart.damaged) continue;

      // Back above 1 HP: the limb works again, so the penalty comes off with
      // the broken flag and the abilities it granted come back.
      if (bodyPart.currentHp > 1) {
        bodyPart.damaged = false;
        mended = true;
        needsRefresh = true;

        if (bodyPart.appliedStatEffect) {
          bodyPart.appliedStatEffect = false;
          // Reset the stat modifier if it exists and it's not affecting max HP
          if (bodyPart.statEffect && bodyPart.statEffect.param !== 0) {
            var paramId = bodyPart.statEffect.param;
            if (actor._statModifiers[paramId]) {
              actor._statModifiers[paramId] -= bodyPart.statEffect.amount;
              if (actor._statModifiers[paramId] === 0) {
                delete actor._statModifiers[paramId];
              }
            }
          }
        }
        if (actor._removedPartDebuffs) delete actor._removedPartDebuffs[part];
      }
    }

    if (mended) ensureBodyPartSkills(actor);

    // Refresh actor to update stats if needed
    if (needsRefresh) {
      actor.refresh();
    }
  }

  // A full recovery is a full recovery. The event command "Recover All", the
  // night's sleep that calls it (Core/TimeDateSystem.js) and every respawn all
  // come through here, and all of them put the body back together as well as
  // the hit points - except in Blood and Oil, where what is cut off or ruined
  // stays that way (restoreAllBodyParts).
  var _Game_Actor_recoverAll_bodyParts = Game_Actor.prototype.recoverAll;
  Game_Actor.prototype.recoverAll = function () {
    _Game_Actor_recoverAll_bodyParts.call(this);
    if (this._bodyParts) restoreAllBodyParts(this);
  };

  // Override param calculation to apply body part damage effects
  var _Game_Actor_param = Game_Actor.prototype.param;
  Game_Actor.prototype.param = function (paramId) {
    var value = _Game_Actor_param.call(this, paramId);

    // Apply limb damage modifiers for Actors 1, 2, or 3, but exclude max HP (paramId 0)
    if (
      (this.actorId() === 1 || this.actorId() === 2 || this.actorId() === 3) &&
      this._statModifiers &&
      this._statModifiers[paramId] &&
      paramId !== 0
    ) {
      value = Math.round(value * (1 + this._statModifiers[paramId] / 100));
    }

    // ...and what a creature's own anatomy grants it, on any actor: the party
    // member built in creature mode, and the creature recruited out of the NPC
    // system alike.
    const anatomy = creatureAnatomyBonus(this, paramId);
    if (anatomy) value = Math.round(value * (1 + anatomy / 100));

    return Math.max(1, value);
  };
  // Define Window_HealthStatus class BEFORE it's used
  function Window_HealthStatus() {
    this.initialize(...arguments);
  }

  if (Utils.RPGMAKER_NAME === "MZ") {
    Window_HealthStatus.prototype = Object.create(Window_StatusBase.prototype);
  } else {
    Window_HealthStatus.prototype = Object.create(Window_Selectable.prototype);
  }

  Window_HealthStatus.prototype.constructor = Window_HealthStatus;

  Window_HealthStatus.prototype.initialize = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      // MZ style initialization with Rectangle
      Window_StatusBase.prototype.initialize.call(
        this,
        new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight)
      );
    } else {
      // MV style initialization
      Window_Selectable.prototype.initialize.call(
        this,
        0,
        0,
        Graphics.boxWidth,
        Graphics.boxHeight
      );
    }

    this._currentActorIndex = 0; // Start with first party member
    this.setupBodyPartsList();
    this.refresh();
    this.activate();
    this.select(0);
  };

  Window_HealthStatus.prototype.setupBodyPartsList = function () {
    this._actor = $gameParty.members()[this._currentActorIndex];
    if (!this._actor) return;

    if (!this._actor._bodyParts) initializeBodyParts(this._actor);

    // Create list of body parts for display - dynamically from actor's current parts
    this._bodyPartsList = [];

    // Simply list all parts that exist on the actor
    for (var partKey in this._actor._bodyParts) {
      var part = this._actor._bodyParts[partKey];
      if (part) {
        this._bodyPartsList.push({
          isHeader: false,
          key: partKey,
          part: part,
          indent: false, // No indentation for archetype parts
        });
      }
    }
  };

  Window_HealthStatus.prototype.addPartsToList = function (partKeys) {
    for (var i = 0; i < partKeys.length; i++) {
      var partKey = partKeys[i];
      var part = this._actor._bodyParts[partKey];

      if (part) {
        // Add part to list with reference to its key
        this._bodyPartsList.push({
          isHeader: false,
          key: partKey,
          part: part,
          // Determine indentation level
          indent:
            partKey !== "HEAD" &&
            partKey !== "TORSO" &&
            partKey !== "LEFT_ARM" &&
            partKey !== "RIGHT_ARM" &&
            partKey !== "LEFT_LEG" &&
            partKey !== "RIGHT_LEG",
        });
      }
    }
  };

  Window_HealthStatus.prototype.maxItems = function () {
    return this._bodyPartsList ? this._bodyPartsList.length : 0;
  };

  Window_HealthStatus.prototype.refresh = function () {
    this.contents.clear();
    this._actor = $gameParty.members()[this._currentActorIndex];

    if (this._actor) {
      if (!this._actor._bodyParts) initializeBodyParts(this._actor);

      var lineHeight = this.lineHeight();

      // Draw player switcher indicator at top
      this.drawPlayerSwitcher(0, 0);

      // Draw actor name and HP using compatible methods
      if (Utils.RPGMAKER_NAME === "MZ") {
        this.drawActorName(this._actor, 6, lineHeight, 150);
        this.drawActorHp(this._actor, 220, lineHeight, 180);
      } else {
        // MV style
        this.drawActorName(this._actor, 6, lineHeight);
        this.drawActorHp(this._actor, 220, lineHeight);
      }

      this.drawHorzLine(lineHeight * 2);

      // Items are drawn by drawItem when the window refreshes
      this.drawAllItems();
    }
  };

  // Draw player switcher indicator showing current actor and navigation hint
  Window_HealthStatus.prototype.drawPlayerSwitcher = function (x, y) {
    var width = this.contentsWidth();
    var partySize = $gameParty.members().length;

    // Draw navigation hint
    var navText = T('HealthCore.switchPlayer');
    this.changeTextColor(this.systemColor());
    this.drawText(navText, x, y, width, 'center');
    this.resetTextColor();

    // Draw player indicators (dots)
    if (partySize > 1) {
      var dotSpacing = 24;
      var totalWidth = (partySize - 1) * dotSpacing;
      var startX = x + (width - totalWidth) / 2;

      for (var i = 0; i < partySize; i++) {
        var dotX = startX + i * dotSpacing;
        var dotY = y + this.lineHeight() / 2 + 16;
        var dotSize = 8;

        if (i === this._currentActorIndex) {
          // Active player - filled circle
          this.contents.fillRect(dotX - dotSize / 2, dotY - dotSize / 2, dotSize, dotSize, this.systemColor());
        } else {
          // Inactive player - empty circle
          this.contents.strokeRect(dotX - dotSize / 2, dotY - dotSize / 2, dotSize, dotSize, this.normalColor());
        }
      }
    }
  };

  // Update Window_HealthStatus drawItem method for damaged body parts
  Window_HealthStatus.prototype.drawItem = function (index) {
    if (
      !this._bodyPartsList ||
      index < 0 ||
      index >= this._bodyPartsList.length
    )
      return;

    var item = this._bodyPartsList[index];
    var rect = this.itemRect(index);

    // Clear the item area
    this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

    if (item.isHeader) {
      // Draw section header
      this.changeTextColor(this.systemColor());
      this.drawText(item.name, rect.x + 6, rect.y, rect.width - 12);
      this.resetTextColor();
    } else {
      // Draw body part
      var part = item.part;
      var x = rect.x + (item.indent ? 30 : 10);
      var width = rect.width - (item.indent ? 40 : 20);
      var gaugeWidth = 120;
      var textWidth = width - gaugeWidth - 10;

      // Draw part name
      this.drawText(part.name, x, rect.y, textWidth);

      // Draw HP gauge
      if (part.damaged) {
        // Broken, cut off or destroyed, in the difficulty's own words.
        var damagedText = partStatusLabel(this._actor, item.key, part) || T('HealthCore.damaged');
        this.drawText(damagedText, x + textWidth + 10, rect.y, gaugeWidth);

        if (Utils.RPGMAKER_NAME === "MZ") {
          this.changeTextColor(ColorManager.deathColor());
        } else {
          this.changeTextColor(this.deathColor());
        }

        // Draw stat effect if applied
        if (part.appliedStatEffect && part.statEffect) {
          var statEffect = part.statEffect;
          var paramName = getParamName(statEffect.param);
          var statText = paramName + " " + statEffect.amount;
          this.drawText(
            statText,
            x,
            rect.y + this.lineHeight() - 4,
            width,
            "right"
          );
        }
      } else {
        this.drawBodyPartGauge(
          x + textWidth + 10,
          rect.y,
          gaugeWidth,
          part.currentHp / part.maxHp
        );
        this.drawText(
          part.currentHp + "/" + part.maxHp,
          x + textWidth + 10,
          rect.y,
          gaugeWidth,
          "right"
        );
      }

      this.resetTextColor();
    }
  };

  // Define item height for scrolling
  Window_HealthStatus.prototype.itemHeight = function () {
    return this.lineHeight();
  };

  // Item width is the full width of the window
  Window_HealthStatus.prototype.itemWidth = function () {
    return this.contents.width;
  };

  // Handle window item visibility
  Window_HealthStatus.prototype.topRow = function () {
    return Math.floor(this._scrollY / this.itemHeight());
  };

  Window_HealthStatus.prototype.setTopRow = function (row) {
    var scrollY =
      Math.max(0, Math.min(row, this.maxTopRow())) * this.itemHeight();
    if (this._scrollY !== scrollY) {
      this._scrollY = scrollY;
      this.refresh();
      this.refreshCursor(); // Changed from updateCursor to refreshCursor
    }
  };

  Window_HealthStatus.prototype.maxTopRow = function () {
    return Math.max(0, this.maxItems() - this.maxPageRows());
  };

  Window_HealthStatus.prototype.maxPageRows = function () {
    var pageHeight = this.height - this.padding * 2;
    // Reserve space for player switcher, actor info at top, and instructions at bottom
    pageHeight -= this.lineHeight() * 4;
    return Math.floor(pageHeight / this.itemHeight());
  };

  // Override cursor movement methods
  Window_HealthStatus.prototype.cursorDown = function (wrap) {
    var index = this.index();
    var maxItems = this.maxItems();
    var maxPageRows = this.maxPageRows();

    if (index < maxItems - 1) {
      this.select((index + 1) % maxItems);
    } else if (wrap) {
      this.select(0);
    }
  };

  Window_HealthStatus.prototype.cursorUp = function (wrap) {
    var index = this.index();
    var maxItems = this.maxItems();

    if (index > 0) {
      this.select((index - 1 + maxItems) % maxItems);
    } else if (wrap) {
      this.select(maxItems - 1);
    }
  };

  Window_HealthStatus.prototype.isCursorVisible = function () {
    var row = this.row();
    return row >= this.topRow() && row <= this.bottomRow();
  };

  Window_HealthStatus.prototype.ensureCursorVisible = function () {
    var row = this.row();
    if (row < this.topRow()) {
      this.setTopRow(row);
    } else if (row > this.bottomRow()) {
      this.setTopRow(row - (this.maxPageRows() - 1));
    }
  };

  // Add mouse wheel support for scrolling
  Window_HealthStatus.prototype.processWheel = function () {
    if (this.isOpenAndActive()) {
      var threshold = 20;
      if (TouchInput.wheelY >= threshold) {
        this.scrollDown(1);
      }
      if (TouchInput.wheelY <= -threshold) {
        this.scrollUp(1);
      }
    }
  };

  Window_HealthStatus.prototype.scrollDown = function (num) {
    var newTopRow = Math.min(this.topRow() + num, this.maxTopRow());
    this.setTopRow(newTopRow);
  };

  Window_HealthStatus.prototype.scrollUp = function (num) {
    var newTopRow = Math.max(this.topRow() - num, 0);
    this.setTopRow(newTopRow);
  };
  Window_HealthStatus.prototype.update = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.update.call(this);
    } else {
      Window_Selectable.prototype.update.call(this);
    }

    // Process mouse wheel scrolling
    this.processWheel();

    // Process left/right keys for player switching
    this.processPlayerSwitch();
  };

  // Handle left/right input for switching between party members
  Window_HealthStatus.prototype.processPlayerSwitch = function () {
    if (!this.isOpenAndActive()) return;

    var partySize = $gameParty.members().length;
    if (partySize <= 1) return;

    if (Input.isRepeated('right')) {
      this.switchToNextActor();
    } else if (Input.isRepeated('left')) {
      this.switchToPreviousActor();
    }
  };

  Window_HealthStatus.prototype.switchToNextActor = function () {
    var partySize = $gameParty.members().length;
    this._currentActorIndex = (this._currentActorIndex + 1) % partySize;
    SoundManager.playCursor();
    this.setupBodyPartsList();
    this.select(0); // Reset selection to top
    this.refresh();
  };

  Window_HealthStatus.prototype.switchToPreviousActor = function () {
    var partySize = $gameParty.members().length;
    this._currentActorIndex = (this._currentActorIndex - 1 + partySize) % partySize;
    SoundManager.playCursor();
    this.setupBodyPartsList();
    this.select(0); // Reset selection to top
    this.refresh();
  };

  // Override selection handling
  Window_HealthStatus.prototype.select = function (index) {
    if (Utils.RPGMAKER_NAME === "MZ") {
      Window_StatusBase.prototype.select.call(this, index);
    } else {
      Window_Selectable.prototype.select.call(this, index);
    }
    this.ensureCursorVisible();
    this.refreshCursor();
  };

  Window_HealthStatus.prototype.refreshCursor = function () {
    if (this._cursorAll) {
      this.refreshCursorForAll();
    } else if (this.index() >= 0) {
      var rect = this.itemRect(this.index());
      this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
    } else {
      this.setCursorRect(0, 0, 0, 0);
    }
  };

  Window_HealthStatus.prototype.bottomRow = function () {
    return Math.max(0, this.topRow() + this.maxPageRows() - 1);
  };

  Window_HealthStatus.prototype.row = function () {
    return Math.floor(this.index() / this.maxCols());
  };

  Window_HealthStatus.prototype.maxCols = function () {
    return 1;
  };

  // Helper method for drawing body part gauges
  Window_HealthStatus.prototype.drawBodyPartGauge = function (
    x,
    y,
    width,
    rate
  ) {
    var fillW = Math.floor(width * rate);
    var gaugeY = y + this.lineHeight() - 8;
    var gaugeHeight = 6;

    // Get colors based on RPG Maker version
    var backColor, color1, color2;

    if (Utils.RPGMAKER_NAME === "MZ") {
      backColor = ColorManager.gaugeBackColor();
      color1 = ColorManager.hpGaugeColor1();
      color2 = ColorManager.hpGaugeColor2();
    } else {
      backColor = this.gaugeBackColor();
      color1 = this.hpGaugeColor1();
      color2 = this.hpGaugeColor2();
    }

    this.contents.fillRect(x, gaugeY, width, gaugeHeight, backColor);
    this.contents.gradientFillRect(
      x,
      gaugeY,
      fillW,
      gaugeHeight,
      color1,
      color2
    );
  };

  Window_HealthStatus.prototype.drawHorzLine = function (y) {
    var lineY = y + this.lineHeight() / 2 - 1;
    this.contents.paintOpacity = 48;
    var color =
      Utils.RPGMAKER_NAME === "MZ"
        ? ColorManager.normalColor()
        : this.normalColor();
    this.contents.fillRect(0, lineY, this.contentsWidth(), 2, color);
    this.contents.paintOpacity = 255;
  };

  Window_HealthStatus.prototype.processCancel = function () {
    // Don't call parent processCancel to avoid double scene popping
    SceneManager.pop();
  };
  Scene_HealthStatus.prototype.popScene = function () {
    SceneManager.pop();
  };

  // Helper methods for color compatibility between MV and MZ
  Window_HealthStatus.prototype.systemColor = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.systemColor()
      : Window_Base.prototype.systemColor.call(this);
  };

  Window_HealthStatus.prototype.normalColor = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.normalColor()
      : Window_Base.prototype.normalColor.call(this);
  };

  Window_HealthStatus.prototype.hpGaugeColor1 = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.hpGaugeColor1()
      : Window_Base.prototype.hpGaugeColor1.call(this);
  };

  Window_HealthStatus.prototype.hpGaugeColor2 = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.hpGaugeColor2()
      : Window_Base.prototype.hpGaugeColor2.call(this);
  };

  Window_HealthStatus.prototype.deathColor = function () {
    return Utils.RPGMAKER_NAME === "MZ"
      ? ColorManager.deathColor()
      : Window_Base.prototype.deathColor.call(this);
  };

  Window_HealthStatus.prototype.resetTextColor = function () {
    if (Utils.RPGMAKER_NAME === "MZ") {
      this.changeTextColor(ColorManager.normalColor());
    } else {
      Window_Base.prototype.resetTextColor.call(this);
    }
  };

  Window_HealthStatus.prototype.changeTextColor = function (color) {
    if (Utils.RPGMAKER_NAME === "MZ") {
      this.contents.textColor = color;
    } else {
      Window_Base.prototype.changeTextColor.call(this, color);
    }
  };

  // Add compatibility methods for MV if running in MZ
  if (Utils.RPGMAKER_NAME === "MZ") {
    // These methods need to be added for MV compatibility if they don't exist
    if (!Window_HealthStatus.prototype.drawActorName) {
      Window_HealthStatus.prototype.drawActorName = function (
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

    if (!Window_HealthStatus.prototype.drawActorHp) {
      Window_HealthStatus.prototype.drawActorHp = function (
        actor,
        x,
        y,
        width
      ) {
        width = width || 186;
        const color1 = ColorManager.hpGaugeColor1();
        const color2 = ColorManager.hpGaugeColor2();
        this.drawGauge(x, y, width, actor.hpRate(), color1, color2);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.hpA, x, y, 44);
        this.drawCurrentAndMax(
          actor.hp,
          actor.mhp,
          x,
          y,
          width,
          this.hpColor(actor),
          ColorManager.normalColor()
        );
      };
    }

    if (!Window_HealthStatus.prototype.drawCurrentAndMax) {
      Window_HealthStatus.prototype.drawCurrentAndMax = function (
        current,
        max,
        x,
        y,
        width,
        color1,
        color2
      ) {
        const labelWidth = this.textWidth("HP");
        const valueWidth = this.textWidth("0000");
        const slashWidth = this.textWidth("/");
        const x1 = x + width - valueWidth;
        const x2 = x1 - slashWidth;
        const x3 = x2 - valueWidth;
        this.changeTextColor(color1);
        this.drawText(current, x3, y, valueWidth, "right");
        this.changeTextColor(ColorManager.normalColor());
        this.drawText("/", x2, y, slashWidth, "right");
        this.changeTextColor(color2);
        this.drawText(max, x1, y, valueWidth, "right");
      };
    }

    if (!Window_HealthStatus.prototype.hpColor) {
      Window_HealthStatus.prototype.hpColor = function (actor) {
        if (actor.isDead()) {
          return ColorManager.deathColor();
        } else if (actor.isDying()) {
          return ColorManager.crisisColor();
        } else {
          return ColorManager.normalColor();
        }
      };
    }
  }

  // Create the health status scene class
  function Scene_HealthStatus() {
    this.initialize(...arguments);
  }

  Scene_HealthStatus.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_HealthStatus.prototype.constructor = Scene_HealthStatus;

  // Published alongside the HealthCore helpers below. AutoIdleExplorer gates its "look at the
  // party's wounds" entry on this name, and never found it while the scene sat in the IIFE.
  window.Scene_HealthStatus = Scene_HealthStatus;

  Scene_HealthStatus.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    // Set switch 127 when health status menu is opened
    $gameSwitches.setValue(127, true);
  };

  Scene_HealthStatus.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    this.createHealthStatusWindow();
    // Add this line to make sure cancel handling is set up
    this._healthStatusWindow.setHandler("cancel", this.popScene.bind(this));
  };

  Scene_HealthStatus.prototype.start = function () {
    Scene_MenuBase.prototype.start.call(this);
    // Refresh body parts list when scene starts (in case archetype changed)
    this._healthStatusWindow.setupBodyPartsList();
    this._healthStatusWindow.refresh();
  };

  Scene_HealthStatus.prototype.createHealthStatusWindow = function () {
    this._healthStatusWindow = new Window_HealthStatus();
    this.addWindow(this._healthStatusWindow);
  };


  // Keep only the Biologics menu command
  var _Window_MenuCommand_addOriginalCommands =
    Window_MenuCommand.prototype.addOriginalCommands;
  Window_MenuCommand.prototype.addOriginalCommands = function () {
    _Window_MenuCommand_addOriginalCommands.call(this);

    var menuText2 = T('HealthCore.biologics');
    this.addCommand(menuText2, "biologics", true, 81);
  };

  var _Scene_Menu_createCommandWindow =
    Scene_Menu.prototype.createCommandWindow;
  Scene_Menu.prototype.createCommandWindow = function () {
    _Scene_Menu_createCommandWindow.call(this);
    this._commandWindow.setHandler(
      "biologics",
      this.commandBiologics.bind(this)
    );
  };

  // Override damage application
  var _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
  Game_Action.prototype.executeHpDamage = function (target, value) {
    _Game_Action_executeHpDamage.call(this, target, value);

    // Apply limb damage system to all actors
    if (target.isActor() && value > 0) {
      applyLimbDamage(target, value, this);

      // Check if HP is zero or less and restore body parts if so
      if (target.hp <= 0) {
        restoreAllBodyParts(target);
      }
    }
  };
  // Add hooks for BattleLog to display limb damage
  var _Window_BattleLog_displayHpDamage =
    Window_BattleLog.prototype.displayHpDamage;
  Window_BattleLog.prototype.displayHpDamage = function (target) {
    _Window_BattleLog_displayHpDamage.call(this, target);

    // Check for limb damage logs - only when body parts are fully damaged
    if ($gameTemp.limbDamageLog && target.isActor()) {
      var log = $gameTemp.limbDamageLog;

      // Show specific damage message and stat effect if applied
      var coloredMsg = log.damageMsg.replace(
        log.partName,
        "\\c[25]" + log.partName + "\\c[0]"
      );
      var pushMethod = typeof this.appendToActionLine === "function" ? "appendToActionLine" : "addText";
      if (log.paramName && log.amount !== null && log.amount !== undefined) {
        var amountColor = log.amount < 0 ? 24 : 23;
        var amountStr = "\\c[" + amountColor + "]" + log.amount + "\\c[0]";
        if (ConfigManager.language === "it") {
          this.push(pushMethod, log.name + " " + coloredMsg + ", " + log.paramName + " " + amountStr + "!");
        } else {
          this.push(pushMethod, log.name + "'s " + coloredMsg + ", " + log.paramName + " " + amountStr + "!");
        }
      } else {
        if (ConfigManager.language === "it") {
          this.push(pushMethod, log.name + " " + coloredMsg + "!");
        } else {
          this.push(pushMethod, log.name + "'s " + coloredMsg + "!");
        }
      }

      $gameTemp.limbDamageLog = null;
    }
  };

  // Override HP and MP recovery effects to also heal body parts
  var _Game_Action_itemEffectRecoverHp =
    Game_Action.prototype.itemEffectRecoverHp;
  Game_Action.prototype.itemEffectRecoverHp = function (target, effect) {
    _Game_Action_itemEffectRecoverHp.call(this, target, effect);

    // Apply to Actors 1, 2, and 3
    if (target.isActor() && (target.actorId() === 1 || target.actorId() === 2 || target.actorId() === 3)) {
      var value = Math.floor(target.mhp * effect.value1 + effect.value2);
      healBodyParts(target, value);
    }
  };

  var _Game_Action_itemEffectRecoverMp =
    Game_Action.prototype.itemEffectRecoverMp;
  Game_Action.prototype.itemEffectRecoverMp = function (target, effect) {
    _Game_Action_itemEffectRecoverMp.call(this, target, effect);

    // Apply to Actors 1, 2, and 3
    if (target.isActor() && (target.actorId() === 1 || target.actorId() === 2 || target.actorId() === 3)) {
      var value = Math.floor(target.mmp * effect.value1 + effect.value2);
      healBodyParts(target, Math.floor(value / 2)); // MP recovery items/skills heal body parts at half rate
    }
  };

  // MV/MZ compatibility for plugin commands
  if (Utils.RPGMAKER_NAME === "MZ") {
    // No actor named means the whole party: the event command that heals the
    // party, the inn and the night's sleep all come through here, and all of
    // them are meant to put every body back together, not only the leader's.
    // A full heal (no amount, or one at least as large as the body) restores
    // the broken parts outright instead of merely topping their hit points up,
    // so a mended limb stops owing its penalty. Blood and Oil is untouched by
    // this: what is cut off or ruined there stays that way (restoreAllBodyParts).
    const healBodyPartsCommand = (args) => {
      args = args || {};
      const actorId = Number(args.actorId) || 0;
      const targets = actorId
        ? [$gameActors.actor(actorId)]
        : $gameParty.members();
      const asked = args.amount === undefined || args.amount === "" ? 0 : Number(args.amount);
      targets.forEach((actor) => {
        if (!actor) return;
        const amount = asked || actor.mhp;
        if (amount >= actor.mhp) restoreAllBodyParts(actor);
        else healBodyParts(actor, amount);
      });
    };
    PluginManager.registerCommand("Health_Core", "HealBodyParts", healBodyPartsCommand);

    PluginManager.registerCommand("Health_Core", "ChangeArchetype", (args) => {
      var actorId = Number(args.actorId) || 1;
      var actor = $gameActors.actor(actorId);
      var archetypeName = String(args.archetypeName || "Humanoid"); // i18n-ignore: archetype id
      if (actor) {
        var success = changeArchetype(actor, archetypeName);
        if (success) {
          console.log(`Successfully changed ${actor.name()}'s archetype to ${archetypeName}`);

          // Update reproduction variable based on actor ID
          if (actorId === 1) {
            // Variable 87 already set by changeArchetype
          } else if (actorId === 2) {
            // Set variable 115 for player 2
            const { Archetypes } = window.Health;
            const archetype = Archetypes[archetypeName];
            if (archetype && $gameVariables) {
              var reproductionValue = archetype.reproduction !== undefined ? archetype.reproduction : 0;
              $gameVariables.setValue(115, reproductionValue);
            }
          } else if (actorId === 3) {
            // Set variable 116 for player 3
            const { Archetypes } = window.Health;
            const archetype = Archetypes[archetypeName];
            if (archetype && $gameVariables) {
              var reproductionValue = archetype.reproduction !== undefined ? archetype.reproduction : 0;
              $gameVariables.setValue(116, reproductionValue);
            }
          }
        } else {
          console.warn(`Failed to change archetype to ${archetypeName}. Check that it exists in Archetypes.`);
        }
      }
    });

    PluginManager.registerCommand("Health_Core", "CreateCreature", (args) => {
      var actorId = Number(args.actorId) || 1;
      // The Scene_CreateCreature is now provided by CharacterCreationCreature.js
      if (typeof Scene_CreateCreature !== 'undefined' && Scene_CreateCreature.setTargetActorId) {
        Scene_CreateCreature.setTargetActorId(actorId);
        SceneManager.push(Scene_CreateCreature);
      } else {
        console.warn('Scene_CreateCreature not found. Make sure CharacterCreationCreature.js is loaded.');
      }
    });
  }

  // Expose functions globally for use by other plugins
  window.changeArchetypeForActor = changeArchetype;
  window.initializeBodyParts = initializeBodyParts;
  window.getArchetypeText = getArchetypeText; // Expose translation helper
  window.getEquipText = getEquipText; // Expose equipment translation helper
  window.HealthCore = window.HealthCore || {};
  window.HealthCore.restoreAllBodyParts = restoreAllBodyParts;
  // Multi-skill body-part helpers, exposed for other plugins (prosthetics,
  // creature creation, mimic, etc.) so they read part skills consistently.
  window.HealthCore.normalizeSkillIds = normalizeSkillIds;
  window.HealthCore.getPartTypeBonusSkills = getPartTypeBonusSkills;
  window.HealthCore.getPartSkillIds = getPartSkillIds;
  window.HealthCore.ensureBodyPartSkills = ensureBodyPartSkills;
  window.HealthCore.ensureAllPartyBodyPartSkills = ensureAllPartyBodyPartSkills;
  // Every skill the anatomy owes: read by CategorizedBattleSkills, which never
  // benches one (a body does not put its own claws in storage).
  window.HealthCore.anatomySkillIds = anatomySkillIds;
  // Losing what the anatomy taught: a part coming off (severed, amputated or
  // replaced in surgery) and an augment pulled on its own. Both keep whatever
  // the rest of the body still grants, so a one-handed character can still
  // push. The named sources are what the skills menu prints.
  window.HealthCore.forgetPartSkills = forgetPartSkills;
  window.HealthCore.forgetProstheticSkills = forgetProstheticSkills;
  window.HealthCore.skillSourcePartNames = skillSourcePartNames;
  // What the anatomy is worth outside a fight: read by the movement system
  // (walking speed, sprinting) and by anything that wants to know whether a
  // character can still hold or steer something.
  window.HealthCore.mobility = mobility;
  window.HealthCore.grip = grip;
  // Socket matching by part name, read by the prosthetic shop.
  window.HealthCore.partFamilies = partFamilies;
  window.HealthCore.implantsForPart = implantsForPart;
  window.HealthCore.removeImplantWithPart = removeImplantWithPart;
  // Wounds dealt outside battle (field surgery).
  window.HealthCore.injureBodyPart = injureBodyPart;
  // How fast a need drains with what is fitted (TimeDateSystem reads it).
  window.HealthCore.needDrainMultiplier = needDrainMultiplier;
  // Archetype identity + gestation, read by the biologic simulation and the
  // status screen.
  window.HealthCore.getActorArchetypeKeys = getActorArchetypeKeys;
  window.HealthCore.mergeArchetypeParts = mergeArchetypeParts;
  window.HealthCore.archetypePartName = archetypePartName;
  window.HealthCore.canPartHoldWeapon = canPartHoldWeapon;
  window.HealthCore.partCanCutoff = partCanCutoff;
  // Does the blow being struck cut? Read by the monster anatomy so a mace
  // breaks a limb where a sword takes it off.
  window.HealthCore.attackerCanCut = attackerCanCut;
  window.HealthCore.attackerCanCutPlayer = attackerCanCutPlayer;
  window.HealthCore.PLAYER_CUTTING_DAMAGE_TYPES = PLAYER_CUTTING_DAMAGE_TYPES;
  window.HealthCore.getActionDamageType = getActionDamageType;
  window.HealthCore.CUTTING_DAMAGE_TYPES = CUTTING_DAMAGE_TYPES;
  window.HealthCore.CUTTING_WEAPON_TYPES = CUTTING_DAMAGE_TYPES;
  // What a part's penalty is worth broken (false) versus taken off (true).
  window.HealthCore.statEffectAmount = statEffectAmount;
  // A creature's parts are its stats; a person's are not (character creation and
  // the NPC system both build bodies through initializeBodyParts, so both get
  // this for free).
  window.HealthCore.isCreatureBody = isCreatureBody;
  window.HealthCore.creatureAnatomyBonus = creatureAnatomyBonus;
  window.HealthCore.partWoundMsg = partWoundMsg;
  window.HealthCore.partStates = partStates;
  window.HealthCore.loseBodyPart = loseBodyPart;
  window.HealthCore.isPartBroken = isPartBroken;
  window.HealthCore.partStatusLabel = partStatusLabel;
  window.HealthCore.dependentPartKeys = dependentPartKeys;
  window.HealthCore.isExtremityKey = isExtremityKey;
  window.HealthCore.needsLimbSocket = needsLimbSocket;
  window.HealthCore.isLimbSocketKey = isLimbSocketKey;
  window.HealthCore.openLimbSockets = openLimbSockets;
  window.HealthCore.isBloodAndOil = isBloodAndOil;
  window.HealthCore.healBodyParts = healBodyParts;
  window.HealthCore.isLimbPartKey = isLimbPartKey;
  window.HealthCore.getArchetypeDisplayName = getArchetypeDisplayName;
  // The inanimate list, kept apart from the creature one on purpose.
  window.HealthCore.getObjectArchetypes = getObjectArchetypes;
  window.HealthCore.getObjectArchetypeKeys = getObjectArchetypeKeys;
  window.HealthCore.getObjectArchetype = getObjectArchetype;
  window.HealthCore.getObjectArchetypeDisplayName = getObjectArchetypeDisplayName;
  window.HealthCore.getArchetypePregnancyDuration = getArchetypePregnancyDuration;
  window.HealthCore.getPregnancyDuration = getPregnancyDuration;

  // --- Grant body-part skills on party join ---------------------------------
  const _Game_Party_addActor = Game_Party.prototype.addActor;
  Game_Party.prototype.addActor = function (actorId) {
    const alreadyMember = this._actors.includes(actorId);
    _Game_Party_addActor.call(this, actorId);
    if (!alreadyMember && $gameActors) {
      ensureBodyPartSkills($gameActors.actor(actorId));
    }
  };

  // --- Grant body-part skills when the game starts / a save is loaded --------
  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    try {
      ensureAllPartyBodyPartSkills();
    } catch (e) {
      console.error("Health_Core: ensureAllPartyBodyPartSkills failed", e);
    }
  };

})();