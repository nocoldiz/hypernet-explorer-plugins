/*:
 * @target MZ
 * @plugindesc NPC Empathize: per-actor predisposition
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @orderAfter NPCEmpathize_Helpers
 * @help
 * ============================================================================
 * NPCEmpathize_Predisposition, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 3b, PER-ACTOR PREDISPOSITION: opinion, attraction, join
 * chances and the Em and Bubba stances.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathize_Helpers.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _getProfile, _getT, _presetFromEvent, _rand, _socialLines,
  } = window.NPCEmpathize._internal;

  // ============================================================================
  // SECTION 3b, PER-ACTOR PREDISPOSITION
  // ============================================================================

  // How far apart two creeds have to stand (mean axis distance, 0..200) before
  // the difference stops being felt as agreement and starts being felt as
  // disagreement, how hard each point past that lands, and the ceiling either
  // way. Two ordinary people are typically 40-60 apart.
  const CREED_NEUTRAL_DISTANCE = 45;
  const CREED_OPINION_WEIGHT   = 0.5;
  const CREED_OPINION_MAX      = 22;

  // Trait + ideology compatibility bonus an NPC feels toward ONE actor. This is
  // the innate, unchanging part of a reputation (who you are), on top of the
  // earned per-actor base opinion (what you've done).
  function _traitCompatBonus(profile, actor) {
    const npcTraitIds         = new Set(profile?.traitIds ?? []);
    const allTraits           = window.Health?.Traits ?? [];
    const npcIdeology         = window.NPCShared?.ideologyFor(profile) ?? null;
    const npcIdeologyTraitIds = new Set(npcIdeology?.traits ?? []);
    const actorTraitIds       = (actor?._selectedTraits ?? []).map(t => t.id);

    let bonus = 0;
    for (const id of actorTraitIds) {
      if (npcTraitIds.has(id)) bonus += 15;
      if (npcIdeologyTraitIds.has(id)) bonus += 10;
      const def = allTraits.find(t => t.id === id);
      if (def?.incompatible) {
        for (const incompId of def.incompatible) {
          if (npcTraitIds.has(incompId)) bonus -= 20;
        }
      }
    }
    for (const npcId of npcTraitIds) {
      const def = allTraits.find(t => t.id === npcId);
      if (def?.incompatible) {
        for (const incompId of def.incompatible) {
          if (actorTraitIds.includes(incompId) && !npcIdeologyTraitIds.has(incompId)) {
            bonus -= 20;
          }
        }
      }
    }

    // Creed against creed. A party member only has one when they were built
    // with a society profile of their own (the Detailed character editor gives
    // every one it makes one), and where both sides have one the five-axis
    // distance between what they believe is felt on sight: a shared creed
    // opens the conversation warm, an opposed one closes it before it starts.
    // Nothing changes for a party that has no creed on file.
    const actorProfile = window.NPCSocietyRegistry?.getProfile?.(actor?.name?.() ?? "");
    const actorIdeology = actorProfile ? window.NPCShared?.ideologyFor(actorProfile) : null;
    if (actorIdeology && npcIdeology) {
      const distance = window.NPCShared.ideologyDistance(npcIdeology, actorIdeology);
      const felt = (CREED_NEUTRAL_DISTANCE - distance) * CREED_OPINION_WEIGHT;
      bonus += Math.round(Math.max(-CREED_OPINION_MAX, Math.min(CREED_OPINION_MAX, felt)));
    }
    return bonus;
  }

  // ── Hygiene: who has washed, and who minds ──────────────────────────────
  // Standing close enough to talk means smelling the other person, so the state
  // of BOTH bodies moves the disposition: the party member doing the talking
  // (their hygiene need, TimeDateSystem) and the NPC (profile.hygiene, drained
  // by NPCSimulationCore and refilled at a sink or a WC). Recoiling from
  // somebody costs a conversation as much as being recoiled from does.
  //
  // It is felt hardest when courting: _romanceChance (NPCEmpathizeUI.js) reads
  // the same number a second time, at its own weight, on top of the disposition
  // this already dulled.
  //
  // Above HYGIENE_CLEAN nobody notices anything. Below it, every point costs.
  const HYGIENE_CLEAN       = 60;   // hygiene % at or above which nobody minds
  const HYGIENE_WEIGHT      = 0.42; // opinion points per point below the line
  const HYGIENE_MAX_PENALTY = 45;   // floor, however filthy both parties are

  // How much a trait makes the person CARRYING it mind the state of whoever is
  // standing in front of them (Traits.json ids). It is read on both sides: an
  // NPC's traits decide how much the party member offends them, the party
  // member's traits decide how much the NPC does. Multiplier on the penalty,
  // 0 means the smell never registers at all, above 1 means it registers twice
  // over. Several traits multiply together, and a single 0 wins outright.
  const HYGIENE_TRAIT_MULT = {
    // ── Does not register it ───────────────────────────────────────────────
    189: 0,    // Feral, raised in the wilderness: this is what people smell like
    // ── Tolerates it ───────────────────────────────────────────────────────
    50:  0.25, // Ascetic, mortifying the flesh is rather the point
    124: 0.3,  // Street Urchin, grew up where nobody had a bath either
    184: 0.3,  // Cave Dweller
    97:  0.3,  // Survivalist, has been worse for longer
    130: 0.35, // Slave-Born
    137: 0.35, // Farmer, has spent the morning in the muck
    86:  0.4,  // Slothful, minds it but not enough to do anything about it
    27:  0.4,  // Hoarder, lives in worse and defends it
    136: 0.45, // Veteran, has slept in trenches with the same people for months
    // ── Minds it far more than most ────────────────────────────────────────
    91:  1.3,  // Proud, expects better company than this
    131: 1.4,  // Wealthy, has never had to be near it
    144: 1.5,  // Beautiful, keeps the company they believe they are owed
    30:  1.6,  // Perfectionist
    123: 1.7,  // Noble, raised to treat it as a moral failing
    56:  1.9,  // Hypochondriac, every unwashed body is a diagnosis
    23:  2.6,  // Germaphobe, the one trait this is really about
  };

  function _actorTraitIds(actor) {
    return (actor?._selectedTraits ?? []).map(t => t?.id).filter(id => id != null);
  }

  function _hygieneToleranceMult(traitIds) {
    let mult = 1;
    for (const id of traitIds || []) {
      const m = HYGIENE_TRAIT_MULT[id];
      if (m === undefined) continue;
      if (m === 0) return 0;
      mult *= m;
    }
    return Math.min(3, mult);
  }

  // One side's reaction to the other's state. Always <= 0.
  function _hygieneSidePenalty(hygienePct, perceiverTraitIds) {
    const raw   = Number(hygienePct ?? 100);
    if (!isFinite(raw)) return 0; // a meter nobody has written yet is not a smell
    const short = HYGIENE_CLEAN - Math.max(0, Math.min(100, raw));
    if (short <= 0) return 0;
    const mult = _hygieneToleranceMult(perceiverTraitIds);
    if (!mult) return 0;
    return -(short * HYGIENE_WEIGHT * mult);
  }

  // The two halves of the reading, in opinion points (each <= 0): `theirs` is
  // what the NPC makes of the party member, `mine` what the party member makes
  // of the NPC. Split out so the UI can say which of the two needs a bath.
  function _hygieneReadout(profile, actor) {
    if (!profile || !actor) return { theirs: 0, mine: 0 };
    const actorHyg = actor.hygienePercent ? actor.hygienePercent() : 100;
    return {
      theirs: _hygieneSidePenalty(actorHyg,        profile.traitIds ?? []),
      mine:   _hygieneSidePenalty(profile.hygiene, _actorTraitIds(actor)),
    };
  }

  // Both directions at once, in opinion points (always <= 0). `weight` lets a
  // caller ask for a harsher reading of the same two bodies.
  function _hygienePenalty(profile, actor, weight = 1) {
    const { theirs, mine } = _hygieneReadout(profile, actor);
    const total = theirs + mine;
    if (!total) return 0;
    return Math.round(Math.max(-HYGIENE_MAX_PENALTY, total * weight));
  }

  // ── Look stats: how a party member is turned out ─────────────────────────
  // Arcane, Substance, Stealth and Intimidation, 0 to 100%, read off the gear
  // they wear (window.LookStats, ItemSystemEquipment). They tilt what an NPC
  // makes of them and the odds of what they try, and an icon of a look (100%)
  // counts for more. window.NPCEmpathize.Look is the one place this is worked
  // out: the panel prints what it returns, the rolls add what it returns.
  const LOOK_IMPRESSION_CAP = 15;
  const LOOK_ICON_IMPRESSION = 2;
  const LOOK_ICON_ODDS = 1.5;
  function _lookOf(actor) {
    return (window.LookStats && actor) ? window.LookStats.ofActor(actor)
      : { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
  }
  // What the NPC makes of each half of the look, in opinion points.
  function _lookImpressionParts(profile, actor) {
    const out = { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
    if (!profile || !actor || !window.LookStats) return out;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return out;
    const me = _lookOf(actor);
    const icon = s => (me[s] >= 100 ? LOOK_ICON_IMPRESSION : 1);
    const tier = Number(profile.wealthTierBase ?? 2);
    // Good clothes warm the well-off and needle the poor a little.
    out.substance = (tier >= 3 ? me.substance / 10 : tier <= 0 ? -me.substance / 25 : me.substance / 20) * icon('substance');
    // A practitioner draws another one and unsettles everybody else.
    out.arcane = ((Number(profile.arcane) || 0) >= 40 ? me.arcane / 10 : -me.arcane / 25) * icon('arcane');
    // Menace frightens, unless the one looking is frightening too.
    out.intimidation = ((Number(profile.intimidation) || 0) >= 40 ? me.intimidation / 20 : -me.intimidation / 12) * icon('intimidation');
    // Somebody dressed not to be seen is barely registered: every other part
    // of the impression comes through fainter.
    const faint = 1 - Math.min(0.6, (me.stealth / 250) * icon('stealth'));
    out.substance *= faint;
    out.arcane *= faint;
    out.intimidation *= faint;
    out.stealth = -Math.round((1 - faint) * 100);
    return out;
  }
  function _lookImpression(profile, actor) {
    const p = _lookImpressionParts(profile, actor);
    const total = p.substance + p.arcane + p.intimidation;
    return Math.round(Math.max(-LOOK_IMPRESSION_CAP, Math.min(LOOK_IMPRESSION_CAP, total)));
  }
  // The percentage points a look adds to one action's odds.
  function _lookOdds(kind, actor, profile) {
    if (!actor || !window.LookStats) return 0;
    const me = _lookOf(actor);
    const icon = s => (me[s] >= 100 ? LOOK_ICON_ODDS : 1);
    switch (kind) {
      case 'pickpocket':
        return Math.round(me.stealth / 4 * icon('stealth') - (Number(profile?.stealth) || 0) / 10);
      case 'bribe':
        return Math.round(me.substance / 5 * icon('substance'));
      case 'romance':
        return Math.round(me.substance / 10 * icon('substance'));
      case 'join': {
        // People follow somebody who looks the way they do: the NPC's own
        // strongest look is the one that counts.
        if (!profile) return 0;
        const keys = window.LookStats.STATS;
        const theirs = keys.reduce((a, b) => ((Number(profile[b]) || 0) > (Number(profile[a]) || 0) ? b : a), keys[0]);
        if (!((Number(profile[theirs]) || 0) > 0)) return 0;
        return Math.round(me[theirs] / 10 * icon(theirs));
      }
    }
    return 0;
  }
  // How much harder a social move lands: a hostile one on Intimidation, a
  // friendly one on Substance.
  function _lookSocialMult(actor, tone) {
    if (!actor || !window.LookStats) return 1;
    const me = _lookOf(actor);
    if (tone === 'negative') return 1 + (me.intimidation / 100) * (me.intimidation >= 100 ? LOOK_ICON_ODDS : 1);
    if (tone === 'positive') return 1 + (me.substance / 200) * (me.substance >= 100 ? LOOK_ICON_ODDS : 1);
    return 1;
  }
  // Everything above for one pair, for the panel to print.
  function _lookEffects(profile, actor) {
    return {
      impression: _lookImpression(profile, actor),
      parts: _lookImpressionParts(profile, actor),
      pickpocket: _lookOdds('pickpocket', actor, profile),
      bribe: _lookOdds('bribe', actor, profile),
      romance: _lookOdds('romance', actor, profile),
      join: _lookOdds('join', actor, profile),
      hostile: Math.round((_lookSocialMult(actor, 'negative') - 1) * 100),
      friendly: Math.round((_lookSocialMult(actor, 'positive') - 1) * 100),
    };
  }
  window.NPCEmpathize.Look = {
    impression: _lookImpression, parts: _lookImpressionParts, odds: _lookOdds,
    socialMult: _lookSocialMult, effects: _lookEffects,
  };

  // ── Personality-driven social reactions ─────────────────────────────────
  // Same Praise/Insult/Joke/etc. lands with a different weight depending on
  // the NPC's PersonalityData.json archetype, on top of the tone-based math
  // in _socialInteract. Multiplier on the delta the interaction would
  // otherwise produce for that tone bucket (positive/neutral/negative).
  const PERSONALITY_SOCIAL_MODS = {
    Nervous:       { positive: 1.1, neutral: 1.0, negative: 1.3 },
    Calm:          { positive: 0.9, neutral: 1.0, negative: 0.7 },
    Aggressive:    { positive: 0.7, neutral: 0.9, negative: 1.4 },
    Melancholic:   { positive: 1.2, neutral: 0.9, negative: 1.1 },
    Sanguine:      { positive: 1.3, neutral: 1.1, negative: 0.9 },
    Cautious:      { positive: 0.8, neutral: 1.0, negative: 1.1 },
    Impulsive:     { positive: 1.1, neutral: 0.9, negative: 1.3 },
    Stoic:         { positive: 0.6, neutral: 0.8, negative: 0.6 },
    Paranoid:      { positive: 0.6, neutral: 0.9, negative: 1.3 },
    Empathetic:    { positive: 1.3, neutral: 1.1, negative: 1.1 },
    Authoritative: { positive: 0.8, neutral: 1.0, negative: 1.2 },
    Scholarly:     { positive: 0.9, neutral: 1.2, negative: 0.9 },
    Artistic:      { positive: 1.2, neutral: 1.1, negative: 1.0 },
    Adventurous:   { positive: 1.0, neutral: 1.2, negative: 0.9 },
    Nurturing:     { positive: 1.3, neutral: 1.1, negative: 0.8 },
    Mischievous:   { positive: 0.9, neutral: 1.2, negative: 0.7 },
    Cynical:       { positive: 0.5, neutral: 0.9, negative: 1.1 },
    Disciplined:   { positive: 0.8, neutral: 1.0, negative: 0.9 },
    Fatalistic:    { positive: 0.7, neutral: 0.8, negative: 0.8 },
    Grumpy:        { positive: 0.6, neutral: 0.8, negative: 1.3 },
    Loyal:         { positive: 1.2, neutral: 1.0, negative: 1.2 },
    Brave:         { positive: 0.9, neutral: 1.0, negative: 0.7 },
    Timid:         { positive: 1.2, neutral: 1.0, negative: 1.4 },
    Hedonistic:    { positive: 1.2, neutral: 1.2, negative: 0.8 },
    Apathetic:     { positive: 0.5, neutral: 0.6, negative: 0.6 },
  };
  function _personalityName(profile) {
    return window._NPCSocietyDataLoader?.personalities?.[profile?.personalityIndex]?.name || null;
  }
  function _personalitySocialMult(profile, tone) {
    const mods = PERSONALITY_SOCIAL_MODS[_personalityName(profile)];
    return mods ? (mods[tone] ?? 1) : 1;
  }

  // ── Em: how the world treats the witch who fed the spear ────────────────
  // Em's memories were forged into the Lance of Memory, the weapon that killed
  // the Father aspect of YHWH, and every sacred spell in the world died with
  // him (docs/Lore.odt). She is famous for it, so almost nobody meets her as a
  // person: the devout blame her, most people just want her to be famous
  // somewhere else, and the ones who are warm are usually warm about the story
  // rather than the woman. All of it is gated on Switch 48 (set by her dossier)
  // AND on Em being the party member actually doing the talking, so an ordinary
  // playthrough never sees any of it. Lines and numbers live in the "em" block
  // of js/db/NPC/SocialLines.json, whose "player" pool is what she says back.
  const EM_SWITCH   = 48;
  const EM_NAME     = 'Em';       // i18n-ignore: actor name, matched at runtime
  const BUBBA_NAME  = 'Bubba';    // i18n-ignore: actor name, matched at runtime
  const TRAIT_DEVOUT = 116;
  // Factions that answer to a god, or are one: the Gods themselves, the
  // libertarian gods, and the Vatican's three arms (WorldGen/Factions.json).
  const EM_ZEALOT_FACTIONS = new Set([18, 24, 27, 28, 29]);

  // Default reaction per PersonalityData.json archetype. Zealotry is layered on
  // top of this by belief, not by temperament.
  const EM_STANCE_BY_PERSONALITY = {
    Nervous: 'gawker',      Calm: 'gawker',        Aggressive: 'annoyed',
    Melancholic: 'gawker',  Sanguine: 'fan',       Cautious: 'gawker',
    Impulsive: 'fan',       Stoic: 'annoyed',      Paranoid: 'annoyed',
    Empathetic: 'genuine',  Authoritative: 'annoyed', Scholarly: 'gawker',
    Artistic: 'fan',        Adventurous: 'clout',  Nurturing: 'genuine',
    Mischievous: 'fan',     Cynical: 'annoyed',    Disciplined: 'annoyed',
    Fatalistic: 'gawker',   Grumpy: 'annoyed',     Loyal: 'clout',
    Brave: 'clout',         Timid: 'gawker',       Hedonistic: 'fan',
    Apathetic: 'annoyed',
  };

  function _emHash(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Is this playthrough Em's? Switch 48 is set by her dossier when creation
  // ends, so it also survives her being handed the party lead later.
  function _emPlaythrough() {
    return !!window.$gameSwitches?.value(EM_SWITCH);
  }
  function _isEmActor(actor) {
    return !!actor && actor.name() === EM_NAME && _emPlaythrough();
  }
  function _emPartyActor() {
    return ($gameParty?.members() ?? []).find(m => m && m.name() === EM_NAME) || null;
  }
  // Bubba is the exception to all of it: the man she shares the camper with.
  // Matched by event name or by a "Preset: Bubba" comment on the event.
  function _isBubbaNpc(npcName, event) {
    if (String(npcName || '').trim().toLowerCase() === BUBBA_NAME.toLowerCase()) return true;
    const preset = event ? _presetFromEvent(event) : null;
    return String(preset?.name || '').trim().toLowerCase() === BUBBA_NAME.toLowerCase();
  }

  function _emDb() { return _socialLines().em || {}; }

  // "Local" on the event's Note box: this person is anchored to the map they
  // were authored on. NPCSystem owns the tag, never a literal here.
  function _isEmLocalNpc(event) {
    const note = event?.event?.()?.note ?? event?.note ?? '';
    return !!window.NPCSystem?.hasLocalTag?.(note);
  }

  // The spread on a stranger's first impression of her. Her stance says which
  // way a person leans; this says how far, so two gawkers are not the same
  // person. Seeded off the name with a different salt from the stance roll, so
  // it is stable per NPC and does not merely echo which stance they drew.
  const EM_FIRST_IMPRESSION_SPREAD = 22;

  function _emOpinionJitter(npcName) {
    const roll = _emHash('disposition:' + String(npcName || ''));
    return (roll % (EM_FIRST_IMPRESSION_SPREAD * 2 + 1)) - EM_FIRST_IMPRESSION_SPREAD;
  }

  // ── Em's own voice, whoever she is talking to ───────────────────────────
  // The stance blocks above are what the WORLD says back to her. The
  // em.player block is what SHE says, and it is not the party leader's
  // register: she is twenty-something, British, missing most of her life and
  // refuses to treat any of it with the gravity everybody else does, so a
  // line drawn from the house banks sounds like nobody at all. The tone
  // pools (positive / neutral / negative) cover the Socialize buttons; the
  // named pools cover every other line the panel puts in her mouth: the joke
  // she tells, the tale, the poem, the pass she makes, the proposal she puts
  // and the directions she asks for. Anybody she is standing in front of
  // hears this, not only the people written down: Bubba is the one exception,
  // because the em.bubba block owns that conversation outright.
  // The kind is a pool name ('joke', 'story', 'poem', 'romance', 'propose',
  // 'directions') or a tone, and a named pool may itself be keyed by tone.
  function _emVoiceLine(actor, kind, tone) {
    if (!_isEmActor(actor)) return '';
    const pool = (_emDb().player || {})[kind];
    if (!pool) return '';
    const lines = Array.isArray(pool)
      ? pool
      : (pool[tone] || pool.neutral || pool.positive || []);
    return _rand(lines) || '';
  }

  // Which reaction this NPC has to Em. Stable per NPC (hashed from the name),
  // and stamped onto the profile the first time it is resolved so the rest of
  // the panel, and later visits, agree with what was said the first time.
  function _emStanceKey(profile, npcName, event) {
    if (_isBubbaNpc(npcName, event)) return 'bubba';
    if (profile?._emStance) return profile._emStance;
    // Somebody who belongs to the map she is standing on has seen her about,
    // and none of the story that follows her reached their street: they meet
    // her as a person, neither hostile nor starstruck.
    if (_isEmLocalNpc(event)) {
      if (profile) profile._emStance = 'gawker';
      return 'gawker';
    }

    const roll = _emHash(npcName || '');
    let key;
    const traitIds = profile?.traitIds ?? [];
    const devout   = traitIds.includes(TRAIT_DEVOUT);
    const dl       = window._NPCSocietyDataLoader;
    const ideology = window.NPCShared?.ideologyFor(profile) ?? null;
    const theocrat = /theocra/i.test(String(ideology?.id ?? ideology?.name ?? ''));
    const persName = _personalityName(profile);
    if (devout || theocrat || EM_ZEALOT_FACTIONS.has(profile?.factionIndex)) {
      key = 'zealot';
    } else {
      key = EM_STANCE_BY_PERSONALITY[persName] || 'gawker';
      // Word travels: one stranger in five has already decided she is what
      // killed their god, whatever their temperament says.
      if ((roll % 5) === 0) key = 'zealot';
      // Being met as a person is the rare case, even from the warm ones.
      else if (key === 'genuine' && (roll % 3) !== 0) key = 'clout';
    }
    // Only remember a stance that was decided on real data: the society data
    // loader finishes asynchronously, and a personality-less fallback must not
    // freeze this NPC as a gawker for the rest of the world's life.
    if (profile && (persName || key === 'zealot')) profile._emStance = key;
    return key;
  }

  function _emStanceData(key) {
    const db = _emDb();
    return (key === 'bubba' ? db.bubba : db.stances?.[key]) || null;
  }

  // The reaction in play right now, or null when this is not an Em interaction.
  // `actor` is the party member doing the talking, not merely a member.
  function _emContext(profile, npcName, event, actor) {
    if (!_isEmActor(actor)) return null;
    const key  = _emStanceKey(profile, npcName, event);
    const data = _emStanceData(key);
    return data ? { key, data, bubba: key === 'bubba' } : null;
  }

  // First impression: the standing Em starts from with an NPC she has never
  // spoken to. Written once into her own per-actor entry, so everything after
  // it is earned normally and nothing re-seeds on a later visit.
  function _emSeedFirstImpression(profile, npcName, event) {
    if (!profile || !_emPlaythrough()) return;
    const em = _emPartyActor();
    if (!em) return;
    const actorId = em.actorId();
    if (profile.opinions && profile.opinions[actorId] != null) return;
    const key  = _emStanceKey(profile, npcName, event);
    const data = _emStanceData(key);
    if (!data) return;
    // Bubba's 90 is who he is to her, not a modifier on how the world feels.
    // A Local starts level: their own opinion of the party and nothing else.
    // Everybody else gets their stance plus a per-person spread, so the world
    // is not one flat grudge and a stranger can already be on her side.
    let base;
    if (key === 'bubba') {
      base = data.opinion;
    } else if (_isEmLocalNpc(event)) {
      base = (profile.playerOpinion ?? 0);
    } else {
      base = (profile.playerOpinion ?? 0) + (data.opinion ?? 0)
           + _emOpinionJitter(npcName);
    }
    _setNpcBaseOpinion(profile, actorId, base);
  }

  // Tone scaling for a stance block (Em's stances, Bubba's admiration).
  function _stanceToneMult(ctx, tone) {
    const mult = ctx?.data?.toneMult;
    return mult && mult[tone] != null ? mult[tone] : 1;
  }

  // ── Bubba: how the world treats the man who built the Liminal Engine ─────
  // The mirror image of Em's layer. She is famous for what was taken out of
  // her; he is famous for what he gave everybody back, so where her stance is
  // rolled per NPC, his is the same everywhere: admiration. While Bubba is the
  // party member doing the talking, every NPC starts from a higher opinion of
  // him, greets him as the Liminal Engine man, takes anything he says warmly,
  // and hears him answer modestly. Nothing hostile is on the table and nothing
  // romantic either, except with the bubbaromantic, who get one thing: turned
  // down. Gated on Switch 49 (his dossier's) or an actor named Bubba, so an
  // ordinary playthrough never sees any of it. Lines live in the "bubba" block
  // of js/db/NPC/SocialLines.json.
  const BUBBA_SWITCH = 49;

  function _bubbaPlaythrough() {
    if (window.$gameSwitches?.value(BUBBA_SWITCH)) return true;
    return ($gameParty?.members() ?? []).some(m => m && m.name() === BUBBA_NAME);
  }
  function _isBubbaActor(actor) {
    return !!actor && actor.name() === BUBBA_NAME && _bubbaPlaythrough();
  }
  function _bubbaDb() { return _socialLines().bubba || {}; }

  // The admiration in play right now, or null when this is not Bubba talking.
  // `actor` is the party member doing the talking, not merely a member.
  function _bubbaContext(actor) {
    if (!_isBubbaActor(actor)) return null;
    const data = _bubbaDb();
    return data && data.greeting ? { data } : null;
  }

  // The standing an NPC starts from with Bubba: their opinion of the party plus
  // the goodwill of never having queued for a coach that did not come. Written
  // once into his own per-actor entry, so everything after it is earned.
  function _bubbaSeedFirstImpression(profile, actor) {
    if (!profile || !_isBubbaActor(actor)) return;
    const actorId = actor.actorId();
    if (profile.opinions && profile.opinions[actorId] != null) return;
    const bonus = Number(_bubbaDb().opinionBonus);
    if (!bonus) return;
    _setNpcBaseOpinion(profile, actorId, (profile.playerOpinion ?? 0) + bonus);
  }

  // ── Em and Bubba, to each other ─────────────────────────────────────────
  // The two layers above are about how the WORLD treats each of them. This one
  // is the conversation they have with nobody but each other, and it runs in
  // both directions: Em walking up to Bubba (`em.bubba` in SocialLines.json)
  // and Bubba walking up to Em (`bubba.em`), whether Em is standing there as a
  // map NPC or is being opened from the party roster. They are best friends and
  // partners in crime, so the register is teasing rather than courteous: he
  // frets and jokes and calls her guagliona, she answers the literal meaning of
  // whatever he said and is magnificent about it.
  //
  // Nothing about it is romantic. The Court option is shown when Em raises it,
  // because refusing to hear the answer is her whole character, and the answer
  // is always the same: he is still Eris's, and being anything but her travel
  // buddy would be weird. Bubba is never offered the option at all
  // (NPCEmpathizeUI.js), and neither of them can be reported for harassing the
  // other, which is the one thing three refusals normally costs.
  //
  // Every bank comes in two versions, one per direction, and both carry the
  // same shape: greeting, positive/neutral/negative, `bicker` (the teasing
  // exchange the Bicker action plays) and `situations`, keyed lines for what is
  // happening around them right now (see _pairSituationKeys).
  function _isEmNpc(npcName, event) {
    if (String(npcName || '').trim().toLowerCase() === EM_NAME.toLowerCase()) return true;
    const preset = event ? _presetFromEvent(event) : null;
    return String(preset?.name || '').trim().toLowerCase() === EM_NAME.toLowerCase();
  }

  // Which way round this conversation is: 'em' when Em is doing the talking and
  // Bubba is the one being talked to, 'bubba' for the mirror, null otherwise.
  // Neither switch is consulted: two actors both named for the pair is proof
  // enough, and Em's own layer already gates on hers.
  function _pairSide(actor, npcName, event) {
    if (!actor || !npcName) return null;
    const me = String(actor.name() || '').trim().toLowerCase();
    if (me === EM_NAME.toLowerCase() && _isBubbaNpc(npcName, event))    return 'em';
    if (me === BUBBA_NAME.toLowerCase() && _isEmNpc(npcName, event))    return 'bubba';
    return null;
  }

  // The block of lines for that direction: what the OTHER one says back, plus
  // the `player` pool the talker answers in.
  function _pairData(side) {
    const db = _socialLines();
    return side === 'em' ? (db.em?.bubba || null) : (db.bubba?.em || null);
  }

  function _pairContext(actor, npcName, event) {
    const side = _pairSide(actor, npcName, event);
    if (!side) return null;
    const data = _pairData(side);
    return data ? { side, data, bubba: true, pair: true } : null;
  }

  // The hour on the game clock, off the same minute counter the event log
  // stamps its entries with. The world starts at 10:00 on 1 January 2001.
  function _pairHour() {
    const mins = Number($gameVariables?.value(114)) || 0;
    return ((10 + Math.floor(mins / 60)) % 24 + 24) % 24;
  }

  // Every `situations` key that fits where the two of them are standing right
  // now, most specific first: what the sky is doing, then the place, then the
  // hour, then the state the party is in. Only keys the bank actually writes
  // lines for are used, so the list can grow in the JSON alone.
  function _pairSituationKeys() {
    const keys = [];
    const weather = window.$gameWeather?.currentWeatherType;
    if (weather === 'rain')  keys.push('rain');   // i18n-ignore: WeatherTypes value
    if (weather === 'storm') keys.push('storm');  // i18n-ignore: WeatherTypes value
    if (weather === 'snow')  keys.push('snow');   // i18n-ignore: WeatherTypes value

    let biome = '';
    try { biome = String($gameSystem?.getBiomeFromCache?.($gamePlayer?.x, $gamePlayer?.y) || ''); }
    catch (e) { biome = ''; }
    if (!biome || biome === 'Unknown') biome = String($gameSystem?._procGenData?.currentBiome || ''); // i18n-ignore: sentinel
    // i18n-ignore: biome ids, matched against Biomes.json keys
    const PLACE = [
      [/desert|dune|badland/i,          'desert'],
      [/forest|jungle|wood|taiga/i,     'forest'],
      [/mountain|peak|alpine|cliff/i,   'mountain'],
      [/beach|coast|shore/i,            'beach'],
      [/ocean|sea|lake|river|water/i,   'water'],
      [/swamp|marsh|bog|fen/i,          'swamp'],
      [/city|town|urban|village|road/i, 'town'],
      [/dungeon|crypt|sewer|cave|ruin/i,'underground'],
      [/space|station|orbit/i,          'space'],
      [/^alien/i,                       'alien'],
      [/snow|tundra|glacier|ice|arctic/i,'cold'],
    ];
    for (const [re, key] of PLACE) if (re.test(biome)) { keys.push(key); break; }
    if (window.isProceduralInteriorMap?.($gameMap?.mapId?.())) keys.push('indoors');
    if (window.WorldMapTransfer?.isWorldMap?.()) keys.push('worldmap');

    const hour = _pairHour();
    if (hour >= 23 || hour < 5)      keys.push('night');
    else if (hour < 8)               keys.push('dawn');
    else if (hour >= 20)             keys.push('evening');

    const leader = $gameParty?.leader?.();
    if (leader && leader.mhp > 0 && leader.hp / leader.mhp < 0.35) keys.push('hurt');
    if (($gameParty?.gold?.() ?? 0) < 500) keys.push('broke');
    return keys;
  }

  // The bond between the two of them is not an opinion and does not behave like
  // one. It is a single shared number, the same read from either side, it
  // starts where twelve years on the road left it, and it has NO ceiling: every
  // kind word, every jab and every hour spent in the same camper puts it up
  // again, forever. The one thing that has ever taken it down is Em asking him
  // the question he has to say no to (see the romance branch in
  // NPCEmpathizeUI.js). Kept on $gameSystem, so it belongs to the savegame.
  const PAIR_BOND_START = 92;

  function _pairBond() {
    if (!window.$gameSystem) return PAIR_BOND_START;
    if ($gameSystem._emBubbaBond == null) $gameSystem._emBubbaBond = PAIR_BOND_START;
    return $gameSystem._emBubbaBond;
  }
  function _addPairBond(delta) {
    const v = Math.round(_pairBond() + (Number(delta) || 0));
    // A floor and no ceiling: she can ask twice and still have a friend.
    if (window.$gameSystem) $gameSystem._emBubbaBond = Math.max(0, v);
    return Math.max(0, v);
  }

  // A line about the here and now, or '' when nothing fits. Not every meeting
  // gets one: the plain greetings would never be seen again if it did.
  const PAIR_SITUATION_CHANCE = 0.6;
  function _pairSituationLine(data) {
    const bank = data?.situations;
    if (!bank || Math.random() > PAIR_SITUATION_CHANCE) return '';
    const live = _pairSituationKeys().filter(k => (bank[k] || []).length);
    if (!live.length) return '';
    return _rand(bank[live[Math.floor(Math.random() * live.length)]]);
  }

  // ── Non-sentient party members ──────────────────────────────────────────
  // A creature played as one of the creature classes , Feral, Mimic, Monster,
  // Mana Cyborg, Ghost, Zombie, Mutant, Drone (every class tagged
  // <NonSentient> in Classes.json) , holds no conversation. When
  // one of them is the party member doing the talking, the panel drops every
  // spoken action and offers what a beast can actually do: noises, contact and
  // teeth. Nobody talks BACK to it either; the NPC coos over it, backs away
  // from it or shoos it off depending on what they think of it. Copy lives in
  // js/i18n/<lang>/plugins/Empathize.json under the feral* keys.
  // NPCCreature owns the boundary and reads it off the class's own tag; the
  // number is never re-derived here.
  function _isNonSentientActor(actor) {
    if (!actor) return false;
    const NC = window.NPCCreature;
    if (!NC || !NC.isNonSentientClassId) return false;
    const id = actor.currentClass?.()?.id ?? actor._classId ?? 0;
    return NC.isNonSentientClassId(id);
  }

  // The same question asked of the other side of the conversation: is the NPC
  // being spoken TO a beast? Read off the society profile's class, which is
  // where NPCCreature wrote it when the settlement was populated.
  function _isNonSentientNpc(npcName) {
    const NC = window.NPCCreature;
    if (!NC || !npcName) return false;
    return NC.isNonSentientByName(npcName);
  }

  // What the NPC sees standing in front of them: the creature's archetype
  // ("Beast", "Spider / Humanoid" reads as its first half), falling back to the
  // class it is played as when it carries no anatomy.
  function _feralKind(actor) {
    if (!actor) return '';
    const HC = window.HealthCore;
    const stored = actor._currentArchetype;
    if (stored && HC?.getArchetypeDisplayName) {
      const first = String(stored).split('/')[0].trim();
      const name = first ? HC.getArchetypeDisplayName(first) : '';
      if (name) return name;
    }
    return actor.currentClass?.()?.name ?? '';
  }

  // How this NPC feels about the creature, in the four bands its lines are
  // written for. Opinion is the standing of the creature itself, since every
  // Empathize reaction is per party member.
  function _feralBand(opinion) {
    const o = Number(opinion) || 0;
    if (o <= -20) return 'Hostile';
    if (o < 15)   return 'Wary';
    if (o < 50)   return 'Warm';
    return 'Adoring';
  }

  // A line from the band's bank, with the NPC's name and the creature's kind
  // filled in. `prefix` is the bank family ('feralGreet' / 'feralReact').
  function _feralLine(prefix, opinion, npcName, kind) {
    const T = _getT();
    const line = _rand(T[prefix + _feralBand(opinion)] || []);
    if (!line) return '';
    return String(line)
      .replace(/\{name\}/g, npcName || '')
      .replace(/\{kind\}/g, kind || '');
  }

  // ── The eight voices ────────────────────────────────────────────────────
  // A growl belongs to a Feral and to nothing else. The other seven creature
  // classes are not animals and do not sound like one: a Mimic clacks, a Ghost
  // is barely a sound at all, a Drone answers in machine code. Each class has
  // its own syllable bank in js/i18n/<lang>/plugins/Empathize.json, and every
  // noise this panel makes is drawn from the bank of the class of whoever is
  // making it. An id with no bank of its own falls back to the Feral one, so
  // a roster that grows is never left mute.
  const CREATURE_VOICE_BANKS = {
    63: 'feralGrowlSyllables',      // Feral
    64: 'mimicClackSyllables',      // Mimic
    65: 'monsterRoarSyllables',     // Monster
    66: 'manaCyborgHumSyllables',   // Mana Cyborg
    67: 'ghostWhisperSyllables',    // Ghost
    68: 'zombieMoanSyllables',      // Zombie
    69: 'mutantGurgleSyllables',    // Mutant
    70: 'droneSignalSyllables',     // Drone
  };

  // Two of the eight do not make a NOISE at all. A Mana Cyborg and a Drone are
  // machines wearing a body: what comes back from them is a terminal's answer,
  // a short acknowledgement in a fixed register, not a growl. They draw whole
  // lines from their own bank (`botLines`) instead of syllables, and the line
  // is picked by the LENGTH of what was said to them, so a question gets a
  // longer readout than a greeting does.
  const CREATURE_BOT_BANKS = {
    66: 'manaCyborgBotLines',
    70: 'droneBotLines',
  };

  function _isBotClass(classId) {
    return !!CREATURE_BOT_BANKS[Number(classId)];
  }

  // One machine line for a class, chosen off `words` so the same input gets a
  // steady answer rather than a lottery. Empty when the bank is missing, which
  // every caller reads as "fall through to the syllables".
  function _botLine(classId, words) {
    const T = _getT();
    const bank = T[CREATURE_BOT_BANKS[Number(classId)]] || [];
    if (!bank.length) return '';
    const n = Math.max(0, Math.floor(Number(words) || 0));
    return String(bank[n % bank.length] || '');
  }

  // The creature class of a party member, of an NPC by name, or 0 for anything
  // that is a person.
  function _creatureClassOfActor(actor) {
    if (!actor) return 0;
    const id = actor.currentClass?.()?.id ?? actor._classId ?? 0;
    return _isNonSentientActor(actor) ? id : 0;
  }

  function _creatureClassOfNpc(npcName) {
    if (!_isNonSentientNpc(npcName)) return 0;
    if (typeof $gameParty !== 'undefined' && $gameParty) {
      const member = ($gameParty.members() || []).find(m => m && m.name() === npcName);
      if (member) return _creatureClassOfActor(member);
    }
    const profile = _getProfile(npcName);
    return Number(profile?.assignedClassId) || 0;
  }

  // What a typed sentence comes out as. The player still writes words, the
  // creature still has no mouth for them: the length of what was typed decides
  // how long the noise is, and the noise itself is drawn from the bank its
  // CLASS answers in.
  function _feralGrowlFor(phrase, classId) {
    const words = String(phrase || '').trim().split(/\s+/).filter(Boolean).length;
    const bot = _isBotClass(classId) ? _botLine(classId, words) : '';
    if (bot) return bot;
    const noise = _feralNoise(Math.round(words / 2) || 1, classId);
    return noise || String(phrase || '');
  }

  // `count` syllables off the class's bank, as one capitalized noise. Empty
  // when the bank is missing, which every caller reads as "leave the words
  // alone".
  function _feralNoise(count, classId) {
    const bot = _isBotClass(classId) ? _botLine(classId, count) : '';
    if (bot) return bot;
    const T = _getT();
    const key = CREATURE_VOICE_BANKS[Number(classId)] || CREATURE_VOICE_BANKS[63];
    const bank = T[key] || T.feralGrowlSyllables || [];
    if (!bank.length) return '';
    const n = Math.max(1, Math.min(6, Number(count) || 1));
    const out = [];
    for (let i = 0; i < n; i++) out.push(_rand(bank));
    const text = out.join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // The Markov chain is seeded with what the player typed and therefore opens by
  // repeating it back word for word. Nobody answers a question by reciting it,
  // so the echo is cut off the front of the reply and only what the chain added
  // of its own is spoken. Words are compared loosely (case and punctuation are
  // rewritten by the generator, which capitalizes the first word and closes the
  // last), and a reply left with nothing of its own is refused so the caller
  // falls back to an unseeded line.
  function _stripSeedEcho(response, seed) {
    const norm  = w => String(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const words = String(response || '').trim().split(/\s+/).filter(Boolean);
    const seedW = String(seed || '').trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && i < seedW.length && norm(words[i]) === norm(seedW[i])) i++;
    // Nothing was echoed: the chain bridged away from the seed on its own.
    if (!i) return String(response || '');
    const rest = words.slice(i);
    if (rest.length < 3) return '';
    rest[0] = rest[0].charAt(0).toUpperCase() + rest[0].slice(1);
    return rest.join(' ');
  }

  // The only presents a creature understands to hand over: something to eat,
  // or a piece of something that used to be alive.
  const FERAL_GIFT_CATEGORIES = new Set(['food', 'bodypart']); // i18n-ignore: <category:> tag values

  function _feralCanGift(item) {
    const raw = window.ItemSystemUtils?.getRawCategoryFromNote?.(item)
      ?? (String(item?.note || '').match(/<category:\s*(\w+)>/i) || [])[1];
    return FERAL_GIFT_CATEGORIES.has(String(raw || '').toLowerCase());
  }

  // The noises and nudges a non-sentient member has instead of conversation.
  // `op` is what it costs or earns them; `bank` is the creature's own line.
  const FERAL_ACTIONS = [
    { id: 'growl',  op:  -6, bank: 'feralActGrowl'  },
    { id: 'roar',   op: -10, bank: 'feralActRoar'   },
    { id: 'drool',  op:  -2, bank: 'feralActDrool'  },
    { id: 'sniff',  op:   1, bank: 'feralActSniff'  },
    { id: 'nuzzle', op:   6, bank: 'feralActNuzzle' },
    { id: 'beg',    op:   3, bank: 'feralActBeg'    },
  ];
  const FERAL_ACTION_IDS = new Set(FERAL_ACTIONS.map(a => a.id));

  // ── Petting and feeding a beast ─────────────────────────────────────────
  // The other side of the same rule: what a non-sentient NPC understands being
  // done to it. It is not socialised with and not bargained with, it is
  // touched and it is fed.
  //
  // A hand laid on an animal that has let you near it is always welcome, so
  // petting is the one move in the panel with no band, no roll and no way of
  // going wrong.
  const PET_OPINION = 5;


  // Feeding is judged by what is in the bowl. Cooked food does the animal good
  // in proportion to its calories, raw meat is swallowed without thanks, and a
  // piece of something that used to be alive is worse still: neither is what a
  // creature living among people has learned to expect off a hand.
  const FEED_RAW_MEAT_ID      = 862;        // i18n-ignore: Items.json entry id
  const FEED_FOOD_CATEGORY    = 'food';     // i18n-ignore: <category:> tag value
  const FEED_ORGANIC_CATEGORY = 'bodypart'; // i18n-ignore: <category:> tag value
  const FEED_RAW_OPINION      = -3;
  const FEED_ORGANIC_OPINION  = -5;

  function _itemCategory(item) {
    const raw = window.ItemSystemUtils?.getRawCategoryFromNote?.(item)
      ?? (String(item?.note || '').match(/<category:\s*(\w+)>/i) || [])[1];
    return String(raw || '').toLowerCase();
  }

  function _feedCalories(item) {
    const m = String(item?.note || '').match(/<calories:\s*(\d+)>/i);
    return m ? Number(m[1]) : 0;
  }

  // Which of the three things in the bowl this is: 'food', 'raw' (butchered
  // meat off the crafting shelf) or 'organic' (an organ, a limb, a piece of
  // somebody). Anything else is not food to an animal and is not offered.
  function _feedKind(item) {
    if (!item || item.itypeId !== 1) return '';
    if (item.id === FEED_RAW_MEAT_ID) return 'raw';
    const cat = _itemCategory(item);
    if (cat === FEED_FOOD_CATEGORY)    return 'food';
    if (cat === FEED_ORGANIC_CATEGORY) return 'organic';
    return '';
  }

  // What one mouthful is worth to the animal's opinion of the hand feeding it.
  function _feedOpinion(item) {
    switch (_feedKind(item)) {
      case 'food':    return Math.max(2, Math.min(20, Math.round(_feedCalories(item) / 40)));
      case 'raw':     return FEED_RAW_OPINION;
      case 'organic': return FEED_ORGANIC_OPINION;
      default:        return 0;
    }
  }

  // And what it is worth to the animal's stomach, which is a separate question:
  // offal it resents is still a meal it no longer needs.
  function _feedNourishment(item) {
    switch (_feedKind(item)) {
      case 'food':    return Math.max(5, Math.min(40, Math.round(_feedCalories(item) / 10)));
      case 'raw':     return 15;
      case 'organic': return 10;
      default:        return 0;
    }
  }

  function _feedItemsInPack() {
    return ($gameParty?.items() ?? []).filter(i => _feedKind(i));
  }

  // ── Per-actor NPC reputation ────────────────────────────────────────────
  // Each party member earns their OWN standing with a given NPC, stored in
  // profile.opinions[actorId]. profile.playerOpinion stays as the party-wide
  // baseline the rest of the NPC sim consumes (conversation, decay, politics)
  // and seeds each per-actor value the first time it is touched.
  // The key a party member's standing is filed under. An actor id alone will
  // not do: actor 2 is a different person in every savegame of the world, and
  // the profiles these are written into are world-shared (npcs.json), so three
  // playthroughs were all writing their second member's reputation into one
  // slot and reading each other's. The key names the playthrough as well
  // (p<slot>a<actorId>, NPCSystem.js), so each member has a standing of their
  // own that survives in the world folder whether that savegame is the one
  // being played or not. A playthrough with no slot yet (the sandbox, a party
  // before its first save) falls back to the bare actor id, which is exactly
  // what it used to be.
  function _opinionKey(actorId) {
    if (actorId == null) return null;
    // The person, not the seat: a recruit who takes Actor 2 over must not
    // inherit how the town felt about whoever sat there before (PartyPerson).
    const actor = typeof $gameActors !== "undefined" && $gameActors ? $gameActors.actor(actorId) : null;
    const uid = actor && window.PartyPerson ? window.PartyPerson.uidOf(actor) : null;
    if (uid) return `u${uid}`;
    const VP = window.PartyPresence;
    const slot = VP && typeof VP.currentSlot === 'function' ? VP.currentSlot() : 0;
    return slot > 0 ? VP.memberKey(slot, actorId) : String(actorId);
  }
  function _npcBaseOpinion(profile, actorId) {
    if (!profile) return 0;
    const map = profile.opinions;
    if (map) {
      const key = _opinionKey(actorId);
      if (key != null && map[key] != null) return map[key];
      // A standing earned before the key named the playthrough. Read it once
      // more so nobody's reputation resets the day this is installed; the next
      // write files it under the new key.
      if (map[actorId] != null) return map[actorId];
    }
    return profile.playerOpinion ?? 0;
  }
  function _setNpcBaseOpinion(profile, actorId, value) {
    if (!profile || actorId == null) return 0;
    const v = Math.max(-100, Math.min(100, Math.round(value)));
    // Becoming somebody's friend or somebody's enemy is a thing that happened
    // to a party member, so the party diary hears about the crossing (Diary.js).
    if (window.Diary) window.Diary.onOpinionChanged(profile, actorId, _npcBaseOpinion(profile, actorId), v);
    const key = _opinionKey(actorId);
    (profile.opinions ??= {})[key] = v;
    // The legacy entry is dropped as it is superseded, so one member's
    // standing is never held in two places at once.
    if (key !== String(actorId) && profile.opinions[actorId] != null) {
      delete profile.opinions[actorId];
    }
    // The same standing, filed the other way round: what this member thinks of
    // that person, in the world folder rather than in the savegame, so a
    // playthrough's whole social record outlives the savegame that earned it
    // (party.json -> dispositions).
    // Somebody else's party member is filed under their member key rather than
    // their name, so the map reads member to member across playthroughs: two
    // parties that have met each other in a world know what they thought.
    const VP = window.PartyPresence;
    if (VP && typeof VP.setDisposition === 'function' && key !== String(actorId)) {
      const toward = profile._visitorKey || profile._npcName || null;
      if (toward) VP.setDisposition(key, toward, v);
    }
    return v;
  }

  // ── Company: the social meter follows the opinion ────────────────────────
  // Every Empathize action that moves an NPC's opinion is also time spent in
  // company, and the whole party is standing there for it: a move that lands
  // well feeds everyone's social need, one that lands badly costs them. The
  // member doing the talking is the one who actually had the exchange, so they
  // take slightly more of it either way. Reported through the same
  // ParchmentToast.need popup the minigames use for Fun.
  const SOCIAL_PER_OPINION  = 2.2;  // social points per point of opinion moved
  const SOCIAL_LOSS_FACTOR  = 0.32; // a move that lands badly costs what it always did
  const SOCIAL_MAX_STEP     = 30;   // no single exchange is worth more than this
  const SOCIAL_TALKER_BONUS = 1.4;
  // Being with people is worth something on its own, whatever it did to their
  // opinion, so every exchange also pays a flat base: a trade, a bandage or a
  // question that moves no needle still counts as company. The base thins out
  // over the day with the SAME person and stops after SOCIAL_COMPANY_LIMIT
  // exchanges, so one obliging neighbour cannot be farmed for a full meter.
  const SOCIAL_COMPANY_BASE  = 6;
  const SOCIAL_COMPANY_LIMIT = 6;
  // The actions whose whole effect is elsewhere (a shop, a heal, a signpost),
  // so nothing else would ever pay them their company.
  const COMPANY_ACTIONS = new Set(['trade', 'treat', 'directions', 'buyHouse', 'cardTrade']);

  // ── Cards ───────────────────────────────────────────────────────────────
  // Nobody sits down at a table with somebody who cannot stand them, and
  // nobody swaps a collection with them either. The line they refuse with is
  // their own: a header naming what was turned down, plus the sentence their
  // personality would actually say (Empathize.cardRefuseTone.<personality>).
  const CARD_REFUSE_OPINION = -15;

  function _cardRefusalLine(profile, npcName, kind) {
    const T = _getT();
    const head = kind === 'duel'
      ? T('Empathize.cardRefuseDuel', { name: npcName })
      : T('Empathize.cardRefuseTrade', { name: npcName });
    const persona = String(_personalityName(profile) || '').toLowerCase();
    const key = 'Empathize.cardRefuseTone.' + persona;
    const tone = (persona && window.T.has(key)) ? T(key) : T('Empathize.cardRefuseTone.default');
    return `${head} ${tone}`;
  }

  // What one more exchange with this NPC is worth as company today, spending it
  // off their daily allowance as it is read.
  function _companyBase(profile) {
    const day  = Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    const host = profile || $gameSystem; // wiki / party pages share one record
    if (!host) return SOCIAL_COMPANY_BASE;
    if (host._socialCompany?.day !== day) host._socialCompany = { day, count: 0 };
    const used = host._socialCompany.count++;
    if (used >= SOCIAL_COMPANY_LIMIT) return 0;
    return Math.max(1, Math.round(SOCIAL_COMPANY_BASE * (1 - used / SOCIAL_COMPANY_LIMIT)));
  }

  function _socialStep(value) {
    const v = Math.max(-SOCIAL_MAX_STEP, Math.min(SOCIAL_MAX_STEP, value));
    return v > 0 ? Math.max(1, Math.round(v)) : Math.min(-1, Math.round(v));
  }

  // Company is paid silently. Talking to somebody is what the meter is FOR, so
  // a popup on every exchange would be a popup on every line of dialogue: the
  // bar moves, the conversation carries on, and nothing interrupts it.
  function _paySocial(actorId, step) {
    if (!step || !window.PartyNeeds?.addSocialToAll) return;
    const focus = ($gameParty?.members() ?? []).find(m => m && m.actorId() === actorId) || null;
    window.PartyNeeds.addSocialToAll(step, { focus, focusBonus: SOCIAL_TALKER_BONUS });
  }

  // Company on its own, for the actions that never touch an opinion: haggling,
  // wounds patched up, asking the way, a line typed into the chat box.
  function _gainSocialFromCompany(actorId, profile) {
    _paySocial(actorId, _companyBase(profile));
  }

  function _gainSocialFromOpinion(actorId, delta, profile) {
    if (!window.PartyNeeds?.addSocialToAll) return;
    const moved = delta > 0 ? delta * SOCIAL_PER_OPINION
      : delta < 0 ? delta * SOCIAL_PER_OPINION * SOCIAL_LOSS_FACTOR
      : 0;
    // An exchange that went badly is not company, it is a scene: no base for it.
    const base = delta >= 0 ? _companyBase(profile) : 0;
    const step = base + (moved ? _socialStep(moved) : 0);
    _paySocial(actorId, Math.max(-SOCIAL_MAX_STEP, Math.min(SOCIAL_MAX_STEP, Math.round(step))));
  }

  // ── Fun: the moves that are entertainment, not just company ──────────────
  // Most of the Socialize catalog is contact: it feeds the social meter and
  // moves an opinion. A few of the options are ENTERTAINMENT - a joke that
  // lands, a story or a poem that holds the room, gossip worth hearing - and
  // those pay the Fun (leisure) meter as well, on BOTH sides of the exchange:
  // the party member who performed, and the NPC who was performed to
  // (profile.leisure, the same 0-100 field the society sim drains in
  // NPCSimulationCore.js).
  //
  // Only a move that actually LANDED pays. A joke that flops, a poem the NPC
  // sat through with a flat face (delta <= 0) is not fun for anybody, and the
  // repetition fatigue already baked into the delta means the fourth telling
  // of the same routine is worth less than the first. The weight is how
  // entertaining the move is at its best; the amount then follows how well it
  // actually went, so a story that lands beats a chuckle.
  const FUN_ACTIONS      = { joke: 1, story: 1.1, poem: 0.9, gossip: 0.6 };
  const FUN_PER_OPINION  = 1.6;  // fun points per point of opinion the move moved
  const FUN_MIN_STEP     = 2;
  const FUN_MAX_STEP     = 18;
  const FUN_TALKER_BONUS = 1.5;  // whoever told it enjoyed telling it
  const FUN_NPC_SHARE    = 1.2;  // the audience gets a little more than the party
  const FUN_DAILY_LIMIT  = 5;    // per NPC: an act only stays funny so many times

  // How much of today's amusement this NPC has left in them, spent as it is
  // read. Same shape as the company allowance above: the fifth performance of
  // the day lands on somebody who has already had their fill.
  function _funAllowance(profile) {
    const day  = Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    const host = profile || $gameSystem;
    if (!host) return 1;
    if (host._funShared?.day !== day) host._funShared = { day, count: 0 };
    const used = host._funShared.count++;
    if (used >= FUN_DAILY_LIMIT) return 0;
    return 1 - used / FUN_DAILY_LIMIT;
  }

  // Pay the Fun meter for one entertainment move that landed. Returns what was
  // paid (0 when the move was not entertainment, did not land, or the NPC has
  // laughed enough today), so the caller can label the exchange with it.
  function _payFun(actorId, profile, npcName, id, delta) {
    const weight = FUN_ACTIONS[id];
    if (!weight || delta <= 0) return 0;
    const taper = _funAllowance(profile);
    if (taper <= 0) return 0;
    const raw  = Math.max(FUN_MIN_STEP, delta * FUN_PER_OPINION * weight);
    const step = Math.round(Math.min(FUN_MAX_STEP, raw) * taper);
    if (step <= 0) return 0;

    // The party: everyone standing there heard it, the performer most of all.
    if (window.PartyNeeds?.addLeisureToAll) {
      const focus = ($gameParty?.members() ?? []).find(m => m && m.actorId() === actorId) || null;
      window.PartyNeeds.addLeisureToAll(step, { focus, focusBonus: FUN_TALKER_BONUS });
    }
    // The NPC: the field the sim drains, so a bored resident who was told a
    // good joke is measurably less bored for the rest of the day.
    if (profile) {
      profile.leisure = Math.max(0, Math.min(100,
        Math.round((profile.leisure ?? 100) + step * FUN_NPC_SHARE)));
    }
    try {
      const T = _getT();
      window.ParchmentToast?.need('leisure', step, { note: T('Empathize.funShared', { name: npcName }) });
    } catch (e) { /* a popup never breaks a conversation */ }
    return step;
  }

  function _addNpcOpinion(profile, actorId, delta) {
    _gainSocialFromOpinion(actorId, delta, profile);
    return _setNpcBaseOpinion(profile, actorId, _npcBaseOpinion(profile, actorId) + delta);
  }
  // What the NPC actually thinks of one actor: earned base + trait
  // compatibility + how the two of them smell to each other right now + what
  // they make of how the actor is turned out. The hygiene and look terms are
  // the parts of this that change with a bath and a change of clothes.
  function _npcEffectiveOpinion(profile, actor) {
    if (!actor) return 0;
    return Math.max(-100, Math.min(100,
      _npcBaseOpinion(profile, actor.actorId())
      + _traitCompatBonus(profile, actor)
      + _hygienePenalty(profile, actor)
      + _lookImpression(profile, actor)));
  }

  function _computePartyPredisposition(profile) {
    return ($gameParty?.members() ?? []).map(actor => ({
      actor,
      score: _npcEffectiveOpinion(profile, actor),
    }));
  }

  // ── Per-actor romantic attraction ────────────────────────────────────────
  // How drawn this NPC is to a given party member, tracked apart from general
  // disposition: liking someone and wanting them are not the same number.
  // Ordinary conversation, gifts, trade and every other exchange still move
  // opinion alone; only a Court move (and a Propose) touches this ledger,
  // keyed the same way opinion is (profile.attraction[key], see _opinionKey).
  // There is no player-wide baseline to fall back on the way opinion has
  // profile.playerOpinion: attraction starts at 0 and is earned or lost.
  function _npcBaseAttraction(profile, actorId) {
    if (!profile) return 0;
    const map = profile.attraction;
    if (map) {
      const key = _opinionKey(actorId);
      if (key != null && map[key] != null) return map[key];
      if (map[actorId] != null) return map[actorId];
    }
    return 0;
  }
  function _setNpcBaseAttraction(profile, actorId, value) {
    if (!profile || actorId == null) return 0;
    const v = Math.max(-100, Math.min(100, Math.round(value)));
    const key = _opinionKey(actorId);
    (profile.attraction ??= {})[key] = v;
    if (key !== String(actorId) && profile.attraction[actorId] != null) {
      delete profile.attraction[actorId];
    }
    return v;
  }
  function _addNpcAttraction(profile, actorId, delta) {
    _gainSocialFromOpinion(actorId, delta, profile);
    return _setNpcBaseAttraction(profile, actorId, _npcBaseAttraction(profile, actorId) + delta);
  }
  // What the NPC actually feels. Attraction carries none of opinion's trait
  // compatibility or hygiene terms of its own, courting already applies both
  // of those to the CHANCE a move lands (NPCEmpathizeUI.js, _romanceChance),
  // so folding them in here a second time would double-count them.
  function _npcEffectiveAttraction(profile, actor) {
    if (!actor) return 0;
    return Math.max(-100, Math.min(100, _npcBaseAttraction(profile, actor.actorId())));
  }

  function _computePartyAttraction(profile) {
    return ($gameParty?.members() ?? []).map(actor => ({
      actor,
      score: _npcEffectiveAttraction(profile, actor),
    }));
  }

  // Retained for API compatibility; interaction logic now targets the focused
  // actor's own reputation instead of a party-wide median.
  function _medianScore(preds) {
    if (!preds.length) return 0;
    const sorted = preds.map(p => p.score).sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }

  function _generatePartyThoughts(actor, _profile) {
    const thoughts = [];
    const hp     = Math.round((actor.hpRate?.() ?? 1) * 100);
    const hunger = actor.hungerPercent?.() ?? 100;
    const sleep  = actor.sleepPercent?.()  ?? 100;
    if (hp     < 30) thoughts.push(T('Empathize.partyThought.hurt'));
    if (hunger < 25) thoughts.push(T('Empathize.partyThought.hungry'));
    if (sleep  < 25) thoughts.push(T('Empathize.partyThought.tired'));
    if (!thoughts.length) thoughts.push(T('Empathize.partyThought.idle'));
    return thoughts;
  }

  Object.assign(window.NPCEmpathize._internal, {
    _addNpcAttraction, _addNpcOpinion, _addPairBond, _bubbaContext, _bubbaDb, _bubbaPlaythrough,
    _bubbaSeedFirstImpression, _cardRefusalLine, _computePartyAttraction,
    _computePartyPredisposition, _creatureClassOfActor, _creatureClassOfNpc, _emContext,
    _emOpinionJitter, _emPlaythrough, _emSeedFirstImpression, _emStanceData, _emStanceKey,
    _emVoiceLine, _feedCalories, _feedItemsInPack, _feedKind, _feedNourishment, _feedOpinion,
    _feralBand, _feralCanGift, _feralGrowlFor, _feralKind, _feralLine, _feralNoise,
    _gainSocialFromCompany, _gainSocialFromOpinion, _generatePartyThoughts, _hygienePenalty,
    _lookEffects, _lookImpression, _lookOdds, _lookSocialMult,
    _hygieneReadout, _isBubbaActor, _isBubbaNpc, _isEmActor, _isEmLocalNpc, _isEmNpc,
    _isNonSentientActor, _isNonSentientNpc, _medianScore, _npcBaseAttraction, _npcBaseOpinion,
    _npcEffectiveAttraction, _npcEffectiveOpinion, _pairBond, _pairContext, _pairData, _pairSide,
    _pairSituationKeys, _pairSituationLine, _payFun, _personalityName, _personalitySocialMult,
    _setNpcBaseAttraction, _setNpcBaseOpinion, _stanceToneMult, _stripSeedEcho, _traitCompatBonus,
    BUBBA_NAME, CARD_REFUSE_OPINION, COMPANY_ACTIONS, EM_NAME, FERAL_ACTION_IDS, FERAL_ACTIONS,
    FUN_ACTIONS, PET_OPINION,
  });
})();
