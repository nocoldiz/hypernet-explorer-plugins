/*:
 * @target MZ
 * @plugindesc NPC Life: a worldview that moves for reasons, and people talking each other round
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @help
 * ============================================================================
 * NPCLife_Worldview, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns DIRECTED DEVELOPMENT (creed shifts toward a neighbouring worldview) and
 * CONVERSION (people talking each other round).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLifeSimulator.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    ageAt, ensureLifeRecord, getProfile, getRecords, isNonSentient, LifeRng, MIN_NPC_AGE,
    MINUTES_PER_DAY, nameHash, pushLifeEvent, RATES, sampleCount, worldSeed,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // DIRECTED DEVELOPMENT, a worldview that moves for reasons
  // ==========================================================================
  // A worldview shifts to a NEIGHBOURING creed, never to the next line of the
  // file, and never out of the person's own pool (an off-worlder stays among
  // the off-world creeds, a citizen among ours). What used to be a random walk
  // among the nearest creeds now leans: every shift is aimed at the creed
  // plus a pull vector built from the life the person is living (age, money,
  // trade, prison, the partner and parents they listen to, the government
  // over them, unrest and war), clamped to PULL_CAP on each axis, and the new
  // creed is drawn from the ones standing nearest that aim.
  //
  // The young change their minds more often than the old (ageRateFactor), and
  // a life event (conviction, release, a new job, a wedding or a divorce, a
  // wealth tier gained or lost) leaves a `_devPending` tag that gives the next
  // pass an extra chance to shift, blamed on that event in the log.

  const PULL_CAP = 40;
  const SHIFTS_PER_PASS_MAX = 4;
  const PENDING_SHIFT_CHANCE = 0.5;
  const PARTNER_PULL = 0.25;
  const PARENT_PULL = 0.15;
  const PARENT_PULL_MAX_AGE = 30;
  const GOVERNMENT_PULL = 0.20;
  const RECENT_CONVICTION_DAYS = 365 * 2;
  // i18n-ignore-start: Jobs.json category ids
  const JOB_PULL = {
    Labor:     { econ: -10 },
    Social:    { econ: -4, trad: -5 },
    Technical: { econ: 4, myst: -10 },
    Magical:   { myst: 14 },
    Combat:    { mil: 12, auth: 6 },
    Criminal:  { auth: -12 },
    General:   {},
    Faction:   { auth: 6, trad: 4 },
  };
  // i18n-ignore-end
  // Which log line a driver is blamed under (NPCLife.event.worldviewShiftedBy.*).
  const DRIVER_LOG = {
    age: "age", wealth: "wealth", job: "job", unemployment: "job", prison: "prison",
    partner: "partner", parents: "family", government: "government", unrest: "government",
    war: "war", friends: "friends",
  };

  function ageRateFactor(age) {
    if (age < 25) return 1.6;
    if (age < 40) return 1.0;
    if (age < 60) return 0.6;
    return 0.35;
  }

  // Wars as the history chronicle records them. The chronicle does not carry
  // a war list yet (a later phase adds history.wars), so every reader here is
  // guarded and an absent list simply means peace.
  function atWar(powerName) {
    if (!powerName) return false;
    // The chronicle's own answer knows the power aliases ("USSR" is the
    // Soviet Union), so it goes first.
    const HM = window.HistoryManager;
    if (HM && typeof HM.isAtWar === "function") {
      try { return !!HM.isAtWar(powerName); } catch (_) { /* fall through */ }
    }
    let wars = null;
    try { wars = window.WorldManager?.getField?.("history", "wars"); } catch (_) { wars = null; }
    if (!Array.isArray(wars)) {
      try { wars = window.HistoryManager?.getWars?.(); } catch (_) { wars = null; }
    }
    if (!Array.isArray(wars)) return false;
    return wars.some(w => w && w.status !== "ended" && (w.attacker === powerName || w.defender === powerName));
  }

  function creedOfName(name) {
    const p = getProfile(name);
    return p ? window.NPCShared.ideologyFor(p) : null;
  }

  // The pull on a person's worldview, as axes plus how much each driver
  // contributed (for blame). `own` is the axes of the creed they hold now.
  function worldviewPull(record, profile, own, nowMinute) {
    const S = window.NPCShared;
    const AX = S.IDEOLOGY_AXES;
    const total = {};
    for (const ax of AX) total[ax] = 0;
    const drivers = {};
    const add = (driver, vec) => {
      let mag = 0;
      for (const ax of AX) {
        const v = vec[ax] || 0;
        total[ax] += v;
        mag += Math.abs(v);
      }
      if (mag > 0) drivers[driver] = (drivers[driver] || 0) + mag;
    };
    const toward = (axes, w) => {
      const out = {};
      for (const ax of AX) out[ax] = ((axes[ax] ?? 0) - (own[ax] ?? 0)) * w;
      return out;
    };

    const age = ageAt(record, nowMinute);
    if (age >= 40) add("age", { trad: Math.min(12, (age - 40) * 0.4) });
    else if (age < 30) add("age", { trad: -6, auth: -4 });

    const tier = profile.wealthTierBase;
    if (typeof tier === "number" && tier !== 2) add("wealth", { econ: (tier - 2) * 8 });

    if (record.employment === "unemployed") add("unemployment", { econ: -10 });
    else if (record.employment === "employed") {
      const open = (record.careerHistory || []).find(seg => seg.toYear === null);
      const pull = open && JOB_PULL[open.category];
      if (pull) add("job", pull);
    }

    const recent = (record.criminalRecord || []).some(c => c.convicted && c.minute != null &&
      nowMinute - c.minute <= RECENT_CONVICTION_DAYS * MINUTES_PER_DAY);
    if (record.inPrisonUntilMinute != null || recent) add("prison", { auth: -15, trad: -4 });

    const alien = !!S.ideologyFor(profile)?.alien;
    const sameWorld = (c) => !!c && !!c.alien === alien;
    if (record.partner && !record.partner.external) {
      const pc = creedOfName(record.partner.name);
      if (sameWorld(pc)) add("partner", toward(S.ideologyAxes(pc), PARTNER_PULL));
    }
    if (age < PARENT_PULL_MAX_AGE && record.kin) {
      // kin[n] === "child" means this person is n's child: n is a parent.
      const parents = Object.keys(record.kin).filter(n => record.kin[n] === "child")
        .map(creedOfName).filter(sameWorld);
      if (parents.length) {
        const mean = {};
        for (const ax of AX) mean[ax] = parents.reduce((a, c) => a + (S.ideologyAxes(c)[ax] ?? 0), 0) / parents.length;
        add("parents", toward(mean, PARENT_PULL));
      }
    }

    const gov = window.NPCPolitics?.rulingPlatformOf?.(record.name) || null;
    if (gov && gov.platform) {
      add("government", toward(gov.platform, GOVERNMENT_PULL));
      // Unrest hardens whatever somebody already believes.
      if (gov.unrest > 60) {
        const k = (gov.unrest - 60) * 0.25;
        const vec = {};
        for (const ax of AX) vec[ax] = Math.sign(own[ax] || 0) * k;
        add("unrest", vec);
      }
      if (atWar(gov.power)) add("war", { mil: 12, auth: 6 });
    }

    for (const ax of AX) total[ax] = Math.max(-PULL_CAP, Math.min(PULL_CAP, total[ax]));
    return { axes: total, drivers };
  }

  // One directed shift. Returns { ideo, driver } or null. `silent` writes
  // nothing to the log (the pre-age replay).
  function directedShift(record, profile, rng, minute, opts = {}) {
    const S = window.NPCShared;
    const creed = S.ideologyFor(profile);
    if (!creed || S.ideologyList().length < 2) return null;
    const own = S.ideologyAxes(creed);
    const pull = worldviewPull(record, profile, own, minute);
    const target = {};
    for (const ax of S.IDEOLOGY_AXES) target[ax] = (own[ax] ?? 0) + pull.axes[ax];
    const near = S.nearestIdeologies(target, { alien: !!creed.alien, limit: 6, exclude: creed.id });
    if (!near.length) return null;
    let total = 0;
    const weights = near.map(e => { const w = 1 / (1 + e.distance / 25); total += w; return w; });
    let roll = rng.next() * total;
    let pick = near[near.length - 1];
    for (let i = 0; i < near.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pick = near[i]; break; }
    }
    // Blame: the life event that prompted this pass if it pulled at all,
    // otherwise whichever driver pulled hardest.
    let driver = null;
    for (const tag of (opts.pending || [])) {
      if (pull.drivers[tag] || (tag === "job" && pull.drivers.unemployment)) { driver = tag; break; }
    }
    if (!driver) {
      let best = 0;
      for (const [d, m] of Object.entries(pull.drivers)) if (m > best) { best = m; driver = d; }
    }
    S.setCreed(profile, pick.ideo);
    if (profile.conversion) delete profile.conversion;
    if (!opts.silent) {
      const logAs = driver ? DRIVER_LOG[driver] : null;
      const key = logAs ? "NPCLife.event.worldviewShiftedBy." + logAs : "NPCLife.event.worldviewShifted";
      pushLifeEvent(record, minute, "outlook", key, { creed: pick.ideo.id });
    }
    return { ideo: pick.ideo, driver };
  }

  function creedMayMove(record, profile) {
    if (!profile || !record || record.nonSentient) return false;
    if (isNonSentient(profile, record.name)) return false;
    if (window.NPCShared.creedPinned(profile)) return false;
    // Children hold no creed of their own yet (a later phase brings them).
    if (profile._child || (profile.lifeStage && profile.lifeStage !== "adult")) return false; // i18n-ignore: life stage id
    return !!window.NPCShared.ideologyFor(profile);
  }

  function resolveWorldview(record, profile, rng, lastMinute, nowMinute, deltaDays) {
    const pending = Array.isArray(record._devPending) ? record._devPending : [];
    if (!creedMayMove(record, profile)) { if (pending.length) record._devPending = []; return; }
    const age = ageAt(record, nowMinute);
    let shifts = sampleCount(rng, RATES.ideologyShift * ageRateFactor(age) * deltaDays);
    if (pending.length && rng.next() < PENDING_SHIFT_CHANCE) shifts = Math.max(1, shifts);
    shifts = Math.min(SHIFTS_PER_PASS_MAX, shifts);
    let moved = false;
    for (let i = 0; i < shifts; i++) {
      const atMinute = lastMinute + Math.floor(rng.next() * Math.max(1, nowMinute - lastMinute));
      if (directedShift(record, profile, rng, atMinute, { pending: i === 0 ? pending : [] })) moved = true;
    }
    record._devPending = [];
    if (moved) window.NPCPolitics?.onCreedChanged?.(record.name);
  }

  // Pre-age (world initializer npcPreAge): the adult years before the start
  // date, up to SHIFTS_PER_PASS_MAX directed shifts over min(20, age - 18)
  // years, written silently, then the identity is brought into step.
  function preAgeCreed(name, profile) {
    const record = ensureLifeRecord(name);
    if (!creedMayMove(record, profile)) return 0;
    const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    const years = Math.min(20, ageAt(record, now) - MIN_NPC_AGE);
    if (years <= 0) return 0;
    const rng = new LifeRng((nameHash(name + "_preage_creed") ^ worldSeed()) >>> 0);
    const shifts = Math.min(SHIFTS_PER_PASS_MAX, sampleCount(rng, RATES.ideologyShift * 365 * years));
    let done = 0;
    for (let i = 0; i < shifts; i++) if (directedShift(record, profile, rng, now, { silent: true })) done++;
    if (done) window.NPCPolitics?.onCreedChanged?.(name);
    return done;
  }

  // ==========================================================================
  // CONVERSION, people talking each other round
  // ==========================================================================
  // `profile.conversion = { toId, pct, by, sinceMin }`: how far somebody has
  // been talked toward another creed, and by whom. Friends and a partner they
  // think well of (opinion CONVERT_OPINION or more) push a little every day,
  // a warm conversation on the street pushes a few points at once, and so
  // does a party member chatting with them in Empathize. A push toward a
  // different creed first erodes the one under way. At 100 the creed changes.
  // With nobody pushing it fades by CONVERT_DECAY a day.

  const CONVERT_OPINION = 40;
  const CONVERT_FRIEND_PER_DAY = 0.4;
  const CONVERT_DECAY = 1;
  const CONVERT_TALK = [2, 4];
  const CONVERT_CHAT = [1, 3];

  const sameCreedPool = (a, b) => !!a && !!b && !!a.alien === !!b.alien;
  const round2 = (n) => Math.round(n * 100) / 100;

  function mayBeConverted(name, profile) {
    if (!profile) return false;
    const record = getRecords()?.[name];
    if (record) return creedMayMove(record, profile);
    if (isNonSentient(profile, name) || window.NPCShared.creedPinned(profile)) return false;
    if (profile._child || (profile.lifeStage && profile.lifeStage !== "adult")) return false; // i18n-ignore: life stage id
    return !!window.NPCShared.ideologyFor(profile);
  }

  function completeConversion(name, profile, toCreed, by, minute) {
    window.NPCShared.setCreed(profile, toCreed);
    delete profile.conversion;
    const record = getRecords()?.[name] || ensureLifeRecord(name);
    if (record) {
      record._devPending = [];
      pushLifeEvent(record, minute, "outlook", "NPCLife.event.converted", { by: by || "", creed: toCreed.id });
    }
    window.NPCPolitics?.onCreedChanged?.(name);
  }

  // Push `amount` pct toward a creed (object or id). Returns the conversion
  // left standing: null once it completes, or when nothing could be pushed.
  function pushConversion(name, toCreedOrId, amount, by, minute) {
    const S = window.NPCShared;
    const profile = getProfile(name);
    if (!mayBeConverted(name, profile) || !(amount > 0)) return null;
    const toCreed = typeof toCreedOrId === "string" ? S.ideologyById(toCreedOrId) : toCreedOrId;
    const own = S.ideologyFor(profile);
    if (!toCreed || toCreed.id === own.id || !sameCreedPool(own, toCreed)) return null;
    const at = minute ?? ($gameVariables ? ($gameVariables.value(114) || 0) : 0);
    let conv = profile.conversion;
    if (conv && conv.toId !== toCreed.id) {
      conv.pct = round2(conv.pct - amount);
      if (conv.pct > 0) return conv;
      amount = -conv.pct;
      conv = null;
      delete profile.conversion;
      if (!(amount > 0)) return null;
    }
    if (!conv) conv = profile.conversion = { toId: toCreed.id, pct: 0, by: by || null, sinceMin: at };
    conv.pct = round2(Math.min(100, conv.pct + amount));
    if (by) conv.by = by;
    if (conv.pct >= 100) { completeConversion(name, profile, toCreed, conv.by, at); return null; }
    return conv;
  }

  // The life-sim pass: friends and partner push, per day over the interval.
  function resolveConversion(record, profile, deltaDays, nowMinute) {
    if (!creedMayMove(record, profile)) return;
    const S = window.NPCShared;
    const own = S.ideologyFor(profile);
    const engagement = window.NPCPolitics?.getIdentity?.(record.name)?.engagement ?? 30;
    // A strong partisan resists being talked round.
    const resist = Math.max(0, 1 - engagement / 150);
    const byCreed = {};
    for (const [other, rel] of Object.entries(profile.relationships || {})) {
      const opinion = Number(rel?.opinion) || 0;
      if (opinion < CONVERT_OPINION || other === record.name) continue;
      const op = getProfile(other);
      if (!op || isNonSentient(op, other)) continue;
      const c = S.ideologyFor(op);
      if (!c || c.id === own.id || !sameCreedPool(own, c)) continue;
      const push = CONVERT_FRIEND_PER_DAY * (Math.min(100, opinion) / 100) * resist;
      const entry = byCreed[c.id] || (byCreed[c.id] = { creed: c, sum: 0, by: null, top: 0 });
      entry.sum += push;
      if (push > entry.top) { entry.top = push; entry.by = other; }
    }
    let best = null;
    for (const e of Object.values(byCreed)) if (!best || e.sum > best.sum) best = e;
    if (best && best.sum > 0) {
      pushConversion(record.name, best.creed, best.sum * deltaDays, best.by, nowMinute);
    } else if (profile.conversion) {
      profile.conversion.pct = round2(profile.conversion.pct - CONVERT_DECAY * deltaDays);
      if (profile.conversion.pct <= 0) delete profile.conversion;
    }
  }

  // A warm conversation on the street (NPCConversation): each of the two
  // leans a few points toward the other's creed.
  function conversationPush(aName, bName, rand = Math.random) {
    const out = [];
    for (const [who, other] of [[aName, bName], [bName, aName]]) {
      const op = getProfile(other);
      if (!op || isNonSentient(op, other)) continue;
      const c = window.NPCShared.ideologyFor(op);
      if (!c) continue;
      const amount = CONVERT_TALK[0] + rand() * (CONVERT_TALK[1] - CONVERT_TALK[0]);
      out.push(pushConversion(who, c, amount, other));
    }
    return out;
  }

  // A party member chatting with an NPC in Empathize: 1-3 points toward the
  // member's creed, scaled by their charisma (LUK) and by what the NPC thinks
  // of them. Somebody who dislikes the speaker is not talked round at all.
  // `mult` scales the whole push (Empathize Preach and Debate push harder).
  function playerPush(npcName, actor, opinion, rand = Math.random, mult = 1) {
    if (!actor) return null;
    const actorName = typeof actor.name === "function" ? actor.name() : String(actor.name || "");
    const creedId = actor._ideologyId || getProfile(actorName)?.ideologyId || null;
    if (!creedId) return null;
    const op = Number(opinion) || 0;
    if (op < 0) return null;
    const luk = Number(typeof actor.luk === "function" ? actor.luk() : actor.luk);
    const charm = 0.75 + Math.max(0, Math.min(100, Number.isFinite(luk) ? luk : 50)) / 200;
    const warmth = 0.5 + Math.min(100, op) / 100;
    const scale = Number.isFinite(Number(mult)) && Number(mult) > 0 ? Number(mult) : 1;
    const amount = (CONVERT_CHAT[0] + rand() * (CONVERT_CHAT[1] - CONVERT_CHAT[0])) * charm * warmth * scale;
    return pushConversion(npcName, creedId, amount, actorName);
  }

  // A party member talking with an NPC through the map dialogue (DialogueSystem
  // playNpcTalk): the same push as the Empathize chat, at most once per NPC per
  // game hour, so talking to somebody ten times in a row is not ten pushes.
  // Nobody is talked round in a world with no people in it, nor Em and Bubba
  // by each other; children, beasts and pinned creeds are refused by
  // pushConversion's own gate (mayBeConverted).
  const DIALOGUE_PUSH_MINUTES = 60;
  const PAIR_NAMES = new Set(["Em", "Bubba"]); // i18n-ignore: actor names matched at runtime
  function dialoguePush(npcName, actor, opinion, rand = Math.random, minute) {
    const WM = window.NPCShared?.WorldModes;
    if (WM && !WM.simulatesPeople()) return null;
    if (!npcName || !actor) return null;
    const actorName = typeof actor.name === "function" ? actor.name() : String(actor.name || "");
    if (PAIR_NAMES.has(actorName) && PAIR_NAMES.has(String(npcName))) return null;
    if (window.NPCCreature?.isNonSentientActor?.(actor)) return null;
    const profile = getProfile(npcName);
    if (!mayBeConverted(npcName, profile)) return null;
    const now = minute ?? ($gameVariables ? ($gameVariables.value(114) || 0) : 0);
    const hour = Math.floor(now / DIALOGUE_PUSH_MINUTES);
    if (profile._creedTalkHour === hour) return null;
    profile._creedTalkHour = hour;
    return playerPush(npcName, actor, opinion, rand);
  }

  // What the Empathize panel shows while somebody is being talked round.
  function conversionOf(name) {
    const conv = getProfile(name)?.conversion;
    if (!conv || !(conv.pct > 0)) return null;
    const creed = window.NPCShared.ideologyById(conv.toId);
    if (!creed) return null;
    return { creedId: creed.id, creed: creedLabel(creed), pct: Math.floor(conv.pct), by: conv.by || null };
  }

  function creedLabel(creedOrId) {
    const creed = typeof creedOrId === "string" ? window.NPCShared.ideologyById(creedOrId) : creedOrId;
    if (!creed) return String(creedOrId || "");
    const key = String(creed.name || "");
    if (key && T.has(key)) return T(key);
    return window.DataService?.t?.(key) || creed.id;
  }

  Object.assign(window.NPCLifeSim._internal, {
    conversationPush, conversionOf, creedLabel, creedOfName, dialoguePush, directedShift, playerPush, preAgeCreed,
    PULL_CAP, pushConversion, resolveConversion, resolveWorldview, SHIFTS_PER_PASS_MAX,
    worldviewPull,
  });
})();
