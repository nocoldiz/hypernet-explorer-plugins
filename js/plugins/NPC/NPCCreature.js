/*:
 * @target MZ
 * @plugindesc NPCCreature v1.0.0, creature identity for NPCs and party members
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCCreature, who in this world is an animal rather than a person
 * ============================================================================
 * A share of every settlement is not people. In a monster world it is ALL of
 * them; in an ordinary one it is the stray dog on the corner and the thing in
 * the cellar, one face in twelve. This plugin is the single place that decides
 * who, and what they are once decided:
 *
 * The sprite is dealt FIRST and everything else follows from it, so what is
 * minted is always a body the wardrobe actually has art for:
 *
 *   , a walking sprite out of the creature wardrobe, which is the `creature`
 *     and `animal` entries of js/db/WorldGen/NPCs.json (the Creatures/ and
 *     Animals/ folders) and nothing else. The Monsters/ folder is what a
 *     battle is drawn with and is NOT dealt here: a beast wearing an enemy
 *     sheet on a town street reads as a monster the party failed to notice.
 *     Those sheets come back only in a monster world, where the confusion
 *     costs nothing because everything walking about IS a monster.
 *     A monster world deals the two halves of that wardrobe EVENLY, the half
 *     first and the sheet inside it second: half of its crowd is a `creature`
 *     sheet (the Monsters/ ones with them) and half is an `animal` one.
 *   , the archetype that sprite carries in its own NPCs.json entry, plus a
 *     second one crossed into it on a 5% roll (25% in a monster world)
 *   , a class out of that SHEET's own `classes` array, never out of the
 *     archetype's roster: the sheet is the authority and the archetype (a
 *     crossed-in second one included) never changes the answer. It is one of
 *     the creature classes the sheet lists (Feral, Mimic, Monster, Mana
 *     Cyborg, Ghost, Zombie, Mutant, Drone , ids 63-70) on 95% of rolls (50%
 *     in a monster world) and one of the civilised 1-62 it lists on the rest.
 *     Only a sheet with no entry to read (a Monsters/ one) falls back to the
 *     archetype rosters, since it has nothing else to be.
 *   , a 3D model resolved from a $dataEnemies entry tagged with one of those
 *     same archetypes, so the model is always one the archetype supports
 *
 * A creature on a CREATURE class is non-sentient. It holds no conversation
 * (NPCConversation answers for it in growls), holds no political allegiance
 * (NPCPolitics skips it), never saves toward a better house and never moves
 * (NPCSimulationCore / NPCLifeSimulator), and starts with no money at all.
 * A creature on a civilised class is a person shaped like an animal and is
 * treated as one everywhere.
 *
 * window.NPCCreature:
 *   creatureChance()              share of new NPCs minted as creatures
 *   hybridChance() / nonSentientChance()
 *   rollIdentity(rng, exterior)   { archetypes, archetype, spriteKey,
 *                                   bustIndex, classId }, exterior (default
 *                                   true) gates the Animals/ half of the
 *                                   wardrobe to NPCs standing outside
 *   isCreatureProfile(profile)
 *   archetypeKeysOf(source)       profile | actor | "A / B" -> ["A", "B"]
 *   archetypeLabel(source)        display names, joined
 *   isNonSentientClassId(id)
 *   isNonSentientProfile(profile)
 *   isNonSentientActor(actor)
 *   isNonSentientByName(name)    party actor first, society profile second
 *   sheetHalf(spriteKey)         "creature" | "animal" | "" off the NPCs.json
 *                                 flags, the one authority on what a sheet is
 *   isCreatureSheet(spriteKey)
 *   sentientClassFor(key, seed)   a civilised class off that sheet's roster
 *   creatureWardrobe()            [{ spriteKey, archetype, busts, half }] to
 *                                 deal from, `half` being "creature"/"animal"
 *   spritesForArchetypes(keys)    walking sprites both archetypes support
 *   enemyForArchetypes(keys, seed) a $dataEnemies entry of that archetype
 *   modelForArchetypes(keys, seed) { key, enemyData } for Battler3D.create
 *   modelKeyForSprite(spriteKey) / modelForSprite(spriteKey)
 *                                 the model an NPCs.json sheet names outright
 *
 * Load order: after NPCShared, before NPCSociety.
 */

