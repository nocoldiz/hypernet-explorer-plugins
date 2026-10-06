/*:
 * @target MZ
 * @plugindesc NPC Conversation: life talk and the creed voice
 * @author Omni-Lex
 * @base NPCConversation
 * @orderAfter NPCConversation
 * @orderAfter NPCConversation_Banks
 * @help
 * ============================================================================
 * NPCConversation_LifeTalk, part of the NPCConversation family
 * ============================================================================
 * Owns II.8 LIFE TALK (context-driven topics: ElectionClock, WorldFacts,
 * LifeContext, LifeTalk) and II.9, the creed voice (CreedVoice).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCConversation._internal and publishes its own there. Load it right after
 * NPCConversation_Banks.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _getProfile, _personalityNameOf, _pickFrom, applyVoice, bank, CREED_FAMILY_BANKS, CREED_SPECIAL_BANKS,
    LIFE_AMBIENT, LIFE_FALLBACK, LIFE_GREET_KIN, LIFE_MENTIONS, LIFE_SCRIPTS, LIFE_THOUGHTS, vary,
    VOICE_CHANCE_DIALOGUE,
  } = window.NPCConversation._internal;

  // ---------------------------------------------------------------------------
  // II.8 LIFE TALK (context-driven topics)
  // ---------------------------------------------------------------------------
  // Everything the newer simulation knows about a person, read once per game
  // hour into a small context (LifeContext), and a table of topics (LIFE_TOPICS)
  // each with a condition and a weight over that context. A topic is only a
  // candidate while its condition holds, so a line about a newborn needs a
  // newborn, a line about the war needs a war their power is in, and a line
  // about voting day needs the country the player stands in to be voting.
  // Nothing here is evaluated until a line is about to be picked.
  //
  // Every source below is optional and guarded: a save that has no life
  // records, no wars (HistoryManager) or no Horde refugees yet simply has
  // fewer topics.

  const MIN_PER_DAY  = 1440;
  const MIN_PER_YEAR = 365 * MIN_PER_DAY;
  const GOBLIN_HORDE_POWER = 'Goblin Horde';          // i18n-ignore: Hyperpowers.json key
  const IDEOLOGY_EXEMPT_NAMES = new Set(['em', 'bubba']); // i18n-ignore: story actor names, matched at runtime
  const LIFE_CACHE_MAX = 400;
  const CREED_CHANCE_THOUGHT  = 0.30;
  const CREED_CHANCE_POLITICS = 0.35;
  const CREED_CHANCE_DIALOGUE = 0.15;
  const CREED_CHANCE_MENTION  = 0.30;
  const CREED_ASIDE_CHANCE    = 0.04;

  function _nowMinute() { return (typeof $gameVariables !== 'undefined' && $gameVariables?.value?.(114)) || 0; }
  function _samePower(a, b) {
    return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }
  function _history() {
    const H = window.HistoryManager;
    return H && typeof H.activeWars === 'function' ? H : null;
  }
  function _isNonSentientProfile(profile) {
    const NC = window.NPCCreature;
    return !!(NC && NC.isNonSentientProfile && NC.isNonSentientProfile(profile));
  }
  // The day index of the game calendar (var 113, "01 JAN 2001 12:00"), for
  // comparing against the chronicle's 'YYYY-MM-DD' war dates.
  const _MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const _MONTHS_IT = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
  function _gameDayIndex() {
    const raw = String((typeof $gameVariables !== 'undefined' && $gameVariables?.value?.(113)) || '').split(' ').filter(Boolean);
    const d = Number(raw[0]), y = Number(raw[2]);
    const mon = String(raw[1] || '').toUpperCase();
    let m = _MONTHS_EN.indexOf(mon);
    if (m < 0) m = _MONTHS_IT.indexOf(mon);
    if (!Number.isFinite(d) || !Number.isFinite(y) || m < 0) return null;
    return Math.round(Date.UTC(y, m, d) / 86400000);
  }
  function _dayIndexOf(str) {
    const [y, m, d] = String(str || '').split('-').map(Number);
    return Number.isFinite(y) ? Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000) : null;
  }
  function _tr(key) {
    try { return (typeof key === 'string' && T.has && T.has(key)) ? T(key) : key; } catch (_) { return key; }
  }

  // --- Elections in the country the player stands in ------------------------
  // Political talk grows louder as the next election there comes closer:
  // x1 normally, ramping to x4 over the last 30 days, x6 on election week,
  // and x3 for the week after the count.
  const ElectionClock = {
    RAMP_DAYS: 30, WEEK_DAYS: 7, AFTER_DAYS: 7,
    _cache: { key: null, val: null },

    weightFor(daysTo, daysSince) {
      let w = 1;
      if (daysTo != null && daysTo >= 0) {
        if (daysTo <= this.WEEK_DAYS) w = 6;
        else if (daysTo <= this.RAMP_DAYS) {
          w = 1 + 3 * (this.RAMP_DAYS - daysTo) / (this.RAMP_DAYS - this.WEEK_DAYS - 1);
        }
      }
      if (daysSince != null && daysSince >= 0 && daysSince <= this.AFTER_DAYS) w = Math.max(w, 3);
      return w;
    },

    // { power, country, daysTo, daysSince, party, rival, winner, election, weight }
    // for the polity the player is in, or (off any known group) the speaker's.
    current(profile) {
      const P = window.NPCPolitics;
      if (!P || typeof P.getPower !== 'function') return null;
      let powerName = null, country = null;
      try {
        const mapId = (typeof $gameMap !== 'undefined' && $gameMap?.mapId?.()) || 0;
        const group = mapId ? window.NPCSystem?.findMapGroupByMap?.(mapId) : null;
        const pol = group ? P.polityOfGroup?.(group) : null;
        if (pol && pol.power) { powerName = pol.power; country = pol.country || null; }
      } catch (_) {}
      if (!powerName && profile?._eventName) {
        const id = P.getIdentity?.(profile._eventName);
        if (id && id.power) { powerName = id.power; country = id.country || null; }
      }
      if (!powerName) return null;
      const key = powerName + '|' + Math.floor(_nowMinute() / 60);
      if (this._cache.key === key) return this._cache.val;
      let val = null;
      try { val = this._compute(P.getPower(powerName), powerName, country, profile); } catch (_) { val = null; }
      this._cache = { key, val };
      return val;
    },

    _compute(power, powerName, country, profile) {
      if (!power) return null;
      const now = _nowMinute();
      const daysTo = power.nextElectionMinute != null
        ? Math.max(0, Math.floor((power.nextElectionMinute - now) / MIN_PER_DAY)) : null;
      const last = (power.elections || [])[0] || null;
      const daysSince = last && Number.isFinite(last.minute) && last.minute <= now
        ? Math.floor((now - last.minute) / MIN_PER_DAY) : null;
      const parties = power.parties || [];
      const ruling = parties.find(p => p && p.id === power.rulingPartyId) || parties[0] || null;
      const names = (last?.results || []).map(r => r && (r.name || parties.find(p => p.id === r.partyId)?.name)).filter(Boolean);
      const rival = names.find(n => n !== ruling?.name) || parties.find(p => p && p !== ruling)?.name || null;
      let election = last?.label || null;
      try {
        const ctx = profile?._eventName ? window.NPCPolitics.getConversationContext?.(profile._eventName) : null;
        if (ctx && _samePower(ctx.powerName, powerName) && ctx.electionLabel) election = ctx.electionLabel;
      } catch (_) {}
      return {
        power: powerName, country, daysTo, daysSince,
        party: ruling?.name || null, rival, winner: last?.winner || null,
        election: election ? String(election).toLowerCase() : null,
        weight: this.weightFor(daysTo, daysSince),
      };
    },

    weightNow(profile) { return this.current(profile)?.weight ?? 1; },
  };

  // --- The world, once per game hour (wars, the Horde) ------------------------
  const WorldFacts = {
    _hour: -1, _val: null,
    get() {
      const hour = Math.floor(_nowMinute() / 60);
      if (hour === this._hour && this._val) return this._val;
      const H = _history();
      const val = { wars: [], recent: [], hordeHolds: [], today: _gameDayIndex() };
      if (H) {
        try { val.wars = H.activeWars() || []; } catch (_) {}
        try {
          const all = H.getWars?.() || [];
          val.recent = all.filter(w => w && w.status === 'ended' && w.until && val.today != null &&
            val.today - (_dayIndexOf(w.until) ?? -1e9) <= 60);
        } catch (_) {}
        try {
          const nations = H.getNationsState?.() || {};
          for (const [country, st] of Object.entries(nations)) {
            if (st && _samePower(st.controller, GOBLIN_HORDE_POWER)) val.hordeHolds.push(country);
          }
        } catch (_) {}
      }
      this._hour = hour; this._val = val;
      return val;
    },
    clear() { this._hour = -1; this._val = null; },
  };

  // --- The rest of a life: trade, home, roots, health, money, friends ------
  // Everything below is something the simulation already keeps on the
  // profile or the life record. Each source is optional and read through its
  // owner's own getter when it has one; a missing system means a missing
  // topic, never a wrong one.
  const WORK_SOON_HOURS   = 1;     // "on my way to work" this long before the shift
  const NEW_JOB_DAYS      = 60;
  const MOVED_DAYS        = 365;
  const RECOVERED_DAYS    = 45;
  const IMPLANT_NEW_DAYS  = 60;
  const BAND_SOON_DAYS    = 4;
  const BAND_BACK_DAYS    = 14;
  const BIRTHDAY_SOON_DAYS = 7;
  const HOLIDAY_SOON_DAYS = 3;
  const MONEY_LOG_DAYS    = 7;
  const RELEASED_DAYS     = 120;
  const GRIEF_DAYS        = 365;
  const FRIEND_MIN_OPINION = 45;
  const RIVAL_MAX_OPINION  = -30;
  const FRIEND_MIN_MEETS   = 3;
  // i18n-ignore-start: NPCLife MOVE_REASONS ids, folded into four pools
  const MOVE_REASON_POOL = {
    lookingForWork: 'Work', cheapHousing: 'Work',
    followingFamily: 'Love', chasingLove: 'Love',
    fleeingTrouble: 'Trouble', fallingOut: 'Trouble',
    freshStart: 'Fresh', changeOfAir: 'Fresh', homecoming: 'Fresh',
  };
  // i18n-ignore-end

  // The calendar day of a game minute, counted the way TimeDateSystem counts
  // it (the clock starts at 1 JAN 2001 10:00 and adds wall-clock minutes), so
  // `day` is the same index PublicHolidays uses.
  function _dateOfMinute(minute) {
    const dt = new Date(2001, 0, 1, 10, 0, 0);
    dt.setMinutes(dt.getMinutes() + (Number(minute) || 0));
    const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    return {
      y, m, d, hour: dt.getHours(), weekday: dt.getDay(),
      day: Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2001, 0, 1)) / 86400000),
    };
  }
  // How many days from (m, d) to the next (bm, bd), 0 on the day itself.
  function _daysUntilDate(today, bm, bd) {
    const from = Date.UTC(today.y, today.m - 1, today.d);
    let to = Date.UTC(today.y, bm - 1, bd);
    if (to < from) to = Date.UTC(today.y + 1, bm - 1, bd);
    return Math.round((to - from) / 86400000);
  }
  function _hashOf(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function _label(group, key) {
    try {
      const v = bank('ConvLife.label')?.[group]?.[key];
      return typeof v === 'string' && v ? v : null;
    } catch (_) { return null; }
  }

  function _readLife(c, x) {
    const { name, profile, rec, now, LS, recOf, events, log, stage } = x;
    const p = c.params;
    const adult = stage === 'adult'; // i18n-ignore: life stage id
    const within = (minute, days) => Number.isFinite(minute) && now >= minute && now - minute <= days * MIN_PER_DAY;
    const lastEvent = (pred, days) => {
      let best = null;
      for (const e of events) if (e && pred(e) && within(e.minute, days) && (!best || e.minute > best.minute)) best = e;
      return best;
    };
    const lastLog = (pred, days) => log.find(e => e && pred(e) && within(e.minute, days)) || null;
    const today = _dateOfMinute(now);
    c.today = today;

    // Their trade, whatever the hour, and when they work it.
    const JM = window.NPCSim?.JobManager;
    let job = null;
    try {
      job = (profile.currentJobId > 0 && Array.isArray(window.WorkSystem?.Jobs))
        ? window.WorkSystem.Jobs.find(j => j && j.id === profile.currentJobId) || null : null;
    } catch (_) { job = null; }
    const openSeg = Array.isArray(rec?.careerHistory) ? rec.careerHistory.find(s => s && s.toYear == null) : null;
    const jobName = job?.name ? _tr(job.name) : (openSeg?.jobName ? _tr(openSeg.jobName) : null);
    c.retired = adult && rec?.employment === 'retired'; // i18n-ignore: employment state id
    c.employed = adult && !c.retired && !c.leave && !!jobName && profile.currentJobId !== 0;
    if (c.employed) {
      p.job = p.job || jobName;
      c.jobObj = job;
      // The workplace by name only when it is the map in hand: naming any
      // other would mean reading its map file in the middle of a chat.
      try {
        const gm = typeof $gameMap !== 'undefined' ? $gameMap : null;
        p.workplace = (profile.workMapId && gm?.mapId?.() === profile.workMapId) ? (gm.displayName?.() || null) : null;
      } catch (_) { p.workplace = null; }
      const shift = Number(profile.workShift);
      if (Number.isFinite(shift) && shift >= 0 && shift <= 2) {
        c.shift = shift;
        c.nightShift = shift === 0;
        const start = shift * 8;
        const sinceStart = ((today.hour - start) + 24) % 24;
        c.workSoon = sinceStart >= 24 - WORK_SOON_HOURS || sinceStart < 8;
      }
      // Whether they love the trade or hate it is theirs to keep: a stable
      // roll on the name and the job, a third each way and a third shrugging.
      const taste = _hashOf(name + '|' + jobName) % 3;
      c.workTaste = taste === 0 ? 'love' : taste === 1 ? 'hate' : null; // i18n-ignore: taste ids
    }
    const newJob = lastEvent(e => e.key === 'NPCLife.event.changedJob' || e.key === 'NPCLife.event.foundWork', NEW_JOB_DAYS);
    if (newJob && adult && !c.retired) {
      c.newJob = true;
      p.job = p.job || _tr(newJob.params?.job) || null;
    }

    // Home: none at all, a new one and why, and how they feel about it.
    c.homeless = adult && !!(profile.isHomeless || profile._sleepsRough);
    const hist = Array.isArray(rec?.locationHistory) ? rec.locationHistory : [];
    const stay = hist.length ? hist[hist.length - 1] : null;
    if (c.newcomer && stay && MOVE_REASON_POOL[stay.reason] && lastEvent(e => e.key === 'NPCLife.event.moved', MOVED_DAYS)) {
      c.moveReason = MOVE_REASON_POOL[stay.reason];
    }
    const hb = profile.homeBuilding;
    if (adult && !c.homeless && hb && !hb._placeholder) {
      const tier = profile.wealthTierBase ?? 2;
      if (tier >= 3) c.homePride = true;
      else if (tier <= 1) c.homeWorry = true;
    }

    // Roots: where they were born, and whether they still live there.
    const LSI = LS?._internal;
    if (rec?.birthplace && adult) {
      let born = null;
      try { born = LSI?.placeLabel ? LSI.placeLabel(rec.birthplace) : String(rec.birthplace); } catch (_) { born = null; }
      if (born) {
        p.birthplace = born;
        if (!c.refugee && rec.currentPlace && rec.currentPlace !== rec.birthplace) c.homesick = true;
        else if (rec.currentPlace && rec.currentPlace === rec.birthplace) c.rootsLocal = true;
      }
    }

    // Health: what they are ill with now, what they live with, what they got over.
    const DS = window.DiseaseSystem;
    if (DS) {
      const nameOf = (id) => { try { return DS.displayName ? DS.displayName(id) : null; } catch (_) { return null; } };
      let acute = null, chronic = null;
      for (const e of (Array.isArray(profile.diseases) ? profile.diseases : [])) {
        if (!e || e.id == null) continue;
        let d = null;
        try { d = DS.resolve ? DS.resolve(e) : null; } catch (_) { d = null; }
        if (d && d.venereal) continue;
        const isChronic = !!e.chronic || (d && (d.durationDays < 0 || d.durationDays >= 9999));
        if (isChronic) { if (!chronic) chronic = e; }
        else if (!(e.contact && !e.symptomatic) && !acute) acute = e;
      }
      if (!chronic) {
        const conds = Array.isArray(profile.conditions) ? profile.conditions : [];
        chronic = conds.find(e => e && e.id != null) || null;
      }
      if (acute) { c.ill = true; p.illness = nameOf(acute.id) || null; }
      if (chronic && adult) { c.chronic = true; p.condition = nameOf(chronic.id) || null; }
      const fell = lastEvent(e => /^NPCLife\.event\.fellIll/.test(e.key || ''), RECOVERED_DAYS);
      if (fell && !c.ill) { c.recovered = true; p.illness = p.illness || fell.params?.illness || null; }
    }

    // Implants and prosthetics: a new one, or one they have lived with.
    const Impl = window.NPCSim?.Implants;
    const fitted = lastEvent(e => e.key === 'NPCLife.event.gotImplant' || e.key === 'NPCLife.event.gotProsthetic', IMPLANT_NEW_DAYS);
    const label = (id) => { try { return Impl?.label ? Impl.label(id) : null; } catch (_) { return null; } };
    const partOf = (part) => { try { return Impl?.partLabel ? Impl.partLabel(part, profile) : null; } catch (_) { return null; } };
    if (fitted && adult) {
      c.newImplant = true;
      p.augment = label(fitted.params?.augment) || null;
      p.bodyPart = partOf(fitted.params?.bodyPart) || null;
    } else if (adult && Array.isArray(profile.implants) && profile.implants.length) {
      // Only an augment that does something is worth a word: never one of
      // the catalogue's inert organ replacements.
      const types = (() => { try { return Impl?.types ? Impl.types() : null; } catch (_) { return null; } })();
      const imp = profile.implants.find(i => i && i.augmentId &&
        (!types || !Impl?.worthwhile || Impl.worthwhile(types[i.augmentId])));
      if (imp) { c.hasImplant = true; p.augment = label(imp.augmentId) || null; p.bodyPart = partOf(imp.part) || null; }
    }

    // Growing in skill: a level gained in the last day.
    const lvl = lastLog(e => e.tag === 'levelup', 1);
    if (lvl) { c.levelUp = true; p.level = String(lvl.params?.level ?? profile.level ?? ''); }

    // An adventuring band: about to set out, out now, or just home.
    const Bands = LS?.Bands;
    let band = null;
    try { band = Bands?.bandOf ? Bands.bandOf(name) : null; } catch (_) { band = null; }
    if (band && adult) {
      const since = Number(band.since), until = Number(band.until);
      if (Number.isFinite(since) && now < since && since - now <= BAND_SOON_DAYS * MIN_PER_DAY) c.bandSoon = true;
      else if (Number.isFinite(since) && now >= since && now < until) c.bandAway = true;
      if (c.bandSoon || c.bandAway) {
        p.expedition = _label('expedition', band.kind);
        p.bandmate = band.leader && band.leader !== name ? band.leader
          : ((band.members || []).find(m => m && m !== name) || null);
      }
    }
    const back = adult ? lastEvent(e => /^NPCLife\.event\.bandBack\./.test(e.key || ''), BAND_BACK_DAYS) : null;
    if (back && !c.bandAway && !c.bandSoon) {
      const parts = String(back.key).split('.');
      c.bandBack = parts[3] || 'plain'; // i18n-ignore: band outcome id
      p.expedition = _label('expedition', parts[4]);
    }

    // Birthdays: their own, one coming, and a close relative's today.
    if (rec?.birthMonth && rec?.birthDay) {
      const until = _daysUntilDate(today, rec.birthMonth, rec.birthDay);
      if (until === 0) c.birthdayToday = true;
      else if (until <= BIRTHDAY_SOON_DAYS) c.birthdaySoon = true;
      // The age they are turning: the year the next birthday falls in.
      const nextYear = new Date(Date.UTC(today.y, today.m - 1, today.d) + until * 86400000).getUTCFullYear();
      if (Number.isFinite(rec.birthYear)) p.age = String(nextYear - rec.birthYear);
    }
    if (adult) {
      for (const n of [...c.partners, ...c.children.child, ...c.children.adult, ...c.parents]) {
        const r = recOf(n);
        if (r?.birthMonth && r?.birthDay && _daysUntilDate(today, r.birthMonth, r.birthDay) === 0) {
          c.kinBirthday = true; p.relative = n; break;
        }
      }
    }

    // Days off: a public holiday today or soon, and the weekend.
    const PH = window.PublicHolidays;
    if (PH?.forCountry && c.country) {
      try {
        const hol = PH.forCountry(c.country, today.day) || [];
        if (hol.length) {
          c.holidayToday = true;
          p.holiday = PH.nameOf ? PH.nameOf(hol[0].id) : String(hol[0].id);
        } else {
          for (let k = 1; k <= HOLIDAY_SOON_DAYS; k++) {
            const next = PH.forCountry(c.country, today.day + k) || [];
            if (next.length) { c.holidaySoon = true; p.holiday = PH.nameOf ? PH.nameOf(next[0].id) : String(next[0].id); break; }
          }
        }
      } catch (_) {}
    }
    if (c.holidayToday && c.employed) {
      try { c.holidayShift = !!JM?.worksHolidays?.(c.jobObj); } catch (_) { c.holidayShift = false; }
    }
    if (adult && !c.holidayToday && (today.weekday === 0 || today.weekday === 6)) {
      let weekdayOnly = true;
      try { weekdayOnly = c.employed && c.jobObj && JM?.isWeekdayOnly ? !!JM.isWeekdayOnly(c.jobObj) : true; } catch (_) { weekdayOnly = true; }
      if (c.employed && !weekdayOnly) c.weekendWork = true;
      else c.weekendOff = true;
    }

    // Money: the market, the bank, a rent cheque, a treat, saving up.
    if (adult) {
      const inv = lastLog(e => e.tag === 'investing', MONEY_LOG_DAYS);
      if (inv) {
        const k = String(inv.key || '');
        if (/stocksGain/.test(k)) c.stocksWon = true;
        else if (/stocksLoss/.test(k)) c.stocksLost = true;
        else if (/stocksBought/.test(k)) { c.stocksBought = true; p.company = inv.params?.company || null; }
      }
      const held = profile.shareholdings && typeof profile.shareholdings === 'object' ? Object.keys(profile.shareholdings) : [];
      if (held.length) {
        c.shareholder = true;
        if (!p.company) { try { p.company = window.StockSociety?.nameOf ? window.StockSociety.nameOf(held[0]) : null; } catch (_) { p.company = null; } }
      }
      const bankLog = lastLog(e => e.tag === 'banking', MONEY_LOG_DAYS);
      if (bankLog) {
        if (/tookLoan/.test(bankLog.key || '')) c.loan = true;
        else if (/deposited/.test(bankLog.key || '')) c.saved = true;
      }
      if (lastLog(e => e.tag === 'realty', MONEY_LOG_DAYS)) c.rentIncome = true;
      const bought = lastLog(e => e.tag === 'shopping' && /bought$/.test(e.key || '') && e.params?.item, 1);
      if (bought) { c.bought = true; p.purchase = _tr(bought.params.item); }
      const tier = profile.wealthTierBase ?? 2;
      if (c.employed && tier >= 1 && tier <= 2) c.saving = true;
    }

    // Prison: just out, or a record they are trying to live down.
    const released = lastEvent(e => e.key === 'NPCLife.event.releasedFromPrison' || e.key === 'NPCLife.event.servedAndReleased', RELEASED_DAYS);
    if (released && adult && rec?.inPrisonUntilMinute == null) c.released = true;
    else if (adult && !c.wanted && Array.isArray(rec?.criminalRecord) && rec.criminalRecord.some(e => e && e.convicted)) c.reformed = true;

    // What they get about on. Read only once the sim has dealt their ride:
    // asking before that would deal it, and this context only reads.
    const Veh = window.NPCSim?.Vehicles;
    if (adult && Veh?.vehicleOf && profile._vehV != null) {
      try { c.vehicle = Veh.vehicleOf(profile, name) || null; } catch (_) { c.vehicle = null; }
      if (c.vehicle) p.vehicle = _label('vehicle', c.vehicle);
    }

    // Friends and rivals: the people they know best, by opinion.
    if (adult && profile.relationships && typeof profile.relationships === 'object') {
      const kinNames = new Set([...c.partners, ...Object.keys(rec?.kin || {})]);
      let best = null, worst = null;
      for (const [n, r] of Object.entries(profile.relationships)) {
        if (!r || kinNames.has(n) || n === name || (r.meetCount ?? 0) < FRIEND_MIN_MEETS) continue;
        if (recOf(n)?.dead) continue;
        const op = Number(r.opinion) || 0;
        if (op >= FRIEND_MIN_OPINION && (!best || op > best.op)) best = { n, op };
        if (op <= RIVAL_MAX_OPINION && (!worst || op < worst.op)) worst = { n, op };
      }
      if (best) { c.friend = true; p.friend = best.n; }
      if (worst) { c.foe = true; p.foe = worst.n; }
    }

    // Kin: a parent or a child lost this year, and grandchildren.
    if (adult) {
      for (const [n, rel] of Object.entries(rec?.kin || {})) {
        const r = recOf(n);
        if (rel === 'grandparent' && !r?.dead && !p.grandchild) { c.grandkids = true; p.grandchild = n; }
        if (!r?.dead || !within(Number(r.dead.minute), GRIEF_DAYS)) continue;
        // kin[n] is what THIS person is to n: 'child' means n was their parent.
        if (rel === 'child' && !c.lostParent) { c.lostParent = true; p.lostParent = n; }
        else if (rel === 'parent' && !c.lostChild) { c.lostChild = true; p.lostChild = n; }
      }
    }
  }

  // --- One person's context -----------------------------------------------
  const LifeContext = {
    _cache: new Map(),

    of(profile, name) {
      name = name || profile?._eventName;
      if (!profile || !name) return null;
      const hour = Math.floor(_nowMinute() / 60);
      const hit = this._cache.get(name);
      if (hit && hit.hour === hour && hit.profile === profile) return hit.ctx;
      const ctx = this.build(name, profile);
      this._cache.set(name, { hour, profile, ctx });
      if (this._cache.size > LIFE_CACHE_MAX) this._cache.delete(this._cache.keys().next().value);
      return ctx;
    },

    clear() { this._cache.clear(); },

    // Everything the topics read, from the profile, the life record, the
    // politics and the chronicle. Pure reads: nothing here writes anything.
    build(name, profile, opts = {}) {
      const LS = window.NPCLifeSim;
      const rec = opts.record !== undefined ? opts.record : (LS?.getRecord?.(name) ?? null);
      const now = opts.now ?? _nowMinute();
      const recOf = (n) => { try { return LS?.getRecord?.(n) ?? null; } catch (_) { return null; } };
      const stageOf = (n) => { try { return LS?.lifeStageOf?.(n) || 'adult'; } catch (_) { return 'adult'; } }; // i18n-ignore: life stage id
      let stage = profile.lifeStage || null;
      if (!stage) stage = stageOf(name);
      const c = {
        name, stage, now, params: {}, nonSentient: _isNonSentientProfile(profile),
        partners: [], children: { newborn: [], child: [], adult: [] }, parents: [], siblings: [],
      };
      const p = c.params;

      // Partners, and how they live.
      const plist = LS?.partnersOf ? LS.partnersOf(rec) : (rec?.partner ? [rec.partner] : []);
      c.partners = (plist || []).filter(x => x && x.name).map(x => x.name);
      c.style = profile._relStyleOverride || profile.relStyle || null;
      p.partner = c.partners[0] || null;
      p.partner2 = c.partners[1] || null;

      // Kin: kin[n] is what THIS person is to n ("parent" = n is my child).
      // The dead are mourned (_readLife), not visited: they are left out here.
      const kin = rec?.kin || {};
      for (const [n, rel] of Object.entries(kin)) {
        if (recOf(n)?.dead) continue;
        if (rel === 'parent') c.children[stageOf(n)]?.push(n);
        else if (rel === 'child') c.parents.push(n);
        else if (rel === 'sibling') c.siblings.push(n);
      }
      p.childNewborn = c.children.newborn[0] || null;
      p.childKid = c.children.child[0] || null;
      p.childAdult = c.children.adult[0] || null;
      p.parent = c.parents[0] || null;
      p.sibling = c.siblings[0] || null;
      for (const n of Object.keys(kin)) {
        const r = recOf(n);
        if (r && r.refugee && r.refugee.status !== 'returned') { p.kin = n; c.refugeeKin = true; break; } // i18n-ignore: refugee status id
      }

      // Pregnancy, their own or a partner's.
      c.pregnant = !!(rec?.pregnancy && (rec.pregnancy.dueMin ?? Infinity) > now);
      c.partnerPregnant = c.partners.some(n => { const r = recOf(n); return !!(r?.pregnancy && (r.pregnancy.dueMin ?? Infinity) > now); });

      // How long together, and whether the anniversary falls this month.
      const events = Array.isArray(rec?.lifeEvents) ? rec.lifeEvents : [];
      if (p.partner) {
        const ev = events.filter(e => e && e.type === 'relationship' && e.params?.name === p.partner)
          .sort((a, b) => a.minute - b.minute)[0];
        if (ev && Number.isFinite(ev.minute) && now >= ev.minute) {
          const years = Math.floor((now - ev.minute) / MIN_PER_YEAR);
          c.togetherYears = years;
          if (years >= 1 && ((now - ev.minute) % MIN_PER_YEAR) < 30 * MIN_PER_DAY) c.anniversaryYears = years;
          p.years = String(Math.max(1, years));
        }
      }

      // Former partners: a recent breakup, or a death.
      const exes = Array.isArray(rec?.exPartners) ? rec.exPartners : [];
      const lastEx = exes[exes.length - 1] || null;
      const year = LS?.currentYear ? LS.currentYear() : null;
      if (rec?.maritalStatus === 'widowed' || lastEx?.outcome === 'widowed') { // i18n-ignore: marital status id
        const w = exes.slice().reverse().find(e => e && e.outcome === 'widowed') || lastEx; // i18n-ignore: outcome id
        if (w?.name) { c.widowed = true; p.ex = w.name; }
      }
      if (lastEx && lastEx.outcome !== 'widowed' && year != null && (lastEx.toYear ?? -1e9) >= year - 1 && !c.partners.includes(lastEx.name)) { // i18n-ignore: outcome id
        c.recentBreakup = true;
        if (!c.widowed) p.ex = lastEx.name;
      }
      const recentEvent = (pred, days) => events.find(e => e && pred(e) && Number.isFinite(e.minute) && now - e.minute <= days * MIN_PER_DAY && now >= e.minute);
      const moved = recentEvent(e => /movedOut/.test(e.key || ''), 60);
      if (moved) { c.movedOut = true; p.ex = p.ex || moved.params?.name || null; }
      if (recentEvent(e => e.key === 'NPCLife.event.moved', 365)) c.newcomer = true;

      // Trips: a partner away, or on one themselves.
      c.partnerAway = c.partners.some(n => { const t = recOf(n)?.trip; return !!(t && now < (t.homeByMinute ?? 0)); });
      const trip = rec?.trip;
      if (trip && now < (trip.homeByMinute ?? 0)) {
        p.place = trip.to ? String(trip.to) : null;
        if (now < (trip.arrivesAtMinute ?? 0)) c.onRoad = true; else c.away = true;
      }

      // Work.
      const leave = profile.leave && (profile.leave.untilMin ?? Infinity) > now ? profile.leave : null;
      c.leave = leave ? leave.kind : null;
      c.unemployed = stage === 'adult' && profile.currentJobId === 0 && !leave; // i18n-ignore: life stage id
      const log = Array.isArray(profile.eventLog) ? profile.eventLog : [];
      const recentLog = (tag, mins) => log.find(e => e && e.tag === tag && Number.isFinite(e.minute) && now - e.minute <= mins && now >= e.minute);
      const shift = recentLog('work', 180);
      if (shift) { c.afterShift = true; p.job = _tr(shift.params?.job) || null; }
      const game = recentLog('minigame', 180);
      if (game) {
        const k = String(game.key || '');
        c.played = /Won|Beat/.test(k) ? 'won' : /Lost|Beaten/.test(k) ? 'lost' : null; // i18n-ignore: log key fragments
        p.game = _tr(game.params?.game) || null;
      }
      const ate = recentLog('eating', 120);
      if (ate) { c.ate = true; p.item = ate.params?.item || null; }
      const spec = recentLog('spec', MIN_PER_DAY);
      if (spec) {
        c.honed = true;
        const S = window.Specializations;
        p.spec = (S && S.displayName && spec.params?.specId != null) ? (S.displayName(Number(spec.params.specId)) || null) : null;
      }
      c.wanted = (rec?.wantedBounty ?? 0) > 0;

      // Creed being talked round.
      const conv = profile.conversion;
      if (conv && conv.pct >= 30 && conv.toId) {
        c.doubting = true;
        try { p.creed = LS?.creedLabel ? LS.creedLabel(conv.toId) : conv.toId; } catch (_) { p.creed = null; }
      }

      // The Goblin Horde: refugees, the integrated, and those under it.
      const ref = rec?.refugee;
      if (ref && ref.status) { c.refugee = String(ref.status); p.from = ref.from || null; }
      c.integrated = !!profile._hordeIntegrated;

      // Their power and country, and what the chronicle says about both.
      let power = null, country = null;
      try {
        const id = window.NPCPolitics?.getIdentity?.(name);
        if (id) { power = id.power || null; country = id.country || null; }
        if ((!power || !country) && rec?.homeGroup) {
          const pol = window.NPCPolitics?.polityOfGroup?.(rec.homeGroup);
          if (pol) { power = power || pol.power || null; country = country || pol.country || null; }
        }
      } catch (_) {}
      c.power = power; c.country = country;
      p.power = power; p.country = country;
      const world = opts.world || WorldFacts.get();
      const ownWar = power ? world.wars.find(w => _samePower(w.attacker, power) || _samePower(w.defender, power)) : null;
      if (ownWar) {
        c.atWar = true;
        p.enemy = _samePower(ownWar.attacker, power) ? ownWar.defender : ownWar.attacker;
        if (country && Array.isArray(ownWar.goal) && ownWar.goal.includes(country)) c.frontline = true;
        if (_samePower(p.enemy, GOBLIN_HORDE_POWER)) c.hordeNear = true;
      } else if (world.wars.length) {
        const w = world.wars[0];
        c.farWar = true;
        p.power = w.attacker; p.enemy = w.defender;
      }
      const peace = power ? world.recent.find(w => _samePower(w.attacker, power) || _samePower(w.defender, power)) : null;
      if (peace && !ownWar) {
        c.peace = true;
        p.enemy = _samePower(peace.attacker, power) ? peace.defender : peace.attacker;
      }
      if (country && world.hordeHolds.includes(country) && !c.integrated) c.underHorde = true;
      if (world.hordeHolds.length && !c.underHorde && !c.integrated) c.hordeRumour = true;
      if (c.underHorde) p.country = country;

      // How much they want to leave: work, money, war and the Horde.
      if (stage === 'adult' && !c.refugee) { // i18n-ignore: life stage id
        let push = 0;
        if (c.unemployed) push += 2;
        if ((profile.wealthTierBase ?? 2) <= 1) push += 1;
        if (c.atWar) push += 1.5;
        if (c.frontline) push += 1;
        if (c.hordeNear) push += 2;
        if (c.underHorde) push += 2.5;
        c.emigrate = push;
      }
      _readLife(c, { name, profile, rec, now, LS, recOf, events, log, stage, opts });
      return c;
    },

    // What changes by the second rather than the hour: running, lying hurt,
    // a fight nearby, and the election clock of wherever the player stands.
    live(c, profile) {
      if (!c) return c;
      const name = c.name;
      c.fleeing = false; c.witness = false;
      c.downed = !!profile?.downed;
      c.injured = !c.downed && Array.isArray(profile?.injuries) && profile.injuries.length > 0;
      try {
        const ctrls = (typeof $gameSystem !== 'undefined' && $gameSystem?.getActiveNPCControllers?.()) || [];
        const me = ctrls.find(x => x && x.eventName === name);
        if (me) {
          if (me.state === 'fleeing') c.fleeing = true; // i18n-ignore: controller state id
          else if (me.event) {
            c.witness = ctrls.some(o => o && o !== me && o.event && (o.state === 'skirmishing' || o.state === 'downed') && // i18n-ignore: controller state ids
              Math.abs(o.event.x - me.event.x) + Math.abs(o.event.y - me.event.y) <= 8);
          }
        }
      } catch (_) {}
      const el = ElectionClock.current(profile);
      c.election = el;
      if (el) {
        const p = c.params;
        p.party = el.party; p.rival = el.rival; p.winner = el.winner; p.election = el.election;
        p.days = el.daysTo != null ? String(el.daysTo) : null;
      }
      return c;
    },
  };

  // --- The topics ---------------------------------------------------------
  // key: the pool in ConvLife.thought; frame: the creed frame it takes (II.9);
  // w(c): its weight, 0 when it does not apply; map: which param fills {child}.
  const _adult = (c) => c.stage === 'adult'; // i18n-ignore: life stage id
  const LIFE_TOPICS = [
    { key: 'fightFleeing',        frame: null,        w: c => c.fleeing ? 40 : 0 },
    { key: 'fightDowned',         frame: null,        w: c => c.downed ? 40 : 0 },
    { key: 'fightInjured',        frame: null,        w: c => c.injured ? 3 : 0 },
    { key: 'fightWitness',        frame: null,        w: c => c.witness ? 4 : 0 },
    { key: 'kidChild',            frame: null,        w: c => c.stage === 'child' ? 6 : 0 }, // i18n-ignore: life stage id
    { key: 'familyPoly',          frame: 'family',    w: c => _adult(c) && c.partners.length >= 2 ? 2 : 0 },
    { key: 'familyLongDistance',  frame: 'family',    w: c => _adult(c) && c.partners.length === 1 && c.style === 'long-distance' ? 2 : 0 }, // i18n-ignore: style id
    { key: 'familyPartner',       frame: 'family',    w: c => _adult(c) && c.partners.length === 1 && c.style !== 'long-distance' ? 1.5 : 0 }, // i18n-ignore: style id
    { key: 'familyAnniversary',   frame: 'family',    w: c => _adult(c) && c.anniversaryYears ? 4 : 0 },
    { key: 'familyPregnant',      frame: 'family',    w: c => c.pregnant ? 5 : 0 },
    { key: 'familyPartnerPregnant', frame: 'family',  w: c => !c.pregnant && c.partnerPregnant ? 4 : 0 },
    { key: 'familyNewborn',       frame: 'family',    w: c => _adult(c) && c.children.newborn.length ? 4 : 0, map: { child: 'childNewborn' } },
    { key: 'familyChildren',      frame: 'family',    w: c => _adult(c) && c.children.child.length ? 2 : 0, map: { child: 'childKid' } },
    { key: 'familyAdultChild',    frame: 'family',    w: c => _adult(c) && c.children.adult.length ? 0.8 : 0, map: { child: 'childAdult' } },
    { key: 'familyParents',       frame: 'family',    w: c => _adult(c) && c.parents.length ? 0.8 : 0 },
    { key: 'familySiblings',      frame: 'family',    w: c => _adult(c) && c.siblings.length ? 0.6 : 0 },
    { key: 'familyBreakup',       frame: 'family',    w: c => c.recentBreakup && !c.movedOut ? 3 : 0 },
    { key: 'familyWidowed',       frame: 'family',    w: c => c.widowed ? 2 : 0 },
    { key: 'familyMovedOut',      frame: 'family',    w: c => c.movedOut ? 3 : 0 },
    { key: 'familyPartnerAway',   frame: 'family',    w: c => c.partnerAway ? 3 : 0 },
    { key: 'familyParentalLeave', frame: 'family',    w: c => c.leave === 'parental' ? 4 : 0, map: { child: 'childNewborn' } }, // i18n-ignore: leave kind id
    { key: 'familyRefugeeKin',    frame: 'goblins',   w: c => _adult(c) && c.refugeeKin ? 2.5 : 0 },
    { key: 'workSick',            frame: 'work',      w: c => c.leave === 'sick' ? 4 : 0 }, // i18n-ignore: leave kind id
    { key: 'workUnemployed',      frame: 'work',      w: c => c.unemployed ? 3 : 0 },
    { key: 'workAfterShift',      frame: 'work',      w: c => c.afterShift ? 1.5 : 0 },
    { key: 'travelOnRoad',        frame: null,        w: c => c.onRoad ? 3 : 0 },
    { key: 'travelAway',          frame: null,        w: c => c.away ? 3 : 0 },
    { key: 'travelEmigrate',      frame: 'money',     w: c => (c.emigrate ?? 0) >= 2 ? c.emigrate : 0 },
    { key: 'travelNewcomer',      frame: null,        w: c => c.newcomer && !c.refugee ? 2 : 0 },
    { key: 'warFront',            frame: 'war',       w: c => _adult(c) && c.frontline ? 4 : 0 },
    { key: 'warOurs',             frame: 'war',       w: c => _adult(c) && c.atWar && !c.frontline ? 3 : 0 },
    { key: 'warFar',              frame: 'war',       w: c => _adult(c) && c.farWar ? 0.8 : 0 },
    { key: 'warPeace',            frame: 'war',       w: c => _adult(c) && c.peace ? 2.5 : 0 },
    { key: 'hordeFleeing',        frame: 'goblins',   w: c => c.refugee === 'fleeing' ? 6 : 0 }, // i18n-ignore: refugee status ids
    { key: 'hordeCamp',           frame: 'goblins',   w: c => c.refugee === 'camp' ? 5 : 0 },
    { key: 'hordeSettled',        frame: 'goblins',   w: c => c.refugee === 'settled' ? 3 : 0 },
    { key: 'hordeReturned',       frame: 'goblins',   w: c => c.refugee === 'returned' ? 3 : 0 },
    { key: 'hordeIntegrated',     frame: 'goblins',   w: c => c.integrated ? 4 : 0 },
    { key: 'hordeUnder',          frame: 'goblins',   w: c => c.underHorde ? 4 : 0 },
    { key: 'hordeFear',           frame: 'goblins',   w: c => _adult(c) && !c.refugee && c.hordeNear ? 3 : (_adult(c) && !c.refugee && c.hordeRumour ? 0.4 : 0) },
    { key: 'playWon',             frame: 'money',     w: c => c.played === 'won' ? 3 : 0 },
    { key: 'playLost',            frame: 'money',     w: c => c.played === 'lost' ? 3 : 0 },
    { key: 'crimeWanted',         frame: null,        w: c => c.wanted ? 1 : 0 },
    { key: 'foodAte',             frame: null,        w: c => c.ate ? 1.5 : 0 },
    { key: 'specHoned',           frame: 'work',      w: c => c.honed ? 2 : 0 },
    { key: 'creedDoubt',          frame: 'politics',  w: c => _adult(c) && c.doubting ? 2 : 0 },
    { key: 'electionDay',         frame: 'elections', w: c => _adult(c) && c.election?.daysTo === 0 ? 8 : 0 },
    { key: 'electionWeek',        frame: 'elections', w: c => _adult(c) && c.election && c.election.daysTo >= 1 && c.election.daysTo <= 7 ? c.election.weight : 0 },
    { key: 'electionSoon',        frame: 'elections', w: c => _adult(c) && c.election && c.election.daysTo > 7 && c.election.daysTo <= 30 ? c.election.weight : 0 },
    { key: 'electionResult',      frame: 'elections', w: c => _adult(c) && c.election && c.election.daysSince != null && c.election.daysSince <= 7 && c.election.winner && !(c.election.daysTo <= 7) ? 4 : 0 },
    // The rest of a life (_readLife). Standing facts (a trade they love, a
    // bike, a friend) weigh little, so they colour a day rather than fill it;
    // fresh news (a new job, a birthday, home from the Tower) weighs a lot.
    { key: 'workGoing',           frame: 'work',      w: c => c.employed && c.workSoon && !c.holidayToday ? 1.5 : 0 },
    { key: 'workNight',           frame: 'work',      w: c => c.employed && c.nightShift ? 0.5 : 0 },
    { key: 'workLoves',           frame: 'work',      w: c => c.employed && c.workTaste === 'love' ? 0.5 : 0 }, // i18n-ignore: taste id
    { key: 'workHates',           frame: 'work',      w: c => c.employed && c.workTaste === 'hate' ? 0.5 : 0 }, // i18n-ignore: taste id
    { key: 'workNewJob',          frame: 'work',      w: c => c.newJob && !c.unemployed ? 3 : 0 },
    { key: 'workRetired',         frame: 'work',      w: c => c.retired ? 1.2 : 0 },
    { key: 'workHoliday',         frame: 'work',      w: c => c.holidayShift ? 3 : 0 },
    { key: 'homeHomeless',        frame: 'money',     w: c => c.homeless ? 3 : 0 },
    { key: 'homeMovedWork',       frame: 'work',      w: c => c.moveReason === 'Work' ? 2 : 0 },    // i18n-ignore: move pool id
    { key: 'homeMovedLove',       frame: 'family',    w: c => c.moveReason === 'Love' ? 2 : 0 },    // i18n-ignore: move pool id
    { key: 'homeMovedTrouble',    frame: null,        w: c => c.moveReason === 'Trouble' ? 2 : 0 }, // i18n-ignore: move pool id
    { key: 'homeMovedFresh',      frame: null,        w: c => c.moveReason === 'Fresh' ? 2 : 0 },   // i18n-ignore: move pool id
    { key: 'homePride',           frame: 'money',     w: c => c.homePride ? 0.4 : 0 },
    { key: 'homeWorry',           frame: 'money',     w: c => c.homeWorry ? 0.5 : 0 },
    { key: 'rootsHomesick',       frame: null,        w: c => c.homesick ? 0.5 : 0 },
    { key: 'rootsLocal',          frame: null,        w: c => c.rootsLocal ? 0.3 : 0 },
    { key: 'healthIll',           frame: null,        w: c => c.ill && c.leave !== 'sick' ? 3 : 0 }, // i18n-ignore: leave kind id
    { key: 'healthChronic',       frame: null,        w: c => c.chronic ? 0.7 : 0 },
    { key: 'healthRecovered',     frame: null,        w: c => c.recovered ? 2.5 : 0 },
    { key: 'implantNew',          frame: null,        w: c => c.newImplant ? 3 : 0 },
    { key: 'implantProud',        frame: null,        w: c => c.hasImplant ? 0.4 : 0 },
    { key: 'levelUp',             frame: 'work',      w: c => c.levelUp ? 2.5 : 0 },
    { key: 'bandSoon',            frame: null,        w: c => c.bandSoon ? 4 : 0 },
    { key: 'bandAway',            frame: null,        w: c => c.bandAway ? 3 : 0 },
    { key: 'bandBack',            frame: null,        w: c => c.bandBack === 'plain' ? 4 : 0 }, // i18n-ignore: band outcome ids
    { key: 'bandBackHurt',        frame: null,        w: c => c.bandBack === 'hurt' ? 4 : 0 },
    { key: 'bandBackRich',        frame: 'money',     w: c => c.bandBack === 'rich' ? 4 : 0 },
    { key: 'birthdayToday',       frame: null,        w: c => _adult(c) && c.birthdayToday ? 8 : 0 },
    { key: 'birthdaySoon',        frame: null,        w: c => _adult(c) && c.birthdaySoon ? 1.5 : 0 },
    { key: 'birthdayKin',         frame: 'family',    w: c => c.kinBirthday && !c.birthdayToday ? 3 : 0 },
    { key: 'holidayToday',        frame: null,        w: c => _adult(c) && c.holidayToday && !c.holidayShift ? 3 : 0 },
    { key: 'holidaySoon',         frame: null,        w: c => _adult(c) && c.holidaySoon ? 1.2 : 0 },
    { key: 'weekendOff',          frame: null,        w: c => c.weekendOff ? 0.6 : 0 },
    { key: 'weekendWork',         frame: 'work',      w: c => c.weekendWork ? 0.6 : 0 },
    { key: 'moneyStocksWon',      frame: 'money',     w: c => c.stocksWon ? 3 : 0 },
    { key: 'moneyStocksLost',     frame: 'money',     w: c => c.stocksLost ? 3 : 0 },
    { key: 'moneyShares',         frame: 'money',     w: c => c.stocksBought ? 2 : (c.shareholder ? 0.4 : 0) },
    { key: 'moneyLoan',           frame: 'money',     w: c => c.loan ? 2.5 : 0 },
    { key: 'moneySaved',          frame: 'money',     w: c => c.saved ? 1.5 : 0 },
    { key: 'moneyRent',           frame: 'money',     w: c => c.rentIncome ? 2 : 0 },
    { key: 'moneySaving',         frame: 'money',     w: c => c.saving ? 0.3 : 0 },
    { key: 'moneyBought',         frame: 'money',     w: c => c.bought ? 1.5 : 0 },
    { key: 'crimeReleased',       frame: null,        w: c => c.released ? 3 : 0 },
    { key: 'crimeReformed',       frame: null,        w: c => c.reformed ? 0.3 : 0 },
    { key: 'vehicleBike',         frame: null,        w: c => c.vehicle === 'bike' ? 0.3 : 0 },  // i18n-ignore: vehicle ids
    { key: 'vehicleBroom',        frame: null,        w: c => c.vehicle === 'broom' ? 0.3 : 0 },
    { key: 'vehicleCar',          frame: 'money',     w: c => c.vehicle === 'car' ? 0.3 : 0 },
    { key: 'friendBest',          frame: null,        w: c => c.friend ? 0.5 : 0 },
    { key: 'friendRival',         frame: null,        w: c => c.foe ? 0.5 : 0 },
    { key: 'familyLostParent',    frame: 'family',    w: c => c.lostParent ? 2.5 : 0, map: { lost: 'lostParent' } },
    { key: 'familyLostChild',     frame: 'family',    w: c => c.lostChild ? 3 : 0, map: { lost: 'lostChild' } },
    { key: 'familyGrandchildren', frame: 'family',    w: c => c.grandkids ? 0.6 : 0 },
  ];

  // Face-to-face scripts one of the two can open about their own life (the
  // teller is speaker 0; the other asks and listens). Tone decides what the
  // exchange does to the two of them, as for any other script.
  const LIFE_SCRIPT_TOPICS = [
    { key: 'aboutPoly',          tone: 'positive', frame: 'family',    w: c => _adult(c) && c.partners.length >= 2 ? 2 : 0 },
    { key: 'aboutPartner',       tone: 'positive', frame: 'family',    w: c => _adult(c) && c.partners.length === 1 ? 1.5 : 0 },
    { key: 'aboutChildren',      tone: 'positive', frame: 'family',    w: c => _adult(c) && c.children.child.length ? 2 : 0, map: { child: 'childKid' } },
    { key: 'aboutNewborn',       tone: 'positive', frame: 'family',    w: c => _adult(c) && c.children.newborn.length ? 3 : 0, map: { child: 'childNewborn' } },
    { key: 'aboutPregnancy',     tone: 'positive', frame: 'family',    w: c => c.pregnant || c.partnerPregnant ? 3 : 0 },
    { key: 'aboutBreakup',       tone: 'neutral',  frame: 'family',    w: c => c.recentBreakup && !c.movedOut ? 2.5 : 0 },
    { key: 'aboutWidowed',       tone: 'neutral',  frame: 'family',    w: c => c.widowed ? 1.5 : 0 },
    { key: 'aboutParents',       tone: 'neutral',  frame: 'family',    w: c => _adult(c) && c.parents.length ? 0.8 : 0 },
    { key: 'aboutSiblings',      tone: 'neutral',  frame: 'family',    w: c => _adult(c) && c.siblings.length ? 0.6 : 0 },
    { key: 'aboutPartnerAway',   tone: 'neutral',  frame: 'family',    w: c => c.partnerAway ? 2.5 : 0 },
    { key: 'aboutRefugeeKin',    tone: 'neutral',  frame: 'goblins',   w: c => _adult(c) && c.refugeeKin ? 2 : 0 },
    { key: 'aboutMovedOut',      tone: 'neutral',  frame: 'family',    w: c => c.movedOut ? 2.5 : 0 },
    { key: 'topicWarFront',      tone: 'neutral',  frame: 'war',       w: c => _adult(c) && c.frontline ? 3 : 0 },
    { key: 'topicWar',           tone: 'neutral',  frame: 'war',       w: c => _adult(c) && c.atWar && !c.frontline ? 2 : 0 },
    { key: 'topicElectionDay',   tone: 'neutral',  frame: 'elections', w: c => _adult(c) && c.election?.daysTo === 0 ? 6 : 0 },
    { key: 'topicElection',      tone: 'neutral',  frame: 'elections', w: c => _adult(c) && c.election && c.election.daysTo >= 1 && c.election.daysTo <= 30 ? c.election.weight : 0 },
    { key: 'topicElectionResult', tone: 'neutral', frame: 'elections', w: c => _adult(c) && c.election && c.election.daysSince != null && c.election.daysSince <= 7 && c.election.winner ? 3 : 0 },
    { key: 'topicUnemployed',    tone: 'neutral',  frame: 'work',      w: c => c.unemployed ? 2 : 0 },
    { key: 'topicEmigrate',      tone: 'neutral',  frame: 'money',     w: c => (c.emigrate ?? 0) >= 2 ? c.emigrate * 0.8 : 0 },
    { key: 'topicRefugee',       tone: 'neutral',  frame: 'goblins',   w: c => c.refugee && c.refugee !== 'returned' ? 3 : 0 }, // i18n-ignore: refugee status id
    { key: 'topicIntegrated',    tone: 'neutral',  frame: 'goblins',   w: c => c.integrated ? 3 : 0 },
    { key: 'topicHordeFear',     tone: 'neutral',  frame: 'goblins',   w: c => _adult(c) && !c.refugee && (c.hordeNear || c.underHorde) ? 2.5 : 0 },
    { key: 'topicTrip',          tone: 'positive', frame: null,        w: c => c.away || c.onRoad ? 1.5 : 0 },
    { key: 'topicNewcomer',      tone: 'positive', frame: null,        w: c => c.newcomer && !c.refugee ? 1.5 : 0 },
    { key: 'topicMinigame',      tone: 'positive', frame: 'money',     w: c => c.played ? 1.5 : 0 },
    { key: 'topicFight',         tone: 'neutral',  frame: null,        w: c => c.injured || c.witness ? 2 : 0 },
    { key: 'topicSick',          tone: 'positive', frame: 'work',      w: c => c.leave === 'sick' ? 2.5 : 0 }, // i18n-ignore: leave kind id
    { key: 'topicParentalLeave', tone: 'positive', frame: 'family',    w: c => c.leave === 'parental' ? 2.5 : 0 }, // i18n-ignore: leave kind id
    { key: 'topicConversion',    tone: 'neutral',  frame: 'politics',  w: c => _adult(c) && c.doubting ? 1.5 : 0 },
    { key: 'talkJob',            tone: 'neutral',  frame: 'work',      w: c => c.employed ? 0.6 : 0 },
    { key: 'talkNewJob',         tone: 'positive', frame: 'work',      w: c => c.newJob && !c.unemployed ? 2.5 : 0 },
    { key: 'talkRetired',        tone: 'positive', frame: 'work',      w: c => c.retired ? 1 : 0 },
    { key: 'talkHomeless',       tone: 'neutral',  frame: 'money',     w: c => c.homeless ? 2 : 0 },
    { key: 'talkHomesick',       tone: 'neutral',  frame: null,        w: c => c.homesick ? 0.5 : 0 },
    { key: 'talkIll',            tone: 'neutral',  frame: null,        w: c => c.ill && c.leave !== 'sick' ? 2 : 0 }, // i18n-ignore: leave kind id
    { key: 'talkRecovered',      tone: 'positive', frame: null,        w: c => c.recovered ? 2 : 0 },
    { key: 'talkChronic',        tone: 'neutral',  frame: null,        w: c => c.chronic ? 0.5 : 0 },
    { key: 'talkImplant',        tone: 'neutral',  frame: null,        w: c => c.newImplant ? 2.5 : (c.hasImplant ? 0.3 : 0) },
    { key: 'talkLevelUp',        tone: 'positive', frame: 'work',      w: c => c.levelUp ? 2 : 0 },
    { key: 'talkBandSoon',       tone: 'neutral',  frame: null,        w: c => c.bandSoon ? 3 : 0 },
    { key: 'talkBandBack',       tone: 'positive', frame: null,        w: c => c.bandBack ? 3 : 0 },
    { key: 'talkBirthday',       tone: 'positive', frame: null,        w: c => _adult(c) && c.birthdayToday ? 6 : 0 },
    { key: 'talkHoliday',        tone: 'positive', frame: null,        w: c => _adult(c) && (c.holidayToday || c.holidaySoon) ? 1.5 : 0 },
    { key: 'talkWeekend',        tone: 'positive', frame: null,        w: c => c.weekendOff || c.weekendWork ? 0.5 : 0 },
    { key: 'talkStocks',         tone: 'neutral',  frame: 'money',     w: c => c.stocksWon || c.stocksLost || c.stocksBought ? 2 : 0 },
    { key: 'talkLoan',           tone: 'neutral',  frame: 'money',     w: c => c.loan ? 2 : 0 },
    { key: 'talkReleased',       tone: 'neutral',  frame: null,        w: c => c.released ? 2.5 : 0 },
    { key: 'talkVehicle',        tone: 'positive', frame: null,        w: c => c.vehicle ? 0.3 : 0 },
    { key: 'talkFriend',         tone: 'positive', frame: null,        w: c => c.friend ? 0.4 : 0 },
    { key: 'talkRival',          tone: 'neutral',  frame: null,        w: c => c.foe ? 0.4 : 0 },
    { key: 'talkGriefParent',    tone: 'neutral',  frame: 'family',    w: c => c.lostParent ? 2 : 0, map: { lost: 'lostParent' } },
    { key: 'talkGriefChild',     tone: 'neutral',  frame: 'family',    w: c => c.lostChild ? 2.5 : 0, map: { lost: 'lostChild' } },
    { key: 'talkGrandchildren',  tone: 'positive', frame: 'family',    w: c => c.grandkids ? 0.5 : 0 },
  ];

  // The tone of each family exchange (between two relatives).
  const KIN_SCRIPT_TONE = {
    kinPartners: 'positive', kinPartnersFight: 'negative', kinPartnersMakeUp: 'positive',
    kinAnniversary: 'positive', kinPregnancy: 'positive', kinParentChild: 'positive',
    kinParentChildScold: 'negative', kinParentAdultChild: 'neutral', kinSiblings: 'neutral',
    kinSiblingsSpat: 'negative', kinNewborn: 'positive', kidStranger: 'neutral', kidPlay: 'positive',
  };

  // The creed frame a non-family mention to the party takes (familyMention);
  // anything not listed is family talk.
  const MENTION_FRAME = { // i18n-ignore-start: mention keys and frame ids
    job: 'work', newJob: 'work', retired: 'work', levelUp: 'work', homeless: 'money', stocks: 'money',
    homesick: 'flavour', ill: 'flavour', chronic: 'flavour', recovered: 'flavour', implant: 'flavour',
    bandSoon: 'flavour', bandBack: 'flavour', birthday: 'flavour', holiday: 'flavour', released: 'flavour',
    vehicle: 'flavour', friend: 'flavour',
  }; // i18n-ignore-end

  const LIFE_THOUGHT_CAP   = 0.6;   // most a life topic can crowd out everything else
  const LIFE_THOUGHT_SCALE = 0.07;  // chance per unit of topic weight
  const LIFE_SCRIPT_CAP    = 0.55;
  const LIFE_SCRIPT_SCALE  = 0.06;
  const KIN_SCRIPT_CHANCE  = 0.75;  // relatives meeting talk family this often
  const LIFE_AMBIENT_CHANCE = 0.5;

  function _weighted(list) {
    let total = 0;
    for (const t of list) total += t.weight;
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const t of list) { roll -= t.weight; if (roll <= 0) return t; }
    return list[list.length - 1];
  }

  // Fills {placeholder}s the context knows, and the fallback words for the
  // ones it does not. {a}, {b} and {name} are left for the speaker layer.
  function _lifeFill(text, params, map) {
    const fb = LIFE_FALLBACK();
    return String(text).replace(/\{([a-zA-Z0-9]+)\}/g, (m, key) => {
      if (key === 'a' || key === 'b' || key === 'name') return m;
      const src = map && map[key] ? map[key] : key;
      const v = params ? params[src] : null;
      if (v != null && v !== '') return String(v);
      if (key === 'partner2') return fb.partner ?? m;
      return fb[key] ?? m;
    });
  }

  // --- The creed voice (II.9) ---------------------------------------------
  // An NPC's creed frames what they say, on top of their personality voice
  // (applyVoice) and never instead of it. 238 creeds are folded into a dozen
  // families by their five axes; a few creeds keep a bank of their own.
  // Em and Bubba speak as themselves: no creed ever colours their lines.
  const CREED_FAMILIES = ['left', 'centreLeft', 'centre', 'right', 'nationalist', 'theocratic',
    'monarchist', 'anarchist', 'militarist', 'mystic', 'horde', 'alien']; // i18n-ignore: bank keys
  const CREED_SPECIALS = ['juche', 'orthodox_communist', 'kemalist', 'pacifist_theocratic',
    'trolling_humans', 'human_adoration_doctrine', 'goblin_evangelism']; // i18n-ignore: Ideology.json ids
  const CREED_FAMILY_OVERRIDES = { // i18n-ignore-start: Ideology.json ids and bank keys
    rowdy_horde: 'horde', goblin_evangelism: 'horde', violent_marauders: 'horde',
    songun_militarism: 'militarist', jaguar_militarism: 'militarist', military_nationalist: 'militarist',
    military_secularist: 'militarist', void_marauder_creed: 'alien',
    pacifist_humanitarian: 'centreLeft', militant_pacifism: 'anarchist',
  }; // i18n-ignore-end
  const MONARCHY_RE = /monarch|sultan|crown_|mandate_of_heaven|divine_sovereign|petrocratic_absolutism/; // i18n-ignore: Ideology.json id fragments
  const CREED_FRAME_TOPICS = ['flavour', 'politics', 'work', 'war', 'family', 'goblins', 'money', 'elections']; // i18n-ignore: bank keys

  const CreedVoice = {
    FAMILIES: CREED_FAMILIES,
    SPECIALS: CREED_SPECIALS,
    TOPICS: CREED_FRAME_TOPICS,
    _famCache: new Map(),

    familyOfCreed(creed) {
      if (!creed) return 'centre';
      const id = String(creed.id || '');
      if (creed.alien) return 'alien';
      if (CREED_FAMILY_OVERRIDES[id]) return CREED_FAMILY_OVERRIDES[id];
      if (MONARCHY_RE.test(id)) return 'monarchist';
      const ax = Object.assign({ econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 }, creed.axes || {});
      if (ax.auth <= -55) return 'anarchist';
      if (ax.myst >= 60 && ax.trad >= 40) return 'theocratic';
      if (ax.myst >= 60) return 'mystic';
      if (ax.auth >= 60 && ax.econ > -60 && (ax.mil >= 40 || ax.trad >= 40)) return 'nationalist';
      if (ax.econ <= -60) return 'left';
      if (ax.mil >= 70) return 'militarist';
      if (ax.econ <= -15) return 'centreLeft';
      if (ax.econ >= 15 || ax.trad >= 30) return 'right';
      return 'centre';
    },

    // The family an ideology id belongs to, cached.
    ideologyFamily(id) {
      if (!id) return null;
      if (this._famCache.has(id)) return this._famCache.get(id);
      const creed = window.NPCShared?.ideologyById?.(id)
        || (Array.isArray(window.WorldGen?.Ideology) ? window.WorldGen.Ideology.find(i => i && i.id === id) : null);
      const fam = creed ? this.familyOfCreed(creed) : null;
      this._famCache.set(id, fam);
      return fam;
    },

    creedIdOf(profile) {
      if (!profile) return null;
      if (profile.ideologyId) return profile.ideologyId;
      try { return window.NPCShared?.ideologyFor?.(profile)?.id ?? null; } catch (_) { return null; }
    },

    // Em and Bubba are never framed by a creed, nor are children and beasts.
    exempt(profile, name) {
      const n = String(name || profile?._eventName || '').trim().toLowerCase();
      if (IDEOLOGY_EXEMPT_NAMES.has(n)) return true;
      if (!profile) return true;
      if (profile.lifeStage && profile.lifeStage !== 'adult') return true; // i18n-ignore: life stage id
      if (_isNonSentientProfile(profile)) return true;
      return false;
    },

    // { kind: 'special' | 'family', key, bank } for a profile, or null.
    bankOf(profile, name) {
      if (this.exempt(profile, name)) return null;
      const id = this.creedIdOf(profile);
      if (!id) return null;
      const specials = CREED_SPECIAL_BANKS();
      if (CREED_SPECIALS.includes(id) && specials[id]) return { kind: 'special', key: id, bank: specials[id] };
      const fam = this.ideologyFamily(id);
      const bank = fam ? CREED_FAMILY_BANKS()[fam] : null;
      return bank ? { kind: 'family', key: fam, bank } : null;
    },

    // One framing line on `topic`, filled and phrased in the speaker's lexicon.
    frame(profile, topic, params, name) {
      const b = this.bankOf(profile, name);
      if (!b) return null;
      const pool = (topic && Array.isArray(b.bank[topic]) && b.bank[topic].length) ? b.bank[topic] : b.bank.flavour;
      if (!Array.isArray(pool) || !pool.length) return null;
      return vary(_lifeFill(_pickFrom(pool), params || {}), _personalityNameOf(profile));
    },

    decorate(line, profile, topic, chance, params, name) {
      if (!line || String(line).startsWith('*')) return line;
      if (Math.random() >= chance) return line;
      const extra = this.frame(profile, topic, params, name);
      return extra ? `${line} ${extra}` : line;
    },
  };

  const LifeTalk = {
    topicsFor(c, table = LIFE_TOPICS) {
      const out = [];
      if (!c || c.nonSentient) return out;
      if (c.stage === 'newborn') return out; // i18n-ignore: life stage id
      for (const t of table) {
        // A child's world is small: its own lines and the fights around it.
        if (c.stage === 'child' && !/^(kid|fight)/.test(t.key)) continue; // i18n-ignore: life stage id
        let w = 0;
        try { w = t.w(c) || 0; } catch (_) { w = 0; }
        if (w > 0) out.push({ key: t.key, frame: t.frame, tone: t.tone, map: t.map, weight: w });
      }
      return out;
    },

    _context(profile, name) {
      const c = LifeContext.of(profile, name);
      return c ? LifeContext.live(c, profile) : null;
    },

    isNewborn(profile) { return profile?.lifeStage === 'newborn'; }, // i18n-ignore: life stage id
    isChild(profile) { return profile?.lifeStage === 'child'; },     // i18n-ignore: life stage id

    lineFor(key, c, profile, map) {
      const pool = LIFE_THOUGHTS()[key];
      if (!Array.isArray(pool) || !pool.length) return null;
      const persName = _personalityNameOf(profile);
      const raw = _lifeFill(_pickFrom(pool), c?.params || {}, map);
      // A child speaks plainly; the personality voice is for grown-ups.
      return (key.startsWith('kid')) ? vary(raw, persName) : applyVoice(raw, persName);
    },

    // A solo thought on the most relevant topic, or null when nothing in
    // their life asks to be said (the ordinary pools speak instead).
    pickThought(profile) {
      if (!profile || _isNonSentientProfile(profile)) return null;
      if (this.isNewborn(profile)) return this.lineFor('kidNewborn', null, profile);
      const c = this._context(profile);
      if (!c) return null;
      const topics = this.topicsFor(c);
      if (!topics.length) return null;
      let total = 0;
      for (const t of topics) total += t.weight;
      const chance = (c.fleeing || c.downed) ? 0.95 : Math.min(LIFE_THOUGHT_CAP, total * LIFE_THOUGHT_SCALE);
      if (Math.random() >= chance) return null;
      const t = _weighted(topics);
      if (!t) return null;
      const line = this.lineFor(t.key, c, profile, t.map);
      return t.frame ? CreedVoice.decorate(line, profile, t.frame, CREED_CHANCE_THOUGHT, c.params) : line;
    },

    // A thought on one named topic (an event just happened to them).
    pickTopicThought(profile, key) {
      if (!profile || _isNonSentientProfile(profile)) return null;
      const c = this._context(profile);
      const t = LIFE_TOPICS.find(x => x.key === key);
      const line = this.lineFor(key, c, profile, t?.map);
      return (line && t?.frame) ? CreedVoice.decorate(line, profile, t.frame, CREED_CHANCE_THOUGHT, c?.params) : line;
    },

    // What two relatives are to each other: 'partner', 'parent' (a is b's
    // parent), 'child' (a is b's child), 'sibling', or null.
    kinRelation(aName, bName) {
      const LS = window.NPCLifeSim;
      const recA = LS?.getRecord?.(aName);
      const partners = LS?.partnersOf ? LS.partnersOf(recA) : (recA?.partner ? [recA.partner] : []);
      if ((partners || []).some(p => p && p.name === bName)) return 'partner';
      const rel = recA?.kin?.[bName];
      if (rel === 'parent' || rel === 'child' || rel === 'sibling') return rel;
      return null;
    },

    _script(key, swap, params, map) {
      const pool = LIFE_SCRIPTS()[key];
      if (!Array.isArray(pool) || !pool.length) return null;
      const lines = _pickFrom(pool);
      if (!Array.isArray(lines)) return null;
      // Swapping who speaks swaps who is addressed too: {a} is always the
      // conversation's first participant, whoever opens the script.
      const flip = (s) => String(s).replace(/\{[ab]\}/g, m => (m === '{a}' ? '{b}' : '{a}'));
      return lines.map(([who, text]) => [swap ? 1 - who : who, _lifeFill(swap ? flip(text) : text, params || {}, map)]);
    },

    // A script for these two about their lives, or null for the ordinary
    // tone-weighted pools. Relatives mostly talk family; children talk like
    // children; anybody else talks about whatever is pressing in either life.
    pickScript(profA, profB, aName, bName) {
      if (!profA || !profB) return null;
      if (_isNonSentientProfile(profA) || _isNonSentientProfile(profB)) return null;
      const stA = profA.lifeStage || 'adult', stB = profB.lifeStage || 'adult'; // i18n-ignore: life stage id
      const rel = this.kinRelation(aName, bName);
      const make = (key, swap, params, tone, frame, map) => {
        const lines = this._script(key, swap, params, map);
        if (!lines) return null;
        const t = tone || KIN_SCRIPT_TONE[key] || 'neutral';
        return { kind: t, lines, agreement: t !== 'negative', frame: frame || 'family', topic: key };
      };
      // A newborn is held and talked to, whoever is holding them.
      if (stA === 'newborn' || stB === 'newborn') { // i18n-ignore: life stage id
        if (stA === 'newborn' && stB === 'newborn') return null; // i18n-ignore: life stage id
        return make('kinNewborn', stA === 'newborn', {}); // i18n-ignore: life stage id
      }
      const kidA = stA === 'child', kidB = stB === 'child'; // i18n-ignore: life stage id
      // A child with a relative always talks as family; grown-up relatives
      // mostly do, and now and then talk about anything else.
      if (rel && (kidA || kidB || Math.random() < KIN_SCRIPT_CHANCE)) {
        const cA = this._context(profA, aName), cB = this._context(profB, bName);
        const params = Object.assign({}, cA?.params, { years: cA?.params?.years });
        if (rel === 'partner') {
          const op = profA.relationships?.[bName]?.opinion ?? 0;
          const opts = [
            { key: 'kinPartners', weight: 3 },
            { key: 'kinPartnersFight', weight: op < 0 ? 4 : 0.5 },
            { key: 'kinPartnersMakeUp', weight: op < 20 ? 1.5 : 0.5 },
            { key: 'kinAnniversary', weight: cA?.anniversaryYears ? 5 : 0 },
            { key: 'kinPregnancy', weight: (cA?.pregnant || cB?.pregnant) ? 4 : 0 },
          ];
          const pick = _weighted(opts);
          // The one expecting is always the one asked how they feel.
          const swap = pick.key === 'kinPregnancy' && !!cA?.pregnant;
          return make(pick.key, swap, params);
        }
        if (rel === 'parent' || rel === 'child') {
          const parentIsA = rel === 'parent';
          const kid = parentIsA ? kidB : kidA;
          const swap = !parentIsA;
          const opts = kid
            ? [{ key: 'kinParentChild', weight: 3 }, { key: 'kinParentChildScold', weight: 1 }]
            : [{ key: 'kinParentAdultChild', weight: 1 }];
          return make(_weighted(opts).key, swap, params);
        }
        if (rel === 'sibling') {
          const opts = [{ key: 'kinSiblings', weight: 3 }, { key: 'kinSiblingsSpat', weight: kidA && kidB ? 3 : 1 }];
          return make(_weighted(opts).key, false, params);
        }
      }
      if (kidA && kidB) return make('kidPlay', false, {});
      if (kidA || kidB) return make('kidStranger', kidA, {});

      // Two grown-ups: whatever is pressing in either life, told by its owner.
      const cA = this._context(profA, aName), cB = this._context(profB, bName);
      const cands = [];
      for (const [c, swap] of [[cA, false], [cB, true]]) {
        for (const t of this.topicsFor(c, LIFE_SCRIPT_TOPICS)) cands.push(Object.assign(t, { swap, params: c.params }));
      }
      if (!cands.length) return null;
      let total = 0;
      for (const t of cands) total += t.weight;
      if (Math.random() >= Math.min(LIFE_SCRIPT_CAP, total * LIFE_SCRIPT_SCALE)) return null;
      const t = _weighted(cands);
      return t ? make(t.key, t.swap, t.params, t.tone, t.frame || 'flavour', t.map) : null;
    },

    // A two-line exchange traded in passing, on a topic of the first speaker's.
    pickAmbient(profA, profB, aName, bName) {
      if (!profA || !profB || _isNonSentientProfile(profA) || _isNonSentientProfile(profB)) return null;
      const stA = profA.lifeStage || 'adult', stB = profB.lifeStage || 'adult'; // i18n-ignore: life stage id
      if (stA === 'newborn' || stB === 'newborn') return null; // i18n-ignore: life stage id
      const opts = [];
      if (stA === 'child' && stB === 'child') opts.push({ key: 'kids', weight: 4 }); // i18n-ignore: life stage id
      else if (stA === 'child' || stB === 'child') return null; // i18n-ignore: life stage id
      const c = stA === 'adult' ? this._context(profA, aName) : null; // i18n-ignore: life stage id
      if (c) {
        if (c.partners.length || c.children.child.length || c.children.newborn.length) opts.push({ key: 'family', weight: 1.5 });
        if (c.atWar || c.frontline) opts.push({ key: 'war', weight: 2 });
        if (c.election && c.election.weight > 1) opts.push({ key: 'election', weight: c.election.weight });
        if (c.unemployed) opts.push({ key: 'work', weight: 1.5 });
        if (c.hordeNear || c.underHorde || c.refugee || c.integrated) opts.push({ key: 'horde', weight: 2 });
        if ((c.emigrate ?? 0) >= 2) opts.push({ key: 'emigrate', weight: 1.5 });
        if (c.employed) opts.push({ key: 'job', weight: c.workSoon || c.newJob ? 1.5 : 0.6 });
        if (c.homeless) opts.push({ key: 'home', weight: 1.5 });
        if (c.ill || c.recovered || c.newImplant) opts.push({ key: 'health', weight: 1.5 });
        if (c.bandSoon || c.bandBack) opts.push({ key: 'band', weight: 2 });
        if (c.birthdayToday) opts.push({ key: 'birthday', weight: 4 });
        if (c.holidayToday || c.holidaySoon) opts.push({ key: 'holiday', weight: 1.5 });
        else if (c.weekendOff || c.weekendWork) opts.push({ key: 'weekend', weight: 0.6 });
        if (c.stocksWon || c.stocksLost || c.loan || c.rentIncome || c.bought) opts.push({ key: 'money', weight: 1.2 });
        if (c.friend) opts.push({ key: 'friends', weight: 0.4 });
        if (c.vehicle) opts.push({ key: 'vehicle', weight: 0.3 });
      }
      if (!opts.length || Math.random() >= LIFE_AMBIENT_CHANCE) return null;
      const pick = _weighted(opts);
      const pool = LIFE_AMBIENT()[pick.key];
      if (!Array.isArray(pool) || !pool.length) return null;
      const params = Object.assign({}, c?.params, { child: c?.params?.childKid || c?.params?.childNewborn });
      return _pickFrom(pool).map(([who, text]) => [who, _lifeFill(text, params)]);
    },

    // A hello between relatives passing close by.
    kinGreetLine(speaker, otherName) {
      const rel = this.kinRelation(speaker, otherName);
      if (!rel) return null;
      const pool = LIFE_GREET_KIN()[rel];
      if (!Array.isArray(pool) || !pool.length) return null;
      const pers = _personalityNameOf(_getProfile(speaker));
      return vary(String(_pickFrom(pool)).replace(/\{name\}/g, otherName), pers);
    },

    // What an NPC tells the PARTY about their own life: their family by the
    // real names in their life record first, then their trade, home, health,
    // plans and friends; null when there is nothing in their life to tell.
    familyMention(npcName, profile) {
      profile = profile || _getProfile(npcName);
      if (!profile || _isNonSentientProfile(profile)) return null;
      if ((profile.lifeStage || 'adult') !== 'adult') return null; // i18n-ignore: life stage id
      const c = this._context(profile, npcName);
      if (!c) return null;
      const opts = [];
      const add = (key, weight, map) => { if (weight > 0) opts.push({ key, weight, map }); };
      add('newborn', c.children.newborn.length ? 4 : 0, { child: 'childNewborn' });
      add('pregnant', c.pregnant ? 4 : 0);
      add('partnerPregnant', !c.pregnant && c.partnerPregnant ? 4 : 0);
      add('anniversary', c.anniversaryYears ? 4 : 0);
      add('partnerAway', c.partnerAway ? 3 : 0);
      add('breakup', c.recentBreakup ? 3 : 0);
      add('widowed', c.widowed ? 3 : 0);
      add('refugeeKin', c.refugeeKin ? 3 : 0);
      if (c.partners.length >= 2) add('poly', 2);
      else if (c.partners.length === 1) add(c.style === 'long-distance' ? 'longDistance' : 'partner', 2); // i18n-ignore: style id
      add('children', c.children.child.length ? 2 : 0, { child: 'childKid' });
      add('adultChild', c.children.adult.length ? 1 : 0, { child: 'childAdult' });
      add('parents', c.parents.length ? 1 : 0);
      add('siblings', c.siblings.length ? 1 : 0);
      add('grief', c.lostChild ? 3 : (c.lostParent ? 2.5 : 0), { lost: c.lostChild ? 'lostChild' : 'lostParent' });
      add('grandchildren', c.grandkids ? 1 : 0);
      // The rest of their life, a little less often than the family.
      add('job', c.employed ? 0.8 : 0);
      add('newJob', c.newJob && !c.unemployed ? 3 : 0);
      add('retired', c.retired ? 1 : 0);
      add('homeless', c.homeless ? 2 : 0);
      add('homesick', c.homesick ? 0.6 : 0);
      add('ill', c.ill ? 2.5 : 0);
      add('chronic', c.chronic ? 0.5 : 0);
      add('recovered', c.recovered ? 2 : 0);
      add('implant', c.newImplant ? 2.5 : (c.hasImplant ? 0.3 : 0));
      add('levelUp', c.levelUp ? 2 : 0);
      add('bandSoon', c.bandSoon ? 3 : 0);
      add('bandBack', c.bandBack ? 3 : 0);
      add('birthday', c.birthdayToday ? 5 : 0);
      add('holiday', c.holidayToday || c.holidaySoon ? 1.5 : 0);
      add('stocks', c.stocksWon || c.stocksLost || c.stocksBought ? 2 : 0);
      add('released', c.released ? 2 : 0);
      add('vehicle', c.vehicle ? 0.3 : 0);
      add('friend', c.friend ? 0.5 : 0);
      const pick = _weighted(opts);
      if (!pick) return null;
      const pool = LIFE_MENTIONS()[pick.key];
      if (!Array.isArray(pool) || !pool.length) return null;
      const persName = _personalityNameOf(profile);
      const params = Object.assign({}, c.params, { years: c.params.years || (c.togetherYears != null ? String(Math.max(1, c.togetherYears)) : null) });
      const line = applyVoice(_lifeFill(_pickFrom(pool), params, pick.map), persName, VOICE_CHANCE_DIALOGUE);
      return CreedVoice.decorate(line, profile, MENTION_FRAME[pick.key] || 'family', CREED_CHANCE_MENTION, params, npcName);
    },
  };

  Object.assign(window.NPCConversation._internal, {
    CREED_ASIDE_CHANCE, CREED_CHANCE_DIALOGUE, CREED_CHANCE_POLITICS, CreedVoice, ElectionClock,
    LIFE_SCRIPT_TOPICS, LIFE_TOPICS, LifeContext, LifeTalk, WorldFacts,
  });
})();
