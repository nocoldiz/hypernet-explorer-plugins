/*:
 * @target MZ
 * @plugindesc NPC Simulation: plots, pens and hives looked after by the town
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Behavior
 * @help
 * ============================================================================
 * NPCSim_Tending, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Tending (SECTION 7): plants, animals, hives and fermenting barrels
 * tended by the people whose trade or pastime it is.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Behavior.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    EventBus, InteractionScanner, RoutineManager,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Addictions, Children, JobManager, Specs, StoryLogger, ThoughtGenerator;
  NPCSim._internal._late.push(() => ({
    Addictions, Children, JobManager, Specs, StoryLogger, ThoughtGenerator,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 7, TENDING PLANTS, ANIMALS, HIVES AND BARRELS
  // ============================================================================
  // The plots of PlantGrowthSystem, the stock of AnimalGrowthSystem, the hives
  // of ApiarySystem and the barrels of BrewingSystem are real work for the
  // town's people, done through each system's own calls so a plot's stage and
  // water, an animal's nutrition and produce timers, a hive's stores and
  // threats and a barrel's brew really change:
  //   - work: a farm trade on shift on its work map (npc:work_tick at a plot,
  //     a pen or a hive, and whatever they walk up to while on it); a brewer or
  //     a bartender on shift at the barrels
  //   - home: a resident in the garden of the map they live on; for animals and
  //     hives, the owner; for a barrel, its owner or the household it stands in
  //   - leisure: a farming or animal-loving trait, or a Gardening, Farming,
  //     Animal Husbandry, Beekeeping, Brewing or Distilling specialization at
  //     tier 2 or more
  // A ripe crop goes to its owner (the plot's named owner, the farmer of a
  // procedural square) or to whoever picked it; produce, honey and a bottled
  // brew the same. Feed comes out of the tender's own bag, the owner's, or the
  // farm's fodder for a worker on shift and an owner at home. Honey is only
  // taken and a barrel only bottled or restarted by its owner or somebody
  // working for them; anybody else with a reason to be there only minds it.
  // The party's plots, stock, hive and barrels are never harvested, bottled or
  // collected from: a friend of the party (opinion 40 or more) waters, feeds
  // and minds them, and says so in a thought. A child waters and feeds as
  // play, never harvests or collects anybody's, and keeps away from a barrel.
  // A hive or a barrel nobody has minded for UNATTENDED_MIN is seen to first,
  // and the one who finds it so says it.

  // i18n-ignore-start: Specialization.json / Jobs.json spec ids and event words
  const TENDING_TRADES = ["Farming", "Gardening", "Botany", "Herbalism", "Foraging",
    "Animal Husbandry", "Animal Training", "Beekeeping", "Kelp Farming"];
  const TENDING_SPOT_WORDS = ["plant", "field", "crop", "animal", "barn", "pen", "stable", "hive", "garden"];
  const BREW_TRADES = ["Brewing", "Distilling", "Bartending"];
  // Not "barrel": a smuggler, a pump hand and a dockworker handle barrels as
  // cargo (Jobs.json 13, 113, 158), which makes none of them a brewer.
  const BREW_SPOT_WORDS = ["keg", "cask", "brew", "ferment", "beer"];
  const BREW_SPECS = ["Brewing", "Distilling"];
  const BEEKEEPING = "Beekeeping";
  const ALCOHOL = "alcohol";
  const READY = "ready";
  const PRIMARY = "primary";
  const CONDITIONING = "conditioning";
  // i18n-ignore-end
  // Where each kind's hour goes in the routine (Empathize schedule labels).
  // i18n-ignore-start: routine activity ids
  const ROUTINE_LABEL = { plant: "tending", animal: "animalCare", hive: "beekeeping", barrel: "brewing" };
  // i18n-ignore-end

  const Tending = {
    THROTTLE_MIN: 30,      // game minutes between two tends by the same person
    FRIEND_OPINION: 40,    // standing with the party that makes a friend of it
    KEEN_TIER: 2,          // a specialization tier that makes it a pastime
    FEED_BELOW: 60,        // an animal is fed once its nutrition falls under this
    MAX_QTY: 6,            // at most this many of one crop go into a bag at once
    UNATTENDED_MIN: 720,   // a hive or barrel nobody minded for this long is unattended
    CARE_GAP_MIN: 120,     // a hive or barrel minded this recently wants nothing more
    HIVE_WATER_BELOW: 80,  // a hive's water worth walking over for
    HARVEST_HONEY_AT: 100, // stores a keeper takes a crop off
    SIP_EVERY_MIN: 720,    // an alcoholic helps themselves at most this often
    SIP_RELIEF: 50,        // and the drop answers this much of the craving
    _cache: null,

    kindOf(ev) {
      const n = (ev?.event?.()?.name || "").toLowerCase();
      if (n === "plant") return "plant";
      if (n === "animal") return "animal";
      if (n.includes("apiary") || n.includes("hive")) return "hive";
      if (window.BrewingSystem?.isBarrelEvent?.(ev)) return "barrel";
      return null;
    },

    // The plots, pens, hives and barrels of the map in hand, kept until the
    // map or its number of events changes (a placed animal is a spawned event).
    targets() {
      const empty = { plants: [], animals: [], hives: [], barrels: [] };
      if (!$gameMap) return empty;
      const mapId = $gameMap.mapId();
      const all = $gameMap.events();
      const c = this._cache;
      if (c && c.mapId === mapId && c.count === all.length) return c;
      const out = { mapId, count: all.length, plants: [], animals: [], hives: [], barrels: [] };
      for (const ev of all) {
        if (!ev || ev._erased) continue;
        const k = this.kindOf(ev);
        if (k === "plant") out.plants.push(ev);
        else if (k === "animal") out.animals.push(ev);
        else if (k === "hive") out.hives.push(ev);
        else if (k === "barrel") out.barrels.push(ev);
      }
      this._cache = out;
      return out;
    },

    isFriend(profile) {
      let best = Number(profile?.playerOpinion ?? 0) || 0;
      const ops = profile?.opinions;
      if (ops) for (const k of Object.keys(ops)) best = Math.max(best, Number(ops[k]) || 0);
      return best >= this.FRIEND_OPINION;
    },

    specTier(profile, specName) {
      const spec = Specs.table()?.byName?.get?.(specName);
      return spec ? (profile?.specLevels?.[spec.id] || 0) : 0;
    },

    isKeen(profile, kind) {
      if (kind === "barrel") return BREW_SPECS.some(s => this.specTier(profile, s) >= this.KEEN_TIER);
      if (InteractionScanner.hasFarmingTrait(profile)) return true;
      const specs = kind === "plant" ? ["Gardening", "Farming"] : kind === "hive" ? [BEEKEEPING] : ["Animal Husbandry"]; // i18n-ignore: spec ids
      return specs.some(s => this.specTier(profile, s) >= this.KEEN_TIER);
    },

    livesOn(profile, mapId) {
      if (!profile || !mapId) return false;
      return profile.homeBuilding?.mapId === mapId || profile.homeMapId === mapId;
    },

    // A job whose trade or work spots name one of `trades` / `words`, on shift
    // on its work map.
    _onShiftIn(name, profile, mapId, trades, words) {
      const job = JobManager.getJob(profile);
      if (!job) return false;
      const spots = (Array.isArray(job.workSpots) ? job.workSpots : []).map(w => String(w).toLowerCase());
      if (!trades.includes(job.spec) && !spots.some(w => words.includes(w))) return false;
      if (profile.workMapId && profile.workMapId !== mapId) return false;
      return !!NPCSim.isOnShift(name, profile);
    },

    // A farm trade on shift, on its work map.
    onFarmShift(name, profile, mapId) {
      return this._onShiftIn(name, profile, mapId, TENDING_TRADES, TENDING_SPOT_WORDS);
    },

    // A brewer, a distiller or a bartender on shift, on its work map.
    onBrewShift(name, profile, mapId) {
      return this._onShiftIn(name, profile, mapId, BREW_TRADES, BREW_SPOT_WORDS);
    },

    // What brings this person to the plot: "work", "home", "leisure" or null.
    // A barrel with no named owner is the household's it stands in.
    roleFor(name, profile, mapId, kind, owner) {
      if (kind === "barrel" ? this.onBrewShift(name, profile, mapId) : this.onFarmShift(name, profile, mapId)) return "work";
      if (kind === "plant" ? this.livesOn(profile, mapId) : (owner && owner === name)) return "home";
      if (kind === "barrel" && !owner && this.livesOn(profile, mapId)) return "home";
      if (this.isKeen(profile, kind)) return "leisure";
      return null;
    },

    // Hands a crop or a batch of produce to `who`'s bag, falling back to the
    // tender's when the owner has no profile to hold it.
    _give(who, fallback, itemId, qty) {
      const soc = $gameSystem?._npcSociety || {};
      const profile = (who && soc[who]) || soc[fallback];
      if (!profile || !$dataItems?.[itemId]) return null;
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      const n = Math.max(1, Math.min(this.MAX_QTY, Math.floor(qty) || 1));
      for (let i = 0; i < n; i++) profile.itemIds.push(itemId);
      window.NPCShared?.capItemIds?.(profile);
      return (who && soc[who]) ? who : fallback;
    },

    _friendThought(profile, key, params) {
      if (!T.has || T.has(key)) ThoughtGenerator._push(profile, T(key, params));
    },

    // A bubble for a moment at a hive or a barrel (NPCConversation
    // CareThoughts): the first of `moments` that has a line, else the NPCSim
    // line under `fallbackKey`. Answers the line, or null.
    _say(profile, moments, params, fallbackKey) {
      const CT = window.NPCConversation?.CareThoughts;
      for (const m of moments) {
        const line = CT?.line?.(profile, m, params);
        if (line) {
          ThoughtGenerator._push(profile, line);
          return line;
        }
      }
      if (fallbackKey && (!T.has || T.has(fallbackKey))) {
        const line = T(fallbackKey, params);
        ThoughtGenerator._push(profile, line);
        return line;
      }
      return null;
    },

    _foodIndex(profile) {
      const ids = profile?.itemIds;
      if (!Array.isArray(ids)) return -1;
      const Diet = window.NPCShared?.Diet;
      return ids.findIndex(id => Diet ? Diet.isFood($dataItems?.[id]) : false);
    },

    // Where the feed comes from, or null when there is none to hand.
    _feedFrom(name, profile, owner, role, party) {
      const mine = this._foodIndex(profile);
      if (mine >= 0) return () => profile.itemIds.splice(mine, 1);
      if (party) return null;
      const ownerProfile = owner && owner !== name ? $gameSystem?._npcSociety?.[owner] : null;
      if (ownerProfile && role === "work") {
        const theirs = this._foodIndex(ownerProfile);
        if (theirs >= 0) return () => ownerProfile.itemIds.splice(theirs, 1);
      }
      // The farm's own fodder: a worker on shift, or the owner at home.
      if (role === "work" || role === "home") return () => {};
      return null;
    },

    _now() {
      return $gameVariables?.value(114) ?? 0;
    },

    // Care when nobody is watching (NPCLife_Animals): an NPC's own stock on a
    // map that is not loaded is looked after by its owner at home, by the
    // rules a tend on the map follows. The owner kept it fed since `since`
    // (the last pass), so what it produced over that span is collected into
    // the owner's bag, then it is fed off the farm's own fodder once it is
    // under FEED_BELOW. The party's stock and a farm whose owner is gone are
    // never touched. Answers { fed, items, owner } or null.
    careOffscreen(rec, since) {
      const A = window.AnimalGrowthSystem;
      const def = rec ? A?.ANIMAL_DB?.[rec.animalId] : null;
      if (!def || !A.isPartyOwned || A.isPartyOwned(rec)) return null;
      const owner = A.ownerOf(rec);
      const ownerProfile = owner ? $gameSystem?._npcSociety?.[owner] : null;
      if (!ownerProfile || ownerProfile._killed) return null;
      A.updateRecordGrowth?.(rec);
      const items = [];
      const now = this._now();
      const got = (A.collectProduceOver && Number.isFinite(since))
        ? A.collectProduceOver(rec, def, since, now) : A.collectProduceFor(rec, def);
      for (const r of got) {
        const to = this._give(owner, owner, r.itemId, r.qty);
        if (to) items.push({ itemId: r.itemId, qty: r.qty, to });
      }
      const fed = A.nutritionOf(rec) < this.FEED_BELOW ? !!A.feedAnimal(rec) : false;
      return { fed, items, owner };
    },

    _throttled(profile, now) {
      const last = profile._lastTendMin;
      return last != null && last <= now && now - last < this.THROTTLE_MIN;
    },

    // The one entry point: `name` is at `ev` (arrived, or working beside it).
    // Answers what was done, or null.
    tend(name, profile, ev) {
      if (!profile || !ev || !$gameMap) return null;
      if (window.NPCCreature?.isNonSentientProfile?.(profile)) return null;
      const kind = this.kindOf(ev);
      if (!kind) return null;
      const now = this._now();
      if (this._throttled(profile, now)) return null;
      const mapId = $gameMap.mapId();
      const minor = Children.isMinor(profile, name);
      let out = null;
      try {
        if (kind === "plant") out = this._tendPlant(name, profile, ev, mapId, minor);
        else if (kind === "animal") out = this._tendAnimal(name, profile, ev, mapId, minor);
        else if (kind === "hive") out = this._tendHive(name, profile, ev, mapId, minor, now);
        else out = this._tendBarrel(name, profile, ev, mapId, minor, now);
      } catch (e) {
        console.error("[NPCSim] tending failed:", e);
        return null;
      }
      if (!out) return null;
      profile._lastTendMin = now;
      // The town's farm work is what the agriculture listing prices.
      try { window.StockSociety?.note?.("harvest", Math.max(1, Number(out.qty) || 1)); } catch (e) { /* no market */ }
      // A shift's hours are already the shift's (npc:work_tick writes them).
      if (out.role !== "work") {
        RoutineManager.record(profile, RoutineManager.hourNow(), ROUTINE_LABEL[kind], "farm", mapId); // i18n-ignore: override kind id
      }
      return out;
    },

    _tendPlant(name, profile, ev, mapId, minor) {
      const P = window.PlantGrowthSystem;
      if (!P?.waterPlot) return null;
      const evId = ev.eventId();
      P.updateGrowth(mapId, evId);
      const rec = P.getRecord(mapId, evId);
      if (!rec || rec.removed || !rec.plantId) return null;
      const def = P.PLANT_DB?.[rec.plantId];
      const plant = $dataItems?.[def?.itemId]?.name || rec.plantId;
      if (P.isPartyOwned(rec)) {
        if (!this.isFriend(profile) || !P.waterPlot(mapId, evId, name)) return null;
        this._friendThought(profile, "NPCSim.tend.waterFriend", { plant });
        StoryLogger.record(name, "farm", "NPCSim.log.wateredParty", { plant });
        Specs.practice(profile, name, "Gardening", 1); // i18n-ignore: spec id
        return { kind: "plant", action: "water", party: true, role: null };
      }
      let owner = P.ownerOf(rec);
      // A procedural field is the farm's, and the farm has a farmer.
      if (!owner && mapId === 636) owner = window.AnimalGrowthSystem?.ensureFarmOwner?.() || null;
      const role = this.roleFor(name, profile, mapId, "plant", owner);
      if (!role) return null;
      const spec = role === "work" ? "Farming" : "Gardening"; // i18n-ignore: spec ids
      if (!minor && P.isRipe(rec)) {
        const crop = P.harvestPlotFor(mapId, evId);
        if (!crop) return null;
        const to = this._give(owner, name, crop.itemId, crop.qty);
        const item = $dataItems?.[crop.itemId]?.name || plant;
        if (to && to !== name) StoryLogger.record(name, "farm", "NPCSim.log.harvestedFor", { item, qty: crop.qty, owner: to });
        else StoryLogger.record(name, "farm", "NPCSim.log.harvestedCrop", { item, qty: crop.qty });
        Specs.practice(profile, name, spec, 2);
        return { kind: "plant", action: "harvest", to, itemId: crop.itemId, qty: crop.qty, role };
      }
      if (!P.waterPlot(mapId, evId, name)) return null;
      Specs.practice(profile, name, spec, 1);
      return { kind: "plant", action: "water", role };
    },

    _tendAnimal(name, profile, ev, mapId, minor) {
      const A = window.AnimalGrowthSystem;
      if (!A?.livestockBehind) return null;
      const rec = A.livestockBehind(ev);
      const def = rec ? A.ANIMAL_DB?.[rec.animalId] : null;
      if (!def) return null;
      A.updateRecordGrowth?.(rec);
      const party = A.isPartyOwned(rec);
      const owner = party ? null : (A.ownerOf(rec) || null);
      if (party && !this.isFriend(profile)) return null;
      const role = party ? null : this.roleFor(name, profile, mapId, "animal", owner);
      if (!party && !role) return null;
      let fed = false;
      if (A.nutritionOf(rec) < this.FEED_BELOW) {
        const take = this._feedFrom(name, profile, owner, role, party);
        if (take && A.feedAnimal(rec)) { take(); fed = true; }
      }
      const got = [];
      if (!party && !minor) {
        for (const r of A.collectProduceFor(rec, def)) {
          const to = this._give(owner, name, r.itemId, r.qty);
          if (!to) continue;
          got.push({ itemId: r.itemId, qty: r.qty, to });
          const item = $dataItems?.[r.itemId]?.name || "";
          if (to !== name) StoryLogger.record(name, "farm", "NPCSim.log.collectedFor", { item, qty: r.qty, owner: to });
          else StoryLogger.record(name, "farm", "NPCSim.log.collected", { item, qty: r.qty });
        }
      }
      if (!fed && !got.length) return null;
      if (party) {
        this._friendThought(profile, "NPCSim.tend.feedFriend", { animal: rec.animalId });
        StoryLogger.record(name, "farm", "NPCSim.log.fedParty", { animal: rec.animalId });
      }
      Specs.practice(profile, name, "Animal Husbandry", (fed ? 1 : 0) + (got.length ? 2 : 0)); // i18n-ignore: spec id
      return { kind: "animal", action: got.length ? "collect" : "feed", fed, items: got, party, role };
    },

    // ---- Hives (ApiarySystem) -----------------------------------------------
    // The colony behind a hive event: a townsperson's own, or the party's.
    _colonyAt(mapId, ev) {
      const AS = window.ApiarySystem;
      if (AS?.hiveAt) return AS.hiveAt(mapId, ev.eventId());
      return $gameSystem?.apiaryComplex || null;
    },

    _isPartyHive(colony) {
      const AS = window.ApiarySystem;
      return AS?.isPartyHive ? AS.isPartyHive(colony) : !colony?.owner;
    },

    _unattended(last, now) {
      return last != null && now - last >= this.UNATTENDED_MIN;
    },

    _recentlyMinded(last, now) {
      return last != null && last <= now && now - last < this.CARE_GAP_MIN;
    },

    _hiveLast(colony) {
      return typeof colony?.lastTendedOf === "function" ? colony.lastTendedOf() : null;
    },

    // What a hive calls for from somebody minding it, off its own inspection.
    _hiveNeeds(colony) {
      const look = typeof colony?.inspectHive === "function" ? colony.inspectHive() : null;
      if (!look) return { any: false };
      const water = look.water < this.HIVE_WATER_BELOW;
      const treat = look.treatable.length > 0;
      return { look, water, treat, feed: look.needsFeed, super: look.needsSuper, any: water || treat || look.needsFeed };
    },

    // The party's hive is minded only by a friend, who never takes from it;
    // a townsperson's by its owner, somebody working for them (who take the
    // crop off for the owner) or a keen keeper (who only minds it).
    _tendHive(name, profile, ev, mapId, minor, now) {
      const colony = this._colonyAt(mapId, ev);
      if (!colony || typeof colony.waterHive !== "function") return null;
      const party = this._isPartyHive(colony);
      const owner = party ? null : (colony.owner || null);
      let role = null;
      if (party) {
        if (!this.isFriend(profile)) return null;
      } else {
        role = this.roleFor(name, profile, mapId, "hive", owner);
        if (!role) return null;
      }
      const unattended = this._unattended(this._hiveLast(colony), now);
      if (!party && typeof colony.catchUp === "function") colony.catchUp();
      const keeper = !party && !minor && (role === "work" || role === "home");
      const needs = this._hiveNeeds(colony);
      const done = [];
      let treated = [];
      if (colony.waterHive()) done.push("water");
      if (needs.treat && typeof colony.treatHive === "function") {
        treated = colony.treatHive();
        if (treated.length) done.push("treat");
      }
      if (needs.feed && typeof colony.feedHive === "function") {
        const take = this._feedFrom(name, profile, owner, role, party);
        if (take && colony.feedHive()) { take(); done.push("feed"); }
      }
      if (!party && needs.super && typeof colony.addSuper === "function" && colony.addSuper()) done.push("super");
      let honey = null;
      const stores = Number(colony.colony?.resources?.honey) || 0;
      if (keeper && stores >= this.HARVEST_HONEY_AT && typeof colony.harvestFor === "function") {
        const got = colony.harvestFor();
        const to = got ? this._give(owner, name, got.itemId, got.jars) : null;
        if (to) honey = { itemId: got.itemId, qty: Math.min(this.MAX_QTY, got.jars), wax: got.wax, to };
      }
      if (!done.length && !honey && !unattended) return null;
      colony.markTended?.(now);

      const item = honey ? ($dataItems?.[honey.itemId]?.name || "") : "";
      if (party) StoryLogger.record(name, "farm", done.length === 1 && done[0] === "water" ? "NPCSim.log.wateredHive" : "NPCSim.log.hiveCaredParty", {});
      else if (treated.length) StoryLogger.record(name, "farm", "NPCSim.log.hiveTreated", { threats: treated.join(", ") });
      else if (done.length || !honey) StoryLogger.record(name, "farm", "NPCSim.log.hiveCared", {});
      if (honey) {
        if (honey.to !== name) StoryLogger.record(name, "farm", "NPCSim.log.honeyTakenFor", { item, qty: honey.qty, owner: honey.to });
        else StoryLogger.record(name, "farm", "NPCSim.log.honeyTaken", { item, qty: honey.qty });
      }
      const moments = [];
      if (unattended) moments.push("unattendedHive");
      if (party) moments.push("friendHive");
      else if (honey) moments.push("honeyHarvest");
      else if (treated.length) moments.push("hiveTreat");
      else if (done.includes("super")) moments.push("hiveSuper");
      moments.push("hiveTend");
      this._say(profile, moments, honey && honey.to !== name ? { owner: honey.to } : {}, party ? "NPCSim.tend.hiveFriend" : null);
      Specs.practice(profile, name, BEEKEEPING, 1 + (honey ? 2 : 0));
      return {
        kind: "hive", action: honey ? "harvest" : (done[0] || "inspect"), done, treated, honey,
        unattended, party, role, owner,
      };
    },

    // ---- Barrels (BrewingSystem) --------------------------------------------
    // A recipe for an empty barrel, the same for the same barrel and minute.
    _pickRecipe(list, mapId, evId, now) {
      const hash = NPCSim._internal.nameHash;
      const h = typeof hash === "function" ? (hash(`${mapId}_${evId}_${now}`) >>> 0) : (mapId * 31 + evId + now);
      return list[h % list.length];
    },

    // An alcoholic bottling a brew may help themselves to one bottle, never
    // the last, at most every SIP_EVERY_MIN, once the craving is biting.
    _tempted(name, profile, recipe, items, now) {
      const B = window.BrewingSystem;
      if (!Addictions || !B?.isAlcoholic?.(recipe)) return false;
      if (!Addictions.keysFor(profile, name).includes(ALCOHOL)) return false;
      Addictions.state(profile, name, now);
      const want = Addictions.craving(profile, ALCOHOL);
      if (want == null || want < Addictions.CRAVE_BUY_AT) return false;
      if (profile._lastSipMin != null && profile._lastSipMin <= now && now - profile._lastSipMin < this.SIP_EVERY_MIN) return false;
      const spare = items.find(i => i.qty >= 2);
      if (!spare) return false;
      spare.qty -= 1;
      Addictions.relieve(profile, ALCOHOL, this.SIP_RELIEF);
      profile._lastSipMin = now;
      return true;
    },

    // A barrel is minded (checked, stirred, topped up) by anybody with a
    // reason to be at it; bottled and restarted only by its owner, the
    // household it stands in or somebody working the barrels there. The
    // party's barrels: a friend minds them and nothing more.
    _tendBarrel(name, profile, ev, mapId, minor, now) {
      const B = window.BrewingSystem;
      if (minor || !B?.tendBarrel) return null;
      const list = B.recipes?.();
      if (!list || !list.length) {
        try { B.loadRecipes?.()?.catch?.(() => {}); } catch (_) { /* no recipe book yet */ }
        return null;
      }
      const evId = ev.eventId();
      const rec = B.ensureBarrel(mapId, evId);
      const party = !!rec && B.isPartyBarrel(rec);
      const owner = party ? null : (B.ownerOf(rec) || null);
      let role = null;
      if (party) {
        if (!this.isFriend(profile)) return null;
      } else {
        role = this.roleFor(name, profile, mapId, "barrel", owner);
        if (!role) return null;
      }
      const keeper = !party && (role === "work" || role === "home");
      const spec = (rec && B.recipeOf(rec)?.spec) || "Brewing"; // i18n-ignore: spec id

      if (!rec) {
        if (!keeper) return null;
        return this._startBarrel(name, profile, mapId, evId, role, null, list, now);
      }
      const recipe = B.recipeOf(rec);
      const brew = B.recipeName(recipe);
      const state = B.state(rec, now);
      if (!state) return null;
      const unattended = B.isUnattended(rec, now);

      if (state.stage === READY && keeper) {
        const out = B.bottleBarrelFor(mapId, evId, now);
        if (!out) return null;
        const sipped = this._tempted(name, profile, out.recipe, out.items, now);
        const given = [];
        for (const it of out.items) {
          if (it.qty <= 0) continue;
          const to = this._give(owner, name, it.itemId, it.qty);
          if (!to) continue;
          given.push({ itemId: it.itemId, qty: Math.min(this.MAX_QTY, it.qty), to });
          const item = $dataItems?.[it.itemId]?.name || brew;
          if (to !== name) StoryLogger.record(name, "farm", "NPCSim.log.barrelBottledFor", { item, qty: it.qty, owner: to });
          else StoryLogger.record(name, "farm", "NPCSim.log.barrelBottled", { item, qty: it.qty });
        }
        if (sipped) StoryLogger.record(name, "addiction", "NPCSim.log.sippedBrew", { brew });
        const to = given.find(g => g.to !== name)?.to;
        const moments = [];
        if (sipped) moments.push("tempted");
        if (unattended) moments.push("unattendedBarrel");
        moments.push("barrelBottle");
        this._say(profile, moments, to ? { owner: to, brew } : { brew });
        Specs.practice(profile, name, spec, 2);
        // The emptied barrel is set going again for the same owner.
        const again = this._startBarrel(name, profile, mapId, evId, role, owner, list, now, true);
        return {
          kind: "barrel", action: "bottle", items: given, sipped, restarted: !!again,
          unattended, party, role, owner,
        };
      }

      // Nothing to do at a barrel somebody minded a moment ago, unless it
      // has been left.
      if (!unattended && this._recentlyMinded(B.lastTendedOf(rec), now)) return null;
      const action = state.stage === READY ? "check" : state.stage === PRIMARY ? "stir" : "topUp";
      const r = B.tendBarrel(mapId, evId, action, now);
      if (!r) return null;
      const tasted = keeper && state.stage === CONDITIONING;
      StoryLogger.record(name, "farm", party ? "NPCSim.log.barrelCaredParty" : "NPCSim.log.barrelCared", { brew });
      const moments = [];
      if (unattended) moments.push("unattendedBarrel");
      if (party) moments.push("friendBarrel");
      else if (tasted) moments.push("taste");
      moments.push(action === "check" ? "barrelCheck" : "barrelCare", "barrelCheck");
      this._say(profile, moments, { brew }, party ? "NPCSim.tend.barrelFriend" : null);
      Specs.practice(profile, name, spec, 1);
      return { kind: "barrel", action, cared: r.cared, tasted, unattended, party, role, owner };
    },

    // Sets a brew going in an empty barrel: the owner's, the household's for
    // somebody at home, the house's for somebody at work.
    _startBarrel(name, profile, mapId, evId, role, owner, list, now, quiet) {
      const B = window.BrewingSystem;
      const recipe = this._pickRecipe(list, mapId, evId, now);
      const forWhom = owner || (role === "home" ? name : null);
      const rec = B.startBarrelFor(mapId, evId, recipe.id, forWhom, now);
      if (!rec) return null;
      const brew = B.recipeName(recipe);
      StoryLogger.record(name, "farm", "NPCSim.log.barrelStarted", { brew });
      if (quiet) return rec;
      this._say(profile, ["barrelStart"], { brew });
      Specs.practice(profile, name, recipe.spec || "Brewing", 1); // i18n-ignore: spec id
      return { kind: "barrel", action: "start", recipeId: recipe.id, party: false, role, owner: forWhom };
    },

    // ---- Who wants to walk where --------------------------------------------
    // How much a plot, pen, hive or barrel wants this person right now:
    // 0 nothing, 1 something to do, 2 it has been left unattended.
    _urgency(name, profile, ev, mapId, minor, now) {
      const kind = this.kindOf(ev);
      if (kind === "plant") {
        const P = window.PlantGrowthSystem;
        const rec = P?.getRecord?.(mapId, ev.eventId());
        if (!rec || rec.removed || !rec.plantId) return 0;
        if (P.isPartyOwned(rec)) return this.isFriend(profile) && !P.wateredToday(rec) ? 1 : 0;
        if (!this.roleFor(name, profile, mapId, "plant", P.ownerOf(rec))) return 0;
        return !P.wateredToday(rec) || (!minor && P.isRipe(rec)) ? 1 : 0;
      }
      if (kind === "animal") {
        const A = window.AnimalGrowthSystem;
        const rec = A?.livestockBehind?.(ev);
        const def = rec ? A.ANIMAL_DB?.[rec.animalId] : null;
        if (!def) return 0;
        const hungry = A.nutritionOf(rec) < this.FEED_BELOW;
        if (A.isPartyOwned(rec)) return this.isFriend(profile) && hungry && this._foodIndex(profile) >= 0 ? 1 : 0;
        if (!this.roleFor(name, profile, mapId, "animal", A.ownerOf(rec))) return 0;
        return hungry || (!minor && A.hasReadyProduce(rec, def)) ? 1 : 0;
      }
      if (kind === "hive") return this._hiveUrgency(name, profile, ev, mapId, minor, now);
      if (kind === "barrel") return this._barrelUrgency(name, profile, ev, mapId, minor, now);
      return 0;
    },

    _hiveUrgency(name, profile, ev, mapId, minor, now) {
      const colony = this._colonyAt(mapId, ev);
      if (!colony || typeof colony.waterHive !== "function") return 0;
      const party = this._isPartyHive(colony);
      let keeper = false;
      if (party) {
        if (!this.isFriend(profile)) return 0;
      } else {
        const role = this.roleFor(name, profile, mapId, "hive", colony.owner || null);
        if (!role) return 0;
        keeper = !minor && (role === "work" || role === "home");
      }
      const last = this._hiveLast(colony);
      if (this._unattended(last, now)) return 2;
      if (this._recentlyMinded(last, now)) return 0;
      const res = colony.colony?.resources || {};
      const threats = colony.colony?.environment?.threats || [];
      const treatable = window.ApiarySystem?.TREATABLE || [];
      if ((Number(res.water) || 0) < this.HIVE_WATER_BELOW) return 1;
      if ((Number(res.honey) || 0) < (window.ApiarySystem?.FEED_BELOW ?? 60)) return 1;
      if (threats.some(t => treatable.includes(t))) return 1;
      if (keeper && (Number(res.honey) || 0) >= this.HARVEST_HONEY_AT) return 1;
      return 0;
    },

    _barrelUrgency(name, profile, ev, mapId, minor, now) {
      const B = window.BrewingSystem;
      if (minor || !B?.barrelAt || !B.recipes?.()) return 0;
      const rec = B.barrelAt(mapId, ev.eventId());
      const party = !!rec && B.isPartyBarrel(rec);
      let keeper = false;
      if (party) {
        if (!this.isFriend(profile)) return 0;
      } else {
        const role = this.roleFor(name, profile, mapId, "barrel", B.ownerOf(rec) || null);
        if (!role) return 0;
        keeper = role === "work" || role === "home";
      }
      // Never looked into: a keeper finds out what is in it (or fills it).
      if (!rec) return keeper ? 1 : 0;
      if (B.isUnattended(rec, now)) return 2;
      if (keeper && B.state(rec, now)?.stage === READY) return 1;
      return 0;
    },

    _nearestWanted(name, profile, list, from, mapId, lastId) {
      const now = this._now();
      const minor = Children.isMinor(profile, name);
      let best = null, bestU = 0, bestD = Infinity;
      for (const ev of list) {
        if (!ev || ev._erased || (lastId != null && ev.eventId?.() === lastId)) continue;
        const d = Math.abs(ev.x - from.x) + Math.abs(ev.y - from.y);
        let u = 0;
        try { u = this._urgency(name, profile, ev, mapId, minor, now); } catch (_) { continue; }
        if (!u || u < bestU || (u === bestU && d >= bestD)) continue;
        best = ev;
        bestU = u;
        bestD = d;
      }
      return best;
    },

    // A plot, pen, hive or barrel worth walking to in a free hour: one left
    // unattended first, then the nearest that needs this person; null when
    // nothing on this map does.
    leisureTarget(controller, profile) {
      const name = controller?.eventName;
      const from = controller?.event;
      if (!name || !profile || !from || !$gameMap) return null;
      if (window.NPCCreature?.isNonSentientProfile?.(profile)) return null;
      if (this._throttled(profile, this._now())) return null;
      const t = this.targets();
      if (!t.plants.length && !t.animals.length && !t.hives.length && !t.barrels.length) return null;
      return this._nearestWanted(name, profile, t.plants.concat(t.animals, t.hives, t.barrels), from, $gameMap.mapId(), null);
    },

    // The hive or barrel a beekeeper, farm hand or brewer on shift goes to
    // next (NPCSim.nextWorkSpot): one left unattended first, else one that
    // needs them. Null leaves them to the job's ordinary spots.
    workTarget(name, profile, fromEvent, lastId) {
      if (!name || !profile || !fromEvent || !$gameMap) return null;
      if (window.NPCCreature?.isNonSentientProfile?.(profile)) return null;
      if (this._throttled(profile, this._now())) return null;
      const t = this.targets();
      if (!t.hives.length && !t.barrels.length) return null;
      const mapId = $gameMap.mapId();
      let list = [];
      if (t.hives.length && this.onFarmShift(name, profile, mapId)) list = list.concat(t.hives);
      if (t.barrels.length && this.onBrewShift(name, profile, mapId)) list = list.concat(t.barrels);
      if (!list.length) return null;
      return this._nearestWanted(name, profile, list, fromEvent, mapId, lastId);
    },
  };

  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    if (!targetEvent || !Tending.kindOf(targetEvent)) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (profile) Tending.tend(name, profile, targetEvent);
  });

  // A farm hand's shift at a plot, a pen or a hive, and a brewer's at a
  // barrel, is spent tending it.
  EventBus.on("npc:work_tick", ({ name, mapId, eventId }) => {
    if (!eventId || !$gameMap || (mapId && mapId !== $gameMap.mapId())) return;
    const ev = $gameMap.event(eventId);
    if (!ev || ev._erased || !Tending.kindOf(ev)) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (profile) Tending.tend(name, profile, ev);
  });

  Object.assign(NPCSim._internal, {
    Tending,
  });
})();
