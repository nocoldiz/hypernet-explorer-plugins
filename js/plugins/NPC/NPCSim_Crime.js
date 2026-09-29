/*:
 * @target MZ
 * @plugindesc NPC Simulation: petty crime and meals bought at shops
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Tending
 * @help
 * ============================================================================
 * NPCSim_Crime, part of the NPCSimulationCore family
 * ============================================================================
 * Owns CrimeManager (SECTION 8) and the meal shopping (SECTION 9). Kept apart
 * from NPCSim_Economy.js so the npc:interact listeners register in their
 * original order (meal, service, games, purchases, capabilities).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Tending.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    economyRng, EventBus, fmtMoney, NeedManager,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Addictions, BuyManager, Gear, JobManager, StoryLogger, ThoughtGenerator;
  NPCSim._internal._late.push(() => ({
    Addictions, BuyManager, Gear, JobManager, StoryLogger, ThoughtGenerator,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 8, CRIME MANAGER
  // ============================================================================

  // How far gone the ground under the party's feet is under the Goblin Horde
  // (window.HordeGround.chaos, 0..1), asked at most once per map per game hour
  // however many people are deciding what to do.
  const _hordeHere = { key: null, v: 0 };
  function hordeChaosHere() {
    const HG = window.HordeGround;
    if (!HG?.chaos || !$gameMap) return 0;
    const key = $gameMap.mapId() + ":" + Math.floor(($gameVariables?.value(114) || 0) / 60);
    if (_hordeHere.key !== key) {
      _hordeHere.key = key;
      try { _hordeHere.v = Math.max(0, Math.min(1, Number(HG.chaos()) || 0)); } catch (_) { _hordeHere.v = 0; }
    }
    return _hordeHere.v;
  }

  const CrimeManager = {
    // Steal chance for an item, normalized to 0..1 (StealCalculator returns
    // a 5..95 percentage), scaled by the settlement's civic state.
    _stealChance(profile, itemData) {
      const agility = (profile.skillIds?.length || 0) * 5;
      let chance = 0.3;
      try { chance = window.StealCalculator.calculateStealChance(itemData, agility) / 100; } catch (_) {}
      // Crackdowns make theft harder, neglected towns easier (world web).
      chance *= window.NPCWorldWeb?.theftSuccessModifier?.(profile._homeGroupName) ?? 1;
      return chance;
    },

    // Items reachable through a specific event, shop goods when it carries
    // shop commands (passing the event's own coords so daily-shop proximity
    // gating always resolves), seeded pocket litter otherwise (the same
    // fallback the player pickpocket flow uses).
    stealableItems(targetEvent) {
      if (!window.ShopScanner || !targetEvent) return [];
      let items = [];
      try { items = window.ShopScanner.extractShopItems(targetEvent, targetEvent.x, targetEvent.y) || []; } catch (_) {}
      if (!items.length) {
        try { items = window.ShopScanner.generateNPCItems(targetEvent) || []; } catch (_) {}
      }
      return items.filter(i => i?.data);
    },

    // What an NPC would go for at this Steal spot, used for "I want to
    // steal X" intent thoughts before they've even walked over.
    peekStealItem(targetEvent) {
      return this.stealableItems(targetEvent)[0] ?? null;
    },

    // Shared outcome bookkeeping. Success pockets the item; getting caught
    // goes on the NPC's *own* criminal record and bounty (NPCLifeSim),
    // never the player's crime sheet (Variable 66), which an earlier
    // version wrongly raised here.
    _resolveTheft(name, profile, item, chance) {
      // A beast steals nothing and is charged with nothing: it holds no
      // possessions and no money (NPCCreature.mayHoldMoney).
      if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;
      const itemName = item.data?.name || T('NPCSim.anItem');
      // Seeded roll: the outcome mutates persisted profile.itemIds, so it must
      // be reproducible from the world seed, not raw Math.random().
      const rng = economyRng(name, "theft_" + (item.id ?? 0));
      if (rng.next() < chance) {
        BuyManager.take(profile, item);
        StoryLogger.record(name, "theft_success", 'NPCSim.log.stole', { item: itemName });
        profile.moralityScore = Math.max(-100, (profile.moralityScore || 0) - 2);
        _emitCrimeThought(profile, "success", itemName);
      } else {
        profile.moralityScore = Math.max(-100, (profile.moralityScore || 0) - 5);
        StoryLogger.record(name, "theft_caught", 'NPCSim.log.caughtStealing', { item: itemName });
        _emitCrimeThought(profile, "caught", itemName);
        const minute = $gameVariables ? $gameVariables.value(114) : 0;
        try { window.NPCLifeSim?.addLiveCrime?.(name, "shoplifting", minute); } catch (_) {}

        // Caught crime → faction loses reputation
        if (profile.factionIndex >= 0 && $gameFactions?.changeReputation) {
          try { $gameFactions.changeReputation(profile.factionIndex, -2); } catch (_) {}
        }
      }
    },

    // Abstract on-the-spot shoplifting against whatever the map's shops
    // carry, used when there's no walkable "Steal" event to case.
    attemptTheft(controller, profile) {
      if (!window.ShopScanner || !window.StealCalculator) return;
      if (window.NPCCreature?.mayHoldMoney?.(profile, controller?.eventName) === false) return;
      let goods = [];
      try { goods = window.ShopScanner.scanMapForShops() || []; } catch (_) {}
      const items = goods.filter(i => i?.data && i.data.price > 0 && i.data.price < 500);
      if (!items.length) return;

      const item = items[Math.floor(Math.random() * items.length)];
      this._resolveTheft(controller.eventName, profile, item, this._stealChance(profile, item.data));
    },

    // Resolves an NPC's theft attempt against the "Steal" event they walked
    // up to (dispatched from the SECTION 9b interact handler).
    attemptTheftFromEvent(name, profile, targetEvent) {
      if (!window.StealCalculator) return;
      const items = this.stealableItems(targetEvent);
      if (!items.length) return;
      const item = items[Math.floor(Math.random() * items.length)];
      this._resolveTheft(name, profile, item, this._stealChance(profile, item.data));
    },
  };

  // Pushes a crime-flavored thought ("I want that X" / "stole X" / "caught")
  // through the same pipeline as every other NPC thought.
  // A beast thinks nothing anybody could write down about a till or a theft:
  // no prose thought is pushed for it here (NPCSim.ThoughtGenerator.generate
  // is the only way one thinks, and only when spoken to).
  function _beastIsSilent(profile) {
    return !!window.NPCCreature?.isHeldToBeastRules?.(profile, profile?._eventName);
  }

  function _emitCrimeThought(profile, kind, itemName) {
    if (!profile || _beastIsSilent(profile)) return;
    const t = window.NPCConversation?.ThoughtProvider?.crimeThought?.(profile, kind, itemName);
    if (t) ThoughtGenerator._push(profile, t);
  }

  // Pushes a personality-flavored opinion about a shop item through the same
  // bubble pipeline. kind: 'buy' (just purchased) | 'browse' (eyeing it).
  function _emitItemThought(profile, itemData, kind) {
    if (!profile || !itemData || _beastIsSilent(profile)) return;
    const t = window.NPCConversation?.ThoughtProvider?.itemThought?.(profile, itemData, kind);
    if (t) ThoughtGenerator._push(profile, t);
  }

  // ============================================================================
  // SECTION 9, SHOPPING (hunger fulfillment via shops)
  // ============================================================================

  EventBus.on("npc:interact", ({ name, targetEvent, reason }) => {
    // Only a hungry visit is a meal. Somebody at a vending machine or a
    // counter for the fun of it, to shop or to be served no longer pays for
    // a snack every time (SECTION 9b buys what they came for).
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    if ((reason ?? profile.currentNeed) !== "hunger") return;
    // A beast pays for no meal: it holds no euros (NPCCreature.mayHoldMoney).
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;
    const evData = targetEvent?.event();
    const evName = (evData?.name || "").toLowerCase();
    // Shops are matched by the <Shop> note tag, not the event name.
    if (!evName.includes("vending") && !window.NPCSystem?.hasShopTag?.(evData?.note || "")) return;

    // Simulate buying the cheapest food item this person's diet allows
    // (NPCShared.Diet), then one to carry if their hand is running empty.
    const Diet = window.NPCShared?.Diet;
    const foodItems = ($dataItems || []).filter(i => i && /<Category:\s*Food>/i.test(i.note || "") &&
      (i.price || 0) > 0 && (!Diet || Diet.allows(profile, i)) && Addictions.allows(profile, i, name));
    if (!foodItems.length) return;
    Gear.restock(profile, name);
    foodItems.sort((a, b) => a.price - b.price);
    const cheap = foodItems[0];
    if (profile.money >= cheap.price) {
      profile.money -= cheap.price;
      const cal = parseInt((cheap.note || "").match(/<calories:\s*(\d+)>/i)?.[1] || "20");
      NeedManager.feed(profile, cal);
      StoryLogger.record(name, "shopping", 'NPCSim.log.bought', { item: cheap.name, price: fmtMoney(cheap.price) });
    }
  });

  // A worker seen on the map is paid when their shift ends: whatever of that
  // shift is still owed (JobManager.payHours keeps the hours already paid,
  // so an off-screen stretch of the same shift is never paid again).
  EventBus.on("npc:shift_end", ({ name, shiftKey }) => {
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    const key = shiftKey ?? JobManager.lastShiftKey(profile);
    JobManager.settleShift(profile, name, key);
    if (profile._shiftOpenKey === key) profile._shiftOpenKey = null;
  });

  Object.assign(NPCSim._internal, {
    _emitCrimeThought, _emitItemThought, CrimeManager, hordeChaosHere,
  });
})();
