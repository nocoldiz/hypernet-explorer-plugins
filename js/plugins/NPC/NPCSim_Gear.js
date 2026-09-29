/*:
 * @target MZ
 * @plugindesc NPC Simulation: gear, artifacts and food in hand
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Children
 * @help
 * ============================================================================
 * NPCSim_Gear, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Gear (SECTION 11b5).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Children.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    _foodNote, Children, economyRng, MiniRng, nameHash, NeedManager, Specs, StoryLogger,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Addictions;
  NPCSim._internal._late.push(() => ({ Addictions } = NPCSim._internal));

  // ============================================================================
  // SECTION 11b5, GEAR, ARTIFACTS AND FOOD IN HAND (NPCSim.Gear)
  // ============================================================================
  // What a person has on them, dealt once per profile (the `_gearV` stamp):
  //   equipment  profile.equipment, one piece per slot by trade, class, wealth
  //              and rarity (NPCSociety SECTION 3b2, window.NPCSocietyGear).
  //              A recruit's stored snapshot is kept as it is.
  //   food       1-3 food items in profile.itemIds, all of them things the
  //              person's diet allows (NPCShared.Diet). Eaten from hand when
  //              hunger drops below 30 away from a food place; restocked when
  //              shopping.
  //   artifacts  profile.artifacts [{kind, id}]: a world artifact the
  //              chronicle (HistoryManager custody) hands to the wealthiest,
  //              faction elites and collectors. Rolled once, when the
  //              chronicle's records exist.
  // Children carry clothes and food only; beasts carry nothing (NPCCreature).
  const GEAR_V = 1;
  // i18n-ignore-start: trait name keys, custody action ids, need and state ids
  const COLLECTOR_TRAITS = new Set(["traits.hoarder.name", "traits.wealthy.name", "traits.noble.name"]);
  const CUSTODY_BOUGHT = "purchased";
  const CUSTODY_INHERITED = "inherited";
  const HUNGER_REASON = "hunger";
  const FOOD_PLACE_STATES = new Set(["interacting", "goingToInteract"]);
  // i18n-ignore-end
  // Chance of an artifact by wealth tier: [at level 1, at level 80+].
  const ARTIFACT_ODDS = { 3: [0.01, 0.03], 4: [0.05, 0.08] };
  const ARTIFACT_ELITE_BONUS = 0.03;
  const ARTIFACT_COLLECTOR_BONUS = 0.02;
  const HAND_FOOD_MIN = 1;
  const HAND_FOOD_MAX = 3;
  const HAND_EAT_BELOW = 30;
  // The dearest single food each wealth tier carries about.
  const HAND_FOOD_PRICE = [300, 800, 2000, 6000, 50000];

  let _handFoodCache = null;
  const Gear = {
    GEAR_V,
    HAND_EAT_BELOW,

    ensure(profile, name, minor) {
      if (!profile) return;
      const child = minor ?? Children.isMinor(profile, name);
      if (Specs.isNonSentient(profile, name)) {
        profile._gearChild = false;
        profile._gearV = GEAR_V;
        return;
      }
      // A traveller's kit and pack are the actor's own (the equip and item
      // menus); nothing is dealt onto the profile behind them.
      const members = $gameParty?.members?.() || [];
      if (name && members.some(a => a && typeof a.name === "function" && a.name() === name)) {
        profile._gearChild = !!child;
        profile._gearV = GEAR_V;
        return;
      }
      const G = window.NPCSocietyGear;
      if (!G) return; // not stamped: the dealer is not loaded yet
      // A child who has come of age is dressed for a trade; a recruit's
      // snapshot is theirs and stays.
      if (profile._gearChild && !child && profile.equipment && !Array.isArray(profile.equipment)) {
        delete profile.equipment;
      }
      G.ensure(name, profile, profile.assignedClassId, profile.wealthTierBase);
      this.stockHand(profile, name, true);
      profile._gearChild = !!child;
      profile._gearV = GEAR_V;
    },

    // Every food a person might carry, before their diet and purse are asked.
    _foods() {
      const key = typeof $dataItems !== "undefined" && $dataItems ? $dataItems.length : 0;
      if (_handFoodCache && _handFoodCache.key === key) return _handFoodCache.list;
      const Diet = window.NPCShared?.Diet;
      const ok = window.NPCSocietyGear?.isSelectable;
      const list = (key ? $dataItems : []).filter(it => it && Diet?.isFood(it) &&
        (ok ? ok(it) : (it.price || 0) > 0)).sort((a, b) => (a.price || 0) - (b.price || 0) || a.id - b.id);
      _handFoodCache = { key, list };
      return list;
    },

    // The foods this person would carry: their diet, their wealth.
    foodPool(profile) {
      const Diet = window.NPCShared?.Diet;
      const tier = Math.max(0, Math.min(4, Number(profile?.wealthTierBase) | 0));
      const cap = HAND_FOOD_PRICE[tier];
      // Nothing habit-forming in a child's hand (SECTION 11b5b).
      return this._foods().filter(it => (it.price || 0) <= cap && (!Diet || Diet.allows(profile, it)) &&
        Addictions.allows(profile, it));
    },

    handFood(profile) {
      const Diet = window.NPCShared?.Diet;
      return (profile?.itemIds || []).filter(id => {
        const it = typeof $dataItems !== "undefined" ? $dataItems?.[id] : null;
        return it && Diet?.isFood(it) && Diet.allows(profile, it);
      });
    },

    // Drops what the person will not eat and, when dealing, tops the hand up
    // to 1-3 foods they will.
    stockHand(profile, name, deal) {
      const Diet = window.NPCShared?.Diet;
      if (!profile || !Diet) return;
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      if (Diet.forbiddenFor(profile).size) {
        profile.itemIds = profile.itemIds.filter(id => {
          const it = typeof $dataItems !== "undefined" ? $dataItems?.[id] : null;
          return !it || Diet.allows(profile, it);
        });
      }
      if (deal) {
        const ws = window.NPCShared.worldSeed();
        const rng = new MiniRng(nameHash(`${name || "npc"}_food`) ^ ws);
        const target = rng.int(HAND_FOOD_MIN, HAND_FOOD_MAX);
        const pool = this.foodPool(profile);
        let have = this.handFood(profile).length;
        while (have < target && pool.length) {
          profile.itemIds.push(pool[Math.floor(rng.next() * pool.length)].id);
          have++;
        }
      }
      window.NPCShared.capItemIds(profile);
    },

    // Is this person at (or on the way to) somewhere that feeds them?
    atFoodPlace(name) {
      const ctrls = $gameSystem?.getActiveNPCControllers?.() || [];
      const ctrl = ctrls.find(c => c && c.eventName === name);
      return !!ctrl && ctrl.interactReason === HUNGER_REASON && FOOD_PLACE_STATES.has(ctrl.state);
    },

    // Eats one carried food when hungry and nowhere near a meal.
    eatFromHand(profile, name) {
      if (!profile || (profile.hunger ?? 100) >= HAND_EAT_BELOW) return null;
      if (this.atFoodPlace(name)) return null;
      const id = this.handFood(profile)[0];
      if (id == null) return null;
      const item = $dataItems[id];
      const i = profile.itemIds.indexOf(id);
      if (i >= 0) profile.itemIds.splice(i, 1);
      NeedManager.feed(profile, Number(item.meta?.calories) || _foodNote(item, "calories", "20"));
      StoryLogger.record(name, "eating", "NPCSim.log.ateFromHand", { item: item.name });
      return item;
    },

    // A shopper whose hand is running empty buys one more food they will eat.
    restock(profile, name, minute) {
      if (!profile || this.handFood(profile).length >= HAND_FOOD_MIN + 1) return null;
      const money = profile.money ?? 0;
      const pool = this.foodPool(profile).filter(it => (it.price || 0) <= money * 0.5);
      if (!pool.length) return null;
      const rng = economyRng(name, "restock", minute);
      const item = pool[Math.floor(rng.next() * pool.length)];
      profile.money = Math.max(0, money - item.price);
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      profile.itemIds.push(item.id);
      window.NPCShared.capItemIds(profile);
      return item;
    },

    // A shop's weapon or armour is worth buying only as an upgrade of the
    // piece already worn in that slot; a child buys none of it.
    wouldUpgrade(profile, kind, data) {
      if (!profile || !data) return false;
      if (window.NPCSocietyGear?.isChild?.(profile) || Children.isMinor(profile)) return false;
      if (Specs.isNonSentient(profile)) return false;
      const eq = window.NPCSocietyGear?.normalize?.(profile.equipment) || { weaponId: null, armorIds: [] };
      if (kind === "weapon") { // i18n-ignore: item kind
        const cur = eq.weaponId ? $dataWeapons?.[eq.weaponId] : null;
        return !cur || (data.price || 0) > (cur.price || 0);
      }
      if (kind === "armor") { // i18n-ignore: item kind
        const curId = eq.armorIds.find(id => $dataArmors?.[id]?.etypeId === data.etypeId);
        const cur = curId ? $dataArmors[curId] : null;
        return !cur || (data.price || 0) > (cur.price || 0);
      }
      return false;
    },

    // Puts a bought or stolen weapon or armour on, replacing the piece in
    // that slot. A recruit's snapshot becomes a plain kit from then on.
    wear(profile, kind, data) {
      const G = window.NPCSocietyGear;
      if (!profile || !data || !G) return false;
      const eq = G.normalize(profile.equipment) || { weaponId: null, armorIds: [] };
      if (kind === "weapon") eq.weaponId = data.id; // i18n-ignore: item kind
      else if (kind === "armor") {                  // i18n-ignore: item kind
        eq.armorIds = eq.armorIds.filter(id => $dataArmors?.[id]?.etypeId !== data.etypeId);
        eq.armorIds.push(data.id);
      } else return false;
      profile.equipment = { weaponId: eq.weaponId, armorIds: eq.armorIds };
      return true;
    },

    // The chronicle's artifacts no living person holds yet: their last
    // custodian is still a power of the simulated history (a ruler, a
    // faction), not the party and not somebody already dealt one.
    freeArtifacts() {
      const HM = window.HistoryManager;
      let records = null;
      try { records = HM?.getArtifactRecords?.() || HM?._artifactRecords || null; } catch (_) { records = null; }
      if (!records) return [];
      return Object.keys(records).sort().map(k => records[k]).filter(rec => {
        if (!rec || !rec.kind || rec.id == null) return false;
        if (HM.artifactHeldByParty?.(rec)) return false;
        const holders = rec.holders || [];
        const last = holders[holders.length - 1];
        return !last || last.power != null;
      });
    },

    isCollector(profile) {
      const book = window.Health?.Traits || window._NPCSocietyDataLoader?.traits || [];
      return (profile?.traitIds || []).some(id => {
        const t = Array.isArray(book) ? book.find(tr => tr && tr.id === Number(id)) : null;
        return !!t && COLLECTOR_TRAITS.has(t.name);
      });
    },

    // The artifact odds for this person, 0 when they are not in the running.
    artifactChance(profile) {
      const tier = Math.max(0, Math.min(4, Number(profile?.wealthTierBase) | 0));
      const odds = ARTIFACT_ODDS[tier];
      const collector = this.isCollector(profile) && tier >= 2;
      if (!odds && !collector) return 0;
      const lvl = Math.max(0, Math.min(1, ((profile?.level || 1) - 1) / 79));
      let chance = odds ? odds[0] + (odds[1] - odds[0]) * lvl : 0;
      if (odds && (profile?.factionIndex ?? -1) >= 0) chance += ARTIFACT_ELITE_BONUS;
      if (collector) chance += ARTIFACT_COLLECTOR_BONUS;
      return chance;
    },

    rollArtifact(profile, name, minor) {
      if (!profile || profile._artRolled) return null;
      const child = minor ?? Children.isMinor(profile, name);
      if (child || Specs.isNonSentient(profile, name) || !name) {
        // A child may still be dealt one once grown: not stamped.
        if (!child) profile._artRolled = true;
        return null;
      }
      const chance = this.artifactChance(profile);
      if (chance <= 0) { profile._artRolled = true; return null; }
      const HM = window.HistoryManager;
      if (!HM?.recordArtifactCustody) return null;
      const free = this.freeArtifacts();
      let any = null;
      try { any = HM.getArtifactRecords?.() || HM._artifactRecords; } catch (_) { any = null; }
      // No chronicle written yet: asked again later, not stamped.
      if (!any || !Object.keys(any).length) return null;
      profile._artRolled = true;
      const rng = new MiniRng(nameHash(`${name}_artifact`) ^ window.NPCShared.worldSeed());
      if (rng.next() >= chance || !free.length) return null;
      const rec = free[Math.floor(rng.next() * free.length)];
      HM.recordArtifactCustody(rec.kind, rec.id, name, this.isCollector(profile) ? CUSTODY_BOUGHT : CUSTODY_INHERITED);
      profile.artifacts = Array.isArray(profile.artifacts) ? profile.artifacts : [];
      profile.artifacts.push({ kind: rec.kind, id: Number(rec.id) });
      return rec;
    },

    // ── Custom pieces (window.NPCUniqueGear, Quest/ThinkerMenu.js) ─────────
    // One seeded roll per profile (the `_uniqRolled` stamp) decides whether
    // one piece of the kit they wear was customised at somebody's bench. The
    // odds climb with wealth, and a smith's or a soldier's trade, the craft or
    // combat specializations behind it and a collector's habits add to them.
    // The piece takes the slot it customises; the record is ThinkerMenu's.
    UNIQUE_ODDS: [0.004, 0.01, 0.025, 0.05, 0.1],
    UNIQUE_CRAFT_JOB: 0.12,
    UNIQUE_COMBAT_JOB: 0.06,
    UNIQUE_COLLECTOR: 0.08,
    UNIQUE_PER_CRAFT_LEVEL: 0.015,
    UNIQUE_PER_COMBAT_LEVEL: 0.01,
    UNIQUE_CAP: 0.45,
    // i18n-ignore-start: Specialization.json category ids and WorkSystem job category ids
    UNIQUE_CRAFT_CATEGORY: "Crafting",
    UNIQUE_COMBAT_CATEGORIES: ["Combat", "Weapons"],
    UNIQUE_COMBAT_JOB_CATEGORY: "Combat",
    // i18n-ignore-end
    CRAFTSMAN_LEVEL: 3,

    _jobOf(profile) {
      const id = profile?.currentJobId;
      if (!id) return null;
      return (window.WorkSystem?.Jobs || []).find(j => j && j.id === id) || null;
    },

    _specCategory(key) {
      const S = Specs.table();
      if (!S || key == null) return null;
      const spec = S.byId?.get?.(Number(key)) || S.byId?.get?.(key) || S.byName?.get?.(key);
      return spec ? spec.category : null;
    },

    isCraftJob(job) {
      return !!job && this._specCategory(job.spec) === this.UNIQUE_CRAFT_CATEGORY;
    },

    // The highest craft and combat specialization levels this person holds.
    specPeaks(profile) {
      let craft = 1, combat = 1;
      for (const [id, lvl] of Object.entries(profile?.specLevels || {})) {
        const cat = this._specCategory(id);
        const n = Number(lvl) || 1;
        if (cat === this.UNIQUE_CRAFT_CATEGORY) craft = Math.max(craft, n);
        else if (this.UNIQUE_COMBAT_CATEGORIES.includes(cat)) combat = Math.max(combat, n);
      }
      return { craft, combat };
    },

    // Somebody who customises gear with their own hands.
    isCraftsman(profile) {
      if (!profile) return false;
      return this.isCraftJob(this._jobOf(profile)) || this.specPeaks(profile).craft >= this.CRAFTSMAN_LEVEL;
    },

    uniqueChance(profile, name) {
      if (!profile) return 0;
      if (Specs.isNonSentient(profile, name) || window.NPCSocietyGear?.isChild?.(profile)) return 0;
      const tier = Math.max(0, Math.min(4, Number(profile.wealthTierBase) | 0));
      let chance = this.UNIQUE_ODDS[tier];
      const job = this._jobOf(profile);
      if (this.isCraftJob(job)) chance += this.UNIQUE_CRAFT_JOB;
      if (job && job.category === this.UNIQUE_COMBAT_JOB_CATEGORY) chance += this.UNIQUE_COMBAT_JOB;
      if (this.isCollector(profile)) chance += this.UNIQUE_COLLECTOR;
      const peaks = this.specPeaks(profile);
      chance += this.UNIQUE_PER_CRAFT_LEVEL * (peaks.craft - 1) + this.UNIQUE_PER_COMBAT_LEVEL * (peaks.combat - 1);
      return Math.min(this.UNIQUE_CAP, chance);
    },

    // Which slot of their kit it is: the weapon first for a smith or a
    // fighter, the coat on their back next, anything else after.
    uniqueSlot(profile, rng) {
      const kit = window.NPCSocietyGear?.normalize?.(profile?.equipment);
      if (!kit) return null;
      const plain = (d) => !!d && !(d.meta && (d.meta.Forged || d.meta.NpcUnique));
      const job = this._jobOf(profile);
      const handy = this.isCraftJob(job) || job?.category === this.UNIQUE_COMBAT_JOB_CATEGORY;
      const options = [];
      if (kit.weaponId && plain($dataWeapons?.[kit.weaponId])) options.push({ kind: "w", baseId: kit.weaponId, w: handy ? 3 : 2 });
      for (const id of kit.armorIds) {
        const d = $dataArmors?.[id];
        if (plain(d)) options.push({ kind: "a", baseId: id, w: d.etypeId === 4 ? 1.5 : 1 });
      }
      if (!options.length) return null;
      let r = rng.next() * options.reduce((s, o) => s + o.w, 0);
      for (const o of options) {
        if ((r -= o.w) < 0) return o;
      }
      return options[options.length - 1];
    },

    // Who made it: their own hands if they have the trade, else one of the
    // world's craftsmen, else themselves after all.
    _craftsmen: null,
    uniqueMaker(profile, name, rng) {
      if (this.isCraftsman(profile)) return name;
      const soc = $gameSystem?._npcSociety || {};
      const size = Object.keys(soc).length;
      if (!this._craftsmen || this._craftsmen.size !== size) {
        const names = Object.keys(soc).filter(n => {
          const p = soc[n];
          return p && !p._killed && !Specs.isNonSentient(p, n) && this.isCraftsman(p);
        }).sort();
        this._craftsmen = { size, names };
      }
      const pool = this._craftsmen.names.filter(n => n !== name);
      return pool.length ? pool[Math.floor(rng.next() * pool.length)] : name;
    },

    rollUnique(profile, name, minor) {
      if (!profile || profile._uniqRolled) return null;
      const child = minor ?? Children.isMinor(profile, name);
      // A child may still be handed one once grown: not stamped.
      if (child) return null;
      const members = $gameParty?.members?.() || [];
      if (!name || Specs.isNonSentient(profile, name) ||
          members.some(a => a && typeof a.name === "function" && a.name() === name)) {
        profile._uniqRolled = true;
        return null;
      }
      const U = window.NPCUniqueGear;
      // No record keeper yet, or no kit dealt yet: asked again later.
      if (!U || !window.NPCSocietyGear?.normalize?.(profile.equipment)) return null;
      profile._uniqRolled = true;
      const rng = new MiniRng(nameHash(`${name}_unique`) ^ window.NPCShared.worldSeed());
      if (rng.next() >= this.uniqueChance(profile, name)) return null;
      const slot = this.uniqueSlot(profile, rng);
      if (!slot) return null;
      return U.bestow(profile, name, slot.kind, slot.baseId, { maker: this.uniqueMaker(profile, name, rng) });
    },
  };

  Object.assign(NPCSim._internal, {
    Gear,
  });
})();
