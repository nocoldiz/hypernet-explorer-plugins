/*:
 * @target MZ
 * @plugindesc NPCShared v1.0.0, Common utilities for the NPC simulation suite
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCShared, single home for helpers the NPC plugins used to copy-paste
 * ============================================================================
 * Exposes window.NPCShared with:
 *   nameHash(str)              djb2-xor string hash (alias: nameToSeed)
 *   Rng                        xorshift32 seeded RNG:
 *                                next()            float in [0,1)
 *                                int(min, max)     integer, max INCLUSIVE
 *                                nextInt(min, max) integer, max EXCLUSIVE
 *                                pick(arr)         random element
 *   worldSeed()                HistoryManager seed, or 19002001 (canon default)
 *   sampleCount(rng, expected) expected-count sampling: rate×days → concrete
 *                              event count without iterating days
 *   clamp(v, min, max)
 *   BLOCKED_TERRAIN_TAGS       terrain tags NPCs never occupy: [3, 7]
 *   isBlockedTerrain(x, y)     true when (x, y) carries one of those tags
 *   seededShuffle(arr, rng)    Fisher–Yates returning a new array
 *   escapeHtml(s)
 *   ideologyFor(profile)       the creed a society profile holds (id, else slot)
 *   ideologyAxes(creed|profile|id)  its five-axis position, econ/auth/trad/mil/myst
 *   ideologyDistance(a, b)     mean axis distance, 0 (same creed) .. 200
 *   nearestIdeologies(x, opts) the creeds standing closest to a position
 *   isForbiddenItem(id)        an item no NPC may hold (the Liminal cuffs)
 *   isCarKeys(id), grantCarKeys(profile)  the RoadCarAI car keys in a hand
 *   WorldModes                 what the simulation does in each world creation
 *                              mode (also window.WorldModes)
 *
 * The Rng bit stream is identical to the SeededRng / LifeRng / PolRng /
 * WebRng / MiniRng classes it replaces, so existing worlds stay deterministic.
 *
 * Load order: before every other NPC/* plugin.
 * Node-safe: no DOM access; test harnesses require() this file first.
 */

