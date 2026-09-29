/*:
 * @target MZ
 * @plugindesc NPC Simulation: implants and prosthetics
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Vehicles
 * @help
 * ============================================================================
 * NPCSim_Implants, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Implants (SECTION 11b7).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Vehicles.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    Children, MiniRng, nameHash, Specs, Vehicles,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11b7, IMPLANTS AND PROSTHETICS (NPCSim.Implants)
  // ============================================================================
  // profile.implants [{augmentId, part}]: augments out of the clinic's own
  // catalogue (window.Health.ProstheticTypes, the sockets from
  // ProstheticCompatibility through HealthCore.implantsForPart), one per part.
  //
  //   who      the tech-savvy: a Technical trade or a tech job specialization,
  //            know-how in the Technology field or the tech specs, the
  //            tech_savvy trait, a technocratic or singularity creed; and a
  //            few of the very rich with no bent for it at all. A technophobe
  //            never. Rolled once (the `_implV` stamp) off the world seed.
  //   nature   technological augments are mundane, magical ones magical and
  //            biological ones both (window.MagicNature): a severed world
  //            fits no magic, an unbound one no machinery. A magitech (the
  //            Technomancy field, a caster's class) is drawn to magical ones.
  //   over time  NPCLifeSim's catch-up buys one now and then at a clinic,
  //            paid from profile.money (NPCLife.event.gotImplant), and a part
  //            lost in a fight (profile.injuries, `lost`) is made good with a
  //            prosthetic after weeks or months by wealth, through the same
  //            clinic path as the "heal" need (NPCDowned.treat on the map).
  //   effects  paramBonus() is added to a person's side of a skirmish and to
  //            the Empathize battle proxy.
  // Children and beasts carry none (NPCCreature owns the boundary).
  const IMPL_V = 1;
  // i18n-ignore-start: augment type ids, nature ids, part keys, trait keys, job and spec ids, life event keys
  const IMPL_TYPE_NATURE = { technological: "mundane", magical: "magical", biological: "both" };
  const IMPL_TECH_TYPE = "technological";
  const IMPL_MAGIC_TYPE = "magical";
  const IMPL_SKIP_PARTS = new Set(["GENITALS"]);
  const IMPL_TECH_JOB_CAT = "Technical";
  const IMPL_TECH_SPEC_CAT = "Technology";
  const IMPL_TECH_SPECS = new Set(["Cybernetics", "Robotics", "Neurohacking", "Nanotechnology", "Electronics",
    "Computers", "Programming", "Hacking", "Electrical Engineering", "Mechanical Engineering",
    "Biometric Security", "Quantum Computing", "Mechanics", "Technomancy"]);
  const IMPL_MAGITECH_SPECS = new Set(["Technomancy"]);
  const IMPL_TECH_TRAIT = "traits.tech_savvy.name";
  const IMPL_PHOBE_TRAIT = "traits.technophobe.name";
  const IMPL_CREED_RE = /techno|singular|cyber/i;
  const IMPL_ITEM_TAG_RE = /<Augment:\s*([A-Za-z0-9_]+)\s*>/i;
  const IMPL_EVENT_GOT = "NPCLife.event.gotImplant";
  const IMPL_EVENT_PROSTHETIC = "NPCLife.event.gotProsthetic";
  const IMPL_DEFAULT_ARCH = "Humanoid";
  // i18n-ignore-end
  const IMPL_MAX = 4;
  const IMPL_SPEC_MIN = 3;            // a field level that counts as know-how
  const IMPL_START_PER_POINT = 0.12;  // starting odds per point of tech score
  const IMPL_START_PER_TIER = 0.05;   // and per wealth tier
  const IMPL_START_CAP = 0.85;
  const IMPL_VANITY_ODDS = [0, 0, 0, 0.03, 0.08]; // the rich with no bent for it
  const IMPL_EXTRA_ODDS = 0.35;
  // The dearest augment each wealth tier starts out wearing.
  const IMPL_START_BUDGET = [20000, 100000, 400000, 2000000, Infinity];
  const IMPL_BUY_RATE = 0.0005;       // per day, per point of tech score
  const IMPL_BUY_SPEND = 0.5;         // the share of their money one augment may take
  const IMPL_NO_CLINIC = 0.35;        // a town with no clinic of its own
  // Days a lost part waits for its prosthetic, by wealth tier (x0.75 to 1.25).
  const IMPL_LOST_WAIT_DAYS = [150, 90, 50, 28, 14];
  const IMPL_TYPE_WEIGHT = { technological: 1, biological: 0.4, magical: 0.1 };
  const IMPL_MAGITECH_WEIGHT = 1;
  let _implItemIndex = null;

  const Implants = {
    IMPL_V,
    MAX: IMPL_MAX,
    LOST_WAIT_DAYS: IMPL_LOST_WAIT_DAYS,
    EVENT_GOT: IMPL_EVENT_GOT,
    EVENT_PROSTHETIC: IMPL_EVENT_PROSTHETIC,

    types() {
      return window.Health?.ProstheticTypes || null;
    },

    tierOf(profile) {
      return Math.max(0, Math.min(4, Math.floor(Number(profile?.wealthTierBase) || 0)));
    },

    // "mundane" | "magical" | "both", for window.MagicNature.
    natureOf(augmentId) {
      const t = this.types()?.[augmentId];
      return (t && IMPL_TYPE_NATURE[t.type]) || "both"; // i18n-ignore: nature id
    },

    allowed(augmentId) {
      const MN = window.MagicNature;
      if (!MN?.isFiltering?.()) return true;
      return MN.allows(this.natureOf(augmentId));
    },

    // Something a person would pay for: it does something.
    worthwhile(t) {
      if (!t || !IMPL_TYPE_NATURE[t.type]) return false;
      return Object.keys(t.effects || {}).length > 0 || !!t.skill;
    },

    // Every augment this socket takes that the world allows.
    optionsFor(partKey) {
      const types = this.types();
      if (!types || !partKey) return [];
      let keys;
      const HC = window.HealthCore;
      if (HC?.implantsForPart) {
        keys = HC.implantsForPart(partKey) || [];
      } else {
        const table = window.Health?.ProstheticCompatibility || {};
        const k = String(partKey).toUpperCase();
        keys = [].concat(table[k] || [], table[k.replace(/^(LEFT|RIGHT)_/, "")] || []);
      }
      const out = [];
      for (const key of keys) if (key && types[key] && !out.includes(key) && this.allowed(key)) out.push(key);
      return out;
    },

    partsTable(profile) {
      const A = window.Health?.Archetypes || {};
      return (A[profile?.archetype] || A[IMPL_DEFAULT_ARCH])?.parts || {};
    },

    // The sockets of a body an augment may go in.
    bodyParts(profile) {
      return Object.keys(this.partsTable(profile)).filter(k => !IMPL_SKIP_PARTS.has(k));
    },

    // How much of a bent for machinery somebody has: { score, magitech, phobe }.
    techOf(profile) {
      const out = { score: 0, magitech: false, phobe: false };
      if (!profile) return out;
      const book = window.Health?.Traits || window._NPCSocietyDataLoader?.traits || [];
      if (Array.isArray(book)) {
        for (const id of profile.traitIds || []) {
          const t = book.find(tr => tr && tr.id === Number(id));
          if (!t) continue;
          if (t.name === IMPL_PHOBE_TRAIT) out.phobe = true;
          if (t.name === IMPL_TECH_TRAIT) out.score += 2;
        }
      }
      if (out.phobe) { out.score = 0; return out; }
      const jobs = window.WorkSystem?.Jobs;
      const job = profile.currentJobId && Array.isArray(jobs) ? jobs.find(j => j && j.id === profile.currentJobId) : null;
      if (job) {
        if (job.category === IMPL_TECH_JOB_CAT) out.score += 2;
        if (IMPL_TECH_SPECS.has(job.spec)) out.score += 2;
        if (IMPL_MAGITECH_SPECS.has(job.spec)) out.magitech = true;
      }
      const S = Specs.table();
      if (S && profile.specLevels) {
        let known = 0;
        for (const [id, lvl] of Object.entries(profile.specLevels)) {
          if ((Number(lvl) || 0) < IMPL_SPEC_MIN) continue;
          const spec = S.byId?.get?.(Number(id));
          if (!spec) continue;
          if (spec.category === IMPL_TECH_SPEC_CAT || IMPL_TECH_SPECS.has(spec.name)) known++;
          if (IMPL_MAGITECH_SPECS.has(spec.name)) out.magitech = true;
        }
        out.score += Math.min(3, known);
      }
      if (profile.ideologyId && IMPL_CREED_RE.test(String(profile.ideologyId))) out.score += 2;
      if (out.score > 0 && Vehicles.isMagicalClass(profile.assignedClassId)) out.magitech = true;
      return out;
    },

    // The weight of one augment for this person.
    weightOf(t, tech) {
      if (!t) return 0;
      if (t.type === IMPL_MAGIC_TYPE && tech?.magitech) return IMPL_MAGITECH_WEIGHT;
      return IMPL_TYPE_WEIGHT[t.type] || 0;
    },

    lostParts(profile) {
      const out = new Set();
      for (const inj of (Array.isArray(profile?.injuries) ? profile.injuries : [])) if (inj && inj.lost) out.add(inj.part);
      return out;
    },

    // One augment drawn for a free socket, costing no more than `budget`:
    // { key, part } or null.
    pick(profile, rng, tech, budget) {
      const types = this.types();
      if (!types) return null;
      const taken = new Set((profile.implants || []).map(i => i && i.part));
      const lost = this.lostParts(profile);
      const pool = [];
      let total = 0;
      for (const part of this.bodyParts(profile)) {
        if (taken.has(part) || lost.has(part)) continue;
        for (const key of this.optionsFor(part)) {
          const t = types[key];
          if (!this.worthwhile(t) || (Number(t.cost) || 0) > budget) continue;
          const w = this.weightOf(t, tech);
          if (w <= 0) continue;
          pool.push({ key, part, w });
          total += w;
        }
      }
      if (!pool.length) return null;
      let r = rng.next() * total;
      for (const o of pool) { r -= o.w; if (r < 0) return { key: o.key, part: o.part }; }
      const last = pool[pool.length - 1];
      return { key: last.key, part: last.part };
    },

    isPartyMember(name) {
      const members = $gameParty?.members?.() || [];
      return !!name && members.some(a => a && typeof a.name === "function" && a.name() === name);
    },

    // The implants they start out with, rolled once.
    ensure(profile, name, minor) {
      if (!profile) return;
      const child = minor ?? Children.isMinor(profile, name);
      const stamp = () => { profile._implChild = !!child; profile._implV = IMPL_V; };
      if (child || Specs.isNonSentient(profile, name)) {
        profile.implants = [];
        stamp();
        return;
      }
      // A traveller's body is the actor's own (the prosthetics clinic).
      if (this.isPartyMember(name)) {
        if (!Array.isArray(profile.implants)) profile.implants = [];
        stamp();
        return;
      }
      if (!this.types()) return; // not stamped: the catalogue is not loaded yet
      if (!Array.isArray(profile.implants)) profile.implants = [];
      if (!profile._implRolled) {
        profile._implRolled = true;
        const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
        const rng = new MiniRng(nameHash(`${name || profile._eventName || "npc"}_implants`) ^ ws); // i18n-ignore: rng seed key
        const tech = this.techOf(profile);
        const tier = this.tierOf(profile);
        const n = this.startCount(tech, tier, rng);
        for (let i = 0; i < n; i++) {
          const got = this.pick(profile, rng, tech, IMPL_START_BUDGET[tier]);
          if (!got) break;
          profile.implants.push({ augmentId: got.key, part: got.part });
        }
      }
      stamp();
    },

    // How many they start with, pure: 0 for most people.
    startChance(tech, tier) {
      if (!tech || tech.phobe) return 0;
      if (tech.score <= 0) return IMPL_VANITY_ODDS[tier] || 0;
      return Math.min(IMPL_START_CAP, IMPL_START_PER_POINT * tech.score + IMPL_START_PER_TIER * tier);
    },

    startCount(tech, tier, rng) {
      if (rng.next() >= this.startChance(tech, tier)) return 0;
      let n = 1;
      const lean = Math.min(1, ((tech?.score || 0) + tier) / 4);
      while (n < IMPL_MAX - 1 && rng.next() < IMPL_EXTRA_ODDS * lean) n++;
      return n;
    },

    // Their augments' parameters, by RMMZ param id (mhp, mmp, atk, def, mat,
    // mdf, agi, luk).
    paramBonus(profile) {
      const out = [0, 0, 0, 0, 0, 0, 0, 0];
      const list = profile?.implants;
      const types = this.types();
      if (!Array.isArray(list) || !list.length || !types) return out;
      for (const imp of list) {
        const t = imp && types[imp.augmentId];
        if (!t || !t.effects) continue;
        for (const [pid, v] of Object.entries(t.effects)) {
          const i = Number(pid);
          if (i >= 0 && i < 8) out[i] += Number(v) || 0;
        }
      }
      return out;
    },

    // An augment's name in the reader's language.
    label(augmentId) {
      const t = this.types()?.[augmentId];
      if (!t) return String(augmentId || "");
      const lang = (typeof ConfigManager !== "undefined" && ConfigManager.language) || "en"; // i18n-ignore: language code
      return t["name_" + lang] || t.name_en || String(augmentId);
    },

    partLabel(partKey, profile) {
      const part = this.partsTable(profile)[partKey];
      const key = part && part.name;
      const text = key && typeof window.getArchetypeText === "function" ? window.getArchetypeText(key) : null;
      return text || String(partKey || "");
    },

    // [{augmentId, part, name, partName, bonus}] for the Empathize panel.
    describe(profile) {
      const list = Array.isArray(profile?.implants) ? profile.implants : [];
      const types = this.types() || {};
      return list.filter(i => i && types[i.augmentId]).map(i => ({
        augmentId: i.augmentId,
        part: i.part,
        name: this.label(i.augmentId),
        partName: this.partLabel(i.part, profile),
        prosthetic: !!i.prosthetic,
        effects: Object.assign({}, types[i.augmentId].effects || {})
      }));
    },

    byPart(profile) {
      const out = {};
      for (const i of (Array.isArray(profile?.implants) ? profile.implants : [])) if (i && i.part) out[i.part] = i.augmentId;
      return out;
    },

    // The item an augment comes out of a body as: the catalogue's own
    // `itemId`, or an item tagged <Augment: KEY>. 0 when there is none.
    itemIdOf(augmentId) {
      const t = this.types()?.[augmentId];
      if (t && Number(t.itemId) > 0) return Number(t.itemId);
      const items = typeof $dataItems !== "undefined" && $dataItems ? $dataItems : null;
      if (!items) return 0;
      if (!_implItemIndex || _implItemIndex.len !== items.length) {
        const map = {};
        for (const item of items) {
          const m = item && item.note ? String(item.note).match(IMPL_ITEM_TAG_RE) : null;
          if (m && !map[m[1].toUpperCase()]) map[m[1].toUpperCase()] = item.id;
        }
        _implItemIndex = { len: items.length, map };
      }
      return _implItemIndex.map[String(augmentId || "").toUpperCase()] || 0;
    },

    // A part cut away takes its augment with it.
    onPartLost(profile, partKey) {
      if (!profile || !Array.isArray(profile.implants)) return;
      profile.implants = profile.implants.filter(i => i && i.part !== partKey);
    },

    // Days this person waits before a lost part is made good.
    waitDays(profile, partKey, name) {
      const base = IMPL_LOST_WAIT_DAYS[this.tierOf(profile)];
      const h = (nameHash(`${name || profile?._eventName || "npc"}_${partKey}_prosthetic`) >>> 0) % 1000; // i18n-ignore: rng seed key
      return Math.round(base * (0.75 + 0.5 * h / 1000));
    },

    // The minute a lost part's prosthetic is due. The wait is written on
    // the wound the first time it is asked, so the map's clinic path and the
    // life sim's catch-up always agree on it.
    dueAt(profile, inj, name, now) {
      if (inj.lostAt == null) inj.lostAt = now;
      if (inj.waitDays == null) inj.waitDays = this.waitDays(profile, inj.part, name);
      return inj.lostAt + inj.waitDays * 1440;
    },

    // The first lost part whose wait is over, or null. An injury lost
    // before the stamp existed starts its wait now.
    prostheticDue(profile, now, name) {
      if (!profile || !Array.isArray(profile.injuries) || profile._killed) return null;
      let due = null;
      for (const inj of profile.injuries) {
        if (!inj || !inj.lost) continue;
        if (this.dueAt(profile, inj, name, now) <= now && !due) due = inj;
      }
      if (!due) return null;
      if (Children.isMinor(profile, name) || Specs.isNonSentient(profile, name)) return null;
      return due;
    },

    // The prosthetic fitted to a lost part: the dearest they can put half
    // their money into, else the cheapest, paid as far as the purse goes.
    // The wound is gone and the part works again. { augmentId, part, price }.
    fitProsthetic(name, profile, now, inj) {
      const types = this.types();
      const wound = inj || this.prostheticDue(profile, now, name);
      if (!types || !wound) return null;
      const tech = this.techOf(profile);
      let opts = this.optionsFor(wound.part).map(k => ({ k, t: types[k] })).filter(o => o.t);
      if (!opts.length) return null;
      const liked = opts.filter(o => this.weightOf(o.t, tech) >= IMPL_TYPE_WEIGHT.biological);
      if (liked.length) opts = liked;
      opts.sort((a, b) => ((Number(a.t.cost) || 0) - (Number(b.t.cost) || 0)) || (a.k < b.k ? -1 : 1));
      const money = Math.max(0, Number(profile.money) || 0);
      const affordable = opts.filter(o => (Number(o.t.cost) || 0) <= money * IMPL_BUY_SPEND);
      const choice = affordable.length ? affordable[affordable.length - 1] : opts[0];
      const price = Math.min(money, Number(choice.t.cost) || 0);
      profile.money = money - price;
      profile.injuries = profile.injuries.filter(i => i !== wound);
      if (!Array.isArray(profile.implants)) profile.implants = [];
      profile.implants = profile.implants.filter(i => i && i.part !== wound.part);
      profile.implants.push({ augmentId: choice.k, part: wound.part, prosthetic: true });
      return { augmentId: choice.k, part: wound.part, price };
    },

    // A clinic of their own town (a MapJobs healer map, NPCDowned).
    hasClinic(groupName) {
      const D = window.NPCDowned;
      if (!groupName || !D?.groupHealerMaps) return false;
      try { return D.groupHealerMaps(groupName).length > 0; } catch (e) { return false; }
    },

    // NPCLifeSim's catch-up: lost parts made good once their wait is over,
    // and now and then a new augment bought. `push(minute, key, params)`
    // writes the life event. Its own random stream, so nothing else in the
    // pass draws differently. Answers how many augments were fitted.
    catchUp(name, profile, lastMinute, nowMinute, deltaDays, groupName, push) {
      if (!profile || profile._killed || profile.downed || !(deltaDays > 0)) return 0;
      const minor = Children.isMinor(profile, name);
      if (profile._implV !== IMPL_V || !!profile._implChild !== !!minor) this.ensure(profile, name, minor);
      if (minor || profile._implV !== IMPL_V || Specs.isNonSentient(profile, name)) return 0;
      let fitted = 0;
      for (const inj of (Array.isArray(profile.injuries) ? profile.injuries.slice() : [])) {
        if (!inj || !inj.lost) continue;
        const dueAt = this.dueAt(profile, inj, name, lastMinute);
        if (dueAt > nowMinute) continue;
        const got = this.fitProsthetic(name, profile, nowMinute, inj);
        if (!got) continue;
        fitted++;
        if (push) push(Math.max(dueAt, lastMinute), IMPL_EVENT_PROSTHETIC, { augment: got.augmentId, bodyPart: got.part });
      }
      if ((profile.implants || []).length >= IMPL_MAX) return fitted;
      const tech = this.techOf(profile);
      if (tech.phobe || tech.score <= 0) return fitted;
      const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new MiniRng(nameHash(`${name}_implbuy`) ^ ws ^ (lastMinute >>> 0)); // i18n-ignore: rng seed key
      const tier = this.tierOf(profile);
      const clinic = this.hasClinic(groupName) ? 1 : IMPL_NO_CLINIC;
      const rate = Math.min(0.5, IMPL_BUY_RATE * tech.score * (0.5 + 0.5 * tier) * clinic);
      const p = 1 - Math.pow(1 - rate, Math.min(deltaDays, 3650));
      if (rng.next() >= p) return fitted;
      const money = Math.max(0, Number(profile.money) || 0);
      const got = this.pick(profile, rng, tech, money * IMPL_BUY_SPEND);
      if (!got) return fitted;
      const cost = Number(this.types()[got.key].cost) || 0;
      profile.money = Math.max(0, money - cost);
      profile.implants = Array.isArray(profile.implants) ? profile.implants : [];
      profile.implants.push({ augmentId: got.key, part: got.part });
      const at = lastMinute + Math.floor(rng.next() * Math.max(1, nowMinute - lastMinute));
      if (push) push(at, IMPL_EVENT_GOT, { augment: got.key, bodyPart: got.part });
      return fitted + 1;
    },
  };

  Object.assign(NPCSim._internal, {
    Implants,
  });
})();
