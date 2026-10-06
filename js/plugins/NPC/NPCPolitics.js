/*:
 * @target MZ
 * @plugindesc NPC Politics v1.0.0, Hyperpower governments, elections, parties & DF-grade social politics
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCPolitics, Dwarf-Fortress-grade political & social simulation
 * ============================================================================
 * Builds a living political world on top of the NPC life simulation:
 *
 *   - Every hyperpower defined in WorldGen/Countries.json (every non-Neutral
 *     "faction"/"controller") gets a full government: an archetype (theocracy,
 *     single-party state, parliamentary monarchy, technocracy, sultanate,
 *     divine pantheon, serene republic, corporatocracy, warband confederacy),
 *     political parties / orders / blocs / clans, a generated political class
 *     with charisma / integrity / cunning / ambition, a head of state, and
 *     running meters: legitimacy, stability, unrest, economy mood, treasury.
 *
 *   - Elections, each in the hyperpower's own idiom: parliamentary general
 *     elections, papal conclaves with multiple ballots, politburo plenums
 *     with official 99% results, wealth-weighted shareholder meetings,
 *     goblin moots where the runner-up risks being eaten, divine ascension
 *     tournaments, palace successions, and the Archive's Great Examination.
 *     Every result is recorded in a permanent political history.
 *
 *   - Ongoing political life resolved through time skips: scandals, policy
 *     edicts, protests, riots, coups, revolutions, assassinations,
 *     referendums, festivals, rumors that spread through the population,
 *     party momentum, approval drift, and mortality of aging rulers.
 *
 *   - Every map-group NPC gets a political identity: a five-axis ideology
 *     (economy, authority, tradition, militarism, mysticism), a party
 *     affiliation within their settlement's hyperpower, an engagement level
 *     (apathetic → voter → activist → organizer), a voting record, and
 *     grudges against parties that beat theirs.
 *
 *   - Local DF-style settlement politics: each map group elects a mayor from
 *     its real NPC population every year; the mayor appoints a captain of
 *     the guard, a tax collector and a high priest from ideological allies.
 *
 * State lives in $gameSystem._npcPolitics, which WorldManager maps to the
 * "politics" section of the world's npcs.json, shared by every savegame of
 * the world, flushed after big time skips. All generation and event sampling
 * is seeded (world seed + names + minutes), so two worlds with the same seed
 * produce the same political history.
 *
 * Delta processing is O(powers + NPCs) per ~30-day chunk regardless of how
 * much time passed; event counts are sampled from per-day rates.
 *
 * Load order:
 *   Core/WorldManager → Core/TimeDateSystem → NPC/NPCSystem
 *   → NPC/NPCSociety → NPC/NPCSimulationCore → NPC/NPCLifeSimulator
 *   → NPC/NPCConversation → NPC/NPCPolitics  ← this file
 *
 * Public API (window.NPCPolitics):
 *   catchUp(nowMinute)            , resolve all political time up to now
 *   getPower(name)                , a hyperpower's full political state
 *   listPowers()                  , names of all registered hyperpowers
 *   getIdentity(npcName)          , an NPC's political identity
 *   getSettlement(groupName)      , local offices of a map group
 *   polityOfGroup(groupName)      , { country, power } a map group belongs to
 *   nationOfGroup(groupName)      , country name a map group belongs to
 *   opinionModifier(a, b)         , -12..+12 political chemistry of two NPCs
 *   getConversationContext(name)  , fodder for NPCConversation's
 *                                    PoliticsProvider dialogue templates
 *   buildPowerReport(powerName)   , readable multi-line state-of-the-nation
 *   buildElectionReport(powerName), readable election history + next date
 *   buildNPCProfile(npcName)      , readable political biography of an NPC
 *   getNation(name)               , a nation's own government, or null
 *   describePlace(groupName?)     , the town hall, nation and bloc over a
 *                                    place (the party's own when omitted)
 *   electedOf(place)              , every office holder over that place
 *   realPoliticians()             , office holders made into people
 *                                    (REAL POLITICIANS section)
 *   onPersonDied(name)            , called by NPCLifeSim.killNpc
 *
 *   The party's own political party (THE PARTY'S OWN POLITICAL PARTY):
 *   foundPlayerParty / editPlayerParty / playerParty, one per world, with a
 *   creed, up to three tenets and a weekly subscription fee paid by every
 *   supporter; partiesIn(scope) every party narrowed to a place, nation or
 *   hyperpower; projectCampaign / launchCampaign paid conversion and smear
 *   campaigns; upcomingElections / standForElection candidacies of the team.
 *
 * @command PoliticsReport
 * @desc Show the state-of-the-nation report for a hyperpower.
 *
 * @arg power
 * @text Hyperpower name
 * @type string
 * @default
 *
 * @command PoliticsElections
 * @desc Show the election history and next scheduled election of a hyperpower.
 *
 * @arg power
 * @text Hyperpower name
 * @type string
 * @default
 *
 * @command PoliticsNPC
 * @desc Show the political profile of a named NPC.
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 *
 * @command PoliticsDebug
 * @desc Print the full political state of a hyperpower (or everything) to the console.
 *
 * @arg power
 * @text Hyperpower name (blank = all)
 * @type string
 * @default
 *
 * @command PoliticsCatchUp
 * @desc Force the political simulation to resolve all pending time.
 */

