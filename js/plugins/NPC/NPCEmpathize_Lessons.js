/*:
 * @target MZ
 * @plugindesc NPC Empathize: Talk about, Teach and Learn (window.NPCEmpathizeLessons)
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @orderAfter NPCEmpathize_Api
 * @help
 * ============================================================================
 * NPCEmpathize_Lessons, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 10, TALK ABOUT, TEACH AND LEARN: the reckoning behind the three
 * Empathize lesson actions, published as window.NPCEmpathizeLessons and as
 * NPCEmpathize.Lessons. The scene half lives in NPCEmpathizeUI_Lessons.js.
 * Also owns SECTION 10b, MONEY, WORK AND TRAVEL: the reckoning behind those
 * verbs of the action board, published as NPCEmpathize.Deals; its scene half
 * is the DEALS section of NPCEmpathizeUI_Chat.js.
 * Also owns SECTION 11, BELIEFS AND POLITICS: the reckoning behind the Beliefs
 * and Politics actions of the board, published as NPCEmpathize.Civics.
 * Also owns SECTION 12, HELP, GAMES, ROMANCE AND RUMOURS: the reckoning behind
 * those verbs of the board, published as NPCEmpathize.Help; its scene half is
 * the HELP section of NPCEmpathizeUI_Lessons.js.
 * Also owns SECTION 13, ACCUSE: the reckoning behind the Accuse verb (words
 * only, never a charge), published as NPCEmpathize.Accuse; its scene half is
 * the ACCUSE section of NPCEmpathizeUI_Lessons.js.
 *
 * Self-contained: it reads the rest of the family only through the public
 * window.NPCEmpathize table at run time. Load it right after
 * NPCEmpathize_Api.js, as js/plugins.js lists it.
 */

