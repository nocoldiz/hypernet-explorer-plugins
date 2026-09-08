/*:
 * @target MZ
 * @plugindesc Opens a shop with a fixed-per-location item set (seeded by map coordinates and world seed) whose daily stock is rerolled each in-game day.
 * @author OmniLex
 *
 * @command openThemedShop
 * @text Open Themed Shop
 * @desc Opens a themed shop. Each type draws from its own staples, hand-picked list and item categories. Selection rerolls daily.
 *
 * @arg shopType
 * @text Shop Type
 * @type select
 * @option Academy Bookstore
 * @value academy
 * @option Adventurer's Outfitter
 * @value adventurer
 * @option Alchemist
 * @value alchemistry
 * @option Antiques Dealer
 * @value antiques
 * @option Arctic Outfitter
 * @value arcticOutfitter
 * @option Armorer
 * @value armorer
 * @option Augmentation Clinic
 * @value cyberClinic
 * @option Bakery
 * @value bakery
 * @option Betting Parlor
 * @value bettingParlor
 * @option Butcher
 * @value butcher
 * @option Camping Outfitter
 * @value camping
 * @option Casalinghi
 * @value casalinghi
 * @option Cheese & Deli
 * @value deli
 * @option Clothing Store
 * @value clothing
 * @option Coffee House
 * @value cafe
 * @option Drogheria
 * @value drogheria
 * @option Electronics Store
 * @value electronics
 * @option Enoteca
 * @value enoteca
 * @option Fast Food Joint
 * @value fastFood
 * @option Fertility Clinic
 * @value fertilityClinic
 * @option Fisherman's Shop
 * @value fisherman
 * @option Florist
 * @value florist
 * @option Garage
 * @value garage
 * @option General Store
 * @value generalStore
 * @option Gift Shop
 * @value giftShop
 * @option Greengrocer
 * @value greengrocer
 * @option Grimoire Emporium
 * @value grimoire
 * @option Gym Supplies
 * @value gym
 * @option Hardware Store
 * @value hardware
 * @option Hunter's Lodge
 * @value hunter
 * @option Ice Cream Parlor
 * @value iceCream
 * @option Jeweler
 * @value jeweler
 * @option Jungle Trader
 * @value jungleTrader
 * @option Junk Shop
 * @value junkShop
 * @option Liquor Store
 * @value liquor
 * @option Luxury Boutique
 * @value luxury
 * @option Magic Shop
 * @value magicShop
 * @option Materials Depot
 * @value materials
 * @option Music Store
 * @value musicStore
 * @option Newsstand
 * @value newsstand
 * @option Occult Curiosity Shop
 * @value occult
 * @option Optician
 * @value optician
 * @option Organ Trader
 * @value organTrader
 * @option Pet Shop
 * @value petShop
 * @option Pharmacy
 * @value pharmacy
 * @option Pizzeria
 * @value pizzeria
 * @option Reliquary
 * @value reliquary
 * @option Spy Supplier
 * @value spy
 * @option Stationery Shop
 * @value stationery
 * @option Street Dealer
 * @value streetDealer
 * @option Street Food Stall
 * @value streetFood
 * @option Supermarket
 * @value supermarket
 * @option Surplus Armory
 * @value surplusArmory
 * @option Tabaccheria
 * @value tabaccheria
 * @option Tailor
 * @value tailor
 * @option Tavern
 * @value tavern
 * @option Toy Store
 * @value toyStore
 * @option Travel Agency
 * @value travelAgency
 * @option Trattoria
 * @value trattoria
 * @option Weaponsmith
 * @value weaponsmith
 * @option Wellness Boutique
 * @value wellness
 * @default supermarket
 * @desc Which themed shop to open.
 *
 * @command openDailySpellShop
 * @text Open Daily Spell Shop
 * @desc Teaches spells (Magic only) drawn from a few randomly chosen magic schools. Rerolls daily.
 *
 * @command openDailySkillShop
 * @text Open Daily Skill Shop
 * @desc Teaches skills (Skills only) drawn from a few randomly chosen skill categories. Rerolls daily.
*/