(() => {
  "use strict";

  // How much of a population is not people. A monster world is ALL of them,
  // and there the two halves of the wardrobe are dealt evenly: half of what
  // walks about is a `creature` sheet and half is an `animal` one (see
  // rollIdentity). Everywhere else they are the exception that makes a street
  // feel alive, one face in twelve, and the halves are dealt flat.
  const CREATURE_CHANCE_MONSTER = 1.0;
  // Out in the country a creature is an ordinary sight: a quarter of whoever
  // is about is one. Inside a town it is not , people live in towns, and a
  // street where every fourth passer-by is a beast reads as a monster world
  // rather than as a market square , so a settlement drops it to one in twenty.
  // "A settlement" is both kinds: a procedural city or village square, and any
  // map belonging to a hand-made MapGroup, which is what an authored town is.
  const CREATURE_CHANCE_SETTLEMENT = 0.05;
  const CREATURE_CHANCE_WILD       = 0.25;
  const CREATURE_CHANCE_NORMAL     = CREATURE_CHANCE_WILD;
  // A zombie world has almost nobody left to meet. What still moves is the
  // dead (dealt by NPCSystem's own re-skin pass over the slots) and the
  // wildlife that inherited the place, so most of what is NOT a corpse is an
  // animal or a creature rather than a person. The town/country split does not
  // apply: an emptied town is as overrun as the fields around it.
  const CREATURE_CHANCE_ZOMBIE     = 0.60;
  // How a monster world splits the two halves of the wardrobe. It is a world of
  // MONSTERS, not a world of livestock: seven in ten of its crowd is a creature
  // sheet and three in ten an animal one.
  const MONSTER_CREATURE_HALF = 0.7;
  // A zombie world tips the other way: what took the place over is WILDLIFE,
  // so two thirds of it is an animal sheet and the rest is a creature.
  const ZOMBIE_CREATURE_HALF = 0.35;
  // Of those, how many are crossed with a HUMANOID half. This is the one cross
  // the wardrobe deals, and it is the whole of what makes a creature a person:
  // a Humanoid slot is a mind, a mouth and a pair of hands, and the thing that
  // has one holds a civilised trade instead of the class its own sheet names
  // (see rollClassId). It mirrors character creation, where a creature is only
  // offered the civilised roster once it is half Humanoid. A curiosity in an
  // ordinary world, half the crowd in a monster one.
  const HYBRID_CHANCE_MONSTER = 0.50;
  const HYBRID_CHANCE_NORMAL  = 0.25;
  // And practically never in a zombie world: the Humanoid half is what makes a
  // creature a person, and there is under one person in a hundred left.
  const HYBRID_CHANCE_ZOMBIE  = 0.01;
  // The half that is crossed in. Not drawn from the wardrobe: a beast with a
  // person in it is the only cross there is.
  const HYBRID_ARCHETYPE = "Humanoid";
  // Highest civilised class id. A creature crossed with a Humanoid is dealt one
  // of 1..62 flat, since what it may be is no longer read off its own sheet.
  const SENTIENT_CLASS_MAX_FALLBACK = 62;
  // And how many of the REST , the ones with no Humanoid in them , are dealt
  // one of their own creature classes rather than one of the civilised ones
  // their sheet also lists. It is not a flat draw over the two rosters: a sheet
  // offers a handful of creature classes against up to 62 civilised ones, so a
  // flat draw would make nearly every creature a talking one. A stray dog is a
  // dog. In a monster world the split is even, because there a talking beast is
  // half the population.
  // A monster world's creatures are PEOPLE, mostly: four in five of them holds
  // a trade, a creed and a conversation, and the remaining fifth is the thing
  // it looks like. That is what makes it a world rather than a bestiary. Its
  // animals are unaffected, an animal is an animal in every world.
  const NONSENTIENT_CHANCE_MONSTER = 0.20;
  const NONSENTIENT_CHANCE_NORMAL  = 0.95;
  // Nothing that survived the end of the world kept a trade.
  const NONSENTIENT_CHANCE_ZOMBIE  = 0.99;

  // Everything from Feral (63) upward is a creature class. Kept in step with
  // CreatureClasses.sentientMax(), which owns the number; this is the fallback
  // for the load-order window before CharacterCreationShared has run.
  //
  // The eight ids 63-70 (Feral, Mimic, Monster, Mana Cyborg, Ghost, Zombie,
  // Mutant, Drone) are non-sentient BY CONSTRUCTION and never answer otherwise,
  // whatever sentientMax() happens to say: they are the roster the creature
  // half of the wardrobe is dealt from, and the whole NPC suite hangs its
  // "is this a person" question off the answer.
  const NONSENTIENT_CLASS_MIN = 63;
  const NONSENTIENT_CLASS_MAX = 70;

  // What an ANIMAL is, always: whatever its own NPCs.json entry says, and never
  // a person. Every `animal: true` entry lists exactly one class and it is a
  // creature class , Feral for the living and Zombie for the risen ones (the
  // DogZombie and CrabZombie sheets) , so the sheet is read rather than a class
  // forced onto it. FERAL_CLASS_ID is the answer for a sheet whose entry lists
  // nothing at all, which no shipped sheet does.
  const FERAL_CLASS_ID = 63;

  const DEFAULT_ARCHETYPE = "Humanoid";

  function archetypes() {
    return (window.Health && window.Health.Archetypes) || {};
  }

  function sentientMax() {
    const CC = window.CreatureClasses;
    return CC && CC.sentientMax ? CC.sentientMax() : NONSENTIENT_CLASS_MIN - 1;
  }

  // The one question every share below is asked of. A monster world is the only
  // place the battle sheets are worn in the street and the only place a talking
  // beast is unremarkable, so both answers hang off it.
  function isMonsterWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isMonsterWorld === "function" && WM.isMonsterWorld());
  }

  // The other population mode that rewrites every share below: the dead got up
  // and the wildlife moved in (WorldManager.populationMode "zombie").
  function isZombieWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isZombieWorld === "function" && WM.isZombieWorld());
  }

  function hybridChance() {
    if (isMonsterWorld()) return HYBRID_CHANCE_MONSTER;
    if (isZombieWorld()) return HYBRID_CHANCE_ZOMBIE;
    return HYBRID_CHANCE_NORMAL;
  }

  function nonSentientChance() {
    if (isMonsterWorld()) return NONSENTIENT_CHANCE_MONSTER;
    if (isZombieWorld()) return NONSENTIENT_CHANCE_ZOMBIE;
    return NONSENTIENT_CHANCE_NORMAL;
  }

  // Which half of the wardrobe a world deals from, and how often. Null in an
  // ordinary world, where the whole wardrobe is drawn flat and a stray dog is
  // simply the commonest thing in it.
  function creatureHalfShare() {
    if (isMonsterWorld()) return MONSTER_CREATURE_HALF;
    if (isZombieWorld()) return ZOMBIE_CREATURE_HALF;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Walking sprites
  // ---------------------------------------------------------------------------
  // Every file in img/characters/Monsters is a single-character sheet and is
  // named "$Name.png"; an archetype's `sprites` roster lists the bare names.
  // The directory is read once and cached, so a roster entry whose art was
  // never shipped is dropped rather than left to draw as a blank event. When
  // the directory cannot be read at all (a browser build with no fs), the
  // roster is trusted as written , the sheets are what it was authored from.
  let _spriteFiles = null;

  function spriteFileIndex() {
    if (_spriteFiles) return _spriteFiles;
    _spriteFiles = {};
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(
        path.dirname(process.mainModule.filename), "img/characters/Monsters/");
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(png|jpg|jpeg)$/i.test(file)) continue;
        const name = file.replace(/\.(png|jpg|jpeg)$/i, "");
        _spriteFiles[name.replace(/^[$!]+/, "")] = name;
      }
    } catch (e) {
      _spriteFiles = null; // unreadable: fall back to trusting the roster
    }
    return _spriteFiles;
  }

  // The sheet name for one roster entry ("Beetle" -> "Monsters/$Beetle"), or
  // null when the art is missing.
  function spritePathFor(name) {
    if (!name) return null;
    const index = spriteFileIndex();
    if (!index) return "Monsters/$" + name;
    const file = index[name];
    return file ? "Monsters/" + file : null;
  }

  // Every walking sprite the given archetypes support. A hybrid draws on both
  // rosters rather than their intersection: it is one body built out of two,
  // and either half is a fair likeness of it.
  function spritesForArchetypes(keys) {
    const data = archetypes();
    const out = [];
    const seen = new Set();
    for (const key of keys || []) {
      const entry = data[key];
      for (const name of (entry && entry.sprites) || []) {
        if (seen.has(name)) continue;
        seen.add(name);
        const path = spritePathFor(name);
        if (path) out.push(path);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // The creature wardrobe
  // ---------------------------------------------------------------------------
  // What a creature NPC may actually be seen wearing, as
  // [{ spriteKey, archetype, busts }]. Ordinarily it is the Creatures/ and
  // Animals/ halves of the NPCs.json catalogue and nothing else, so a beast met
  // in the street is drawn from the same wardrobe every other inhabitant is and
  // is never confused with an enemy on the map.
  //
  // A monster world adds the Monsters/ sheets on top, one entry per archetype
  // that lists the sheet, so the battle art walks about there too. That is the
  // one setting where it cannot mislead: everything in it is a monster.
  //
  // Cached per world flavour, since the answer changes with the population mode
  // and the magic level and a world can be switched inside one session.
  let _wardrobe = null;
  let _wardrobeArchetypes = null;
  let _wardrobeSlot = "";

  function npcData() {
    return (window.WorldGen && window.WorldGen.NPCs) || {};
  }

  function wardrobeSlot(exterior) {
    const magic = (window.MagicNature && window.MagicNature.level)
      ? window.MagicNature.level() : "normal";
    // The biome is part of the key: the animal half of the wardrobe is gated on
    // it (animalFitsHere), so a cache built on a beach must not answer for the
    // highlands the party walks into next.
    return (isMonsterWorld() ? "monster" : "normal") + ":" + magic + ":" +
      (exterior ? "ext" : "int") + ":" + (currentBiomeName() || "");
  }

  // The catalogue half: every `creature` / `animal` entry the world allows.
  // SpriteCatalog owns the wardrobe and answers this when it is loaded; the
  // fallback reads the same file directly for the load-order window before
  // DataService has run.
  //
  // `exterior` (default true, permissive) gates the Animals/ half only: a
  // stray dog belongs on the street, not the landing of somebody's staircase.
  // The Creatures/ half (Mimic, Ghost, Zombie...) is unaffected, those are as
  // much at home behind a door as anywhere else.
  function catalogueKeys(exterior = true) {
    const SC = window.SpriteCatalog;
    if (SC && typeof SC.creatureKeys === "function") return SC.creatureKeys({ exterior });
    const data = npcData();
    return Object.keys(data).filter((k) => {
      const e = data[k];
      if (!e || e.npc !== true) return false;
      if (e.creature === true) return true;
      return e.animal === true && (exterior || isIndoorAnimal(k)) && animalFitsHere(k);
    });
  }

  // Which country a wild animal belongs in. Every `animal: true` entry lists
  // the biomes its kind is found in (`animalGrowth.biomes`), so a crab is met
  // on a beach and a goat in the highlands rather than either turning up
  // wherever the wardrobe happened to deal. An animal met this way belongs to
  // nobody: the owned ones stand on a farm and are placed by AnimalGrowthSystem.
  //
  // A sheet with no list, and anywhere with no biome to read (the world map, an
  // authored map with no note), is left open: the gate narrows the wardrobe, it
  // never empties it.
  function currentBiomeName() {
    const proc = (typeof $gameSystem !== "undefined" && $gameSystem)
      ? $gameSystem._procGenData : null;
    const procMapId = window.WorldMapReturn ? window.WorldMapReturn.procMapId : 636;
    if (proc && proc.currentBiome && typeof $gameMap !== "undefined" && $gameMap &&
        $gameMap.mapId() === procMapId) return proc.currentBiome;
    const meta = (typeof $dataMap !== "undefined" && $dataMap && $dataMap.meta)
      ? $dataMap.meta.Biome : null;
    if (typeof meta === "string" && meta.trim()) return meta.trim();
    return (proc && proc.currentBiome) || null;
  }

  function animalFitsHere(spriteKey) {
    const entry = npcData()[spriteKey];
    const list = entry && entry.animalGrowth && entry.animalGrowth.biomes;
    if (!Array.isArray(list) || !list.length) return true;
    const biome = currentBiomeName();
    if (!biome) return true;
    return list.indexOf(biome) >= 0;
  }

  // A house pet. A dog, a cat, a rabbit and the two things people keep in a
  // tank belong indoors as much as out, and say so on their own wardrobe entry
  // (`animalGrowth.indoors` in js/db/WorldGen/NPCs.json). The livestock does
  // not: a cow on the landing of somebody's staircase is the bug the exterior
  // gate exists to stop.
  function isIndoorAnimal(spriteKey) {
    const entry = spriteKey ? npcData()[spriteKey] : null;
    return !!(entry && entry.animal === true && entry.animalGrowth &&
      entry.animalGrowth.indoors === true);
  }

  function creatureWardrobe(exterior = true) {
    const slot = wardrobeSlot(exterior);
    if (_wardrobe && _wardrobeSlot === slot) return _wardrobe;
    _wardrobeSlot = slot;

    const data = npcData();
    const known = archetypes();
    const out = [];
    for (const key of catalogueKeys(exterior)) {
      const entry = data[key];
      const archetype = (entry && entry.Archetype) || "";
      // An entry naming an archetype the health tables never heard of has no
      // class roster and no anatomy to be built from, so it is not dealt.
      if (!archetype || !known[archetype]) continue;
      // Which half of the wardrobe the sheet came out of, the `creature` or
      // the `animal` one. A monster world deals the two evenly and needs to be
      // able to tell them apart after the fact.
      out.push({
        spriteKey: key,
        archetype,
        busts: (entry.busts || []).length,
        half: entry.animal === true ? "animal" : "creature"
      });
    }

    if (isMonsterWorld()) {
      const seen = new Set(out.map((e) => e.spriteKey));
      for (const archetype of Object.keys(known)) {
        for (const spriteKey of spritesForArchetypes([archetype])) {
          if (seen.has(spriteKey)) continue;
          seen.add(spriteKey);
          // A Monsters/ sheet is one character wide and carries no bust of
          // its own; the panel draws its 3D model instead. It counts as the
          // creature half: a bestiary sheet is a monster by construction, and
          // the 32 `creature` entries alone would repeat themselves all day.
          out.push({ spriteKey, archetype, busts: 0, half: "creature" });
        }
      }
    }

    _wardrobe = out;
    _wardrobeArchetypes = [...new Set(out.map((e) => e.archetype))];
    return _wardrobe;
  }

  // The archetypes a creature NPC may be minted as: the ones some sheet in the
  // wardrobe actually wears, since an NPC with no sprite has no body to stand
  // in the street with. Built with the wardrobe and cached with it, the hybrid
  // roll asks for it on every cross.
  function archetypePool(exterior = true) {
    creatureWardrobe(exterior);
    return _wardrobeArchetypes || [];
  }

  // ---------------------------------------------------------------------------
  // Archetype reading
  // ---------------------------------------------------------------------------
  // An archetype is stored the way Health_Core stores it: "A" for one, "A / B"
  // for a hybrid. Accepts the stored string, a society profile, or an actor.
  function archetypeKeysOf(source) {
    if (!source) return [];
    let stored = source;
    if (typeof source !== "string") {
      stored = source._currentArchetype || source.archetype || "";
    }
    return String(stored)
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function archetypeLabel(source) {
    const HC = window.HealthCore;
    const keys = archetypeKeysOf(source);
    if (!keys.length) return "";
    return keys
      .map((k) => (HC && HC.getArchetypeDisplayName ? HC.getArchetypeDisplayName(k) : k))
      .join(" / ");
  }

  // ---------------------------------------------------------------------------
  // Sentience
  // ---------------------------------------------------------------------------
  function isNonSentientClassId(classId) {
    const id = Number(classId) || 0;
    // The 63-70 block is non-sentient outright, so a load-order window or a
    // future roster change can never quietly hand a beast a person's rights.
    if (id >= NONSENTIENT_CLASS_MIN && id <= NONSENTIENT_CLASS_MAX) return true;
    return id > sentientMax();
  }

  // Whether this sheet is one of the `animal: true` half of the catalogue,
  // which is the one thing that makes rollClassId answer Feral outright.
  function isAnimalSheet(spriteKey) {
    return sheetHalf(spriteKey) === "animal";
  }

  // The player's own creature characters are NOT stripped of the things a
  // person owns: a beast the player built and plays is theirs, money, pack and
  // all, and only the world's own beasts are held to the rule. Anybody in the
  // party now, or who has ever been in it, answers true here.
  function isPlayerCharacterName(name) {
    if (!name) return false;
    if (typeof $gameParty !== "undefined" && $gameParty &&
        ($gameParty.members() || []).some((m) => m && m.name() === name)) return true;
    const past = (typeof $gameSystem !== "undefined" && $gameSystem)
      ? $gameSystem._npcPastPartyMembers : null;
    if (!Array.isArray(past)) return false;
    return past.some((p) => p === name || (p && p.name === name));
  }

  function isCreatureProfile(profile) {
    return !!(profile && profile.isCreature);
  }

  function isNonSentientProfile(profile) {
    if (!profile) return false;
    return isNonSentientClassId(profile.assignedClassId);
  }

  function isNonSentientActor(actor) {
    if (!actor) return false;
    const id = (actor.currentClass && actor.currentClass()?.id) ?? actor._classId ?? 0;
    return isNonSentientClassId(id);
  }

  // The same question asked of a NAME, which is how the simulation layers refer
  // to everybody. A party member's truth is the class on the actor, not the one
  // on the society profile that shadows them (the profile is written by the
  // creation panel and can lag a class change), so the actor is checked first
  // and the profile answers for everybody who is not in the party.
  function isNonSentientByName(name) {
    if (!name) return false;
    if (typeof $gameParty !== "undefined" && $gameParty) {
      const member = ($gameParty.members() || []).find((m) => m && m.name() === name);
      if (member) return isNonSentientActor(member);
    }
    const profile = (typeof $gameSystem !== "undefined" && $gameSystem &&
      $gameSystem._npcSociety) ? $gameSystem._npcSociety[name] : null;
    return isNonSentientProfile(profile);
  }

  // ---------------------------------------------------------------------------
  // What a SHEET is
  // ---------------------------------------------------------------------------
  // The one authority on whether something is a creature at all: the `creature`
  // and `animal` flags on its NPCs.json entry. Not the folder the sheet sits
  // in, not the classes it lists, not what a roll decided about it before its
  // face was dealt. A creature entry always carries `creature: true` and an
  // animal one always carries `animal: true`, so anything that carries neither
  // is a person however it is filed.
  //
  //   sheetHalf(key) -> "creature" | "animal" | ""   ("" = a person's sheet)
  //
  // A sheet with no entry at all (an authored character's own graphic, a
  // Monsters/ bestiary sheet) is not in the wardrobe and answers "", so nothing
  // built on this ever repaints a written character as a beast.
  function sheetHalf(spriteKey) {
    const entry = spriteKey ? npcData()[spriteKey] : null;
    if (!entry) return "";
    if (entry.creature === true) return "creature";
    if (entry.animal === true) return "animal";
    return "";
  }

  function isCreatureSheet(spriteKey) {
    return !!sheetHalf(spriteKey);
  }

  // A civilised class for somebody wearing a PERSON's sheet, off that sheet's
  // own `classes` roster (never the archetype's, the sheet is the authority the
  // same way it is in rollClassId) and dealt off `seed` so the answer is the
  // same one every time it is asked. Used to repair a profile that was minted
  // as a beast and then bound to a person's face; Freelancer answers for a
  // sheet whose roster has no civilised class in it at all.
  const SENTIENT_FALLBACK_CLASS_ID = 1;

  function seedOf(source) {
    if (typeof source === "number") return source >>> 0;
    const text = String(source == null ? "" : source);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function sentientClassFor(spriteKey, seed) {
    const entry = spriteKey ? npcData()[spriteKey] : null;
    const own = Array.isArray(entry && entry.classes) ? entry.classes : [];
    const pool = own.filter((id) => !isNonSentientClassId(id));
    if (!pool.length) return SENTIENT_FALLBACK_CLASS_ID;
    return pool[seedOf(seed) % pool.length];
  }

  // ---------------------------------------------------------------------------
  // Minting
  // ---------------------------------------------------------------------------
  // Which procedural biomes are somebody's town. Every city, burg and village
  // variant, plus the two that ARE housing; everything else is country.
  const SETTLEMENT_BIOMES = new Set([
    "City", "CityDesert", "CityIce",                                   // i18n-ignore: Biomes.json ids
    "Burg", "BurgDesert", "BurgIce",
    "Village", "VillageIce", "VillageMountain", "VillageDesert",
    "VillageRiver", "VillageSea",
    "Houses", "HousesInside", "Villa",
  ]);

  // Is the party standing in a town? A procedural square answers with its own
  // biome; anywhere else, belonging to a hand-made MapGroup is what makes a map
  // part of a settlement (a procedural "Proc:x,y" group is not one of those ,
  // it is the synthetic settlement every wilderness square gets, so it would
  // otherwise make the whole world a town).
  function isSettlementHere() {
    const biome = currentBiomeName();
    if (biome && SETTLEMENT_BIOMES.has(biome)) return true;
    const NS = window.NPCSystem;
    if (!NS || typeof NS.findMapGroupByMap !== "function") return false;
    if (typeof $gameMap === "undefined" || !$gameMap) return false;
    const group = NS.findMapGroupByMap($gameMap.mapId());
    if (!group) return false;
    // "Proc:x,y" is the wilderness's own synthetic settlement, not a town.
    return !String(group).startsWith("Proc:"); // i18n-ignore: settlement key prefix
  }

  function creatureChance() {
    if (isMonsterWorld()) return CREATURE_CHANCE_MONSTER;
    if (isZombieWorld()) return CREATURE_CHANCE_ZOMBIE;
    return isSettlementHere() ? CREATURE_CHANCE_SETTLEMENT : CREATURE_CHANCE_WILD;
  }

  // Deals one creature identity off `rng` (anything with next()/nextInt()).
  // Returns null when the wardrobe has nothing to dress one in, so a caller
  // with no catalogue loaded simply mints an ordinary person.
  //
  // The order matters and is the whole point: the SHEET is drawn first, and the
  // archetype is read off the sheet rather than the sheet hunted for the
  // archetype. A creature is therefore always something the wardrobe has a
  // picture of, and what it is called is always what it looks like.
  function rollIdentity(rng, exterior = true) {
    const wardrobe = creatureWardrobe(exterior);
    if (!wardrobe.length) return null;

    // 1. The body. A monster world picks the HALF first and the sheet inside
    //    it second, so its crowd is half creatures and half animals however
    //    lopsided the two halves are in the file. Everywhere else a creature
    //    is rare enough that a flat draw over the whole wardrobe is what makes
    //    a stray dog the commonest one, which is the point.
    let pool = wardrobe;
    const share = creatureHalfShare();
    if (share !== null) {
      const half = rng.next() < share ? "creature" : "animal";
      const side = wardrobe.filter((e) => e.half === half);
      if (side.length) pool = side;
    }
    const worn = pool[rng.nextInt(0, pool.length)];
    const first = worn.archetype;

    // 2. The Humanoid half, on the world's hybrid share. Only the `creature`
    //    side of the wardrobe is ever crossed: an animal is an animal (see
    //    rollClassId), and a hen with a person in it is not a thing this world
    //    has. A sheet that is ALREADY Humanoid is left as it is rather than
    //    crossed with itself.
    //    Which slot the Humanoid half lands in is dealt too, so the pairing
    //    reads both ways round ("Beast / Humanoid", "Humanoid / Insectoid")
    //    exactly as a hand-built hybrid does.
    let keys = [first];
    let humanoid = false;
    if (worn.half === "creature" && first !== HYBRID_ARCHETYPE &&
        archetypes()[HYBRID_ARCHETYPE] && rng.next() < hybridChance()) {
      humanoid = true;
      keys = rng.next() < 0.5 ? [first, HYBRID_ARCHETYPE] : [HYBRID_ARCHETYPE, first];
    }

    return {
      archetypes: keys,
      archetype: keys.join(" / "),
      spriteKey: worn.spriteKey,
      // Whether a person was crossed into this body, which is what decides
      // whether it holds a trade or is simply the thing it looks like.
      hybridHumanoid: humanoid,
      // A catalogue sheet carries its own faces; a Monsters/ sheet is one
      // character wide and has none.
      bustIndex: worn.busts > 1 ? rng.nextInt(0, worn.busts) : 0,
      classId: humanoid
        ? rollHumanoidClassId(rng)
        : rollClassId(worn.spriteKey, keys, rng),
    };
  }

  // The class a creature with a Humanoid half holds: any of the civilised
  // roster, flat, rather than one off its own sheet. Half of it is a person and
  // a person may be anything, which is exactly the rule character creation
  // plays by when it opens the civilised list to a hybrid. Ids with no class
  // behind them are dropped, so a trimmed database narrows the draw instead of
  // handing back a hole.
  function rollHumanoidClassId(rng) {
    const max = (window.CreatureClasses && window.CreatureClasses.sentientMax)
      ? window.CreatureClasses.sentientMax() : SENTIENT_CLASS_MAX_FALLBACK;
    const pool = [];
    for (let id = 1; id <= max; id++) {
      if (typeof $dataClasses === "undefined" || !$dataClasses ||
          ($dataClasses[id] && $dataClasses[id].name)) pool.push(id);
    }
    if (!pool.length) return SENTIENT_FALLBACK_CLASS_ID;
    return pool[rng.nextInt(0, pool.length)];
  }

  // A class off the SHEET's own roster, the `classes` array of its NPCs.json
  // entry, weighted so a creature is usually the thing it looks like. The
  // sheet is the authority and the archetype never overrides it: a body is a
  // body, and crossing a second archetype into it (the hybrid roll above) is
  // not allowed to turn a stray dog into somebody else's profession. Every
  // `creature` entry carries both halves for exactly this: its own creature
  // classes (Feral, Mimic, Ghost...) and the civilised ones a talking one of
  // its kind may hold. An `animal` entry carries the creature half alone.
  //
  // Only a sheet with no entry of its own to read (a Monsters/ bestiary sheet,
  // dealt in a monster world) falls back to the archetype rosters, since there
  // is nothing else for it to be, and to the flat Monster class after that.
  function rollClassId(spriteKey, keys, rng) {
    const entry = npcData()[spriteKey];
    const own = Array.isArray(entry && entry.classes) ? entry.classes : [];
    // An ANIMAL is not rolled for. A sheet out of the `animal: true` half is a
    // dog, a hen or a horse: it is Feral, always, and the roster is only read
    // to keep the handful of animal sheets that are something else outright (a
    // risen dog is a Zombie, not a Feral one) on the class their own entry
    // names. Nothing on that half is ever dealt a civilised class.
    if (isAnimalSheet(spriteKey)) {
      // Its own roster, stripped of anything civilised. There are no talking
      // dogs however an entry is edited, and a risen dog stays a Zombie rather
      // than being flattened into a Feral one.
      const beastly = own.filter((id) => isNonSentientClassId(id));
      return beastly.length ? beastly[rng.nextInt(0, beastly.length)] : FERAL_CLASS_ID;
    }
    // A Humanoid half in the mix, and the sheet's own roster stops being the
    // authority: half of this is a person, and a person holds any civilised
    // trade. Same rule as rollIdentity, restated here for the callers that
    // build the archetype pair themselves.
    // A person CROSSED IN, that is: a sheet whose own archetype is Humanoid
    // (an orc, a goblin; the peoples are one archetype now) is not a hybrid,
    // and keeps its own roster like every other sheet.
    const crossed = (keys || []).length > 1 && (keys || []).includes(HYBRID_ARCHETYPE);
    if (crossed && isCreatureSheet(spriteKey)) {
      return rollHumanoidClassId(rng);
    }
    let creature = own.filter((id) => isNonSentientClassId(id));
    let sentient = own.filter((id) => !isNonSentientClassId(id));
    const CC = window.CreatureClasses;
    if (!own.length) {
      if (!CC) return NONSENTIENT_CLASS_MIN + 2;
      const groups = CC.groupsForArchetypes(keys[0], keys[1]);
      creature = groups.creature || [];
      sentient = groups.sentient || [];
    }
    const wantCreature = rng.next() < nonSentientChance();
    const first = wantCreature ? creature : sentient;
    const second = wantCreature ? sentient : creature;
    const list = first.length ? first : second;
    if (!list.length) return CC ? CC.fallbackId() : NONSENTIENT_CLASS_MIN + 2;
    return list[rng.nextInt(0, list.length)];
  }

  // ---------------------------------------------------------------------------
  // 3D model
  // ---------------------------------------------------------------------------
  // The models are registered per Battler3D archetype key and resolved from a
  // $dataEnemies entry (its <Archetype:> note and its name), which is exactly
  // how the Bestiary picks one. So rather than guess a registry key from an
  // Archetypes key, look for an enemy that IS one of these archetypes and
  // let Battler3D resolve its own: whatever comes back is a model the
  // archetype supports by construction.
  let _enemiesByArchetype = null;

  function enemyIndex() {
    if (_enemiesByArchetype) return _enemiesByArchetype;
    _enemiesByArchetype = {};
    if (typeof $dataEnemies === "undefined" || !$dataEnemies) return _enemiesByArchetype;
    for (const enemy of $dataEnemies) {
      if (!enemy || !enemy.name) continue;
      const match = /<Archetype:\s*(.*?)>/i.exec(enemy.note || "");
      if (!match) continue;
      const key = match[1].trim();
      if (!key) continue;
      (_enemiesByArchetype[key] = _enemiesByArchetype[key] || []).push(enemy);
    }
    return _enemiesByArchetype;
  }

  // One enemy of these archetypes, chosen by `seed` so the same creature is
  // portrayed by the same body every time the panel is opened. Only enemies
  // Battler3D actually has a model for are considered; the picture is the
  // whole point, and an entry that resolves to nothing would draw an empty
  // frame.
  function enemyForArchetypes(keys, seed) {
    const index = enemyIndex();
    const B = window.Battler3D;
    const candidates = [];
    for (const key of keys || []) {
      for (const enemy of index[key] || []) {
        if (!B || !B.resolveKey || B.resolveKey(enemy)) candidates.push(enemy);
      }
    }
    if (!candidates.length) return null;
    const n = (Math.abs(Number(seed) || 0)) % candidates.length;
    return candidates[n];
  }

  // The model a sprite sheet is portrayed by when its own catalogue entry names
  // one. Every `animal` and `creature` entry in js/db/WorldGen/NPCs.json now
  // carries a `model` field naming a registered Battler3D key, so a hen is
  // drawn as a bird and a lich as a lich rather than as whatever the archetype
  // lookup below happened to land on. Returns null when the sheet names no
  // model, or names one nothing is registered under (which would draw an empty
  // frame), and the archetype lookup answers instead.
  function modelKeyForSprite(spriteKey) {
    if (!spriteKey) return null;
    const data = npcData();
    let entry = data[spriteKey];
    if (!entry) {
      const base = String(spriteKey).split("/").pop();
      for (const key of Object.keys(data)) {
        if (key.split("/").pop() === base) { entry = data[key]; break; }
      }
    }
    const key = entry && entry.model ? String(entry.model).toLowerCase() : "";
    if (!key) return null;
    const B = window.Battler3D;
    if (!B || !B.create || !B.list) return null;
    return B.list().indexOf(key) < 0 ? null : key;
  }

  // The same answer as { key, enemyData }, ready for Battler3D.create. The
  // stand-in enemy carries an id hashed off the model key, since the id is what
  // the model's colours are rolled from: every hen is the same hen, and stays
  // that hen when the panel is closed and opened again.
  function modelForSprite(spriteKey) {
    const key = modelKeyForSprite(spriteKey);
    if (!key) return null;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    }
    return { key, enemyData: { id: (h % 900000) + 1000, name: key, note: "", meta: {} } };
  }

  // { key, enemyData } ready for Battler3D.create(key, 0, 0, fakeBattler), or
  // null when nothing of these archetypes can be modelled.
  function modelForArchetypes(keys, seed) {
    const B = window.Battler3D;
    if (!B || !B.create) return null;
    const list = (keys && keys.length) ? keys : [DEFAULT_ARCHETYPE];
    const enemyData = enemyForArchetypes(list, seed);
    if (enemyData) {
      const key = B.resolveKey ? B.resolveKey(enemyData) : null;
      if (key) return { key, enemyData };
    }
    return modelFromArchetypeName(list, seed);
  }

  // A handful of archetypes (Scarecrow, Dwarf, Horse, Unicorn) have a walking
  // sprite and a model but no enemy in the database tagged with them, so the
  // lookup above finds nothing to resolve through. Battler3D resolves a key
  // off a NAME as well as off a notebox, and its aliases are exactly these
  // words, so ask it with the archetype's own name. The stand-in carries a
  // stable id hashed from the key, since the id is what the model's colours
  // are rolled from and the same creature must not change colour on reopening.
  function modelFromArchetypeName(keys, seed) {
    const B = window.Battler3D;
    if (!B || !B.resolveKey) return null;
    for (const name of keys) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < name.length; i++) {
        h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
      }
      const stand = { id: (h % 900000) + 1000, name, note: "", meta: {} };
      const key = B.resolveKey(stand);
      if (key) return { key, enemyData: stand };
    }
    return null;
  }

  window.NPCCreature = {
    CREATURE_CHANCE_MONSTER, CREATURE_CHANCE_NORMAL,
    CREATURE_CHANCE_SETTLEMENT, CREATURE_CHANCE_WILD, CREATURE_CHANCE_ZOMBIE,
    MONSTER_CREATURE_HALF, ZOMBIE_CREATURE_HALF, creatureHalfShare, isZombieWorld,
    SETTLEMENT_BIOMES, isSettlementHere,
    NONSENTIENT_CLASS_MIN, NONSENTIENT_CLASS_MAX, FERAL_CLASS_ID,
    creatureChance, hybridChance, nonSentientChance,
    rollIdentity, rollClassId,
    HYBRID_ARCHETYPE, rollHumanoidClassId,
    isCreatureProfile, isNonSentientClassId, isNonSentientProfile, isNonSentientActor,
    isNonSentientByName, isPlayerCharacterName,
    sheetHalf, isCreatureSheet, isAnimalSheet, isIndoorAnimal, animalFitsHere,
    currentBiomeName, sentientClassFor,
    archetypeKeysOf, archetypeLabel,
    creatureWardrobe, spritesForArchetypes, spritePathFor, archetypePool,
    enemyForArchetypes, modelForArchetypes,
    modelKeyForSprite, modelForSprite,
  };
})();
