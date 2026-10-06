/*:
 * @target MZ
 * @plugindesc NPC Conversation: thought provider and thought bubbles
 * @author Omni-Lex
 * @base NPCConversation
 * @orderAfter NPCConversation
 * @orderAfter NPCConversation_LifeTalk
 * @help
 * ============================================================================
 * NPCConversation_Thoughts, part of the NPCConversation family
 * ============================================================================
 * Owns II.5 THOUGHT PROVIDER, II.6 THOUGHT BUBBLES (BubbleLayout,
 * window.NPCBubbleLayout, ThoughtBubbleManager and its npc:thought
 * subscription) and II.10 SPEC TALK (the bubbles people pop about a
 * specialization they are good at, and the questions others ask them).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCConversation._internal and publishes its own there. Load it right after
 * NPCConversation_LifeTalk.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _personalityNameOf, _personalityOf, _pickFrom, ACTIVITY_THOUGHTS, ADDICTION_THOUGHTS, applyVoice,
    CAPABILITY_THOUGHTS, CRAVING_THOUGHTS, CRAVING_WITHDRAWAL_THOUGHTS, CREED_ASIDE_CHANCE,
    CreedVoice, CRIME_CAUGHT_THOUGHTS, CRIME_INTENT_THOUGHTS, CRIME_SUCCESS_THOUGHTS, ElectionClock,
    FAMILIAR_THOUGHTS, isTacticalFight, ITEM_BROWSE_THOUGHTS, ITEM_BUY_THOUGHTS,
    ITEM_DISPOSITION_THOUGHTS, LifeTalk, NEED_DIRE_THOUGHTS, NEED_MILD_THOUGHTS, NEED_THOUGHTS,
    PERSONALITY_CORE_THOUGHTS, PERSONALITY_THOUGHT_BANK, PoliticsProvider, SpeciesVoice,
    SEASON_THOUGHTS, SPEC_TALK, TIME_THOUGHTS, vary, WATER_THOUGHTS, WEALTH_THOUGHTS, WEATHER_THOUGHTS,
    WorldProvider,
  } = window.NPCConversation._internal;

  // ---------------------------------------------------------------------------
  // II.5 THOUGHT PROVIDER
  // ---------------------------------------------------------------------------
  // The single entry point NPCSimulationCore's ThoughtGenerator delegates to.
  // Mixes every solo-dialogue source by personality and situation:
  //   - familiar-with-player musings  (shared pool, voiced per personality)
  //   - situational weather/time      (situation × personality, own line each)
  //   - personalityCoreThoughts       (personality inner voice, fires at random)
  //   - need-based templates          (shared pool, voiced per personality)

  // The season the game is in, in the vocabulary the farming and weather
  // plugins already use, with the calendar variable as the fallback.
  const SEASON_MONTHS = { SPRING: [2, 3, 4], SUMMER: [5, 6, 7], AUTUMN: [8, 9, 10] };
  function _currentSeason() {
    try {
      if (typeof $gameWeather !== 'undefined' && $gameWeather?.getSeason) return $gameWeather.getSeason();
    } catch (_) {}
    const date = String($gameVariables?.value(113) || '01 JAN 2001 12:00').split(' ').filter(Boolean);
    const month = String(date[1] || 'JAN').toUpperCase();
    const en = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const it = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
    let m = en.indexOf(month);
    if (m === -1) m = it.indexOf(month);
    if (m === -1) m = 0;
    const found = Object.keys(SEASON_MONTHS).find(s => SEASON_MONTHS[s].includes(m));
    return found || 'WINTER';
  }

  // The sky as the weather banks key it: rain, storm, snow, or clear.
  function _weatherKey() {
    const w = ($gameScreen && ($gameScreen.weatherType?.() ?? $gameScreen._weatherType)) || 'none';
    return (w === 'rain' || w === 'storm' || w === 'snow') ? w : 'clear';
  }

  // The hour as the time banks key it.
  function _timeOfDay() {
    const hour = $gameVariables?.value(23) ?? 12;
    return hour >= 5 && hour < 12 ? 'morning'
         : hour >= 12 && hour < 17 ? 'afternoon'
         : hour >= 17 && hour < 21 ? 'evening' : 'night';
  }

  const SituationalThoughts = {
    pick(profile) {
      const persName = _personalityNameOf(profile);
      // A quarter of the time they are thinking about the year rather than
      // about today's sky or this hour of the day.
      if (Math.random() < 0.25) {
        const pool = SEASON_THOUGHTS()[_currentSeason()];
        if (pool?.length) return vary(_pickFrom(pool), persName);
      }
      if (Math.random() < 0.5) {
        const pool = WEATHER_THOUGHTS()[_weatherKey()];
        return vary(_pickFrom((persName && pool[persName]) || pool.default), persName);
      }
      const pool = TIME_THOUGHTS()[_timeOfDay()];
      return vary(_pickFrom((persName && pool[persName]) || pool.default), persName);
    },
  };

  // A craving speaks up before anything else does: an NPC who wants a cigarette
  // is not thinking about the weather. It only opens its mouth once the want is
  // real (CRAVING_SPEAKS_AT) and gets louder from there, so an addict in the
  // street is quiet most of the day and unmistakable near the end of a cycle.
  const CRAVING_SPEAKS_AT = 70;
  const CRAVING_WITHDRAWAL_AT = 95;

  const CravingProvider = {
    pick(profile) {
      const system = window.AddictionSystem;
      if (!system || !system.profileWorst) return null;
      let worst = null;
      try { worst = system.profileWorst(profile); } catch (_) { return null; }
      if (!worst || worst.value < CRAVING_SPEAKS_AT) return null;

      // How close they are to the end of their cycle is how likely they are to
      // say something about it, up to half the time when it is unbearable.
      const bite = (worst.value - CRAVING_SPEAKS_AT) / (100 - CRAVING_SPEAKS_AT);
      if (Math.random() > bite * 0.5) return null;

      const table = worst.value >= CRAVING_WITHDRAWAL_AT
        ? CRAVING_WITHDRAWAL_THOUGHTS() : CRAVING_THOUGHTS();
      const pool = table && table[worst.key];
      if (!pool || !pool.length) return null;
      return applyVoice(_pickFrom(pool), _personalityNameOf(profile));
    },
  };

  // One line for a moment of a habit, in the speaker's voice: craving and
  // withdrawal reuse the pools above, the rest come from ConvThoughts.addiction.
  // `params` fills {item} and {amount}. Null when there is no pool for it.
  const AddictionThoughts = {
    pool(moment, key) {
      if (moment === 'craving') return CRAVING_THOUGHTS()?.[key] || null;
      if (moment === 'withdrawal') return CRAVING_WITHDRAWAL_THOUGHTS()?.[key] || null;
      return ADDICTION_THOUGHTS()?.[moment]?.[key] || null;
    },

    line(profile, moment, key, params) {
      const pool = this.pool(moment, key);
      if (!Array.isArray(pool) || !pool.length) return null;
      const line = applyVoice(_pickFrom(pool), _personalityNameOf(profile));
      if (!params || typeof line !== 'string') return line;
      return line.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    },
  };

  // One line for a moment at a hive or a barrel (NPCSim.Tending), from
  // ConvThoughts.farmCare: hiveTend, hiveTreat, hiveSuper, honeyHarvest,
  // barrelCheck, barrelCare, barrelBottle, barrelStart, taste, tempted,
  // unattendedHive, unattendedBarrel, friendHive, friendBarrel. The names in
  // `params` ({brew}, {owner}) go in before the {a|b} groups are chosen, so a
  // name can stand as one of the choices; a line naming something `params`
  // does not hold is never picked. Null when nothing fits.
  const CareThoughts = {
    pool(moment) {
      const pool = window.NPCConversation._internal.bank('ConvThoughts.farmCare')?.[moment];
      return Array.isArray(pool) ? pool : null;
    },

    line(profile, moment, params) {
      const pool = this.pool(moment);
      if (!pool || !pool.length) return null;
      const p = params || {};
      const fits = pool.filter(l => typeof l === 'string' &&
        (l.match(/\{(\w+)\}/g) || []).every(m => p[m.slice(1, -1)] != null));
      if (!fits.length) return null;
      const filled = _pickFrom(fits).replace(/\{(\w+)\}/g, (m, k) => String(p[k]));
      return applyVoice(filled, _personalityNameOf(profile));
    },
  };

  // A people's own thoughts (Conv<Voice>.thought, II.1b), weighed by what is
  // true for the thinker right now: the need on their mind, the sky, the
  // hour, the season, the purse, whether the party is a friend, whether they
  // live on the Horde's ground or away from it, and the lore of their people
  // (for a Naguka: the shared head, Junehem, the Kola shaft, the eggs...).
  // How often their own words win over the ordinary ones: most of the time for
  // a voice of their own, now and then for a blend voice (II.1b).
  const SPECIES_THOUGHT_CHANCE = { own: 0.65, blend: 0.25 };
  const SpeciesThoughts = {
    pick(profile, voiceId) {
      const id = voiceId || SpeciesVoice.voiceOf(profile);
      const t = id ? SpeciesVoice.bank(id).thought : null;
      if (!profile || !t) return null;
      const options = [];
      const add = (weight, pool) => {
        if (Array.isArray(pool) && pool.length) options.push([weight, pool]);
      };
      add(3, t.need?.[profile.currentNeed]);
      add(1, t.weather?.[_weatherKey()]);
      add(1, t.time?.[_timeOfDay()]);
      add(1, t.season?.[_currentSeason()]);
      const tier = profile.wealthTierBase;
      if (tier != null) add(1, t.wealth?.[tier <= 1 ? 'poor' : tier <= 3 ? 'comfortable' : 'rich']);
      if ((profile.playerOpinion ?? 0) >= 20) add(1, t.familiar);
      let horde = false;
      try { horde = !!window.SpriteCatalog?.isGoblinHordeGround?.(); } catch (_) { horde = false; }
      add(2, horde ? t.hordeGround : t.abroad);
      const lore = t.lore && typeof t.lore === 'object' ? Object.values(t.lore).filter((p) => Array.isArray(p) && p.length) : [];
      if (lore.length) add(2, _pickFrom(lore));
      add(3, t.generic);
      if (!options.length) return null;
      let roll = Math.random() * options.reduce((sum, [w]) => sum + w, 0);
      for (const [w, pool] of options) {
        roll -= w;
        if (roll <= 0) return vary(_pickFrom(pool), null);
      }
      return vary(_pickFrom(options[options.length - 1][1]), null);
    },
  };

  // What a need thought is about, and how loud it is.
  //   state     what the simulation says they are doing (profile.currentNeed),
  //             overruled by what is happening to them this minute
  //             (NPCSim RoutineManager.liveActivity: downed, fleeing, fighting,
  //             swimming, fishing, recovering), a WC trip told from a wash
  //             (profile.washFor), and a child's hours read as a child's
  //             (school, play, a day at home, bedtime).
  //   pools     ConvThoughts.need.<state> for a need, ConvThoughts.activity
  //             .<state> for something they are doing that is not a need,
  //             need.null for anything else (a creature's hours: a beast's
  //             bubble is a growl anyway, see ThoughtBubbleManager._showNow).
  //   severity  the raw meter (0 empty, 100 full): under DIRE_BELOW the
  //             needDire pool speaks, from MILD_FROM up the needMild pool
  //             shares the hour with the middle one, which is the need pool.
  //   voice     now and then (PERSONALITY_NEED_CHANCE) the personality's own
  //             words for that need, PersonalityThoughts.<name>.need.<state>,
  //             as PersonalityData.json needThoughts names them.
  const NEED_ALIASES = Object.freeze({ food: 'hunger', heal: 'recovering' }); // i18n-ignore: need ids
  const CHILD_STATES = Object.freeze({ leisure: 'play', home: 'childHome', sleep: 'childBedtime' }); // i18n-ignore: activity ids
  const NEED_METERS = Object.freeze(['sleep', 'hunger', 'hygiene', 'social', 'leisure', 'bladder']); // i18n-ignore: meter ids
  const NEED_SEVERITY = Object.freeze({ DIRE_BELOW: 15, MILD_FROM: 30, MILD_SHARE: 0.5 });
  const PERSONALITY_NEED_CHANCE = 0.35;

  const NeedThoughts = {
    state(profile) {
      if (!profile) return null;
      let live = null;
      try { live = window.NPCSim?._internal?.RoutineManager?.liveActivity?.(profile) || null; } catch (_) { live = null; }
      if (live) return live;
      let s = profile.currentNeed ?? null;
      if (s == null) return null;
      s = NEED_ALIASES[s] || s;
      if (s === 'hygiene' && profile.washFor === 'bladder') return 'bladder'; // i18n-ignore: activity id
      if (LifeTalk.isChild(profile) && CHILD_STATES[s]) return CHILD_STATES[s];
      return s;
    },

    // 'dire', 'mild', or null for the middle (or no meter to read).
    severity(profile, state) {
      if (!profile || !NEED_METERS.includes(state) || profile[state] == null) return null;
      const v = Number(profile[state]);
      if (!Number.isFinite(v)) return null;
      if (v < NEED_SEVERITY.DIRE_BELOW) return 'dire'; // i18n-ignore: severity tier id
      if (v >= NEED_SEVERITY.MILD_FROM) return 'mild'; // i18n-ignore: severity tier id
      return null;
    },

    // The middle pool for a state: the need's own, or the activity's.
    pool(state) {
      if (state == null) return null;
      const need = NEED_THOUGHTS()?.[state];
      if (Array.isArray(need) && need.length) return need;
      const act = ACTIVITY_THOUGHTS()?.[state];
      return Array.isArray(act) && act.length ? act : null;
    },

    // The personality's own line for this need, or null. A child has no
    // grown-up's worries to voice, so it never reaches for these.
    personalityPool(profile, state) {
      if (!profile || LifeTalk.isChild(profile)) return null;
      const pers = _personalityOf(profile);
      if (!pers || !state) return null;
      const root = PERSONALITY_THOUGHT_BANK() || {};
      const ref = pers.needThoughts?.[state];
      let pool = null;
      if (Array.isArray(ref)) pool = ref;
      else if (typeof ref === 'string') {
        pool = ref.split('.').slice(1).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), root);
      }
      if (!Array.isArray(pool)) pool = root[String(pers.name || '').toLowerCase()]?.need?.[state];
      return Array.isArray(pool) && pool.length ? pool : null;
    },

    pick(profile) {
      const persName = _personalityNameOf(profile);
      const state = this.state(profile);
      const tier = this.severity(profile, state);
      if (tier === 'dire') { // i18n-ignore: severity tier id
        const dire = NEED_DIRE_THOUGHTS()?.[state];
        if (Array.isArray(dire) && dire.length) return applyVoice(_pickFrom(dire), persName);
      }
      if (Math.random() < PERSONALITY_NEED_CHANCE) {
        const own = this.personalityPool(profile, state ?? 'idle'); // i18n-ignore: PersonalityThoughts key
        if (own) return vary(_pickFrom(own), persName);
      }
      if (tier === 'mild' && Math.random() < NEED_SEVERITY.MILD_SHARE) { // i18n-ignore: severity tier id
        const mild = NEED_MILD_THOUGHTS()?.[state];
        if (Array.isArray(mild) && mild.length) return applyVoice(_pickFrom(mild), persName);
      }
      const pool = this.pool(state) || NEED_THOUGHTS()[null];
      return applyVoice(_pickFrom(pool), persName);
    },
  };

  const ThoughtProvider = {
    get personalityCoreThoughts() { return PERSONALITY_CORE_THOUGHTS(); },

    // Whatever comes to mind, said the way they say it: in their people's
    // voice for anybody who has one (II.1b), exactly as picked otherwise.
    pickThought(profile) {
      return SpeciesVoice.render(this._pickThought(profile), profile);
    },

    _pickThought(profile) {
      if (!profile) return null;
      // A body that wants something talks over everything else it might say.
      const craving = CravingProvider.pick(profile);
      if (craving) return craving;
      // What is happening in their life speaks up next (II.8): a newborn only
      // ever cries, running from a monster outranks everything, and a family,
      // a job, a war, the Horde or an election each speak when they apply.
      const life = LifeTalk.pickThought(profile);
      if (life) return life;
      // A people with a voice of their own mostly think in their own words.
      const voiceId = SpeciesVoice.voiceOf(profile);
      if (voiceId && Math.random() < (SPECIES_THOUGHT_CHANCE[SpeciesVoice.mode(voiceId)] ?? SPECIES_THOUGHT_CHANCE.own)) {
        const own = SpeciesThoughts.pick(profile, voiceId);
        if (own) return own;
      }
      // Babies and children have no politics, purse or creed to muse on.
      if (LifeTalk.isNewborn(profile)) return LifeTalk.lineFor('kidNewborn', null, profile) || '...';
      if (LifeTalk.isChild(profile)) return this.pickNeedThought(profile);
      // Now and then the creed they hold speaks on its own (II.9).
      if (Math.random() < CREED_ASIDE_CHANCE) {
        const aside = CreedVoice.frame(profile, 'flavour', null);
        if (aside) return aside;
      }
      // Political life occasionally crowds out everything else, officeholders,
      // hot rumors and looming elections speak up via PoliticsProvider, and
      // louder as an election in the player's country comes closer.
      if (Math.random() < Math.min(0.6, 0.12 * ElectionClock.weightNow(profile))) {
        const t = PoliticsProvider.pickPoliticalThought(profile);
        if (t) return t;
      }
      // So does the state of the world, crime waves, booms, plagues and
      // headlines from the world web speak up via WorldProvider.
      if (Math.random() < 0.12) {
        const t = WorldProvider.pickWorldThought(profile);
        if (t) return t;
      }
      // What is in the purse speaks up too, and says something different at
      // each end of the street.
      if (Math.random() < 0.10) {
        const t = this.pickWealthThought(profile);
        if (t) return t;
      }
      const r = Math.random();
      if ((profile.playerOpinion ?? 0) >= 20 && r < 0.12) {
        const own = Math.random() < PERSONALITY_NEED_CHANCE ? NeedThoughts.personalityPool(profile, 'familiar') : null; // i18n-ignore: PersonalityThoughts key
        if (own) return vary(_pickFrom(own), _personalityNameOf(profile));
        return applyVoice(_pickFrom(FAMILIAR_THOUGHTS()), _personalityNameOf(profile));
      }
      if (r < 0.28) {
        const t = SituationalThoughts.pick(profile);
        if (t) return t;
      }
      if (r < 0.46) {
        const t = this.pickPersonalityCoreThought(profile);
        if (t) return t;
      }
      return this.pickNeedThought(profile);
    },

    pickNeedThought(profile) {
      return NeedThoughts.pick(profile);
    },

    // Tier 0-1 counts every coin, 2-3 has something put by, 4 and up has
    // stopped counting where anyone can see.
    pickWealthThought(profile) {
      const tier = profile?.wealthTierBase ?? null;
      if (tier === null) return null;
      const key = tier <= 1 ? 'poor' : tier <= 3 ? 'comfortable' : 'rich';
      const pool = WEALTH_THOUGHTS()[key];
      return pool?.length ? applyVoice(_pickFrom(pool), _personalityNameOf(profile)) : null;
    },

    pickPersonalityCoreThought(profile) {
      const name = _personalityOf(profile)?.name;
      const pool = name ? PERSONALITY_CORE_THOUGHTS()[name] : null;
      return pool?.length ? vary(_pickFrom(pool), name) : null;
    },

    // Crime narration with the coveted/stolen item's name baked in.
    // kind: 'intent' (wants to steal it) | 'success' (stole it) | 'caught'.
    crimeThought(profile, kind, itemName) {
      const pool = kind === 'intent'  ? CRIME_INTENT_THOUGHTS()
                 : kind === 'success' ? CRIME_SUCCESS_THOUGHTS()
                 : CRIME_CAUGHT_THOUGHTS();
      const line = _pickFrom(pool).replace(/{item}/g, itemName || 'that');
      return applyVoice(line, _personalityNameOf(profile));
    },

    // Opinion about a specific shop item, baked with its name. kind: 'buy'
    // (just purchased it) | 'browse' (a law-abiding customer eyeing it on
    // display). The reaction tracks the price tag (cheap vs. pricey) and is
    // tinted by the NPC's personality, both via applyVoice and an occasional
    // appended disposition line keyed off their traits/morality.
    itemThought(profile, itemData, kind = 'browse') {
      if (!itemData) return null;
      const name  = itemData.name || 'that';
      const price = Number(itemData.price) || 0;
      const tier  = price >= 400 ? 'pricey' : 'cheap';
      const table = kind === 'buy' ? ITEM_BUY_THOUGHTS() : ITEM_BROWSE_THOUGHTS();
      let line = _pickFrom(table[tier]).replace(/{item}/g, name);

      // Occasionally append a disposition aside that reflects who they are.
      const disp = this._shoppingDisposition(profile);
      if (disp && ITEM_DISPOSITION_THOUGHTS()[disp] && Math.random() < 0.5) {
        line += ' ' + _pickFrom(ITEM_DISPOSITION_THOUGHTS()[disp]);
      }
      return applyVoice(line, _personalityNameOf(profile));
    },

    // Maps an NPC's traits/wealth/morality onto one of the disposition pools.
    _shoppingDisposition(profile) {
      if (!profile) return null;
      const traitNames = (profile.traitIds || []).map(id => {
        const d = window._NPCSocietyDataLoader?.traits?.find(t => t.id === id);
        return (d?.name || '').toLowerCase();
      });
      const has = (kw) => traitNames.some(n => n.includes(kw));
      if (has('greed') || (profile.moralityScore ?? 0) < -30) return 'greedy';
      if (has('generous') || has('kind'))                     return 'generous';
      if (has('vain') || has('proud') || (profile.wealthTierBase ?? 0) >= 3) return 'vain';
      if (has('frugal') || has('thrift') || (profile.wealthTierBase ?? 0) <= 1) return 'frugal';
      return null;
    },

    // A moment in the water or on its bank (NPCSim.Water): 'swim.wash',
    // 'swimming', 'fish.catch' and so on, a dotted path into
    // ConvThoughts.water. 'params' fills {fish}. Null with no pool for it.
    waterThought(profile, moment, params) {
      let pool = WATER_THOUGHTS();
      for (const part of String(moment || '').split('.')) pool = pool ? pool[part] : null;
      if (!Array.isArray(pool) || !pool.length) return null;
      const line = applyVoice(_pickFrom(pool), _personalityNameOf(profile));
      if (!params || typeof line !== 'string') return line;
      return line.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    },

    // Reaction line after finishing a capability interaction (cooking, bank...).
    // Personality core thoughts occasionally bleed through here too, so even
    // these reactions vary by who's having them.
    pickCapabilityThought(profile, capabilityId) {
      const pool = CAPABILITY_THOUGHTS()[capabilityId];
      if (!pool) return null;
      if (Math.random() < 0.15) {
        const t = this.pickPersonalityCoreThought(profile);
        if (t) return t;
      }
      return applyVoice(_pickFrom(pool), _personalityNameOf(profile));
    },
  };

  // ---------------------------------------------------------------------------
  // II.6 THOUGHT BUBBLES (formerly NPCThoughtBubble.js)
  // ---------------------------------------------------------------------------
  // Whenever "npc:thought" fires (NPCSimulationCore's ThoughtGenerator, or a
  // conversation line above), a small parchment speech-bubble fades in above
  // that NPC's sprite, lingers briefly, then fades back out. The whole layer
  // is DOM-only; under the Node test harness ThoughtBubbleManager stays null.

  const BUBBLE_DISPLAY_MS  = 4000; // ms the bubble stays fully visible
  const BUBBLE_FADE_MS     = 800;  // ms of the fade-out transition
  const BUBBLE_MAX_ONSCREEN = 9;   // pooled bubble elements (one per chatty NPC)

  // Every bubble is its own DOM element pinned over the head of whoever is
  // speaking, so two people standing close together used to print one bubble on
  // top of the other and neither could be read. Rather than position blind, a
  // bubble claims the rectangle it wants from this arbiter once per frame; the
  // arbiter remembers what has already been claimed and slides a late claim
  // clear of the ones before it. Claims are keyed by the bubble that made them,
  // so re-claiming within the same frame just updates that bubble's rectangle.
  // Core/AutoIdleExplorer.js's party bubbles claim through the same registry
  // (window.NPCBubbleLayout), so party and town chatter never stack either.
  const BubbleLayout = (typeof document === 'undefined') ? null : (() => {
    const GAP_X = 8;        // page px of clear space kept between two bubbles
    const GAP_Y = 6;
    const SIDE_COST = 2.5;  // sideways displacement costs this much more than upward
    const MAX_PASSES = 12;  // give up rather than loop forever on a dense crowd

    let _frame = -1;
    let _claims = [];

    function _hits(l, t, w, h, r) {
      return l < r.right + GAP_X && l + w > r.left - GAP_X &&
             t < r.bottom + GAP_Y && t + h > r.top - GAP_Y;
    }

    function _free(key, l, t, w, h) {
      for (const r of _claims) if (r.key !== key && _hits(l, t, w, h, r)) return false;
      return true;
    }

    // Last resort for a crowd too thick to find a clean slot in: shove the rect
    // straight up out of everything it touches, then clamp back on screen.
    function _shoveUp(key, l, t, w, h) {
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let moved = false;
        for (const r of _claims) {
          if (r.key === key || !_hits(l, t, w, h, r)) continue;
          t = r.top - GAP_Y - h;
          moved = true;
        }
        if (!moved) break;
      }
      return t;
    }

    return {
      // Claim where a bubble wants to sit and get back where it may actually
      // sit, as { x, y }: x is its horizontal centre, y its top edge, both page
      // px, as are the caller's centerX/top/w/h. `bounds` (page px left/right/
      // top/bottom of the canvas) keeps a displaced bubble on screen.
      //
      // The natural spot wins whenever it is free. Otherwise the candidates are
      // the slots flush against the bubbles already claimed - directly above or
      // below one, or alongside one - and the cheapest free candidate wins,
      // counting sideways moves as dearer than vertical ones so a bubble stays
      // over its speaker's head where it can and only steps aside in a real
      // crush.
      place(key, centerX, top, w, h, bounds) {
        const frame = (typeof Graphics !== 'undefined') ? Graphics.frameCount : 0;
        if (frame !== _frame) { _frame = frame; _claims.length = 0; }
        else _claims = _claims.filter(r => r.key !== key);

        const b = bounds || {};
        const l0 = centerX - w / 2;
        let best = null;

        const consider = (l, t) => {
          if (b.top    != null && t < b.top)        return;
          if (b.bottom != null && t + h > b.bottom) return;
          if (b.left   != null && l < b.left)       return;
          if (b.right  != null && l + w > b.right)  return;
          const cost = Math.abs(t - top) + SIDE_COST * Math.abs(l - l0);
          if (best && cost >= best.cost) return;
          if (!_free(key, l, t, w, h)) return;
          best = { l, t, cost };
        };

        consider(l0, top);
        if (!best) {
          // Flush against one neighbour, still over the speaker horizontally
          for (const r of _claims) {
            if (r.key === key) continue;
            consider(l0, r.top - GAP_Y - h);
            consider(l0, r.bottom + GAP_Y);
            consider(r.left - GAP_X - w, top);
            consider(r.right + GAP_X, top);
          }
        }
        if (!best) {
          // Boxed in: every corner where one neighbour's column meets another's row
          for (const a of _claims) {
            if (a.key === key) continue;
            for (const c of _claims) {
              if (c.key === key || c === a) continue;
              consider(a.left - GAP_X - w, c.top - GAP_Y - h);
              consider(a.left - GAP_X - w, c.bottom + GAP_Y);
              consider(a.right + GAP_X,    c.top - GAP_Y - h);
              consider(a.right + GAP_X,    c.bottom + GAP_Y);
            }
          }
        }

        let l = best ? best.l : l0;
        let t = best ? best.t : _shoveUp(key, l0, top, w, h);
        if (!best) {
          if (b.top    != null) t = Math.max(t, b.top);
          if (b.bottom != null) t = Math.min(t, b.bottom - h);
        }
        _claims.push({ key, left: l, right: l + w, top: t, bottom: t + h });
        return { x: l + w / 2, y: t };
      },

      // Forget every claim, e.g. when the whole layer is torn down on a map change
      clear() { _claims.length = 0; },
    };
  })();
  if (BubbleLayout && typeof window !== 'undefined') window.NPCBubbleLayout = BubbleLayout;

  // Whether the page knows the individual `translate` property (see
  // ThoughtBubble.updatePosition).
  const _CAN_TRANSLATE = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
    CSS.supports('translate', '1px 1px');

  const ThoughtBubbleManager = (typeof document === 'undefined') ? null : (() => {

    // Screen-space helpers (mirrors MousePan's Window_EventHover projection).
    // getBoundingClientRect forces layout, so the result is memoized per frame
    // and shared by every bubble.
    let _scaleCache = null;
    let _scaleFrame = -1;
    function _msgGetScale() {
      if (_scaleCache && _scaleFrame === Graphics.frameCount) return _scaleCache;
      // Reading the canvas box forces a synchronous layout, and a dozen
      // overlays all want it on the same frame, so it is taken from the shared
      // frame budget (Core/ParchmentToast.js), which pays that once for all of
      // them. Reading it here is the fallback for when the budget is absent.
      let r = window.FrameBudget && window.FrameBudget.canvasRect();
      if (!r) {
        const el = document.getElementById('gameCanvas');
        if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
        r = el.getBoundingClientRect();
      }
      _scaleFrame = Graphics.frameCount;
      _scaleCache = { sx: r.width / Graphics.width, sy: r.height / Graphics.height, ox: r.left, oy: r.top };
      return _scaleCache;
    }

    function _tileScreenPos(ev) {
      // Reuse the character's own screen-projection (screenX is already the
      // sprite's horizontal center; screenY is its anchor near the feet) so the
      // bubble tracks exactly what's drawn, including any shift or jump a
      // movement plugin applies, instead of drifting from a separately
      // reimplemented tile-to-pixel formula. The camera zoom (MousePan.js) is
      // the one thing screenX/Y do not carry: the whole spriteset is scaled
      // about the zoom centre after the fact, so apply that same transform here.
      const x = ev.screenX();
      const y = ev.screenY() - $gameMap.tileHeight();
      const zoom = $gameScreen ? $gameScreen.zoomScale() : 1;
      if (!zoom || zoom === 1) return { x, y };
      const zx = $gameScreen.zoomX();
      const zy = $gameScreen.zoomY();
      return { x: zx + (x - zx) * zoom, y: zy + (y - zy) * zoom };
    }

    // One pooled HTML element with its own show/fade/release lifecycle
    class ThoughtBubble {
      constructor() {
        this.el = document.createElement('div');
        this.el.className = 'npc-thought-bubble';
        document.body.appendChild(this.el);
        this.npcName     = null;
        this._hideTimer  = null;
        this._killTimer  = null;
        this._ev         = null; // resolved Game_Event, cached per map
        this._evMapId    = 0;
        this._height     = 0;    // offsetHeight, re-read only when text changes
        this._width      = 0;    // offsetWidth, likewise; the layout arbiter needs both
        this._shownAt    = 0;
        this._lastLeft   = null;
        this._lastTop    = null;
        this._offscreen  = false;
      }

      show(npcName, text) {
        this._clearTimers();
        this.npcName = npcName;
        this.el.textContent = text;
        this.el.classList.remove('fading');
        this.el.style.display = 'block';
        // Force a reflow so the transition restarts cleanly when a bubble is reused mid-fade
        void this.el.offsetWidth;
        this.el.classList.add('visible');
        // Size only changes with the text, so measure once here instead of per frame
        this._height = this.el.offsetHeight || 32;
        this._width  = this.el.offsetWidth  || 0;
        this._shownAt = Date.now();
        this._lastLeft = null;
        this._lastTop  = null;

        this._hideTimer = setTimeout(() => this.fade(), BUBBLE_DISPLAY_MS);
      }

      fade() {
        if (!this.npcName) return;
        this.el.classList.remove('visible');
        this.el.classList.add('fading');
        this._killTimer = setTimeout(() => this.release(), BUBBLE_FADE_MS);
      }

      release() {
        this._clearTimers();
        this.npcName = null;
        this._ev = null;
        this.el.style.display = 'none';
        this.el.classList.remove('visible', 'fading');
        this._setOffscreen(false);
      }

      // A speaker who has walked off the edge of the canvas keeps their bubble,
      // it just stops being drawn: pinning it to the nearest edge instead would
      // put words in the air next to somebody who isn't there, and letting it
      // sit off-canvas would print it over the page around the game.
      _setOffscreen(off) {
        if (off === this._offscreen) return;
        this._offscreen = off;
        this.el.style.visibility = off ? 'hidden' : '';
      }

      _clearTimers() {
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        if (this._killTimer) { clearTimeout(this._killTimer); this._killTimer = null; }
      }

      destroy() {
        this._clearTimers();
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      }

      updatePosition(ev, sc) {
        if (!ev || !$gameMap) return;
        sc = sc || _msgGetScale();
        const pos = _tileScreenPos(ev);
        const h   = this._height || 32;
        const w   = this._width  || 0;
        // Off the canvas: hide it and claim nothing, so it neither shows up
        // stuck to an edge nor pushes the bubbles of the people still in view
        if (pos.x < 0 || pos.x > Graphics.width || pos.y < 0 || pos.y > Graphics.height) {
          this._setOffscreen(true);
          return;
        }
        this._setOffscreen(false);
        // left points to the NPC's horizontal center; CSS translateX(-50%) centers the bubble on it
        let left = Math.round(sc.ox + pos.x * sc.sx);
        // The bubble's own size is page px while the projection is canvas px, so
        // convert the anchor first and float the bubble above it from there.
        let top = Math.round(sc.oy + pos.y * sc.sy - h - 16 * sc.sy);
        if (BubbleLayout) {
          const slot = BubbleLayout.place(this, left, top, w, h, {
            left: sc.ox, right: sc.ox + Graphics.width * sc.sx,
            top: sc.oy,  bottom: sc.oy + Graphics.height * sc.sy,
          });
          left = Math.round(slot.x);
          top  = Math.round(slot.y);
        }
        if (left === this._lastLeft && top === this._lastTop) return;
        this._lastLeft = left;
        this._lastTop  = top;
        // While the camera scrolls every bubble moves every frame, and a new
        // left/top is a layout of the page each time. The CSS `translate`
        // property moves it on the compositor instead. Not `transform`: the
        // stylesheet already spends that on the centring translateX(-50%) and
        // the fade's slide, with a transition on it that would make the bubble
        // trail its speaker. `translate` is applied before `transform`, so the
        // centring still holds. Left/top stay as the fallback where the
        // property is unknown.
        if (_CAN_TRANSLATE) this.el.style.translate = left + 'px ' + top + 'px';
        else { this.el.style.left = left + 'px'; this.el.style.top = top + 'px'; }
      }
    }

    // Routes "npc:thought" events to a small pool of bubbles and keeps them
    // tracking their NPC's sprite every frame
    return {
      _bubbles: [],
      _byName: new Map(),

      _acquire(npcName) {
        let bubble = this._bubbles.find(b => !b.npcName);
        if (!bubble && this._bubbles.length < BUBBLE_MAX_ONSCREEN) {
          bubble = new ThoughtBubble();
          this._bubbles.push(bubble);
        }
        if (!bubble) {
          // Every slot busy, recycle the longest-running one
          bubble = this._bubbles[0];
          if (bubble.npcName) this._byName.delete(bubble.npcName);
        }
        this._byName.set(npcName, bubble);
        return bubble;
      },

      // The sim's hourly tick thinks one thought for every NPC on the map in
      // the same frame, and each bubble shown forces a layout to measure
      // itself. They wait here instead and come up one every SHOW_GAP_FRAMES,
      // newest kept: past PENDING_MAX the oldest thoughts are let go unseen.
      SHOW_GAP_FRAMES: 6,
      PENDING_MAX: 12,
      _pending: [],
      _lastShownFrame: -Infinity,

      queue(npcName, text) {
        if (!npcName || !text || !$gameMap) return;
        if (isTacticalFight()) return;
        const at = this._pending.findIndex(p => p.npcName === npcName);
        if (at >= 0) this._pending.splice(at, 1);
        this._pending.push({ npcName, text, mapId: $gameMap.mapId() });
        if (this._pending.length > this.PENDING_MAX) this._pending.shift();
      },

      _drainPending() {
        if (!this._pending.length) return;
        const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        if (frame - this._lastShownFrame < this.SHOW_GAP_FRAMES) return;
        const mapId = $gameMap.mapId();
        while (this._pending.length) {
          const next = this._pending.shift();
          if (next.mapId !== mapId) continue;
          this._lastShownFrame = frame;
          this._showNow(next.npcName, next.text);
          return;
        }
      },

      _showNow(npcName, text) {
        if (!npcName || !text || !$gameMap) return;
        if (isTacticalFight()) return;
        // A non-sentient NPC (one of the creature classes, see NPCCreature) has
        // no sentences to think in. Whatever the simulation wrote for it is
        // heard the way an animal is heard, off the same growl bank every other
        // answer of its comes out of (NPCEmpathize.growlFor).
        const EM = window.NPCEmpathize;
        if (EM?.isNonSentientNPC?.(npcName)) text = EM.growlFor(text, npcName) || text;
        // Only worth showing if the NPC is actually on the current map
        const ev = $gameMap.events().find(e => (e.event()?.name || '') === npcName);
        if (!ev || ev.isTransparent()) return;
        if ($gamePlayer) {
          const dx = ev.x - $gamePlayer.x, dy = ev.y - $gamePlayer.y;
          if (Math.sqrt(dx * dx + dy * dy) > 64) return;
        }

        const bubble = this._byName.get(npcName) || this._acquire(npcName);
        bubble._ev = ev;
        bubble._evMapId = $gameMap.mapId();
        bubble.show(npcName, text);
        bubble.updatePosition(ev);
      },

      update() {
        if (!$gameMap) return;
        this._drainPending();
        // Nothing on screen, nothing to place. This runs on every frame of
        // every map, and everything below it costs something worth not paying
        // for an empty screen: _msgGetScale reads the canvas box out of the
        // DOM, and the filter and the sort each allocate. A plain loop rather
        // than .some(), so the check itself allocates no closure either.
        let anyLive = false;
        for (let i = 0; i < this._bubbles.length; i++) {
          if (this._bubbles[i].npcName) { anyLive = true; break; }
        }
        if (!anyLive) return;

        const mapId = $gameMap.mapId();
        const sc = _msgGetScale();
        // Oldest first: whoever has been on screen longest keeps its spot and
        // later arrivals stack clear of it. Ordering by age rather than by
        // position means a bubble never hops as two NPCs walk past each other.
        const live = this._bubbles
          .filter(b => b.npcName)
          .sort((a, b) => a._shownAt - b._shownAt);
        for (const bubble of live) {
          let ev = bubble._ev;
          // Cached Game_Event is only valid on the map it was resolved on
          if (!ev || bubble._evMapId !== mapId) {
            ev = $gameMap.events().find(e => (e.event()?.name || '') === bubble.npcName) || null;
            bubble._ev = ev;
            bubble._evMapId = mapId;
          }
          if (!ev || ev.isTransparent()) {
            this._byName.delete(bubble.npcName);
            bubble.fade();
            continue;
          }
          bubble.updatePosition(ev, sc);
        }
      },

      hideAll() {
        for (const bubble of this._bubbles) bubble.release();
        this._byName.clear();
        this._pending.length = 0;
        if (BubbleLayout) BubbleLayout.clear();
      },
    };
  })();

  // NPCSimulationCore's ThoughtGenerator emits "npc:thought" (via its shared
  // _push helper) every time it records a scheduled or capability-reaction
  // thought onto profile.thoughts, that's our cue to pop a bubble.
  if (ThoughtBubbleManager) {
    const _tryRegister = () => {
      if (!window.NPCSim?.on) return false;
      window.NPCSim.on('npc:thought', ({ name, thought }) => {
        // Every bubble over a head comes through here, whoever raised it, so a
        // species voice is heard however the line reached them (II.1b).
        ThoughtBubbleManager.queue(name, SpeciesVoice.render(thought, name));
      });
      return true;
    };
    if (!_tryRegister()) {
      let attempts = 0;
      const retry = setInterval(() => {
        if (_tryRegister()) { clearInterval(retry); return; }
        if (++attempts >= 60) {
          clearInterval(retry);
          console.warn('[NPCConversation] NPCSim never became available; thought-bubble events disabled.');
        }
      }, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // II.10 SPEC TALK (specialization boast, talk and question bubbles)
  // ---------------------------------------------------------------------------
  // Somebody Advanced or Master at a specialization now and then says so: a
  // boaster boasts, everyone else talks about it in their own register, and a
  // weapon proficiency (the Weapons category, one per weapon type) is talked
  // about in words written for that weapon. Standing near them, somebody less
  // trained in the same thing (Untrained to Intermediate) may ask a question
  // instead, and the expert answers: two beats, NPC to NPC, party to NPC or
  // between two party members. X is the specialization's name as the player
  // reads it (Specializations.displayName), or for a weapon the weapon topic
  // the bank gives, since "Light" says nothing on its own.
  //
  // Words: ConvSkills (I.11), keyed by voice group. The 25 personalities fold
  // into six groups below; Em and Bubba keep a voice of their own and are
  // never framed by a creed. Pacing: ConversationManager's pair scan (every few
  // seconds) calls scan(), which is throttled four ways: a scan chance, a
  // global gap between two spec bubbles, a per-person cooldown of two to four
  // game days AND several real minutes, and a long gap between two lines from
  // the party. The real-time floor matters because the clock moves with steps:
  // on the world map a step is ten game minutes, and game time alone let a
  // walking Master boast far too often. What anybody is trained
  // in is read at most once per game hour per person, and only a few fresh
  // reads are paid per scan.

  const SPEC_TALK_LEVEL     = 4;     // Advanced and Master talk about it
  const SPEC_ASK_LEVEL      = 3;     // Untrained to Intermediate ask about it
  const SPEC_COOLDOWN_MIN   = 2 * 1440; // game minutes (two to four days) before the same person does it again
  const SPEC_COOLDOWN_MAX   = 4 * 1440;
  const SPEC_REAL_COOLDOWN_MIN_MS = 5 * 60000;  // and real time, whatever the clock did meanwhile
  const SPEC_REAL_COOLDOWN_MAX_MS = 10 * 60000;
  const SPEC_PARTY_GAP_MS   = 4 * 60000;        // between any two party spec lines
  const SPEC_GAP_MS         = 7000;  // at most one spec bubble (or exchange) this often
  const SPEC_SCAN_CHANCE    = 0.3;   // per conversation scan
  const SPEC_ASK_DIST       = 3;     // tiles between an asker and the expert
  const SPEC_ASK_CHANCE     = 0.6;   // a nearby learner asks rather than the expert talking
  const SPEC_UNTRAINED_ASK  = 0.35;  // an Untrained bystander is this much less likely to ask
  const SPEC_ANSWER_MS      = 3300;  // the answer follows the question after this long
  const SPEC_NEW_READS      = 4;     // uncached level reads paid per scan
  const SPEC_CACHE_MAX      = 300;
  const SPEC_VOICE_CHANCE   = 0.25;  // the personality opener or closer on top of the group's words
  const SPEC_CREED_CHANCE   = 0.12;
  const SPEC_DEFAULT_GROUP  = 'analytical'; // i18n-ignore: bank key
  // i18n-ignore-start: personality names (PersonalityData.json) and bank keys
  const SPEC_VOICE_GROUPS = {
    Aggressive: 'boastful', Authoritative: 'boastful', Brave: 'boastful', Impulsive: 'boastful', Hedonistic: 'boastful',
    Nervous: 'humble', Timid: 'humble', Cautious: 'humble', Paranoid: 'humble',
    Scholarly: 'analytical', Disciplined: 'analytical', Calm: 'analytical', Stoic: 'analytical',
    Empathetic: 'warm', Nurturing: 'warm', Sanguine: 'warm', Loyal: 'warm',
    Cynical: 'wry', Grumpy: 'wry', Melancholic: 'wry', Fatalistic: 'wry', Apathetic: 'wry',
    Artistic: 'playful', Adventurous: 'playful', Mischievous: 'playful',
  };
  // Story actors matched by name at runtime: they speak as themselves.
  const SPEC_OWN_VOICES = { em: 'em', bubba: 'bubba' };
  const SPEC_STATES = ['idle', 'wandering', 'socializing', 'inZone', 'working', 'interacting', 'goingToZone', 'goingToWork'];
  const SPEC_KINDS = ['talk', 'question', 'answer'];
  // i18n-ignore-end

  function _specMinute() {
    return (typeof $gameVariables !== 'undefined' && $gameVariables?.value?.(114)) || 0;
  }
  function _specNowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  const SpecTalk = {
    TALK_LEVEL: SPEC_TALK_LEVEL,
    ASK_LEVEL: SPEC_ASK_LEVEL,
    COOLDOWN_MIN: SPEC_COOLDOWN_MIN,
    COOLDOWN_MAX: SPEC_COOLDOWN_MAX,
    GAP_MS: SPEC_GAP_MS,
    REAL_COOLDOWN_MIN_MS: SPEC_REAL_COOLDOWN_MIN_MS,
    REAL_COOLDOWN_MAX_MS: SPEC_REAL_COOLDOWN_MAX_MS,
    PARTY_GAP_MS: SPEC_PARTY_GAP_MS,
    GROUPS: SPEC_VOICE_GROUPS,
    _cooldowns: new Map(),   // person key -> game minute they may speak about a spec again
    _realCooldowns: new Map(), // person key -> performance.now() they may speak again
    _partyNextAt: 0,         // performance.now() before which no party member speaks about a spec
    _levels: new Map(),      // person key -> { hour, levels: Map(specId -> level) }
    _queue: [],              // pending answer beats: { at, person, text, mapId }
    _nextAt: 0,              // performance.now() before which no spec bubble starts

    // The voice group a speaker's words are drawn from.
    voiceGroupOf(persName, name) {
      const own = SPEC_OWN_VOICES[String(name || '').trim().toLowerCase()];
      if (own) return own;
      return (persName && SPEC_VOICE_GROUPS[persName]) || SPEC_DEFAULT_GROUP;
    },

    // The bank key of a weapon proficiency ('sword', 'gun' ...), or null for
    // any other specialization or a weapon type the bank has no words for.
    weaponKeyOf(spec) {
      if (!spec || !spec.wtypeId) return null;
      const key = String(spec.name || '').trim().toLowerCase();
      return (key && SPEC_TALK().weapon?.[key]) ? key : null;
    },

    specOf(id) {
      const S = window.Specializations;
      return (S && S.byId && S.byId.get) ? (S.byId.get(Number(id)) || null) : null;
    },

    // X: what the specialization is called in a sentence.
    topicOf(spec) {
      const wkey = this.weaponKeyOf(spec);
      const topic = wkey ? SPEC_TALK().weaponTopic?.[wkey] : null;
      if (topic) return topic;
      const S = window.Specializations;
      if (spec && S && typeof S.displayName === 'function') return S.displayName(spec) || spec.name || '';
      return spec?.name || '';
    },

    levelNameOf(level) {
      const S = window.Specializations;
      return (S && typeof S.levelName === 'function') ? S.levelName(level) : String(level);
    },

    // The pool one line is drawn from: a weapon's own words for a weapon
    // proficiency (unless the speaker keeps a voice of their own), the group's
    // talk otherwise. Question and answer pools are by group alone.
    poolFor(kind, group, spec) {
      if (!SPEC_KINDS.includes(kind)) return null;
      const bankAll = SPEC_TALK();
      if (kind === 'talk') {
        const wkey = this.weaponKeyOf(spec);
        const own = !!SPEC_OWN_VOICES[group];
        const wpool = (wkey && !own) ? bankAll.weapon[wkey][group] || bankAll.weapon[wkey][SPEC_DEFAULT_GROUP] : null;
        if (Array.isArray(wpool) && wpool.length) return wpool;
      }
      const table = bankAll[kind] || {};
      const pool = table[group] || table[SPEC_DEFAULT_GROUP];
      return Array.isArray(pool) && pool.length ? pool : null;
    },

    // One line. `person` is { name, persName, profile, actor }; `params.name`
    // is the other person in a question or answer. Null when nothing fits.
    line(kind, person, specId, level, params) {
      const spec = this.specOf(specId);
      if (!spec || !person) return null;
      const group = this.voiceGroupOf(person.persName, person.name);
      const pool = this.poolFor(kind, group, spec);
      if (!pool) return null;
      const fill = {
        spec: this.topicOf(spec),
        level: this.levelNameOf(level),
        name: params && params.name != null ? String(params.name) : null,
      };
      const fits = pool.filter(l => typeof l === 'string' &&
        (l.match(/\{(spec|level|name)\}/g) || []).every(m => fill[m.slice(1, -1)] != null));
      if (!fits.length) return null;
      const raw = _pickFrom(fits).replace(/\{(spec|level|name)\}/g, (m, k) => String(fill[k]));
      if (SPEC_OWN_VOICES[group]) return vary(raw, null);
      let text = applyVoice(raw, person.persName, SPEC_VOICE_CHANCE);
      // A townsperson's creed frames a trade now and then (II.9); a party
      // member, Em and Bubba speak as themselves.
      if (!person.actor && person.profile && kind === 'talk') {
        text = CreedVoice.decorate(text, person.profile, 'work', SPEC_CREED_CHANCE, null, person.name);
      }
      return text;
    },

    // ---- who is trained in what, once per game hour ------------------------
    // id -> level (2-5) for everything above Untrained. Null when the read is
    // not cached this hour and `budget` has run out.
    levelsOf(person, budget) {
      if (!person || !person.key) return null;
      const hour = Math.floor(_specMinute() / 60);
      const hit = this._levels.get(person.key);
      if (hit && hit.hour === hour) return hit.levels;
      if (budget) { if (budget.n <= 0) return null; budget.n--; }
      let levels = new Map();
      try { levels = this._readLevels(person); } catch (_) { levels = new Map(); }
      this._levels.set(person.key, { hour, levels });
      if (this._levels.size > SPEC_CACHE_MAX) this._levels.delete(this._levels.keys().next().value);
      return levels;
    },

    _readLevels(person) {
      const out = new Map();
      if (person.levels instanceof Map) return person.levels;
      const actor = person.actor;
      if (actor && typeof actor.specializationLevel === 'function') {
        const S = window.Specializations;
        if (!S || !S.ready || !Array.isArray(S.list)) return out;
        for (const spec of S.list) {
          const lvl = Number(actor.specializationLevel(spec.id)) || 1;
          if (lvl > 1) out.set(spec.id, lvl);
        }
        return out;
      }
      const Specs = window.NPCSim && window.NPCSim.Specs;
      if (!Specs || !person.profile || typeof Specs.levelsFor !== 'function') return out;
      return Specs.levelsFor(person.profile, person.profile.assignedClassId, person.name) || out;
    },

    // The specialization somebody is proud of right now: one at Advanced or
    // above, a Master's twice as likely to come up. Null when there is none.
    pickSpec(levels) {
      if (!levels || !levels.size) return null;
      const list = [];
      let total = 0;
      levels.forEach((lvl, id) => {
        if (lvl < SPEC_TALK_LEVEL || !this.specOf(id)) return;
        const w = lvl >= 5 ? 2 : 1;
        list.push({ id: Number(id), level: lvl, w });
        total += w;
      });
      if (!list.length) return null;
      let roll = Math.random() * total;
      for (const e of list) { roll -= e.w; if (roll <= 0) return { id: e.id, level: e.level }; }
      return { id: list[list.length - 1].id, level: list[list.length - 1].level };
    },

    // ---- throttles ----------------------------------------------------------
    // On cooldown until both the game days and the real minutes have passed,
    // and a party member also waits out the party gap.
    onCooldown(person, minute, nowMs) {
      const until = this._cooldowns.get(person.key);
      if (until != null && (minute ?? _specMinute()) < until) return true;
      const t = nowMs ?? _specNowMs();
      const realUntil = this._realCooldowns.get(person.key);
      if (realUntil != null && t < realUntil) return true;
      return !!person.actor && t < this._partyNextAt;
    },

    setCooldown(person, minute, nowMs) {
      const now = minute ?? _specMinute();
      const span = SPEC_COOLDOWN_MIN + Math.floor(Math.random() * (SPEC_COOLDOWN_MAX - SPEC_COOLDOWN_MIN + 1));
      this._cooldowns.set(person.key, now + span);
      const t = nowMs ?? _specNowMs();
      const realSpan = SPEC_REAL_COOLDOWN_MIN_MS + Math.random() * (SPEC_REAL_COOLDOWN_MAX_MS - SPEC_REAL_COOLDOWN_MIN_MS);
      this._realCooldowns.set(person.key, t + realSpan);
      if (person.actor) this._partyNextAt = t + SPEC_PARTY_GAP_MS;
      if (this._cooldowns.size > SPEC_CACHE_MAX) {
        for (const [k, until] of this._cooldowns) if (until <= now) this._cooldowns.delete(k);
      }
      if (this._realCooldowns.size > SPEC_CACHE_MAX) {
        for (const [k, until] of this._realCooldowns) if (until <= t) this._realCooldowns.delete(k);
      }
    },

    // ---- who is standing here ----------------------------------------------
    _personalityNameOfActor(actor, profile) {
      const fromProfile = _personalityNameOf(profile);
      if (fromProfile) return fromProfile;
      // Same fallback as PartyBanter: a member with no archetype on file is
      // given one off their actor id, so it never changes under them.
      const list = window._NPCSocietyDataLoader?.personalities || window.Health?.PersonalityData || null;
      if (!Array.isArray(list) || !list.length) return null;
      const id = (actor.actorId && actor.actorId()) || 1;
      const index = (id * 7 + String(actor.name() || '').length * 3) % list.length;
      return list[index]?.name ?? null;
    },

    _npcPeople() {
      const CM = window.NPCConversation._internal.ConversationManager;
      if (!CM || typeof CM._eligibleControllers !== 'function') return [];
      const out = [];
      for (const ctrl of CM._eligibleControllers(SPEC_STATES)) {
        const name = ctrl.eventName;
        if (CM._isNonSentient(name)) continue;
        const profile = window.NPCConversation._internal._getProfile(name);
        if (!profile || LifeTalk.isChild(profile) || LifeTalk.isNewborn(profile)) continue;
        out.push({
          key: name, name, profile, persName: _personalityNameOf(profile),
          ctrl, actor: null, char: ctrl.event, x: ctrl.event.x, y: ctrl.event.y,
        });
      }
      return out;
    },

    _partyPeople() {
      const out = [];
      if (typeof $gameParty === 'undefined' || !$gameParty || typeof $gamePlayer === 'undefined' || !$gamePlayer) return out;
      if ($gamePlayer.isInVehicle && $gamePlayer.isInVehicle()) return out;
      if (typeof $gameMessage !== 'undefined' && $gameMessage?.isBusy?.()) return out;
      if ($gameMap?.isEventRunning?.()) return out;
      const members = ($gameParty.members && $gameParty.members()) || [];
      const followers = ($gamePlayer.followers && $gamePlayer.followers().data && $gamePlayer.followers().data()) || [];
      const NC = window.NPCCreature;
      members.forEach((actor, i) => {
        if (!actor || (actor.isDead && actor.isDead())) return;
        if (NC && NC.isNonSentientActor && NC.isNonSentientActor(actor)) return;
        const char = i === 0 ? $gamePlayer : followers[i - 1];
        if (!char || (i > 0 && (!char.isVisible || !char.isVisible())) || (char.isTransparent && char.isTransparent())) return;
        const name = actor.name();
        let profile = null;
        try { profile = window.NPCSocietyRegistry?.getProfile?.(name) || null; } catch (_) { profile = null; }
        out.push({
          key: 'party:' + ((actor.actorId && actor.actorId()) || name), name, profile,
          persName: this._personalityNameOfActor(actor, profile),
          ctrl: null, actor, char, x: char.x, y: char.y,
        });
      });
      return out;
    },

    people() {
      return this._npcPeople().concat(this._partyPeople());
    },

    // ---- the scan (rides ConversationManager's pair scan) ---------------------
    // One bubble or one question and answer, or nothing. `opts` (for tests and
    // callers that already hold the crowd): people, now (ms), force (skip the
    // scan chance and the global gap), ask (true / false forces the choice).
    // Returns what was said: { kind: 'talk' | 'ask', specId, level, speaker,
    // asker, lines }, or null.
    scan(opts) {
      const o = opts || {};
      const now = o.now ?? _specNowMs();
      if (!o.force) {
        if (now < this._nextAt) return null;
        if (Math.random() >= SPEC_SCAN_CHANCE) return null;
      }
      const people = o.people || this.people();
      if (!people || !people.length) return null;
      const minute = _specMinute();
      const budget = { n: SPEC_NEW_READS };

      // A talker: someone off cooldown with something to be proud of, looked
      // for from a random place in the crowd so nobody always goes first.
      const n = people.length;
      const start = Math.floor(Math.random() * n);
      let talker = null, pick = null;
      for (let k = 0; k < n && !talker; k++) {
        const p = people[(start + k) % n];
        if (!p || this.onCooldown(p, minute, now)) continue;
        const levels = this.levelsOf(p, budget);
        const s = levels ? this.pickSpec(levels) : null;
        if (s) { talker = p; pick = s; }
      }
      if (!talker) return null;

      const wantAsk = o.ask != null ? !!o.ask : Math.random() < SPEC_ASK_CHANCE;
      const asker = wantAsk ? this._findAsker(people, talker, pick.id, minute, budget, o.ask === true, now) : null;
      const said = asker ? this._exchange(talker, asker, pick, now) : this._talk(talker, pick);
      if (!said) return null;
      this.setCooldown(talker, minute, now);
      if (asker) this.setCooldown(asker, minute, now);
      this._nextAt = now + SPEC_GAP_MS + (asker ? SPEC_ANSWER_MS : 0);
      return said;
    },

    // Somebody near the expert who is less trained in the same thing.
    _findAsker(people, talker, specId, minute, budget, certain, now) {
      for (const q of people) {
        if (!q || q === talker || q.key === talker.key) continue;
        if (Math.abs(q.x - talker.x) + Math.abs(q.y - talker.y) > SPEC_ASK_DIST) continue;
        if (this.onCooldown(q, minute, now)) continue;
        const levels = this.levelsOf(q, budget);
        if (!levels) continue;
        const lvl = levels.get(specId) || 1;
        if (lvl > SPEC_ASK_LEVEL) continue;
        if (lvl <= 1 && !certain && Math.random() >= SPEC_UNTRAINED_ASK) continue;
        return q;
      }
      return null;
    },

    _talk(talker, pick) {
      const text = this.line('talk', talker, pick.id, pick.level, null);
      if (!text) return null;
      this._say(talker, text);
      return { kind: 'talk', specId: pick.id, level: pick.level, speaker: talker.name, asker: null, lines: [text] };
    },

    _exchange(talker, asker, pick, now) {
      const q = this.line('question', asker, pick.id, pick.level, { name: talker.name });
      const a = this.line('answer', talker, pick.id, pick.level, { name: asker.name });
      if (!q || !a) return null;
      if (asker.ctrl && talker.char) asker.ctrl.turnToward?.(talker.char);
      if (talker.ctrl && asker.char) talker.ctrl.turnToward?.(asker.char);
      this._say(asker, q);
      this._queue.push({ at: now + SPEC_ANSWER_MS, person: talker, text: a, mapId: this._mapId() });
      return { kind: 'ask', specId: pick.id, level: pick.level, speaker: talker.name, asker: asker.name, lines: [q, a] };
    },

    _mapId() {
      return (typeof $gameMap !== 'undefined' && $gameMap?.mapId) ? $gameMap.mapId() : 0;
    },

    // A townsperson's bubble goes through the npc:thought bus like every other
    // line; a party member's through AutoIdleExplorer's bubble over the player
    // or the follower, the one every party line uses.
    _say(person, text) {
      if (!person || !text) return;
      text = SpeciesVoice.render(text, person.actor || person.profile || person.name);
      if (person.actor) {
        const api = window.AutoIdleExplorer && window.AutoIdleExplorer.bubble;
        if (api && person.char) api.show(person.char, text);
        return;
      }
      window.NPCSim?.emit?.('npc:thought', { name: person.name, thought: text });
    },

    // Per frame: nothing to do unless an answer is waiting.
    update(now) {
      if (!this._queue.length) return;
      const t = now ?? _specNowMs();
      while (this._queue.length && this._queue[0].at <= t) {
        const beat = this._queue.shift();
        if (beat.mapId !== this._mapId()) continue;
        const ev = beat.person.ctrl?.event;
        if (ev && ev._erased) continue;
        this._say(beat.person, beat.text);
      }
    },

    clear() {
      this._queue.length = 0;
    },

    reset() {
      this._queue.length = 0;
      this._cooldowns.clear();
      this._realCooldowns.clear();
      this._partyNextAt = 0;
      this._levels.clear();
      this._nextAt = 0;
    },
  };

  Object.assign(window.NPCConversation._internal, {
    AddictionThoughts, BubbleLayout, CareThoughts, CravingProvider, NEED_SEVERITY, NeedThoughts,
    PERSONALITY_NEED_CHANCE, SituationalThoughts, SpeciesThoughts, SpecTalk,
    ThoughtBubbleManager, ThoughtProvider,
  });
})();
