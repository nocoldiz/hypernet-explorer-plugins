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
 * FILE LAYOUT, the file is split in two clearly-banner'd parts:
 *   PART I , DIALOGUE DATA: every editable word (see its table of contents)
 *   PART II, ENGINE: logic only; you should rarely need to touch it
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
  //  PART I, DIALOGUE DATA (every word an NPC can say lives in this part)
  // ============================================================================

  // Every word an NPC can say now lives in js/i18n/<lang>/conversations/*.json,
  // and the banks below are lazy views onto those files: nothing here is frozen
  // at load time, so a language switch is picked up on the next line spoken.
  // Only the keys and the non-verbal tuning tables remain in this file.
  let _bankLang = null;
  const _bankCache = new Map();
  function bank(key) {
    const lang = T.language();
    if (lang !== _bankLang) { _bankLang = lang; _bankCache.clear(); }
    if (!_bankCache.has(key)) _bankCache.set(key, T.obj(key));
    return _bankCache.get(key);
  }
  //   I.1  Personality dispositions   (tone bias, debate affinity)
  //   I.2  Personality voices         (openers/closers that flavor shared lines)
  //   I.3  Conversation scripts       (positive/negative/neutral/debate/ambient)
  //   I.4  Solo thought pools         (needs, familiar-with-player, capability)
  //   I.5  Personality core thoughts  (each personality's inner voice)
  //   I.6  Situational thoughts       (weather/time-of-day × 25 personalities)
  //   I.7  Politics dialogue          (stances, elections, rumors, gripes)
  //   I.8  World-web small talk       (crime, economy, festivals, headlines)
  //
  //  PART II, ENGINE (logic only; no dialogue text below the PART II banner)
  //   II.1 Personality lookup & voice application
  //   II.2 Conversation log            II.5 Thought provider
  //   II.3 Conversation manager        II.6 Thought bubbles
  //   II.4 Politics & world providers  II.7 Scene hooks & globals
  // ============================================================================
  // ============================================================================

  // ---------------------------------------------------------------------------
  // I.1 PERSONALITY DISPOSITIONS
  // ---------------------------------------------------------------------------
  // No shared archetypes: every personality is its own dialogue identity.
  // These tables tune conversation behaviour per personality.

  // Personalities that pull conversations toward a tone regardless of opinion
  const PERSONALITY_TONE_BIAS = {
    Aggressive: 'negative', Grumpy: 'negative', Cynical: 'negative', Paranoid: 'negative',
    Empathetic: 'positive', Nurturing: 'positive', Sanguine: 'positive', Loyal: 'positive',
  };

  // How much each personality enjoys (or dodges) a political/philosophical
  // debate, added to the base debate chance for each participant.
  const PERSONALITY_DEBATE_AFFINITY = {
    Scholarly: 0.15,  Cynical: 0.12,   Authoritative: 0.10, Calm: 0.08,
    Fatalistic: 0.08, Stoic: 0.06,     Paranoid: 0.06,      Melancholic: 0.05,
    Disciplined: 0.04, Artistic: 0.03,
    Sanguine: -0.03,  Hedonistic: -0.04, Timid: -0.06,      Apathetic: -0.06,
  };

  // ---------------------------------------------------------------------------
  // I.2 PERSONALITY VOICES
  // ---------------------------------------------------------------------------
  // Every line drawn from a SHARED pool (conversation scripts, need/world/
  // politics/capability thoughts...) is passed through the speaker's voice:
  // applyVoice (PART II.1) sometimes prepends one of these openers or appends
  // one of these closers, so two NPCs delivering the same base line produce
  // personality-flavored variations of it. Pools that are already written per
  // personality (core thoughts, weather/time) are never re-flavored.
  // Each voice also carries a LEXICON, the "favors" and "avoids" word lists
  // that weigh every {a|b|c} alternative in a shared line (see vary, II.1).
  // NOTE: keep every opener/closer unique across the whole table, the test
  // harness enforces it so no two personalities can ever sound identical.

  const PERSONALITY_VOICES = () => bank('ConvVoices');

  // ---------------------------------------------------------------------------
  // I.3 CONVERSATION SCRIPTS (ported from ThoughtsOLD.js, English only)
  // ---------------------------------------------------------------------------
  // Each script is an array of [speakerIndex, text]; {a} / {b} resolve to the
  // two participants' names. Speaker 0 is the NPC who initiated the exchange.
  // Every line is delivered through its speaker's PERSONALITY_VOICE (II.1), so
  // the same positive/negative/neutral/debate/ambient script reads differently
  // depending on which two personalities are having the conversation.
  //
  // THESE ARE THE TOWN'S SCRIPTS, and the town is full of people who barely
  // know each other: two NPCs who met by a market stall, or an NPC the party
  // walked up to a minute ago (NPC/DialogueSystem.js stages the same banks with
  // the party leader standing in for speaker 0). So nothing that presumes a
  // shared camp belongs in here: whose rations those were, who was snoring,
  // who took the watch, who took the better weapon out of the loot. That
  // material is the party's, it lives in NPC/PartyBanter.json under
  // script.companion, and only party members can reach it. Adding a line of it
  // back here puts it in a stranger's mouth.

  const POSITIVE_SCRIPTS = () => bank('ConvScripts.positive');

  const NEGATIVE_SCRIPTS = () => bank('ConvScripts.negative');

  const NEUTRAL_SCRIPTS = () => bank('ConvScripts.neutral');

  // Political / philosophical / ethical debates (old generateDebateMessages).
  // agreement: relationship effect direction when the debate ends.
  // The political debates are part of the same pool the conversation manager
  // draws from, which the old code did with a push() at load time.
  const DEBATE_SCRIPTS = () => bank('ConvScripts.debate').concat(bank('ConvPolitics.debate'));

  // Quick two-line exchanges traded while NPCs keep doing their activities.
  const AMBIENT_SCRIPTS = () => bank('ConvScripts.ambient');

  // ---------------------------------------------------------------------------
  // I.4 SOLO THOUGHT POOLS (moved out of NPCSimulationCore)
  // ---------------------------------------------------------------------------
  // Need-based thought templates keyed by profile.currentNeed. Formerly
  // THOUGHT_TEMPLATES in NPCSimulationCore.js, every piece of NPC dialogue
  // now lives in this plugin; the core's ThoughtGenerator delegates to
  // ThoughtProvider (II.5). All three pools below are shared text, so each
  // pick is flavored by the thinker's PERSONALITY_VOICE.

  const NEED_THOUGHTS = () => bank('ConvThoughts.need');

  // Crime narration with an {item} placeholder, fired by NPCSimulationCore's
  // CrimeManager when an NPC eyes, pockets, or gets caught taking something.
  const CRIME_INTENT_THOUGHTS = () => bank('ConvThoughts.crimeIntent');
  const CRIME_SUCCESS_THOUGHTS = () => bank('ConvThoughts.crimeSuccess');
  const CRIME_CAUGHT_THOUGHTS = () => bank('ConvThoughts.crimeCaught');

  // Shopping reactions. {item} is the product's name. "buy" lines fire the
  // moment an NPC purchases something; "browse" lines fire when a (law-abiding)
  // customer studies a displayed item without buying. Both are split into
  // cheap/pricey variants so the reaction tracks the price tag, and tinted by
  // personality via applyVoice + the disposition lines below.
  const ITEM_BUY_THOUGHTS = () => bank('ConvThoughts.itemBuy');
  const ITEM_BROWSE_THOUGHTS = () => bank('ConvThoughts.itemBrowse');
  // Personality-flavored disposition lines occasionally appended to a shopping
  // thought, so the same {item} reads differently for a greedy vs. frugal NPC.
  const ITEM_DISPOSITION_THOUGHTS = () => bank('ConvThoughts.itemDisposition');

  // What an addicted NPC says while a craving is on them, keyed by substance:
  // "craving" while they are merely wanting it, "withdrawal" once the want has
  // turned into something they cannot talk around. AddictionSystem
  // (TimeDateSystem.js) answers how badly they want it; the words are here.
  const CRAVING_THOUGHTS = () => bank('ConvThoughts.craving');
  const CRAVING_WITHDRAWAL_THOUGHTS = () => bank('ConvThoughts.withdrawal');

  // What the month of the year is doing to them, keyed by the season
  // PlantGrowthSystem and WeatherSystem already agree on (SPRING..WINTER).
  // Weather is what the sky is doing today; this is what the year is doing.
  const SEASON_THOUGHTS = () => bank('ConvThoughts.season');

  // How the purse feels from the inside, keyed by wealth tier: the same street
  // is a different place to somebody counting coppers and somebody who has
  // stopped counting. NPCSociety's wealthTierBase decides which voice they use.
  const WEALTH_THOUGHTS = () => bank('ConvThoughts.wealth');

  // Extra thoughts for NPCs who know the player well (playerOpinion >= 20).
  // Formerly FAMILIAR_THOUGHT_POOL in NPCSimulationCore.js.
  const FAMILIAR_THOUGHTS = () => bank('ConvThoughts.familiar');

  // Situational reactions fired off the npc:capability_end bus event.
  // Formerly CAPABILITY_THOUGHTS() in NPCSimulationCore.js.
  const CAPABILITY_THOUGHTS = () => bank('ConvThoughts.capability');

  // ---------------------------------------------------------------------------
  // I.5 PERSONALITY CORE THOUGHTS
  // ---------------------------------------------------------------------------
  // Each personality's own inner voice, hardcoded (English) from
  // js/db/Health/PersonalityData.json "thoughts.en". Fired at random by
  // ThoughtProvider.pickThought regardless of the NPC's current need.
  // Already per-personality, so never re-flavored by applyVoice.

  const PERSONALITY_CORE_THOUGHTS = () => bank('ConvCore');

  // ---------------------------------------------------------------------------
  // I.6 SITUATIONAL THOUGHTS (weather / time-of-day, per personality)
  // ---------------------------------------------------------------------------
  // Every situation carries FOUR distinct lines for each of the 25
  // personalities (one is picked at random per thought), so no two
  // personalities ever share a situational voice and the same NPC doesn't
  // repeat itself. 'default' covers NPCs with no resolvable personality.
  // Already per-personality, so never re-flavored by applyVoice.

  const WEATHER_THOUGHTS = () => bank('ConvWeather');

  const TIME_THOUGHTS = () => bank('ConvTime');

  // ---------------------------------------------------------------------------
  // I.7 POLITICS DIALOGUE (facts from NPCPolitics, words from here)
  // ---------------------------------------------------------------------------
  // NPCPolitics simulates governments, parties and elections and exposes
  // getConversationContext(name); every line an NPC can say about any of it
  // lives here, per the rule that NPCConversation.js owns all dialogue text.
  // Shared text → flavored by the speaker's PERSONALITY_VOICE on pick.
  // Placeholders: {party} {head} {title} {power} {days} {election} {gripe}
  //               {rumorSubject} {rumorKind} {winner} {office} {group}

  const POLITICAL_THOUGHTS = () => bank('ConvPolitics.stance');

  const ELECTION_THOUGHTS = () => bank('ConvPolitics.election');

  const POLITICAL_RUMOR_THOUGHTS = () => bank('ConvPolitics.rumor');

  const POLICY_GRUMBLES = () => bank('ConvPolitics.grumble');

  const OFFICE_HOLDER_THOUGHTS = () => bank('ConvPolitics.officeHolder');

  // Static political set-pieces mixed into the regular debate pool.
  const POLITICAL_DEBATE_SCRIPTS = () => bank('ConvPolitics.debate');


  // ---------------------------------------------------------------------------
  // I.8 WORLD-WEB SMALL TALK (facts from NPCWorldWeb, words from here)
  // ---------------------------------------------------------------------------
  // What the street says about the settlement's civic pulse (NPCWorldWeb):
  // crime waves, booms, busts, festivals, epidemics, headlines, the market,
  // and a player whose bounty precedes them.
  // Shared text → flavored by the speaker's PERSONALITY_VOICE on pick.

  const WORLD_THOUGHTS = () => bank('ConvWorld.topic');

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
  const MAX_ACTIVE           = 2;      // concurrent face-to-face conversations
  const START_DIST           = 2;      // tiles: close enough to stop and chat
  const AMBIENT_DIST         = 6;      // tiles: "same room" chatter range
  const PLAYER_RANGE         = 30;     // only converse near the player (visible flavour)
  // A town where everyone is always mid-sentence reads as noise rather than as
  // life, so a chat is a thing that happens now and then: the odds per scan are
  // low and the same two people leave a long gap before starting again.
  const PAIR_COOLDOWN_MIN    = 120;    // game minutes between same-pair chats
  const AMBIENT_COOLDOWN_MIN = 60;
  const START_CHANCE         = 0.07;   // per eligible pair per scan
  const AMBIENT_CHANCE       = 0.025;

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
    rel.opinion = Math.max(-60, Math.min(60, (rel.opinion ?? 0) + delta));
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
    if (Math.random() < debateChance) {
      const debate = _pickFrom(DEBATE_SCRIPTS());
      return { kind: 'debate', lines: debate.lines, agreement: debate.agreement };
    }
    const tone = _pickTone(profA, profB, aName, bName);
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

    _eligibleControllers(states) {
      const ctrls = $gameSystem?.getActiveNPCControllers?.() || [];
      return ctrls.filter(c =>
        c.event && !c.event._erased && !c.event.isTransparent() &&
        c.eventName && states.includes(c.state) &&
        !this._isBusyConversing(c.eventName) &&
        $gamePlayer &&
        Math.abs(c.event.x - $gamePlayer.x) + Math.abs(c.event.y - $gamePlayer.y) <= PLAYER_RANGE
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
        return _dispatch.call(this, controller, profile);
      };
      this._dispatcherPatched = true;
    },

    update() {
      if (!$gameMap || !$gameSystem) return;
      const now = performance.now();

      this._patchDispatcher();

      // Backwards so _step's self-removal (which rebuilds _active) can't skip entries
      for (let i = this._active.length - 1; i >= 0; i--) {
        const convo = this._active[i];
        if (convo) this._step(convo, now);
      }

      if (now >= this._nextScanAt) {
        this._nextScanAt = now + SCAN_MS;
        // A tactical fight freezes the world: nobody stops for a chat
        // (MapBattleMode.js). Running exchanges finish on their own.
        if (isTacticalFight()) return;
        this._scanFaceToFace();
        this._scanAmbient();
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
        kind: script.kind, agreement: script.agreement,
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

      this._active.push({
        kind: 'ambient', agreement: true,
        a, b, aName: a.eventName, bName: b.eventName,
        lines: _pickFrom(AMBIENT_SCRIPTS()), idx: 0,
        nextLineAt: performance.now() + 400,
        mapId: $gameMap.mapId(),
        spoken: [],
        faceToFace: false,
      });
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
      const text = applyVoice(
        _resolveLine(rawText, convo.aName, convo.bName, speakerPers),
        speakerPers, VOICE_CHANCE_DIALOGUE);

      if (convo.faceToFace) {
        a.turnToward?.(b.event);
        b.turnToward?.(a.event);
      }
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

      // An exchange that barely started leaves no trace
      if (convo.spoken.length < 2) return;

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
        // "met X" keeps the social-web/contacts UI fed (see _extractContacts)
        window.NPCSim?.StoryLogger?.record?.(aName, 'social', 'NPCSim.log.met', { name: bName });
        window.NPCSim?.StoryLogger?.record?.(bName, 'social', 'NPCSim.log.met', { name: aName });
      }
    },

    hideAll() {
      for (const convo of [...this._active]) this._end(convo, true);
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
      return line ? applyVoice(line, persName) : null;
    },
  };

  // ---------------------------------------------------------------------------
  // II.5 THOUGHT PROVIDER
  // ---------------------------------------------------------------------------
  // The single entry point NPCSimulationCore's ThoughtGenerator delegates to.
  // Mixes every solo-dialogue source by personality and situation:
  //   - familiar-with-player musings  (shared pool, voiced per personality)
  //   - situational weather/time      (situation × personality, own line each)
  //   - personalityCoreThoughts       (personality inner voice, fires at random)
  //   - need-based templates          (shared pool, voiced per personality)

  // The season the game is in, in the vocabulary the farming and weather
  // plugins already use, with the calendar variable as the fallback.
  const SEASON_MONTHS = { SPRING: [2, 3, 4], SUMMER: [5, 6, 7], AUTUMN: [8, 9, 10] };
  function _currentSeason() {
    try {
      if (typeof $gameWeather !== 'undefined' && $gameWeather?.getSeason) return $gameWeather.getSeason();
    } catch (_) {}
    const date = String($gameVariables?.value(113) || '01 JAN 2001 12:00').split(' ').filter(Boolean);
    const month = String(date[1] || 'JAN').toUpperCase();
    const en = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const it = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
    let m = en.indexOf(month);
    if (m === -1) m = it.indexOf(month);
    if (m === -1) m = 0;
    const found = Object.keys(SEASON_MONTHS).find(s => SEASON_MONTHS[s].includes(m));
    return found || 'WINTER';
  }

  const SituationalThoughts = {
    pick(profile) {
      const persName = _personalityNameOf(profile);
      // A quarter of the time they are thinking about the year rather than
      // about today's sky or this hour of the day.
      if (Math.random() < 0.25) {
        const pool = SEASON_THOUGHTS()[_currentSeason()];
        if (pool?.length) return vary(_pickFrom(pool), persName);
      }
      if (Math.random() < 0.5) {
        let type = 'clear';
        const w = ($gameScreen && ($gameScreen.weatherType?.() ?? $gameScreen._weatherType)) || 'none';
        if (w === 'rain' || w === 'storm' || w === 'snow') type = w;
        const pool = WEATHER_THOUGHTS()[type];
        return vary(_pickFrom((persName && pool[persName]) || pool.default), persName);
      }
      const hour = $gameVariables?.value(23) ?? 12;
      const tod  = hour >= 5 && hour < 12 ? 'morning'
                 : hour >= 12 && hour < 17 ? 'afternoon'
                 : hour >= 17 && hour < 21 ? 'evening' : 'night';
      const pool = TIME_THOUGHTS()[tod];
      return vary(_pickFrom((persName && pool[persName]) || pool.default), persName);
    },
  };

  // A craving speaks up before anything else does: an NPC who wants a cigarette
  // is not thinking about the weather. It only opens its mouth once the want is
  // real (CRAVING_SPEAKS_AT) and gets louder from there, so an addict in the
  // street is quiet most of the day and unmistakable near the end of a cycle.
  const CRAVING_SPEAKS_AT = 70;
  const CRAVING_WITHDRAWAL_AT = 95;

  const CravingProvider = {
    pick(profile) {
      const system = window.AddictionSystem;
      if (!system || !system.profileWorst) return null;
      let worst = null;
      try { worst = system.profileWorst(profile); } catch (_) { return null; }
      if (!worst || worst.value < CRAVING_SPEAKS_AT) return null;

      // How close they are to the end of their cycle is how likely they are to
      // say something about it, up to half the time when it is unbearable.
      const bite = (worst.value - CRAVING_SPEAKS_AT) / (100 - CRAVING_SPEAKS_AT);
      if (Math.random() > bite * 0.5) return null;

      const table = worst.value >= CRAVING_WITHDRAWAL_AT
        ? CRAVING_WITHDRAWAL_THOUGHTS() : CRAVING_THOUGHTS();
      const pool = table && table[worst.key];
      if (!pool || !pool.length) return null;
      return applyVoice(_pickFrom(pool), _personalityNameOf(profile));
    },
  };

  const ThoughtProvider = {
    get personalityCoreThoughts() { return PERSONALITY_CORE_THOUGHTS(); },

    pickThought(profile) {
      if (!profile) return null;
      // A body that wants something talks over everything else it might say.
      const craving = CravingProvider.pick(profile);
      if (craving) return craving;
      // Political life occasionally crowds out everything else, officeholders,
      // hot rumors and looming elections speak up via PoliticsProvider.
      if (Math.random() < 0.12) {
        const t = PoliticsProvider.pickPoliticalThought(profile);
        if (t) return t;
      }
      // So does the state of the world, crime waves, booms, plagues and
      // headlines from the world web speak up via WorldProvider.
      if (Math.random() < 0.12) {
        const t = WorldProvider.pickWorldThought(profile);
        if (t) return t;
      }
      // What is in the purse speaks up too, and says something different at
      // each end of the street.
      if (Math.random() < 0.10) {
        const t = this.pickWealthThought(profile);
        if (t) return t;
      }
      const r = Math.random();
      if ((profile.playerOpinion ?? 0) >= 20 && r < 0.12) {
        return applyVoice(_pickFrom(FAMILIAR_THOUGHTS()), _personalityNameOf(profile));
      }
      if (r < 0.28) {
        const t = SituationalThoughts.pick(profile);
        if (t) return t;
      }
      if (r < 0.46) {
        const t = this.pickPersonalityCoreThought(profile);
        if (t) return t;
      }
      return this.pickNeedThought(profile);
    },

    pickNeedThought(profile) {
      const pool = NEED_THOUGHTS()[profile?.currentNeed ?? null] || NEED_THOUGHTS()[null];
      return applyVoice(_pickFrom(pool), _personalityNameOf(profile));
    },

    // Tier 0-1 counts every coin, 2-3 has something put by, 4 and up has
    // stopped counting where anyone can see.
    pickWealthThought(profile) {
      const tier = profile?.wealthTierBase ?? null;
      if (tier === null) return null;
      const key = tier <= 1 ? 'poor' : tier <= 3 ? 'comfortable' : 'rich';
      const pool = WEALTH_THOUGHTS()[key];
      return pool?.length ? applyVoice(_pickFrom(pool), _personalityNameOf(profile)) : null;
    },

    pickPersonalityCoreThought(profile) {
      const name = _personalityOf(profile)?.name;
      const pool = name ? PERSONALITY_CORE_THOUGHTS()[name] : null;
      return pool?.length ? vary(_pickFrom(pool), name) : null;
    },

    // Crime narration with the coveted/stolen item's name baked in.
    // kind: 'intent' (wants to steal it) | 'success' (stole it) | 'caught'.
    crimeThought(profile, kind, itemName) {
      const pool = kind === 'intent'  ? CRIME_INTENT_THOUGHTS()
                 : kind === 'success' ? CRIME_SUCCESS_THOUGHTS()
                 : CRIME_CAUGHT_THOUGHTS();
      const line = _pickFrom(pool).replace(/{item}/g, itemName || 'that');
      return applyVoice(line, _personalityNameOf(profile));
    },

    // Opinion about a specific shop item, baked with its name. kind: 'buy'
    // (just purchased it) | 'browse' (a law-abiding customer eyeing it on
    // display). The reaction tracks the price tag (cheap vs. pricey) and is
    // tinted by the NPC's personality, both via applyVoice and an occasional
    // appended disposition line keyed off their traits/morality.
    itemThought(profile, itemData, kind = 'browse') {
      if (!itemData) return null;
      const name  = itemData.name || 'that';
      const price = Number(itemData.price) || 0;
      const tier  = price >= 400 ? 'pricey' : 'cheap';
      const table = kind === 'buy' ? ITEM_BUY_THOUGHTS() : ITEM_BROWSE_THOUGHTS();
      let line = _pickFrom(table[tier]).replace(/{item}/g, name);

      // Occasionally append a disposition aside that reflects who they are.
      const disp = this._shoppingDisposition(profile);
      if (disp && ITEM_DISPOSITION_THOUGHTS()[disp] && Math.random() < 0.5) {
        line += ' ' + _pickFrom(ITEM_DISPOSITION_THOUGHTS()[disp]);
      }
      return applyVoice(line, _personalityNameOf(profile));
    },

    // Maps an NPC's traits/wealth/morality onto one of the disposition pools.
    _shoppingDisposition(profile) {
      if (!profile) return null;
      const traitNames = (profile.traitIds || []).map(id => {
        const d = window._NPCSocietyDataLoader?.traits?.find(t => t.id === id);
        return (d?.name || '').toLowerCase();
      });
      const has = (kw) => traitNames.some(n => n.includes(kw));
      if (has('greed') || (profile.moralityScore ?? 0) < -30) return 'greedy';
      if (has('generous') || has('kind'))                     return 'generous';
      if (has('vain') || has('proud') || (profile.wealthTierBase ?? 0) >= 3) return 'vain';
      if (has('frugal') || has('thrift') || (profile.wealthTierBase ?? 0) <= 1) return 'frugal';
      return null;
    },

    // Reaction line after finishing a capability interaction (cooking, bank...).
    // Personality core thoughts occasionally bleed through here too, so even
    // these reactions vary by who's having them.
    pickCapabilityThought(profile, capabilityId) {
      const pool = CAPABILITY_THOUGHTS()[capabilityId];
      if (!pool) return null;
      if (Math.random() < 0.15) {
        const t = this.pickPersonalityCoreThought(profile);
        if (t) return t;
      }
      return applyVoice(_pickFrom(pool), _personalityNameOf(profile));
    },
  };

  // ---------------------------------------------------------------------------
  // II.6 THOUGHT BUBBLES (formerly NPCThoughtBubble.js)
  // ---------------------------------------------------------------------------
  // Whenever "npc:thought" fires (NPCSimulationCore's ThoughtGenerator, or a
  // conversation line above), a small parchment speech-bubble fades in above
  // that NPC's sprite, lingers briefly, then fades back out. The whole layer
  // is DOM-only; under the Node test harness ThoughtBubbleManager stays null.

  const BUBBLE_DISPLAY_MS  = 4000; // ms the bubble stays fully visible
  const BUBBLE_FADE_MS     = 800;  // ms of the fade-out transition
  const BUBBLE_MAX_ONSCREEN = 9;   // pooled bubble elements (one per chatty NPC)

  // Every bubble is its own DOM element pinned over the head of whoever is
  // speaking, so two people standing close together used to print one bubble on
  // top of the other and neither could be read. Rather than position blind, a
  // bubble claims the rectangle it wants from this arbiter once per frame; the
  // arbiter remembers what has already been claimed and slides a late claim
  // clear of the ones before it. Claims are keyed by the bubble that made them,
  // so re-claiming within the same frame just updates that bubble's rectangle.
  // Core/AutoIdleExplorer.js's party bubbles claim through the same registry
  // (window.NPCBubbleLayout), so party and town chatter never stack either.
  const BubbleLayout = (typeof document === 'undefined') ? null : (() => {
    const GAP_X = 8;        // page px of clear space kept between two bubbles
    const GAP_Y = 6;
    const SIDE_COST = 2.5;  // sideways displacement costs this much more than upward
    const MAX_PASSES = 12;  // give up rather than loop forever on a dense crowd

    let _frame = -1;
    let _claims = [];

    function _hits(l, t, w, h, r) {
      return l < r.right + GAP_X && l + w > r.left - GAP_X &&
             t < r.bottom + GAP_Y && t + h > r.top - GAP_Y;
    }

    function _free(key, l, t, w, h) {
      for (const r of _claims) if (r.key !== key && _hits(l, t, w, h, r)) return false;
      return true;
    }

    // Last resort for a crowd too thick to find a clean slot in: shove the rect
    // straight up out of everything it touches, then clamp back on screen.
    function _shoveUp(key, l, t, w, h) {
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let moved = false;
        for (const r of _claims) {
          if (r.key === key || !_hits(l, t, w, h, r)) continue;
          t = r.top - GAP_Y - h;
          moved = true;
        }
        if (!moved) break;
      }
      return t;
    }

    return {
      // Claim where a bubble wants to sit and get back where it may actually
      // sit, as { x, y }: x is its horizontal centre, y its top edge, both page
      // px, as are the caller's centerX/top/w/h. `bounds` (page px left/right/
      // top/bottom of the canvas) keeps a displaced bubble on screen.
      //
      // The natural spot wins whenever it is free. Otherwise the candidates are
      // the slots flush against the bubbles already claimed - directly above or
      // below one, or alongside one - and the cheapest free candidate wins,
      // counting sideways moves as dearer than vertical ones so a bubble stays
      // over its speaker's head where it can and only steps aside in a real
      // crush.
      place(key, centerX, top, w, h, bounds) {
        const frame = (typeof Graphics !== 'undefined') ? Graphics.frameCount : 0;
        if (frame !== _frame) { _frame = frame; _claims.length = 0; }
        else _claims = _claims.filter(r => r.key !== key);

        const b = bounds || {};
        const l0 = centerX - w / 2;
        let best = null;

        const consider = (l, t) => {
          if (b.top    != null && t < b.top)        return;
          if (b.bottom != null && t + h > b.bottom) return;
          if (b.left   != null && l < b.left)       return;
          if (b.right  != null && l + w > b.right)  return;
          const cost = Math.abs(t - top) + SIDE_COST * Math.abs(l - l0);
          if (best && cost >= best.cost) return;
          if (!_free(key, l, t, w, h)) return;
          best = { l, t, cost };
        };

        consider(l0, top);
        if (!best) {
          // Flush against one neighbour, still over the speaker horizontally
          for (const r of _claims) {
            if (r.key === key) continue;
            consider(l0, r.top - GAP_Y - h);
            consider(l0, r.bottom + GAP_Y);
            consider(r.left - GAP_X - w, top);
            consider(r.right + GAP_X, top);
          }
        }
        if (!best) {
          // Boxed in: every corner where one neighbour's column meets another's row
          for (const a of _claims) {
            if (a.key === key) continue;
            for (const c of _claims) {
              if (c.key === key || c === a) continue;
              consider(a.left - GAP_X - w, c.top - GAP_Y - h);
              consider(a.left - GAP_X - w, c.bottom + GAP_Y);
              consider(a.right + GAP_X,    c.top - GAP_Y - h);
              consider(a.right + GAP_X,    c.bottom + GAP_Y);
            }
          }
        }

        let l = best ? best.l : l0;
        let t = best ? best.t : _shoveUp(key, l0, top, w, h);
        if (!best) {
          if (b.top    != null) t = Math.max(t, b.top);
          if (b.bottom != null) t = Math.min(t, b.bottom - h);
        }
        _claims.push({ key, left: l, right: l + w, top: t, bottom: t + h });
        return { x: l + w / 2, y: t };
      },

      // Forget every claim, e.g. when the whole layer is torn down on a map change
      clear() { _claims.length = 0; },
    };
  })();
  if (BubbleLayout && typeof window !== 'undefined') window.NPCBubbleLayout = BubbleLayout;

  const ThoughtBubbleManager = (typeof document === 'undefined') ? null : (() => {

    // Screen-space helpers (mirrors MousePan's Window_EventHover projection).
    // getBoundingClientRect forces layout, so the result is memoized per frame
    // and shared by every bubble.
    let _scaleCache = null;
    let _scaleFrame = -1;
    function _msgGetScale() {
      if (_scaleCache && _scaleFrame === Graphics.frameCount) return _scaleCache;
      // Reading the canvas box forces a synchronous layout, and a dozen
      // overlays all want it on the same frame, so it is taken from the shared
      // frame budget (Core/ParchmentToast.js), which pays that once for all of
      // them. Reading it here is the fallback for when the budget is absent.
      let r = window.FrameBudget && window.FrameBudget.canvasRect();
      if (!r) {
        const el = document.getElementById('gameCanvas');
        if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
        r = el.getBoundingClientRect();
      }
      _scaleFrame = Graphics.frameCount;
      _scaleCache = { sx: r.width / Graphics.width, sy: r.height / Graphics.height, ox: r.left, oy: r.top };
      return _scaleCache;
    }

    function _tileScreenPos(ev) {
      // Reuse the character's own screen-projection (screenX is already the
      // sprite's horizontal center; screenY is its anchor near the feet) so the
      // bubble tracks exactly what's drawn, including any shift or jump a
      // movement plugin applies, instead of drifting from a separately
      // reimplemented tile-to-pixel formula. The camera zoom (MousePan.js) is
      // the one thing screenX/Y do not carry: the whole spriteset is scaled
      // about the zoom centre after the fact, so apply that same transform here.
      const x = ev.screenX();
      const y = ev.screenY() - $gameMap.tileHeight();
      const zoom = $gameScreen ? $gameScreen.zoomScale() : 1;
      if (!zoom || zoom === 1) return { x, y };
      const zx = $gameScreen.zoomX();
      const zy = $gameScreen.zoomY();
      return { x: zx + (x - zx) * zoom, y: zy + (y - zy) * zoom };
    }

    // One pooled HTML element with its own show/fade/release lifecycle
    class ThoughtBubble {
      constructor() {
        this.el = document.createElement('div');
        this.el.className = 'npc-thought-bubble';
        document.body.appendChild(this.el);
        this.npcName     = null;
        this._hideTimer  = null;
        this._killTimer  = null;
        this._ev         = null; // resolved Game_Event, cached per map
        this._evMapId    = 0;
        this._height     = 0;    // offsetHeight, re-read only when text changes
        this._width      = 0;    // offsetWidth, likewise; the layout arbiter needs both
        this._shownAt    = 0;
        this._lastLeft   = null;
        this._lastTop    = null;
        this._offscreen  = false;
      }

      show(npcName, text) {
        this._clearTimers();
        this.npcName = npcName;
        this.el.textContent = text;
        this.el.classList.remove('fading');
        this.el.style.display = 'block';
        // Force a reflow so the transition restarts cleanly when a bubble is reused mid-fade
        void this.el.offsetWidth;
        this.el.classList.add('visible');
        // Size only changes with the text, so measure once here instead of per frame
        this._height = this.el.offsetHeight || 32;
        this._width  = this.el.offsetWidth  || 0;
        this._shownAt = Date.now();
        this._lastLeft = null;
        this._lastTop  = null;

        this._hideTimer = setTimeout(() => this.fade(), BUBBLE_DISPLAY_MS);
      }

      fade() {
        if (!this.npcName) return;
        this.el.classList.remove('visible');
        this.el.classList.add('fading');
        this._killTimer = setTimeout(() => this.release(), BUBBLE_FADE_MS);
      }

      release() {
        this._clearTimers();
        this.npcName = null;
        this._ev = null;
        this.el.style.display = 'none';
        this.el.classList.remove('visible', 'fading');
        this._setOffscreen(false);
      }

      // A speaker who has walked off the edge of the canvas keeps their bubble,
      // it just stops being drawn: pinning it to the nearest edge instead would
      // put words in the air next to somebody who isn't there, and letting it
      // sit off-canvas would print it over the page around the game.
      _setOffscreen(off) {
        if (off === this._offscreen) return;
        this._offscreen = off;
        this.el.style.visibility = off ? 'hidden' : '';
      }

      _clearTimers() {
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        if (this._killTimer) { clearTimeout(this._killTimer); this._killTimer = null; }
      }

      destroy() {
        this._clearTimers();
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      }

      updatePosition(ev, sc) {
        if (!ev || !$gameMap) return;
        sc = sc || _msgGetScale();
        const pos = _tileScreenPos(ev);
        const h   = this._height || 32;
        const w   = this._width  || 0;
        // Off the canvas: hide it and claim nothing, so it neither shows up
        // stuck to an edge nor pushes the bubbles of the people still in view
        if (pos.x < 0 || pos.x > Graphics.width || pos.y < 0 || pos.y > Graphics.height) {
          this._setOffscreen(true);
          return;
        }
        this._setOffscreen(false);
        // left points to the NPC's horizontal center; CSS translateX(-50%) centers the bubble on it
        let left = Math.round(sc.ox + pos.x * sc.sx);
        // The bubble's own size is page px while the projection is canvas px, so
        // convert the anchor first and float the bubble above it from there.
        let top = Math.round(sc.oy + pos.y * sc.sy - h - 16 * sc.sy);
        if (BubbleLayout) {
          const slot = BubbleLayout.place(this, left, top, w, h, {
            left: sc.ox, right: sc.ox + Graphics.width * sc.sx,
            top: sc.oy,  bottom: sc.oy + Graphics.height * sc.sy,
          });
          left = Math.round(slot.x);
          top  = Math.round(slot.y);
        }
        if (left !== this._lastLeft) { this.el.style.left = left + 'px'; this._lastLeft = left; }
        if (top  !== this._lastTop)  { this.el.style.top  = top  + 'px'; this._lastTop  = top;  }
      }
    }

    // Routes "npc:thought" events to a small pool of bubbles and keeps them
    // tracking their NPC's sprite every frame
    return {
      _bubbles: [],
      _byName: new Map(),

      _acquire(npcName) {
        let bubble = this._bubbles.find(b => !b.npcName);
        if (!bubble && this._bubbles.length < BUBBLE_MAX_ONSCREEN) {
          bubble = new ThoughtBubble();
          this._bubbles.push(bubble);
        }
        if (!bubble) {
          // Every slot busy, recycle the longest-running one
          bubble = this._bubbles[0];
          if (bubble.npcName) this._byName.delete(bubble.npcName);
        }
        this._byName.set(npcName, bubble);
        return bubble;
      },

      queue(npcName, text) {
        if (!npcName || !text || !$gameMap) return;
        if (isTacticalFight()) return;
        // A non-sentient NPC (one of the creature classes, see NPCCreature) has
        // no sentences to think in. Whatever the simulation wrote for it is
        // heard the way an animal is heard, off the same growl bank every other
        // answer of its comes out of (NPCEmpathize.growlFor).
        const EM = window.NPCEmpathize;
        if (EM?.isNonSentientNPC?.(npcName)) text = EM.growlFor(text, npcName) || text;
        // Only worth showing if the NPC is actually on the current map
        const ev = $gameMap.events().find(e => (e.event()?.name || '') === npcName);
        if (!ev || ev.isTransparent()) return;
        if ($gamePlayer) {
          const dx = ev.x - $gamePlayer.x, dy = ev.y - $gamePlayer.y;
          if (Math.sqrt(dx * dx + dy * dy) > 64) return;
        }

        const bubble = this._byName.get(npcName) || this._acquire(npcName);
        bubble._ev = ev;
        bubble._evMapId = $gameMap.mapId();
        bubble.show(npcName, text);
        bubble.updatePosition(ev);
      },

      update() {
        if (!$gameMap) return;
        // Nothing on screen, nothing to place. This runs on every frame of
        // every map, and everything below it costs something worth not paying
        // for an empty screen: _msgGetScale reads the canvas box out of the
        // DOM, and the filter and the sort each allocate. A plain loop rather
        // than .some(), so the check itself allocates no closure either.
        let anyLive = false;
        for (let i = 0; i < this._bubbles.length; i++) {
          if (this._bubbles[i].npcName) { anyLive = true; break; }
        }
        if (!anyLive) return;

        const mapId = $gameMap.mapId();
        const sc = _msgGetScale();
        // Oldest first: whoever has been on screen longest keeps its spot and
        // later arrivals stack clear of it. Ordering by age rather than by
        // position means a bubble never hops as two NPCs walk past each other.
        const live = this._bubbles
          .filter(b => b.npcName)
          .sort((a, b) => a._shownAt - b._shownAt);
        for (const bubble of live) {
          let ev = bubble._ev;
          // Cached Game_Event is only valid on the map it was resolved on
          if (!ev || bubble._evMapId !== mapId) {
            ev = $gameMap.events().find(e => (e.event()?.name || '') === bubble.npcName) || null;
            bubble._ev = ev;
            bubble._evMapId = mapId;
          }
          if (!ev || ev.isTransparent()) {
            this._byName.delete(bubble.npcName);
            bubble.fade();
            continue;
          }
          bubble.updatePosition(ev, sc);
        }
      },

      hideAll() {
        for (const bubble of this._bubbles) bubble.release();
        this._byName.clear();
        if (BubbleLayout) BubbleLayout.clear();
      },
    };
  })();

  // NPCSimulationCore's ThoughtGenerator emits "npc:thought" (via its shared
  // _push helper) every time it records a scheduled or capability-reaction
  // thought onto profile.thoughts, that's our cue to pop a bubble.
  if (ThoughtBubbleManager) {
    const _tryRegister = () => {
      if (!window.NPCSim?.on) return false;
      window.NPCSim.on('npc:thought', ({ name, thought }) => {
        ThoughtBubbleManager.queue(name, thought);
      });
      return true;
    };
    if (!_tryRegister()) {
      let attempts = 0;
      const retry = setInterval(() => {
        if (_tryRegister()) { clearInterval(retry); return; }
        if (++attempts >= 60) {
          clearInterval(retry);
          console.warn('[NPCConversation] NPCSim never became available; thought-bubble events disabled.');
        }
      }, 500);
    }
  }

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

  window.NPCConversation = {
    ConversationManager,
    ConversationLog,
    SituationalThoughts,
    ThoughtProvider,
    CravingProvider,
    PoliticsProvider,
    WorldProvider,
    ThoughtBubbleManager, // null when running headless (Node test harness)
    BubbleLayout,         // ditto; also on window as NPCBubbleLayout
    // Full dialogue database, exposed for debugging / future tools
    // Read live, so the debug view follows a language switch too.
    get DialogueDB() {
      return {
        POSITIVE_SCRIPTS: POSITIVE_SCRIPTS(), NEGATIVE_SCRIPTS: NEGATIVE_SCRIPTS(),
        NEUTRAL_SCRIPTS: NEUTRAL_SCRIPTS(), DEBATE_SCRIPTS: DEBATE_SCRIPTS(),
        AMBIENT_SCRIPTS: AMBIENT_SCRIPTS(), NEED_THOUGHTS: NEED_THOUGHTS(),
        FAMILIAR_THOUGHTS: FAMILIAR_THOUGHTS(), CAPABILITY_THOUGHTS: CAPABILITY_THOUGHTS(),
        CRAVING_THOUGHTS: CRAVING_THOUGHTS(), CRAVING_WITHDRAWAL_THOUGHTS: CRAVING_WITHDRAWAL_THOUGHTS(),
        SEASON_THOUGHTS: SEASON_THOUGHTS(), WEALTH_THOUGHTS: WEALTH_THOUGHTS(),
        PERSONALITY_CORE_THOUGHTS: PERSONALITY_CORE_THOUGHTS(), WEATHER_THOUGHTS: WEATHER_THOUGHTS(),
        TIME_THOUGHTS: TIME_THOUGHTS(), POLITICAL_THOUGHTS: POLITICAL_THOUGHTS(),
        ELECTION_THOUGHTS: ELECTION_THOUGHTS(), POLITICAL_RUMOR_THOUGHTS: POLITICAL_RUMOR_THOUGHTS(),
        POLICY_GRUMBLES: POLICY_GRUMBLES(), OFFICE_HOLDER_THOUGHTS: OFFICE_HOLDER_THOUGHTS(),
        POLITICAL_DEBATE_SCRIPTS: POLITICAL_DEBATE_SCRIPTS(), WORLD_THOUGHTS: WORLD_THOUGHTS(),
        PERSONALITY_VOICES: PERSONALITY_VOICES(),
        PERSONALITY_TONE_BIAS, PERSONALITY_DEBATE_AFFINITY,
      };
    },
    get personalityCoreThoughts() { return PERSONALITY_CORE_THOUGHTS(); },
    applyVoice,
    // The script builder and its {a}/{b} resolver, shared so a conversation the
    // PLAYER walks into (DialogueSystem's Rumors command) is drawn from exactly
    // the same tone-weighted pools two NPCs meeting in the street draw from.
    buildScript: _buildScript,
    resolveLine: _resolveLine,
    _personalityNameOf,
    vary,
  };

  console.log('[NPCConversation] v2.3.0 loaded, NPC↔NPC dialogues & thought bubbles active.');
})();