(() => {
  "use strict";

  const pluginName = "NPCPolitics";

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const MINUTES_PER_DAY    = 1440;
  const MINUTES_PER_YEAR   = 525600;          // 365-day simulation year
  const EPOCH_YEAR         = 2001;            // minute 0 = Jan 1 2001 10:00
  const SKIP_FLUSH_MINUTES = 360;             // deltas >= 6h flush npcs.json
  const CHUNK_DAYS         = 30;              // simulation granularity
  const MAX_NEW_IDENTITIES_PER_PASS = 400;    // bound identity creation
  const ELECTION_LOG_CAP   = 40;              // per-power election records
  const EVENT_LOG_CAP      = 80;              // per-power political events
  const RUMOR_CAP          = 12;              // live rumors per power
  const IDENTITY_LOG_CAP   = 20;              // per-NPC political event log
  const SETTLEMENT_LOG_CAP = 20;              // per-settlement office history
  const LOCAL_TERM_DAYS    = 365;             // settlement mayoral term
  const LOCAL_RETRY_DAYS   = 14;              // a town too small to vote tries again

  // The five ideological axes, each -100..+100.
  //   econ: -100 collectivist  … +100 free-market
  //   auth: -100 libertarian   … +100 authoritarian
  //   trad: -100 progressive   … +100 traditionalist
  //   mil:  -100 pacifist      … +100 militarist
  //   myst: -100 rationalist   … +100 mystic
  const AXES = ["econ", "auth", "trad", "mil", "myst"];

  // How much of a person's political identity is the creed their society
  // profile names (Ideology.json `axes`) against the cultural baseline of the
  // power they live under, and how far their own opinions wander from it. A
  // creed is most of what somebody is, so it leads; without one the identity
  // falls back to the baseline and the old, wider spread.
  const CREED_WEIGHT = 0.62;
  const CREED_SPREAD = 30;

  // Per-day national event rates (scaled by power state at runtime)
  const RATES = {
    scandal:       1 / 120,
    edict:         1 / 90,
    protest:       1 / 60,     // × unrest/100
    riot:          1 / 200,    // × unrest/100, only past unrest 70
    coup:          1 / 600,    // × (100-stability)/100 × coupSusceptibility
    revolution:    1 / 50,     // only at unrest>=90 && legitimacy<=25
    assassination: 1 / 4000,   // × unrest/50
    festival:      1 / 180,    // × festivals policy / 50
    referendum:    1 / 700,    // democratic systems only
    rumor:         1 / 45,
  };

  // Per-day NPC identity rates
  const NPC_RATES = {
    partySwitch:   1 / 900,
    radicalize:    1 / 400,    // × unrest/100
    grudgeFade:    1 / 500,
  };

  // ==========================================================================
  // SHARED UTILITIES (see NPCShared.js)
  // ==========================================================================

  const { nameHash, Rng: PolRng, worldSeed, sampleCount, clamp, ideologyById, seededShuffle } = window.NPCShared;

  // ==========================================================================
  // DISPLAY TEXT
  // ==========================================================================
  // Every archetype field above is an id AND a label. The id stays in the
  // record (other systems match on it and old saves carry it); the label is
  // resolved here, per power, at the moment it is drawn.

  const powerSlug = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  function powerLabel(power, field) {
    if (!power) return "";
    const key = "Politics.power." + powerSlug(power.name) + "." + field;
    if (T.has(key)) return T(key);
    // A nation's own government reads as one (NATION_ARCHETYPE), not as the
    // generic republic a power with no entry of its own falls back to.
    if (power.kind === "nation") {
      const national = "Politics.power.nationalGovernment." + field;
      if (T.has(national)) return T(national);
    }
    const generic = "Politics.power.default." + field;
    if (T.has(generic)) return T(generic);
    return power[field] || "";
  }

  // A line the simulation wrote into the world state. Newer records hold
  // { key, params, count }; anything written before this file was localized
  // holds a finished English string, which is returned as it stands.
  function textOf(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    if (!entry.key) return entry.desc || "";
    if (!T.has(entry.key)) return entry.desc || "";
    return entry.count != null
      ? T.n(entry.key, entry.count, entry.params || {})
      : T(entry.key, entry.params || {});
  }

  const officeLabel = (office) => {
    const key = "Politics.office." + office;
    return T.has(key) ? T(key) : String(office || "");
  };

  // A politician's `office` field holds whichever of the power's own titles
  // they answer to, or a plain state like "deposed". All of them are ids.
  function politicianOffice(power, pol) {
    if (!pol || !pol.office) return "";
    if (power && pol.office === power.headTitle) return powerLabel(power, "headTitle");
    if (power && pol.office === power.electorTitle) return powerLabel(power, "electorTitle");
    const key = "Politics.officeState." + pol.office;
    return T.has(key) ? T(key) : String(pol.office);
  }

  // How a head of state came to the office, as stored on the reign pocket.
  const accessionLabel = (how) => {
    const key = "Politics.accession." + how;
    return T.has(key) ? T(key) : String(how || "?");
  };

  // ==========================================================================
  // TIME HELPERS
  // ==========================================================================

  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  function yearFloatOf(minute) { return EPOCH_YEAR + minute / MINUTES_PER_YEAR; }
  function yearOf(minute) { return Math.floor(yearFloatOf(minute)); }

  function dateStrOf(minute) {
    const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + minute);
    return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function nowMinuteVar() {
    return $gameVariables ? ($gameVariables.value(114) || 0) : 0;
  }

  // ==========================================================================
  // DATA ACCESS
  // ==========================================================================

  function getCountries() {
    const c = window.WorldGen?.Countries;
    return Array.isArray(c) ? c : [];
  }

  function getState() {
    if (!$gameSystem) return null;
    if (!$gameSystem._npcPolitics) {
      $gameSystem._npcPolitics = {
        version: 1,
        lastSimMinute: null,
        powers: {},        // powerName → power state
        nations: {},       // country   → that nation's own government
        identities: {},    // npcName  → political identity
        settlements: {},   // groupName → local offices
      };
    }
    return $gameSystem._npcPolitics;
  }

  function getProfile(name) {
    return $gameSystem?._npcSociety?.[name] ?? null;
  }

  // A creature holds no citizenship, no party and no vote. NPCCreature owns
  // the boundary; this is just the one place the sim asks it, so every reader
  // here gets the same answer.
  function isNonSentientName(name) {
    const NC = window.NPCCreature;
    return !!(NC && NC.isNonSentientByName && NC.isNonSentientByName(name));
  }

  // A child of the world (NPCLifeSim FAMILY) holds no citizenship yet.
  function isMinorName(name) {
    return !!window.NPCLifeSim?.isMinor?.(name);
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // The first Countries.json entry whose normalised name is norm(name), off an
  // index built once per countries list. resolveGroupPolity is asked for every
  // thought a person has on the map, and the find this replaces normalised
  // every country's name, and the name asked, on every call.
  let _countryIndexSrc = null, _countryIndexLen = -1, _countryIndex = null;
  function countryByName(countries, name) {
    if (_countryIndexSrc !== countries || _countryIndexLen !== countries.length) {
      _countryIndex = new Map();
      for (const c of countries) {
        const k = norm(c.country);
        if (!_countryIndex.has(k)) _countryIndex.set(k, c);
      }
      _countryIndexSrc = countries;
      _countryIndexLen = countries.length;
    }
    return _countryIndex.get(norm(name)) || null;
  }

  function canonicalFaction(name) {
    const n = String(name || "").trim();
    return FACTION_ALIASES[n] || n;
  }

  // name → home group, harvested from each group's NPC template pool
  // (same approach as NPCLifeSimulator.collectPopulation).
  let _populationCache = null;
  let _populationCacheKey = "";

  function collectPopulation() {
    const groups = $gameSystem?._npcMapGroups || {};
    const society = $gameSystem?._npcSociety || {};
    const groupNames = Object.keys(groups);
    const cacheKey = groupNames.join("|") + "::" + Object.keys(society).length;
    if (_populationCache && _populationCacheKey === cacheKey) return _populationCache;

    const population = {}; // name → groupName
    for (const groupName of groupNames) {
      let pool = [];
      try { pool = window.NPCSystem?.getNPCPool?.(groupName) || []; } catch (_) { pool = []; }
      for (const tpl of pool) {
        const evName = tpl?.eventData?.name;
        if (evName && population[evName] === undefined) population[evName] = groupName;
      }
    }
    for (const [name, profile] of Object.entries(society)) {
      if (profile?._homeGroupName) population[name] = profile._homeGroupName;
      else if (population[name] === undefined) population[name] = null;
    }

    _populationCache = population;
    _populationCacheKey = cacheKey;
    return population;
  }

  // ==========================================================================
  // IDEOLOGY HELPERS
  // ==========================================================================

  function ideologyDistance(a, b) {
    let d = 0;
    for (const ax of AXES) d += Math.abs((a?.[ax] ?? 0) - (b?.[ax] ?? 0));
    return d / AXES.length; // 0..200, typically < 80
  }

  function jitterIdeology(base, rng, spread) {
    const out = {};
    for (const ax of AXES) out[ax] = clamp(Math.round((base?.[ax] ?? 0) + (rng.next() * 2 - 1) * spread), -100, 100);
    return out;
  }

  // ==========================================================================
  // POLITICIAN / PARTY FACTORIES
  // ==========================================================================

  // How often a polity reaches into the book of leaders rather than inventing
  // somebody: most of the time, but not always. A century of politics that only
  // ever seated the names history wrote down would have no room left for
  // anybody else, and a world where a real person is merely LIKELY is a world
  // where the elections still mean something.
  const REAL_CANDIDATE_CHANCE = 0.72;

  // A hyperpower is not a parish council: the seat of a bloc is where the
  // century's written-down names actually stood, so a power reaches into the
  // book far more readily than one of its nations does. A nation keeps the old
  // odds, which is what leaves room for anybody the world invented.
  const REAL_CANDIDATE_CHANCE_POWER = 0.93;

  function realCandidateChance(power) {
    return (power && power.kind === "nation")
      ? REAL_CANDIDATE_CHANCE : REAL_CANDIDATE_CHANCE_POWER;
  }

  // Everyone the book of leaders (Leaders.json, through HistorySimulator) has
  // standing for this polity right now: somebody of one of its nations, whose
  // years cover the date, who is not already seated here, and who does not hold
  // the moral office - a guide governs nothing.
  function historicalCandidates(power, nowMinute) {
    const HM = window.HistoryManager;
    if (!HM || typeof HM.listLeaderRecords !== "function") return [];
    const year = yearOf(nowMinute);
    const nations = new Set();
    if (power.kind === "nation") nations.add(power.name);
    else {
      (power.memberCountries || []).forEach(n => nations.add(n));
      if (power.homeNation) nations.add(power.homeNation);
    }
    const seated = new Set(Object.values(power.politicians || {}).map(p => p.name));
    return HM.listLeaderRecords().filter(rec =>
      rec && rec.name && rec.country && nations.has(rec.country) && !rec.moralGuide &&
      Array.isArray(rec.years) && year >= rec.years[0] && year <= rec.years[1] &&
      !seated.has(rec.name));
  }

  // A politician. Written down or made up: a name out of the book comes with
  // the record behind it and with better numbers than anybody invented, which
  // is what being the person history picked looks like from inside the game.
  function makePolitician(power, rng, nowMinute, opts = {}) {
    const id = `pol_${power.name.replace(/[^A-Za-z0-9]/g, "")}_${++power.politicianCounter}`; // i18n-ignore: record id
    const age = opts.age ?? rng.int(34, 72);

    let record = null;
    if (opts.historical !== false && rng.next() < realCandidateChance(power)) {
      const pool = historicalCandidates(power, nowMinute);
      if (pool.length) record = pool[rng.int(0, pool.length - 1)];
    }

    let name;
    if (record) {
      name = record.name;
    } else {
      const bank = NAME_BANKS[power.nameFlavor] || NAME_BANKS.generic;
      const title = rng.pick(bank.title);
      name = `${title ? title + " " : ""}${rng.pick(bank.first)} ${rng.pick(bank.last)}`;
    }

    // The two stat bands. A real leader is not merely likelier to be seated,
    // they are harder to beat once they are: charisma and cunning decide
    // elections, and history's own people start well above the invented ones.
    const stat = record
      ? (lo, hi) => rng.int(Math.round(lo + (hi - lo) * 0.45), hi)
      : (lo, hi) => rng.int(lo, hi);

    const creed = record && record.ideologyKey
      ? ideologyById(String(record.ideologyKey).replace(/^ideology\./, ""))
      : null;
    const baseIdeology = (creed && creed.axes) || opts.ideology || power.baseline;

    power.politicians[id] = {
      id, name,
      birthYearFloat: yearFloatOf(nowMinute) - age - rng.next(),
      charisma:  stat(15, 95),
      integrity: stat(5, 95),
      cunning:   stat(10, 95),
      ambition:  stat(20, 100),
      strength:  stat(10, 95),   // moots
      intellect: stat(10, 95),   // examinations
      divinity:  stat(10, 95),   // ascension tournaments
      ideology:  jitterIdeology(baseIdeology, rng, record ? 8 : (opts.spread ?? 35)),
      partyId:   opts.partyId ?? null,
      approval:  record ? rng.int(45, 75) : rng.int(35, 65),
      scandals:  0,
      alive:     true,
      // The illness that will kill them, once one has been diagnosed:
      // { diseaseId, diseaseName, sinceMinute, untilMinute }.
      illness:   null,
      office:    null,
      // Which of the two this is, and the book entry behind them when there is
      // one: the wiki files a written-down leader under Leaders and an invented
      // one under Politicians (NPCEmpathize).
      real:      !!record,
      leaderId:  record ? record.id : null,
    };
    return power.politicians[id];
  }

  // `realEntry`, when given, is one of Parties.json's { name, country,
  // ideologyId, founded } records: a named national party stands in place of the
  // old procedurally-composed name, and its platform is read off the creed it
  // carries (Ideology.json) rather than jittered blindly off the power's own
  // baseline, so an opposition party can genuinely oppose.
  function makeParty(power, rng, nowMinute, index, realEntry) {
    const creed = ideologyById(realEntry.ideologyId);
    const platform = jitterIdeology(creed ? creed.axes : power.baseline, rng, 12);
    const id = `party_${power.name.replace(/[^A-Za-z0-9]/g, "")}_${index}`; // i18n-ignore: record id
    const foundedYear = realEntry.founded != null
      ? Math.min(realEntry.founded, yearOf(nowMinute))
      : yearOf(nowMinute) - rng.int(3, 60);
    const party = {
      id, name: realEntry.name, platform,
      country: realEntry.country || null,
      ideologyId: realEntry.ideologyId || null,
      leaderId: null,
      foundedYear,
      momentum: 0,
      seats: 0,
      lastShare: 0,
      funds: rng.int(100_000_000, 5_000_000_000),
    };
    party.leaderId = makePolitician(power, rng, nowMinute, { ideology: platform, spread: 15, partyId: id }).id;
    return party;
  }


  function politicianAge(pol, nowMinute) {
    return Math.max(0, Math.floor(yearFloatOf(nowMinute) - pol.birthYearFloat));
  }

  // A political class is never only its parties: some of the sharpest players
  // in every one of these systems answer to no faction at all. Rolled once
  // per election, at INDEPENDENT_CHANCE, into whichever engine below draws its
  // candidates from `power.parties`; `partyId: null` is already what a real
  // party-affiliated candidate holds the moment the game classes them as one,
  // so nothing downstream needs to special-case an independent (partyById,
  // the wiki, the coalition math all already read a null partyId as "none").
  const INDEPENDENT_CHANCE = 0.22;

  function spawnIndependent(power, rng, minute, spread = 45) {
    return makePolitician(power, rng, minute, { spread, partyId: null });
  }

  // ---- terminal illness ----------------------------------------------------
  // A politician does not only get shot or get old: some of them are told they
  // are dying and then govern anyway until it takes them. Only a MORTAL illness
  // is ever handed out - the disease table's own `lethal` band, or a case
  // fatality ratio a tenth of the sick and worse - because a head of state with
  // a cold is not history. The diagnosis is announced the day it is made, and
  // the illness runs for months before the death it ends in, so the world reads
  // about a dying leader before it reads about a dead one.
  const ILLNESS_DAY_AT_50 = 0.000012;   // daily odds at fifty
  const ILLNESS_AGE_SCALE = 12;         // years of age per doubling
  const ILLNESS_MIN_AGE = 30;
  const ILLNESS_MIN_DAYS = 60;
  const ILLNESS_MAX_DAYS = 900;

  let _mortalDiseases = null;
  function mortalDiseases() {
    if (_mortalDiseases) return _mortalDiseases;
    const DS = window.DiseaseSystem;
    const all = (DS && typeof DS.all === "function" && DS.all()) ||
      ((window.Health && window.Health.Diseases && window.Health.Diseases.diseases) || []);
    _mortalDiseases = all.filter(d => d && d.id && !d.stageOnly &&
      (d.severity === "lethal" || (typeof d.cfr === "number" && d.cfr >= 0.1)));
    return _mortalDiseases;
  }

  // The world's chronicle is told about a dying head of state, and about the
  // death itself, in the same words HistorySimulator writes them in - a leader
  // the book never named still belongs in the century's record.
  function recordIllnessInHistory(descKey, power, pol, disease, minute, extra) {
    const HM = window.HistoryManager;
    if (!HM || typeof HM.recordEvent !== "function") return;
    const params = Object.assign({
      leader: pol.name, place: power.name,
      disease: (typeof HM.diseaseRef === "function")
        ? HM.diseaseRef(disease.id, disease.name) : disease.name,
    }, extra || {});
    HM.recordEvent({
      date: dateStrOf(minute), category: "political", type: "diagnosis",
      descKey, descParams: params,
    });
  }

  // Single place every politician death goes through, so the wiki can always
  // show a date (and cause) of death.
  function killPolitician(power, pol, minute, cause) {
    pol.alive = false;
    pol.deathMinute = minute;
    pol.deathDate = dateStrOf(minute);
    pol.deathCause = cause || null;
    if (pol.office === power.headTitle) pol.office = null;
    // A politician who is also a person in the world dies there too (REAL
    // POLITICIANS). killNpc asks back through onPersonDied, which finds the
    // record already closed and leaves it alone.
    if (pol.npcName) buryPerson(pol, cause);
  }

  // Permanent head-of-state pockets: every transfer of the top office (election,
  // coup, succession...) closes the previous reign and opens a new one.
  function recordHead(power, minute, head, how) {
    power.headHistory = power.headHistory || [];
    const prev = power.headHistory[0];
    if (prev && prev.toMinute == null) {
      prev.toMinute = minute;
      prev.endDate = dateStrOf(minute);
    }
    if (!head) return;
    if (prev && prev.polId === head.id) {
      // Same ruler confirmed in office, reopen the reign instead of stacking terms.
      prev.toMinute = null;
      prev.endDate = null;
      return;
    }
    power.headHistory.unshift({
      polId: head.id, name: head.name, title: power.headTitle,
      fromMinute: minute, date: dateStrOf(minute), how,
      toMinute: null, endDate: null,
    });
    if (power.headHistory.length > 60) power.headHistory.pop();
  }

  // ==========================================================================
  // POWER BOOTSTRAP
  // ==========================================================================

  function discoverHyperpowers() {
    const found = new Set();
    for (const c of getCountries()) {
      for (const field of ["faction", "controller"]) {
        const f = canonicalFaction(c[field]);
        if (f && f !== "Neutral") found.add(f);
      }
    }
    if (!hordeExists()) found.delete(GOBLIN_HORDE);
    for (const name of Object.keys(OFFWORLD_POWERS)) found.add(name);
    // Every floor world that seats a government seats it here.
    for (const world of governedTowerWorlds()) found.add(world.powerName);
    return [...found].sort();
  }

  // The seat of a power, read from Hyperpowers.json. World generation may never
  // take it off them (HistorySimulator), and its parties are the core of their
  // assembly here.
  function homeNationOf(powerName) {
    const book = window.WorldGen?.Hyperpowers?.hyperpowers || {};
    for (const [name, data] of Object.entries(book)) {
      if (canonicalFaction(name) === powerName && data.homeNation) return data.homeNation;
    }
    return null;
  }

  // A power that holds no ground and takes no part in the world's affairs
  // (Hyperpowers.json "secluded" - the Gods). It seats its own bench and
  // nobody else's, whatever nation happens to name it as its faction.
  function isSecludedPower(powerName) {
    const book = window.WorldGen?.Hyperpowers?.hyperpowers || {};
    for (const [name, data] of Object.entries(book)) {
      if (canonicalFaction(name) === powerName) return data.secluded === true;
    }
    return false;
  }

  function memberCountriesOf(powerName) {
    // The Gods hold nothing: Italy names them as its faction and still governs
    // itself, so their assembly is never filled with Italian parties.
    if (isSecludedPower(powerName)) return [];
    // An offworld power's "countries" are its worlds, and no conquest on Earth
    // moves them, so they are answered before the map is consulted at all.
    if (OFFWORLD_POWERS[powerName]) return OFFWORLD_POWERS[powerName].slice();
    // A floor world holds exactly itself, and no conquest anywhere reaches it.
    const towerWorld = towerWorldByPower(powerName);
    if (towerWorld) return [towerWorld.name];
    // Prefer the history simulation's final map: conquests/liberations during
    // world generation reassign nations between hyperpowers.
    const simStates = window.HistoryManager?.getNationsState?.() || null;
    if (simStates && Object.keys(simStates).length) {
      const owned = Object.keys(simStates)
        .filter(n => canonicalFaction(simStates[n]?.controller) === powerName);
      if (owned.length) return owned;
    }
    return getCountries()
      .filter(c => canonicalFaction(c.faction) === powerName || canonicalFaction(c.controller) === powerName)
      .map(c => c.country);
  }

  function pushPowerEvent(power, minute, type, key, params) {
    power.events.unshift({ minute, date: dateStrOf(minute), type, key, params });
    if (power.events.length > EVENT_LOG_CAP) power.events.pop();
  }

  // A NATION is a polity exactly as a hyperpower is: its own parties, its own
  // assembly, its own head of state, elected, deposed, scandalised and buried by
  // the same machinery. What it does not have is a foreign policy - the bloc
  // above it has that. A nation under an authoritarian power inherits its
  // rigging and something of its politics, which is what being held by it means.
  // A bloc's assembly is mostly its capital's own politics: seven seats in ten
  // belong to the parties of the nation the power is seated in, and the other
  // three are shared out between the lists of every nation it holds. A power
  // that holds nothing but its seat (or that has no seat at all) fills the
  // whole chamber from the one bench it has.
  const HOME_SEAT_SHARE = 0.70;

  const NATION_ARCHETYPE = {
    govType: "national government", system: "parliamentary", headTitle: "Head of Government",
    legislature: "National Assembly", partyKind: "party", seats: 300, termDays: 1460,
    baseline: { econ: 0, auth: 10, trad: 15, mil: 10, myst: 0 },
    rigging: 0.05, coupSusceptibility: 0.45, scandalSensitivity: 1.1,
    nameFlavor: "generic",
  };

  function nationArchetype(state, countryName) {
    const arch = Object.assign({}, NATION_ARCHETYPE);
    const holder = state.powers[canonicalFaction(controllerOfCountry(countryName))];
    if (holder) {
      // Held ground is governed the way its holder governs: the same appetite
      // for rigging a ballot, and a politics pulled halfway toward theirs.
      arch.rigging = Math.max(arch.rigging, holder.rigging * 0.8);
      arch.baseline = {};
      for (const ax of AXES) arch.baseline[ax] = Math.round(((NATION_ARCHETYPE.baseline[ax] || 0) + (holder.baseline[ax] || 0)) / 2);
      arch.nameFlavor = holder.nameFlavor;
    }
    return arch;
  }

  // Who holds a nation right now: the world simulation's answer first, the
  // country table's second. A `faction` in Countries.json counts as much as a
  // `controller` - a nation that names a hyperpower is part of it from day one.
  function controllerOfCountry(countryName) {
    const sim = window.HistoryManager?.getNationState?.(countryName);
    if (sim && sim.controller && sim.controller !== "Neutral") return sim.controller;
    const entry = getCountries().find(c => c.country === countryName);
    if (!entry) return "Neutral";
    if (entry.controller && entry.controller !== "Neutral") return entry.controller;
    return entry.faction && entry.faction !== "Neutral" ? entry.faction : "Neutral";
  }

  function bootstrapNation(state, countryName, nowMinute) {
    if (!countryName) return null;
    state.nations = state.nations || {};
    if (state.nations[countryName]) return state.nations[countryName];
    if (!nationalParties(countryName).length) return null;   // no ballot, no assembly
    const nation = buildPolity(state, countryName, nationArchetype(state, countryName), nowMinute, {
      kind: "nation",
      seedWord: "nation:",
      countries: [countryName],
      homeNation: countryName,
    });
    state.nations[countryName] = nation;
    return nation;
  }

  function bootstrapPower(state, powerName, nowMinute) {
    const arch = ARCHETYPES[powerName] || towerArchetypeFor(powerName) || FALLBACK_ARCHETYPE;
    const power = buildPolity(state, powerName, arch, nowMinute, {
      kind: "power",
      seedWord: "power:",
      countries: memberCountriesOf(powerName),
      homeNation: homeNationOf(powerName),
    });
    state.powers[powerName] = power;
    return power;
  }

  function buildPolity(state, powerName, arch, nowMinute, opts) {
    const rng = new PolRng(worldSeed() ^ nameHash(opts.seedWord + powerName));
    const power = {
      name: powerName,
      kind: opts.kind,
      govType: arch.govType, system: arch.system,
      headTitle: arch.headTitle, legislature: arch.legislature,
      partyKind: arch.partyKind, seats: arch.seats, termDays: arch.termDays,
      electorCount: arch.electorCount || 0, electorTitle: arch.electorTitle || "Elector", // i18n-ignore: id, drawn through powerLabel
      rigging: arch.rigging, coupSusceptibility: arch.coupSusceptibility,
      scandalSensitivity: arch.scandalSensitivity, nameFlavor: arch.nameFlavor,
      baseline: jitterIdeology(arch.baseline, rng, 8),
      memberCountries: opts.countries,
      // The nation this polity is seated in (Hyperpowers.json "homeNation", or
      // the nation itself). Its parties always stand in this assembly and are
      // weighted there.
      homeNation: opts.homeNation,
      politicianCounter: 0,
      politicians: {},
      parties: [],
      electors: [],          // politician ids, conclaves / plenums
      headId: null,
      rulingPartyId: null,
      coalition: [],
      state: {
        legitimacy: rng.int(40, 70), stability: rng.int(45, 75),
        unrest: rng.int(5, 30), economyMood: rng.int(40, 65),
        treasury: rng.int(100_000_000_000, 2_000_000_000_000),
      },
      policies: {
        taxRate: rng.int(8, 30), censorship: 0, conscription: 0,
        welfare: rng.int(20, 60), festivals: rng.int(20, 60), curfew: false,
      },
      electionCounter: 0,
      nextElectionMinute: null,
      termStartMinute: null,
      elections: [],
      events: [],
      rumors: [],
      headHistory: [],
    };

    // The bench: every party of every nation this power holds, its own seat's
    // among them (syncPowerParties). Nothing is invented for a power that holds
    // real ground - the assembly is made of the nations in it.
    syncPowerParties(state, power, nowMinute);

    // Elite electorate for conclave/plenum systems
    for (let i = 0; i < power.electorCount; i++) {
      const elector = makePolitician(power, rng, nowMinute, { spread: 25 });
      elector.office = power.electorTitle;
      power.electors.push(elector.id);
    }

    // Policies start aligned with the seeded ruling platform (set below).
    const termMinutes = power.termDays * MINUTES_PER_DAY;

    // Seed two past elections so the world starts with political history,
    // then schedule the next one, possibly already due, which the catch-up
    // loop will resolve naturally.
    let electionMinute = nowMinute - 2 * termMinutes;
    for (let i = 0; i < 2; i++) {
      resolveElection(state, power, electionMinute, rng, { historical: true });
      electionMinute += termMinutes;
    }
    power.nextElectionMinute = electionMinute;

    // The office the world is written around: whoever is named here won every
    // election that was held before the first day, sits at the head of the
    // ruling party, and cannot die in office.
    const seated = SEATED_ON_DAY_ONE[powerName];
    if (seated) {
      const rulingParty = partyById(power, power.rulingPartyId) || power.parties[0];
      const head = makePolitician(power, rng, nowMinute, {
        ideology: rulingParty ? rulingParty.platform : power.baseline,
        spread: 10, partyId: rulingParty ? rulingParty.id : null, age: 62,
      });
      head.name = seated;
      head.protected = true;
      head.approval = 68;
      // Whoever the world is written around IS the person history wrote down,
      // however this office was filled: the wiki files them under Leaders with
      // the rest of the book rather than among the invented politicians.
      head.real = true;
      head.leaderId = window.HistoryManager?.getLeaderRecord?.(seated)?.id || null;
      if (rulingParty) rulingParty.leaderId = head.id;
      const previous = power.politicians[power.headId];
      if (previous && previous.office === power.headTitle) previous.office = null;
      power.headId = head.id;
      head.office = power.headTitle;
      recordHead(power, nowMinute, head, "elected");
    }

    pushPowerEvent(power, nowMinute, "founding", "Politics.event.founding", {
      power: powerName,
      govType: powerLabel(power, "govType"),
      n: power.memberCountries.length,
    });
    return power;
  }

  // Every government in the world: the blocs and the nations inside them. Both
  // hold elections, both bury heads of state, both are simulated by the same
  // pass - see catchUp.
  function allPolities(state) {
    return Object.values(state.powers).concat(Object.values(state.nations || {}));
  }

  // A monster world (WorldModes.monsterPowersOnly) has politics only where a
  // monster power governs: a polity whose naming register is a warband's
  // (nameFlavor "goblin": the warband worlds of the tower). Nobody else holds
  // an office there, and where no monster power exists at all political time
  // does not pass. The Goblin Horde itself does not exist in a monster world
  // (WorldModes.hordeExists), so it and the nations it would hold are never
  // a monster power.
  const MONSTER_POWER_FLAVORS = new Set(["goblin"]); // i18n-ignore: nameFlavor ids
  const GOBLIN_HORDE = "Goblin Horde"; // i18n-ignore: Hyperpowers.json key
  function hordeExists() {
    const WMo = window.NPCShared?.WorldModes;
    return !WMo || typeof WMo.hordeExists !== "function" || !!WMo.hordeExists();
  }
  function isMonsterPolity(polity) {
    if (!polity || !MONSTER_POWER_FLAVORS.has(polity.nameFlavor)) return false;
    return hordeExists() || (polity.power || polity.name) !== GOBLIN_HORDE;
  }
  function monsterPowersOnly() {
    const WMo = window.NPCShared?.WorldModes;
    return !!(WMo && WMo.monsterPowersOnly());
  }
  // The governments the world simulates: every one, or a monster world's own.
  function livePolities(state) {
    const all = allPolities(state);
    return monsterPowersOnly() ? all.filter(isMonsterPolity) : all;
  }

  // A nation's own government is written the first time the world has a reason
  // to care about it: somebody from it exists, or it is the seat of a power.
  // Writing all 116 up front would put a thousand politicians in every world
  // file for nations no savegame ever visits.
  function ensureNation(state, countryName, nowMinute) {
    if (!countryName) return null;
    state.nations = state.nations || {};
    return state.nations[countryName] || bootstrapNation(state, countryName, nowMinute);
  }

  function ensureSeatNations(state, nowMinute) {
    for (const power of Object.values(state.powers)) {
      if (power.homeNation) ensureNation(state, power.homeNation, nowMinute);
    }
  }

  function ensurePowers(state, nowMinute) {
    for (const powerName of discoverHyperpowers()) {
      if (!state.powers[powerName]) bootstrapPower(state, powerName, nowMinute);
    }
  }

  // ==========================================================================
  // ELECTION ENGINES
  // ==========================================================================

  function pushElection(power, record) {
    power.elections.unshift(record);
    if (power.elections.length > ELECTION_LOG_CAP) power.elections.pop();
  }

  function partyById(power, id) {
    return power.parties.find(p => p.id === id) || null;
  }

  function scandalPenalty(pol) {
    return 1 / (1 + 0.25 * (pol?.scandals ?? 0));
  }

  // Local NPC ballots: every identity sworn to this power may turn out and
  // vote for the platform nearest their own ideology. Returns partyId → votes
  // and stamps votedLast on each voter.
  function collectNpcBallots(state, power, minute, electionIdx) {
    const ballots = {};
    let voters = 0;
    for (const [npcName, identity] of Object.entries(state.identities)) {
      // A hyperpower is voted by everyone who answers to it; a nation only by
      // the people who are from it.
      if (power.kind === "nation" ? identity.country !== power.name : identity.power !== power.name) continue;
      const rng = new PolRng(worldSeed() ^ nameHash(npcName) ^ (minute >>> 0));
      const turnoutChance = clamp(identity.engagement / 100 + 0.15, 0.05, 0.95);
      if (rng.next() > turnoutChance) continue;
      // Nobody votes outside their own nation: the ballot in front of them
      // holds the parties of the country they are from, and if their nation
      // stands none in this assembly they do not vote at all.
      let best = null, bestD = Infinity;
      for (const party of ballotFor(power, identity.country)) {
        const d = ideologyDistance(identity.ideology, party.platform)
          - (power.politicians[party.leaderId]?.charisma ?? 50) * 0.05
          - (identity.partyId === party.id ? 6 : 0);
        if (d < bestD) { bestD = d; best = party; }
      }
      if (!best) continue;
      ballots[best.id] = (ballots[best.id] || 0) + 1;
      voters++;
      identity.votedLast = { minute, electionIdx, partyId: best.id, power: power.name };
    }
    return { ballots, voters };
  }

  // Largest-remainder seat allocation. The shares are weights within whatever
  // list is passed, so a chamber can be filled pool by pool (see below): the
  // list's own shares are normalised against each other, not against 100.
  function allocateSeats(results, totalSeats) {
    let assigned = 0;
    const remainders = [];
    const total = results.reduce((a, r) => a + (r.share || 0), 0);
    for (const r of results) {
      const exact = total > 0 ? ((r.share || 0) / total) * totalSeats : totalSeats / results.length;
      r.seats = Math.floor(exact);
      assigned += r.seats;
      remainders.push([exact - r.seats, r]);
    }
    remainders.sort((a, b) => b[0] - a[0]);
    for (let i = 0; assigned < totalSeats && i < remainders.length; i++, assigned++) remainders[i][1].seats++;
  }

  // The chamber, filled the way a bloc's chamber is filled: the capital's
  // benches first at their fixed share, the held nations sharing the rest.
  function allocateChamber(power, results) {
    const home = results.filter(r => (partyById(power, r.partyId) || {}).homeBench);
    const rest = results.filter(r => !(partyById(power, r.partyId) || {}).homeBench);
    if (!home.length || !rest.length || power.kind !== "power") {
      allocateSeats(results, power.seats);
      return;
    }
    const homeSeats = Math.round(power.seats * HOME_SEAT_SHARE);
    allocateSeats(home, homeSeats);
    allocateSeats(rest, power.seats - homeSeats);
  }

  const ElectionEngines = {
    // --- Popular vote with seats, coalitions, NPC ballots -------------------
    parliamentary(state, power, minute, rng, record) {
      const incumbent = power.rulingPartyId;
      const scores = power.parties.map(party => {
        const leader = power.politicians[party.leaderId];
        let s = Math.exp(-ideologyDistance(power.baseline, party.platform) / 40);
        s *= 1 + (leader?.charisma ?? 50) / 200;
        s *= 1 + party.momentum / 120;
        s *= scandalPenalty(leader);
        if (party.id === incumbent) {
          s *= power.state.legitimacy > 55 ? 1.18 : power.state.legitimacy < 40 ? 0.78 : 1;
        }
        s *= 0.8 + rng.next() * 0.4;
        // Nothing weights the capital here any more: its share of the chamber
        // is fixed, and allocateChamber hands it out (HOME_SEAT_SHARE).
        return { party, s };
      });

      const { ballots, voters } = collectNpcBallots(state, power, minute, record.idx);
      const synthTotal = 2000;
      const sSum = scores.reduce((a, x) => a + x.s, 0) || 1;
      const tally = {};
      for (const { party, s } of scores) tally[party.id] = (s / sSum) * synthTotal;
      for (const [pid, v] of Object.entries(ballots)) tally[pid] = (tally[pid] || 0) + v * 3;
      const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;

      record.results = power.parties
        .map(p => ({ partyId: p.id, name: p.name, share: +(100 * (tally[p.id] || 0) / total).toFixed(1), seats: 0 }))
        .sort((a, b) => b.share - a.share);
      allocateChamber(power, record.results);

      record.turnout = clamp(Math.round(45 + power.state.unrest * 0.25 + rng.int(-5, 10)), 30, 95);
      record.npcVoters = voters;

      // The chamber decides, so the winner is whoever came out of it with the
      // most seats rather than the most votes: a provincial landslide inside a
      // three-tenths pool does not take a capital's assembly.
      record.results.sort((a, b) => (b.seats - a.seats) || (b.share - a.share));
      // No party returned a seat: nothing to install, and [0] would throw.
      if (!record.results.length) return null;
      const winner = record.results[0];
      const winnerParty = partyById(power, winner.partyId);
      power.coalition = [winner.partyId];
      let seatSum = winner.seats;
      if (seatSum <= power.seats / 2) {
        const others = record.results.slice(1)
          .sort((a, b) => ideologyDistance(winnerParty.platform, partyById(power, a.partyId).platform)
                        - ideologyDistance(winnerParty.platform, partyById(power, b.partyId).platform));
        for (const o of others) {
          if (seatSum > power.seats / 2) break;
          power.coalition.push(o.partyId);
          seatSum += o.seats;
          record.notes.push({ key: "Politics.note.coalition", params: { party: o.name } });
        }
      }
      this._installWinner(power, minute, winnerParty, record);
      for (const r of record.results) {
        const p = partyById(power, r.partyId);
        p.seats = r.seats; p.lastShare = r.share;
        p.momentum = clamp(p.momentum * 0.5 + (r.partyId === winner.partyId ? 12 : -6), -50, 50);
      }
    },

    // --- Elite electors, multiple ballots, life-flavored term ---------------
    conclave(state, power, minute, rng, record) {
      let candidates = power.parties.map(p => power.politicians[p.leaderId]).filter(p => p && p.alive);
      const electors = power.electors.map(id => power.politicians[id]).filter(p => p && p.alive);
      // Electors are already independent (no order/brotherhood behind them,
      // see bootstrapPower); one may stand as papabile in their own right
      // rather than behind a party's own nominee. An elector's ideology
      // clusters close to every other elector's by construction, which is
      // exactly the compromise-candidate advantage a real conclave gives an
      // outsider, so this is deliberately a real chance and not a token one.
      if (electors.length && rng.next() < INDEPENDENT_CHANCE) {
        const outsider = rng.pick(electors);
        if (!candidates.includes(outsider)) candidates = candidates.concat([outsider]);
      }
      // Nobody left standing: no leader alive in any party and no outsider drawn.
      // Every engine below indexes the sorted list, so this has to stop here
      // rather than throw inside the world catch-up and repeat every frame.
      if (!candidates.length || !electors.length) return null;

      let support = {};
      for (const c of candidates) support[c.id] = 0;
      let ballotCount = 0, winnerPol = null;
      for (ballotCount = 1; ballotCount <= 7; ballotCount++) {
        // The bandwagon reads the LAST ballot's tally, not the one being cast.
        const previous = support;
        support = {};
        for (const c of candidates) support[c.id] = 0;
        for (const elector of electors) {
          let best = null, bestS = -Infinity;
          for (const c of candidates) {
            const s = -ideologyDistance(elector.ideology, c.ideology)
              + c.cunning * 0.3 + c.ambition * 0.1
              + ballotCount * (previous[c.id] || 0) * 0.4   // bandwagon over ballots
              + rng.next() * 14;
            if (s > bestS) { bestS = s; best = c; }
          }
          if (best) support[best.id]++;
        }
        const sorted = candidates.slice().sort((a, b) => support[b.id] - support[a.id]);
        if (support[sorted[0].id] >= Math.ceil(electors.length * 2 / 3)) { winnerPol = sorted[0]; break; }
        winnerPol = sorted[0]; // plurality fallback if no supermajority by ballot 7
      }
      if (!winnerPol) return null;
      record.notes.push({
        key: "Politics.note.conclaveBallots",
        count: Math.min(ballotCount, 7),
        params: { electors: powerLabel(power, "electorTitlePlural") },
      });
      const totalVotes = electors.length || 1;
      record.results = candidates
        .map(c => ({ candidateId: c.id, name: c.name, partyId: c.partyId, share: +(100 * (support[c.id] || 0) / totalVotes).toFixed(1) }))
        .sort((a, b) => b.share - a.share);
      this._installWinner(power, minute, partyById(power, winnerPol.partyId), record, winnerPol);
    },

    // --- Rigged plenum: incumbent usually survives; purges otherwise --------
    plenum(state, power, minute, rng, record) {
      const incumbentParty = partyById(power, power.rulingPartyId) || power.parties[0];
      const incumbentHoldChance = power.rigging * clamp(power.state.legitimacy / 60, 0.3, 1.2);
      let winnerParty = incumbentParty;
      if (rng.next() > incumbentHoldChance) {
        const rivals = power.parties.filter(p => p !== incumbentParty);
        winnerParty = rivals.length ? rng.pick(rivals) : incumbentParty;
        if (winnerParty !== incumbentParty) {
          record.notes.push({
            key: "Politics.note.purged",
            params: { party: incumbentParty.name, legislature: powerLabel(power, "legislature") },
          });
          const oldLeader = power.politicians[incumbentParty.leaderId];
          if (oldLeader) { oldLeader.approval = clamp(oldLeader.approval - 30, 0, 100); oldLeader.office = "disgraced"; }
        }
      }
      const officialShare = 96 + rng.next() * 3.9;
      record.results = power.parties
        .map(p => ({ partyId: p.id, name: p.name, share: p === winnerParty ? +officialShare.toFixed(1) : +((100 - officialShare) / Math.max(1, power.parties.length - 1)).toFixed(1) }))
        .sort((a, b) => b.share - a.share);
      record.turnout = 99;
      record.notes.push({ key: "Politics.note.officialResults" });
      // Attendance is mandatory and the ballot arrives pre-filled.
      for (const identity of Object.values(state.identities)) {
        if (identity.power !== power.name) continue;
        identity.votedLast = { minute, electionIdx: record.idx, partyId: winnerParty.id, power: power.name };
      }
      this._installWinner(power, minute, winnerParty, record);
    },

    // --- Wealth-weighted shareholder meeting ---------------------------------
    shareholder(state, power, minute, rng, record) {
      const tally = {};
      for (const party of power.parties) {
        const leader = power.politicians[party.leaderId];
        tally[party.id] = party.funds * (1 + (leader?.cunning ?? 50) / 150) * scandalPenalty(leader) * (0.8 + rng.next() * 0.4);
      }
      // NPC shareholders vote their wallets
      let voters = 0;
      for (const [npcName, identity] of Object.entries(state.identities)) {
        if (identity.power !== power.name) continue;
        const money = getProfile(npcName)?.money ?? 100;
        let best = null, bestD = Infinity;
        for (const party of power.parties) {
          const d = ideologyDistance(identity.ideology, party.platform);
          if (d < bestD) { bestD = d; best = party; }
        }
        if (best) { tally[best.id] += Math.sqrt(Math.max(1, money)); voters++; }
        identity.votedLast = { minute, electionIdx: record.idx, partyId: best?.id ?? null, power: power.name };
      }
      const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
      record.results = power.parties
        .map(p => ({ partyId: p.id, name: p.name, share: +(100 * tally[p.id] / total).toFixed(1) }))
        .sort((a, b) => b.share - a.share);
      record.turnout = clamp(rng.int(55, 90), 0, 100);
      record.npcVoters = voters;
      record.notes.push({ key: "Politics.note.oneCreditOneVote" });
      if (!record.results.length) return null;
      const winnerParty = partyById(power, record.results[0].partyId);
      winnerParty.funds += Math.round(power.state.treasury * 0.05);
      this._installWinner(power, minute, winnerParty, record);
    },

    // --- Strength contest; losing finalist may be eaten ----------------------
    moot(state, power, minute, rng, record) {
      const champions = power.parties.map(p => power.politicians[p.leaderId]).filter(p => p && p.alive);
      // A lone challenger who answers to no clan at all: strength speaks for
      // itself at a moot, so nobody needs a banner behind them to enter.
      if (rng.next() < INDEPENDENT_CHANCE) champions.push(spawnIndependent(power, rng, minute, 40));
      const scored = champions
        .map(c => ({ c, s: c.strength * 1.2 + c.cunning * 0.6 + rng.next() * 30 }))
        .sort((a, b) => b.s - a.s);
      // Nobody to elect: an empty list would be indexed at [0] below. See conclave.
      if (!scored.length) return null;
      const total = scored.reduce((a, x) => a + x.s, 0) || 1;
      record.results = scored.map(x => ({ candidateId: x.c.id, name: x.c.name, partyId: x.c.partyId, share: +(100 * x.s / total).toFixed(1) }));
      const winner = scored[0].c;
      const runnerUp = scored[1]?.c;
      if (runnerUp && rng.next() < 0.4) {
        killPolitician(power, runnerUp, minute, { key: "Politics.death.wolfpigs" });
        record.notes.push({ key: "Politics.note.mootLoser", params: { name: runnerUp.name } });
        const party = partyById(power, runnerUp.partyId);
        if (party) party.leaderId = makePolitician(power, rng, minute, { ideology: party.platform, spread: 20, partyId: party.id }).id;
      }
      record.notes.push({ key: "Politics.note.biggestWins" });
      this._installWinner(power, minute, partyById(power, winner.partyId), record, winner);
    },

    // --- Divine ascension tournament -----------------------------------------
    tournament(state, power, minute, rng, record) {
      const aspirants = power.parties.map(p => power.politicians[p.leaderId]).filter(p => p && p.alive);
      // A godling with no house behind them, ascending on raw divinity alone.
      if (rng.next() < INDEPENDENT_CHANCE) aspirants.push(spawnIndependent(power, rng, minute, 40));
      const scored = aspirants
        .map(c => ({ c, s: c.divinity * 1.3 + c.charisma * 0.5 + rng.next() * 25 }))
        .sort((a, b) => b.s - a.s);
      // Nobody to elect: an empty list would be indexed at [0] below. See conclave.
      if (!scored.length) return null;
      const total = scored.reduce((a, x) => a + x.s, 0) || 1;
      record.results = scored.map(x => ({ candidateId: x.c.id, name: x.c.name, partyId: x.c.partyId, share: +(100 * x.s / total).toFixed(1) }));
      record.notes.push({ key: "Politics.note.ascension" });
      this._installWinner(power, minute, partyById(power, scored[0].c.partyId), record, scored[0].c);
    },

    // --- Palace succession by intrigue ----------------------------------------
    succession(state, power, minute, rng, record) {
      const heirs = [];
      const heirCount = rng.int(3, 5);
      for (let i = 0; i < heirCount; i++) {
        // A claimant born outside every faction's patronage, backed by
        // nothing but their own blood claim.
        const partyId = rng.next() < INDEPENDENT_CHANCE ? null : rng.pick(power.parties).id;
        heirs.push(makePolitician(power, rng, minute, { age: rng.int(19, 45), spread: 30, partyId }));
      }
      const scored = heirs
        .map(c => ({ c, s: c.cunning * 1.1 + c.ambition * 0.6 + c.charisma * 0.4 + rng.next() * 25 }))
        .sort((a, b) => b.s - a.s);
      // Nobody to elect: an empty list would be indexed at [0] below. See conclave.
      if (!scored.length) return null;
      const total = scored.reduce((a, x) => a + x.s, 0) || 1;
      record.results = scored.map(x => ({ candidateId: x.c.id, name: x.c.name, partyId: x.c.partyId, share: +(100 * x.s / total).toFixed(1) }));
      if (power.state.stability < 40) {
        record.notes.push({ key: "Politics.note.successionWar" });
        power.state.unrest = clamp(power.state.unrest + 20, 0, 100);
        const casualty = scored[scored.length - 1].c;
        killPolitician(power, casualty, minute, { key: "Politics.death.succession" });
        record.notes.push({ key: "Politics.note.successionCasualty", params: { name: casualty.name } });
      } else {
        record.notes.push({ key: "Politics.note.palaceIntrigue" });
      }
      this._installWinner(power, minute, partyById(power, scored[0].c.partyId), record, scored[0].c);
    },

    // --- The Great Examination -------------------------------------------------
    examination(state, power, minute, rng, record) {
      const candidates = power.parties.map(p => power.politicians[p.leaderId]).filter(p => p && p.alive);
      // An independent scholar, sponsored by no school, sitting the paper on
      // their own reading alone.
      if (rng.next() < INDEPENDENT_CHANCE) candidates.push(spawnIndependent(power, rng, minute, 40));
      const scored = candidates
        .map(c => ({ c, s: c.intellect * 1.5 + c.integrity * 0.5 + rng.next() * 10 }))
        .sort((a, b) => b.s - a.s);
      // Nobody to elect: an empty list would be indexed at [0] below. See conclave.
      if (!scored.length) return null;
      const total = scored.reduce((a, x) => a + x.s, 0) || 1;
      record.results = scored.map(x => ({ candidateId: x.c.id, name: x.c.name, partyId: x.c.partyId, share: +(100 * x.s / total).toFixed(1) }));
      record.notes.push({ key: "Politics.note.examinationScore", params: { score: Math.round(scored[0].s) } });
      this._installWinner(power, minute, partyById(power, scored[0].c.partyId), record, scored[0].c);
    },

    // Shared: seat the winner, refresh meters, log the changeover.
    _installWinner(power, minute, winnerParty, record, headPolOverride) {
      let head = headPolOverride || (winnerParty ? power.politicians[winnerParty.leaderId] : null);
      // Every election held before the world opens is won by the person the
      // world opens with, whatever the ballots said (SEATED_ON_DAY_ONE). From
      // the first day forward politics is politics again and they can lose it.
      const seated = SEATED_ON_DAY_ONE[power.name];
      if (seated && minute <= 0) {
        const standing = Object.values(power.politicians).find(p => p.name === seated);
        const rng = new PolRng(worldSeed() ^ nameHash("seated:" + power.name));
        head = standing || makePolitician(power, rng, minute, {
          ideology: winnerParty ? winnerParty.platform : power.baseline,
          spread: 10, partyId: winnerParty ? winnerParty.id : null, age: 62,
        });
        head.name = seated;
        head.protected = true;
        head.alive = true;
        if (winnerParty) { head.partyId = winnerParty.id; winnerParty.leaderId = head.id; }
      }
      // A party whose leader was assassinated or purged between elections goes
      // to the polls behind somebody living. Without this the winner's corpse
      // was installed as head of state and the power stayed headless for the
      // rest of the century, since a dead head never triggers another snap.
      if (winnerParty && (!head || !head.alive)) {
        const rng = new PolRng(worldSeed() ^ nameHash("succession:" + power.name) ^ ((minute >>> 0) || 1));
        head = makePolitician(power, rng, minute, { ideology: winnerParty.platform, spread: 20, partyId: winnerParty.id });
        winnerParty.leaderId = head.id;
      }
      const previousHead = power.politicians[power.headId];
      if (previousHead && previousHead !== head && previousHead.office === power.headTitle) {
        previousHead.office = null;
      }
      power.rulingPartyId = winnerParty?.id ?? null;
      if (!power.coalition.length || power.coalition[0] !== winnerParty?.id) power.coalition = winnerParty ? [winnerParty.id] : [];
      power.headId = head?.id ?? null;
      if (head) { head.office = power.headTitle; head.approval = clamp(head.approval + 10, 0, 100); }
      recordHead(power, minute, head, "elected");
      power.termStartMinute = minute;
      record.winnerPartyId = winnerParty?.id ?? null;
      record.winner = winnerParty?.name ?? "-";
      record.head = head?.name ?? "-";
      power.state.legitimacy = clamp(Math.round(40 + (record.results?.[0]?.share ?? 50) * 0.45), 0, 100);
      power.state.unrest = clamp(power.state.unrest - 12, 0, 100);
    },
  };

  // resolveElection, builds the record, dispatches to the engine, applies
  // aftermath (grudges among losing voters), and logs the event.
  // ==========================================================================
  // WRITTEN-DOWN HEADS OF STATE
  // ==========================================================================
  // Some offices are not up for election in any sense the simulation can
  // model: the book names who holds them and for how long, and one name
  // follows another the way the century actually ran. Leaders.json says so with
  // `headOfState: true`, and the `years` on the same record are the term. North
  // Korea is the whole of this list - three Kims, 1966 to the end of the world's
  // calendar - and every other polity elects, deposes and buries its own heads
  // exactly as before.
  function canonHeadRecord(power, minute) {
    const HM = window.HistoryManager;
    if (!HM || typeof HM.listLeaderRecords !== "function") return null;
    const nations = new Set();
    if (power.kind === "nation") nations.add(power.name);
    else if (power.homeNation) nations.add(power.homeNation);
    if (!nations.size) return null;
    const year = yearOf(minute);
    return HM.listLeaderRecords().find(rec =>
      rec && rec.headOfState && rec.country && nations.has(rec.country) &&
      Array.isArray(rec.years) && year >= rec.years[0] && year <= rec.years[1]) || null;
  }

  // Seats the person the book names, whatever the ballot said. The outgoing
  // holder is not merely retired: these are offices nobody leaves alive, so a
  // canon head whose term has run out dies the way they did.
  function enforceCanonHead(state, power, minute, record) {
    const canon = canonHeadRecord(power, minute);
    if (!canon) return null;
    const held = power.politicians[power.headId];
    if (held && held.name === canon.name) return held;

    if (held && held.canonHead && held.alive) {
      held.protected = false;
      killPolitician(power, held, minute,
        { key: "Politics.death.naturalCauses", params: { age: politicianAge(held, minute) } });
      pushPowerEvent(power, minute, "death", "Politics.event.headDies",
        { name: held.name, age: politicianAge(held, minute), power: power.name,
          title: powerLabel(power, "headTitle") });
    } else if (held && held.office === power.headTitle) {
      held.office = null;
    }

    const rng = new PolRng(worldSeed() ^ nameHash("canonhead:" + canon.name));
    let head = Object.values(power.politicians).find(pol => pol.name === canon.name);
    if (!head) {
      const rulingParty = partyById(power, power.rulingPartyId) || power.parties[0];
      head = makePolitician(power, rng, minute, {
        historical: false, spread: 8,
        ideology: rulingParty ? rulingParty.platform : power.baseline,
        partyId: rulingParty ? rulingParty.id : null,
      });
      head.name = canon.name;
      head.real = true;
      head.leaderId = canon.id || null;
      head.approval = 72;
      if (rulingParty) rulingParty.leaderId = head.id;
    }
    head.alive = true;
    head.illness = null;
    // The book already says when they leave; nothing else may take them first.
    head.canonHead = true;
    head.protected = true;
    head.office = power.headTitle;
    power.headId = head.id;
    recordHead(power, minute, head, "succession");
    if (record) record.head = head.name;
    return head;
  }

  function resolveElection(state, power, minute, rngOuter, opts = {}) {
    // No bench, no ballot. A polity whose nation stands no parties at all
    // (a modded power, a country left out of Parties.json) simply holds no
    // elections rather than electing nobody and losing its head of state.
    if (!power.parties.length) return null;
    const rng = new PolRng(worldSeed() ^ nameHash("election:" + power.name) ^ ((minute >>> 0) || 1));
    const record = {
      idx: ++power.electionCounter,
      minute, date: dateStrOf(minute),
      system: power.system,
      label: opts.label || null,
      results: [], notes: [],
      winner: null, winnerPartyId: null, head: null,
      turnout: null, npcVoters: 0,
    };
    const engine = ElectionEngines[power.system] || ElectionEngines.parliamentary;
    engine.call(ElectionEngines, state, power, minute, rng, record);
    // Whoever the book names holds the office however the vote went.
    enforceCanonHead(state, power, minute, record);
    // The team's own candidates, weighed against the result (candidacies).
    if (!opts.historical) contestPlayerCandidacy(state, power, minute, record);
    pushElection(power, record);
    if (!opts.historical) {
      pushPowerEvent(power, minute, "election",
        record.head !== "-" ? "Politics.event.electionWithHead" : "Politics.event.election",
        { election: labelOf(power), winner: record.winner, head: record.head, title: powerLabel(power, "headTitle") });
      // Losing voters may carry a grudge against the winner.
      for (const [npcName, identity] of Object.entries(state.identities)) {
        if (identity.power !== power.name) continue;
        const v = identity.votedLast;
        if (!v || v.electionIdx !== record.idx || v.partyId === record.winnerPartyId) continue;
        const gr = new PolRng(worldSeed() ^ nameHash("grudge" + npcName) ^ (minute >>> 0));
        if (gr.next() < 0.5) {
          identity.grudgePartyId = record.winnerPartyId;
          pushIdentityEvent(identity, minute, "grudge", "Politics.identity.grudge",
            { winner: record.winner, election: labelOf(power).toLowerCase() });
        }
      }
    }
    return record;
  }

  // The election idiom's name. `system` is the id; only the label moves.
  function labelOf(power) {
    const key = "Politics.election." + (power && power.system);
    return T.has(key) ? T(key) : T("Politics.election.parliamentary");
  }

  // ==========================================================================
  // NATIONAL SIMULATION, one chunk of days per power
  // ==========================================================================

  function rulingPlatform(power) {
    return partyById(power, power.rulingPartyId)?.platform || power.baseline;
  }

  // Policy keys are ids; only the word an edict or referendum uses is display.
  const policyLabel = (key) => {
    const k = "Politics.policy." + key;
    return T.has(k) ? T(k) : String(key || "");
  };

  const rumorKindLabel = (kind) => {
    const k = "Politics.rumorKind." + kind;
    return T.has(k) ? T(k) : String(kind || "");
  };

  // Each platform implies policy targets; edicts move policy toward them.
  function policyTargets(platform) {
    return {
      taxRate:      clamp(Math.round(22 - platform.econ * 0.12), 2, 45),
      censorship:   clamp(Math.round(platform.auth * 0.8), 0, 100),
      conscription: clamp(Math.round(platform.mil * 0.7), 0, 100),
      welfare:      clamp(Math.round(50 - platform.econ * 0.4), 0, 100),
      festivals:    clamp(Math.round(40 + platform.trad * 0.2 + platform.myst * 0.2), 0, 100),
    };
  }

  function pushRumor(power, minute, rng) {
    const pols = Object.values(power.politicians).filter(p => p.alive);
    if (!pols.length) return;
    const subject = rng.pick(pols);
    // i18n-ignore-start: rumour ids, stored on the record and named through
    // Politics.rumorKind at the moment a conversation quotes one
    const kinds = ["affair", "embezzlement", "secretPact", "forgedCredentials", "midnightRitual", "doubleLife", "hiddenFortune", "blackmail"];
    // i18n-ignore-end
    power.rumors.unshift({
      minute, date: dateStrOf(minute),
      subjectId: subject.id, subjectName: subject.name,
      kind: rng.pick(kinds),
      veracity: rng.next() < 0.45,
      spread: rng.int(5, 30),
    });
    if (power.rumors.length > RUMOR_CAP) power.rumors.pop();
  }

  function simulatePowerChunk(state, power, chunkStart, days, nowChunkEnd) {
    const rng = new PolRng(worldSeed() ^ nameHash("chunk:" + power.name) ^ ((chunkStart >>> 0) || 1));
    const s = power.state;
    const head = power.politicians[power.headId];

    // ---- meter drift -------------------------------------------------------
    // Settlement-level conditions leak upward (NPCWorldWeb.powerPressure):
    // local booms feed national legitimacy and economy mood, local crime
    // waves, busts and epidemics feed national unrest, which in turn shapes
    // policy, which flows back down into every settlement's pulse.
    const web = window.NPCWorldWeb?.powerPressure?.(power.name) ?? { economy: 0, unrest: 0, legitimacy: 0 };
    s.economyMood = clamp(s.economyMood + ((rng.next() * 2 - 1) * 0.25 + web.economy) * days, 0, 100);
    s.legitimacy = clamp(s.legitimacy + ((s.economyMood - 50) * 0.01 - power.policies.taxRate * 0.004 + web.legitimacy) * days, 0, 100);
    s.unrest = clamp(s.unrest
      + ((60 - s.legitimacy) * 0.01 + power.policies.taxRate * 0.006 + power.policies.censorship * 0.004
         - power.policies.welfare * 0.006 - power.policies.festivals * 0.003 + web.unrest) * days, 0, 100);
    s.stability = clamp(s.stability + ((s.legitimacy - s.unrest) * 0.005) * days, 0, 100);
    s.treasury = Math.max(0, Math.round(s.treasury + (power.policies.taxRate * 120_000_000 - power.policies.welfare * 40_000_000 - power.policies.festivals * 20_000_000 - power.policies.conscription * 30_000_000) * days * (s.economyMood / 50)));
    if (head) head.approval = clamp(head.approval + ((s.legitimacy - 50) * 0.01 - head.scandals * 0.02) * days, 0, 100);
    for (const party of power.parties) party.momentum *= Math.pow(0.995, days);

    // ---- rumor spread ------------------------------------------------------
    for (const rumor of power.rumors) rumor.spread = clamp(rumor.spread + days * (rumor.veracity ? 0.8 : 0.5), 0, 100);

    // ---- sampled events ----------------------------------------------------
    const evMinute = () => chunkStart + rng.int(0, Math.max(0, days - 1)) * MINUTES_PER_DAY;

    for (let i = sampleCount(rng, RATES.scandal * power.scandalSensitivity * days); i > 0; i--) {
      const pols = Object.values(power.politicians).filter(p => p.alive);
      if (!pols.length) break;
      const pol = rng.pick(pols.filter(p => p.integrity < 70).length ? pols.filter(p => p.integrity < 70) : pols);
      pol.scandals++;
      pol.approval = clamp(pol.approval - rng.int(8, 20), 0, 100);
      if (pol.id === power.headId) s.legitimacy = clamp(s.legitimacy - 8, 0, 100);
      const party = partyById(power, pol.partyId);
      if (party) party.momentum = clamp(party.momentum - 6, -50, 50);
      pushPowerEvent(power, evMinute(), "scandal", "Politics.event.scandal", { name: pol.name, n: pol.scandals });
    }

    for (let i = sampleCount(rng, RATES.edict * days); i > 0; i--) {
      const targets = policyTargets(rulingPlatform(power));
      const keys = Object.keys(targets).filter(k => Math.abs(power.policies[k] - targets[k]) > 2);
      if (!keys.length) break;
      const key = rng.pick(keys);
      const before = power.policies[key];
      power.policies[key] = Math.round(before + Math.sign(targets[key] - before) * Math.min(Math.abs(targets[key] - before), rng.int(3, 10)));
      pushPowerEvent(power, evMinute(), "edict", "Politics.event.edict",
        { title: powerLabel(power, "headTitle"), policy: policyLabel(key), before: before, after: power.policies[key] });
    }
    power.policies.curfew = power.policies.censorship > 60 && s.unrest > 50;

    for (let i = sampleCount(rng, RATES.protest * (s.unrest / 100) * days); i > 0; i--) {
      s.unrest = clamp(s.unrest + rng.int(-2, 4), 0, 100);
      pushPowerEvent(power, evMinute(), "protest", "Politics.event.protest",
        { govType: powerLabel(power, "govType"), place: rng.pick(power.memberCountries.length ? power.memberCountries : [power.name]) });
    }

    if (s.unrest > 70) {
      for (let i = sampleCount(rng, RATES.riot * (s.unrest / 100) * days); i > 0; i--) {
        s.stability = clamp(s.stability - 5, 0, 100);
        s.treasury = Math.max(0, s.treasury - rng.int(2_000_000_000, 20_000_000_000));
        pushPowerEvent(power, evMinute(), "riot", "Politics.event.riot", { legislature: powerLabel(power, "legislature") });
      }
    }

    if (power.policies.festivals > 0) {
      for (let i = sampleCount(rng, RATES.festival * (power.policies.festivals / 50) * days); i > 0; i--) {
        s.unrest = clamp(s.unrest - 5, 0, 100);
        s.treasury = Math.max(0, s.treasury - 5_000_000_000);
        pushPowerEvent(power, evMinute(), "festival", "Politics.event.festival", { power: power.name });
      }
    }

    if (power.system === "parliamentary") {
      for (let i = sampleCount(rng, RATES.referendum * days); i > 0; i--) {
        const key = rng.pick(["taxRate", "welfare", "festivals", "censorship"]);
        const delta = rng.int(-8, 8);
        power.policies[key] = clamp(power.policies[key] + delta, 0, key === "taxRate" ? 45 : 100);
        s.legitimacy = clamp(s.legitimacy + 3, 0, 100);
        pushPowerEvent(power, evMinute(), "referendum", "Politics.event.referendum",
          { policy: policyLabel(key), delta: (delta > 0 ? "+" : "") + delta });
      }
    }

    for (let i = sampleCount(rng, RATES.rumor * days); i > 0; i--) pushRumor(power, evMinute(), rng);

    // ---- violent power transfers --------------------------------------------
    let snapElection = false;

    for (let i = sampleCount(rng, RATES.coup * ((100 - s.stability) / 100) * power.coupSusceptibility * days); i > 0; i--) {
      if (rng.next() < (100 - s.legitimacy) / 150) {
        const at = evMinute();
        const strongman = makePolitician(power, rng, nowChunkEnd, { age: rng.int(38, 60), spread: 20 });
        strongman.ideology.auth = clamp(strongman.ideology.auth + 40, -100, 100);
        strongman.ideology.mil = clamp(strongman.ideology.mil + 40, -100, 100);
        if (head && head.alive) head.office = "deposed";
        power.headId = strongman.id;
        strongman.office = power.headTitle;
        recordHead(power, at, strongman, "coup");
        power.nextElectionMinute = nowChunkEnd + 730 * MINUTES_PER_DAY;
        s.legitimacy = 30; s.stability = clamp(s.stability + 10, 0, 100);
        pushPowerEvent(power, at, "coup", "Politics.event.coup",
          { name: strongman.name, power: power.name, elections: labelOf(power).toLowerCase() });
      } else {
        s.stability = clamp(s.stability - 8, 0, 100);
        pushPowerEvent(power, evMinute(), "coup_failed", "Politics.event.coupFailed", { title: powerLabel(power, "headTitle") });
      }
      break; // at most one attempt per chunk
    }

    if (s.unrest >= 90 && s.legitimacy <= 25 && sampleCount(rng, RATES.revolution * days) > 0) {
      pushPowerEvent(power, evMinute(), "revolution", "Politics.event.revolution",
        { govType: powerLabel(power, "govType"), power: power.name, election: labelOf(power).toLowerCase() });
      s.unrest = 35; s.legitimacy = 40; s.stability = 40;
      snapElection = true;
    }

    for (let i = sampleCount(rng, RATES.assassination * (s.unrest / 50) * days); i > 0; i--) {
      if (head && head.alive && !head.protected) {
        const at = evMinute();
        killPolitician(power, head, at, { key: "Politics.death.assassinated" });
        pushPowerEvent(power, at, "assassination", "Politics.event.assassination",
          { name: head.name, title: powerLabel(power, "headTitle"), power: power.name });
        s.stability = clamp(s.stability - 15, 0, 100);
        snapElection = true;
      }
      break;
    }

    // ---- mortality of the political class ------------------------------------
    for (const pol of Object.values(power.politicians)) {
      if (!pol.alive || pol.protected) continue;
      const age = politicianAge(pol, nowChunkEnd);

      // Whoever is already dying dies on the day the diagnosis gave them, and
      // is never rolled for anything else in the meantime.
      if (pol.illness) {
        if (nowChunkEnd < pol.illness.untilMinute) continue;
        const at = evMinute();
        const disease = { id: pol.illness.diseaseId, name: pol.illness.diseaseName };
        killPolitician(power, pol, at,
          { key: "Politics.death.illness", params: { disease: pol.illness.diseaseName } });
        const wasHeadIll = pol.id === power.headId;
        pushPowerEvent(power, at, "death", "Politics.event.diesOfIllness",
          { name: pol.name, disease: pol.illness.diseaseName, power: power.name,
            title: powerLabel(power, "headTitle") });
        if (wasHeadIll) {
          recordIllnessInHistory("History.internal.diedOfIllness", power, pol, disease, at);
        }
        pol.illness = null;
        const illParty = partyById(power, pol.partyId);
        if (illParty && illParty.leaderId === pol.id) {
          illParty.leaderId = makePolitician(power, rng, nowChunkEnd,
            { ideology: illParty.platform, spread: 20, partyId: illParty.id }).id;
        }
        if (wasHeadIll) { pol.office = null; snapElection = true; }
        continue;
      }

      // A new diagnosis, on the same curve age itself runs on.
      if (age >= ILLNESS_MIN_AGE) {
        const iDay = ILLNESS_DAY_AT_50 * Math.exp(Math.max(0, age - 50) / ILLNESS_AGE_SCALE);
        if (sampleCount(rng, iDay * days) > 0) {
          const pool = mortalDiseases();
          if (pool.length) {
            const disease = pool[rng.int(0, pool.length - 1)];
            const at = evMinute();
            const runDays = rng.int(ILLNESS_MIN_DAYS, ILLNESS_MAX_DAYS);
            pol.illness = {
              diseaseId: disease.id, diseaseName: disease.name,
              sinceMinute: at, untilMinute: at + runDays * MINUTES_PER_DAY,
            };
            pushPowerEvent(power, at, "diagnosis", "Politics.event.diagnosed",
              { name: pol.name, disease: disease.name, power: power.name,
                title: powerLabel(power, "headTitle") });
            if (pol.id === power.headId) {
              recordIllnessInHistory("History.internal.diagnosed", power, pol, disease, at);
            }
            continue;
          }
        }
      }

      const pDay = 0.00002 * Math.exp(Math.max(0, age - 50) / 12);
      if (sampleCount(rng, pDay * days) > 0) {
        const at = evMinute();
        killPolitician(power, pol, at, { key: "Politics.death.naturalCauses", params: { age: age } });
        const wasHead = pol.id === power.headId;
        pushPowerEvent(power, at, "death",
          wasHead ? "Politics.event.headDies" : "Politics.event.politicianDies",
          { name: pol.name, age: age, power: power.name, title: powerLabel(power, "headTitle") });
        const party = partyById(power, pol.partyId);
        if (party && party.leaderId === pol.id) {
          party.leaderId = makePolitician(power, rng, nowChunkEnd, { ideology: party.platform, spread: 20, partyId: party.id }).id;
        }
        const electorIdx = power.electors.indexOf(pol.id);
        if (electorIdx >= 0) {
          const successor = makePolitician(power, rng, nowChunkEnd, { spread: 25 });
          successor.office = power.electorTitle;
          power.electors[electorIdx] = successor.id;
        }
        if (wasHead) { pol.office = null; snapElection = true; }
      }
    }

    if (snapElection) {
      resolveElection(state, power, nowChunkEnd, rng, { label: "snap" });
      power.nextElectionMinute = nowChunkEnd + power.termDays * MINUTES_PER_DAY;
    }

    // A written-down succession does not wait for a ballot: the day one term
    // in the book ends is the day the next name is in office.
    enforceCanonHead(state, power, nowChunkEnd, null);
  }

  // ==========================================================================
  // NPC POLITICAL IDENTITIES
  // ==========================================================================

  function pushIdentityEvent(identity, minute, type, key, params) {
    identity.log.unshift({ minute, date: dateStrOf(minute), type, key, params });
    if (identity.log.length > IDENTITY_LOG_CAP) identity.log.pop();
  }

  // Map group → country → hyperpower. Group names are matched against
  // Countries.json; unmatched groups get a seeded country. Neutral countries
  // lean toward a seeded "sympathy" hyperpower so every NPC has politics.
  // The history simulation can have moved a nation under a different
  // hyperpower than Countries.json ships with, the world's simulated
  // controller (HistoryManager.getNationState) always wins.
  function resolveGroupPolity(state, groupName, opts) {
    const countries = getCountries();
    const powers = Object.keys(state.powers);
    const rng = new PolRng(worldSeed() ^ nameHash("polity:" + (groupName || "drifters")));
    let country = countryByName(countries, groupName);
    // A named settlement (Ghent, Milano, Omega Tower, ...) is a group whose name
    // is its Destinations.json key, and every entry there declares the nation the
    // place stands in. Without this a town that is not itself a country name fell
    // through to the seeded draw below and its citizens were born, absurdly, in
    // whichever nation the seed picked.
    let declaredCountry = null;
    if (!country) {
      declaredCountry = window.WorkSystem?.destinationCountry?.(groupName)?.country || null;
      if (declaredCountry) {
        country = countryByName(countries, declaredCountry);
      }
    }
    // Procedural settlements are keyed "Proc:x,y" and never match a country by
    // name, but they carry the nation id of the world tile they were generated
    // on (NPCSystem ensureProcSettlement). Anchor them to that real nation
    // instead of a random one so every procedural citizen belongs to the nation
    // of their home map.
    // A tower floor is somewhere else entirely. Its group carries no
    // coordinate and no nation id on purpose (window.TowerWorlds), so it is
    // answered here, before anything tries to find it a place on Earth.
    const towerWorld = window.TowerWorlds?.worldOfGroup?.(groupName) || null;
    // A colony of Earth people is the exception: they are still Italians and
    // Britons down there, they simply live up a shaft, so they fall through to
    // the ordinary Earth path below and vote where their grandparents did.
    if (towerWorld && !towerWorld.earthborn) {
      return {
        country: towerWorld.name,
        power: state.powers[towerWorld.powerName] ? towerWorld.powerName : "Neutral",
      };
    }
    if (!country) {
      const nationId = $gameSystem?._npcMapGroups?.[groupName]?.nationId;
      if (nationId != null) country = countries.find(c => c.id === nationId) || null;
    }
    // Every better signal before a seeded guess: the nation the group itself
    // declares (a camp, a settlement registered with one), the country its
    // world square is painted in, and, when it is the ground the party stands
    // on, the country WeatherSystem put in variable 86.
    if (!country && !declaredCountry) country = signalledCountry(countries, groupName);
    // A place whose declared nation has no Countries.json entry of its own (a
    // Libya, a Liechtenstein) still reads as that nation, it simply has no
    // controller on file, so the allegiance falls through to sympathy below.
    if (!country && declaredCountry) return { country: declaredCountry, power: sympathyPower(powers, rng) };
    // A strict caller (REAL POLITICIANS looking for a capital) wants no guess.
    if (!country && opts && opts.strict) return { country: null, power: "Neutral" };
    if (!country && countries.length) country = countries[rng.int(0, countries.length - 1)];
    let controller = country?.controller ?? "Neutral";
    let faction = country?.faction ?? "Neutral";
    if (country) {
      const simState = window.HistoryManager?.getNationState?.(country.country);
      if (simState) {
        if (simState.controller) controller = simState.controller;
        if (simState.faction) faction = simState.faction;
      }
    }
    let powerName = country ? canonicalFaction(controller !== "Neutral" ? controller : faction) : "Neutral";
    if (powerName === "Neutral" || !state.powers[powerName]) {
      powerName = sympathyPower(powers, rng);
    }
    return { country: country?.country ?? null, power: powerName };
  }

  // The ground the party is standing on, as a group key.
  function currentGroupName() {
    if (!$gameSystem) return null;
    const onProc = typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId && $gameMap.mapId() === 636;
    if (onProc && $gameSystem._currentProcGroup) return $gameSystem._currentProcGroup;
    let g = null;
    try {
      g = (typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId)
        ? (window.NPCSystem?.findMapGroupByMap?.($gameMap.mapId()) || null) : null;
    } catch (_) { g = null; }
    return g || $gameSystem._npcSystemCurrentMapGroup || null;
  }

  // A country for a group that no name, destination or nation id answers,
  // read off what the world itself knows about the place. Null when nothing
  // does: the caller then decides whether a seeded guess is acceptable.
  function signalledCountry(countries, groupName) {
    const grp = $gameSystem?._npcMapGroups?.[groupName];
    if (grp && grp.country) {
      const own = countryByName(countries, grp.country);
      if (own) return own;
    }
    if (grp && Number.isFinite(grp.worldX) && Number.isFinite(grp.worldY) &&
        typeof $gameSystem.getCountryFromWorldCoordinates === "function") {
      try {
        const at = $gameSystem.getCountryFromWorldCoordinates(grp.worldX, grp.worldY);
        if (at && at.country) return countryByName(countries, at.country) || at;
      } catch (_) { /* the world map is not scanned yet */ }
    }
    if (groupName && groupName === currentGroupName()) {
      const id = (typeof $gameVariables !== "undefined" && $gameVariables) ? ($gameVariables.value(86) || 0) : 0;
      // 255 is WeatherSystem's "no country found" answer.
      if (id && id !== 255) return countries.find(c => c.id === id) || null;
    }
    return null;
  }

  // Sympathy allegiance, drawn from the powers of this world only: nobody
  // living in a neutral country drifts into a caste on another star.
  function sympathyPower(powers, rng) {
    const earthly = powers.filter(n => !OFFWORLD_POWERS[n] && !isTowerPower(n));
    const pool = earthly.length ? earthly : powers;
    return pool.length ? pool[rng.int(0, pool.length - 1)] : "Neutral";
  }

  // The parties a citizen of `country` may actually vote for inside `power`:
  // their own nation's, and nothing else. A power whose bench carries no
  // national lists at all (the Horde's clans, the Tourists' castes, the Gods'
  // houses) is answered with its own parties instead, since those are national
  // in the only sense that power has a nation.
  function ballotFor(power, country) {
    if (!power) return [];
    if (country) {
      const own = power.parties.filter(p => p.country === country);
      if (own.length) return own;
    }
    // Somebody with no nation of their own - an alien serving an off-world
    // power - reads that power's own bench, which is filed under its name.
    return power.parties.filter(p => !p.country || p.country === power.name);
  }

  // Make sure the parties of `country` stand inside `power`, so a citizen of a
  // nation that answers to it has their own ballot in its assembly. Called the
  // first time an identity from that nation is written; the parties are stored
  // on the power like any other and are voted on, funded and led from then on.
  function ensureCountryParties(power, country, nowMinute) {
    if (!power || !country) return;
    const roster = nationalParties(country);
    if (!roster.length) return;
    if (power.parties.some(p => p.country === country)) return;
    const rng = new PolRng(worldSeed() ^ nameHash("nationalparties:" + power.name + ":" + country));
    const home = country === power.homeNation;
    for (const entry of roster) {
      const index = power.parties.length;
      const party = makeParty(power, rng, nowMinute, index, entry);
      // A party of the power's own seat sits at the centre of its assembly: it
      // is always on the ballot and it counts for more than a provincial list
      // (HOME_BENCH_WEIGHT).
      party.homeBench = home;
      power.parties.push(party);
    }
  }

  // Every party that stands in a power's assembly: the lists of every nation it
  // holds, and its home nation's whether or not it is currently holding it -
  // losing the capital does not dissolve the parties that sit in it.
  function syncPowerParties(state, power, nowMinute) {
    if (!power) return;
    const nations = new Set(power.memberCountries || []);
    if (power.homeNation) nations.add(power.homeNation);
    for (const nation of nations) ensureCountryParties(power, nation, nowMinute);
    // A power that holds no ground on this planet - the Gods, the Tourists,
    // the Dargos - keeps its bench under its OWN name in Parties.json. Nothing
    // here composes a party: every party in the world is written down.
    if (!power.parties.length) ensureCountryParties(power, power.name, nowMinute);
  }

  // The party of a power whose platform sits closest to a given ideology, which
  // is how anybody ends up a sympathizer of anything. The choice is made inside
  // the voter's own nation; somebody whose nation stands no parties in this
  // assembly sympathizes with nobody.
  function nearestPartyId(power, ideology, country) {
    if (!power) return null;
    let partyId = null, bestD = Infinity;
    for (const party of ballotFor(power, country)) {
      const d = ideologyDistance(ideology, party.platform);
      if (d < bestD) { bestD = d; partyId = party.id; }
    }
    return partyId;
  }

  // ==========================================================================
  // CIVIC DRAW AND CREED SYNC, the creed leans to the ballot and the government
  // ==========================================================================
  // A person's creed is not dealt in a vacuum. The first time their political
  // identity is written, they are drawn toward one of their own nation's
  // parties (the popular ones, and the ones near what they already believe,
  // likelier) and toward whoever governs them, and the creed is re-picked
  // from the handful standing nearest that mix. Once only: `_civicV` stamps
  // it, and an identity that already exists is never redrawn.
  //
  // Then the two stay in step. A creed that changes (drift, conversion)
  // pulls the identity's axes after it and may move the party they sympathize
  // with; identity axes that wander far from the creed (radicalization) pull
  // the creed after them. `_creedSyncing` keeps either from calling the other.

  const CIVIC_MIX = { creed: 0.55, party: 0.25, ruling: 0.20 };
  const CIVIC_DIST_SCALE = 20;       // party weight = share * exp(-dist / 20)
  const CIVIC_CANDIDATES = 5;
  const CREED_SYNC_PULL = 0.6;       // identity axes move this far toward the creed
  const PARTY_HYSTERESIS = 8;        // a new party must be this much nearer to win
  const REALIGN_GAP = 30;            // identity-to-creed distance that re-picks the creed
  const REALIGN_RATE_PER_30D = 0.25;

  let _creedSyncing = false;

  function mixAxes(parts) {
    const out = {};
    for (const ax of AXES) {
      let v = 0;
      for (const [axes, w] of parts) v += (axes?.[ax] ?? 0) * w;
      out[ax] = clamp(Math.round(v), -100, 100);
    }
    return out;
  }

  // Weighted pick over [{..., w}] with the simulation's own rng.
  function weightedPick(list, rng) {
    let total = 0;
    for (const e of list) total += e.w;
    if (!(total > 0)) return list[0] || null;
    let roll = rng.next() * total;
    for (const e of list) { roll -= e.w; if (roll <= 0) return e; }
    return list[list.length - 1];
  }

  function civicDraw(state, npcName, profile, power, country, rng) {
    const S = window.NPCShared;
    if (!profile || profile._civicV === S.CIVIC_V) return false;
    const creed = S.ideologyFor(profile);
    // Pinned creeds and the off-world keep what they hold; a beast holds none.
    if (!creed || creed.alien || S.creedPinned(profile) || isNonSentientName(npcName) || !power) {
      profile._civicV = S.CIVIC_V;
      return false;
    }
    const creedAxes = S.ideologyAxes(creed);
    const ballot = ballotFor(power, country);
    let party = null;
    if (ballot.length) {
      const weighted = ballot.map(p => ({
        party: p,
        w: Math.max(1, p.lastShare || 0) * Math.exp(-ideologyDistance(creedAxes, p.platform) / CIVIC_DIST_SCALE),
      }));
      party = weightedPick(weighted, rng)?.party || null;
    }
    const target = mixAxes([
      [creedAxes, CIVIC_MIX.creed],
      [party ? party.platform : creedAxes, CIVIC_MIX.party],
      [rulingPlatform(power), CIVIC_MIX.ruling],
    ]);
    const near = S.nearestIdeologies(target, { alien: false, limit: CIVIC_CANDIDATES });
    const pick = weightedPick(near.map(e => ({ ...e, w: 1 / (1 + e.distance / 25) })), rng);
    if (pick && pick.ideo) S.setCreed(profile, pick.ideo);
    profile._civicV = S.CIVIC_V;
    return !!pick;
  }

  // The creed on the society profile changed: pull the identity after it.
  function onCreedChanged(npcName) {
    if (_creedSyncing) return false;
    const state = getState();
    const identity = state?.identities?.[npcName];
    const profile = getProfile(npcName);
    const creed = window.NPCShared.ideologyFor(profile);
    if (!identity || !creed) return false;
    _creedSyncing = true;
    try {
      const power = state.powers[identity.power];
      const baseline = power ? power.baseline : {};
      const creedAxes = window.NPCShared.ideologyAxes(creed);
      for (const ax of AXES) {
        const target = creedAxes[ax] * CREED_WEIGHT + (baseline[ax] ?? 0) * (1 - CREED_WEIGHT);
        const cur = identity.ideology[ax] ?? 0;
        identity.ideology[ax] = clamp(Math.round(cur + (target - cur) * CREED_SYNC_PULL), -100, 100);
      }
      identity.creedId = creed.id;
      // A character the player built declares a party only by the player's
      // hand (see ensureIdentity): nothing here moves it.
      if (power && !(profile && profile.playerCreated)) {
        let best = null, bestD = Infinity, curD = Infinity;
        for (const party of ballotFor(power, identity.country)) {
          const d = ideologyDistance(identity.ideology, party.platform);
          if (d < bestD) { bestD = d; best = party; }
          if (party.id === identity.partyId) curD = d;
        }
        if (best && best.id !== identity.partyId && bestD + PARTY_HYSTERESIS < curD) {
          const old = partyById(power, identity.partyId);
          identity.partyId = best.id;
          pushIdentityEvent(identity, nowMinuteVar(), "conversion", "Politics.identity.conversion",
            { from: old?.name ?? T("Politics.fallback.oldGuard"), to: best.name });
        } else {
          // Not near enough another party to switch outright: the further the
          // new creed stands from their own party, the likelier they walk out
          // of it anyway (PARTY DRIFT).
          const minute = nowMinuteVar();
          driftFromParty(npcName, identity, power, new PolRng(worldSeed() ^ nameHash("driftCreed:" + npcName) ^ ((minute >>> 0) || 1)),
            minute, DRIFT_ON_CREED_DAYS);
        }
      }
      return true;
    } finally {
      _creedSyncing = false;
    }
  }

  // Somebody moved to another town for good (NPCLifeSim RELOCATION). Their
  // vote goes with their home: the power and the nation of the new town, and
  // the party nearest them on its ballot. Whatever office they held in the old
  // town is left there. A character the player built keeps the party the
  // player declared. Somebody from off this world still answers to the power
  // that sent them, wherever they live.
  function onRelocated(npcName, toGroup) {
    const state = getState();
    const identity = state?.identities?.[npcName];
    if (!identity || !toGroup) return false;
    // Who lives where has changed: the next roll call counts them afresh.
    _populationCache = null;
    // The office they held in the old town stays there, empty, until its next
    // election: the town's own record must stop naming them as its holder.
    for (const [groupName, settlement] of Object.entries(state.settlements || {})) {
      if (groupName === toGroup || !settlement?.offices) continue;
      for (const office of LOCAL_OFFICES) {
        if (settlement.offices[office] === npcName) settlement.offices[office] = null;
      }
    }
    identity.group = toGroup;
    identity.localOffice = null;
    if (identity.country == null) return true;
    const polity = resolveGroupPolity(state, toGroup);
    const country = homeCountryOf(npcName, toGroup) || polity.country;
    const power = state.powers[polity.power];
    if (identity.country === country && identity.power === polity.power) return true;
    const minute = nowMinuteVar();
    identity.country = country;
    identity.power = polity.power;
    ensureCountryParties(power, country, minute);
    ensureNation(state, country, minute);
    const profile = getProfile(npcName);
    if (!(profile && profile.playerCreated)) identity.partyId = nearestPartyId(power, identity.ideology, country);
    identity.votedLast = null;
    identity.grudgePartyId = null;
    return true;
  }

  // The other direction: identity axes that have wandered far from the creed
  // (radicalization, years of unrest) re-pick the creed nearest where the
  // person now stands, inside their own pool. Chance scales with the chunk.
  function realignCreed(npcName, identity, rng, days, minute) {
    if (_creedSyncing) return false;
    const S = window.NPCShared;
    const profile = getProfile(npcName);
    const creed = S.ideologyFor(profile);
    if (!profile || !creed || S.creedPinned(profile)) return false;
    if (ideologyDistance(identity.ideology, S.ideologyAxes(creed)) <= REALIGN_GAP) return false;
    if (rng.next() >= Math.min(1, REALIGN_RATE_PER_30D * days / 30)) return false;
    const near = S.nearestIdeologies(identity.ideology, { alien: !!creed.alien, limit: 1 });
    const pick = near[0];
    if (!pick || pick.ideo.id === creed.id) return false;
    _creedSyncing = true;
    try {
      S.setCreed(profile, pick.ideo);
      identity.creedId = pick.ideo.id;
      window.NPCLifeSim?.pushEvent?.(npcName, minute, "outlook",
        "NPCLife.event.worldviewShiftedBy.politics", { creed: pick.ideo.id });
    } finally {
      _creedSyncing = false;
    }
    return true;
  }

  // The platform of whoever governs this person, for the life sim's pull.
  function rulingPlatformOf(npcName) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    const power = identity && state.powers?.[identity.power];
    if (!power) return null;
    return { platform: rulingPlatform(power), unrest: power.state?.unrest ?? 0, power: power.name };
  }

  function ensureIdentity(state, npcName, groupName, nowMinute) {
    // Asked BEFORE the cache, and the cached answer is thrown away: a beast
    // that already holds a citizenship, a party and a vote was written by a
    // world folder from before the rule, and reading it back would keep a cat
    // in the Nieuw-Vlaamse Verbond forever.
    if (isNonSentientName(npcName)) {
      if (state.identities[npcName]) delete state.identities[npcName];
      return null;
    }
    // Nor does a child: no party and no vote until eighteen (NPCLifeSim
    // FAMILY), when the identity is written like anybody's.
    if (isMinorName(npcName)) {
      if (state.identities[npcName]) delete state.identities[npcName];
      return null;
    }
    if (state.identities[npcName]) return state.identities[npcName];
    const rng = new PolRng(worldSeed() ^ nameHash("identity:" + npcName));
    const profile = getProfile(npcName);
    // A non-sentient creature (NPCCreature) holds no allegiance. Nothing is
    // written for it at all, rather than a blank identity: every reader here
    // walks the identities map, so an absent one simply never votes, never
    // stands, never radicalizes and never appears in a citizen roll, and
    // getIdentity() answers null the way it always did for a stranger.
    if (isNonSentientName(npcName)) return null;
    // Somebody who is not from this world answers to the power that sent them,
    // not to whichever nation the town they are standing in belongs to. They
    // hold no citizenship here, so the country stays null.
    const alien = window.AlienOrigins?.identify?.(profile?.spriteKey, npcName) || null;
    const polity = (alien && state.powers[alien.power])
      ? { country: null, power: alien.power }
      : resolveGroupPolity(state, groupName);
    const power = state.powers[polity.power];
    // Where they VOTE is where they are FROM: the nation their hometown stands
    // in, not the one they happen to be walking around in today.
    if (!alien) {
      const home = homeCountryOf(npcName, groupName);
      if (home) polity.country = home;
    }
    ensureCountryParties(power, polity.country, nowMinute);
    // ...and their nation gets its own government, which they also vote in.
    ensureNation(state, polity.country, nowMinute);

    // Personal ideology: what they BELIEVE first, where they LIVE second. The
    // creed on the society profile (Ideology.json) carries its own position on
    // these five axes, so a Trade Unionist reads as one wherever they were
    // born; the power's cultural baseline is what is left over, and pulls them
    // toward the local consensus without erasing the creed. Somebody with no
    // creed on file is still the baseline plus a wide personal spread, which is
    // all this used to be. Then nudges from the rest of the profile.
    // First the civic draw (above): the creed leans to a party of their own
    // nation and to the government, once, before the identity reads it.
    if (!alien && profile) {
      civicDraw(state, npcName, profile, power, polity.country,
        new PolRng(worldSeed() ^ nameHash("civic:" + npcName)));
    }
    const creed = window.NPCShared.ideologyFor(profile);
    const baseline = power ? power.baseline : { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 };
    let center = baseline, spread = 50;
    if (creed && creed.axes) {
      const creedAxes = window.NPCShared.ideologyAxes(creed);
      center = {};
      for (const ax of AXES) {
        center[ax] = creedAxes[ax] * CREED_WEIGHT + (baseline[ax] ?? 0) * (1 - CREED_WEIGHT);
      }
      spread = CREED_SPREAD;
    }
    const ideology = jitterIdeology(center, rng, spread);
    if (profile) {
      if (typeof profile.moralityScore === "number") ideology.auth = clamp(Math.round(ideology.auth - profile.moralityScore * 0.15), -100, 100);
      if (typeof profile.wealthTierBase === "number") ideology.econ = clamp(Math.round(ideology.econ + (profile.wealthTierBase - 2) * 12), -100, 100);
    }

    // A character the player built declares for a party only if the player
    // said so on the detailed sheet: nobody is born card-carrying. Everybody
    // else drifts to the party nearest their own creed, as before.
    const partyId = profile && profile.playerCreated
      ? (profile.declaredPartyName
          ? (ballotFor(power, polity.country).find(p => p.name === profile.declaredPartyName)?.id ?? null)
          : null)
      : nearestPartyId(power, ideology, polity.country);

    const identity = {
      power: polity.power, country: polity.country, group: groupName ?? null,
      ideology, partyId, creedId: creed?.id ?? null,
      engagement: Math.round(Math.pow(rng.next(), 1.6) * 100), // most people are mostly apathetic
      charisma: rng.int(5, 95),
      votedLast: null,
      grudgePartyId: null,
      localOffice: null,
      log: [],
    };
    pushIdentityEvent(identity, nowMinute, "awakening",
      partyId && power ? "Politics.identity.sympathized" : "Politics.identity.awakened",
      partyId && power ? { party: partyById(power, partyId)?.name } : undefined);
    state.identities[npcName] = identity;
    return identity;
  }

  function ensureIdentities(state, nowMinute) {
    const population = collectPopulation();
    let created = 0;
    for (const [npcName, groupName] of Object.entries(population)) {
      if (state.identities[npcName]) continue;
      if (created >= MAX_NEW_IDENTITIES_PER_PASS) break;
      // Only a real identity counts against the per-pass budget. A creature
      // that will never have one is refused every pass, and must not spend a
      // slot a citizen behind it in the walk is waiting for.
      if (ensureIdentity(state, npcName, groupName, nowMinute)) created++;
    }
    return created;
  }

  function simulateIdentitiesChunk(state, chunkStart, days, side) {
    const monsterOnly = monsterPowersOnly();
    for (const [npcName, identity] of Object.entries(state.identities)) {
      const power = state.powers[identity.power];
      if (!power) continue;
      if (monsterOnly && !isMonsterPolity(power)) continue;
      if (side && !side.identity(identity)) continue;
      const rng = new PolRng(worldSeed() ^ nameHash("idchunk:" + npcName) ^ ((chunkStart >>> 0) || 1));

      // engagement drifts with national unrest (politics gets harder to ignore)
      identity.engagement = clamp(Math.round(identity.engagement + ((power.state.unrest - 40) * 0.005 + (rng.next() * 2 - 1) * 0.3) * days), 0, 100);

      if (sampleCount(rng, NPC_RATES.partySwitch * days) > 0) {
        // Changing your mind does not change your nationality: the parties on
        // offer are still your own country's (ballotFor).
        let best = null, bestD = Infinity;
        for (const party of ballotFor(power, identity.country)) {
          const d = ideologyDistance(identity.ideology, party.platform);
          if (d < bestD) { bestD = d; best = party; }
        }
        if (best && best.id !== identity.partyId) {
          const old = partyById(power, identity.partyId);
          identity.partyId = best.id;
          pushIdentityEvent(identity, chunkStart, "conversion", "Politics.identity.conversion",
            { from: old?.name ?? T("Politics.fallback.oldGuard"), to: best.name });
        }
      }

      // Membership follows belief (PARTY DRIFT), on its own seed so the draws
      // below are the same whether or not anybody walked out.
      driftFromParty(npcName, identity, power,
        new PolRng(worldSeed() ^ nameHash("drift:" + npcName) ^ ((chunkStart >>> 0) || 1)), chunkStart, days);

      if (sampleCount(rng, NPC_RATES.radicalize * (power.state.unrest / 100) * days) > 0) {
        for (const ax of AXES) identity.ideology[ax] = clamp(Math.round(identity.ideology[ax] * 1.2), -100, 100);
        identity.engagement = clamp(identity.engagement + 15, 0, 100);
        pushIdentityEvent(identity, chunkStart, "radicalized", "Politics.identity.radicalized");
      }

      // Axes that have drifted far from the creed pull the creed after them.
      realignCreed(npcName, identity, rng, days, chunkStart);

      if (identity.grudgePartyId && sampleCount(rng, NPC_RATES.grudgeFade * days) > 0) {
        identity.grudgePartyId = null;
      }
    }
  }

  // ==========================================================================
  // PARTY DRIFT, membership follows belief
  // ==========================================================================
  // Somebody whose views have wandered away from their party's platform
  // (preaching, conversion, a debate lost, years of organic drift) is likelier
  // to walk out of it the further they have gone. Under DRIFT_FLOOR nobody
  // leaves; past it the daily chance climbs with the square of the distance,
  // up to DRIFT_DAILY_MAX a day at DRIFT_FLOOR + DRIFT_SPAN. Leaving is to the
  // nearest party of their own ballot when one stands within DRIFT_INDEPENDENT,
  // independent otherwise. Rolled once a chunk (simulateIdentitiesChunk) and
  // right after a creed change (onCreedChanged). A character the player built
  // declares a party only by the player's hand, so nothing here moves them;
  // for them actorPartyStanding answers how far they have drifted, and the
  // Empathize panel warns.
  //
  // The Empathize actions (join, invite, campaign) move people through
  // switchParty and reconsiderParty, so every change of party is logged here.

  const DRIFT_FLOOR = 30;
  const DRIFT_SPAN = 70;
  const DRIFT_DAILY_MAX = 0.02;
  const DRIFT_ON_CREED_DAYS = 30;
  const DRIFT_INDEPENDENT = 45;
  const DRIFT_WARN = 45;

  function partyDriftChance(distance, days) {
    const over = (Number(distance) || 0) - DRIFT_FLOOR;
    if (!(over > 0) || !(days > 0)) return 0;
    const x = Math.min(1, over / DRIFT_SPAN);
    return 1 - Math.pow(1 - DRIFT_DAILY_MAX * x * x, days);
  }

  // One roll. Answers "switched", "left" or null.
  function driftFromParty(npcName, identity, power, rng, minute, days) {
    if (!identity || !identity.partyId || !power) return null;
    const own = partyById(power, identity.partyId);
    if (!own) return null;
    const dist = ideologyDistance(identity.ideology, own.platform);
    const p = partyDriftChance(dist, days);
    if (!(p > 0) || rng.next() >= p) return null;
    if (getProfile(npcName)?.playerCreated) return null;
    let best = null, bestD = Infinity;
    for (const party of ballotFor(power, identity.country)) {
      if (party.id === own.id) continue;
      const d = ideologyDistance(identity.ideology, party.platform);
      if (d < bestD) { bestD = d; best = party; }
    }
    if (best && bestD <= DRIFT_INDEPENDENT && bestD < dist) {
      identity.partyId = best.id;
      pushIdentityEvent(identity, minute, "conversion", "Politics.identity.driftedTo", // i18n-ignore: event type
        { from: own.name, to: best.name });
      return "switched"; // i18n-ignore: result id
    }
    identity.partyId = null;
    pushIdentityEvent(identity, minute, "conversion", "Politics.identity.driftedOut", { from: own.name }); // i18n-ignore: event type
    return "left"; // i18n-ignore: result id
  }

  // The parties on somebody's own ballot, nearest their views first:
  // [{ party, distance }].
  function ballotOf(npcName) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    const power = identity && state.powers?.[identity.power];
    if (!power) return [];
    return ballotFor(power, identity.country)
      .map(party => ({ party, distance: ideologyDistance(identity.ideology, party.platform) }))
      .sort((a, b) => a.distance - b.distance);
  }

  // Put somebody in a party by hand (a party member talked them into it):
  // no hysteresis, and logged. `partyId` is a party of their own power, the
  // player's party id (they become one of its supporters) or null for
  // independent. opts: { by } names who talked them round.
  function switchParty(npcName, partyId, opts = {}) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    if (!identity) return false;
    const minute = nowMinuteVar();
    const power = state.powers?.[identity.power];
    const from = (power && partyById(power, identity.partyId))?.name ?? T("Politics.fallback.oldGuard");
    if (partyId === PLAYER_PARTY_ID) {
      const mine = state.playerParty;
      if (!mine) return false;
      mine.supporters = mine.supporters || [];
      if (mine.supporters.includes(npcName)) return false;
      mine.supporters.push(npcName);
      pushIdentityEvent(identity, minute, "conversion", "Politics.identity.joinedBy", // i18n-ignore: event type
        { party: mine.name, from, by: opts.by || "-" });
      return true;
    }
    if (partyId === identity.partyId) return false;
    const party = (partyId && power) ? partyById(power, partyId) : null;
    if (partyId && !party) return false;
    identity.partyId = party ? party.id : null;
    pushIdentityEvent(identity, minute, "conversion", party ? "Politics.identity.joinedBy" : "Politics.identity.driftedOut", // i18n-ignore: event type
      party ? { party: party.name, from, by: opts.by || "-" } : { from });
    return true;
  }

  // Views moved (a campaign on the doorstep): the same rule a creed change
  // runs, a party nearer by PARTY_HYSTERESIS wins them. Answers the new party
  // or null.
  function reconsiderParty(npcName) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    const power = identity && state.powers?.[identity.power];
    if (!power || getProfile(npcName)?.playerCreated) return null;
    const ballot = ballotOf(npcName);
    const best = ballot[0];
    const cur = ballot.find(e => e.party.id === identity.partyId);
    const curD = cur ? cur.distance : Infinity;
    if (!best || best.party.id === identity.partyId || !(best.distance + PARTY_HYSTERESIS < curD)) return null;
    identity.partyId = best.party.id;
    pushIdentityEvent(identity, nowMinuteVar(), "conversion", "Politics.identity.conversion",
      { from: cur ? cur.party.name : T("Politics.fallback.oldGuard"), to: best.party.name });
    return best.party;
  }

  // A party member's own standing in the party they declared for (the
  // detailed sheet, or joined in Empathize) or the player's party they belong
  // to: { party, isPlayer, distance, drifting } or null. `axes` is where the
  // member stands now (their creed's axes, or their identity's).
  function actorPartyStanding(actorName, axes) {
    const state = $gameSystem?._npcPolitics;
    if (!state || !actorName) return null;
    const identity = state.identities?.[actorName];
    const where = axes || identity?.ideology;
    if (!where) return null;
    let party = null, isPlayer = false;
    const declared = getProfile(actorName)?.declaredPartyName;
    if (declared) {
      const home = identity && state.powers?.[identity.power];
      party = (home && home.parties.find(p => p.name === declared)) || null;
      if (!party) {
        for (const polity of allPolities(state)) {
          party = (polity.parties || []).find(p => p.name === declared) || null;
          if (party) break;
        }
      }
    }
    if (!party && state.playerParty && (state.playerParty.members || []).includes(actorName)) {
      party = state.playerParty;
      isPlayer = true;
    }
    if (!party) return null;
    const distance = ideologyDistance(where, party.platform);
    return { party, isPlayer, distance, drifting: distance > DRIFT_WARN };
  }

  // ==========================================================================
  // LOCAL SETTLEMENT POLITICS (DF-style noble screen)
  // ==========================================================================

  const LOCAL_OFFICES = ["mayor", "guardCaptain", "taxCollector", "highPriest"];
  // Labels come from Politics.office.<id>; the map is kept for callers that ask
  // for the whole thing, and reads live so a language switch reaches it.
  const LOCAL_OFFICE_LABELS = {};
  for (const _office of LOCAL_OFFICES) {
    Object.defineProperty(LOCAL_OFFICE_LABELS, _office, {
      get: () => officeLabel(_office), enumerable: true,
    });
  }

  // A floor of the Omega Tower keeps the tower's time (TOWER CLOCK), so its
  // first local election is reckoned from the tower's minute, not Earth's.
  function ensureSettlements(state, nowMinute, tower) {
    const groups = Object.keys($gameSystem?._npcMapGroups || {});
    for (const groupName of groups) {
      if (state.settlements[groupName]) continue;
      const polity = resolveGroupPolity(state, groupName);
      const onTower = !!tower && (tower.group(groupName) || tower.power(polity.power));
      const startMinute = onTower ? tower.now : nowMinute;
      const rng = new PolRng(worldSeed() ^ nameHash("settlement:" + groupName));
      state.settlements[groupName] = {
        group: groupName, country: polity.country, power: polity.power,
        offices: { mayor: null, guardCaptain: null, taxCollector: null, highPriest: null },
        nextLocalElectionMinute: startMinute - rng.int(0, LOCAL_TERM_DAYS - 1) * MINUTES_PER_DAY, // due immediately, staggered
        history: [],
      };
    }
  }

  // One-time repair for worlds simulated before Destinations.json declared the
  // nation of every town. A named settlement whose key is not itself a country
  // name used to fall through to the seeded draw in resolveGroupPolity, filing
  // its citizens under a random nation, which is how somebody from Ghent read as
  // a citizen of San Marino. Anyone whose home town now resolves to a different
  // nation is re-filed, and when that also changes the power they answer to they
  // are re-sorted into a party of it, since party ids are scoped to their power.
  function repairDeclaredCountries(state) {
    if (state.destCountriesRepaired) return;
    state.destCountriesRepaired = true;
    if (!window.WorkSystem?.destinationCountry) return;
    const cache = {};
    const polityOf = (groupName) => {
      if (!(groupName in cache)) cache[groupName] = resolveGroupPolity(state, groupName);
      return cache[groupName];
    };
    const declared = (groupName) => !!(groupName && window.WorkSystem.destinationCountry(groupName));

    for (const [groupName, settlement] of Object.entries(state.settlements || {})) {
      if (!declared(groupName)) continue;
      const polity = polityOf(groupName);
      settlement.country = polity.country;
      settlement.power = polity.power;
    }
    for (const identity of Object.values(state.identities || {})) {
      // A country of null is somebody from off this world (AlienOrigins): they
      // hold no citizenship here and answer to the power that sent them.
      if (!identity || identity.country == null || !declared(identity.group)) continue;
      const polity = polityOf(identity.group);
      identity.country = polity.country;
      if (identity.power !== polity.power) {
        identity.power = polity.power;
        const power = state.powers[polity.power];
        ensureCountryParties(power, identity.country, nowMinuteVar());
        identity.partyId = nearestPartyId(power, identity.ideology, identity.country);
        identity.votedLast = null;
        identity.grudgePartyId = null;
      }
    }
  }

  // A nation changed hands in the live chronicle (a war, a peace, a coup):
  // every settlement in it and everybody filed under it answer to whoever
  // holds it now. Modelled on repairDeclaredCountries: the polity is worked
  // out again, and a person whose power changed is re-sorted into a party of
  // the new one, since party ids are scoped to their power. Reads the state
  // without creating it, so a world whose politics are not bootstrapped yet
  // (the years before a later start) costs nothing here. Returns how many
  // settlements and people were moved.
  function reresolveCountry(country) {
    const state = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._npcPolitics : null;
    if (!state || !country) return 0;
    const target = norm(country);
    const cache = {};
    const polityOf = (groupName) => {
      if (!(groupName in cache)) cache[groupName] = resolveGroupPolity(state, groupName);
      return cache[groupName];
    };
    let moved = 0;
    for (const [groupName, settlement] of Object.entries(state.settlements || {})) {
      if (!settlement || norm(settlement.country) !== target) continue;
      const polity = polityOf(groupName);
      if (settlement.power !== polity.power) moved++;
      settlement.power = polity.power;
    }
    for (const identity of Object.values(state.identities || {})) {
      if (!identity || identity.country == null || norm(identity.country) !== target) continue;
      const polity = polityOf(identity.group);
      if (identity.power === polity.power) continue;
      identity.power = polity.power;
      const power = state.powers[polity.power];
      if (power) {
        ensureCountryParties(power, identity.country, nowMinuteVar());
        identity.partyId = nearestPartyId(power, identity.ideology, identity.country);
      }
      identity.votedLast = null;
      identity.grudgePartyId = null;
      moved++;
    }
    return moved;
  }

  // name -> group turned round into group -> names, rebuilt whenever the roll
  // call is (collectPopulation hands back the same object until it changes).
  let _byGroupSrc = null, _byGroup = null;
  function populationOfGroup(groupName) {
    const population = collectPopulation();
    if (_byGroupSrc !== population) {
      _byGroup = new Map();
      for (const [name, g] of Object.entries(population)) {
        if (!_byGroup.has(g)) _byGroup.set(g, []);
        _byGroup.get(g).push(name);
      }
      _byGroupSrc = population;
    }
    return _byGroup.get(groupName) || [];
  }

  function localResidents(state, groupName) {
    return populationOfGroup(groupName)
      // A beast standing in the square is not a resident who votes: an old
      // world folder's stray identity is dropped here as well as at the gate
      // (see ensureIdentity), so it never stands, votes or is counted.
      .filter(name => {
        if (!state.identities[name]) return false;
        if (!isNonSentientName(name)) return true;
        delete state.identities[name];
        return false;
      });
  }

  function resolveLocalElection(state, settlement, minute) {
    const rng = new PolRng(worldSeed() ^ nameHash("local:" + settlement.group) ^ ((minute >>> 0) || 1));
    const residents = localResidents(state, settlement.group);
    if (residents.length < 2) {
      // Too few voters yet (a square the party has only just walked onto, a
      // town still being dealt): the vote is called again soon rather than a
      // whole term later, so the town is not left without a mayor for a year.
      settlement.nextLocalElectionMinute = minute + LOCAL_RETRY_DAYS * MINUTES_PER_DAY;
      return;
    }

    // Candidates: the three most plausible local politicians.
    const ranked = residents
      .map(name => {
        const id = state.identities[name];
        return { name, score: id.engagement * 0.7 + id.charisma * 0.5 + rng.next() * 25 };
      })
      .sort((a, b) => b.score - a.score)
      // Somebody already governing the nation or the bloc (REAL POLITICIANS)
      // votes here like anybody, but does not stand for the town hall.
      .filter(c => !holdsStateOffice(c.name));
    const candidates = ranked.slice(0, Math.min(3, ranked.length));
    if (!candidates.length) {
      settlement.nextLocalElectionMinute = minute + LOCAL_RETRY_DAYS * MINUTES_PER_DAY;
      return;
    }
    // The team's own candidates stand beside them, on their party's platform
    // (candidacies), and the party's supporters vote for them.
    const standing = candidacies(state).filter(c => c.status === "standing" && c.level === "local" && c.polity === settlement.group); // i18n-ignore: status id, level id
    const platform = candidatePlatform(state);
    const supporters = new Set(state.playerParty ? livePlayerSupporters(state) : []);
    for (const c of standing) candidates.push({ name: c.actor, player: true, ideology: platform });
    const ideologyOfCand = (cand) => cand.ideology || state.identities[cand.name].ideology;

    // Every resident votes for the candidate ideologically closest to them.
    const votes = {};
    for (const voter of residents) {
      const vid = state.identities[voter];
      let best = null, bestD = Infinity;
      for (const cand of candidates) {
        if (cand.name === voter) { best = cand; break; } // you always vote for yourself
        const d = ideologyDistance(vid.ideology, ideologyOfCand(cand)) - (cand.player ? candidateCharisma(cand.name) : 0);
        if (d < bestD) { bestD = d; best = cand; }
      }
      if (standing.length && supporters.has(voter)) best = candidates.find(c => c.player) || best;
      if (best) votes[best.name] = (votes[best.name] || 0) + 1;
    }
    const winner = candidates.slice().sort((a, b) => (votes[b.name] || 0) - (votes[a.name] || 0))[0];
    const winnerName = winner.name;
    for (const c of standing) {
      c.share = +(100 * (votes[c.actor] || 0) / residents.length).toFixed(1);
      c.winnerShare = +(100 * (votes[winnerName] || 0) / residents.length).toFixed(1);
      c.winner = winnerName;
      c.status = c.actor === winnerName ? "won" : "lost"; // i18n-ignore: status ids
    }
    if (winner.player) ensureCandidateIdentity(state, winnerName, settlement.group, platform);

    // Clear old officeholders.
    for (const office of LOCAL_OFFICES) {
      const prev = settlement.offices[office];
      if (prev && state.identities[prev]) state.identities[prev].localOffice = null;
      settlement.offices[office] = null;
    }

    // Seat the mayor; the mayor appoints allies to the remaining offices.
    settlement.offices.mayor = winnerName;
    state.identities[winnerName].localOffice = "mayor";
    pushIdentityEvent(state.identities[winnerName], minute, "office", "Politics.identity.electedMayor",
      { group: settlement.group, votes: votes[winnerName] || 0, total: residents.length });
    window.NPCSim?.StoryLogger?.record?.(winnerName, "politics",
      "Politics.story.electedMayor", { group: settlement.group });

    const mayorIdeology = state.identities[winnerName].ideology;
    const pool = residents.filter(n => n !== winnerName && !holdsStateOffice(n))
      .sort((a, b) => ideologyDistance(mayorIdeology, state.identities[a].ideology)
                    - ideologyDistance(mayorIdeology, state.identities[b].ideology));
    for (const office of LOCAL_OFFICES.slice(1)) {
      const appointee = pool.shift();
      if (!appointee) break;
      settlement.offices[office] = appointee;
      state.identities[appointee].localOffice = office;
      pushIdentityEvent(state.identities[appointee], minute, "office", "Politics.identity.appointed",
        { office: officeLabel(office), group: settlement.group });
      window.NPCSim?.StoryLogger?.record?.(appointee, "politics",
        "Politics.story.appointed", { office: officeLabel(office), group: settlement.group });
    }

    settlement.history.unshift({
      minute, date: dateStrOf(minute), mayor: winnerName,
      votes: residents.length, offices: { ...settlement.offices },
    });
    if (settlement.history.length > SETTLEMENT_LOG_CAP) settlement.history.pop();
    settlement.nextLocalElectionMinute = minute + LOCAL_TERM_DAYS * MINUTES_PER_DAY;
  }

  // ==========================================================================
  // REAL POLITICIANS, the elected made into people
  // ==========================================================================
  // A politician used to be a record and nothing more: a name, a handful of
  // numbers and an office inside a polity. Whoever holds an office of a nation
  // or of a bloc is now also SOMEBODY: a society profile living in the seat of
  // that government (the capital's own town, or a square of that country), a
  // life record, a door in the resident register and an appointed job the
  // schedule reads, so they go to work in the capital, come home at night and
  // can be met, talked to and killed like anybody else.
  //
  // Bounded on purpose. The offices are, in this order: the head, the
  // ministers (the leaders of the parties in government), the leaders of the
  // other seated parties and, where the system has them, the electors. At most
  // REAL_POL.PER_POLITY a polity, never more than REAL_POL.TOTAL office holders
  // in the world at once, and REAL_POL.PER_PASS new people a catch-up. Heads
  // are dealt first everywhere, then ministers and so on, so a crowded world
  // spends its budget on the offices that matter.
  //
  // Left out, and kept special: the main players. Anybody the book of leaders
  // wrote down (LeaderPersona.isBookLeader, a HistoryManager leader record, a
  // head SEATED_ON_DAY_ONE, a `real`, `canonHead` or `protected` politician)
  // and the authored cast (NPCSystem.isStoryName / isReservedName). The local
  // offices (mayor and the rest) are already held by residents and are not
  // touched here.
  //
  // The link runs both ways: pol.npcName on the record, profile._politicianId
  // (with _politicianOf, the polity's name, and _politicianKind) on the
  // person, and profile._politicsOffice while they hold the office. A
  // politician the politics bury dies in the world too (NPCLifeSim.killNpc); a
  // person killed in the world leaves the office (onPersonDied, called from
  // killNpc). The register lives with the rest of the politics, per world:
  // state.realPoliticians = { name: { polId, polity, kind, role, group, since, gone } }.

  const REAL_POL = Object.freeze({ PER_POLITY: 6, TOTAL: 160, PER_PASS: 12 });
  // The appointed trades of js/db/WorkSystem/Jobs.json (`appointed: true`):
  // never dealt by a town's job roster, never offered to the party, only
  // pinned onto an office holder here.
  const OFFICE_JOBS = Object.freeze({ head: 168, minister: 169, partyLeader: 170, legislator: 171 });
  const OFFICE_ROLE_ORDER = Object.freeze(["head", "minister", "partyLeader", "legislator"]);
  const OFFICE_JOB_IDS = new Set(Object.values(OFFICE_JOBS));
  const OFFICE_WORK_SHIFT = 1;   // 08-16, the day the offices keep

  function realRegistry(state) {
    if (!state.realPoliticians || typeof state.realPoliticians !== "object") state.realPoliticians = {};
    return state.realPoliticians;
  }

  function polityByKind(state, kind, name) {
    if (!state || !name) return null;
    return kind === "nation" ? (state.nations?.[name] || null) : (state.powers?.[name] || null);
  }

  // Holds an office of a nation or a bloc right now.
  function holdsStateOffice(name) {
    return !!getProfile(name)?._politicsOffice;
  }

  // The people the world is written around. They keep the special handling
  // they already have (LeaderPersona dossiers, the wiki's Main Players shelf)
  // and are never minted here as ordinary townsfolk.
  function isMainPlayer(pol) {
    if (!pol || !pol.name) return true;
    if (pol.real || pol.canonHead || pol.protected || pol.leaderId) return true;
    const name = pol.name;
    if (SEATED_ON_DAY_ONE && Object.values(SEATED_ON_DAY_ONE).includes(name)) return true;
    try { if (window.LeaderPersona?.isBookLeader?.(name)) return true; } catch (_) { /* no persona service */ }
    if (window.HistoryManager?.getLeaderRecord?.(name)) return true;
    const NS = window.NPCSystem;
    try {
      if (NS?.isStoryName?.(name) || NS?.isReservedName?.(name)) return true;
    } catch (_) { /* the manifest is not loaded */ }
    return false;
  }

  // Everybody who holds an office of this polity, in the order they matter:
  // [{ pol, role }], each politician once, the living only.
  function officeHoldersOf(polity) {
    const out = [];
    if (!polity) return out;
    const seen = new Set();
    const add = (pol, role) => {
      if (!pol || !pol.alive || seen.has(pol.id)) return;
      seen.add(pol.id);
      out.push({ pol, role });
    };
    const pols = polity.politicians || {};
    add(pols[polity.headId], "head");
    for (const partyId of (polity.coalition || [])) {
      const party = partyById(polity, partyId);
      if (party) add(pols[party.leaderId], "minister");
    }
    const seated = (polity.parties || []).filter(p => (p.seats || 0) > 0)
      .sort((a, b) => (b.seats - a.seats) || String(a.id).localeCompare(String(b.id)));
    for (const party of seated) add(pols[party.leaderId], "partyLeader");
    for (const id of (polity.electors || [])) add(pols[id], "legislator");
    return out;
  }

  // The office, in the reader's words: a head wears their polity's own title,
  // an elector theirs.
  function roleLabel(role, polity) {
    if (role === "head") return powerLabel(polity, "headTitle");
    if (role === "legislator" && polity && (polity.electors || []).length) return powerLabel(polity, "electorTitle");
    const key = "Politics.role." + role;
    return T.has(key) ? T(key) : String(role || "");
  }

  // Where a government sits: a nation in itself, a bloc in its home nation
  // (or the first world it holds, for a power with no seat on Earth).
  function seatCountryOf(polity) {
    if (!polity) return null;
    if (polity.kind === "nation") return polity.name;
    return polity.homeNation || (polity.memberCountries || [])[0] || null;
  }

  function isProcGroupName(groupName) {
    const grp = $gameSystem?._npcMapGroups?.[groupName];
    if (grp && (grp._procedural || grp._tower)) return true;
    try { return !!window.NPCSystem?.isProceduralGroup?.(groupName); } catch (_) { return false; }
  }

  // The group the office holders of a polity live in: a hand-made town of its
  // seat nation before a procedural square of it, the first by name, so the
  // same world always seats its government in the same place. Only a group
  // whose nation is KNOWN counts (resolveGroupPolity strict): a guess is no
  // capital. Null when the world holds no place of that nation yet; the
  // office holders are then minted the first time it does.
  // The groups of every nation, kept between passes until the world's list of
  // groups changes: a polity whose seat has no place yet asks again every day.
  let _seatIndex = null, _seatIndexKey = "";
  function seatGroupOf(state, polity, cache) {
    const country = seatCountryOf(polity);
    if (!country) return null;
    const groupsNow = $gameSystem?._npcMapGroups || {};
    const indexKey = Object.keys(groupsNow).length + "|" + (state.nations ? Object.keys(state.nations).length : 0);
    if (!cache.byCountry && _seatIndex && _seatIndexKey === indexKey) cache.byCountry = _seatIndex;
    if (!cache.byCountry) {
      cache.byCountry = {};
      _seatIndex = cache.byCountry;
      _seatIndexKey = indexKey;
      const groups = groupsNow;
      const seatedGlobal = new Set(window.NPCSystem?.SEATED_GLOBAL_GROUPS || []);
      for (const groupName of Object.keys(groups).sort()) {
        const grp = groups[groupName];
        if (!grp || grp._camp || seatedGlobal.has(groupName)) continue;
        let found = null;
        try { found = resolveGroupPolity(state, groupName, { strict: true }).country; } catch (_) { found = null; }
        if (!found) continue;
        (cache.byCountry[found] = cache.byCountry[found] || []).push(groupName);
      }
    }
    const list = cache.byCountry[country] || [];
    return list.find(g => !isProcGroupName(g)) || list[0] || null;
  }

  // The map an office is worked on: the group's own main map.
  function workMapOf(groupName) {
    const grp = $gameSystem?._npcMapGroups?.[groupName];
    if (!grp) return null;
    return (grp.mainMaps || [])[0] ?? (grp.maps || [])[0] ?? null;
  }

  // Takes up, changes or leaves an office: the pinned job, the flag the rest
  // of the simulation reads (_politicsOffice), and a line in the life story.
  function applyOffice(state, name, entry, role, polity, minute) {
    const profile = getProfile(name);
    if (!profile) return;
    const record = $gameSystem?._npcLifeRecords?.[name] || null;
    if (role) {
      const jobId = OFFICE_JOBS[role];
      const same = entry.role === role && profile.currentJobId === jobId;
      if (record) record.inOffice = true;
      if (same) {
        profile._politicsOffice = { role, polity: polity.name, kind: polity.kind };
        return;
      }
      // Whatever shift the town had dealt them goes back to the town.
      if (profile.currentJobId && !OFFICE_JOB_IDS.has(profile.currentJobId)) {
        try { window.NPCSim?.JobShiftManager?.releaseSlot?.(name); } catch (_) { /* no roster loaded */ }
      }
      profile._politicsOffice = { role, polity: polity.name, kind: polity.kind };
      profile.currentJobId = jobId;
      profile.workMapId = workMapOf(entry.group);
      profile.workShift = OFFICE_WORK_SHIFT;
      profile._routineDay = -1;
      if (entry.role !== role) {
        window.NPCLifeSim?.pushEvent?.(name, minute, "career", "Politics.life.tookOffice", // i18n-ignore: life event type
          { office: roleLabel(role, polity), polity: polity.name });
      }
      entry.role = role;
      return;
    }
    if (!entry.role && !profile._politicsOffice) return;
    const was = entry.role;
    entry.role = null;
    profile._politicsOffice = null;
    if (record) record.inOffice = false;
    if (OFFICE_JOB_IDS.has(profile.currentJobId)) {
      // Back among the townsfolk: the town's roster deals them a trade again.
      profile.currentJobId = null;
      profile.workMapId = null;
      profile.workShift = null;
      profile._routineDay = -1;
    }
    if (was) {
      window.NPCLifeSim?.pushEvent?.(name, minute, "career", "Politics.life.leftOffice", // i18n-ignore: life event type
        { office: roleLabel(was, polity), polity: polity.name });
    }
  }

  // One politician becomes a person living in `group`. False when the world
  // cannot have them (yet, or at all: the name is somebody else's).
  function materialise(state, polity, pol, role, group, minute) {
    const name = pol.name;
    const Reg = window.NPCSocietyRegistry;
    if (!Reg?.ensureProfile || window._NPCSocietyDataLoader?.isReady === false) return false;
    if (window.NPCLifeSim?.isDead?.(name)) { pol._npcBlocked = "dead"; return false; } // i18n-ignore: reason id
    let profile = getProfile(name);
    // A name the world already gave to somebody else stays theirs. A profile
    // minted lazily for this very name (the wiki opened them by name) is the
    // same person and is adopted.
    if (profile && (profile._politicianId ? profile._politicianId !== pol.id
        : (profile._homeGroupName || profile._resident || profile.playerCreated || profile._killed))) {
      pol._npcBlocked = "nameTaken"; // i18n-ignore: reason id
      return false;
    }
    const age = politicianAge(pol, minute);
    const mapId = workMapOf(group);
    if (!profile) {
      const rng = new PolRng(worldSeed() ^ nameHash("office-person:" + name));
      const classRng = { nextInt: (lo, hi) => lo + Math.floor(rng.next() * Math.max(1, hi - lo)) };
      const classId = window.NPCCreature?.rollHumanoidClassId?.(classRng) ?? null;
      try {
        profile = Reg.ensureProfile(name, classId, group, mapId ?? undefined, { initSpec: { age: String(age) } }) || null;
      } catch (e) {
        console.error("[NPCPolitics] could not make a person of " + name, e);
        profile = null;
      }
    }
    if (!profile) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) { pol._npcBlocked = "creature"; return false; } // i18n-ignore: reason id

    profile._politicianId = pol.id;
    profile._politicianOf = polity.name;
    profile._politicianKind = polity.kind;
    pol.npcName = name;
    if (!profile._homeGroupName) profile._homeGroupName = group;
    // A door in the capital, on its resident register (or among a square's
    // newcomers): what makes them spawn where they live.
    try { window.NPCSystem?.rehomeResident?.(name, null, group); }
    catch (e) { console.error("[NPCPolitics] no door for " + name + " in " + group, e); }
    if (!profile._homeGroupName) profile._homeGroupName = group;
    try { window.NPCLifeSim?.ensureLifeRecord?.(name, group, undefined, { age }); }
    catch (e) { console.error("[NPCPolitics] no life record for " + name, e); }
    // Their vote is where they live now, like anybody's.
    try { ensureIdentity(state, name, group, minute); } catch (_) { /* no identity, no vote */ }
    _populationCache = null;

    const entry = { polId: pol.id, polity: polity.name, kind: polity.kind, role: null, group, since: minute };
    realRegistry(state)[name] = entry;
    applyOffice(state, name, entry, role, polity, minute);
    return true;
  }

  // The politics buried somebody who is also a person: the world buries them
  // too, through the one death path.
  let _burying = false;
  function buryPerson(pol, cause) {
    const name = pol && pol.npcName;
    const Life = window.NPCLifeSim;
    if (!name || _burying || !Life?.killNpc) return false;
    if (Life.isDead?.(name) || getProfile(name)?._killed) return false;
    const key = cause && cause.key;
    // i18n-ignore-start: death cause ids
    const why = key === "Politics.death.illness"
      ? { kind: "illness", illness: cause.params?.disease || null }
      : key === "Politics.death.naturalCauses"
        ? { kind: "natural" }
        : { kind: "politics", eventKey: "Politics.life.diedInOffice", eventParams: { cause: textOf(cause) } };
    // i18n-ignore-end
    _burying = true;
    try { Life.killNpc(name, why); }
    catch (e) { console.error("[NPCPolitics] the world could not bury " + name, e); }
    finally { _burying = false; }
    const state = $gameSystem?._npcPolitics;
    const entry = state?.realPoliticians?.[name];
    if (entry) {
      const polity = polityByKind(state, entry.kind, entry.polity);
      if (polity) applyOffice(state, name, entry, null, polity, nowMinuteVar());
      entry.gone = true;
    }
    return true;
  }

  // An office left empty by a death the politics did not cause: the party
  // finds a new leader, the electors a new colleague, and a head of state is
  // replaced at the polls straight away, the way an assassination is.
  function vacateOffices(state, polity, pol, minute) {
    const rng = new PolRng(worldSeed() ^ nameHash("vacate:" + pol.id) ^ ((minute >>> 0) || 1));
    const party = partyById(polity, pol.partyId);
    if (party && party.leaderId === pol.id) {
      party.leaderId = makePolitician(polity, rng, minute, { ideology: party.platform, spread: 20, partyId: party.id }).id;
    }
    const electorIdx = (polity.electors || []).indexOf(pol.id);
    if (electorIdx >= 0) {
      const successor = makePolitician(polity, rng, minute, { spread: 25 });
      successor.office = polity.electorTitle;
      polity.electors[electorIdx] = successor.id;
    }
    if (pol.id === polity.headId) {
      pol.office = null;
      resolveElection(state, polity, minute, rng, { label: "snap" });
      if (polity.nextElectionMinute != null) polity.nextElectionMinute = minute + polity.termDays * MINUTES_PER_DAY;
    }
  }

  // Somebody died in the world (NPCLifeSim.killNpc). When they held an office
  // of a nation or a bloc, the office is theirs no more.
  function onPersonDied(name) {
    if (_burying) return false;
    const state = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._npcPolitics : null;
    const entry = state?.realPoliticians?.[name];
    if (!entry || entry.gone) return false;
    const polity = polityByKind(state, entry.kind, entry.polity);
    const pol = polity?.politicians?.[entry.polId] || null;
    entry.gone = true;
    if (!polity || !pol || !pol.alive) return false;
    const minute = nowMinuteVar();
    const wasHead = pol.id === polity.headId;
    const age = politicianAge(pol, minute);
    _burying = true;   // the world has already buried them
    try {
      killPolitician(polity, pol, minute, { key: "Politics.death.diedInWorld" });
    } finally { _burying = false; }
    pushPowerEvent(polity, minute, "death", wasHead ? "Politics.event.headDies" : "Politics.event.politicianDies",
      { name: pol.name, age, power: polity.name, title: powerLabel(polity, "headTitle") });
    applyOffice(state, name, entry, null, polity, minute);
    vacateOffices(state, polity, pol, minute);
    return true;
  }

  // Keeps every link true and mints the office holders the world is missing.
  // Run by the catch-up once a simulated day at most. Answers how many new
  // people were made.
  function syncRealPoliticians(state, minute) {
    if (!state) return 0;
    const reg = realRegistry(state);
    const Life = window.NPCLifeSim;
    const rolesByPolity = new Map();
    const rolesOf = (polity) => {
      const key = polity.kind + ":" + polity.name;
      if (!rolesByPolity.has(key)) {
        const roles = new Map();
        for (const { pol, role } of officeHoldersOf(polity)) roles.set(pol.id, role);
        rolesByPolity.set(key, roles);
      }
      return rolesByPolity.get(key);
    };
    const live = new Set(livePolities(state));

    // 1. The people already made: deaths either way, and the office they hold
    //    today (won, lost, promoted, sent back to the benches).
    let active = 0;
    for (const [name, entry] of Object.entries(reg)) {
      if (!entry || entry.gone) continue;
      const polity = polityByKind(state, entry.kind, entry.polity);
      const pol = polity?.politicians?.[entry.polId] || null;
      if (!polity || !pol) { entry.gone = true; continue; }
      const personDead = !!(Life?.isDead?.(name) || getProfile(name)?._killed);
      if (!pol.alive && !personDead) { buryPerson(pol, pol.deathCause); continue; }
      if (pol.alive && personDead) { onPersonDied(name); continue; }
      if (!pol.alive) { applyOffice(state, name, entry, null, polity, minute); entry.gone = true; continue; }
      // A polity the world no longer simulates (a monster world's human
      // governments) keeps its people, out of office.
      const role = live.has(polity) ? (rolesOf(polity).get(pol.id) || null) : null;
      applyOffice(state, name, entry, role, polity, minute);
      if (role) active++;
    }

    // 2. The office holders nobody has made yet, heads first everywhere.
    if (active >= REAL_POL.TOTAL) return 0;
    const wanted = [];
    for (const polity of live) {
      const holders = officeHoldersOf(polity).filter(h => !isMainPlayer(h.pol)).slice(0, REAL_POL.PER_POLITY);
      holders.forEach((h, rank) => {
        if (!h.pol.npcName && !h.pol._npcBlocked) wanted.push({ polity, pol: h.pol, role: h.role, rank });
      });
    }
    wanted.sort((a, b) => (a.rank - b.rank) ||
      (OFFICE_ROLE_ORDER.indexOf(a.role) - OFFICE_ROLE_ORDER.indexOf(b.role)) ||
      ((a.polity.kind === "nation" ? 0 : 1) - (b.polity.kind === "nation" ? 0 : 1)) ||
      String(a.polity.name).localeCompare(String(b.polity.name)));
    const cache = {};
    let made = 0;
    // Minting a person asks the book about everybody already minted; no office
    // changes hands in this loop, so each of those answers is asked once.
    const pass = () => {
      for (const want of wanted) {
        if (made >= REAL_POL.PER_PASS || active >= REAL_POL.TOTAL) break;
        const group = seatGroupOf(state, want.polity, cache);
        if (!group) continue;
        if (materialise(state, want.polity, want.pol, want.role, group, minute)) { made++; active++; }
      }
    };
    const Reg = window.NPCSocietyRegistry;
    if (Reg?.withLeaderMemo) Reg.withLeaderMemo(pass); else pass();
    return made;
  }

  // ==========================================================================
  // THE PLACE, what the Politics menu reads
  // ==========================================================================
  // Every government with a say over one place: the settlement's own offices,
  // the nation it stands in and the bloc that holds that nation. Reads the
  // state and never creates it, so asking costs nothing in a world with no
  // politics.

  function politicsLive() {
    if (isEmptyWorld()) return false;
    const WMo = window.NPCShared?.WorldModes;
    return !(WMo && !WMo.hasPolitics());
  }

  // Whether the world simulates this polity at all (a monster world runs its
  // monster governments only).
  function isLivePolity(polity) {
    if (!polity || !politicsLive()) return false;
    return !monsterPowersOnly() || isMonsterPolity(polity);
  }

  function describePlace(groupName) {
    const state = (typeof $gameSystem !== "undefined" && $gameSystem) ? ($gameSystem._npcPolitics || null) : null;
    const group = groupName || currentGroupName();
    const countries = getCountries();
    let country = null, powerName = null;
    const towerWorld = group ? (window.TowerWorlds?.worldOfGroup?.(group) || null) : null;
    if (towerWorld && !towerWorld.earthborn) {
      country = towerWorld.name;
      powerName = towerWorld.powerName || null;
    } else {
      if (group && state) {
        try { country = resolveGroupPolity(state, group, { strict: true }).country || null; } catch (_) { country = null; }
      }
      if (!country) {
        const here = (typeof $gameWeather !== "undefined" && $gameWeather) ? $gameWeather.currentCountry : null;
        const id = (typeof $gameVariables !== "undefined" && $gameVariables) ? ($gameVariables.value(86) || 0) : 0;
        const byId = id && id !== 255 ? countries.find(c => c.id === id) : null;
        country = byId?.country || here?.country || null;
      }
      if (country) {
        const holder = canonicalFaction(controllerOfCountry(country));
        powerName = holder && holder !== "Neutral" ? holder : null;
      }
    }
    const grp = group ? ($gameSystem?._npcMapGroups?.[group] || null) : null;
    const nation = country && state ? (state.nations?.[country] || null) : null;
    const power = powerName && state ? (state.powers?.[powerName] || null) : null;
    return {
      group: group || null,
      groupLabel: grp?.displayName || grp?.foundedTown || group || null,
      country, powerName,
      settlement: group && state ? (state.settlements?.[group] || null) : null,
      nation: isLivePolity(nation) ? nation : null,
      power: isLivePolity(power) ? power : null,
      live: politicsLive(),
    };
  }

  // Everybody holding an office over a place, level by level:
  // [{ name, level: "local" | "nation" | "power", role, office, polity, person, main, partyId }].
  function electedOf(place) {
    const out = [];
    if (!place) return out;
    const reg = $gameSystem?._npcPolitics?.realPoliticians || {};
    const settlement = place.settlement;
    if (settlement && settlement.offices && place.live) {
      for (const office of LOCAL_OFFICES) {
        const name = settlement.offices[office];
        if (!name) continue;
        out.push({ name, level: "local", role: office, office: officeLabel(office),
          polity: settlement.group, person: true, main: false, partyId: null });
      }
    }
    const addPolity = (polity, level) => {
      if (!polity) return;
      for (const { pol, role } of officeHoldersOf(polity)) {
        out.push({
          name: pol.name, level, role, office: roleLabel(role, polity), polity: polity.name,
          person: !!(pol.npcName && reg[pol.npcName] && !reg[pol.npcName].gone),
          main: isMainPlayer(pol), partyId: pol.partyId || null, polId: pol.id,
        });
      }
    };
    addPolity(place.nation, "nation");
    addPolity(place.power, "power");
    return out;
  }

  // ==========================================================================
  // CATCH-UP, the delta engine
  // ==========================================================================

  let _catchUpRunning = false;


  // True in a world created with populationMode "empty" (WorldManager).
  function isEmptyWorld() {
    const WMo = window.NPCShared?.WorldModes;
    if (WMo && !WMo.simulatesPeople()) return true;
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
  }

  // opts.fromClock: asked for by the running clock; leaves the world files to
  // the next save instead of writing them here.
  function catchUp(nowMinute, opts) {
    if (_catchUpRunning) return;
    // No electorate, no candidates, no coups: political time does not pass in
    // an empty world. See WorldManager.populationMode.
    if (isEmptyWorld()) return;
    const WMo = window.NPCShared?.WorldModes;
    if (WMo && !WMo.hasPolitics()) return;
    const state = getState();
    if (!state) return;
    _catchUpRunning = true;
    try {
      // Two clocks (TOWER CLOCK): Earth's powers, settlements and people run
      // on Earth's minute, the Omega Tower's on the tower's own
      // (NPCShared.towerTime), each from a cursor of its own. The tower's clock
      // only moves while a party is on its levels, so it never catches up on
      // time spent out in the world.
      const tower = window.NPCShared?.towerTime?.() || null;
      const earthSide = clockSide(tower, false), towerSide = clockSide(tower, true);
      ensurePowers(state, nowMinute);
      ensureSeatNations(state, nowMinute);
      repairDeclaredCountries(state);
      ensureIdentities(state, nowMinute);
      ensureSettlements(state, nowMinute, tower);

      if (state.lastSimMinute === null || state.lastSimMinute === undefined) {
        state.lastSimMinute = nowMinute;
        if (tower) state.towerLastSimMinute = tower.now;
        // Resolve any elections the bootstrap already made due (incl. local).
        runDueElections(state, nowMinute, nowMinute, earthSide);
        if (tower) runDueElections(state, tower.now, tower.now, towerSide);
        syncRealPoliticians(state, nowMinute);
        return;
      }
      // The tower's own, up to the tower's minute.
      if (tower) {
        const from = state.towerLastSimMinute;
        if (from === null || from === undefined || tower.now < from) state.towerLastSimMinute = tower.now;
        else if (tower.now - from >= MINUTES_PER_DAY) {
          state.towerLastSimMinute = simulateSpan(state, from, tower.now, towerSide);
        }
      }
      if (nowMinute < state.lastSimMinute) { state.lastSimMinute = nowMinute; return; } // time rewound
      const deltaMinutes = nowMinute - state.lastSimMinute;
      if (deltaMinutes < MINUTES_PER_DAY) return; // accumulate sub-day deltas

      const cursor = simulateSpan(state, state.lastSimMinute, nowMinute, earthSide);
      state.lastSimMinute = cursor;
      // Whoever holds an office now is somebody in the world (REAL POLITICIANS).
      syncRealPoliticians(state, cursor);
      // The party's own campaigns and dues (THE PARTY'S OWN POLITICAL PARTY).
      advancePlayerPolitics(cursor);

      if (deltaMinutes >= SKIP_FLUSH_MINUTES && !opts?.fromClock) {
        try { window.WorldManager?.flush?.(); } catch (_) { /* flush is best-effort */ }
      }
    } finally {
      _catchUpRunning = false;
    }
  }

  // Which entries a pass owns: Earth's, or the Omega Tower's (TOWER CLOCK).
  // A tower settlement or citizen is one by its group ("Tower:-5"), so an
  // Earthling colony up the shaft lives on the tower's clock although it
  // votes in an Earth nation. With no tower everything is Earth's.
  function clockSide(tower, onTower) {
    const power = (name) => !!tower && tower.power(name);
    const settlement = (s) => !!tower && (tower.group(s.group) || tower.power(s.power));
    const identity = (i) => !!tower && (tower.group(i.group) || tower.power(i.power));
    return {
      power: (name) => power(name) === onTower,
      settlement: (s) => settlement(s) === onTower,
      identity: (i) => identity(i) === onTower,
    };
  }

  // Whole days from one minute to another, in chunks, for one side's
  // entries. Returns the minute it got to.
  function simulateSpan(state, fromMinute, toMinute, side) {
    let cursor = fromMinute;
    let remaining = Math.floor((toMinute - fromMinute) / MINUTES_PER_DAY);
    while (remaining > 0) {
      const chunkDays = Math.min(CHUNK_DAYS, remaining);
      const chunkEnd = cursor + chunkDays * MINUTES_PER_DAY;
      runDueElections(state, cursor, chunkEnd, side);
      for (const power of livePolities(state)) {
        if (side && !side.power(power.name)) continue;
        simulatePowerChunk(state, power, cursor, chunkDays, chunkEnd);
      }
      simulateIdentitiesChunk(state, cursor, chunkDays, side);
      cursor = chunkEnd;
      remaining -= chunkDays;
    }
    return cursor;
  }

  function runDueElections(state, fromMinute, toMinute, side) {
    const monsterOnly = monsterPowersOnly();
    for (const power of livePolities(state)) {
      if (side && !side.power(power.name)) continue;
      let guard = 0;
      while (power.nextElectionMinute !== null && power.nextElectionMinute <= toMinute && guard++ < 200) {
        const at = Math.max(power.nextElectionMinute, fromMinute);
        resolveElection(state, power, at, null);
        power.nextElectionMinute = power.nextElectionMinute + power.termDays * MINUTES_PER_DAY;
      }
    }
    for (const settlement of Object.values(state.settlements)) {
      if (monsterOnly && !isMonsterPolity(state.powers[settlement.power])) continue;
      if (side && !side.settlement(settlement)) continue;
      let guard = 0;
      while (settlement.nextLocalElectionMinute <= toMinute && guard++ < 100) {
        resolveLocalElection(state, settlement, Math.max(settlement.nextLocalElectionMinute, fromMinute));
      }
    }
  }

  // ==========================================================================
  // SOCIAL INTEGRATION, opinions & conversation context
  // ==========================================================================

  // Political chemistry between two NPCs, -12..+12. Same party bonds;
  // ideological distance estranges; grudges curdle.
  function opinionModifier(nameA, nameB) {
    const state = $gameSystem?._npcPolitics;
    const a = state?.identities?.[nameA], b = state?.identities?.[nameB];
    if (!a || !b) return 0;
    let mod = clamp(Math.round(10 - ideologyDistance(a.ideology, b.ideology) * 0.15), -12, 10);
    if (a.partyId && a.partyId === b.partyId) mod += 4;
    if (a.grudgePartyId && a.grudgePartyId === b.partyId) mod -= 6;
    return clamp(mod, -12, 12);
  }

  // Everything NPCConversation's PoliticsProvider needs to phrase a thought.
  function getConversationContext(npcName) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    if (!identity) return null;
    const power = state.powers[identity.power];
    if (!power) return null;
    const party = partyById(power, identity.partyId);
    const head = power.politicians[power.headId];
    const lastElection = power.elections[0] || null;
    const nowMinute = nowMinuteVar();

    let stance = "apathetic"; // i18n-ignore: keys ConvPolitics.stance in NPCConversation
    if (identity.engagement >= 25) {
      const supports = identity.partyId === power.rulingPartyId || power.coalition.includes(identity.partyId);
      const extreme = AXES.some(ax => Math.abs(identity.ideology[ax]) >= 85);
      stance = extreme && identity.engagement >= 60 ? "radical" : supports ? "support" : "oppose";
    }

    let gripe = null;
    if (power.policies.curfew) gripe = T("Politics.gripe.curfew");
    else if (power.policies.taxRate >= 28) gripe = T("Politics.gripe.taxes");
    else if (power.policies.censorship >= 55) gripe = T("Politics.gripe.censors");
    else if (power.policies.conscription >= 55) gripe = T("Politics.gripe.draft");

    const hotRumor = power.rumors.find(r => r.spread >= 40) || null;

    return {
      stance,
      powerName: power.name,
      govType: powerLabel(power, "govType"),
      headTitle: powerLabel(power, "headTitle"),
      headName: head?.name ?? T("Politics.fallback.nobody"),
      partyName: party?.name ?? T("Politics.fallback.noOne"),
      partyKind: powerLabel(power, "partyKind"),
      electionLabel: labelOf(power),
      daysToElection: power.nextElectionMinute != null ? Math.max(0, Math.round((power.nextElectionMinute - nowMinute) / MINUTES_PER_DAY)) : null,
      lastElectionWon: !!(lastElection && identity.votedLast && identity.votedLast.partyId === lastElection.winnerPartyId),
      lastWinnerName: lastElection?.winner ?? null,
      rumorSubject: hotRumor?.subjectName ?? null,
      rumorKind: hotRumor ? rumorKindLabel(hotRumor.kind) : null,
      gripe,
      unrest: Math.round(power.state.unrest),
      engagement: identity.engagement,
      localOffice: identity.localOffice ? officeLabel(identity.localOffice) : null,
      group: identity.group,
    };
  }

  // ==========================================================================
  // REPORT BUILDERS
  // ==========================================================================

  function meterBar(v) {
    const filled = Math.round(clamp(v, 0, 100) / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  }

  function buildPowerReport(powerName) {
    const state = $gameSystem?._npcPolitics;
    const power = state?.powers?.[canonicalFaction(powerName)];
    if (!power) return T("Politics.report.noPower", { power: powerName });
    const head = power.politicians[power.headId];
    const ruling = partyById(power, power.rulingPartyId);
    const lines = [];
    lines.push(T("Politics.report.header", { power: power.name, govType: powerLabel(power, "govType") }));
    lines.push(T("Politics.report.head", {
      title: powerLabel(power, "headTitle"),
      value: head
        ? T("Politics.report.headValue", { name: head.name, approval: Math.round(head.approval) })
        : T("Politics.report.vacant"),
    }));
    lines.push(T("Politics.report.ruling", {
      partyKind: powerLabel(power, "partyKind"),
      party: ruling?.name ?? "-",
      partners: power.coalition.length > 1
        ? " " + T.n("Politics.report.coalitionPartners", power.coalition.length - 1, { n: power.coalition.length - 1 })
        : "",
    }));
    lines.push(T("Politics.report.meters1", { legitimacy: meterBar(power.state.legitimacy), stability: meterBar(power.state.stability) }));
    lines.push(T("Politics.report.meters2", { unrest: meterBar(power.state.unrest), economy: meterBar(power.state.economyMood) }));
    lines.push(T("Politics.report.policies", {
      tax: power.policies.taxRate, censorship: power.policies.censorship,
      conscription: power.policies.conscription, welfare: power.policies.welfare,
      curfew: power.policies.curfew ? " · " + T("Politics.report.curfew") : "",
    }));
    const last = power.elections[0];
    if (last) lines.push(T("Politics.report.lastElection", {
      election: labelOf(power).toLowerCase(), date: last.date,
      winner: last.winner, share: last.results?.[0]?.share ?? "?",
    }));
    if (power.nextElectionMinute != null) lines.push(T("Politics.report.nextElection", {
      election: labelOf(power).toLowerCase(), date: dateStrOf(power.nextElectionMinute),
    }));
    const recent = power.events.slice(0, 4);
    if (recent.length) {
      lines.push(T("Politics.report.recentEvents"));
      for (const e of recent) lines.push(`  ${e.date}, ${textOf(e)}`);
    }
    return lines.join("\n");
  }

  function buildElectionReport(powerName) {
    const state = $gameSystem?._npcPolitics;
    const power = state?.powers?.[canonicalFaction(powerName)];
    if (!power) return T("Politics.report.noPower", { power: powerName });
    const lines = [T("Politics.report.electionHeader", { power: power.name, election: labelOf(power) })];
    if (power.nextElectionMinute != null) lines.push(T("Politics.report.next", { date: dateStrOf(power.nextElectionMinute) }));
    for (const e of power.elections.slice(0, 6)) {
      lines.push(T("Politics.report.electionRow", {
        date: e.date,
        snap: e.label === "snap" ? " " + T("Politics.report.snap") : "",
        winner: e.winner,
        turnout: e.turnout != null ? T("Politics.report.turnout", { turnout: e.turnout }) : "",
      }));
      for (const r of (e.results || []).slice(0, 4)) {
        lines.push(T("Politics.report.resultRow", {
          share: r.share,
          seats: r.seats != null ? " " + T.n("Politics.report.seats", r.seats, { n: r.seats }) : "",
          name: r.name,
        }));
      }
      for (const n of e.notes || []) lines.push(`   * ${textOf(n)}`);
    }
    return lines.join("\n");
  }

  function buildNPCProfile(npcName) {
    const state = $gameSystem?._npcPolitics;
    const identity = state?.identities?.[npcName];
    if (!identity) return T("Politics.report.noIdentity", { name: npcName });
    const power = state.powers[identity.power];
    const party = power ? partyById(power, identity.partyId) : null;
    const lines = [];
    lines.push(T("Politics.report.citizen", {
      name: npcName, country: identity.country ?? T("Politics.fallback.partsUnknown"), power: identity.power,
    }));
    if (party) lines.push(T("Politics.report.sympathizes", { party: party.name }));
    const tag = (k) => T("Politics.tag." + k);
    const tags = [];
    if (identity.ideology.econ <= -40) tags.push(tag("collectivist")); else if (identity.ideology.econ >= 40) tags.push(tag("freeMarketeer"));
    if (identity.ideology.auth <= -40) tags.push(tag("libertarian")); else if (identity.ideology.auth >= 40) tags.push(tag("authoritarian"));
    if (identity.ideology.trad <= -40) tags.push(tag("progressive")); else if (identity.ideology.trad >= 40) tags.push(tag("traditionalist"));
    if (identity.ideology.mil <= -40) tags.push(tag("pacifist")); else if (identity.ideology.mil >= 40) tags.push(tag("militarist"));
    if (identity.ideology.myst <= -40) tags.push(tag("rationalist")); else if (identity.ideology.myst >= 40) tags.push(tag("mystic"));
    lines.push(T("Politics.report.leanings", { tags: tags.length ? tags.join(", ") : tag("moderate") }));
    lines.push(T("Politics.report.engagement", {
      engagement: identity.engagement,
      note: identity.engagement < 25 ? " " + T("Politics.report.apathetic")
          : identity.engagement >= 60 ? " " + T("Politics.report.activist") : "",
    }));
    if (identity.localOffice) lines.push(T("Politics.report.holdsOffice", {
      office: officeLabel(identity.localOffice), group: identity.group,
    }));
    if (identity.votedLast && power) {
      const voted = partyById(power, identity.votedLast.partyId);
      lines.push(T("Politics.report.lastVote", {
        party: voted?.name ?? T("Politics.fallback.spoiledBallot"),
        date: dateStrOf(identity.votedLast.minute),
      }));
    }
    if (identity.grudgePartyId && power) {
      lines.push(T("Politics.report.grudge", {
        party: partyById(power, identity.grudgePartyId)?.name ?? T("Politics.fallback.establishment"),
      }));
    }
    for (const e of identity.log.slice(0, 3)) lines.push(`${e.date}, ${textOf(e)}`);
    return lines.join("\n");
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  // ── Policy positions: what a platform actually DOES ─────────────────────────
  //
  // A platform is five numbers between -100 and 100, which says nothing to a
  // reader. js/db/WorldGen/Policies.json turns each of them into the policy a
  // government on that number would enact ("Conscription state", "Chartered
  // orders"), and every article that used to print a bar prints the policy.
  //
  // Four of the five fields read an axis of the platform directly. SCIENCE has
  // no axis in the simulation and is not going to get one - nobody votes on an
  // axis - so it is derived from the three that decide how a government treats
  // inquiry: mysticism and tradition both pull against it, a planned economy
  // pulls slightly toward the research state. It is a reading of the platform,
  // not a new number stored anywhere.
  function policyAxes(platform) {
    const p = platform || {};
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const sci = Math.max(-100, Math.min(100,
      Math.round(-0.55 * n(p.myst) - 0.35 * n(p.trad) - 0.10 * n(p.econ))));
    return { econ: n(p.econ), trad: n(p.trad), mil: n(p.mil), myst: n(p.myst), sci };
  }

  function policyFields() {
    const book = window.WorldGen && window.WorldGen.Policies;
    return (book && Array.isArray(book.fields)) ? book.fields : [];
  }

  // The policies a platform amounts to, one per field, in book order. Each
  // entry is { fieldId, fieldName, icon, value, policy } where `policy` is the
  // Policies.json band the value falls in (null for a field with no band).
  function policiesFor(platform) {
    const axes = policyAxes(platform);
    return policyFields().map(field => {
      const value = axes[field.axis] ?? 0;
      const band = (field.bands || []).find(b => value >= b.min && value <= b.max) || null;
      return { fieldId: field.id, fieldName: field.name, icon: field.icon || 0, value, policy: band };
    });
  }

  // ==========================================================================
  // THE PARTY'S OWN POLITICAL PARTY
  // ==========================================================================
  //
  // The party may found one political party of its own, and only one, the
  // same way it may raise one faction banner: founding is a thing the world
  // remembers. The record lives in the politics state
  // ($gameSystem._npcPolitics.playerParty), which WorldManager keeps in the
  // world folder, so every savegame of the world finds the same party.
  //
  // It stands on a creed out of Ideology.json and up to MAX_PLAYER_TENETS
  // tenets. Each tenet pushes the creed's five axes, so the platform is the
  // creed as the founders bent it, and policiesFor reads it like any other.
  //
  // It is NOT written into any polity's `parties`. Those rosters are what
  // every voter is drawn to (nearestPartyId) and what every ballot counts, and
  // slipping a party in there would reshuffle a whole nation's sympathies the
  // moment it was founded. Its members are listed on the record instead: the
  // team standing in the party when it is founded, and the team standing in it
  // when the party's faction is founded later (Game_Factions.foundPlayerFaction).

  const PLAYER_PARTY_ID = "party_player"; // i18n-ignore: record id
  const MAX_PLAYER_TENETS = 3;

  // What each tenet does to the platform. Two tenets on the same axis pulling
  // opposite ways cannot both be held: `axis` + the sign is the pole.
  const PLAYER_TENETS = [
    { id: "commonOwnership", shift: { econ: -30 } },
    { id: "freeEnterprise", shift: { econ: 30 } },
    { id: "liberty", shift: { auth: -30 } },
    { id: "order", shift: { auth: 30 } },
    { id: "progress", shift: { trad: -30 } },
    { id: "heritage", shift: { trad: 30 } },
    { id: "peace", shift: { mil: -30 } },
    { id: "strength", shift: { mil: 30 } },
    { id: "reason", shift: { myst: -30 } },
    { id: "arcana", shift: { myst: 30 } },
    { id: "welfare", shift: { econ: -15, auth: 10 } },
    { id: "localRule", shift: { auth: -15, trad: 10 } },
  ];

  function playerTenet(id) {
    return PLAYER_TENETS.find(t => t.id === id) || null;
  }

  // The one axis a tenet pulls hardest on, and which way.
  function tenetPole(tenet) {
    let best = null;
    for (const [axis, v] of Object.entries(tenet.shift)) {
      if (!best || Math.abs(v) > Math.abs(best.v)) best = { axis, v };
    }
    return best ? { axis: best.axis, sign: Math.sign(best.v) } : null;
  }

  // Two tenets clash when they pull the same axis opposite ways.
  function tenetsClash(a, b) {
    const pa = tenetPole(a), pb = tenetPole(b);
    return !!(pa && pb && pa.axis === pb.axis && pa.sign !== pb.sign);
  }

  // A tenet list cleaned up: known ids, no repeats, no clashes, at most
  // MAX_PLAYER_TENETS. The first of two clashing tenets is the one kept.
  function cleanTenets(ids) {
    const out = [];
    for (const id of (Array.isArray(ids) ? ids : [])) {
      const tenet = playerTenet(id);
      if (!tenet || out.includes(id)) continue;
      if (out.some(o => tenetsClash(playerTenet(o), tenet))) continue;
      out.push(id);
      if (out.length >= MAX_PLAYER_TENETS) break;
    }
    return out;
  }

  // The creeds a party can be founded on: every earthly creed. The off-world
  // ones belong to the powers that brought them.
  function foundableCreeds() {
    const list = window.WorldGen?.Ideology;
    return Array.isArray(list) ? list.filter(c => c && c.id && !c.alien) : [];
  }

  function playerPartyPlatform(ideologyId, tenetIds) {
    const creed = ideologyById(ideologyId);
    const base = creed ? window.NPCShared.ideologyAxes(creed) : {};
    const platform = {};
    for (const ax of AXES) platform[ax] = Number(base[ax]) || 0;
    for (const id of cleanTenets(tenetIds)) {
      const tenet = playerTenet(id);
      for (const [ax, v] of Object.entries(tenet.shift)) {
        if (ax in platform) platform[ax] = clamp(platform[ax] + v, -100, 100);
      }
    }
    return platform;
  }

  // A name rolled out of the word banks, for a founder who types none.
  function rollPlayerPartyName() {
    const pool = (key) => (typeof T.pool === "function" ? T.pool(key) : []);
    const pick = (key) => {
      const bank = pool(key);
      return bank.length ? bank[Math.floor(Math.random() * bank.length)] : "";
    };
    const forms = pool("Politics.player.nameForm");
    const form = forms.length ? forms[Math.floor(Math.random() * forms.length)] : "{adj} {noun}";
    const parts = { adj: pick("Politics.player.nameAdj"), noun: pick("Politics.player.nameNoun") };
    const name = String(form).replace(/\{(\w+)\}/g, (m, k) => parts[k] || "").replace(/\s+/g, " ").trim();
    return name || T("Politics.player.fallbackName");
  }

  function playerParty() {
    return $gameSystem?._npcPolitics?.playerParty ?? null;
  }

  // The team as it stands: every character in the party, by name.
  function teamNames() {
    const members = (window.$gameParty && $gameParty.allMembers) ? ($gameParty.allMembers() || []) : [];
    return members.filter(Boolean).map(m => m.name()).filter(Boolean);
  }

  // Everybody in the team joins, and a name already on the card is not written
  // twice. Answers the names that joined this time.
  function enrollTeamInPlayerParty() {
    const party = playerParty();
    if (!party) return [];
    const joined = [];
    for (const name of teamNames()) {
      if (party.members.includes(name)) continue;
      party.members.push(name);
      joined.push(name);
    }
    return joined;
  }

  // ---- the subscription ------------------------------------------------------
  //
  // A card costs a fixed weekly fee, in gold, which the founders set. Every
  // supporter the party has won pays it, and the party's treasurer hands the
  // week's takings to the team (settlePlayerParty). The fee also decides WHO
  // joins: it falls in a price class on the same 0 (poorest) to 4 (elite)
  // scale as a society profile's wealthTierBase. Somebody below that class
  // cannot afford the card; somebody well above it finds a cheap party beneath
  // them. A cheap party fills with the poor, a dear one only with the elite.

  const DEFAULT_PLAYER_FEE = 100;      // 1 euro a week
  const MAX_PLAYER_FEE = 1000000;      // 10.000 euros a week
  // Upper bound of each price class, in gold a week: <=50 is class 0, etc.
  const FEE_CLASS_BOUNDS = [50, 200, 1000, 5000];
  const BASE_LAPSE_WEEKLY = 0.02;      // supporters who drift off anyway
  const PRICED_OUT_LAPSE_WEEKLY = 0.3; // a supporter the fee has outgrown
  const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

  function cleanFee(fee) {
    const n = Math.round(Number(fee));
    return Number.isFinite(n) ? clamp(n, 0, MAX_PLAYER_FEE) : DEFAULT_PLAYER_FEE;
  }

  function feeClass(fee) {
    const f = cleanFee(fee);
    const i = FEE_CLASS_BOUNDS.findIndex(b => f <= b);
    return i < 0 ? FEE_CLASS_BOUNDS.length : i;
  }

  function wealthTierOf(npcName) {
    const tier = getProfile(npcName)?.wealthTierBase;
    return typeof tier === "number" ? clamp(tier, 0, 4) : 2;
  }

  // How willing somebody of `tier` is to buy a card of price class `cls`.
  function classAppeal(tier, cls) {
    if (tier < cls) return 0.05 * Math.pow(0.4, cls - tier - 1);
    return Math.pow(0.55, tier - cls);
  }

  // The one founding. Answers null when this world already has a party of the
  // player's, or when the creed is not one a party can be founded on.
  function foundPlayerParty(opts = {}) {
    const state = getState();
    if (!state || state.playerParty) return null;
    const creed = ideologyById(opts.ideologyId);
    if (!creed || creed.alien) return null;
    const tenets = cleanTenets(opts.tenets);
    const typed = String(opts.name == null ? "" : opts.name).trim().slice(0, 48);
    const minute = nowMinuteVar();
    state.playerParty = {
      id: PLAYER_PARTY_ID,
      isPlayer: true,
      name: typed || rollPlayerPartyName(),
      ideologyId: creed.id,
      tenets,
      platform: playerPartyPlatform(creed.id, tenets),
      fee: opts.fee == null ? DEFAULT_PLAYER_FEE : cleanFee(opts.fee),
      foundedYear: yearOf(minute),
      founded: dateStrOf(minute),
      members: [],
      supporters: [],
      lastPaidMinute: minute,
      lastIncome: null,
      totalIncome: 0,
    };
    enrollTeamInPlayerParty();
    return state.playerParty;
  }

  // Editing a founded party: any of name, creed, tenets and fee. Answers false
  // when there is nothing to edit or the creed is not a foundable one.
  function editPlayerParty(opts = {}) {
    const party = playerParty();
    if (!party) return false;
    if (opts.ideologyId !== undefined) {
      const creed = ideologyById(opts.ideologyId);
      if (!creed || creed.alien) return false;
      party.ideologyId = creed.id;
    }
    if (opts.tenets !== undefined) party.tenets = cleanTenets(opts.tenets);
    if (opts.name !== undefined) {
      const typed = String(opts.name == null ? "" : opts.name).trim().slice(0, 48);
      if (typed) party.name = typed;
    }
    if (opts.fee !== undefined) party.fee = cleanFee(opts.fee);
    party.platform = playerPartyPlatform(party.ideologyId, party.tenets);
    return true;
  }

  // The supporters still in the world: a name whose identity is gone (death,
  // a beast, a child) is struck off the list.
  function livePlayerSupporters(state) {
    const party = state?.playerParty;
    if (!party) return [];
    party.supporters = (party.supporters || []).filter(n => !!state.identities[n]);
    return party.supporters;
  }

  // The weeks since the last payout: supporters lapse (the priced-out ones
  // fast), then those who stayed pay the fee. Answers the gold paid.
  function settlePlayerParty(state, nowMinute) {
    const party = state?.playerParty;
    if (!party) return 0;
    if (party.lastPaidMinute == null || nowMinute < party.lastPaidMinute) party.lastPaidMinute = nowMinute;
    const weeks = Math.floor((nowMinute - party.lastPaidMinute) / MINUTES_PER_WEEK);
    if (weeks <= 0) return 0;
    const cls = feeClass(party.fee);
    let gold = 0;
    for (let w = 0; w < Math.min(weeks, 520); w++) {
      const weekMinute = party.lastPaidMinute + (w + 1) * MINUTES_PER_WEEK;
      party.supporters = livePlayerSupporters(state).filter(name => {
        const lapse = wealthTierOf(name) < cls ? PRICED_OUT_LAPSE_WEEKLY : BASE_LAPSE_WEEKLY;
        const rng = new PolRng(worldSeed() ^ nameHash("partyDues:" + name) ^ (weekMinute >>> 0));
        return rng.next() >= lapse;
      });
      gold += party.supporters.length * cleanFee(party.fee);
    }
    party.lastPaidMinute += weeks * MINUTES_PER_WEEK;
    party.lastIncome = { weeks, gold, date: dateStrOf(nowMinute), supporters: party.supporters.length };
    party.totalIncome = (party.totalIncome || 0) + gold;
    if (gold > 0 && window.$gameParty && $gameParty.gainGold) $gameParty.gainGold(gold);
    return gold;
  }

  // What the party would take in a week at a given fee, with nobody lapsing.
  function weeklyTakings(fee) {
    const state = $gameSystem?._npcPolitics;
    return livePlayerSupporters(state).length * cleanFee(fee == null ? state?.playerParty?.fee : fee);
  }

  // ---- where: the scopes a list or a campaign can be narrowed to -------------
  //
  // { kind: "world" } or { kind: "place"|"nation"|"power", value }. A place is
  // a map group (the key of state.settlements).

  const SCOPE_KINDS = ["world", "place", "nation", "power"]; // i18n-ignore: scope ids

  function identityInScope(identity, scope) {
    if (!scope || scope.kind === "world" || !scope.value) return true; // i18n-ignore: scope id
    if (scope.kind === "place") return identity.group === scope.value; // i18n-ignore: scope id
    if (scope.kind === "nation") return identity.country === scope.value; // i18n-ignore: scope id
    if (scope.kind === "power") return identity.power === canonicalFaction(scope.value); // i18n-ignore: scope id
    return true;
  }

  // The choices a scope kind offers: [{ value, label }], sorted by label.
  function scopeOptions(kind) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return [];
    let out = [];
    if (kind === "place") { // i18n-ignore: scope id
      const groups = $gameSystem._npcMapGroups || {};
      out = Object.keys(state.settlements || {}).map(g => ({
        value: g, label: (groups[g] && (groups[g].displayName || groups[g].foundedTown)) || g,
      }));
    } else if (kind === "nation") { // i18n-ignore: scope id
      out = Object.keys(state.nations || {}).map(n => ({ value: n, label: n }));
    } else if (kind === "power") { // i18n-ignore: scope id
      out = livePolities(state).filter(p => p.kind !== "nation").map(p => ({ value: p.name, label: p.name })); // i18n-ignore: polity kind
    }
    return out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  // Supporters per party id, one walk over the identities.
  function supporterCounts(state) {
    const counts = {};
    for (const identity of Object.values(state.identities || {})) {
      if (identity.partyId) counts[identity.partyId] = (counts[identity.partyId] || 0) + 1;
    }
    return counts;
  }

  // Every party that stands within a scope, supporters attached, biggest
  // first. The player's party leads a world-wide list and any list whose
  // scope holds one of its supporters.
  //   world   every party of every polity
  //   power   that bloc's own assembly
  //   nation  that nation's government, and its parties in its bloc's assembly
  //   place   the same as the nation the place stands in
  // Each row: { party, polityName, polityKind, supporters, isPlayer }.
  function partiesIn(scope) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return [];
    scope = scope || { kind: "world" }; // i18n-ignore: scope id
    let nation = null, powerName = null;
    if (scope.kind === "place" && scope.value) { // i18n-ignore: scope id
      try { const pol = resolveGroupPolity(state, scope.value); nation = pol.country; powerName = pol.power; }
      catch (_) { return []; }
    } else if (scope.kind === "nation") nation = scope.value; // i18n-ignore: scope id
    else if (scope.kind === "power") powerName = canonicalFaction(scope.value); // i18n-ignore: scope id
    if (nation && !powerName) powerName = state.nations?.[nation]?.power || controllerOfCountry(nation);
    const counts = supporterCounts(state);
    const out = [];
    for (const polity of allPolities(state)) {
      const isNation = polity.kind === "nation"; // i18n-ignore: polity kind
      for (const party of polity.parties || []) {
        let keep = scope.kind === "world" || !scope.value; // i18n-ignore: scope id
        if (!keep && scope.kind === "power") keep = !isNation && polity.name === powerName; // i18n-ignore: scope id
        if (!keep && nation) {
          keep = isNation ? polity.name === nation
            : (polity.name === powerName && party.country === nation);
        }
        if (keep) out.push({ party, polityName: polity.name, polityKind: isNation ? "nation" : "power", supporters: counts[party.id] || 0, isPlayer: false }); // i18n-ignore: polity kinds
      }
    }
    out.sort((a, b) => b.supporters - a.supporters || String(a.party.name).localeCompare(String(b.party.name)));
    const mine = state.playerParty;
    if (mine) {
      const supporters = livePlayerSupporters(state);
      const here = supporters.filter(n => identityInScope(state.identities[n], scope)).length;
      if (scope.kind === "world" || !scope.value || here > 0) { // i18n-ignore: scope id
        out.unshift({ party: mine, polityName: null, polityKind: null, supporters: here, isPlayer: true });
      }
    }
    return out;
  }

  // ---- campaigns ---------------------------------------------------------------
  //
  // Money spent over days or months to win people to a party: the player's own
  // or any party in the world. A campaign covers a scope (above) and runs at an
  // intensity (gold a day). Every day each person it can reach may convert:
  //
  //   p = CAMPAIGN_DAILY_BASE * reach * affinity * appeal
  //
  //   reach    how much of the scope the money covers: the daily gold over
  //            REACH_GOLD_PER_HEAD for every person in it, capped at 1
  //   affinity nearness of their own ideology to the party's platform, and
  //            how little they are already committed (engagement)
  //   appeal   for the player's party only, classAppeal of the fee
  //
  // The projection a founder is shown is the same sum the days then roll
  // (1 - (1-p)^days per person), over the same identities, so it is what the
  // simulation expects to happen, not a separate guess. A convert is pulled
  // halfway toward the platform, so the new allegiance holds against drift.

  const CAMPAIGN_INTENSITIES = [
    { id: "leaflets", dailyGold: 2000 },
    { id: "rallies", dailyGold: 10000 },
    { id: "broadcast", dailyGold: 50000 },
    { id: "saturation", dailyGold: 250000 },
  ];
  const CAMPAIGN_DURATIONS = [1, 3, 7, 14, 30, 90, 180]; // days; 30+ read as months
  const CAMPAIGN_DAILY_BASE = 0.08;
  const REACH_GOLD_PER_HEAD = 20;
  const CAMPAIGN_PULL = 0.5;
  const CAMPAIGN_HISTORY_CAP = 20;
  // Smears: a daily chance to land, how much faith (engagement) a hit drains,
  // how far it shoves each axis away from the platform, and the faith at or
  // under which somebody walks out of the party.
  const SMEAR_DAILY_BASE = 0.1;
  const SMEAR_FAITH_LOSS = 25;
  const SMEAR_IDEOLOGY_PUSH = 12;
  const SMEAR_WALKOUT_FAITH = 5;

  // Where a campaign's target stands: the player's party, or { party, polity }.
  function campaignTarget(spec) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return null;
    if (spec.targetKind === "player") { // i18n-ignore: target kind
      return state.playerParty ? { party: state.playerParty, polity: null, isPlayer: true } : null;
    }
    const found = window.NPCPolitics.findParty(spec.partyId);
    return found ? { party: found.party, polity: found.power, isPlayer: false } : null;
  }

  // Can this person be won to this target at all? A national party is only on
  // its own nation's ballot, and nobody already with the target is counted.
  function campaignEligible(state, name, identity, target, scope, smear) {
    if (!identityInScope(identity, scope)) return false;
    // A smear reaches the people who back the party it is aimed at.
    if (smear) return !target.isPlayer && identity.partyId === target.party.id;
    if (target.isPlayer) return !(target.party.supporters || []).includes(name);
    if (identity.partyId === target.party.id) return false;
    const polity = target.polity;
    if (polity.kind === "nation") return identity.country === polity.name; // i18n-ignore: polity kind
    if (identity.power !== polity.name) return false;
    return !target.party.country || identity.country === target.party.country;
  }

  function campaignOdds(state, spec) {
    const target = campaignTarget(spec);
    if (!target) return null;
    const scope = spec.scope || { kind: "world" }; // i18n-ignore: scope id
    const smear = spec.kind === "smear"; // i18n-ignore: campaign kind
    if (smear && target.isPlayer) return null;
    const people = [];
    for (const [name, identity] of Object.entries(state.identities || {})) {
      if (campaignEligible(state, name, identity, target, scope, smear)) people.push([name, identity]);
    }
    const reach = people.length ? Math.min(1, (Number(spec.dailyGold) || 0) / (REACH_GOLD_PER_HEAD * people.length)) : 0;
    const cls = target.isPlayer ? feeClass(target.party.fee) : null;
    // A smear lands easiest on the lukewarm: the committed shrug it off.
    if (smear) {
      const odds = people.map(([name, identity]) => ({ name, identity,
        p: clamp(SMEAR_DAILY_BASE * reach * (1 - 0.5 * (Number(identity.engagement) || 0) / 100), 0, 0.95) }));
      return { target, scope, odds, reach, smear };
    }
    const odds = people.map(([name, identity]) => {
      const dist = ideologyDistance(identity.ideology, target.party.platform);
      const affinity = Math.max(0.05, 1 - dist / 150) * (1 - 0.6 * (Number(identity.engagement) || 0) / 100);
      const appeal = target.isPlayer ? classAppeal(wealthTierOf(name), cls) : 1;
      return { name, identity, p: clamp(CAMPAIGN_DAILY_BASE * reach * affinity * appeal, 0, 0.95) };
    });
    return { target, scope, odds, reach, smear: false };
  }

  // The expected outcome of a campaign before a coin is spent.
  function projectCampaign(spec) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return null;
    const days = Math.max(1, Math.round(Number(spec.days) || 1));
    const run = campaignOdds(state, spec);
    if (!run) return null;
    let expected = 0;
    for (const o of run.odds) expected += 1 - Math.pow(1 - o.p, days);
    return {
      eligible: run.odds.length,
      reach: Math.round(run.reach * 100),
      expected: Math.round(expected),
      cost: Math.round((Number(spec.dailyGold) || 0) * days),
      days,
    };
  }

  // Pays for and starts a campaign. Answers { ok, reason?, campaign? }.
  function launchCampaign(spec) {
    const state = getState();
    if (!state) return { ok: false, reason: "noWorld" }; // i18n-ignore: reason id
    const projection = projectCampaign(spec);
    if (!projection) return { ok: false, reason: "noTarget" }; // i18n-ignore: reason id
    if (!projection.eligible) return { ok: false, reason: "nobody" }; // i18n-ignore: reason id
    const gold = window.$gameParty && $gameParty.gold ? $gameParty.gold() : 0;
    if (gold < projection.cost) return { ok: false, reason: "funds" }; // i18n-ignore: reason id
    if ($gameParty.loseGold) $gameParty.loseGold(projection.cost);
    const minute = nowMinuteVar();
    const target = campaignTarget(spec);
    state.campaigns = state.campaigns || [];
    state.campaignSeq = (state.campaignSeq || 0) + 1;
    const campaign = {
      id: state.campaignSeq,
      kind: spec.kind === "smear" ? "smear" : "convert", // i18n-ignore: campaign kinds
      targetKind: target.isPlayer ? "player" : "party", // i18n-ignore: target kinds
      partyId: target.party.id,
      partyName: target.party.name,
      scope: spec.scope && spec.scope.kind !== "world" ? { kind: spec.scope.kind, value: spec.scope.value } : { kind: "world" }, // i18n-ignore: scope id
      intensity: spec.intensity || null,
      dailyGold: Math.round(Number(spec.dailyGold) || 0),
      days: projection.days,
      cost: projection.cost,
      projected: projection.expected,
      converted: 0,
      startMinute: minute,
      lastMinute: minute,
      endMinute: minute + projection.days * MINUTES_PER_DAY,
      started: dateStrOf(minute),
      done: false,
    };
    state.campaigns.unshift(campaign);
    return { ok: true, campaign };
  }

  // A smear that lands: faith in the party drains and the views it stood for
  // sour. Somebody with no faith left walks out of it, and either way they are
  // easier for the next conversion campaign to win (affinity reads both).
  function smearIdentity(identity, party, minute) {
    identity.engagement = clamp(Math.round((Number(identity.engagement) || 0) - SMEAR_FAITH_LOSS), 0, 100);
    for (const ax of AXES) {
      const gap = (identity.ideology[ax] ?? 0) - (party.platform[ax] ?? 0);
      const away = gap === 0 ? 0 : Math.sign(gap) * SMEAR_IDEOLOGY_PUSH;
      identity.ideology[ax] = clamp(Math.round(identity.ideology[ax] + away), -100, 100);
    }
    const walked = identity.engagement <= SMEAR_WALKOUT_FAITH;
    if (walked) identity.partyId = null;
    pushIdentityEvent(identity, minute, "smear", // i18n-ignore: event type
      walked ? "Politics.identity.smearedOut" : "Politics.identity.smeared", { party: party.name });
  }

  // Roll the days a campaign has run since it was last looked at.
  function advanceCampaign(state, campaign, nowMinute) {
    if (campaign.done) return;
    const to = Math.min(nowMinute, campaign.endMinute);
    const days = Math.floor((to - campaign.lastMinute) / MINUTES_PER_DAY);
    if (days > 0) {
      const run = campaignOdds(state, campaign);
      if (!run) { campaign.done = true; return; }
      const at = campaign.lastMinute + days * MINUTES_PER_DAY;
      for (const o of run.odds) {
        const rng = new PolRng(worldSeed() ^ nameHash(`campaign:${campaign.id}:${o.name}`) ^ (campaign.lastMinute >>> 0));
        if (rng.next() >= 1 - Math.pow(1 - o.p, days)) continue;
        const identity = o.identity;
        if (run.smear) {
          smearIdentity(identity, run.target.party, at);
          campaign.converted++;
          continue;
        }
        for (const ax of AXES) {
          identity.ideology[ax] = clamp(Math.round(identity.ideology[ax] + ((run.target.party.platform[ax] ?? 0) - identity.ideology[ax]) * CAMPAIGN_PULL), -100, 100);
        }
        const from = identity.partyId ? (partyById(run.target.polity || state.powers[identity.power], identity.partyId)?.name || null) : null;
        if (run.target.isPlayer) run.target.party.supporters.push(o.name);
        else identity.partyId = run.target.party.id;
        pushIdentityEvent(identity, at, "campaign", "Politics.identity.campaigned", { party: run.target.party.name, from: from || "-" }); // i18n-ignore: event type
        campaign.converted++;
      }
      campaign.lastMinute = at;
    }
    if (campaign.lastMinute >= campaign.endMinute) campaign.done = true;
  }

  // Everything of the player's that runs on the clock: campaigns, then dues.
  function advancePlayerPolitics(nowMinute) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return;
    const minute = nowMinute == null ? nowMinuteVar() : nowMinute;
    for (const campaign of state.campaigns || []) advanceCampaign(state, campaign, minute);
    if (state.campaigns && state.campaigns.length > CAMPAIGN_HISTORY_CAP) {
      const running = state.campaigns.filter(c => !c.done);
      const over = state.campaigns.filter(c => c.done).slice(0, Math.max(0, CAMPAIGN_HISTORY_CAP - running.length));
      state.campaigns = running.concat(over).sort((a, b) => b.id - a.id);
    }
    settlePlayerParty(state, minute);
  }

  // ---- candidacies ------------------------------------------------------------
  //
  // A member of the team may stand in any election still to come: a town's
  // mayoralty, a nation's government, or a hyperpower's head of state. A
  // conclave is not an election anybody stands in (the Holy Vatican Empire's
  // cardinals elect one of their own), so a power that picks its head that way
  // takes no candidates; the nations under it hold ordinary elections and do.
  //
  // Standing costs a deposit, and the candidate runs for the party's own
  // political party when there is one, on its platform, or on their own
  // otherwise. Nothing in the election engines changes: the town hall counts
  // the candidate among its own three (resolveLocalElection), and a national
  // or bloc election is resolved as it always was, then the candidate's vote is
  // weighed against the winner's (contestPlayerCandidacy). Whoever the history
  // book names still holds the office however the vote went.

  const CANDIDACY_DEPOSIT = { local: 10000, nation: 200000, power: 2000000 }; // i18n-ignore: level ids
  const CANDIDACY_CAP = 30;
  const NEUTRAL_PLATFORM = { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 };

  function candidacies(state) {
    state.candidacies = state.candidacies || [];
    return state.candidacies;
  }

  function polityForLevel(state, level, name) {
    if (level === "nation") return state.nations?.[name] || null; // i18n-ignore: level id
    if (level === "power") return state.powers?.[canonicalFaction(name)] || null; // i18n-ignore: level id
    return null;
  }

  // Can anybody stand in this polity's elections at all?
  function acceptsCandidates(polity) {
    return !!(polity && polity.nextElectionMinute != null && polity.system !== "conclave" && (polity.parties || []).length); // i18n-ignore: election system id
  }

  // Every election still to come that a candidate could stand in:
  // [{ level, polity, label, minute, date, office, deposit, open, standing }].
  function upcomingElections(scope) {
    const state = $gameSystem?._npcPolitics;
    if (!state) return [];
    const now = nowMinuteVar();
    const standing = (level, polity) => candidacies(state)
      .filter(c => c.status === "standing" && c.level === level && c.polity === polity).map(c => c.actor);
    const out = [];
    const groups = $gameSystem._npcMapGroups || {};
    for (const [group, settlement] of Object.entries(state.settlements || {})) {
      if (settlement.nextLocalElectionMinute == null || settlement.nextLocalElectionMinute < now) continue;
      if (scope && scope.kind !== "world" && scope.value) { // i18n-ignore: scope id
        const where = { group, country: settlement.country, power: settlement.power };
        if (!identityInScope(where, scope)) continue;
      }
      const g = groups[group];
      out.push({ level: "local", polity: group, label: (g && (g.displayName || g.foundedTown)) || group, // i18n-ignore: level id
        minute: settlement.nextLocalElectionMinute, date: dateStrOf(settlement.nextLocalElectionMinute),
        office: officeLabel("mayor"), deposit: CANDIDACY_DEPOSIT.local, open: true, standing: standing("local", group) }); // i18n-ignore: level id
    }
    for (const polity of livePolities(state)) {
      const level = polity.kind === "nation" ? "nation" : "power"; // i18n-ignore: level ids
      if (polity.nextElectionMinute == null || polity.nextElectionMinute < now) continue;
      if (scope && scope.kind !== "world" && scope.value) { // i18n-ignore: scope id
        const where = level === "nation" // i18n-ignore: level id
          ? { country: polity.name, power: polity.power || controllerOfCountry(polity.name) }
          : { power: polity.name };
        if (scope.kind === "place") { // i18n-ignore: scope id
          let pol = null;
          try { pol = resolveGroupPolity(state, scope.value); } catch (_) { pol = null; }
          if (!pol || (level === "nation" ? pol.country !== polity.name : pol.power !== polity.name)) continue; // i18n-ignore: level id
        } else if (!identityInScope(where, scope)) continue;
      }
      out.push({ level, polity: polity.name, label: polity.name, minute: polity.nextElectionMinute,
        date: dateStrOf(polity.nextElectionMinute), office: powerLabel(polity, "headTitle"),
        system: polity.system, deposit: CANDIDACY_DEPOSIT[level], open: acceptsCandidates(polity),
        standing: standing(level, polity.name) });
    }
    return out.sort((a, b) => a.minute - b.minute || String(a.label).localeCompare(String(b.label)));
  }

  // Put a team member's name down. Answers { ok, reason?, candidacy? }.
  function standForElection(spec = {}) {
    const state = getState();
    if (!state) return { ok: false, reason: "noWorld" }; // i18n-ignore: reason id
    const actor = String(spec.actor || "");
    if (!teamNames().includes(actor)) return { ok: false, reason: "notInTeam" }; // i18n-ignore: reason id
    const level = spec.level;
    if (!(level in CANDIDACY_DEPOSIT)) return { ok: false, reason: "noElection" }; // i18n-ignore: reason id
    let minute = null;
    if (level === "local") { // i18n-ignore: level id
      const settlement = state.settlements?.[spec.polity];
      minute = settlement ? settlement.nextLocalElectionMinute : null;
    } else {
      const polity = polityForLevel(state, level, spec.polity);
      if (polity && polity.system === "conclave") return { ok: false, reason: "conclave" }; // i18n-ignore: reason id, election system id
      if (!acceptsCandidates(polity)) return { ok: false, reason: "noElection" }; // i18n-ignore: reason id
      minute = polity.nextElectionMinute;
    }
    if (minute == null || minute < nowMinuteVar()) return { ok: false, reason: "noElection" }; // i18n-ignore: reason id
    if (candidacies(state).some(c => c.status === "standing" && c.actor === actor)) return { ok: false, reason: "alreadyStanding" }; // i18n-ignore: reason id
    const deposit = CANDIDACY_DEPOSIT[level];
    const gold = window.$gameParty && $gameParty.gold ? $gameParty.gold() : 0;
    if (gold < deposit) return { ok: false, reason: "funds" }; // i18n-ignore: reason id
    if ($gameParty.loseGold) $gameParty.loseGold(deposit);
    state.candidacySeq = (state.candidacySeq || 0) + 1;
    const party = state.playerParty;
    const candidacy = {
      id: state.candidacySeq, actor, level,
      polity: level === "power" ? canonicalFaction(spec.polity) : spec.polity, // i18n-ignore: level id
      partyName: party ? party.name : null,
      electionMinute: minute, electionDate: dateStrOf(minute), deposit,
      status: "standing", share: null, winnerShare: null, winner: null, // i18n-ignore: status id
    };
    candidacies(state).unshift(candidacy);
    if (state.candidacies.length > CANDIDACY_CAP) {
      state.candidacies = state.candidacies.filter((c, i) => c.status === "standing" || i < CANDIDACY_CAP); // i18n-ignore: status id
    }
    return { ok: true, candidacy };
  }

  function withdrawCandidacy(id) {
    const state = $gameSystem?._npcPolitics;
    const c = state && candidacies(state).find(x => x.id === id && x.status === "standing"); // i18n-ignore: status id
    if (!c) return false;
    c.status = "withdrawn"; // i18n-ignore: status id
    return true;
  }

  // The platform a candidate runs on: their political party's, or the centre.
  function candidatePlatform(state) {
    return state.playerParty ? state.playerParty.platform : NEUTRAL_PLATFORM;
  }

  // A little personal pull for a known face: a point per ten levels, up to 5.
  function candidateCharisma(actorName) {
    const members = (window.$gameParty && $gameParty.allMembers) ? ($gameParty.allMembers() || []) : [];
    const actor = members.find(m => m && m.name() === actorName);
    return actor ? Math.min(5, Math.floor((actor.level || 1) / 10)) : 0;
  }

  // The identity an elected member of the team is given, so the town hall
  // (offices, appointments) reads them like any other resident.
  function ensureCandidateIdentity(state, actorName, group, platform) {
    if (state.identities[actorName]) return state.identities[actorName];
    const settlement = state.settlements?.[group];
    state.identities[actorName] = {
      power: settlement?.power ?? null, country: settlement?.country ?? null, group,
      ideology: { ...platform }, partyId: null, creedId: state.playerParty?.ideologyId ?? null,
      engagement: 100, charisma: 60, votedLast: null, grudgePartyId: null, localOffice: null, log: [],
    };
    return state.identities[actorName];
  }

  // ---- a member of the team seated as mayor ------------------------------------
  //
  // A custom scenario can open with one of the team already in a town hall
  // (CharacterCreationOrigins, applyCustomMayor). Nobody is elected: the
  // sitting mayor steps down in the team member's favour, the world's history
  // says so, and the new mayor serves a full term before the town votes again.
  // The other offices stay with whoever holds them; the new mayor inherits
  // their council rather than sacking it. Answers { settlement, previous } or
  // null when there is no world or nobody to seat.
  function seatTeamMayor(groupName, actorName) {
    const state = getState();
    const group = String(groupName || "");
    const actor = String(actorName || "");
    if (!state || !group || !actor) return null;
    const minute = nowMinuteVar();
    state.settlements = state.settlements || {};
    let settlement = state.settlements[group];
    if (!settlement) {
      let polity = { country: null, power: null };
      try { polity = resolveGroupPolity(state, group) || polity; } catch (_) { /* unresolved town */ }
      settlement = state.settlements[group] = {
        group, country: polity.country ?? null, power: polity.power ?? null,
        offices: { mayor: null, guardCaptain: null, taxCollector: null, highPriest: null },
        nextLocalElectionMinute: minute, history: [],
      };
    }
    settlement.offices = settlement.offices || { mayor: null, guardCaptain: null, taxCollector: null, highPriest: null };
    settlement.history = settlement.history || [];
    const previous = settlement.offices.mayor && settlement.offices.mayor !== actor ? settlement.offices.mayor : null;
    if (previous) {
      const old = state.identities[previous];
      if (old) {
        old.localOffice = null;
        pushIdentityEvent(old, minute, "office", "Politics.identity.resignedMayor", { group, successor: actor }); // i18n-ignore: event type
      }
      window.NPCSim?.StoryLogger?.record?.(previous, "politics", "Politics.story.resignedMayor", { group }); // i18n-ignore: log kind
    }
    // Whoever sat on the council the new mayor now leads keeps their seat,
    // unless it was the new mayor's own.
    for (const office of LOCAL_OFFICES.slice(1)) {
      if (settlement.offices[office] === actor) settlement.offices[office] = null;
    }
    const identity = ensureCandidateIdentity(state, actor, group, candidatePlatform(state));
    identity.group = identity.group || group;
    identity.localOffice = "mayor"; // i18n-ignore: office id
    settlement.offices.mayor = actor;
    pushIdentityEvent(identity, minute, "office", "Politics.identity.succeededMayor", { group, predecessor: previous || "" }); // i18n-ignore: event type
    settlement.history.unshift({
      minute, date: dateStrOf(minute), mayor: actor, votes: 0,
      offices: { ...settlement.offices }, appointed: true, resigned: previous,
    });
    if (settlement.history.length > SETTLEMENT_LOG_CAP) settlement.history.pop();
    settlement.nextLocalElectionMinute = minute + LOCAL_TERM_DAYS * MINUTES_PER_DAY;
    const HM = window.HistoryManager;
    if (HM && typeof HM.recordEvent === "function") {
      try {
        HM.recordEvent({
          date: dateStrOf(minute), category: "political", type: "mayor_resigned", // i18n-ignore: category, type
          descKey: previous ? "Politics.history.mayorResigned" : "Politics.history.mayorSeated",
          descParams: { mayor: previous || "", successor: actor, group },
        });
      } catch (_) { /* the chronicle is optional */ }
    }
    return { settlement, previous };
  }

  // A national or bloc election has just been resolved: the candidates who
  // stood in it are weighed against the winner. The electorate is the same one
  // the ballot counted; the party's supporters vote for its candidate, and a
  // voter whose own party stands further from the candidate's platform than
  // the candidate does leans their way for half a vote.
  function contestPlayerCandidacy(state, power, minute, record) {
    const level = power.kind === "nation" ? "nation" : "power"; // i18n-ignore: level ids
    const standing = candidacies(state).filter(c => c.status === "standing" && c.level === level && c.polity === power.name); // i18n-ignore: status id
    if (!standing.length) return;
    const platform = candidatePlatform(state);
    const supporters = new Set(state.playerParty ? livePlayerSupporters(state) : []);
    let votes = 0, electorate = 0;
    for (const [name, identity] of Object.entries(state.identities)) {
      if (level === "nation" ? identity.country !== power.name : identity.power !== power.name) continue; // i18n-ignore: level id
      electorate++;
      if (supporters.has(name)) { votes++; continue; }
      const own = partyById(power, identity.partyId);
      const ownD = own ? ideologyDistance(identity.ideology, own.platform) : 200;
      if (ideologyDistance(identity.ideology, platform) < ownD) votes += 0.5;
    }
    const winnerShare = Number(record.results?.[0]?.share ?? 50);
    const canon = canonHeadRecord(power, minute);
    let best = null;
    for (const c of standing) {
      const share = electorate ? +Math.min(100, 100 * votes / electorate + candidateCharisma(c.actor)).toFixed(1) : 0;
      c.share = share;
      c.winnerShare = winnerShare;
      c.winner = record.head || record.winner || null;
      c.status = "lost"; // i18n-ignore: status id
      if (!canon && share > winnerShare && (!best || share > best.share)) best = c;
    }
    if (!best) return;
    best.status = "won"; // i18n-ignore: status id
    best.winner = best.actor;
    const rng = new PolRng(worldSeed() ^ nameHash("candidate:" + best.actor) ^ ((minute >>> 0) || 1));
    const pol = makePolitician(power, rng, minute, { ideology: platform, spread: 0, partyId: null });
    pol.name = best.actor;
    pol.protected = true;
    pol.playerActor = true;
    pol._npcBlocked = "team"; // i18n-ignore: reason id
    const previous = power.politicians[power.headId];
    if (previous && previous.office === power.headTitle) previous.office = null;
    power.headId = pol.id;
    pol.office = power.headTitle;
    recordHead(power, minute, pol, "elected");
    record.results.unshift({ candidateId: pol.id, name: best.actor, partyId: null, share: best.share, player: true });
    record.head = best.actor;
    pushPowerEvent(power, minute, "election", "Politics.event.candidateWins", // i18n-ignore: event type
      { name: best.actor, title: powerLabel(power, "headTitle"), share: best.share });
  }

  window.NPCPolitics = {
    catchUp,
    CANDIDACY_DEPOSIT,
    upcomingElections,
    standForElection,
    withdrawCandidacy,
    seatTeamMayor,
    listCandidacies() { return ($gameSystem?._npcPolitics?.candidacies || []).slice(); },
    // --- the party's own political party -----------------------------------
    PLAYER_PARTY_ID,
    MAX_PLAYER_TENETS,
    PLAYER_TENETS,
    playerParty,
    hasPlayerParty() { return !!playerParty(); },
    foundPlayerParty,
    editPlayerParty,
    enrollTeamInPlayerParty,
    DEFAULT_PLAYER_FEE,
    MAX_PLAYER_FEE,
    FEE_CLASS_BOUNDS,
    feeClass,
    classAppeal,
    weeklyTakings,
    playerSupporters() { return livePlayerSupporters($gameSystem?._npcPolitics).slice(); },
    SCOPE_KINDS,
    scopeOptions,
    partiesIn,
    CAMPAIGN_INTENSITIES,
    CAMPAIGN_DURATIONS,
    projectCampaign,
    launchCampaign,
    listCampaigns() { return ($gameSystem?._npcPolitics?.campaigns || []).slice(); },
    advancePlayerPolitics,
    rollPlayerPartyName,
    playerPartyPlatform,
    cleanTenets,
    tenetsClash(a, b) {
      const ta = playerTenet(a), tb = playerTenet(b);
      return !!(ta && tb && tenetsClash(ta, tb));
    },
    foundableCreeds,
    isPlayerPartyMember(name) {
      const party = playerParty();
      return !!(party && name && party.members.includes(name));
    },
    reresolveCountry,
    policyAxes,
    policiesFor,
    listPowers() { return Object.keys($gameSystem?._npcPolitics?.powers || {}); },
    getPower(name) { return $gameSystem?._npcPolitics?.powers?.[canonicalFaction(name)] ?? null; },
    getIdentity(npcName) {
      const identities = $gameSystem?._npcPolitics?.identities;
      if (!identities) return null;
      // The same repair the minting side makes (see ensureIdentity): a beast
      // holds no allegiance, whatever an older world folder wrote down.
      if (identities[npcName] && isNonSentientName(npcName)) {
        delete identities[npcName];
        return null;
      }
      return identities[npcName] ?? null;
    },
    // Country name an NPC's home map-group belongs to, resolvable even before a
    // full political identity has been simulated for that NPC. Map-pool groups
    // match Countries.json by name; procedural "Proc:x,y" settlements resolve
    // via the nation id stored on the group (the world tile's current nation).
    // Nation *and* controlling hyperpower of a home map-group, on the same
    // terms as nationOfGroup: what an NPC's citizenship reads as before the
    // simulation has given them an identity of their own.
    // The hyperpower holding a country right now, or null for neutral ground.
    // No sympathy draw: a nation nobody holds keeps nobody's feast days
    // (window.PublicHolidays).
    controllerOf(countryName) {
      if (!countryName) return null;
      const held = canonicalFaction(controllerOfCountry(countryName));
      return held && held !== "Neutral" ? held : null;
    },
    polityOfGroup(groupName) {
      const state = getState();
      if (!state || !groupName) return null;
      try { return resolveGroupPolity(state, groupName); }
      catch (_) { return null; }
    },
    nationOfGroup(groupName) {
      const state = getState();
      if (!state || !groupName) return null;
      try { return resolveGroupPolity(state, groupName).country || null; }
      catch (_) { return null; }
    },
    // The nation a hometown (a Destinations.json / map-group key) stands in,
    // answerable before any political state exists: character creation asks
    // this to know which national ballot a made character could join.
    countryOfHometown(town) {
      if (!town) return null;
      const declared = window.WorkSystem?.destinationCountry?.(town)?.country;
      if (declared) return declared;
      const match = getCountries().find(c => norm(c.country) === norm(town));
      return match ? match.country : null;
    },
    // The parties of `country` a character holding `ideologyId` could plausibly
    // declare for, nearest creed first. Parties standing on that very creed
    // come first; the list is filled out with the closest platforms after them
    // so a nation with no exact match still offers a ballot.
    partyChoicesFor(country, ideologyId, limit = 12) {
      const roster = nationalParties(country);
      if (!roster.length) return [];
      const creed = ideologyById(ideologyId);
      const axes = creed && creed.axes ? creed.axes : null;
      const scored = roster.map(entry => ({
        name: entry.name,
        ideologyId: entry.ideologyId || null,
        exact: !!(ideologyId && entry.ideologyId === ideologyId),
        distance: axes ? ideologyDistance(axes, (ideologyById(entry.ideologyId) || {}).axes) : 0,
      }));
      scored.sort((a, b) => (b.exact - a.exact) || (a.distance - b.distance)
        || a.name.localeCompare(b.name));
      return scored.slice(0, limit);
    },
    // Creed and identity kept in step (CIVIC DRAW AND CREED SYNC section).
    onCreedChanged,
    // A voter who moved town (NPCLifeSim RELOCATION).
    onRelocated,
    rulingPlatformOf,
    // The platform a power governs by, by the power's name (NPCLifeSim
    // REFUGEES leans the Horde's integrated humans toward it), and a line in
    // a power's own event log from outside the political simulation.
    platformOfPower(powerName) {
      const power = $gameSystem?._npcPolitics?.powers?.[canonicalFaction(powerName)];
      return power ? rulingPlatform(power) : null;
    },
    logPowerEvent(powerName, minute, type, key, params) {
      const power = $gameSystem?._npcPolitics?.powers?.[canonicalFaction(powerName)];
      if (!power || !Array.isArray(power.events)) return false;
      pushPowerEvent(power, minute, type, key, params);
      return true;
    },
    getSettlement(groupName) { return $gameSystem?._npcPolitics?.settlements?.[groupName] ?? null; },
    opinionModifier,
    getConversationContext,
    buildPowerReport,
    buildElectionReport,
    buildNPCProfile,
    // --- wiki lookup API ---------------------------------------------------
    // Exact-name (case-insensitive) search across every power's political class.
    // Nations are searched after the powers: a nation's government is a polity
    // exactly as a bloc's is, and its politicians are just as findable.
    findPolitician(name) {
      const state = $gameSystem?._npcPolitics;
      if (!state) return null;
      const target = String(name || "").trim().toLowerCase();
      if (!target) return null;
      for (const power of allPolities(state)) {
        for (const pol of Object.values(power.politicians || {})) {
          if (String(pol.name).toLowerCase() === target) return { power, pol };
        }
      }
      return null;
    },
    // A nation's own government (created the first time somebody from it
    // exists, see ensureNation), or null.
    getNation(name) { return $gameSystem?._npcPolitics?.nations?.[name] ?? null; },
    listNations() { return Object.keys($gameSystem?._npcPolitics?.nations || {}); },
    // A power by name, or failing that a nation: the one lookup for "the
    // polity called this", whichever kind it is.
    getPolity(name) {
      return this.getPower(name) || this.getNation(name);
    },
    getPolitician(powerName, polId) {
      return this.getPower(powerName)?.politicians?.[polId] ?? null;
    },
    getHeadHistory(powerName) {
      return this.getPower(powerName)?.headHistory ?? [];
    },
    getPartyOf(powerName, partyId) {
      const power = this.getPolity(powerName);
      return power ? (power.parties.find(p => p.id === partyId) || null) : null;
    },
    // Exact-id search across every power's parties, for the wiki's party page
    // (a party id already carries its own power, but the wiki only has the id).
    findParty(partyId) {
      const state = $gameSystem?._npcPolitics;
      if (!state || !partyId) return null;
      for (const power of allPolities(state)) {
        const party = power.parties.find(p => p.id === partyId);
        if (party) return { power, party };
      }
      return null;
    },
    // Every party currently seated anywhere, power attached, for the wiki's
    // party index and the ideology page's "held by" list.
    listAllParties() {
      const state = $gameSystem?._npcPolitics;
      const out = [];
      for (const power of (state ? allPolities(state) : [])) {
        for (const party of power.parties) out.push({ party, powerName: power.name, kind: power.kind || "power" }); // i18n-ignore: polity kind id
      }
      return out;
    },
    listSettlements() { return $gameSystem?._npcPolitics?.settlements || {}; },
    listIdentities() { return $gameSystem?._npcPolitics?.identities || {}; },
    citizensOf(powerName, limit = 30) {
      const out = [];
      const target = canonicalFaction(powerName);
      for (const [npcName, identity] of Object.entries($gameSystem?._npcPolitics?.identities || {})) {
        if (identity.power === target) {
          out.push(npcName);
          if (out.length >= limit) break;
        }
      }
      return out;
    },
    politicianAgeOf(pol) { return politicianAge(pol, nowMinuteVar()); },
    // --- the place and its office holders (REAL POLITICIANS, THE PLACE) ------
    describePlace,
    electedOf,
    isLivePolity,
    roleLabel,
    // [{ name, role, office, polId, person, main }] for one polity.
    officeHoldersOf(polity) {
      const reg = $gameSystem?._npcPolitics?.realPoliticians || {};
      return officeHoldersOf(polity).map(({ pol, role }) => ({
        name: pol.name, role, office: roleLabel(role, polity), polId: pol.id,
        person: !!(pol.npcName && reg[pol.npcName] && !reg[pol.npcName].gone),
        main: isMainPlayer(pol),
      }));
    },
    // The office holders the world has made into people: name -> entry.
    realPoliticians() { return $gameSystem?._npcPolitics?.realPoliticians || {}; },
    // Called by NPCLifeSim.killNpc: a person who held an office leaves it.
    onPersonDied,
    holdsStateOffice,
    REAL_POL, OFFICE_JOBS,
    electionLabelOf(powerName) {
      const power = this.getPower(powerName);
      return power ? labelOf(power) : T("Politics.election.parliamentary");
    },
    // Resolve a { key, params } pocket the simulation stored on a record.
    textOf,
    // Localized label for one of a power's own archetype fields.
    powerLabel,
    officeLabel,
    politicianOffice,
    accessionLabel,
    dateOf: dateStrOf,
    LOCAL_OFFICE_LABELS,
    // test/inspection hooks
    _internals: {
      PolRng, nameHash, sampleCount, dateStrOf, yearOf, clamp,
      AXES, RATES, NPC_RATES,
      ideologyDistance, jitterIdeology, discoverHyperpowers, collectPopulation,
      resolveElection, resolveGroupPolity, policyTargets, labelOf,
      LOCAL_OFFICES, LOCAL_OFFICE_LABELS,
      ensureIdentity, civicDraw, realignCreed, rulingPlatform, getState,
      simulateIdentitiesChunk,
      CIVIC_MIX, PARTY_HYSTERESIS, REALIGN_GAP,
      syncRealPoliticians, materialise, isMainPlayer, seatGroupOf, killPolitician,
      signalledCountry, resolveLocalElection, LOCAL_RETRY_DAYS, onRelocated,
    },
  };

  // Party drift and the hand-made party moves (PARTY DRIFT section).
  Object.assign(window.NPCPolitics, {
    DRIFT_FLOOR, DRIFT_WARN,
    partyDriftChance, ballotOf, switchParty, reconsiderParty, actorPartyStanding,
    driftFromParty(npcName, days, rng) {
      const state = $gameSystem?._npcPolitics;
      const identity = state?.identities?.[npcName];
      if (!identity) return null;
      const minute = nowMinuteVar();
      return driftFromParty(npcName, identity, state.powers?.[identity.power],
        rng || new PolRng(worldSeed() ^ nameHash("driftHand:" + npcName) ^ ((minute >>> 0) || 1)), minute, days);
    },
  });

  // ==========================================================================
  // ENGINE HOOKS (guarded so the module stays loadable outside RMMZ for tests)
  // ==========================================================================

  // A nation that changes hands in the chronicle takes its towns and its
  // people with it (HistorySimulator loads first, so its hook is there).
  if (typeof window !== "undefined" && window.HistoryManager?.onNationChange) {
    window.HistoryManager.onNationChange((change) => {
      try { reresolveCountry(change && change.country); } catch (e) { console.warn("[NPCPolitics] reresolveCountry", e); }
    });
  }

  // World initialization: the powers, their political classes and every
  // settlement's local politics are bootstrapped when the world is made, so a
  // brand new world already has somebody in office everywhere rather than
  // electing them the first time the player walks into a town.
  if (typeof window !== "undefined" && window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("politics", 50, () => {
      catchUp($gameVariables?.value(114) || 0);
    });
  }

  if (typeof Game_Map !== "undefined") {
    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function (sceneActive) {
      _Game_Map_update.call(this, sceneActive);
      if (!sceneActive || !$gameVariables) return;
      const minute = $gameVariables.value(114) || 0;
      if (minute !== this._lastPoliticsSimMinute) {
        this._lastPoliticsSimMinute = minute;
        const last = $gameSystem?._npcPolitics?.lastSimMinute;
        if (last === undefined || last === null || minute - last >= MINUTES_PER_DAY || minute < last) {
          catchUp(minute, { fromClock: true });
        }
      }
    };
  }

  if (typeof Scene_Map !== "undefined") {
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
      _Scene_Map_onMapLoaded.call(this);
      if ($gameVariables) catchUp($gameVariables.value(114) || 0);
    };
  }

  // A skill has no map event to read a power off, so both report commands are
  // called with no argument at all. Falling back to whoever controls the ground
  // the party is standing on is what "surveys the realm" has to mean from a
  // skill; without it the command returned in silence and the skill looked dead.
  function powerArgOrHere(raw) {
    const named = String(raw || "").trim();
    if (named) return named;
    const country = (typeof $gameWeather !== "undefined" && $gameWeather)
      ? $gameWeather.currentCountry?.country : null;
    if (!country) return "";
    const holder = controllerOfCountry(country);
    return holder && holder !== "Neutral" ? holder : "";
  }

  if (typeof PluginManager !== "undefined") {
    PluginManager.registerCommand(pluginName, "PoliticsReport", args => {
      const power = powerArgOrHere(args.power);
      if (power) {
        window.skipLocalization = true;
        $gameMessage.add(buildPowerReport(power));
        window.skipLocalization = false;
      }
    });

    PluginManager.registerCommand(pluginName, "PoliticsElections", args => {
      const power = powerArgOrHere(args.power);
      if (power) {
        window.skipLocalization = true;
        $gameMessage.add(buildElectionReport(power));
        window.skipLocalization = false;
      }
    });

    PluginManager.registerCommand(pluginName, "PoliticsNPC", args => {
      const name = String(args.eventName || "").trim();
      if (name) {
        window.skipLocalization = true;
        $gameMessage.add(buildNPCProfile(name));
        window.skipLocalization = false;
      }
    });

    PluginManager.registerCommand(pluginName, "PoliticsDebug", args => {
      const state = $gameSystem?._npcPolitics;
      if (!state) return;
      const power = String(args.power || "").trim();
      const dump = power ? state.powers[canonicalFaction(power)] : state;
      console.groupCollapsed(`[NPCPolitics] ${power || "full state"}`);
      console.log(JSON.parse(JSON.stringify(dump || {})));
      console.groupEnd();
    });

    PluginManager.registerCommand(pluginName, "PoliticsCatchUp", () => {
      catchUp($gameVariables.value(114) || 0);
    });

    console.log("[NPCPolitics] Loaded, hyperpower politics & elections active.");
  }

  // ==========================================================================
  // FAMILY NAMESPACE (NPCPolitics_*.js)
  // ==========================================================================
  // The data tables (archetypes, party rosters, name banks) live in
  // NPCPolitics_Data.js, listed in js/plugins.js right after this file. It
  // reads what it needs off NPCPolitics._internal, publishes its tables there
  // and binds the names this file reads late once it is in.

  window.NPCPolitics._internal = { _late: [] };
  Object.assign(window.NPCPolitics._internal, {
    getCountries, getProfile, nameHash, norm, PolRng, worldSeed,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let
    ARCHETYPES, FACTION_ALIASES, FALLBACK_ARCHETYPE, governedTowerWorlds, homeCountryOf,
    isTowerPower, NAME_BANKS, nationalParties, OFFWORLD_POWERS, SEATED_ON_DAY_ONE,
    towerArchetypeFor, towerWorldByPower;
  window.NPCPolitics._internal._late.push(() => ({
    ARCHETYPES, FACTION_ALIASES, FALLBACK_ARCHETYPE, governedTowerWorlds, homeCountryOf,
    isTowerPower, NAME_BANKS, nationalParties, OFFWORLD_POWERS, SEATED_ON_DAY_ONE,
    towerArchetypeFor, towerWorldByPower,
  } = window.NPCPolitics._internal));

})();