// >>> EMPATHIZE LESSONS (Talk about / Teach / Learn) >>>
// ============================================================================
// SECTION 10, TALK ABOUT, TEACH AND LEARN (window.NPCEmpathizeLessons)
// ============================================================================
// The reckoning behind three Empathize actions, kept apart from the scene so
// it can be read and tested on its own. The scene (NPCEmpathizeUI_Lessons.js)
// opens the pick sheets and applies what this hands back.
//
//   Talk about X  a topic the party knows (DialogueSystem keeps every topic a
//                 member has been told on the actor, `_keywords`), asked in the
//                 speaking member's words and answered in the NPC's: known or
//                 not, liked or not, seeded by name, topic, creed and traits so
//                 the same person always holds the same view of the same thing.
//   Teach         every skill the speaking member knows, the ones the NPC can
//                 take open and the rest greyed with the reason. A lesson costs
//                 hours (skill cost, capped at 24) and is given free for a big
//                 gain in standing or sold to an NPC who can pay for a small one.
//   Learn         the NPC's skills the member can take: free from a friend
//                 (opinion 40+), at the skill's cost from anybody neutral,
//                 refused by anybody hostile (opinion -20 or lower).
//   Train / Learn specialization
//                 the same two lessons for a specialization, one tier a
//                 session, never past the teacher's own tier (see the
//                 Specializations block below).
//
// Children and the non-sentient (window.NPCCreature) are never taught and
// never teach. Em and Bubba have lines of their own on both sides of every
// exchange, and are never framed by a creed.
(() => {
  'use strict';

  const BANK = 'ConvTopics';
  const HOURS_CAP = 24;
  const GOLD_PER_KP = 10;            // 50 KP (the cheapest lesson) = 5.00 euros
  const FREE_LEARN_OPINION = 40;
  const HOSTILE_OPINION = -20;
  const FREE_TEACH = [15, 25];
  const SOLD_TEACH = [3, 8];
  const TEACH_SPEC_POINTS = 2;
  const ASK_BACK_CHANCE = 0.5;
  const POLITICAL_KINDS = ['ideology', 'party', 'faction', 'power', 'nation', 'leader'];
  const CREED_KINDS = ['ideology', 'party', 'faction'];
  const STANCES = ['like', 'dislike', 'neutral', 'unknown'];

  // ── Seeds ────────────────────────────────────────────────────────────────
  function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rollInt = (rand, lo, hi) => lo + Math.floor((rand || Math.random)() * (hi - lo + 1));

  // ── Text ─────────────────────────────────────────────────────────────────
  const Tr = (key, params) => (window.T ? window.T(`${BANK}.${key}`, params) : key);
  function tree(key) {
    try { return window.T && window.T.obj ? window.T.obj(`${BANK}.${key}`) : null; } catch (e) { return null; }
  }
  // A pool out of a variant tree, falling back to the default variant, so a
  // missing Em or Bubba line never leaves the exchange silent.
  function poolOf(key, variant, stance) {
    const root = tree(key);
    if (!root || typeof root !== 'object') return [];
    const pick = (node) => {
      if (!node) return null;
      if (Array.isArray(node)) return node.length ? node : null;
      if (stance && Array.isArray(node[stance]) && node[stance].length) return node[stance];
      return null;
    };
    return pick(variant && root[variant]) || pick(root.default) || [];
  }
  function alt(text, rand) {
    let out = String(text == null ? '' : text);
    for (let guard = 0; guard < 64 && out.indexOf('{') >= 0; guard++) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const parts = body.split('|');
        return parts[Math.floor((rand || Math.random)() * parts.length)];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  }
  function fill(text, params) {
    return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (whole, name) =>
      (params && Object.prototype.hasOwnProperty.call(params, name)) ? String(params[name]) : whole);
  }
  function line(key, variant, stance, params, rand) {
    const pool = poolOf(key, variant, stance);
    if (!pool.length) return '';
    const r = rand || Math.random;
    return alt(fill(pool[Math.floor(r() * pool.length)], params), r);
  }
  function money(gold) {
    if (window.NPCShared && window.NPCShared.formatMoney) return window.NPCShared.formatMoney(gold);
    return `${(Math.floor(Number(gold) || 0) / 100).toFixed(2)}€`;
  }

  // ── Topics the party knows ───────────────────────────────────────────────
  function partyMembers() {
    try { return (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.members() : []; }
    catch (e) { return []; }
  }
  function topicLabel(keyword) {
    try { return (window.DialogueTopics && window.DialogueTopics.displayName(keyword)) || String(keyword); }
    catch (e) { return String(keyword); }
  }
  function ideologyLabel(ideo) {
    const key = String((ideo && ideo.name) || '');
    if (key && window.T && window.T.has && window.T.has(key)) return window.T(key);
    return String((ideo && ideo.id) || key);
  }

  // What a topic IS, for the answer and for the creed push: a creed, one of
  // the wiki's political entities (party, faction, power, nation, leader), or
  // a plain topic.
  function classify(keyword) {
    const word = String(keyword == null ? '' : keyword).trim();
    const lower = word.toLowerCase();
    const label = topicLabel(word).toLowerCase();
    const ideos = (window.NPCShared && window.NPCShared.ideologyList && window.NPCShared.ideologyList()) || [];
    for (const ideo of ideos) {
      if (!ideo) continue;
      const id = String(ideo.id || '').toLowerCase();
      const lbl = ideologyLabel(ideo).toLowerCase();
      if (lower === id || lower === lbl || label === lbl) return { kind: 'ideology', id: ideo.id, ideologyId: ideo.id };
    }
    let hit = null;
    try {
      const wiki = window.NPCEmpathize && window.NPCEmpathize.Wiki;
      hit = (wiki && wiki.resolve && (wiki.resolve(word) || wiki.resolve(topicLabel(word)))) || null;
    } catch (e) { hit = null; }
    if (hit && POLITICAL_KINDS.includes(hit.type)) {
      let ideologyId = null;
      if (hit.type === 'party') {
        const all = (window.NPCPolitics && window.NPCPolitics.listAllParties && window.NPCPolitics.listAllParties()) || [];
        const row = all.find(r => r && r.party && r.party.id === hit.id);
        ideologyId = (row && row.party.ideologyId) || null;
      }
      return { kind: hit.type, id: hit.id, ideologyId };
    }
    return { kind: 'topic', id: word, ideologyId: null };
  }

  const GROUP_OF = { ideology: 'groupCreeds', party: 'groupPolitics', faction: 'groupPolitics',
    power: 'groupPolitics', nation: 'groupPolitics', leader: 'groupPolitics', topic: 'groupTopics' };

  // Every topic somebody in the party has been told, once, labelled as the
  // codex titles it. `members` defaults to the live party.
  function knownTopics(members) {
    const seen = new Map();
    for (const actor of (members || partyMembers())) {
      for (const word of ((actor && actor._keywords) || [])) {
        const key = String(word || '').trim();
        if (!key || seen.has(key.toLowerCase())) continue;
        seen.set(key.toLowerCase(), key);
      }
    }
    const out = [];
    for (const key of seen.values()) {
      const cls = classify(key);
      out.push({ value: key, label: topicLabel(key), kind: cls.kind,
        group: Tr(`ui.${GROUP_OF[cls.kind] || 'groupTopics'}`) });
    }
    const order = k => (k === 'ideology' ? 0 : POLITICAL_KINDS.includes(k) ? 1 : 2);
    out.sort((a, b) => order(a.kind) - order(b.kind) || a.label.localeCompare(b.label));
    return out;
  }

  // Whether anybody in the party has been told anything at all: the cheap
  // question the board asks on every render, with no classification behind it.
  function hasKnownTopics(members) {
    return (members || partyMembers()).some(a => a && Array.isArray(a._keywords) &&
      a._keywords.some(w => String(w || '').trim()));
  }

  // The dropdown rows (the CCPick shape character creation uses).
  function topicOptions(members) {
    return knownTopics(members).map(t => ({ value: t.value, label: t.label, group: t.group }));
  }

  // ── Who holds which view ─────────────────────────────────────────────────
  // A profile or an actor as the one thing the stance roll needs. Em and Bubba
  // are never framed by a creed, so they hold none here either.
  const traitIds = list => (list || []).map(t => (t && typeof t === 'object') ? (t.id || t.name || '') : String(t));
  function subjectOfProfile(profile, name, exemptCreed) {
    if (!profile) return null;
    let ideologyId = null;
    if (!exemptCreed) {
      try {
        const S = window.NPCShared;
        ideologyId = profile.ideologyId || (S && S.ideologyFor && (S.ideologyFor(profile) || {}).id) || null;
      } catch (e) { ideologyId = null; }
    }
    let factionName = null;
    const dl = window._NPCSocietyDataLoader;
    const faction = (profile.factionIndex >= 0 && dl && dl.factions) ? dl.factions[profile.factionIndex] : null;
    if (faction) factionName = typeof faction === 'string' ? faction : (faction.id || faction.name || null);
    return {
      name: String(name || profile._npcName || ''),
      ideologyId,
      traits: traitIds(profile.traits),
      level: Number(profile.level) || 1,
      factionName,
    };
  }
  function subjectOfActor(actor, exemptCreed) {
    if (!actor) return null;
    const name = typeof actor.name === 'function' ? actor.name() : String(actor.name || '');
    return {
      name,
      ideologyId: exemptCreed ? null : (actor._ideologyId || null),
      traits: traitIds(actor._traits || actor._selectedTraits),
      level: Number(actor.level) || 1,
      factionName: null,
    };
  }

  function creedDistance(a, b) {
    const S = window.NPCShared;
    if (S && S.ideologyDistance) {
      try { return S.ideologyDistance(a, b); } catch (e) { /* fall through */ }
    }
    const ax = id => Object.assign({ econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 },
      ((S && S.ideologyById && S.ideologyById(id)) || {}).axes || {});
    const A = ax(a), B = ax(b);
    return ['econ', 'auth', 'trad', 'mil', 'myst'].reduce((s, k) => s + Math.abs(A[k] - B[k]), 0) / 5;
  }

  // like | dislike | neutral | unknown, the same answer every time for the
  // same person, topic, creed and traits.
  function stanceOf(subject, topic, cls) {
    if (!subject) return 'unknown';
    const c = cls || classify(topic);
    const rand = seeded(`${subject.name}|${String(topic).toLowerCase()}|${subject.ideologyId || ''}|${(subject.traits || []).join(',')}`);
    const political = POLITICAL_KINDS.includes(c.kind);
    const knowChance = political ? 0.85 : 0.45 + Math.min(0.35, (subject.level || 1) / 200);
    if (rand() >= knowChance) return 'unknown';
    if (c.ideologyId && subject.ideologyId) {
      if (c.ideologyId === subject.ideologyId) return 'like';
      const d = creedDistance(subject.ideologyId, c.ideologyId);
      if (Number.isFinite(d)) return d < 30 ? 'like' : d > 60 ? 'dislike' : 'neutral';
    }
    if (c.kind === 'faction' && subject.factionName &&
        String(subject.factionName).toLowerCase() === String(c.id).toLowerCase()) return 'like';
    const r = rand();
    return r < 0.4 ? 'like' : r < 0.7 ? 'neutral' : 'dislike';
  }

  // Standing moved by agreement: the same view is warming, opposite views
  // cool things a little, and anything else is a pleasant chat.
  function agreementDelta(npcStance, speakerStance) {
    const firm = s => s === 'like' || s === 'dislike';
    if (firm(npcStance) && firm(speakerStance)) return npcStance === speakerStance ? 3 : -2;
    return 1;
  }

  // ── One exchange about a topic ───────────────────────────────────────────
  // opts: { topic, npcName, speakerName, npcSubject, speakerSubject,
  //         speakerVoice: 'em'|'bubba'|null, npcVoice: 'em'|'bubba'|null,
  //         persName, npcProfile, topics (for the ask back), rand,
  //         askBack (force) }
  // Em or Bubba answering speak their own lines; an ordinary NPC answering
  // one of them has an alternate set for each. An ordinary adult answering on
  // a political topic they hold a view on adds a word in their creed's voice
  // (NPCConversation CreedVoice, which exempts Em, Bubba, children and beasts).
  function answerVariantOf(speakerVoice, npcVoice) {
    if (npcVoice) return npcVoice;
    return speakerVoice === 'em' ? 'toEm' : speakerVoice === 'bubba' ? 'toBubba' : 'default';
  }
  function talkExchange(opts) {
    const o = opts || {};
    const rand = o.rand || Math.random;
    const topic = String(o.topic || '');
    const cls = classify(topic);
    const label = topicLabel(topic);
    const npcStance = stanceOf(o.npcSubject, topic, cls);
    const speakerStance = stanceOf(o.speakerSubject, topic, cls);
    const answerVariant = answerVariantOf(o.speakerVoice, o.npcVoice);
    const ask = line('talk.ask', o.speakerVoice || 'default', null,
      { topic: label, name: o.npcName || '' }, rand);
    let answer = line('talk.answer', answerVariant, npcStance,
      { topic: label, name: o.speakerName || '' }, rand);
    const NC = window.NPCConversation;
    if (!o.npcVoice && o.persName && NC && NC.applyVoice) {
      try { answer = NC.applyVoice(answer, o.persName, 0.35) || answer; } catch (e) { /* keep */ }
    }
    if (!o.npcVoice && o.npcProfile && POLITICAL_KINDS.includes(cls.kind) && npcStance !== 'unknown' &&
        NC && NC.CreedVoice && NC.CreedVoice.frame) {
      try {
        const extra = NC.CreedVoice.frame(o.npcProfile, 'politics', { topic: label }, o.npcName || '');
        if (extra) answer = `${answer} ${extra}`;
      } catch (e) { /* no creed voice here */ }
    }
    const out = {
      topic, label, kind: cls.kind, creedTopic: CREED_KINDS.includes(cls.kind),
      npcStance, speakerStance, delta: agreementDelta(npcStance, speakerStance),
      answerVariant, ask, answer, askBack: null,
    };
    // The NPC asks something back, about a topic it knows itself.
    const wantsBack = o.askBack != null ? !!o.askBack : rand() < ASK_BACK_CHANCE;
    if (wantsBack && npcStance !== 'unknown') {
      const pool = (o.topics || []).map(t => (typeof t === 'string' ? t : t && t.value)).filter(Boolean)
        .filter(t => t !== topic && stanceOf(o.npcSubject, t) !== 'unknown');
      if (pool.length) {
        const other = pool[Math.floor(rand() * pool.length)];
        const otherLabel = topicLabel(other);
        const replyStance = stanceOf(o.speakerSubject, other);
        out.askBack = {
          topic: other, label: otherLabel, speakerStance: replyStance,
          ask: line('talk.askBack', answerVariant, null, { topic: otherLabel, name: o.speakerName || '' }, rand),
          reply: line('talk.reply', o.speakerVoice || 'default', replyStance,
            { topic: otherLabel, name: o.npcName || '' }, rand),
        };
      }
    }
    return out;
  }

  // ── Skills ───────────────────────────────────────────────────────────────
  const skillAt = id => (typeof $dataSkills !== 'undefined' && $dataSkills) ? $dataSkills[id] : null;
  const categoryOf = skill => {
    const m = String((skill && skill.note) || '').match(/<category:\s*(.+?)\s*>/i);
    return m ? m[1].trim() : null;
  };
  const isBasic = cat => typeof cat === 'string' && cat.trim().toLowerCase() === 'basic'; // i18n-ignore: <category:Basic> note tag

  // A real, teachable skill: not the engine's Attack/Guard/Escape kit, not the
  // Basic category, not a placeholder row.
  function isLessonSkill(skill) {
    if (!skill || !skill.id || !skill.name || String(skill.name).startsWith('<--')) return false;
    if (skill.id <= 2 || skill.id === 5) return false;
    const SM = window.SkillMaster;
    if (SM && SM.isHiddenSkill && SM.isHiddenSkill(skill)) return false;
    return !isBasic(categoryOf(skill));
  }

  // The skill's cost in knowledge points (SkillMaster's price on the tree).
  function skillCost(skill) {
    const SM = window.SkillMaster;
    if (SM && SM.kpTeachCost) {
      try { const kp = SM.kpTeachCost(skill); if (kp > 0) return kp; } catch (e) { /* fall through */ }
    }
    return 50 + Math.round((((skill && skill.mpCost) || 0) + ((skill && skill.tpCost) || 0)) * 10);
  }
  // Hours a lesson takes: one hour for the cheapest skill, climbing with the
  // log of its cost, never more than a day.
  function lessonHours(skill) {
    const kp = Math.max(50, skillCost(skill));
    return Math.max(1, Math.min(HOURS_CAP, Math.round(1 + 2.2 * Math.log2(kp / 50))));
  }
  function lessonFee(skill) {
    return Math.max(1, Math.round(skillCost(skill) * GOLD_PER_KP));
  }

  // The learner as the requirement check reads it, from a profile or an actor.
  function learnerOfProfile(profile, name) {
    if (!profile) return null;
    const NC = window.NPCCreature;
    const nm = String(name || profile._npcName || '');
    let minor = false;
    try { minor = !!(window.NPCLifeSim && window.NPCLifeSim.isMinor && window.NPCLifeSim.isMinor(nm, profile)); }
    catch (e) { minor = false; }
    if (profile.lifeStage && profile.lifeStage !== 'adult') minor = true; // i18n-ignore: life stage id
    return {
      kind: 'npc', name: nm,
      level: Number(profile.level) || 1,
      classId: Number(profile.assignedClassId != null ? profile.assignedClassId : profile.classId) || 0,
      skillIds: (profile.skillIds || []).slice(),
      minor,
      nonSentient: !!(NC && ((NC.isNonSentientProfile && NC.isNonSentientProfile(profile)) ||
        (NC.isNonSentientByName && NC.isNonSentientByName(nm)))),
    };
  }
  function learnerOfActor(actor) {
    if (!actor) return null;
    const NC = window.NPCCreature;
    const cls = actor.currentClass ? actor.currentClass() : null;
    const classId = (cls && cls.id) || actor._classId || 0;
    return {
      kind: 'actor', name: typeof actor.name === 'function' ? actor.name() : String(actor.name || ''),
      level: Number(actor.level) || 1,
      classId: Number(classId) || 0,
      skillIds: (actor.skills ? actor.skills() : []).map(s => s && s.id).filter(Boolean),
      minor: false,
      nonSentient: !!(NC && NC.isNonSentientClassId && NC.isNonSentientClassId(classId)),
      actor,
    };
  }

  // Children and beasts sit out lessons altogether, on either side.
  function lessonBlock(learner) {
    if (!learner) return 'beast';
    if (learner.nonSentient) return 'beast';
    if (learner.minor) return 'child';
    return null;
  }

  function classAllows(classId, skill, knownIds) {
    const SM = window.SkillMaster;
    const map = SM && SM.CATEGORY_DATA && SM.CATEGORY_DATA.classSkillCategories;
    const entry = map && (map[classId] || map[String(classId)]);
    if (!entry) return true;
    const own = [].concat(entry.primary || [], entry.secondary || []);
    if (!own.length) return true;
    const cat = categoryOf(skill);
    if (!cat || isBasic(cat) || own.includes(cat)) return true;
    // A school they already practise outside their calling counts as theirs,
    // as it does in the Skill Master (actorCategoryManager.isForeign).
    return (knownIds || []).some(id => categoryOf(skillAt(id)) === cat);
  }

  // Why `learner` cannot take `skill`, or null when they can:
  // { code, params }, code one of known | youKnow | nature | cultist | level |
  // calling | prereq.
  function requirementBlock(learner, skill) {
    if (!learner || !skill) return { code: 'beast', params: {} };
    const known = learner.skillIds || [];
    if (known.includes(skill.id)) return { code: learner.kind === 'actor' ? 'youKnow' : 'known', params: {} };
    const MN = window.MagicNature;
    if (MN && MN.allowsData && !MN.allowsData(skill)) return { code: 'nature', params: {} };
    const A = window.SkillArcana;
    if (A && A.isSandbox && A.isSandbox()) return null;
    if (((A && A.CULTIST_CLASS_ID) || 8) === learner.classId) return { code: 'cultist', params: {} };
    const need = (A && A.requiredLevel) ? A.requiredLevel(skill) : 0;
    if (need > 0 && learner.level < need) return { code: 'level', params: { level: need } };
    if (!classAllows(learner.classId, skill, known)) return { code: 'calling', params: {} };
    const G = window.SkillGraph;
    if (G && G.requires && !(G.isForbidden && G.isForbidden(skill.id))) {
      const parents = (G.requires(skill.id) || []).filter(id => skillAt(id));
      if (parents.length) {
        const want = Math.max(1, Number(G.needed && G.needed(skill.id)) || 0);
        const held = parents.filter(id => known.includes(id)).length;
        if (held < want) {
          const missing = parents.filter(id => !known.includes(id)).map(id => skillAt(id).name);
          return { code: 'prereq', params: { skills: missing.slice(0, 3).join(', ') } };
        }
      }
    }
    return null;
  }
  const reasonText = (block) => block ? Tr(`reason.${block.code}`, block.params) : '';

  function skillRow(skill, block, extra) {
    return Object.assign({
      skillId: skill.id, name: skill.name, hours: lessonHours(skill), fee: lessonFee(skill),
      disabled: !!block, reason: block ? block.code : null, reasonText: reasonText(block),
    }, extra || {});
  }
  const byOpenThenName = (a, b) => (a.disabled - b.disabled) || String(a.name).localeCompare(String(b.name));

  // Everything the speaking member knows, each one open or greyed with why.
  function teachOptions(actor, profile, npcName) {
    const teacher = learnerOfActor(actor);
    const learner = learnerOfProfile(profile, npcName);
    if (lessonBlock(teacher) || lessonBlock(learner)) return [];
    const rows = [];
    for (const id of teacher.skillIds) {
      const skill = skillAt(id);
      if (!isLessonSkill(skill)) continue;
      rows.push(skillRow(skill, requirementBlock(learner, skill),
        { npcCanPay: (Number(profile.money) || 0) >= lessonFee(skill) }));
    }
    return rows.sort(byOpenThenName);
  }

  // The price a relationship puts on a lesson from the NPC.
  function learnTerms(opinion, skill) {
    const op = Number(opinion) || 0;
    if (op <= HOSTILE_OPINION) return { refused: true, free: false, price: 0 };
    if (op >= FREE_LEARN_OPINION) return { refused: false, free: true, price: 0 };
    return { refused: false, free: false, price: lessonFee(skill) };
  }

  function partyGold() {
    try { return (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.gold() : 0; } catch (e) { return 0; }
  }

  // The NPC's skills the speaking member does not have yet, greyed where the
  // requirement check, the relationship or the purse says no.
  function learnOptions(actor, profile, npcName, opinion) {
    const learner = learnerOfActor(actor);
    const teacher = learnerOfProfile(profile, npcName);
    if (lessonBlock(teacher) || lessonBlock(learner)) return [];
    const gold = partyGold();
    const rows = [];
    for (const id of (teacher.skillIds || [])) {
      const skill = skillAt(id);
      if (!isLessonSkill(skill) || learner.skillIds.includes(id)) continue;
      const terms = learnTerms(opinion, skill);
      let block = requirementBlock(learner, skill);
      if (!block && terms.refused) block = { code: 'hostile', params: {} };
      if (!block && !terms.free && gold < terms.price) block = { code: 'youCantAfford', params: { price: money(terms.price) } };
      rows.push(skillRow(skill, block, { free: terms.free, price: terms.price, refused: terms.refused }));
    }
    return rows.sort(byOpenThenName);
  }

  function passHours(hours, hooks) {
    const minutes = Math.round(hours * 60);
    if (hooks && hooks.passTime) { hooks.passTime(minutes); return; }
    const TDS = window.TimeDateSystem;
    if (TDS && TDS.passTime) { try { TDS.passTime(minutes); } catch (e) { /* no clock here */ } }
  }

  // Spec XP for the specialization a taught skill trains (window.SkillSpecs
  // maps battle skills to specs; NPCSim.Specs.practice files it).
  function practiceSpec(profile, npcName, skill) {
    const def = window.SkillSpecs && window.SkillSpecs.forSkill && window.SkillSpecs.forSkill(skill);
    const Specs = window.NPCSim && window.NPCSim.Specs;
    if (!def || !Specs || !Specs.practice) return 0;
    try { return Specs.practice(profile, npcName, def.name, TEACH_SPEC_POINTS) || 0; } catch (e) { return 0; }
  }

  // Teach one skill. opts: { actor, profile, npcName, skillId, sold,
  // addOpinion(delta), passTime(minutes), rand }.
  // Answers { ok, reason, hours, fee, delta, sold }.
  function applyTeach(opts) {
    const o = opts || {};
    const skill = skillAt(o.skillId);
    const row = teachOptions(o.actor, o.profile, o.npcName).find(r => r.skillId === o.skillId);
    if (!skill || !row) return { ok: false, reason: 'beast' };
    if (row.disabled) return { ok: false, reason: row.reason };
    const rand = o.rand || Math.random;
    const sold = !!o.sold;
    let fee = 0;
    if (sold) {
      fee = row.fee;
      if ((Number(o.profile.money) || 0) < fee) return { ok: false, reason: 'cantAfford', fee };
      o.profile.money = (Number(o.profile.money) || 0) - fee;
      try { $gameParty.gainGold(fee); } catch (e) { /* no party here */ }
    }
    const range = sold ? SOLD_TEACH : FREE_TEACH;
    const delta = rollInt(rand, range[0], range[1]);
    (o.profile.skillIds || (o.profile.skillIds = [])).push(skill.id);
    const tiers = practiceSpec(o.profile, o.npcName, skill);
    passHours(row.hours, o);
    if (o.addOpinion) o.addOpinion(delta);
    return { ok: true, hours: row.hours, fee, delta, sold, tiers };
  }

  // Learn one skill from the NPC. opts: { actor, profile, npcName, skillId,
  // opinion, passTime(minutes) }. Answers { ok, reason, hours, price, free }.
  function applyLearn(opts) {
    const o = opts || {};
    const skill = skillAt(o.skillId);
    const row = learnOptions(o.actor, o.profile, o.npcName, o.opinion).find(r => r.skillId === o.skillId);
    if (!skill || !row) return { ok: false, reason: 'beast' };
    if (row.disabled) return { ok: false, reason: row.reason };
    const price = row.free ? 0 : row.price;
    if (price > 0) {
      try {
        if ($gameParty.gold() < price) return { ok: false, reason: 'youCantAfford', price };
        $gameParty.loseGold(price);
      } catch (e) { return { ok: false, reason: 'youCantAfford', price }; }
      // A beast teacher takes the fee for nothing (NPCCreature.mayHoldMoney).
      if (window.NPCCreature?.mayHoldMoney?.(o.profile, o.npcName) !== false) o.profile.money = (Number(o.profile.money) || 0) + price;
    }
    o.actor.learnSkill(skill.id);
    try {
      if (window.SkillGraph && window.SkillGraph.invalidate) window.SkillGraph.invalidate();
      const atlas = window.SkillMaster && window.SkillMaster.SkillAtlas;
      if (atlas && atlas.invalidate) atlas.invalidate();
    } catch (e) { /* caches only */ }
    passHours(row.hours, o);
    return { ok: true, hours: row.hours, price, free: row.free };
  }

  // ── Specializations, both ways ───────────────────────────────────────────
  // Train    the speaking member trains the NPC in one of the member's
  //          specializations held at a higher tier than the NPC's. A session
  //          lifts the NPC one tier (NPCSim.Specs files the xp), never past the
  //          member's own. Free for a big gain in standing, or sold, the NPC
  //          paying by the tier reached, for a small one.
  // Learn    the NPC trains the member in one of the NPC's specializations held
  //          above the member's tier: one tier a session, never past the
  //          NPC's own. Free from a friend, paid by tier when neutral, refused
  //          by anybody hostile, the same thresholds as Learn for skills.
  // Hours grow with the tier gap and with the tier being left, never past 24.
  // Children and beasts are greyed (never trained, never training), and so is
  // a discipline the game does nothing with yet (Specializations
  // .isImplemented) and, for a pacifist, any weapon.
  const SPEC_HOURS_PER_GAP = 7;
  const SPEC_HOURS_PER_TIER = 3;
  const SPEC_FEE_PER_TIER = 2500;    // 25.00 euros for each tier past Untrained
  const FREE_TRAIN = [10, 20];
  const SOLD_TRAIN = [2, 6];
  const SPEC_MAX_TIER = 5;
  const PACIFIST_TRAIT_ID = 25;      // Traits.json: pacifist
  const PACIFIST_TRAIT = 'pacifist'; // i18n-ignore: trait id

  function specTable() {
    const S = window.Specializations;
    return (S && S.ready && Array.isArray(S.list) && S.byId) ? S : null;
  }
  function specLabel(S, spec) {
    return (S.displayName && S.displayName(spec)) || spec.name;
  }
  function tierLabel(S, tier) {
    return (S.levelName && S.levelName(tier)) || String(tier);
  }
  // One session, from `fromTier` with a teacher `gap` tiers ahead.
  function specHours(fromTier, gap) {
    const g = Math.max(1, Number(gap) || 1);
    const from = Math.max(1, Number(fromTier) || 1);
    return Math.max(1, Math.min(HOURS_CAP, SPEC_HOURS_PER_GAP * g + SPEC_HOURS_PER_TIER * (from - 1)));
  }
  // The price of a session, by the tier it reaches.
  function specFee(toTier) {
    return SPEC_FEE_PER_TIER * Math.max(1, (Number(toTier) || 2) - 1);
  }

  // The NPC's tiers, id -> level (2-5), as the simulation reads them.
  function npcSpecLevels(profile, name) {
    const Specs = window.NPCSim && window.NPCSim.Specs;
    if (Specs && Specs.levelsFor) {
      try { if (Specs.ensure) Specs.ensure(profile, name); } catch (e) { /* read what is stored */ }
      try { return Specs.levelsFor(profile, profile.assignedClassId, name); } catch (e) { /* fall through */ }
    }
    const out = new Map();
    for (const [id, lvl] of Object.entries((profile && profile.specLevels) || {})) {
      if (Number(lvl) > 1) out.set(Number(id), Number(lvl));
    }
    return out;
  }
  function actorSpecLevel(actor, id) {
    try { return (actor && actor.specializationLevel) ? (Number(actor.specializationLevel(id)) || 1) : 1; }
    catch (e) { return 1; }
  }
  function isPacifist(profile) {
    if (!profile) return false;
    if ((profile.traitIds || []).map(Number).includes(PACIFIST_TRAIT_ID)) return true;
    return traitIds(profile.traits).some(t => String(t).toLowerCase() === PACIFIST_TRAIT);
  }

  // Why `learner` cannot be trained in `spec`, or null: { code, params }.
  function specBlock(learner, spec, S, profile) {
    const who = lessonBlock(learner);
    if (who) return { code: who, params: {} };
    if (S.isImplemented && !S.isImplemented(spec)) return { code: 'unimplemented', params: {} };
    if (spec.wtypeId && profile && isPacifist(profile)) return { code: 'pacifist', params: {} };
    return null;
  }

  function specRow(S, spec, from, teacherTier, block, extra) {
    const to = Math.min(SPEC_MAX_TIER, from + 1);
    return Object.assign({
      specId: spec.id, name: specLabel(S, spec),
      fromTier: from, toTier: to, teacherTier,
      fromName: tierLabel(S, from), toName: tierLabel(S, to),
      hours: specHours(from, teacherTier - from), fee: specFee(to),
      disabled: !!block, reason: block ? block.code : null, reasonText: reasonText(block),
    }, extra || {});
  }

  // Every specialization the member holds above the NPC's tier, open or
  // greyed with why. A beast in the party trains nobody.
  function specTrainOptions(actor, profile, npcName) {
    const S = specTable();
    if (!S || !actor || !profile) return [];
    const teacher = learnerOfActor(actor);
    if (lessonBlock(teacher)) return [];
    const learner = learnerOfProfile(profile, npcName);
    const theirs = npcSpecLevels(profile, npcName);
    const purse = Number(profile.money) || 0;
    const rows = [];
    for (const spec of S.list) {
      if (!spec || spec.id == null) continue;
      const mine = actorSpecLevel(actor, spec.id);
      if (mine <= 1) continue;
      const from = theirs.get(spec.id) || 1;
      if (from >= mine) continue;
      rows.push(specRow(S, spec, from, mine, specBlock(learner, spec, S, profile),
        { npcCanPay: purse >= specFee(from + 1) }));
    }
    return rows.sort(byOpenThenName);
  }

  // The price a relationship puts on a session from the NPC.
  function specLearnTerms(opinion, toTier) {
    const op = Number(opinion) || 0;
    if (op <= HOSTILE_OPINION) return { refused: true, free: false, price: 0 };
    if (op >= FREE_LEARN_OPINION) return { refused: false, free: true, price: 0 };
    return { refused: false, free: false, price: specFee(toTier) };
  }

  // Every specialization the NPC holds above the member's tier.
  function specLearnOptions(actor, profile, npcName, opinion) {
    const S = specTable();
    if (!S || !actor || !profile) return [];
    const learner = learnerOfActor(actor);
    const teacher = learnerOfProfile(profile, npcName);
    if (lessonBlock(teacher) || lessonBlock(learner)) return [];
    const gold = partyGold();
    const rows = [];
    for (const [id, tier] of npcSpecLevels(profile, npcName)) {
      const spec = S.byId.get(Number(id));
      if (!spec) continue;
      const from = actorSpecLevel(actor, spec.id);
      if (from >= tier) continue;
      const terms = specLearnTerms(opinion, from + 1);
      let block = (S.isImplemented && !S.isImplemented(spec)) ? { code: 'unimplemented', params: {} } : null;
      if (!block && terms.refused) block = { code: 'hostile', params: {} };
      if (!block && !terms.free && gold < terms.price) block = { code: 'youCantAfford', params: { price: money(terms.price) } };
      rows.push(specRow(S, spec, from, tier, block, { free: terms.free, price: terms.price, refused: terms.refused }));
    }
    return rows.sort(byOpenThenName);
  }

  // Lift the NPC one tier: the simulation's own xp path where it takes the
  // discipline, the tier written straight for a weapon (which NPCSim.Specs
  // never practises) or when there is no simulation.
  function raiseNpcSpec(profile, npcName, spec, from) {
    const levels = profile.specLevels || (profile.specLevels = {});
    const xp = profile.specXp || (profile.specXp = {});
    // A tier held from the class or a trait is not stored yet: store it first,
    // so the session climbs from where the person really stands.
    levels[spec.id] = Math.max(Number(levels[spec.id]) || 1, from);
    const Specs = window.NPCSim && window.NPCSim.Specs;
    if (Specs && Specs.practice && Specs.tierCost && !spec.wtypeId) {
      try {
        const need = Math.max(1, Specs.tierCost(from) - (Number(xp[spec.id]) || 0));
        const got = Specs.practice(profile, npcName, spec.name, need);
        if (got > 0) return got;
      } catch (e) { /* fall back to the plain write */ }
    }
    levels[spec.id] = Math.max(Number(levels[spec.id]) || 1, Math.min(SPEC_MAX_TIER, from + 1));
    delete xp[spec.id];
    return 1;
  }

  // Train the NPC. opts: { actor, profile, npcName, specId, sold,
  // addOpinion(delta), passTime(minutes), rand }.
  // Answers { ok, reason, hours, fee, delta, sold, toTier }.
  function applySpecTrain(opts) {
    const o = opts || {};
    const S = specTable();
    const spec = S && S.byId.get(o.specId);
    const row = specTrainOptions(o.actor, o.profile, o.npcName).find(r => r.specId === o.specId);
    if (!spec || !row) return { ok: false, reason: 'beast' };
    if (row.disabled) return { ok: false, reason: row.reason };
    const rand = o.rand || Math.random;
    const sold = !!o.sold;
    let fee = 0;
    if (sold) {
      fee = row.fee;
      if ((Number(o.profile.money) || 0) < fee) return { ok: false, reason: 'cantAfford', fee };
      o.profile.money = (Number(o.profile.money) || 0) - fee;
      try { $gameParty.gainGold(fee); } catch (e) { /* no party here */ }
    }
    const range = sold ? SOLD_TRAIN : FREE_TRAIN;
    const delta = rollInt(rand, range[0], range[1]);
    raiseNpcSpec(o.profile, o.npcName, spec, row.fromTier);
    passHours(row.hours, o);
    if (o.addOpinion) o.addOpinion(delta);
    return { ok: true, hours: row.hours, fee, delta, sold, toTier: row.toTier, toName: row.toName };
  }

  // Learn from the NPC. opts: { actor, profile, npcName, specId, opinion,
  // passTime(minutes) }. Answers { ok, reason, hours, price, free, toTier }.
  function applySpecLearn(opts) {
    const o = opts || {};
    const S = specTable();
    const spec = S && S.byId.get(o.specId);
    const row = specLearnOptions(o.actor, o.profile, o.npcName, o.opinion).find(r => r.specId === o.specId);
    if (!spec || !row) return { ok: false, reason: 'beast' };
    if (row.disabled) return { ok: false, reason: row.reason };
    const price = row.free ? 0 : row.price;
    if (price > 0) {
      try {
        if ($gameParty.gold() < price) return { ok: false, reason: 'youCantAfford', price };
        $gameParty.loseGold(price);
      } catch (e) { return { ok: false, reason: 'youCantAfford', price }; }
      if (window.NPCCreature?.mayHoldMoney?.(o.profile, o.npcName) !== false) o.profile.money = (Number(o.profile.money) || 0) + price;
    }
    // Exactly what is left of the member's current tier: one tier, and so
    // never past the NPC's own (the row only exists below it).
    const need = Math.max(0, ((S.expToNext && S.expToNext(row.fromTier, spec)) || 0) -
      (o.actor.specializationExp ? (Number(o.actor.specializationExp(spec.id)) || 0) : 0));
    let gained = 0;
    if (need > 0 && o.actor.gainSpecializationExp) gained = o.actor.gainSpecializationExp(spec.id, need) || 0;
    if (gained) {
      const XP = window.SpecializationXP;
      try { if (XP && XP.announce) XP.announce({ actor: o.actor, spec, level: gained }); } catch (e) { /* toast only */ }
    }
    passHours(row.hours, o);
    return { ok: true, hours: row.hours, price, free: row.free, toTier: row.toTier, toName: row.toName, gained };
  }

  window.NPCEmpathizeLessons = {
    HOURS_CAP, GOLD_PER_KP, FREE_LEARN_OPINION, HOSTILE_OPINION, FREE_TEACH, SOLD_TEACH,
    FREE_TRAIN, SOLD_TRAIN, SPEC_FEE_PER_TIER,
    STANCES, CREED_KINDS,
    hash, seeded, line, poolOf, money, text: Tr,
    knownTopics, hasKnownTopics, topicOptions, classify, topicLabel,
    subjectOfProfile, subjectOfActor, stanceOf, agreementDelta, answerVariantOf, talkExchange,
    isLessonSkill, skillCost, lessonHours, lessonFee,
    learnerOfProfile, learnerOfActor, lessonBlock, requirementBlock, reasonText, classAllows,
    teachOptions, learnOptions, learnTerms, applyTeach, applyLearn,
    specHours, specFee, npcSpecLevels, specTrainOptions, specLearnOptions, specLearnTerms,
    applySpecTrain, applySpecLearn,
  };
  if (window.NPCEmpathize) window.NPCEmpathize.Lessons = window.NPCEmpathizeLessons;

  // ============================================================================
  // SECTION 10b, MONEY, WORK AND TRAVEL (NPCEmpathize.Deals)
  // ============================================================================
  // The reckoning behind the Money and the Work and travel verbs of the
  // Empathize board. Every one of them calls the system that owns the thing
  // (the stock market, the job rota, the workplace deeds, the quest board, the
  // fast travel network, the life simulation) and answers an outcome
  //   { ok, reason, deltaOpinion, money, xp, lines }
  // that the scene (NPCEmpathizeUI_Chat.js, DEALS) speaks into the log and
  // applies. `lines` are { role, key, params } into Empathize.act.*.
  //
  //   Stock tips      a shareholder hints at where their biggest holding is
  //                   heading: right as often as their Stock Trading and their
  //                   liking for the member allow, and now and then a lie from
  //                   somebody dishonest
  //   Trade shares    buy from or sell to a shareholder at the market price,
  //                   plus a spread their opinion narrows; the float never
  //                   moves (the party's side and theirs move together)
  //   Lend / borrow   euros lent at interest for a week, repaid or defaulted by
  //                   their honesty; or borrowed from somebody rich who likes
  //                   the member (opinion 40+), taken back when due, and every
  //                   missed day costs standing (nothing is filed)
  //   Ask for work    a shift at their workplace when it has a post open, or a
  //                   contract off the quest board they posted or pass on
  //   Hire / fire     at a workplace the party owns, in their own town
  //   Work together   a few hours of their shift worked beside them
  //   Ask for a ride  a car owner drives the party to a stop for a fare
  //   Borrow vehicle  their bike or broom for a day; not giving it back is theft
  //   Invite to move  relocation to a town the party knows, household and all
  //   Expedition      they join or raise an adventuring band
  //
  // Nobody who cannot hold money or work (a child, a beast) is offered any of
  // it; Em and Bubba are left out of it; a <Story> character never changes
  // job, home or band. Settling what falls due (loans, a lent vehicle) runs on
  // demand, when the map starts, over the people who have something open.
  const DEAL_IDS = ['stockTips', 'tradeShares', 'lend', 'borrow', 'askWork', 'hire', 'fire', 'workTogether',
    'askRide', 'borrowVehicle', 'inviteMove', 'inviteExpedition'];
  const DEAL_CAT = {
    stockTips: 'money', tradeShares: 'money', lend: 'money', borrow: 'money',
    askWork: 'work', hire: 'work', fire: 'work', workTogether: 'work',
    askRide: 'work', borrowVehicle: 'work', inviteMove: 'work', inviteExpedition: 'work',
  };
  const DEAL_DAY = 1440;
  // Days before the same verb may be tried on the same person again.
  const DEAL_COOLDOWN = {
    stockTips: 1, tradeShares: 1, lend: 1, borrow: 1, askWork: 1, workTogether: 1,
    askRide: 1, inviteMove: 7, inviteExpedition: 3,
  };
  const TIP_OPINION = 0;
  const HOSTILE_DEAL = -20;
  const WORK_OPINION = -10;
  const FRIEND_OPINION = 40;
  const FREE_RIDE_OPINION = 60;
  const LEND_AMOUNTS = [2000, 5000, 10000, 25000];   // 20, 50, 100, 250 euros
  const LEND_RATE = 0.10;
  const BORROW_RATE = 0.08;
  const LOAN_DAYS = 7;
  const BORROW_CAP = 50000;                          // 500.00 euros at most
  const BORROW_SHARE = 0.25;                         // of what they have on hand
  const RICH_MONEY = 20000;
  const NO_NEED_FACTOR = 10;                         // a purse ten times the sum needs no loan
  const LOAN_MISS_LIMIT = 5;
  const MISS_OPINION = -10;
  const WRITE_OFF_OPINION = -25;
  const TRADE_LOTS = [1, 10, 100];
  const WORK_TOGETHER_HOURS = 4;
  const WORK_TOGETHER_SHARE = 0.25;                  // their cut of what the member earns
  const HIRE_OPINION = 5;
  const FIRE_OPINION = -25;
  const THEFT_OPINION = -40;
  const RIDE_MODE = 'taxi';                          // i18n-ignore: FastTravel transport id
  const RIDE_STOPS = 8;
  const EXPEDITION_FLOORS = 4;
  const MOVE_REASON = 'changeOfAir';                 // i18n-ignore: NPCLife MOVE_REASONS id
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function dealNow() {
    try { return (typeof $gameVariables !== 'undefined' && $gameVariables) ? (Number($gameVariables.value(114)) || 0) : 0; }
    catch (e) { return 0; }
  }
  // A line of the Empathize.act bank, its {a|b} alternations resolved.
  function dealText(key, params, rand) {
    const full = `Empathize.act.${key}`;
    const raw = window.T ? window.T(full, params) : full;
    return alt(fill(raw, params), rand);
  }
  // The same line in a voice: Em or Bubba speaking (em, bubba), or somebody
  // answering them (toEm, toBubba), from Empathize.act.voice.<variant>.<key>.
  // A line with no voiced version is the plain one.
  function dealVoiceText(key, params, variant, rand) {
    if (variant && variant !== 'default' && window.T && window.T.has) {
      const full = `Empathize.act.voice.${variant}.${key}`; // i18n-ignore: i18n key
      let known = false;
      try { known = !!window.T.has(full); } catch (e) { known = false; }
      if (known) return alt(fill(window.T(full, params), params), rand);
    }
    return dealText(key, params, rand);
  }
  function dealLine(role, key, params) { return { role, key, params: params || {} }; }
  function dealModeOn(question) {
    const WM = (window.NPCShared && window.NPCShared.WorldModes) || window.WorldModes || null;
    if (!WM || typeof WM[question] !== 'function') return true;
    try { return WM[question]() !== false; } catch (e) { return true; }
  }
  // How often `tag` ('action_<id>') was logged on them in the last `days`,
  // counted the way the panel's _countRecentInteractions counts.
  function dealRecent(profile, tag, days, now) {
    const log = profile && profile.eventLog;
    if (!Array.isArray(log) || !log.length) return 0;
    const cutoff = (now == null ? dealNow() : now) - days * DEAL_DAY;
    let n = 0;
    for (const e of log) if (e && e.tag === tag && (Number(e.gameMin) || 0) >= cutoff) n++;
    return n;
  }
  function logDeal(profile, id, desc, now) {
    if (!profile) return;
    (profile.eventLog = Array.isArray(profile.eventLog) ? profile.eventLog : []).push({
      tag: 'action_' + id, desc: String(desc || id),
      timestamp: Date.now(), gameMin: now == null ? dealNow() : now,
    });
  }
  function partyGold() {
    try { return (typeof $gameParty !== 'undefined' && $gameParty) ? (Number($gameParty.gold()) || 0) : 0; }
    catch (e) { return 0; }
  }
  function partyPay(gold) { if (gold > 0) { try { $gameParty.loseGold(gold); } catch (e) { /* no party */ } } }
  function partyGain(gold) { if (gold > 0) { try { $gameParty.gainGold(gold); } catch (e) { /* no party */ } } }
  function purseOf(profile) { return Math.max(0, Number(profile && profile.money) || 0); }
  function moneyCap() {
    const cap = window.NPCSim && window.NPCSim._internal && window.NPCSim._internal.MONEY_CAP;
    return Number(cap) > 0 ? Number(cap) : Infinity;
  }
  function purseAdd(profile, gold) {
    if (!profile) return;
    profile.money = clamp(purseOf(profile) + (Number(gold) || 0), 0, moneyCap());
  }
  function isMinorNamed(name, profile) {
    try { if (window.NPCLifeSim && window.NPCLifeSim.isMinor && window.NPCLifeSim.isMinor(name)) return true; }
    catch (e) { /* no life sim */ }
    return !!(profile && (profile._child || profile.isChild));
  }
  // A grown, sentient person with a purse of their own: the only kind any of
  // these verbs is ever offered to.
  function dealsPerson(profile, name) {
    if (!profile || profile._killed) return false;
    const NC = window.NPCCreature;
    if (NC && NC.isNonSentientProfile && NC.isNonSentientProfile(profile)) return false;
    if (NC && NC.mayHoldMoney && NC.mayHoldMoney(profile, name) === false) return false;
    return !isMinorNamed(name, profile);
  }
  // Honesty 0..100: the life record's own when there is one, else read off
  // their morality (-100..100), 50 for somebody unknown.
  function honestyOf(profile, name) {
    try {
      const rec = window.NPCLifeSim && window.NPCLifeSim.getRecord && window.NPCLifeSim.getRecord(name);
      if (rec && Number.isFinite(Number(rec.honesty))) return clamp(Number(rec.honesty), 0, 100);
    } catch (e) { /* fall through */ }
    const m = Number(profile && profile.morality);
    return Number.isFinite(m) ? clamp((m + 100) / 2, 0, 100) : 50;
  }
  // Their tier (1..5) in a specialization, by its English name.
  function npcSpecTierNamed(profile, name, specName) {
    const S = specTable();
    if (!S) return 1;
    const spec = (S.byName && S.byName.get && S.byName.get(specName)) || S.list.find(s => s && s.name === specName);
    if (!spec) return 1;
    try { return Number(npcSpecLevels(profile, name).get(spec.id)) || 1; } catch (e) { return 1; }
  }
  function assignmentOf(name) {
    try { return ($gameSystem && $gameSystem._npcJobAssignments && $gameSystem._npcJobAssignments[name]) || null; }
    catch (e) { return null; }
  }
  function jobOf(jobId) {
    const WS = window.WorkSystem;
    if (!WS || !(Number(jobId) > 0)) return null;
    try { return (WS.getJob ? WS.getJob(Number(jobId)) : null) || null; } catch (e) { return null; }
  }
  function jobLabel(job) {
    const WS = window.WorkSystem;
    try { return (WS && WS.jobName && WS.jobName(job)) || String((job && job.name) || ''); } catch (e) { return ''; }
  }
  function roll(rand) { return (rand || Math.random)(); }

  // ── Loans and lent vehicles: who has something open ──────────────────────
  function dealBook() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
    if (!$gameSystem._empDeals || typeof $gameSystem._empDeals !== 'object') $gameSystem._empDeals = {};
    return $gameSystem._empDeals;
  }
  function markOpen(name) { const b = dealBook(); if (b && name) b[name] = true; }
  function loansOf(profile) { return (profile && Array.isArray(profile._loans)) ? profile._loans : []; }
  function openLoan(profile, dir) { return loansOf(profile).find(l => l && l.dir === dir) || null; }

  // ── Gates ────────────────────────────────────────────────────────────────
  // Whether a verb is offered to this person, and live: true, false (hidden)
  // or { disabled, reason } with a reason key under Empathize.act.<cat>.reason.
  // ctx: { profile, npcName, opinion, actor, story, recent(id, days) }.
  function dealGate(id, ctx) {
    const c = ctx || {};
    const profile = c.profile;
    const name = c.npcName;
    const opinion = Number(c.opinion) || 0;
    if (!DEAL_CAT[id] || !dealsPerson(profile, name)) return false;
    const recent = typeof c.recent === 'function' ? c.recent : (tag, d) => dealRecent(profile, tag, d);
    const cooling = DEAL_COOLDOWN[id] ? recent('action_' + id, DEAL_COOLDOWN[id]) > 0 : false;
    const grey = (reason) => ({ disabled: true, reason });
    const S = window.NPCSim && window.NPCSim.Stocks;
    const M = window.StockSociety;
    const marketOpen = !!(M && M.isOpen && M.isOpen());
    switch (id) {
      case 'stockTips': {
        if (!marketOpen || !S || !S.holdingsOf(profile).length) return false;
        if (cooling) return grey('cooldown');
        return opinion < TIP_OPINION ? grey('cold') : true;
      }
      case 'tradeShares': {
        if (!marketOpen || !S || !M.movePartyShares) return false;
        const theirs = S.holdingsOf(profile).length > 0;
        const ours = (M.listings() || []).some(l => (Number(M.partyShares(l.key)) || 0) > 0);
        if (!theirs && !ours) return false;
        if (cooling) return grey('cooldown');
        return opinion < HOSTILE_DEAL ? grey('hostile') : true;
      }
      case 'lend': {
        if (openLoan(profile, 'lent')) return grey('alreadyLent');
        if (cooling) return grey('cooldown');
        if (opinion < HOSTILE_DEAL) return grey('hostile');
        return partyGold() < LEND_AMOUNTS[0] ? grey('youCantAfford') : true;
      }
      case 'borrow': {
        if (openLoan(profile, 'borrowed')) return true;
        if (!isRich(profile)) return false;
        if (cooling) return grey('cooldown');
        return opinion < FRIEND_OPINION ? grey('notFriends') : true;
      }
      case 'askWork': {
        if (!jobOf(profile.currentJobId) && !window.ProceduralQuests) return false;
        if (cooling) return grey('cooldown');
        return opinion < WORK_OPINION ? grey('hostile') : true;
      }
      case 'hire': {
        if (c.story || !ownedWorkplacesIn(profile).length) return false;
        const a = assignmentOf(name);
        if (a && workplaceOwned(a.mapId)) return false;
        return profile._officer || profile._politicsOffice ? grey('office') : true;
      }
      case 'fire': {
        if (c.story) return false;
        const a = assignmentOf(name);
        return !!(a && workplaceOwned(a.mapId));
      }
      case 'workTogether': {
        if (!jobOf(profile.currentJobId)) return false;
        if (cooling) return grey('cooldown');
        return opinion < WORK_OPINION ? grey('hostile') : true;
      }
      case 'askRide': {
        const V = window.NPCSim && window.NPCSim.Vehicles;
        if (!V || !V.hasCar || !V.hasCar(profile, name) || !window.FastTravelSystem || !window.FastTravelSystem.quote) return false;
        if (cooling) return grey('cooldown');
        return opinion < 0 ? grey('cold') : true;
      }
      case 'borrowVehicle': {
        if (profile._lentVehicle) return grey('alreadyLent');
        if (!vehicleToLend(profile, name)) return false;
        return opinion < FRIEND_OPINION ? grey('notFriends') : true;
      }
      case 'inviteMove': {
        const L = window.NPCLifeSim;
        if (c.story || !L || !L.mayRelocate || !L.relocate || !L.mayRelocate(name)) return false;
        if (!knownTowns(profile).length) return false;
        return cooling ? grey('cooldown') : true;
      }
      case 'inviteExpedition': {
        const B = window.NPCLifeSim && window.NPCLifeSim.Bands;
        if (c.story || !B || !B.enlist || !B.mayJoin || !B.mayJoin(name)) return false;
        return cooling ? grey('cooldown') : true;
      }
      default: return false;
    }
  }

  // ── Stock tips ───────────────────────────────────────────────────────────
  function companyName(key) {
    const M = window.StockSociety;
    const l = M && M.listings ? (M.listings() || []).find(x => x.key === key) : null;
    return (l && l.name) || String(key);
  }
  // opts: { profile, npcName, opinion, rand }.
  function stockTip(opts) {
    const o = opts || {};
    const S = window.NPCSim && window.NPCSim.Stocks;
    const M = window.StockSociety;
    const held = S ? S.holdingsOf(o.profile) : [];
    if (!M || !held.length) return { ok: false, reason: 'noShares' };
    const opinion = Number(o.opinion) || 0;
    logDeal(o.profile, 'stockTips', 'tip');
    if (opinion < TIP_OPINION) {
      return { ok: false, reason: 'cold', deltaOpinion: 0,
        lines: [dealLine('player', 'money.tips.ask'), dealLine('npc', 'money.tips.cold')] };
    }
    const rand = o.rand || Math.random;
    const value = (p) => p.shares * (Number(M.priceOf(p.key)) || 0);
    const pos = held.slice().sort((a, b) => value(b) - value(a))[0];
    const truth = M.directionOf ? M.directionOf(pos.key) : 0;
    const tier = npcSpecTierNamed(o.profile, o.npcName, 'Stock Trading'); // i18n-ignore: Specialization name
    const accuracy = clamp(0.55 + (tier - 1) * 0.08 + opinion / 500, 0.5, 0.95);
    const honesty = honestyOf(o.profile, o.npcName);
    const lieOdds = honesty < 35 ? (35 - honesty) / 70 : 0;
    const lied = roll(rand) < lieOdds;
    const wrong = !lied && roll(rand) >= accuracy;
    let told = truth;
    if (lied || wrong) told = truth === 0 ? (roll(rand) < 0.5 ? 1 : -1) : -truth;
    const company = companyName(pos.key);
    const said = told > 0 ? 'up' : told < 0 ? 'down' : 'flat';
    return {
      ok: true, key: pos.key, company, told, truth, lied, truthful: told === truth, accuracy,
      deltaOpinion: 1, money: 0, xp: 1,
      lines: [dealLine('player', 'money.tips.ask'), dealLine('npc', 'money.tips.' + said, { company })],
    };
  }

  // ── Trade shares ─────────────────────────────────────────────────────────
  // The spread off the market price: 12% to somebody indifferent, down to 2%
  // for a close friend, up to 22% for somebody who dislikes the member.
  function tradeSpread(opinion) { return clamp(0.12 - (Number(opinion) || 0) * 0.001, 0.02, 0.22); }
  // Every block on offer: 'buy' (from their holdings) and 'sell' (to them,
  // out of the party's). max is what can change hands now.
  function tradeOptions(opts) {
    const o = opts || {};
    const S = window.NPCSim && window.NPCSim.Stocks;
    const M = window.StockSociety;
    if (!S || !M || !M.isOpen || !M.isOpen()) return [];
    const spread = tradeSpread(o.opinion);
    const gold = o.gold != null ? Number(o.gold) || 0 : partyGold();
    const rows = [];
    for (const pos of S.holdingsOf(o.profile)) {
      const price = Number(M.priceOf(pos.key)) || 0;
      if (!(price > 0)) continue;
      const unit = Math.ceil(price * (1 + spread));
      // Never more than their purse can take in: past the cap the money would
      // simply vanish.
      const room = Math.max(0, moneyCap() - purseOf(o.profile));
      rows.push({ side: 'buy', key: pos.key, company: companyName(pos.key), unit, have: pos.shares,
        max: Math.max(0, Math.min(pos.shares, Math.floor(gold / unit), Math.floor(room / unit))) });
    }
    const mayHold = S.mayHold ? S.mayHold(o.profile, o.npcName) : true;
    for (const l of (M.listings() || [])) {
      const mine = Math.floor(Number(M.partyShares(l.key)) || 0);
      const price = Number(M.priceOf(l.key)) || 0;
      if (mine <= 0 || !(price > 0)) continue;
      const unit = Math.max(1, Math.floor(price * (1 - spread)));
      const max = mayHold ? Math.max(0, Math.min(mine, Math.floor(purseOf(o.profile) / unit))) : 0;
      rows.push({ side: 'sell', key: l.key, company: l.name || l.key, unit, have: mine, max });
    }
    return rows;
  }
  // The block sizes offered for one row: 1, 10, 100 and all of it.
  function tradeLots(row) {
    const max = Math.max(0, Math.floor(Number(row && row.max) || 0));
    const out = TRADE_LOTS.filter(n => n < max);
    if (max > 0) out.push(max);
    return out;
  }
  // opts: { profile, npcName, opinion, key, side, count }.
  function applyTrade(opts) {
    const o = opts || {};
    const S = window.NPCSim && window.NPCSim.Stocks;
    const M = window.StockSociety;
    if (!S || !M || !M.movePartyShares) return { ok: false, reason: 'noMarket' };
    if ((Number(o.opinion) || 0) < HOSTILE_DEAL) return { ok: false, reason: 'hostile' };
    const row = tradeOptions(o).find(r => r.key === o.key && r.side === o.side);
    if (!row) return { ok: false, reason: 'noMarket' };
    const count = Math.min(Math.floor(Number(o.count) || 0), row.max);
    if (count <= 0) return { ok: false, reason: o.side === 'buy' ? 'youCantAfford' : 'npcCantAfford' };
    const total = row.unit * count;
    if (o.side === 'buy') {
      if (!M.movePartyShares(o.key, count, total)) return { ok: false, reason: 'noMarket' };
      S._add(o.profile, o.npcName, o.key, -count, 0);
      partyPay(total);
      purseAdd(o.profile, total);
    } else {
      if (!M.movePartyShares(o.key, -count, total)) return { ok: false, reason: 'noMarket' };
      S._add(o.profile, o.npcName, o.key, count, total);
      partyGain(total);
      purseAdd(o.profile, -total);
    }
    logDeal(o.profile, 'tradeShares', o.side + ' ' + count + ' ' + o.key);
    const params = { count, company: row.company, total: money(total) };
    return {
      ok: true, side: o.side, key: o.key, company: row.company, count, unit: row.unit, total,
      deltaOpinion: 2, money: o.side === 'buy' ? -total : total, xp: 1,
      lines: [dealLine('player', 'money.trade.' + o.side + 'Ask', params), dealLine('npc', 'money.trade.deal', params)],
    };
  }

  // ── Lend and borrow ──────────────────────────────────────────────────────
  function isRich(profile) {
    return purseOf(profile) >= RICH_MONEY || (Number(profile && profile.wealthTierBase) || 0) >= 3;
  }
  function lendOptions() {
    const gold = partyGold();
    return LEND_AMOUNTS.map(g => ({ gold: g, owed: Math.round(g * (1 + LEND_RATE)), disabled: gold < g }));
  }
  function borrowCap(profile) { return Math.min(BORROW_CAP, Math.floor(purseOf(profile) * BORROW_SHARE)); }
  function borrowOptions(profile) {
    const cap = borrowCap(profile);
    return LEND_AMOUNTS.filter(g => g <= cap).map(g => ({ gold: g, owed: Math.round(g * (1 + BORROW_RATE)) }));
  }
  // opts: { profile, npcName, opinion, gold, actorId }.
  function applyLend(opts) {
    const o = opts || {};
    const gold = Math.floor(Number(o.gold) || 0);
    const now = dealNow();
    if (openLoan(o.profile, 'lent')) return { ok: false, reason: 'alreadyLent' };
    if ((Number(o.opinion) || 0) < HOSTILE_DEAL) return { ok: false, reason: 'hostile' };
    if (!(gold > 0) || partyGold() < gold) return { ok: false, reason: 'youCantAfford' };
    logDeal(o.profile, 'lend', 'lend ' + gold, now);
    const params = { amount: money(gold) };
    if (purseOf(o.profile) >= gold * NO_NEED_FACTOR) {
      return { ok: false, reason: 'noNeed', deltaOpinion: 0,
        lines: [dealLine('player', 'money.lend.offer', params), dealLine('npc', 'money.lend.noNeed', params)] };
    }
    const owed = Math.round(gold * (1 + LEND_RATE));
    partyPay(gold);
    purseAdd(o.profile, gold);
    (o.profile._loans = loansOf(o.profile)).push({
      dir: 'lent', principal: gold, owed, since: now, due: now + LOAN_DAYS * DEAL_DAY,
      actorId: o.actorId == null ? null : o.actorId, misses: 0,
    });
    markOpen(o.npcName);
    const p2 = { amount: money(gold), owed: money(owed), days: LOAN_DAYS };
    return { ok: true, gold, owed, deltaOpinion: 3, money: -gold, xp: 0,
      lines: [dealLine('player', 'money.lend.offer', p2), dealLine('npc', 'money.lend.accept', p2)] };
  }
  // opts: { profile, npcName, opinion, gold, actorId }.
  function applyBorrow(opts) {
    const o = opts || {};
    const gold = Math.floor(Number(o.gold) || 0);
    const now = dealNow();
    if (openLoan(o.profile, 'borrowed')) return { ok: false, reason: 'alreadyBorrowed' };
    if (!isRich(o.profile)) return { ok: false, reason: 'notRich' };
    logDeal(o.profile, 'borrow', 'borrow ' + gold, now);
    const params = { amount: money(gold) };
    if ((Number(o.opinion) || 0) < FRIEND_OPINION) {
      return { ok: false, reason: 'notFriends', deltaOpinion: 0,
        lines: [dealLine('player', 'money.borrow.ask', params), dealLine('npc', 'money.borrow.refuse', params)] };
    }
    if (!(gold > 0) || gold > borrowCap(o.profile)) return { ok: false, reason: 'npcCantAfford' };
    const owed = Math.round(gold * (1 + BORROW_RATE));
    partyGain(gold);
    purseAdd(o.profile, -gold);
    (o.profile._loans = loansOf(o.profile)).push({
      dir: 'borrowed', principal: gold, owed, since: now, due: now + LOAN_DAYS * DEAL_DAY,
      actorId: o.actorId == null ? null : o.actorId, misses: 0,
    });
    markOpen(o.npcName);
    const p2 = { amount: money(gold), owed: money(owed), days: LOAN_DAYS };
    return { ok: true, gold, owed, deltaOpinion: 0, money: gold, xp: 0,
      lines: [dealLine('player', 'money.borrow.ask', p2), dealLine('npc', 'money.borrow.agree', p2)] };
  }
  // Paying back early, from the same verb. opts: { profile, npcName }.
  function repayBorrowed(opts) {
    const o = opts || {};
    const loan = openLoan(o.profile, 'borrowed');
    if (!loan) return { ok: false, reason: 'nothingOwed' };
    if (partyGold() < loan.owed) return { ok: false, reason: 'youCantAfford', owed: loan.owed };
    partyPay(loan.owed);
    purseAdd(o.profile, loan.owed);
    o.profile._loans = loansOf(o.profile).filter(l => l !== loan);
    const params = { owed: money(loan.owed) };
    return { ok: true, repaid: loan.owed, deltaOpinion: 3, money: -loan.owed, xp: 0,
      lines: [dealLine('player', 'money.borrow.repay', params), dealLine('npc', 'money.borrow.thanks', params)] };
  }

  // ── Settling what fell due ───────────────────────────────────────────────
  // Everything past its due minute, for everybody with something open.
  // opts: { now, addOpinion(profile, actorId, delta), rand }. Answers the events,
  // { kind, name, gold, itemId }, for the toasts.
  function settleDeals(opts) {
    const o = opts || {};
    const book = dealBook();
    if (!book) return [];
    const now = o.now == null ? dealNow() : Number(o.now) || 0;
    const society = ($gameSystem && $gameSystem._npcSociety) || {};
    const addOpinion = o.addOpinion || ((p, a, d) => {
      const f = window.NPCEmpathize && window.NPCEmpathize._internal && window.NPCEmpathize._internal._addNpcOpinion;
      if (f) f(p, a, d);
    });
    const events = [];
    for (const name of Object.keys(book)) {
      const profile = society[name];
      if (!profile) { delete book[name]; continue; }
      const gone = !!profile._killed || !!(window.NPCLifeSim && window.NPCLifeSim.isDead && window.NPCLifeSim.isDead(name));
      for (const loan of loansOf(profile).slice()) {
        if (!loan || now < loan.due) continue;
        if (loan.dir === 'lent') {
          const rand = o.rand || seeded(hash(name + '|loan|' + loan.since));
          const odds = 0.35 + honestyOf(profile, name) / 100 * 0.6;
          if (!gone && rand() < odds && purseOf(profile) >= loan.owed) {
            purseAdd(profile, -loan.owed);
            partyGain(loan.owed);
            addOpinion(profile, loan.actorId, 2);
            events.push({ kind: 'repaid', name, gold: loan.owed });
          } else {
            events.push({ kind: 'defaulted', name, gold: loan.owed });
          }
          profile._loans = loansOf(profile).filter(l => l !== loan);
        } else if (loan.dir === 'borrowed') {
          let closed = false;
          while (!closed && now >= loan.due) {
            if (gone) { closed = true; events.push({ kind: 'forgiven', name, gold: loan.owed }); break; }
            if (partyGold() >= loan.owed) {
              partyPay(loan.owed);
              purseAdd(profile, loan.owed);
              addOpinion(profile, loan.actorId, 2);
              events.push({ kind: 'paidBack', name, gold: loan.owed });
              closed = true;
            } else {
              loan.misses = (Number(loan.misses) || 0) + 1;
              addOpinion(profile, loan.actorId, MISS_OPINION);
              loan.due += DEAL_DAY;
              if (loan.misses >= LOAN_MISS_LIMIT) {
                addOpinion(profile, loan.actorId, WRITE_OFF_OPINION);
                events.push({ kind: 'writtenOff', name, gold: loan.owed });
                closed = true;
              } else {
                events.push({ kind: 'missed', name, gold: loan.owed });
              }
            }
          }
          if (closed) profile._loans = loansOf(profile).filter(l => l !== loan);
        }
      }
      if (profile._loans && !profile._loans.length) delete profile._loans;
      const lent = profile._lentVehicle;
      if (lent && now >= lent.due) {
        const item = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[lent.itemId] : null;
        let held = 0;
        try { held = item && $gameParty ? $gameParty.numItems(item) : 0; } catch (e) { held = 0; }
        if (held > 0) {
          try { $gameParty.loseItem(item, 1); } catch (e) { /* no party */ }
          profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
          if (!gone) profile.itemIds.push(lent.itemId);
          addOpinion(profile, lent.actorId, 1);
          events.push({ kind: 'vehicleBack', name, itemId: lent.itemId });
        } else {
          // Kept, sold or lost: the owner reports it stolen.
          const CS = window.CrimeSystem;
          try { if (CS && CS.addPresetCrime) CS.addPresetCrime('vehicleTheft'); } catch (e) { /* no crime system */ } // i18n-ignore: CrimeSystem preset id
          addOpinion(profile, lent.actorId, THEFT_OPINION);
          events.push({ kind: 'vehicleKept', name, itemId: lent.itemId });
        }
        delete profile._lentVehicle;
      }
      if (!loansOf(profile).length && !profile._lentVehicle) delete book[name];
    }
    return events;
  }

  // ── Ask for work ─────────────────────────────────────────────────────────
  function openSlotsAt(groupName, mapId) {
    const JSM = window.NPCSim && window.NPCSim.JobShiftManager;
    if (!JSM || !JSM._openSlotsOf || !groupName) return [];
    try { return JSM._openSlotsOf(groupName).filter(s => mapId == null || s.mapId === Number(mapId)); }
    catch (e) { return []; }
  }
  function shiftBusy(actor) {
    const Sh = window.WorkSystem && window.WorkSystem.Shifts;
    try { return !!(Sh && actor && Sh.isBusy && Sh.isBusy(actor.actorId())); } catch (e) { return false; }
  }
  // The rows of the Ask for work sheet: a shift where they work, and a
  // contract they posted on the board here or know about.
  // opts: { profile, npcName, actor, opinion, rand }.
  function workOffers(opts) {
    const o = opts || {};
    const out = [];
    const job = jobOf(o.profile && o.profile.currentJobId);
    const a = assignmentOf(o.npcName);
    if (job && a) {
      const open = openSlotsAt(o.profile._homeGroupName, a.mapId);
      if (open.length) {
        const WS = window.WorkSystem;
        let meets = true;
        try { const r = WS.meetsRequirements ? WS.meetsRequirements(o.actor, job) : null; meets = !r || r.meets !== false; }
        catch (e) { meets = true; }
        const busy = shiftBusy(o.actor);
        out.push({ kind: 'shift', job, jobId: job.id, place: a.mapName || '', hours: Number(job.duration || job.hours) || 0,
          pay: Number(job.basePay) || 0, disabled: !meets || busy, reason: !meets ? 'requirements' : busy ? 'busy' : null });
      }
    }
    const PQ = window.ProceduralQuests;
    if (PQ && PQ.offersForBoard && PQ.currentBoardKey) {
      let offers = [];
      try { offers = PQ.offersForBoard(PQ.currentBoardKey()) || []; } catch (e) { offers = []; }
      const own = offers.filter(q => q && q.giverNpc && q.giverNpc.name === o.npcName);
      if (own.length) {
        for (const q of own) out.push({ kind: 'quest', offer: q, own: true });
      } else if ((Number(o.opinion) || 0) >= 20) {
        const fair = offers.filter(q => q && !q.scam && !(q.payGold > 0) && (Number(q.diff) || 1) <= 3);
        if (fair.length) {
          const pick = fair[hash(o.npcName + '|work|' + Math.floor(dealNow() / DEAL_DAY)) % fair.length];
          out.push({ kind: 'quest', offer: pick, own: false });
        }
      }
    }
    return out;
  }
  // A shift at their workplace: the member goes off to work it (WorkSystem
  // Shifts) or, the last one standing, works it now.
  // opts: { profile, npcName, actor, row }.
  function applyShift(opts) {
    const o = opts || {};
    const row = o.row || {};
    const WS = window.WorkSystem;
    if (!WS || !row.job || !o.actor) return { ok: false, reason: 'noWork' };
    if (row.disabled) return { ok: false, reason: row.reason || 'noWork' };
    logDeal(o.profile, 'askWork', 'shift ' + row.jobId);
    const params = { job: jobLabel(row.job), place: row.place, hours: row.hours };
    const lines = [dealLine('player', 'work.ask.shiftAsk', params), dealLine('npc', 'work.ask.shiftVouch', params)];
    if (WS.Shifts && WS.Shifts.dispatch && WS.Shifts.dispatch(o.actor, row.job, false)) {
      return { ok: true, dispatched: true, hours: row.hours, deltaOpinion: 2, money: 0, xp: 0, lines, params };
    }
    const WM = WS.WorkManager;
    if (!WM || !WM.executeWork || !WM.applyWorkEffects) return { ok: false, reason: 'noWork' };
    const result = WM.executeWork(o.actor, row.job, {});
    WM.applyWorkEffects(o.actor, row.job, result, {});
    return { ok: true, dispatched: false, hours: row.hours, deltaOpinion: 2, money: Number(result && result.pay) || 0,
      xp: 2, lines, params, result };
  }
  // A contract off the board. opts: { profile, npcName, row }.
  function applyQuest(opts) {
    const o = opts || {};
    const PQ = window.ProceduralQuests;
    const q = o.row && o.row.offer;
    if (!PQ || !PQ.acceptOffer || !q) return { ok: false, reason: 'noWork' };
    logDeal(o.profile, 'askWork', 'quest ' + q.qid);
    let res;
    try { res = PQ.acceptOffer(q) || {}; } catch (e) { res = { ok: false }; }
    if (!res.ok && res.ok !== undefined) return { ok: false, reason: 'questTaken', detail: res.reason || '' };
    const params = { title: q.title || '' };
    return { ok: true, deltaOpinion: 2, money: 0, xp: 0, offer: q,
      lines: [dealLine('player', 'work.ask.questAsk', params),
        dealLine('npc', o.row.own ? 'work.ask.questOwn' : 'work.ask.questPass', params)] };
  }

  // ── Hire and fire ────────────────────────────────────────────────────────
  function workplaceOwned(mapId) {
    const WD = window.WorkplaceDeeds;
    try { return !!(WD && WD.owns && WD.owns(mapId)); } catch (e) { return false; }
  }
  function ownedWorkplacesIn(profile) {
    const WD = window.WorkplaceDeeds;
    const group = profile && profile._homeGroupName;
    if (!WD || !WD.list || !group) return [];
    let list = [];
    try { list = WD.list() || []; } catch (e) { list = []; }
    return list.filter(d => d && d.group === group);
  }
  // Every open post at a workplace the party owns in their town.
  function hireOptions(opts) {
    const o = opts || {};
    const rows = [];
    const seen = new Set();
    for (const deed of ownedWorkplacesIn(o.profile)) {
      for (const s of openSlotsAt(o.profile._homeGroupName, deed.mapId)) {
        const key = s.jobId + '|' + s.mapId + '|' + s.shift;
        if (seen.has(key)) continue;
        seen.add(key);
        const job = jobOf(s.jobId);
        if (!job) continue;
        rows.push({ mapId: s.mapId, jobId: s.jobId, shift: s.shift, job, jobName: jobLabel(job),
          place: deed.name || '', wage: Number(job.basePay) || 0 });
      }
    }
    return rows;
  }
  // Out of work, anybody takes a post; somebody with a job takes one that
  // pays better or a friend's.
  function hireChance(profile, name, row, opinion) {
    const a = assignmentOf(name);
    const op = Number(opinion) || 0;
    if (!a) return clamp(0.6 + op / 200, 0.05, 0.95);
    const cur = Number((jobOf(a.jobId) || {}).basePay) || 0;
    if (row.wage >= cur * 1.1) return clamp(0.4 + op / 200, 0.05, 0.95);
    return op >= FRIEND_OPINION ? 0.35 : 0.1;
  }
  // opts: { profile, npcName, opinion, row, rand }.
  function applyHire(opts) {
    const o = opts || {};
    const JSM = window.NPCSim && window.NPCSim.JobShiftManager;
    const row = o.row;
    if (!JSM || !row || !workplaceOwned(row.mapId)) return { ok: false, reason: 'noVacancy' };
    const params = { job: row.jobName, place: row.place, wage: money(row.wage) };
    const chance = hireChance(o.profile, o.npcName, row, o.opinion);
    logDeal(o.profile, 'hire', 'offer ' + row.jobId);
    if (roll(o.rand) >= chance) {
      return { ok: false, reason: 'declined', deltaOpinion: 0, chance,
        lines: [dealLine('player', 'work.hire.offer', params), dealLine('npc', 'work.hire.decline', params)] };
    }
    const before = assignmentOf(o.npcName);
    try { JSM.releaseSlot(o.npcName); } catch (e) { /* nothing held */ }
    const slot = JSM.claimVacancy(o.npcName, o.profile._homeGroupName, { mapId: row.mapId, jobId: row.jobId, shift: row.shift });
    if (!slot) {
      // The post went in the meantime: they keep what they had.
      if (before && $gameSystem._npcJobAssignments) $gameSystem._npcJobAssignments[o.npcName] = before;
      return { ok: false, reason: 'noVacancy' };
    }
    return { ok: true, slot, chance, deltaOpinion: HIRE_OPINION, money: 0, xp: 0,
      lines: [dealLine('player', 'work.hire.offer', params), dealLine('npc', 'work.hire.accept', params)] };
  }
  // opts: { profile, npcName }.
  function applyFire(opts) {
    const o = opts || {};
    const JSM = window.NPCSim && window.NPCSim.JobShiftManager;
    const a = assignmentOf(o.npcName);
    if (!JSM || !a || !workplaceOwned(a.mapId)) return { ok: false, reason: 'notYours' };
    const job = jobOf(a.jobId);
    JSM.releaseSlot(o.npcName);
    // Out of work: a settlement deals shifts only to people nobody has told.
    o.profile.currentJobId = 0;
    logDeal(o.profile, 'fire', 'fired ' + a.jobId);
    const params = { job: jobLabel(job), place: a.mapName || '' };
    return { ok: true, deltaOpinion: FIRE_OPINION, money: 0, xp: 0,
      lines: [dealLine('player', 'work.fire.say', params), dealLine('npc', 'work.fire.reply', params)] };
  }

  // ── Work together ────────────────────────────────────────────────────────
  // opts: { profile, npcName, actor, opinion, passTime }.
  function applyWorkTogether(opts) {
    const o = opts || {};
    const WS = window.WorkSystem;
    const WM = WS && WS.WorkManager;
    const job = jobOf(o.profile && o.profile.currentJobId);
    if (!job || !WM || !WM.executeWork || !o.actor) return { ok: false, reason: 'noWork' };
    if ((Number(o.opinion) || 0) < WORK_OPINION) return { ok: false, reason: 'hostile' };
    const duration = Math.max(1, Number(job.duration || job.hours) || 8);
    const hours = Math.min(WORK_TOGETHER_HOURS, duration);
    const result = WM.executeWork(o.actor, job, {}) || { pay: 0, statuses: [] };
    result.pay = Math.round((Number(result.pay) || 0) * hours / duration);
    if (!Array.isArray(result.statuses)) result.statuses = [];
    const part = Object.assign({}, job, { duration: hours, hours });
    if (WM.applyWorkEffects) WM.applyWorkEffects(o.actor, part, result, { timeAlreadyPassed: true });
    passHours(hours, o);
    const cut = Math.max(0, Math.round(result.pay * WORK_TOGETHER_SHARE));
    purseAdd(o.profile, cut);
    logDeal(o.profile, 'workTogether', 'worked ' + hours + 'h');
    const params = { job: jobLabel(job), hours, pay: money(result.pay) };
    return { ok: true, hours, pay: result.pay, cut, deltaOpinion: 4, money: result.pay, xp: 2,
      lines: [dealLine('player', 'work.together.ask', params), dealLine('npc', 'work.together.done', params)] };
  }

  // ── Ask for a ride ───────────────────────────────────────────────────────
  // Their price for a stop: nothing for a good friend, else a share of the
  // taxi fare that shrinks as they like the member more.
  function rideFare(cost, opinion) {
    const op = Number(opinion) || 0;
    if (op >= FREE_RIDE_OPINION) return 0;
    return Math.max(0, Math.round((Number(cost) || 0) * clamp(0.6 - op / 200, 0.2, 0.7)));
  }
  // The stops they would drive to: where they are heading first, then the
  // cheapest others on the network. opts: { profile, npcName, opinion }.
  function rideStops(opts) {
    const o = opts || {};
    const FTS = window.FastTravelSystem;
    if (!FTS || !FTS.destinations || !FTS.quote) return [];
    let heading = null;
    try {
      const rec = window.NPCLifeSim && window.NPCLifeSim.getRecord && window.NPCLifeSim.getRecord(o.npcName);
      heading = (rec && rec.trip && (rec.trip.to || rec.trip.destination)) || null;
    } catch (e) { heading = null; }
    const rows = [];
    for (const d of (FTS.destinations() || [])) {
      if (!d || !d.name) continue;
      const cost = Number(FTS.quote(d.name, RIDE_MODE));
      if (!(cost > 0)) continue;
      rows.push({ name: d.name, label: FTS.placeLabel ? FTS.placeLabel(d.name) : d.name, cost,
        fare: rideFare(cost, o.opinion), heading: d.name === heading });
    }
    rows.sort((a, b) => (b.heading - a.heading) || (a.cost - b.cost));
    return rows.slice(0, RIDE_STOPS);
  }
  // opts: { profile, npcName, opinion, stop }. On success the journey is
  // handed to the map as { dest, mode, driver } (the scene sets it out).
  function applyRide(opts) {
    const o = opts || {};
    const V = window.NPCSim && window.NPCSim.Vehicles;
    const stop = o.stop;
    if (!V || !V.hasCar || !V.hasCar(o.profile, o.npcName)) return { ok: false, reason: 'noCar' };
    if (!stop) return { ok: false, reason: 'noStop' };
    logDeal(o.profile, 'askRide', 'ride ' + stop.name);
    const params = { place: stop.label || stop.name, fare: money(stop.fare) };
    if ((Number(o.opinion) || 0) < 0) {
      return { ok: false, reason: 'cold', deltaOpinion: 0,
        lines: [dealLine('player', 'work.ride.ask', params), dealLine('npc', 'work.ride.refuse', params)] };
    }
    if (partyGold() < stop.fare) return { ok: false, reason: 'youCantAfford' };
    partyPay(stop.fare);
    purseAdd(o.profile, stop.fare);
    return { ok: true, fare: stop.fare, journey: { dest: stop.name, mode: RIDE_MODE, driver: o.npcName },
      deltaOpinion: 2, money: -stop.fare, xp: 0,
      lines: [dealLine('player', 'work.ride.ask', params),
        dealLine('npc', stop.fare > 0 ? 'work.ride.agree' : 'work.ride.agreeFree', params)] };
  }

  // ── Borrow a vehicle ─────────────────────────────────────────────────────
  // The bike or broom they would lend: the one they ride, else any they carry.
  function vehicleToLend(profile, name) {
    const V = window.NPCSim && window.NPCSim.Vehicles;
    if (!V || !V.carried) return null;
    const has = V.carried(profile, true);
    const ride = V.rideOf ? V.rideOf(profile, name) : null;
    const kind = (ride === 'bike' || ride === 'broom') && has[ride] != null ? ride // i18n-ignore: vehicle kind ids
      : has.bike != null ? 'bike' : has.broom != null ? 'broom' : null; // i18n-ignore: vehicle kind ids
    return kind ? { kind, itemId: has[kind] } : null;
  }
  // opts: { profile, npcName, opinion, actorId }.
  function applyBorrowVehicle(opts) {
    const o = opts || {};
    const v = vehicleToLend(o.profile, o.npcName);
    if (!v) return { ok: false, reason: 'noVehicle' };
    if (o.profile._lentVehicle) return { ok: false, reason: 'alreadyLent' };
    const item = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[v.itemId] : null;
    const params = { vehicle: (item && item.name) || v.kind, days: 1 };
    if ((Number(o.opinion) || 0) < FRIEND_OPINION) {
      return { ok: false, reason: 'notFriends', deltaOpinion: 0,
        lines: [dealLine('player', 'work.vehicle.ask', params), dealLine('npc', 'work.vehicle.refuse', params)] };
    }
    const ids = o.profile.itemIds;
    const at = Array.isArray(ids) ? ids.findIndex(id => Number(id) === v.itemId) : -1;
    if (at < 0) return { ok: false, reason: 'noVehicle' };
    ids.splice(at, 1);
    try { if (item) $gameParty.gainItem(item, 1); } catch (e) { /* no party */ }
    const now = dealNow();
    o.profile._lentVehicle = { itemId: v.itemId, since: now, due: now + DEAL_DAY,
      actorId: o.actorId == null ? null : o.actorId };
    markOpen(o.npcName);
    logDeal(o.profile, 'borrowVehicle', 'lent ' + v.itemId, now);
    return { ok: true, itemId: v.itemId, kind: v.kind, deltaOpinion: 0, money: 0, xp: 0,
      lines: [dealLine('player', 'work.vehicle.ask', params), dealLine('npc', 'work.vehicle.agree', params)] };
  }

  // ── Invite to move ───────────────────────────────────────────────────────
  // The towns the party knows: every map group it has set foot in, less their
  // own.
  function knownTowns(profile) {
    const visited = ($gameSystem && Array.isArray($gameSystem._visitedMaps)) ? $gameSystem._visitedMaps : [];
    const NS = window.NPCSystem;
    if (!NS || !NS.findMapGroupByMap) return [];
    const home = profile && profile._homeGroupName;
    const seen = new Set();
    for (const id of visited) {
      let g = null;
      try { g = NS.findMapGroupByMap(id); } catch (e) { g = null; }
      if (g && g !== home) seen.add(g);
    }
    return Array.from(seen).sort();
  }
  function prosperityOf(group) {
    try {
      const p = window.NPCWorldWeb && window.NPCWorldWeb.getPulse && window.NPCWorldWeb.getPulse(group);
      return p && Number.isFinite(Number(p.prosperity)) ? Number(p.prosperity) : 50;
    } catch (e) { return 50; }
  }
  function moveChance(profile, name, toGroup, opinion) {
    let c = 0.1 + (Number(opinion) || 0) / 150;
    if (!assignmentOf(name) || Number(profile && profile.currentJobId) === 0) c += 0.15;
    c += (prosperityOf(toGroup) - prosperityOf(profile && profile._homeGroupName)) / 200;
    return clamp(c, 0.02, 0.9);
  }
  // opts: { profile, npcName, opinion, toGroup, rand }.
  function applyInviteMove(opts) {
    const o = opts || {};
    const L = window.NPCLifeSim;
    if (!L || !L.relocate || !L.mayRelocate || !L.mayRelocate(o.npcName)) return { ok: false, reason: 'rooted' };
    const params = { place: o.toGroup };
    logDeal(o.profile, 'inviteMove', 'move ' + o.toGroup);
    const chance = moveChance(o.profile, o.npcName, o.toGroup, o.opinion);
    if (roll(o.rand) >= chance) {
      return { ok: false, reason: 'declined', chance, deltaOpinion: (Number(o.opinion) || 0) < 0 ? -2 : 0,
        lines: [dealLine('player', 'work.move.ask', params), dealLine('npc', 'work.move.decline', params)] };
    }
    let moved = null;
    try { moved = L.relocate(o.npcName, { toGroup: o.toGroup, reason: MOVE_REASON, force: true }); } catch (e) { moved = null; }
    if (!moved) return { ok: false, reason: 'rooted' };
    const movers = (moved.movers || []).length;
    return { ok: true, chance, moved, movers, deltaOpinion: 3, money: 0, xp: 0,
      lines: [dealLine('player', 'work.move.ask', params),
        dealLine('npc', movers > 1 ? 'work.move.agreeFamily' : 'work.move.agree', params)] };
  }

  // ── Invite to an expedition ──────────────────────────────────────────────
  // Tower floors around their level, and the dungeons.
  function expeditionOptions(profile) {
    const level = Math.max(1, Number(profile && profile.level) || 1);
    let floors = [];
    try { floors = (window.DungeonFloors && window.DungeonFloors.floorsForLevel && window.DungeonFloors.floorsForLevel(level, 6)) || []; }
    catch (e) { floors = []; }
    if (!floors.length) {
      for (let f = Math.max(2, level - 3); f <= Math.min(99, level + 3); f++) floors.push(f);
    }
    const pick = [];
    const step = Math.max(1, Math.floor(floors.length / EXPEDITION_FLOORS));
    for (let i = 0; i < floors.length && pick.length < EXPEDITION_FLOORS; i += step) pick.push(floors[i]);
    return pick.map(f => ({ kind: 'tower', floor: f })).concat([{ kind: 'dungeon', floor: null }]); // i18n-ignore: band kind ids
  }
  function isFighter(name, profile) {
    const SK = window.NPCSkirmish;
    try { if (SK && SK.who && SK.isFighter) return !!SK.isFighter(SK.who(name, profile, null)); } catch (e) { /* fall through */ }
    return !!(profile && (profile._officer || profile._brave));
  }
  function expeditionChance(profile, name, opinion) {
    return clamp(0.25 + (Number(opinion) || 0) / 150 + (isFighter(name, profile) ? 0.2 : 0), 0.05, 0.9);
  }
  // opts: { profile, npcName, opinion, row, rand }.
  function applyInviteExpedition(opts) {
    const o = opts || {};
    const B = window.NPCLifeSim && window.NPCLifeSim.Bands;
    const row = o.row || { kind: 'tower', floor: null }; // i18n-ignore: band kind id
    if (!B || !B.enlist || !B.mayJoin || !B.mayJoin(o.npcName)) return { ok: false, reason: 'cannotGo' };
    const params = { floor: row.floor == null ? '' : row.floor };
    const ask = row.kind === 'tower' ? 'work.expedition.askTower' : 'work.expedition.askDungeon'; // i18n-ignore: band kind id
    logDeal(o.profile, 'inviteExpedition', 'expedition ' + row.kind);
    const chance = expeditionChance(o.profile, o.npcName, o.opinion);
    if (roll(o.rand) >= chance) {
      return { ok: false, reason: 'declined', chance, deltaOpinion: 0,
        lines: [dealLine('player', ask, params), dealLine('npc', 'work.expedition.decline', params)] };
    }
    let res = null;
    try { res = B.enlist(o.npcName, row.kind, { floor: row.floor }); } catch (e) { res = null; }
    if (!res) return { ok: false, reason: 'cannotGo' };
    return { ok: true, chance, band: res.band, joined: res.joined, deltaOpinion: 2, money: 0, xp: 0,
      lines: [dealLine('player', ask, params),
        dealLine('npc', res.joined ? 'work.expedition.joined' : 'work.expedition.formed', params)] };
  }

  const Deals = {
    DEAL_IDS, DEAL_CAT, DEAL_COOLDOWN, LEND_AMOUNTS, LEND_RATE, BORROW_RATE, LOAN_DAYS, RIDE_MODE,
    money, dealText, dealVoiceText, dealGate, dealRecent, logDeal, dealsPerson, honestyOf,
    stockTip, tradeSpread, tradeOptions, tradeLots, applyTrade,
    lendOptions, borrowOptions, applyLend, applyBorrow, repayBorrowed, openLoan, settleDeals,
    workOffers, applyShift, applyQuest, hireOptions, hireChance, applyHire, applyFire, applyWorkTogether,
    rideFare, rideStops, applyRide, vehicleToLend, applyBorrowVehicle,
    knownTowns, moveChance, applyInviteMove, expeditionOptions, expeditionChance, applyInviteExpedition,
  };
  if (window.NPCEmpathize) window.NPCEmpathize.Deals = Deals;
})();
// <<< EMPATHIZE LESSONS <<<

