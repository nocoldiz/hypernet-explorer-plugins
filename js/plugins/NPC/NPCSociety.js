/*:
 * @target MZ
 * @plugindesc NPCSociety v2.0.0, NPC identity: personality, traits, wealth, skills, factions & backstory
 * @author Omni-Lex
 * @help
 * Owns everything that makes an NPC *who they are*:
 *   - A deterministic society profile for every NPC (pool and procedural):
 *     personality, traits, ideology, wealth, skills, items, faction, stats,
 *     home, work schedule, pre-existing relationships, equipment.
 *   - A procedural backstory pulled from HistorySimulator's world timeline
 *     (formerly the separate NPCSystemHistorySimulator plugin): formative
 *     events the NPC "lived through", birthplace and birth year, rendered
 *     as the BACKGROUND section of the NPCEmpathize panel.
 *
 * Every random facet is seeded from nameToSeed(npcName) XOR the world seed
 * (window.HistoryManager.getSeed()), so identities are unique per NPC,
 * consistent within a save, and coherently different per world seed.
 *
 * Profile data is displayed via NPCEmpathize (plugin command: NPCEmpathize Open).
 *
 * Load order: NPCShared → NPCSystem → MousePan → TimeDateSystem → NPCSociety
 *
 * Globals: NPCSocietyRegistry, NPCSocietyConfig, NPCSocietyGetEquip,
 *          NPCHistSim (backstory API), _NPCSocietyDataLoader
 *
 * See docs/npcsociety_system.md for full documentation.
 */

