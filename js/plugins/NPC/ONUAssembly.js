/*:
 * @target MZ
 * @plugindesc v1.0.0 ONU Assembly - sit as a delegate for a hyperpower or faction, debate, vote and veto. Exposes window.ONUAssembly.
 * @author Hypernet
 *
 * @help ONUAssembly.js
 *
 * The assembly of the post-Squishing world. Every parent power keeps a seat on
 * neutral ground inside the Omega Tower, the Archive Foundation chairs, and
 * once a game week the delegations argue about alliances, trade, war and
 * whatever fell out of the sky that month.
 *
 * A party member takes one of those seats. Nothing happens to the party as a
 * whole: the seat is that character's, the standing it earns is that
 * character's, and the stipend it draws is paid to them.
 *
 * -------------------------------------------------------------------------
 * The roster
 * -------------------------------------------------------------------------
 * Only PARENT powers are seated, never a branch. Twenty voting seats and one
 * that only watches:
 *
 *   13 hyperpowers, from js/db/WorldGen/Hyperpowers.json, keyed "hp:<id>".
 *      No faction speaks for a power any more: each one's standing lives
 *      under its own "hp:<id>" key in the character's ledger, and the branches
 *      that answer to it (Factions.json `parentHyperpower`) are listed beneath
 *      it without standing in its place.
 *
 *    the independent factions that answer to a power of their own, keyed
 *      "fac:<id>": Naguka, Verden, Truckers Society, Esoteric Heavy
 *      Industries, North Point Army, Inverted Citadel, Petrodemons. The
 *      Goblin Collective Unconscious is not a delegation: it is what the
 *      Naguka are plugged into, not a thing that sits in a chair.
 *
 *    1 observing seat, the Tourists (hyperpower 13), which every Zeta
 *      Reticulan caste answers to. It holds a chair and no ballot: it takes
 *      the floor when it feels like it, always amused and always fond of the
 *      species it is commenting on, and it is counted in no division and
 *      offered to no party member, since nobody here can speak for it.
 *
 *    The Dargos of Titania (hyperpower 14) were invited and did not come, and
 *    the Gods (hyperpower 11) were never invited: they answer to no assembly
 *    of mortals and take no part in one.
 *
 * `parentHyperpower` in Factions.json is a HYPERPOWER NAME, not a faction id, which
 * is what decides which branches a seat carries with it.
 *
 * -------------------------------------------------------------------------
 * Joining
 * -------------------------------------------------------------------------
 * The first time a character opens the assembly they are shown the joining
 * board. Only powers that already think neutrally or well of THAT character
 * (standing >= 0) will have them. Confirming raises their standing with the
 * power and with every branch under it, and nudges the world's own number.
 *
 * A character joins once. Resigning is offered from the lobby afterwards and
 * costs a great deal more than joining paid.
 *
 * -------------------------------------------------------------------------
 * The session
 * -------------------------------------------------------------------------
 * One per game week for the party. If several members hold seats the player
 * picks who goes. The session rolls one to three motions; two to five
 * delegations take the floor, each in its own voice; the player answers; then
 * EVERY seat votes, whether it spoke or not.
 *
 * The ballot is public or secret. Public: each tile carries a name and turns
 * green or red as it is read out. Secret: the tiles are shuffled and
 * unlabelled, they all turn at once, and only the tally is certain.
 *
 * Grave motions (war, admission, territory, artifacts, theonuclear devices,
 * the goblin question) then go to the Security Council: the FIVE strongest
 * powers the century left standing, measured on what the world simulation
 * ended the year 2000 with (military, economy, population, information,
 * arcane), so a world where the Ottomans collapsed and the Dharma Directorate
 * rose seats the Directorate instead. They vote to approve or to veto,
 * majority carries, and a tie is broken by the Secretary General. Without one
 * it fails. A world whose history was never run falls back to the four the
 * charter was written with (Britannia, the Soviet Union, the Vatican, the
 * Ottoman Empire).
 *
 * -------------------------------------------------------------------------
 * Secretary General
 * -------------------------------------------------------------------------
 * With Kofi Annan in the party the lobby offers the chair instead of a seat.
 * The Secretary General represents nobody and casts no vote: they mediate,
 * which moves the room, and they break Council ties.
 *
 * -------------------------------------------------------------------------
 * Stipend
 * -------------------------------------------------------------------------
 * Every game week each seated member is paid on their standing with the power
 * they serve. A member whose standing falls far enough is dismissed.
 *
 * @param stipendBase
 * @text Weekly stipend base
 * @desc Gold paid every game week to a seated member before standing is counted (100 gold = 1 euro).
 * @type number
 * @default 1200
 *
 * @param stipendPerPoint
 * @text Weekly stipend per standing point
 * @desc Extra gold per point of positive standing with the power served.
 * @type number
 * @default 55
 *
 * @param stipendFloor
 * @text Weekly retainer floor
 * @desc Gold paid even when standing is at or below zero.
 * @type number
 * @default 400
 *
 * @param sgBonus
 * @text Secretary General premium
 * @desc Extra gold per week for presiding instead of representing.
 * @type number
 * @default 2600
 *
 * @param joinHeadGain
 * @text Join: standing with the power
 * @type number
 * @default 55
 *
 * @param joinBranchGain
 * @text Join: standing with each branch
 * @type number
 * @default 35
 *
 * @param resignHeadLoss
 * @text Resign: standing lost with the power
 * @type number
 * @default 70
 *
 * @param resignBranchLoss
 * @text Resign: standing lost with each branch
 * @type number
 * @default 45
 *
 * @param dismissAt
 * @text Dismissal threshold
 * @desc A seated member whose standing drops to this is dismissed by the power they serve.
 * @type number
 * @min -100
 * @default -35
 *
 * @param sessionCooldownWeeks
 * @text Weeks between sessions
 * @type number
 * @min 1
 * @default 1
 *
 * @command openAssembly
 * @text Open Assembly
 * @desc Open the assembly lobby: join a delegation, resign, or enter this week's session.
 *
 * @command startSession
 * @text Start Session
 * @desc Go straight into this week's session with whoever holds a seat.
 *
 * @command assemblyReport
 * @text Assembly Report
 * @desc Print the current roster and every seated party member to the console.
 */

