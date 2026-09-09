/*:
 * @target MZ
 * @plugindesc Origins of the party: starting supplies, starting money, per-origin loadouts and the world placement each origin performs
 * @author Omni-Lex
 * @orderBefore CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js, which had grown to carry the whole
 * wizard in one file. This module owns one subject: where a party starts.
 *
 *   - the staples every new party is handed once (food, spare gear),
 *   - the money a class, its traits and its wealth tier add up to,
 *   - ORIGIN_LOADOUTS: what each origin hands out, rolled or fixed,
 *   - the start<Origin>Origin() calls that place the party in the world.
 *
 * Everything the wizard needs is published on window.CCOrigins; the
 * orchestrator destructures it by name, so call sites read as they did
 * while the code lived in one file.
 *
 * DO NOT call this plugin directly.
 */

(() => {
  "use strict";

  // The wizard scene, its step table and the creation-mode stamp are the
  // orchestrator's (CharacterCreation.js, which loads after this file), so
  // they are read off the shared kit at call time rather than captured here.
  const ccKit = () => window.CCKit || {};

  // --- Starting supplies -------------------------------------------------
  // Handed out once, the first time a party finishes creation: cheap healing
  // food/consumables, plus a spare weapon for every member and a couple of
  // spare armor pieces so the party always has a backup to fall back on.
  // Low-price healing food / consumables: [itemId, quantity].
  const STARTER_CONSUMABLES = [
    [3, 3],   // Acetaminophen Tablets (heals 20% HP)
    [16, 2],  // Pseudoephedrine Tabs (heals 15% HP)
  ];
  // Spare armor pieces (cheap, low weight): [armorId, quantity].
  const STARTER_SPARE_ARMORS = [
    [4, 1], // Motion Defense Hat
    [2, 1], // Siege Breaker Armor
  ];

  // --- The three staples every party opens on ----------------------------
  // Whatever the world, the class or the dossier, a party starts able to heal,
  // to cast and to eat, and starts with those three things one keypress away:
  // the kit below is granted here and bound to hotbar slots 1, 2 and 3. The
  // food is one type, rolled per playthrough, so two worlds do not open on the
  // same packed lunch.
  const STARTER_HEALING_POTION = [648, 6]; // Health Potion
  const STARTER_MANA_TONIC = [21, 3];      // Mana Tonic
  const STARTER_FOOD_QTY = 6;
  // The story mode starts on four different cheap foods instead of one.
  const STORY_STARTER_FOOD_TYPES = 4;
  // Ceiling on the rolled food, in gold (100 gold = €1): a starting meal, not a
  // delicacy. Keeps the roll among the mundane end of the Food category.
  const STARTER_FOOD_PRICE_CAP = 300;
  // A packed lunch has to be worth eating: below this the Food category is
  // water, garnishes and seasonings rather than a meal.
  const STARTER_FOOD_MIN_CALORIES = 50;
  // Used when the roll finds nothing (a stripped Items.json, a bad filter).
  const STARTER_FOOD_FALLBACK = [421, 423]; // Granola Bar, Bruised Apple

  /**
   * Every cheap, usable, hotbar-able Food item fit to open a game on.
   *
   * Beyond price this rules out three kinds of Food entry that are not a meal:
   * raw produce (anything carrying a <Forage:> tag, i.e. picked, not prepared),
   * garnishes and drinking water (too few calories to count), and anything that
   * inflicts a state when eaten (raw meat and its food poisoning).
   * @returns {array} $dataItems entries (possibly empty)
   */
  function starterFoodPool() {
    const utils = window.ItemSystemUtils;
    return $dataItems.filter((item) => {
      if (!item || !item.name || !item.name.trim()) return false;
      // Slots hold item ids and the bar only takes usable items, so the roll
      // has to obey the same rule the star does.
      if (item.occasion !== 0 && item.occasion !== 2) return false;
      if ((item.price || 0) > STARTER_FOOD_PRICE_CAP) return false;
      const isFood = utils && utils.isFoodItem
        ? utils.isFoodItem(item)
        : /<category:Food>/i.test(item.note || ""); // i18n-ignore: item-category tag
      if (!isFood) return false;
      const note = item.note || "";
      if (/<Forage:/i.test(note)) return false;
      const calories = note.match(/<calories:\s*([\d.]+)>/i);
      if (!calories || Number(calories[1]) < STARTER_FOOD_MIN_CALORIES) return false;
      // Effect code 21 is "add state" - a food that does that is a mistake
      // waiting to happen on slot 3.
      return !(item.effects || []).some((effect) => effect && effect.code === 21);
    });
  }

  /**
   * The one food type this playthrough opens on.
   * @returns {object|null} An $dataItems entry, or null if even the fallback is missing
   */
  function rollStarterFood() {
    return rollStarterFoods(1)[0] || null;
  }

  /**
   * Roll up to `count` DIFFERENT foods out of the same pool.
   * @param {number} count how many distinct types to draw
   * @returns {array} $dataItems entries (fewer than `count` if the pool is small)
   */
  function rollStarterFoods(count) {
    let pool = starterFoodPool();
    if (pool.length === 0) {
      pool = STARTER_FOOD_FALLBACK.map((id) => $dataItems[id]).filter(Boolean);
    }
    const picks = [];
    const bag = pool.slice();
    while (picks.length < count && bag.length > 0) {
      picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }
    return picks;
  }

  // The story mode opens on a fuller pantry: four different cheap meals rather
  // than one packed lunch, so the tutorial run has something to eat while it
  // learns what hunger is.
  function isStoryModeStart() {
    if (typeof Scene_CharacterCreation !== "undefined" && Scene_CharacterCreation._storyMode) return true;
    return !!($gameSwitches && $gameSwitches.value(100));
  }

  /**
   * Grant the three staples and bind them to hotbar slots 1-3.
   * The bar is ItemSystemHotbar's; a build without it simply gets the items.
   */
  function giveStarterStaples() {
    const bind = [];
    [STARTER_HEALING_POTION, STARTER_MANA_TONIC].forEach(([id, qty]) => {
      const item = $dataItems[id];
      if (!item) {
        console.warn(`CharacterCreation: starter staple ${id} not found.`);
        bind.push(null);
        return;
      }
      $gameParty.gainItem(item, qty);
      bind.push(item);
    });

    const foods = rollStarterFoods(isStoryModeStart() ? STORY_STARTER_FOOD_TYPES : 1);
    foods.forEach((food) => $gameParty.gainItem(food, STARTER_FOOD_QTY));
    bind.push(foods[0] || null);

    const hotbar = window.ItemHotbar;
    if (!hotbar) return;
    bind.forEach((item, slot) => {
      if (item) hotbar.assign(slot, item);
    });
  }

  function giveStartingSupplies() {
    if ($gameSystem._ccStarterSuppliesGiven) return;
    $gameSystem._ccStarterSuppliesGiven = true;

    // Potions, tonics and the rolled food, on hotbar 1-3.
    giveStarterStaples();

    // Healing food / consumables.
    STARTER_CONSUMABLES.forEach(([id, qty]) => {
      const item = $dataItems[id];
      if (item) $gameParty.gainItem(item, qty);
    });

    // One spare weapon per member, drawn from the member's class weapon pool
    // (the same limited pools used to equip the primary weapon).
    const SE = window.StartingEquipment;
    if (SE && SE.getCompatibleWeaponTypes && SE.getCompatibleWeapons) {
      $gameParty.members().forEach((actor) => {
        const types = SE.getCompatibleWeaponTypes(actor._classId);
        const pool = SE.getCompatibleWeapons(types);
        if (pool.length > 0) {
          const spare = pool[Math.floor(Math.random() * pool.length)];
          if (spare) $gameParty.gainItem(spare, 1);
        }
      });
    }

    // Spare equipment.
    STARTER_SPARE_ARMORS.forEach(([id, qty]) => {
      const armor = $dataArmors[id];
      if (armor) $gameParty.gainItem(armor, qty);
    });
  }

  // --- Starting money ----------------------------------------------------
  // Every party begins with a flat 100€ purse (100 gold = €1) on top of the
  // money each of its members brings in from their class <Money:> notetag and
  // from their traits (optional "money" field, in gold). Preset money is
  // applied by the preset step itself and simply adds to this.
  //
  // Handed out once, from markFirstCreationComplete (the end-of-creation hook),
  // so it lands after every class / trait / preset step no matter which path
  // the player took (full, normal, quick, random, creature, story mode, preset). Doing it
  // here instead of at class confirmation also means the preset step's gold
  // wipe can no longer swallow it.
  // The class bonus is the raw <Money:> value: it used to be tripled (with a
  // 3000 gold floor) because only the first member ever received it, which is
  // no longer the case now that every member is paid.
  const CC_BASE_START_EUROS = 100;
  const CC_BASE_START_GOLD = CC_BASE_START_EUROS * 100; // 100 gold = €1

  // What the wealth band a character was raised in is worth on the day they
  // leave home, in gold, indexed by tier (destitute .. wealthy). It is money
  // they BRING, so it is added to the party purse alongside their class's
  // <Money:> and their traits', and every member pays in their own.
  //
  // The top of the band sits about where the richest classes do (CEO, €10,000):
  // being born to money is worth as much as having made it, and no more.
  const CC_WEALTH_START_GOLD = [0, 25000, 100000, 300000, 1000000];

  function classStartingMoney(classId) {
    const classData = $dataClasses[classId];
    const match = classData && classData.note && classData.note.match(/<Money:(\d+)>/i);
    return match ? Number(match[1]) : 0;
  }

  // A picked build is written to actor._selectedTraits as whole trait objects
  // by the trait plugin and as bare trait ids by the boards that pick them, and
  // reading it raw is how the two halves of creation stopped recognising each
  // other's picks: the board saw "[object Object]" where an id should be, so a
  // trait could be bought and never sold back. Nothing reads the field
  // directly any more, it comes through one of these two.
  function selectedTraitObjects(actor) {
    const bank = (window.Health && window.Health.Traits) || [];
    return ((actor && actor._selectedTraits) || [])
      .map((entry) => (entry && typeof entry === "object")
        ? entry
        : bank.find((t) => String(t.id) === String(entry)))
      .filter(Boolean);
  }

  function selectedTraitIds(actor) {
    return ((actor && actor._selectedTraits) || [])
      .map((entry) => (entry && typeof entry === "object") ? entry.id : entry)
      .filter((id) => id !== null && id !== undefined);
  }

  function traitStartingMoney(actor) {
    return selectedTraitObjects(actor).reduce((sum, trait) => sum + (Number(trait.money) || 0), 0);
  }

  // A member's wealth band, and what it pays in. Only the detailed editor asks
  // the question (profile.wealthTierChosen); a character who was never asked
  // brings nothing extra, so every other creation path is left exactly as it
  // was. The society store is read directly rather than through
  // NPCSocietyRegistry.getProfile, which would MINT a profile for a member who
  // has none , a whole rolled stranger, on the last step of creation, for an
  // answer that is only ever there when it was written by hand.
  function wealthStartingMoney(actor) {
    const society = $gameSystem && $gameSystem._npcSociety;
    const profile = actor && society ? society[actor.name()] : null;
    const tier = profile && profile.wealthTierChosen;
    if (tier == null) return 0;
    return CC_WEALTH_START_GOLD[Math.max(0, Math.min(4, tier))] || 0;
  }

  // What the chosen scenario adds to the party purse on top of what the
  // characters themselves bring. Read by giveStartingMoney (the actual grant)
  // and by the scenario dossier (the display), from the same table, so the
  // number promised on the dossier is always the number paid.
  function scenarioGoldBonus(originSymbol) {
    const additions = {
      "origin_train": 0,
      "origin_cargo": 50000,
      "origin_castaway": 10000,
      "origin_camper": 150000,
      "origin_ceo": CEO_START_GOLD,
      "origin_augmented": 25000,
      "origin_underground": 100000,
      "origin_random": 100000
    };
    return additions[originSymbol] || 0;
  }

  function giveStartingMoney() {
    if ($gameSystem._ccStartingMoneyGiven) return;
    $gameSystem._ccStartingMoneyGiven = true;

    let gold = CC_BASE_START_GOLD + scenarioGoldBonus($gameSystem._ccOriginSymbol);
    $gameParty.members().forEach((actor) => {
      // A non-sentient creature (one of the creature classes, see NPCCreature)
      // brings nothing into the purse. It was never asked its wealth band , the
      // detailed editor does not offer the row to a beast , and it has no use
      // for what its class or its traits would otherwise have paid in. All
      // three contributions are dropped rather than only the band, so a
      // character switched to a creature class after the fact cannot carry a
      // banker's purse in on four legs.
      const NC = window.NPCCreature;
      if (NC && NC.isNonSentientActor(actor)) return;
      gold += classStartingMoney(actor._classId) +
        traitStartingMoney(actor) +
        wealthStartingMoney(actor);
    });
    $gameParty.gainGold(gold);
  }

  // The detailed editor names each wealth band with what it pays in, so the row
  // and the payout are read off one table.
  window.CharacterCreationMoney = {
    wealthGold(tier) {
      return CC_WEALTH_START_GOLD[Math.max(0, Math.min(4, Number(tier) || 0))] || 0;
    },
    formatWealth(tier) {
      const gold = this.wealthGold(tier);
      const shared = window.NPCShared;
      return shared && shared.formatMoney ? shared.formatMoney(gold) : String(gold);
    },
  };

  // Starting items handed out by the origins (see ORIGIN_LOADOUTS below).
  const ITEM_LIMINAL_CUFFS = 111; // camper
  const ITEM_BIKE = 131;          // bike
  const ITEM_CAR = 164;           // car
  const ITEM_LOW_ORBIT_PIN = 166; // space
  const ITEM_INFLATABLE_DINGHY = 167; // stranded
  const ITEM_FISHING_ROD = 123;   // stranded
  const ITEM_LOCAL_MAP = 161;     // train
  const ITEM_LOCKPICK = 374;      // criminal
  const ITEM_WRISTWATCH = 130;    // CEO
  const ITEM_INVITATION_LETTER = 713; // train

  // The train kit: the traveller's supplies. No other origin gets this set.
  const ITEM_HEALTH_POTION = 648;   // 800 HP
  const ITEM_PAINKILLERS = 3;       // Acetaminophen Tablets, 20% max HP
  const ITEM_MANA_POTION = 651;     // 500 MP
  const ITEM_MEDICAL_SPRAY = 19;    // removes every status ailment
  const ITEM_GRANOLA_BAR = 421;     // 150 cal
  const ITEM_BOTTLED_WATER = 418;
  const ITEM_BEDROLL = 125;
  const ITEM_LANTERN = 121;
  const ITEM_TRAVEL_BACKPACK = 129;

  // Thematic extras.
  const ITEM_WATER_BOTTLE = 120;      // bike
  const ITEM_STAR_MAP = 163;          // space
  const ITEM_PILOT_PDA = 162;         // space
  const ITEM_UV_SUNGLASSES = 142;     // space
  const ITEM_PORTABLE_CHARGER = 122;  // space / bunker
  const ITEM_NANITES = 59;            // space (Regeneration Nanites)
  const ITEM_ELECTROLYTE_POWDER = 17; // space / bunker
  const ITEM_FUEL_TANK = 146;         // camper / car / crash
  const ITEM_COOKING_POT = 807;       // camper / stranded / faction leader
  const ITEM_UTENSIL_SET = 809;       // camper
  const ITEM_SLEEPING_BAG = 815;      // camper (Comfort Sleeping Bag)
  const ITEM_MP3_PLAYER = 133;        // camper
  const ITEM_INSTANT_NOODLES = 433;   // camper
  const ITEM_STRONG_COFFEE = 459;     // camper
  const ITEM_IBUPROFEN = 25;          // camper / faction leader
  const ITEM_GPS = 137;               // car
  const ITEM_EARBUDS = 154;           // car
  const ITEM_COFFEE_CUP = 528;        // car
  const ITEM_POTATO_CRISPS = 441;     // car
  const ITEM_FIZZY_SODA = 442;        // car
  const ITEM_OINTMENT = 11;           // car / deserter (Bacitracin)
  const ITEM_SEWING_KIT = 132;        // bike (patch kit)
  const ITEM_COMPACT_UMBRELLA = 152;  // bike
  const ITEM_PROTEIN_BAR = 431;       // bike / criminal
  const ITEM_MIXED_NUTS = 466;        // bike
  const ITEM_MUSCLE_RUB = 15;         // bike (Methyl Salicylate)
  const ITEM_SHOVEL = 138;            // empty lot / bunker
  const ITEM_CRAFTSMAN_BACKPACK = 151; // empty lot
  const ITEM_TOOLMAKER_MULTITOOL = 156; // empty lot
  const ITEM_CANNED_VEGETABLES = 435; // empty lot / bunker
  const ITEM_PORRIDGE = 428;          // empty lot
  const ITEM_CANDLE = 115;            // empty lot
  const ITEM_POCKET_NOTEBOOK = 127;   // mayor
  const ITEM_BALLPOINT_PEN = 113;     // mayor
  const ITEM_ORATORS_ELIXIR = 46;     // mayor
  const ITEM_FRESH_BREAD = 454;       // mayor
  const ITEM_CHEESE_WHEEL = 510;      // mayor
  const ITEM_AGED_WINE = 535;         // mayor
  const ITEM_CLIMBING_ROPE = 813;     // dungeon
  const ITEM_ROUTES_MAP = 159;        // dungeon (Omega tower routes)
  const ITEM_FLASHLIGHT = 136;        // dungeon / crash
  const ITEM_ELVEN_WAYBREAD = 646;    // dungeon / artifact heir
  const ITEM_WARNING_AMULET = 673;    // dungeon
  const ITEM_FAIRY_LANTERN = 812;     // dungeon
  const ITEM_BURNER_PHONE = 157;      // criminal
  const ITEM_ESCAPE_KIT = 808;        // criminal / deserter
  const ITEM_INVISIBLE_INK_PEN = 148; // criminal
  const ITEM_RED_COCAINE = 22;        // criminal
  const ITEM_JUMBO_COLA = 445;        // criminal
  const ITEM_VENISON_JERKY = 465;     // stranded
  const ITEM_SPRING_WATER = 429;      // stranded (also cures poison)
  const ITEM_WALKING_STICK = 806;     // stranded / deserter
  const ITEM_EMPTY_FLASK = 805;       // stranded / crash
  const ITEM_WILD_BERRIES = 448;      // stranded
  const ITEM_CANNED_MEAT = 452;       // bunker
  const ITEM_FIELD_RATION = 512;      // bunker / warlord / deserter
  const ITEM_CELLPHONE = 149;         // CEO
  const ITEM_DEADLINE_COFFEE = 564;   // CEO
  const ITEM_GOURMET_CHOCOLATE = 543; // CEO
  const ITEM_PREMIUM_WHISKEY = 572;   // CEO
  const ITEM_ENERGY_DRINK = 23;       // CEO
  const ITEM_RESONANCE_SCANNER = 139; // artifact heir
  const ITEM_TRAVEL_JOURNAL = 128;    // artifact heir
  const ITEM_MEMORY_AMBER = 675;      // artifact heir
  const ITEM_LENS_OF_REVELATION = 679; // artifact heir
  const ITEM_CALMING_TEA = 434;       // artifact heir
  const ITEM_MULTITOOL = 814;         // crash / warlord
  const ITEM_RATION_BAR = 463;        // crash (Nutrient-Fortified Bar)
  const ITEM_REGENERATION_HERB = 42;  // crash
  const ITEM_WHETSTONE = 811;         // warlord / faction leader
  const ITEM_MORPHINE = 43;           // warlord
  const ITEM_FIGHTERS_BOOSTER = 50;   // warlord
  const ITEM_STRONG_ALE = 480;        // warlord
  const ITEM_ELVEN_ROPE = 810;        // faction leader
  const ITEM_HEARTY_STEW = 534;       // faction leader
  const ITEM_HONEY_MEAD = 517;        // faction leader
  const ITEM_ROCK_HARD_BREAD = 424;   // deserter
  const ITEM_EMPTY_SPELLBOOK = 262;   // arcanist (to copy what they learn into)
  const ITEM_TELESCOPE = 150;         // mercenary / space / crash / stranded (reading a distance before crossing it)
  const ITEM_SKELETON_KEY = 739;      // skeleton key holder (the whole loadout)
  const ITEM_ONU_TERMINAL = 379;      // diplomat (remote access into the assembly)

  // --- Beginning out in the world ----------------------------------------
  // No origin ends its wizard standing on the world map (315). The world map is
  // the thing you look at a journey on, not a place to be put down in: an origin
  // that begins "somewhere in the world" begins INSIDE that somewhere, on the
  // procedural square at those world coordinates, exactly as walking onto the
  // square from the map would put you there. The space origin is the one
  // exception in the whole table, and it is not on Earth at all.
  //
  // Answers false when the square could not be built, so a caller can fall back
  // rather than reserving a transfer into an empty map.
  const PROC_MAP_START = { x: 32, y: 32 }; // centre of the 64x64 procedural map

  function proceduralMapId() {
    return (window.WorldMapReturn && window.WorldMapReturn.procMapId) || 636;
  }

  function startOnProceduralSquare(options) {
    if (!$gameSystem || !$gameSystem.generateOriginBiomeMap) return false;
    const built = $gameSystem.generateOriginBiomeMap(options || {});
    if (!built) return false;
    // The square that was actually built is where this party is from, whether
    // it was named by the origin or rolled here (see the start anchor above).
    anchorAt(built.worldX, built.worldY);
    // The two "the procedural map is live" flags WorldMapReturn's startProcGen
    // raises; without them the square loads as a dead map with no borders and
    // no way back out to the world map.
    $gameVariables.setValue(110, 1);
    $gameVariables.setValue(111, 1);
    // The centre is only where the party is aimed. Which tile they are actually
    // set down on is settled once the square exists (ccPlaceOnPassableTile).
    if ($gameTemp) $gameTemp._ccProcSquareLanding = true;
    $gamePlayer.reserveTransfer(proceduralMapId(), PROC_MAP_START.x, PROC_MAP_START.y, 2, 0);
    return true;
  }

  // Camper / car origin: the party wakes up beside their vehicle out in the
  // world, not sitting inside it and not at a city they were asked to name. A
  // procedural square is built for them (the same landing the bike origin gets)
  // and VehicleSystem parks the vehicle on a passable tile next to the player
  // once the map has loaded, unmounted, so the first thing they do is decide
  // whether to get in. The keys item comes from the origin's own loadout.
  //
  // `kind` is one of the flags VehicleSystem answers to: "camper" (the ship
  // slot), "car" or "bike" (the boat slot, via $gameSystem._boatType).
  function startVehicleOrigin(kind) {
    if ($gameTemp) $gameTemp._ccVehicleFieldStart = kind;
    if (startOnProceduralSquare({ rng: Math.random })) return;
    // Nothing could be generated (no biome data at all): the tower gate is the
    // one landing that needs no world behind it.
    if ($gameTemp) $gameTemp._ccVehicleFieldStart = null;
    console.warn(`CharacterCreation: no overland square for the ${kind} origin; starting at the tower gate instead.`);
    startDungeonOrigin();
  }

  // Criminal origin: same camper start as origin_camper, but the party begins
  // already wanted, carrying a 10,000€ bounty. CrimeSystem tracks bounties in
  // gold and displays them in euros via goldToEuros (euros = gold / 100), so a
  // 10,000€ bounty is 1,000,000 gold recorded as one starting crime.
  const CRIMINAL_START_BOUNTY_GOLD = 1000000; // = 10,000€ (euros = gold / 100)

  function startCriminalOrigin() {
    if (window.CrimeSystem && window.CrimeSystem.addCrime) {
      const crimeName = T('CharCreate.pastLife');
      window.CrimeSystem.addCrime(crimeName, CRIMINAL_START_BOUNTY_GOLD);
      // The party arrives already wanted, so the story is old news: the paper
      // ran it the day before, not the morning after.
      if (window.CrimeSystem.filePastLifeWithPress) {
        const led = window.CrimeSystem.pressLedger();
        if (led) led.queue.length = 0;
        window.CrimeSystem.filePastLifeWithPress(crimeName, CRIMINAL_START_BOUNTY_GOLD);
      }
    } else {
      console.warn("CharacterCreation: CrimeSystem unavailable; criminal start bounty not applied.");
    }
    // Same landing as the camper origin: keys, and the van parked beside them.
    startVehicleOrigin("camper");
  }

  // CEO origin: start rich and in charge. Hand the party €1,000,000 in cash
  // (100 gold = €1) and a controlling 80% stake in LimeCorp registered on the
  // company exchange (RealEstateMarket via window.AssetRegistry), then drop the
  // player into the LimeCorp HQ (map 1036) at 25,31 facing down. The same stake
  // is what the stock terminal shows under the LIME ticker: both screens read
  // the one share register.
  const CEO_START_EUROS = 1000000;           // €1,000,000
  const CEO_START_GOLD = CEO_START_EUROS * 100; // 100 gold = €1
  const CEO_COMPANY_KEY = "LimeCorp";
  const CEO_OWNERSHIP = 0.8;                  // 80% controlling stake
  const CEO_START = { mapId: 1036, x: 25, y: 31, dir: 2 }; // facing down
  const CEO_PLACE = "Ghent";                  // HQ's town: the anchor's world square

  function startCEOOrigin() {
    // The €1,000,000 purse itself is handed out by giveStartingMoney, via
    // scenarioGoldBonus("origin_ceo") = CEO_START_GOLD, along with everyone
    // else's class and trait money , so it lands in one place instead of two.

    // Grant an 80% stake in LimeCorp. giveShares needs a share count, so read
    // the company's total shares from the exchange and take 80% of it.
    if (window.AssetRegistry && window.AssetRegistry.giveShares) {
      const company = window.AssetRegistry.getCompany(CEO_COMPANY_KEY);
      if (company && company.totalShares > 0) {
        window.AssetRegistry.giveShares(CEO_COMPANY_KEY, Math.floor(company.totalShares * CEO_OWNERSHIP));
      } else {
        console.warn(`CharacterCreation: company "${CEO_COMPANY_KEY}" not found; CEO stake not granted.`);
      }
    } else {
      console.warn("CharacterCreation: AssetRegistry unavailable; CEO stake not granted.");
    }

    // Home ground is the town the HQ stands in.
    anchorAtPlace(CEO_PLACE, { x: 84, y: 120 });
    $gamePlayer.reserveTransfer(CEO_START.mapId, CEO_START.x, CEO_START.y, CEO_START.dir, 0);
  }

  // Bike origin: give the bike item and drop the player into a RANDOM non-ocean
  // procedural biome (never onto the world map). Unlike the camper and the car
  // the square is picked from the world seed, so a bike start lands in the same
  // place every time in a given world. VehicleSystem places the player in a
  // passable 4x4 zone with the bike beside them on map load (see
  // _ccVehicleFieldStart handling there).
  function startBikeOrigin() {
    $gameSystem._boatType = "bike";
    if ($gameTemp) $gameTemp._ccVehicleFieldStart = "bike";

    const built = $gameSystem.generateRandomBikeBiomeMap
      ? $gameSystem.generateRandomBikeBiomeMap() : null;
    if (built) {
      // The seeded square the bike rolled is this party's home ground.
      anchorAt(built.worldX, built.worldY);
      // Proc map is 64x64; aimed at the center. VehicleSystem repositions the
      // player into a passable 4x4 zone once the map is loaded, and
      // ccPlaceOnPassableTile catches them if it cannot find one.
      $gameVariables.setValue(110, 1);
      $gameVariables.setValue(111, 1);
      if ($gameTemp) $gameTemp._ccProcSquareLanding = true;
      $gamePlayer.reserveTransfer(proceduralMapId(), PROC_MAP_START.x, PROC_MAP_START.y, 2, 0);
      return;
    }
    if ($gameTemp) $gameTemp._ccVehicleFieldStart = null;
    console.warn("CharacterCreation: no overland square for the bike origin; starting at the tower gate instead.");
    startDungeonOrigin();
  }

  // Full Automation origin: a RANDOM land square of the world, standing on the ground
  // of it, with 4x the usual pile of crafting materials (handed out by the origin's
  // loadout), and every party member trained in the full spectrum of crafting
  // specializations used by the Thinker and Blacksmithing systems.
  const MATERIAL_ITEM_ID_MIN = 849; // first <category:Crafting> material
  const MATERIAL_ITEM_ID_MAX = 871; // last  <category:Crafting> material
  const EMPTY_LOT_MATERIAL_QTY = 160; // of every material (4x)

  // Crafting specializations granted by the Full Automation origin.
  // These cover everything the Thinker system (Fabrication, Weaponsmithing, Armor Smithing, Carpentry,
  // Metalworking, Cooking, Alchemy, Electronics) and the Blacksmithing system (Bladesmithing, Tailoring,
  // Leatherworking, Jewelry Making, Gunsmithing, etc.) use.
  const CRAFTING_SPEC_IDS = [
    20,   // Armor Smithing     (Crafting) - Blacksmithing main
    321,  // Bladesmithing      (Crafting) - Blacksmithing main
    40,   // Blacksmithing      (Crafting) - Blacksmithing main
    102,  // Fabrication        (Crafting) - Thinker main bench
    807,  // Weaponsmithing     (Crafting) - Thinker weapons
    58,   // Carpentry          (Crafting) - Thinker lifestyle / building
    269,  // Tailoring          (Crafting) - Blacksmithing armor
    157,  // Leatherworking     (Crafting) - Blacksmithing armor
    176,  // Metalworking       (Crafting) - Thinker tools / building
    643,  // Jewelry Making     (Crafting) - Blacksmithing accessories
    616,  // Gunsmithing        (Crafting) - Blacksmithing ranged
    540,  // CNC Machining      (Crafting) - precision fabrication
    121,  // Glassblowing       (Crafting) - artisan goods
    215,  // Pottery            (Crafting) - artisan goods
    287,  // Upholstery         (Crafting) - furniture
    460,  // Underwater Welding (Crafting) - advanced fabrication
    309,  // Alchemy            (Arcana)   - Thinker potions / magic items
    49,   // Brewing            (Culinary) - Thinker beverages
    75,   // Cooking            (Culinary) - Thinker food
    328,  // Campfire Cooking   (Culinary) - survival food
    98,   // Electronics        (Science)  - Thinker espionage / gadgets
  ];

  function startEmptyLotOrigin() {
    // Grant every party member randomized medium-high levels in all crafting
    // specializations used by the Thinker and Blacksmithing systems.
    const members = $gameParty.members();
    members.forEach(actor => {
      if (!actor || !actor.setSpecializationTrainedLevel) return;
      CRAFTING_SPEC_IDS.forEach(specId => {
        // Randomize level between 3 (Advanced) and 5 (Master)
        const level = 3 + Math.floor(Math.random() * 3);
        actor.setSpecializationTrainedLevel(specId, level);
      });
    });
    if (startOnProceduralSquare({ rng: Math.random })) return;
    console.warn("CharacterCreation: no overland square for the Full Automation origin; starting at the tower gate instead.");
    startDungeonOrigin();
  }

  // Stranded origin: drop the party on foot on the ground of a RANDOM one of
  // these hand-picked world squares - remote spots scattered across the map,
  // with nothing but the castaway kit its loadout lists. Every one of them is a
  // land square (Fields / ForestTropical / Mountain / City); never add an Ocean
  // coordinate here. A square that drifts over water after a world-map repaint
  // simply fails to build, and the castaway is rolled somewhere else instead.
  const STRANDED_COORDS = [
    { x: 115, y: 89 }, { x: 84, y: 46 }, { x: 86, y: 50 }, { x: 85, y: 53 },
    { x: 71, y: 61 }, { x: 67, y: 63 }, { x: 69, y: 64 }, { x: 70, y: 68 },
    { x: 213, y: 230 }, { x: 220, y: 234 }, { x: 8, y: 225 }, { x: 49, y: 145 },
    { x: 57, y: 149 }, { x: 119, y: 182 }, { x: 121, y: 184 }, { x: 131, y: 216 },
    { x: 120, y: 228 },
  ];

  // The castaway is measured from the shore they washed up on, like everybody
  // else is measured from where they began: startOnProceduralSquare anchors the
  // square it builds, so the coast the party opens their eyes on is level 1
  // ground and the world grows more dangerous the further inland they walk. It
  // used to be pinned to the space center instead - the place they were trying
  // to reach - which put a party that landed on 213,230 half a world away from
  // its own anchor and opened the game on level 79 wildlife.
  function startStrandedOrigin() {
    const spot = STRANDED_COORDS[Math.floor(Math.random() * STRANDED_COORDS.length)];
    if (startOnProceduralSquare({ worldX: spot.x, worldY: spot.y })) return;
    // The written square is no longer land (or there is no biome data for it):
    // any other coast will do for somebody who did not choose this one either.
    if (startOnProceduralSquare({ rng: Math.random })) return;
    console.warn("CharacterCreation: no overland square for the stranded origin; starting at the tower gate instead.");
    startDungeonOrigin();
  }

  // --- The start anchor ----------------------------------------------------
  // The world square the "Distance from spawn" encounter mode measures this
  // party's whole world from (BattleSystemEnhancedEncounters, getStartAnchor):
  // level 1 standing on it, the top of the roster at the farthest square from
  // it. It belongs to the savegame, it is written once, and nothing that
  // happens afterwards moves it - so EVERY origin states it here, at the moment
  // it settles where the party begins, rather than leaving the encounter system
  // to pick it up off whichever map happens to load first. An origin that says
  // nothing is an origin measured from a square it may never have stood on.
  //
  // Three kinds of answer, one per kind of landing:
  //   anchorAt(x, y)        a square this origin knows now - the procedural
  //                         square it just built, or the world tile of the
  //                         authored map it is transferring into.
  //   anchorAtSpaceCenter() the two starts that never stand on an Earth square
  //                         at all (space, crash-landed): the Green Witch Space
  //                         Center, the pad they lifted off from or were trying
  //                         to get back to.
  //   deferred              the picker origins, which do not know where they
  //                         are going until the player says: FastTravelSystem
  //                         writes the anchor as it lands them (ccAnchorStart).
  //
  // captureStartAnchor over in the encounter plugin stays as the net under all
  // of it (a preset dossier, the story mode, a save whose origin predates this),
  // and it never overwrites an anchor that is already set.
  function anchorAt(x, y) {
    const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (BSEH && typeof BSEH.setStartAnchor === "function") {
      BSEH.setStartAnchor(x, y);
    }
  }

  function anchorAtSpaceCenter() {
    const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (BSEH && typeof BSEH.anchorAtSpaceCenter === "function") {
      BSEH.anchorAtSpaceCenter();
    }
  }

  // The world square of a named place, for the origins that transfer straight
  // into an authored map. Read from the shared destination table (the same
  // `base` the encounter plugin resolves a map's <MapGroup> through), so moving
  // a town on the world map moves the anchor of the origins that begin in it,
  // and the fallback only stands in when the table has not been published yet.
  function anchorAtPlace(key, fallback) {
    const dest = window.WorkSystem && window.WorkSystem.Destinations;
    const entry = dest && dest[key];
    const base = entry && entry.base;
    if (base && typeof base.x === "number" && typeof base.y === "number") {
      anchorAt(base.x, base.y);
      return;
    }
    if (fallback) anchorAt(fallback.x, fallback.y);
  }

  // The Omega Tower's own world square: where every origin is anchored once
  // Earth is gone and the tower is the only ground left (startAtOmegaTower).
  function anchorAtOmegaTower() {
    const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (BSEH && typeof BSEH.getOmegaTowerCoords === "function") {
      const c = BSEH.getOmegaTowerCoords();
      if (c) anchorAt(c.x, c.y);
    }
  }

  // Mayor origin: a huge stockpile (50x of every crafting material, handed out
  // by the loadout) and the choice of a starting city through the picker. The
  // mayor arrives on foot and with nothing to drive: see
  // startWorldMapPickerOrigin for where the picked place actually puts them.
  const MAYOR_MATERIAL_QTY = 50; // of every material (id 849-871)

  // --- Beginning after the end -------------------------------------------
  // Every origin below is written to put the party somewhere on Earth, and in a
  // world begun after 21 December 2012 there is no Earth to put them on (switch
  // 199, WorldMapTransfer.earthLost). What each origin GRANTS still stands - the
  // CEO is still rich, the warlord still has an army - but where it was going
  // does not exist, so they all begin in the same place: the Omega Tower, the
  // only ground left. Called after the origin's own branch has run, so the
  // grants happen first and only the destination is overruled.
  function startsAtOmegaTower() {
    const WMT = window.WorldMapTransfer;
    return !!(WMT && WMT.earthLost && WMT.earthLost());
  }

  function startAtOmegaTower() {
    const WMT = window.WorldMapTransfer;
    const t = (WMT && WMT.towerLanding)
      ? WMT.towerLanding() : { mapId: 635, x: 13, y: 38, dir: 8 };
    if ($gameTemp) {
      // Every "say where you begin" flag names a place on a planet that is not
      // there, and so does the vehicle that would have been parked beside the
      // party on one of its squares.
      $gameTemp._openCharacterCreationTrainTravel = false;
      $gameTemp._characterCreationTravelMode = false;
      $gameTemp._characterCreationTravelType = null;
      $gameTemp._ccVehicleFieldStart = null;
    }
    // Runs after the origin's own branch, and overrules its anchor along with
    // its destination: a square of a planet that is not there is not where this
    // party is from. The tower is, because it is the only place left.
    anchorAtOmegaTower();
    $gamePlayer.reserveTransfer(t.mapId, t.x, t.y, t.dir, 0);
  }

  // The full destination picker: the camper network lists every place on the
  // map, and FastTravelSystem's plain character-creation transfer walks the
  // party into the place they picked , through its own door where it has one,
  // and onto the ground of its own square where it has not (ccCreationLanding
  // there). Never onto the world map itself. Shared by every origin that begins
  // nowhere in particular but still lets the player say where.
  function startWorldMapPickerOrigin() {
    if (!$gameTemp) return;
    // Nothing to pick from: the cities went with the planet. This also catches
    // the faction origins, which come back through here after their own picker.
    if (startsAtOmegaTower()) { startAtOmegaTower(); return; }
    $gameTemp._openCharacterCreationTrainTravel = true;     // opens the picker
    $gameTemp._characterCreationTravelType = "camper";      // full city list, world-map landing
    $gameTemp._characterCreationTravelMode = true;          // free, uncancellable
  }

  function startMayorOrigin() {
    startWorldMapPickerOrigin();
  }

  // --- Backing out of the starting place picker ----------------------------
  // Picking an origin is not only a line in a menu: by the time the picker
  // opens the gear has been handed out, the cash paid, the troops recruited and
  // the switches set. So "back to the origin list" cannot simply close the
  // picker, it has to undo the choice, and the cheapest honest way to undo
  // something this wide is to keep a copy of everything it is about to touch.
  // The copy is taken at the top of the origin handler, before a single grant
  // runs, and put back when the player asks for the list again.
  //
  // Only the persistent game objects are copied. The map and the player are
  // deliberately left alone: no picker origin reserves a transfer, so the party
  // is still standing where the wizard left it and the running scene keeps
  // pointing at objects that are still valid.
  const ORIGIN_SNAPSHOT_GLOBALS = [
    "$gameSystem", "$gameSwitches", "$gameVariables", "$gameActors", "$gameParty",
    // Not every world has these: the army and faction ledgers are their own
    // plugins' globals, and the warlord, the faction leader and the deserter all
    // write to them.
    "$gameArmy", "$gameFactions",
  ];

  function captureOriginSnapshot() {
    if (!$gameTemp) return;
    const snapshot = {};
    try {
      for (const key of ORIGIN_SNAPSHOT_GLOBALS) {
        const value = window[key];
        if (value) snapshot[key] = JsonEx.stringify(value);
      }
    } catch (e) {
      console.warn("CharacterCreation: could not copy the state the origin is about to change; backing out of the starting place picker will be unavailable.", e);
      $gameTemp._ccOriginSnapshot = null;
      return;
    }
    $gameTemp._ccOriginSnapshot = snapshot;
  }

  function clearOriginSnapshot() {
    if ($gameTemp) $gameTemp._ccOriginSnapshot = null;
  }

  // True while the origin just chosen can still be taken back.
  function canReopenOriginStep() {
    return !!($gameTemp && $gameTemp._ccOriginSnapshot);
  }

  // Puts the world back the way it stood before the origin was chosen and
  // reopens the origin step. Answers whether it could.
  function reopenOriginStep() {
    if (!canReopenOriginStep()) return false;
    const snapshot = $gameTemp._ccOriginSnapshot;
    clearOriginSnapshot();
    try {
      for (const key of ORIGIN_SNAPSHOT_GLOBALS) {
        if (snapshot[key]) window[key] = JsonEx.parse(snapshot[key]);
      }
    } catch (e) {
      console.error("CharacterCreation: could not undo the chosen origin.", e);
      return false;
    }
    // Every flag that was pointing the player at a starting place, including the
    // one that reopens the picker on the next map frame.
    $gameTemp._openCharacterCreationTrainTravel = false;
    $gameTemp._characterCreationTravelMode = false;
    $gameTemp._characterCreationTravelType = null;
    $gameTemp._ccVehicleFieldStart = null;
    $gamePlayer.refresh();
    window.Scene_CharacterCreation._isCreatureMode = false;
    window.Scene_CharacterCreation._creationMode =
      ccKit().storedCreationMode() || window.Scene_CharacterCreation._creationMode;
    window.Scene_CharacterCreation.clearSubScreens();
    window.Scene_CharacterCreation._interruptedStep = -1;
    window.Scene_CharacterCreation.prepare(ccKit().STEP.ORIGIN);
    SceneManager.push(window.Scene_CharacterCreation);
    return true;
  }

  // FastTravelSystem draws the picker and owns its Back button, so it asks here
  // whether there is an origin to go back to, and says when there is no longer
  // one (the journey was confirmed, the origin stands).
  window.CharacterCreationOrigin = {
    canReopen: canReopenOriginStep,
    reopen: reopenOriginStep,
    clearSnapshot: clearOriginSnapshot,
  };

  // --- Starting loadouts ---------------------------------------------------
  // ONE table drives both what an origin hands out and what the "Starting Out"
  // dossier promises: grantOriginLoadout() gives exactly the rows
  // _originStepDetailsHtml lists, so the two can never drift apart. Nothing here
  // is random and nothing is left implicit: every origin states its items, their
  // quantities and its cash.
  //
  // An entry is { id, qty, each }. `each` means "qty per party member", so a
  // trio starts with three times the supplies of a lone wanderer; without it the
  // quantity is flat. Anything in the <category:Tools> family is clamped to a
  // single copy whatever the party size - three explorers need three ration
  // packs, not three low orbit pins.
  function materialLoadout(qty) {
    const list = [];
    for (let id = MATERIAL_ITEM_ID_MIN; id <= MATERIAL_ITEM_ID_MAX; id++) list.push({ id, qty });
    return list;
  }

  // Every origin carries its OWN supplies: there is no shared kit handed out on
  // top. What a party eats, heals with and sleeps under is part of the fantasy
  // of where it starts, so a bunker's canned meat and torch never show up in a
  // CEO's briefcase. The traveller's kit below (potions, granola, bedroll,
  // lantern, invitation letter) belongs to the train origin alone.
  const ORIGIN_LOADOUTS = {
    origin_train: [
      { id: ITEM_HEALTH_POTION, qty: 2, each: true },
      { id: ITEM_PAINKILLERS, qty: 2, each: true },
      { id: ITEM_MANA_POTION, qty: 1, each: true },
      { id: ITEM_MEDICAL_SPRAY, qty: 1, each: true },
      { id: ITEM_GRANOLA_BAR, qty: 3, each: true },
      { id: ITEM_BOTTLED_WATER, qty: 2, each: true },
      { id: ITEM_BEDROLL, qty: 1 },
      { id: ITEM_LANTERN, qty: 1 },
      { id: ITEM_INVITATION_LETTER, qty: 1 },
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_TRAVEL_BACKPACK, qty: 1 },
    ],
    // Orbital issue: everything freeze-dried, nothing that spills.
    origin_space: [
      { id: ITEM_LOW_ORBIT_PIN, qty: 1 },
      { id: ITEM_STAR_MAP, qty: 1 },
      { id: ITEM_PILOT_PDA, qty: 1 },
      { id: ITEM_TELESCOPE, qty: 1 },
      { id: ITEM_PORTABLE_CHARGER, qty: 1 },
      { id: ITEM_UV_SUNGLASSES, qty: 1 },
      { id: ITEM_NANITES, qty: 1, each: true },
      { id: ITEM_ELECTROLYTE_POWDER, qty: 3, each: true },
      { id: ITEM_RATION_BAR, qty: 4, each: true },
    ],
    // Road life: a kitchen on wheels and something to listen to.
    origin_camper: [
      { id: ITEM_LIMINAL_CUFFS, qty: 1 },
      { id: ITEM_FUEL_TANK, qty: 1 },
      { id: ITEM_COOKING_POT, qty: 1 },
      { id: ITEM_UTENSIL_SET, qty: 1 },
      { id: ITEM_SLEEPING_BAG, qty: 1 },
      { id: ITEM_MP3_PLAYER, qty: 1 },
      { id: ITEM_INSTANT_NOODLES, qty: 4, each: true },
      { id: ITEM_STRONG_COFFEE, qty: 2, each: true },
      { id: ITEM_IBUPROFEN, qty: 2, each: true },
    ],
    // Motorway diet: petrol-station food, eaten at the wheel.
    origin_car: [
      { id: ITEM_CAR, qty: 1 },
      { id: ITEM_FUEL_TANK, qty: 1 },
      { id: ITEM_GPS, qty: 1 },
      { id: ITEM_EARBUDS, qty: 1 },
      { id: ITEM_OINTMENT, qty: 2, each: true },
      { id: ITEM_COFFEE_CUP, qty: 2, each: true },
      { id: ITEM_POTATO_CRISPS, qty: 3, each: true },
      { id: ITEM_FIZZY_SODA, qty: 2, each: true },
    ],
    // Saddlebag weight: nothing that isn't worth carrying uphill.
    origin_bike: [
      { id: ITEM_BIKE, qty: 1 },
      { id: ITEM_WATER_BOTTLE, qty: 1 },
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_SEWING_KIT, qty: 1 },
      { id: ITEM_COMPACT_UMBRELLA, qty: 1 },
      { id: ITEM_MUSCLE_RUB, qty: 2, each: true },
      { id: ITEM_PROTEIN_BAR, qty: 4, each: true },
      { id: ITEM_MIXED_NUTS, qty: 2, each: true },
    ],
    // Homesteading: materials, tools, and food that keeps in a crate.
    origin_lot: materialLoadout(EMPTY_LOT_MATERIAL_QTY).concat([
      { id: ITEM_SHOVEL, qty: 1 },
      { id: ITEM_CRAFTSMAN_BACKPACK, qty: 1 },
      { id: ITEM_TOOLMAKER_MULTITOOL, qty: 1 },
      { id: ITEM_CANDLE, qty: 1 },
      { id: ITEM_CANNED_VEGETABLES, qty: 3, each: true },
      { id: ITEM_PORRIDGE, qty: 2, each: true },
    ]),
    // Office of the mayor: paperwork, a banquet, and a speech to give.
    origin_mayor: materialLoadout(MAYOR_MATERIAL_QTY).concat([
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_POCKET_NOTEBOOK, qty: 1 },
      { id: ITEM_BALLPOINT_PEN, qty: 1 },
      { id: ITEM_WRISTWATCH, qty: 1 },
      { id: ITEM_ORATORS_ELIXIR, qty: 1, each: true },
      { id: ITEM_FRESH_BREAD, qty: 2, each: true },
      { id: ITEM_CHEESE_WHEEL, qty: 1 },
      { id: ITEM_AGED_WINE, qty: 1 },
    ]),
    // Delve kit: light, rope, and more potions than anyone else starts with.
    origin_dungeon: [
      { id: ITEM_HEALTH_POTION, qty: 3, each: true },
      { id: ITEM_MANA_POTION, qty: 2, each: true },
      { id: ITEM_ROUTES_MAP, qty: 1 },
      { id: ITEM_FLASHLIGHT, qty: 1 },
      { id: ITEM_FAIRY_LANTERN, qty: 1 },
      { id: ITEM_CLIMBING_ROPE, qty: 1 },
      { id: ITEM_WARNING_AMULET, qty: 1 },
      { id: ITEM_ELVEN_WAYBREAD, qty: 3, each: true },
    ],
    // Wanted: nothing traceable, everything disposable.
    origin_criminal: [
      { id: ITEM_LIMINAL_CUFFS, qty: 1 },
      { id: ITEM_LOCKPICK, qty: 2, each: true },
      { id: ITEM_BURNER_PHONE, qty: 1 },
      { id: ITEM_ESCAPE_KIT, qty: 1 },
      { id: ITEM_INVISIBLE_INK_PEN, qty: 1 },
      { id: ITEM_RED_COCAINE, qty: 1, each: true },
      { id: ITEM_PROTEIN_BAR, qty: 3, each: true },
      { id: ITEM_JUMBO_COLA, qty: 2, each: true },
    ],
    // Castaway: what washed ashore with you, and what you can catch.
    origin_stranded: [
      { id: ITEM_INFLATABLE_DINGHY, qty: 1 },
      { id: ITEM_FISHING_ROD, qty: 1 },
      { id: ITEM_COOKING_POT, qty: 1 },
      { id: ITEM_WALKING_STICK, qty: 1 },
      { id: ITEM_EMPTY_FLASK, qty: 1 },
      { id: ITEM_TELESCOPE, qty: 1 },
      { id: ITEM_VENISON_JERKY, qty: 3, each: true },
      { id: ITEM_SPRING_WATER, qty: 2, each: true },
      { id: ITEM_WILD_BERRIES, qty: 2, each: true },
    ],
    // Sealed cellar: tinned calories and batteries, no fresh anything.
    origin_bunker: [
      { id: ITEM_FLASHLIGHT, qty: 1 },
      { id: ITEM_SHOVEL, qty: 1 },
      { id: ITEM_PORTABLE_CHARGER, qty: 1 },
      { id: ITEM_CANNED_MEAT, qty: 4, each: true },
      { id: ITEM_CANNED_VEGETABLES, qty: 3, each: true },
      { id: ITEM_FIELD_RATION, qty: 2, each: true },
      { id: ITEM_ELECTROLYTE_POWDER, qty: 2, each: true },
    ],
    // Corner office: no supplies, only expenses.
    origin_ceo: [
      { id: ITEM_WRISTWATCH, qty: 1 },
      { id: ITEM_CELLPHONE, qty: 1 },
      { id: ITEM_PREMIUM_WHISKEY, qty: 1 },
      { id: ITEM_DEADLINE_COFFEE, qty: 2, each: true },
      { id: ITEM_ENERGY_DRINK, qty: 2, each: true },
      { id: ITEM_GOURMET_CHOCOLATE, qty: 1, each: true },
    ],
    // Inheritance: instruments for reading what you were left.
    origin_artifact: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_RESONANCE_SCANNER, qty: 1 },
      { id: ITEM_TRAVEL_JOURNAL, qty: 1 },
      { id: ITEM_LENS_OF_REVELATION, qty: 1 },
      { id: ITEM_MEMORY_AMBER, qty: 1 },
      { id: ITEM_ELVEN_WAYBREAD, qty: 2, each: true },
      { id: ITEM_CALMING_TEA, qty: 2, each: true },
    ],
    // Wreck salvage: whatever was still bolted down after the landing.
    origin_crash: [
      { id: ITEM_LOW_ORBIT_PIN, qty: 1 },
      { id: ITEM_FUEL_TANK, qty: 1 },
      { id: ITEM_MULTITOOL, qty: 1 },
      { id: ITEM_TELESCOPE, qty: 1 },
      { id: ITEM_FLASHLIGHT, qty: 1 },
      { id: ITEM_EMPTY_FLASK, qty: 1 },
      { id: ITEM_RATION_BAR, qty: 3, each: true },
      { id: ITEM_REGENERATION_HERB, qty: 2, each: true },
    ],
    // Camp of an army that answers to nobody: blades, booze and morphine.
    origin_warlord: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_WHETSTONE, qty: 1 },
      { id: ITEM_MULTITOOL, qty: 1 },
      { id: ITEM_MORPHINE, qty: 1, each: true },
      { id: ITEM_FIGHTERS_BOOSTER, qty: 1, each: true },
      { id: ITEM_FIELD_RATION, qty: 3, each: true },
      { id: ITEM_STRONG_ALE, qty: 2, each: true },
    ],
    // A faction's own quartermaster: a proper camp, properly fed.
    origin_faction_leader: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_WHETSTONE, qty: 1 },
      { id: ITEM_COOKING_POT, qty: 1 },
      { id: ITEM_ELVEN_ROPE, qty: 1 },
      { id: ITEM_IBUPROFEN, qty: 2, each: true },
      { id: ITEM_HEARTY_STEW, qty: 2, each: true },
      { id: ITEM_HONEY_MEAD, qty: 2, each: true },
    ],
    // Walked out of a clinic with the hardware still settling: painkillers to
    // live with it, spray for what is still open, and a scalpel to work on
    // each other with when the next one goes wrong.
    origin_augmented: [
      { id: ITEM_PAINKILLERS, qty: 3, each: true },
      { id: ITEM_MEDICAL_SPRAY, qty: 2, each: true },
      { id: ITEM_OINTMENT, qty: 2, each: true },
      { id: ITEM_NANITES, qty: 1, each: true },
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_PORTABLE_CHARGER, qty: 1 },
    ],
    // A collector travels light: the cards are not items, so the kit is only
    // what it takes to get from one table to the next.
    origin_card_collector: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_TRAVEL_JOURNAL, qty: 1 },
      { id: ITEM_RATION_BAR, qty: 2, each: true },
      { id: ITEM_CALMING_TEA, qty: 2, each: true },
    ],
    // Ran with what was in the pack: stolen rations and a way through doors.
    origin_deserter: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_ESCAPE_KIT, qty: 1 },
      { id: ITEM_WALKING_STICK, qty: 1 },
      { id: ITEM_LOCKPICK, qty: 1, each: true },
      { id: ITEM_OINTMENT, qty: 2, each: true },
      { id: ITEM_FIELD_RATION, qty: 2, each: true },
      { id: ITEM_ROCK_HARD_BREAD, qty: 2, each: true },
    ],
    // A working library and the light to read it by. Everything else the
    // arcanist carries is dealt from the shelves (see rollArcanistLoadout).
    origin_arcanist: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_EMPTY_SPELLBOOK, qty: 1, each: true },
      { id: ITEM_CANDLE, qty: 2 },
      { id: ITEM_MANA_POTION, qty: 2, each: true },
      { id: ITEM_CALMING_TEA, qty: 2, each: true },
    ],
    // A soldier for hire keeps the boring half of the kit the same whoever is
    // paying: map, glass, whetstone, rations. The guns and the medicine are
    // whatever the last contract left in the bag (see rollMercenaryLoadout).
    origin_mercenary: [
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_TELESCOPE, qty: 1 },
      { id: ITEM_WHETSTONE, qty: 1 },
      { id: ITEM_FIELD_RATION, qty: 3, each: true },
      { id: ITEM_SPRING_WATER, qty: 2, each: true },
    ],
    // Put down somewhere nobody chose, with the rite still warm. The kit is
    // what was in reach when it went wrong: candles, chalk, a bedroll and
    // enough water to work out where the nearest road is. The staff, the robe
    // and the foci are rolled (see rollLostConvokerLoadout).
    origin_lost_convoker: [
      { id: ITEM_CANDLE, qty: 3 },
      { id: ITEM_EMPTY_SPELLBOOK, qty: 1, each: true },
      { id: ITEM_MANA_POTION, qty: 2, each: true },
      { id: ITEM_BEDROLL, qty: 1 },
      { id: ITEM_FIELD_RATION, qty: 3, each: true },
      { id: ITEM_SPRING_WATER, qty: 3, each: true },
    ],
    // One key and nothing else. Deliberately the thinnest loadout in the table:
    // no rations, no potions, no light. Whoever carries this walked out of
    // somewhere with the only thing worth taking, and everything else has to be
    // opened, taken or bought on the way.
    origin_skeleton_key: [
      { id: ITEM_SKELETON_KEY, qty: 1 },
    ],
    // One energy drink, and a bag of Hyperdeck parts rolled on top of it (see
    // rollHypernetExplorerLoadout). No rations, no light, no map: whoever this
    // is has been buying components instead of food.
    origin_hypernet_explorer: [
      { id: ITEM_ENERGY_DRINK, qty: 1, each: true },
    ],
    // A seat at the assembly, worked from a distance: one terminal, nothing else.
    origin_diplomat: [
      { id: ITEM_ONU_TERMINAL, qty: 1 },
    ],
    // The case itself is rolled off the disease shelf (rollPlagueSpreaderLoadout);
    // this is what it is carried in and what the carrier takes when a seal goes.
    // Nobody handles that many vials without expecting to open one by accident.
    origin_plague: [
      { id: ITEM_TRAVEL_BACKPACK, qty: 1 },
      { id: ITEM_LOCAL_MAP, qty: 1 },
      { id: ITEM_EMPTY_FLASK, qty: 1 },
      { id: ITEM_HEALTH_POTION, qty: 2, each: true },
      { id: ITEM_MEDICAL_SPRAY, qty: 2, each: true },
      { id: ITEM_PAINKILLERS, qty: 3, each: true },
      { id: ITEM_OINTMENT, qty: 2, each: true },
    ],
  };

  // --- The origin's own three, on hotbar 4-6 ------------------------------
  // Slots 1-3 are the same everywhere (potion, tonic, food; see
  // giveStarterStaples). Slots 4-6 are where the origin speaks: the three
  // things from ITS kit that a player of that start reaches for first - the
  // bike for the cyclist, the flashlight and rope for the delver, the escape
  // kit for the wanted.
  //
  // Every id below must be map-usable, i.e. occasion "always" (0) or "outside
  // battle" (2), because that is all the favourites bar accepts. This still
  // rules out a few origins' signature objects: the lockpick, the cooking pot,
  // the utensil set and the skeleton key are occasion "never", and the
  // ballpoint pen and resonance scanner are battle-only - so those origins
  // field their next-best three instead.
  // Staples are never repeated here; bindOriginFavorites skips anything already
  // sitting on slots 1-3.
  // Run auditOriginFavorites() from the console after editing this table.
  const ORIGIN_FAVORITES = {
    // Reading the line, sleeping on it, patching yourself up on it.
    origin_train: [ITEM_LOCAL_MAP, ITEM_BEDROLL, ITEM_MEDICAL_SPRAY],
    // Orbit: call the ship down, know where you are, talk to it.
    origin_space: [ITEM_LOW_ORBIT_PIN, ITEM_STAR_MAP, ITEM_PILOT_PDA],
    // The camper itself, what moves it, and where you sleep in it.
    origin_camper: [ITEM_LIMINAL_CUFFS, ITEM_FUEL_TANK, ITEM_SLEEPING_BAG],
    // The car itself, what moves it, and what tells it where to go.
    origin_car: [ITEM_CAR, ITEM_FUEL_TANK, ITEM_GPS],
    // The bike, the patch kit that keeps it rolling, and the bottle.
    origin_bike: [ITEM_BIKE, ITEM_SEWING_KIT, ITEM_WATER_BOTTLE],
    // Breaking ground: dig it, build it, carry it.
    origin_lot: [ITEM_SHOVEL, ITEM_TOOLMAKER_MULTITOOL, ITEM_CRAFTSMAN_BACKPACK],
    // Governing: take the note, give the speech, know the ward.
    origin_mayor: [ITEM_POCKET_NOTEBOOK, ITEM_ORATORS_ELIXIR, ITEM_LOCAL_MAP],
    // Delving: light first, rope second, the way out third.
    origin_dungeon: [ITEM_FLASHLIGHT, ITEM_CLIMBING_ROPE, ITEM_ROUTES_MAP],
    // Wanted: the way out, the untraceable call, the way past a lock.
    origin_criminal: [ITEM_ESCAPE_KIT, ITEM_BURNER_PHONE, ITEM_LIMINAL_CUFFS],
    // Castaway: get off the shore, catch dinner, carry water.
    origin_stranded: [ITEM_INFLATABLE_DINGHY, ITEM_FISHING_ROD, ITEM_EMPTY_FLASK],
    // Sealed cellar: light, power, and something to dig out with.
    origin_bunker: [ITEM_FLASHLIGHT, ITEM_PORTABLE_CHARGER, ITEM_SHOVEL],
    // Corner office: the phone, the watch, and the coffee holding it together.
    origin_ceo: [ITEM_CELLPHONE, ITEM_WRISTWATCH, ITEM_DEADLINE_COFFEE],
    // Inheritance: the lens, the amber, and the journal to write it all down.
    origin_artifact: [ITEM_LENS_OF_REVELATION, ITEM_MEMORY_AMBER, ITEM_TRAVEL_JOURNAL],
    // Wreck: call the ship down, fix what is left, see in the dark.
    origin_crash: [ITEM_LOW_ORBIT_PIN, ITEM_MULTITOOL, ITEM_FLASHLIGHT],
    // Warband: keep the edge, hit harder, feel none of it.
    origin_warlord: [ITEM_WHETSTONE, ITEM_FIGHTERS_BOOSTER, ITEM_MORPHINE],
    // Quartermaster: the rope, the stone, the map of what you hold.
    origin_faction_leader: [ITEM_ELVEN_ROPE, ITEM_WHETSTONE, ITEM_LOCAL_MAP],
    // Fresh implants: the nanites, the spray, and the charge they run on.
    origin_augmented: [ITEM_NANITES, ITEM_MEDICAL_SPRAY, ITEM_PORTABLE_CHARGER],
    // Between tables: the journal of who plays where, the map, the tea.
    origin_card_collector: [ITEM_TRAVEL_JOURNAL, ITEM_LOCAL_MAP, ITEM_CALMING_TEA],
    // Gone AWOL: the kit, the stick, and the road home.
    origin_deserter: [ITEM_ESCAPE_KIT, ITEM_WALKING_STICK, ITEM_LOCAL_MAP],
    // The library on the move: what to write in, what to cast with, the light.
    origin_arcanist: [ITEM_EMPTY_SPELLBOOK, ITEM_MANA_POTION, ITEM_CANDLE],
    // Hired: read the field, keep the edge, know the ground.
    origin_mercenary: [ITEM_TELESCOPE, ITEM_WHETSTONE, ITEM_LOCAL_MAP],
    // Rite gone wrong: cast again, light it, and sleep somewhere.
    origin_lost_convoker: [ITEM_MANA_POTION, ITEM_CANDLE, ITEM_BEDROLL],
    // Deliberately empty: the key is the whole loadout and it is occasion
    // "never", so there is nothing here the bar can hold. Slots 4-6 stay free,
    // which suits a start that has to take everything else off somebody.
    origin_skeleton_key: [],
    // Carrying it: seal what leaks, and treat what you catch.
    origin_plague: [ITEM_MEDICAL_SPRAY, ITEM_PAINKILLERS, ITEM_EMPTY_FLASK],
    // Nothing but the drink: components are occasion "never", so there is
    // nothing else in this loadout the quick bar can hold.
    origin_hypernet_explorer: [ITEM_ENERGY_DRINK],
    // One terminal is the whole seat; nothing else to reach for.
    origin_diplomat: [ITEM_ONU_TERMINAL],
  };

  // Slots 4-6, zero-based. Slots 1-3 belong to the staples.
  const ORIGIN_FAVORITE_FIRST_SLOT = 3;

  /**
   * Put an origin's three signature items on hotbar slots 4-6.
   * A build without ItemSystemHotbar simply gets the items.
   * @param {string} symbol - Origin symbol, e.g. "origin_bike"
   */
  function bindOriginFavorites(symbol) {
    const hotbar = window.ItemHotbar;
    if (!hotbar) return;
    let slot = ORIGIN_FAVORITE_FIRST_SLOT;
    (ORIGIN_FAVORITES[symbol] || []).forEach((id) => {
      const item = $dataItems[id];
      if (!item || !hotbar.isFavoritable(item)) {
        console.warn(`CharacterCreation: origin favourite ${id} (${symbol}) is missing or not map-usable.`);
        return;
      }
      // Assigning an item that is already on the bar VACATES its old slot, so a
      // pick that duplicates a staple would empty slot 1-3 rather than fill 4-6.
      if (hotbar.slotOf(item) >= 0) return;
      hotbar.assign(slot, item);
      slot++;
    });
  }

  /**
   * Check every ORIGIN_FAVORITES row against the origin it belongs to and
   * report what a player would not actually get. Run from the console after
   * editing the table.
   * @returns {array} Offending { origin, problems } rows
   */
  function auditOriginFavorites() {
    const offenders = [];
    Object.keys(ORIGIN_LOADOUTS).forEach((symbol) => {
      const picks = ORIGIN_FAVORITES[symbol];
      const problems = [];
      if (!picks) {
        problems.push("no favourites row");
      } else {
        const granted = {};
        (ORIGIN_LOADOUTS[symbol] || []).forEach((entry) => {
          if (!entry.kind || entry.kind === "item") granted[entry.id] = true;
        });
        picks.forEach((id) => {
          const item = $dataItems[id];
          if (!item || !item.name || !item.name.trim()) {
            problems.push(`item ${id} missing`);
            return;
          }
          // The bar only takes occasion 0 / 2; anything else silently no-ops.
          if (item.occasion !== 0 && item.occasion !== 2) {
            problems.push(`${item.name} is not usable on the map (occasion ${item.occasion})`);
          }
          if (!granted[id]) problems.push(`${item.name} is not in the origin's loadout`);
          if (id === STARTER_HEALING_POTION[0] || id === STARTER_MANA_TONIC[0]) {
            problems.push(`${item.name} is already a staple on slots 1-3`);
          }
        });
        if (new Set(picks).size !== picks.length) problems.push("duplicate picks");
      }
      if (problems.length > 0) {
        offenders.push({ origin: symbol, problems });
        console.warn(`CharacterCreation: ${symbol} favourites - ${problems.join("; ")}`);
      }
    });
    return offenders;
  }

  // How many characters the loadout is being sized for. The origin step is the
  // last one in the wizard, so the whole party already exists by then.
  function loadoutPartySize() {
    const size = $gameParty ? $gameParty.members().length : 0;
    return Math.max(1, size);
  }

  // <category:Tools> items are one per party however many members it has.
  function isToolItem(item) {
    return !!(item && item.note && /<category:\s*Tools\s*>/i.test(item.note));
  }

  // A loadout row can name an item, a weapon or an armor; `kind` says which
  // database to read it from. Rows written without one are items, which is
  // every hand-authored row in ORIGIN_LOADOUTS above.
  function loadoutEntryData(entry) {
    if (!entry) return null;
    if (entry.kind === "weapon") return $dataWeapons[entry.id] || null;
    if (entry.kind === "armor") return $dataArmors[entry.id] || null;
    return $dataItems[entry.id] || null;
  }

  // --- Rolled loadouts -----------------------------------------------------
  // Two origins do not carry a fixed kit. The Arcanist's library and the
  // Mercenary's hardware are dealt out of the database, so no two parties start
  // with the same gear. What they must never do is change while the player is
  // reading them: the origin board redraws its right page on every cursor move,
  // and a kit that reshuffled as the player stepped through the list would be
  // impossible to choose between. So the deal is a pure function of ONE seed,
  // rolled once per creation run (_ccOriginRollSeed, cleared by the
  // characterCreation plugin command) and salted per origin. The dossier and
  // the grant call the same function and get the same answer, and stepping off
  // an origin and back onto it changes nothing.
  function originRollSeed() {
    if (!$gameSystem) return 1;
    if (!$gameSystem._ccOriginRollSeed) {
      $gameSystem._ccOriginRollSeed = Math.floor(Math.random() * 0x7ffffffe) + 1;
    }
    return $gameSystem._ccOriginRollSeed;
  }

  // mulberry32, the same small deterministic generator the rest of the project
  // uses for seeded content.
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function textSalt(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const rngInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
  const rngPick = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length)] : null);
  // `count` distinct entries, in the order they were drawn.
  function rngPickSome(rng, list, count) {
    const pool = (list || []).slice();
    const picked = [];
    while (picked.length < count && pool.length > 0) {
      picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return picked;
  }

  // Real database row: skips the blank padding entries and the
  // "<-- Category -->" dividers that separate the blocks.
  function isRealDbEntry(entry) {
    if (!entry || !entry.name) return false;
    const name = entry.name.trim();
    return name.length > 0 && !name.startsWith("<--");
  }

  // Price caps, in gold. Everything a rolled origin hands out is starting gear,
  // so the pools are cut by shop price the way the class starter weapons are:
  // cheap is what a beginner owns, and no stat scoring is involved.
  const WTYPE_STAFF = 6;                    // wands, staves, the grimoire family
  const RANGED_WTYPES = [7, 8, 9];          // Bow, Projectile, Gun
  const ATYPE_ROBE = 2;
  const ATYPE_LIGHT_ARMOR = 3;
  const ETYPE_HEAD = 3;
  const ETYPE_BODY = 4;
  const ETYPE_GEAR = 5;
  const PARAM_MAT = 4;                      // params index of Magic Attack
  const ARCANE_WEAPON_PRICE_CAP = 10000;    // a novice's first grimoire, not an archmage's
  const ARCANE_WEAPON_MIN_MAT = 5;          // below this a staff is a stick, not a focus
  const ARCANE_ROBE_PRICE_CAP = 10000;
  const GRIMOIRE_BOOK_PRICE_CAP = 100000;   // leaves out the 900,000g Forbidden Magic one
  const MAGIC_ITEM_PRICE_CAP = 10000;
  // A hired gun is armed, not improvising: the floors keep the slingshots and
  // the bent arrows out of a mercenary's hands without reaching the tier a
  // level 1 party has no business carrying.
  const RANGED_WEAPON_PRICE_FLOOR = 1500;
  const RANGED_WEAPON_PRICE_CAP = 9000;
  const FIELD_ARMOR_PRICE_FLOOR = 900;
  const FIELD_ARMOR_PRICE_CAP = 6000;
  const MEDICAL_ITEM_PRICE_CAP = 1500;
  const SURVIVAL_ITEM_PRICE_CAP = 6000;
  const MEDICINE_EFFECT_CODES = [11, 12, 22]; // recover HP, recover MP, remove state

  // Every pool a rolled origin draws from, derived from the live database so a
  // re-indexed Weapons.json or a newly authored grimoire is picked up without a
  // hardcoded id going stale. Built once: the databases are stable after load
  // and the dossier asks for this on every cursor move.
  let _originPoolCache = null;
  const ORIGIN_COMPONENT_PRICE_CAP = 60000;   // 600 euro, mundane and near-mundane parts

  function originPools() {
    if (_originPoolCache) return _originPoolCache;
    const inCategory = (entry, cat) =>
      new RegExp(`<category:\\s*${cat}\\s*>`, "i").test((entry && entry.note) || "");
    const byPrice = (a, b) => a.price - b.price;
    const weapons = $dataWeapons.filter((w) => isRealDbEntry(w) && w.price > 0);
    const armors = $dataArmors.filter((a) => isRealDbEntry(a) && a.price > 0);
    const items = $dataItems.filter((i) => isRealDbEntry(i) && i.price > 0);

    _originPoolCache = {
      // A grimoire in this database is a staff-type weapon that carries real
      // magic (a MAT bonus worth the name), plus anything actually named as a
      // book of spells. The MAT floor is what keeps the walking sticks and the
      // mop handles filed under Staff out of a spellcaster's hands.
      arcaneWeapons: weapons.filter((w) =>
        w.price <= ARCANE_WEAPON_PRICE_CAP &&
        ((w.wtypeId === WTYPE_STAFF && (w.params || [])[PARAM_MAT] >= ARCANE_WEAPON_MIN_MAT) ||
          /grimoire|grimorie|tome|codex|spellbook/i.test(w.name))
      ).sort(byPrice),
      // Robes (armor type 2) are the magical wardrobe: a body piece to wear and
      // a hat or a charm to go with it.
      robeBodies: armors.filter((a) =>
        a.atypeId === ATYPE_ROBE && a.etypeId === ETYPE_BODY && a.price <= ARCANE_ROBE_PRICE_CAP
      ).sort(byPrice),
      robeCharms: armors.filter((a) =>
        a.atypeId === ATYPE_ROBE && (a.etypeId === ETYPE_HEAD || a.etypeId === ETYPE_GEAR) &&
        a.price <= ARCANE_ROBE_PRICE_CAP
      ).sort(byPrice),
      // The school primers (items 1400+, one per magical discipline). They are
      // <category:Tools>, so the loadout clamps each to a single copy however
      // big the party: what varies is HOW MANY schools the party starts with.
      grimoireBooks: items.filter((i) =>
        /<Grimoire:/i.test(i.note || "") && i.price <= GRIMOIRE_BOOK_PRICE_CAP
      ).sort(byPrice),
      magicItems: items.filter((i) => inCategory(i, "Magic") && i.price <= MAGIC_ITEM_PRICE_CAP).sort(byPrice),
      rangedWeapons: weapons.filter((w) =>
        RANGED_WTYPES.includes(w.wtypeId) &&
        w.price >= RANGED_WEAPON_PRICE_FLOOR && w.price <= RANGED_WEAPON_PRICE_CAP
      ).sort(byPrice),
      fieldArmors: armors.filter((a) =>
        a.atypeId === ATYPE_LIGHT_ARMOR && a.etypeId === ETYPE_BODY &&
        a.price >= FIELD_ARMOR_PRICE_FLOOR && a.price <= FIELD_ARMOR_PRICE_CAP
      ).sort(byPrice),
      // A medic's bag, not a chemist's: only medicine that actually restores
      // HP or MP or clears a status, which is what leaves the recreational half
      // of the Medical shelf (cocaine, angel dust, opium) out of it.
      medicalItems: items.filter((i) =>
        inCategory(i, "Medical") && i.price <= MEDICAL_ITEM_PRICE_CAP &&
        (i.effects || []).some((e) => e && MEDICINE_EFFECT_CODES.includes(e.code))
      ).sort(byPrice),
      survivalItems: items.filter((i) => inCategory(i, "Survival") && i.price <= SURVIVAL_ITEM_PRICE_CAP).sort(byPrice),
      // The sealed shelf: one vial per disease in the library, each naming what
      // is in it. Read off the tag rather than the category so a vial is only
      // ever dealt when it really carries a disease id to open.
      diseaseVials: items.filter((i) => /<DiseaseVial:/i.test(i.note || "")).sort(byPrice),
      // The pharmacy proper, every item that actually treats something
      // (tools/health/gen_medicines.py writes the tag), which is what a carrier
      // keeps for the day their own stock turns on them.
      medicines: items.filter((i) => /<Medicine:/i.test(i.note || "")).sort(byPrice),
      // The 240 <Esoteric> spells the Arcanist studies. The 52 that also carry
      // <Forbidden> are left out: those are the end of a school, not the start
      // of one, and four of them dealt at level 1 would end the game before it
      // began.
      esotericSkills: $dataSkills.filter((s) =>
        isRealDbEntry(s) && s.meta && s.meta.Esoteric && !s.meta.Forbidden
      ),
      // The rites that actually call something onto the field: a Convokation
      // skill whose common event is one of SummonSystem's. Read off the event
      // rather than off a list of ids, so a rite added later is picked up
      // without touching this. <Forbidden> is left out, which is what keeps the
      // elder entity out of a level 1 spellbook.
      // Hyperdeck parts, capped well below the arcane end of the shelf: what
      // somebody scavenging components would plausibly have accumulated, not a
      // scrying mirror and a bottled storm.
      components: items.filter((i) =>
        inCategory(i, "Component") && i.price <= ORIGIN_COMPONENT_PRICE_CAP
      ).sort(byPrice),
      summonSkills: $dataSkills.filter((s) => {
        if (!isRealDbEntry(s) || (s.meta && s.meta.Forbidden)) return false;
        if (!/<category:\s*Convokation\s*>/i.test(s.note || "")) return false;
        return (s.effects || []).some((e) => {
          if (!e || e.code !== 44) return false;
          const event = $dataCommonEvents[e.dataId];
          return !!event && /^SUM: /.test(event.name || "");   // i18n-ignore: common event name
        });
      }),
    };
    return _originPoolCache;
  }

  const ARCANIST_SKILLS_PER_MEMBER = 4;
  const ARCANIST_BOOKS_MIN = 2;
  const ARCANIST_BOOKS_MAX = 4;
  const ARCANIST_RELICS_MIN = 3;
  const ARCANIST_RELICS_MAX = 5;
  const LOST_CONVOKER_SKILLS_PER_MEMBER = 8;
  const LOST_CONVOKER_FOCI_MIN = 2;
  const LOST_CONVOKER_FOCI_MAX = 4;
  const MERCENARY_MEDICINE_MIN = 4;
  const MERCENARY_MEDICINE_MAX = 6;
  const MERCENARY_SURVIVAL_MIN = 3;
  const MERCENARY_SURVIVAL_MAX = 5;
  const PLAGUE_VIALS_MIN = 10;
  const PLAGUE_VIALS_MAX = 14;
  const PLAGUE_MEDICINE_MIN = 5;
  const PLAGUE_MEDICINE_MAX = 7;
  const HYPERNET_PARTS_MIN = 12;
  const HYPERNET_PARTS_MAX = 20;
  const HYPERNET_PART_STACK_MIN = 1;
  const HYPERNET_PART_STACK_MAX = 4;

  // A rolled deal has two halves: `perMember` is the gear rolled for one
  // character (so it can be worn by the character it was rolled for) and
  // `entries` is the whole deal written as loadout rows, which is what the
  // dossier lists and what the grant hands over.
  function rollArcanistLoadout(rng, size) {
    const pools = originPools();
    const perMember = [];
    const entries = [];
    for (let i = 0; i < size; i++) {
      const weapon = rngPick(rng, pools.arcaneWeapons);
      const robe = rngPick(rng, pools.robeBodies);
      const charm = rngPick(rng, pools.robeCharms);
      const skills = rngPickSome(rng, pools.esotericSkills, ARCANIST_SKILLS_PER_MEMBER);
      perMember.push({
        weaponId: weapon ? weapon.id : 0,
        armorIds: [robe, charm].filter(Boolean).map((a) => a.id),
        skillIds: skills.map((s) => s.id),
      });
      if (weapon) entries.push({ kind: "weapon", id: weapon.id, qty: 1 });
      if (robe) entries.push({ kind: "armor", id: robe.id, qty: 1 });
      if (charm) entries.push({ kind: "armor", id: charm.id, qty: 1 });
    }
    rngPickSome(rng, pools.grimoireBooks, rngInt(rng, ARCANIST_BOOKS_MIN, ARCANIST_BOOKS_MAX))
      .forEach((book) => entries.push({ id: book.id, qty: 1 }));
    rngPickSome(rng, pools.magicItems, rngInt(rng, ARCANIST_RELICS_MIN, ARCANIST_RELICS_MAX))
      .forEach((relic) => entries.push({ id: relic.id, qty: 1, each: true }));
    return { perMember, entries };
  }

  // The Lost Convoker: no college, no coach, no idea where they are. What they
  // do have is a spellbook full of rites, because whatever put them down in the
  // middle of nowhere was one of them.
  function rollLostConvokerLoadout(rng, size) {
    const pools = originPools();
    const perMember = [];
    const entries = [];
    for (let i = 0; i < size; i++) {
      const staff = rngPick(rng, pools.arcaneWeapons);
      const robe = rngPick(rng, pools.robeBodies);
      const rites = rngPickSome(rng, pools.summonSkills, LOST_CONVOKER_SKILLS_PER_MEMBER);
      perMember.push({
        weaponId: staff ? staff.id : 0,
        armorIds: robe ? [robe.id] : [],
        skillIds: rites.map((s) => s.id),
      });
      if (staff) entries.push({ kind: "weapon", id: staff.id, qty: 1 });
      if (robe) entries.push({ kind: "armor", id: robe.id, qty: 1 });
    }
    rngPickSome(rng, pools.magicItems, rngInt(rng, LOST_CONVOKER_FOCI_MIN, LOST_CONVOKER_FOCI_MAX))
      .forEach((focus) => entries.push({ id: focus.id, qty: 1 }));
    return { perMember, entries };
  }

  function rollMercenaryLoadout(rng, size) {
    const pools = originPools();
    const perMember = [];
    const entries = [];
    for (let i = 0; i < size; i++) {
      const weapon = rngPick(rng, pools.rangedWeapons);
      const vest = rngPick(rng, pools.fieldArmors);
      perMember.push({
        weaponId: weapon ? weapon.id : 0,
        armorIds: vest ? [vest.id] : [],
        skillIds: [],
      });
      if (weapon) entries.push({ kind: "weapon", id: weapon.id, qty: 1 });
      if (vest) entries.push({ kind: "armor", id: vest.id, qty: 1 });
    }
    rngPickSome(rng, pools.medicalItems, rngInt(rng, MERCENARY_MEDICINE_MIN, MERCENARY_MEDICINE_MAX))
      .forEach((med) => entries.push({ id: med.id, qty: rngInt(rng, 1, 2), each: true }));
    rngPickSome(rng, pools.survivalItems, rngInt(rng, MERCENARY_SURVIVAL_MIN, MERCENARY_SURVIVAL_MAX))
      .forEach((kit) => entries.push({ id: kit.id, qty: 1 }));
    return { perMember, entries };
  }

  // The Plague Spreader carries the library rather than a kit: a case of sealed
  // vials off the disease shelf and the pharmacy to survive owning them. No
  // weapon, no armour and nothing taught, so there is no perMember share.
  function rollPlagueSpreaderLoadout(rng) {
    const pools = originPools();
    const entries = [];
    rngPickSome(rng, pools.diseaseVials, rngInt(rng, PLAGUE_VIALS_MIN, PLAGUE_VIALS_MAX))
      .forEach((vial) => entries.push({ id: vial.id, qty: 1 }));
    rngPickSome(rng, pools.medicines, rngInt(rng, PLAGUE_MEDICINE_MIN, PLAGUE_MEDICINE_MAX))
      .forEach((med) => entries.push({ id: med.id, qty: 2, each: true }));
    return { perMember: [], entries };
  }

  // Hypernet Explorer: a heap of loose parts and nothing else. Both HOW MANY
  // distinct parts and HOW MANY of each are rolled, which is what makes it a
  // heap rather than a list, and the dossier states every count exactly because
  // it reads these same rows.
  function rollHypernetExplorerLoadout(rng) {
    const pools = originPools();
    const entries = [];
    rngPickSome(rng, pools.components, rngInt(rng, HYPERNET_PARTS_MIN, HYPERNET_PARTS_MAX))
      .forEach((part) => entries.push({
        id: part.id,
        qty: rngInt(rng, HYPERNET_PART_STACK_MIN, HYPERNET_PART_STACK_MAX),
      }));
    return { perMember: [], entries };
  }

  const ORIGIN_ROLLS = {
    origin_arcanist: rollArcanistLoadout,
    origin_mercenary: rollMercenaryLoadout,
    origin_lost_convoker: rollLostConvokerLoadout,
    origin_plague: rollPlagueSpreaderLoadout,
    origin_hypernet_explorer: rollHypernetExplorerLoadout,
  };

  // The deal for an origin, memoized on what it is a function of (the run's
  // seed, the origin and the party size) so the board is not re-rolling the
  // whole database on every keypress.
  let _originRollCache = {};
  function originRoll(symbol) {
    const roller = ORIGIN_ROLLS[symbol];
    if (!roller) return null;
    const size = loadoutPartySize();
    const seed = originRollSeed();
    const key = `${symbol}:${seed}:${size}`;
    if (!_originRollCache[key]) {
      _originRollCache[key] = roller(seededRng((seed ^ textSalt(symbol)) >>> 0), size);
    }
    return _originRollCache[key];
  }

  // How many Hyperdeck parts this run's Hypernet Explorer was dealt, counting
  // the stacks and not the rows, so the dossier states the size of the heap.
  function hypernetPartCount() {
    const roll = originRoll("origin_hypernet_explorer");
    if (!roll) return 0;
    return roll.entries.reduce((total, entry) => total + (entry.qty || 0), 0);
  }

  // How many sealed vials this run's Plague Spreader was dealt, so the dossier
  // states the size of the case rather than "a lot". Counted off the same rolled
  // entries the grant hands over, never a second roll.
  function plagueVialCount() {
    const roll = originRoll("origin_plague");
    if (!roll) return 0;
    return roll.entries.filter((entry) => {
      const data = loadoutEntryData(entry);
      return !!data && /<DiseaseVial:/i.test(data.note || "");
    }).length;
  }

  // Called when a fresh creation run begins: the next party is dealt a new kit.
  function resetOriginRoll() {
    if ($gameSystem) $gameSystem._ccOriginRollSeed = 0;
    _originRollCache = {};
  }

  // The resolved loadout of an origin: its own kit and nothing else, quantities
  // already scaled to the party. Rows with the same entry are merged so the
  // dossier lists each one exactly once.
  function resolveOriginLoadout(symbol) {
    const size = loadoutPartySize();
    const rolled = originRoll(symbol);
    const entries = (ORIGIN_LOADOUTS[symbol] || []).concat(rolled ? rolled.entries : []);
    const merged = [];
    const byKey = {};
    for (const entry of entries) {
      const data = loadoutEntryData(entry);
      if (!data) continue;
      const kind = entry.kind || "item";
      const key = `${kind}:${entry.id}`;
      const qty = isToolItem(data) ? 1 : entry.qty * (entry.each ? size : 1);
      if (byKey[key]) {
        byKey[key].qty = isToolItem(data) ? 1 : byKey[key].qty + qty;
      } else {
        byKey[key] = { kind, id: entry.id, qty };
        merged.push(byKey[key]);
      }
    }
    return merged;
  }

  function grantOriginLoadout(symbol) {
    // The Vehicles tab may already have handed over the very keys this origin
    // deals (the camper, car and bike starts each list one), so a vehicle item
    // the party is holding is not dealt a second time.
    const CCV = window.CCStartVehicles;
    const vehicleItemIds = CCV && CCV.itemIds ? CCV.itemIds() : [];
    for (const entry of resolveOriginLoadout(symbol)) {
      if ((entry.kind || "item") === "item" && vehicleItemIds.indexOf(entry.id) >= 0) {
        const owned = (typeof $dataItems !== "undefined" && $dataItems[entry.id])
          ? $gameParty.hasItem($dataItems[entry.id]) : false;
        if (owned) continue;
      }
      const data = loadoutEntryData(entry);
      if (data) {
        $gameParty.gainItem(data, entry.qty);
      } else {
        console.warn(`CharacterCreation: starting ${entry.kind} ${entry.id} not found.`);
      }
    }
    // The party is holding the kit now, so its three signature items can take
    // hotbar 4-6 (the staples took 1-3 in giveStarterStaples).
    bindOriginFavorites(symbol);
  }

  // Cash the party will be holding once creation ends, in euros: the base
  // allowance plus every member's class and trait money (giveStartingMoney,
  // which runs at the end of this step), plus whatever the origin adds. Used by
  // the dossier so the money on offer is stated as a number, never as "rich".
  function plannedStartingEuros(symbol) {
    let gold = $gameParty ? $gameParty.gold() : 0;
    if (!$gameSystem._ccStartingMoneyGiven) {
      gold += CC_BASE_START_GOLD + scenarioGoldBonus(symbol);
      $gameParty.members().forEach((actor) => {
        const NC = window.NPCCreature;
        if (NC && NC.isNonSentientActor(actor)) return;
        gold += classStartingMoney(actor._classId) + traitStartingMoney(actor) + wealthStartingMoney(actor);
      });
    }
    return Math.floor(gold / 100); // 100 gold = €1
  }

  // Augmented origin: everybody walks out of the clinic already carrying
  // hardware. What each member gets is rolled from the sockets their OWN
  // anatomy has, through Health_Core's name matcher, so a creature is fitted
  // in its BODY or its wings rather than in a humanoid's torso, and a socket
  // is only ever used once. The dearest augments are left in the catalogue:
  // this is a start, not a treasure chest.
  const AUGMENTED_ORIGIN_MIN = 2;
  const AUGMENTED_ORIGIN_MAX = 3;
  const AUGMENTED_ORIGIN_MAX_COST = 500000; // 5,000 EUR a piece

  // Card Collector origin: the party arrives with a shelf already built and a
  // legal deck already sleeved, so the first person they meet can be played
  // rather than asked for a booster pack.
  const CARD_ORIGIN_CARDS = 100;

  // Every OTHER start is handed enough to sit down at a table with a little
  // room to move: a legal deck is nine cards, and two spare copies are what
  // makes it a deck the player can change rather than the only hand they own.
  // The card game is part of the world rather than one scenario's toy, and a
  // party that cannot make a legal deck is simply refused a duel. It is not
  // listed on the origin dossier because it is not what makes an origin what
  // it is.
  const CARD_MINIMUM_SPARE = 2;

  function grantMinimumCards() {
    const CG = window.CardGame;
    if (!CG) return;
    CG.ensureStarterEffects();
    const short = CG.DECK_MIN + CARD_MINIMUM_SPARE - CG.totalOwned();
    if (short > 0) dealCards(short);
  }

  function grantStartingCards() {
    const CG = window.CardGame;
    if (!CG) {
      console.warn("CharacterCreation: card collector origin needs Cards/CardGameCore; no cards were dealt.");
      return;
    }
    // The five effect cards come with any party; these are on top of them.
    CG.ensureStarterEffects();
    dealCards(CARD_ORIGIN_CARDS);

    // Sleeved and ready: the strongest legal deck the shelf can make, saved as
    // the active one so a duel never has to be built first.
    const cards = CG.autoDeck();
    if (CG.deckLegality(cards).ok) {
      CG.saveDeck(null, { name: T('CharCreate.cardCollectorDeckName'), cards });
      CG.setActiveDeck(CG.decks().length - 1);
    }
  }

  // A spread rather than a pile of commons: the rarity table a booster rolls
  // on, run often enough to fill the shelf, with the streak bonus off.
  function dealCards(count) {
    const CG = window.CardGame;
    const rolled = [];
    while (rolled.length < count) {
      const pack = CG.rollBooster(CG.PACK_SIZE, {});
      if (!pack.length) break; // an empty catalogue never loops forever
      for (const key of pack) {
        if (rolled.length < count) rolled.push(key);
      }
    }
    for (const key of rolled) CG.addCard(key, 1);
  }

  function grantStartingAugments() {
    const types = window.Health && window.Health.ProstheticTypes;
    const api = window.HealthCore;
    if (!types || !api || !api.implantsForPart) {
      console.warn("CharacterCreation: augmented origin needs Health_Core; nobody was fitted.");
      return;
    }
    for (const actor of $gameParty.members()) {
      if (!actor._bodyParts && api.ensureBodyPartSkills) api.ensureBodyPartSkills(actor);
      const sockets = Object.keys(actor._bodyParts || {});
      if (!sockets.length) continue;
      // Walk the sockets in a random order and fit the first affordable thing
      // each one accepts, until this member has their share.
      const shuffled = sockets.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const wanted = AUGMENTED_ORIGIN_MIN +
        Math.floor(Math.random() * (AUGMENTED_ORIGIN_MAX - AUGMENTED_ORIGIN_MIN + 1));
      let fitted = 0;
      for (const partKey of shuffled) {
        if (fitted >= wanted) break;
        if (actor._prosthetics && actor._prosthetics[partKey]) continue;
        const candidates = api.implantsForPart(partKey).filter((key) => {
          const augment = types[key];
          return augment && (augment.cost || 0) <= AUGMENTED_ORIGIN_MAX_COST;
        });
        if (!candidates.length) continue;
        const key = candidates[Math.floor(Math.random() * candidates.length)];
        if (window.ProstheticShop && window.ProstheticShop.installImplant) {
          window.ProstheticShop.installImplant(actor, partKey, key);
          fitted++;
        }
      }
    }
  }

  // Arcanist / Mercenary origins: the gear was already handed over by
  // grantOriginLoadout (one table, one list, the same rows the dossier
  // promised), so all that is left is to put the pieces rolled FOR a member ON
  // that member and, for the arcanist, to teach the four spells they studied.
  // Everything here reads the same deal the board showed, so what the player
  // saw is what they are wearing.
  function applyRolledPersonalGear(symbol) {
    const roll = originRoll(symbol);
    if (!roll) return;
    const members = $gameParty.members();
    members.forEach((actor, index) => {
      const share = roll.perMember[index];
      if (!share) return;
      (share.skillIds || []).forEach((skillId) => {
        if ($dataSkills[skillId]) actor.learnSkill(skillId);
      });
      const wear = (gear) => {
        if (!gear || !actor.canEquip(gear)) return;
        // The first free slot that would take this piece. A hand takes a
        // weapon or a shield alike, so the type alone no longer names a slot
        // (ItemSystem/ItemSystemEquipment.js, window.HandSlots).
        const slots = actor.equipSlots();
        for (let slotId = 0; slotId < slots.length; slotId++) {
          if (actor.equips()[slotId]) continue;
          const fits = window.HandSlots
            ? window.HandSlots.hasRoomFor(actor, slotId, gear)
            : slots[slotId] === (gear.etypeId || 1);
          if (!fits) continue;
          try {
            actor.changeEquip(slotId, gear);
            return;
          } catch (e) {
            /* incompatible slot - try the next one it could go in */
          }
        }
      };
      wear($dataWeapons[share.weaponId]);
      (share.armorIds || []).forEach((id) => wear($dataArmors[id]));
    });
  }

  function startArcanistOrigin() {
    applyRolledPersonalGear("origin_arcanist");
    startWorldMapPickerOrigin();
  }

  function startMercenaryOrigin() {
    applyRolledPersonalGear("origin_mercenary");
    startWorldMapPickerOrigin();
  }

  // Lost Convoker origin: the rite worked, and it put them down somewhere
  // nobody picked. Unlike the castaway's hand-written spots this is a genuinely
  // random square of the world, which is the same landing the empty-lot origin
  // gets.
  function startLostConvokerOrigin() {
    applyRolledPersonalGear("origin_lost_convoker");
    if (startOnProceduralSquare({ rng: Math.random })) return;
    console.warn("CharacterCreation: no overland square for the lost-convoker origin; starting at the tower gate instead.");
    startDungeonOrigin();
  }

  // Hypernet Explorer origin: the Hypernet Point (map 1), the terminal room in
  // the Omega Tower, facing down. A fixed address rather than a random house:
  // the origin begins among the machines it is about, and the tower square is
  // the anchor the party returns to.
  const HYPERNET_ORIGIN = { mapId: 1, x: 26, y: 33, dir: 2 };

  function startHypernetExplorerOrigin() {
    // The one origin that already lives inside a Hyperdeck. Every other party
    // is handed a cupboard cast-off built out of the scrap end of the
    // catalogue; this one gets a deck rolled from the whole of it.
    try {
      if (window.HyperDeck && window.HyperDeck.rollStartingDeck) {
        window.HyperDeck.rollStartingDeck(Math.random, { everything: true, mustBoot: true });
      }
    } catch (e) {
      console.warn("CharacterCreation: could not re-roll the starting Hyperdeck.", e);
    }
    anchorAtOmegaTower();
    $gamePlayer.reserveTransfer(
      HYPERNET_ORIGIN.mapId, HYPERNET_ORIGIN.x, HYPERNET_ORIGIN.y, HYPERNET_ORIGIN.dir, 0
    );
  }

  // Dungeon-entrance origin: the OmegaTower interior gate (map 635), facing up.
  const DUNGEON_ORIGIN = { mapId: 635, x: 13, y: 37, dir: 8 };

  // Dungeon-entrance origin: start at the tower gate with the delve kit its
  // loadout lists (extra potions, routes map, flashlight, climbing rope). It
  // used to hand out random items until the party's carry limit was full, which
  // no dossier could state honestly.
  //
  // Also the fallback landing of every origin whose own square could not be
  // built, so the anchor is written here too: whoever ends up at the gate is
  // from the gate. Those fallbacks are only ever reached before anything was
  // anchored (the square that failed to build never wrote one), so this cannot
  // move an anchor another origin already meant.
  function startDungeonOrigin() {
    anchorAtOmegaTower();
    $gamePlayer.reserveTransfer(
      DUNGEON_ORIGIN.mapId, DUNGEON_ORIGIN.x, DUNGEON_ORIGIN.y, DUNGEON_ORIGIN.dir, 0
    );
  }

  // Diplomat origin: the ONU assembly's seat of business, Brussels (map 400).
  const DIPLOMAT_ORIGIN = { mapId: 400, x: 41, y: 15, dir: 2 }; // facing down
  const DIPLOMAT_PLACE = "Brusselles";  // the assembly's town: the anchor's world square

  // Diplomat origin: start in Brussels with the ONU Terminal its loadout lists,
  // remote access into the assembly (see ONUAssembly.js).
  function startDiplomatOrigin() {
    anchorAtPlace(DIPLOMAT_PLACE, { x: 89, y: 121 });
    $gamePlayer.reserveTransfer(
      DIPLOMAT_ORIGIN.mapId, DIPLOMAT_ORIGIN.x, DIPLOMAT_ORIGIN.y, DIPLOMAT_ORIGIN.dir, 0
    );
  }

  // Guaranteed gold hoards down in the bunker. ProceduralMapBiomeGenerator owns
  // the number and publishes it; read at render time because that plugin loads
  // after this one.
  function bunkerGoldPiles() {
    return (window.WorldGen && window.WorldGen.BUNKER_GOLD_PILES) || 6;
  }

  // Bunker origin: the party wakes up in a sealed loot cellar under a random
  // overland world square. ProceduralMapBiomeGenerator picks the square, builds
  // its surface map with a permanent StairsDown hatch stamped on it, and
  // guarantees the gold hoards down in the cellar; stepping onto the cellar's
  // border climbs out through that hatch (WorldMapReturn's 'bunker' session),
  // and the hatch stays there forever, so the bunker can always be gone back to.
  function startBunkerOrigin() {
    const record = $gameSystem.prepareBunkerOrigin ? $gameSystem.prepareBunkerOrigin() : null;
    if (!record) {
      console.warn("CharacterCreation: bunker origin unavailable; starting at the tower gate instead.");
      startDungeonOrigin();
      return;
    }
    // Generates the cellar at the bunker's world square and reserves the
    // transfer into it. The seed is the square's own, so descending the hatch
    // later rebuilds this very cellar.
    PluginManager.callCommand(
      $gameMap._interpreter || {}, "WorldMapReturn", "startForcedBiome", { Biome: "LootCellar" }
    );
    const pg = $gameSystem._procGenData;
    if (!pg) return;
    // Creation started from the world map re-anchors the square to the player's
    // own world position (startForcedBiome calls generateProceduralMap there).
    // Follow it, so the cellar just generated and the hatch stamped on the
    // surface stay on the same square; the exit rebuilds that surface and
    // re-records the hatch tile.
    if (pg.originX !== record.worldX || pg.originY !== record.worldY) {
      record.worldX = pg.originX;
      record.worldY = pg.originY;
      record.biome = ($gameSystem.getBiomeFromCache
        ? $gameSystem.getBiomeFromCache(pg.originX, pg.originY)
        : null) || "Fields";
      record.entranceX = null;
      record.entranceY = null;
    }
    // Anchored on the square the cellar was actually dug under, after the
    // re-anchor above has had its say, so home ground is the hatch they climb
    // out of rather than the square the bunker was first proposed for.
    anchorAt(record.worldX, record.worldY);
    pg._dungeonSession = { type: "bunker" };
  }

  // Artifact Heir origin: inherit one of the world's 13 generated historical
  // artifacts (HistorySimulator.js ids 1501-1513, each existing as an item,
  // a weapon AND an armor variant) at random, with whatever provenance the
  // history sim rolled for it. Spawn is the full city picker (the train's own
  // three-station whitelist belongs to origin_train alone); the artifact itself
  // is the one random part of any origin's loadout.
  function startArtifactHeirOrigin() {
    const artifactId = 1501 + Math.floor(Math.random() * 13);
    const kinds = [
      { key: "items", data: $dataItems },
      { key: "weapons", data: $dataWeapons },
      { key: "armors", data: $dataArmors },
    ];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const artifact = kind.data[artifactId];
    if (artifact) {
      $gameParty.gainItem(artifact, 1);
      const record = window.HistoryManager && window.HistoryManager.getArtifactRecord
        ? window.HistoryManager.getArtifactRecord(`${kind.key}:${artifactId}`)
        : null;
      if (record) {
        console.log(`CharacterCreation: Artifact Heir inherits the ${record.name} (${record.origin} ${record.action}, ${record.date}).`);
      }
      // The world is told the day it changed hands: the chain of holders this
      // artifact has carried since 1900 gains the party as its newest link,
      // and the Archive carries the inheritance alongside it.
      if (window.HistoryManager && window.HistoryManager.recordArtifactCustody) {
        const leader = $gameParty.leader();
        if (leader) {
          try {
            window.HistoryManager.recordArtifactCustody(kind.key, artifactId, leader.name(), "inherited");
          } catch (e) {
            console.warn("CharacterCreation: artifact custody record failed", e);
          }
        }
      }
    } else {
      console.warn(`CharacterCreation: artifact ${kind.key}:${artifactId} not found; artifact heir origin gave nothing.`);
    }
    startWorldMapPickerOrigin();
  }

  // Crash Landed origin (WIP): the party is stranded on a random planet in an
  // uncharted, randomly-seeded galaxy. The starship survives the crash but is
  // badly damaged, nearly out of local fuel and completely out of SB-Bridge
  // (Schrodingerite) jump charges; the low orbit pin (item 166, same one the
  // Space origin grants) marks the way back once repairs and refueling make
  // the ship flight-worthy again.
  function pickRandomCrashPlanet() {
    if (!window.GalaxySim || !window.GalaxySim.getDataManager) return null;
    const dm = window.GalaxySim.getDataManager();
    const gxSeed = Math.floor(Math.random() * 0x7fffffff);
    const systems = dm.generateGalaxySystems(gxSeed) || [];
    const withPlanets = systems.filter((s) => s.planets && s.planets.length > 0);
    if (!withPlanets.length) return null;
    const system = withPlanets[Math.floor(Math.random() * withPlanets.length)];
    const planet = system.planets[Math.floor(Math.random() * system.planets.length)];
    return { system, planet, gxSeed };
  }

  const CRASH_LANDED_FUEL = 200;        // out of a 10,000-unit map-fuel tank (var 95)
  const CRASH_LANDED_HYPERFLUX = 500;   // out of 92,000
  const CRASH_SHIP_DAMAGE_PERCENT = 70; // heavy damage, several critical parts near/at 0

  function startCrashLandedOrigin() {
    // Wherever the wreck ended up, Earth is measured from the pad they were
    // trying to get back to (see anchorAtSpaceCenter).
    anchorAtSpaceCenter();
    const pick = pickRandomCrashPlanet();
    if (!pick) {
      console.warn("CharacterCreation: GalaxySim unavailable; crash-landed origin fell back to a plain space start.");
      $gamePlayer.reserveTransfer(721, 27, 7, 2, 0);
      return;
    }

    const dm = window.GalaxySim.getDataManager();
    // Every other start leaves the ship at its default berth in Earth orbit
    // (StarMapDataManager.parkAtHomeOrbit); this one crashed it here, so the
    // ship's own position has to follow the party to the wreck site.
    dm.teleportToPlanetOrbit(pick.system.name, pick.planet.name);
    if ($gameSystem) $gameSystem._shipOrbitEarthInit = true;
    $gameVariables.setValue(95, CRASH_LANDED_FUEL);
    dm.setHyperflux(CRASH_LANDED_HYPERFLUX);
    dm.setSchrodingerite(0);

    // Marks the crash site so the party can find their way back once the
    // ship flies again; consumed wherever a "return to crash site" option is
    // added (WIP: no such consumer exists yet).
    $gameSystem._crashSitePin = {
      kind: "planet",
      name: pick.planet.name,
      systemName: pick.system.name,
      galaxySeed: pick.gxSeed,
    };

    if (window.VehicleSystemRepair) {
      window.VehicleSystemRepair.initializeVehicleHealth();
      window.VehicleSystemRepair.applyDamage("airship", CRASH_SHIP_DAMAGE_PERCENT);
    }

    window.GalaxySim.enterPlanetSurface(pick.planet, {});
  }

  // Independent Warlord origin: start with a mixed roster of 40 random troops
  // drawn from random factions (ArmyManager.js), with no faction reputation
  // change (the party owes allegiance to no one) and enough gold to cover two
  // weeks of upkeep for the granted troops. Spawn is the full city picker: an
  // army does not ride in on the beginners' train.
  const WARLORD_TROOP_COUNT = 40;

  function startWarlordOrigin() {
    if (window.ArmyManager && window.ArmyManager.grantRandomTroopsMixed) {
      window.ArmyManager.grantRandomTroopsMixed(WARLORD_TROOP_COUNT);
    }
    if (typeof $gameArmy !== "undefined" && $gameArmy) {
      const upkeep = $gameArmy.getTotalWeeklyCost() * 2; // 2 weeks of upkeep
      if (upkeep > 0) $gameParty.gainGold(upkeep);
    }
    // This path returned out of _finishOriginChoice before its cull ran.
    cullStartingOverload();
    startWorldMapPickerOrigin();
  }

  // Faction Leader / Deserter origins: both let the player pick a faction
  // through the same Factions menu (Scene_FactionStatus, in selection mode)
  // and grant 40 troops of that faction. Faction Leader sets reputation with
  // the faction AND its parent chain positive and grants 2 weeks of troop
  // upkeep money; Deserter sets the same chain negative (having deserted, not
  // been given leave) and grants no upkeep money.
  const FACTION_ORIGIN_TROOP_COUNT = 40;
  const FACTION_ORIGIN_REPUTATION = 50;

  function finishFactionOrigin(factionId, isPositive) {
    if (window.ArmyManager && window.ArmyManager.grantRandomTroops) {
      window.ArmyManager.grantRandomTroops(factionId, FACTION_ORIGIN_TROOP_COUNT);
    }
    if (typeof $gameFactions !== "undefined" && $gameFactions && $gameFactions.changeReputationWithParents) {
      $gameFactions.changeReputationWithParents(
        factionId, isPositive ? FACTION_ORIGIN_REPUTATION : -FACTION_ORIGIN_REPUTATION
      );
    }
    if (isPositive && typeof $gameArmy !== "undefined" && $gameArmy) {
      const upkeep = $gameArmy.getTotalWeeklyCost() * 2; // 2 weeks of upkeep
      if (upkeep > 0) $gameParty.gainGold(upkeep);
    }
    startWorldMapPickerOrigin();
  }

  // Pauses the wizard (same pause/resume pattern as creature creation, via
  // window.Scene_CharacterCreation._interruptedStep) and pushes Scene_FactionStatus
  // on top of it in selection mode. _interruptedStep is set to ORIGIN, the
  // very last step, so once Scene_FactionStatus pops back to a freshly
  // (re)constructed window.Scene_CharacterCreation, its step index lands past the
  // end of CharacterCreationData and the wizard pops itself immediately,
  // matching what every other origin does at the end of its handler.
  function startFactionPickerOrigin(isPositive) {
    if (!window.Scene_FactionStatus || typeof $gameFactions === "undefined" || !$gameFactions) {
      console.warn("CharacterCreation: FactionDataManager unavailable; faction origin skipped.");
      startWorldMapPickerOrigin();
      return;
    }
    window.Scene_CharacterCreation._interruptedStep = ccKit().STEP.ORIGIN;
    window.Scene_CharacterCreation._resumeOnStep = false;
    SceneManager.push(window.Scene_FactionStatus);
    SceneManager.prepareNextScene("select", (factionId) => {
      finishFactionOrigin(factionId, isPositive);
    });
  }

  // --- Starting encumbrance ----------------------------------------------
  // A scenario's loadout is written for its story, not for the party's back:
  // between the staples, the spare gear and a heavy origin kit a fresh party
  // could begin over its carrying weight and crawl out of the first map. Once
  // every grant of the origin step has run, the pack is trimmed from the top
  // down (heaviest unequipped stack first, one unit at a time) until the load
  // sits at CC_START_LOAD_TARGET of the party's capacity. Equipped gear is
  // never touched, and neither is anything weightless.
  const CC_START_LOAD_TARGET = 0.8;

  // Every unequipped stack the party is holding, as {data, count, weight},
  // heaviest single unit first.
  function unequippedStacks(utils) {
    const stacks = [];
    const add = (data, count) => {
      if (!data || count <= 0) return;
      const weight = utils.getItemWeight(data);
      if (weight > 0) stacks.push({ data: data, count: count, weight: weight });
    };
    $gameParty.items().forEach((item) => add(item, $gameParty.numItems(item)));

    const weapons = Object.assign({}, $gameParty._weapons);
    const armors = Object.assign({}, $gameParty._armors);
    $gameParty.members().forEach((actor) => {
      actor.equips().forEach((equip) => {
        if (!equip) return;
        if (DataManager.isWeapon(equip) && weapons[equip.id]) weapons[equip.id]--;
        else if (DataManager.isArmor(equip) && armors[equip.id]) armors[equip.id]--;
      });
    });
    Object.keys(weapons).forEach((id) => add($dataWeapons[id], weapons[id]));
    Object.keys(armors).forEach((id) => add($dataArmors[id], armors[id]));

    stacks.sort((a, b) => b.weight - a.weight);
    return stacks;
  }

  function cullStartingOverload() {
    const utils = window.ItemSystemUtils;
    if (!utils || !$gameParty || $gameParty.members().length === 0) return;

    const target = utils.calculateMaxCarryWeight() * CC_START_LOAD_TARGET;
    if (target <= 0) return;
    utils.invalidateWeightCache();
    if (utils.calculateTotalWeight() <= target) return;

    let load = utils.calculateTotalWeight();
    const stacks = unequippedStacks(utils);
    for (const stack of stacks) {
      while (stack.count > 0 && load > target) {
        $gameParty.loseItem(stack.data, 1);
        stack.count--;
        load -= stack.weight;
      }
      if (load <= target) break;
    }
    utils.invalidateWeightCache();
  }

  window.CCOrigins = {
    giveStartingSupplies,
    rollStarterFoods,
    starterFoodPool,
    CC_START_LOAD_TARGET,
    cullStartingOverload,
    CC_BASE_START_GOLD,
    classStartingMoney,
    selectedTraitObjects,
    selectedTraitIds,
    traitStartingMoney,
    wealthStartingMoney,
    scenarioGoldBonus,
    giveStartingMoney,
    proceduralMapId,
    startOnProceduralSquare,
    startVehicleOrigin,
    startCriminalOrigin,
    startCEOOrigin,
    startBikeOrigin,
    CRAFTING_SPEC_IDS,
    startEmptyLotOrigin,
    startStrandedOrigin,
    anchorAtSpaceCenter,
    startsAtOmegaTower,
    startAtOmegaTower,
    startWorldMapPickerOrigin,
    startMayorOrigin,
    captureOriginSnapshot,
    clearOriginSnapshot,
    reopenOriginStep,
    ORIGIN_LOADOUTS,
    loadoutEntryData,
    ARCANIST_SKILLS_PER_MEMBER,
    LOST_CONVOKER_SKILLS_PER_MEMBER,
    originRoll,
    hypernetPartCount,
    plagueVialCount,
    resetOriginRoll,
    resolveOriginLoadout,
    grantOriginLoadout,
    plannedStartingEuros,
    AUGMENTED_ORIGIN_MIN,
    AUGMENTED_ORIGIN_MAX,
    CARD_ORIGIN_CARDS,
    grantMinimumCards,
    grantStartingCards,
    grantStartingAugments,
    startArcanistOrigin,
    startMercenaryOrigin,
    startLostConvokerOrigin,
    startHypernetExplorerOrigin,
    startDungeonOrigin,
    startDiplomatOrigin,
    bunkerGoldPiles,
    startBunkerOrigin,
    startArtifactHeirOrigin,
    startCrashLandedOrigin,
    startWarlordOrigin,
    finishFactionOrigin,
    startFactionPickerOrigin,
  };

  // The map every new game / permadeath reset lands on. Read here because
  // the starting map is the one place a freshly created party can be left
  // standing with nowhere to go, and the rescue below watches for exactly
  // that.
  const GAME_START_MAP_ID = 557;

  // --- Where an origin actually sets the party down --------------------------
  // The overland origins used to land on world map 315 and be walked onto a
  // passable tile of it once it had loaded. They begin on the ground of a
  // procedural square now (startOnProceduralSquare), which picks the SQUARE out
  // of the biome cache before the transfer is even reserved , but not the tile.
  // The square does not exist until it is generated, and the middle of a fresh
  // one is as likely to be the inside of a boulder, a tree trunk, a wall or a
  // pond as it is to be open ground. A party set down there is stuck in the
  // scenery, so the landing tile is settled here, once the terrain is real.
  //
  // A tile is somewhere to stand only if it can be walked off in every
  // direction (so no party member is boxed in by a feature drawn around them),
  // has nothing already standing on it, and is not a floor that hurts.
  //
  // "Can be walked off" is asked the way the player themselves asks it, through
  // Game_CharacterBase.canPass. The raw tileset flags (Game_Map.checkPassage)
  // are not the answer on a procedural square: every special terrain there is
  // layered on top of Game_Map.isPassable instead - deep water (region 99),
  // blocked tiles (region 10), the always-open path network (region 5 / 13),
  // cliffs, mountain (terrain tag 4) and ice (terrain tag 7). Read through the
  // flags alone a lake and a mountainside both look like open ground, which is
  // how an origin could still set the party down inside one.
  const CC_LANDING_DIRS = [2, 4, 6, 8];

  function ccCanStepOff(x, y, d) {
    return $gamePlayer.canPass(x, y, d);
  }

  // Something solid standing on the tile: an event that blocks a walker. Used
  // by the relaxed pass, which cares only about what makes a landing
  // impossible, not about what makes it untidy.
  function ccBlockingEventAt(x, y) {
    return $gameMap.eventsXy(x, y).some(
      (ev) => !ev._erased && ev.isNormalPriority() && !ev.isThrough()
    );
  }

  function ccIsStandableTile(x, y) {
    if (!$gameMap.isValid(x, y)) return false;
    if ($gameMap.eventsXy(x, y).length > 0) return false;
    if ($gameMap.isDamageFloor(x, y)) return false;
    return CC_LANDING_DIRS.every((d) => ccCanStepOff(x, y, d));
  }

  // The same question asked at its lowest bar: the party is not stuck here.
  // The tile can be walked off in at least ONE direction and nothing solid is
  // standing on it. Only ever a second pass, so a square whose open ground is
  // all narrow - a cave, a corridor, a walled yard, a jetty - still answers
  // with somewhere to put the party down instead of leaving them in the rock.
  function ccIsUnstuckTile(x, y) {
    if (!$gameMap.isValid(x, y)) return false;
    if (ccBlockingEventAt(x, y)) return false;
    // A floor that hurts is never a landing, however open it is: the relaxed
    // pass is there to get the party out of the rock, not to set them down on
    // lava because the tidy pass found nowhere better.
    if ($gameMap.isDamageFloor(x, y)) return false;
    return CC_LANDING_DIRS.some((d) => ccCanStepOff(x, y, d));
  }

  // The nearest tile to (cx, cy) the test answers for, walking outward in
  // square rings so the party lands as close to where they were aimed as the
  // terrain allows. Null when the whole map fails the test.
  function ccFindTileNear(cx, cy, test) {
    if (test(cx, cy)) return { x: cx, y: cy };
    const reach = Math.max($gameMap.width(), $gameMap.height());
    for (let ring = 1; ring < reach; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          // The ring itself, not the filled square inside it.
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (test(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return null;
  }

  // Somewhere to stand if the square holds one, and failing that anywhere the
  // party is at least not walled in. Answers null only for a square with no
  // walkable tile at all (open sea, which no origin lands on).
  function ccFindStandableTile(cx, cy) {
    return ccFindTileNear(cx, cy, ccIsStandableTile) ||
           ccFindTileNear(cx, cy, ccIsUnstuckTile);
  }

  // Move the party onto a tile they can stand on, if they are not on one
  // already. Deliberately a no-op when the tile the party is on can be walked
  // out of, so it does not fight the landings that are somebody else's to make:
  // VehicleSystem puts the vehicle origins down in a 4x4 clearing of its own
  // choosing (and leaves the player alone when it cannot find one, which is the
  // case this catches), and an origin that begins in a cellar or a cave means
  // the cramped tile it named. Only being walled in - or standing on a floor
  // that hurts - is overruled, and the tile it moves to is a properly open one
  // wherever the square holds any.
  function ccPlaceOnPassableTile() {
    const x = $gamePlayer.x, y = $gamePlayer.y;
    if (ccIsUnstuckTile(x, y) && !$gameMap.isDamageFloor(x, y)) return;
    const tile = ccFindStandableTile(x, y);
    if (!tile) {
      console.warn("CharacterCreation: nowhere to stand on the origin's square; the party was left where it landed.");
      return;
    }
    console.log(`CharacterCreation: landing tile (${x},${y}) cannot be stood on; the party was moved to (${tile.x},${tile.y}).`);
    $gamePlayer.locate(tile.x, tile.y);
  }

  // VehicleSystem places the vehicle origins itself, in a 4x4 clearing wide
  // enough to park in, and its own test is the looser of the two (it asks
  // whether a tile is passable, not whether anything is standing on it). It
  // calls this once it is done so the last word on where the party is standing
  // is always the same one. Read off window at call time, so which of the two
  // plugins loaded first does not matter.
  window.CCOriginPlacement = {
    placeOnStandableTile: ccPlaceOnPassableTile,
    isStandableTile: ccIsStandableTile,
  };

  const _CC_SceneMap_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    const enteringGameStartMap =
      $gamePlayer.isTransferring() && $gamePlayer.newMapId() === GAME_START_MAP_ID;
    _CC_SceneMap_onMapLoaded.call(this);
    // The square an origin begins on has just been built: put the party on a
    // tile of it they can actually stand on.
    if ($gameTemp && $gameTemp._ccProcSquareLanding && $gameMap.mapId() === proceduralMapId()) {
      $gameTemp._ccProcSquareLanding = false;
      ccPlaceOnPassableTile();
    }
    // The same guarantee for every OTHER route a freshly created party reaches
    // the procedural map by: the bunker's cellar and any other forced biome
    // (started through WorldMapReturn rather than through
    // startOnProceduralSquare), a wrecked ship's alien surface, the square a
    // picker origin was walked onto. None of them raise the flag above, and all
    // of them are terrain generated a moment ago, with no guarantee that the
    // tile the transfer named is anything but the inside of a rock or the
    // middle of a lake. Answered once, on the first map the party is set down
    // on after creation, and only when that map is the procedural one.
    if ($gameTemp && $gameTemp._ccOriginLanding && $gameMap.mapId() !== GAME_START_MAP_ID) {
      $gameTemp._ccOriginLanding = false;
      if ($gameMap.mapId() === proceduralMapId()) ccPlaceOnPassableTile();
    }
    // Hide the player sprite the instant it lands on the game-start map, so it
    // never pops in mid-fade; Scene_Map.update below reveals it the moment the
    // fade-in completes.
    if (enteringGameStartMap) {
      $gamePlayer.setImage("", 0);
      if ($gameTemp) $gameTemp._ccRevealSpriteOnFadeIn = true;
    }
  };

  // --- Nobody is left standing in the empty carriage -----------------------
  // The starting map is not a place: it is the black, all but tileless room the
  // creation wizard is drawn over, and the party is only ever meant to pass
  // through it. Most origins leave it through the starting place picker, which
  // is asked for with a flag on $gameTemp and lands the party off a real-time
  // timer, and neither is watched by anything: a frame swallowed by an overlay,
  // a scene rebuilt at the wrong moment or a landing that threw all end the same
  // way, with the player walking around an empty black map and no way out of it.
  //
  // So the map answers for itself. Once an origin has been chosen and the party
  // is standing here with nothing pending at all, the picker is asked for again;
  // if that is not taken either, they are put on the beginners' train platform,
  // which is where the start map's own quickstart branch sends them.
  const START_MAP_RESCUE_DELAY = 90;      // frames of nothing happening first
  const START_MAP_RESCUE_LANDING = { mapId: 708, x: 19, y: 12, dir: 2 }; // Ghent platform

  // Everything that means "the party is on its way out of here after all".
  function ccStartMapIsSettled() {
    if (!$gameTemp) return true;
    if ($gamePlayer.isTransferring()) return true;
    if (SceneManager.isSceneChanging()) return true;
    if ($gameTemp._openCharacterCreationTrainTravel) return true;   // picker asked for
    if ($gameTemp._characterCreationTravelMode) return true;        // picker open
    if ($gameTemp._ccVehicleFieldStart) return true;                // a vehicle origin placing itself
    if (document.getElementById("travel-overlay")) return true;     // i18n-ignore  DOM id
    if ($gameMap.isEventRunning()) return true;                     // the start map's own autorun
    return false;
  }

  function ccStartMapNeedsRescue() {
    if (!$gameMap || $gameMap.mapId() !== GAME_START_MAP_ID) return false;
    if (!$gameSystem || !$gameSystem._ccOriginSymbol) return false; // no origin chosen yet
    return !ccStartMapIsSettled();
  }

  function ccRescueFromStartMap() {
    const attempt = ($gameTemp._ccStartMapRescues || 0) + 1;
    $gameTemp._ccStartMapRescues = attempt;
    if (attempt === 1) {
      console.warn("CharacterCreation: the party was left on the starting map with no journey to take; the starting place picker was asked for again.");
      $gameTemp._characterCreationTravelType =
        $gameSystem._ccOriginSymbol === "origin_train" ? "train" : "camper";
      $gameTemp._characterCreationTravelMode = true;
      $gameTemp._openCharacterCreationTrainTravel = true;
      return;
    }
    console.warn("CharacterCreation: the starting place picker did not take either; the party was put on the beginners' platform.");
    const t = START_MAP_RESCUE_LANDING;
    $gamePlayer.setMovementLock(false);
    $gamePlayer.reserveTransfer(t.mapId, t.x, t.y, t.dir, 0);
  }

  const _CC_SceneMap_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _CC_SceneMap_update.call(this);
    if ($gameTemp && $gameTemp._ccRevealSpriteOnFadeIn && !this.isFading()) {
      $gameTemp._ccRevealSpriteOnFadeIn = false;
      $gamePlayer.refresh();
    }
    // Counted in frames of the map actually running, so the wait is a wait the
    // player can see: every scene the wizard and the picker put on top of the
    // map stops it, and any of them being open resets the count anyway.
    if ($gameTemp && !this.isFading()) {
      if (ccStartMapNeedsRescue()) {
        $gameTemp._ccStartMapIdle = ($gameTemp._ccStartMapIdle || 0) + 1;
        if ($gameTemp._ccStartMapIdle >= START_MAP_RESCUE_DELAY) {
          $gameTemp._ccStartMapIdle = 0;
          ccRescueFromStartMap();
        }
      } else if ($gameTemp._ccStartMapIdle) {
        $gameTemp._ccStartMapIdle = 0;
      }
    }
  };
})();
