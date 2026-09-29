/*:
 * @target MZ
 * @plugindesc NPC Conversation: the public window.NPCConversation API
 * @author Omni-Lex
 * @base NPCConversation
 * @orderAfter NPCConversation
 * @orderAfter NPCConversation_Thoughts
 * @help
 * ============================================================================
 * NPCConversation_Api, part of the NPCConversation family
 * ============================================================================
 * Owns the public window.NPCConversation table (II.7 globals), filled onto
 * the object the entry creates. Loads last: it binds the late names every
 * module reads once the family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCConversation._internal and publishes its own there. Load it right after
 * NPCConversation_Thoughts.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _buildScript, _personalityNameOf, _resolveLine, AddictionThoughts, AMBIENT_SCRIPTS, applyVoice, CareThoughts,
    BubbleLayout, CAPABILITY_THOUGHTS, ConversationLog, ConversationManager, CRAVING_THOUGHTS,
    CRAVING_WITHDRAWAL_THOUGHTS, CravingProvider, CreedVoice, DEBATE_SCRIPTS, ELECTION_THOUGHTS,
    ElectionClock, FAMILIAR_THOUGHTS, LIFE_SCRIPT_TOPICS, LIFE_TOPICS, LifeContext, LifeTalk,
    NEED_THOUGHTS, NEGATIVE_SCRIPTS, NEUTRAL_SCRIPTS, OFFICE_HOLDER_THOUGHTS,
    PERSONALITY_CORE_THOUGHTS, PERSONALITY_DEBATE_AFFINITY, PERSONALITY_TONE_BIAS,
    PERSONALITY_VOICES, POLICY_GRUMBLES, POLITICAL_DEBATE_SCRIPTS, POLITICAL_RUMOR_THOUGHTS,
    POLITICAL_THOUGHTS, PoliticsProvider, POSITIVE_SCRIPTS, SEASON_THOUGHTS, SituationalThoughts, SpecTalk,
    ThoughtBubbleManager, ThoughtProvider, TIME_THOUGHTS, vary, WEALTH_THOUGHTS, WEATHER_THOUGHTS,
    WORLD_THOUGHTS, WorldFacts, WorldProvider,
  } = window.NPCConversation._internal;


  Object.defineProperties(window.NPCConversation, Object.getOwnPropertyDescriptors({
    ConversationManager,
    ConversationLog,
    SituationalThoughts,
    ThoughtProvider,
    CravingProvider,
    AddictionThoughts,    // buying, using, withdrawal, relief, the gambler's evening
    CareThoughts,         // at a hive or a barrel (NPCSim.Tending)
    SpecTalk,             // II.10 boasting, talking and asking about a specialization
    LifeTalk,            // II.8 context-driven topics
    LifeContext,
    LIFE_TOPICS, LIFE_SCRIPT_TOPICS,
    ElectionClock,
    WorldFacts,
    CreedVoice,           // II.9 ideology families and special creeds
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
  }));

  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCConversation._internal._late) bind();

  console.log('[NPCConversation] v2.3.0 loaded, NPC↔NPC dialogues & thought bubbles active.');
})();
