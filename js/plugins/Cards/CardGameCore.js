/*:
 * @target MZ
 * @plugindesc The card game's data layer: the catalogue, the 0-13 stat scale, the collection, decks, boosters and the clash resolver.
 * @author Esoteric Heavy Industries
 *
 * @help CardGameCore.js
 *
 * No scene and no plugin command of its own. This is `window.CardGame`, the one
 * place that answers what a card IS; Cards/CardGameDuel.js plays them and
 * Cards/CardGameCollection.js lists them.
 *
 * A CARD KEY is "e<enemyId>", "w<weaponId>" or "a<armorId>". Copies of one key
 * stack in the collection: what makes two copies look and read differently is
 * an INSTANCE SEED rolled when the card is played, never stored.
 *
 * STATS. Five values, STR / WIS / DEX / PSI / CON, every one of them 0-13 for
 * monsters and for equipment alike. A record is ranked against its own roster
 * (enemies against enemies, gear against gear) and the percentile IS the
 * printed value, so the spread is even instead of bunched at the bottom of a
 * raw parameter range that runs to 1,330,448 max HP.
 *
 *   STR = atk    WIS = mdf    DEX = agi    PSI = mat
 *   CON = the higher of the mhp and def percentiles, so a sack of hit points
 *         and a wall of armour both read as tough.
 *
 * Equipment is bolted onto a monster already on the board and its values are
 * added to that monster's, the total clamped back to 13. A negative parameter
 * (cursed gear) clamps to 0 rather than printing a minus.
 *
 * THE CLASH is resolved by resolveClash(), a pure function: every monster picks
 * the weakest enemy monster orthogonally beside it, every pairing is scored
 * against ONE frozen snapshot of the board, and every death is applied
 * together. One round, no cascade.
 *
 * THE MARKET is one price list: a card's rarity band sets what it is worth
 * and its printed stats move it, the day adds a small drift, and what a dealer
 * pays back is a fraction of what it asks. Cadd Trader (CardGameCollection.js)
 * draws that and nothing of its own.
 *
 * Storage lives on $gameSystem (the binary save), so a collection belongs to
 * the party rather than to any member and is NOT shared with the world folder.
 */