(() => {
  "use strict";

  const pluginName = "ONUAssembly";
  const P = PluginManager.parameters(pluginName);
  const num = (key, fallback) => {
    const v = Number(P[key]);
    return Number.isFinite(v) ? v : fallback;
  };

  const STIPEND_BASE = num("stipendBase", 1200);
  const STIPEND_PER_POINT = num("stipendPerPoint", 55);
  const STIPEND_FLOOR = num("stipendFloor", 400);
  const SG_BONUS = num("sgBonus", 2600);
  const JOIN_HEAD = num("joinHeadGain", 55);
  const JOIN_BRANCH = num("joinBranchGain", 35);
  const RESIGN_HEAD = num("resignHeadLoss", 70);
  const RESIGN_BRANCH = num("resignBranchLoss", 45);
  const DISMISS_AT = num("dismissAt", -35);
  const COOLDOWN_WEEKS = Math.max(1, num("sessionCooldownWeeks", 1));

  const MINUTES_PER_WEEK = 10080;
  const MINUTES_PER_DAY = 1440;
  const DIPLOMACY_SPEC = 88;      // js/db/Skills/Specialization.json
  const SG_NAME = "Kofi Annan";   // i18n-ignore  actor name match, preset id 11
  // The four permanent members, by faction id in Factions.json.
  const COUNCIL_FACTION_IDS = [46, 35, 27, 41]; // Britannia, USSR, Vatican, Ottoman
  // The Goblin Collective Unconscious is what the Naguka are plugged into,
  // not a power that sits in a chair.
  const EXCLUDED_FACTION_IDS = [25];

  //===========================================================================
  // Text
  //===========================================================================
  //
  // Same three layers the trial uses. Nothing is written in the plugin: the
  // words live in js/i18n/<lang>/conversations/ONUAssembly.json and every line
  // is rolled through vary() as it is spoken, so no two sessions read alike.

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  let _bankLang = null;
  const _bankCache = new Map();
  function bank(key) {
    const lang = T.language();
    if (lang !== _bankLang) { _bankLang = lang; _bankCache.clear(); }
    if (!_bankCache.has(key)) _bankCache.set(key, T.pool(key));
    return _bankCache.get(key);
  }
  // A pool that may not exist for this register, falling back to the common one.
  function bankOr(key, fallbackKey) {
    const p = T.has(key) ? bank(key) : [];
    return p.length ? p : bank(fallbackKey);
  }
  const pickFrom = (key) => {
    const p = bank(key);
    return p.length ? pick(p) : "";
  };

  // Resolves "{a|b|c}" groups innermost first, so groups can nest.
  function vary(text) {
    if (typeof text !== "string" || text.indexOf("{") < 0) return text;
    let out = text;
    let guard = 0;
    while (guard++ < 64) {
      const next = out.replace(/\{([^{}]*)\}/, (m, body) => pick(body.split("|")));
      if (next === out) break;
      out = next;
    }
    return out;
  }

  // Token fill runs BEFORE vary, or the single-option groups it writes get
  // eaten by the alternation pass.
  function fill(text, tokens) {
    if (!text || !tokens) return text;
    return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
      Object.prototype.hasOwnProperty.call(tokens, name) ? String(tokens[name]) : whole);
  }

  const say = (key, tokens) => vary(fill(pickFrom(key), tokens));

  const euros = (gold) => (gold / 100).toFixed(2) + "€";

  //===========================================================================
  // The clock
  //===========================================================================

  function nowMinutes() {
    if (window.TimeDateSystem && typeof window.TimeDateSystem.getGameTimeMinutes === "function") {
      return window.TimeDateSystem.getGameTimeMinutes();
    }
    return (window.$gameVariables && $gameVariables.value(114)) || 0;
  }

  const weekIndex = (minutes) => Math.floor((minutes != null ? minutes : nowMinutes()) / MINUTES_PER_WEEK);

  function gameYear() {
    if (window.TimeDateSystem && typeof window.TimeDateSystem.getDateTimeFromMinutes === "function") {
      const dt = window.TimeDateSystem.getDateTimeFromMinutes(nowMinutes());
      if (dt && dt.year) return dt.year;
    }
    return 2001;
  }

  //===========================================================================
  // The delegations
  //===========================================================================
  //
  // A register is a voice: how that power talks when it takes the floor. The
  // trait vector under it is how it votes. Both are keyed off the delegation,
  // never off the faction, because a branch never speaks for itself here.
  //
  // Traits run 0..1 and are read as deviations from 0.5 when a motion is
  // scored, so a power with nothing to say about a subject drifts to abstain.

  const HP_REGISTERS = {
    0: "vatican", 1: "britannia", 2: "soviet", 3: "ottoman", 4: "horde",
    5: "midwest", 6: "cascadia", 7: "seaboard", 8: "guild", 9: "archive",
    10: "capital", 11: "gods", 12: "union", 13: "tourists", 15: "ascendancy",
    16: "juche", 17: "harmony", 18: "khanate", 19: "solomonic", 20: "petrokingdom",
    21: "clerical", 22: "dharmic", 23: "longsouth",
  };
  const FAC_REGISTERS = {
    8: "naguka", 9: "verden", 10: "truckers", 11: "industries",
    12: "northpoint", 13: "citadel", 14: "petrodemons",
  };

  // Hyperpower 13, the Tourists, hold a chair and no ballot. Every Zeta
  // Reticulan caste answers to that one power, and what it came for is to
  // watch: it takes the floor when it feels like it, always amused, always
  // fond of the species it is commenting on, and then abstains from existing
  // as far as the tally is concerned. It is not offered to a party member
  // either, since nobody here can speak for it.
  const OBSERVER_HYPERPOWER_IDS = [13];
  // Hyperpower 14, the Dargos, were invited and did not come, and the joke is
  // that they never will. Hyperpower 11, the Gods, hold no seat either: they
  // answer to no assembly of mortals, keep to their own affairs entirely, and
  // deal with the world only by handing a relic to a leader or having one
  // taken off them (HistorySimulator, "secluded" in Hyperpowers.json).
  const EXCLUDED_HYPERPOWER_IDS = [14, 11];

  // militarism, commerce, piety, secrecy, chaos, isolation, science, wildness, order
  const TRAITS = {
    vatican:     { militarism: .75, commerce: .70, piety: 1.0, secrecy: .70, chaos: .10, isolation: .35, science: .30, wildness: .05, order: .95 },
    britannia:   { militarism: .85, commerce: .70, piety: .35, secrecy: .95, chaos: .15, isolation: .45, science: .70, wildness: .05, order: .90 },
    soviet:      { militarism: 1.0, commerce: .25, piety: .05, secrecy: .70, chaos: .20, isolation: .55, science: .65, wildness: .15, order: .85 },
    ottoman:     { militarism: .60, commerce: .55, piety: .70, secrecy: .60, chaos: .20, isolation: .40, science: .35, wildness: .10, order: .95 },
    horde:       { militarism: 1.0, commerce: .10, piety: .55, secrecy: .10, chaos: .85, isolation: .30, science: .05, wildness: .95, order: .10 },
    midwest:     { militarism: .45, commerce: .65, piety: .45, secrecy: .20, chaos: .25, isolation: .80, science: .40, wildness: .20, order: .60 },
    cascadia:    { militarism: .55, commerce: .85, piety: .20, secrecy: .55, chaos: .25, isolation: .35, science: .90, wildness: .10, order: .70 },
    seaboard:    { militarism: .30, commerce: .30, piety: .30, secrecy: .35, chaos: .30, isolation: .70, science: .25, wildness: .15, order: .55 },
    guild:       { militarism: .35, commerce: .45, piety: .25, secrecy: .80, chaos: .40, isolation: .30, science: .95, wildness: .10, order: .45 },
    archive:     { militarism: .20, commerce: .35, piety: .15, secrecy: .02, chaos: .20, isolation: .10, science: .85, wildness: .05, order: .80 },
    capital:     { militarism: .45, commerce: 1.0, piety: .10, secrecy: .75, chaos: .35, isolation: .15, science: .55, wildness: .10, order: .40 },
    gods:        { militarism: .70, commerce: .30, piety: .90, secrecy: .60, chaos: 1.0, isolation: .50, science: .10, wildness: .45, order: .05 },
    union:       { militarism: .25, commerce: .60, piety: .25, secrecy: .30, chaos: .10, isolation: .10, science: .50, wildness: .05, order: 1.0 },
    naguka:      { militarism: .90, commerce: .05, piety: .60, secrecy: .05, chaos: .80, isolation: .45, science: .02, wildness: 1.0, order: .05 },
    verden:      { militarism: .25, commerce: .30, piety: .40, secrecy: .20, chaos: .15, isolation: .35, science: .55, wildness: .40, order: .60 },
    truckers:    { militarism: .35, commerce: .70, piety: .20, secrecy: .30, chaos: .35, isolation: .20, science: .45, wildness: .30, order: .50 },
    industries:  { militarism: .55, commerce: .90, piety: .10, secrecy: 1.0, chaos: .20, isolation: .75, science: .95, wildness: .05, order: .65 },
    northpoint:  { militarism: .95, commerce: .30, piety: .85, secrecy: .40, chaos: .30, isolation: .55, science: .30, wildness: .25, order: .70 },
    citadel:     { militarism: .60, commerce: .25, piety: .55, secrecy: .85, chaos: .25, isolation: .90, science: .40, wildness: .45, order: .60 },
    petrodemons: { militarism: .70, commerce: .80, piety: .35, secrecy: .65, chaos: .45, isolation: .50, science: .30, wildness: .60, order: .35 },
    tourists:    { militarism: .05, commerce: .45, piety: .20, secrecy: .10, chaos: .55, isolation: .05, science: .20, wildness: .35, order: .25 },
    // The Kukulkan Ascendancy: a restoration run as a state religion, which
    // votes like one - pious, ordered, and in no hurry to be understood.
    ascendancy:  { militarism: .70, commerce: .35, piety: .95, secrecy: .55, chaos: .25, isolation: .65, science: .30, wildness: .40, order: .85 },
    // Asia and the Middle East, each voting the way it governs.
    juche:       { militarism: 1.0, commerce: .05, piety: .45, secrecy: .95, chaos: .10, isolation: 1.0, science: .35, wildness: .10, order: 1.0 },
    harmony:     { militarism: .65, commerce: .85, piety: .80, secrecy: .70, chaos: .05, isolation: .40, science: .75, wildness: .15, order: .95 },
    khanate:     { militarism: .55, commerce: .25, piety: .95, secrecy: .40, chaos: .20, isolation: .80, science: .25, wildness: .60, order: .70 },
    solomonic:   { militarism: .75, commerce: .60, piety: .90, secrecy: .85, chaos: .20, isolation: .55, science: .80, wildness: .10, order: .80 },
    petrokingdom:{ militarism: .40, commerce: .95, piety: .85, secrecy: .75, chaos: .15, isolation: .60, science: .35, wildness: .20, order: .90 },
    clerical:    { militarism: .60, commerce: .40, piety: .95, secrecy: .70, chaos: .30, isolation: .75, science: .55, wildness: .15, order: .80 },
    dharmic:     { militarism: .60, commerce: .55, piety: .95, secrecy: .45, chaos: .25, isolation: .45, science: .60, wildness: .25, order: .85 },
    longsouth:   { militarism: .90, commerce: .50, piety: .35, secrecy: .55, chaos: .40, isolation: .30, science: .45, wildness: .35, order: .60 },
  };
  const NEUTRAL_TRAITS = { militarism: .5, commerce: .5, piety: .5, secrecy: .5, chaos: .5, isolation: .5, science: .5, wildness: .5, order: .5 };

  let _roster = null;

  // NPC/FactionDataManager.js declares $gameFactions with a top level `let`,
  // which lives in the global LEXICAL scope and so never becomes a property of
  // the window object: asking the window for it comes back undefined forever.
  // This gate is what every entry point into the assembly passes through, so
  // asking the wrong way left all three plugin commands silent.
  const gameFactions = () =>
    (typeof $gameFactions !== "undefined" && $gameFactions) || null;

  function factionsReady() {
    return !!(gameFactions() && window.FactionDataManager &&
      FactionDataManager.instance && FactionDataManager.instance._factions &&
      FactionDataManager.instance._factions.length);
  }

  function powerLabel(hp, head) {
    const slug = String(hp.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = "Factions.power." + slug;
    if (T.has(key)) return T(key);
    if (head) return FactionDataManager.instance.t(head.name);
    return hp.name;
  }

  // Built once per language and torn down when the language changes, since the
  // names in it are localized.
  let _rosterLang = null;

  function buildRoster() {
    if (!factionsReady()) return [];
    const out = [];

    $gameFactions.getHyperpowers().forEach((hp) => {
      if (EXCLUDED_HYPERPOWER_IDS.indexOf(hp.id) >= 0) return;
      const branches = $gameFactions.getHyperpowerFactions(hp.id);
      const register = HP_REGISTERS[hp.id] || "union";
      out.push({
        key: "hp:" + hp.id,
        kind: "hyperpower",
        observer: OBSERVER_HYPERPOWER_IDS.indexOf(hp.id) >= 0,
        hyperpowerId: hp.id,
        factionId: null,
        standingKey: $gameFactions.hyperpowerStandingKey(hp.id),
        branchIds: branches.map((f) => f.id),
        name: powerLabel(hp, null),
        description: "",
        iconIndex: $gameFactions.hyperpowerIcon(hp.id),
        register: register,
        traits: TRAITS[register] || NEUTRAL_TRAITS,
        stats: {
          military: hp.data.military || 0,
          economy: hp.data.economy || 0,
          population: hp.data.population || 0,
          information: hp.data.information || 0,
          arcane: hp.data.arcane || 0,
        },
        leaderKeys: [].concat(hp.data.leaders || [], hp.data.holy_leaders || []),
      });
    });

    // An orphan faction - one with no `parentHyperpower` - is listed in the
    // book but holds no chair here: it speaks for no power, nobody may swear to
    // it, and it is counted in no division.
    $gameFactions.getIndependentFactions().forEach((faction) => {
      if (EXCLUDED_FACTION_IDS.indexOf(faction.id) >= 0) return;
      if ($gameFactions.isOrphanFaction(faction)) return;
      const register = FAC_REGISTERS[faction.id] || "union";
      out.push({
        key: "fac:" + faction.id,
        kind: "faction",
        hyperpowerId: null,
        factionId: faction.id,
        standingKey: String(faction.id),
        branchIds: [],
        name: FactionDataManager.instance.t(faction.name),
        description: FactionDataManager.instance.t(faction.description),
        iconIndex: faction.iconIndex || 0,
        register: register,
        traits: TRAITS[register] || NEUTRAL_TRAITS,
        stats: {
          military: 0,
          economy: 0,
          population: 0,
          information: faction.information || 0,
          arcane: faction.arcane || 0,
        },
        leaderKeys: $gameFactions.getFactionLeaders(faction),
      });
    });

    return out;
  }

  // Everybody in the room, observers included.
  function chamber() {
    const lang = T.language();
    if (!_roster || _rosterLang !== lang) {
      _roster = buildRoster();
      _rosterLang = lang;
    }
    return _roster;
  }

  // The seats that carry a ballot. Every division, every agenda, every argument
  // and every stipend runs off this list, so an observer is invisible to all of
  // it without a single one of those needing to know observers exist.
  function delegations() {
    return chamber().filter((d) => !d.observer);
  }

  // The seats that carry none. They speak and nothing else.
  function observers() {
    return chamber().filter((d) => d.observer);
  }

  const delegationByKey = (key) => chamber().find((d) => d.key === key) || null;

  // The delegation a faction id belongs to, head or branch.
  function delegationForFaction(factionId) {
    return chamber().find((d) =>
      d.factionId === factionId || d.branchIds.indexOf(factionId) >= 0) || null;
  }

  //===========================================================================
  // Who leads it
  //===========================================================================
  //
  // The history simulator keeps a live answer while it is running. It is not
  // written to the world folder, so after a reload we resolve one ourselves:
  // whoever in the roster is alive this year and has not died in the timeline,
  // picked from the world seed and then held, so the name never changes
  // underneath a playthrough.

  function leaderRecord(key) {
    const src = (window.WorldGen && window.WorldGen.Leaders) || null;
    if (src && src[key]) return src[key];
    const fdm = window.FactionDataManager && FactionDataManager.instance;
    if (fdm && fdm._leaders && fdm._leaders[key]) return fdm._leaders[key];
    return null;
  }

  function leaderName(entry) {
    if (!entry) return "";
    if (typeof entry === "object" && entry.name) return entry.name;
    const rec = leaderRecord(entry);
    if (rec && rec.name) return rec.name;
    // A key with no record still reads: snake_case is turned back into a name.
    return String(entry).split("_").filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function seededIndex(seedText, length) {
    let h = 2166136261;
    const s = String(seedText);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return length > 0 ? Math.abs(h) % length : 0;
  }

  function leaderOf(delegation) {
    if (!delegation) return "";
    // While the simulator is live it already knows.
    const hm = window.HistoryManager;
    if (delegation.kind === "hyperpower" && hm && hm._currentLeaders) {
      const hp = $gameFactions.getHyperpower(delegation.hyperpowerId);
      const live = hp ? hm._currentLeaders[hp.name] : null;
      if (live) return leaderName(live);
    }

    if (!window.$gameSystem) return leaderName(delegation.leaderKeys[0]);
    if (!$gameSystem._onuLeaders) $gameSystem._onuLeaders = {};
    const held = $gameSystem._onuLeaders[delegation.key];
    if (held) return held;

    const year = gameYear();
    const dead = (hm && typeof hm.getDeadLeaders === "function") ? hm.getDeadLeaders() : [];
    const deadSet = new Set(dead);
    const alive = delegation.leaderKeys.filter((k) => {
      const rec = leaderRecord(typeof k === "object" ? k.key : k);
      const name = leaderName(k);
      if (deadSet.has(name)) return false;
      if (!rec || !rec.years) return true;
      return year >= rec.years[0] && year <= rec.years[1];
    });
    const pool = alive.length ? alive : delegation.leaderKeys;
    if (!pool.length) return "";
    const seed = (hm && typeof hm.getSeed === "function" ? hm.getSeed() : 19002001) + ":" + delegation.key;
    const name = leaderName(pool[seededIndex(seed, pool.length)]);
    $gameSystem._onuLeaders[delegation.key] = name;
    return name;
  }

  //===========================================================================
  // Standing and seats
  //===========================================================================

  const standingFor = (actor, delegation) =>
    delegation ? $gameFactions.getReputationFor(actor, delegation.standingKey) : 0;

  // A seat is written on the actor, which is what puts it in the savegame.
  const postOf = (actor) => (actor && actor._onuPost) || null;

  function seatedMembers() {
    if (!window.$gameParty || !$gameParty.members) return [];
    return $gameParty.members().filter((m) => m && m._onuPost);
  }

  function isSecretaryCandidate() {
    if (!window.$gameParty || !$gameParty.members) return false;
    return $gameParty.members().some((m) => m && m.name() === SG_NAME);
  }

  const secretaryActor = () => {
    if (!window.$gameParty || !$gameParty.members) return null;
    return $gameParty.members().find((m) => m && m.name() === SG_NAME) || null;
  };

  // Only powers that already think neutrally or well of this character will
  // have them, and a character who already holds a seat is not shopping.
  function joinableFor(actor) {
    if (postOf(actor)) return [];
    return delegations().filter((d) => standingFor(actor, d) >= 0);   // observers are never offered
  }

  function applyJoin(actor, delegation) {
    if (!actor || !delegation) return;
    $gameFactions.changeReputationFor(actor, delegation.standingKey, JOIN_HEAD);
    delegation.branchIds.forEach((id) => $gameFactions.changeReputationFor(actor, id, JOIN_BRANCH));
    // The world notices too, but only a little: it is one traveller.
    if (delegation.factionId != null) {
      $gameFactions.changeReputation(delegation.factionId, Math.round(JOIN_HEAD * 0.27));
      delegation.branchIds.forEach((id) => $gameFactions.changeReputation(id, Math.round(JOIN_BRANCH * 0.28)));
    }
    actor._onuPost = {
      key: delegation.key,
      joinedMinute: nowMinutes(),
      weeksServed: 0,
      paidThroughWeek: weekIndex(),
      sg: false,
    };
  }

  function applySecretaryGeneral(actor) {
    if (!actor) return;
    actor._onuPost = {
      key: null,
      joinedMinute: nowMinutes(),
      weeksServed: 0,
      paidThroughWeek: weekIndex(),
      sg: true,
    };
  }

  function applyResign(actor, opts) {
    const post = postOf(actor);
    if (!post) return;
    const dismissed = !!(opts && opts.dismissed);
    const delegation = post.key ? delegationByKey(post.key) : null;
    if (delegation && !post.sg) {
      // Being thrown out costs less than walking out: they wanted you gone.
      const scale = dismissed ? 0.4 : 1;
      $gameFactions.changeReputationFor(actor, delegation.standingKey, -Math.round(RESIGN_HEAD * scale));
      delegation.branchIds.forEach((id) =>
        $gameFactions.changeReputationFor(actor, id, -Math.round(RESIGN_BRANCH * scale)));
      if (!dismissed && delegation.factionId != null) {
        $gameFactions.changeReputation(delegation.factionId, -Math.round(RESIGN_HEAD * 0.36));
        delegation.branchIds.forEach((id) => $gameFactions.changeReputation(id, -Math.round(RESIGN_BRANCH * 0.33)));
      }
    }
    actor._onuPost = null;
  }

  //===========================================================================
  // The stipend
  //===========================================================================

  function weeklyPay(actor) {
    const post = postOf(actor);
    if (!post) return 0;
    if (post.sg) return STIPEND_BASE + SG_BONUS;
    const delegation = delegationByKey(post.key);
    if (!delegation) return STIPEND_FLOOR;
    const standing = standingFor(actor, delegation);
    if (standing <= 0) return STIPEND_FLOOR;
    return Math.round(STIPEND_BASE + STIPEND_PER_POINT * standing);
  }

  function assemblyState() {
    if (!window.$gameSystem) return null;
    if (!$gameSystem._onuAssembly) {
      $gameSystem._onuAssembly = { lastSessionWeek: -1, sessionsHeld: 0, lastPaidWeek: weekIndex() };
    }
    return $gameSystem._onuAssembly;
  }

  // Every week each seated member is paid, once, and reported once. A long
  // sleep or a fast travel is settled in a single pass rather than a toast per
  // week, and a savegame that predates the ledger is rebased instead of being
  // paid for a year it never served.
  function settleStipends() {
    const state = assemblyState();
    if (!state || !factionsReady()) return;
    const week = weekIndex();
    if (state.lastPaidWeek == null) state.lastPaidWeek = week;
    if (week <= state.lastPaidWeek) return;

    const weeks = Math.min(52, week - state.lastPaidWeek);
    state.lastPaidWeek = week;

    const lines = [];
    let total = 0;
    seatedMembers().forEach((actor) => {
      const post = postOf(actor);
      const delegation = post.key ? delegationByKey(post.key) : null;

      // A power that has come to loathe its own envoy recalls them, and the
      // week they are recalled is not a week they are paid for.
      if (delegation && !post.sg && standingFor(actor, delegation) <= DISMISS_AT) {
        applyResign(actor, { dismissed: true });
        lines.push(T("ONUMenu.toast.dismissed", { name: actor.name(), faction: delegation.name }));
        return;
      }

      const pay = weeklyPay(actor) * weeks;
      if (pay <= 0) return;
      post.weeksServed = (post.weeksServed || 0) + weeks;
      post.paidThroughWeek = week;
      total += pay;
      lines.push(T("ONUMenu.toast.stipendLine", {
        name: actor.name(),
        faction: post.sg ? T("ONUMenu.role.secretaryGeneral") : (delegation ? delegation.name : "?"),
        amount: euros(pay),
      }));
    });

    if (total > 0 && window.$gameParty) $gameParty.gainGold(total);
    if (lines.length && window.ParchmentToast) {
      window.ParchmentToast.show(lines.join("<br>"), {
        title: T("ONUMenu.toast.stipendTitle"),
        html: true,
        severity: total > 0 ? "good" : "warning",
        duration: 220,
        key: "onu-stipend",
      });
    }
  }

  //===========================================================================
  // The motions
  //===========================================================================
  //
  // A motion is scored against every seat's traits. `w` is how much a trait
  // pulls a delegation toward voting for it; `base` is how a room with no
  // opinion at all leans. `grave` sends it to the Security Council.

  const MOTIONS = [
    { key: "alliance",      grave: false, base: .10, w: { order: .7, isolation: -.9, militarism: .2 } },
    { key: "trade",         grave: false, base: .20, w: { commerce: 1.1, isolation: -.6, secrecy: -.2 } },
    { key: "war",           grave: true,  base: -.25, w: { militarism: 1.2, order: -.3, commerce: -.5, chaos: .3 } },
    { key: "censure",       grave: false, base: .00, w: { order: .8, chaos: -.6, piety: .3 } },
    { key: "territory",     grave: true,  base: -.10, w: { militarism: .6, isolation: .4, order: -.3, commerce: .2 } },
    { key: "incident",      grave: false, base: .15, w: { science: .8, secrecy: -.5, chaos: -.3 } },
    { key: "plague",        grave: false, base: .30, w: { order: .6, science: .6, isolation: -.4, commerce: -.2 } },
    { key: "admission",     grave: true,  base: .00, w: { isolation: -1.0, order: .4, chaos: .2 } },
    { key: "ruleof80",      grave: false, base: .10, w: { commerce: .7, science: .5, wildness: -.4 } },
    { key: "artifact",      grave: true,  base: -.05, w: { piety: .6, secrecy: .7, science: .4, order: .2 } },
    { key: "kessler",       grave: false, base: .20, w: { science: 1.0, isolation: -.3, commerce: .3 } },
    { key: "theonuclear",   grave: true,  base: .10, w: { militarism: -.9, piety: .6, order: .7, chaos: -.4 } },
    { key: "goblinquestion", grave: true, base: -.05, w: { wildness: -.7, militarism: .5, piety: .4, order: .3 } },
    { key: "reparations",   grave: false, base: .05, w: { commerce: -.6, order: .7, piety: .4, isolation: -.3 } },
    { key: "budget",        grave: false, base: .15, w: { commerce: .5, order: .8, chaos: -.5 } },
    { key: "tower",         grave: false, base: .25, w: { science: .5, piety: .4, order: .6, isolation: -.5 } },
  ];

  // A lean, not a verdict. The weights are deliberately damped: at full
  // strength they swamped the noise and every motion kind carried or fell the
  // same way every week, which left the player's argument with nothing to move.
  // Scaled like this a strong opinion is worth about as much as a bad day.
  // STATUS_QUO is the drag every assembly has: a room of sovereign powers
  // says no more readily than it says yes, and a motion has to earn its way
  // past that before anyone's opinion is even consulted.
  const TRAIT_WEIGHT = 0.9;
  const BASE_WEIGHT = 0.6;
  const STATUS_QUO = -0.085;

  function traitScore(delegation, motion) {
    const t = delegation.traits || NEUTRAL_TRAITS;
    let s = motion.base * BASE_WEIGHT + STATUS_QUO;
    Object.keys(motion.w).forEach((key) => {
      const v = (t[key] != null ? t[key] : 0.5);
      s += motion.w[key] * (v - 0.5) * TRAIT_WEIGHT;
    });
    return s;
  }

  function rollAgenda() {
    const roster = delegations();
    const count = 1 + Math.floor(Math.random() * 3);
    const pool = MOTIONS.slice();
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const motion = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const sponsor = pick(roster);
      const target = pick(roster.filter((d) => d.key !== sponsor.key)) || sponsor;
      out.push({
        def: motion,
        sponsor: sponsor,
        target: target,
        // A grave motion is more often taken behind closed doors.
        ballot: chance(motion.grave ? 0.6 : 0.25) ? "secret" : "public",
        title: vary(fill(T("ONUAssembly.motion." + motion.key + ".title"),
          { sponsor: sponsor.name, target: target.name })),
        text: say("ONUAssembly.motion." + motion.key + ".text",
          { sponsor: sponsor.name, target: target.name, leader: leaderOf(sponsor) }),
      });
    }
    return out;
  }

  //===========================================================================
  // Voices
  //===========================================================================
  //
  // Two to five delegations take the floor per motion, weighted by how much
  // they care: a power with a strong opinion is likelier to want to be heard
  // than one drifting toward abstention. Everyone else still votes.

  function speakersFor(motion, exclude) {
    const roster = delegations().filter((d) => !exclude || d.key !== exclude.key);
    const ranked = roster.map((d) => ({
      d: d,
      weight: Math.abs(traitScore(d, motion.def)) + Math.random() * 0.9 +
        (d.key === motion.sponsor.key || d.key === motion.target.key ? 1.2 : 0),
    })).sort((a, b) => b.weight - a.weight);
    const n = 2 + Math.floor(Math.random() * 4);
    return ranked.slice(0, n).map((r) => r.d);
  }

  // What the chair with no ballot says. It is not arguing a side, so it is not
  // scored on one: it reads the room and enjoys it, which is a bank of its own
  // (ONUAssembly.observer.*) rather than a stance out of the ordinary voices.
  function observerComment(delegation, motion, phase) {
    const tokens = {
      power: delegation.name,
      leader: leaderOf(delegation),
      sponsor: motion.sponsor.name,
      target: motion.target.name,
      topic: T("ONUAssembly.motion." + motion.def.key + ".tag"),
    };
    const key = "ONUAssembly.observer." + delegation.register + "." + phase;
    const pool = bankOr(key, "ONUAssembly.observer.common." + phase);
    return pool.length ? vary(fill(pick(pool), tokens)) : "";
  }

  function speechFor(delegation, motion) {
    const reg = "ONUAssembly.voice." + delegation.register;
    const tokens = {
      power: delegation.name,
      leader: leaderOf(delegation),
      sponsor: motion.sponsor.name,
      target: motion.target.name,
      topic: T("ONUAssembly.motion." + motion.def.key + ".tag"),
    };
    const lean = traitScore(delegation, motion.def);
    // A delegation whose own numbers say nothing is the one that wanders off
    // the point, which is where the odd bank belongs.
    let stanceKey;
    if (Math.abs(lean) < 0.18 && chance(0.55)) stanceKey = "odd";
    else stanceKey = lean >= 0 ? "for" : "against";

    const open = bankOr(reg + ".open", "ONUAssembly.voice.common.open");
    const body = bankOr(reg + "." + stanceKey, "ONUAssembly.voice.common." + stanceKey);
    const parts = [];
    if (open.length) parts.push(vary(fill(pick(open), tokens)));
    if (body.length) parts.push(vary(fill(pick(body), tokens)));
    return { text: parts.join(" "), stance: stanceKey };
  }

  //===========================================================================
  // The vote
  //===========================================================================

  // How far the player's argument carries. Standing with their own power buys
  // them a hearing; Diplomacy buys them the room.
  function persuasion(actor, delegation, sg) {
    let p = 0.16;
    if (window.Specializations && typeof window.Specializations.levelOf === "function") {
      p += 0.055 * (window.Specializations.levelOf(actor, DIPLOMACY_SPEC) - 1);
    }
    if (delegation) p += 0.004 * Math.max(0, standingFor(actor, delegation));
    // The chair speaks for nobody, which is exactly why it is listened to.
    if (sg) p += 0.22;
    return Math.max(0, Math.min(0.95, p));
  }

  // stance: +1 pushing for, -1 pushing against, 0 pushing toward abstention.
  const STANCE_EFFECT = {
    support:    { stance: 1, damp: 1.0, push: 1.0 },
    oppose:     { stance: -1, damp: 1.0, push: 1.0 },
    amend:      { stance: 1, damp: 0.55, push: 0.55 },
    filibuster: { stance: 0, damp: 0.35, push: 0.0 },
    abstain:    { stance: 0, damp: 1.0, push: 0.0 },
    wild:       { stance: 0, damp: 1.0, push: 0.0 },
  };

  function relationTo(a, b) {
    if (!a || !b || a.factionId == null || b.factionId == null) return 0;
    return $gameFactions.getRelationship(a.factionId, b.factionId) || 0;
  }

  // How much of an argument a delegation takes in at all, given who is making
  // it. An ally hears most of it, a neutral seat a little, an enemy nothing.
  const PERSUASION_REACH = 0.95;
  function heardBy(listener, speaker) {
    return Math.max(0, 0.15 + 0.42 * relationTo(listener, speaker));
  }

  function castVotes(motion, ctx) {
    const effect = STANCE_EFFECT[ctx.option] || STANCE_EFFECT.abstain;
    // A wildcard is genuinely unpredictable: it either lands or it does not.
    const wildSign = ctx.option === "wild" ? (chance(0.5) ? 1 : -1) : 0;
    const wildForce = ctx.option === "wild" ? (0.2 + Math.random() * 1.1) : 0;

    return delegations().map((d) => {
      let s = traitScore(d, motion.def) * effect.damp;
      s += relationTo(d, motion.sponsor) * 0.28;
      if (d.key === motion.target.key) s -= 0.35;
      if (d.key === motion.sponsor.key) s += 0.55;

      if (ctx.delegation) {
        if (d.key === ctx.delegation.key) {
          // The player's own seat votes the way the player argued.
          s += effect.stance * 1.6 + wildSign * wildForce;
        } else {
          // An argument is not weather: it does not fall evenly on the whole
          // chamber. A uniform nudge across twenty one correlated votes
          // decided the majority outright, so persuasion is aimed instead.
          // You move the delegations that were going to listen to you, and a
          // hostile one does not hear a word of it.
          s += effect.stance * ctx.persuasion * effect.push * heardBy(d, ctx.delegation) * PERSUASION_REACH;
          s += wildSign * wildForce * ctx.persuasion * heardBy(d, ctx.delegation);
        }
      } else if (ctx.sg) {
        // The chair pulls the room toward whatever it framed, gently, and
        // toward agreeing on something rather than nothing. It speaks for
        // nobody, so nobody tunes it out either.
        s += effect.stance * ctx.persuasion * effect.push * 0.45;
        s += (s >= 0 ? 0.1 : -0.1);
      }

      // A delegation is a room full of people having a week, not a formula.
      s += (Math.random() - 0.5) * 1.7;

      const vote = s > 0.35 ? "for" : (s < -0.35 ? "against" : "abstain");
      return { delegation: d, vote: vote, score: s };
    });
  }

  const tally = (votes) => ({
    for: votes.filter((v) => v.vote === "for").length,
    against: votes.filter((v) => v.vote === "against").length,
    abstain: votes.filter((v) => v.vote === "abstain").length,
  });

  //===========================================================================
  // The Security Council
  //===========================================================================
  //
  // Britannia, the Soviet Union, the Holy Vatican Empire and the Ottoman
  // Empire. Majority carries. Two against two is broken by the Secretary
  // General, and without one the motion dies on the tie.

  // The five powers the century ended with. Strength is what the world
  // simulation left them holding when it stopped in the year 2000: their
  // military, their economy, the people under them, what they know and what
  // they can do that nobody can explain (HistoryManager.getHyperpowers()).
  // A world whose history was never run falls back to the four the charter was
  // written with.
  const COUNCIL_SEATS = 5;

  function powerStrength(stats) {
    if (!stats) return 0;
    return (stats.military || 0) * 1.6
      + (stats.economy || 0) * 1.2
      + (stats.population || 0) * 0.35
      + (stats.information || 0) * 0.8
      + (stats.arcane || 0) * 0.9;
  }

  function councilMembers() {
    const seated = delegations().filter((d) => d.kind === "hyperpower" && !d.observer);
    const ranked = window.HistoryManager && typeof window.HistoryManager.getHyperpowers === "function"
      ? window.HistoryManager.getHyperpowers() : null;
    if (ranked && Object.keys(ranked).length) {
      // The roster is keyed by hyperpower id; the history is keyed by the name
      // in Hyperpowers.json, which is not the label the delegation is shown
      // under, so the two are joined through the id.
      const rawNames = {};
      $gameFactions.getHyperpowers().forEach((hp) => { rawNames[hp.id] = hp.name; });
      const strongest = seated
        .map((d) => ({ d, strength: powerStrength(ranked[rawNames[d.hyperpowerId]] || d.stats) }))
        .sort((a, b) => b.strength - a.strength || a.d.hyperpowerId - b.d.hyperpowerId)
        .slice(0, COUNCIL_SEATS)
        .map((x) => x.d);
      if (strongest.length) return strongest;
    }
    return COUNCIL_FACTION_IDS
      .map((id) => delegations().find((d) => d.factionId === id))
      .filter(Boolean);
  }

  function councilRuling(motion, votes, ctx) {
    const seats = councilMembers();
    const assemblyLean = tally(votes);
    const roomFor = assemblyLean.for > assemblyLean.against;

    const rulings = seats.map((d) => {
      // A permanent member the player is sitting in speaks with the player's
      // own voice, since that seat is theirs this week.
      if (ctx.delegation && d.key === ctx.delegation.key) {
        const eff = STANCE_EFFECT[ctx.option] || STANCE_EFFECT.abstain;
        if (eff.stance > 0) return { delegation: d, ruling: "approve", player: true };
        if (eff.stance < 0) return { delegation: d, ruling: "veto", player: true };
      }
      let s = traitScore(d, motion.def);
      s += relationTo(d, motion.sponsor) * 0.4;
      s += roomFor ? 0.25 : -0.25;
      if (ctx.delegation) {
        const eff = STANCE_EFFECT[ctx.option] || STANCE_EFFECT.abstain;
        s += eff.stance * ctx.persuasion * relationTo(d, ctx.delegation) * 0.5;
      }
      s += (Math.random() - 0.5) * 1.1;
      return { delegation: d, ruling: s >= 0 ? "approve" : "veto", player: false };
    });

    const approve = rulings.filter((r) => r.ruling === "approve").length;
    const veto = rulings.length - approve;
    let passed = approve > veto;
    let tiebreak = null;
    if (approve === veto) {
      if (ctx.sg || ctx.secretaryPresent) {
        // The chair decides, and the chair reads the room.
        passed = roomFor;
        tiebreak = passed ? "approve" : "veto";
      } else {
        passed = false;
        tiebreak = "none";
      }
    }
    return { rulings, approve, veto, passed, tiebreak };
  }

  //===========================================================================
  // The overlay, which lives in ONUAssemblyUI.js
  //===========================================================================
  //
  // Nothing below draws anything. The chamber, the agenda page, the dossier
  // and the division board are all in NPC/ONUAssemblyUI.js; this file asks it
  // for them and does not know what any of them look like. What stays here is
  // the one thing the drawing cannot answer: whether a sitting is in progress,
  // which is what keeps the map from being walked away from underneath one.

  const UI = () => window.ONUAssemblyUI || null;

  function assemblyIsSitting() {
    const ui = UI();
    return ui ? ui.assemblyIsSitting() : false;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function newChamber(titleKey) {
    const ui = UI();
    if (!ui) return null;
    return new ui.Chamber(titleKey);
  }

  const agendaHTML = (session, motion) => { const u = UI(); return u ? u.agendaHTML(session, motion) : ""; };
  const boardHTML = (entries, opts) => { const u = UI(); return u ? u.boardHTML(entries, opts) : ""; };
  const dossierHTML = (delegation, actor) => { const u = UI(); return u ? u.dossierHTML(delegation, actor) : ""; };
  const paintSeat = (index, vote) => { const u = UI(); if (u) u.paintSeat(index, vote); };
  const paintTally = (counts) => { const u = UI(); if (u) u.paintTally(counts); };
  const drawEmblem = (iconIndex, canvasId) => { const u = UI(); if (u) u.drawEmblem(iconIndex, canvasId); };

  const _Scene_Map_isMenuCalled = Scene_Map.prototype.isMenuCalled;
  Scene_Map.prototype.isMenuCalled = function () {
    if (assemblyIsSitting()) return false;
    return _Scene_Map_isMenuCalled.call(this);
  };

  const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
  Scene_Map.prototype.isMenuEnabled = function () {
    if (assemblyIsSitting()) return false;
    return _Scene_Map_isMenuEnabled.call(this);
  };

  const _Scene_Map_callMenu = Scene_Map.prototype.callMenu;
  Scene_Map.prototype.callMenu = function () {
    if (assemblyIsSitting()) return;
    _Scene_Map_callMenu.call(this);
  };

  //===========================================================================
  // The session
  //===========================================================================

  async function runSession(actor, opts) {
    const options = opts || {};
    const post = postOf(actor);
    const sg = !!(post && post.sg);
    const delegation = sg ? null : (post ? delegationByKey(post.key) : null);
    if (!sg && !delegation) return;

    const chamber = newChamber("ONUMenu.ui.assembly");
    if (!chamber) return;
    const session = {
      actor: actor,
      sg: sg,
      delegation: delegation,
      venue: say("ONUAssembly.venues"),
      chair: say("ONUAssembly.chairs"),
      agenda: rollAgenda(),
      results: [],
      index: 0,
    };

    chamber.open();
    chamber.setSidebar(agendaHTML(session, null));
    chamber.setHeadline(vary(T("ONUMenu.ui.sessionHeadline", { week: weekIndex() + 1 })));

    chamber.add(say("ONUAssembly.openings", {
      venue: session.venue, chair: session.chair,
      power: sg ? T("ONUMenu.role.secretaryGeneral") : delegation.name,
      name: actor.name(),
    }), "narrator");
    await chamber.advance();

    chamber.add(say("ONUAssembly.ambience"), "narrator");
    await chamber.advance();

    let persuade = persuasion(actor, delegation, sg);
    const secretaryPresent = sg || isSecretaryCandidate();

    let carried = 0;
    for (let i = 0; i < session.agenda.length; i++) {
      session.index = i;
      const motion = session.agenda[i];
      chamber.setSidebar(agendaHTML(session, motion));

      // The chair reads it.
      chamber.add(motion.title, "eris", session.chair);
      await chamber.advance();
      chamber.add(motion.text, "eris", session.chair);
      await chamber.advance();

      // The floor.
      const speakers = speakersFor(motion, null);
      for (const speaker of speakers) {
        const speech = speechFor(speaker, motion);
        if (!speech.text) continue;
        chamber.add(speech.text, "eris", `${speaker.name} (${leaderOf(speaker)})`);
        await chamber.advance();
        if (chance(0.22)) {
          chamber.add(say("ONUAssembly.interruptions", { power: speaker.name }), "narrator");
          await chamber.advance();
        }
      }

      // The chairs with no ballot. They are not part of the debate, so they
      // speak after it and are answerable to nobody for what they say.
      for (const watcher of observers()) {
        if (!chance(0.7)) continue;
        const line = observerComment(watcher, motion, "floor");
        if (!line) continue;
        chamber.add(line, "eris", `${watcher.name} (${T("ONUMenu.ui.observer")})`);
        await chamber.advance();
      }

      // The player answers.
      const optionKeys = sg
        ? ["amend", "support", "oppose", "abstain", "wild"]
        : ["support", "oppose", "amend", "filibuster", "wild"];
      const labels = optionKeys.map((k) =>
        say("ONUAssembly.choice." + (sg ? "sg." : "") + k, {
          power: sg ? T("ONUMenu.role.secretaryGeneral") : delegation.name,
          topic: T("ONUAssembly.motion." + motion.def.key + ".tag"),
          sponsor: motion.sponsor.name,
        }));
      const chosen = await chamber.choose(labels, {
        speaker: sg ? T("ONUMenu.role.secretaryGeneral") : delegation.name,
      });
      // choose() resolves to the index of the label that was picked, so the answer
      // has to be read back out of the key list the labels were built from.
      const option = optionKeys[chosen] || optionKeys[0];
      chamber.add(say("ONUAssembly.reactions." + (option === "wild" ? "wild" : "normal"), {
        power: sg ? T("ONUMenu.role.secretaryGeneral") : delegation.name,
      }), "narrator");
      await chamber.advance();

      // Roll 3D D20 for debate persuasion impact on the chamber
      if (window.Dice3D && option !== "abstain") {
        const psiMod = Math.floor(((actor.luk || 10) - 10) / 2);
        const res = await window.Dice3D.rollD20({
          dc: option === "wild" ? 14 : 11,
          modifier: psiMod + Math.round((persuade - 1) * 3),
          statName: "PSI (Diplomacy)",
          actionName: "ONU Assembly Debate"
        });
        if (res.nat20) persuade *= 1.4;
        else if (res.nat1) persuade *= 0.6;
        else if (res.success) persuade *= 1.15;
        else persuade *= 0.85;
      }

      // The division. Every seat votes, whether it spoke or not.
      const ctx = { option, persuasion: persuade, delegation, sg, secretaryPresent };
      const votes = castVotes(motion, ctx);
      const secret = motion.ballot === "secret";
      // A secret ballot is not read out by name, so the tiles are shuffled and
      // nothing can be traced back to a chair.
      const shown = secret ? votes.slice().sort(() => Math.random() - 0.5) : votes;

      chamber.setSidebar(boardHTML(shown, { secret }));
      chamber.add(say(secret ? "ONUAssembly.ballot.secret" : "ONUAssembly.ballot.public",
        { chair: session.chair }), "narrator");

      if (secret) {
        await sleep(700);
        shown.forEach((v, idx) => paintSeat(idx, v.vote));
      } else {
        for (let idx = 0; idx < shown.length; idx++) {
          paintSeat(idx, shown[idx].vote);
          SoundManager.playCursor();
          await sleep(90);
        }
      }
      const counts = tally(votes);
      paintTally(counts);
      await chamber.advance(420);

      let passed = counts.for > counts.against;
      let council = null;

      if (motion.def.grave) {
        chamber.add(say("ONUAssembly.council.opening", { chair: session.chair }), "narrator");
        await chamber.advance();

        council = councilRuling(motion, votes, ctx);
        for (const ruling of council.rulings) {
          chamber.add(say("ONUAssembly.council." + ruling.ruling, {
            power: ruling.delegation.name,
            leader: leaderOf(ruling.delegation),
          }), "eris", `${ruling.delegation.name} (${T("ONUMenu.ui.permanentMember")})`);
          await chamber.advance(240);
        }

        if (council.tiebreak === "none") {
          chamber.add(say("ONUAssembly.council.noTiebreaker"), "narrator");
          await chamber.advance();
        } else if (council.tiebreak) {
          const sgName = sg ? actor.name() : (secretaryActor() ? secretaryActor().name() : SG_NAME);
          chamber.add(say("ONUAssembly.council.tiebreak." + council.tiebreak, { name: sgName }),
            "eris", T("ONUMenu.role.secretaryGeneral"));
          await chamber.advance();
        }
        passed = council.passed;
      }

      session.results[i] = { passed, counts, council, option };
      if (passed) carried++;

      chamber.add(say(passed ? "ONUAssembly.outcome.carried" : "ONUAssembly.outcome.failed", {
        title: motion.title, forCount: counts.for, againstCount: counts.against,
      }), "narrator");
      chamber.setSidebar(agendaHTML(session, null));
      await chamber.advance();

      for (const watcher of observers()) {
        const line = observerComment(watcher, motion, passed ? "carried" : "failed");
        if (!line) continue;
        chamber.add(line, "eris", `${watcher.name} (${T("ONUMenu.ui.observer")})`);
        await chamber.advance();
      }

      applyMotionOutcome(actor, delegation, sg, motion, votes, option, passed);
    }

    session.index = session.agenda.length;
    chamber.setSidebar(agendaHTML(session, null));
    chamber.add(say("ONUAssembly.closings", {
      chair: session.chair, carried: carried, total: session.agenda.length,
    }), "narrator");
    await chamber.advance();

    // Arguing is the only thing that teaches diplomacy.
    if (window.SpecializationXP && typeof window.SpecializationXP.award === "function") {
      window.SpecializationXP.award(DIPLOMACY_SPEC, 2 + Math.floor(Math.random() * 3), { actor: actor });
    }

    const state = assemblyState();
    if (state) {
      state.lastSessionWeek = weekIndex();
      state.sessionsHeld = (state.sessionsHeld || 0) + 1;
    }

    chamber.close();

    if (window.ParchmentToast) {
      window.ParchmentToast.show(T("ONUMenu.toast.sessionClosed", {
        carried: carried, total: session.agenda.length,
      }), { severity: "info", duration: 200, key: "onu-session" });
    }
  }

  // A session moves standings: the seats that voted with you warm to you, the
  // ones that voted against cool, and the power that sent you judges you on
  // whether you brought back the result you argued for.
  function applyMotionOutcome(actor, delegation, sg, motion, votes, option, passed) {
    const eff = STANCE_EFFECT[option] || STANCE_EFFECT.abstain;
    const wanted = eff.stance > 0 ? true : (eff.stance < 0 ? false : null);

    votes.forEach((v) => {
      if (delegation && v.delegation.key === delegation.key) return;
      const agreed = (v.vote === "for" && wanted === true) || (v.vote === "against" && wanted === false);
      const opposed = (v.vote === "for" && wanted === false) || (v.vote === "against" && wanted === true);
      if (agreed) $gameFactions.changeReputationFor(actor, v.delegation.standingKey, 2);
      else if (opposed) $gameFactions.changeReputationFor(actor, v.delegation.standingKey, -1);
      else if (sg) $gameFactions.changeReputationFor(actor, v.delegation.standingKey, 1);
    });

    if (delegation) {
      let delta = 0;
      if (wanted === null) delta = option === "filibuster" ? -2 : 0;
      else delta = (passed === wanted) ? 4 : -3;
      $gameFactions.changeReputationFor(actor, delegation.standingKey, delta);
      if (delegation.factionId != null && delta !== 0) {
        $gameFactions.changeReputation(delegation.factionId, delta > 0 ? 1 : -1);
      }
      // A sponsor remembers who carried its motion for it.
      if (passed === wanted && wanted === true) {
        $gameFactions.changeReputationFor(actor, motion.sponsor.standingKey, 3);
      }
    }

    recordInHistory(actor, delegation, sg, motion, votes, option, passed);
  }

  // Every motion the assembly votes on goes into the world's history, not just
  // the grave ones: the Archive is the record of what this world did, and an
  // assembly that voted on the Rule of 80 in March is exactly that. The record
  // is keyed rather than written out, so a world read later in another language
  // rebuilds the sentence instead of carrying frozen English prose.
  function recordInHistory(actor, delegation, sg, motion, votes, option, passed) {
    const hm = window.HistoryManager;
    if (!hm || typeof hm.recordEvent !== "function") return;
    const counts = tally(votes);
    const eff = STANCE_EFFECT[option] || STANCE_EFFECT.abstain;
    const stance = eff.stance > 0 ? "for" : (eff.stance < 0 ? "against" : "abstained");
    try {
      hm.recordEvent({
        date: historyDate(),
        category: "diplomatic",
        type: "assembly_motion",
        // The sponsor, the outcome, the split, and who the party's own envoy
        // spoke as. The title is already a resolved sentence, so it travels as
        // a parameter rather than as a key.
        descKey: motion.def.grave
          ? "History.assembly.graveMotion"
          : "History.assembly.motion",
        descParams: {
          // The title already names the sponsor, so it is not repeated. The
          // seat is a ready phrase rather than a name, because a delegate
          // speaks FOR a power and the chair speaks AS the chair.
          title: motion.title,
          result: passed ? T("ONUMenu.ui.carried") : T("ONUMenu.ui.failed"),
          forCount: counts.for,
          againstCount: counts.against,
          abstainCount: counts.abstain,
          ballot: T("ONUMenu.ballotWord." + motion.ballot),
          envoy: actor.name(),
          delegation: sg
            ? T("ONUMenu.seatPhrase.chair")
            : T("ONUMenu.seatPhrase.for", { faction: delegation ? delegation.name : "?" }),
          stance: T("ONUMenu.stance." + stance),
        },
        iconIndex: passed ? 237 : 190,
      });
    } catch (e) { console.warn("[ONUAssembly] history", e); }
  }

  // History dates are "YYYY-MM", read off the game clock rather than the wall
  // clock so a session lands in the year it was actually held.
  function historyDate() {
    if (window.TimeDateSystem && typeof window.TimeDateSystem.getDateTimeFromMinutes === "function") {
      const dt = window.TimeDateSystem.getDateTimeFromMinutes(nowMinutes());
      if (dt && dt.year && dt.monthNum) return `${dt.year}-${dt.monthNum}`;
    }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  //===========================================================================
  // The joining board
  //===========================================================================

  async function runJoiningBoard(actor) {
    const board = newChamber("ONUMenu.ui.credentials");
    if (!board) return false;
    const offered = joinableFor(actor);
    board.open();

    if (!offered.length) {
      board.setSidebar(window.ONUAssemblyUI.noticeHTML("ONUMenu.ui.noSeatsTitle", "ONUMenu.ui.noSeatsHint"));
      board.add(say("ONUAssembly.joining.refused", { name: actor.name() }), "narrator");
      await board.advance();
      board.close();
      return false;
    }

    board.setHeadline(vary(T("ONUMenu.ui.credentialsHeadline", { name: actor.name() })));
    board.add(say("ONUAssembly.joining.intro", { name: actor.name() }), "narrator");

    const paint = (idx) => {
      const d = offered[idx];
      if (!d) return;
      board.setSidebar(dossierHTML(d, actor));
      drawEmblem(d.iconIndex, "onu-emblem");
    };
    paint(0);

    const labels = offered.map((d) => {
      const rep = standingFor(actor, d);
      return `${d.name}  ·  ${leaderOf(d)}  ·  ${$gameFactions.reputationLevelOf(rep)} (${rep})`;
    });
    labels.push(T("ONUMenu.ui.declineSeat"));

    const chosen = await board.choose(labels, {
      echo: false,
      cancelIndex: labels.length - 1,
      onMove: paint,
    });

    if (chosen >= offered.length) {
      board.add(say("ONUAssembly.joining.declined", { name: actor.name() }), "narrator");
      await board.advance();
      board.close();
      return false;
    }

    const delegation = offered[chosen];
    applyJoin(actor, delegation);
    board.setSidebar(dossierHTML(delegation, actor));
    drawEmblem(delegation.iconIndex, "onu-emblem");
    board.add(say("ONUAssembly.joining.accepted", {
      name: actor.name(), power: delegation.name, leader: leaderOf(delegation),
    }), "eris", delegation.name);
    await board.advance();
    board.close();

    if (window.ParchmentToast) {
      window.ParchmentToast.show(T("ONUMenu.toast.joined", {
        name: actor.name(), faction: delegation.name,
      }), { severity: "good", duration: 200, key: "onu-join" });
    }
    return true;
  }

  //===========================================================================
  // The lobby
  //===========================================================================

  // What the right page reads while the player stands at the desk: a notice
  // for a traveller with no seat, the chair's service record, or the dossier
  // of the power a delegate serves. Every one of the three is drawn by
  // ONUAssemblyUI.
  function lobbySidebar(actor) {
    const ui = window.ONUAssemblyUI;
    const post = postOf(actor);
    if (!ui) return "";
    if (!post) return ui.noticeHTML("ONUMenu.ui.unaccredited", "ONUMenu.ui.unaccreditedHint");
    if (post.sg) return ui.secretaryHTML(actor, post, assemblyState());
    return ui.seatedHTML(actor, post, delegationByKey(post.key));
  }

  function canSitThisWeek() {
    const state = assemblyState();
    if (!state) return false;
    if (state.lastSessionWeek == null || state.lastSessionWeek < 0) return true;
    return weekIndex() >= state.lastSessionWeek + COOLDOWN_WEEKS;
  }

  function weeksUntilSession() {
    const state = assemblyState();
    if (!state || state.lastSessionWeek == null || state.lastSessionWeek < 0) return 0;
    return Math.max(0, state.lastSessionWeek + COOLDOWN_WEEKS - weekIndex());
  }

  //===========================================================================
  // The chamber sits without us
  //===========================================================================
  //
  // The assembly meets every Monday at 13:00 whether or not anybody from the
  // party is in the room, because it is a world body and not a minigame. An
  // unattended sitting is the same model with no envoy in it: the agenda is
  // rolled, the chamber votes its own opinions, the Security Council rules on
  // the grave motions, and the result is written into the world's history
  // exactly as an attended one is. Standings are not touched, since nobody
  // from the party was there to be judged on how they argued.
  //
  // It is caught up off the world clock, so a week walked past, worked
  // through, waited out or slept through in a cryogenic pod still leaves the
  // record of what was decided in it.

  const SESSION_WEEKDAY = 1;   // Monday
  const SESSION_HOUR = 13;     // 13:00
  // A catch-up never replays more sittings than this: a decade asleep leaves a
  // year of minutes on the record rather than five hundred sittings of it.
  const MAX_AUTO_SESSIONS = 52;

  let _catchingUpSessions = false;

  // The clock minute of the first sitting at or after `minute`, and every one
  // after it, are a fixed week apart, so only the first has to be found.
  function firstSessionMinuteAfter(minute) {
    const date = new Date(2001, 0, 1, 10, 0, 0);
    date.setMinutes(date.getMinutes() + minute);
    const ahead = (SESSION_WEEKDAY - date.getDay() + 7) % 7;
    const sitting = new Date(date.getFullYear(), date.getMonth(), date.getDate() + ahead, SESSION_HOUR, 0, 0);
    // The clock counts minutes as an offset in calendar fields from the epoch,
    // so the arithmetic is done in UTC: an absolute difference would put the
    // sitting an hour out for every date inside daylight saving.
    let at = Math.round(
      (Date.UTC(sitting.getFullYear(), sitting.getMonth(), sitting.getDate(), SESSION_HOUR, 0)
        - Date.UTC(2001, 0, 1, 10, 0)) / 60000
    );
    if (at < minute) at += MINUTES_PER_WEEK;
    return at;
  }

  // One sitting nobody from the party attended.
  function runUnattendedSession(minute) {
    const agenda = rollAgenda();
    if (!agenda.length) return 0;
    const ctx = { option: "abstain", delegation: null, sg: null, persuasion: 0 };
    let carried = 0;
    for (const motion of agenda) {
      const votes = castVotes(motion, ctx);
      const counts = tally(votes);
      let passed = counts.for > counts.against;
      if (motion.def.grave) {
        const council = councilRuling(motion, votes, ctx);
        passed = council.passed;
      }
      if (passed) carried++;
      recordUnattendedMotion(motion, counts, passed, minute);
    }
    return carried;
  }

  // The same record an attended motion leaves, minus the envoy: there was
  // nobody in the seat to name.
  function recordUnattendedMotion(motion, counts, passed, minute) {
    const hm = window.HistoryManager;
    if (!hm || typeof hm.recordEvent !== "function") return;
    let date = historyDate();
    if (window.TimeDateSystem && typeof window.TimeDateSystem.getDateTimeFromMinutes === "function") {
      const dt = window.TimeDateSystem.getDateTimeFromMinutes(minute);
      if (dt && dt.year && dt.monthNum) date = `${dt.year}-${dt.monthNum}-${String(dt.day).padStart(2, "0")}`;
    }
    try {
      const entry = hm.recordEvent({
        date: date,
        category: "diplomatic",
        type: "assembly_motion",
        descKey: motion.def.grave
          ? "History.assembly.unattendedGraveMotion"
          : "History.assembly.unattendedMotion",
        descParams: {
          title: motion.title,
          result: passed ? T("ONUMenu.ui.carried") : T("ONUMenu.ui.failed"),
          forCount: counts.for,
          againstCount: counts.against,
          abstainCount: counts.abstain,
          ballot: T("ONUMenu.ballotWord." + motion.ballot),
        },
        iconIndex: passed ? 237 : 190,
      });
      if (entry) entry.live = true;
    } catch (e) { console.warn("[ONUAssembly] history", e); }
  }

  // Every Monday sitting the world clock has passed since the last one was
  // resolved. A delta pass: an unmoved clock costs one comparison.
  function catchUpSessions(nowMinute) {
    if (_catchingUpSessions) return 0;
    // No delegates, no sittings. The assembly never convenes in an empty
    // world (WorldManager.populationMode).
    const WM = window.WorldManager;
    if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return 0;
    const state = assemblyState();
    if (!state || !factionsReady()) return 0;
    const now = Number(nowMinute != null ? nowMinute : nowMinutes()) || 0;
    if (state.lastAutoSessionMinute == null) {
      // First sight of the ledger: start from the sitting ahead of us rather
      // than replaying every Monday since the world was made.
      state.lastAutoSessionMinute = now;
      return 0;
    }
    if (now < state.lastAutoSessionMinute) { state.lastAutoSessionMinute = now; return 0; }

    let at = firstSessionMinuteAfter(state.lastAutoSessionMinute + 1);
    if (at > now) return 0;
    const due = Math.floor((now - at) / MINUTES_PER_WEEK) + 1;
    if (due > MAX_AUTO_SESSIONS) at += (due - MAX_AUTO_SESSIONS) * MINUTES_PER_WEEK;

    _catchingUpSessions = true;
    let held = 0;
    try {
      for (; at <= now; at += MINUTES_PER_WEEK) {
        runUnattendedSession(at);
        held++;
      }
      state.lastAutoSessionMinute = now;
      state.sessionsHeld = (state.sessionsHeld || 0) + held;
      if (window.WorldManager) window.WorldManager.flush("npcs");
    } catch (e) {
      console.warn("[ONUAssembly] unattended sitting", e);
    } finally {
      _catchingUpSessions = false;
    }
    return held;
  }

  // Which party member is at the desk. A single seat holder needs no asking.
  async function resolveActingMember(lobby) {
    const seated = seatedMembers();
    if (seated.length === 1) return seated[0];
    if (seated.length > 1) {
      const labels = seated.map((m) => {
        const p = postOf(m);
        const d = p.key ? delegationByKey(p.key) : null;
        return T("ONUMenu.ui.memberSeat", {
          name: m.name(),
          faction: p.sg ? T("ONUMenu.role.secretaryGeneral") : (d ? d.name : "?"),
        });
      });
      labels.push(T("ONUMenu.ui.someoneElse"));
      const idx = await lobby.choose(labels, { echo: false, cancelIndex: labels.length - 1 });
      if (idx < seated.length) return seated[idx];
    }
    // Nobody seated, or the player asked for somebody else: pick a member.
    const members = $gameParty.members().filter((m) => m && !postOf(m));
    if (!members.length) return seated[0] || null;
    if (members.length === 1) return members[0];
    const labels = members.map((m) => m.name());
    labels.push(T("ONUMenu.ui.leaveLobby"));
    const idx = await lobby.choose(labels, { echo: false, cancelIndex: labels.length - 1 });
    return idx < members.length ? members[idx] : null;
  }

  async function runLobby() {
    if (!factionsReady()) {
      if (window.FactionDataManager && FactionDataManager.instance && FactionDataManager.instance._readyPromise) {
        await FactionDataManager.instance._readyPromise;
      }
      if (!factionsReady()) return;
    }
    if (assemblyIsSitting()) return;

    const lobby = newChamber("ONUMenu.ui.lobby");
    if (!lobby) return;
    lobby.open();
    lobby.setHeadline(vary(T("ONUMenu.ui.lobbyHeadline")));
    lobby.add(say("ONUAssembly.lobby.intro", { venue: say("ONUAssembly.venues") }), "narrator");

    let actor = await resolveActingMember(lobby);
    if (!actor) { lobby.close(); return; }

    // A character with no seat is shown the board before anything else, and
    // that is also how a second member joins.
    if (!postOf(actor)) {
      lobby.close();
      const joined = await runJoiningBoard(actor);
      if (!joined) return;
      return runLobby();
    }

    lobby.setSidebar(lobbySidebar(actor));
    const post = postOf(actor);
    const delegation = post.key ? delegationByKey(post.key) : null;
    drawEmblem(delegation ? delegation.iconIndex : 0, "onu-emblem");

    const ready = canSitThisWeek();
    const waitWeeks = weeksUntilSession();
    const canPreside = !post.sg && isSecretaryCandidate() && actor.name() === SG_NAME;

    const actions = [];
    actions.push({
      id: "sit",
      text: ready ? T("ONUMenu.ui.enterSession") : T("ONUMenu.ui.sessionClosedFor", { weeks: waitWeeks }),
      disabled: !ready,
    });
    if (canPreside) actions.push({ id: "preside", text: T("ONUMenu.ui.takeTheChair") });
    actions.push({ id: "resign", text: post.sg ? T("ONUMenu.ui.standDown") : T("ONUMenu.ui.resignSeat") });
    actions.push({ id: "leave", text: T("ONUMenu.ui.leaveLobby") });

    const idx = await lobby.choose(actions.map((a) => ({ text: a.text, disabled: a.disabled })), {
      echo: false,
      cancelIndex: actions.length - 1,
    });
    const action = actions[idx].id;

    if (action === "leave") { lobby.close(); return; }

    if (action === "preside") {
      // The chair is taken, not given: the seat is surrendered for it.
      applyResign(actor, { dismissed: false });
      applySecretaryGeneral(actor);
      lobby.add(say("ONUAssembly.lobby.presiding", { name: actor.name() }), "narrator");
      await lobby.advance();
      lobby.close();
      return runLobby();
    }

    if (action === "resign") {
      const confirm = await lobby.choose([
        T("ONUMenu.ui.resignConfirm", {
          faction: post.sg ? T("ONUMenu.role.secretaryGeneral") : (delegation ? delegation.name : "?"),
        }),
        T("ONUMenu.ui.resignCancel"),
      ], { echo: false, cancelIndex: 1 });
      if (confirm === 0) {
        applyResign(actor, { dismissed: false });
        lobby.add(say("ONUAssembly.lobby.resigned", {
          name: actor.name(),
          power: delegation ? delegation.name : T("ONUMenu.role.secretaryGeneral"),
        }), "narrator");
        await lobby.advance();
        if (window.ParchmentToast) {
          window.ParchmentToast.show(T("ONUMenu.toast.resigned", {
            name: actor.name(),
            faction: delegation ? delegation.name : T("ONUMenu.role.secretaryGeneral"),
          }), { severity: "warning", duration: 200, key: "onu-resign" });
        }
      }
      lobby.close();
      return;
    }

    lobby.close();
    await runSession(actor);
  }

  //===========================================================================
  // The clock hooks
  //===========================================================================
  //
  // The week rolling over is watched on the map, and a map load settles
  // whatever was skipped by sleeping, travelling or working a shift.

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    try { settleStipends(); } catch (e) { console.warn("[ONUAssembly]", e); }
    try { catchUpSessions(); } catch (e) { console.warn("[ONUAssembly]", e); }
  };

  const _Game_Map_update = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update.call(this, sceneActive);
    if (!sceneActive || !window.$gameVariables) return;
    // The sittings are watched by the day rather than by the week: a Monday
    // walked through must be resolved on the Monday, not on the next rollover.
    const day = Math.floor(nowMinutes() / MINUTES_PER_DAY);
    if (day !== this._onuLastDay) {
      this._onuLastDay = day;
      try { catchUpSessions(); } catch (e) { console.warn("[ONUAssembly]", e); }
    }
    const week = weekIndex();
    if (week === this._onuLastWeek) return;
    this._onuLastWeek = week;
    try { settleStipends(); } catch (e) { console.warn("[ONUAssembly]", e); }
  };

  //===========================================================================
  // Plugin commands and exports
  //===========================================================================

  PluginManager.registerCommand(pluginName, "openAssembly", () => {
    runLobby().catch((e) => console.error("[ONUAssembly]", e));
  });

  PluginManager.registerCommand(pluginName, "startSession", () => {
    (async () => {
      if (!factionsReady() && window.FactionDataManager && FactionDataManager.instance) {
        await FactionDataManager.instance._readyPromise;
      }
      if (!factionsReady() || assemblyIsSitting()) return;
      const seated = seatedMembers();
      if (!seated.length) return runLobby();
      if (!canSitThisWeek()) {
        if (window.ParchmentToast) {
          window.ParchmentToast.show(T("ONUMenu.toast.notThisWeek", { weeks: weeksUntilSession() }),
            { severity: "warning", duration: 180, key: "onu-cooldown" });
        }
        return;
      }
      if (seated.length === 1) return runSession(seated[0]);
      return runLobby();
    })().catch((e) => console.error("[ONUAssembly]", e));
  });

  PluginManager.registerCommand(pluginName, "assemblyReport", () => {
    if (!factionsReady()) { console.log("[ONUAssembly] factions not loaded yet"); return; }
    console.log("[ONUAssembly] seats:", delegations().map((d) => `${d.key} ${d.name} (${d.register})`));
    console.log("[ONUAssembly] week:", weekIndex(), "sittable:", canSitThisWeek());
    seatedMembers().forEach((m) => {
      const p = postOf(m);
      console.log("[ONUAssembly]", m.name(), p.sg ? "Secretary General" : p.key,
        "pay", euros(weeklyPay(m)));
    });
  });

  window.ONUAssembly = {
    // Everything NPC/ONUAssemblyUI.js is allowed to ask this file. The drawing
    // reads the roster, the words and the money through here and writes
    // nothing back: the ledger is moved by the flows in this file alone.
    _model: {
      // T is the game-wide localization function, asked for late so this file
      // never depends on which of the two loads first.
      T: (key, tokens) => T(key, tokens),
      vary,
      euros,
      standingFor,
      leaderOf,
      weeklyPay,
      // What a seat would pay a character the week after they took it, which
      // is the number the accreditation board offers them.
      projectedStipend: (standing) =>
        STIPEND_BASE + STIPEND_PER_POINT * Math.max(0, standing + JOIN_HEAD),
    },

    delegations,
    delegationByKey,
    delegationForFaction,
    leaderOf,
    standingFor,
    postOf,
    seatedMembers,
    joinableFor,
    canSitThisWeek,
    weeksUntilSession,
    weekIndex,
    // The chamber sits every Monday at 13:00 with or without us; this is what
    // resolves the ones nobody attended (see runUnattendedSession).
    catchUpSessions,
    weeklyPay,
    isSecretaryCandidate,
    openLobby: runLobby,

    // The Assets menu reads this to list every seat the party holds.
    listPosts() {
      if (!factionsReady()) return [];
      return seatedMembers().map((actor) => {
        const post = postOf(actor);
        const delegation = post.key ? delegationByKey(post.key) : null;
        return {
          actorId: actor.actorId(),
          actorName: actor.name(),
          sg: !!post.sg,
          key: post.key,
          factionName: post.sg ? T("ONUMenu.role.secretaryGeneral") : (delegation ? delegation.name : "?"),
          leader: delegation ? leaderOf(delegation) : "",
          standing: delegation ? standingFor(actor, delegation) : 0,
          standingLabel: delegation
            ? $gameFactions.reputationLevelOf(standingFor(actor, delegation))
            : T("ONUMenu.role.secretaryGeneral"),
          weeklyPay: weeklyPay(actor),
          weeksServed: post.weeksServed || 0,
          iconIndex: delegation ? delegation.iconIndex : 0,
        };
      });
    },

    // Resigning from outside the lobby (the Assets menu offers it).
    resign(actorId) {
      const actor = window.$gameActors ? $gameActors.actor(actorId) : null;
      if (!actor || !postOf(actor)) return false;
      const post = postOf(actor);
      const delegation = post.key ? delegationByKey(post.key) : null;
      applyResign(actor, { dismissed: false });
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T("ONUMenu.toast.resigned", {
          name: actor.name(),
          faction: delegation ? delegation.name : T("ONUMenu.role.secretaryGeneral"),
        }), { severity: "warning", duration: 200, key: "onu-resign" });
      }
      return true;
    },

    // The Factions menu asks this for the line under a power's dossier.
    postLabelFor(actor, standingKey) {
      const post = postOf(actor);
      if (!post) return "";
      if (post.sg) return null;
      const delegation = post.key ? delegationByKey(post.key) : null;
      if (!delegation) return null;
      if (delegation.standingKey === String(standingKey)) {
        return T("ONUMenu.ui.holdsSeat", { name: actor.name(), faction: delegation.name });
      }
      if (delegation.branchIds.indexOf(Number(standingKey)) >= 0) {
        return T("ONUMenu.ui.holdsSeatParent", { name: actor.name(), faction: delegation.name });
      }
      return null;
    },

    // The model, unwrapped, so the offline harness can drive a few hundred
    // sittings without a game window: nothing in the game calls these.
    _internal: {
      MOTIONS, TRAITS, traitScore, rollAgenda, speakersFor, speechFor,
      castVotes, tally, councilRuling, councilMembers, persuasion,
      applyJoin, applyResign, applySecretaryGeneral, settleStipends,
      runSession, runJoiningBoard, vary, say,
    },
  };
})();
