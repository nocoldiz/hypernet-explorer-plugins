/*:
 * @target MZ
 * @plugindesc NPC Life: pre-aging a new world and the one way a person dies
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Refugees
 * @help
 * ============================================================================
 * NPCLife_Death, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns PRE-AGING (world initializer "npcPreAge", order 57) and DEATH
 * (killNpc, the single death path).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Refugees.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    ageAt, childrenOf, endPartnership, ensureLifeRecord, getProfile, getRecords, inPartyNamed,
    invalidatePopulation, isMinor, kinOf, LifeRng, MINUTES_PER_DAY, nameHash, nowMinuteOf,
    onLoadedMap, parentsOf, partnersOf, preAgeCreed, pushLifeEvent, worldSeed, yearOf,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // PRE-AGING, the people arrive at the start date with a past behind them
  // ==========================================================================
  // World initializer "npcPreAge" (order 57): after politics (50) and faction
  // diplomacy (55) have written the parties the people will lean toward, and
  // before the settlement web (60) reads the census. Every profile is brought
  // up to date by NPCSim.Dev (the specializations are seeded and the whole of
  // the person's life is replayed onto them, silently), then stamped. Anyone
  // already stamped is left alone, so a world created before the step existed
  // does not see the people the player already met rewritten.

  const PRE_AGE_V = 1;

  function preAgeWorld() {
    // Nobody's life is lived in a world with nobody left in it
    // (WorldModes.simulatesPeople), so there is nothing to pre-age.
    if (window.NPCShared?.WorldModes?.simulatesPeople?.() === false) return 0;
    // The replay needs the specialization table; throwing leaves the step
    // unmarked so WorldManager tries it again on the next run.
    if (!window.Specializations?.ready) throw new Error("Specializations not ready");  // i18n-ignore: diagnostic
    const society = $gameSystem?._npcSociety;
    if (!society) return 0;
    const sim = window.NPCSim;
    let aged = 0;
    for (const [name, profile] of Object.entries(society)) {
      if (!profile || profile._preAgedV === PRE_AGE_V) continue;
      try {
        // ensureSimFields runs Dev.ensure, which seeds the specializations
        // and replays every level the person already has.
        sim?.ensureSimFields?.(profile, name);
        sim?.Dev?.ensure?.(profile, name);

        // The creed the years before the start date have turned them to:
        // up to 4 directed shifts over their adult years, nothing logged,
        // then the political identity is brought into step with it.
        preAgeCreed(name, profile);
      } catch (e) {
        console.error(`[NPCLifeSim] pre-aging "${name}" failed`, e);
        continue;
      }
      profile._preAgedV = PRE_AGE_V;
      aged++;
    }
    return aged;
  }

  window.NPCLifeSim.preAgeWorld = preAgeWorld;

  // ==========================================================================
  // DEATH, the one way a person leaves the world for good
  // ==========================================================================
  // killNpc(name, cause) is the single death path (a monster on the map, a
  // battle the party won, a coup de grace). In order:
  //   - the map half (NPCSystem's DOWNED BODIES, NPCDowned.fallOnMap): a
  //     body where they fell, the world's record of the gone (NPCGone, keyed
  //     by name on the procedural map), the event taken away;
  //   - the life record is closed: dead = { minute, cause, by };
  //   - every partner is widowed (endPartnership, outcome "widowed", which
  //     writes NPCLife.event.widowed on the one left behind);
  //   - their home and their job shift are given up (JobShiftManager);
  //   - a minor child with no parent left goes to the nearest kin.
  // The dead are skipped by every later pass of catchUp.

  // i18n-ignore-start: death cause ids, kin relation ids, life event types
  const DEATH_KIN_PREFERENCE = ["grandchild", "sibling", "cousin", "nephew", "niece"];
  const DEATH_NATURAL = "natural";
  const DEATH_ILLNESS = "illness";
  // i18n-ignore-end
  // The life event a death writes, by its cause; anything else is plain "died".
  const DEATH_EVENT_KEYS = {
    [DEATH_NATURAL]: "NPCLife.event.diedNatural",
    [DEATH_ILLNESS]: "NPCLife.event.diedIllness",
  };

  function isAliveName(name) {
    const r = getRecords()?.[name];
    if (r && r.dead) return false;
    const p = getProfile(name);
    if (p && p._killed) return false;
    return !!(r || p);
  }

  // Their door in the register is theirs no more.
  function releaseHome(name) {
    const table = $gameSystem?._npcBuildingOccupants;
    if (table) {
      for (const list of Object.values(table)) {
        if (!Array.isArray(list)) continue;
        const i = list.indexOf(name);
        if (i >= 0) list.splice(i, 1);
      }
    }
    const profile = getProfile(name);
    if (profile) profile.homeBuilding = null;
  }

  // Who takes in a child left with nobody: the kin the child names, grand-
  // parents first, then siblings, then anybody else of the family, adults
  // who are alive. null when there is nobody.
  function guardianFor(childName) {
    const kin = kinOf(childName);
    const cands = Object.keys(kin).filter(n => kin[n] !== "child" && isAliveName(n) && !isMinor(n)); // i18n-ignore: kin relation id
    cands.sort((a, b) => {
      const ra = DEATH_KIN_PREFERENCE.indexOf(kin[a]), rb = DEATH_KIN_PREFERENCE.indexOf(kin[b]);
      const wa = ra < 0 ? 99 : ra, wb = rb < 0 ? 99 : rb;
      return (wa - wb) || (a < b ? -1 : a > b ? 1 : 0);
    });
    return cands[0] || null;
  }

  function rehomeOrphans(deadName, atMinute) {
    const moved = [];
    for (const child of childrenOf(deadName)) {
      if (!isMinor(child) || !isAliveName(child)) continue;
      if (parentsOf(child).some(p => p !== deadName && isAliveName(p))) continue;
      const guardian = guardianFor(child);
      const record = getRecords()?.[child];
      if (!guardian || !record) continue;
      record.guardian = guardian;
      const gp = getProfile(guardian), cp = getProfile(child);
      const group = gp?._homeGroupName || gp?.homeBuilding?.groupName || cp?._homeGroupName || null;
      try {
        if (gp?.homeBuilding && group && window.NPCSim?.resettle) window.NPCSim.resettle(child, group, gp.homeBuilding);
      } catch (e) { console.error("[NPCLifeSim] taking in an orphan failed", e); }
      pushLifeEvent(record, atMinute, "family", "NPCLife.event.takenInBy", { name: guardian }); // i18n-ignore: life event type
      moved.push({ child, guardian });
    }
    return moved;
  }

  function killNpc(name, cause) {
    if (!name) return null;
    const why = (cause && typeof cause === "object") ? cause : { kind: String(cause || "unknown") }; // i18n-ignore: death cause id
    const records = getRecords();
    let record = records?.[name] || null;
    if (!record) { try { record = ensureLifeRecord(name); } catch (e) { record = null; } }
    if (record && record.dead) return null;
    const now = nowMinuteOf();

    let corpse = null;
    try { corpse = window.NPCDowned?.fallOnMap?.(name, why) ?? null; }
    catch (e) { console.error("[NPCLifeSim] the body could not be laid down", e); }
    const profile = getProfile(name);
    if (profile) { profile._killed = true; profile.downed = null; profile.currentNeed = null; }

    try { window.NPCSim?.JobShiftManager?.releaseSlot?.(name); }
    catch (e) { console.error("[NPCLifeSim] releasing a shift failed", e); }
    releaseHome(name);
    // Whatever office of a nation or a bloc they held is theirs no more
    // (NPCPolitics REAL POLITICIANS): the party finds a new leader, a head of
    // state is replaced at the polls.
    try { window.NPCPolitics?.onPersonDied?.(name, why); }
    catch (e) { console.error("[NPCLifeSim] vacating an office failed", e); }

    const out = { corpse, widowed: [], orphans: [] };
    if (!record) return out;
    record.dead = { minute: now, cause: why.kind || "unknown", by: why.by || null }; // i18n-ignore: death cause id
    if (why.illness) record.dead.illness = why.illness;
    record.trip = null;
    // A cause may name its own life event (an animal's death, NPCLife_Animals).
    // An animal's death reads as one (a predator, a named killer).
    const animalDeath = (!why.eventKey && record.nonSentient) ? window.NPCLifeSim.Animals?.deathEvent?.(why) : null;
    const deathKey = why.eventKey || animalDeath?.key || DEATH_EVENT_KEYS[why.kind] || "NPCLife.event.died";
    const deathParams = Object.assign({}, animalDeath?.params || {}, why.eventParams || {}, why.illness ? { illness: why.illness } : {});
    pushLifeEvent(record, now, "death", deathKey, deathParams); // i18n-ignore: life event type
    // Company shares pass to kin, or back to the float (NPCSim.Stocks).
    try { window.NPCSim?.Stocks?.onDeath?.(name, record); }
    catch (e) { console.error("[NPCLifeSim] passing on the shares failed", e); }
    for (const p of partnersOf(record).slice()) {
      const partner = p.name;
      endPartnership(record, yearOf(now), "widowed", now, partner); // i18n-ignore: outcome id
      out.widowed.push(partner);
    }
    out.orphans = rehomeOrphans(name, now);
    try { invalidatePopulation(); } catch (e) { }
    return out;
  }

  window.NPCLifeSim.killNpc = killNpc;
  window.NPCLifeSim.isDead = (name) => !!getRecords()?.[name]?.dead;
  window.NPCLifeSim._internals.killNpc = killNpc;
  window.NPCLifeSim._internals.guardianFor = guardianFor;

  // ==========================================================================
  // NATURAL MORTALITY, the deaths nobody caused
  // ==========================================================================
  // Resolved in the life-sim catch-up as one probability over the whole
  // interval (never a loop over its days). Two hazards, summed per day:
  //   - age: a Gompertz curve, annual MORTALITY.BASE * e^(GROWTH * age),
  //     tiny before fifty, steep after seventy and all but certain past a
  //     hundred (capped at MAX_ANNUAL);
  //   - illness: every disease the person carries (Health_DiseaseSystem data):
  //     an acute one spends its case fatality ratio over its course, a chronic
  //     one over CHRONIC_YEARS; a treated or managed one at TREATED.
  // The death goes through killNpc with kind "natural" or "illness". Never a
  // party member, a <Story> or <Local> person, the authored cast, a child or
  // anything non-sentient; somebody standing on the loaded map is left for a
  // later pass rather than dropped in front of the player.
  const MORTALITY = {
    BASE: 0.00003,          // annual hazard at age 0 of the curve
    GROWTH: 0.1,            // doubling about every seven years
    MAX_ANNUAL: 0.95,       // the most a single year can take
    CERTAIN_AGE: 100,       // from here on, MAX_ANNUAL
    CHRONIC_YEARS: 8,       // a chronic disease spends its fatality ratio over these
    TREATED: 0.25,          // what treatment leaves of an illness hazard
    LETHAL_CFR: 0.1,        // a "lethal" disease that names no ratio
  };

  function annualToDaily(q) {
    const c = Math.max(0, Math.min(MORTALITY.MAX_ANNUAL, q));
    return -Math.log(1 - c) / 365;
  }

  function ageHazardPerDay(age) {
    const a = Math.max(0, Number(age) || 0);
    if (a >= MORTALITY.CERTAIN_AGE) return annualToDaily(MORTALITY.MAX_ANNUAL);
    return annualToDaily(MORTALITY.BASE * Math.exp(MORTALITY.GROWTH * a));
  }

  // { rate, worst } of the diseases on the profile over the interval.
  function illnessHazard(profile, lastMinute, nowMinute, deltaDays) {
    const DS = window.DiseaseSystem;
    const list = profile?.diseases;
    if (!DS?.getDisease || !Array.isArray(list) || !list.length || deltaDays <= 0) return { rate: 0, worst: null };
    let rate = 0, worst = null, worstRate = 0;
    for (const e of list) {
      const d = e && DS.getDisease(e.id);
      if (!d) continue;
      let cfr = Number(d.cfr) || 0;
      if (!cfr && d.severity === "lethal") cfr = MORTALITY.LETHAL_CFR; // i18n-ignore: disease severity id
      if (cfr <= 0) continue;
      const chronic = !!e.chronic || d.durationDays < 0 || d.durationDays >= 9999;
      let r;
      if (chronic) {
        r = cfr / (MORTALITY.CHRONIC_YEARS * 365);
      } else {
        // An acute course: only the days of it that fall inside the interval.
        const course = Math.max(1, Number(d.durationDays) || 1);
        const since = Number(e.sinceMin) || 0;
        const left = since > 0 ? course - Math.max(0, (lastMinute - since) / MINUTES_PER_DAY) : course;
        const days = Math.max(0, Math.min(deltaDays, left));
        r = (cfr * days / course) / deltaDays;
      }
      if (e.treatedAt != null || e.managed) r *= MORTALITY.TREATED;
      rate += r;
      if (r > worstRate) { worstRate = r; worst = e.id; }
    }
    return { rate, worst };
  }

  function mayDieNaturally(record, profile) {
    if (!record || record.dead || record.nonSentient || record.child) return false;
    const name = record.name;
    if (!name || isMinor(name, profile)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    if (profile && (profile._killed || profile.playerCreated || profile._localNpc || profile._story)) return false;
    if (inPartyNamed(name)) return false;
    try {
      if (window.NPCSystem?.isStoryName?.(name)) return false;
      if (window.NPCSystem?.isReservedName?.(name)) return false;
    } catch (e) { return false; }
    return true;
  }

  // The chance `record` dies over (lastMinute, nowMinute], and the cause.
  function mortalityOver(record, profile, lastMinute, nowMinute, deltaDays) {
    const mid = lastMinute + (nowMinute - lastMinute) / 2;
    const ageRate = ageHazardPerDay(ageAt(record, mid));
    const ill = illnessHazard(profile, lastMinute, nowMinute, deltaDays);
    const total = ageRate + ill.rate;
    return { p: 1 - Math.exp(-total * deltaDays), ageRate, illRate: ill.rate, illness: ill.worst };
  }

  // One life's interval: true when they died.
  function resolveMortality(record, profile, lastMinute, nowMinute, deltaDays) {
    if (!(deltaDays > 0) || !mayDieNaturally(record, profile)) return false;
    const m = mortalityOver(record, profile, lastMinute, nowMinute, deltaDays);
    if (m.p <= 0) return false;
    const rng = new LifeRng((nameHash(record.name + "_mortality") ^ worldSeed() ^ (lastMinute >>> 0)) >>> 0);
    if (rng.next() >= m.p) return false;
    // In front of the player: the death waits for a pass they are not looking at.
    if (onLoadedMap(record.name)) return false;
    const byIllness = m.illness && rng.next() < m.illRate / (m.ageRate + m.illRate);
    const cause = byIllness ? { kind: DEATH_ILLNESS, by: null, illness: m.illness } : { kind: DEATH_NATURAL, by: null };
    try { killNpc(record.name, cause); }
    catch (e) { console.error("[NPCLifeSim] a natural death failed", e); return false; }
    return !!record.dead;
  }

  window.NPCLifeSim.MORTALITY = MORTALITY;
  window.NPCLifeSim.mortalityOf = (name, days) => {
    const record = getRecords()?.[name];
    if (!record) return null;
    const now = nowMinuteOf(), span = Math.max(1, Number(days) || 365);
    return mortalityOver(record, getProfile(name), now, now + span * MINUTES_PER_DAY, span);
  };
  Object.assign(window.NPCLifeSim._internal, { ageHazardPerDay, mayDieNaturally, resolveMortality });

  if (typeof window !== "undefined" && window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("npcPreAge", 57, preAgeWorld);
  }

})();
