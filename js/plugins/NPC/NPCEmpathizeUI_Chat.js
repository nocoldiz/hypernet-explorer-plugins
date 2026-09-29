/*:
 * @target MZ
 * @plugindesc NPC Empathize UI: screen 2, the chat modal
 * @author Omni-Lex
 * @base NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI
 * @help
 * ============================================================================
 * NPCEmpathizeUI_Chat, part of the NPCEmpathizeUI family
 * ============================================================================
 * Owns SCREEN 2 OF 5, THE CHAT MODAL: the chat panel, the inline action
 * builders of its actions row and the info panel. Also owns DEALS, the scene
 * half of the Money and the Work and travel verbs (NPCEmpathize.Deals).
 *
 * Reads the helpers it shares with the rest of the family off
 * Scene_NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathizeUI.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const { Scene_NPCEmpathize } = window.NPCEmpathize;
  const {
    _alienIdentity, _archetypeRowLabel, _ccHover, _conversionRowText, _countRecentInteractions,
    _diseaseVialId, _encId, _escapeHtml, _euros, _extractClassId, _factionDisplayName, _feedCalories,
    _feedKind, _feedOpinion, _gameStamp, _getActorSpecializations, _getNPCName,
    _getNpcSpecializations, _getProfile, _getT, _homeAddressLabel, _homeTownLabel, _iconSpan,
    _ideologyLabel, _infectChance, _kvRow, _linkify, _needLabels, _presetAge, _presetBirthDate,
    _presetClassName, _presetGenderLabel, _presetHometown, _presetLore, _refugeeRowText, _topicHtml,
    _traitDisplayName, _travelRowText, _wikiLink, FUN_ACTIONS, NEED_ICONS, vary, Wiki,
  } = Scene_NPCEmpathize._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let _dbText, _orientationData, _personalityLabel;
  Scene_NPCEmpathize._internal._late.push(() => ({
    _dbText, _orientationData, _personalityLabel,
  } = Scene_NPCEmpathize._internal));

  // ============================================================================
  // SCREEN 2 OF 5: THE CHAT MODAL
  // ============================================================================
  // Focus-critical. The input row is a sibling of the panels that are rebuilt
  // from innerHTML on every render, precisely so a field being typed into
  // survives a redraw: nothing here may move it inside one of them.
  // test_empathize_focus.js is the guard on that.

  // ============================================================================
  // Chat panel
  // ============================================================================

  // Give the chat log a definite pixel height.
  //
  // Its height would otherwise come out of a five-level flex chain (overlay →
  // inner → panel body → right panel → chat panel). If any link of that chain
  // ends up with an indefinite height, `flex: 1 + min-height: 0` stops
  // constraining the log: it grows to fit its messages, gets clipped by the
  // right panel's overflow:hidden, and - because scrollHeight then equals
  // clientHeight - becomes completely unscrollable. That single failure mode
  // explains all three symptoms at once (messages cut off, wheel does nothing,
  // dragging the bar does nothing, scrollTop won't move).
  //
  // Measure from `right` (the chat panel's own parent, `.npc-right-panel`)
  // rather than reconstructing its height from `.npc-empathize-inner` minus the
  // tab bar - that reconstruction silently drifted whenever a border/padding
  // changed anywhere in between, which is what let the log get sized taller
  // than the space actually visible through `right`'s `overflow: hidden`, i.e.
  // exactly the "nothing to scroll, new lines clipped off the bottom" bug.
  // `right.clientHeight` is the real, already-resolved box for that space.
  Scene_NPCEmpathize.prototype._sizeChatLog = function () {
    const chat  = this._overlay?.querySelector('#npc-dlg-chat');
    const panel = chat?.parentElement;
    const right = panel?.parentElement;
    if (!chat || !panel || !right) return;
    this._bindChatPin(chat);
    const avail = right.clientHeight;
    if (!(avail > 0)) return;
    // The inline lists (directions / gift / steal / bribe) can run to dozens of
    // rows. The stylesheet's percentage ceiling only resolves when every link of
    // the flex chain above has a definite height, and where it does not the row
    // grows without bound, swallows the chat log and pushes the input box off
    // the bottom of the panel. Resolve the ceiling here in pixels against the
    // height the panel actually has. The verbs stand in a column BESIDE the log
    // now, so the whole panel height is their ceiling: the column scrolls on its
    // own and never takes a line away from the conversation.
    const actions = right.querySelector('.npc-chat-actions-row');
    if (actions) {
      actions.style.setProperty('--npc-actions-max', `${Math.max(96, Math.round(avail))}px`);
    }
    // offsetHeight excludes margins, and the join/feedback message carries one,
    // so counting them is what keeps the log from being sized a few pixels
    // taller than the space it shows through, i.e. the newest bubble sitting
    // just below the bottom edge with nothing left to scroll.
    let used = 0;
    for (const el of panel.children) {
      if (el === chat) continue;
      const cs = getComputedStyle(el);
      used += el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    }
    const h = Math.max(80, Math.round(avail - used));

    // border-box, the log carries 10px of vertical padding that would otherwise
    // push the input row out past the bottom of the panel.
    chat.style.setProperty('--npc-chat-h', `${h}px`);
    chat.classList.add('npc-chat-bubbles--sized');
    if ($gameSwitches?.value(23)) {
      console.log('[NPCEmpathize] chat log sized', {
        rightClient: right.clientHeight,
        avail, siblings: used, height: h,
        scrollHeight: chat.scrollHeight, clientHeight: chat.clientHeight,
      });
    }
  };

  // Pin the chat history to the newest message. Scoped to THIS overlay (not a
  // global getElementById, which can find a stale overlay still fading out).
  //
  // The pin is held for a short window rather than fired once: a bubble reaches
  // its final height only after the rebuilt log has laid out, and again after a
  // web font or an inline icon has loaded, and each of those reflows would
  // otherwise leave the newest message hanging below the bottom edge. Re-pinning
  // every frame of that window is also what makes a stale callback from an
  // earlier render harmless, it simply gets overwritten on the next frame.
  Scene_NPCEmpathize.prototype._scrollChatToBottom = function () {
    this._chatStick    = true;
    this._chatPinUntil = (window.performance?.now?.() ?? Date.now()) + 400;
    const pin = () => {
      const chat = this._overlay?.querySelector('#npc-dlg-chat');
      if (!chat) return false;
      this._sizeChatLog();
      chat.scrollTop = chat.scrollHeight;
      return true;
    };
    const step = () => {
      if (!pin()) return;
      const now = window.performance?.now?.() ?? Date.now();
      if (now < this._chatPinUntil) requestAnimationFrame(step);
    };
    step();
  };

  // How close to the foot of the log still counts as "at the bottom". One
  // bubble's worth of slack, so a reflow that lands a pixel or two short does
  // not read as the player having scrolled up.
  const CHAT_BOTTOM_SLACK = 28;

  Scene_NPCEmpathize.prototype._chatAtBottom = function (chat) {
    if (!chat) return true;
    return chat.scrollHeight - chat.scrollTop - chat.clientHeight <= CHAT_BOTTOM_SLACK;
  };

  // Called from every hand-driven scroll (wheel, L2/R2, arrows falling through
  // the bottom of the action list). Reading the backlog stops the log being
  // pulled back down; scrolling back to the foot of it starts it up again.
  Scene_NPCEmpathize.prototype._noteChatScrolled = function (chat) {
    this._chatPinUntil = 0;
    this._chatStick    = this._chatAtBottom(chat);
  };

  // Keep the log pinned to its newest message for as long as it is meant to be
  // pinned, rather than for one 400ms window after a render.
  //
  // The window was the whole of the pin, and anything that changed the log's
  // layout after it closed left the newest message stranded off the bottom
  // edge: a bust or an inline icon decoding late, the 3D portrait standing up
  // and re-flowing the panel, an action row growing a second line, a delayed
  // reply arriving on its own timer. Observing the log instead means every one
  // of those re-pins it, however long after the render it happens.
  //
  // Bound per element: `_render` rebuilds the log with innerHTML, so the node
  // observed here is thrown away on the next render and the flag comes back
  // with the new one.
  Scene_NPCEmpathize.prototype._bindChatPin = function (chat) {
    if (!chat || chat.__npcPinBound) return;
    this._unbindChatPin();
    chat.__npcPinBound = true;
    const repin = () => {
      if (!chat.isConnected || !this._chatStick) return;
      chat.scrollTop = chat.scrollHeight;
    };
    // The player's own scrolling is what decides whether the log still follows
    // its newest message. Programmatic pins land at the bottom and so leave it
    // following, which is what makes this safe to listen to unconditionally.
    chat.addEventListener('scroll', () => {
      if (this._chatPinUntil > (window.performance?.now?.() ?? Date.now())) return;
      this._chatStick = this._chatAtBottom(chat);
    }, { passive: true });
    // A bubble reaching its final height without the DOM changing (a web font
    // or an inline icon finishing) only shows up as a resize.
    if (typeof ResizeObserver === 'function') {
      this._chatRO = new ResizeObserver(repin);
      this._chatRO.observe(chat);
      for (const el of chat.children) this._chatRO.observe(el);
    }
    if (typeof MutationObserver === 'function') {
      this._chatMO = new MutationObserver(() => {
        if (this._chatRO) for (const el of chat.children) this._chatRO.observe(el);
        repin();
      });
      this._chatMO.observe(chat, { childList: true, subtree: true, characterData: true });
    }
  };

  Scene_NPCEmpathize.prototype._unbindChatPin = function () {
    this._chatRO?.disconnect();
    this._chatMO?.disconnect();
    this._chatRO = null;
    this._chatMO = null;
  };

  // Every offered line wears one colour - the theme's option gold (crimson ink
  // under Archive Foundation), from --npc-option-fg via .npc-opt-label. The
  // verbs used to be tinted by tone (kind green, cruel red, courting pink),
  // which made a five-colour patchwork of what is really a single menu; the
  // tone of a move is already in its wording and in its ♥ badges.
  const OPT = 'npc-opt-label';

  // ============================================================================
  // ACTION BOARD: the verbs sorted into categories
  // ============================================================================
  // The standing verb list grew past thirty entries, so it is shown one
  // category at a time under a row of category tabs at the head of the column.
  // Only the active category's verbs are listed; a category with nothing to
  // offer this person is not shown at all.
  //
  // The board sits AFTER every existing filter: NPCEmpathizeUI.js still builds
  // _chatActions and runs the beast, child, visitor, story, Em/Bubba and
  // story-mode filters on the bare ids, and only what survives is grouped
  // here. _runAction stays the one dispatcher; nothing about a verb changes by
  // being filed under a category.
  //
  // Two gates of its own run on top, for the verbs later phases add:
  //   mode       a WorldModes question (hasEconomy, hasPolitics ...) that must
  //              answer true in this world
  //   available  available(ctx) -> false hides the verb, { disabled, reason }
  //              greys it; ctx is { scene, actorMode, npcName, profile, actor,
  //              opinion }
  // A reserved id (a verb planned but not built yet) is hidden until
  // ActionBoard.define() gives it a rule.
  //
  // Stepping: L1 / R1 (UINav.tabDir) walk the categories while the cursor is
  // on the board and carry on to the panel's own tabs past either end; a click
  // on a category tab opens it. The last category chosen is remembered for the
  // rest of the session, on every panel.
  const ACTION_CATEGORIES = [
    { id: 'talk', actions: ['freeChat', 'socialize', 'bicker', 'askTopics', 'directions', 'talkAbout', 'rumours',
      'pet', 'growl', 'roar', 'drool', 'sniff', 'nuzzle', 'beg'] },
    { id: 'beliefs', actions: ['preach', 'debate', 'askViews', 'prayTogether'] },
    { id: 'politics', actions: ['askVote', 'joinTheirParty', 'inviteToParty', 'campaign', 'endorse', 'petition'] },
    { id: 'money', actions: ['gift', 'bribe', 'trade', 'buyHouse', 'stockTips', 'tradeShares', 'lend', 'borrow'] },
    { id: 'help', actions: ['treat', 'feed', 'treatThem', 'giveMedicine', 'firstAid', 'offerFix', 'intervene', 'shelter'] },
    { id: 'work', actions: ['collect', 'askWork', 'hire', 'fire', 'workTogether', 'askRide', 'borrowVehicle',
      'inviteMove', 'inviteExpedition', 'join', 'joinFollower', 'animalJoin', 'animalJoinParty'] },
    { id: 'lessons', actions: ['teach', 'learn', 'trainSpec', 'learnSpec'] },
    { id: 'games', actions: ['cardDuel', 'cardTrade', 'challenge'] },
    { id: 'romance', actions: ['romance', 'introduce'] },
    { id: 'rough', actions: ['accuse', 'attack', 'pickpocket', 'cough', 'spit', 'bite', 'infect'] },
  ];
  const ACTION_CATEGORY_IDS = ACTION_CATEGORIES.map(c => c.id);
  // A verb no category names (one added without a line here) is still offered,
  // under Talk, rather than silently dropping off the board.
  const FALLBACK_CATEGORY = 'talk';
  const _categoryOf = new Map();
  for (const cat of ACTION_CATEGORIES) for (const id of cat.actions) _categoryOf.set(id, cat.id);

  // Verbs a later phase of the plan will add, held back until they are built.
  const RESERVED_ACTIONS = new Set([
    'rumours', 'preach', 'debate', 'askViews', 'prayTogether',
    'askVote', 'joinTheirParty', 'inviteToParty', 'campaign', 'endorse', 'petition',
    'stockTips', 'tradeShares', 'lend', 'borrow',
    'treatThem', 'giveMedicine', 'firstAid', 'offerFix', 'intervene', 'shelter',
    'askWork', 'hire', 'fire', 'workTogether', 'askRide', 'borrowVehicle', 'inviteMove', 'inviteExpedition',
    'challenge', 'introduce',
  ]);
  // The world a verb needs, for the reserved ones (WorldModes question names).
  // The verbs already on the board keep working in every world, as before.
  const ACTION_RULES = new Map(Object.entries({
    askVote: { mode: 'hasPolitics' }, joinTheirParty: { mode: 'hasPolitics' },
    inviteToParty: { mode: 'hasPolitics' }, campaign: { mode: 'hasPolitics' },
    endorse: { mode: 'hasPolitics' }, petition: { mode: 'hasPolitics' },
    stockTips: { mode: 'hasEconomy' }, tradeShares: { mode: 'hasEconomy' },
    lend: { mode: 'hasEconomy' }, borrow: { mode: 'hasEconomy' },
    askWork: { mode: 'hasEconomy' }, hire: { mode: 'hasEconomy' }, fire: { mode: 'hasEconomy' },
    workTogether: { mode: 'hasEconomy' },
    askRide: { mode: 'hasTravel' }, borrowVehicle: { mode: 'hasTravel' },
    inviteMove: { mode: 'hasTravel' }, inviteExpedition: { mode: 'hasTravel' },
    introduce: { mode: 'hasFamilies' },
  }));

  // The category the player last opened, kept for the session.
  let _sessionCategory = FALLBACK_CATEGORY;

  function _worldModes() {
    return window.NPCShared?.WorldModes || window.WorldModes || null;
  }

  const ActionBoard = {
    CATEGORIES: ACTION_CATEGORIES,
    CATEGORY_IDS: ACTION_CATEGORY_IDS,
    RESERVED: RESERVED_ACTIONS,
    categoryOf(id) {
      return _categoryOf.get(id) || FALLBACK_CATEGORY;
    },
    // A later phase building one of the reserved verbs (or adding a new one)
    // gives it its rule here: { cat, mode, available }. It stops being reserved.
    define(id, rule) {
      const r = Object.assign({}, ACTION_RULES.get(id) || {}, rule || {});
      if (r.cat && ACTION_CATEGORY_IDS.includes(r.cat) && _categoryOf.get(id) !== r.cat) {
        for (const cat of ACTION_CATEGORIES) {
          const at = cat.actions.indexOf(id);
          if (at >= 0) cat.actions.splice(at, 1);
        }
        ACTION_CATEGORIES.find(c => c.id === r.cat).actions.push(id);
        _categoryOf.set(id, r.cat);
      }
      ACTION_RULES.set(id, r);
      RESERVED_ACTIONS.delete(id);
      return r;
    },
    rule(id) {
      return ACTION_RULES.get(id) || null;
    },
    // Whether the world lets a verb be offered at all.
    modeAllows(id) {
      const mode = ACTION_RULES.get(id)?.mode;
      if (!mode) return true;
      const WM = _worldModes();
      if (!WM || typeof WM[mode] !== 'function') return true;
      try { return WM[mode]() !== false; } catch (e) { return true; }
    },
    // The board's own gates, on the list the older filters left: reserved and
    // world-barred verbs leave, available(ctx) hides or greys the rest.
    gate(actions, ctx) {
      const out = [];
      for (const a of actions || []) {
        if (!a || RESERVED_ACTIONS.has(a.id) || !this.modeAllows(a.id)) continue;
        const avail = ACTION_RULES.get(a.id)?.available;
        if (typeof avail === 'function') {
          let res;
          try { res = avail(ctx || {}); } catch (e) { res = true; }
          if (res === false) continue;
          if (res && typeof res === 'object' && res.disabled) {
            out.push(Object.assign({}, a, { disabled: true, reason: res.reason || a.reason }));
            continue;
          }
        }
        out.push(a);
      }
      return out;
    },
    // The non-empty categories, in table order, each with its verbs in the
    // order the builder put them.
    group(actions) {
      const byCat = new Map();
      for (const a of actions || []) {
        if (!a) continue;
        const cat = this.categoryOf(a.id);
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(a);
      }
      return ACTION_CATEGORY_IDS.filter(id => byCat.has(id)).map(id => ({ id, actions: byCat.get(id) }));
    },
    remembered() { return _sessionCategory; },
    remember(id) {
      if (ACTION_CATEGORY_IDS.includes(id)) _sessionCategory = id;
    },
  };

  // The board's gates, run by the builder in NPCEmpathizeUI.js once every
  // older filter is done.
  Scene_NPCEmpathize.prototype._gateBoardActions = function (actions, ctx) {
    return ActionBoard.gate(actions, Object.assign({ scene: this }, ctx || {}));
  };

  // What the standing board shows right now: the category tabs and the active
  // category's verbs. The remembered category is used when this person has
  // anything under it, the first one they do have otherwise.
  Scene_NPCEmpathize.prototype._boardView = function (T) {
    const cats = ActionBoard.group(this._chatActions || []);
    this._boardCats = cats.map(c => c.id);
    if (!cats.length) {
      this._actionCategoryShown = null;
      return { tabsHTML: '', actions: [], cats };
    }
    const active = cats.find(c => c.id === ActionBoard.remembered()) || cats[0];
    this._actionCategoryShown = active.id;
    this._menuItems = active.actions;
    const label = (id) => {
      const key = `Empathize.act.cat.${id}`;
      const text = (typeof T === 'function') ? T(key) : (window.T ? window.T(key) : key);
      return (text && text !== key) ? text : id;
    };
    // One category alone needs no tab row: there is nothing to switch to.
    const tabsHTML = cats.length > 1
      ? `<div class="npc-action-cats" role="tablist">${cats.map(c =>
          `<div class="npc-action-cat${c.id === active.id ? ' active' : ''}" role="tab" data-cat="${c.id}"` +
          ` onmousedown="event.stopPropagation();SceneManager._scene._setActionCategory('${c.id}')">` +
          `${_escapeHtml(label(c.id))}</div>`).join('')}</div>`
      : '';
    return { tabsHTML, actions: active.actions, cats, active: active.id };
  };

  // Open a category, from a click or a step. Remembered for the session.
  Scene_NPCEmpathize.prototype._setActionCategory = function (id) {
    if (!ACTION_CATEGORY_IDS.includes(id)) return false;
    if (id === this._actionCategoryShown && ActionBoard.remembered() === id) return false;
    ActionBoard.remember(id);
    this._actionCategoryShown = id;
    this._menuIndex = 0;
    SoundManager.playCursor();
    this._render();
    return true;
  };

  // L1 / R1 on the board. Answers false when there is no board up or the step
  // would run past either end, so the caller turns the panel's page instead.
  Scene_NPCEmpathize.prototype._stepActionCategory = function (dir) {
    if (!this._boardShown || this._activeTab !== 'chat') return false;
    const cats = this._boardCats || [];
    if (cats.length < 2 || !dir) return false;
    const at = cats.indexOf(this._actionCategoryShown);
    const next = (at < 0 ? 0 : at) + (dir > 0 ? 1 : -1);
    if (next < 0 || next >= cats.length) return false;
    return this._setActionCategory(cats[next]);
  };

  Scene_NPCEmpathize.prototype._buildChatHTML = function (displayName, T, profile, opinion, npcName, remoteMode) {
    const bubblesHTML = this._chatHistory.map(entry => {
      if (entry.role === 'convo') return this._buildConvoBubble(entry);
      const text = vary(entry.text);
      return entry.role === 'player'
        ? `<div class="npc-bubble npc-bubble-player">${_escapeHtml(text)}</div>`
        // The speaker of a left-hand bubble is never in doubt - the portrait,
        // the header and the side of the log all say it - so the name is not
        // stamped on every one of their lines.
        //
        // What the person across the table SAYS is a source like any other: a
        // topic or a name the codex knows is picked up here exactly as it is
        // in the message box, marked gold where it stands, and the popup
        // announcing it fires over the open panel.
        : `<div class="npc-bubble npc-bubble-npc">${_topicHtml(text)}</div>`;
    }).join('');
    const typingHTML = this._isTyping
      ? `<div class="npc-bubble npc-bubble-npc npc-typing">…</div>` : '';

    // Feedback about what just happened (a warning before a Yes/No, a gift
    // landing, a join). It sits at the FOOT of the log, directly above the
    // buttons it is talking about, where the eye already is.
    const joinMsgHTML = this._joinMessage
      ? `<div class="npc-join-msg ${this._joinMessage.type} npc-join-msg--spaced">${_escapeHtml(this._joinMessage.text)}</div>`
      : '';

    let actionsHTML;
    // Whether the standing board (category tabs and verbs) is what the column
    // shows: L1 / R1 walk its categories only then (ACTION BOARD).
    this._boardShown = false;
    if (remoteMode) {
      actionsHTML = '';
    } else if (this._attackConfirm) {
      actionsHTML =
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._confirmAttack()">${_escapeHtml(T.confirmYes)}</div>` +
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.confirmNo)}</div>`;
    } else if (this._transmitConfirm) {
      actionsHTML =
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._confirmTransmit()">${_escapeHtml(T.confirmYes)}</div>` +
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.confirmNo)}</div>`;
    } else if (this._pickpocketConfirm) {
      actionsHTML =
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._confirmPickpocket()">${_escapeHtml(T.confirmYes)}</div>` +
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.confirmNo)}</div>`;
    } else if (this._introspectGenderMode) {
      actionsHTML = this._buildInlineIntrospectGenderActions(T);
    } else if (this._introspectOrientMode) {
      actionsHTML = this._buildInlineIntrospectOrientActions(T);
    } else if (this._introspectCreedMode) {
      actionsHTML = this._buildInlineIntrospectCreedActions(T);
    } else if (this._socialMode) {
      actionsHTML = this._isSelfTalk()
        ? this._buildInlineIntrospectActions(T)
        : this._buildInlineSocialActions(T);
    } else if (this._romanceMode) {
      actionsHTML = this._buildInlineRomanceActions(T);
    } else if (this._proposeMode) {
      actionsHTML = this._buildInlineProposeActions(T);
    } else if (this._directionsMode) {
      actionsHTML = this._buildInlineDirectionActions(T);
    } else if (this._stealMode) {
      actionsHTML = this._buildInlineStealActions(T);
    } else if (this._giftMode) {
      actionsHTML = this._buildInlineGiftActions(T);
    } else if (this._feedMode) {
      actionsHTML = this._buildInlineFeedActions(T);
    } else if (this._infectMode) {
      actionsHTML = this._buildInlineInfectActions(T);
    } else if (this._bribeMode) {
      actionsHTML = this._buildInlineBribeActions(T, opinion, npcName);
    } else if (this._cardMode) {
      actionsHTML = this._buildInlineCardActions(T);
    } else {
      // The standing board: the category tabs over the active category's
      // verbs (ACTION BOARD, above). The tabs are not action buttons, so the
      // cursor's index still counts the verbs alone.
      const board = this._boardView ? this._boardView(T) : null;
      const verbs = board ? board.actions : (this._chatActions || []);
      this._boardShown = !!board;
      actionsHTML = (board ? board.tabsHTML : '') + verbs.map((item, i) => {
        const focused  = i === this._menuIndex ? ' npc-action-focused' : '';
        const disabled = item.disabled ? ' npc-action-disabled' : '';
        return `<div class="npc-chat-action-btn${focused}${disabled}" onmousedown="event.stopPropagation();SceneManager._scene._runAction('${item.id}')">` +
          `<span class="${OPT}">${_escapeHtml(item.label)}</span></div>`;
      }).join('');
    }

    // The log reads down the page and the verbs stand in a column beside it:
    // what was said on the left, what can be said next on the right, so a long
    // list of moves no longer pushes the conversation up off its own panel.
    return `
      <div class="npc-chat-panel">
        <div class="npc-chat-main">
          <div class="npc-chat-header">
            <span>${_escapeHtml(displayName)}</span>
          </div>
          <div class="npc-chat-bubbles" id="npc-dlg-chat">${bubblesHTML}${typingHTML}</div>
          ${joinMsgHTML}
          ${remoteMode
            ? `<div class="npc-chat-elsewhere">${_escapeHtml(T('Empathize.npcElsewhere', { name: displayName }))}</div>`
            : ''}
        </div>
        ${actionsHTML ? `<div class="npc-chat-actions-row">${actionsHTML}</div>` : ''}
      </div>`;
  };

  // Overheard NPC↔NPC conversation entry (NPCConversation world-folder log).
  // Clicking the partner's name opens their own panel, like the social web.
  Scene_NPCEmpathize.prototype._buildConvoBubble = function (entry) {
    const when = _gameStamp(entry.min ?? 0, true, true);
    const kindLabel = entry.kind === 'debate' ? T('Empathize.debatedWith') : T('Empathize.chattedWith');
    const linesHTML = (entry.lines ?? []).map(l =>
      `<div class="npc-convo-line"><span class="npc-convo-speaker">${_escapeHtml(l.speaker)}:</span> ${_escapeHtml(l.text)}</div>`
    ).join('');
    const partnerArg = String(entry.with ?? '').replace(/[\\'"<>]/g, '');
    return `
      <div class="npc-bubble npc-bubble-convo">
        <span class="npc-bubble-name">${kindLabel}
          <span class="npc-convo-partner" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName('${partnerArg}')">${_escapeHtml(entry.with)}</span>
         , ${when}</span>
        ${linesHTML}
      </div>`;
  };

  // ============================================================================
  // Inline action builders (used inside the chat panel actions row)
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildInlineGiftActions = function (T) {
    const items = this._giftItems;
    let html = '';
    if (!items.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.noItemsToGive)}</span>`;
    } else {
      html = items.map((item, i) => {
        const qty     = $gameParty.numItems(item);
        const opDelta = Math.round(Math.max(5, Math.min(25, (item.price || 0) / 50)));
        return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._giveItem(${i})">` +
          `${_iconSpan(item.iconIndex || 0, 15)}<span>${_escapeHtml(item.name)}</span>` +
          `<span class="npc-note npc-aside-sm">×${qty}</span>` +
          `<span class="npc-good npc-aside">+${opDelta}♥</span></div>`;
      }).join('');
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // The feeding tray. One row per thing in the pack an animal would eat, each
  // stating what the mouthful is worth to it: cooked food by its calories, raw
  // meat and offal as the grudge they earn. The number is the same one
  // _feedItem lands on the opinion, so the choice is made with the consequence
  // already under the cursor.
  Scene_NPCEmpathize.prototype._buildInlineFeedActions = function (T) {
    const items = this._feedItems || [];
    let html = '';
    if (!items.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.nothingToFeed)}</span>`;
    } else {
      html = items.map((item, i) => {
        const qty   = $gameParty.numItems(item);
        const delta = _feedOpinion(item);
        const cal   = _feedCalories(item);
        const band = delta > 0 ? 'npc-good' : 'npc-bad';
        const sign   = delta > 0 ? '+' : '';
        return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._feedItem(${i})">` +
          `${_iconSpan(item.iconIndex || 0, 15)}<span>${_escapeHtml(item.name)}</span>` +
          `<span class="npc-note npc-aside-sm">×${qty}</span>` +
          (_feedKind(item) === 'food' && cal
            ? `<span class="npc-note npc-aside">${_escapeHtml(T.n('Empathize.calories', cal, { n: cal }))}</span>`
            : '') +
          `<span class="npc-${band} npc-aside">${sign}${delta}♥</span></div>`;
      }).join('');
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Which vial to open. One row per sealed vial in the pack, naming the illness
  // it carries rather than the item, since that is what the choice is about; the
  // odds of not being seen are printed on every row (they are the same for all
  // of them) so the number is under the cursor at the moment of the decision.
  // Party members are dosed openly, so their own panel prints no odds.
  Scene_NPCEmpathize.prototype._buildInlineInfectActions = function (T) {
    const items  = this._infectItems || [];
    const covert = this._actorId == null;
    const chance = _infectChance(this._focusActor());
    let html = '';
    if (!items.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.noVialsToOpen)}</span>`;
    } else {
      const DS = window.DiseaseSystem;
      html = items.map((item, i) => {
        const id   = _diseaseVialId(item);
        const name = (DS && DS.displayName ? DS.displayName(id) : '') || item.name;
        const qty  = $gameParty.numItems(item);
        return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._infectWith(${i})">` +
          `${_iconSpan(item.iconIndex || 0, 15)}<span>${_escapeHtml(name)}</span>` +
          `<span class="npc-note npc-aside-sm">×${qty}</span>` +
          (covert ? `<span class="npc-bad npc-aside">~${chance}%</span>` : '') +
          `</div>`;
      }).join('');
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Cards submenu. Two shapes on one flag: what to put on the table before a
  // duel, or which of their cards to swap for one of yours.
  Scene_NPCEmpathize.prototype._buildInlineCardActions = function (T) {
    const CGx = window.CardGame;
    let html = '';

    if (!CGx) {
      html = '';
    } else if (this._cardMode === 'stake') {
      const stakes = this._cardStakeOptions();
      html = `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._startCardDuel({type:'none'})">` +
        `<span>${_escapeHtml(T.cardStakeFree)}</span></div>`;
      html += stakes.money.map(amount =>
        `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._startCardDuel({type:'money',amount:${amount}})">` +
        `<span>${_escapeHtml(T.cardStakeMoney)}</span>, <span class="npc-sub">${_euros(amount)}</span></div>`
      ).join('');
      if (stakes.item) {
        const mine   = $dataItems[stakes.item.playerItem.id];
        const theirs = stakes.item.npcItem.kind === 1 ? $dataWeapons[stakes.item.npcItem.id]
          : stakes.item.npcItem.kind === 2 ? $dataArmors[stakes.item.npcItem.id]
            : $dataItems[stakes.item.npcItem.id];
        if (mine && theirs) {
          const arg = JSON.stringify({ type: 'item', playerItem: stakes.item.playerItem, npcItem: stakes.item.npcItem })
            .replace(/"/g, '&quot;');
          html += `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._startCardDuel(${arg})">` +
            `${_iconSpan(mine.iconIndex || 0, 15)}<span>${_escapeHtml(mine.name)}</span>` +
            `<span class="npc-sub npc-aside-sm">&rarr;</span>` +
            `${_iconSpan(theirs.iconIndex || 0, 15)}<span>${_escapeHtml(theirs.name)}</span></div>`;
        }
      }
    } else if (this._cardMode === 'trade') {
      const offers = this._cardTradeOffers();
      if (!offers.length) {
        html = `<span class="npc-empty--inline">${_escapeHtml(T.cardNothingToSwap)}</span>`;
      } else {
        html = offers.map((offer, i) => {
          const theirs = CGx.nameOf(offer.theirs);
          const mine   = CGx.nameOf(offer.mine);
          return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._doCardTrade(${i})">` +
            `<span>${_escapeHtml(mine)}</span>` +
            `<span class="npc-sub npc-aside-sm">&rarr;</span>` +
            `<span class="npc-good">${_escapeHtml(theirs)}</span>` +
            `<span class="npc-note npc-aside">${CGx.statTotal(offer.mine)}/${CGx.statTotal(offer.theirs)}</span></div>`;
        }).join('');
      }
    }

    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._buildInlineBribeActions = function (T, opinion, npcName) {
    const BASE_TIERS = [
      { label: T.bribeSmall,  gold: 200,  op: 10, chance: 70 },
      { label: T.bribeMedium, gold: 500,  op: 22, chance: 80 },
      { label: T.bribeLarge,  gold: 1000, op: 40, chance: 90 },
    ];
    const bribeProfile = _getProfile(_getNPCName(this._eventId));
    const recentBribes = _countRecentInteractions(bribeProfile, 'bribe', 5);
    const costMult     = recentBribes >= 2 ? 1.5 : 1;
    const TIERS = BASE_TIERS.map(t => ({ ...t, gold: Math.round(t.gold * costMult) }));
    const gold    = $gameParty?.gold() ?? 0;
    const hostile = opinion <= -60;
    // Police officers (classId 44) never take a bribe; show that up front
    // instead of tier buttons that would just fail with a bounty on click.
    const LAW_CLASSES = [44];
    const evClassId   = bribeProfile?.assignedClassId ?? _extractClassId($gameMap?.event(this._eventId));
    const isLawNPC    = LAW_CLASSES.includes(evClassId);
    // A virtuous person takes no money at all (NPCSociety INCORRUPTIBLE_MORALITY).
    const incorruptible = !!window.NPCSocietyRegistry?.isIncorruptible?.(bribeProfile);

    let html = '';
    if (incorruptible) {
      html = `<span class="npc-empty--inline npc-bad">${_escapeHtml(T.bribeIncorruptible(npcName))}</span>`;
    } else if (isLawNPC) {
      html = `<span class="npc-empty--inline npc-bad">${_escapeHtml(T.bribeRefusedLaw ? T.bribeRefusedLaw(npcName) : `${npcName} refuses on principle.`)}</span>`;
    } else if (hostile) {
      html = `<span class="npc-empty--inline npc-bad">${_escapeHtml(T.bribeRefused(npcName))}</span>`;
    } else {
      html = TIERS.map((tier, i) => {
        const canAfford = gold >= tier.gold;
        const disabled  = !canAfford ? ' npc-action-disabled' : '';
        const extra     = costMult > 1 ? ` <span class="npc-note npc-amber">(×${costMult})</span>` : '';
        return `<div class="npc-chat-action-btn${disabled}" onmousedown="event.stopPropagation();SceneManager._scene._attemptBribe(${i})">` +
          `<span>${_escapeHtml(tier.label)}</span>` +
          `, <span class="npc-sub">${_euros(tier.gold)}</span>${extra}` +
          `<span class="npc-good npc-aside">+${tier.op}♥</span>` +
          `<span class="npc-note npc-aside-sm">${tier.chance}%</span></div>`;
      }).join('');
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Socialize submenu: praise / joke / story / poem / insult / ... grouped by
  // tone. Each lands on the focused party member's own reputation.
  Scene_NPCEmpathize.prototype._buildInlineSocialActions = function (T) {
    let cat = this._socialCatalog ? this._socialCatalog() : [];
    // Em cannot be cruel to Bubba: the hostile half of the catalog is not
    // offered at all when she is the one talking to him.
    if (this._emCtx?.()?.bubba) cat = cat.filter(c => c.tone !== 'negative');
    // Neither can Bubba be cruel to anybody: the man has never insulted a
    // stranger in his life and is not starting in this menu.
    if (this._bubbaCtx?.()) cat = cat.filter(c => c.tone !== 'negative');
    // The entertainment moves carry a ☺ in the Fun colour: those are the ones
    // that top up the Fun meter of the party AND of the NPC when they land.
    let html = cat.map(c => {
      const fun = (FUN_ACTIONS && FUN_ACTIONS[c.id])
        ? ` <span class="npc-gold" title="${_escapeHtml(T.funHint || '')}">☺</span>` : '';
      return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._socialInteract('${c.id}')">` +
        `<span class="${OPT}">${_escapeHtml(c.label)}</span>${fun}</div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._buildInlineIntrospectActions = function (T) {
    const actor = this._focusActor() || $gameParty?.leader();
    const profile = _getProfile(actor?.name?.());
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    const canAfford50 = kp >= 50;
    const curName = actor?.name?.() || '';
    const curGenderVal = actor?.gender ? actor.gender() : (profile?.gender ?? 0);
    const curGenderLabel = _presetGenderLabel(curGenderVal, T);
    const curSexKey = profile?._orientOverride?.sexualKey || actor?._orientOverride?.sexualKey;
    const db = _orientationData();
    const curOrientEntry = curSexKey ? (db.sexual || []).find(o => o.key === curSexKey) : null;
    const curOrientLabel = curOrientEntry ? (_dbText(curOrientEntry.name) || curOrientEntry.key) : '';
    const curCreedId = actor?._ideologyId || profile?.ideologyId;
    const curCreedLabel = _ideologyLabel(curCreedId);

    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.introspectTitle || 'Introspection')} · <span class="${canAfford50 ? 'npc-good' : 'npc-bad'}">${kp} KP</span></div>`;

    // 1. Change Name
    html += `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._openNameModal()">` +
      `<span class="${OPT}">${_escapeHtml(T.introspectChangeName || 'Change Name')}</span>` +
      `<span class="npc-sub npc-aside">${_escapeHtml(curName)}</span></div>`;

    // 2. Change Gender (50 KP)
    html += `<div class="npc-chat-action-btn${canAfford50 ? '' : ' npc-action-disabled'}" onmousedown="event.stopPropagation();SceneManager._scene._openGenderSelect()">` +
      `<span class="${OPT}">${_escapeHtml(T.introspectChangeGender || 'Change Gender')}</span>` +
      (curGenderLabel ? `<span class="npc-sub npc-aside-sm">${_escapeHtml(curGenderLabel)}</span>` : '') +
      `<span class="npc-aside${canAfford50 ? ' npc-good' : ' npc-bad'}">50 KP</span></div>`;

    // 3. Change Sexual Orientation (50 KP)
    html += `<div class="npc-chat-action-btn${canAfford50 ? '' : ' npc-action-disabled'}" onmousedown="event.stopPropagation();SceneManager._scene._openOrientationSelect()">` +
      `<span class="${OPT}">${_escapeHtml(T.introspectChangeOrientation || 'Change Sexual Orientation')}</span>` +
      (curOrientLabel ? `<span class="npc-sub npc-aside-sm">${_escapeHtml(curOrientLabel)}</span>` : '') +
      `<span class="npc-aside${canAfford50 ? ' npc-good' : ' npc-bad'}">50 KP</span></div>`;

    // 4. Change Creed
    html += `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._openCreedSelect()">` +
      `<span class="${OPT}">${_escapeHtml(T.introspectChangeCreed || 'Change Creed')}</span>` +
      (curCreedLabel ? `<span class="npc-sub npc-aside">${_escapeHtml(curCreedLabel)}</span>` : '') +
      `</div>`;

    // 5. Cancel
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._openNameModal = function () {
    if (!this._overlay || this._nameModalOpen) return;
    const T = _getT();
    const actor = this._focusActor() || $gameParty?.leader();
    const currentName = actor?.name?.() || '';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const modal = document.createElement('div');
    modal.className = 'npc-chat-modal-backdrop';
    modal.innerHTML = `
      <div class="npc-chat-modal" onmousedown="event.stopPropagation();">
        <div class="npc-chat-modal-title">${esc(T.introspectChangeNamePrompt || 'Enter new character name:')}</div>
        <input type="text" id="npc-dlg-name-input" class="npc-chat-modal-input"
          maxlength="24" autocomplete="off" spellcheck="false"
          value="${esc(currentName)}" />
        <div class="npc-chat-modal-btns">
          <button class="npc-chat-modal-cancel" onmousedown="event.stopPropagation();SceneManager._scene._closeNameModal?.()">${esc(T.cancel)}</button>
          <button class="npc-chat-modal-send" onmousedown="event.stopPropagation();SceneManager._scene._submitNameModal?.()">${esc(T.confirm)}</button>
        </div>
      </div>`;
    modal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.target === modal) this._closeNameModal();
    });

    this._overlay.appendChild(modal);
    this._nameModalEl = modal;
    this._nameModalOpen = true;
    this._inputFocused = true;
    this._activeArea = 'input';

    const input = modal.querySelector('#npc-dlg-name-input');
    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          this._submitNameModal();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this._closeNameModal();
        }
      });
    }
  };

  Scene_NPCEmpathize.prototype._closeNameModal = function () {
    if (this._nameModalEl) {
      this._nameModalEl.remove();
      this._nameModalEl = null;
    }
    this._nameModalOpen = false;
    this._inputFocused = false;
    this._activeArea = 'actions';
    this._updateSelectionHighlight?.();
  };

  Scene_NPCEmpathize.prototype._submitNameModal = function () {
    const input = document.getElementById('npc-dlg-name-input');
    const val = input ? input.value.trim() : '';
    this._closeNameModal();
    if (!val) return;
    const actor = this._focusActor() || $gameParty?.leader();
    if (!actor) return;
    const oldName = actor.name();
    if (val === oldName) return;
    actor.setName(val);
    const society = $gameSystem && $gameSystem._npcSociety;
    if (society && society[oldName]) {
      society[val] = society[oldName];
      society[val]._npcName = val;
      delete society[oldName];
    }
    if (this._npcName === oldName) {
      this._npcName = val;
    }
    const T = _getT();
    this._joinMessage = { type: 'good', text: T.introspectNameSuccess || 'Name changed successfully.' };
    SoundManager.playOk();
    this._render();
  };

  Scene_NPCEmpathize.prototype._openGenderSelect = function () {
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    if (kp < 50) {
      SoundManager.playBuzzer();
      return;
    }
    SoundManager.playCursor();
    this._socialMode = false;
    this._introspectGenderMode = true;
    this._menuIndex = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._buildInlineIntrospectGenderActions = function (T) {
    const actor = this._focusActor() || $gameParty?.leader();
    const curGender = actor?.gender ? actor.gender() : 0;
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    const canAfford = kp >= 50;

    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.introspectGenderPrompt || 'Select gender')} (${kp} KP)</div>`;
    const genders = [
      { id: 0, label: T.genderMale },
      { id: 1, label: T.genderFemale },
      { id: 2, label: T.genderNonBinary },
      { id: 3, label: T.genderCocoon },
    ];
    html += genders.map(g => {
      const isCur = g.id === curGender;
      const curBadge = isCur ? ` <span class="npc-good npc-em">✓</span>` : '';
      return `<div class="npc-chat-action-btn${canAfford ? '' : ' npc-action-disabled'}" onmousedown="event.stopPropagation();SceneManager._scene._selectIntrospectGender(${g.id})">` +
        `<span class="${OPT}">${_escapeHtml(g.label)}</span>` +
        `${curBadge}<span class="npc-aside npc-good">50 KP</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelIntrospectSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._selectIntrospectGender = function (genderId) {
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    const T = _getT();
    if (kp < 50) {
      SoundManager.playBuzzer();
      this._joinMessage = { type: 'bad', text: T.introspectNotEnoughKp };
      this._render();
      return;
    }
    const actor = this._focusActor() || $gameParty?.leader();
    if (!actor) return;
    const curGender = actor.gender ? actor.gender() : 0;
    if (curGender === genderId) {
      SoundManager.playCursor();
      this._cancelIntrospectSubMode();
      return;
    }
    $gameSystem.spendKnowledge(50);
    if (typeof actor.setGender === 'function') {
      actor.setGender(genderId);
    } else {
      actor._pvGender = genderId;
    }
    const memberIndex = $gameParty?.members ? $gameParty.members().indexOf(actor) : -1;
    if (memberIndex >= 0 && window.CharacterCreationShared?.applyGenderAndReproduction) {
      window.CharacterCreationShared.applyGenderAndReproduction(memberIndex, genderId, { keepOrgans: true });
    }
    const profile = _getProfile(actor.name());
    if (profile) profile.gender = genderId;
    SoundManager.playOk();
    this._joinMessage = { type: 'good', text: T.introspectGenderSuccess || 'Gender changed successfully.' };
    this._cancelIntrospectSubMode();
  };

  Scene_NPCEmpathize.prototype._openOrientationSelect = function () {
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    if (kp < 50) {
      SoundManager.playBuzzer();
      return;
    }
    SoundManager.playCursor();
    this._socialMode = false;
    this._introspectOrientMode = true;
    this._menuIndex = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._buildInlineIntrospectOrientActions = function (T) {
    const actor = this._focusActor() || $gameParty?.leader();
    const profile = _getProfile(actor?.name?.());
    const curOrientKey = profile?._orientOverride?.sexualKey || actor?._orientOverride?.sexualKey;
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    const canAfford = kp >= 50;

    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.introspectOrientationPrompt || 'Select sexual orientation')} (${kp} KP)</div>`;
    const db = _orientationData();
    const list = db.sexual || [];
    html += list.map(entry => {
      const isCur = entry.key === curOrientKey;
      const curBadge = isCur ? ` <span class="npc-good npc-em">✓</span>` : '';
      const label = _dbText(entry.name) || entry.key;
      return `<div class="npc-chat-action-btn${canAfford ? '' : ' npc-action-disabled'}" onmousedown="event.stopPropagation();SceneManager._scene._selectIntrospectOrientation('${entry.key}')">` +
        `<span class="${OPT}">${_escapeHtml(label)}</span>` +
        `${curBadge}<span class="npc-aside npc-good">50 KP</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelIntrospectSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._selectIntrospectOrientation = function (key) {
    const kp = ($gameSystem?.getKnowledge ? $gameSystem.getKnowledge() : ($gameSystem?._knowledgePoints ?? 0)) || 0;
    const T = _getT();
    if (kp < 50) {
      SoundManager.playBuzzer();
      this._joinMessage = { type: 'bad', text: T.introspectNotEnoughKp };
      this._render();
      return;
    }
    const actor = this._focusActor() || $gameParty?.leader();
    if (!actor) return;
    const profile = _getProfile(actor.name());
    const curOrientKey = profile?._orientOverride?.sexualKey || actor?._orientOverride?.sexualKey;
    if (curOrientKey === key) {
      SoundManager.playCursor();
      this._cancelIntrospectSubMode();
      return;
    }
    const db = _orientationData();
    const entry = (db.sexual || []).find(o => o.key === key);
    $gameSystem.spendKnowledge(50);
    actor._orientOverride = actor._orientOverride || {};
    actor._orientOverride.sexualKey = key;
    if (entry?.correspondsTo) {
      actor._orientOverride.romanticKey = entry.correspondsTo;
    }
    if (profile) {
      profile._orientOverride = profile._orientOverride || {};
      profile._orientOverride.sexualKey = key;
      if (entry?.correspondsTo) {
        profile._orientOverride.romanticKey = entry.correspondsTo;
      }
    }
    SoundManager.playOk();
    this._joinMessage = { type: 'good', text: T.introspectOrientationSuccess || 'Sexual orientation changed successfully.' };
    this._cancelIntrospectSubMode();
  };

  Scene_NPCEmpathize.prototype._openCreedSelect = function () {
    SoundManager.playCursor();
    this._socialMode = false;
    this._introspectCreedMode = true;
    this._menuIndex = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._onCreedFilterInput = function (query) {
    const q = String(query || '').toLowerCase().trim();
    const btns = this._overlay?.querySelectorAll('.npc-creed-btn');
    if (!btns) return;
    btns.forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle('npc-hidden', !(!q || text.includes(q)));
    });
  };

  Scene_NPCEmpathize.prototype._buildInlineIntrospectCreedActions = function (T) {
    const actor = this._focusActor() || $gameParty?.leader();
    const profile = _getProfile(actor?.name?.());
    const curCreedId = actor?._ideologyId || profile?.ideologyId;
    let list = window.NPCShared?.ideologyList?.() || [];
    list = list.filter(e => e && !e.alien);
    const sorted = list.map(e => ({
      id: e.id,
      label: _ideologyLabel(e.id) || e.id
    })).sort((a, b) => a.label.localeCompare(b.label));

    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.introspectCreedPrompt || 'Select a new creed')}</div>`;
    html += `<input type="text" class="npc-chat-modal-input" placeholder="${_escapeHtml(T.introspectFilterCreed || 'Filter creeds...')}" ` +
      `oninput="SceneManager._scene._onCreedFilterInput(this.value)" onkeydown="event.stopPropagation()" ` +
      `/>`;
    html += sorted.map(c => {
      const isCur = c.id === curCreedId;
      const curBadge = isCur ? ` <span class="npc-good npc-em">✓</span>` : '';
      return `<div class="npc-chat-action-btn npc-creed-btn" onmousedown="event.stopPropagation();SceneManager._scene._selectIntrospectCreed('${c.id}')">` +
        `<span class="${OPT}">${_escapeHtml(c.label)}</span>${curBadge}</div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelIntrospectSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._selectIntrospectCreed = function (id) {
    const actor = this._focusActor() || $gameParty?.leader();
    const T = _getT();
    if (!actor) return;
    const curCreedId = actor._ideologyId || _getProfile(actor.name())?.ideologyId;
    if (curCreedId === id) {
      SoundManager.playCursor();
      this._cancelIntrospectSubMode();
      return;
    }
    actor._ideologyId = id;
    const profile = _getProfile(actor.name());
    if (profile) {
      profile.ideologyId = id;
      const list = window.NPCShared?.ideologyList?.() || [];
      profile.ideologyIndex = list.findIndex(i => i && i.id === id);
    }
    SoundManager.playOk();
    this._joinMessage = { type: 'good', text: T.introspectCreedSuccess || 'Creed changed successfully.' };
    this._cancelIntrospectSubMode();
  };

  Scene_NPCEmpathize.prototype._cancelIntrospectSubMode = function () {
    this._introspectGenderMode = false;
    this._introspectOrientMode = false;
    this._introspectCreedMode  = false;
    this._socialMode           = true;
    this._menuIndex            = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._buildInlineStealActions = function (T) {
    const items   = this._stealItems;
    const agility = $gameParty.leader()?.agi ?? 10;
    let html = '';
    if (!items.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.noItems)}</span>`;
    } else {
      html = items.map((item, i) => {
        const key    = `${item.type}_${item.id}`;
        const result = this._stealAttempted[key];
        const done   = !!result;
        const chance = window.StealCalculator
          ? window.StealCalculator.calculateStealChance(item.data, agility)
          : 50;
        const cc = chance >= 70 ? 'good' : chance >= 40 ? 'warm' : 'bad';
        const badge = result === 'success'
          ? ` <span class="npc-good npc-em">${_escapeHtml(T.successLabel)}</span>`
          : result === 'fail'
          ? ` <span class="npc-bad npc-em">${_escapeHtml(T.failedLabel)}</span>`
          : ` <span class="npc-score--${cc}">${chance}%</span>`;
        return `<div class="npc-chat-action-btn${done ? ' npc-action-disabled' : ''}" onmousedown="event.stopPropagation();SceneManager._scene._attemptSteal(${i})">` +
          `${_iconSpan(item.data.iconIndex || 0, 15)}<span>${_escapeHtml(item.data.name)}</span>${badge}</div>`;
      }).join('');
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // ============================================================================
  // Info panel
  // ============================================================================

  // Curated dossier block for an event tagged "Preset: <name>". Everything here
  // is hand-authored data from CharacterCreationPresets.js, so it is shown as
  // its own section rather than mixed into the sim-derived rows below it.
  // The house icons for the three lists on a character sheet, used both on the
  // headings and as the fallback for an entry that carries none of its own
  // (Icons.json: gold star, open book, scroll).
  const TRAIT_ICON = 87;
  const EQUIP_ICON = 322;
  const SPEC_ICON  = 189;
  const SKILL_ICON = 193;

  // `opts.omitLists` leaves traits, specializations and skills out: a leader's
  // article prints those off the character sheet instead, and a dossier that
  // also printed them put every one of them on the page twice.
  Scene_NPCEmpathize.prototype._buildPresetHTML = function (preset, T, lang, opts) {
    if (!preset) return '';
    const omitLists = !!(opts && opts.omitLists);
    const rows = [];
    const className = _presetClassName(preset);
    if (className) rows.push(_kvRow(126, T.vocationLbl, _escapeHtml(className)));
    if (preset.birthDate) {
      const age  = _presetAge(preset.birthDate);
      const born = _presetBirthDate(preset.birthDate);
      rows.push(_kvRow(220, T.bornLbl,
        _escapeHtml(age != null ? `${born} (${age} ${T.yearsAbbr})` : born)));
    }
    const hometown = _presetHometown(preset);
    if (hometown) {
      rows.push(_kvRow(190, T.hometownLbl, _escapeHtml(hometown)));
    }
    if (preset.nationId) {
      // Link the nation only when the archive actually has a page for it, so a
      // dossier naming a country the history sim doesn't track (or a place that
      // is no longer a nation) stays plain text instead of a dead link.
      let known = false;
      try { known = !!Wiki.get?.('nation', preset.nationId); } catch (e) {}
      rows.push(_kvRow(97, T.nationOfBirthLbl,
        known ? _wikiLink('nation', preset.nationId) : _escapeHtml(preset.nationId)));
    }
    const genderLabel = _presetGenderLabel(preset.gender, T);
    if (genderLabel) rows.push(_kvRow(84, T.genderLbl, _escapeHtml(genderLabel)));
    if (preset.money) rows.push(_kvRow(314, T.wealthLbl, _escapeHtml(_euros(preset.money))));

    let traitsHTML = '';
    const traitBank = _presetTraitBank();
    if (!omitLists && preset.traits?.length && traitBank.length) {
      const tags = preset.traits.map(id => {
        const trait = traitBank.find(t => t.id === id);
        return trait
          ? `<span class="npc-tag" ${_ccHover('trait', trait.id)}>${_iconSpan(trait.icon || TRAIT_ICON, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`
          : '';
      }).filter(Boolean).join('');
      if (tags) traitsHTML = `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(TRAIT_ICON, 15)} ${_escapeHtml(T.traits)}</div><div class="npc-tag-wrap">${tags}</div>`;
    }

    let specsHTML = '';
    if (!omitLists && preset.specializations?.length && window.Specializations?.ready) {
      const tags = preset.specializations.map(entry => {
        const spec = window.Specializations.byId.get(entry.id);
        if (!spec) return '';
        return `<span class="npc-tag">${_escapeHtml(window.Specializations.displayName(spec))} <span class="npc-sub">(${_escapeHtml(window.Specializations.levelName(entry.level))})</span></span>`;
      }).filter(Boolean).join('');
      if (tags) specsHTML = `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SPEC_ICON, 15)} ${_escapeHtml(T.specializations)}</div><div class="npc-tag-wrap">${tags}</div>`;
    }

    let skillsHTML = '';
    if (!omitLists && preset.skills?.length && $dataSkills) {
      const tags = preset.skills.map(id => {
        const sk = $dataSkills[id];
        return sk ? `<span class="npc-tag" ${_ccHover('skill', sk.id)}>${_iconSpan(sk.iconIndex || SKILL_ICON, 15)}${_escapeHtml(sk.name)}</span>` : '';
      }).filter(Boolean).join('');
      if (tags) skillsHTML = `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SKILL_ICON, 15)} ${_escapeHtml(T.skills)}</div><div class="npc-tag-wrap">${tags}</div>`;
    }

    const lore = _presetLore(preset, lang);
    const loreHTML = lore
      ? `<div class="npc-sec-hdr npc-mt-2">${_escapeHtml(T.history)}</div>` +
        `<div class="npc-thought">${_linkify(lore)}</div>`
      : '';

    if (!rows.length && !traitsHTML && !specsHTML && !skillsHTML && !loreHTML) return '';
    return `<hr class="npc-r-sep">` +
      `<div class="npc-sec-hdr">${_escapeHtml(T.dossierSection)}</div>` +
      rows.join('') + loreHTML + traitsHTML + specsHTML + skillsHTML;
  };

  // Health.Traits is the live trait bank; the society data loader keeps its own
  // copy, used when Health_Core has not populated it yet.
  function _presetTraitBank() {
    const bank = window.Health?.Traits;
    if (bank?.length) return bank;
    return window._NPCSocietyDataLoader?.traits || [];
  }

  // ============================================================================
  // Info panel: what a person does, owns and eats
  // ============================================================================
  // Rows read straight off the simulation for somebody it owns: the band they
  // are out with, the artifacts the chronicle put in their hands, what they
  // carry, their diet and whether the party signs their pay. Each answers ''
  // when there is nothing to say, so the panel only grows for who has it.

  const _INFO_CARRY_CAP = 12;       // item tags shown before "+N more"
  const _INFO_MIN_PER_DAY = 1440;

  // An artifact, or a piece made to measure at somebody's bench, is named in
  // bold in the theme's rarity ink (.rarity--*, the ladder ItemSystemUtils
  // .rarityClass hands out), never in a colour of its own.
  function _rareName(innerHTML, tier) {
    return `<b class="rarity--${tier === 'epic' ? 'epic' : 'legendary'}">${innerHTML}</b>`; // i18n-ignore: rarity class ids
  }

  // The chronicle's artifact records, read once per section (the manager
  // localizes the whole map on every ask).
  function _artifactRecords() {
    try { return window.HistoryManager?.getArtifactRecords?.() || {}; } catch (e) { return {}; }
  }

  // Whether an item they carry is one of the world's artifacts: theirs by the
  // chronicle's hand (profile.artifacts) or on the chronicle's record at all.
  function _isArtifactItem(profile, id, records) {
    if ((profile?.artifacts || []).some(a => a && a.kind === 'item' && Number(a.id) === id)) return true; // i18n-ignore: artifact kind id
    return !!records?.['item:' + id]; // i18n-ignore: artifact record key
  }

  function _infoNow() {
    return (typeof $gameVariables !== 'undefined' && $gameVariables?.value(114)) || 0;
  }

  // "Exploring the Omega Tower, floors 3 to 8, with Ada and Bo, back in 4 days"
  // while a band (NPCLifeSim.Bands) has them; a drafted band that has not set
  // out yet reads as leaving. '' for everybody else.
  function _expeditionRowText(npcName) {
    const B = window.NPCLifeSim?.Bands;
    if (!npcName || !B?.bandOf) return '';
    let band = null;
    try { band = B.bandOf(npcName); } catch (e) { band = null; }
    if (!band || !Array.isArray(band.members)) return '';
    const now = _infoNow();
    if (now >= band.until) return '';
    const kind = ['tower', 'dungeon', 'space'].includes(band.kind) ? band.kind : 'dungeon'; // i18n-ignore: band kind ids
    const others = band.members.filter(n => n && n !== npcName);
    const names = others.join(', ');
    const range = Array.isArray(band.floorRange) ? band.floorRange : [];
    const params = { names, low: range[0] ?? '?', high: range[1] ?? range[0] ?? '?' };
    const setOut = now >= band.since;
    let what;
    if (!setOut) {
      what = window.T('Empathize.dossier.band.' + kind + 'Soon' + (others.length ? '' : 'Alone'), params);
    } else if (kind === 'space' && B.crewAtBase?.(band, now)) {
      what = window.T('Empathize.dossier.band.spaceBase' + (others.length ? '' : 'Alone'), params);
    } else {
      what = window.T('Empathize.dossier.band.' + kind + (others.length ? '' : 'Alone'), params);
    }
    const days = Math.ceil(((setOut ? band.until : band.since) - now) / _INFO_MIN_PER_DAY);
    const when = days <= 0
      ? window.T(setOut ? 'Empathize.dossier.band.backToday' : 'Empathize.dossier.band.leavesToday')
      : window.T.n(setOut ? 'Empathize.dossier.band.backIn' : 'Empathize.dossier.band.leavesIn', days);
    return window.T('Empathize.dossier.band.withWhen', { what, when });
  }

  // The world artifacts in their keeping (profile.artifacts, named by the
  // chronicle's own record), each a link to its archive page.
  function _artifactsSectionHTML(profile) {
    const list = Array.isArray(profile?.artifacts) ? profile.artifacts : [];
    if (!list.length) return '';
    const records = _artifactRecords();
    const bank = {
      item:   typeof $dataItems   !== 'undefined' ? $dataItems   : null,
      weapon: typeof $dataWeapons !== 'undefined' ? $dataWeapons : null,
      armor:  typeof $dataArmors  !== 'undefined' ? $dataArmors  : null,
    };
    let tags = '';
    const seen = new Set();
    for (const a of list) {
      if (!a || a.id == null) continue;
      const key = `${a.kind}:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rec = records[key] || null;
      const data = bank[a.kind]?.[a.id] || null;
      const name = rec?.name || data?.name;
      if (!name) continue;
      // The ink sits on the name itself, inside the link, so the link's own
      // colour does not paint over it.
      const nameHTML = _rareName(_escapeHtml(name));
      const link = rec
        ? `<span class="npc-wiki-link" onmousedown="event.stopPropagation();window.NPCEmpathize.openEntity('artifact','${_encId(key)}')">${nameHTML}</span>`
        : nameHTML;
      tags += `<span class="npc-tag">${_iconSpan(data?.iconIndex ?? 245, 15)}${link}</span>`;
    }
    if (!tags) return '';
    return `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(window.T('Empathize.dossier.artifactsTitle'))}</div>` +
      `<div class="npc-tag-wrap">${tags}</div>`;
  }

  // Which shelf a carried item goes on.
  function _carryGroupOf(id, item) {
    const S = window.NPCShared;
    if (S?.vehicleKindOf?.(id)) return 'vehicle';
    if (S?.isCarKeys?.(id)) return 'keys';
    try { if (window.NPCSim?.Addictions?.reliefOf?.(item)?.length) return 'fix'; } catch (e) { /* not a fix */ }
    if (S?.Diet?.isFood?.(item)) return 'food';
    return 'other';
  }

  // What is in their hands and pockets (profile.itemIds), grouped by shelf,
  // counted, and capped so a hoarder does not run the panel off the page.
  function _carriedSectionHTML(profile) {
    const ids = Array.isArray(profile?.itemIds) ? profile.itemIds : [];
    if (!ids.length || typeof $dataItems === 'undefined' || !$dataItems) return '';
    const ORDER = ['vehicle', 'keys', 'food', 'fix', 'other']; // i18n-ignore: carry shelf ids
    const groups = new Map(ORDER.map(g => [g, new Map()]));
    for (const raw of ids) {
      const id = Number(raw);
      const item = $dataItems[id];
      if (!item || !item.name) continue;
      const shelf = groups.get(_carryGroupOf(id, item));
      shelf.set(id, (shelf.get(id) || 0) + 1);
    }
    const records = _artifactRecords();
    let shown = 0, hidden = 0, rows = '';
    for (const g of ORDER) {
      const shelf = groups.get(g);
      if (!shelf.size) continue;
      let tags = '';
      for (const [id, count] of shelf) {
        if (shown >= _INFO_CARRY_CAP) { hidden++; continue; }
        const item = $dataItems[id];
        const nameHTML = _isArtifactItem(profile, id, records) ? _rareName(_escapeHtml(item.name)) : _escapeHtml(item.name);
        tags += `<span class="npc-tag" ${_ccHover('item', id)}>${_iconSpan(item.iconIndex || 0, 15)}${nameHTML}` +
          (count > 1 ? ` <span class="npc-sub">x${count}</span>` : '') + `</span>`;
        shown++;
      }
      if (tags) {
        rows += `<div class="npc-ident-row npc-mt-1"><span class="npc-sub">${_escapeHtml(window.T('Empathize.dossier.carry.' + g))}:</span></div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }
    if (!rows) return '';
    if (hidden > 0) rows += `<div class="npc-note">${_escapeHtml(window.T('Empathize.dossier.more', { n: hidden }))}</div>`;
    return `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(window.T('Empathize.dossier.carryTitle'))}</div>${rows}`;
  }

  // Vegan or vegetarian, off the traits NPCShared.Diet reads: vegan is the one
  // that refuses dairy as well as meat.
  function _dietBadgeHTML(profile) {
    const Diet = window.NPCShared?.Diet;
    if (!profile || !Diet?.forbiddenFor) return '';
    let no;
    try { no = Diet.forbiddenFor(profile); } catch (e) { return ''; }
    const key = no.has('dairy') ? 'vegan' : no.has('meat') ? 'vegetarian' : null; // i18n-ignore: diet ids
    return key ? `<span class="npc-badge npc-good">${_escapeHtml(window.T('Empathize.dossier.diet.' + key))}</span>` : '';
  }

  // The party owns the place they work (window.WorkplaceDeeds): their pay is
  // the party's to find, and the job row says so. Nothing in a world with no
  // economy to own a deed in.
  function _employerBadgeHTML(profile) {
    const WD = window.WorkplaceDeeds;
    const mapId = profile?.workMapId;
    if (!WD?.owns || !mapId) return '';
    if (window.NPCShared?.WorldModes?.hasEconomy && !window.NPCShared.WorldModes.hasEconomy()) return '';
    let owned = false;
    try { owned = !!WD.owns(mapId); } catch (e) { owned = false; }
    return owned ? ` <span class="npc-badge npc-good">${_escapeHtml(window.T('Empathize.dossier.employerParty'))}</span>` : '';
  }

  Scene_NPCEmpathize.prototype._buildInfoHTML = function (displayName, subParts, profile, T, dl, opinion, lang, classId, npcName, preset) {
    // Looking at a real party member: everything the player owns on that
    // character (specializations, what they are carrying) is read off the actor
    // rather than off the society roll for somebody of the same name.
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    // A non-sentient subject (a creature class, 63+; NPCCreature owns the
    // boundary) holds no job, no money, no possessions, no creed and no
    // faction, so the society roll behind it , which deals every profile the
    // same way , must not be printed as if it did. The rows below are the
    // whole of what was reading as "random human details" on an animal: a
    // wage bracket, a street address, an ideology, a party card, a morality
    // score and a kit of equipment, all of them rolled for a person.
    const nonSentient = !!this._isNonSentientSubject?.();
    const wealthLabels = [T.destitute, T.poor, T.workingClass, T.middleClass, T.wealthy];
    const wealthLabel  = wealthLabels[profile?.wealthTierBase ?? 2] ?? '';
    const morality     = profile?.moralityScore ?? 0;
    const moralMap     = [
      { threshold: -60,      label: T.evil,     color: 'var(--text-cost-bad)' },
      { threshold: -20,      label: T.dishonest, band: 'bad' },
      { threshold:  20,      label: T.neutral,   band: 'flat' },
      { threshold:  60,      label: T.honest,    band: 'good' },
      { threshold: Infinity, label: T.virtuous,  band: 'good' },
    ];
    const moralEntry = moralMap.find(e => morality < e.threshold);
    const moralBand = moralEntry.band;

    const badgeHTML = `
      <div class="npc-badge-row">
        ${wealthLabel && !nonSentient ? `<span class="npc-badge">${_escapeHtml(wealthLabel)}</span>` : ''}
        ${nonSentient ? '' : `<span class="npc-badge npc-score--${moralBand}">Mor. ${morality} (${_escapeHtml(moralEntry.label)})</span>`}
        ${profile?._isPresetCharacter ? `<span class="npc-badge">${_iconSpan(82, 15)}${_escapeHtml(T.presetCharacterBadge)}</span>` : ''}
        ${nonSentient ? '' : _dietBadgeHTML(profile)}
      </div>`;

    const pers         = dl?.personalities?.[profile?.personalityIndex];
    const persName     = pers ? _personalityLabel(pers.name) : '';
    const persIcon     = pers?.iconIndex || 4;
    const faction      = (profile?.factionIndex >= 0 && dl?.factions) ? dl.factions[profile.factionIndex] : null;
    const ideology     = window.NPCShared?.ideologyFor(profile) ?? null;
    const ideologyName = ideology
      ? ((window.DataService?.t?.(ideology.name)) ||
         (ideology.name || '').split('.').pop().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      : null;

    // What body this is, always , a person is a Humanoid and that is worth
    // saying, not only worth saying when it is something else. A hybrid reads
    // as both halves ("Spider / Humanoid"). Read off the actor when the panel
    // is inspecting a party member, off the society profile otherwise.
    const archetypeName = _archetypeRowLabel(actorObj, profile);

    let identHTML = '';
    if (profile) {
      if (persName)      identHTML += `<div class="npc-ident-row">${_iconSpan(persIcon, 17)}<span>${_escapeHtml(persName)}</span></div>`;
      if (archetypeName) {
        // A language that has not been given the word yet carries it as an
        // empty string; the row then reads as the archetype alone rather than
        // as a stray colon in front of it.
        const archLbl = T.archetypeLbl || '';
        identHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}` +
          (archLbl ? `<span class="npc-sub">${_escapeHtml(archLbl)}:</span>&nbsp;` : '') +
          `<span>${_escapeHtml(archetypeName)}</span></div>`;
      }
      const genderVal   = actorObj?.gender ? actorObj.gender() : profile?.gender;
      const genderLabel = _presetGenderLabel(genderVal, T);
      if (genderLabel)  identHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(T.genderLbl)}:</span>&nbsp;<span>${_escapeHtml(genderLabel)}</span></div>`;
      if (wealthLabel && !nonSentient) identHTML += `<div class="npc-ident-row">${_iconSpan(314, 17)}<span>${_escapeHtml(wealthLabel)}</span></div>`;
      const homeAddr = nonSentient ? null : _homeAddressLabel(profile, T);
      if (homeAddr) {
        identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(T.residenceLbl || 'Residence')}:</span>&nbsp;<span>${_escapeHtml(homeAddr)}</span></div>`;
      } else if (profile?.isHomeless && !nonSentient) {
        identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(T.residenceLbl || 'Residence')}:</span>&nbsp;<span class="npc-bad">${_escapeHtml(T.homelessLbl || 'Homeless')}</span></div>`;
      }
      const travelText = nonSentient ? '' : _travelRowText(npcName, profile);
      if (travelText) identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(travelText)}</span></div>`;
      const bandText = (nonSentient || actorObj) ? '' : _expeditionRowText(npcName);
      if (bandText) identHTML += `<div class="npc-ident-row">${_iconSpan(322, 17)}<span class="npc-sub">${_escapeHtml(bandText)}</span></div>`;
      if (ideologyName && !nonSentient) identHTML += `<div class="npc-ident-row">${_iconSpan(186, 17)}${_wikiLink('ideology', ideology ? ideology.id : '', ideologyName)}</div>`;
      const refugeeText = nonSentient ? '' : _refugeeRowText(npcName);
      if (refugeeText) identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(refugeeText)}</span></div>`;
      const convertingText = nonSentient ? '' : _conversionRowText(npcName);
      if (convertingText) identHTML += `<div class="npc-ident-row">${_iconSpan(186, 17)}<span class="npc-sub">${_escapeHtml(convertingText)}</span></div>`;
      // A party member's own doubts and party drift (NPCEmpathizeUI_Lessons.js, CIVICS).
      if (actorObj && !nonSentient) identHTML += this._actorCivicRows?.(actorObj) || '';
      // What they told the party when asked their views (Ask their views).
      if (!actorObj && !nonSentient) identHTML += this._npcViewsRows?.(npcName, profile) || '';
      if (faction && !nonSentient)      identHTML += `<div class="npc-ident-row">${_iconSpan(faction.iconIndex || 187, 17)}${_wikiLink('faction', _factionDisplayName(faction))}</div>`;
      if (!nonSentient) identHTML += `<div class="npc-ident-row">${_iconSpan(175, 17)}<span class="npc-score--${moralBand}">${_escapeHtml(moralEntry.label)}</span><span class="npc-faint">&nbsp;- ${morality}</span></div>`;
      // A price on their head (NPCLifeSim wantedBounty): fair game, and paid out on a kill.
      const wantedBounty = nonSentient ? 0 : (window.NPCSystem?.bountyOf?.(npcName) || 0);
      if (wantedBounty > 0) {
        const wantedMoney = window.MoneyFormatter?.format ? window.MoneyFormatter.format(wantedBounty) : String(wantedBounty);
        identHTML += `<div class="npc-ident-row">${_iconSpan(161, 17)}<span class="npc-sub">${_escapeHtml(T.bountyLbl)}:</span>&nbsp;<span class="npc-bad">${_escapeHtml(wantedMoney)}</span></div>`;
      }
      // Em (Switch 48): where this person stands on the witch who fed the
      // spear. Shown only while she is the one doing the talking.
      const emCtx = this._emCtx?.();
      if (emCtx) {
        const stanceLabel = lang === 'it'
          ? emCtx.data.label
          : emCtx.data.label;
        if (stanceLabel) {
          const stanceBand = emCtx.key === 'zealot' ? 'bad'
            : emCtx.key === 'annoyed' ? 'flat'
            : 'good';
          identHTML += `<div class="npc-ident-row">${_iconSpan(79, 17)}` +
            `<span class="npc-sub">${_escapeHtml(T.towardEmLbl)}:</span>&nbsp;` +
            `<span class="npc-score--${stanceBand}">${_escapeHtml(stanceLabel)}</span></div>`;
        }
      }
      // Bubba (Switch 49): the same row, except everybody stands in the same
      // place on him.
      const bubbaCtx = this._bubbaCtx?.();
      if (bubbaCtx) {
        const label = lang === 'it'
          ? bubbaCtx.data.label
          : bubbaCtx.data.label;
        if (label) {
          identHTML += `<div class="npc-ident-row">${_iconSpan(79, 17)}` +
            `<span class="npc-sub">${_escapeHtml(T.towardBubbaLbl)}:</span>&nbsp;` +
            `<span class="npc-good">${_escapeHtml(label)}</span></div>`;
        }
      }
    }

    // ── Political identity (NPCPolitics), every link opens a wiki profile ──
    let politicsHTML = '';
    // Nothing votes that cannot speak: no citizenship, no nation, no party, no
    // ballot and no local office for a beast.
    const identity = (npcName && !nonSentient) ? window.NPCPolitics?.getIdentity?.(npcName) : null;

    // "Citizen of": the home map-pool (settlement/group the NPC belongs to) is
    // shown first, then the political nation/power when a political identity
    // exists. The row renders even for NPCs with no political identity.
    const citizenParts = [];
    // Somebody who is not from here has no hometown and no nation: what they
    // have is a system they came from and a power out there that claims them,
    // so that is what the row says instead. Nothing on Earth applies to them.
    const alien = nonSentient ? null : _alienIdentity(profile, npcName, this._eventId);
    if (alien) {
      citizenParts.push(`<span>${_escapeHtml(alien.originName)}</span>`);
      citizenParts.push(_wikiLink('power', alien.power, alien.powerName));
    } else {
      // The row reads town · nation · controlling hyperpower. The simulated
      // political identity answers for the last two when it exists, otherwise
      // they are resolved straight from the home group, so procedural citizens
      // (and anyone the politics sim has not reached yet) still show the nation
      // their town stands in and the power that nation answers to.
      const homeGroup = nonSentient ? null : profile?._homeGroupName;
      const homeTown = _homeTownLabel(homeGroup);
      if (homeTown) citizenParts.push(`<span>${_escapeHtml(homeTown)}</span>`);
      // Somebody from a floor of the Omega Tower is from a world, and the
      // world stands where the nation would. An Earthling colony is the one
      // exception and keeps Earth's own rows below, because its people are
      // still from here (window.TowerWorlds, NPCPolitics resolveGroupPolity).
      const homeWorld = homeGroup
        ? (window.TowerWorlds?.worldOfGroup?.(homeGroup) || null) : null;
      if (homeWorld && !homeWorld.earthborn) {
        citizenParts.push(_wikiLink('world', homeWorld.id, homeWorld.name));
      }
      const groupPolity = (identity?.country && identity?.power)
        ? null : window.NPCPolitics?.polityOfGroup?.(homeGroup);
      const homeNation = identity?.country || groupPolity?.country || null;
      const homePower  = identity?.power   || groupPolity?.power   || null;
      // A nation with no archive page of its own (one outside Countries.json)
      // still names the place; it just is not a link to nowhere.
      if (homeNation) {
        let knownNation = false;
        try { knownNation = !!Wiki.get?.('nation', homeNation); } catch (e) {}
        citizenParts.push(knownNation ? _wikiLink('nation', homeNation) : `<span>${_escapeHtml(homeNation)}</span>`);
      }
      if (homePower && homePower !== 'Neutral') citizenParts.push(_wikiLink('power', homePower));
    }

    if (!nonSentient && (identity || citizenParts.length)) {
      politicsHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.politicsSection}</div>`;
      if (citizenParts.length) {
        const label = alien ? T.originLbl : T.citizenOf;
        politicsHTML += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(label)}:</span>&nbsp;${citizenParts.join('&nbsp;·&nbsp;')}</div>`;
      }
      if (alien) {
        politicsHTML += `<div class="npc-ident-row">${_iconSpan(158, 17)}<span class="npc-sub">${_escapeHtml(T.casteLbl)}:</span>&nbsp;<span>${_escapeHtml(alien.casteName)}</span></div>`;
        if (alien.casteDesc) {
          politicsHTML += `<div class="npc-ident-row npc-sub">${_escapeHtml(alien.casteDesc)}</div>`;
        }
      }
    }
    if (identity) {
      const power = window.NPCPolitics?.getPower?.(identity.power);
      const party = power && identity.partyId ? window.NPCPolitics?.getPartyOf?.(identity.power, identity.partyId) : null;
      const grudgeParty = power && identity.grudgePartyId ? window.NPCPolitics?.getPartyOf?.(identity.power, identity.grudgePartyId) : null;
      const eng = identity.engagement ?? 0;
      const engLabel = eng < 25 ? (T.engApathetic)
        : eng < 50 ? (T.engVoter)
        : eng < 75 ? (T.engActivist)
        : (T.engOrganizer);

      if (party) politicsHTML += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.partyLbl)}:</span>&nbsp;${_wikiLink('party', party.id, party.name)}</div>`;
      politicsHTML += `<div class="npc-ident-row">${_iconSpan(83, 17)}<span class="npc-sub">${_escapeHtml(T.engagementLbl)}:</span>&nbsp;<span>${_escapeHtml(engLabel)} (${eng})</span></div>`;
      if (identity.localOffice) {
        const officeLabel = window.NPCPolitics?.LOCAL_OFFICE_LABELS?.[identity.localOffice] || identity.localOffice;
        politicsHTML += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(T.localOfficeLbl)}:</span>&nbsp;<span>${_escapeHtml(`${officeLabel}${identity.group ? `, ${identity.group}` : ''}`)}</span></div>`;
      }
      if (identity.votedLast && power) {
        const voted = window.NPCPolitics?.getPartyOf?.(identity.power, identity.votedLast.partyId);
        const when = window.NPCPolitics?.dateOf?.(identity.votedLast.minute);
        if (voted) politicsHTML += `<div class="npc-ident-row">${_iconSpan(220, 17)}<span class="npc-sub">${_escapeHtml(T.lastVoteLbl)}:</span>&nbsp;<span>${_escapeHtml(voted.name)}${when ? ` <span class="npc-sub">(${_escapeHtml(when)})</span>` : ''}</span></div>`;
      }
      if (grudgeParty) {
        politicsHTML += `<div class="npc-ident-row">${_iconSpan(1, 17)}<span class="npc-sub">${_escapeHtml(T.grudgeLbl)}:</span>&nbsp;<span class="npc-bad">${_escapeHtml(grudgeParty.name)}</span></div>`;
      }
    }

    let traitsHTML = '';
    if (profile?.traitIds?.length) {
      traitsHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.traits}</div><div class="npc-tag-wrap">`;
      for (const id of profile.traitIds) {
        const trait = dl?.traits?.find(t => t.id === id);
        if (trait) traitsHTML += `<span class="npc-tag" ${_ccHover('trait', trait.id)}>${_iconSpan(trait.icon || 0, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`;
      }
      traitsHTML += '</div>';
    }

    let specsHTML = '';
    const npcSpecs = actorObj
      ? _getActorSpecializations(actorObj)
      : _getNpcSpecializations(profile, classId ?? profile?.assignedClassId, dl, npcName);
    if (npcSpecs.length) {
      specsHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.specializations}</div><div class="npc-tag-wrap">`;
      for (const s of npcSpecs) specsHTML += `<span class="npc-tag">${_escapeHtml(s.name)} <span class="npc-sub">(${_escapeHtml(s.levelName)})</span></span>`;
      specsHTML += '</div>';
    }

    let equipHTML = '';
    if (!nonSentient && (actorObj || (profile && window.NPCSocietyGetEquip))) {
      const equipItems = [];
      if (actorObj) {
        // What the player actually equipped, gaps and all.
        for (const e of actorObj.equips()) if (e) equipItems.push(e);
      } else {
        const equip = window.NPCSocietyGetEquip(displayName, classId ?? profile.assignedClassId, profile.wealthTierBase);
        if (equip.weaponId) { const w = $dataWeapons?.[equip.weaponId]; if (w) equipItems.push(w); }
        for (const id of (equip.armorIds || [])) { const a = $dataArmors?.[id]; if (a) equipItems.push(a); }
      }
      if (equipItems.length) {
        equipHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.equipment}</div><div class="npc-tag-wrap">`;
        for (const e of equipItems) {
          const kind = (e.wtypeId != null) ? 'weapon' : 'armor';
          // A piece customised for them reads under its own name, with who
          // made it and for whom (window.NPCUniqueGear, Quest/ThinkerMenu.js).
          const uq = actorObj ? null : window.NPCUniqueGear?.describeWorn?.(displayName, kind, e.id);
          if (uq) equipHTML += `<span class="npc-tag" title="${_escapeHtml(uq.tip)}" ${_ccHover(kind, e.id)}>${_iconSpan(e.iconIndex || 0, 15)}${_rareName(_escapeHtml(uq.name), 'epic')}</span>`;
          else equipHTML += `<span class="npc-tag" ${_ccHover(kind, e.id)}>${_iconSpan(e.iconIndex || 0, 15)}${_escapeHtml(e.name)}</span>`;
        }
        equipHTML += '</div>';
      }
    }

    // The artifacts in their keeping and what they carry: the profile's own,
    // so neither is read for a party member (their pack is the actor's) nor
    // for a beast, which holds nothing.
    const ownsHTML = (nonSentient || actorObj || !profile)
      ? '' : _artifactsSectionHTML(profile) + _carriedSectionHTML(profile);

    let skillsHTML = '';
    // Skills granted by the NPC's traits (Traits.json `skills` arrays), keyed
    // by skill id -> granting trait so the tag can say where it came from.
    const traitSkillSource = new Map();
    for (const tid of (profile?.traitIds || [])) {
      const trait = dl?.traits?.find(t => t.id === tid);
      for (const sid of (trait?.skills || [])) {
        if (!traitSkillSource.has(sid)) traitSkillSource.set(sid, trait);
      }
    }
    if ((profile?.skillIds?.length || traitSkillSource.size) && $dataSkills) {
      const allIds = [...(profile?.skillIds || [])];
      if (profile?.levelSkillBrackets) {
        Object.keys(profile.levelSkillBrackets).map(Number).sort((a, b) => a - b)
          .forEach(b => allIds.push(...profile.levelSkillBrackets[b]));
      }
      for (const sid of traitSkillSource.keys()) {
        if (!allIds.includes(sid)) allIds.push(sid);
      }
      const seen = new Set();
      let tags = '';
      for (const id of allIds) {
        const sk = $dataSkills[id];
        if (!sk || seen.has(id)) continue;
        seen.add(id);
        const srcTrait = traitSkillSource.get(id);
        if (srcTrait) {
          const traitName = _traitDisplayName(srcTrait);
          // Skills that come from a trait rather than the class are marked with
          // the trait's own colour, the tags carry no frame to outline any more.
          tags += `<span class="npc-tag npc-gold" title="${_escapeHtml(`${T.traits}: ${traitName}`)}" ${_ccHover('skill', sk.id)}>${_iconSpan(sk.iconIndex || 0, 15)}${_escapeHtml(sk.name)}</span>`;
        } else {
          tags += `<span class="npc-tag" ${_ccHover('skill', sk.id)}>${_iconSpan(sk.iconIndex || 0, 15)}${_escapeHtml(sk.name)}</span>`;
        }
      }
      if (tags) {
        skillsHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.skills}</div><div class="npc-tag-wrap">${tags}</div>`;
      }
    }

    let simHTML = '';
    const hasSimData = profile && (
      profile.currentNeed !== undefined || profile.currentJobId ||
      profile.money !== undefined || profile.hunger !== undefined
    );
    if (hasSimData) {
      simHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.status}</div>`;
      if (profile.currentNeed) {
        const needLabels = _needLabels(T);
        simHTML += `<div class="npc-ident-row">${_iconSpan(NEED_ICONS[profile.currentNeed] || 0, 17)}<span>${_escapeHtml(needLabels[profile.currentNeed] || profile.currentNeed)}</span></div>`;
      }
      if (profile.currentJobId && !nonSentient && window.WorkSystem?.getJob) {
        const job = window.WorkSystem.getJob(profile.currentJobId);
        if (job) simHTML += `<div class="npc-ident-row">${_iconSpan(126, 17)}<span>${_escapeHtml(window.WorkSystem.jobName(job))}</span>${_employerBadgeHTML(profile)}</div>`;
      }
      if (profile.money !== undefined && !nonSentient) {
        simHTML += `<div class="npc-ident-row npc-mt-1">${_iconSpan(314, 17)}<span>${_euros(profile.money)} ${T.onHand}</span></div>`;
      }
      if (opinion >= 20) {
        const lbl = opinion >= 60 ? T.knowsYouWell : T.remembersYou;
        simHTML += `<div class="npc-opinion-note">✶ ${_escapeHtml(lbl)}</div>`;
      }
      if (profile.thoughts?.[0]) {
        simHTML += `<div class="npc-thought">&ldquo;${_escapeHtml(profile.thoughts[0])}&rdquo;</div>`;
      }
    }

    // Stats and the EXP bar live in the left column (see _buildStatsGridHTML),
    // where they stay visible whichever tab is open, so the Info page does not
    // repeat them.

    return `
      <div class="npc-profile-name">${_escapeHtml(displayName || '-')}</div>
      ${subParts.length ? `<div class="npc-profile-sub">${_escapeHtml(subParts.join(' · '))}</div>` : ''}
      ${badgeHTML}
      ${this._buildPresetHTML(preset, T, lang)}
      <hr class="npc-r-sep">
      ${identHTML}
      ${politicsHTML}
      ${traitsHTML}
      ${specsHTML}
      ${equipHTML}
      ${ownsHTML}
      ${skillsHTML}
      ${simHTML}`;
  };

  // ============================================================================
  // DEALS: the Money and the Work and travel verbs
  // ============================================================================
  // Stock tips, Trade shares, Lend / Borrow, Ask for work, Hire, Fire, Work
  // together, Ask for a ride, Borrow their vehicle, Invite to move and Invite
  // to an expedition. The reckoning is NPCEmpathize.Deals
  // (NPCEmpathize_Lessons.js, SECTION 10b); this half puts the verbs on the
  // board, opens the pick sheets (window.CCPick, through the LESSONS helpers),
  // speaks the outcome into the log and applies the standing it moved.
  //
  // Who gets them: the board's gate (ActionBoard.define below) asks the
  // reckoning, which offers them only to a grown, sentient person with a
  // purse; the builder's older filters (child, visitor, beast, story) have
  // already run on the bare ids. Em and Bubba standing as the NPC, and
  // anybody on the roster page, are left out of all of it; Em or Bubba doing
  // the asking speak their own lines and are answered as themselves
  // (Empathize.act.voice, Deals.dealVoiceText).
  const {
    _addNpcOpinion: _dealAddOpinion, _isBubbaNpc: _dealIsBubbaNpc,
  } = Scene_NPCEmpathize._internal;
  const DEAL_VERBS = ['stockTips', 'tradeShares', 'lend', 'borrow', 'askWork', 'hire', 'fire', 'workTogether',
    'askRide', 'borrowVehicle', 'inviteMove', 'inviteExpedition'];
  const DEAL_VERB_CAT = {
    stockTips: 'money', tradeShares: 'money', lend: 'money', borrow: 'money',
    askWork: 'work', hire: 'work', fire: 'work', workTogether: 'work',
    askRide: 'work', borrowVehicle: 'work', inviteMove: 'work', inviteExpedition: 'work',
  };
  // The spec a verb trains in the speaking member.
  const DEAL_SPEC = { stockTips: 'Stock Trading', tradeShares: 'Stock Trading' }; // i18n-ignore: Specialization names
  const RIDE_HANDOVER_MS = 1200;

  const _Deals = () => window.NPCEmpathize?.Deals || null;
  const _dealT = (key, params) => {
    const D = _Deals();
    return D ? D.dealText(key, params) : key;
  };
  const _dealReason = (id, reason) => _dealT(`${DEAL_VERB_CAT[id] || 'money'}.reason.${reason}`);
  const _dealMoney = (gold) => (_Deals()?.money ? _Deals().money(gold) : _euros(gold));

  function _dealStory(scene) {
    const H = window.NPCEmpathize?._helpers || {};
    return !!(scene && scene._eventId != null && H._isStoryNpc?.(scene._eventId));
  }
  function _dealEmOrBubba(scene, npcName) {
    const H = window.NPCEmpathize?._helpers || {};
    const ev = scene && scene._eventId != null ? $gameMap?.event?.(scene._eventId) : null;
    return !!(H._isEmNpc?.(npcName, ev) || _dealIsBubbaNpc?.(npcName, ev));
  }

  // The board's gate for one verb.
  function _dealAvailable(id, ctx) {
    const D = _Deals();
    if (!D || !ctx || ctx.actorMode || ctx.remoteMode || !ctx.profile) return false;
    const scene = ctx.scene;
    if (scene?._pairCtx?.() || _dealEmOrBubba(scene, ctx.npcName)) return false;
    // Nobody to hire, move or send off in a world that simulates nobody.
    if (DEAL_VERB_CAT[id] === 'work') {
      const WM = window.NPCShared?.WorldModes || window.WorldModes;
      try { if (WM && typeof WM.simulatesPeople === 'function' && WM.simulatesPeople() === false) return false; }
      catch (e) { /* treat as simulated */ }
    }
    const res = D.dealGate(id, {
      profile: ctx.profile, npcName: ctx.npcName, opinion: ctx.opinion, actor: ctx.actor,
      story: _dealStory(scene),
      recent: (tag, days) => _countRecentInteractions(ctx.profile, tag, days),
    });
    if (res && typeof res === 'object') return { disabled: true, reason: _dealReason(id, res.reason) };
    return !!res;
  }
  for (const id of DEAL_VERBS) {
    ActionBoard.define(id, { cat: DEAL_VERB_CAT[id], available: (ctx) => _dealAvailable(id, ctx) });
  }

  // The twelve entries, labelled. What each person actually gets is the gate's.
  Scene_NPCEmpathize.prototype._dealActions = function () {
    const D = _Deals();
    if (!D || this._entity || this._actorId != null) return [];
    const npcName = this._targetName();
    const profile = npcName ? _getProfile(npcName) : null;
    if (!profile) return [];
    const owed = D.openLoan(profile, 'borrowed');
    return DEAL_VERBS.map(id => ({
      id,
      label: (id === 'borrow' && owed)
        ? _dealT('money.label.repay', { owed: _dealMoney(owed.owed) })
        : _dealT(`${DEAL_VERB_CAT[id]}.label.${id}`),
    }));
  };

  function _dealCtx(scene) {
    const npcName = scene._targetName() || '';
    const profile = npcName ? _getProfile(npcName) : null;
    const actor = scene._focusActor();
    return {
      npcName, profile, actor,
      actorId: actor?.actorId?.() ?? null,
      actorName: actor?.name?.() || '',
      opinion: profile ? (scene._focusOpinion(profile) ?? 0) : 0,
    };
  }

  // Speaks an outcome into the log and applies what it moved. `done` is the
  // strip text on success; a refusal shows the reason.
  Scene_NPCEmpathize.prototype._dealSpeak = function (id, res, ctx, done) {
    const D = _Deals();
    const out = res || { ok: false, reason: 'noWork' };
    this._socialMode = false;
    this._activeTab = 'chat';
    const lines = Array.isArray(out.lines) ? out.lines : [];
    // Em and Bubba say it their own way, and are answered as themselves.
    const voice = this._lessonCtx?.()?.speakerVoice || null;
    const say = (l, variant) => (D.dealVoiceText ? D.dealVoiceText(l.key, l.params, variant) : D.dealText(l.key, l.params));
    const toVoice = voice === 'em' ? 'toEm' : voice === 'bubba' ? 'toBubba' : null; // i18n-ignore: voice variant ids
    for (const l of lines.filter(x => x.role === 'player')) this._pushChat('player', say(l, voice));
    if (out.deltaOpinion && ctx.profile && ctx.actorId != null) _dealAddOpinion(ctx.profile, ctx.actorId, out.deltaOpinion);
    if (out.ok && out.xp > 0 && DEAL_SPEC[id]) {
      try { window.SpecializationXP?.award?.(DEAL_SPEC[id], out.xp, { actor: ctx.actor, soloist: true }); }
      catch (e) { /* a toast never breaks the panel */ }
    }
    if (out.ok) this._gainCompany?.();
    const reply = lines.filter(x => x.role === 'npc').map(l => say(l, toVoice)).join(' ');
    if (reply) this._replyNpc(reply);
    const text = out.ok ? done : _dealReason(id, out.reason || 'noWork');
    if (out.ok && out.money) {
      try { window.ParchmentToast?.show?.(done, { severity: out.money > 0 ? 'good' : 'info', duration: 220 }); }
      catch (e) { /* toast only */ }
    }
    if (out.ok) SoundManager.playOk(); else SoundManager.playBuzzer();
    this._joinMessage = { type: out.ok ? 'accept' : 'reject', text };
    this._render();
    this._scrollChatToBottom?.();
    return out;
  };

  // A sheet of choices (the LESSONS pick helper), or a refusal when empty.
  function _dealPick(scene, title, options, onPick, emptyText) {
    if (!options.length) return scene._lessonRefuse(emptyText);
    scene._openLessonPick({ title, options, search: options.length > 8, onPick });
  }

  const DEAL_FLOWS = {
    stockTips(scene, ctx, D) {
      const res = D.stockTip({ profile: ctx.profile, npcName: ctx.npcName, opinion: ctx.opinion });
      scene._dealSpeak('stockTips', res, ctx, _dealT('money.tips.done', { name: ctx.npcName, company: res.company || '' }));
    },
    tradeShares(scene, ctx, D) {
      const rows = D.tradeOptions({ profile: ctx.profile, npcName: ctx.npcName, opinion: ctx.opinion });
      _dealPick(scene, _dealT('money.trade.pickTitle', { name: ctx.npcName }), rows.map((r, i) => ({
        value: i, row: r, disabled: r.max <= 0,
        label: _dealT(r.side === 'buy' ? 'money.trade.buyRow' : 'money.trade.sellRow', { company: r.company, unit: _dealMoney(r.unit) }),
        hint: _dealT(r.side === 'buy' ? 'money.trade.hintBuy' : 'money.trade.hintSell', { have: r.have, max: r.max }),
      })), (v, opt) => {
        const row = opt.row;
        _dealPick(scene, _dealT('money.trade.pickLots', { company: row.company }), D.tradeLots(row).map(n => ({
          value: n, label: _dealT('money.trade.lot', { count: n, total: _dealMoney(n * row.unit) }),
        })), (count) => {
          const c = _dealCtx(scene);
          const res = D.applyTrade({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, key: row.key, side: row.side, count });
          scene._dealSpeak('tradeShares', res, c, _dealT('money.trade.done',
            { count: res.count || count, company: row.company, total: _dealMoney(res.total || 0) }));
        }, _dealT('money.trade.none', { name: ctx.npcName }));
      }, _dealT('money.trade.none', { name: ctx.npcName }));
    },
    lend(scene, ctx, D) {
      _dealPick(scene, _dealT('money.lend.pickTitle', { name: ctx.npcName }), D.lendOptions().map(r => ({
        value: r.gold, disabled: r.disabled,
        label: _dealT('money.lend.row', { amount: _dealMoney(r.gold), owed: _dealMoney(r.owed), days: D.LOAN_DAYS }),
        hint: r.disabled ? _dealReason('lend', 'youCantAfford') : '',
      })), (gold) => {
        const c = _dealCtx(scene);
        const res = D.applyLend({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, gold, actorId: c.actorId });
        scene._dealSpeak('lend', res, c, _dealT('money.lend.done',
          { name: c.npcName, amount: _dealMoney(gold), owed: _dealMoney(res.owed || 0), days: D.LOAN_DAYS }));
      }, _dealReason('lend', 'youCantAfford'));
    },
    borrow(scene, ctx, D) {
      if (D.openLoan(ctx.profile, 'borrowed')) {
        const res = D.repayBorrowed({ profile: ctx.profile, npcName: ctx.npcName });
        return scene._dealSpeak('borrow', res, ctx, _dealT('money.borrow.repaid',
          { name: ctx.npcName, owed: _dealMoney(res.repaid || 0) }));
      }
      _dealPick(scene, _dealT('money.borrow.pickTitle', { name: ctx.npcName }), D.borrowOptions(ctx.profile).map(r => ({
        value: r.gold,
        label: _dealT('money.borrow.row', { amount: _dealMoney(r.gold), owed: _dealMoney(r.owed), days: D.LOAN_DAYS }),
      })), (gold) => {
        const c = _dealCtx(scene);
        const res = D.applyBorrow({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, gold, actorId: c.actorId });
        scene._dealSpeak('borrow', res, c, _dealT('money.borrow.done',
          { name: c.npcName, amount: _dealMoney(gold), owed: _dealMoney(res.owed || 0), days: D.LOAN_DAYS }));
      }, _dealT('money.borrow.none', { name: ctx.npcName }));
    },
    askWork(scene, ctx, D) {
      const rows = D.workOffers({ profile: ctx.profile, npcName: ctx.npcName, actor: ctx.actor, opinion: ctx.opinion });
      _dealPick(scene, _dealT('work.ask.pickTitle', { name: ctx.npcName }), rows.map((r, i) => (r.kind === 'shift'
        ? { value: i, row: r, disabled: r.disabled,
          label: _dealT('work.ask.shiftRow', { job: window.WorkSystem?.jobName?.(r.job) || '', place: r.place }),
          hint: r.disabled ? _dealReason('askWork', r.reason) : _dealT('work.ask.shiftHint', { hours: r.hours, pay: _dealMoney(r.pay) }) }
        : { value: i, row: r,
          label: _dealT('work.ask.questRow', { title: r.offer.title || '' }),
          hint: _dealT(r.own ? 'work.ask.questOwnHint' : 'work.ask.questPassHint') })),
      (v, opt) => {
        const c = _dealCtx(scene);
        const row = opt.row;
        if (row.kind === 'shift') {
          const res = D.applyShift({ profile: c.profile, npcName: c.npcName, actor: c.actor, row });
          const job = window.WorkSystem?.jobName?.(row.job) || '';
          scene._dealSpeak('askWork', res, c, res.dispatched
            ? _dealT('work.ask.dispatched', { actor: c.actorName, hours: row.hours, job })
            : _dealT('work.ask.worked', { actor: c.actorName, job, pay: _dealMoney(res.money || 0) }));
        } else {
          const res = D.applyQuest({ profile: c.profile, npcName: c.npcName, row });
          scene._dealSpeak('askWork', res, c, _dealT('work.ask.questTaken', { title: row.offer.title || '' }));
        }
      }, _dealT('work.ask.none', { name: ctx.npcName }));
    },
    hire(scene, ctx, D) {
      _dealPick(scene, _dealT('work.hire.pickTitle', { name: ctx.npcName }), D.hireOptions({ profile: ctx.profile }).map((r, i) => ({
        value: i, row: r,
        label: _dealT('work.hire.row', { job: r.jobName, place: r.place }),
        hint: _dealT('work.hire.hint', { shift: _dealT(`work.shift.${r.shift}`), wage: _dealMoney(r.wage) }),
      })), (v, opt) => {
        const c = _dealCtx(scene);
        const res = D.applyHire({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, row: opt.row });
        scene._dealSpeak('hire', res, c, _dealT('work.hire.done', { name: c.npcName, job: opt.row.jobName, place: opt.row.place }));
      }, _dealT('work.hire.none'));
    },
    fire(scene, ctx, D) {
      const a = $gameSystem?._npcJobAssignments?.[ctx.npcName];
      _dealPick(scene, _dealT('work.fire.confirmTitle', { name: ctx.npcName, place: a?.mapName || '' }), [
        { value: 'yes', label: _dealT('work.fire.yes') },
        { value: 'no', label: _dealT('work.fire.no') },
      ], (v) => {
        if (v !== 'yes') return;
        const c = _dealCtx(scene);
        scene._dealSpeak('fire', D.applyFire({ profile: c.profile, npcName: c.npcName }), c,
          _dealT('work.fire.done', { name: c.npcName }));
      }, _dealReason('fire', 'notYours'));
    },
    workTogether(scene, ctx, D) {
      const res = D.applyWorkTogether({ profile: ctx.profile, npcName: ctx.npcName, actor: ctx.actor, opinion: ctx.opinion });
      scene._dealSpeak('workTogether', res, ctx, _dealT('work.together.result',
        { actor: ctx.actorName, hours: res.hours || 0, name: ctx.npcName, pay: _dealMoney(res.pay || 0) }));
    },
    askRide(scene, ctx, D) {
      const stops = D.rideStops({ profile: ctx.profile, npcName: ctx.npcName, opinion: ctx.opinion });
      _dealPick(scene, _dealT('work.ride.pickTitle', { name: ctx.npcName }), stops.map((s, i) => ({
        value: i, row: s, label: s.label,
        hint: s.fare <= 0 ? _dealT('work.ride.hintFree')
          : _dealT(s.heading ? 'work.ride.hintHeading' : 'work.ride.hint', { fare: _dealMoney(s.fare) }),
      })), (v, opt) => {
        const c = _dealCtx(scene);
        const res = scene._dealSpeak('askRide', D.applyRide({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, stop: opt.row }),
          c, _dealT('work.ride.done', { name: c.npcName, place: opt.row.label }));
        if (!res.ok || !res.journey) return;
        // The panel steps aside and the map sets out, as the shop and the
        // card table are handed over.
        setTimeout(() => {
          if (SceneManager._scene !== scene) return;
          scene._removeOverlay?.();
          scene._releaseEventLock?.();
          SceneManager.pop();
          $gameTemp._NPCEmpathizeRide = res.journey;
        }, RIDE_HANDOVER_MS);
      }, _dealT('work.ride.none', { name: ctx.npcName }));
    },
    borrowVehicle(scene, ctx, D) {
      const res = D.applyBorrowVehicle({ profile: ctx.profile, npcName: ctx.npcName, opinion: ctx.opinion, actorId: ctx.actorId });
      const item = res.itemId ? $dataItems?.[res.itemId] : null;
      scene._dealSpeak('borrowVehicle', res, ctx, _dealT('work.vehicle.done', { name: ctx.npcName, vehicle: item?.name || '' }));
    },
    inviteMove(scene, ctx, D) {
      _dealPick(scene, _dealT('work.move.pickTitle', { name: ctx.npcName }), D.knownTowns(ctx.profile).map(g => ({
        value: g, label: g,
      })), (toGroup) => {
        const c = _dealCtx(scene);
        const res = D.applyInviteMove({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, toGroup });
        scene._dealSpeak('inviteMove', res, c, res.movers > 1
          ? _dealT('work.move.doneFamily', { name: c.npcName, place: toGroup, count: res.movers - 1 })
          : _dealT('work.move.done', { name: c.npcName, place: toGroup }));
      }, _dealT('work.move.none'));
    },
    inviteExpedition(scene, ctx, D) {
      _dealPick(scene, _dealT('work.expedition.pickTitle', { name: ctx.npcName }), D.expeditionOptions(ctx.profile).map((r, i) => ({
        value: i, row: r,
        label: r.kind === 'tower' ? _dealT('work.expedition.towerRow', { floor: r.floor }) : _dealT('work.expedition.dungeonRow'),
      })), (v, opt) => {
        const c = _dealCtx(scene);
        const res = D.applyInviteExpedition({ profile: c.profile, npcName: c.npcName, opinion: c.opinion, row: opt.row });
        scene._dealSpeak('inviteExpedition', res, c, _dealT('work.expedition.done', { name: c.npcName }));
      }, _dealReason('inviteExpedition', 'cannotGo'));
    },
  };

  // The one entry _runAction hands every deal to.
  Scene_NPCEmpathize.prototype._runDeal = function (id) {
    const D = _Deals();
    const flow = DEAL_FLOWS[id];
    if (!D || !flow || !window.CCPick) return;
    const item = (this._chatActions || []).find(a => a.id === id);
    if (item && item.disabled) return this._lessonRefuse(item.reason || _dealReason(id, 'noWork'));
    const ctx = _dealCtx(this);
    if (!ctx.profile || !ctx.actor) return;
    flow(this, ctx, D);
  };

  // What fell due while the party was about (loans, a lent bike), settled
  // whenever the map starts, and the ride the panel handed over.
  function _settleDealsNow() {
    const D = _Deals();
    if (!D || !$gameSystem?._empDeals || !Object.keys($gameSystem._empDeals).length) return;
    let events = [];
    try { events = D.settleDeals({}) || []; } catch (e) { console.error('[NPCEmpathize] settling deals failed', e); }
    const GOOD = new Set(['repaid', 'paidBack', 'vehicleBack', 'forgiven']);
    for (const ev of events) {
      const vehicle = ev.itemId ? ($dataItems?.[ev.itemId]?.name || '') : '';
      const text = _dealT(`money.settle.${ev.kind}`, { name: ev.name, amount: _dealMoney(ev.gold || 0), vehicle });
      try { window.ParchmentToast?.show?.(text, { severity: GOOD.has(ev.kind) ? 'good' : 'warning', duration: 260 }); }
      catch (e) { /* toast only */ }
    }
  }
  if (typeof Scene_Map !== 'undefined' && Scene_Map.prototype) {
    const _Scene_Map_start_deals = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
      _Scene_Map_start_deals.apply(this, arguments);
      _settleDealsNow();
    };
    const _Scene_Map_update_deals = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
      _Scene_Map_update_deals.apply(this, arguments);
      const ride = $gameTemp?._NPCEmpathizeRide;
      if (!ride) return;
      $gameTemp._NPCEmpathizeRide = null;
      try { window.FastTravelSystem?.rideTo?.(ride.dest, ride.mode, 0); }
      catch (e) { console.error('[NPCEmpathize] the ride could not set out', e); }
    };
  }

  Object.assign(Scene_NPCEmpathize._internal, {
    _presetTraitBank, ActionBoard, EQUIP_ICON, OPT, SKILL_ICON, SPEC_ICON, TRAIT_ICON,
  });
})();
