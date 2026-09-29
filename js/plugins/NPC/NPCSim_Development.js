/*:
 * @target MZ
 * @plugindesc NPC Simulation: experience, specializations and lazy development
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Homes
 * @help
 * ============================================================================
 * NPCSim_Development, part of the NPCSimulationCore family
 * ============================================================================
 * Owns ExpManager (SECTION 11b2) and Specs and Dev (SECTION 11b3).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Homes.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    DEFAULT_SEED, JobManager, MiniRng, nameHash, StoryLogger,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Children, FAM_V, Gear, Implants, Stocks, Vehicles;
  NPCSim._internal._late.push(() => ({
    Children, FAM_V, Gear, Implants, Stocks, Vehicles,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 11b2, EXP MANAGER
  // ============================================================================
  // NPCs with an assignedClassId gain EXP once per game day and can level up,
  // learning new class skills along the way.  Uses the same formula as RMMZ's
  // Game_Actor.prototype.expForLevel so levels feel consistent with the player.
  //
  // Days the tick did not see (a sleep, a fast-travel jump, a stretch nobody
  // was loaded) are paid in full by gainExpDays, up to MAX_CATCHUP_DAYS at a
  // time. CATCHUP_RATE scales the daily amount for every day, seen or not, and
  // is the one knob to turn if a world's people outgrow the party too fast.
  const CATCHUP_RATE     = 1;
  const MAX_CATCHUP_DAYS = 3650;

  const ExpManager = {
    expForLevel(classId, level) {
      if (level <= 1) return 0;
      const cls = $dataClasses?.[classId];
      if (!cls) return level * level * 50;
      const [basis, extra, acc_a, acc_b] = cls.expParams;
      return Math.round(
        (basis * Math.pow(level - 1, 0.9 + acc_a / 250) * level * (level + 1)) /
        (6 + Math.pow(level, 2) / 50 / acc_b) +
        (level - 1) * extra
      );
    },

    expToNextLevel(classId, level) {
      return this.expForLevel(classId, level + 1) - this.expForLevel(classId, level);
    },

    learnClassSkillsUpToLevel(profile, classId, maxLevel) {
      const cls = $dataClasses?.[classId];
      if (!cls) return;
      profile.skillIds = profile.skillIds || [];
      for (const learning of (cls.learnings || [])) {
        if (learning.level <= maxLevel && !profile.skillIds.includes(learning.skillId)) {
          profile.skillIds.push(learning.skillId);
        }
      }
    },

    gainDailyExp(profile, name) {
      return this.gainExpDays(profile, name, 1);
    },

    // `days` days of the daily gain at once, for a time skip or a stretch the
    // tick did not see. It walks level by level, not day by day: inside one
    // level the daily amount is constant, so the days needed to reach the next
    // one are worked out in a single division, and a ten-year skip costs as
    // many steps as levels gained. The result is exactly what calling the
    // daily gain once per day would have given. Returns the levels gained.
    gainExpDays(profile, name, days) {
      const classId = profile.assignedClassId;
      if (!classId || !$dataClasses?.[classId]) return 0;
      if ((profile.level ?? 1) >= 99) return 0;
      // A "local" resident's level is pinned to the party median by NPCSociety,
      // so there is nothing for them to earn their way past.
      if (profile._localNpc) return 0;
      let left = Math.min(MAX_CATCHUP_DAYS, Math.max(0, Math.floor(Number(days) || 0)));
      if (!left) return 0;

      if (profile.level == null) profile.level = 1;
      if (profile.exp == null) profile.exp = this.expForLevel(classId, profile.level);
      const startLevel = profile.level;
      while (left > 0 && profile.level < 99) {
        const level = profile.level;
        const toNext = this.expToNextLevel(classId, level);
        const daily  = Math.max(1, Math.floor(toNext / Math.max(1, level) * CATCHUP_RATE));
        const need   = this.expForLevel(classId, level + 1) - profile.exp;
        const toLevel = Math.max(1, Math.ceil(need / daily));
        if (toLevel > left) { profile.exp += left * daily; left = 0; break; }
        profile.exp += toLevel * daily;
        left -= toLevel;
        while (profile.level < 99 && profile.exp >= this.expForLevel(classId, profile.level + 1)) {
          profile.level++;
          this.learnClassSkillsUpToLevel(profile, classId, profile.level);
        }
      }

      const gained = profile.level - startLevel;
      const leveled = gained > 0;
      if (leveled) {
        // Every level gained is honed into the person's trades; a long
        // catch-up is written up as one line, not as a tier-up per level.
        Specs.sync(profile, name, { silent: gained > SPEC_LOG_MAX_GAP });
        const mid      = Math.max(1, profile.level * 5);
        profile.atk    = Math.max(profile.atk    ?? 1, mid);
        profile.def    = Math.max(profile.def    ?? 1, mid);
        profile.mat    = Math.max(profile.mat    ?? 1, mid);
        profile.mdf    = Math.max(profile.mdf    ?? 1, mid);
        profile.agi    = Math.max(profile.agi    ?? 1, mid);
        profile.luk    = Math.max(profile.luk    ?? 1, mid);
        profile.mhp    = (10 + profile.level) * 10;
        profile.mmp    = (5  + profile.level) * 5;
        StoryLogger.record(name, "levelup", 'NPCSim.log.reachedLevel', { level: profile.level });
      }
      return gained;
    },
  };

  // ============================================================================
  // SECTION 11b3, DEVELOPMENT (NPCSim.Dev)
  // ============================================================================
  // Everything a person grows into over the years, brought up to date lazily
  // from ensureSimFields. Each facet sits behind a version stamp on the
  // profile, because profiles are minted lazily: a person is dealt a facet the
  // first time somebody looks at them, and a profile whose stamps are all
  // current is passed over at the cost of a few comparisons.
  //
  //   _specV   specializations that grow with level (NPCSim.Specs, below)
  //   _vehV    the bike or broom a person owns (NPCSim.Vehicles, SECTION 11b6)
  //   _civicV  the creed drawn toward party and government (a later phase)
  //   _famV    family ties (a later phase)
  //   _implV   implants and prosthetics (NPCSim.Implants, SECTION 11b7)
  //
  // A later facet adds its own stamp check to Dev.ensure.

  const SPEC_V = 1;
  // Honing: every level a person gains is 2 points spread over what they
  // focus on, and a tier costs half of what it costs the party (the table in
  // SpecializationMenu.js). With the job weighing 0.4 of the focus that puts a
  // level-30 worker at about Intermediate in their trade and a level-60 one at
  // about Advanced.
  const SPEC_POINTS_PER_LEVEL = 2;
  const SPEC_TIER_COST_MULT   = 0.5;
  const SPEC_FOCUS_MAX        = 5;
  const SPEC_CLASS_FOCUS_MAX  = 2;
  const SPEC_FOCUS_WEIGHT     = { job: 0.4, class: 0.3, personal: 0.3 };
  const SPEC_PERSONAL_MIN     = 2;
  const SPEC_PERSONAL_MAX     = 4;
  const SPEC_PERSONAL_CLASS_P = 0.6;  // share of the personal picks drawn from the class's own fields
  // A sync covering more levels than this is a catch-up (a pre-aged world, a
  // long skip, a level pinned by another system), written up silently.
  const SPEC_LOG_MAX_GAP = 3;

  // Guards the job lookup Specs.ensure may trigger, so a roster pass that
  // touches other profiles cannot re-enter it.
  let _specJobLookup = false;

  const Specs = {
    table() {
      const S = window.Specializations;
      return (S && S.ready) ? S : null;
    },

    // Whether this person is a beast (NPCCreature owns the boundary). A
    // profile that is the society's own entry for the name is asked by name,
    // so a party member's class on the actor wins; anything else by class.
    isNonSentient(profile, name, classId) {
      const NC = window.NPCCreature;
      if (!NC) return false;
      if (name && profile && $gameSystem?._npcSociety?.[name] === profile && NC.isNonSentientByName) {
        return !!NC.isNonSentientByName(name);
      }
      const id = classId ?? profile?.assignedClassId;
      return !!NC.isNonSentientClassId?.(id);
    },

    // A beast is trained in what a body does and in nothing that needs a
    // mind: Specialization.json marks each entry `sentient`, and a creature
    // class draws only from the rest. No cat has ever kept a set of books.
    allowedFor(profile, name, classId) {
      const nonSentient = this.isNonSentient(profile, name, classId);
      const allowed = (spec) => !!spec && (!nonSentient || spec.sentient === false);
      return allowed;
    },

    // Weapon proficiencies train through combat on their own slow table; they
    // are the party's business, never a stranger's personal pick or focus.
    isWeapon(spec) {
      return !!(spec && spec.wtypeId);
    },

    // The head start a person's class and traits give them (Specialization
    // .json classStart / traitStart), filtered for beasts. Only levels above
    // Untrained are returned. The one reading of those tables for NPCs: the
    // seed and the Empathize panel both ask here.
    floorLevels(profile, classId, name) {
      const out = new Map();
      const S = this.table();
      if (!S) return out;
      const allowed = this.allowedFor(profile, name, classId);
      const className = (classId != null && $dataClasses?.[classId]) ? $dataClasses[classId].name : null;
      const traitBook = window._NPCSocietyDataLoader?.traits || [];
      const traitSlugs = [];
      (profile?.traitIds || []).forEach((id) => {
        const trait = traitBook.find((t) => t.id === id);
        const slug = trait?.name ? trait.name.split('.')[1] : null;
        if (slug) traitSlugs.push(slug);
      });
      S.list.forEach((spec) => {
        if (!allowed(spec)) return;
        let lvl = 0;
        if (className && spec.classStart?.[className]) lvl = Math.max(lvl, spec.classStart[className]);
        traitSlugs.forEach((slug) => {
          if (spec.traitStart?.[slug]) lvl = Math.max(lvl, spec.traitStart[slug]);
        });
        if (lvl > 1) out.set(spec.id, Math.min(5, lvl));
      });
      return out;
    },

    // The class's own fields: the specializations its classStart names, best
    // first. The first SPEC_CLASS_FOCUS_MAX of them are what a person of that
    // class keeps practising.
    classSpecs(profile, classId, name) {
      const S = this.table();
      const className = (classId != null && $dataClasses?.[classId]) ? $dataClasses[classId].name : null;
      if (!S || !className) return [];
      const allowed = this.allowedFor(profile, name, classId);
      return S.list
        .filter((spec) => allowed(spec) && !this.isWeapon(spec) && (spec.classStart?.[className] || 0) > 1)
        .sort((a, b) => (b.classStart[className] - a.classStart[className]) || (a.id - b.id));
    },

    // The specialization the person's current job trains (Jobs.json `spec`,
    // an English name), or null for no job, a beast, or a weapon trade.
    jobSpecId(profile, name) {
      const S = this.table();
      if (!S || this.isNonSentient(profile, name)) return null;
      const job = JobManager.getJob(profile);
      const spec = job?.spec ? S.byName.get(job.spec) : null;
      if (!spec || this.isWeapon(spec) || !this.allowedFor(profile, name)(spec)) return null;
      return spec.id;
    },

    _rng(name, salt) {
      const ws = window.NPCShared ? window.NPCShared.worldSeed() : DEFAULT_SEED;
      return new MiniRng(nameHash(`${name || 'npc'}_${salt}`) ^ ws);
    },

    // The person's specializations, dealt once. In order: class and trait
    // floors, the job's own trade at Beginner or better, 2-4 personal picks
    // (60% of them from the class's categories) at Beginner, and whatever
    // another system pinned (_specOverrides, Eris's lawyers) as a floor.
    // A fresh seed starts honing from level 1: the first sync then replays
    // the person's whole life onto it, which is the pre-aging.
    seed(profile, name) {
      const S = this.table();
      if (!S) return false;
      const classId = profile.assignedClassId;
      const allowed = this.allowedFor(profile, name, classId);
      const levels = {};
      const raise = (id, lvl) => {
        const n = Math.min(5, Number(lvl) || 0);
        if (n > 1) levels[id] = Math.max(levels[id] || 0, n);
      };

      this.floorLevels(profile, classId, name).forEach((lvl, id) => raise(id, lvl));
      const jobSpec = this.jobSpecId(profile, name);
      const personal = [];
      const honed = 1;

      {
        const rng = this._rng(name, 'specs');
        const classCats = new Set(this.classSpecs(profile, classId, name).map((s) => s.category));
        let poolAll = S.list.filter((s) => allowed(s) && !this.isWeapon(s) && !levels[s.id] && s.id !== jobSpec);
        let poolClass = poolAll.filter((s) => classCats.has(s.category));
        const count = rng.int(SPEC_PERSONAL_MIN, SPEC_PERSONAL_MAX);
        for (let i = 0; i < count && poolAll.length; i++) {
          const pool = (poolClass.length && rng.next() < SPEC_PERSONAL_CLASS_P) ? poolClass : poolAll;
          const spec = pool[Math.floor(rng.next() * pool.length)];
          poolAll = poolAll.filter((s) => s !== spec);
          poolClass = poolClass.filter((s) => s !== spec);
          raise(spec.id, 2);
          personal.push(spec.id);
        }
      }
      if (jobSpec != null) raise(jobSpec, 2);

      const overrides = profile._specOverrides;
      if (overrides) {
        for (const [id, lvl] of Object.entries(overrides)) raise(Number(id), lvl);
      }

      const focus = [];
      if (jobSpec != null) focus.push(jobSpec);
      for (const spec of this.classSpecs(profile, classId, name).slice(0, SPEC_CLASS_FOCUS_MAX)) {
        if (!focus.includes(spec.id)) focus.push(spec.id);
      }
      for (const id of personal) {
        if (focus.length >= SPEC_FOCUS_MAX) break;
        if (!focus.includes(id)) focus.push(id);
      }

      profile.specLevels = levels;
      profile.specXp = {};
      profile.specFocus = focus;
      profile._specJobSpec = jobSpec;
      profile._specJobId = profile.currentJobId;
      profile._specClassId = classId;
      profile._specHonedLevel = honed;
      profile._specV = SPEC_V;
      return true;
    },

    // The focus as weighted draws: the job 0.4, the class's own fields 0.3,
    // the personal ones 0.3, each share split evenly inside its group. An
    // empty group's share goes to the others in proportion.
    focusWeights(profile, name) {
      const focus = Array.isArray(profile.specFocus) ? profile.specFocus : [];
      if (!focus.length) return [];
      const classSet = new Set(this.classSpecs(profile, profile.assignedClassId, name).map((s) => s.id));
      const groups = { job: [], class: [], personal: [] };
      for (const id of focus) {
        if (id === profile._specJobSpec) groups.job.push(id);
        else if (classSet.has(id)) groups.class.push(id);
        else groups.personal.push(id);
      }
      let total = 0;
      for (const key of Object.keys(groups)) if (groups[key].length) total += SPEC_FOCUS_WEIGHT[key];
      const out = [];
      for (const key of Object.keys(groups)) {
        const ids = groups[key];
        if (!ids.length) continue;
        const each = SPEC_FOCUS_WEIGHT[key] / total / ids.length;
        for (const id of ids) out.push({ id, w: each });
      }
      return out;
    },

    tierCost(level) {
      const S = window.Specializations;
      const table = S?.EXP_TO_NEXT;
      const base = table ? (table[level] || 0) : (S?.expToNext ? S.expToNext(level) : 0);
      return base * SPEC_TIER_COST_MULT;
    },

    // Every level between the last one honed and the person's level now is
    // worth SPEC_POINTS_PER_LEVEL points, each dropped on a focus spec by a
    // roll seeded on (name, level, point). The rolls do not depend on how
    // the levels arrive, so honing 1 to 60 in one call and in sixty calls
    // gives the same person, and a second call with nothing new is a no-op.
    sync(profile, name, opts) {
      if (!this.table() || profile._specV !== SPEC_V) return 0;
      const target = Math.max(1, profile.level ?? 1);
      let honed = Math.max(1, profile._specHonedLevel || 1);
      if (honed >= target) return 0;
      const silent = !!(opts && opts.silent);
      const weights = this.focusWeights(profile, name);
      const levels = profile.specLevels || (profile.specLevels = {});
      const xp = profile.specXp || (profile.specXp = {});
      let tiers = 0;
      if (weights.length) {
        for (let lvl = honed + 1; lvl <= target; lvl++) {
          for (let k = 0; k < SPEC_POINTS_PER_LEVEL; k++) {
            const roll = this._rng(name, `hone_${lvl}_${k}`).next(); // i18n-ignore: rng salt
            let acc = 0;
            let pick = weights[weights.length - 1].id;
            for (const entry of weights) {
              acc += entry.w;
              if (roll < acc) { pick = entry.id; break; }
            }
            let tier = levels[pick] || 1;
            if (tier >= 5) continue;
            xp[pick] = (xp[pick] || 0) + 1;
            let cost = this.tierCost(tier);
            while (tier < 5 && cost > 0 && xp[pick] >= cost) {
              xp[pick] -= cost;
              tier++;
              tiers++;
              levels[pick] = tier;
              if (!silent) {
                StoryLogger.record(name, "spec", 'NPCSim.log.specHoned', { specId: pick, tier });
              }
              cost = this.tierCost(tier);
            }
            if (tier >= 5) delete xp[pick];
          }
        }
      }
      profile._specHonedLevel = target;
      return tiers;
    },

    // A new job: its trade takes the place of the oldest personal focus, and
    // the old job's trade is kept as a personal one (the newest). No job, or
    // a job with no trade of its own, changes nothing but the stamp.
    onJobChange(profile, name) {
      const newSpec = this.jobSpecId(profile, name);
      profile._specJobId = profile.currentJobId;
      if (newSpec == null || newSpec === profile._specJobSpec) return;
      const old = profile._specJobSpec;
      const classSet = new Set(this.classSpecs(profile, profile.assignedClassId, name).map((s) => s.id));
      let focus = (profile.specFocus || []).filter((id) => id !== newSpec && id !== old);
      const oldest = focus.findIndex((id) => !classSet.has(id));
      if (oldest >= 0) focus.splice(oldest, 1);
      if (old != null) focus.push(old);
      focus.unshift(newSpec);
      while (focus.length > SPEC_FOCUS_MAX) {
        const drop = focus.findIndex((id, i) => i > 0 && !classSet.has(id));
        focus.splice(drop > 0 ? drop : focus.length - 1, 1);
      }
      profile.specFocus = focus;
      profile._specJobSpec = newSpec;
      const levels = profile.specLevels || (profile.specLevels = {});
      levels[newSpec] = Math.max(levels[newSpec] || 0, 2);
    },

    // A new class brings its own head start.
    onClassChange(profile, name) {
      const levels = profile.specLevels || (profile.specLevels = {});
      this.floorLevels(profile, profile.assignedClassId, name).forEach((lvl, id) => {
        levels[id] = Math.max(levels[id] || 0, lvl);
      });
      profile._specClassId = profile.assignedClassId;
    },

    // Practice outside the level curve: a round at a minigame (SECTION 9d)
    // drops `points` on the named specialization, the same xp and tier costs
    // honing uses. Answers the tiers gained. A beast, a weapon proficiency or
    // an unknown name gains nothing.
    practice(profile, name, specName, points) {
      const S = this.table();
      if (!S || !profile || !(points > 0)) return 0;
      const spec = S.byName?.get?.(specName);
      if (!spec || this.isWeapon(spec) || !this.allowedFor(profile, name)(spec)) return 0;
      const levels = profile.specLevels || (profile.specLevels = {});
      const xp = profile.specXp || (profile.specXp = {});
      let tier = levels[spec.id] || 1;
      if (tier >= 5) return 0;
      xp[spec.id] = (xp[spec.id] || 0) + points;
      let tiers = 0;
      let cost = this.tierCost(tier);
      while (tier < 5 && cost > 0 && xp[spec.id] >= cost) {
        xp[spec.id] -= cost;
        tier++;
        tiers++;
        levels[spec.id] = tier;
        StoryLogger.record(name, "spec", 'NPCSim.log.specHoned', { specId: spec.id, tier });
        cost = this.tierCost(tier);
      }
      if (tier >= 5) delete xp[spec.id];
      return tiers;
    },

    // Seeds and hones as needed. Answers false while the
    // specialization table is still loading (nothing is stamped, so the
    // next call tries again).
    ensure(profile, name) {
      if (!profile || !this.table()) return false;
      if (profile._specV !== SPEC_V || !profile.specLevels) {
        // The job's trade is part of the seed, so a job still undecided is
        // settled first (the tick would do it on this person's next turn).
        if (profile.currentJobId === null && !_specJobLookup) {
          _specJobLookup = true;
          try { JobManager.assignJob(profile); } catch (e) { /* no roster yet: seeded without a trade */ }
          finally { _specJobLookup = false; }
        }
        this.seed(profile, name);
        this.sync(profile, name, { silent: true });
        return true;
      }
      if (profile._specClassId !== profile.assignedClassId) this.onClassChange(profile, name);
      if (profile._specJobId !== profile.currentJobId) this.onJobChange(profile, name);
      const gap = (profile.level ?? 1) - (profile._specHonedLevel || 1);
      if (gap > 0) this.sync(profile, name, { silent: gap > SPEC_LOG_MAX_GAP });
      return true;
    },

    // What the person is trained in right now, id -> level (2-5): the stored
    // levels, lifted to whatever the class and traits grant today and to any
    // pinned override, and read through the beast filter.
    levelsFor(profile, classId, name) {
      const S = this.table();
      const out = new Map();
      if (!S || !profile) return out;
      const allowed = this.allowedFor(profile, name, classId);
      this.floorLevels(profile, classId, name).forEach((lvl, id) => out.set(id, lvl));
      for (const [rawId, lvl] of Object.entries(profile.specLevels || {})) {
        const id = Number(rawId);
        if (Number(lvl) > 1 && allowed(S.byId.get(id))) out.set(id, Math.max(out.get(id) || 0, Number(lvl)));
      }
      const overrides = profile._specOverrides;
      if (overrides) {
        for (const [rawId, lvl] of Object.entries(overrides)) {
          const n = Number(lvl);
          if (n > 1) out.set(Number(rawId), Math.max(out.get(Number(rawId)) || 0, n));
        }
      }
      return out;
    },
  };

  const Dev = {
    SPEC_V,
    // Called from ensureSimFields for every profile the sim touches.
    ensure(profile, name) {
      if (!profile) return;
      // A child (SECTION 11b4) grows into a trade and its specializations at
      // eighteen; until then there is nothing to hone.
      const minor = Children.isMinor(profile, name);
      if (!minor && (profile._specV !== SPEC_V ||
          (profile._specHonedLevel || 1) < (profile.level ?? 1) ||
          profile._specJobId !== profile.currentJobId ||
          profile._specClassId !== profile.assignedClassId)) {
        Specs.ensure(profile, name);
      }
      // _vehV: the bike or broom a person owns (SECTION 11b6), rolled again
      // when a child comes of age. Beasts own none.
      if (profile._vehV !== Vehicles.VEH_V || !!profile._vehChild !== !!minor) Vehicles.ensure(profile, name, minor);
      // _civicV: the creed drawn toward party and government. The draw itself
      // is NPCPolitics' (ensureIdentity), made the first time the identity is
      // written; here a profile that will never be drawn is stamped so it is
      // passed over, and a made character's creed is pinned.
      const civicV = window.NPCShared?.CIVIC_V;
      if (civicV != null && profile._civicV !== civicV) Dev.ensureCivic(profile, name, civicV);
      // _famV: the romance identity (orientation and relationship style,
      // window.NPCRomance) written onto the profile once, and a child's
      // profile brought into line with their life record (SECTION 11b4).
      if (profile._famV !== FAM_V) Dev.ensureFamily(profile, name);
      // _gearV: the kit worn and the food carried (SECTION 11b5), dealt again
      // when a child comes of age; an artifact for the wealthy once the
      // chronicle is there to hand one over.
      if (profile._gearV !== Gear.GEAR_V || !!profile._gearChild !== !!minor) Gear.ensure(profile, name, minor);
      if (!profile._artRolled) Gear.rollArtifact(profile, name, minor);
      // _uniqRolled: a piece customised at somebody's bench (Gear.rollUnique).
      if (!profile._uniqRolled) Gear.rollUnique(profile, name, minor);
      // _implV: the augments a tech-savvy person starts out with (SECTION
      // 11b7), rolled when a child comes of age. Beasts carry none.
      if (profile._implV !== Implants.IMPL_V || !!profile._implChild !== !!minor) Implants.ensure(profile, name, minor);
      // _stocksV: the company shares a person holds (SECTION 11a2), rolled
      // once a market is there to price them, and when a child comes of age.
      // Children and beasts hold none.
      if (profile._stocksV !== Stocks.STOCKS_V || !!profile._stocksChild !== !!minor) Stocks.ensure(profile, name, minor);
    },

    ensureFamily(profile, name) {
      if (!Specs.isNonSentient(profile, name)) {
        // Not stamped until the romance identity is there to write.
        if (!window.NPCRomance?.store) return;
        window.NPCRomance.store(profile, name);
        const Life = window.NPCLifeSim;
        if (name && Life?.isMinor?.(name) && !profile._child) Life.applyChildProfile?.(name, profile, {});
      }
      profile._famV = FAM_V;
    },

    // The car, bike or broom this person gets about on today (SECTION 11b6),
    // or null; ridesOf lists every kind they could take on a journey.
    vehicleOf(profile, name) { return Vehicles.vehicleOf(profile, name); },
    ridesOf(profile, name) { return Vehicles.ridesOf(profile, name); },

    ensureCivic(profile, name, civicV) {
      if (profile.playerCreated) profile._ideologyPinned = true;
      // A beast holds no creed, so it is never drawn.
      if (Specs.isNonSentient(profile, name)) profile._civicV = civicV;
    },
  };

  Object.assign(NPCSim._internal, {
    Dev, ExpManager, Specs,
  });
})();
