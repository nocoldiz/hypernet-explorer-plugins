/*:
 * @target MZ
 * @plugindesc NPC Life: animal lives, ageing, breeding and death
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Bands
 * @help
 * ============================================================================
 * NPCLife_Animals, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns ANIMAL LIVES, for both kinds of animal the world holds:
 *   - the animal NPCs (a society profile on an `animal: true` wardrobe sheet,
 *     or any other non-sentient creature class): their life record ages by
 *     their own kind's lifespan (NPCCreature.creatureLife), they are weaned,
 *     grow old, have litters with their own kind in their own town, find
 *     their own food and die of age, hunger, illness or a predator;
 *   - the building and farm animals (AnimalGrowthSystem placements, and the
 *     legacy "Animal" event slots): they age by their breed's lifespan, are
 *     fed and milked by their owner when nobody is watching
 *     (NPCSim.Tending.careOffscreen), breed in their pen and die, leaving a
 *     body on the map when the map is the one loaded.
 * Everything is resolved in the life-sim catch-up, one probability per
 * interval (never a loop over its days), with caps per pen, per town and per
 * pass so a long time skip never floods a map.
 *
 * One age and one hunger meter: an animal NPC's age IS its life record's
 * birth date (AnimalGrowthSystem reads it back through bornMinuteOf), and its
 * hunger IS its livestock record's fedAt (syncHunger writes the meter).
 *
 * Pets (PetFollowerSystem) and party members age but never die here.
 *
 * Publishes NPCLifeSim.Animals and NPCLifeSim.animalStageOf, and
 * resolveAnimalLife / resolveAnimalWorld / rollAnimalBirth on _internal.
 * Load it right after NPCLife_Bands.js, before NPCLife_Hooks.js, as
 * js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    animalWhereText, BORN_HERE, dateStrOf, ensureLifeRecord, getProfile, getRecords, LifeRng,
    MINUTES_PER_DAY, MINUTES_PER_YEAR, nameHash, pushLifeEvent, resolveAlternation, worldSeed,
    yearFloatOf,
  } = window.NPCLifeSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let inPartyNamed, invalidatePopulation, mintChildName;
  window.NPCLifeSim._internal._late.push(() => ({
    inPartyNamed, invalidatePopulation, mintChildName,
  } = window.NPCLifeSim._internal));

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================
  const ANIMALS = Object.freeze({
    DEFAULT_LIFESPAN: 4000,     // days, for a creature nothing else names
    NEWBORN_SHARE: 0.25,        // of the growing days, spent as a newborn
    OLD_SHARE: 0.75,            // of the lifespan, from where it is old
    AGE_END_RATE: 10,           // daily hazard at the end of a lifespan, x 1/lifespan
    AGE_GROWTH: 8,              // how steeply that hazard climbs toward the end
    AGE_MAX_DAILY: 0.5,
    STARVE_DAYS: 10,            // days on an empty meter before hunger kills
    STARVE_RATE: 0.25,          // daily hazard after that
    ILLNESS_RATE: 1 / 400,      // daily hazard per disease carried
    PREDATOR_RATE: 1 / 3000,    // daily hazard for wild prey
    ESCAPE_RATE: 1 / 500,       // a close call that it lived through
    PEN_BREED_CAP: 8,           // of one breed in one pen (a map key)
    PEN_CAP: 16,                // animals of any breed in one pen
    GROUP_KIND_CAP: 10,         // animal NPCs of one kind in one town
    GROUP_CAP: 24,              // animal NPCs of any kind in one town
    BIRTHS_PER_PASS: 12,        // placements born in one catch-up
    NPC_BIRTHS_PER_PASS: 6,     // animal NPCs born in one catch-up
    FED_EVENT_DAYS: 7,          // at most one "fed by" line a week
    YOUNG_LOG: 12,              // young remembered per parent
    PEN_LOG: 8,                 // life lines kept on a placement
  });
  // i18n-ignore-start: stage, cause, breed and sex ids
  const STAGES = ["newborn", "young", "adult", "old"];
  // rate: litters per adult female per day, litter: [min, max], gap: days
  // between two litters (the gestation), mate: the breed that sires them.
  const BREEDING = Object.freeze({
    Chicken: { rate: 1 / 30,  litter: [1, 3], gap: 21, mate: "Rooster" },
    Rooster: { rate: 0 },
    Duck:    { rate: 1 / 40,  litter: [1, 3], gap: 28 },
    Pigeon:  { rate: 1 / 60,  litter: [1, 2], gap: 30 },
    Rabbit:  { rate: 1 / 35,  litter: [2, 5], gap: 31 },
    Pig:     { rate: 1 / 150, litter: [2, 6], gap: 115 },
    Sheep:   { rate: 1 / 300, litter: [1, 2], gap: 150 },
    Goat:    { rate: 1 / 250, litter: [1, 2], gap: 150 },
    Cow:     { rate: 1 / 400, litter: [1, 1], gap: 280 },
    Horse:   { rate: 1 / 700, litter: [1, 1], gap: 340 },
    Donkey:  { rate: 1 / 700, litter: [1, 1], gap: 365 },
    Dog:     { rate: 1 / 200, litter: [2, 5], gap: 63 },
    Cat:     { rate: 1 / 150, litter: [1, 4], gap: 65 },
    Crab:    { rate: 1 / 100, litter: [1, 3], gap: 60 },
    Toad:    { rate: 1 / 100, litter: [1, 4], gap: 60 },
  });
  const BREEDING_DEFAULT = Object.freeze({ rate: 1 / 300, litter: [1, 2], gap: 120 });
  const CAUSE_EVENT = Object.freeze({
    age: "NPCLife.animal.event.diedAge",
    hunger: "NPCLife.animal.event.diedHunger",
    illness: "NPCLife.animal.event.diedIllness",
    predator: "NPCLife.animal.event.diedPredator",
  });
  const FORAGE_SLOTS = new Set(["creature.graze", "creature.forage", "creature.hunt", "creature.drink"]);
  const ANIMAL_EVENT = "animal";
  // i18n-ignore-end

  const WM = () => window.NPCShared?.WorldModes || window.WorldModes || null;
  const animalsBreed = () => { const w = WM(); try { return !w || w.animalsBreed(); } catch (_) { return true; } };
  // A death world (WorldModes.hasAnimals) holds no animal at all: nothing to age,
  // feed, breed or bury, so every pass below returns before it looks.
  const animalsLive = () => { const w = WM(); try { return !w || typeof w.hasAnimals !== "function" || w.hasAnimals(); } catch (_) { return true; } };
  const AGS = () => window.AnimalGrowthSystem || null;
  const nowOf = () => ($gameVariables ? ($gameVariables.value(114) || 0) : 0);

  // ==========================================================================
  // WHAT AN ANIMAL IS
  // ==========================================================================
  const FALLBACK_LIFE = Object.freeze({
    diet: "forager", herd: false, ageless: false, lifespanDays: ANIMALS.DEFAULT_LIFESPAN, // i18n-ignore: diet id
    growthDays: 0, breed: null, archetype: null,
  });

  function lifeOf(profile) {
    return window.NPCCreature?.creatureLife?.(profile) || FALLBACK_LIFE;
  }

  // What a building or farm animal is, off its breed.
  function placementLife(rec, def) {
    const AG = AGS();
    const L = (AG?.lifespanDaysOf?.(def)) || ANIMALS.DEFAULT_LIFESPAN;
    return { ageless: false, lifespanDays: L, growthDays: def?.hasBaby ? (def.growthDays || 0) : 0, breed: rec.animalId };
  }

  function stageAt(ageDays, life) {
    if (!life || life.ageless) return "adult";
    const L = life.lifespanDays || ANIMALS.DEFAULT_LIFESPAN;
    const G = life.growthDays > 0 ? life.growthDays : Math.max(2, Math.round(L * 0.05));
    if (ageDays < Math.max(1, G * ANIMALS.NEWBORN_SHARE)) return "newborn";
    if (ageDays < G) return "young";
    if (ageDays >= L * ANIMALS.OLD_SHARE) return "old";
    return "adult";
  }

  function kindOf(life) {
    return (life && (life.breed || life.archetype)) || "Beast"; // i18n-ignore: archetype id
  }

  // Whether this profile is one of the world's own ANIMALS (an `animal: true`
  // wardrobe sheet worn by a non-sentient), which is what the animal
  // backstory is written for. Monsters, ghosts and the risen keep theirs.
  function isAnimalProfile(profile, name) {
    const NC = window.NPCCreature;
    if (!NC || !profile) return false;
    if (!(NC.isHeldToBeastRules ? NC.isHeldToBeastRules(profile, name) : NC.isNonSentientProfile(profile))) return false;
    return !!(NC.isAnimalSheet && NC.isAnimalSheet(profile.spriteKey));
  }

  // ==========================================================================
  // ONE AGE
  // ==========================================================================
  const EPOCH_FLOAT = () => yearFloatOf(0);

  function birthFields(minute) {
    const d = new Date(EPOCH_FLOAT(), 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + minute);
    const birthYearFloat = yearFloatOf(minute);
    return {
      birthYearFloat,
      birthYear: Math.floor(birthYearFloat),
      birthMonth: d.getMonth() + 1,
      birthDay: Math.min(28, d.getDate()),
      birthDate: dateStrOf(minute),
    };
  }

  // The minute an animal NPC was born, off its life record; null for anyone
  // who is not one, or has no life yet.
  function bornMinuteOf(name) {
    const r = getRecords()?.[name];
    if (!r || !r.nonSentient || typeof r.birthYearFloat !== "number") return null;
    return Math.round((r.birthYearFloat - EPOCH_FLOAT()) * MINUTES_PER_YEAR);
  }

  function ageDaysAt(record, minute) {
    if (!record || typeof record.birthYearFloat !== "number") return 0;
    const born = (record.birthYearFloat - EPOCH_FLOAT()) * MINUTES_PER_YEAR;
    return Math.max(0, (minute - born) / MINUTES_PER_DAY);
  }

  // A beast's birth date, read off its kind's lifespan instead of the human
  // 18 + level * 2. A livestock record already minted for it wins, so the two
  // never disagree; a litter hands over the minute it was born.
  function rollAnimalBirth(name, profile, rng, nowMinute, opts) {
    let born = (opts && typeof opts.birthMinute === "number") ? opts.birthMinute : null;
    const agRec = $gameSystem?._animalNpcRecords?.[name];
    if (born == null && agRec && typeof agRec.bornAt === "number") born = agRec.bornAt;
    if (born == null) {
      const life = lifeOf(profile);
      let days;
      if (life.ageless) {
        days = rng.int(365, 365 * 40);
      } else {
        const L = life.lifespanDays || ANIMALS.DEFAULT_LIFESPAN;
        const G = life.growthDays > 0 ? life.growthDays : Math.max(2, Math.round(L * 0.05));
        const baby = AGS()?.stageOfSprite?.(profile?.spriteKey) === "baby" && AGS()?.isAnimalSprite?.(profile?.spriteKey); // i18n-ignore: stage id
        days = baby ? rng.next() * G : G + rng.next() * Math.max(1, L * 0.6 - G);
      }
      born = nowMinute - Math.round(days * MINUTES_PER_DAY);
    }
    return birthFields(Math.min(born, nowMinute));
  }

  // ==========================================================================
  // THE LIFE LOG
  // ==========================================================================
  // The oldest line goes to the end of the (newest-first) log.
  function pushOldest(record, minute, key, params) {
    record.lifeEvents = Array.isArray(record.lifeEvents) ? record.lifeEvents : [];
    record.lifeEvents.push({ minute, date: dateStrOf(minute), type: ANIMAL_EVENT, key, params: params || {} });
  }

  function whereParams(record) {
    const first = Array.isArray(record?.locationHistory) ? record.locationHistory[0] : null;
    return {
      whereKey: record?.birthplace || first?.place || record?.homeGroup || null,
      whereWild: first?.wild || null,
      whereOwner: record?.animal?.owner || null,
    };
  }

  function bornEvent(record) {
    const a = record.animal || {};
    const params = whereParams(record);
    let key = "NPCLife.animal.event.born";
    if (a.mother && a.father) { key = "NPCLife.animal.event.bornToBoth"; params.mother = a.mother; params.father = a.father; }
    else if (a.mother) { key = "NPCLife.animal.event.bornTo"; params.mother = a.mother; }
    return { key, params };
  }

  // The animal half of a life record, set once: its kind, its sex, whose
  // young it is, its litters and where it stands in its life.
  function ensureAnimalFields(record, profile, life, now) {
    if (record.animal) return record.animal;
    const g = Number(profile?.gender);
    const sex = g === 1 ? "f" : g === 0 ? "m" : ((nameHash(record.name + "_sex") & 1) ? "f" : "m"); // i18n-ignore: sex ids
    record.animal = {
      kind: kindOf(life), sex, mother: null, father: null, mate: null, owner: null,
      litters: 0, lastLitterMin: null, young: [], pet: false,
      stage: stageAt(ageDaysAt(record, now), life),
    };
    // The risen, the ghosts and the manufactured were never born to anyone.
    if (!life.ageless) {
      const born = bornEvent(record);
      const at = Math.round((record.birthYearFloat - EPOCH_FLOAT()) * MINUTES_PER_YEAR);
      pushOldest(record, at, born.key, born.params);
    }
    return record.animal;
  }

  // ==========================================================================
  // ONE HUNGER METER
  // ==========================================================================
  // The livestock record behind an animal NPC (AnimalGrowthSystem), minted on
  // first look; null for a creature that is not an animal the wardrobe knows.
  function agRecordOf(profile, name) {
    const AG = AGS();
    if (!AG?.recordForNpc || !profile?.spriteKey || !AG.isAnimalSprite?.(profile.spriteKey)) return null;
    const rec = AG.recordForNpc(name, profile.spriteKey);
    // One age: the life record's birth is the truth.
    const born = bornMinuteOf(name);
    if (rec && typeof born === "number" && rec.bornAt !== born) rec.bornAt = born;
    return rec;
  }

  // profile.hunger is read off the livestock record's fedAt; a wild animal
  // out foraging is eating, which is what keeps the record's meter up.
  function syncHunger(profile, name) {
    const who = name || profile?._eventName;
    if (!who) return;
    const rec = agRecordOf(profile, who);
    if (!rec) return;
    const AG = AGS();
    if (!rec.owner && FORAGE_SLOTS.has(profile.currentNeed)) rec.fedAt = AG.gameMinutes();
    profile.hunger = AG.nutritionOf(rec);
  }

  // Fed by somebody's hand (a shift paid in food, the Empathize Feed action).
  function feedNpc(name, profile, byName) {
    const p = profile || getProfile(name);
    if (!p) return false;
    const rec = agRecordOf(p, name);
    const AG = AGS();
    if (rec) {
      rec.fedAt = AG.gameMinutes();
      p.hunger = AG.nutritionOf(rec);
    }
    if (byName) noteFed(name, byName);
    return true;
  }

  function noteFed(name, byName) {
    const record = getRecords()?.[name];
    if (!record || !record.nonSentient || !byName) return false;
    const now = nowOf();
    const a = record.animal || (record.animal = { young: [] });
    if (a._fedEventAt != null && now - a._fedEventAt < ANIMALS.FED_EVENT_DAYS * MINUTES_PER_DAY) return false;
    a._fedEventAt = now;
    pushLifeEvent(record, now, ANIMAL_EVENT, "NPCLife.animal.event.fedBy", { name: byName });
    return true;
  }

  // Taken in as a pet (PetFollowerSystem): it ages from here on but never
  // dies of anything the catch-up rolls.
  function noteAdopted(name, byName) {
    const record = getRecords()?.[name];
    if (!record || !record.nonSentient) return false;
    const a = record.animal || (record.animal = { young: [] });
    a.pet = true;
    pushLifeEvent(record, nowOf(), ANIMAL_EVENT, "NPCLife.animal.event.adoptedAsPet", { name: byName || "" });
    return true;
  }

  function isPet(name) {
    if (!name) return false;
    if (getRecords()?.[name]?.animal?.pet) return true;
    try {
      const pets = window.PetSystem?.getPets?.() || [];
      return pets.some(p => p && p.name === name);
    } catch (_) { return false; }
  }

  // ==========================================================================
  // DEATH
  // ==========================================================================
  function ageRatePerDay(ageDays, life) {
    if (!life || life.ageless) return 0;
    const L = life.lifespanDays || ANIMALS.DEFAULT_LIFESPAN;
    const frac = Math.max(0, ageDays / L);
    return Math.min(ANIMALS.AGE_MAX_DAILY, (ANIMALS.AGE_END_RATE / L) * Math.exp(ANIMALS.AGE_GROWTH * (frac - 1)));
  }

  // Days on an empty meter, off a livestock record's fedAt.
  function starvingDays(rec, now) {
    const AG = AGS();
    if (!rec || !AG) return 0;
    const fed = rec.fedAt != null ? rec.fedAt : (rec.boughtAt || 0);
    return (now - fed) / MINUTES_PER_DAY - (AG.NUTRITION_DAYS || 3);
  }

  function starveRate(rec, now) {
    return starvingDays(rec, now) > ANIMALS.STARVE_DAYS ? ANIMALS.STARVE_RATE : 0;
  }

  // One interval's death roll: the cause, or null.
  function rollDeath(rng, rates, deltaDays) {
    const total = rates.age + rates.hunger + rates.illness + rates.predator;
    if (!(total > 0) || !(deltaDays > 0)) return null;
    const p = 1 - Math.exp(-total * deltaDays);
    if (rng.next() >= p) return null;
    let roll = rng.next() * total;
    for (const cause of ["hunger", "illness", "predator", "age"]) { // i18n-ignore: cause ids
      roll -= rates[cause];
      if (roll <= 0) return cause;
    }
    return "age"; // i18n-ignore: cause id
  }

  // The life event a death writes, for NPCLife_Death.killNpc: a named killer,
  // a predator, or the plain line.
  function deathEvent(why) {
    const w = why || {};
    if (CAUSE_EVENT[w.kind]) return { key: CAUSE_EVENT[w.kind], params: {} };
    if (w.by) return { key: "NPCLife.animal.event.killedBy", params: { name: String(w.by) } };
    return null;
  }

  function killAnimalNpc(record, cause, now) {
    const kill = window.NPCLifeSim?.killNpc;
    if (!kill) return false;
    try {
      kill(record.name, { kind: cause, by: null, eventKey: CAUSE_EVENT[cause] || null });
    } catch (e) {
      console.error("[NPCLifeSim] an animal's death failed", e);
      return false;
    }
    if (!record.dead) return false;
    // The one it last had young with is left without it.
    const mate = record.animal?.mate;
    const mateRec = mate ? getRecords()?.[mate] : null;
    if (mateRec && !mateRec.dead && mateRec.animal) {
      pushLifeEvent(mateRec, now, ANIMAL_EVENT, "NPCLife.animal.event.lostMate", { name: record.name });
      if (mateRec.animal.mate === record.name) mateRec.animal.mate = null;
    }
    return true;
  }

  // ==========================================================================
  // AN ANIMAL NPC'S INTERVAL (catch-up step 4, for every non-sentient life)
  // ==========================================================================
  function resolveAnimalLife(record, profile, rng, lastMinute, nowMinute, deltaDays) {
    if (!record || record.dead || !profile || profile._killed || !animalsLive()) return;
    const name = record.name;
    const life = lifeOf(profile);
    const a = ensureAnimalFields(record, profile, life, nowMinute);

    // Growing up and growing old.
    const age = ageDaysAt(record, nowMinute);
    const stage = stageAt(age, life);
    if (stage !== a.stage) {
      const from = STAGES.indexOf(a.stage), to = STAGES.indexOf(stage);
      if (from === 0 && to >= 1) pushLifeEvent(record, nowMinute, ANIMAL_EVENT, "NPCLife.animal.event.weaned", {});
      if (stage === "old" && from < 3) pushLifeEvent(record, nowMinute, ANIMAL_EVENT, "NPCLife.animal.event.grewOld", {}); // i18n-ignore: stage id
      a.stage = stage;
    }

    // One hunger meter: a wild animal finds its own food.
    const rec = agRecordOf(profile, name);
    if (rec && !rec.owner) rec.fedAt = nowMinute;
    if (rec) profile.hunger = AGS().nutritionOf(rec);

    // Party members, pets and the written cast never die of this.
    if (isPet(name) || (inPartyNamed && inPartyNamed(name)) || profile._story || profile.playerCreated) return;

    const prey = !life.ageless && (life.diet === "grazer" || life.diet === "forager") && !profile._resident; // i18n-ignore: diet ids
    const rates = {
      age: ageRatePerDay(age, life),
      hunger: rec ? starveRate(rec, nowMinute) : 0,
      illness: life.ageless ? 0 : (Array.isArray(profile.diseases) ? profile.diseases.length : 0) * ANIMALS.ILLNESS_RATE,
      predator: prey ? ANIMALS.PREDATOR_RATE : 0,
    };
    const cause = rollDeath(rng, rates, deltaDays);
    if (cause) { killAnimalNpc(record, cause, nowMinute); return; }
    if (prey && rng.next() < 1 - Math.exp(-ANIMALS.ESCAPE_RATE * deltaDays)) {
      const at = lastMinute + Math.floor(rng.next() * Math.max(1, nowMinute - lastMinute));
      pushLifeEvent(record, at, ANIMAL_EVENT, "NPCLife.animal.event.survivedPredator", {});
    }
  }

  // ==========================================================================
  // LITTERS AMONG THE ANIMAL NPCS
  // ==========================================================================
  function ruleOf(kind) {
    return BREEDING[kind] || BREEDING_DEFAULT;
  }

  // A newborn of `mother` by `father`, born at `at`: a new animal NPC in the
  // mother's town, on the young sheet of its breed where there is one.
  function bearYoung(mother, motherProfile, father, at, index) {
    const reg = window.NPCSocietyRegistry;
    if (!reg?.ensureProfile || !mintChildName) return null;
    const seed = (nameHash(mother.name + "_young_" + at + "_" + index) ^ worldSeed()) >>> 0;
    const name = mintChildName(seed);
    if (!name) return null;
    const AG = AGS();
    const life = lifeOf(motherProfile);
    const def = life.breed && AG?.ANIMAL_DB ? AG.ANIMAL_DB[life.breed] : null;
    const babies = def && def.hasBaby && Array.isArray(def.babySprites) ? def.babySprites : [];
    const spriteKey = babies.length ? babies[seed % babies.length] : motherProfile.spriteKey;
    const group = mother.homeGroup || motherProfile._homeGroupName || null;
    const homeMapId = motherProfile.homeBuilding?.mapId ?? motherProfile.homeMapId ?? undefined;
    let profile = null;
    try {
      profile = reg.ensureProfile(name, motherProfile.assignedClassId, group, homeMapId, { spriteKey, bustIndex: 0 }) || null;
    } catch (e) {
      console.error("[NPCLifeSim] a newborn animal could not be made", e);
      profile = null;
    }
    if (!profile) return null;
    profile.gender = (seed >>> 3) & 1 ? 1 : 0;
    profile.money = 0;
    const record = ensureLifeRecord(name, group, undefined, { birthMinute: at });
    if (!record) return null;
    record.nonSentient = true;
    if (group) record.homeGroup = group;
    const place = mother.currentPlace || mother.birthplace || null;
    const wild = Array.isArray(mother.locationHistory) ? (mother.locationHistory[mother.locationHistory.length - 1]?.wild || null) : null;
    record.birthplace = place;
    record.currentPlace = place;
    record.locationHistory = [{ place, wild, fromYear: Math.floor(yearFloatOf(at)), toYear: null, reason: BORN_HERE }];
    record.lifeEvents = [];
    record.animal = {
      kind: kindOf(life), sex: profile.gender === 1 ? "f" : "m", // i18n-ignore: sex ids
      mother: mother.name, father: father ? father.name : null, mate: null, owner: mother.animal?.owner || null,
      litters: 0, lastLitterMin: null, young: [], pet: false, stage: "newborn", // i18n-ignore: stage id
    };
    const born = bornEvent(record);
    pushLifeEvent(record, at, ANIMAL_EVENT, born.key, born.params);
    for (const parent of [mother, father]) {
      if (!parent?.animal) continue;
      parent.animal.young = Array.isArray(parent.animal.young) ? parent.animal.young : [];
      parent.animal.young.unshift(name);
      if (parent.animal.young.length > ANIMALS.YOUNG_LOG) parent.animal.young.length = ANIMALS.YOUNG_LOG;
    }
    return name;
  }

  function breedAnimalNpcs(nowMinute, deltaDays, lastMinute) {
    if (!animalsLive() || !animalsBreed() || !(deltaDays > 0)) return 0;
    const records = getRecords();
    if (!records) return 0;
    const byGroup = new Map(), byKind = new Map();
    for (const record of Object.values(records)) {
      if (!record || !record.nonSentient || record.dead || !record.animal) continue;
      const profile = getProfile(record.name);
      if (!profile || profile._killed) continue;
      const life = lifeOf(profile);
      const group = record.homeGroup || "__wild__"; // i18n-ignore: map key
      byGroup.set(group, (byGroup.get(group) || 0) + 1);
      if (life.ageless) continue;
      const key = group + "|" + record.animal.kind;
      let list = byKind.get(key);
      if (!list) byKind.set(key, list = []);
      list.push({ record, profile, life });
    }
    let births = 0;
    for (const key of Array.from(byKind.keys()).sort()) {
      if (births >= ANIMALS.NPC_BIRTHS_PER_PASS) break;
      const list = byKind.get(key);
      const [group, kind] = key.split("|");
      const rule = ruleOf(kind);
      if (!(rule.rate > 0)) continue;
      const adult = (e) => e.record.animal.stage === "adult"; // i18n-ignore: stage id
      const mateKey = group + "|" + (rule.mate || kind);
      const sires = (byKind.get(mateKey) || []).filter(e => adult(e) && e.record.animal.sex === "m").sort((x, y) => (x.record.name < y.record.name ? -1 : 1));
      if (!sires.length) continue;
      const dams = list.filter(e => adult(e) && e.record.animal.sex === "f").sort((x, y) => (x.record.name < y.record.name ? -1 : 1));
      let count = list.length;
      for (const dam of dams) {
        if (births >= ANIMALS.NPC_BIRTHS_PER_PASS) break;
        if (count >= ANIMALS.GROUP_KIND_CAP || (byGroup.get(group) || 0) >= ANIMALS.GROUP_CAP) break;
        const a = dam.record.animal;
        const gapMin = (rule.gap || 0) * MINUTES_PER_DAY;
        if (a.lastLitterMin != null && nowMinute - a.lastLitterMin < gapMin) continue;
        const rng = new LifeRng((nameHash(dam.record.name + "_litter") ^ worldSeed() ^ (lastMinute >>> 0)) >>> 0);
        if (rng.next() >= 1 - Math.exp(-rule.rate * deltaDays)) continue;
        const sire = sires[rng.int(0, sires.length - 1)];
        const at = lastMinute + Math.floor(rng.next() * Math.max(1, nowMinute - lastMinute));
        const size = rng.int(rule.litter[0], rule.litter[1]);
        let born = 0;
        for (let i = 0; i < size; i++) {
          if (count >= ANIMALS.GROUP_KIND_CAP || (byGroup.get(group) || 0) >= ANIMALS.GROUP_CAP) break;
          if (births >= ANIMALS.NPC_BIRTHS_PER_PASS) break;
          if (!bearYoung(dam.record, dam.profile, sire.record, at, i)) break;
          born++; births++; count++;
          byGroup.set(group, (byGroup.get(group) || 0) + 1);
        }
        if (!born) continue;
        a.lastLitterMin = at;
        a.mate = sire.record.name;
        if (sire.record.animal) sire.record.animal.mate = dam.record.name;
        const first = !a.litters;
        a.litters = (a.litters || 0) + 1;
        pushLifeEvent(dam.record, at, ANIMAL_EVENT,
          first ? "NPCLife.animal.event.firstLitter" : "NPCLife.animal.event.litter", { count: born });
      }
    }
    if (births) { try { invalidatePopulation?.(); } catch (_) { /* rebuilt next pass */ } }
    return births;
  }

  // ==========================================================================
  // THE BUILDING AND FARM ANIMALS
  // ==========================================================================
  function penLog(rec, minute, key, params) {
    const log = Array.isArray(rec.life) ? rec.life : (rec.life = []);
    log.unshift({ minute, key, params: params || {} });
    if (log.length > ANIMALS.PEN_LOG) log.length = ANIMALS.PEN_LOG;
  }

  function placeName(rec, mapKey) {
    const AG = AGS();
    return rec.mapName || AG?.mapDisplayName?.(mapKey) || String(mapKey);
  }

  function toastParty(key, rec, mapKey) {
    const T = window.T;
    if (!window.ParchmentToast || typeof T !== "function") return;
    try {
      window.ParchmentToast.show(T(key, { animal: rec.animalId, place: placeName(rec, mapKey) }),
        { severity: key.endsWith(".died") ? "warn" : "good" }); // i18n-ignore: toast key suffix
    } catch (_) { /* a toast is never worth a failed pass */ }
  }

  // The owner hears of it: the party through a toast, a farmer through a
  // line in their own life.
  function tellOwner(rec, mapKey, now, died) {
    const AG = AGS();
    if (AG.isPartyOwned(rec)) {
      toastParty(died ? "AnimalGrowth.toast.died" : "AnimalGrowth.toast.born", rec, mapKey);
      return;
    }
    const owner = AG.ownerOf(rec);
    if (owner && died) {
      try { window.NPCLifeSim?.pushEvent?.(owner, now, ANIMAL_EVENT, "NPCLife.animal.event.ownerLost", { animal: rec.animalId }); }
      catch (_) { /* no life to write it in */ }
    }
  }

  function penStage(rec, def, life, now) {
    const AG = AGS();
    const age = AG.ageDaysOf(rec);
    const stage = stageAt(age, life);
    if (rec.lifeStage && rec.lifeStage !== stage) {
      const from = STAGES.indexOf(rec.lifeStage);
      if (from === 0 && STAGES.indexOf(stage) >= 1) penLog(rec, now, "NPCLife.animal.event.weaned", {});
      if (stage === "old" && from < 3) penLog(rec, now, "NPCLife.animal.event.grewOld", {}); // i18n-ignore: stage id
    }
    rec.lifeStage = stage;
    return { age, stage };
  }

  function breedPen(mapKey, list, now, last, deltaDays, room) {
    const AG = AGS();
    let born = 0;
    const counts = {};
    for (const r of list) if (r && r.animalId) counts[r.animalId] = (counts[r.animalId] || 0) + 1;
    let total = list.filter(r => r && r.animalId).length;
    const adults = (id, sex) => list.filter(r => r && r.animalId === id && AG.sexOf(r) === sex &&
      (r.lifeStage === "adult")); // i18n-ignore: stage id
    const dams = list.filter(r => r && r.animalId && AG.sexOf(r) === "f" && r.lifeStage === "adult") // i18n-ignore: sex and stage ids
      .sort((x, y) => (x.uid || 0) - (y.uid || 0));
    for (const dam of dams) {
      if (born >= room || total >= ANIMALS.PEN_CAP) break;
      const rule = ruleOf(dam.animalId);
      if (!(rule.rate > 0)) continue;
      if ((counts[dam.animalId] || 0) >= ANIMALS.PEN_BREED_CAP) continue;
      if (!adults(rule.mate || dam.animalId, "m").length) continue; // i18n-ignore: sex id
      if (dam.lastLitterAt != null && now - dam.lastLitterAt < (rule.gap || 0) * MINUTES_PER_DAY) continue;
      const rng = new LifeRng((nameHash("pen" + dam.uid + "_litter") ^ worldSeed() ^ (last >>> 0)) >>> 0);
      if (rng.next() >= 1 - Math.exp(-rule.rate * deltaDays)) continue;
      const at = last + Math.floor(rng.next() * Math.max(1, now - last));
      const size = rng.int(rule.litter[0], rule.litter[1]);
      let n = 0;
      for (let i = 0; i < size; i++) {
        if (born >= room || total >= ANIMALS.PEN_CAP || (counts[dam.animalId] || 0) >= ANIMALS.PEN_BREED_CAP) break;
        const young = AG.bornPlacement(mapKey, dam.animalId, dam, at);
        if (!young) break;
        young.lifeStage = "newborn"; // i18n-ignore: stage id
        penLog(young, at, "NPCLife.animal.event.born", { whereOwner: young.owner || null });
        n++; born++; total++;
        counts[dam.animalId] = (counts[dam.animalId] || 0) + 1;
        tellOwner(young, mapKey, at, false);
      }
      if (!n) continue;
      penLog(dam, at, dam.litters ? "NPCLife.animal.event.litter" : "NPCLife.animal.event.firstLitter", { count: n });
      dam.litters = (dam.litters || 0) + 1;
      dam.lastLitterAt = at;
    }
    return born;
  }

  function resolvePlacements(now, deltaDays, last) {
    const AG = AGS();
    if (!AG?.placementStore || !animalsLive()) return { died: 0, born: 0 };
    let loadedKey = null;
    try { loadedKey = $gameMap ? String(AG.currentMapKey()) : null; } catch (_) { loadedKey = null; }
    const breed = animalsBreed();
    const tending = window.NPCSim?.Tending;
    const store = AG.placementStore();
    let died = 0, born = 0;
    for (const mapKey of Object.keys(store).sort()) {
      const list = store[mapKey];
      if (!Array.isArray(list) || !list.length) continue;
      const offscreen = String(mapKey) !== loadedKey;
      for (const rec of list.slice()) {
        if (!rec || !rec.animalId) continue;
        const def = AG.ANIMAL_DB[rec.animalId];
        if (!def) continue;
        AG.updateRecordGrowth(rec);
        // Care when nobody is watching: the owner at home feeds and collects.
        if (offscreen && tending?.careOffscreen) {
          const care = tending.careOffscreen(rec, last);
          if (care && care.fed && (rec._fedLogAt == null || now - rec._fedLogAt >= ANIMALS.FED_EVENT_DAYS * MINUTES_PER_DAY)) {
            rec._fedLogAt = now;
            penLog(rec, now, "NPCLife.animal.event.fedBy", { name: care.owner });
          }
        }
        // Stock that belongs to nobody grazes for itself.
        if (!AG.isPartyOwned(rec) && !AG.ownerOf(rec)) rec.fedAt = now;
        const life = placementLife(rec, def);
        const { age } = penStage(rec, def, life, now);
        const rng = new LifeRng((nameHash("pen" + rec.uid + "_death") ^ worldSeed() ^ (last >>> 0)) >>> 0);
        const cause = rollDeath(rng, { age: ageRatePerDay(age, life), hunger: starveRate(rec, now), illness: 0, predator: 0 }, deltaDays);
        if (!cause) continue;
        if (!AG.retirePlacement(rec.uid)) continue;
        died++;
        tellOwner(rec, mapKey, now, true);
      }
      if (breed && born < ANIMALS.BIRTHS_PER_PASS) {
        born += breedPen(mapKey, list, now, last, deltaDays, ANIMALS.BIRTHS_PER_PASS - born);
      }
    }
    // The legacy "Animal" event slots age and die as well; they never breed.
    const data = $gameSystem?._animalData;
    if (data && AG.deleteRecord) {
      for (const key of Object.keys(data).sort()) {
        const rec = data[key];
        const def = rec?.animalId ? AG.ANIMAL_DB[rec.animalId] : null;
        if (!def) continue;
        AG.updateRecordGrowth(rec);
        const life = placementLife(rec, def);
        const { age } = penStage(rec, def, life, now);
        const rng = new LifeRng((nameHash("slot" + key + "_death") ^ worldSeed() ^ (last >>> 0)) >>> 0);
        if (!rollDeath(rng, { age: ageRatePerDay(age, life), hunger: starveRate(rec, now), illness: 0, predator: 0 }, deltaDays)) continue;
        const [mapId, eventId] = key.split("_").map(Number);
        AG.deleteRecord(mapId, eventId);
        died++;
      }
    }
    return { died, born };
  }

  // ==========================================================================
  // THE CATCH-UP STEP
  // ==========================================================================
  // Runs on its own clock (a whole game day at least between two passes), so
  // an empty world, where the people's catch-up never runs, still has its
  // animals living and breeding. Answers what happened, for the tests.
  function resolveAnimalWorld(nowMinute) {
    if (!$gameSystem) return null;
    const now = Number(nowMinute) || 0;
    const last = $gameSystem._animalLifeLastMin;
    if (last == null || last > now) { $gameSystem._animalLifeLastMin = now; return null; }
    if (now - last < MINUTES_PER_DAY) return null;
    $gameSystem._animalLifeLastMin = now;
    // No animal lives in a death world: the clock moves on and nothing is read.
    if (!animalsLive()) return null;
    const deltaDays = (now - last) / MINUTES_PER_DAY;
    const out = { placements: { died: 0, born: 0 }, litters: 0 };
    try { out.placements = resolvePlacements(now, deltaDays, last); }
    catch (e) { console.error("[NPCLifeSim] the farm animals' pass failed", e); }
    // Only a world with people in it has animal NPCs to breed.
    const w = WM();
    let people = true;
    try { people = !w || w.simulatesPeople(); } catch (_) { people = true; }
    if (people) {
      try { out.litters = breedAnimalNpcs(now, deltaDays, last); }
      catch (e) { console.error("[NPCLifeSim] the animal litters failed", e); }
    }
    return out;
  }

  // ==========================================================================
  // BACKSTORY (NPCSociety_Backstory's animal branch)
  // ==========================================================================
  // No era, no coup, no war: where it was born, to whom, and what its kind is
  // like, off NPCSociety.animalBio (the breed's bank, then its archetype's,
  // then the default), with its {a|b} alternatives chosen off its name.
  function bioOf(name) {
    const T = window.T;
    if (typeof T !== "function" || !name) return "";
    const profile = getProfile(name);
    let record = getRecords()?.[name];
    if (!record && profile) { try { record = ensureLifeRecord(name, profile._homeGroupName); } catch (_) { record = null; } }
    const life = lifeOf(profile);
    const has = (k) => typeof T.has === "function" && T.has(k);
    const bankKey = (life.breed && has("NPCSociety.animalBio.breed." + life.breed)) ? "NPCSociety.animalBio.breed." + life.breed
      : (life.archetype && has("NPCSociety.animalBio.archetype." + life.archetype)) ? "NPCSociety.animalBio.archetype." + life.archetype
      : "NPCSociety.animalBio.default";
    const a = record?.animal || {};
    const parents = a.mother && a.father ? T("NPCSociety.animalBio.parents.both", { mother: a.mother, father: a.father })
      : a.mother ? T("NPCSociety.animalBio.parents.mother", { mother: a.mother })
      : T("NPCSociety.animalBio.parents.none");
    const params = { name, parents, where: animalWhereText(whereParams(record)) };
    const bank = typeof T.list === "function" ? T.list(bankKey, params) : [];
    const line = bank.length ? bank[(nameHash(name + "_abio") >>> 0) % bank.length] : T(bankKey, params);
    return resolveAlternation(String(line || ""), (nameHash(name + "_abioAlt") ^ worldSeed()) >>> 0)
      .replace(/ {2,}/g, " ").trim();
  }

  // The stored backstory an animal gets instead of a person's: no formative
  // events, the bio written out by bioOf each time it is read.
  function backstoryFor(name, profile) {
    let record = getRecords()?.[name];
    if (!record) { try { record = ensureLifeRecord(name, profile?._homeGroupName); } catch (_) { record = null; } }
    const born = bornMinuteOf(name);
    return {
      birthYear: typeof born === "number" ? Math.floor(yearFloatOf(born)) : null,
      birthplace: record?.birthplace || null,
      formativeEvents: [],
      seed: { animal: true, name, isCreature: true, classId: profile?.assignedClassId ?? null, gender: profile?.gender ?? 0 },
    };
  }

  // ==========================================================================
  // PUBLIC
  // ==========================================================================
  function stageOfName(name) {
    const record = getRecords()?.[name];
    if (!record || !record.nonSentient) return null;
    return stageAt(ageDaysAt(record, nowOf()), lifeOf(getProfile(name)));
  }

  window.NPCLifeSim.Animals = {
    ANIMALS, BREEDING, STAGES,
    lifeOf, stageAt, stageOf: stageOfName, ageDaysOf: (name) => ageDaysAt(getRecords()?.[name], nowOf()),
    bornMinuteOf, isAnimalProfile, isPet,
    syncHunger, feedNpc, noteFed, noteAdopted,
    deathEvent, bioOf, backstoryFor,
    resolveWorld: resolveAnimalWorld, breedAnimalNpcs, resolvePlacements,
  };
  window.NPCLifeSim.animalStageOf = stageOfName;
  Object.assign(window.NPCLifeSim._internal, { resolveAnimalLife, resolveAnimalWorld, rollAnimalBirth });
})();
