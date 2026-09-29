/*:
 * @target MZ
 * @plugindesc NPC Society: procedural backstory (window.NPCHistSim)
 * @author Omni-Lex
 * @base NPCSociety
 * @orderAfter NPCSociety
 * @orderAfter NPCSociety_Gear
 * @help
 * ============================================================================
 * NPCSociety_Backstory, part of the NPCSociety family
 * ============================================================================
 * Owns SECTION 7, PROCEDURAL BACKSTORY. Loads last: it binds the late names
 * every module reads once the family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSocietyRegistry._internal and publishes its own there. Load it right after
 * NPCSociety_Gear.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    DataLoader, escapeHtml, nameToSeed, SeededRng, SocietyRegistry,
  } = window.NPCSocietyRegistry._internal;

  // ==========================================================================
  // SECTION 7: PROCEDURAL BACKSTORY (formerly NPCSystemHistorySimulator.js)
  // ==========================================================================
  // Generates a deterministic biographical backstory for each NPC by pulling
  // events from HistorySimulator's generated timeline that the NPC "lived
  // through". Seeded from nameToSeed(npcName) XOR the world seed, like every
  // other facet of the profile. Stored in profile.backstory and displayed in
  // the NPCEmpathize panel as a "BACKGROUND" section below Stats.

  // Indexed by gender: 0 Male, 1 Female, 2 Non-binary, 3 Cocoon (neopronoun
  // "xe"). Each entry carries its own conjugated verb forms, because a language
  // that agrees on gender needs a different word, not a different rule:
  // NPCSociety.pronoun.<gender> in js/i18n/<lang>/plugins.
  const PRONOUN_COUNT = 4;
  const pronounOf = (gender) =>
    T.obj('NPCSociety.pronoun.' + Math.min(Math.max(gender | 0, 0), PRONOUN_COUNT - 1));

  // Five adjectives, drawn by index so the seeded sequence never moves. They
  // describe the "creature" or the "soul", never the person, so a language
  // that inflects them agrees with that noun and needs only one list.
  const ADJECTIVE_COUNT = 5;
  function adjectiveAt(index) {
    const pool = T.pool('NPCSociety.adjective');
    return pool[index % pool.length] || '';
  }

  // Representative city for each HistorySimulator country, used to anchor a
  // creature's "born in the wilds near <city>" origin to its birthplace nation.
  // i18n-ignore-start: real place names, and HistorySimulator country ids
  const CITY_BY_COUNTRY = {
    'Italy': 'Rome', 'United Kingdom': 'London', 'Norway': 'Oslo',
    'Russia': 'Moscow', 'Turkey': 'Istanbul', 'Netherlands': 'Amsterdam',
    'Belgium': 'Brussels', 'Switzerland': 'Zurich', 'Austria': 'Vienna',
    'Poland': 'Warsaw', 'Czechoslovakia': 'Prague', 'Hungary': 'Budapest',
    'Romania': 'Bucharest', 'Bulgaria': 'Sofia', 'Yugoslavia': 'Belgrade',
    'Greece': 'Athens', 'Denmark': 'Copenhagen', 'Sweden': 'Stockholm',
    'Finland': 'Helsinki', 'Ireland': 'Dublin', 'Albania': 'Tirana',
    'Estonia': 'Tallinn', 'Latvia': 'Riga', 'Lithuania': 'Vilnius',
  };
  // i18n-ignore-end

  // Nations vs towns. A birthplace is stored under its English id, so the two
  // are told apart against the world data and not against the label a language
  // draws: everything the timeline or Countries.json knows is a country, and
  // anything else (a dossier hometown, an invented "...bledon") is a town.
  let _nationSet = null, _nationSize = -1;
  function isNationId(raw) {
    const name = String(raw == null ? '' : raw).trim();
    if (!name) return false;
    if (name === 'Europe') return true; // i18n-ignore: the continent-wide fallback id
    const listed = (window.WorldGen && window.WorldGen.Countries) || [];
    if (!_nationSet || _nationSize !== listed.length) {
      _nationSet = new Set(Object.keys(window.HistorySimulator_COUNTRIES || {}));
      for (const c of listed) if (c && c.country) _nationSet.add(c.country);
      _nationSize = listed.length;
    }
    return _nationSet.has(name);
  }

  // The preposition and the article in front of a place belong to the language,
  // not to the sentence: English says "in Italy" but "in the Netherlands", and
  // Italian says "in Italia", "nei Paesi Bassi" and "a Bologna". So a bio is
  // handed a finished locative phrase, keyed on the English id (the only stable
  // spelling), with the plain "in {place}" rule as the fallback.
  function locativeOf(rawId, label) {
    const slug = window.WorldNames
      ? window.WorldNames.slug(rawId)
      : String(rawId || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const own = 'NPCSociety.bio.placeIn.' + slug;
    if (slug && T.has(own)) return T(own, { place: label });
    return T(isNationId(rawId) ? 'NPCSociety.bio.inCountry' : 'NPCSociety.bio.inTown',
             { place: label });
  }

  // One wording out of the bank a key holds, picked by index so the same person
  // is always written the same way. A language that still ships a single string
  // instead of a bank answers with that string.
  function wording(key, params, index) {
    const bank = T.list(key, params);
    if (!bank.length) return T(key, params);
    return bank[((index % bank.length) + bank.length) % bank.length];
  }

  // ---------------------------------------------------------------------------
  // Class origins
  // ---------------------------------------------------------------------------
  // Every class answers the question the era templates never did: not when this
  // person was born but how they came to be a Witch, a Lumberjack or a Zombie.
  // The bank is NPCSociety.bio.classOrigin.<slug>, keyed on the class's own
  // English database name reduced to letters and digits, which is the one
  // spelling that survives a language switch.
  const classSlug = (classId) => {
    const entry = (typeof $dataClasses !== 'undefined' && $dataClasses)
      ? $dataClasses[Number(classId) || 0] : null;
    return entry && entry.name
      ? String(entry.name).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  };

  // One origin out of that class's bank, or '' for a class the bank has no page
  // for (a mod's class, a bio rolled before the bank existed).
  function classOriginOf(classId, params, index) {
    const slug = classSlug(classId);
    if (!slug) return '';
    const key = 'NPCSociety.bio.classOrigin.' + slug;
    const bank = T.list(key, params);
    if (!bank.length) return '';
    return bank[((index % bank.length) + bank.length) % bank.length];
  }

  // Which side of the line a bio is written from. window.NPCCreature owns the
  // boundary; nothing here compares an id.
  const bioIsNonSentient = (classId) =>
    !!(classId && window.NPCCreature && window.NPCCreature.isNonSentientClassId(classId));

  // The one non-sentient class the world still reaches: a Drone holds no creed
  // and no trade like every other beast, but it was BUILT with the world
  // written into it as a set of conditions, so the timeline is exactly what it
  // reacts to. Every other creature class is deaf to history and its bio says
  // nothing about coups, wars or elections.
  const EVENT_AWARE_CREATURE = new Set(['drone']); // i18n-ignore: Classes.json name slug
  // And the two that were assembled rather than whelped, which are not "born in
  // the wilds near" anywhere even when the creature builder made them.
  const MANUFACTURED_CREATURE = new Set(['drone', 'manacyborg']); // i18n-ignore: Classes.json name slugs

  const BackstoryGenerator = {

    // `salt` re-rolls a bio that has already been written (rerollBackstory);
    // without it the name is the whole seed, so the same person always gets the
    // same formative events back in the same world.
    generate(eventName, profile, salt) {
      // An animal has no era and no formative events: its bio is where it was
      // born, to whom, and what its kind is like (NPCLife_Animals.bioOf), aged
      // by its own kind's lifespan rather than 18 + level * 2.
      const Animals = window.NPCLifeSim?.Animals;
      if (Animals?.isAnimalProfile?.(profile, eventName) && Animals.backstoryFor) {
        return Animals.backstoryFor(eventName, profile);
      }
      // Read through HistoryManager so backstories see the active-world timeline
      // (WorldManager store) as well as the $gameSystem fallback.
      const events = window.HistoryManager
        ? window.HistoryManager.getEvents()
        : $gameSystem?._historicalEvents;
      if (!events?.length) return null;

      const worldSeed = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new SeededRng((nameToSeed(eventName + (salt || '')) ^ worldSeed) >>> 0);

      // ── Birth year ──────────────────────────────────────────────────────────
      // A curated preset dossier (CharacterCreationPresets) wins over the
      // level-derived estimate, so a pre-made character's stated birth date
      // doesn't contradict what the Empathize panel narrates.
      // Every NPC is an adult: the level-derived estimate is floored at 18 and
      // subtracted from the CURRENT in-game year (not a hardcoded 2001), so a
      // backstory can never describe a minor. A dossier-supplied birth year is
      // honoured but held to the same floor.
      const MIN_AGE   = window.NPCLifeSim?.MIN_NPC_AGE ?? 18;
      const nowYear   = window.NPCLifeSim?.currentYear?.() ?? 2001;
      const age       = MIN_AGE + Math.max(0, profile.level ?? 1) * 2;
      const rolled    = Math.max(1900, nowYear - Math.min(age, 101));
      // A child born into the world (NPCLifeSim FAMILY, profile._child) is the
      // one exception: their birth year is a fact, not an estimate.
      const birthYear = profile._birthYearOverride != null
        ? (profile._child ? Math.min(profile._birthYearOverride, nowYear)
                          : Math.min(profile._birthYearOverride, nowYear - MIN_AGE))
        : rolled;

      // ── Candidate events ────────────────────────────────────────────────────
      let candidates = events.filter(e => {
        const y = parseInt((e.date || '').slice(0, 4), 10);
        return !isNaN(y) && y >= birthYear;
      });
      if (candidates.length < 2) {
        // Fallback: last 30 simulated years
        candidates = events.filter(e => {
          const y = parseInt((e.date || '').slice(0, 4), 10);
          return !isNaN(y) && y >= 1971;
        });
      }
      if (!candidates.length) candidates = events.slice(-10);

      // ── Score candidates ────────────────────────────────────────────────────
      const traits     = DataLoader.traits ?? [];
      const factions   = DataLoader.factions ?? [];
      const factionObj = profile.factionIndex >= 0 ? factions[profile.factionIndex] : null;
      const factionKey = factionObj ? (factionObj.name || '').split('.')[1] || '' : '';

      const traitNames = (profile.traitIds ?? []).map(id => {
        const t = traits.find(tr => tr.id === id);
        return (t?.name || '').toLowerCase();
      });
      const isMilitary = traitNames.some(n => n.includes('brave') || n.includes('violent') || n.includes('aggressive'));

      const scored = candidates.map(e => {
        let score = rng.next() * 10;
        if (e.category === 'paranormal' && (profile.moralityScore ?? 0) < -20) score += 4;
        if (e.category === 'political'  && (profile.moralityScore ?? 0) > 20)  score += 4;
        if (e.category === 'military'   && isMilitary)                          score += 3;
        if (e.category === 'social')                                             score += 2;
        if (factionKey && (e.description || '').toLowerCase().includes(factionKey.toLowerCase())) score += 5;
        return { event: e, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const pickCount = candidates.length >= 15 ? 3 : 2;
      // The i18n key travels with the snapshot: an NPC's formative events are
      // copied out of the timeline, and a copy that kept only the finished
      // prose would freeze the bio in the language the century was simulated
      // in (an English coup quoted inside an Italian sentence).
      const formativeEvents = scored.slice(0, pickCount).map(s => ({
        date:        (s.event.date || '').slice(0, 7),
        description: s.event.description || '',
        descKey:     s.event.descKey || null,
        descParams:  s.event.descParams || null,
        category:    s.event.category || 'social',
      }));

      // ── Birthplace ──────────────────────────────────────────────────────────
      const countries = Object.entries(window.HistorySimulator_COUNTRIES ?? {});
      let birthplace = profile._birthplaceOverride || 'Europe'; // i18n-ignore: HistorySimulator country id
      if (!profile._birthplaceOverride && countries.length) {
        const weights = countries.map(([, data]) => {
          const matches = factionKey && (data.faction || '').toLowerCase().includes(factionKey.toLowerCase());
          return matches ? 3 : 1;
        });
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = rng.next() * totalW;
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i];
          if (r <= 0) { birthplace = countries[i][0]; break; }
        }
      }

      // ── Narrative ───────────────────────────────────────────────────────────
      // Only the pieces are stored. The sentence is written out by
      // BackstoryGenerator.narrativeOf() every time the bio is drawn, so it
      // follows a language switch instead of freezing at first meeting.
      const seed = {
        gender:     Math.min(profile.gender ?? 0, PRONOUN_COUNT - 1),
        adjIdx:     rng.nextInt(0, ADJECTIVE_COUNT),
        // Which wording of the era template this person is written with. Drawn
        // last, so a backstory rolled before wordings varied keeps every other
        // piece it was rolled with.
        varIdx:     rng.nextInt(0, 24),
        isCreature: !!profile.isCreature,
        moral:      profile.moralityScore ?? 0,
        // The class the bio is written around. Every class carries its own
        // bank of origins (NPCSociety.bio.classOrigin.<slug>), so the sentence
        // says how this person or thing came to be what it is rather than only
        // when it was born. Stored rather than read off the profile at draw
        // time, because a bio is also drawn for somebody the registry no
        // longer holds; the wizard re-rolls the bio whenever the class
        // changes, so the two never drift.
        classId:    profile.assignedClassId ?? null,
        // Which origin of that class's bank, drawn separately from varIdx so
        // two people of the same class born in the same era do not have to
        // share a story.
        originIdx:  rng.nextInt(0, 64),
      };

      return { birthYear, birthplace, formativeEvents, seed };
    },

    // Compose the bio. A profile generated before this was keyed keeps the
    // finished `narrative` string it was saved with.
    narrativeOf(backstory) {
      if (!backstory) return '';
      const seed = backstory.seed;
      if (!seed) return backstory.narrative || '';
      // An animal's bio (NPCSociety.animalBio), written out afresh each time.
      if (seed.animal) return window.NPCLifeSim?.Animals?.bioOf?.(seed.name) || '';

      // What this character IS decides the shape of the whole sentence, down
      // to the pronoun, so it is settled before a word is written:
      //   , a beast (every creature class but the Drone) is deaf to history.
      //     Its bio is its class origin and nothing else: no coup, no election
      //     and no war ever reached it, so none is quoted at it.
      //   , a Drone is the exception, because it was manufactured with the
      //     world written into it as a list of conditions to answer.
      //   , everybody else keeps the era template they always had, with the
      //     class origin written in after it.
      const slug = classSlug(seed.classId);
      const beast = bioIsNonSentient(seed.classId);
      const eventAware = !beast || EVENT_AWARE_CREATURE.has(slug);
      const manufactured = MANUFACTURED_CREATURE.has(slug);

      // A beast is an "it" throughout, closing line included. Written out of
      // its own pronoun set rather than out of the gender it was rolled, or a
      // bio would open on "It was assembled" and close on "he".
      const pr  = beast ? T.obj('NPCSociety.pronoun.beast') : pronounOf(seed.gender);
      const adj = adjectiveAt(seed.adjIdx);
      // A backstory rolled before the wordings varied has no varIdx of its own,
      // so one is derived from what it does carry: the same person still reads
      // the same way every time the bio is drawn.
      const vIdx = (seed.varIdx != null ? seed.varIdx | 0
                                        : ((backstory.birthYear | 0) + (seed.adjIdx | 0) * 7)) >>> 0;
      const evs = backstory.formativeEvents || [];
      const ev0 = _shortDesc(_eventText(evs[0]));
      const ev1 = evs[1]
        ? wording('NPCSociety.bio.later',
                  Object.assign({}, pr, { event: _shortDesc(_eventText(evs[1])) }), vIdx + 1)
        : '';

      const moral = seed.moral;
      const band = moral > 60 ? 'high' : moral > 20 ? 'good' : moral > -20 ? 'weary'
                 : moral > -60 ? 'loose' : 'lawless';
      // Offset off the era wording, so the closing line does not always fall
      // with the same opening one.
      const moralLine = wording('NPCSociety.bio.moral.' + band, pr, vIdx + (seed.adjIdx | 0) + 2);

      // A birthplace is a country for most people and a town for anyone born
      // from a dossier hometown; a town reads by its Destinations.json "name",
      // a country by its WorldNames label. Both are stored under their English
      // id, which is what CITY_BY_COUNTRY and the dossiers match on.
      const birthplace = window.WorldNames
        ? window.WorldNames.place(backstory.birthplace)
        : backstory.birthplace;
      // Where the sentence says the person is from, preposition and article
      // included, so a template only ever writes "{born} {placeIn}".
      let placeIn;
      let key;
      if (seed.isCreature && !manufactured) {
        // Creatures aren't born into a nation, they come out of the wilds near
        // the city closest to their birthplace country.
        const city = CITY_BY_COUNTRY[backstory.birthplace] || birthplace;
        placeIn = T('NPCSociety.bio.wildsNear', {
          city: window.WorldNames ? window.WorldNames.place(city) : city,
        });
        key = 'creature';
      } else {
        placeIn = locativeOf(backstory.birthplace, birthplace);
        if (backstory.birthYear <= 1919) key = 'turbulent';
        else if (backstory.birthYear <= 1945) key = 'warYears';
        else if (backstory.birthYear <= 1969) key = 'postwar';
        else key = 'modern';
      }

      // A bio rolled before the origins existed carries no originIdx, so one is
      // derived from what it does carry and the same character keeps reading
      // the same way.
      const oIdx = (seed.originIdx != null ? seed.originIdx | 0
                                           : ((backstory.birthYear | 0) * 3 + vIdx)) >>> 0;
      const params = Object.assign({}, pr, {
        year: backstory.birthYear, place: birthplace, placeIn: placeIn, adj: adj,
        event: ev0, later: ev1, moral: moralLine,
      });
      params.classOrigin = classOriginOf(seed.classId, params, oIdx);

      if (beast) {
        // The Drone's own template quotes the timeline; every other creature
        // class uses the one that does not mention it at all.
        const bank = eventAware ? 'NPCSociety.bio.drone' : 'NPCSociety.bio.beast';
        // Without a class origin to hang it on, the beast template would read
        // as a sentence with a hole in it, so an unbanked class falls back to
        // the ordinary wording it has always had.
        if (params.classOrigin) {
          return wording(bank, params, vIdx).replace(/  +/g, ' ').trim();
        }
      }

      const era = wording('NPCSociety.bio.' + key, params, vIdx);
      // The class origin follows the era sentence rather than being written
      // into all twenty era wordings: one line, one place to change it, and a
      // bank that is still complete for a class the era templates never knew.
      return `${era} ${params.classOrigin}`.replace(/  +/g, ' ').trim();
    },
  };

  // Re-capitalize proper nouns (country / hyperpower / faction / leader names)
  // after an event description has been lowercased to flow mid-sentence, so the
  // bio reads "...survived the october revolution and Vladimir Lenin's purges".
  let _pnNouns = null, _pnRe = null, _pnMap = null;
  function _restoreProperNouns(text) {
    let nouns = window.HistorySimulator_PROPER_NOUNS;
    if (!nouns || !nouns.length) return text;
    // Merge in live, simulated names (dynamic hyperpowers / nations / leaders)
    // so names not in the static export still get re-capitalized (#82).
    const hm = window.HistoryManager;
    if (hm) {
      const extra = [];
      const hp = hm.getHyperpowers ? (hm.getHyperpowers() || {}) : {};
      for (const name of Object.keys(hp)) {
        extra.push(name);
        for (const l of ((hp[name] && hp[name].leaders) || [])) if (l && l.name) extra.push(l.name);
        for (const l of ((hp[name] && hp[name].holy_leaders) || [])) if (l && l.name) extra.push(l.name);
      }
      const ns = hm.getNationsState ? (hm.getNationsState() || {}) : {};
      for (const n of Object.keys(ns)) {
        extra.push(n);
        if (ns[n] && ns[n].controller && ns[n].controller !== 'Neutral') extra.push(ns[n].controller);
      }
      if (extra.length) nouns = nouns.concat(extra.filter(Boolean));
    }
    // The sentence being reflowed has already been written out in the active
    // language, so the names inside it are the localized ones. The English list
    // is kept as well: a world simulated before descriptions were keyed still
    // quotes English prose.
    if (window.WorldNames) {
      const localized = Array.from(window.WorldNames.map().values());
      if (localized.length) nouns = nouns.concat(localized);
    }
    if (nouns !== _pnNouns) {
      _pnNouns = nouns;
      // Longest first so multi-word names win over their substrings.
      const seen = new Set();
      const sorted = nouns.filter(n => { const k = String(n).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.length - a.length);
      _pnMap = new Map(sorted.map(n => [n.toLowerCase(), n]));
      const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      _pnRe = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
    }
    return text.replace(_pnRe, m => _pnMap.get(m.toLowerCase()) || m);
  }

  // A snapshotted event's sentence in the active language. A snapshot taken
  // before the timeline was keyed keeps the prose it was saved with.
  function _eventText(ev) {
    if (!ev) return '';
    if (ev.descKey && window.HistoryManager?.describeRecord) {
      return window.HistoryManager.describeRecord(ev);
    }
    return ev.description || '';
  }

  function _shortDesc(desc) {
    if (!desc) return T('NPCSociety.bio.uncertainTimes');
    // Event descriptions are read as clauses inside the narrative, so they are
    // quoted in full: cutting them at 60 characters left every second sentence
    // trailing off mid-thought. Only a runaway description is trimmed, and then
    // at a word boundary.
    const MAX = 240;
    // The clause is dropped into the middle of a sentence that supplies its
    // own full stop, so it gives up whatever it ended on: a headline event
    // ("...overthrowing Sniper Zaitsev!") otherwise read as "Zaitsev!.".
    const text = desc.replace(/[.!?…]+\s*$/, '');
    if (text.length <= MAX) return _restoreProperNouns(text.toLowerCase());
    const cut = text.slice(0, MAX).replace(/\s\S*$/, '');
    return _restoreProperNouns(cut.toLowerCase()) + '…';
  }

  // Batch generator, call after runSimulation to backfill all loaded profiles
  window.NPCHistSim = {
    // The bio, written out in the active language. Pass a profile's
    // `backstory`; a profile saved before the bio was keyed returns the
    // finished English string it was stored with.
    narrativeOf(backstory) { return BackstoryGenerator.narrativeOf(backstory); },

    generateBackstoryNow(name) {
      const p = SocietyRegistry.getProfile(name);
      if (!p) return;
      const events = window.HistoryManager
        ? window.HistoryManager.getEvents()
        : ($gameSystem?._historicalEvents || []);
      if (!events.length) return;
      // A backstory built against an unkeyed timeline froze its formative
      // events in one language. Once the world's history carries keys, drop it
      // so it regenerates: the picks are seeded by name, so the same events
      // come back, this time able to follow the language.
      if (p.backstory &&
          (p.backstory.formativeEvents || []).some(e => e && !e.descKey) &&
          events.some(e => e && e.descKey)) {
        p.backstory = null;
      }
      if (!p.backstory) p.backstory = BackstoryGenerator.generate(name, p);
    },

    // Throw the written bio away and write another one, against the profile as
    // it stands now. The Detailed character editor offers this while the player
    // is still deciding who the character is.
    rerollBackstory(name) {
      const p = SocietyRegistry.getProfile(name);
      if (!p) return null;
      const salt = '_' + Math.floor(Math.random() * 0x7fffffff);
      const bio = BackstoryGenerator.generate(name, p, salt);
      if (bio) p.backstory = bio;
      return p.backstory || null;
    },

    generateAllBackstories() {
      for (const name of Object.keys($gameSystem?._npcSociety ?? {}))
        this.generateBackstoryNow(name);
    },

    // Exposed so NPCEmpathize._buildHistoryHTML can call it if needed externally.
    buildBackstoryHTML(backstory) {
      if (!backstory) return '';
      return `<div class="npc-backstory-text">${escapeHtml(BackstoryGenerator.narrativeOf(backstory))}</div>`;
    },
  };


  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCSocietyRegistry._internal._late) bind();
})();
