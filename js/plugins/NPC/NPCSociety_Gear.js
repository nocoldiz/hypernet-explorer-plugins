/*:
 * @target MZ
 * @plugindesc NPC Society: equipment, locals, party stats and gear (window.NPCSocietyGear)
 * @author Omni-Lex
 * @base NPCSociety
 * @orderAfter NPCSociety
 * @orderAfter NPCSociety_Romance
 * @help
 * ============================================================================
 * NPCSociety_Gear, part of the NPCSociety family
 * ============================================================================
 * Owns SECTION 3b (equipment generation helpers, the locals and the party
 * members' stats) and SECTION 3b2 (gear: what a person wears), and publishes
 * window.NPCSocietyGetEquip and window.NPCSocietyGear.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSocietyRegistry._internal and publishes its own there. Load it right after
 * NPCSociety_Romance.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _natureLevel, nameToSeed, SeededRng,
  } = window.NPCSocietyRegistry._internal;

  // ==========================================================================
  // SECTION 3b: EQUIPMENT GENERATION HELPERS
  // ==========================================================================

  function _itemLevel(item) {
    if (!item || !Array.isArray(item.params)) return 0;
    return item.params.reduce((sum, v) => sum + Math.abs(v), 0);
  }

  function _partyMedianLevel() {
    if (!$gameParty) return 1;
    const members = $gameParty.members();
    if (!members.length) return 1;
    const levels = members.map(a => a.level).sort((a, b) => a - b);
    const mid = Math.floor(levels.length / 2);
    return levels.length % 2 !== 0 ? levels[mid] : Math.floor((levels[mid - 1] + levels[mid]) / 2);
  }

  // --------------------------------------------------------------------------
  // Local NPCs track the party
  // --------------------------------------------------------------------------
  // An event tagged "Local" belongs to the map it was authored on: the player
  // meets that person whenever the story brings them to that town, be it in the
  // first hour of a playthrough or the fiftieth. A level rolled once, at first
  // sight, says nothing by then, so a local NPC is pinned to the party's median
  // level instead and everything derived from it is rebuilt whenever the party
  // moves past them.
  let _localNameCache = { mapId: -1, names: null };

  function _localNamesOnMap() {
    const mapId = $gameMap?.mapId?.() ?? -1;
    if (_localNameCache.mapId !== mapId || !_localNameCache.names) {
      const names = new Set();
      for (const ev of ($gameMap?.events?.() || [])) {
        const data = ev?.event?.();
        if (data?.name && window.NPCSystem?.hasLocalTag?.(data.note)) names.add(data.name);
      }
      _localNameCache = { mapId, names };
    }
    return _localNameCache.names;
  }

  // The tag lives on the event, which is only readable while the player stands
  // on that NPC's own map, so the answer is flagged onto the profile the first
  // time it can be read and kept from then on.
  function _isLocalNpc(eventName, profile) {
    if (!profile || !eventName) return false;
    if (profile._localNpc === undefined && _localNamesOnMap().has(eventName)) {
      profile._localNpc = true;
    }
    return profile._localNpc === true;
  }

  function _syncLocalLevel(eventName, profile) {
    // A level an event wrote out for itself (see SECTION 3c) is the map's own
    // answer, not the party's, and is never dragged to the party median.
    if (profile && profile._levelPinned) return;
    if (!_isLocalNpc(eventName, profile)) return;
    const target = _partyMedianLevel();
    if (!target || profile.level === target) return;

    // Same shape as the generator's level block (section 4, step 10b), seeded
    // per name so the same person always re-rolls to the same spread around
    // whatever level the party has reached.
    const rng = new SeededRng(nameToSeed(eventName + "_locallvl") ^ (window.NPCShared.worldSeed() >>> 0));
    const statMid = Math.max(1, Math.floor(target * 5 * (0.7 + rng.next() * 0.6)));
    profile.level = target;
    profile.atk = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.def = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.mat = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.mdf = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.agi = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.luk = Math.max(1, statMid + rng.nextInt(-3, 4));
    profile.mhp = (10 + target) * 10 + rng.nextInt(0, 21);
    profile.mmp = (5  + target) * 5  + rng.nextInt(0, 11);

    // Their level is the party's, not something they earned, so their exp is
    // re-pegged to it and whatever the daily gain had banked is dropped.
    const classId = profile.assignedClassId;
    const expMgr  = window.NPCSim?.ExpManager;
    if (expMgr) {
      profile.exp = expMgr.expForLevel(classId ?? 0, target);
      if (classId) expMgr.learnClassSkillsUpToLevel(profile, classId, target);
    }
  }

  // --------------------------------------------------------------------------
  // Travellers are their actor
  // --------------------------------------------------------------------------
  // A party member's profile carries the social half of them only: the level,
  // the vitals and the stats belong to the actor the player levels up, equips
  // and heals. A profile minted for a traveller (character creation writes one
  // for every character it finalizes) rolled its own set of numbers once and
  // then never moved, so the Empathize panel showed a stranger's character
  // sheet next to their own portrait. Mirror the actor onto the profile
  // whenever it is accessed, so the panel, the wiki and the simulation all read
  // the character the player is actually playing.
  function _partyActorFor(eventName) {
    const members = $gameParty?.members?.() ?? [];
    return members.find(a => a && a.name() === eventName) ?? null;
  }

  function _syncPartyMemberStats(eventName, profile) {
    const actor = _partyActorFor(eventName);
    if (!actor || !profile) return;
    profile.level = actor.level;
    profile.mhp   = actor.mhp;
    profile.mmp   = actor.mmp;
    profile.atk   = actor.atk;
    profile.def   = actor.def;
    profile.mat   = actor.mat;
    profile.mdf   = actor.mdf;
    profile.agi   = actor.agi;
    profile.luk   = actor.luk;
    // Equip-derived stats live on the actor (ActorCharacterFields), and read 0
    // rather than a rolled value when the character has none of them.
    if (actor.pvArcane)       profile.arcane       = actor.pvArcane();
    if (actor.pvSubstance)    profile.substance    = actor.pvSubstance();
    if (actor.pvStealth)      profile.stealth      = actor.pvStealth();
    if (actor.pvIntimidation) profile.intimidation = actor.pvIntimidation();
    // The class the player is playing outranks the one the society guessed, and
    // the experience bar reads against it (the sim's curve is RMMZ's own).
    const classId = actor.currentClass()?.id;
    if (classId) profile.assignedClassId = classId;
    if (actor.currentExp) profile.exp = actor.currentExp();

    // Body and gender are the character sheet's, so the romance page and the
    // pronouns the panel writes with match the person the player made.
    if (actor.gender) profile.gender = actor.gender();
    if (actor._orientOverride) {
      profile._orientOverride = {
        ...(profile._orientOverride || {}),
        ...actor._orientOverride,
      };
    }
    if (actor._ideologyId) {
      profile.ideologyId = actor._ideologyId;
      const idList = window.NPCShared?.ideologyList?.() || [];
      const idx = idList.findIndex(i => i && i.id === actor._ideologyId);
      if (idx >= 0) profile.ideologyIndex = idx;
    }
    const archetypeKeys = window.HealthCore?.getActorArchetypeKeys?.(actor);
    if (archetypeKeys?.length) profile.archetype = archetypeKeys[0];

    // The traits the player bought at creation (TraitSelector writes them
    // onto the actor), not the ones the society dealt a stranger of that name:
    // they are what the status screen prints and what the compatibility maths
    // already reads off the actor. A recruited NPC whose actor carries none
    // keeps the rolled set, which is the only record they have.
    const traitIds = (actor._selectedTraits ?? [])
      .map(t => t && t.id).filter(id => id != null);
    if (traitIds.length) profile.traitIds = traitIds;

    // The skills the character actually knows. levelSkillBrackets is the sim's
    // ladder of what an NPC picks up as it levels; a traveller levels up in the
    // party instead, so it would only list spells they cannot cast.
    if (actor.skills) {
      profile.skillIds = actor.skills().map(s => s && s.id).filter(id => id != null);
      profile.levelSkillBrackets = {};
    }

    // Needs are the actor's own (TimeDateSystem), on the same 0-100 scale the
    // profile keeps them, so the panel never reports a traveller starving while
    // their character sheet says they are fed.
    const NEED_FIELDS = {
      hunger:  'hungerPercent',  sleep:   'sleepPercent', hygiene: 'hygienePercent',
      social:  'socialPercent',  leisure: 'leisurePercent',
    };
    for (const [field, fn] of Object.entries(NEED_FIELDS)) {
      if (typeof actor[fn] !== 'function') continue;
      profile[field] = Math.max(0, Math.min(100, Math.round(actor[fn]())));
    }
    // Same reading tickNeeds takes of an NPC, against the actor's own figures,
    // so the badge does not announce a hunger the character does not have.
    if (profile.hunger < 25)     profile.currentNeed = 'food';
    else if (profile.sleep < 20) profile.currentNeed = 'sleep';
    else                         profile.currentNeed = null;

    // A traveller carries the party purse, so their means are the party's rather
    // than the wealth band the roll gave them.
    if ($gameParty?.gold) {
      const gold = $gameParty.gold();
      profile.money = gold;
      // Same bands the generator hands out starting money from (wealthGoldBase),
      // split at the midpoint between one tier's base and the next.
      const edges = [25000, 250000, 2500000, 25000000];
      const fromPurse = edges.filter(edge => gold >= edge).length;
      // A band chosen at character creation (wealthTierChosen, written by the
      // detailed editor) outranks an EMPTY purse. The money each member brings
      // in is only handed over once creation finishes, so until then the purse
      // reports everybody destitute, and this sync , which runs on every read of
      // the profile , would undo the pick the moment it was made.
      profile.wealthTierBase = (fromPurse === 0 && profile.wealthTierChosen != null)
        ? profile.wealthTierChosen
        : fromPurse;
    }
  }

  // ==========================================================================
  // SECTION 3b2: GEAR (what a person wears)
  // ==========================================================================
  // profile.equipment is the one answer to what an NPC has on. It is dealt
  // once (NPCSim.Dev, the `_gearV` stamp, or the first read here) and kept, so
  // the Empathize panel, the trade table, the card wager and the recruit all
  // read the same kit. A profile a departed recruit was dressed back into
  // (NPCSystemParty dressLodgerProfile) stores the actor's slot snapshot
  // [{slot, kind, id}] instead, and that is read as it is, never re-rolled.
  //
  // The kit is one piece per equip slot: the trade picks the cut (a labourer's
  // work clothes, a guard's armour, a priest's robe, a clerk's formal wear),
  // the wealth tier picks the rarity (ItemUtils.getItemRarity), and the level
  // picks the stats inside that rarity.

  // i18n-ignore-start: rarity tier ids, job category ids and English name keywords
  const GEAR_RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  // Odds of each rarity for a piece, per wealth tier (0 destitute .. 4 rich).
  const GEAR_RARITY_ODDS = [
    [1.00, 0.00, 0.00, 0.00, 0.00],
    [0.60, 0.40, 0.00, 0.00, 0.00],
    [0.20, 0.60, 0.20, 0.00, 0.00],
    [0.00, 0.35, 0.55, 0.10, 0.00],
    [0.00, 0.00, 0.50, 0.45, 0.05],
  ];
  const GEAR_EPIC = 3;
  const GEAR_ETYPE = { weapon: 1, offhand: 2, head: 3, body: 4, gear: 5 };
  const GEAR_ATYPE = { clothes: 1, robe: 2, light: 3, heavy: 4, gear: 5, shield: 6 };
  // Per job category: the armour types the body piece is cut from, the odds
  // of a hat, a shield and a weapon, the weapon types a trade reaches for and
  // the words that pick the right cut off the rack.
  const GEAR_BY_JOB = {
    Labor:     { body: [1],       head: 0.35, shield: 0,    weapon: 0.15, words: /work|vest|overall|apron|denim|boots?|jacket|coat|shirt|trousers|jumpsuit|helm|cap/i },
    Technical: { body: [1],       head: 0.25, shield: 0,    weapon: 0.10, words: /work|vest|apron|coat|jacket|goggles|visor|lab|overall|frames/i },
    Social:    { body: [1],       head: 0.25, shield: 0,    weapon: 0.05, words: /blazer|suit|dress|tuxedo|gown|cocktail|formal|waistcoat|shirt|frames|hat/i },
    Magical:   { body: [2],       head: 0.40, shield: 0,    weapon: 0.40, wtypes: [6], words: /robe|mantle|shroud|cloak|hood|hat|circlet|diadem/i },
    Combat:    { body: [3, 4],    head: 0.70, shield: 0.30, weapon: 1.00, words: /armou?r|plate|vest|cuirass|riot|combat|guard|helm|patrol|legion/i },
    Criminal:  { body: [1, 3],    head: 0.30, shield: 0,    weapon: 0.60, words: /jacket|hood|coat|leather|mask|dark|shadow|night/i },
    General:   { body: [1],       head: 0.30, shield: 0,    weapon: 0.10, words: /uniform|vest|jacket|coat|shirt|cap/i },
    Faction:   { body: [1, 2, 3], head: 0.40, shield: 0.10, weapon: 0.40, words: /uniform|vest|coat|robe|mantle|armou?r/i },
  };
  const LIFE_STAGE_CHILD = new Set(["newborn", "child"]);
  // i18n-ignore-end
  const GEAR_NO_JOB = { body: [1], head: 0.30, shield: 0, weapon: 0.10, words: null };
  const GEAR_CHILD  = { body: [1], head: 0.20, shield: 0, weapon: 0,    words: null, child: true };

  function _isChildProfile(profile) {
    return !!profile && (!!profile._child || LIFE_STAGE_CHILD.has(profile.lifeStage));
  }

  function _gearJobOf(profile) {
    const id = profile?.currentJobId;
    if (!id) return null;
    return (window.WorkSystem?.Jobs || []).find(j => j && j.id === id) || null;
  }

  function _gearRarity(item) {
    const IU = window.ItemUtils;
    const name = IU && IU.getItemRarity ? (IU.getItemRarity(item) || {}).name : null;
    const i = GEAR_RARITIES.indexOf(name);
    if (i >= 0) return i;
    // The ladder js/db/Items/Rarity.json ships, for a load without ItemUtils.
    const p = item?.price || 0;
    return p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : p >= 1000 ? 1 : 0;
  }

  // A row somebody could actually own: never a "<-- Clothes -->" divider, a
  // nameless or free placeholder, a <Restricted> entry, the world's artifacts
  // or the procedural rows other systems mint into.
  function _gearSelectable(item) {
    if (!item || !(item.id > 0)) return false;
    const IU = window.ItemUtils;
    if (IU && IU.isSelectableItem) {
      if (!IU.isSelectableItem(item)) return false;
    } else {
      const n = String(item.name || "").trim();
      if (!n || /^<--.*-->$/.test(n)) return false;
    }
    if (!((item.price || 0) > 0)) return false;
    if (item.isGenerated || /<Procedural|<category:\s*(artifact|procedural)\s*>/i.test(item.note || "")) return false;
    return !window.MagicNature || window.MagicNature.allowsData(item);
  }

  let _gearPoolCache = null;
  function _gearPools() {
    const key = [_natureLevel(), ($dataWeapons || []).length, ($dataArmors || []).length].join("|");
    if (_gearPoolCache && _gearPoolCache.key === key) return _gearPoolCache;
    const wrap = (list) => (list || []).filter(_gearSelectable).map(item => ({ item, rarity: _gearRarity(item) }));
    _gearPoolCache = { key, weapons: wrap($dataWeapons), armors: wrap($dataArmors) };
    return _gearPoolCache;
  }

  function _rollGearRarity(rng, tier, epicTaken) {
    const odds = GEAR_RARITY_ODDS[tier];
    let r = rng.next(), i = 0;
    for (; i < odds.length - 1; i++) {
      if (r < odds[i]) break;
      r -= odds[i];
    }
    // One purple piece (Epic or better) at most: it stays the thing people
    // notice about the rich rather than their whole outfit.
    return epicTaken ? Math.min(i, GEAR_EPIC - 1) : i;
  }

  // The wanted rarity, else the nearest below, else the nearest above; inside
  // it, the stats nearest the person's level and the cut their trade wears.
  function _pickGearPiece(pool, rarity, rng, words, targetStats) {
    if (!pool.length) return null;
    const order = [rarity];
    for (let d = 1; d < GEAR_RARITIES.length; d++) {
      if (rarity - d >= 0) order.push(rarity - d);
    }
    for (let d = 1; d < GEAR_RARITIES.length; d++) {
      if (rarity + d < GEAR_RARITIES.length) order.push(rarity + d);
    }
    for (const r of order) {
      let best = null, bestScore = -1;
      for (const p of pool) {
        if (p.rarity !== r) continue;
        const diff = Math.abs(_itemLevel(p.item) - targetStats);
        const closeness = 1 / (1 + (diff / Math.max(1, targetStats)) * 3);
        const fit = words && words.test(p.item.name || "") ? 0.35 : 0;
        const score = rng.next() * 0.45 + closeness * 0.2 + fit;
        if (score > bestScore) { bestScore = score; best = p.item; }
      }
      if (best) return best;
    }
    return null;
  }

  function _classWeaponTypes(classId) {
    const cls = classId && typeof $dataClasses !== "undefined" && $dataClasses ? $dataClasses[classId] : null;
    return (cls?.traits || []).filter(t => t && t.code === 51).map(t => t.dataId);
  }

  // The seeded kit for a person, from scratch. Pure: stores nothing.
  function _rollEquipment(eventName, classId, wealthTierBase, profile) {
    const worldSeed = window.NPCShared.worldSeed();
    const rng = new SeededRng(nameToSeed(eventName + "_gear") ^ (worldSeed >>> 0));
    const tier = Math.max(0, Math.min(4, Number(wealthTierBase) | 0));
    const child = _isChildProfile(profile);
    const job = child ? null : _gearJobOf(profile);
    const plan = child ? GEAR_CHILD
      : ((job && GEAR_BY_JOB[job.category]) || Object.assign({}, GEAR_NO_JOB, { weapon: classId ? 0.5 : 0.1 }));
    const lost = new Set(profile?.lostEquipIds || []);
    const pools = _gearPools();
    const armors = pools.armors.filter(p => !lost.has(p.item.id));
    const level = (profile && typeof profile.level === "number" && profile.level > 0) ? profile.level : _partyMedianLevel();
    const targetStats = level * 5 * [0.4, 0.7, 1.0, 1.4, 2.0][tier];
    let epicTaken = false;
    const take = (pool) => {
      const item = _pickGearPiece(pool, _rollGearRarity(rng, tier, epicTaken), rng, plan.words, targetStats);
      if (item && _gearRarity(item) >= GEAR_EPIC) epicTaken = true;
      return item;
    };
    const slot = (etype, atypes) => armors.filter(p => p.item.etypeId === etype && atypes.includes(p.item.atypeId));

    const armorIds = [];
    // Body: always, cut from the trade's armour types, clothes when the rack
    // holds none of them.
    let bodyPool = slot(GEAR_ETYPE.body, plan.body);
    if (!bodyPool.length) bodyPool = slot(GEAR_ETYPE.body, [GEAR_ATYPE.clothes]);
    const body = take(bodyPool);
    if (body) armorIds.push(body.id);

    const headRoll = rng.next(), shieldRoll = rng.next(), gearRoll = rng.next(), weaponRoll = rng.next();
    if (headRoll < plan.head) {
      const types = plan.child ? [GEAR_ATYPE.clothes] : plan.body.concat(GEAR_ATYPE.clothes);
      let headPool = slot(GEAR_ETYPE.head, types);
      if (!headPool.length) headPool = slot(GEAR_ETYPE.head, [GEAR_ATYPE.clothes]);
      const head = take(headPool);
      if (head) armorIds.push(head.id);
    }
    if (!plan.child && shieldRoll < plan.shield) {
      const shield = take(slot(GEAR_ETYPE.offhand, [GEAR_ATYPE.shield]));
      if (shield) armorIds.push(shield.id);
    }
    if (!plan.child && gearRoll < 0.15 + 0.08 * tier) {
      const acc = take(slot(GEAR_ETYPE.gear, [GEAR_ATYPE.gear]));
      if (acc) armorIds.push(acc.id);
    }

    // A child carries no weapon at all.
    let weaponId = null;
    if (!plan.child && weaponRoll < plan.weapon) {
      let weapons = pools.weapons.filter(p => !lost.has(p.item.id));
      const wanted = plan.wtypes || _classWeaponTypes(classId);
      if (wanted.length) {
        const typed = weapons.filter(p => wanted.includes(p.item.wtypeId));
        if (typed.length) weapons = typed;
      }
      const weapon = take(weapons);
      if (weapon) weaponId = weapon.id;
    }
    return { weaponId, armorIds };
  }

  // Either stored shape, as {weaponId, armorIds}; null when nothing is stored.
  function _normalizeEquipment(eq) {
    if (!eq) return null;
    if (Array.isArray(eq)) {
      let weaponId = null;
      const armorIds = [];
      for (const e of eq) {
        if (!e) continue;
        if (e.kind === "weapon") { if (weaponId == null) weaponId = Number(e.id); } // i18n-ignore: item kind
        else if (e.kind === "armor") armorIds.push(Number(e.id));                   // i18n-ignore: item kind
      }
      return { weaponId, armorIds };
    }
    if (typeof eq === "object") {
      return {
        weaponId: eq.weaponId != null ? Number(eq.weaponId) : null,
        armorIds: Array.isArray(eq.armorIds) ? eq.armorIds.map(Number) : [],
      };
    }
    return null;
  }

  // Deals and stores the kit when the profile holds none. Answers the stored
  // kit (a recruit's snapshot stays as it was).
  function _ensureEquipment(eventName, profile, classId, wealthTierBase) {
    if (!profile) return null;
    const stored = _normalizeEquipment(profile.equipment);
    if (stored) return stored;
    const kit = _rollEquipment(eventName, classId ?? profile.assignedClassId,
      profile.wealthTierBase ?? wealthTierBase ?? 2, profile);
    profile.equipment = { weaponId: kit.weaponId, armorIds: kit.armorIds.slice() };
    return kit;
  }

  function _generateEquipment(eventName, classId, wealthTierBase) {
    // A beast carries no gear. It has no hands to hold a blade with, no money
    // to have bought one and nobody to have been issued one by: a dog on a
    // street corner wearing a halberd and a cloak is the roll leaking through.
    // The class alone answers it (NPCCreature owns the boundary), so this holds
    // wherever the equipment is read from, the panel and the recruit alike.
    const NC = window.NPCCreature;
    if (NC && NC.isNonSentientClassId(classId) && !NC.isPlayerCharacterName(eventName)) {
      return { weaponId: null, armorIds: [] };
    }
    const profile = (eventName && $gameSystem?._npcSociety?.[eventName])
      || (window.NPCSim?.getProfile?.(eventName)) || null;
    if (profile && NC?.isNonSentientProfile?.(profile) && !NC.isPlayerCharacterName(eventName)) {
      return { weaponId: null, armorIds: [] };
    }
    const kit = profile
      ? _ensureEquipment(eventName, profile, classId, wealthTierBase)
      : _rollEquipment(eventName, classId, wealthTierBase ?? 2, null);
    // Whatever was lost at the card table is gone from the kit, not replaced.
    const lost = new Set(profile?.lostEquipIds || []);
    return {
      weaponId: kit.weaponId && !lost.has(kit.weaponId) ? kit.weaponId : null,
      armorIds: (kit.armorIds || []).filter(id => !lost.has(id)),
    };
  }

  window.NPCSocietyGetEquip = _generateEquipment;
  // The gear dealer itself (SECTION 3b2), for the simulation's `_gearV` pass,
  // the shops an NPC buys from and the tests.
  window.NPCSocietyGear = {
    roll: _rollEquipment,
    ensure: _ensureEquipment,
    normalize: _normalizeEquipment,
    rarityOf: _gearRarity,
    isSelectable: _gearSelectable,
    isChild: _isChildProfile,
    RARITIES: GEAR_RARITIES,
  };

  Object.assign(window.NPCSocietyRegistry._internal, {
    _syncLocalLevel, _syncPartyMemberStats,
  });
})();
