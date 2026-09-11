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

(function () {
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
    _joinChance, _joinLevelOk, _travellingPartyCount, _hasSelfSwitchAPage,
    _animalJoinChance, _wisMod,
    _diseaseVialItems, _diseaseVialId, _infectChance,
    _socialLines, _rand, _vary, _addNpcOpinion, _personalitySocialMult,
    _hygienePenalty, _hygieneReadout,
    _addNpcAttraction, _npcEffectiveAttraction, _computePartyAttraction,
    _emPlaythrough, _isEmActor, _isBubbaNpc, _emContext, _emStanceKey, _emStanceData,
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
      const isCreature = !!actor._isCreatureActor ||
        NC.isNonSentientActor(actor) ||
        (keys.length > 0 && !(keys.length === 1 && keys[0] === 'Humanoid'));
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

  const NEED_ICONS = {
    sleep: 11, home: 11, hunger: 259, hygiene: 67, work: 4, shopwork: 4, money: 314,
    crime: 174, safety: 128, comfort: 226, social: 246, leisure: 80,
  };

  function _needLabels(T) {
    return {
      sleep: T.atHome || T.resting || 'At Home', home: T.atHome || 'At Home', hunger: T.hungry, hygiene: T.freshening, work: T.working, shopwork: T.working,
      money: T.earning, crime: T.scheming, safety: T.wary, comfort: T.relaxing,
      social: T.socializing, leisure: T.leisure, traveling: T.traveling,
    };
  }

  // Interacting with an NPC while they're riding a PublicTransport-group map
  // (bus/tram/train) overrides their routine's current hour to "Traveling",
  // regardless of whatever the day's generated plan had scheduled, since
  // they're plainly not doing that right now, see Scene_NPCEmpathize.create.
  function _markTravelingIfOnTransport(eventId) {
    const RM = window.NPCSim?.RoutineManager;
    if (!RM || eventId == null) return;
    const seatedGroups = window.NPCSystem?.SEATED_GLOBAL_GROUPS;
    if (!seatedGroups?.length) return;
    const groupName = window.NPCSystem?.findMapGroupByMap?.($gameMap?.mapId());
    if (!groupName || !seatedGroups.includes(groupName)) return;

    const npcName = _getNPCName(eventId);
    const profile = npcName && _getProfile(npcName);
    if (!profile) return;

    RM.ensureRoutine(profile);
    const nowMin  = $gameVariables?.value(114) ?? 0;
    const hourNow = Math.floor((nowMin % 1440) / 60);
    profile.routine[hourNow] = 'traveling';
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
  // an NPC shows as trained: whatever its class/traits grant a head start in,
  // plus 3-6 random ones (deterministic per NPC, cached on the profile so they
  // don't reroll every redraw) so every NPC feels individually specialized.
  // Only specializations above Untrained are ever returned - the "random"
  // picks are simply pre-rolled as already trained (level 2-4).
  function _getNpcSpecializations(profile, classId, dl, npcName) {
    if (!window.Specializations || !window.Specializations.ready) return [];
    // The cache holds the rolled id -> level pairs, not the rendered rows.
    if (profile && Array.isArray(profile._specCache?.levels))
      return _specRows(new Map(profile._specCache.levels));

    const levelById = new Map();
    const className = (classId != null && $dataClasses?.[classId]) ? $dataClasses[classId].name : null;
    const traitSlugs = [];
    (profile?.traitIds || []).forEach((id) => {
      const trait = dl?.traits?.find((t) => t.id === id);
      const slug = trait?.name ? trait.name.split('.')[1] : null;
      if (slug) traitSlugs.push(slug);
    });

    window.Specializations.list.forEach((spec) => {
      let lvl = 0;
      if (className && spec.classStart?.[className]) lvl = Math.max(lvl, spec.classStart[className]);
      traitSlugs.forEach((slug) => {
        if (spec.traitStart?.[slug]) lvl = Math.max(lvl, spec.traitStart[slug]);
      });
      if (lvl > 1) levelById.set(spec.id, lvl);
    });

    const rng = _seededRandom(`${npcName || 'npc'}:specializations`);
    const extraCount = 3 + Math.floor(rng() * 4); // 3..6
    const pool = window.Specializations.list.filter((s) => !levelById.has(s.id));
    for (let i = 0; i < extraCount && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      const spec = pool.splice(idx, 1)[0];
      levelById.set(spec.id, 2 + Math.floor(rng() * 3)); // 2..4, Beginner-Advanced
    }

    // Levels another system has pinned onto this person, which always win over
    // the rolled ones (ErisTrial.js writes Law onto the world's five advocates,
    // so a defence lawyer reads as one here too).
    const overrides = profile && profile._specOverrides;
    if (overrides) {
      for (const [id, lvl] of Object.entries(overrides)) {
        const n = Number(lvl);
        if (n > 1) levelById.set(Number(id), Math.max(levelById.get(Number(id)) || 0, n));
      }
    }

    if (profile) profile._specCache = { levels: Array.from(levelById.entries()) };
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
    _markTravelingIfOnTransport(this._eventId);
    this._buildOverlay();
    this._render();
    setTimeout(() => { if (this._overlay) this._overlay.classList.add('npc-shown'); }, 16);
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
      wrap.appendChild(this._portrait3D.canvas);
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
    };
    this._portrait3D = state;

    // A party member is built through the shared service, so it is the same
    // model the status sheet builds, with the same look seed. Anybody else has
    // their look rolled off the enemy id, exactly as the Bestiary rolls it, so
    // the same creature is the same colours every time.
    let loadPromise;
    if (spec.info && window.ActorModel3D) {
      loadPromise = window.ActorModel3D.build(spec.info);
    } else {
      const enemyData = spec.enemyData;
      const fake = { enemyId: () => enemyData.id, index: () => 0, enemy: () => enemyData };
      const made = window.Battler3D.create(spec.key, 0, 0, fake);
      if (!made) { this._destroyPortrait3D(); return; }
      loadPromise = Promise.resolve(made.load(null, 0, 0, 0)).then(() => made);
    }

    loadPromise.then((battler) => {
      if (state.disposed || !battler || !battler.model) return;
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
    }).catch(() => {});

    const FRAME = 1 / 30;
    const animate = () => {
      if (state.disposed) return;
      state.rafId = requestAnimationFrame(animate);
      state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
      if (state.frameAcc < FRAME) return;
      state.frameAcc = 0;
      // The portrait is a still: the model holds the pose it loaded in, and
      // neither turns nor plays an animation. The frame is only redrawn so the
      // picture survives a context or texture arriving late.
      if (window.PSXShader) window.PSXShader.render(renderer, scene, camera);
      else renderer.render(scene, camera);
    };
    animate();
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
  Scene_NPCEmpathize.prototype._inListSubMode = function () {
    return !!(this._directionsMode || this._giftMode || this._feedMode ||
              this._stealMode || this._bribeMode || this._socialMode ||
              this._romanceMode || this._proposeMode || this._cardMode ||
              this._infectMode);
  };

  Scene_NPCEmpathize.prototype._activeScrollPane = function () {
    if (!this._overlay) return null;
    // The text-entry modal covers the panel, nothing behind it may move.
    if (this._chatModalOpen) {
      const ta = this._chatModalEl?.querySelector('#npc-dlg-ask-input');
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
    // the fourth person to say yes signs on as an inactive member and waits on
    // the Dynamics board, so the offer is made whatever the party's size (see
    // NPCSystemParty.joinParty).
    const partyFull = this._justJoined === true;

    // Recruiting flips the event's self-switch A so the NPC leaves the map. An
    // event with no page gated on self-switch A has nothing to fall through to,
    // so it would keep standing there as a twin of the party member - don't
    // offer Join at all for those.
    // A shop-shift-covered counter also happens to have such a page (a leftover
    // template artifact, never meant for this), but the face on display is a
    // rotating persona borrowed cosmetically, not someone actually free to
    // travel: flipping the counter's own self-switch A would strand it on its
    // blank page instead (see ShopShiftManager.isShopEvent), so Join is never
    // offered on one.
    const canVanishOnJoin = !shiftInfo && _hasSelfSwitchAPage(evId);

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
    this._chatActions = remoteMode
      ? []
      : actorMode
      ? [
          { id: 'socialize',  label: T.socializeLabel },
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
        ['freeChat', 'attack', 'cough', 'spit', 'bite', 'infect', 'join']
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
          this._chatActions.push({
            id: 'animalJoin',
            label: `${animal.owned ? _TAroot('actionConvince') : _TAroot('actionJoinPet')} (~${odds}%)`,
            disabled: _travellingPartyCount() >= 3,
          });
          // The other half of the same question: an animal can also be asked
          // to travel as one of the party rather than behind it, which is the
          // same roll and needs one of the three slots free.
          this._chatActions.push({
            id: 'animalJoinParty',
            label: `${_TAroot('actionJoinPartyAnimal')} (~${odds}%)`,
            disabled: !window.PetSystem?.hasFreeSlot?.(),
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
      const VISITOR_KEEP = new Set(['freeChat', 'socialize', 'directions']);
      this._chatActions = this._chatActions.filter(a => VISITOR_KEEP.has(a.id));
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
      this._tabBarEl.innerHTML = this._buildTabsHTML(T);
      this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }
    this._leftEl.innerHTML = leftHTML;
    // The frame is in the DOM now, so the viewer can be moved into it (or
    // stood up, if this is a different creature from the one it was showing).
    this._syncPortrait3D(modelSpec);

    if (showingChatUI) {
      this._rightEl.classList.add('npc-right-panel--chat');
    } else {
      this._rightEl.classList.remove('npc-right-panel--chat');
    }
    this._rightEl.innerHTML = rightHTML;

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
    const rows = [
      [L.atk, profile.atk], [L.def, profile.def],
      [L.agi, profile.agi], [L.mat, profile.mat],
      [L.mdf, profile.mdf], [L.luk, profile.luk],
      [T.arcaneLbl,       profile.arcane],
      [T.substanceLbl,    profile.substance],
      [T.stealthLbl,      profile.stealth],
      [T.intimidationLbl, profile.intimidation],
    ].filter(([, v]) => v !== undefined && v !== null && v !== 0);
    if (!rows.length) return '';

    let html = `<div class="npc-sec-hdr npc-mt-2">${_escapeHtml(T.stats)}</div>`;
    html += '<div class="npc-stat-grid">';
    html += rows.map(([label, value]) =>
      `<div class="npc-stat-cell"><span class="npc-stat-lbl">${_escapeHtml(label)}</span>` +
      `<span class="npc-stat-val">${_escapeHtml(String(value))}</span></div>`).join('');
    html += '</div>';

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
      // Not CharSwitcher.parts(): that names TAB / the bumpers, which in this
      // panel change tab. Handing the conversation to the next member is SHIFT
      // on a keyboard and SELECT on a pad, kept in step with the pad coming and
      // going by _syncTabHint in NPCEmpathize.js.
      const onPad = !!window.AnalogStickInput?.hasPad?.();
      // i18n-ignore-start: physical controller / keyboard button ids
      const hintLabel = onPad ? 'SELECT' : 'SHIFT';
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
    // height the panel actually has, BEFORE the siblings are measured below.
    const actions = panel.querySelector('.npc-chat-actions-row');
    if (actions) {
      actions.style.setProperty('--npc-actions-max', `${Math.max(96, Math.round(avail * 0.45))}px`);
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
    } else if (this._socialMode) {
      actionsHTML = this._buildInlineSocialActions(T);
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
      actionsHTML = (this._chatActions || []).map((item, i) => {
        const focused  = i === this._menuIndex ? ' npc-action-focused' : '';
        const disabled = item.disabled ? ' npc-action-disabled' : '';
        return `<div class="npc-chat-action-btn${focused}${disabled}" onmousedown="event.stopPropagation();SceneManager._scene._runAction('${item.id}')">` +
          `<span class="${OPT}">${_escapeHtml(item.label)}</span></div>`;
      }).join('');
    }

    return `
      <div class="npc-chat-panel">
        <div class="npc-chat-header">
          <span>${_escapeHtml(displayName)}</span>
        </div>
        <div class="npc-chat-bubbles" id="npc-dlg-chat">${bubblesHTML}${typingHTML}</div>
        ${joinMsgHTML}
        ${actionsHTML ? `<div class="npc-chat-actions-row">${actionsHTML}</div>` : ''}
        ${remoteMode
          ? `<div class="npc-chat-elsewhere">${_escapeHtml(T('Empathize.npcElsewhere', { name: displayName }))}</div>`
          : `<div class="npc-chat-input-row">
          <button class="npc-chat-open-modal" onmousedown="event.stopPropagation();SceneManager._scene._openChatModal?.()">
            <span class="npc-chat-open-modal-icon">${_iconSpan(4, 15)}</span>
            <span class="npc-chat-open-modal-label">${_escapeHtml(T.typePlaceholder)}</span>
          </button>
        </div>`}
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

    let html = '';
    if (isLawNPC) {
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
          ? `<span class="npc-tag">${_iconSpan(trait.icon || TRAIT_ICON, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`
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
        return sk ? `<span class="npc-tag">${_iconSpan(sk.iconIndex || SKILL_ICON, 15)}${_escapeHtml(sk.name)}</span>` : '';
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

  Scene_NPCEmpathize.prototype._buildInfoHTML = function (displayName, subParts, profile, T, dl, opinion, lang, classId, npcName, preset) {
    // Looking at a real party member: everything the player owns on that
    // character (specializations, what they are carrying) is read off the actor
    // rather than off the society roll for somebody of the same name.
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
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
        ${wealthLabel ? `<span class="npc-badge">${_escapeHtml(wealthLabel)}</span>` : ''}
        <span class="npc-badge npc-score--${moralBand}">Mor. ${morality} (${_escapeHtml(moralEntry.label)})</span>
        ${profile?._isPresetCharacter ? `<span class="npc-badge">${_iconSpan(82, 15)}${_escapeHtml(T.presetCharacterBadge)}</span>` : ''}
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
      if (wealthLabel)  identHTML += `<div class="npc-ident-row">${_iconSpan(314, 17)}<span>${_escapeHtml(wealthLabel)}</span></div>`;
      const homeAddr = _homeAddressLabel(profile, T);
      if (homeAddr) {
        identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(T.residenceLbl || 'Residence')}:</span>&nbsp;<span>${_escapeHtml(homeAddr)}</span></div>`;
      } else if (profile?.isHomeless) {
        identHTML += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span class="npc-sub">${_escapeHtml(T.residenceLbl || 'Residence')}:</span>&nbsp;<span class="npc-bad">${_escapeHtml(T.homelessLbl || 'Homeless')}</span></div>`;
      }
      if (ideologyName) identHTML += `<div class="npc-ident-row">${_iconSpan(186, 17)}${_wikiLink('ideology', ideology ? ideology.id : '', ideologyName)}</div>`;
      if (faction)      identHTML += `<div class="npc-ident-row">${_iconSpan(faction.iconIndex || 187, 17)}${_wikiLink('faction', _factionDisplayName(faction))}</div>`;
      identHTML += `<div class="npc-ident-row">${_iconSpan(175, 17)}<span class="npc-score--${moralBand}">${_escapeHtml(moralEntry.label)}</span><span class="npc-faint">&nbsp;- ${morality}</span></div>`;
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
    const identity = npcName ? window.NPCPolitics?.getIdentity?.(npcName) : null;

    // "Citizen of": the home map-pool (settlement/group the NPC belongs to) is
    // shown first, then the political nation/power when a political identity
    // exists. The row renders even for NPCs with no political identity.
    const citizenParts = [];
    // Somebody who is not from here has no hometown and no nation: what they
    // have is a system they came from and a power out there that claims them,
    // so that is what the row says instead. Nothing on Earth applies to them.
    const alien = _alienIdentity(profile, npcName, this._eventId);
    if (alien) {
      citizenParts.push(`<span>${_escapeHtml(alien.originName)}</span>`);
      citizenParts.push(_wikiLink('power', alien.power, alien.powerName));
    } else {
      // The row reads town · nation · controlling hyperpower. The simulated
      // political identity answers for the last two when it exists, otherwise
      // they are resolved straight from the home group, so procedural citizens
      // (and anyone the politics sim has not reached yet) still show the nation
      // their town stands in and the power that nation answers to.
      const homeGroup = profile?._homeGroupName;
      const homeTown = _homeTownLabel(homeGroup);
      if (homeTown) citizenParts.push(`<span>${_escapeHtml(homeTown)}</span>`);
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

    if (identity || citizenParts.length) {
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
        if (trait) traitsHTML += `<span class="npc-tag">${_iconSpan(trait.icon || 0, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`;
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
    if (actorObj || (profile && window.NPCSocietyGetEquip)) {
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
        for (const e of equipItems) equipHTML += `<span class="npc-tag">${_iconSpan(e.iconIndex || 0, 15)}${_escapeHtml(e.name)}</span>`;
        equipHTML += '</div>';
      }
    }

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
          tags += `<span class="npc-tag npc-gold" title="${_escapeHtml(`${T.traits}: ${traitName}`)}">${_iconSpan(sk.iconIndex || 0, 15)}${_escapeHtml(sk.name)}</span>`;
        } else {
          tags += `<span class="npc-tag">${_iconSpan(sk.iconIndex || 0, 15)}${_escapeHtml(sk.name)}</span>`;
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
      if (profile.currentJobId && window.WorkSystem?.getJob) {
        const job = window.WorkSystem.getJob(profile.currentJobId);
        if (job) simHTML += `<div class="npc-ident-row">${_iconSpan(126, 17)}<span>${_escapeHtml(window.WorkSystem.jobName(job))}</span></div>`;
      }
      if (profile.money !== undefined) {
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
      ${skillsHTML}
      ${simHTML}`;
  };

  // ============================================================================
  // SCREEN 3 OF 5: THE LEDGER
  // ============================================================================
  // Who this person knows and who they love. The social web draws the contact
  // graph and the romance record below it draws the orientation, the standing
  // and the history. Both are read from the profile, so both band their
  // numbers rather than colouring them.

  // ============================================================================
  // Social web panel
  // ============================================================================

  // The graph is plain markup, not a canvas. Every earlier version painted it
  // imperatively in a frame callback after the render, and so had to survive the
  // panel being rebuilt underneath it, bust images landing late, and a stale
  // overlay owning the element - the failure mode being a tab that flashed the
  // web once and then sat there as an empty grey rectangle. An inline SVG is
  // part of the same innerHTML as the rest of the tab, so it is simply correct
  // on every render: nothing to schedule, nothing to clear, nothing to redraw
  // when an image finishes loading. The viewBox is sized to the finished
  // layout at 1:1, so the whole web fits at the default zoom and there is
  // nothing to pan by default - but a crowded roster earns its rings back via
  // the same zoom/pan the SkillMaster atlas uses (SkillMaster.js): the SVG's
  // own pixel size (not its viewBox) is scaled by `webZoom()`, sitting inside
  // a `.npc-web-sizer` box whose CSS size drives `.npc-web-stage`'s native
  // scrollLeft/scrollTop, so panning is just scrolling and needs no transform
  // math of its own. The wheel and L2/R2 zoom (about the pointer / the centre);
  // dragging anywhere but a node pans; a click on a node still fires immediately,
  // unaffected, because panning only ever arms on a press that starts off one.

  const _WEB_RING_CAP  = 8;   // nodes on the innermost ring
  const _WEB_RING_STEP = 4;   // each ring outward holds this many more
  const _WEB_R0        = 120; // radius of the innermost ring
  const _WEB_DR        = 98;  // gap between rings
  const _WEB_NODE_R    = 26;
  const _WEB_CENTER_R  = 34;
  const _WEB_MAX_NODES = 40;  // beyond this the graph is unreadable, the roster carries the rest

  // Everyone this person is connected to: the "met X" entries in their life log
  // merged with their standing relationships, so an acquaintance nobody has been
  // seen meeting yet still gets a (faint, dashed) thread of their own.
  // Whether this sheet belongs to somebody the history book seats in office.
  function _isWorldLeaderProfile(profile, npcName) {
    if (profile?._isWorldLeader) return true;
    try { return !!window.LeaderPersona?.isLeader?.(npcName); } catch (e) { return false; }
  }

  function _webContacts(profile, npcName) {
    const byName = new Map();
    for (const c of _extractContacts(profile, Infinity)) {
      if (c.name) byName.set(c.name, { name: c.name, meetings: c.count, opinion: 0, known: false });
    }
    // Synthetic and debug profiles can carry null or primitive relationship
    // entries, so every field here is read defensively.
    const rels = profile?.relationships ?? {};
    for (const [name, rel] of Object.entries(rels)) {
      if (!name) continue;
      const e = byName.get(name) ||
        { name: String(name), meetings: 0, opinion: 0, known: false };
      e.meetings = Math.max(e.meetings, Number(rel?.meetCount) || 0);
      e.opinion  = Number(rel?.opinion) || 0;
      e.known    = true;
      byName.set(name, e);
    }
    // A world leader's web is the political class and nothing else. They deal
    // with other heads of state, ministers and popes; whoever else a passing
    // sentence has them meeting is not a connection worth drawing on the same
    // chart as a succession.
    let entries = [...byName.values()];
    if (_isWorldLeaderProfile(profile, npcName)) {
      const isLeader = (n) => {
        try { return !!window.LeaderPersona?.isLeader?.(n); } catch (e) { return false; }
      };
      entries = entries.filter(e => isLeader(e.name));
    }
    return entries.sort((a, b) =>
      (b.meetings - a.meetings) || String(a.name).localeCompare(String(b.name)));
  }

  // Warm, cold or indifferent. A thread nobody has walked yet stays bark-coloured.
  function _webEdgeColor(entry) {
    if (!entry.meetings)      return 'var(--bg-npc-bark)';
    if (entry.opinion >= 20)  return 'var(--bg-npc-forest)';
    if (entry.opinion <= -20) return 'var(--border-npc-red)';
    return 'var(--text-text-alt-4)';
  }

  // Concentric rings, closest relationships innermost. Returns node centres in
  // graph space (the focus node sits at the origin) plus the outermost radius,
  // which is what the viewBox is built from.
  function _webLayout(count) {
    const pts = [];
    let ring = 0, placed = 0, outer = 0;
    while (placed < count) {
      const cap    = _WEB_RING_CAP + ring * _WEB_RING_STEP;
      const len    = Math.min(cap, count - placed);
      const radius = _WEB_R0 + ring * _WEB_DR;
      for (let i = 0; i < len; i++) {
        // The half-turn offset per ring keeps outer nodes out of the shadow of
        // the inner ones, so no thread is drawn straight through a face.
        const angle = (i / len) * Math.PI * 2 - Math.PI / 2 + ring * 0.42;
        pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      }
      outer = radius;
      placed += len;
      ring++;
    }
    return { pts, outer };
  }

  Scene_NPCEmpathize.prototype._buildWebHTML = function (T, profile, npcName, bustPath) {
    const all = _webContacts(profile, npcName);
    // Rows and nodes share one list, so a click handler can address either by
    // the same index; the graph simply stops at the first _WEB_MAX_NODES.
    this._webList = all;
    const drawn = all.slice(0, _WEB_MAX_NODES);

    const { pts, outer } = _webLayout(drawn.length);
    const pad  = _WEB_NODE_R + 34; // room for the name printed under a node
    const half = Math.max(_WEB_CENTER_R + 46, outer + pad);
    const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`;

    const num = n => (Math.round(n * 10) / 10).toString();

    // i18n-ignore-start: inline SVG markup for the connections web
    const edges = drawn.map((e, i) => {
      const p = pts[i];
      const w = Math.max(1.6, Math.min(5.5, 1.4 + e.meetings / 8));
      const dash = e.meetings <= 1 ? ' stroke-dasharray="7 5"' : '';
      return `<line x1="0" y1="0" x2="${num(p.x)}" y2="${num(p.y)}" ` +
             `stroke="${_webEdgeColor(e)}" stroke-width="${num(w)}" stroke-linecap="round" ` +
             `opacity="${e.meetings ? '0.9' : '0.45'}"${dash}/>`;
    }).join('');

    // i18n-ignore-end

    // How many times they have actually met, printed on the thread itself.
    const tallies = drawn.map((e, i) => {
      if (!e.meetings) return '';
      const p = pts[i];
      const mx = num(p.x / 2), my = num(p.y / 2);
      return `<g class="npc-web-tally">` +
             `<circle cx="${mx}" cy="${my}" r="12"/>` +
             `<text x="${mx}" y="${my}">${'×' + e.meetings}</text></g>`;
    }).join('');

    // One node. `index < 0` marks the focus node, which is not clickable.
    // The initial is painted under the portrait rather than instead of it, so a
    // bust that is missing or still loading degrades to a lettered disc with no
    // callback, no cache and no second draw.
    // i18n-ignore-start: inline SVG markup for one node of the web
    const node = (x, y, r, label, path, index) => {
      const clip    = `npcWebClip${index < 0 ? 'C' : index}`;
      const initial = _escapeHtml((String(label)[0] || '?').toUpperCase());
      const short   = String(label).length > 14 ? String(label).slice(0, 13) + '…' : String(label);
      const attrs   = index < 0
        ? 'class="npc-web-node npc-web-node--center"'
        : `class="npc-web-node" onmousedown="event.stopPropagation();SceneManager._scene._openWebNode(${index})"`;
      const img = path
        ? `<image href="${_escapeHtml(path)}" xlink:href="${_escapeHtml(path)}" ` +
          `x="${num(x - r)}" y="${num(y - r)}" width="${num(r * 2)}" height="${num(r * 2)}" ` +
          `preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`
        : '';
      return `<g ${attrs}>` +
        `<clipPath id="${clip}"><circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/></clipPath>` +
        `<circle class="npc-web-disc" cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/>` +
        `<text class="npc-web-initial" x="${num(x)}" y="${num(y)}" font-size="${Math.round(r)}">${initial}</text>` +
        img +
        `<circle class="npc-web-rim" cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/>` +
        `<text class="npc-web-label" x="${num(x)}" y="${num(y + r + 16)}">${_escapeHtml(short)}</text>` +
        `</g>`;
    };

    // i18n-ignore-end

    const nodes = drawn.map((e, i) =>
      node(pts[i].x, pts[i].y, _WEB_NODE_R, e.name, _resolveBustPath(e.name, null), i)).join('');
    const centre = node(0, 0, _WEB_CENTER_R, npcName || '?', bustPath || null, -1);

    // The SVG's own pixel size (width/height, not its viewBox) is what the CSS
    // scale transform grows or shrinks; the sizer around it is set to match, so
    // its native scrollLeft/scrollTop is the pan. `webZoom()` persists on the
    // scene across re-renders (SkillMaster's atlas does the same), so leaving
    // the tab and coming back does not reset it.
    this._webBaseSize = { w: half * 2, h: half * 2 };
    const zoom = this.webZoom();

    // i18n-ignore-start: SVG frame for the web
    const graph =
      `<div class="npc-web-stage" id="npc-web-stage">
         <div class="npc-web-sizer" style="--npc-web-w:${Math.round(half * 2 * zoom)}px; --npc-web-h:${Math.round(half * 2 * zoom)}px">
           <svg class="npc-web-svg" viewBox="${viewBox}" width="${num(half * 2)}" height="${num(half * 2)}"
                style="--npc-web-zoom:${zoom}" xmlns="http://www.w3.org/2000/svg">
             ${edges}${tallies}${nodes}${centre}
           </svg>
         </div>
       </div>
       <div class="npc-web-legend">
         <span class="npc-web-zoom-controls">
           <span class="npc-web-zoom-btn" onmousedown="event.stopPropagation();SceneManager._scene.zoomWeb(-1)">&minus;</span>
           <span class="npc-web-zoom-btn" onmousedown="event.stopPropagation();SceneManager._scene.zoomWeb(1)">+</span>
         </span>
       </div>`;

    if (!all.length) {
      return `
        <div class="npc-web-fullscreen">
          <div class="npc-sec-hdr npc-mb-3">${T.socialWebTitle}</div>
          ${graph}
          <p class="npc-empty">${T.noContacts}</p>
          <p class="npc-note npc-faint">${T.contactsHint}</p>
        </div>`;
    }
    // i18n-ignore-end

    // The roster list of plain rows below the graph was dropped so the graph
    // itself can fill the whole tab; clicking a node is still how a contact's
    // own panel is opened (see _openWebNode below).
    return `
      <div class="npc-web-fullscreen">
        <div class="npc-sec-hdr npc-mb-3">${T.socialWebTitle}</div>
        ${graph}
      </div>`;
  };

  // A node was clicked: open that person's own panel, on their own Social
  // Web, so the player keeps walking the same graph outward.
  Scene_NPCEmpathize.prototype._openWebNode = function (index) {
    const entry = (this._webList || [])[index];
    if (!entry || !entry.name) return;
    SoundManager.playOk();
    window.NPCEmpathize?.openByName?.(entry.name, 'web');
  };

  // ── Social web: zoom / pan ─────────────────────────────────────────────────

  const _WEB_ZOOM_MIN  = 0.45;
  const _WEB_ZOOM_MAX  = 3.2;
  const _WEB_ZOOM_STEP = 1.2;   // one press of a legend button, or L2/R2 tapped
  const _WEB_WHEEL_STEP = 1.12; // one wheel tick

  Scene_NPCEmpathize.prototype._webStageEl = function () {
    return this._rightEl ? this._rightEl.querySelector('#npc-web-stage') : null;
  };

  // Whole-web-on-screen, matching what the fixed viewBox used to guarantee on
  // its own before zoom existed: fit the graph's diameter into the stage the
  // way it is CSS-sized (the stage now fills the right page top to bottom, so
  // its height tracks the panel's own clientHeight minus the header/legend
  // chrome around it), read off `_rightEl` since the stage itself is
  // mid-rebuild when this runs.
  Scene_NPCEmpathize.prototype._defaultWebZoom = function () {
    const base = this._webBaseSize;
    if (!base) return 1;
    const w = Math.max(280, (this._rightEl ? this._rightEl.clientWidth : 520) - 40);
    const h = Math.max(240, (this._rightEl ? this._rightEl.clientHeight : 500) - 90);
    const fit = Math.min(w, h) / Math.max(base.w, base.h);
    return Math.max(_WEB_ZOOM_MIN, Math.min(1.4, fit));
  };

  Scene_NPCEmpathize.prototype.webZoom = function () {
    if (!this._webZoom) this._webZoom = this._defaultWebZoom();
    return this._webZoom;
  };

  // Anchor coordinates are in the stage's own scroll-content space (i.e.
  // scrollLeft/Top plus a point inside the viewport); the point under them is
  // held still while the graph grows or shrinks beneath it, the same trick
  // SkillMaster's atlas zoom uses (SkillMaster.js, setAtlasZoom).
  Scene_NPCEmpathize.prototype.setWebZoom = function (zoom, anchorX, anchorY) {
    const stage = this._webStageEl();
    const sizer = stage && stage.querySelector('.npc-web-sizer');
    const svg   = stage && stage.querySelector('.npc-web-svg');
    const base  = this._webBaseSize;
    if (!stage || !sizer || !svg || !base) return;
    const next = Math.max(_WEB_ZOOM_MIN, Math.min(_WEB_ZOOM_MAX, zoom));
    const prev = this.webZoom();
    if (Math.abs(next - prev) < 0.001) return;

    const ax = (anchorX === undefined) ? stage.scrollLeft + stage.clientWidth / 2 : anchorX;
    const ay = (anchorY === undefined) ? stage.scrollTop + stage.clientHeight / 2 : anchorY;
    const worldX = ax / prev;
    const worldY = ay / prev;

    this._webZoom = next;
    sizer.style.setProperty('--npc-web-w', Math.round(base.w * next) + 'px');
    sizer.style.setProperty('--npc-web-h', Math.round(base.h * next) + 'px');
    svg.style.setProperty('--npc-web-zoom', String(next));
    stage.scrollLeft += worldX * next - ax;
    stage.scrollTop  += worldY * next - ay;
    this._webScrollX = stage.scrollLeft;
    this._webScrollY = stage.scrollTop;
  };

  // The legend's +/- buttons and the discrete end of L2/R2.
  Scene_NPCEmpathize.prototype.zoomWeb = function (dir, anchorX, anchorY) {
    this.setWebZoom(
      dir > 0 ? this.webZoom() * _WEB_ZOOM_STEP : this.webZoom() / _WEB_ZOOM_STEP,
      anchorX, anchorY
    );
  };

  // Drag anywhere on the field to pan; a press that starts on a node is left
  // alone so the node's own onmousedown still opens it immediately (this panel
  // fires on mousedown throughout, not click, so there is no "did it travel"
  // window to swallow afterwards the way SkillMaster's atlas gets one). Native
  // scrollLeft/scrollTop is the pan, so no transform math is needed here.
  // Idempotent per element: a rebuilt stage is a new node and gets bound fresh.
  Scene_NPCEmpathize.prototype._bindWebStagePointer = function (stage) {
    if (!stage || stage._webPointerBound) return;
    stage._webPointerBound = true;
    let dragging = false, fromX = 0, fromY = 0, startLeft = 0, startTop = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.npc-web-node')) return;
      dragging = true;
      fromX = e.clientX; fromY = e.clientY;
      startLeft = stage.scrollLeft; startTop = stage.scrollTop;
      stage.classList.add('npc-web-stage--dragging');
      if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      stage.scrollLeft = startLeft - (e.clientX - fromX);
      stage.scrollTop  = startTop  - (e.clientY - fromY);
    });
    const release = (e) => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('npc-web-stage--dragging');
      if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      this._webScrollX = stage.scrollLeft;
      this._webScrollY = stage.scrollTop;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('scroll', () => {
      this._webScrollX = stage.scrollLeft;
      this._webScrollY = stage.scrollTop;
    });
  };

  // ============================================================================
  // Background tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildBackgroundTabHTML = function (T, profile, npcName) {
    if (profile && !profile.backstory) window.NPCHistSim?.generateBackstoryNow?.(npcName);
    const backstory  = profile?.backstory;
    const headerHTML = `<div class="npc-sec-hdr">${T.historyTitle}</div><hr class="npc-r-sep">`;

    let backstoryHTML;
    if (!backstory) {
      backstoryHTML = `<p class="npc-empty">${_escapeHtml(T.noBackstory)}</p>`;
    } else {
      const ICONS  = window.HistorySimulator_ICONS ?? {};
      const evRows = (backstory.formativeEvents ?? []).map(e => {
        const iconId = ICONS[e.category] ?? 245;
        return `<div class="npc-backstory-event">${_iconSpan(iconId, 14)}<span>${_escapeHtml(e.date)}</span>, ${_escapeHtml(e.description)}</div>`;
      }).join('');

      backstoryHTML = `
        <div class="npc-backstory-text">${_escapeHtml(window.NPCHistSim?.narrativeOf?.(backstory) ?? backstory.narrative ?? '')}</div>
        <div class="npc-backstory-events">${evRows}</div>
        <div class="npc-backstory-meta">${_escapeHtml(T('NPCSociety.bio.bornMeta', { year: backstory.birthYear,
          place: window.WorkSystem?.destinationName ? window.WorkSystem.destinationName(backstory.birthplace) : backstory.birthplace }))}</div>`;
    }

    let lifeSummaryHTML = '';
    if (npcName && window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      const bio = window.NPCLifeSim.buildBiography?.(npcName);
      if (bio) {
        const lines = bio.split('\n').filter(Boolean)
          .map(line => `<div class="npc-backstory-event">${_escapeHtml(line)}</div>`).join('');
        lifeSummaryHTML = `
          <hr class="npc-r-sep">
          <div class="npc-sec-hdr">${T.lifeSummary}</div>
          <div class="npc-backstory-events">${lines}</div>`;
      }
    }

    return `${headerHTML}${backstoryHTML}${lifeSummaryHTML}`;
  };

  // ============================================================================
  // Routine tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildRoutineTabHTML = function (T, profile) {
    const headerHTML = `<div class="npc-sec-hdr">${T.routineTitle}</div><hr class="npc-r-sep">`;

    const RM = window.NPCSim?.RoutineManager;
    if (!profile || !RM) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noRoutineData)}</p>`;
    }

    const needLabels = _needLabels(T);
    const fmtHour    = h => `${String(h).padStart(2, '0')}:00`;
    const row = (hour, activity, cls) => `
      <div class="npc-routine-row ${cls}"${cls === 'now' ? ' id="npc-routine-now"' : ''}>
        <span class="npc-routine-hour">${fmtHour(hour)}</span>
        ${_iconSpan(NEED_ICONS[activity] ?? 0, 14)}
        <span>${_escapeHtml(_activityLabel(activity, profile, T, needLabels))}</span>
      </div>`;

    const past   = RM.getLast24Hours(profile) ?? [];
    const future = RM.getRestOfDay(profile)   ?? [];

    const pastRows   = past.map(e => row(e.hour, e.activity, e.isPast ? 'past' : 'now')).join('');
    const futureRows = future.length
      ? future.map(e => row(e.hour, e.activity, '')).join('')
      : `<p class="npc-sub">${_escapeHtml(T.routineNothingPlanned)}</p>`;

    return `
      ${headerHTML}
      <div class="npc-routine-sub-hdr">${T.routinePast24h}</div>
      ${pastRows}
      <div class="npc-routine-sub-hdr">${T.routineRestOfDay}</div>
      ${futureRows}`;
  };

  // ============================================================================
  // Biologics tab
  // ============================================================================
  // Simplified anatomy readout: the NPC's limbs/organs come straight from
  // their archetype's part table (window.Health.Archetypes, the same
  // data Health_Core builds player body parts from), with per-part condition
  // and congenital missing limbs rolled deterministically from the world
  // seed. Display-only, no Health_BiologicSimulation machinery involved.

  let _archetypeI18nCache = null;
  function _archetypePartName(part, key) {
    const raw = part?.name;
    if (raw && typeof raw === 'string' && raw.includes('.')) {
      if (_archetypeI18nCache === null) {
        _archetypeI18nCache = {};
        try {
          const xhr = new XMLHttpRequest();
          const lang = ConfigManager.language === 'it' ? 'it' : 'en';
          xhr.open('GET', `js/i18n/${lang}/enemyArchetypes.json`, false);
          xhr.send();
          if (xhr.status === 200 || xhr.status === 0) _archetypeI18nCache = JSON.parse(xhr.responseText);
        } catch (_) {}
      }
      const resolved = raw.split('.').reduce((acc, p) => acc && acc[p], _archetypeI18nCache);
      if (resolved && typeof resolved === 'string') return resolved;
    }
    if (raw && typeof raw === 'string' && !raw.includes('.')) return raw;
    return key.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ============================================================================
  // Health tab, current illnesses + pre-simulated medical history + conditions
  // ============================================================================

  // A severity is a band, not a colour: the stylesheet inks the name.
  const _SEV_BAND = {
    trivial: 'npc-fill--ok', mild: 'npc-fill--green', moderate: 'npc-fill--warn',
    severe: 'npc-fill--bad', lethal: 'npc-fill--bad', esoteric: 'npc-fill--info', chronic: 'npc-fill--warn',
  };

  Scene_NPCEmpathize.prototype._buildHealthTabHTML = function (T, profile, npcName) {
    const headerHTML = `<div class="npc-sec-hdr">${T.healthTitle}</div><hr class="npc-r-sep">`;
    const DS = window.DiseaseSystem;
    // Party members show their own live disease state; NPCs show a
    // world-seeded, pre-simulated medical history persisted on the profile.
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    if (!DS || (!actorObj && (!profile || !npcName))) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noHealth)}</p>`;
    }
    if (!actorObj) { try { DS.ensureNpcMedicalHistory(npcName, profile); } catch (e) {} }
    else { try { DS.ensureStoryConditions?.(); } catch (e) {} }

    const isChronic = d => d && (d.durationDays < 0 || d.durationDays >= 9999);

    const diseaseRow = entry => {
      const d = DS.getDisease(entry.id);
      if (!d) return '';
      const tags = [];
      if (entry.venereal || d.venereal)
        tags.push(`<span class="npc-badge npc-info">${_escapeHtml(T.venerealTag)}</span>`);
      if (entry.epidemic)
        tags.push(`<span class="npc-badge npc-bad">${_escapeHtml(T.epidemicTag)}</span>`);
      if (d.infective)
        tags.push(`<span class="npc-badge">${_escapeHtml(T.contagiousTag)} ${Math.round(d.transmission * 100)}%</span>`);
      const symptoms = (d.symptoms || []).slice(0, 4).join(', ');
      return `
        <div class="npc-ident-row npc-top">
          <span class="npc-sev-dot ${_SEV_BAND[d.severity] || 'npc-fill--calm'}"></span>
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(d.name)}</b> <span class="npc-note">${_escapeHtml(d.category)}</span></div>
            ${tags.length ? `<div class="npc-badge-row npc-my-1">${tags.join('')}</div>` : ''}
            ${d.desc ? `<div class="npc-thought npc-mt-1">${_escapeHtml(d.desc)}</div>` : ''}
            ${symptoms ? `<div class="npc-note">${_escapeHtml(T.symptomsLbl)}: ${_escapeHtml(symptoms)}</div>` : ''}
          </div>
        </div>`;
    };

    const condRow = entry => {
      const c = DS.getCondition(entry.id != null ? entry.id : entry);
      if (!c) return '';
      const icon = c.category === 'injury' ? 176 : c.category === 'surgical' ? 168 : 186;
      return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(icon, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(c.name)}</b> <span class="npc-note">${_escapeHtml(c.category)}</span></div>
            ${c.desc ? `<div class="npc-thought npc-mt-1">${_escapeHtml(c.desc)}</div>` : ''}
          </div>
        </div>`;
    };

    const pastBadge = id => {
      const d = DS.getDisease(id);
      return d ? `<span class="npc-badge npc-my-1">${_escapeHtml(d.name)}</span>` : '';
    };

    // Every outbreak this person has been through: what they caught, and the
    // ones that swept their town while they were living in it. Historical
    // entries come from the century HistorySimulator generated, live ones from
    // the epidemics running right now.
    const epidemicRow = entry => {
      const disease = DS.getDisease(entry.diseaseId);
      const caught = entry.role === 'caught';
      const hysteria = entry.kind === 'hysteria';
      const roleLbl = caught
        ? (hysteria ? (T.epidemicSwept) : (T.epidemicCaught))
        : (T.epidemicLived);
      const tags = [`<span class="npc-badge ${caught ? 'npc-bad' : 'npc-off'}">${_escapeHtml(roleLbl)}</span>`];
      if (hysteria) tags.push(`<span class="npc-badge npc-info">${_escapeHtml(T.hysteriaTag)}</span>`);
      if (entry.historical) tags.push(`<span class="npc-badge">${_escapeHtml(T.historicalTag)}</span>`);
      return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(hysteria ? 79 : 176, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(entry.name || (disease ? disease.name : entry.diseaseId))}</b></div>
            <div class="npc-badge-row npc-my-1">${tags.join('')}</div>
            <div class="npc-note">${_escapeHtml(entry.place || '')}${entry.date ? `, ${_escapeHtml(String(entry.date))}` : ''}</div>
          </div>
        </div>`;
    };

    const cur   = actorObj ? DS.actorEntries(actorObj)    : DS.npcDiseases(profile);
    const conds = actorObj ? DS.actorConditions(actorObj) : DS.npcConditions(profile);
    const past  = actorObj ? DS.actorPast(actorObj)       : DS.npcPast(profile);
    const epis  = actorObj ? (DS.actorEpidemicHistory ? DS.actorEpidemicHistory(actorObj) : [])
                           : (DS.npcEpidemicHistory ? DS.npcEpidemicHistory(profile) : []);
    const acute   = cur.filter(e => { const d = DS.getDisease(e.id); return d && !isChronic(d); });
    const chronic = cur.filter(e => { const d = DS.getDisease(e.id); return d && isChronic(d); });

    // What is burning in their home town right now, whether or not they have it.
    let localHTML = '';
    const ES = window.EpidemicSystem;
    if (ES && !actorObj && profile) {
      const place = ES.placeForGroup(profile._homeGroupName);
      const live = place ? ES.activeAt(place.key) : [];
      if (live.length) {
        const rows = live.map(e => {
          const pct = (ES.prevalenceAt(place.key, e) * 100).toFixed(1);
          return `<div class="npc-ident-row"><div class="npc-flex-1"><b>${_escapeHtml(e.name)}</b>
            <div class="npc-note">${_escapeHtml(ES.placeName ? ES.placeName(place.key) : place.key)} &mdash; ${pct}% ${_escapeHtml(T.epidemicIll)}</div></div></div>`;
        }).join('');
        localHTML = `<div class="npc-sec-hdr npc-mt-4">${_escapeHtml(T.epidemicLocal)}</div>${rows}`;
      }
    }

    const section = (title, body, empty) =>
      `<div class="npc-sec-hdr npc-mt-4">${_escapeHtml(title)}</div>` +
      (body || `<p class="npc-sub">${_escapeHtml(empty)}</p>`);

    return `
      ${headerHTML}
      ${section(T.currentIllness, acute.map(diseaseRow).join(''), T.noneCurrent)}
      ${chronic.length ? section(T.chronicConditions, chronic.map(diseaseRow).join('')) : ''}
      ${localHTML}
      ${section(T.epidemicsTitle, epis.map(epidemicRow).join(''), T.noEpidemics)}
      ${section(T.lastingConditions, conds.map(condRow).join(''), T.noneConditions)}
      ${section(T.pastIllness, past.length ? `<div class="npc-badge-row">${past.map(pastBadge).join('')}</div>` : '', T.noPast)}`;
  };

  // A party member's anatomy is not rolled: Health_Core keeps every limb and
  // organ on the actor (actor._bodyParts, a severed part being one deleted from
  // it), so the page reads the wounds the player's character actually carries
  // instead of a stranger's seeded anatomy.
  Scene_NPCEmpathize.prototype._buildActorBiologicsHTML = function (T, actor) {
    const headerHTML = `<div class="npc-sec-hdr">${T.biologicsTitle}</div><hr class="npc-r-sep">`;
    const HC   = window.HealthCore;
    const keys = HC?.getActorArchetypeKeys ? HC.getActorArchetypeKeys(actor) : ['Humanoid']; // i18n-ignore: Archetypes.json id
    const label = keys
      .map(k => (HC?.getArchetypeDisplayName ? HC.getArchetypeDisplayName(k) : k))
      .join(' / ');

    const held = actor._bodyParts || {};
    // Every part the archetype says they should have, so an amputation shows as
    // a missing limb rather than simply vanishing off the list.
    const expected = {};
    for (const key of keys) {
      const table = window.Health?.Archetypes?.[key]?.parts;
      if (table) for (const [k, part] of Object.entries(table)) if (!expected[k]) expected[k] = part;
    }
    const rows = [];
    for (const [key, part] of Object.entries(Object.keys(expected).length ? expected : held)) {
      const live = held[key];
      if (!live) { rows.push({ key, part, missing: true, cond: 0 }); continue; }
      const max  = live.maxHp || 1;
      rows.push({
        key,
        part: { name: live.name ?? part?.name, vital: live.vital ?? part?.vital },
        missing: false,
        cond: Math.max(0, Math.min(100, Math.round((live.currentHp / max) * 100))),
      });
    }
    if (!rows.length) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noBiologics)}</p>`;
    }

    let condSum = 0, condCount = 0;
    for (const row of rows) { if (!row.missing) { condSum += row.cond; condCount++; } }
    const overall = condCount ? Math.round(condSum / condCount) : 0;

    const condBand = v => v >= 85 ? 'npc-fill--ok' : v >= 65 ? 'npc-fill--warn' : 'npc-fill--bad';
    // The traveller's own bars, not a scale against a notional 2000 HP: nothing
    // here is guessed, so nothing here is drawn against a guessed maximum.
    const vitalsHTML = `
      <div class="npc-bio-vitals">
        ${_meterRow('HP', Math.round((actor.hp / Math.max(1, actor.mhp)) * 100), 'npc-fill--bad')}
        ${_meterRow('MP', Math.round((actor.mp / Math.max(1, actor.mmp)) * 100), 'npc-fill--mp')}
        ${_meterRow(T.biologicsCondition, overall, condBand(overall))}
      </div>`;

    return `
      ${headerHTML}
      <div class="npc-bio-archetype">${_escapeHtml(T.biologicsArchetype)}: <b>${_escapeHtml(label)}</b></div>
      ${this._bloodTypeSectionHTML(T, window.BloodTypeService?.forActor(actor), actor)}
      ${vitalsHTML}
      <div class="npc-routine-sub-hdr">${_escapeHtml(T.biologicsParts)}</div>
      <div class="npc-bio-grid">${_bioPartRowsHTML(rows, T, condBand)}</div>`;
  };

  // Blood type line (real name + rarity), a universal donor/recipient badge
  // where it applies, a note for the ultra-rare antigen-negative lineages,
  // and, whenever the panel is being read on behalf of someone other than
  // the person being displayed, a real ABO/Rh transfusion-compatibility
  // verdict against the party member currently doing the talking
  // (this._focusActor()). window.BloodTypeService (Health_BiologicSimulation)
  // is the only place that data and that calculation live.
  Scene_NPCEmpathize.prototype._bloodTypeSectionHTML = function (T, bloodEntry, subject) {
    const BTS = window.BloodTypeService;
    if (!BTS || !bloodEntry) return '';

    const badges = [];
    if (BTS.isUniversalDonor(bloodEntry.id)) badges.push(`<span class="npc-badge">${_escapeHtml(T.bloodUniversalDonor)}</span>`);
    if (BTS.isUniversalRecipient(bloodEntry.id)) badges.push(`<span class="npc-badge">${_escapeHtml(T.bloodUniversalRecipient)}</span>`);
    const badgeHTML = badges.length ? `<div class="npc-badge-row npc-my-1">${badges.join('')}</div>` : '';
    const rareNoteHTML = bloodEntry.rareAntigen
      ? `<div class="npc-thought npc-mt-1">${_escapeHtml(T.bloodRareAntigenNote)}</div>` : '';

    let compatHTML = '';
    const focusActor = this._focusActor ? this._focusActor() : null;
    if (focusActor && focusActor !== subject) {
      const focusEntry = BTS.forActor(focusActor);
      if (focusEntry) {
        const canGive = BTS.canDonate(bloodEntry.id, focusEntry.id);
        const canReceive = BTS.canDonate(focusEntry.id, bloodEntry.id);
        const label = canGive && canReceive ? T.bloodCompatBoth
          : canGive ? T.bloodCompatDonorOnly
          : canReceive ? T.bloodCompatRecipientOnly
          : T.bloodCompatNone;
        compatHTML = `<div class="npc-bio-archetype">${_escapeHtml(T.bloodCompatTitle)}: <b>${_escapeHtml(label)}</b></div>`;
      }
    }

    return `
      <div class="npc-bio-archetype">${_escapeHtml(T.bloodType)}: <b>${_escapeHtml(bloodEntry.type)} (${_escapeHtml(bloodEntry.rarity)})</b></div>
      ${badgeHTML}${rareNoteHTML}${compatHTML}`;
  };

  function _bioPartRowsHTML(rows, T, condBand) {
    return rows.map(({ key, part, missing, cond }) => {
      const label    = _escapeHtml(_archetypePartName(part, key));
      const vitalTag = part.vital ? `<span class="npc-bio-vital-tag">${_escapeHtml(T.biologicsVitalTag)}</span>` : '';
      if (missing) {
        return `
          <div class="npc-bio-part npc-bio-missing">
            <span class="npc-bio-part-name">${label}</span>
            <span class="npc-bio-missing-lbl">${_escapeHtml(T.biologicsMissing)}</span>
          </div>`;
      }
      return `
        <div class="npc-bio-part">
          <span class="npc-bio-part-name">${label}${vitalTag}</span>
          <div class="npc-vital-track"><div class="npc-vital-fill ${condBand(cond)}" style="--npc-w:${cond}%"></div></div>
          <span class="npc-vital-pct">${cond}%</span>
        </div>`;
    }).join('');
  }

  Scene_NPCEmpathize.prototype._buildBiologicsTabHTML = function (T, profile, npcName) {
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    if (actorObj) return this._buildActorBiologicsHTML(T, actorObj);

    const headerHTML = `<div class="npc-sec-hdr">${T.biologicsTitle}</div><hr class="npc-r-sep">`;
    const archetype  = profile?.archetype || 'Humanoid'; // i18n-ignore: Archetypes.json id
    const parts      = window.Health?.Archetypes?.[archetype]?.parts;
    if (!profile || !parts || !Object.keys(parts).length) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noBiologics)}</p>`;
    }

    // World-seeded per-NPC anatomy roll, stable across sessions: the same
    // NPC in the same world is always missing the same (non-vital) limbs.
    const Shared = window.NPCShared;
    const rng    = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_bio') ^ Shared.worldSeed()) : null;
    const rnd    = () => (rng ? rng.next() : 0.5);

    const rows = [];
    for (const [key, part] of Object.entries(parts)) {
      let missing = !part.vital && !!part.canCutoff && rnd() < 0.06;
      let cond = Math.round(60 + rnd() * 40);
      if (part.vital) cond = Math.max(70, cond);
      rows.push({ key, part, missing, cond });
    }
    // Sandbox override (set by SandboxMode NPC manipulation): severed or
    // regenerated body parts. Applied on top of the deterministic roll.
    const bioOv = profile._bioOverride;
    if (bioOv) {
      for (const row of rows) {
        const o = bioOv[row.key];
        if (!o) continue;
        if (o.missing != null) row.missing = o.missing;
        if (o.cond    != null) row.cond    = o.cond;
      }
    }
    let condSum = 0, condCount = 0;
    for (const row of rows) { if (!row.missing) { condSum += row.cond; condCount++; } }
    const blood   = Math.round(80 + rnd() * 20);
    const overall = condCount ? Math.round(condSum / condCount) : 100;

    const condBand = v => v >= 85 ? 'npc-fill--ok' : v >= 65 ? 'npc-fill--warn' : 'npc-fill--bad';
    const vitalsHTML = `
      <div class="npc-bio-vitals">
        ${_meterRow('HP',  Math.min(100, Math.round(((profile.mhp ?? 0) / 2000) * 100)), 'npc-fill--bad')}
        ${_meterRow('MP',  Math.min(100, Math.round(((profile.mmp ?? 0) / 500)  * 100)), 'npc-fill--mp')}
        ${_meterRow(T.biologicsBlood, blood, 'npc-fill--bad')}
        ${_meterRow(T.biologicsCondition, overall, condBand(overall))}
      </div>`;

    return `
      ${headerHTML}
      <div class="npc-bio-archetype">${_escapeHtml(T.biologicsArchetype)}: <b>${_escapeHtml(archetype)}</b></div>
      ${this._bloodTypeSectionHTML(T, window.BloodTypeService?.forNpc(npcName), npcName)}
      ${vitalsHTML}
      <div class="npc-routine-sub-hdr">${_escapeHtml(T.biologicsParts)}</div>
      <div class="npc-bio-grid">${_bioPartRowsHTML(rows, T, condBand)}</div>`;
  };

  // ============================================================================
  // Romance tab
  // ============================================================================
  // Display-only. Each NPC's romantic + sexual orientation, Kinsey placement,
  // genitals (mirroring the prosthetic reproduction DB) and preferred
  // relationship style are rolled deterministically from the world seed, so the
  // same NPC in the same world always reads the same. Current sentimental
  // status and partner links come live from NPCLifeSim.

  let _orientationDb  = null;
  let _relationshipDb = null;

  function _loadJsonSync(url) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
    } catch (e) {
      console.warn('[NPCEmpathizeUI] failed to load', url, e);
    }
    return null;
  }

  function _orientationData() {
    if (_orientationDb === null) _orientationDb = _loadJsonSync('js/db/NPC/Orientations.json') || {};
    return _orientationDb;
  }
  function _relationshipData() {
    if (_relationshipDb === null) _relationshipDb = _loadJsonSync('js/db/NPC/Relationships.json') || {};
    return _relationshipDb;
  }

  // The two rosters, for the readers outside this file: NPCSociety's event
  // initialization spec (SECTION 3c) resolves a written orientation or
  // relationship style against exactly the lists the panel draws from.
  window.NPCOrientationData  = _orientationData;
  window.NPCRelationshipData = _relationshipData;

  // Weighted random pick, weight read from o[key]; falls back to a flat pick.
  function _weightedPick(list, rng, key) {
    if (!list || !list.length) return null;
    const total = list.reduce((s, o) => s + (Number(o[key]) || 0), 0);
    if (total <= 0) return rng.pick(list);
    let r = rng.next() * total;
    for (const o of list) { r -= (Number(o[key]) || 0); if (r < 0) return o; }
    return list[list.length - 1];
  }

  // Genital label set mirrors Health_ProstheticShop.getReproductionName (the
  // prosthetic reproduction DB): None / Testicles / Uterus / Oviparous /
  // Plant Spores / Mitosis.
  // Codes are the ones Health_ProstheticShop uses; the words come from
  // Empathize.genital.<code>, with -1 written "none" so it is a valid key.
  const _genitalName = (code) => {
    const key = 'Empathize.genital.' + (String(code) === '-1' ? 'none' : String(code));
    return T.has(key) ? T(key) : 'N/A';
  };

  // Every genital code the DB knows: -1 None, 0 Testes, 1 Uterus, 2 Oviduct,
  // 3 Spore Gland, 4 Mitosis Gland.
  const _GENITAL_ALL   = [-1, 0, 1, 2, 3, 4];
  // An alien sprite (NPCs.json `aliens: true`) never carries a human uterus or
  // testes, whatever gender it rolled: alien biology is its own thing.
  const _GENITAL_ALIEN = [-1, 2, 3, 4];

  // A party member is not rolled: their body was answered on the Bio page (or
  // stated by the dossier they arrived on) and lives in the reproduction
  // variable for their seat, 87 / 115 / 116 by party index, the very variable
  // the status sheet and the biologic simulation read. Rolling one here made
  // the panel contradict both, so Em could be shown testes and Bubba a uterus.
  function _partyGenitalCode(npcName) {
    if (!npcName || typeof $gameParty === 'undefined' || !$gameParty) return null;
    const members = $gameParty.allMembers ? $gameParty.allMembers() : [];
    // Only the three seats own one of these variables; a fourth companion
    // (a pet, a summon) has no seat of its own to read and is rolled like
    // anybody else.
    const index = members.findIndex((member) => member && member.name() === npcName);
    if (index < 0 || index > 2) return null;
    const CCU = window.CharacterCreationUtils;
    const varId = CCU && CCU.getReproductiveVariableId
      ? CCU.getReproductiveVariableId(index)
      : (index === 1 ? 115 : index === 2 ? 116 : 87);
    const code = $gameVariables ? $gameVariables.value(varId) : null;
    return _GENITAL_ALL.includes(code) ? code : null;
  }

  function _npcGenitalCode(npcName, profile) {
    const owned = _partyGenitalCode(npcName);
    if (owned !== null) return owned;

    const Shared = window.NPCShared;
    const rng    = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_genitals') ^ Shared.worldSeed()) : null;
    const pick   = list => (rng ? rng.pick(list) : list[0]);
    const gender = profile?.gender ?? 0;

    if (Shared?.isAlienSprite?.(profile?.spriteKey)) return pick(_GENITAL_ALIEN);

    // Non-binary and Cocoon read as "varied", evenly across every option; so
    // does anybody whose archetype is not a plain Humanoid (Beast, Draconic,
    // Ooze...), since only a Humanoid body is ever guaranteed to match its
    // gender at all. Nothing stored defaults to Humanoid, same as everywhere
    // else that reads this field (see _archetypeRowLabel).
    const archetype = profile?.archetype || 'Humanoid';
    if (gender === 2 || gender === 3 || archetype !== 'Humanoid') return pick(_GENITAL_ALL);

    // A Humanoid reads its rolled gender onto its body 80% of the time; the
    // other 20% it is any of the remaining five options.
    const matched = gender === 1 ? 1 : 0; // Uterus for Female-coded, Testes for Male-coded
    if (!rng) return matched;
    return rng.next() < 0.8 ? matched : pick(_GENITAL_ALL.filter(c => c !== matched));
  }

  // A bubbaromantic NPC (Orientations.json: 8% of the population, romantically
  // attached to Bubba Wilson and to nobody else) is the one person Bubba is
  // offered the Court option with at all.
  function _isBubbaromanticNpc(npcName, profile) {
    if (!npcName) return false;
    try {
      return _npcRomance(npcName, profile).romantic?.key === 'bubbaromantic';
    } catch (e) {
      return false;
    }
  }

  // Bubba (Switch 49) courting the one person who has loved him from a
  // distance: every Court move on her lands, no roll needed.
  function _bubbaGuaranteedLand(npcName, profile, actor) {
    return !!(_isBubbaActor?.(actor) && _isBubbaromanticNpc(npcName, profile));
  }

  // Chance that a rolled orientation's romantic/sexual counterpart is forced to
  // match it (e.g. a homosexual NPC is likely to also be homoromantic), rather
  // than being rolled fully independently.
  const _ORIENT_MATCH_CHANCE = 0.6;

  // ── Orientation vs. the partner the simulation actually gave them ────────
  // A marriage or a courtship is a fact about the NPC; the orientation roll is
  // only a guess at one. When the two disagree (a heteroromantic man married to
  // a man) the roll is what gives way: it is rewritten to an orientation that
  // admits the partner, either the exact counterpart or, some of the time, the
  // bi entry that covers everyone. Orientations that answer to something other
  // than gender (asexual, aromantic, digisexual, bubbaromantic...) are left
  // alone: they say nothing a gendered partner can contradict.
  const _ROM_PARTNER_MATCH = {
    same: { sexual: 'homosexual',   romantic: 'homoromantic' },
    diff: { sexual: 'heterosexual', romantic: 'heteroromantic' },
    both: { sexual: 'bisexual',     romantic: 'biromantic' },
  };
  const _ROM_BI_CHANCE = 0.25; // how often the rewrite lands on bi/biromantic

  // The gender of the person this NPC is partnered with, or null when there is
  // no partner, the partner lives outside the simulation, or their gender is
  // not recorded. Non-binary and Cocoon (2, 3) satisfy every orientation, so
  // they are reported as null too: nothing to reconcile.
  function _partnerGender(npcName) {
    const Life = window.NPCLifeSim;
    if (!Life || !npcName) return null;
    const partner = Life.getRecord?.(npcName)?.partner;
    if (!partner || partner.external) return null;
    const g = _getProfile(partner.name)?.gender;
    return (g === 0 || g === 1) ? g : null;
  }

  // Rewrites one orientation entry so it admits `partnerGender`, or returns it
  // untouched when it already does or does not speak about gender at all.
  function _reconcileOrientation(entry, kind, list, ownGender, partnerGender, rng) {
    if (!entry || partnerGender == null) return entry;
    if (ownGender !== 0 && ownGender !== 1) return entry; // fluid: nothing to fix
    const wantsSame = _ROM_SAME_GENDER.has(entry.key);
    const wantsDiff = _ROM_DIFF_GENDER.has(entry.key);
    if (!wantsSame && !wantsDiff) return entry;
    const isSame = partnerGender === ownGender;
    if (isSame === wantsSame) return entry;
    const useBi = rng ? rng.next() < _ROM_BI_CHANCE : false;
    const want  = _ROM_PARTNER_MATCH[useBi ? 'both' : (isSame ? 'same' : 'diff')][kind];
    return (list || []).find(o => o.key === want) || entry;
  }

  function _npcRomance(npcName, profile) {
    const Shared  = window.NPCShared;
    const db      = _orientationData();
    const sexRng  = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_sexorient') ^ Shared.worldSeed()) : null;
    const romRng  = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_romorient') ^ Shared.worldSeed()) : null;
    const matchRng = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_orientmatch') ^ Shared.worldSeed()) : null;
    let sexual   = sexRng ? _weightedPick(db.sexual   || [], sexRng, 'pct') : (db.sexual   || [])[0];
    let romantic = romRng ? _weightedPick(db.romantic || [], romRng, 'pct') : (db.romantic || [])[0];
    // Correlate the two rolls: aromantic/asexual NPCs are excluded (they don't
    // attach to anyone, so there's nothing to match), otherwise there's a
    // _ORIENT_MATCH_CHANCE chance the rarer (lower pct) of the two picks wins
    // and the other is overwritten with its thematic counterpart, when one
    // exists (e.g. homosexual <-> homoromantic, digisexual <-> botromantic).
    const canMatch = sexual && romantic && sexual.key !== 'asexual' && romantic.key !== 'aromantic';
    if (canMatch && matchRng && matchRng.next() < _ORIENT_MATCH_CHANCE) {
      if ((Number(sexual.pct) || 0) <= (Number(romantic.pct) || 0)) {
        const corres = (db.romantic || []).find(o => o.key === sexual.correspondsTo);
        if (corres) romantic = corres;
      } else {
        const corres = (db.sexual || []).find(o => o.key === romantic.correspondsTo);
        if (corres) sexual = corres;
      }
    }
    // Reconcile with the partner the life simulation actually paired them with
    // (see _reconcileOrientation): the relationship on the page wins over the
    // roll, so nobody is shown exclusively straight while married to a man.
    const pg = _partnerGender(npcName);
    if (pg != null) {
      const og      = profile?.gender ?? 0;
      const biRng   = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_orientpartner') ^ Shared.worldSeed()) : null;
      const biRng2  = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_orientpartner2') ^ Shared.worldSeed()) : null;
      sexual   = _reconcileOrientation(sexual,   'sexual',   db.sexual,   og, pg, biRng);
      romantic = _reconcileOrientation(romantic, 'romantic', db.romantic, og, pg, biRng2);
    }

    // Sandbox override (set by SandboxMode NPC manipulation): a forced sexual /
    // romantic orientation by key. The Kinsey scale reads from the sexual entry,
    // so swapping it recalculates the Kinsey placement automatically.
    const ov = profile && profile._orientOverride;
    if (ov) {
      if (ov.sexualKey)   { const s = (db.sexual   || []).find(o => o.key === ov.sexualKey);   if (s) sexual   = s; }
      if (ov.romanticKey) { const r = (db.romantic || []).find(o => o.key === ov.romanticKey); if (r) romantic = r; }
    }
    return { sexual, romantic, genitalCode: _npcGenitalCode(npcName, profile) };
  }

  // `profile._relStyleOverride` is written the moment a Propose actually
  // lands (see _proposeInteract): once somebody has agreed to a style out
  // loud, the panel reads that fact back rather than the deterministic roll
  // it would otherwise still be making, exactly the way profile._orientOverride
  // already overrules the rolled orientation (_npcRomance, above).
  function _npcRelationshipStyle(npcName, partnered, profile) {
    const styles = _relationshipData().styles || [];
    if (profile?._relStyleOverride) {
      const ov = styles.find(s => s.key === profile._relStyleOverride);
      if (ov) return ov;
    }
    const Shared   = window.NPCShared;
    const eligible = styles.filter(s => s.mode === 'any' || (partnered ? s.mode === 'partnered' : s.mode === 'solo'));
    if (!eligible.length) return null;
    // Two people in the same relationship are in the SAME relationship: a
    // couple seeds its style off both names, sorted, so each half of it reads
    // the same word rather than one saying monogamous and the other open.
    let seedName = npcName + '_relstyle';
    if (partnered) {
      const partner = window.NPCLifeSim?.getRecord?.(npcName)?.partner;
      if (partner?.name) seedName = [String(npcName), String(partner.name)].sort().join('&') + '_relstyle';
    }
    const rng = Shared ? new Shared.Rng(Shared.nameHash(seedName) ^ Shared.worldSeed()) : null;
    return rng ? _weightedPick(eligible, rng, 'weight') : eligible[0];
  }

  // Orientations.json and Relationships.json carry i18n keys rather than words
  // ("Orientations.sexual.heterosexual.name"), so what the panel shows comes
  // out of js/i18n/<lang>/plugins/. window.T, not the panel's own label object
  // (which every render function receives as `T`). Anything that resolves to
  // nothing is shown as written.
  function _dbText(value) {
    if (!value) return '';
    const key = String(value);
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : key;
  }

  // A personality's English `name` in PersonalityData.json is its id; the word
  // the dossier prints is reached from it (js/i18n/<lang>/plugins/Personality.json).
  function _personalityLabel(name) {
    if (!name) return '';
    const key = 'Personality.' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '') + '.name';
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : String(name);
  }

  function _npcLink(name) {
    const arg = String(name ?? '').replace(/[\\'"<>]/g, '');
    return `<span class="npc-wiki-link" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName('${arg}')">${_escapeHtml(name)}</span>`;
  }

  Scene_NPCEmpathize.prototype._buildRomanceTabHTML = function (T, profile, npcName) {
    const nm   = v => _dbText(v?.name);
    const ds   = v => _dbText(v?.desc);
    const headerHTML = `<div class="npc-sec-hdr">${T.romanceTitle}</div><hr class="npc-r-sep">`;

    if (!npcName) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noRomance)}</p>`;
    }

    const db = _orientationData();
    const { sexual, romantic, genitalCode } = _npcRomance(npcName, profile);

    const esotericTag = o => o?.esoteric
      ? ` <span class="npc-badge npc-note">${_escapeHtml(T.esotericTag)}</span>` : '';
    const pctLine = o => o
      ? `<span class="npc-note npc-aside">${o.pct}% ${_escapeHtml(T.ofPopulation)}</span>` : '';

    // ── Orientation ──
    let orientHTML = `<div class="npc-sec-hdr npc-mt-1">${T.orientationLbl}</div>`;
    if (romantic) {
      orientHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(T.romanticLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(romantic))}</b></span>${pctLine(romantic)}${esotericTag(romantic)}</div>`;
      if (ds(romantic)) orientHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(romantic))}</div>`;
    }
    if (sexual) {
      orientHTML += `<div class="npc-ident-row npc-mt-2">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(T.sexualLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(sexual))}</b></span>${pctLine(sexual)}${esotericTag(sexual)}</div>`;
      if (ds(sexual)) orientHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(sexual))}</div>`;
    }

    // ── Kinsey scale (only for orientations that map onto it) ──
    let kinseyHTML = '';
    const kv = (sexual && sexual.kinsey !== null && sexual.kinsey !== undefined) ? sexual.kinsey : null;
    if (kv !== null) {
      // Same in-data shape as every other string in Orientations.json: a key
      // per step, read through the same resolver the name and desc accessors
      // above use.
      const scale = db.kinseyScale || {};
      const desc  = _dbText(scale[String(kv)]);
      kinseyHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.kinseyLbl}</div>` +
        `<div class="npc-ident-row">${_iconSpan(87, 17)}<span><b>${_escapeHtml('Kinsey ' + kv)}</b></span><span class="npc-sub">&nbsp;, ${_escapeHtml(desc)}</span></div>`;
      if (kv !== 'X') {
        let dots = '';
        for (let i = 0; i <= 6; i++) {
          const on = i === kv;
          dots += `<span class="npc-kinsey-dot ${on ? 'on' : ''}" title="${i}"></span>`;
        }
        kinseyHTML += `<div class="npc-kinsey-row">${dots}</div>`;
      }
    }

    // ── Anatomy: genitals (from the prosthetic reproduction DB) ──
    const genName = _genitalName(genitalCode);
    const anatomyHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.anatomyLbl}</div>` +
      `<div class="npc-ident-row">${_iconSpan(120, 17)}<span class="npc-sub">${_escapeHtml(T.genitalsLbl)}:</span>&nbsp;<span><b>${_escapeHtml(genName)}</b></span></div>`;

    // ── Sentimental status (live, from NPCLifeSim) ──
    let statusHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.sentimentalLbl}</div>`;
    let partnered = false, record = null;
    if (window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      record = window.NPCLifeSim.getRecord?.(npcName) ?? null;
    }
    if (record) {
      const partner    = record.partner;
      partnered        = !!partner;
      const partnerHTML = partner ? (partner.external ? `<b>${_escapeHtml(partner.name)}</b>` : _npcLink(partner.name)) : '';
      const status = record.maritalStatus || 'single';
      let line;
      if      (status === 'married'  && partner) line = `${_escapeHtml(T.marriedTo)} ${partnerHTML}`;
      else if (status === 'dating'   && partner) line = `${_escapeHtml(T.datingLbl)} ${partnerHTML}`;
      else if (status === 'married')             line = _escapeHtml(T.stMarried);
      else if (status === 'widowed')             line = _escapeHtml(T.stWidowed);
      else if (status === 'divorced')            line = _escapeHtml(T.stDivorced);
      else                                       line = _escapeHtml(T.stSingle);
      statusHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span>${line}</span></div>`;
      if (record.timesMarried > 1) {
        statusHTML += `<div class="npc-row-indent">${_escapeHtml((T.timesMarried).replace('{n}', record.timesMarried))}</div>`;
      }
      const exes = (record.exPartners || []).filter(Boolean);
      if (exes.length) {
        const exList = exes.slice(-4).map(e => {
          const nmHtml = e.external ? _escapeHtml(e.name) : _npcLink(e.name);
          const out    = e.outcome ? ` <span class="npc-sub">(${_escapeHtml(e.outcome)})</span>` : '';
          return `${nmHtml}${out}`;
        }).join(', ');
        statusHTML += `<div class="npc-ident-row npc-mt-1"><span class="npc-sub">${_escapeHtml(T.exPartnersLbl)}:</span>&nbsp;<span>${exList}</span></div>`;
      }
    } else {
      statusHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span>${_escapeHtml(T.stSingle)}</span></div>`;
    }

    // ── Relationship style (deterministic, conditioned on being partnered) ──
    let styleHTML = '';
    const style = _npcRelationshipStyle(npcName, partnered, profile);
    if (style) {
      styleHTML = `<div class="npc-ident-row npc-mt-2">${_iconSpan(83, 17)}<span class="npc-sub">${_escapeHtml(T.relStyleLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(style))}</b></span></div>`;
      if (ds(style)) styleHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(style))}</div>`;
    }

    return `${headerHTML}${orientHTML}${kinseyHTML}${anatomyHTML}${statusHTML}${styleHTML}`;
  };

  // ============================================================================
  // Romance actions (Court submenu in the chat tab)
  // ============================================================================
  // High-risk, high-reward counterparts to the Socialize moves: each one shows
  // its own success chance and swings the focused party member's reputation far
  // harder than a compliment ever could. Courting never starts an actual
  // relationship with the player, it only moves reputation.
  //
  // A move is impossible (0%, an outright rejection) when the NPC is in an
  // exclusive partnership, is aromantic, is asexual and the move is physical,
  // or when their orientation rules the focused party member out. Non-binary
  // and Cocoon people, on EITHER side of the exchange, satisfy every gendered
  // orientation. Lines and per-move numbers live in SocialLines.json.

  const _ROM_SAME_GENDER = new Set(['homosexual', 'homoromantic']);
  const _ROM_DIFF_GENDER = new Set(['heterosexual', 'heteroromantic']);
  const _ROM_SYNTHETIC   = new Set(['digisexual', 'botromantic']);
  const _ROM_BOTANIC     = new Set(['dendrosexual', 'dendroromantic']);
  // Partnered relationship styles that admit nobody else.
  const _ROM_EXCLUSIVE_STYLES = new Set([
    'monogamous', 'civil-union', 'arranged-marriage', 'long-distance', 'companionate',
  ]);
  // How open a relationship style leaves an NPC to being courted at all.
  const _ROM_STYLE_MOD = {
    'polyamorous': 10, 'portland-polycule': 12, 'open-relationship': 8, 'throuple': 8,
    'friends-with-benefits': 10, 'situationship': 8, 'serial-monogamy': 5,
    'queerplatonic': -8, 'single-content': -14,
  };
  // Gender codes (ActorCharacterFields / NPC profiles): 0 Male, 1 Female,
  // 2 Non-binary, 3 Cocoon. The last two are compatible with everyone.
  const _ROM_GENDER_FLUID = g => g === 2 || g === 3;
  // Reproduction type per player slot (ClassSelector); 3 = plant spores.
  const _ROM_REPRO_VAR = { 1: 87, 2: 115, 3: 116 };

  // ==========================================================================
  // Unwanted courting
  // ==========================================================================
  // Being turned down is part of courting, refusing to hear it is not. Every
  // move made on somebody whose opinion of the suitor is already negative is
  // counted, and once the count runs out the nEuroPolice hear about it: a
  // harassment charge with the bounty that carries, and no Court option with
  // that person for that party member until they think well of them again.
  // Winning them back round is the only thing that lifts it.
  const _HARASS_STRIKES  = 3;   // unwanted moves tolerated before a complaint
  const _HARASS_CRIME    = 'harassment'; // i18n-ignore: PresetCrimes.json key
  const _HARASS_FALLBACK = 250; // bounty when PresetCrimes.json holds no entry

  function _harassRecord(profile, actorId) {
    if (!profile || actorId == null) return null;
    const book = (profile._courtHarassment ??= {});
    return (book[actorId] ??= { strikes: 0, filed: false, charges: 0 });
  }

  // Is Court off the table for this member right now? Reading it is also what
  // clears it, the moment the NPC's opinion of them turns positive again.
  function _courtRefused(profile, actorId, opinion) {
    const rec = profile?._courtHarassment?.[actorId];
    if (!rec?.filed) return false;
    if ((Number(opinion) || 0) > 0) { rec.filed = false; rec.strikes = 0; return false; }
    return true;
  }

  // Counts one unwanted move and files the complaint when the count runs out.
  // Returns the line to show the player when one was filed, null otherwise.
  // Neither of the two can be reported for pestering the other. She is allowed
  // to ask, he is allowed to keep saying no, and no amount of asking puts a
  // bounty on her head over the one man who would post her bail.
  function _pairExempt(actorName, npcName) {
    const pair = new Set(['em', 'bubba']); // i18n-ignore: actor names matched at runtime
    const a = String(actorName || '').trim().toLowerCase();
    const b = String(npcName   || '').trim().toLowerCase();
    return a !== b && pair.has(a) && pair.has(b);
  }

  function _recordUnwantedCourting(profile, actorId, npcName, actorName) {
    if (_pairExempt(actorName, npcName)) return null;
    const rec = _harassRecord(profile, actorId);
    if (!rec || rec.filed) return null;
    rec.strikes = (rec.strikes || 0) + 1;
    if (rec.strikes < _HARASS_STRIKES) return null;

    rec.strikes = 0;
    rec.filed   = true;
    rec.charges = (rec.charges || 0) + 1;

    const CS     = window.CrimeSystem;
    const preset = CS?.getPresetCrime?.(_HARASS_CRIME);
    // A second complaint from the same person is taken more seriously.
    const asked  = Math.round((preset?.bounty || _HARASS_FALLBACK) * Math.min(4, rec.charges));
    const label  = CS?.presetCrimeName?.(_HARASS_CRIME) || preset?.name || _HARASS_CRIME;
    // What the charge actually costs is CrimeSystem's to decide (Streetwise
    // discount, sandbox self-pardon, Eris immunity), so read it rather than
    // quote the asking figure. Its own toast is a Scene_Map one and will not
    // show over this panel, which is why the line below says it here.
    const before = CS?.getTotalBounty?.() ?? 0;
    CS?.addCrime?.(label, asked, _HARASS_CRIME);
    const fine = (CS?.getTotalBounty?.() ?? 0) - before;

    (profile.eventLog ??= []).push({
      tag: 'romance_harassment', desc: `complaint filed (${fine})`, // i18n-ignore: event-log record id
      timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
    });
    if ((profile.factionIndex ?? -1) >= 0 && window.$gameFactions?.changeReputation)
      window.$gameFactions.changeReputation(profile.factionIndex, -5);

    return fine > 0
      ? T('Empathize.courtHarassmentFiled', { name: npcName, actor: actorName, fine: _euros(fine) })
      : T('Empathize.courtHarassmentFiledFree', { name: npcName, actor: actorName });
  }

  function _romanceDb()      { return _socialLines().romance || {}; }
  function _romanceActions() { return _romanceDb().actions || []; }
  function _romanceRejection(reason) { return (_romanceDb().rejection || {})[reason] || null; }

  function _actorIsSynthetic(actor) {
    const cls = actor?.currentClass?.()?.name || '';
    if (/cyborg|android|robot|machine|automaton/i.test(cls)) return true;
    return (actor?._selectedTraits || []).some(t => /cyber|robot|synthetic|machine/i.test(t?.name || ''));
  }
  function _actorIsBotanic(actor) {
    const v = _ROM_REPRO_VAR[actor?.actorId?.()];
    if (v && $gameVariables?.value(v) === 3) return true;
    return /plant|flora|dryad|treant|fungus/i.test(actor?.currentClass?.()?.name || '');
  }

  // Is this NPC currently in a partnership, and under which style?
  function _romanceStanding(npcName, profile) {
    let partnered = false;
    if (window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      partnered = !!window.NPCLifeSim.getRecord?.(npcName)?.partner;
    }
    return { partnered, style: _npcRelationshipStyle(npcName, partnered, profile) };
  }

  // Why (if at all) a romance move cannot land right now. Returns null when the
  // move is allowed, otherwise the key of a `rejection` pool in SocialLines.json.
  function _romanceBlockReason(profile, npcName, actor, def) {
    if (!actor || !npcName) return 'orientation';

    // Em (Switch 48). Bubba is spoken for by a goddess who bends probability at
    // her rivals, and the people who blame her for the death of the Father, or
    // simply want her gone, are not going to be courted by her either.
    if (_isEmActor?.(actor)) {
      const stanceKey = _emStanceKey?.(profile, npcName, $gameMap?.event(SceneManager._scene?._eventId));
      if (stanceKey === 'bubba')   return 'bubbaHimself';
      if (stanceKey === 'zealot')  return 'emZealot';
      if (stanceKey === 'annoyed') return 'emAnnoyed';
    }

    const { sexual, romantic } = _npcRomance(npcName, profile);
    const { partnered, style } = _romanceStanding(npcName, profile);

    // 1. Spoken for, exclusively.
    if (partnered && _ROM_EXCLUSIVE_STYLES.has(style?.key)) return 'taken';
    if (style?.key === 'aromantic-solo') return 'aromantic';

    // 2. No romantic pull at all, and no physical one for asexual NPCs.
    if (romantic?.key === 'aromantic') return 'aromantic';
    if (def.physical && sexual?.key === 'asexual') return 'asexual';

    // 3. The orientation governing this move: physical moves answer to the
    //    sexual orientation, everything else to the romantic one, each falling
    //    back to the other when the governing one opts out entirely.
    const gov = def.physical
      ? (sexual   && sexual.key   !== 'asexual'   ? sexual   : romantic)
      : (romantic && romantic.key !== 'aromantic' ? romantic : sexual);
    if (!gov) return null;

    // 4. Orientations that want something the party simply is not.
    if (gov.key === 'bubbaromantic' && !/bubba/i.test(actor.name() || '')) return 'bubba';
    if (_ROM_SYNTHETIC.has(gov.key) && !_actorIsSynthetic(actor))          return 'synthetic';
    if (_ROM_BOTANIC.has(gov.key)   && !_actorIsBotanic(actor))            return 'botanic';

    // 5. Gender, unless either side is Non-binary or Cocoon.
    const ag = actor.gender ? actor.gender() : 0;
    const ng = profile?.gender ?? 0;
    if (_ROM_GENDER_FLUID(ag) || _ROM_GENDER_FLUID(ng)) return null;
    if (_ROM_SAME_GENDER.has(gov.key) && ag !== ng) return 'orientation';
    if (_ROM_DIFF_GENDER.has(gov.key) && ag === ng) return 'orientation';
    return null;
  }

  // Courting the same person over and over wears thin fast; repeating one
  // particular move wears thinnest of all.
  function _romanceFatigue(profile, id) {
    const nowMin = $gameVariables?.value(114) ?? 0;
    const cutoff = nowMin - 2 * 1440;
    let same = 0, any = 0;
    for (const e of profile?.eventLog || []) {
      if (typeof e?.tag !== 'string' || !e.tag.startsWith('romance_')) continue;
      if ((e.gameMin ?? 0) < cutoff) continue;
      any++;
      if (e.tag === 'romance_' + id) same++;
    }
    return any + same * 2;
  }

  function _romanceCharm(actor) {
    if (!actor) return 0;
    const luk = actor.luk ?? 0;
    return Math.max(-10, Math.min(14, Math.round((luk - 20) / 5) + Math.floor((actor.level ?? 1) / 8)));
  }

  // Odds the move lands. Attraction is now the dominant term (it is the axis
  // courting actually spends and builds, see _addNpcAttraction), disposition
  // a secondary one (trait compatibility and the hygiene of both parties
  // already ride inside the effective opinion), the boldness tier the main
  // brake.
  const _ROM_TIER_PENALTY = 11;
  // Courting happens at arm's length or closer, so the hygiene reading that
  // already dulled the disposition is felt a second time here, at full weight
  // in percentage points. Traits still rule it: a Feral suitor never notices,
  // a Germaphobe cannot get past it. See _hygienePenalty
  // (NPCEmpathize.js) for the whole table.
  const _ROM_HYGIENE_WEIGHT = 1;
  function _romanceChance(profile, npcName, actor, def, opinion, attraction) {
    const { sexual, romantic } = _npcRomance(npcName, profile);
    const { style }            = _romanceStanding(npcName, profile);

    let c = 44
      + (Number(attraction) || 0) * 0.55
      + (Number(opinion) || 0) * 0.20
      + _romanceCharm(actor)
      + Math.round((_personalitySocialMult(profile, 'positive') - 1) * 22)
      + (_ROM_STYLE_MOD[style?.key] || 0)
      + _hygienePenalty(profile, actor, _ROM_HYGIENE_WEIGHT)
      - (Number(def.tier) || 1) * _ROM_TIER_PENALTY
      - _romanceFatigue(profile, def.id) * 5;

    // Demi NPCs need the bond before anything else can grow on it.
    if ((sexual?.key === 'demisexual' || romantic?.key === 'demiromantic') && opinion < 45) c -= 25;
    // A sapioromantic is courted with wit rather than looks.
    if (romantic?.key === 'sapioromantic') c += Math.max(-8, Math.min(12, Math.round(((actor?.mat ?? 0) - 20) / 4)));
    // Nobody warms to a stranger they already dislike.
    if (opinion <= -60) c -= 15;

    return Math.round(Math.max(3, Math.min(95, c)));
  }

  // ==========================================================================
  // Propose (Court -> Propose)
  // ==========================================================================
  // A step past ordinary courting: naming an actual relationship out loud
  // instead of letting an attraction sit there unspent. It needs attraction
  // itself running very high, since that is the one axis courting exists to
  // build; it reads far better when the style asked for is already the one
  // the other person leans toward, and better again when the proposing party
  // member leans the exact same way.
  const _PROPOSE_MIN_ATTRACTION  = 60;  // below this the question is not even entertained
  const _PROPOSE_BASE            = -30;
  const _PROPOSE_ATTR_WEIGHT     = 0.9;
  const _PROPOSE_OPINION_WEIGHT  = 0.18;
  const _PROPOSE_NPC_MATCH_BONUS = 24;  // the style asked for is what THEY lean toward
  const _PROPOSE_MUTUAL_BONUS    = 20;  // AND the proposer leans the very same way

  // Every style an actual partnership could settle into; the "solo" styles
  // describe not being partnered at all, which a proposal is the opposite of.
  function _proposeStyles() {
    return (_relationshipData().styles || []).filter(s => s.mode === 'partnered' || s.mode === 'any');
  }

  // Reuses the ordinary Court gate (taken, aromantic, orientation, Em/Bubba...)
  // before adding the one rule that belongs to Propose alone.
  function _proposeBlockReason(profile, npcName, actor, attraction) {
    const reason = _romanceBlockReason(profile, npcName, actor, { physical: false });
    if (reason) return reason;
    if ((Number(attraction) || 0) < _PROPOSE_MIN_ATTRACTION) return 'lowAttraction';
    return null;
  }

  function _proposeChance(profile, npcName, actor, styleKey, attraction, opinion) {
    const npcStyle   = _npcRelationshipStyle(npcName, true, profile);
    const actorStyle = actor ? _npcRelationshipStyle(actor.name(), true, _getProfile(actor.name())) : null;
    let c = _PROPOSE_BASE
      + (Number(attraction) || 0) * _PROPOSE_ATTR_WEIGHT
      + (Number(opinion)    || 0) * _PROPOSE_OPINION_WEIGHT
      + _romanceCharm(actor)
      + Math.round((_personalitySocialMult(profile, 'positive') - 1) * 20)
      + _hygienePenalty(profile, actor, _ROM_HYGIENE_WEIGHT);
    if (npcStyle && styleKey === npcStyle.key) {
      c += _PROPOSE_NPC_MATCH_BONUS;
      if (actorStyle && styleKey === actorStyle.key) c += _PROPOSE_MUTUAL_BONUS;
    }
    return Math.round(Math.max(2, Math.min(96, c)));
  }

  // The Court submenu's rows, one per move, each carrying its own odds and the
  // reason it cannot land when it cannot.
  Scene_NPCEmpathize.prototype._romanceOptions = function () {
    const lang       = ConfigManager.language === 'it' ? 'it' : 'en';
    const npcName    = this._targetName();
    const profile    = _getProfile(npcName);
    const actor      = this._focusActor();
    const opinion    = this._focusOpinion(profile);
    const attraction = this._focusAttraction(profile);

    // Bubba (Switch 49) courting the one person who has loved him from a
    // distance for years: every move on her lands.
    const guaranteed = _bubbaGuaranteedLand(npcName, profile, actor);

    const moves = _romanceActions().map(def => {
      const reason = guaranteed ? null : _romanceBlockReason(profile, npcName, actor, def);
      const pool   = reason ? _romanceRejection(reason) : null;
      return {
        id:     def.id,
        label:  def.label || def.id,
        reason,
        reasonLabel: pool ? (pool.reasonLabel || '') : '',
        chance: reason ? 0 : (guaranteed ? 100 : _romanceChance(profile, npcName, actor, def, opinion, attraction)),
        gain:   Number(def.successDelta) || 0,
        loss:   Number(def.failDelta)    || 0,
      };
    });

    // Propose opens a further choice (which relationship style) rather than
    // resolving here, so it carries no single chance of its own to show.
    const proposeReason = _proposeBlockReason(profile, npcName, actor, attraction);
    moves.push({
      id: 'propose',
      label: T.proposeLabel,
      reason: proposeReason,
      reasonLabel: proposeReason === 'lowAttraction'
        ? T.proposeNeedsAttraction
        : (proposeReason ? (_romanceRejection(proposeReason)?.reasonLabel || '') : ''),
      chance: null,
      gain: 0,
      loss: 0,
      submenu: true,
    });
    return moves;
  };

  // Says out loud what the odds below have already been docked for, so a run of
  // suddenly hopeless numbers reads as a bath the party skipped rather than as
  // the NPC turning cold. Only the side that is actually noticed is mentioned,
  // and a suitor whose traits ignore the smell is told nothing.
  const _ROM_HYGIENE_HINT_AT = -4; // opinion points, below which it is worth saying
  Scene_NPCEmpathize.prototype._buildRomanceHygieneHint = function () {
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    if (!profile || !actor) return '';
    const { theirs, mine } = _hygieneReadout(profile, actor);
    const lines = [];
    if (theirs <= _ROM_HYGIENE_HINT_AT) lines.push(T('Empathize.hygieneCourtSelf', { name: npcName }));
    if (mine   <= _ROM_HYGIENE_HINT_AT) lines.push(T('Empathize.hygieneCourtNpc',  { name: npcName }));
    if (!lines.length) return '';
    return `<div class="npc-note npc-mb-1">` +
      lines.map(l => _escapeHtml(l)).join('<br>') + `</div>`;
  };

  Scene_NPCEmpathize.prototype._buildInlineRomanceActions = function (T) {
    let html = this._buildRomanceHygieneHint();
    html += this._romanceOptions().map(o => {
      const open = `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._romanceInteract('${o.id}')">`;
      if (o.reason) {
        return `${open}<span class="${OPT} npc-sub">${_escapeHtml(o.label)}</span>` +
          `<span class="npc-bad npc-aside">0%</span>` +
          (o.reasonLabel ? `<span class="npc-note npc-aside-sm">${_escapeHtml(o.reasonLabel)}</span>` : '') +
          `</div>`;
      }
      // Propose carries no single chance of its own: it opens a further page,
      // one row per relationship style, each with its own odds.
      if (o.submenu) {
        return `${open}<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
          `<span class="npc-sub npc-aside">&rsaquo;</span></div>`;
      }
      const cc = o.chance >= 60 ? 'good' : o.chance >= 30 ? 'warm' : 'bad';
      return `${open}<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
        `<span class="npc-good npc-aside">+${o.gain}♥</span>` +
        `<span class="npc-bad npc-aside-sm">${o.loss}♥</span>` +
        `<span class="npc-score--${cc} npc-aside npc-em">${o.chance}%</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Leaves the Court list for the Propose list: every relationship style the
  // world knows, each with its own odds against this NPC. Refuses quietly
  // (the row was already greyed out) if reached through a stale panel.
  Scene_NPCEmpathize.prototype._openPropose = function () {
    const npcName    = this._targetName();
    const profile    = _getProfile(npcName);
    const actor      = this._focusActor();
    const attraction = this._focusAttraction(profile);
    if (_proposeBlockReason(profile, npcName, actor, attraction)) { SoundManager.playBuzzer(); return; }
    SoundManager.playCursor();
    this._romanceMode = false;
    this._proposeMode  = true;
    this._menuIndex    = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._proposeOptions = function () {
    const nm          = v => _dbText(v?.name);
    const npcName     = this._targetName();
    const profile     = _getProfile(npcName);
    const actor       = this._focusActor();
    const opinion     = this._focusOpinion(profile);
    const attraction  = this._focusAttraction(profile);
    return _proposeStyles().map(style => ({
      key:    style.key,
      label:  nm(style),
      chance: _proposeChance(profile, npcName, actor, style.key, attraction, opinion),
    }));
  };

  Scene_NPCEmpathize.prototype._buildInlineProposeActions = function (T) {
    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.proposeSubtitle)}</div>`;
    html += this._proposeOptions().map(o => {
      const cc = o.chance >= 60 ? 'good' : o.chance >= 30 ? 'warm' : 'bad';
      return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._proposeInteract('${o.key}')">` +
        `<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
        `<span class="npc-score--${cc} npc-aside npc-em">${o.chance}%</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelPropose()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Steps back from the style picker to the Court list it was opened from,
  // rather than all the way out to the standing menu of verbs.
  Scene_NPCEmpathize.prototype._cancelPropose = function () {
    this._proposeMode = false;
    this._romanceMode = true;
    this._menuIndex   = 0;
    this._render();
  };

  // Resolving a proposal: unlike an ordinary Court move it can actually start
  // something. A landed proposal writes the style asked for onto this NPC's
  // own record (_npcRelationshipStyle reads profile._relStyleOverride first,
  // exactly the way profile._orientOverride already overrules a rolled
  // orientation) and updates NPCLifeSim's sentimental-status record, the one
  // the Romance tab already reads live, so the panel tells the truth about it
  // from the very next render.
  Scene_NPCEmpathize.prototype._proposeInteract = async function (styleKey) {
    const nm      = v => _dbText(v?.name);
    const style   = (_relationshipData().styles || []).find(s => s.key === styleKey);
    if (!style) return;
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    const actorId = actor && actor.actorId();
    const fill    = s => vary(String(s || '').replace(/\{name\}/g, npcName).replace(/\{style\}/g, nm(style)));

    const priorOpinion = this._focusOpinion(profile);
    if (_courtRefused(profile, actorId, priorOpinion)) { SoundManager.playBuzzer(); return; }

    const priorAttraction = this._focusAttraction(profile);
    const reason = _proposeBlockReason(profile, npcName, actor, priorAttraction);
    const bank   = (_socialLines().romance || {}).propose || {};
    const playerLine = fill(_rand(bank.player));
    let npcLine, delta, landed = false;

    if (reason) {
      const pool = _romanceRejection(reason) || {};
      npcLine = fill(_rand(pool.lines)) || fill(_rand(bank.reject));
      delta   = Number(pool.delta) || -4;
    } else {
      const chance = _proposeChance(profile, npcName, actor, styleKey, priorAttraction, priorOpinion);
      if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Proposal: ${nm(style)}`,
          statName: 'PSI',
          modifier: actor?.psiMod || 0
        });
        landed = res.success;
      } else {
        landed = Math.random() * 100 < chance;
      }
      npcLine = fill(_rand(landed ? bank.accept : bank.reject));
      delta   = landed ? 20 : -14;
    }

    if (profile && actorId != null) {
      _addNpcAttraction(profile, actorId, delta);
      (profile.eventLog ??= []).push({
        tag: 'romance_propose', desc: `propose ${styleKey} (${delta >= 0 ? '+' : ''}${delta})`, // i18n-ignore: event-log record id
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });
      if ((profile.factionIndex ?? -1) >= 0 && delta !== 0 && window.$gameFactions?.changeReputation)
        window.$gameFactions.changeReputation(profile.factionIndex, Math.round(delta / 8));
    }

    if (landed && profile) {
      profile._relStyleOverride = styleKey;
      if (window.NPCLifeSim && actor) {
        window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
        const record = window.NPCLifeSim.getRecord?.(npcName);
        if (record) {
          record.partner            = { name: actor.name(), external: true };
          record.maritalStatus      = (styleKey === 'arranged-marriage' || styleKey === 'civil-union')
            ? 'married' : 'dating';
          record.partnerSinceMinute = $gameVariables?.value(114) ?? 0;
        }
      }
    }

    const charge = priorOpinion < 0
      ? _recordUnwantedCourting(profile, actorId, npcName, actor ? actor.name() : '')
      : null;

    if (landed) SoundManager.playOk(); else SoundManager.playBuzzer();

    if (window.Diary && actor) {
      window.Diary.onRomance(actor.name(), npcName, 'propose_' + styleKey, landed);
    }

    this._proposeMode = false;
    this._romanceMode = false;
    this._activeTab   = 'chat';
    this._chatHistory.push({ role: 'player', text: playerLine });
    this._isTyping    = true;
    const deltaText   = `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`;
    this._joinMessage = charge
      ? { type: 'reject', text: `${charge} ${deltaText}` }
      : { type: landed ? 'accept' : 'reject', text: deltaText };
    this._render();
    this._scrollChatToBottom();
    setTimeout(() => {
      this._isTyping = false;
      this._chatHistory.push({ role: 'npc', text: npcLine });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      this._render();
      this._scrollChatToBottom();
    }, 350);
  };

  Scene_NPCEmpathize.prototype._romanceInteract = async function (id) {
    if (id === 'propose') return this._openPropose();
    const def = _romanceActions().find(a => a.id === id);
    if (!def) return;
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    const actorId = actor && actor.actorId();
    const fill    = s => vary(String(s || '').replace(/\{name\}/g, npcName));

    // A complaint already on file takes Court off the menu, so this is only
    // reachable through a stale panel: refuse it rather than act on it.
    const priorOpinion = this._focusOpinion(profile);
    if (_courtRefused(profile, actorId, priorOpinion)) { SoundManager.playBuzzer(); return; }

    const priorAttraction = this._focusAttraction(profile);
    // Bubba (Switch 49) courting the one person who has loved him from a
    // distance for years: every move on her lands, no roll needed.
    const guaranteed = _bubbaGuaranteedLand(npcName, profile, actor);
    const reason = guaranteed ? null : _romanceBlockReason(profile, npcName, actor, def);
    const playerLine = fill(_rand(def.player));
    let npcLine, delta, landed = false;

    if (reason) {
      // Incompatible / 0% chance: a Nat 20 will NOT guarantee result and still yields 0 / failure
      const pool = _romanceRejection(reason) || {};
      npcLine = fill(_rand(pool.lines));
      delta   = Number(pool.delta) || 0;
      landed  = false;
    } else {
      const chance = guaranteed ? 100 : _romanceChance(profile, npcName, actor, def, priorOpinion, priorAttraction);
      if (guaranteed) {
        landed = true;
      } else if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Romance: ${def.label || id}`,
          statName: 'PSI',
          modifier: actor?.psiMod || 0
        });
        landed = res.success;
      } else {
        landed = Math.random() * 100 < chance;
      }
      npcLine = fill(_rand(landed ? def.responseGood : def.responseBad));
      delta   = landed
        ? Math.max(1,  Math.round(def.successDelta * _personalitySocialMult(profile, 'positive')))
        : Math.min(-1, Math.round(def.failDelta    * _personalitySocialMult(profile, 'negative')));
    }

    // Reputation is tracked apart from attraction: a move that lands moves how
    // much this NPC WANTS the focused member rather than how much they think
    // of them in general. Nothing is written to the NPCLifeSim partnership
    // record either, that is what Propose (below) is for.
    // Em raising it with Bubba. Nothing is written to attraction, because there
    // is none in either direction and the bar stays on zero forever: what moves
    // is the bond, and this is the only thing in the game that moves it down.
    const pairCtx = this._pairCtx?.() ?? null;
    if (pairCtx) _addPairBond(-Math.max(4, Math.abs(delta)));

    if (profile && actorId != null && !pairCtx) {
      _addNpcAttraction(profile, actorId, delta);
      (profile.eventLog ??= []).push({
        tag: 'romance_' + id, desc: `${id} (${delta >= 0 ? '+' : ''}${delta})`,
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });
      if ((profile.factionIndex ?? -1) >= 0 && delta !== 0 && window.$gameFactions?.changeReputation)
        window.$gameFactions.changeReputation(profile.factionIndex, Math.round(delta / 8));
    }

    // Pressing a suit on somebody who already dislikes the suitor is pestering
    // rather than flirting, and the third time it is a matter for the law.
    const charge = priorOpinion < 0
      ? _recordUnwantedCourting(profile, actorId, npcName, actor ? actor.name() : '')
      : null;

    if (landed) SoundManager.playOk(); else SoundManager.playBuzzer();

    // A suit pressed, and how it landed, in the party's own diary (Diary.js).
    if (window.Diary && actor) {
      window.Diary.onRomance(actor.name(), npcName, id, landed);
    }

    this._romanceMode = false;
    this._activeTab   = 'chat';
    this._chatHistory.push({ role: 'player', text: playerLine });
    this._isTyping    = true;
    const deltaText   = `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`;
    this._joinMessage = charge
      ? { type: 'reject', text: `${charge} ${deltaText}` }
      : { type: delta >= 0 ? 'accept' : 'reject', text: deltaText };
    this._render();
    this._scrollChatToBottom();
    setTimeout(() => {
      this._isTyping = false;
      this._chatHistory.push({ role: 'npc', text: npcLine });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      this._render();
      this._scrollChatToBottom();
    }, 350);
  };

  // ============================================================================
  // Ask Directions (chat submenu)
  // ============================================================================
  // The NPC points the player at anything worth walking to on the current map:
  // the door / teleport events, and everyone else standing on it. One tile
  // reads as one metre, and the bearing is taken from the PLAYER rather than
  // from the speaker, since it is the player who has to walk it.

  const _DIR_LABEL_KEYS = ['dirN', 'dirNE', 'dirE', 'dirSE', 'dirS', 'dirSW', 'dirW', 'dirNW'];
  const _DIR_FALLBACK   = ['north', 'north-east', 'east', 'south-east',
                           'south', 'south-west', 'west', 'north-west'];
  // Event names that count as a way out of the map.
  const _DIR_DOOR_RE = /^(doors?|teleport|transfer)\b/i;
  // Notes that mark an event as a person (NPCSystem's ai/local tags, or the
  // <NPC-classId> tag the society system stamps on citizens).
  const _DIR_PERSON_RE = /\bai\b|\blocal\b|NPC-\d+/i;
  const _DIR_MAX_PER_GROUP = 10;
  const _DIR_HERE_RADIUS   = 2; // closer than this and a bearing is meaningless

  // Exit event names are written for the map editor, not for the player:
  // "Door (1416 - Story mode Inn)", "Transfer (566 Training center)",
  // "Teleport - Roma". Only the place on the far side is worth saying out loud,
  // so the map id, the plumbing word and the punctuation between them all go.
  function _destinationName(rawName) {
    // A place that is a travel destination is said the way its Destinations.json
    // entry names it; anything else is said as the event wrote it.
    const spoken = (s) => window.WorkSystem?.destinationName
      ? window.WorkSystem.destinationName(s) : s;
    const name = String(rawName || '').trim();
    const paren = name.match(/\(([^)]*)\)/);
    if (paren) {
      const inner = paren[1].replace(/^\s*\d+\s*[-–—:.]?\s*/, '').trim();
      if (inner) return spoken(inner);
    }
    // "Teleport - Roma", "Door: Cellar", "Transfer 2 - Docks"
    const dashed = name.match(/^[A-Za-z]+\s*\d*\s*[-–—:]\s*(.+)$/);
    if (dashed && dashed[1].trim()) return spoken(dashed[1].trim());
    return spoken(name);
  }

  // Four doors onto the same Grove are one place as far as the player is
  // concerned, so entries are folded by the name they resolve to (case and
  // spacing ignored) rather than being numbered apart.
  function _dirGroupKey(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // 0 = north, then clockwise in 45 degree sectors. Map y grows southward.
  function _compassLabel(T, dx, dy) {
    const deg = Math.atan2(-dy, dx) * 180 / Math.PI; // 0 = east, 90 = north
    const i   = Math.round(((450 - deg) % 360) / 45) % 8;
    return T[_DIR_LABEL_KEYS[i]] || _DIR_FALLBACK[i];
  }

  // Everything on the map the speaker could sensibly point at, split into the
  // two groups the submenu shows and sorted nearest-first.
  Scene_NPCEmpathize.prototype._collectDirectionTargets = function () {
    const px = $gamePlayer?.x ?? 0;
    const py = $gamePlayer?.y ?? 0;
    const speaker = this._eventId;
    const doors = [], people = [];
    for (const ev of ($gameMap?.events?.() || [])) {
      if (!ev || ev._erased || ev.eventId() === speaker) continue;
      const data = ev.event?.();
      const name = (data?.name || '').trim();
      if (!name || /^Player\d+$/.test(name)) continue;
      const dx = ev.x - px, dy = ev.y - py;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      // A door is listed (and asked about) by where it leads, never by the
      // editor name; people already carry the name the player knows them by.
      // A Note on the event itself ("Dirty Inn") overrides the parsed name,
      // matching MapLevelDisplay's door-name override on the arrival banner.
      if (_DIR_DOOR_RE.test(name)) {
        const noteOverride = (data?.note || '').trim();
        doors.push({ name: noteOverride || _destinationName(name), dx, dy, dist });
      }
      else if (_DIR_PERSON_RE.test(data?.note || '') || _getProfile(name)) people.push({ name, dx, dy, dist });
    }
    // Nearest first, then folded by name: every way into the same place is one
    // row, standing for the nearest of them, carrying how many there are.
    const trim = list => {
      list.sort((a, b) => a.dist - b.dist);
      const byKey = {};
      const groups = [];
      for (const e of list) {
        const key = _dirGroupKey(e.name);
        if (byKey[key]) { byKey[key].count++; continue; }
        e.count = 1;
        e.label = e.name;
        byKey[key] = e;
        groups.push(e);
      }
      return groups.slice(0, _DIR_MAX_PER_GROUP);
    };
    return { doors: trim(doors), people: trim(people) };
  };

  Scene_NPCEmpathize.prototype._buildInlineDirectionActions = function (T) {
    const { doors, people } = this._collectDirectionTargets();
    // Flattened once here and kept on the scene, so the click handler answers
    // about exactly the row that was drawn.
    this._directionList = [...doors, ...people];

    const hdr = text =>
      `<div class="npc-row-full">${_escapeHtml(text)}</div>`;
    const row = (entry, i) =>
      `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._answerDirections(${i})">` +
      `<span>${_escapeHtml(entry.label)}</span>` +
      (entry.count > 1
        ? `<span class="npc-sub npc-aside">${_escapeHtml(T('Empathize.directionsCount', { count: String(entry.count) }))}</span>`
        : '') +
      `<span class="npc-sub npc-aside">${entry.dist} m</span></div>`;

    let html = '';
    if (!this._directionList.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.directionsNone)}</span>`;
    } else {
      if (doors.length) {
        html += hdr(T.directionsDoors);
        html += doors.map((e, i) => row(e, i)).join('');
      }
      if (people.length) {
        html += hdr(T.directionsPeople);
        html += people.map((e, i) => row(e, doors.length + i)).join('');
      }
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._answerDirections = function (index) {
    const entry = (this._directionList || [])[index];
    if (!entry) return;
    const T = _getT();

    const ask = T('Empathize.directionsIntro', { target: entry.label });
    // A folded row stands for several of the same place, so the answer says
    // which one it is pointing at.
    const key = entry.dist <= _DIR_HERE_RADIUS ? 'directionsHere'
      : (entry.count > 1 ? 'directionsAnswerNearest' : 'directionsAnswer');
    const answer = vary(T('Empathize.' + key, {
      target: entry.label,
      count: String(entry.count || 1),
      dist: String(entry.dist),
      dir: _compassLabel(T, entry.dx, entry.dy),
    }));

    this._directionsMode = false;
    this._activeTab      = 'chat';
    this._joinMessage    = null;
    this._chatHistory.push({ role: 'player', text: ask });
    this._isTyping       = true;
    this._render();
    this._scrollChatToBottom();
    setTimeout(() => {
      this._isTyping = false;
      this._chatHistory.push({ role: 'npc', text: answer });
      if (this._chatHistory.length > 16) this._chatHistory = this._chatHistory.slice(-16);
      this._render();
      this._scrollChatToBottom();
    }, 350);
  };

  // ============================================================================
  // Life history tab
  // ============================================================================

  // Em's history is the one the world already wrote for her (docs/Lore.odt), and
  // the only party member's past the life simulator can never produce: the
  // Solomonic Ritual took it. Printed above whatever has since been recorded,
  // with the procedural paragraph for the branch THIS Em arrived from last.
  function _buildEmBackstoryHTML(T, actorObj) {
    const CP = window.CharacterPresets;
    if (!actorObj || !CP?.getEmBackstory || !CP.isEmPlaythrough?.()) return '';
    if (actorObj.name() !== 'Em') return '';
    const story = CP.getEmBackstory(ConfigManager.language);
    if (!story || !story.paragraphs?.length) return '';
    const body = story.paragraphs
      .map(p => `<p class="npc-para">${_linkify(p)}</p>`)
      .join('');
    const branch = story.branch
      ? `<div class="npc-routine-sub-hdr">${_escapeHtml(T.emBranchHdr)}</div>
         <div class="npc-backstory-text">${_linkify(story.branch)}</div>`
      : '';
    return `<div class="npc-backstory-text">${body}</div>${branch}`;
  }

  Scene_NPCEmpathize.prototype._buildLifeHistoryHTML = function (T, profile, npcName) {
    const headerHTML = `
      <div class="npc-sec-hdr npc-mb-2">${T.lifeHistoryTitle}</div>
      <hr class="npc-r-sep">`;

    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    const emHTML = _buildEmBackstoryHTML(T, actorObj);

    const log = profile?.eventLog ?? [];
    if (!log.length) {
      return emHTML
        ? `${headerHTML}${emHTML}`
        : `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noLifeHistory)}</p>`;
    }

    const narrative = window.NPCSim?.StoryLogger?.generateNarrative?.(npcName)
      ?? T('Empathize.noRecordedHistory', { name: npcName });

    const rows = _collapseByDay(log.map(e => ({
      min:  e.gameMin ?? e.minute ?? 0,
      text: _goldTextToEuros(window.NPCSim?.StoryLogger?.textOf?.(e) ?? e.desc ?? ''),
    }))).map(g => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(g.when)}</span>
        <span>${_escapeHtml(g.text)}${_timesSuffix(g.count)}</span>
      </div>`).join('');

    return `
      ${headerHTML}
      ${emHTML}
      <div class="npc-backstory-text">${_escapeHtml(_goldTextToEuros(narrative))}</div>
      ${_buildQuestHistoryHTML(T, npcName)}
      <div class="npc-routine-sub-hdr">${T.lifeHistoryTimeline}</div>
      ${rows}`;
  };

  // Contracts this person has posted and the party has taken, honoured or not.
  // ProceduralQuestSystem records them per NPC name; a person the party has never
  // worked for contributes nothing to the page.
  function _buildQuestHistoryHTML(T, npcName) {
    const api = window.ProceduralQuests;
    if (!api || typeof api.npcQuestHistory !== 'function' || !npcName) return '';
    let log = [];
    try { log = api.npcQuestHistory(npcName) || []; } catch (e) { return ''; }
    if (!log.length) return '';

    const isIt = ConfigManager.language === 'it';
    const fmt = gameMin => _gameStamp(gameMin, true);
    const done = log.filter(e => e.outcome === 'done').length;
    const failed = log.length - done;

    const rows = log.slice().reverse().map(e => {
      const ok = e.outcome === 'done';
      const badge = ok ? (isIt ? 'ONORATO' : 'HONOURED') : (isIt ? 'FALLITO' : 'FAILED');
      const band = ok ? 'good' : 'bad';
      return `
        <div class="npc-life-row">
          <span class="npc-life-time">${fmt(e.minute)}</span>
          <span><strong class="npc-score--${band}">${badge}</strong> ${_escapeHtml(String(e.title || ''))}</span>
        </div>`;
    }).join('');

    const summary = T('Empathize.contractsSummary', { done: done, failed: failed });

    return `
      <div class="npc-routine-sub-hdr">${_escapeHtml(T('Empathize.contractsWithYou'))}</div>
      <div class="npc-thought">${_escapeHtml(summary)}</div>
      ${rows}`;
  }

  // ============================================================================
  // WIKI, entity profile rendering (nations, hyperpowers, leaders, artifacts,
  // factions). The chat tab does not exist here; tabs are entity-specific and
  // every recognized name in the content is a hyperlink to its own profile.
  // ============================================================================

  const ENTITY_TAB_SETS = {
    nation:   T => [
      { id: 'overview',   label: T.overview },
      { id: 'govHistory', label: T.governmentHistory },
      { id: 'elections',  label: T.electionRecords },
      { id: 'events',     label: T.eventsTab },
    ],
    power:    T => [
      { id: 'overview',  label: T.overview },
      { id: 'leaders',   label: T.leadersTab },
      { id: 'elections', label: T.electionRecords },
      { id: 'events',    label: T.eventsTab },
    ],
    leader:   T => [
      { id: 'overview', label: T.overview },
      { id: 'events',   label: T.eventsTab },
    ],
    artifact: T => [
      { id: 'overview', label: T.overview },
      { id: 'holders',  label: T.holdersTab },
    ],
    faction:  T => [
      { id: 'overview', label: T.overview },
      { id: 'members',  label: T.membersTab },
      { id: 'events',   label: T.eventsTab },
    ],
  };

  // ============================================================================
  // SCREEN 4 OF 5: THE ENTITY WIKI
  // ============================================================================
  // An article about a thing rather than a person: a nation, a hyperpower, a
  // faction, a party, a creed, an artifact or a historical leader. Same shell,
  // same tab bar, a different subject.

  Scene_NPCEmpathize.prototype._renderEntityInner = function () {
    const T    = _getT();
    const ent  = this._entity;
    const view = Wiki.get(ent.type, ent.id);

    const tabs = view ? (ENTITY_TAB_SETS[view.type]?.(T) ?? [{ id: 'overview', label: T.overview }])
                      : [{ id: 'overview', label: T.overview }];
    tabs.push({ id: 'wiki', label: T.wikiTab });
    this._entityTabs = tabs.map(t => t.id);
    if (!this._entityTabs.includes(this._activeTab)) this._activeTab = this._entityTabs[0];

    if (this._tabBarEl) {
      // Same chip as everywhere else, closing the panel when there is nothing
      // behind it to go back to.
      const backHTML = this._buildBackBtnHTML(T, { closeWhenEmpty: true });
      this._tabBarEl.innerHTML = backHTML + this._buildTabHintHTML() + tabs.map(tab => `
        <div class="npc-tab${this._activeTab === tab.id ? ' active' : ''}"
             onmousedown="event.stopPropagation();SceneManager._scene._setTab('${tab.id}')">${_escapeHtml(tab.label)}</div>`).join('');
      this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }

    if (!this._leftEl || !this._rightEl) return;
    this._rightEl.classList.remove('npc-right-panel--chat');

    if (!view) {
      this._leftEl.innerHTML = `
        <div class="npc-entity-emblem">?</div>
        <div class="npc-entity-title">${_escapeHtml(String(ent.id))}</div>`;
      this._rightEl.innerHTML = this._activeTab === 'wiki'
        ? this._buildWikiTabHTML(T)
        : `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
      return;
    }

    this._leftEl.innerHTML = this._buildEntityLeftHTML(view, T);

    let rightHTML;
    const tab = this._activeTab;
    if (tab === 'wiki') {
      rightHTML = this._buildWikiTabHTML(T);
    } else if (view.type === 'nation') {
      rightHTML = tab === 'govHistory' ? this._buildNationGovHistoryHTML(view, T)
        : tab === 'elections' ? this._buildElectionsHTML(view.power, T)
        : tab === 'events'    ? this._buildEntityEventsHTML(view, T)
        : this._buildNationOverviewHTML(view, T);
    } else if (view.type === 'power') {
      rightHTML = tab === 'leaders' ? this._buildPowerLeadersHTML(view, T)
        : tab === 'elections' ? this._buildElectionsHTML(view.live, T)
        : tab === 'events'    ? this._buildEntityEventsHTML(view, T)
        : this._buildPowerOverviewHTML(view, T);
    } else if (view.type === 'leader') {
      rightHTML = tab === 'events' ? this._buildEntityEventsHTML(view, T)
        : this._buildLeaderOverviewHTML(view, T);
    } else if (view.type === 'artifact') {
      rightHTML = tab === 'holders' ? this._buildArtifactHoldersHTML(view, T)
        : this._buildArtifactOverviewHTML(view, T);
    } else if (view.type === 'faction') {
      rightHTML = tab === 'members' ? this._buildFactionMembersHTML(view, T)
        : tab === 'events' ? this._buildEntityEventsHTML(view, T)
        : this._buildFactionOverviewHTML(view, T);
    } else if (view.type === 'party') {
      rightHTML = this._buildPartyOverviewHTML(view, T);
    } else if (view.type === 'ideology') {
      rightHTML = this._buildIdeologyOverviewHTML(view, T);
    } else {
      rightHTML = this._buildEntityEventsHTML(view, T);
    }
    this._rightEl.innerHTML = rightHTML;
  };

  // ── Left column: emblem + entity-specific side panel (replaces needs bars) ──

  Scene_NPCEmpathize.prototype._buildEntityLeftHTML = function (view, T) {
    const emblem = _emblemOf(view.type);
    const kickerMap = {
      nation: T.wikiNation, power: T.wikiHyperpower, leader: T.wikiLeader,
      artifact: T.wikiArtifact, faction: T.wikiFaction,
      party: T.wikiPoliticalParty, ideology: T.wikiIdeology,
    };
    const kicker = kickerMap[view.type] || emblem.kicker;
    const initials = String(view.name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('');

    let sideHTML = '';
    if (view.type === 'power') {
      const s = view.live?.state;
      if (s) {
        sideHTML =
          _meterRow(T.legitimacy, s.legitimacy, 'npc-fill--ok') +
          _meterRow(T.stability,  s.stability,  'npc-fill--mp') +
          _meterRow(T.unrest,        s.unrest,     'npc-fill--bad') +
          _meterRow(T.economyLbl,   s.economyMood, 'npc-fill--warn') +
          `<div class="npc-ident-row npc-mt-2">${_iconSpan(314, 17)}<span>${T.treasury}: ${_euros(view.live.state.treasury)}</span></div>`;
      } else if (view.hist) {
        sideHTML =
          _statBarRow(T.militaryLbl,       Math.round(view.hist.military ?? 0),    400, 'npc-fill--bad') +
          _statBarRow(T.economyLbl,         Math.round(view.hist.economy ?? 0),     400, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(view.hist.information ?? 0), 400, 'npc-fill--mp') +
          _statBarRow(T.arcaneLbl,           Math.round(view.hist.arcane ?? 0),      400, 'npc-fill--info');
      }
      // Show current holy leader for dual-track powers (e.g. Holy Vatican Empire)
      if (view.currentHoly) {
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(245, 17)}<span class="npc-sub">${_escapeHtml(T.holyLeader)}:</span>&nbsp;${_wikiLink('leader', view.currentHoly.name)}</div>`;
      }
    } else if (view.type === 'nation') {
      const ctrlHTML = view.controller !== 'Neutral'
        ? _wikiLink('power', view.controller)
        : `<span>${_escapeHtml(T.independent)}</span>`;
      sideHTML = `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.controlledBy)}:</span>&nbsp;${ctrlHTML}</div>`;
      if (view.government) sideHTML += _kvRow(186, T.government, _escapeHtml(view.government));
      const s = view.power?.state;
      if (s) {
        sideHTML += `<hr class="npc-r-sep">` +
          _meterRow(T.legitimacy, s.legitimacy, 'npc-fill--ok') +
          _meterRow(T.stability,  s.stability,  'npc-fill--mp') +
          _meterRow(T.unrest,        s.unrest,     'npc-fill--bad') +
          _meterRow(T.economyLbl,   s.economyMood, 'npc-fill--warn');
      }
    } else if (view.type === 'leader') {
      if (view.kind === 'politician' && view.pol) {
        const p = view.pol;
        sideHTML =
          _statBarRow(T.charisma,   Math.round(p.charisma),  100, 'npc-fill--warn') +
          _statBarRow(T.integrity, Math.round(p.integrity), 100, 'npc-fill--ok') +
          _statBarRow(T.cunning,     Math.round(p.cunning),   100, 'npc-fill--info') +
          _statBarRow(T.ambition,   Math.round(p.ambition),  100, 'npc-fill--bad') +
          _meterRow(T.approval,     p.approval, 'npc-fill--mp');
      } else if (view.leader) {
        sideHTML = _kvRow(186, T.ideologyLbl, _escapeHtml(_leaderIdeology(view.leader))) +
          _kvRow(220, T.reignLbl, _escapeHtml(`${view.leader.years?.[0] ?? '?'} – ${view.leader.years?.[1] ?? '?'}`));
      }
    } else if (view.type === 'artifact') {
      const data = view.data;
      if (data) {
        if (Array.isArray(data.params)) {
          const PL = _paramLabels();
          data.params.forEach((v, i) => {
            if (v) sideHTML += _statBarRow(PL[i], v, 255, 'npc-fill--info');
          });
        }
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(314, 17)}<span>${T.valueLbl}: <strong>${_euros(data.price)}</strong></span></div>`;
        if (data.weight) sideHTML += _kvRow(208, T.weightLbl, `${data.weight}`);
      }
      if (view.rec) {
        sideHTML += _kvRow(220, T.discovered, _escapeHtml(view.rec.date || '?'));
        const holder = view.rec.holders?.[view.rec.holders.length - 1];
        if (holder) sideHTML += `<div class="npc-ident-row">${_iconSpan(210, 17)}<span class="npc-sub">${_escapeHtml(T.currentHolder)}:</span>&nbsp;${_linkify(holder.holder)}</div>`;
      }
    } else if (view.type === 'faction') {
      const h = view.hist;
      if (h) {
        sideHTML =
          _statBarRow(T.arcaneLbl,           Math.round(h.arcane ?? 0),      200, 'npc-fill--info') +
          _statBarRow(T.techLbl,               Math.round(h.tech ?? 0),        200, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(h.information ?? 0), 200, 'npc-fill--mp');
      } else if (view.dlFaction) {
        sideHTML =
          _statBarRow(T.arcaneLbl,           Math.round(view.dlFaction.arcane ?? 0),      200, 'npc-fill--info') +
          _statBarRow(T.techLbl,               Math.round(view.dlFaction.velocity ?? 0),   200, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(view.dlFaction.information ?? 0), 200, 'npc-fill--mp');
      }
      // Show parent hyperpower if present
      if (view.parentPower) {
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', view.parentPower)}</div>`;
      }
    } else if (view.type === 'party') {
      const p = view.party;
      sideHTML = `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', view.power.name)}</div>`;
      if (view.ideology) sideHTML += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.ideologyLbl)}:</span>&nbsp;${_wikiLink('ideology', view.ideology.id, _ideologyLabel(view.ideology.id))}</div>`;
      if (view.leader) sideHTML += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(T.leaderOfPartyLbl)}:</span>&nbsp;${_wikiLink('leader', view.leader.name)}</div>`;
      sideHTML += `<hr class="npc-r-sep">`;
      if (p.foundedYear != null) sideHTML += _kvRow(220, T.foundedLbl, `${p.foundedYear}`);
      if (p.lastShare != null) sideHTML += _kvRow(216, T.lastShareLbl, `${p.lastShare}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}`);
      sideHTML += _kvRow(314, T.fundsLbl, _euros(p.funds));
    } else if (view.type === 'ideology') {
      const ax = view.ideo?.axes || {};
      sideHTML =
        _axisBarRow(T.axisEcon, ax.econ, 'npc-fill--warn') +
        _axisBarRow(T.axisAuth, ax.auth, 'npc-fill--bad') +
        _axisBarRow(T.axisTrad, ax.trad, 'npc-fill--info') +
        _axisBarRow(T.axisMil,  ax.mil,  'npc-fill--mp') +
        _axisBarRow(T.axisMyst, ax.myst, 'npc-fill--ok');
    }

    let deadHTML = '';
    if (view.type === 'leader' && view.death) {
      const when = view.death.date ? `, ${_escapeHtml(view.death.date)}` : '';
      deadHTML = `<div class="npc-dead-badge">✝ ${_escapeHtml(T.deceased)}${when}</div>`;
    }

    // A leader has a face. Every other article is an emblem of initials, but a
    // leader is a person, and the portrait here is the same picture the panel
    // that opens on them shows (both ask HistoryManager.leaderBust), so
    // stepping from the article into the person never changes who you are
    // looking at. Where the book has no picture for them, the initials stand.
    const emblemHTML = (hidden) =>
      `<div class="npc-entity-emblem npc-emblem-${view.type}"${hidden ? ' hidden' : ''} title="${_escapeHtml(_viewName(view))}">${initials ? _escapeHtml(initials) : emblem.glyph}</div>`;
    // A named portrait that has no file behind it is not replaced by the house
    // bust here: a main player nobody drew keeps their initials rather than
    // wearing a stranger's face, so the failed image steps aside for the emblem.
    const bustPath = view.type === 'leader' ? _leaderBustPath(view) : null;
    const headHTML = bustPath
      ? `<div class="npc-portrait-wrap">
           <img src="${_escapeHtml(bustPath)}" alt=""
                onerror="this.parentElement.hidden=true;this.parentElement.nextElementSibling.hidden=false">
         </div>${emblemHTML(true)}`
      : emblemHTML(false);

    return `
      ${headHTML}
      <div class="npc-entity-kicker">${_escapeHtml(kicker)}</div>
      <div class="npc-entity-title">${_escapeHtml(_viewName(view))}</div>
      ${deadHTML}
      ${view.type === 'leader' ? _leaderEmpathizeButtonHTML(view, T) : ''}
      <div class="npc-vitals-footer">${sideHTML}</div>`;
  };

  // The portrait a leader's article is headed with. The dossier carries it
  // (LeaderPersona resolves the book's own `bust` first, then the bust their
  // walk sheet already has); a procedural politician the book never named has
  // none and keeps the emblem.
  function _leaderBustPath(view) {
    const stored = view?.dossier?.bustPath;
    if (!stored || stored === '7' || stored === 0 || stored === '0') return null;
    // The book can name a portrait that was never drawn (a dossier edited by
    // hand, a look that never got its art). No house bust stands in for it:
    // an unresolvable or missing name means no portrait, and the article is
    // headed by the initials emblem instead.
    return _bustUrl(stored, null);
  }

  // Every leader is a living character, whether or not they were ever drawn on
  // a map: the world's politics moves them, the century's events are written
  // about them, and the society sim mints a person for the name the moment
  // anybody asks for one. This is the way in. It opens the ordinary Empathize
  // panel by name, which is the same panel a person standing in the street
  // gets, so a leader can be read, talked to and remembered like anyone else.
  function _leaderEmpathizeButtonHTML(view, T) {
    const name = String(view?.name ?? '');
    if (!name) return '';
    const safe = _encId(name);
    const d = view.dossier;
    // Which version of them the panel will open on, said plainly before it is
    // opened: the one this world made of them, or the one they start as.
    const noteKey = d && SOURCE_NOTE_KEYS[d.source];
    const note = noteKey ? T[noteKey] : '';
    // A leader who is travelling with the player is not read remotely: their
    // own actor is opened, so the panel shows the character sheet the player
    // has been building rather than a profile of somebody by that name.
    const open = (d && d.source === 'party' && d.actorId)
      ? `window.NPCEmpathize.openForActor(${d.actorId})`
      : `window.NPCEmpathize.openByName(decodeURIComponent('${safe}'))`;
    return `
      <div class="npc-entity-empathize">
        <div class="npc-chat-action-btn" onmousedown="event.stopPropagation();${open}">
          ${_iconSpan(82, 16)} ${_escapeHtml(T.empathizeBtn)}
        </div>
        ${note ? `<div class="npc-entity-empathize-note">${_escapeHtml(note)}</div>` : ''}
      </div>`;
  }

  // Where a leader's sheet came from, in the reader's words. `preset` and
  // `synthetic` are both "as they begin"; the other three say this world has
  // already made something of them.
  // What a leader's sheet was read off, said out loud on the article. An
  // untaken dossier says nothing: "playable, as they begin" is the default
  // state of every one of them and was noise on every page it appeared on.
  const SOURCE_NOTE_KEYS = {
    party:     'leaderSourceParty',
    retired:   'leaderSourceRetired',
    past:      'leaderSourcePast',
    preset:    '',
    synthetic: '',
  };

  // ── Nation ──────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildNationOverviewHTML = function (view, T) {
    const power = view.power;
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    const sub = [view.government,
      view.controller !== 'Neutral' ? _worldName('power', view.controller) : (T.independent)].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div><hr class="npc-r-sep">`;

    html += `<div class="npc-sec-hdr">${T.government}</div>`;
    if (view.government) html += _kvRow(186, T.government, _escapeHtml(view.government));
    html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.controlledBy)}:</span>&nbsp;${
      view.controller !== 'Neutral' ? _wikiLink('power', view.controller) : _escapeHtml(T.independent)
    }</div>`;
    if (view.faction && view.faction !== 'Neutral') {
      html += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.wikiFaction)}:</span>&nbsp;${_linkify(_worldName('faction', view.faction))}</div>`;
    }
    if (power) {
      const head = power.politicians?.[power.headId];
      html += _kvRow(216, T.seats, `${power.seats}, ${_escapeHtml(window.NPCPolitics?.powerLabel?.(power, 'legislature') || power.legislature)}`);
      if (head) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(_headTitle(power))}:</span>&nbsp;${_wikiLink('leader', head.name)}</div>`;
      const dateOf = window.NPCPolitics?.dateOf;
      if (power.nextElectionMinute != null && dateOf) {
        html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(power.nextElectionMinute)));
      }
      const pol = power.policies;
      if (pol) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.policiesLbl}</div>
          <div class="npc-stats-row">${_escapeHtml(`${T.taxRate} ${pol.taxRate}% · ${T.censorship} ${pol.censorship} · ${T.conscription} ${pol.conscription} · ${T.welfare} ${pol.welfare}`)}${pol.curfew ? ` · <span class="npc-bad npc-em">${_escapeHtml(T.curfewActive)}</span>` : ''}</div>`;
      }
    }

    // Latest government change, for flavor
    const last = view.history[view.history.length - 1];
    if (last && view.history.length > 1) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.governmentHistory}</div>
        <div class="npc-life-row"><span class="npc-life-time">${_escapeHtml(last.date)}</span><span>${_linkify(`${last.government} (${last.reason})`)}</span></div>`;
    }

    if (view.settlements.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.settlementsLbl}</div>`;
      for (const s of view.settlements) {
        const mayor = s.offices?.mayor;
        html += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span>${_escapeHtml(s.group)}</span>${
          mayor ? `<span class="npc-sub">&nbsp;- ${_escapeHtml(T.mayorLbl)}:&nbsp;</span>${_wikiLink('npc', mayor)}` : ''
        }</div>`;
      }
    }

    if (view.seasons) {
      const su = view.seasons.summer, wi = view.seasons.winter;
      if (su && wi) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.climateLbl}</div>
          <div class="npc-stats-row">${su.dayTemp}°C / ${su.nightTemp}°C &nbsp;·&nbsp; ${wi.dayTemp}°C / ${wi.nightTemp}°C</div>`;
      }
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildNationGovHistoryHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.governmentHistory}</div><hr class="npc-r-sep">`;
    if (!view.history.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    // newest first
    html += view.history.slice().reverse().map(rec => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(rec.date)}</span>
        <span><strong>${_escapeHtml(rec.government)}</strong>
          ${rec.controller !== 'Neutral' ? `- ${_wikiLink('power', rec.controller)}` : `- ${_escapeHtml(T.independent)}`}
          <span class="npc-sub">(${_linkify(rec.reason || '')})</span></span>
      </div>`).join('');
    return html;
  };

  // ── Elections (shared by nation + hyperpower) ───────────────────────────────

  Scene_NPCEmpathize.prototype._buildElectionsHTML = function (power, T) {
    let html = `<div class="npc-sec-hdr">${T.electionRecords}</div><hr class="npc-r-sep">`;
    if (!power || !power.elections?.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    const dateOf = window.NPCPolitics?.dateOf;
    if (power.nextElectionMinute != null && dateOf) {
      html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(power.nextElectionMinute)));
      html += `<hr class="npc-r-sep">`;
    }
    for (const e of power.elections.slice(0, 10)) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(e.date)}${e.label === 'snap' ? ` (${T.snapLbl})` : ''}${e.turnout != null ? `, ${T.turnoutLbl} ${e.turnout}%` : ''}</div>`;
      for (const r of (e.results || []).slice(0, 5)) {
        const isWinner = r.partyId === e.winnerPartyId || r.name === e.winner;
        html += `
          <div class="npc-vital-row">
            <span class="npc-vital-lbl npc-vital-lbl--wide ${isWinner ? 'npc-em' : ''}">${_escapeHtml(r.name)}</span>
            <div class="npc-vital-track"><div class="npc-vital-fill ${isWinner ? 'npc-fill--green' : 'npc-fill--bark'}" style="--npc-w:${Math.min(100, r.share)}%"></div></div>
            <span class="npc-vital-pct npc-vital-pct--wide">${r.share}%${r.seats != null ? ` · ${r.seats}` : ''}</span>
          </div>`;
      }
      if (e.head && e.head !== '-') {
        html += `<div class="npc-ident-row npc-mt-1">${_iconSpan(215, 15)}<span class="npc-sub">${_escapeHtml(_headTitle(power))}:</span>&nbsp;${_wikiLink('leader', e.head)}</div>`;
      }
      for (const n of (e.notes || [])) {
        html += `<div class="npc-stats-row npc-sub">* ${_linkify(n)}</div>`;
      }
    }
    return html;
  };

  // ── Hyperpower ──────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildPowerOverviewHTML = function (view, T) {
    const live = view.live;
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    const sub = [live?.govType, live?.legislature].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div><hr class="npc-r-sep">`;

    if (live) {
      const head = live.politicians?.[live.headId];
      const ruling = live.parties?.find(p => p.id === live.rulingPartyId);
      html += `<div class="npc-sec-hdr">${T.government}</div>`;
      html += _kvRow(186, T.government, _escapeHtml(live.govType));
      if (head) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(_headTitle(live))}:</span>&nbsp;${_wikiLink('leader', head.name)}<span class="npc-sub">&nbsp;(${T.approval} ${Math.round(head.approval)}%)</span></div>`;
      else html += _kvRow(215, live.headTitle, _escapeHtml(T.vacant));
      if (ruling) html += _kvRow(187, T.rulingParty, _wikiLink('party', ruling.id, ruling.name) + (live.coalition?.length > 1 ? ` <span class="npc-sub">(+${live.coalition.length - 1})</span>` : ''));
      else if (head) html += _kvRow(187, T.rulingParty, _escapeHtml(T.independent));
      html += _kvRow(216, T.seats, `${live.seats}, ${_escapeHtml(live.legislature)}`);
      const dateOf = window.NPCPolitics?.dateOf;
      if (live.nextElectionMinute != null && dateOf) html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(live.nextElectionMinute)));

      // A bloc's bench is made of the benches of the nations inside it
      // (NPCPolitics.ensureCountryParties stamps `country` on every party), so
      // the chamber is printed nation by nation rather than as one long list.
      // The home nation leads, the rest follow in name order; a party with no
      // nation of its own (an off-world power's own bench) sits under the
      // power's name.
      if (live.parties?.length) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.partiesLbl}</div>`;
        const byNation = new Map();
        for (const p of live.parties) {
          const key = p.country || live.name;
          if (!byNation.has(key)) byNation.set(key, []);
          byNation.get(key).push(p);
        }
        const keys = Array.from(byNation.keys()).sort((a, b) => {
          if (a === live.homeNation) return -1;
          if (b === live.homeNation) return 1;
          return String(a).localeCompare(String(b));
        });
        for (const nation of keys) {
          const isNation = nation !== live.name;
          html += `<div class="npc-ident-row npc-mt-1">${_iconSpan(97, 15)}<span class="npc-sub">${
            isNation ? _wikiLink('nation', nation) : _escapeHtml(_worldName('power', nation))
          }</span></div>`;
          for (const p of byNation.get(nation)) {
            const leader = live.politicians?.[p.leaderId];
            html += `<div class="npc-ident-row npc-wiki-party-row">${_iconSpan(187, 17)}<span>${_wikiLink('party', p.id, p.name)}</span><span class="npc-sub">&nbsp;- ${p.lastShare}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}</span>${
              leader ? `<span class="npc-sub">&nbsp;·&nbsp;</span>${_wikiLink('leader', leader.name)}` : ''
            }</div>`;
          }
        }
      }

      const pol = live.policies;
      if (pol) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.policiesLbl}</div>
          <div class="npc-stats-row">${_escapeHtml(`${T.taxRate} ${pol.taxRate}% · ${T.censorship} ${pol.censorship} · ${T.conscription} ${pol.conscription} · ${T.welfare} ${pol.welfare} · ${T.festivalsLbl} ${pol.festivals}`)}${pol.curfew ? ` · <span class="npc-bad npc-em">${_escapeHtml(T.curfewActive)}</span>` : ''}</div>`;
      }
    }

    // The yearbook figures rather than the simulation's bare indices: how many
    // people live here, how many of them are under arms, how many practise the
    // arcane, what the place produces in a year and how free its press is
    // (HistoryManager.realFigures / freedomRank own that reading).
    if (view.hist) {
      const fig = window.HistoryManager?.realFigures?.(view.hist);
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.stats}</div>`;
      if (fig) {
        const rank = window.HistoryManager?.freedomRank?.(view.name || _viewName(view));
        html += _kvRow(97,  T.inhabitantsLbl,   _escapeHtml(fig.population.toLocaleString()));
        html += _kvRow(322, T.soldiersLbl,      _escapeHtml(fig.soldiers.toLocaleString()));
        html += _kvRow(101, T.practitionersLbl, _escapeHtml(fig.practitioners.toLocaleString()));
        html += _kvRow(314, T.gdpLbl,           _escapeHtml(_euros(fig.gdp * 100)));  // _euros reads cents
        html += _kvRow(193, T.freedomIndexLbl,
          _escapeHtml(`${fig.freedom}/100${rank ? ` (#${rank.rank}/${rank.of})` : ''}`));
      } else {
        html += `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
      }
    }

    // What this power actually has in the field, as against the yearbook's
    // count of everybody of military age: the columns the roster is moving
    // around the map right now (ArmyEventsManager), who holds each one and how
    // many men are standing in it. A power whose head has raised nothing says
    // so in a line rather than in an empty section.
    {
      const held  = _armiesOfPower(view.name || _viewName(view));
      const men   = held.reduce((n, a) => n + (Number(a.troopCount) || 0), 0);
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.armiesTab)} (${held.length})</div>`;
      if (!held.length) {
        html += `<p class="npc-empty">${_escapeHtml(T.armiesNone)}</p>`;
      } else {
        html += _kvRow(322, T.armyStrength,
          _escapeHtml(`${men.toLocaleString()} ${T.armySoldiers}`));
        html += held.map(a => `
          <div class="npc-ident-row">${_iconSpan(220, 17)}<span class="npc-sub">${_escapeHtml(_armyStatusLabel(a, T))}:</span>&nbsp;${
            a.leaderName ? _wikiLink('leader', a.leaderName) : `<span class="npc-sub">${_escapeHtml(T.unknown || '?')}</span>`
          }<span class="npc-sub">&nbsp;·&nbsp;${_escapeHtml(`${a.troopCount} ${T.armySoldiers}`)}</span></div>`).join('');
      }
    }

    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.memberNations} (${view.nations.length})</div><div class="npc-tag-wrap">`;
    html += view.nations.map(n => `<span class="npc-tag">${_wikiLink('nation', n)}</span>`).join('')
      || `<span class="npc-sub">${_escapeHtml(T.noRecords)}</span>`;
    html += `</div>`;

    // The orders, guilds and divisions that answer to this power.
    const factions = view.factions || [];
    if (factions.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.wikiFactions} (${factions.length})</div><div class="npc-tag-wrap">`;
      html += factions.map(f => `<span class="npc-tag">${_wikiLink('faction', f)}</span>`).join('');
      html += `</div>`;
    }

    if (live?.rumors?.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.rumorsLbl}</div>`;
      for (const r of live.rumors.slice(0, 5)) {
        html += `<div class="npc-thought">&ldquo;${_linkify(`${r.subjectName}, ${r.kind}`)}&rdquo; <span class="npc-sub">(${_escapeHtml(r.date)})</span></div>`;
      }
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildPowerLeadersHTML = function (view, T) {
    const live = view.live;
    let html = `<div class="npc-sec-hdr">${T.pastLeaders}</div><hr class="npc-r-sep">`;

    // Reign pockets from the live simulation
    const headHistory = live?.headHistory || [];
    if (headHistory.length) {
      const liveHeadTitle = window.NPCPolitics?.powerLabel?.(live, 'headTitle') || live.headTitle;
      html += `<div class="npc-routine-sub-hdr">${T.pastLeaders}, ${_escapeHtml(liveHeadTitle)}</div>`;
      html += headHistory.map(h => `
        <div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(h.date)}${h.endDate ? ` → ${_escapeHtml(h.endDate)}` : ''}</span>
          <span>${_wikiLink('leader', h.name)} <span class="npc-sub">(${_escapeHtml(window.NPCPolitics?.accessionLabel?.(h.how) || h.how || '?')})</span>${h.endDate ? '' : ` <span class="npc-good">- ${_escapeHtml(T.currentLeader)}</span>`}</span>
        </div>`).join('');
    }

    // Historical leader roster from history.json
    const histLeaders = view.hist?.leaders || [];
    if (histLeaders.length) {
      const hm = window.HistoryManager;
      const deaths = hm?.getLeaderDeaths?.() || {};
      const deadList = hm?.getDeadLeaders?.() || [];
      html += `<div class="npc-routine-sub-hdr">${T.leadersTab}</div>`;
      html += histLeaders.map(l => {
        const isDead = _wikiIsDead(deadList.includes(l.name) || !!deaths[l.name]);
        const deathDate = _wikiDeathDate(deaths[l.name]?.date);
        return `
        <div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(`${l.years?.[0] ?? '?'}–${l.years?.[1] ?? '?'}`)}</span>
          <span>${_wikiLink('leader', l.name)}${isDead ? ` <span class="npc-bad">✝${deathDate ? ' ' + _escapeHtml(deathDate) : ''}</span>` : ''}
            <span class="npc-sub">- ${_escapeHtml(_leaderIdeology(l))}</span></span>
        </div>`;
      }).join('');
    }

    // Living political class
    if (live?.politicians) {
      const pols = Object.values(live.politicians)
        .sort((a, b) => (b.alive - a.alive) || (b.approval - a.approval))
        .slice(0, 40);
      if (pols.length) {
        html += `<div class="npc-routine-sub-hdr">${T.politicalClass}</div><div class="npc-tag-wrap">`;
        html += pols.map(p => {
          const dead = _wikiIsDead(!p.alive);
          return `<span class="npc-tag npc-sub"${dead ? '' : ''}>${_wikiLink('leader', p.name)}${dead ? ' ✝' : ''}</span>`;
        }).join('');
        html += `</div>`;
      }
    }

    if (html.indexOf('npc-life-row') < 0 && html.indexOf('npc-tag') < 0) {
      html += `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    return html;
  };

  // ── Leader ──────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildLeaderOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;

    if (view.kind === 'politician' && view.pol && view.power) {
      const p = view.pol;
      const power = view.power;
      const party = power.parties?.find(x => x.id === p.partyId);
      const polOffice = window.NPCPolitics?.politicianOffice?.(power, p) || p.office || null;
      const sub = [polOffice, power.name].filter(Boolean);
      html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div>`;
      if (view.death) {
        html += `<div class="npc-dead-badge npc-mt-1 npc-mb-3">✝ ${_escapeHtml(T.deceased)}${view.death.date ? `, ${_escapeHtml(view.death.date)}` : ''}${view.death.cause ? ` (${_escapeHtml(view.death.cause)})` : ''}</div>`;
      }
      html += `<hr class="npc-r-sep">`;
      html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', power.name)}</div>`;
      if (party) html += _kvRow(187, T.partyLbl, _wikiLink('party', party.id, party.name));
      else if (p.office) html += _kvRow(187, T.partyLbl, _escapeHtml(T.independent));
      if (p.office) html += _kvRow(215, T.status, _escapeHtml(polOffice));
      const age = window.NPCPolitics?.politicianAgeOf?.(p);
      if (age != null && !view.death) html += _kvRow(84, T.ageLbl, `${age}`);
      if (p.scandals) html += _kvRow(1, T('Empathize.scandalsLbl'), `${p.scandals}`);

      // Ideology leanings
      const tags = [];
      const ix = p.ideology || {};
      if (ix.econ <= -40) tags.push('collectivist'); else if (ix.econ >= 40) tags.push('free-marketeer');
      if (ix.auth <= -40) tags.push('libertarian'); else if (ix.auth >= 40) tags.push('authoritarian');
      if (ix.trad <= -40) tags.push('progressive'); else if (ix.trad >= 40) tags.push('traditionalist');
      if (ix.mil <= -40) tags.push('pacifist'); else if (ix.mil >= 40) tags.push('militarist');
      if (ix.myst <= -40) tags.push('rationalist'); else if (ix.myst >= 40) tags.push('mystic');
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.ideologyLbl}</div><div class="npc-tag-wrap">`;
      html += (tags.length ? tags : ['moderate']).map(t => `<span class="npc-tag">${_escapeHtml(t)}</span>`).join('');
      html += `</div>`;

      // The character sheet, not seven bars: a politician is a person with a
      // class, a level, parameters, skills and a coat, exactly like anybody
      // else the player can meet. The political bars they are judged BY stay
      // in the left column.
      html += this._buildCharacterSheetHTML(p.name, T);
      html += this._buildLifeHTML(p.name, T);
    } else if (view.kind === 'historical' && view.leader) {
      const l = view.leader;
      const ofKind = _LEADER_OF_KIND[view.ofType] || 'power';
      html += `<div class="npc-profile-sub">${_escapeHtml(view.of ? _worldName(ofKind, view.of) : '')}</div>`;
      if (view.death) {
        html += `<div class="npc-dead-badge npc-mt-1 npc-mb-3">✝ ${_escapeHtml(T.deceased)}${view.death.date ? `, ${_escapeHtml(view.death.date)}` : ''}${view.death.cause ? ` (${_escapeHtml(view.death.cause)})` : ''}</div>`;
      }
      html += `<hr class="npc-r-sep">`;
      if (view.of) {
        const ofLabel = ofKind === 'power' ? T.wikiHyperpower
          : ofKind === 'faction' ? T.wikiFaction : T.wikiNation;
        // A leader whose only tie is the nation in the book may name a place
        // the archive has no page for ("United States (Free States of
        // Midwest)"), so the link is only drawn where it would open something.
        let linked = true;
        if (ofKind === 'nation') {
          try { linked = !!Wiki.get('nation', view.of); } catch (e) { linked = false; }
        }
        const target = linked ? _wikiLink(ofKind, view.of) : _escapeHtml(_worldName(ofKind, view.of));
        html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(ofLabel)}:</span>&nbsp;${target}</div>`;
      }
      html += _kvRow(186, T.ideologyLbl, _escapeHtml(_leaderIdeology(l)));
      html += _kvRow(220, T.reignLbl, _escapeHtml(`${l.years?.[0] ?? '?'} – ${l.years?.[1] ?? '?'}`));
      // The one thing about them that is neither an office nor a date: what
      // this world says happened to them (Leaders.json `loreKey`).
      // `T` here is the label table, so the key is read through the resolver
      // itself, exactly as every other data-held key on this page is.
      const lore = _dbText(l.loreKey || view.record?.loreKey || '');
      if (lore && lore !== (l.loreKey || view.record?.loreKey)) {
        html += `<hr class="npc-r-sep"><div class="npc-backstory-text">${_escapeHtml(lore)}</div>`;
      }
    }
    // The person behind the office, on every leader's article whichever kind
    // they are: the vocation they read as, when and where they were born, the
    // traits they carry and the trades they are credited with. Drawn by the
    // same builder a pre-made character's dossier uses, because for the leaders
    // who ARE pre-made characters this is literally that dossier.
    // The columns this leader holds today, if any: a seated head marches their
    // power's field army, a recorded leader out of office marches their own.
    html += this._buildArmyHoldingHTML(view.kind === 'politician' && view.pol ? view.pol.name : (view.name || _viewName(view)), T);
    html += this._buildLeaderDossierHTML(view, T);
    // ...and the sheet and the life behind the dates, which is the whole of
    // what a procedural leader used to have on their page: nothing.
    if (view.kind !== 'politician') {
      html += this._buildCharacterSheetHTML(view.name || _viewName(view), T);
      html += this._buildLifeHTML(view.name || _viewName(view), T);
    }
    return html;
  };

  // The sheet behind an office. A leader, a politician or a head of state used
  // to be seven bars of charisma and ambition, which says what they are LIKE
  // and nothing about what they can DO. window.LeaderPersona.characterSheetFor
  // builds the same sheet a party member has - class, level, the eight
  // parameters off that class's own growth curve, the skills the class knows
  // at that level, the traits they are read by and what they are carrying -
  // for everybody the world holds a record of, written or procedural. This
  // draws it the way the status screen draws a companion.
  Scene_NPCEmpathize.prototype._buildCharacterSheetHTML = function (name, T) {
    const sheet = window.LeaderPersona?.characterSheetFor?.(name);
    if (!sheet) return '';
    let html = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.stats)}</div>`;
    html += _kvRow(126, T.vocationLbl, _escapeHtml(sheet.className || '?'));
    html += _kvRow(87,  T.levelLbl,    `${sheet.level}`);

    if (sheet.params) {
      const PL = _paramLabels();
      html += `<div class="npc-param-grid">` + sheet.params.map((v, i) =>
        `<div class="npc-param-cell"><span class="npc-sub">${_escapeHtml(PL[i])}</span>` +
        `<strong>${v}</strong></div>`).join('') + `</div>`;
    }

    // What they are dressed in. A leader's gear is picked out of what their
    // class may equip in the price band their standing earns, so a marshal is
    // carrying a marshal's sword and a cardinal is not.
    const eq = sheet.equipment;
    if (eq && (eq.weaponId || eq.armorIds?.length)) {
      const tags = [];
      const w = eq.weaponId && $dataWeapons ? $dataWeapons[eq.weaponId] : null;
      if (w) tags.push(`<span class="npc-tag">${_iconSpan(w.iconIndex || 0, 15)}${_escapeHtml(w.name)}</span>`);
      for (const id of (eq.armorIds || [])) {
        const a = $dataArmors ? $dataArmors[id] : null;
        if (a) tags.push(`<span class="npc-tag">${_iconSpan(a.iconIndex || 0, 15)}${_escapeHtml(a.name)}</span>`);
      }
      if (tags.length) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(EQUIP_ICON, 15)} ${_escapeHtml(T.equipment)}</div>` +
          `<div class="npc-tag-wrap">${tags.join('')}</div>`;
      }
    }

    const traitBank = _presetTraitBank();
    if (sheet.traits?.length && traitBank.length) {
      const tags = sheet.traits.map(id => {
        const trait = traitBank.find(t => t.id === id);
        return trait
          ? `<span class="npc-tag">${_iconSpan(trait.icon || TRAIT_ICON, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`
          : '';
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(TRAIT_ICON, 15)} ${_escapeHtml(T.traits)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }

    if (sheet.specializations?.length && window.Specializations?.ready) {
      const tags = sheet.specializations.map(entry => {
        const spec = window.Specializations.byId.get(entry.id);
        if (!spec) return '';
        return `<span class="npc-tag">${_escapeHtml(window.Specializations.displayName(spec))} ` +
          `<span class="npc-sub">(${_escapeHtml(window.Specializations.levelName(entry.level))})</span></span>`;
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SPEC_ICON, 15)} ${_escapeHtml(T.specializations)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }

    if (sheet.skills?.length && $dataSkills) {
      const tags = sheet.skills.map(id => {
        const sk = $dataSkills[id];
        return sk ? `<span class="npc-tag">${_iconSpan(sk.iconIndex || SKILL_ICON, 15)}${_escapeHtml(sk.name)}</span>` : '';
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SKILL_ICON, 15)} ${_escapeHtml(T.skills)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }
    return html;
  };

  // The life behind the dates. Every procedural leader has one simulated for
  // them when the world is made (LeaderPersona.bakeLives); a written one gets
  // theirs derived the same way. Every beat is a key, so it reads in whatever
  // language the article is opened in.
  Scene_NPCEmpathize.prototype._buildLifeHTML = function (name, T) {
    // Only for the people nobody wrote. A leader the book holds already has a
    // real life on record, and inventing beats for Mussolini would put fiction
    // next to fact on the same page.
    if (window.LeaderPersona?.isBookLeader?.(name)) return '';
    const life = window.LeaderPersona?.lifeFor?.(name) || [];
    if (!life.length) return '';
    let html = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.lifeLbl)}</div>`;
    html += life.map(beat => {
      const text = (window.T && window.T.has && window.T.has(beat.key))
        ? window.T(beat.key, beat.params || {}) : '';
      if (!text) return '';
      return `<div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(String(beat.year))}</span>
          <span>${_escapeHtml(text)}</span>
        </div>`;
    }).join('');
    return html;
  };

  // A leader's character sheet. `view.dossier` is preset-shaped by design (see
  // window.LeaderPersona), so _buildPresetHTML draws it unchanged; the rows
  // above it say which version of them is being read.
  Scene_NPCEmpathize.prototype._buildLeaderDossierHTML = function (view, T) {
    const d = view.dossier;
    if (!d) return '';
    const lang = ConfigManager.language === 'it' ? 'it' : 'en';
    let html = '';
    // Some of the people in the book are also dossiers the player can be: the
    // article says so outright, whether that dossier is still sitting unplayed
    // or is currently walking around wearing the player's boots.
    if (d.isPresetCharacter) {
      html += `<div class="npc-badge-row npc-mt-2"><span class="npc-badge">${_iconSpan(82, 15)}${_escapeHtml(T.presetCharacterBadge)}</span></div>`;
    }
    const noteKey = SOURCE_NOTE_KEYS[d.source];
    if (noteKey || d.level > 1) {
      const bits = [];
      if (noteKey) bits.push(T[noteKey]);
      if (d.level > 1) bits.push(`${T.levelAbbr} ${d.level}`);
      if (d.departure?.leftDate) bits.push(`${T.leftPartyLbl} ${d.departure.leftDate}`);
      html += `<hr class="npc-r-sep"><div class="npc-profile-sub npc-left">${_escapeHtml(bits.join(' · '))}</div>`;
    }
    return html + this._buildPresetHTML(d, T, lang, { omitLists: true });
  };

  // ── Artifact ────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildArtifactOverviewHTML = function (view, T) {
    const data = view.data;
    const kindLabel = view.kind === 'weapon' ? (T.artifactKindWeapon)
      : view.kind === 'armor' ? (T.artifactKindArmor)
      : (T.artifactKindItem);
    let html = `<div class="npc-profile-name">${_iconSpan(data?.iconIndex ?? 245, 26)} ${_escapeHtml(view.name)}</div>`;
    html += `<div class="npc-profile-sub">${_escapeHtml(kindLabel)}${view.kind === 'weapon' && data?.wtypeId ? ` · ${_escapeHtml(_wtypeName(data.wtypeId))}` : ''}${view.kind === 'armor' && data?.atypeId ? ` · ${_escapeHtml(_atypeName(data.atypeId))}` : ''}</div>`;
    html += `<hr class="npc-r-sep">`;
    if (data?.description) html += `<div class="npc-backstory-text">${_escapeHtml(data.description)}</div>`;

    html += `<div class="npc-sec-hdr npc-mt-3">${T.stats}</div>`;
    if (Array.isArray(data?.params)) {
      const PL = _paramLabels();
      const parts = data.params.map((v, i) => v ? `${PL[i]} +${v}` : null).filter(Boolean);
      html += `<div class="npc-stats-row">${parts.length ? _escapeHtml(parts.join(' · ')) : '-'}</div>`;
    }
    html += `<div class="npc-ident-row npc-mt-2">${_iconSpan(314, 17)}<span>${T.valueLbl}: <strong>${_euros(data?.price)}</strong></span></div>`;
    if (data?.weight) html += _kvRow(208, T.weightLbl, `${data.weight}`);

    if (view.rec) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.discovered}</div>`;
      html += `<div class="npc-life-row"><span class="npc-life-time">${_escapeHtml(view.rec.date || '?')}</span><span>${_linkify(window.T('History.artifact.found', { holder: view.rec.origin, action: view.rec.action, artifact: view.rec.name }))}</span></div>`;
      const holder = view.rec.holders?.[view.rec.holders.length - 1];
      if (holder) {
        html += `<div class="npc-ident-row npc-mt-2">${_iconSpan(210, 17)}<span class="npc-sub">${_escapeHtml(T.currentHolder)}:</span>&nbsp;${_linkify(holder.holder)}<span class="npc-sub">&nbsp;(${_escapeHtml(holder.since || '?')})</span></div>`;
      }
    } else {
      html += `<hr class="npc-r-sep"><p class="npc-sub">${_escapeHtml(T.noRecords)}</p>`;
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildArtifactHoldersHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.pastHolders}</div><hr class="npc-r-sep">`;
    const holders = view.rec?.holders || [];
    if (!holders.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    html += holders.slice().reverse().map((h, i) => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(h.since || '?')}</span>
        <span>${_linkify(h.holder)}${h.power && h.power !== h.holder ? ` <span class="npc-sub">(${_linkify(h.power)})</span>` : ''}
          <span class="npc-sub">- ${_escapeHtml(h.how || '?')}</span>${i === 0 ? ` <span class="npc-good">- ${_escapeHtml(T.currentHolder)}</span>` : ''}</span>
      </div>`).join('');
    return html;
  };

  // ── Faction ─────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildFactionOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    html += `<div class="npc-profile-sub">${_escapeHtml(T.wikiFaction)}</div><hr class="npc-r-sep">`;
    const h = view.hist || view.dlFaction;
    if (h) {
      html += `<div class="npc-sec-hdr">${T.stats}</div>
        <div class="npc-stats-row">${_escapeHtml(`${T.arcaneLbl} ${Math.round(h.arcane ?? 0)} · ${T.techLbl} ${Math.round((view.hist ? h.tech : h.velocity) ?? 0)} · ${T.informationLbl} ${Math.round(h.information ?? 0)}`)}</div>`;
      const leaders = view.hist?.leaders || [];
      if (leaders.length) {
        const hm = window.HistoryManager;
        const deaths = hm?.getLeaderDeaths?.() || {};
        const deadList = hm?.getDeadLeaders?.() || [];
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.pastLeaders}</div>`;
        html += leaders.map(l => {
          const isDead = _wikiIsDead(deadList.includes(l.name) || !!deaths[l.name]);
          return `<div class="npc-life-row">
            <span class="npc-life-time">${_escapeHtml(`${l.years?.[0] ?? '?'}–${l.years?.[1] ?? '?'}`)}</span>
            <span>${_wikiLink('leader', l.name)}${isDead ? ' <span class="npc-bad">✝</span>' : ''} <span class="npc-sub">- ${_escapeHtml(_leaderIdeology(l))}</span></span>
          </div>`;
        }).join('');
      }
    }
    if (view.dlFaction && window.$gameFactions?.getReputation && view.dlIndex >= 0) {
      const rep = window.$gameFactions.getReputation(view.dlIndex) ?? 0;
      html += `<hr class="npc-r-sep">` + _meterRow(T('Empathize.reputationLbl'), Math.round((rep + 100) / 2), rep >= 0 ? 'var(--text-cost-ok)' : 'var(--text-cost-bad)');
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildFactionMembersHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.factionMembersLbl}</div><hr class="npc-r-sep">`;
    if (!view.members.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    // The party's own banner is manned by companions and hired soldiers, not
    // by catalogued NPCs, so its roll is printed without links into a wiki
    // that holds no article for any of them.
    html += `<div class="npc-tag-wrap">` +
      view.members.map(n => `<span class="npc-tag">${_iconSpan(82, 15)}` +
        `${view.plainMembers ? _escapeHtml(n) : _wikiLink('npc', n)}</span>`).join('') +
      `</div>`;
    return html;
  };

  // ── Political party ─────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildPartyOverviewHTML = function (view, T) {
    const p = view.party;
    const power = view.power;
    let html = `<div class="npc-profile-name">${_escapeHtml(view.name)}</div>`;
    const sub = [_worldName('power', power.name), _ideologyLabel(view.ideology?.id)].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div>`;
    if (power.rulingPartyId === p.id) {
      html += `<div class="npc-dead-badge npc-dead-badge--ruling">${_escapeHtml(T.rulingParty)}</div>`;
    }
    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.overview}</div>`;
    if (p.country) html += _kvRow(97, T.originLbl, _escapeHtml(p.country));
    if (view.leader) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(T.leaderOfPartyLbl)}:</span>&nbsp;${_wikiLink('leader', view.leader.name)}</div>`;
    if (p.foundedYear != null) html += _kvRow(220, T.foundedLbl, `${p.foundedYear}`);
    html += _kvRow(216, T.lastShareLbl, `${p.lastShare ?? 0}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}`);
    html += _kvRow(314, T.fundsLbl, _euros(p.funds));

    // What the platform would actually DO in office: one policy per field, read
    // out of js/db/WorldGen/Policies.json by NPCPolitics.policiesFor. The five
    // bare axis bars said nothing a reader could act on, and the authority axis
    // is not a policy field at all - science is.
    const policies = window.NPCPolitics?.policiesFor?.(p.platform) || [];
    if (policies.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.platformLbl}</div>`;
      for (const row of policies) {
        if (!row.policy) continue;
        html += `<div class="npc-ident-row">${_iconSpan(row.icon, 17)}` +
          `<span class="npc-sub">${_escapeHtml(row.fieldName)}:</span>&nbsp;` +
          `<strong>${_escapeHtml(row.policy.name)}</strong></div>` +
          `<div class="npc-policy-desc">${_escapeHtml(row.policy.desc)}</div>`;
      }
    }
    return html;
  };

  // ── Ideology ─────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildIdeologyOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(view.name)}</div><hr class="npc-r-sep">`;
    html += `<div class="npc-sec-hdr">${T.heldByLbl} (${view.parties.length})</div>`;
    if (!view.parties.length) {
      html += `<p class="npc-empty">${_escapeHtml(T.noParties)}</p>`;
    } else {
      // Grouped by hyperpower, so "multiple parties, one ideology" reads as
      // the pattern it is rather than a flat unsorted list.
      const byPower = new Map();
      for (const { party, powerName } of view.parties) {
        if (!byPower.has(powerName)) byPower.set(powerName, []);
        byPower.get(powerName).push(party);
      }
      for (const [powerName, parties] of byPower) {
        html += `<div class="npc-ident-row npc-mt-3">${_iconSpan(97, 17)}${_wikiLink('power', powerName)}</div><div class="npc-tag-wrap">`;
        html += parties.map(p => `<span class="npc-tag">${_wikiLink('party', p.id, p.name)}</span>`).join('');
        html += `</div>`;
      }
    }
    return html;
  };

  // ── Shared chronicle tab ────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildEntityEventsHTML = function (view, T) {
    const ICONS = window.HistorySimulator_ICONS ?? {};
    let html = `<div class="npc-sec-hdr">${T.worldEventsLbl}</div><hr class="npc-r-sep">`;
    const fromHistory = view.events || [];
    const fromPolitics = view.type === 'power' ? (view.live?.events || []) : [];
    if (!fromHistory.length && !fromPolitics.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    if (fromPolitics.length) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(T.eventsTab)}</div>`;
      html += fromPolitics.slice(0, 20).map(e => `
        <div class="npc-life-row">
          <span class="npc-life-time">${_escapeHtml(e.date ?? '?')}</span>
          <span>${_linkify(e.desc ?? '')}</span>
        </div>`).join('');
    }
    if (fromHistory.length) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(T.lifeHistoryTimeline)}</div>`;
      html += _eventRows(fromHistory, ICONS);
    }
    return html;
  };

  // ============================================================================
  // WIKI INDEX TAB, category grid → entry grid (the encyclopedia's "browse
  // all" view). People entries open the NPC's own Empathize panel, remotely
  // if they aren't on the current map; everything else opens its wiki profile.
  // ============================================================================

  const WIKI_CATEGORIES = [
    { id: 'party',            glyph: '', labelKey: 'wikiParty' },
    { id: 'people',           glyph: '☺', labelKey: 'wikiPeople' },
    { id: 'mainPlayers',      glyph: '★', labelKey: 'wikiMainPlayers' },
    { id: 'leaders',          glyph: '☻', labelKey: 'wikiLeaders' },
    { id: 'politicians',      glyph: '☗', labelKey: 'wikiPoliticians' },
    { id: 'powers',           glyph: '♛', labelKey: 'wikiHyperpowers' },
    { id: 'nations',          glyph: '⚑', labelKey: 'wikiNations' },
    { id: 'artifacts',        glyph: '✦', labelKey: 'wikiArtifacts' },
    { id: 'factions',         glyph: '⚜', labelKey: 'wikiFactions' },
    { id: 'politicalParties', glyph: '⚖', labelKey: 'wikiPoliticalParties' },
    { id: 'ideologies',       glyph: '✪', labelKey: 'wikiIdeologies' },
    { id: 'armies',           glyph: '⚔', labelKey: 'armiesTab' },
  ];

  // Past party members (NPCSystemParty's removeActor snapshots), excluding
  // anyone who has since rejoined the active roster.
  function _pastPartyMembers() {
    const currentNames = new Set(($gameParty?.members() ?? []).map(a => a.name()));
    return ($gameSystem?._npcPastPartyMembers ?? []).filter(p => p?.name && !currentNames.has(p.name));
  }

  function _wikiEntryTile(type, id, labelHTML, subHTML) {
    const safeId = _encId(id);
    return `
      <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openEntity('${type}','${safeId}')">
        <span class="npc-wiki-entry-name">${labelHTML}</span>
        ${subHTML ? `<span class="npc-wiki-entry-sub">${subHTML}</span>` : ''}
      </div>`;
  }


  // ============================================================================
  // THE ARMIES SHELF
  // ============================================================================
  // Who is under arms today, and under whom. The roster itself is
  // window.ArmyCampaign (ArmyEventsManager): one column per seated head of a
  // hyperpower, a private column for the recorded leaders who hold no seat,
  // and the party's own army standing beside them. Every one of them answers
  // the same four questions - formation, strength, upkeep and morale - so a
  // state army and the party's dozen hirelings can be read off the same page.

  function _armyApi() { return window.ArmyCampaign || null; }

  function _armyText(key) {
    const api = _armyApi();
    if (api && typeof api.factionText === 'function') return api.factionText(key);
    const s = String(key || '');
    const i = s.lastIndexOf('.');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  // Cents a week, written the way every other price in these menus is written.
  function _armyMoney(cents) {
    return `€${((Number(cents) || 0) / 100).toFixed(2)}`;
  }

  // What the column is doing today: patrolling its own ground, garrisoned on a
  // city, marching somewhere, reinforcing another column or in the field
  // against one. The roster is the one that decides (ArmyEventsManager); this
  // only puts the word to it.
  function _armyStatusLabel(army, T) {
    const key = 'armyStatus' + String(army.status || 'idle').replace(/^./, c => c.toUpperCase());
    return T[key] || T.armyStatusIdle || String(army.status || '');
  }

  function _armyTitle(army, T) {
    if (army.kind === 'party') return T.armyPartyColumn || 'Your army';
    if (army.kind === 'power') return `${_worldName('power', army.powerName)} ${T.armyFieldArmy}`;
    return T.armyPrivateColumn;
  }

  // The bar every army stat is drawn as: the same shape the needs bars use, so
  // morale and coherence read as the gauges they are rather than as numbers.
  function _armyBar(pct, cls) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    return `<span class="npc-army-bar"><span class="npc-army-bar-fill ${cls || ''}" style="width:${v}%"></span></span>`;
  }

  function _armyFormationHTML(army, T) {
    const groups = army.formation || [];
    if (!groups.length) return `<div class="npc-sub">${_escapeHtml(T.armyNoFormation)}</div>`;
    return `<div class="npc-army-formation">${groups.map(g => `
      <div class="npc-army-unit">
        <span class="npc-army-unit-name">${_escapeHtml(_armyText(g.name))}</span>
        <span class="npc-army-unit-drill">${_escapeHtml(_armyText(g.formation))}</span>
        <span class="npc-army-unit-count">${g.count}</span>
      </div>`).join('')}</div>`;
  }

  // One army, drawn whole: who leads it, what it is made of and what it costs.
  function _armyCardHTML(army, T, opts) {
    const leaderHTML = army.leaderName
      ? (army.kind === 'party'
        ? _escapeHtml(army.leaderName)
        : _wikiLink('leader', army.leaderName))
      : `<span class="npc-sub">${_escapeHtml(T.unknown || '?')}</span>`;
    const head = (opts && opts.hideTitle) ? '' : `
      <div class="npc-army-card-hdr">
        <span class="npc-army-card-title">${_escapeHtml(_armyTitle(army, T))}</span>
        <span class="npc-sub">${leaderHTML}</span>
      </div>`;
    return `
      <div class="npc-army-card">
        ${head}
        <div class="npc-ident-row">${_iconSpan(220, 17)}<span class="npc-sub">${_escapeHtml(T.armyStatus)}:</span>&nbsp;${_escapeHtml(_armyStatusLabel(army, T))}</div>
        <div class="npc-ident-row">${_iconSpan(322, 17)}<span class="npc-sub">${_escapeHtml(T.armyStrength)}:</span>&nbsp;<strong>${army.troopCount}</strong>&nbsp;<span class="npc-sub">${_escapeHtml(T.armySoldiers)}</span></div>
        <div class="npc-ident-row">${_iconSpan(314, 17)}<span class="npc-sub">${_escapeHtml(T.armyUpkeep)}:</span>&nbsp;${_armyMoney(army.upkeep)}&nbsp;<span class="npc-sub">${_escapeHtml(T.armyPerWeek)}</span></div>
        <div class="npc-ident-row">${_iconSpan(176, 17)}<span class="npc-sub">${_escapeHtml(T.armyMorale)}:</span>&nbsp;${_armyBar(army.morale, 'npc-army-bar-morale')}&nbsp;${Math.round(army.morale)}%</div>
        <div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.armyCoherence)}:</span>&nbsp;${_armyBar(army.coherence, 'npc-army-bar-coherence')}&nbsp;${Math.round(army.coherence)}%</div>
        <div class="npc-sec-hdr npc-mt-1">${_escapeHtml(T.armyFormation)}</div>
        ${_armyFormationHTML(army, T)}
      </div>`;
  }

  // The block that hangs off a leader's own article: the columns THEY hold.
  // Most of the political class holds none, and says so in one line rather
  // than in an empty panel.
  Scene_NPCEmpathize.prototype._buildArmyHoldingHTML = function (name, T) {
    const api = _armyApi();
    if (!api || typeof api.armiesOfLeader !== 'function') return '';
    let held = [];
    try { held = api.armiesOfLeader(name) || []; } catch (e) { return ''; }
    if (!held.length) return '';
    return `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.armiesTab)}</div>`
      + held.map(a => _armyCardHTML(a, T)).join('');
  };

  // Every column standing in the world today, the party's own among them,
  // biggest first. The Wiki's Armies shelf is built off this, and so is the
  // count on its card; a world with no roster at all answers with an empty
  // list rather than throwing the panel open on an error page.
  function _listArmies() {
    const api = _armyApi();
    try { return (api && api.listArmies) ? api.listArmies() : []; } catch (e) { return []; }
  }

  // The columns one hyperpower has in the field, for the block its article
  // prints under its own figures.
  function _armiesOfPower(name) {
    const api = _armyApi();
    if (!api || typeof api.armiesOfPower !== 'function') return [];
    try { return api.armiesOfPower(name) || []; } catch (e) { return []; }
  }

  // ============================================================================
  // SCREEN 5 OF 5: THE WIKI INDEX
  // ============================================================================
  // The catalogue the articles above are reached from: one card per category,
  // then the entries inside it.

  Scene_NPCEmpathize.prototype._buildWikiTabHTML = function (T) {
    const pets = window.PetSystem ? window.PetSystem.getPets() : [];
    const counts = {
      party:     ($gameParty?.members()?.length ?? 0) + _pastPartyMembers().length + pets.length,
      people:    Wiki.listPeople().length,
      mainPlayers: Wiki.listMainPlayers().length,
      leaders:   Wiki.listLeaders().length,
      politicians: Wiki.listPoliticians().length,
      powers:    Wiki.listPowerNames().length,
      nations:   Wiki.listNations().length,
      artifacts: Wiki.listArtifacts().length,
      factions:  Wiki.listFactionNames().length,
      politicalParties: Wiki.listPartyNames().length,
      ideologies:       Wiki.listIdeologyNames().length,
      armies:           _listArmies().length,
    };

    // ── Category grid ─────────────────────────────────────────────────────────
    if (!this._wikiCategory) {
      // The category last opened keeps a golden border while the grid is up, so
      // coming back out of a category still shows which one you were reading.
      const cards = WIKI_CATEGORIES.map(cat => `
        <div class="npc-wiki-card${this._lastWikiCategory === cat.id ? ' npc-wiki-card-selected' : ''}" onmousedown="event.stopPropagation();SceneManager._scene._setWikiCategory('${cat.id}')">
          <span class="npc-wiki-card-glyph">${cat.glyph}</span>
          <span class="npc-wiki-card-label">${_escapeHtml(T[cat.labelKey] || cat.fallback)}</span>
          <span class="npc-wiki-card-count">${counts[cat.id]}</span>
        </div>`).join('');
      return `
        <div class="npc-wiki-hdr">
          <div class="npc-sec-hdr">${_escapeHtml(T.wikiTab)}, ${_escapeHtml(T.wikiCategories)}</div>
          <hr class="npc-r-sep">
        </div>
        <div class="npc-wiki-grid npc-wiki-grid--cards">${cards}</div>`;
    }

    // ── Entry grid for the selected category ─────────────────────────────────
    const cat = WIKI_CATEGORIES.find(c => c.id === this._wikiCategory) || WIKI_CATEGORIES[0];
    const headerHTML = `
      <div class="npc-wiki-hdr">
      <div class="npc-panel-top-hdr">
        <div class="npc-sec-hdr npc-wiki-cat-selected npc-mb-0">${cat.glyph} ${_escapeHtml(T[cat.labelKey] || cat.fallback)} (${counts[cat.id]})</div>
        <span class="npc-back-btn" onmousedown="event.stopPropagation();SceneManager._scene._setWikiCategory(null)">← ${_escapeHtml(T.wikiCategories)}</span>
      </div>
      <hr class="npc-r-sep">
      </div>`;

    let tiles = '';
    switch (cat.id) {
      case 'party': {
        // Current members open in actor mode, full profile *and* the chat
        // tab, always available while they travel with you. Past members
        // open remotely by name (their NPC profile lives on in the society).
        // Where this party was last written into the world folder, which is
        // where any other savegame of the world would find them standing
        // (NPCSystem.js, VisitingParties). Named as a place, not as a tile.
        const VP = window.PartyPresence;
        const ownLastSeen = VP?.lastSeenName?.(VP.currentSlot?.() ?? 0) ?? null;
        const seenLine = where => (where
          ? ` · ${_escapeHtml(T.partyLastSeen)} ${_escapeHtml(where)}`
          : '');
        const current = ($gameParty?.members() ?? []);
        const curTiles = current.map(a => `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openForActor(${a.actorId()})">
            <span class="npc-wiki-entry-name">${_escapeHtml(a.name())}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(T.partyCurrentMember)} · ${_escapeHtml(a.currentClass()?.name || '')} Lv.${a.level}${seenLine(ownLastSeen)}</span>
          </div>`).join('');
        // The other playthroughs of this world, and where each was left. They
        // are people this party can actually meet, so they are listed here with
        // the same "last seen" line rather than being invisible until walked
        // into; the tile opens their profile by name like any other.
        const visitorTiles = (VP?.otherParties?.() ?? []).map(party => {
          const where = VP.lastSeenName(party.slot);
          return (party.members || []).map(m => `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName(decodeURIComponent('${_encId(m.name)}'))">
            <span class="npc-wiki-entry-name">${_escapeHtml(m.name)}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(T.partyOtherMember)}${party.leaderName ? ` (${_escapeHtml(party.leaderName)})` : ''}${seenLine(where)}</span>
          </div>`).join('');
        }).join('');
        // Former members carry how they left (NPCSystemParty's roster history):
        // retired to a dossier, dismissed, or dead, with the date it happened.
        const pastTiles = _pastPartyMembers().map(p => {
          const statusLabel = p.reason === 'died'
            ? (T.partyDeadMember)
            : p.reason === 'retired'
              ? (T.partyRetiredMember)
              : (T.partyFormerMember);
          const when = p.deathDate || p.leftDate || '';
          return `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName(decodeURIComponent('${_encId(p.name)}'))">
            <span class="npc-wiki-entry-name">${_escapeHtml(p.name)}${p.reason === 'died' ? ' <span class="npc-bad">✝</span>' : ''}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(statusLabel)}${when ? ` ${_escapeHtml(when)}` : ''} · ${_escapeHtml(p.className || '')} Lv.${p.level || 1}</span>
          </div>`;
        }).join('');
        // Pets/followers: trailing map companions that never battle. Informational
        // tiles only, with the active follower flagged.
        const petList   = window.PetSystem ? window.PetSystem.getPets() : [];
        const activePet = window.PetSystem ? window.PetSystem.getActivePet() : null;
        const petTiles  = petList.map(pet => {
          const typeLabel = pet.isFollower
            ? (T.petFollower)
            : (T.petPet);
          const activeSuffix = (activePet && pet.id === activePet.id)
            ? ` · ${_escapeHtml(T.petFollowing)}`
            : '';
          return `
          <div class="npc-wiki-entry">
            <span class="npc-wiki-entry-name">${_escapeHtml(pet.name)}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(typeLabel)}${activeSuffix} · Lv.${pet.level || 1}</span>
          </div>`;
        }).join('');
        tiles = curTiles + pastTiles + petTiles + visitorTiles;
        break;
      }
      case 'people':
        tiles = Wiki.listPeople().map(p =>
          _wikiEntryTile('npc', p.name, _escapeHtml(p.name), p.group ? _escapeHtml(p.group) : '')
        ).join('');
        break;
      // Both shelves draw the same tile: the article behind it does not care
      // which half of the cast the person came from.
      case 'mainPlayers':
      case 'leaders': {
        const roll = this._wikiCategory === 'mainPlayers'
          ? Wiki.listMainPlayers() : Wiki.listLeaders();
        tiles = roll.map(l =>
          _wikiEntryTile('leader', l.name,
            `${_escapeHtml(_worldName('leader', l.name))}${l.dead ? ' <span class="npc-bad">✝</span>' : ''}`,
            l.of ? _escapeHtml(_worldName(_LEADER_OF_KIND[l.ofType] || 'power', l.of)) : '')
        ).join('');
        break;
      }
      case 'politicians':
        // Everybody the world elected without history writing them down. The
        // article behind the tile is the same leader profile: it simply has a
        // politician on the other side of it instead of a book entry.
        tiles = Wiki.listPoliticians().map(p =>
          _wikiEntryTile('leader', p.name,
            `${_escapeHtml(_worldName('leader', p.name))}${p.dead ? ' <span class="npc-bad">✝</span>' : ''}`,
            [p.office, p.of ? _worldName(_LEADER_OF_KIND[p.ofType] || 'power', p.of) : '']
              .filter(Boolean).map(_escapeHtml).join(' · '))
        ).join('');
        break;
      case 'powers':
        tiles = Wiki.listPowerNames().map(n => {
          const live = window.NPCPolitics?.getPower?.(n);
          return _wikiEntryTile('power', n, `♛ ${_escapeHtml(_worldName('power', n))}`,
            live ? _escapeHtml(window.NPCPolitics?.powerLabel?.(live, 'govType') || live.govType) : '');
        }).join('');
        break;
      case 'nations':
        tiles = Wiki.listNations().map(n =>
          _wikiEntryTile('nation', n.name, `⚑ ${_escapeHtml(_worldName('nation', n.name))}`,
            n.controller && n.controller !== 'Neutral'
              ? _escapeHtml(_worldName('power', n.controller)) : _escapeHtml(T.independent))
        ).join('');
        break;
      case 'artifacts':
        tiles = Wiki.listArtifacts().map(a => {
          const kindLabel = a.kind === 'weapon' ? (T.artifactKindWeapon)
            : a.kind === 'armor' ? (T.artifactKindArmor)
            : (T.artifactKindItem);
          return _wikiEntryTile('artifact', a.key,
            `${_iconSpan(a.iconIndex ?? 245, 15)} ${_escapeHtml(a.name)}`, _escapeHtml(kindLabel));
        }).join('');
        break;
      case 'factions':
        tiles = Wiki.listFactionNames().map(n =>
          _wikiEntryTile('faction', n, `⚜ ${_escapeHtml(_worldName('faction', n))}`, '')
        ).join('');
        break;
      case 'politicalParties':
        tiles = Wiki.listPartyNames().map(p => {
          const ideoLabel = _ideologyLabel(p.ideologyId);
          const sub = [_worldName('power', p.powerName), ideoLabel].filter(Boolean).join(' · ');
          return _wikiEntryTile('party', p.id, `⚖ ${_escapeHtml(p.name)}`, _escapeHtml(sub));
        }).join('');
        break;
      case 'armies':
        // Every column standing today, biggest first, each under the name of
        // whoever holds it. The tile opens that leader's article, where the
        // column itself is written out in full (_buildArmyHoldingHTML); the
        // party's own army is led by a party member with no article to open,
        // so its tile is a plain row like a pet's.
        tiles = _listArmies().map(a => {
          const men   = `${a.troopCount} ${T.armySoldiers}`;
          const label = `⚔ ${_escapeHtml(_armyTitle(a, T))}`;
          if (a.kind === 'party' || !a.leaderName) {
            return `
          <div class="npc-wiki-entry">
            <span class="npc-wiki-entry-name">${label}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(a.leaderName || T.unknown || '?')} · ${_escapeHtml(men)}</span>
          </div>`;
          }
          return _wikiEntryTile('leader', a.leaderName, label,
            `${_escapeHtml(_worldName('leader', a.leaderName))} · ${_escapeHtml(men)}`);
        }).join('');
        break;
      case 'ideologies':
        tiles = Wiki.listIdeologyNames().map(e => {
          const label = window.T ? window.T(e.name) : e.id;
          const sub = e.partyCount
            ? T.n('Empathize.ideologyPartyCount', e.partyCount, { n: e.partyCount })
            : T.noParties;
          return _wikiEntryTile('ideology', e.id, `✪ ${_escapeHtml(label)}`, _escapeHtml(sub));
        }).join('');
        break;
    }
    if (!tiles) {
      tiles = `<p class="npc-sub">${_escapeHtml(T.noRecords)}</p>`;
    }

    return `${headerHTML}<div class="npc-wiki-grid">${tiles}</div>`;
  };

  // ============================================================================
  // More tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildMoreHTML = function (T) {
    const items = [
      { id: 'leave', label: T.leave },
    ];
    const rowsHTML = items.map(it => `
      <div class="npc-action-row" onmousedown="event.stopPropagation();SceneManager._scene._moreAction('${it.id}')">
        <span class="npc-action-label">${_escapeHtml(it.label)}</span>
        <span class="npc-action-arrow">←</span>
      </div>`).join('');

    return `<div class="npc-sec-hdr npc-mb-2">${T.more}</div>${rowsHTML}`;
  };

  console.log('[NPCEmpathizeUI] v3.0.0 loaded.');
})();
