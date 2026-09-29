/*:
 * @target MZ
 * @plugindesc NPC Empathize: the public window.NPCEmpathize API
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @orderAfter NPCEmpathize_Wiki
 * @help
 * ============================================================================
 * NPCEmpathize_Api, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 9, GLOBALS: the public window.NPCEmpathize table, _helpers
 * and _getT included, filled onto the object the entry creates. Loads last
 * of the main modules: it binds the late names every module reads once the
 * family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathize_Wiki.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _addNpcAttraction, _addNpcOpinion, _addPairBond, _animalJoinChance, _bubbaContext, _bubbaDb,
    _bubbaPlaythrough, _bubbaSeedFirstImpression, _bustNameFromEvent, _bustUrl,
    _computePartyAttraction, _computePartyPredisposition, _countRecentInteractions,
    _creatureClassOfActor, _creatureClassOfNpc, _diseaseVialId, _diseaseVialItems, _emContext,
    _emOpinionJitter, _emPlaythrough, _emSeedFirstImpression, _emStanceData, _emStanceKey,
    _emVoiceLine, _eventCommentLines, _extractClassId, _extractContacts, _feedCalories,
    _feedItemsInPack, _feedKind, _feedOpinion, _feralBand, _feralCanGift, _feralGrowlFor,
    _feralKind, _feralNoise, _findEventByName, _forceHighJoinChance, _gainSocialFromCompany,
    _generatePartyThoughts, _genJoke, _getNPCName, _getProfile, _getT, _hasJoinPartyCommand,
    _hasSelfSwitchAPage, _hygienePenalty, _hygieneReadout, _infectChance, _isBubbaActor,
    _isBubbaNpc, _isEmActor, _isEmLocalNpc, _isEmNpc, _isNonSentientActor, _isNonSentientNpc,
    _isStoryNpc, _joinChance, _joinLevelOk, _lastInteractionDay, _llmCharacterSheet, _llmLifeFor,
    _llmPartyLine, _llmRelationLine, _llmSafe, _llmTopicsLine, _llmWhereabouts, _llmWorldLine,
    _medianScore, _navigateInPlace, _npcBaseAttraction, _npcBaseOpinion, _npcEffectiveAttraction,
    _npcEffectiveOpinion, _pairBond, _pairContext, _pairData, _pairSide, _pairSituationKeys,
    _pairSituationLine, _partyMedianLevel, _payFun, _personalitySocialMult, _presetFromEvent,
    _pushReturnContext, _rand, _recruitAnimalAsMember, _recruitAnimalAsPet, _resolveBustForActor,
    _resolveBustPath, _resolveMarkovDb, _setNpcBaseAttraction, _setNpcBaseOpinion, _socialLines,
    _stanceToneMult, _traitCompatBonus, _travellingPartyCount, _wisMod, BUBBA_NAME, EM_NAME,
    FERAL_ACTIONS, FUN_ACTIONS, PET_OPINION, Scene_NPCEmpathize, SPOKEN_LOG_MAX,
    STORY_PROTECTED_ACTIONS, vary, Wiki,
  } = window.NPCEmpathize._internal;

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

  Object.defineProperties(window.NPCEmpathize, Object.getOwnPropertyDescriptors({
    // Everything a language model needs to know about a conversation before it
    // writes a line of one: who is being talked to, who is doing the talking,
    // and where the two of them stand with each other. The Empathize panel
    // builds this for itself; this is the same thing for everybody else, and
    // it is what MarkovTextGenerator's message-box path feeds the model.
    //
    // `target` is an event id, an event name or an NPC name. The speaker is the
    // party leader unless an actor is named. A non-sentient subject answers in
    // the voice of its class and is never handed to a model, so it comes back
    // as null (window.NPCCreature owns that boundary).
    conversationContext(target, speakerActor) {
      let npcName = '';
      if (typeof target === 'number') npcName = _getNPCName(target);
      else if (typeof target === 'string') {
        const ev = _findEventByName(target);
        npcName = ev ? _getNPCName(ev.eventId()) || target : target;
      }
      if (!npcName) return null;
      if (_isNonSentientNpc(npcName)) return null;
      const profile = _getProfile(npcName);
      const actor   = speakerActor || $gameParty?.leader() || null;
      if (actor && _isNonSentientActor(actor)) return null;
      return {
        npcName:      npcName,
        npcSheet:     _llmCharacterSheet(profile, null),
        speakerName:  actor ? actor.name() : '',
        speakerSheet: actor ? _llmCharacterSheet(_getProfile(actor.name()), actor) : '',
        relation:     (profile && actor)
          ? _llmRelationLine(profile, actor, _npcEffectiveOpinion(profile, actor))
          : '',
        npcLife:      _llmLifeFor(npcName, profile, false),
        party:        _llmPartyLine(profile, actor),
        world:        _llmWorldLine(),
      };
    },

    // Whatever a typed line named, as this world has it rather than as our own
    // history does. Read by the messenger window, which is the other place in
    // the game somebody types a sentence at a person.
    worldTopics(phrase) { return _llmSafe(() => _llmTopicsLine(phrase)); },

    // The same thing for one of the party's own, travelling or benched: who
    // they are, what they have been through with the party, and where they
    // are right now, which for a benched companion is somewhere else entirely.
    // This is what the messenger window talks to.
    companionContext(name, actorOrId) {
      const who = String(name || '').trim();
      if (!who) return null;
      const actor = typeof actorOrId === 'number'
        ? $gameActors?.actor(actorOrId)
        : (actorOrId || ($gameParty?.members?.() || []).find(a => a && a.name() === who) || null);
      if (actor && _isNonSentientActor(actor)) return null;
      const profile = _getProfile(who);
      const leader = $gameParty?.leader?.() || null;
      return {
        npcName:      who,
        npcSheet:     _llmCharacterSheet(profile, actor),
        speakerName:  leader ? leader.name() : '',
        speakerSheet: leader ? _llmCharacterSheet(_getProfile(leader.name()), leader) : '',
        npcLife:      _llmLifeFor(who, profile, true),
        whereabouts:  _llmWhereabouts(who),
        world:        _llmWorldLine(),
      };
    },
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
    // A wiki opened off a party member is anchored to THAT member, so the
    // left panel is reading whoever the page was opened about rather than
    // always the leader; nothing passed falls back to the leader as before.
    openWiki(category = null, actorId = null) {
      Scene_NPCEmpathize._eventId = null;
      Scene_NPCEmpathize._actorId = actorId ?? $gameParty?.leader()?.actorId() ?? 1;
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
      _forceHighJoinChance, _joinChance, _joinLevelOk, _partyMedianLevel,
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
      _isEmLocalNpc, _emOpinionJitter,
      // Every line Em herself speaks in the panel comes out of here.
      _emVoiceLine,
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
      // Which class voice a beast answers in, so anything staging a creature's
      // reply outside the panel (Farming/AnimalGrowthSystem's petting exchange)
      // draws its noise from the same bank the panel does.
      _creatureClassOfNpc, _creatureClassOfActor,
      // Petting and feeding: the UI layer builds the beast action row and the
      // feeding tray out of these.
      _feedKind, _feedCalories, _feedOpinion, _feedItemsInPack, PET_OPINION,
    },
    _getT,
  }));

  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCEmpathize._internal._late) bind();

  console.log('[NPCEmpathize] v3.0.0 loaded.');
})();
