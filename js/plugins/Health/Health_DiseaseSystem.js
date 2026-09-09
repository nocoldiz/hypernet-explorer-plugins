/*:
 * @target MZ
 * @plugindesc Health_DiseaseSystem v2.0.0, an extensive disease + continental epidemic model for party & NPCs
 * @author Omni-Lex
 * @help Health_DiseaseSystem.js
 *
 * Central disease + condition engine shared by the party (Game_Actor) and the
 * NPC society simulation. It is data-driven from js/db/Health/Diseases.json
 * (auto-loaded by DataService into window.Health.Diseases).
 *
 * WHAT IT DOES
 *   - Every disease carries a transmission chance, one or more transmission
 *     "vectors" (airborne / saliva / bite / contact / sexual / ...), an
 *     optional set of RPG param modifiers applied while carried, and an
 *     optional state that is applied after the carrier has walked X steps.
 *   - Party members can catch infective diseases from each other. That roll is
 *     made once each time the pause menu is opened (Scene_Menu.create).
 *   - Party <-> NPC casual transmission is rolled each time the Empathize panel
 *     opens for an NPC (window.DiseaseSystem.onEmpathizeOpen).
 *   - Venereal diseases (venereal:true) NEVER spread by proximity. They only
 *     pass between NPCs who are romantic partners, resolved lazily from the
 *     NPCLifeSim partner link.
 *   - Each NPC gets a deterministic, world-seeded medical history (past
 *     diseases + lasting conditions such as broken bones) shown on the
 *     Empathize "Health" tab.
 *
 * THE EPIDEMIC LAYER (window.EpidemicSystem)
 *   - Outbreaks run on the real map. A "place" is a town: its name comes from
 *     js/db/WorkSystem/Destinations.json (where an outbreak can start) and its
 *     extent from that entry's own `reservedTiles` array (the retired
 *     js/db/WorldGen/HardcodedBiomeNames.json roster, folded into it), so a
 *     four-tile city like Milano infects the procedural map behind every one
 *     of its tiles, plus the countryside within a couple of tiles of it.
 *   - Each infected town runs its own SIR curve, resolved one whole day at a
 *     time at midnight, and exports cases to other towns along map distance
 *     (with the occasional long-range jump: people travel). Public response
 *     builds the longer a town has had it, which is what breaks the wave.
 *   - Two kinds: "medical" (a pathogen, with a real case fatality ratio) and
 *     "hysteria" (dancing fever, genital-stealing witch panics, phantom
 *     gassers: caught by witnessing it, spread by talking about it).
 *   - A world starts with three already running: one mass hysteria, one
 *     ordinary medical outbreak, one rare and mortal one.
 *   - Anyone standing in an infected town is exposed, the party included.
 *     Both procedural and authored-map NPCs are drawn from the same local
 *     prevalence, so the sick are actually sick where the outbreak is.
 *   - Outbreaks publish into the NPCWorldWeb settlement pulse, so mood,
 *     hiring, shop traffic, need drain and NPC gossip all feel them, and into
 *     the news ticker.
 *   - HistorySimulator writes the 20th century's epidemics into
 *     $gameSystem._historicalEpidemics; NPCs from a town one of them hit carry
 *     it in their medical record before the player ever meets them.
 *
 * PUBLIC API (window.DiseaseSystem, window.EpidemicSystem) documented inline.
 *
 * Load AFTER: DataService, NPCShared. (Everything else is referenced lazily.)
 *
 * @command InfectLeader
 * @desc Infect the party leader with a disease by id (debug/event use).
 * @arg id
 * @type string
 * @desc Disease id from Diseases.json (e.g. influenza, mana-plague).
 *
 * @command CureLeader
 * @desc Remove a disease from the party leader by id, or "all".
 * @arg id
 * @type string
 *
 * @command StartEpidemic
 * @desc Start an outbreak of a disease in a town (both optional: blank = rolled).
 * @arg disease
 * @type string
 * @desc Disease id from Diseases.json. Blank picks a weighted random one.
 * @arg place
 * @type string
 * @desc Town name from Destinations.json (e.g. Milano). Blank picks one.
 *
 * @command EpidemicReport
 * @desc Show the current Eurodemics bulletin (active outbreaks, ill, dead).
 */

