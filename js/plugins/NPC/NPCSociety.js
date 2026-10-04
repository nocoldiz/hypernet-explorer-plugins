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
 * Modules: this file keeps the configuration, the data loader, the social
 * graph, the profile generator, the registry, the engine hooks, the world
 * roster, the standing and the family namespace (NPCSocietyRegistry._internal).
 * The rest lives in NPCSociety_InitSpec, _Romance, _Gear and _Backstory
 * (last), listed in js/plugins.js right after this file in that order.
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
    // Morality (moralityScore, -100 to +100) at and above which a person is
    // "virtuous" and takes no bribe of any kind, however it is offered: the
    // Empathize panel's gift of cash and an arresting officer's alike.
    INCORRUPTIBLE_MORALITY: 60,

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
    if (_leaderMemo && _leaderMemo.has(name)) return _leaderMemo.get(name);
    let answer;
    try { answer = !!window.LeaderPersona?.isLeader?.(name); } catch (e) { answer = false; }
    if (_leaderMemo) _leaderMemo.set(name, answer);
    return answer;
  }

  // Asking the book is a walk over every roster and assembly in the world, and
  // minting one person asks it about everybody already minted. While the world
  // roster is dealt (initializeWorldRoster) nobody takes or leaves office, so
  // each name is asked once; outside that pass every answer is read live.
  let _leaderMemo = null;
  function _withLeaderMemo(fn) {
    if (_leaderMemo) return fn();
    _leaderMemo = new Map();
    try { return fn(); } finally { _leaderMemo = null; }
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
  // SECTION 4: PROFILE GENERATOR
  // ==========================================================================

  // Every skill a class teaches, at any level: what a creature is allowed to
  // know, since everything else on its sheet was rolled for somebody with a
  // trade and a past (see the profile's skillIds below).
  function _classLearningIds(classId) {
    const cls = classId && $dataClasses ? $dataClasses[classId] : null;
    return new Set((cls?.learnings || []).map(l => l.skillId));
  }

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


  const ProfileGenerator = {
    _wealthCumulative: [5, 20, 55, 85, 100],

    // i18n-ignore-start: item-category ids, lowercased and matched against the
    // <category:> note tag
    _wealthItemCats: [
      ["Food","Survival","Homeopathy"],
      ["Food","Tools","Survival","Crafting"],
      ["Food","Tools","Lifestyle","Medical"],
      ["Tools","Lifestyle","Medical","Crafting","Component"],
      ["Magic","Collectibles","Tools","Crafting"],
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
          // One of the risen of a zombie world is a Zombie whatever its sheet
          // lists (NPCCreature.isRisenSheet): no trade, no purse, no creed.
          if (NC && NC.isRisenSheet && NC.isRisenSheet(spriteKey)) assignedClassId = NC.ZOMBIE_CLASS_ID;
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
      // The trait book as it stands open in front of THIS one. A beast is
      // dealt only what a body can be (and what only an animal is); a person is
      // never dealt an animal's trait (Traits.json `mind`, owned by
      // window.TraitPoints.allowsMind). Falling back to the whole book keeps a
      // load order without TraitSelector working exactly as it did.
      const traitBook = points && points.allowsMind
        ? traits.filter(t => points.allowsMind(t, nonSentient))
        : traits;
      const traitIds = [];
      const pickedTraits = [];
      const _full = () => points
        ? points.tally(pickedTraits).remaining <= 0
        : traitIds.length >= 4;
      const _compatible = (id) => {
        const trait = traitBook.find(t => t.id === id);
        if (!trait) return false;
        if (points && !points.fits(trait, pickedTraits)) return false;
        return !traitIds.some(chosen => {
          const c = traits.find(t => t.id === chosen);
          return (trait.incompatible || []).includes(chosen) || (c && (c.incompatible || []).includes(id));
        });
      };
      const _take = (id) => {
        traitIds.push(id);
        pickedTraits.push(traitBook.find(t => t.id === id));
      };
      const shuffledIdeo = seededShuffle([...ideologyTraitIds], rng);
      for (const id of shuffledIdeo) {
        if (traitIds.length >= 2 || _full()) break;
        if (_compatible(id)) _take(id);
      }
      const ideologySet = new Set(ideologyTraitIds);
      const generalPool = seededShuffle(traitBook.filter(t => !ideologySet.has(t.id)).map(t => t.id), rng);
      for (const id of generalPool) {
        if (_full()) break;
        if (_compatible(id)) _take(id);
      }
      if (!_full()) {
        const pickedSet = new Set(traitIds);
        const fallback = seededShuffle(traitBook.map(t => t.id).filter(id => !pickedSet.has(id)), rng);
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
      // Never the Liminal cuffs and never car keys (NPCShared): dropped after
      // the draw, so every other profile's stream stays as it was.
      const _shared = window.NPCShared;
      const itemIds = [];
      for (const x of scoredItems) {
        if (itemIds.length >= numItems) break;
        if (!_shared?.isForbiddenItem?.(x.id) && !_shared?.isCarKeys?.(x.id)) itemIds.push(x.id);
      }

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
        personalityIndex, wealthTierBase, traitIds,
        // A beast knows what its own body does and nothing else. The four
        // rolled skills above are a person's training (Net and Trident,
        // Accounting's cousins, a coffee break) and the trait grants are a
        // person's history, so what is left for a creature is exactly what its
        // own class teaches it: claws, a shriek, a bolt for cover.
        skillIds: nonSentient
          ? skillIds.filter(id => _classLearningIds(assignedClassId).has(id))
          : skillIds,
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
    // A politician made into a person (NPCPolitics REAL POLITICIANS) is linked
    // from the political record by name, and is never pruned out from under it.
    if (profile._politicianId) return false;
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
    if (!(profile.money > 0) && window.NPCCreature?.mayHoldMoney?.(profile, name) !== false) {
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
        // A goblin's face is a Naguka's or a Verden's, and which one depends on
        // where they were met (NPCCreature.assignGoblinSpecies).
        if (NC.assignGoblinSpecies?.(profile, eventName)) changed = true;
        // Any other people's face (an Elf, a Dwarf, an Orc, a Tourist...) is
        // that people, a plain Humanoid profile included.
        const people = entry.Archetype;
        if (people && people !== profile.archetype && (profile.archetype || "Humanoid") === "Humanoid" && // i18n-ignore: Archetypes.json key
            window.HealthCore?.isHumanoidBody?.(people) && !NC.isGoblinArchetype?.(people)) {
          profile.archetype = people;
          changed = true;
        }
        const risen = !!NC.isRisenSheet?.(profile.spriteKey);
        if (profile.isCreature) {
          // A beast's anatomy does not follow it into a person's clothes.
          profile.isCreature = false;
          profile.archetype = entry.Archetype || "Humanoid"; // i18n-ignore: Archetypes.json id
          changed = true;
        }
        if (risen) {
          // One of the risen of a zombie world wears a person's sheet and is
          // a Zombie all the same (NPCCreature.isRisenSheet).
          if (profile.assignedClassId !== NC.ZOMBIE_CLASS_ID) {
            profile.assignedClassId = NC.ZOMBIE_CLASS_ID;
            changed = true;
          }
        } else if (NC.isNonSentientClassId(profile.assignedClassId)) {
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
        // A person's training and a person's history, stripped back to what the
        // creature's own class teaches and what a body can be. Both are the
        // same rules the generator now mints under; this is what repairs a
        // world folder written before they existed, which is where the dog
        // carrying a halberd and an accountancy qualification came from.
        const learned = _classLearningIds(profile.assignedClassId);
        if (Array.isArray(profile.skillIds)) {
          const kept = profile.skillIds.filter(id => learned.has(id));
          if (kept.length !== profile.skillIds.length) { profile.skillIds = kept; changed = true; }
        }
        if (profile.levelSkillBrackets) {
          for (const key of Object.keys(profile.levelSkillBrackets)) {
            const bracket = profile.levelSkillBrackets[key] || [];
            const kept = bracket.filter(id => learned.has(id));
            if (kept.length !== bracket.length) { profile.levelSkillBrackets[key] = kept; changed = true; }
          }
        }
        const points = window.TraitPoints;
        if (points && points.allowsMind && Array.isArray(profile.traitIds)) {
          const book = DataLoader.traits || [];
          const kept = profile.traitIds.filter(id => {
            const trait = book.find(t => t.id === id);
            return !trait || points.allowsMind(trait, true);
          });
          if (kept.length !== profile.traitIds.length) { profile.traitIds = kept; changed = true; }
        }
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
      // A child holds no creed, no purse and no banner of their own yet
      // (NPCLifeSim FAMILY); growing up hands them those.
      if (!nonSentient && !profile._child && _restorePersonhood(eventName, profile)) changed = true;
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

    // Whether this person refuses every bribe. Takes a profile or a name; a
    // stranger with no profile is of middling morality and can be bought.
    isIncorruptible(profileOrName) {
      const p = typeof profileOrName === 'string' ? this.getProfile(profileOrName) : profileOrName;
      return (Number(p?.moralityScore) || 0) >= SocConfig.INCORRUPTIBLE_MORALITY;
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
    // A creature or an animal nobody drew by hand wears a `creature: true` or
    // `animal: true` sheet, never a person's: when the one on its profile is a
    // person's, one that fits its class is dealt before the face is read.
    if (!isMapDesigned && !initSpec?.sprite) {
      const exterior = !window.ProceduralInteriors?.isCurrent?.();
      const beast = window.NPCCreature?.isCreatureIdentity?.(profile, eventName)
        ? window.NPCCreature.creatureSheetFor(profile, eventName, exterior) : null;
      if (beast && beast !== profile.spriteKey) {
        profile.spriteKey = beast;
        profile.bustIndex = 0;
      }
    }
    // Whatever face this NPC ends up with, what it IS follows from that face
    // and nothing else. Run before anything below reads profile.isCreature, and
    // again after a map-designed sprite is pinned, since only then is the sheet
    // it actually wears known.
    SocietyRegistry.reconcileToSprite(eventName, profile);
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
      // The sheet they wear is in no catalogue (an authored event on a
      // Monsters/ or Originals/ sheet), so there is no face to read off it.
      // A bust cached under this event's NAME is dropped rather than kept: the
      // society table is keyed by name alone and several authored events share
      // one, so anything left here is the last same-named event's face and
      // would be shown for somebody it does not belong to. In its place goes
      // the portrait the sheet itself is named after, when there is one.
      if (!initSpec?.bust) profile._bustName = window.BustPath?.forSheet?.(spriteKey) || null;
      if (initSpec) NPCInitSpec.applyIdentity(profile, initSpec);
      if (initSpec?.bust) profile._bustName = initSpec.bust;
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

    // The towns' own people first: a household behind every door and the
    // street-folk of every map, dealt from the world seed (NPCSystem.js,
    // RESIDENT REGISTRY). The authored cast below is minted after them and
    // keeps the names it was written with.
    try {
      const dealt = NPCSys.ensureResidents?.() || 0;
      console.log(`[NPCSociety] Residents: ${dealt} people dealt across the hand-made towns.`);  // i18n-ignore: diagnostic
    } catch (e) {
      console.error("[NPCSociety] Could not deal the residents", e);  // i18n-ignore: diagnostic
    }

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

    // A world with nobody left in it (WorldModes.simulatesPeople: empty,
    // death) mints its written cast alone, the one set of people who still
    // walk it (NPCSystem wakeStoryNPCs), and staffs no job.
    const WMo = window.NPCShared?.WorldModes;
    const peopled = !WMo || WMo.simulatesPeople();

    // name → [{ groupName, eventData }], in group order.
    const claims = new Map();
    for (const groupName of groups) {
      // Jobs first: the shift each person works decides where they spend their
      // day, and the leftovers become the group's counter-staff pool, which
      // the shop rotas are drawn from in the next step.
      if (peopled) {
        try { window.NPCSim?.JobShiftManager?.ensureGroupAssignments?.(groupName); } catch (e) {
          console.error(`[NPCSociety] Job assignment failed for "${groupName}"`, e);
        }
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
        if (!peopled && !NPCSys.hasStoryTag?.(ev.note)) continue;
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
    window.WorldManager.registerWorldInitializer("npcRoster", 20, () => _withLeaderMemo(initializeWorldRoster));
  }

  window.NPCSocietyRegistry = SocietyRegistry;
  window.NPCSocietyConfig = SocConfig;
  SocietyRegistry.initializeWorldRoster = initializeWorldRoster;
  // Runs fn with each "is this a world leader?" answer asked of the book once.
  // Only for a pass in which nobody takes or leaves office.
  SocietyRegistry.withLeaderMemo = _withLeaderMemo;



  // ---------------------------------------------------------------------------
  // Standing belongs to the savegame, not to the world
  // ---------------------------------------------------------------------------
  // A society profile lives in the world folder (npcs.json, WorldManager), which
  // is how two savegames of a world meet the same people with the same jobs,
  // homes and histories. What those people think of THIS party is not a fact
  // about the world though, it is a fact about the playthrough: left in the world
  // file, an opinion moved to 0 after a save is still 0 when that save is loaded
  // back, and the -10 the party had earned is gone.
  //
  // So the three player-facing numbers on a profile travel in the binary
  // savegame and are written back over the world copy on load. The
  // cross-playthrough record is untouched: every move is still mirrored into
  // party.json by NPCEmpathize (PartyPresence.setDisposition), which is where a
  // standing that must outlive a savegame is kept.
  const STANDING_FIELDS = ["opinions", "attraction", "playerOpinion"];

  const society = () => (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._npcSociety) || {};

  const NPCStanding = {
    // What every profile in the world currently thinks of the party.
    snapshot() {
      const out = {};
      for (const [name, profile] of Object.entries(society())) {
        if (!profile) continue;
        let held = null;
        for (const field of STANDING_FIELDS) {
          if (profile[field] == null) continue;
          // Copied, not pointed at: the snapshot is what the party stood at when
          // the save was written, and play goes on from there.
          const value = profile[field];
          (held || (held = {}))[field] = (value && typeof value === "object")
            ? Object.assign({}, value) : value;
        }
        if (held) out[name] = held;
      }
      return out;
    },

    // Put a snapshot back: every profile forgets what the world file told it
    // about the party, then takes what this savegame remembers. A name the
    // snapshot never heard of is left neutral rather than left as it was.
    apply(snapshot) {
      const held = (snapshot && typeof snapshot === "object") ? snapshot : {};
      for (const [name, profile] of Object.entries(society())) {
        if (!profile) continue;
        for (const field of STANDING_FIELDS) delete profile[field];
        const mine = held[name];
        if (!mine) continue;
        for (const field of STANDING_FIELDS) {
          if (mine[field] == null) continue;
          const value = mine[field];
          profile[field] = (value && typeof value === "object")
            ? Object.assign({}, value) : value;
        }
      }
    },

    // A new party is a stranger to everybody, even in a world somebody else
    // has already lived a life in.
    clear() { this.apply({}); },
  };

  window.NPCStanding = NPCStanding;

  const _DataManager_makeSaveContents_standing = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents_standing.call(this);
    contents.npcStanding = NPCStanding.snapshot();
    return contents;
  };

  const _DataManager_extractSaveContents_standing = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents_standing.call(this, contents);
    // A save written before standing travelled in the binary has nothing to say,
    // and keeps whatever the world file holds, so nobody loses a reputation they
    // earned on the day this is installed.
    if (contents && contents.npcStanding) NPCStanding.apply(contents.npcStanding);
  };

  const _DataManager_setupNewGame_standing = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame_standing.call(this);
    NPCStanding.clear();
  };

  // ==========================================================================
  // FAMILY NAMESPACE (NPCSociety_*.js)
  // ==========================================================================
  // The society is split across the NPCSociety_*.js modules listed in
  // js/plugins.js right after this file. Each module reads the helpers it
  // shares with the others off NPCSocietyRegistry._internal and publishes
  // its own there; a name owned by a module that loads later is bound through
  // _late, which NPCSociety_Backstory.js (the last module) runs once the
  // whole family is in.

  window.NPCSocietyRegistry._internal = { _late: [] };
  Object.assign(window.NPCSocietyRegistry._internal, {
    _natureLevel, DataLoader, escapeHtml, nameToSeed, SeededRng, SocietyRegistry,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let _syncLocalLevel, _syncPartyMemberStats, NPCInitSpec;
  window.NPCSocietyRegistry._internal._late.push(() => ({
    _syncLocalLevel, _syncPartyMemberStats, NPCInitSpec,
  } = window.NPCSocietyRegistry._internal));

})();