(() => {
  "use strict";

  const DEFAULT_SEED = 19002001;

  function nameHash(str) {
    const s = String(str);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h || 1;
  }

  class Rng {
    constructor(seed) { this._s = (seed || 1) >>> 0; }
    next() {
      let x = this._s;
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;  x >>>= 0;
      this._s = x;
      return x / 4294967296;
    }
    int(min, max)     { return min + Math.floor(this.next() * (max - min + 1)); }
    nextInt(min, max) { return min + Math.floor(this.next() * (max - min)); }
    pick(arr)         { return arr[Math.floor(this.next() * arr.length)]; }
  }

  function worldSeed() {
    return (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : DEFAULT_SEED;
  }

  function sampleCount(rng, expected) {
    if (expected <= 0) return 0;
    const base = Math.floor(expected);
    return base + (rng.next() < expected - base ? 1 : 0);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // Terrain tags no NPC may ever stand on, spawn on or path through: 3 is
  // water (an NPC that wanders in looks like it is drowning, #121) and 7 is
  // likewise off limits. Every NPC plugin asks here so the list stays in one
  // place, region rules (10/103/99) are separate and stay with their callers.
  const BLOCKED_TERRAIN_TAGS = [3, 7];

  function isBlockedTerrain(x, y) {
    if (typeof $gameMap === "undefined" || !$gameMap) return false;
    // The keep-out region is off limits to an NPC wherever it is painted,
    // indoors or out: it marks the mass a room was cut out of, and a villager
    // standing inside a wall is the same bug as a chest dealt into one.
    if (window.RegionRules && window.RegionRules.blocksSpawn(x, y)) return true;
    return BLOCKED_TERRAIN_TAGS.includes($gameMap.terrainTag(x, y));
  }

  function seededShuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Money is stored in gold, displayed in euros: 100 gold = 1.00€.
  function formatMoney(gold) {
    const eur = Math.floor(Number(gold) || 0) / 100;
    if (eur >= 1_000_000_000) return `${(eur / 1_000_000_000).toFixed(2)}B€`;
    if (eur >= 1_000_000)     return `${(eur / 1_000_000).toFixed(2)}M€`;
    if (eur >= 1_000)         return `${(eur / 1_000).toFixed(1)}K€`;
    return `${eur.toFixed(2)}€`;
  }

  // Older log lines embed raw amounts as "<n>g" ("earned 16g", "42881g saved").
  // Rewrite every such amount into the euro display.
  function goldTextToEuros(text) {
    return String(text ?? "").replace(/(\d[\d,]*)\s*g\b/g, (m, num) =>
      formatMoney(Number(String(num).replace(/,/g, ""))));
  }

  // ==========================================================================
  // Aliens: who a non-human face belongs to
  // ==========================================================================
  //
  // A sheet flagged `aliens` in js/db/WorldGen/NPCs.json is not a person of this
  // world, and everything that follows from that (which caste they belong to,
  // which system they came from, which power and faction claim them, what they
  // believe) is derived HERE and nowhere else, so the Empathize panel, the
  // society generator and the politics sim all give one answer.
  //
  // The caste follows the sheet, because the sheets are drawn as the castes:
  // the Zeta Reticulan Tourists are the idle Greys who came to look, the
  // Crimson Analyzers who open whatever they are curious about, and the Pale
  // Warpers who fold minds rather than speak. The Dargos of Titania are not a
  // Zeta caste at all and answer to nobody but themselves.
  const ALIEN_CASTE_BY_SHEET = {
    AlienGrey:       "grey",
    AlienTrucker:    "grey",
    AlienXori:       "crimson",
    AlienMindmaster: "pale",
    AlienMystic:     "pale",
    AlienDargos:     "dargos",
  };
  const ZETA_CASTES = ["grey", "crimson", "pale"];
  // i18n-ignore-start: hyperpower keys (Hyperpowers.json), faction ids
  // (Factions.json) and ideology ids (Ideology.json), all joined on, never read.
  const ALIEN_CASTE_DATA = {
    grey:    { power: "The Tourists", factionId: 51, ideology: "zeta_touristic_observism" },
    crimson: { power: "The Tourists", factionId: 52, ideology: "crimson_vivisectionism" },
    pale:    { power: "The Tourists", factionId: 53, ideology: "pale_psionic_supremacy" },
    dargos:  { power: "The Dargos",   factionId: 54, ideology: "trolling_humans" },
  };
  // The star systems, by their id in js/db/GalaxySim/Systems.json.
  const ZETA_ORIGINS = ["Zeta Reticuli A", "Zeta Reticuli B"];
  const DARGOS_ORIGIN = "Titania";
  // i18n-ignore-end

  // The bare sheet name: "Skab/!$AlienGrey" -> "AlienGrey".
  function spriteBaseName(spriteKey) {
    return String(spriteKey || "").split("/").pop().replace(/^[!$]+/, "");
  }

  function isAlienSprite(spriteKey) {
    if (!spriteKey) return false;
    if (window.SpriteCatalog && window.SpriteCatalog.isAlien) {
      return window.SpriteCatalog.isAlien(spriteKey);
    }
    const entry = window.WorldGen && window.WorldGen.NPCs && window.WorldGen.NPCs[spriteKey];
    return !!(entry && entry.aliens === true);
  }

  // A seeded stream for one question about one alien. The first draw off a
  // freshly seeded xorshift is correlated with the seed (over four hundred
  // consecutive names, a two-way split came out four hundred to nothing), so
  // one step is spent before anything is read from it.
  function alienRng(question, key) {
    const rng = new Rng(nameHash(question + ":" + (key || "")) ^ worldSeed());
    rng.next();
    return rng;
  }

  // Which of the three Tourist castes, or the Dargos. An alien sheet nobody has
  // cast yet falls to a seeded Zeta caste rather than to nothing, so a sheet
  // added to NPCs.json reads as one of them without a table entry of its own.
  function alienCaste(spriteKey, npcName) {
    const named = ALIEN_CASTE_BY_SHEET[spriteBaseName(spriteKey)];
    if (named) return named;
    return ZETA_CASTES[alienRng("caste", npcName || spriteKey).nextInt(0, ZETA_CASTES.length)];
  }

  // Where they came from. A Dargos is always from Titania; every Zeta Reticulan
  // is from one of the pair, seeded on their own name so it never drifts.
  function alienOrigin(spriteKey, npcName) {
    if (alienCaste(spriteKey, npcName) === "dargos") return DARGOS_ORIGIN;
    return ZETA_ORIGINS[alienRng("origin", npcName || spriteKey).nextInt(0, ZETA_ORIGINS.length)];
  }

  // The whole answer for one alien: caste, origin system, power, faction and
  // creed, plus the labels to print them under. Null for anybody from here.
  function alienIdentity(spriteKey, npcName) {
    if (!isAlienSprite(spriteKey)) return null;
    const caste = alienCaste(spriteKey, npcName);
    const data = ALIEN_CASTE_DATA[caste] || ALIEN_CASTE_DATA.grey;
    const origin = alienOrigin(spriteKey, npcName);
    const label = (key, fallback) =>
      (window.T && window.T.has && window.T.has(key)) ? window.T(key) : fallback;
    return {
      caste,
      casteName: label("Aliens.caste." + caste, caste),
      casteDesc: label("Aliens.casteDesc." + caste, ""),
      origin,
      originName: label("Aliens.origin." + origin.toLowerCase().replace(/[^a-z0-9]/g, ""), origin),
      power: data.power,
      powerName: label("Factions.power." + data.power.toLowerCase().replace(/[^a-z0-9]/g, ""), data.power),
      factionId: data.factionId,
      ideologyId: data.ideology,
    };
  }

  window.AlienOrigins = {
    CASTES: ZETA_CASTES.concat("dargos"),
    ZETA_ORIGINS,
    DARGOS_ORIGIN,
    spriteBaseName,
    isAlienSprite,
    casteOf: alienCaste,
    originOf: alienOrigin,
    identify: alienIdentity,
    powerOf(spriteKey, npcName) {
      const id = alienIdentity(spriteKey, npcName);
      return id ? id.power : null;
    },
  };

  // ==========================================================================
  // Creeds: the five-axis reading of an ideology
  // ==========================================================================
  //
  // Every entry in js/db/WorldGen/Ideology.json carries an `axes` block on the
  // same five axes the politics sim runs on (econ / auth / trad / mil / myst,
  // each -100..+100), so the creed a society profile holds is a real position
  // rather than a label: it seeds the NPC's political identity, decides which
  // creed they drift to when their worldview shifts, and measures how far apart
  // two people stand. Every reader goes through here so they all agree.
  //
  // A profile stores `ideologyIndex` (a slot in the array, which is why the
  // file's order is never rearranged) and, since this rework, `ideologyId`.
  // The id wins where both are present, so a creed inserted mid-file would cost
  // nothing but the index fallback of profiles written before it.
  const IDEOLOGY_AXES = ["econ", "auth", "trad", "mil", "myst"];
  const NEUTRAL_AXES = { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 };

  function ideologyList() {
    const list = window.WorldGen && window.WorldGen.Ideology;
    return Array.isArray(list) ? list : [];
  }

  function ideologyById(id) {
    if (!id) return null;
    return ideologyList().find(i => i && i.id === id) || null;
  }

  // The creed a profile holds, by id where it has one, by slot otherwise.
  function ideologyFor(profile) {
    if (!profile) return null;
    const byId = ideologyById(profile.ideologyId);
    if (byId) return byId;
    const list = ideologyList();
    const idx = profile.ideologyIndex;
    return (typeof idx === "number" && idx >= 0 && idx < list.length) ? list[idx] : null;
  }

  // Accepts a creed, a profile, an id, or a bare axes object.
  function ideologyAxes(source) {
    if (!source) return { ...NEUTRAL_AXES };
    if (typeof source === "string") return ideologyAxes(ideologyById(source));
    if (source.axes) return { ...NEUTRAL_AXES, ...source.axes };
    if (source.ideologyId !== undefined || source.ideologyIndex !== undefined) {
      const creed = ideologyFor(source);
      return creed ? { ...NEUTRAL_AXES, ...(creed.axes || {}) } : { ...NEUTRAL_AXES };
    }
    if (IDEOLOGY_AXES.some(ax => typeof source[ax] === "number")) {
      return { ...NEUTRAL_AXES, ...source };
    }
    return { ...NEUTRAL_AXES };
  }

  // Mean absolute distance over the five axes: 0 (the same creed) to 200
  // (opposed on every axis). Two ordinary people are typically well under 80.
  function ideologyDistance(a, b) {
    const x = ideologyAxes(a), y = ideologyAxes(b);
    let d = 0;
    for (const ax of IDEOLOGY_AXES) d += Math.abs(x[ax] - y[ax]);
    return d / IDEOLOGY_AXES.length;
  }

  // The creeds standing nearest a given position, for drift and for seeding.
  // `alien` keeps a citizen out of the off-world creeds and an off-worlder out
  // of ours, which is the one hard rule the roster has.
  function nearestIdeologies(source, { alien = false, limit = 8, exclude = null } = {}) {
    const from = ideologyAxes(source);
    return ideologyList()
      .map((ideo, index) => ({ ideo, index, distance: ideologyDistance(from, ideo) }))
      .filter(e => !!e.ideo.alien === !!alien && e.ideo.id !== exclude)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.max(1, limit));
  }

  // A creed that nothing in the simulation may move: one the map author wrote
  // on the event (NPCInitSpec `ideology:`) or one the player chose for a
  // character they built. The civic draw, the directed drift, conversion and
  // the politics realignment all ask here, so they agree.
  function creedPinned(profile) {
    return !!(profile && (profile._ideologyPinned || profile.playerCreated));
  }

  // Write a creed onto a profile, by id and by slot, the two fields every
  // reader goes through (ideologyFor).
  function setCreed(profile, ideo) {
    if (!profile || !ideo) return false;
    const index = ideologyList().indexOf(ideo);
    if (index >= 0) profile.ideologyIndex = index;
    profile.ideologyId = ideo.id;
    return true;
  }

  // Version of the civic facet (Dev `_civicV`): the creed drawn toward party
  // and government when a political identity is first written.
  const CIVIC_V = 1;

  // --------------------------------------------------------------------------
  // DIET: what a person's traits let them eat
  // --------------------------------------------------------------------------
  // The one answer to "may this person eat this?", read by the profile dealer,
  // the food an NPC carries and eats from hand, and every shop they buy from.
  // Traits.json holds two dietary traits, vegan and vegetarian (found by their
  // name key, never by id). No halal, kosher or allergy trait exists yet; a
  // rule added to DIET_RULES below is all one would need.
  //
  // A food item says what it holds with a `<Diet: meat, dairy>` note tag. The
  // database carries none today, so an untagged food is read off its English
  // database name, which is what the rows are authored in (the displayed name
  // is translated elsewhere).
  // i18n-ignore-start: trait name keys, diet content ids and English name keywords
  const DIET_RULES = {
    "traits.vegan.name":      ["meat", "fish", "dairy", "egg", "honey"],
    "traits.vegetarian.name": ["meat", "fish"],
  };
  const DIET_WORDS = {
    meat:  /meat|beef|pork|bacon|sausage|chicken|duck|turkey|venison|boar|\bhare\b|squab|\bgoat\b|lamb|mutton|jerky|pepperoni|prosciutto|foie gras|wagyu|steak|\brib\b|kebab|taco|burger|bolognese|carbonara|lasagna|osso buco|swan|pheasant|\bhart\b|\bbear\b|haunch|pasty|pottage|gua bao|xiao long bao|dim sum|biryani|\bpho\b|shabu|gumbo|tagine|carpaccio|\bstew\b|microwave dinner|breakfast sandwich|pad thai|okonomiyaki|abomination|arancini|gelatin|tom kha/i,
    fish:  /fish|sashimi|nigiri|salmon|lobster|caviar|seafood|bouillabaisse|sarde|fritto misto|goong|shrimp|anchov|tuna|crab/i,
    dairy: /milk|cheese|mozzarella|cream|butter|sundae|shake|panna cotta|tiramisu|yogurt|souffl|pizza|risotto|hot chocolate|macaron|donut|cake|carbonara|lasagna|gourmet chocolate|chocolate-flavored|pretzel|arancini/i,
    egg:   /\beggs?\b|carbonara|souffl|macaron|tiramisu|donut|cake|okonomiyaki|pastry|struffoli/i,
    honey: /honey|mead|baklava|struffoli/i,
  };
  // An egg or a cup of milk off an animal is not the animal.
  const DIET_NOT_MEAT = /substitute|\beggs?\b|\bmilk\b/i;
  const FOOD_TAG = /<category:\s*food>/i;
  // i18n-ignore-end

  const _dietCache = new Map();
  const Diet = {
    RULES: DIET_RULES,

    isFood(item) {
      return !!item && FOOD_TAG.test(item.note || "");
    },

    // The set of things this food holds (meat, fish, dairy, egg, honey).
    contentOf(item) {
      if (!item) return [];
      const key = String(item.id) + ":" + (item.name || "");
      if (_dietCache.has(key)) return _dietCache.get(key);
      let out;
      const tag = String(item.note || "").match(/<Diet:\s*([^>]*)>/i);
      if (tag) {
        out = tag[1].split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      } else {
        const name = String(item.name || "");
        out = Object.keys(DIET_WORDS).filter(k => DIET_WORDS[k].test(name));
        if (DIET_NOT_MEAT.test(name)) out = out.filter(k => k !== "meat"); // i18n-ignore: diet id
      }
      _dietCache.set(key, out);
      return out;
    },

    // Everything this person refuses, off their traits.
    forbiddenFor(profile) {
      const out = new Set();
      const ids = profile?.traitIds;
      if (!Array.isArray(ids) || !ids.length) return out;
      const book = (typeof window !== "undefined" && window.Health?.Traits)
        || (typeof window !== "undefined" && window._NPCSocietyDataLoader?.traits) || [];
      for (const id of ids) {
        const t = Array.isArray(book) ? traitInBook(book, Number(id)) : null;
        const rule = t && DIET_RULES[t.name];
        if (rule) rule.forEach(k => out.add(k));
      }
      return out;
    },

    // Anything that is not food is always allowed.
    allows(profile, item) {
      if (!item) return false;
      if (!this.isFood(item)) return true;
      const no = this.forbiddenFor(profile);
      if (!no.size) return true;
      return !this.contentOf(item).some(k => no.has(k));
    },
  };

  // The first trait of `book` whose id is `id`, off an index built once per
  // book: forbiddenFor is asked for every food anybody weighs, and each ask
  // was a find over the whole trait list for every trait they have.
  let _traitBookSrc = null, _traitBookLen = -1, _traitBookIdx = null;
  function traitInBook(book, id) {
    if (_traitBookSrc !== book || _traitBookLen !== book.length) {
      _traitBookIdx = new Map();
      for (const tr of book) if (tr && !_traitBookIdx.has(tr.id)) _traitBookIdx.set(tr.id, tr);
      _traitBookSrc = book;
      _traitBookLen = book.length;
    }
    return _traitBookIdx.get(id) || null;
  }

  // The bike or the broom an item is ("bike", "broom" or null): the two
  // database entries by id, and any other `<category:Vehicles>` item whose
  // name says bike, bicycle or broom. Owning one in the hand (profile.itemIds)
  // is what lets a person ride (NPCSim.Vehicles, SECTION 11b6).
  // i18n-ignore-start: vehicle ids and item-name probes
  const VEHICLE_ITEM_KIND = { 131: "bike", 168: "broom" };
  const _vehicleKindCache = new Map();
  function vehicleKindOf(itemId) {
    const id = Number(itemId);
    if (VEHICLE_ITEM_KIND[id]) return VEHICLE_ITEM_KIND[id];
    if (_vehicleKindCache.has(id)) return _vehicleKindCache.get(id);
    const it = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[id] : null;
    if (!it) return null;
    let kind = null;
    if (/<category:\s*Vehicles\s*>/i.test(it.note || "")) {
      if (/broom/i.test(it.name || "")) kind = "broom";
      else if (/\bbi(ke|cycle)\b/i.test(it.name || "")) kind = "bike";
    }
    _vehicleKindCache.set(id, kind);
    return kind;
  }
  // i18n-ignore-end

  // --------------------------------------------------------------------------
  // FORBIDDEN ITEMS AND CAR KEYS (Phase R)
  // --------------------------------------------------------------------------
  // Things no NPC may ever hold. The Liminal cuffs (item 111) are the camper's
  // summoning item (VehicleSystem CAMPER.summonItemId), so refusing the item
  // is also what keeps a camper out of every NPC's hands. Every path that
  // deals, sells, gives, loots back or wagers an item asks isForbiddenItem,
  // and capItemIds below drops one wherever it slipped through.
  //
  // The Utilitarian car keys (item 164, RoadCarAI CAR_KEYS_ITEM_ID) are the
  // car: a driver who parks a RoadCarAI car carries them, taking them from
  // that driver is what lets the party drive the car away, and the cap never
  // throws them away to make room (isProtectedItem).
  // i18n-ignore-start: item ids
  const FORBIDDEN_ITEM_IDS = [111];
  const CAR_KEYS_ITEM_ID = 164;
  // i18n-ignore-end
  function isForbiddenItem(itemOrId) {
    const id = Number(itemOrId && typeof itemOrId === "object" ? itemOrId.id : itemOrId);
    return FORBIDDEN_ITEM_IDS.includes(id);
  }
  function isCarKeys(itemOrId) {
    const id = Number(itemOrId && typeof itemOrId === "object" ? itemOrId.id : itemOrId);
    return id === CAR_KEYS_ITEM_ID;
  }
  // Kept by the cap whatever else goes: a bike, a broom, the car keys.
  function isProtectedItem(itemId) {
    return !!vehicleKindOf(itemId) || isCarKeys(itemId);
  }
  // Takes every forbidden item out of a profile's hand. Answers how many.
  function stripForbidden(profile) {
    const ids = profile?.itemIds;
    if (!Array.isArray(ids)) return 0;
    let n = 0;
    for (let i = ids.length - 1; i >= 0; i--) {
      if (isForbiddenItem(ids[i])) { ids.splice(i, 1); n++; }
    }
    return n;
  }
  // The car keys into a driver's hand, once.
  function grantCarKeys(profile) {
    if (!profile) return false;
    profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
    if (profile.itemIds.some(isCarKeys)) return false;
    profile.itemIds.push(CAR_KEYS_ITEM_ID);
    capItemIds(profile);
    return true;
  }

  // How many things a person carries at most (profile.itemIds). Every path
  // that hands an NPC an item trims to it, oldest first, but never throws a
  // bike, a broom or the car keys away to make room (isProtectedItem). A
  // forbidden item never stays, however it got there.
  const ITEMIDS_CAP = 40;
  function capItemIds(profile) {
    stripForbidden(profile);
    const ids = profile?.itemIds;
    if (!Array.isArray(ids) || ids.length <= ITEMIDS_CAP) return;
    let excess = ids.length - ITEMIDS_CAP;
    for (let i = 0; i < ids.length && excess > 0;) {
      if (isProtectedItem(ids[i])) { i++; continue; }
      ids.splice(i, 1);
      excess--;
    }
  }

  //==========================================================================
  // WorldModes: what the simulation does in each world creation mode
  //==========================================================================
  // One answer per question, read off WorldManager.populationMode() (and its
  // magicalLevel() axis), so no system checks a mode string on its own. Every
  // question takes an optional mode string (tests, previews); without one it
  // asks WorldManager, and a build without WorldManager is a "normal" world.
  //
  //   mode()                 the population mode: normal, chaos, goblin,
  //                          monster, empty, zombie or death
  //   magicalLevel()         normal, severed or unbound
  //   simulatesPeople()      there is anyone to simulate (off in empty, death)
  //   beastsWork()           beasts hold jobs and counters (monster only; they
  //                          are paid in food and goods, never euros)
  //   hasEconomy()           money, shops and stocks exist (off in empty, death)
  //   hasPolitics()          governments and elections exist
  //   monsterPowersOnly()    politics runs through monster powers alone
  //                          (monster), and is off where none exist
  //   hasWars()              wars happen
  //   hasFamilies()          families form
  //   familiesFollowAnimalRules()  families and breeding follow animal rules
  //   hasTravel()            people travel
  //   animalsBreed()         animals breed (everywhere but death)
  //   hasAnimals()           any animal lives at all: farm stock, pens and
  //                          animal NPCs (off in death)
  //   stocksFrozen()         stock prices stop moving (empty, death)
  //   stocksNoisy()          stock drivers are noisier (chaos)
  //   stocksCrashed()        the stock market has crashed (zombie)
  //   hordeIsNormalOrder()   the Goblin Horde is the normal order, not an
  //                          invader (goblin)
  //   survivorsOnly()        only the survivors run the society (zombie)
  //   rules(mode?)           the whole frozen answer row for a mode
  //
  // The rows are built once per mode string and cached.
  const WORLD_MODE_LIST = ["normal", "chaos", "goblin", "monster", "empty", "zombie", "death"];
  const WORLD_MODE_BASE = Object.freeze({
    simulatesPeople: true, beastsWork: false, hasEconomy: true, hasPolitics: true,
    monsterPowersOnly: false, hasWars: true, hasFamilies: true,
    familiesFollowAnimalRules: false, hasTravel: true, animalsBreed: true, hasAnimals: true,
    stocksFrozen: false, stocksNoisy: false, stocksCrashed: false,
    hordeIsNormalOrder: false, survivorsOnly: false,
  });
  const NOBODY_LEFT = {
    simulatesPeople: false, hasEconomy: false, hasPolitics: false, hasWars: false,
    hasFamilies: false, hasTravel: false, stocksFrozen: true,
  };
  const WORLD_MODE_DIFF = {
    normal:  {},
    chaos:   { stocksNoisy: true },
    goblin:  { hordeIsNormalOrder: true },
    monster: { beastsWork: true, monsterPowersOnly: true, familiesFollowAnimalRules: true },
    empty:   NOBODY_LEFT,
    zombie:  { survivorsOnly: true, stocksCrashed: true },
    death:   Object.assign({}, NOBODY_LEFT, { animalsBreed: false, hasAnimals: false }),
  };
  const _worldModeRows = Object.create(null);
  function worldModeOf(mode) {
    if (typeof mode === "string") return WORLD_MODE_LIST.includes(mode) ? mode : "normal";
    const WM = (typeof window !== "undefined") && window.WorldManager;
    let m = "normal";
    try { if (WM && typeof WM.populationMode === "function") m = WM.populationMode(); } catch (_) { m = "normal"; }
    return WORLD_MODE_LIST.includes(m) ? m : "normal";
  }
  function worldModeRules(mode) {
    const m = worldModeOf(mode);
    return _worldModeRows[m] || (_worldModeRows[m] =
      Object.freeze(Object.assign({ mode: m }, WORLD_MODE_BASE, WORLD_MODE_DIFF[m])));
  }
  function worldMagicalLevel() {
    const WM = (typeof window !== "undefined") && window.WorldManager;
    try { if (WM && typeof WM.magicalLevel === "function") return WM.magicalLevel() || "normal"; } catch (_) { /* default */ }
    return "normal";
  }
  const WorldModes = {
    MODES: WORLD_MODE_LIST.slice(),
    mode: (mode) => worldModeOf(mode),
    magicalLevel: worldMagicalLevel,
    rules: worldModeRules,
  };
  for (const q of Object.keys(WORLD_MODE_BASE)) WorldModes[q] = (mode) => worldModeRules(mode)[q];
  Object.freeze(WorldModes);
  // Published bare as well, unless something else already owns that name.
  if (typeof window !== "undefined" && !Object.prototype.hasOwnProperty.call(window, "WorldModes")) window.WorldModes = WorldModes;

  window.NPCShared = {
    CIVIC_V,
    Diet,
    dietAllows: (profile, item) => Diet.allows(profile, item),
    ITEMIDS_CAP,
    capItemIds,
    vehicleKindOf,
    FORBIDDEN_ITEM_IDS,
    isForbiddenItem,
    stripForbidden,
    CAR_KEYS_ITEM_ID,
    isCarKeys,
    isProtectedItem,
    grantCarKeys,
    creedPinned,
    setCreed,
    DEFAULT_SEED,
    IDEOLOGY_AXES,
    ideologyList,
    ideologyById,
    ideologyFor,
    ideologyAxes,
    ideologyDistance,
    nearestIdeologies,
    nameHash,
    nameToSeed: nameHash,
    Rng,
    worldSeed,
    sampleCount,
    clamp,
    BLOCKED_TERRAIN_TAGS,
    isBlockedTerrain,
    seededShuffle,
    escapeHtml,
    formatMoney,
    goldTextToEuros,
    WorldModes,
  };

})();
