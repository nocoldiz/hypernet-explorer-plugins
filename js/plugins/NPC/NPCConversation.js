/*:
 * @target MZ
 * @plugindesc NPCConversation v2.4.0, NPC↔NPC dialogues, ambient chatter, thoughts & thought bubbles
 * @author Omni-Lex
 * @help NPCConversation.js
 *
 * ============================================================================
 * NPCConversation v2.3.0
 * ============================================================================
 * Ports the two-person dialogue + situational thought databases of the old
 * ThoughtsMenu plugin (the since-removed ThoughtsOLD.js) into the autonomous
 * NPC society, and owns both the words AND their on-map display:
 *
 * 1. FACE-TO-FACE CONVERSATIONS
 *    Two on-map NPCs that wander close to each other can stop, face each
 *    other, and play a short scripted exchange line-by-line through the
 *    floating thought bubbles (Section 7 listens to "npc:thought").
 *    The script tone (positive / negative / neutral / debate) is driven by
 *    their mutual relationship opinion and their personalities
 *    (js/db/Health/PersonalityData.json, per-personality tone biases and
 *    debate affinities, no shared archetypes).
 *    Finishing a conversation adjusts both relationships exactly like the
 *    old ThoughtsMenu social events did, and records a "met X" social entry.
 *
 * 2. AMBIENT CHATTER
 *    NPCs sharing a room (within a few tiles) while busy with other
 *    activities (working, interacting, lounging...) occasionally trade a
 *    quick two-line exchange without interrupting what they're doing.
 *
 * 3. THOUGHT PROVIDER (single home for all NPC dialogue text)
 *    NPCSimulationCore's ThoughtGenerator delegates here: need-based thought
 *    templates (moved out of NPCSimulationCore), the weather / time-of-day
 *    situational thoughts (four unique lines for each of the 25 personalities
 *    in every situation), capability-reaction lines, familiar-with-player musings, and
 *    personalityCoreThoughts, each personality's own inner-voice pool
 *    (hardcoded from PersonalityData.json) that can fire at random.
 *
 * 4. CONVERSATION LOG (world folder)
 *    The last 20 dialogues of every NPC are cached in a single JSON file in
 *    the active world folder: save/worlds/<World>/conversations.json
 *    (via the WorldManager $gameSystem._npcConversations accessor).
 *    NPCEmpathizeUI shows them in the Chat tab.
 *
 * 5. THOUGHT BUBBLES (formerly the separate NPCThoughtBubble.js plugin)
 *    Whenever "npc:thought" fires, a small parchment speech-bubble fades in
 *    above that NPC's sprite, lingers briefly, then fades back out. Visually
 *    it reuses the floating-HTML-overlay technique of MousePan's
 *    Window_EventHover tooltip (a positioned <div> kept in sync with the
 *    map's tile-to-screen projection every frame). DOM-guarded so the plugin
 *    still loads headless under the Node test harness.
 *
 * 6. PERSONALITY VOICES (v2.4.0)
 *    Three layers keep all 25 personalities verbally distinct everywhere:
 *    a) pools written per personality (weather/time situational thoughts,
 *       personality core thoughts), four unique lines per personality per
 *       situation, picked at random;
 *    b) every line drawn from a SHARED pool (conversation scripts, debates,
 *       ambient chatter, need/world/politics/capability thoughts) passes
 *       through the speaker's PERSONALITY_VOICE, openers/closers unique to
 *       that personality, so two NPCs delivering the same base line speak
 *       personality-flavored variations of it;
 *    c) shared lines are written as "{a|b|c}" templates and every alternative
 *       is weighed against the speaker's own lexicon (the favors/avoids word
 *       lists in the voice bank) before one is picked, so a personality does
 *       not merely decorate a line, it chooses the words inside it. Nothing
 *       is ever impossible: an averse option keeps a quarter of the weight,
 *       so a Grumpy NPC can still have a lovely morning, just rarely.
 *
 * 7. LIFE TALK AND CREED VOICE
 *    What NPCs think, say to each other and tell the party follows their
 *    lives: family (partners, children, pregnancy, breakups, relatives),
 *    work and leave, trips and emigration, wars, the Goblin Horde, fights,
 *    games and the election in the country the player stands in, whose
 *    political talk grows louder as the vote comes closer (II.8). Every topic
 *    has a condition and a weight over a per-hour context, so it only comes up
 *    when it is true. The speaker's creed, folded into one of a dozen ideology
 *    families (or a special bank for a few creeds), frames lines on top of the
 *    personality voice; Em and Bubba are never framed (II.9).
 *
 * FILE LAYOUT, the file is split in two clearly-banner'd parts:
 *   PART I , DIALOGUE DATA: every editable word (see its table of contents)
 *   PART II, ENGINE: logic only; you should rarely need to touch it
 *
 * Modules: this file keeps II.1 (voice), II.2 (log), II.3 (conversation
 * manager), II.4 (providers), the II.7 scene hooks and the family namespace
 * (NPCConversation._internal). PART I lives in NPCConversation_Banks, II.8
 * and II.9 in _LifeTalk, II.5, II.6 and II.10 (spec talk) in _Thoughts, and the public
 * window.NPCConversation table in _Api (last), listed in js/plugins.js right
 * after this file in that order.
 *
 * Load Order:
 *   NPCSystem → NPCSimulationCore → NPCConversation
 *   (needs window.NPCSim and $gameSystem.getActiveNPCControllers at runtime;
 *    NPCSimulationCore reads window.NPCConversation.ThoughtProvider lazily,
 *    so the circular load order is safe)
 */

