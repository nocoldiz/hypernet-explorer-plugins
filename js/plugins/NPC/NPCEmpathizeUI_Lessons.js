/*:
 * @target MZ
 * @plugindesc NPC Empathize UI: the lesson sheets (Talk about, Teach, Learn)
 * @author Omni-Lex
 * @base NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI_Wiki
 * @help
 * ============================================================================
 * NPCEmpathizeUI_Lessons, part of the NPCEmpathizeUI family
 * ============================================================================
 * Owns LESSONS: the pick sheets of the Talk about, Teach and Learn actions,
 * reckoned by window.NPCEmpathizeLessons (NPCEmpathize_Lessons.js), and
 * CIVICS: the Beliefs and Politics verbs of the action board, reckoned by
 * NPCEmpathize.Civics, and HELP: the Help, Games, Romance and Talk verbs,
 * reckoned by NPCEmpathize.Help, and ACCUSE, reckoned by NPCEmpathize.Accuse.
 * Loads last: it binds the late names every
 * module reads once the family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * Scene_NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathizeUI_Wiki.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const { Scene_NPCEmpathize } = window.NPCEmpathize;
  const {
    _addNpcOpinion, _addPairBond, _escapeHtml, _getProfile, _isBubbaActor, _isBubbaNpc, _isEmActor,
    vary,
  } = Scene_NPCEmpathize._internal;

  // ============================================================================
  // LESSONS: Talk about, Teach and Learn
  // ============================================================================
  // Three actions on the chat board, each chosen in the pick sheet character
  // creation uses (window.CCPick: keyboard, mouse and pad alike, with a search
  // strip for a keyboard only). The reckoning lives in
  // NPCEmpathize_Lessons.js (window.NPCEmpathizeLessons); this half opens the
  // sheets, speaks the lines into the log and applies the standing.
  //
  //   Talk about   a topic the party has been told, asked and answered in both
  //                voices, and sometimes asked back
  //   Teach        the speaking member's skills, greyed where the NPC cannot
  //                take them; then free (a big gain in standing) or sold
  //   Learn        the NPC's skills; free from a friend, paid when neutral,
  //                refused outright by anybody hostile
  //   Train / Learn specialization
  //                the same two, for a specialization, one tier a session
  const _Lessons = () => window.NPCEmpathizeLessons || null;

  // The three board entries. Kept cheap on purpose: the full requirement check
  // runs when the sheet opens, not on every render of the panel.
  Scene_NPCEmpathize.prototype._lessonActions = function (actorMode) {
    const L = _Lessons();
    if (!L || !window.CCPick || this._entity) return [];
    const out = [{ id: 'talkAbout', label: L.text('ui.talkAbout'), disabled: !L.hasKnownTopics() }];
    if (actorMode) return out;
    const npcName = this._targetName();
    const profile = npcName ? _getProfile(npcName) : null;
    const actor   = this._focusActor();
    if (!profile || !actor) return out;
    out.push({ id: 'teach', label: L.text('ui.teach'), disabled: !(actor.skills?.() || []).length });
    out.push({ id: 'learn', label: L.text('ui.learn'), disabled: !(profile.skillIds || []).length });
    // Specializations both ways. Only whether the table has loaded is asked
    // here; the tier comparison runs when the sheet opens.
    const specsReady = !!window.Specializations?.ready;
    out.push({ id: 'trainSpec', label: L.text('ui.trainSpec'), disabled: !specsReady });
    out.push({ id: 'learnSpec', label: L.text('ui.learnSpec'), disabled: !specsReady });
    return out;
  };

  // Everybody in one exchange, and whose lines they speak.
  Scene_NPCEmpathize.prototype._lessonCtx = function () {
    const L         = _Lessons();
    const actorMode = this._actorId != null;
    const npcName   = this._targetName() || '';
    const profile   = npcName ? _getProfile(npcName) : null;
    const actor     = this._focusActor();
    const ev        = actorMode ? null : $gameMap?.event(this._eventId);
    const H         = window.NPCEmpathize._helpers || {};
    const speakerVoice = _isEmActor(actor) ? 'em' : _isBubbaActor(actor) ? 'bubba' : null;
    const npcVoice  = H._isEmNpc?.(npcName, ev) ? 'em' : _isBubbaNpc(npcName, ev) ? 'bubba' : null;
    const NC        = window.NPCConversation;
    // Em and Bubba are never framed by a creed, nor are children and beasts.
    const npcExempt = !!npcVoice || !!NC?.CreedVoice?.exempt?.(profile, npcName);
    const target    = actorMode ? $gameActors.actor(this._actorId) : null;
    return {
      L, actorMode, npcName, profile, actor, speakerVoice, npcVoice,
      speakerName: actor?.name?.() || '',
      pairCtx: this._pairCtx?.() || null,
      npcSubject: target ? L.subjectOfActor(target, npcExempt) : L.subjectOfProfile(profile, npcName, npcExempt),
      speakerSubject: L.subjectOfActor(actor, !!speakerVoice),
      persName: (!npcVoice && profile) ? (NC?._personalityNameOf?.(profile) || null) : null,
      answerVariant: L.answerVariantOf(speakerVoice, npcVoice),
    };
  };

  // Opens a pick sheet over the panel. The input manager hands the pad to it
  // while it is up (SECTION 6), and the key guard lets its keys through.
  Scene_NPCEmpathize.prototype._openLessonPick = function (opts) {
    if (!window.CCPick || !this._overlay) return;
    SoundManager.playOk();
    window.UINav?.swallowHeld?.();
    const onPick = opts.onPick;
    this._lessonPickOpen = true;
    window.CCPick.open(Object.assign({}, opts, {
      container: this._overlay,
      onPick: (value, row) => {
        this._lessonPickOpen = false;
        window.UINav?.swallowHeld?.();
        if (SceneManager._scene === this && onPick) onPick(value, row);
      },
    }));
  };

  Scene_NPCEmpathize.prototype._lessonRefuse = function (text) {
    SoundManager.playBuzzer();
    this._joinMessage = { type: 'reject', text };
    this._activeTab = 'chat';
    this._render();
  };

  // The written-out half of a skill sheet: what it does and what it costs.
  function _lessonDetail(L, row, mode) {
    const skill = $dataSkills?.[row.skillId];
    const parts = [`<div class="cc-modal-title">${_escapeHtml(row.name)}</div>`];
    if (skill?.description) parts.push(`<p>${_escapeHtml(vary(skill.description))}</p>`);
    parts.push(`<p>${_escapeHtml(L.text('ui.detailHours', { hours: row.hours }))}</p>`);
    if (mode === 'teach') {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailFee', { price: L.money(row.fee) }))}</p>`);
    } else if (row.free) {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailFree'))}</p>`);
    } else if (row.price > 0) {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailPrice', { price: L.money(row.price) }))}</p>`);
    }
    if (row.disabled) parts.push(`<p>${_escapeHtml(row.reasonText)}</p>`);
    return parts.join('');
  }

  // ── Talk about ─────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._talkAbout = function () {
    const L = _Lessons();
    if (!L) return;
    const options = L.topicOptions();
    if (!options.length) return this._lessonRefuse(L.text('ui.noTopics'));
    this._openLessonPick({
      title: L.text('ui.pickTopic', { name: this._targetName() || '' }),
      options,
      onPick: (topic) => this._talkAboutTopic(topic),
    });
  };

  Scene_NPCEmpathize.prototype._talkAboutTopic = function (topic) {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    const ex = L.talkExchange({
      topic, npcName: ctx.npcName, speakerName: ctx.speakerName,
      npcSubject: ctx.npcSubject, speakerSubject: ctx.speakerSubject,
      speakerVoice: ctx.speakerVoice, npcVoice: ctx.npcVoice,
      persName: ctx.persName, topics: L.knownTopics(),
      npcProfile: (ctx.actorMode || ctx.npcVoice) ? null : ctx.profile,
    });
    this._socialMode = false;
    this._activeTab  = 'chat';
    this._joinMessage = null;
    this._pushChat('player', ex.ask);
    // Standing moves by agreement. Between Em and Bubba everything warms their
    // bond; a party member on the roster page holds no opinion to move.
    if (ctx.pairCtx) {
      _addPairBond(Math.max(1, ex.delta));
    } else if (!ctx.actorMode && ctx.profile && ctx.actor) {
      _addNpcOpinion(ctx.profile, ctx.actor.actorId(), ex.delta);
      // A creed, a party or a faction talked over is a push toward the
      // speaker's creed (Phase A). Em and Bubba never proselytise.
      if (ex.creedTopic && !ctx.speakerVoice && !ctx.npcVoice) this._pushCreed?.();
    }
    this._gainCompany?.();
    this._replyNpc(ex.answer);
    if (ex.askBack) {
      setTimeout(() => {
        if (SceneManager._scene !== this) return;
        this._pushChat('npc', ex.askBack.ask);
        this._pushChat('player', ex.askBack.reply);
        this._render();
        this._scrollChatToBottom();
      }, 750);
    }
  };

  // ── Teach ──────────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._teachPick = function () {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    if (!ctx.profile || !ctx.actor || ctx.actorMode) return;
    const rows = L.teachOptions(ctx.actor, ctx.profile, ctx.npcName);
    if (!rows.length) return this._lessonRefuse(L.text('ui.noTeach', { name: ctx.npcName }));
    this._openLessonPick({
      title: L.text('ui.pickTeach', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.skillId, label: r.name, disabled: r.disabled, row: r,
        hint: r.disabled ? r.reasonText : L.text('ui.hintHours', { hours: r.hours }),
      })),
      detail: (opt) => _lessonDetail(L, opt.row, 'teach'),
      onPick: (id, opt) => this._teachTerms(opt.row),
    });
  };

  // Free, for a friend's gratitude, or sold, if they can pay for it.
  Scene_NPCEmpathize.prototype._teachTerms = function (row) {
    const L = _Lessons();
    const price = L.money(row.fee);
    this._openLessonPick({
      title: L.text('ui.pickTerms', { skill: row.name }),
      options: [
        { value: 'free', label: L.text('ui.teachFree'), hint: L.text('ui.teachFreeHint') },
        { value: 'sell', label: L.text('ui.teachSell', { price }),
          hint: row.npcCanPay ? L.text('ui.teachSellHint') : L.text('reason.cantAfford', { price }),
          disabled: !row.npcCanPay },
      ],
      search: false,
      onPick: (value) => this._doTeach(row, value === 'sell'),
    });
  };

  Scene_NPCEmpathize.prototype._doTeach = function (row, sold) {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    const res = L.applyTeach({
      actor: ctx.actor, profile: ctx.profile, npcName: ctx.npcName, skillId: row.skillId, sold,
      addOpinion: (d) => {
        if (ctx.pairCtx) _addPairBond(Math.max(1, Math.round(d / 3)));
        else _addNpcOpinion(ctx.profile, ctx.actor.actorId(), d);
      },
    });
    if (!res.ok) return this._lessonRefuse(L.text(`reason.${res.reason}`, { price: L.money(res.fee || row.fee) }));
    const price = L.money(res.fee);
    this._activeTab = 'chat';
    this._pushChat('player', L.line(sold ? 'teach.offerSell' : 'teach.offer', ctx.speakerVoice || 'default', null,
      { skill: row.name, name: ctx.npcName, price }));
    this._gainCompany?.();
    this._replyNpc(L.line(sold ? 'teach.thanksPaid' : 'teach.thanksFree', ctx.answerVariant, null,
      { skill: row.name, name: ctx.speakerName, price }));
    SoundManager.playRecovery();
    this._joinMessage = { type: 'accept', text: L.text(sold ? 'ui.teachSold' : 'ui.teachDone',
      { name: ctx.npcName, skill: row.name, hours: res.hours, price }) };
    this._render();
  };

  // ── Learn ──────────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._learnPick = function () {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    if (!ctx.profile || !ctx.actor || ctx.actorMode) return;
    const opinion = this._focusOpinion(ctx.profile) ?? 0;
    // Somebody hostile does not open the book at all: they say so.
    if (L.learnTerms(opinion).refused) {
      this._activeTab = 'chat';
      this._pushChat('player', L.line('learn.ask', ctx.speakerVoice || 'default', null,
        { skill: L.text('ui.anything'), name: ctx.npcName }));
      this._replyNpc(L.line('learn.refuse', ctx.answerVariant, null, { name: ctx.speakerName }));
      return this._lessonRefuse(L.text('reason.hostile'));
    }
    const rows = L.learnOptions(ctx.actor, ctx.profile, ctx.npcName, opinion);
    if (!rows.length) return this._lessonRefuse(L.text('ui.noLearn', { name: ctx.npcName }));
    this._openLessonPick({
      title: L.text('ui.pickLearn', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.skillId, label: r.name, disabled: r.disabled, row: r,
        hint: r.disabled ? r.reasonText
          : r.free ? L.text('ui.hintFree', { hours: r.hours })
          : L.text('ui.hintPrice', { hours: r.hours, price: L.money(r.price) }),
      })),
      detail: (opt) => _lessonDetail(L, opt.row, 'learn'),
      onPick: (id, opt) => this._doLearn(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doLearn = function (row) {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    const opinion = this._focusOpinion(ctx.profile) ?? 0;
    const res = L.applyLearn({
      actor: ctx.actor, profile: ctx.profile, npcName: ctx.npcName, skillId: row.skillId, opinion,
    });
    if (!res.ok) return this._lessonRefuse(L.text(`reason.${res.reason}`, { price: L.money(res.price || row.price) }));
    const price = L.money(res.price);
    this._activeTab = 'chat';
    this._pushChat('player', L.line('learn.ask', ctx.speakerVoice || 'default', null,
      { skill: row.name, name: ctx.npcName }));
    this._gainCompany?.();
    this._replyNpc(L.line(res.free ? 'learn.agreeFree' : 'learn.agreePaid', ctx.answerVariant, null,
      { skill: row.name, name: ctx.speakerName, price }));
    SoundManager.playRecovery();
    this._joinMessage = { type: 'accept', text: L.text(res.free ? 'ui.learnDone' : 'ui.learnPaid',
      { actor: ctx.speakerName, skill: row.name, hours: res.hours, price }) };
    this._render();
  };

  // ── Specializations, both ways ──────────────────────────────────────────
  // The written-out half of a specialization sheet.
  function _specDetail(L, row, mode) {
    const S = window.Specializations;
    const parts = [`<div class="cc-modal-title">${_escapeHtml(row.name)}</div>`];
    const desc = S?.describe ? S.describe(row.specId) : '';
    if (desc) parts.push(`<p>${_escapeHtml(desc)}</p>`);
    parts.push(`<p>${_escapeHtml(L.text('ui.detailSpecTier', { from: row.fromName, to: row.toName }))}</p>`);
    parts.push(`<p>${_escapeHtml(L.text('ui.detailHours', { hours: row.hours }))}</p>`);
    if (mode === 'train') {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailFee', { price: L.money(row.fee) }))}</p>`);
    } else if (row.free) {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailFree'))}</p>`);
    } else if (row.price > 0) {
      parts.push(`<p>${_escapeHtml(L.text('ui.detailPrice', { price: L.money(row.price) }))}</p>`);
    }
    if (row.disabled) parts.push(`<p>${_escapeHtml(row.reasonText)}</p>`);
    return parts.join('');
  }

  // Train: the member's specializations above the NPC's tier.
  Scene_NPCEmpathize.prototype._trainSpecPick = function () {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    if (!ctx.profile || !ctx.actor || ctx.actorMode) return;
    const rows = L.specTrainOptions(ctx.actor, ctx.profile, ctx.npcName);
    if (!rows.length) return this._lessonRefuse(L.text('ui.noTrainSpec', { name: ctx.npcName }));
    this._openLessonPick({
      title: L.text('ui.pickTrainSpec', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.specId, label: r.name, disabled: r.disabled, row: r,
        hint: r.disabled ? r.reasonText
          : L.text('ui.hintSpecTier', { from: r.fromName, to: r.toName, hours: r.hours }),
      })),
      detail: (opt) => _specDetail(L, opt.row, 'train'),
      onPick: (id, opt) => this._trainSpecTerms(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._trainSpecTerms = function (row) {
    const L = _Lessons();
    const price = L.money(row.fee);
    this._openLessonPick({
      title: L.text('ui.pickSpecTerms', { spec: row.name }),
      options: [
        { value: 'free', label: L.text('ui.teachFree'), hint: L.text('ui.teachFreeHint') },
        { value: 'sell', label: L.text('ui.teachSell', { price }),
          hint: row.npcCanPay ? L.text('ui.teachSellHint') : L.text('reason.cantAfford', { price }),
          disabled: !row.npcCanPay },
      ],
      search: false,
      onPick: (value) => this._doTrainSpec(row, value === 'sell'),
    });
  };

  Scene_NPCEmpathize.prototype._doTrainSpec = function (row, sold) {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    const res = L.applySpecTrain({
      actor: ctx.actor, profile: ctx.profile, npcName: ctx.npcName, specId: row.specId, sold,
      addOpinion: (d) => {
        if (ctx.pairCtx) _addPairBond(Math.max(1, Math.round(d / 3)));
        else _addNpcOpinion(ctx.profile, ctx.actor.actorId(), d);
      },
    });
    if (!res.ok) return this._lessonRefuse(L.text(`reason.${res.reason}`, { price: L.money(res.fee || row.fee) }));
    const price = L.money(res.fee);
    const params = { spec: row.name, tier: res.toName, name: ctx.npcName, price };
    this._activeTab = 'chat';
    this._pushChat('player', L.line(sold ? 'spec.train.offerSell' : 'spec.train.offer',
      ctx.speakerVoice || 'default', null, params));
    this._gainCompany?.();
    this._replyNpc(L.line(sold ? 'spec.train.thanksPaid' : 'spec.train.thanksFree', ctx.answerVariant, null,
      Object.assign({}, params, { name: ctx.speakerName })));
    SoundManager.playRecovery();
    this._joinMessage = { type: 'accept', text: L.text(sold ? 'ui.trainSpecSold' : 'ui.trainSpecDone',
      Object.assign({}, params, { hours: res.hours })) };
    this._render();
  };

  // Learn: the NPC's specializations above the member's tier.
  Scene_NPCEmpathize.prototype._learnSpecPick = function () {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    if (!ctx.profile || !ctx.actor || ctx.actorMode) return;
    const opinion = this._focusOpinion(ctx.profile) ?? 0;
    if (L.specLearnTerms(opinion, 2).refused) {
      this._activeTab = 'chat';
      this._pushChat('player', L.line('spec.learn.ask', ctx.speakerVoice || 'default', null,
        { spec: L.text('ui.anything'), name: ctx.npcName }));
      this._replyNpc(L.line('spec.learn.refuse', ctx.answerVariant, null, { name: ctx.speakerName }));
      return this._lessonRefuse(L.text('reason.hostile'));
    }
    const rows = L.specLearnOptions(ctx.actor, ctx.profile, ctx.npcName, opinion);
    if (!rows.length) return this._lessonRefuse(L.text('ui.noLearnSpec', { name: ctx.npcName }));
    this._openLessonPick({
      title: L.text('ui.pickLearnSpec', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.specId, label: r.name, disabled: r.disabled, row: r,
        hint: r.disabled ? r.reasonText
          : r.free ? L.text('ui.hintSpecFree', { from: r.fromName, to: r.toName, hours: r.hours })
          : L.text('ui.hintSpecPrice', { from: r.fromName, to: r.toName, hours: r.hours, price: L.money(r.price) }),
      })),
      detail: (opt) => _specDetail(L, opt.row, 'learn'),
      onPick: (id, opt) => this._doLearnSpec(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doLearnSpec = function (row) {
    const ctx = this._lessonCtx();
    const L = ctx.L;
    const opinion = this._focusOpinion(ctx.profile) ?? 0;
    const res = L.applySpecLearn({
      actor: ctx.actor, profile: ctx.profile, npcName: ctx.npcName, specId: row.specId, opinion,
    });
    if (!res.ok) return this._lessonRefuse(L.text(`reason.${res.reason}`, { price: L.money(res.price || row.price) }));
    const price = L.money(res.price);
    const params = { spec: row.name, tier: res.toName, actor: ctx.speakerName, price };
    this._activeTab = 'chat';
    this._pushChat('player', L.line('spec.learn.ask', ctx.speakerVoice || 'default', null,
      { spec: row.name, name: ctx.npcName }));
    this._gainCompany?.();
    this._replyNpc(L.line(res.free ? 'spec.learn.agreeFree' : 'spec.learn.agreePaid', ctx.answerVariant, null,
      { spec: row.name, name: ctx.speakerName, price }));
    SoundManager.playRecovery();
    this._joinMessage = { type: 'accept', text: L.text(res.free ? 'ui.learnSpecDone' : 'ui.learnSpecPaid',
      Object.assign({}, params, { hours: res.hours })) };
    this._render();
  };

  // ============================================================================
  // HELP: the Help, Games, Romance and Talk verbs
  // ============================================================================
  // Treat them, give medicine, first aid, offer a fix, intervene, offer
  // shelter; challenge to a game; introduce to someone; rumours and news. The
  // reckoning lives in NPCEmpathize_Lessons.js (NPCEmpathize.Help); this half
  // puts the verbs on the board, opens the pick sheets, speaks the lines into
  // the log and moves the standing through _addNpcOpinion.
  //
  // Only a real person (or creature) on the map is helped this way, never the
  // roster page or Em and Bubba facing each other. The builder's own filters
  // run first: a child keeps the three that mend them, a beast keeps first aid
  // alone, a visitor keeps rumours alone. Somebody lying downed is offered
  // first aid and nothing else from here.
  const _HelpBoard = Scene_NPCEmpathize._internal.ActionBoard;
  const _Help = () => window.NPCEmpathize?.Help || null;
  const _pubHelpers = () => window.NPCEmpathize?._helpers || {};

  // Who is being helped by whom, as cheaply as the board's gates need it.
  function _helpSubject(ctx) {
    const H = _Help();
    if (!H || !ctx || ctx.actorMode || ctx.remoteMode || !ctx.npcName || !ctx.profile || !ctx.actor) return null;
    const scene = ctx.scene;
    if (scene?._entity || scene?._pairCtx?.()) return null;
    const pub = _pubHelpers();
    const ev = scene?._eventId != null ? $gameMap?.event?.(scene._eventId) : null;
    return {
      H, actor: ctx.actor, npcName: ctx.npcName, profile: ctx.profile, opinion: Number(ctx.opinion) || 0,
      beast: H.isBeast(ctx.profile, ctx.npcName), child: H.isChild(ctx.profile, ctx.npcName),
      downed: H.isDowned(ctx.profile),
      story: !!(scene && pub._isStoryNpc?.(scene._eventId)) || H.isStoryName(ctx.npcName),
      pair: H.isExemptName(ctx.npcName) || !!pub._isEmNpc?.(ctx.npcName, ev) || !!pub._isBubbaNpc?.(ctx.npcName, ev),
    };
  }
  const _helpGrey = (key) => ({ disabled: true, reason: _Help()?.text(key) || key });
  // Awake, a person, and able to say yes: what most of these verbs need.
  const _helpAwake = (s) => !!s && !s.downed && !s.beast;

  if (_HelpBoard) {
    _HelpBoard.define('treatThem', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || !s.H.hurtOf(s.profile)?.hurt) return false;
      if (s.opinion <= s.H.HOSTILE) return _helpGrey('help.reason.hostile');
      return s.H.treatOptions(s.profile).length ? true : _helpGrey('help.reason.noHealItems');
    } });
    _HelpBoard.define('giveMedicine', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || !s.H.untreatedIllnesses(s.profile).length) return false;
      if (s.opinion <= s.H.HOSTILE) return _helpGrey('help.reason.hostile');
      return s.H.medicineOptions(s.profile).length ? true : _helpGrey('help.reason.noMedicine');
    } });
    _HelpBoard.define('firstAid', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      return !!(s && s.downed);
    } });
    _HelpBoard.define('offerFix', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child || !s.H.habitsOf(s.profile, s.npcName).length) return false;
      if (s.H.recent(s.profile, 'offerFix', 1) >= s.H.FIX_DAILY) return _helpGrey('help.reason.fixedToday');
      return s.H.fixOptions(s.profile, s.npcName).length ? true : _helpGrey('help.reason.noFix');
    } });
    _HelpBoard.define('intervene', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child || !s.H.habitsOf(s.profile, s.npcName).length) return false;
      if (s.opinion < s.H.INTERVENE_MIN_OPINION) return _helpGrey('help.reason.distrust');
      return s.H.recent(s.profile, 'intervene', s.H.INTERVENE_COOLDOWN_DAYS) ? _helpGrey('help.reason.intervenedLately') : true;
    } });
    _HelpBoard.define('shelter', { cat: 'help', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child || s.story || s.pair || !s.H.shelterNeed(s.profile, s.npcName)) return false;
      if (s.opinion < s.H.SHELTER_MIN_OPINION) return _helpGrey('help.reason.hostile');
      return s.H.shelterOptions().some(h => !h.disabled) ? true : _helpGrey('help.reason.noHome');
    } });
    _HelpBoard.define('challenge', { cat: 'games', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child) return false;
      if (s.opinion < s.H.CHALLENGE_MIN_OPINION) return _helpGrey('games.reason.hostile');
      return s.H.recent(s.profile, 'challenge', 1) ? _helpGrey('games.reason.playedToday') : true;
    } });
    _HelpBoard.define('introduce', { cat: 'romance', mode: 'hasFamilies', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child || s.story || s.pair || !s.H.mayBeIntroduced(s.npcName, s.profile)) return false;
      if (s.opinion < s.H.INTRODUCE_MIN_OPINION) return _helpGrey('romance.reason.distant');
      return s.H.recent(s.profile, 'introduce', 1) ? _helpGrey('romance.reason.matchedToday') : true;
    } });
    _HelpBoard.define('rumours', { cat: 'talk', available(ctx) {
      const s = _helpSubject(ctx);
      if (!_helpAwake(s) || s.child) return false;
      if (s.opinion < s.H.RUMOUR_MIN_OPINION) return _helpGrey('talk.reason.hostile');
      return s.H.recent(s.profile, 'rumours', 1) >= s.H.RUMOUR_DAILY ? _helpGrey('talk.reason.noNews') : true;
    } });
  }

  // The nine verbs, labelled; the board's gates above decide which of them
  // this person is offered.
  Scene_NPCEmpathize.prototype._helpActions = function (npcName, profile) {
    const H = _Help();
    if (!H || !npcName || !profile || this._entity) return [];
    return [
      { id: 'firstAid',     label: H.text('help.firstAid') },
      { id: 'treatThem',    label: H.text('help.treatThem') },
      { id: 'giveMedicine', label: H.text('help.giveMedicine') },
      { id: 'offerFix',     label: H.text('help.offerFix') },
      { id: 'intervene',    label: H.text('help.intervene') },
      { id: 'shelter',      label: H.text('help.shelter') },
      { id: 'challenge',    label: H.text('games.challenge') },
      { id: 'introduce',    label: H.text('romance.introduce') },
      { id: 'rumours',      label: H.text('talk.rumours') },
    ];
  };

  // One exchange's cast, on top of the lesson context (voices, names).
  Scene_NPCEmpathize.prototype._helpCtx = function () {
    const ctx = this._lessonCtx();
    const H = _Help();
    if (!H || ctx.actorMode || !ctx.profile || !ctx.actor) return null;
    const actorId = ctx.actor.actorId();
    return Object.assign(ctx, {
      H,
      opinion: this._focusOpinion(ctx.profile) ?? 0,
      beast: H.isBeast(ctx.profile, ctx.npcName),
      speakVariant: ctx.speakerVoice || 'default',
      replyVariant: H.replyVariant(ctx.speakerVoice, ctx.npcVoice),
      addOpinion: (d) => { if (d) _addNpcOpinion(ctx.profile, actorId, d); },
    });
  };

  // Speak, answer, show the strip. A beast answers in its class's noise.
  Scene_NPCEmpathize.prototype._helpSay = function (ctx, said, answer, strip, good) {
    this._socialMode = false;
    this._activeTab = 'chat';
    this._joinMessage = null;
    if (said) this._pushChat('player', said);
    this._gainCompany?.();
    if (ctx.beast) answer = _pubHelpers()._feralNoise?.(2, this._subjectCreatureClass?.()) || '';
    if (answer) this._replyNpc(answer);
    if (good) SoundManager.playOk(); else SoundManager.playBuzzer();
    this._joinMessage = strip ? { type: good ? 'accept' : 'reject', text: strip } : null;
    this._render();
  };

  Scene_NPCEmpathize.prototype._helpRefuse = function (H, key, params) {
    return this._lessonRefuse(H.text(key, params));
  };

  // ── Treat them ─────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._treatThemPick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.treatOptions(ctx.profile);
    if (!rows.length) return this._helpRefuse(H, 'help.reason.noHealItems');
    this._openLessonPick({
      title: H.text('help.pickTreat', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: String(r.itemId), label: r.name, row: r,
        hint: H.text(r.medicine ? 'help.hintHealMedicine' : 'help.hintHeal', { hp: r.heal, have: r.have }),
      })),
      onPick: (id, opt) => this._doTreatThem(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doTreatThem = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyTreat({ profile: ctx.profile, npcName: ctx.npcName, itemId: row.itemId, actor: ctx.actor,
      opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.treat.offer', ctx.speakVariant, { name: ctx.npcName, item: res.item });
    const answer = H.line('help.treat.thanks', ctx.replyVariant, { name: ctx.speakerName, item: res.item });
    this._helpSay(ctx, said, answer,
      H.text('help.result.treated', { name: ctx.npcName, item: res.item, hp: res.healed }), true);
  };

  // ── Give medicine ──────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._giveMedicinePick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.medicineOptions(ctx.profile);
    if (!rows.length) return this._helpRefuse(H, 'help.reason.noMedicine');
    this._openLessonPick({
      title: H.text('help.pickMedicine', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: `${r.diseaseId}|${r.itemId}`, label: r.name, row: r,
        hint: H.text(r.kind === 'cure' ? 'help.hintCure' : 'help.hintManage', // i18n-ignore: remedy kind id
          { disease: r.disease, days: r.days, have: r.have }),
      })),
      onPick: (id, opt) => this._doGiveMedicine(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doGiveMedicine = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyMedicine({ profile: ctx.profile, npcName: ctx.npcName, diseaseId: row.diseaseId,
      itemId: row.itemId, actor: ctx.actor, opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.medicine.offer', ctx.speakVariant, { name: ctx.npcName, item: res.item });
    const answer = H.line('help.medicine.thanks', ctx.replyVariant, { name: ctx.speakerName, item: res.item });
    const key = res.kind === 'cure' ? 'help.result.medicine' : 'help.result.medicineManage'; // i18n-ignore: remedy kind id
    this._helpSay(ctx, said, answer, H.text(key, { name: ctx.npcName, item: res.item, disease: res.disease }), true);
  };

  // ── First aid ──────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._firstAid = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyFirstAid({ name: ctx.npcName, profile: ctx.profile, actor: ctx.actor, beast: ctx.beast,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.firstAid.kneel', ctx.speakVariant, { name: ctx.npcName });
    const answer = H.line('help.firstAid.wake', ctx.replyVariant, { name: ctx.speakerName });
    this._helpSay(ctx, said, answer, H.text('help.result.revived', { name: ctx.npcName }), true);
  };

  // ── Offer a fix ────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._offerFixPick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.fixOptions(ctx.profile, ctx.npcName);
    if (!rows.length) return this._helpRefuse(H, 'help.reason.noFix');
    this._openLessonPick({
      title: H.text('help.pickFix', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: `${r.key}|${r.itemId}`, label: r.name, row: r,
        hint: H.text('help.hintFix', { substance: r.substance, dose: r.dose, have: r.have }),
      })),
      onPick: (id, opt) => this._doOfferFix(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doOfferFix = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyFix({ profile: ctx.profile, name: ctx.npcName, key: row.key, itemId: row.itemId,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.fix.offer', ctx.speakVariant, { name: ctx.npcName, item: res.item });
    const answer = H.line('help.fix.thanks', ctx.replyVariant, { name: ctx.speakerName, item: res.item });
    this._helpSay(ctx, said, answer,
      H.text('help.result.fix', { name: ctx.npcName, item: res.item, substance: res.substance }), true);
  };

  // ── Intervene ──────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._intervenePick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.interveneOptions(ctx.profile, ctx.npcName, ctx.actor, ctx.opinion);
    if (!rows.length) return this._helpRefuse(H, 'help.reason.notAddicted');
    if (rows.length === 1 && !rows[0].already) return this._doIntervene(rows[0]);
    this._openLessonPick({
      title: H.text('help.pickIntervene', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.key, label: r.substance, row: r, disabled: r.already,
        hint: r.already ? H.text('help.hintIntervened') : H.text('help.hintIntervene', { chance: r.chance }),
      })),
      search: false,
      onPick: (id, opt) => this._doIntervene(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doIntervene = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyIntervene({ profile: ctx.profile, name: ctx.npcName, key: row.key, actor: ctx.actor,
      opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok && res.reason !== 'rebuffed') return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.intervene.plea', ctx.speakVariant, { name: ctx.npcName, substance: res.substance });
    const answer = H.line(res.ok ? 'help.intervene.accept' : 'help.intervene.refuse', ctx.replyVariant,
      { name: ctx.speakerName, substance: res.substance });
    const strip = res.ok
      ? H.text('help.result.intervened', { name: ctx.npcName, substance: res.substance, days: res.days })
      : H.text('help.result.rebuffed', { name: ctx.npcName, substance: res.substance });
    this._helpSay(ctx, said, answer, strip, res.ok);
  };

  // ── Offer shelter ──────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._shelterPick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.shelterOptions();
    if (!rows.some(r => !r.disabled)) return this._helpRefuse(H, 'help.reason.noHome');
    this._openLessonPick({
      title: H.text('help.pickShelter', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.key, label: r.place, row: r, disabled: r.disabled,
        hint: r.disabled ? H.text('help.hintShelterNone') : '',
      })),
      onPick: (id, opt) => this._doShelter(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doShelter = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyShelter({ profile: ctx.profile, name: ctx.npcName, house: row, opinion: ctx.opinion,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `help.reason.${res.reason}`);
    const said = H.line('help.shelter.offer', ctx.speakVariant, { name: ctx.npcName, place: res.place });
    const answer = H.line('help.shelter.accept', ctx.replyVariant, { name: ctx.speakerName, place: res.place });
    this._helpSay(ctx, said, answer, H.text('help.result.sheltered', { name: ctx.npcName, place: res.place }), true);
  };

  // ── Challenge to a game ────────────────────────────────────────────────
  // A table on this map is played for real, with them in the other seat; any
  // other game is a round decided here, and may carry a bet.
  Scene_NPCEmpathize.prototype._challengePick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.challengeGames(ctx.profile, ctx.npcName, ctx.actor, H.gamesOnMap());
    if (!rows.length) return this._helpRefuse(H, 'games.reason.declined', { name: ctx.npcName });
    const S = window.Specializations;
    const tier = (lv) => (S?.levelName ? S.levelName(lv) : String(lv));
    this._openLessonPick({
      title: H.text('games.pickGame', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.game, label: H.text(`games.name.${r.game}`), row: r,
        hint: H.text(r.here ? 'games.hintGameHere' : 'games.hintGame',
          { spec: r.specName, you: tier(r.you), them: tier(r.them) }),
      })),
      search: false,
      onPick: (id, opt) => this._challengeTerms(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._challengeTerms = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    if (row.here) return this._challengeAtTable(row);
    const bets = H.betOptions(ctx.profile, ctx.npcName);
    if (!bets.length) return this._doChallenge(row, 0);
    const game = H.text(`games.name.${row.game}`);
    this._openLessonPick({
      title: H.text('games.pickBet', { game }),
      options: [{ value: '0', label: H.text('games.betNone'), hint: H.text('games.hintBetNone'), stake: 0 }]
        .concat(bets.map(b => ({
          value: String(b.stake), label: H.text('games.bet', { price: b.price }), stake: b.stake,
          disabled: !!b.reason,
          hint: b.reason ? H.text(`games.reason.${b.reason}`) : H.text('games.hintBet', { price: b.price }),
        }))),
      search: false,
      onPick: (id, opt) => this._doChallenge(row, opt.stake || 0),
    });
  };

  Scene_NPCEmpathize.prototype._doChallenge = function (row, stake) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const game = H.text(`games.name.${row.game}`);
    const res = H.applyChallenge({ profile: ctx.profile, name: ctx.npcName, actor: ctx.actor, game: row.game,
      stake, opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    const said = H.line('games.challenge.ask', ctx.speakVariant, { name: ctx.npcName, game });
    if (!res.ok && res.reason !== 'declined') return this._helpRefuse(H, `games.reason.${res.reason}`, { name: ctx.npcName });
    if (!res.ok) {
      const no = H.line('games.challenge.refuse', ctx.replyVariant, { name: ctx.speakerName, game });
      return this._helpSay(ctx, said, no, H.text('games.reason.declined', { name: ctx.npcName }), false);
    }
    const yes = H.line('games.challenge.accept', ctx.replyVariant, { name: ctx.speakerName, game });
    const after = H.line(`games.challenge.${res.result}`, ctx.replyVariant, { name: ctx.speakerName, game });
    let strip = H.text(`games.result.${res.result}`, { name: ctx.npcName, game });
    if (res.money) {
      const price = H.money(Math.abs(res.money));
      strip += ' ' + H.text(res.money > 0 ? 'games.result.wonBet' : 'games.result.lostBet', { name: ctx.npcName, price });
      try { window.ParchmentToast?.gold?.(res.money, { title: strip, severity: res.money > 0 ? 'good' : 'warning' }); } // i18n-ignore: toast severity ids
      catch (e) { /* a popup never breaks the panel */ }
    }
    this._helpSay(ctx, said, [yes, after].filter(Boolean).join(' '), strip, res.result !== 'lost');
  };

  // The real table: they say yes or no here, and a yes walks the party to
  // it with them pinned to the other seat (MinigameOpponent.pin).
  Scene_NPCEmpathize.prototype._challengeAtTable = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const game = H.text(`games.name.${row.game}`);
    const said = H.line('games.challenge.ask', ctx.speakVariant, { name: ctx.npcName, game });
    if (H.recent(ctx.profile, 'challenge', 1)) return this._helpRefuse(H, 'games.reason.playedToday');
    H.stamp(ctx.profile, 'challenge', row.game);
    if (Math.random() >= H.acceptChance(ctx.profile, ctx.npcName, ctx.opinion, 0)) {
      const no = H.line('games.challenge.refuse', ctx.replyVariant, { name: ctx.speakerName, game });
      return this._helpSay(ctx, said, no, H.text('games.reason.declined', { name: ctx.npcName }), false);
    }
    H.pinOpponent(ctx.npcName);
    ctx.addOpinion(1);
    const yes = H.line('games.challenge.accept', ctx.replyVariant, { name: ctx.speakerName, game });
    this._helpSay(ctx, said, yes, H.text('games.result.seat', { name: ctx.npcName, game }), true);
    const eventId = row.eventId;
    setTimeout(() => {
      if (SceneManager._scene !== this) return;
      const ev = $gameMap?.event?.(eventId);
      SceneManager.pop();
      if (ev && !ev._erased) ev.start();
    }, 900);
  };

  // ── Introduce to someone ───────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._introducePick = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const rows = H.introduceCandidates({
      name: ctx.npcName, profile: ctx.profile, actor: ctx.actor, opinion: ctx.opinion,
      opinionOf: (p) => this._focusOpinion(p) ?? 0,
    });
    if (!rows.length) return this._helpRefuse(H, 'romance.reason.noMatch');
    this._openLessonPick({
      title: H.text('romance.pickMatch', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.name, label: r.name, row: r, hint: H.text('romance.hintMatch', { chance: r.chance }),
      })),
      onPick: (id, opt) => this._doIntroduce(opt.row),
    });
  };

  Scene_NPCEmpathize.prototype._doIntroduce = function (row) {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const other = row.name;
    const otherProfile = _getProfile(other);
    const actorId = ctx.actor.actorId();
    const res = H.applyIntroduce({
      name: ctx.npcName, profile: ctx.profile, other, otherProfile, otherOpinion: row.candOpinion, bond: row.bond,
      actor: ctx.actor, opinion: ctx.opinion, byName: ctx.speakerName, addOpinion: ctx.addOpinion,
      addOtherOpinion: (d) => { if (d && otherProfile) _addNpcOpinion(otherProfile, actorId, d); },
    });
    if (!res.ok && res.reason !== 'noSpark') return this._helpRefuse(H, `romance.reason.${res.reason}`);
    const said = H.line('romance.introduce.pitch', ctx.speakVariant, { name: ctx.npcName, other });
    const answer = H.line(res.ok ? 'romance.introduce.accept' : 'romance.introduce.refuse', ctx.replyVariant,
      { name: ctx.speakerName, other });
    this._helpSay(ctx, said, answer,
      H.text(res.ok ? 'romance.result.matched' : 'romance.result.noSpark', { name: ctx.npcName, other }), res.ok);
  };

  // ── Rumours and news ───────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._rumours = function () {
    const ctx = this._helpCtx();
    if (!ctx) return;
    const H = ctx.H;
    const res = H.applyRumours({ profile: ctx.profile, name: ctx.npcName, actor: ctx.actor, opinion: ctx.opinion,
      variant: ctx.replyVariant, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._helpRefuse(H, `talk.reason.${res.reason}`);
    const said = H.line('talk.rumours.ask', ctx.speakVariant, { name: ctx.npcName });
    this._helpSay(ctx, said, res.lines[0] || '', H.text('talk.result.heard', { name: ctx.npcName }), true);
  };

  // ============================================================================
  // CIVICS: the Beliefs and Politics verbs
  // ============================================================================
  // Preach, debate, ask their views, pray together; ask about their vote, join
  // their party, invite them to yours, campaign, endorse and petition. The
  // reckoning lives in NPCEmpathize_Lessons.js (NPCEmpathize.Civics); this
  // half puts the verbs on the board, speaks the lines into the log, opens the
  // pick sheets and applies the standing through _addNpcOpinion.
  //
  // Only a real person on the map is spoken to this way: not the roster page,
  // not a child, a beast, Em or Bubba standing as the NPC (CreedVoice.exempt
  // answers all of those), and not a visitor from another savegame (the
  // builder's VISITOR_KEEP filter). The Politics verbs need a world with
  // politics in it (WorldModes.hasPolitics, the board's mode gate).
  const { ActionBoard, _countRecentInteractions, _iconSpan } = Scene_NPCEmpathize._internal;
  const _Civics = () => window.NPCEmpathize?.Civics || null;

  // Who is speaking to whom, as cheaply as the board's gates need it. Null when
  // none of these verbs belong here.
  function _civicSubject(ctx) {
    const C = _Civics();
    if (!C || !ctx || ctx.actorMode || ctx.remoteMode || !ctx.npcName || !ctx.profile || !ctx.actor) return null;
    if (ctx.scene?._pairCtx?.() || ctx.scene?._entity) return null;
    if (window.NPCConversation?.CreedVoice?.exempt?.(ctx.profile, ctx.npcName)) return null;
    if (window.NPCCreature?.isNonSentientActor?.(ctx.actor)) return null;
    return {
      C, actor: ctx.actor, npcName: ctx.npcName, profile: ctx.profile, opinion: Number(ctx.opinion) || 0,
      speakerCreed: C.actorCreedId(ctx.actor), npcCreed: C.npcCreedId(ctx.profile),
      identity: C.identityOf(ctx.npcName),
    };
  }
  const _civicDone = (profile, id, days) => _countRecentInteractions(profile, `action_${id}`, days || 1) > 0;
  const _grey = (key) => ({ disabled: true, reason: _Civics()?.text(key) || key });

  if (ActionBoard) {
    ActionBoard.define('preach', { cat: 'beliefs', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.speakerCreed || !s.npcCreed) return false;
      if (s.speakerCreed === s.npcCreed) return _grey('beliefs.reason.sameCreed');
      if (s.C.pinned(s.profile)) return _grey('beliefs.reason.unmovable');
      return true;
    } });
    ActionBoard.define('debate', { cat: 'beliefs', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.speakerCreed || !s.npcCreed) return false;
      if (s.speakerCreed === s.npcCreed) return _grey('beliefs.reason.sameCreed');
      if (_civicDone(s.profile, 'debate')) return _grey('beliefs.reason.tired');
      return true;
    } });
    ActionBoard.define('askViews', { cat: 'beliefs', available(ctx) {
      const s = _civicSubject(ctx);
      return !!(s && s.npcCreed);
    } });
    ActionBoard.define('prayTogether', { cat: 'beliefs', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.C.canPrayTogether(s.speakerCreed, s.npcCreed)) return false;
      return _civicDone(s.profile, 'prayTogether') ? _grey('beliefs.reason.prayed') : true;
    } });
    ActionBoard.define('askVote', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      return !!(s && s.identity);
    } });
    ActionBoard.define('joinTheirParty', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.C.joinTheirTerms(s.actor, s.npcName, s.opinion)) return false;
      return _civicDone(s.profile, 'joinTheirParty') ? _grey('politics.reason.askedToday') : true;
    } });
    ActionBoard.define('inviteToParty', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.C.inviteTerms(s.actor, s.npcName, s.opinion)) return false;
      return _civicDone(s.profile, 'inviteToParty') ? _grey('politics.reason.askedToday') : true;
    } });
    ActionBoard.define('campaign', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.identity) return false;
      return _civicDone(s.profile, 'campaign') ? _grey('politics.reason.askedToday') : true;
    } });
    ActionBoard.define('endorse', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.identity || !s.C.endorseOpen(s.npcName)) return false;
      return _civicDone(s.profile, 'endorse') ? _grey('politics.reason.askedToday') : true;
    } });
    ActionBoard.define('petition', { cat: 'politics', mode: 'hasPolitics', available(ctx) {
      const s = _civicSubject(ctx);
      if (!s || !s.C.officeOf(s.npcName, s.profile)) return false;
      return _civicDone(s.profile, 'petition') ? _grey('politics.reason.askedToday') : true;
    } });
  }

  // The ten verbs, labelled; the board's gates above decide which of them
  // this person is offered. Join and Invite carry their odds.
  Scene_NPCEmpathize.prototype._civicActions = function (npcName, profile, opinion) {
    const C = _Civics();
    const actor = this._focusActor?.();
    if (!C || !npcName || !profile || !actor || this._entity) return [];
    const join = C.joinTheirTerms(actor, npcName, opinion);
    const invite = C.inviteTerms(actor, npcName, opinion);
    return [
      { id: 'preach',         label: C.text('beliefs.preach') },
      { id: 'debate',         label: C.text('beliefs.debate') },
      { id: 'askViews',       label: C.text('beliefs.askViews') },
      { id: 'prayTogether',   label: C.text('beliefs.prayTogether') },
      { id: 'askVote',        label: C.text('politics.askVote') },
      { id: 'joinTheirParty', label: C.text('politics.joinTheirParty', { party: join?.party?.name || '', chance: join?.chance ?? 0 }) },
      { id: 'inviteToParty',  label: C.text('politics.inviteToParty', { party: invite?.party?.name || '', chance: invite?.chance ?? 0 }) },
      { id: 'campaign',       label: C.text('politics.campaign') },
      { id: 'endorse',        label: C.text('politics.endorse') },
      { id: 'petition',       label: C.text('politics.petition') },
    ];
  };

  // One exchange's cast, on top of the lesson context (voices, names).
  Scene_NPCEmpathize.prototype._civicCtx = function () {
    const ctx = this._lessonCtx();
    const C = _Civics();
    if (!C || ctx.actorMode || !ctx.profile || !ctx.actor) return null;
    const actorId = ctx.actor.actorId();
    return Object.assign(ctx, {
      C,
      opinion: this._focusOpinion(ctx.profile) ?? 0,
      identity: C.identityOf(ctx.npcName),
      speakVariant: ctx.speakerVoice || 'default',
      replyVariant: ctx.speakerVoice === 'em' ? 'toEm' : ctx.speakerVoice === 'bubba' ? 'toBubba' : 'default',
      addOpinion: (d) => { if (d) _addNpcOpinion(ctx.profile, actorId, d); },
    });
  };

  function _civicLog(profile, id, desc) {
    (profile.eventLog ??= []).push({
      tag: `action_${id}`, desc: String(desc || ''),
      timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
    });
  }

  // The speaker's line, then their creed's word on it: the party speaks in its
  // own creed's voice, Em and Bubba in theirs alone.
  function _creedWord(ctx, topic) {
    if (ctx.speakerVoice) return '';
    const CV = window.NPCConversation?.CreedVoice;
    const own = _getProfile(ctx.speakerName);
    const word = own && CV?.frame ? CV.frame(own, topic, {}, ctx.speakerName) : null;
    return word ? ` ${word}` : '';
  }

  // Speak, answer, show the strip.
  Scene_NPCEmpathize.prototype._civicSay = function (ctx, said, answer, strip, good) {
    this._socialMode = false;
    this._activeTab = 'chat';
    this._joinMessage = null;
    if (said) this._pushChat('player', said);
    this._gainCompany?.();
    if (answer) this._replyNpc(answer);
    if (good) SoundManager.playOk(); else SoundManager.playBuzzer();
    this._joinMessage = strip ? { type: good ? 'accept' : 'reject', text: strip } : null;
    this._render();
  };

  // ── Preach ─────────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._preach = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const repeats = _countRecentInteractions(ctx.profile, 'action_preach', C.PREACH_REPEAT_DAYS);
    const res = C.applyPreach({
      actor: ctx.actor, npcName: ctx.npcName, profile: ctx.profile, opinion: ctx.opinion, repeats,
      engagement: ctx.identity?.engagement ?? 30, addOpinion: ctx.addOpinion,
    });
    if (!res.ok) return this._lessonRefuse(C.text(`beliefs.reason.${res.reason}`));
    _civicLog(ctx.profile, 'preach', res.outcome);
    const p = { creed: res.creed, theirs: res.npcCreed, name: ctx.speakerName, npc: ctx.npcName,
      actor: ctx.speakerName, pct: res.conv?.pct ?? 0 };
    const said = C.line('beliefs.lines.preach.speak', ctx.speakVariant, p) + _creedWord(ctx, 'politics');
    const answer = C.line(`beliefs.lines.preach.${res.outcome}`, ctx.replyVariant, p);
    let strip;
    if (res.outcome === 'backfire') {
      strip = res.doubt?.converted ? C.text('beliefs.result.actorConverted', { actor: ctx.speakerName, creed: res.npcCreed })
        : C.text('beliefs.result.preachBackfire', p);
    } else if (res.converted) strip = C.text('beliefs.result.preachConverted', p);
    else if (res.outcome === 'moved' && res.conv) strip = C.text('beliefs.result.preachMoved', { ...p, creed: res.conv.creed, pct: res.conv.pct });
    else strip = C.text('beliefs.result.preachUnmoved', p);
    this._civicSay(ctx, said, answer, strip, res.outcome === 'moved');
  };

  // ── Debate ─────────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._debate = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyDebate({
      actor: ctx.actor, npcName: ctx.npcName, profile: ctx.profile, opinion: ctx.opinion,
      engagement: ctx.identity?.engagement ?? 30, addOpinion: ctx.addOpinion,
    });
    if (!res.ok) return this._lessonRefuse(C.text(`beliefs.reason.${res.reason}`));
    _civicLog(ctx.profile, 'debate', res.win ? 'won' : 'lost'); // i18n-ignore: event-log record id
    const p = { creed: res.creed, theirs: res.npcCreed, name: ctx.speakerName, npc: ctx.npcName,
      actor: ctx.speakerName, pct: res.conv?.pct ?? res.doubt?.conv?.pct ?? 0 };
    const said = C.line('beliefs.lines.debate.open', ctx.speakVariant, p) + _creedWord(ctx, 'politics');
    const answer = C.line(`beliefs.lines.debate.${res.win ? 'won' : 'lost'}`, ctx.replyVariant, p);
    let strip;
    if (res.win) {
      strip = res.converted ? C.text('beliefs.result.preachConverted', p)
        : res.conv ? C.text('beliefs.result.debateWon', { ...p, creed: res.conv.creed, pct: res.conv.pct })
        : C.text('beliefs.result.debateWonUnmoved', p);
    } else {
      strip = res.doubt?.converted ? C.text('beliefs.result.actorConverted', { actor: ctx.speakerName, creed: res.npcCreed })
        : C.text('beliefs.result.debateLost', { ...p, creed: res.npcCreed, pct: Math.floor(res.doubt?.conv?.pct ?? 0) });
    }
    this._civicSay(ctx, said, answer, strip, res.win);
  };

  // ── Ask their views ────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._askViews = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const v = C.viewsOf(ctx.npcName, ctx.profile);
    ctx.profile._viewsKnown = { by: ctx.speakerName, gameMin: $gameVariables?.value(114) ?? 0 };
    _civicLog(ctx.profile, 'askViews', v.creedId || '');
    const p = { creed: v.creed, family: v.familyLabel, name: ctx.speakerName, npc: ctx.npcName };
    const said = C.line('beliefs.lines.views.ask', ctx.speakVariant, p);
    const answer = C.line('beliefs.lines.views.answer', ctx.replyVariant, p);
    const parts = [C.text('beliefs.result.views', { name: ctx.npcName, creed: v.creed, family: v.familyLabel })];
    if (v.conversion) parts.push(C.text('beliefs.result.viewsConverting', { creed: v.conversion.creed, pct: v.conversion.pct }));
    if (v.hasIdentity) {
      parts.push(v.party ? C.text('beliefs.result.viewsParty', { party: v.party }) : C.text('beliefs.result.viewsNoParty'));
      parts.push(v.votedFor ? C.text('beliefs.result.viewsVoted', { party: v.votedFor }) : C.text('beliefs.result.viewsNeverVoted'));
    }
    this._civicSay(ctx, said, answer, parts.join(' '), true);
  };

  // ── Pray together ──────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._prayTogether = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyPray({ actor: ctx.actor, npcName: ctx.npcName, profile: ctx.profile,
      opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text(`beliefs.reason.${res.reason}`));
    _civicLog(ctx.profile, 'prayTogether', '');
    try { window.PartyNeeds?.addLeisureToAll?.(res.fun, { focus: ctx.actor }); } catch (e) { /* no needs here */ }
    const p = { name: ctx.speakerName, npc: ctx.npcName, actor: ctx.speakerName };
    this._civicSay(ctx, C.line('beliefs.lines.pray.invite', ctx.speakVariant, p) + _creedWord(ctx, 'flavour'),
      C.line('beliefs.lines.pray.agree', ctx.replyVariant, p), C.text('beliefs.result.prayed', p), true);
  };

  // ── Ask about their vote ───────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._askVote = function () {
    const ctx = this._civicCtx();
    if (!ctx || !ctx.identity) return;
    const C = ctx.C;
    const r = C.askVoteReckon({ persName: ctx.persName, opinion: ctx.opinion });
    const v = C.viewsOf(ctx.npcName, ctx.profile);
    const p = { name: ctx.speakerName, npc: ctx.npcName, party: v.party || '', voted: v.votedFor || '' };
    _civicLog(ctx.profile, 'askVote', r.refused ? 'refused' : 'told'); // i18n-ignore: event-log record id
    const said = C.line('politics.lines.vote.ask', ctx.speakVariant, p);
    if (r.refused) {
      return this._civicSay(ctx, said, C.line('politics.lines.vote.refuse', ctx.replyVariant, p),
        C.text('politics.result.voteSecret', p), false);
    }
    const strip = [v.party ? C.text('politics.result.voteParty', p) : C.text('politics.result.voteNoParty', p),
      v.votedFor ? C.text('politics.result.voteLast', p) : C.text('politics.result.voteNever', p)].join(' ');
    this._civicSay(ctx, said, C.line(v.party ? 'politics.lines.vote.answer' : 'politics.lines.vote.none', ctx.replyVariant, p),
      strip, true);
  };

  // ── Join their party / invite them to yours ────────────────────────────
  Scene_NPCEmpathize.prototype._joinTheirParty = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyJoinTheirParty({ actor: ctx.actor, npcName: ctx.npcName, opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text('politics.reason.noParty'));
    _civicLog(ctx.profile, 'joinTheirParty', res.joined ? res.party.name : '');
    const p = { party: res.party.name, name: ctx.speakerName, npc: ctx.npcName, actor: ctx.speakerName };
    this._civicSay(ctx, C.line('politics.lines.join.ask', ctx.speakVariant, p),
      C.line(res.joined ? 'politics.lines.join.yes' : 'politics.lines.join.no', ctx.replyVariant, p),
      C.text(res.joined ? 'politics.result.joined' : 'politics.result.joinRefused', p), res.joined);
  };

  Scene_NPCEmpathize.prototype._inviteToParty = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyInvite({ actor: ctx.actor, npcName: ctx.npcName, opinion: ctx.opinion, addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text('politics.reason.noParty'));
    _civicLog(ctx.profile, 'inviteToParty', res.joined ? res.party.name : '');
    const p = { party: res.party.name, name: ctx.speakerName, npc: ctx.npcName, actor: ctx.speakerName };
    this._civicSay(ctx, C.line('politics.lines.invite.ask', ctx.speakVariant, p),
      C.line(res.joined ? 'politics.lines.invite.yes' : 'politics.lines.invite.no', ctx.replyVariant, p),
      C.text(res.joined ? 'politics.result.invited' : 'politics.result.inviteRefused', p), res.joined);
  };

  // ── Campaign ───────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._campaignPick = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const rows = C.campaignOptions(ctx.npcName);
    if (!rows.length) return this._lessonRefuse(C.text('politics.reason.noBallot'));
    this._openLessonPick({
      title: C.text('politics.pick.campaign', { name: ctx.npcName }),
      options: rows.map(r => ({
        value: r.id, label: r.isPlayer ? C.text('politics.pick.yourParty', { party: r.party.name }) : r.party.name,
        hint: C.text(r.distance < 25 ? 'politics.pick.near' : r.distance < 55 ? 'politics.pick.middling' : 'politics.pick.far'),
        row: r,
      })),
      onPick: (id) => this._doCampaign(id),
    });
  };

  Scene_NPCEmpathize.prototype._doCampaign = function (partyId) {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyCampaign({ actor: ctx.actor, npcName: ctx.npcName, partyId, opinion: ctx.opinion,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text('politics.reason.noBallot'));
    _civicLog(ctx.profile, 'campaign', res.party.name);
    const p = { party: res.party.name, name: ctx.speakerName, npc: ctx.npcName, actor: ctx.speakerName };
    const strip = !res.landed ? C.text('politics.result.campaignFailed', p)
      : res.switched ? C.text('politics.result.campaignSwitched', { ...p, party: res.switched.name })
      : C.text('politics.result.campaignLanded', p);
    this._civicSay(ctx, C.line('politics.lines.campaign.pitch', ctx.speakVariant, p) + _creedWord(ctx, 'elections'),
      C.line(res.landed ? 'politics.lines.campaign.yes' : 'politics.lines.campaign.no', ctx.replyVariant, p),
      strip, res.landed);
  };

  // ── Endorse ────────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._endorsePick = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const rows = C.endorseOptions(ctx.npcName);
    if (!rows.length) return this._lessonRefuse(C.text('politics.reason.noElection'));
    const e = C.nextElectionOf(ctx.npcName);
    this._openLessonPick({
      title: C.text('politics.pick.endorse', { name: ctx.npcName, days: e?.days ?? 0 }),
      options: rows.map(r => ({
        value: r.id,
        label: r.kind === 'team' ? C.text('politics.pick.teamCandidate', { name: r.name }) // i18n-ignore: row kind
          : r.name === ctx.npcName ? C.text('politics.pick.themselves', { name: r.name }) : r.name,
        row: r,
      })),
      search: false,
      onPick: (id) => this._doEndorse(id),
    });
  };

  Scene_NPCEmpathize.prototype._doEndorse = function (candidateId) {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyEndorse({ actor: ctx.actor, npcName: ctx.npcName, candidateId, opinion: ctx.opinion,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text('politics.reason.noElection'));
    _civicLog(ctx.profile, 'endorse', res.row.name);
    const p = { candidate: res.row.name, name: ctx.speakerName, npc: ctx.npcName, actor: ctx.speakerName };
    this._civicSay(ctx, C.line('politics.lines.endorse.pitch', ctx.speakVariant, p),
      C.line(res.landed ? 'politics.lines.endorse.yes' : 'politics.lines.endorse.no', ctx.replyVariant, p),
      C.text(res.landed ? 'politics.result.endorseLanded' : 'politics.result.endorseFailed', p), res.landed);
  };

  // ── Petition ───────────────────────────────────────────────────────────
  Scene_NPCEmpathize.prototype._petitionPick = function () {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const rows = C.petitionOptions(ctx.npcName, ctx.profile);
    if (!rows.length) return this._lessonRefuse(C.text('politics.reason.noFavour'));
    this._openLessonPick({
      title: C.text('politics.pick.petition', { name: ctx.npcName, chance: C.petitionChance(ctx.opinion) }),
      options: rows.map(r => {
        const price = C.money(r.price);
        const label = r.id === 'pardon' // i18n-ignore: favour id
          ? C.text('politics.favour.pardon', { crime: r.charge?.name || C.text('politics.favour.noCharge'), price })
          : C.text('politics.favour.taxCut', { polity: r.polity || '', price });
        return { value: r.id, label, disabled: r.disabled, row: r,
          hint: r.disabled ? C.text(`politics.reason.${r.reason}`, { price }) : C.text('politics.pick.chance', { chance: C.petitionChance(ctx.opinion) }) };
      }),
      search: false,
      onPick: (id) => this._doPetition(id),
    });
  };

  Scene_NPCEmpathize.prototype._doPetition = function (favour) {
    const ctx = this._civicCtx();
    if (!ctx) return;
    const C = ctx.C;
    const res = C.applyPetition({ npcName: ctx.npcName, profile: ctx.profile, favour, opinion: ctx.opinion,
      addOpinion: ctx.addOpinion });
    if (!res.ok) return this._lessonRefuse(C.text(`politics.reason.${res.reason}`, { price: C.money(res.price || 0) }));
    _civicLog(ctx.profile, 'petition', `${favour}:${res.granted ? 1 : 0}`);
    const p = { name: ctx.speakerName, npc: ctx.npcName, price: C.money(res.row.price),
      crime: res.row.charge?.name || '', polity: res.row.polity || '' };
    this._civicSay(ctx, C.line(`politics.lines.petition.${favour}`, ctx.speakVariant, p),
      C.line(res.granted ? 'politics.lines.petition.yes' : 'politics.lines.petition.no', ctx.replyVariant, p),
      C.text(res.granted ? `politics.result.${favour}Granted` : 'politics.result.petitionRefused', p), res.granted); // i18n-ignore: i18n keys
  };

  // A party member's own page: the creed they are being talked round to (a
  // debate lost, a partisan's retort), and a warning when their views have
  // drifted far from the party they declared for (NPCPolitics PARTY DRIFT).
  Scene_NPCEmpathize.prototype._actorCivicRows = function (actor) {
    const C = _Civics();
    if (!C || !actor) return '';
    let html = '';
    const conv = C.actorConversionOf(actor);
    if (conv) {
      const by = conv.by ? ' ' + C.text('beliefs.actorDoubtBy', { name: conv.by }) : '';
      html += `<div class="npc-ident-row">${_iconSpan(186, 17)}<span class="npc-sub">` +
        `${_escapeHtml(C.text('beliefs.actorDoubt', { creed: conv.creed, pct: conv.pct }) + by)}</span></div>`; // i18n-ignore: markup
    }
    const warn = C.actorPartyWarning(actor);
    if (warn && warn.drifting) {
      html += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-bad">` +
        `${_escapeHtml(C.text('politics.partyWarn', { party: warn.party.name }))}</span></div>`;
    }
    return html;
  };

  // ============================================================================
  // ACCUSE: naming a crime to somebody's face
  // ============================================================================
  // Pick a crime off the whole preset catalogue and say they did it. Nothing
  // legal follows (NPCEmpathize.Accuse never calls CrimeSystem); what follows
  // is the accused thinking a great deal less of the speaker. Three targets:
  //   an NPC        on the street: their opinion of the speaker, their reply
  //   a member      on the roster page: that member's own opinion of the
  //                 speaker (their society profile), in their own lines
  //   yourself      the self-talk page: an introspective line, nothing more
  // Em and Bubba speak and answer in their own lines, and between the two of
  // them it lands on their bond. A child is never offered it (CHILD_KEEP), a
  // beast cannot understand it, a visitor keeps only talk (VISITOR_KEEP).
  const _Accuse = () => window.NPCEmpathize?.Accuse || null;

  // Who is accusing whom, for the board's gate and the sheet alike. Null when
  // the verb does not belong on this page.
  Scene_NPCEmpathize.prototype._accuseTarget = function () {
    const A = _Accuse();
    const actor = this._focusActor?.();
    if (!A || !actor || this._entity) return null;
    if (this._eventId == null && this._actorId == null) return null; // a visitor known by name alone
    if (window.NPCCreature?.isNonSentientActor?.(actor)) return null;
    if (this._isNonSentientSubject?.()) return null;
    const speakerId = actor.actorId();
    if (this._actorId != null) {
      const member = $gameActors.actor(this._actorId);
      if (!member) return null;
      if (member.actorId() === speakerId) return { A, actor, speakerId, kind: 'self', member };
      return { A, actor, speakerId, kind: 'member', member, key: `actor:${member.actorId()}`,
        name: member.name(), profile: _getProfile(member.name()) };
    }
    if (this._isChildSubject?.()) return null;
    const name = this._targetName();
    const profile = name ? _getProfile(name) : null;
    if (!name || !profile) return null;
    return { A, actor, speakerId, kind: 'npc', key: `npc:${name}`, name, profile };
  };

  Scene_NPCEmpathize.prototype._accuseAction = function () {
    const A = _Accuse();
    if (!A || this._entity) return null;
    return { id: 'accuse', label: A.text(this._isSelfTalk?.() ? 'rough.accuseSelf' : 'rough.accuse') };
  };

  if (Scene_NPCEmpathize._internal.ActionBoard) {
    Scene_NPCEmpathize._internal.ActionBoard.define('accuse', { cat: 'rough', available(ctx) {
      if (!ctx || ctx.remoteMode || !ctx.scene) return false;
      const t = ctx.scene._accuseTarget?.();
      if (!t) return false;
      if (t.kind !== 'self' && t.A.onCooldown(t.speakerId, t.key)) {
        return { disabled: true, reason: t.A.text('rough.reason.accusedToday') };
      }
      return true;
    } });
  }

  Scene_NPCEmpathize.prototype._accusePick = function () {
    const t = this._accuseTarget();
    if (!t) return;
    const A = t.A;
    if (t.kind !== 'self' && A.onCooldown(t.speakerId, t.key)) {
      return this._lessonRefuse(A.text('rough.reason.accusedToday'));
    }
    const rows = A.crimeOptions();
    if (!rows.length) return this._lessonRefuse(A.text('rough.reason.noCrimes'));
    this._openLessonPick({
      title: t.kind === 'self' ? A.text('rough.pickSelf') : A.text('rough.pickTitle', { name: t.name }),
      options: rows.map(r => ({ value: r.key, label: r.name, hint: r.categoryLabel, row: r })),
      onPick: (key) => this._doAccuse(key),
    });
  };

  Scene_NPCEmpathize.prototype._doAccuse = function (crimeKey) {
    const t = this._accuseTarget();
    if (!t) return;
    const A = t.A;
    const ctx = this._lessonCtx();
    const speakVariant = ctx.speakerVoice || 'default';
    const toSpeaker = ctx.speakerVoice === 'em' ? 'toEm' : ctx.speakerVoice === 'bubba' ? 'toBubba' : 'default';
    const speakerName = t.actor.name();
    const pair = !!this._pairCtx?.();
    const addOpinion = (profile) => (d) => { if (d && profile) _addNpcOpinion(profile, t.speakerId, d); };
    const socialMult = Scene_NPCEmpathize._internal._personalitySocialMult;
    const mult = (profile) => (profile && socialMult ? socialMult(profile, 'negative') : 1);
    let res, answer = '', strip = '';

    if (t.kind === 'self') {
      res = A.accuseSelf({ crimeKey });
      if (!res.ok) return this._lessonRefuse(A.text(`rough.reason.${res.reason}`));
      const crime = res.crime.name.toLowerCase();
      this._socialMode = false;
      this._activeTab = 'chat';
      this._pushChat('player', A.line(res.guilty ? 'selfGuilty' : 'self', speakVariant, { crime, name: speakerName }));
      SoundManager.playOk();
      this._joinMessage = { type: 'accept', text: A.text('rough.result.self', { crime }) };
      this._render();
      this._scrollChatToBottom?.();
      return;
    }

    if (t.kind === 'member') {
      const memberVoice = _isEmActor(t.member) ? 'em' : _isBubbaActor(t.member) ? 'bubba' : null;
      res = A.accuseMember({
        member: t.member, profile: t.profile, speakerId: t.speakerId, speakerName, crimeKey, pair,
        opinion: t.profile ? (this._focusOpinion(t.profile) ?? 0) : 0, mult: mult(t.profile),
        addOpinion: addOpinion(t.profile), addBond: (d) => _addPairBond(d),
      });
      if (!res.ok) return this._lessonRefuse(A.text(`rough.reason.${res.reason}`));
      const p = { name: speakerName, crime: res.crime.name.toLowerCase(), actor: speakerName, member: t.name,
        drop: pair ? res.bond : res.drop };
      answer = A.line(`member.${res.reaction}`, memberVoice || toSpeaker, p);
      strip = pair ? A.text('rough.result.bond', p)
        : res.moved ? A.text('rough.result.member', { ...p, name: t.name })
        : A.text('rough.result.memberSilent', { ...p, name: t.name });
    } else {
      res = A.accuseNpc({
        name: t.name, profile: t.profile, speakerId: t.speakerId, speakerName, crimeKey, pair,
        opinion: this._focusOpinion(t.profile) ?? 0, mult: mult(t.profile),
        addOpinion: addOpinion(t.profile), addBond: (d) => _addPairBond(d),
      });
      if (!res.ok) return this._lessonRefuse(A.text(`rough.reason.${res.reason}`));
      const p = { name: speakerName, crime: res.crime.name.toLowerCase(), actor: speakerName,
        drop: pair ? res.bond : res.drop };
      answer = A.line(`npc.${res.reaction}`, ctx.npcVoice || toSpeaker, p);
      const key = pair ? 'rough.result.bond'
        : res.reaction === 'flinch' ? 'rough.result.flinch' // i18n-ignore: reaction id
        : res.reaction === 'laugh' ? 'rough.result.laugh'   // i18n-ignore: reaction id
        : 'rough.result.npc';
      strip = A.text(key, { ...p, name: t.name });
    }

    this._socialMode = false;
    this._activeTab = 'chat';
    this._joinMessage = null;
    this._pushChat('player', A.line('speak', speakVariant,
      { name: t.name, crime: res.crime.name.toLowerCase() }));
    if (answer) this._replyNpc(answer);
    SoundManager.playBuzzer();
    this._joinMessage = { type: 'reject', text: strip };
    this._render();
  };

  // What an NPC told the party when asked their views (Ask their views keeps
  // profile._viewsKnown): the dossier shows it from then on, read live, since
  // what they believe is still what they believe.
  Scene_NPCEmpathize.prototype._npcViewsRows = function (npcName, profile) {
    const C = _Civics();
    if (!C || !npcName || !profile || !profile._viewsKnown) return '';
    const v = C.viewsOf(npcName, profile);
    const rows = [C.text('beliefs.known.family', { family: v.familyLabel || v.creed || '' })];
    if (v.conversion) rows.push(C.text('beliefs.result.viewsConverting', { creed: v.conversion.creed, pct: v.conversion.pct }));
    if (v.hasIdentity) {
      rows.push(v.party ? C.text('beliefs.result.viewsParty', { party: v.party }) : C.text('beliefs.result.viewsNoParty'));
      rows.push(v.votedFor ? C.text('beliefs.result.viewsVoted', { party: v.votedFor }) : C.text('beliefs.result.viewsNeverVoted'));
    }
    let html = `<div class="npc-ident-row npc-mt-1">${_iconSpan(186, 17)}<span class="npc-sub">` +
      `${_escapeHtml(C.text('beliefs.known.title', { by: profile._viewsKnown.by || '' }))}</span></div>`; // i18n-ignore: markup
    for (const r of rows) html += `<div class="npc-ident-row npc-row-indent"><span>${_escapeHtml(r)}</span></div>`; // i18n-ignore: markup
    return html;
  };

  // A sheet still up when the panel goes is taken down with it, key handler
  // and all.
  // The panel inherits terminate, so the parent's is looked up at call time:
  // a plugin loading later that rewrites the base scene's terminate still
  // reaches this one.
  const _ownTerminate = Object.prototype.hasOwnProperty.call(Scene_NPCEmpathize.prototype, 'terminate')
    ? Scene_NPCEmpathize.prototype.terminate : null;
  Scene_NPCEmpathize.prototype.terminate = function () {
    if (this._lessonPickOpen && window.CCPick?.isOpen?.()) window.CCPick.close(true);
    this._lessonPickOpen = false;
    const next = _ownTerminate || Object.getPrototypeOf(Scene_NPCEmpathize.prototype).terminate;
    return next.apply(this, arguments);
  };

  // The whole family is in: hand every module the names it reads late.
  for (const bind of Scene_NPCEmpathize._internal._late) bind();

  console.log('[NPCEmpathizeUI] v3.0.0 loaded.');
})();
