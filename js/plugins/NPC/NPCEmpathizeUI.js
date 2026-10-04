/*:
 * @target MZ
 * @plugindesc NPCEmpathizeUI v3.0.0, DOM overlay for Scene_NPCEmpathize
 * @author Omni-Lex
 * @help NPCEmpathizeUI.js
 *
 * DOM layer for the NPC Interaction Panel.
 * Must be listed AFTER NPCEmpathize.js in the Plugin Manager.
 *
 * Load Order:
 *   NPCEmpathize → NPCEmpathizeUI
 */

(() => {
  'use strict';

  if (!window.NPCEmpathize?.Scene_NPCEmpathize) {
    throw new Error('NPCEmpathizeUI.js requires NPCEmpathize.js to be loaded first!');
  }

  const { Scene_NPCEmpathize, Wiki } = window.NPCEmpathize;
  const {
    _getNPCName, _getProfile, _extractClassId,
    _resolveBustForActor, _resolveBustPath, _bustUrl, _presetFromEvent,
    _computePartyPredisposition, _medianScore, _generatePartyThoughts,
    _extractContacts, _countRecentInteractions, _lastInteractionDay,
    _joinChance, _joinLevelOk, _travellingPartyCount,
    _animalJoinChance, _wisMod,
    _diseaseVialItems, _diseaseVialId, _infectChance,
    _socialLines, _rand, _vary, _addNpcOpinion, _personalitySocialMult,
    _hygienePenalty, _hygieneReadout,
    _addNpcAttraction, _npcEffectiveAttraction, _computePartyAttraction,
    _emPlaythrough, _isEmActor, _isBubbaNpc, _emContext, _emStanceKey, _emStanceData,
    _emVoiceLine,
    _bubbaPlaythrough, _isBubbaActor, _bubbaContext,
    _pairSide, _pairContext, _pairBond, _addPairBond,
    _isNonSentientActor, _isNonSentientNpc, FERAL_ACTIONS, FUN_ACTIONS,
    _feedKind, _feedCalories, _feedOpinion, _feedItemsInPack,
    _isStoryNpc, STORY_PROTECTED_ACTIONS,
  } = window.NPCEmpathize._helpers;
  const _getT = window.NPCEmpathize._getT;
  const vary = _vary || function (text) {
    if (typeof text !== 'string' || text.indexOf('{') < 0) return text;
    let out = text;
    let guard = 0;
    while (guard++ < 64) {
      const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const parts = body.split('|');
        return parts[Math.floor(Math.random() * parts.length)];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  };

  // ============================================================================
  // FIVE SCREENS, ONE FILE
  // ============================================================================
  // This is not one interface, it is five, and every one of them below is
  // marked with its own SCREEN banner so a change can be aimed at one of them
  // without reading the other four:
  //
  //   1. THE PANEL       the shell, the portrait, the left column and the
  //                      tabbed right page (info, background, routine, health,
  //                      biologics, life history)
  //   2. THE CHAT MODAL  the conversation log, the input row and the inline
  //                      action lists (gift, feed, bribe, steal, directions)
  //   3. THE LEDGER      who this person knows and who they love: the social
  //                      web and the romance record
  //   4. THE ENTITY WIKI a nation, a hyperpower, a faction, a party, a creed,
  //                      an artifact or a historical leader, as an article
  //   5. THE WIKI INDEX  the catalogue those articles are reached from
  //
  // Nothing below draws a colour, a size or a margin of its own. Every one of
  // them is a class in the Empathize kit (css/theme.css); the only style a
  // builder is allowed to write is a CUSTOM PROPERTY for a value the
  // stylesheet cannot know: a bar length, an icon cell, a measured height.
  // test_ui_scroll_theme.js section 13 holds that.
  // ============================================================================

  // ============================================================================
  // Local UI helpers
  // ============================================================================

  function _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A line somebody says in the panel, read the way the message box reads one:
  // every topic and every known name in it taught, and painted gold. Falls back
  // to plain escaped text when DialogueSystem is not loaded.
  function _topicHtml(str) {
    const api = window.DialogueTopics;
    if (!api || typeof api.html !== 'function') return _escapeHtml(str);
    try { return api.html(str); } catch (e) { return _escapeHtml(str); }
  }

  // ============================================================================
  // Creature portraits
  // ============================================================================
  // A creature has no bust and never will: the busts are photographs of people.
  // What it has is a body, so the portrait frame shows the 3D model of it
  // instead , always one its own archetype supports, resolved through
  // NPCCreature from a $dataEnemies entry carrying that archetype. This holds
  // for an NPC met in the street and for a creature party member inspected from
  // the party panel, in any world, not only a monster one.

  // Who the panel is looking at, as { keys, seed, name } , or null when it is a
  // person and the bust is right. `actor` is set in party-member mode, the
  // profile in NPC mode.
  function _creatureSubject(actor, profile, name) {
    const NC = window.NPCCreature;
    if (!NC) return null;
    if (actor) {
      const keys = NC.archetypeKeysOf(actor);
      // A party member is a creature when the creature builder said so, or when
      // it is played as one of the creature classes, or when it simply carries
      // an anatomy that is not a person's.
      // A party member whose portrait art is a bust is drawn as that bust, the
      // same way a `creature: true` NPC sheet with a bust of its own is: the
      // wardrobe's own picture beats the stock model. Only a member whose
      // chosen art IS the model (portraitMode "model") falls through to one.
      const mode = actor.portraitMode ? actor.portraitMode() : 0;
      if (mode !== 'model' && _resolveBustForActor(actor) !== 'img/busts/7.png') return null;
      // A member who picked the 3D Model portrait at creation is drawn by it,
      // a person as much as a creature: the model is their own sculpt, served
      // by window.ActorModel3D (see _creatureModelSpec).
      if (mode === 'model') {
        return { keys: keys.length ? keys : ['Humanoid'], seed: actor.actorId ? actor.actorId() : 0, name: actor.name() }; // i18n-ignore: Archetypes.json key
      }
      const isCreature = !!actor._isCreatureActor ||
        NC.isNonSentientActor(actor) ||
        (keys.length > 0 && !keys.every((k) => (window.HealthCore?.isHumanoidBody ? window.HealthCore.isHumanoidBody(k) : k === 'Humanoid'))); // i18n-ignore: Archetypes.json key
      if (!isCreature || !keys.length) return null;
      return { keys, seed: actor.actorId ? actor.actorId() : 0, name: actor.name() };
    }
    if (!profile) return null;
    const keys = NC.archetypeKeysOf(profile);
    // A sheet that names its own model in NPCs.json (every animal and creature
    // sheet does) is portrayed by that body whether or not the society sim
    // flagged the profile as a creature: an animal standing in the street has
    // never had a bust to show and now has a model that was chosen for it.
    // A `creature: true` sheet was drawn with a face of its own and that face
    // is what the panel shows: the wardrobe's own bust beats the stock model,
    // the same way a person's does. Only the ANIMAL half (a hen, a horse, a
    // dog, none of which has ever had a portrait) and the bestiary sheets of a
    // monster world fall through to a body built in three dimensions.
    if (NC.sheetHalf?.(profile.spriteKey) === 'creature' &&
        (window.WorldGen?.NPCs?.[profile.spriteKey]?.busts || []).length) return null;
    const named = NC.modelKeyForSprite ? NC.modelKeyForSprite(profile.spriteKey) : null;
    if (!named && (!profile.isCreature || !keys.length)) return null;
    return { keys, spriteKey: profile.spriteKey, seed: _hashName(name || ''), name };
  }

  // The anatomy row on the Info tab. Everybody has one: somebody with nothing
  // stored is a plain Humanoid, which is what Health_Core assumes for them
  // everywhere else, so saying so is the truth rather than a blank.
  function _archetypeRowLabel(actor, profile) {
    const NC = window.NPCCreature;
    if (!NC) return '';
    const source = actor || profile;
    if (!source) return '';
    const keys = NC.archetypeKeysOf(source);
    const label = NC.archetypeLabel(keys.length ? keys.join(' / ') : 'Humanoid');
    return label || '';
  }

  function _hashName(str) {
    if (window.NPCShared && window.NPCShared.nameHash) return window.NPCShared.nameHash(str);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return h >>> 0;
  }

  // The model this subject is portrayed by, plus the identity string that says
  // whether a live viewer is still showing the right thing.
  function _creatureModelSpec(subject, actor) {
    if (!subject) return null;
    // A creature in the party is portrayed by the very model the status sheet
    // portrays it by, so the two screens can never disagree about which creature
    // this is. An NPC has no actor behind it and keeps the stock model its
    // anatomy resolves to.
    const AM = window.ActorModel3D;
    if (actor && AM && AM.infoFor) {
      const info = AM.infoFor(actor);
      if (info) return { info: info, id: AM.keyFor(info) };
    }
    const NC = window.NPCCreature;
    // The sheet's own choice of body comes first; the archetype lookup answers
    // only for a subject whose sheet names no model of its own.
    const model = (NC && NC.modelForSprite ? NC.modelForSprite(subject.spriteKey) : null)
      || (NC && NC.modelForArchetypes(subject.keys, subject.seed));
    if (!model) return null;
    return {
      key: model.key,
      enemyData: model.enemyData,
      id: `${subject.name}|${subject.keys.join('/')}|${model.key}|${model.enemyData.id}`,
    };
  }

  // A dossier that ships a 3D model of the person it describes (Em) is portrayed
  // by that model in place of her bust, both as a party member and as the NPC
  // standing on her own map. A party member is resolved through the shared
  // service, so this panel builds the very model the status sheet builds.
  function _presetModelSpec(actor, preset) {
    const CP = window.CharacterPresets;
    if (!CP) return null;
    const path = actor
      ? CP.getActorPresetModel?.(actor)
      : CP.getPresetModel?.(preset);
    if (!path) return null;
    if (window.ActorModel3D?.modelAvailable?.(path) === false) return null;
    const info = { kind: 'glb', path, actorId: actor ? actor.actorId() : 0 };
    return { info, id: window.ActorModel3D?.keyFor?.(info) || `glb:${path}` };
  }

  // ── The speaking portrait ─────────────────────────────────────────────────
  // The message box stands a speaker's 3D model where their bust would go
  // (DialogueSystem.js). Which model portrays somebody is this panel's answer,
  // so it is asked here rather than worked out twice:
  //
  //   specForEvent(ev)    an NPC standing on the map: their dossier's model
  //                       (Em), the model their sheet names in NPCs.json, or
  //                       the body a creature profile is built from. Unlike
  //                       the panel, the sheet's own bust does not outrank a
  //                       model here: a speaker with a body is shown by it.
  //   specForActor(actor) a party member, by the portrait they chose.
  //   build(spec)         Promise of the built battler, or null.
  //
  // Null means "no model: draw the bust".
  function _speakerSpecForEvent(ev) {
    if (!ev || typeof ev.event !== 'function') return null;
    const npcName = window.NPCSim?.npcNameForEvent?.(ev) ?? (ev.event()?.name?.trim() || '');
    const preset = _presetFromEvent(ev);
    const presetSpec = preset ? _presetModelSpec(null, preset) : null;
    if (presetSpec) return presetSpec;
    const NC = window.NPCCreature;
    if (!NC) return null;
    const profile = npcName ? _getProfile(npcName) : null;
    const sheet = (typeof ev.characterName === 'function' && ev.characterName()) || profile?.spriteKey || '';
    const seed = _hashName(npcName || sheet);
    const named = sheet && NC.modelForSprite ? NC.modelForSprite(sheet) : null;
    if (named) {
      return { key: named.key, enemyData: named.enemyData, id: `${npcName}|${sheet}|${named.key}|${named.enemyData.id}` };
    }
    if (!profile || !profile.isCreature) return null;
    const keys = NC.archetypeKeysOf(profile);
    if (!keys.length) return null;
    return _creatureModelSpec({ keys, spriteKey: profile.spriteKey, seed, name: npcName }, null);
  }

  function _speakerSpecForActor(actor) {
    if (!actor) return null;
    return _creatureModelSpec(_creatureSubject(actor, null, actor.name()), actor)
      || _presetModelSpec(actor, null);
  }

  // The same two ways _initPortrait3D builds a spec, shared so the message box
  // builds exactly the body this panel does.
  function _buildSpecModel(spec) {
    if (!spec || typeof THREE === 'undefined' || !window.Battler3D?.create) return Promise.resolve(null);
    if (spec.info && window.ActorModel3D) return Promise.resolve(window.ActorModel3D.build(spec.info));
    const enemyData = spec.enemyData;
    if (!enemyData) return Promise.resolve(null);
    const fake = { enemyId: () => enemyData.id, index: () => 0, enemy: () => enemyData };
    const made = window.Battler3D.create(spec.key, 0, 0, fake);
    if (!made) return Promise.resolve(null);
    return Promise.resolve(made.load(null, 0, 0, 0)).then(() => made);
  }

  window.NPCPortraitModel = {
    specForEvent: _speakerSpecForEvent,
    specForActor: _speakerSpecForActor,
    build: _buildSpecModel,
  };

  // ── The livestock panel ─────────────────────────────────────────────────
  // AnimalGrowth's own copy, read through its i18n file rather than the
  // Empathize one: the words belong to the system that owns the numbers.
  function _TA(key, params) {
    const full = 'AnimalGrowth.panel.' + key;
    if (window.T && window.T.has && window.T.has(full)) return window.T(full, params);
    return key;
  }

  // A key at the top of AnimalGrowth.json rather than inside its panel block.
  function _TAroot(key, params) {
    const full = 'AnimalGrowth.' + key;
    if (window.T && window.T.has && window.T.has(full)) return window.T(full, params);
    return key;
  }

  function _TAn(key, count, params) {
    const full = 'AnimalGrowth.panel.' + key;
    if (window.T && window.T.n) return window.T.n(full, count, params);
    return String(count);
  }

  // One labelled bar. `pct` is 0-100 and `tone` picks the fill colour, so a
  // hungry animal's meter reads as a warning rather than as a statistic.
  function _animalBar(label, pct, note, tone) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    return `<div class="npc-animal-row">
        <div class="npc-animal-label">${_escapeHtml(label)}</div>
        <div class="npc-animal-track"><div class="npc-animal-fill ${tone || ''}" style="--npc-w:${v}%"></div></div>
        <div class="npc-animal-note">${_escapeHtml(note != null ? note : v + '%')}</div>
      </div>`;
  }

  // The block the left column shows for an animal: what it is, how old, how
  // far from grown, how well fed, and where every one of its produce cycles
  // stands. Empty string for anybody who is not livestock.
  function _animalPanelHTML(status) {
    if (!status) return '';
    const rows = [];
    rows.push(`<div class="npc-animal-head">${_escapeHtml(_TA('title'))} , ${_escapeHtml(status.breed)} (${_escapeHtml(status.stageName)})</div>`);
    rows.push(`<div class="npc-animal-line">${_escapeHtml(_TA('age'))}: ${_escapeHtml(status.ageLabel)}</div>`);
    // Whose it is. A farm's stock answers to the farmer of that world square;
    // an animal met anywhere else belongs to nobody.
    rows.push(`<div class="npc-animal-line">${_escapeHtml(_TAroot('owner'))}: ` +
      `${_escapeHtml(status.owner || _TAroot('wildAnimal'))}</div>`);

    if (status.hasBaby) {
      const note = status.growthPct >= 100
        ? _TA('grownAlready')
        : _TAn('daysToAdult', status.daysToAdult);
      rows.push(_animalBar(_TA('growth'), status.growthPct, note));
    }

    rows.push(_animalBar(
      status.hungry ? _TA('hungry') : _TA('nutrition'),
      status.nutritionPct, null, status.hungry ? 'is-low' : ''));

    if (!status.produces.length) {
      rows.push(`<div class="npc-animal-line">${_escapeHtml(_TA('producesNothing'))}</div>`);
    } else {
      for (const p of status.produces) {
        const yieldText = _TA('yield', { min: p.yieldMin, max: p.yieldMax, days: p.intervalDays });
        const note = status.stage !== 'adult'
          ? _TA('notYetAdult')
          : p.ready ? _TA('ready') : _TAn('readyIn', p.daysLeft);
        rows.push(_animalBar(p.name, p.pct, note, p.ready ? 'is-ready' : ''));
        rows.push(`<div class="npc-animal-sub">${_escapeHtml(yieldText)}</div>`);
      }
    }
    if (status.companyValue) {
      rows.push(`<div class="npc-animal-line">${_escapeHtml(_TA('company'))}: +${status.companyValue}</div>`);
    }
    return `<div class="npc-animal-panel">${rows.join('')}</div>`;
  }

  // ── Log timestamps ─────────────────────────────────────────────────────────
  // Every log in the panel counts in minutes since the start of the calendar,
  // and used to be printed as "D2 22:00", a day number nobody can place. The
  // clock plugin owns the calendar, so ask it for the day this actually is.
  function _gameDate(gameMin) {
    const m = Math.max(0, Math.floor(gameMin || 0));
    return window.TimeDateSystem?.getDateTimeFromMinutes?.(m) ?? null;
  }

  // `withTime` adds the hour, `withMinutes` the minute inside it.
  function _gameStamp(gameMin, withTime, withMinutes) {
    const d = _gameDate(gameMin);
    if (!d) {
      const m = Math.max(0, Math.floor(gameMin || 0));
      const hh = String(Math.floor((m % 1440) / 60)).padStart(2, '0');
      const mm = String(Math.floor(m % 60)).padStart(2, '0');
      return withTime ? `${Math.floor(m / 1440)} ${hh}:${withMinutes ? mm : '00'}` : String(Math.floor(m / 1440));
    }
    if (!withTime) return d.dateShort;
    return `${d.dateShort} ${d.hours}:${withMinutes ? d.minutes : '00'}`;
  }

  // A day of "pet, pet, pet, ..." is one line, not twenty-six. Entries are
  // grouped by calendar day and text, in the order they were first written;
  // a group of one keeps its hour, a repeated one shows only the day and how
  // many times it happened.
  function _collapseByDay(entries) {
    const out = [];
    const byKey = new Map();
    for (const e of entries) {
      const day = Math.floor((e.min || 0) / 1440);
      // A separator that cannot occur in a written line. It used to be a
      // literal NUL, which made every plain grep treat this whole file as
      // binary and silently skip it: a search for a key used here came back
      // empty and the key read as dead. U+001F does the same job in text.
      const key = `${day}\u001f${e.text}`;
      const hit = byKey.get(key);
      if (hit) { hit.count++; continue; }
      const g = { text: e.text, count: 1, min: e.min || 0, day };
      byKey.set(key, g);
      out.push(g);
    }
    for (const g of out) g.when = _gameStamp(g.min, g.count === 1);
    return out;
  }

  function _timesSuffix(count) {
    if (!(count > 1)) return '';
    return ` <span class="npc-life-count">${_escapeHtml(T('Empathize.timesRepeated', { n: count }))}</span>`;
  }

  // Every box in the panel that is allowed to scroll, in the order they should
  // be preferred when nothing is under the cursor.
  const _SCROLL_BOXES =
    '.npc-chat-bubbles, .npc-chat-actions-row, .npc-wiki-grid, .npc-right-panel, .npc-vitals-footer, .npc-left-col';

  function _isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll';
  }

  // Nearest ancestor of `node` (stopping at, and excluding, `stopAt`) that can
  // actually be scrolled vertically right now. Used to route wheel ticks by hand,
  // see the overlay's wheel listener.
  function _scrollableUnder(node, stopAt) {
    for (let el = node; el && el !== stopAt; el = el.parentElement) {
      if (_isScrollable(el)) return el;
    }
    return null;
  }

  // Fallback for the wheel guard: the panel's own scroll boxes, hit-tested
  // against the cursor. Used when the wheel event's target is not inside the
  // overlay at all (some other DOM layer sitting on top). Innermost wins, which
  // here just means the shortest matching box.
  function _scrollableAtPoint(root, x, y) {
    if (!(x >= 0) || !(y >= 0)) return null;
    let best = null;
    for (const el of root.querySelectorAll(_SCROLL_BOXES)) {
      if (!_isScrollable(el)) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (!best || r.height < best.getBoundingClientRect().height) best = el;
    }
    return best;
  }

  function _iconSpan(iconIndex, size) {
    size = size || 22;
    const scale = (size / 32).toFixed(4);
    const col   = iconIndex % 16;
    const row   = Math.floor(iconIndex / 16);
    return (
      `<span class="npc-icon" style="--npc-icon-size:${size}px">` +
      `<span class="npc-icon-cell" style="--npc-icon-scale:${scale}; --npc-icon-x:-${col * 32}px; --npc-icon-y:-${row * 32}px"></span></span>`
    );
  }

  // A skill, a trait or a piece of gear listed here raises the very same hover
  // card the character creator raises for it (window.CCTooltip, published by
  // CharacterCreationDossier): one description of a spell in the game, not one
  // per panel. Without the wizard loaded the tag is simply a tag.
  function _ccHover(type, id, qty) {
    return window.CCTooltip ? window.CCTooltip.attrs(type, id, qty) : '';
  }

  function _vitalRow(label, value, lowThreshold) {
    const v     = Math.round(value ?? 100);
    const band  = v < lowThreshold ? 'npc-fill--bad' : 'npc-fill--ok';
    return `
      <div class="npc-vital-row">
        <span class="npc-vital-lbl">${label}</span>
        <div class="npc-vital-track"><div class="npc-vital-fill ${band}" style="--npc-w:${v}%"></div></div>
        <span class="npc-vital-pct">${v}%</span>
      </div>`;
  }

  // A craving is a need read backwards, so its row fills as things get worse
  // and its warning band is the high end. Same numbers the status screen and
  // the parchment menu show, so one addict reads the same in all three.
  function _cravingRow(label, value) {
    const v     = Math.max(0, Math.min(100, Math.round(value ?? 0)));
    const band  = v >= 80 ? 'npc-fill--bad' : v >= 50 ? 'npc-fill--warn' : 'npc-fill--calm';
    return `
      <div class="npc-vital-row">
        <span class="npc-vital-lbl">${label}</span>
        <div class="npc-vital-track"><div class="npc-vital-fill ${band}" style="--npc-w:${v}%"></div></div>
        <span class="npc-vital-pct">${v}%</span>
      </div>`;
  }

  // The same meters for somebody the simulation owns (NPCSim.Addictions): one
  // row per dependency they live with, read off the profile's store without
  // advancing it, and a badge while a meter at the top has nothing to feed it.
  // keysFor already answers none for a child, a beast or a party traveller.
  function _npcCravingRowsHTML(profile, name) {
    const A = window.NPCSim?.Addictions;
    if (!A || !profile) return '';
    let keys = [];
    try { keys = A.keysFor(profile, name) || []; } catch (e) { keys = []; }
    let out = '';
    for (const key of keys) {
      const v = A.craving(profile, key);
      if (v === null || v === undefined) continue;
      out += _cravingRow(_escapeHtml(A.label(key)), v);
    }
    const w = profile._crave?.w;
    if (out && w && keys.includes(w)) {
      out += `<div class="npc-need-badge npc-need-badge--hostile">${_iconSpan(2, 14)}` +
        `<span>${_escapeHtml(window.T('Empathize.dossier.withdrawal', { name: A.label(w) }))}</span></div>`;
    }
    return out;
  }

  const NEED_ICONS = {
    sleep: 11, home: 11, hunger: 259, hygiene: 67, work: 4, shopwork: 4, money: 314,
    crime: 174, safety: 128, comfort: 226, social: 246, leisure: 80,
    shopping: 209, school: 189, traveling: 83, heal: 176,
    tending: 185, animalCare: 267, beekeeping: 340, brewing: 228,
    // The schedule ids the rest of the simulation writes (NPCSim
    // RoutineManager.SITUATION_IDS), labelled under Empathize.activity.
    exploringTower: 322, exploringDungeon: 212, exploringSpace: 78,
    travelling: 83, relocating: 190, 'onLeave.sick': 2, 'onLeave.parental': 84,
    play: 196, fighting: 77, fleeing: 73, downed: 6, recovering: 75, minigame: 191,
    // In the water or on its bank (NPCSim.Water): the wash icon, the rod's own.
    swimming: 67, fishing: 250,
    // A creature's day (NPCSim RoutineManager.creatureDay): asleep and resting
    // on the bed's icon, feeding on the meal's, the hunt on the fight's, the
    // drink and the grooming on the wash, the herd on company's.
    'creature.asleep': 11, 'creature.rest': 11, 'creature.graze': 259, 'creature.forage': 259,
    'creature.hunt': 77, 'creature.wander': 80, 'creature.drink': 67, 'creature.groom': 67,
    'creature.play': 196, 'creature.herd': 246,
  };

  // Empathize.activity.<id> for every schedule id that has one.
  function _situationLabels(T) {
    const out = {};
    const ids = window.NPCSim?.RoutineManager?.SITUATION_IDS || [];
    if (typeof window.T !== 'function' || typeof window.T.has !== 'function') return out;
    for (const id of ids) {
      const key = 'Empathize.activity.' + id;
      if (window.T.has(key)) out[id] = window.T(key);
    }
    return out;
  }

  function _needLabels(T) {
    return Object.assign(_situationLabels(T), {
      sleep: T.atHome || T.resting || 'At Home', home: T.atHome || 'At Home', hunger: T.hungry, hygiene: T.freshening, work: T.working, shopwork: T.working,
      money: T.earning, crime: T.scheming, safety: T.wary, comfort: T.relaxing,
      social: T.socializing, leisure: T.leisure, traveling: T.traveling,
      shopping: T.shopping, school: T.atSchool, heal: T.healing,
      tending: T.tending, animalCare: T.animalCare,
    });
  }

  // Interacting with an NPC while they're riding a PublicTransport-group map
  // (bus/tram/train) shows their current hour as "Traveling", whatever the
  // day's plan had scheduled, since they're plainly not doing that right now.
  // Display only: the answer is the hour to relabel, the routine itself is
  // never written (see Scene_NPCEmpathize.create and _buildRoutineTabHTML).
  function _travelingHourIfOnTransport(eventId) {
    const RM = window.NPCSim?.RoutineManager;
    if (!RM || eventId == null) return null;
    const seatedGroups = window.NPCSystem?.SEATED_GLOBAL_GROUPS;
    if (!seatedGroups?.length) return null;
    const groupName = window.NPCSystem?.findMapGroupByMap?.($gameMap?.mapId());
    if (!groupName || !seatedGroups.includes(groupName)) return null;

    const npcName = _getNPCName(eventId);
    const profile = npcName && _getProfile(npcName);
    if (!profile) return null;
    return RM.hourNow ? RM.hourNow() : Math.floor((($gameVariables?.value(114) ?? 0) % 1440) / 60);
  }

  // "Converting to {creed}: {pct}%" while somebody is being talked round
  // toward another creed (NPCLifeSim CONVERSION), and who is doing it. Empty
  // when nothing is under way.
  // A refugee from the Goblin Horde, or a human living in goblin society
  // (NPCLifeSim REFUGEES). Empty for everybody else.
  function _refugeeRowText(npcName) {
    const st = npcName ? window.NPCLifeSim?.refugeeStatus?.(npcName) : null;
    if (!st) return '';
    if (st.integrated) return window.T('Empathize.hordeIntegrated');
    const key = st.status === 'fleeing' ? 'Empathize.refugeeFleeing' // i18n-ignore: refugee status id
      : st.status === 'camp' ? 'Empathize.refugeeCamp' : 'Empathize.refugeeSettled'; // i18n-ignore: refugee status id
    return window.T(key, { country: st.from || '', year: st.year || '' });
  }

  function _conversionRowText(npcName) {
    const conv = npcName ? window.NPCLifeSim?.conversionOf?.(npcName) : null;
    if (!conv || !(conv.pct > 0)) return '';
    const line = window.T('Empathize.convertingTo', { creed: conv.creed, pct: conv.pct });
    return conv.by ? line + ' ' + window.T('Empathize.convertingBy', { name: conv.by }) : line;
  }

  // Out on a trip ("On the way to Milano, by bike", "Visiting Milano"), or
  // else what they get about on at home (NPCLifeSim TRAVELLING and
  // NPCSim.Vehicles). Empty for somebody on foot and at home.
  function _travelRowText(npcName, profile) {
    const trip = npcName ? window.NPCLifeSim?.travelStatus?.(npcName) : null;
    if (trip && trip.to) {
      const now = $gameVariables?.value(114) ?? 0;
      if (now >= trip.arrivesAtMinute && now < trip.returnLeavesAtMinute) {
        return window.T('Empathize.tripVisiting', { place: trip.to });
      }
      const key = 'Empathize.travelMode.' + trip.mode;
      const mode = window.T(key);
      const place = now < trip.arrivesAtMinute ? trip.to : trip.from;
      return window.T('Empathize.tripOnTheWay', { place, mode: mode !== key ? mode : '' });
    }
    const vehicle = window.NPCSim?.Dev?.vehicleOf?.(profile, npcName);
    return vehicle ? window.T('Empathize.vehicle.' + vehicle) : '';
  }

  function _homeAddressLabel(profile, T) {
    if (!profile) return '';
    if (profile.isHomeless) return T?.homelessLbl || 'Homeless';
    const b = profile.homeBuilding;
    if (!b) return '';

    let mapName = b.mapName;
    if (!mapName && window.NPCSim?.getBuildingMapName) {
      mapName = window.NPCSim.getBuildingMapName(b, profile._homeGroupName || b.groupName);
    }
    if (!mapName && b.mapId === 636) {
      const gName = profile._homeGroupName || b.groupName;
      const grp = gName ? $gameSystem?._npcMapGroups?.[gName] : null;
      mapName = grp?.displayName || window.MapManager?.getMapName?.(636) || T?.frontier || 'Settlement';
    } else if (!mapName && b.mapId) {
      mapName = window.MapManager?.getMapName?.(b.mapId) || ($dataMapInfos?.[b.mapId]?.name) || `Map ${b.mapId}`;
    }

    const coords = (b.x != null && b.y != null) ? `(${b.x}, ${b.y})` : '';
    const floorNum = (b.floorIndex != null ? b.floorIndex : 0) + 1;
    const floorLabel = `${T?.floorLbl || 'Floor'} ${floorNum}`;

    const parts = [];
    if (mapName) parts.push(mapName);
    if (coords) parts.push(`Door ${coords}`);
    if (floorLabel) parts.push(floorLabel);

    return parts.join(' · ');
  }

  // "work"/"shopwork" routine slots get an enriched label with the job name
  // and/or workplace map name when that information is available.
  function _activityLabel(activity, profile, T, needLabels) {
    if (activity === 'work') {
      const job = window.NPCSim?.JobManager?.getJob?.(profile);
      if (job) {
        const mapName = window.NPCSim.JobManager.getJobWorkMapName?.(profile) || '';
        return T.workAs(window.WorkSystem?.jobName?.(job) || job.name, mapName);
      }
    }
    if (activity === 'shopwork') {
      const assign = $gameSystem?._npcShopAssignments?.[profile?._eventName];
      // <ShopName: Ticketman> on the shop event overrides the generic title.
      if (assign) return T.workAsShopkeeper(assign.shopName || T.shopkeeperTitle, assign.mapName);
    }
    if (activity === 'sleep' || activity === 'home') {
      if (profile && profile.homeBuilding && !profile.isHomeless) {
        const addr = _homeAddressLabel(profile, T);
        return addr ? `${T.atHome || 'At Home'} (${addr})` : (T.atHome || 'At Home');
      }
    }
    return needLabels[activity] || activity;
  }

  function _traitDisplayName(trait) {
    if (!trait) return '?';
    const seg = (trait.name || '').split('.')[1] || (trait.name || '?');
    return seg.split(/[_\-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Deterministic per-seed RNG (mulberry32-ish), so an NPC's "random" flavor
  // specializations stay stable across repeat renders/re-opens instead of
  // rerolling every time the Info tab redraws.
  function _seededRandom(seedStr) {
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
    return function () {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Rows as the player reads them, resolved from ids every time: the display
  // bank is only in the right language once ConfigManager.load() has resolved,
  // and the player can switch language afterwards, so names are never cached.
  function _specRows(levelById) {
    const rows = [];
    levelById.forEach((lvl, id) => {
      const spec = window.Specializations.byId.get(id);
      if (spec) rows.push({ name: window.Specializations.displayName(spec), levelName: window.Specializations.levelName(lvl) });
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  // Specializations (js/db/Skills/Specialization.json via SpecializationMenu.js)
  // an NPC shows as trained. They are stored on the profile and grow with the
  // person's level (NPCSimulationCore.js, NPCSim.Specs): the class and trait
  // head start, the job's trade, a few personal picks and anything another
  // system pinned (_specOverrides, ErisTrial.js's lawyers). Only levels above
  // Untrained are ever returned.
  function _getNpcSpecializations(profile, classId, dl, npcName) {
    if (!window.Specializations || !window.Specializations.ready) return [];
    const Specs = window.NPCSim && window.NPCSim.Specs;
    if (Specs && profile) {
      Specs.ensure(profile, npcName);
      return _specRows(Specs.levelsFor(profile, classId, npcName));
    }
    return _rollNpcSpecializations(profile, classId, dl, npcName);
  }

  // The old seeded roll, kept only for a page opened without the simulation
  // (no NPCSim.Specs): the class/trait head start plus 3-6 picks rolled off
  // the name. Nothing is written back, the stored levels are the sim's alone.
  function _rollNpcSpecializations(profile, classId, dl, npcName) {
    // A beast is trained in what a body does and in nothing that needs a
    // mind: Specialization.json marks each entry `sentient`, and a creature
    // class (NPCCreature owns the boundary) draws only from the rest.
    const nonSentient = !!(window.NPCCreature && npcName
      ? window.NPCCreature.isNonSentientByName(npcName)
      : window.NPCCreature?.isNonSentientClassId?.(classId));
    const allowed = (spec) => !nonSentient || spec.sentient === false;

    const levelById = new Map();
    const className = (classId != null && $dataClasses?.[classId]) ? $dataClasses[classId].name : null;
    const traitSlugs = [];
    (profile?.traitIds || []).forEach((id) => {
      const trait = dl?.traits?.find((t) => t.id === id);
      const slug = trait?.name ? trait.name.split('.')[1] : null;
      if (slug) traitSlugs.push(slug);
    });

    window.Specializations.list.forEach((spec) => {
      if (!allowed(spec)) return;
      let lvl = 0;
      if (className && spec.classStart?.[className]) lvl = Math.max(lvl, spec.classStart[className]);
      traitSlugs.forEach((slug) => {
        if (spec.traitStart?.[slug]) lvl = Math.max(lvl, spec.traitStart[slug]);
      });
      if (lvl > 1) levelById.set(spec.id, lvl);
    });

    const rng = _seededRandom(`${npcName || 'npc'}:specializations`);
    const extraCount = 3 + Math.floor(rng() * 4); // 3..6
    const pool = window.Specializations.list.filter((s) => !levelById.has(s.id) && allowed(s));
    for (let i = 0; i < extraCount && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      const spec = pool.splice(idx, 1)[0];
      levelById.set(spec.id, 2 + Math.floor(rng() * 3)); // 2..4, Beginner-Advanced
    }

    const overrides = profile && profile._specOverrides;
    if (overrides) {
      for (const [id, lvl] of Object.entries(overrides)) {
        const n = Number(lvl);
        if (n > 1) levelById.set(Number(id), Math.max(levelById.get(Number(id)) || 0, n));
      }
    }
    return _specRows(levelById);
  }

  // A party member is not an NPC to be guessed at: the specializations they show
  // are the ones the player trained (SpecializationMenu's own reading of class
  // floor + trait floor + trained level), never the 3-6 flavour picks a stranger
  // of that name was dealt.
  function _getActorSpecializations(actor) {
    if (!actor || !window.Specializations?.ready || !actor.specializationLevel) return [];
    const rows = [];
    window.Specializations.list.forEach(spec => {
      const lvl = actor.specializationLevel(spec.id);
      if (lvl > 1) rows.push({ name: window.Specializations.displayName(spec), levelName: window.Specializations.levelName(lvl) });
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  function _factionDisplayName(faction) {
    if (!faction) return '?';
    const localized = window._NPCSocietyDataLoader?.getFactionName?.(faction);
    if (localized) return localized;
    const seg = (faction.name || '').split('.')[1] || (faction.name || '?');
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }

  // Readable home-town name for the "Citizen of" row. Map-pool NPCs already use
  // a human name for their home group; procedural NPCs are keyed "Proc:x,y", so
  // surface the descriptive name stored on the settlement group instead of the
  // raw coordinate key.
  function _homeTownLabel(groupName) {
    if (!groupName) return '';
    const grp = $gameSystem?._npcMapGroups?.[groupName];
    if (grp?.displayName) return grp.displayName;
    if (/^Proc:/i.test(groupName)) return grp?.country ? T('Empathize.frontierOf', { country: grp.country }) : T('Empathize.frontierSettlement');
    // Map-group keys are written without spaces ("FrozenStation"); the town of
    // that name in Destinations.json knows how it is meant to read.
    return window.WorkSystem?.destinationName ? window.WorkSystem.destinationName(groupName) : groupName;
  }

  // ============================================================================
  // Preset dossier helpers ("Preset: <name>" event comment)
  // ============================================================================

  // Age against the in-game calendar (TimeDateSystem), same maths the character
  // creation dossier uses, so both screens agree on how old a preset is now.
  function _presetAge(birthDate) {
    if (!birthDate) return null;
    const [year, month, day] = String(birthDate).split('-').map(Number);
    if (!year) return null;
    const tds = window.TimeDateSystem;
    if (!tds?.getGameTimeMinutes || !tds?.getDateTimeFromMinutes) return null;
    const now = tds.getDateTimeFromMinutes(tds.getGameTimeMinutes());
    let age = now.year - year;
    const curMonth = Number(now.monthNum);
    if (curMonth < (month || 1) || (curMonth === (month || 1) && now.day < (day || 1))) age -= 1;
    return age >= 0 ? age : null;
  }

  // Presets store "YYYY-MM-DD"; the dossier prints DD/MM/YYYY.
  function _presetBirthDate(birthDate) {
    if (!birthDate) return '';
    const parts = String(birthDate).split('-');
    if (parts.length !== 3) return String(birthDate);
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }

  function _presetGenderLabel(gender, T) {
    const labels = [
      T.genderMale,
      T.genderFemale,
      T.genderNonBinary,
      T.genderCocoon,
    ];
    return labels[gender] ?? '';
  }

  function _presetLore(preset, lang) {
    if (!preset) return '';
    // Resolved through the presets plugin: an endless dossier (Em) has no
    // written lore field, hers is composed per playthrough.
    // Already resolved to the active language by the presets plugin.
    return window.CharacterPresets?.getPresetLore?.(preset) ?? '';
  }

  // Same story for the hometown: Em's is rolled per incarnation.
  function _presetHometown(preset) {
    if (!preset) return '';
    return window.CharacterPresets?.getPresetHometown?.(preset) ?? (preset.hometown || '');
  }

  function _presetClassName(preset) {
    return (preset && $dataClasses?.[preset.classId]) ? $dataClasses[preset.classId].name : '';
  }

  // The character sheet this person is actually wearing, which is the only
  // thing that says whether they are from here at all. The society roll owns it
  // where it made one; otherwise it is whatever the map event is drawn with, and
  // for somebody read remotely (from the wiki or a chat link) their pool
  // template, exactly the order _resolveBustPath reads them in.
  function _npcSpriteKey(profile, npcName, evId) {
    if (profile?.spriteKey) return profile.spriteKey;
    const ev = evId != null ? $gameMap?.event(evId) : null;
    const fromEvent = ev?.event()?.characterName ?? ev?.event()?.pages?.[0]?.image?.characterName;
    if (fromEvent) return fromEvent;
    if (npcName && window.NPCSystem?.findTemplateSprite) {
      const tpl = window.NPCSystem.findTemplateSprite(npcName);
      if (tpl?.characterName) return tpl.characterName;
    }
    return null;
  }

  // Who this person is when they are not from this world: caste, home system,
  // and the power that claims them. Null for everybody else.
  function _alienIdentity(profile, npcName, evId) {
    if (!window.AlienOrigins) return null;
    return window.AlienOrigins.identify(_npcSpriteKey(profile, npcName, evId), npcName);
  }

  // ============================================================================
  // Wiki helpers, hyperlinks, linkified text, meters
  // ============================================================================

  // The wiki addresses a nation, a hyperpower, a faction and a historical leader
  // by their English name, because that name is the id every lookup matches on.
  // With no explicit label, the label is that id's name in the language being
  // played: the link still opens the same article, it just reads.
  const _WIKI_NAMED = { nation: 'nation', power: 'power', faction: 'faction', leader: 'leader' };

  // What a leader's `of` names, by the `ofType` the roster filed them under: a
  // hyperpower, a faction, or (for the greater part of the book, who never took
  // an office anywhere) the nation they simply belong to.
  const _LEADER_OF_KIND = { power: 'power', faction: 'faction', nation: 'nation' };

  // The heading of a wiki article. `view.name` is the id the article was opened
  // with; a party, an ideology or an artifact carries its own composed name and
  // passes straight through.
  function _viewName(view) {
    if (!view) return '';
    return _worldName(view.type, view.name);
  }

  // One world name, by the kind of thing it names.
  function _worldName(type, name) {
    const kind = _WIKI_NAMED[type];
    return (kind && window.WorldNames) ? window.WorldNames[kind](name) : String(name ?? '');
  }

  // A power's head-of-state office. The field holds an id ("Supreme Pontifex")
  // that the record and the politicians' `office` match on; NPCPolitics owns
  // the label for it, per power.
  function _headTitle(power) {
    if (!power) return '';
    const label = window.NPCPolitics?.powerLabel?.(power, 'headTitle');
    return label || power.headTitle || '';
  }

  // A historical leader's ideology. The roster resolves its own labels before
  // ConfigManager has loaded, so the stored one is always English and the id it
  // came from is what HistorySimulator can answer in the active language.
  function _leaderIdeology(leader) {
    const label = window.HistoryManager?.ideologyLabel?.(leader);
    return label || leader?.ideology || '?';
  }

  // encodeURIComponent leaves the apostrophe alone, and every wiki hyperlink
  // below carries its id inside a single-quoted inline handler: an entity whose
  // name holds one (Democratic People's Republic of Korea) would close that
  // string early and the click would throw. Encode it too; decodeURIComponent
  // on the far side gives the id back unchanged.
  function _encId(value) {
    return encodeURIComponent(String(value)).replace(/'/g, '%27');
  }

  // The tower keeps its own strings (DungeonFloor.json): the proxy above is
  // bound to the Empathize namespace, so a world's labels are read straight.
  function T2(key, fallback, params) {
    if (typeof window.T !== 'function') return fallback != null ? fallback : key;
    const out = window.T(key, params);
    return (out === key && fallback != null) ? fallback : out;
  }

  function _wikiLink(type, id, label) {
    const safeId = _encId(id);
    let text = label;
    if (text == null) {
      const kind = _WIKI_NAMED[type];
      text = (kind && window.WorldNames) ? window.WorldNames[kind](id) : id;
    }
    if (type === 'ideology') {
      return `<span class="npc-wiki-link" onmousedown="event.stopPropagation();if(window.PoliticalGraph3D){window.PoliticalGraph3D.open({focusId:'${safeId}'});}else{window.NPCEmpathize.openEntity('${type}','${safeId}');}">${_escapeHtml(text)} ✦</span>`;
    }
    return `<span class="npc-wiki-link" onmousedown="event.stopPropagation();window.NPCEmpathize.openEntity('${type}','${safeId}')">${_escapeHtml(text)}</span>`;
  }

  // In an empty world nobody outlived 1 January 2000. Every roster the wiki
  // prints marks its dead with a dagger and, where it has one, the date; these
  // two answer both for a world where being alive is not on offer, so a
  // listing agrees with the dossier the same name opens (see
  // NPCEmpathize._emptyWorldDeath).
  const EMPTY_WORLD_DEATH_DATE = '2000-01-01';
  function _emptyWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === 'function' && WM.isEmptyWorld());
  }
  // Whether this name should read as dead, and the date to print beside it.
  function _wikiIsDead(isDead) { return isDead || _emptyWorld(); }
  function _wikiDeathDate(stored) {
    if (stored) return stored;
    return _emptyWorld() ? EMPTY_WORLD_DEATH_DATE : null;
  }

  // Escapes raw text and turns every known entity name (nations, hyperpowers,
  // leaders, artifacts, factions) into a clickable wiki link.
  function _linkify(rawText) {
    const esc = _escapeHtml(rawText);
    const re = Wiki.linkPattern();
    if (!re) return esc;
    return esc.replace(re, (match) => {
      const ent = Wiki.resolveEscaped(match);
      if (!ent) return match;
      const safeId = _encId(ent.id);
      return `<span class="npc-wiki-link" onmousedown="event.stopPropagation();window.NPCEmpathize.openEntity('${ent.type}','${safeId}')">${match}</span>`;
    });
  }

  function _meterRow(label, value, band) {
    const v = Math.round(Math.max(0, Math.min(100, value ?? 0)));
    return `
      <div class="npc-vital-row">
        <span class="npc-vital-lbl">${_escapeHtml(label)}</span>
        <div class="npc-vital-track"><div class="npc-vital-fill ${band}" style="--npc-w:${v}%"></div></div>
        <span class="npc-vital-pct">${v}</span>
      </div>`;
  }

  // A -100..+100 political axis (econ/auth/trad/mil/myst), centered at 50%
  // fill so the bar itself shows which side of neutral a creed leans to; the
  // printed number stays signed, unlike _statBarRow's raw 0..max reading.
  function _axisBarRow(label, value, band) {
    const v = Math.round(Math.max(-100, Math.min(100, value ?? 0)));
    const pct = (v + 100) / 2;
    return `
      <div class="npc-vital-row">
        <span class="npc-vital-lbl">${_escapeHtml(label)}</span>
        <div class="npc-vital-track"><div class="npc-vital-fill ${band}" style="--npc-w:${pct}%"></div></div>
        <span class="npc-vital-pct npc-vital-pct--num">${v > 0 ? '+' : ''}${v}</span>
      </div>`;
  }

  function _statBarRow(label, value, max, band) {
    const pct = Math.round(Math.max(0, Math.min(100, (value / max) * 100)));
    return `
      <div class="npc-vital-row">
        <span class="npc-vital-lbl">${_escapeHtml(label)}</span>
        <div class="npc-vital-track"><div class="npc-vital-fill ${band || 'npc-fill--muted'}" style="--npc-w:${pct}%"></div></div>
        <span class="npc-vital-pct npc-vital-pct--num">${value}</span>
      </div>`;
  }

  function _kvRow(iconIdx, label, valueHTML) {
    return `<div class="npc-ident-row">${_iconSpan(iconIdx, 17)}<span class="npc-sub">${_escapeHtml(label)}:</span>&nbsp;<span>${valueHTML}</span></div>`;
  }

  function _eventRows(events, ICONS) {
    return (events || []).slice().reverse().map(e => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(e.date ?? '?')}</span>
        ${_iconSpan(e.iconIndex ?? (ICONS?.[e.category] ?? 0), 14)}
        <span>${_linkify(_goldTextToEuros(e.description ?? e.desc ?? ''))}</span>
      </div>`).join('');
  }

  // Shared with the rest of the NPC suite (NPCShared.formatMoney): 100g = 1.00€.
  function _euros(gold) {
    if (window.NPCShared?.formatMoney) return window.NPCShared.formatMoney(gold);
    const eur = Math.floor(Number(gold) || 0) / 100;
    if (eur >= 1_000_000_000) return `${(eur / 1_000_000_000).toFixed(2)}B€`;
    if (eur >= 1_000_000)     return `${(eur / 1_000_000).toFixed(2)}M€`;
    if (eur >= 1_000)         return `${(eur / 1_000).toFixed(1)}K€`;
    return `${eur.toFixed(2)}€`;
  }

  // Life-record / chronicle descriptions embed raw gold amounts as "<n>g"
  // (e.g. "moved to a villas (42881g saved)"). Rewrite every such amount into
  // the euro display used everywhere else in this panel (the usual gold/100
  // formula via _euros).
  function _goldTextToEuros(text) {
    return String(text ?? '').replace(/(\d[\d,]*)\s*g\b/g, (m, num) =>
      _euros(Number(String(num).replace(/,/g, ''))));
  }

  // The kicker under a wiki profile's title. Read through emblemOf() so the
  // word follows the language; the glyph is art and never moves.
  const ENTITY_EMBLEM = {
    nation:   { glyph: '⚑', kickerKey: 'wikiKindNation' },
    power:    { glyph: '♛', kickerKey: 'wikiKindPower' },
    leader:   { glyph: '☻', kickerKey: 'wikiKindLeader' },
    artifact: { glyph: '✦', kickerKey: 'wikiKindArtifact' },
    faction:  { glyph: '⚜', kickerKey: 'wikiKindFaction' },
    party:    { glyph: '⚖', kickerKey: 'wikiKindParty' },
    ideology: { glyph: '✪', kickerKey: 'wikiKindIdeology' },
  };

  function _emblemOf(type) {
    const e = ENTITY_EMBLEM[type];
    if (!e) return { glyph: '?', kicker: '' };
    return { glyph: e.glyph, kicker: T('Empathize.' + e.kickerKey) };
  }

  // The localized display name of an Ideology.json creed, by id, or '' if the
  // party carries none (which never happens for a curated real party, but a
  // hand-authored one might).
  function _ideologyLabel(ideologyId) {
    if (!ideologyId) return '';
    const ideo = window.NPCShared?.ideologyById?.(ideologyId);
    if (!ideo) return '';
    return window.T ? window.T(ideo.name) : ideologyId;
  }

  // The eight $dataItems.params labels, in param order, taken from the same
  // stats.json bank _statLabels() reads further down so an artifact's stat line
  // names the six attributes the way the rest of the game does.
  const _paramLabels = () => {
    const L = _statLabels();
    return ['HP', 'MP', L.atk, L.def, L.mat, L.mdf, L.agi, L.luk];
  };
  // Weapon and armor type names, indexed by wtypeId / atypeId. The database
  // carries the localized names, so read those and keep the table as the
  // fallback for a project that has not filled them in.
  // i18n-ignore-start: mirrors $dataSystem.weaponTypes / armorTypes, which
  // Hendrix_Localization translates through js/i18n/<lang>/types.json
  const WTYPE_NAMES = ['-', 'Light', 'Sword', 'Heavy', 'Axe', 'Whip', 'Staff', 'Bow', 'Projectile', 'Gun', 'Claw', 'Glove', 'Spear'];
  const ATYPE_NAMES = ['-', 'General', 'Magic', 'Light', 'Heavy', 'Small Shield', 'Large Shield'];
  // i18n-ignore-end
  const _wtypeName = (id) => ($dataSystem?.weaponTypes || [])[id] || WTYPE_NAMES[id] || '?';
  const _atypeName = (id) => ($dataSystem?.armorTypes || [])[id] || ATYPE_NAMES[id] || '?';

  // ============================================================================
  // SCREEN 1 OF 5: THE PANEL
  // ============================================================================
  // The modal itself: the overlay and its fade, the 3D portrait, the left
  // column of vitals and predispositions, the tab bar, and the right page each
  // tab paints into. Everything from here to SCREEN 2 belongs to it.

  // ============================================================================
  // Wrap create, add DOM overlay after base scene setup
  // ============================================================================

  const _Scene_NPCEmpathize_create = Scene_NPCEmpathize.prototype.create;
  Scene_NPCEmpathize.prototype.create = function () {
    _Scene_NPCEmpathize_create.call(this);
    this._travelingHour = _travelingHourIfOnTransport(this._eventId);
    this._buildOverlay();
    this._render();
    setTimeout(() => { if (this._overlay) this._overlay.classList.add('npc-shown'); }, 16);
    // Most of what this panel does is settled by a die: the stage is built
    // while the player reads, not on the first throw.
    window.Dice3D?.prewarm?.();
  };

  // ============================================================================
  // Overlay lifecycle
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildOverlay = function () {
    if (window._npcEmpathizeTimeout) {
      clearTimeout(window._npcEmpathizeTimeout);
      window._npcEmpathizeTimeout = null;
      // ~25 plugins share the #menu-container id (e.g. CustomMainMenuLayout
      // keeps its own copy parked in the DOM at opacity 0), only ever
      // remove OUR stale overlay, never another plugin's container.
      const stale = document.querySelector('#menu-container.npc-empathize-overlay');
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    }
    const div = document.createElement('div');
    div.id = 'menu-container';
    div.classList.add('npc-empathize-overlay');
    this._overlay = div;
    div.addEventListener('mousedown', e => {
      e.stopPropagation();
      if (e.button === 2) {
        e.preventDefault();
        if (this._overlay && !this._inputFocused) this._leave();
      }
    });
    div.addEventListener('focusin', e => {
      if (e.target.id === 'npc-dlg-ask-input') this._activeArea = 'input';
    });
    div.addEventListener('mouseup',     e => e.stopPropagation());
    div.addEventListener('click',       e => e.stopPropagation());
    div.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
    div.addEventListener('touchstart',  e => e.stopPropagation(), { passive: true });
    // RPG Maker's TouchInput._onWheel listens on `document` and preventDefault()s
    // every wheel event, which kills native scrolling inside this overlay, and a
    // dozen always-on plugins hang their own wheel handlers off `document` too.
    // Claim the event in the CAPTURE phase, before any of them can see it, and
    // drive the scroll ourselves.
    //
    // Which box a tick moves, in order: the one under the event target, the one
    // under the cursor (the target can belong to some other full-screen DOM
    // layer sitting on top), and finally the tab's own pane, so a tick anywhere
    // over the panel scrolls the thing the player is obviously reading rather
    // than being swallowed because the cursor sat on a gap between bubbles.
    //
    // Bound on window AND on the overlay itself: if anything upstream ever stops
    // the event before the window listener runs, the element-level one still
    // fires. `_npcWheelDone` keeps the two from double-scrolling one tick.
    this._wheelGuard = (e) => {
      const root = this._overlay;
      if (!root || e._npcWheelDone) return;
      e._npcWheelDone = true;
      e.stopPropagation();
      // Over the Social Web the wheel zooms the graph about the pointer,
      // ahead of the ordinary scroll-the-nearest-pane routing below.
      const webStage = this._activeTab === 'web' && root.contains(e.target)
        ? e.target.closest('#npc-web-stage') : null;
      if (webStage) {
        e.preventDefault();
        const rect = webStage.getBoundingClientRect();
        this.setWebZoom(
          this.webZoom() * (e.deltaY > 0 ? 1 / _WEB_WHEEL_STEP : _WEB_WHEEL_STEP),
          webStage.scrollLeft + (e.clientX - rect.left),
          webStage.scrollTop + (e.clientY - rect.top)
        );
        return;
      }
      const box = (root.contains(e.target) ? _scrollableUnder(e.target, root) : null)
        ?? _scrollableAtPoint(root, e.clientX, e.clientY)
        ?? this._activeScrollPane();
      if (!box) return;
      e.preventDefault();
      // deltaMode: 0 = pixels, 1 = lines, 2 = pages
      const step = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? box.clientHeight : 1;
      box.scrollTop += e.deltaY * step;
      // Reading the backlog by hand ends any pin still holding the log down.
      if (box.id === 'npc-dlg-chat') this._noteChatScrolled(box);
    };
    window.addEventListener('wheel', this._wheelGuard, { capture: true, passive: false });
    div.addEventListener('wheel', this._wheelGuard, { capture: true, passive: false });

    const inner  = document.createElement('div');
    inner.className = 'npc-empathize-inner';

    // Mouse-only close button. Deliberately NOT part of _tabOrder()/_activeArea
    // or given a tabindex, so it can't be reached by keyboard/gamepad nav -
    // Cancel/Escape (and right-click on the backdrop) remain the controller way out.
    const closeBtn = document.createElement('div');
    closeBtn.className   = 'npc-close-btn';
    closeBtn.innerHTML    = '&times;';
    closeBtn.title        = T('Empathize.closeBtn');
    closeBtn.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      this._leave(true);
    });
    inner.appendChild(closeBtn);

    const tabBar = document.createElement('div');
    tabBar.className = 'npc-tab-bar';
    this._tabBarEl = tabBar;
    inner.appendChild(tabBar);

    const body  = document.createElement('div');
    body.className = 'npc-panel-body';
    const left  = document.createElement('div');
    left.className = 'npc-left-col';
    const right = document.createElement('div');
    right.className = 'npc-right-panel';
    this._leftEl  = left;
    this._rightEl = right;
    body.appendChild(left);
    body.appendChild(right);
    inner.appendChild(body);
    div.appendChild(inner);
    document.body.appendChild(div);
  };

  // ============================================================================
  // Creature portrait viewer (Battler3D in the portrait frame)
  // ============================================================================
  // The same shape as the Bestiary's viewer, cut down to what a portrait needs:
  // no orbiting, no zoom, a slow turn so the body reads, and an occasional
  // attack so it is plainly alive. The canvas is kept ACROSS refreshes: the
  // left column is rebuilt with innerHTML on every tab change, and standing up
  // a fresh WebGL context each time would burn through the browser's context
  // limit and take the game's own canvas down with it (see cleanup below).

  Scene_NPCEmpathize.prototype._syncPortrait3D = function (spec) {
    const wrap = this._leftEl && this._leftEl.querySelector('.npc-portrait-3d');
    if (!spec || !wrap) { this._destroyPortrait3D(); return; }
    // Same creature as the live viewer: move the canvas into the new frame and
    // leave the context, the model and the animation loop alone.
    if (this._portrait3D && this._portrait3D.id === spec.id && !this._portrait3D.disposed) {
      if (this._portrait3D.canvas.parentNode !== wrap) {
        wrap.appendChild(this._portrait3D.canvas);
        this._portrait3D.redraw();
      }
      return;
    }
    this._destroyPortrait3D();
    this._initPortrait3D(wrap, spec);
  };

  Scene_NPCEmpathize.prototype._initPortrait3D = function (wrap, spec) {
    if (typeof THREE === 'undefined' || !window.Battler3D || !window.Battler3D.create) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'npc-portrait-canvas';
    wrap.appendChild(canvas);

    const rect   = wrap.getBoundingClientRect();
    const width  = Math.max(1, Math.round(rect.width)  || 220);
    const height = Math.max(1, Math.round(rect.height) || 220);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (e) {
      return; // no context to be had; the frame stays empty rather than crashing
    }
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1); // a small frame: hi-DPI costs 4x and shows nothing

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const keyLight  = new THREE.DirectionalLight(0xfff2d0, 1.4); keyLight.position.set(3, 5, 4);   scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.7); fillLight.position.set(-3, -2, 2); scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
    camera.position.set(0, 0, 8);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const state = {
      id: spec.id, canvas, renderer, scene, camera, pivot,
      model: null, rafId: 0, disposed: false,
      frameAcc: 0, clock: new THREE.Clock(),
      framesLeft: 0, redraw: null,
    };
    this._portrait3D = state;

    // A party member is built through the shared service, so it is the same
    // model the status sheet builds, with the same look seed. Anybody else has
    // their look rolled off the enemy id, exactly as the Bestiary rolls it, so
    // the same creature is the same colours every time.
    const loadPromise = _buildSpecModel(spec);

    loadPromise.then((battler) => {
      if (state.disposed) return;
      // Nothing could be built: the context goes rather than standing behind
      // an empty frame.
      if (!battler || !battler.model) { this._destroyPortrait3D(); return; }
      try { battler.update(1 / 60); } catch (e) {}
      // Framed by the same service the status sheet frames it with, so the two
      // portraits hold the subject alike and not just draw the same model.
      // Centre on a holder rather than on the model: the idle animations
      // rewrite model.position every frame with an absolute value, and would
      // undo an offset written onto the model itself.
      const fit    = window.ActorModel3D?.framing?.(battler, camera, 1.2);
      if (!fit) return;
      const holder = new THREE.Group();
      holder.position.copy(fit.center).multiplyScalar(-1);
      holder.add(battler.model);
      if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
      pivot.add(holder);
      camera.position.set(0, 0, fit.distance);
      camera.lookAt(0, 0, 0);
      state.model = battler;
      state.redraw();
    }).catch(() => {});

    // The portrait is a still: the model holds the pose it loaded in, and
    // neither turns nor plays an animation. So it is drawn on demand, not every
    // frame: a short burst when it is stood up, when the model arrives and when
    // the canvas is moved or its context comes back, long enough for a texture
    // arriving late to land. Between bursts the GPU is left to everything else
    // (a die thrown over the panel above all).
    const FRAME = 1 / 30;
    const BURST = 45; // frames at 30fps, 1.5s
    const animate = () => {
      state.rafId = 0;
      if (state.disposed) return;
      state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
      if (state.frameAcc >= FRAME && !window.Dice3D?.isRolling?.()) {
        state.frameAcc = 0;
        state.framesLeft--;
        if (window.PSXShader) window.PSXShader.render(renderer, scene, camera);
        else renderer.render(scene, camera);
      }
      if (state.framesLeft > 0) state.rafId = requestAnimationFrame(animate);
    };
    state.redraw = (frames) => {
      if (state.disposed) return;
      state.framesLeft = Math.max(state.framesLeft, frames || BURST);
      if (!state.rafId) {
        state.clock.getDelta();
        state.frameAcc = FRAME; // the first frame of a burst draws at once
        state.rafId = requestAnimationFrame(animate);
      }
    };
    canvas.addEventListener('webglcontextrestored', () => state.redraw());
    state.redraw();
  };

  Scene_NPCEmpathize.prototype._destroyPortrait3D = function () {
    const s = this._portrait3D;
    if (!s) return;
    this._portrait3D = null;
    s.disposed = true;
    cancelAnimationFrame(s.rafId);
    // dispose() alone leaves the WebGL context alive, and the browser force-
    // loses the OLDEST context past its cap , which is the game's own canvas.
    // Release it explicitly, then drop the element: a canvas that lost a
    // context can never host another one.
    try { s.renderer.dispose(); } catch (e) {}
    try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
    if (s.canvas && s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
  };

  Scene_NPCEmpathize.prototype._removeOverlay = function () {
    this._destroyPortrait3D();
    this._unbindChatPin();
    if (this._wheelGuard) {
      window.removeEventListener('wheel', this._wheelGuard, { capture: true });
      this._wheelGuard = null;
    }
    if (!this._overlay) return;
    const el      = this._overlay;
    this._overlay  = null;
    this._tabBarEl = null;
    this._leftEl   = null;
    this._rightEl  = null;
    el.classList.remove('npc-shown');
    el.classList.add('npc-closing');
    if (window._npcEmpathizeTimeout) clearTimeout(window._npcEmpathizeTimeout);
    window._npcEmpathizeTimeout = setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      window._npcEmpathizeTimeout = null;
    }, 200);
  };

  // ============================================================================
  // Scrolling (mouse wheel, L2/R2, arrows in a tab with nothing to select)
  // ============================================================================

  // The pane the current tab is "about": the chat log on the chat tab, the
  // right page everywhere else, falling back to whatever in the panel can
  // actually scroll (the left column's vitals footer, a long actions row).
  // True while the actions row is showing a picker rather than the standing
  // menu of verbs, i.e. while it is a list the player scrolls and chooses from.
  Scene_NPCEmpathize.prototype._isSelfTalk = function () {
    return this._actorId != null && this._focusActor?.()?.actorId?.() === this._actorId;
  };

  Scene_NPCEmpathize.prototype._inListSubMode = function () {
    return !!(this._directionsMode || this._giftMode || this._feedMode ||
              this._stealMode || this._bribeMode || this._socialMode ||
              this._romanceMode || this._proposeMode || this._cardMode ||
              this._infectMode || this._introspectGenderMode ||
              this._introspectOrientMode || this._introspectCreedMode);
  };

  Scene_NPCEmpathize.prototype._activeScrollPane = function () {
    if (!this._overlay) return null;
    // The text-entry modal covers the panel, nothing behind it may move.
    if (this._chatModalOpen || this._nameModalOpen) {
      const ta = this._nameModalEl?.querySelector('#npc-dlg-name-input') || this._chatModalEl?.querySelector('#npc-dlg-ask-input');
      return _isScrollable(ta) ? ta : null;
    }
    if (this._activeTab === 'chat' && !this._entity) {
      const actions = this._overlay.querySelector('.npc-chat-actions-row');
      // While a picker is open (directions, gift, steal, bribe, socialize,
      // romance) the list IS what the player is reading, so it takes the wheel
      // ahead of the chat log behind it.
      if (this._inListSubMode() && _isScrollable(actions)) return actions;
      const chat = this._overlay.querySelector('#npc-dlg-chat');
      if (_isScrollable(chat)) return chat;
      if (_isScrollable(actions)) return actions;
    }
    if (_isScrollable(this._rightEl)) return this._rightEl;
    for (const el of this._overlay.querySelectorAll(_SCROLL_BOXES))
      if (_isScrollable(el)) return el;
    return null;
  };

  // One scroll step, in pixels (negative = up). Returns true when it moved.
  Scene_NPCEmpathize.prototype._scrollActivePane = function (px) {
    const pane = this._activeScrollPane();
    if (!pane) return false;
    const before = pane.scrollTop;
    pane.scrollTop = before + px;
    // Reading the backlog by hand ends any pin still holding the log down.
    if (pane.id === 'npc-dlg-chat') this._noteChatScrolled(pane);
    return pane.scrollTop !== before;
  };

  // ============================================================================
  // _render, top-level DOM update
  // ============================================================================

  // A pane is only rebuilt when its markup actually changed. Most renders
  // touch one pane (a cursor step, a chat line, a tab switch), and replacing
  // the other two made the browser re-parse, re-decode the bust, re-lay-out
  // and repaint the whole panel for nothing. A pane holding a text field the
  // player has typed into is always rebuilt, so a submitted draft is cleared.
  function _hasEditedField(el) {
    const fields = el.querySelectorAll('input, textarea');
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].value !== fields[i].defaultValue) return true;
    }
    return false;
  }
  function _swapHTML(el, html) {
    if (!el) return false;
    if (el._npcHTML === html && el.isConnected && !_hasEditedField(el)) return false;
    el.innerHTML = html;
    el._npcHTML = html;
    return true;
  }

  Scene_NPCEmpathize.prototype._render = function () {
    if (!this._overlay) return;
    // Whatever this render draws, the rows the cursor walks are about to be
    // replaced: drop the cached lists of them so the next cursor move reads
    // the panel that is actually there (see _navCache).
    this._invalidateNavCache?.();
    // While a picker is open (Socialize, Court, gifts, steal, ...) its list IS
    // what the player is reading, so the cursor belongs to it however it was
    // opened. Clicking "Socialize" with the mouse used to leave the focus on
    // the tab bar, which showed the submenu with no selected row at all.
    if (this._inListSubMode?.() && this._activeArea !== 'input' && !this._chatModalOpen)
      this._activeArea = 'actions';
    // Talking to somebody uses a different skill depending on what is being
    // asked of them, so the badge follows the mode the panel is in rather than
    // sitting there naming all of them. Trade leaves for the shop, which raises
    // its own badge for Haggling and Appraising.
    if (window.SpecBadge) {
      // i18n-ignore-start  Specialization.json ids
      const spec = this._socialMode ? 'Public Speaking'
        : (this._pickpocketConfirm || this._stealMode) ? 'Pickpocketing' : null;
      // i18n-ignore-end
      // The panel already names who is doing the talking (its own character
      // switcher), so the chip reports that member's tier.
      if (spec) window.SpecBadge.show(spec, { actor: this._focusActor() });
      else window.SpecBadge.hide();
    }
    try {
      this._renderInner();
    } catch (e) {
      console.error('[NPCEmpathizeUI] _render error:', e);
      const T = _getT();
      this._overlay.innerHTML =
        '<div class="npc-unavailable">' +
        '<div class="npc-unavailable-body">' +
        `<div class="npc-unavailable-title">${T.npcUnavailable}</div>` +
        `<div class="npc-unavailable-sub">${T.pressCancel}</div></div></div>`;
    }
    // Every innerHTML rebuild wipes the npc-content-focused class off the Wiki
    // grid tiles, so re-apply the keyboard/controller focus ring after each
    // render. The NPC-mode path also does this inside its own rAF, but the
    // entity-page path (_renderEntityInner) did not - cover both here.
    requestAnimationFrame(() => this._updateSelectionHighlight?.());
  };

  Scene_NPCEmpathize.prototype._renderInner = function () {
    if (this._entity) return this._renderEntityInner();
    const actorMode  = this._actorId != null;
    const remoteMode = this._eventId == null && this._actorId == null && !!this._npcName;
    const actorObj  = actorMode ? $gameActors.actor(this._actorId) : null;
    const evId      = this._eventId;
    const ev        = (actorMode || remoteMode) ? null : $gameMap?.event(evId);
    const T         = _getT();
    const lang      = ConfigManager.language === 'it' ? 'it' : 'en';
    const dl        = window._NPCSocietyDataLoader;

    const npcName = remoteMode ? this._npcName : (actorMode ? (actorObj?.name() ?? '') : _getNPCName(evId));
    const classId = remoteMode ? null : (actorMode ? (actorObj?.currentClass()?.id ?? null) : _extractClassId(ev));

    if (npcName && window.NPCSocietyRegistry)
      window.NPCSocietyRegistry.ensureProfile(npcName, classId);

    const shiftInfo = (!actorMode && !remoteMode && window.NPCSim?.isShopShiftCovered?.(ev))
      ? window.NPCSim.getShopShiftData(ev?.event()?.name ?? '', $gameMap?.mapId(), evId)
      : null;
    const displayName = shiftInfo ? shiftInfo.name : npcName;
    if (shiftInfo && window.NPCSocietyRegistry)
      window.NPCSocietyRegistry.ensureProfile(shiftInfo.name, null);
    const profile = shiftInfo ? (_getProfile(shiftInfo.name) ?? {}) : (_getProfile(npcName) ?? {});

    // A written character (<Story>) is never given a disease, by the party's
    // hand or by standing next to them, so the roll below is skipped for them
    // and the moves that would infect them leave the action row further down.
    const storyNpc = !actorMode && !remoteMode && _isStoryNpc(evId);

    // Casual disease transmission (party <-> this NPC) is rolled once per panel
    // open, before anything renders, so the Health tab shows the fresh state.
    // Venereal diseases never spread this way; they only pass through NPC
    // romantic relations (resolved inside onEmpathizeOpen).
    if (!actorMode && !remoteMode && !storyNpc && npcName && window.DiseaseSystem && !this._diseaseRolled) {
      this._diseaseRolled = true;
      try { window.DiseaseSystem.onEmpathizeOpen(npcName, profile); } catch (e) { console.warn('[NPCEmpathize] disease roll failed', e); }
    }

    const bustPath = actorMode
      ? _resolveBustForActor(actorObj)
      : remoteMode
        ? _resolveBustPath(npcName, null)
        : (shiftInfo && shiftInfo.bust && shiftInfo.bust !== '7'
            ? _bustUrl(shiftInfo.bust)
            : _resolveBustPath(npcName, ev));

    // Character dossier this event is tied to via a "Preset: <name>" comment
    // (CharacterCreationPresets.js). Skipped while a shop shift is covered,
    // because then the person standing there is somebody else entirely.
    //
    // A world leader read remotely (opened by name from their wiki article,
    // with no event anywhere on the map) carries the same kind of dossier,
    // built by window.LeaderPersona: the pre-made one where they are also a
    // playable character, and one derived from the book where they are not.
    // That is what makes the panel show the same person the article does,
    // rather than a stranger the society sim happened to roll for the name.
    const preset = (!actorMode && !remoteMode && !shiftInfo)
      ? _presetFromEvent(ev)
      : (remoteMode ? (window.LeaderPersona?.dossierFor?.(npcName) ?? null) : null);

    const pers     = dl?.personalities?.[profile?.personalityIndex];
    const persName = pers ? _personalityLabel(pers.name) : '';
    // A dossier's own vocation outranks the class the society sim guessed for
    // this NPC, so the panel never contradicts the character sheet.
    const className = actorMode
      ? (actorObj?.currentClass()?.name ?? '')
      : (_presetClassName(preset) || dl?.getClassName?.(profile?.assignedClassId ?? classId) || '');
    const subParts = [className, persName].filter(Boolean);

    // A beast has no backlog of talk to show: it holds no conversations with
    // its neighbours, thinks nothing anybody could write down, and has never
    // said a line into a message box. Everything below is somebody else's
    // words, so on a non-sentient subject the log opens empty and fills only
    // with noises (see _prepareBeastMeeting).
    if (this._chatHistory.length === 0 && !this._isNonSentientSubject?.()) {
      // Recent NPC↔NPC conversations (NPCConversation world-folder log)
      const convoEntries = (window.NPCConversation?.ConversationLog?.getFor?.(npcName) ?? [])
        .slice(-3)
        .map(c => ({ role: 'convo', with: c.with, kind: c.kind, lines: c.lines, min: c.min }));
      // profile.thoughts is newest-first (unshift), the chat log reads
      // oldest-at-top, so flip it back into chronological order.
      const base = profile?.thoughts?.length ? profile.thoughts.slice(0, 8).reverse() : [];
      const src  = base.length
        ? base
        : (actorMode && actorObj ? _generatePartyThoughts(actorObj, profile) : []);
      const thoughtEntries = src.map(t => ({ role: 'npc', text: vary(String(t)) }));
      // Lines this NPC actually spoke in a message box (MarkovTextGenerator's
      // "Generate NPC Dialogue" command), recorded via NPCEmpathize.recordNPCLine.
      const spokenEntries = (profile?.spokenLog ?? [])
        .slice(-8)
        .map(s => ({ role: s.role === 'player' ? 'player' : 'npc', text: vary(String(s.text ?? '')) }))
        .filter(s => s.text);
      if (convoEntries.length || thoughtEntries.length || spokenEntries.length)
        this._chatHistory = [...convoEntries, ...thoughtEntries, ...spokenEntries];
    }

    // Em (Switch 48): seed how this NPC feels about her the first time they
    // meet, then let them react out loud. After the backlog so the reaction is
    // the newest line, before `opinion` below so the panel shows the seeded
    // standing rather than a neutral one.
    this._prepareEmMeeting?.();
    // Bubba (Switch 49): the same, for the man nobody in ninety-two dimensions
    // has a bad word about. Only one of the two can be in play at a time, since
    // they are different party members doing the talking.
    this._prepareBubbaMeeting?.();
    // And the one conversation that is neither of those: the two of them
    // meeting each other, in whichever direction (see _sayPairGreeting).
    this._sayPairGreeting?.();
    // A non-sentient member (a creature class, 63+) is not greeted, it is
    // noticed: cooed over, backed away from or shooed off by what this NPC
    // makes of the animal in front of them.
    this._prepareFeralMeeting?.();
    // And a non-sentient NPC does not greet at all: it makes a noise at
    // whoever has just walked up to it.
    this._prepareBeastMeeting?.();

    const predispositions = _computePartyPredisposition(profile);
    // Tracked apart from disposition: how drawn this NPC is to each party
    // member, moved only by courting, never by an ordinary conversation.
    const attractions      = _computePartyAttraction(profile);
    // Reputation is now per party member; use the focused (interacting) actor's
    // standing rather than a party-wide median.
    const opinion         = this._focusOpinion(profile);

    // Advertised odds, computed by the same helper _join() rolls against, for
    // the same member: the one the switcher has doing the talking.
    const joinChance = _joinChance(opinion, this._focusActor());

    const nowMin            = $gameVariables?.value(114) ?? 0;
    const wasRecentlyAttacked = (profile?.eventLog ?? []).some(
      e => e.tag === 'crime' && e.desc === 'attacked by player' && (e.gameMin ?? 0) >= nowMin - 3 * 1440 // i18n-ignore: event-log record id
    );
    const TREAT_CLASSES = [3, 9, 41, 51];

    // Join gate: only hiding it once this NPC has just joined via this panel
    // (_justJoined). No Switch 67 or name-matching - those caused false
    // negatives that wrongly hid Join. A full party is no longer a gate either:
    // the fourth person to say yes signs on as a member in reserves and waits on
    // the Dynamics board, so the offer is made whatever the party's size (see
    // NPCSystemParty.joinParty).
    const partyFull = this._justJoined === true;

    // The one thing that takes Join and Follow off the board for somebody who
    // is otherwise recruitable: a shop-shift-covered counter, where the face on
    // display is a rotating persona borrowed cosmetically rather than someone
    // free to travel, and flipping the counter's own self-switch A would strand
    // it on its shift. The event NOT having a self-switch A page is no longer a
    // gate: an authored NPC with two ordinary pages and no blank one is erased
    // on recruitment instead (_vanishRecruitedEvent), which is what silently
    // hid both offers on hand-written characters like Sister Renna.
    const isShopEvent = !!shiftInfo || !!window.NPCSystem?.isAnyShopEvent?.($gameMap?.event(evId));
    const canVanishOnJoin = !isShopEvent;

    // A fallen companion is left behind when a recruit signs on, so the count
    // is of the travellers still standing (see _travellingPartyCount).
    const joinAsInactive = _travellingPartyCount() >= 3;

    // Nobody far above the party's weight class agrees to be led by them, so
    // Join is not on the table at all for a recruit out of that reach.
    const joinLevelOk = _joinLevelOk(preset?.level ?? profile?.level);

    // Em talking to Bubba: the one person in ninety-two dimensions who is
    // simply pleased to see her. Nothing hostile and nothing romantic is on the
    // table with him, and he never joins the party (see _join).
    const emCtx     = this._emCtx?.() ?? null;
    const bubbaOnly = !!emCtx?.bubba;
    // Court is deliberately NOT on this list. She is allowed to ask, and he is
    // allowed to say no, which is the only answer there has ever been: he is
    // still Eris's, and the two of them being anything but travel buddies would
    // be weird. It is the one thing that takes their bond down.
    const BUBBA_HIDDEN = new Set(
      ['attack', 'pickpocket', 'cough', 'spit', 'bite', 'bribe', 'join', 'infect']
    );

    // Opening a vial on somebody: what the pack is carrying decides whether the
    // action is live at all, and the label advertises the same odds of not being
    // seen that _infectWith() rolls, for the member the switcher has focused.
    const vialCount    = _diseaseVialItems().length;
    const infectChance = _infectChance(this._focusActor());
    // A party member is dosed openly (no roll, no charge), so their own panel's
    // button states the act rather than the odds.
    const infectAction = actorMode
      ? { id: 'infect', label: T.infectLabel, disabled: !vialCount }
      : { id: 'infect', label: `${T.infectLabel} (~${infectChance}%)`, disabled: !vialCount };

    // A fellow party member (Dynamics -> Roster -> Empathize, or walking up to
    // a follower in Loose formation) is talked to like anybody else, minus
    // whatever would move money or items out of the party's own pack and minus
    // the option to come to blows with them: everything left is conversation.
    // Cough/Spit/Bite and Treat Wounds are left off too, not for carrying a
    // cost themselves (they mostly do not) but for what they are wired to:
    // the first three file an assault charge and a bounty exactly as they
    // would against a stranger, which reads as a bug rather than a joke when
    // the "stranger" is a travelling companion, and Treat Wounds bills gold
    // outright once the target's opinion drops under +20.

    // Talking to yourself. A one-person party has nobody else to put in the
    // speaker's chair, so the subject of the panel and the one addressing it
    // are the same character, and "Socialize" is the wrong word for what that
    // is. The move behind the button does not change: only what it is called.
    const selfTalk = actorMode && this._focusActor?.()?.actorId?.() === this._actorId;
    const socializeLabel = selfTalk ? T.introspectLabel : T.socializeLabel;

    this._chatActions = remoteMode
      ? []
      : actorMode
      ? [
          { id: 'socialize',  label: socializeLabel },
          { id: 'romance',    label: T.courtLabel },
          { id: 'directions', label: T.directionsLabel },
          infectAction,
          { id: 'freeChat',   label: T.freeChatLabel },
        ]
      : [
          { id: 'socialize',  label: T.socializeLabel },
          { id: 'romance',    label: T.courtLabel },
          { id: 'directions', label: T.directionsLabel },
          { id: 'gift',       label: T.gift },
          { id: 'bribe',      label: T.bribe },
          { id: 'attack',     label: T.attack },
          { id: 'pickpocket', label: T.pickpocket },
          { id: 'trade',      label: T.trade, disabled: wasRecentlyAttacked },
          // Cards: a game is once a day with any one person, and so is a swap.
          // The deck gate is read here so the entry greys out rather than
          // opening a table the party has nothing to bring to.
          ...(window.CardGame ? [
            {
              id: 'cardDuel', label: T.cardDuelLabel,
              disabled: window.CardGame.hasDuelledToday(npcName) || !window.CardGame.canDuel()
            },
            {
              id: 'cardTrade', label: T.cardTradeLabel,
              disabled: window.CardGame.hasTradedToday(npcName) || !window.CardGame.ownedKeys().length
            }
          ] : []),
          { id: 'cough',      label: T.coughLabel },
          { id: 'spit',       label: T.spitLabel  },
          { id: 'bite',       label: T.biteLabel  },
          infectAction,
          ...(TREAT_CLASSES.includes(classId) ? [{ id: 'treat', label: T.treatWounds }] : []),
          ...(window.ProceduralHouseSystem?.canOfferPurchase?.()
            ? [{ id: 'buyHouse', label: `${T.buyHouse} (${_euros(window.ProceduralHouseSystem.getCurrentFloorPrice(opinion))})` }]
            : []),
          ...(partyFull || !canVanishOnJoin || !joinLevelOk
            ? []
            : [{ id: 'join', label: `${joinAsInactive ? T.joinPartyInactive : T.joinParty} (~${joinChance}%)` }]),
          // Somebody who talks can also be asked for less than a slot: to walk
          // with the party as a follower. Same odds, and offered whether or
          // not there is room, since a follower never needs any.
          ...(!canVanishOnJoin || !joinLevelOk
            ? []
            : [{ id: 'joinFollower', label: `${T.joinFollower} (~${joinChance}%)` }]),
          // Free chat closes the list. Opening the text field is an interaction
          // like any other, never a bare keypress: the panel is navigated with
          // the same keys one types with, so a stray direction must not drop
          // the player into a textbox.
          { id: 'freeChat',   label: T.freeChatLabel },
        ];
    // Talk about / Teach / Learn (LESSONS, below), set just ahead of Free chat.
    // The beast, child and visitor filters further down take them off the
    // board wherever they do not belong.
    if (!remoteMode) {
      const lessons = this._lessonActions?.(actorMode) || [];
      const at = this._chatActions.findIndex(a => a.id === 'freeChat');
      this._chatActions.splice(at < 0 ? this._chatActions.length : at, 0, ...lessons);
    }
    // Beliefs and Politics (NPCEmpathizeUI_Lessons.js, CIVICS), also ahead of
    // Free chat. The board's own gates decide which of them this person gets.
    if (!remoteMode && !actorMode) {
      const civics = this._civicActions?.(npcName, profile, opinion) || [];
      const at = this._chatActions.findIndex(a => a.id === 'freeChat');
      this._chatActions.splice(at < 0 ? this._chatActions.length : at, 0, ...civics);
    }
    // Money and Work and travel (NPCEmpathizeUI_Chat.js, DEALS), also ahead of
    // Free chat. The board's own gates decide which of them this person gets.
    if (!remoteMode && !actorMode) {
      const deals = this._dealActions?.() || [];
      const at = this._chatActions.findIndex(a => a.id === 'freeChat');
      this._chatActions.splice(at < 0 ? this._chatActions.length : at, 0, ...deals);
    }
    // Help, Games, Romance and Talk (NPCEmpathizeUI_Lessons.js, HELP), also
    // ahead of Free chat. The board's own gates decide which of them this
    // person gets.
    if (!remoteMode && !actorMode) {
      const help = this._helpActions?.(npcName, profile) || [];
      const at = this._chatActions.findIndex(a => a.id === 'freeChat');
      this._chatActions.splice(at < 0 ? this._chatActions.length : at, 0, ...help);
    }
    // Accuse (NPCEmpathizeUI_Lessons.js, ACCUSE), on every page but a
    // visitor's: an NPC, a member on the roster, or yourself on the self-talk
    // page. The child, beast and visitor filters below take it off where it
    // does not belong, and the board's gate greys it once a day.
    if (!remoteMode) {
      const accuse = this._accuseAction?.();
      const at = this._chatActions.findIndex(a => a.id === 'freeChat');
      if (accuse) this._chatActions.splice(at < 0 ? this._chatActions.length : at, 0, accuse);
    }
    if (bubbaOnly) this._chatActions = this._chatActions.filter(a => !BUBBA_HIDDEN.has(a.id));

    // Em and Bubba, in whichever direction. Bicker is theirs and nobody else's,
    // and it sits next to Socialize because that is what it replaces between
    // the two of them. Court is offered only when SHE raises it: Bubba is never
    // shown the option at all, in the panel or on the roster page.
    const pairCtx = this._pairCtx?.() ?? null;
    if (pairCtx) {
      if (pairCtx.side === 'bubba') {
        this._chatActions = this._chatActions.filter(a => a.id !== 'romance');
        this._romanceMode = false;
        this._proposeMode = false;
      }
      const at = this._chatActions.findIndex(a => a.id === 'socialize');
      this._chatActions.splice(at < 0 ? 0 : at + 1, 0, { id: 'bicker', label: T.bickerLabel });
      // Ask (as Em) / Tell (as Bubba): the topics board, offered right here
      // rather than only to whoever turns round to him in the column. The verb
      // comes from the board itself, so the two directions are never mislabelled.
      if (this._canStoryAsk?.()) {
        const SD = window.StoryDialogue;
        this._chatActions.splice(at < 0 ? 0 : at + 1, 0, {
          id: 'askTopics', label: SD.askVerb(this._focusActor()?.name?.()),
        });
      }
    }

    // The story topics, in the word of whoever is raising them: Em asks, Bubba
    // tells. Offered on the sheet as well as on the road, and never hidden the
    // way the hostile actions are , there is nothing hostile about it.
    if (this._canStoryAsk?.()) {
      const SD = window.StoryDialogue;
      const at = this._chatActions.findIndex(a => a.id === 'bicker');
      this._chatActions.splice(at < 0 ? 0 : at + 1, 0,
        { id: 'askTopics', label: SD.askVerb(this._focusActor()?.name?.()) });
    }

    // A non-sentient member (a creature class, 63+) has no conversation to
    // offer, so the spoken half of the panel goes: socialising, courting,
    // asking the way, haggling, bribery and property are all off the list.
    // What is left is what a beast can do , noise, contact and teeth , plus
    // the offer to follow the party, which is made whatever the party's size
    // or the creature's standing: it is an animal deciding to come along.
    if (!actorMode && !remoteMode && _isNonSentientActor?.(this._focusActor?.())) {
      const FERAL_KEEP = new Set(['freeChat', 'gift', 'attack', 'cough', 'spit', 'bite']);
      const kept = this._chatActions.filter(a => FERAL_KEEP.has(a.id));
      const noises = (FERAL_ACTIONS || []).map(a => ({
        id: a.id, label: T['feralLabel' + a.id.charAt(0).toUpperCase() + a.id.slice(1)],
      }));
      // Join stays on the board even when the party is full or the recruit is
      // out of reach , _join() refuses those itself , so it reads as greyed
      // out rather than missing. It goes only once they have actually joined.
      const joinBlocked = !canVanishOnJoin || !joinLevelOk;
      this._chatActions = [
        ...noises,
        ...kept.filter(a => a.id !== 'freeChat'),
        ...(this._justJoined === true
          ? []
          : [{ id: 'join', label: `${joinAsInactive ? T.joinPartyInactive : T.joinParty} (~${joinChance}%)`, disabled: joinBlocked }]),
        ...kept.filter(a => a.id === 'freeChat'),
      ];
    }

    // The same question asked of the other side: the NPC standing there is
    // itself a beast (one of the creature classes, 63+, dealt by NPCCreature).
    // It has no words to be socialised with, no directions to give, nothing to
    // sell, nothing to be bribed with and no hand to play cards with, so all of
    // that leaves the board. What is left is what an animal understands, being
    // fed, being touched, being fought, and the offer to follow the party;
    // everything it says back is drawn from the non-sentient banks (see
    // _isNonSentientSubject in NPCEmpathize.js).
    if (!actorMode && !remoteMode && npcName && _isNonSentientNpc?.(npcName)) {
      const BEAST_KEEP = new Set(
        ['freeChat', 'attack', 'cough', 'spit', 'bite', 'infect', 'join', 'firstAid']
          // Two beasts facing each other: the noises the block above put on the
          // board are the only conversation either of them has, so they stay.
          .concat((FERAL_ACTIONS || []).map(a => a.id)));
      this._chatActions = this._chatActions.filter(a => BEAST_KEEP.has(a.id));
      // An animal is not handed a present, it is touched and it is fed, so
      // Gift leaves the board and these two take its place at the front of it.
      // Petting can only ever go well; the tray is dark when the pack is
      // carrying nothing an animal would put in its mouth.
      // Collect stands at the head of the board, but only when the animal
      // actually has something ready: an empty Collect is a promise the hen
      // cannot keep. Every `animal: true` sheet answers here, not only one the
      // player bought (see _animalStatus / AnimalGrowthSystem.recordForAnimal).
      const animal = this._animalStatus?.();
      this._chatActions.unshift(
        { id: 'pet',  label: T.beastLabelPet },
        { id: 'feed', label: T.beastLabelFeed, disabled: !_feedItemsInPack().length },
      );
      if (animal && animal.hasReady) {
        this._chatActions.unshift({ id: 'collect', label: _TAroot('actionCollect') });
      }
      // Asking it to come along. A wild animal is simply asked; somebody's
      // animal has to be talked away from them, which reads as a different
      // thing and is a different (much longer) set of odds. It replaces the
      // ordinary Join, which recruits a person into a party slot: an animal
      // walks WITH the party, it does not hold a slot in it.
      if (animal) {
        this._chatActions = this._chatActions.filter(a => a.id !== 'join');
        if (!this._justJoined) {
          const odds = _animalJoinChance(animal, this._focusActor?.(), opinion);
          // Out of the party's weight class is out of reach for an animal too
          // (_joinLevelOk, measured on the party's median level): a beast far
          // stronger than the party does not trot along behind it either.
          this._chatActions.push({
            id: 'animalJoin',
            label: `${animal.owned ? _TAroot('actionConvince') : _TAroot('actionJoinPet')} (~${odds}%)`,
            disabled: _travellingPartyCount() >= 3 || !joinLevelOk,
          });
          // The other half of the same question: an animal can also be asked
          // to travel as one of the party rather than behind it, which is the
          // same roll and needs one of the three slots free.
          this._chatActions.push({
            id: 'animalJoinParty',
            label: `${_TAroot('actionJoinPartyAnimal')} (~${odds}%)`,
            disabled: !window.PetSystem?.hasFreeSlot?.() || !joinLevelOk,
          });
        }
      }
      // A beast that is not livestock , a Feral, a Ghost, a Mimic, anything
      // AnimalGrowthSystem holds no breed for , gets neither of the two offers
      // above, and the ordinary Join is only ever built when there is room for
      // it, so a full party left the board with no way to recruit one at all.
      // It is put back here and greyed out instead of missing: "not now" and
      // "never" are different answers, and only the first one is true.
      if (!animal && !this._justJoined) {
        if (!this._chatActions.some(a => a.id === 'join')) {
          this._chatActions.push({
            id: 'join',
            label: `${joinAsInactive ? T.joinPartyInactive : T.joinParty} (~${joinChance}%)`,
            disabled: partyFull || !canVanishOnJoin || !joinLevelOk,
          });
        }
        // And the lesser ask, which needs no slot at all: walk with us.
        if (!this._chatActions.some(a => a.id === 'joinFollower')) {
          this._chatActions.push({
            id: 'joinFollower',
            label: `${T.joinFollower} (~${joinChance}%)`,
            disabled: !canVanishOnJoin || !joinLevelOk,
          });
        }
      }
    }

    // And the same question asked of the roster page: the party's own creature
    // (a creature class, 63+) is a creature wherever it is standing. Being
    // recruited does not hand an animal a vocabulary, so socialising with it,
    // courting it and asking it the way all leave the board here exactly as
    // they do on the street, and what is left is what it understands, a hand
    // laid on it and whatever the player types at it, which comes back as
    // noise (see _isNonSentientSubject in NPCEmpathize.js).
    // Feeding is NOT offered: the tray pays a society profile's hunger, and a
    // party member has none, so it would burn the meal for a line of text.
    if (actorMode && this._isNonSentientSubject?.()) {
      const MEMBER_BEAST_KEEP = new Set(['freeChat', 'infect']);
      const kept = this._chatActions.filter(a => MEMBER_BEAST_KEEP.has(a.id));
      this._chatActions = [
        { id: 'pet', label: T.beastLabelPet },
        ...kept,
      ];
    }

    // Somebody else's party member, standing here because that playthrough was
    // saved on this spot (NPCSystem.js, VisitingParties). Nothing done to them
    // may reach into the savegame they belong to, so everything transactional
    // or violent leaves the board: no recruiting them away from their own
    // party, no fighting, no trading, no cards, no gifts, no money, no
    // pickpocketing, no bargaining, no infecting them. What is left is what
    // costs their journey nothing, talking, and the standing that earns is
    // remembered in the world folder like everybody else's.
    // A <Story> character: everything the plot needs them alive and well for.
    // They are talked to, courted, robbed and haggled with like anybody else,
    // but the party cannot come to blows with them and cannot hand them a
    // disease, by vial or by mouth (see _isStoryNpc).
    if (storyNpc) {
      this._chatActions = this._chatActions.filter(a => !STORY_PROTECTED_ACTIONS.includes(a.id));
    }

    if (!actorMode && window.PartyPresence?.isVisitorName?.(npcName)) {
      // Talking about a topic is talk; teaching and learning would write to a
      // savegame this one does not own, so those two go with the rest.
      const VISITOR_KEEP = new Set(['freeChat', 'socialize', 'directions', 'talkAbout', 'rumours']);
      this._chatActions = this._chatActions.filter(a => VISITOR_KEEP.has(a.id));
    }

    // A child (NPCLifeSim FAMILY): an ordinary chat and nothing else. No
    // courting, trading, gifts, money, cards, fights, recruiting or infecting.
    if (!actorMode && this._isChildSubject?.()) {
      // Somebody hurt, ill or lying on the ground is helped whatever their age.
      const CHILD_KEEP = new Set(['freeChat', 'socialize', 'directions', 'treatThem', 'giveMedicine', 'firstAid']);
      this._chatActions = this._chatActions.filter(a => CHILD_KEEP.has(a.id));
      this._romanceMode = false;
      this._proposeMode = false;
    }

    // Bubba doing the talking (Switch 49): he does not rob, hit, or infect
    // anybody. Court survives only for a bubbaromantic, the one person who
    // has eyes for him at all, and every move on her lands (_romanceOptions).
    if (!actorMode && !remoteMode && _isBubbaActor?.(this._focusActor?.())) {
      const BUBBA_REFUSES = new Set(['attack', 'pickpocket', 'cough', 'spit', 'bite', 'infect']);
      const courtable = _isBubbaromanticNpc(npcName, profile);
      this._chatActions = this._chatActions.filter(
        a => !BUBBA_REFUSES.has(a.id) && (a.id !== 'romance' || courtable)
      );
    }

    // A harassment complaint from this person against the member doing the
    // talking: no more courting them until they think well of them again
    // (see _recordUnwantedCourting). Others in the party are unaffected.
    if (!actorMode && !remoteMode &&
        _courtRefused(profile, this._focusActor?.()?.actorId(), opinion)) {
      this._chatActions = this._chatActions.filter(a => a.id !== 'romance');
      this._romanceMode = false;
      this._proposeMode = false;
    }
    // The story mode travels as a fixed pair, and the companion seat is
    // Bubba's whether or not he is walking with the party right now: while he
    // is out of it, nobody else is offered the seat, so the whole family of
    // join actions leaves the board (switch 100 is the story mode's own).
    if (window.$gameSwitches?.value(100) &&
        !($gameParty?.members() ?? []).some(m => m && m.name() === 'Bubba')) { // i18n-ignore: actor name, matched at runtime
      const JOIN_ACTIONS = new Set(['join', 'joinFollower', 'animalJoinParty']);
      this._chatActions = this._chatActions.filter(a => !JOIN_ACTIONS.has(a.id));
    }

    // The board's own gates (NPCEmpathizeUI_Chat.js, ACTION BOARD) run last,
    // on whatever every filter above left: verbs not built yet, verbs the
    // world mode bars and each verb's own available(ctx).
    if (this._gateBoardActions) {
      this._chatActions = this._gateBoardActions(this._chatActions, {
        actorMode, remoteMode, npcName, profile, opinion, actor: this._focusActor?.() ?? null,
      });
    }

    this._menuItems = this._chatActions;
    if (this._menuIndex >= this._menuItems.length) this._menuIndex = 0;

    // NPC age, drawn from the life-history record; ensure one exists so the
    // left-panel header can show it. Party actors have no life record.
    let npcAge = null;
    if (!actorMode && npcName && window.NPCLifeSim) {
      npcAge = window.NPCLifeSim.ageOf?.(npcName);
      if (npcAge == null && window.NPCLifeSim.ensureLifeRecord) {
        try { window.NPCLifeSim.ensureLifeRecord(npcName, profile?._homeGroupName); } catch (e) {}
        npcAge = window.NPCLifeSim.ageOf?.(npcName);
      }
    }
    if (preset) {
      const presetAge = _presetAge(preset.birthDate);
      if (presetAge != null) npcAge = presetAge;
    }
    const leftIdent = {
      name: displayName,
      level: preset?.level ?? profile?.level,
      className,
      age: npcAge,
    };
    // A creature is portrayed by its own body rather than by a bust, and so is
    // anybody whose dossier ships a model of them. In party-member mode that is
    // the actor being inspected; in NPC mode it is whoever is standing there.
    // Resolved before the panel is built so the frame is laid out for a canvas
    // from the start.
    const modelSpec = _creatureModelSpec(
      _creatureSubject(actorMode ? actorObj : null, profile, displayName),
      actorMode ? actorObj : null)
      || _presetModelSpec(actorMode ? actorObj : null, preset);
    // Livestock reads its own block under the vitals: what it is, how old, how
    // far from grown, how well fed and where every produce cycle stands.
    const animalStatus = this._animalStatus ? this._animalStatus() : null;
    const leftHTML = this._buildLeftPanelHTML(
      bustPath, profile, predispositions, T, leftIdent, attractions, modelSpec, animalStatus);

    const showingChatUI = this._activeTab === 'chat';

    let rightHTML;
    if (this._activeTab === 'chat') {
      rightHTML = this._buildChatHTML(displayName, T, profile, opinion, npcName, remoteMode);
    } else if (this._activeTab === 'info') {
      rightHTML = this._buildInfoHTML(displayName, subParts, profile, T, dl, opinion, lang, classId, npcName, preset);
    } else if (this._activeTab === 'background') {
      rightHTML = this._buildBackgroundTabHTML(T, profile, npcName);
    } else if (this._activeTab === 'routine') {
      rightHTML = this._buildRoutineTabHTML(T, profile);
    } else if (this._activeTab === 'biologics') {
      rightHTML = this._buildBiologicsTabHTML(T, profile, npcName);
    } else if (this._activeTab === 'health') {
      rightHTML = this._buildHealthTabHTML(T, profile, npcName);
    } else if (this._activeTab === 'romance') {
      rightHTML = this._buildRomanceTabHTML(T, profile, npcName);
    } else if (this._activeTab === 'web') {
      rightHTML = this._buildWebHTML(T, profile, npcName, bustPath);
    } else if (this._activeTab === 'lifeHistory') {
      rightHTML = this._buildLifeHistoryHTML(T, profile, npcName);
    } else if (this._activeTab === 'wiki') {
      rightHTML = this._buildWikiTabHTML(T);
    } else {
      rightHTML = this._buildMoreHTML(T);
    }

    if (!this._leftEl || !this._rightEl) return;

    if (this._tabBarEl) {
      _swapHTML(this._tabBarEl, this._buildTabsHTML(T));
      this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }
    _swapHTML(this._leftEl, leftHTML);
    // The frame is in the DOM now, so the viewer can be moved into it (or
    // stood up, if this is a different creature from the one it was showing).
    this._syncPortrait3D(modelSpec);

    if (showingChatUI) {
      this._rightEl.classList.add('npc-right-panel--chat');
    } else {
      this._rightEl.classList.remove('npc-right-panel--chat');
    }
    _swapHTML(this._rightEl, rightHTML);

    // The Social Web's pan is the stage's own scrollLeft/scrollTop, which a
    // fresh innerHTML always resets to 0; put back wherever the player had it
    // panned to, and (re-)arm the drag listeners on the element that just
    // replaced the one they were bound to.
    if (this._activeTab === 'web') {
      const webStage = this._webStageEl?.();
      if (webStage) {
        this._bindWebStagePointer(webStage);
        webStage.scrollLeft = this._webScrollX || 0;
        webStage.scrollTop  = this._webScrollY || 0;
      }
    }

    requestAnimationFrame(() => {
      // The log always ends on its newest message. Nothing tries to preserve
      // where the player had scrolled to: every render is triggered by
      // something that just happened in the conversation, so the bottom is
      // always the interesting end, and a half-restored position was what made
      // a fresh reply visibly scroll into view and then jump back up.
      if (showingChatUI) this._scrollChatToBottom();
      if (this._activeTab === 'routine')
        this._rightEl?.querySelector('#npc-routine-now')?.scrollIntoView({ block: 'center' });
      this._updateSelectionHighlight?.();
    });

    // Restore focus + caret after a re-render rebuilt the field, so an
    // in-progress draft survives (matches the search-input pattern used by
    // SandboxMode and other DOM menus).
    if (showingChatUI && this._activeArea === 'input' && !remoteMode) {
      const self = this;
      setTimeout(() => {
        const inp = self._overlay?.querySelector('#npc-dlg-ask-input');
        if (inp && self._activeArea === 'input' && document.activeElement !== inp) {
          inp.focus();
          const end = inp.value.length;
          try { inp.setSelectionRange(end, end); } catch (e) {}
        }
      }, 60);
    }
  };

  // ============================================================================
  // Tab bar
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildTabsHTML = function (T) {
    const tabs = [
      { id: 'chat',        label: T.chat },
      { id: 'info',        label: T.info },
      { id: 'background',  label: T.history },
      { id: 'routine',     label: T.routine },
      { id: 'biologics',   label: T.biologicsTab },
      { id: 'health',      label: T.healthTab },
      { id: 'romance',     label: T.romanceTab },
      { id: 'web',         label: T.socialWeb },
      { id: 'lifeHistory', label: T.lifeHistory },
      { id: 'wiki',        label: T.wikiTab },
      { id: 'more',        label: T.more },
    ];
    // _tabOrder() is what the keyboard cycles through and it already drops the
    // tabs the member doing the talking has no use for (Romance, for a
    // non-sentient one), so the bar is drawn from it rather than beside it.
    const order = this._tabOrder?.() ?? null;
    const shown = Array.isArray(order) ? tabs.filter(t => order.includes(t.id)) : tabs;
    return this._buildBackBtnHTML(T) + this._buildTabHintHTML() + shown.map(tab => `
      <div class="npc-tab${this._activeTab === tab.id ? ' active' : ''}"
           onmousedown="event.stopPropagation();SceneManager._scene._setTab('${tab.id}')">${_escapeHtml(tab.label)}</div>
    `).join('');
  };

  // The one back control this panel has, at the top left of the tab bar,
  // written the way every other back control in these menus is written: the
  // `.npc-back-btn` chip, an arrow and the word for what it does. It used to be
  // a bare arrow dressed as a tab, which read as a tab you could not open.
  //
  // With somewhere to return to it steps back through the wiki navigation
  // stack; with nowhere, `opts.closeWhenEmpty` turns it into the panel's close
  // control (the entity articles, which are always opened from somewhere) and
  // otherwise it is simply not drawn (a person's own panel, which is the
  // bottom of the stack).
  Scene_NPCEmpathize.prototype._buildBackBtnHTML = function (T, opts) {
    const canReturn = Scene_NPCEmpathize._returnStack.length > 0;
    if (!canReturn && !(opts && opts.closeWhenEmpty)) return '';
    const label = canReturn ? T.back : T.close;
    const call  = canReturn ? '_leave()' : '_leave(true)';
    return `
      <span class="npc-back-btn npc-tab-back" title="${_escapeHtml(label)}"
            onmousedown="event.stopPropagation();SceneManager._scene.${call}">← ${_escapeHtml(label)}</span>`;
  };

  // The chip that sits in front of the first tab and names the button that
  // changes tab: the shoulder buttons when a pad is plugged in, TAB otherwise.
  // Directions deliberately no longer walk the tab bar (they stay inside the
  // open tab), so without this the control is invisible.
  Scene_NPCEmpathize.prototype._buildTabHintHTML = function () {
    const pad = window.AnalogStickInput;
    const onPad = !!(pad && typeof pad.hasPad === 'function' && pad.hasPad());
    // i18n-ignore-start: physical controller / keyboard button ids
    const label = onPad ? 'L1 R1' : 'TAB';
    // i18n-ignore-end
    return `<div class="npc-tab-hint" data-pad="${onPad ? '1' : '0'}">${label}</div>`;
  };

  // ============================================================================
  // Left panel
  // ============================================================================

  // The attribute names the game shows everywhere else (js/i18n/<lang>/stats.json,
  // the same bank the status screen reads), not the engine's own ATK/DEF/MAT/MDF:
  // the panel was printing a different set of labels over the same six numbers
  // the character sheet already names STR/CON/DEX/INT/WIS/PSI. That bank sits at
  // the i18n root, which window.T does not cover, so it is read the same way this
  // file already reads enemyArchetypes.json: once, lazily, on the render thread.
  let _statsI18nCache = null;
  let _statsI18nLang  = null;
  function _statLabels() {
    const lang = ConfigManager.language || 'en';
    if (_statsI18nCache === null || _statsI18nLang !== lang) {
      _statsI18nCache = {};
      _statsI18nLang  = lang;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `js/i18n/${lang}/stats.json`, false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) _statsI18nCache = JSON.parse(xhr.responseText);
      } catch (_) { /* fall back to the English names below */ }
    }
    const s = _statsI18nCache;
    return {
      atk: s['ATT']     || 'STR',
      def: s['DEF']     || 'CON',
      agi: s['AGILITY'] || 'DEX',
      mat: s['M.ATT']   || 'INT',
      mdf: s['M.DEF']   || 'WIS',
      luk: s['LUCK']    || 'PSI',
    };
  }

  // The character sheet numbers, paired off into two columns so the whole set
  // fits the narrow left page under the portrait. The level is not repeated
  // here, it is already in the name block right above. Lives on the left rather
  // than in the Info tab so it is readable whatever tab is open. Ordered the way
  // the status screen orders them, so one character reads the same in both.
  function _buildStatsGridHTML(profile, T) {
    if (!profile || profile.level === undefined) return '';
    const L = _statLabels();
    const shown = ([, v]) => v !== undefined && v !== null && v !== 0;
    // The six core stats read as one row, label above number; the secondary
    // ones keep their two-per-line label and value layout.
    const core = [
      [L.atk, profile.atk], [L.def, profile.def],
      [L.agi, profile.agi], [L.mat, profile.mat],
      [L.mdf, profile.mdf], [L.luk, profile.luk],
    ].filter(shown);
    const extra = [
      [T.arcaneLbl,       profile.arcane],
      [T.substanceLbl,    profile.substance],
      [T.stealthLbl,      profile.stealth],
      [T.intimidationLbl, profile.intimidation],
    ].filter(shown);
    if (!core.length && !extra.length) return '';

    const cells = rows => rows.map(([label, value]) =>
      `<div class="npc-stat-cell"><span class="npc-stat-lbl">${_escapeHtml(label)}</span>` +
      `<span class="npc-stat-val">${_escapeHtml(String(value))}</span></div>`).join('');
    let html = `<div class="npc-sec-hdr npc-mt-2">${_escapeHtml(T.stats)}</div>`;
    if (core.length)  html += `<div class="npc-stat-grid npc-stat-grid--row">${cells(core)}</div>`;
    if (extra.length) html += `<div class="npc-stat-grid">${cells(extra)}</div>`;

    const expMgr = window.NPCSim?.ExpManager;
    if (expMgr && profile.exp !== undefined && profile.assignedClassId) {
      const cid   = profile.assignedClassId;
      const floor = expMgr.expForLevel(cid, profile.level);
      const ceil  = expMgr.expForLevel(cid, (profile.level ?? 1) + 1);
      const pct   = ceil > floor
        ? Math.min(100, Math.max(0, Math.round((profile.exp - floor) / (ceil - floor) * 100)))
        : 100;
      html +=
        `<div class="npc-exp-section">` +
          `<div class="npc-exp-label">EXP ${pct}%</div>` +
          `<div class="npc-exp-track"><div class="npc-exp-fill" style="--npc-w:${pct}%"></div></div>` +
        `</div>`;
    }
    return html;
  }

  Scene_NPCEmpathize.prototype._buildLeftPanelHTML = function (bustPath, profile, predispositions, T, ident, attractions, modelSpec, animalStatus) {
    let hpmpHTML = '';
    if (profile?.mhp !== undefined || profile?.mmp !== undefined) {
      const mhp    = profile.mhp ?? 0;
      const mmp    = profile.mmp ?? 0;
      const hpPct  = Math.min(100, Math.round((mhp / 2000) * 100));
      const mpPct  = Math.min(100, Math.round((mmp / 500)  * 100));
      hpmpHTML =
        `<div class="npc-vital-row">` +
          `<span class="npc-vital-lbl">${T('Equip.hp')}</span>` +
          `<div class="npc-vital-track"><div class="npc-vital-fill npc-fill--bad" style="--npc-w:${hpPct}%"></div></div>` +
          `<span class="npc-vital-pct npc-vital-pct--num">${mhp}</span>` +
        `</div>` +
        `<div class="npc-vital-row">` +
          `<span class="npc-vital-lbl">${T('Equip.mp')}</span>` +
          `<div class="npc-vital-track"><div class="npc-vital-fill npc-fill--mp" style="--npc-w:${mpPct}%"></div></div>` +
          `<span class="npc-vital-pct npc-vital-pct--num">${mmp}</span>` +
        `</div>`;
    }

    // Which party member is currently interacting (character switcher).
    const isNpcMode = this._actorId == null && this._eventId != null;
    const members   = $gameParty?.members() ?? [];
    const focusIdx  = this._focusIndex ? this._focusIndex() : 0;

    // Character switcher: pick the interacting party member. Each has their own
    // reputation with this NPC (trait compatibility included), and interactions
    // only move the selected member's standing.
    let switcherHTML = '';
    if (isNpcMode && members.length > 1) {
      // Handing the conversation to the next member is L2 / R2 on a pad and
      // , / . on a keyboard, kept in step with the pad coming and going by
      // _syncTabHint in NPCEmpathize.js.
      const onPad = !!window.AnalogStickInput?.hasPad?.();
      // i18n-ignore-start: physical controller / keyboard button ids
      const hintLabel = onPad ? 'L2 R2' : ', .';
      // i18n-ignore-end
      const hint = `<span class="char-switch-hint npc-focus-hint">${hintLabel}</span>`;
      // Chips were styled off the parchment palette (near-black browns), which
      // on this panel's black page left the selected name framed in something
      // invisible. Theme tokens instead, in theme.css with the rest of them.
      const chips = members.map((m, idx) => {
        const on = idx === focusIdx;
        return `<div class="npc-focus-chip${on ? ' on' : ''}" ` +
          `onmousedown="event.stopPropagation();SceneManager._scene._selectFocusActor(${idx})">` +
          `${_escapeHtml(m.name())}</div>`;
      }).join('');
      switcherHTML =
        `<div class="npc-focus-switcher">` +
        `<span class="npc-focus-switcher-lbl">${_escapeHtml(T.interactingAs)}</span>` +
        `${chips}${hint}</div>`;
    }

    let predHTML = '';
    if (predispositions?.length) {
      predHTML = `<div class="npc-sec-hdr npc-mt-2">${T.predisposition}</div>`;
      predispositions.forEach(({ actor, score }, idx) => {
        const pct   = Math.round((score + 100) / 2);
        const band  = score < -30 ? 'bad' : score > 30 ? 'good' : 'warm';
        const sign  = score >= 0 ? '+' : '';
        const on    = idx === focusIdx && isNpcMode;
        predHTML += `
          <div class="npc-pred-row npc-pickable${on ? ' npc-pred-focus on' : ''}" onmousedown="event.stopPropagation();SceneManager._scene._selectFocusActor(${idx})">
            <span class="npc-pred-name">${on ? '▸ ' : ''}${_escapeHtml(actor.name())}</span>
            <div class="npc-pred-track"><div class="npc-pred-fill npc-fill--${band}" style="--npc-w:${pct}%"></div></div>
            <span class="npc-pred-val npc-score--${band}">${sign}${score}</span>
          </div>`;
      });
    }

    // A second, separate bar per party member: how drawn this NPC is to them,
    // moved only by courting (never by an ordinary conversation, a gift or a
    // trade), so it reads apart from Predisposition rather than inside it.
    let attrHTML = '';
    if (attractions?.length) {
      attrHTML = `<div class="npc-sec-hdr npc-mt-2">${T.attractionLbl}</div>`;
      attractions.forEach(({ actor, score }, idx) => {
        const pct   = Math.round((score + 100) / 2);
        const band  = score < -30 ? 'bad' : score > 30 ? 'good' : 'warm';
        const sign  = score >= 0 ? '+' : '';
        const on    = idx === focusIdx && isNpcMode;
        attrHTML += `
          <div class="npc-pred-row npc-pickable${on ? ' npc-pred-focus on' : ''}" onmousedown="event.stopPropagation();SceneManager._scene._selectFocusActor(${idx})">
            <span class="npc-pred-name">${on ? '▸ ' : ''}${_escapeHtml(actor.name())}</span>
            <div class="npc-pred-track"><div class="npc-pred-fill npc-fill--${band}" style="--npc-w:${pct}%"></div></div>
            <span class="npc-pred-val npc-score--${band}">${sign}${score}</span>
          </div>`;
      });
    }
    const statsHTML = _buildStatsGridHTML(profile, T);

    const topInfoHTML = (hpmpHTML || statsHTML || predHTML || attrHTML)
      ? `${hpmpHTML}${statsHTML}${predHTML}${attrHTML}<hr class="npc-r-sep">`
      : '';

    let vitalsHTML = '';
    if (profile?.hunger !== undefined) {
      // While Em is in the party the needs answer to her vocabulary instead of
      // the clinical one (CharacterCreationPresets.emLabel); everyone else sees
      // the ordinary labels, which are the fallbacks passed in here.
      const need = (key, label) => window.CharacterPresets?.emLabel?.(key, label) ?? label;
      vitalsHTML =
        _vitalRow(need('needHunger',  T.hungerLabel),  profile.hunger,  30) +
        _vitalRow(need('needSleep',   T.sleepLabel),   profile.sleep,   20) +
        _vitalRow(need('needHygiene', T.hygieneLabel), profile.hygiene, 30) +
        _vitalRow(need('needSocial',  T.socialLabel),  profile.social,  25) +
        _vitalRow(need('needLeisure', T.leisureLabel), profile.leisure, 25);
    }

    // An addiction meter belongs to the person, not the profile, so it is only
    // drawn when this panel is looking at a real party member. It fills as the
    // craving grows, which is why its warning band is the high end.
    const cravingActor = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    if (cravingActor && window.AddictionSystem) {
      window.AddictionSystem.cravingsFor(cravingActor).forEach(craving => {
        vitalsHTML += _cravingRow(craving.label, craving.value);
      });
    } else if (isNpcMode && profile && !this._isNonSentientSubject?.()) {
      vitalsHTML += _npcCravingRowsHTML(profile, profile._eventName || ident?.name);
    }

    let needHTML = '';
    if (profile?.currentNeed) {
      const needLabels = _needLabels(T);
      needHTML = `<div class="npc-need-badge">${_iconSpan(NEED_ICONS[profile.currentNeed] || 0, 14)}<span>${_escapeHtml(needLabels[profile.currentNeed] || profile.currentNeed)}</span></div>`;
    }

    let hostileHTML = '';
    const nowMin = $gameVariables?.value(114) ?? 0;
    const recentAttack = (profile?.eventLog ?? []).some(
      e => e.tag === 'crime' && e.desc === 'attacked by player' && (e.gameMin ?? 0) >= nowMin - 3 * 1440 // i18n-ignore: event-log record id
    );
    if (recentAttack) {
      hostileHTML = `<div class="npc-need-badge npc-need-badge--hostile">` +
        `${_iconSpan(12, 14)}<span>${_escapeHtml(T('Empathize.hostileBadge'))}</span></div>`;
    }

    let lastMetHTML = '';
    const lastDay = _lastInteractionDay(profile);
    if (lastDay !== null) {
      const todayDay = Math.floor(nowMin / 1440);
      const diff     = todayDay - lastDay;
      const metLabel = diff <= 0
        ? T('Empathize.metToday')
        : diff === 1 ? T('Empathize.metYesterday') : T.n('Empathize.metDaysAgo', diff, { n: diff });
      lastMetHTML = `<div class="npc-note npc-mt-1">${_escapeHtml(metLabel)}</div>`;
    } else if (profile) {
      lastMetHTML = `<div class="npc-note npc-mt-1">${_escapeHtml(T('Empathize.firstMeeting'))}</div>`;
    }

    let identHTML = '';
    if (ident && (ident.name || ident.className || ident.level != null || ident.age != null)) {
      const metaBits = [];
      if (ident.level != null) metaBits.push(`${T.levelAbbr}${ident.level}`);
      if (ident.className)     metaBits.push(ident.className);
      if (ident.age != null)   metaBits.push(`${ident.age} ${T.yearsAbbr}`);
      identHTML =
        `<div class="npc-left-ident">` +
          (ident.name ? `<div class="npc-left-name">${_escapeHtml(ident.name)}</div>` : '') +
          // A person can be kept on the reading list like any article.
          (ident.name ? _wikiFavStarHTML('npc', ident.name, ident.name, T) : '') +
          (metaBits.length ? `<div class="npc-left-meta">${_escapeHtml(metaBits.join(' · '))}</div>` : '') +
        `</div>`;
    }

    // A creature's frame is an empty box the viewer's canvas is placed into
    // (see _syncPortrait3D); everybody else keeps the bust.
    const portraitHTML = modelSpec
      ? `<div class="npc-portrait-wrap npc-portrait-3d"></div>`
      : `<div class="npc-portrait-wrap">
        <img src="${bustPath}" alt="" onerror="this.src='img/busts/7.png'">
      </div>`;

    return `
      ${portraitHTML}
      ${identHTML}
      ${switcherHTML}
      <div class="npc-vitals-footer">
        ${topInfoHTML}
        ${vitalsHTML}${needHTML}${hostileHTML}${lastMetHTML}
        ${_animalPanelHTML(animalStatus)}
      </div>`;
  };

  // ============================================================================
  // FAMILY NAMESPACE (NPCEmpathizeUI_*.js)
  // ============================================================================
  // The five screens are split across the NPCEmpathizeUI_*.js modules listed
  // in js/plugins.js right after this file: this entry keeps the local
  // helpers and SCREEN 1 (the panel), _Chat holds SCREEN 2, _Dossier SCREEN 3,
  // _Wiki SCREENS 4 and 5 and _Lessons the lesson sheets. Each module reads the
  // helpers it shares with the others off Scene_NPCEmpathize._internal (the
  // class every one of them draws on) and publishes its own there; a name
  // owned by a module that loads later is bound through _late, which
  // NPCEmpathizeUI_Lessons.js runs once the family is in.

  Scene_NPCEmpathize._internal = { _late: [] };
  Object.assign(Scene_NPCEmpathize._internal, {
    _activityLabel, _addNpcAttraction, _addNpcOpinion, _addPairBond, _alienIdentity,
    _archetypeRowLabel, _atypeName, _axisBarRow, _bustUrl, _ccHover, _collapseByDay,
    _conversionRowText, _countRecentInteractions, _diseaseVialId, _emblemOf, _emStanceKey,
    _emVoiceLine, _encId, _escapeHtml, _euros, _eventRows, _extractClassId, _extractContacts,
    _factionDisplayName, _feedCalories, _feedKind, _feedOpinion, _gameStamp,
    _getActorSpecializations, _getNPCName, _getNpcSpecializations, _getProfile, _getT,
    _goldTextToEuros, _headTitle, _homeAddressLabel, _homeTownLabel, _hygienePenalty,
    _hygieneReadout, _iconSpan, _ideologyLabel, _infectChance, _isBubbaActor, _isBubbaNpc,
    _isEmActor, _kvRow, _LEADER_OF_KIND, _leaderIdeology, _linkify, _meterRow, _needLabels,
    _paramLabels, _personalitySocialMult, _presetAge, _presetBirthDate, _presetClassName,
    _presetGenderLabel, _presetHometown, _presetLore, _rand, _refugeeRowText, _resolveBustPath,
    _socialLines, _statBarRow, _swapHTML, _timesSuffix, _topicHtml, _traitDisplayName,
    _travelRowText, _viewName, _wikiDeathDate, _wikiIsDead, _wikiLink, _worldName, _wtypeName,
    FUN_ACTIONS, NEED_ICONS, T2, vary, Wiki,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let _courtRefused, _isBubbaromanticNpc, _personalityLabel, _WEB_WHEEL_STEP, _wikiFavStarHTML;
  Scene_NPCEmpathize._internal._late.push(() => ({
    _courtRefused, _isBubbaromanticNpc, _personalityLabel, _WEB_WHEEL_STEP, _wikiFavStarHTML,
  } = Scene_NPCEmpathize._internal));
})();
