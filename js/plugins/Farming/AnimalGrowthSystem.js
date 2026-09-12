/*:
 * @target MZ
 * @plugindesc v2.0.0 Animal Growth System - animal lifecycle, produce and ownership. Buying happens in the Build menu, management in the Assets menu.
 * @author Omni-Lex
 *
 * @help AnimalGrowthSystem v2.0.0
 * ============================================================
 * Manages an animal husbandry system driven by the
 * TimeDateSystem (Variable 114 = game minutes).
 *
 * --- Where the UI lives ---
 * There is no separate animal scene any more.
 *  - BUYING happens in the on-map Build menu (FurnitureSystem.js), on its
 *    "Animals" tab: pick an animal, then click a tile to place it. Animals
 *    always cost money, never crafting materials.
 *  - OWNING / SELLING / PETTING happens in the Assets menu
 *    (Economy/AssetsMenu.js), where every bought animal is listed as a
 *    "Livestock" asset with Collect / Sell / Make Pet actions.
 *  - Talking to an animal on the map collects whatever it has ready.
 *
 * --- Persistence ---
 * A bought animal is stored against the *map key*, not the map id: the
 * procedural biome map (id 636) streams a different place for every world
 * coordinate, so the composite key FurnitureSystem uses
 * (proc:<biome>:<wx>,<wy>:<depth>) is what makes an animal come back at the
 * exact coordinate where it was bought. Ordinary maps use their map id. Either
 * way the animal is respawned from the record every time the map loads.
 *
 * --- Growth Logic ---
 * - Animals grow from Baby to Adult over their defined growthDays.
 * - Animals that only have an Adult stage start as adults.
 * - Adult animals produce items at defined intervals.
 * - Sprite sheets use rows as growth stages:
 *   Baby = direction DOWN (row 0), Adult = direction LEFT (row 1).
 *
 * --- Produce ---
 * What an animal pays out is what a LIVING animal gives: an egg, a pail of
 * milk, a fleece. Never what you would get by killing it - see the note over
 * the animalGrowth blocks in js/db/WorldGen/NPCs.json, which are now the one
 * place a breed is described.
 *
 * --- Company ---
 * Every animal also carries a `company` value, paid into the party's Social
 * need (TimeDateSystem's extended needs) whenever the player interacts with it:
 * the leader in full, everyone else at half, once per in-game day per animal so
 * it cannot be farmed by holding the action button down. A dog, a donkey and a
 * rooster produce nothing at all and are kept for exactly this.
 *
 * --- Legacy "Animal" events ---
 * An event named "Animal" still works as a single animal slot driven by the
 * SellAnimal / CollectProduce / RemoveAnimal plugin commands; AnimalMenu and
 * BuyAnimal now simply open the Build menu on the Animals tab.
 *
 * @command AnimalMenu
 * @text Animal Menu
 * @desc Opens the Build menu on the Animals tab (buy animals with money).
 *
 * @command BuyAnimal
 * @text Buy Animal
 * @desc Opens the Build menu on the Animals tab.
 *
 * @command SellAnimal
 * @text Sell Animal
 * @desc Sells the animal held by the calling "Animal" event slot.
 *
 * @command CollectProduce
 * @text Collect Produce
 * @desc Collects any ready produce from the animal at the calling event.
 *
 * @command RemoveAnimal
 * @text Remove Animal
 * @desc Removes the animal at the calling event without giving gold.
 *
 * @command InteractAnimal
 * @text Interact With Animal
 * @desc Internal: fired by a placed animal when the player talks to it.
 * @arg uid
 * @text Animal UID
 * @desc Internal placement id.
 * @type string
 */