(() => {
  'use strict';

  // ============================================================================
  // ============================================================================
  //  PART II, ENGINE (logic only; every editable word lives in PART I above)
  // ============================================================================
  // ============================================================================

  // ---------------------------------------------------------------------------
  // II.1 PERSONALITY LOOKUP & VOICE APPLICATION
  // ---------------------------------------------------------------------------

  // Odds that a shared line actually gets an opener/closer; tuned lower for
  // two-person dialogue so scripts don't drown in interjections.
  const VOICE_CHANCE_THOUGHT  = 0.55;
  const VOICE_CHANCE_DIALOGUE = 0.40;

  function _personalityOf(profile) {
    const list = window._NPCSocietyDataLoader?.personalities
              || window.Health?.PersonalityData || null;
    if (!list || profile?.personalityIndex == null) return null;
    return list[profile.personalityIndex] ?? null;
  }

  function _personalityNameOf(profile) {
    return _personalityOf(profile)?.name ?? null;
  }

  // Every personality's lexical pull: the words it reaches for and the words
  // it never would. Read off the voice bank (I.2) so the tilt of a personality
  // is edited with the rest of its words, in the i18n file, not in here.
  function _lexiconOf(persName) {
    if (!persName) return null;
    if (_lexiconCache.has(persName)) return _lexiconCache.get(persName);
    const voice = PERSONALITY_VOICES()[persName];
    const compile = (list) => (Array.isArray(list) ? list : [])
      .map(w => String(w).toLowerCase().trim()).filter(Boolean);
    const lex = voice ? { favors: compile(voice.favors), avoids: compile(voice.avoids) } : null;
    _lexiconCache.set(persName, lex);
    return lex;
  }
  const _lexiconCache = new Map();

  // How strongly one alternative suits a personality. Favored words pull the
  // pick toward the option, avoided ones push it away; an option that carries
  // neither keeps a neutral weight, so a template with no charged wording is
  // still picked uniformly.
  function _optionWeight(option, lex) {
    if (!lex) return 1;
    const hay = ' ' + String(option).toLowerCase().replace(/[^a-z0-9À-ɏ']+/g, ' ') + ' ';
    let score = 0;
    for (const w of lex.favors) if (hay.indexOf(' ' + w) >= 0) score += 1;
    for (const w of lex.avoids) if (hay.indexOf(' ' + w) >= 0) score -= 1;
    // 4x more likely than neutral at full favor, 4x less at full aversion,
    // and never impossible: a Grumpy NPC can still have a bright day.
    return Math.min(4, Math.max(0.25, Math.pow(2, score)));
  }

  function _pickWeighted(options, lex) {
    if (!lex || options.length < 2) return _pickFrom(options);
    const weights = options.map(o => _optionWeight(o, lex));
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  // Resolves "{a|b|c}" groups innermost-first, so groups can nest.
  // With a speaker named, every alternative is weighed against that
  // personality's lexicon (above), so the SAME template phrases itself
  // differently in a Grumpy mouth than in a Sanguine one.
  function vary(text, persName) {
    if (typeof text !== "string" || text.indexOf("{") < 0) return text;
    const lex = _lexiconOf(persName);
    let out = text;
    let guard = 0;
    while (guard++ < 64) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g,
        (m, body) => _pickWeighted(body.split("|"), lex));
      if (next === out) break;
      out = next;
    }
    return out;
  }

  // Flavor a shared line with the speaker's voice (I.2): sometimes prepend an
  // opener or append a closer. Pure-emote lines (*does something*) and NPCs
  // without a resolvable personality pass through untouched.
  function applyVoice(text, persName, chance = VOICE_CHANCE_THOUGHT) {
    let line = vary(text, persName);
    const voice = persName ? PERSONALITY_VOICES()[persName] : null;
    if (!voice || !line || String(line).startsWith('*')) return line;
    if (Math.random() >= chance) return line;
    return Math.random() < 0.5
      ? `${vary(_pickFrom(voice.openers), persName)} ${line}`
      : `${line} ${vary(_pickFrom(voice.closers), persName)}`;
  }

  // ---------------------------------------------------------------------------
  // II.1b SPECIES VOICES
  // ---------------------------------------------------------------------------
  // Some peoples talk their own way whatever their personality: the Naguka,
  // the goblins who came up the Kola shaft, shout in a patois like children;
  // their Verden cousins speak a careful, faintly antique MarkovSpeak. Which
  // voice a body has is data: an archetype names it in Archetypes.json
  // (`voice`), and NPCCreature.speciesVoiceOf answers it for an NPC profile or
  // a party actor alike. A body spliced from two archetypes speaks with its
  // PRIMARY half's voice, except that an archetype marked `voiceWins` (the
  // Naguka) is heard over any other half.
  //
  // Each voice has a full bank of its own, js/i18n/<lang>/conversations/
  // Conv<Voice>.json (ConvNaguka, ConvVerden, ...):
  //
  //   speech   the patois rules (words, whole lines, suffixes) run over any
  //            line the speaker is handed; a voice with none keeps the words
  //   voice    openers and closers put on a line now and then
  //   thought  their own thoughts by situation (NagukaThoughts, II.5)
  //   script   two-person scripts by tone, the speaker of the voice as 0
  //
  // and PartyBanter.json holds a pool keyed by the voice id in every
  // personality-keyed section, for a party member of that people.
  //
  // A voice is used one of two ways (Archetypes.json `voiceMode`, read by
  // NPCCreature.speciesVoiceModeOf): "own", where their bank takes over from
  // the ordinary lines (the Naguka, the Orcs, the Verden, the aliens), or
  // "blend", where they keep the ordinary lines and their people's are mixed
  // in among them, less often (the Elves, the Dwarves, the Gnomes).
  //
  // render() never voices a line twice: one with a patois is skipped once it
  // has no lower-case letter left in it, and an opener or closer is only ever
  // added to a line on its first pass (the line is remembered for a while).
  const SPECIES_VOICE_CHANCE = { own: 0.35, blend: 0.2 };
  const SPECIES_SCRIPT_CHANCE = { own: 0.6, blend: 0.25 };
  const SPECIES_SPOKEN_MEMORY = 96;
  // {token}, %1, \V[63], \G, <br>, &amp;: never re-cased, never reworded.
  const SPEECH_TOKEN_RE = /\{[^{}]*\}|%\d+|\\[A-Za-z]+(?:\[[^\]]*\])?|\\[.|!><^$]|<[^>]+>|&[a-zA-Z]+;/g;
  const SPEECH_WORD_RE = /[\p{L}']+/gu;
  const SPEECH_LOWER_RE = /\p{Ll}/u;
  const SPEECH_MASK_RE = /(\d+)/g;

  const SpeciesVoice = {
    _rules: new Map(),
    _rulesLang: null,
    _spoken: [],

    // "ConvNaguka" for "naguka".
    bankKey(id) {
      const s = String(id || '');
      return 'Conv' + s.charAt(0).toUpperCase() + s.slice(1);
    },

    bank(id) {
      if (!id || !bank) return {};
      return bank(this.bankKey(id)) || {};
    },

    // "own" or "blend" (see above).
    mode(id) {
      const NC = window.NPCCreature;
      return (NC && NC.speciesVoiceModeOf && NC.speciesVoiceModeOf(id)) || 'own';
    },

    // The voice of whoever is speaking (a society profile, a party actor or a
    // name), or null for somebody with none. A party member's society profile
    // does not carry their body, the actor does, so a profile is asked about
    // the party member of that name as well.
    voiceOf(source) {
      const NC = window.NPCCreature;
      if (!source || !NC || typeof NC.speciesVoiceOf !== 'function') return null;
      if (typeof source === 'string') {
        return NC.speciesVoiceOf(_getProfile(source)) || NC.speciesVoiceOf(this._partyActorNamed(source));
      }
      if (typeof source.actorId === 'function') return NC.speciesVoiceOf(source);
      const member = source._eventName ? this._partyActorNamed(source._eventName) : null;
      return (member && NC.speciesVoiceOf(member)) || NC.speciesVoiceOf(source);
    },

    _partyActorNamed(name) {
      if (!name || typeof $gameParty === 'undefined' || !$gameParty?.members) return null;
      try {
        return $gameParty.members().find((a) => a && a.name && a.name() === name) || null;
      } catch (_) {
        return null;
      }
    },

    // A voice's patois table in the language being played, compiled once per
    // language switch. Null for a voice that keeps the words as they are.
    rules(id) {
      const lang = (typeof T !== 'undefined' && T.language) ? T.language() : 'en';
      if (this._rulesLang !== lang) { this._rules.clear(); this._rulesLang = lang; }
      if (this._rules.has(id)) return this._rules.get(id);
      const raw = this.bank(id).speech;
      let compiled = null;
      if (raw && typeof raw === 'object') {
        const upperKeys = (obj) => {
          const out = Object.create(null);
          for (const k of Object.keys(obj || {})) out[String(k).toUpperCase()] = String(obj[k]);
          return out;
        };
        compiled = {
          upper: raw.upper !== false,
          words: upperKeys(raw.words),
          whole: upperKeys(raw.whole),
          suffixes: (Array.isArray(raw.suffixes) ? raw.suffixes : [])
            .filter((pair) => Array.isArray(pair) && pair.length === 2)
            .map(([from, to]) => [String(from).toUpperCase(), String(to)]),
          minStem: Number(raw.minStem) || 3,
        };
      }
      this._rules.set(id, compiled);
      return compiled;
    },

    // A voice's patois applied to one line. Placeholders are masked first and
    // put back byte-identical afterwards. A line already in an all-capitals
    // patois (no lower-case letter left) is handed back as it came.
    transform(text, id) {
      const rules = this.rules(id);
      if (!rules || typeof text !== 'string') return text;
      if (rules.upper && !SPEECH_LOWER_RE.test(text)) return text;
      const lead = (text.match(/^\s+/) || [''])[0];
      const tail = (text.match(/\s+$/) || [''])[0];
      const core = text.slice(lead.length, text.length - tail.length);
      if (!core) return text;
      const bare = core.toUpperCase().replace(/[.!?]+$/, '');
      if (rules.whole[bare] !== undefined) return lead + rules.whole[bare] + tail;

      const store = [];
      const masked = core.replace(SPEECH_TOKEN_RE, (m) => {
        store.push(m);
        return '' + (store.length - 1) + '';
      });
      const swap = (word) => {
        const key = word.toUpperCase();
        if (rules.words[key] !== undefined) return rules.words[key];
        for (const [from, to] of rules.suffixes) {
          if (key.length - from.length >= rules.minStem && key.endsWith(from)) {
            return key.slice(0, key.length - from.length) + to;
          }
        }
        return rules.upper ? key : word;
      };
      let out = (rules.upper ? masked.toUpperCase() : masked).replace(SPEECH_WORD_RE, swap);
      out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?;:])/g, '$1').replace(/^[ ,;:]+/, '').trim();
      out = out.replace(SPEECH_MASK_RE, (_, i) => store[Number(i)]);
      return lead + (out || core) + tail;
    },

    _remember(line) {
      this._spoken.push(line);
      if (this._spoken.length > SPECIES_SPOKEN_MEMORY) this._spoken.shift();
      return line;
    },

    // One line as `speaker` would say it: unchanged for anybody with no
    // species voice, in their people's words (and now and then with one of
    // their openers or closers) for anybody with one.
    render(text, speaker) {
      if (text === null || text === undefined || text === '') return text;
      const line = String(text);
      if (this._spoken.includes(line)) return text;
      const id = this.voiceOf(speaker);
      if (!id) return text;
      let out = this.transform(line, id);
      if (out.startsWith('*')) return this._remember(out);
      const voice = this.bank(id).voice;
      if (out === line && this.rules(id)?.upper) return this._remember(out);
      if (voice && Math.random() < (SPECIES_VOICE_CHANCE[this.mode(id)] ?? SPECIES_VOICE_CHANCE.own)) {
        const opener = Math.random() < 0.5;
        const list = opener ? voice.openers : voice.closers;
        if (Array.isArray(list) && list.length) {
          const extra = vary(_pickFrom(list), null);
          out = opener ? `${extra} ${out}` : `${out} ${extra}`;
        }
      }
      return this._remember(out);
    },

    // A two-person script out of a voice's bank. The bank writes the speaker
    // of that voice as 0; when they are the OTHER participant, the turns and
    // the {a}/{b} names are swapped so the right mouth speaks each line. Null
    // when the bank has none of this kind.
    script(id, kind, ownIsSecond) {
      const pool = this.bank(id).script?.[kind];
      if (!Array.isArray(pool) || !pool.length) return null;
      const entry = _pickFrom(pool);
      const lines = Array.isArray(entry) ? entry : entry?.lines;
      if (!Array.isArray(lines)) return null;
      const swap = (t) => String(t).replace(/\{([ab])\}/g, (_, k) => (k === 'a' ? '{b}' : '{a}'));
      const turned = ownIsSecond ? lines.map(([who, t]) => [1 - who, swap(t)]) : lines;
      return Array.isArray(entry) ? { lines: turned } : { lines: turned, agreement: !!entry.agreement };
    },

    // Whether this exchange is told out of a species bank: one of the two has
    // a voice and the coin falls that way (less often for a blend voice).
    // Answers null, or { id, second } with `second` true when it is the
    // second participant's voice.
    scriptSide(profA, profB, aName, bName) {
      const a = this.voiceOf(profA || aName);
      const b = this.voiceOf(profB || bName);
      if (!a && !b) return null;
      const side = (a && b) ? (Math.random() < 0.5 ? { id: a, second: false } : { id: b, second: true })
        : a ? { id: a, second: false } : { id: b, second: true };
      const chance = SPECIES_SCRIPT_CHANCE[this.mode(side.id)] ?? SPECIES_SCRIPT_CHANCE.own;
      return Math.random() < chance ? side : null;
    },

    // A whole script of this kind out of the bank of one of the pair, or null.
    scriptFor(kind, profA, profB, aName, bName) {
      const side = this.scriptSide(profA, profB, aName, bName);
      return side ? this.script(side.id, kind, side.second) : null;
    },
  };

  // ---------------------------------------------------------------------------
  // II.2 CONVERSATION LOG (persisted to <world>/conversations.json)
  // ---------------------------------------------------------------------------
  // $gameSystem._npcConversations is a WorldManager prototype accessor backed
  // by the "conversations" world data file, so entries written here land in
  // save/worlds/<World>/conversations.json on the next save (see WorldManager
  // SYSTEM_FIELD_MAP / flush). Shape: { [npcName]: [{ min, with, kind, lines }] }

  const ConversationLog = {
    MAX_PER_NPC: 20,

    _store() {
      if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
      if (!$gameSystem._npcConversations) $gameSystem._npcConversations = {};
      return $gameSystem._npcConversations;
    },

    record(aName, bName, kind, lines) {
      const store = this._store();
      if (!store || !lines?.length) return;
      const min = $gameVariables?.value(114) ?? 0;
      const push = (self, other) => {
        const arr = (store[self] = store[self] || []);
        arr.push({ min, with: other, kind, lines });
        if (arr.length > this.MAX_PER_NPC) arr.splice(0, arr.length - this.MAX_PER_NPC);
      };
      push(aName, bName);
      push(bName, aName);
    },

    getFor(name) {
      return this._store()?.[name] ?? [];
    },
  };

  // ---------------------------------------------------------------------------
  // II.3 CONVERSATION MANAGER
  // ---------------------------------------------------------------------------

  const LINE_MS              = 3300;   // real-time ms between dialogue lines
  const SCAN_MS              = 4000;   // real-time ms between pair scans
  const SCAN_STEPS           = 5;      // scans in a round, one per tick (see _runScanStep)
  const MAX_ACTIVE           = 4;      // concurrent face-to-face conversations
  const START_DIST           = 2;      // tiles: close enough to stop and chat
  const AMBIENT_DIST         = 6;      // tiles: "same room" chatter range
  const PLAYER_RANGE         = 30;     // only converse near the player (visible flavour)
  // A town where everyone is always mid-sentence reads as noise rather than as
  // life, so a chat is a thing that happens now and then: the odds per scan are
  // low and the same two people leave a long gap before starting again.
  const PAIR_COOLDOWN_MIN    = 120;    // game minutes between same-pair chats
  const AMBIENT_COOLDOWN_MIN = 60;
  const START_CHANCE         = 0.07;   // per eligible pair per scan
  // Seeking somebody out (ConversationManager.seek): at most this many set off
  // per scan window, so a square full of lonely people does not all converge
  // at once, and friends passing close greet each other now and then.
  const SEEKERS_PER_SCAN     = 2;
  const SEEK_RANGE           = 40;     // tiles: how far away a seeker will walk to somebody
  const FRIEND_OPINION       = 40;     // a friend, for seeking out and greeting
  const LONELY_SOCIAL        = 40;     // a social meter under this is lonely
  const GREET_DIST           = 2;
  const GREET_COOLDOWN_MIN   = 90;
  const GREET_CHANCE         = 0.5;
  const TOGETHER_MIN_MS      = 60000;  // a couple or friends sharing the hour walk together
  const TOGETHER_MAX_MS      = 120000;
  const TOGETHER_NEEDS       = ['leisure', 'social', 'shopping', 'hunger', 'comfort'];
  const OPINION_CAP          = 100;    // one cap for every relationship (NPCSimulationCore agrees)
  const AMBIENT_CHANCE       = 0.025;
  // Swimmers side by side (ConversationManager._scanSwimTalk, Phase R).
  const SWIM_STATE             = 'swimming';
  const SWIM_TALK_CHANCE       = 0.35;   // per scan with a pair in the water
  const SWIM_TALK_DIST         = 3;
  const SWIM_TALK_COOLDOWN_MIN = 20;

  // States in which an NPC can be pulled into a full stop-and-chat
  const FACE_STATES    = ['idle', 'wandering', 'socializing', 'inZone'];
  // States in which an NPC can trade ambient lines while staying busy
  const AMBIENT_STATES = ['idle', 'wandering', 'socializing', 'inZone',
                          'working', 'interacting', 'goingToZone', 'goingToWork'];

  function _getProfile(name) {
    return window.NPCSocietyRegistry?.getProfile?.(name)
        ?? $gameSystem?._npcSociety?.[name] ?? null;
  }

  function _modifyRelationship(profile, otherName, delta) {
    if (!profile || !otherName) return;
    profile.relationships = profile.relationships || {};
    const rel = profile.relationships[otherName] ?? { meetCount: 0, opinion: 0 };
    rel.opinion = Math.max(-OPINION_CAP, Math.min(OPINION_CAP, (rel.opinion ?? 0) + delta));
    profile.relationships[otherName] = rel;
  }

  function _bumpMeetCount(profile, otherName) {
    if (!profile || !otherName) return;
    profile.relationships = profile.relationships || {};
    const rel = profile.relationships[otherName] ?? { meetCount: 0, opinion: 0 };
    rel.meetCount = Math.min((rel.meetCount ?? 0) + 1, 999);
    profile.relationships[otherName] = rel;
  }

  function _rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pickFrom(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }

  // Tone selection mirrors the old ThoughtsMenu social events: relationship
  // opinion sets the base odds, personalities nudge them.
  function _pickTone(profA, profB, aName, bName) {
    const rel = profA?.relationships?.[bName]?.opinion ?? 0;
    const w = rel > 20  ? { positive: 60, neutral: 30, negative: 10 }
            : rel < -20 ? { positive: 10, neutral: 30, negative: 60 }
            :             { positive: 35, neutral: 45, negative: 20 };
    for (const p of [profA, profB]) {
      const pers = _personalityOf(p);
      const bias = pers ? PERSONALITY_TONE_BIAS[pers.name] : null;
      if (bias === 'positive') { w.positive += 15; w.negative = Math.max(0, w.negative - 10); }
      if (bias === 'negative') { w.negative += 15; w.positive = Math.max(0, w.positive - 10); }
    }
    let r = Math.random() * (w.positive + w.neutral + w.negative);
    if ((r -= w.positive) <= 0) return 'positive';
    if ((r -= w.neutral)  <= 0) return 'neutral';
    return 'negative';
  }

  function _buildScript(profA, profB, aName, bName) {
    // Each personality brings its own appetite for a good debate
    let debateChance = 0.12;
    for (const p of [profA, profB]) {
      const name = _personalityNameOf(p);
      debateChance += (name && PERSONALITY_DEBATE_AFFINITY[name]) || 0;
    }
    // What is going on in their lives comes first when it is pressing (II.8):
    // relatives talk family, children talk like children, and a war, an
    // election or a newborn crowds out small talk.
    let life = null;
    try { life = LifeTalk.pickScript(profA, profB, aName, bName); } catch (_) { life = null; }
    if (life) return life;
    const grownUps = !LifeTalk.isChild(profA) && !LifeTalk.isChild(profB) &&
                     !LifeTalk.isNewborn(profA) && !LifeTalk.isNewborn(profB);
    // An election coming in the country the player is in makes everybody a
    // pundit: x1 normally, up to x4 in the last month and x6 on election week.
    const electionWeight = ElectionClock.weightNow(profA);
    debateChance = Math.min(0.6, debateChance * electionWeight);
    // One of the pair with a species voice tells it out of their own bank
    // more often than not (II.1b).
    const side = SpeciesVoice.scriptSide(profA, profB, aName, bName);
    if (grownUps && Math.random() < debateChance) {
      const own = side ? SpeciesVoice.script(side.id, 'debate', side.second) : null;
      if (own) return { kind: 'debate', lines: own.lines, agreement: own.agreement, frame: 'politics' };
      const debate = _pickFrom(DEBATE_SCRIPTS());
      return { kind: 'debate', lines: debate.lines, agreement: debate.agreement, frame: 'politics' };
    }
    const tone = _pickTone(profA, profB, aName, bName);
    const own = side ? SpeciesVoice.script(side.id, tone, side.second) : null;
    if (own) return { kind: tone, lines: own.lines, agreement: tone === 'positive' };
    const pool = tone === 'positive' ? POSITIVE_SCRIPTS()
               : tone === 'negative' ? NEGATIVE_SCRIPTS() : NEUTRAL_SCRIPTS();
    return { kind: tone, lines: _pickFrom(pool), agreement: tone === 'positive' };
  }

  function _resolveLine(text, aName, bName, persName) {
    return vary(String(text).replace(/{a}/g, aName).replace(/{b}/g, bName), persName);
  }

  // True while Map Battle Mode (BattleSystem/MapBattleMode.js) has the map:
  // no ambient chatter, no face-to-face talk and no thought bubbles open then.
  const isTacticalFight = () =>
    !!(window.MapBattleMode && window.MapBattleMode.isActive && window.MapBattleMode.isActive());

  const ConversationManager = {
    _active: [],            // running conversations (face-to-face + ambient)
    _pairCooldowns: {},     // pairKey -> game minute of last exchange
    _nextScanAt: 0,
    _dispatcherPatched: false,

    _pairKey(a, b) {
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    },

    _onCooldown(a, b, cooldownMin) {
      const last = this._pairCooldowns[this._pairKey(a, b)];
      if (last == null) return false;
      const now = $gameVariables?.value(114) ?? 0;
      return now - last < cooldownMin;
    },

    _setCooldown(a, b) {
      this._pairCooldowns[this._pairKey(a, b)] = $gameVariables?.value(114) ?? 0;
      // Keep the map from growing without bound
      const keys = Object.keys(this._pairCooldowns);
      if (keys.length > 200) {
        for (const k of keys.slice(0, 100)) delete this._pairCooldowns[k];
      }
    },

    _isBusyConversing(name) {
      return this._active.some(c => c.aName === name || c.bName === name);
    },

    // ---- seeking each other out ---------------------------------------------
    // A social need (NPCSimulationCore BehaviorDispatcher._handleSocial) walks
    // them to somebody on this map: their partner, then a friend, then kin,
    // then whoever is lonely. On arrival the controller (NPCSystem seekingNpc)
    // calls startWith. At most SEEKERS_PER_SCAN set off per scan window.
    _seekWindowEnd: 0,
    _seekCount: 0,
    _greetCooldowns: {},

    _isNonSentient(name) {
      const NC = window.NPCCreature;
      return !!(NC && NC.isNonSentientProfile && NC.isNonSentientProfile(_getProfile(name)));
    },

    _partnersOf(name) {
      const rec = window.NPCLifeSim?.getRecord?.(name);
      const out = [];
      if (rec?.partner?.name && !rec.partner.external) out.push(rec.partner.name);
      for (const p of (rec?.partners || [])) {
        if (p?.name && !p.external && !out.includes(p.name)) out.push(p.name);
      }
      return out;
    },

    _opinionOf(profile, otherName) {
      return profile?.relationships?.[otherName]?.opinion ?? 0;
    },

    // Partners or friends (FRIEND_OPINION either way).
    _areClose(aName, bName) {
      if (this._partnersOf(aName).includes(bName) || this._partnersOf(bName).includes(aName)) return true;
      // Family too: a parent and child or two siblings walk together and say hello.
      if (window.NPCLifeSim?.getRecord?.(aName)?.kin?.[bName]) return true;
      return this._opinionOf(_getProfile(aName), bName) >= FRIEND_OPINION ||
             this._opinionOf(_getProfile(bName), aName) >= FRIEND_OPINION;
    },

    // Who `ctrl` would walk up to among `ctrls`, best first: { ctrl, why }.
    pickSeekTarget(ctrl, profile, ctrls) {
      if (!ctrl?.event || !ctrl.eventName) return null;
      const name = ctrl.eventName;
      const SEEKABLE = ['idle', 'wandering', 'socializing', 'inZone', 'interacting', 'goingToZone'];
      const here = [];
      for (const c of (ctrls || [])) {
        if (!c || c === ctrl || !c.event || c.event._erased || !c.eventName || c.eventName === name) continue;
        if (!SEEKABLE.includes(c.state) || this._isBusyConversing(c.eventName)) continue;
        if (this._isNonSentient(c.eventName)) continue;
        // Nobody is pulled off the ground, out of a flight or out of a fight
        // (NPCSystem MAP SKIRMISH, DOWNED BODIES): the state list above says
        // so for the controller, the profile says so for the rest.
        if (window.NPCDowned?.isUnseekable?.(c.eventName, c.state)) continue;
        const d = Math.abs(c.event.x - ctrl.event.x) + Math.abs(c.event.y - ctrl.event.y);
        if (d > SEEK_RANGE) continue;
        if (this._onCooldown(name, c.eventName, PAIR_COOLDOWN_MIN)) continue;
        here.push({ c, d });
      }
      if (!here.length) return null;
      const byName = new Map(here.map(h => [h.c.eventName, h.c]));
      for (const p of this._partnersOf(name)) if (byName.has(p)) return { ctrl: byName.get(p), why: 'partner' };
      const friends = Object.entries(profile?.relationships || {})
        .filter(([n, r]) => byName.has(n) && (r?.opinion ?? 0) >= FRIEND_OPINION)
        .sort((a, b) => (b[1].opinion - a[1].opinion) || (a[0] < b[0] ? -1 : 1));
      if (friends.length) return { ctrl: byName.get(friends[0][0]), why: 'friend' };
      const kin = window.NPCLifeSim?.getRecord?.(name)?.kin || {};
      for (const n of Object.keys(kin)) if (byName.has(n)) return { ctrl: byName.get(n), why: 'kin' };
      const lonely = here
        .filter(h => (_getProfile(h.c.eventName)?.social ?? 100) < LONELY_SOCIAL)
        .sort((a, b) => (a.d - b.d) || (a.c.eventName < b.c.eventName ? -1 : 1));
      if (lonely.length) return { ctrl: lonely[0].c, why: 'lonely' };
      return null;
    },

    // True when `ctrl` set off toward somebody.
    seek(ctrl, profile) {
      if (!ctrl?.event || typeof ctrl.seekNpc !== 'function') return false;
      if (isTacticalFight() || this._isNonSentient(ctrl.eventName)) return false;
      if (window.NPCDowned?.isUnseekable?.(ctrl.eventName, ctrl.state)) return false;
      const now = performance.now();
      if (now >= this._seekWindowEnd) { this._seekWindowEnd = now + SCAN_MS; this._seekCount = 0; }
      if (this._seekCount >= SEEKERS_PER_SCAN) return false;
      const pick = this.pickSeekTarget(ctrl, profile, $gameSystem?.getActiveNPCControllers?.() || []);
      if (!pick) return false;
      this._seekCount++;
      ctrl.seekNpc(pick.ctrl, pick.why);
      return true;
    },

    // Two controllers who have met on purpose start talking now, whatever the
    // odds a chance meeting would have had. False when either is busy.
    startWith(ctrlA, ctrlB) {
      if (!ctrlA?.event || !ctrlB?.event || ctrlA === ctrlB) return false;
      if (ctrlA.event._erased || ctrlB.event._erased) return false;
      if (!ctrlA.eventName || !ctrlB.eventName || ctrlA.eventName === ctrlB.eventName) return false;
      if (this._isBusyConversing(ctrlA.eventName) || this._isBusyConversing(ctrlB.eventName)) return false;
      if (this._active.filter(c => c.kind !== 'ambient').length >= MAX_ACTIVE) return false;
      this._start(ctrlA, ctrlB, _getProfile(ctrlA.eventName), _getProfile(ctrlB.eventName));
      return true;
    },

    // Friends passing close by say hello: one bubble, now and then.
    _scanGreetings() {
      const ctrls = this._eligibleControllers(AMBIENT_STATES.concat(['goingToInteract', 'seekingNpc', 'followingNpc']));
      for (let i = 0; i < ctrls.length; i++) {
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i], b = ctrls[j];
          const dist = Math.abs(a.event.x - b.event.x) + Math.abs(a.event.y - b.event.y);
          if (dist > GREET_DIST || dist === 0) continue;
          const key = this._pairKey(a.eventName, b.eventName);
          const now = $gameVariables?.value(114) ?? 0;
          const last = this._greetCooldowns[key];
          if (last != null && now - last < GREET_COOLDOWN_MIN) continue;
          if (!this._areClose(a.eventName, b.eventName)) continue;
          this._greetCooldowns[key] = now;
          if (Math.random() >= GREET_CHANCE) continue;
          const [who, other] = Math.random() < 0.5 ? [a, b] : [b, a];
          const line = this._greetLine(who.eventName, other.eventName);
          if (!line) continue;
          who.turnToward?.(other.event);
          window.NPCSim?.emit?.('npc:thought', { name: who.eventName, thought: line });
          // A hello at arm's length is a brief exposure (Health_DiseaseSystem).
          try { window.DiseaseSystem?.onNpcContact?.(who.eventName, other.eventName, 'greeting'); } catch (_) { /* optional */ }
          return; // one hello per scan
        }
      }
      const keys = Object.keys(this._greetCooldowns);
      if (keys.length > 200) for (const k of keys.slice(0, 100)) delete this._greetCooldowns[k];
    },

    _greetLine(speaker, otherName) {
      // Relatives greet each other as relatives (II.8).
      const kinLine = LifeTalk.kinGreetLine(speaker, otherName);
      if (kinLine) return kinLine;
      const pool = bank('ConvThoughts.greetFriend');
      if (!Array.isArray(pool) || !pool.length) return null;
      const pers = _personalityNameOf(_getProfile(speaker));
      return vary(String(_pickFrom(pool)), pers).replace(/\{name\}/g, otherName);
    },

    // After a chat, a couple or two friends who have the same thing to do this
    // hour go and do it together: the second follows the first.
    _maybeWalkTogether(convo) {
      const { a, b, aName, bName } = convo;
      if (!a?.event || !b?.event || typeof b.followNpc !== 'function') return false;
      if (!this._areClose(aName, bName)) return false;
      const na = _getProfile(aName)?.currentNeed, nb = _getProfile(bName)?.currentNeed;
      if (!na || na !== nb || !TOGETHER_NEEDS.includes(na)) return false;
      b.followNpc(a, _rand(TOGETHER_MIN_MS, TOGETHER_MAX_MS));
      return true;
    },

    // Who is near enough the player to be heard at all. A scan asks
    // _eligibleControllers four or five times (face to face, ambient,
    // greetings, the swim, SpecTalk), and each ask filtered every controller
    // on the map through these same tests, so update works it out once per
    // scan in _scanBase and every ask in that scan reads it. State and who is
    // already talking are still asked fresh each time: one scan's chat takes
    // its pair out of the next scan's running.
    _scanBase: null,
    _inRangeControllers() {
      if (this._scanBase) return this._scanBase;
      const ctrls = $gameSystem?.getActiveNPCControllers?.() || [];
      if (!$gamePlayer) return [];
      // One of the risen wears a person's face and has no conversation left in
      // it (NPCSystem_Zombies), whatever the profile behind the slot says.
      const risen = window.NPCSystem?.isZombieWalker;
      return ctrls.filter(c =>
        c.event && !c.event._erased && !c.event.isTransparent() &&
        !(risen && risen(c.event)) &&
        c.eventName &&
        Math.abs(c.event.x - $gamePlayer.x) + Math.abs(c.event.y - $gamePlayer.y) <= PLAYER_RANGE
      );
    },

    _eligibleControllers(states) {
      return this._inRangeControllers().filter(c =>
        c.event && !c.event._erased &&
        states.includes(c.state) &&
        !this._isBusyConversing(c.eventName)
      );
    },

    // BehaviorDispatcher would otherwise yank a conversing NPC into a new
    // activity the moment its simulated need changes mid-chat.
    _patchDispatcher() {
      if (this._dispatcherPatched) return;
      const BD = window.NPCSim?.BehaviorDispatcher;
      if (!BD) return;
      const _dispatch = BD.dispatch;
      BD.dispatch = function (controller, profile) {
        if (controller?.state === 'conversing') return;
        return _dispatch.apply(this, arguments);
      };
      this._dispatcherPatched = true;
    },

    update() {
      if (!$gameMap || !$gameSystem) return;
      // Nobody left to talk (WorldModes.simulatesPeople): the manager costs nothing.
      if (window.NPCShared?.WorldModes?.simulatesPeople?.() === false) return;
      const now = performance.now();

      this._patchDispatcher();

      // Backwards so _step's self-removal (which rebuilds _active) can't skip entries
      for (let i = this._active.length - 1; i >= 0; i--) {
        const convo = this._active[i];
        if (convo) this._step(convo, now);
      }
      // A spec answer waiting on its beat (II.10); free when none is.
      SpecTalk.update(now);

      if (now >= this._nextScanAt) {
        this._nextScanAt = now + SCAN_MS;
        // A tactical fight freezes the world: nobody stops for a chat
        // (MapBattleMode.js). Running exchanges finish on their own.
        if (isTacticalFight()) { this._scanStep = -1; return; }
        this._scanStep = 0;
      }
      if (this._scanStep >= 0) this._runScanStep(now);
    },

    // A scan round is five scans (face to face, ambient, greetings, the swim,
    // SpecTalk), and running all five on the frame the round fell due put a
    // spike of several milliseconds into one frame every four seconds. The
    // round still starts every SCAN_MS, in the same order, but each scan
    // takes its own frame: the five land on five consecutive ticks, a tenth
    // of a second apart at most, and no frame pays for more than one of them.
    // Who is in range is worked out afresh for each, which is a filter over
    // the controllers and cheap next to the pair loops it feeds; a chat a
    // scan starts still takes its pair out of the scans after it.
    _scanStep: -1,
    _runScanStep(now) {
      if (isTacticalFight()) { this._scanStep = -1; return; }
      const step = this._scanStep;
      this._scanStep = step + 1 < SCAN_STEPS ? step + 1 : -1;
      this._scanBase = null;
      this._scanBase = this._inRangeControllers();
      try {
        if (step === 0) this._scanFaceToFace();
        else if (step === 1) this._scanAmbient();
        else if (step === 2) this._scanGreetings();
        else if (step === 3) this._scanSwimTalk();
        // Somebody good at something says so, or is asked about it (II.10).
        else SpecTalk.scan({ now });
      } finally {
        this._scanBase = null;
      }
    },

    // ---- face-to-face -------------------------------------------------------

    _scanFaceToFace() {
      if (this._active.filter(c => c.kind !== 'ambient').length >= MAX_ACTIVE) return;
      const ctrls = this._eligibleControllers(FACE_STATES);

      for (let i = 0; i < ctrls.length; i++) {
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i], b = ctrls[j];
          const dist = Math.abs(a.event.x - b.event.x) + Math.abs(a.event.y - b.event.y);
          if (dist > START_DIST || dist === 0) continue;
          if (this._onCooldown(a.eventName, b.eventName, PAIR_COOLDOWN_MIN)) continue;

          const profA = _getProfile(a.eventName);
          const profB = _getProfile(b.eventName);
          // Low social meters make NPCs more eager to stop for a chat
          let chance = START_CHANCE;
          if ((profA?.social ?? 100) < 40 || (profB?.social ?? 100) < 40) chance += 0.25;
          if (Math.random() >= chance) continue;

          this._start(a, b, profA, profB);
          if (this._active.filter(c => c.kind !== 'ambient').length >= MAX_ACTIVE) return;
        }
      }
    },

    _start(ctrlA, ctrlB, profA, profB) {
      const aName  = ctrlA.eventName, bName = ctrlB.eventName;
      const script = _buildScript(profA, profB, aName, bName);

      for (const ctrl of [ctrlA, ctrlB]) {
        ctrl.state = 'conversing';
        ctrl.path  = [];
        ctrl._lastDispatchedNeed = null;
      }
      ctrlA.turnToward?.(ctrlB.event);
      ctrlB.turnToward?.(ctrlA.event);

      this._active.push({
        kind: script.kind, agreement: script.agreement, frame: script.frame || null, topic: script.topic || null,
        a: ctrlA, b: ctrlB, aName, bName,
        lines: script.lines, idx: 0,
        nextLineAt: performance.now() + 600,
        mapId: $gameMap.mapId(),
        spoken: [],
        faceToFace: true,
      });
    },

    // ---- ambient chatter ----------------------------------------------------

    _scanAmbient() {
      if (Math.random() >= AMBIENT_CHANCE) return;
      const ctrls = this._eligibleControllers(AMBIENT_STATES);
      const pairs = [];
      for (let i = 0; i < ctrls.length; i++) {
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i], b = ctrls[j];
          const dist = Math.abs(a.event.x - b.event.x) + Math.abs(a.event.y - b.event.y);
          if (dist > AMBIENT_DIST) continue;
          if (this._onCooldown(a.eventName, b.eventName, AMBIENT_COOLDOWN_MIN)) continue;
          pairs.push([a, b]);
        }
      }
      if (!pairs.length) return;
      const [a, b] = _pickFrom(pairs);
      // A topic from their lives when one is pressing (II.8), small talk otherwise.
      let lines = null;
      try { lines = LifeTalk.pickAmbient(_getProfile(a.eventName), _getProfile(b.eventName), a.eventName, b.eventName); } catch (_) { lines = null; }
      if (!lines) {
        lines = SpeciesVoice.scriptFor('ambient', _getProfile(a.eventName), _getProfile(b.eventName),
          a.eventName, b.eventName)?.lines || null;
      }

      this._active.push({
        kind: 'ambient', agreement: true,
        a, b, aName: a.eventName, bName: b.eventName,
        lines: lines || _pickFrom(AMBIENT_SCRIPTS()), idx: 0,
        nextLineAt: performance.now() + 400,
        mapId: $gameMap.mapId(),
        spoken: [],
        faceToFace: false,
      });
    },

    // ---- swim talk (NPCSim.Water, Phase R) ----------------------------------
    // Two people swimming side by side talk while they swim: an exchange out
    // of ConvThoughts.water.talk, played as ambient lines so neither leaves the
    // water for it. Far likelier than ordinary ambient chatter, since swimming
    // together is what they came for.
    _scanSwimTalk() {
      if (Math.random() >= SWIM_TALK_CHANCE) return;
      const ctrls = this._eligibleControllers([SWIM_STATE]);
      const pairs = [];
      for (let i = 0; i < ctrls.length; i++) {
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i], b = ctrls[j];
          const dist = Math.abs(a.event.x - b.event.x) + Math.abs(a.event.y - b.event.y);
          if (dist > SWIM_TALK_DIST) continue;
          if (this._onCooldown(a.eventName, b.eventName, SWIM_TALK_COOLDOWN_MIN)) continue;
          if (this._isNonSentient(a.eventName) || this._isNonSentient(b.eventName)) continue;
          pairs.push([a, b]);
        }
      }
      if (!pairs.length) return;
      const [a, b] = _pickFrom(pairs);
      return this.startSwimTalk(a, b);
    },

    // One exchange between two swimmers, now. False when there is nothing to say.
    startSwimTalk(a, b) {
      if (!a?.event || !b?.event || a === b) return false;
      const pool = bank('ConvThoughts.water.talk');
      if (!Array.isArray(pool) || !pool.length) return false;
      this._active.push({
        kind: 'ambient', agreement: true,
        a, b, aName: a.eventName, bName: b.eventName,
        lines: _pickFrom(pool), idx: 0,
        nextLineAt: performance.now() + 400,
        mapId: $gameMap.mapId(),
        spoken: [],
        faceToFace: false,
      });
      return true;
    },

    // ---- playback -----------------------------------------------------------

    _step(convo, now) {
      const { a, b } = convo;
      const valid =
        $gameMap?.mapId() === convo.mapId &&
        a.event && !a.event._erased && b.event && !b.event._erased &&
        (!convo.faceToFace || (a.state === 'conversing' && b.state === 'conversing'));
      if (!valid) { this._end(convo, true); return; }

      if (now < convo.nextLineAt) return;

      const [who, rawText] = convo.lines[convo.idx];
      const speakerCtrl = who === 0 ? a : b;
      // Same script, different mouths: each line is flavored by its speaker's
      // personality voice, so the two participants never sound interchangeable.
      const speakerPers = _personalityNameOf(_getProfile(speakerCtrl.eventName));
      let text = applyVoice(
        _resolveLine(rawText, convo.aName, convo.bName, speakerPers),
        speakerPers, VOICE_CHANCE_DIALOGUE);
      // The speaker's creed frames the topic now and then (II.9), on top of
      // the personality voice. Em and Bubba are never framed.
      if (convo.frame) {
        const speakerProf = _getProfile(speakerCtrl.eventName);
        text = CreedVoice.decorate(text, speakerProf, convo.frame, CREED_CHANCE_DIALOGUE,
          speakerProf ? LifeContext.of(speakerProf, speakerCtrl.eventName)?.params : null, speakerCtrl.eventName);
      }

      if (convo.faceToFace) {
        a.turnToward?.(b.event);
        b.turnToward?.(a.event);
      }
      // A species voice says it their own way (II.1b), and the log keeps what
      // was said.
      text = SpeciesVoice.render(text, _getProfile(speakerCtrl.eventName) || speakerCtrl.eventName);
      window.NPCSim?.emit?.('npc:thought', { name: speakerCtrl.eventName, thought: text });
      convo.spoken.push({ speaker: speakerCtrl.eventName, text });

      convo.idx++;
      convo.nextLineAt = now + LINE_MS;
      if (convo.idx >= convo.lines.length) this._end(convo, false);
    },

    _end(convo, aborted) {
      this._active = this._active.filter(c => c !== convo);
      const { aName, bName } = convo;
      this._setCooldown(aName, bName);

      // Release the participants back to their routines
      for (const ctrl of [convo.a, convo.b]) {
        if (ctrl && ctrl.state === 'conversing') {
          ctrl._lastDispatchedNeed = null;
          try { ctrl.decideNextGoal?.(); } catch (_) { ctrl.state = 'idle'; }
        }
      }

      // A couple or two friends with the same hour ahead go on together.
      if (!aborted && convo.faceToFace) {
        try { this._maybeWalkTogether(convo); } catch (_) { /* never let a stroll break a chat */ }
      }

      // An exchange that barely started leaves no trace
      if (convo.spoken.length < 2) return;

      // A whole exchange spent breathing the same air (Health_DiseaseSystem).
      try { window.DiseaseSystem?.onNpcContact?.(aName, bName, convo.faceToFace ? 'conversation' : 'ambient'); } catch (_) { /* optional */ }

      ConversationLog.record(aName, bName, convo.kind, convo.spoken);

      const profA = _getProfile(aName);
      const profB = _getProfile(bName);
      _bumpMeetCount(profA, bName);
      _bumpMeetCount(profB, aName);

      // Social meters refill a bit, that's what the chat was for
      for (const p of [profA, profB]) {
        if (p && p.social !== undefined) p.social = Math.min(100, p.social + (convo.faceToFace ? 20 : 8));
      }

      if (convo.faceToFace && !aborted) {
        // Same relationship swings as the old ThoughtsMenu social events
        const delta = convo.kind === 'positive' ? _rand(3, 8)
                    : convo.kind === 'negative' ? -_rand(2, 7)
                    : convo.kind === 'debate'   ? (convo.agreement ? _rand(3, 8) : -_rand(2, 7))
                    : 1;
        _modifyRelationship(profA, bName, delta);
        _modifyRelationship(profB, aName, delta);
        // A warm exchange leans each of them a few points toward the other's
        // creed (NPCLifeSim CONVERSION).
        const warm = convo.kind === 'positive' || (convo.kind === 'debate' && convo.agreement);
        if (warm) window.NPCLifeSim?.conversationPush?.(aName, bName);
        // "met X" keeps the social-web/contacts UI fed (see _extractContacts)
        window.NPCSim?.StoryLogger?.record?.(aName, 'social', 'NPCSim.log.met', { name: bName });
        window.NPCSim?.StoryLogger?.record?.(bName, 'social', 'NPCSim.log.met', { name: aName });
      }
    },

    hideAll() {
      for (const convo of [...this._active]) this._end(convo, true);
      if (SpecTalk) SpecTalk.clear();
      // A round half run belongs to the map or the moment it started on.
      this._scanStep = -1;
    },
  };

  // ---------------------------------------------------------------------------
  // II.4 POLITICS & WORLD PROVIDERS
  // ---------------------------------------------------------------------------
  // Fill the I.7 / I.8 templates with live facts from NPCPolitics and
  // NPCWorldWeb, then hand the line back voiced. Both return null whenever
  // the source plugin (or this NPC's identity) isn't available, so everything
  // degrades gracefully.

  const WorldProvider = {
    fill(template, ctx, persName) {
      // Fallbacks are words a player reads, so they live with the rest of them.
      const fb = bank('ConvWorld.fallback');
      return vary(String(template)
        .replace(/{group}/g, ctx.group ?? fb.group)
        .replace(/{festival}/g, ctx.festival ?? fb.festival)
        .replace(/{epidemic}/g, ctx.epidemic ?? fb.epidemic)
        .replace(/{headline}/g, ctx.headline ?? fb.headline), persName);
    },

    _pickRaw(ctx, persName) {
      // Most pressing topic first: plague > crime > festival > economy >
      // wanted player > headline > market chatter.
      const r = Math.random();
      if (ctx.epidemic && r < 0.35) return this.fill(_pickFrom(WORLD_THOUGHTS().epidemic), ctx, persName);
      if (ctx.crimeWave && r < 0.5) return this.fill(_pickFrom(WORLD_THOUGHTS().crimeWave), ctx, persName);
      if (ctx.festival && r < 0.6) return this.fill(_pickFrom(WORLD_THOUGHTS().festival), ctx, persName);
      if (ctx.boom && r < 0.7) return this.fill(_pickFrom(WORLD_THOUGHTS().boom), ctx, persName);
      if (ctx.bust && r < 0.7) return this.fill(_pickFrom(WORLD_THOUGHTS().bust), ctx, persName);
      if (ctx.playerNotorious && r < 0.8) return this.fill(_pickFrom(WORLD_THOUGHTS().outlaw), ctx, persName);
      if (ctx.headline && r < 0.92) return this.fill(_pickFrom(WORLD_THOUGHTS().headline), ctx, persName);
      if (ctx.marketMood) return this.fill(_pickFrom(WORLD_THOUGHTS().market[ctx.marketMood]), ctx, persName);
      return null;
    },

    // Nibiru is not a settlement-scoped mood, it's a fact of survival, so it
    // is picked per personality (like WEATHER_THOUGHTS) rather than as shared
    // text run through applyVoice, and it outranks every routine topic below.
    _pickWorldEndingRaw(ctx, persName) {
      const topic = ctx.earthDestroyed ? WORLD_THOUGHTS().earthDestroyed
                  : ctx.earthSaved ? WORLD_THOUGHTS().earthSaved
                  : null;
      if (!topic) return null;
      const pool = (persName && topic[persName]) || topic.default;
      return pool && pool.length ? vary(_pickFrom(pool), persName) : null;
    },

    pickWorldThought(profile) {
      const name = profile?._eventName;
      if (!window.NPCWorldWeb?.getConversationContext) return null;
      let ctx;
      try { ctx = window.NPCWorldWeb.getConversationContext(name); } catch (_) { return null; }
      if (!ctx) return null;
      const persName = _personalityNameOf(profile);
      if ((ctx.earthDestroyed || ctx.earthSaved) && Math.random() < 0.5) {
        const ending = this._pickWorldEndingRaw(ctx, persName);
        if (ending) return ending;
      }
      const line = this._pickRaw(ctx, persName);
      return line ? applyVoice(line, persName) : null;
    },
  };

  const PoliticsProvider = {
    fill(template, ctx, persName) {
      const fb = bank('ConvPolitics.fallback');
      return vary(String(template)
        .replace(/{party}/g, ctx.partyName ?? fb.party)
        .replace(/{head}/g, ctx.headName ?? fb.head)
        .replace(/{title}/g, ctx.headTitle ?? fb.title)
        .replace(/{power}/g, ctx.powerName ?? fb.power)
        .replace(/{days}/g, ctx.daysToElection ?? "?")
        .replace(/{election}/g, (ctx.electionLabel ?? fb.election).toLowerCase())
        .replace(/{gripe}/g, ctx.gripe ?? fb.gripe)
        .replace(/{rumorSubject}/g, ctx.rumorSubject ?? fb.rumorSubject)
        .replace(/{rumorKind}/g, ctx.rumorKind ?? fb.rumorKind)
        .replace(/{winner}/g, ctx.lastWinnerName ?? fb.winner)
        .replace(/{office}/g, ctx.localOffice ?? fb.office)
        .replace(/{group}/g, ctx.group ?? fb.group), persName);
    },

    _pickRaw(ctx, persName) {
      // Most salient topic first: holding office > hot rumor > policy pain
      // > imminent election > fresh result > general stance.
      const r = Math.random();
      if (ctx.localOffice && r < 0.25) return this.fill(_pickFrom(OFFICE_HOLDER_THOUGHTS()), ctx, persName);
      if (ctx.rumorSubject && r < 0.40) return this.fill(_pickFrom(POLITICAL_RUMOR_THOUGHTS()), ctx, persName);
      if (ctx.gripe && r < 0.55) return this.fill(_pickFrom(POLICY_GRUMBLES()), ctx, persName);
      if (ctx.daysToElection != null && ctx.daysToElection <= 30 && r < 0.75) {
        return this.fill(_pickFrom(ELECTION_THOUGHTS().upcoming), ctx, persName);
      }
      if (ctx.lastWinnerName && ctx.engagement >= 25 && r < 0.85) {
        return this.fill(_pickFrom(ctx.lastElectionWon ? ELECTION_THOUGHTS().won : ELECTION_THOUGHTS().lost), ctx, persName);
      }
      const pool = POLITICAL_THOUGHTS()[ctx.stance] || POLITICAL_THOUGHTS().apathetic;
      return this.fill(_pickFrom(pool), ctx, persName);
    },

    pickPoliticalThought(profile) {
      const name = profile?._eventName;
      if (!name || !window.NPCPolitics?.getConversationContext) return null;
      let ctx;
      try { ctx = window.NPCPolitics.getConversationContext(name); } catch (_) { return null; }
      if (!ctx) return null;
      const persName = _personalityNameOf(profile);
      const line = this._pickRaw(ctx, persName);
      if (!line) return null;
      // The creed they hold frames what they just said (II.9); an election
      // season frames it as an election.
      const topic = (ctx.daysToElection != null && ctx.daysToElection <= 30) ? 'elections' : 'politics';
      return CreedVoice.decorate(applyVoice(line, persName), profile, topic, CREED_CHANCE_POLITICS);
    },
  };


  // ---------------------------------------------------------------------------
  // II.7 SCENE HOOKS & GLOBALS
  // ---------------------------------------------------------------------------

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);
    if (isTacticalFight()) {
      // The fight took the map mid-sentence: pull every balloon down
      ConversationManager.hideAll();
      if (ThoughtBubbleManager) ThoughtBubbleManager.hideAll();
      return;
    }
    ConversationManager.update();
    if (ThoughtBubbleManager) ThoughtBubbleManager.update();
  };

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    ConversationManager.hideAll();
    if (ThoughtBubbleManager) ThoughtBubbleManager.hideAll();
    _Scene_Map_terminate.call(this);
  };

  // ---------------------------------------------------------------------------
  // FAMILY NAMESPACE (NPCConversation_*.js)
  // ---------------------------------------------------------------------------
  // The conversation system is split across the NPCConversation_*.js modules
  // listed in js/plugins.js right after this file: _Banks (PART I, the
  // dialogue data), _LifeTalk (II.8, II.9), _Thoughts (II.5, II.6) and _Api
  // (the public window.NPCConversation table, last). Each module reads the
  // helpers it shares with the others off NPCConversation._internal and
  // publishes its own there; a name owned by a module that loads later is
  // bound through _late, which NPCConversation_Api.js runs once the family
  // is in.

  window.NPCConversation = { _internal: { _late: [] } };
  Object.assign(window.NPCConversation._internal, {
    _buildScript, _getProfile, _personalityNameOf, _personalityOf, _pickFrom, _resolveLine,
    applyVoice, ConversationLog, ConversationManager, isTacticalFight, PoliticsProvider, SpeciesVoice, vary,
    VOICE_CHANCE_DIALOGUE, WorldProvider,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let
    AMBIENT_SCRIPTS, bank, CREED_CHANCE_DIALOGUE, CREED_CHANCE_POLITICS, CreedVoice, DEBATE_SCRIPTS,
    ELECTION_THOUGHTS, ElectionClock, LifeContext, LifeTalk, NEGATIVE_SCRIPTS, NEUTRAL_SCRIPTS,
    OFFICE_HOLDER_THOUGHTS, PERSONALITY_DEBATE_AFFINITY, PERSONALITY_TONE_BIAS, PERSONALITY_VOICES,
    POLICY_GRUMBLES, POLITICAL_RUMOR_THOUGHTS, POLITICAL_THOUGHTS, POSITIVE_SCRIPTS, SpecTalk,
    ThoughtBubbleManager, WORLD_THOUGHTS;
  window.NPCConversation._internal._late.push(() => ({
    AMBIENT_SCRIPTS, bank, CREED_CHANCE_DIALOGUE, CREED_CHANCE_POLITICS, CreedVoice, DEBATE_SCRIPTS,
    ELECTION_THOUGHTS, ElectionClock, LifeContext, LifeTalk, NEGATIVE_SCRIPTS, NEUTRAL_SCRIPTS,
    OFFICE_HOLDER_THOUGHTS, PERSONALITY_DEBATE_AFFINITY, PERSONALITY_TONE_BIAS, PERSONALITY_VOICES,
    POLICY_GRUMBLES, POLITICAL_RUMOR_THOUGHTS, POLITICAL_THOUGHTS, POSITIVE_SCRIPTS, SpecTalk,
    ThoughtBubbleManager, WORLD_THOUGHTS,
  } = window.NPCConversation._internal));

})();