(() => {
  "use strict";

  // ==========================================================================
  // SECTION 1: CONFIGURATION
  // ==========================================================================
  const SocConfig = {
    CARD_WIDTH: 270,
    CARD_Z_INDEX: 496,
    FACTION_CHANCE: 0.04,
    WEALTH_WEIGHTS: [5, 15, 35, 30, 15],
    WEALTH_ICON: 314,
    FACTION_FALLBACK_ICON: 187,

    // PERSONALITY_ICONS removed, now loaded from db/Health/PersonalityData.json

    // MOOD_TABLE_EN / MOOD_TABLE_IT removed, personality no longer follows time-of-day mood

    // FACTION_DISPLAY_NAMES removed, now loaded from i18n/<lang>/faction.json by DataLoader

  };

  // ==========================================================================
  // SECTION 2: DATA LOADER
  // ==========================================================================
  const DataLoader = {
    personalities: null,
    traits: null,
    factions: null,
    ideologies: null,
    npcData: null,
    classNames: null,
    factionNames: null,
    classSkillCategories: null,
    isReady: false,

    _getLang() {
      return (ConfigManager && ConfigManager.language) || "en";
    },

    _loadClasses(lang) {
      return fetch("js/i18n/" + lang + "/classes.json")
        .then(r => r.json())
        .then(data => {
          // Convert {"1":{"name":"Freelancer"},...} to {1:"Freelancer",...}
          const map = {};
          for (const key of Object.keys(data)) {
            map[key] = data[key].name || "";
          }
          this.classNames = map;
        })
        .catch(() => {
          // Fallback to English if the requested language file fails
          if (lang !== "en") {
            return this._loadClasses("en");
          }
          this.classNames = {};
        });
    },

    _loadFactions(lang) {
      return fetch("js/i18n/" + lang + "/faction.json")
        .then(r => r.json())
        .then(data => {
          // Convert {"factions":{"magesguild":{"name":"Mages Guild",...},...}}
          // to {magesguild:"Mages Guild",...}
          const map = {};
          const factions = data && data.factions;
          if (factions) {
            for (const key of Object.keys(factions)) {
              map[key] = factions[key].name || "";
            }
          }
          this.factionNames = map;
        })
        .catch(() => {
          // Fallback to English if the requested language file fails
          if (lang !== "en") {
            return this._loadFactions("en");
          }
          this.factionNames = {};
        });
    },

    getClassName(classId) {
      if (!classId || !this.classNames) return "";
      return this.classNames[classId] || "";
    },

    getFactionName(faction) {
      if (!faction || !this.factionNames) return null;
      // Faction names in Factions.json use dot notation: "factions.magesguild.name"
      const seg = (faction.name || "").split(".")[1];
      if (seg && this.factionNames[seg]) return this.factionNames[seg];
      return null;
    },

    getClassSkillCategories(classId) {
      if (!classId || !this.classSkillCategories) return [];
      const e = this.classSkillCategories[classId] || this.classSkillCategories[String(classId)];
      if (!e) return [];
      // Categories.json now stores { primary:[], secondary:[] }; flatten to the
      // combined preferred-category list. Tolerate the legacy flat-array shape.
      if (Array.isArray(e)) return e;
      return [...(e.primary || []), ...(e.secondary || [])];
    },

    load() {
      const lang = this._getLang();

      // Load all js/db/ files from DataService-registered window objects
      // PersonalityData.json is now { list:[...personalities], capabilityThoughts:{...} };
      // older builds shipped a bare array, accept either shape.
      const _personalityData      = window.Health?.PersonalityData || null;
      this.personalities          = Array.isArray(_personalityData) ? _personalityData : (_personalityData?.list || null);
      this.capabilityThoughts     = Array.isArray(_personalityData) ? null : (_personalityData?.capabilityThoughts || null);
      this.traits                 = window.Health?.Traits || null;
      this.factions               = window.WorldGen?.Factions || null;
      this.ideologies             = window.WorldGen?.Ideology || null;
      this.npcData                = window.WorldGen?.NPCs || null;
      this.classSkillCategories   = window.Skills?.Categories?.classSkillCategories || null;

      // i18n files (outside js/db/) are still loaded via async fetch
      Promise.all([
        this._loadClasses(lang),
        this._loadFactions(lang),
      ]).then(() => {
        this.isReady = true;
      }).catch(e => {
        console.error("[NPCSociety] DataLoader failed:", e);
        // Mark as ready anyway so the system can function with partial data
        this.isReady = true;
      });
    }
  };
  DataLoader.load();
  // Expose for NPCSimulationCore trait lookups
  window._NPCSocietyDataLoader = DataLoader;

  // ==========================================================================
  // SECTION 3: SHARED UTILITIES (see NPCShared.js)
  // ==========================================================================
  const { nameToSeed, Rng: SeededRng, seededShuffle, escapeHtml } = window.NPCShared;

  // ==========================================================================
  // SECTION 3a: PRE-EXISTING SOCIAL GRAPH
  // ==========================================================================

  // Returns the map-group key whose `maps` array contains mapId, or null.
  function _mapGroupForMapId(mapId) {
    const groups = $gameSystem?._npcMapGroups;
    if (!groups || mapId == null) return null;
    for (const [groupName, group] of Object.entries(groups)) {
      if (Array.isArray(group?.maps) && group.maps.includes(mapId)) return groupName;
    }
    return null;
  }

  // Deterministically rolls pre-existing relationships between `eventName` and
  // every other NPC already known to $gameSystem._npcSocialRegistry. Each pair
  // is decided exactly once (when the second NPC of the pair is generated),
  // using a sorted-name pair seed so the outcome doesn't depend on discovery order.
  // A world leader (js/db/WorldGen/Leaders.json) is a person before they are an
  // office, and most of them never stand on a map: the wiki opens their panel by
  // name alone, and this is where the person behind that name is minted.
  // window.LeaderPersona owns what a leader is, so the simulated character and
  // the article about them can never disagree. For the historical half of the
  // book that answer is written down rather than rolled: the day they were
  // born, the town, their gender, the orientation the public record gives them.
  //
  // Bumped whenever the identity a leader is minted with changes, so a world
  // whose profiles were minted under an older answer is brought up to date on
  // the next read rather than keeping a rolled birthday for ever.
  const LEADER_IDENTITY_REV = 2;

  function _applyLeaderIdentity(eventName, profile) {
    if (!profile) return;
    profile._leaderIdentityRev = LEADER_IDENTITY_REV;
    const leader = window.LeaderPersona?.identityFor?.(eventName);
    if (!leader) return;
    if (leader.assignedClassId) profile.assignedClassId = leader.assignedClassId;
    if (leader.gender !== undefined) profile.gender = leader.gender;
    if (leader.birthYear !== undefined) profile._birthYearOverride = leader.birthYear;
    if (leader.birthplace) profile._birthplaceOverride = leader.birthplace;
    // A real person's orientation is a matter of record rather than of the
    // roll, the same way a pre-made character's is. A leader the record says
    // nothing about keeps the rolled one.
    if (leader.sexualKey || leader.romanticKey) {
      profile._orientOverride = {
        sexualKey: leader.sexualKey || null,
        romanticKey: leader.romanticKey || null,
      };
    }
    profile._isWorldLeader = true;
    // The same person is sometimes also a dossier the player can take into the
    // party, which the panel says out loud wherever they are read.
    if (leader.isPresetCharacter) profile._isPresetCharacter = true;
  }

  // Whether a name belongs to the political class. A profile that has already
  // been minted says so itself; a leader nobody has opened yet is still in the
  // book, so the book is asked as well.
  function _isWorldLeaderName(name, profile) {
    if (profile && profile._isWorldLeader) return true;
    try { return !!window.LeaderPersona?.isLeader?.(name); } catch (e) { return false; }
  }

  // How likely two world leaders are to already know each other. They never
  // share a map group (most of them are never drawn on a map at all), so the
  // ordinary neighbour test says nothing about them: what puts two of them in
  // the same room is holding office in the same country, or at the same time.
  function _leaderPairProbability(nameA, nameB) {
    const hm = window.HistoryManager;
    const a = hm?.getLeaderRecord?.(nameA);
    const b = hm?.getLeaderRecord?.(nameB);
    if (!a || !b) return 0.10;
    const sameCountry = !!(a.country && b.country && a.country === b.country);
    const ay = a.years || [], by = b.years || [];
    const overlap = ay.length >= 2 && by.length >= 2 &&
      Number(ay[0]) <= Number(by[1]) && Number(by[0]) <= Number(ay[1]);
    if (sameCountry && overlap) return 0.80;   // cabinet colleagues, rivals, a succession
    if (sameCountry) return 0.40;              // the same office, a generation apart
    if (overlap) return 0.22;                  // two heads of state at one table
    return 0.05;                               // a name in a history book
  }

  function _generatePreexistingRelationships(eventName, profile) {
    if (!$gameSystem) return;
    if (!$gameSystem._npcSocialRegistry) $gameSystem._npcSocialRegistry = {};
    const registry   = $gameSystem._npcSocialRegistry;
    if (registry[eventName]) return; // already seeded against the registry once
    const worldSeed  = window.NPCShared.worldSeed();
    const group      = _mapGroupForMapId(profile.homeMapId);

    const isLeader = _isWorldLeaderName(eventName, profile);

    for (const [otherName, otherInfo] of Object.entries(registry)) {
      if (otherName === eventName) continue;
      const otherProfile = $gameSystem._npcSociety?.[otherName];
      if (!otherProfile) continue;

      // A world leader's circle is the political class and nothing else: they
      // know other heads of state, ministers, popes and generals, and they do
      // not know the baker two towns over. The test runs from both sides, so a
      // leader minted before a townsperson and one minted after are the same.
      const otherIsLeader = _isWorldLeaderName(otherName, otherProfile);
      if (isLeader !== otherIsLeader) continue;

      const pairKey  = [eventName, otherName].sort().join('|');
      const rng      = new SeededRng(nameToSeed(pairKey + '_social') ^ worldSeed);
      const sameGroup = group != null && group === otherInfo.group;
      const prob     = isLeader
        ? _leaderPairProbability(eventName, otherName)
        : (sameGroup ? 0.35 : 0.06);

      if (rng.next() < prob) {
        const meetCount = rng.nextInt(1, 40);
        const opAB = rng.nextInt(-60, 61);
        const opBA = rng.nextInt(-60, 61);
        if (!profile.relationships) profile.relationships = {};
        if (!otherProfile.relationships) otherProfile.relationships = {};
        profile.relationships[otherName] = { meetCount, opinion: opAB, preExisting: true };
        otherProfile.relationships[eventName] = { meetCount, opinion: opBA, preExisting: true };
      }
    }

    registry[eventName] = { homeMapId: profile.homeMapId, group };
  }

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

  function _generateEquipment(eventName, classId, wealthTierBase) {
    const worldSeed = window.NPCShared.worldSeed();
    const rng = new SeededRng(nameToSeed(eventName + "_equip") ^ (worldSeed >>> 0));
    const hasClass = !!classId;
    // Nobody in a severed world owns an enchanted blade, and nobody in an
    // unbound one owns technology (window.MagicNature).
    const _natureOk = (e) => !window.MagicNature || window.MagicNature.allowsData(e);
    const allWeapons = ($dataWeapons || []).filter(w => w && w.id > 0 && w.name && _natureOk(w));
    const allArmors  = ($dataArmors  || []).filter(a => a && a.id > 0 && a.name && _natureOk(a));

    if (!hasClass) {
      // No class: clothes-category armors, rarely a cheap weapon
      let armorPool = allArmors.filter(a => /<category:\s*clothes>/i.test(a.note || ''));
      if (!armorPool.length) {
        armorPool = [...allArmors].sort((x, y) => _itemLevel(x) - _itemLevel(y))
          .slice(0, Math.max(1, Math.floor(allArmors.length * 0.25)));
      }
      const shuffledArmors = seededShuffle([...armorPool], rng);
      const armorIds = shuffledArmors.slice(0, Math.min(2, shuffledArmors.length)).map(a => a.id);

      let weaponId = null;
      if (rng.next() < 0.15 && allWeapons.length > 0) {
        const cheapPool = [...allWeapons].sort((x, y) => _itemLevel(x) - _itemLevel(y))
          .slice(0, Math.max(1, Math.floor(allWeapons.length * 0.2)));
        weaponId = seededShuffle(cheapPool, rng)[0].id;
      }
      return { weaponId, armorIds };
    }

    // Class NPC: target item stat total = party level × 5 × wealth multiplier
    const targetLevel = _partyMedianLevel();
    const wealthMults = [0.4, 0.7, 1.0, 1.4, 2.0];
    const targetStats = targetLevel * 5 * wealthMults[Math.min(wealthTierBase, 4)];

    const _score = (item) => {
      const diff = Math.abs(_itemLevel(item) - targetStats);
      const closeness = 1 / (1 + (diff / Math.max(1, targetStats)) * 3);
      return rng.next() * 0.4 + closeness * 0.6;
    };

    let weaponId = null;
    if (allWeapons.length > 0) {
      const scored = allWeapons.map(w => ({ id: w.id, score: _score(w) }));
      scored.sort((a, b) => b.score - a.score);
      weaponId = scored[0].id;
    }

    const armorIds = [];
    if (allArmors.length > 0) {
      const numArmors = rng.nextInt(1, 4);
      const scored = allArmors.map(a => ({ id: a.id, score: _score(a) }));
      scored.sort((a, b) => b.score - a.score);
      const seen = new Set();
      for (const s of scored) {
        if (armorIds.length >= numArmors) break;
        if (!seen.has(s.id)) { armorIds.push(s.id); seen.add(s.id); }
      }
    }

    return { weaponId, armorIds };
  }

  // ==========================================================================
  // SECTION 4: PROFILE GENERATOR
  // ==========================================================================

  // Caches for filtered/pre-parsed data that is identical across all NPCs.
  // Built once on first generate() call; never rebuilt unless explicitly cleared.
  let _cachedBaseSkills   = null; // { id, mpCost, tpCost, _category }[]
  let _cachedValidItems   = null; // { id, _category }[]
  const _cachedClassLearnings = new Map(); // classId → Set<skillId>

  // The pools depend on the world's magic level, and a world can be loaded
  // over another one without a restart, so the caches are keyed by it.
  let _cachedNatureLevel = null;
  function _natureLevel() {
    return window.MagicNature ? window.MagicNature.level() : 'normal';
  }
  function _checkNatureCaches() {
    const level = _natureLevel();
    if (_cachedNatureLevel !== level) {
      _cachedNatureLevel = level;
      _cachedBaseSkills = null;
      _cachedValidItems = null;
    }
  }

  function _getBaseSkills() {
    _checkNatureCaches();
    if (!_cachedBaseSkills) {
      _cachedBaseSkills = ($dataSkills || [])
        .filter(s => s && s.id && s.name &&
          (!window.MagicNature || window.MagicNature.allowsData(s)))
        .map(s => {
          const m = (s.note || '').match(/<category:(\w+)>/i);
          return { id: s.id, mpCost: s.mpCost || 0, tpCost: s.tpCost || 0, _category: m ? m[1].toLowerCase() : '' };
        })
        .filter(s => s._category !== 'basic');
    }
    return _cachedBaseSkills;
  }

  function _getValidItems() {
    _checkNatureCaches();
    if (!_cachedValidItems) {
      _cachedValidItems = ($dataItems || [])
        .filter(i => i && i.id > 0 && i.name && i.itypeId === 1 &&
          (!window.MagicNature || window.MagicNature.allowsData(i)))
        .map(i => {
          const m = (i.note || '').match(/<category:(\w+)>/i);
          return { id: i.id, _category: m ? m[1].toLowerCase() : '' };
        });
    }
    return _cachedValidItems;
  }

  function _getClassLearnings(classId) {
    if (!classId || !$dataClasses?.[classId]) return new Set();
    if (!_cachedClassLearnings.has(classId)) {
      _cachedClassLearnings.set(classId, new Set($dataClasses[classId].learnings.map(l => l.skillId)));
    }
    return _cachedClassLearnings.get(classId);
  }

  // ==========================================================================
  // SECTION 3c: EVENT INITIALIZATION SPEC
  // ==========================================================================
  // An event may dictate the person generated onto it instead of accepting the
  // seeded roll. Any comment on the event page written as `key: value` is read
  // here and forced onto the profile the moment it is minted:
  //
  //     class: Witch
  //     bust: Butler
  //     level: 10
  //     ideology: pacifist_theocratic
  //     traits: obese, trigger:happy
  //
  // Every key answers one of the things the Empathize panel shows, so a
  // written character can be pinned down as tightly or as loosely as the map
  // wants: whatever is not named is still rolled, and stays coherent with what
  // is. Unknown keys are ignored (the single-token bust comment and the
  // `Preset: <name>` dossier tag are other systems' conventions and pass
  // straight through), so this can never break an event already using comments
  // for something else.
  //
  // Values are matched loosely: an id, the identifier in the data file, or the
  // name the player reads, all case- and punctuation-insensitive. That is why
  // `trigger:happy` finds `traits.trigger_happy.name` even though it holds a
  // colon of its own: only the FIRST colon of a line separates key from value.
  //
  // docs/NPCInitializationExample.md is the worked catalogue of every key.

  const _normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Identifier inside a dotted i18n key ("traits.trigger_happy.name" -> the
  // "trigger_happy" in the middle), which is what a map author reads off the
  // data file and writes in the comment.
  function _identSegment(key) {
    const parts = String(key ?? '').split('.');
    if (parts.length >= 3) return parts.slice(1, -1).join('_');
    return parts[parts.length - 1] || '';
  }

  const _trOrEmpty = (key) => (key && window.T?.has?.(key)) ? window.T(key) : '';

  // True when `value` names any of `candidates` (an id, an identifier, or a
  // localized display name), compared normalized.
  function _namesOne(value, candidates) {
    const want = _normKey(value);
    if (!want) return false;
    return candidates.some(c => c != null && _normKey(c) === want);
  }

  const NPCInitSpec = {
    // Every key the spec understands, and the other spellings a map author
    // might reasonably write for it.
    ALIASES: {
      class: 'class', classid: 'class', job: 'job', jobid: 'job',
      bust: 'bust', face: 'bust', portrait: 'bust',
      sprite: 'sprite', spritekey: 'sprite', character: 'sprite',
      bustindex: 'bustIndex', faceindex: 'bustIndex',
      gender: 'gender', sex: 'gender',
      archetype: 'archetype', creature: 'creature',
      level: 'level', exp: 'exp',
      atk: 'atk', str: 'atk', def: 'def', con: 'def',
      mat: 'mat', int: 'mat', mdf: 'mdf', wis: 'mdf',
      agi: 'agi', dex: 'agi', luk: 'luk', psi: 'luk',
      mhp: 'mhp', hp: 'mhp', mmp: 'mmp', mp: 'mmp',
      arcane: 'arcane', substance: 'substance', stealth: 'stealth',
      intimidation: 'intimidation',
      personality: 'personality', ideology: 'ideology', creed: 'ideology',
      faction: 'faction', traits: 'traits', trait: 'traits',
      skills: 'skills', skill: 'skills', items: 'items', item: 'items',
      morality: 'morality', moralityscore: 'morality',
      wealth: 'wealth', wealthtier: 'wealth', money: 'money',
      workstart: 'workStart', workend: 'workEnd', workshift: 'workShift',
      hunger: 'hunger', sleep: 'sleep', hygiene: 'hygiene',
      social: 'social', leisure: 'leisure',
      opinion: 'opinion', playeropinion: 'opinion',
      birthyear: 'birthYear', age: 'age', birthplace: 'birthplace',
      orientation: 'sexual', sexual: 'sexual', sexuality: 'sexual',
      romantic: 'romantic', romance: 'romantic',
      relationship: 'relationship', relationshipstyle: 'relationship',
      home: 'homeGroup', homegroup: 'homeGroup', homemap: 'homeMapId',
    },

    // ---- Reading the comment lines -----------------------------------------

    // Parses `key: value` lines into a canonical spec object. Anything that is
    // not a recognised key is dropped, so this is safe to run over every
    // comment on every event.
    parseLines(lines) {
      const spec = {};
      for (const line of (lines || [])) {
        const text = String(line ?? '').trim();
        const at = text.indexOf(':');
        if (at <= 0) continue;
        const canon = this.ALIASES[_normKey(text.slice(0, at))];
        if (!canon) continue;
        const value = text.slice(at + 1).trim();
        if (!value) continue;
        if (spec[canon] === undefined) spec[canon] = value;
      }
      return Object.keys(spec).length ? spec : null;
    },

    // Comment text of one event page (codes 108/408).
    _pageComments(page) {
      if (!page || !page.list) return [];
      return page.list
        .filter(cmd => cmd.code === 108 || cmd.code === 408)
        .map(cmd => String(cmd.parameters?.[0] ?? '').trim())
        .filter(Boolean);
    },

    // From the raw event JSON: every page is read and the first page to name a
    // key wins it. The world-roster pass mints people from map data alone,
    // with no Game_Event to ask which page is active, and a character written
    // across several pages is still the same character.
    fromEventData(eventData) {
      if (!eventData || !eventData.pages || !eventData.pages.length) return null;
      const lines = [];
      for (const page of eventData.pages) lines.push(...this._pageComments(page));
      return this.parseLines(lines);
    },

    // From a live Game_Event: the active page first (it is the one the player
    // is looking at), then the rest as a fallback.
    fromEvent(event) {
      const data = event?.event?.();
      if (!data || !data.pages || !data.pages.length) return null;
      let active = null;
      if (typeof event.meetsConditions === 'function')
        active = data.pages.find(p => event.meetsConditions(p)) || null;
      if (!active && typeof event.page === 'function') active = event.page() || null;
      const lines = active ? this._pageComments(active) : [];
      for (const page of data.pages) {
        if (page === active) continue;
        lines.push(...this._pageComments(page));
      }
      return this.parseLines(lines);
    },

    // The spec for a name, for every caller that has only the name in hand
    // (the dialogue box, the panel, the wiki). Looks the event up on the
    // current map, then falls back to the spec already recorded on the profile.
    forName(eventName) {
      if (!eventName) return null;
      if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.events) {
        for (const ev of $gameMap.events()) {
          if (ev?.event?.()?.name === eventName) {
            const spec = this.fromEvent(ev);
            if (spec) return spec;
          }
        }
      }
      return $gameSystem?._npcSociety?.[eventName]?._initSpec ?? null;
    },

    // The bust an event names, for the resolvers that draw the face. Answered
    // here rather than in each of them so the message box and the Empathize
    // panel can never disagree about which portrait a written character wears.
    bustFor(eventName, event) {
      const spec = (event ? this.fromEvent(event) : null) || this.forName(eventName);
      return spec?.bust || null;
    },

    // ---- Resolving a written value to the thing it names --------------------

    classId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataClasses?.[n]) return n;
      const names = DataLoader.classNames || {};
      for (const id of Object.keys(names)) {
        if (_namesOne(value, [names[id]])) return Number(id);
      }
      for (const cls of ($dataClasses || [])) {
        if (cls && _namesOne(value, [cls.name])) return cls.id;
      }
      return null;
    },

    traitId(value) {
      const traits = DataLoader.traits || [];
      const n = Number(value);
      if (Number.isFinite(n) && traits.some(t => t.id === n)) return n;
      for (const t of traits) {
        if (_namesOne(value, [_identSegment(t.name), _trOrEmpty(t.name)])) return t.id;
      }
      return null;
    },

    // { index, id } of the creed, or null.
    ideology(value) {
      const list = DataLoader.ideologies || [];
      for (let i = 0; i < list.length; i++) {
        const ideo = list[i];
        if (!ideo) continue;
        if (_namesOne(value, [ideo.id, _identSegment(ideo.name), _trOrEmpty(ideo.name)]))
          return { index: i, id: ideo.id };
      }
      return null;
    },

    factionIndex(value) {
      const list = DataLoader.factions || [];
      const n = Number(value);
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f) continue;
        if (Number.isFinite(n) && f.id === n) return i;
        if (_namesOne(value, [_identSegment(f.name), _trOrEmpty(f.name), DataLoader.getFactionName(f)]))
          return i;
      }
      return -1;
    },

    personalityIndex(value) {
      const list = DataLoader.personalities || [];
      const n = Number(value);
      if (Number.isFinite(n) && list[n]) return n;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && _namesOne(value, [list[i].name])) return i;
      }
      return -1;
    },

    skillId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataSkills?.[n]) return n;
      for (const s of ($dataSkills || [])) {
        if (s && s.name && _namesOne(value, [s.name])) return s.id;
      }
      return null;
    },

    itemId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataItems?.[n]) return n;
      for (const i of ($dataItems || [])) {
        if (i && i.name && _namesOne(value, [i.name])) return i.id;
      }
      return null;
    },

    // 0 jobless, a Jobs.json id, or null when nothing matches.
    jobId(value) {
      const norm = _normKey(value);
      if (norm === 'none' || norm === 'jobless') return 0;
      const jobs = window.WorkSystem?.Jobs || [];
      const n = Number(value);
      if (Number.isFinite(n) && jobs.some(j => j.id === n)) return n;
      for (const j of jobs) {
        if (_namesOne(value, [j.spec, _trOrEmpty(j.name)])) return j.id;
      }
      return null;
    },

    // 0 male, 1 female, 2 non-binary, 3 cocoon: the order the pronoun table is
    // written in (see SECTION 7).
    gender(value) {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(Math.max(n | 0, 0), 3);
      const keys = [['male', 'man', 'm', 'he'], ['female', 'woman', 'f', 'she'],
                    ['nonbinary', 'enby', 'nb', 'they'], ['cocoon', 'xe', 'neo']];
      for (let i = 0; i < keys.length; i++) {
        if (_namesOne(value, keys[i])) return i;
      }
      return null;
    },

    // 0 destitute .. 4 wealthy.
    wealthTier(value) {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(Math.max(n | 0, 0), 4);
      const tiers = [['destitute', 'broke'], ['poor'], ['workingclass', 'working'],
                     ['middleclass', 'middle', 'comfortable'], ['wealthy', 'rich']];
      for (let i = 0; i < tiers.length; i++) {
        if (_namesOne(value, tiers[i])) return i;
      }
      return null;
    },

    orientationKey(kind, value) {
      const list = window.NPCOrientationData?.()?.[kind] || [];
      for (const o of list) {
        if (o && _namesOne(value, [o.key, _identSegment(o.name), _trOrEmpty(o.name)])) return o.key;
      }
      return null;
    },

    relationshipKey(value) {
      const list = window.NPCRelationshipData?.()?.styles || [];
      for (const s of list) {
        if (s && _namesOne(value, [s.key, _identSegment(s.name), _trOrEmpty(s.name)])) return s.key;
      }
      return null;
    },

    // ---- Forcing it onto the profile ---------------------------------------

    // Applies `spec` to `profile`, in place. Called once, right after the
    // profile is minted, and again for the identity half whenever the sprite
    // reconciler has had a chance to overwrite it (see _applySocietySprite):
    // an event that says who this is outranks the sheet they are wearing.
    apply(profile, spec, eventName) {
      if (!profile || !spec) return profile;
      profile._initSpec = spec;
      if (eventName && !profile._eventName) profile._eventName = eventName;
      this.applyIdentity(profile, spec);

      const num = (key, min, max) => {
        const v = Number(spec[key]);
        if (!Number.isFinite(v)) return null;
        return Math.min(Math.max(v, min), max);
      };
      const list = (key) => String(spec[key] ?? '').split(',').map(s => s.trim()).filter(Boolean);

      // Level, and the stats that hang off it. A written level rescales the
      // rolled stat block unless the stats are written too, so `level: 10`
      // alone still produces somebody who fights like a level 10.
      const level = num('level', 1, 9999);
      if (level != null && level !== profile.level) {
        const ratio = level / Math.max(1, profile.level || 1);
        profile.level = level;
        for (const key of ['atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mhp', 'mmp']) {
          if (profile[key]) profile[key] = Math.max(1, Math.round(profile[key] * ratio));
        }
        // Cleared so ensureSimFields re-derives them from the written level.
        profile.exp = undefined;
        profile._classSkillsSeeded = false;
        // A level the map wrote is the map's, not the party's: the local-level
        // peg would otherwise drag it back to the party median on every read.
        profile._levelPinned = true;
      }
      for (const key of ['atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mhp', 'mmp',
                         'arcane', 'substance', 'stealth', 'intimidation', 'exp']) {
        const v = num(key, 0, 99999999);
        if (v != null) profile[key] = v;
      }

      const pi = spec.personality != null ? this.personalityIndex(spec.personality) : -1;
      if (pi >= 0) profile.personalityIndex = pi;

      const ideo = spec.ideology != null ? this.ideology(spec.ideology) : null;
      if (ideo) { profile.ideologyIndex = ideo.index; profile.ideologyId = ideo.id; }

      if (spec.faction != null) {
        const fi = this.factionIndex(spec.faction);
        if (fi >= 0 || _normKey(spec.faction) === 'none') profile.factionIndex = fi;
      }

      if (spec.traits != null) {
        const ids = list('traits').map(t => this.traitId(t)).filter(id => id != null);
        if (ids.length) profile.traitIds = ids;
      }
      if (spec.skills != null) {
        const ids = list('skills').map(s => this.skillId(s)).filter(id => id != null);
        if (ids.length) profile.skillIds = ids;
      }
      if (spec.items != null) {
        const ids = list('items').map(i => this.itemId(i)).filter(id => id != null);
        if (ids.length) profile.itemIds = ids;
      }

      const wealth = spec.wealth != null ? this.wealthTier(spec.wealth) : null;
      if (wealth != null) profile.wealthTierBase = wealth;
      const money = num('money', 0, Number.MAX_SAFE_INTEGER);
      if (money != null) profile.money = money;
      const morality = num('morality', -100, 100);
      if (morality != null) profile.moralityScore = morality;
      const opinion = num('opinion', -100, 100);
      if (opinion != null) profile.playerOpinion = opinion;

      if (spec.job != null) {
        const jid = this.jobId(spec.job);
        if (jid != null) profile.currentJobId = jid;
      }
      for (const key of ['workStart', 'workEnd']) {
        const v = num(key, 0, 23);
        if (v != null) profile[key] = v;
      }
      const shift = num('workShift', 0, 3);
      if (shift != null) profile.workShift = shift;

      for (const key of ['hunger', 'sleep', 'hygiene', 'social', 'leisure']) {
        const v = num(key, 0, 100);
        if (v != null) profile[key] = v;
      }

      // Background. An age is the same statement as a birth year said from the
      // other end, so it is converted rather than stored: the backstory
      // generator only knows about years.
      const birthYear = num('birthYear', 0, 9999);
      if (birthYear != null) profile._birthYearOverride = birthYear;
      const age = num('age', 0, 999);
      if (age != null && birthYear == null) {
        const nowYear = window.NPCLifeSim?.currentYear?.() ?? 2001;
        profile._birthYearOverride = nowYear - age;
      }
      if (spec.birthplace) profile._birthplaceOverride = spec.birthplace;

      const sexual   = spec.sexual   != null ? this.orientationKey('sexual', spec.sexual) : null;
      const romantic = spec.romantic != null ? this.orientationKey('romantic', spec.romantic) : null;
      if (sexual || romantic) {
        profile._orientOverride = profile._orientOverride || {};
        if (sexual)   profile._orientOverride.sexualKey   = sexual;
        if (romantic) profile._orientOverride.romanticKey = romantic;
      }
      const relStyle = spec.relationship != null ? this.relationshipKey(spec.relationship) : null;
      if (relStyle) profile._relStyleOverride = relStyle;

      if (spec.homeGroup) profile._homeGroupName = spec.homeGroup;
      const homeMap = num('homeMapId', 1, 9999);
      if (homeMap != null) profile.homeMapId = homeMap;

      profile._initSpecApplied = true;
      return profile;
    },

    // The half of the spec that says WHO this is rather than how they are
    // doing: re-applied after anything that re-derives identity from the sheet.
    applyIdentity(profile, spec) {
      if (!profile || !spec) return;
      const classId = spec.class != null ? this.classId(spec.class) : null;
      if (classId) profile.assignedClassId = classId;
      if (spec.sprite) profile.spriteKey = spec.sprite;
      const bustIndex = Number(spec.bustIndex);
      if (Number.isFinite(bustIndex)) profile.bustIndex = Math.max(0, bustIndex | 0);
      const gender = spec.gender != null ? this.gender(spec.gender) : null;
      if (gender != null) profile.gender = gender;
      if (spec.archetype) profile.archetype = spec.archetype;
      if (spec.creature != null) profile.isCreature = /^(1|true|yes|on)$/i.test(String(spec.creature).trim());
      // The class the event wrote is the last word on personhood, so a Witch
      // written onto a beast's sheet is a person, and a Feral written onto an
      // ordinary sheet is not. NPCCreature still owns where that line falls.
      const NC = window.NPCCreature;
      if (classId && NC) {
        profile.nonSentient = !NC.isPlayerCharacterName?.(profile._eventName) &&
          NC.isNonSentientClassId(classId);
      }
    },

    // Whether an event dictates any part of the identity, which is what tells
    // the sprite reconciler to leave this NPC's face and class alone.
    pinsIdentity(spec) {
      return !!spec && (spec.class != null || spec.sprite != null || spec.bust != null ||
        spec.gender != null || spec.archetype != null || spec.creature != null);
    },
  };
  window.NPCInitSpec = NPCInitSpec;

  const ProfileGenerator = {
    _wealthCumulative: [5, 20, 55, 85, 100],

    // i18n-ignore-start: item-category ids, lowercased and matched against the
    // <category:> note tag
    _wealthItemCats: [
      ["Food","Survival","Homeopathy"],
      ["Food","Tools","Survival","Crafting"],
      ["Food","Tools","Lifestyle","Medical"],
      ["Tools","Lifestyle","Medical","Artisan","Component"],
      ["Magic","Collectibles","Espionage","Artisan"],
    ],
    // i18n-ignore-end

    generate(eventName, classId, mapId, options) {
      const personalities = DataLoader.personalities;
      const traits        = DataLoader.traits;
      const ideologies    = DataLoader.ideologies;
      const factions      = DataLoader.factions;
      if (!personalities?.length || !traits?.length || !ideologies?.length || !factions) return null;

      // Every random facet of this NPC is rooted in the world's history seed,
      // XOR'd with the name hash, the same convention the backstory generator
      // below uses, so a different HistoryManager seed yields a coherently
      // different society while staying deterministic per-name within a save.
      const worldSeed = window.NPCShared.worldSeed();
      const rng = new SeededRng(nameToSeed(eventName) ^ worldSeed);

      // 1. Personality
      const personalityIndex = rng.nextInt(0, personalities.length);

      // 2. Wealth tier
      const wealthRoll = rng.nextInt(0, 100);
      let wealthTierBase = 4;
      for (let i = 0; i < this._wealthCumulative.length; i++) {
        if (wealthRoll < this._wealthCumulative[i]) { wealthTierBase = i; break; }
      }

      // 3. Seed-driven visual identity + class assignment from NPCs.json
      //     Only applies when the world seed differs from the canon default (19002001).
      let spriteKey = null;
      let bustIndex = 0;
      let npcGender = 0;
      let npcArchetype = "Humanoid"; // i18n-ignore: Archetypes.json id
      let assignedClassId = classId;   // default: keep the class from the event note
      // A caller that has ALREADY dealt this NPC its face pins it here. A
      // procedural citizen's sprite is rolled together with its name, before
      // the profile exists, and was bound onto the profile afterwards; the
      // creature roll below knew nothing about it and could leave a beast's
      // identity, non-sentient class and all, on somebody wearing an
      // announcer's suit. Pinned, the catalogue draw and the creature roll both
      // stand down and what this NPC IS is read off the sheet it wears.
      const pinnedSprite = (options && options.spriteKey &&
        DataLoader.npcData?.[options.spriteKey]) ? options.spriteKey : null;
      const NC = window.NPCCreature;
      if (pinnedSprite) {
        const rngP = new SeededRng(nameToSeed(eventName + "_vis" + worldSeed));
        const entry = DataLoader.npcData[pinnedSprite];
        spriteKey = pinnedSprite;
        bustIndex = (options.bustIndex != null)
          ? options.bustIndex
          : rngP.nextInt(0, (entry.busts || ["7"]).length);
        npcGender = entry.Gender || 0;
        npcArchetype = entry.Archetype || "Humanoid"; // i18n-ignore: Archetypes.json id
        // The sheet's own roster, weighted the way a creature's is when the
        // sheet is a creature's (NPCCreature.rollClassId) and stripped of the
        // creature classes when it is a person's: an entry with `creature` and
        // `animal` both false is a person and is never dealt a beast's class.
        if (NC && NC.isCreatureSheet(pinnedSprite)) {
          const rolled = NC.rollClassId(pinnedSprite, [npcArchetype], rngP);
          if (rolled) assignedClassId = rolled;
        } else {
          const classPool = (Array.isArray(entry.classes) ? entry.classes : [])
            .filter(id => !NC || !NC.isNonSentientClassId(id));
          if (classPool.length > 0) assignedClassId = classPool[rngP.nextInt(0, classPool.length)];
        }
      } else if (worldSeed !== 19002001 && DataLoader.npcData) {
        // The face is dealt through the catalogue rather than out of a flat
        // list: an alien sheet is never in the ordinary pool and is drawn on a
        // share of the same seeded float, so who is walking about depends on
        // where this is (a town street, a train carriage, another world).
        const rngV = new SeededRng(nameToSeed(eventName + "_vis" + worldSeed));
        spriteKey = window.SpriteCatalog
          ? window.SpriteCatalog.pickNpcKey(rngV.next())
          : null;
        if (!spriteKey) {
          // Catalogue-less fallback. It still keeps the Varlenian faces off
          // everybody who is not standing in Varlenia, the one rule that would
          // otherwise be lost with the catalogue (see SpriteCatalog.npcKeys).
          const varlenia = !!window.SpriteCatalog?.isVarlenianPlace?.();
          const fallback = Object.keys(DataLoader.npcData).filter(k => {
            const e = DataLoader.npcData[k];
            if (!e || e.npc !== true) return false;
            // The other rule the catalogue enforces and this path must not
            // lose: a person is never dealt a beast's sheet here. The creature
            // roll below is the only way into the Creatures/ and Animals/
            // halves, so a face drawn from them without it would be a dog with
            // a creed, a faction and a job.
            if (e.creature === true || e.animal === true) return false;
            return varlenia || e.varlenian !== true;
          });
          spriteKey = fallback.length ? fallback[rngV.nextInt(0, fallback.length)] : null;
        }
        if (spriteKey) {
          const entry = DataLoader.npcData[spriteKey];
          bustIndex = rngV.nextInt(0, (entry.busts || ["7"]).length);
          npcGender = entry.Gender || 0;
          npcArchetype = entry.Archetype || "Humanoid"; // i18n-ignore: Archetypes.json id

          // Assign class from the entry's classes[] pool. A creature sheet is
          // dealt by NPCCreature, which owns the animal and Humanoid-hybrid
          // rules; anything else is a PERSON and is never dealt a creature
          // class, however its own entry happens to be written. The catalogue
          // already keeps the Creatures/ and Animals/ halves out of this pool,
          // so this is the belt to that pair of braces.
          if (NC && NC.isCreatureSheet(spriteKey)) {
            const rolled = NC.rollClassId(spriteKey, [npcArchetype], rngV);
            if (rolled) assignedClassId = rolled;
          } else {
            const classPool = (Array.isArray(entry.classes) ? entry.classes : [])
              .filter(id => !NC || !NC.isNonSentientClassId(id));
            if (classPool.length > 0) {
              // Pick a deterministic random class from the pool
              assignedClassId = classPool[rngV.nextInt(0, classPool.length)];
            }
          }
          // If classPool is empty, assignedClassId stays as the event-note classId
        }
      }

      // 3b. Not everybody in a settlement is a person. A share of them , most
      //     of them in a monster world, one in twenty anywhere else , are
      //     creatures: a sheet out of the Creatures/ and Animals/ halves of
      //     this same catalogue, the archetype that sheet carries, and a class
      //     off that archetype's own roster (see NPCCreature). Dealt on its own
      //     stream so an existing world's people are not reshuffled by the roll
      //     being added, and after the catalogue step so it replaces the face
      //     rather than competing with it.
      let creature = null;
      if (pinnedSprite) {
        // Pinned: the sheet decides, not a roll. Wearing one of the Creatures/
        // or Animals/ halves makes this a creature (the class dealt above says
        // whether it is a talking one); anything else is a person.
        if (NC && NC.isCreatureSheet(pinnedSprite)) creature = { spriteKey, bustIndex };
      } else if (NC) {
        const rngC = new SeededRng(nameToSeed(eventName + "_creature" + worldSeed));
        if (rngC.next() < NC.creatureChance()) {
          // A stray dog belongs on the street, not the landing of somebody's
          // staircase: the Animals/ half of the wardrobe is only dealt when
          // this NPC's own home event sits on an <Exterior> map. Unknown
          // (no mapId, or a map with neither tag) defaults open, the same as
          // every other reader of getMapEnvironmentTag. The Creatures/ half
          // (Mimic, Ghost, Zombie...) is unaffected, those belong anywhere.
          // A roofed procedural biome (cave, dungeon...) shares map id 636
          // with the open square it's entered from, so its own note tag still
          // reads <Exterior>; window.ProceduralInteriors is the only thing
          // that can actually tell the two apart (see ProceduralMapBiomeGenerator).
          const proceduralInterior = !!window.ProceduralInteriors?.isCurrent?.();
          const exterior = !proceduralInterior && (mapId == null ||
            window.NPCSystem?.getMapEnvironmentTag?.(mapId) !== "Interior");
          creature = NC.rollIdentity(rngC, exterior);
          if (creature) {
            spriteKey = creature.spriteKey;   // "Animals/!$Dog1"
            bustIndex = creature.bustIndex || 0;
            npcArchetype = creature.archetype;
            assignedClassId = creature.classId;
          }
        }
      }
      // Anything played as one of the creature classes holds no conversation
      // and no politics (see the overrides on the returned profile below). The
      // class alone decides it, not the creature roll: the Creatures/ and
      // Animals/ sheets are in the ordinary pool too and carry class 63 in
      // their own entries, so a dog dealt at step 3 is as much a dog as one
      // minted at step 3b. This is also the answer every other reader of the
      // profile already gives (NPCCreature.isNonSentientProfile).
      // The player's own creature characters are exempt from all of it: a beast
      // the player built and plays keeps its money, its pack and its trade.
      // The rule is about the WORLD's beasts.
      const playerOwn = !!NC && NC.isPlayerCharacterName(eventName);
      const nonSentient = !!NC && !playerOwn && NC.isNonSentientClassId(assignedClassId);

      // 4. Ideology (picked early to bias trait selection). An alien is only
      //    ever dealt an alien creed and a citizen is never dealt one, which is
      //    what the `alien` flag in Ideology.json is there to say. Which alien
      //    creed is mostly settled by the caste: a Crimson Analyzer believes in
      //    vivisection because that is what a Crimson Analyzer is. A quarter of
      //    Zeta Reticulans hold one of the other off-world creeds instead, and a
      //    Dargos always, without exception, is here to troll humans.
      const alienIdentity = window.AlienOrigins
        ? window.AlienOrigins.identify(spriteKey, eventName) : null;
      const isAlien = !!alienIdentity;
      const ideologyPool = ideologies
        .map((ideo, index) => ({ ideo, index }))
        .filter(({ ideo }) => !!ideo.alien === isAlien);
      let ideologyPick = null;
      if (alienIdentity && (alienIdentity.caste === "dargos" || rng.next() >= 0.25)) {
        ideologyPick = ideologyPool.find(({ ideo }) => ideo.id === alienIdentity.ideologyId) || null;
      }
      // A creed is not drawn flat out of the roster: the `axes` block each one
      // carries says where it stands on money (econ, -100 collectivist ..
      // +100 free-market), and somebody who has none rarely holds the creed of
      // somebody who has everything. The wealth tier rolled in step 2 becomes a
      // position on that axis and every creed is weighted by how far it sits
      // from it, gently (a destitute financier is unlikely, not impossible).
      // The other four axes stay free, so the roster's range is untouched.
      if (!ideologyPick) {
        if (!ideologyPool.length) {
          ideologyPick = { ideo: ideologies[0], index: 0 };
        } else {
          const wealthEcon = (wealthTierBase - 2) * 35; // tier 0..4 -> -70..+70
          let total = 0;
          const weights = ideologyPool.map(({ ideo }) => {
            const econ = ideo.axes ? (ideo.axes.econ ?? 0) : 0;
            const w = 1 / (1 + Math.abs(econ - wealthEcon) / 70);
            total += w;
            return w;
          });
          let roll = rng.next() * total;
          ideologyPick = ideologyPool[ideologyPool.length - 1];
          for (let i = 0; i < ideologyPool.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { ideologyPick = ideologyPool[i]; break; }
          }
        }
      }
      const ideologyIndex = ideologyPick.index;
      const ideology = ideologyPick.ideo;
      const ideologyTraitIds = (ideology && Array.isArray(ideology.traits)) ? ideology.traits : [];

      // 5. Traits: up to 2 from the ideology pool, the rest from the general
      //    pool, incompatible[] respected. A generated person is priced out of
      //    the same trait-point purse a player character is (window.TraitPoints,
      //    owned by TraitSelector.js), so nobody walks around carrying a build
      //    the budget could never pay for. Without that plugin the old flat
      //    four still applies.
      const points = window.TraitPoints;
      const traitIds = [];
      const pickedTraits = [];
      const _full = () => points
        ? points.tally(pickedTraits).remaining <= 0
        : traitIds.length >= 4;
      const _compatible = (id) => {
        const trait = traits.find(t => t.id === id);
        if (!trait) return false;
        if (points && !points.fits(trait, pickedTraits)) return false;
        return !traitIds.some(chosen => {
          const c = traits.find(t => t.id === chosen);
          return (trait.incompatible || []).includes(chosen) || (c && (c.incompatible || []).includes(id));
        });
      };
      const _take = (id) => {
        traitIds.push(id);
        pickedTraits.push(traits.find(t => t.id === id));
      };
      const shuffledIdeo = seededShuffle([...ideologyTraitIds], rng);
      for (const id of shuffledIdeo) {
        if (traitIds.length >= 2 || _full()) break;
        if (_compatible(id)) _take(id);
      }
      const ideologySet = new Set(ideologyTraitIds);
      const generalPool = seededShuffle(traits.filter(t => !ideologySet.has(t.id)).map(t => t.id), rng);
      for (const id of generalPool) {
        if (_full()) break;
        if (_compatible(id)) _take(id);
      }
      if (!_full()) {
        const pickedSet = new Set(traitIds);
        const fallback = seededShuffle(traits.map(t => t.id).filter(id => !pickedSet.has(id)), rng);
        for (const id of fallback) {
          if (_full()) break;
          if (_compatible(id)) _take(id);
        }
      }

      // 6. Skills (exactly 4, outside class learning list, no Basic, balanced by MP/TP cost to party level)
      const preferredCats = DataLoader.getClassSkillCategories(classId) || [];
      const classLearnings = _getClassLearnings(classId);
      const partyLevel = (function() {
        if (!$gameParty) return 1;
        const ms = $gameParty.members();
        if (!ms.length) return 1;
        const lvls = ms.map(a => a.level).sort((a, b) => a - b);
        const m = Math.floor(lvls.length / 2);
        return lvls.length % 2 !== 0 ? lvls[m] : Math.floor((lvls[m - 1] + lvls[m]) / 2);
      })();
      const targetCost = partyLevel * 3;
      const baseSkills  = _getBaseSkills();
      const validSkills = classLearnings.size > 0 ? baseSkills.filter(s => !classLearnings.has(s.id)) : baseSkills;
      const scoredSkills = validSkills.map(s => {
        const cost = s.mpCost + s.tpCost;
        const diff = Math.abs(cost - targetCost);
        const closeness = 1 / (1 + diff / Math.max(1, targetCost) * 2);
        const catBoost = (s._category && preferredCats.includes(s._category)) ? 1.3 : 1.0;
        return { id: s.id, score: (rng.next() * 0.4 + closeness * 0.6) * catBoost };
      });
      scoredSkills.sort((a, b) => b.score - a.score);
      const skillIds = scoredSkills.slice(0, 4).map(x => x.id);

      // 7. Items (2–5, wealth-biased categories)
      const numItems = rng.nextInt(0, 4) + 2;
      const itemCats = this._wealthItemCats[Math.min(wealthTierBase, 4)].map(c => c.toLowerCase());
      const scoredItems = _getValidItems().map(i => {
        const boost = i._category && itemCats.includes(i._category) ? 3 : 1;
        return { id: i.id, score: rng.next() * boost };
      });
      scoredItems.sort((a, b) => b.score - a.score);
      const itemIds = scoredItems.slice(0, numItems).map(x => x.id);

      // 8. Faction (~4% chance). An alien belongs to their own caste's faction
      //    outright: the castes ARE the factions out there, so there is nothing
      //    to roll and no Earth banner they could be standing under.
      const alienFactionIndex = alienIdentity
        ? factions.findIndex(f => f && f.id === alienIdentity.factionId) : -1;
      const factionIndex = alienFactionIndex >= 0
        ? alienFactionIndex
        : ((rng.next() < SocConfig.FACTION_CHANCE && factions.length > 0)
          ? rng.nextInt(0, factions.length) : -1);

      // 9. Morality score derived from trait names (-100 to +100)
      const POSITIVE_KEYWORDS = ["honest", "loyal", "kind", "brave", "generous", "compassion", "noble", "justice"];
      const NEGATIVE_KEYWORDS = ["thief", "greedy", "cruel", "anarchist", "deceptive", "ruthless", "corrupt", "violent"];
      let moralityScore = 0;
      for (const id of traitIds) {
        const trait = traits.find(t => t.id === id);
        const name = (trait?.name || "").toLowerCase();
        if (POSITIVE_KEYWORDS.some(kw => name.includes(kw))) moralityScore += 20;
        if (NEGATIVE_KEYWORDS.some(kw => name.includes(kw))) moralityScore -= 20;
      }
      moralityScore = Math.max(-100, Math.min(100, moralityScore));

      // 10. Work schedule derived from personality (shift hours)
      const workShifts = [[7,15],[8,16],[9,17],[10,18],[14,22],[20,4]];
      const shiftIdx = rng.nextInt(0, workShifts.length);
      const [workStart, workEnd] = workShifts[shiftIdx];

      // 11. Starting money based on wealth tier
      const wealthGoldBase = [5000, 50000, 500000, 5000000, 50000000];
      const money = Math.floor(wealthGoldBase[wealthTierBase] * (0.5 + rng.next()));

      // 10b. Level + stats (seeded, deterministic)
      const _lvlRange = window.NPCSystem?.getLevelRangeForMap?.($gameMap?.mapId()) ?? [1, 20];
      const level     = rng.nextInt(_lvlRange[0], _lvlRange[1]);
      const statMid = Math.max(1, Math.floor(level * 5 * (0.7 + rng.next() * 0.6)));
      const atk  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const def  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const mat  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const mdf  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const agi  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const luk  = Math.max(1, statMid + rng.nextInt(-3, 4));
      const mhp  = (10 + level) * 10 + rng.nextInt(0, 21);
      const mmp  = (5  + level) * 5  + rng.nextInt(0, 11);
      const maxCustom = level * 3;
      const arcane       = rng.nextInt(0, maxCustom + 1);
      const substance    = rng.nextInt(0, maxCustom + 1);
      const stealth      = rng.nextInt(0, maxCustom + 1);
      const intimidation = rng.nextInt(0, maxCustom + 1);

      // 12. Home assignment (deterministic from name hash + world coords)
      const worldX = $gameVariables ? $gameVariables.value(43) : 1;
      const worldY = $gameVariables ? $gameVariables.value(44) : 1;
      const npcHash = nameToSeed(eventName) ^ worldSeed;
      const homeSeed = ((worldX * 73856093) ^ (worldY * 19349663) ^ npcHash) >>> 0;
      const homePoolByWealth = ["houses", "houses", "houses", "skyscrapers", "skyscrapers"];
      const homePoolType = homePoolByWealth[Math.min(wealthTierBase, 4)];
      let homeMapId = null;
      if (window.ProceduralHouseSystem && window.ProceduralHouseSystem._selectHouse) {
        homeMapId = window.ProceduralHouseSystem._selectHouse(homeSeed, homePoolType);
      }

      // Pre-populate class skills up to starting level
      if (assignedClassId && $dataClasses?.[assignedClassId]) {
        for (const learning of ($dataClasses[assignedClassId].learnings || [])) {
          if (learning.level <= level && !skillIds.includes(learning.skillId)) {
            skillIds.push(learning.skillId);
          }
        }
      }

      // Trait-granted skills (Traits.json `skills` arrays, the same grants the
      // player receives from TraitSelector)
      for (const tid of traitIds) {
        const trait = traits.find(t => t.id === tid);
        for (const sid of (trait?.skills || [])) {
          if (!skillIds.includes(sid)) skillIds.push(sid);
        }
      }

      // A beast holds no creed, stands under no banner and owns nothing. The
      // rolls above still happened , the stream must not move , but none of
      // what they produced belongs to something that cannot hold an opinion
      // about it. NPCPolitics skips a non-sentient profile outright, and the
      // life simulator neither has it save nor move (see NPCLifeSimulator).
      return {
        // A beast carries nothing in its pockets because it has none: the item
        // roll above still happened (the stream must not move) but what it
        // produced belongs to somebody who can own things.
        personalityIndex, wealthTierBase, traitIds, skillIds,
        itemIds: nonSentient ? [] : itemIds,
        factionIndex:  nonSentient ? -1 : factionIndex,
        ideologyIndex: nonSentient ? -1 : ideologyIndex,
        // The creed by name as well as by slot, so a roster that grows can
        // never hand an existing person somebody else's beliefs.
        ideologyId: nonSentient ? null : (ideology?.id ?? null),
        // Visual identity
        spriteKey, bustIndex, gender: npcGender, archetype: npcArchetype,
        // Whether this is a creature at all, and whether it is one of the
        // non-sentient ones. Both are read all over the NPC suite, so they are
        // stored rather than re-derived from the class id every time.
        isCreature: !!creature,
        nonSentient,
        // Class (null = use event-note classId; set when seed ≠ 19002001 and classes[] non-empty)
        assignedClassId,
        // Home
        homeMapId, homePoolType, homeSeed,
        // Needs
        hunger: 100, sleep: 100, money: nonSentient ? 0 : money,
        // Work. A beast holds no trade: 0 is "jobless" (as against null, "not
        // decided yet"), so the group shift roster never deals it a shift.
        currentJobId: nonSentient ? 0 : null, workStart, workEnd, lastWorkMinute: 0,
        // Behaviour
        moralityScore, currentNeed: null,
        // Story
        eventLog: [], thoughts: [],
        // NPC-to-NPC social relationships: { [npcName]: { meetCount, opinion } }
        relationships: {},
        // Stats
        level, atk, def, mat, mdf, agi, luk, mhp, mmp,
        arcane, substance, stealth, intimidation,
      };
    }
  };

  // ==========================================================================
  // SECTION 5: SOCIETY REGISTRY
  // ==========================================================================
  // Per-coordinate "Proc:x,y" settlements mint a unique profile per NPC name,
  // so _npcSociety can grow without bound as the player roams. Cap it: every
  // profile facet is seeded from nameToSeed(name) XOR the world seed, so a cold
  // profile (no player interaction, no accrued runtime story) regenerates
  // identically if it is ever touched again. Only such regenerable profiles are
  // evicted; anyone the player has interacted with, or a party/past-party
  // member, is always kept.
  const MAX_SOCIETY_PROFILES = 1500;
  const SOCIETY_PRUNE_TARGET  = 1200;
  // Baseline opinion bonus applied to NPCs whose home settlement matches the
  // party's chosen hometown (see SocietyRegistry.applyHometownOpinionIfMatch).
  const HOMETOWN_OPINION_BONUS = 20;

  function _isRegenerableProfile(name, profile) {
    if (!profile) return true;
    if (Math.abs(profile.playerOpinion ?? 0) > 10) return false;
    if (profile.eventLog && profile.eventLog.length) return false;
    if (profile.thoughts && profile.thoughts.length) return false;
    if (profile.spokenLog && profile.spokenLog.length) return false;
    const past = $gameSystem._npcPastPartyMembers;
    if (Array.isArray(past) && past.includes(name)) return false;
    return true;
  }

  function _pruneSociety() {
    const soc = $gameSystem._npcSociety;
    if (!soc) return;
    const keys = Object.keys(soc);
    if (keys.length <= MAX_SOCIETY_PROFILES) return;
    let count = keys.length;
    // Insertion order (oldest first) so the least recently minted cold profiles
    // go first.
    for (const name of keys) {
      if (count <= SOCIETY_PRUNE_TARGET) break;
      if (!_isRegenerableProfile(name, soc[name])) continue;
      delete soc[name];
      count--;
    }
  }

  // A beast holds no creed and owns nothing: ProfileGenerator strips both when
  // it mints one. Something repaired back into a person needs them back, and
  // they are dealt off the name the way every other facet of a profile is, so
  // the same person is the same person in every savegame of this world. A
  // faction is NOT restored: plenty of people stand under no banner at all
  // (SocConfig.FACTION_CHANCE), so -1 is a perfectly ordinary answer there.
  function _restorePersonhood(name, profile) {
    let changed = false;
    const rng = new SeededRng(nameToSeed(name + "_repair") ^ (window.NPCShared?.worldSeed?.() || 0));
    const ideologies = DataLoader.ideologies || [];
    if (profile.ideologyId == null || !(profile.ideologyIndex >= 0)) {
      const pool = ideologies
        .map((ideo, index) => ({ ideo, index }))
        .filter(({ ideo }) => !ideo.alien);
      if (pool.length) {
        const pick = pool[rng.nextInt(0, pool.length)];
        profile.ideologyIndex = pick.index;
        profile.ideologyId = pick.ideo?.id ?? null;
        changed = true;
      }
    }
    if (!(profile.money > 0)) {
      const wealthGoldBase = [5000, 50000, 500000, 5000000, 50000000];
      const tier = Math.min(Math.max(profile.wealthTierBase | 0, 0), 4);
      profile.money = Math.floor(wealthGoldBase[tier] * (0.5 + rng.next()));
      changed = true;
    }
    return changed;
  }

  const SocietyRegistry = {
    // The sheet an NPC wears is the one authority on what it IS, and this is
    // where a profile is made to agree with it. A creature always wears a sheet
    // whose NPCs.json entry says `creature: true`, an animal one that says
    // `animal: true`, and anything wearing neither is a person, so a profile
    // carrying a beast's identity over an announcer's face (the creature roll
    // ran before the sprite was bound, or a <Story> event kept the face its
    // author drew) is repaired here rather than left for every reader of the
    // profile to trip over.
    //
    // A sheet in no catalogue at all, an authored character's own graphic, says
    // nothing either way and is left exactly as it is.
    reconcileToSprite(eventName, profile) {
      const NC = window.NPCCreature;
      if (!NC || !profile || !profile.spriteKey) return false;
      const entry = DataLoader.npcData?.[profile.spriteKey];
      if (!entry) return false;
      let changed = false;
      if (NC.isCreatureSheet(profile.spriteKey)) {
        // Wearing a beast's sheet IS being a creature, whichever class it
        // holds: a talking dog is still a dog.
        if (!profile.isCreature) { profile.isCreature = true; changed = true; }
        if (entry.Archetype && profile.archetype !== entry.Archetype) {
          profile.archetype = entry.Archetype;
          changed = true;
        }
      } else {
        if (profile.isCreature) { profile.isCreature = false; changed = true; }
        if (NC.isNonSentientClassId(profile.assignedClassId)) {
          // A person's sheet can never carry a creature class, so the one this
          // profile holds came from the roll and is replaced by a civilised
          // class off the sheet's own roster.
          profile.assignedClassId = NC.sentientClassFor(profile.spriteKey, eventName);
          profile.archetype = entry.Archetype || "Humanoid"; // i18n-ignore: Archetypes.json id
          changed = true;
        }
      }
      // An `animal: true` sheet is a beast and nothing else. There are no
      // talking dogs: whatever class a profile arrived carrying, an animal
      // face answers Feral (or the one beast class its own NPCs.json entry
      // names, so a risen dog stays a Zombie).
      if (NC.isAnimalSheet(profile.spriteKey)) {
        // A fixed stream: an animal sheet has nothing to roll for.
        const beastClass = NC.rollClassId(profile.spriteKey, [profile.archetype],
          { next: () => 0, nextInt: (a) => a });
        if (profile.assignedClassId !== beastClass) {
          profile.assignedClassId = beastClass;
          changed = true;
        }
      }
      const playerOwn = NC.isPlayerCharacterName(eventName);
      const nonSentient = !playerOwn && NC.isNonSentientClassId(profile.assignedClassId);
      if (!!profile.nonSentient !== nonSentient) {
        profile.nonSentient = nonSentient;
        changed = true;
      }
      // Everything a person owns and a beast does not. Stripped here as well as
      // at minting, so a world folder written before the rule existed is
      // repaired the first time each of its beasts is looked at.
      if (nonSentient) {
        if (profile.money) { profile.money = 0; changed = true; }
        if (profile.itemIds && profile.itemIds.length) { profile.itemIds = []; changed = true; }
        if (profile.currentJobId) {
          profile.currentJobId = 0;
          profile.workMapId = null;
          profile.workShift = null;
          changed = true;
        }
        if (profile.factionIndex !== -1) { profile.factionIndex = -1; changed = true; }
        if (profile.ideologyIndex !== -1 || profile.ideologyId != null) {
          profile.ideologyIndex = -1;
          profile.ideologyId = null;
          changed = true;
        }
      }
      if (!nonSentient && _restorePersonhood(eventName, profile)) changed = true;
      return changed;
    },

    // `homeGroupName` anchors a brand new person to the town they belong to
    // before any of the derived data is filled in. On-map callers leave it out
    // and the address is resolved from the map the NPC is standing on; the
    // world-initialization pass below has no current map, so it names the group
    // instead. It has to be set here rather than afterwards, because
    // ensureSimFields resolves the address (and through it the home map) from
    // it, and _generatePreexistingRelationships then reads that home map to
    // decide who this person already knows.
    // `options.spriteKey` (with an optional `options.bustIndex`) pins the face
    // this NPC is already known to wear, for a caller that dealt the sprite
    // before the profile existed. See ProfileGenerator.generate: it is what
    // keeps the creature roll from minting a beast inside somebody's clothes.
    ensureProfile(eventName, classId, homeGroupName, mapId, options) {
      if (!DataLoader.isReady || !eventName || !$gameSystem) return null;
      if (!$gameSystem._npcSociety) $gameSystem._npcSociety = {};
      let profile = $gameSystem._npcSociety[eventName];
      if (!profile) {
        profile = ProfileGenerator.generate(eventName, classId, mapId, options);
        if (!profile) return null; // DataLoader not populated yet
        if (homeGroupName && !profile._homeGroupName) profile._homeGroupName = homeGroupName;
        // A curated identity waiting for this name (CharacterCreationPresets:
        // gender/orientation/birth data from a pre-made character's dossier)
        // overrides the freshly rolled random one, one-shot.
        const pending = $gameSystem._pendingPartyIdentity?.[eventName];
        if (pending) {
          if (pending.gender !== undefined) profile.gender = pending.gender;
          if (pending.sexualKey || pending.romanticKey) {
            profile._orientOverride = {
              sexualKey: pending.sexualKey || null,
              romanticKey: pending.romanticKey || null,
            };
          }
          if (pending.birthYear !== undefined) profile._birthYearOverride = pending.birthYear;
          if (pending.birthplace) profile._birthplaceOverride = pending.birthplace;
          delete $gameSystem._pendingPartyIdentity[eventName];
        }
        // A world leader (js/db/WorldGen/Leaders.json) is a person before they
        // are an office, and most of them never stand on a map: the wiki opens
        // their panel by name alone, and this is where the person behind that
        // name is minted. window.LeaderPersona owns what a leader is (their
        // vocation, their nation, when they were born), so the simulated
        // character and the article about them can never disagree. Applied
        // after the party-identity override because a leader who is also a
        // pre-made character being taken into the party is that character
        // first: the dossier is the more specific answer.
        // A dossier being taken into the party claims the sheet outright and
        // is marked done, so the pass below never overwrites it later.
        if (pending) profile._leaderIdentityRev = LEADER_IDENTITY_REV;
        else _applyLeaderIdentity(eventName, profile);
        // An event that writes out who this is (SECTION 3c) has the last word:
        // it beats the seeded roll, the dossier and the leader record, because
        // somebody sat down and typed it onto that event.
        const initSpec = (options && options.initSpec) || NPCInitSpec.forName(eventName);
        if (initSpec) NPCInitSpec.apply(profile, initSpec, eventName);
        profile._initSpecChecked = true;
        $gameSystem._npcSociety[eventName] = profile;
        _pruneSociety();
      }
      // A profile minted before the book knew who these people really were
      // still holds a rolled birthday and a rolled gender: the pass is cheap,
      // it is versioned, and it runs on the profiles a world already has.
      else if (profile._leaderIdentityRev !== LEADER_IDENTITY_REV) {
        _applyLeaderIdentity(eventName, profile);
      }
      // A profile minted before its event was written out (an existing world,
      // or a spec added to a map after the fact) is brought up to it once. Only
      // once: after that the simulation owns the needs, the purse and the day.
      if (profile._initSpecApplied !== true && profile._initSpecChecked !== true) {
        profile._initSpecChecked = true;
        const late = (options && options.initSpec) || NPCInitSpec.forName(eventName);
        if (late) NPCInitSpec.apply(profile, late, eventName);
      }
      // ProfileGenerator only seeds hunger/sleep/money; the other simulation
      // needs (hygiene/social/leisure) plus work/level fields are filled by
      // NPCSimulationCore.ensureSimFields. Run it here so every profile is
      // complete the moment it is accessed (e.g. right before the Empathize
      // panel renders its vitals), instead of the three extra needs staying
      // undefined, and drawing as flat default bars, until the sim first ticks
      // this NPC. Idempotent and undefined-guarded, so it is a no-op once set.
      window.NPCSim?.ensureSimFields?.(profile, eventName);
      // Runs after ensureSimFields, which is where a profile with no level yet
      // gets one: a local resident's is then overwritten with the party median,
      // on this and on every later access, so it keeps following the party.
      _syncLocalLevel(eventName, profile);
      // Last, so a traveller's own actor wins over both the generated roll and
      // the local-NPC party-median peg.
      _syncPartyMemberStats(eventName, profile);
      _generatePreexistingRelationships(eventName, profile);
      return profile;
    },

    // Seeds a settlement-wide baseline opinion the first time an NPC's home
    // settlement is resolved, if it matches the party's chosen hometown
    // ($gameSystem._ccHometown, set by the CharacterCreation hometown step).
    // Tries the map group name first (_homeGroupName, a
    // js/db/WorldGen/MapGroups.json key, e.g. "OmegaTower"), then falls back
    // to the current map's display name (e.g. "Ghent Riverside", or a
    // HardcodedBiomeNames-overridden procedural name) when there is no group
    // match, since some maps (interiors, procedural tiles) carry no group of
    // their own. Group keys have no spaces while Destinations.json keys do
    // ("Omega Tower"), hence the normalized comparison. One-shot per profile
    // via _hometownOpinionApplied. Called from NPCSimulationCore.js
    // (_assignHomeBuilding, hand-placed NPCs) and NPCSystem.js
    // (registerProcCitizen, procedural settlement citizens) right after each
    // sets _homeGroupName, while $gameMap is still the NPC's location map.
    applyHometownOpinionIfMatch(profile, groupName) {
      if (!profile || profile._hometownOpinionApplied) return;
      // No hometown chosen yet means character creation has not happened yet
      // (the world roster is minted before any party exists). Leave the
      // one-shot unspent so the bonus still lands the first time a party that
      // does have a hometown meets this person.
      const hometown = $gameSystem && $gameSystem._ccHometown;
      if (!hometown) return;
      profile._hometownOpinionApplied = true;
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const target = norm(hometown);
      let matched = !!groupName && norm(groupName) === target;
      // $gameMap.displayName() reads $dataMap, which is not loaded yet during
      // Game_System.onAfterLoad (this runs before the map JSON is fetched), so
      // that has to be checked too or the call throws.
      if (!matched && typeof $gameMap !== "undefined" && $gameMap && $gameMap.displayName &&
          typeof $dataMap !== "undefined" && $dataMap) {
        // Strip the " Lv. N" / "[Tileset: ...]" suffixes MapLevelDisplay.js
        // appends to displayName() so only the place name itself is compared.
        const mapName = String($gameMap.displayName() || "")
          .replace(/\s*\[Tileset:[^\]]*\]\s*$/, "")
          .replace(/\s*Lv\.\s*\d+\s*$/, "")
          .trim();
        matched = norm(mapName) === target;
      }
      if (matched) {
        profile.playerOpinion = (profile.playerOpinion || 0) + HOMETOWN_OPINION_BONUS;
      }
    },

    getProfile(eventName) {
      return $gameSystem?._npcSociety?.[eventName] ?? null;
    },

    // The same lookup for a party member. Profiles are keyed by name, so an actor is resolved
    // to its name first; character creation asks for this to show a made character's standing.
    getActorProfile(actorId) {
      const actor = (typeof $gameActors !== 'undefined' && $gameActors)
        ? $gameActors.actor(actorId) : null;
      const name = actor && actor.name ? actor.name() : null;
      return name ? this.getProfile(name) : null;
    },

    tickNeeds(name, elapsedMinutes) {
      const p = this.getProfile(name);
      if (!p) return;
      p.hunger = Math.max(0, (p.hunger ?? 100) - 0.08 * elapsedMinutes);
      p.sleep  = Math.max(0, (p.sleep  ?? 100) - 0.05 * elapsedMinutes);
      if      (p.hunger < 25) p.currentNeed = 'food';
      else if (p.sleep  < 20) p.currentNeed = 'sleep';
      else                    p.currentNeed = null;
    },

    decayOpinions(currentDay) {
      if (!$gameSystem?._npcSociety) return;
      const last    = $gameSystem._npcLastOpinionDecayDay ?? 0;
      const elapsed = currentDay - last;
      if (elapsed < 1) return;
      $gameSystem._npcLastOpinionDecayDay = currentDay;
      const decay = elapsed / 3; // 1 point per 3 in-game days
      for (const p of Object.values($gameSystem._npcSociety)) {
        const op = p.playerOpinion ?? 0;
        if (Math.abs(op) > 10) {
          const rate = Math.abs(op) >= 70 ? decay * 0.5 : decay; // strong impressions fade slower
          p.playerOpinion = op > 0 ? Math.max(10, op - rate) : Math.min(-10, op + rate);
        }
        for (const rel of Object.values(p.relationships ?? {})) {
          const relOp = rel.opinion ?? 0;
          if (Math.abs(relOp) <= 5) continue; // frozen neutral band
          const relRate = elapsed / 6; // NPC-NPC relationships drift slower than player opinion
          rel.opinion = relOp > 0 ? Math.max(5, relOp - relRate) : Math.min(-5, relOp + relRate);
        }
      }
    },
  };

  // ==========================================================================
  // SECTION 6: ENGINE HOOKS
  // ==========================================================================

  function _extractClassId(ev) {
    const m = ev?.event?.()?.note?.match(/NPC-(\d+)/);
    return m ? Number(m[1]) : null;
  }

  // Exposed on the registry so the sprite rules can be exercised outside the
  // game (test/test_npcsocietysprite.js).
  // Hook 1: pre-generate profiles after NPC controllers are initialized.
  // Binds the NPC's identity (bust + gender) to its defining character sprite
  // via NPCs.json, for EVERY NPC: society-assigned sprites (non-canon seeds,
  // profile.spriteKey) re-apply their graphic, while canon-seed / map-designed
  // NPCs keep the sprite they already display but still inherit that sprite's
  // bust and gender from NPCs.json.
  function _applySocietySprite(eventName, ev) {
    const profile = $gameSystem._npcSociety?.[eventName];
    if (!profile || !ev) return;

    // Whatever face this NPC ends up with, what it IS follows from that face
    // and nothing else. Run before anything below reads profile.isCreature, and
    // again after a map-designed sprite is pinned, since only then is the sheet
    // it actually wears known.
    SocietyRegistry.reconcileToSprite(eventName, profile);

    const evData      = ev.event();
    // A <Story> event keeps the face the author drew on it, always. In a world
    // whose seed is not the canon one every citizen is dealt a seeded visual
    // identity, and painting one of those over a written character would give
    // the plot a stranger's face, so they are treated as map-designed here
    // whatever their profile says, and the profile is re-pinned to the sprite
    // they actually wear (below) so every off-map reader agrees with it.
    // A <Local> event gets the same treatment: it is placed on this specific
    // map on purpose, same as a <Story> one, and ProfileGenerator.generate
    // still deals it a seeded catalogue spriteKey (and possibly a creature
    // roll) with no awareness of the tag, so without this it would be re-drawn
    // as a random citizen the moment the society sim assigns it a profile.
    const isStory       = !!window.NPCSystem?.hasStoryTag?.(evData?.note);
    const isLocal       = !!window.NPCSystem?.hasLocalTag?.(evData?.note);
    // An event whose comments dictate its own class, face or archetype (see
    // SECTION 3c) is as written as a <Story> one: somebody typed out who this
    // is, so the seeded visual identity has nothing left to decide.
    const initSpec      = profile._initSpec || NPCInitSpec.fromEvent(ev);
    const isPinned      = NPCInitSpec.pinsIdentity(initSpec);
    // A face somebody drew on the event in the editor is as written as a
    // `sprite:` line: the author picked that sheet for that person, so the
    // seeded catalogue identity has no business painting over it. The one
    // exception is a world whose whole population is REPLACED (monster, zombie,
    // empty / death): there every citizen is meant to be re-skinned, authored
    // graphic or not.
    const replacedWorld = !!(window.WorldManager?.isMonsterWorld?.()
      || window.WorldManager?.isZombieWorld?.()
      || window.WorldManager?.isEmptyWorld?.());
    const authoredSprite = evData?.characterName
      || evData?.pages?.[0]?.image?.characterName || null;
    const hasAuthoredSprite = !replacedWorld && !!authoredSprite;
    const isMapDesigned = isStory || isLocal || isPinned || hasAuthoredSprite;
    // A creature is dealt out of the Creatures/ and Animals/ halves of the same
    // catalogue as everybody else, so its sheet is normally found below like
    // any other. The exception is a monster world, where a Monsters/ sheet may
    // be worn and that folder is not catalogued at all; there the graphic is
    // assigned on the profile's own say-so and everything below it (the bust,
    // the catalogue gender) is skipped, the panel drawing its 3D model instead
    // (see NPCEmpathizeUI).
    const isCreature  = !isMapDesigned && !!profile.isCreature && !!profile.spriteKey;
    // A `sprite:` line is an author naming the sheet outright, so it is an
    // assignment rather than a pin: the graphic really is re-applied to the
    // event, which is the whole point of writing it.
    const writtenSprite = initSpec?.sprite || null;
    const hasAssigned = isCreature || !!writtenSprite ||
      (!isMapDesigned && !!(profile.spriteKey && DataLoader.npcData?.[profile.spriteKey]));
    // Defining sprite: the written one, else the society-assigned one, else the
    // sprite the event shows.
    const spriteKey = writtenSprite || (hasAssigned
      ? profile.spriteKey
      : (evData.characterName ?? evData.pages?.[0]?.image?.characterName ?? null));

    const charIdx = hasAssigned
      ? (profile.bustIndex ?? 0)
      : (evData.characterIndex ?? evData.pages?.[0]?.image?.characterIndex ?? 0);

    // Pinned before the NPCs.json lookup below, so a written or placed
    // character whose sheet is not in the catalogue still stops the seeded
    // sprite following them around the panels, the wiki and the bust resolver.
    if (isMapDesigned && spriteKey && !writtenSprite) {
      profile.spriteKey = spriteKey;
      profile.bustIndex = charIdx;
      // The written character's own sheet is now the profile's, so the identity
      // is re-read off it: an author who drew an announcer gets an announcer,
      // never the beast the creature roll had dealt behind that face.
      SocietyRegistry.reconcileToSprite(eventName, profile);
    }

    const entry = spriteKey ? DataLoader.npcData?.[spriteKey] : null;
    if (!entry && !isCreature) {
      if (initSpec) NPCInitSpec.applyIdentity(profile, initSpec);
      return;
    }

    // Only re-apply the graphic when the society explicitly assigned a sprite;
    // canon / map-designed NPCs keep the sprite they already display.
    if (hasAssigned) {
      evData.pages?.forEach(p => {
        if (p?.image) { p.image.characterName = spriteKey; p.image.characterIndex = charIdx; }
      });
      evData.characterName  = spriteKey;
      evData.characterIndex = charIdx;
      ev.setImage(spriteKey, charIdx);
      ev.refresh();
      ev.setupPage();
    }

    if (!entry) {
      if (initSpec) NPCInitSpec.applyIdentity(profile, initSpec);
      return;
    }
    profile._bustName = entry.busts?.[charIdx] ?? entry.busts?.[0] ?? "7";
    // Gender follows the character sprite (0=Male,1=Female,2=Non-binary,3=Xe).
    if (entry.Gender != null) profile.gender = entry.Gender;
    // Last word to the event, which named this person on purpose.
    if (initSpec) {
      NPCInitSpec.applyIdentity(profile, initSpec);
      if (initSpec.bust) profile._bustName = initSpec.bust;
    }
  }

  const _setupNPCControllers = Game_Map.prototype.setupNPCControllers;
  Game_Map.prototype.setupNPCControllers = function() {
    _setupNPCControllers.call(this);
    if (!DataLoader.isReady || !$gameSystem?.npcControllers) return;

    // Build a name→event map once so each lookup is O(1) instead of O(events) per controller.
    const evByName = new Map(
      $gameMap.events().filter(e => e?.event()?.name).map(e => [e.event().name, e])
    );

    const toDefer = [];
    for (const c of $gameSystem.npcControllers) {
      if (!c.eventName) continue;
      if ($gameSystem._npcSociety?.[c.eventName]) {
        // Profile already exists, apply sprite immediately (cheap).
        _applySocietySprite(c.eventName, evByName.get(c.eventName));
        // Re-pin the local residents of this map before anything reads them,
        // the party may have gained levels since the last visit.
        _syncLocalLevel(c.eventName, $gameSystem._npcSociety[c.eventName]);
      } else {
        toDefer.push(c);
      }
    }

    if (!toDefer.length) return;

    // Generate profiles for new NPCs in chunks across frames so the first frame
    // isn't blocked. Once generated the profile persists in $gameSystem._npcSociety.
    const mapId = $gameMap.mapId();
    let i = 0;
    const step = () => {
      if ($gameMap.mapId() !== mapId) return; // player left before we finished, discard
      const end = Math.min(i + 6, toDefer.length);
      for (; i < end; i++) {
        const c  = toDefer[i];
        const ev = evByName.get(c.eventName);
        SocietyRegistry.ensureProfile(c.eventName, _extractClassId(ev), undefined, mapId,
          { initSpec: NPCInitSpec.fromEvent(ev) });
        _applySocietySprite(c.eventName, ev);
      }
      if (i < toDefer.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  SocietyRegistry.applySocietySprite = _applySocietySprite;

  // Expose class names through NPCSocietyConfig for external plugins (VisualNovelBustSystem, MousePan)
  Object.defineProperty(SocConfig, 'CLASS_NAMES', { get: () => DataLoader.classNames || {} });

  // Decay opinions on every map load (once per in-game day at most)
  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    if (!$gameVariables) return;
    const day = Math.floor($gameVariables.value(114) / 1440);
    SocietyRegistry.decayOpinions(day);
  };

  window.NPCSocietyGetEquip = _generateEquipment;
  // ==========================================================================
  // SECTION 6b: WORLD ROSTER INITIALIZATION
  // ==========================================================================
  // Mints the whole authored population of the world in one pass, when the
  // world is made, instead of one person at a time as the player walks past
  // them. Every named NPC in every hand-made map group gets their profile,
  // their address, their job shift and the people they already know, all
  // anchored to the town they belong to.
  //
  // It is not only a matter of having the data ready: who lives behind which
  // door is handed out first-come-first-served against each building's
  // capacity, and who already knows whom is drawn against everybody minted
  // before them, so generating the roster lazily made both depend on the order
  // the player happened to explore the world. Doing it up front, in a fixed
  // order, makes a world the same world however it is walked.
  //
  // Where somebody lives is decided by which pool names them. A group whose own
  // maps hold too few templates borrows from the rest of the world, and the
  // global group (OmegaTower) always draws on everybody, so a name can appear
  // in several pools. Anyone named by exactly one town is claimed by that town
  // first; only then do the shared names get handed out, in group-name order
  // with the world-wide pools last, so nobody is filed under a town that was
  // merely borrowing them.
  //
  // Procedural "Proc:x,y" settlements are deliberately left out: their
  // citizens are minted by the map generator when the player reaches those
  // coordinates, and there is no roster to draw from until then.
  function initializeWorldRoster() {
    if (!$gameSystem) return;
    const NPCSys = window.NPCSystem;
    if (!NPCSys?.getMapGroups) return;
    // ensureProfile refuses to generate anybody before the personality/trait/
    // sprite tables have finished loading. Rather than mark an empty roster as
    // done, fail the step so WorldManager runs it again later.
    if (!DataLoader.isReady) throw new Error("NPC society data is still loading");  // i18n-ignore: diagnostic

    // Groups that draw their pool from the whole world rather than their own
    // maps, so being named by one of them says nothing about where you live.
    const isWorldWide = (name) => name === NPCSys.GLOBAL_GROUP_NAME ||
      (NPCSys.SEATED_GLOBAL_GROUPS || []).includes(name);

    const groups = Object.keys(NPCSys.getMapGroups() || {})
      .filter(name => !NPCSys.isProceduralGroup?.(name))
      // Plain codepoint order, not localeCompare: the same world has to come
      // out the same on every machine, whatever locale it runs in.
      .sort((a, b) =>
        (isWorldWide(a) ? 1 : 0) - (isWorldWide(b) ? 1 : 0) || (a < b ? -1 : a > b ? 1 : 0));

    // name → [{ groupName, eventData }], in group order.
    const claims = new Map();
    for (const groupName of groups) {
      // Jobs first: the shift each person works decides where they spend their
      // day, and the leftovers become the group's counter-staff pool, which
      // the shop rotas are drawn from in the next step.
      try { window.NPCSim?.JobShiftManager?.ensureGroupAssignments?.(groupName); } catch (e) {
        console.error(`[NPCSociety] Job assignment failed for "${groupName}"`, e);
      }

      let templates = [];
      try { templates = NPCSys.getNPCPool(groupName) || []; } catch (e) { templates = []; }

      const seen = new Set();
      for (const tpl of templates) {
        const ev = tpl?.eventData;
        const name = ev?.name;
        // "NPC" is the generic placeholder slot a template is spawned into,
        // not a person; a hidden template is scenery with a face.
        if (!name || name === "NPC" || seen.has(name)) continue;  // i18n-ignore: placeholder event name
        if (NPCSys.hasHiddenTag?.(ev.note)) continue;
        seen.add(name);
        if (!claims.has(name)) claims.set(name, []);
        claims.get(name).push({ groupName, eventData: ev, mapId: tpl.mapId });
      }
    }

    let minted = 0;
    const mint = (name, claim) => {
      if (!claim || $gameSystem._npcSociety?.[name]) return;
      const classMatch = claim.eventData.note?.match(/NPC-(\d+)/);
      const classId = classMatch ? Number(classMatch[1]) : null;
      try {
        const initSpec = NPCInitSpec.fromEventData(claim.eventData);
        if (SocietyRegistry.ensureProfile(name, classId, claim.groupName, claim.mapId,
            initSpec ? { initSpec } : undefined)) minted++;
      } catch (e) {
        console.error(`[NPCSociety] Could not mint "${name}" of "${claim.groupName}"`, e);
      }
    };
    // Pass 1: the people only one town names are that town's own.
    for (const [name, list] of claims) if (list.length === 1) mint(name, list[0]);
    // Pass 2: everybody else goes to the first town that named them.
    for (const [name, list] of claims) if (list.length > 1) mint(name, list[0]);

    console.log(`[NPCSociety] World roster: ${minted} people minted across ${groups.length} settlements.`);
  }

  if (window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("npcRoster", 20, initializeWorldRoster);
  }

  window.NPCSocietyRegistry = SocietyRegistry;
  window.NPCSocietyConfig = SocConfig;
  SocietyRegistry.initializeWorldRoster = initializeWorldRoster;

  // ==========================================================================
  // SECTION 7: PROCEDURAL BACKSTORY (formerly NPCSystemHistorySimulator.js)
  // ==========================================================================
  // Generates a deterministic biographical backstory for each NPC by pulling
  // events from HistorySimulator's generated timeline that the NPC "lived
  // through". Seeded from nameToSeed(npcName) XOR the world seed, like every
  // other facet of the profile. Stored in profile.backstory and displayed in
  // the NPCEmpathize panel as a "BACKGROUND" section below Stats.

  // Indexed by gender: 0 Male, 1 Female, 2 Non-binary, 3 Cocoon (neopronoun
  // "xe"). Each entry carries its own conjugated verb forms, because a language
  // that agrees on gender needs a different word, not a different rule:
  // NPCSociety.pronoun.<gender> in js/i18n/<lang>/plugins.
  const PRONOUN_COUNT = 4;
  const pronounOf = (gender) =>
    T.obj('NPCSociety.pronoun.' + Math.min(Math.max(gender | 0, 0), PRONOUN_COUNT - 1));

  // Five adjectives, drawn by index so the seeded sequence never moves. They
  // describe the "creature" or the "soul", never the person, so a language
  // that inflects them agrees with that noun and needs only one list.
  const ADJECTIVE_COUNT = 5;
  function adjectiveAt(index) {
    const pool = T.pool('NPCSociety.adjective');
    return pool[index % pool.length] || '';
  }

  // Representative city for each HistorySimulator country, used to anchor a
  // creature's "born in the wilds near <city>" origin to its birthplace nation.
  // i18n-ignore-start: real place names, and HistorySimulator country ids
  const CITY_BY_COUNTRY = {
    'Italy': 'Rome', 'United Kingdom': 'London', 'Norway': 'Oslo',
    'Russia': 'Moscow', 'Turkey': 'Istanbul', 'Netherlands': 'Amsterdam',
    'Belgium': 'Brussels', 'Switzerland': 'Zurich', 'Austria': 'Vienna',
    'Poland': 'Warsaw', 'Czechoslovakia': 'Prague', 'Hungary': 'Budapest',
    'Romania': 'Bucharest', 'Bulgaria': 'Sofia', 'Yugoslavia': 'Belgrade',
    'Greece': 'Athens', 'Denmark': 'Copenhagen', 'Sweden': 'Stockholm',
    'Finland': 'Helsinki', 'Ireland': 'Dublin', 'Albania': 'Tirana',
    'Estonia': 'Tallinn', 'Latvia': 'Riga', 'Lithuania': 'Vilnius',
  };
  // i18n-ignore-end

  // Nations vs towns. A birthplace is stored under its English id, so the two
  // are told apart against the world data and not against the label a language
  // draws: everything the timeline or Countries.json knows is a country, and
  // anything else (a dossier hometown, an invented "...bledon") is a town.
  let _nationSet = null, _nationSize = -1;
  function isNationId(raw) {
    const name = String(raw == null ? '' : raw).trim();
    if (!name) return false;
    if (name === 'Europe') return true; // i18n-ignore: the continent-wide fallback id
    const listed = (window.WorldGen && window.WorldGen.Countries) || [];
    if (!_nationSet || _nationSize !== listed.length) {
      _nationSet = new Set(Object.keys(window.HistorySimulator_COUNTRIES || {}));
      for (const c of listed) if (c && c.country) _nationSet.add(c.country);
      _nationSize = listed.length;
    }
    return _nationSet.has(name);
  }

  // The preposition and the article in front of a place belong to the language,
  // not to the sentence: English says "in Italy" but "in the Netherlands", and
  // Italian says "in Italia", "nei Paesi Bassi" and "a Bologna". So a bio is
  // handed a finished locative phrase, keyed on the English id (the only stable
  // spelling), with the plain "in {place}" rule as the fallback.
  function locativeOf(rawId, label) {
    const slug = window.WorldNames
      ? window.WorldNames.slug(rawId)
      : String(rawId || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const own = 'NPCSociety.bio.placeIn.' + slug;
    if (slug && T.has(own)) return T(own, { place: label });
    return T(isNationId(rawId) ? 'NPCSociety.bio.inCountry' : 'NPCSociety.bio.inTown',
             { place: label });
  }

  // One wording out of the bank a key holds, picked by index so the same person
  // is always written the same way. A language that still ships a single string
  // instead of a bank answers with that string.
  function wording(key, params, index) {
    const bank = T.list(key, params);
    if (!bank.length) return T(key, params);
    return bank[((index % bank.length) + bank.length) % bank.length];
  }

  const BackstoryGenerator = {

    // `salt` re-rolls a bio that has already been written (rerollBackstory);
    // without it the name is the whole seed, so the same person always gets the
    // same formative events back in the same world.
    generate(eventName, profile, salt) {
      // Read through HistoryManager so backstories see the active-world timeline
      // (WorldManager store) as well as the $gameSystem fallback.
      const events = window.HistoryManager
        ? window.HistoryManager.getEvents()
        : $gameSystem?._historicalEvents;
      if (!events?.length) return null;

      const worldSeed = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new SeededRng((nameToSeed(eventName + (salt || '')) ^ worldSeed) >>> 0);

      // ── Birth year ──────────────────────────────────────────────────────────
      // A curated preset dossier (CharacterCreationPresets) wins over the
      // level-derived estimate, so a pre-made character's stated birth date
      // doesn't contradict what the Empathize panel narrates.
      // Every NPC is an adult: the level-derived estimate is floored at 18 and
      // subtracted from the CURRENT in-game year (not a hardcoded 2001), so a
      // backstory can never describe a minor. A dossier-supplied birth year is
      // honoured but held to the same floor.
      const MIN_AGE   = window.NPCLifeSim?.MIN_NPC_AGE ?? 18;
      const nowYear   = window.NPCLifeSim?.currentYear?.() ?? 2001;
      const age       = MIN_AGE + Math.max(0, profile.level ?? 1) * 2;
      const rolled    = Math.max(1900, nowYear - Math.min(age, 101));
      const birthYear = profile._birthYearOverride != null
        ? Math.min(profile._birthYearOverride, nowYear - MIN_AGE)
        : rolled;

      // ── Candidate events ────────────────────────────────────────────────────
      let candidates = events.filter(e => {
        const y = parseInt((e.date || '').slice(0, 4), 10);
        return !isNaN(y) && y >= birthYear;
      });
      if (candidates.length < 2) {
        // Fallback: last 30 simulated years
        candidates = events.filter(e => {
          const y = parseInt((e.date || '').slice(0, 4), 10);
          return !isNaN(y) && y >= 1971;
        });
      }
      if (!candidates.length) candidates = events.slice(-10);

      // ── Score candidates ────────────────────────────────────────────────────
      const traits     = DataLoader.traits ?? [];
      const factions   = DataLoader.factions ?? [];
      const factionObj = profile.factionIndex >= 0 ? factions[profile.factionIndex] : null;
      const factionKey = factionObj ? (factionObj.name || '').split('.')[1] || '' : '';

      const traitNames = (profile.traitIds ?? []).map(id => {
        const t = traits.find(tr => tr.id === id);
        return (t?.name || '').toLowerCase();
      });
      const isMilitary = traitNames.some(n => n.includes('brave') || n.includes('violent') || n.includes('aggressive'));

      const scored = candidates.map(e => {
        let score = rng.next() * 10;
        if (e.category === 'paranormal' && (profile.moralityScore ?? 0) < -20) score += 4;
        if (e.category === 'political'  && (profile.moralityScore ?? 0) > 20)  score += 4;
        if (e.category === 'military'   && isMilitary)                          score += 3;
        if (e.category === 'social')                                             score += 2;
        if (factionKey && (e.description || '').toLowerCase().includes(factionKey.toLowerCase())) score += 5;
        return { event: e, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const pickCount = candidates.length >= 15 ? 3 : 2;
      // The i18n key travels with the snapshot: an NPC's formative events are
      // copied out of the timeline, and a copy that kept only the finished
      // prose would freeze the bio in the language the century was simulated
      // in (an English coup quoted inside an Italian sentence).
      const formativeEvents = scored.slice(0, pickCount).map(s => ({
        date:        (s.event.date || '').slice(0, 7),
        description: s.event.description || '',
        descKey:     s.event.descKey || null,
        descParams:  s.event.descParams || null,
        category:    s.event.category || 'social',
      }));

      // ── Birthplace ──────────────────────────────────────────────────────────
      const countries = Object.entries(window.HistorySimulator_COUNTRIES ?? {});
      let birthplace = profile._birthplaceOverride || 'Europe'; // i18n-ignore: HistorySimulator country id
      if (!profile._birthplaceOverride && countries.length) {
        const weights = countries.map(([, data]) => {
          const matches = factionKey && (data.faction || '').toLowerCase().includes(factionKey.toLowerCase());
          return matches ? 3 : 1;
        });
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = rng.next() * totalW;
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i];
          if (r <= 0) { birthplace = countries[i][0]; break; }
        }
      }

      // ── Narrative ───────────────────────────────────────────────────────────
      // Only the pieces are stored. The sentence is written out by
      // BackstoryGenerator.narrativeOf() every time the bio is drawn, so it
      // follows a language switch instead of freezing at first meeting.
      const seed = {
        gender:     Math.min(profile.gender ?? 0, PRONOUN_COUNT - 1),
        adjIdx:     rng.nextInt(0, ADJECTIVE_COUNT),
        // Which wording of the era template this person is written with. Drawn
        // last, so a backstory rolled before wordings varied keeps every other
        // piece it was rolled with.
        varIdx:     rng.nextInt(0, 24),
        isCreature: !!profile.isCreature,
        moral:      profile.moralityScore ?? 0,
      };

      return { birthYear, birthplace, formativeEvents, seed };
    },

    // Compose the bio. A profile generated before this was keyed keeps the
    // finished `narrative` string it was saved with.
    narrativeOf(backstory) {
      if (!backstory) return '';
      const seed = backstory.seed;
      if (!seed) return backstory.narrative || '';

      const pr  = pronounOf(seed.gender);
      const adj = adjectiveAt(seed.adjIdx);
      // A backstory rolled before the wordings varied has no varIdx of its own,
      // so one is derived from what it does carry: the same person still reads
      // the same way every time the bio is drawn.
      const vIdx = (seed.varIdx != null ? seed.varIdx | 0
                                        : ((backstory.birthYear | 0) + (seed.adjIdx | 0) * 7)) >>> 0;
      const evs = backstory.formativeEvents || [];
      const ev0 = _shortDesc(_eventText(evs[0]));
      const ev1 = evs[1]
        ? wording('NPCSociety.bio.later',
                  Object.assign({}, pr, { event: _shortDesc(_eventText(evs[1])) }), vIdx + 1)
        : '';

      const moral = seed.moral;
      const band = moral > 60 ? 'high' : moral > 20 ? 'good' : moral > -20 ? 'weary'
                 : moral > -60 ? 'loose' : 'lawless';
      // Offset off the era wording, so the closing line does not always fall
      // with the same opening one.
      const moralLine = wording('NPCSociety.bio.moral.' + band, pr, vIdx + (seed.adjIdx | 0) + 2);

      // A birthplace is a country for most people and a town for anyone born
      // from a dossier hometown; a town reads by its Destinations.json "name",
      // a country by its WorldNames label. Both are stored under their English
      // id, which is what CITY_BY_COUNTRY and the dossiers match on.
      const birthplace = window.WorldNames
        ? window.WorldNames.place(backstory.birthplace)
        : backstory.birthplace;
      // Where the sentence says the person is from, preposition and article
      // included, so a template only ever writes "{born} {placeIn}".
      let placeIn;
      let key;
      if (seed.isCreature) {
        // Creatures aren't born into a nation, they come out of the wilds near
        // the city closest to their birthplace country.
        const city = CITY_BY_COUNTRY[backstory.birthplace] || birthplace;
        placeIn = T('NPCSociety.bio.wildsNear', {
          city: window.WorldNames ? window.WorldNames.place(city) : city,
        });
        key = 'creature';
      } else {
        placeIn = locativeOf(backstory.birthplace, birthplace);
        if (backstory.birthYear <= 1919) key = 'turbulent';
        else if (backstory.birthYear <= 1945) key = 'warYears';
        else if (backstory.birthYear <= 1969) key = 'postwar';
        else key = 'modern';
      }

      const params = Object.assign({}, pr, {
        year: backstory.birthYear, place: birthplace, placeIn: placeIn, adj: adj,
        event: ev0, later: ev1, moral: moralLine,
      });
      return wording('NPCSociety.bio.' + key, params, vIdx).replace(/  +/g, ' ').trim();
    },
  };

  // Re-capitalize proper nouns (country / hyperpower / faction / leader names)
  // after an event description has been lowercased to flow mid-sentence, so the
  // bio reads "...survived the october revolution and Vladimir Lenin's purges".
  let _pnNouns = null, _pnRe = null, _pnMap = null;
  function _restoreProperNouns(text) {
    let nouns = window.HistorySimulator_PROPER_NOUNS;
    if (!nouns || !nouns.length) return text;
    // Merge in live, simulated names (dynamic hyperpowers / nations / leaders)
    // so names not in the static export still get re-capitalized (#82).
    const hm = window.HistoryManager;
    if (hm) {
      const extra = [];
      const hp = hm.getHyperpowers ? (hm.getHyperpowers() || {}) : {};
      for (const name of Object.keys(hp)) {
        extra.push(name);
        for (const l of ((hp[name] && hp[name].leaders) || [])) if (l && l.name) extra.push(l.name);
        for (const l of ((hp[name] && hp[name].holy_leaders) || [])) if (l && l.name) extra.push(l.name);
      }
      const ns = hm.getNationsState ? (hm.getNationsState() || {}) : {};
      for (const n of Object.keys(ns)) {
        extra.push(n);
        if (ns[n] && ns[n].controller && ns[n].controller !== 'Neutral') extra.push(ns[n].controller);
      }
      if (extra.length) nouns = nouns.concat(extra.filter(Boolean));
    }
    // The sentence being reflowed has already been written out in the active
    // language, so the names inside it are the localized ones. The English list
    // is kept as well: a world simulated before descriptions were keyed still
    // quotes English prose.
    if (window.WorldNames) {
      const localized = Array.from(window.WorldNames.map().values());
      if (localized.length) nouns = nouns.concat(localized);
    }
    if (nouns !== _pnNouns) {
      _pnNouns = nouns;
      // Longest first so multi-word names win over their substrings.
      const seen = new Set();
      const sorted = nouns.filter(n => { const k = String(n).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.length - a.length);
      _pnMap = new Map(sorted.map(n => [n.toLowerCase(), n]));
      const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      _pnRe = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
    }
    return text.replace(_pnRe, m => _pnMap.get(m.toLowerCase()) || m);
  }

  // A snapshotted event's sentence in the active language. A snapshot taken
  // before the timeline was keyed keeps the prose it was saved with.
  function _eventText(ev) {
    if (!ev) return '';
    if (ev.descKey && window.HistoryManager?.describeRecord) {
      return window.HistoryManager.describeRecord(ev);
    }
    return ev.description || '';
  }

  function _shortDesc(desc) {
    if (!desc) return T('NPCSociety.bio.uncertainTimes');
    // Event descriptions are read as clauses inside the narrative, so they are
    // quoted in full: cutting them at 60 characters left every second sentence
    // trailing off mid-thought. Only a runaway description is trimmed, and then
    // at a word boundary.
    const MAX = 240;
    // The clause is dropped into the middle of a sentence that supplies its
    // own full stop, so it gives up whatever it ended on: a headline event
    // ("...overthrowing Sniper Zaitsev!") otherwise read as "Zaitsev!.".
    const text = desc.replace(/[.!?…]+\s*$/, '');
    if (text.length <= MAX) return _restoreProperNouns(text.toLowerCase());
    const cut = text.slice(0, MAX).replace(/\s\S*$/, '');
    return _restoreProperNouns(cut.toLowerCase()) + '…';
  }

  // Batch generator, call after runSimulation to backfill all loaded profiles
  window.NPCHistSim = {
    // The bio, written out in the active language. Pass a profile's
    // `backstory`; a profile saved before the bio was keyed returns the
    // finished English string it was stored with.
    narrativeOf(backstory) { return BackstoryGenerator.narrativeOf(backstory); },

    generateBackstoryNow(name) {
      const p = SocietyRegistry.getProfile(name);
      if (!p) return;
      const events = window.HistoryManager
        ? window.HistoryManager.getEvents()
        : ($gameSystem?._historicalEvents || []);
      if (!events.length) return;
      // A backstory built against an unkeyed timeline froze its formative
      // events in one language. Once the world's history carries keys, drop it
      // so it regenerates: the picks are seeded by name, so the same events
      // come back, this time able to follow the language.
      if (p.backstory &&
          (p.backstory.formativeEvents || []).some(e => e && !e.descKey) &&
          events.some(e => e && e.descKey)) {
        p.backstory = null;
      }
      if (!p.backstory) p.backstory = BackstoryGenerator.generate(name, p);
    },

    // Throw the written bio away and write another one, against the profile as
    // it stands now. The Detailed character editor offers this while the player
    // is still deciding who the character is.
    rerollBackstory(name) {
      const p = SocietyRegistry.getProfile(name);
      if (!p) return null;
      const salt = '_' + Math.floor(Math.random() * 0x7fffffff);
      const bio = BackstoryGenerator.generate(name, p, salt);
      if (bio) p.backstory = bio;
      return p.backstory || null;
    },

    generateAllBackstories() {
      for (const name of Object.keys($gameSystem?._npcSociety ?? {}))
        this.generateBackstoryNow(name);
    },

    // Exposed so NPCEmpathize._buildHistoryHTML can call it if needed externally.
    buildBackstoryHTML(backstory) {
      if (!backstory) return '';
      const ICONS = window.HistorySimulator_ICONS ?? {};
      const iconFor = cat => {
        const id = ICONS[cat] ?? 245;
        return `<img src="img/system/IconSet.png" style="width:16px;height:16px;object-fit:none;object-position:-${(id % 16) * 32}px -${Math.floor(id / 16) * 32}px;image-rendering:pixelated;vertical-align:middle;margin-right:3px;">`;
      };
      const eventsHTML = (backstory.formativeEvents ?? []).map(e =>
        `<div class="npc-backstory-event">${iconFor(e.category)}<span>${escapeHtml(e.date)}</span>, ${escapeHtml(_eventText(e))}</div>`
      ).join('');
      return `
        <div class="npc-backstory-text">${escapeHtml(BackstoryGenerator.narrativeOf(backstory))}</div>
        <div class="npc-backstory-events">${eventsHTML}</div>
        <div class="npc-backstory-meta">${escapeHtml(T('NPCSociety.bio.bornMeta', { year: backstory.birthYear,
          place: window.WorldNames ? window.WorldNames.place(backstory.birthplace) : backstory.birthplace }))}</div>`;
    },
  };

})();