(function () {
  'use strict';

  // paramId order used by RPG Maker: 0 MHP,1 MMP,2 ATK,3 DEF,4 MAT,5 MDF,6 AGI,7 LUK
  const PARAM_KEYS = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
  const CHRONIC = d => d && (d.durationDays < 0 || d.durationDays >= 9999);
  // Routes that pass between two people simply standing together and talking.
  // "social" is how a hysteria travels: it is caught by witnessing it.
  const CONTACT_VECTORS = ['airborne', 'saliva', 'contact', 'social'];

  // ATK..LUK are on the 1-20 ability scale (a class curve gives 8-16 at level 1
  // and 10-20 at level 99), so the deltas in Diseases.json are single digits.
  // Several illnesses carried at once, each weighted by how far it has run,
  // still add up, and a body that has been ill for a season should be a wreck
  // without being a stone: no illness load may take more than this share of the
  // ability a character was born with. MHP/MMP live on their own much larger
  // scale and keep the shallower ceiling.
  const ABILITY_PARAM_IDS = [2, 3, 4, 5, 6, 7];
  const MAX_ABILITY_DRAIN = 0.6;
  const MAX_POOL_DRAIN = 0.5;

  // ── Database (lazy) ───────────────────────────────────────────────────────
  const DB = { loaded: false, diseases: [], conditions: [], byId: {}, condById: {} };

  // js/db/Health/Diseases.json is regenerated by tools/health/gen_diseases.py, so
  // the Italian never goes in it: the display text lives in the Diseases i18n
  // namespace, keyed by the same ids, and is laid over a private copy here. Only
  // `name`, `desc` and the `symptoms` labels are replaced; `id` stays the key
  // every lookup and every save uses.
  function _localize() {
    if (!window.T || typeof T.has !== 'function' || !T.has('Diseases')) return;
    const L = (typeof T.obj === 'function' && T.obj('Diseases')) || {};
    const sym = L.symptom || {};
    const apply = (list, bank) => (list || []).forEach(e => {
      const t = bank && bank[e.id];
      if (t) {
        if (t.name) e.name = t.name;
        if (t.desc) e.desc = t.desc;
      }
      if (Array.isArray(e.symptoms)) e.symptoms = e.symptoms.map(x => sym[x] || x);
    });
    apply(DB.diseases, L.disease);
    apply(DB.conditions, L.condition);
  }

  function _ingest(data) {
    // Copy before localising: `data` is the shared window.Health.Diseases, and
    // rewriting its entries in place would leave English unrecoverable and
    // double-apply on a second ingest.
    const clone = o => JSON.parse(JSON.stringify(o || []));
    DB.diseases = clone(data.diseases);
    DB.conditions = clone(data.conditions);
    DB.byId = {};
    DB.condById = {};
    DB.diseases.forEach(d => (DB.byId[d.id] = d));
    DB.conditions.forEach(c => (DB.condById[c.id] = c));
    _localize();
    DB.lang = (window.ConfigManager && ConfigManager.language) || 'en';
    DB.loaded = true;
  }

  function ensureDb() {
    const lang = (window.ConfigManager && ConfigManager.language) || 'en';
    if (DB.loaded && DB.lang !== lang) DB.loaded = false;   // re-read in the new language
    if (DB.loaded) return true;
    // Preferred: DataService populated window.Health.Diseases from the db folder.
    // ensureDb is reached from Game_Map.update, so a throw here would be a
    // throw on every frame rather than a bad read once: a malformed table
    // leaves the system switched off instead of taking the map down with it.
    const data = window.Health && window.Health.Diseases;
    if (data && Array.isArray(data.diseases)) {
      try {
        _ingest(data);
        return true;
      } catch (e) {
        console.warn('[Health_DiseaseSystem] could not ingest the disease table', e);
        DB.loaded = false;
        return false;
      }
    }
    // Fallback: synchronous load (mirrors the NPCEmpathizeUI JSON loader).
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'js/db/Health/Diseases.json', false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        const parsed = JSON.parse(xhr.responseText);
        _ingest(parsed);
        if (window.Health) window.Health.Diseases = parsed;
        // note: the raw parse is cached, not DB's localised copy
        return true;
      }
    } catch (e) {
      console.warn('[Health_DiseaseSystem] could not load Diseases.json', e);
    }
    return false;
  }

  const nowMin = () => (window.$gameVariables ? $gameVariables.value(114) || 0 : 0);
  const _shared = () => window.NPCShared;
  function _rng(key) {
    const S = _shared();
    if (!S) return { next: () => 0.5, pick: a => a[Math.floor(a.length / 2)] || null };
    return new S.Rng(S.nameHash(String(key)) ^ S.worldSeed());
  }
  function _seededRoll(key) {
    const S = _shared();
    if (!S) return 0.5;
    return new S.Rng(S.nameHash(String(key)) ^ S.worldSeed()).next();
  }

  // ==========================================================================
  // EPIDEMIC GEOGRAPHY
  // ==========================================================================
  // Epidemics run on the real map. A "place" is a town: its name comes from
  // js/db/WorkSystem/Destinations.json (where an outbreak can start) and its
  // extent from that entry's own `reservedTiles` array (the retired
  // js/db/WorldGen/HardcodedBiomeNames.json roster, folded into it), which is
  // what pins a city to several world-map tiles. Milano is four tiles, so all
  // four procedural maps behind it carry the same infection.
  // window.WorldGen.HardcodedBiomeNames itself still resolves ("x,y" -> the
  // Destinations.json key standing on it): DataService derives it from every
  // entry's `reservedTiles` at load time, so this file (and every other
  // reader of that global) needed no further change.
  const MINUTES_PER_DAY = 1440;
  const EPOCH_YEAR = 2001;              // minute 0 = 1 Jan 2001, as in NPCWorldWeb
  const RURAL_RADIUS = 2;               // world tiles of countryside a town infects
  const HISTORY_CAP = 730;              // two years of daily samples per outbreak

  // Named world-map tiles that are landmarks, not populations. Nothing lives
  // there, so nothing can break out there either. A Destinations.json entry says
  // so itself through its "type": anything but a "city" or a "village" is a
  // place on the map rather than a place with a population. The list below is
  // only for the landmarks that carry no destination entry at all, and for the
  // ones whose type says what they are (a tavern, a filling station) without
  // implying anyone lives there.
  // i18n-ignore-start: world-map tile ids, matched against map data
  // Already normalized: _norm strips everything but a-z0-9, so a spaced entry
  // here could never match (which is what silently spared the multi-word
  // landmarks in the hand-written list this replaced).
  const POPULATED_TYPES = new Set(['city', 'village']);
  const NON_SETTLEMENTS = new Set(['maxtavern']);
  // i18n-ignore-end

  const _norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  // Whether a named place holds people. A destination answers with its own type;
  // a bare world-tile name falls back to the list above.
  const isPopulatedPlace = (name, destEntry) => {
    if (NON_SETTLEMENTS.has(_norm(name))) return false;
    if (destEntry && destEntry.type) return POPULATED_TYPES.has(String(destEntry.type));
    return true;
  };

  // A place is keyed by the Destinations.json key (or the biome-name label of a
  // world tile), which is what every record stores; what a bulletin, a log line
  // or the Eurodemics terminal shows is that entry's readable "name". A key with
  // no destination behind it (a named world tile) reads as it stands.
  const _placeLabel = key => (window.WorkSystem && window.WorkSystem.destinationName)
    ? window.WorkSystem.destinationName(key)
    : String(key == null ? '' : key);

  const Places = {
    built: false,
    byKey: {},        // canonical name -> place
    byNorm: {},       // normalized name -> canonical name
    byCoord: {},      // "x,y" -> canonical name
    list: [],         // settlements only, sorted, epidemic-eligible

    reset() { this.built = false; this.byKey = {}; this.byNorm = {}; this.byCoord = {}; this.list = []; },

    build() {
      if (this.built) return this.list.length > 0;
      const dest = (window.WorkSystem && window.WorkSystem.Destinations) || {};
      const named = (window.WorldGen && window.WorldGen.HardcodedBiomeNames) || {};
      if (!Object.keys(dest).length && !Object.keys(named).length) return false;

      const add = (name, x, y, isDestination, entry) => {
        const key = String(name).trim();
        const n = _norm(key);
        if (!n) return null;
        if (this.byNorm[n]) {
          const p = this.byKey[this.byNorm[n]];
          if (isDestination) p.isDestination = true;
          return p;
        }
        const place = {
          key, norm: n, x, y, tiles: [], isDestination: !!isDestination,
          settlement: isPopulatedPlace(key, entry),
        };
        this.byKey[key] = place;
        this.byNorm[n] = key;
        return place;
      };

      for (const [name, d] of Object.entries(dest)) {
        const b = (d && d.base) || null;
        if (!b || b.x == null || b.y == null) continue;
        add(name, b.x, b.y, true, d);
      }
      // Tiles: every world-map coordinate that carries this town's name. The
      // label is the destination key wherever one exists, so a tile added before
      // its entry (there are none, but the order is not load-bearing) still
      // resolves its type.
      for (const [coord, label] of Object.entries(named)) {
        const parts = String(coord).split(',');
        const x = Number(parts[0]), y = Number(parts[1]);
        if (!isFinite(x) || !isFinite(y)) continue;
        const place = add(label, x, y, false, dest[label]);
        if (!place) continue;
        place.tiles.push([x, y]);
        this.byCoord[`${x},${y}`] = place.key;
      }
      // A destination with no named tiles still occupies the tile it sits on.
      for (const place of Object.values(this.byKey)) {
        if (!place.tiles.length) {
          place.tiles.push([place.x, place.y]);
          const ck = `${place.x},${place.y}`;
          if (!this.byCoord[ck]) this.byCoord[ck] = place.key;
        }
        // Anchor coordinate = first tile, so a city's centre is one of its tiles.
        place.x = place.tiles[0][0];
        place.y = place.tiles[0][1];
        // Population: seeded per world, scaled by how many world tiles the town
        // covers (a four-tile city is a real city, a one-tile place is a town).
        const rng = _rng('pop:' + place.key);
        const spread = Math.pow(place.tiles.length, 1.6);
        place.population = Math.max(400, Math.round((3000 + rng.next() * 9000) * spread));
      }

      this.list = Object.values(this.byKey)
        .filter(p => p.settlement)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      this.built = true;
      return this.list.length > 0;
    },

    get(key) { this.build(); return this.byKey[key] || this.byKey[this.byNorm[_norm(key)]] || null; },

    // The town a world-map tile belongs to: the tile itself if it is named,
    // otherwise the nearest town within RURAL_RADIUS (its countryside).
    forCoord(x, y) {
      if (!this.build() || !isFinite(x) || !isFinite(y)) return null;
      const exact = this.byCoord[`${x},${y}`];
      if (exact) return this.byKey[exact] || null;
      let best = null, bestD = Infinity;
      for (const place of this.list) {
        for (const [tx, ty] of place.tiles) {
          const d = Math.max(Math.abs(tx - x), Math.abs(ty - y));
          if (d <= RURAL_RADIUS && d < bestD) { bestD = d; best = place; }
        }
      }
      return best;
    },

    // The town an NPC map group belongs to. Handles the three kinds of group
    // the simulation knows: a procedural per-tile settlement ("Proc:x,y"), an
    // authored MapGroups.json key ("OmegaTower", "GhentFields"), and anything
    // carrying world coordinates of its own.
    forGroup(groupName) {
      if (!groupName || !this.build()) return null;
      const proc = /^Proc:(-?\d+),(-?\d+)$/i.exec(String(groupName));
      if (proc) return this.forCoord(Number(proc[1]), Number(proc[2]));

      const n = _norm(groupName);
      if (this.byNorm[n]) return this.byKey[this.byNorm[n]];
      // "GhentFields" is Ghent's countryside; longest prefix match wins so
      // "GreenWitchSpaceCenter" does not collapse into "GreenWitch" by accident
      // when a better match exists.
      let best = null;
      for (const place of this.list) {
        if (place.norm.length < 4) continue;
        if (n.startsWith(place.norm) || place.norm.startsWith(n)) {
          if (!best || place.norm.length > best.norm.length) best = place;
        }
      }
      if (best) return best;

      const grp = window.$gameSystem && $gameSystem._npcMapGroups && $gameSystem._npcMapGroups[groupName];
      if (grp && grp.worldX != null) return this.forCoord(grp.worldX, grp.worldY);
      return null;
    },

    distance(a, b) {
      if (!a || !b) return 999;
      return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    },
  };

  // ==========================================================================
  // EPIDEMIC ENGINE
  // ==========================================================================
  // A compartmental (SIR) curve per infected town, resolved one whole day at a
  // time so the numbers only ever move at midnight, plus town-to-town spread
  // along real map distance. Everything is drawn from the world seed, so the
  // same world produces the same outbreaks in every savegame of it.
  const EPI = {
    MAX_ACTIVE: 6,
    MAX_CATCHUP_DAYS: 400,       // a long fast-travel/sleep skip still resolves
    IGNITE_MEDICAL: 1 / 90,      // per-day chance a new medical outbreak starts
    IGNITE_HYSTERIA: 1 / 110,    // per-day chance a new panic starts
    IGNITE_LOAD: 0.45,           // how much each running outbreak suppresses new ones
    IGNITE_WEEKLY: 0.22,         // the continent's own roll, once every seven days
    SEED_CASES: 12,              // index cluster a fresh site starts with
    // An outbreak is not just the disease: it is a strain that travels, in a
    // town that lets it (bad water, a crowded ward, a hot rumour). The rolled
    // strain factor is what turns a background illness into an epidemic.
    STRAIN_MIN: 1.4,
    STRAIN_MAX: 2.4,
    R0_FLOOR: 2.2,               // below this nothing would ever take off
    R0_CEILING: 18,
    STRAGGLE_DAYS: 30,           // days of near-zero cases before a town is clear
    // Only part of a town is ever really at risk: one water supply, one
    // congregation, one age group, one social circle the rumour travels in.
    // This is what keeps an outbreak to a believable share of a population.
    EXPOSED_MIN: 0.10,
    EXPOSED_MAX: 0.32,
    // Response is flat while nobody has noticed yet and bites hard afterwards,
    // which is the shape that gives a curve a peak instead of a slow fizzle.
    RESPONSE_HALFLIFE: 40,       // days until quarantine halves transmission
    HYSTERIA_HALFLIFE: 25,       // panics break faster, once the papers debunk them
    SPREAD_DIVISOR: 900,         // new cases per day that make one export likely
    SPREAD_PER_DAY: 0.55,        // export pressure scaler between towns
    SPREAD_CAP: 0.28,            // never more than roughly one new town every 4 days
    JUMP_CHANCE: 0.02,           // long-range travel seeding a distant town
    MAX_SITES: 14,               // towns one outbreak can reach before it is ringed
    MAX_SITES_HYSTERIA: 10,      // a panic needs a shared culture to travel
    // A town that catches it late already has the continent's guard up: the
    // border checks, the ward closures and the debunking are all in place
    // before the first case lands.
    LATE_ARRIVAL_GUARD: 0.6,
    NPC_VISIBILITY: 3,           // townsfolk shown ill per unit of prevalence
    RARITY_WEIGHT: { common: 6, uncommon: 3, rare: 1 },
  };

  const _dayOf = minute => Math.floor((Number(minute) || 0) / MINUTES_PER_DAY);

  function _dateOfDay(day) {
    const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + day * MINUTES_PER_DAY);
    return d;
  }

  function _dateStr(day) {
    const d = _dateOfDay(day);
    const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  }

  function epiState() {
    if (!window.$gameSystem) return null;
    if (!$gameSystem._epidemics) {
      $gameSystem._epidemics = { v: 1, lastDay: null, seq: 0, active: [], past: [], seeded: false };
    }
    const s = $gameSystem._epidemics;
    if (!Array.isArray(s.active)) s.active = [];
    if (!Array.isArray(s.past)) s.past = [];
    return s;
  }

  // Diseases an outbreak can be built from, weighted by how rare they are.
  // Whether an illness exists in this world at all. Every disease carries a
  // `nature` of its own (tools/nature/gen_nature_tags.js, from its category:
  // the esoteric, cursed, cosmic and anomalous ones are magical and everything
  // else, mass hysteria and computer worms included, is not). In a severed
  // world nobody catches a curse and in an unbound one nobody catches a cold.
  //
  // This gates what is DEALT, never what is already carried: an illness a
  // character came into the world with, or a story condition somebody was
  // written with, is untouched.
  function _natureAllows(d) {
    const MN = window.MagicNature;
    if (!MN || !MN.isFiltering()) return true;
    return MN.allowsTrait(d);   // reads the same `nature` field Traits.json uses
  }

  // How the illness reads on a sheet.
  function _natureLabel(d) {
    return String(d && d.nature).toLowerCase() === 'magical'
      ? T('Diseases.ui.natureMagical') : T('Diseases.ui.natureMundane');
  }

  function _epidemicPool(kind) {
    ensureDb();
    return DB.diseases.filter(d =>
      d.epidemic && !d.stageOnly && _natureAllows(d) &&
      (kind ? (d.kind || 'medical') === kind : true));
  }

  // Every random deal of an illness to a person draws from here: an outbreak
  // is not the only thing that hands one out. A late stage is only ever
  // REACHED, so it is filtered out of all of them.
  function _dealable(filter) {
    ensureDb();
    return DB.diseases.filter(d =>
      !d.stageOnly && !d.unique && _natureAllows(d) && filter(d));
  }

  function _pickWeighted(rng, pool) {
    if (!pool.length) return null;
    let total = 0;
    const weights = pool.map(d => {
      const w = EPI.RARITY_WEIGHT[d.rarity] || 3;
      total += w;
      return w;
    });
    let r = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      if ((r -= weights[i]) <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Outbreak names read the way each kind is actually talked about: a bureau
  // files a pathogen, a town remembers a panic.
  function _outbreakName(disease, place, day) {
    const year = _dateOfDay(day).getFullYear();
    return {
      key: disease.kind === 'hysteria' ? 'Epidemics.name.hysteria' : 'Epidemics.name.medical',
      params: { disease: disease.name, place: place.key, year: year },
    };
  }

  // Outbreak names and bureau-log lines are saved with the world, so they are
  // stored as a key plus its parameters and resolved when they are shown.
  // A plain string is a record written before this change.
  function _textOf(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (!entry.key || !T.has(entry.key)) return entry.text || '';
    const params = entry.params || {};
    // Place parameters are stored as keys; they are read out as names.
    if (params.place != null || params.from != null) {
      const shown = Object.assign({}, params);
      if (shown.place != null) shown.place = _placeLabel(shown.place);
      if (shown.from != null) shown.from = _placeLabel(shown.from);
      return T(entry.key, shown);
    }
    return T(entry.key, params);
  }

  function _newSite(place, cases, epidemicId) {
    const rng = _rng(`exposed:${epidemicId || ''}:${place.key}`); // i18n-ignore: rng seed
    const exposed = Math.round(place.population *
      (EPI.EXPOSED_MIN + rng.next() * (EPI.EXPOSED_MAX - EPI.EXPOSED_MIN)));
    return {
      infected: cases,
      // The pool it can actually work through, not the whole town.
      susceptible: Math.max(1, exposed - cases),
      exposedPool: Math.max(1, exposed),
      recovered: 0,
      dead: 0,
      cases,
      peak: cases,
      sinceDay: null,
    };
  }

  function _startEpidemic(state, disease, place, day, opts) {
    if (!disease || !place) return null;
    const o = opts || {};
    state.seq = (state.seq || 0) + 1;
    const infectiousDays = Math.max(3, CHRONIC(disease) ? 21 : (disease.durationDays || 10));
    const strainRng = _rng(`strain:${disease.id}:${place.key}:${day}`); // i18n-ignore: rng seed
    const strain = EPI.STRAIN_MIN + strainRng.next() * (EPI.STRAIN_MAX - EPI.STRAIN_MIN);
    const windowDays = Math.max(1, (disease.phases && (disease.phases.window || disease.phases.incubation)) || 5);
    const isCovert = !!o.covert;
    const revealDay = o.revealDay != null ? o.revealDay : (isCovert ? day + windowDays : day);

    const epidemic = {
      id: `EPI-${String(state.seq).padStart(4, '0')}`,
      diseaseId: disease.id,
      diseaseName: disease.name,
      kind: disease.kind || 'medical',
      name: o.name || _outbreakName(disease, place, day),   // pocket, read through nameOf()
      origin: place.key,
      startDay: day,
      startMinute: day * MINUTES_PER_DAY,
      endDay: null,
      strain: Math.round(strain * 100) / 100,
      r0: Math.round(Math.min(EPI.R0_CEILING,
        Math.max(EPI.R0_FLOOR, (disease.r0 || 1.5) * strain)) * 100) / 100,
      cfr: disease.cfr || 0,
      infectiousDays,
      status: 'active',
      sites: {},
      history: [],
      totals: { cases: 0, dead: 0, recovered: 0, peak: 0, peakDay: day, places: 1 },
      log: [],
      playerStarted: !!o.playerStarted,
      covert: isCovert,
      revealDay,
      fromParty: !!o.fromParty,
      partyActors: o.actorId ? [o.actorId] : (Array.isArray(o.partyActors) ? o.partyActors : []),
      originNpc: o.originNpc || null,
      notifiedThresholds: Array.isArray(o.notifiedThresholds) ? o.notifiedThresholds : [],
    };
    // A city's index cluster is bigger than a village's: more people were
    // already carrying it by the time anyone filed the first case.
    const defaultCases = o.playerStarted
      ? (o.cases || 1)
      : Math.round(EPI.SEED_CASES * (1 + place.population / 40000));
    const cases = Math.min(place.population, o.cases || defaultCases);
    const site = _newSite(place, cases, epidemic.id);
    site.sinceDay = day;
    epidemic.sites[place.key] = site;
    epidemic.totals.cases = cases;
    epidemic.totals.peak = cases;
    if (!isCovert) {
      epidemic.log.push({ day, key: 'Epidemics.log.firstCases', params: { place: place.key } });
      _announce(epidemic, place, day);
    } else {
      epidemic.log.push({ day, key: 'Epidemics.log.incubation', params: { place: place.key } });
    }
    state.active.push(epidemic);
    return epidemic;
  }

  // An outbreak is news. The bulletin carries the same priceEffect /
  // occupancyEffect the world web publishes, so rents and shop traffic feel it.
  function _announce(epidemic, place, day) {
    const mgr = window.$newsManager;
    if (!mgr || !Array.isArray(mgr.newsHistory)) return;
    const hysteria = epidemic.kind === 'hysteria';
    const label = epidemic.diseaseName || (DB.byId[epidemic.diseaseId] || {}).name || epidemic.name;
    try {
      const news = {
        text: `\\c[6][${_placeLabel(place.key)}]\\c[0] ` + T(
          hysteria ? 'Epidemics.news.hysteria' : 'Epidemics.news.medical',
          { disease: label, place: _placeLabel(place.key) }),
        // News locations are the readable town names the rest of the news and
        // the property market work in (NewsSystemUtils.getLocations).
        location: _placeLabel(place.key),
        category: 'negative',
        type: 'epidemic',
        timestamp: _dateOfDay(day),
        priceEffect: hysteria ? 0.96 : 0.9,
        occupancyEffect: hysteria ? 0.85 : 0.7,
        isRealNews: false,
      };
      mgr.newsHistory.unshift(news);
      if (mgr.newsHistory.length > 50) mgr.newsHistory.pop();
      if (typeof mgr.applyNewsEffects === 'function') mgr.applyNewsEffects(news, 96);
    } catch (e) { /* the ticker is optional */ }
  }

  // One day of an outbreak: every infected town advances its own curve, then
  // exports cases to its neighbours.
  function _stepEpidemic(epidemic, day) {
    const disease = DB.byId[epidemic.diseaseId];
    const rng = _rng(`${epidemic.id}:${day}`);
    const hysteria = epidemic.kind === 'hysteria';
    const halfLife = hysteria ? EPI.HYSTERIA_HALFLIFE : EPI.RESPONSE_HALFLIFE;
    const beta = (epidemic.r0 || 1.5) / Math.max(1, epidemic.infectiousDays);

    let dayCases = 0, dayDead = 0, totalInfected = 0;
    const exporters = [];

    for (const [key, site] of Object.entries(epidemic.sites)) {
      if (site.infected <= 0) continue;
      const place = Places.get(key);
      // The denominator is the pool actually at risk in that town, not the
      // whole census: mixing is never uniform across a city.
      const pop = site.exposedPool || (place && place.population) ||
        (site.susceptible + site.infected + site.recovered + site.dead) || 1;
      // Quarantine, hand-washing, closed schools, or simply everyone getting
      // bored of the rumour. Squared so the first weeks run almost unopposed
      // (nobody has noticed yet) and the clamp-down then falls away sharply.
      // A town infected late inherits the response the whole continent has
      // already built, which is what stops one outbreak eating every town.
      const siteAge = day - (site.sinceDay != null ? site.sinceDay : day);
      const age = Math.max(siteAge, (day - epidemic.startDay) * EPI.LATE_ARRIVAL_GUARD);
      const response = 1 / (1 + (age / halfLife) * (age / halfLife));
      const newCases = Math.min(
        site.susceptible,
        site.infected * beta * (site.susceptible / pop) * response * (0.75 + rng.next() * 0.5)
      );
      const resolving = site.infected / epidemic.infectiousDays;
      const dead = resolving * (epidemic.cfr || 0);

      site.susceptible -= newCases;
      site.infected = Math.max(0, site.infected + newCases - resolving);
      site.recovered += resolving - dead;
      site.dead += dead;
      site.cases += newCases;
      if (site.infected > site.peak) site.peak = site.infected;
      if (site.infected < 0.5) site.infected = 0;   // last case recovers
      // A handful of cases limping along for a month is a town that has beaten
      // it; the ward closes and the last patients are simply treated.
      if (site.infected > 0 && site.infected < 2 && siteAge > EPI.STRAGGLE_DAYS) site.infected = 0;

      dayCases += newCases;
      dayDead += dead;
      totalInfected += site.infected;
      if (site.infected >= 3) exporters.push({ place, site, newCases });
    }

    // ---- town to town -----------------------------------------------------
    // The deadlier it is, the harder it is ringed: cordons, closed borders and
    // burned bedding stop a lethal outbreak reaching as many towns as a cough.
    const maxSites = Math.max(3, Math.round(
      (hysteria ? EPI.MAX_SITES_HYSTERIA : EPI.MAX_SITES) * (1 - (epidemic.cfr || 0))));
    for (const { place, site, newCases } of exporters) {
      if (!place) continue;
      if (Object.keys(epidemic.sites).length >= maxSites) break;
      // Export pressure is what the town is currently generating, plus a
      // standing chance that one traveller carries it somewhere far away.
      const pressure = Math.min(EPI.SPREAD_CAP, (newCases / EPI.SPREAD_DIVISOR) * EPI.SPREAD_PER_DAY)
        + EPI.JUMP_CHANCE * Math.min(1, site.infected / 4000);
      if (rng.next() > pressure) continue;
      const target = _pickSpreadTarget(epidemic, place, rng);
      if (!target || epidemic.sites[target.key]) continue;
      const seeded = Math.max(1, Math.round(1 + rng.next() * 4));
      const fresh = _newSite(target, Math.min(target.population, seeded), epidemic.id);
      fresh.sinceDay = day;
      epidemic.sites[target.key] = fresh;
      epidemic.totals.places = Object.keys(epidemic.sites).length;
      epidemic.log.push({ day, key: 'Epidemics.log.reaches', params: { place: target.key, from: place.key } });
      totalInfected += fresh.infected;
      dayCases += fresh.infected;
      _announce(epidemic, target, day);
    }

    epidemic.totals.cases += dayCases;
    epidemic.totals.dead += dayDead;
    if (totalInfected > epidemic.totals.peak) {
      epidemic.totals.peak = totalInfected;
      epidemic.totals.peakDay = day;
    }
    epidemic.history.push([day, Math.round(totalInfected), Math.round(dayCases), Math.round(epidemic.totals.dead)]);
    if (epidemic.history.length > HISTORY_CAP) epidemic.history.shift();

    if (totalInfected < 1) {
      epidemic.status = 'over';
      epidemic.endDay = day;
      epidemic.log.push({
        day,
        key: 'Epidemics.log.declaredOver',
        params: { cases: Math.round(epidemic.totals.cases), dead: Math.round(epidemic.totals.dead) },
      });
    }
    _checkThresholds(epidemic);
    return totalInfected;
  }

  const THRESHOLDS = [100, 1000, 10000, 100000, 1000000, 10000000];

  function _checkThresholds(epidemic) {
    if (!epidemic || !epidemic.playerStarted || epidemic.covert) return;
    epidemic.notifiedThresholds = epidemic.notifiedThresholds || [];
    const totalCases = Math.round(epidemic.totals.cases || 0);
    for (const t of THRESHOLDS) {
      if (totalCases >= t && !epidemic.notifiedThresholds.includes(t)) {
        epidemic.notifiedThresholds.push(t);
        _notifyThreshold(epidemic, t);
      }
    }
  }

  function _notifyThreshold(epidemic, threshold) {
    if (!window.ParchmentToast) return;
    const disease = DB.byId[epidemic.diseaseId];
    const diseaseName = (disease && disease.name) || epidemic.diseaseName || _textOf(epidemic.name);
    const countStr = threshold.toLocaleString ? threshold.toLocaleString() : String(threshold);
    let msg = T('Epidemics.toast.threshold', {
      disease: diseaseName,
      count: countStr,
    });
    if (!msg || msg.startsWith('Epidemics.')) {
      msg = `Outbreak Alert: ${diseaseName} has reached ${countStr} cases!`;
    }
    try {
      window.ParchmentToast.show(msg, {
        severity: threshold >= 10000 ? 'danger' : 'warning',
        duration: 280,
        icon: 177,
        key: `epi-thresh:${epidemic.id}:${threshold}`,
      });
    } catch (e) { /* toasts are optional */ }
  }

  function startPlayerEpidemic(diseaseId, placeKey, opts) {
    if (!ensureDb() || !Places.build()) return null;
    const state = epiState();
    if (!state) return null;
    const disease = DB.byId[diseaseId];
    if (!disease) return null;
    const place = Places.get(placeKey) || _currentPlace() || Places.list[0];
    if (!place) return null;

    const day = _dayOf(nowMin());
    const o = Object.assign({ playerStarted: true }, opts);

    // If an active epidemic of this disease already exists at this place, merge/update it
    let existing = state.active.find(e => e.diseaseId === diseaseId && e.sites[place.key]);
    if (existing) {
      existing.playerStarted = true;
      if (!o.covert) {
        existing.covert = false;
      }
      if (o.fromParty) {
        existing.fromParty = true;
        existing.partyActors = existing.partyActors || [];
        if (o.actorId && !existing.partyActors.includes(o.actorId)) existing.partyActors.push(o.actorId);
      }
      const site = existing.sites[place.key];
      if (site) {
        site.infected = Math.max(1, (site.infected || 0) + 1);
        site.cases = Math.max(1, (site.cases || 0) + 1);
      }
      return existing;
    }

    const ep = _startEpidemic(state, disease, place, day, o);
    _syncWorldWeb(state, day);
    return ep;
  }

  function _onActorEpidemicCured(actor, epidemicId) {
    const s = epiState();
    if (!s) return;
    const epidemic = s.active.find(e => e.id === epidemicId);
    if (!epidemic) return;
    if (epidemic.partyActors) {
      epidemic.partyActors = epidemic.partyActors.filter(id => id !== actor.actorId());
    }
    // If this epidemic was started from party, check if anyone else in the party still has it
    if (epidemic.fromParty) {
      const partyMembers = (window.$gameParty && $gameParty.members) ? $gameParty.members() : [];
      const stillCarriedInParty = partyMembers.some(a =>
        (a._diseases || []).some(d => d.id === epidemic.diseaseId || d.epidemic === epidemicId)
      );
      if (!stillCarriedInParty) {
        // Check if there is any ongoing town spread
        const totalTownInfected = Object.values(epidemic.sites || {})
          .reduce((n, site) => n + (site.infected || 0), 0);
        // If town spread is negligible (e.g. <= 1 case that was just the initial party index case), end it
        if (totalTownInfected <= 1) {
          window.EpidemicSystem.end(epidemic.id);
        }
      }
    }
  }

  // Where it goes next: mostly the nearest town it has not reached, but travel
  // occasionally carries it clean across the map.
  function _pickSpreadTarget(epidemic, from, rng) {
    const candidates = Places.list.filter(p => !epidemic.sites[p.key]);
    if (!candidates.length) return null;
    if (rng.next() < EPI.JUMP_CHANCE) return candidates[Math.floor(rng.next() * candidates.length)];
    let total = 0;
    const weights = candidates.map(p => {
      const d = Places.distance(from, p);
      const w = 1 / (Math.pow(Math.max(1, d), 1.8) + 2);
      total += w;
      return w;
    });
    let r = rng.next() * total;
    for (let i = 0; i < candidates.length; i++) {
      if ((r -= weights[i]) <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  // The three outbreaks the world already has when the player arrives: a mass
  // hysteria, an ordinary medical one, and something rare and mortal. Each is
  // run forward a few weeks so the Eurodemics curve is already interesting.
  function _seedInitialEpidemics(state, day) {
    if (state.seeded) return;
    state.seeded = true;
    if (!Places.build()) { state.seeded = false; return; }

    const rng = _rng('epidemic:initial');
    const pick = (pool, filter) => {
      const list = filter ? pool.filter(filter) : pool;
      return _pickWeighted(rng, list.length ? list : pool);
    };
    const hysteria = pick(_epidemicPool('hysteria'));
    const medical = pick(_epidemicPool('medical'), d => d.rarity === 'common' && d.cfr < 0.05);
    const mortal = pick(_epidemicPool('medical'), d => d.cfr >= 0.1 || d.rarity === 'rare');

    const towns = Places.list.filter(p => p.isDestination);
    const pool = towns.length ? towns : Places.list;
    const seen = new Set();
    const town = () => {
      for (let i = 0; i < 12; i++) {
        const p = pool[Math.floor(rng.next() * pool.length)];
        if (p && !seen.has(p.key)) { seen.add(p.key); return p; }
      }
      return pool[0];
    };

    // Backdated starts, so day 0 already shows three curves at different stages.
    const plans = [
      { disease: hysteria, head: 10 + Math.floor(rng.next() * 25) },
      { disease: medical, head: 6 + Math.floor(rng.next() * 20) },
      { disease: mortal, head: 3 + Math.floor(rng.next() * 12) },
    ];
    for (const plan of plans) {
      if (!plan.disease) continue;
      const startDay = day - plan.head;
      const epidemic = _startEpidemic(state, plan.disease, town(), startDay, { cases: EPI.SEED_CASES });
      if (!epidemic) continue;
      for (let d = startDay + 1; d <= day; d++) {
        if (epidemic.status !== 'active') break;
        _stepEpidemic(epidemic, d);
      }
    }
  }

  // Spontaneous ignition: rare, and rarer still while several are running.
  function _maybeIgnite(state, day) {
    if (state.active.length >= EPI.MAX_ACTIVE) return;
    const rng = _rng(`epidemic:ignite:${day}`);
    const load = 1 / (1 + state.active.length * EPI.IGNITE_LOAD);
    for (const kind of ['medical', 'hysteria']) {
      const rate = (kind === 'medical' ? EPI.IGNITE_MEDICAL : EPI.IGNITE_HYSTERIA) * load;
      if (rng.next() >= rate) continue;
      const disease = _pickWeighted(rng, _epidemicPool(kind));
      const towns = Places.list.filter(p => p.isDestination);
      const place = (towns.length ? towns : Places.list)[Math.floor(rng.next() * (towns.length || Places.list.length))];
      if (disease && place) _startEpidemic(state, disease, place, day);
    }
  }

  // ── The daily bulletin ────────────────────────────────────────────────────
  // An outbreak is not one headline: it is a story the paper carries every day
  // until it is over. One line a day per running outbreak, with the day's dead
  // and the towns it has reached, and a different register entirely when the
  // party is the one who started it: an epidemic somebody released on purpose
  // is reported as bioterrorism, and the wire says so until it burns out.
  const BULLETIN = {
    MIN_INFECTED: 20,     // below this nobody has noticed yet
    BACKFILL_DAYS: 2,     // a long sleep prints the last days, not the last year
  };

  function _bulletinNews(epidemic, day) {
    const mgr = window.$newsManager;
    if (!mgr || typeof mgr.publishStory !== 'function') return;
    if (epidemic.covert && !(epidemic.revealDay != null && day >= epidemic.revealDay)) return;

    let infected = 0, dead = 0, towns = 0;
    for (const site of Object.values(epidemic.sites)) {
      infected += site.infected;
      dead += site.dead;
      if (site.infected >= 1) towns++;
    }
    if (infected < BULLETIN.MIN_INFECTED) return;
    if (epidemic.lastBulletinDay === day) return;
    epidemic.lastBulletinDay = day;

    const label = epidemic.diseaseName || (DB.byId[epidemic.diseaseId] || {}).name || _textOf(epidemic.name);
    const worst = Object.entries(epidemic.sites)
      .sort((a, b) => b[1].infected - a[1].infected)[0];
    const place = worst ? _placeLabel(worst[0]) : _placeLabel(epidemic.origin);
    // Released on purpose: by the party, or from a party member carrying it.
    const terror = !!(epidemic.playerStarted || epidemic.fromParty);
    const params = {
      disease: label, place: place, towns: towns,
      infected: Math.round(infected), dead: Math.round(dead),
    };
    try {
      mgr.publishStory({
        text: T(terror ? 'Epidemics.news.terrorDaily' : 'Epidemics.news.daily', params),
        fullText: T(terror ? 'Epidemics.news.terrorBody' : 'Epidemics.news.dailyBody', params),
        location: place,
        category: 'negative',
        type: terror ? 'bioterror' : 'epidemic',
        timestamp: _dateOfDay(day),
        priceEffect: terror ? 0.88 : 0.94,
        occupancyEffect: terror ? 0.7 : 0.85,
        soul: terror ? -2 : -1,
        duration: 24,
        announce: false,
      });
    } catch (e) { /* the ticker is optional */ }
  }

  // The last word: the day an outbreak closes is reported too.
  function _bulletinOver(epidemic, day) {
    const mgr = window.$newsManager;
    if (!mgr || typeof mgr.publishStory !== 'function') return;
    if (epidemic.covert) return;
    if (epidemic.totals.cases < BULLETIN.MIN_INFECTED) return;
    const label = epidemic.diseaseName || (DB.byId[epidemic.diseaseId] || {}).name || _textOf(epidemic.name);
    try {
      mgr.publishStory({
        text: T('Epidemics.news.over', {
          disease: label, place: _placeLabel(epidemic.origin),
          cases: Math.round(epidemic.totals.cases), dead: Math.round(epidemic.totals.dead),
        }),
        location: _placeLabel(epidemic.origin),
        category: 'positive', type: 'epidemic',
        timestamp: _dateOfDay(day),
        priceEffect: 1.02, occupancyEffect: 1.05, duration: 48, announce: false,
      });
    } catch (e) { /* the ticker is optional */ }
  }

  // ── The weekly roll ───────────────────────────────────────────────────────
  // The per-day ignition is a slow background hiss. On top of it the continent
  // gets one roll a week for an outbreak of its own, so a world left alone
  // still has an epidemic season rather than a flat year.
  function _maybeWeeklyIgnite(state, day) {
    if (day % 7 !== 0) return;
    if (state.active.length >= EPI.MAX_ACTIVE) return;
    const rng = _rng(`epidemic:week:${day}`);
    const load = 1 / (1 + state.active.length * EPI.IGNITE_LOAD);
    if (rng.next() >= EPI.IGNITE_WEEKLY * load) return;
    const kind = rng.next() < 0.75 ? 'medical' : 'hysteria';
    const disease = _pickWeighted(rng, _epidemicPool(kind));
    const towns = Places.list.filter(p => p.isDestination);
    const pool = towns.length ? towns : Places.list;
    const place = pool[Math.floor(rng.next() * pool.length)];
    if (disease && place) _startEpidemic(state, disease, place, day);
  }

  // The settlement pulse already drives mood, hiring, shop traffic, need drain
  // and NPC gossip off episodes.epidemic. Publishing into it means the whole
  // world web feels a Eurodemics outbreak without any of it knowing about us.
  // The outbreak ledger lives on the savegame, but "how many epidemics burn in
  // this world" is a question the save list and the world dossier ask about
  // worlds that are not loaded. A summary is mirrored into the world folder
  // every time the ledger moves, so those screens can answer it from disk.
  function _syncWorldSummary(state, day) {
    const WM = window.WorldManager;
    if (!WM || !WM.activeWorldName || !state) return;
    let infected = 0, dead = 0;
    const towns = new Set();
    const visible = state.active.filter(e => !e.covert || (e.revealDay != null && day >= e.revealDay));
    for (const e of visible) {
      for (const [key, site] of Object.entries(e.sites)) {
        infected += site.infected;
        if (site.infected >= 1) towns.add(key);
      }
      dead += e.totals.dead;
    }
    WM.setField('state', 'epidemics', {
      active: visible.length,
      infected: Math.round(infected),
      dead: Math.round(dead),
      towns: towns.size,
      past: state.past.length,
      day,
    });
  }

  function _syncWorldWeb(state, day) {
    _syncWorldSummary(state, day);
    const web = window.$gameSystem && $gameSystem._npcWorldWeb;
    if (!web || !web.settlements) return;
    const minute = day * MINUTES_PER_DAY;
    for (const [group, pulse] of Object.entries(web.settlements)) {
      if (!pulse || !pulse.episodes) continue;
      const place = Places.forGroup(group);
      const worst = place ? _worstAt(state, place.key) : null;
      const current = pulse.episodes.epidemic;
      // A settlement that is already under an episode this system did not start
      // is left alone until that one runs out. NPCWorldWeb only invents an
      // epidemic when this plugin is switched off or has no record of the town,
      // so in a normal world this branch never fires; when it does, the invented
      // one gets to end properly rather than being overwritten mid-run and
      // never announcing that it passed.
      if (current && current.source !== 'eurodemics') continue;
      if (worst) {
        const site = worst.sites[place.key];
        const severity = Math.max(10, Math.min(100, Math.round((site.infected / Math.max(1, place.population)) * 900)));
        pulse.episodes.epidemic = {
          startedMinute: current && current.epidemicId === worst.id ? current.startedMinute : minute,
          name: (DB.byId[worst.diseaseId] || {}).name || _textOf(worst.name),
          severity,
          untilMinute: minute + 30 * MINUTES_PER_DAY,   // refreshed daily while it lasts
          epidemicId: worst.id,
          source: 'eurodemics',
        };
      } else if (current && current.source === 'eurodemics') {
        pulse.episodes.epidemic = null;
      }
    }
  }

  // The worst active outbreak in a town (most infected right now).
  function _worstAt(state, placeKey) {
    let best = null, bestInfected = 0;
    for (const epidemic of state.active) {
      const site = epidemic.sites[placeKey];
      if (!site || site.infected < 1) continue;
      if (site.infected > bestInfected) { bestInfected = site.infected; best = epidemic; }
    }
    return best;
  }

  // A few illnesses hand the body something it did not have before and take it
  // back when they are lifted: the lycanthrope's shift, the possessed's
  // borrowed voice, the drill an obsessive has worn into their hands. They are
  // the ones that used to sit in the trait list (Traits.json) and moved to the
  // library when it became clear they were illnesses; `skills` on the disease
  // is what came across with them.
  function _grantSkills(actor, disease, learn) {
    if (!actor || !disease || !disease.skills) return;
    for (const skillId of disease.skills) {
      if (!window.$dataSkills || !$dataSkills[skillId]) continue;
      if (learn) actor.learnSkill(skillId);
      else actor.forgetSkill(skillId);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const API = {
    ready() { return ensureDb(); },
    getDisease(id) { ensureDb(); return DB.byId[id] || null; },
    getCondition(id) { ensureDb(); return DB.condById[id] || null; },
    all() { ensureDb(); return DB.diseases; },
    allConditions() { ensureDb(); return DB.conditions; },
    displayName(id) { const d = this.getDisease(id) || this.getCondition(id); return d ? d.name : id; },
    startPlayerEpidemic(diseaseId, placeKey, opts) { return startPlayerEpidemic(diseaseId, placeKey, opts); },

    // Resolve any stored entry (disease OR condition) to its db object.
    resolve(entry) {
      ensureDb();
      const id = entry && entry.id != null ? entry.id : entry;
      return DB.byId[id] || DB.condById[id] || null;
    },

    // ── Party (Game_Actor) ──────────────────────────────────────────────────
    actorEntries(actor) { return (actor && actor._diseases) || []; },
    actorConditions(actor) { return (actor && actor._conditions) || []; },
    actorPast(actor) { return (actor && actor._pastDiseases) || []; },
    actorHasDisease(actor, id) { return this.actorEntries(actor).some(e => e.id === id); },

    infectActor(actor, id, sourceLabel, epidemicId, opts) {
      if (!ensureDb() || !actor) return false;
      const d = DB.byId[id];
      if (!d || this.actorHasDisease(actor, id)) return false;
      (actor._diseases || (actor._diseases = [])).push({
        id, sinceMin: nowMin(), steps: 0, onsetDone: false, source: sourceLabel || null,
        epidemic: epidemicId || null,
        // The course ledger. Nothing is owed until the illness can be named,
        // which is what makes a window period cost the patient something.
        dosed: 0, need: null, missed: 0, lastDoseDay: null,
        treatedDays: 0, suppressedUntilDay: null,
        // A disease picked knowingly (character creation) skips the window
        // period: the patient already knows what they have.
        diagnosed: !!(opts && opts.diagnosed),
      });
      _grantSkills(actor, d, true);
      if (actor.refresh) actor.refresh();
      // Catching something is the one health event that has to be announced
      // wherever it happens: no screen the player is looking at would show it.
      if (!(opts && opts.silent)) _reportCaught([{ actor, disease: d }], sourceLabel);
      return true;
    },

    cureActor(actor, id) {
      if (!actor || !actor._diseases) return;
      const dropped = id === 'all'
        ? actor._diseases.slice()
        : actor._diseases.filter(e => e.id === id);
      if (id === 'all') { actor._diseases = []; }
      else actor._diseases = actor._diseases.filter(e => e.id !== id);
      dropped.forEach(e => {
        _grantSkills(actor, DB.byId[e.id], false);
        if (e.epidemic) _onActorEpidemicCured(actor, e.epidemic);
      });
      if (actor.refresh) actor.refresh();
    },

    // Sum of param modifiers from every disease + condition the actor carries.
    actorParamDelta(actor, paramId) {
      if (!actor) return 0;
      const key = PARAM_KEYS[paramId];
      if (!key) return 0;
      if ((!actor._diseases || !actor._diseases.length) &&
          (!actor._conditions || !actor._conditions.length)) return 0;
      if (!ensureDb()) return 0;
      let sum = 0;
      for (const e of actor._diseases || []) {
        const d = DB.byId[e.id];
        if (!d || !d.params || !d.params[key]) continue;
        // An illness left to run gets heavier: the further along it is, the
        // more of itself it puts on the character sheet. A treated one, or one
        // whose course has not begun to slide, weighs what it says it does.
        const st = this.courseState ? this.courseState(actor, e) : null;
        sum += Math.round(d.params[key] * (1 + (st ? st.stage : 0)));
      }
      for (const e of actor._conditions || []) {
        const c = DB.condById[e.id != null ? e.id : e];
        if (c && c.params && c.params[key]) sum += c.params[key];
      }
      return this.clampParamDelta(actor, paramId, sum);
    },

    // The floor under a stacked illness load. Read off paramBase (the class
    // curve), which is what the character would have if nothing were wrong with
    // them, and never off param() itself: param() is what asked for this in the
    // first place.
    clampParamDelta(actor, paramId, delta) {
      if (!(delta < 0)) return delta;
      const share = ABILITY_PARAM_IDS.includes(paramId) ? MAX_ABILITY_DRAIN : MAX_POOL_DRAIN;
      const base = actor && typeof actor.paramBase === 'function' ? actor.paramBase(paramId) : 0;
      if (!(base > 0)) return delta;
      return Math.max(delta, -Math.floor(base * share));
    },

    // Diseases the party LEADER carries that can spread through a given vector.
    // Drives the Cough (airborne) / Spit (saliva) / Bite (bite) actions. This is
    // deliberate transmission, so it keys off the vector rather than the casual
    // "infective" flag: a leader carrying rabies CAN pass it by bite even though
    // rabies does not spread by casual proximity.
    leaderVectorDiseases(vector) {
      if (!ensureDb() || !window.$gameParty) return [];
      const leader = $gameParty.leader();
      if (!leader || !leader._diseases) return [];
      return leader._diseases
        .map(e => DB.byId[e.id])
        .filter(d => d && (d.vectors || []).includes(vector));
    },

    // ── Per-step onset (hooked into Game_Party.increaseSteps) ───────────────
    onPartyStep() {
      if (!window.$gameParty) return;
      const members = $gameParty.battleMembers ? $gameParty.battleMembers() : $gameParty.members();
      let any = false;
      for (const a of members) if (a._diseases && a._diseases.length) { any = true; break; }
      if (!any || !ensureDb()) return;
      for (const a of members) {
        for (const e of a._diseases || []) {
          e.steps = (e.steps || 0) + 1;
          const d = DB.byId[e.id];
          if (!d || e.onsetDone || !d.onset || !d.onset.stateId) continue;
          if (e.steps >= (d.onset.steps || 0)) {
            e.onsetDone = true;
            if (!a.isStateAffected(d.onset.stateId)) a.addState(d.onset.stateId);
          }
        }
      }
    },

    // ── Story conditions ────────────────────────────────────────────────────
    // Conditions nobody catches: they are part of who a character is. Em walks
    // out of the Solomonic Ritual carrying one (docs/Lore.odt) - the ritual took
    // 92% of her memories and left a magical potential that keeps growing, which
    // is exactly what the condition says on the Health tab. Re-applied rather
    // than granted once, so it also reaches an Em from a save made before this
    // existed and an Em who joined outside character creation.
    STORY_CONDITIONS: { Em: 'solomon-curse' },

    ensureStoryConditions() {
      if (!ensureDb() || !window.$gameParty) return;
      for (const a of $gameParty.members()) {
        const id = this.STORY_CONDITIONS[a.name()];
        if (!id || !DB.condById[id]) continue;
        const list = a._conditions || (a._conditions = []);
        if (list.some(e => (e && e.id != null ? e.id : e) === id)) continue;
        list.push({ id, sinceMin: nowMin(), story: true });
        if (a.refresh) a.refresh();
      }
    },

    // ── Party <-> party spread, rolled once per pause-menu open ──────────────
    rollPartyTransmission() {
      if (!ensureDb() || !window.$gameParty) return;
      const members = $gameParty.members();
      // Snapshot each member's diseases so newly caught ones don't chain-spread
      // within a single roll.
      const initial = members.map(a => ({ a, ds: [...(a._diseases || [])] }));
      for (const { a: src, ds } of initial) {
        for (const e of ds) {
          const d = DB.byId[e.id];
          if (!d || !d.infective || d.venereal) continue;
          // How catching it is depends on where in its course the carrier is:
          // nothing at all while it is still incubating, most of all through
          // its peak days, an ember either side.
          const chance = d.transmission * this.infectivityOf(src, e.id);
          if (chance <= 0) continue;
          for (const { a: tgt } of initial) {
            if (tgt === src || this.actorHasDisease(tgt, d.id)) continue;
            if ((tgt._pastDiseases || []).includes(d.id)) continue; // recovered, immune
            if (Math.random() < chance) this.infectActor(tgt, d.id, src.name());
          }
        }
      }
    },

    // Drop diseases whose course has run (chronic ones stay for life).
    expireActorDiseases() {
      if (!ensureDb() || !window.$gameParty) return;
      const now = nowMin();
      for (const a of $gameParty.members()) {
        if (!a._diseases || !a._diseases.length) continue;
        a._diseases = a._diseases.filter(e => {
          const d = DB.byId[e.id];
          if (!d) return false;
          if (CHRONIC(d)) return true;
          const elapsedDays = (now - (e.sinceMin || now)) / 1440;
          if (elapsedDays >= d.durationDays) {
            (a._pastDiseases || (a._pastDiseases = [])).push(e.id);
            if (a.refresh) a.refresh();
            return false;
          }
          return true;
        });
      }
    },

    // ── NPC side ────────────────────────────────────────────────────────────
    npcDiseases(profile) { return (profile && profile.diseases) || []; },
    npcPast(profile) { return (profile && profile.pastDiseases) || []; },
    npcConditions(profile) { return (profile && profile.conditions) || []; },
    npcHasDisease(profile, id) { return this.npcDiseases(profile).some(e => e.id === id); },

    infectNpc(profile, id, epidemicId) {
      if (!ensureDb() || !profile || !DB.byId[id]) return false;
      if (this.npcHasDisease(profile, id)) return false;
      (profile.diseases || (profile.diseases = [])).push({
        id, sinceMin: nowMin(), epidemic: epidemicId || null,
      });
      return true;
    },

    // Every outbreak a person has been through, live or historical. NPCs keep
    // it on the profile (world-shared), party members on the actor.
    npcEpidemicHistory(profile) { return (profile && profile.epidemicHistory) || []; },
    actorEpidemicHistory(actor) { return (actor && actor._epidemicHistory) || []; },

    _recordEpidemic(bag, entry) {
      if (!bag || !entry || !entry.id) return;
      if (bag.some(e => e.id === entry.id)) return;
      bag.push(entry);
      if (bag.length > 24) bag.shift();
    },

    recordActorEpidemic(actor, epidemic, placeKey, role) {
      if (!actor || !epidemic) return;
      const bag = actor._epidemicHistory || (actor._epidemicHistory = []);
      this._recordEpidemic(bag, {
        id: epidemic.id, name: _textOf(epidemic.name), diseaseId: epidemic.diseaseId,
        kind: epidemic.kind, place: placeKey || epidemic.origin,
        day: _dayOf(nowMin()), date: _dateStr(_dayOf(nowMin())), role: role || 'caught',
      });
    },

    recordNpcEpidemic(profile, epidemic, placeKey, role, dateOverride) {
      if (!profile || !epidemic) return;
      const bag = profile.epidemicHistory || (profile.epidemicHistory = []);
      this._recordEpidemic(bag, {
        id: epidemic.id, name: _textOf(epidemic.name), diseaseId: epidemic.diseaseId,
        kind: epidemic.kind, place: placeKey || epidemic.origin,
        date: dateOverride || _dateStr(_dayOf(nowMin())),
        role: role || 'caught', historical: !!epidemic.historical,
      });
    },

    // Deterministic once-built history (past diseases + lasting conditions),
    // then live epidemic + venereal refresh.
    ensureNpcMedicalHistory(name, profile) {
      if (!ensureDb() || !profile) return;
      this._buildBaseHistory(name, profile);
      this._expireNpcDiseases(profile);
      this._applyEpidemicInfection(name, profile);
      this._applyVenerealFromPartner(name, profile);
    },

    // NPCs recover too: an acute illness whose course has run moves into the
    // medical history, which is what lets the same NPC catch the next wave.
    _expireNpcDiseases(profile) {
      const list = profile.diseases;
      if (!Array.isArray(list) || !list.length) return;
      const now = nowMin();
      // Nobody off-screen is on a course of anything, so an illness that
      // progresses does, on its own schedule, and the NPC is met carrying what
      // it turned into rather than what they caught.
      for (const e of [...list]) {
        const d = DB.byId[e.id];
        const prog = d && d.progression;
        if (!prog || !DB.byId[prog.to]) continue;
        const carried = (now - (e.sinceMin || now)) / MINUTES_PER_DAY;
        if (carried < prog.days) continue;
        const at = list.indexOf(e);
        if (at >= 0) list.splice(at, 1);
        const past = profile.pastDiseases || (profile.pastDiseases = []);
        if (!past.includes(e.id)) past.push(e.id);
        if (!list.some(x => x.id === prog.to)) {
          list.push({ id: prog.to, sinceMin: now, epidemic: e.epidemic || null, progressedFrom: e.id });
        }
      }
      profile.diseases = list.filter(e => {
        const d = DB.byId[e.id];
        if (!d) return false;
        if (CHRONIC(d) || d.venereal) return true;
        const elapsedDays = (now - (e.sinceMin || 0)) / MINUTES_PER_DAY;
        if (e.sinceMin == null || elapsedDays < d.durationDays) return true;
        const past = profile.pastDiseases || (profile.pastDiseases = []);
        if (!past.includes(e.id)) past.push(e.id);
        return false;
      });
    },

    _buildBaseHistory(name, profile) {
      if (profile._medHistBuilt) return;
      const rng = _rng(name + '_medhist');
      const age = (window.NPCLifeSim && window.NPCLifeSim.ageOf && window.NPCLifeSim.ageOf(name))
        || Math.floor(20 + rng.next() * 40);

      // Past acute illnesses, scaled by age.
      const acute = _dealable(d => d.durationDays > 0 && d.durationDays < 9999);
      const nPast = Math.max(0, Math.min(6, Math.floor((age / 12) * (0.4 + rng.next()))));
      const past = [];
      for (let i = 0; i < nPast && acute.length; i++) {
        const d = rng.pick(acute);
        if (d && !past.includes(d.id)) past.push(d.id);
      }

      // Lasting conditions (broken bones, chronic ailments), scaled by age.
      // Story conditions (unique:true) belong to one named character and are
      // never dealt out to the population.
      const condPool = DB.conditions.filter(c => !c.unique);
      const nCond = Math.max(0, Math.min(4, Math.floor((age / 26) * (0.5 + rng.next()))));
      const conds = [];
      for (let i = 0; i < nCond && condPool.length; i++) {
        const c = rng.pick(condPool);
        if (c && !conds.some(x => x.id === c.id)) conds.push({ id: c.id, sinceMin: 0 });
      }

      // A chance of a standing chronic disease, rising with age.
      const chronicPool = _dealable(d => CHRONIC(d) && !d.venereal);
      const current = [];
      if (chronicPool.length && rng.next() < Math.min(0.4, age / 200)) {
        const d = rng.pick(chronicPool);
        if (d) current.push({ id: d.id, sinceMin: 0, chronic: true });
      }

      // Seed venereal diseases into the population so partner links have a
      // source to spread from. Odds scale with age and number of past partners
      // (a promiscuity proxy from the life record).
      const venerealPool = _dealable(d => d.venereal);
      const rec = window.NPCLifeSim && window.NPCLifeSim.getRecord && window.NPCLifeSim.getRecord(name);
      const exN = (rec && rec.exPartners && rec.exPartners.length) || 0;
      const vChance = Math.min(0.35, 0.015 + exN * 0.05 + age / 500);
      if (venerealPool.length && rng.next() < vChance) {
        const d = rng.pick(venerealPool);
        if (d && !current.some(x => x.id === d.id)) current.push({ id: d.id, sinceMin: 0, venereal: true });
      }

      profile.pastDiseases = past;
      profile.conditions = conds;
      profile.diseases = current;
      profile._medHistBuilt = true;

      // Outbreaks that swept their home town while they were alive: the
      // century's epidemics are part of who a person is before the player ever
      // meets them (HistorySimulator writes the ledger).
      this._applyHistoricalEpidemics(name, profile, age, rng);
    },

    // Everything the world's history says happened to this NPC's home town.
    // Some lived through it, some caught it and carry the scar in their record.
    _applyHistoricalEpidemics(name, profile, age, rng) {
      const past = window.EpidemicSystem && window.EpidemicSystem.historical
        ? window.EpidemicSystem.historical() : [];
      if (!past || !past.length) return;
      const place = Places.forGroup(profile._homeGroupName);
      const homeNorm = _norm(place ? place.key : (profile._birthplaceOverride || ''));
      if (!homeNorm) return;
      const birthYear = _dateOfDay(_dayOf(nowMin())).getFullYear() - (age || 30);

      for (const record of past) {
        const year = Number(String(record.startDate || '').slice(0, 4)) || 0;
        if (!year || year < birthYear) continue;              // not born yet
        const hit = (record.places || []).some(p => _norm(p) === homeNorm);
        if (!hit) continue;
        const disease = DB.byId[record.diseaseId];
        const roll = _seededRoll(`${name}|hist|${record.id}`);
        // Small children and the elderly caught more of them.
        const ageThen = year - birthYear;
        const exposure = 0.30 + (ageThen < 12 ? 0.18 : 0) + (record.kind === 'hysteria' ? 0.1 : 0);
        if (roll < exposure) {
          if (disease && !(profile.pastDiseases || []).includes(disease.id)) {
            (profile.pastDiseases || (profile.pastDiseases = [])).push(disease.id);
          }
          this.recordNpcEpidemic(profile, Object.assign({ historical: true }, record),
            record.origin, 'caught', `${year}`);
        } else if (roll < exposure + 0.35) {
          this.recordNpcEpidemic(profile, Object.assign({ historical: true }, record),
            record.origin, 'lived-through', `${year}`);
        }
      }
      void rng;
    },

    // Live outbreak pressure on an NPC. A person's home town is resolved to a
    // real place (a "Proc:x,y" procedural settlement resolves through the
    // world-map tile, so all four tiles of Milano are the same Milano), and the
    // local prevalence decides whether they are currently one of the sick.
    // Falls back to the settlement pulse for groups no place can be found for.
    _applyEpidemicInfection(name, profile) {
      const grp = profile._homeGroupName;
      if (!grp || !window.$gameSystem) return;
      const ES = window.EpidemicSystem;
      // Their own town first, then wherever they are standing: a traveller in a
      // sick town is breathing the same air as its residents.
      const places = [];
      const addPlace = p => { if (p && !places.some(q => q.key === p.key)) places.push(p); };
      if (ES && ES.placeForGroup) {
        addPlace(ES.placeForGroup(grp));
        addPlace(ES.currentPlace());
      }

      if (places.length) {
        // A fixed, world-seeded susceptibility per person: as prevalence climbs
        // more of the town crosses the line, and as it falls they recover out
        // of it through _expireNpcDiseases.
        for (const place of places) {
          for (const epidemic of ES.activeAt(place.key)) {
            const disease = DB.byId[epidemic.diseaseId];
            if (!disease) continue;
            const prevalence = ES.prevalenceAt(place.key, epidemic);
            const susceptibility = _seededRoll(`${name}|${epidemic.id}|${place.key}`);
            const already = this.npcHasDisease(profile, disease.id);
            const immune = (profile.pastDiseases || []).includes(disease.id);
            if (!already && !immune && susceptibility < Math.min(0.6, prevalence * EPI.NPC_VISIBILITY)) {
              this.infectNpc(profile, disease.id, epidemic.id);
              this.recordNpcEpidemic(profile, epidemic, place.key, 'caught');
            } else if (!already) {
              this.recordNpcEpidemic(profile, epidemic, place.key, 'lived-through');
            }
          }
        }
        // Their location is known and modelled: the settlement-pulse fallback
        // below would only double-count the same outbreak.
        return;
      }

      const web = $gameSystem._npcWorldWeb;
      const ep = web && web.settlements && web.settlements[grp] &&
        web.settlements[grp].episodes && web.settlements[grp].episodes.epidemic;
      if (!ep) return;
      // Already carrying an acute illness? Leave it.
      if (this.npcDiseases(profile).some(e => { const d = DB.byId[e.id]; return d && !CHRONIC(d); })) return;
      const chance = 0.25 + ((ep.severity != null ? ep.severity : 50) / 200); // 0.25..0.5
      if (_seededRoll(name + '_epi' + (ep.startedMinute || 0)) < chance) {
        const pool = _dealable(d => d.infective && !d.venereal && (d.vectors || []).includes('airborne'));
        const d = _rng(name + '_epipick' + (ep.startedMinute || 0)).pick(pool);
        if (d && !this.npcHasDisease(profile, d.id)) {
          (profile.diseases || (profile.diseases = [])).push({ id: d.id, sinceMin: nowMin(), epidemic: true });
        }
      }
    },

    // Venereal diseases pass only through the NPCLifeSim romantic partner link.
    _applyVenerealFromPartner(name, profile) {
      const LS = window.NPCLifeSim;
      const rec = LS && LS.getRecord && LS.getRecord(name);
      const partner = rec && rec.partner;
      if (!partner || partner.external) return;
      const pProfile = window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile &&
        window.NPCSocietyRegistry.getProfile(partner.name);
      if (!pProfile) return;
      // Make sure the partner's own base history exists (no recursion into
      // epidemic/venereal, which would loop back here).
      this._buildBaseHistory(partner.name, pProfile);
      for (const e of pProfile.diseases || []) {
        const d = DB.byId[e.id];
        if (!d || !d.venereal || this.npcHasDisease(profile, d.id)) continue;
        const key = [name, partner.name].sort().join('|') + '|' + d.id;
        if (_seededRoll(key) < d.transmission) {
          (profile.diseases || (profile.diseases = [])).push({ id: d.id, sinceMin: 0, venereal: true });
        }
      }
    },

    // Casual two-way contact spread, rolled when the Empathize panel opens.
    onEmpathizeOpen(name, profile) {
      if (!ensureDb() || !profile || !window.$gameParty) return;
      this.ensureNpcMedicalHistory(name, profile);
      return this._exchange(name, profile, 0.5); // Cough/Spit/Bite use full transmission
    },

    // Standing close to someone for a whole conversation is one exposure; every
    // other thing done in that conversation (a gift, a trade, a joke, a poem,
    // patching up their wounds) is another, smaller one. Called by the Empathize
    // menu for every action that is not a deliberate Cough/Spit/Bite.
    INCIDENTAL_FACTOR: 0.16,

    rollIncidentalTransmission(name, profile, factor) {
      if (!ensureDb() || !profile || !window.$gameParty) return null;
      return this._exchange(name, profile, factor != null ? factor : this.INCIDENTAL_FACTOR);
    },

    // Two-way casual exchange at a given fraction of each disease's per-exposure
    // transmission. Returns what changed hands, so callers can report it.
    _exchange(name, profile, factor) {
      const caught = [];   // party members who caught something
      const given = [];    // ids the party passed to the NPC
      // NPC -> party
      for (const e of [...(profile.diseases || [])]) {
        const d = DB.byId[e.id];
        if (!d || !d.infective || d.venereal) continue;
        if (!(d.vectors || []).some(v => CONTACT_VECTORS.includes(v))) continue;
        for (const a of $gameParty.members()) {
          if (this.actorHasDisease(a, d.id)) continue;
          if ((a._pastDiseases || []).includes(d.id)) continue;   // already immune
          if (Math.random() < d.transmission * factor) {
            this.infectActor(a, d.id, name, e.epidemic || null, { silent: true });
            caught.push({ actor: a, disease: d });
          }
        }
      }
      // party -> NPC
      for (const a of $gameParty.members()) {
        for (const e of [...(a._diseases || [])]) {
          const d = DB.byId[e.id];
          if (!d || !d.infective || d.venereal) continue;
          if (!(d.vectors || []).some(v => CONTACT_VECTORS.includes(v))) continue;
          if (this.npcHasDisease(profile, d.id)) continue;
          if ((profile.pastDiseases || []).includes(d.id)) continue;
          if (Math.random() < d.transmission * factor) {
            this.infectNpc(profile, d.id, e.epidemic || null);
            given.push(d.id);
          }
        }
      }
      if (caught.length) _reportCaught(caught, name);
      return { caught, given };
    },

    // Deliberate transmission (Cough/Spit/Bite). Rolls each disease at full
    // transmission and returns the ids that successfully infected the NPC.
    deliberateTransmit(profile, diseases, placeKey) {
      const hit = [];
      const place = placeKey || (profile && profile._homeGroupName) || (_currentPlace() ? _currentPlace().key : null);
      for (const d of diseases || []) {
        if (this.npcHasDisease(profile, d.id)) continue;
        if (Math.random() < d.transmission) {
          const ep = startPlayerEpidemic(d.id, place, { covert: false, playerStarted: true, originNpc: profile ? profile.name : null });
          this.infectNpc(profile, d.id, ep ? ep.id : null);
          hit.push(d.id);
        }
      }
      return hit;
    },
  };

  // The player is told the moment somebody in the party picks something up,
  // wherever they picked it up: nothing else on screen would show it.
  function _reportCaught(caught, sourceLabel) {
    if (!window.ParchmentToast || !caught || !caught.length) return;
    for (const { actor, disease } of caught) {
      try {
        window.ParchmentToast.show(
          sourceLabel
            ? T('Epidemics.caughtFrom', { actor: actor.name(), disease: disease.name, source: sourceLabel })
            : T('Epidemics.caught', { actor: actor.name(), disease: disease.name }),
          { severity: 'warning', duration: 220, key: `disease:${actor.actorId()}:${disease.id}` } // i18n-ignore: toast dedupe key
        );
      } catch (e) { /* toasts are optional */ }
    }
  }

  // ==========================================================================
  // The pharmacy (window.Medicines)
  // ==========================================================================
  // A medicine is an ordinary item carrying three notes, written by
  // tools/health/gen_medicines.py off the disease library itself:
  //
  //   <Medicine: antibiotic>        the drug class, exactly one
  //   <Cures: influenza:4, ...>     disease id : consecutive daily doses
  //   <Treats: hiv, diabetes-1>     held at bay while taken, never cured
  //
  // An untagged item is not medicine, whatever it restores, which is what
  // makes a healing potion useless against a disease.
  const MED = { built: false, byItem: new Map(), byDisease: new Map(), list: [] };

  function _parseMedicine(item) {
    if (!item || !item.note) return null;
    const cls = /<Medicine:\s*([\w-]+)\s*>/i.exec(item.note);
    if (!cls) return null;
    const entry = { itemId: item.id, cls: cls[1].toLowerCase(), cures: {}, treats: [] };
    const cures = /<Cures:\s*([^>]*)>/i.exec(item.note);
    if (cures) {
      for (const pair of cures[1].split(',')) {
        const [id, days] = pair.split(':').map(s => String(s || '').trim());
        if (id) entry.cures[id] = Math.max(1, Number(days) || 1);
      }
    }
    const treats = /<Treats:\s*([^>]*)>/i.exec(item.note);
    if (treats) {
      entry.treats = treats[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    // What one dose gives back, sick or not: the item's own recover effects,
    // read the way Game_Action reads them (value1 is a share of the maximum,
    // value2 a flat amount).
    entry.hp = { rate: 0, flat: 0 };
    entry.mp = { rate: 0, flat: 0 };
    for (const e of item.effects || []) {
      if (e.code === 11) { entry.hp.rate += e.value1 || 0; entry.hp.flat += e.value2 || 0; }
      else if (e.code === 12) { entry.mp.rate += e.value1 || 0; entry.mp.flat += e.value2 || 0; }
    }
    return entry;
  }

  function buildMedicines() {
    if (MED.built) return MED;
    if (!window.$dataItems) return MED;
    for (const item of $dataItems) {
      const entry = _parseMedicine(item);
      if (!entry) continue;
      MED.built = true;
      MED.byItem.set(item.id, entry);
      MED.list.push(entry);
      const push = (diseaseId, kind, days) => {
        const bag = MED.byDisease.get(diseaseId) || [];
        bag.push({ itemId: item.id, cls: entry.cls, kind, days });
        MED.byDisease.set(diseaseId, bag);
      };
      for (const id in entry.cures) push(id, 'cure', entry.cures[id]);
      for (const id of entry.treats) push(id, 'manage', 0);
    }
    // The shortest course first: that is the drug a doctor would reach for,
    // and the one auto-dosing takes when the pack holds several.
    for (const bag of MED.byDisease.values()) {
      bag.sort((a, b) => (a.kind === b.kind ? a.days - b.days : (a.kind === 'cure' ? -1 : 1)));
    }
    MED.built = true;
    return MED;
  }

  window.Medicines = {
    ready() { return buildMedicines().byItem.size > 0; },
    info(itemOrId) {
      buildMedicines();
      const id = itemOrId && itemOrId.id != null ? itemOrId.id : itemOrId;
      return MED.byItem.get(id) || null;
    },
    isMedicine(itemOrId) { return !!this.info(itemOrId); },
    all() { buildMedicines(); return MED.list; },
    // Every remedy in the world for one disease: [{itemId, cls, kind, days}].
    // kind 'cure' clears it after `days` consecutive doses, 'manage' only
    // holds it where it is.
    forDisease(diseaseId) { buildMedicines(); return MED.byDisease.get(diseaseId) || []; },
    // The same list, narrowed to what the party is actually carrying, with the
    // number of doses in the pack.
    heldFor(diseaseId) {
      if (!window.$gameParty) return [];
      return this.forDisease(diseaseId)
        .map(r => Object.assign({ have: $gameParty.numItems($dataItems[r.itemId]) }, r))
        .filter(r => r.have > 0);
    },
    // The dose the party would take this morning: a cure before a suppressant,
    // the shortest course before a longer one.
    bestHeldFor(diseaseId) { return this.heldFor(diseaseId)[0] || null; },
    // The remedy to send somebody to the shop for: the cheapest thing on the
    // shelf that actually clears the illness, and only if nothing cures it the
    // cheapest thing that holds it down. Price beats course length here, which
    // is the opposite of bestHeldFor: what is already in the pack costs
    // nothing, what is not has to be bought.
    cheapestFor(diseaseId) {
      const priced = this.forDisease(diseaseId).map(r => {
        const item = window.$dataItems && $dataItems[r.itemId];
        return Object.assign({ price: item ? (item.price || 0) : Infinity }, r);
      });
      const pick = bag => bag.sort((a, b) => (a.price - b.price) || (a.days - b.days))[0] || null;
      return pick(priced.filter(r => r.kind === 'cure')) || pick(priced);
    },
    className(cls) {
      const key = 'Diseases.drug.' + String(cls || '');
      const label = T(key);
      return label === key ? String(cls || '') : label;
    },
  };

  // ==========================================================================
  // Treatment: the course, the morning dose, the slide into something worse
  // ==========================================================================
  const DOSE_HOUR = 8;                 // eight in the morning, every morning
  const CATCHUP_DAYS = 45;             // a cryo sleep is not 400 doses missed
  const CHRONIC_STAGE_DAYS = 730;      // how long an unprogressing chronic takes
                                       // to reach its full weight on the body

  const _dayIndex = min => Math.floor((Number(min) || 0) / MINUTES_PER_DAY);
  const _phasesOf = d => (d && d.phases) || { incubation: 0, window: 0, peakStart: 0, peakEnd: 9999, latent: 1, peak: 1 };
  const _treatOf = d => (d && d.treatment) || {};

  // Is somebody in the party trained to recognise an illness on sight?
  function _nurseOnHand() {
    const P = window.BattleSystemPassiveSkills;
    return !!(P && P.diagnosesImmediately && P.diagnosesImmediately());
  }

  // Where a carried illness has got to, as one object every reader shares.
  //   days        days since it was caught
  //   known       the party can name it (the window period has passed, or a
  //               nurse is travelling and named it the day it was caught)
  //   symptomatic past the incubation, so it is doing something
  //   stage       0..1, how far along it is. Params and need drain are
  //               multiplied by 1 + stage, so an untreated illness genuinely
  //               gets worse rather than sitting at its opening numbers.
  //   need/dosed  doses the current course wants, doses banked so far
  function courseState(actor, entry) {
    ensureDb();
    const d = DB.byId[entry.id];
    if (!d) return null;
    const day = _dayIndex(nowMin());
    const days = Math.max(0, day - _dayIndex(entry.sinceMin || nowMin()));
    const ph = _phasesOf(d);
    const t = _treatOf(d);
    const prog = d.progression || null;
    // Every day since it was caught on which no effective dose was taken. Read
    // off the clock rather than accumulated, so a year skipped in one jump
    // counts as a year untreated.
    const untreated = Math.max(0, days - (entry.treatedDays || 0));
    let stage = 0;
    if (prog && prog.days > 0) stage = Math.min(1, untreated / prog.days);
    else if (CHRONIC(d)) stage = Math.min(1, untreated / CHRONIC_STAGE_DAYS) * 0.6;
    else if (d.durationDays > 0) stage = Math.min(1, days / Math.max(1, d.durationDays)) * 0.4;
    const remedies = window.Medicines.forDisease(entry.id);
    return {
      disease: d,
      days,
      // Time tells the party what they are carrying eventually; a doctor tells
      // them now, and so does a nurse travelling with them (the Bedside Manner
      // passive, BattleSystemPassiveSkills.diagnosesImmediately). Either way,
      // once an illness has a name it keeps it.
      known: !!entry.diagnosed || days >= (ph.window || 0) || _nurseOnHand(),
      symptomatic: days >= (ph.incubation || 0),
      infectivity: days < (ph.incubation || 0) ? 0
        : (days >= (ph.peakStart || 0) && days <= (ph.peakEnd != null ? ph.peakEnd : 9999)
          ? (ph.peak || 1) : (ph.latent != null ? ph.latent : 1)),
      stage,
      curable: !!t.curable,
      manageable: (t.manageClasses || []).length > 0,
      dosed: entry.dosed || 0,
      need: entry.need != null ? entry.need : (t.courseDays || 0),
      missed: entry.missed || 0,
      missTolerance: t.missTolerance != null ? t.missTolerance : 2,
      suppressed: entry.suppressedUntilDay != null && entry.suppressedUntilDay >= day,
      dosedToday: entry.lastDoseDay === day,
      untreatedDays: untreated,
      selfCureDays: t.selfCureDays != null ? t.selfCureDays : -1,
      selfCureLeft: t.selfCureDays > 0 ? Math.max(0, t.selfCureDays - days) : -1,
      progression: prog,
      progressLeft: prog ? Math.max(0, prog.days - untreated) : -1,
      remedies,
      held: window.Medicines.heldFor(entry.id),
    };
  }

  // One dose, taken out of the pack and into the patient. Medicine gives its
  // HP/MP back whether or not it is doing anything about the illness, which is
  // what a tonic is for.
  function _swallow(actor, itemId) {
    const item = $dataItems[itemId];
    if (!item || !window.$gameParty || $gameParty.numItems(item) <= 0) return false;
    $gameParty.loseItem(item, 1);
    const med = window.Medicines.info(itemId);
    if (med && actor) {
      const hp = Math.floor(actor.mhp * (med.hp.rate || 0)) + (med.hp.flat || 0);
      const mp = Math.floor(actor.mmp * (med.mp.rate || 0)) + (med.mp.flat || 0);
      if (hp > 0) actor.gainHp(hp);
      if (mp > 0) actor.gainMp(mp);
    }
    return true;
  }

  // Every medicine the party holds, taken this morning by whoever needs it,
  // even when nobody is ill enough to have asked. Returns what happened so the
  // caller can put it on screen.
  function _doseActor(actor, entry, day, report, forced) {
    const st = courseState(actor, entry);
    if (!st) return;
    const name = st.disease.name;
    // A disease still inside its window period has not been diagnosed: nobody
    // knows to treat it, which is the whole danger of a long window.
    if (!st.known) return;
    const pick = forced || window.Medicines.bestHeldFor(entry.id);
    if (!pick) {
      entry.missed = (entry.missed || 0) + 1;
      if (entry.missed > st.missTolerance && entry.dosed) {
        entry.dosed = 0;
        entry.need = null;
        report.reset.push({ actor, disease: st.disease });
      }
      const shop = window.Medicines.cheapestFor(entry.id);
      if (shop) report.wanted.push({ actor, disease: st.disease, remedy: shop });
      return;
    }
    if (!_swallow(actor, pick.itemId)) return;
    entry.lastDoseDay = day;
    entry.missed = 0;
    entry.treatedDays = (entry.treatedDays || 0) + 1;
    report.dosed.push({ actor, disease: st.disease, item: $dataItems[pick.itemId], kind: pick.kind });
    if (pick.kind === 'manage') {
      // Suppression buys one day at a time and never adds up to a cure.
      entry.suppressedUntilDay = day;
      return;
    }
    entry.need = entry.need == null ? pick.days : Math.min(entry.need, pick.days);
    entry.dosed = (entry.dosed || 0) + 1;
    entry.suppressedUntilDay = day;
    if (entry.dosed >= entry.need) {
      report.cured.push({ actor, disease: st.disease });
      API.cureActor(actor, entry.id);
      (actor._pastDiseases || (actor._pastDiseases = [])).push(entry.id);
    }
  }

  // What an untreated illness turns into, and when. A disease that progresses
  // hands the carrier a heavier one and leaves: it is the same body, further
  // along, not two illnesses at once.
  function _progressActor(actor, entry, report) {
    const st = courseState(actor, entry);
    if (!st || !st.progression) return false;
    const prog = st.progression;
    const treatedCap = prog.treatedDays;
    const due = st.untreatedDays >= prog.days ||
      (treatedCap != null && st.days >= treatedCap);
    if (!due || !DB.byId[prog.to]) return false;
    API.cureActor(actor, entry.id);
    (actor._pastDiseases || (actor._pastDiseases = [])).push(entry.id);
    if (API.infectActor(actor, prog.to, T('Diseases.progressedFrom', { disease: st.disease.name }), null, { silent: true })) {
      report.progressed.push({ actor, from: st.disease, to: DB.byId[prog.to] });
    }
    return true;
  }

  // The morning's symptoms. A dose taken today halves the odds and stops the
  // bleed; nothing else does.
  function _sufferActor(actor, entry, day, report) {
    const st = courseState(actor, entry);
    if (!st || !st.symptomatic) return;
    const daily = st.disease.daily || { states: [], chance: 0, hpLoss: 0 };
    const eased = entry.lastDoseDay === day;
    const chance = Math.min(0.95, (daily.chance || 0) * (1 + st.stage) * (eased ? 0.4 : 1));
    for (const stateId of daily.states || []) {
      if (!stateId || actor.isStateAffected(stateId)) continue;
      if (Math.random() < chance) {
        actor.addState(stateId);
        report.states.push({ actor, disease: st.disease, stateId });
      }
    }
    const loss = (daily.hpLoss || 0) * (1 + st.stage) * (eased ? 0.35 : 1);
    if (loss > 0 && !actor.isDead()) {
      // An illness wears a body down; it never delivers the last blow itself,
      // so a night's sleep can never end in a game over nobody saw coming.
      const dmg = Math.max(1, Math.floor(actor.mhp * loss));
      actor.setHp(Math.max(1, actor.hp - dmg));
    }
  }

  // One whole day of being ill, for the whole party.
  function _resolveHealthDay(day) {
    if (!window.$gameParty) return null;
    const report = { day, dosed: [], wanted: [], cured: [], reset: [], progressed: [], states: [] };
    for (const actor of $gameParty.members()) {
      for (const entry of [...(actor._diseases || [])]) {
        if (!API.actorHasDisease(actor, entry.id)) continue;
        if (_progressActor(actor, entry, report)) continue;
        _doseActor(actor, entry, day, report);
        if (!API.actorHasDisease(actor, entry.id)) continue; // cured this morning
        _sufferActor(actor, entry, day, report);
      }
      if (actor.refresh) actor.refresh();
    }
    return report;
  }

  function _announceHealthDay(report) {
    if (!report || !window.ParchmentToast) return;
    const shows = [];
    const seen = new Set();
    const once = (key, fn) => { if (!seen.has(key)) { seen.add(key); shows.push(fn); } };
    for (const r of report.cured) {
      once('cured:' + r.actor.actorId() + r.disease.name, () => window.ParchmentToast.show(
        T('Diseases.toast.cured', { actor: r.actor.name(), disease: r.disease.name }),
        { severity: 'good', duration: 220, key: 'disease-cured:' + r.actor.actorId() + r.disease.name })); // i18n-ignore: toast dedupe key
    }
    for (const r of report.progressed) {
      once('prog:' + r.actor.actorId() + r.to.name, () => window.ParchmentToast.show(
        T('Diseases.toast.progressed', { actor: r.actor.name(), from: r.from.name, to: r.to.name }),
        { severity: 'danger', duration: 300, key: 'disease-prog:' + r.actor.actorId() + r.to.name })); // i18n-ignore: toast dedupe key
    }
    for (const r of report.dosed) {
      once('dose:' + r.actor.actorId() + r.disease.name, () => window.ParchmentToast.show(
        T(r.kind === 'manage' ? 'Diseases.toast.dosedManage' : 'Diseases.toast.dosed',
          { actor: r.actor.name(), item: r.item.name, disease: r.disease.name }),
        { severity: 'info', duration: 200, icon: r.item.iconIndex,
          key: 'disease-dose:' + r.actor.actorId() + r.disease.name })); // i18n-ignore: toast dedupe key
    }
    for (const r of report.wanted) {
      const item = $dataItems[r.remedy.itemId];
      // The party is told what to buy and what it costs, so the notice is
      // something they can act on at the next counter.
      const price = item && item.price > 0 && window.MoneyFormatter
        ? window.MoneyFormatter.format(item.price) : null;
      once('want:' + r.actor.actorId() + r.disease.name, () => window.ParchmentToast.show(
        T(price ? 'Diseases.toast.needsMedicinePriced' : 'Diseases.toast.needsMedicine', {
          actor: r.actor.name(), item: item ? item.name : window.Medicines.className(r.remedy.cls),
          disease: r.disease.name, price,
        }),
        { severity: 'warning', duration: 260, icon: item ? item.iconIndex : undefined,
          key: 'disease-want:' + r.actor.actorId() + r.disease.name })); // i18n-ignore: toast dedupe key
    }
    for (const r of report.reset) {
      once('reset:' + r.actor.actorId() + r.disease.name, () => window.ParchmentToast.show(
        T('Diseases.toast.courseLost', { actor: r.actor.name(), disease: r.disease.name }),
        { severity: 'warning', duration: 240, key: 'disease-reset:' + r.actor.actorId() + r.disease.name })); // i18n-ignore: toast dedupe key
    }
    if (shows.length) window.ParchmentToast.group(shows.slice(0, 6));
  }

  // The clock, not the step counter, drives all of this: the morning dose is
  // due at eight, and a night's sleep, a shift of work, a fast travel or a
  // cryo year all cross that hour exactly as walking does.
  let _healthTicking = false;
  function runHealthClock(force) {
    if (_healthTicking || !window.$gameSystem || !window.$gameParty || !ensureDb()) return;
    const min = nowMin();
    const day = _dayIndex(min);
    const hour = Math.floor((min % MINUTES_PER_DAY) / 60);
    const due = hour >= DOSE_HOUR ? day : day - 1;
    if ($gameSystem._diseaseDoseDay == null) { $gameSystem._diseaseDoseDay = due; return; }
    if (due <= $gameSystem._diseaseDoseDay && !force) return;
    _healthTicking = true;
    try {
      const from = Math.max($gameSystem._diseaseDoseDay + 1, due - CATCHUP_DAYS + 1);
      let last = null;
      for (let d = from; d <= due; d++) last = _resolveHealthDay(d) || last;
      $gameSystem._diseaseDoseDay = due;
      API.expireActorDiseases();
      _announceHealthDay(last);
    } catch (e) {
      console.error('[Health_DiseaseSystem] daily health pass failed', e);
    } finally {
      _healthTicking = false;
    }
  }

  Object.assign(API, {
    // ── treatment, read by every UI ───────────────────────────────────────
    courseState,
    medicines(diseaseId) { return window.Medicines.forDisease(diseaseId); },
    heldMedicines(diseaseId) { return window.Medicines.heldFor(diseaseId); },
    runDaily(force) { runHealthClock(force); },

    // Take a dose by hand, outside the morning round. Returns what it did.
    doseNow(actor, diseaseId) {
      if (!ensureDb() || !actor) return null;
      const entry = (actor._diseases || []).find(e => e.id === diseaseId);
      if (!entry) return null;
      const report = { day: _dayIndex(nowMin()), dosed: [], wanted: [], cured: [], reset: [], progressed: [], states: [] };
      _doseActor(actor, entry, _dayIndex(nowMin()), report);
      if (actor.refresh) actor.refresh();
      _announceHealthDay(report);
      return report;
    },

    // Which of this character's known illnesses one particular medicine
    // answers. Empty when the bottle has nothing to do with what they carry.
    treatableWith(actor, itemOrId) {
      if (!ensureDb() || !actor) return [];
      const med = window.Medicines.info(itemOrId);
      if (!med) return [];
      const out = [];
      for (const entry of (actor._diseases || [])) {
        const st = courseState(actor, entry);
        if (!st || !st.known) continue;
        if (med.cures[entry.id] != null) out.push({ entry, kind: 'cure', days: med.cures[entry.id] });
        else if (med.treats.indexOf(entry.id) >= 0) out.push({ entry, kind: 'manage', days: 0 });
      }
      return out;
    },

    // Take one dose of a named medicine by hand, off the morning round. The
    // dose itself consumes the item, so the caller must not consume it again.
    // A course counts one dose a day: a second bottle the same day is refused
    // rather than swallowed for nothing.
    doseWithItem(actor, itemOrId) {
      const id = itemOrId && itemOrId.id != null ? itemOrId.id : itemOrId;
      const matches = this.treatableWith(actor, id);
      if (!matches.length) return null;
      const day = _dayIndex(nowMin());
      const target = matches.find(m => m.entry.lastDoseDay !== day);
      if (!target) return { used: false, already: true };
      const report = { day, dosed: [], wanted: [], cured: [], reset: [], progressed: [], states: [] };
      _doseActor(actor, target.entry, day, report,
        { itemId: id, cls: (window.Medicines.info(id) || {}).cls, kind: target.kind, days: target.days });
      if (!report.dosed.length) return { used: false };
      if (actor.refresh) actor.refresh();
      _announceHealthDay(report);
      return { used: true, report };
    },

    // How much faster this character's needs drain for being ill. Read by
    // TimeDateSystem alongside the augment multiplier, so a fever really does
    // cost more food and more sleep, and a disease that is progressing costs
    // more again the further along it is.
    needDrainMultiplier(actor, needKey) {
      if (!actor || !actor._diseases || !actor._diseases.length) return 1;
      if (!ensureDb()) return 1;
      let mult = 1;
      for (const entry of actor._diseases) {
        const d = DB.byId[entry.id];
        const value = d && d.needs ? d.needs[needKey] : undefined;
        if (typeof value !== 'number') continue;
        const st = courseState(actor, entry);
        const stage = st ? st.stage : 0;
        mult *= 1 + (value - 1) * (1 + stage);
      }
      return mult;
    },

    // How catching a carrier is right now, as a factor on the disease's own
    // per-exposure chance: 0 while it is still incubating, `peak` through the
    // days it is shedding hardest, `latent` at either end.
    infectivityOf(actor, diseaseId) {
      const entry = (actor && actor._diseases || []).find(e => e.id === diseaseId);
      const st = entry && courseState(actor, entry);
      return st ? st.infectivity : 1;
    },

    // Is this illness far enough along to be named? A blood-borne virus with a
    // three-month window is carried, and passed on, long before anybody knows.
    isDetectable(actor, diseaseId) {
      const entry = (actor && actor._diseases || []).find(e => e.id === diseaseId);
      const st = entry && courseState(actor, entry);
      return st ? st.known : false;
    },

    // Everything the sheets draw, one call: current illnesses with their
    // course, their remedies and what the pack holds of each.
    healthDossier(actor) {
      if (!ensureDb() || !actor) return { diseases: [], conditions: [] };
      return {
        diseases: (actor._diseases || []).map(e => {
          const st = courseState(actor, e);
          return st ? Object.assign({ entry: e }, st) : null;
        }).filter(Boolean),
        conditions: (actor._conditions || []).map(e => DB.condById[e && e.id != null ? e.id : e]).filter(Boolean),
        past: actor._pastDiseases || [],
      };
    },
  });

  // ==========================================================================
  // The disease sheet, drawn once and read everywhere
  // ==========================================================================
  // One renderer serves the Biologics tab, the status screen's own tab and the
  // Archive's dossier, so a patient reads identically wherever the player
  // happens to be standing. Everything it shows comes out of courseState.
  const _esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function _iconHTML(iconIndex) {
    const idx = Number(iconIndex) || 0;
    if (!idx) return '';
    const S = 22, COLS = 16;
    return `<span class="dz-icon" style="width:${S}px;height:${S}px;` +
      `background-image:url('img/system/IconSet.png');background-size:${COLS * S}px auto;` +
      `background-position:${-(idx % COLS) * S}px ${-Math.floor(idx / COLS) * S}px;"></span>`;
  }

  // The remedies for one disease, each with its icon, the course it asks for
  // and how many doses the party is carrying right now.
  function remedyRowsHTML(diseaseId, opts) {
    const o = opts || {};
    const rows = window.Medicines.forDisease(diseaseId);
    if (!rows.length) {
      return `<div class="dz-remedy dz-remedy-none">${_esc(T('Diseases.ui.noRemedy'))}</div>`;
    }
    const held = window.$gameParty ? id => $gameParty.numItems($dataItems[id]) : () => 0;
    return rows.slice(0, o.limit || 8).map(r => {
      const item = $dataItems[r.itemId];
      if (!item) return '';
      const have = held(r.itemId);
      const course = r.kind === 'cure'
        ? T('Diseases.ui.courseDays', { days: r.days })
        : T('Diseases.ui.suppressive');
      return `<div class="dz-remedy${have ? ' dz-have' : ''}">` +
        _iconHTML(item.iconIndex) +
        `<span class="dz-remedy-name">${_esc(item.name)}</span>` +
        `<span class="dz-remedy-course">${_esc(course)}</span>` +
        `<span class="dz-remedy-have">${_esc(T('Diseases.ui.held', { count: have }))}</span>` +
        `</div>`;
    }).join('');
  }

  // The dossier for a disease nobody is carrying: what it is, how it moves,
  // what treats it. This is what the Archive prints.
  function diseaseDossierHTML(diseaseId) {
    ensureDb();
    const d = DB.byId[diseaseId];
    if (!d) return '';
    const t = _treatOf(d);
    const ph = _phasesOf(d);
    const line = (label, value) => value == null || value === ''
      ? '' : `<div class="dz-line"><span class="dz-key">${_esc(label)}</span><span class="dz-val">${_esc(value)}</span></div>`;
    const vectors = (d.vectors || []).map(v => T('Diseases.vector.' + v)).join(', ');
    const cure = !t.curable
      ? T(t.manageClasses && t.manageClasses.length ? 'Diseases.ui.incurableManaged' : 'Diseases.ui.incurable')
      : T('Diseases.ui.curableIn', { days: t.courseDays });
    const parts = [];
    parts.push(`<div class="dz-desc">${_esc(d.desc)}</div>`);
    parts.push(line(T('Diseases.ui.category'), T('Diseases.category.' + d.category)));
    // Whether the illness is a pathogen or a working. Printed in every world,
    // not only a narrowed one: it is a property of the disease, and it is what
    // tells a player why a severed world has no ley rot in it.
    parts.push(line(T('Diseases.ui.nature'), _natureLabel(d)));
    parts.push(line(T('Diseases.ui.severity'), T('Diseases.severity.' + d.severity)));
    parts.push(line(T('Diseases.ui.spread'), vectors));
    parts.push(line(T('Diseases.ui.incubation'), T('Diseases.ui.days', { days: ph.incubation || 0 })));
    parts.push(line(T('Diseases.ui.windowPeriod'), T('Diseases.ui.days', { days: ph.window || 0 })));
    parts.push(line(T('Diseases.ui.mostInfectious'),
      ph.peakEnd >= 9000 ? T('Diseases.ui.peakOngoing', { from: ph.peakStart || 0 })
        : T('Diseases.ui.peakBetween', { from: ph.peakStart || 0, to: ph.peakEnd || 0 })));
    parts.push(line(T('Diseases.ui.runsFor'), t.selfCureDays > 0
      ? T('Diseases.ui.days', { days: t.selfCureDays }) : T('Diseases.ui.lifelong')));
    parts.push(line(T('Diseases.ui.treatment'), cure));
    if (t.genericDays) parts.push(line(T('Diseases.ui.generic'), T('Diseases.ui.courseDays', { days: t.genericDays })));
    if (d.progression && DB.byId[d.progression.to]) {
      parts.push(line(T('Diseases.ui.becomes'), T('Diseases.ui.becomesIn', {
        disease: DB.byId[d.progression.to].name, days: d.progression.days,
      })));
    }
    if (d.symptoms && d.symptoms.length) parts.push(line(T('Diseases.ui.symptoms'), d.symptoms.join(', ')));
    parts.push(`<div class="dz-remedies"><div class="dz-remedies-label">${_esc(T('Diseases.ui.remedies'))}</div>${remedyRowsHTML(diseaseId)}</div>`);
    return `<div class="dz-dossier">${parts.join('')}</div>`;
  }

  // One carried illness, as the patient's own sheets draw it.
  function _carriedCardHTML(st) {
    const d = st.disease;
    const chips = [];
    if (!st.known) chips.push(`<span class="dz-chip dz-chip-unknown">${_esc(T('Diseases.ui.undiagnosed'))}</span>`);
    else if (!st.symptomatic) chips.push(`<span class="dz-chip">${_esc(T('Diseases.ui.incubating'))}</span>`);
    if (st.infectivity >= 1.2) chips.push(`<span class="dz-chip dz-chip-hot">${_esc(T('Diseases.ui.peakInfectious'))}</span>`);
    else if (st.infectivity > 0 && st.infectivity < 1) chips.push(`<span class="dz-chip">${_esc(T('Diseases.ui.latentInfectious'))}</span>`);
    if (st.dosedToday) chips.push(`<span class="dz-chip dz-chip-good">${_esc(T('Diseases.ui.dosedToday'))}</span>`);
    if (st.stage >= 0.5) chips.push(`<span class="dz-chip dz-chip-bad">${_esc(T('Diseases.ui.worsening'))}</span>`);

    const lines = [];
    lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.carriedFor'))}</span>` +
      `<span class="dz-val">${_esc(T('Diseases.ui.days', { days: st.days }))}</span></div>`);
    if (st.curable) {
      const need = st.need || (_treatOf(d).courseDays || 0);
      lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.course'))}</span>` +
        `<span class="dz-val">${_esc(T('Diseases.ui.courseProgress', { done: st.dosed, need: need || '?' }))}</span></div>`);
    } else {
      lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.treatment'))}</span>` +
        `<span class="dz-val">${_esc(T(st.manageable ? 'Diseases.ui.incurableManaged' : 'Diseases.ui.incurable'))}</span></div>`);
    }
    lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.selfCure'))}</span>` +
      `<span class="dz-val">${_esc(st.selfCureLeft >= 0
        ? T('Diseases.ui.days', { days: st.selfCureLeft }) : T('Diseases.ui.never'))}</span></div>`);
    if (st.progression && DB.byId[st.progression.to]) {
      lines.push(`<div class="dz-line dz-warn"><span class="dz-key">${_esc(T('Diseases.ui.becomes'))}</span>` +
        `<span class="dz-val">${_esc(T('Diseases.ui.becomesIn', {
          disease: DB.byId[st.progression.to].name, days: st.progressLeft,
        }))}</span></div>`);
    }
    const effects = Object.entries(d.params || {})
      .map(([k, v]) => `${T('Diseases.param.' + k)} ${Math.round(v * (1 + st.stage))}`).join('  ');
    if (effects) {
      lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.effects'))}</span>` +
        `<span class="dz-val">${_esc(effects)}</span></div>`);
    }
    const needs = Object.entries(d.needs || {})
      .filter(([, v]) => Math.abs(v - 1) > 0.02)
      .map(([k, v]) => `${T('PartyHud.alert.' + k)} x${(1 + (v - 1) * (1 + st.stage)).toFixed(2)}`).join('  ');
    if (needs) {
      lines.push(`<div class="dz-line"><span class="dz-key">${_esc(T('Diseases.ui.needs'))}</span>` +
        `<span class="dz-val">${_esc(needs)}</span></div>`);
    }

    const bar = st.curable && st.need
      ? `<div class="dz-bar"><div class="dz-bar-fill" style="width:${Math.min(100, Math.round(st.dosed / st.need * 100))}%"></div></div>`
      : '';
    return `<div class="dz-card dz-sev-${_esc(d.severity)}">` +
      `<div class="dz-head"><span class="dz-name">${_esc(st.known ? d.name : T('Diseases.ui.unknownIllness'))}</span>` +
      `<span class="dz-cat">${_esc(T('Diseases.category.' + d.category))}</span>` +
      `<span class="dz-cat dz-nature">${_esc(_natureLabel(d))}</span></div>` +
      (chips.length ? `<div class="dz-chips">${chips.join('')}</div>` : '') +
      `<div class="dz-desc">${_esc(st.known ? d.desc : T('Diseases.ui.undiagnosedDesc'))}</div>` +
      lines.join('') + bar +
      `<div class="dz-remedies"><div class="dz-remedies-label">${_esc(T('Diseases.ui.remedies'))}</div>` +
      remedyRowsHTML(d.id, { limit: 6 }) + `</div></div>`;
  }

  Object.assign(API, {
    diseaseDossierHTML,
    remedyRowsHTML,
    // The whole Diseases page for one character. Shared by the Biologics tab
    // and the status screen's tab, so the two can never disagree.
    panelHTML(actor) {
      if (!ensureDb() || !actor) return '';
      const dossier = this.healthDossier(actor);
      const parts = [];
      if (!dossier.diseases.length) {
        parts.push(`<div class="dz-empty">${_esc(T('Diseases.ui.healthy'))}</div>`);
      } else {
        parts.push(dossier.diseases.map(_carriedCardHTML).join(''));
      }
      if (dossier.conditions.length) {
        parts.push(`<div class="dz-section">${_esc(T('Diseases.ui.conditions'))}</div>`);
        parts.push(dossier.conditions.map(c =>
          `<div class="dz-card dz-card-flat"><div class="dz-head"><span class="dz-name">${_esc(c.name)}</span></div>` +
          `<div class="dz-desc">${_esc(c.desc)}</div></div>`).join(''));
      }
      if (dossier.past.length) {
        const names = [...new Set(dossier.past)].map(id => this.displayName(id));
        parts.push(`<div class="dz-section">${_esc(T('Diseases.ui.recovered'))}</div>`);
        parts.push(`<div class="dz-past">${_esc(names.join(', '))}</div>`);
      }
      return `<div class="dz-panel">${parts.join('')}</div>`;
    },
    // A one-line summary per illness, for anything with a single row to spend
    // (the party HUD chips, the empathize tab).
    shortLines(actor) {
      if (!ensureDb() || !actor) return [];
      return (actor._diseases || []).map(e => {
        const st = courseState(actor, e);
        if (!st || !st.symptomatic) return null;
        return {
          id: e.id,
          name: st.known ? st.disease.name : T('Diseases.ui.unknownIllness'),
          severity: st.disease.severity,
          critical: st.disease.severity === 'lethal' || st.stage >= 0.6,
          dosed: st.dosedToday,
          // Something the character will carry for the rest of their life is
          // not news. It belongs on the sheet, not on a HUD chip that would
          // never come down again.
          permanent: !st.curable && CHRONIC(st.disease),
          needsMedicine: st.known && !st.dosedToday && window.Medicines.forDisease(e.id).length > 0,
        };
      }).filter(Boolean);
    },
  });

  window.DiseaseSystem = API;

  // ==========================================================================
  // window.EpidemicSystem, the outbreak ledger
  // ==========================================================================
  let _catchingUp = false;

  // Where the party is standing, as a place the epidemic model knows.
  function _currentPlace() {
    if (!window.$gameMap || !Places.build()) return null;
    const mapId = $gameMap.mapId ? $gameMap.mapId() : 0;
    // On the world map the player IS at world coordinates.
    if (mapId === 315 && window.$gamePlayer) {
      const here = Places.forCoord($gamePlayer.x, $gamePlayer.y);
      if (here) return here;
    }
    const group = window.NPCSystem && window.NPCSystem.findMapGroupByMap
      ? window.NPCSystem.findMapGroupByMap(mapId) : null;
    const byGroup = group ? Places.forGroup(group) : null;
    if (byGroup) return byGroup;
    // Procedural interiors and open tiles: variables 43/44 hold the world tile.
    if (window.$gameVariables) {
      return Places.forCoord($gameVariables.value(43), $gameVariables.value(44));
    }
    return null;
  }

  // A day in an infected town is a day of exposure for everyone in it,
  // the player included. Recovered party members are immune to that strain.
  function _rollPartyExposure(day) {
    if (!window.$gameParty || !$gameParty.members) return;
    const place = _currentPlace();
    if (!place) return;
    const state = epiState();
    if (!state) return;
    for (const epidemic of state.active) {
      const site = epidemic.sites[place.key];
      if (!site || site.infected < 1) continue;
      const disease = DB.byId[epidemic.diseaseId];
      if (!disease) continue;
      const prevalence = site.infected / Math.max(1, place.population);
      const chance = Math.min(0.35, prevalence * (epidemic.kind === 'hysteria' ? 2.2 : 2.8));
      const caught = [];
      for (const actor of $gameParty.members()) {
        if (API.actorHasDisease(actor, disease.id)) continue;
        if ((actor._pastDiseases || []).includes(disease.id)) continue;
        if (Math.random() >= chance) continue;
        API.infectActor(actor, disease.id, place.key, epidemic.id, { silent: true });
        API.recordActorEpidemic(actor, epidemic, place.key, 'caught');
        caught.push({ actor, disease });
      }
      if (caught.length) _reportCaught(caught, _placeLabel(place.key));
    }
  }

  function _archive(epidemic) {
    // Past outbreaks keep their curve (the Eurodemics archive draws it) but
    // shed the per-town compartment counts nobody reads again.
    const sites = {};
    for (const [key, site] of Object.entries(epidemic.sites)) {
      sites[key] = { cases: Math.round(site.cases), dead: Math.round(site.dead), peak: Math.round(site.peak) };
    }
    epidemic.sites = sites;
    if (epidemic.history.length > 365) epidemic.history = epidemic.history.slice(-365);
    return epidemic;
  }

  function catchUpEpidemics(minute) {
    if (_catchingUp || !window.$gameSystem) return;
    // An epidemic needs a population to run through, and an empty world has
    // none: no outbreak is seeded when the world is made and none is ever
    // advanced. This one guard covers both, since the world initializer seeds
    // through this same function.
    const WM = window.WorldManager;
    if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return;
    _catchingUp = true;
    try {
      // Resolving the geography reads the destination and biome-name tables,
      // so it is inside the guard with everything else: this runs from
      // Game_Map.update and a throw out here would repeat every frame.
      if (!ensureDb()) return;
      const state = epiState();
      if (!state || !Places.build()) return;
      const day = _dayOf(minute != null ? minute : nowMin());

      if (state.lastDay == null) {
        _seedInitialEpidemics(state, day);
        state.lastDay = day;
        _syncWorldWeb(state, day);
        return;
      }
      if (day <= state.lastDay) {
        if (day < state.lastDay) state.lastDay = day;   // clock rolled back
        return;
      }

      let from = state.lastDay + 1;
      if (day - from > EPI.MAX_CATCHUP_DAYS) from = day - EPI.MAX_CATCHUP_DAYS;
      for (let d = from; d <= day; d++) {
        for (const epidemic of state.active.slice()) {
          if (epidemic.covert && epidemic.revealDay != null && d >= epidemic.revealDay) {
            epidemic.covert = false;
            epidemic.log.push({ day: d, key: 'Epidemics.log.firstCases', params: { place: epidemic.origin } });
            const placeObj = Places.get(epidemic.origin) || { key: epidemic.origin };
            _announce(epidemic, placeObj, d);
          }
          _stepEpidemic(epidemic, d);
          // A skip of months resolves in one go, but only the last days of it
          // are printed: the paper reports the outbreak, not the archive.
          if (d >= day - BULLETIN.BACKFILL_DAYS) _bulletinNews(epidemic, d);
        }
        const finished = state.active.filter(e => e.status !== 'active');
        if (finished.length) {
          state.active = state.active.filter(e => e.status === 'active');
          for (const e of finished) {
            if (d >= day - BULLETIN.BACKFILL_DAYS) _bulletinOver(e, d);
            state.past.unshift(_archive(e));
          }
          if (state.past.length > 40) state.past.length = 40;
        }
        _maybeIgnite(state, d);
        _maybeWeeklyIgnite(state, d);
      }
      state.lastDay = day;
      _syncWorldWeb(state, day);
      _rollPartyExposure(day);
    } catch (e) {
      console.error('[Health_DiseaseSystem] epidemic catch-up failed', e);
    } finally {
      _catchingUp = false;
    }
  }

  window.EpidemicSystem = {
    // ── geography ──────────────────────────────────────────────────────────
    ready() { return ensureDb() && Places.build(); },
    places() { Places.build(); return Places.list; },
    place(key) { return Places.get(key); },
    // Readable name of a town, from the key its records are stored under.
    placeName(key) { return _placeLabel(key); },
    placeForGroup(group) { return Places.forGroup(group); },
    placeForCoord(x, y) { return Places.forCoord(x, y); },
    currentPlace() { return _currentPlace(); },
    rebuildPlaces() { Places.reset(); return Places.build(); },

    // ── clock ──────────────────────────────────────────────────────────────
    catchUp(minute) { catchUpEpidemics(minute); },
    dayIndex(minute) { return _dayOf(minute != null ? minute : nowMin()); },
    dateStr(day) { return _dateStr(day); },
    dateOfDay(day) { return _dateOfDay(day); },

    // ── ledger ─────────────────────────────────────────────────────────────
    state() { return epiState(); },
    active() {
      const s = epiState();
      if (!s) return [];
      const currentDay = _dayOf(nowMin());
      return s.active.filter(e => !e.covert || (e.revealDay != null && currentDay >= e.revealDay));
    },
    allActive() { const s = epiState(); return s ? s.active : []; },
    past() { const s = epiState(); return s ? s.past : []; },
    get(id) {
      const s = epiState();
      if (!s) return null;
      return this.active().find(e => e.id === id) || s.past.find(e => e.id === id) || null;
    },

    // Every active outbreak currently burning in a town.
    activeAt(placeKey) {
      const s = epiState();
      if (!s || !placeKey) return [];
      return this.active().filter(e => {
        const site = e.sites[placeKey];
        return site && site.infected >= 1;
      });
    },

    activeForGroup(group) {
      const place = Places.forGroup(group);
      return place ? this.activeAt(place.key) : [];
    },

    // Share of a town currently ill: one outbreak, or all of them together.
    prevalenceAt(placeKey, epidemic) {
      const place = Places.get(placeKey);
      if (!place) return 0;
      const list = epidemic ? [epidemic] : this.activeAt(placeKey);
      let infected = 0;
      for (const e of list) {
        const site = e.sites[placeKey];
        if (site) infected += site.infected;
      }
      return Math.min(1, infected / Math.max(1, place.population));
    },

    // ── history (HistorySimulator's 20th-century ledger) ────────────────────
    historical() {
      return (window.$gameSystem && $gameSystem._historicalEpidemics) || [];
    },
    historicalAt(placeKey) {
      const n = _norm(placeKey);
      return this.historical().filter(r => (r.places || []).some(p => _norm(p) === n));
    },

    // ── world summary, for the Eurodemics portal ────────────────────────────
    stats() {
      const s = epiState();
      if (!s) return { active: 0, infected: 0, dead: 0, cases: 0, towns: 0, past: 0 };
      let infected = 0, dead = 0, cases = 0;
      const towns = new Set();
      const visible = this.active();
      for (const e of visible) {
        for (const [key, site] of Object.entries(e.sites)) {
          infected += site.infected;
          if (site.infected >= 1) towns.add(key);
        }
        dead += e.totals.dead;
        cases += e.totals.cases;
      }
      let pastDead = 0, pastCases = 0;
      for (const e of s.past) {
        pastDead += e.totals.dead;
        pastCases += e.totals.cases;
      }
      return {
        active: visible.length, infected: Math.round(infected), dead: Math.round(dead),
        cases: Math.round(cases), towns: towns.size, past: s.past.length,
        // Everything this world has ever recorded, active and closed together.
        totalDead: Math.round(dead + pastDead), totalCases: Math.round(cases + pastCases),
        day: s.lastDay, date: s.lastDay != null ? _dateStr(s.lastDay) : null,
      };
    },

    // How many outbreaks burn in a world, asked of a world that may not be the
    // loaded one. The active world answers live, any other from the summary
    // mirrored into its folder (see _syncWorldSummary).
    worldSummary(worldName) {
      const WM = window.WorldManager;
      const active = WM && WM.activeWorldName;
      if (!worldName || worldName === active) {
        if (epiState()) return this.stats();
      }
      const target = worldName || active;
      const file = (WM && target && typeof WM.readWorldFile === 'function')
        ? WM.readWorldFile(target, 'state') : null;
      const stored = file && file.epidemics;
      return stored || null;
    },

    // Worst-hit towns right now, for the situation table.
    hotspots(limit) {
      const s = epiState();
      if (!s) return [];
      const rows = {};
      const visible = this.active();
      for (const e of visible) {
        for (const [key, site] of Object.entries(e.sites)) {
          if (site.infected < 1) continue;
          const row = rows[key] || (rows[key] = { place: key, infected: 0, dead: 0, outbreaks: [] });
          row.infected += site.infected;
          row.dead += site.dead;
          row.outbreaks.push(e);
        }
      }
      return Object.values(rows)
        .map(r => {
          const place = Places.get(r.place);
          r.population = place ? place.population : 0;
          r.prevalence = r.population ? r.infected / r.population : 0;
          r.infected = Math.round(r.infected);
          r.dead = Math.round(r.dead);
          return r;
        })
        .sort((a, b) => b.infected - a.infected)
        .slice(0, limit || 12);
    },

    // ── manual control (events, debug, the news desk) ───────────────────────
    startPlayerEpidemic(diseaseId, placeKey, opts) {
      return startPlayerEpidemic(diseaseId, placeKey, opts);
    },

    ignite(diseaseId, placeKey) {
      if (!ensureDb() || !Places.build()) return null;
      const state = epiState();
      const disease = DB.byId[diseaseId] ||
        _pickWeighted(_rng('ignite:' + nowMin()), _epidemicPool(null));
      const place = Places.get(placeKey) ||
        Places.list[Math.floor(_seededRoll('ignitePlace:' + nowMin()) * Places.list.length)];
      if (!disease || !place || !state) return null;
      const day = _dayOf(nowMin());
      const epidemic = _startEpidemic(state, disease, place, day);
      _syncWorldWeb(state, day);
      return epidemic;
    },

    end(id) {
      const state = epiState();
      if (!state) return false;
      const idx = state.active.findIndex(e => e.id === id);
      if (idx < 0) return false;
      const [epidemic] = state.active.splice(idx, 1);
      epidemic.status = 'over';
      epidemic.endDay = _dayOf(nowMin());
      state.past.unshift(_archive(epidemic));
      _syncWorldWeb(state, epidemic.endDay);
      return true;
    },

    // The one place an outbreak's stored name or log line turns into prose.
    nameOf(epidemic) { return _textOf(epidemic && epidemic.name); },
    logTextOf(entry) { return _textOf(entry); },

    report() {
      const s = this.stats();
      const lines = [T('Epidemics.bulletin.header', { date: s.date || T('Epidemics.undated') })];
      lines.push(T('Epidemics.bulletin.totals', {
        active: s.active, towns: s.towns, infected: s.infected, dead: s.dead,
      }));
      for (const e of this.active()) {
        const disease = DB.byId[e.diseaseId];
        const infected = Object.values(e.sites).reduce((n, site) => n + site.infected, 0);
        lines.push(T('Epidemics.bulletin.line', {
          name: this.nameOf(e),
          kind: disease ? disease.kind : e.kind,
          infected: Math.round(infected),
          towns: Object.keys(e.sites).length,
        }));
      }
      return lines.join('\n');
    },

    _internals: { Places, EPI, epiState, stepEpidemic: _stepEpidemic, startEpidemic: _startEpidemic,
      startPlayerEpidemic, seedInitial: _seedInitialEpidemics, dayOf: _dayOf, epidemicPool: _epidemicPool },
  };

  // ── Game_Actor: fold disease/condition param modifiers into paramPlus ──────
  const _Game_Actor_paramPlus = Game_Actor.prototype.paramPlus;
  Game_Actor.prototype.paramPlus = function (paramId) {
    let v = _Game_Actor_paramPlus.call(this, paramId);
    if (this._diseases || this._conditions) {
      try { v += API.actorParamDelta(this, paramId); } catch (e) {}
    }
    return v;
  };

  // ── The floor under every penalty in the game ─────────────────────────────
  // Illness clamps its own contribution, and so does hunger (TimeDateSystem),
  // but a character can be ill and starved and missing an arm at once, and
  // three ceilings that each look reasonable alone still add up to a zero.
  // RPG Maker's own floor for ATK..LUK is 0, which is a stat that cannot act;
  // on the 1-20 ability scale the floor that means "as bad as a body gets" is
  // 1. MHP keeps the engine's floor of 1 and MMP keeps 0.
  if (typeof Game_BattlerBase !== 'undefined') {
    const _Game_BattlerBase_paramMin = Game_BattlerBase.prototype.paramMin;
    Game_BattlerBase.prototype.paramMin = function (paramId) {
      if (paramId >= 2) return 1;
      return _Game_BattlerBase_paramMin.call(this, paramId);
    };
  }

  // ── Per-step onset ─────────────────────────────────────────────────────────
  const _Game_Party_increaseSteps = Game_Party.prototype.increaseSteps;
  Game_Party.prototype.increaseSteps = function () {
    _Game_Party_increaseSteps.call(this);
    try { API.onPartyStep(); } catch (e) {}
  };

  // ── Pause-menu transmission roll (one call per open) ───────────────────────
  const _Scene_Menu_create = Scene_Menu.prototype.create;
  Scene_Menu.prototype.create = function () {
    _Scene_Menu_create.call(this);
    try {
      API.ensureStoryConditions();
      API.expireActorDiseases();
      API.rollPartyTransmission();
    } catch (e) { console.warn('[Health_DiseaseSystem] menu transmission roll failed', e); }
  };

  // ── World initialization ───────────────────────────────────────────────────
  // A world starts with three outbreaks already burning (see
  // _seedInitialEpidemics). Igniting them when the world is made, rather than
  // on the first map the player loads, means the Eurodemics portal and the
  // news ticker have a continent to report on from the first minute, and the
  // outbreaks are the same three in every savegame of the world.
  if (typeof window !== 'undefined' && window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer('epidemics', 70, () => {
      catchUpEpidemics(nowMin());
    });
  }

  // ── Epidemic clock ─────────────────────────────────────────────────────────
  // Outbreak numbers only ever move at midnight, so the curve the Eurodemics
  // portal draws has exactly one point per day. The map watches the clock for
  // the day rolling over; map load resolves whatever was skipped (sleep, fast
  // travel, a job shift) in one pass.
  if (typeof Scene_Map !== 'undefined') {
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
      _Scene_Map_onMapLoaded.call(this);
      try { catchUpEpidemics(nowMin()); } catch (e) { console.warn('[Health_DiseaseSystem]', e); }
      try { runHealthClock(); } catch (e) { console.warn('[Health_DiseaseSystem]', e); }
    };
  }

  if (typeof Game_Map !== 'undefined') {
    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function (sceneActive) {
      _Game_Map_update.call(this, sceneActive);
      if (!sceneActive || !window.$gameVariables) return;
      // The morning round is checked on the hour rather than on the day, so
      // eight o'clock is not missed by a party that walks past it.
      const hourStamp = Math.floor(nowMin() / 60);
      if (hourStamp !== this._lastHealthHour) {
        this._lastHealthHour = hourStamp;
        try { runHealthClock(); } catch (e) { console.warn('[Health_DiseaseSystem]', e); }
      }
      const day = _dayOf(nowMin());
      if (day === this._lastEpidemicDay) return;
      this._lastEpidemicDay = day;
      const state = window.$gameSystem && $gameSystem._epidemics;
      if (!state || state.lastDay == null || day !== state.lastDay) catchUpEpidemics(nowMin());
    };
  }

  // Sleeping, waiting, working a shift and a cryo year all move the clock in
  // one jump and then hand control back. The morning doses owed over that jump
  // are resolved the moment it lands, which is why the toasts arrive as the
  // party wakes rather than on the next step they take.
  if (typeof Scene_Map !== 'undefined' && Scene_Map.prototype._finishSleepAdvance) {
    const _finishSleep = Scene_Map.prototype._finishSleepAdvance;
    Scene_Map.prototype._finishSleepAdvance = function () {
      _finishSleep.call(this);
      try { runHealthClock(); } catch (e) { console.warn('[Health_DiseaseSystem]', e); }
    };
  }

  // ── Plugin commands (debug/event) ──────────────────────────────────────────
  const PLUGIN = 'Health_DiseaseSystem';
  if (window.PluginManager && PluginManager.registerCommand) {
    PluginManager.registerCommand(PLUGIN, 'InfectLeader', args => {
      const leader = window.$gameParty && $gameParty.leader();
      if (leader && args.id) API.infectActor(leader, String(args.id).trim(), 'event');
    });
    PluginManager.registerCommand(PLUGIN, 'CureLeader', args => {
      const leader = window.$gameParty && $gameParty.leader();
      if (leader) API.cureActor(leader, args.id ? String(args.id).trim() : 'all');
    });
    PluginManager.registerCommand(PLUGIN, 'StartEpidemic', args => {
      const epidemic = window.EpidemicSystem.ignite(
        args.disease ? String(args.disease).trim() : null,
        args.place ? String(args.place).trim() : null);
      if (epidemic && window.$gameMessage) $gameMessage.add(T('Epidemics.begins', { name: window.EpidemicSystem.nameOf(epidemic) }));
    });
    PluginManager.registerCommand(PLUGIN, 'EpidemicReport', () => {
      if (window.$gameMessage) $gameMessage.add(window.EpidemicSystem.report());
      else console.log(window.EpidemicSystem.report());
    });
  }
})();