(() => {
  "use strict";

  // ---- Where the yield goes ------------------------------------------------
  // Straight to the party, unless they own a shop that deals in this sort of
  // thing, in which case the crate goes to that shop's warehouse - which is
  // what its production recipes eat - and the party is told. ShopManagement
  // owns the rule; with that plugin off this is a plain gainItem.
  function deliverFarmProduce(item, amount) {
    const SM = window.ShopManagement;
    if (SM && typeof SM.deliverProduce === 'function') {
      return SM.deliverProduce(item, amount);
    }
    if (window.$gameParty && item) $gameParty.gainItem(item, amount);
    return { toShop: 0, toParty: amount, shopId: null };
  }


  const pluginName = "AnimalGrowthSystem";

  // ============================================================
  //  CONSTANTS
  // ============================================================

  const GAME_TIME_VAR = 114;
  const MINUTES_PER_DAY = 1440;

  // Direction per growth stage: 2=down (baby), 4=left (adult)
  const STAGE_DIRS = { baby: 2, adult: 4 };
  const STAGE_NAMES = {
    get baby() { return T('AnimalGrowth.stage.baby'); },
    get adult() { return T('AnimalGrowth.stage.adult'); }
  };

  // ============================================================
  //  ANIMAL DATABASE
  // ============================================================

  // produces: array of { itemId, interval (in days), yieldMin, yieldMax }
  // company: how much Social a round with this animal is worth (0-100 scale,
  //          once per in-game day per animal - see keepCompany below)
  //
  // WHAT A LIVE ANIMAL GIVES. Produce is what the animal hands over while it
  // goes on living: an egg, a pail of milk, a fleece. It is NOT what you get by
  // killing it, which is what several of these entries used to pay out - a hen
  // yielding Raw Meat every single day, a live cow shedding Leather every five,
  // a rabbit doing the same every three. Those are slaughter drops on a
  // producing animal's timer, so they are gone:
  //
  //   Chicken -> Chicken Egg (1791)   was Raw Meat  (862) daily
  //   Duck    -> Duck Egg    (1792)   was Raw Meat  (862)
  //   Goat    -> Goat Milk   (1793)   was Fresh Milk (438), a cow's milk
  //   Cow     -> Fresh Milk  (438)    keeps the milk, loses the Leather
  //   Rabbit  -> Cloth       (861)    angora, in place of skinning it alive
  //   Pig     -> nothing              was Raw Meat (862); a pig is a slaughter
  //                                   animal, not a producing one, so it earns
  //                                   its keep on the sale and on the company
  //   Sheep   -> Cloth       (861)    unchanged: the fleece, as the material
  //
  // Every animal pays `company` whether or not it produces anything, which for
  // a dog, a donkey and a rooster is the entire point of keeping one. The
  // breeds added alongside the Animals folder rework - Horse, Cat, Pigeon,
  // Crab, Toad - all produce nothing for the same reason: none of them hands
  // anything over while it lives, so each earns its keep on company and on the
  // resale, exactly as a dog does.
  //
  // Every sheet in img/characters/Animals belongs to one breed below. The two
  // undead skins are skins, not breeds of their own: a zombie world redraws the
  // stock it already has, so DogZombie rides with the dogs and CrabZombie with
  // the crabs rather than splitting either herd in two.

  // The breed table is no longer written here. Every `animal: true` entry in
  // js/db/WorldGen/NPCs.json carries an `animalGrowth` block of its own , the
  // breed it belongs to, whether that sheet is the baby or the adult, what it
  // costs, what it sells for, how long it takes to grow, what company it is
  // worth and what it produces , and the table below is folded out of those
  // entries the first time anything asks for it. One sheet, one entry, one
  // place: the wardrobe says what an animal IS and now also what it does.
  //
  // There are no skin lists any more. A breed's sprites are simply the entries
  // that name it, split by the `stage` each one declares, so adding a sheet to
  // the wardrobe adds it to the herd with no second list to keep in step.
  //
  // WHAT A LIVE ANIMAL GIVES. Produce is what the animal hands over while it
  // goes on living: an egg, a pail of milk, a fleece. It is never what you get
  // by killing it. Every animal pays `company` whether or not it produces
  // anything, which for a dog, a donkey and a rooster is the entire point of
  // keeping one.

  function npcWardrobe() {
    return (window.WorldGen && window.WorldGen.NPCs) || {};
  }

  let _animalDb = null;

  function animalDb() {
    if (_animalDb) return _animalDb;
    const out = {};
    const data = npcWardrobe();
    for (const key of Object.keys(data).sort()) {
      const entry = data[key];
      if (!entry || entry.animal !== true) continue;
      const g = entry.animalGrowth;
      if (!g || !g.breed) continue;
      const def = out[g.breed] || (out[g.breed] = {
        adultSprites: [], babySprites: [],
        hasBaby: false, growthDays: 0, company: 0, produces: [],
        buyCostAdult: 0, buyCostBaby: 0, sellValueAdult: 0, sellValueBaby: 0,
      });
      // Breed-wide facts are the same on every entry of the breed; the last
      // one read wins, which is the same answer as the first.
      def.hasBaby = def.hasBaby || !!g.hasBaby;
      if (g.growthDays != null) def.growthDays = g.growthDays;
      if (g.company != null) def.company = g.company;
      if (Array.isArray(g.produces) && g.produces.length) def.produces = g.produces;
      if (g.ridable != null) def.ridable = def.ridable || !!g.ridable;
      if (g.stage === "baby") {
        def.babySprites.push(key);
        def.buyCostBaby = g.buyCost || 0;
        def.sellValueBaby = g.sellValue || 0;
      } else {
        def.adultSprites.push(key);
        def.buyCostAdult = g.buyCost || 0;
        def.sellValueAdult = g.sellValue || 0;
      }
    }
    // The wardrobe may not be registered yet on the first call; caching an
    // empty database would leave the game with no breeds at all.
    if (Object.keys(out).length) _animalDb = out;
    return out;
  }

  // The breed an arbitrary sprite sheet belongs to, for an animal the player
  // never bought: a hen standing in a procedural farmyard is the same hen the
  // Build menu sells, and is fed, petted and collected from in the same way.
  function breedOfSprite(spriteKey) {
    if (!spriteKey) return null;
    const entry = npcWardrobe()[spriteKey];
    const g = entry && entry.animal === true ? entry.animalGrowth : null;
    return (g && g.breed) || null;
  }

  function stageOfSprite(spriteKey) {
    const entry = npcWardrobe()[spriteKey];
    const g = entry && entry.animal === true ? entry.animalGrowth : null;
    return (g && g.stage === "baby") ? "baby" : "adult";
  }

  function isRidableSprite(spriteKey) {
    const entry = npcWardrobe()[spriteKey];
    const g = entry && entry.animal === true ? entry.animalGrowth : null;
    return !!(g && g.ridable);
  }

  // Kept as a live view so every existing reader (ANIMAL_DB.Chicken, the Build
  // menu's Object.keys, the public export) goes on working unchanged.
  const ANIMAL_DB = new Proxy({}, {
    get: (_, k) => (typeof k === "string" ? animalDb()[k] : undefined),
    has: (_, k) => typeof k === "string" && k in animalDb(),
    ownKeys: () => Reflect.ownKeys(animalDb()),
    getOwnPropertyDescriptor: (_, k) => {
      const db = animalDb();
      return (typeof k === "string" && k in db)
        ? { value: db[k], enumerable: true, configurable: true } : undefined;
    },
  });

  // ============================================================
  //  HELPERS
  // ============================================================

  function animalKey(mapId, eventId) {
    return `${mapId}_${eventId}`;
  }

  function getRecord(mapId, eventId) {
    if (!$gameSystem._animalData) $gameSystem._animalData = {};
    return $gameSystem._animalData[animalKey(mapId, eventId)] || null;
  }

  function saveRecord(mapId, eventId, rec) {
    if (!$gameSystem._animalData) $gameSystem._animalData = {};
    $gameSystem._animalData[animalKey(mapId, eventId)] = rec;
    updateSelfSwitch(mapId, eventId, rec);
  }

  function deleteRecord(mapId, eventId) {
    if (!$gameSystem._animalData) $gameSystem._animalData = {};
    delete $gameSystem._animalData[animalKey(mapId, eventId)];
    if ($gameSelfSwitches) {
      $gameSelfSwitches.setValue([mapId, eventId, "A"], true);
    }
  }

  function updateSelfSwitch(mapId, eventId, rec) {
    if (!$gameSelfSwitches) return;
    const hasAnimal = !!(rec && rec.animalId);
    $gameSelfSwitches.setValue([mapId, eventId, "A"], !hasAnimal);
  }

  function gameMinutes() {
    return ($gameVariables ? $gameVariables.value(GAME_TIME_VAR) : 0) || 0;
  }

  function isAnimalEvent(event) {
    // Cached per event (event names are static per map) so the per-frame
    // Game_Event.update hook doesn't lowercase the name every call.
    if (event._isAnimalEvt !== undefined) return event._isAnimalEvt;
    if (!$dataMap || !$dataMap.events) return false;
    const data = $dataMap.events[event._eventId];
    event._isAnimalEvt = !!(data && (data.name || "").toLowerCase() === "animal");
    return event._isAnimalEvt;
  }

  function randomPick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function calcGrowthProgress(rec, def) {
    if (!def.hasBaby || def.growthDays <= 0) return 1.0;
    const elapsed = rec.effectiveGrowthMinutes || 0;
    return Math.min(elapsed / (def.growthDays * MINUTES_PER_DAY), 1.0);
  }

  function getStage(rec, def) {
    if (!def.hasBaby) return "adult";
    return calcGrowthProgress(rec, def) >= 1.0 ? "adult" : "baby";
  }

  function getCurrentSprite(rec, def) {
    const stage = getStage(rec, def);
    if (stage === "baby") {
      return rec.babySprite || rec.babySkin ||
        (def.babySprites[0] || def.adultSprites[0]);
    }
    return rec.adultSprite || rec.adultSkin || def.adultSprites[0];
  }

  function sellValueOf(rec, def) {
    if (!def) return 0;
    return (rec.stage === "baby") ? (def.sellValueBaby || 0) : (def.sellValueAdult || 0);
  }

  // ---- AGE -----------------------------------------------------------------
  // A baby is born the day it is placed. An ADULT was not: it has been alive
  // somewhere, and putting it in the world at zero days old made every cow in
  // the game a newborn the size of a cow. So an adult is back-dated, to
  // somewhere between the day it finished growing and the middle of its own
  // breed's life (`lifespanDays` on its wardrobe entry), which puts a bought
  // heifer at a couple of years and a bought hen at a few months.
  function lifespanDaysOf(def) {
    const sprite = (def && (def.adultSprites[0] || def.babySprites[0])) || null;
    const entry = sprite ? npcWardrobe()[sprite] : null;
    return (entry && entry.animalGrowth && entry.animalGrowth.lifespanDays) || 0;
  }

  function rollAdultAgeDays(def) {
    const grown = Math.max(def.growthDays || 0, 1);
    const life = lifespanDaysOf(def);
    // Half of the breed's life is the ceiling; an animal offered for sale is
    // never one already past its useful years.
    const ceiling = Math.max(grown + 1, Math.floor(life * 0.5));
    return grown + Math.floor(Math.random() * (ceiling - grown));
  }

  // How old this animal is, in days. Records written before animals had a
  // birthday are read off what they do carry: the day they were placed, less
  // the growing they had already done when they arrived.
  function ageDaysOf(rec) {
    if (!rec) return 0;
    const born = (rec.bornAt != null)
      ? rec.bornAt
      : (rec.boughtAt || 0) - (rec.stage === "baby" ? 0 : (rec.effectiveGrowthMinutes || 0));
    return Math.max(0, (gameMinutes() - born) / MINUTES_PER_DAY);
  }

  // "3 years" over a year old, "18 days" under one. The unit matters: a lamb
  // measured in years is always "0" and tells the player nothing.
  function ageLabelOf(rec) {
    const T = window.T;
    const days = Math.floor(ageDaysOf(rec));
    if (days >= 365) {
      const years = Math.floor(days / 365);
      return T ? T.n("AnimalGrowth.age.years", years) : years + "y";
    }
    return T ? T.n("AnimalGrowth.age.days", days) : days + "d";
  }

  function buyCostOf(def, stage) {
    if (!def) return 0;
    return (stage === "baby") ? (def.buyCostBaby || 0) : (def.buyCostAdult || 0);
  }

  // Count total animal events on current map
  function countAnimalEvents() {
    if (!$gameMap || !$dataMap || !$dataMap.events) return 0;
    let count = 0;
    for (const ev of $gameMap.events()) {
      if (ev && isAnimalEvent(ev)) count++;
    }
    return count;
  }

  // Count occupied animal events on current map
  function countOccupiedSlots() {
    if (!$gameMap || !$gameSystem._animalData) return 0;
    const mapId = $gameMap.mapId();
    let count = 0;
    for (const ev of $gameMap.events()) {
      if (!ev || !isAnimalEvent(ev)) continue;
      const rec = getRecord(mapId, ev._eventId);
      if (rec && rec.animalId) count++;
    }
    return count;
  }

  function hasFreeSlot() {
    return countOccupiedSlots() < countAnimalEvents();
  }

  // ============================================================
  //  PLACEMENT STORE (animals bought from the Build menu)
  // ============================================================

  // Placed animals are stored per *map key*, not per map id. The procedural
  // biome map (id 636) is one reused map that streams a different place for
  // every world coordinate, so keying by map id alone would make an animal
  // bought at one coordinate appear at every other. FurnitureSystem already
  // solves this with a composite key (proc:<biome>:<wx>,<wy>:<depth>), so the
  // same key is reused here and animals come back exactly where they were left,
  // on ordinary and procedural maps alike.
  function currentMapKey() {
    const fs = window.FurnitureSystem;
    if (fs && typeof fs.furnitureMapKey === "function") {
      try {
        const key = fs.furnitureMapKey();
        if (key != null) return String(key);
      } catch (e) { /* fall back to the plain map id */ }
    }
    return String($gameMap ? $gameMap.mapId() : 0);
  }

  function placementStore() {
    if (!$gameSystem) return {};
    if (!$gameSystem._animalPlacements) $gameSystem._animalPlacements = {};
    return $gameSystem._animalPlacements;
  }

  function placementsAt(mapKey) {
    const store = placementStore();
    if (!store[mapKey]) store[mapKey] = [];
    return store[mapKey];
  }

  function allPlacements() {
    const store = placementStore();
    const out = [];
    for (const [mapKey, list] of Object.entries(store)) {
      for (const rec of (list || [])) {
        if (rec && rec.animalId) out.push({ rec, mapKey });
      }
    }
    return out;
  }

  function findPlacement(uid) {
    const n = Number(uid);
    for (const entry of allPlacements()) {
      if (entry.rec.uid === n) return entry;
    }
    return null;
  }

  function nextPlacementUid() {
    if (!$gameSystem._animalPlacementUid) $gameSystem._animalPlacementUid = 0;
    return ++$gameSystem._animalPlacementUid;
  }

  // A fresh animal record. Shared by the Build menu (placements) and the
  // legacy "Animal" event slots so both age and produce identically.
  function newRecord(animalId, stage) {
    const def = ANIMAL_DB[animalId];
    if (!def) return null;
    const now = gameMinutes();
    const isBaby = stage === "baby" && def.hasBaby;
    const finalStage = isBaby ? "baby" : "adult";
    const produceTimers = {};
    if (finalStage === "adult") {
      for (let i = 0; i < (def.produces || []).length; i++) produceTimers[`p${i}`] = now;
    }
    return {
      animalId,
      boughtAt: now,
      // Born today if a baby; back-dated to a plausible age if not.
      bornAt: isBaby ? now : now - rollAdultAgeDays(def) * MINUTES_PER_DAY,
      lastUpdateMinutes: now,
      effectiveGrowthMinutes: isBaby ? 0 : def.growthDays * MINUTES_PER_DAY,
      stage: finalStage,
      adultSprite: randomPick(def.adultSprites),
      babySprite: isBaby ? randomPick(def.babySprites) : null,
      paid: buyCostOf(def, finalStage),
      produceTimers,
    };
  }

  // ============================================================
  //  PRODUCTION
  // ============================================================

  // commit=false is a pure read (used by hasReadyProduce) and must not touch
  // rec.produceTimers. commit=true (collectProduce) accumulates every elapsed
  // batch that built up over a long absence and advances the timer by the
  // consumed batches, keeping the sub-interval remainder.
  function checkProduce(rec, def, commit = false) {
    if (!def.produces || def.produces.length === 0) return [];
    if (getStage(rec, def) !== "adult") return [];
    // Nothing comes out of an animal that has not been fed.
    if (isHungry(rec)) return [];
    const now = gameMinutes();
    const ready = [];
    if (!rec.produceTimers) {
      if (!commit) return [];   // don't create the map on a read-only query
      rec.produceTimers = {};
    }
    for (let i = 0; i < def.produces.length; i++) {
      const prod = def.produces[i];
      const key = `p${i}`;
      if (rec.produceTimers[key] === undefined) {
        // Timer not started yet: only the mutating path may start the clock.
        if (commit) rec.produceTimers[key] = now;
        continue;
      }
      const needed = prod.interval * MINUTES_PER_DAY;
      if (!(needed > 0)) continue;
      const elapsed = now - rec.produceTimers[key];
      const batches = Math.floor(elapsed / needed);
      if (batches >= 1) {
        let qty = 0;
        for (let b = 0; b < batches; b++) {
          qty += prod.yieldMin + Math.floor(Math.random() * (prod.yieldMax - prod.yieldMin + 1));
        }
        ready.push({ itemId: prod.itemId, qty, prodIndex: i, batches });
        if (commit) rec.produceTimers[key] += batches * needed; // keep remainder
      }
    }
    return ready;
  }

  function collectProduce(rec, def) {
    const items = checkProduce(rec, def, true);
    // A party that knows livestock gets more out of the same animal, and gets
    // better at it by doing the round (see window.SpecializationXP).
    const skill = window.SpecializationXP
      ? window.SpecializationXP.multiplier("Animal Husbandry", 0.1) : 1;
    // ...and a Farmer in the party gets three times as much out of the same
    // pen (the Green Thumb passive, BattleSystemPassiveSkills).
    const P = window.BattleSystemPassiveSkills;
    const green = (P && P.growthYieldMultiplier) ? P.growthYieldMultiplier() : 1;
    for (const r of items) {
      const item = $dataItems[r.itemId];
      if (item) {
        r.qty = Math.max(1, Math.round(r.qty * skill * green));
        deliverFarmProduce(item, r.qty);
      }
    }
    if (items.length && window.SpecializationXP) {
      window.SpecializationXP.award("Animal Husbandry", 1);
    }
    return items;
  }

  function hasReadyProduce(rec, def) {
    return checkProduce(rec, def, false).length > 0;
  }

  // ============================================================
  //  COMPANY
  // ============================================================

  // An animal is not only a factory. Standing about with one does a person
  // good, and for the animals that produce nothing at all - a dog, a donkey, a
  // rooster - it is the only reason to keep them. Every interaction pays the
  // animal's `company` into the party's Social need (TimeDateSystem's extended
  // needs, the same meter conversation and the society simulation move).
  //
  // Paid once per in-game day per animal, so it cannot be farmed by standing in
  // front of the dog and holding the action button down. The whole party is
  // stood there, so the whole party benefits - the leader, who is the one
  // actually crouched down scratching its ears, gets the full amount and
  // everyone else half of it.
  const COMPANY_COOLDOWN_MINUTES = MINUTES_PER_DAY;

  function keepCompany(rec, def) {
    const amount = def && def.company;
    if (!amount || !$gameParty) return 0;
    const now = gameMinutes();
    const last = rec.lastCompanyMinutes;
    // `last > now` means game time was reset under us; resync rather than
    // locking the animal out until the clock climbs back past the old value.
    if (last !== undefined && last <= now && now - last < COMPANY_COOLDOWN_MINUTES) return 0;
    rec.lastCompanyMinutes = now;

    const leader = $gameParty.leader();
    for (const member of $gameParty.members()) {
      if (!member || typeof member.addSocial !== "function") continue;
      member.addSocial(member === leader ? amount : amount / 2);
    }
    return amount;
  }

  function reportCompany(animalId) {
    window.skipLocalization = true;
    $gameMessage.add(T('AnimalGrowth.company', { animal: animalId }));
    window.skipLocalization = false;
  }

  // Announces a collection through the message window, in the caller's voice.
  function reportCollected(items) {
    for (const r of items) {
      const item = $dataItems[r.itemId];
      if (!item) continue;
      window.skipLocalization = true;
      $gameMessage.add(T('AnimalGrowth.collected', { icon: item.iconIndex, item: item.name, qty: r.qty }));
      window.skipLocalization = false;
    }
  }

  // ============================================================
  //  NUTRITION
  // ============================================================

  // How well fed an animal is, 0 to 100. It empties over NUTRITION_DAYS from
  // the last time anybody put food in front of it, and a hungry animal is a
  // poor one: below NUTRITION_HUNGRY it stops producing altogether and grows at
  // half speed. Feeding it is the Empathize panel's Feed action, which is the
  // same action a beast NPC is fed with, so an animal in a farmyard and an
  // animal in the party are looked after the same way.
  //
  // An animal nobody has ever fed is not starving: it grazes. `fedAt` starts at
  // the day it was placed, which puts it at full and lets it fall from there.
  const NUTRITION_DAYS = 3;
  const NUTRITION_HUNGRY = 25;

  function nutritionOf(rec) {
    if (!rec) return 0;
    const fed = (rec.fedAt != null) ? rec.fedAt : (rec.boughtAt || 0);
    const days = Math.max(0, (gameMinutes() - fed) / MINUTES_PER_DAY);
    return Math.max(0, Math.min(100, Math.round(100 * (1 - days / NUTRITION_DAYS))));
  }

  function isHungry(rec) {
    return nutritionOf(rec) < NUTRITION_HUNGRY;
  }

  // Puts an animal back on full. Returns false when it was already full, so a
  // caller can refuse to spend the food.
  function feedAnimal(rec) {
    if (!rec) return false;
    if (nutritionOf(rec) >= 100) return false;
    rec.fedAt = gameMinutes();
    return true;
  }

  // ============================================================
  //  GROWTH UPDATE
  // ============================================================

  // Ages one record by however much game time has passed since it was last
  // looked at. Works for both storage shapes, so a placed animal keeps growing
  // while the player is on the other side of the world.
  function updateRecordGrowth(rec) {
    if (!rec || !rec.animalId) return false;
    const def = ANIMAL_DB[rec.animalId];
    if (!def) return false;
    const now = gameMinutes();
    if (rec.lastUpdateMinutes === undefined) rec.lastUpdateMinutes = now;
    if (!def.hasBaby) { rec.lastUpdateMinutes = now; return false; }

    const elapsed = now - rec.lastUpdateMinutes;
    if (elapsed <= 0) return false;

    // A hungry animal grows at half speed. Nothing stops entirely, so a farm
    // the player never visits still fills out, only slowly.
    rec.effectiveGrowthMinutes =
      (rec.effectiveGrowthMinutes || 0) + (isHungry(rec) ? elapsed / 2 : elapsed);
    rec.lastUpdateMinutes = now;

    const oldStage = rec.stage;
    rec.stage = getStage(rec, def);

    // When transitioning to adult, initialize produce timers
    if (oldStage === "baby" && rec.stage === "adult") {
      rec.produceTimers = {};
      for (let i = 0; i < (def.produces || []).length; i++) {
        rec.produceTimers[`p${i}`] = now;
      }
    }
    // Growing up happens off screen, on a farm the party may be nowhere near.
    if (oldStage !== rec.stage && rec.stage === "adult" && window.ParchmentToast) {
      window.ParchmentToast.show(
        T('AnimalGrowth.toast.grownUp', { animal: rec.animalId }),
        { severity: "good", key: "animal-adult:" + rec.animalId }  // i18n-ignore  dedupe key
      );
    }
    return oldStage !== rec.stage;
  }

  function updateGrowth(mapId, eventId) {
    const rec = getRecord(mapId, eventId);
    if (!rec || !rec.animalId) return;
    updateRecordGrowth(rec);
    saveRecord(mapId, eventId, rec);
  }

  // Ages every stored animal (placements and event slots alike).
  function updateAllGrowth() {
    for (const { rec } of allPlacements()) updateRecordGrowth(rec);
    const data = $gameSystem && $gameSystem._animalData;
    if (data) {
      for (const rec of Object.values(data)) updateRecordGrowth(rec);
    }
  }

  function applySprite(event, rec) {
    if (!rec || !rec.animalId) {
      event.setImage("", 0);
      return;
    }
    const def = ANIMAL_DB[rec.animalId];
    if (!def) return;
    const sprite = getCurrentSprite(rec, def);
    event.setImage(sprite, 0);
    event._direction = STAGE_DIRS[rec.stage] || 2;
    event._directionFix = false;
    event.setWalkAnime(false);
    event.setStepAnime(true);
    event._animalStageShown = rec.stage;
  }

  function refreshMapAnimals() {
    if (!$gameMap || !$gameSystem) return;
    const mapId = $gameMap.mapId();
    for (const ev of $gameMap.events()) {
      if (!ev || !isAnimalEvent(ev)) continue;
      if (ev._animalUid) continue;   // placed animals own their own refresh
      updateGrowth(mapId, ev._eventId);
      const rec = getRecord(mapId, ev._eventId);
      applySprite(ev, rec);
      updateSelfSwitch(mapId, ev._eventId, rec);
    }
  }

  // ============================================================
  //  SPRITE SERVICES (shared with the Build menu / Assets menu)
  // ============================================================

  // Row within a character sheet for a growth stage: baby = row 0, adult = row 1.
  function stageRow(stage) {
    const dir = STAGE_DIRS[stage] || 2;
    return dir === 2 ? 0 : dir === 4 ? 1 : dir === 6 ? 2 : 3;
  }

  // Draws one character-sheet cell onto an HTML canvas element, centred and
  // scaled to fit. Used by every panel that shows an animal.
  function drawSpriteOnCanvas(cv, spriteName, stage) {
    if (!cv || !spriteName) return;
    const row = stageRow(stage);
    const bm = ImageManager.loadCharacter(spriteName);
    const render = () => {
      if (!bm || !bm.isReady() || !cv.getContext) return;
      const isBig = ImageManager.isBigCharacter(spriteName);
      const cols = isBig ? 3 : 12;
      const rows = isBig ? 4 : 8;
      const sw = bm.width / cols;
      const sh = bm.height / rows;
      const scale = Math.min(cv.height / sh, cv.width / sw, 3.0);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        bm.canvas,
        0, row * sh, sw, sh,
        Math.round((cv.width - dw) / 2),
        Math.round((cv.height - dh) / 2),
        dw, dh
      );
    };
    if (bm.isReady()) render();
    else bm.addLoadListener(render);
  }

  // A single-frame Bitmap of an animal, for the Build menu's placement ghost.
  // The sheet's frame size is unknown until it loads, so the bitmap starts
  // tile-sized and resizes itself once the art is in.
  function frameBitmap(spriteName, stage) {
    const bmp = new Bitmap(48, 48);
    if (!spriteName) return bmp;
    const row = stageRow(stage);
    const src = ImageManager.loadCharacter(spriteName);
    const paint = () => {
      const isBig = ImageManager.isBigCharacter(spriteName);
      const cols = isBig ? 3 : 12;
      const rows = isBig ? 4 : 8;
      const sw = Math.floor(src.width / cols);
      const sh = Math.floor(src.height / rows);
      if (sw <= 0 || sh <= 0) return;
      bmp.resize(sw, sh);
      bmp.clear();
      bmp.blt(src, 0, row * sh, sw, sh, 0, 0);
    };
    if (src.isReady()) paint();
    else src.addLoadListener(paint);
    return bmp;
  }

  // ============================================================
  //  PLACED ANIMALS ON THE MAP
  // ============================================================

  // A placed animal is a real (dynamically spawned) event named "Animal", so it
  // renders, blocks and can be talked to through the normal engine paths. The
  // record stays the source of truth: the event is rebuilt from it on every map
  // load, which is why a wandering event id never has to be persisted.
  function spawnAnimalEvent(rec) {
    if (!$dataMap || !$gameMap) return null;
    const def = ANIMAL_DB[rec.animalId];
    if (!def) return null;
    if (!$dataMap.events) $dataMap.events = [null];
    const eventId = $dataMap.events.length;
    const sprite = getCurrentSprite(rec, def);
    $dataMap.events[eventId] = {
      id: eventId, name: "Animal", note: "",
      x: rec.x, y: rec.y,
      pages: [{
        conditions: {
          actorId: 1, actorValid: false, itemId: 1, itemValid: false,
          selfSwitchCh: "A", selfSwitchValid: false,
          switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
          variableId: 1, variableValid: false
        },
        directionFix: true,
        image: {
          tileId: 0, characterName: sprite, characterIndex: 0,
          direction: STAGE_DIRS[rec.stage] || 2, pattern: 1
        },
        list: [
          { code: 357, indent: 0, parameters: [pluginName, "InteractAnimal", "Interact With Animal", { uid: String(rec.uid) }] },  // i18n-ignore  plugin command id  // i18n-ignore  plugin command id
          { code: 0, indent: 0, parameters: [] }
        ],
        moveFrequency: 3,
        moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
        moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: true,
        through: false, trigger: 0, walkAnime: false
      }]
    };
    if (!$gameMap._events) $gameMap._events = [];
    const ev = new Game_Event($gameMap.mapId(), eventId);
    ev._animalUid = rec.uid;
    ev._isAnimalEvt = true;
    applySprite(ev, rec);
    $gameMap._events[eventId] = ev;
    return ev;
  }

  function findAnimalEvent(uid) {
    if (!$gameMap) return null;
    for (const ev of $gameMap.events()) {
      if (ev && ev._animalUid === uid) return ev;
    }
    return null;
  }

  // ============================================================
  //  FARMSTEAD LIVESTOCK (procedural maps)
  // ============================================================
  //
  // Somebody works this field. A procedural square carrying tilled soil - a
  // Farm biome, a village with crops behind it, a lone smallholding on a
  // Plains tile - is a farm, and a farm that has been ploughed but keeps no
  // animals reads as abandoned. Every such square is dealt 0 to 3 head of
  // livestock, ONCE, the first time the party ever walks onto it.
  //
  // They are the farm's, not the party's: the record carries `wild: true`, so
  // they never turn up in the Assets portfolio and cannot be sold, but they
  // graze, grow, produce and can be petted like any other animal, because they
  // go through the very same placement record every bought animal does.
  //
  // The roll is seeded on the square's own composite key (biome + world
  // coordinate + depth), so which animals a farm keeps is the same in every
  // savegame of the world and the same on every visit; and it is dealt once
  // and stored, so clearing a farm out does not repopulate it on the next load.
  const FARMSTEAD_MAX = 3;          // head of livestock a square can be dealt
  const FARMSTEAD_RING = 2;         // how far from the soil they are put down
  const PROC_MAP_ID_AGS = 636;

  // Only the procedural map grows crops procedurally; an authored farm map is
  // hand-populated and must not have livestock invented on top of it.
  function isProceduralMap() {
    return !!$gameMap && $gameMap.mapId() === PROC_MAP_ID_AGS;
  }

  function farmsteadDealt() {
    if (!$gameSystem._animalFarmsteads) $gameSystem._animalFarmsteads = {};
    return $gameSystem._animalFarmsteads;
  }

  // Every tile id the current tileset draws tilled soil with. Read from the
  // tileset's own <TilledSoil:> declaration, which is what the biome generator
  // stamps the fields from (ProceduralMapBiomeGenerator.placeTilledFields), so
  // the two can never disagree about what a ploughed tile is.
  function tilledSoilTileIds() {
    const U = window.ProcGenUtils;
    const tileset = $gameMap && $gameMap.tileset();
    if (!U || !U.Cache || !tileset) return null;
    const features = U.Cache.getTilesetFeatures(tileset.id) || {};
    const ids = new Set();
    for (const v of features["TilledSoil"] || []) {  // i18n-ignore  Features.json id
      if (v.type === "single" && v.tileId) ids.add(v.tileId);
      else if (v.grid) for (const row of v.grid) for (const t of row) if (t) ids.add(t);
    }
    return ids.size ? ids : null;
  }

  // Where livestock may stand: NEAR the crop, never in it. An animal dropped on
  // a sown tile stands in the middle of the plants and hides the crop event, so
  // the pasture is the ring of open ground around the field rather than the
  // field itself.
  function farmsteadPastureTiles() {
    const soilIds = tilledSoilTileIds();
    if (!soilIds) return [];
    const w = $gameMap.width();
    const h = $gameMap.height();
    const isSoil = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      for (const z of [1, 2, 3]) if (soilIds.has($gameMap.tileId(x, y, z))) return true;
      return false;
    };

    const soil = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (isSoil(x, y)) soil.push({ x, y });
    }
    if (!soil.length) return [];

    const seen = new Set();
    const pasture = [];
    for (const s of soil) {
      for (let dy = -FARMSTEAD_RING; dy <= FARMSTEAD_RING; dy++) {
        for (let dx = -FARMSTEAD_RING; dx <= FARMSTEAD_RING; dx++) {
          const x = s.x + dx, y = s.y + dy;
          const key = `${x},${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (isSoil(x, y)) continue;            // the crop is not a pasture
          if (!canPlaceAnimalAt(x, y)) continue;
          pasture.push({ x, y });
        }
      }
    }
    return pasture;
  }

  // A stream of the square's own identity, so a farm keeps the same animals in
  // every savegame of the world and on every visit.
  function farmsteadRng(mapKey) {
    const U = window.ProcGenUtils;
    let h = 0x9e3779b1;
    const s = String(mapKey);
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    if (U && typeof U.getWorldSeed === "function") h = (h ^ (U.getWorldSeed() >>> 0)) | 0;
    if (U && typeof U.createSeededRandom === "function") return U.createSeededRandom(h >>> 0);
    return Math.random;
  }

  // ---- WHOSE FARM IS THIS -------------------------------------------------
  // Livestock standing on tilled soil belongs to somebody. Every world-map
  // square gets ONE farmer, minted the first time its stock is dealt and
  // remembered on the world tile, so every animal on that square answers to the
  // same name and the same name comes back on every visit and in every savegame
  // of the world.
  //
  // The farmer is a citizen of the square's own "Proc:x,y" settlement like
  // anybody else living there, so the whole simulation , society, life history,
  // politics , picks them up rather than treating them as a label on a cow.
  function farmOwners() {
    if (!$gameSystem._animalFarmOwners) $gameSystem._animalFarmOwners = {};
    return $gameSystem._animalFarmOwners;
  }

  // The world coordinate this square sits on, or null off the procedural map.
  function currentWorldCoords() {
    const wx = $gameVariables ? $gameVariables.value(43) : null;
    const wy = $gameVariables ? $gameVariables.value(44) : null;
    return (wx == null || wy == null) ? null : { wx, wy };
  }

  // A farmer's name, dealt off the coordinate so it is the same person forever.
  function farmOwnerName(wx, wy) {
    const seed = ((wx * 73856093) ^ (wy * 19349663) ^ 0x5f3a7c1d) >>> 0;
    if (window.generateSeededMarkovName) {
      const dbs = ["english", "italian", "german", "french", "spanish"]; // i18n-ignore: Markov database ids
      const db = dbs[seed % dbs.length];
      try {
        const name = window.generateSeededMarkovName(
          wx & 0xffff, wy & 0xffff, (seed % 9973) + 1, db, 2, 4, 12);
        if (name && name !== "Unknown") return name; // i18n-ignore: Markov generator sentinel
      } catch (e) { /* fall through to the plain label */ }
    }
    return T('AnimalGrowth.farmerOf', { x: wx, y: wy });
  }

  // The farmer of the square the party is standing on, minted and registered as
  // a citizen on first use. Null when there is no world coordinate to hang one
  // on (an authored map), where the stock simply has no named owner.
  function ensureFarmOwner() {
    const at = currentWorldCoords();
    if (!at) return null;
    const key = `${at.wx},${at.wy}`;
    const owners = farmOwners();
    if (owners[key]) return owners[key];

    const name = farmOwnerName(at.wx, at.wy);
    owners[key] = name;

    // Give them a life in the settlement they farm: a profile in the society
    // registry, anchored to this square's own "Proc:x,y" group. Best effort ,
    // a farm dealt before the settlement exists still has its owner's NAME,
    // which is all the animals need.
    try {
      const NS = window.NPCSystem;
      const group = NS?.procGroupName ? NS.procGroupName(at.wx, at.wy) : null;
      const profile = window.NPCSocietyRegistry?.ensureProfile?.(
        name, null, group, $gameMap ? $gameMap.mapId() : null);
      if (profile) {
        profile._isFarmOwner = true;
        profile._farmSquare = key;
      }
    } catch (e) { /* the name is enough */ }
    return name;
  }

  // The savegame that bought an animal. _animalPlacements is world-shared
  // (every savegame of the world walks past the same beasts), so a bought head
  // of stock carries the postal id of the party that paid for it and only that
  // party ever holds it as an asset. Legacy records carry no id and stay with
  // whoever reads them.
  function partyOwnerId() {
    if (window.MailSystem && typeof window.MailSystem.partyId === "function") {
      return window.MailSystem.partyId();
    }
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    return $gameSystem._mailPartyId || null;
  }

  // True when this record is this savegame's own property: bought by the party,
  // not a farm's stock and not another savegame's purchase.
  function isPartyOwned(rec) {
    if (!rec || rec.wild || ownerOf(rec)) return false;
    if (!rec.party) return true;              // legacy record, no id stamped
    const mine = partyOwnerId();
    return !mine || rec.party === mine;
  }

  // The owner of one animal, or null for a wild one.
  function ownerOf(rec) {
    return (rec && rec.owner) || null;
  }

  function isOwnedByNpc(rec) {
    return !!ownerOf(rec);
  }

  function spawnFarmsteadAnimals() {
    if (!isProceduralMap() || !$dataMap || !$gameMap) return;
    const key = currentMapKey();
    const dealt = farmsteadDealt();
    if (dealt[key]) return;                      // this square has had its turn

    const pasture = farmsteadPastureTiles();
    // No tilled soil (or nowhere to stand): not a farm, and not marked either,
    // because a square can be ploughed later and should be dealt its stock then.
    if (!pasture.length) return;

    dealt[key] = true;
    const rng = farmsteadRng(key);
    const count = Math.floor(rng() * (FARMSTEAD_MAX + 1));   // 0-3
    if (count === 0) return;

    // Somebody works this field, and every head of stock on the square answers
    // to them. Minted once per world coordinate (ensureFarmOwner).
    const owner = ensureFarmOwner();
    const breeds = Object.keys(ANIMAL_DB);
    const list = placementsAt(key);
    for (let i = 0; i < count && pasture.length; i++) {
      const spot = pasture.splice(Math.floor(rng() * pasture.length), 1)[0];
      // Re-checked: an earlier animal in this same pass may have taken the tile.
      if (!canPlaceAnimalAt(spot.x, spot.y)) continue;
      const animalId = breeds[Math.floor(rng() * breeds.length)];
      const def = ANIMAL_DB[animalId];
      // A working farm keeps grown stock and the odd young one.
      const stage = (def.hasBaby && rng() < 0.25) ? "baby" : "adult";
      const rec = newRecord(animalId, stage);
      if (!rec) continue;
      rec.uid = nextPlacementUid();
      rec.x = spot.x;
      rec.y = spot.y;
      rec.mapId = $gameMap.mapId();
      rec.mapName = mapDisplayName(key);
      rec.wild = true;        // the farm's, never the party's
      rec.owner = owner;      // and this is whose farm it is
      rec.paid = 0;
      list.push(rec);
    }
  }

  // Rebuilds every animal owned at the current map key. Called before the
  // spriteset builds its character sprites so the animals are drawn with it.
  function spawnPlacedAnimals() {
    if (!$dataMap || !$gameMap) return;
    const key = currentMapKey();
    // The procedural map keeps the same $dataMap object across world
    // coordinates, so the already-spawned list is scoped to the key it was
    // built for and reset whenever the key changes.
    if ($dataMap._animalSpawnKey !== key) {
      $dataMap._animalSpawnKey = key;
      $dataMap._animalSpawned = [];
    }
    const list = placementsAt(key);
    for (const rec of list) {
      if (!rec || !rec.animalId) continue;
      if ($dataMap._animalSpawned.includes(rec.uid)) continue;
      updateRecordGrowth(rec);
      if (spawnAnimalEvent(rec)) $dataMap._animalSpawned.push(rec.uid);
    }
  }

  // True when a tile can take a new animal: on the map, walkable, and not
  // already occupied by an event (including another animal).
  function canPlaceAnimalAt(x, y) {
    if (!$gameMap || !$gameMap.isValid(x, y)) return false;
    if ($gameMap.eventIdXy(x, y) > 0) return false;
    // An animal stands on its tile like any character, so never drop one on
    // top of the player (or a follower): they would be walled in.
    if ($gamePlayer && $gamePlayer.pos(x, y)) return false;
    if ($gamePlayer && $gamePlayer.followers && $gamePlayer.followers().isSomeoneCollided(x, y)) return false;
    return $gameMap.isPassable(x, y, 2);
  }

  // Buys and places an animal at a tile. Money is charged by the caller (the
  // Build menu) so it can honour its own free-build rules.
  function placeAnimal(animalId, stage, x, y) {
    const def = ANIMAL_DB[animalId];
    if (!def) return null;
    const rec = newRecord(animalId, stage);
    if (!rec) return null;
    rec.uid = nextPlacementUid();
    rec.x = x;
    rec.y = y;
    rec.mapId = $gameMap ? $gameMap.mapId() : 0;
    rec.mapName = mapDisplayName(currentMapKey());
    rec.party = partyOwnerId();   // whose stock this is (isPartyOwned)
    placementsAt(currentMapKey()).push(rec);
    const ev = spawnAnimalEvent(rec);
    if (ev && $dataMap) {
      if (!$dataMap._animalSpawned) $dataMap._animalSpawned = [];
      $dataMap._animalSpawned.push(rec.uid);
      // The spriteset only builds character sprites once per map, so a
      // mid-session spawn has to be given its sprite explicitly.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      if (spriteset && typeof spriteset.addAnimalCharacterSprite === "function") {
        spriteset.addAnimalCharacterSprite(ev);
      }
    }
    // Buying and settling an animal is the first half of keeping one.
    if (window.SpecializationXP) window.SpecializationXP.award("Animal Husbandry", 1);
    return rec;
  }

  // Drops a placed animal: removes the record and erases its on-map event.
  function removePlacement(uid) {
    const found = findPlacement(uid);
    if (!found) return null;
    const list = placementsAt(found.mapKey);
    const idx = list.indexOf(found.rec);
    if (idx >= 0) list.splice(idx, 1);
    const ev = findAnimalEvent(found.rec.uid);
    if (ev) ev.erase();
    if ($dataMap && Array.isArray($dataMap._animalSpawned)) {
      const si = $dataMap._animalSpawned.indexOf(found.rec.uid);
      if (si >= 0) $dataMap._animalSpawned.splice(si, 1);
    }
    return found.rec;
  }

  // Human-readable place name for a stored map key: either a procedural world
  // coordinate or a plain map name.
  function mapDisplayName(mapKey) {
    const key = String(mapKey);
    const proc = key.match(/^proc:([^:]*):(-?\d+),(-?\d+)(?::(\d+))?$/);
    if (proc) {
      const depth = Number(proc[4] || 0);
      const below = depth > 0 ? `, -${depth}` : "";
      return `${proc[1] || "Wilderness"} (${proc[2]},${proc[3]}${below})`;
    }
    const id = Number(key);
    if (Number.isFinite(id) && $dataMapInfos && $dataMapInfos[id]) {
      return $dataMapInfos[id].name || T('AnimalGrowth.mapNumbered', { id: id });
    }
    return T('AnimalGrowth.mapNumbered', { id: key });
  }

  // ============================================================
  //  OWNERSHIP ACTIONS (used by the Assets menu)
  // ============================================================

  // Every bought animal, ready for a portfolio listing.
  function listOwnedAnimals() {
    updateAllGrowth();
    const now = gameMinutes();
    const out = [];
    for (const { rec, mapKey } of allPlacements()) {
      // A farm's own stock, and stock bought by another savegame of this
      // world, are not this party's property, so they never appear in the
      // portfolio. They still grow and produce; they are just not assets.
      if (!isPartyOwned(rec)) continue;
      const def = ANIMAL_DB[rec.animalId];
      if (!def) continue;
      const stage = rec.stage || "adult";
      const progress = calcGrowthProgress(rec, def);
      const remaining = Math.max(0, def.growthDays * MINUTES_PER_DAY - (rec.effectiveGrowthMinutes || 0));
      const produces = (def.produces || []).map((prod, i) => {
        const item = $dataItems ? $dataItems[prod.itemId] : null;
        const timer = rec.produceTimers ? rec.produceTimers[`p${i}`] : undefined;
        const needed = prod.interval * MINUTES_PER_DAY;
        const elapsed = timer === undefined ? 0 : now - timer;
        return {
          itemId: prod.itemId,
          name: item ? item.name : T('AnimalGrowth.itemNumbered', { id: prod.itemId }),
          yieldMin: prod.yieldMin, yieldMax: prod.yieldMax,
          intervalDays: prod.interval,
          ready: stage === "adult" && timer !== undefined && elapsed >= needed,
          daysLeft: Math.max(0, Math.ceil((needed - elapsed) / MINUTES_PER_DAY)),
        };
      });
      out.push({
        uid: rec.uid,
        mapKey,
        mapName: rec.mapName || mapDisplayName(mapKey),
        animalId: rec.animalId,
        stage,
        stageName: STAGE_NAMES[stage] || stage,
        x: rec.x, y: rec.y,
        sprite: getCurrentSprite(rec, def),
        paid: rec.paid || 0,
        value: sellValueOf(rec, def),
        growthPct: Math.floor(progress * 100),
        daysToAdult: Math.ceil(remaining / MINUTES_PER_DAY),
        produces,
        hasReady: hasReadyProduce(rec, def),
      });
    }
    out.sort((a, b) => a.animalId.localeCompare(b.animalId) || a.uid - b.uid);
    return out;
  }

  function collectFromPlacement(uid) {
    const found = findPlacement(uid);
    if (!found) return [];
    const def = ANIMAL_DB[found.rec.animalId];
    if (!def) return [];
    updateRecordGrowth(found.rec);
    return collectProduce(found.rec, def);
  }

  // Sells a placed animal for its stage value and removes it from the world.
  function sellPlacement(uid) {
    const found = findPlacement(uid);
    if (!found) return null;
    // Nobody sells an animal they never bought. A farm's own stock is not on
    // the portfolio in the first place, so this is a backstop rather than a
    // path the player can reach.
    if (!isPartyOwned(found.rec)) return null;
    const def = ANIMAL_DB[found.rec.animalId];
    const value = sellValueOf(found.rec, def);
    removePlacement(uid);
    if ($gameParty) $gameParty.gainGold(value);
    return { animalId: found.rec.animalId, stage: found.rec.stage, value };
  }

  // Promotes a placed animal into a pet: it stops being an asset and starts
  // trailing the party (PetFollowerSystem.js). No money changes hands.
  function petPlacement(uid) {
    const found = findPlacement(uid);
    if (!found) return null;
    if (!isPartyOwned(found.rec)) return null;
    const def = ANIMAL_DB[found.rec.animalId];
    if (!def) return null;
    const rec = found.rec;
    const sprite = getCurrentSprite(rec, def);
    if (!window.PetSystem || typeof window.PetSystem.recruitPet !== "function") return null;
    const pet = window.PetSystem.recruitPet({
      name: rec.animalId,
      characterName: sprite,
      characterIndex: 0,
      isFollower: false,
      note: T('AnimalGrowth.petNote', { stage: STAGE_NAMES[rec.stage] || rec.stage, animal: rec.animalId, place: rec.mapName || mapDisplayName(found.mapKey) }),
    });
    removePlacement(uid);
    return pet;
  }

  // ============================================================
  //  HOOKS
  // ============================================================

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    refreshMapAnimals();
  };

  // Placed animals must exist as events BEFORE the spriteset builds its
  // character sprites, exactly like FurnitureSystem's placed house doors.
  const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function () {
    // The farm's own stock is dealt first, so a square being walked onto for
    // the first time has its livestock in the placement list before the spawn
    // pass below turns that list into events.
    spawnFarmsteadAnimals();
    spawnPlacedAnimals();
    _Spriteset_Map_createLowerLayer.call(this);
  };

  // Gives a mid-session spawned animal its character sprite without rebuilding
  // the whole spriteset.
  Spriteset_Map.prototype.addAnimalCharacterSprite = function (event) {
    if (!this._characterSprites || !this._tilemap) return;
    const sprite = new Sprite_Character(event);
    this._characterSprites.push(sprite);
    this._tilemap.addChild(sprite);
  };

  const _Game_Event_update = Game_Event.prototype.update;
  Game_Event.prototype.update = function (sceneActive) {
    _Game_Event_update.call(this, sceneActive);
    if (!isAnimalEvent(this)) return;
    // Placed animals: keep the sheet row locked to the growth stage and swap
    // the sprite the moment a baby becomes an adult. Checked on a slow beat so
    // this per-frame hook stays cheap.
    if (this._animalUid) {
      if ((Graphics.frameCount & 63) !== 0) return;
      const found = findPlacement(this._animalUid);
      if (!found) return;
      updateRecordGrowth(found.rec);
      if (this._animalStageShown !== found.rec.stage) applySprite(this, found.rec);
      const dir = STAGE_DIRS[found.rec.stage] || 2;
      if (this._direction !== dir) this._direction = dir;
      return;
    }
    // Legacy event slots: cache the record key (stable per event) and only
    // write when changed, to keep this hook allocation-free.
    if (this._animalRecKey === undefined) {
      this._animalRecKey = animalKey($gameMap.mapId(), this._eventId);
    }
    const data = $gameSystem._animalData;
    const rec = data ? data[this._animalRecKey] : null;
    if (rec && rec.animalId && ANIMAL_DB[rec.animalId]) {
      const dir = STAGE_DIRS[rec.stage] || 2;
      if (this._direction !== dir) this._direction = dir;
    }
  };

  const _Game_Event_setupPageSettings = Game_Event.prototype.setupPageSettings;
  Game_Event.prototype.setupPageSettings = function () {
    _Game_Event_setupPageSettings.call(this);
    if (!$gameMap || !isAnimalEvent(this)) return;
    if (this._animalUid) {
      const found = findPlacement(this._animalUid);
      if (found) applySprite(this, found.rec);
      return;
    }
    const rec = getRecord($gameMap.mapId(), this._eventId);
    if (rec && rec.animalId) applySprite(this, rec);
  };

  const _Game_Event_lock = Game_Event.prototype.lock;
  Game_Event.prototype.lock = function () {
    if (isAnimalEvent(this)) return;
    _Game_Event_lock.call(this);
  };

  // ============================================================
  //  TALKING TO AN ANIMAL
  // ============================================================

  // Every animal on the map answers the action button the same way, whether it
  // was bought from the Build menu, dealt to a farmstead, or simply walked out
  // of the NPC wardrobe onto a village street. Three things can be done with
  // one: take what it has ready, make a fuss of it, or open the panel on it.
  // Collect is offered only when there IS something ready.
  //
  // This replaces the event's own page for animals, so a wardrobe animal
  // carrying the stock Talk / Empathize slot menu does not offer to make small
  // talk with a goat.

  // The NPC name an event stands for, which is how the society and the animal
  // record both key it.
  function eventNpcName(event) {
    if (!event) return "";
    const data = $dataMap && $dataMap.events ? $dataMap.events[event.eventId()] : null;
    return (data && data.name) || "";
  }

  // The wardrobe sheet this event is drawn with, as an NPCs.json key.
  function eventSpriteKey(event) {
    const name = event && event.characterName ? event.characterName() : "";
    if (!name) return null;
    const data = npcWardrobe();
    if (data[name]) return name;
    // Sheets are stored with their folder ("Animals/!$Dog1"); an event carries
    // the same string, but a stray one may be missing the folder.
    const base = String(name).split("/").pop();
    for (const key of Object.keys(data)) {
      if (key.split("/").pop() === base) return key;
    }
    return null;
  }

  // Is there an animal behind this event at all?
  function animalBehind(event) {
    if (!event) return null;
    const placed = findPlacementByEvent(event);
    if (placed) return placed;
    const legacy = getRecord($gameMap.mapId(), event.eventId());
    if (legacy && legacy.animalId) return legacy;
    const sprite = eventSpriteKey(event);
    if (!sprite || !breedOfSprite(sprite)) return null;
    const name = eventNpcName(event);
    return name ? recordForNpc(name, sprite) : null;
  }

  // Opens the panel on the NPC this event stands for.
  function openEmpathizeOn(event) {
    const EM = window.NPCEmpathize;
    if (!EM || !EM.Scene_NPCEmpathize) return false;
    const name = eventNpcName(event);
    EM.Scene_NPCEmpathize._eventId = event.eventId();
    EM.Scene_NPCEmpathize._npcName = name;
    EM.Scene_NPCEmpathize._actorId = null;
    EM.Scene_NPCEmpathize._entity = null;
    SceneManager.push(EM.Scene_NPCEmpathize);
    return true;
  }

  // What the leader does with their hands while they are at it. Making a fuss
  // of an animal is something a person DOES, not only something the animal
  // answers, so the beat is written from both ends: this half is spoken by the
  // party, the half below by the animal.
  function pettingLine(rec) {
    const pool = T && T.pool ? T.pool('AnimalGrowth.petting') : [];
    if (!pool.length) return "";
    const line = pool[Math.floor(Math.random() * pool.length)];
    return String(line).split('{animal}').join(rec.animalId);
  }

  // The animal's own half: the company it is worth, and a word about how it is
  // doing if there is nothing else to say.
  function pettingReply(rec, def) {
    const company = keepCompany(rec, def);
    if (company) return T('AnimalGrowth.company', { animal: rec.animalId });
    if (getStage(rec, def) === "baby") {
      const remaining = Math.max(0,
        def.growthDays * MINUTES_PER_DAY - (rec.effectiveGrowthMinutes || 0));
      return T.n('AnimalGrowth.youngAnimal',
        Math.ceil(remaining / MINUTES_PER_DAY), { animal: rec.animalId });
    }
    return T('AnimalGrowth.pleased', { animal: rec.animalId });
  }

  // Both halves on stage at once, the way NPC/DialogueSystem stages every other
  // conversation on the map: the leader's portrait on the left saying what they
  // are doing, the animal's on the right answering it.
  function sayTogether(event, mine, reply) {
    const NT = window.NPCTalk;
    if (!event || !NT || typeof NT.exchange !== "function") return false;
    if (!mine || !reply) return false;
    const leader = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
    try {
      return NT.exchange([
        NT.playerStep(leader, mine),
        NT.eventStep(event, eventNpcName(event), reply),
      ]);
    } catch (e) {
      console.error("[AnimalGrowth] petting exchange failed", e);
      return false;
    }
  }

  // Making a fuss of an animal.
  function petAnimal(rec, def, event) {
    updateRecordGrowth(rec);
    const reply = pettingReply(rec, def);
    const mine  = pettingLine(rec);
    if (sayTogether(event, mine, reply)) return;
    // Nowhere to stage it (no bust manager, no event behind the animal): the
    // bare lines, the way it always read.
    window.skipLocalization = true;
    if (mine) $gameMessage.add(mine);
    $gameMessage.add(reply);
    window.skipLocalization = false;
  }

  function collectFromAnimal(rec, def) {
    updateRecordGrowth(rec);
    const items = collectProduce(rec, def);
    if (items.length) {
      SoundManager.playShop();
      reportCollected(items);
      return;
    }
    window.skipLocalization = true;
    $gameMessage.add(isHungry(rec)
      ? T('AnimalGrowth.tooHungryToProduce', { animal: rec.animalId })
      : T('AnimalGrowth.nothingReady', { animal: rec.animalId }));
    window.skipLocalization = false;
  }

  // The menu itself. Built rather than authored, so an animal added to the
  // wardrobe tomorrow offers the same three things with no event to edit.
  function showAnimalMenu(event) {
    const rec = animalBehind(event);
    const def = rec && ANIMAL_DB[rec.animalId];
    if (!rec || !def) return false;
    updateRecordGrowth(rec);

    const ids = [];
    const labels = [];
    if (hasReadyProduce(rec, def)) { ids.push("collect"); labels.push(T('AnimalGrowth.actionCollect')); }
    ids.push("pet");       labels.push(T('AnimalGrowth.actionPet'));
    ids.push("empathize"); labels.push(T('AnimalGrowth.actionEmpathize'));
    ids.push("cancel");    labels.push(T('AnimalGrowth.actionCancel'));

    $gameMessage.setChoices(labels, 0, ids.length - 1);
    $gameMessage.setChoiceBackground(0);
    $gameMessage.setChoicePositionType(2);
    $gameMessage.setChoiceCallback((n) => {
      const id = ids[n];
      if (id === "empathize") { openEmpathizeOn(event); return; }
      if (id !== "collect" && id !== "pet") return;
      // The choice is answered from inside the box that asked it, and that box
      // clears the message on its way out: anything said here is wiped before a
      // single frame of it is drawn, which is why Pet used to look like it did
      // nothing at all. So the answer waits for the frame after the close.
      setTimeout(() => {
        try {
          if (id === "collect") collectFromAnimal(rec, def);
          else                  petAnimal(rec, def, event);
        } catch (e) { console.error("[AnimalGrowth] animal menu", e); }
      }, 0);
    });
    return true;
  }

  // An animal's own page never runs: the menu above is what the action button
  // reaches. A bought animal's slot event has nothing on its page anyway, and a
  // wardrobe animal's stock Talk / Empathize slot would otherwise try to make
  // conversation with a goat.
  const _Game_Event_start = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    if (!$gameMap.isEventRunning() && !$gameMessage.isBusy() && animalBehind(this)) {
      this.turnTowardPlayer();
      if (showAnimalMenu(this)) { this._starting = false; return; }
    }
    _Game_Event_start.call(this);
  };

  // ============================================================
  //  PLUGIN COMMANDS
  // ============================================================

  // Buying moved into the Build menu, so both legacy commands now just open it
  // on the Animals tab.
  function openAnimalsTab() {
    const fs = window.FurnitureSystem;
    if (fs && typeof fs.openBuildMenu === "function" && fs.openBuildMenu("animals")) return;
    window.skipLocalization = true;
    $gameMessage.add(T('AnimalGrowth.cannotKeep'));
    window.skipLocalization = false;
  }

  PluginManager.registerCommand(pluginName, "AnimalMenu", openAnimalsTab);
  PluginManager.registerCommand(pluginName, "BuyAnimal", openAnimalsTab);

  PluginManager.registerCommand(pluginName, "SellAnimal", function () {
    const eventId = this.eventId();
    const mapId = $gameMap.mapId();
    updateGrowth(mapId, eventId);
    const rec = getRecord(mapId, eventId);
    if (!rec || !rec.animalId) {
      window.skipLocalization = true;
      $gameMessage.add(T('AnimalGrowth.noAnimalToSell'));
      window.skipLocalization = false;
      return;
    }
    const def = ANIMAL_DB[rec.animalId];
    const val = sellValueOf(rec, def);
    $gameParty.gainGold(val);
    SoundManager.playShop();
    window.skipLocalization = true;
    $gameMessage.add(T('AnimalGrowth.sold', { animal: rec.animalId, amount: (val / 100).toFixed(2) }));
    window.skipLocalization = false;
    deleteRecord(mapId, eventId);
    const ev = $gameMap.event(eventId);
    if (ev) applySprite(ev, null);
  });

  PluginManager.registerCommand(pluginName, "CollectProduce", function () {
    const eventId = this.eventId();
    const mapId = $gameMap.mapId();
    updateGrowth(mapId, eventId);
    const rec = getRecord(mapId, eventId);
    if (!rec || !rec.animalId) return;
    const def = ANIMAL_DB[rec.animalId];
    if (!def) return;
    const items = collectProduce(rec, def);
    const company = keepCompany(rec, def);
    if (items.length > 0) {
      SoundManager.playShop();
      reportCollected(items);
    } else if (!company) {
      window.skipLocalization = true;
      $gameMessage.add(T('AnimalGrowth.nothingToCollect'));
      window.skipLocalization = false;
    }
    if (company) reportCompany(rec.animalId);
    // Saved either way: keepCompany stamps the record even when there was
    // nothing to collect.
    saveRecord(mapId, eventId, rec);
  });

  PluginManager.registerCommand(pluginName, "RemoveAnimal", function () {
    const eventId = this.eventId();
    const mapId = $gameMap.mapId();
    const rec = getRecord(mapId, eventId);
    if (!rec || !rec.animalId) return;
    deleteRecord(mapId, eventId);
    const ev = $gameMap.event(eventId);
    if (ev) applySprite(ev, null);
  });

  // Talking to a placed animal: hand over anything it has ready, otherwise
  // report how it is doing.
  PluginManager.registerCommand(pluginName, "InteractAnimal", function (args) {
    const found = findPlacement(args && args.uid);
    if (!found) return;
    const rec = found.rec;
    const def = ANIMAL_DB[rec.animalId];
    if (!def) return;
    updateRecordGrowth(rec);
    const items = collectProduce(rec, def);
    // Company is paid whatever else happened: an animal with nothing ready is
    // still worth going to see, and one that produces nothing at all is worth
    // going to see for that reason alone.
    const company = keepCompany(rec, def);
    if (items.length > 0) {
      SoundManager.playShop();
      reportCollected(items);
      if (company) reportCompany(rec.animalId);
      return;
    }
    if (company) {
      reportCompany(rec.animalId);
      return;
    }
    window.skipLocalization = true;
    if (rec.stage === "baby") {
      const remaining = Math.max(0, def.growthDays * MINUTES_PER_DAY - (rec.effectiveGrowthMinutes || 0));
      const days = Math.ceil(remaining / MINUTES_PER_DAY);
      $gameMessage.add(T.n('AnimalGrowth.youngAnimal', days, { animal: rec.animalId }));
    } else if ((def.produces || []).length === 0) {
      $gameMessage.add(T('AnimalGrowth.pleased', { animal: rec.animalId }));
    } else {
      $gameMessage.add(T('AnimalGrowth.nothingReady', { animal: rec.animalId }));
    }
    window.skipLocalization = false;
  });

  // ============================================================
  //  ANY ANIMAL, NOT ONLY A BOUGHT ONE
  // ============================================================

  // A hen dealt by the NPC wardrobe is the same hen the Build menu sells: it
  // has a breed, it grows, it gets hungry and it lays. What it does not have is
  // a placement record, because nobody bought it. One is minted for it the
  // first time anybody looks, keyed by the NPC's own name and stored beside the
  // placements, so its timers persist and its produce cannot be farmed twice.
  //
  // Seeded off the name, so the same animal is the same age in every savegame
  // of this world, and marked `wild` so it never reaches the portfolio: it is
  // not the party's property, it is just an animal standing there.
  function animalNpcRecords() {
    if (!$gameSystem._animalNpcRecords) $gameSystem._animalNpcRecords = {};
    return $gameSystem._animalNpcRecords;
  }

  function seedFrom(text) {
    let h = 2166136261 >>> 0;
    const str = String(text == null ? "" : text);
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h >>> 0;
  }

  // The record for an animal NPC, minting one if this is the first look.
  // Returns null for anybody whose sheet is not an animal the wardrobe knows.
  function recordForNpc(npcName, spriteKey) {
    if (!npcName || !$gameSystem) return null;
    const store = animalNpcRecords();
    const existing = store[npcName];
    if (existing && existing.animalId && ANIMAL_DB[existing.animalId]) {
      updateRecordGrowth(existing);
      return existing;
    }
    const breed = breedOfSprite(spriteKey);
    const def = breed ? ANIMAL_DB[breed] : null;
    if (!def) return null;

    // The sheet says which it is. A sheet drawn as a chick IS a chick, so it
    // is born today and grows up; an adult sheet is back-dated the same way a
    // bought adult is, off the name rather than off the dice, so it does not
    // change age every time the panel is opened.
    const seed = seedFrom(npcName);
    const baby = def.hasBaby && stageOfSprite(spriteKey) === "baby";
    const now = gameMinutes();
    const grown = Math.max(def.growthDays || 0, 1);
    const life = lifespanDaysOf(def);
    const ceiling = Math.max(grown + 1, Math.floor(life * 0.5));
    const ageDays = baby ? 0 : grown + (seed % (ceiling - grown));

    const produceTimers = {};
    if (!baby) {
      // Staggered off the name so a yard full of hens does not lay in unison.
      for (let i = 0; i < (def.produces || []).length; i++) {
        const interval = (def.produces[i].interval || 1) * MINUTES_PER_DAY;
        produceTimers[`p${i}`] = now - ((seed >>> (i * 3)) % interval);
      }
    }
    const rec = {
      animalId: breed,
      npcName,
      wild: true,
      boughtAt: now,
      bornAt: now - ageDays * MINUTES_PER_DAY,
      fedAt: now,
      lastUpdateMinutes: now,
      effectiveGrowthMinutes: baby ? 0 : def.growthDays * MINUTES_PER_DAY,
      stage: baby ? "baby" : "adult",
      adultSprite: stageOfSprite(spriteKey) === "adult" ? spriteKey : def.adultSprites[0],
      babySprite: baby ? spriteKey : null,
      paid: 0,
      produceTimers,
    };
    store[npcName] = rec;
    return rec;
  }

  // Everything a panel needs to draw an animal, whether it was bought, dealt to
  // a farmstead or simply walked out of the NPC wardrobe. Percentages are whole
  // numbers so a bar can be drawn straight off them.
  function animalStatus(rec) {
    const def = rec && ANIMAL_DB[rec.animalId];
    if (!def) return null;
    updateRecordGrowth(rec);
    const now = gameMinutes();
    const stage = getStage(rec, def);
    const growth = calcGrowthProgress(rec, def);
    const hungry = isHungry(rec);
    const produces = (def.produces || []).map((prod, i) => {
      const item = $dataItems ? $dataItems[prod.itemId] : null;
      const timer = rec.produceTimers ? rec.produceTimers[`p${i}`] : undefined;
      const needed = prod.interval * MINUTES_PER_DAY;
      const elapsed = timer === undefined ? 0 : Math.max(0, now - timer);
      return {
        itemId: prod.itemId,
        iconIndex: item ? item.iconIndex : 0,
        name: item ? item.name : T('AnimalGrowth.itemNumbered', { id: prod.itemId }),
        yieldMin: prod.yieldMin, yieldMax: prod.yieldMax,
        intervalDays: prod.interval,
        // How far along this batch is. A hungry animal's batch is frozen where
        // it stands rather than counted up to a delivery that will not come.
        pct: Math.max(0, Math.min(100, Math.round((elapsed / needed) * 100))),
        ready: stage === "adult" && !hungry && timer !== undefined && elapsed >= needed,
        daysLeft: Math.max(0, Math.ceil((needed - elapsed) / MINUTES_PER_DAY)),
      };
    });
    return {
      animalId: rec.animalId,
      breed: rec.animalId,
      stage,
      stageName: STAGE_NAMES[stage] || stage,
      hasBaby: !!def.hasBaby,
      growthPct: Math.round(growth * 100),
      daysToAdult: Math.max(0, Math.ceil(
        (def.growthDays * MINUTES_PER_DAY - (rec.effectiveGrowthMinutes || 0)) / MINUTES_PER_DAY)),
      nutritionPct: nutritionOf(rec),
      hungry,
      ageDays: Math.floor(ageDaysOf(rec)),
      ageLabel: ageLabelOf(rec),
      lifespanDays: lifespanDaysOf(def),
      companyValue: def.company || 0,
      produces,
      hasReady: hasReadyProduce(rec, def),
      value: sellValueOf(rec, def),
      wild: !!rec.wild,
      // Whose it is, and what it would take to talk it away from them. A wild
      // animal has no owner and is simply asked to come along.
      owner: ownerOf(rec),
      owned: isOwnedByNpc(rec),
      joinChance: joinChanceFor(rec, def),
    };
  }

  // ---- TALKING ONE INTO COMING ALONG --------------------------------------
  // The base odds an animal follows the party, before anything about the person
  // asking is taken into account. Both numbers live on the animal's own
  // wardrobe entry: `wildJoinChance` for one that belongs to nobody, and
  // `ownedJoinChance` for talking somebody's animal away from them, which is
  // always the harder ask and, for a dog, very nearly impossible , a dog knows
  // exactly whose it is.
  const JOIN_CHANCE_FALLBACK_WILD = 10;
  const JOIN_CHANCE_FALLBACK_OWNED = 5;

  function growthBlockOf(rec, def) {
    const sprite = getCurrentSprite(rec, def) ||
      (def && (def.adultSprites[0] || def.babySprites[0]));
    const entry = sprite ? npcWardrobe()[sprite] : null;
    return (entry && entry.animalGrowth) || null;
  }

  function joinChanceFor(rec, def) {
    const g = growthBlockOf(rec, def);
    if (isOwnedByNpc(rec)) {
      return (g && g.ownedJoinChance != null) ? g.ownedJoinChance : JOIN_CHANCE_FALLBACK_OWNED;
    }
    return (g && g.wildJoinChance != null) ? g.wildJoinChance : JOIN_CHANCE_FALLBACK_WILD;
  }

  // An animal that has left with the party. Whatever it was , bought stock, a
  // farm's own, or an animal NPC the wardrobe dealt , it stops being on this
  // square: the placement is dropped, the NPC record is forgotten, and the
  // event it was standing in is erased so it is not still grazing behind you.
  function releaseAnimal(rec, eventId) {
    if (!rec) return false;
    if (rec.uid != null && findPlacement(rec.uid)) {
      removePlacement(rec.uid);
    } else if (rec.npcName) {
      delete animalNpcRecords()[rec.npcName];
    }
    const ev = (eventId != null && $gameMap) ? $gameMap.event(eventId) : null;
    if (ev) {
      ev.erase();
      // The wardrobe deals this square's population afresh on every visit, so
      // an erased animal NPC stays gone only while the map is loaded; its
      // record is what is really gone, and without one it is an ordinary
      // beast again rather than the party's pet standing in two places.
      if ($gameSelfSwitches) $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), "A"], true);
    }
    return true;
  }

  // The record behind whoever the panel is looking at, in one call  // The record behind whoever the panel is looking at, in one call: a bought or
  // farmstead animal standing on this very tile first, an animal NPC dealt by
  // the wardrobe second. `spriteKey` is that NPC's sheet.
  function recordForAnimal(npcName, spriteKey, event) {
    if (event) {
      const placed = findPlacementByEvent(event);
      if (placed) { updateRecordGrowth(placed); return placed; }
      const legacy = getRecord($gameMap.mapId(), event.eventId());
      if (legacy && legacy.animalId) { updateRecordGrowth(legacy); return legacy; }
    }
    return recordForNpc(npcName, spriteKey);
  }

  // The placement whose uid this event was spawned for, if any.
  function findPlacementByEvent(event) {
    const uid = event && event._animalUid;
    if (uid == null) return null;
    const found = findPlacement(uid);
    return found ? found.rec : null;
  }

  // Public API for NPCSimulationCore, FurnitureSystem, AssetsMenu and others
  window.AnimalGrowthSystem = {
    ANIMAL_DB,
    STAGE_NAMES,
    STAGE_DIRS,
    MINUTES_PER_DAY,
    getRecord:          (mapId, eventId) => getRecord(mapId, eventId),
    saveRecord:         (mapId, eventId, rec) => saveRecord(mapId, eventId, rec),
    deleteRecord:       (mapId, eventId) => deleteRecord(mapId, eventId),
    updateGrowth:       (mapId, eventId) => updateGrowth(mapId, eventId),
    hasReadyProduce:    (rec, def) => hasReadyProduce(rec, def),
    collectProduce:     (rec, def) => collectProduce(rec, def),
    calcGrowthProgress: (rec, def) => calcGrowthProgress(rec, def),
    getCurrentSprite:   (rec, def) => getCurrentSprite(rec, def),
    gameMinutes:        () => gameMinutes(),
    randomPick:         (arr) => randomPick(arr),
    hasFreeSlot:        () => hasFreeSlot(),
    applySprite:        (event, rec) => applySprite(event, rec),
    // Build menu services
    buyCostOf:          (def, stage) => buyCostOf(def, stage),
    canPlaceAnimalAt:   (x, y) => canPlaceAnimalAt(x, y),
    placeAnimal:        (animalId, stage, x, y) => placeAnimal(animalId, stage, x, y),
    drawSpriteOnCanvas: (cv, sprite, stage) => drawSpriteOnCanvas(cv, sprite, stage),
    frameBitmap:        (sprite, stage) => frameBitmap(sprite, stage),
    // Assets menu services
    listOwnedAnimals:   () => listOwnedAnimals(),
    isPartyOwned:       (rec) => isPartyOwned(rec),
    collectFromPlacement: (uid) => collectFromPlacement(uid),
    sellPlacement:      (uid) => sellPlacement(uid),
    petPlacement:       (uid) => petPlacement(uid),
    mapDisplayName:     (key) => mapDisplayName(key),
    // The action-button menu, for a caller that wants to raise it itself
    showAnimalMenu:     (event) => showAnimalMenu(event),
    // Ownership
    ensureFarmOwner:    () => ensureFarmOwner(),
    farmOwnerName:      (wx, wy) => farmOwnerName(wx, wy),
    ownerOf:            (rec) => ownerOf(rec),
    isOwnedByNpc:       (rec) => isOwnedByNpc(rec),
    joinChanceFor:      (rec, def) => joinChanceFor(rec, def),
    releaseAnimal:      (rec, eventId) => releaseAnimal(rec, eventId),
    animalBehind:       (event) => animalBehind(event),
    // Any animal at all, bought or not
    breedOfSprite:      (spriteKey) => breedOfSprite(spriteKey),
    stageOfSprite:      (spriteKey) => stageOfSprite(spriteKey),
    isRidableSprite:    (spriteKey) => isRidableSprite(spriteKey),
    isAnimalSprite:     (spriteKey) => !!breedOfSprite(spriteKey),
    recordForNpc:       (npcName, spriteKey) => recordForNpc(npcName, spriteKey),
    recordForAnimal:    (npcName, spriteKey, event) => recordForAnimal(npcName, spriteKey, event),
    animalStatus:       (rec) => animalStatus(rec),
    statusFor:          (npcName, spriteKey, event) =>
                          animalStatus(recordForAnimal(npcName, spriteKey, event)),
    // Nutrition, age and the two actions a panel offers
    nutritionOf:        (rec) => nutritionOf(rec),
    isHungry:           (rec) => isHungry(rec),
    feedAnimal:         (rec) => feedAnimal(rec),
    ageDaysOf:          (rec) => ageDaysOf(rec),
    ageLabelOf:         (rec) => ageLabelOf(rec),
    keepCompany:        (rec, def) => keepCompany(rec, def),
    reportCollected:    (items) => reportCollected(items),
  };

})();
