/*:
 * @target MZ
 * @plugindesc NPC Life: life stages, pairing, separation and children
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Travel
 * @help
 * ============================================================================
 * NPCLife_Family, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns FAMILY: life stages, pairing, separation and children.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Travel.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    ageAt, creedOfName, endPartnership, ensureLifeRecord, getProfile, getRecords, isNonSentient,
    LifeRng, markDev, MIN_NPC_AGE, minuteOfYear, MINUTES_PER_DAY, MINUTES_PER_YEAR, nameHash,
    PARTNER_NAME_BANK, pushLifeEvent, RATES, sampleCount, setKin, syncCoupleOpinions, worldSeed,
    yearOf,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // FAMILY, who pairs with whom, how they live together, and their children
  // ==========================================================================
  // Pairing answers to both people (mayPair): their orientation both ways
  // (window.NPCRomance, the same answer the Empathize panel reads), the style
  // they live by (Relationships.json, rules below), kin and age. A couple
  // formed here lives by one style (record.partnerStyle); the more exclusive
  // of the two wins, so nobody who wants one partner is signed up to a
  // polycule. Poly styles keep their other partners in record.partners[],
  // record.partner staying the primary one for every older reader.
  //
  // Children: a couple who can conceive (one of them carries, NPCRolledGenitalCode
  // or the gender when no body was rolled) has a pregnancy of 270 days, and
  // any couple, same-sex, poly or queerplatonic included, may adopt. Each is a
  // per-day rate over the interval a catch-up covers (never a day loop), capped
  // at MAX_CHILDREN_PER_HOME minors a household and by the room the town has.
  // birthChild mints a real person: a life record marked `child`, a society
  // profile of the parents' species and class, kin both ways, parental leave.
  // Until eighteen a child holds no job, money, creed, party, romance, crime
  // or travel; at eighteen they come of age and the adult rolls run.

  // i18n-ignore-start: Relationships.json style keys and their simulation rules
  //   dates     forms romantic partnerships at all
  //   marries   a partnership may become a marriage
  //   partners  how many partners at once (a throuple is three people, so two
  //             partners each; a polycule up to five, so four)
  //   qpOnly    a queerplatonic bond, never a romance
  //   breakup   multiplier on the breakup and divorce rates
  //   courtship multiplier on COURTSHIP_MIN_DAYS
  //   kids      multiplier on the conception rate
  const STYLE_RULES = {
    "monogamous":            { dates: true,  marries: true,  partners: 1 },
    "civil-union":           { dates: true,  marries: true,  partners: 1, union: true },
    "arranged-marriage":     { dates: true,  marries: true,  partners: 1, arranged: true },
    "long-distance":         { dates: true,  marries: true,  partners: 1, apart: true, kids: 0.4 },
    "open-relationship":     { dates: true,  marries: true,  partners: 2, open: true },
    "polyamorous":           { dates: true,  marries: true,  partners: 2, poly: true, kids: 0.8 },
    "throuple":              { dates: true,  marries: true,  partners: 2, poly: true, kids: 0.8 },
    "portland-polycule":     { dates: true,  marries: true,  partners: 4, poly: true, kids: 0.8 },
    "companionate":          { dates: true,  marries: true,  partners: 1, breakup: 0.5, kids: 0.6 },
    "serial-monogamy":       { dates: true,  marries: true,  partners: 1, breakup: 1.8, courtship: 0.5, kids: 0.6 },
    "single-content":        { dates: false, marries: false, partners: 0 },
    "situationship":         { dates: true,  marries: false, partners: 1, kids: 0.2 },
    "friends-with-benefits": { dates: true,  marries: false, partners: 1, kids: 0.2 },
    "aromantic-solo":        { dates: false, marries: false, partners: 1, qpOnly: true, breakup: 0.5, kids: 0 },
    "queerplatonic":         { dates: false, marries: false, partners: 1, qpOnly: true, breakup: 0.5, kids: 0 },
  };
  const QP_BOND = "queerplatonic";
  // i18n-ignore-end

  const FAMILY = {
    MAX_CHILDREN_PER_HOME: 4,
    CONCEIVE_PER_DAY: 1 / (365 * 3),
    ADOPT_PER_DAY: 1 / (365 * 14),
    GESTATION_DAYS: 270,
    CARRY_MIN_AGE: 18,
    CARRY_MAX_AGE: 45,
    ADOPT_MIN_AGE: 25,
    ADOPT_MAX_AGE: 55,
    ADOPT_CHILD_MAX_AGE: 9,
    PEOPLE_PER_HOME: 4,
    GROWTH_ROOM: 1.25,
    NEWBORN_MAX_AGE: 2,
    SECOND_PARTNER_RATE: 0.5,
  };

  function nowMinuteOf() {
    return $gameVariables ? ($gameVariables.value(114) || 0) : 0;
  }

  function rulesOf(key) { return STYLE_RULES[key] || STYLE_RULES.monogamous; }

  // The style a person leans toward (NPCRomance), or monogamous when nothing
  // answers.
  function styleKeyOf(name) {
    const profile = getProfile(name);
    const R = window.NPCRomance;
    if (R && R.styleKeyOf) return R.styleKeyOf(name, profile) || "monogamous";
    return profile?._relStyleOverride || profile?.relStyle || "monogamous";
  }

  // --------------------------------------------------------------------------
  // Life stages
  // --------------------------------------------------------------------------

  function stageForAge(age) {
    if (age >= MIN_NPC_AGE) return "adult"; // i18n-ignore: life stage id
    return age <= FAMILY.NEWBORN_MAX_AGE ? "newborn" : "child"; // i18n-ignore: life stage ids
  }

  // Is this person still a child? The life record answers first; a profile
  // with no record yet answers off its own flag.
  function isMinor(name, profile) {
    const record = getRecords()?.[name];
    if (record) return !!record.child;
    profile = profile || getProfile(name);
    return !!(profile && profile._child && profile.lifeStage !== "adult"); // i18n-ignore: life stage id
  }

  function lifeStageOf(name) {
    const record = getRecords()?.[name];
    if (!record || !record.child) {
      const p = getProfile(name);
      if (!record && p && p._child) return p.lifeStage || "child"; // i18n-ignore: life stage id
      return "adult"; // i18n-ignore: life stage id
    }
    return stageForAge(ageAt(record, nowMinuteOf()));
  }

  // How fast they walk on the map: a newborn is carried about at a crawl, a
  // child runs about at an adult's walk. null for an adult (the controller's own).
  function stageMoveSpeed(name) {
    const stage = lifeStageOf(name);
    if (stage === "newborn") return 1; // i18n-ignore: life stage id
    if (stage === "child") return 3;   // i18n-ignore: life stage id
    return null;
  }

  // The sheet a child is drawn with. Children wear the ordinary NPC sheets of
  // their parents' species for now; a child sheet set can answer here later
  // (return a sheet key, or null to keep the one they were dealt).
  function childSprite(profile) {
    void profile;
    return null;
  }

  // --------------------------------------------------------------------------
  // Pairing
  // --------------------------------------------------------------------------

  function identityFor(name, profile) {
    const R = window.NPCRomance;
    return {
      name,
      gender: profile?.gender ?? null,
      synthetic: R?.isSynthetic ? R.isSynthetic(profile) : false,
      botanic: R?.isBotanic ? R.isBotanic(profile) : false,
    };
  }

  // Somebody who can only ever hold a queerplatonic bond: the style says so,
  // or they are aromantic or asexual.
  function wantsOnlyBond(style, orient) {
    return !!style.qpOnly || orient?.romantic?.key === "aromantic" || orient?.sexual?.key === "asexual";
  }

  // What these two could be to each other: "romantic", "queerplatonic", or
  // null when nothing. Both people are asked, both ways.
  function pairKind(aName, bName, nowMinute) {
    if (!aName || !bName || aName === bName) return null;
    // No couple forms where the world holds no families (WorldModes.hasFamilies).
    // A beast never pairs here in any world: where families follow animal
    // rules (monster) its family is its litter, NPCLife_Animals.breedAnimalNpcs.
    if (window.NPCShared?.WorldModes?.hasFamilies?.() === false) return null;
    const records = getRecords();
    const ra = records?.[aName], rb = records?.[bName];
    if (!ra || !rb) return null;
    if (ra.nonSentient || rb.nonSentient || ra.child || rb.child) return null;
    const now = nowMinute ?? nowMinuteOf();
    if (ageAt(ra, now) < MIN_NPC_AGE || ageAt(rb, now) < MIN_NPC_AGE) return null;
    if (ra.kin?.[bName] || rb.kin?.[aName]) return null;
    const pa = getProfile(aName), pb = getProfile(bName);
    if ((pa && isNonSentient(pa, aName)) || (pb && isNonSentient(pb, bName))) return null;
    if ((pa && pa._child) || (pb && pb._child)) return null;

    const sa = rulesOf(styleKeyOf(aName)), sb = rulesOf(styleKeyOf(bName));
    if (!sa.partners || !sb.partners) return null;

    const R = window.NPCRomance;
    const oa = R ? R.orientation(aName, pa) : null;
    const ob = R ? R.orientation(bName, pb) : null;
    const qa = wantsOnlyBond(sa, oa), qb = wantsOnlyBond(sb, ob);
    // A queerplatonic bond is had by two people who both want one; gender
    // does not enter into it.
    if (qa || qb) return (qa && qb) ? QP_BOND : null;
    if (!sa.dates || !sb.dates) return null;
    if (R && R.admits) {
      const ia = identityFor(aName, pa), ib = identityFor(bName, pb);
      if (!R.admits(oa?.romantic, ia.gender, ib) || !R.admits(oa?.sexual, ia.gender, ib)) return null;
      if (!R.admits(ob?.romantic, ib.gender, ia) || !R.admits(ob?.sexual, ib.gender, ia)) return null;
    }
    return "romantic"; // i18n-ignore: bond kind id
  }

  function mayPair(aName, bName, nowMinute) {
    return !!pairKind(aName, bName, nowMinute);
  }

  // Two singles the party introduced (the Empathize panel's Introduce): the
  // same pairing the catch-up makes when two of a town's singles meet, asked
  // of both people through pairKind, with the warmer start of a couple who
  // were brought together on purpose. `by` is the matchmaker, for the
  // biography. Answers { kind, style } or null when they cannot pair.
  const INTRODUCED_OPINION = 45;
  function introduceCouple(aName, bName, nowMinute, by) {
    const records = getRecords();
    const ra = records?.[aName], rb = records?.[bName];
    if (!ra || !rb || ra.partner || rb.partner) return null;
    const now = nowMinute ?? nowMinuteOf();
    const kind = pairKind(aName, bName, now);
    if (!kind) return null;
    const apart = !!(ra.homeGroup && rb.homeGroup && ra.homeGroup !== rb.homeGroup);
    const style = coupleStyle(aName, bName, kind, apart);
    const bond = kind === QP_BOND ? { bond: QP_BOND } : {};
    const eventKey = kind === QP_BOND ? "NPCLife.event.formedBond" : "NPCLife.event.introduced";
    for (const [r, other] of [[ra, rb], [rb, ra]]) {
      r.maritalStatus = "dating";
      r.partner = Object.assign({ name: other.name, external: false }, bond);
      r.partnerSinceMinute = now;
      r.partnerStyle = style;
      pushLifeEvent(r, now, "relationship", eventKey, { name: other.name, by: by || "" });
    }
    syncCoupleOpinions(aName, bName, INTRODUCED_OPINION);
    return { kind, style };
  }

  // The style a new couple lives by.
  function coupleStyle(aName, bName, kind, apart, mustMarry) {
    if (kind === QP_BOND) return QP_BOND;
    const norm = (k) => (k === "long-distance" && !apart) ? "monogamous" : k;
    const ka = norm(styleKeyOf(aName)), kb = bName ? norm(styleKeyOf(bName)) : null;
    if (apart && (ka === "long-distance" || kb === "long-distance")) return "long-distance";
    const cand = [ka, kb].filter(k => {
      if (!k) return false;
      const r = rulesOf(k);
      return r.dates && !r.qpOnly && (!mustMarry || r.marries);
    });
    if (!cand.length) return "monogamous";
    // The more exclusive of the two wins (a stable sort keeps the first on a tie).
    cand.sort((x, y) => rulesOf(x).partners - rulesOf(y).partners);
    return cand[0];
  }

  // Everyone this person is with, primary first.
  function partnersOf(record) {
    if (!record) return [];
    if (Array.isArray(record.partners) && record.partners.length) return record.partners;
    return record.partner ? [record.partner] : [];
  }

  // Takes `name` out of the record's partnerships. When they were the primary
  // partner the next one steps up (a marriage was to the one who left, so the
  // one who stays is a partner they are seeing). True when somebody went.
  function unlinkPartner(record, name) {
    if (!record) return false;
    const list = partnersOf(record).slice();
    const i = list.findIndex(p => p && p.name === name);
    if (i < 0) return false;
    list.splice(i, 1);
    if (!list.length) {
      record.partner = null;
      record.partnerSinceMinute = null;
      delete record.partners;
      delete record.partnerStyle;
      return true;
    }
    if (record.partner?.name === name) {
      const next = list[0];
      record.partner = Object.assign({ name: next.name, external: !!next.external }, next.bond ? { bond: next.bond } : {});
      record.partnerSinceMinute = next.sinceMinute ?? record.partnerSinceMinute;
      if (record.maritalStatus === "married") record.maritalStatus = "dating";
    }
    if (list.length > 1) record.partners = list;
    else delete record.partners;
    return true;
  }

  // A second (third...) partner, for somebody whose style has room for one.
  function linkExtraPartner(record, other, atMinute) {
    if (!Array.isArray(record.partners) || !record.partners.length) {
      record.partners = [Object.assign({}, record.partner, { sinceMinute: record.partnerSinceMinute })];
    }
    record.partners.push({ name: other.name, external: false, sinceMinute: atMinute });
    if (!other.partner) {
      other.partner = { name: record.name, external: false };
      other.partnerSinceMinute = atMinute;
      other.maritalStatus = "dating";
      other.partnerStyle = record.partnerStyle || styleKeyOf(record.name);
    } else {
      if (!Array.isArray(other.partners) || !other.partners.length) {
        other.partners = [Object.assign({}, other.partner, { sinceMinute: other.partnerSinceMinute })];
      }
      other.partners.push({ name: record.name, external: false, sinceMinute: atMinute });
    }
    syncCoupleOpinions(record.name, other.name, 35);
    pushLifeEvent(record, atMinute, "relationship", "NPCLife.event.startedSeeing", { name: other.name });
    pushLifeEvent(other, atMinute, "relationship", "NPCLife.event.startedSeeing", { name: record.name });
  }

  // A long-distance couple keeps a home in each of their towns.
  function livesApart(aName, bName) {
    const r = getRecords()?.[aName];
    return !!(r && r.partnerStyle === "long-distance" && partnersOf(r).some(p => p.name === bName));
  }

  // Is there room in this person's life for one more partner?
  function roomForAnother(record) {
    const own = rulesOf(styleKeyOf(record.name));
    const lived = rulesOf(record.partnerStyle || styleKeyOf(record.name));
    if (!(own.poly || own.open) || !(lived.poly || lived.open)) return false;
    return partnersOf(record).length < Math.min(own.partners, lived.partners);
  }

  // Would a single person join somebody who is already with someone? Only a
  // poly or open soul, or (for an open relationship) somebody after nothing
  // more than a fling.
  function acceptsExtra(name, hostRules) {
    const r = rulesOf(styleKeyOf(name));
    return !!(r.poly || r.open || (hostRules.open && r.dates && !r.marries));
  }

  // Secondary partners: they drift apart at the dating rate, and a poly or
  // open life with room in it may find another.
  function resolveExtraPartners(record, rng, lastMinute, nowMinute, deltaDays, singlesByGroup) {
    const span = Math.max(1, nowMinute - lastMinute);
    for (const p of partnersOf(record).slice(1)) {
      if (sampleCount(rng, RATES.breakup * deltaDays) > 0) {
        const at = lastMinute + Math.floor(rng.next() * span);
        endPartnership(record, yearOf(at), "broke up", at, p.name); // i18n-ignore: outcome id
        pushLifeEvent(record, at, "relationship", "NPCLife.event.brokeUpWith", { name: p.name });
      }
    }
    if (!record.partner || !roomForAnother(record)) return;
    if (sampleCount(rng, RATES.startDating * FAMILY.SECOND_PARTNER_RATE * record.charisma * deltaDays) <= 0) return;
    const pool = singlesByGroup[record.homeGroup || "__none__"] || [];
    const current = new Set(partnersOf(record).map(p => p.name));
    const host = rulesOf(record.partnerStyle || styleKeyOf(record.name));
    const candidates = pool.filter(n => !current.has(n) &&
      pairKind(record.name, n, nowMinute) === "romantic" && acceptsExtra(n, host)); // i18n-ignore: bond kind id
    if (!candidates.length) return;
    const pick = candidates[Math.floor(rng.next() * candidates.length)];
    const other = getRecords()?.[pick];
    if (!other || other.partner) return;
    linkExtraPartner(record, other, lastMinute + Math.floor(rng.next() * span));
    const idx = pool.indexOf(pick); if (idx >= 0) pool.splice(idx, 1);
  }

  // --------------------------------------------------------------------------
  // Separation
  // --------------------------------------------------------------------------

  // Everyone whose parent this person is (kin, read from their side).
  function childrenOf(name) {
    const kin = getRecords()?.[name]?.kin || {};
    return Object.keys(kin).filter(n => kin[n] === "parent");
  }
  function parentsOf(name) {
    const kin = getRecords()?.[name]?.kin || {};
    return Object.keys(kin).filter(n => kin[n] === "child");
  }
  function minorChildrenOf(parentNames) {
    const out = new Set();
    for (const p of parentNames) for (const c of childrenOf(p)) if (isMinor(c)) out.add(c);
    return [...out];
  }

  // After a split, whoever is not on the lease leaves the home they shared:
  // for another home in town with room, else out of town (a relocation, when
  // that exists), else the street. The children stay with one of them, seeded.
  function separateHousehold(aName, bName, atMinute) {
    const sim = window.NPCSim;
    if (!sim || !sim.moveOut || !sim.sharesHome || !sim.sharesHome(aName, bName)) return null;
    const rng = new LifeRng(nameHash([aName, bName].sort().join("|") + "_split" + atMinute) ^ worldSeed());
    const lease = sim.leaseHolderOf ? sim.leaseHolderOf(aName, bName) : null;
    let leaver = lease === aName ? bName : lease === bName ? aName : null;
    if (!leaver) leaver = rng.next() < 0.5 ? aName : bName;
    const stayer = leaver === aName ? bName : aName;
    const shared = childrenOf(aName).filter(c => childrenOf(bName).includes(c) && isMinor(c) && sim.sharesHome(c, stayer));
    const kidsGo = rng.next() < 0.5;
    const result = sim.moveOut(leaver, { withNames: kidsGo ? shared : [], reason: "separation" }); // i18n-ignore: reason id
    const record = getRecords()?.[leaver];
    if (record) {
      pushLifeEvent(record, atMinute, "move",
        result && result.rough ? "NPCLife.event.movedOutRough" : "NPCLife.event.movedOut", { name: stayer });
    }
    return leaver;
  }

  // --------------------------------------------------------------------------
  // Children
  // --------------------------------------------------------------------------

  // Whose body can carry a child, and whose can father one. The body the
  // Empathize panel rolled (NPCRolledGenitalCode: 1 uterus, 2 oviduct, 0 testes)
  // when there is one, else the gender.
  function bodyOf(name, profile) {
    let code = null;
    try { code = window.NPCRolledGenitalCode ? window.NPCRolledGenitalCode(name, profile) : null; } catch (_) { code = null; }
    if (code === 1 || code === 2) return "carry"; // i18n-ignore: body role id
    if (code === 0) return "sire"; // i18n-ignore: body role id
    if (code != null) return null;
    if (profile?.gender === 1) return "carry"; // i18n-ignore: body role id
    if (profile?.gender === 0) return "sire";  // i18n-ignore: body role id
    return null;
  }

  // How many days the one carrying is pregnant for: the term their own
  // archetype declares (Archetypes.json `pregnancyDuration`, the median of the
  // two for a spliced body), so a Naguka's clutch is laid in weeks and a
  // Verden's sporangium ripens for over a year. GESTATION_DAYS stands in when
  // the health tables are not loaded.
  function gestationDaysOf(profile) {
    const HC = window.HealthCore;
    const keys = window.NPCCreature?.archetypeKeysOf?.(profile) || [];
    const terms = HC?.getArchetypePregnancyDuration
      ? keys.map((k) => HC.getArchetypePregnancyDuration(k)).filter((d) => d > 0).sort((a, b) => a - b)
      : [];
    if (!terms.length) return FAMILY.GESTATION_DAYS;
    const mid = terms.length >> 1;
    return Math.max(1, Math.round(terms.length % 2 ? terms[mid] : (terms[mid - 1] + terms[mid]) / 2));
  }

  // A child born to goblins is one of its parents' people, the carrier's first.
  function inheritGoblinSpecies(profile, leadProfile, parentProfiles) {
    const NC = window.NPCCreature;
    if (!profile || !NC?.goblinSpeciesOf) return;
    const from = [leadProfile, ...parentProfiles].find((p) => p && NC.goblinSpeciesOf(p));
    if (!from) return;
    profile.archetype = NC.goblinSpeciesOf(from) === "naguka" // i18n-ignore: species id
      ? NC.NAGUKA_ARCHETYPE : NC.VERDEN_ARCHETYPE;
    delete profile._goblinSpeciesDealt;
  }

  function carrierOf(ra, pa, rb, pb) {
    const ba = bodyOf(ra.name, pa), bb = bodyOf(rb.name, pb);
    if (ba === "carry" && bb === "sire") return ra.name; // i18n-ignore: body role id
    if (bb === "carry" && ba === "sire") return rb.name; // i18n-ignore: body role id
    return null;
  }

  // Room in the town for one more: its homes times PEOPLE_PER_HOME, or, with
  // no homes on file, the population it was dealt plus room to grow.
  function groupCapacity(group, ctx) {
    if (!group) return Infinity;
    if (ctx && ctx.capacity[group] != null) return ctx.capacity[group];
    const g = $gameSystem?._npcMapGroups?.[group];
    const homes = Array.isArray(g?.residentialBuildings) ? g.residentialBuildings : [];
    let cap;
    if (homes.length) {
      cap = homes.reduce((t, b) => t + Math.max(1, b.capacity || 1) *
        (b.type === "enterMultiBuilding" ? Math.max(1, b.totalFloors || 1) : 1), 0) * FAMILY.PEOPLE_PER_HOME; // i18n-ignore: building type id
    } else {
      const base = ($gameSystem._npcFamilyBasePop = $gameSystem._npcFamilyBasePop || {});
      if (base[group] == null) base[group] = ctx ? (ctx.pop[group] || 0) : 0;
      cap = Math.max(4, Math.ceil(base[group] * FAMILY.GROWTH_ROOM));
    }
    if (ctx) ctx.capacity[group] = cap;
    return cap;
  }

  function roomInGroup(group, ctx) {
    if (!group || !ctx) return true;
    return (ctx.pop[group] || 0) < groupCapacity(group, ctx);
  }

  function familyContext(records) {
    const pop = {};
    for (const r of Object.values(records)) {
      if (!r || r.nonSentient || !r.homeGroup) continue;
      pop[r.homeGroup] = (pop[r.homeGroup] || 0) + 1;
    }
    return { pop, capacity: {} };
  }

  function mintChildName(seed) {
    const society = $gameSystem?._npcSociety || {};
    const records = getRecords() || {};
    const taken = (n) => !n || !!society[n] || !!records[n] || n === "Unknown" || n === "NPC"; // i18n-ignore: Markov generator sentinels
    for (let t = 0; t < 10; t++) {
      const s = (seed ^ Math.imul(t + 1, 0x165667b1)) >>> 0;
      let made = "";
      try {
        made = window.generateSeededMarkovName
          ? window.generateSeededMarkovName(s & 0xffff, (s >>> 16) & 0xffff, (s % 997) + 1, "names", 2, 4, 12) // i18n-ignore: Markov bank id
          : "";
      } catch (_) { made = ""; }
      if (made && !taken(made)) return made;
    }
    const bank = PARTNER_NAME_BANK;
    for (let i = 0; i < bank.length * 27; i++) {
      const base = bank[(seed + i) % bank.length];
      const round = Math.floor(i / bank.length);
      const made = round === 0 ? base : base + " " + String.fromCharCode(64 + round);
      if (!taken(made)) return made;
    }
    return null;
  }

  // A face off the ordinary NPC sheets of the parents' own kind: the same
  // archetype, and alien, Varlenian or goblin when they are.
  function pickChildSprite(parentProfiles, gender, rng) {
    const NPCs = window.WorldGen?.NPCs || {};
    const species = (e) => [e.Archetype || "Humanoid", !!e.aliens, !!e.varlenian, !!e.goblin].join("|"); // i18n-ignore: archetype id
    const ref = parentProfiles.map(p => p && NPCs[p.spriteKey]).find(Boolean) || null;
    const want = ref ? species(ref) : "Humanoid|false|false|false"; // i18n-ignore: archetype id
    const pool = Object.keys(NPCs).filter(k => {
      const e = NPCs[k];
      return e && e.npc && !e.animal && !e.creature && !e.zombie && !e.beta && !e.vip && species(e) === want;
    }).sort();
    const byGender = pool.filter(k => NPCs[k].Gender === gender);
    const list = byGender.length ? byGender : pool;
    if (list.length) return list[Math.floor(rng.next() * list.length)];
    return parentProfiles.find(p => p && p.spriteKey)?.spriteKey || null;
  }

  function pickParentClass(parentProfiles, rng) {
    const NC = window.NPCCreature;
    const ids = parentProfiles.map(p => p && p.assignedClassId)
      .filter(id => id && !(NC && NC.isNonSentientClassId && NC.isNonSentientClassId(id)));
    return ids.length ? ids[Math.floor(rng.next() * ids.length)] : undefined;
  }

  // Everything that makes a society profile a child's: no trade, no purse, no
  // creed, no banner, level one, the life stage, the family home.
  function applyChildProfile(name, profile, opts = {}) {
    if (!profile) return;
    const record = getRecords()?.[name];
    const age = record ? ageAt(record, nowMinuteOf()) : Math.max(0, Number(opts.age) || 0);
    profile._child = true;
    profile.lifeStage = stageForAge(age);
    if (record) profile._birthYearOverride = record.birthYear;
    profile.level = 1;
    delete profile.exp;
    profile.money = 0;
    profile.itemIds = [];
    profile.currentJobId = 0;
    profile.workMapId = null;
    profile.workShift = null;
    profile.factionIndex = -1;
    profile.ideologyIndex = -1;
    profile.ideologyId = null;
    if (opts.spriteKey) {
      profile.spriteKey = opts.spriteKey;
      profile.bustIndex = opts.bustIndex || 0;
      const entry = window.WorldGen?.NPCs?.[opts.spriteKey] || null;
      const bust = entry?.busts?.[profile.bustIndex] ?? entry?.busts?.[0] ?? null;
      if (bust && bust !== "7") profile._bustName = bust;
      if (entry && entry.Gender != null) profile.gender = entry.Gender;
      else if (opts.gender != null) profile.gender = opts.gender;
    }
    const alt = window.NPCLifeSim?.childSprite ? window.NPCLifeSim.childSprite(profile) : null;
    if (alt) profile.spriteKey = alt;
    const home = opts.home;
    if (home && !home._placeholder) {
      const group = opts.group || home.groupName || profile._homeGroupName;
      if (group) profile._homeGroupName = group;
      if (window.NPCSim?.moveInHousehold && group) {
        window.NPCSim.moveInHousehold(home, group, [name], home.floorIndex || 0);
      } else {
        profile.homeBuilding = Object.assign({}, home);
        profile.homeSeed = home.seed;
      }
    }
  }

  // Leave for a parent, whatever is left of it once the skip that held the
  // birth is over (NPCSim.Leave, SECTION 11d2 of NPCSimulationCore).
  function startParentalLeave(name, role, salt, atMinute) {
    const L = window.NPCSim?.Leave;
    if (!L || !L.start) return;
    const fallback = role === "birth" ? 150 : role === "adoption" ? 90 : 60; // i18n-ignore: leave role ids
    const days = L.parentalDays ? L.parentalDays(name, role, salt) : fallback;
    const left = Math.round(days - Math.max(0, nowMinuteOf() - atMinute) / MINUTES_PER_DAY);
    if (left > 0) L.start(name, "parental", left, { reason: role }); // i18n-ignore: leave kind id
  }

  // A child comes into the family: born to `parentNames` (the one who carried
  // them in opts.carrier), or adopted (opts.adopted, opts.age). Answers the
  // child's name, or null when there is no room for one.
  function birthChild(parentNames, opts = {}) {
    const records = getRecords();
    if (!records || !$gameSystem) return null;
    const parents = (parentNames || []).filter(n => records[n] && !records[n].nonSentient && !records[n].child);
    if (!parents.length) return null;
    const now = nowMinuteOf();
    const at = Math.min(now, opts.atMinute ?? now);
    const adopted = !!opts.adopted;
    const age = adopted ? Math.max(0, Math.min(MIN_NPC_AGE - 1, Math.floor(Number(opts.age) || 0))) : 0;
    const lead = opts.carrier && parents.includes(opts.carrier) ? opts.carrier : parents[0];
    const leadRec = records[lead];
    const leadProfile = getProfile(lead);
    const group = leadRec.homeGroup || leadProfile?._homeGroupName || null;
    if (minorChildrenOf(parents).length >= FAMILY.MAX_CHILDREN_PER_HOME) return null;
    if (opts.ctx && !roomInGroup(group, opts.ctx)) return null;

    const seed = (nameHash(parents.slice().sort().join("&") + "_child_" + at) ^ worldSeed()) >>> 0;
    const rng = new LifeRng(seed);
    const name = mintChildName(seed);
    if (!name) return null;
    const gender = rng.next() < 0.5 ? 0 : 1;
    const parentProfiles = parents.map(getProfile);
    const spriteKey = pickChildSprite(parentProfiles, gender, rng);
    const bustIndex = spriteKey && !String(spriteKey).includes("!$") ? rng.int(0, 7) : 0; // i18n-ignore: sprite-sheet prefix

    // The record comes first, so everything the profile sets off on its way
    // in (the specializations, the job roster) already knows this is a child.
    const birthMinute = adopted
      ? at - age * MINUTES_PER_YEAR - Math.floor(rng.next() * 0.9 * MINUTES_PER_YEAR)
      : at;
    const record = ensureLifeRecord(name, group, undefined, {
      child: true, age, birthMinute,
      birthplace: adopted ? null : (leadRec.currentPlace || null),
    });
    if (!record) return null;
    record.child = true;
    if (group) record.homeGroup = group;

    let profile = null;
    try {
      const classId = pickParentClass(parentProfiles, rng);
      const homeMapId = leadProfile?.homeBuilding?.mapId ?? leadProfile?.homeMapId ?? undefined;
      const options = { initSpec: { age: String(age) } };
      if (spriteKey) { options.spriteKey = spriteKey; options.bustIndex = bustIndex; }
      profile = window.NPCSocietyRegistry?.ensureProfile?.(name, classId, group, homeMapId, options) || null;
    } catch (e) {
      console.error("[NPCLifeSim] a child's profile could not be made", e);
      profile = null;
    }
    if (profile) {
      applyChildProfile(name, profile, {
        spriteKey, bustIndex, gender, age, group,
        home: leadProfile?.homeBuilding || null,
      });
      if (!adopted) inheritGoblinSpecies(profile, leadProfile, parentProfiles);
    }

    // Family, both ways: parents, the brothers and sisters already there, and
    // the grandparents.
    const siblings = new Set();
    for (const p of parents) for (const c of childrenOf(p)) if (c !== name) siblings.add(c);
    for (const p of parents) setKin(p, name, "parent");
    for (const s of siblings) setKin(s, name, "sibling");
    for (const p of parents) for (const g of parentsOf(p)) setKin(g, name, "grandparent");

    for (const p of parents) {
      pushLifeEvent(records[p], at, "family", adopted ? "NPCLife.event.childAdopted" : "NPCLife.event.childBorn", { name });
      markDev(records[p], "child");
      const role = adopted ? "adoption" : (p === opts.carrier ? "birth" : "partner"); // i18n-ignore: leave role ids
      startParentalLeave(p, role, name, at);
    }
    if (opts.ctx && group) opts.ctx.pop[group] = (opts.ctx.pop[group] || 0) + 1;
    return name;
  }

  // A couple's chance at a child over the interval: a pregnancy come to term,
  // a new one, or an adoption.
  function resolveFamily(record, profile, rng, lastMinute, nowMinute, deltaDays, ctx) {
    if (record.nonSentient || record.child) return;
    const span = Math.max(1, nowMinute - lastMinute);
    const preg = record.pregnancy;
    if (preg) {
      if (preg.dueMin <= nowMinute) {
        delete record.pregnancy;
        birthChild([record.name, preg.otherParent].filter(Boolean), { atMinute: preg.dueMin, carrier: record.name, ctx });
      }
      return;
    }
    const partner = record.partner;
    if (!partner || partner.external || record.inPrisonUntilMinute != null) return;
    // One roll per couple.
    if (record.name > partner.name) return;
    const other = getRecords()?.[partner.name];
    if (!other || other.nonSentient || other.child || other.pregnancy || other.inPrisonUntilMinute != null) return;
    if (!partnersOf(other).some(p => p.name === record.name)) return;

    const parents = [record.name, other.name];
    const kids = minorChildrenOf(parents).length;
    if (kids >= FAMILY.MAX_CHILDREN_PER_HOME) return;
    if (!roomInGroup(record.homeGroup, ctx)) return;

    const lived = rulesOf(record.partnerStyle || styleKeyOf(record.name));
    const kidFactor = [1, 0.6, 0.35, 0.15][kids] ?? 0;
    const statusFactor = record.maritalStatus === "married" ? 1 : 0.3;
    const pb = getProfile(other.name);
    const carrier = partner.bond === QP_BOND ? null : carrierOf(record, profile, other, pb);
    if (carrier) {
      const cRec = carrier === record.name ? record : other;
      const sRec = cRec === record ? other : record;
      const age = ageAt(cRec, nowMinute);
      const ageFactor = (age < FAMILY.CARRY_MIN_AGE || age > FAMILY.CARRY_MAX_AGE) ? 0
        : age < 35 ? 1 : age < 40 ? 0.55 : 0.25;
      const rate = FAMILY.CONCEIVE_PER_DAY * ageFactor * statusFactor * kidFactor *
        (lived.kids ?? 1) * (ageAt(sRec, nowMinute) >= MIN_NPC_AGE ? 1 : 0);
      if (rate > 0 && sampleCount(rng, rate * deltaDays) > 0) {
        const at = lastMinute + Math.floor(rng.next() * span);
        const term = gestationDaysOf(cRec === record ? profile : pb);
        cRec.pregnancy = { sinceMin: at, dueMin: at + term * MINUTES_PER_DAY, otherParent: sRec.name };
        pushLifeEvent(cRec, at, "family", "NPCLife.event.pregnant", { name: sRec.name });
        // Conceived early in a long skip: already born by now.
        if (cRec.pregnancy.dueMin <= nowMinute) {
          const p = cRec.pregnancy;
          delete cRec.pregnancy;
          birthChild([cRec.name, p.otherParent], { atMinute: p.dueMin, carrier: cRec.name, ctx });
        }
        return;
      }
    }

    // Adoption: any couple at all, a little older and with a little put by.
    const inAge = (a) => a >= FAMILY.ADOPT_MIN_AGE && a <= FAMILY.ADOPT_MAX_AGE;
    if (!inAge(ageAt(record, nowMinute)) || !inAge(ageAt(other, nowMinute))) return;
    const tier = Math.max(profile?.wealthTierBase ?? 1, pb?.wealthTierBase ?? 1);
    if (tier < 1) return;
    const adoptRate = FAMILY.ADOPT_PER_DAY * (carrier ? 0.3 : 1.5) * statusFactor * kidFactor;
    if (sampleCount(rng, adoptRate * deltaDays) > 0) {
      const at = lastMinute + Math.floor(rng.next() * span);
      birthChild(parents, { atMinute: at, adopted: true, age: rng.int(0, FAMILY.ADOPT_CHILD_MAX_AGE), ctx });
    }
  }

  // Keeps a child's life stage current, and at eighteen lets them go: the
  // record and profile become an adult's, the job roster deals them a trade,
  // the purse and the specializations are rolled, and they hold the creed they
  // were raised in until their own life moves it. False while still a child.
  function resolveGrowingUp(record, profile, nowMinute) {
    const age = ageAt(record, nowMinute);
    if (age < MIN_NPC_AGE) {
      if (profile) {
        const stage = stageForAge(age);
        if (profile.lifeStage !== stage) profile.lifeStage = stage;
        if (!profile._child) applyChildProfile(record.name, profile, {});
      }
      return false;
    }
    delete record.child;
    if (record.employment === "none") record.employment = "unemployed"; // i18n-ignore: employment state ids
    const at = Math.min(nowMinute, minuteOfYear(record.birthYearFloat + MIN_NPC_AGE));
    pushLifeEvent(record, at, "family", "NPCLife.event.cameOfAge", {});
    if (profile) {
      delete profile._child;
      profile.lifeStage = "adult"; // i18n-ignore: life stage id
      profile.currentJobId = null;
      delete profile.money;
      const raisedIn = parentsOf(record.name).map(creedOfName).find(Boolean);
      if (raisedIn && window.NPCShared?.setCreed && !(profile.ideologyId)) window.NPCShared.setCreed(profile, raisedIn);
      try { window.NPCSim?.ensureSimFields?.(profile, record.name); } catch (_) { /* rolled on the next tick */ }
    }
    markDev(record, "age");
    return true;
  }

  Object.assign(window.NPCLifeSim._internal, {
    applyChildProfile, birthChild, carrierOf, childrenOf, childSprite, coupleStyle, FAMILY,
    familyContext, introduceCouple, isMinor, lifeStageOf, linkExtraPartner, livesApart, mayPair, minorChildrenOf, mintChildName,
    nowMinuteOf, pairKind, parentsOf, partnersOf, QP_BOND, resolveExtraPartners, resolveFamily,
    resolveGrowingUp, roomForAnother, rulesOf, separateHousehold, stageForAge, stageMoveSpeed,
    STYLE_RULES, styleKeyOf, unlinkPartner, wantsOnlyBond,
  });
})();
