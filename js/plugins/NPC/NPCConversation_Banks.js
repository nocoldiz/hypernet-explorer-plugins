/*:
 * @target MZ
 * @plugindesc NPC Conversation: PART I, every word an NPC can say (lazy views on the i18n banks)
 * @author Omni-Lex
 * @base NPCConversation
 * @orderAfter NPCConversation
 * @help
 * ============================================================================
 * NPCConversation_Banks, part of the NPCConversation family
 * ============================================================================
 * Owns PART I, DIALOGUE DATA (I.1 to I.10): the lazy bank views onto
 * js/i18n/<lang>/conversations/*.json and the non-verbal tuning tables.
 * Published on NPCConversation._internal for the engine modules.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCConversation._internal and publishes its own there. Load it right after
 * NPCConversation.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";


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
  //   I.9  Life talk                  (family, work, travel, war, Horde, elections)
  //   I.10 Creed frames               (ideology families and special creeds)
  //   I.11 Specialization talk         (boasts, talk, questions and answers)
  //
  //  PART II, ENGINE (logic only; no dialogue text below the PART II banner)
  //   II.1 Personality lookup & voice application
  //   II.2 Conversation log            II.5 Thought provider
  //   II.3 Conversation manager        II.6 Thought bubbles
  //   II.4 Politics & world providers  II.7 Scene hooks & globals
  //   II.8 Life talk (context topics)  II.9 Creed voice (inside II.8's block)
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
  // The moments of a habit NPCSim.Addictions acts out: buying a fix, using
  // it, coming out of withdrawal (keyed by substance), and a gambler's
  // evening (gamble: casino, bet, won, lost, chase, broke).
  const ADDICTION_THOUGHTS = () => bank('ConvThoughts.addiction');
  // In the water and on its bank (NPCSim.Water): swim.<reason>, swimming,
  // fish.<cast|wait|catch|release|nothing>, and talk (swimmers side by side).
  const WATER_THOUGHTS = () => bank('ConvThoughts.water');

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

  // ---------------------------------------------------------------------------
  // I.9 LIFE TALK (family, work, travel, wars, the Horde, elections, fights)
  // ---------------------------------------------------------------------------
  // js/i18n/<lang>/conversations/ConvLife.json. Every pool is keyed by topic
  // and is only ever reached when that topic's condition holds for the
  // speaker (LIFE_TOPICS, II.8): a thought about a newborn needs a newborn.
  // Placeholders ({partner} {child} {enemy} {party}...) are filled from the
  // speaker's life record before the {a|b} alternation is resolved.
  const LIFE_THOUGHTS   = () => bank('ConvLife.thought') || {};
  const LIFE_SCRIPTS    = () => bank('ConvLife.script') || {};
  const LIFE_AMBIENT    = () => bank('ConvLife.ambient') || {};
  const LIFE_MENTIONS   = () => bank('ConvLife.mention') || {};
  const LIFE_GREET_KIN  = () => bank('ConvLife.greetKin') || {};
  const LIFE_FALLBACK   = () => bank('ConvLife.fallback') || {};

  // ---------------------------------------------------------------------------
  // I.10 CREED FRAMES (ideology families and a few special creeds)
  // ---------------------------------------------------------------------------
  // js/i18n/<lang>/conversations/ConvCreed.json. One bank per ideology FAMILY
  // (CreedVoice.ideologyFamily folds the 238 creeds into them by their axes),
  // and a special bank for a handful of creeds too distinctive to fold.
  const CREED_FAMILY_BANKS  = () => bank('ConvCreed.family') || {};
  const CREED_SPECIAL_BANKS = () => bank('ConvCreed.special') || {};

  // ---------------------------------------------------------------------------
  // I.11 SPECIALIZATION TALK (boasts, talk, questions and answers)
  // ---------------------------------------------------------------------------
  // js/i18n/<lang>/conversations/ConvSkills.json. Keyed by voice group (SpecTalk,
  // II.10): talk.<group> for somebody good at a specialization, weapon.<type>.
  // <group> for the weapon proficiencies, question.<group> and answer.<group>
  // for the two beats a less trained person and an expert trade. {spec} is the
  // specialization's name as the player reads it, {level} its tier.
  const SPEC_TALK = () => bank('ConvSkills') || {};

  Object.assign(window.NPCConversation._internal, {
    ADDICTION_THOUGHTS, AMBIENT_SCRIPTS, bank, CAPABILITY_THOUGHTS, CRAVING_THOUGHTS,
    CRAVING_WITHDRAWAL_THOUGHTS, CREED_FAMILY_BANKS, CREED_SPECIAL_BANKS, CRIME_CAUGHT_THOUGHTS,
    CRIME_INTENT_THOUGHTS, CRIME_SUCCESS_THOUGHTS, DEBATE_SCRIPTS, ELECTION_THOUGHTS,
    FAMILIAR_THOUGHTS, ITEM_BROWSE_THOUGHTS, ITEM_BUY_THOUGHTS, ITEM_DISPOSITION_THOUGHTS,
    LIFE_AMBIENT, LIFE_FALLBACK, LIFE_GREET_KIN, LIFE_MENTIONS, LIFE_SCRIPTS, LIFE_THOUGHTS,
    NEED_THOUGHTS, NEGATIVE_SCRIPTS, NEUTRAL_SCRIPTS, OFFICE_HOLDER_THOUGHTS,
    PERSONALITY_CORE_THOUGHTS, PERSONALITY_DEBATE_AFFINITY, PERSONALITY_TONE_BIAS,
    PERSONALITY_VOICES, POLICY_GRUMBLES, POLITICAL_DEBATE_SCRIPTS, POLITICAL_RUMOR_THOUGHTS,
    POLITICAL_THOUGHTS, POSITIVE_SCRIPTS, SEASON_THOUGHTS, SPEC_TALK, TIME_THOUGHTS, WEALTH_THOUGHTS,
    WATER_THOUGHTS, WEATHER_THOUGHTS, WORLD_THOUGHTS,
  });
})();
