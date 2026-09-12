/*:
 * @target MZ
 * @plugindesc NPCEmpathize v3.0.0, NPC Interaction Logic
 * @author Omni-Lex
 * @help NPCEmpathize.js
 *
 * Core logic for the NPC Interaction Panel.
 * Must be listed BEFORE NPCEmpathizeUI.js in the Plugin Manager.
 *
 * Load Order:
 *   MarkovTextGenerator → NPCSystem → NPCSociety → NPCSimulationCore
 *   → NPCSystemParty → NPCEmpathize → NPCEmpathizeUI → MousePan → VisualNovelBustSystem
 *
 * Data files:
 *   data/personalityData.json , personality → markov db array map
 *   js/i18n/<lang>/plugins/Empathize.json, panel copy (via the shared resolver)
 *
 * @command Open
 * @desc Open the NPC dialogue panel for the active event (or a named event).
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 * @desc Leave blank to auto-detect the triggering NPC event, or supply an exact name.
 */

(() => {
  'use strict';

  const pluginName = 'NPCEmpathize';

  // ============================================================================
  // SECTION 1, PERSONALITY → MARKOV DB MAP  (built from js/db/Health/PersonalityData.json)
  // ============================================================================

  let PERSONALITY_DB_MAP = {};
  (() => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'js/db/Health/PersonalityData.json', false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        const data = JSON.parse(xhr.responseText);
        // PersonalityData.json may be a bare array (legacy) or { list:[...] } (current).
        const arr = Array.isArray(data) ? data : (data.list || []);
        for (const p of arr) {
          if (p.name && p.markovDbs) PERSONALITY_DB_MAP[p.name] = p.markovDbs;
        }
      }
    } catch (e) {
      console.warn('[NPCEmpathize] Could not load PersonalityData.json:', e);
    }
  })();

  // ============================================================================
  // SECTION 2, I18N LOADER
  // ============================================================================

  const _TEMPLATE_FUNC_PARAMS = {
    refuseTrade:    ['name'],
    refuseHelp:     ['name'],
    healFree:       ['name'],
    healCost:       ['name', 'g'],
    notEnoughGold:  ['g'],
    joinRefused:    ['name'],
    gaveItem:       ['name', 'item'],
    fedBeast:       ['name', 'item'],
    giftRefused:    ['name', 'item'],
    briberyCaught:  ['name'],
    bribeRefused:   ['name'],
    bribeRefusedLaw:['name'],
    attackWarning:  ['name'],
    attackCommitted:['name'],
    transmitWarnHas:   ['action', 'name', 'list'],
    transmitWarnNone:  ['action', 'name'],
    transmitWarnHasNoAssault:  ['action', 'name', 'list'],
    transmitWarnNoneNoAssault: ['action', 'name'],
    transmitHit:       ['name', 'list'],
    transmitMiss:      ['name'],
    transmitNoneResult:['name'],
    transmitMissNoBounty:      ['name'],
    transmitNoneResultNoBounty:['name'],
    infectPrompt:      ['name', 'chance'],
    infectUnseen:      ['name', 'disease'],
    infectCaught:      ['name', 'disease'],
    infectImmune:      ['name', 'disease'],
    infectAlready:     ['name', 'disease'],
    infectMember:      ['name', 'disease'],
    infectMemberAlready:['name', 'disease'],
    workAs:          ['job', 'map'],
    workAsShopkeeper:['job', 'map'],
  };

  // The panel's copy lives in js/i18n/<lang>/plugins/Empathize.json and is read
  // through the shared resolver, so there is no second loader and no boot race.
  // `_getT()` still returns an object, so every `T.key` and `T.template(a, b)`
  // call site is unchanged: a plain key resolves to its string, a key listed in
  // _TEMPLATE_FUNC_PARAMS to a function of those parameters. The object is also
  // callable, so `T('Empathize.x')` works inside the functions that shadow the
  // global resolver with it.
  const _T_PASSTHROUGH = ['has', 'list', 'pool', 'obj', 'n', 'param', 'language'];

  const _tAccessor = new Proxy(function (key, params) { return window.T(key, params); }, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (_T_PASSTHROUGH.indexOf(key) >= 0) return window.T[key].bind(window.T);
      const full = 'Empathize.' + key;
      const params = _TEMPLATE_FUNC_PARAMS[key];
      if (params) {
        return (...args) => {
          const p = {};
          params.forEach((name, i) => { p[name] = args[i] ?? ''; });
          return window.T(full, p);
        };
      }
      if (!window.T.has(full)) return undefined;
      // A bank key resolves to its pool, a grouped key to its subtree, so the
      // call sites that expect an array or an object keep getting one.
      const value = window.T.obj(full);
      if (Array.isArray(value)) return window.T.pool(full);
      if (value && typeof value === 'object') return value;
      return window.T(full);
    },
  });

  function _getT() { return _tAccessor; }

  // ============================================================================
  // SECTION 3, HELPERS
  // ============================================================================

  function _extractMarkovDb(event) {
    const m = (event?.event()?.note || '').match(/<markov:\s*([^>]+)>/i);
    return m ? m[1].trim() : null;
  }

  function _resolveMarkovDbFromSprite(ev) {
    const npcData = window.WorldGen?.NPCs;
    if (!npcData || !ev) return null;
    const charName = ev.event()?.characterName ?? ev.event()?.pages?.[0]?.image?.characterName;
    if (!charName) return null;
    if (npcData[charName]?.markovDB) return npcData[charName].markovDB;
    const base = charName.split('/').pop();
    for (const key of Object.keys(npcData)) {
      if (key.split('/').pop() === base) return npcData[key].markovDB ?? null;
    }
    return null;
  }

  function _resolveMarkovDb(eventId, profile) {
    if (profile?.markovDb) return profile.markovDb;
    const ev = $gameMap?.event(eventId);
    if (ev) {
      const tag = _extractMarkovDb(ev);
      if (tag) return tag;
      const spriteDb = _resolveMarkovDbFromSprite(ev);
      if (spriteDb) return spriteDb;
    }
    if (profile?.personalityIndex != null && window._NPCSocietyDataLoader?.personalities) {
      const pers = window._NPCSocietyDataLoader.personalities[profile.personalityIndex];
      if (pers?.name && PERSONALITY_DB_MAP[pers.name]) {
        const dbs = PERSONALITY_DB_MAP[pers.name];
        return Array.isArray(dbs) ? dbs[Math.floor(Math.random() * dbs.length)] : dbs;
      }
    }
    return 'npc';
  }

  // The name of whoever is standing at this event. A <Shop> counter is worked
  // in shifts, so the event is named after the fixture ("Shop") and the person
  // behind it changes three times a day: everything the panel says or files on
  // a society profile has to use the covering persona's name, not the sign.
  function _getNPCName(eventId) {
    const ev = $gameMap?.event(eventId);
    if (!ev) return '';
    return window.NPCSim?.npcNameForEvent?.(ev) ?? (ev.event()?.name?.trim() || '');
  }

  function _getProfile(npcName) {
    const profile = window.NPCSocietyRegistry?.getProfile(npcName) ?? null;
    // The society table is keyed by name and the profile itself does not carry
    // one, but a standing has to be filed against somebody. Stamped here, at
    // the one lookup the whole panel goes through, so every profile it touches
    // knows who it belongs to.
    if (profile && !profile._npcName) profile._npcName = npcName;
    return profile;
  }

  // Finds the event a name refers to: the authored event name first (that is
  // what event commands are written against), then the person currently
  // covering a shop counter, so "Only" finds the till she is standing at.
  function _findEventByName(name) {
    const target = String(name ?? '').trim().toLowerCase();
    if (!target) return null;
    const events = $gameMap?.events() ?? [];
    return events.find(e => e?.event()?.name?.trim().toLowerCase() === target)
        ?? events.find(e => _getNPCName(e?.eventId()).toLowerCase() === target)
        ?? null;
  }

  // ── Social-interaction line bank (praise / joke / story / insult / ...) ──
  // js/db/NPC/SocialLines.json holds the structure (ids, tone, baseDelta, tier,
  // deltas, toneMult) and the English prose; js/i18n/<lang>/conversations/
  // SocialLines.json holds that language's prose and is deep-merged over it, so
  // an NPC speaks the language the game is being played in. The overlay keys
  // `interactions` and `romance.actions` by id rather than by array position, so
  // a translation never depends on the order the db happens to list them in.
  function _readJson(url) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
    } catch (e) { /* no overlay for this language, English stands */ }
    return null;
  }
  // Replace strings and string arrays, recurse objects, leave numbers alone. An
  // entry the overlay does not carry keeps whatever the db said, so a partial
  // translation falls back line-bank by line-bank rather than all at once.
  function _mergeLines(base, over) {
    if (!over || !base) return;
    for (const k of Object.keys(over)) {
      const o = over[k];
      if (Array.isArray(o)) base[k] = o.slice();
      else if (o && typeof o === 'object') {
        if (!base[k] || typeof base[k] !== 'object') base[k] = {};
        _mergeLines(base[k], o);
      } else if (typeof o === 'string') base[k] = o;
    }
  }
  // The db lists these as arrays of entries carrying their own `id`.
  function _mergeById(list, over) {
    if (!Array.isArray(list) || !over) return;
    list.forEach(entry => _mergeLines(entry, over[entry.id]));
  }
  let _socialLinesDb = null;
  let _socialLinesLang = null;
  function _socialLines() {
    const lang = ConfigManager.language || 'en';
    if (_socialLinesDb && _socialLinesLang === lang) return _socialLinesDb;
    _socialLinesLang = lang;
    const db = (window.NPC && window.NPC.SocialLines)
      ? JSON.parse(JSON.stringify(window.NPC.SocialLines))
      : _readJson('js/db/NPC/SocialLines.json');
    if (!db) {
      console.warn('[NPCEmpathize] failed to load SocialLines.json');
      _socialLinesDb = { interactions: [], performances: {}, jokes: {} };
      return _socialLinesDb;
    }
    const over = _readJson(`js/i18n/${lang}/conversations/SocialLines.json`);
    if (over) {
      _mergeById(db.interactions, over.interactions);
      if (over.romance) {
        _mergeById(db.romance && db.romance.actions, over.romance.actions);
        if (db.romance) _mergeLines(db.romance.rejection, over.romance.rejection);
        if (db.romance) _mergeLines(db.romance.propose, over.romance.propose);
      }
      ['performances', 'jokes', 'em', 'bubba'].forEach(s => _mergeLines(db[s], over[s]));
    }
    _socialLinesDb = db;
    return _socialLinesDb;
  }
  function _socialById() {
    const db = _socialLines();
    if (!db._byId) { db._byId = {}; (db.interactions || []).forEach(i => (db._byId[i.id] = i)); }
    return db._byId;
  }
  const _rand = arr => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');
  function vary(text) {
    if (typeof text !== 'string' || text.indexOf('{') < 0) return text;
    let out = text;
    let guard = 0;
    while (guard++ < 64) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => _rand(body.split('|')));
      if (next === out) break;
      out = next;
    }
    return out;
  }

  // ── Joke grammar ───────────────────────────────────────────────────────────
  // The joke pools hold bare words, not sentences, so anything a template puts
  // next to a drawn word has to be inflected or the line comes out broken: "a
  // alchemist" in English, "una goblin" or "un scheletro" in Italian. Every
  // rule that decides those forms is language data and lives in the "grammar"
  // block of the jokes bank, so this code never spells an article itself.
  //
  // A placeholder is {^article:pool#tag*~ref}, and every part after the pool
  // name is optional:
  //   {noun}          draw from the "noun" pool, remembered as the slot "noun"
  //   {noun#b}        a second draw from that pool, kept different from the first
  //   {noun*}         the slot in the plural
  //   {def:noun}      definite article, inflected to fit the word it lands on
  //   {a:noun}        any other article or preposition the language declares
  //   {adj~noun}      a word bent to match the gender and number of slot "noun"
  //   {adj~noun*}     the same, declaring that slot plural before it is reached
  //   {^indef:noun}   the same, with the first letter capitalised
  // A bare {pool} still means exactly what it always meant, so a language file
  // written before any of this fills the same way it did.
  const _JOKE_SPEC = /^(\^)?(?:(\w+):)?(\w+)(?:#(\w+))?(\*)?(?:~(\w+(?:#\w+)?)(\*)?)?$/;

  // "strega|f|pl=streghe" -> gender, irregular forms, and whether it inflects.
  // Flags: m/f gender, inv for a word that never changes, and name=form for an
  // irregular (pl, fs, fpl) the rule tables would get wrong.
  function _jokeWord(entry) {
    const parts = String(entry).split('|');
    const w = { w: parts[0].trim(), g: 'm', inv: false, forms: {} };
    for (let i = 1; i < parts.length; i++) {
      const f  = parts[i].trim();
      const eq = f.indexOf('=');
      if (eq > 0) w.forms[f.slice(0, eq).trim()] = f.slice(eq + 1).trim();
      else if (f === 'f' || f === 'm') w.g = f;
      else if (f === 'inv') w.inv = true;
    }
    return w;
  }

  // Ordered [pattern, replacement] rows: the first pattern that matches wins,
  // and a word no row matches is left alone (which is how invariant plurals
  // like "goblin" survive without needing an entry of their own).
  function _jokeRules(word, rows) {
    if (!Array.isArray(rows)) return word;
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 2) continue;
      const re = new RegExp(r[0]);
      if (re.test(word)) return word.replace(re, r[1]);
    }
    return word;
  }

  // The written form of a drawn word for one gender and number. Inflection
  // tables are keyed by pool ("*" for the default) so a language can say that
  // its nouns take a plural while its adjectives never move, which is what
  // keeps English out of "they are too haunteds".
  function _jokeSurface(word, poolName, g, pl, gram) {
    if (word.inv) return word.w;
    const rules = (gram.inflect && (gram.inflect[poolName] || gram.inflect['*'])) || {};
    // A noun carries its own gender; only a word being bent to agree with
    // something else needs the feminine to be derived.
    const bend = g === 'f' && word.g !== 'f';
    let s = word.w;
    if (bend) s = word.forms.fs || _jokeRules(s, rules.feminine);
    if (!pl) return s;
    return word.forms[bend ? 'fpl' : 'pl'] || _jokeRules(s, rules.plural);
  }

  // Article rows are [gender, pattern, form]: the first row whose gender and
  // pattern both match the word it will sit in front of wins, so a language
  // orders them from the special cases down to its default.
  function _jokeArticle(kind, g, pl, surface, gram) {
    const table = gram.articles && gram.articles[kind];
    const rows  = table && (pl ? table.pl : table.sg);
    if (!Array.isArray(rows)) return '';
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 3) continue;
      if (r[0] && r[0] !== g) continue;
      if (r[1] && !new RegExp(r[1], 'i').test(surface)) continue;
      return r[2];
    }
    return '';
  }

  // Build a procedural joke from the grammar in SocialLines.json. Slots are
  // drawn once and reused, so a template naming the same pool twice tells one
  // joke about one goblin, and an article or an adjective sitting next to a
  // drawn word is inflected to fit it (see _jokeSurface and _jokeArticle).
  function _genJoke() {
    const j    = _socialLines().jokes || {};
    const base = (window.NPC && window.NPC.SocialLines && window.NPC.SocialLines.jokes) || {};
    // A language that has not translated a pool leaves it full of blanks, so
    // fall back to the source pool rather than tell a joke made of nothing.
    const pool = k => {
      const own = (j[k] || []).filter(w => String(w).trim());
      return own.length ? own : (base[k] || []).filter(w => String(w).trim());
    };
    const gram = j.grammar || base.grammar || {};
    const tmpl = _rand(pool('templates'));
    if (!tmpl) return T('Empathize.jokeFallback');

    const slots = {};   // slot key -> { word, g, pl }
    const drawn = {};   // pool name -> entries already spent in this joke

    // Resolve a slot, drawing it the first time it is asked for. Two slots on
    // the same pool are kept apart, or the punchline compares a thing to
    // itself.
    const slot = (poolName, key, pl) => {
      if (slots[key]) {
        if (pl) slots[key].pl = true;
        return slots[key];
      }
      const list = pool(poolName);
      if (!list.length) return null;
      const spent = (drawn[poolName] = drawn[poolName] || []);
      let entry = '';
      for (let i = 0; i < 8; i++) { entry = _rand(list); if (spent.indexOf(entry) < 0) break; }
      spent.push(entry);
      const word = _jokeWord(entry);
      return (slots[key] = { word, g: word.g, pl: !!pl });
    };

    return String(tmpl).replace(/\{([^{}]+)\}/g, (m, spec) => {
      const p = _JOKE_SPEC.exec(String(spec).trim());
      if (!p) return m;
      const [, caps, art, poolName, tag, plural, ref, refPlural] = p;
      let g = 'm', pl = !!plural;
      // An agreeing word takes gender and number from the slot it points at,
      // drawing that slot first if the template has not reached it yet. A
      // determiner that comes before its noun says so with ~noun*, since it
      // has to know the number before the noun's own slot has declared one.
      if (ref) {
        const target = slot(ref.split('#')[0], ref, !!refPlural);
        if (target) { g = target.g; pl = pl || target.pl; }
      }
      const key  = (poolName + (tag ? '#' + tag : '')) + (ref ? '~' + ref : '');
      const cell = slot(poolName, key, pl);
      if (!cell) return '';
      if (!ref) g = cell.g;
      pl = pl || cell.pl;
      let out = _jokeSurface(cell.word, poolName, g, pl, gram);
      if (art) out = _jokeArticle(art, g, pl, out, gram) + out;
      return caps ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    });
  }


  // Debug/sandbox recruiting aid: force the party-join chance to 95% when the
  // player character (actor 1) is named "Test" or sandbox mode is active.
  function _forceHighJoinChance() {
    return ($gameActors?.actor(1)?.name?.() === 'Test') || !!$gameSystem?._isSandboxMode; // i18n-ignore: playtest character name
  }

  // How many lines an NPC said outside the panel (message-box dialogue) are kept
  // on their profile for replay in the chat tab.
  const SPOKEN_LOG_MAX = 12;

  // Party-join odds, the single source of truth for both the "(~N%)" label the
  // UI prints on the Join action and the roll _join() actually makes.
  // Disposition is the only input: neutral (opinion 0) is a coin flip, the curve
  // slides down toward JOIN_MIN as the NPC dislikes the focused party member and
  // up toward JOIN_MAX as they warm to them. Nothing else - level, class, etc. -
  // moves the odds in either direction; the UI's only other gates on Join
  // (party full, no self-switch-A page to fall through to) are mechanical
  // necessities, not difficulty factors.
  const JOIN_BASE = 50;   // chance at opinion 0
  const JOIN_MIN  = 5;
  const JOIN_MAX  = 95;
  function _joinChance(opinion, actor) {
    if (_forceHighJoinChance()) return JOIN_MAX;
    // opinion runs -100..+100, so 0.45/point lands exactly on JOIN_MIN/JOIN_MAX
    // at the extremes. Somebody who can make a case for themselves (Public
    // Speaking, specialization 218) gets a hearing the same goodwill would not
    // buy on its own, inside the same clamp. It is the member doing the talking
    // who has to make that case, which is whoever the switcher has focused.
    const persuasion = window.SpecializationXP
      ? (window.SpecializationXP.levelOf(actor, 'Public Speaking') - 1) * 4 : 0;
    const raw = JOIN_BASE + (Number(opinion) || 0) * 0.45 + persuasion;
    return Math.round(Math.max(JOIN_MIN, Math.min(JOIN_MAX, raw)));
  }

  // ── Talking an animal into coming along ───────────────────────────────────
  // The stat behind it is WIS (mdf, "SAG" in Italian): reading an animal and
  // being read by one is neither muscle nor glibness. Same D&D modifier every
  // other check in the game uses.
  function _wisMod(actor) {
    if (!actor) return 0;
    return Math.floor((((actor.mdf ?? 10)) - 10) / 2);
  }

  // The odds the button advertises and the roll actually makes. The base is the
  // animal's own (wildJoinChance / ownedJoinChance off its wardrobe entry), and
  // how it feels about the person asking moves it: an animal that has been fed
  // and petted comes more readily than one that has only been stared at. The
  // owned floor is deliberately low, so a well-loved dog stays almost
  // impossible however much the party has ingratiated itself.
  const ANIMAL_JOIN_MIN = 1;
  const ANIMAL_JOIN_MAX = 95;
  function _animalJoinChance(status, actor, opinion = 0) {
    if (!status) return ANIMAL_JOIN_MIN;
    if (_forceHighJoinChance()) return ANIMAL_JOIN_MAX;
    const base = Number(status.joinChance) || ANIMAL_JOIN_MIN;
    // Opinion runs -100..+100 and is worth a fifth of itself in points, so a
    // devoted animal roughly doubles a middling base and a frightened one
    // gives up most of it.
    const raw = base + (Number(opinion) || 0) * 0.2 + _wisMod(actor);
    return Math.round(Math.max(ANIMAL_JOIN_MIN, Math.min(ANIMAL_JOIN_MAX, raw)));
  }

  // An animal joins as a PET, trailing the party (PetFollowerSystem), not as a
  // party member holding one of the three slots. Its placement record goes with
  // it so the farm it came off no longer counts it as stock, and the map event
  // it was standing in is erased.
  function _recruitAnimalAsPet(rec, status, npcName, eventId) {
    const AG = window.AnimalGrowthSystem;
    const PS = window.PetSystem;
    if (!AG || !PS || typeof PS.recruitPet !== 'function') return false;
    const def = AG.ANIMAL_DB?.[rec.animalId];
    const sprite = def ? AG.getCurrentSprite(rec, def) : null;
    const pet = PS.recruitPet({
      name: npcName || rec.animalId,
      characterName: sprite,
      characterIndex: 0,
      isFollower: false,
      note: _getT().beastPetNote
        ? String(_getT().beastPetNote).replace(/\{kind\}/g, status.breed || '')
        : '',
    });
    if (!pet) return false;
    AG.releaseAnimal?.(rec, eventId);
    return true;
  }

  // The same animal asked for more than company: a place in the party. It walks
  // in wearing its creature class and holding a slot, which is the one thing a
  // pet never does (PetSystem.inductAsMember). Everything else, the placement
  // record and the map event, is settled exactly as a pet's would be.
  function _recruitAnimalAsMember(rec, status, npcName, eventId) {
    const AG = window.AnimalGrowthSystem;
    const PS = window.PetSystem;
    if (!AG || !PS || typeof PS.inductAsMember !== 'function') return false;
    const def = AG.ANIMAL_DB?.[rec.animalId];
    const sprite = def ? AG.getCurrentSprite(rec, def) : null;
    const actor = PS.inductAsMember({
      name: npcName || rec.animalId,
      characterName: sprite,
      characterIndex: 0,
      isFollower: false,
      note: _getT().beastPetNote
        ? String(_getT().beastPetNote).replace(/\{kind\}/g, status.breed || '')
        : '',
    });
    if (!actor) return false;
    AG.releaseAnimal?.(rec, eventId);
    return true;
  }

  // Somebody who talks, walking with the party rather than in it. No party slot
  // and no actor: a follower record in the same registry a pet lives in, which
  // is why it is marked sentient and carries the <Talk> tag (PetFollowerSystem).
  function _recruitNpcAsFollower(npcName, profile, eventId) {
    const PS = window.PetSystem;
    if (!PS || typeof PS.recruitPet !== 'function') return false;
    const ev = eventId != null ? $gameMap?.event(eventId) : null;
    const pet = PS.recruitPet({
      name: npcName,
      characterName: ev?.characterName?.() || profile?.spriteKey || '',
      characterIndex: ev?.characterIndex?.() ?? 0,
      isFollower: true,
      sentient: true,
      level: profile?.level || 1,
      note: '<Talk>', // i18n-ignore: note tag
    });
    return !!pet;
  }

  // ── Infecting somebody out of a vial ──────────────────────────────────────
  // A sealed culture vial names the disease in it, which is the only metadata
  // the action needs: <DiseaseVial: influenza>, written by
  // tools/health/gen_disease_vials.py onto all 228 of them.
  function _diseaseVialId(item) {
    const raw = item && item.meta && item.meta.DiseaseVial;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  // The vials the party is carrying. An empty list is what greys the action out.
  function _diseaseVialItems() {
    return ($gameParty?.items?.() ?? []).filter(item => item && item.itypeId === 1 && _diseaseVialId(item));
  }

  // Whether it is done unnoticed, the single source of truth for both the
  // "(~N%)" the button advertises and the roll _infectWith() makes. The vial
  // always goes in, this only decides whether they saw who put it there:
  // knowing the dose is INT and getting it into them is DEX, and nothing else
  // moves it. A failure is a bioterrorism charge and the end of the friendship.
  const INFECT_BASE     = 10;   // the chance with no stats behind it at all
  const INFECT_STAT_DIV = 0.6;  // (INT + DEX) over this, in percentage points (D&D scale)
  const INFECT_MIN      = 5;
  const INFECT_MAX      = 95;
  function _infectChance(actor) {
    if (!actor) return INFECT_MIN;
    const raw = INFECT_BASE + (((actor.mat || 0) + (actor.agi || 0)) / INFECT_STAT_DIV);
    return Math.round(Math.max(INFECT_MIN, Math.min(INFECT_MAX, raw)));
  }

  // A recruit still has to be in the party's weight class: nobody more than
  // JOIN_LEVEL_MARGIN levels above the strongest member is willing to be led by
  // them, so Join is not offered at all for someone that far out of reach.
  const JOIN_LEVEL_MARGIN = 3;

  function _partyMaxLevel() {
    return ($gameParty?.members?.() ?? [])
      .reduce((max, member) => Math.max(max, member?.level ?? 1), 1);
  }

  // The 3-member cap counts whoever is still standing: a companion who fell and
  // was never brought back is left behind when somebody new signs on (see
  // NPCSystemParty.joinParty), so a corpse does not hold a slot against a
  // recruit and Join stops reporting a full party that no longer is one.
  function _travellingPartyCount() {
    const members = $gameParty?.members?.() ?? [];
    return members.filter((member, i) => i === 0 || !member?.isDead?.()).length;
  }

  function _joinLevelOk(npcLevel) {
    const level = Number(npcLevel);
    if (!Number.isFinite(level)) return true; // unknown level, never a blocker
    return level <= _partyMaxLevel() + JOIN_LEVEL_MARGIN;
  }

  function _extractClassId(ev) {
    const m = (ev?.event()?.note || '').match(/NPC-(\d+)/);
    return m ? Number(m[1]) : null;
  }

  // A <Story> event is a written character the plot still needs (see
  // Utils.hasStoryTag in NPCSystem.js). The party may talk to them, court them,
  // rob them and haggle with them like anybody else, but they may not be fought
  // and they may not be given a disease: Attack, Infect and the three
  // deliberate-transmission moves (Cough/Spit/Bite) leave the action row, and
  // the casual transmission rolled on opening the panel is skipped for them.
  function _isStoryNpc(evId) {
    if (evId == null) return false;
    const note = $gameMap?.event(evId)?.event()?.note;
    return !!window.NPCSystem?.hasStoryTag?.(note);
  }

  // The moves that would hurt or infect somebody, i.e. exactly what a <Story>
  // character is protected from. Shared with the UI layer's action row.
  const STORY_PROTECTED_ACTIONS = ['attack', 'infect', 'cough', 'spit', 'bite'];

  // True when the event has a page gated on self-switch A. Recruiting flips that
  // self-switch so the NPC stops standing on the map, which only works if there
  // is a page to fall through to - otherwise the recruit stays visible and the
  // player can walk up to a copy of a party member. This inspects the event's
  // static page CONDITIONS, not the runtime self-switch value: an earlier
  // version tested the value itself and wrongly hid Join all over the place.
  function _hasSelfSwitchAPage(eventId) {
    const pages = $gameMap?.event(eventId)?.event()?.pages;
    if (!Array.isArray(pages)) return false;
    return pages.some(p => p?.conditions?.selfSwitchValid && p.conditions.selfSwitchCh === 'A');
  }

  function _hasJoinPartyCommand(eventId) {
    const ev = $gameMap?.event(eventId);
    if (!ev) return false;
    const page = ev.page();
    if (!page?.list) return false;
    return page.list.some(cmd => cmd.code === 357 && cmd.parameters?.[1] === 'JoinParty');
  }

  // Where a loose bust name's file actually is. window.BustPath (defined in
  // VisualNovelBustSystem.js, the first bust plugin to load) knows that the
  // pre-made characters' portraits live in img/busts/presets/ while everybody
  // else's sit in the flat folder; asking through it is what keeps the panel's
  // portrait and the message box's the same picture. The fallback is the old
  // flat-folder rule, for a build where that plugin is switched off.
  function _bustUrl(name, fallback = 'img/busts/7.png') {
    if (window.BustPath) return window.BustPath.url(name, fallback);
    const raw = String(name ?? '').trim()
      .replace(/^img\/busts\//i, '').replace(/\.png$/i, '');
    if (!raw || raw === '7' || raw === '0') return fallback;
    return `img/busts/${raw}.png`;
  }

  function _resolveBustForActor(actor) {
    if (!actor) return 'img/busts/7.png';
    // The bust the rest of the game shows for this actor (set by character
    // creation, the sprite selector, or a preset dossier) wins over anything
    // derived from the walking sprite. ActorCharacterFields stores 0 when unset.
    const own = actor.vnBust ? actor.vnBust() : null;
    if (own && own !== '7' && own !== 0) return _bustUrl(own);
    const charName  = actor.characterName();
    const charIndex = actor.characterIndex();
    if (charName && window.Sprites?.SpritesAssociation) {
      const sa   = window.Sprites.SpritesAssociation;
      const bust = sa[charName.split('.')[0]]?.[charIndex];
      if (bust && bust !== '7') return _bustUrl(bust);
    }
    return 'img/busts/7.png';
  }

  // ── Event comment conventions shared with the dialogue box ──
  // DialogueSystem.js lets an event name its own bust with a comment holding a
  // single token (no spaces), e.g. a comment "Em" -> img/busts/Em.png. The panel
  // reads the very same comments so the portrait here matches the one the
  // message box shows, and additionally understands "Preset: <name>", which ties
  // the event to a character dossier from CharacterCreationPresets.js.

  // Comment text of the event's active page (codes 108/408), trimmed.
  function _eventCommentLines(event) {
    const data = event?.event?.();
    if (!data?.pages?.length) return [];
    let page = null;
    if (typeof event.meetsConditions === 'function')
      page = data.pages.find(p => event.meetsConditions(p)) || null;
    if (!page && typeof event.page === 'function') page = event.page() || null;
    if (!page) page = data.pages[0];
    if (!page?.list) return [];
    return page.list
      .filter(cmd => cmd.code === 108 || cmd.code === 408)
      .map(cmd => String(cmd.parameters?.[0] ?? '').trim())
      .filter(Boolean);
  }

  // Under NW.js the file can actually be checked, which keeps unrelated
  // single-word comments (flags left by other systems) from turning into a
  // broken portrait. In a browser build every path is assumed present and the
  // <img> onerror fallback catches misses.
  // Memoized: the panel re-renders on every keypress, and the same handful of
  // comment tokens would otherwise be stat()ed again each time.
  const _bustExistsCache = {};
  function _bustFileExists(name) {
    if (window.BustPath) return window.BustPath.exists(name);
    if (typeof Utils === 'undefined' || !Utils.isNwjs?.()) return true;
    if (name in _bustExistsCache) return _bustExistsCache[name];
    let exists = true;
    try {
      const fs   = require('fs');
      const path = require('path');
      exists = fs.existsSync(path.join(process.cwd(), 'img', 'busts', `${name}.png`));
    } catch (e) {
      exists = true;
    }
    _bustExistsCache[name] = exists;
    return exists;
  }

  function _bustNameFromEvent(event) {
    // A `bust: <name>` line is the explicit form of the same statement and
    // wins over the bare single-token comment (see NPCInitSpec, SECTION 3c of
    // NPCSociety.js).
    const written = window.NPCInitSpec?.bustFor?.(null, event);
    if (written) return written;
    for (const line of _eventCommentLines(event)) {
      if (!line.includes(' ') && _bustFileExists(line)) return line;
    }
    return null;
  }

  // Dossier named by a "Preset: <name>" comment, matched by preset name.
  function _presetFromEvent(event) {
    const presets = window.CharacterPresets?.getCharacterPresets?.() ?? [];
    if (!presets.length) return null;
    for (const line of _eventCommentLines(event)) {
      const m = line.match(/^Preset\s*:\s*(.+)$/i);
      if (!m) continue;
      const wanted = m[1].trim().toLowerCase();
      const hit = presets.find(p => String(p.name ?? '').trim().toLowerCase() === wanted);
      if (hit) return hit;
    }
    return null;
  }

  // The bust an NPCs.json wardrobe entry carries for the sheet this NPC is
  // wearing, at the face index its profile was dealt. Null for anybody whose
  // sheet is not in the wardrobe, or whose entry lists no faces at all (a
  // Monsters/ bestiary sheet in a monster world), and those are portrayed by
  // their 3D model instead.
  function _creatureBustPath(npcName) {
    const profile = npcName ? _getProfile(npcName) : null;
    if (!profile || !profile.spriteKey) return null;
    const entry = window.WorldGen?.NPCs?.[profile.spriteKey];
    const busts = (entry && Array.isArray(entry.busts)) ? entry.busts : [];
    if (!busts.length) return null;
    const index = Math.min(Math.max(Number(profile.bustIndex) || 0, 0), busts.length - 1);
    const name = busts[index];
    return name ? _bustUrl(name) : null;
  }

  function _resolveBustPath(npcName, event) {
    // A bust named in the event's comments wins, exactly as in the message box.
    const commentBust = _bustNameFromEvent(event);
    if (commentBust && commentBust !== '7') return _bustUrl(commentBust);
    // The panel opens on people who are nowhere near the player (the wiki, the
    // web graph, a chat hyperlink), and a written bust is still theirs.
    const writtenBust = window.NPCInitSpec?.bustFor?.(npcName, null);
    if (writtenBust && writtenBust !== '7') return _bustUrl(writtenBust);
    const presetBust = _presetFromEvent(event)?.busts;
    if (presetBust && presetBust !== '7') return _bustUrl(presetBust);
    // A world leader carries their own portrait in Leaders.json, and this is
    // the only face they have: most of them never stand on a map at all, so
    // there is no event and no sprite to derive one from. Asked before the
    // society sim's random pick so the wiki article and the panel it opens
    // show the same person.
    const leaderBust = window.HistoryManager?.leaderBust?.(npcName);
    if (leaderBust) return leaderBust;
    if (window.NPCSim?.getBustForNPC) {
      const b = window.NPCSim.getBustForNPC(npcName);
      if (b && b !== '7') return _bustUrl(b);
    }
    // A creature or an animal wears a sheet out of the NPCs.json wardrobe, and
    // that entry names the faces it comes with. Those are ITS busts and are
    // read straight off the profile the wardrobe wrote, rather than hunted for
    // through the sprite-to-bust table, which knows only about people.
    const creatureBust = _creatureBustPath(npcName);
    if (creatureBust) return creatureBust;
    let charName  = event?.event()?.characterName  ?? event?.event()?.pages?.[0]?.image?.characterName;
    let charIndex = event?.event()?.characterIndex ?? event?.event()?.pages?.[0]?.image?.characterIndex ?? 0;
    // Remote NPC (no on-map event, opened from the wiki, web graph, or a
    // chat hyperlink): fall back to their template sprite from the pools.
    if (!charName && npcName && window.NPCSystem?.findTemplateSprite) {
      const tpl = window.NPCSystem.findTemplateSprite(npcName);
      if (tpl) { charName = tpl.characterName; charIndex = tpl.characterIndex; }
    }
    if (charName && window.Sprites?.SpritesAssociation) {
      const sa   = window.Sprites.SpritesAssociation;
      const bust = sa[charName.split('.')[0]]?.[charIndex];
      if (bust && bust !== '7') return _bustUrl(bust);
    }
    return 'img/busts/7.png';
  }

  // Everything a battle needs to wear this NPC's face: the bust the panel was
  // showing and the walking sprite they were standing there in. Both are read
  // here, while the event is still on the current map, because the fight starts
  // one scene later (SECTION 5c draws whichever the battler option calls for).
  function _buildBattleFace(npcName, event) {
    const bustPath  = _resolveBustPath(npcName, event) || 'img/busts/7.png';
    let charName    = (event?.characterName?.() || '');
    let charIndex   = (event?.characterIndex?.() ?? 0);
    // Remote NPC (no event on this map): fall back to their pool template, the
    // same way the portrait does.
    if (!charName && npcName && window.NPCSystem?.findTemplateSprite) {
      const tpl = window.NPCSystem.findTemplateSprite(npcName);
      if (tpl) { charName = tpl.characterName; charIndex = tpl.characterIndex ?? 0; }
    }
    return {
      name: npcName || '',
      // Stored as a bare file name: the battle loads it through ImageManager,
      // not as an <img> src.
      bust: bustPath.replace(/^img\/busts\//, '').replace(/\.png$/i, ''),
      charName,
      charIndex,
    };
  }

  function _extractContacts(profile, limit = 9) {
    if (!profile) return [];
    const counts = {};
    (profile.eventLog || [])
      .filter(e => e.tag === 'social')
      .forEach(e => {
        const n = (e.desc || '').replace(/^met /, '').trim();
        if (n) counts[n] = (counts[n] || 0) + 1;
      });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return (limit === Infinity ? entries : entries.slice(0, limit))
      .map(([name, count]) => ({ name, count }));
  }

  function _countRecentInteractions(profile, type, withinDays) {
    if (!profile?.eventLog?.length) return 0;
    const nowMin = $gameVariables?.value(114) ?? 0;
    const cutoff = nowMin - withinDays * 1440;
    return profile.eventLog.filter(e => e.tag === type && (e.gameMin ?? 0) >= cutoff).length;
  }

  function _lastInteractionDay(profile) {
    if (!profile?.eventLog?.length) return null;
    let latest = -Infinity;
    for (const e of profile.eventLog) {
      if ((e.gameMin ?? 0) > latest) latest = e.gameMin ?? 0;
    }
    if (latest < 0) return null;
    return Math.floor(latest / 1440);
  }

  // ============================================================================
  // SECTION 3b, PER-ACTOR PREDISPOSITION
  // ============================================================================

  // How far apart two creeds have to stand (mean axis distance, 0..200) before
  // the difference stops being felt as agreement and starts being felt as
  // disagreement, how hard each point past that lands, and the ceiling either
  // way. Two ordinary people are typically 40-60 apart.
  const CREED_NEUTRAL_DISTANCE = 45;
  const CREED_OPINION_WEIGHT   = 0.5;
  const CREED_OPINION_MAX      = 22;

  // Trait + ideology compatibility bonus an NPC feels toward ONE actor. This is
  // the innate, unchanging part of a reputation (who you are), on top of the
  // earned per-actor base opinion (what you've done).
  function _traitCompatBonus(profile, actor) {
    const npcTraitIds         = new Set(profile?.traitIds ?? []);
    const allTraits           = window.Health?.Traits ?? [];
    const npcIdeology         = window.NPCShared?.ideologyFor(profile) ?? null;
    const npcIdeologyTraitIds = new Set(npcIdeology?.traits ?? []);
    const actorTraitIds       = (actor?._selectedTraits ?? []).map(t => t.id);

    let bonus = 0;
    for (const id of actorTraitIds) {
      if (npcTraitIds.has(id)) bonus += 15;
      if (npcIdeologyTraitIds.has(id)) bonus += 10;
      const def = allTraits.find(t => t.id === id);
      if (def?.incompatible) {
        for (const incompId of def.incompatible) {
          if (npcTraitIds.has(incompId)) bonus -= 20;
        }
      }
    }
    for (const npcId of npcTraitIds) {
      const def = allTraits.find(t => t.id === npcId);
      if (def?.incompatible) {
        for (const incompId of def.incompatible) {
          if (actorTraitIds.includes(incompId) && !npcIdeologyTraitIds.has(incompId)) {
            bonus -= 20;
          }
        }
      }
    }

    // Creed against creed. A party member only has one when they were built
    // with a society profile of their own (the Detailed character editor gives
    // every one it makes one), and where both sides have one the five-axis
    // distance between what they believe is felt on sight: a shared creed
    // opens the conversation warm, an opposed one closes it before it starts.
    // Nothing changes for a party that has no creed on file.
    const actorProfile = window.NPCSocietyRegistry?.getProfile?.(actor?.name?.() ?? "");
    const actorIdeology = actorProfile ? window.NPCShared?.ideologyFor(actorProfile) : null;
    if (actorIdeology && npcIdeology) {
      const distance = window.NPCShared.ideologyDistance(npcIdeology, actorIdeology);
      const felt = (CREED_NEUTRAL_DISTANCE - distance) * CREED_OPINION_WEIGHT;
      bonus += Math.round(Math.max(-CREED_OPINION_MAX, Math.min(CREED_OPINION_MAX, felt)));
    }
    return bonus;
  }

  // ── Hygiene: who has washed, and who minds ──────────────────────────────
  // Standing close enough to talk means smelling the other person, so the state
  // of BOTH bodies moves the disposition: the party member doing the talking
  // (their hygiene need, TimeDateSystem) and the NPC (profile.hygiene, drained
  // by NPCSimulationCore and refilled at a sink or a WC). Recoiling from
  // somebody costs a conversation as much as being recoiled from does.
  //
  // It is felt hardest when courting: _romanceChance (NPCEmpathizeUI.js) reads
  // the same number a second time, at its own weight, on top of the disposition
  // this already dulled.
  //
  // Above HYGIENE_CLEAN nobody notices anything. Below it, every point costs.
  const HYGIENE_CLEAN       = 60;   // hygiene % at or above which nobody minds
  const HYGIENE_WEIGHT      = 0.42; // opinion points per point below the line
  const HYGIENE_MAX_PENALTY = 45;   // floor, however filthy both parties are

  // How much a trait makes the person CARRYING it mind the state of whoever is
  // standing in front of them (Traits.json ids). It is read on both sides: an
  // NPC's traits decide how much the party member offends them, the party
  // member's traits decide how much the NPC does. Multiplier on the penalty,
  // 0 means the smell never registers at all, above 1 means it registers twice
  // over. Several traits multiply together, and a single 0 wins outright.
  const HYGIENE_TRAIT_MULT = {
    // ── Does not register it ───────────────────────────────────────────────
    189: 0,    // Feral, raised in the wilderness: this is what people smell like
    // ── Tolerates it ───────────────────────────────────────────────────────
    50:  0.25, // Ascetic, mortifying the flesh is rather the point
    124: 0.3,  // Street Urchin, grew up where nobody had a bath either
    184: 0.3,  // Cave Dweller
    97:  0.3,  // Survivalist, has been worse for longer
    130: 0.35, // Slave-Born
    137: 0.35, // Farmer, has spent the morning in the muck
    86:  0.4,  // Slothful, minds it but not enough to do anything about it
    27:  0.4,  // Hoarder, lives in worse and defends it
    136: 0.45, // Veteran, has slept in trenches with the same people for months
    // ── Minds it far more than most ────────────────────────────────────────
    91:  1.3,  // Proud, expects better company than this
    131: 1.4,  // Wealthy, has never had to be near it
    144: 1.5,  // Beautiful, keeps the company they believe they are owed
    30:  1.6,  // Perfectionist
    123: 1.7,  // Noble, raised to treat it as a moral failing
    56:  1.9,  // Hypochondriac, every unwashed body is a diagnosis
    23:  2.6,  // Germaphobe, the one trait this is really about
  };

  function _actorTraitIds(actor) {
    return (actor?._selectedTraits ?? []).map(t => t?.id).filter(id => id != null);
  }

  function _hygieneToleranceMult(traitIds) {
    let mult = 1;
    for (const id of traitIds || []) {
      const m = HYGIENE_TRAIT_MULT[id];
      if (m === undefined) continue;
      if (m === 0) return 0;
      mult *= m;
    }
    return Math.min(3, mult);
  }

  // One side's reaction to the other's state. Always <= 0.
  function _hygieneSidePenalty(hygienePct, perceiverTraitIds) {
    const raw   = Number(hygienePct ?? 100);
    if (!isFinite(raw)) return 0; // a meter nobody has written yet is not a smell
    const short = HYGIENE_CLEAN - Math.max(0, Math.min(100, raw));
    if (short <= 0) return 0;
    const mult = _hygieneToleranceMult(perceiverTraitIds);
    if (!mult) return 0;
    return -(short * HYGIENE_WEIGHT * mult);
  }

  // The two halves of the reading, in opinion points (each <= 0): `theirs` is
  // what the NPC makes of the party member, `mine` what the party member makes
  // of the NPC. Split out so the UI can say which of the two needs a bath.
  function _hygieneReadout(profile, actor) {
    if (!profile || !actor) return { theirs: 0, mine: 0 };
    const actorHyg = actor.hygienePercent ? actor.hygienePercent() : 100;
    return {
      theirs: _hygieneSidePenalty(actorHyg,        profile.traitIds ?? []),
      mine:   _hygieneSidePenalty(profile.hygiene, _actorTraitIds(actor)),
    };
  }

  // Both directions at once, in opinion points (always <= 0). `weight` lets a
  // caller ask for a harsher reading of the same two bodies.
  function _hygienePenalty(profile, actor, weight = 1) {
    const { theirs, mine } = _hygieneReadout(profile, actor);
    const total = theirs + mine;
    if (!total) return 0;
    return Math.round(Math.max(-HYGIENE_MAX_PENALTY, total * weight));
  }

  // ── Personality-driven social reactions ─────────────────────────────────
  // Same Praise/Insult/Joke/etc. lands with a different weight depending on
  // the NPC's PersonalityData.json archetype, on top of the tone-based math
  // in _socialInteract. Multiplier on the delta the interaction would
  // otherwise produce for that tone bucket (positive/neutral/negative).
  const PERSONALITY_SOCIAL_MODS = {
    Nervous:       { positive: 1.1, neutral: 1.0, negative: 1.3 },
    Calm:          { positive: 0.9, neutral: 1.0, negative: 0.7 },
    Aggressive:    { positive: 0.7, neutral: 0.9, negative: 1.4 },
    Melancholic:   { positive: 1.2, neutral: 0.9, negative: 1.1 },
    Sanguine:      { positive: 1.3, neutral: 1.1, negative: 0.9 },
    Cautious:      { positive: 0.8, neutral: 1.0, negative: 1.1 },
    Impulsive:     { positive: 1.1, neutral: 0.9, negative: 1.3 },
    Stoic:         { positive: 0.6, neutral: 0.8, negative: 0.6 },
    Paranoid:      { positive: 0.6, neutral: 0.9, negative: 1.3 },
    Empathetic:    { positive: 1.3, neutral: 1.1, negative: 1.1 },
    Authoritative: { positive: 0.8, neutral: 1.0, negative: 1.2 },
    Scholarly:     { positive: 0.9, neutral: 1.2, negative: 0.9 },
    Artistic:      { positive: 1.2, neutral: 1.1, negative: 1.0 },
    Adventurous:   { positive: 1.0, neutral: 1.2, negative: 0.9 },
    Nurturing:     { positive: 1.3, neutral: 1.1, negative: 0.8 },
    Mischievous:   { positive: 0.9, neutral: 1.2, negative: 0.7 },
    Cynical:       { positive: 0.5, neutral: 0.9, negative: 1.1 },
    Disciplined:   { positive: 0.8, neutral: 1.0, negative: 0.9 },
    Fatalistic:    { positive: 0.7, neutral: 0.8, negative: 0.8 },
    Grumpy:        { positive: 0.6, neutral: 0.8, negative: 1.3 },
    Loyal:         { positive: 1.2, neutral: 1.0, negative: 1.2 },
    Brave:         { positive: 0.9, neutral: 1.0, negative: 0.7 },
    Timid:         { positive: 1.2, neutral: 1.0, negative: 1.4 },
    Hedonistic:    { positive: 1.2, neutral: 1.2, negative: 0.8 },
    Apathetic:     { positive: 0.5, neutral: 0.6, negative: 0.6 },
  };
  function _personalityName(profile) {
    return window._NPCSocietyDataLoader?.personalities?.[profile?.personalityIndex]?.name || null;
  }
  function _personalitySocialMult(profile, tone) {
    const mods = PERSONALITY_SOCIAL_MODS[_personalityName(profile)];
    return mods ? (mods[tone] ?? 1) : 1;
  }

  // ── Em: how the world treats the witch who fed the spear ────────────────
  // Em's memories were forged into the Lance of Memory, the weapon that killed
  // the Father aspect of YHWH, and every sacred spell in the world died with
  // him (docs/Lore.odt). She is famous for it, so almost nobody meets her as a
  // person: the devout blame her, most people just want her to be famous
  // somewhere else, and the ones who are warm are usually warm about the story
  // rather than the woman. All of it is gated on Switch 48 (set by her dossier)
  // AND on Em being the party member actually doing the talking, so an ordinary
  // playthrough never sees any of it. Lines and numbers live in the "em" block
  // of js/db/NPC/SocialLines.json, whose "player" pool is what she says back.
  const EM_SWITCH   = 48;
  const EM_NAME     = 'Em';       // i18n-ignore: actor name, matched at runtime
  const BUBBA_NAME  = 'Bubba';    // i18n-ignore: actor name, matched at runtime
  const TRAIT_DEVOUT = 116;
  // Factions that answer to a god, or are one: the Gods themselves, the
  // libertarian gods, and the Vatican's three arms (WorldGen/Factions.json).
  const EM_ZEALOT_FACTIONS = new Set([18, 24, 27, 28, 29]);

  // Default reaction per PersonalityData.json archetype. Zealotry is layered on
  // top of this by belief, not by temperament.
  const EM_STANCE_BY_PERSONALITY = {
    Nervous: 'gawker',      Calm: 'gawker',        Aggressive: 'annoyed',
    Melancholic: 'gawker',  Sanguine: 'fan',       Cautious: 'gawker',
    Impulsive: 'fan',       Stoic: 'annoyed',      Paranoid: 'annoyed',
    Empathetic: 'genuine',  Authoritative: 'annoyed', Scholarly: 'gawker',
    Artistic: 'fan',        Adventurous: 'clout',  Nurturing: 'genuine',
    Mischievous: 'fan',     Cynical: 'annoyed',    Disciplined: 'annoyed',
    Fatalistic: 'gawker',   Grumpy: 'annoyed',     Loyal: 'clout',
    Brave: 'clout',         Timid: 'gawker',       Hedonistic: 'fan',
    Apathetic: 'annoyed',
  };

  function _emHash(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Is this playthrough Em's? Switch 48 is set by her dossier when creation
  // ends, so it also survives her being handed the party lead later.
  function _emPlaythrough() {
    return !!window.$gameSwitches?.value(EM_SWITCH);
  }
  function _isEmActor(actor) {
    return !!actor && actor.name() === EM_NAME && _emPlaythrough();
  }
  function _emPartyActor() {
    return ($gameParty?.members() ?? []).find(m => m && m.name() === EM_NAME) || null;
  }
  // Bubba is the exception to all of it: the man she shares the camper with.
  // Matched by event name or by a "Preset: Bubba" comment on the event.
  function _isBubbaNpc(npcName, event) {
    if (String(npcName || '').trim().toLowerCase() === BUBBA_NAME.toLowerCase()) return true;
    const preset = event ? _presetFromEvent(event) : null;
    return String(preset?.name || '').trim().toLowerCase() === BUBBA_NAME.toLowerCase();
  }

  function _emDb() { return _socialLines().em || {}; }

  // Which reaction this NPC has to Em. Stable per NPC (hashed from the name),
  // and stamped onto the profile the first time it is resolved so the rest of
  // the panel, and later visits, agree with what was said the first time.
  function _emStanceKey(profile, npcName, event) {
    if (_isBubbaNpc(npcName, event)) return 'bubba';
    if (profile?._emStance) return profile._emStance;

    const roll = _emHash(npcName || '');
    let key;
    const traitIds = profile?.traitIds ?? [];
    const devout   = traitIds.includes(TRAIT_DEVOUT);
    const dl       = window._NPCSocietyDataLoader;
    const ideology = window.NPCShared?.ideologyFor(profile) ?? null;
    const theocrat = /theocra/i.test(String(ideology?.id ?? ideology?.name ?? ''));
    const persName = _personalityName(profile);
    if (devout || theocrat || EM_ZEALOT_FACTIONS.has(profile?.factionIndex)) {
      key = 'zealot';
    } else {
      key = EM_STANCE_BY_PERSONALITY[persName] || 'gawker';
      // Word travels: one stranger in five has already decided she is what
      // killed their god, whatever their temperament says.
      if ((roll % 5) === 0) key = 'zealot';
      // Being met as a person is the rare case, even from the warm ones.
      else if (key === 'genuine' && (roll % 3) !== 0) key = 'clout';
    }
    // Only remember a stance that was decided on real data: the society data
    // loader finishes asynchronously, and a personality-less fallback must not
    // freeze this NPC as a gawker for the rest of the world's life.
    if (profile && (persName || key === 'zealot')) profile._emStance = key;
    return key;
  }

  function _emStanceData(key) {
    const db = _emDb();
    return (key === 'bubba' ? db.bubba : db.stances?.[key]) || null;
  }

  // The reaction in play right now, or null when this is not an Em interaction.
  // `actor` is the party member doing the talking, not merely a member.
  function _emContext(profile, npcName, event, actor) {
    if (!_isEmActor(actor)) return null;
    const key  = _emStanceKey(profile, npcName, event);
    const data = _emStanceData(key);
    return data ? { key, data, bubba: key === 'bubba' } : null;
  }

  // First impression: the standing Em starts from with an NPC she has never
  // spoken to. Written once into her own per-actor entry, so everything after
  // it is earned normally and nothing re-seeds on a later visit.
  function _emSeedFirstImpression(profile, npcName, event) {
    if (!profile || !_emPlaythrough()) return;
    const em = _emPartyActor();
    if (!em) return;
    const actorId = em.actorId();
    if (profile.opinions && profile.opinions[actorId] != null) return;
    const key  = _emStanceKey(profile, npcName, event);
    const data = _emStanceData(key);
    if (!data) return;
    // Bubba's 90 is who he is to her, not a modifier on how the world feels.
    const base = key === 'bubba'
      ? data.opinion
      : (profile.playerOpinion ?? 0) + (data.opinion ?? 0);
    _setNpcBaseOpinion(profile, actorId, base);
  }

  // Tone scaling for a stance block (Em's stances, Bubba's admiration).
  function _stanceToneMult(ctx, tone) {
    const mult = ctx?.data?.toneMult;
    return mult && mult[tone] != null ? mult[tone] : 1;
  }

  // ── Bubba: how the world treats the man who built the Liminal Engine ─────
  // The mirror image of Em's layer. She is famous for what was taken out of
  // her; he is famous for what he gave everybody back, so where her stance is
  // rolled per NPC, his is the same everywhere: admiration. While Bubba is the
  // party member doing the talking, every NPC starts from a higher opinion of
  // him, greets him as the Liminal Engine man, takes anything he says warmly,
  // and hears him answer modestly. Nothing hostile is on the table and nothing
  // romantic either, except with the bubbaromantic, who get one thing: turned
  // down. Gated on Switch 49 (his dossier's) or an actor named Bubba, so an
  // ordinary playthrough never sees any of it. Lines live in the "bubba" block
  // of js/db/NPC/SocialLines.json.
  const BUBBA_SWITCH = 49;

  function _bubbaPlaythrough() {
    if (window.$gameSwitches?.value(BUBBA_SWITCH)) return true;
    return ($gameParty?.members() ?? []).some(m => m && m.name() === BUBBA_NAME);
  }
  function _isBubbaActor(actor) {
    return !!actor && actor.name() === BUBBA_NAME && _bubbaPlaythrough();
  }
  function _bubbaDb() { return _socialLines().bubba || {}; }

  // The admiration in play right now, or null when this is not Bubba talking.
  // `actor` is the party member doing the talking, not merely a member.
  function _bubbaContext(actor) {
    if (!_isBubbaActor(actor)) return null;
    const data = _bubbaDb();
    return data && data.greeting ? { data } : null;
  }

  // The standing an NPC starts from with Bubba: their opinion of the party plus
  // the goodwill of never having queued for a coach that did not come. Written
  // once into his own per-actor entry, so everything after it is earned.
  function _bubbaSeedFirstImpression(profile, actor) {
    if (!profile || !_isBubbaActor(actor)) return;
    const actorId = actor.actorId();
    if (profile.opinions && profile.opinions[actorId] != null) return;
    const bonus = Number(_bubbaDb().opinionBonus);
    if (!bonus) return;
    _setNpcBaseOpinion(profile, actorId, (profile.playerOpinion ?? 0) + bonus);
  }

  // ── Em and Bubba, to each other ─────────────────────────────────────────
  // The two layers above are about how the WORLD treats each of them. This one
  // is the conversation they have with nobody but each other, and it runs in
  // both directions: Em walking up to Bubba (`em.bubba` in SocialLines.json)
  // and Bubba walking up to Em (`bubba.em`), whether Em is standing there as a
  // map NPC or is being opened from the party roster. They are best friends and
  // partners in crime, so the register is teasing rather than courteous: he
  // frets and jokes and calls her guagliona, she answers the literal meaning of
  // whatever he said and is magnificent about it.
  //
  // Nothing about it is romantic. The Court option is shown when Em raises it,
  // because refusing to hear the answer is her whole character, and the answer
  // is always the same: he is still Eris's, and being anything but her travel
  // buddy would be weird. Bubba is never offered the option at all
  // (NPCEmpathizeUI.js), and neither of them can be reported for harassing the
  // other, which is the one thing three refusals normally costs.
  //
  // Every bank comes in two versions, one per direction, and both carry the
  // same shape: greeting, positive/neutral/negative, `bicker` (the teasing
  // exchange the Bicker action plays) and `situations`, keyed lines for what is
  // happening around them right now (see _pairSituationKeys).
  function _isEmNpc(npcName, event) {
    if (String(npcName || '').trim().toLowerCase() === EM_NAME.toLowerCase()) return true;
    const preset = event ? _presetFromEvent(event) : null;
    return String(preset?.name || '').trim().toLowerCase() === EM_NAME.toLowerCase();
  }

  // Which way round this conversation is: 'em' when Em is doing the talking and
  // Bubba is the one being talked to, 'bubba' for the mirror, null otherwise.
  // Neither switch is consulted: two actors both named for the pair is proof
  // enough, and Em's own layer already gates on hers.
  function _pairSide(actor, npcName, event) {
    if (!actor || !npcName) return null;
    const me = String(actor.name() || '').trim().toLowerCase();
    if (me === EM_NAME.toLowerCase() && _isBubbaNpc(npcName, event))    return 'em';
    if (me === BUBBA_NAME.toLowerCase() && _isEmNpc(npcName, event))    return 'bubba';
    return null;
  }

  // The block of lines for that direction: what the OTHER one says back, plus
  // the `player` pool the talker answers in.
  function _pairData(side) {
    const db = _socialLines();
    return side === 'em' ? (db.em?.bubba || null) : (db.bubba?.em || null);
  }

  function _pairContext(actor, npcName, event) {
    const side = _pairSide(actor, npcName, event);
    if (!side) return null;
    const data = _pairData(side);
    return data ? { side, data, bubba: true, pair: true } : null;
  }

  // The hour on the game clock, off the same minute counter the event log
  // stamps its entries with. The world starts at 10:00 on 1 January 2001.
  function _pairHour() {
    const mins = Number($gameVariables?.value(114)) || 0;
    return ((10 + Math.floor(mins / 60)) % 24 + 24) % 24;
  }

  // Every `situations` key that fits where the two of them are standing right
  // now, most specific first: what the sky is doing, then the place, then the
  // hour, then the state the party is in. Only keys the bank actually writes
  // lines for are used, so the list can grow in the JSON alone.
  function _pairSituationKeys() {
    const keys = [];
    const weather = window.$gameWeather?.currentWeatherType;
    if (weather === 'rain')  keys.push('rain');   // i18n-ignore: WeatherTypes value
    if (weather === 'storm') keys.push('storm');  // i18n-ignore: WeatherTypes value
    if (weather === 'snow')  keys.push('snow');   // i18n-ignore: WeatherTypes value

    let biome = '';
    try { biome = String($gameSystem?.getBiomeFromCache?.($gamePlayer?.x, $gamePlayer?.y) || ''); }
    catch (e) { biome = ''; }
    if (!biome || biome === 'Unknown') biome = String($gameSystem?._procGenData?.currentBiome || ''); // i18n-ignore: sentinel
    // i18n-ignore: biome ids, matched against Biomes.json keys
    const PLACE = [
      [/desert|dune|badland/i,          'desert'],
      [/forest|jungle|wood|taiga/i,     'forest'],
      [/mountain|peak|alpine|cliff/i,   'mountain'],
      [/beach|coast|shore/i,            'beach'],
      [/ocean|sea|lake|river|water/i,   'water'],
      [/swamp|marsh|bog|fen/i,          'swamp'],
      [/city|town|urban|village|road/i, 'town'],
      [/dungeon|crypt|sewer|cave|ruin/i,'underground'],
      [/space|station|orbit/i,          'space'],
      [/^alien/i,                       'alien'],
      [/snow|tundra|glacier|ice|arctic/i,'cold'],
    ];
    for (const [re, key] of PLACE) if (re.test(biome)) { keys.push(key); break; }
    if (window.isProceduralInteriorMap?.($gameMap?.mapId?.())) keys.push('indoors');
    if (window.WorldMapTransfer?.isWorldMap?.()) keys.push('worldmap');

    const hour = _pairHour();
    if (hour >= 23 || hour < 5)      keys.push('night');
    else if (hour < 8)               keys.push('dawn');
    else if (hour >= 20)             keys.push('evening');

    const leader = $gameParty?.leader?.();
    if (leader && leader.mhp > 0 && leader.hp / leader.mhp < 0.35) keys.push('hurt');
    if (($gameParty?.gold?.() ?? 0) < 500) keys.push('broke');
    return keys;
  }

  // The bond between the two of them is not an opinion and does not behave like
  // one. It is a single shared number, the same read from either side, it
  // starts where twelve years on the road left it, and it has NO ceiling: every
  // kind word, every jab and every hour spent in the same camper puts it up
  // again, forever. The one thing that has ever taken it down is Em asking him
  // the question he has to say no to (see the romance branch in
  // NPCEmpathizeUI.js). Kept on $gameSystem, so it belongs to the savegame.
  const PAIR_BOND_START = 92;

  function _pairBond() {
    if (!window.$gameSystem) return PAIR_BOND_START;
    if ($gameSystem._emBubbaBond == null) $gameSystem._emBubbaBond = PAIR_BOND_START;
    return $gameSystem._emBubbaBond;
  }
  function _addPairBond(delta) {
    const v = Math.round(_pairBond() + (Number(delta) || 0));
    // A floor and no ceiling: she can ask twice and still have a friend.
    if (window.$gameSystem) $gameSystem._emBubbaBond = Math.max(0, v);
    return Math.max(0, v);
  }

  // A line about the here and now, or '' when nothing fits. Not every meeting
  // gets one: the plain greetings would never be seen again if it did.
  const PAIR_SITUATION_CHANCE = 0.6;
  function _pairSituationLine(data) {
    const bank = data?.situations;
    if (!bank || Math.random() > PAIR_SITUATION_CHANCE) return '';
    const live = _pairSituationKeys().filter(k => (bank[k] || []).length);
    if (!live.length) return '';
    return _rand(bank[live[Math.floor(Math.random() * live.length)]]);
  }

  // ── Non-sentient party members (classes 63+) ────────────────────────────
  // A creature played as one of the creature classes , Feral, Mimic, Monster,
  // Mana Cyborg, Ghost, Zombie, Mutant, Drone (ids 63-70, the creatureClasses
  // rosters in js/db/Health/Archetypes.json) , holds no conversation. When
  // one of them is the party member doing the talking, the panel drops every
  // spoken action and offers what a beast can actually do: noises, contact and
  // teeth. Nobody talks BACK to it either; the NPC coos over it, backs away
  // from it or shoos it off depending on what they think of it. Copy lives in
  // js/i18n/<lang>/plugins/Empathize.json under the feral* keys.
  const NONSENTIENT_CLASS_MIN = 63;

  function _isNonSentientActor(actor) {
    if (!actor) return false;
    const id = actor.currentClass?.()?.id ?? actor._classId ?? 0;
    return id >= NONSENTIENT_CLASS_MIN;
  }

  // The same question asked of the other side of the conversation: is the NPC
  // being spoken TO a beast? Read off the society profile's class, which is
  // where NPCCreature wrote it when the settlement was populated.
  function _isNonSentientNpc(npcName) {
    const NC = window.NPCCreature;
    if (!NC || !npcName) return false;
    return NC.isNonSentientByName(npcName);
  }

  // What the NPC sees standing in front of them: the creature's archetype
  // ("Beast", "Spider / Humanoid" reads as its first half), falling back to the
  // class it is played as when it carries no anatomy.
  function _feralKind(actor) {
    if (!actor) return '';
    const HC = window.HealthCore;
    const stored = actor._currentArchetype;
    if (stored && HC?.getArchetypeDisplayName) {
      const first = String(stored).split('/')[0].trim();
      const name = first ? HC.getArchetypeDisplayName(first) : '';
      if (name) return name;
    }
    return actor.currentClass?.()?.name ?? '';
  }

  // How this NPC feels about the creature, in the four bands its lines are
  // written for. Opinion is the standing of the creature itself, since every
  // Empathize reaction is per party member.
  function _feralBand(opinion) {
    const o = Number(opinion) || 0;
    if (o <= -20) return 'Hostile';
    if (o < 15)   return 'Wary';
    if (o < 50)   return 'Warm';
    return 'Adoring';
  }

  // A line from the band's bank, with the NPC's name and the creature's kind
  // filled in. `prefix` is the bank family ('feralGreet' / 'feralReact').
  function _feralLine(prefix, opinion, npcName, kind) {
    const T = _getT();
    const line = _rand(T[prefix + _feralBand(opinion)] || []);
    if (!line) return '';
    return String(line)
      .replace(/\{name\}/g, npcName || '')
      .replace(/\{kind\}/g, kind || '');
  }

  // ── The eight voices ────────────────────────────────────────────────────
  // A growl belongs to a Feral and to nothing else. The other seven creature
  // classes are not animals and do not sound like one: a Mimic clacks, a Ghost
  // is barely a sound at all, a Drone answers in machine code. Each class has
  // its own syllable bank in js/i18n/<lang>/plugins/Empathize.json, and every
  // noise this panel makes is drawn from the bank of the class of whoever is
  // making it. An id with no bank of its own falls back to the Feral one, so
  // a roster that grows is never left mute.
  const CREATURE_VOICE_BANKS = {
    63: 'feralGrowlSyllables',      // Feral
    64: 'mimicClackSyllables',      // Mimic
    65: 'monsterRoarSyllables',     // Monster
    66: 'manaCyborgHumSyllables',   // Mana Cyborg
    67: 'ghostWhisperSyllables',    // Ghost
    68: 'zombieMoanSyllables',      // Zombie
    69: 'mutantGurgleSyllables',    // Mutant
    70: 'droneSignalSyllables',     // Drone
  };

  // Two of the eight do not make a NOISE at all. A Mana Cyborg and a Drone are
  // machines wearing a body: what comes back from them is a terminal's answer,
  // a short acknowledgement in a fixed register, not a growl. They draw whole
  // lines from their own bank (`botLines`) instead of syllables, and the line
  // is picked by the LENGTH of what was said to them, so a question gets a
  // longer readout than a greeting does.
  const CREATURE_BOT_BANKS = {
    66: 'manaCyborgBotLines',
    70: 'droneBotLines',
  };

  function _isBotClass(classId) {
    return !!CREATURE_BOT_BANKS[Number(classId)];
  }

  // One machine line for a class, chosen off `words` so the same input gets a
  // steady answer rather than a lottery. Empty when the bank is missing, which
  // every caller reads as "fall through to the syllables".
  function _botLine(classId, words) {
    const T = _getT();
    const bank = T[CREATURE_BOT_BANKS[Number(classId)]] || [];
    if (!bank.length) return '';
    const n = Math.max(0, Math.floor(Number(words) || 0));
    return String(bank[n % bank.length] || '');
  }

  // The creature class of a party member, of an NPC by name, or 0 for anything
  // that is a person.
  function _creatureClassOfActor(actor) {
    if (!actor) return 0;
    const id = actor.currentClass?.()?.id ?? actor._classId ?? 0;
    return _isNonSentientActor(actor) ? id : 0;
  }

  function _creatureClassOfNpc(npcName) {
    if (!_isNonSentientNpc(npcName)) return 0;
    if (typeof $gameParty !== 'undefined' && $gameParty) {
      const member = ($gameParty.members() || []).find(m => m && m.name() === npcName);
      if (member) return _creatureClassOfActor(member);
    }
    const profile = _getProfile(npcName);
    return Number(profile?.assignedClassId) || 0;
  }

  // What a typed sentence comes out as. The player still writes words, the
  // creature still has no mouth for them: the length of what was typed decides
  // how long the noise is, and the noise itself is drawn from the bank its
  // CLASS answers in.
  function _feralGrowlFor(phrase, classId) {
    const words = String(phrase || '').trim().split(/\s+/).filter(Boolean).length;
    const bot = _isBotClass(classId) ? _botLine(classId, words) : '';
    if (bot) return bot;
    const noise = _feralNoise(Math.round(words / 2) || 1, classId);
    return noise || String(phrase || '');
  }

  // `count` syllables off the class's bank, as one capitalized noise. Empty
  // when the bank is missing, which every caller reads as "leave the words
  // alone".
  function _feralNoise(count, classId) {
    const bot = _isBotClass(classId) ? _botLine(classId, count) : '';
    if (bot) return bot;
    const T = _getT();
    const key = CREATURE_VOICE_BANKS[Number(classId)] || CREATURE_VOICE_BANKS[63];
    const bank = T[key] || T.feralGrowlSyllables || [];
    if (!bank.length) return '';
    const n = Math.max(1, Math.min(6, Number(count) || 1));
    const out = [];
    for (let i = 0; i < n; i++) out.push(_rand(bank));
    const text = out.join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // The Markov chain is seeded with what the player typed and therefore opens by
  // repeating it back word for word. Nobody answers a question by reciting it,
  // so the echo is cut off the front of the reply and only what the chain added
  // of its own is spoken. Words are compared loosely (case and punctuation are
  // rewritten by the generator, which capitalizes the first word and closes the
  // last), and a reply left with nothing of its own is refused so the caller
  // falls back to an unseeded line.
  function _stripSeedEcho(response, seed) {
    const norm  = w => String(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const words = String(response || '').trim().split(/\s+/).filter(Boolean);
    const seedW = String(seed || '').trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && i < seedW.length && norm(words[i]) === norm(seedW[i])) i++;
    // Nothing was echoed: the chain bridged away from the seed on its own.
    if (!i) return String(response || '');
    const rest = words.slice(i);
    if (rest.length < 3) return '';
    rest[0] = rest[0].charAt(0).toUpperCase() + rest[0].slice(1);
    return rest.join(' ');
  }

  // The only presents a creature understands to hand over: something to eat,
  // or a piece of something that used to be alive.
  const FERAL_GIFT_CATEGORIES = new Set(['food', 'bodypart']); // i18n-ignore: <category:> tag values

  function _feralCanGift(item) {
    const raw = window.ItemSystemUtils?.getRawCategoryFromNote?.(item)
      ?? (String(item?.note || '').match(/<category:\s*(\w+)>/i) || [])[1];
    return FERAL_GIFT_CATEGORIES.has(String(raw || '').toLowerCase());
  }

  // The noises and nudges a non-sentient member has instead of conversation.
  // `op` is what it costs or earns them; `bank` is the creature's own line.
  const FERAL_ACTIONS = [
    { id: 'growl',  op:  -6, bank: 'feralActGrowl'  },
    { id: 'roar',   op: -10, bank: 'feralActRoar'   },
    { id: 'drool',  op:  -2, bank: 'feralActDrool'  },
    { id: 'sniff',  op:   1, bank: 'feralActSniff'  },
    { id: 'nuzzle', op:   6, bank: 'feralActNuzzle' },
    { id: 'beg',    op:   3, bank: 'feralActBeg'    },
  ];
  const FERAL_ACTION_IDS = new Set(FERAL_ACTIONS.map(a => a.id));

  // ── Petting and feeding a beast ─────────────────────────────────────────
  // The other side of the same rule: what a non-sentient NPC understands being
  // done to it. It is not socialised with and not bargained with, it is
  // touched and it is fed.
  //
  // A hand laid on an animal that has let you near it is always welcome, so
  // petting is the one move in the panel with no band, no roll and no way of
  // going wrong.
  const PET_OPINION = 5;

  // Feeding is judged by what is in the bowl. Cooked food does the animal good
  // in proportion to its calories, raw meat is swallowed without thanks, and a
  // piece of something that used to be alive is worse still: neither is what a
  // creature living among people has learned to expect off a hand.
  const FEED_RAW_MEAT_ID      = 862;        // i18n-ignore: Items.json entry id
  const FEED_FOOD_CATEGORY    = 'food';     // i18n-ignore: <category:> tag value
  const FEED_ORGANIC_CATEGORY = 'bodypart'; // i18n-ignore: <category:> tag value
  const FEED_RAW_OPINION      = -3;
  const FEED_ORGANIC_OPINION  = -5;

  function _itemCategory(item) {
    const raw = window.ItemSystemUtils?.getRawCategoryFromNote?.(item)
      ?? (String(item?.note || '').match(/<category:\s*(\w+)>/i) || [])[1];
    return String(raw || '').toLowerCase();
  }

  function _feedCalories(item) {
    const m = String(item?.note || '').match(/<calories:\s*(\d+)>/i);
    return m ? Number(m[1]) : 0;
  }

  // Which of the three things in the bowl this is: 'food', 'raw' (butchered
  // meat off the crafting shelf) or 'organic' (an organ, a limb, a piece of
  // somebody). Anything else is not food to an animal and is not offered.
  function _feedKind(item) {
    if (!item || item.itypeId !== 1) return '';
    if (item.id === FEED_RAW_MEAT_ID) return 'raw';
    const cat = _itemCategory(item);
    if (cat === FEED_FOOD_CATEGORY)    return 'food';
    if (cat === FEED_ORGANIC_CATEGORY) return 'organic';
    return '';
  }

  // What one mouthful is worth to the animal's opinion of the hand feeding it.
  function _feedOpinion(item) {
    switch (_feedKind(item)) {
      case 'food':    return Math.max(2, Math.min(20, Math.round(_feedCalories(item) / 40)));
      case 'raw':     return FEED_RAW_OPINION;
      case 'organic': return FEED_ORGANIC_OPINION;
      default:        return 0;
    }
  }

  // And what it is worth to the animal's stomach, which is a separate question:
  // offal it resents is still a meal it no longer needs.
  function _feedNourishment(item) {
    switch (_feedKind(item)) {
      case 'food':    return Math.max(5, Math.min(40, Math.round(_feedCalories(item) / 10)));
      case 'raw':     return 15;
      case 'organic': return 10;
      default:        return 0;
    }
  }

  function _feedItemsInPack() {
    return ($gameParty?.items() ?? []).filter(i => _feedKind(i));
  }

  // ── Per-actor NPC reputation ────────────────────────────────────────────
  // Each party member earns their OWN standing with a given NPC, stored in
  // profile.opinions[actorId]. profile.playerOpinion stays as the party-wide
  // baseline the rest of the NPC sim consumes (conversation, decay, politics)
  // and seeds each per-actor value the first time it is touched.
  // The key a party member's standing is filed under. An actor id alone will
  // not do: actor 2 is a different person in every savegame of the world, and
  // the profiles these are written into are world-shared (npcs.json), so three
  // playthroughs were all writing their second member's reputation into one
  // slot and reading each other's. The key names the playthrough as well
  // (p<slot>a<actorId>, NPCSystem.js), so each member has a standing of their
  // own that survives in the world folder whether that savegame is the one
  // being played or not. A playthrough with no slot yet (the sandbox, a party
  // before its first save) falls back to the bare actor id, which is exactly
  // what it used to be.
  function _opinionKey(actorId) {
    if (actorId == null) return null;
    const VP = window.PartyPresence;
    const slot = VP && typeof VP.currentSlot === 'function' ? VP.currentSlot() : 0;
    return slot > 0 ? VP.memberKey(slot, actorId) : String(actorId);
  }
  function _npcBaseOpinion(profile, actorId) {
    if (!profile) return 0;
    const map = profile.opinions;
    if (map) {
      const key = _opinionKey(actorId);
      if (key != null && map[key] != null) return map[key];
      // A standing earned before the key named the playthrough. Read it once
      // more so nobody's reputation resets the day this is installed; the next
      // write files it under the new key.
      if (map[actorId] != null) return map[actorId];
    }
    return profile.playerOpinion ?? 0;
  }
  function _setNpcBaseOpinion(profile, actorId, value) {
    if (!profile || actorId == null) return 0;
    const v = Math.max(-100, Math.min(100, Math.round(value)));
    // Becoming somebody's friend or somebody's enemy is a thing that happened
    // to a party member, so the party diary hears about the crossing (Diary.js).
    if (window.Diary) window.Diary.onOpinionChanged(profile, actorId, _npcBaseOpinion(profile, actorId), v);
    const key = _opinionKey(actorId);
    (profile.opinions ??= {})[key] = v;
    // The legacy entry is dropped as it is superseded, so one member's
    // standing is never held in two places at once.
    if (key !== String(actorId) && profile.opinions[actorId] != null) {
      delete profile.opinions[actorId];
    }
    // The same standing, filed the other way round: what this member thinks of
    // that person, in the world folder rather than in the savegame, so a
    // playthrough's whole social record outlives the savegame that earned it
    // (party.json -> dispositions).
    // Somebody else's party member is filed under their member key rather than
    // their name, so the map reads member to member across playthroughs: two
    // parties that have met each other in a world know what they thought.
    const VP = window.PartyPresence;
    if (VP && typeof VP.setDisposition === 'function' && key !== String(actorId)) {
      const toward = profile._visitorKey || profile._npcName || null;
      if (toward) VP.setDisposition(key, toward, v);
    }
    return v;
  }

  // ── Company: the social meter follows the opinion ────────────────────────
  // Every Empathize action that moves an NPC's opinion is also time spent in
  // company, and the whole party is standing there for it: a move that lands
  // well feeds everyone's social need, one that lands badly costs them. The
  // member doing the talking is the one who actually had the exchange, so they
  // take slightly more of it either way. Reported through the same
  // ParchmentToast.need popup the minigames use for Fun.
  const SOCIAL_PER_OPINION  = 2.2;  // social points per point of opinion moved
  const SOCIAL_LOSS_FACTOR  = 0.32; // a move that lands badly costs what it always did
  const SOCIAL_MAX_STEP     = 30;   // no single exchange is worth more than this
  const SOCIAL_TALKER_BONUS = 1.4;
  // Being with people is worth something on its own, whatever it did to their
  // opinion, so every exchange also pays a flat base: a trade, a bandage or a
  // question that moves no needle still counts as company. The base thins out
  // over the day with the SAME person and stops after SOCIAL_COMPANY_LIMIT
  // exchanges, so one obliging neighbour cannot be farmed for a full meter.
  const SOCIAL_COMPANY_BASE  = 6;
  const SOCIAL_COMPANY_LIMIT = 6;
  // The actions whose whole effect is elsewhere (a shop, a heal, a signpost),
  // so nothing else would ever pay them their company.
  const COMPANY_ACTIONS = new Set(['trade', 'treat', 'directions', 'buyHouse', 'cardTrade']);

  // ── Cards ───────────────────────────────────────────────────────────────
  // Nobody sits down at a table with somebody who cannot stand them, and
  // nobody swaps a collection with them either. The line they refuse with is
  // their own: a header naming what was turned down, plus the sentence their
  // personality would actually say (Empathize.cardRefuseTone.<personality>).
  const CARD_REFUSE_OPINION = -15;

  function _cardRefusalLine(profile, npcName, kind) {
    const T = _getT();
    const head = kind === 'duel'
      ? T('Empathize.cardRefuseDuel', { name: npcName })
      : T('Empathize.cardRefuseTrade', { name: npcName });
    const persona = String(_personalityName(profile) || '').toLowerCase();
    const key = 'Empathize.cardRefuseTone.' + persona;
    const tone = (persona && window.T.has(key)) ? T(key) : T('Empathize.cardRefuseTone.default');
    return `${head} ${tone}`;
  }

  // What one more exchange with this NPC is worth as company today, spending it
  // off their daily allowance as it is read.
  function _companyBase(profile) {
    const day  = Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    const host = profile || $gameSystem; // wiki / party pages share one record
    if (!host) return SOCIAL_COMPANY_BASE;
    if (host._socialCompany?.day !== day) host._socialCompany = { day, count: 0 };
    const used = host._socialCompany.count++;
    if (used >= SOCIAL_COMPANY_LIMIT) return 0;
    return Math.max(1, Math.round(SOCIAL_COMPANY_BASE * (1 - used / SOCIAL_COMPANY_LIMIT)));
  }

  function _socialStep(value) {
    const v = Math.max(-SOCIAL_MAX_STEP, Math.min(SOCIAL_MAX_STEP, value));
    return v > 0 ? Math.max(1, Math.round(v)) : Math.min(-1, Math.round(v));
  }

  // Company is paid silently. Talking to somebody is what the meter is FOR, so
  // a popup on every exchange would be a popup on every line of dialogue: the
  // bar moves, the conversation carries on, and nothing interrupts it.
  function _paySocial(actorId, step) {
    if (!step || !window.PartyNeeds?.addSocialToAll) return;
    const focus = ($gameParty?.members() ?? []).find(m => m && m.actorId() === actorId) || null;
    window.PartyNeeds.addSocialToAll(step, { focus, focusBonus: SOCIAL_TALKER_BONUS });
  }

  // Company on its own, for the actions that never touch an opinion: haggling,
  // wounds patched up, asking the way, a line typed into the chat box.
  function _gainSocialFromCompany(actorId, profile) {
    _paySocial(actorId, _companyBase(profile));
  }

  function _gainSocialFromOpinion(actorId, delta, profile) {
    if (!window.PartyNeeds?.addSocialToAll) return;
    const moved = delta > 0 ? delta * SOCIAL_PER_OPINION
      : delta < 0 ? delta * SOCIAL_PER_OPINION * SOCIAL_LOSS_FACTOR
      : 0;
    // An exchange that went badly is not company, it is a scene: no base for it.
    const base = delta >= 0 ? _companyBase(profile) : 0;
    const step = base + (moved ? _socialStep(moved) : 0);
    _paySocial(actorId, Math.max(-SOCIAL_MAX_STEP, Math.min(SOCIAL_MAX_STEP, Math.round(step))));
  }

  // ── Fun: the moves that are entertainment, not just company ──────────────
  // Most of the Socialize catalog is contact: it feeds the social meter and
  // moves an opinion. A few of the options are ENTERTAINMENT - a joke that
  // lands, a story or a poem that holds the room, gossip worth hearing - and
  // those pay the Fun (leisure) meter as well, on BOTH sides of the exchange:
  // the party member who performed, and the NPC who was performed to
  // (profile.leisure, the same 0-100 field the society sim drains in
  // NPCSimulationCore.js).
  //
  // Only a move that actually LANDED pays. A joke that flops, a poem the NPC
  // sat through with a flat face (delta <= 0) is not fun for anybody, and the
  // repetition fatigue already baked into the delta means the fourth telling
  // of the same routine is worth less than the first. The weight is how
  // entertaining the move is at its best; the amount then follows how well it
  // actually went, so a story that lands beats a chuckle.
  const FUN_ACTIONS      = { joke: 1, story: 1.1, poem: 0.9, gossip: 0.6 };
  const FUN_PER_OPINION  = 1.6;  // fun points per point of opinion the move moved
  const FUN_MIN_STEP     = 2;
  const FUN_MAX_STEP     = 18;
  const FUN_TALKER_BONUS = 1.5;  // whoever told it enjoyed telling it
  const FUN_NPC_SHARE    = 1.2;  // the audience gets a little more than the party
  const FUN_DAILY_LIMIT  = 5;    // per NPC: an act only stays funny so many times

  // How much of today's amusement this NPC has left in them, spent as it is
  // read. Same shape as the company allowance above: the fifth performance of
  // the day lands on somebody who has already had their fill.
  function _funAllowance(profile) {
    const day  = Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    const host = profile || $gameSystem;
    if (!host) return 1;
    if (host._funShared?.day !== day) host._funShared = { day, count: 0 };
    const used = host._funShared.count++;
    if (used >= FUN_DAILY_LIMIT) return 0;
    return 1 - used / FUN_DAILY_LIMIT;
  }

  // Pay the Fun meter for one entertainment move that landed. Returns what was
  // paid (0 when the move was not entertainment, did not land, or the NPC has
  // laughed enough today), so the caller can label the exchange with it.
  function _payFun(actorId, profile, npcName, id, delta) {
    const weight = FUN_ACTIONS[id];
    if (!weight || delta <= 0) return 0;
    const taper = _funAllowance(profile);
    if (taper <= 0) return 0;
    const raw  = Math.max(FUN_MIN_STEP, delta * FUN_PER_OPINION * weight);
    const step = Math.round(Math.min(FUN_MAX_STEP, raw) * taper);
    if (step <= 0) return 0;

    // The party: everyone standing there heard it, the performer most of all.
    if (window.PartyNeeds?.addLeisureToAll) {
      const focus = ($gameParty?.members() ?? []).find(m => m && m.actorId() === actorId) || null;
      window.PartyNeeds.addLeisureToAll(step, { focus, focusBonus: FUN_TALKER_BONUS });
    }
    // The NPC: the field the sim drains, so a bored resident who was told a
    // good joke is measurably less bored for the rest of the day.
    if (profile) {
      profile.leisure = Math.max(0, Math.min(100,
        Math.round((profile.leisure ?? 100) + step * FUN_NPC_SHARE)));
    }
    try {
      const T = _getT();
      window.ParchmentToast?.need('leisure', step, { note: T('Empathize.funShared', { name: npcName }) });
    } catch (e) { /* a popup never breaks a conversation */ }
    return step;
  }

  function _addNpcOpinion(profile, actorId, delta) {
    _gainSocialFromOpinion(actorId, delta, profile);
    return _setNpcBaseOpinion(profile, actorId, _npcBaseOpinion(profile, actorId) + delta);
  }
  // What the NPC actually thinks of one actor: earned base + trait
  // compatibility + how the two of them smell to each other right now. The
  // hygiene term is the only part of this that changes with a bath.
  function _npcEffectiveOpinion(profile, actor) {
    if (!actor) return 0;
    return Math.max(-100, Math.min(100,
      _npcBaseOpinion(profile, actor.actorId())
      + _traitCompatBonus(profile, actor)
      + _hygienePenalty(profile, actor)));
  }

  function _computePartyPredisposition(profile) {
    return ($gameParty?.members() ?? []).map(actor => ({
      actor,
      score: _npcEffectiveOpinion(profile, actor),
    }));
  }

  // ── Per-actor romantic attraction ────────────────────────────────────────
  // How drawn this NPC is to a given party member, tracked apart from general
  // disposition: liking someone and wanting them are not the same number.
  // Ordinary conversation, gifts, trade and every other exchange still move
  // opinion alone; only a Court move (and a Propose) touches this ledger,
  // keyed the same way opinion is (profile.attraction[key], see _opinionKey).
  // There is no player-wide baseline to fall back on the way opinion has
  // profile.playerOpinion: attraction starts at 0 and is earned or lost.
  function _npcBaseAttraction(profile, actorId) {
    if (!profile) return 0;
    const map = profile.attraction;
    if (map) {
      const key = _opinionKey(actorId);
      if (key != null && map[key] != null) return map[key];
      if (map[actorId] != null) return map[actorId];
    }
    return 0;
  }
  function _setNpcBaseAttraction(profile, actorId, value) {
    if (!profile || actorId == null) return 0;
    const v = Math.max(-100, Math.min(100, Math.round(value)));
    const key = _opinionKey(actorId);
    (profile.attraction ??= {})[key] = v;
    if (key !== String(actorId) && profile.attraction[actorId] != null) {
      delete profile.attraction[actorId];
    }
    return v;
  }
  function _addNpcAttraction(profile, actorId, delta) {
    _gainSocialFromOpinion(actorId, delta, profile);
    return _setNpcBaseAttraction(profile, actorId, _npcBaseAttraction(profile, actorId) + delta);
  }
  // What the NPC actually feels. Attraction carries none of opinion's trait
  // compatibility or hygiene terms of its own, courting already applies both
  // of those to the CHANCE a move lands (NPCEmpathizeUI.js, _romanceChance),
  // so folding them in here a second time would double-count them.
  function _npcEffectiveAttraction(profile, actor) {
    if (!actor) return 0;
    return Math.max(-100, Math.min(100, _npcBaseAttraction(profile, actor.actorId())));
  }

  function _computePartyAttraction(profile) {
    return ($gameParty?.members() ?? []).map(actor => ({
      actor,
      score: _npcEffectiveAttraction(profile, actor),
    }));
  }

  // Retained for API compatibility; interaction logic now targets the focused
  // actor's own reputation instead of a party-wide median.
  function _medianScore(preds) {
    if (!preds.length) return 0;
    const sorted = preds.map(p => p.score).sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }

  function _generatePartyThoughts(actor, _profile) {
    const thoughts = [];
    const hp     = Math.round((actor.hpRate?.() ?? 1) * 100);
    const hunger = actor.hungerPercent?.() ?? 100;
    const sleep  = actor.sleepPercent?.()  ?? 100;
    if (hp     < 30) thoughts.push(T('Empathize.partyThought.hurt'));
    if (hunger < 25) thoughts.push(T('Empathize.partyThought.hungry'));
    if (sleep  < 25) thoughts.push(T('Empathize.partyThought.tired'));
    if (!thoughts.length) thoughts.push(T('Empathize.partyThought.idle'));
    return thoughts;
  }

  // ============================================================================
  // SECTION 4, INPUT PASSTHROUGH PATCH
  // ============================================================================

  const _Input_shouldPreventDefault_base = Input._shouldPreventDefault;
  Input._shouldPreventDefault = function (keyCode) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    return _Input_shouldPreventDefault_base.call(this, keyCode);
  };

  // ============================================================================
  // SECTION 5, SCENE RESUME HOOK
  // ============================================================================

  const _Scene_Map_update_dlg = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_dlg.call(this);
    if ($gameTemp._NPCEmpathizeReturnEvId != null) {
      const _safeEvId = $gameTemp._NPCEmpathizeReturnEvId;
      // Deferred tidy-up of the event the panel was launched from. The launch
      // event's paused interpreter and its starting flag were already cleared
      // synchronously in _releaseEventLock, so this pass exists ONLY to release a
      // lock that nothing else will ever release (a panel closed by an unusual
      // path).
      //
      // It must never clear _starting. This runs at the END of Scene_Map.update,
      // i.e. AFTER player input has been processed, so any _starting flag standing
      // here belongs to a BRAND NEW interaction the player just began, never to
      // the closed panel. Plenty of code queues a start without consuming it in
      // the same frame (a world-map Teleport, an event-touch trigger, a start
      // queued behind another starting event, the sit-mode re-check), and the
      // engine picks all of those up in Game_Map.updateInterpreter on the next
      // frame. Wiping the flag here is what made an NPC, or the next NPC walked
      // up to, silently refuse to talk right after the panel closed. The engine
      // can never be wedged by a stray _starting either: setupStartingMapEvent
      // consumes one every single frame, so leaving it alone is always safe.
      //
      // The lock is only released on a quiet frame (no interpreter running,
      // nothing starting), so the lock let go of is never one belonging to a
      // conversation that is live right now.
      const _interp = $gameMap?._interpreter;
      const _quiet  = !!$gameMap && !_interp?.isRunning() && !$gameMap.isAnyEventStarting();
      if (_quiet) {
        const _ev = $gameMap.event(_safeEvId);
        if (_ev && _ev._locked) _ev.unlock();
        $gameTemp._NPCEmpathizeReturnEvId     = null;
        $gameTemp._NPCEmpathizeReturnFrames   = 0;
      } else {
        // Someone is talking. Give them room, but give up before the id goes
        // stale: NPCSystem recycles event slots, so an id held too long stops
        // meaning the NPC the panel was opened on.
        $gameTemp._NPCEmpathizeReturnFrames = ($gameTemp._NPCEmpathizeReturnFrames ?? 0) + 1;
        if ($gameTemp._NPCEmpathizeReturnFrames > 120) {
          $gameTemp._NPCEmpathizeReturnEvId   = null;
          $gameTemp._NPCEmpathizeReturnFrames = 0;
        }
      }
    }
    if ($gameTemp._NPCEmpathizeTalkId != null) {
      const evId = $gameTemp._NPCEmpathizeTalkId;
      $gameTemp._NPCEmpathizeTalkId = null;
      $gameTemp._NPCEmpathizeBypass = true;
      try { $gameMap.event(evId)?.start(); }
      catch (e) { console.error('[NPCEmpathize] resume Talk failed', evId, e); }
    }
    if ($gameTemp._NPCEmpathizeOpenTrade) {
      const { goods, sellFactor } = $gameTemp._NPCEmpathizeOpenTrade;
      $gameTemp._NPCEmpathizeOpenTrade = null;
      $gameTemp._npcTradeSellFactor    = sellFactor;
      SceneManager.push(Scene_Shop);
      SceneManager.prepareNextScene(goods, false);
    }
    // The card table is handed over the same way the shop is: the panel closes
    // first and the duel opens from the map, so the overlay is never left
    // hanging behind a scene it does not own.
    if ($gameTemp._NPCEmpathizeOpenCardDuel) {
      const config = $gameTemp._NPCEmpathizeOpenCardDuel;
      $gameTemp._NPCEmpathizeOpenCardDuel = null;
      if (window.CardDuel) window.CardDuel.start(config);
    }
    if ($gameTemp._NPCEmpathizeStartBattle != null) {
      const troopId = $gameTemp._NPCEmpathizeStartBattle;
      const victim  = $gameTemp._NPCEmpathizeAttackTarget;
      const face    = $gameTemp._NPCEmpathizeAttackFace;
      $gameTemp._NPCEmpathizeStartBattle  = null;
      $gameTemp._NPCEmpathizeAttackTarget = null;
      $gameTemp._NPCEmpathizeAttackFace   = null;
      BattleManager.setup(troopId, true, false);
      // Armed after setup on purpose: the setup hook in SECTION 5b clears both
      // markers, so a battle begun any other way can never inherit this victim
      // or wear their face.
      $gameTemp._NPCEmpathizeBattleTarget = victim ?? null;
      $gameTemp._NPCEmpathizeBattleFace   = face ?? null;
      SceneManager.push(Scene_Battle);
    }
  };

  // ============================================================================
  // SECTION 5b, OUTCOME OF AN ATTACKED NPC
  // ============================================================================
  // Killing the NPC the player set on from the panel flips that event's self
  // switch A, the same page swap a recruited NPC gets, so the map author decides
  // what is left standing there (a corpse page, an empty one, nothing). Only a
  // kill counts: fleeing the fight, or being beaten by them, leaves the NPC and
  // their page exactly as they were.

  const _BattleManager_setup_npcAttack = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    if ($gameTemp) {
      $gameTemp._NPCEmpathizeBattleTarget = null;
      $gameTemp._NPCEmpathizeBattleFace   = null;
    }
    _BattleManager_setup_npcAttack.call(this, troopId, canEscape, canLose);
  };

  const _BattleManager_processVictory_npcAttack = BattleManager.processVictory;
  BattleManager.processVictory = function () {
    const victim = $gameTemp?._NPCEmpathizeBattleTarget;
    if (victim) {
      $gameTemp._NPCEmpathizeBattleTarget = null;
      // A win is not always a kill: an enemy that runs off leaves the troop
      // with nobody alive in it and still ends the fight in victory. Bodies
      // only, so an NPC who got away is still there to be found.
      const troop  = $gameTroop?.members() ?? [];
      const killed = troop.length > 0 && troop.every(e => e.hp <= 0);
      if (killed && $gameSelfSwitches) {
        $gameSelfSwitches.setValue([victim.mapId, victim.eventId, 'A'], true);
        if ($gameMap?.mapId() === victim.mapId) $gameMap.event(victim.eventId)?.refresh();
        // A death is the world's, not this savegame's: recorded in the world
        // folder so the body stays where it fell in every playthrough of it
        // (NPCSystem.js, GoneRegistry).
        window.NPCGone?.record(victim.mapId, victim.eventId, victim.name, 'killed');
      }
    }
    _BattleManager_processVictory_npcAttack.call(this);
  };

  // ============================================================================
  // SECTION 5c, THE NPC'S OWN FACE IN THE FIGHT
  // ============================================================================
  // A fight picked from the panel is against somebody the player was just
  // looking at, not against the generic battler the troop happens to hold, so
  // the enemy's own graphic is stood down and the NPC is drawn in its place,
  // standing ON the bottom edge of the screen with nothing under them:
  //   3D battlers (and plain 2D)  ->  the bust the panel was showing.
  //   Sprite battlers             ->  their walking sprite off the map.
  // The portrait is a sibling of the battler sprites inside the battle field,
  // the same place damage popups and battle animations live, and those are
  // positioned from the (hidden) enemy sprite, so they still land on the NPC.

  const FACE_MAX_W    = 0.55; // a bust may take this much of the screen width
  const FACE_MAX_H    = 0.95; // ...and this much of its height
  const FACE_SPRITE_H = 0.60; // a walking sprite is blown up to this much of it
  const FACE_FADE     = 12;   // opacity step of the fade in / death fade
  const FACE_PATTERNS = [0, 1, 2, 1];
  const FACE_PAT_WAIT = 15;   // frames per walking-sprite pattern

  // Sprites mode (enemyBattlers === 2), with the legacy flag honoured for
  // configs written before the option became a three-way.
  function _isSpriteBattlerMode() {
    if (typeof ConfigManager === 'undefined') return false;
    return ConfigManager.enemyBattlers === 2 || !!ConfigManager.charBasedSprites;
  }

  // Clickable, because the enemy sprite it stands in for is hidden and mouse
  // targeting goes through the sprite the pointer is over.
  class Sprite_NPCBattleFace extends Sprite_Clickable {
    constructor(face, battler, enemySprite) {
      super();
      this._face        = face;
      this._battler     = battler;
      this._enemySprite = enemySprite || null;
      this._charMode    = _isSpriteBattlerMode() && !!face.charName;
      this._laidOut     = false;
      this._pattern     = 0;
      this._patternWait = 0;
      this._selectCount = 0;
      this._fellBack    = false;
      this.anchor.x = 0.5;
      this.anchor.y = 1;   // the image hangs off its own bottom edge
      this.opacity  = 0;
      this.bitmap   = this._charMode
        ? ImageManager.loadCharacter(this._face.charName)
        : ImageManager.loadBitmap('img/busts/', this._face.bust);
    }

    // Size once the bitmap is in: a bust is fitted to the screen, a walking
    // sprite is blown up by a whole number so its pixels stay square.
    _layout() {
      const bmp = this.bitmap;
      if (!bmp || !bmp.isReady() || !bmp.width || !bmp.height) return false;
      if (this._charMode) {
        const big = ImageManager.isBigCharacter(this._face.charName);
        this._pw  = bmp.width  / (big ? 3 : 12);
        this._ph  = bmp.height / (big ? 4 : 8);
        this._blockX = big ? 0 : (this._face.charIndex % 4) * 3;
        this._blockY = big ? 0 : Math.floor(this._face.charIndex / 4) * 4;
        const k = Math.max(2, Math.floor((Graphics.height * FACE_SPRITE_H) / this._ph));
        this.scale.x = this.scale.y = k;
        this._drawW  = this._pw * k;
        this._setPatternFrame();
      } else {
        const k = Math.min((Graphics.width  * FACE_MAX_W) / bmp.width,
                           (Graphics.height * FACE_MAX_H) / bmp.height);
        this.scale.x = this.scale.y = k;
        this._drawW  = bmp.width * k;
        this.setFrame(0, 0, bmp.width, bmp.height);
      }
      return true;
    }

    // Facing down, the way the player was looking at them a moment ago.
    _setPatternFrame() {
      this.setFrame((this._blockX + FACE_PATTERNS[this._pattern]) * this._pw,
                    this._blockY * this._ph, this._pw, this._ph);
    }

    _updatePattern() {
      if (++this._patternWait < FACE_PAT_WAIT) return;
      this._patternWait = 0;
      this._pattern = (this._pattern + 1) % FACE_PATTERNS.length;
      this._setPatternFrame();
    }

    // Bottom edge flush with the bottom of the screen, held over the enemy
    // sprite's column so popups and animations keep meeting the portrait, and
    // clamped so no part of it runs off the side.
    _place() {
      const field = this.parent;
      const fx    = field ? field.x : 0;
      const fy    = field ? field.y : 0;
      const half  = (this._drawW || 0) / 2;
      const x     = this._enemySprite ? this._enemySprite.x : (Graphics.width / 2 - fx);
      const min   = half - fx;
      const max   = Graphics.width - half - fx;
      this.x = max > min ? Math.min(Math.max(x, min), max) : x;
      this.y = Graphics.height - fy;
    }

    _updateOpacity() {
      const gone = !this._battler || this._battler.isDead() || !this._battler.isAppeared();
      this.opacity = gone
        ? Math.max(0,   this.opacity - FACE_FADE)
        : Math.min(255, this.opacity + FACE_FADE);
    }

    // The drawn frame, in the sprite's own unscaled coordinates. The inherited
    // test reads this.width, which PIXI reports already multiplied by the scale
    // the portrait is blown up by, and would answer for a rectangle several
    // times too big.
    hitTest(x, y) {
      const w = this._charMode ? (this._pw || 0) : (this.bitmap?.width  || 0);
      const h = this._charMode ? (this._ph || 0) : (this.bitmap?.height || 0);
      return x >= -w / 2 && x < w / 2 && y >= -h && y < 0;
    }

    onMouseEnter() { $gameTemp.setTouchState(this._battler, 'select'); }
    onPress()      { $gameTemp.setTouchState(this._battler, 'select'); }

    // The blink the enemy sprite would have shown while it is the chosen target.
    _updateSelection() {
      if (this._battler?.isSelected?.()) {
        this._selectCount++;
        this.setBlendColor(this._selectCount % 30 < 15 ? [255, 255, 255, 64] : [0, 0, 0, 0]);
      } else if (this._selectCount > 0) {
        this._selectCount = 0;
        this.setBlendColor([0, 0, 0, 0]);
      }
    }

    update() {
      super.update();
      // A dossier can name a bust that was never drawn; fall back to the
      // house portrait rather than leaving an empty rectangle standing there.
      if (!this._fellBack && !this._charMode && this.bitmap?.isError?.()) {
        this._fellBack = true;
        this.bitmap = ImageManager.loadBitmap('img/busts/', '7');
        return;
      }
      if (!this._laidOut) {
        if (!this._layout()) return;
        this._laidOut = true;
      } else if (this._charMode) {
        this._updatePattern();
      }
      this._place();
      this._updateOpacity();
      this._updateSelection();
    }
  }

  const _Spriteset_Battle_createEnemies_face = Spriteset_Battle.prototype.createEnemies;
  Spriteset_Battle.prototype.createEnemies = function () {
    _Spriteset_Battle_createEnemies_face.call(this);
    this._npcFaceSprite  = null;
    this._npcFaceBattler = null;
    const face = $gameTemp?._NPCEmpathizeBattleFace;
    if (!face) return;
    // The panel fights one person, the first member of the troop it set up.
    const battler = $gameTroop.members()[0];
    if (!battler) return;
    const src = (this._enemySprites || []).find(s => s && (s._battler || s._enemy) === battler);
    const sprite = new Sprite_NPCBattleFace(face, battler, src);
    this._battleField.addChild(sprite);
    this._npcFaceSprite  = sprite;
    this._npcFaceBattler = battler;
  };

  const _Spriteset_Battle_update_face = Spriteset_Battle.prototype.update;
  Spriteset_Battle.prototype.update = function () {
    _Spriteset_Battle_update_face.call(this);
    if (!this._npcFaceSprite) return;
    // Kept down rather than hidden once: the battler graphic reloads itself
    // whenever the enemy's image changes, and 3D mode can hand a sprite back.
    const src = this._npcFaceSprite._enemySprite;
    if (src && !src._hidden) src.hide();
    // 3D mode builds its model a tick into the battle. The NPC wears their own
    // face instead, so the model comes straight back off the field the frame it
    // appears.
    const sc3d = this._battle3DScene;
    if (sc3d && !sc3d._disposed && sc3d.getModel) {
      const idx = $gameTroop.members().indexOf(this._npcFaceBattler);
      if (idx >= 0 && sc3d.getModel(`enemy_${idx}`)) sc3d.removeModel(`enemy_${idx}`);
    }
  };

  // ============================================================================
  // SECTION 6, INPUT MANAGER
  // ============================================================================

  // How far one arrow / d-pad press scrolls a tab that has nothing to select,
  // and how fast a fully pushed right stick scrolls, in pixels per frame.
  const SCROLL_KEY_STEP  = 64;
  const STICK_SPEED      = 26;
  const STICK_DEADZONE   = 0.15;
  const TRIGGER_SPEED    = 26;
  const TRIGGER_DEADZONE = 0.15;
  // Standard-mapping index of the pad's Select / Back button, which changes who
  // in the party is doing the talking. Input.gamepadMapper has no action on it
  // at all, so it is read raw through AnalogStickInput (the same route the
  // right stick and the triggers take below).
  const PAD_SELECT_BUTTON = 8;

  const NPCEmpathizeInputManager = {
    _scene: null, _active: false,
    // Last pad-present state the tab-bar hint chip was drawn for; null forces
    // the first sync.
    _hintPad: null,

    activate(scene)  { this._scene = scene; this._active = true; this._hintPad = null; },
    deactivate()     { this._active = false; this._scene = null; this._hintPad = null; },

    // The chip in front of the first tab names L1/R1 or TAB depending on
    // whether a pad is plugged in, and a pad can be plugged in (or its battery
    // die) while the panel is open. The tab bar itself only redraws on a tab
    // change, so keep the chip in step here instead of re-rendering the bar.
    // The character switcher's own chip (SELECT / SHIFT) rides along, for the
    // same reason: it is drawn once per render, not once per frame.
    _syncTabHint(scene) {
      const pads  = window.AnalogStickInput;
      const onPad = !!(pads && typeof pads.hasPad === 'function' && pads.hasPad());
      if (onPad === this._hintPad) return;
      this._hintPad = onPad;
      const el = scene._overlay?.querySelector('.npc-tab-hint');
      // i18n-ignore-start: physical controller / keyboard button ids
      if (el) {
        el.dataset.pad  = onPad ? '1' : '0';
        el.textContent  = onPad ? 'L1 R1' : 'TAB';
      }
      const focusEl = scene._overlay?.querySelector('.npc-focus-hint');
      if (focusEl) focusEl.textContent = onPad ? 'SELECT' : 'SHIFT';
      // i18n-ignore-end
    },

    // The right stick scrolls the open tab's pane, the controller's mouse
    // wheel. MZ's gamepadMapper names neither the stick's axes nor the analog
    // triggers (buttons 6/7), so both are read raw through the shared
    // AnalogStickInput helper. L2/R2 stay a zoom: on the Social Web they zoom
    // the graph (R2 in, L2 out), which is what the wheel over the graph does.
    _updateStickScroll(scene) {
      const pads = window.AnalogStickInput;
      if (!pads || typeof pads.rightY !== 'function') return;
      if (scene._activeTab === 'web' && typeof scene.setWebZoom === 'function') {
        const pull   = v => (v > TRIGGER_DEADZONE ? (v - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE) : 0);
        const zoom   = (pull(pads.rightTrigger()) - pull(pads.leftTrigger())) * TRIGGER_SPEED;
        // zoom tops out at TRIGGER_SPEED (26); this rate roughly doubles the
        // view over one second at a fully pulled trigger, the pixel-scroll
        // constant below being tuned for text, not for a multiplicative zoom.
        if (zoom) scene.setWebZoom(scene.webZoom() * (1 + zoom * 0.0005));
        return;
      }
      const y      = pads.rightY();
      const push   = Math.abs(y) > STICK_DEADZONE
        ? ((Math.abs(y) - STICK_DEADZONE) / (1 - STICK_DEADZONE)) * Math.sign(y) : 0;
      const amount = push * STICK_SPEED;
      if (!amount) return;
      scene._scrollActivePane?.(amount);
    },

    update() {
      if (!this._active || !this._scene) return;
      const scene = this._scene;
      this._syncTabHint(scene);
      // Scope to the live overlay so a stale/duplicate #menu-container copy can
      // never hand us the wrong input element.
      const inp   = scene._overlay?.querySelector('#npc-dlg-ask-input')
        || document.getElementById('npc-dlg-ask-input');

      // Chat input has DOM focus, pass ALL keys to the browser, no game
      // navigation at all. This MUST run before the cancel/escape handler:
      // MZ's keyMapper maps letter keys (X to escape, plus W/A/S/D to
      // directions) regardless of which DOM element is focused, so without
      // this early return, typing a word containing one of those letters
      // would fire Input.isTriggered('escape') and blur the field mid-word (#129).
      // Detect focus via the ACTIVE element's id (robust to duplicate ids).
      // While the chat modal is open the game loop stays fully out of the way,
      // no navigation, cancel, or tab cycling can steal focus from the field.
      if (scene._chatModalOpen) return;

      // Any text field the panel is showing, not the chat box alone: the
      // detailed creation editor puts a search box over its longer pickers, and
      // it needs the keyboard for exactly the same reason.
      const ae = document.activeElement;
      const typing = !!ae && (
        ae.id === 'npc-dlg-ask-input' ||
        (!!scene._overlay && scene._overlay.contains(ae) &&
          (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
      );
      scene._inputFocused = typing;
      if (typing) return;

      const cancelled = Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled();

      // While navigating a content grid, Cancel backs out one level (entry list
      // -> categories -> tab bar) instead of closing the whole panel.
      if (cancelled && scene._activeArea === 'content') {
        scene._contentBack();
        return;
      }

      // Cancel / escape, handled once the text field no longer has focus
      if (cancelled) {
        scene._leave();
        return;
      }

      // The right stick scrolls whatever the open tab is showing, every frame
      // it is held off centre
      this._updateStickScroll(scene);

      // Who in the party is doing the talking: SELECT on a pad, SHIFT on a
      // keyboard, both stepping to the next member (the chip beside the
      // switcher in the left panel names whichever applies). Every reputation
      // change lands on that member alone, so the control belongs next to the
      // tab keys rather than buried in a mouse-only list of names.
      //
      // SHIFT is also TAB's "go backwards" modifier, so the keyboard half fires
      // on the key coming back up and is cancelled outright when the hold was
      // spent on a tab change instead. Nothing on a pad shares SELECT, so that
      // half fires on the press.
      const shiftDown = Input.isPressed('shift');
      if (!shiftDown) {
        if (scene._shiftHeldPrev && !scene._shiftTookTab) scene._cycleFocusActor(1);
        scene._shiftTookTab = false;
      }
      scene._shiftHeldPrev = shiftDown;
      if (window.AnalogStickInput?.isButtonTriggered?.(PAD_SELECT_BUTTON)) {
        scene._cycleFocusActor(1);
        return;
      }

      // Tab cycling, from anywhere in the scene: L1/R1 on a pad, TAB (SHIFT+TAB
      // backwards) on a keyboard. These are the ONLY way to change tab -- the
      // d-pad, the stick and WASD all stay inside the tab that is open, where
      // they drive the chat's dialogue options and the Wiki grid. The chip the
      // tab bar draws in front of the first tab names whichever of the two
      // applies (see _buildTabHintHTML in NPCEmpathizeUI.js).
      const tabKey  = Input.isTriggered('tab');
      const tabPrev = Input.isTriggered('pageup');
      if (tabPrev || Input.isTriggered('pagedown') || tabKey) {
        const tabs = scene._tabOrder();
        const back = tabPrev || (tabKey && Input.isPressed('shift'));
        // The SHIFT hold was a modifier, not a request to hand the conversation
        // to the next party member.
        if (tabKey && shiftDown) scene._shiftTookTab = true;
        const cur  = tabs.indexOf(scene._activeTab);
        const next = (cur + (back ? -1 : 1) + tabs.length) % tabs.length;
        scene._setTab(tabs[next]); // plays cursor SE, resets area/index, re-renders
        return;
      }

      // WASD hold-repeat simulation (matches MZ arrow-key timing)
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (scene._wasdHeld[dir]) {
          scene._wasdHoldFrames[dir]++;
          const t = scene._wasdHoldFrames[dir];
          if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0)
            scene._wasdInput[dir] = true;
        } else {
          scene._wasdHoldFrames[dir] = 0;
        }
      }

      const isDown  = Input.isTriggered('down')  || Input.isRepeated('down')  || scene._wasdInput.down;
      const isUp    = Input.isTriggered('up')    || Input.isRepeated('up')    || scene._wasdInput.up;
      const isLeft  = Input.isTriggered('left')  || scene._wasdInput.left;
      const isRight = Input.isTriggered('right') || scene._wasdInput.right;
      scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

      const isChatTab = scene._activeTab === 'chat';
      const area      = scene._activeArea;

      // Directions never leave the open tab (L1/R1 does that). Inside a tab they
      // move between whatever it offers: the chat actions, the Wiki grid, or,
      // on a plain reading page with nothing to select, the page itself.
      if (area === 'tabs') {
        // Directions no longer walk the tab bar; they drop straight into what
        // the open tab offers, which on the two tabs that have anything to
        // select is the chat's dialogue options and the Wiki grid. Up is left
        // out of the drop-in so it can still scroll the page back up from here.
        const enter = isDown || isLeft || isRight || Input.isTriggered('ok');
        if (enter && isChatTab) {
          SoundManager.playCursor();
          scene._activeArea = 'actions';
          scene._menuIndex  = 0;
          scene._updateSelectionHighlight();
        } else if (enter && scene._contentNavEnabled()) {
          // Drop into the in-panel grid (Wiki cards / entries).
          scene._enterContentArea();
        } else if (isUp || isDown) {
          // Every other tab is a reading page: directions just scroll it.
          scene._scrollActivePane?.(isUp ? -SCROLL_KEY_STEP : SCROLL_KEY_STEP);
        }

      } else if (area === 'content') {
        if (isUp) {
          // From the top row, fall back up to the tab bar.
          if (!scene._moveContent('up')) {
            SoundManager.playCursor();
            scene._activeArea = 'tabs';
            scene._updateSelectionHighlight();
          }
        } else if (isDown)  { scene._moveContent('down');
        } else if (isLeft)  { scene._moveContent('left');
        } else if (isRight) { scene._moveContent('right');
        } else if (Input.isTriggered('ok')) {
          scene._activateContent();
        }

      } else if (area === 'actions') {
        const btns  = scene._overlay?.querySelectorAll('.npc-chat-action-btn');
        const idx   = scene._menuIndex;

        // The dialogue options wrap into as many rows as they need, so all four
        // directions walk them geometrically: Down lands on the option below
        // rather than on the one after it in DOM order.
        if (isLeft || isRight || isDown) {
          const dir = isLeft ? 'left' : (isRight ? 'right' : 'down');
          // Nothing below the bottom row: read further down the log instead.
          // (The text field is reached through the "Free Chat" action, never by
          // a direction.)
          if (!scene._moveAction(dir) && isDown) {
            scene._scrollActivePane?.(SCROLL_KEY_STEP);
          }
        } else if (isUp) {
          // From the top row, fall back up to the tab bar.
          if (!scene._moveAction('up')) {
            SoundManager.playCursor();
            scene._activeArea = 'tabs';
            scene._menuIndex  = 0;
            scene._updateSelectionHighlight();
          }
        } else if (Input.isTriggered('ok')) {
          const btn = btns?.[idx];
          if (btn && !btn.classList.contains('npc-action-disabled')) {
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          }
        }
      }
    },
  };

  // ============================================================================
  // SECTION 7, SCENE_NPCEmpathize
  // ============================================================================

  class Scene_NPCEmpathize extends Scene_MenuBase {
    constructor() {
      super();
      this._eventId        = Scene_NPCEmpathize._eventId;
      // The originating map event, frozen at open time. _eventId gets reassigned
      // by wiki hyperlink navigation (often to null for entity pages), so keep a
      // separate handle for releasing the paused map interpreter on close (#13).
      this._launchEventId  = Scene_NPCEmpathize._eventId;
      this._actorId        = Scene_NPCEmpathize._actorId;
      this._npcName        = Scene_NPCEmpathize._npcName;
      Scene_NPCEmpathize._npcName = null;
      // Wiki entity mode: {type:'nation'|'power'|'leader'|'artifact'|'faction', id}
      //, the panel becomes an encyclopedia page; chat is hidden entirely.
      this._entity         = Scene_NPCEmpathize._entity;
      Scene_NPCEmpathize._entity = null;
      this._entityTabs     = null;
      // selected category inside the Wiki index tab (openWiki can preselect)
      this._wikiCategory   = Scene_NPCEmpathize._initialWikiCategory ?? null;
      Scene_NPCEmpathize._initialWikiCategory = null;
      this._overlay        = null;
      this._menuIndex      = 0;
      this._menuItems      = [];
      this._chatActions    = [];
      this._justJoined     = false; // true after this NPC joins via the panel; hides Join
      this._activeTab      = Scene_NPCEmpathize._initialTab
        ?? (this._entity ? 'overview' : 'chat');
      Scene_NPCEmpathize._initialTab = null;
      this._activeArea     = 'tabs'; // 'tabs' | 'actions' | 'input' | 'content'
      this._contentIndex   = 0; // focused tile when navigating in-panel content (wiki)
      this._moreSubView    = null;
      this._chatHistory    = [];
      this._askDraft       = ''; // in-progress chat input text, survives re-renders
      this._inputFocused   = false;
      this._isTyping       = false;
      // Timestamp until which the chat log is held pinned to its newest message.
      this._chatPinUntil   = 0;
      // True while the log still follows its newest message. Cleared only by the
      // player scrolling back up through the backlog by hand.
      this._chatStick      = true;
      this._chatModalOpen  = false; // chat text-entry modal visibility
      this._chatModalEl    = null;
      this._joinMessage    = null;
      this._stealMode          = false;
      this._stealItems         = [];
      this._stealAttempted     = {};
      this._stealRolling       = false;
      this._giftMode           = false;
      this._giftItems          = [];
      this._feedMode           = false;
      this._feedItems          = [];
      this._bribeMode          = false;
      this._attackConfirm      = false;
      this._pickpocketConfirm  = false;
      this._transmitConfirm    = null;
      this._infectMode         = false;
      this._infectItems        = [];
      this._socialMode         = false;
      this._romanceMode        = false;
      this._proposeMode        = false;
      this._directionsMode     = false;
      this._directionList      = [];
      this._focusActorIndex    = 0; // which party member is interacting
      // SHIFT hands the conversation to the next member on the key coming up,
      // unless the hold was spent as TAB's backwards modifier.
      this._shiftHeldPrev      = false;
      this._shiftTookTab       = false;
      this._lastSubject        = '';
      this._wasdInput      = { up: false, down: false, left: false, right: false };
      this._wasdHeld       = { up: false, down: false, left: false, right: false };
      this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };
      this._wasdListener   = null;
      this._wasdUpListener = null;
      this._disabledCanvases = [];
      this._tabBarEl       = null;
      this._leftEl         = null;
      this._rightEl        = null;
    }

    createBackground() {
      this._backgroundSprite = new Sprite(SceneManager.backgroundBitmap());
      this.addChild(this._backgroundSprite);
      this.setBackgroundOpacity(255);
    }

    create() {
      super.create();
      // Politicians, nations and artifacts can change between visits, rebuild
      // the wiki's hyperlink index whenever a panel opens.
      window.NPCEmpathize?.Wiki?.invalidate();
      const dummy = new Window_Base(new Rectangle(0, 0, 1, 1));
      dummy.visible = false;
      this.addWindow(dummy);

      this._savedShouldPreventDefault = Input._shouldPreventDefault;
      const _savedRef = this._savedShouldPreventDefault;
      Input._shouldPreventDefault = function (keyCode) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
        return _savedRef.call(this, keyCode);
      };

      this._wasdListener = (ev) => {
        if (ev.repeat) return;
        // Any focused text field owns w/a/s/d as letters, not movement: the
        // chat box was the only one checked here, so every other field in the
        // panel (the character creator's search boxes among them) had its
        // keystrokes eaten and fed into row navigation instead.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        const k = ev.key.toLowerCase();
        if (k === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; ev.preventDefault(); }
        if (k === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; ev.preventDefault(); }
        if (k === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; ev.preventDefault(); }
        if (k === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; ev.preventDefault(); }
      };
      this._wasdUpListener = (ev) => {
        const k = ev.key.toLowerCase();
        if (k === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
        if (k === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
        if (k === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
        if (k === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
      };
      window.addEventListener('keydown', this._wasdListener);
      window.addEventListener('keyup',   this._wasdUpListener);

      // ── Chat-input key guard ──────────────────────────────────────────────
      // Many always-on map plugins (FastTravel, TimeDate HUD, WorldMap, etc.)
      // attach their own global keydown handlers, several of which call
      // preventDefault on letters/space, so keystrokes never reach a focused
      // text field. This capture-phase listener runs BEFORE all of them: while
      // the chat box has focus it stops the event from reaching any other
      // handler (so none can preventDefault it) WITHOUT calling preventDefault
      // itself, leaving the browser's default character insertion intact. We
      // swallow the event before the input's own onkeydown can fire, so Enter /
      // Escape are reproduced here.
      this._chatKeyGuard = (ev) => {
        // Gate on the ACTUALLY focused element, not getElementById (which can
        // resolve a stale/duplicate overlay's input and make this a no-op).
        // Any focused text field means "the player is typing", so shield it.
        const ae = document.activeElement;
        if (!ae || (ae.tagName !== 'INPUT' && ae.tagName !== 'TEXTAREA')) return;
        ev.stopImmediatePropagation();
        if (ev.type === 'keydown' && ae.id === 'npc-dlg-ask-input') {
          // Enter sends (Shift+Enter inserts a newline in the modal textarea);
          // Escape closes the modal, or blurs the legacy inline field.
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            if (this._chatModalOpen) this._submitChatModal();
            else this._submitAsk();
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            if (this._chatModalOpen) this._closeChatModal();
            else ae.blur();
          }
        }
      };
      window.addEventListener('keydown',  this._chatKeyGuard, true);
      window.addEventListener('keyup',    this._chatKeyGuard, true);
      window.addEventListener('keypress', this._chatKeyGuard, true);

      document.querySelectorAll('canvas').forEach(c => {
        this._disabledCanvases.push({ el: c, orig: c.style.pointerEvents });
        c.style.pointerEvents = 'none';
      });

      NPCEmpathizeInputManager.activate(this);
      // TAB belongs to the panel's own tab bar here (NPCEmpathizeInputManager
      // reads it, alongside L1/R1), not to CharSwitcher's party-member cycling
      // the way it does in inventory/equip/biologics: this scene is built out of
      // tabs and that is the control players reach for. The interacting member
      // is still switched by clicking their row in the left panel
      // (_selectFocusActor). All the browser has to be told is to keep its own
      // focus traversal off the key.
      this._tabKeyGuard = (e) => {
        if (e.key !== 'Tab') return; // i18n-ignore: DOM key name
        // A focused text field owns the keyboard outright, caret and all.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        e.preventDefault();
      };
      window.addEventListener('keydown', this._tabKeyGuard);
      // _buildOverlay and _render are called by NPCEmpathizeUI.js
    }

    // ── Em (Switch 48) ─────────────────────────────────────────────────────────
    // The reaction of the NPC this panel is open on to Em, or null when this is
    // not Em talking (see _emContext). Everything Em-specific hangs off this.
    _emCtx() {
      if (this._entity || this._actorId) return null; // wiki page / party member
      const npcName = this._targetName();
      if (!npcName) return null;
      return _emContext(
        _getProfile(npcName), npcName, $gameMap?.event(this._eventId), this._focusActor()
      );
    }

    // Seeds the NPC's standing with Em the first time they meet, then has them
    // open their mouth about it. Called from _renderInner (NPCEmpathizeUI.js)
    // once the chat backlog is in place and before the panel reads the opinion,
    // so the first impression is what it displays. Both halves are idempotent.
    _prepareEmMeeting() {
      if (this._entity || this._actorId) return;
      const npcName = this._targetName();
      if (!npcName || !_emPlaythrough()) return;
      _emSeedFirstImpression(_getProfile(npcName), npcName, $gameMap?.event(this._eventId));
      this._sayEmGreeting();
    }

    // The NPC's reaction to Em, appended as the newest line rather than pushed
    // at open time (a lone entry would suppress the chat backlog entirely). One
    // shot per focused member: handing the conversation over says it again.
    _sayEmGreeting() {
      if (this._emGreeted) return;
      const ctx = this._emCtx();
      if (!ctx) return;
      const line = _rand(ctx.data.greeting);
      if (!line) return;
      this._emGreeted = true;
      const npcName = this._targetName();
      this._chatHistory.push({ role: 'npc', text: vary(String(line).replace(/\{name\}/g, npcName)) });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // ── Bubba (Switch 49) ──────────────────────────────────────────────────────
    // The admiration this NPC meets Bubba with, or null when this is not Bubba
    // talking. Everything Bubba-specific hangs off this, exactly like _emCtx.
    _bubbaCtx() {
      if (this._entity || this._actorId) return null; // wiki page / party member
      const npcName = this._targetName();
      if (!npcName) return null;
      return _bubbaContext(this._focusActor());
    }

    // Seeds the NPC's standing with Bubba the first time they meet, then has
    // them say so. Called from _renderInner alongside _prepareEmMeeting; both
    // halves are idempotent, and only one of the two can ever be in play (they
    // are different party members doing the talking).
    _prepareBubbaMeeting() {
      if (this._entity || this._actorId) return;
      const npcName = this._targetName();
      if (!npcName) return;
      const actor = this._focusActor();
      if (!_isBubbaActor(actor)) return;
      _bubbaSeedFirstImpression(_getProfile(npcName), actor);
      this._sayBubbaGreeting();
    }

    _sayBubbaGreeting() {
      if (this._bubbaGreeted) return;
      const ctx = this._bubbaCtx();
      if (!ctx) return;
      const line = _rand(ctx.data.greeting);
      if (!line) return;
      this._bubbaGreeted = true;
      const npcName = this._targetName();
      this._chatHistory.push({ role: 'npc', text: vary(String(line).replace(/\{name\}/g, npcName)) });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // ── Em and Bubba (either direction) ────────────────────────────────────
    // The pair conversation, in whichever direction it is running, or null when
    // this is not the two of them. Unlike _emCtx / _bubbaCtx this DOES answer in
    // actor mode: opening Em from the roster while Bubba leads is the commonest
    // way the second direction is ever seen.
    _pairCtx() {
      if (this._entity) return null; // wiki page
      const npcName = this._targetName();
      if (!npcName) return null;
      return _pairContext(
        this._focusActor(), npcName,
        this._actorId != null ? null : $gameMap?.event(this._eventId)
      );
    }

    // How the other one greets them: a line about the weather, the place or the
    // hour when one fits, otherwise the plain hello. One shot per panel.
    _sayPairGreeting() {
      if (this._pairGreeted) return;
      const ctx = this._pairCtx();
      if (!ctx) return;
      const line = _pairSituationLine(ctx.data) || _rand(ctx.data.greeting);
      if (!line) return;
      this._pairGreeted = true;
      const npcName = this._targetName();
      this._chatHistory.push({ role: 'npc', text: vary(String(line).replace(/\{name\}/g, npcName)) });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // Bicker: the action the two of them have and nobody else does. One of them
    // starts something, the other gives it straight back, and it costs neither
    // of them anything, because this is what they do instead of talking. The
    // `bicker` bank is a list of {player, reply} pairs so a jab and its answer
    // are never drawn out of step with one another.
    _bicker() {
      const ctx = this._pairCtx();
      if (!ctx) return;
      const npcName = this._targetName();
      const fill = s => vary(String(s || '').replace(/\{name\}/g, npcName));
      const beat = _rand(ctx.data.bicker || []);
      if (!beat) return;
      this._socialMode = false;
      this._activeTab  = 'chat';
      this._menuIndex  = 0;
      this._pushChat('player', fill(beat.player));
      this._pushChat('npc',    fill(beat.reply));
      // Winding each other up is time spent together and nothing else: a point
      // of standing, never a loss, whichever way the jab went.
      _addPairBond(1 + Math.floor(Math.random() * 3));
      this._gainCompany();
      this._render();
    }

    update() {
      Scene_MenuBase.prototype.update.call(this);
      NPCEmpathizeInputManager.update();
    }

    terminate() {
      // Releasing the map first, before anything that could throw. If the panel
      // ever leaves without this running, the launch event's interpreter stays
      // "running" forever, $gameMap.isEventRunning() never goes false again, and
      // NO event on the map can be triggered from then on.
      this._releaseEventLock();
      try { this._closeChatModal?.(); } catch (e) { console.error('[NPCEmpathize] closeChatModal', e); }
      // A panel session owns the wiki back-stack. Leaving through Join, Attack,
      // Trade or a purchase used to leave entries on it, and the NEXT panel then
      // read Cancel as "go back" to a subject from a conversation that ended long
      // ago instead of closing.
      if (!SceneManager.isNextScene(Scene_NPCEmpathize)) Scene_NPCEmpathize._returnStack.length = 0;
      if (this._savedShouldPreventDefault) {
        Input._shouldPreventDefault = this._savedShouldPreventDefault;
        this._savedShouldPreventDefault = null;
      }
      (this._disabledCanvases || []).forEach(({ el, orig }) => { el.style.pointerEvents = orig; });
      this._disabledCanvases = [];
      if (this._wasdListener) {
        window.removeEventListener('keydown', this._wasdListener);
        window.removeEventListener('keyup',   this._wasdUpListener);
        this._wasdListener = this._wasdUpListener = null;
      }
      if (this._chatKeyGuard) {
        window.removeEventListener('keydown',  this._chatKeyGuard, true);
        window.removeEventListener('keyup',    this._chatKeyGuard, true);
        window.removeEventListener('keypress', this._chatKeyGuard, true);
        this._chatKeyGuard = null;
      }
      if (this._tabKeyGuard) {
        window.removeEventListener('keydown', this._tabKeyGuard);
        this._tabKeyGuard = null;
      }
      NPCEmpathizeInputManager.deactivate();
      this._removeOverlay();
      Scene_MenuBase.prototype.terminate.call(this);
    }

    // Stubs replaced by NPCEmpathizeUI.js
    _removeOverlay() {}
    _render() { console.error('[NPCEmpathize] _render not found, is NPCEmpathizeUI.js loaded?'); }

    // ── Tab ────────────────────────────────────────────────────────────────────

    // The live tab order, entity (wiki) pages define their own tab set and
    // never include the chat tab.
    _tabOrder() {
      if (this._entity) return this._entityTabs || ['overview'];
      const tabs = ['chat', 'info', 'background', 'routine', 'biologics', 'health', 'romance', 'web', 'lifeHistory', 'wiki', 'more'];
      // Nothing is courting anybody through a muzzle: the romance tab is not
      // on the table while a non-sentient member is the one doing the talking,
      // nor when the one being talked to is the beast.
      if (_isNonSentientActor(this._focusActor?.()) || this._isNonSentientSubject()) {
        return tabs.filter(t => t !== 'romance');
      }
      // Nor is anybody courting a traveller who belongs to another
      // playthrough of this world: a romance there would be a change to a
      // savegame this one has no business writing to (NPCSystem.js,
      // VisitingParties). They can be talked to and read, nothing else.
      if (this._isVisitorTarget()) {
        return tabs.filter(t => t !== 'romance');
      }
      return tabs;
    }

    // Is the person this panel is open on somebody else's party member?
    _isVisitorTarget() {
      if (this._entity || this._actorId != null) return false;
      const name = this._targetName();
      return !!name && !!window.PartyPresence?.isVisitorName?.(name);
    }

    _setTab(tab) {
      if (this._activeTab === tab) return;
      SoundManager.playCursor();
      this._activeTab         = tab;
      this._activeArea        = 'tabs';
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._infectMode        = false;
      this._socialMode        = false;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._moreSubView       = null;
      this._wikiCategory      = null;
      this._menuIndex         = 0;
      this._contentIndex      = 0;
      this._webList           = null; // the social web rebuilds from the new profile
      this._render();
    }

    _setWikiCategory(category) {
      SoundManager.playCursor();
      this._wikiCategory = category || null;
      // Remembered across the step back out to the grid so the card that was
      // just read keeps its golden border (see the card markup in the UI file).
      if (category) this._lastWikiCategory = category;
      this._contentIndex = 0;
      this._render(); // innerHTML is rebuilt synchronously, so tiles exist below
      // When drilling into a category with the keyboard/controller, move the
      // focus past the "back" chip onto the first real entry.
      if (this._activeArea === 'content' && category) {
        const first = this._contentItems().findIndex(el => !el.classList.contains('npc-back-btn'));
        if (first > 0) { this._contentIndex = first; this._updateSelectionHighlight(); }
      }
    }

    _moreAction(id) {
      if (id === 'leave') { this._leave(); return; }
      SoundManager.playCursor();
      this._moreSubView = id;
      this._render();
    }

    _moreBack() {
      SoundManager.playCursor();
      this._moreSubView = null;
      this._render();
    }

    // ── Selection highlight ────────────────────────────────────────────────────

    // The two lists the cursor walks, as they stand in the DOM right now. Both
    // are re-queried only when the panel has actually been rebuilt: the Wiki's
    // entry grid can hold thousands of tiles, and asking the document for all
    // of them on every arrow press was most of what the panel spent its frame
    // on. A cached list whose first element has left the document is stale
    // whatever the token says, so that is checked too rather than trusted.
    _navCache(key, root, selector) {
      const cache = (this._navLists ||= {});
      const hit   = cache[key];
      if (hit && hit.token === this._renderToken &&
          (!hit.list.length || hit.list[0].isConnected)) return hit.list;
      const list = root ? Array.from(root.querySelectorAll(selector)) : [];
      cache[key] = { token: this._renderToken, list, bound: false, swept: false };
      return list;
    }

    // Called by the render path the moment new markup lands, so the next
    // cursor move re-reads the panel instead of the panel that was there.
    _invalidateNavCache() {
      this._renderToken = (this._renderToken || 0) + 1;
      this._navLists    = null;
      this._focusedBtn  = null;
      this._focusedItem = null;
    }

    _actionButtons() {
      return this._navCache('btns', this._overlay, '.npc-chat-action-btn');
    }

    _updateSelectionHighlight() {
      if (!this._overlay) return;
      const inActions = this._activeArea === 'actions';
      const btns      = this._actionButtons();
      // A submenu is usually shorter than the verb list it was opened from, so
      // pull the cursor back onto the last row rather than leave it past the
      // end of the list, where nothing at all would look selected.
      if (inActions && this._menuIndex >= btns.length)
        this._menuIndex = Math.max(0, btns.length - 1);
      // One pass over fresh markup does the two things that have to be done
      // once. The mouse moves this same cursor rather than drawing a look of
      // its own: without a hover handler, hovering quietly parked _menuIndex
      // somewhere the highlight never showed, so the next arrow press moved it
      // one step off from wherever the player's eye actually was. And the
      // action row is drawn with the cursor already baked into whichever
      // button _menuIndex named, so every other one is cleared here. After
      // this pass the two rows that change are the only two touched.
      const btnCell = this._navLists?.btns;
      if (btnCell && !btnCell.bound) {
        btnCell.bound = true;
        btns.forEach((el, i) => {
          if (!inActions || i !== this._menuIndex) el.classList.remove('npc-action-focused');
          el.onmouseenter = () => {
            if (this._activeArea === 'actions' && this._menuIndex === i) return;
            this._activeArea = 'actions';
            this._menuIndex  = i;
            this._updateSelectionHighlight();
          };
        });
      }
      // Only the row losing the cursor and the row taking it are touched.
      const btn = inActions ? (btns[this._menuIndex] || null) : null;
      if (this._focusedBtn && this._focusedBtn !== btn)
        this._focusedBtn.classList.remove('npc-action-focused');
      if (btn) {
        btn.classList.add('npc-action-focused');
        // The pickers are capped at 45% of the panel and scroll, so the cursor
        // can walk off the bottom of the visible strip; keep it in the strip.
        if (btns.length > 1) btn.scrollIntoView({ block: 'nearest' });
      }
      this._focusedBtn = btn;

      const inContent = this._activeArea === 'content';
      const items = this._contentItems();
      const item  = inContent ? (items[this._contentIndex] || null) : null;
      // Same first pass for the Wiki grid, which is the list that can hold
      // thousands of tiles and the reason none of this is swept every time.
      const itemCell = this._navLists?.content;
      if (itemCell && !itemCell.swept) {
        itemCell.swept = true;
        items.forEach(el => { if (el !== item) el.classList.remove('npc-content-focused'); });
      }
      if (this._focusedItem && this._focusedItem !== item)
        this._focusedItem.classList.remove('npc-content-focused');
      if (item) {
        item.classList.add('npc-content-focused');
        item.scrollIntoView({ block: 'nearest' });
      }
      this._focusedItem = item;

      if (this._tabBarEl)
        this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }

    // ── In-panel content navigation (Wiki tab grids) ───────────────────────────

    // True when the active tab exposes a keyboard/controller-navigable grid.
    _contentNavEnabled() {
      return this._activeTab === 'wiki';
    }

    // The navigable tiles in the right panel, in DOM order. Covers the Wiki
    // category cards, the per-category entry tiles, and the "back" chip.
    _contentItems() {
      if (!this._contentNavEnabled() || !this._rightEl) return [];
      return this._navCache('content', this._rightEl,
        '.npc-wiki-card, .npc-wiki-entry, .npc-back-btn');
    }

    _enterContentArea() {
      if (!this._contentItems().length) return false;
      this._activeArea  = 'content';
      this._contentIndex = 0;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    // Geometric grid move: pick the nearest tile in the pressed direction by
    // comparing element centres, so it works with the responsive auto-fill
    // grid (variable column count) without hard-coding a stride.
    _moveContent(dir) {
      const items = this._contentItems();
      if (!items.length) return false;
      const curEl = items[this._contentIndex] || items[0];
      const cur   = curEl.getBoundingClientRect();
      const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
      let best = -1, bestScore = Infinity;
      items.forEach((el, i) => {
        if (i === this._contentIndex) return;
        const r  = el.getBoundingClientRect();
        const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        const dx = ex - cx, dy = ey - cy;
        let primary, cross;
        if (dir === 'left')       { if (dx >= -1) return; primary = -dx; cross = Math.abs(dy); }
        else if (dir === 'right') { if (dx <=  1) return; primary =  dx; cross = Math.abs(dy); }
        else if (dir === 'up')    { if (dy >= -1) return; primary = -dy; cross = Math.abs(dx); }
        else                      { if (dy <=  1) return; primary =  dy; cross = Math.abs(dx); }
        const score = primary + cross * 2; // cross-axis penalty keeps moves in-line
        if (score < bestScore) { bestScore = score; best = i; }
      });
      if (best === -1) return false;
      this._contentIndex = best;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    // Same geometric move as _moveContent, over the chat's dialogue options.
    // They live in a flex-wrap strip whose row breaks depend on how long each
    // verb's label is, so "the option below" cannot be found by DOM index; it
    // has to be found by where the buttons actually landed. Returns false when
    // nothing lies that way, which is how the caller knows to leave the strip.
    _moveAction(dir) {
      const btns = this._overlay ? this._actionButtons() : null;
      if (!btns || btns.length === 0) return false;
      const curEl = btns[this._menuIndex] || btns[0];
      const cur   = curEl.getBoundingClientRect();
      const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
      let best = -1, bestScore = Infinity;
      btns.forEach((el, i) => {
        if (i === this._menuIndex) return;
        const r  = el.getBoundingClientRect();
        const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        const dx = ex - cx, dy = ey - cy;
        let primary, cross;
        if (dir === 'left')       { if (dx >= -1) return; primary = -dx; cross = Math.abs(dy); }
        else if (dir === 'right') { if (dx <=  1) return; primary =  dx; cross = Math.abs(dy); }
        else if (dir === 'up')    { if (dy >= -1) return; primary = -dy; cross = Math.abs(dx); }
        else                      { if (dy <=  1) return; primary =  dy; cross = Math.abs(dx); }
        const score = primary + cross * 2; // cross-axis penalty keeps moves in-line
        if (score < bestScore) { bestScore = score; best = i; }
      });
      if (best === -1) return false;
      this._menuIndex = best;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    _activateContent() {
      const el = this._contentItems()[this._contentIndex];
      if (!el) return;
      SoundManager.playOk();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }

    // Back out one level of the Wiki: entry list -> category grid -> tab bar.
    _contentBack() {
      if (this._wikiCategory) {
        this._setWikiCategory(null); // re-renders the category grid, stays in 'content'
        return;
      }
      SoundManager.playCancel();
      this._activeArea = 'tabs';
      this._updateSelectionHighlight();
    }

    // ── Actions ────────────────────────────────────────────────────────────────

    _runAction(id) {
      const item = (this._chatActions || []).find(a => a.id === id);
      if (!item) return;
      // A written character cannot be fought or infected. The action row does
      // not offer these against one (see the UI layer), this is the backstop
      // for anything that reaches the dispatcher another way.
      if (STORY_PROTECTED_ACTIONS.includes(id) && _isStoryNpc(this._eventId)) return;
      // Anything done face to face is another exposure. Cough/Spit/Bite are
      // deliberate and roll at full strength in _confirmTransmit; every other
      // action here (a gift, a trade, a joke, patching up their wounds) rolls
      // the same two-way exchange at a much lower chance.
      if (!['cough', 'spit', 'bite'].includes(id)) this._incidentalContact();
      switch (id) {
        case 'freeChat':   this._openChatModal(); break;
        case 'gift':       this._gift();        break;
        case 'pet':        this._pet();         break;
        case 'collect':    this._collect();     break;
        case 'animalJoin':      this._animalJoin(false); break;
        case 'animalJoinParty': this._animalJoin(true);  break;
        case 'joinFollower':    this._joinFollower();    break;
        case 'feed':       this._feed();        break;
        case 'bribe':      this._bribe();       break;
        case 'attack':     this._attack();      break;
        case 'pickpocket': this._pickpocket();  break;
        case 'infect':     this._infect();      break;
        case 'trade':      this._trade();       break;
        case 'treat':      this._treatWounds(); break;
        case 'join':       this._join();        break;
        case 'buyHouse':   this._buyHouse();    break;
        case 'cough':      this._beginTransmit('airborne'); break;
        case 'spit':       this._beginTransmit('saliva');   break;
        case 'bite':       this._beginTransmit('bite');     break;
        case 'socialize':  this._socialize();   break;
        case 'bicker':     this._bicker();      break;
        case 'romance':    this._romance();     break;
        case 'directions': this._askDirections(); break;
        case 'cardDuel':   this._cardDuel();    break;
        case 'cardTrade':  this._cardTrade();   break;
        default:
          if (FERAL_ACTION_IDS.has(id)) this._feralAct(id);
          break;
      }
      // These four never move an opinion, but haggling, being patched up, being
      // pointed at a door and buying a house off somebody are all time spent in
      // company, so they pay the social meter the same flat base an exchange does.
      if (COMPANY_ACTIONS.has(id)) this._gainCompany();
    }

    // Pay the focused member (and the party around them) for the company of the
    // NPC this panel is open on.
    _gainCompany() {
      _gainSocialFromCompany(this._focusActor()?.actorId(),
        _getProfile(_getNPCName(this._eventId)));
    }

    // Incidental (unintended) two-way transmission for a single interaction.
    // Only meaningful for a real map NPC, never for the wiki/actor pages.
    _incidentalContact() {
      const DS = window.DiseaseSystem;
      if (!DS || !DS.rollIncidentalTransmission || this._entity || this._actorId != null) return;
      const npcName = _getNPCName(this._eventId);
      const profile = npcName ? _getProfile(npcName) : null;
      if (!profile) return;
      try { DS.rollIncidentalTransmission(npcName, profile); }
      catch (e) { console.warn('[NPCEmpathize] incidental transmission failed', e); }
    }

    // ── Deliberate disease transmission (Cough / Spit / Bite) ────────────────
    // Always available. Uses the party LEADER's carried diseases whose vector
    // matches the chosen action. The confirm dialog lists which diseases would
    // spread and at what chance. Committing is an assault: big reputation hit
    // plus an assault bounty via the crime system, regardless of whether any
    // disease actually transmits.
    _beginTransmit(vector) {
      const T       = _getT();
      const npcName = _getNPCName(this._eventId);
      const DS      = window.DiseaseSystem;
      const diseases = (DS && DS.leaderVectorDiseases(vector)) || [];

      const actionLbl = vector === 'airborne' ? (T.coughLabel)
        : vector === 'saliva' ? (T.spitLabel)
        : (T.biteLabel);

      this._transmitConfirm = {
        vector,
        diseases: diseases.map(d => ({ id: d.id, name: d.name, transmission: d.transmission })),
      };

      // Cough isn't treated as an assault (no bounty on confirm, see
      // _confirmTransmit), so its warning skips the "this counts as assault"
      // wording that Spit/Bite still show.
      const isCough = vector === 'airborne';
      let warn;
      if (diseases.length) {
        const list = diseases.map(d => `${d.name} (${Math.round(d.transmission * 100)}%)`).join(', ');
        warn = isCough
          ? T.transmitWarnHasNoAssault(actionLbl, npcName, list)
          : T.transmitWarnHas(actionLbl, npcName, list);
      } else {
        warn = isCough
          ? T.transmitWarnNoneNoAssault(actionLbl, npcName)
          : T.transmitWarnNone(actionLbl, npcName);
      }

      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._joinMessage       = { type: 'reject', text: warn };
      this._render();
    }

    _confirmTransmit() {
      const tc = this._transmitConfirm;
      if (!tc) return;
      const T       = _getT();
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const DS      = window.DiseaseSystem;

      const dz = (tc.diseases || []).map(x => DS && DS.getDisease(x.id)).filter(Boolean);
      let hitIds = [];
      if (profile && DS && dz.length) hitIds = DS.deliberateTransmit(profile, dz, profile._homeGroupName || null);

      // Reputation + faction hit and crime record (assault).
      if (profile) {
        _addNpcOpinion(profile, this._focusActor()?.actorId(), -60);
        (profile.eventLog ??= []).push({
          tag: 'crime', desc: `${tc.vector} assault by player`, // i18n-ignore: event-log record id
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (faction != null && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, -15);
      }
      // A cough is rude, not a crime, unlike Spit/Bite: no bounty for it.
      const isCough = tc.vector === 'airborne';
      const bounty  = 300 + ((profile?.level ?? 1) * 40);
      if (!isCough) window.CrimeSystem?.addCrime?.('Assault', bounty); // i18n-ignore: CrimeSystem category id

      let msg;
      if (!dz.length) {
        msg = isCough
          ? T.transmitNoneResultNoBounty(npcName)
          : T.transmitNoneResult(npcName);
      } else if (hitIds.length) {
        const names = hitIds.map(id => (DS ? DS.displayName(id) : id)).join(', ');
        msg = T.transmitHit(npcName, names);
      } else {
        msg = isCough
          ? T.transmitMissNoBounty(npcName)
          : T.transmitMiss(npcName);
      }

      SoundManager.playBuzzer();
      this._transmitConfirm = null;
      this._joinMessage = { type: hitIds.length ? 'accept' : 'reject', text: msg };
      this._render();
    }

    // ── Deliberate disease transmission (Cough / Spit / Bite) ────────────────
    // The other half of the disease library: Cough/Spit/Bite pass on what the
    // party is already carrying, this opens a sealed vial on somebody. The list
    // is every <DiseaseVial:> item in the pack; with none the action is greyed
    // out in the row and this refuses to open at all.
    _infect() {
      const T = _getT();
      const vials = _diseaseVialItems();
      if (!vials.length) { SoundManager.playBuzzer(); return; }
      this._infectMode        = true;
      this._infectItems       = vials;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._socialMode        = false;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      // Party members are dosed openly and consent is assumed; only a stranger
      // is worth warning the player about, and the warning is the odds.
      this._joinMessage = this._actorId != null ? null : {
        type: 'reject',
        text: T.infectPrompt(
          this._targetName() || '',
          _infectChance(this._focusActor())
        ),
      };
      this._render();
    }

    // The vial goes in either way: the roll is only whether anybody saw who
    // opened it. Unseen, nothing else happens at all: no bounty, and their
    // opinion of the member who did it does not move. Caught, it is
    // bioterrorism (a 10,000€ charge) and whatever they thought of that member
    // is gone.
    _infectWith(index) {
      const item = this._infectItems?.[index];
      if (!item) return;
      const T         = _getT();
      const DS        = window.DiseaseSystem;
      const diseaseId = _diseaseVialId(item);
      const disease   = DS && DS.getDisease ? DS.getDisease(diseaseId) : null;
      if (!DS || !disease) { SoundManager.playBuzzer(); return; }
      const dzName = disease.name || diseaseId;

      // A party member, read off their own panel: no roll, no charge, nobody to
      // hide it from. This is the same deliberate self-infection the vial's own
      // common event offers, done from the sheet instead.
      if (this._actorId != null) {
        const actor = $gameActors?.actor(this._actorId);
        if (!actor) { SoundManager.playBuzzer(); return; }
        // Nothing is hidden here, so nothing is wasted either: a member already
        // carrying it is told so and the seal stays on the vial.
        if (DS.actorHasDisease(actor, diseaseId)) {
          SoundManager.playBuzzer();
          this._infectMode  = false;
          this._joinMessage = { type: 'reject', text: T.infectMemberAlready(actor.name(), dzName) };
          this._render();
          return;
        }
        $gameParty.loseItem(item, 1);
        const ep = DS.startPlayerEpidemic
          ? DS.startPlayerEpidemic(diseaseId, null, { fromParty: true, actorId: actor.actorId(), covert: false })
          : null;
        DS.infectActor(actor, diseaseId, T.infectSource, ep ? ep.id : null);
        SoundManager.playOk();
        this._infectMode  = false;
        this._joinMessage = { type: 'accept', text: T.infectMember(actor.name(), dzName) };
        this._render();
        return;
      }

      const evId    = this._eventId;
      const npcName = _getNPCName(evId) || this._npcName || '';
      const profile = npcName ? _getProfile(npcName) : null;
      if (!profile) { SoundManager.playBuzzer(); return; }

      $gameParty.loseItem(item, 1);
      const actor   = this._focusActor();
      const actorId = actor?.actorId();

      // Somebody who has had it, or is carrying it already, does not take it
      // again; the attempt still happened and is still rolled for, which is what
      // keeps a wasted vial from also being a free one.
      const already = DS.npcHasDisease(profile, diseaseId);
      const immune  = (profile.pastDiseases || []).includes(diseaseId);
      const unseen = Math.random() * 100 < _infectChance(actor);
      let ep = null;
      if (!immune && !already && DS.startPlayerEpidemic) {
        ep = DS.startPlayerEpidemic(diseaseId, profile._homeGroupName || null, {
          covert: unseen,
          playerStarted: true,
          originNpc: npcName
        });
      }
      const took    = !immune && !already && DS.infectNpc(profile, diseaseId, ep ? ep.id : null);

      (profile.eventLog ??= []).push({
        tag: 'crime', desc: unseen ? `covertly infected with ${diseaseId}` : `caught infecting with ${diseaseId}`, // i18n-ignore: event-log record ids
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });

      if (unseen) {
        SoundManager.playOk();
        this._joinMessage = {
          type: 'accept',
          text: took ? T.infectUnseen(npcName, dzName)
            : already ? T.infectAlready(npcName, dzName)
            : T.infectImmune(npcName, dzName),
        };
      } else {
        // Seen doing it. Their standing with this member bottoms out the way it
        // does after an assault, their faction hears about it, and the charge is
        // filed at the preset bioterrorism rate.
        _gainSocialFromOpinion(actorId, -100 - _npcBaseOpinion(profile, actorId), profile);
        _setNpcBaseOpinion(profile, actorId, -100);
        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (faction != null && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, -25);
        window.CrimeSystem?.addPresetCrime?.('bioterrorism'); // i18n-ignore: CrimeSystem preset key
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.infectCaught(npcName, dzName) };
      }

      this._infectMode = false;
      this._render();
    }

    // ── Focused (interacting) party member ──────────────────────────────────
    // A character switcher in the left panel picks which party member is
    // interacting; every reputation change lands on THAT member's own standing
    // with the NPC (profile.opinions[actorId]), never a party-wide median.
    _focusIndex() {
      const n = $gameParty?.members()?.length ?? 1;
      let i = this._focusActorIndex ?? 0;
      if (i < 0 || i >= n) i = 0;
      return i;
    }
    _focusActor() {
      return $gameParty?.members()?.[this._focusIndex()] ?? $gameParty?.leader() ?? null;
    }
    // Is the one being talked to a beast? In actor mode the panel is about a
    // party member, everywhere else about the NPC standing there.
    // Which of the eight creature classes the subject of this panel is played
    // as, so every noise it makes comes out in its own voice rather than a
    // dog's.
    _subjectCreatureClass() {
      if (this._actorId != null) return _creatureClassOfActor($gameActors.actor(this._actorId));
      const name = this._eventId != null ? _getNPCName(this._eventId) : this._npcName;
      return _creatureClassOfNpc(name);
    }
    _isNonSentientSubject() {
      if (this._actorId != null) {
        return _isNonSentientActor($gameActors.actor(this._actorId));
      }
      const name = this._eventId != null ? _getNPCName(this._eventId) : this._npcName;
      return _isNonSentientNpc(name);
    }
    _focusOpinion(profile) {
      // Em and Bubba read their own uncapped bond, never a stranger's opinion.
      if (this._pairCtx?.()) return _pairBond();
      return _npcEffectiveOpinion(profile, this._focusActor());
    }
    _focusAttraction(profile) {
      // And they want nothing from each other, in either direction, ever.
      if (this._pairCtx?.()) return 0;
      return _npcEffectiveAttraction(profile, this._focusActor());
    }
    // Who the panel is actually about, whichever of the three ways it was
    // opened: a map event (NPC mode), a real party member (actorMode, no
    // event to read a name off), or a name alone (remoteMode, a visiting
    // party's member saved somewhere else). Every handler used to read the
    // event name or the remote name only, which is the first and third of
    // those; this is the one that covers all three.
    _targetName() {
      return _getNPCName(this._eventId)
        || (this._actorId != null ? ($gameActors.actor(this._actorId)?.name() ?? '') : '')
        || this._npcName || '';
    }
    // Step the switcher by one, wrapping: what SHIFT (keyboard) and SELECT (pad)
    // do. Only NPC mode has an interacting member to change at all, actor mode
    // being about one specific party member and remote mode having nobody
    // standing there, which is also the condition the switcher is drawn under.
    _cycleFocusActor(dir) {
      if (this._actorId != null || this._eventId == null) return;
      const n = $gameParty?.members()?.length ?? 0;
      if (n <= 1) return;
      this._selectFocusActor((this._focusIndex() + dir + n) % n);
    }
    _selectFocusActor(index) {
      const n = $gameParty?.members()?.length ?? 1;
      if (index < 0 || index >= n || index === this._focusIndex()) return;
      this._focusActorIndex = index;
      // Handing the conversation to (or away from) Em or Bubba is itself an
      // event the NPC reacts to: clear the one-shots so the next render greets
      // whoever is now doing the talking.
      this._emGreeted = false;
      this._bubbaGreeted = false;
      this._feralGreeted = false;
      this._beastGreeted = false;
      // Who is talking decides which buttons exist at all (a beast has no
      // conversation, Bubba refuses half of them), so every half-finished
      // action belongs to the member who is no longer holding it. Drop the
      // lot rather than leave a submenu open over a list that just changed.
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._infectMode        = false;
      this._socialMode        = false;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._joinMessage       = null;
      this._menuIndex         = 0;
      // The new speaker may not have the tab that is open (Romance is closed to
      // a non-sentient member); fall back to the one everybody has.
      if (!this._tabOrder().includes(this._activeTab)) this._activeTab = 'chat';
      SoundManager.playCursor();
      this._render();
    }

    // ── Non-sentient interactions (growl / roar / drool / sniff / ...) ───────
    // What a creature has instead of conversation. Each one is the creature's
    // own noise, the NPC's reaction to it, and what it did to their opinion of
    // the animal; all three read off the same disposition bands.
    _feralAct(id) {
      const def = FERAL_ACTIONS.find(a => a.id === id);
      if (!def) return;
      const T       = _getT();
      const npcName = this._targetName() || '';
      const profile = npcName ? _getProfile(npcName) : null;
      const actor   = this._focusActor();
      const kind    = _feralKind(actor);

      const own = _rand(T[def.bank] || []);
      if (own) {
        this._chatHistory.push({
          role: 'player',
          text: String(own).replace(/\{kind\}/g, kind).replace(/\{name\}/g, npcName),
        });
      }

      // A creature that is liked gets away with more, one that is feared is
      // forgiven less: the same growl costs twice as much from a beast they
      // already want gone.
      const before = this._focusOpinion(profile);
      const mult   = def.op < 0 && before <= -20 ? 2 : 1;
      const delta  = Math.round(def.op * mult);
      if (profile) {
        _addNpcOpinion(profile, actor?.actorId(), delta);
        (profile.eventLog ??= []).push({
          tag: 'feral', desc: id, // i18n-ignore: event-log record id
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
      }

      // Reaction to where they stand AFTER it, so a nuzzle that wins them over
      // is answered warmly and a roar is answered by the person it frightened.
      // Unless the one being growled at is a beast too, in which case what
      // comes back is a beast's answer: noise, not a sentence about noise.
      let reply = _feralLine('feralReact', this._focusOpinion(profile), npcName, kind);
      if (reply && this._isNonSentientSubject()) reply = _feralGrowlFor(reply, this._subjectCreatureClass());
      if (reply) this._chatHistory.push({ role: 'npc', text: reply });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);

      if (delta >= 0) SoundManager.playOk(); else SoundManager.playBuzzer();
      this._activeTab = 'chat';
      this._render();
      this._scrollChatToBottom();
    }

    // The NPC noticing what has wandered up to them. Mirrors _sayEmGreeting:
    // one shot per focused member, appended as the newest line so the backlog
    // survives, and re-armed when the conversation is handed to somebody else.
    _prepareFeralMeeting() {
      if (this._entity || this._actorId != null) return;
      if (this._feralGreeted) return;
      const actor = this._focusActor();
      if (!_isNonSentientActor(actor)) return;
      const npcName = this._targetName();
      if (!npcName) return;
      let line = _feralLine(
        'feralGreet', this._focusOpinion(_getProfile(npcName)), npcName, _feralKind(actor)
      );
      if (!line) return;
      // Two beasts facing each other. The greeting above is a PERSON noticing
      // an animal, and a beast has no such sentence in it: what it has is the
      // noise its own class answers in. Same rule as the reaction in _feralAct,
      // so the two halves of a beast-to-beast meeting sound alike.
      if (this._isNonSentientSubject()) {
        line = _feralGrowlFor(line, this._subjectCreatureClass());
        this._beastGreeted = true; // one greeting between them, not two
      }
      this._feralGreeted = true;
      this._chatHistory.push({ role: 'npc', text: line });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // The other way round: the panel opened ON a beast. A non-sentient NPC has
    // no greeting because it has no words for one; what it has is the noise it
    // makes at whoever has just walked up to it, drawn from the same syllable
    // bank every other answer of its comes out of.
    _prepareBeastMeeting() {
      // Actor mode is included: a creature on the roster is opened on the same
      // way a creature on the street is, and it has no more of a greeting in
      // it than the other one does.
      if (this._entity) return;
      if (this._beastGreeted) return;
      if (!this._isNonSentientSubject()) return;
      const line = _feralNoise(2, this._subjectCreatureClass());
      if (!line) return;
      this._beastGreeted = true;
      this._chatHistory.push({ role: 'npc', text: line });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // ── Petting and feeding (what a beast is offered instead of talk) ───────
    // The kind of animal this panel is open on, for the lines that name it.
    // In actor mode that is the party member being inspected, otherwise the
    // creature standing in front of the party.
    _beastKind() {
      if (this._actorId != null) return _feralKind($gameActors.actor(this._actorId));
      const profile = _getProfile(this._targetName());
      return (window.NPCCreature?.archetypeLabel?.(profile)) || '';
    }

    // One line into the log, oldest trimmed off the top like everywhere else.
    _pushChat(role, text) {
      if (!text) return;
      this._chatHistory.push({ role, text: String(text) });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
    }

    // A hand laid on the animal. No band and no roll: this is the one action in
    // the panel that cannot go wrong, and the noise that comes back is the same
    // one every other answer of a beast's is drawn from.
    _pet() {
      const T       = _getT();
      const npcName = this._targetName() || '';
      const profile = npcName ? _getProfile(npcName) : null;
      const kind    = this._beastKind();

      const own = _rand(T.beastActPet || []);
      this._pushChat('player', String(own || '')
        .replace(/\{name\}/g, npcName).replace(/\{kind\}/g, kind));

      if (profile) {
        _addNpcOpinion(profile, this._focusActor()?.actorId(), PET_OPINION);
        (profile.eventLog ??= []).push({
          tag: 'feral', desc: 'pet', // i18n-ignore: event-log record id
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
      }
      this._pushChat('npc', _feralNoise(2, this._subjectCreatureClass()));

      SoundManager.playOk();
      this._activeTab = 'chat';
      this._render();
      this._scrollChatToBottom();
    }

    // ── The livestock half of a beast ───────────────────────────────────────
    // An `animal: true` sheet is not only something to talk to: it is a hen, a
    // cow, a rabbit, and AnimalGrowthSystem knows what each of those is worth
    // in eggs, milk and wool. Every animal answers here, not only one the
    // player bought: a hen dealt by the wardrobe onto a village street has a
    // breed, an age, an appetite and a laying cycle exactly like a bought one
    // (AnimalGrowthSystem.recordForAnimal mints its record on first sight).
    // Null for anybody who is not an animal at all.
    _animalRecord() {
      const AG = window.AnimalGrowthSystem;
      if (!AG || !AG.recordForAnimal) return null;
      if (this._actorId != null) return null;   // a party member is not livestock
      const name = this._targetName();
      const profile = name ? _getProfile(name) : null;
      if (!name || !profile || !profile.spriteKey) return null;
      const event = this._eventId != null ? $gameMap?.event(this._eventId) : null;
      return AG.recordForAnimal(name, profile.spriteKey, event) || null;
    }

    _animalStatus() {
      const AG = window.AnimalGrowthSystem;
      const rec = this._animalRecord();
      return (rec && AG.animalStatus) ? AG.animalStatus(rec) : null;
    }

    // Taking what the animal has ready. On the board only while there IS
    // something ready (see the action list), so reaching it with empty hands is
    // the rare race of the batch being collected from the Assets menu first.
    _collect() {
      const AG = window.AnimalGrowthSystem;
      const rec = this._animalRecord();
      const def = rec && AG?.ANIMAL_DB?.[rec.animalId];
      if (!rec || !def) { SoundManager.playBuzzer(); return; }
      const items = AG.collectProduce(rec, def);
      const T = _getT();
      const kind = this._beastKind();
      if (!items.length) {
        this._pushChat('npc', String(T.beastCollectNothing || '').replace(/\{kind\}/g, kind));
        SoundManager.playBuzzer();
      } else {
        AG.reportCollected?.(items);
        const what = items
          .map(r => `${$dataItems[r.itemId]?.name ?? ''} x${r.qty}`)
          .filter(Boolean).join(', ');
        this._pushChat('player', String(T.beastCollected || '')
          .replace(/\{kind\}/g, kind).replace(/\{items\}/g, what));
        this._pushChat('npc', _feralNoise(2, this._subjectCreatureClass()));
        SoundManager.playShop();
      }
      this._activeTab = 'chat';
      this._render();
      this._scrollChatToBottom();
    }

    // ── Asking an animal to come along ──────────────────────────────────────
    // A wild animal is simply asked ("Join as pet"); somebody's animal has to be
    // talked away from them ("Convince to join"), which is always the harder
    // ask and, for a dog, very nearly impossible: a dog knows whose it is. The
    // base odds come off the animal's own wardrobe entry (wildJoinChance /
    // ownedJoinChance) and the person asking adds their WIS: reading an animal
    // and being read by one is not a matter of muscle or of glibness.
    //
    // Thrown on the same d20 every other check in the game is thrown on, so the
    // player sees the number they were quoted actually rolled.
    // `asMember` is the difference between the two offers on the board: an
    // animal asked to follow becomes a pet, an animal asked to travel takes a
    // party slot. Same roll, same odds, same refusal; only the landing differs.
    async _animalJoin(asMember = false) {
      const AG = window.AnimalGrowthSystem;
      const status = this._animalStatus?.();
      const rec = this._animalRecord?.();
      if (!AG || !status || !rec) { SoundManager.playBuzzer(); return; }

      const T = _getT();
      const npcName = this._targetName() || '';
      const profile = npcName ? _getProfile(npcName) : null;
      const actor = this._focusActor() || $gameParty?.leader();
      const kind = this._beastKind();

      if (asMember) {
        if (!window.PetSystem?.hasFreeSlot?.()) { SoundManager.playBuzzer(); return; }
      } else if (_travellingPartyCount() >= 3) { SoundManager.playBuzzer(); return; }

      const chance = _animalJoinChance(status, actor);
      const wisMod = _wisMod(actor);
      let success;
      if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: status.owned ? `Convince: ${npcName}` : `Tame: ${npcName}`, // i18n-ignore: Dice3D check id
          statName: 'WIS', // i18n-ignore: Dice3D stat id
          modifier: wisMod,
          actor,
          force3D: true,
        });
        success = res.success;
      } else {
        success = Math.random() * 100 < chance;
      }

      if (!success) {
        SoundManager.playBuzzer();
        // Being pressed to leave sours it. The animal thinks less of the person
        // who asked, and an owned one takes it harder: it was being asked to
        // walk out on somebody.
        const sting = status.owned ? -8 : -4;
        if (profile) {
          _addNpcOpinion(profile, actor?.actorId(), sting);
          (profile.eventLog ??= []).push({
            tag: 'animalJoin', desc: 'refused to come along', // i18n-ignore: event-log record id
            timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
          });
        }
        this._pushChat('npc', String(T.beastJoinRefused || '')
          .replace(/\{kind\}/g, kind).replace(/\{name\}/g, npcName));
        this._joinMessage = {
          type: 'reject',
          text: String(T.beastJoinRefusedToast || '').replace(/\{name\}/g, npcName),
        };
        this._render();
        this._scrollChatToBottom();
        return;
      }

      SoundManager.playOk();
      // It comes along as a pet rather than as a party member: an animal walks
      // with the party, it does not hold a slot in it (PetFollowerSystem).
      const joined = asMember
        ? _recruitAnimalAsMember(rec, status, npcName, this._eventId)
        : _recruitAnimalAsPet(rec, status, npcName, this._eventId);
      if (!joined) {
        this._pushChat('npc', String(T.beastJoinRefused || '')
          .replace(/\{kind\}/g, kind).replace(/\{name\}/g, npcName));
        this._render();
        return;
      }
      if (profile) {
        _addNpcOpinion(profile, actor?.actorId(), 25);
        (profile.eventLog ??= []).push({
          tag: 'animalJoin', desc: 'came along with the party', // i18n-ignore: event-log record id
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
      }
      this._pushChat('npc', String(T.beastJoinAccepted || '')
        .replace(/\{kind\}/g, kind).replace(/\{name\}/g, npcName));
      this._joinMessage = {
        type: 'accept',
        text: String(T.beastJoinAcceptedToast || '').replace(/\{name\}/g, npcName),
      };
      this._justJoined = true;
      this._render();
      this._scrollChatToBottom();
    }

    // The bowl: everything in the pack an animal would put in its mouth.
    _feed() {
      this._feedMode          = true;
      this._feedItems         = _feedItemsInPack();
      this._giftMode          = false;
      this._stealMode         = false;
      this._bribeMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._socialMode        = false;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._transmitConfirm   = null;
      this._cardMode          = null;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    _feedItem(index) {
      const item = this._feedItems[index];
      if (!item) return;
      const T       = _getT();
      const npcName = this._targetName() || '';
      const profile = npcName ? _getProfile(npcName) : null;
      const kind    = this._beastKind();
      const delta   = _feedOpinion(item);

      $gameParty.loseItem(item, 1);

      if (profile) {
        _addNpcOpinion(profile, this._focusActor()?.actorId(), delta);
        // A fed animal is a fed animal whatever it thought of the meal, so the
        // stomach is filled even when the opinion drops.
        profile.hunger = Math.max(0, Math.min(100, (profile.hunger ?? 100) + _feedNourishment(item)));
      }
      // And if this is livestock, the same meal fills the bowl the growth and
      // the laying cycle are measured against: a hen nobody feeds stops laying
      // (AnimalGrowthSystem.nutritionOf).
      const AG = window.AnimalGrowthSystem;
      const animalRec = this._animalRecord?.();
      if (AG && animalRec) {
        AG.feedAnimal(animalRec);
      }
      if (profile) {
        (profile.eventLog ??= []).push({
          tag: 'feed', desc: `fed ${item.name}`, // i18n-ignore: event-log record id
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
      }

      // It eats either way; what changes is how it eats. A proper meal is
      // wolfed down and remembered, a thin one is taken politely, and raw meat
      // or a piece of somebody is chewed while it watches you differently.
      const bank = delta <= 0 ? 'beastFedBadly' : delta >= 12 ? 'beastFedWell' : 'beastFedPlain';
      this._pushChat('npc', String(_rand(T[bank] || []) || '')
        .replace(/\{item\}/g, item.name).replace(/\{name\}/g, npcName).replace(/\{kind\}/g, kind));

      this._joinMessage = {
        type: delta > 0 ? 'accept' : 'reject',
        text: T.fedBeast(npcName, item.name),
      };
      if (delta > 0) SoundManager.playOk(); else SoundManager.playBuzzer();

      this._feedMode = false;
      this._render();
      this._scrollChatToBottom();
    }

    // ── Social interactions (praise / joke / story / insult / ...) ───────────
    _socialize() {
      this._socialMode        = true;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    // ── Romance submenu (flirt / serenade / confess / kiss / ...) ────────────
    // The moves themselves, their odds and the compatibility gates live in
    // NPCEmpathizeUI.js, next to the orientation data the Romance tab reads.
    _romance() {
      this._romanceMode       = true;
      this._proposeMode       = false;
      this._socialMode        = false;
      this._directionsMode    = false;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    // ── Ask directions ──────────────────────────────────────────────────────
    // Lists the doors, teleports and people on this map; picking one has the
    // NPC point the player at it. Built in NPCEmpathizeUI.js.
    _askDirections() {
      this._directionsMode    = true;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._socialMode        = false;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._transmitConfirm   = null;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    // The button catalog for the Socialize submenu, labels localized.
    _socialCatalog() {
      const lang = ConfigManager.language === 'it' ? 'it' : 'en';
      const db   = _socialLines();
      const nm   = o => o.label || o.id;
      const out  = [];
      (db.interactions || []).forEach(i => out.push({ id: i.id, label: nm(i), tone: i.tone }));
      ['story', 'poem'].forEach(id => { const p = db.performances?.[id]; if (p) out.push({ id, label: nm(p), tone: 'performance' }); });
      out.push({ id: 'joke', label: T('Empathize.tellAJoke'), tone: 'performance' });
      return out;
    }

    // Build a procedural joke from the grammar in SocialLines.json. The whole
    // of it is module level now (_genJoke below the joke grammar), because the
    // map talk tells the same jokes with no panel open to tell them from.
    _genJoke() { return _genJoke(); }

    _socialInteract(id) {
      const npcName = this._targetName();
      const profile = _getProfile(npcName);
      const actor   = this._focusActor();
      const actorId = actor && actor.actorId();
      const recent  = _countRecentInteractions(profile, 'social_' + id, 3);
      const db      = _socialLines();
      const fill    = s => vary(String(s || '').replace(/\{name\}/g, npcName).replace(/\{subject\}/g, this._lastSubject || ''));

      let playerLine = '', npcLine = '', delta = 0;
      // Tone bucket of this interaction, for the Em stance pools below. Jokes
      // and performances have no fixed tone, they take the sign of the result.
      let emTone = '';

      if (id === 'joke') {
        playerLine = this._genJoke();
        const land = Math.random() < Math.max(0.15, 0.7 - recent * 0.18);
        if (land) {
          delta   = Math.round(Math.max(1, 5 - recent) * _personalitySocialMult(profile, 'positive'));
          npcLine = fill(_rand(Math.random() < 0.5 ? db.jokes?.landGood : db.jokes?.landGroan));
        } else {
          delta   = Math.round((recent >= 2 ? -(2 + recent) : -1) * _personalitySocialMult(profile, 'negative'));
          npcLine = fill(_rand(db.jokes?.flop));
        }
      } else if (id === 'story' || id === 'poem') {
        const perf    = db.performances?.[id] || { base: 5, player: [], good: [], bad: [] };
        const subject = (window.RandomBookGenerator?.generateTitle)
          ? window.RandomBookGenerator.generateTitle()
          : T('Empathize.oldLegend');
        this._lastSubject = subject;
        // Reaction depends on the NPC's personality and trait affinity with the
        // performer, plus a whim, minus repetition fatigue.
        const lean  = (((profile?.personalityIndex ?? 0) % 7) - 3) * 2;         // -6..+6
        const compat = Math.round(_traitCompatBonus(profile, actor) / 10);       // trait affinity
        const whim  = Math.floor(Math.random() * 11) - 5;                        // -5..+5
        const raw   = (perf.base || 5) + lean + compat + whim - recent * 2;
        if (raw > 0) { delta = Math.max(1, Math.round(raw / 2 * _personalitySocialMult(profile, 'positive')));  npcLine = fill(_rand(perf.good)); }
        else         { delta = Math.min(-1, Math.round(raw / 2 * _personalitySocialMult(profile, 'negative'))); npcLine = fill(_rand(perf.bad)); }
        playerLine = fill(_rand(perf.player));
      } else {
        const def = _socialById()[id];
        if (!def) return;
        playerLine = fill(_rand(def.player));
        let sincere = true;
        if (def.tone === 'positive') {
          delta = def.baseDelta - recent * Math.max(2, Math.ceil(def.baseDelta / 2.5));
          delta = Math.round(delta * _personalitySocialMult(profile, 'positive'));
          if (delta <= 0) { sincere = false; delta = -Math.min(8, 2 + recent * 2); }
        } else if (def.tone === 'neutral') {
          delta = Math.max(0, (def.baseDelta || 1) - recent);
          delta = Math.round(delta * _personalitySocialMult(profile, 'neutral'));
          sincere = delta > 0;
        } else { // negative
          delta = def.baseDelta - Math.min(6, Math.max(0, recent - 1) * 2);
          delta = Math.round(delta * _personalitySocialMult(profile, 'negative'));
          sincere = false;
        }
        const pool = def.tone === 'negative' ? def.responseBad : (sincere ? def.responseGood : def.responseBad);
        npcLine = fill(_rand(pool));
        emTone = def.tone;
      }

      // Em (Switch 48): the NPC answers her, not a stranger. Their stance owns
      // the reply and scales what the interaction is worth, so praise from the
      // god-killer lands very differently on a zealot and on an invasive fan.
      // The two of them talking to each other owns the exchange outright, in
      // whichever direction it is running: the world's opinion of either of
      // them has nothing to do with it, so neither layer below is consulted.
      const pairCtx = this._pairCtx();
      if (pairCtx) {
        const tone = emTone || (delta >= 0 ? 'positive' : 'negative');
        const said = _rand(pairCtx.data.player?.[tone] || pairCtx.data.player);
        if (said && id !== 'joke' && id !== 'story' && id !== 'poem') playerLine = fill(said);
        const back = _rand(pairCtx.data[tone]);
        if (back) npcLine = fill(back);
        delta = Math.round(Math.abs(delta) * _stanceToneMult(pairCtx, tone));
        // Insulting each other is the friendliest thing either of them does.
        // Whatever the move was meant to be worth, between the two of them it
        // comes out the same way: up. The bond takes it instead of an opinion,
        // uncapped, and nothing is filed against either of them for it.
        _addPairBond(delta);
      }

      const emCtx = pairCtx ? null : this._emCtx();
      if (emCtx) {
        if (!emTone) emTone = delta >= 0 ? 'positive' : 'negative';
        const emLine = _rand(emCtx.data[emTone]);
        if (emLine) npcLine = fill(emLine);
        delta = Math.round(delta * _stanceToneMult(emCtx, emTone));
        // She does not speak like the party leader she is standing in for: the
        // "player" pool of the em block is her own voice, keyed by tone. A joke
        // or a performance is content she chose, so those keep the line they
        // generated; everything else is answered in her words.
        if (id !== 'joke' && id !== 'story' && id !== 'poem') {
          const emSaid = _rand(_emDb().player?.[emTone]);
          if (emSaid) playerLine = fill(emSaid);
        }
      }

      // Bubba (Switch 49): he does not perform, he deflects. Whatever the move
      // was, he says something modest about a shed and a wrench, and the NPC
      // answers the man who gave them their roads back rather than a stranger.
      const bubbaCtx = pairCtx ? null : this._bubbaCtx();
      if (bubbaCtx) {
        let tone = emTone || (delta >= 0 ? 'positive' : 'negative');
        const modest = _rand(bubbaCtx.data.player);
        if (modest) playerLine = fill(modest);
        const line = _rand(bubbaCtx.data[tone]);
        if (line) npcLine = fill(line);
        delta = Math.round(delta * _stanceToneMult(bubbaCtx, tone));
      }

      // Entertainment that landed is worth something to everybody who was
      // there: the Fun meter of the whole party (the performer most) and the
      // NPC's own. A flop pays nobody.
      const funStep = _payFun(actorId, profile, npcName, id, delta);

      // Apply reputation to the focused member only. The pair keep their own
      // ledger (above) and are on nobody's faction books for teasing.
      if (profile && actorId != null && !pairCtx) {
        _addNpcOpinion(profile, actorId, delta);
        (profile.eventLog ??= []).push({
          tag: 'social_' + id, desc: `${id} (${delta >= 0 ? '+' : ''}${delta})`,
          timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
        });
        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (faction != null && delta !== 0 && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, Math.round(delta / 6));
      }

      // Whatever the pools wrote back, a beast has no sentence to say it in.
      // Same rule as _feralAct and the free-chat path, and the backstop for
      // every route that reaches a non-sentient subject holding prose: the
      // party's own creature is a creature too, so the roster panel answers
      // in the voice of its class exactly as a beast met on the street does.
      if (npcLine && this._isNonSentientSubject()) {
        npcLine = _feralGrowlFor(npcLine, this._subjectCreatureClass());
      }

      // Present it as a chat exchange (player line, then the NPC's reaction).
      // Picking an option closes the Socialize submenu back to the normal
      // action row, same as Cancel would.
      this._socialMode  = false;
      this._activeTab   = 'chat';
      this._chatHistory.push({ role: 'player', text: playerLine });
      this._isTyping = true;
      this._joinMessage = {
        type: delta >= 0 ? 'accept' : 'reject',
        text: `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`
          + (funStep ? ` +${funStep} ☺` : ''),
      };
      this._render();
      this._scrollChatToBottom();
      setTimeout(() => {
        this._isTyping = false;
        this._chatHistory.push({ role: 'npc', text: npcLine });
        if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
        this._render();
        this._scrollChatToBottom();
      }, 350);
    }

    // Buy the procedural-house floor the player is currently standing in from
    // the resident NPC. Price scales down with disposition; on purchase the
    // seller moves out (event erased) and the build menu unlocks for this floor.
    _buyHouse() {
      const phs = window.ProceduralHouseSystem;
      const T   = _getT();
      if (!phs?.canOfferPurchase?.()) { SoundManager.playBuzzer(); return; }

      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const opinion = this._focusOpinion(profile);
      const price   = phs.getCurrentFloorPrice(opinion);

      if ($gameParty.gold() < price) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.notEnoughGold((price / 100).toFixed(2)) };
        this._render();
        return;
      }

      $gameParty.loseGold(price);
      phs.buyCurrentFloor();
      // The seller moves out, leaving the floor to the player.
      if (evId != null && $gameMap?.event(evId)) $gameMap.event(evId).erase();

      SoundManager.playOk();
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
    }

    _gift() {
      this._giftMode          = true;
      // A creature hands over what a creature understands to hand over, and a
      // creature is handed only what it understands to take: food, or a piece
      // of something that used to be alive. Either end of the exchange being a
      // beast narrows the tray.
      const feral = _isNonSentientActor(this._focusActor()) || this._isNonSentientSubject();
      this._giftItems         = ($gameParty?.items() ?? [])
        .filter(i => i.itypeId === 1 && (!feral || _feralCanGift(i)) &&
          !(window.VectorGun && window.VectorGun.isBound(i)));
      this._stealMode         = false;
      this._bribeMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    _giveItem(index) {
      const item = this._giftItems[index];
      if (!item) return;

      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const T       = _getT();

      // Read before the present moves the needle, so the reaction is to the
      // giver they knew walking in.
      const priorOpinion = this._focusOpinion(profile);

      // Somebody who thinks badly of the giver does not take presents from
      // them. The item never leaves the bag, and the attempt is remembered as
      // one more thing they had to push away. Party members (actor mode, no
      // society profile) always accept: the reading there is only hygiene.
      if (profile && this._actorId == null && priorOpinion < 0) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.giftRefused(npcName, item.name) };
        const refusal = _rand(T.giftRefusalLines || []);
        if (refusal) {
          this._chatHistory.push({
            role: 'npc',
            text: String(refusal).replace(/\{item\}/g, item.name).replace(/\{name\}/g, npcName),
          });
          if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
        }
        if (profile) {
          (profile.eventLog ??= []).push({
            tag: 'gift', desc: `refused ${item.name}`, // i18n-ignore: event-log record id
            timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
          });
        }
        this._giftMode = false;
        this._feedMode = false;
        this._render();
        this._scrollChatToBottom();
        return;
      }

      $gameParty.loseItem(item, 1);

      const recentGifts = _countRecentInteractions(profile, 'gift', 5);
      const giftMult    = recentGifts >= 3 ? 0.5 : 1;
      const delta = Math.round(Math.max(5, Math.min(25, (item.price || 0) / 50)) * giftMult);
      if (profile) {
        _addNpcOpinion(profile, this._focusActor()?.actorId(), delta);
        (profile.eventLog ??= []).push({ tag: 'gift', desc: `received ${item.name}`, timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0 });

        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (faction != null && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, Math.ceil(delta / 5));
      }

      SoundManager.playOk();
      this._joinMessage = { type: 'accept', text: T.gaveItem(npcName, item.name) };

      // They say something about what they have just been handed: warmly for
      // something worth having, flatly for a trinket, wearily at the fourth
      // present in a row. Anyone who would have taken it coldly refused it
      // above, so there is no cold bank left to reach here.
      const bank = recentGifts >= 3 ? 'giftReactionRepeat'
        : delta >= 18               ? 'giftReactionWarm'
        :                             'giftReactionPlain';
      const line = _rand(T[bank] || []);
      if (line) {
        this._chatHistory.push({
          role: 'npc',
          text: String(line).replace(/\{item\}/g, item.name).replace(/\{name\}/g, npcName),
        });
        if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      }

      this._giftMode    = false;
      this._feedMode    = false;
      this._render();
      this._scrollChatToBottom();
    }

    _bribe() {
      this._bribeMode         = true;
      this._giftMode          = false;
      this._feedMode          = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._render();
    }

    // Classes that enforce the law rather than skirt it. IDs match the
    // ClassSelector roster (44 = Police Officer); they refuse a bribe outright
    // and report the attempt instead of rolling the usual accept/fail chance.
    static get LAW_CLASSES() { return [44]; }

    async _attemptBribe(tierIndex) {
      const BASE_TIERS = [
        { gold: 200,  op: 10, chance: 70 },
        { gold: 500,  op: 22, chance: 80 },
        { gold: 1000, op: 40, chance: 90 },
      ];
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const T       = _getT();
      const opinion = this._focusOpinion(profile);

      const recentBribes = _countRecentInteractions(profile, 'bribe', 5);
      const costMult     = recentBribes >= 2 ? 1.5 : 1;
      const base         = BASE_TIERS[tierIndex];
      if (!base) return;
      const tier = { ...base, gold: Math.round(base.gold * costMult) };

      if ($gameParty.gold() < tier.gold) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.notEnoughGold((tier.gold / 100).toFixed(2)) };
        this._render();
        return;
      }

      const evClassId = profile?.assignedClassId ?? _extractClassId($gameMap?.event(evId));
      if (Scene_NPCEmpathize.LAW_CLASSES.includes(evClassId)) {
        SoundManager.playBuzzer();
        if (profile) {
          _addNpcOpinion(profile, this._focusActor()?.actorId(), -30);
          (profile.eventLog ??= []).push({
            tag: 'bribe', desc: 'bribe attempt reported (law enforcement)', // i18n-ignore: event-log record id
            timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
          });
        }
        window.CrimeSystem?.addCrime?.('Bribery', tier.gold); // i18n-ignore: CrimeSystem category id
        this._joinMessage = {
          type: 'reject',
          text: T.bribeRefusedLaw(npcName),
        };
        this._bribeMode = false;
        this._render();
        return;
      }

      if (opinion <= -60) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.bribeRefused(npcName) };
        this._bribeMode   = false;
        this._render();
        return;
      }

      $gameParty.loseGold(tier.gold);
      const actor = this._focusActor() || $gameParty.leader();
      const psiMod = actor ? (actor.psiMod ?? Math.floor(((actor.luk || 10) - 10) / 2)) : 0;
      let success = false;

      if (window.Dice3D) {
        const rollRes = await window.Dice3D.rollPercentage(tier.chance, {
          actionName: `Bribe: ${npcName}`,
          statName: 'PSI (Charisma)',
          modifier: psiMod,
          force3D: true
        });
        success = rollRes.success;
      } else {
        success = Math.random() * 100 < tier.chance;
      }

      if (profile) (profile.eventLog ??= []).push({ tag: 'bribe', desc: success ? 'bribe accepted' : 'bribe failed', timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0 }); // i18n-ignore: event-log record ids

      if (success) {
        if (profile) _addNpcOpinion(profile, this._focusActor()?.actorId(), tier.op);
        SoundManager.playOk();
        this._joinMessage = { type: 'accept', text: T('Empathize.bribeAccepted', { name: npcName, op: tier.op }) };
      } else {
        window.CrimeSystem?.addCrime?.('Bribery', tier.gold); // i18n-ignore: CrimeSystem category id
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.briberyCaught(npcName) };
      }

      this._bribeMode = false;
      this._render();
    }

    _attack() {
      const npcName = _getNPCName(this._eventId);
      const T       = _getT();
      this._attackConfirm     = true;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._joinMessage       = { type: 'reject', text: T.attackWarning(npcName) };
      this._render();
    }

    _confirmAttack() {
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);

      if (profile) {
        const actorId = this._focusActor()?.actorId();
        // Hitting somebody is the opposite of company: it costs the party the
        // same social need a friendly exchange would have paid them.
        _gainSocialFromOpinion(actorId, -100 - _npcBaseOpinion(profile, actorId), profile);
        _setNpcBaseOpinion(profile, actorId, -100);
        (profile.eventLog ??= []).push({ tag: 'crime', desc: 'attacked by player', timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0 }); // i18n-ignore: event-log record id
        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (faction != null && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, -20);
      }

      const bounty = 500 + ((profile?.level ?? 1) * 50);
      window.CrimeSystem?.addCrime?.('Assault', bounty); // i18n-ignore: CrimeSystem category id

      $gameVariables.setValue(6, evId);
      this._attackConfirm = false;
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
      // Who is being fought, so a kill can be written back onto their event
      // (SECTION 5b). Taken here, while the map they stand on is still the
      // current one; the panel may have been opened on a different event than
      // the one it ends up acting for (wiki navigation), so `evId` rules.
      if (evId != null && $gameMap)
        $gameTemp._NPCEmpathizeAttackTarget = { mapId: $gameMap.mapId(), eventId: evId, name: npcName };
      // The face the fight is fought against, taken here for the same reason.
      $gameTemp._NPCEmpathizeAttackFace = _buildBattleFace(npcName, $gameMap?.event(evId));
      $gameTemp._NPCEmpathizeStartBattle = 2;
    }

    _pickpocket() {
      const T = _getT();
      this._pickpocketConfirm = true;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._attackConfirm     = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      this._joinMessage       = { type: 'reject', text: T.confirmPickpocket };
      this._render();
    }

    _confirmPickpocket() {
      const ev = $gameMap?.event(this._eventId);
      let items = [];
      if (window.ShopScanner) {
        const all = window.ShopScanner.scanMapForShops?.() || [];
        items = all.filter(i => i.sourceEventId === this._eventId);
        if (!items.length && ev)
          items = window.ShopScanner.generateNPCItems?.(ev) || [];
      }
      this._stealItems        = items;
      this._pickpocketConfirm = false;
      this._stealMode         = true;
      this._stealAttempted    = {};
      this._menuIndex         = 0;
      this._render();
    }

    _cancelSubMode() {
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._pickpocketConfirm = false;
      this._attackConfirm     = false;
      this._infectMode        = false;
      this._transmitConfirm   = null;
      this._socialMode        = false;
      this._romanceMode       = false;
      this._proposeMode       = false;
      this._directionsMode    = false;
      this._cardMode          = null;
      this._stealAttempted    = {};
      this._joinMessage       = null;
      this._menuIndex         = 0;
      this._render();
    }

    // One pocket at a time. The die is thrown on screen and takes seconds to
    // land, so the row is spent the moment it is picked (which greys it out for
    // the mouse and for the pad alike) and no other row answers until the
    // throw is over. Awaiting it also matters for the outcome itself: the
    // roller hands back a promise, and a promise read as a result is always
    // a success.
    async _attemptSteal(index) {
      if (this._stealRolling) return;
      const item = this._stealItems[index];
      if (!item) return;
      const key = `${item.type}_${item.id}`;
      if (this._stealAttempted[key]) return;

      const agility = $gameParty.leader()?.agi ?? 10;
      const chance  = window.StealCalculator?.calculateStealChance(item.data, agility) ?? 50;
      const dexMod  = Math.floor(((agility || 10) - 10) / 2);
      this._stealRolling      = true;
      this._stealAttempted[key] = 'rolling';
      this._render();
      let success = false;
      try {
        success = await Promise.resolve(
          window.StealCalculator?.performSteal(chance, { actionName: 'Pickpocket', statName: 'DEX', modifier: dexMod }) ?? false); // i18n-ignore: Dice3D check id
      } finally {
        this._stealRolling = false;
      }
      // The panel can be gone by the time the die lands (the scene was left, or
      // the picker was cancelled): the theft still counts, only the row does not.
      const stillOpen = !!this._overlay;

      $gameVariables.setValue(79, item.data.price ?? 0);

      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      if (profile) {
        _addNpcOpinion(profile, this._focusActor()?.actorId(), -25);
        (profile.eventLog ??= []).push({ tag: 'crime', desc: 'pickpocketed by player', timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0 }); // i18n-ignore: event-log record id
      }

      if (success) {
        $gameParty.gainItem(item.data, 1);
        this._stealAttempted[key] = 'success';
        SoundManager.playOk();
      } else {
        $gameTemp.reserveCommonEvent(125);
        this._stealAttempted[key] = 'fail';
        SoundManager.playBuzzer();
      }
      if (stillOpen) this._render();
    }

    _trade() {
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const opinion = this._focusOpinion(profile);
      const T       = _getT();

      if (opinion <= -20) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.refuseTrade(npcName) };
        this._render();
        return;
      }

      // Goodwill sets the starting price; Barter (specialization 30) is what the
      // party can actually talk it down to on top of that. The clamps are wider
      // than the opinion-only ones they replace so a trained trader has room to
      // work, but they still exist: nobody sells at half price out of fondness.
      const trader = this._focusActor();
      const barterBuy = window.SpecializationXP
        ? window.SpecializationXP.discountFor(trader, 'Barter', 0.05, 0.8) : 1;
      const barterSell = window.SpecializationXP
        ? window.SpecializationXP.multiplierFor(trader, 'Barter', 0.08) : 1;
      const buyFactor  = Math.max(0.65, (1 - Math.max(0, opinion) / 500) * barterBuy);
      const sellFactor = Math.min(1.5, (1 + Math.max(0, opinion) / 500) * barterSell);
      const ev         = $gameMap?.event(evId);
      const cid        = _extractClassId(ev);
      const goods      = [];

      if (profile && window.NPCSocietyGetEquip) {
        const equip = window.NPCSocietyGetEquip(npcName, cid ?? profile.assignedClassId, profile.wealthTierBase ?? 2);
        if (equip.weaponId && $dataWeapons?.[equip.weaponId])
          goods.push([1, equip.weaponId, 1, Math.max(1, Math.floor($dataWeapons[equip.weaponId].price * buyFactor))]);
        for (const aId of (equip.armorIds || []))
          if ($dataArmors?.[aId])
            goods.push([2, aId, 1, Math.max(1, Math.floor($dataArmors[aId].price * buyFactor))]);
      }
      for (const iId of (profile?.itemIds || []))
        if ($dataItems?.[iId])
          goods.push([0, iId, 1, Math.max(1, Math.floor($dataItems[iId].price * buyFactor))]);

      SoundManager.playOk();
      // Opening the haggle is the practice; the shop itself then trains
      // Haggling and Appraising on whatever actually changes hands.
      if (window.SpecializationXP) {
        window.SpecializationXP.awardCapped('Barter', 1, { actor: trader });
      }
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
      $gameTemp._NPCEmpathizeOpenTrade = { goods, sellFactor };
    }

    // ── Cards ───────────────────────────────────────────────────────────────

    // Common gate for both card actions: the panel refuses in the NPC's own
    // voice rather than opening a submenu that could only be cancelled.
    _cardRefuse(profile, npcName, kind) {
      SoundManager.playBuzzer();
      this._joinMessage = { type: 'reject', text: _cardRefusalLine(profile, npcName, kind) };
      this._render();
    }

    _cardBlocked(text) {
      SoundManager.playBuzzer();
      this._joinMessage = { type: 'reject', text };
      this._render();
    }

    _cardDuel() {
      const T       = _getT();
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      const CGx     = window.CardGame;
      if (!CGx || !window.CardDuel) return;

      if (this._focusOpinion(profile) <= CARD_REFUSE_OPINION) {
        this._cardRefuse(profile, npcName, 'duel');
        return;
      }
      // A duel is played out of a deck, and a party with nothing to play with
      // is told so instead of being dealt an empty hand.
      if (!CGx.canDuel()) {
        this._cardBlocked(T('Empathize.cardNoDeck', { min: CGx.DECK_MIN }));
        return;
      }
      if (CGx.hasDuelledToday(npcName)) {
        this._cardBlocked(T('Empathize.cardAlreadyDuelled', { name: npcName }));
        return;
      }

      SoundManager.playOk();
      this._cancelSubModeQuiet();
      this._cardMode  = 'stake';
      this._menuIndex = 0;
      this._render();
    }

    // Clears every other submenu without a re-render, so opening a card
    // submenu does not blink the panel twice.
    _cancelSubModeQuiet() {
      this._giftMode = this._bribeMode = this._stealMode = this._feedMode = false;
      this._pickpocketConfirm = this._attackConfirm = false;
      this._socialMode = this._romanceMode = this._proposeMode = this._directionsMode = false;
      this._infectMode = false;
      this._transmitConfirm = null;
      this._joinMessage = null;
      this._activeTab = 'chat';
    }

    // What can actually be put on the table: nothing, money neither purse would
    // miss, or an item against one of theirs of comparable worth.
    _cardStakeOptions() {
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      const purse   = Math.min($gameParty.gold(), Math.max(0, profile?.money ?? 0));
      const tiers   = [0.05, 0.15, 0.35].map(f => Math.floor(purse * f)).filter(v => v >= 100);
      return {
        money: Array.from(new Set(tiers)),
        item: this._cardItemStake(profile)
      };
    }

    // The party puts up its dearest spare item; the NPC answers with whatever
    // they own that is nearest it in price, out of the same pool the haggle
    // reads (their items plus the gear they are wearing).
    _cardItemStake(profile) {
      const mine = $gameParty.items()
        .filter(item => item && item.itypeId !== 2 && (item.price || 0) > 0)
        .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
      if (!mine) return null;

      const pool = [];
      for (const id of (profile?.itemIds ?? [])) {
        if ($dataItems?.[id] && ($dataItems[id].price || 0) > 0) pool.push({ kind: 0, id, obj: $dataItems[id] });
      }
      if (profile && window.NPCSocietyGetEquip) {
        const ev    = $gameMap?.event(this._eventId);
        const cid   = _extractClassId(ev) ?? profile.assignedClassId;
        const equip = window.NPCSocietyGetEquip(_getNPCName(this._eventId), cid, profile.wealthTierBase ?? 2);
        if (equip.weaponId && $dataWeapons?.[equip.weaponId]) {
          pool.push({ kind: 1, id: equip.weaponId, obj: $dataWeapons[equip.weaponId] });
        }
        for (const aId of (equip.armorIds ?? [])) {
          if ($dataArmors?.[aId]) pool.push({ kind: 2, id: aId, obj: $dataArmors[aId] });
        }
      }
      if (!pool.length) return null;

      const want = mine.price || 0;
      pool.sort((a, b) => Math.abs((a.obj.price || 0) - want) - Math.abs((b.obj.price || 0) - want));
      const theirs = pool[0];
      return { playerItem: { kind: 0, id: mine.id }, npcItem: { kind: theirs.kind, id: theirs.id } };
    }

    _startCardDuel(stake) {
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      SoundManager.playOk();
      // Same handover the haggle uses: close the panel, let go of the event,
      // and let the map open the table on the next quiet frame.
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
      $gameTemp._NPCEmpathizeOpenCardDuel = {
        opponentName: npcName,
        opponentDeck: window.CardGame.npcDeck(npcName, profile),
        npcName, profile, stake,
        actorId: this._focusActor()?.actorId() ?? null
      };
    }

    _cardTrade() {
      const T       = _getT();
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      const CGx     = window.CardGame;
      if (!CGx) return;

      if (this._focusOpinion(profile) <= CARD_REFUSE_OPINION) {
        this._cardRefuse(profile, npcName, 'trade');
        return;
      }
      if (CGx.hasTradedToday(npcName)) {
        this._cardBlocked(T('Empathize.cardAlreadyTraded', { name: npcName }));
        return;
      }
      if (!this._cardSpares().length) {
        this._cardBlocked(T('Empathize.cardNothingToSwap'));
        return;
      }

      SoundManager.playOk();
      this._cancelSubModeQuiet();
      this._cardMode  = 'trade';
      this._menuIndex = 0;
      this._render();
    }

    // Copies the party can part with. A card the active deck is holding is not
    // spare, so a swap can never quietly gut the deck being played with.
    _cardSpares() {
      const CGx = window.CardGame;
      if (!CGx) return [];
      const deck = CGx.activeDeck();
      const held = {};
      for (const key of (deck?.cards ?? [])) held[key] = (held[key] || 0) + 1;
      return CGx.ownedKeys().filter(key => CGx.countOf(key) - (held[key] || 0) > 0);
    }

    // Every swap on the table: one of theirs, and what it would cost.
    _cardTradeOffers() {
      const CGx = window.CardGame;
      if (!CGx) return [];
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      const spares  = this._cardSpares();
      return CGx.npcCards(npcName, profile)
        .map(wanted => ({ theirs: wanted, mine: CGx.tradeCounterOffer(wanted, spares) }))
        .filter(offer => offer.mine)
        .slice(0, 8);
    }

    _doCardTrade(index) {
      const T       = _getT();
      const CGx     = window.CardGame;
      const offer   = this._cardTradeOffers()[index];
      if (!CGx || !offer) { SoundManager.playBuzzer(); return; }
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);

      CGx.removeCard(offer.mine, 1);
      CGx.addCard(offer.theirs, 1);
      CGx.markTraded(npcName);

      // Swapping cards with somebody is time spent with them, and they think a
      // little better of whoever did the swapping.
      _addNpcOpinion(profile, this._focusActor()?.actorId(), 3);
      this._gainCompany();
      try {
        window.ParchmentToast?.show(
          T('Empathize.cardSwapped', { mine: CGx.nameOf(offer.mine), theirs: CGx.nameOf(offer.theirs) }),
          { severity: 'good', duration: 150 }
        );
      } catch (e) { /* a popup never breaks a trade */ }

      AudioManager.playSe({ name: 'Casino/card_slide_2', volume: 65, pitch: 110, pan: 0 });
      this._cardMode = null;
      this._joinMessage = { type: 'accept', text: T('Empathize.cardSwapDone', { name: npcName }) };
      this._render();
    }

    _treatWounds() {
      const npcName = _getNPCName(this._eventId);
      const profile = _getProfile(npcName);
      const opinion = this._focusOpinion(profile);
      const T       = _getT();

      if (opinion <= -20) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.refuseHelp(npcName) };
        this._render();
        return;
      }

      const members  = $gameParty.members();
      const lvls     = members.map(a => a.level).filter(Number.isFinite).sort((a, b) => a - b);
      const medianLv = lvls.length ? lvls[Math.floor((lvls.length - 1) / 2)] : 1;

      if (opinion >= 20) {
        members.forEach(a => a.recoverAll());
        SoundManager.playOk();
        this._joinMessage = { type: 'accept', text: T.healFree(npcName) };
        this._render();
        return;
      }

      const cost = members.length * medianLv * 100;
      if ($gameParty.gold() < cost) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.notEnoughGold((cost / 100).toFixed(2)) };
        this._render();
        return;
      }

      $gameParty.loseGold(cost);
      members.forEach(a => a.recoverAll());
      SoundManager.playOk();
      this._joinMessage = { type: 'accept', text: T.healCost(npcName, (cost / 100).toFixed(2)) };
      this._render();
    }

    async _join() {
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const T       = _getT();

      // Join gates, mirroring the UI gate in _renderInner: the level margin, the
      // event needing a self-switch A page to disappear behind once it is
      // recruited, and never a shop-shift-covered counter (the face shown is a
      // borrowed persona, not someone free to travel, and flipping the
      // counter's own self-switch A would strand it, see
      // ShopShiftManager.isShopEvent). No Switch 67 or name-matching.
      // A full party is NOT a gate any more: the fourth person to say yes signs
      // on inactive and waits on the Dynamics board (NPCSystemParty.joinParty).
      if (!_hasSelfSwitchAPage(evId)
          || window.NPCSim?.isShopShiftCovered?.($gameMap?.event(evId))
          || window.NPCSystem?.isAnyShopEvent?.($gameMap?.event(evId))
          || !_joinLevelOk(_presetFromEvent($gameMap?.event(evId))?.level ?? profile?.level)) {
        SoundManager.playBuzzer();
        return;
      }

      // Bubba never rides along with Em: somebody has to keep the camper alive,
      // and a jealous goddess makes travelling together a bad idea for the towns
      // they would sleep in. He turns her down in his own words, no roll, no
      // reputation hit (the UI hides Join for him, this is the safety net).
      const emCtx = this._emCtx();
      if (emCtx?.bubba) {
        SoundManager.playBuzzer();
        const line = _rand(emCtx.data.refuseJoin);
        if (line) {
          this._chatHistory.push({ role: 'npc', text: String(line).replace(/\{name\}/g, npcName) });
          if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
          this._render();
          this._scrollChatToBottom();
        }
        return;
      }

      const opinion = this._focusOpinion(profile);
      // Same formula the Join label advertises (50% at neutral, lower when the
      // NPC dislikes you, higher when they like you, level ignored). Debug/sandbox
      // play forces it near-certain so companions can be assembled for testing.
      const chance  = _joinChance(opinion, this._focusActor());

      // Thrown on the same d20 every other check in the game is thrown on, so
      // the player watches the odds the button quoted actually roll. Talking
      // somebody into travelling with you is PSI, the stat every other social
      // move in this panel is argued with.
      const actor  = this._focusActor() || $gameParty?.leader();
      const psiMod = actor ? (actor.psiMod ?? Math.floor(((actor.luk || 10) - 10) / 2)) : 0;
      let joinRoll;
      if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Join: ${npcName}`, // i18n-ignore: Dice3D check id
          statName: 'PSI', // i18n-ignore: Dice3D stat id
          modifier: psiMod,
          actor,
          force3D: true,
        });
        joinRoll = !res.success;
      } else {
        joinRoll = Math.random() * 100 >= chance;
      }

      if (joinRoll) {
        SoundManager.playBuzzer();
        // Being turned down stings a little, the NPC remembers being pressed.
        if (profile) {
          _addNpcOpinion(profile, this._focusActor()?.actorId(), -2);
          profile.eventLog = profile.eventLog || [];
          profile.eventLog.unshift({ tag: 'social', desc: 'declined to join the party', // i18n-ignore: event-log record id
            gameMin: $gameVariables?.value(114) ?? 0, timestamp: Date.now() });
          if (profile.eventLog.length > 30) profile.eventLog.pop();
        }
        const phrases = T.joinRefusalPhrases;
        const refusal = phrases[Math.floor(Math.random() * phrases.length)];
        this._chatHistory.push({ role: 'npc', text: refusal });
        if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
        this._render();
        this._scrollChatToBottom();
        return;
      }

      SoundManager.playOk();
      const db = _resolveMarkovDb(evId, profile);
      if (profile) profile.markovDb = db;

      // Joining a party is a bonding moment, the newcomer and every current
      // member (leader included) warm to each other. Captured before the
      // party roster changes below.
      const priorMembers = ($gameParty?.members() ?? []).slice();
      if (profile) profile.playerOpinion = Math.min(100, (profile.playerOpinion ?? 0) + 40);
      _gainSocialFromOpinion(this._focusActor()?.actorId(), 40, profile);
      for (const member of priorMembers) {
        if (member.actorId() === 1) continue; // leader bond lives in playerOpinion
        window.NPCSim?.bumpMutualOpinion?.(npcName, member.name(), 40);
      }

      // Execute the join silently (suppress the RPG Maker message box, we
      // show feedback inside this panel instead of closing it).
      // Call the exported global directly so the full joinParty flow
      // (transformActor, addActor, self-switch A) runs reliably.
      let joined = false;
      if (window._NPCSystemPartyJoin) {
        window._npcEmpathizeSilentJoin = true;
        $gameTemp.lastPluginCommandEventId = evId;
        joined = window._NPCSystemPartyJoin(db, evId) === true;
        $gameTemp.lastPluginCommandEventId = null;
        window._npcEmpathizeSilentJoin = false;
      } else {
        console.error('[NPCEmpathize] window._NPCSystemPartyJoin not found, is NPCSystemParty.js loaded?');
      }

      // joinParty reports whether the NPC actually joined (actor added +
      // self-switch A set). Only claim success if it really happened - otherwise
      // the panel would show "joined!" while the party stayed unchanged.
      if (!joined) {
        SoundManager.playBuzzer();
        // Every failure used to be reported as "party is full", including the
        // ones that were nothing of the kind (no event to recruit, a refusal).
        const reason   = $gameTemp?._npcJoinFailReason;
        const failText = reason === 'partyFull' ? T.partyFull
          : reason === 'refused' ? T('Empathize.joinRefused')
          : T('Empathize.joinFailed');
        this._chatHistory.push({ role: 'npc', text: failText });
        if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
        this._joinMessage = { type: 'reject', text: failText };
        this._render();
        this._scrollChatToBottom();
        return;
      }

      // Recruited: hide the Join action for the rest of this panel session so it
      // can't be pressed again for an NPC that already joined.
      this._justJoined = true;

      // Flip the interacted event onto its self-switch A page so the recruit
      // stops standing on the map. joinParty already does this for the event it
      // resolved internally; repeat it here (idempotent) for the event this
      // panel was actually opened from, which can differ after wiki navigation
      // or when a shop-shift stand-in supplied the profile, and refresh so the
      // page swap lands immediately instead of on the next map update.
      const swEvId = evId ?? this._launchEventId;
      if (swEvId != null && $gameMap) {
        $gameSelfSwitches.setValue([$gameMap.mapId(), swEvId, 'A'], true);
        $gameMap.event(swEvId)?.refresh();
        // The world loses this citizen, not just this savegame: recorded in the
        // world folder so no other playthrough can recruit them again
        // (NPCSystem.js, GoneRegistry).
        window.NPCGone?.record($gameMap.mapId(), swEvId, npcName, 'joined');
      }

      // Somebody joining is the end of the conversation, not a line in it: the
      // panel closes and the news is a toast, so the player is left standing on
      // the map with their new companion rather than reading a chat log.
      const inactive = $gameTemp?._npcJoinedInactive === true;
      const joinText = inactive
        ? T('Empathize.joinedPartyInactive', { name: npcName })
        : T('Empathize.joinedParty', { name: npcName });
      // The newcomer may have taken the place of a companion who fell and was
      // never brought back; say whose place it was rather than letting them
      // vanish from the roster without a word.
      const displaced = $gameTemp?._npcJoinDisplacedName;
      if (displaced) {
        window.ParchmentToast?.show?.(T('Empathize.joinReplacedFallen', { name: displaced }),
          { severity: 'warning', duration: 240 });
        $gameTemp._npcJoinDisplacedName = null;
      }
      window.ParchmentToast?.show?.(joinText, { severity: 'info', duration: 260 });

      // Same handover the card table uses: drop the overlay, let go of the
      // event, and hand the map back.
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
    }

    // The lesser of the two offers made to somebody who talks: come along, but
    // not as one of us. They walk behind the party as a follower (the registry
    // PetFollowerSystem owns) instead of taking one of the three slots, which
    // means there is always room for them however full the party is. Argued on
    // the same PSI roll and the same odds as Join, because it is the same
    // question asked more modestly.
    async _joinFollower() {
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      const T       = _getT();

      if (!_hasSelfSwitchAPage(evId)
          || window.NPCSim?.isShopShiftCovered?.($gameMap?.event(evId))
          || window.NPCSystem?.isAnyShopEvent?.($gameMap?.event(evId))) {
        SoundManager.playBuzzer();
        return;
      }

      const actor   = this._focusActor() || $gameParty?.leader();
      const opinion = this._focusOpinion(profile);
      const chance  = _joinChance(opinion, actor);
      const psiMod  = actor ? (actor.psiMod ?? Math.floor(((actor.luk || 10) - 10) / 2)) : 0;

      let success;
      if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Follow: ${npcName}`, // i18n-ignore: Dice3D check id
          statName: 'PSI', // i18n-ignore: Dice3D stat id
          modifier: psiMod,
          actor,
          force3D: true,
        });
        success = res.success;
      } else {
        success = Math.random() * 100 < chance;
      }

      if (!success) {
        SoundManager.playBuzzer();
        if (profile) _addNpcOpinion(profile, actor?.actorId(), -2);
        const phrases = T.joinRefusalPhrases || [];
        this._pushChat('npc', phrases[Math.floor(Math.random() * phrases.length)] || '');
        this._render();
        this._scrollChatToBottom();
        return;
      }

      if (!_recruitNpcAsFollower(npcName, profile, evId)) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T('Empathize.joinFailed') };
        this._render();
        return;
      }

      SoundManager.playOk();
      if (profile) profile.playerOpinion = Math.min(100, (profile.playerOpinion ?? 0) + 40);
      _gainSocialFromOpinion(actor?.actorId(), 40, profile);
      this._justJoined = true;

      // They stop standing on the map, and the world knows they left with the
      // party, exactly as a full recruit does.
      const swEvId = evId ?? this._launchEventId;
      if (swEvId != null && $gameMap) {
        $gameSelfSwitches.setValue([$gameMap.mapId(), swEvId, 'A'], true);
        $gameMap.event(swEvId)?.refresh();
        window.NPCGone?.record($gameMap.mapId(), swEvId, npcName, 'joined');
      }

      window.ParchmentToast?.show?.(T('Empathize.joinedFollower', { name: npcName }),
        { severity: 'info', duration: 260 });
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
    }

    // Focus/blur callbacks from the chat input, the single source of truth for
    // _inputFocused / _activeArea so the game loop never fights the text field.
    _onAskFocus(focused) {
      this._inputFocused = !!focused;
      if (focused) this._activeArea = 'input';
    }

    // Send a chat line. `phraseArg` is supplied by the chat modal; when omitted
    // the text is read from the (legacy) inline input if one is present.
    _submitAsk(phraseArg) {
      let phrase = phraseArg;
      if (phrase == null) {
        const inp = this._overlay?.querySelector('#npc-dlg-ask-input')
          || document.getElementById('npc-dlg-ask-input');
        phrase = inp ? inp.value : '';
        if (inp) inp.value = '';
      }
      phrase = String(phrase || '').trim();
      if (!phrase) return;
      // A non-sentient member types like anybody else and is heard like the
      // animal it is: what leaves its throat is noise, and the noise is what
      // the NPC answers.
      if (_isNonSentientActor(this._focusActor())) {
        phrase = _feralGrowlFor(phrase, _creatureClassOfActor(this._focusActor()));
      }
      this._askDraft = '';
      // Small talk moves no opinion, but it is still somebody to talk to.
      this._gainCompany();

      this._chatHistory.push({ role: 'player', text: phrase });
      this._isTyping = true;
      this._render();
      this._scrollChatToBottom();

      // Free chat is the one line in the panel the player writes themselves, so
      // it is the one worth waiting on the experimental language model for.
      const speaker = (this._eventId != null ? _getNPCName(this._eventId) : '')
        || (this._actorId != null ? ($gameActors.actor(this._actorId)?.name() ?? '') : '')
        || this._npcName || '';
      this._answerAsk(phrase, speaker);
    }

    // What the model is told about the person it is playing: the register they
    // talk in and the banner they stand under, which is as much as the panel
    // knows for certain about anybody.
    _llmBio() {
      const profile = _getProfile(this._targetName());
      if (!profile) return '';
      const dl = window._NPCSocietyDataLoader;
      const parts = [];
      const persona = _personalityName(profile);
      if (persona) parts.push(persona);
      const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
      const factionName = faction
        ? (dl.getFactionName?.(faction) || (String(faction.name || '').split('.')[1] || faction.name || ''))
        : '';
      if (factionName) parts.push(factionName);
      return parts.join(', ');
    }

    // Write the answer to a typed line and speak it. With a model picked in
    // Options > Experimental the reply is the model's: this is the one line in
    // the panel the player wrote themselves, so it is worth waiting for, cold
    // start and all. The Markov chain is what covers a model that fails or
    // times out, and with the model off nothing changes: the chain answers on
    // its own, at the same pace as before.
    async _answerAsk(phrase, speaker) {
      // Draw from ALL text databases combined, seeded with the player's own
      // words so the reply riffs on what was just said. The generator opens
      // with the seed itself, so the lengths are asked for on top of it and
      // the echo is pruned back off before the line is spoken.
      const seedLen = phrase.split(/\s+/).filter(Boolean).length;
      const opts = { chainOrder: 2, minLength: 8 + seedLen, maxLength: 30 + seedLen, startText: phrase, npcName: speaker };
      const llm = window.MarkovLLM;
      const useModel = !!llm?.isEnabled?.() && typeof llm.reply === 'function';

      let response = '';
      let fromModel = false;
      if (useModel) {
        // The model takes seconds of its own and the weights are read off the
        // disk on the first line of the session, so no pause is put on top of
        // it: the typing indicator stands until the line comes back. An
        // instruction tuned model is handed the conversation so far, which is
        // everything but the line just pushed on, since that is the line it is
        // being asked to answer.
        try {
          response = await llm.reply({
            npcName: speaker,
            npcBio: this._llmBio(),
            startText: phrase,
            history: this._chatHistory.slice(0, -1)
          });
        } catch (e) {}
        fromModel = !!response;
      }
      if (!response) {
        // The chain answers on the spot, so it is held back to talking pace.
        await new Promise(resolve => setTimeout(resolve, 350));
        if (window.generateMarkovString) {
          try { response = window.generateMarkovString('all', opts); }
          catch (e) {}
        }
      }
      // The panel can be closed while a line is still being written.
      if (SceneManager._scene !== this) return;

      // A chain seeded with the player's words opens by repeating them; a chat
      // model answers in its own words and has nothing to prune.
      if (response && !/^ERROR:/i.test(response) && !(fromModel && llm?.isChatModel?.())) {
        response = _stripSeedEcho(response, phrase);
      }
      if (!response || /^ERROR:/i.test(response)) {
        if (window.generateMarkovString) {
          try { response = window.generateMarkovString('all', { chainOrder: 2, minLength: 8, maxLength: 30 }); }
          catch (e) {}
        }
      }
      if (!response || /^ERROR:/i.test(response)) response = '...';
      if (response.length > 280) response = response.slice(0, 277) + '…';
      // And a beast answers the way it was spoken to: whoever wrote the line,
      // what actually comes back out is noise the length of it.
      if (this._isNonSentientSubject()) response = _feralGrowlFor(response, this._subjectCreatureClass());
      this._isTyping = false;
      this._chatHistory.push({ role: 'npc', text: response });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      this._render();
      this._scrollChatToBottom();
    }

    // ── Chat modal ─────────────────────────────────────────────────────────────
    // A standalone overlay (a sibling of the re-rendered panels) that hosts the
    // text field. Living OUTSIDE the panels means _render() never tears it down,
    // so focus and caret survive; the capture-phase _chatKeyGuard shields every
    // keystroke from all other plugins' global handlers, so typing is reliable.
    _openChatModal() {
      if (!this._overlay || this._chatModalOpen) return;
      // The player is about to type a line the model will answer, so the
      // weights start being read now rather than once the line is sent.
      window.MarkovLLM?.warmUp?.();
      const T     = _getT();
      const ev    = $gameMap?.event(this._eventId);
      const shift = window.NPCSim?.isShopShiftCovered?.(ev)
        ? window.NPCSim.getShopShiftData(ev?.event()?.name ?? '', $gameMap?.mapId(), this._eventId)
        : null;
      const name  = shift
        ? shift.name
        : (_getNPCName(this._eventId)
          || (this._actorId != null ? ($gameActors.actor(this._actorId)?.name() ?? '') : '')
          || this._npcName || '');
      const esc   = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

      const modal = document.createElement('div');
      modal.className = 'npc-chat-modal-backdrop';
      modal.innerHTML = `
        <div class="npc-chat-modal" onmousedown="event.stopPropagation();">
          <div class="npc-chat-modal-title">${esc((T.chatWith) + ' ' + name)}</div>
          <textarea id="npc-dlg-ask-input" class="npc-chat-modal-input" rows="3"
            maxlength="200" autocomplete="off" spellcheck="false"
            placeholder="${esc(T.typePlaceholder)}"></textarea>
          <div class="npc-chat-modal-btns">
            <button class="npc-chat-modal-cancel" onmousedown="event.stopPropagation();SceneManager._scene._closeChatModal?.()">${esc(T.cancel)}</button>
            <button class="npc-chat-modal-send" onmousedown="event.stopPropagation();SceneManager._scene._submitChatModal?.()">${esc(T.send)}</button>
          </div>
        </div>`;
      // Clicks on the dimmed backdrop (outside the panel) close the modal.
      modal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.target === modal) this._closeChatModal();
      });

      this._overlay.appendChild(modal);
      this._chatModalEl   = modal;
      this._chatModalOpen = true;
      this._inputFocused  = true;
      this._activeArea    = 'input';

      const ta = modal.querySelector('#npc-dlg-ask-input');
      if (ta) {
        ta.value = this._askDraft || '';
        // keep the draft current without needing the key events (which the guard
        // swallows) via the separate 'input' event
        ta.addEventListener('input', () => { this._askDraft = ta.value; });
        requestAnimationFrame(() => {
          ta.focus();
          const end = ta.value.length;
          try { ta.setSelectionRange(end, end); } catch (e) {}
        });
      }
    }

    _closeChatModal() {
      const modal = this._chatModalEl;
      this._chatModalEl   = null;
      this._chatModalOpen = false;
      this._inputFocused  = false;
      if (this._activeArea === 'input') this._activeArea = 'actions';
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    _submitChatModal() {
      const ta = this._chatModalEl?.querySelector('#npc-dlg-ask-input');
      const phrase = ta ? ta.value : '';
      this._askDraft = '';
      this._closeChatModal();
      this._submitAsk(phrase);
    }

    // ── Event lock ─────────────────────────────────────────────────────────────

    _releaseEventLock() {
      const evId = this._launchEventId ?? this._eventId;
      if (evId == null) return;
      // Abandon the page that opened the panel, but ONLY if the paused map
      // interpreter really is that page. The fallback `?? this._eventId` can name
      // an event the panel merely navigated to (a wiki hyperlink onto an NPC who
      // happens to be standing on this map), and killing whatever interpreter is
      // running for that would silently cut off an unrelated event. eventId() 0 is
      // the common-event form of the same launch (the esoteric mind-meld skills).
      const interp   = $gameMap?._interpreter;
      const interpId = interp?.eventId?.() ?? null;
      if (interp && interp.isRunning() && (interpId === evId || interpId === 0)) {
        interp.terminate();
        if (interp._childInterpreter) interp._childInterpreter = null;
      }
      // Safe to clear here: the map has not updated since the panel opened, so
      // this flag can only be the launch event's own. (The deferred pass in
      // SECTION 5 deliberately does NOT do this, see the comment there.)
      const ev = $gameMap?.event(evId);
      if (ev) {
        ev._starting = false;
        if (ev._locked) ev.unlock();
      }
      $gameTemp._NPCEmpathizeReturnEvId   = evId;
      $gameTemp._NPCEmpathizeReturnFrames = 0;
    }

    // `force` shuts the panel outright instead of walking the wiki return
    // stack back one step. The mouse-only close button passes it: an X is
    // read as "shut this", never as "go back one page".
    _leave(force) {
      SoundManager.playCancel();
      // A non-empty return stack means we're backing out of a wiki hyperlink
      // jump, swap the panel's subject in place rather than tearing down
      // and recreating the whole overlay (which flickered).
      if (force) {
        Scene_NPCEmpathize._returnStack.length = 0;
      } else if (Scene_NPCEmpathize._returnStack.length) {
        const ctx = Scene_NPCEmpathize._returnStack.pop();
        _navigateInPlace(ctx);
        return;
      }
      this._removeOverlay();
      (this._disabledCanvases || []).forEach(({ el, orig }) => { el.style.pointerEvents = orig; });
      this._disabledCanvases = [];
      if (this._wasdListener) {
        window.removeEventListener('keydown', this._wasdListener);
        window.removeEventListener('keyup',   this._wasdUpListener);
        this._wasdListener = this._wasdUpListener = null;
      }
      if (this._chatKeyGuard) {
        window.removeEventListener('keydown',  this._chatKeyGuard, true);
        window.removeEventListener('keyup',    this._chatKeyGuard, true);
        window.removeEventListener('keypress', this._chatKeyGuard, true);
        this._chatKeyGuard = null;
      }
      this._releaseEventLock();
      SceneManager.pop();
    }
  }

  Scene_NPCEmpathize._eventId = null;
  Scene_NPCEmpathize._actorId = null;
  Scene_NPCEmpathize._npcName = null;
  Scene_NPCEmpathize._entity  = null;
  Scene_NPCEmpathize._returnStack = [];

  // Switch 67 (MultiplayerON) reserves party slots and gates the Join button.
  // It is set live by the multiplayer plugin, but a session that ended abruptly
  // can leave it stuck ON, which then wrongly hides Join in single-player. Force
  // it OFF on every load - a real multiplayer session re-sets it live, never via
  // a loaded save. Both SaveSystem load paths call $gameSystem.onAfterLoad().
  const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
  Game_System.prototype.onAfterLoad = function () {
    _Game_System_onAfterLoad.call(this);
    if ($gameSwitches) $gameSwitches.setValue(67, false);
  };

  // Pushes the current panel's full context onto the return stack so the
  // back button can restore it after a wiki hyperlink jump.
  function _pushReturnContext() {
    const curScene = SceneManager._scene;
    if (curScene instanceof Scene_NPCEmpathize) {
      Scene_NPCEmpathize._returnStack.push({
        eventId: curScene._eventId, actorId: curScene._actorId,
        npcName: curScene._npcName, entity: curScene._entity,
        // The tab is part of the context, so backing out of a hop taken from
        // the Social Web lands back on the web rather than on the chat.
        tab: curScene._activeTab,
      });
    }
  }

  // Switches the currently-open panel to a new subject (npc/actor/wiki entity)
  // by mutating the live scene and re-rendering, instead of pushing a brand
  // new Scene_NPCEmpathize. Pushing recreated the whole DOM overlay (fade out
  // + fade back in), which produced a visible flicker on every wiki hop.
  function _navigateInPlace(ctx) {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_NPCEmpathize) || !scene._overlay) {
      Scene_NPCEmpathize._eventId = ctx.eventId ?? null;
      Scene_NPCEmpathize._actorId = ctx.actorId ?? null;
      Scene_NPCEmpathize._npcName = ctx.npcName ?? null;
      Scene_NPCEmpathize._entity  = ctx.entity  ?? null;
      Scene_NPCEmpathize._initialTab = ctx.tab ?? null;
      SceneManager.push(Scene_NPCEmpathize);
      return;
    }
    scene._eventId  = ctx.eventId ?? null;
    scene._actorId  = ctx.actorId ?? null;
    scene._npcName  = ctx.npcName ?? null;
    scene._entity   = ctx.entity  ?? null;
    scene._entityTabs    = null;
    scene._menuIndex     = 0;
    scene._menuItems     = [];
    scene._chatActions   = [];
    // A caller can name the tab to land on (the Social Web opens the next
    // person straight on their own web); otherwise the panel opens as usual.
    scene._activeTab     = ctx.tab ?? (scene._entity ? 'overview' : 'chat');
    scene._activeArea    = 'tabs';
    scene._contentIndex  = 0;
    scene._moreSubView   = null;
    scene._chatHistory   = [];
    scene._askDraft      = '';
    scene._inputFocused  = false;
    scene._isTyping      = false;
    scene._closeChatModal?.();
    scene._joinMessage   = null;
    scene._stealMode         = false;
    scene._stealItems        = [];
    scene._stealAttempted    = {};
    scene._giftMode          = false;
    scene._giftItems         = [];
    scene._feedMode          = false;
    scene._feedItems         = [];
    scene._bribeMode         = false;
    scene._attackConfirm     = false;
    scene._pickpocketConfirm = false;
    scene._infectMode        = false;
    scene._infectItems       = [];
    scene._webList       = null;
    // A fresh subject means a differently-shaped web; carrying the last one's
    // zoom/pan over would land the new graph scrolled somewhere meaningless.
    scene._webZoom       = null;
    scene._webScrollX    = 0;
    scene._webScrollY    = 0;
    scene._webBaseSize   = null;
    // A new subject has not met whoever is doing the talking yet, so every
    // one-shot greeting is re-armed.
    scene._emGreeted     = false;
    scene._bubbaGreeted  = false;
    scene._feralGreeted  = false;
    scene._beastGreeted  = false;
    scene._render();
  }

  // ============================================================================
  // SECTION 8, PLUGIN COMMAND
  // ============================================================================

  PluginManager.registerCommand(pluginName, 'Open', args => {
    if ($gameTemp._NPCEmpathizeBypass) {
      $gameTemp._NPCEmpathizeBypass = false;
      return;
    }
    const evName = String(args.eventName || '').trim().toLowerCase();
    let evId = null;
    if (evName) {
      const ev = $gameMap?.events().find(e => e?.event()?.name?.trim().toLowerCase() === evName);
      if (!ev) { console.warn(`[NPCEmpathize] Open: no event named "${evName}" on current map.`); return; }
      evId = ev.eventId();
    } else {
      evId = $gameMap?._interpreter?._eventId ?? null;
      if (!evId) { console.warn('[NPCEmpathize] Open: no eventName given and no active event interpreter found.'); return; }
    }
    window.NPCEmpathize.open(evId);
  });

  // ============================================================================
  // SECTION 8b, WIKI DATA LAYER
  // ============================================================================
  // Aggregates everything the world knows about an entity from the active
  // world folder (history.json via HistoryManager, artifacts.json via
  // WorldManager, npcs.json politics via NPCPolitics) plus the static
  // WorldGen databases, into a single view object the UI can render.

  const Wiki = {
    _index: null,     // exact name        → { type, id }
    _escIndex: null,  // HTML-escaped name → { type, id }
    _linkRegex: null,
    _indexLang: null, // language the index was keyed in

    // Every shelf of the index, as it was last rolled. The rolls are not
    // cheap: listAllLeaders walks the whole book of leaders and sorts it by
    // its localized label, listPeople walks every society profile the world
    // holds, and the Wiki tab asks for ALL of them on every render just to
    // print the count on each card. None of it can change while a panel is
    // open, so each roll is made once per panel and handed back afterwards.
    _lists: null,

    invalidate() {
      this._index = null;
      this._escIndex = null;
      this._linkRegex = null;
      this._indexLang = null;
      this._lists = null;
    },

    // Roll `key` if it has not been rolled since the last invalidate.
    _roll(key, build) {
      const cache = (this._lists ||= {});
      if (cache[key] === undefined) cache[key] = build.call(this);
      return cache[key];
    },

    _hm() { return window.HistoryManager; },

    _generatedArtifacts() {
      if (window.WorldManager) {
        const g = window.WorldManager.getField('artifacts', 'generated');
        if (g) return g;
      }
      return (typeof $gameSystem !== 'undefined' && $gameSystem?._generatedArtifacts) || null;
    },

    // ── entity views ──────────────────────────────────────────────────────────

    listNationNames() {
      const fromHist = Object.keys(this._hm()?.getNationsState?.() || {});
      if (fromHist.length) return fromHist;
      return (window.WorldGen?.Countries || []).map(c => c.country);
    },

    getNation(name) {
      const hm = this._hm();
      const stateInfo  = hm?.getNationState?.(name) || null;
      const staticInfo = (window.WorldGen?.Countries || []).find(c => c.country === name) || null;
      if (!stateInfo && !staticInfo) return null;
      const history    = hm?.getNationHistory?.(name) || [];
      const current    = history.length ? history[history.length - 1] : null;
      const controller = stateInfo?.controller ?? staticInfo?.controller ?? 'Neutral';
      const faction    = stateInfo?.faction ?? staticInfo?.faction ?? 'Neutral';
      const power      = controller !== 'Neutral' ? (window.NPCPolitics?.getPower?.(controller) ?? null) : null;
      const settlements = Object.values(window.NPCPolitics?.listSettlements?.() || {})
        .filter(s => s.country === name);
      return {
        type: 'nation', name, controller, faction,
        government: current?.government ?? null,
        history, power, settlements,
        seasons: staticInfo?.seasons ?? null,
        regionId: staticInfo?.id ?? null,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    getPower(name) {
      const live = window.NPCPolitics?.getPower?.(name) ?? null;
      const hm   = this._hm();
      const hist = (hm?.getHyperpowers?.() || {})[name] || null;
      if (!live && !hist) return null;
      const nationsState = hm?.getNationsState?.() || {};
      let nations = Object.keys(nationsState).filter(n => nationsState[n]?.controller === name);
      if (!nations.length && live) nations = live.memberCountries || [];
      // Expose holy_leaders for dual-track powers (e.g. Holy Vatican Empire)
      const holyLeaders = hist?.holy_leaders || undefined;
      const currentHoly = hm?._currentHolyLeaders || hm?._histField?.('holyLeaders', {});
      return {
        type: 'power', name, live, hist, nations,
        factions: this.listFactionsOfPower(name),
        holy_leaders: holyLeaders,
        currentHoly: currentHoly?.[name] || null,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    // The factions that answer to a hyperpower: every Factions.json entry whose
    // `parentHyperpower` is that power's name. No entry stands for the power
    // itself any more, so nothing has to be filtered back out of its own list.
    listFactionsOfPower(name) {
      const hpData = (this._hm()?.getHyperpowers?.() || {})[name] || null;
      if (!hpData) return [];
      const dl = window._NPCSocietyDataLoader;
      const self = window.NPCPolitics?.getPower?.(name) || null;
      // "USSR" and "Soviet Union" are one power under two names, so the entry is
      // recognized through the political registry (which folds the aliases) and
      // not by string equality alone.
      const isSelf = (display) => display === name ||
        (self && window.NPCPolitics?.getPower?.(display) === self);
      const out = [];
      for (const f of (dl?.factions || [])) {
        if (!f || f.parentHyperpower !== name) continue;
        const display = dl.getFactionName?.(f) || ((f.name || '').split('.')[1] || f.name);
        if (display && !isSelf(display)) out.push(display);
      }
      return out.sort((a, b) => a.localeCompare(b));
    },

    // In an empty world nobody outlived 1 January 2000, so anyone the record
    // still has standing is reported dead on that date instead. The two
    // branches below store their dates in different formats (NPCPolitics
    // writes "01 JAN 2000", HistorySimulator writes ISO), and the wiki prints
    // whichever it is given verbatim, so each is answered in its own.
    _emptyWorldDeath(format) {
      const WM = window.WorldManager;
      if (!WM || typeof WM.isEmptyWorld !== "function" || !WM.isEmptyWorld()) return null;
      return { date: format === 'iso' ? '2000-01-01' : '01 JAN 2000', cause: null };
    },

    // The sheet behind a leader: who they are as a character rather than as an
    // office. window.LeaderPersona (HistorySimulator.js) builds it, reading the
    // pre-made dossier where the leader is also one and the world's own record
    // of that character where somebody has already played them. Every leader
    // article carries one, which is what makes the Empathize button on it lead
    // to a person rather than to an empty profile.
    _leaderDossier(name) {
      try { return window.LeaderPersona?.dossierFor?.(name) ?? null; }
      catch (e) { return null; }
    },

    getLeader(name) {
      const hm = this._hm();
      const dossier = this._leaderDossier(name);
      const found = window.NPCPolitics?.findPolitician?.(name);
      if (found) {
        return {
          type: 'leader', kind: 'politician', name: found.pol.name,
          pol: found.pol, power: found.power, dossier,
          record: hm?.getLeaderRecord?.(found.pol.name) ?? null,
          death: found.pol.alive ? this._emptyWorldDeath() : {
            date: found.pol.deathDate ?? null,
            cause: window.NPCPolitics?.textOf?.(found.pol.deathCause) || null,
          },
          events: hm?.getEventsAbout?.(found.pol.name, 12) ?? [],
        };
      }
      const deaths   = hm?.getLeaderDeaths?.() || {};
      const deadList = hm?.getDeadLeaders?.() || [];
      const isDead   = deadList.includes(name) || !!deaths[name];
      const sources = [
        ['power',   hm?.getHyperpowers?.() || {}],
        ['faction', hm?.getHistoricalFactions?.() || {}],
      ];
      for (const [ofType, group] of sources) {
        for (const [groupName, data] of Object.entries(group)) {
          const leader = (data?.leaders || []).find(l => l && l.name === name);
          if (leader) {
            return {
              type: 'leader', kind: 'historical', name,
              leader, of: groupName, ofType, dossier,
              record: hm?.getLeaderRecord?.(name) ?? null,
              death: isDead ? (deaths[name] || { date: null, cause: null })
                            : this._emptyWorldDeath('iso'),
              events: hm?.getEventsAbout?.(name, 12) ?? [],
            };
          }
        }
      }
      // Not seated anywhere, and never was: most of the book is like this at
      // any one moment, and until now those names opened nothing at all. The
      // record itself is the article, with the nation they belong to standing
      // in for the body they served.
      const record = hm?.getLeaderRecord?.(name) ?? null;
      if (record) {
        return {
          type: 'leader', kind: 'historical', name,
          leader: record, of: record.country || null, ofType: 'nation',
          dossier, record,
          death: isDead ? (deaths[name] || { date: null, cause: null })
                        : this._emptyWorldDeath('iso'),
          events: hm?.getEventsAbout?.(name, 12) ?? [],
        };
      }
      return null;
    },

    // `key` is "kind:id" (e.g. "weapon:1503") or an artifact name.
    getArtifact(key) {
      const hm = this._hm();
      const records = hm?.getArtifactRecords?.() || {};
      const generated = this._generatedArtifacts();
      let kind = null, id = null, rec = null;
      const m = String(key).match(/^(item|weapon|armor):(\d+)$/);
      if (m) {
        kind = m[1]; id = Number(m[2]);
        rec = records[key] || null;
      } else {
        for (const r of Object.values(records)) {
          if (r?.name === key) {
            rec = r; kind = r.kind; id = r.id;
            break;
          }
        }
        if (kind === null && generated) {
          for (const [kk, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]]) {
            const hit = (list || []).find(a => a?.name === key);
            if (hit) { kind = kk; id = hit.id; break; }
          }
        }
      }
      if (kind === null) return null;
      let data = null;
      if (generated) {
        const list = kind === 'item' ? generated.items : kind === 'weapon' ? generated.weapons : generated.armors;
        data = (list || []).find(a => a?.id === id) || null;
      }
      if (!data) {
        const db = kind === 'item' ? (typeof $dataItems !== 'undefined' && $dataItems)
                 : kind === 'weapon' ? (typeof $dataWeapons !== 'undefined' && $dataWeapons)
                 : (typeof $dataArmors !== 'undefined' && $dataArmors);
        data = (db && db[id]) || null;
      }
      if (!data && !rec) return null;
      const artifactName = data?.name ?? rec?.name ?? key;
      return {
        type: 'artifact', key: `${kind}:${id}`, kind, id,
        name: artifactName, data, rec,
        events: hm?.getEventsAbout?.(artifactName, 10) ?? [],
      };
    },

    getFaction(name) {
      // The party's own banner is not in Factions.json (see the player faction
      // section of NPC/FactionDataManager.js): it is asked for by name and
      // answers with a page built out of the roll it is carrying.
      const own = window.$gameFactions?.playerFaction?.();
      if (own && own.name === name) {
        const roster = window.$gameFactions.playerFactionRoster();
        const stats = window.$gameFactions.playerFactionStats();
        return {
          type: 'faction', name, hist: null,
          dlFaction: Object.assign({}, own, stats), dlIndex: -1,
          members: roster.party.concat(roster.army),
          // These are companions and hired soldiers, not catalogued NPCs, so
          // the members tab prints them without a wiki link that leads nowhere.
          plainMembers: true,
          parentPower: own.parentHyperpower || null,
          events: [],
        };
      }
      const hm = this._hm();
      const hist = (hm?.getHistoricalFactions?.() || {})[name] || null;
      const dl = window._NPCSocietyDataLoader;
      let dlIndex = -1, dlFaction = null;
      (dl?.factions || []).forEach((f, i) => {
        if (dlFaction) return;
        const display = dl.getFactionName?.(f)
          || ((f?.name || '').split('.')[1] || f?.name || '');
        if (display === name || f?.name === name) { dlIndex = i; dlFaction = f; }
      });
      if (!hist && !dlFaction) return null;
      const members = [];
      if (dlIndex >= 0 && typeof $gameSystem !== 'undefined') {
        for (const [npcName, prof] of Object.entries($gameSystem?._npcSociety || {})) {
          if (prof?.factionIndex === dlIndex) {
            members.push(npcName);
            if (members.length >= 24) break;
          }
        }
      }
      // The power this faction answers to is named outright in Factions.json.
      const parentPower = dlFaction?.parentHyperpower || null;
      return {
        type: 'faction', name, hist, dlFaction, dlIndex, members, parentPower,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    // A NPCPolitics party, wherever it is seated (a party id already carries
    // its own power, e.g. "party_HolyVaticanEmpire_0", but the wiki only ever
    // has the bare id, so this is a real search rather than a parse).
    getParty(id) {
      const found = window.NPCPolitics?.findParty?.(id);
      if (!found) return null;
      const { power, party } = found;
      const leader = power.politicians?.[party.leaderId] || null;
      return {
        type: 'party', id: party.id, name: party.name,
        party, power, leader,
        ideology: window.NPCShared?.ideologyById?.(party.ideologyId) || null,
      };
    },

    // A creed from js/db/WorldGen/Ideology.json, with every live party (across
    // every hyperpower) currently standing on it, since more than one always
    // can. `id` is the ideology's own id, not a slot index.
    getIdeology(id) {
      const list = window.NPCShared?.ideologyList?.() || [];
      const ideo = list.find(e => e && e.id === id) || null;
      if (!ideo) return null;
      const parties = (window.NPCPolitics?.listAllParties?.() || [])
        .filter(({ party }) => party.ideologyId === id)
        .map(({ party, powerName }) => ({ party, powerName }));
      const label = window.T ? window.T(ideo.name) : ideo.id;
      return { type: 'ideology', id: ideo.id, name: label, ideo, parties };
    },

    get(type, id) {
      // Old faction names may now be hyperpowers - redirect if not found as faction
      if (type === 'faction') {
        const f = this.getFaction(id);
        if (f) return f;
        const p = this.getPower(id);
        if (p) return { ...p, type: 'faction' };
        return null;
      }
      switch (type) {
        case 'nation':   return this.getNation(id);
        case 'power':    return this.getPower(id);
        case 'leader':   return this.getLeader(id);
        case 'artifact': return this.getArtifact(id);
        case 'party':    return this.getParty(id);
        case 'ideology': return this.getIdeology(id);
      }
      return null;
    },

    // ── index listings (Wiki tab grids) ──────────────────────────────────────

    // Every known NPC: society profiles (anyone ever met/simulated) plus the
    // template pools of every map group, so the whole population is browsable
    // and remotely inspectable even before being encountered.
    listPeople() { return this._roll('people', this._listPeople); },
    _listPeople() {
      const people = new Map(); // name → { name, group }
      const society = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcSociety) || {};
      for (const [name, prof] of Object.entries(society)) {
        people.set(name, { name, group: prof?._homeGroupName ?? null });
      }
      const sys = window.NPCSystem;
      if (sys?.getGroupNames && sys?.getNPCNamesByGroup) {
        for (const groupName of sys.getGroupNames()) {
          for (const name of sys.getNPCNamesByGroup(groupName)) {
            if (!people.has(name)) people.set(name, { name, group: groupName });
          }
        }
      }
      return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    // Everybody who ever held an office in this world, book or not. The two
    // wiki shelves above are cut out of this one roll.
    listAllLeaders() { return this._roll('allLeaders', this._listAllLeaders); },
    _listAllLeaders() {
      const hm = this._hm();
      const deaths = hm?.getLeaderDeaths?.() || {};
      const deadList = new Set(hm?.getDeadLeaders?.() || []);
      // `ofType` says which vocabulary names the body they served, so the
      // listing can label a faction and a hyperpower each in its own terms.
      const out = new Map(); // name → { name, of, ofType, dead }
      const addFrom = (group, ofType) => {
        for (const [groupName, data] of Object.entries(group || {})) {
          for (const l of (data?.leaders || [])) {
            if (l?.name && !out.has(l.name)) {
              out.set(l.name, { name: l.name, of: groupName, ofType,
                                dead: deadList.has(l.name) || !!deaths[l.name] });
            }
          }
        }
      };
      addFrom(hm?.getHyperpowers?.(), 'power');
      addFrom(hm?.getHistoricalFactions?.(), 'faction');
      // Everyone else in the book. A leader is in Leaders.json whether or not
      // any power has seated them yet, and a name that never took an office
      // still has a life, a face and an article: leaving them out of the index
      // was the only reason most of the cast could not be looked up at all.
      for (const rec of (hm?.listLeaderRecords?.() || [])) {
        if (!rec?.name || out.has(rec.name)) continue;
        out.set(rec.name, { name: rec.name, of: rec.country || null, ofType: 'nation',
                            dead: deadList.has(rec.name) || !!deaths[rec.name] });
      }
      // Nobody NPCPolitics invented is listed here. A politician the world
      // made up has an article of their own and a category of their own
      // (listPoliticians): Leaders is the book, and the book is written down.
      // Sorted by the label the listing prints, not by the id behind it, so the
      // A-Z of the page is the A-Z the reader sees.
      const label = n => (window.WorldNames ? window.WorldNames.leader(n) : n);
      return [...out.values()].sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    // The cast splits in two, and the wiki gives each half its own shelf.
    //
    // MAIN PLAYERS are the people the book wrote down: Leaders.json, the real
    // historical figures and the canon characters, each with a hand-written
    // record behind them. LEADERS is everybody else the world happened to
    // seat - a power whose roster ran out, a faction's own officers - whose
    // whole biography is simulated (LeaderPersona). Both open the same kind of
    // article; the difference is who wrote the person.
    _isBookLeader(name) {
      try { return !!window.LeaderPersona?.isBookLeader?.(name); }
      catch (e) { return false; }
    },

    listMainPlayers() { return this._roll('mainPlayers', this._listMainPlayers); },
    _listMainPlayers() {
      return this.listAllLeaders().filter(l => this._isBookLeader(l.name));
    },

    // The wiki's Leaders shelf: the procedural half of the cast, whose lives
    // the world simulated rather than a writer writing them.
    listLeaders() { return this._roll('leaders', this._listLeaders); },
    _listLeaders() {
      return this.listAllLeaders().filter(l => !this._isBookLeader(l.name));
    },

    // The other half of the political class: everybody NPCPolitics elected,
    // deposed and buried without a historian ever writing them down. A
    // politician who IS in the book (a real leader the world seated, see
    // NPCPolitics.makePolitician) is listed under Leaders instead, so nobody
    // appears twice.
    listPoliticians() { return this._roll('politicians', this._listPoliticians); },
    _listPoliticians() {
      const state = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcPolitics) || {};
      const book = this._hm();
      const out = new Map();
      const collect = (polities, ofType) => {
        for (const polity of Object.values(polities || {})) {
          for (const pol of Object.values(polity?.politicians || {})) {
            if (!pol?.name || out.has(pol.name)) continue;
            if (pol.real || (book?.getLeaderRecord && book.getLeaderRecord(pol.name))) continue;
            out.set(pol.name, {
              name: pol.name, of: polity.name, ofType,
              office: pol.office || null, dead: !pol.alive,
            });
          }
        }
      };
      collect(state.powers, 'power');
      collect(state.nations, 'nation');
      const label = n => (window.WorldNames ? window.WorldNames.leader(n) : n);
      return [...out.values()].sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    listPowerNames() { return this._roll('powers', this._listPowerNames); },
    _listPowerNames() {
      const set = new Set(Object.keys(this._hm()?.getHyperpowers?.() || {}));
      for (const n of (window.NPCPolitics?.listPowers?.() || [])) set.add(n);
      // Sorted by the label, not the id: see listLeaders.
      const label = n => (window.WorldNames ? window.WorldNames.power(n) : n);
      return [...set].sort((a, b) => label(a).localeCompare(label(b)));
    },

    listNations() { return this._roll('nations', this._listNations); },
    _listNations() {
      const states = this._hm()?.getNationsState?.() || {};
      const label = n => (window.WorldNames ? window.WorldNames.nation(n) : n);
      return this.listNationNames()
        .map(name => ({ name, controller: states[name]?.controller ?? null }))
        .sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    listFactionNames() { return this._roll('factions', this._listFactionNames); },
    _listFactionNames() {
      const set = new Set(Object.keys(this._hm()?.getHistoricalFactions?.() || {}));
      const dl = window._NPCSocietyDataLoader;
      for (const f of (dl?.factions || [])) {
        const display = dl.getFactionName?.(f) || ((f?.name || '').split('.')[1] || f?.name);
        if (display) set.add(display);
      }
      // A hyperpower is never listed among the factions: Factions.json carries
      // an entry for each power (its own household, e.g. "Britannia" under the
      // power Britannia), and that entry belongs to the Hyperpowers index. Each
      // power's page lists the orders that answer to it instead.
      // ...and the party's own banner, which is world state rather than a
      // shipped entry (NPC/FactionDataManager.js, the player faction section).
      const own = window.$gameFactions?.playerFaction?.();
      if (own && own.name) set.add(own.name);
      const powers = new Set(this.listPowerNames());
      const label = n => (window.WorldNames ? window.WorldNames.faction(n) : n);
      return [...set].filter(n => !powers.has(n))
        .sort((a, b) => label(a).localeCompare(label(b)));
    },

    // Every party currently seated anywhere (power attached), for the wiki's
    // Political Parties index; multiple entries can and do share an ideology.
    listPartyNames() { return this._roll('parties', this._listPartyNames); },
    _listPartyNames() {
      return (window.NPCPolitics?.listAllParties?.() || [])
        .map(({ party, powerName }) => ({ id: party.id, name: party.name, powerName, ideologyId: party.ideologyId }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    // Every non-alien creed in Ideology.json, so the Ideologies index is the
    // whole shelf and not only the handful presently in office; each carries
    // how many live parties currently hold it.
    listIdeologyNames() { return this._roll('ideologies', this._listIdeologyNames); },
    _listIdeologyNames() {
      const list = window.NPCShared?.ideologyList?.() || [];
      const parties = window.NPCPolitics?.listAllParties?.() || [];
      const label = e => (window.T ? window.T(e.name) : e.id);
      return list
        .filter(e => e && !e.alien)
        .map(e => ({
          id: e.id, name: e.name,
          partyCount: parties.reduce((n, { party }) => n + (party.ideologyId === e.id ? 1 : 0), 0),
        }))
        .sort((a, b) => (b.partyCount - a.partyCount) || label(a).localeCompare(label(b)));
    },

    listArtifacts() { return this._roll('artifacts', this._listArtifacts); },
    _listArtifacts() {
      const out = [];
      const seen = new Set();
      const generated = this._generatedArtifacts();
      if (generated) {
        for (const [kind, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]]) {
          for (const a of (list || [])) {
            if (a) { out.push({ key: `${kind}:${a.id}`, name: a.name, kind, iconIndex: a.iconIndex }); seen.add(`${kind}:${a.id}`); }
          }
        }
      }
      for (const [key, r] of Object.entries(this._hm()?.getArtifactRecords?.() || {})) {
        if (!seen.has(key)) out.push({ key, name: r.name, kind: r.kind, iconIndex: 245 });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    // ── name index & hyperlink pattern ───────────────────────────────────────

    _escapeForIndex(str) {
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    buildIndex() {
      // The index is keyed by the text a sentence contains, and that text is
      // written in the language being played, so it is rebuilt on a switch.
      const lang = (window.T && typeof T.language === 'function') ? T.language() : 'en';
      if (this._index && this._indexLang === lang) return this._index;
      this._indexLang = lang;
      this._linkRegex = null;
      const idx = new Map();
      const esc = new Map();
      const register = (name, entry) => {
        if (!name || String(name).length < 3 || idx.has(name)) return;
        idx.set(name, entry);
        esc.set(this._escapeForIndex(name), entry);
      };
      const add = (name, type, id) => {
        if (!name || String(name).length < 3) return;
        name = String(name);
        const entry = { type, id };
        register(name, entry);
        // A nation, hyperpower, faction or leader is indexed under its English
        // id because that is what the record stores, but the prose being
        // linkified reads its localized label. Both spellings open the same
        // article: a world simulated in English still holds English sentences.
        if (window.WorldNames) register(window.WorldNames.any(name), entry);
      };
      const hm = this._hm();
      for (const n of Object.keys(hm?.getHyperpowers?.() || {})) add(n, 'power', n);
      for (const n of (window.NPCPolitics?.listPowers?.() || [])) add(n, 'power', n);
      for (const n of Object.keys(hm?.getHistoricalFactions?.() || {})) add(n, 'faction', n);
      add(window.$gameFactions?.playerFaction?.()?.name, 'faction', window.$gameFactions?.playerFaction?.()?.name);
      for (const n of this.listNationNames()) add(n, 'nation', n);
      for (const data of Object.values(hm?.getHyperpowers?.() || {}))
        for (const l of (data?.leaders || [])) add(l?.name, 'leader', l?.name);
      for (const data of Object.values(hm?.getHistoricalFactions?.() || {}))
        for (const l of (data?.leaders || [])) add(l?.name, 'leader', l?.name);
      const powers = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcPolitics?.powers) || {};
      for (const p of Object.values(powers))
        for (const pol of Object.values(p?.politicians || {})) add(pol?.name, 'leader', pol?.name);
      for (const p of Object.values(powers))
        for (const party of (p?.parties || [])) add(party?.name, 'party', party?.id);
      for (const [key, r] of Object.entries(hm?.getArtifactRecords?.() || {})) add(r?.name, 'artifact', key);
      const generated = this._generatedArtifacts();
      if (generated) {
        for (const [kind, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]])
          for (const a of (list || [])) add(a?.name, 'artifact', `${kind}:${a.id}`);
      }
      this._index = idx;
      this._escIndex = esc;
      return idx;
    },

    resolve(name) { return this.buildIndex().get(String(name)) || null; },
    resolveEscaped(escapedName) {
      this.buildIndex();
      return this._escIndex.get(String(escapedName)) || null;
    },

    // Regex matching every known entity name inside *escaped* HTML text,
    // longest names first so "Holy Vatican Empire" beats "Vatican".
    linkPattern() {
      if (this._linkRegex !== null) return this._linkRegex || null;
      this.buildIndex();
      const names = [...this._escIndex.keys()]
        .sort((a, b) => b.length - a.length)
        .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      this._linkRegex = names.length
        ? new RegExp(`(?<![\\w&])(${names.join('|')})(?![\\w;])`, 'g')
        : false;
      return this._linkRegex || null;
    },
  };

  // ============================================================================
  // SECTION 9, GLOBALS
  // ============================================================================

  // There is nothing to say to a corpse. In a zombie world the panel never
  // opens on one of the dead walking, so none of it is ever built for one: no
  // talk, no gift, no leave. The interaction IS the fight, and NPCSystem is
  // handed it exactly as a bump in the street would be. Every other route in
  // (the action button, either touch trigger) is refused at the event itself,
  // see the Game_Event.start guard there; this covers a panel asked for by id
  // or by name from somewhere off the map.
  function _refusedAsZombie(ev) {
    const NS = window.NPCSystem;
    if (!ev || !NS || !NS.isZombieWalker?.(ev)) return false;
    NS.requestZombieBattle(ev);
    return true;
  }

  window.NPCEmpathize = {
    open(evNameOrId) {
      if ($gameTemp._NPCEmpathizeBypass) {
        $gameTemp._NPCEmpathizeBypass = false;
        return;
      }
      if (typeof evNameOrId === 'number') {
        if (_refusedAsZombie($gameMap?.event(evNameOrId))) return;
        Scene_NPCEmpathize._eventId = evNameOrId;
        Scene_NPCEmpathize._actorId = null;
        Scene_NPCEmpathize._entity  = null;
        SceneManager.push(Scene_NPCEmpathize);
      } else {
        const ev = _findEventByName(evNameOrId);
        if (ev) {
          if (_refusedAsZombie(ev)) return;
          Scene_NPCEmpathize._eventId = ev.eventId();
          Scene_NPCEmpathize._actorId = null;
          Scene_NPCEmpathize._entity  = null;
          SceneManager.push(Scene_NPCEmpathize);
        } else {
          console.warn(`[NPCEmpathize] open: no event named "${evNameOrId}" on current map.`);
        }
      }
    },
    // `tab` opens the new panel on a given tab instead of the chat.
    openByName(npcName, tab = null) {
      if ($gameTemp._NPCEmpathizeBypass) {
        $gameTemp._NPCEmpathizeBypass = false;
        return;
      }
      const ev = _findEventByName(npcName);
      if (_refusedAsZombie(ev)) return;

      _pushReturnContext();
      const ctx = ev
        ? { eventId: ev.eventId(), actorId: null, npcName: null, entity: null, tab }
        : { eventId: null, actorId: null, npcName, entity: null, tab };
      _navigateInPlace(ctx);
    },
    // Open a wiki entity page (nation, hyperpower, leader, artifact, faction)
    // in the same panel. `id` may be URI-encoded (hyperlink onclick handlers).
    openEntity(type, id) {
      try { id = decodeURIComponent(id); } catch (_) { /* raw id */ }
      if (type === 'npc') return this.openByName(id);
      _pushReturnContext();
      _navigateInPlace({ eventId: null, actorId: null, npcName: null, entity: { type, id } });
    },
    openForActor(actorId) {
      if ($gameTemp._NPCEmpathizeBypass) {
        $gameTemp._NPCEmpathizeBypass = false;
        return;
      }
      // Asked from inside the panel itself (a world leader's wiki article, when
      // that leader turns out to be travelling with the player) this is a hop
      // like any other: navigate in place and leave a way back, rather than
      // stacking a second copy of the panel on top of the first.
      if (SceneManager._scene instanceof Scene_NPCEmpathize) {
        _pushReturnContext();
        _navigateInPlace({ eventId: null, actorId, npcName: null, entity: null });
        return;
      }
      Scene_NPCEmpathize._eventId = null;
      Scene_NPCEmpathize._actorId = actorId;
      Scene_NPCEmpathize._entity  = null;
      SceneManager.push(Scene_NPCEmpathize);
    },
    // Open the panel straight on the Wiki index tab (optionally on a specific
    // category, e.g. 'party'), used by the main menu's Dynamics command.
    // Anchored to the party leader's actor profile so the left panel is valid.
    openWiki(category = null) {
      Scene_NPCEmpathize._eventId = null;
      Scene_NPCEmpathize._actorId = $gameParty?.leader()?.actorId() ?? 1;
      Scene_NPCEmpathize._entity  = null;
      Scene_NPCEmpathize._initialTab = 'wiki';
      Scene_NPCEmpathize._initialWikiCategory = category;
      SceneManager.push(Scene_NPCEmpathize);
    },
    Scene_NPCEmpathize,
    Wiki,
    // ── Speaking for the beasts ────────────────────────────────────────────
    // The other half of the feral rule. A non-sentient PARTY member's words
    // come out as noise on their way to an NPC (_submitAsk); a non-sentient
    // NPC's come out as noise on their way back. Both go through the same
    // bank, so a growl sounds like a growl whichever throat it is in.
    //
    // Public because the line an NPC says on the map is drawn somewhere else
    // entirely (MarkovTextGenerator's "Generate NPC Dialogue" command), and it
    // has to be able to ask both questions without reaching into the panel's
    // private helpers.
    isNonSentientNPC(npcName) { return _isNonSentientNpc(npcName); },
    // ── Em and Bubba, out loud on the map ──────────────────────────────────
    // The pair banks are not only for the panel. A bubble over one of their
    // heads while the party walks is the `situations` bank talking, and the
    // trick of it is that a speaker's own lines live in the bank of the
    // direction where they are the one being TALKED TO: `em.bubba` is what
    // Bubba says while Em holds the conversation, so it is Bubba's voice.
    // Answers null unless both of them are actually walking together, since
    // neither of them says any of it to nobody.
    //
    // Public because the party's bubbles are drawn somewhere else entirely
    // (Core/AutoIdleExplorer.js), the way the growl bank already is.
    pairAmbientLine(actor) {
      const name = String(actor?.name?.() || '').trim().toLowerCase();
      const side = name === EM_NAME.toLowerCase()    ? 'bubba'
                 : name === BUBBA_NAME.toLowerCase() ? 'em'
                 : null;
      if (!side) return null;
      // `side` names the bank, which is the direction the OTHER one is the
      // talker in: Bubba's own lines are the em.bubba bank ('em'), so the
      // person who has to be walking alongside him is Em, and the mirror.
      const other = side === 'em' ? EM_NAME : BUBBA_NAME;
      const walking = ($gameParty?.members?.() ?? [])
        .some(m => m && String(m.name() || '').trim().toLowerCase() === other.toLowerCase())
        || (other.toLowerCase() === BUBBA_NAME.toLowerCase() && !!(window.$gameSwitches?.value(100)));
      if (!walking) return null;
      const line = _pairSituationLine(_pairData(side));
      return line ? vary(String(line)) : null;
    },
    // The two of them winding each other up, as a pair of lines the caller can
    // put in two bubbles or two message boxes. `leader` is the one who starts
    // it; the other one always answers.
    pairBickerBeat(leader) {
      const ctx = _pairContext(leader, leader && String(leader.name?.() || '').trim().toLowerCase() === EM_NAME.toLowerCase()
        ? BUBBA_NAME : EM_NAME, null);
      const beat = ctx && _rand(ctx.data.bicker || []);
      if (!beat || !beat.player || !beat.reply) return null;
      return { player: vary(String(beat.player)), reply: vary(String(beat.reply)) };
    },
    // Everything the two of them can do to each other in the panel, as one beat
    // the map can play: the jab, any of the Socialize moves in their own two
    // voices, and - only when SHE is the one asking, the way the panel only
    // ever offers her Court - the question he turns down the same way every
    // time. Which kind it is is picked at random, so talking to him on the road
    // is no longer the same bickering loop over and over.
    //
    // `leader` is the one who starts it; the other one always answers, and the
    // bond is paid exactly as the matching panel action pays it.
    pairTalkBeat(leader) {
      const meIsEm  = String(leader?.name?.() || '').trim().toLowerCase() === EM_NAME.toLowerCase();
      const other   = meIsEm ? BUBBA_NAME : EM_NAME;
      const ctx     = _pairContext(leader, other, null);
      if (!ctx) return null;
      const db   = _socialLines();
      const data = ctx.data;
      const fill = s => vary(String(s || '').replace(/\{name\}/g, other));

      // Any conversation available in the Empathize UI between Em and Bubba:
      // bicker jabs, Socialize moves (praise/smalltalk/etc.), joke performances,
      // stories, poems, situational remarks, and her raising Court and him turning it down.
      const kinds = [];
      if ((data.bicker || []).length) kinds.push('bicker');
      if ((db.interactions || []).length) kinds.push('social');
      if (typeof _genJoke === 'function' || db.jokes) kinds.push('joke');
      if ((db.performances?.story?.player || []).length) kinds.push('story');
      if ((db.performances?.poem?.player || []).length) kinds.push('poem');
      if (meIsEm && (db.romance?.actions || []).length && (db.romance?.rejection?.bubbaHimself?.lines || []).length) kinds.push('court');
      if ((data.greeting || []).length || data.situations) kinds.push('situation');
      if (!kinds.length) return null;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];

      if (kind === 'bicker') {
        const beat = _rand(data.bicker);
        if (!beat || !beat.player || !beat.reply) return null;
        _addPairBond(1 + Math.floor(Math.random() * 3));
        return { kind, player: fill(beat.player), reply: fill(beat.reply) };
      }

      if (kind === 'social') {
        const def  = _rand(db.interactions || []);
        const tone = (def && def.tone) || 'neutral';
        const said = _rand(data.player?.[tone] || data.player?.neutral || data.player);
        const back = _rand(data[tone] || data.neutral);
        if (!said || !back) return null;
        _addPairBond(Math.round(Math.abs(Number(def?.baseDelta) || 1) * _stanceToneMult(ctx, tone)));
        return { kind, player: fill(said), reply: fill(back) };
      }

      if (kind === 'joke') {
        const joke = (typeof _genJoke === 'function' ? _genJoke() : null)
          || _rand(db.jokes?.landGood || []) || "Why did the chicken cross the road?";
        const back = _rand(data.positive || data.neutral || data);
        if (!joke || !back) return null;
        _addPairBond(1 + Math.floor(Math.random() * 3));
        return { kind, player: fill(joke), reply: fill(back) };
      }

      if (kind === 'story') {
        const perf = db.performances?.story;
        const subject = (typeof window !== 'undefined' && window.RandomBookGenerator?.generateTitle?.())
          || (typeof vary === 'function' ? vary('The Legend of the Road') : 'The Legend of the Road');
        const raw = _rand(perf?.player || []);
        if (!raw) return null;
        const said = vary(String(raw).replace(/\{subject\}/g, subject).replace(/\{name\}/g, other));
        const back = _rand(data.positive || data.neutral || perf?.good || []);
        if (!said || !back) return null;
        _addPairBond(1 + Math.floor(Math.random() * 3));
        return { kind, player: fill(said), reply: fill(back) };
      }

      if (kind === 'poem') {
        const perf = db.performances?.poem;
        const subject = (typeof window !== 'undefined' && window.RandomBookGenerator?.generateTitle?.())
          || (typeof vary === 'function' ? vary('The Open Road') : 'The Open Road');
        const raw = _rand(perf?.player || []);
        if (!raw) return null;
        const said = vary(String(raw).replace(/\{subject\}/g, subject).replace(/\{name\}/g, other));
        const back = _rand(data.positive || data.neutral || perf?.good || []);
        if (!said || !back) return null;
        _addPairBond(1 + Math.floor(Math.random() * 3));
        return { kind, player: fill(said), reply: fill(back) };
      }

      if (kind === 'court') {
        const act = _rand(db.romance?.actions || []);
        const said = _rand(act?.player || []);
        const back = _rand(db.romance?.rejection?.bubbaHimself?.lines || []);
        if (!said || !back) return null;
        _addPairBond(1);
        return { kind, player: fill(said), reply: fill(back) };
      }

      if (kind === 'situation') {
        const sit = (typeof _pairSituationLine === 'function' ? _pairSituationLine(data) : null)
          || _rand(data.greeting || []);
        const ans = _rand(data.player?.neutral || data.player?.positive || data.player);
        if (!sit || !ans) return null;
        _addPairBond(1 + Math.floor(Math.random() * 2));
        return { kind, player: fill(ans), reply: fill(sit), reverse: true };
      }

      return null;
    },
    // `npcName` is what decides which of the eight voices the noise comes out
    // in; without it the Feral bank answers, which is what every caller written
    // before the classes had voices of their own expects.
    growlFor(text, npcName) { return _feralGrowlFor(text, _creatureClassOfNpc(npcName)); },
    // Log a line an NPC said outside this panel (e.g. MarkovTextGenerator's
    // "Generate NPC Dialogue" plugin command drawing a message box) so it shows
    // up in that NPC's chat history the next time the panel is opened. Stored on
    // the society profile, so it survives saves and is world-shared like the
    // rest of the profile. Mirrored into a panel that is already open on this
    // NPC so the line appears live rather than only on the next visit.
    recordNPCLine(npcName, text, role = 'npc') {
      const name = String(npcName ?? '').trim();
      const line = vary(String(text ?? '').trim());
      if (!name || !line) return;
      const profile = _getProfile(name);
      if (profile) {
        if (!Array.isArray(profile.spokenLog)) profile.spokenLog = [];
        profile.spokenLog.push({ role, text: line, gameMin: $gameVariables?.value(114) ?? 0 });
        if (profile.spokenLog.length > SPOKEN_LOG_MAX)
          profile.spokenLog = profile.spokenLog.slice(-SPOKEN_LOG_MAX);
      }
      const scene = SceneManager._scene;
      if (scene instanceof Scene_NPCEmpathize && scene._overlay) {
        const open = scene._eventId != null ? _getNPCName(scene._eventId) : scene._npcName;
        if (open === name) {
          scene._chatHistory.push({ role, text: line });
          if (scene._chatHistory.length > 16) scene._chatHistory = scene._chatHistory.slice(-16);
          scene._render();
          scene._scrollChatToBottom();
        }
      }
    },
    _helpers: {
      _getNPCName, _getProfile, _extractClassId, _hasJoinPartyCommand, _hasSelfSwitchAPage,
      // Written characters: never fought, never infected (see _isStoryNpc).
      _isStoryNpc, STORY_PROTECTED_ACTIONS,
      _resolveBustForActor, _resolveBustPath, _resolveMarkovDb,
      // Every portrait the UI layer draws is built here, so a name that names
      // no file on disk shows the house bust instead of a broken frame.
      _bustUrl,
      _eventCommentLines, _bustNameFromEvent, _presetFromEvent,
      _computePartyPredisposition, _medianScore, _generatePartyThoughts,
      _extractContacts, _countRecentInteractions, _lastInteractionDay,
      _forceHighJoinChance, _joinChance, _joinLevelOk, _partyMaxLevel,
      _travellingPartyCount, SPOKEN_LOG_MAX,
      // Infecting somebody out of a vial: what is in the pack and the odds of
      // not being seen doing it, both read by the UI layer's action row.
      _diseaseVialId, _diseaseVialItems, _infectChance,
      // Social/romance maths, shared with the UI layer's romance submenu.
      _socialLines, _rand, _vary: vary, vary, _addNpcOpinion, _npcEffectiveOpinion,
      // Company on its own, for an exchange that moves no opinion at all: a
      // rumour passed on in the street is still time spent with somebody.
      _gainSocialFromCompany,
      // Which Socialize moves are entertainment, so the submenu can mark the
      // ones that feed Fun as well as opinion. The joke grammar and the Fun
      // payout travel with them: the map talk plays the same three
      // entertainment moves the panel does (NPC/DialogueSystem.js), so it has
      // to be able to build a joke and to pay for one that landed.
      FUN_ACTIONS, _genJoke, _payFun,
      // The ledger underneath _addNpcOpinion, for a caller that has already
      // paid the company for this exchange and only wants the number moved
      // (AutoIdleExplorer's two-sided party conversations).
      _npcBaseOpinion, _setNpcBaseOpinion,
      // Romantic attraction: a ledger of its own, moved only by Court and
      // Propose, read by the UI layer's romance chance math and its own bar.
      _addNpcAttraction, _npcEffectiveAttraction, _npcBaseAttraction,
      _setNpcBaseAttraction, _computePartyAttraction,
      _traitCompatBonus, _personalitySocialMult, _hygienePenalty, _hygieneReadout,
      // Em (Switch 48): stance resolution, shared with the UI layer so it can
      // hide what she is not allowed to do and label what she is walking into.
      _emPlaythrough, _isEmActor, _isBubbaNpc, _emContext, _emStanceKey, _emStanceData,
      // Bubba (Switch 49): the same for the man who built the Liminal Engine,
      // so the UI can hide what he refuses to do and label what he walks into.
      _bubbaPlaythrough, _isBubbaActor, _bubbaContext, _bubbaDb,
      _isEmNpc, _pairSide, _pairContext, _pairSituationKeys, _pairSituationLine,
      _pairBond, _addPairBond,
      // The three above are read on the map as well as in the panel now
      // (NPC/DialogueSystem.js stages the same voices in a bust exchange), so
      // the tone scaling and the two first-impression seeds travel with them:
      // whichever of the two the player meets first, the standing it writes is
      // the one the panel then displays.
      _stanceToneMult, _emSeedFirstImpression, _bubbaSeedFirstImpression,
      // Non-sentient members (classes 63+): the UI layer builds their action
      // list out of these and hides everything a beast cannot do.
      _animalJoinChance, _wisMod, _recruitAnimalAsPet, _recruitAnimalAsMember,
      _isNonSentientActor, _feralKind, _feralBand, _feralCanGift, FERAL_ACTIONS,
      _feralGrowlFor, _feralNoise, _isNonSentientNpc,
      // Petting and feeding: the UI layer builds the beast action row and the
      // feeding tray out of these.
      _feedKind, _feedCalories, _feedOpinion, _feedItemsInPack, PET_OPINION,
    },
    _getT,
  };

  console.log('[NPCEmpathize] v3.0.0 loaded.');
})();