(() => {
  const pluginName = "RandomDailyShop";

  // Parse game date from variable 113
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

  // Utility to get game date string (YYYY-MM-DD) from variable 113
  function getCurrentDateKey() {
    const gameDate = getGameDateFromVariable();
    // Format to YYYY-MM-DD (e.g., "2001-01-01")
    const yearStr = gameDate.year.toString();
    const monthStr = String(gameDate.month + 1).padStart(2, '0');
    const dayStr = String(gameDate.day).padStart(2, '0');
    return `${yearStr}-${monthStr}-${dayStr}`;
  }

  // Simple seeded random number generator
  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Canonical world seed (history seed) used to make every shop world-consistent
  function getWorldSeed() {
    let historySeed = 19002001;
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
      historySeed = window.HistoryManager.getSeed();
    } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
      historySeed = $gameSystem._historySeed;
    }
    return historySeed >>> 0;
  }

  // Generate seed from world seed, map ID, x, y coordinates, and date
  function generateSeed(mapId, x, y, dateKey) {
    const dateNum = parseInt(dateKey.replace(/-/g, ''), 10);
    const base = mapId * 10000000 + x * 10000 + y * 100 + (dateNum % 10000);
    return (base ^ getWorldSeed()) >>> 0;
  }

  // Seeded shuffle using the generated seed. The seed is forced unsigned first:
  // a negative one makes the modulo negative, which turns the swap index into a
  // negative array slot and punches undefined holes through the result.
  function seededShuffle(array, seed) {
    seed = seed >>> 0;
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Small deterministic string hash so a shop-type label can act as a stable
  // per-kind salt on top of the mapId/x/y/world seed.
  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  // Fixed per-shop seed: identical every day, salted by shop kind so two shop
  // types sharing coordinates never draw the same item ordering.
  function generateLocationSeed(mapId, x, y, kind) {
    const base = mapId * 10000000 + x * 10000 + y * 100;
    return (base ^ getWorldSeed() ^ hashString(kind)) >>> 0;
  }

  // How many items a shop stocks: fixed per-location, drawn once from 6-12,
  // unless the shop declares a deeper `shelf` band of its own.
  function pickShopItemCount(seed, band) {
    seed = (seed * 9301 + 49297) % 233280;
    if (band) return band[0] + Math.floor((seed / 233280) * (band[1] - band[0] + 1));
    return 6 + Math.floor((seed / 233280) * 7);
  }

  //=========================================================================
  // Item pools
  //-------------------------------------------------------------------------
  // Everything a shop can put on a shelf comes from one of three places: a
  // hand-picked list of database ids, a sweep of the item categories the shop
  // trades in, or the whole of a database (an armorer sells armor, full stop).
  //=========================================================================

  const DATABASES = {
    items: () => $dataItems,
    weapons: () => $dataWeapons,
    armors: () => $dataArmors
  };

  // Category notes are matched with a cached regex per category: the sweep runs
  // over every row of a database, so rebuilding the pattern per item is waste.
  const categoryPatterns = {};

  // A few shelves are defined by what a thing IS rather than by the category
  // note somebody remembered to write on it, and books are the standing
  // example: the readable titles carry <Book:>, the teaching ones <Grimoire:>
  // or <SkillBook:>, and most of those are filed under Tools in the database,
  // so a plain <category:Books> sweep walked straight past every one of them.
  // The library trades below ask for these instead, which means a book added
  // to the database tomorrow is on their shelves tomorrow, with no list of
  // ids for anybody to keep up to date.
  const NOTE_CATEGORIES = {
    books: /<category:\s*books\s*>|<Book:\s*[\w-]+\s*>/i,
    grimoires: /<Grimoire:\s*[\w -]+>/i,
    skillbooks: /<SkillBook:\s*[\w -]+>/i
  };

  function hasCategory(entry, category) {
    if (!entry || !entry.note) return false;
    const named = NOTE_CATEGORIES[String(category).toLowerCase()];
    if (named) return named.test(entry.note);
    if (!categoryPatterns[category]) {
      categoryPatterns[category] = new RegExp(`<category:\\s*${category}\\s*>`, "i");
    }
    return categoryPatterns[category].test(entry.note);
  }

  // Merchandise no shop stocks by category sweep. Culture vials are a plot
  // device, not stock; a shop that wants one still lists its id by hand.
  const NEVER_SWEPT = ["diseases"];

  // Named tests a shop definition can reach for beyond a plain category.
  const ENTRY_TESTS = {
    // A real drug, as opposed to a bandage or a tonic: it carries the note the
    // disease system reads, which is the same test the item panels use.
    medicine: entry => !!(entry && entry.note && /<Medicine:\s*[\w-]+\s*>/i.test(entry.note)),
    highValue: entry => !!(entry && entry.price && entry.price > 300000)
  };

  function isArtifact(entry) {
    if (!entry) return false;
    return entry.id >= 1500 || (entry.note && hasCategory(entry, "artifact"));
  }

  // The databases are divided by named separator rows ("<-- Whip -->"), which
  // are real entries as far as the engine is concerned and would otherwise end
  // up priced on a shelf. A <Restricted> row is no shop's to sell: it is
  // granted by the one system that owns it (a seed weapon by a blade seed),
  // and a hand-picked id does not get it onto a shelf either.
  function isSellableEntry(entry) {
    if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(entry)) return false;
    // Nor is anything of the wrong nature for this world: a severed world's
    // shelves hold no charms, an unbound one's hold no technology
    // (window.MagicNature).
    if (window.MagicNature && !window.MagicNature.allowsData(entry)) return false;
    return !!(entry && entry.name && !entry.name.trim().startsWith("<"));
  }

  function entriesFor(ids, db) {
    return (ids || []).map(id => db[id]).filter(isSellableEntry);
  }

  // The staples a shop is never out of: a pharmacy always has painkillers, a
  // weaponsmith always has a plain knife on the rack. They lead the shelf and
  // are kept out of every random draw, so a slot is never spent on something
  // the shop is guaranteed to carry anyway.
  function fixedEntries(def) {
    return [
      ...entriesFor(def.fixed, $dataItems),
      ...entriesFor(def.fixedWeapons, $dataWeapons),
      ...entriesFor(def.fixedArmors, $dataArmors)
    ];
  }

  // The shop's hand-picked list: things it can be found carrying, drawn from.
  function curatedEntries(def) {
    return [
      ...entriesFor([...new Set(def.ids || [])], $dataItems),
      ...entriesFor([...new Set(def.weaponIds || [])], $dataWeapons),
      ...entriesFor([...new Set(def.armorIds || [])], $dataArmors)
    ];
  }

  // The shop's trade, swept out of the database: every medical item for a
  // pharmacy, every armor for an armorer.
  function categoryEntries(def) {
    const sources = def.from || (def.categories || def.include ? ["items"] : []);
    if (!sources.length) return [];
    const everything = def.all || [];
    const pool = [];

    for (const source of sources) {
      const db = DATABASES[source]();
      for (let i = 1; i < db.length; i++) {
        const entry = db[i];
        if (!isSellableEntry(entry)) continue;
        if (isArtifact(entry)) continue;
        if (NEVER_SWEPT.some(category => hasCategory(entry, category))) continue;
        if (def.exclude && def.exclude.some(category => hasCategory(entry, category))) continue;
        // Armor types split the two trades that sell armor: a clothier hangs
        // Clothes and Robes, an armorer works everything harder than that.
        if (def.atypes && source === "armors" && !def.atypes.includes(entry.atypeId)) continue;
        const wanted = everything.includes(source) ||
          (def.categories && def.categories.some(category => hasCategory(entry, category))) ||
          (def.include && ENTRY_TESTS[def.include](entry));
        if (wanted) pool.push(entry);
      }
    }
    return pool;
  }

  // The category draw, with an optional slice reserved for what the shop is
  // actually for: two thirds of a pharmacy shelf is real drugs, so one stocked
  // at random out of the whole medical category cannot come out holding nothing
  // but cough drops on the morning somebody needs an antibiotic.
  function drawFromCategories(def, pool, count, seed) {
    if (count <= 0 || !pool.length) return [];
    const priority = def.priority && ENTRY_TESTS[def.priority.test];
    if (!priority) return seededShuffle(pool, seed).slice(0, count);

    const wanted = Math.ceil(count * def.priority.share);
    const preferred = seededShuffle(pool.filter(priority), seed).slice(0, wanted);
    const rest = seededShuffle(pool.filter(entry => !priority(entry)), (seed ^ 0x9e3779b9) >>> 0);
    return [...preferred, ...rest.slice(0, count - preferred.length)];
  }

  // One shelf: staples first, then a draw split between the hand-picked list
  // and the category sweep. `curatedShare` is how much of the draw the list
  // gets when the shop has both - a bakery leans on its own recipes, a
  // pharmacy on the pharmacopoeia.
  function buildShelf(def, seed) {
    const fixed = fixedEntries(def);
    const taken = new Set(fixed);

    const curated = curatedEntries(def).filter(entry => !taken.has(entry));
    curated.forEach(entry => taken.add(entry));
    const swept = categoryEntries(def).filter(entry => !taken.has(entry));

    const count = pickShopItemCount(seed, def.shelf);
    if (!swept.length) return [...fixed, ...seededShuffle(curated, seed).slice(0, count)];
    if (!curated.length) return [...fixed, ...drawFromCategories(def, swept, count, seed)];

    const share = def.curatedShare === undefined ? 0.6 : def.curatedShare;
    const fromList = Math.min(curated.length, Math.round(count * share));
    return [
      ...fixed,
      ...seededShuffle(curated, seed).slice(0, fromList),
      ...drawFromCategories(def, swept, count - fromList, (seed ^ 0x5bf03635) >>> 0)
    ];
  }

  function injectRareArtifact(items, seed, typeStr) {
    const isSandbox = (typeof $gameSystem !== 'undefined' && $gameSystem._isSandboxMode) ||
                      (typeof $gameParty !== 'undefined' && $gameParty.leader() && $gameParty.leader().name().toLowerCase() === "test");

    if (isSandbox || seededRandom(seed + 999) < 0.02) { // 100% in sandbox, 2% otherwise
      const validArtifacts = [];
      const checkArtifact = (item) => {
        if (!item || !isArtifact(item)) return false;
        if (!isSellableEntry(item)) return false;
        if (typeof $gameParty !== 'undefined' && $gameParty.hasItem(item, true)) return false;
        return true;
      };

      if (typeStr === 'item' || typeStr === 'all') {
        if (typeof $dataItems !== 'undefined') {
          for (let i = 1500; i < $dataItems.length; i++) {
            if (checkArtifact($dataItems[i])) validArtifacts.push($dataItems[i]);
          }
        }
      }
      if (typeStr === 'weapon' || typeStr === 'all') {
        if (typeof $dataWeapons !== 'undefined') {
          for (let i = 1500; i < $dataWeapons.length; i++) {
            if (checkArtifact($dataWeapons[i])) validArtifacts.push($dataWeapons[i]);
          }
        }
      }
      if (typeStr === 'armor' || typeStr === 'all') {
        if (typeof $dataArmors !== 'undefined') {
          for (let i = 1500; i < $dataArmors.length; i++) {
            if (checkArtifact($dataArmors[i])) validArtifacts.push($dataArmors[i]);
          }
        }
      }
      if (validArtifacts.length > 0) {
        const art = validArtifacts[Math.floor(seededRandom(seed + 888) * validArtifacts.length)];
        // Takes the last slot: the first ones are the shop's always-stocked staples.
        if (items.length > 0) items[items.length - 1] = art;
        else items.push(art);
      }
    }
    return items;
  }

  // Where the shop being opened stands. Callers that pass explicit coordinates
  // (remote orders placed from a seat) get that venue's own stock; everyone else
  // is located from the event that ran the plugin command, as before.
  function resolveShopLocation(mapId, x, y) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { mapId: Number.isFinite(mapId) ? mapId : $gameMap.mapId(), x: x, y: y };
    }
    const event = $gameMap.event($gameMap._interpreter.eventId());
    if (!event) {
      console.warn("RandomDailyShop: Could not find event to determine location.");
      return null;
    }
    return { mapId: $gameMap.mapId(), x: event.x, y: event.y };
  }

  //=========================================================================
  // Themed shops
  //-------------------------------------------------------------------------
  // Every shop in the game is one of these. A shelf is chosen once per
  // location (seeded by map/coords/world seed/shop type) and never changes;
  // only the daily stock of each chosen entry varies. A shop can describe its
  // trade three ways at once, and most do:
  //   fixed:      ids always on the shelf at every location of that type,
  //               listed first, on top of the random draw. What the trade
  //               itself guarantees: a fishmonger has rods, a cafe has coffee,
  //               a pharmacy has surgical spirit, plus the items another system
  //               depends on being buyable somewhere (the lockpick).
  //   ids:        the hand-picked list the shop can be found carrying.
  //   categories: the categories the shop deals in, swept out of the database,
  //               so a pharmacy offers any <Category: Medical> item and not
  //               only the ones named here.
  // Then, to shape the draw:
  //   fixedWeapons / fixedArmors / weaponIds / armorIds
  //               the same two lists against $dataWeapons / $dataArmors.
  //   from:       databases the category sweep covers (default ["items"]).
  //   all:        databases the sweep takes wholesale, category or not.
  //   include:    an extra named test (ENTRY_TESTS) the sweep accepts.
  //   exclude:    categories the sweep skips.
  //   atypes:     armor types the sweep accepts, splitting the clothier
  //               (Clothes, Robe) from the armorer (everything harder).
  //   priority:   {test, share} reserving part of the sweep for the heart of
  //               the trade (a pharmacy's actual drugs).
  //   curatedShare: how much of the draw the hand-picked list takes when the
  //               shop has both lists (default 0.6).
  //   shelf:      [min, max] slots, overriding the usual 6-12.
  //   stockMult:  multiplies the per-item stock rolled by ItemSystemShop.
  //   artifacts:  'item' | 'weapon' | 'armor' | 'all' - the shop can turn up a
  //               rare artifact in its last slot.
  //   dining:     venue that serves prepared food and drink, so a seated player
  //               can order from it remotely (see the remote-ordering section
  //               below). Grocers selling only raw supplies are left out.
  //=========================================================================
  const THEMED_SHOPS = {
    // The broad trades. Each one's shelf is mostly its category swept out of
    // the database, with a hand-picked list on top of the staples so the same
    // recognisable goods turn up wherever the trade is practised.
    generalStore: {
      get label() { return T('DailyShop.shopType.generalStore'); },
      ids: [418, 1, 3, 113, 118, 120, 121, 126, 127, 130, 132, 136, 149, 161,
            178, 244, 390, 711, 804, 807, 811, 870],
      fixed: [115, 179],        // candle, batteries
      from: ["items", "weapons", "armors"],
      all: ["items", "weapons", "armors"],
      exclude: ["food", "bodypart"],
      curatedShare: 0.35,
      artifacts: "all"
    },
    tavern: {
      get label() { return T('DailyShop.shopType.tavern'); },
      ids: [480, 535, 544, 486, 465, 479, 447, 518, 459, 467, 434, 442, 510,
            473, 456, 454, 549, 541, 550, 567],
      // A tavern's whole board, not a sample of it: everything a house is
      // expected to be able to pour or plate at any hour.
      fixed: [499, 179, 573, 22, 39, 24, 438, 535, 430, 439, 460, 518, 468,
              529, 188, 182, 183, 184],
      categories: ["food"],
      curatedShare: 0.5,
      dining: true
    },
    weaponsmith: {
      get label() { return T('DailyShop.shopType.weaponsmith'); },
      ids: [811, 870, 816, 863],    // whetstone, oil flask, eternal whetstone, salvaged steel
      fixedWeapons: [11, 46],       // knife, cheap sword
      from: ["weapons"],
      all: ["weapons"],
      curatedShare: 0.25,
      artifacts: "weapon"
    },
    armorer: {
      get label() { return T('DailyShop.shopType.armorer'); },
      ids: [868, 863, 811, 870],        // leather, salvaged steel, whetstone, oil flask
      fixedArmors: [762, 555, 557],     // patrol shield, skull cap, salvage vest
      from: ["armors"],
      all: ["armors"],
      atypes: [3, 4, 5, 6],             // light, heavy, equipment, shields
      curatedShare: 0.25,
      artifacts: "armor"
    },
    clothing: {
      get label() { return T('DailyShop.shopType.clothing'); },
      ids: [861, 132, 152, 117, 142, 235, 239, 231],
      fixedArmors: [53, 458],           // homespun tunic, comfort robe
      from: ["armors"],
      all: ["armors"],
      atypes: [1, 2],                   // clothes and robes
      curatedShare: 0.25
    },
    pharmacy: {
      get label() { return T('DailyShop.shopType.pharmacy'); },
      ids: [4, 5, 9, 12, 13, 16, 17, 25, 1444, 1445, 1450, 1453, 1466, 1468,
            1469, 1470, 1462],
      // Never out of the things a pharmacy is for: a kit, an antibiotic
      // course, rehydration salts, a multivitamin and the surgical tools,
      // on top of the three over-the-counter staples.
      fixed: [1, 3, 19, 1443, 1446, 1464, 1465, 244],
      categories: ["medical"],
      // The one shop the disease system sends the player to by name, so it
      // draws several times as deep and reserves most of that for real drugs.
      shelf: [26, 40],
      priority: { test: "medicine", share: 0.7 },
      curatedShare: 0.25
    },
    magicShop: {
      get label() { return T('DailyShop.shopType.magicShop'); },
      ids: [649, 650, 652, 653, 654, 655, 656, 657, 658, 661, 662, 663, 664,
            673, 675, 679, 685, 686],
      fixed: [648, 651],        // health potion, mana potion
      categories: ["magic", "monsters", "potion"],
      curatedShare: 0.5,
      artifacts: "item"
    },
    luxury: {
      get label() { return T('DailyShop.shopType.luxury'); },
      ids: [230, 232, 233, 234, 235, 236, 241, 242, 245, 246, 247, 249, 866,
            865, 691],
      fixed: [543, 535],        // gourmet chocolate, aged wine
      categories: ["artisan"],
      include: "highValue",
      from: ["items", "weapons", "armors"],
      curatedShare: 0.5,
      artifacts: "all"
    },
    adventurer: {
      get label() { return T('DailyShop.shopType.adventurer'); },
      ids: [1443, 136, 810, 813, 126, 129, 161, 512, 465, 466, 811, 870, 808,
            806, 815, 145],
      fixed: [648, 125, 121],   // health potion, bedroll, lantern
      categories: ["medical", "food", "counterfeits", "potion", "magic", "monsters"],
      from: ["items", "weapons", "armors"],
      all: ["weapons", "armors"],
      curatedShare: 0.5,
      artifacts: "all"
    },
    alchemistry: {
      get label() { return T('DailyShop.shopType.alchemistry'); },
      ids: [883, 886, 889, 890, 891, 893, 896, 897, 899, 900, 903, 904, 905,
            871, 390, 805],
      fixed: [884, 898],        // distilled water, ethanol
      categories: ["alchemistry"],
      curatedShare: 0.4
    },
    organTrader: {
      get label() { return T('DailyShop.shopType.organTrader'); },
      ids: [999, 1000, 1005, 1006, 1011, 1012, 1015, 1018, 1020, 1063, 1064, 244],
      fixed: [1014, 1017],      // heart, liver
      categories: ["bodypart"],
      curatedShare: 0.35
    },

    iceCream: {
      get label() { return T('DailyShop.shopType.iceCream'); },
      ids: [458, 469, 511, 540, 488, 543, 560, 589, 562, 432, 443, 439, 461,
            471, 472, 477, 719, 485, 467, 492, 448, 476, 590],
      fixed: [469, 458, 461],   // ice cream, sundae, shake
      categories: ["food"],
      dining: true
    },
    fastFood: {
      get label() { return T('DailyShop.shopType.fastFood'); },
      ids: [481, 519, 450, 451, 460, 462, 474, 500, 447, 457, 442, 445, 461,
            439, 458, 433, 468, 453, 720, 464, 441, 440, 436, 432],
      fixed: [481, 450, 442],   // burger, fries, soda
      categories: ["food"],
      dining: true
    },
    gym: {
      get label() { return T('DailyShop.shopType.gym'); },
      ids: [52, 53, 36, 40, 41, 33, 55, 54, 26, 47, 17, 18, 23, 431, 463, 195,
            315, 325, 331, 832, 833, 834, 50, 723, 728, 91, 87, 38],
      fixed: [431, 315],        // protein bar, grip powder
      categories: ["lifestyle"],
    },
    fisherman: {
      get label() { return T('DailyShop.shopType.fisherman'); },
      ids: [123, 167, 141, 425, 507, 523, 508, 501, 513, 576, 569, 531, 532,
            581, 120, 811, 813, 810, 155, 161, 116, 121, 807, 78, 805, 870],
      fixed: [123, 78],         // fishing rod, net
      categories: ["survival", "tools"],
    },
    supermarket: {
      get label() { return T('DailyShop.shopType.supermarket'); },
      ids: [418, 421, 423, 429, 431, 433, 435, 436, 437, 438, 440, 441, 442,
            443, 444, 445, 446, 447, 448, 452, 453, 454, 455, 456, 459, 463,
            464, 465, 466, 467, 471, 475, 492, 499, 510, 528, 533, 535, 536,
            862, 858, 1, 3, 5, 25, 115, 118, 119, 120, 127, 132, 136,
            177, 178, 179, 185, 711, 804, 806, 807],
      fixed: [418, 438, 454],   // bottled water, milk, bread
      categories: ["food"],
      curatedShare: 0.7,
      stockMult: 6
    },
    cafe: {
      get label() { return T('DailyShop.shopType.cafe'); },
      ids: [459, 528, 564, 547, 585, 467, 434, 455, 516, 574, 471, 439, 540,
            560, 468, 473, 196, 543, 511, 589, 719, 178, 711],
      fixed: [459, 528, 439],   // coffee, cup of coffee, donut
      categories: ["food"],
      dining: true
    },
    liquor: {
      get label() { return T('DailyShop.shopType.liquor'); },
      ids: [480, 498, 517, 535, 544, 572, 587, 552, 557, 568, 37, 178, 466,
            441, 440, 442, 445, 444, 449, 461, 898],
      fixed: [480, 535, 544],   // ale, wine, whiskey
      categories: ["food"],
    },
    electronics: {
      get label() { return T('DailyShop.shopType.electronics'); },
      ids: [122, 133, 134, 136, 137, 143, 144, 149, 153, 154, 157, 160, 162,
            179, 185, 186, 190, 193, 721, 726, 394, 852, 853, 854, 135, 130,
            388, 387],
      fixed: [179, 122, 1319, 1325],   // batteries, charger, a processor, a memory module
      categories: ["tools", "lifestyle", "component"],
    },
    // The hardware store absorbed the old tools shop, so anything tagged Tools
    // can be found here on top of its own stock.
    hardware: {
      get label() { return T('DailyShop.shopType.hardware'); },
      ids: [138, 156, 814, 811, 813, 132, 119, 807, 118, 121, 115, 870, 859,
            863, 867, 855, 856, 146, 406, 151, 374, 739, 861, 868, 805, 804],
      fixed: [374, 814, 138, 136],   // lockpick, multi-tool, shovel, flashlight
      categories: ["tools", "component"],
    },
    camping: {
      get label() { return T('DailyShop.shopType.camping'); },
      ids: [125, 126, 129, 815, 806, 813, 810, 807, 804, 809, 808, 120, 121,
            136, 137, 142, 116, 117, 152, 159, 161, 512, 421, 465, 466, 418,
            123, 811],
      fixed: [125, 136, 813],   // bedroll, flashlight, climbing rope
      categories: ["survival"],
    },
    butcher: {
      get label() { return T('DailyShop.shopType.butcher'); },
      ids: [862, 430, 465, 452, 479, 486, 496, 497, 514, 522, 527, 529, 538,
            548, 573, 577, 550, 524, 493, 860, 575, 500, 505, 539],
      fixed: [862, 430],        // meat, mystery meat
      categories: ["food"],
    },
    bakery: {
      get label() { return T('DailyShop.shopType.bakery'); },
      ids: [454, 424, 419, 533, 456, 471, 439, 443, 488, 540, 511, 562, 560,
            589, 719, 539, 505, 536, 432, 428],
      fixed: [454, 439],        // fresh bread, donut
      categories: ["food"],
      dining: true
    },
    greengrocer: {
      get label() { return T('DailyShop.shopType.greengrocer'); },
      ids: [423, 437, 448, 476, 499, 435, 546, 554, 555, 583, 584, 591, 590,
            551, 578, 563, 565, 792, 858, 406, 660, 240, 492, 429],
      fixed: [437, 448],        // apple, wild berries
      categories: ["food", "plants"],
    },
    deli: {
      get label() { return T('DailyShop.shopType.deli'); },
      ids: [510, 542, 828, 456, 462, 440, 524, 479, 438, 473, 550, 567, 535,
            452, 465, 493, 587, 466],
      fixed: [510, 524],        // cheese wheel, prosciutto
      categories: ["food"],
      dining: true
    },
    streetFood: {
      get label() { return T('DailyShop.shopType.streetFood'); },
      ids: [470, 478, 482, 484, 489, 490, 491, 494, 495, 502, 503, 504, 520,
            521, 525, 475, 477, 485, 501, 508, 530, 483, 487, 433],
      fixed: [442, 490],        // soda, pad thai
      categories: ["food"],
      dining: true
    },
    trattoria: {
      get label() { return T('DailyShop.shopType.trattoria'); },
      ids: [518, 541, 549, 545, 553, 536, 531, 532, 540, 511, 473, 550, 524,
            720, 719, 535, 459, 510, 567, 573],
      fixed: [518, 535],        // bolognese, house wine
      categories: ["food"],
      dining: true
    },
    giftShop: {
      get label() { return T('DailyShop.shopType.giftShop'); },
      ids: [114, 192, 316, 318, 313, 311, 321, 322, 710, 128, 127, 113, 144,
            150, 163, 185, 189, 180, 211, 326, 332],
      fixed: [114, 316],        // rose, keychain
      categories: ["collectibles"],
    },
    newsstand: {
      get label() { return T('DailyShop.shopType.newsstand'); },
      ids: [711, 178, 181, 182, 183, 187, 442, 445, 441, 436, 431, 418, 113,
            127, 159, 161, 179, 124, 528, 185],
      fixed: [711, 178],        // newspaper, cigarettes
      categories: ["books", "lifestyle"],
    },
    tabaccheria: {
      get label() { return T('DailyShop.shopType.tabaccheria'); },
      ids: [178, 181, 182, 183, 187, 711, 113, 127, 124, 528, 442, 445, 436,
            441, 466, 179, 122, 153, 161, 159, 130, 185, 543, 459, 719, 184,
            535, 544, 480, 115],
      fixed: [178, 181, 711],   // cigarettes, scratch card, newspaper
      categories: ["lifestyle"],
    },
    hunter: {
      get label() { return T('DailyShop.shopType.hunter'); },
      ids: [78, 79, 712, 465, 486, 514, 515, 811, 145, 138, 121, 813, 129,
            774, 758, 766, 806, 868, 860, 512, 147, 76],
      fixed: [78, 465, 811],    // hunting net, jerky, whetstone
      categories: ["survival"],
    },
    occult: {
      get label() { return T('DailyShop.shopType.occult'); },
      ids: [352, 354, 346, 675, 676, 683, 673, 724, 725, 650, 652, 97, 98,
            262, 264, 680, 349, 359, 360, 355, 679, 682, 348],
      fixed: [262, 115],        // empty spellbook, candle
      categories: ["monsters", "books"],
      artifacts: "item",
    },
    streetDealer: {
      get label() { return T('DailyShop.shopType.streetDealer'); },
      ids: [178, 22, 29, 30, 31, 35, 37, 380, 43, 39, 24, 32, 2, 356, 358,
            361, 376, 375, 381, 714],
      fixed: [178, 380],        // cigarettes, street blend
      categories: ["counterfeits", "homeopathy"],
    },
    spy: {
      get label() { return T('DailyShop.shopType.spy'); },
      ids: [374, 375, 377, 378, 379, 381, 382, 383, 384, 385, 386, 387, 388,
            389, 390, 391, 392, 393, 394, 148, 157, 158, 718],
      fixed: [374, 388, 384],   // lockpick, recorder, disguise kit
      categories: ["espionage"],
    },
    stationery: {
      get label() { return T('DailyShop.shopType.stationery'); },
      ids: [113, 127, 128, 148, 230, 647, 672, 386, 262, 711, 394, 393, 130,
            185, 159, 161, 145, 277],
      fixed: [113, 127],        // pen, notebook
      categories: ["books"],
    },
    toyStore: {
      get label() { return T('DailyShop.shopType.toyStore'); },
      ids: [124, 318, 726, 180, 710, 348, 347, 316, 432, 446, 181, 182, 183,
            187, 193, 192, 114, 186],
      fixed: [318, 180],        // action figure, board game
      categories: ["collectibles"],
    },
    arcticOutfitter: {
      get label() { return T('DailyShop.shopType.arcticOutfitter'); },
      ids: [208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 155, 579, 529,
            815, 812, 655, 678, 121, 120, 467],
      fixed: [208, 815],        // pemmican, sleeping bag
      categories: ["arctic"],
    },
    jungleTrader: {
      get label() { return T('DailyShop.shopType.jungleTrader'); },
      ids: [623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 588,
            476, 472, 141, 810, 869],
      fixed: [810, 869],        // rope, herb extract
      categories: ["jungle"],
    },
    wellness: {
      get label() { return T('DailyShop.shopType.wellness'); },
      ids: [604, 605, 606, 607, 608, 609, 610, 611, 177, 184, 434, 516, 574,
            869, 42, 229, 192, 4, 15, 13],
      fixed: [177, 516],        // bath kit, herbal tea
      categories: ["homeopathy", "lifestyle"],
    },
    materials: {
      get label() { return T('DailyShop.shopType.materials'); },
      ids: [849, 850, 851, 852, 853, 854, 855, 856, 857, 858, 859, 860, 861,
            862, 863, 864, 865, 866, 867, 868, 869, 870, 871],
      fixed: [859, 861, 863],   // wood, cloth, salvaged steel
      categories: ["crafting"],
    },
    enoteca: {
      get label() { return T('DailyShop.shopType.enoteca'); },
      ids: [535, 587, 517, 572, 544, 568, 552, 557, 480, 498, 524, 510, 542,
            581, 550, 543, 466, 473, 567, 501, 528, 585],
      fixed: [535, 587],        // aged wine, house wine
      categories: ["food"],
      dining: true
    },
    pizzeria: {
      get label() { return T('DailyShop.shopType.pizzeria'); },
      ids: [536, 460, 462, 720, 473, 451, 450, 442, 445, 480, 535, 540, 719,
            510, 456, 532, 539, 505, 549, 518, 458, 481],
      fixed: [536, 460, 442],   // margherita, slice, soda
      categories: ["food"],
      dining: true
    },
    optician: {
      get label() { return T('DailyShop.shopType.optician'); },
      ids: [233, 142, 217, 242, 679, 683, 150, 249, 158, 144, 143, 867, 234,
            135, 676, 388, 390, 130],
      fixed: [233, 142],        // lens, sunglasses
      categories: ["artisan", "tools"],
    },
    jeweler: {
      get label() { return T('DailyShop.shopType.jeweler'); },
      ids: [242, 334, 332, 322, 328, 866, 865, 864, 211, 214, 649, 659, 685,
            675, 681, 677, 678, 674, 673, 316, 241, 663],
      fixed: [242, 866],        // loupe, crystal
      categories: ["artisan", "collectibles"],
    },
    tailor: {
      get label() { return T('DailyShop.shopType.tailor'); },
      ids: [132, 861, 868, 235, 231, 239, 246, 212, 682, 384, 91, 330, 325,
            834, 326, 329, 152, 117, 116, 815],
      fixed: [132, 861],        // sewing kit, cloth
      // What a tailor sells is not a category but a type: the same two racks
      // the clothing store hangs, cut by the same hands.
      from: ["armors"],
      all: ["armors"],
      atypes: [1, 2],           // clothes and robes
      curatedShare: 0.4,
    },
    musicStore: {
      get label() { return T('DailyShop.shopType.musicStore'); },
      ids: [236, 133, 134, 154, 185, 186, 190, 321, 213, 1428, 193, 726, 179,
            122, 184, 187, 543],
      fixed: [185, 133],        // CD case, mp3 player
      categories: ["lifestyle", "collectibles"],
    },
    antiques: {
      get label() { return T('DailyShop.shopType.antiques'); },
      ids: [331, 324, 313, 327, 333, 97, 249, 241, 234, 150, 320, 710, 675,
            289, 262, 317, 312, 323, 294, 290],
      fixed: [320, 324],        // old chair, ancient coin
      categories: ["collectibles"],
      artifacts: "all",
    },
    florist: {
      get label() { return T('DailyShop.shopType.florist'); },
      ids: [114, 671, 792, 757, 681, 192, 240, 660, 670, 406, 858, 869, 690,
            674, 626, 229, 119, 546],
      fixed: [114, 792],        // rose, dandelion
      // Two growing things is all the database has, so the shelf leans on what
      // else a florist actually sells: gifts and small comforts.
      categories: ["plants", "farming", "lifestyle"],
    },
    petShop: {
      get label() { return T('DailyShop.shopType.petShop'); },
      ids: [27, 710, 145, 147, 680, 777, 752, 862, 78, 1423, 311, 121, 126,
            807, 869, 858, 32],
      fixed: [710, 862],        // pet rock, feed meat
      categories: ["food", "monsters"],
    },
    fertilityClinic: {
      get label() { return T('DailyShop.shopType.fertilityClinic'); },
      ids: [716, 717, 729, 730, 738, 737, 32, 733, 734, 887, 962, 958, 1, 884,
            19, 59, 949],
      fixed: [729, 737],        // human sample, gestation accelerator
      categories: ["medical", "bodypart"],
    },
    cyberClinic: {
      get label() { return T('DailyShop.shopType.cyberClinic'); },
      ids: [731, 732, 733, 734, 735, 736, 59, 763, 768, 769, 857, 851, 853,
            727, 722, 715, 852, 961, 960],
      fixed: [59, 731],         // repair nanites, neural amplifier
      categories: ["bodypart", "medical"],
    },
    travelAgency: {
      get label() { return T('DailyShop.shopType.travelAgency'); },
      ids: [159, 161, 163, 155, 137, 135, 128, 129, 130, 152, 142, 164, 131,
            166, 668, 696, 234, 162, 120],
      fixed: [159, 161],        // routes map, local map
      categories: ["survival", "lifestyle"],
    },
    garage: {
      get label() { return T('DailyShop.shopType.garage'); },
      ids: [164, 131, 146, 909, 917, 854, 863, 928, 855, 814, 156, 167, 668,
            852, 870, 138, 811, 856, 864],
      fixed: [146, 870],        // fuel tank, oil flask
      categories: ["vehicles"],
    },
    drogheria: {
      get label() { return T('DailyShop.shopType.drogheria'); },
      ids: [1, 177, 884, 890, 896, 883, 886, 894, 901, 905, 893, 115, 132,
            861, 118, 13, 11, 7, 867],
      fixed: [1, 883, 115],     // sanitizer, salt, candle
      categories: ["food", "alchemistry"],
    },
    casalinghi: {
      get label() { return T('DailyShop.shopType.casalinghi'); },
      ids: [118, 119, 807, 804, 809, 120, 232, 1427, 542, 811, 115, 867, 805,
            121, 136, 179, 132, 870],
      fixed: [118, 119, 804],   // utensils, clay pot, bowl set
      categories: ["tools"],
    },
    bettingParlor: {
      get label() { return T('DailyShop.shopType.bettingParlor'); },
      ids: [181, 182, 183, 187, 124, 311, 313, 323, 1437, 178, 544, 568,
            26, 346, 312, 322, 445],
      fixed: [181, 182, 183],   // the three scratch cards
      categories: ["lifestyle", "collectibles"],
    },
    reliquary: {
      get label() { return T('DailyShop.shopType.reliquary'); },
      ids: [45, 265, 278, 282, 293, 263, 275, 276, 115, 692, 1401, 498, 229,
            230, 673, 681, 355, 267, 266, 264],
      fixed: [115, 45],         // votive candle, holy remedy
      categories: ["magic", "collectibles"],
      artifacts: "all",
    },
    surplusArmory: {
      get label() { return T('DailyShop.shopType.surplusArmory'); },
      ids: [512, 718, 76, 78, 80, 73, 79, 77, 712, 88, 1430, 1426, 136, 129,
            808, 141, 715, 940, 957, 811],
      fixed: [512, 808],        // field ration, escape kit
      categories: ["combat"],
    },
    junkShop: {
      get label() { return T('DailyShop.shopType.junkShop'); },
      ids: [836, 828, 829, 830, 831, 832, 833, 834, 835, 710, 320, 317, 312,
            424, 709, 349, 346, 347, 356, 358, 361, 419, 423,
            1329, 1336, 1347, 1352, 1341, 1355, 1359],
      fixed: [374, 836, 709],   // lockpick, rubbish, unidentified item
      categories: ["trash"],
      artifacts: "all",
    },
    // The bookshop absorbed the old library: its textbooks stay hand-picked,
    // but it carries every book in the database as well, the skill books
    // included. The grimoires are the emporium next door.
    academy: {
      get label() { return T('DailyShop.shopType.academy'); },
      ids: [1421, 1422, 1423, 1425, 1426, 1427, 1428, 1429, 1430, 1431,
            1433, 1436, 1437, 1441, 145, 147],
      fixed: [113, 127, 262, 128],   // pen, notebook, blank spellbook, travel journal
      categories: ["books", "skillbooks"],
    },
    grimoire: {
      get label() { return T('DailyShop.shopType.grimoire'); },
      ids: [1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1409, 1410, 1411,
            1412, 1413, 1414, 1415, 1416, 1417, 1418, 1419, 1420, 1434, 1435,
            1438, 1439, 262],
      fixed: [262, 1400],       // empty spellbook, pyromancy grimoire
      categories: ["books", "magic", "grimoires"],
      artifacts: "item",
    }
  };

  const themedShopCaches = {};

  function getThemedShopItems(shopType, mapId, x, y) {
    const def = THEMED_SHOPS[shopType];
    if (!def) {
      console.warn(`RandomDailyShop: unknown themed shop "${shopType}".`);
      return [];
    }

    const locKey = `${mapId}_${x}_${y}`;
    if (!themedShopCaches[shopType]) themedShopCaches[shopType] = {};
    const cache = themedShopCaches[shopType];

    if (!cache[locKey]) {
      cache[locKey] = buildShelf(def, generateLocationSeed(mapId, x, y, shopType));
    }

    // The assortment is fixed per location; only the artifact that may turn up
    // in the last slot is a daily roll, so it is applied on the way out.
    if (!def.artifacts) return cache[locKey];
    const dailySeed = generateSeed(mapId, x, y, getCurrentDateKey());
    return injectRareArtifact([...cache[locKey]], dailySeed, def.artifacts);
  }

  // Shop goods are [type, id, priceOverride, price]; a mixed shelf has to say
  // which database each entry came from.
  function goodsFor(items) {
    return items.map(item => {
      if (DataManager.isItem(item)) return [0, item.id, 0, 0];
      if (DataManager.isWeapon(item)) return [1, item.id, 0, 0];
      if (DataManager.isArmor(item)) return [2, item.id, 0, 0];
      return null;
    }).filter(Boolean);
  }

  // ItemSystemShop rolls the per-item stock; a shop can ask for a fatter roll
  // (supermarkets) by setting $gameTemp._dailyShopStockMult before the scene starts.
  if (typeof Scene_Shop !== 'undefined' && Scene_Shop.prototype.generateRandomStock) {
    const _generateRandomStock = Scene_Shop.prototype.generateRandomStock;
    Scene_Shop.prototype.generateRandomStock = function (item) {
      // A shop can run out of any given item for the day.
      if (Math.random() < 0.12) return 0;
      const base = _generateRandomStock.call(this, item);
      const mult = ($gameTemp && $gameTemp._dailyShopStockMult) || 1;
      return Math.max(1, Math.round(base * mult));
    };

    const _Scene_Shop_terminate_stockMult = Scene_Shop.prototype.terminate;
    Scene_Shop.prototype.terminate = function () {
      _Scene_Shop_terminate_stockMult.call(this);
      if ($gameTemp) $gameTemp._dailyShopStockMult = 1;
    };
  }

  function openThemedShop(shopType, mapId, x, y) {
    const def = THEMED_SHOPS[shopType];
    if (!def) {
      console.warn(`RandomDailyShop: unknown themed shop "${shopType}".`);
      return;
    }

    const loc = resolveShopLocation(mapId, x, y);
    if (!loc) return;

    const goods = goodsFor(getThemedShopItems(shopType, loc.mapId, loc.x, loc.y));

    $gameTemp._dailyShopStockMult = def.stockMult || 1;

    SceneManager.push(Scene_Shop);
    SceneManager.prepareNextScene(goods, false);
  }

  //=========================================================================
  // Remote ordering (dining venues)
  //-------------------------------------------------------------------------
  // A venue that serves prepared food or drink can be ordered from without
  // walking up to its counter: MovementInteractionSystem offers this from the
  // seated menu, so a player at a table can order across the room. The map is
  // scanned for events running one of this plugin's dining commands, and every
  // hit keeps the event's coordinates so the order draws that venue's own daily
  // stock rather than a fresh roll from wherever the player is sitting.
  //=========================================================================

  // Event plugin commands store the plugin's path-prefixed name
  // ("Economy/RandomDailyShop" on newer maps, bare "RandomDailyShop" on older
  // ones), so compare on the last path segment only.
  function isThisPlugin(name) {
    return String(name || "").split("/").pop() === pluginName;
  }

  function diningVenueForCommand(command, args) {
    if (command !== "openThemedShop") return null;
    const shopType = String((args && args.shopType) || "").trim();
    const def = THEMED_SHOPS[shopType];
    if (!def || !def.dining) return null;
    return { shopType: shopType, label: def.label };
  }

  // Every dining venue on the current map, nearest first. Each entry carries the
  // venue's location plus its own opener, so callers never need to know which
  // flavour of shop command sits behind it.
  function findDiningVenues() {
    const venues = [];
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.events) return venues;

    for (const event of $gameMap.events()) {
      if (!event || event._erased) continue;
      const data = event.event();
      if (!data || !data.pages) continue;

      let venue = null;
      for (const page of data.pages) {
        for (const command of (page.list || [])) {
          if (command.code !== 357) continue;
          const params = command.parameters || [];
          if (!isThisPlugin(params[0])) continue;
          venue = diningVenueForCommand(params[1], params[3]);
          if (venue) break;
        }
        if (venue) break;
      }
      if (!venue) continue;

      venue.eventId = event.eventId();
      venue.mapId = $gameMap.mapId();
      venue.x = event.x;
      venue.y = event.y;
      venue.distance = $gamePlayer
        ? $gameMap.distance(event.x, event.y, $gamePlayer.x, $gamePlayer.y)
        : 0;
      venues.push(venue);
    }

    venues.sort((a, b) => a.distance - b.distance);
    return venues;
  }

  function openDiningVenue(venue) {
    if (!venue) return;
    openThemedShop(venue.shopType, venue.mapId, venue.x, venue.y);
  }

  //=========================================================================
  // Daily spell / skill teachers
  //-------------------------------------------------------------------------
  // Two shops that trade in abilities instead of goods. Each day the shop
  // draws a handful of schools (stypeId 1 = Magic) or categories
  // (stypeId 2 = Skills) and offers a slice of them for gold; buying teaches
  // the ability to the selected party member and clears it off the shelf.
  //=========================================================================
  const TEACH_SCHOOLS_PER_DAY = 3;   // how many schools/categories open each day
  const TEACH_OFFER_COUNT = 8;       // how many abilities end up on the shelf

  const isRealSkillEntry = s =>
    s && s.name && !s.name.startsWith("<") && !s.name.startsWith("ESK") &&
    (!window.MagicNature || window.MagicNature.allowsData(s));

  const prettifySchool = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");

  function skillSchool(skill) {
    return skill && skill.meta && skill.meta.category ? String(skill.meta.category) : "";
  }

  // Gold price of an ability: driven by its upkeep, with esoteric and
  // forbidden lore charging what the market will bear.
  function teachingPrice(skill) {
    let price = 600 + (skill.mpCost || 0) * 260 + (skill.tpCost || 0) * 320;
    if (skill.meta && skill.meta.Esoteric) price *= 3;
    if (skill.meta && skill.meta.Forbidden) price *= 8;
    // Even a tutor's fee can be talked down (specialization 127).
    if (window.SpecializationXP) {
      price *= window.SpecializationXP.discount('Haggling', 0.05, 0.75);
    }
    return Math.max(300, Math.round(price / 50) * 50);
  }

  const teachShopCaches = { magic: {}, skill: {} };

  function getDailyTeachingOffers(mode, mapId, x, y) {
    const dateKey = getCurrentDateKey();
    const cacheKey = `${mapId}_${x}_${y}_${dateKey}`;
    const cache = teachShopCaches[mode];

    if (!cache[cacheKey]) {
      const stypeId = mode === "magic" ? 1 : 2;
      const all = $dataSkills.filter(s =>
        isRealSkillEntry(s) && s.stypeId === stypeId && skillSchool(s));

      const schools = [...new Set(all.map(skillSchool))].sort();
      const seed = generateSeed(mapId, x, y, dateKey);
      const picked = seededShuffle(schools, seed).slice(0, TEACH_SCHOOLS_PER_DAY);
      const pickedSet = new Set(picked);

      const pool = all.filter(s => pickedSet.has(skillSchool(s)));
      const offers = seededShuffle(pool, seed + 7).slice(0, TEACH_OFFER_COUNT);

      cache[cacheKey] = { schools: picked, offers, key: cacheKey };
    }

    return cache[cacheKey];
  }

  // Abilities already bought here today stay bought - tracked on $gameSystem so
  // it survives saves, and keyed by date so tomorrow's stock is clean.
  function soldRecord(mode, cacheKey) {
    if (!$gameSystem._dailyTeachShopSold) $gameSystem._dailyTeachShopSold = {};
    const store = $gameSystem._dailyTeachShopSold;
    const key = `${mode}_${cacheKey}`;
    if (!store[key]) store[key] = [];
    return store[key];
  }

  function isSoldOut(mode, cacheKey, skillId) {
    return soldRecord(mode, cacheKey).includes(skillId);
  }

  function markSold(mode, cacheKey, skillId) {
    const rec = soldRecord(mode, cacheKey);
    if (!rec.includes(skillId)) rec.push(skillId);
  }

  const TeachInput = {
    init(scene) { this.scene = scene; this.active = false; },
    activate() { this.active = true; },
    deactivate() { this.active = false; this.scene = null; },
    update() {
      if (!this.active || !this.scene) return;
      const sc = this.scene;
      if (sc._busy) return;
      const onOffers = sc._focus === "offers";
      const len = onOffers ? sc._offers.length : $gameParty.members().length;

      if (Input.isTriggered("cancel")) {
        SoundManager.playCancel();
        if (onOffers) { sc._focus = "party"; sc.redraw(); }
        else sc.popScene();
        return;
      }
      if (Input.isTriggered("ok")) {
        if (onOffers) sc.buyOffer(sc._offerIdx);
        else { sc._focus = "offers"; sc._offerIdx = 0; SoundManager.playOk(); sc.redraw(); }
        return;
      }
      if (len === 0) {
        if (onOffers && (Input.isTriggered("left") || Input.isTriggered("right"))) {
          sc._focus = "party"; SoundManager.playCursor(); sc.redraw();
        }
        return;
      }
      if (Input.isTriggered("right") && !onOffers) { sc._focus = "offers"; sc._offerIdx = 0; SoundManager.playCursor(); sc.redraw(); return; }
      if (Input.isTriggered("left") && onOffers) { sc._focus = "party"; SoundManager.playCursor(); sc.redraw(); return; }

      let idx = onOffers ? sc._offerIdx : sc._actorIdx;
      let moved = false;
      if (Input.isRepeated("down")) { idx = (idx + 1) % len; moved = true; }
      else if (Input.isRepeated("up")) { idx = (idx - 1 + len) % len; moved = true; }
      if (moved) {
        SoundManager.playCursor();
        if (onOffers) { sc._offerIdx = idx; sc.redraw(); }
        else sc.selectActor(idx);
      }
    }
  };

  function Scene_DailyTeachShop() { this.initialize(...arguments); }
  Scene_DailyTeachShop.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_DailyTeachShop.prototype.constructor = Scene_DailyTeachShop;
  window.Scene_DailyTeachShop = Scene_DailyTeachShop;

  Scene_DailyTeachShop.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    if (this._windowLayer) this._windowLayer.visible = false;
    if (this._cancelButton) this._cancelButton.visible = false;

    const p = $gameTemp._dailyTeachShopParams || { mode: "magic", mapId: 1, x: 0, y: 0 };
    this._mode = p.mode === "skill" ? "skill" : "magic";

    const data = getDailyTeachingOffers(this._mode, p.mapId, p.x, p.y);
    this._schools = data.schools;
    this._offers = data.offers;
    this._stockKey = data.key;

    this._focus = "party";
    this._actorIdx = 0;
    this._offerIdx = 0;
    this._taughtIdx = -1;
    this._busy = false;
    this._actor = $gameParty.members()[0] || $gameParty.leader();

    TeachInput.init(this);
    this.createDOM();
  };

  Scene_DailyTeachShop.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    TeachInput.update();
  };

  Scene_DailyTeachShop.prototype.terminate = function () {
    TeachInput.deactivate();
    if (this._dom) {
      const c = this._dom;
      c.style.transition = "opacity .2s ease-out";
      c.style.opacity = "0";
      c.style.pointerEvents = "none";
      setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 200);
      this._dom = null;
    }
    Scene_MenuBase.prototype.terminate.call(this);
  };

  Scene_DailyTeachShop.prototype.headerTitle = function () {
    const it = ConfigManager.language === "it";
    if (this._mode === "skill") return T('DailyShop.ui.skillTrainer');
    return T('DailyShop.ui.spellTrader');
  };

  // Why an offer can't be bought right now; null means it can.
  Scene_DailyTeachShop.prototype.blockReason = function (skill) {
    const it = ConfigManager.language === "it";
    if (isSoldOut(this._mode, this._stockKey, skill.id)) return T('DailyShop.ui.soldOut');
    const actor = this._actor;
    if (!actor) return T('DailyShop.ui.noPupil');
    if (actor.skills().some(k => k && k.id === skill.id)) return T('DailyShop.ui.alreadyKnown');
    if ((skill.mpCost || 0) > actor.mmp) return T('DailyShop.ui.beyondMpReach');
    if ($gameParty.gold() < teachingPrice(skill)) return T('DailyShop.ui.notEnoughGold');
    return null;
  };

  Scene_DailyTeachShop.prototype.selectActor = function (i) {
    const members = $gameParty.members();
    if (i < 0 || i >= members.length) return;
    this._actorIdx = i;
    this._actor = members[i];
    this.redraw();
  };

  Scene_DailyTeachShop.prototype.buyOffer = function (i) {
    const skill = this._offers[i];
    if (!skill || this._busy || this.blockReason(skill)) {
      SoundManager.playBuzzer();
      return;
    }
    this._busy = true;
    const paid = teachingPrice(skill);
    $gameParty.loseGold(paid);
    if (window.SpecializationXP) {
      window.SpecializationXP.awardForValue('Haggling', paid);
    }
    this._actor.learnSkill(skill.id);
    markSold(this._mode, this._stockKey, skill.id);
    SoundManager.playUseSkill();
    this._taughtIdx = i;
    this.redraw();
    setTimeout(() => {
      this._taughtIdx = -1;
      this._busy = false;
      if (this._dom) this.redraw();
    }, 700);
  };

  Scene_DailyTeachShop.prototype.createDOM = function () {
    this._dom = document.createElement("div");
    this._dom.id = "menu-container";
    this._dom.style.opacity = "0";
    this._dom.style.transition = "opacity .22s ease-out";
    document.body.appendChild(this._dom);
    this.redraw();
    TeachInput.activate();
    setTimeout(() => { if (this._dom) this._dom.style.opacity = "1"; }, 16);
  };

  // Never name this "render": a Scene is a PIXI.Container and the renderer
  // calls container.render() every frame, which would rebuild the overlay 60
  // times a second and stop the scene's own children being drawn.
  Scene_DailyTeachShop.prototype.redraw = function () {
    if (!this._dom) return;
    const it = ConfigManager.language === "it";
    const back = T('DailyShop.ui.back');
    const isMagic = this._mode === "magic";

    let actorsHTML = "";
    $gameParty.members().forEach((a, idx) => {
      const sel = (this._focus === "party" && idx === this._actorIdx) ? "sel" : "";
      actorsHTML += `<div class="teach-actor focusable ${sel}" onclick="SceneManager._scene.selectActor(${idx})">
          <span>${a.name()}</span><span class="teach-price">${a.mp}/${a.mmp} MP</span></div>`;
    });

    const blurb = isMagic
      ? (T('DailyShop.ui.theSchoolsOnDisplayRotate'))
      : (T('DailyShop.ui.theDisciplinesTaughtRotateEvery'));

    const schoolsHTML = this._schools.map(s =>
      `<div class="row"><span>${prettifySchool(s)}</span></div>`).join("");

    const leftHTML = `
      <div class="left-page">
        <div class="page-header-bar">
          <div class="back-button focusable" onclick="SceneManager._scene.popScene()">${back}</div>
          <h2 class="title" style="font-size:1.665em;">${this.headerTitle()}</h2>
        </div>
        <div style="font-family:var(--font-ui); font-style: normal; opacity:0.8; font-size:0.892em; margin-bottom:12px; color:var(--text-primary-hover,#58180D);">${blurb}</div>
        <div style="font-family:var(--font-ui); font-weight:bold; font-size:0.928em; margin-bottom:6px; color:var(--text-primary-hover,#58180D);">${T('DailyShop.ui.pupil')}</div>
        <div class="teach-list">${actorsHTML}</div>
        <div class="teach-info">
          <div style="font-weight:bold; color:var(--accent-gold-pure,#b8860b);">${isMagic ? (T('DailyShop.ui.todaySSchools')) : (T('DailyShop.ui.todaySDisciplines'))}</div>
          ${schoolsHTML}
          <div class="row" style="margin-top:8px; border-top:1px solid var(--border-primary-hover-translucent-15,rgba(184,134,11,0.2)); padding-top:6px;">
            <span>${T('DailyShop.ui.gold')}</span><span class="teach-price">${$gameParty.gold()}</span>
          </div>
        </div>
      </div>`;

    let cardsHTML = "";
    if (!this._offers.length) {
      cardsHTML = `<div class="teach-empty">${T('DailyShop.ui.nothingToTeachToday')}</div>`;
    } else {
      this._offers.forEach((s, idx) => {
        const sel = (this._focus === "offers" && idx === this._offerIdx) ? "sel" : "";
        const taught = (this._taughtIdx === idx) ? "taught" : "";
        const reason = this.blockReason(s);
        const locked = reason ? "locked" : "";
        const forb = (s.meta && s.meta.Forbidden)
          ? `<span class="teach-forbidden">✦ ${T('DailyShop.ui.forbidden')}</span>` : "";
        const cost = (s.mpCost ? `${s.mpCost} ${TextManager.mpA}` : "") +
                     (s.mpCost && s.tpCost ? " · " : "") +
                     (s.tpCost ? `${s.tpCost} ${TextManager.tpA}` : "");
        const magicSys = (s.meta && s.meta.MagicSystem)
          ? ` · ${T('SkillsMenu.magicSystem.' + s.meta.MagicSystem) || s.meta.MagicSystem}` : "";
        const desc = (s.description || "").replace(/\n/g, " ");
        cardsHTML += `<div class="teach-card focusable ${sel} ${taught} ${locked}" onclick="SceneManager._scene.buyOffer(${idx})">
            <div class="teach-name"><span>${s.name}</span><span class="teach-price">${teachingPrice(s)}G</span></div>
            <div class="teach-meta">${prettifySchool(skillSchool(s))}${cost ? " · " + cost : ""}${magicSys} ${forb}</div>
            <div class="teach-desc">${desc}</div>
            ${reason ? `<div class="teach-meta" style="color:var(--text-cost-bad);">${reason}</div>` : ""}
          </div>`;
      });
    }

    const rightHTML = `
      <div class="right-page">
        <h2 class="title" style="font-size:1.475em; margin-bottom:12px;">${isMagic ? (T('DailyShop.ui.spellsForSale')) : (T('DailyShop.ui.techniquesForSale'))}</h2>
        <div class="teach-list">${cardsHTML}</div>
      </div>`;

    this._dom.innerHTML = `<div class="book-spread">${leftHTML}${rightHTML}</div>`;
  };

  function openDailyTeachShop(mode) {
    const eventId = $gameMap._interpreter.eventId();
    const event = $gameMap.event(eventId);

    if (!event) {
      console.warn("RandomDailyShop: Could not find event to determine location.");
      return;
    }

    $gameTemp._dailyTeachShopParams = {
      mode: mode === "skill" ? "skill" : "magic",
      mapId: $gameMap.mapId(),
      x: event.x,
      y: event.y
    };
    SceneManager.push(Scene_DailyTeachShop);
  }

  // Plugin command registration
  PluginManager.registerCommand(pluginName, "openThemedShop", args => {
    openThemedShop(String(args.shopType || "").trim());
  });

  PluginManager.registerCommand(pluginName, "openDailySpellShop", () => {
    openDailyTeachShop("magic");
  });

  PluginManager.registerCommand(pluginName, "openDailySkillShop", () => {
    openDailyTeachShop("skill");
  });


  // Themed shops: generic entry points plus one convenience wrapper per type,
  // e.g. openRandomDailySupermarket() / getRandomDailySupermarketItems().
  window.openRandomThemedShop = openThemedShop;
  window.getRandomThemedShopItems = getThemedShopItems;
  window.RandomDailyThemedShops = THEMED_SHOPS;

  // Remote ordering surface used by MovementInteractionSystem's seated menu.
  window.RandomDailyShop = window.RandomDailyShop || {};
  window.RandomDailyShop.findDiningVenues = findDiningVenues;
  window.RandomDailyShop.openDiningVenue = openDiningVenue;
  window.RandomDailyShop.themedShops = THEMED_SHOPS;

  // Daily spell / skill teachers
  window.openRandomDailySpellShop = () => openDailyTeachShop("magic");
  window.openRandomDailySkillShop = () => openDailyTeachShop("skill");
  window.getRandomDailySpellShopOffers = (mapId, x, y) => getDailyTeachingOffers("magic", mapId, x, y);
  window.getRandomDailySkillShopOffers = (mapId, x, y) => getDailyTeachingOffers("skill", mapId, x, y);

  for (const shopType of Object.keys(THEMED_SHOPS)) {
    const suffix = shopType.charAt(0).toUpperCase() + shopType.slice(1);
    window[`openRandomDaily${suffix}`] = () => openThemedShop(shopType);
    window[`getRandomDaily${suffix}Items`] = (mapId, x, y) => getThemedShopItems(shopType, mapId, x, y);  // i18n-ignore  global function name
  }

})();