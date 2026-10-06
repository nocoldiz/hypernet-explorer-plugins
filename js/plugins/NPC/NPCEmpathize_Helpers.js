/*:
 * @target MZ
 * @plugindesc NPC Empathize: markov map, i18n loader and the shared helpers
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @help
 * ============================================================================
 * NPCEmpathize_Helpers, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 1 (the personality to Markov database map), SECTION 2 (the
 * i18n loader) and SECTION 3 (the helpers the panel, the UI layer and the
 * map read; the UI layer gets them through NPCEmpathize._helpers).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathize.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  // Owned by modules that load after this one, bound once the family is in.
  let _addNpcOpinion, _personalityName, _personalitySocialMult, BUBBA_NAME, EM_NAME;
  window.NPCEmpathize._internal._late.push(() => ({
    _addNpcOpinion, _personalityName, _personalitySocialMult, BUBBA_NAME, EM_NAME,
  } = window.NPCEmpathize._internal));


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
    bribeIncorruptible:['name'],
    attackWarning:  ['name'],
    attackWanted:   ['name', 'bounty'],
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

  // ── Character sheets for the language model ─────────────────────────────
  // What the game knows for certain about one person, as one line of
  // "label: value" pairs. Handed to a .gguf model (MarkovTextGenerator.js) so
  // that an answer is written by THIS person to THIS member of the party,
  // rather than by a stranger to another stranger. The society profile answers
  // for most of it; an actor is consulted for the two things only a party
  // member has, their trade and the level they are actually carrying.
  //
  // Read by the Empathize panel and by the message-box dialogue path alike,
  // through window.NPCEmpathize.conversationContext().
  function _llmTraitNames(profile) {
    const all = window._NPCSocietyDataLoader?.traits || [];
    return (profile?.traitIds || []).map(id => {
      const raw = String(all.find(t => t && t.id === id)?.name || '');
      const seg = raw.split('.')[1] || raw;
      return seg.split(/[_-]/).filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }).filter(Boolean).slice(0, 6);
  }

  function _llmGenderLabel(value) {
    const T = _getT();
    return [T.genderMale, T.genderFemale, T.genderNonBinary, T.genderCocoon][value | 0] || '';
  }

  function _llmWealthLabel(tier) {
    const T = _getT();
    return [T.destitute, T.poor, T.workingClass, T.middleClass, T.wealthy][tier ?? 2] || '';
  }

  function _llmMoralLabel(score) {
    const T = _getT();
    const n = score ?? 0;
    return n < -60 ? T.evil : n < -20 ? T.dishonest : n < 20 ? T.neutral
         : n < 60 ? T.honest : T.virtuous;
  }

  function _llmCharacterSheet(profile, actor) {
    const T  = _getT();
    const L  = T.llm || {};
    const dl = window._NPCSocietyDataLoader;
    if (!profile && !actor) return '';
    const bits = [];
    const push = (label, value) => {
      const v = String(value ?? '').trim();
      if (label && v) bits.push(label + ': ' + v);
    };
    push(L.personalityLbl, _personalityName(profile));
    push(T.archetypeLbl, window.NPCCreature?.archetypeLabel?.(profile) || '');
    push(T.genderLbl, _llmGenderLabel(actor?.gender ? actor.gender() : profile?.gender));
    push(L.classLbl, actor?.currentClass?.()?.name || '');
    push(T.levelLbl, actor ? actor.level : profile?.level);
    push(T.wealthLbl, _llmWealthLabel(profile?.wealthTierBase));
    push(L.moralityLbl, _llmMoralLabel(profile?.moralityScore));
    const ideology = profile ? window.NPCShared?.ideologyFor?.(profile) : null;
    if (ideology) {
      push(T.ideologyLbl, window.DataService?.t?.(ideology.name)
        || String(ideology.name || '').split('.').pop().split('_').join(' '));
    }
    const faction = (profile?.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
    if (faction) {
      push(L.factionLbl, dl.getFactionName?.(faction)
        || String(faction.name || '').split('.')[1] || faction.name);
    }
    push(T.hometownLbl, profile?._homeGroupName);
    const job = (window.WorkSystem?.Jobs || []).find(j => j && j.id === profile?.currentJobId);
    if (job) push(L.jobLbl, window.DataService?.t?.(job.name) || job.name);
    const traits = _llmTraitNames(profile);
    if (traits.length) push(T.traits, traits.join(', '));
    // What the body is asking for right now, and only when it is asking loudly
    // enough to be heard in an answer.
    if ((profile?.hunger  ?? 100) < 40) push(T.hungerLabel,  L.needLow);
    if ((profile?.sleep   ?? 100) < 40) push(T.sleepLabel,   L.needLow);
    if ((profile?.hygiene ?? 100) < 40) push(T.hygieneLabel, L.needLow);
    // What the body is carrying, which is a thing people are asked about and a
    // thing that colours every answer given in one. Only an actor has an
    // anatomy and a course of treatment; a passer-by adds nothing here.
    push(L.bodyLbl, _llmSafe(() => _llmBodyLine(actor)));
    // Not from here, and each caste is not from here in its own way.
    const alienName = actor?.name?.() || profile?._npcName || '';
    push(L.alienLbl, _llmSafe(() => _llmAlienLine(alienName)));
    // Last, because it is the instruction the rest of the sheet is spoken in:
    // the register this temperament actually talks in, rather than its label.
    push(L.voiceLbl, _llmSafe(() => _llmVoiceLine(profile)));
    return bits.join('; ');
  }

  // Where the two of them stand with each other: the standing this actor has
  // earned with this person, and whether they are wanted.
  function _llmRelationLine(profile, actor, opinion) {
    const T = _getT();
    const L = T.llm || {};
    if (!profile || !actor) return '';
    const op = opinion ?? 0;
    const band = op <= -60 ? L.bandHostile : op <= -20 ? L.bandCold
               : op < 20 ? L.bandNeutral : op < 60 ? L.bandWarm : L.bandDevoted;
    const bits = [window.T('Empathize.llm.opinionOf', {
      speaker: actor.name(), band: band || '', score: op,
    })];
    const attraction = profile.attraction?.[actor.actorId()] ?? 0;
    if (attraction > 20) {
      bits.push(window.T('Empathize.llm.attractedTo',
        { speaker: actor.name(), score: attraction }));
    }
    return bits.join(' ');
  }

  // Context is worth a fact and never a failure: every builder below is called
  // through this, so the answer survives a system that is not loaded in this
  // save and a panel opened from somewhere with no map under it.
  function _llmSafe(build) {
    try { return build ? (build() || '') : ''; }
    catch (e) { return ''; }
  }

  // ── What a language model is told beyond the two sheets ────────────────
  // A sheet says what somebody IS. These say what they have lived through,
  // who else they know, who the party in front of them are and what is going
  // on in the world outside the two of them. All of it is built every time and
  // handed over whole: how much of it actually reaches the model is the
  // model's own business (window.MarkovLLM.promptProfile decides, by what was
  // picked in Options > Experimental), so nothing here asks how big it is.

  // The life the background simulation has dealt this person: where they were
  // born, where they have lived, the trade they hold, and whether there is a
  // price on their head. Its own prose is multi-line; it is flattened here
  // because a prompt is one paragraph.
  function _llmLifeStory(npcName, profile) {
    const bits = [];
    const life = window.NPCLifeSim;
    if (life && npcName) {
      let bio = '';
      try { bio = life.buildBiography(npcName) || ''; } catch (e) { bio = ''; }
      bio = String(bio).replace(/\s*\n+\s*/g, ' ').trim();
      if (bio && !/^\s*$/.test(bio)) bits.push(bio);
      let bounty = 0;
      try { bounty = life.getBounty ? (life.getBounty(npcName) || 0) : 0; } catch (e) { bounty = 0; }
      if (bounty > 0) bits.push(window.T('Empathize.llm.wanted', { bounty: bounty }));
    }
    // What is on their mind right now, as the life simulation last left it.
    const thought = (profile?.thoughts || []).slice(-1)[0];
    const thoughtText = thought && (thought.text || thought.message || thought);
    if (typeof thoughtText === 'string' && thoughtText.trim()) {
      bits.push(window.T('Empathize.llm.onMind', { thought: thoughtText.trim() }));
    }
    // The hours they work, which is why they are standing where they are.
    if (profile && profile.workStart != null && profile.workEnd != null && profile.currentJobId) {
      bits.push(window.T('Empathize.llm.shift', { from: profile.workStart, to: profile.workEnd }));
    }
    return bits.join(' ');
  }

  // The counter this person keeps, for a shopkeeper: where, which shift, who
  // else is on the rota, and the shelf with what is left of each row. It is
  // what lets a keeper asked "have you got any X" answer from their own stock
  // rather than from a guess. ShopShiftManager.workplaceOf does the reading.
  const _LLM_SHELF_CAP = 30;
  function _llmWorkplaceLine(npcName) {
    const SSM = window.NPCSim?.ShopShiftManager;
    const work = SSM?.workplaceOf?.(npcName);
    if (!work) return '';
    const h = SSM.shiftHours(work.shift);
    const bits = [window.T('Empathize.llm.workplace', {
      shop: work.shopName || window.T('Empathize.shopkeeperTitle'),
      map: work.mapName || '',
      from: String(h.from).padStart(2, '0'),
      to: String(h.to).padStart(2, '0'),
    })];
    if (work.colleagues.length) {
      bits.push(window.T('Empathize.llm.workColleagues', {
        names: work.colleagues.map(c => c.name).join(', '),
      }));
    }
    if (work.shelf.length) {
      const items = work.shelf.slice(0, _LLM_SHELF_CAP).map(row =>
        row.stock == null ? row.item.name
        : row.stock > 0 ? `${row.item.name} (${row.stock})`
        : `${row.item.name} (${window.T('Empathize.llm.workSoldOut')})`);
      bits.push(window.T('Empathize.llm.workShelf', { items: items.join(', ') }));
    }
    return bits.join(' ');
  }

  // The people this one already knows, and how they feel about them. Only the
  // strongest few: a model handed a directory answers with a directory.
  // The whole of what somebody has lived through, as every caller wants it:
  // the authored past first where there is one (Em and Bubba are written down
  // and are never read as rolled people), then either the life the background
  // simulation dealt them or, for one of the party's own, the adventures the
  // diary has them in.
  function _llmLifeFor(name, profile, own) {
    const bits = [_llmSafe(() => _llmSignatureLine(name))];
    if (own) bits.push(_llmPastAdventures(name, 4), _llmWhereabouts(name));
    else bits.push(_llmLifeStory(name, profile), _llmAcquaintances(profile));
    return bits.filter(Boolean).join(' ');
  }

  function _llmAcquaintances(profile) {
    const T = _getT();
    const L = T.llm || {};
    const entries = Object.entries(profile?.relationships || {})
      .filter(([name, rel]) => name && rel && typeof rel.opinion === 'number')
      .sort((a, b) => Math.abs(b[1].opinion) - Math.abs(a[1].opinion))
      .slice(0, 3);
    if (!entries.length) return '';
    const said = entries.map(([name, rel]) => {
      const op = rel.opinion;
      const band = op <= -60 ? L.bandHostile : op <= -20 ? L.bandCold
                 : op < 20 ? L.bandNeutral : op < 60 ? L.bandWarm : L.bandDevoted;
      return window.T('Empathize.llm.knows', { name: name, band: band || '' });
    });
    return said.join(' ');
  }

  // Who is travelling with the one doing the talking, and how the rest of them
  // stand with this person: an answer is given in front of the whole party.
  function _llmPartyLine(profile, speakerActor) {
    const members = ($gameParty?.members?.() || []).filter(Boolean);
    if (!members.length) return '';
    const T = _getT();
    const L = T.llm || {};
    const others = members.filter(a => !speakerActor || a.actorId() !== speakerActor.actorId());
    const bits = [];
    if (others.length) {
      bits.push(window.T('Empathize.llm.partyWith', {
        names: others.map(a => a.name()).join(', '),
        count: members.length,
      }));
    } else {
      bits.push(window.T('Empathize.llm.partyAlone'));
    }
    // The standing the rest of them have earned in their own right, when it is
    // strong enough to colour the room.
    const strong = others
      .map(a => [a, profile?.opinions?.[a.actorId()]])
      .filter(([, op]) => typeof op === 'number' && Math.abs(op) >= 40)
      .slice(0, 2);
    for (const [actor, op] of strong) {
      const band = op <= -60 ? L.bandHostile : op <= -20 ? L.bandCold
                 : op < 20 ? L.bandNeutral : op < 60 ? L.bandWarm : L.bandDevoted;
      bits.push(window.T('Empathize.llm.opinionOf', {
        speaker: actor.name(), band: band || '', score: op,
      }));
    }
    return bits.join(' ');
  }

  // The world the two of them are standing in: the place, the date and the
  // hour, the weather over it, and whether the people in front of them are
  // wanted by anybody.
  function _llmWorldLine() {
    const bits = [];
    const place = $gameMap?.displayName?.() || '';
    const biome = $gameMap?.mapId?.() != null && window.BiomeNames?.display
      ? (window.WorldMapTransfer?.currentBiome?.() || '')
      : '';
    if (place || biome) {
      bits.push(window.T('Empathize.llm.worldPlace', {
        place: place || biome,
        biome: biome && biome !== place ? window.BiomeNames.display(biome) : '',
      }).replace(/\s*\(\s*\)\s*/, ' ').trim());
    }
    const TDS = window.TimeDateSystem;
    if (TDS?.getCurrentDateObj) {
      try {
        const now = TDS.getCurrentDateObj();
        bits.push(window.T('Empathize.llm.worldWhen', {
          date: now.toDateString(),
          hour: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
        }));
      } catch (e) { /* no clock, no date */ }
    }
    const weather = window.$gameWeather;
    if (weather) {
      const name = weather.getWeatherName ? weather.getWeatherName() : '';
      const season = weather.getSeason ? weather.getSeason() : '';
      if (name || season) {
        bits.push(window.T('Empathize.llm.worldWeather', {
          weather: name || '', season: season || '',
          temperature: Math.round(weather.currentTemperature ?? 20),
        }));
      }
    }
    // A party with a price on it is spoken to differently, whoever is speaking.
    const heat = window.CrimeSystem?.getHeat?.() || 0;
    if (heat > 0) bits.push(window.T('Empathize.llm.worldWanted'));
    return bits.filter(Boolean).join(' ');
  }

  // ── The year everybody in here is living in ─────────────────────────────
  // A model trained on our own world answers out of it, which is how an NPC
  // ends up talking about a telephone nobody has invented yet. The one fact
  // that stops it is the date: whatever the clock says is the last year
  // anybody in this world has lived through, and nothing after it has
  // happened. Read straight off TimeDateSystem, because the calendar moves
  // (the cryo year alone carries the party from 2001 into 2013) and a fixed
  // year written into a prompt would be wrong the moment it did.
  function _llmWorldYear() {
    try {
      const now = window.TimeDateSystem?.getCurrentDateObj?.();
      const year = now ? now.getFullYear() : 0;
      return year > 1000 ? year : 0;
    } catch (e) { return 0; }
  }

  // ── What the body is carrying ───────────────────────────────────────────
  // The wounds that never healed, what was fitted in their place, and what
  // this person is ill with. All of it is the actor's: an NPC profile has no
  // anatomy, so a passer-by contributes nothing here and a companion (or a
  // leader read off their dossier) contributes the whole of it. It is the
  // difference between an answer written by a body and one written by a
  // sheet: somebody short an arm says so when they are asked to carry
  // something, and somebody running a fever says so whatever they are asked.
  function _llmBodyLine(actor) {
    if (!actor) return '';
    const T = _getT();
    const L = T.llm || {};
    const bits = [];
    const HC = window.HealthCore;
    const partName = key => {
      try { return HC?.archetypePartName?.(actor, key) || key; }
      catch (e) { return key; }
    };
    // Gone for good, then merely broken. A severed part is the louder fact and
    // is never crowded out by a bruise.
    const severed = Object.keys(actor._severedParts || {})
      .filter(key => actor._severedParts[key]).map(partName).slice(0, 4);
    if (severed.length) bits.push(window.T('Empathize.llm.bodyLost', { parts: severed.join(', ') }));
    let broken = [];
    try {
      const states = HC?.partStates?.(actor) || {};
      broken = Object.keys(states)
        .filter(key => !(actor._severedParts || {})[key] && HC?.isPartBroken?.(actor, key))
        .map(partName).slice(0, 4);
    } catch (e) { broken = []; }
    if (broken.length) bits.push(window.T('Empathize.llm.bodyBroken', { parts: broken.join(', ') }));
    // What was fitted where something used to be: a prosthetic is a thing
    // people ask about, and a thing its owner has an opinion on.
    const implants = Object.values(actor._prosthetics || {})
      .map(p => (p && (p.name || p.typeName)) || '').filter(Boolean).slice(0, 3);
    if (implants.length) bits.push(window.T('Empathize.llm.bodyAugments', { augments: implants.join(', ') }));
    // What they are ill with, what they live with, and what they came through.
    const DS = window.DiseaseSystem;
    const named = list => (list || []).map(entry => {
      try { return DS?.resolve?.(entry)?.name || ''; } catch (e) { return ''; }
    }).filter(Boolean);
    // An illness still inside its window period has not been named yet, so its
    // carrier cannot name it either: they know they feel wrong, nothing more.
    const carried = DS?.actorEntries?.(actor) || [];
    const known = carried.filter(e => e && e.diagnosed !== false);
    const sickNames = named(known).slice(0, 3);
    if (sickNames.length) bits.push(window.T('Empathize.llm.bodyIll', { diseases: sickNames.join(', ') }));
    else if (carried.length > known.length && L.bodyUnwell) bits.push(L.bodyUnwell);
    const conditions = named(DS?.actorConditions?.(actor)).slice(0, 3);
    if (conditions.length) bits.push(window.T('Empathize.llm.bodyCondition', { conditions: conditions.join(', ') }));
    const past = named(DS?.actorPast?.(actor)).slice(-2);
    if (past.length) bits.push(window.T('Empathize.llm.bodySurvived', { diseases: past.join(', ') }));
    return bits.filter(Boolean).join(' ');
  }

  // ── How this one talks ──────────────────────────────────────────────────
  // The sheet already says which of the twenty-five temperaments in
  // PersonalityData.json they were dealt, and which traits they carry. Those
  // are labels, and a label is not a voice: a model handed "Personality:
  // Grumpy" writes a polite person who has been told they are grumpy. These
  // are the register itself, one line per temperament, so the answer is
  // SPOKEN grumpily rather than described as it.
  function _llmVoiceLine(profile) {
    const persona = _personalityName(profile);
    if (!persona) return '';
    const key = 'Empathize.llm.voice.' + String(persona).toLowerCase();
    const line = window.T?.has?.(key) ? window.T(key) : '';
    return line && line !== key ? line : '';
  }

  // ── Who is not from here ────────────────────────────────────────────────
  // An alien sheet is not a costume: the castes want different things out of a
  // conversation, and a model told only that somebody is an alien writes the
  // same wise visitor every time. Each caste gets the way it actually behaves
  // (window.AlienOrigins owns which caste a sheet belongs to, here as
  // everywhere), so a Dargos of Titania winds the party up and lies for sport
  // while a Zeta Grey is delighted by them and understands nothing.
  function _llmAlienLine(npcName) {
    const AO = window.AlienOrigins;
    if (!AO || !npcName) return '';
    let identity = null;
    try {
      // The same sprite key the panel reads them by: the profile holds one
      // once the society generator has cast them, and the NPC template is
      // what answers for anybody it has not.
      const profile = _getProfile(npcName);
      const sprite = profile?.spriteKey
        || window.NPCSystem?.findTemplateSprite?.(npcName)?.characterName || '';
      identity = sprite ? AO.identify(sprite, npcName) : null;
    } catch (e) { identity = null; }
    if (!identity) return '';
    const manner = 'Empathize.llm.alien.' + identity.caste;
    const bits = [window.T('Empathize.llm.alienFrom', {
      caste: identity.casteName || identity.caste,
      origin: identity.originName || identity.origin,
    })];
    if (window.T?.has?.(manner)) bits.push(window.T(manner));
    return bits.filter(Boolean).join(' ');
  }

  // ── The two who are written down ────────────────────────────────────────
  // Em and Bubba are not generated people and never read as any: their pasts
  // are authored (the emBackstory bank and Bubba's dossier lore, both in
  // CharPresets.json), and a model handed a rolled sheet for either of them
  // writes a stranger wearing the name. Whoever is doing the asking, when one
  // of the two is the one being asked, the authored past and the authored
  // voice go in ahead of anything the simulation would otherwise say.
  function _llmSignatureLine(name) {
    const who = String(name || '').trim().toLowerCase();
    const isEm = who === EM_NAME.toLowerCase();
    const isBubba = who === BUBBA_NAME.toLowerCase();
    if (!isEm && !isBubba) return '';
    const bits = [];
    if (isEm) {
      const story = window.T?.list?.('CharPresets.emBackstory') || [];
      if (story.length) bits.push(story.join(' '));
    } else if (window.T?.has?.('CharPresets.lore.bubba')) {
      bits.push(window.T('CharPresets.lore.bubba'));
    }
    const voice = 'Empathize.llm.signature.' + (isEm ? 'em' : 'bubba');
    if (window.T?.has?.(voice)) bits.push(window.T(voice));
    return bits.filter(Boolean).join(' ');
  }

  // ── Being asked about somebody the world knows ──────────────────────────
  // Name a hyperpower's leader at a passer-by and, with nothing said about
  // them, the model answers out of OUR history: the wrong office, the wrong
  // decade, the wrong country. Everything this world actually says about the
  // people and powers in it is already written down (Leaders.json, the powers
  // the simulation has seated, the factions the party has standing with), so
  // the typed line is read for those names and whatever it named is handed
  // over as fact before the answer is written.
  //
  // Nothing is handed over that the year has not reached: a leader whose term
  // opens after the date on the clock has not happened yet, and a person in
  // the street has never heard of them.

  // Every name worth spotting, built once and kept: the powers, the book of
  // leaders and the factions. Names only; the fact behind one is read fresh
  // every time, because who governs what changes under it.
  let _llmTopicIndex = null;
  function _llmTopicNames() {
    if (_llmTopicIndex) return _llmTopicIndex;
    const index = [];
    const add = (name, kind, key) => {
      const text = String(name || '').trim();
      if (text.length < 4) return;
      index.push({ name: text, lower: text.toLowerCase(), kind: kind, key: key ?? text });
    };
    try {
      const powers = window.HistoryManager?.getHyperpowers?.() || {};
      for (const power of Object.keys(powers)) add(power, 'power', power);
    } catch (e) { /* no simulation in this save */ }
    try {
      const book = window.WorldGen?.Leaders || {};
      for (const id of Object.keys(book)) add(book[id]?.name, 'leader', book[id]?.name);
    } catch (e) { /* no book of leaders */ }
    try {
      const dl = window._NPCSocietyDataLoader;
      for (const faction of (dl?.factions || [])) {
        add(dl.getFactionName?.(faction) || String(faction?.name || '').split('.')[1],
            'faction', faction?.id);
      }
    } catch (e) { /* no factions loaded */ }
    _llmTopicIndex = index;
    return index;
  }

  // A surname on its own is how people are actually named in a sentence, so a
  // leader is matched on their last word too, but only where that word belongs
  // to exactly one of them: half the book would answer to "Pope" otherwise.
  let _llmSurnameIndex = null;
  function _llmTopicSurnames() {
    if (_llmSurnameIndex) return _llmSurnameIndex;
    const counts = new Map();
    const leaders = _llmTopicNames().filter(entry => entry.kind === 'leader');
    for (const entry of leaders) {
      const last = entry.lower.split(/\s+/).pop();
      if (!last || last.length < 5) continue;
      counts.set(last, (counts.get(last) || 0) + 1);
    }
    const unique = new Map();
    for (const entry of leaders) {
      const last = entry.lower.split(/\s+/).pop();
      if (counts.get(last) === 1) unique.set(last, entry);
    }
    _llmSurnameIndex = unique;
    return unique;
  }

  // What this world says about one leader, cut to what the year has reached.
  function _llmLeaderFact(name, year) {
    const record = window.LeaderPersona?.recordFor?.(name)
      || window.HistoryManager?.getLeaderRecord?.(name) || null;
    if (!record) return '';
    const years = Array.isArray(record.years) ? record.years.map(Number) : [];
    const from = years[0];
    const to = years[1];
    // Not yet: nobody has heard of somebody whose office opens after today.
    if (year && Number.isFinite(from) && from > year) return '';
    const ideology = record.ideology
      ? (window.DataService?.t?.(record.ideology)
        || String(record.ideology).split('.').pop().split('_').join(' '))
      : '';
    // Whether they are the one governing right now, which is the difference
    // between a name in a newspaper and a name in a history book.
    let seated = '';
    try {
      const current = window.HistoryManager?.getCurrentLeaders?.() || {};
      for (const power of Object.keys(current)) {
        if (current[power] && current[power].name === record.name) { seated = power; break; }
      }
    } catch (e) { seated = ''; }
    // A term that has not ended by this year is not written down as ended.
    const span = !Number.isFinite(from) ? ''
      : (!Number.isFinite(to) || (year && to > year)) ? String(from)
      : from + '-' + to;
    return _llmTidy(window.T('Empathize.llm.topicLeader', {
      name: record.name,
      country: record.country || '',
      ideology: ideology,
      years: span,
      seat: seated ? window.T('Empathize.llm.topicSeated', { power: seated }) : '',
    }));
  }

  // What this world says about one hyperpower: who governs it, where it sits
  // and how big it actually is in people (realFigures reads the bare indices
  // as a yearbook would print them).
  function _llmPowerFact(power) {
    const HM = window.HistoryManager;
    if (!HM) return '';
    const hist = (HM.getHyperpowers?.() || {})[power];
    if (!hist) return '';
    let leader = null;
    try { leader = HM.politicalLeaderOf?.(power) || null; } catch (e) { leader = null; }
    let figures = null;
    try { figures = HM.realFigures?.(hist) || null; } catch (e) { figures = null; }
    return _llmTidy(window.T('Empathize.llm.topicPower', {
      power: power,
      nation: hist.homeNation || hist.region || '',
      leader: leader?.name || '',
      people: figures?.population != null ? figures.population : '',
    }));
  }

  // What this world says about one faction: what it is, and where the party
  // stands with it, which is the half of the answer the NPC actually cares
  // about.
  function _llmFactionFact(factionId) {
    const dl = window._NPCSocietyDataLoader;
    const faction = (dl?.factions || []).find(f => f && f.id === factionId);
    if (!faction) return '';
    const name = dl.getFactionName?.(faction) || String(faction.name || '').split('.')[1] || '';
    const about = faction.description ? (window.DataService?.t?.(faction.description) || '') : '';
    let standing = '';
    try { standing = window.$gameFactions?.getReputationLevel?.(faction.id) || ''; } catch (e) { standing = ''; }
    return _llmTidy(window.T('Empathize.llm.topicFaction', {
      faction: name, about: about, standing: standing,
    }));
  }

  // A template filled from a record always has holes in it: a leader with no
  // country, a power whose figures did not come back. This closes the gaps the
  // missing halves leave behind so the fact reads as a sentence.
  function _llmTidy(text) {
    return String(text || '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.;])/g, '$1')
      .replace(/([,;])\s*([,.;])/g, '$2')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // The whole answer for one typed line: whatever it named, as this world has
  // it. At most three, because a sentence naming four things is a sentence
  // about none of them, and a model handed four dossiers answers with a
  // dossier.
  function _llmTopicsLine(phrase) {
    const said = String(phrase || '').toLowerCase();
    if (said.length < 4) return '';
    const year = _llmWorldYear();
    const hits = [];
    const seen = new Set();
    const take = entry => {
      const id = entry.kind + ':' + entry.key;
      if (seen.has(id) || hits.length >= 3) return;
      seen.add(id);
      hits.push(entry);
    };
    for (const entry of _llmTopicNames()) {
      if (hits.length >= 3) break;
      if (said.includes(entry.lower)) take(entry);
    }
    if (hits.length < 3) {
      for (const [surname, entry] of _llmTopicSurnames()) {
        if (hits.length >= 3) break;
        if (new RegExp('\\b' + surname + '\\b').test(said)) take(entry);
      }
    }
    const facts = hits.map(entry =>
        entry.kind === 'leader'  ? _llmSafe(() => _llmLeaderFact(entry.key, year))
      : entry.kind === 'power'   ? _llmSafe(() => _llmPowerFact(entry.key))
      : entry.kind === 'faction' ? _llmSafe(() => _llmFactionFact(entry.key))
      : '').filter(Boolean);
    return facts.join(' ');
  }

  // ── What a typed line costs, or earns ───────────────────────────────────
  // Every other way of talking to somebody in this panel moves their opinion,
  // because every one of them is an action with a band and a roll behind it.
  // Typing at them was the one that did not: the player could say anything at
  // all and walk away with the standing they arrived with. This reads the line
  // for what it is, on the word banks in the i18n file (so it reads the
  // language it was typed in), and hands back a tone and the standing it is
  // worth. Small on purpose: a conversation is a drip, not a favour.
  const CHAT_OPINION_STEP = { warm: 2, cold: -2, insult: -6, praise: 4 };
  const CHAT_OPINION_CAP = 12;   // per conversation, either way

  function _chatToneOf(phrase) {
    const said = ' ' + String(phrase || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ') + ' ';
    if (said.trim().length < 2) return null;
    const hit = bank => (window.T?.list?.('Empathize.llm.tone.' + bank) || [])
      .some(word => word && said.includes(' ' + String(word).toLowerCase() + ' '));
    // The loudest reading wins, and an insult is always the loudest: somebody
    // who was complimented and then sworn at was sworn at.
    if (hit('insult')) return 'insult';
    if (hit('cold'))   return 'cold';
    if (hit('praise')) return 'praise';
    if (hit('warm'))   return 'warm';
    return null;
  }

  // Move the standing this line earned, once, and say by how much. The
  // temperament in front of it decides how hard it lands, on the same social
  // modifiers every other action in the panel is scaled by, and the whole
  // conversation is capped so nobody is talked into devotion.
  function _chatOpinionShift(profile, actor, phrase, spent) {
    if (!profile || !actor) return 0;
    const tone = _chatToneOf(phrase);
    if (!tone) return 0;
    const base = CHAT_OPINION_STEP[tone] || 0;
    if (!base) return 0;
    const mult = _personalitySocialMult(profile, base > 0 ? 'positive' : 'negative');
    let delta = Math.round(base * mult) || (base > 0 ? 1 : -1);
    // The room left in this conversation, in the direction the line pushes.
    const used = spent || 0;
    const room = base > 0 ? CHAT_OPINION_CAP - Math.max(0, used)
                          : -CHAT_OPINION_CAP - Math.min(0, used);
    if (base > 0) delta = Math.min(delta, Math.max(0, room));
    else delta = Math.max(delta, Math.min(0, room));
    if (!delta) return 0;
    _addNpcOpinion(profile, actor.actorId(), delta);
    return delta;
  }

  // What the party's own people have been through, for the times one of them
  // is the one being talked to rather than a stranger in the street. The
  // messenger (Nudge, in MailSystem.js) is the caller that needs it: the
  // person on the other end of that window is a companion, travelling or
  // benched, and what they have to say depends on where they are and on what
  // they have lived through with the party.

  // The last few lines of the party diary that name this person, as the diary
  // itself would read them out. Their adventures, in other words, in the words
  // they were already written in.
  function _llmPastAdventures(name, limit) {
    const diary = window.Diary;
    if (!diary || typeof diary.entries !== 'function') return '';
    let entries = [];
    try { entries = diary.entries() || []; } catch (e) { return ''; }
    const wanted = String(name || '').trim();
    const lines = [];
    for (let i = entries.length - 1; i >= 0 && lines.length < (limit || 4); i--) {
      const entry = entries[i];
      let text = '';
      try { text = diary.describe(entry) || ''; } catch (e) { text = ''; }
      if (!text) continue;
      // Their own lines first; a party diary is written about all of them, so a
      // line that names nobody is still something the two of them shared.
      const mine = !wanted || entry.a === wanted || text.includes(wanted);
      if (!mine) continue;
      lines.push(entry.w ? window.T('Empathize.llm.adventureAt', { place: entry.w, line: text }) : text);
    }
    return lines.reverse().join(' ');
  }

  // Where somebody who is not standing here is: the lodging the player sent
  // them to, the map it is on and the biome around it.
  function _llmWhereabouts(name) {
    const LG = window.PartyLodging;
    if (!LG || !name) return '';
    let place = '';
    try { place = LG.placeName(LG.assignmentOf(name)) || ''; } catch (e) { place = ''; }
    if (!place) return '';
    let biome = '';
    try {
      const raw = window.WorldMapTransfer?.currentBiome?.() || '';
      biome = raw && window.BiomeNames?.display ? window.BiomeNames.display(raw) : raw;
    } catch (e) { biome = ''; }
    return biome
      ? window.T('Empathize.llm.stayingAtBiome', { place: place, biome: biome })
      : window.T('Empathize.llm.stayingAt', { place: place });
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
      // The signature banks are prose only: the db carries no skeleton for
      // them, so the language's own block is taken whole.
      if (over.signature) db.signature = over.signature;
    }
    // A language that has not written its signature banks yet speaks the
    // English ones rather than none.
    if (!db.signature && lang !== 'en') {
      const en = _readJson('js/i18n/en/conversations/SocialLines.json');
      if (en && en.signature) db.signature = en.signature;
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
  function _joinChance(opinion, actor, profile) {
    if (_forceHighJoinChance()) return JOIN_MAX;
    // opinion runs -100..+100, so 0.45/point lands exactly on JOIN_MIN/JOIN_MAX
    // at the extremes. Somebody who can make a case for themselves (Public
    // Speaking, specialization 218) gets a hearing the same goodwill would not
    // buy on its own, inside the same clamp. It is the member doing the talking
    // who has to make that case, which is whoever the switcher has focused.
    const persuasion = window.SpecializationXP
      ? (window.SpecializationXP.levelOf(actor, 'Public Speaking') - 1) * 4 : 0;
    // Somebody who looks the way they do is easier to follow (window.NPCEmpathize.Look).
    const look = window.NPCEmpathize?.Look ? window.NPCEmpathize.Look.odds('join', actor, profile) : 0;
    const raw = JOIN_BASE + (Number(opinion) || 0) * 0.45 + persuasion + look;
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
    // A pet ages but never dies of age or hunger (NPCLife_Animals).
    if (npcName) window.NPCLifeSim?.Animals?.noteAdopted?.(npcName, $gameParty?.leader?.()?.name?.() || '');
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
  // JOIN_LEVEL_MARGIN levels above the party (its median level) is willing to
  // be led by them, so Join is not offered at all for someone out of reach.
  const JOIN_LEVEL_MARGIN = 4;

  // "The party" is its MEDIAN level, not its strongest member: a level 40
  // veteran carrying two beginners does not make the beginners' outfit a fit
  // home for a level 40 recruit, and the median is the number every other
  // system measures the party by (BSE.Helpers.getMedianLevel). The rule covers
  // every way of signing somebody on, a party slot, a follower and an animal
  // taken as a pet alike: a creature far above the party's weight class does
  // not trail after it either.
  function _partyMedianLevel() {
    const levels = ($gameParty?.members?.() ?? [])
      .map(member => member?.level ?? 1)
      .sort((a, b) => a - b);
    if (!levels.length) return 1;
    const mid = Math.floor(levels.length / 2);
    return levels.length % 2
      ? levels[mid]
      : Math.floor((levels[mid - 1] + levels[mid]) / 2);
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
    return level <= _partyMedianLevel() + JOIN_LEVEL_MARGIN;
  }

  // The party median a recruit of this level asks for: the number the greyed
  // Join warning quotes when the party is still out of their weight class.
  function _joinLevelNeeded(npcLevel) {
    const level = Number(npcLevel);
    if (!Number.isFinite(level)) return 1;
    return Math.max(1, level - JOIN_LEVEL_MARGIN);
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

  // Taking a recruit off the map. The usual way is self-switch A, which swaps
  // the event onto a page with nothing on it. An authored event that never got
  // such a page (most hand-written NPCs have two ordinary pages and no blank
  // one) has nothing to fall through to, so it is erased instead: either way
  // the recruit stops standing there as a twin of the party member. This is
  // why recruiting is NOT gated on the event having a self-switch A page any
  // more, that gate silently hid Join and Follow on people who were perfectly
  // recruitable.
  function _vanishRecruitedEvent(eventId) {
    if (eventId == null || !$gameMap) return;
    const name = _getNPCName(eventId);
    $gameSelfSwitches.setValue([$gameMap.mapId(), eventId, 'A'], true);
    const ev = $gameMap.event(eventId);
    ev?.refresh();
    if (!_hasSelfSwitchAPage(eventId)) ev?.erase();
    // The world loses this citizen, not just this savegame: recorded in the
    // world folder so no other playthrough can recruit them again
    // (NPCSystem.js, GoneRegistry).
    window.NPCGone?.record($gameMap.mapId(), eventId, name, 'joined');
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
    // A sealed suit is what is being looked at, not the face inside it: on an
    // airless world the visor answers for everybody wearing one, and the EVA
    // authority (GalaxySim_Core) is the only thing that says who is.
    const suited = window.GalaxySim?.EVA?.bustForActor?.(actor);
    if (suited) return _bustUrl(suited);
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
    // Somebody met out on an airless surface is behind a visor, and the visor
    // outranks every face below: the sheet they are standing in is handed to
    // the EVA authority (GalaxySim_Core), which answers for anybody the ground
    // makes wear one and for nobody who breathes out there on their own.
    const EVA = window.GalaxySim?.EVA;
    if (EVA?.bustForSheet) {
      const sheet = event?.event()?.characterName
        ?? event?.event()?.pages?.[0]?.image?.characterName
        ?? _getProfile(npcName)?.spriteKey ?? null;
      const suited = sheet ? EVA.bustForSheet(sheet) : null;
      if (suited) return _bustUrl(suited);
    }
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
    // Nothing above having spoken, the face is the one that belongs to the
    // SHEET this person is standing in, read out of NPCs.json. That sheet is
    // what the player is looking at, so it outranks anything the society sim
    // has cached: a profile is keyed by event name alone, and several authored
    // events share a name while wearing different sheets, so the cached bust
    // is whichever same-named event was pinned last. Only an explicitly
    // written bust (the comment and `bust:` lines handled above) overrides the
    // sprite; a cached one never does.
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
      // A sheet in no catalogue still names its face when a portrait carries
      // the sheet's own name (Originals/!$Enchantress).
      if (!sa[charName.split('.')[0]]) {
        const named = window.BustPath?.forSheet?.(charName);
        if (named) return _bustUrl(named);
      }
    }
    // A creature or an animal wears a sheet out of the NPCs.json wardrobe, and
    // that entry names the faces it comes with. Those are ITS busts and are
    // read straight off the profile the wardrobe wrote, rather than hunted for
    // through the sprite-to-bust table, which knows only about people.
    const creatureBust = _creatureBustPath(npcName);
    if (creatureBust) return creatureBust;
    // Last of all the society sim's own record, for somebody with no sheet to
    // read at all: no event on this map and no template in the pools.
    if (window.NPCSim?.getBustForNPC) {
      const b = window.NPCSim.getBustForNPC(npcName);
      if (b && b !== '7') return _bustUrl(b);
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

  // ---------------------------------------------------------------------------
  // Look stats and the signature banks
  // ---------------------------------------------------------------------------
  // Arcane, Substance, Stealth and Intimidation, 0 to 100%, read off what a
  // character wears (window.LookStats, ItemSystemEquipment). A party member's
  // come off their actor, boosts included; an NPC's off their profile, which
  // NPCSociety_Gear keeps in step with their kit.
  const LOOK_KEYS = ['arcane', 'substance', 'stealth', 'intimidation'];  // i18n-ignore  stat ids
  function _lookStatsOfActor(actor) {
    if (window.LookStats && actor) return window.LookStats.ofActor(actor);
    return { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
  }
  function _lookStatsOfProfile(profile) {
    const out = {};
    for (const k of LOOK_KEYS) out[k] = Math.max(0, Math.min(100, Number(profile && profile[k]) || 0));
    return out;
  }
  // The stat a character is an icon of (exactly 100%), or null. Somebody who
  // is an icon of two looks speaks in either, at random.
  function _lookIcon(stats) {
    const icons = LOOK_KEYS.filter(k => stats && Number(stats[k]) >= 100);
    return icons.length ? icons[Math.floor(Math.random() * icons.length)] : null;
  }

  // What the signature banks say about one move. A speaker who is an icon says
  // it in their own voice (`speaker`); the answer comes from the listener's own
  // voice when THEY are an icon (`listener`), otherwise from an ordinary person
  // reacting to an icon's look (`reaction`). Either half is null when no bank
  // applies, and the caller keeps its own line.
  //   kind:    'interaction' | 'romance' | 'propose' | 'performance' | 'joke'
  //   outcome: good/bad, accept/reject, or landGood/landGroan/flop for a joke
  function _signatureLines(kind, id, outcome, actor, profile) {
    const sig = _socialLines().signature;
    const res = { player: null, npc: null, speakerIcon: null, listenerIcon: null };
    if (!sig) return res;
    const NC = window.NPCCreature;
    const nonSentientNpc = !!(NC && profile && NC.isNonSentientProfile && NC.isNonSentientProfile(profile));
    const sp = _lookIcon(_lookStatsOfActor(actor));
    const ls = nonSentientNpc ? null : _lookIcon(_lookStatsOfProfile(profile));
    res.speakerIcon = sp;
    res.listenerIcon = ls;
    const said = (bank) => {
      if (!bank) return null;
      if (kind === 'interaction') return bank.interactions && bank.interactions[id];
      if (kind === 'romance') return bank.romance && bank.romance[id];
      if (kind === 'propose') return bank.romance && bank.romance.propose;
      if (kind === 'performance') return bank.performances && bank.performances[id];
      if (kind === 'joke') return bank.jokes;
      return null;
    };
    const answer = (bank) => {
      if (!bank) return null;
      let node = null;
      if (kind === 'interaction') node = bank.interactions && bank.interactions[id];
      else if (kind === 'romance') node = bank.romance && bank.romance[id];
      else if (kind === 'propose') node = bank.romance && bank.romance.propose;
      else if (kind === 'performance') node = bank.performances && bank.performances[id];
      else if (kind === 'joke') node = bank.jokes;
      return node && node[outcome];
    };
    if (sp) {
      const pool = said(sig[sp] && sig[sp].speaker);
      if (Array.isArray(pool)) res.player = _rand(pool) || null;
    }
    const replyBank = ls ? (sig[ls] && sig[ls].listener) : (sp ? (sig[sp] && sig[sp].reaction) : null);
    const reply = answer(replyBank);
    if (Array.isArray(reply)) res.npc = _rand(reply) || null;
    return res;
  }

  Object.assign(window.NPCEmpathize._internal, {
    _lookIcon, _lookStatsOfActor, _lookStatsOfProfile, _signatureLines,
    _animalJoinChance, _buildBattleFace, _bustNameFromEvent, _bustUrl, _chatOpinionShift,
    _countRecentInteractions, _diseaseVialId, _diseaseVialItems, _eventCommentLines,
    _extractClassId, _extractContacts, _findEventByName, _forceHighJoinChance, _genJoke,
    _getNPCName, _getProfile, _getT, _hasJoinPartyCommand, _hasSelfSwitchAPage, _infectChance,
    _isStoryNpc, _joinChance, _joinLevelNeeded, _joinLevelOk, _lastInteractionDay, _llmCharacterSheet, _llmLifeFor, _llmWorkplaceLine,
    _llmPartyLine, _llmRelationLine, _llmSafe, _llmTopicsLine, _llmWhereabouts, _llmWorldLine,
    _partyMedianLevel, _presetFromEvent, _rand, _recruitAnimalAsMember, _recruitAnimalAsPet,
    _recruitNpcAsFollower, _resolveBustForActor, _resolveBustPath, _resolveMarkovDb, _socialById,
    _socialLines, _travellingPartyCount, _vanishRecruitedEvent, _wisMod, SPOKEN_LOG_MAX,
    STORY_PROTECTED_ACTIONS, vary,
  });
})();
