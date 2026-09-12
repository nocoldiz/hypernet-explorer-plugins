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
    let h = 5381;
    for (let i = 0; i < String(str).length; i++) h = ((h * 33) ^ String(str).charCodeAt(i)) >>> 0;
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

  window.NPCShared = {
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
  };

})();
