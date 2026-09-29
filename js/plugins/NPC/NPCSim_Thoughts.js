/*:
 * @target MZ
 * @plugindesc NPC Simulation: thoughts, story log and social log
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Economy
 * @help
 * ============================================================================
 * NPCSim_Thoughts, part of the NPCSimulationCore family
 * ============================================================================
 * Owns ThoughtGenerator (SECTION 10), StoryLogger (SECTION 11) and
 * SocialLogger (SECTION 10b).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Economy.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    EventBus,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 10, THOUGHT GENERATOR
  // ============================================================================

  // Dialogue pools (need templates, familiar-player musings, capability
  // reactions, situational weather/time and personality thoughts) all live in
  // NPCConversation.js, ThoughtProvider mixes them by personality and
  // situation. The generator here only owns the push/event mechanics.

  const ThoughtGenerator = {
    _push(profile, thought) {
      profile.thoughts = profile.thoughts || [];
      profile.thoughts.unshift(thought);
      if (profile.thoughts.length > 5) profile.thoughts.pop();
      // Lets UI layers (e.g. NPCConversation's thought bubbles) react the instant a fresh
      // thought lands, instead of polling profile.thoughts every frame.
      if (profile._eventName) EventBus.emit("npc:thought", { name: profile._eventName, thought });
    },

    // `prompted` is somebody having just spoken to this NPC, whether the
    // player or another NPC. A beast thinks nothing anybody could write down
    // and does not muse to itself on the weather, so the ambient cadence in
    // SECTION 12 passes it by entirely; it only ever has something to think
    // because something addressed it. Everybody else thinks either way.
    generate(profile, prompted) {
      if (!profile) return;
      const NC = window.NPCCreature;
      if (!prompted && NC?.isNonSentientProfile?.(profile) &&
          !NC.isPlayerCharacterName(profile._eventName)) return;
      const thought = window.NPCConversation?.ThoughtProvider?.pickThought?.(profile) ?? "...";
      this._push(profile, thought);
    },

    narrateCapability(name, capabilityId) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile) return;
      // A beast narrates no errand in prose (NPCCreature).
      if (window.NPCCreature?.isHeldToBeastRules?.(profile, name)) return;
      const thought = window.NPCConversation?.ThoughtProvider?.pickCapabilityThought?.(profile, capabilityId);
      if (thought) this._push(profile, thought);
    },

    // SECTION 10a, LIFE MOMENTS: something just happened to them (a leave
    // began, a monster put them on the ground, a shift ended) and they say so
    // at once rather than waiting for the next cadence tick. The words, and
    // the topic's condition, live in NPCConversation (II.8 LIFE TALK).
    narrateLife(name, topicKey, chance = 1) {
      if (Math.random() >= chance) return;
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile) return;
      if (window.NPCCreature?.isHeldToBeastRules?.(profile, name)) return;
      const thought = window.NPCConversation?.LifeTalk?.pickTopicThought?.(profile, topicKey);
      if (thought) this._push(profile, thought);
    },
  };

  EventBus.on("npc:capability_end", ({ name, capabilityId }) => ThoughtGenerator.narrateCapability(name, capabilityId));
  EventBus.on("npc:leave_start", ({ name, kind }) =>
    ThoughtGenerator.narrateLife(name, kind === "parental" ? "familyParentalLeave" : "workSick")); // i18n-ignore: leave kind id, ConvLife pool keys
  EventBus.on("npc:downed", ({ name }) => ThoughtGenerator.narrateLife(name, "fightDowned")); // i18n-ignore: ConvLife pool key
  EventBus.on("npc:shift_end", ({ name }) => ThoughtGenerator.narrateLife(name, "workAfterShift", 0.2)); // i18n-ignore: ConvLife pool key

  // ============================================================================
  // SECTION 11, STORY LOGGER
  // ============================================================================

  const StoryLogger = {
    // The log is saved with the world, so only the key and its values are
    // stored and the sentence is written out by textOf() when it is read.
    record(npcName, tag, key, params) {
      if (!$gameSystem?._npcSociety) return;
      const profile = $gameSystem._npcSociety[npcName];
      if (!profile) return;
      profile.eventLog = profile.eventLog || [];
      const minute = $gameVariables ? $gameVariables.value(114) : 0;
      profile.eventLog.unshift({ minute, tag, key, params });
      if (profile.eventLog.length > 30) profile.eventLog.pop();
    },

    // A log entry as a sentence. Entries written before the log was keyed hold
    // a finished English string, which is returned as it stands.
    textOf(entry) {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      if (!entry.key || !T.has(entry.key)) return entry.desc || '';
      const params = entry.params || {};
      // A shift logs the job's i18n key ("jobs.12.name"), the way Jobs.json
      // names it, so the entry reads in whichever language it is opened in.
      if (typeof params.job === 'string' && T.has(params.job)) {
        return T(entry.key, Object.assign({}, params, { job: T(params.job) }));
      }
      // A minigame round logs the game's i18n key (SECTION 9d).
      if (typeof params.game === 'string' && T.has(params.game)) {
        return T(entry.key, Object.assign({}, params, { game: T(params.game) }));
      }
      // A tier-up logs the specialization's id and the tier reached; both are
      // named in the language the entry is read in (SpecializationMenu.js).
      if (params.specId != null && window.Specializations) {
        const S = window.Specializations;
        return T(entry.key, Object.assign({}, params, {
          spec: S.displayName(Number(params.specId)) || String(params.specId),
          level: S.levelName(Number(params.tier) || 1),
        }));
      }
      return T(entry.key, params);
    },

    generateNarrative(npcName) {
      const profile = $gameSystem?._npcSociety?.[npcName];
      if (!profile || !profile.eventLog?.length) return T('NPCSim.narrative.noHistory', { name: npcName });

      // Group the raw entries, not their rendered text: the summary lines below
      // read values off the entry (who was met, how many shifts) rather than
      // matching English words in a sentence that may not be English.
      const grouped = {};
      for (const entry of profile.eventLog) {
        (grouped[entry.tag] = grouped[entry.tag] || []).push(entry);
      }
      const say = (entry) => this.textOf(entry);

      const sentences = [];

      // Work history
      if (grouped.work?.length) {
        const count = grouped.work.length;
        sentences.push(count === 1
          ? say(grouped.work[0])
          : T('NPCSim.narrative.workShifts', { count: count, last: say(grouped.work[0]) }));
      }

      // Farming
      if (grouped.farm?.length) {
        sentences.push(grouped.farm.length > 2 ? T('NPCSim.narrative.tendsCrops') : say(grouped.farm[0]));
      }

      // Social encounters
      if (grouped.social?.length) {
        const met = [...new Set(grouped.social.map(e => e.params?.name).filter(Boolean))];
        if (met.length === 1) sentences.push(T('NPCSim.narrative.hasMet', { name: met[0] }));
        else if (met.length > 1) {
          sentences.push(T('NPCSim.narrative.acquainted', {
            names: met.slice(0, 2).join(' ' + T('NPCSim.narrative.and') + ' '),
          }));
        }
      }

      // Shopping
      if (grouped.shopping?.length) sentences.push(say(grouped.shopping[0]));

      // Wealth change
      if (grouped.wealth?.length) sentences.push(say(grouped.wealth[0]));

      // Everyday capability use (§7 item 5, extends the tags vocabulary
      // beyond work/farm/social/shopping/theft to the new registry-backed
      // interactions)
      if (grouped.cooking?.length)    sentences.push(grouped.cooking.length > 2 ? T('NPCSim.narrative.cooksRegularly') : say(grouped.cooking[0]));
      if (grouped.renting?.length)    sentences.push(grouped.renting.length > 1 ? T('NPCSim.narrative.rentsSometimes') : say(grouped.renting[0]));
      if (grouped.beekeeping?.length) sentences.push(grouped.beekeeping.length > 1 ? T('NPCSim.narrative.keepsBees') : say(grouped.beekeeping[0]));
      if (grouped.banking?.length)    sentences.push(say(grouped.banking[0]));
      if (grouped.realty?.length)     sentences.push(grouped.realty.length > 1 ? T('NPCSim.narrative.livesOffRent') : say(grouped.realty[0]));
      if (grouped.investing?.length)  sentences.push(grouped.investing.length > 1 ? T('NPCSim.narrative.dabblesStocks') : say(grouped.investing[0]));

      // Crime
      if (grouped.theft_success?.length) sentences.push(say(grouped.theft_success[0]));
      if (grouped.theft_caught?.length)  sentences.push(T('NPCSim.narrative.wasCaught', { what: say(grouped.theft_caught[0]) }));

      // Player relationship
      const opinion = profile.playerOpinion ?? 0;
      if (opinion >= 60)      sentences.push(T('NPCSim.narrative.familiarFace'));
      else if (opinion >= 20) sentences.push(T('NPCSim.narrative.spokenBefore'));

      return sentences.length
        ? T('NPCSim.narrative.summary', { name: npcName, list: sentences.join('; ') })
        : T('NPCSim.narrative.quiet', { name: npcName });
    },

    feedHistorySimulator() {
      if (!window.HistoryManager?.addMinorEvent) return;
      const society = $gameSystem?._npcSociety;
      if (!society) return;
      for (const [name, profile] of Object.entries(society)) {
        if (!profile.eventLog?.length) continue;
        const latest = profile.eventLog[0];
        if (!latest) continue;
        // Dedup: only feed an NPC's latest event once. Without a last-fed
        // marker the unchanged eventLog[0] is re-pushed every interval,
        // churning older real events out of the bounded HistorySimulator log.
        const latestText = this.textOf(latest);
        const marker = `${latest.date ?? ""}|${latest.key ?? latest.desc ?? ""}|${JSON.stringify(latest.params ?? null)}`;
        if (profile._lastFedEvent === marker) continue;
        profile._lastFedEvent = marker;
        try {
          window.HistoryManager.addMinorEvent({
            date: $gameVariables ? $gameVariables.value(113) : T('NPCSim.unknownDate'),
            actor: name,
            desc: latestText,
          });
        } catch (_) {}
      }
    },
  };

  // ============================================================================
  // SECTION 10b, SOCIAL LOGGER
  // ============================================================================
  // Detects when two on-map NPCs are adjacent in a social zone and records the meeting.
  // This drives the HistorySimulator "allied" entries and mild opinion shifts.

  const SocialLogger = {
    // Track pairs already logged this session to avoid spam
    _recentPairs: new Set(),

    scanMeetings(controllers, society) {
      if (!$gameMap) return;
      const socialZone = 101;

      const socialNPCs = controllers.filter(c =>
        c.state === "socializing" || c.state === "inZone"
      );

      for (let i = 0; i < socialNPCs.length; i++) {
        for (let j = i + 1; j < socialNPCs.length; j++) {
          const a = socialNPCs[i];
          const b = socialNPCs[j];
          if (!a.event || !b.event) continue;
          const dist = Math.abs(a.event.x - b.event.x) + Math.abs(a.event.y - b.event.y);
          if (dist > 3) continue;

          const pairKey = a.eventName < b.eventName ? `${a.eventName}|${b.eventName}` : `${b.eventName}|${a.eventName}`;
          if (this._recentPairs.has(pairKey)) continue;
          this._recentPairs.add(pairKey);

          // Clean old pairs every 100 meetings
          if (this._recentPairs.size > 100) this._recentPairs.clear();

          // Record the encounter in both story logs
          StoryLogger.record(a.eventName, "social", `met ${b.eventName}`);
          StoryLogger.record(b.eventName, "social", `met ${a.eventName}`);

          // Mild faction bridge: if both have factions, record as diplomatic contact
          const pa = society[a.eventName];
          const pb = society[b.eventName];
          if (pa?.factionIndex >= 0 && pb?.factionIndex >= 0 &&
              pa.factionIndex !== pb.factionIndex && $gameFactions?.changeReputation) {
            try {
              $gameFactions.changeReputation(pa.factionIndex,  1);
              $gameFactions.changeReputation(pb.factionIndex,  1);
            } catch (_) {}
          }
        }
      }
    },
  };

  Object.assign(NPCSim._internal, {
    SocialLogger, StoryLogger, ThoughtGenerator,
  });
})();
