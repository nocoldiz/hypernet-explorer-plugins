/*:
 * @target MZ
 * @plugindesc NPC Empathize: the Scene_NPCEmpathize class
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @orderAfter NPCEmpathize_Predisposition
 * @help
 * ============================================================================
 * NPCEmpathize_Scene, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 7, the Scene_NPCEmpathize class the UI layer (NPCEmpathizeUI)
 * draws on.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathize_Predisposition.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _addNpcOpinion, _addPairBond, _animalJoinChance, _bubbaContext, _bubbaSeedFirstImpression,
    _buildBattleFace, _buildNpcProxy, _cardRefusalLine, _chatOpinionShift, _countRecentInteractions,
    _creatureClassOfActor, _creatureClassOfNpc, _diseaseVialId, _diseaseVialItems, _emContext,
    _emPlaythrough, _emSeedFirstImpression, _emVoiceLine, _extractClassId, _feedItemsInPack,
    _feedNourishment, _feedOpinion, _feralCanGift, _feralGrowlFor, _feralKind, _feralLine,
    _feralNoise, _gainSocialFromCompany, _gainSocialFromOpinion, _genJoke, _getNPCName, _getProfile,
    _getT, _infectChance, _isBubbaActor, _isNonSentientActor, _isNonSentientNpc, _isStoryNpc,
    _joinChance, _joinLevelOk, _llmCharacterSheet, _llmLifeFor, _llmPartyLine, _llmRelationLine,
    _llmSafe, _llmTopicsLine, _llmWorldLine, _npcBaseOpinion, _npcEffectiveAttraction,
    _npcEffectiveOpinion, _npcProxyTroopId, _pairBond, _pairContext, _pairSituationLine, _payFun,
    _personalityName, _personalitySocialMult, _presetFromEvent, _rand, _recruitAnimalAsMember,
    _recruitAnimalAsPet, _recruitNpcAsFollower, _resolveMarkovDb, _setNpcBaseOpinion, _socialById,
    _socialLines, _stanceToneMult, _stripSeedEcho, _traitCompatBonus, _travellingPartyCount,
    _vanishRecruitedEvent, _wisMod, CARD_REFUSE_OPINION, COMPANY_ACTIONS, FERAL_ACTION_IDS,
    FERAL_ACTIONS, NPC_ASSAULT_CRIME, NPCEmpathizeInputManager, PET_OPINION,
    STORY_PROTECTED_ACTIONS, vary,
  } = window.NPCEmpathize._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Wiki;
  window.NPCEmpathize._internal._late.push(() => ({ Wiki } = window.NPCEmpathize._internal));

  // ============================================================================
  // SECTION 7, SCENE_NPCEmpathize
  // ============================================================================

  // Everything on a tab other than the chat that a click can press, and so the
  // cursor has to be able to reach: the Wiki's cards, tiles and back chip, a
  // link to an article, the favourite star, a person on the Social Web (not
  // the one in the middle, who is the panel's own subject), a button on an
  // article and the rows of the More tab.
  // i18n-ignore-start: CSS selector
  const CONTENT_NAV_SELECTOR = [
    '.npc-wiki-card', '.npc-wiki-entry', '.npc-back-btn', '.npc-wiki-link',
    '.npc-wiki-fav', '.npc-web-node:not(.npc-web-node--center)',
    '.npc-chat-action-btn', '.npc-action-row',
  ].join(', ');
  // i18n-ignore-end

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
      this._introspectGenderMode = false;
      this._introspectOrientMode = false;
      this._introspectCreedMode  = false;
      this._nameModalOpen      = false;
      this._nameModalEl        = null;
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
        // A lesson pick's search strip: the keys that walk and close the
        // sheet go on to CCPick's own handler, everything else is typing.
        if (this._lessonPickOpen && ['Enter', 'Escape', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return; // i18n-ignore: DOM key names
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

    // Everything the party member says in this panel goes out through here, so
    // that a drink or a dose is heard in it: window.Intoxication.slur returns
    // the line exactly as it came in for anyone sober, and mangles it into the
    // register they are actually in for anyone who is not. Slurring at PUSH
    // time and not at render time is deliberate: what was said stays said, and
    // sobering up does not quietly tidy up the log afterwards.
    _pushPlayerLine(text) {
      const actor = this._focusActor();
      const said = window.Intoxication ? window.Intoxication.slur(text, actor) : text;
      this._chatHistory.push({ role: 'player', text: said });
      return said;
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

    // ── The topics board, from inside the panel ─────────────────────────────
    // Everything the two of them have to raise with each other lives on the Ask
    // board (DialogueSystem.js), which until now could only be reached by
    // turning round to Bubba while he walked in the column. It belongs to the
    // pair, not to the marching order, so the panel offers it too: Em asks, and
    // Bubba, who is the one who remembers, tells. It is offered whether he is
    // walking with the party or benched behind it, and whether he is standing
    // there as a map NPC or is being opened off the roster.
    _storyAskSpeaker() {
      if (!this._pairCtx?.()) return null;
      const name = this._focusActor()?.name?.();
      return name ? String(name).trim() : null;
    }

    _canStoryAsk() {
      const speaker = this._storyAskSpeaker();
      if (!speaker) return false;
      return !!window.StoryDialogue?.canAsk?.(this._targetName(), undefined, speaker);
    }

    // The board draws itself out of $gameMessage, which the panel is standing
    // on top of, so the panel closes first and the map opens it: the same
    // hand-over the shop and the card table make.
    _storyAsk() {
      const speaker = this._storyAskSpeaker();
      if (!speaker) return;
      SoundManager.playOk();
      this._removeOverlay();
      this._releaseEventLock();
      SceneManager.pop();
      $gameTemp._NPCEmpathizeOpenStoryAsk = speaker;
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

    // ── The Ask / Tell board, from the panel ───────────────────────────────
    // The topics the two of them have between them (NPC/DialogueSystem.js) are
    // offered here as well as on the road, so the board is reachable from the
    // sheet the roster opens rather than only by turning round on a map.
    // Who is talking: the focused member, and only while this is the pair
    // facing each other. Anybody else opening anybody else's panel has no
    // board to open.
    _storyAskSpeaker() {
      if (!this._pairCtx?.()) return '';
      return this._focusActor()?.name?.() || '';
    }

    _canStoryAsk() {
      const speaker = this._storyAskSpeaker();
      if (!speaker) return false;
      return !!window.StoryDialogue?.canAsk?.(this._targetName(), undefined, speaker);
    }

    // The board is a choice window, so the panel gets out of its way first and
    // the map opens it, exactly as the shop counter and the card table are
    // handed over.
    _storyAsk() {
      const speaker = this._storyAskSpeaker();
      if (!speaker) return;
      SceneManager.pop();
      $gameTemp._NPCEmpathizeOpenStoryAsk = speaker;
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
      const said = this._pushChat('player', fill(beat.player));
      this._replyNpc(fill(beat.reply));
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
      // A child (NPCLifeSim FAMILY) is somebody to talk to, and that is all.
      if (this._isChildSubject()) return ['chat'];
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

    // The star on an article, and on the person panel's own header. The page
    // is redrawn in place so the star fills or empties where it stands.
    _toggleWikiFavourite(type, id, name) {
      try { id = decodeURIComponent(id); } catch (_) {}
      try { name = decodeURIComponent(name); } catch (_) {}
      SoundManager.playCursor();
      Wiki.toggleFavourite(type, id, name);
      this._render();
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
    // `root` may be a list of roots, read in the order given.
    _navCache(key, root, selector) {
      const cache = (this._navLists ||= {});
      const hit   = cache[key];
      if (hit && hit.token === this._renderToken &&
          (!hit.list.length || hit.list[0].isConnected)) return hit.list;
      const roots = (Array.isArray(root) ? root : [root]).filter(Boolean);
      const list  = roots.flatMap(r => Array.from(r.querySelectorAll(selector)));
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

    // `reveal` false leaves the page where it is: a scroll step that has just
    // moved the page must not be undone by pulling the cursor back into view.
    _updateSelectionHighlight(reveal = true) {
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
        if (reveal) item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      this._focusedItem = item;

      if (this._tabBarEl)
        this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }

    // ── In-panel content navigation ────────────────────────────────────────────

    // Every tab but the chat has a cursor of its own over whatever it offers to
    // press: the Wiki's cards and tiles, the links through an article or a
    // backstory, the favourite star, the people on the Social Web, the
    // Empathize button on a leader's article. The chat tab's verbs are the
    // 'actions' area instead, and a tab with nothing to press just scrolls.
    _contentNavEnabled() {
      return !!this._entity || this._activeTab !== 'chat';
    }

    // The navigable items, the open page first and the portrait column after
    // it, so a drop in from the tab bar lands on the page being read.
    _contentItems() {
      if (!this._contentNavEnabled() || !this._rightEl) return [];
      return this._navCache('content', [this._rightEl, this._leftEl], CONTENT_NAV_SELECTOR);
    }

    // The box that scrolls an item: its nearest scrolling ancestor inside the
    // panel (the Social Web's stage, a long list), else the panel column.
    _contentViewport(el) {
      const panel = (this._leftEl && this._leftEl.contains(el)) ? this._leftEl : this._rightEl;
      for (let p = el.parentElement; p && p !== panel; p = p.parentElement) {
        if (p.scrollHeight > p.clientHeight + 1 &&
            /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
      }
      return panel;
    }

    _contentItemVisible(el) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      const box = this._contentViewport(el);
      if (!box) return false;
      const v = box.getBoundingClientRect();
      return r.bottom > v.top && r.top < v.bottom && r.right > v.left && r.left < v.right;
    }

    // The cursor drops in on the first item on screen, never on one a page
    // further down, which would throw the reader past what they were reading.
    _enterContentArea() {
      const items = this._contentItems();
      const first = items.findIndex(el => this._contentItemVisible(el));
      if (first < 0) return false;
      this._activeArea   = 'content';
      this._contentIndex = first;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    // Geometric move over any list of elements: the nearest one in the pressed
    // direction by element centres, so a responsive grid, a wrapping strip of
    // verbs and links running through prose are all walked the same way.
    // `accept`, when given, filters the candidates.
    _nearestInDirection(list, index, dir, accept) {
      const curEl = list[index] || list[0];
      if (!curEl) return -1;
      const cur = curEl.getBoundingClientRect();
      const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
      let best = -1, bestScore = Infinity;
      list.forEach((el, i) => {
        if (i === index || (accept && !accept(el))) return;
        const r  = el.getBoundingClientRect();
        if (!r.width && !r.height) return; // not laid out (a hidden row)
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
      return best;
    }

    // One cursor step through the tab's items. With `withinReach` an item is
    // only taken when it is no more than half a screen past the edge of its
    // box, so a link far down a page is scrolled to rather than jumped to and
    // the text in between is read on the way. Up and Down stay inside the box
    // the cursor is in (a page scrolled past the portrait column would
    // otherwise read that column as "below"); Left and Right cross columns.
    _moveContent(dir, withinReach) {
      const items = this._contentItems();
      if (!items.length) return false;
      const cur = items[this._contentIndex] || items[0];
      const box = (dir === 'up' || dir === 'down') ? this._contentViewport(cur) : null;
      const best = this._nearestInDirection(items, this._contentIndex, dir,
        box ? (el => box.contains(el)) : null);
      if (best === -1) return false;
      if (withinReach && !this._contentWithinReach(items[best], dir)) return false;
      this._contentIndex = best;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    _contentWithinReach(el, dir) {
      const box = this._contentViewport(el);
      if (!box) return true;
      const v = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const slack = v.height / 2;
      if (dir === 'down') return r.bottom <= v.bottom + slack;
      if (dir === 'up')   return r.top    >= v.top    - slack;
      return true;
    }

    // Scrolls the box the cursor sits in by `px`, and if that carries the
    // cursor off screen, sets it back down on the nearest item still in view
    // in that same box (never across into the other column). Returns whether
    // anything moved.
    _scrollContent(px) {
      const items = this._contentItems();
      const cur   = items[this._contentIndex];
      const box   = cur ? this._contentViewport(cur) : null;
      if (!box) return !!this._scrollActivePane?.(px);
      const before = box.scrollTop;
      box.scrollTop = before + px;
      if (box.scrollTop === before) return false;
      if (!this._contentItemVisible(cur)) {
        const cy = cur.getBoundingClientRect().top;
        let best = -1, bestDist = Infinity;
        items.forEach((el, i) => {
          if (!box.contains(el) || !this._contentItemVisible(el)) return;
          const d = Math.abs(el.getBoundingClientRect().top - cy);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        if (best >= 0) this._contentIndex = best;
      }
      this._updateSelectionHighlight(false);
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
      const best = this._nearestInDirection(btns, this._menuIndex, dir);
      if (best === -1) return false;
      this._menuIndex = best;
      SoundManager.playCursor();
      this._updateSelectionHighlight();
      return true;
    }

    _activateContent() {
      const el = this._contentItems()[this._contentIndex];
      if (!el || el.classList.contains('npc-action-disabled')) return;
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
        case 'askTopics':  this._storyAsk();    break;
        case 'romance':    this._romance();     break;
        case 'directions': this._askDirections(); break;
        case 'cardDuel':   this._cardDuel();    break;
        case 'cardTrade':  this._cardTrade();   break;
        // Talk about / Teach / Learn (NPCEmpathizeUI.js, LESSONS)
        case 'talkAbout':  this._talkAbout?.(); break;
        case 'teach':      this._teachPick?.(); break;
        case 'learn':      this._learnPick?.(); break;
        // Specialization training both ways (the same LESSONS sheets)
        case 'trainSpec':  this._trainSpecPick?.(); break;
        case 'learnSpec':  this._learnSpecPick?.(); break;
        // Beliefs and Politics (NPCEmpathizeUI_Lessons.js, CIVICS)
        case 'preach':         this._preach?.();         break;
        case 'debate':         this._debate?.();         break;
        case 'askViews':       this._askViews?.();       break;
        case 'prayTogether':   this._prayTogether?.();   break;
        case 'askVote':        this._askVote?.();        break;
        case 'joinTheirParty': this._joinTheirParty?.(); break;
        case 'inviteToParty':  this._inviteToParty?.();  break;
        case 'campaign':       this._campaignPick?.();   break;
        case 'endorse':        this._endorsePick?.();    break;
        case 'petition':       this._petitionPick?.();   break;
        // Money and Work and travel (NPCEmpathizeUI_Chat.js, DEALS)
        case 'stockTips': case 'tradeShares': case 'lend': case 'borrow':
        case 'askWork': case 'hire': case 'fire': case 'workTogether':
        case 'askRide': case 'borrowVehicle': case 'inviteMove': case 'inviteExpedition':
          this._runDeal?.(id); break;
        // Help, Games, Romance and Talk (NPCEmpathizeUI_Lessons.js, HELP)
        case 'treatThem':    this._treatThemPick?.();    break;
        case 'giveMedicine': this._giveMedicinePick?.(); break;
        case 'firstAid':     this._firstAid?.();         break;
        case 'offerFix':     this._offerFixPick?.();     break;
        case 'intervene':    this._intervenePick?.();    break;
        case 'shelter':      this._shelterPick?.();      break;
        case 'challenge':    this._challengePick?.();    break;
        case 'introduce':    this._introducePick?.();    break;
        case 'rumours':      this._rumours?.();          break;
        // Accuse (NPCEmpathizeUI_Lessons.js, ACCUSE): words only, never a charge
        case 'accuse':       this._accusePick?.();       break;
        default:
          if (FERAL_ACTION_IDS.has(id)) this._feralAct(id);
          break;
      }
      // These four never move an opinion, but haggling, being patched up, being
      // pointed at a door and buying a house off somebody are all time spent in
      // company, so they pay the social meter the same flat base an exchange does.
      if (COMPANY_ACTIONS.has(id)) this._gainCompany();
    }

    // A chat or a social move that landed talks the NPC a little toward the
    // focused member's creed (NPCLifeSim.playerPush, scaled by the member's
    // charisma and the NPC's opinion of them). Only a real NPC on the map is
    // talked round; the roster and wiki pages are not.
    _pushCreed() {
      if (this._actorId != null || this._entity || this._pairCtx?.()) return;
      const npcName = this._targetName();
      const profile = npcName ? _getProfile(npcName) : null;
      if (!profile || this._isNonSentientSubject()) return;
      const actor = this._focusActor();
      if (!actor || _isNonSentientActor(actor)) return;
      try { window.NPCLifeSim?.playerPush?.(npcName, actor, this._focusOpinion(profile) ?? 0); }
      catch (e) { console.warn('[NPCEmpathize] creed push failed', e); }
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
    // Is the one being talked to a child of the world (NPCLifeSim FAMILY)?
    // Never in actor mode: a party member is nobody's minor here.
    _isChildSubject() {
      if (this._entity || this._actorId != null) return false;
      const name = this._eventId != null ? _getNPCName(this._eventId) : this._npcName;
      return !!name && !!window.NPCLifeSim?.isMinor?.(name);
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
        this._pushPlayerLine(String(own).replace(/\{kind\}/g, kind).replace(/\{name\}/g, npcName));
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
      if (delta >= 0) SoundManager.playOk(); else SoundManager.playBuzzer();
      this._activeTab = 'chat';
      // A person answering a beast is answering in words, so a model picked in
      // Options gets to write them. A beast answering a beast never reaches
      // here as prose, and _replyNpc keeps it out of the model's hands anyway.
      if (reply) this._replyNpc(reply);
      else { this._render(); this._scrollChatToBottom(); }
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
      if (!text) return '';
      const line = String(text);
      this._chatHistory.push({ role, text: line });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      return line;
    }

    // ── The language model as the panel's voice ────────────────────────────
    // A model writes ONE thing in this game: the answer to a line the player
    // typed themselves, here and in the messenger window. Everything else an
    // NPC says is written ahead of time in a line bank, and a bank's line was
    // rolled against the opinion maths and moved the reputation before it was
    // spoken: handing it to a model to say again in its own words bought
    // nothing, cost seconds of waiting on every button in the panel, and put
    // generated prose where authored prose was. Every action below speaks its
    // bank line as it stands, exactly as it did before a model was an option.
    //
    // The one thing never handed to a model even in free chat is a beast: a
    // non-sentient subject answers in the voice of its class and holds no
    // prose at all, whoever is doing the writing (window.NPCCreature owns that
    // boundary).
    _llmOn() {
      const llm = window.MarkovLLM;
      if (!llm?.isEnabled?.() || typeof llm.reply !== 'function') return false;
      return !this._isNonSentientSubject();
    }

    // The sheets of the two people in this conversation, and where they stand
    // with each other. The builders themselves are module functions so the
    // message-box dialogue path can ask for exactly the same thing
    // (window.NPCEmpathize.conversationContext).
    _llmNpcSheet() {
      return _llmCharacterSheet(
        _getProfile(this._targetName()),
        this._actorId != null ? $gameActors.actor(this._actorId) : null
      );
    }

    _llmSpeakerSheet() {
      const actor = this._focusActor();
      return actor ? _llmCharacterSheet(_getProfile(actor.name()), actor) : '';
    }

    _llmRelation() {
      const profile = _getProfile(this._targetName());
      const actor   = this._focusActor();
      if (!profile || !actor) return '';
      return _llmRelationLine(profile, actor, this._focusOpinion(profile) ?? 0);
    }

    // The life this person has lived and the people already in it. For one of
    // the party's own it is the adventures the diary has them in instead: they
    // have no simulated background life, they have the one that was played.
    _llmLife() {
      const name = this._targetName();
      const profile = _getProfile(name);
      const own = this._actorId != null
        || ($gameParty?.members?.() || []).some(a => a && a.name() === name);
      return _llmLifeFor(name, profile, own);
    }

    _llmParty() {
      return _llmPartyLine(_getProfile(this._targetName()), this._focusActor());
    }

    // The panel's one way of speaking an NPC's answer: the typing indicator,
    // the line, the trim and the scroll, in one place, on the same 350ms beat
    // every one of these actions used to run on its own.
    _replyNpc(bankLine) {
      this._isTyping = true;
      this._render();
      this._scrollChatToBottom();
      setTimeout(() => {
        if (SceneManager._scene !== this) return;
        this._isTyping = false;
        this._pushChat('npc', bankLine);
        this._render();
        this._scrollChatToBottom();
      }, 350);
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
      // The weight class applies to an animal exactly as it does to a person
      // (_joinLevelOk): a beast far above what the party can handle does not
      // trot along behind them, as a pet or as a member.
      if (!_joinLevelOk(profile?.level ?? status.level)) { SoundManager.playBuzzer(); return; }

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
      // Its life remembers whose hand it ate from (NPCLife_Animals).
      if (npcName) window.NPCLifeSim?.Animals?.noteFed?.(npcName, this._focusActor?.()?.name?.() || '');
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
        // The pair bank has no jokes in it, so the entertainment falls back to
        // her own pool rather than to the house grammar: the material is hers
        // whoever is standing in front of her.
        if (id === 'joke' || id === 'story' || id === 'poem') {
          const own = _emVoiceLine(actor, id, tone);
          if (own) playerLine = fill(own);
        }
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
        // "player" pool of the em block is her own voice. Every move she makes
        // is said in it, the entertainment included: a joke she tells is one of
        // HER jokes rather than a line off the house grammar, and the tale and
        // the poem are hers to introduce. Only when her own pool has nothing
        // for a move does the generic line stand.
        const emKind = (id === 'joke' || id === 'story' || id === 'poem') ? id : emTone;
        const emSaid = _emVoiceLine(actor, emKind, emTone);
        if (emSaid) playerLine = fill(emSaid);
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

      // Small talk that went well turns, now and then, to their family: the
      // partner, children, parents they really have, by name, from the life
      // record (NPCConversation LIFE TALK). Only when that family exists.
      if (!pairCtx && !emCtx && !bubbaCtx && delta > 0 && (id === 'smalltalk' || id === 'gossip') && Math.random() < 0.45) {
        const fam = _llmSafe(() => window.NPCConversation?.LifeTalk?.familyMention?.(npcName, profile));
        if (fam) npcLine = npcLine ? npcLine + ' ' + fam : fam;
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
        // A move that landed leans them toward the speaker's creed.
        if (delta > 0) this._pushCreed();
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
      const said = this._pushPlayerLine(playerLine);
      this._joinMessage = {
        type: delta >= 0 ? 'accept' : 'reject',
        text: `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`
          + (funStep ? ` +${funStep} ☺` : ''),
      };
      // The bank's line is what this person means; with a model picked it is
      // said in their own words instead (_replyNpc).
      const label = (this._socialCatalog?.() || []).find(a => a && a.id === id)?.label || id;
      this._replyNpc(npcLine);
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
          !(window.VectorGun && window.VectorGun.isBound(i)) &&
          // Nobody is ever handed the Liminal cuffs (NPCShared).
          !window.NPCShared?.isForbiddenItem?.(i.id));
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
          this._replyNpc(
            String(refusal).replace(/\{item\}/g, item.name).replace(/\{name\}/g, npcName));
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
      this._giftMode    = false;
      this._feedMode    = false;
      if (line) {
        this._replyNpc(
          String(line).replace(/\{item\}/g, item.name).replace(/\{name\}/g, npcName));
      } else {
        this._render();
        this._scrollChatToBottom();
      }
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

      // The menu shows no tiers to a virtuous person; this is the guard behind it.
      if (window.NPCSocietyRegistry?.isIncorruptible?.(profile)) {
        SoundManager.playBuzzer();
        this._joinMessage = { type: 'reject', text: T.bribeIncorruptible(npcName) };
        this._bribeMode   = false;
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
      // Somebody lying downed is not fought again (NPCSystem, DOWNED BODIES):
      // the body's own menu is where a coup de grace is given.
      if (window.NPCDowned?.isDowned?.(npcName)) {
        this._joinMessage = { type: 'reject', text: window.T('Battle.downedBody.notBattleable', { name: npcName }) };
        this._render();
        return;
      }
      this._attackConfirm     = true;
      this._giftMode          = false;
      this._feedMode          = false;
      this._bribeMode         = false;
      this._stealMode         = false;
      this._pickpocketConfirm = false;
      this._infectMode        = false;
      this._activeTab         = 'chat';
      this._menuIndex         = 0;
      // Somebody wanted is fair game: the warning says so instead.
      const bounty = window.NPCSystem?.bountyOf?.(npcName) || 0;
      const money  = window.MoneyFormatter?.format ? window.MoneyFormatter.format(bounty) : String(bounty);
      const wanted = !!window.NPCSystem?.isWanted?.(npcName);
      this._joinMessage       = { type: 'reject', text: wanted ? T.attackWanted(npcName, money) : T.attackWarning(npcName) };
      this._render();
    }

    _confirmAttack() {
      const evId    = this._eventId;
      const npcName = _getNPCName(evId);
      const profile = _getProfile(npcName);
      // A wanted NPC (a bounty on their life record) may be brought down
      // lawfully: no crime is filed and their faction takes no offence.
      const wanted  = !!window.NPCSystem?.isWanted?.(npcName);

      if (profile) {
        const actorId = this._focusActor()?.actorId();
        // Hitting somebody is the opposite of company: it costs the party the
        // same social need a friendly exchange would have paid them.
        _gainSocialFromOpinion(actorId, -100 - _npcBaseOpinion(profile, actorId), profile);
        _setNpcBaseOpinion(profile, actorId, -100);
        (profile.eventLog ??= []).push({ tag: 'crime', desc: 'attacked by player', timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0 }); // i18n-ignore: event-log record id
        const dl      = window._NPCSocietyDataLoader;
        const faction = (profile.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
        if (!wanted && faction != null && window.$gameFactions?.changeReputation)
          window.$gameFactions.changeReputation(profile.factionIndex, -20);
      }

      // The preset charge, so it reaches playerCrimes and the trial; the
      // bounty still grows with who was set upon.
      if (!wanted) {
        const bounty = 500 + ((profile?.level ?? 1) * 50);
        const CS = window.CrimeSystem;
        if (CS?.addCrime) CS.addCrime(CS.presetCrimeName?.(NPC_ASSAULT_CRIME) || NPC_ASSAULT_CRIME, bounty, NPC_ASSAULT_CRIME);
      }

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
      // The troop is the person: a Humanoid proxy enemy wearing their level,
      // their stats and their name (SECTION 5d), never the Ancient Skeleton.
      const proxy = _buildNpcProxy(npcName, profile);
      $gameTemp._NPCEmpathizeAttackProxy = proxy;
      $gameTemp._NPCEmpathizeStartBattle = proxy ? _npcProxyTroopId() : 2;
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
      // A customised weapon or trinket of theirs can be lifted too.
      if (window.NPCUniqueGear?.pickpocketTargets) {
        items = window.NPCUniqueGear.pickpocketTargets(items, _getNPCName(this._eventId), this._eventId);
      }
      // A driver's car keys are in their pocket too (RoadCarAI, Phase R).
      const keysOwner = _getProfile(_getNPCName(this._eventId));
      const shared = window.NPCShared;
      const keysId = shared?.CAR_KEYS_ITEM_ID;
      if (keysId && (keysOwner?.itemIds || []).some(id => shared.isCarKeys(id)) && $dataItems?.[keysId] &&
          !items.some(i => i.type === 'item' && Number(i.id) === keysId)) {
        items = items.concat([{ type: 'item', id: keysId, data: $dataItems[keysId], sourceEventId: this._eventId, carKeys: true }]);
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
      this._introspectGenderMode = false;
      this._introspectOrientMode = false;
      this._introspectCreedMode  = false;
      if (this._closeNameModal) this._closeNameModal();
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
        // The keys come off the driver, and their parked car opens for the party.
        if (item.carKeys && profile && Array.isArray(profile.itemIds)) {
          const at = profile.itemIds.findIndex(id => window.NPCShared?.isCarKeys?.(id));
          if (at >= 0) profile.itemIds.splice(at, 1);
          window.RoadCarAI?.onDriverKeysTaken?.(npcName);
        }
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

      // A piece customised for them goes on the counter as itself
      // (window.NPCUniqueGear, Quest/ThinkerMenu.js), not as its catalogue entry.
      window.NPCUniqueGear?.materializeWorn?.(npcName);
      if (profile && window.NPCSocietyGetEquip) {
        const equip = window.NPCSocietyGetEquip(npcName, cid ?? profile.assignedClassId, profile.wealthTierBase ?? 2);
        if (equip.weaponId && $dataWeapons?.[equip.weaponId])
          goods.push([1, equip.weaponId, 1, Math.max(1, Math.floor($dataWeapons[equip.weaponId].price * buyFactor))]);
        for (const aId of (equip.armorIds || []))
          if ($dataArmors?.[aId])
            goods.push([2, aId, 1, Math.max(1, Math.floor($dataArmors[aId].price * buyFactor))]);
      }
      // A car's keys are not for sale (they go with the car, RoadCarAI), and
      // nobody ever holds the Liminal cuffs to sell (NPCShared).
      for (const iId of (profile?.itemIds || []))
        if ($dataItems?.[iId] && !window.NPCShared?.isCarKeys?.(iId) && !window.NPCShared?.isForbiddenItem?.(iId))
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
      $gameTemp._NPCEmpathizeOpenTrade = { goods, sellFactor, trader: npcName };
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
      this._introspectGenderMode = this._introspectOrientMode = this._introspectCreedMode = false;
      if (this._closeNameModal) this._closeNameModal();
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

    // The party and NPC put up items of genuinely comparable worth, out of
    // the party's inventory and the NPC's items/equipped gear. If neither side
    // holds a matching counterpart within fair value parity (at least 0.5 ratio),
    // no bartering wager is offered.
    _cardItemStake(profile) {
      const partyItems = ($gameParty ? $gameParty.items() : [])
        .filter(item => item && item.itypeId !== 2 && (item.price || 0) > 0 &&
          // A wager lost would hand the NPC the Liminal cuffs (NPCShared).
          !window.NPCShared?.isForbiddenItem?.(item.id));
      if (!partyItems.length) return null;

      const pool = [];
      for (const id of (profile?.itemIds ?? [])) {
        if ($dataItems?.[id] && ($dataItems[id].price || 0) > 0 && !window.NPCShared?.isCarKeys?.(id)) pool.push({ kind: 0, id, obj: $dataItems[id] });
      }
      if (profile && window.NPCSocietyGetEquip) {
        window.NPCUniqueGear?.materializeWorn?.(_getNPCName(this._eventId));
        const ev    = $gameMap?.event(this._eventId);
        const cid   = _extractClassId(ev) ?? profile.assignedClassId;
        const equip = window.NPCSocietyGetEquip(_getNPCName(this._eventId), cid, profile.wealthTierBase ?? 2);
        const lostEquip = new Set(profile.lostEquipIds || []);
        if (equip.weaponId && $dataWeapons?.[equip.weaponId] && !lostEquip.has(equip.weaponId)) {
          pool.push({ kind: 1, id: equip.weaponId, obj: $dataWeapons[equip.weaponId] });
        }
        for (const aId of (equip.armorIds ?? [])) {
          if ($dataArmors?.[aId] && !lostEquip.has(aId)) pool.push({ kind: 2, id: aId, obj: $dataArmors[aId] });
        }
      }
      if (!pool.length) return null;

      let bestPair = null;
      let minDiff = Infinity;
      for (const npcEntry of pool) {
        const npcPrice = npcEntry.obj.price || 0;
        if (npcPrice <= 0) continue;
        for (const pItem of partyItems) {
          const pPrice = pItem.price || 0;
          if (pPrice <= 0) continue;
          const ratio = Math.min(pPrice, npcPrice) / Math.max(pPrice, npcPrice);
          const isComparable = ratio >= 0.5 || (pPrice >= 100000 && npcPrice >= 100000);
          if (isComparable) {
            const diff = Math.abs(pPrice - npcPrice);
            if (diff < minDiff) {
              minDiff = diff;
              bestPair = { playerItem: { kind: 0, id: pItem.id }, npcItem: { kind: npcEntry.kind, id: npcEntry.id } };
            }
          }
        }
      }
      return bestPair;
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
      // on into the reserves and waits on the Dynamics board (NPCSystemParty.joinParty).
      if (window.NPCSim?.isShopShiftCovered?.($gameMap?.event(evId))
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
          this._replyNpc(String(line).replace(/\{name\}/g, npcName));
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
        this._replyNpc(refusal);
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
      _vanishRecruitedEvent(evId ?? this._launchEventId);

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

      if (window.NPCSim?.isShopShiftCovered?.($gameMap?.event(evId))
          || window.NPCSystem?.isAnyShopEvent?.($gameMap?.event(evId))
          || !_joinLevelOk(_presetFromEvent($gameMap?.event(evId))?.level ?? profile?.level)) {
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
      _vanishRecruitedEvent(evId ?? this._launchEventId);

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
      // ...and a little toward the speaker's creed.
      this._pushCreed();

      this._pushPlayerLine(phrase);
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
      // Talking to somebody is a thing done TO them, so it lands before the
      // answer does: warmth, coldness and an insult all move where the two of
      // them stand, capped over the conversation so nobody is talked into
      // devotion. Their own doing, not the model's; the standing moves the
      // same way with the model off.
      this._chatOpinionSpent = this._chatOpinionSpent || 0;
      const moved = _llmSafe(() => _chatOpinionShift(
        _getProfile(this._targetName()), this._focusActor(), phrase, this._chatOpinionSpent));
      if (moved) {
        this._chatOpinionSpent += moved;
        try {
          window.ParchmentToast?.show?.(window.T('Empathize.llm.toneMoved', {
            name: this._targetName(), sign: moved > 0 ? '+' : '', amount: moved,
          }), { severity: moved > 0 ? 'info' : 'warning', duration: 240 });
        } catch (e) { /* a popup never breaks a conversation */ }
      }
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
            // Everything the panel knows about the two of them, so the answer
            // is this person's answer to THIS member of the party rather than
            // a stranger's answer to another stranger.
            npcSheet: this._llmNpcSheet(),
            speakerName: this._focusActor()?.name() || '',
            speakerSheet: this._llmSpeakerSheet(),
            relation: this._llmRelation(),
            // The typed line is the one the player waits in front of, so it is
            // the one handed the whole of what the game knows: the life this
            // person has lived, who else they know, who else is standing here,
            // and the world the two of them are talking in.
            // Asked for, never demanded: everything below is colour on top of
            // an answer that stands without it, so a builder that cannot
            // answer (a system this save has never loaded, a panel opened
            // outside the map) costs a fact and not the line.
            npcLife: _llmSafe(() => this._llmLife()),
            party: _llmSafe(() => this._llmParty()),
            world: _llmSafe(_llmWorldLine),
            // And whatever the line itself named: a hyperpower, one of its
            // leaders, a faction. Without this the model answers about
            // Margaret Thatcher out of OUR history rather than out of the
            // book this world seated her from.
            topics: _llmSafe(() => _llmTopicsLine(phrase)),
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
      // Without a model, the chain's answer sometimes gives way to the one
      // thing they would really talk about: their own family, by name.
      if (!fromModel && Math.random() < 0.2) {
        const fam = _llmSafe(() => window.NPCConversation?.LifeTalk?.familyMention?.(this._targetName()));
        if (fam) response = fam;
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
      // The press that opened the modal must not also act inside it.
      window.UINav?.swallowHeld?.();
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
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
        // Nor the press that closed it act on the panel underneath.
        window.UINav?.swallowHeld?.();
      }
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

  Object.assign(window.NPCEmpathize._internal, {
    _navigateInPlace, _pushReturnContext, Scene_NPCEmpathize,
  });
})();