// >>> EMPATHIZE CIVICS (Beliefs and Politics actions) >>>
// ============================================================================
// SECTION 11, BELIEFS AND POLITICS (NPCEmpathize.Civics)
// ============================================================================
// The reckoning behind the Beliefs and Politics categories of the Empathize
// action board, kept apart from the scene so it can be read and tested on its
// own. The scene half (NPCEmpathizeUI_Lessons.js, CIVICS) speaks the lines,
// opens the pick sheets and applies the standing through the helpers every
// other action uses.
//
//   Preach        a strong push toward the speaking member's creed, through
//                 NPCLifeSim.playerPush with a multiplier (charisma, opinion
//                 and how near the two creeds stand). A creed far from theirs,
//                 or a sermon repeated within two days, costs standing; an
//                 engaged partisan then digs in: their own creed firms up and
//                 the preacher comes away doubting (actor._conversion).
//   Debate        Public Speaking (and Theology or Political Science, by the
//                 creed) against the NPC's. A win is a hard push and spec XP,
//                 a loss moves the member's own conversion record.
//   Ask views     creed family, conversion under way, party and last vote.
//   Pray together only when both creeds are theocratic or mystic.
//   Ask vote      party and last vote; the shy may keep it to themselves.
//   Join theirs / Invite to yours
//                 odds from the speaker's PSI (the LUK param) and how near the
//                 joiner's views stand to the party's platform, opinion a
//                 smaller bonus; a refusal costs a little standing.
//   Campaign      pulls their views toward a platform on their ballot (or the
//                 party's own), and maybe their party with it.
//   Endorse       within 30 days of an election they vote in: raises a local
//                 candidate's standing (charisma, engagement) or leans the
//                 voter toward the team's own candidate.
//   Petition      an office holder grants a favour: a charge pardoned
//                 (CrimeSystem) or the tax rate cut (NPCPolitics policies),
//                 at a price, and it can be refused.
// Em and Bubba speak their own lines and are never framed by a creed; the
// party's lines otherwise wear the speaker's creed voice (CreedVoice).
(() => {
  'use strict';

  const ROOT = 'Empathize.act';
  const AXES = ['econ', 'auth', 'trad', 'mil', 'myst'];
  const PRAY_FAMILIES = ['theocratic', 'mystic']; // i18n-ignore: CreedVoice family ids
  const SHY = ['Nervous', 'Timid', 'Paranoid', 'Cautious']; // i18n-ignore: PersonalityData names
  const SPEAKING = 'Public Speaking'; // i18n-ignore: Specializations lookup key
  const THEOLOGY = 'Theology'; // i18n-ignore: Specializations lookup key
  const POLITICS = 'Political Science'; // i18n-ignore: Specializations lookup key

  const PREACH_BASE = 3;             // times a chat push (1-3 points)
  const PREACH_FAR = 70;             // creed distance past which a sermon offends
  const PREACH_REPEAT_DAYS = 2;
  const PARTISAN_ENGAGEMENT = 60;
  const PREACH_OFFEND = [1, 3];
  const PREACH_BACKFIRE = [3, 6];
  const BACKFIRE_DOUBT = [3, 6];     // pct the preacher leans the other way
  const DEBATE_WIN_MULT = 4;
  const DEBATE_LOSS_PUSH = [5, 10];
  const DEBATE_XP = 2;
  const PRAY_OPINION = [3, 6];
  const PRAY_PUSH = 0.5;
  const PRAY_FUN = 4;
  const VOTE_OPEN_OPINION = 40;
  const SHY_REFUSE = 0.6;
  const JOIN_BASE = 25;
  const JOIN_DIST_POINT = 50;        // distance at which only PSI and opinion count
  const JOIN_REFUSED = [1, 3];
  const CAMPAIGN_SHARE = [0.15, 0.35];
  const APATHETIC = 20;
  const ENDORSE_WINDOW_DAYS = 30;
  const ENDORSE_CHARISMA = [3, 6];
  const ENDORSE_PULL = 0.2;
  const TEAM_ENDORSE_PULL = 0.25;
  const PETITION_PARDON_SHARE = 0.5;
  const PETITION_PARDON_MIN = 2000;  // 20.00 euros
  const PETITION_TAX_PRICE = 500000; // 5.000,00 euros for a point off a nation's tax
  const PETITION_REFUSED = 2;
  const MIN_TAX = 2;
  const PARDON_OFFICES = ['mayor', 'guardCaptain']; // i18n-ignore: NPCPolitics office ids
  const MINUTES_PER_DAY = 1440;

  // ── Text ─────────────────────────────────────────────────────────────────
  const Tr = (key, params) => (window.T ? window.T(`${ROOT}.${key}`, params) : key);
  function tree(key) {
    try { return window.T && window.T.obj ? window.T.obj(`${ROOT}.${key}`) : null; } catch (e) { return null; }
  }
  function alt(text, rand) {
    let out = String(text == null ? '' : text);
    for (let guard = 0; guard < 64 && out.indexOf('{') >= 0; guard++) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const parts = body.split('|');
        return parts[Math.floor((rand || Math.random)() * parts.length)];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  }
  function fill(text, params) {
    return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (whole, name) =>
      (params && Object.prototype.hasOwnProperty.call(params, name)) ? String(params[name]) : whole);
  }
  // A line out of a variant pool (default / em / bubba for the speaker,
  // default / toEm / toBubba for the answer), the default pool standing in.
  function line(key, variant, params, rand) {
    const root = tree(`${key}`);
    if (!root || typeof root !== 'object') return '';
    const pool = (Array.isArray(root[variant]) && root[variant].length) ? root[variant]
      : Array.isArray(root.default) ? root.default : [];
    if (!pool.length) return '';
    const r = rand || Math.random;
    return alt(fill(pool[Math.floor(r() * pool.length)], params), r);
  }
  function money(gold) {
    if (window.NPCShared && window.NPCShared.formatMoney) return window.NPCShared.formatMoney(gold);
    return `${(Math.floor(Number(gold) || 0) / 100).toFixed(2)}€`;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rollInt = (rand, lo, hi) => lo + Math.floor((rand || Math.random)() * (hi - lo + 1));
  const nowMinute = () => { try { return $gameVariables ? ($gameVariables.value(114) || 0) : 0; } catch (e) { return 0; } };
  const nameOf = (actor) => (actor && typeof actor.name === 'function') ? actor.name() : String((actor && actor.name) || '');

  // ── Creeds ───────────────────────────────────────────────────────────────
  const S = () => window.NPCShared || null;
  const profileOf = (name) => {
    try { return (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile(name)) || null; } catch (e) { return null; }
  };
  function creedById(id) {
    try { return (id && S() && S().ideologyById) ? S().ideologyById(id) : null; } catch (e) { return null; }
  }
  // The creed a party member speaks for: the one on the actor, else their
  // society profile's.
  function actorCreedId(actor) {
    if (!actor) return null;
    if (actor._ideologyId) return actor._ideologyId;
    const p = profileOf(nameOf(actor));
    try { return (p && (p.ideologyId || (S() && S().ideologyFor && (S().ideologyFor(p) || {}).id))) || null; } catch (e) { return null; }
  }
  function npcCreedId(profile) {
    if (!profile) return null;
    try { return profile.ideologyId || (S() && S().ideologyFor && (S().ideologyFor(profile) || {}).id) || null; } catch (e) { return null; }
  }
  function creedDistance(a, b) {
    const sh = S();
    if (sh && sh.ideologyDistance) {
      try { return sh.ideologyDistance(a, b); } catch (e) { /* fall through */ }
    }
    return 100;
  }
  function axesOf(source) {
    const sh = S();
    try { if (sh && sh.ideologyAxes) return sh.ideologyAxes(source); } catch (e) { /* fall through */ }
    return { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 };
  }
  function familyOf(creedId) {
    const CV = window.NPCConversation && window.NPCConversation.CreedVoice;
    try { return (CV && CV.ideologyFamily) ? CV.ideologyFamily(creedId) : null; } catch (e) { return null; }
  }
  function creedLabel(id) {
    const LS = window.NPCLifeSim;
    try { if (LS && LS.creedLabel) return LS.creedLabel(id); } catch (e) { /* fall through */ }
    return String(id || '');
  }
  function familyLabel(fam) {
    if (!fam) return '';
    const key = `beliefs.family.${fam}`;
    const t = Tr(key);
    return (t && t !== key) ? t : fam;
  }
  function pinned(profile) {
    try { return !!(S() && S().creedPinned && S().creedPinned(profile)); } catch (e) { return false; }
  }

  // ── Politics lookups ─────────────────────────────────────────────────────
  const P = () => window.NPCPolitics || null;
  function identityOf(name) {
    try { return (P() && P().getIdentity) ? P().getIdentity(name) : null; } catch (e) { return null; }
  }
  function partyOf(identity, partyId) {
    const id = partyId === undefined ? identity && identity.partyId : partyId;
    if (!identity || !id || !P()) return null;
    try { return (P().getPartyOf && P().getPartyOf(identity.power, id)) || (P().findParty && (P().findParty(id) || {}).party) || null; }
    catch (e) { return null; }
  }
  function playerParty() {
    try { return (P() && P().playerParty) ? P().playerParty() : null; } catch (e) { return null; }
  }
  function politicsOn() {
    const WM = (window.NPCShared && window.NPCShared.WorldModes) || window.WorldModes;
    try { return !WM || typeof WM.hasPolitics !== 'function' || WM.hasPolitics() !== false; } catch (e) { return true; }
  }

  // ── Specializations ──────────────────────────────────────────────────────
  function specByName(name) {
    const Sp = window.Specializations;
    try { return (Sp && Sp.byName && Sp.byName.get(name)) || null; } catch (e) { return null; }
  }
  function actorSpecTier(actor, name) {
    const spec = specByName(name);
    if (!spec || !actor) return 1;
    try { return Number(actor.specializationLevel ? actor.specializationLevel(spec.id) : 1) || 1; } catch (e) { return 1; }
  }
  function npcSpecTier(profile, npcName, name) {
    const spec = specByName(name);
    if (!spec || !profile) return 1;
    const L = window.NPCEmpathizeLessons;
    try {
      if (L && L.npcSpecLevels) return Number(L.npcSpecLevels(profile, npcName).get(spec.id)) || 1;
    } catch (e) { /* read what is stored */ }
    return Number((profile.specLevels || {})[spec.id]) || 1;
  }
  // The specialization that argues a creed: Theology for the faiths, Political
  // Science for the rest, Public Speaking under both.
  function debateSpecsFor(creedId) {
    return PRAY_FAMILIES.includes(familyOf(creedId)) ? [SPEAKING, THEOLOGY] : [SPEAKING, POLITICS];
  }
  function debateTierOfActor(actor, creedId) {
    const [a, b] = debateSpecsFor(creedId);
    return Math.max(actorSpecTier(actor, a), actorSpecTier(actor, b));
  }
  function debateTierOfNpc(profile, npcName, creedId) {
    const [a, b] = debateSpecsFor(creedId);
    return Math.max(npcSpecTier(profile, npcName, a), npcSpecTier(profile, npcName, b));
  }

  // PSI, the LUK param (STR/CON/INT/WIS/DEX/PSI), as the D&D modifier every
  // other check in the game reads a stat through.
  function psiOf(actor) {
    const v = Number(actor && (typeof actor.luk === 'function' ? actor.luk() : actor.luk));
    return Number.isFinite(v) ? v : 10;
  }
  const psiMod = (psi) => Math.floor(((Number(psi) || 10) - 10) / 2);
  function charmOf(actor) {
    return 0.75 + clamp(psiOf(actor), 0, 100) / 200;
  }

  // ── The member's own conversion record ───────────────────────────────────
  // A party member talked round (a debate lost, a partisan's retort) keeps the
  // same record an NPC does, on the actor: { toId, pct, by }. Pushing toward
  // another creed wears the old one down first; at 100 they convert, and the
  // actor's creed, their society profile and their party standing follow.
  function pushActorConversion(actor, toCreedId, amount, by) {
    if (!actor || !toCreedId || !(amount > 0)) return null;
    const own = actorCreedId(actor);
    if (!own || own === toCreedId) return null;
    const to = creedById(toCreedId);
    const from = creedById(own);
    if (!to || (from && !!from.alien !== !!to.alien)) return null;
    let conv = actor._conversion;
    if (conv && conv.toId !== toCreedId) {
      conv.pct = Math.round((conv.pct - amount) * 100) / 100;
      if (conv.pct > 0) return { conv, converted: false };
      amount = -conv.pct;
      conv = null;
      delete actor._conversion;
      if (!(amount > 0)) return null;
    }
    if (!conv) conv = actor._conversion = { toId: toCreedId, pct: 0, by: by || null };
    conv.pct = Math.min(100, Math.round((conv.pct + amount) * 100) / 100);
    if (by) conv.by = by;
    if (conv.pct < 100) return { conv, converted: false };
    delete actor._conversion;
    actor._ideologyId = toCreedId;
    const p = profileOf(nameOf(actor));
    if (p) {
      try { if (S() && S().setCreed) S().setCreed(p, to); else p.ideologyId = toCreedId; } catch (e) { p.ideologyId = toCreedId; }
    }
    return { conv: null, converted: true, creedId: toCreedId };
  }
  function actorConversionOf(actor) {
    const conv = actor && actor._conversion;
    if (!conv || !(conv.pct > 0)) return null;
    return { creedId: conv.toId, creed: creedLabel(conv.toId), pct: Math.floor(conv.pct), by: conv.by || null };
  }
  // How far the member stands from the party they declared (NPCPolitics
  // PARTY DRIFT): { party, distance, drifting } or null.
  function actorPartyWarning(actor) {
    if (!actor || !P() || !P().actorPartyStanding) return null;
    const creed = actorCreedId(actor);
    const axes = creed ? axesOf(creed) : null;
    try { return P().actorPartyStanding(nameOf(actor), axes); } catch (e) { return null; }
  }

  // ── Preach ───────────────────────────────────────────────────────────────
  // opts: { speakerCreedId, npcCreedId, opinion, luk, repeats, engagement }.
  // Answers { mult, distance, far, repeat, backfire, offended }.
  function preachReckon(o) {
    const distance = creedDistance(o.speakerCreedId, o.npcCreedId);
    const fit = Math.max(0.25, 1 - distance / 160);
    const far = distance > PREACH_FAR;
    const repeat = (Number(o.repeats) || 0) > 0;
    const op = Number(o.opinion) || 0;
    const partisan = (Number(o.engagement) || 0) >= PARTISAN_ENGAGEMENT;
    const backfire = op < 0 || ((far || repeat) && partisan);
    return {
      mult: PREACH_BASE * fit, distance, far, repeat, backfire,
      offended: backfire || far || repeat,
    };
  }

  // opts: { actor, npcName, profile, opinion, repeats, engagement, rand,
  // addOpinion(delta) }. Answers { ok, outcome: moved|unmoved|backfire,
  // conv, delta, doubt }.
  function applyPreach(o) {
    const rand = o.rand || Math.random;
    const speakerCreedId = actorCreedId(o.actor);
    const npcCreed = npcCreedId(o.profile);
    if (!speakerCreedId) return { ok: false, reason: 'noCreed' };
    if (!npcCreed || npcCreed === speakerCreedId) return { ok: false, reason: 'sameCreed' };
    const r = preachReckon({ speakerCreedId, npcCreedId: npcCreed, opinion: o.opinion,
      repeats: o.repeats, engagement: o.engagement });
    let delta = 0, doubt = null, conv = null, outcome;
    const LS = window.NPCLifeSim;
    if (r.backfire) {
      delta = -rollInt(rand, PREACH_BACKFIRE[0], PREACH_BACKFIRE[1]);
      // Their own creed firms up: whatever pull the preacher's creed had on
      // them is worn down, and the preacher is the one left doubting.
      const cur = o.profile.conversion;
      if (cur && cur.toId === speakerCreedId) {
        cur.pct = Math.round((cur.pct - rollInt(rand, PREACH_BACKFIRE[0], PREACH_BACKFIRE[1]) * 2) * 100) / 100;
        if (cur.pct <= 0) delete o.profile.conversion;
      }
      doubt = pushActorConversion(o.actor, npcCreed, rollInt(rand, BACKFIRE_DOUBT[0], BACKFIRE_DOUBT[1]), o.npcName);
      outcome = 'backfire';
    } else {
      if (r.offended) delta = -rollInt(rand, PREACH_OFFEND[0], PREACH_OFFEND[1]);
      const before = (o.profile.conversion && o.profile.conversion.toId === speakerCreedId) ? o.profile.conversion.pct : 0;
      try { conv = (LS && LS.playerPush) ? LS.playerPush(o.npcName, o.actor, Math.max(0, Number(o.opinion) || 0), rand, r.mult) : null; }
      catch (e) { conv = null; }
      const converted = !conv && npcCreedId(o.profile) === speakerCreedId;
      outcome = (converted || (conv && conv.toId === speakerCreedId && conv.pct > before)) ? 'moved' : 'unmoved';
    }
    if (delta && o.addOpinion) o.addOpinion(delta);
    const now = LS && LS.conversionOf ? LS.conversionOf(o.npcName) : null;
    return { ok: true, outcome, conv: now, converted: npcCreedId(o.profile) === speakerCreedId,
      delta, doubt, reckon: r, creed: creedLabel(speakerCreedId), npcCreed: creedLabel(npcCreed) };
  }

  // ── Debate ───────────────────────────────────────────────────────────────
  // opts: { speakerTier, npcTier, psi, engagement, rand }.
  function debateReckon(o) {
    const rand = o.rand || Math.random;
    const speaker = (Number(o.speakerTier) || 1) * 12 + psiMod(o.psi) * 2 + rand() * 40;
    const npc = (Number(o.npcTier) || 1) * 12 + (Number(o.engagement) || 0) * 0.1 + rand() * 40;
    return { win: speaker >= npc, speaker: Math.round(speaker), npc: Math.round(npc), margin: Math.round(speaker - npc) };
  }

  // opts: { actor, npcName, profile, opinion, engagement, rand, addOpinion }.
  function applyDebate(o) {
    const rand = o.rand || Math.random;
    const speakerCreedId = actorCreedId(o.actor);
    const npcCreed = npcCreedId(o.profile);
    if (!speakerCreedId) return { ok: false, reason: 'noCreed' };
    if (!npcCreed || npcCreed === speakerCreedId) return { ok: false, reason: 'sameCreed' };
    const speakerTier = debateTierOfActor(o.actor, speakerCreedId);
    const npcTier = debateTierOfNpc(o.profile, o.npcName, npcCreed);
    const r = debateReckon({ speakerTier, npcTier, psi: psiOf(o.actor), engagement: o.engagement, rand });
    const LS = window.NPCLifeSim;
    let doubt = null, delta = 0, xp = 0;
    if (r.win) {
      try { if (LS && LS.playerPush) LS.playerPush(o.npcName, o.actor, Math.max(0, Number(o.opinion) || 0), rand, DEBATE_WIN_MULT); }
      catch (e) { /* no life sim here */ }
      const XP = window.SpecializationXP;
      try { if (XP && XP.award) { XP.award(SPEAKING, DEBATE_XP, { actor: o.actor, soloist: true }); xp = DEBATE_XP; } }
      catch (e) { xp = 0; }
      delta = r.margin > 20 ? -1 : 1;
    } else {
      doubt = pushActorConversion(o.actor, npcCreed, rollInt(rand, DEBATE_LOSS_PUSH[0], DEBATE_LOSS_PUSH[1]), o.npcName);
      delta = 1;
    }
    if (delta && o.addOpinion) o.addOpinion(delta);
    return { ok: true, win: r.win, reckon: r, speakerTier, npcTier, delta, xp, doubt,
      conv: LS && LS.conversionOf ? LS.conversionOf(o.npcName) : null,
      converted: npcCreedId(o.profile) === speakerCreedId,
      creed: creedLabel(speakerCreedId), npcCreed: creedLabel(npcCreed) };
  }

  // ── Ask their views ──────────────────────────────────────────────────────
  function viewsOf(npcName, profile) {
    const creedId = npcCreedId(profile);
    const fam = familyOf(creedId);
    const LS = window.NPCLifeSim;
    let conv = null;
    try { conv = LS && LS.conversionOf ? LS.conversionOf(npcName) : null; } catch (e) { conv = null; }
    const identity = identityOf(npcName);
    const party = partyOf(identity);
    const voted = identity && identity.votedLast ? partyOf(identity, identity.votedLast.partyId) : null;
    const mine = playerParty();
    const supportsMine = !!(mine && (mine.supporters || []).includes(npcName));
    return {
      creedId, creed: creedId ? creedLabel(creedId) : '', family: fam, familyLabel: familyLabel(fam),
      conversion: conv,
      party: supportsMine ? mine.name : (party ? party.name : null),
      votedFor: voted ? voted.name : null, voted: !!(identity && identity.votedLast),
      engagement: identity ? Number(identity.engagement) || 0 : 0,
      hasIdentity: !!identity,
    };
  }

  // ── Pray together ────────────────────────────────────────────────────────
  function canPrayTogether(speakerCreedId, npcCreed) {
    return PRAY_FAMILIES.includes(familyOf(speakerCreedId)) && PRAY_FAMILIES.includes(familyOf(npcCreed));
  }
  // opts: { actor, npcName, profile, opinion, rand, addOpinion }.
  function applyPray(o) {
    const rand = o.rand || Math.random;
    const a = actorCreedId(o.actor), b = npcCreedId(o.profile);
    if (!canPrayTogether(a, b)) return { ok: false, reason: 'notFaithful' };
    const delta = rollInt(rand, PRAY_OPINION[0], PRAY_OPINION[1]);
    if (o.addOpinion) o.addOpinion(delta);
    if (a !== b) {
      try { window.NPCLifeSim && window.NPCLifeSim.playerPush &&
        window.NPCLifeSim.playerPush(o.npcName, o.actor, Math.max(0, (Number(o.opinion) || 0) + delta), rand, PRAY_PUSH); }
      catch (e) { /* no life sim here */ }
    }
    o.profile.leisure = clamp((Number(o.profile.leisure) || 0) + PRAY_FUN, 0, 100);
    return { ok: true, delta, fun: PRAY_FUN, sameCreed: a === b };
  }

  // ── Ask about their vote ─────────────────────────────────────────────────
  function isShy(persName) { return SHY.includes(String(persName || '')); }
  // opts: { persName, opinion, rand }. Answers { refused }.
  function askVoteReckon(o) {
    if (!isShy(o.persName) || (Number(o.opinion) || 0) >= VOTE_OPEN_OPINION) return { refused: false };
    return { refused: (o.rand || Math.random)() < SHY_REFUSE };
  }

  // ── Join their party / invite them to yours ──────────────────────────────
  // opts: { psi, distance, opinion }. 1..95.
  function partyJoinChance(o) {
    const raw = JOIN_BASE + psiMod(o.psi) * 4 + (JOIN_DIST_POINT - (Number(o.distance) || 0)) * 0.9 +
      (Number(o.opinion) || 0) * 0.15;
    return Math.round(clamp(raw, 1, 95));
  }
  // Where the member stands: their identity's axes when the simulation has
  // written one, their creed's otherwise.
  function actorAxes(actor) {
    const identity = identityOf(nameOf(actor));
    if (identity && identity.ideology) return identity.ideology;
    const creed = actorCreedId(actor);
    return creed ? axesOf(creed) : null;
  }
  // The party the member would ask the NPC into: the party's own, when the
  // member carries its card, else the one they declared, when it stands on
  // the NPC's ballot. { party, isPlayer } or null.
  function speakerPartyFor(actor, npcName) {
    const name = nameOf(actor);
    const mine = playerParty();
    if (mine && (mine.members || []).includes(name)) return { party: mine, isPlayer: true };
    const declared = (profileOf(name) || {}).declaredPartyName;
    if (!declared || !P() || !P().ballotOf) return null;
    let row = null;
    try { row = P().ballotOf(npcName).find(e => e.party.name === declared) || null; } catch (e) { row = null; }
    return row ? { party: row.party, isPlayer: false } : null;
  }
  // The member's declared party, by name.
  function actorDeclaredParty(actor) {
    return (profileOf(nameOf(actor)) || {}).declaredPartyName || null;
  }
  // Join their party: { party, chance, distance } or null when there is
  // nothing to join (no party, or the member already holds that card).
  function joinTheirTerms(actor, npcName, opinion) {
    const identity = identityOf(npcName);
    const party = partyOf(identity);
    if (!party || actorDeclaredParty(actor) === party.name) return null;
    const axes = actorAxes(actor);
    const distance = axes ? creedDistance(axes, party.platform) : 100;
    return { party, distance, chance: partyJoinChance({ psi: psiOf(actor), distance, opinion }) };
  }
  function inviteTerms(actor, npcName, opinion) {
    const identity = identityOf(npcName);
    if (!identity) return null;
    const sp = speakerPartyFor(actor, npcName);
    if (!sp) return null;
    if (sp.isPlayer ? (sp.party.supporters || []).includes(npcName) : identity.partyId === sp.party.id) return null;
    const distance = creedDistance(identity.ideology, sp.party.platform);
    return { party: sp.party, isPlayer: sp.isPlayer, distance,
      chance: partyJoinChance({ psi: psiOf(actor), distance, opinion }) };
  }
  // opts: { actor, npcName, opinion, rand, addOpinion }.
  function applyJoinTheirParty(o) {
    const terms = joinTheirTerms(o.actor, o.npcName, o.opinion);
    if (!terms) return { ok: false, reason: 'noParty' };
    const roll = (o.rand || Math.random)() * 100;
    if (roll >= terms.chance) {
      const delta = -rollInt(o.rand, JOIN_REFUSED[0], JOIN_REFUSED[1]);
      if (o.addOpinion) o.addOpinion(delta);
      return { ok: true, joined: false, party: terms.party, chance: terms.chance, delta };
    }
    const name = nameOf(o.actor);
    const profile = profileOf(name);
    if (profile) profile.declaredPartyName = terms.party.name;
    const own = identityOf(name);
    if (own) own.partyId = terms.party.id;
    return { ok: true, joined: true, party: terms.party, chance: terms.chance, delta: 0 };
  }
  function applyInvite(o) {
    const terms = inviteTerms(o.actor, o.npcName, o.opinion);
    if (!terms) return { ok: false, reason: 'noParty' };
    const roll = (o.rand || Math.random)() * 100;
    if (roll >= terms.chance) {
      const delta = -rollInt(o.rand, JOIN_REFUSED[0], JOIN_REFUSED[1]);
      if (o.addOpinion) o.addOpinion(delta);
      return { ok: true, joined: false, party: terms.party, chance: terms.chance, delta };
    }
    let joined = false;
    try {
      joined = !!P().switchParty(o.npcName, terms.isPlayer ? P().PLAYER_PARTY_ID : terms.party.id, { by: nameOf(o.actor) });
    } catch (e) { joined = false; }
    return { ok: true, joined, party: terms.party, chance: terms.chance, delta: 0 };
  }

  // ── Campaign ─────────────────────────────────────────────────────────────
  // The parties the member can canvass for on this doorstep: the NPC's own
  // ballot, nearest their views first, and the party's own when it exists,
  // less the one they already back.
  function campaignOptions(npcName) {
    const identity = identityOf(npcName);
    if (!identity || !P() || !P().ballotOf) return [];
    let rows = [];
    try { rows = P().ballotOf(npcName).filter(e => e.party.id !== identity.partyId); } catch (e) { rows = []; }
    const out = rows.map(e => ({ id: e.party.id, party: e.party, isPlayer: false, distance: e.distance }));
    const mine = playerParty();
    if (mine && !(mine.supporters || []).includes(npcName)) {
      out.unshift({ id: mine.id, party: mine, isPlayer: true, distance: creedDistance(identity.ideology, mine.platform) });
    }
    return out;
  }
  function campaignChance(opinion, speakTier, engagement) {
    return Math.round(clamp(30 + (Number(opinion) || 0) * 0.4 + ((Number(speakTier) || 1) - 1) * 8 -
      (Number(engagement) || 0) * 0.3, 5, 90));
  }
  function pullIdentity(identity, platform, share) {
    for (const ax of AXES) {
      const cur = Number(identity.ideology[ax]) || 0;
      identity.ideology[ax] = clamp(Math.round(cur + ((Number(platform[ax]) || 0) - cur) * share), -100, 100);
    }
  }
  // opts: { actor, npcName, partyId, opinion, rand, addOpinion }.
  function applyCampaign(o) {
    const rand = o.rand || Math.random;
    const identity = identityOf(o.npcName);
    const row = campaignOptions(o.npcName).find(r => r.id === o.partyId);
    if (!identity || !row) return { ok: false, reason: 'noParty' };
    const chance = campaignChance(o.opinion, actorSpecTier(o.actor, SPEAKING), identity.engagement);
    let delta = 0;
    if ((Number(identity.engagement) || 0) < APATHETIC) delta -= rollInt(rand, 1, 2);
    const landed = rand() * 100 < chance;
    let switched = null;
    if (landed) {
      const before = creedDistance(identity.ideology, row.party.platform);
      pullIdentity(identity, row.party.platform, CAMPAIGN_SHARE[0] + rand() * (CAMPAIGN_SHARE[1] - CAMPAIGN_SHARE[0]));
      const after = creedDistance(identity.ideology, row.party.platform);
      try {
        if (row.isPlayer) {
          const own = partyOf(identity);
          const ownD = own ? creedDistance(identity.ideology, own.platform) : Infinity;
          if (after < ownD && P().switchParty(o.npcName, P().PLAYER_PARTY_ID, { by: nameOf(o.actor) })) switched = row.party;
        } else {
          switched = P().reconsiderParty(o.npcName) || null;
        }
      } catch (e) { switched = null; }
      if (delta && o.addOpinion) o.addOpinion(delta);
      return { ok: true, landed, chance, party: row.party, before, after, switched, delta };
    }
    delta -= 1;
    if (o.addOpinion) o.addOpinion(delta);
    return { ok: true, landed: false, chance, party: row.party, switched: null, delta };
  }

  // ── Endorse ──────────────────────────────────────────────────────────────
  // The soonest election this person votes in: their town's, their nation's
  // or their bloc's. { level, polity, minute, days } or null.
  function nextElectionOf(npcName, now) {
    const identity = identityOf(npcName);
    if (!identity || !P()) return null;
    const at = now == null ? nowMinute() : now;
    const out = [];
    try {
      const s = P().getSettlement && identity.group ? P().getSettlement(identity.group) : null;
      if (s && s.nextLocalElectionMinute != null) out.push({ level: 'local', polity: identity.group, minute: s.nextLocalElectionMinute }); // i18n-ignore: level id
      const n = P().getNation && identity.country ? P().getNation(identity.country) : null;
      if (n && n.nextElectionMinute != null) out.push({ level: 'nation', polity: n.name || identity.country, minute: n.nextElectionMinute }); // i18n-ignore: level id
      const w = P().getPower ? P().getPower(identity.power) : null;
      if (w && w.nextElectionMinute != null) out.push({ level: 'power', polity: w.name || identity.power, minute: w.nextElectionMinute }); // i18n-ignore: level id
    } catch (e) { return null; }
    const ahead = out.filter(e => e.minute >= at).sort((a, b) => a.minute - b.minute);
    if (!ahead.length) return null;
    const e = ahead[0];
    return Object.assign(e, { days: Math.ceil((e.minute - at) / MINUTES_PER_DAY) });
  }
  function endorseOpen(npcName, now) {
    const e = nextElectionOf(npcName, now);
    return !!(e && e.days <= ENDORSE_WINDOW_DAYS);
  }
  // Who can be endorsed to this voter: the three residents of their town most
  // likely to stand (the same engagement and charisma the town hall ranks by)
  // while the town's election is the one coming, and the team's own
  // candidates standing in any election they vote in.
  function endorseOptions(npcName, now) {
    const identity = identityOf(npcName);
    if (!identity || !endorseOpen(npcName, now)) return [];
    const out = [];
    const e = nextElectionOf(npcName, now);
    if (e && e.level === 'local' && P().listIdentities) { // i18n-ignore: level id
      const all = P().listIdentities() || {};
      const ranked = Object.entries(all)
        .filter(([, id]) => id && id.group === identity.group)
        .map(([name, id]) => ({ name, score: (Number(id.engagement) || 0) * 0.7 + (Number(id.charisma) || 0) * 0.5 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      for (const r of ranked) out.push({ id: `npc:${r.name}`, kind: 'npc', name: r.name }); // i18n-ignore: row kind
    }
    let standing = [];
    try { standing = (P().listCandidacies ? P().listCandidacies() : []).filter(c => c.status === 'standing'); } // i18n-ignore: status id
    catch (err) { standing = []; }
    for (const c of standing) {
      const mine = (c.level === 'local' && c.polity === identity.group) || // i18n-ignore: level id
        (c.level === 'nation' && c.polity === identity.country) || // i18n-ignore: level id
        (c.level === 'power' && c.polity === identity.power); // i18n-ignore: level id
      if (mine) out.push({ id: `team:${c.actor}`, kind: 'team', name: c.actor, level: c.level }); // i18n-ignore: row kind
    }
    return out;
  }
  // opts: { actor, npcName, candidateId, opinion, rand, addOpinion, now }.
  function applyEndorse(o) {
    const rand = o.rand || Math.random;
    const voter = identityOf(o.npcName);
    const row = endorseOptions(o.npcName, o.now).find(r => r.id === o.candidateId);
    if (!voter || !row) return { ok: false, reason: 'closed' };
    const chance = Math.round(clamp(35 + (Number(o.opinion) || 0) * 0.4 + (actorSpecTier(o.actor, SPEAKING) - 1) * 8, 5, 90));
    if (rand() * 100 >= chance) {
      if (o.addOpinion) o.addOpinion(-1);
      return { ok: true, landed: false, chance, row, delta: -1 };
    }
    if (row.kind === 'npc') { // i18n-ignore: row kind
      const cand = identityOf(row.name);
      if (cand) {
        cand.charisma = clamp((Number(cand.charisma) || 0) + rollInt(rand, ENDORSE_CHARISMA[0], ENDORSE_CHARISMA[1]), 0, 100);
        cand.engagement = clamp((Number(cand.engagement) || 0) + 2, 0, 100);
        if (row.name !== o.npcName && cand.ideology) pullIdentity(voter, cand.ideology, ENDORSE_PULL);
      }
    } else {
      const mine = playerParty();
      pullIdentity(voter, (mine && mine.platform) || { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 }, TEAM_ENDORSE_PULL);
    }
    return { ok: true, landed: true, chance, row, delta: 0 };
  }

  // ── Petition ─────────────────────────────────────────────────────────────
  // The office somebody holds: { kind: local, office } for a town's, { kind:
  // state, office, power } for a seat in a real government, or null.
  function officeOf(npcName, profile) {
    const identity = identityOf(npcName);
    if (identity && identity.localOffice) return { kind: 'local', office: identity.localOffice }; // i18n-ignore: office kind
    if (profile && profile._politicianId && P() && P().findPolitician) {
      let found = null;
      try { found = P().findPolitician(npcName); } catch (e) { found = null; }
      if (found && found.pol && found.pol.office) return { kind: 'state', office: found.pol.office, power: found.power }; // i18n-ignore: office kind
    }
    return null;
  }
  function crimes() {
    const CS = window.CrimeSystem;
    try { return (CS && CS.getCrimes) ? CS.getCrimes() : []; } catch (e) { return []; }
  }
  // The heaviest charge on the record: { index, bounty, name } or null.
  function heaviestCharge() {
    let best = null;
    crimes().forEach((c, index) => {
      const b = Number(c && c.bounty) || 0;
      if (b > 0 && (!best || b > best.bounty)) best = { index, bounty: b, name: c.name || c.crimeName || '' };
    });
    return best;
  }
  function petitionChance(opinion) {
    return Math.round(clamp(30 + (Number(opinion) || 0) * 0.6, 5, 90));
  }
  // The favours this office can grant: [{ id, price, disabled, reason }].
  function petitionOptions(npcName, profile, gold) {
    const office = officeOf(npcName, profile);
    if (!office) return [];
    const purse = gold == null ? (() => { try { return $gameParty.gold(); } catch (e) { return 0; } })() : gold;
    const out = [];
    if (office.kind === 'state' || PARDON_OFFICES.includes(office.office)) { // i18n-ignore: office kind
      const charge = heaviestCharge();
      const price = charge ? Math.max(PETITION_PARDON_MIN, Math.round(charge.bounty * PETITION_PARDON_SHARE)) : PETITION_PARDON_MIN;
      out.push({ id: 'pardon', price, charge, // i18n-ignore: favour id
        disabled: !charge || purse < price, reason: !charge ? 'noCharges' : purse < price ? 'youCantAfford' : null });
    }
    if (office.kind === 'state' && office.power && office.power.policies) { // i18n-ignore: office kind
      const low = (Number(office.power.policies.taxRate) || 0) <= MIN_TAX;
      out.push({ id: 'taxCut', price: PETITION_TAX_PRICE, polity: office.power.name, // i18n-ignore: favour id
        disabled: low || purse < PETITION_TAX_PRICE, reason: low ? 'taxFloor' : purse < PETITION_TAX_PRICE ? 'youCantAfford' : null });
    }
    return out;
  }
  // opts: { npcName, profile, favour, opinion, rand, addOpinion }.
  function applyPetition(o) {
    const row = petitionOptions(o.npcName, o.profile).find(r => r.id === o.favour);
    if (!row) return { ok: false, reason: 'noFavour' };
    if (row.disabled) return { ok: false, reason: row.reason, price: row.price };
    const chance = petitionChance(o.opinion);
    if ((o.rand || Math.random)() * 100 >= chance) {
      if (o.addOpinion) o.addOpinion(-PETITION_REFUSED);
      return { ok: true, granted: false, chance, row, delta: -PETITION_REFUSED };
    }
    try { $gameParty.loseGold(row.price); } catch (e) { return { ok: false, reason: 'youCantAfford', price: row.price }; }
    if (row.id === 'pardon') { // i18n-ignore: favour id
      try { window.CrimeSystem.removeCrime(row.charge.index); } catch (e) { /* the record is gone */ }
    } else {
      const office = officeOf(o.npcName, o.profile);
      const pol = office && office.power && office.power.policies;
      if (pol) pol.taxRate = Math.max(MIN_TAX, (Number(pol.taxRate) || 0) - 1);
    }
    return { ok: true, granted: true, chance, row, delta: 0 };
  }

  const Civics = {
    PREACH_FAR, PREACH_REPEAT_DAYS, PARTISAN_ENGAGEMENT, ENDORSE_WINDOW_DAYS, VOTE_OPEN_OPINION,
    PRAY_FAMILIES, SHY, SPEAKING,
    text: Tr, line, money,
    actorCreedId, npcCreedId, familyOf, familyLabel, creedLabel, pinned, politicsOn,
    identityOf, partyOf, playerParty,
    psiOf, psiMod, charmOf, debateTierOfActor, debateTierOfNpc, debateSpecsFor,
    pushActorConversion, actorConversionOf, actorPartyWarning,
    preachReckon, applyPreach, debateReckon, applyDebate, viewsOf, canPrayTogether, applyPray,
    isShy, askVoteReckon, partyJoinChance, actorAxes, speakerPartyFor, joinTheirTerms, inviteTerms,
    applyJoinTheirParty, applyInvite, campaignOptions, campaignChance, applyCampaign,
    nextElectionOf, endorseOpen, endorseOptions, applyEndorse,
    officeOf, heaviestCharge, petitionChance, petitionOptions, applyPetition,
  };
  if (window.NPCEmpathize) window.NPCEmpathize.Civics = Civics;
})();
// <<< EMPATHIZE CIVICS <<<
// >>> EMPATHIZE HELP (Help, Games, Romance and Talk actions) >>>
// ============================================================================
// SECTION 12, HELP, GAMES, ROMANCE AND RUMOURS (NPCEmpathize.Help)
// ============================================================================
// The reckoning behind the Help, Games, Romance and Talk verbs the action
// board gained in step 5, kept apart from the scene so it can be read and
// tested on its own. The scene half (NPCEmpathizeUI_Lessons.js, HELP) puts
// the verbs on the board, opens the pick sheets and speaks the lines; every
// apply* here hands back { ok, deltaOpinion, money, xp, lines } and moves
// the standing only through the addOpinion it is given.
//
//   Treat them     a healing item from the pack on somebody hurt: their
//                  health back, and a <Medicine:> item treats the wounds too
//                  (NPCDowned's treated pace, TREATMENT_DAYS).
//   Give medicine  a remedy the pack holds for an illness they are showing:
//                  the disease system's own NPC course (entry.treatedAt for a
//                  cure, entry.managed for something only held at bay).
//   First aid      somebody lying downed gets up now, at a quarter of their
//                  health (NPCDowned.firstAid). No crime, much gratitude. The
//                  one help a downed beast is given too.
//   Offer a fix    what feeds their craving, out of the pack
//                  (NPCSim.Addictions): relief and standing now, and every
//                  fix handed over deepens the habit (Addictions.enable).
//   Intervene      talk an addict toward quitting (Psychology, PSI, opinion):
//                  the craving builds at half pace for three weeks and the
//                  withdrawal eases (Addictions.intervene).
//   Offer shelter  a refugee or somebody sleeping rough moves into a house
//                  the party owns (ProceduralHouseSystem deeds), through
//                  NPCLifeSim.relocate when it stands in another town.
//   Challenge      a game from the venues the speaker could name: a real
//                  seat-game on this map is played with them in the other
//                  seat (MinigameOpponent.pin), anything else is a headless
//                  round against the speaker's own specialization, with an
//                  optional bet; a gambler says yes more readily.
//   Introduce      matchmaking between two singles the party knows, asked of
//                  both people (NPCLifeSim.mayPair, NPCRomance): a success
//                  starts them dating through NPCLifeSim.introduceCouple.
//   Rumours        something current: a war, an election, the Horde, an
//                  outbreak, a big market move, the town's own news or the
//                  Rumors bank, in their personality's voice and their creed
//                  family's (CreedVoice.decorate, Em and Bubba exempt).
//
// Children are helped (treated, dosed, picked up off the ground) and nothing
// else; a beast is only ever given first aid; the scene's board gates decide
// the rest. Money is gold in the save and euros on screen (NPCShared.formatMoney).
(() => {
  'use strict';

  const ROOT = 'Empathize.act';
  const BANK = 'ConvActions';
  const MINUTES_PER_DAY = 1440;
  const HOSTILE = -60;               // a conscious person this cold waves help away
  const TREAT_OPINION = [4, 14];     // by how much of their health was missing
  const TREAT_WOUND_BONUS = 2;
  const TREAT_XP = 1.5;
  const TREAT_MEND_MIN = MINUTES_PER_DAY; // a medicine knits every wound a day on
  const MEDICINE_OPINION = [8, 14];
  const MEDICINE_XP = 1.5;
  const FIRST_AID_OPINION = 25;
  const FIRST_AID_OWN_WORK = 8;      // the party put them there in the first place
  const FIRST_AID_SHARE = 0.25;
  const FIRST_AID_XP = 2;
  const FIX_OPINION = [3, 12];       // by how hard the craving was biting
  const FIX_DAILY = 2;
  const INTERVENE_DAYS = 21;
  const INTERVENE_COOLDOWN_DAYS = 3;
  const INTERVENE_MIN_OPINION = 0;
  const INTERVENE_OPINION = 4;
  const INTERVENE_REFUSED = -4;
  const INTERVENE_XP = 2;
  const SHELTER_MIN_OPINION = -20;
  const SHELTER_OPINION = 20;
  const CHALLENGE_MIN_OPINION = -20;
  const CHALLENGE_OPINION = { won: 1, lost: 3, draw: 2 }; // the speaker's result
  const CHALLENGE_XP = { won: 1.5, lost: 0.75, draw: 1 };
  const BET_STEPS = [500, 2000, 5000];  // 5, 20 and 50 euros
  const BET_SHARE = 0.1;             // of their pocket a careful player risks
  const BET_SHARE_GAMBLER = 0.25;
  const BET_RELIEF = 40;             // a bet feeds a gambler's want
  const INTRODUCE_MIN_OPINION = 10;
  const INTRODUCE_OPINION = 6;
  const INTRODUCE_FAILED = -2;
  const INTRODUCE_XP = 2;
  const INTRODUCE_MAX = 30;
  const RUMOUR_DAILY = 3;
  const RUMOUR_MIN_OPINION = -40;
  const RUMOUR_OPINION = 1;
  const RUMOUR_XP = 0.5;
  const RUMOUR_NEWS_DAYS = 14;
  const MARKET_MOVE = 0.15;          // a company this far off its fair value is news
  const ELECTION_NEWS_DAYS = 60;
  const PROC_MAP_ID = 636;
  // i18n-ignore-start: Specialization.json lookup keys, minigame ids, status ids
  const SPEC = {
    treat: 'Nursing', medicine: 'Pharmacology', firstAid: 'First Aid', vet: 'Veterinary Medicine',
    intervene: 'Psychology', introduce: 'Matchmaking', rumours: 'Rumormongering',
  };
  // The games a challenge names, in the order the sheet lists them. `seat`:
  // the minigame puts a second player in the other seat (MinigameOpponent),
  // so a table on this map is played for real.
  const GAMES = {
    cards:      { spec: 'Card Counting' },
    chess:      { spec: 'Chess' },
    pool:       { spec: 'Billiards', seat: true },
    bowling:    { spec: 'Tenpin Bowling', seat: true },
    basketball: { spec: 'Basketball', seat: true },
    arcade:     { spec: 'Video Gaming' },
    target:     { spec: 'Clay Shooting' },
    piano:      { spec: 'Playing Piano' },
  };
  const GAME_ORDER = Object.keys(GAMES);
  const GAMBLING = 'gambling';
  const FIX_ALL = 'all';
  const RETURNED = 'returned';
  const SETTLED = 'settled';
  const SINGLE = ['single', 'divorced', 'widowed'];
  const EXEMPT_NAMES = ['em', 'bubba'];
  const BUBBAROMANTIC = 'bubbaromantic';
  const CREED_TOPIC = {
    war: 'war', horde: 'goblins', election: 'elections', electionResult: 'elections',
    marketUp: 'money', marketDown: 'money', epidemic: 'flavour', town: 'flavour', generic: 'flavour',
  };
  // i18n-ignore-end

  // ── Seeds, clock and text ─────────────────────────────────────────────────
  function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rollInt = (rand, lo, hi) => lo + Math.floor((rand || Math.random)() * (hi - lo + 1));
  function now() {
    return (typeof $gameVariables !== 'undefined' && $gameVariables) ? (Number($gameVariables.value(114)) || 0) : 0;
  }
  function text(key, params) {
    return window.T ? window.T(`${ROOT}.${key}`, params) : key;
  }
  function label(key) {
    try { return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : String(key || ''); }
    catch (e) { return String(key || ''); }
  }
  function tree(key) {
    try { return window.T && window.T.obj ? window.T.obj(`${BANK}.${key}`) : null; } catch (e) { return null; }
  }
  // A pool out of a variant tree, falling back to the default variant, so a
  // missing Em or Bubba line never leaves an exchange silent.
  function poolOf(key, variant) {
    const root = tree(key);
    if (Array.isArray(root)) return root;
    if (!root || typeof root !== 'object') return [];
    const pick = (node) => (Array.isArray(node) && node.length ? node : null);
    return pick(variant && root[variant]) || pick(root.default) || [];
  }
  function alt(str, rand) {
    let out = String(str == null ? '' : str);
    for (let guard = 0; guard < 64 && out.indexOf('{') >= 0; guard++) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const parts = body.split('|');
        return parts[Math.floor((rand || Math.random)() * parts.length)];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  }
  function fill(str, params) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (whole, name) =>
      (params && Object.prototype.hasOwnProperty.call(params, name)) ? String(params[name]) : whole);
  }
  function line(key, variant, params, rand) {
    const pool = poolOf(key, variant);
    if (!pool.length) return '';
    const r = rand || Math.random;
    return alt(fill(pool[Math.floor(r() * pool.length)], params), r);
  }
  function money(gold) {
    if (window.NPCShared && window.NPCShared.formatMoney) return window.NPCShared.formatMoney(gold);
    return `${(Math.floor(Number(gold) || 0) / 100).toFixed(2)}€`;
  }
  // The variant a reply is spoken in: Em or Bubba answering speak their own,
  // anybody answering Em or Bubba has lines for them.
  function replyVariant(speakerVoice, npcVoice) {
    if (npcVoice) return npcVoice;
    return speakerVoice === 'em' ? 'toEm' : speakerVoice === 'bubba' ? 'toBubba' : 'default';
  }

  // ── Who they are ─────────────────────────────────────────────────────────
  function worldModes() { return (window.NPCShared && window.NPCShared.WorldModes) || window.WorldModes || null; }
  function modeAllows(q) {
    const WM = worldModes();
    if (!WM || typeof WM[q] !== 'function') return true;
    try { return WM[q]() !== false; } catch (e) { return true; }
  }
  function isBeast(profile, name) {
    const NC = window.NPCCreature;
    if (!NC) return false;
    try { return !!(NC.isNonSentientProfile && NC.isNonSentientProfile(profile)) || !!(NC.isNonSentientNPC && NC.isNonSentientNPC(name)); }
    catch (e) { return false; }
  }
  function isChild(profile, name) {
    const LS = window.NPCLifeSim;
    try { if (LS && LS.isMinor) return !!LS.isMinor(name, profile); } catch (e) { /* the profile answers */ }
    return !!(profile && profile._child && profile.lifeStage !== 'adult'); // i18n-ignore: life stage id
  }
  function isExemptName(name) { return EXEMPT_NAMES.includes(String(name || '').trim().toLowerCase()); }
  function mayHoldMoney(profile, name) {
    return !(window.NPCCreature && window.NPCCreature.mayHoldMoney && window.NPCCreature.mayHoldMoney(profile, name) === false);
  }
  function recent(profile, id, days) {
    const log = profile && profile.eventLog;
    if (!Array.isArray(log) || !log.length) return 0;
    const cutoff = now() - (days || 1) * MINUTES_PER_DAY;
    const tag = `action_${id}`;
    let n = 0;
    for (const e of log) if (e && e.tag === tag && (e.gameMin ?? 0) >= cutoff) n++;
    return n;
  }
  function stamp(profile, id, desc) {
    if (!profile) return;
    (profile.eventLog = profile.eventLog || []).push({
      tag: `action_${id}`, desc: String(desc || ''), timestamp: Date.now(), gameMin: now(),
    });
  }
  function specLevelOf(actor, specName) {
    const XP = window.SpecializationXP;
    try { if (XP && XP.levelOf) return Number(XP.levelOf(actor, specName)) || 1; } catch (e) { /* untrained */ }
    return 1;
  }
  function npcSpecLevel(profile, specName) {
    const spec = window.Specializations && window.Specializations.byName && window.Specializations.byName.get(specName);
    return spec ? (Number(profile && profile.specLevels && profile.specLevels[spec.id]) || 1) : 1;
  }
  function specLabel(specName) {
    const S = window.Specializations;
    const spec = S && S.byName && S.byName.get(specName);
    try { return (spec && S.displayName) ? S.displayName(spec) : specName; } catch (e) { return specName; }
  }
  function isStoryName(name) {
    try { return !!(window.NPCSystem && window.NPCSystem.isStoryName && window.NPCSystem.isStoryName(name)); }
    catch (e) { return false; }
  }
  function psiMod(actor) {
    if (!actor) return 0;
    if (actor.psiMod != null) return Number(actor.psiMod) || 0;
    return Math.floor(((Number(actor.luk) || 10) - 10) / 2);
  }
  function award(specName, points, actor) {
    const XP = window.SpecializationXP;
    if (!XP || !XP.award || !(points > 0)) return 0;
    try { XP.award(specName, points, { actor }); } catch (e) { return 0; }
    return points;
  }
  function packItem(itemId) {
    return (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[itemId] || null : null;
  }
  function packCount(item) {
    try { return (item && typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.numItems(item) : 0; }
    catch (e) { return 0; }
  }
  function packItems(test) {
    let list = [];
    try { list = (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.items) ? $gameParty.items() : []; }
    catch (e) { list = []; }
    return list.filter(it => it && test(it));
  }
  function spend(item) {
    try { $gameParty.loseItem(item, 1); return true; } catch (e) { return false; }
  }
  function outcome(extra) {
    return Object.assign({ ok: true, deltaOpinion: 0, money: 0, xp: 0, lines: [] }, extra || {});
  }
  const refuse = (reason, extra) => Object.assign({ ok: false, reason, deltaOpinion: 0, money: 0, xp: 0, lines: [] }, extra || {});

  // ── Treat them ───────────────────────────────────────────────────────────
  function hurtOf(profile) {
    if (!profile) return null;
    const mhp = Math.max(1, Number(profile.mhp) || 100);
    const hp = (typeof profile.hp === 'number' && isFinite(profile.hp)) ? clamp(profile.hp, 0, mhp) : mhp;
    const wounds = (Array.isArray(profile.injuries) ? profile.injuries : []).filter(i => i && !i.lost).length;
    return { hp, mhp, missing: Math.max(0, mhp - hp), wounds, hurt: hp < mhp - 0.5 || wounds > 0 };
  }
  function healOf(item) {
    const out = { rate: 0, flat: 0 };
    for (const e of (item && item.effects) || []) {
      if (e && e.code === 11) { out.rate += Number(e.value1) || 0; out.flat += Number(e.value2) || 0; }
    }
    return out;
  }
  function isMedicineItem(item) {
    if (!item) return false;
    if (window.Medicines && window.Medicines.isMedicine) {
      try { return !!window.Medicines.isMedicine(item.id); } catch (e) { /* the note answers */ }
    }
    return /<Medicine:/i.test(String(item.note || ''));
  }
  function isHealItem(item) {
    const h = healOf(item);
    return h.rate > 0 || h.flat > 0;
  }
  function healAmount(item, hurt) {
    const h = healOf(item);
    return Math.max(0, Math.min(hurt.missing, Math.round(hurt.mhp * h.rate + h.flat)));
  }
  function treatOptions(profile) {
    const hurt = hurtOf(profile);
    if (!hurt) return [];
    return packItems(isHealItem).map(item => ({
      itemId: item.id, name: item.name, have: packCount(item), heal: healAmount(item, hurt),
      medicine: isMedicineItem(item),
    })).sort((a, b) => (b.heal - a.heal) || (Number(b.medicine) - Number(a.medicine)) || (a.itemId - b.itemId));
  }
  function treatOpinion(hurt) {
    const share = hurt && hurt.mhp ? hurt.missing / hurt.mhp : 0;
    const base = TREAT_OPINION[0] + Math.round((TREAT_OPINION[1] - TREAT_OPINION[0]) * clamp(share, 0, 1));
    return Math.min(TREAT_OPINION[1], base + (hurt && hurt.wounds ? TREAT_WOUND_BONUS : 0));
  }
  function applyTreat(o) {
    const profile = o.profile;
    const item = packItem(o.itemId);
    const hurt = hurtOf(profile);
    if (!profile || !hurt) return refuse('notHurt');
    if (profile.downed) return refuse('downed');
    if (!hurt.hurt) return refuse('notHurt');
    if (!item || packCount(item) <= 0 || !isHealItem(item)) return refuse('noHealItems');
    if ((Number(o.opinion) || 0) <= HOSTILE) return refuse('hostile');
    const healed = healAmount(item, hurt);
    profile.hp = Math.min(hurt.mhp, hurt.hp + healed);
    const medicine = isMedicineItem(item);
    if (medicine) {
      const ND = window.NPCDowned;
      const days = (ND && ND.TREATMENT_DAYS) || 3;
      profile.treatedUntil = Math.max(Number(profile.treatedUntil) || 0, now() + days * MINUTES_PER_DAY);
      for (const inj of profile.injuries || []) {
        if (inj && !inj.lost) inj.mend = (Number(inj.mend) || 0) + TREAT_MEND_MIN;
      }
    }
    spend(item);
    const deltaOpinion = treatOpinion(hurt);
    if (o.addOpinion) o.addOpinion(deltaOpinion);
    const xp = award(SPEC.treat, TREAT_XP, o.actor);
    stamp(profile, 'treatThem', item.name);
    return outcome({ deltaOpinion, xp, healed, item: item.name, medicine });
  }

  // ── Give medicine ────────────────────────────────────────────────────────
  function untreatedIllnesses(profile) {
    const DS = window.DiseaseSystem;
    return ((profile && profile.diseases) || []).filter(e => {
      if (!e || e.id == null || e.treatedAt != null || e.managed) return false;
      try { return !DS || !DS.isNpcSymptomatic || DS.isNpcSymptomatic(e); } catch (err) { return true; }
    });
  }
  function diseaseName(id) {
    const DS = window.DiseaseSystem;
    try { return (DS && DS.displayName) ? DS.displayName(id) : String(id); } catch (e) { return String(id); }
  }
  function medicineOptions(profile) {
    const M = window.Medicines;
    const out = [];
    if (!M || !M.forDisease) return out;
    for (const e of untreatedIllnesses(profile)) {
      for (const r of M.forDisease(e.id) || []) {
        const item = packItem(r.itemId);
        const have = packCount(item);
        if (have <= 0) continue;
        out.push({ diseaseId: e.id, disease: diseaseName(e.id), itemId: r.itemId, name: item.name,
          kind: r.kind, days: r.days, have });
      }
    }
    return out;
  }
  function applyMedicine(o) {
    const profile = o.profile;
    if (!profile) return refuse('notSick');
    if ((Number(o.opinion) || 0) <= HOSTILE) return refuse('hostile');
    const entry = untreatedIllnesses(profile).find(e => e.id === o.diseaseId);
    if (!entry) return refuse('notSick');
    const M = window.Medicines;
    const remedy = M && M.forDisease ? (M.forDisease(entry.id) || []).find(r => r.itemId === o.itemId) : null;
    const item = packItem(o.itemId);
    if (!remedy || !item || packCount(item) <= 0) return refuse('noMedicine');
    if (remedy.kind === 'cure') entry.treatedAt = now(); // i18n-ignore: remedy kind id
    else entry.managed = true;
    spend(item);
    const deltaOpinion = rollInt(o.rand, MEDICINE_OPINION[0], MEDICINE_OPINION[1]);
    if (o.addOpinion) o.addOpinion(deltaOpinion);
    const xp = award(SPEC.medicine, MEDICINE_XP, o.actor);
    stamp(profile, 'giveMedicine', entry.id);
    return outcome({ deltaOpinion, xp, item: item.name, disease: diseaseName(entry.id), kind: remedy.kind, days: remedy.days });
  }

  // ── First aid ────────────────────────────────────────────────────────────
  function isDowned(profile) { return !!(profile && profile.downed && !profile._killed); }
  function firstAidOpinion(profile) {
    return (profile && profile.downed && profile.downed.byParty) ? FIRST_AID_OWN_WORK : FIRST_AID_OPINION;
  }
  function applyFirstAid(o) {
    const profile = o.profile;
    if (!isDowned(profile)) return refuse('notDowned');
    const deltaOpinion = firstAidOpinion(profile);
    const ND = window.NPCDowned;
    let res = null;
    try { res = (ND && ND.firstAid) ? ND.firstAid(o.name) : null; } catch (e) { res = null; }
    if (!res) {
      const mhp = Math.max(1, Number(profile.mhp) || 100);
      profile.downed = null;
      profile.hp = Math.max(Number(profile.hp) || 0, Math.max(1, Math.round(mhp * FIRST_AID_SHARE)));
      res = { hp: profile.hp, mhp };
    }
    if (o.addOpinion) o.addOpinion(deltaOpinion);
    const xp = award(o.beast ? SPEC.vet : SPEC.firstAid, FIRST_AID_XP, o.actor);
    stamp(profile, 'firstAid', o.name);
    return outcome({ deltaOpinion, xp, hp: res.hp });
  }

  // ── Offer a fix / Intervene ──────────────────────────────────────────────
  function addictions() { return (window.NPCSim && window.NPCSim.Addictions) || null; }
  function habitsOf(profile, name) {
    const A = addictions();
    if (!A || !profile) return [];
    try { return A.keysFor(profile, name) || []; } catch (e) { return []; }
  }
  function fixOptions(profile, name) {
    const A = addictions();
    const keys = habitsOf(profile, name);
    if (!A || !keys.length) return [];
    try { A.state(profile, name); } catch (e) { /* the meter answers as it stands */ }
    const out = [];
    for (const key of keys) {
      for (const item of packItems(it => A.feeds(it, key) > 0)) {
        out.push({ key, substance: A.label(key), itemId: item.id, name: item.name, dose: A.feeds(item, key),
          have: packCount(item), craving: Math.round(A.craving(profile, key) ?? 0) });
      }
    }
    return out.sort((a, b) => (b.craving - a.craving) || (b.dose - a.dose) || (a.itemId - b.itemId));
  }
  function applyFix(o) {
    const A = addictions();
    const profile = o.profile;
    if (!A || !habitsOf(profile, o.name).includes(o.key)) return refuse('notAddicted');
    const item = packItem(o.itemId);
    if (!item || packCount(item) <= 0 || !(A.feeds(item, o.key) > 0)) return refuse('noFix');
    if (recent(profile, 'offerFix', 1) >= FIX_DAILY) return refuse('fixedToday');
    try { A.state(profile, o.name); } catch (e) { /* as it stands */ }
    const craving = A.craving(profile, o.key) ?? 0;
    for (const r of A.reliefOf(item)) {
      if (r.key === FIX_ALL) for (const k of Object.keys((profile._crave && profile._crave.v) || {})) A.relieve(profile, k, r.amount);
      else A.relieve(profile, r.key, r.amount);
    }
    const depth = A.enable ? A.enable(profile, o.key) : 1;
    spend(item);
    const deltaOpinion = Math.round(FIX_OPINION[0] + (FIX_OPINION[1] - FIX_OPINION[0]) * clamp(craving / 100, 0, 1));
    if (o.addOpinion) o.addOpinion(deltaOpinion);
    stamp(profile, 'offerFix', o.key);
    return outcome({ deltaOpinion, item: item.name, substance: A.label(o.key), craving: Math.round(craving), depth });
  }
  function interveneChance(profile, name, key, actor, opinion) {
    const A = addictions();
    const depth = (A && A.depthOf) ? A.depthOf(profile, key) : 1;
    const spec = specLevelOf(actor, SPEC.intervene);
    const withdrawal = !!(A && A.inWithdrawal && A.inWithdrawal(profile));
    const p = 0.25 + (Number(opinion) || 0) / 250 + (spec - 1) * 0.08 + psiMod(actor) * 0.03 +
      (withdrawal ? 0.1 : 0) - (depth - 1) * 0.5;
    return clamp(p, 0.05, 0.85);
  }
  function interveneOptions(profile, name, actor, opinion) {
    const A = addictions();
    if (!A) return [];
    try { A.state(profile, name); } catch (e) { /* as it stands */ }
    return habitsOf(profile, name).map(key => ({
      key, substance: A.label(key),
      chance: Math.round(interveneChance(profile, name, key, actor, opinion) * 100),
      already: !!(A.isIntervened && A.isIntervened(profile, key)),
    }));
  }
  function applyIntervene(o) {
    const A = addictions();
    const profile = o.profile;
    if (!A || !habitsOf(profile, o.name).includes(o.key)) return refuse('notAddicted');
    if ((Number(o.opinion) || 0) < INTERVENE_MIN_OPINION) return refuse('distrust');
    if (recent(profile, 'intervene', INTERVENE_COOLDOWN_DAYS) > 0) return refuse('intervenedLately');
    const chance = interveneChance(profile, o.name, o.key, o.actor, o.opinion);
    const won = (o.rand || Math.random)() < chance;
    stamp(profile, 'intervene', o.key);
    if (!won) {
      if (o.addOpinion) o.addOpinion(INTERVENE_REFUSED);
      return outcome({ ok: false, reason: 'rebuffed', deltaOpinion: INTERVENE_REFUSED, substance: A.label(o.key), chance });
    }
    try { A.state(profile, o.name); } catch (e) { /* as it stands */ }
    A.intervene(profile, o.key, now() + INTERVENE_DAYS * MINUTES_PER_DAY);
    if (o.addOpinion) o.addOpinion(INTERVENE_OPINION);
    const xp = award(SPEC.intervene, INTERVENE_XP, o.actor);
    return outcome({ deltaOpinion: INTERVENE_OPINION, xp, substance: A.label(o.key), chance, days: INTERVENE_DAYS });
  }

  // ── Offer shelter ────────────────────────────────────────────────────────
  function shelterNeed(profile, name) {
    if (!profile) return null;
    const LS = window.NPCLifeSim;
    const rec = LS && LS.getRecord ? LS.getRecord(name) : null;
    if (rec && rec.refugee && rec.refugee.status !== RETURNED && !rec.refugee.sheltered) return 'refugee'; // i18n-ignore: need id
    if (profile.isHomeless || profile._sleepsRough) return 'homeless'; // i18n-ignore: need id
    return null;
  }
  // The town an owned door stands in: an authored map's group, or the
  // procedural settlement its square belongs to.
  function groupOfHouse(h) {
    if (!h) return null;
    const LS = window.NPCLifeSim;
    const m = /^(\d+):(-?\d+),(-?\d+)_/.exec(String(h.key || ''));
    if (m || h.mapId === PROC_MAP_ID) {
      if (!m || !LS || !LS.destinationAtTile || !LS.groupForPlace) return null;
      try {
        const place = LS.destinationAtTile(Number(m[2]), Number(m[3]));
        return place ? LS.groupForPlace(place) : null;
      } catch (e) { return null; }
    }
    try { return (window.NPCSystem && window.NPCSystem.findMapGroupByMap) ? window.NPCSystem.findMapGroupByMap(h.mapId) || null : null; }
    catch (e) { return null; }
  }
  function shelterOptions() {
    const PHS = window.ProceduralHouseSystem;
    let list = [];
    try { list = (PHS && PHS.listOwnedHouses) ? PHS.listOwnedHouses() || [] : []; } catch (e) { list = []; }
    return list.map(h => {
      const group = groupOfHouse(h);
      return { key: h.key, mapId: h.mapId, x: h.x, y: h.y, place: h.mapName || '', group, disabled: !group };
    });
  }
  function sameTown(a, b) {
    const LS = window.NPCLifeSim;
    const canon = (g) => { try { return (LS && LS.canonicalGroup) ? LS.canonicalGroup(g) : g; } catch (e) { return g; } };
    return !!a && !!b && canon(a) === canon(b);
  }
  function applyShelter(o) {
    const profile = o.profile;
    const house = o.house;
    const need = shelterNeed(profile, o.name);
    if (!need) return refuse('notInNeed');
    if ((Number(o.opinion) || 0) < SHELTER_MIN_OPINION) return refuse('hostile');
    if (!house || !house.group) return refuse('noHome');
    const LS = window.NPCLifeSim;
    const rec = LS && LS.getRecord ? LS.getRecord(o.name) : null;
    const from = profile._homeGroupName || (rec && rec.homeGroup) || null;
    let moved = false;
    if (!sameTown(from, house.group)) {
      if (!LS || !LS.relocate || (LS.mayRelocate && !LS.mayRelocate(o.name))) return refuse('cantMove');
      let res = null;
      try { res = LS.relocate(o.name, { toGroup: house.group, reason: 'freshStart', force: true }); } // i18n-ignore: MOVE_REASONS id
      catch (e) { res = null; }
      if (!res) return refuse('cantMove');
      moved = true;
    }
    const home = {
      key: `party|${house.key}`, mapId: house.mapId, x: house.x, y: house.y, seed: hash(house.key),
      poolName: 'houses', capacity: 1, partyOwned: true, groupName: house.group, // i18n-ignore: house pool id
    };
    const NS = window.NPCSim;
    let housed = null;
    try { housed = (NS && NS.resettle) ? NS.resettle(o.name, house.group, home) : null; } catch (e) { housed = null; }
    if (!housed) {
      profile.homeBuilding = Object.assign({ floorIndex: 0 }, home);
      profile.homeSeed = home.seed;
      profile._homeGroupName = house.group;
    }
    profile.isHomeless = false;
    delete profile._sleepsRough;
    profile._shelteredBy = house.key;
    if (rec && rec.refugee && rec.refugee.status !== RETURNED) {
      rec.refugee.status = SETTLED;
      rec.refugee.sheltered = true;
    }
    try { if (LS && LS.logEvent) LS.logEvent(o.name, now(), 'move', 'NPCLife.event.sheltered', { place: house.place }); } // i18n-ignore: life event type
    catch (e) { /* the biography is optional */ }
    if (o.addOpinion) o.addOpinion(SHELTER_OPINION);
    stamp(profile, 'shelter', house.key);
    return outcome({ deltaOpinion: SHELTER_OPINION, need, moved, place: house.place });
  }

  // ── Challenge to a game ──────────────────────────────────────────────────
  function minigamePlay() { return (window.NPCSim && window.NPCSim.MinigamePlay) || null; }
  function specOfGame(game) {
    const MP = minigamePlay();
    const def = MP && MP.GAMES && MP.GAMES[game];
    return (def && def.spec) || (GAMES[game] && GAMES[game].spec) || null;
  }
  // The seat-games standing on this map: { game: eventId }. Read when the
  // sheet opens, never per frame.
  function gamesOnMap() {
    const MP = minigamePlay();
    const out = {};
    if (!MP || !MP.kindOf || typeof $gameMap === 'undefined' || !$gameMap || !$gameMap.events) return out;
    for (const ev of $gameMap.events() || []) {
      if (!ev || ev._erased) continue;
      let game = null;
      try { game = MP.kindOf(ev); } catch (e) { game = null; }
      if (game && GAMES[game] && GAMES[game].seat && out[game] == null) out[game] = ev.eventId();
    }
    return out;
  }
  function isGambler(profile, name) {
    const A = addictions();
    try { return !!(A && A.isGambler && A.isGambler(profile, name)); } catch (e) { return false; }
  }
  function challengeGames(profile, name, actor, here) {
    const MP = minigamePlay();
    const onMap = here || {};
    return GAME_ORDER.filter(g => {
      if (!MP || !MP.canPlay || !(MP.GAMES && MP.GAMES[g])) return true;
      try { return MP.canPlay(profile, name, g); } catch (e) { return true; }
    }).map(game => {
      const spec = specOfGame(game);
      return { game, spec, specName: specLabel(spec), you: specLevelOf(actor, spec), them: npcSpecLevel(profile, spec),
        here: onMap[game] != null, eventId: onMap[game] ?? null };
    });
  }
  function acceptChance(profile, name, opinion, stake) {
    const gambler = isGambler(profile, name);
    let p = 0.55 + (Number(opinion) || 0) / 200 + ((profile && (profile.leisure ?? 100) < 40) ? 0.15 : 0) +
      (gambler ? 0.2 : 0);
    if (stake > 0) {
      const pocket = Math.max(0, Number(profile && profile.money) || 0);
      if (gambler) p += 0.15;
      else {
        p -= 0.2;
        if (stake > pocket * BET_SHARE) p -= 0.3;
      }
    }
    return clamp(p, 0.05, 0.95);
  }
  function betOptions(profile, name) {
    if (!modeAllows('hasEconomy') || !mayHoldMoney(profile, name)) return [];
    let gold = 0;
    try { gold = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.gold() : 0; } catch (e) { gold = 0; }
    const pocket = Math.max(0, Number(profile && profile.money) || 0);
    const cap = pocket * (isGambler(profile, name) ? BET_SHARE_GAMBLER : BET_SHARE * 2);
    return BET_STEPS.map(stake => ({
      stake, price: money(stake),
      reason: stake > gold ? 'cantBet' : stake > cap ? 'theyCantBet' : null, // i18n-ignore: reason ids
    }));
  }
  function skillScore(specLv, agi, level) {
    const lv = Math.max(1, Number(level) || 1);
    const a = Number(agi) || lv * 5;
    return 0.08 * ((Number(specLv) || 1) - 1) + 0.15 * clamp(a / (lv * 5) - 1, -1, 1);
  }
  // The speaker's odds against them, 0.1 .. 0.9.
  function winChance(actor, profile, game) {
    const spec = specOfGame(game);
    const you = skillScore(specLevelOf(actor, spec), actor && actor.agi, actor && actor.level);
    const them = skillScore(npcSpecLevel(profile, spec), profile && profile.agi, profile && profile.level);
    return clamp(0.5 + you - them, 0.1, 0.9);
  }
  // won | lost | draw, the speaker's side of it.
  function resolveChallenge(actor, profile, game, rand) {
    const p = winChance(actor, profile, game);
    const roll = (rand || Math.random)();
    if (Math.abs(roll - p) < 0.04) return 'draw'; // i18n-ignore: result id
    return roll < p ? 'won' : 'lost'; // i18n-ignore: result ids
  }
  const FLIP = { won: 'lost', lost: 'won', draw: 'draw' };
  function applyChallenge(o) {
    const profile = o.profile;
    const r = o.rand || Math.random;
    if (!profile) return refuse('declined');
    if ((Number(o.opinion) || 0) < CHALLENGE_MIN_OPINION) return refuse('hostile');
    if (recent(profile, 'challenge', 1) > 0) return refuse('playedToday');
    const stake = Math.max(0, Math.floor(Number(o.stake) || 0));
    if (stake > 0) {
      const bet = betOptions(profile, o.name).find(b => b.stake === stake);
      if (!bet || bet.reason) return refuse(bet ? bet.reason : 'cantBet');
    }
    stamp(profile, 'challenge', o.game);
    if (r() >= acceptChance(profile, o.name, o.opinion, stake)) return refuse('declined');
    const result = resolveChallenge(o.actor, profile, o.game, r);
    let net = 0;
    if (stake > 0 && result !== 'draw') {
      net = result === 'won' ? stake : -stake;
      try { if (net > 0) $gameParty.gainGold(net); else $gameParty.loseGold(-net); } catch (e) { /* no purse, no bet */ }
      profile.money = Math.max(0, (Number(profile.money) || 0) - net);
    }
    if (stake > 0 && isGambler(profile, o.name)) {
      const A = addictions();
      try { A.relieve(profile, GAMBLING, BET_RELIEF); } catch (e) { /* no meter */ }
    }
    const MP = minigamePlay();
    const theirs = FLIP[result];
    const MO = window.MinigameOpponent;
    try {
      if (MO && MO.payFun) MO.payFun({ kind: 'npc', name: o.name }, MP && MP.funDelta ? MP.funDelta(theirs) : undefined, { quiet: true, signed: true }); // i18n-ignore: stand-in kind
    } catch (e) { /* fun is optional */ }
    try { const MF = window.MinigameFun; if (MF && MF[result]) MF[result]({ actor: o.actor, gambling: stake > 0 }); } catch (e) { /* fun is optional */ }
    const spec = specOfGame(o.game);
    try { const Sp = window.NPCSim && window.NPCSim.Specs; if (Sp && Sp.practice && spec) Sp.practice(profile, o.name, spec, 0.25); } catch (e) { /* practice is optional */ }
    const deltaOpinion = CHALLENGE_OPINION[result] || 0;
    if (o.addOpinion) o.addOpinion(deltaOpinion);
    const xp = spec ? award(spec, CHALLENGE_XP[result] || 0, o.actor) : 0;
    return outcome({ deltaOpinion, money: net, xp, result, stake, game: o.game });
  }
  // A real table on this map: the next seat-game to ask who is across the
  // table is handed this person (MinigameOpponent.pin).
  function pinOpponent(name) {
    const MO = window.MinigameOpponent;
    if (!MO || !MO.pin) return false;
    MO.pin({ kind: 'npc', name, actorId: 0 }); // i18n-ignore: stand-in kind
    return true;
  }

  // ── Introduce to someone ─────────────────────────────────────────────────
  function isSingle(name) {
    const LS = window.NPCLifeSim;
    const rec = LS && LS.getRecord ? LS.getRecord(name) : null;
    if (!rec || rec.partner || rec.child || rec.nonSentient) return false;
    return !rec.maritalStatus || SINGLE.includes(rec.maritalStatus);
  }
  function isBubbaromantic(name, profile) {
    const R = window.NPCRomance;
    try { return !!(R && R.orientation && R.orientation(name, profile)?.romantic?.key === BUBBAROMANTIC); }
    catch (e) { return false; }
  }
  function mayBeIntroduced(name, profile) {
    if (!profile || !name || isExemptName(name) || profile._killed) return false;
    if (isBeast(profile, name) || isChild(profile, name) || isBubbaromantic(name, profile)) return false;
    if (isStoryName(name)) return false;
    return isSingle(name);
  }
  function introduceChance(subjectOpinion, candOpinion, bond, matchLv) {
    return clamp(0.35 + (Number(subjectOpinion) || 0) / 250 + (Number(candOpinion) || 0) / 250 +
      (Number(bond) || 0) / 200 + ((Number(matchLv) || 1) - 1) * 0.08, 0.05, 0.9);
  }
  // Every single the party knows (somebody holds an opinion of the party)
  // whom both people would have. `opinionOf(profile)` is the speaker's
  // standing with a candidate; `skip(name)` drops a name the scene rules out.
  function introduceCandidates(o) {
    const LS = window.NPCLifeSim;
    const soc = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._npcSociety) || {};
    const out = [];
    if (!LS || !LS.mayPair || !mayBeIntroduced(o.name, o.profile)) return out;
    const matchLv = specLevelOf(o.actor, SPEC.introduce);
    const party = new Set();
    try { for (const m of $gameParty.members()) if (m) party.add(m.name()); } catch (e) { /* no party */ }
    for (const [n, p] of Object.entries(soc)) {
      if (n === o.name || party.has(n) || !p || !p.opinions || !Object.keys(p.opinions).length) continue;
      if (o.skip && o.skip(n, p)) continue;
      if (!mayBeIntroduced(n, p)) continue;
      let ok = false;
      try { ok = LS.mayPair(o.name, n); } catch (e) { ok = false; }
      if (!ok) continue;
      const candOpinion = o.opinionOf ? (Number(o.opinionOf(p)) || 0) : 0;
      const bond = Number(o.profile.relationships && o.profile.relationships[n] && o.profile.relationships[n].opinion) || 0;
      const chance = introduceChance(o.opinion, candOpinion, bond, matchLv);
      out.push({ name: n, candOpinion, bond, chance: Math.round(chance * 100) });
      if (out.length >= INTRODUCE_MAX * 4) break;
    }
    return out.sort((a, b) => (b.chance - a.chance) || (a.name < b.name ? -1 : 1)).slice(0, INTRODUCE_MAX);
  }
  function applyIntroduce(o) {
    const LS = window.NPCLifeSim;
    if (!LS || !LS.introduceCouple) return refuse('noMatch');
    if ((Number(o.opinion) || 0) < INTRODUCE_MIN_OPINION) return refuse('distant');
    if (recent(o.profile, 'introduce', 1) > 0) return refuse('matchedToday');
    if (!mayBeIntroduced(o.name, o.profile) || !mayBeIntroduced(o.other, o.otherProfile)) return refuse('notSingle');
    stamp(o.profile, 'introduce', o.other);
    const chance = introduceChance(o.opinion, o.otherOpinion, o.bond, specLevelOf(o.actor, SPEC.introduce));
    if ((o.rand || Math.random)() >= chance) {
      if (o.addOpinion) o.addOpinion(INTRODUCE_FAILED);
      return outcome({ ok: false, reason: 'noSpark', deltaOpinion: INTRODUCE_FAILED, chance });
    }
    let couple = null;
    try { couple = LS.introduceCouple(o.name, o.other, now(), o.byName || ''); } catch (e) { couple = null; }
    if (!couple) return refuse('noMatch');
    if (o.addOpinion) o.addOpinion(INTRODUCE_OPINION);
    if (o.addOtherOpinion) o.addOtherOpinion(INTRODUCE_OPINION);
    const xp = award(SPEC.introduce, INTRODUCE_XP, o.actor);
    return outcome({ deltaOpinion: INTRODUCE_OPINION, xp, chance, kind: couple.kind, style: couple.style });
  }

  // ── Rumours and news ─────────────────────────────────────────────────────
  function rumourCandidates(profile, name, rand) {
    const out = [];
    const NC = window.NPCConversation;
    let facts = null;
    try { facts = NC && NC.WorldFacts && NC.WorldFacts.get ? NC.WorldFacts.get() : null; } catch (e) { facts = null; }
    if (facts && modeAllows('hasWars')) {
      for (const w of (facts.wars || []).slice(0, 3)) {
        if (w && w.attacker && w.defender) out.push({ kind: 'war', w: 3, params: { a: label(w.attacker), b: label(w.defender) } });
      }
    }
    if (facts) {
      for (const c of (facts.hordeHolds || []).slice(0, 2)) out.push({ kind: 'horde', w: 2, params: { country: label(c) } });
    }
    if (modeAllows('hasPolitics') && NC && NC.ElectionClock && NC.ElectionClock.current) {
      let ec = null;
      try { ec = NC.ElectionClock.current(profile); } catch (e) { ec = null; }
      if (ec && ec.daysTo != null && ec.daysTo <= ELECTION_NEWS_DAYS) {
        out.push({ kind: 'election', w: 2 + (Number(ec.weight) || 0),
          params: { power: label(ec.power), days: ec.daysTo, party: label(ec.party || ''), rival: label(ec.rival || '') } });
      }
      if (ec && ec.daysSince != null && ec.daysSince <= RUMOUR_NEWS_DAYS && ec.winner) {
        out.push({ kind: 'electionResult', w: 2, params: { power: label(ec.power), winner: label(ec.winner) } });
      }
    }
    const ES = window.EpidemicSystem;
    try {
      for (const e of ((ES && ES.active) ? ES.active() : []).slice(0, 2)) {
        const disease = e && (e.diseaseName || (e.diseaseId != null ? diseaseName(e.diseaseId) : e.name));
        if (disease) out.push({ kind: 'epidemic', w: 2, params: { disease } });
      }
    } catch (e) { /* no outbreaks known */ }
    if (modeAllows('hasEconomy') && !(worldModes() && worldModes().stocksFrozen && worldModes().stocksFrozen())) {
      try {
        const SS = window.StockSociety;
        for (const l of (SS && SS.listings) ? SS.listings() : []) {
          if (!l || !(l.centre > 0)) continue;
          const drift = l.price / l.centre - 1;
          if (Math.abs(drift) >= MARKET_MOVE) {
            out.push({ kind: drift > 0 ? 'marketUp' : 'marketDown', w: 1.5, params: { company: l.name } });
          }
        }
      } catch (e) { /* the market is closed */ }
    }
    const W = window.NPCWorldWeb;
    try {
      const cutoff = now() - RUMOUR_NEWS_DAYS * MINUTES_PER_DAY;
      const home = profile && profile._homeGroupName;
      let n = 0;
      for (const entry of (W && W.getWorldLog) ? W.getWorldLog() : []) {
        if (!entry || (entry.minute ?? 0) < cutoff) continue;
        const news = W.textOf ? W.textOf(entry) : '';
        if (!news) continue;
        out.push({ kind: 'town', w: entry.group && entry.group === home ? 2 : 1, params: { news } });
        if (++n >= 3) break;
      }
    } catch (e) { /* no town news */ }
    let generic = [];
    try { generic = window.T && window.T.pool ? window.T.pool('Rumors.generic') || [] : []; } catch (e) { generic = []; }
    if (generic.length) {
      const r = rand || Math.random;
      // The bank marks its topics in [brackets] for the dialogue box; said aloud they are plain words.
      const rumour = String(generic[Math.floor(r() * generic.length)] || '').replace(/\[([^\]]+)\]/g, '$1');
      out.push({ kind: 'generic', w: 1, params: { rumour } });
    }
    return out;
  }
  function pickRumour(cands, rand) {
    const total = cands.reduce((s, c) => s + (c.w > 0 ? c.w : 0), 0);
    if (!(total > 0)) return null;
    let roll = (rand || Math.random)() * total;
    for (const c of cands) {
      roll -= c.w > 0 ? c.w : 0;
      if (roll <= 0) return c;
    }
    return cands[cands.length - 1];
  }
  // The line they say it in: the bank's, in their personality's voice, and
  // framed by their creed family (CreedVoice.exempt keeps Em, Bubba, children
  // and beasts out of it).
  function rumourLine(pick, variant, profile, name, rand) {
    if (!pick) return line('talk.rumours.nothing', variant, {}, rand);
    let said = line(`talk.rumours.${pick.kind}`, variant, pick.params, rand);
    const NC = window.NPCConversation;
    const own = variant === 'em' || variant === 'bubba';
    if (!own && NC) {
      try {
        const pers = NC._personalityNameOf ? NC._personalityNameOf(profile) : null;
        if (pers && NC.applyVoice) said = NC.applyVoice(said, pers, 0.4) || said;
      } catch (e) { /* plain */ }
      try {
        if (NC.CreedVoice && NC.CreedVoice.decorate) {
          said = NC.CreedVoice.decorate(said, profile, CREED_TOPIC[pick.kind] || 'flavour', 0.5, pick.params, name) || said; // i18n-ignore: bank key
        }
      } catch (e) { /* plain */ }
    }
    return said;
  }
  function applyRumours(o) {
    const profile = o.profile;
    if (!profile) return refuse('hostile');
    if ((Number(o.opinion) || 0) < RUMOUR_MIN_OPINION) return refuse('hostile');
    if (recent(profile, 'rumours', 1) >= RUMOUR_DAILY) return refuse('noNews');
    const pick = pickRumour(rumourCandidates(profile, o.name, o.rand), o.rand);
    const said = rumourLine(pick, o.variant, profile, o.name, o.rand);
    stamp(profile, 'rumours', pick ? pick.kind : '');
    if (o.addOpinion) o.addOpinion(RUMOUR_OPINION);
    const xp = award(SPEC.rumours, RUMOUR_XP, o.actor);
    return outcome({ deltaOpinion: RUMOUR_OPINION, xp, kind: pick ? pick.kind : null, lines: said ? [said] : [] });
  }

  const Help = {
    HOSTILE, FIX_DAILY, INTERVENE_DAYS, INTERVENE_COOLDOWN_DAYS, INTERVENE_MIN_OPINION, SHELTER_MIN_OPINION,
    CHALLENGE_MIN_OPINION, BET_STEPS, INTRODUCE_MIN_OPINION, RUMOUR_DAILY, RUMOUR_MIN_OPINION,
    FIRST_AID_OPINION, FIRST_AID_OWN_WORK, FIRST_AID_SHARE, SHELTER_OPINION, SPEC, GAMES,
    text, line, money, replyVariant, recent, stamp, modeAllows, isBeast, isChild, isExemptName, isStoryName, mayHoldMoney,
    hurtOf, healOf, isHealItem, isMedicineItem, treatOptions, treatOpinion, applyTreat,
    untreatedIllnesses, medicineOptions, applyMedicine,
    isDowned, firstAidOpinion, applyFirstAid,
    habitsOf, fixOptions, applyFix, interveneChance, interveneOptions, applyIntervene,
    shelterNeed, groupOfHouse, shelterOptions, applyShelter,
    specOfGame, gamesOnMap, isGambler, challengeGames, acceptChance, betOptions, winChance, resolveChallenge,
    applyChallenge, pinOpponent,
    isSingle, mayBeIntroduced, introduceChance, introduceCandidates, applyIntroduce,
    rumourCandidates, pickRumour, rumourLine, applyRumours,
  };
  if (window.NPCEmpathize) window.NPCEmpathize.Help = Help;
})();
// <<< EMPATHIZE HELP <<<
// >>> EMPATHIZE ACCUSE (the Accuse verb) >>>
// ============================================================================
// SECTION 13, ACCUSE (NPCEmpathize.Accuse)
// ============================================================================
// Pointing at somebody and naming a crime. It is words and nothing else: no
// charge is filed, nobody's bounty or heat moves and window.playerCrimes is
// never touched, so CrimeSystem is not called at all. What it does move is how
// the accused feels about the one who said it.
//
//   the list      every preset crime (js/db/Messages/PresetCrimes.json, the
//                 one catalogue CrimeSystem and NPCLifeSim both charge from),
//                 named in the player's language through crime.<id>.name
//   an NPC        their opinion of the speaker falls by 15 to 35, by how
//                 grave the crime is (its bounty, on a log scale) and by their
//                 personality; accusing the same person again inside a week
//                 stacks at a diminishing rate; once a day per person
//   the reply     a guilty flinch when the crime is really on their record
//                 (NPCLifeSim criminalRecord), laughter for the absurd ones
//                 (the gravest crimes nobody on a street has committed), else
//                 denial, anger or shock by how well they thought of them
//   a member      the same drop on the member's own opinion of the speaker
//                 (their society profile, the one PartyBanter reads), in their
//                 own lines; Em and Bubba take it on their bond instead
//   yourself      an introspective line and nothing else
//
// A child is never offered the verb (the builder's CHILD_KEEP leaves it off:
// no crime is minor enough to throw at a child), nor is a beast, which cannot
// understand it, nor a visitor from another savegame.
(() => {
  'use strict';

  const ROOT = 'Empathize.act';
  const BANK = 'ConvActions';
  const MINUTES_PER_DAY = 1440;
  const DROP_MIN = 15;
  const DROP_MAX = 35;
  const BOUNTY_FLOOR = 15;           // the cheapest preset crime
  const BOUNTY_CEIL = 1000000;       // the dearest
  const MULT_RANGE = [0.7, 1.4];     // how far a personality bends the drop
  const STACK_DAYS = 7;              // accusations this recent pile up
  const STACK_DECAY = 0.6;           // each earlier one leaves this much of the next
  const COOLDOWN_DAYS = 1;
  const LAUGH_SHARE = 0.5;           // an absurd charge laughed off stings less
  const ABSURD_BOUNTY = 20000;       // 200 euros of bounty and up: war crimes, treason
  const SHOCK_OPINION = 40;          // a friend is shocked
  const ANGER_OPINION = -20;         // somebody cold is angry
  const PAIR_SHARE = 0.5;            // Em and Bubba take half of it on their bond
  const HISTORY_CAP = 12;
  const LIFE_EVENT = 'relationship'; // i18n-ignore: NPCLife event type
  // i18n-ignore-start: reaction ids, PresetCrimes category ids
  const REACTIONS = ['deny', 'anger', 'shock', 'flinch', 'laugh'];
  const MEMBER_REACTIONS = ['hurt', 'anger', 'laugh'];
  const ABSURD_CATEGORIES = ['State Crimes'];
  // i18n-ignore-end

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function now() {
    try { return (typeof $gameVariables !== 'undefined' && $gameVariables) ? (Number($gameVariables.value(114)) || 0) : 0; }
    catch (e) { return 0; }
  }
  function text(key, params) {
    return window.T ? window.T(`${ROOT}.${key}`, params) : key;
  }
  function has(key) {
    try { return !!(window.T && window.T.has && window.T.has(key)); } catch (e) { return false; }
  }
  function tree(key) {
    try { return window.T && window.T.obj ? window.T.obj(`${BANK}.${key}`) : null; } catch (e) { return null; }
  }
  function alt(str, rand) {
    let out = String(str == null ? '' : str);
    for (let guard = 0; guard < 64 && out.indexOf('{') >= 0; guard++) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const parts = body.split('|');
        return parts[Math.floor((rand || Math.random)() * parts.length)];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  }
  function fill(str, params) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (whole, name) =>
      (params && Object.prototype.hasOwnProperty.call(params, name)) ? String(params[name]) : whole);
  }
  // A line of ConvActions.rough.accuse.<key>, in the variant asked for or
  // the default one, so a missing Em or Bubba line never leaves it silent.
  function line(key, variant, params, rand) {
    const root = tree(`rough.accuse.${key}`);
    let pool = [];
    if (Array.isArray(root)) pool = root;
    else if (root && typeof root === 'object') {
      const ok = (n) => (Array.isArray(n) && n.length ? n : null);
      pool = ok(variant && root[variant]) || ok(root.default) || [];
    }
    if (!pool.length) return '';
    const r = rand || Math.random;
    return alt(fill(pool[Math.floor(r() * pool.length)], params), r);
  }

  // ── The catalogue ──────────────────────────────────────────────────────
  function presetCrimes() {
    const m = window.Messages && window.Messages.PresetCrimes;
    return (m && typeof m === 'object') ? m : {};
  }
  function crimeName(key) {
    const c = presetCrimes()[key];
    if (!c) return String(key || '');
    const k = c.name_int || `crime.${String(key).toLowerCase()}.name`; // i18n-ignore: i18n key
    return has(k) ? window.T(k) : (c.name || String(key));
  }
  function categoryLabel(category) {
    const id = String(category || '').replace(/[^A-Za-z]/g, '');
    const k = `${ROOT}.rough.category.${id}`;
    return has(k) ? window.T(k) : String(category || '');
  }
  // Every crime, lightest first inside each category.
  function crimeOptions() {
    const rows = Object.entries(presetCrimes()).map(([key, c]) => ({
      key, name: crimeName(key), bounty: Number(c.bounty) || 0,
      category: c.category || '', categoryLabel: categoryLabel(c.category),
    }));
    const order = [];
    for (const r of rows) if (!order.includes(r.category)) order.push(r.category);
    rows.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || (a.bounty - b.bounty));
    return rows;
  }
  function crimeOf(key) {
    const c = presetCrimes()[key];
    return c ? { key, name: crimeName(key), bounty: Number(c.bounty) || 0, category: c.category || '' } : null;
  }
  // 0 for the pettiest crime there is, 1 for the gravest.
  function severity(bounty) {
    const b = Math.max(BOUNTY_FLOOR, Number(bounty) || 0);
    return clamp(Math.log(b / BOUNTY_FLOOR) / Math.log(BOUNTY_CEIL / BOUNTY_FLOOR), 0, 1);
  }
  function isAbsurd(crime) {
    return !!crime && (crime.bounty >= ABSURD_BOUNTY || ABSURD_CATEGORIES.includes(crime.category));
  }

  // ── Who has really done it ─────────────────────────────────────────────
  function npcGuilty(name, key) {
    const LS = window.NPCLifeSim;
    let rec = null;
    try { rec = LS && LS.getRecord ? LS.getRecord(name) : null; } catch (e) { rec = null; }
    return !!(rec && Array.isArray(rec.criminalRecord) && rec.criminalRecord.some(c => c && c.key === key));
  }
  // The party's own record, read and never written.
  function partyGuilty(key) {
    const list = (typeof window !== 'undefined' && Array.isArray(window.playerCrimes)) ? window.playerCrimes : [];
    return list.some(c => c === key || (c && typeof c === 'object' && (c.id === key || c.crimeId === key)));
  }

  // ── How often, and how hard ────────────────────────────────────────────
  // Accusations are remembered per speaker and per accused, for everybody
  // (a party member has no event log of their own to count them in).
  function historyStore() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
    return ($gameSystem._empAccusals = $gameSystem._empAccusals || {});
  }
  function historyKey(speakerId, target) { return `${speakerId}>${target}`; }
  function recentCount(speakerId, target, days, at) {
    const list = historyStore()[historyKey(speakerId, target)] || [];
    const cutoff = (at == null ? now() : at) - days * MINUTES_PER_DAY;
    return list.filter(m => (Number(m) || 0) > cutoff).length;
  }
  function remember(speakerId, target, at) {
    const store = historyStore();
    const k = historyKey(speakerId, target);
    const list = store[k] = Array.isArray(store[k]) ? store[k] : [];
    list.push(at == null ? now() : at);
    if (list.length > HISTORY_CAP) list.splice(0, list.length - HISTORY_CAP);
  }
  function onCooldown(speakerId, target, at) {
    return recentCount(speakerId, target, COOLDOWN_DAYS, at) > 0;
  }
  // opts: { bounty, mult, repeats, reaction }. A positive number of points.
  function dropFor(o) {
    const m = clamp(Number(o.mult) || 1, MULT_RANGE[0], MULT_RANGE[1]);
    let d = clamp((DROP_MIN + (DROP_MAX - DROP_MIN) * severity(o.bounty)) * m, DROP_MIN, DROP_MAX);
    d *= Math.pow(STACK_DECAY, Math.max(0, Number(o.repeats) || 0));
    if (o.reaction === 'laugh') d *= LAUGH_SHARE; // i18n-ignore: reaction id
    return Math.max(1, Math.round(d));
  }
  // opts: { crime, guilty, opinion, rand }.
  function reactionOf(o) {
    if (o.guilty) return 'flinch';
    if (isAbsurd(o.crime)) return 'laugh';
    const op = Number(o.opinion) || 0;
    if (op >= SHOCK_OPINION) return 'shock';
    if (op <= ANGER_OPINION) return 'anger';
    const r = (o.rand || Math.random)();
    return r < 0.5 ? 'deny' : r < 0.8 ? 'anger' : 'shock';
  }
  function memberReactionOf(o) {
    if (isAbsurd(o.crime) && !o.guilty) return 'laugh';
    return (Number(o.opinion) || 0) >= SHOCK_OPINION ? 'hurt' : 'anger';
  }

  // ── The three targets ──────────────────────────────────────────────────
  // opts: { name, profile, speakerId, speakerName, crimeKey, opinion, mult,
  //         pair, addOpinion, addBond, rand }.
  function accuseNpc(o) {
    const crime = crimeOf(o.crimeKey);
    if (!crime || !o.name) return { ok: false, reason: 'noCrime' };
    const target = `npc:${o.name}`;
    const at = now();
    if (onCooldown(o.speakerId, target, at)) return { ok: false, reason: 'accusedToday' };
    const repeats = recentCount(o.speakerId, target, STACK_DAYS, at);
    const guilty = npcGuilty(o.name, crime.key);
    const reaction = reactionOf({ crime, guilty, opinion: o.opinion, rand: o.rand });
    const drop = dropFor({ bounty: crime.bounty, mult: o.mult, repeats, reaction });
    const bond = o.pair ? Math.max(1, Math.round(drop * PAIR_SHARE)) : 0;
    if (o.pair) { if (o.addBond) o.addBond(-bond); } else if (o.addOpinion) o.addOpinion(-drop);
    remember(o.speakerId, target, at);
    if (o.profile) {
      (o.profile.eventLog = Array.isArray(o.profile.eventLog) ? o.profile.eventLog : []).push({
        tag: 'action_accuse', desc: `${crime.key} (-${o.pair ? bond : drop})`, timestamp: Date.now(), gameMin: at,
      });
    }
    try {
      const LS = window.NPCLifeSim;
      if (LS && LS.logEvent) LS.logEvent(o.name, at, LIFE_EVENT, 'NPCLife.event.accusedBy',
        { by: o.speakerName || '', crime: crime.name.toLowerCase() });
    } catch (e) { /* no life record: the grudge still stands */ }
    return { ok: true, crime, guilty, reaction, repeats, drop: o.pair ? 0 : drop, bond, target: 'npc' };
  }
  // opts: { member, profile, speakerId, speakerName, crimeKey, opinion, mult,
  //         pair, addOpinion, addBond }.
  function accuseMember(o) {
    const crime = crimeOf(o.crimeKey);
    const memberId = o.member && o.member.actorId ? o.member.actorId() : null;
    if (!crime || memberId == null) return { ok: false, reason: 'noCrime' };
    const target = `actor:${memberId}`;
    const at = now();
    if (onCooldown(o.speakerId, target, at)) return { ok: false, reason: 'accusedToday' };
    const repeats = recentCount(o.speakerId, target, STACK_DAYS, at);
    const guilty = partyGuilty(crime.key);
    const reaction = memberReactionOf({ crime, guilty, opinion: o.opinion });
    const drop = dropFor({ bounty: crime.bounty, mult: o.mult, repeats, reaction });
    const bond = o.pair ? Math.max(1, Math.round(drop * PAIR_SHARE)) : 0;
    let moved = false;
    if (o.pair) { if (o.addBond) { o.addBond(-bond); moved = true; } }
    else if (o.profile && o.addOpinion) { o.addOpinion(-drop); moved = true; }
    remember(o.speakerId, target, at);
    return { ok: true, crime, guilty, reaction, repeats, drop: (!o.pair && moved) ? drop : 0, bond, moved,
      target: 'member' };
  }
  // opts: { crimeKey }. Nothing moves.
  function accuseSelf(o) {
    const crime = crimeOf(o && o.crimeKey);
    if (!crime) return { ok: false, reason: 'noCrime' };
    return { ok: true, crime, guilty: partyGuilty(crime.key), reaction: null, drop: 0, bond: 0, target: 'self' };
  }

  const Accuse = {
    DROP_MIN, DROP_MAX, STACK_DAYS, STACK_DECAY, COOLDOWN_DAYS, ABSURD_BOUNTY, LAUGH_SHARE, PAIR_SHARE,
    REACTIONS, MEMBER_REACTIONS,
    text, line, crimeOptions, crimeOf, crimeName, categoryLabel, severity, isAbsurd,
    npcGuilty, partyGuilty, recentCount, onCooldown, dropFor, reactionOf, memberReactionOf,
    accuseNpc, accuseMember, accuseSelf,
  };
  if (window.NPCEmpathize) window.NPCEmpathize.Accuse = Accuse;
})();
// <<< EMPATHIZE ACCUSE <<<
