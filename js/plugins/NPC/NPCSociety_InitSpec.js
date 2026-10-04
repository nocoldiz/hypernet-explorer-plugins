/*:
 * @target MZ
 * @plugindesc NPC Society: the event initialization spec (window.NPCInitSpec)
 * @author Omni-Lex
 * @base NPCSociety
 * @orderAfter NPCSociety
 * @help
 * ============================================================================
 * NPCSociety_InitSpec, part of the NPCSociety family
 * ============================================================================
 * Owns SECTION 3c, the EVENT INITIALIZATION SPEC: the key: value page comments
 * that dictate the person generated onto an event.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSocietyRegistry._internal and publishes its own there. Load it right after
 * NPCSociety.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    DataLoader,
  } = window.NPCSocietyRegistry._internal;

  // ==========================================================================
  // SECTION 3c: EVENT INITIALIZATION SPEC
  // ==========================================================================
  // An event may dictate the person generated onto it instead of accepting the
  // seeded roll. Any comment on the event page written as `key: value` is read
  // here and forced onto the profile the moment it is minted:
  //
  //     class: Witch
  //     bust: Butler
  //     level: 10
  //     ideology: pacifist_theocratic
  //     traits: obese, trigger:happy
  //
  // Every key answers one of the things the Empathize panel shows, so a
  // written character can be pinned down as tightly or as loosely as the map
  // wants: whatever is not named is still rolled, and stays coherent with what
  // is. Unknown keys are ignored (the single-token bust comment and the
  // `Preset: <name>` dossier tag are other systems' conventions and pass
  // straight through), so this can never break an event already using comments
  // for something else.
  //
  // Values are matched loosely: an id, the identifier in the data file, or the
  // name the player reads, all case- and punctuation-insensitive. That is why
  // `trigger:happy` finds `traits.trigger_happy.name` even though it holds a
  // colon of its own: only the FIRST colon of a line separates key from value.
  //
  // docs/NPCInitializationExample.md is the worked catalogue of every key.

  const _normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Identifier inside a dotted i18n key ("traits.trigger_happy.name" -> the
  // "trigger_happy" in the middle), which is what a map author reads off the
  // data file and writes in the comment.
  function _identSegment(key) {
    const parts = String(key ?? '').split('.');
    if (parts.length >= 3) return parts.slice(1, -1).join('_');
    return parts[parts.length - 1] || '';
  }

  const _trOrEmpty = (key) => (key && window.T?.has?.(key)) ? window.T(key) : '';

  // True when `value` names any of `candidates` (an id, an identifier, or a
  // localized display name), compared normalized.
  function _namesOne(value, candidates) {
    const want = _normKey(value);
    if (!want) return false;
    return candidates.some(c => c != null && _normKey(c) === want);
  }

  const NPCInitSpec = {
    // Every key the spec understands, and the other spellings a map author
    // might reasonably write for it.
    ALIASES: {
      class: 'class', classid: 'class', job: 'job', jobid: 'job',
      bust: 'bust', face: 'bust', portrait: 'bust',
      sprite: 'sprite', spritekey: 'sprite', character: 'sprite',
      bustindex: 'bustIndex', faceindex: 'bustIndex',
      gender: 'gender', sex: 'gender',
      archetype: 'archetype', creature: 'creature',
      level: 'level', exp: 'exp',
      atk: 'atk', str: 'atk', def: 'def', con: 'def',
      mat: 'mat', int: 'mat', mdf: 'mdf', wis: 'mdf',
      agi: 'agi', dex: 'agi', luk: 'luk', psi: 'luk',
      mhp: 'mhp', hp: 'mhp', mmp: 'mmp', mp: 'mmp',
      arcane: 'arcane', substance: 'substance', stealth: 'stealth',
      intimidation: 'intimidation',
      personality: 'personality', ideology: 'ideology', creed: 'ideology',
      faction: 'faction', traits: 'traits', trait: 'traits',
      skills: 'skills', skill: 'skills', items: 'items', item: 'items',
      morality: 'morality', moralityscore: 'morality',
      wealth: 'wealth', wealthtier: 'wealth', money: 'money',
      workstart: 'workStart', workend: 'workEnd', workshift: 'workShift',
      hunger: 'hunger', sleep: 'sleep', hygiene: 'hygiene',
      social: 'social', leisure: 'leisure', bladder: 'bladder',
      opinion: 'opinion', playeropinion: 'opinion',
      birthyear: 'birthYear', age: 'age', birthplace: 'birthplace',
      orientation: 'sexual', sexual: 'sexual', sexuality: 'sexual',
      romantic: 'romantic', romance: 'romantic',
      relationship: 'relationship', relationshipstyle: 'relationship',
      home: 'homeGroup', homegroup: 'homeGroup', homemap: 'homeMapId',
    },

    // ---- Reading the comment lines -----------------------------------------

    // Parses `key: value` lines into a canonical spec object. Anything that is
    // not a recognised key is dropped, so this is safe to run over every
    // comment on every event.
    parseLines(lines) {
      const spec = {};
      for (const line of (lines || [])) {
        const text = String(line ?? '').trim();
        const at = text.indexOf(':');
        if (at <= 0) continue;
        const canon = this.ALIASES[_normKey(text.slice(0, at))];
        if (!canon) continue;
        const value = text.slice(at + 1).trim();
        if (!value) continue;
        if (spec[canon] === undefined) spec[canon] = value;
      }
      return Object.keys(spec).length ? spec : null;
    },

    // Comment text of one event page (codes 108/408).
    _pageComments(page) {
      if (!page || !page.list) return [];
      return page.list
        .filter(cmd => cmd.code === 108 || cmd.code === 408)
        .map(cmd => String(cmd.parameters?.[0] ?? '').trim())
        .filter(Boolean);
    },

    // From the raw event JSON: every page is read and the first page to name a
    // key wins it. The world-roster pass mints people from map data alone,
    // with no Game_Event to ask which page is active, and a character written
    // across several pages is still the same character.
    fromEventData(eventData) {
      if (!eventData || !eventData.pages || !eventData.pages.length) return null;
      const lines = [];
      for (const page of eventData.pages) lines.push(...this._pageComments(page));
      return this.parseLines(lines);
    },

    // From a live Game_Event: the active page first (it is the one the player
    // is looking at), then the rest as a fallback.
    fromEvent(event) {
      const data = event?.event?.();
      if (!data || !data.pages || !data.pages.length) return null;
      let active = null;
      if (typeof event.meetsConditions === 'function')
        active = data.pages.find(p => event.meetsConditions(p)) || null;
      if (!active && typeof event.page === 'function') active = event.page() || null;
      const lines = active ? this._pageComments(active) : [];
      for (const page of data.pages) {
        if (page === active) continue;
        lines.push(...this._pageComments(page));
      }
      return this.parseLines(lines);
    },

    // The spec for a name, for every caller that has only the name in hand
    // (the dialogue box, the panel, the wiki). Looks the event up on the
    // current map, then falls back to the spec already recorded on the profile.
    forName(eventName) {
      if (!eventName) return null;
      if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.events) {
        for (const ev of $gameMap.events()) {
          if (ev?.event?.()?.name === eventName) {
            const spec = this.fromEvent(ev);
            if (spec) return spec;
          }
        }
      }
      return $gameSystem?._npcSociety?.[eventName]?._initSpec ?? null;
    },

    // The bust an event names, for the resolvers that draw the face. Answered
    // here rather than in each of them so the message box and the Empathize
    // panel can never disagree about which portrait a written character wears.
    bustFor(eventName, event) {
      const spec = (event ? this.fromEvent(event) : null) || this.forName(eventName);
      return spec?.bust || null;
    },

    // ---- Resolving a written value to the thing it names --------------------

    classId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataClasses?.[n]) return n;
      const names = DataLoader.classNames || {};
      for (const id of Object.keys(names)) {
        if (_namesOne(value, [names[id]])) return Number(id);
      }
      for (const cls of ($dataClasses || [])) {
        if (cls && _namesOne(value, [cls.name])) return cls.id;
      }
      return null;
    },

    traitId(value) {
      const traits = DataLoader.traits || [];
      const n = Number(value);
      if (Number.isFinite(n) && traits.some(t => t.id === n)) return n;
      for (const t of traits) {
        if (_namesOne(value, [_identSegment(t.name), _trOrEmpty(t.name)])) return t.id;
      }
      return null;
    },

    // { index, id } of the creed, or null.
    ideology(value) {
      const list = DataLoader.ideologies || [];
      for (let i = 0; i < list.length; i++) {
        const ideo = list[i];
        if (!ideo) continue;
        if (_namesOne(value, [ideo.id, _identSegment(ideo.name), _trOrEmpty(ideo.name)]))
          return { index: i, id: ideo.id };
      }
      return null;
    },

    factionIndex(value) {
      const list = DataLoader.factions || [];
      const n = Number(value);
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f) continue;
        if (Number.isFinite(n) && f.id === n) return i;
        if (_namesOne(value, [_identSegment(f.name), _trOrEmpty(f.name), DataLoader.getFactionName(f)]))
          return i;
      }
      return -1;
    },

    personalityIndex(value) {
      const list = DataLoader.personalities || [];
      const n = Number(value);
      if (Number.isFinite(n) && list[n]) return n;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && _namesOne(value, [list[i].name])) return i;
      }
      return -1;
    },

    skillId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataSkills?.[n]) return n;
      for (const s of ($dataSkills || [])) {
        if (s && s.name && _namesOne(value, [s.name])) return s.id;
      }
      return null;
    },

    itemId(value) {
      const n = Number(value);
      if (Number.isFinite(n) && $dataItems?.[n]) return n;
      for (const i of ($dataItems || [])) {
        if (i && i.name && _namesOne(value, [i.name])) return i.id;
      }
      return null;
    },

    // 0 jobless, a Jobs.json id, or null when nothing matches.
    jobId(value) {
      const norm = _normKey(value);
      if (norm === 'none' || norm === 'jobless') return 0;
      const jobs = window.WorkSystem?.Jobs || [];
      const n = Number(value);
      if (Number.isFinite(n) && jobs.some(j => j.id === n)) return n;
      for (const j of jobs) {
        if (_namesOne(value, [j.spec, _trOrEmpty(j.name)])) return j.id;
      }
      return null;
    },

    // 0 male, 1 female, 2 non-binary, 3 cocoon: the order the pronoun table is
    // written in (see SECTION 7).
    gender(value) {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(Math.max(n | 0, 0), 3);
      const keys = [['male', 'man', 'm', 'he'], ['female', 'woman', 'f', 'she'],
                    ['nonbinary', 'enby', 'nb', 'they'], ['cocoon', 'xe', 'neo']];
      for (let i = 0; i < keys.length; i++) {
        if (_namesOne(value, keys[i])) return i;
      }
      return null;
    },

    // 0 destitute .. 4 wealthy.
    wealthTier(value) {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(Math.max(n | 0, 0), 4);
      const tiers = [['destitute', 'broke'], ['poor'], ['workingclass', 'working'],
                     ['middleclass', 'middle', 'comfortable'], ['wealthy', 'rich']];
      for (let i = 0; i < tiers.length; i++) {
        if (_namesOne(value, tiers[i])) return i;
      }
      return null;
    },

    orientationKey(kind, value) {
      const list = window.NPCOrientationData?.()?.[kind] || [];
      for (const o of list) {
        if (o && _namesOne(value, [o.key, _identSegment(o.name), _trOrEmpty(o.name)])) return o.key;
      }
      return null;
    },

    relationshipKey(value) {
      const list = window.NPCRelationshipData?.()?.styles || [];
      for (const s of list) {
        if (s && _namesOne(value, [s.key, _identSegment(s.name), _trOrEmpty(s.name)])) return s.key;
      }
      return null;
    },

    // ---- Forcing it onto the profile ---------------------------------------

    // Applies `spec` to `profile`, in place. Called once, right after the
    // profile is minted, and again for the identity half whenever the sprite
    // reconciler has had a chance to overwrite it (see _applySocietySprite):
    // an event that says who this is outranks the sheet they are wearing.
    apply(profile, spec, eventName) {
      if (!profile || !spec) return profile;
      profile._initSpec = spec;
      if (eventName && !profile._eventName) profile._eventName = eventName;
      this.applyIdentity(profile, spec);

      const num = (key, min, max) => {
        const v = Number(spec[key]);
        if (!Number.isFinite(v)) return null;
        return Math.min(Math.max(v, min), max);
      };
      const list = (key) => String(spec[key] ?? '').split(',').map(s => s.trim()).filter(Boolean);

      // Level, and the stats that hang off it. A written level rescales the
      // rolled stat block unless the stats are written too, so `level: 10`
      // alone still produces somebody who fights like a level 10.
      const level = num('level', 1, 9999);
      if (level != null && level !== profile.level) {
        const ratio = level / Math.max(1, profile.level || 1);
        profile.level = level;
        for (const key of ['atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mhp', 'mmp']) {
          if (profile[key]) profile[key] = Math.max(1, Math.round(profile[key] * ratio));
        }
        // Cleared so ensureSimFields re-derives them from the written level.
        profile.exp = undefined;
        profile._classSkillsSeeded = false;
        // A level the map wrote is the map's, not the party's: the local-level
        // peg would otherwise drag it back to the party median on every read.
        profile._levelPinned = true;
      }
      for (const key of ['atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mhp', 'mmp',
                         'arcane', 'substance', 'stealth', 'intimidation', 'exp']) {
        const v = num(key, 0, 99999999);
        if (v == null) continue;
        profile[key] = v;
        // A written look stat is a percentage and pins the value: the kit no
        // longer decides it (NPCSociety_Gear _syncLookStats).
        if (key === 'arcane' || key === 'substance' || key === 'stealth' || key === 'intimidation') {
          profile[key] = Math.min(100, v);
          profile._lookPinned = true;
        }
      }

      const pi = spec.personality != null ? this.personalityIndex(spec.personality) : -1;
      if (pi >= 0) profile.personalityIndex = pi;

      const ideo = spec.ideology != null ? this.ideology(spec.ideology) : null;
      // A creed the map author wrote down is theirs: pinned, so the civic
      // draw, the drift and conversion never move it (NPCShared.creedPinned).
      if (ideo) { profile.ideologyIndex = ideo.index; profile.ideologyId = ideo.id; profile._ideologyPinned = true; }

      if (spec.faction != null) {
        const fi = this.factionIndex(spec.faction);
        if (fi >= 0 || _normKey(spec.faction) === 'none') profile.factionIndex = fi;
      }

      if (spec.traits != null) {
        const ids = list('traits').map(t => this.traitId(t)).filter(id => id != null);
        if (ids.length) profile.traitIds = ids;
      }
      if (spec.skills != null) {
        const ids = list('skills').map(s => this.skillId(s)).filter(id => id != null);
        if (ids.length) profile.skillIds = ids;
      }
      if (spec.items != null) {
        // Not even an author can hand somebody the Liminal cuffs (NPCShared).
        const ids = list('items').map(i => this.itemId(i))
          .filter(id => id != null && !window.NPCShared?.isForbiddenItem?.(id));
        if (ids.length) profile.itemIds = ids;
      }

      const wealth = spec.wealth != null ? this.wealthTier(spec.wealth) : null;
      if (wealth != null) profile.wealthTierBase = wealth;
      const money = num('money', 0, Number.MAX_SAFE_INTEGER);
      // A beast holds no euros whatever its page says (NPCCreature.mayHoldMoney):
      // the line is ignored, with a warning for whoever wrote it.
      if (money != null && window.NPCCreature?.mayHoldMoney?.(profile, eventName) === false) {
        if (money > 0) console.warn(`[NPCInitSpec] "${eventName || profile._eventName || "?"}" is non-sentient: money ignored`); // i18n-ignore: diagnostic
      } else if (money != null) profile.money = money;
      const morality = num('morality', -100, 100);
      if (morality != null) profile.moralityScore = morality;
      const opinion = num('opinion', -100, 100);
      if (opinion != null) profile.playerOpinion = opinion;

      if (spec.job != null) {
        const jid = this.jobId(spec.job);
        if (jid != null) profile.currentJobId = jid;
      }
      for (const key of ['workStart', 'workEnd']) {
        const v = num(key, 0, 23);
        if (v != null) profile[key] = v;
      }
      const shift = num('workShift', 0, 3);
      if (shift != null) profile.workShift = shift;

      for (const key of ['hunger', 'sleep', 'hygiene', 'social', 'leisure', 'bladder']) {
        const v = num(key, 0, 100);
        if (v != null) profile[key] = v;
      }

      // Background. An age is the same statement as a birth year said from the
      // other end, so it is converted rather than stored: the backstory
      // generator only knows about years.
      const birthYear = num('birthYear', 0, 9999);
      if (birthYear != null) profile._birthYearOverride = birthYear;
      const age = num('age', 0, 999);
      if (age != null && birthYear == null) {
        const nowYear = window.NPCLifeSim?.currentYear?.() ?? 2001;
        profile._birthYearOverride = nowYear - age;
      }
      if (spec.birthplace) profile._birthplaceOverride = spec.birthplace;

      const sexual   = spec.sexual   != null ? this.orientationKey('sexual', spec.sexual) : null;
      const romantic = spec.romantic != null ? this.orientationKey('romantic', spec.romantic) : null;
      if (sexual || romantic) {
        profile._orientOverride = profile._orientOverride || {};
        if (sexual)   profile._orientOverride.sexualKey   = sexual;
        if (romantic) profile._orientOverride.romanticKey = romantic;
      }
      const relStyle = spec.relationship != null ? this.relationshipKey(spec.relationship) : null;
      if (relStyle) profile._relStyleOverride = relStyle;

      if (spec.homeGroup) profile._homeGroupName = spec.homeGroup;
      const homeMap = num('homeMapId', 1, 9999);
      if (homeMap != null) profile.homeMapId = homeMap;

      profile._initSpecApplied = true;
      return profile;
    },

    // The half of the spec that says WHO this is rather than how they are
    // doing: re-applied after anything that re-derives identity from the sheet.
    applyIdentity(profile, spec) {
      if (!profile || !spec) return;
      const classId = spec.class != null ? this.classId(spec.class) : null;
      if (classId) profile.assignedClassId = classId;
      if (spec.sprite) profile.spriteKey = spec.sprite;
      const bustIndex = Number(spec.bustIndex);
      if (Number.isFinite(bustIndex)) profile.bustIndex = Math.max(0, bustIndex | 0);
      const gender = spec.gender != null ? this.gender(spec.gender) : null;
      if (gender != null) profile.gender = gender;
      if (spec.archetype) profile.archetype = spec.archetype;
      if (spec.creature != null) profile.isCreature = /^(1|true|yes|on)$/i.test(String(spec.creature).trim());
      // The class the event wrote is the last word on personhood, so a Witch
      // written onto a beast's sheet is a person, and a Feral written onto an
      // ordinary sheet is not. NPCCreature still owns where that line falls.
      const NC = window.NPCCreature;
      if (classId && NC) {
        profile.nonSentient = !NC.isPlayerCharacterName?.(profile._eventName) &&
          NC.isNonSentientClassId(classId);
      }
    },

    // Whether an event dictates the LOOK of this NPC, which is what tells the
    // sprite reconciler to leave the face alone. Only the lines that name a
    // face count: a spec overrides the fields it writes and nothing else, so
    // `class:` or `gender:` on their own say who this person is and still let
    // the simulation deal them a sprite and a bust like anybody else.
    pinsIdentity(spec) {
      return !!spec && (spec.sprite != null || spec.bust != null ||
        spec.bustIndex != null || spec.archetype != null || spec.creature != null);
    },
  };
  window.NPCInitSpec = NPCInitSpec;

  Object.assign(window.NPCSocietyRegistry._internal, {
    NPCInitSpec,
  });
})();