(() => {
  "use strict";

  //===========================================================================
  // Constants
  //===========================================================================

  const STAT_MAX = 13;
  const STATS = ["str", "wis", "dex", "psi", "con"];
  const BOARD_SIZE = 3;
  const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
  const DECK_MIN = 9;
  const DECK_MAX = 20;
  const HAND_START = 4;
  const HAND_MAX = 7;
  const PACK_SIZE = 6;
  // Nobody draws by hand: every turn opens by dealing this many cards to
  // whoever is about to play, stopping early on an empty deck or a full hand.
  const DRAW_COUNT = 2;

  // Rarity bands, weakest first. The index is what every UI colours from.
  const RARITY = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 };
  const RARITY_KEYS = ["common", "rare", "epic", "legendary"];

  // Pack odds per slot, by rarity. The last slot of a pack rolls on the second
  // table, so every pack is guaranteed something above common.
  const PACK_ODDS = [0.66, 0.24, 0.084, 0.016];
  const PACK_ODDS_LAST = [0, 0.62, 0.30, 0.08];

  //===========================================================================
  // Seeded RNG (mulberry32) and hashing
  //===========================================================================

  function hashString(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function worldSeed() {
    try {
      if (window.NPCShared && typeof NPCShared.worldSeed === "function") return NPCShared.worldSeed() >>> 0;
      if (window.HistoryManager && typeof HistoryManager.getSeed === "function") return HistoryManager.getSeed() >>> 0;
    } catch (e) { /* boot order */ }
    return 19002001;
  }

  // A fresh appearance/wording seed for one played instance. Deliberately NOT
  // derived from the world seed: two copies of a card must differ.
  function rollSeed() {
    return (1 + Math.floor(Math.random() * 0x7ffffffe)) >>> 0;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  //===========================================================================
  // Enemy name localisation
  //===========================================================================
  // Enemy names live in js/i18n/<lang>/enemies.json, outside the namespaces the
  // T() resolver reads (plugins / conversations / lore), so they are fetched the
  // same way Quest/Bestiary.js fetches them.

  let _enemiesI18n = null;

  (async function loadEnemyNames() {
    const lang = (typeof ConfigManager !== "undefined" && ConfigManager.language) || "en";
    try {
      const response = await fetch(`js/i18n/${lang}/enemies.json`);
      _enemiesI18n = await response.json();
    } catch (e) {
      _enemiesI18n = {};
    }
  })();

  function localEnemyName(id, fallback) {
    const entry = _enemiesI18n && _enemiesI18n[id];
    if (entry && entry.name) return entry.name;
    return fallback;
  }

  //===========================================================================
  // Card keys
  //===========================================================================

  function parseKey(key) {
    const s = String(key || "");
    const type = s.charAt(0);
    const id = parseInt(s.slice(1), 10);
    if (!id || (type !== "e" && type !== "w" && type !== "a")) return null;
    return { type, id };
  }

  const monsterKey = (id) => "e" + id;
  const weaponKey = (id) => "w" + id;
  const armorKey = (id) => "a" + id;

  function dataOf(key) {
    const p = parseKey(key);
    if (!p) return null;
    if (p.type === "e") return (typeof $dataEnemies !== "undefined" && $dataEnemies[p.id]) || null;
    if (p.type === "w") return (typeof $dataWeapons !== "undefined" && $dataWeapons[p.id]) || null;
    return (typeof $dataArmors !== "undefined" && $dataArmors[p.id]) || null;
  }

  const isMonster = (key) => String(key).charAt(0) === "e";
  const isWeapon = (key) => String(key).charAt(0) === "w";
  const isArmor = (key) => String(key).charAt(0) === "a";
  const isEquip = (key) => isWeapon(key) || isArmor(key);
  const isEffect = (key) => String(key).charAt(0) === "x";

  //-------------------------------------------------------------------------
  // Effect cards
  //-------------------------------------------------------------------------
  // Not creatures and not gear: five tricks that are played ON a tile and do
  // something different depending on whether anything is standing there. Every
  // party is dealt one of each at the start, and they are never in a booster.
  //
  //   needsTarget  a second tile is picked after the first (Displace only)
  //   onMonster    what it does to whoever is standing there, either side
  //   onEmpty      what it leaves behind on bare ground
  const EFFECTS = {
    x1: { id: "halve", icon: 18 },   // Blight   : halves / cursed ground
    x2: { id: "double", icon: 26 },  // Gild     : doubles / blessed ground
    x3: { id: "cull", icon: 1 },     // Cull     : kills outright / a trap
    x4: { id: "swap", icon: 83, needsTarget: true }, // Displace : trades two tiles
    x5: { id: "ward", icon: 81 }     // Ward     : wins ties / bars the tile
  };
  const EFFECT_KEYS = Object.keys(EFFECTS);

  const effectOf = (key) => EFFECTS[String(key)] || null;
  const effectId = (key) => (EFFECTS[String(key)] || {}).id || null;

  function nameOf(key) {
    if (isEffect(key)) {
      const effect = effectOf(key);
      return effect ? T("CardGame.effect." + effect.id + ".name") : String(key);
    }
    const data = dataOf(key);
    if (!data) return String(key);
    if (isMonster(key)) return localEnemyName(data.id, data.name);
    return data.name;
  }

  //===========================================================================
  // The catalogue
  //===========================================================================
  // Built once, the first time anything asks. Every filter here is the reason a
  // record is playable at all, so a card can never be a database spacer, a
  // blank padding slot or a monster with nothing to draw on its tile.

  let _catalogue = null;

  // Database spacers: "<-- 1-10 -->" rows the editor is divided by, plus the
  // <LevelBracket> note they carry (Quest/Bestiary.js filters on the same two).
  function isDivider(record) {
    if (!record) return true;
    if (typeof record.name !== "string" || !record.name.trim()) return true;
    if (record.name.startsWith("<--")) return true;
    if (/<LevelBracket>/i.test(record.note || "")) return true;
    return false;
  }

  // The walking sprite the board tile draws, from the <Char:> tag every
  // bestiary entry is illustrated with.
  function charSheetOf(enemy) {
    const m = String(enemy && enemy.note || "").match(/<Char:\s*([^>]+)>/i);
    return m ? m[1].trim() : null;
  }

  function buildCatalogue() {
    const monsters = [];
    const weapons = [];
    const armors = [];

    if (typeof $dataEnemies !== "undefined") {
      for (const enemy of $dataEnemies) {
        if (isDivider(enemy) || !enemy.id) continue;
        // A monster with no walking sprite has nothing to stand on a tile as,
        // so it is not dealt as a card.
        if (!charSheetOf(enemy)) continue;
        monsters.push(monsterKey(enemy.id));
      }
    }
    if (typeof $dataWeapons !== "undefined") {
      for (const weapon of $dataWeapons) {
        if (isDivider(weapon) || !weapon.id) continue;
        if (!(weapon.params || []).some((v) => v > 0)) continue; // nothing to print
        weapons.push(weaponKey(weapon.id));
      }
    }
    if (typeof $dataArmors !== "undefined") {
      for (const armor of $dataArmors) {
        if (isDivider(armor) || !armor.id) continue;
        if (!(armor.params || []).some((v) => v > 0)) continue;
        armors.push(armorKey(armor.id));
      }
    }

    _catalogue = { monsters, weapons, armors, all: monsters.concat(weapons, armors) };
    return _catalogue;
  }

  function catalogue() {
    if (!_catalogue || !_catalogue.all.length) buildCatalogue();
    return _catalogue;
  }

  //===========================================================================
  // The 0-13 scale
  //===========================================================================
  // A raw parameter is ranked against every other record on its own roster and
  // the percentile becomes the printed value. Two ladders: creatures, and gear
  // (weapons and armours share one, so a sword and a breastplate are priced
  // against the same scale). Gear ranks against POSITIVE values only, because
  // most gear leaves most parameters at zero and ranking against those would
  // hand every sword a free helping of magic defence.

  const PARAM = { MHP: 0, MMP: 1, ATK: 2, DEF: 3, MAT: 4, MDF: 5, AGI: 6, LUK: 7 };
  const RANKED_PARAMS = [PARAM.MHP, PARAM.ATK, PARAM.DEF, PARAM.MAT, PARAM.MDF, PARAM.AGI];

  let _ladders = null;

  function buildLadder(records, positiveOnly) {
    const ladder = {};
    for (const paramId of RANKED_PARAMS) {
      const values = [];
      for (const record of records) {
        const v = (record.params || [])[paramId] || 0;
        if (positiveOnly && v <= 0) continue;
        values.push(v);
      }
      values.sort((a, b) => a - b);
      ladder[paramId] = values;
    }
    return ladder;
  }

  function buildLadders() {
    const cat = catalogue();
    const enemies = cat.monsters.map(dataOf).filter(Boolean);
    const gear = cat.weapons.concat(cat.armors).map(dataOf).filter(Boolean);
    _ladders = {
      creature: buildLadder(enemies, false),
      gear: buildLadder(gear, true)
    };
    return _ladders;
  }

  function ladders() {
    if (!_ladders) buildLadders();
    return _ladders;
  }

  // Fraction of the roster this value stands above, counting a tie as half a
  // step so a wall of identical zeroes does not all rank at the top.
  function percentile(sorted, value) {
    const n = sorted.length;
    if (!n) return 0;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
    const below = lo;
    hi = n; let lo2 = below;
    while (lo2 < hi) { const mid = (lo2 + hi) >> 1; if (sorted[mid] <= value) lo2 = mid + 1; else hi = mid; }
    const equal = lo2 - below;
    return (below + equal * 0.5) / n;
  }

  // A percentile printed on the card. Anything the record actually has is worth
  // at least one point, so a real parameter never reads as nothing.
  function scaleValue(pct, raw) {
    const v = clamp(Math.round(STAT_MAX * pct), 0, STAT_MAX);
    if (v === 0 && raw > 0) return 1;
    return v;
  }

  const ZERO_STATS = { str: 0, wis: 0, dex: 0, psi: 0, con: 0 };

  const _statsCache = Object.create(null);

  function statsFor(key) {
    if (key in _statsCache) return _statsCache[key];
    // An effect card has no body and no numbers: it prints its rule instead.
    if (isEffect(key)) return (_statsCache[key] = Object.assign({}, ZERO_STATS));
    const data = dataOf(key);
    if (!data) return (_statsCache[key] = Object.assign({}, ZERO_STATS));

    const ladder = isMonster(key) ? ladders().creature : ladders().gear;
    const params = data.params || [];
    // Gear ranks on positives only, so a negative (cursed) parameter is simply
    // nothing rather than a minus sign on a scale that starts at zero.
    const raw = (paramId) => Math.max(0, params[paramId] || 0);
    const pct = (paramId) => (raw(paramId) > 0 ? percentile(ladder[paramId], raw(paramId)) : 0);

    const stats = {
      str: scaleValue(pct(PARAM.ATK), raw(PARAM.ATK)),
      wis: scaleValue(pct(PARAM.MDF), raw(PARAM.MDF)),
      dex: scaleValue(pct(PARAM.AGI), raw(PARAM.AGI)),
      psi: scaleValue(pct(PARAM.MAT), raw(PARAM.MAT)),
      // Constitution is whichever of bulk or armour speaks louder.
      con: scaleValue(
        Math.max(pct(PARAM.MHP), pct(PARAM.DEF)),
        Math.max(raw(PARAM.MHP), raw(PARAM.DEF))
      )
    };
    return (_statsCache[key] = stats);
  }

  function statTotal(statsOrKey) {
    const s = typeof statsOrKey === "string" ? statsFor(statsOrKey) : statsOrKey;
    return STATS.reduce((sum, id) => sum + (s[id] || 0), 0);
  }

  // A monster plus whatever has been bolted onto it, every stat clamped back to
  // the top of the scale so gear tunes a creature instead of replacing it.
  function combinedStats(cardKey, equipKeys) {
    const out = Object.assign({}, statsFor(cardKey));
    for (const key of equipKeys || []) {
      if (!key) continue;
      const bonus = statsFor(key);
      for (const id of STATS) out[id] = clamp(out[id] + bonus[id], 0, STAT_MAX);
    }
    return out;
  }

  //===========================================================================
  // Rarity
  //===========================================================================

  const _rarityCache = Object.create(null);

  function rarityOf(key) {
    if (key in _rarityCache) return _rarityCache[key];
    if (isEffect(key)) return (_rarityCache[key] = RARITY.EPIC);
    const data = dataOf(key);
    if (!data) return (_rarityCache[key] = RARITY.COMMON);

    let rarity;
    if (isMonster(key)) {
      // A boss is a boss whatever its parameters say.
      if (/<Boss>/i.test(data.note || "")) rarity = RARITY.LEGENDARY;
      else {
        const total = statTotal(key);
        rarity = total >= 52 ? RARITY.EPIC : total >= 38 ? RARITY.RARE : RARITY.COMMON;
      }
    } else {
      const price = data.price || 0;
      const craft = parseInt((String(data.note || "").match(/<CraftLevel:\s*(\d+)>/i) || [])[1], 10) || 0;
      rarity = (price >= 50000 || craft >= 5) ? RARITY.LEGENDARY
        : (price >= 12000 || craft >= 4) ? RARITY.EPIC
          : (price >= 2500 || craft >= 3) ? RARITY.RARE
            : RARITY.COMMON;
    }
    return (_rarityCache[key] = rarity);
  }

  const rarityKey = (rarity) => RARITY_KEYS[clamp(rarity, 0, 3)];
  const rarityName = (rarity) => T("CardGame.rarity." + rarityKey(rarity));

  let _byRarity = null;
  function keysByRarity(rarity) {
    if (!_byRarity) {
      _byRarity = [[], [], [], []];
      for (const key of catalogue().all) _byRarity[rarityOf(key)].push(key);
    }
    return _byRarity[clamp(rarity, 0, 3)];
  }

  //===========================================================================
  // Card text
  //===========================================================================
  // Deliberately re-rolled per instance rather than read off the world seed:
  // "each card description uses a randomised seed". Both services already take
  // a salt for exactly this, so no template is rewritten anywhere.

  function cardText(key, seed) {
    // An effect card's text is its rule, and the rule never varies.
    if (isEffect(key)) {
      const effect = effectOf(key);
      return effect ? T("CardGame.effect." + effect.id + ".desc") : "";
    }
    const data = dataOf(key);
    if (!data) return "";
    const salt = seed >>> 0;
    try {
      if (isMonster(key)) {
        if (!window.EnemyDescription) return "";
        const template = window.EnemyDescription.rawDescription(data.id);
        if (!template) return "";
        return window.EnemyDescription.resolve(template, "card:" + data.id + ":" + salt);
      }
      if (window.ItemSystemUtils && window.ItemSystemUtils.loreFor) {
        return window.ItemSystemUtils.loreFor(data, salt) || data.description || "";
      }
    } catch (e) { /* flavour text never breaks a card */ }
    return data.description || "";
  }

  //===========================================================================
  // Storage: the collection and the decks
  //===========================================================================
  // On $gameSystem, so it rides the binary save: one collection for the whole
  // party, never attached to a member and never written to the world folder.

  function sys() {
    return typeof $gameSystem !== "undefined" ? $gameSystem : null;
  }

  function collection() {
    const s = sys();
    if (!s) return {};
    if (!s._cardCollection) s._cardCollection = {};
    return s._cardCollection;
  }

  function countOf(key) {
    return collection()[key] || 0;
  }

  function addCard(key, amount) {
    if (!dataOf(key)) return 0;
    const store = collection();
    const n = Math.max(1, Math.round(amount || 1));
    store[key] = (store[key] || 0) + n;
    autoAddToDeck(key, n);
    return store[key];
  }

  // A deck that is not yet full takes whatever the party has just won, so a
  // player who never opens the builder still walks away from a booster with a
  // bigger deck than they sat down with. A full deck is left exactly as its
  // owner built it.
  function autoAddToDeck(key, amount) {
    const list = decks();
    if (!list.length) return;
    const deck = list[activeDeckIndex()];
    if (!deck || !Array.isArray(deck.cards)) return;
    let room = DECK_MAX - deck.cards.length;
    for (let i = 0; i < amount && room > 0; i++, room--) deck.cards.push(key);
  }

  function removeCard(key, amount) {
    const store = collection();
    if (!store[key]) return 0;
    store[key] = Math.max(0, store[key] - Math.max(1, Math.round(amount || 1)));
    if (!store[key]) delete store[key];
    return store[key] || 0;
  }

  function ownedKeys() {
    return Object.keys(collection()).filter((key) => collection()[key] > 0);
  }

  function totalOwned() {
    return ownedKeys().reduce((sum, key) => sum + countOf(key), 0);
  }

  // How much of the printable catalogue the party has seen, as a percentage.
  function completion() {
    const total = catalogue().all.length;
    if (!total) return 0;
    return (ownedKeys().length / total) * 100;
  }

  function decks() {
    const s = sys();
    if (!s) return [];
    if (!Array.isArray(s._cardDecks)) s._cardDecks = [];
    return s._cardDecks;
  }

  function activeDeckIndex() {
    const s = sys();
    if (!s) return 0;
    const list = decks();
    if (typeof s._cardActiveDeck !== "number") s._cardActiveDeck = 0;
    return clamp(s._cardActiveDeck, 0, Math.max(0, list.length - 1));
  }

  function setActiveDeck(index) {
    const s = sys();
    if (s) s._cardActiveDeck = clamp(index, 0, Math.max(0, decks().length - 1));
  }

  function activeDeck() {
    return decks()[activeDeckIndex()] || null;
  }

  // A deck is legal when it is the right size and every copy in it is a copy
  // the party actually owns.
  function deckLegality(cards) {
    const list = Array.isArray(cards) ? cards : [];
    if (list.length < DECK_MIN) return { ok: false, reason: "tooFew" };
    if (list.length > DECK_MAX) return { ok: false, reason: "tooMany" };
    const used = {};
    for (const key of list) {
      used[key] = (used[key] || 0) + 1;
      if (used[key] > countOf(key)) return { ok: false, reason: "notOwned", key };
    }
    return { ok: true };
  }

  function saveDeck(index, deck) {
    const list = decks();
    if (index == null || index < 0 || index >= list.length) list.push(deck);
    else list[index] = deck;
  }

  function deleteDeck(index) {
    const list = decks();
    if (index >= 0 && index < list.length) list.splice(index, 1);
    setActiveDeck(activeDeckIndex());
  }

  // The deck a duel is actually played with: the active one when it is legal,
  // otherwise the best hand the collection can make on its own, so a player who
  // never opened the deck builder is still dealt something playable.
  function playableDeck() {
    const deck = activeDeck();
    if (deck && deckLegality(deck.cards).ok) return deck.cards.slice();
    return autoDeck();
  }

  // Every party owns one of each effect card from the moment it exists: they
  // are the game's own vocabulary rather than something to be pulled out of a
  // pack, so they are handed over once and never rolled for.
  function ensureStarterEffects() {
    const s = sys();
    if (!s || s._cardStarterEffects) return false;
    s._cardStarterEffects = true;
    const store = collection();
    for (const key of EFFECT_KEYS) store[key] = (store[key] || 0) + 1;
    return true;
  }

  // Whether the party can sit down at a table at all. A deck is 9 cards at the
  // least, so a collection that cannot make one is the reason a duel is refused
  // rather than started and lost.
  function canDuel() {
    return playableDeck().length >= DECK_MIN;
  }

  // Every copy the party owns, one entry per copy, as the pool a deck is drawn
  // from.
  function ownedPool() {
    const pool = [];
    for (const key of ownedKeys()) {
      for (let i = 0; i < countOf(key); i++) pool.push(key);
    }
    return pool;
  }

  // A deck dealt at random out of the collection, filled to the brim: the
  // "shuffle" button, for a player who would rather be handed one.
  function shuffledDeck() {
    const pool = ownedPool();
    const rng = makeRng(rollSeed());
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // The five tricks are never the cards a random deal leaves behind: they
    // are what makes a hand interesting, so they go in first.
    pool.sort((a, b) => (isEffect(b) ? 1 : 0) - (isEffect(a) ? 1 : 0));
    return pool.slice(0, Math.min(DECK_MAX, pool.length));
  }

  // Strongest legal deck the collection can field, dearest cards first.
  function autoDeck() {
    const pool = ownedPool();
    // The tricks first, then creatures (they are what wins a match), then gear,
    // which only helps once something is standing on the board.
    const band = (key) => (isEffect(key) ? 2 : isMonster(key) ? 1 : 0);
    pool.sort((a, b) => (band(b) - band(a)) || (statTotal(b) - statTotal(a)));
    return pool.slice(0, Math.min(DECK_MAX, pool.length));
  }

  //===========================================================================
  // Boosters
  //===========================================================================

  function rollRarity(rng, table) {
    let roll = rng();
    for (let i = table.length - 1; i >= 0; i--) {
      if (table[i] <= 0) continue;
      roll -= table[i];
      if (roll < 0) return i;
    }
    return RARITY.COMMON;
  }

  // Six cards, monsters and gear from one pool. `luck` (0-1) leans the odds up
  // a band, which is what a duel streak buys.
  function rollBooster(size, opts) {
    const options = opts || {};
    const count = Math.max(1, Math.round(size || PACK_SIZE));
    const rng = makeRng(options.seed != null ? options.seed : rollSeed());
    const luck = clamp(Number(options.luck) || 0, 0, 1);
    const out = [];
    for (let i = 0; i < count; i++) {
      const base = (i === count - 1) ? PACK_ODDS_LAST : PACK_ODDS;
      let rarity = rollRarity(rng, base);
      if (luck > 0 && rng() < luck) rarity = Math.min(RARITY.LEGENDARY, rarity + 1);
      let pool = keysByRarity(rarity);
      // A band with nothing in it (a very small database) steps back down.
      while (!pool.length && rarity > 0) pool = keysByRarity(--rarity);
      if (!pool.length) break;
      out.push(pool[Math.floor(rng() * pool.length) % pool.length]);
    }
    return out;
  }

  // Bank a rolled pack. Returns the rows the opening animation reads, each one
  // flagged with whether it is the first copy the party has ever held.
  function openBooster(keys) {
    return (keys || []).map((key) => {
      const isNew = countOf(key) === 0;
      addCard(key, 1);
      return { key, isNew, rarity: rarityOf(key) };
    });
  }

  //===========================================================================
  // Opponents
  //===========================================================================

  // An NPC's deck is DERIVED, never stored: the same person always brings the
  // same cards because the roll is seeded on their name and the world, so
  // "a predetermined set of cards" costs nothing to persist.
  function npcDeck(npcName, profile) {
    const rng = makeRng((hashString("cards:" + String(npcName)) ^ worldSeed()) >>> 0);
    const level = clamp((profile && profile.level) || 10, 1, 99);
    const wealth = clamp((profile && profile.wealthTierBase) || 1, 0, 4);
    // A richer, higher-standing person fields a dearer deck.
    const power = clamp(level / 60 + wealth / 8, 0.15, 1);
    const size = 12 + Math.floor(rng() * 5);
    return buildRolledDeck(rng, size, power);
  }

  // A deck rolled straight out of the catalogue rather than the collection, for
  // a practice duel or the random-battle plugin command.
  function randomDeck(size, power) {
    const rng = makeRng(rollSeed());
    return buildRolledDeck(rng, clamp(size || 16, DECK_MIN, DECK_MAX), clamp(power == null ? 0.5 : power, 0, 1));
  }

  // Roughly a quarter gear, the rest monsters, with `power` deciding how far up
  // the rarity ladder the roll is allowed to reach.
  function buildRolledDeck(rng, size, power) {
    const cat = catalogue();
    const ceiling = power >= 0.85 ? RARITY.LEGENDARY : power >= 0.6 ? RARITY.EPIC : power >= 0.3 ? RARITY.RARE : RARITY.COMMON;
    const pick = (pool) => {
      if (!pool.length) return null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const key = pool[Math.floor(rng() * pool.length) % pool.length];
        if (rarityOf(key) <= ceiling) return key;
      }
      return pool[Math.floor(rng() * pool.length) % pool.length];
    };
    const gear = cat.weapons.concat(cat.armors);
    const out = [];
    // Everybody brings a trick or two: an opponent who could never answer a
    // Cull would be no opponent at all.
    const tricks = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < tricks && i < size; i++) {
      out.push(EFFECT_KEYS[Math.floor(rng() * EFFECT_KEYS.length) % EFFECT_KEYS.length]);
    }
    while (out.length < size) {
      const key = rng() < 0.25 ? pick(gear) : pick(cat.monsters);
      if (!key) break;
      out.push(key);
    }
    return out;
  }

  //===========================================================================
  // The clash
  //===========================================================================
  // Pure and testable. `board` is BOARD_CELLS entries, each null or
  // { key, owner, weapon, armor }. Nothing here reads global state except the
  // stat tables, so a harness can drive it with hand-built boards.

  const neighboursOf = (index) => {
    const x = index % BOARD_SIZE, y = (index / BOARD_SIZE) | 0;
    const out = [];
    if (y > 0) out.push(index - BOARD_SIZE);
    if (y < BOARD_SIZE - 1) out.push(index + BOARD_SIZE);
    if (x > 0) out.push(index - 1);
    if (x < BOARD_SIZE - 1) out.push(index + 1);
    return out;
  };

  // A tile's numbers as they stand: the creature, whatever is bolted onto it,
  // and whatever an effect card did to it (`mult`, 0.5 for Blight, 2 for Gild).
  function cellStats(cell) {
    if (!cell) return Object.assign({}, ZERO_STATS);
    if (cell.stats) return cell.stats;
    const base = combinedStats(cell.key, [cell.weapon, cell.armor]);
    const mult = cell.mult == null ? 1 : cell.mult;
    if (mult === 1) return base;
    const out = {};
    for (const id of STATS) out[id] = clamp(Math.floor(base[id] * mult), 0, STAT_MAX);
    return out;
  }

  // One pairing, scored stat by stat. Most stats won takes it; an equal count
  // of won stats destroys both. A drawn stat counts for neither side, unless
  // one of them is Warded, in which case the tie is theirs.
  function scorePair(statsA, statsB, wardA, wardB) {
    const rows = [];
    let winsA = 0, winsB = 0;
    for (const id of STATS) {
      const a = statsA[id] || 0, b = statsB[id] || 0;
      let winner = a > b ? "a" : b > a ? "b" : null;
      if (winner === null && wardA !== wardB) winner = wardA ? "a" : "b";
      if (winner === "a") winsA++; else if (winner === "b") winsB++;
      rows.push({ stat: id, a, b, winner });
    }
    const outcome = winsA > winsB ? "a" : winsB > winsA ? "b" : "both";
    return { rows, winsA, winsB, outcome };
  }

  function resolveClash(board, seed) {
    const rng = makeRng(seed != null ? seed : rollSeed());
    const snapshot = board.map((cell) => (cell ? cellStats(cell) : null));
    const totals = snapshot.map((s) => (s ? statTotal(s) : 0));

    // Every monster names its target against the frozen board: the weakest
    // enemy beside it, ties broken by a seeded roll so a replay is identical.
    const pairSet = new Map();
    for (let i = 0; i < board.length; i++) {
      const cell = board[i];
      if (!cell) continue;
      let best = [];
      let bestTotal = Infinity;
      for (const n of neighboursOf(i)) {
        const other = board[n];
        if (!other || other.owner === cell.owner) continue;
        if (totals[n] < bestTotal) { bestTotal = totals[n]; best = [n]; }
        else if (totals[n] === bestTotal) best.push(n);
      }
      if (!best.length) continue;
      const target = best.length === 1 ? best[0] : best[Math.floor(rng() * best.length) % best.length];
      // A mutual stare is one fight, not two.
      const pairId = i < target ? i + ":" + target : target + ":" + i;
      if (!pairSet.has(pairId)) pairSet.set(pairId, [Math.min(i, target), Math.max(i, target)]);
    }

    const pairs = [];
    const deaths = new Set();
    for (const [a, b] of pairSet.values()) {
      const score = scorePair(snapshot[a], snapshot[b], !!board[a].warded, !!board[b].warded);
      const dead = score.outcome === "a" ? [b] : score.outcome === "b" ? [a] : [a, b];
      dead.forEach((idx) => deaths.add(idx));
      pairs.push({ a, b, rows: score.rows, winsA: score.winsA, winsB: score.winsB, outcome: score.outcome, dead });
    }

    // Every death lands together: one round, no cascade.
    const survivors = [0, 0];
    const survivingStats = [0, 0];
    for (let i = 0; i < board.length; i++) {
      const cell = board[i];
      if (!cell || deaths.has(i)) continue;
      survivors[cell.owner]++;
      survivingStats[cell.owner] += totals[i];
    }

    let winner = null;
    if (survivors[0] > survivors[1]) winner = 0;
    else if (survivors[1] > survivors[0]) winner = 1;
    else if (survivingStats[0] > survivingStats[1]) winner = 0;
    else if (survivingStats[1] > survivingStats[0]) winner = 1;

    return { pairs, deaths: Array.from(deaths), survivors, survivingStats, winner };
  }

  //===========================================================================
  // The market: what a card is worth, and what is on sale today
  //===========================================================================
  // Cards are traded on the Hypernet rather than face to face, and the site
  // (Cards/CardGameCollection.js draws it) lists a SMALL set of lots that is
  // rolled fresh every game day and sells out for good once it is gone. A
  // price follows what the card actually is: its rarity band sets the figure
  // and its printed stats move it, so a legendary with nothing behind it is
  // worth less than the best common on the shelf. What a dealer PAYS is a
  // fraction of what it asks, because the spread is the shop's living.
  //
  // Everything here is in gold, which is euros with two implied decimals
  // everywhere in the game.
  const MARKET_LOTS = 6;                        // lots listed in a day
  const MARKET_BASE = [900, 2600, 7000, 18000]; // the asking price by rarity
  const MARKET_SPREAD = 0.45;                   // of the asking price, what a seller is paid
  const MARKET_SWING = 0.18;                    // how far a day's price drifts either way
  const MARKET_MAX_QTY = 3;                     // copies in one lot

  // What a card is worth before the day's drift: its band, moved by its stats.
  function cardValue(key) {
    if (!dataOf(key) && !isEffect(key)) return 0;
    const base = MARKET_BASE[rarityOf(key)] || MARKET_BASE[0];
    const scale = 0.55 + 0.9 * (statTotal(key) / (STAT_MAX * STATS.length));
    return Math.max(100, Math.round(base * scale));
  }

  // The same card, quoted on one day. The drift is seeded on the card and the
  // day, so every screen quotes the same figure and tomorrow is a new price.
  function askingPrice(key, day) {
    const d = day == null ? dayIndex() : day;
    const rng = makeRng((hashString("cardmarket:" + key) ^ worldSeed() ^ Math.imul(d + 1, 2654435761)) >>> 0);
    return Math.max(100, Math.round(cardValue(key) * (1 + (rng() * 2 - 1) * MARKET_SWING)));
  }

  // What the site pays for a card of the party's own.
  function sellPrice(key) {
    return Math.max(50, Math.round(cardValue(key) * MARKET_SPREAD));
  }

  // The lots on sale on a given day. Pure: the same day always rolls the same
  // shelf, so nothing has to be stored but what has been bought out of it.
  function marketLots(day) {
    const d = day == null ? dayIndex() : day;
    const seed = (hashString("cardmarket:day") ^ worldSeed() ^ Math.imul(d + 1, 2246822519)) >>> 0;
    const keys = rollBooster(MARKET_LOTS, { seed });
    const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
    const out = [];
    for (const key of keys) {
      // A rare lot is a thinner one: one copy of the good stuff, a handful of
      // the ordinary.
      const room = Math.max(1, MARKET_MAX_QTY - rarityOf(key));
      out.push({ key, price: askingPrice(key, d), qty: 1 + Math.floor(rng() * room) });
    }
    return out;
  }

  function marketState() {
    const s = sys();
    if (!s) return { day: 0, bought: {} };
    const today = dayIndex();
    if (!s._cardMarket || s._cardMarket.day !== today) s._cardMarket = { day: today, bought: {} };
    return s._cardMarket;
  }

  // Today's shelf with what the party has already taken off it.
  function marketToday() {
    const state = marketState();
    return marketLots(state.day).map((lot, i) => {
      const taken = state.bought[i] || 0;
      return { index: i, key: lot.key, price: lot.price, qty: lot.qty, taken, left: Math.max(0, lot.qty - taken) };
    });
  }

  // Buy one copy out of a lot. The refusals are the reasons a UI prints.
  function buyLot(index) {
    const lots = marketToday();
    const lot = lots[index];
    if (!lot) return { ok: false, reason: "gone" };
    if (lot.left <= 0) return { ok: false, reason: "soldOut" };
    if (typeof $gameParty === "undefined" || $gameParty.gold() < lot.price) return { ok: false, reason: "poor", price: lot.price };
    $gameParty.loseGold(lot.price);
    addCard(lot.key, 1);
    const state = marketState();
    state.bought[index] = (state.bought[index] || 0) + 1;
    return { ok: true, key: lot.key, price: lot.price, left: lot.left - 1 };
  }

  // Sell one copy. Effect cards are the party's own vocabulary rather than
  // stock, and nothing else is held back: a copy sold out from under a deck is
  // trimmed out of every deck that listed it, so no deck is left illegal.
  function sellCard(key) {
    if (isEffect(key)) return { ok: false, reason: "notForSale" };
    if (countOf(key) <= 0) return { ok: false, reason: "notOwned" };
    const price = sellPrice(key);
    removeCard(key, 1);
    trimDecks(key);
    if (typeof $gameParty !== "undefined") $gameParty.gainGold(price);
    return { ok: true, key, price };
  }

  // Every deck listing more copies of a card than the party still owns loses
  // the extra ones, oldest entry first.
  function trimDecks(key) {
    for (const deck of decks()) {
      if (!deck || !Array.isArray(deck.cards)) continue;
      let allowed = countOf(key);
      deck.cards = deck.cards.filter((k) => k !== key || allowed-- > 0);
    }
  }

  // The copies the party can put up for sale: everything owned, minus the
  // effect cards, dearest first.
  function sellableCards() {
    return ownedKeys()
      .filter((key) => !isEffect(key))
      .map((key) => ({ key, count: countOf(key), price: sellPrice(key) }))
      .sort((a, b) => b.price - a.price || a.key.localeCompare(b.key));
  }

  //===========================================================================
  // Daily duel gate and the streak
  //===========================================================================

  // The world clock in days. Variable 114 is the game time in minutes.
  function dayIndex() {
    const minutes = (typeof $gameVariables !== "undefined" && $gameVariables.value(114)) || 0;
    return Math.floor(minutes / 1440);
  }

  function duelLog() {
    const s = sys();
    if (!s) return {};
    if (!s._cardDuelLog) s._cardDuelLog = {};
    return s._cardDuelLog;
  }

  function hasDuelledToday(npcName) {
    if (!npcName) return false;
    return duelLog()[npcName] === dayIndex();
  }

  function markDuelled(npcName) {
    if (!npcName) return;
    duelLog()[npcName] = dayIndex();
  }

  function tradeLog() {
    const s = sys();
    if (!s) return {};
    if (!s._cardTradeLog) s._cardTradeLog = {};
    return s._cardTradeLog;
  }

  function hasTradedToday(npcName) {
    if (!npcName) return false;
    return tradeLog()[npcName] === dayIndex();
  }

  function markTraded(npcName) {
    if (!npcName) return;
    tradeLog()[npcName] = dayIndex();
  }

  // What an NPC will swap: the distinct cards in the deck they bring to a
  // table, since a person trades out of what they own.
  function npcCards(npcName, profile) {
    const seen = [];
    for (const key of npcDeck(npcName, profile)) {
      if (!seen.includes(key)) seen.push(key);
    }
    return seen;
  }

  // What the party would have to give up for `wanted`: the spare copy closest
  // to it in power, so a swap is a swap rather than a gift in either direction.
  // `reserved` names cards the party may not part with (its last copies).
  function tradeCounterOffer(wanted, spares) {
    if (!spares || !spares.length) return null;
    const target = statTotal(wanted);
    let best = null, bestGap = Infinity;
    for (const key of spares) {
      if (key === wanted) continue;
      const gap = Math.abs(statTotal(key) - target) + Math.abs(rarityOf(key) - rarityOf(wanted)) * 4;
      if (gap < bestGap) { bestGap = gap; best = key; }
    }
    return best;
  }

  function streak() {
    const s = sys();
    return (s && s._cardStreak) || 0;
  }

  function bumpStreak(won) {
    const s = sys();
    if (!s) return 0;
    s._cardStreak = won ? streak() + 1 : 0;
    return s._cardStreak;
  }

  // What a win is worth as pack luck: a long streak reaches higher up the
  // rarity ladder, which is the reason to keep playing.
  function streakLuck() {
    return clamp(streak() * 0.08, 0, 0.5);
  }

  //===========================================================================
  // Art
  //===========================================================================

  function charSheetFor(key) {
    if (!isMonster(key)) return null;
    return charSheetOf(dataOf(key));
  }

  // The whole picture on a monster card: its own walking sprite. The flat
  // battler illustration this used to return retired with the 2D battler mode.
  function spriteArt(key, px) {
    if (!isMonster(key) || !charSheetFor(key)) return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px || 96;
    drawTileSprite(canvas, key, 1);
    return canvas;
  }

  // Draw a monster's walking sprite onto a canvas, the way the bestiary list
  // does: `$`-prefixed sheets are 3x4, the rest 12x8, and the first row faces
  // the player.
  function drawTileSprite(canvas, key, frame) {
    const sheet = charSheetFor(key);
    const ctx = canvas && canvas.getContext("2d");
    if (!ctx) return;
    if (!sheet) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const bitmap = ImageManager.loadCharacter("Monsters/" + sheet);
    bitmap.addLoadListener(() => {
      // Deliberately NOT gated on the canvas being in the page: a hand card is
      // drawn before it is appended, and a sheet already in the cache fires
      // this listener on the spot, which is what used to leave those cards
      // blank. Painting a canvas nobody ends up showing costs one drawImage.
      const single = sheet.startsWith("$");
      const pw = single ? bitmap.width / 3 : bitmap.width / 12;
      const ph = single ? bitmap.height / 4 : bitmap.height / 8;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap.canvas, (frame % 3) * pw, 0, pw, ph, 0, 0, canvas.width, canvas.height);
    });
  }

  // The IconSet glyph an equipment card is illustrated with, as inline CSS.
  function iconStyle(key, size) {
    const effect = effectOf(key);
    const data = dataOf(key);
    const index = effect ? effect.icon : ((data && data.iconIndex) || 0);
    const px = size || 64;
    const col = index % 16, row = Math.floor(index / 16);
    return `background-image:url('img/system/IconSet.png');background-size:${px * 16}px auto;`
      + `background-position:-${col * px}px -${row * px}px;width:${px}px;height:${px}px;`
      + `image-rendering:pixelated;display:inline-block;flex-shrink:0;`;
  }

  //===========================================================================
  // Public module
  //===========================================================================

  window.CardGame = {
    // constants
    STAT_MAX, STATS, BOARD_SIZE, BOARD_CELLS, DECK_MIN, DECK_MAX, HAND_START, HAND_MAX, PACK_SIZE,
    DRAW_COUNT,
    RARITY, RARITY_KEYS,

    // helpers
    hashString, makeRng, rollSeed, clamp, worldSeed,

    // catalogue
    catalogue, parseKey, dataOf, nameOf, isMonster, isWeapon, isArmor, isEquip,
    monsterKey, weaponKey, armorKey,

    // effect cards
    EFFECTS, EFFECT_KEYS, isEffect, effectOf, effectId, ensureStarterEffects,

    // stats
    statsFor, statTotal, combinedStats, cellStats,
    statLabel: (id) => T("CardGame.stat." + id),

    // rarity
    rarityOf, rarityKey, rarityName, keysByRarity,

    // text
    cardText,

    // collection
    collection, countOf, addCard, removeCard, ownedKeys, totalOwned, completion,

    // decks
    decks, activeDeck, activeDeckIndex, setActiveDeck, saveDeck, deleteDeck,
    deckLegality, playableDeck, autoDeck, shuffledDeck, ownedPool, canDuel,

    // boosters
    rollBooster, openBooster,

    // opponents
    npcDeck, randomDeck, npcCards, tradeCounterOffer,

    // clash
    neighboursOf, scorePair, resolveClash,

    // the market
    cardValue, askingPrice, sellPrice, marketLots, marketToday, marketState,
    buyLot, sellCard, sellableCards, MARKET_LOTS,

    // daily gate and streak
    dayIndex, hasDuelledToday, markDuelled, hasTradedToday, markTraded,
    streak, bumpStreak, streakLuck,

    // art
    Art: {
      charSheetFor, spriteArt, drawTileSprite, iconStyle
    }
  };

  // A brand new party starts holding the five tricks, and so does a savegame
  // made before they existed, the first time anything asks for the collection.
  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    ensureStarterEffects();
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    ensureStarterEffects();
  };
})();
